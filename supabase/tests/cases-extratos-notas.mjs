// Extratos de notas do contrato (modelo do Controle Interno): retrato com pago, líquido, retido, unidade e rateio
// de cada nota; a unidade vem das unidades atendidas (ou do local migrado); só quem lê o contrato emite.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  const ct = await one(`SELECT c.id, c.unidade_id, c.fornecedor_id FROM contratos c WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  const ua = async (nome, tipo) => (await one(`INSERT INTO unidades_atendidas (tenant_id, nome, tipo) VALUES ($1, $2, $3) RETURNING id`, [A, nome, tipo])).id;
  const usf1 = await ua('USF Extrato Um', 'USF'), usf2 = await ua('USF Extrato Dois', 'USF'), sede = await ua('Sede Extrato', 'SEDE');
  const nota = async (numero, valor, obs = null) => (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto, observacoes)
    VALUES ($1, $2, $3, $4, $5, '2026-03-03', $6, 'ATESTADA', $7) RETURNING id`, [A, ct.id, ct.unidade_id, ct.fornecedor_id, numero, valor, obs])).id;
  const rateada = await nota('EXT-1', 100), unica = await nota('EXT-2', 50), migrada = await nota('EXT-3', 30, 'Local no sistema anterior: VIGILÂNCIA EPIDEMIOLÓGICA'),
    mista = await nota('EXT-4', 20), cancelada = await nota('EXT-5', 70);
  await db.query(`INSERT INTO nota_unidades (nota_id, unidade_atendida_id, valor, tenant_id) VALUES ($1, $2, 60, $5), ($1, $3, 40, $5), ($4, $6, 50, $5)`, [rateada, usf1, usf2, unica, A, sede]);
  await db.query(`INSERT INTO nota_unidades (nota_id, unidade_atendida_id, tenant_id) VALUES ($1, $2, $4), ($1, $3, $4)`, [mista, usf1, sede, A]);
  await db.query(`INSERT INTO nota_referencias (nota_id, ano, mes, tenant_id) VALUES ($1, 2026, 2, $2)`, [rateada, A]);
  await db.query(`INSERT INTO nota_pagamentos (tenant_id, nota_id, data_pagamento, valor, retencao_iss, registrado_por) VALUES ($1, $2, '2026-03-10', 100, 7.5, $3)`, [A, rateada, u.adminCoinfra]);
  await db.query(`UPDATE notas_fiscais SET cancelada_em = now(), motivo_cancelamento = 'teste', status_pagamento = 'CANCELADA' WHERE id = $1`, [cancelada]);

  console.log('Extratos de notas do contrato');
  await expectFail('modelo desconhecido é recusado', u.adminCoinfra, `SELECT emitir_extrato_notas($1, 'OUTRO')`, [ct.id], /inválido/);
  await expectFail('quem não lê o contrato não emite', u.adminB, `SELECT emitir_extrato_notas($1, 'EXTRATO_NOTAS')`, [ct.id], /não encontrado/);
  for (const m of ['EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO']) await expectOk(`emite ${m}`, u.adminCoinfra, `SELECT emitir_extrato_notas($1, '${m}')`, [ct.id]);
  const doc = (await as(u.adminCoinfra, `SELECT tipo, dados FROM documentos_emitidos WHERE registro_id = $1 AND tipo = 'EXTRATO_RATEIO' ORDER BY emitido_em DESC LIMIT 1`, [ct.id])).rows[0];
  check(!!doc, 'quem emitiu lê o extrato emitido');
  const n = Object.fromEntries((doc?.dados.notas ?? []).map((x) => [x.numero, x]));
  check(n['EXT-1']?.unidade === 'USF' && n['EXT-1'].rateio.length === 2, 'várias unidades do mesmo tipo: unidade = o tipo, com o rateio de cada uma');
  check(Number(n['EXT-1']?.pago) === 100 && Number(n['EXT-1'].liquido) === 92.5 && Number(n['EXT-1'].retido) === 7.5, 'pago bruto, líquido e retido da nota');
  check(n['EXT-1']?.referencia === 'Fevereiro/2026', 'mês de referência por extenso');
  check(n['EXT-2']?.unidade === 'Sede Extrato', 'uma só unidade: o nome dela');
  check(n['EXT-3']?.unidade === 'VIGILÂNCIA EPIDEMIOLÓGICA', 'nota migrada sem unidade: o local do sistema anterior');
  check(n['EXT-4']?.unidade === 'Diversas', 'unidades de tipos diferentes: "Diversas"');
  check(n['EXT-5']?.cancelada === true, 'nota cancelada vem marcada (fica fora dos totais na impressão)');
  check(doc?.dados.modelo === 'EXTRATO_RATEIO' && /RATEIO/.test(doc?.dados.titulo), 'retrato guarda o modelo e o título');
  await db.exec('RESET ROLE');
}
