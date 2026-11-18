-- Relatório mensal de custos por unidade de saúde (pedido do setor financeiro: "informações de custos das
-- unidades", enviado até o dia 25 de cada mês, detalhado por unidade e contrato).
--
-- Cada nota fiscal não cancelada é distribuída:
--   * por MÊS: pelos meses de referência (competência) da nota, em partes iguais; sem referência, o mês da emissão;
--   * por UNIDADE:
--       RATEIO          valor informado por unidade no rateio da nota;
--       UNICA           uma só unidade: o valor inteiro;
--       DIVIDIDA        várias unidades sem valores: partes iguais;
--       GRUPO           a unidade é um grupo (ex.: USF) sem as unidades informadas: fica no grupo;
--       LOCAL_ANTERIOR  nota migrada sem unidade: o local registrado no sistema anterior;
--       SEM_UNIDADE     nenhuma unidade informada.
-- O valor pago segue a mesma proporção. Acesso: o mesmo do relatório de notas (escopo ou designação).

create function public.relatorio_custos_unidades(p jsonb)
returns table (
  ano int, mes int, unidade_chave text, unidade_nome text, unidade_tipo text, unidade_grupo boolean,
  fornecedor_id uuid, fornecedor_nome text, fornecedor_documento text, fornecedor_tipo text,
  contrato_id uuid, contrato_numero text, contrato_objeto text,
  nota_id uuid, nota_numero text, data_emissao date, forma text, valor numeric, pago numeric
)
language sql stable security definer set search_path = public as $$
  with prm as materialized (
    select (p ->> 'tenant_id')::uuid as tenant,
           (p ->> 'ano')::int as ano,
           greatest(1, least(12, coalesce((p ->> 'mes_inicio')::int, 1))) as mes_ini,
           greatest(1, least(12, coalesce((p ->> 'mes_fim')::int, 12))) as mes_fim,
           filtro_ids(p, 'fornecedores') as fornecedores, filtro_ids(p, 'contratos') as contratos, filtro_ids(p, 'unidades') as unidades
  ),
  nf as (
    select n.*, coalesce((select sum(pg.valor) from nota_pagamentos pg where pg.nota_id = n.id and pg.cancelado_em is null), 0) as pago_total
      from notas_fiscais n, prm
     where n.tenant_id = prm.tenant and n.cancelada_em is null
       and ((n.tenant_id, n.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('relatorios', 'ler') a)
            or n.contrato_id in (select contratos_designados()))
       and (prm.fornecedores is null or n.fornecedor_id = any(prm.fornecedores))
       and (prm.contratos is null or n.contrato_id = any(prm.contratos))
  ),
  -- meses de competência de cada nota (sem referência: o mês da emissão)
  meses as (
    select n.id as nota_id, r.ano, r.mes, count(*) over (partition by n.id) as n_meses
      from nf n join nota_referencias r on r.nota_id = n.id
    union all
    select n.id, extract(year from n.data_emissao)::int, extract(month from n.data_emissao)::int, 1
      from nf n where not exists (select 1 from nota_referencias r where r.nota_id = n.id)
  ),
  -- unidades de cada nota e a fração do valor que cabe a cada uma
  uni as (
    select nu.nota_id, ua.id as unidade_id, ua.nome, ua.tipo, ua.eh_grupo, nu.valor as valor_rateio,
           count(*) over (partition by nu.nota_id) as n_unid,
           bool_and(nu.valor is not null) over (partition by nu.nota_id) as tem_rateio
      from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id
     where nu.nota_id in (select id from nf)
  ),
  partes as (
    select n.id as nota_id, u.unidade_id::text as chave, u.nome, u.tipo, u.eh_grupo,
           case when u.tem_rateio and n.valor > 0 then u.valor_rateio / n.valor else 1.0 / u.n_unid end as fracao,
           case when u.eh_grupo and not u.tem_rateio then 'GRUPO'
                when u.tem_rateio and u.n_unid > 1 then 'RATEIO'
                when u.n_unid = 1 then 'UNICA' else 'DIVIDIDA' end as forma
      from nf n join uni u on u.nota_id = n.id
    union all
    select n.id,
           coalesce('LOCAL:' || lower(l.local), 'SEM_UNIDADE'),
           coalesce(l.local, 'Sem unidade informada'), null, false, 1.0,
           case when l.local is not null then 'LOCAL_ANTERIOR' else 'SEM_UNIDADE' end
      from nf n
      cross join lateral (select nullif(btrim(substring(n.observacoes from 'Local no sistema anterior: ([^\n]+)')), '') as local) l
     where not exists (select 1 from uni u where u.nota_id = n.id)
  )
  select m.ano, m.mes, pt.chave, pt.nome, pt.tipo, pt.eh_grupo,
         n.fornecedor_id, coalesce(f.razao_social, f.nome_fantasia), f.documento, f.tipo_pessoa,
         n.contrato_id, c.numero, c.objeto,
         n.id, case when n.serie is not null then n.numero || '-' || n.serie else n.numero end, n.data_emissao, pt.forma,
         round(n.valor * pt.fracao / m.n_meses, 2), round(n.pago_total * pt.fracao / m.n_meses, 2)
    from nf n
    join meses m on m.nota_id = n.id
    join partes pt on pt.nota_id = n.id
    join contratos c on c.id = n.contrato_id
    join fornecedores f on f.id = n.fornecedor_id
    cross join prm
   where m.ano = prm.ano and m.mes between prm.mes_ini and prm.mes_fim
     and (prm.unidades is null or pt.chave = any(select x::text from unnest(prm.unidades) x))
   order by pt.nome, coalesce(f.razao_social, f.nome_fantasia), c.numero, m.ano, m.mes, n.data_emissao
$$;

revoke execute on function public.relatorio_custos_unidades(jsonb) from public, anon;
grant execute on function public.relatorio_custos_unidades(jsonb) to authenticated;
