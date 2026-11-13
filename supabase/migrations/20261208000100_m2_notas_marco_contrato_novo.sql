-- M2 CONSTRUÇÕES: notas 34 e 35 (referência 03/2026) de volta ao contrato 011/2023 (renovação 03, desde 20/03/2026).
--
-- A correção 20261205000200 levou as duas para o 011/2023 (02) porque não têm período de serviço e o mês da
-- referência é o da troca de contrato (a regra usou o dia 15). No sistema anterior elas eram do contrato novo:
-- a observação do 011/2023 registra "foi utilizado saldo no valor de R$ 3.682,99 do contrato anterior", e
-- 1.020.178,23 − (notas do 011/2023 (02) sem a 34 e a 35) = 3.682,99 exatamente. A nota 36 (também 03/2026)
-- continua no 011/2023 (02), também conforme essa conta. Empenho, pagamentos e atesto não mudam. Idempotente.

do $$
declare v_novo uuid; v_antigo uuid; v_qtd int;
begin
  select c.id into v_novo from public.contratos c join public.fornecedores f on f.id = c.fornecedor_id
   where c.numero = '011/2023' and f.razao_social ilike 'M2 CONSTRU%';
  select c.id into v_antigo from public.contratos c join public.fornecedores f on f.id = c.fornecedor_id
   where c.numero = '011/2023 (02)' and f.razao_social ilike 'M2 CONSTRU%';
  if v_novo is null or v_antigo is null then
    raise notice 'Contratos da M2 não encontrados; nada a fazer.';
    return;
  end if;
  perform usar_justificativa('Correção da migração: notas 34 e 35 (03/2026) são do contrato 011/2023, conforme o saldo de R$ 3.682,99 do contrato anterior no sistema antigo.', 0);
  perform set_config('measure.nota_rpc', 'sim', true);
  update public.notas_fiscais n
     set contrato_id = v_novo, unidade_id = (select unidade_id from public.contratos where id = v_novo)
   where n.contrato_id = v_antigo and n.cancelada_em is null
     and n.numero in ('34', '35') and n.valor in (112992.82, 24308.13);
  get diagnostics v_qtd = row_count;
  perform set_config('measure.nota_rpc', '', true);
  raise notice 'Notas devolvidas ao 011/2023: %', v_qtd;
end $$;
