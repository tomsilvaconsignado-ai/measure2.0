-- MEASURE 2.0 — visões de contratos/empenhos/notas para designados
--
-- Problema: com security_invoker, as visões juntavam fornecedores e unidades pelo RLS de quem
-- consulta. Um servidor designado fiscal (papel SERVIDOR) não lê o cadastro de fornecedores nem a
-- coordenação do contrato, então a linha sumia do resultado e ele não via o próprio contrato.
--
-- Solução: as visões rodam com o dono (security_invoker = false) e filtram EXPLICITAMENTE quem
-- pode ver cada linha (escopo pela matriz OU designação). Totais ficam exatos para todos.

create or replace view public.v_contratos with (security_invoker = false) as
select c.*,
       coalesce(f.razao_social, f.nome_fantasia) as fornecedor_nome, f.nome_fantasia as fornecedor_fantasia,
       f.documento as fornecedor_documento, f.tipo_pessoa as fornecedor_tipo,
       u.nome as unidade_nome, u.sigla as unidade_sigla,
       x.aditivos_valor, c.valor_global + x.aditivos_valor as valor_atual,
       x.fim_atual as data_fim_atual,
       coalesce(e.empenhado, 0) as empenhado,
       coalesce(n.notas, 0) as notas_valor,
       coalesce(n.pago, 0) as pago,
       c.valor_global + x.aditivos_valor - coalesce(n.notas, 0) as saldo,
       case when hoje() < c.data_inicio then 'NAO_INICIADO'
            when hoje() > x.fim_atual then 'VENCIDO'
            when x.fim_atual - hoje() <= coalesce((select max(d) from tenant_configuracoes tc, unnest(tc.alerta_vencimento_dias) d where tc.tenant_id = c.tenant_id), 30) then 'A_VENCER'
            else 'VIGENTE' end as situacao,
       x.fim_atual - hoje() as dias_para_vencer,
       (select count(*) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO') as aditivos_aprovados
  from contratos c
  join fornecedores f on f.id = c.fornecedor_id
  join unidades_organizacionais u on u.id = c.unidade_id
  cross join lateral (
    select coalesce((select sum(a.valor) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO'), 0) as aditivos_valor,
           greatest(c.data_fim, coalesce((select max(a.nova_data_fim) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO'), c.data_fim)) as fim_atual
  ) x
  left join lateral (
    select sum(em.valor + coalesce((select sum(r.valor) from empenho_reforcos r where r.empenho_id = em.id and r.cancelado_em is null), 0)) as empenhado
      from empenhos em where em.contrato_id = c.id and em.ativo
  ) e on true
  left join lateral (
    select sum(nf.valor) as notas,
           sum((select coalesce(sum(p.valor), 0) from nota_pagamentos p where p.nota_id = nf.id and p.cancelado_em is null)) as pago
      from notas_fiscais nf where nf.contrato_id = c.id and nf.cancelada_em is null
  ) n on true
 where pode(c.tenant_id, c.unidade_id, 'contratos', 'ler') or designado(c.id);

create or replace view public.v_empenhos with (security_invoker = false) as
select e.*,
       c.numero as contrato_numero, c.objeto as contrato_objeto,
       coalesce(f.razao_social, f.nome_fantasia) as fornecedor_nome,
       cl.codigo_completo as classificacao_codigo,
       coalesce(r.reforcos, 0) as reforcos,
       e.valor + coalesce(r.reforcos, 0) as valor_total,
       coalesce(n.utilizado, 0) as utilizado,
       e.valor + coalesce(r.reforcos, 0) - coalesce(n.utilizado, 0) as saldo
  from empenhos e
  join contratos c on c.id = e.contrato_id
  join fornecedores f on f.id = e.fornecedor_id
  join classificacoes_orcamentarias cl on cl.id = e.classificacao_id
  left join lateral (select sum(valor) as reforcos from empenho_reforcos where empenho_id = e.id and cancelado_em is null) r on true
  left join lateral (select sum(valor) as utilizado from notas_fiscais where empenho_id = e.id and cancelada_em is null) n on true
 where pode(e.tenant_id, e.unidade_id, 'empenhos', 'ler') or designado(e.contrato_id);

create or replace view public.v_notas with (security_invoker = false) as
select nf.*,
       c.numero as contrato_numero, c.objeto as contrato_objeto,
       coalesce(f.razao_social, f.nome_fantasia) as fornecedor_nome, f.documento as fornecedor_documento,
       e.numero as empenho_numero, e.ano as empenho_ano,
       ts.nome as tipo_servico_nome,
       coalesce((select sum(p.valor) from nota_pagamentos p where p.nota_id = nf.id and p.cancelado_em is null), 0) as pago,
       (select string_agg(lpad(mes::text, 2, '0') || '/' || ano, ', ' order by ano, mes) from nota_referencias r where r.nota_id = nf.id) as meses_referencia,
       designado(nf.contrato_id) as sou_designado
  from notas_fiscais nf
  join contratos c on c.id = nf.contrato_id
  join fornecedores f on f.id = nf.fornecedor_id
  join empenhos e on e.id = nf.empenho_id
  left join tipos_servico ts on ts.id = nf.tipo_servico_id
 where pode(nf.tenant_id, nf.unidade_id, 'notas_fiscais', 'ler') or designado(nf.contrato_id);

-- Dotações do contrato e unidades da nota, com os nomes, para quem vê o contrato/a nota
create view public.v_contrato_dotacoes with (security_invoker = false) as
select cd.contrato_id, cl.id, cl.codigo_completo, cl.descricao, cl.ativo
  from contrato_dotacoes cd join classificacoes_orcamentarias cl on cl.id = cd.classificacao_id
 where pode_contrato(cd.contrato_id, 'ler') or designado(cd.contrato_id);

create view public.v_nota_unidades with (security_invoker = false) as
select nu.nota_id, nu.valor, ua.id as unidade_id, ua.nome, ua.tipo, ua.eh_grupo
  from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id
 where nota_legivel(nu.nota_id);

grant select on public.v_contratos, public.v_empenhos, public.v_notas, public.v_contrato_dotacoes, public.v_nota_unidades to authenticated;
revoke all on public.v_contratos, public.v_empenhos, public.v_notas, public.v_contrato_dotacoes, public.v_nota_unidades from anon;
