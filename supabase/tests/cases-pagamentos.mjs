// Baixa de pagamento pela administração (retenções, data, ordem cronológica) e atesto por quem lançou a nota.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const adminC = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  const ct = (await one(`SELECT id FROM contratos WHERE tenant_id = $1 AND numero = '001/2026'`, [A])).id;
  const dot = (await one(`SELECT id FROM classificacoes_orcamentarias WHERE ente_id = (SELECT ente_id FROM tenants WHERE id = $1) AND codigo_completo = '0017.2090 | 39.16 | Fonte 1500'`, [A])).id;
  const emp = (await val(u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id) VALUES ($1, $2, '950', 2026, hoje(), 9000, $3) RETURNING id`, [A, ct, dot])).id;
  const nota = async (numero, valor) => (await val(u.adminCoinfra, `SELECT salvar_nota_fiscal($1) id`,
    [JSON.stringify({ empenho_id: emp, numero, valor, data_emissao: '2026-03-10', referencias: [{ ano: 2026, mes: 3 }] })])).id;
  const HOJE = (await one(`SELECT hoje()::text AS d`)).d;
  const texto = 'Estimado Gerente, após análise da documentação encaminhada para atesto, nota fiscal conferida.';

  console.log('Atesto por quem lançou a nota');
  const n1 = await nota('8101', 1000);
  const n2 = await nota('8102', 2000);
  check((await val(u.adminCoinfra, `SELECT posso_atestar FROM v_notas WHERE id = $1`, [n1])).posso_atestar === true, 'quem lançou vê o botão de atestar (posso_atestar)');
  check((await val(u.masterA, `SELECT posso_atestar FROM v_notas WHERE id = $1`, [n1])).posso_atestar === false, 'quem não lançou nem é designado não pode atestar');
  await expectFail('Master que não lançou a nota não atesta', u.masterA, `SELECT atestar_nota($1, $2)`, [n1, texto], /quem lançou/);
  await expectOk('administrativo que lançou a nota atesta', u.adminCoinfra, `SELECT atestar_nota($1, $2)`, [n1, texto]);
  const at = await one(`SELECT papel, servidor_nome FROM nota_atestos WHERE nota_id = $1`, [n1]);
  check(at.papel === 'LANCADOR' && !!at.servidor_nome, `atesto registrado com o papel "quem lançou" e o nome (${at.servidor_nome})`);
  await db.query(`SELECT pg_sleep(0.01)`);
  await expectOk('segunda nota atestada depois', u.adminCoinfra, `SELECT atestar_nota($1, $2)`, [n2, texto]);
  await expectFail('outro órgão não atesta', adminC, `SELECT atestar_nota($1, $2)`, [n2, texto]);

  console.log('Baixa de pagamento com retenções');
  const baixa = (quem, p) => as(quem, `SELECT baixar_pagamento($1) id`, [JSON.stringify(p)]);
  const fila = (await as(u.adminCoinfra, `SELECT * FROM fila_pagamentos($1)`, [A])).rows;
  const p1 = fila.find((r) => r.nota_id === n1); const p2 = fila.find((r) => r.nota_id === n2);
  check(p1 && p2 && p1.posicao < p2.posicao && p1.fonte === p2.fonte, `fila por fonte em ordem de atesto (posições ${p1?.posicao} e ${p2?.posicao})`);
  await expectFail('pagar a nota mais nova sem justificativa é recusado (art. 141)', u.adminCoinfra, `SELECT baixar_pagamento($1)`,
    [JSON.stringify({ nota_id: n2, data_pagamento: HOJE, valor: 2000 })], /ordem cronológica/);
  await expectFail('data futura é recusada', u.adminCoinfra, `SELECT baixar_pagamento($1)`,
    [JSON.stringify({ nota_id: n1, data_pagamento: '2099-01-01', valor: 1000, justificativa_ordem: 'Teste de data futura no pagamento' })], /futura/);
  await expectFail('data anterior ao atesto é recusada', u.adminCoinfra, `SELECT baixar_pagamento($1)`,
    [JSON.stringify({ nota_id: n1, data_pagamento: '2000-01-01', valor: 1000, justificativa_ordem: 'Teste de data anterior ao atesto' })], /anterior ao atesto/);
  await expectFail('retenções maiores que o valor pago são recusadas', u.adminCoinfra, `SELECT baixar_pagamento($1)`,
    [JSON.stringify({ nota_id: n1, data_pagamento: HOJE, valor: 100, retencoes: { iss: 80, irrf: 30 }, justificativa_ordem: 'Notas anteriores com pendência documental' })], /retenções/);
  await expectFail('outra retenção sem descrição é recusada', u.adminCoinfra, `SELECT baixar_pagamento($1)`,
    [JSON.stringify({ nota_id: n1, data_pagamento: HOJE, valor: 1000, retencoes: { outras: 10 }, justificativa_ordem: 'Notas anteriores com pendência documental' })], /Descreva/);
  await expectFail('perfil de consulta não dá baixa', u.dirAdm, `SELECT baixar_pagamento($1)`, [JSON.stringify({ nota_id: n1, data_pagamento: HOJE, valor: 1000 })], /permissão/);
  const frente = (await one(`SELECT count(*)::int n FROM notas_a_frente($1)`, [n1])).n;
  const pag1 = (await baixa(u.adminCoinfra, { nota_id: n1, data_pagamento: HOJE, valor: 1000, documento: 'OB 2026/001',
    retencoes: { iss: 50, irrf: 15, inss: 110, federais: 0 }, justificativa_ordem: frente ? 'Notas anteriores aguardam regularização documental da empresa' : '' })).rows[0].id;
  const r1 = await one(`SELECT valor, valor_liquido, retencao_iss, justificativa_ordem FROM nota_pagamentos WHERE id = $1`, [pag1]);
  check(Number(r1.valor) === 1000 && Number(r1.valor_liquido) === 825, `líquido calculado pelo banco: 1.000 − 175 de retenções = ${r1.valor_liquido}`);
  check(!!r1.justificativa_ordem === frente > 0, 'justificativa guardada só quando a nota furou a fila');
  check((await one(`SELECT status_pagamento FROM notas_fiscais WHERE id = $1`, [n1])).status_pagamento === 'PAGO', 'nota quitada pelo valor bruto (retenção conta como pago)');
  check(Number((await val(u.adminCoinfra, `SELECT retido FROM v_notas WHERE id = $1`, [n1])).retido) === 175, 'total retido na nota');
  const just = 'Pagamento urgente para não descontinuar o serviço essencial da rede de saúde';
  await expectOk('pagar fora da ordem com justificativa', u.adminCoinfra, `SELECT baixar_pagamento($1)`,
    [JSON.stringify({ nota_id: n2, data_pagamento: HOJE, valor: 500, retencoes: { iss: 25 }, justificativa_ordem: just })]);
  check((await one(`SELECT status_pagamento FROM notas_fiscais WHERE id = $1`, [n2])).status_pagamento === 'PARCIAL', 'pagamento parcial');
  const realizados = (await as(u.adminCoinfra, `SELECT * FROM pagamentos_realizados($1, $2::date, $2::date, null)`, [A, HOJE])).rows;
  check(realizados.some((r) => r.numero === '8101' && Number(r.valor_liquido) === 825) && realizados.some((r) => r.numero === '8102'), 'pagamentos realizados no período');
  check((await as(u.adminCoinfra, `SELECT * FROM pagamentos_realizados($1, $2::date, $2::date, 'OB 2026/001')`, [A, HOJE])).rows.length === 1, 'busca pelo documento (OB)');
  check((await as(adminC, `SELECT * FROM fila_pagamentos($1)`, [A])).rows.length === 0, 'outro órgão não vê a fila');
  check((await as(adminC, `SELECT * FROM pagamentos_realizados($1, '2000-01-01', '2100-01-01', null)`, [A])).rows.length === 0, 'outro órgão não vê os pagamentos');
  check((await one(`SELECT count(*)::int n FROM auditoria WHERE entidade = 'nota_pagamentos' AND registro_id = $1`, [pag1])).n >= 1, 'baixa registrada na auditoria');
  await expectOk('registrar_pagamento antigo continua funcionando (sem retenção)', u.adminCoinfra, `SELECT registrar_pagamento($1, $2::date, 100)`, [n2, HOJE]);
  check(Number((await one(`SELECT valor_liquido FROM nota_pagamentos WHERE nota_id = $1 ORDER BY registrado_em DESC LIMIT 1`, [n2])).valor_liquido) === 100, 'sem retenção, líquido = bruto');
}
