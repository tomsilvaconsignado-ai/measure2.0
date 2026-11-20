-- Painel gerencial no estilo de dashboard financeiro: filtros de exercício, meses e coordenação
-- (como as segmentações de uma planilha) e as séries dos gráficos, tudo calculado no banco.
-- O escopo é o de quem consulta: as views v_contratos, v_empenhos e v_notas já filtram pelo acesso.
--   mensal    notas lançadas e pagamentos por mês, e o estoque a pagar no fim de cada mês
--   espera    notas ainda não pagas por tempo desde a emissão (atestadas x aguardando atesto)
--   execucao  saldo dos empenhos do exercício no fim de cada mês (empenhado - notas)
--   top_fornecedores / top_acoes  rankings do período filtrado

create function public.painel_gerencial(p_tenant uuid, p_ano int, p_meses int[] default null, p_unidade uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with recursive arvore as (
         select id from unidades_organizacionais where id = p_unidade and tenant_id = p_tenant
         union all
         select u.id from unidades_organizacionais u join arvore a on u.pai_id = a.id),
       ct as (select * from v_contratos where tenant_id = p_tenant and ativo
                and (p_unidade is null or unidade_id in (select id from arvore))),
       nf_todas as (select * from v_notas where tenant_id = p_tenant and cancelada_em is null
                and (p_unidade is null or unidade_id in (select id from arvore))),
       -- notas do período (exercício pela data de emissão + meses escolhidos)
       nf as (select * from nf_todas where extract(year from data_emissao) = p_ano
                and (p_meses is null or extract(month from data_emissao)::int = any (p_meses))),
       em as (select * from v_empenhos where tenant_id = p_tenant and ativo and ano = p_ano
                and (p_unidade is null or unidade_id in (select id from arvore))),
       pg as (select p.valor, p.valor_liquido, p.data_pagamento from nota_pagamentos p
                where p.cancelado_em is null and p.nota_id in (select id from nf_todas)
                  and extract(year from p.data_pagamento) = p_ano),
       meses as (select m, (make_date(p_ano, m, 1) + interval '1 month' - interval '1 day')::date fim from generate_series(1, 12) m),
       aberto as (select n.status_atesto, n.valor - n.pago resta, hoje() - n.data_emissao dias from nf_todas n
                where n.status_pagamento in ('PENDENTE', 'PARCIAL') and n.valor - n.pago > 0)
  select jsonb_build_object(
    'ano', p_ano,
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'sigla', u.sigla, 'nome', u.nome) order by coalesce(u.sigla, u.nome))
                  from unidades_organizacionais u where u.id in (select unidade_id from v_contratos where tenant_id = p_tenant and ativo)), '[]'),
    'indicadores', jsonb_build_object(
      'contratos_vigentes', (select count(*) from ct where situacao in ('VIGENTE', 'A_VENCER')),
      'contratos_a_vencer', (select count(*) from ct where situacao = 'A_VENCER'),
      'contratos_vencidos', (select count(*) from ct where situacao = 'VENCIDO'),
      'valor_vigentes', coalesce((select sum(valor_atual) from ct where situacao in ('VIGENTE', 'A_VENCER')), 0),
      'empenhado', coalesce((select sum(valor_total) from em), 0),
      'saldo_empenhos', coalesce((select sum(saldo) from em), 0),
      'empenhos_saldo_baixo', (select count(*) from em where valor_total > 0 and saldo / valor_total < 0.10),
      'notas_quantidade', (select count(*) from nf),
      'notas_valor', coalesce((select sum(valor) from nf), 0),
      'pago_bruto', coalesce((select sum(valor) from pg where p_meses is null or extract(month from data_pagamento)::int = any (p_meses)), 0),
      'pago_liquido', coalesce((select sum(valor_liquido) from pg where p_meses is null or extract(month from data_pagamento)::int = any (p_meses)), 0),
      'a_pagar', coalesce((select sum(resta) from aberto), 0),
      'pendentes_atesto', (select count(*) from nf_todas where status_atesto = 'PENDENTE'),
      'pendentes_pagamento', (select count(*) from nf_todas where status_atesto = 'ATESTADA' and status_pagamento in ('PENDENTE', 'PARCIAL'))),
    'mensal', (select jsonb_agg(jsonb_build_object(
        'mes', m.m,
        'lancado', coalesce((select sum(valor) from nf_todas where extract(year from data_emissao) = p_ano and extract(month from data_emissao) = m.m), 0),
        'pago', coalesce((select sum(valor) from pg where extract(month from data_pagamento) = m.m), 0),
        -- estoque a pagar no fim do mês: lançado até ali menos pago até ali (notas do exercício)
        'a_pagar', greatest(0, coalesce((select sum(valor) from nf_todas where extract(year from data_emissao) = p_ano and data_emissao <= m.fim), 0)
                              - coalesce((select sum(p.valor) from nota_pagamentos p join nf_todas n on n.id = p.nota_id
                                           where p.cancelado_em is null and extract(year from n.data_emissao) = p_ano and p.data_pagamento <= m.fim), 0)))
        order by m.m) from meses m),
    'execucao', (select jsonb_agg(jsonb_build_object(
        'mes', m.m,
        'saldo', coalesce((select sum(valor) from em where data_empenho <= m.fim), 0)
               + coalesce((select sum(r.valor) from empenho_reforcos r where r.cancelado_em is null and r.empenho_id in (select id from em) and r.data <= m.fim), 0)
               - coalesce((select sum(n.valor) from nf_todas n where n.empenho_id in (select id from em) and n.data_emissao <= m.fim), 0))
        order by m.m) from meses m),
    'espera', (select jsonb_agg(jsonb_build_object('faixa', f.rotulo,
        'atestadas', coalesce((select sum(resta) from aberto where status_atesto = 'ATESTADA' and dias between f.de and f.ate), 0),
        'sem_atesto', coalesce((select sum(resta) from aberto where status_atesto <> 'ATESTADA' and dias between f.de and f.ate), 0))
        order by f.ordem)
      from (values (1, '0-15', -100000, 15), (2, '16-30', 16, 30), (3, '31-60', 31, 60), (4, '61-90', 61, 90), (5, '91-120', 91, 120), (6, '120+', 121, 100000))
             f(ordem, rotulo, de, ate)),
    'top_fornecedores', coalesce((select jsonb_agg(x order by x.valor desc) from (
        select fornecedor_nome as nome, sum(valor) as valor from nf group by 1 order by 2 desc limit 7) x), '[]'),
    'top_acoes', coalesce((select jsonb_agg(x order by x.valor desc) from (
        select cd.acao_codigo as codigo, cd.acao_descricao as descricao, sum(n.valor) as valor
          from nf n join empenhos e on e.id = n.empenho_id join classificacao_detalhada cd on cd.id = e.classificacao_id
         group by 1, 2 order by 3 desc limit 10) x), '[]'),
    'vencendo', coalesce((select jsonb_agg(x order by x.data_fim_atual) from (
        select id, numero, fornecedor_nome, data_fim_atual, dias_para_vencer, saldo from ct
         where situacao = 'A_VENCER' order by data_fim_atual limit 6) x), '[]')
  )
$$;

revoke execute on function public.painel_gerencial(uuid, int, int[], uuid) from public, anon;
grant execute on function public.painel_gerencial(uuid, int, int[], uuid) to authenticated;
