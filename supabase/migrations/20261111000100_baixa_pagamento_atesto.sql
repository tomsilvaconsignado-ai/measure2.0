-- Baixa de pagamento pela administração (com retenções de impostos e data do pagamento) e atesto também
-- por quem lançou a nota (configurável por órgão).

-- =====================================================================
-- Configuração do órgão
-- =====================================================================

alter table public.tenant_configuracoes
  add column permitir_atesto_lancador boolean not null default true;
comment on column public.tenant_configuracoes.permitir_atesto_lancador is
  'Quem lançou a nota fiscal também pode atestá-la (além do gestor, fiscal e suplente designados).';

-- =====================================================================
-- Atesto por quem lançou a nota
-- =====================================================================

alter table public.nota_atestos alter column servidor_id drop not null;
alter table public.nota_atestos drop constraint nota_atestos_papel_check;
alter table public.nota_atestos add constraint nota_atestos_papel_check check (papel in ('GESTOR', 'FISCAL', 'SUPLENTE', 'LANCADOR'));

create or replace function public.atestar_nota(p_nota uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; d record; v_id uuid; v_lancador boolean;
begin
  select * into n from notas_fiscais where id = p_nota;
  if n.id is null then raise exception 'Nota não encontrada.' using errcode = 'no_data_found'; end if;
  -- 1º: designação vigente no contrato (gestor > fiscal > suplente)
  select cd.papel, s.id as servidor_id, s.nome, s.matricula, s.cargo into d
    from contrato_designacoes cd join servidores s on s.id = cd.servidor_id
   where cd.contrato_id = n.contrato_id and s.user_id = auth.uid() and cd.fim is null and cd.inicio <= hoje()
   order by case cd.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end limit 1;
  -- 2º: quem lançou a nota, se o órgão permitir e a pessoa ainda puder editar notas da unidade
  if d.papel is null then
    select coalesce(tc.permitir_atesto_lancador, true) into v_lancador from tenant_configuracoes tc where tc.tenant_id = n.tenant_id;
    if coalesce(v_lancador, true) and n.criado_por = auth.uid() and pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'editar') then
      select 'LANCADOR' as papel, s.id as servidor_id, coalesce(s.nome, p.nome, p.email) as nome, s.matricula, s.cargo into d
        from perfis p left join servidores s on s.user_id = p.id and s.tenant_id = n.tenant_id
       where p.id = auth.uid() limit 1;
    end if;
  end if;
  if d.papel is null then
    raise exception 'Somente o gestor, o fiscal ou o suplente designado neste contrato, ou quem lançou a nota, pode atestar.' using errcode = 'insufficient_privilege';
  end if;
  if n.cancelada_em is not null then raise exception 'Nota cancelada não pode ser atestada.' using errcode = 'check_violation'; end if;
  if n.status_atesto = 'ATESTADA' then raise exception 'Esta nota já foi atestada.' using errcode = 'check_violation'; end if;
  if coalesce(length(btrim(p_texto)), 0) < 20 then raise exception 'O texto do atesto está vazio.' using errcode = 'check_violation', hint = 'texto'; end if;
  insert into nota_atestos (tenant_id, nota_id, servidor_id, user_id, papel, texto, servidor_nome, servidor_matricula)
  values (n.tenant_id, n.id, d.servidor_id, auth.uid(), d.papel, btrim(p_texto), d.nome, d.matricula) returning id into v_id;
  perform set_config('measure.nota_rpc', 'sim', true);
  update notas_fiscais set status_atesto = 'ATESTADA' where id = n.id;
  perform set_config('measure.nota_rpc', '', true);
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (n.tenant_id, n.unidade_id, 'ATESTO', n.id, 'Atesto da NF ' || n.numero,
          jsonb_build_object('texto', btrim(p_texto), 'papel', d.papel,
                             'servidor', jsonb_build_object('nome', d.nome, 'matricula', d.matricula, 'cargo', d.cargo)));
  return v_id;
end $$;

-- =====================================================================
-- Pagamento com retenções
--   valor          = parte da nota quitada (bruto) — é o que conta para PARCIAL/PAGO
--   retenções      = impostos retidos na fonte e recolhidos pelo órgão
--   valor_liquido  = o que efetivamente foi creditado à empresa
-- =====================================================================

alter table public.nota_pagamentos
  add column retencao_iss numeric(16,2) not null default 0 check (retencao_iss >= 0),
  add column retencao_irrf numeric(16,2) not null default 0 check (retencao_irrf >= 0),
  add column retencao_inss numeric(16,2) not null default 0 check (retencao_inss >= 0),
  add column retencao_federais numeric(16,2) not null default 0 check (retencao_federais >= 0),
  add column retencao_outras numeric(16,2) not null default 0 check (retencao_outras >= 0),
  add column retencao_outras_descricao text check (length(retencao_outras_descricao) <= 200),
  add column justificativa_ordem text check (length(justificativa_ordem) <= 1000),
  add column valor_liquido numeric(16,2) generated always as (valor - retencao_iss - retencao_irrf - retencao_inss - retencao_federais - retencao_outras) stored;
alter table public.nota_pagamentos add constraint nota_pagamentos_retencoes_check
  check (retencao_iss + retencao_irrf + retencao_inss + retencao_federais + retencao_outras <= valor);
alter table public.nota_pagamentos add constraint nota_pagamentos_outras_descricao_check
  check (retencao_outras = 0 or nullif(btrim(retencao_outras_descricao), '') is not null);

-- Data do atesto (exigibilidade para a ordem cronológica) e fonte de recurso da nota
create function public.nota_atestada_em(p_nota uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select min(atestado_em) from nota_atestos where nota_id = p_nota
$$;

create function public.nota_fonte(p_nota uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select cl.fonte_id from notas_fiscais n join empenhos e on e.id = n.empenho_id
    join classificacoes_orcamentarias cl on cl.id = e.classificacao_id where n.id = p_nota
$$;

-- Notas atestadas antes desta, na mesma fonte, ainda não quitadas (fila do art. 141 da Lei 14.133/2021)
create function public.notas_a_frente(p_nota uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with alvo as (select n.tenant_id, nota_fonte(n.id) as fonte, nota_atestada_em(n.id) as em from notas_fiscais n where n.id = p_nota)
  select o.id from notas_fiscais o, alvo
   where o.tenant_id = alvo.tenant_id and o.id <> p_nota and o.cancelada_em is null
     and o.status_atesto = 'ATESTADA' and o.status_pagamento in ('PENDENTE', 'PARCIAL')
     and nota_fonte(o.id) = alvo.fonte and nota_atestada_em(o.id) < alvo.em
$$;

create function public.baixar_pagamento(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  n notas_fiscais; v_pago numeric; v_id uuid; v_atestada timestamptz; v_frente int;
  v_valor numeric := nullif(p ->> 'valor', '')::numeric;
  v_data date := nullif(p ->> 'data_pagamento', '')::date;
  r jsonb := coalesce(p -> 'retencoes', '{}');
  v_iss numeric := coalesce(nullif(r ->> 'iss', '')::numeric, 0);
  v_irrf numeric := coalesce(nullif(r ->> 'irrf', '')::numeric, 0);
  v_inss numeric := coalesce(nullif(r ->> 'inss', '')::numeric, 0);
  v_fed numeric := coalesce(nullif(r ->> 'federais', '')::numeric, 0);
  v_out numeric := coalesce(nullif(r ->> 'outras', '')::numeric, 0);
  v_just text := nullif(btrim(p ->> 'justificativa_ordem'), '');
begin
  select * into n from notas_fiscais where id = (p ->> 'nota_id')::uuid;
  if n.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'editar') then
    raise exception 'Nota não encontrada ou sem permissão para dar baixa no pagamento.' using errcode = 'insufficient_privilege';
  end if;
  if n.cancelada_em is not null then raise exception 'Nota cancelada não recebe pagamento.' using errcode = 'check_violation'; end if;
  if n.status_atesto <> 'ATESTADA' then raise exception 'A nota precisa ser atestada antes do pagamento.' using errcode = 'check_violation'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor da nota que está sendo pago.' using errcode = 'check_violation', hint = 'valor'; end if;
  if v_data is null then raise exception 'Informe a data do pagamento.' using errcode = 'check_violation', hint = 'data_pagamento'; end if;
  if v_data > hoje() then raise exception 'A data do pagamento não pode ser futura.' using errcode = 'check_violation', hint = 'data_pagamento'; end if;
  v_atestada := nota_atestada_em(n.id);
  if v_data < (v_atestada at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do pagamento não pode ser anterior ao atesto (%).', to_char(v_atestada at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
      using errcode = 'check_violation', hint = 'data_pagamento';
  end if;
  if least(v_iss, v_irrf, v_inss, v_fed, v_out) < 0 then raise exception 'Retenção não pode ser negativa.' using errcode = 'check_violation', hint = 'retencoes'; end if;
  if v_iss + v_irrf + v_inss + v_fed + v_out > v_valor then
    raise exception 'As retenções (%) passam do valor pago (%).', brl(v_iss + v_irrf + v_inss + v_fed + v_out), brl(v_valor) using errcode = 'check_violation', hint = 'retencoes';
  end if;
  if v_out > 0 and nullif(btrim(r ->> 'outras_descricao'), '') is null then
    raise exception 'Descreva a outra retenção.' using errcode = 'check_violation', hint = 'outras_descricao';
  end if;
  select coalesce(sum(valor), 0) into v_pago from nota_pagamentos where nota_id = n.id and cancelado_em is null;
  if v_pago + v_valor > n.valor then
    raise exception 'O pagamento ultrapassa o valor da nota: faltam % para quitar.', brl(n.valor - v_pago) using errcode = 'check_violation', hint = 'valor';
  end if;
  -- ordem cronológica (art. 141 da Lei 14.133/2021): pagar antes de nota mais antiga da mesma fonte exige justificativa
  select count(*) into v_frente from notas_a_frente(n.id);
  if v_frente > 0 and coalesce(length(v_just), 0) < 15 then
    raise exception 'Há % nota(s) atestada(s) antes desta, da mesma fonte de recurso, aguardando pagamento. Para pagar fora da ordem cronológica, registre a justificativa (art. 141, § 1º).', v_frente
      using errcode = 'check_violation', hint = 'justificativa_ordem';
  end if;
  insert into nota_pagamentos (tenant_id, nota_id, data_pagamento, valor, documento, observacao,
      retencao_iss, retencao_irrf, retencao_inss, retencao_federais, retencao_outras, retencao_outras_descricao, justificativa_ordem)
  values (n.tenant_id, n.id, v_data, v_valor, nullif(btrim(p ->> 'documento'), ''), nullif(btrim(p ->> 'observacao'), ''),
      v_iss, v_irrf, v_inss, v_fed, v_out, nullif(btrim(r ->> 'outras_descricao'), ''), case when v_frente > 0 then v_just end)
  returning id into v_id;
  perform atualizar_status_pagamento(n.id);
  return v_id;
end $$;

-- A função antiga passa a usar as mesmas regras (sem retenções)
create or replace function public.registrar_pagamento(p_nota uuid, p_data date, p_valor numeric, p_documento text default null, p_observacao text default null)
returns uuid
language sql security definer set search_path = public as $$
  select baixar_pagamento(jsonb_build_object('nota_id', p_nota, 'data_pagamento', p_data, 'valor', p_valor, 'documento', p_documento, 'observacao', p_observacao))
$$;

-- =====================================================================
-- Fila de pagamentos e pagamentos realizados (tela da administração)
-- =====================================================================

create function public.fila_pagamentos(p_tenant uuid) returns table (
  nota_id uuid, numero text, serie text, fornecedor_nome text, contrato_numero text, empenho text, valor numeric, pago numeric, restante numeric,
  status_pagamento text, atestado_em timestamptz, dias_aguardando int, fonte_id uuid, fonte text, posicao int, unidade_id uuid
)
language sql stable security definer set search_path = public as $$
  with base as (
    select n.*, nota_atestada_em(n.id) as atestada, cl.fonte_id as fonte, coalesce(fo.codigo || ' – ' || fo.descricao, '—') as fonte_texto,
           e.numero || '/' || e.ano as empenho_txt, coalesce(f.razao_social, f.nome_fantasia) as fornecedor, c.numero as contrato_num,
           coalesce((select sum(pg.valor) from nota_pagamentos pg where pg.nota_id = n.id and pg.cancelado_em is null), 0) as pago_v
      from notas_fiscais n
      join empenhos e on e.id = n.empenho_id
      join classificacoes_orcamentarias cl on cl.id = e.classificacao_id
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

create function public.pagamentos_realizados(p_tenant uuid, p_inicio date, p_fim date, p_busca text default null) returns table (
  pagamento_id uuid, nota_id uuid, numero text, fornecedor_nome text, contrato_numero text, data_pagamento date, valor numeric,
  retencao_iss numeric, retencao_irrf numeric, retencao_inss numeric, retencao_federais numeric, retencao_outras numeric,
  retencao_outras_descricao text, valor_liquido numeric, documento text, justificativa_ordem text, registrado_por text, registrado_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select pg.id, n.id, n.numero, coalesce(f.razao_social, f.nome_fantasia), c.numero, pg.data_pagamento, pg.valor,
         pg.retencao_iss, pg.retencao_irrf, pg.retencao_inss, pg.retencao_federais, pg.retencao_outras, pg.retencao_outras_descricao,
         pg.valor_liquido, pg.documento, pg.justificativa_ordem, coalesce(pf.nome, pf.email), pg.registrado_em
    from nota_pagamentos pg
    join notas_fiscais n on n.id = pg.nota_id
    join contratos c on c.id = n.contrato_id
    join fornecedores f on f.id = n.fornecedor_id
    left join perfis pf on pf.id = pg.registrado_por
   where pg.tenant_id = p_tenant and pg.cancelado_em is null
     and pg.data_pagamento between p_inicio and p_fim
     and (n.tenant_id, n.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('notas_fiscais', 'ler') a)
     and (nullif(btrim(p_busca), '') is null
          or lower(n.numero || ' ' || coalesce(f.razao_social, '') || ' ' || coalesce(f.nome_fantasia, '') || ' ' || c.numero || ' ' || coalesce(pg.documento, ''))
             like '%' || lower(btrim(p_busca)) || '%')
   order by pg.data_pagamento desc, pg.registrado_em desc
$$;

-- Visão das notas: quem pode atestar, data do atesto e total retido

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
    ((nf.contrato_id IN ( SELECT contratos_designados() AS contratos_designados))
      OR (nf.criado_por = auth.uid()
          AND COALESCE(( SELECT tc.permitir_atesto_lancador FROM tenant_configuracoes tc WHERE tc.tenant_id = nf.tenant_id), true)
          AND ((nf.tenant_id, nf.unidade_id) IN ( SELECT a.tenant_id, a.unidade_id FROM unidades_acessiveis('notas_fiscais'::text, 'editar'::text) a(tenant_id, unidade_id))))) AS posso_atestar,
    ( SELECT min(a.atestado_em) FROM nota_atestos a WHERE a.nota_id = nf.id) AS atestado_em,
    COALESCE(( SELECT sum(p.valor - p.valor_liquido) FROM nota_pagamentos p WHERE p.nota_id = nf.id AND p.cancelado_em IS NULL), 0::numeric) AS retido
   FROM notas_fiscais nf
     JOIN contratos c ON c.id = nf.contrato_id
     JOIN fornecedores f ON f.id = nf.fornecedor_id
     JOIN empenhos e ON e.id = nf.empenho_id
     LEFT JOIN tipos_servico ts ON ts.id = nf.tipo_servico_id
  WHERE ((nf.tenant_id, nf.unidade_id) IN ( SELECT a.tenant_id,
            a.unidade_id
           FROM unidades_acessiveis('notas_fiscais'::text, 'ler'::text) a(tenant_id, unidade_id))) OR (nf.contrato_id IN ( SELECT contratos_designados() AS contratos_designados));

-- Checklist: textos do atesto e da baixa

create or replace function public.emitir_checklist_nota(p_nota uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare n record; v_id uuid; v_dados jsonb; v_textos jsonb; v_inicio date; v_fim date; v_dotacao_ok boolean;
begin
  if not nota_legivel(p_nota) then raise exception 'Nota fiscal não encontrada.' using errcode = 'insufficient_privilege'; end if;
  select * into n from v_notas where id = p_nota;
  select coalesce(textos, '{}') into v_textos from tenant_configuracoes where tenant_id = n.tenant_id;
  select data_inicio, contrato_fim_atual(id) into v_inicio, v_fim from contratos where id = n.contrato_id;
  select exists (select 1 from empenhos e join contrato_dotacoes cd on cd.contrato_id = e.contrato_id and cd.classificacao_id = e.classificacao_id
                  where e.id = n.empenho_id) into v_dotacao_ok;
  v_dados := jsonb_build_object(
    'orgao', cabecalho_orgao(n.tenant_id),
    'titulo', coalesce(nullif(btrim(v_textos ->> 'checklist_titulo'), ''), 'CHECKLIST DE NOTA FISCAL'),
    'nota', jsonb_build_object('numero', n.numero, 'serie', n.serie, 'data_emissao', n.data_emissao, 'valor', n.valor,
              'meses', n.meses_referencia, 'periodo_inicio', n.periodo_inicio, 'periodo_fim', n.periodo_fim,
              'processo', n.processo_administrativo, 'status_atesto', n.status_atesto, 'status_pagamento', n.status_pagamento, 'pago', n.pago),
    'contrato', (select jsonb_build_object('numero', c.numero, 'objeto', c.objeto, 'inicio', v_inicio, 'fim', v_fim) from contratos c where c.id = n.contrato_id),
    'fornecedor', (select jsonb_build_object('nome', coalesce(f.razao_social, f.nome_fantasia), 'documento', f.documento, 'tipo', f.tipo_pessoa)
                     from contratos c join fornecedores f on f.id = c.fornecedor_id where c.id = n.contrato_id),
    'empenho', (select jsonb_build_object('numero', e.numero, 'ano', e.ano, 'classificacao', e.classificacao_codigo, 'saldo', e.saldo) from v_empenhos e where e.id = n.empenho_id),
    'unidades', coalesce((select jsonb_agg(ua.nome order by ua.nome) from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = p_nota), '[]'),
    'responsaveis', coalesce((select jsonb_agg(jsonb_build_object('papel', d.papel, 'nome', s.nome, 'matricula', s.matricula) order by d.papel)
                     from contrato_designacoes d join servidores s on s.id = d.servidor_id where d.contrato_id = n.contrato_id and d.fim is null), '[]'),
    'atesto', (select jsonb_build_object('nome', a.servidor_nome, 'papel', a.papel, 'em', a.atestado_em) from nota_atestos a where a.nota_id = p_nota order by a.atestado_em desc limit 1),
    'verificacoes', jsonb_build_array(
      jsonb_build_object('item', 'Nota emitida dentro da vigência do contrato', 'ok', n.data_emissao between v_inicio and v_fim),
      jsonb_build_object('item', 'Empenho do mesmo contrato, com dotação vinculada ao contrato', 'ok', v_dotacao_ok),
      jsonb_build_object('item', 'Saldo do empenho suficiente no registro', 'ok', n.excecao_saldo is null,
                         'detalhe', case when n.excecao_saldo is not null then 'Exceção justificada: ' || n.excecao_saldo end),
      jsonb_build_object('item', 'Mês(es) de referência informado(s)', 'ok', coalesce(n.meses_referencia, '') <> ''),
      jsonb_build_object('item', 'Atesto registrado (gestor, fiscal, suplente ou quem lançou a nota)', 'ok', n.status_atesto = 'ATESTADA'),
      jsonb_build_object('item', 'Pagamento registrado (baixa)', 'ok', n.status_pagamento = 'PAGO',
                         'detalhe', case n.status_pagamento when 'PARCIAL' then 'Pagamento parcial' end)),
    'itens_manuais', coalesce(v_textos -> 'checklist_itens', jsonb_build_array(
      'Nota fiscal emitida com os dados do órgão contratante',
      'Certidões de regularidade fiscal e trabalhista válidas',
      'Relatório, medição ou comprovação do serviço/fornecimento anexada',
      'Valores conferidos com o contrato e o empenho')),
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now());
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (n.tenant_id, n.unidade_id, 'CHECKLIST_NOTA', p_nota, 'Checklist da NF ' || n.numero, v_dados)
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function public.nota_atestada_em(uuid), public.nota_fonte(uuid), public.notas_a_frente(uuid),
  public.baixar_pagamento(jsonb), public.fila_pagamentos(uuid), public.pagamentos_realizados(uuid, date, date, text) from public, anon;
revoke execute on function public.nota_atestada_em(uuid), public.nota_fonte(uuid), public.notas_a_frente(uuid) from authenticated;
grant execute on function public.baixar_pagamento(jsonb), public.fila_pagamentos(uuid), public.pagamentos_realizados(uuid, date, date, text) to authenticated;
