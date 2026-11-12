-- Correção dos dados migrados: notas no contrato errado da cadeia de renovação.
--
-- Na migração do sistema anterior, as notas foram todas para o contrato mais novo do fornecedor, mesmo as
-- de meses da vigência anterior (ex.: BIOTECNO 027/2023 com saldo negativo e 027/2023 (02), vencido, sem
-- nenhuma nota). Aqui cada nota vai para o contrato da cadeia (mesmo órgão, fornecedor e número-base) cuja
-- vigência contém a competência dela:
--   * meio do período de serviço (período início/fim);
--   * sem período completo: o início do período;
--   * sem período: dia 15 do primeiro mês de referência;
--   * sem referência: a data de emissão.
-- Só mexe na nota cuja competência está FORA da vigência do contrato atual e DENTRO da de outro contrato da
-- cadeia. O empenho, os pagamentos, o atesto e as referências não mudam. A unidade da nota acompanha a do
-- contrato. Cada alteração fica na auditoria com a justificativa abaixo. Idempotente.

do $$
declare v_qtd int;
begin
  perform usar_justificativa('Correção da migração: nota levada para o contrato da cadeia de renovação cuja vigência contém a competência dela.', 0);
  perform set_config('measure.nota_rpc', 'sim', true);

  with cf as (
    select c.id, c.tenant_id, c.fornecedor_id, c.unidade_id, c.data_inicio, contrato_fim_atual(c.id) as fim,
           contrato_numero_base(c.numero) as base
      from contratos c
  ),
  nf as (
    select n.id, n.contrato_id,
           case when n.periodo_inicio is not null and n.periodo_fim is not null then n.periodo_inicio + (n.periodo_fim - n.periodo_inicio) / 2
                when n.periodo_inicio is not null then n.periodo_inicio
                else coalesce((select make_date(r.ano, r.mes, 15) from nota_referencias r where r.nota_id = n.id order by r.ano, r.mes limit 1),
                              n.data_emissao)
           end as competencia
      from notas_fiscais n
     where n.cancelada_em is null
  ),
  mov as (
    select n.id, destino.id as contrato_id, destino.unidade_id
      from nf n
      join cf atual on atual.id = n.contrato_id
      join lateral (
        select c2.id, c2.unidade_id from cf c2
         where c2.tenant_id = atual.tenant_id and c2.fornecedor_id = atual.fornecedor_id and c2.base = atual.base
           and c2.id <> atual.id and n.competencia between c2.data_inicio and c2.fim
         order by c2.data_inicio desc limit 1
      ) destino on true
     where n.competencia not between atual.data_inicio and atual.fim
  )
  update notas_fiscais nf
     set contrato_id = mov.contrato_id, unidade_id = mov.unidade_id
    from mov
   where nf.id = mov.id;
  get diagnostics v_qtd = row_count;
  perform set_config('measure.nota_rpc', '', true);
  raise notice 'Notas levadas ao contrato da vigência: %', v_qtd;
end $$;
