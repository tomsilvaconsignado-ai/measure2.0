-- Painel: série mensal passa a trazer também o valor pago e a quantidade de notas (gráficos comparativos do painel).
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
    'mensal', coalesce((select jsonb_agg(jsonb_build_object('mes', m, 'notas', coalesce(v, 0), 'pago', coalesce(pg, 0), 'quantidade', coalesce(qt, 0)) order by m)
                 from generate_series(1, 12) m
                 left join (select extract(month from data_emissao)::int mes, sum(valor) v, sum(pago) pg, count(*) qt from nf
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
