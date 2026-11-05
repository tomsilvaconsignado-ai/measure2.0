-- Desempenho (Fase 8, teste de carga com 30 mil notas): a checagem de permissão era feita linha a linha
-- (pode() e designado() para cada nota, empenho, contrato, servidor e registro de auditoria), o que
-- estourava o tempo limite da API. Agora o conjunto de unidades/órgãos acessíveis e de contratos
-- designados é calculado UMA vez por consulta e usado em junção (hash). As regras de acesso não mudam.

-- (órgão, unidade) que a pessoa logada alcança para recurso/ação — mesma regra de pode()
create function public.unidades_acessiveis(p_recurso text, p_acao text)
returns table (tenant_id uuid, unidade_id uuid)
language sql stable security definer set search_path = public as $$
  select u.tenant_id, u.id
    from unidades_organizacionais u
   where (select eh_admin_plataforma())
     and exists (select 1 from recursos r where r.codigo = p_recurso and (r.livre_para_plataforma or suporte_ativo(u.tenant_id)))
  union
  select u.tenant_id, u.id
    from vinculos v
    join perfis p on p.id = v.user_id and p.ativo
    join tenants t on t.id = v.tenant_id and t.ativo
    join permissoes_papel pp on pp.papel = v.papel and pp.recurso = p_recurso and pp.acao = p_acao
    join unidades_organizacionais u on u.tenant_id = v.tenant_id and (v.unidade_id is null or v.unidade_id = any(u.caminho))
   where v.user_id = auth.uid() and v.ativo
$$;

-- Órgãos em que a pessoa tem o recurso/ação em alguma unidade (equivale a pode(tenant, null, ...))
create function public.orgaos_permitidos(p_recurso text, p_acao text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id from tenants t
   where (select eh_admin_plataforma())
     and exists (select 1 from recursos r where r.codigo = p_recurso and (r.livre_para_plataforma or suporte_ativo(t.id)))
  union
  select v.tenant_id
    from vinculos v
    join perfis p on p.id = v.user_id and p.ativo
    join tenants t on t.id = v.tenant_id and t.ativo
    join permissoes_papel pp on pp.papel = v.papel and pp.recurso = p_recurso and pp.acao = p_acao
   where v.user_id = auth.uid() and v.ativo
$$;

-- Contratos em que a pessoa logada está designada (mesma regra de designado())
create function public.contratos_designados() returns setof uuid
language sql stable security definer set search_path = public as $$
  select d.contrato_id
    from contrato_designacoes d
    join servidores s on s.id = d.servidor_id
    join perfis p on p.id = s.user_id and p.ativo
    join tenants t on t.id = d.tenant_id and t.ativo
   where s.user_id = auth.uid() and d.fim is null and d.inicio <= hoje()
$$;

-- =====================================================================
-- Visões (mesmas colunas; só o filtro de acesso muda)
-- =====================================================================

create or replace view public.v_contratos with (security_invoker = false) as
SELECT c.id,
    c.tenant_id,
    c.unidade_id,
    c.numero,
    c.modalidade,
    c.fornecedor_id,
    c.processo_administrativo,
    c.numero_licitacao,
    c.objeto,
    c.data_inicio,
    c.data_fim,
    c.valor_global,
    c.observacoes,
    c.contrato_origem_id,
    c.numero_renovacao,
    c.ativo,
    c.criado_em,
    c.criado_por,
    c.atualizado_em,
    c.atualizado_por,
    COALESCE(f.razao_social, f.nome_fantasia) AS fornecedor_nome,
    f.nome_fantasia AS fornecedor_fantasia,
    f.documento AS fornecedor_documento,
    f.tipo_pessoa AS fornecedor_tipo,
    u.nome AS unidade_nome,
    u.sigla AS unidade_sigla,
    x.aditivos_valor,
    c.valor_global + x.aditivos_valor AS valor_atual,
    x.fim_atual AS data_fim_atual,
    COALESCE(e.empenhado, 0::numeric) AS empenhado,
    COALESCE(n.notas, 0::numeric) AS notas_valor,
    COALESCE(n.pago, 0::numeric) AS pago,
    c.valor_global + x.aditivos_valor - COALESCE(n.notas, 0::numeric) AS saldo,
        CASE
            WHEN hoje() < c.data_inicio THEN 'NAO_INICIADO'::text
            WHEN hoje() > x.fim_atual THEN 'VENCIDO'::text
            WHEN (x.fim_atual - hoje()) <= COALESCE(( SELECT max(d.d) AS max
               FROM tenant_configuracoes tc,
                LATERAL unnest(tc.alerta_vencimento_dias) d(d)
              WHERE tc.tenant_id = c.tenant_id), 30) THEN 'A_VENCER'::text
            ELSE 'VIGENTE'::text
        END AS situacao,
    x.fim_atual - hoje() AS dias_para_vencer,
    ( SELECT count(*) AS count
           FROM contrato_aditivos a
          WHERE a.contrato_id = c.id AND a.status = 'APROVADO'::text) AS aditivos_aprovados
   FROM contratos c
     JOIN fornecedores f ON f.id = c.fornecedor_id
     JOIN unidades_organizacionais u ON u.id = c.unidade_id
     CROSS JOIN LATERAL ( SELECT COALESCE(( SELECT sum(a.valor) AS sum
                   FROM contrato_aditivos a
                  WHERE a.contrato_id = c.id AND a.status = 'APROVADO'::text), 0::numeric) AS aditivos_valor,
            GREATEST(c.data_fim, COALESCE(( SELECT max(a.nova_data_fim) AS max
                   FROM contrato_aditivos a
                  WHERE a.contrato_id = c.id AND a.status = 'APROVADO'::text), c.data_fim)) AS fim_atual) x
     LEFT JOIN LATERAL ( SELECT sum(em.valor + COALESCE(( SELECT sum(r.valor) AS sum
                   FROM empenho_reforcos r
                  WHERE r.empenho_id = em.id AND r.cancelado_em IS NULL), 0::numeric)) AS empenhado
           FROM empenhos em
          WHERE em.contrato_id = c.id AND em.ativo) e ON true
     LEFT JOIN LATERAL ( SELECT sum(nf.valor) AS notas,
            sum(( SELECT COALESCE(sum(p.valor), 0::numeric) AS "coalesce"
                   FROM nota_pagamentos p
                  WHERE p.nota_id = nf.id AND p.cancelado_em IS NULL)) AS pago
           FROM notas_fiscais nf
          WHERE nf.contrato_id = c.id AND nf.cancelada_em IS NULL) n ON true
  WHERE ((c.tenant_id, c.unidade_id) IN ( SELECT a.tenant_id, a.unidade_id FROM unidades_acessiveis('contratos'::text, 'ler'::text) a(tenant_id, unidade_id)) OR c.id IN ( SELECT contratos_designados() AS contratos_designados));

create or replace view public.v_empenhos with (security_invoker = false) as
SELECT e.id,
    e.tenant_id,
    e.contrato_id,
    e.unidade_id,
    e.fornecedor_id,
    e.numero,
    e.ano,
    e.tipo,
    e.data_empenho,
    e.vigencia_fim,
    e.valor,
    e.classificacao_id,
    e.processo,
    e.sd,
    e.licitacao,
    e.observacoes,
    e.ativo,
    e.criado_em,
    e.criado_por,
    e.atualizado_em,
    e.atualizado_por,
    c.numero AS contrato_numero,
    c.objeto AS contrato_objeto,
    COALESCE(f.razao_social, f.nome_fantasia) AS fornecedor_nome,
    cl.codigo_completo AS classificacao_codigo,
    COALESCE(r.reforcos, 0::numeric) AS reforcos,
    e.valor + COALESCE(r.reforcos, 0::numeric) AS valor_total,
    COALESCE(n.utilizado, 0::numeric) AS utilizado,
    e.valor + COALESCE(r.reforcos, 0::numeric) - COALESCE(n.utilizado, 0::numeric) AS saldo
   FROM empenhos e
     JOIN contratos c ON c.id = e.contrato_id
     JOIN fornecedores f ON f.id = e.fornecedor_id
     JOIN classificacoes_orcamentarias cl ON cl.id = e.classificacao_id
     LEFT JOIN LATERAL ( SELECT sum(empenho_reforcos.valor) AS reforcos
           FROM empenho_reforcos
          WHERE empenho_reforcos.empenho_id = e.id AND empenho_reforcos.cancelado_em IS NULL) r ON true
     LEFT JOIN LATERAL ( SELECT sum(notas_fiscais.valor) AS utilizado
           FROM notas_fiscais
          WHERE notas_fiscais.empenho_id = e.id AND notas_fiscais.cancelada_em IS NULL) n ON true
  WHERE ((e.tenant_id, e.unidade_id) IN ( SELECT a.tenant_id, a.unidade_id FROM unidades_acessiveis('empenhos'::text, 'ler'::text) a(tenant_id, unidade_id)) OR e.contrato_id IN ( SELECT contratos_designados() AS contratos_designados));

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
    (nf.contrato_id IN ( SELECT contratos_designados() AS contratos_designados)) AS sou_designado
   FROM notas_fiscais nf
     JOIN contratos c ON c.id = nf.contrato_id
     JOIN fornecedores f ON f.id = nf.fornecedor_id
     JOIN empenhos e ON e.id = nf.empenho_id
     LEFT JOIN tipos_servico ts ON ts.id = nf.tipo_servico_id
  WHERE ((nf.tenant_id, nf.unidade_id) IN ( SELECT a.tenant_id, a.unidade_id FROM unidades_acessiveis('notas_fiscais'::text, 'ler'::text) a(tenant_id, unidade_id)) OR nf.contrato_id IN ( SELECT contratos_designados() AS contratos_designados));

create or replace view public.v_contrato_dotacoes with (security_invoker = false) as
SELECT cd.contrato_id,
    cl.id,
    cl.codigo_completo,
    cl.descricao,
    cl.ativo
   FROM contrato_dotacoes cd
     JOIN classificacoes_orcamentarias cl ON cl.id = cd.classificacao_id
  WHERE (EXISTS ( SELECT 1 FROM contratos ct WHERE ct.id = cd.contrato_id AND ((ct.tenant_id, ct.unidade_id) IN ( SELECT a.tenant_id, a.unidade_id FROM unidades_acessiveis('contratos'::text, 'ler'::text) a(tenant_id, unidade_id))))) OR cd.contrato_id IN ( SELECT contratos_designados() AS contratos_designados);

-- =====================================================================
-- Relatórios, painel, notificações, busca de servidores e consolidado
-- =====================================================================

create or replace function public.relatorio_notas(p jsonb) returns table (
  ano int, nota_id uuid, numero text, serie text, data_emissao date,
  fornecedor_nome text, fornecedor_documento text, fornecedor_tipo text,
  contrato_id uuid, contrato_numero text, contrato_objeto text, empenho text, processo text,
  codigo_completo text,
  orgao text, unidade_orcamentaria text, funcao text, subfuncao text, programa text,
  acao_codigo text, acao_descricao text, natureza_acao text,
  categoria text, gnd text, modalidade text,
  elemento_codigo text, elemento_descricao text, subelemento_codigo text, subelemento_descricao text,
  fonte_codigo text, fonte_descricao text, detalhamento text,
  unidades text, meses_referencia text, valor numeric, pago numeric,
  status_atesto text, status_pagamento text, cancelada boolean
)
-- com milhares de notas, o planejador subestima as linhas e escolhe laços aninhados (30 mil buscas); junção hash é ~4x mais rápida
language sql stable security definer set search_path = public set enable_nestloop = off as $$
  with prm as materialized (
    select (p ->> 'tenant_id')::uuid as tenant, filtro_ids(p, 'contratos') as contratos, filtro_ids(p, 'fornecedores') as fornecedores,
           filtro_ids(p, 'unidades') as unidades, filtro_ints(p, 'anos') as anos, p ->> 'ano_base' = 'EMISSAO' as por_emissao
  ),
  classif as materialized (
    select cd.id from classificacao_detalhada cd, prm where cd.tenant_id = prm.tenant and classificacao_casa(cd, p)
  ),
  base as (
    select nf.*, e.ano as empenho_ano, e.numero as empenho_numero, e.classificacao_id
      from notas_fiscais nf join empenhos e on e.id = nf.empenho_id, prm
     where nf.tenant_id = prm.tenant
       and e.classificacao_id in (select id from classif)
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
         c.id, c.numero, c.objeto, b.empenho_numero || '/' || b.empenho_ano, b.processo_administrativo,
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
    join classificacao_detalhada cd on cd.id = b.classificacao_id
    cross join prm
    cross join lateral (select case when prm.por_emissao then extract(year from b.data_emissao)::int else b.empenho_ano end as ano) x
   where (prm.anos is null or x.ano = any(prm.anos))
   order by x.ano, coalesce(f.razao_social, f.nome_fantasia), c.numero, b.data_emissao, b.numero
$$;

create or replace function public.relatorio_consumo(p jsonb) returns table (
  ano int, fornecedor_nome text, contrato_id uuid, contrato_numero text, contrato_objeto text,
  acao_codigo text, acao_descricao text, elemento_codigo text, elemento_descricao text,
  subelemento text, fonte text, valor numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_metrica text := coalesce(nullif(p ->> 'metrica', ''), 'NOTAS');
  v_sub boolean := coalesce(p -> 'detalhar' ? 'SUBELEMENTO', false);
  v_fonte boolean := coalesce(p -> 'detalhar' ? 'FONTE', false);
begin
  if v_metrica not in ('NOTAS', 'PAGO', 'EMPENHADO') then
    raise exception 'Métrica inválida.' using errcode = 'check_violation';
  end if;
  if v_metrica = 'EMPENHADO' then
    return query
      select e.ano, coalesce(f.razao_social, f.nome_fantasia), c.id, c.numero, c.objeto,
             cd.acao_codigo, cd.acao_descricao, cd.elemento_codigo, cd.elemento_descricao,
             case when v_sub then nullif(concat_ws(' – ', cd.subelemento_codigo, cd.subelemento_descricao), '') end,
             case when v_fonte then concat_ws(' – ', cd.fonte_codigo, cd.fonte_descricao) end,
             sum(e.valor + coalesce((select sum(r.valor) from empenho_reforcos r where r.empenho_id = e.id and r.cancelado_em is null), 0))
        from empenhos e
        join contratos c on c.id = e.contrato_id
        join fornecedores f on f.id = e.fornecedor_id
        join classificacao_detalhada cd on cd.id = e.classificacao_id
       where e.tenant_id = (p ->> 'tenant_id')::uuid and e.ativo
         and ((e.tenant_id, e.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('relatorios', 'ler') a) or e.contrato_id in (select contratos_designados()))
         and (filtro_ints(p, 'anos') is null or e.ano = any(filtro_ints(p, 'anos')))
         and (filtro_ids(p, 'contratos') is null or e.contrato_id = any(filtro_ids(p, 'contratos')))
         and (filtro_ids(p, 'fornecedores') is null or e.fornecedor_id = any(filtro_ids(p, 'fornecedores')))
         and classificacao_casa(cd, p)
       group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
       order by 1, 2, 4, 6, 8;
  else
    return query
      select r.ano, r.fornecedor_nome, r.contrato_id, r.contrato_numero, r.contrato_objeto,
             r.acao_codigo, r.acao_descricao, r.elemento_codigo, r.elemento_descricao,
             case when v_sub then nullif(concat_ws(' – ', r.subelemento_codigo, r.subelemento_descricao), '') end,
             case when v_fonte then concat_ws(' – ', r.fonte_codigo, r.fonte_descricao) end,
             sum(case when v_metrica = 'PAGO' then r.pago else r.valor end)
        from relatorio_notas(p - 'incluir_canceladas') r
       where not r.cancelada
       group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
       order by 1, 2, 4, 6, 8;
  end if;
end $$;

create or replace function public.painel(p_tenant uuid, p_ano int default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with ct as (select * from v_contratos where tenant_id = p_tenant and ativo),
       em as (select * from v_empenhos where tenant_id = p_tenant and ativo and (p_ano is null or ano = p_ano)),
       nf as (select * from v_notas where tenant_id = p_tenant and cancelada_em is null
                and (p_ano is null or empenho_ano = p_ano))
  select jsonb_build_object(
    'contratos', jsonb_build_object(
      'vigentes', (select count(*) from ct where situacao in ('VIGENTE', 'A_VENCER')),
      'a_vencer', (select count(*) from ct where situacao = 'A_VENCER'),
      'vencidos', (select count(*) from ct where situacao = 'VENCIDO'),
      'nao_iniciados', (select count(*) from ct where situacao = 'NAO_INICIADO'),
      'valor_vigentes', coalesce((select sum(valor_atual) from ct where situacao in ('VIGENTE', 'A_VENCER')), 0),
      'saldo_vigentes', coalesce((select sum(saldo) from ct where situacao in ('VIGENTE', 'A_VENCER')), 0)),
    'empenhos', jsonb_build_object(
      'quantidade', (select count(*) from em),
      'empenhado', coalesce((select sum(valor_total) from em), 0),
      'utilizado', coalesce((select sum(utilizado) from em), 0),
      'saldo', coalesce((select sum(saldo) from em), 0),
      'saldo_baixo', (select count(*) from em where valor_total > 0 and saldo / valor_total < 0.10)),
    'notas', jsonb_build_object(
      'quantidade', (select count(*) from nf),
      'valor', coalesce((select sum(valor) from nf), 0),
      'pago', coalesce((select sum(pago) from nf), 0),
      'pendentes_atesto', (select count(*) from nf where status_atesto = 'PENDENTE'),
      'pendentes_pagamento', (select count(*) from nf where status_atesto = 'ATESTADA' and status_pagamento in ('PENDENTE', 'PARCIAL')),
      'atestadas', (select count(*) from nf where status_atesto = 'ATESTADA')),
    'cadastros', jsonb_build_object(
      'fornecedores_ativos', case when pode(p_tenant, null, 'fornecedores', 'ler') then (select count(*) from fornecedores where tenant_id = p_tenant and ativo) end,
      'servidores_ativos', (select count(*) from servidores s where s.tenant_id = p_tenant and (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'ler') a)
                              and (s.data_exoneracao is null or s.data_exoneracao > hoje())),
      'servidores_exonerados', (select count(*) from servidores s where s.tenant_id = p_tenant and (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'ler') a)
                              and s.data_exoneracao <= hoje()),
      'unidades_atendidas', case when pode(p_tenant, null, 'unidades', 'ler') then (select count(*) from unidades_atendidas where tenant_id = p_tenant and ativo) end,
      'os_abertas', (select count(*) from ordens_servico o where o.tenant_id = p_tenant and o.status in ('ABERTA', 'EM_ANDAMENTO')
                       and (o.tenant_id, o.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('ordens_servico', 'ler') a))),
    'mensal', coalesce((select jsonb_agg(jsonb_build_object('mes', m, 'notas', coalesce(v, 0)) order by m)
                 from generate_series(1, 12) m
                 left join (select extract(month from data_emissao)::int mes, sum(valor) v from nf
                             where extract(year from data_emissao) = coalesce(p_ano, extract(year from hoje())) group by 1) t on t.mes = m), '[]'),
    'por_acao', coalesce((select jsonb_agg(x order by x.valor desc) from (
                 select cd.acao_codigo as codigo, cd.acao_descricao as descricao, sum(n.valor) as valor
                   from nf n join empenhos e on e.id = n.empenho_id join classificacao_detalhada cd on cd.id = e.classificacao_id
                  group by 1, 2 order by 3 desc limit 8) x), '[]'),
    'vencendo', coalesce((select jsonb_agg(x order by x.data_fim_atual) from (
                 select id, numero, fornecedor_nome, data_fim_atual, dias_para_vencer, saldo from ct
                  where situacao = 'A_VENCER' order by data_fim_atual limit 6) x), '[]'),
    'ano', coalesce(p_ano, extract(year from hoje())::int)
  )
$$;

create or replace function public.minhas_notificacoes(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.ordem, x.titulo), '[]') from (
    select 1 as ordem, 'ATESTO' as tipo, 'alta' as severidade,
           'NF ' || n.numero || ' aguarda o seu atesto' as titulo,
           n.fornecedor_nome || ' · Contrato ' || n.contrato_numero || ' · ' || brl(n.valor) as descricao,
           '/notas?ver=' || n.id as link
      from v_notas n where n.tenant_id = p_tenant and n.sou_designado and n.status_atesto = 'PENDENTE' and n.cancelada_em is null
    union all
    select 2, 'VENCIMENTO', case when c.dias_para_vencer <= 15 then 'alta' else 'media' end,
           'Contrato ' || c.numero || ' vence em ' || c.dias_para_vencer || ' dia(s)',
           c.fornecedor_nome || ' · até ' || to_char(c.data_fim_atual, 'DD/MM/YYYY'), '/contratos/' || c.id
      from v_contratos c where c.tenant_id = p_tenant and c.ativo and c.situacao = 'A_VENCER'
    union all
    select 3, 'PAGAMENTO', 'media', 'NF ' || n.numero || ' atestada aguardando pagamento',
           n.fornecedor_nome || ' · falta ' || brl(n.valor - n.pago), '/notas?ver=' || n.id
      from v_notas n where n.tenant_id = p_tenant and n.status_atesto = 'ATESTADA' and n.status_pagamento in ('PENDENTE', 'PARCIAL')
       and (n.tenant_id, n.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('notas_fiscais', 'editar') a)
    union all
    select 4, 'SALDO', 'media', 'Empenho ' || e.numero || '/' || e.ano || ' com saldo baixo',
           'Saldo ' || brl(e.saldo) || ' de ' || brl(e.valor_total) || ' · Contrato ' || e.contrato_numero, '/empenhos?ver=' || e.id
      from v_empenhos e where e.tenant_id = p_tenant and e.ativo and e.valor_total > 0 and e.saldo / e.valor_total < 0.10
       and (e.tenant_id, e.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('empenhos', 'editar') a)
    limit 50
  ) x
$$;

create or replace function public.buscar_servidores(
  p_tenant uuid, p_busca text default null, p_situacao text default 'ATIVOS', p_unidade uuid default null,
  p_limite int default 25, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_like text;
  v_digitos text := nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '');
  v_res jsonb;
begin
  if p_situacao not in ('ATIVOS', 'EXONERADOS', 'TODOS') then
    raise exception 'Situação inválida.' using errcode = 'check_violation';
  end if;
  if nullif(btrim(p_busca), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with base as (
    select s.*, u.nome as unidade_nome, u.sigla as unidade_sigla,
           (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores_sensiveis', 'ler') a) as ve_sensivel,
           (s.data_exoneracao is not null and s.data_exoneracao <= hoje()) as exonerado
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
     where s.tenant_id = p_tenant
       and ((s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'ler') a) or s.user_id = auth.uid())
       and (p_unidade is null or p_unidade = any(u.caminho))
  ),
  filtrados as (
    select b.*, d.cpf as cpf_sensivel from base b
      left join servidores_dados_pessoais d on d.servidor_id = b.id
     where (p_situacao = 'TODOS' or (p_situacao = 'ATIVOS' and not b.exonerado) or (p_situacao = 'EXONERADOS' and b.exonerado))
       and (v_like is null
            or lower(b.nome || ' ' || b.matricula || ' ' || coalesce(b.cargo, '') || ' ' || coalesce(b.funcao, '')
                     || ' ' || b.unidade_nome || ' ' || coalesce(b.unidade_sigla, '')) like v_like
            or (b.ve_sensivel and v_digitos is not null and length(v_digitos) >= 3 and d.cpf like '%' || v_digitos || '%'))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.nome, 'matricula', f.matricula, 'cargo', f.cargo, 'funcao', f.funcao,
        'unidade_id', f.unidade_id, 'unidade_nome', f.unidade_nome, 'unidade_sigla', f.unidade_sigla,
        'email_institucional', f.email_institucional, 'telefone', f.telefone, 'foto_path', f.foto_path,
        'data_nomeacao', f.data_nomeacao, 'data_exoneracao', f.data_exoneracao, 'exonerado', f.exonerado,
        'tem_acesso', f.user_id is not null,
        'cpf', case when f.ve_sensivel then f.cpf_sensivel end) order by lower(f.nome), f.matricula)
      from (select * from filtrados order by lower(nome), matricula
            limit least(greatest(p_limite, 1), 100) offset greatest(p_offset, 0)) f), '[]'))
  into v_res;
  return v_res;
end $$;

create or replace function public.consolidado_mensal(p_tenant uuid, p_unidade uuid, p_ano int, p_mes int)
returns table (
  servidor_id uuid, matricula text, nome text, cargo text, funcao text, unidade_sigla text, unidade_nome text,
  data_nomeacao date, data_exoneracao date, atrasos int, faltas int, justificativa_anexada boolean,
  observacao_manual text, observacao text, pode_editar boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_ini date; v_fim date;
begin
  if p_mes not between 1 and 12 or p_ano not between 2000 and 2100 then
    raise exception 'Mês ou ano de referência inválido.' using hint = 'mes';
  end if;
  if not pode(p_tenant, p_unidade, 'servidores', 'ler') then
    raise exception 'Você não tem acesso aos servidores desta unidade.' using errcode = 'insufficient_privilege';
  end if;
  if p_unidade is not null and not exists (select 1 from unidades_organizacionais where id = p_unidade and tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using hint = 'unidade';
  end if;
  v_ini := make_date(p_ano, p_mes, 1);
  v_fim := (v_ini + interval '1 month - 1 day')::date;
  return query
    select s.id, s.matricula, s.nome, s.cargo, s.funcao, u.sigla, u.nome,
           s.data_nomeacao, s.data_exoneracao, f.atrasos, f.faltas, coalesce(f.justificativa_anexada, false),
           f.observacao,
           observacao_frequencia(s.data_nomeacao, s.data_exoneracao, p_ano, p_mes, f.atrasos, f.faltas, coalesce(f.justificativa_anexada, false), f.observacao),
           (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'editar') a)
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
      left join frequencias_mensais f on f.servidor_id = s.id and f.ano = p_ano and f.mes = p_mes
     where s.tenant_id = p_tenant
       and (p_unidade is null or p_unidade = any(u.caminho))
       and (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'ler') a)
       and (s.data_nomeacao is null or s.data_nomeacao <= v_fim)
       and (s.data_exoneracao is null or s.data_exoneracao >= v_ini)
     order by lower(s.nome), s.matricula;
end $$;
-- Totais do relatório completo: o relatório roda uma vez só (antes eram quatro)
create or replace function public.relatorio_notas_totais(p jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as materialized (select ano, valor, pago from relatorio_notas(p) where not cancelada)
  select jsonb_build_object(
    'por_ano', coalesce((select jsonb_agg(jsonb_build_object('ano', ano, 'quantidade', qtd, 'valor', valor, 'pago', pago) order by ano)
                from (select ano, count(*) qtd, sum(valor) valor, sum(pago) pago from r group by ano) t), '[]'),
    'quantidade', (select count(*) from r),
    'valor', coalesce((select sum(valor) from r), 0),
    'pago', coalesce((select sum(pago) from r), 0)
  )
$$;

-- Auditoria: mesma regra, com o conjunto de órgãos calculado uma vez
drop policy auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated
  using ((select eh_admin_plataforma()) or (tenant_id is not null and tenant_id in (select orgaos_permitidos('auditoria', 'ler'))));


revoke execute on function public.unidades_acessiveis(text, text), public.orgaos_permitidos(text, text), public.contratos_designados() from public, anon;
grant execute on function public.unidades_acessiveis(text, text), public.orgaos_permitidos(text, text), public.contratos_designados() to authenticated;
