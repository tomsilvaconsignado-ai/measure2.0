// Notas migradas sem empenho: aparecem nas listas, na fila de pagamento e no relatório, e o empenho é
// completado depois por vincular_empenho_nota (só o que está vazio, do mesmo contrato, com regra de saldo).
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  await db.exec('RESET ROLE');
  const ct = await one(`SELECT c.id, c.unidade_id, c.fornecedor_id, e.id AS empenho FROM contratos c JOIN empenhos e ON e.contrato_id = c.id AND e.ativo
                         WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  const outro = await one(`SELECT e.id FROM empenhos e WHERE e.tenant_id = $1 AND e.contrato_id <> $2 LIMIT 1`, [A, ct.id]);

  console.log('Notas migradas sem empenho');
  // como a migração grava: direto no banco, atestada e sem empenho
  const nota = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto)
    VALUES ($1, $2, $3, $4, 'MIG-1', '2025-05-10', 10.00, 'ATESTADA') RETURNING id`, [A, ct.id, ct.unidade_id, ct.fornecedor_id])).id;
  const v = await val(u.adminCoinfra, `SELECT empenho_id, empenho_numero FROM v_notas WHERE id = $1`, [nota]);
  check(v && v.empenho_id === null && v.empenho_numero === null, 'nota sem empenho aparece na lista de notas');
  const fila = (await as(u.adminCoinfra, `SELECT empenho, fonte FROM fila_pagamentos($1) WHERE nota_id = $2`, [A, nota])).rows[0];
  check(fila && fila.empenho === null && /Sem empenho/.test(fila.fonte), 'atestada sem empenho entra na fila de pagamento, num grupo próprio');
  const rel = (await as(u.adminCoinfra, `SELECT empenho, ano FROM relatorio_notas($1) WHERE nota_id = $2`, [JSON.stringify({ tenant_id: A }), nota])).rows[0];
  check(rel && rel.empenho === 'Sem empenho' && rel.ano === 2025, 'relatório mostra a nota, com o ano da emissão');
  await expectFail('nota nova continua exigindo empenho', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ contrato_id: ct.id, numero: 'X-1', data_emissao: '2026-01-10', valor: 5, referencias: [{ ano: 2026, mes: 1 }] })], /empenho/);

  await expectFail('quem só consulta não vincula empenho', u.dirAdm, `SELECT vincular_empenho_nota($1, $2)`, [nota, ct.empenho], /permissão/);
  if (outro) await expectFail('empenho de outro contrato é recusado', u.adminCoinfra, `SELECT vincular_empenho_nota($1, $2)`, [nota, outro.id], /contrato da nota/);
  await expectOk('administrativo vincula o empenho do contrato', u.adminCoinfra, `SELECT vincular_empenho_nota($1, $2)`, [nota, ct.empenho]);
  check((await one(`SELECT empenho_id FROM notas_fiscais WHERE id = $1`, [nota])).empenho_id === ct.empenho, 'nota passa a ter o empenho');
  await expectFail('empenho já preenchido não é trocado por aqui', u.adminCoinfra, `SELECT vincular_empenho_nota($1, $2)`, [nota, ct.empenho], /já tem empenho/);
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE entidade = 'notas_fiscais' AND registro_id = $1 AND acao = 'UPDATE'`, [nota])), 'vínculo registrado na auditoria');

  const grande = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto)
    VALUES ($1, $2, $3, $4, 'MIG-2', '2025-05-11', 999999999.00, 'ATESTADA') RETURNING id`, [A, ct.id, ct.unidade_id, ct.fornecedor_id])).id;
  await expectFail('acima do saldo, exige justificativa', u.adminCoinfra, `SELECT vincular_empenho_nota($1, $2)`, [grande, ct.empenho], /justificativa/);
  await expectFail('acima do saldo, administrativo sem permissão de aprovar não vincula', u.adminCoinfra, `SELECT vincular_empenho_nota($1, $2, 'Nota do sistema anterior')`, [grande, ct.empenho], /aprovar/);
  await db.exec('RESET ROLE');
}
