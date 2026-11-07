-- Notas migradas sem empenho. O sistema anterior aceitava nota sem empenho; ao migrar, essas notas entram
-- com o empenho vazio para serem completadas depois (vincular_empenho_nota). Nota NOVA continua exigindo
-- empenho (salvar_nota_fiscal). Listas, fila de pagamento e relatórios passam a mostrar a nota mesmo sem empenho.

alter table public.notas_fiscais alter column empenho_id drop not null;

-- Lista de notas: o empenho passa a ser opcional (LEFT JOIN); o resto da visão é o mesmo
create or replace view public.v_notas with (security_invoker = false) as
SELECT nf.id,
    nf.tenant_id,
    nf.contrato_id,
    nf.empenho_id,
    nf.unidade_id,
    nf.fornecedor_id,
    nf.numero,
    nf.serie,
    nf.data_emissao,
    nf.data_inclusao,
    nf.processo_administrativo,
    nf.valor,
    nf.tipo_servico_id,
    nf.periodo_inicio,
    nf.periodo_fim,
    nf.observacoes,
    nf.status_atesto,
    nf.status_pagamento,
    nf.excecao_saldo,
    nf.cancelada_em,
    nf.cancelada_por,
    nf.motivo_cancelamento,
    nf.criado_em,
    nf.criado_por,
    nf.atualizado_em,
    nf.atualizado_por,
    c.numero AS contrato_numero,
    c.objeto AS contrato_objeto,
    COALESCE(f.razao_social, f.nome_fantasia) AS fornecedor_nome,
    f.documento AS fornecedor_documento,
    e.numero AS empenho_numero,
    e.ano AS empenho_ano,
    ts.nome AS tipo_servico_nome,
    COALESCE(( SELECT sum(p.valor) AS sum
           FROM nota_pagamentos p
          WHERE p.nota_id = nf.id AND p.cancelado_em IS NULL), 0::numeric) AS pago,
    ( SELECT string_agg((lpad(r.mes::text, 2, '0'::text) || '/'::text) || r.ano, ', '::text ORDER BY r.ano, r.mes) AS string_agg
           FROM nota_referencias r
          WHERE r.nota_id = nf.id) AS meses_referencia,
    (nf.contrato_id IN ( SELECT contratos_designados() AS contratos_designados)) AS sou_designado,
    (nf.contrato_id IN ( SELECT contratos_designados() AS contratos_designados)) OR nf.criado_por = auth.uid() AND COALESCE(( SELECT tc.permitir_atesto_lancador
           FROM tenant_configuracoes tc
          WHERE tc.tenant_id = nf.tenant_id), true) AND ((nf.tenant_id, nf.unidade_id) IN ( SELECT a.tenant_id,
            a.unidade_id
           FROM unidades_acessiveis('notas_fiscais'::text, 'editar'::text) a(tenant_id, unidade_id))) AS posso_atestar,
    ( SELECT min(a.atestado_em) AS min
           FROM nota_atestos a
          WHERE a.nota_id = nf.id) AS atestado_em,
    COALESCE(( SELECT sum(p.valor - p.valor_liquido) AS sum
           FROM nota_pagamentos p
          WHERE p.nota_id = nf.id AND p.cancelado_em IS NULL), 0::numeric) AS retido
   FROM notas_fiscais nf
     JOIN contratos c ON c.id = nf.contrato_id
     JOIN fornecedores f ON f.id = nf.fornecedor_id
     LEFT JOIN empenhos e ON e.id = nf.empenho_id
     LEFT JOIN tipos_servico ts ON ts.id = nf.tipo_servico_id
  WHERE ((nf.tenant_id, nf.unidade_id) IN ( SELECT a.tenant_id,
            a.unidade_id
           FROM unidades_acessiveis('notas_fiscais'::text, 'ler'::text) a(tenant_id, unidade_id))) OR (nf.contrato_id IN ( SELECT contratos_designados() AS contratos_designados));

-- Fila de pagamentos: nota sem empenho entra num grupo próprio (sem fonte de recurso)
create or replace function public.fila_pagamentos(p_tenant uuid)
returns table(nota_id uuid, numero text, serie text, fornecedor_nome text, contrato_numero text, empenho text, valor numeric, pago numeric, restante numeric, status_pagamento text, atestado_em timestamp with time zone, dias_aguardando integer, fonte_id uuid, fonte text, posicao integer, unidade_id uuid)
language sql stable security definer set search_path = public as $$
  with base as (
    select n.*, nota_atestada_em(n.id) as atestada, cl.fonte_id as fonte,
           case when e.id is null then 'Sem empenho (nota migrada)' else coalesce(fo.codigo || ' – ' || fo.descricao, '—') end as fonte_texto,
           case when e.id is null then null else e.numero || '/' || e.ano end as empenho_txt, coalesce(f.razao_social, f.nome_fantasia) as fornecedor, c.numero as contrato_num,
           coalesce((select sum(pg.valor) from nota_pagamentos pg where pg.nota_id = n.id and pg.cancelado_em is null), 0) as pago_v
      from notas_fiscais n
      left join empenhos e on e.id = n.empenho_id
      left join classificacoes_orcamentarias cl on cl.id = e.classificacao_id
      left join classificadores fo on fo.id = cl.fonte_id
      join contratos c on c.id = n.contrato_id
      join fornecedores f on f.id = n.fornecedor_id
     where n.tenant_id = p_tenant and n.cancelada_em is null
       and n.status_atesto = 'ATESTADA' and n.status_pagamento in ('PENDENTE', 'PARCIAL')
  )
  , fila as (select b.*, (row_number() over (partition by b.fonte order by b.atestada, b.id))::int as pos from base b)
  select b.id, b.numero, b.serie, b.fornecedor, b.contrato_num, b.empenho_txt, b.valor, b.pago_v, b.valor - b.pago_v,
         b.status_pagamento, b.atestada, (hoje() - (b.atestada at time zone 'America/Sao_Paulo')::date)::int, b.fonte, b.fonte_texto,
         b.pos, b.unidade_id
    from fila b
   where (b.tenant_id, b.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('notas_fiscais', 'ler') a)
   order by b.fonte_texto, b.atestada, b.id
$$;

-- Relatório de notas: nota sem empenho aparece (sem classificação), com o ano da emissão
CREATE OR REPLACE FUNCTION public.relatorio_notas(p jsonb)
 RETURNS TABLE(ano integer, nota_id uuid, numero text, serie text, data_emissao date, fornecedor_nome text, fornecedor_documento text, fornecedor_tipo text, contrato_id uuid, contrato_numero text, contrato_objeto text, empenho text, processo text, codigo_completo text, orgao text, unidade_orcamentaria text, funcao text, subfuncao text, programa text, acao_codigo text, acao_descricao text, natureza_acao text, categoria text, gnd text, modalidade text, elemento_codigo text, elemento_descricao text, subelemento_codigo text, subelemento_descricao text, fonte_codigo text, fonte_descricao text, detalhamento text, unidades text, meses_referencia text, valor numeric, pago numeric, status_atesto text, status_pagamento text, cancelada boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET enable_nestloop TO 'off'
AS $function$
  with prm as materialized (
    select (p ->> 'tenant_id')::uuid as tenant, filtro_ids(p, 'contratos') as contratos, filtro_ids(p, 'fornecedores') as fornecedores,
           filtro_ids(p, 'unidades') as unidades, filtro_ints(p, 'anos') as anos, p ->> 'ano_base' = 'EMISSAO' as por_emissao
  ),
  classif as materialized (
    select cd.id from classificacao_detalhada cd, prm where cd.ente_id = (select t.ente_id from tenants t where t.id = prm.tenant) and classificacao_casa(cd, p)
  ),
  base as (
    select nf.*, e.ano as empenho_ano, e.numero as empenho_numero, e.classificacao_id
      from notas_fiscais nf left join empenhos e on e.id = nf.empenho_id, prm
     where nf.tenant_id = prm.tenant
       and (e.classificacao_id in (select id from classif)
            -- nota migrada sem empenho: entra só quando nenhum filtro de classificação restringe o relatório
            or (e.id is null and (select count(*) from classif) = (select count(*) from classificacao_detalhada cd2 where cd2.ente_id = (select t.ente_id from tenants t where t.id = prm.tenant))))
       and ((nf.tenant_id, nf.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('relatorios', 'ler') a) or nf.contrato_id in (select contratos_designados()))
       and (coalesce((p ->> 'incluir_canceladas')::boolean, false) or nf.cancelada_em is null)
       and (prm.contratos is null or nf.contrato_id = any(prm.contratos))
       and (prm.fornecedores is null or nf.fornecedor_id = any(prm.fornecedores))
       and (prm.unidades is null or exists (select 1 from nota_unidades nu where nu.nota_id = nf.id and nu.unidade_atendida_id = any(prm.unidades)))
       and (nullif(p ->> 'status_atesto', '') is null or nf.status_atesto = p ->> 'status_atesto')
       and (nullif(p ->> 'status_pagamento', '') is null or nf.status_pagamento = p ->> 'status_pagamento')
  )
  select x.ano, b.id, b.numero, b.serie, b.data_emissao,
         coalesce(f.razao_social, f.nome_fantasia), f.documento, f.tipo_pessoa,
         c.id, c.numero, c.objeto, coalesce(b.empenho_numero || '/' || b.empenho_ano, 'Sem empenho'), b.processo_administrativo,
         cd.codigo_completo,
         nullif(concat_ws(' – ', cd.orgao_codigo, cd.orgao_descricao), ''), nullif(concat_ws(' – ', cd.uo_codigo, cd.uo_descricao), ''),
         nullif(concat_ws(' – ', cd.funcao_codigo, cd.funcao_descricao), ''), nullif(concat_ws(' – ', cd.subfuncao_codigo, cd.subfuncao_descricao), ''),
         nullif(concat_ws(' – ', cd.programa_codigo, cd.programa_descricao), ''),
         cd.acao_codigo, cd.acao_descricao, cd.natureza_acao,
         nullif(concat_ws(' – ', cd.categoria_codigo, cd.categoria_descricao), ''), nullif(concat_ws(' – ', cd.gnd_codigo, cd.gnd_descricao), ''),
         nullif(concat_ws(' – ', cd.modalidade_codigo, cd.modalidade_descricao), ''),
         cd.elemento_codigo, cd.elemento_descricao, cd.subelemento_codigo, cd.subelemento_descricao,
         cd.fonte_codigo, cd.fonte_descricao, nullif(concat_ws(' – ', cd.detalhamento_codigo, cd.detalhamento_descricao), ''),
         (select string_agg(ua.nome || coalesce(' (' || brl(nu.valor) || ')', ''), '; ' order by ua.nome)
            from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = b.id),
         (select string_agg(lpad(r.mes::text, 2, '0') || '/' || r.ano, ', ' order by r.ano, r.mes) from nota_referencias r where r.nota_id = b.id),
         b.valor,
         coalesce((select sum(pg.valor) from nota_pagamentos pg where pg.nota_id = b.id and pg.cancelado_em is null), 0),
         b.status_atesto, b.status_pagamento, b.cancelada_em is not null
    from base b
    join contratos c on c.id = b.contrato_id
    join fornecedores f on f.id = b.fornecedor_id
    left join classificacao_detalhada cd on cd.id = b.classificacao_id
    cross join prm
    cross join lateral (select case when prm.por_emissao or b.empenho_ano is null then extract(year from b.data_emissao)::int else b.empenho_ano end as ano) x
   where (prm.anos is null or x.ano = any(prm.anos))
   order by x.ano, coalesce(f.razao_social, f.nome_fantasia), c.numero, b.data_emissao, b.numero
$function$;

-- Completa o empenho de uma nota migrada sem empenho. Só preenche o que está vazio (não troca empenho de
-- nota, mesmo atestada ou paga: a regra de troca continua a de salvar_nota_fiscal). O empenho tem de ser do
-- mesmo contrato; passar do saldo exige justificativa e a permissão de aprovar, como no lançamento.
create function public.vincular_empenho_nota(p_nota uuid, p_empenho uuid, p_justificativa text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; e empenhos; v_saldo numeric;
begin
  select * into n from notas_fiscais where id = p_nota;
  if n.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'editar') then
    raise exception 'Nota não encontrada ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if n.empenho_id is not null then
    raise exception 'Esta nota já tem empenho.' using errcode = 'check_violation', hint = 'empenho_id';
  end if;
  select * into e from empenhos where id = p_empenho;
  if e.id is null or e.contrato_id <> n.contrato_id then
    raise exception 'Escolha um empenho do contrato da nota.' using errcode = 'check_violation', hint = 'empenho_id';
  end if;
  if not e.ativo then raise exception 'O empenho % está inativo.', e.numero using errcode = 'check_violation', hint = 'empenho_id'; end if;
  v_saldo := empenho_saldo(e.id);
  if n.cancelada_em is null and n.valor > v_saldo then
    if coalesce(length(btrim(p_justificativa)), 0) < 5 then
      raise exception 'Saldo insuficiente no empenho %: disponível %, nota de %. Informe a justificativa da exceção.', e.numero || '/' || e.ano, brl(v_saldo), brl(n.valor)
        using errcode = 'check_violation', hint = 'justificativa';
    end if;
    if not pode(e.tenant_id, e.unidade_id, 'notas_fiscais', 'aprovar') then
      raise exception 'A nota ultrapassa o saldo do empenho (disponível %). Só quem pode aprovar exceções faz este vínculo.', brl(v_saldo)
        using errcode = 'insufficient_privilege', hint = 'justificativa';
    end if;
  end if;
  perform set_config('measure.nota_rpc', 'sim', true);
  update notas_fiscais
     set empenho_id = e.id,
         excecao_saldo = case when n.cancelada_em is null and n.valor > v_saldo then btrim(p_justificativa) else excecao_saldo end
   where id = n.id;
end $$;

revoke execute on function public.vincular_empenho_nota(uuid, uuid, text) from public, anon;
grant execute on function public.vincular_empenho_nota(uuid, uuid, text) to authenticated;
