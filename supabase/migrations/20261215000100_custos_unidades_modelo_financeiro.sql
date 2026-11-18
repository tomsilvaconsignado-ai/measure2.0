-- Relatório de custos por unidade: mesmas informações do modelo usado hoje pela coordenação no envio ao
-- setor financeiro ("Relatório Mensal de Gastos por Unidade de Saúde"):
--   * por empresa/contrato: vigência, valor global (atual), saldo restante e objeto;
--   * por nota: referência (meses), unidade/local da nota e situação do pagamento;
--   * filtro por coordenação (a unidade responsável pelo contrato e o que está abaixo dela).
-- A regra de distribuição por mês e por unidade é a mesma de 20261214000100.

drop function public.relatorio_custos_unidades(jsonb);

create function public.relatorio_custos_unidades(p jsonb)
returns table (
  ano int, mes int, unidade_chave text, unidade_nome text, unidade_tipo text, unidade_grupo boolean,
  fornecedor_id uuid, fornecedor_nome text, fornecedor_documento text, fornecedor_tipo text,
  contrato_id uuid, contrato_numero text, contrato_objeto text,
  contrato_inicio date, contrato_fim date, contrato_valor numeric, contrato_saldo numeric, contrato_unidade text,
  nota_id uuid, nota_numero text, data_emissao date, nota_referencias text, nota_local text, nota_valor numeric, status_pagamento text,
  forma text, valor numeric, pago numeric
)
language sql stable security definer set search_path = public as $$
  with prm as materialized (
    select (p ->> 'tenant_id')::uuid as tenant,
           (p ->> 'ano')::int as ano,
           greatest(1, least(12, coalesce((p ->> 'mes_inicio')::int, 1))) as mes_ini,
           greatest(1, least(12, coalesce((p ->> 'mes_fim')::int, 12))) as mes_fim,
           filtro_ids(p, 'fornecedores') as fornecedores, filtro_ids(p, 'contratos') as contratos,
           filtro_ids(p, 'unidades') as unidades, filtro_ids(p, 'coordenacoes') as coordenacoes
  ),
  nf as (
    select n.*, coalesce((select sum(pg.valor) from nota_pagamentos pg where pg.nota_id = n.id and pg.cancelado_em is null), 0) as pago_total
      from notas_fiscais n, prm
     where n.tenant_id = prm.tenant and n.cancelada_em is null
       and ((n.tenant_id, n.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('relatorios', 'ler') a)
            or n.contrato_id in (select contratos_designados()))
       and (prm.fornecedores is null or n.fornecedor_id = any(prm.fornecedores))
       and (prm.contratos is null or n.contrato_id = any(prm.contratos))
       and (prm.coordenacoes is null or exists (
             select 1 from contratos c join unidades_organizacionais u on u.id = c.unidade_id
              where c.id = n.contrato_id and u.caminho && prm.coordenacoes))
  ),
  meses as (
    select n.id as nota_id, r.ano, r.mes, count(*) over (partition by n.id) as n_meses
      from nf n join nota_referencias r on r.nota_id = n.id
    union all
    select n.id, extract(year from n.data_emissao)::int, extract(month from n.data_emissao)::int, 1
      from nf n where not exists (select 1 from nota_referencias r where r.nota_id = n.id)
  ),
  uni as (
    select nu.nota_id, ua.id as unidade_id, ua.nome, ua.tipo, ua.eh_grupo, nu.valor as valor_rateio,
           count(*) over (partition by nu.nota_id) as n_unid,
           bool_and(nu.valor is not null) over (partition by nu.nota_id) as tem_rateio
      from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id
     where nu.nota_id in (select id from nf)
  ),
  local_anterior as (
    select n.id as nota_id, nullif(btrim(substring(n.observacoes from 'Local no sistema anterior: ([^\n]+)')), '') as local from nf n
  ),
  partes as (
    select n.id as nota_id, u.unidade_id::text as chave, u.nome, u.tipo, u.eh_grupo,
           case when u.tem_rateio and n.valor > 0 then u.valor_rateio / n.valor else 1.0 / u.n_unid end as fracao,
           case when u.eh_grupo and not u.tem_rateio then 'GRUPO'
                when u.tem_rateio and u.n_unid > 1 then 'RATEIO'
                when u.n_unid = 1 then 'UNICA' else 'DIVIDIDA' end as forma
      from nf n join uni u on u.nota_id = n.id
    union all
    select n.id, coalesce('LOCAL:' || lower(l.local), 'SEM_UNIDADE'), coalesce(l.local, 'Sem unidade informada'), null, false, 1.0,
           case when l.local is not null then 'LOCAL_ANTERIOR' else 'SEM_UNIDADE' end
      from nf n join local_anterior l on l.nota_id = n.id
     where not exists (select 1 from uni u where u.nota_id = n.id)
  ),
  ct as (
    select c.id, contrato_fim_atual(c.id) as fim, contrato_valor_atual(c.id) as valor_atual,
           contrato_valor_atual(c.id) - coalesce((select sum(x.valor) from notas_fiscais x where x.contrato_id = c.id and x.cancelada_em is null), 0) as saldo,
           coalesce(u.sigla, u.nome) as unidade
      from contratos c join unidades_organizacionais u on u.id = c.unidade_id
     where c.id in (select contrato_id from nf)
  )
  select m.ano, m.mes, pt.chave, pt.nome, pt.tipo, pt.eh_grupo,
         n.fornecedor_id, coalesce(f.razao_social, f.nome_fantasia), f.documento, f.tipo_pessoa,
         n.contrato_id, c.numero, c.objeto, c.data_inicio, ct.fim, ct.valor_atual, ct.saldo, ct.unidade,
         n.id, case when n.serie is not null then n.numero || '-' || n.serie else n.numero end, n.data_emissao,
         (select string_agg(lpad(r.mes::text, 2, '0') || '/' || r.ano, ', ' order by r.ano, r.mes) from nota_referencias r where r.nota_id = n.id),
         coalesce((select string_agg(u.nome, ', ' order by u.nome) from uni u where u.nota_id = n.id),
                  (select l.local from local_anterior l where l.nota_id = n.id), 'Sem unidade informada'),
         n.valor, n.status_pagamento, pt.forma,
         round(n.valor * pt.fracao / m.n_meses, 2), round(n.pago_total * pt.fracao / m.n_meses, 2)
    from nf n
    join meses m on m.nota_id = n.id
    join partes pt on pt.nota_id = n.id
    join contratos c on c.id = n.contrato_id
    join ct on ct.id = n.contrato_id
    join fornecedores f on f.id = n.fornecedor_id
    cross join prm
   where m.ano = prm.ano and m.mes between prm.mes_ini and prm.mes_fim
     and (prm.unidades is null or pt.chave = any(select x::text from unnest(prm.unidades) x))
   order by coalesce(f.razao_social, f.nome_fantasia), c.numero, pt.nome, m.ano, m.mes, n.data_emissao
$$;

revoke execute on function public.relatorio_custos_unidades(jsonb) from public, anon;
grant execute on function public.relatorio_custos_unidades(jsonb) to authenticated;
