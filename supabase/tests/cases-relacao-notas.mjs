// Relação de notas (para responder ao fornecedor): por contrato ou por empresa, filtrando não pagas, pagas,
// faltando atesto ou todas; nota cancelada nunca entra; traz processo, valor pago e datas de pagamento;
// isolamento entre órgãos e escopo de unidade valem também na busca por empresa.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  const ct = await one(`SELECT c.id, c.numero, c.unidade_id, c.fornecedor_id FROM contratos c WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  const nota = async (numero, valor, atesto, pagamento, processo = null) => (await one(`INSERT INTO notas_fiscais
      (tenant_id, contrato_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto, status_pagamento, processo_administrativo)
    VALUES ($1, $2, $3, $4, $5, '2026-05-02', $6, $7, $8, $9) RETURNING id`, [A, ct.id, ct.unidade_id, ct.fornecedor_id, numero, valor, atesto, pagamento, processo])).id;
  const semAtesto = await nota('REL-1', 100, 'PENDENTE', 'PENDENTE', 'PROC-001/2026');
  const aPagar = await nota('REL-2', 200, 'ATESTADA', 'PENDENTE');
  const parcial = await nota('REL-3', 300, 'ATESTADA', 'PARCIAL');
  const paga = await nota('REL-4', 400, 'ATESTADA', 'PAGO', 'PROC-004/2026');
  const cancelada = await nota('REL-5', 500, 'ATESTADA', 'CANCELADA');
  await db.query(`UPDATE notas_fiscais SET cancelada_em = now(), motivo_cancelamento = 'teste' WHERE id = $1`, [cancelada]);
  const pagar = (id, data, valor, iss = 0) => db.query(`INSERT INTO nota_pagamentos (tenant_id, nota_id, data_pagamento, valor, retencao_iss, registrado_por)
    VALUES ($1, $2, $3, $4, $5, $6)`, [A, id, data, valor, iss, u.adminCoinfra]);
  await pagar(parcial, '2026-05-10', 120);
  await pagar(paga, '2026-05-12', 250, 10);
  await pagar(paga, '2026-05-20', 150);

  console.log('Relação de notas (por contrato ou empresa)');
  await expectFail('situação desconhecida é recusada', u.adminCoinfra, `SELECT emitir_relacao_notas('ATRASADAS', $1)`, [ct.id], /inválida/);
  await expectFail('sem contrato nem empresa é recusado', u.adminCoinfra, `SELECT emitir_relacao_notas('PAGAS')`, [], /contrato ou uma empresa/);
  await expectFail('contrato e empresa juntos é recusado', u.adminCoinfra, `SELECT emitir_relacao_notas('PAGAS', $1, $2)`, [ct.id, ct.fornecedor_id], /contrato ou uma empresa/);
  await expectFail('outro órgão não emite pelo contrato', u.adminB, `SELECT emitir_relacao_notas('TODAS', $1)`, [ct.id], /não encontrado/);
  await expectFail('outro órgão não emite pela empresa', u.adminB, `SELECT emitir_relacao_notas('TODAS', null, $1)`, [ct.fornecedor_id], /não encontrada/);

  const emitir = async (situacao, contrato, fornecedor) => {
    const id = (await expectOk(`emite ${situacao} por ${contrato ? 'contrato' : 'empresa'}`, u.adminCoinfra,
      `SELECT emitir_relacao_notas($1, $2, $3) AS id`, [situacao, contrato, fornecedor])).rows[0].id;
    return (await as(u.adminCoinfra, `SELECT tipo, titulo, dados FROM documentos_emitidos WHERE id = $1`, [id])).rows[0];
  };
  const nossas = (doc) => Object.fromEntries((doc?.dados.notas ?? []).filter((x) => x.numero.startsWith('REL-')).map((x) => [x.numero, x]));

  const naoPagas = await emitir('NAO_PAGAS', ct.id, null);
  check(naoPagas?.tipo === 'RELACAO_NOTAS' && /NÃO PAGAS/.test(naoPagas.dados.titulo), 'quem emitiu lê a relação, com o título da situação');
  check(Object.keys(nossas(naoPagas)).sort().join() === 'REL-1,REL-2,REL-3', 'não pagas: pendentes, parciais e as sem atesto; sem a paga e sem a cancelada');
  check(Number(nossas(naoPagas)['REL-3']?.pago) === 120 && nossas(naoPagas)['REL-3'].pagamentos.length === 1, 'parcial traz o valor já pago e a data');
  check(nossas(naoPagas)['REL-1']?.processo === 'PROC-001/2026' && nossas(naoPagas)['REL-1'].contrato === ct.numero, 'traz o processo e o número do contrato');

  const pagas = await emitir('PAGAS', ct.id, null);
  const p4 = nossas(pagas)['REL-4'];
  check(Object.keys(nossas(pagas)).join() === 'REL-4', 'pagas: só a paga por inteiro');
  check(Number(p4?.pago) === 400 && Number(p4.liquido) === 390, 'valor pago bruto e líquido (com retenção)');
  check(p4?.pagamentos.map((x) => x.data).join() === '2026-05-12,2026-05-20', 'datas de todos os pagamentos, em ordem');

  const atesto = await emitir('FALTANDO_ATESTO', ct.id, null);
  check(Object.keys(nossas(atesto)).join() === 'REL-1', 'faltando atesto: só a não atestada');

  const empresa = await emitir('TODAS', null, ct.fornecedor_id);
  check(Object.keys(nossas(empresa)).sort().join() === 'REL-1,REL-2,REL-3,REL-4', 'por empresa: todas as não canceladas dos contratos dela');
  check(empresa?.dados.filtro === 'EMPRESA' && !!empresa.dados.fornecedor.nome, 'retrato guarda o filtro e a empresa');

  // período (data de emissão): as notas acima são de 02/05/2026; esta é de julho
  await db.exec('RESET ROLE');
  await nota('REL-6', 600, 'PENDENTE', 'PENDENTE');
  await db.query(`UPDATE notas_fiscais SET data_emissao = '2026-07-15' WHERE numero = 'REL-6' AND contrato_id = $1`, [ct.id]);
  await expectFail('período sem o fim é recusado', u.adminCoinfra, `SELECT emitir_relacao_notas('TODAS', $1, null, '2026-05-01', null)`, [ct.id], /início e o fim/);
  await expectFail('período invertido é recusado', u.adminCoinfra, `SELECT emitir_relacao_notas('TODAS', $1, null, '2026-07-01', '2026-05-31')`, [ct.id], /depois do mês final/);
  const comPeriodo = async (inicio, fim) => {
    const id = (await expectOk(`emite com período ${inicio} a ${fim}`, u.adminCoinfra,
      `SELECT emitir_relacao_notas('TODAS', $1, null, $2, $3) AS id`, [ct.id, inicio, fim])).rows[0].id;
    return (await as(u.adminCoinfra, `SELECT titulo, dados FROM documentos_emitidos WHERE id = $1`, [id])).rows[0];
  };
  const maioJunho = await comPeriodo('2026-05-01', '2026-06-30');
  check(Object.keys(nossas(maioJunho)).sort().join() === 'REL-1,REL-2,REL-3,REL-4', 'maio a junho: só as emitidas no período (a de julho fica fora)');
  check(/MAIO A JUNHO\/2026/.test(maioJunho?.dados.titulo) && maioJunho.dados.periodo?.rotulo === 'MAIO A JUNHO/2026', 'título e retrato trazem o período');
  const julho = await comPeriodo('2026-07-01', '2026-07-31');
  check(Object.keys(nossas(julho)).join() === 'REL-6' && /JULHO\/2026/.test(julho.dados.titulo), 'só julho: a nota de julho, com "JULHO/2026" no título');
  const semPeriodo = await emitir('TODAS', ct.id, null);
  check(Object.keys(nossas(semPeriodo)).length === 5 && !semPeriodo.dados.periodo, 'sem período: todas as datas, como antes');

  // "Todos": todos os contratos (de todas as empresas) que a pessoa pode consultar no órgão
  const todosId = (await expectOk('emite TODOS (todos os contratos do órgão)', u.adminCoinfra,
    `SELECT emitir_relacao_notas('TODAS', null, null, null, null, $1) AS id`, [A])).rows[0].id;
  const todos = (await as(u.adminCoinfra, `SELECT titulo, dados FROM documentos_emitidos WHERE id = $1`, [todosId])).rows[0];
  check(Object.keys(nossas(todos)).length === 5 && todos.dados.filtro === 'TODOS' && /todos os contratos/.test(todos.titulo), 'todos: traz as notas dos contratos que a pessoa vê, marcado como TODOS');
  const outrosContratos = new Set((todos?.dados.notas ?? []).map((x) => x.contrato));
  check(outrosContratos.size >= 1 && todos.dados.fornecedor === null, 'todos: sem empresa fixa no cabeçalho');
  const todosMaio = (await expectOk('todos com período', u.adminCoinfra,
    `SELECT emitir_relacao_notas('TODAS', null, null, '2026-07-01', '2026-07-31', $1) AS id`, [A])).rows[0].id;
  const tm = (await as(u.adminCoinfra, `SELECT dados FROM documentos_emitidos WHERE id = $1`, [todosMaio])).rows[0];
  check(Object.keys(nossas(tm)).join() === 'REL-6', 'todos + período: só as do período');
  await expectFail('todos de outro órgão: nada a consultar', u.adminB, `SELECT emitir_relacao_notas('TODAS', null, null, null, null, $1)`, [A], /Nenhum contrato/);
  const coafTodos = await as(u.adminCoaf, `SELECT emitir_relacao_notas('TODAS', null, null, null, null, $1) AS id`, [A]).catch((e) => ({ erro: e.message }));
  if ('erro' in coafTodos) check(/Nenhum contrato/.test(coafTodos.erro), 'todos por outra coordenação: sem contratos visíveis');
  else {
    const d = (await as(u.adminCoaf, `SELECT dados FROM documentos_emitidos WHERE id = $1`, [coafTodos.rows[0].id])).rows[0];
    check(Object.keys(nossas(d)).length === 0, 'todos por outra coordenação: as notas da COINFRA não entram');
  }
  // proteção contra relação gigante (limite de 5.000 notas)
  await db.exec('RESET ROLE');
  await db.query(`INSERT INTO notas_fiscais (tenant_id, contrato_id, unidade_id, fornecedor_id, numero, data_emissao, valor)
    SELECT $1, $2, $3, $4, 'MASSA-' || g, '2020-01-01', 1 FROM generate_series(1, 5001) g`, [A, ct.id, ct.unidade_id, ct.fornecedor_id]);
  await expectFail('mais de 5.000 notas: pede para estreitar', u.adminCoinfra, `SELECT emitir_relacao_notas('TODAS', null, null, null, null, $1)`, [A], /limite é 5\.000/);
  await expectOk('com período, a mesma relação passa', u.adminCoinfra, `SELECT emitir_relacao_notas('TODAS', null, null, '2026-05-01', '2026-07-31', $1)`, [A]);
  // limpeza como dono do banco (a sessão ainda estava "como" o usuário do último teste)
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('measure.autoria_livre', 'sim', false)`);
  await db.query(`UPDATE notas_fiscais SET cancelada_em = now(), motivo_cancelamento = 'massa de teste' WHERE numero LIKE 'MASSA-%'`);
  await db.query(`SELECT set_config('measure.autoria_livre', '', false)`);

  // escopo: quem é de outra coordenação, buscando pela mesma empresa, não recebe as notas dos contratos da COINFRA
  const coafTenta = await as(u.adminCoaf, `SELECT emitir_relacao_notas('TODAS', null, $1) AS id`, [ct.fornecedor_id]).catch((e) => ({ erro: e.message }));
  if ('erro' in coafTenta) check(/não encontrada/.test(coafTenta.erro), 'outra coordenação sem contrato dessa empresa: empresa não encontrada');
  else {
    const d = (await as(u.adminCoaf, `SELECT dados FROM documentos_emitidos WHERE id = $1`, [coafTenta.rows[0].id])).rows[0];
    check(Object.keys(nossas(d)).length === 0, 'outra coordenação: as notas da COINFRA não entram na relação');
  }

  // a relação emitida não aparece para outro órgão
  const lidas = (await as(u.adminB, `SELECT count(*)::int n FROM documentos_emitidos WHERE tipo = 'RELACAO_NOTAS'`)).rows[0].n;
  check(lidas === 0, 'outro órgão não lê as relações emitidas');
  await db.exec('RESET ROLE');
}
