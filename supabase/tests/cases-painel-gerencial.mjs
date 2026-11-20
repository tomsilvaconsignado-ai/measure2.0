// Painel gerencial com filtros (exercício, meses e coordenação): séries mensais, tempo de espera
// das notas a pagar, saldo dos empenhos e rankings, sempre no escopo de quem consulta.
export default async function ({ db, as, check, expectOk, one, u, A, coinfra, coaf }) {
  await db.exec('RESET ROLE');
  const ct = await one(`SELECT c.id, c.unidade_id, c.fornecedor_id, e.id AS empenho FROM contratos c JOIN empenhos e ON e.contrato_id = c.id AND e.ativo
                         WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  const ano = 2031;
  const nota = async (numero, data, valor, atesto = 'ATESTADA') => (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [A, ct.id, ct.empenho, ct.unidade_id, ct.fornecedor_id, numero, data, valor, atesto])).id;
  const jan = await nota('PG-1', `${ano}-01-10`, 100);
  await nota('PG-2', `${ano}-03-05`, 40, 'PENDENTE');
  await db.query(`INSERT INTO nota_pagamentos (tenant_id, nota_id, data_pagamento, valor, registrado_por) VALUES ($1, $2, $3, 60, $4)`, [A, jan, `${ano}-02-01`, u.adminCoinfra]);

  console.log('Painel gerencial com filtros');
  await expectOk('administrativo consulta o painel', u.adminCoinfra, `SELECT painel_gerencial($1, $2)`, [A, ano]);
  const p = (await as(u.adminCoinfra, `SELECT painel_gerencial($1, $2) p`, [A, ano])).rows[0].p;
  const mes = (m) => p.mensal.find((x) => x.mes === m);
  check(Number(mes(1).lancado) === 100 && Number(mes(3).lancado) === 40, 'lançado por mês de emissão');
  check(Number(mes(2).pago) === 60, 'pago por mês do pagamento');
  check(Number(mes(1).a_pagar) === 100 && Number(mes(2).a_pagar) === 40 && Number(mes(3).a_pagar) === 80, 'estoque a pagar no fim de cada mês');
  check(Number(p.indicadores.notas_valor) === 140 && Number(p.indicadores.pago_bruto) === 60, 'indicadores do exercício');
  check(p.espera.length === 6 && p.espera.some((f) => Number(f.atestadas) >= 40) && p.espera.some((f) => Number(f.sem_atesto) >= 40), 'notas a pagar por tempo de espera, atestadas e sem atesto');
  check(p.top_fornecedores.length >= 1 && p.unidades.some((x) => x.id === coinfra.id), 'ranking de fornecedores e lista de coordenações');

  const marco = (await as(u.adminCoinfra, `SELECT painel_gerencial($1, $2, ARRAY[3]) p`, [A, ano])).rows[0].p;
  check(Number(marco.indicadores.notas_valor) === 40 && Number(marco.indicadores.pago_bruto) === 0, 'filtro de mês restringe os indicadores');
  const outra = (await as(u.adminCoinfra, `SELECT painel_gerencial($1, $2, null, $3) p`, [A, ano, coaf.id])).rows[0].p;
  check(Number(outra.indicadores.notas_valor) === 0, 'filtro de coordenação restringe às notas dela');
  const fora = (await as(u.adminB, `SELECT painel_gerencial($1, $2) p`, [A, ano])).rows[0].p;
  check(Number(fora.indicadores.notas_valor) === 0 && fora.top_fornecedores.length === 0, 'quem é de outro órgão não vê os números');
  await db.exec('RESET ROLE');
}
