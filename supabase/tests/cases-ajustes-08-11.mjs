// Ajustes de 08/11/2026: "entra nos consolidados", editar/excluir nota sem cancelar e sigla das unidades no atesto.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');

  console.log('Servidores: entra nos consolidados?');
  const sim = (await as(u.adminCoinfra, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, data_nomeacao)
    VALUES ($1, $2, 'Consolidado Sim Teste', 'CS-01', '2026-01-02') RETURNING id, entra_consolidado`, [A, coinfra.id])).rows[0];
  const nao = (await as(u.adminCoinfra, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, data_nomeacao)
    VALUES ($1, $2, 'Consolidado Nao Teste', 'CN-02', '2026-01-02') RETURNING id`, [A, coinfra.id])).rows[0];
  check(sim.entra_consolidado === true, 'servidor novo nasce com SIM');
  const antes = await one(`SELECT nome, matricula, unidade_id, data_nomeacao FROM servidores WHERE id = $1`, [nao.id]);
  await expectOk('administrativo marca NÃO', u.adminCoinfra, `UPDATE servidores SET entra_consolidado = false WHERE id = $1`, [nao.id]);
  const depois = await one(`SELECT nome, matricula, unidade_id, data_nomeacao, entra_consolidado FROM servidores WHERE id = $1`, [nao.id]);
  check(depois.entra_consolidado === false && depois.nome === antes.nome && depois.matricula === antes.matricula
    && depois.unidade_id === antes.unidade_id && String(depois.data_nomeacao) === String(antes.data_nomeacao), 'a marcação não mexe nos demais dados');
  await expectFail('coordenador (só consulta) não altera a marcação', u.coordCoinfra, `UPDATE servidores SET entra_consolidado = true WHERE id = $1`, [nao.id]);
  const ids = (await as(u.adminCoinfra, `SELECT servidor_id FROM consolidado_mensal($1, $2, 2026, 3)`, [A, coinfra.id])).rows.map((r) => r.servidor_id);
  check(ids.includes(sim.id), 'servidor com SIM aparece no consolidado');
  check(!ids.includes(nao.id), 'servidor com NÃO fica fora do consolidado');
  const doc = (await as(u.adminCoinfra, `SELECT emitir_consolidado($1, $2, 2026, 3) id`, [A, coinfra.id])).rows[0].id;
  const texto = JSON.stringify((await one(`SELECT dados FROM documentos_emitidos WHERE id = $1`, [doc])).dados);
  check(texto.includes('Consolidado Sim Teste') && !texto.includes('Consolidado Nao Teste'), 'documento emitido segue a marcação');
  check((await one(`SELECT count(*)::int n FROM servidores WHERE id = $1`, [nao.id])).n === 1, 'servidor com NÃO continua cadastrado');
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE entidade = 'servidores' AND registro_id = $1 AND 'entra_consolidado' = ANY(campos_alterados)`, [nao.id])),
    'mudança da marcação registrada na auditoria');

  console.log('Notas fiscais: editar e excluir sem cancelar');
  await db.exec('RESET ROLE');
  const ct = await one(`SELECT c.id, c.unidade_id, c.fornecedor_id, e.id AS empenho FROM contratos c JOIN empenhos e ON e.contrato_id = c.id AND e.ativo
                         WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  const saldoAntes = Number((await one(`SELECT empenho_saldo($1) s`, [ct.empenho])).s);
  const ua = (await as(u.adminCoinfra, `INSERT INTO unidades_atendidas (tenant_id, nome, sigla, tipo) VALUES ($1, 'Unidade Saúde da Família Teste', 'USF-T', 'USF') RETURNING id`, [A])).rows[0].id;
  const dados = (extra) => JSON.stringify({ empenho_id: ct.empenho, numero: 'ED-1', valor: 1.5, data_emissao: '2026-10-05', referencias: [{ ano: 2026, mes: 10 }], unidades: [{ id: ua }], ...extra });
  const nf = (await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1) id`, [dados({})])).rows[0].id;
  await expectOk('administrativo edita a nota sem cancelar', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [dados({ id: nf, numero: 'ED-1A', valor: 1.25, observacoes: 'corrigida', referencias: [{ ano: 2026, mes: 9 }] })]);
  const ed = await one(`SELECT numero, valor, observacoes, cancelada_em FROM notas_fiscais WHERE id = $1`, [nf]);
  check(ed.numero === 'ED-1A' && Number(ed.valor) === 1.25 && ed.observacoes === 'corrigida' && ed.cancelada_em === null, 'dados corrigidos, nota segue ativa');
  check((await one(`SELECT ano, mes FROM nota_referencias WHERE nota_id = $1`, [nf])).mes === 9, 'referência corrigida');
  check(Math.abs(Number((await one(`SELECT empenho_saldo($1) s`, [ct.empenho])).s) - (saldoAntes - 1.25)) < 0.001, 'saldo do empenho acompanha o valor editado');
  const vu = (await as(u.adminCoinfra, `SELECT sigla, nome, tipo FROM v_nota_unidades WHERE nota_id = $1`, [nf])).rows[0];
  check(vu && vu.sigla === 'USF-T' && vu.tipo === 'USF', 'unidades da nota trazem a sigla para o atesto');

  await expectFail('coordenador (só consulta) não exclui', u.coordCoinfra, `SELECT excluir_nota($1, 'Lançada por engano')`, [nf], /permissão/);
  await expectFail('exclusão exige motivo', u.adminCoinfra, `SELECT excluir_nota($1, '')`, [nf], /motivo/);
  check((await as(u.adminCoinfra, `SELECT impedimento_exclusao_nota($1) i`, [nf])).rows[0].i === null, 'nota limpa pode ser excluída');
  await expectOk('administrativo exclui a nota limpa', u.adminCoinfra, `SELECT excluir_nota($1, 'Lançada em duplicidade')`, [nf]);
  check((await one(`SELECT count(*)::int n FROM notas_fiscais WHERE id = $1`, [nf])).n === 0, 'nota removida');
  check((await one(`SELECT count(*)::int n FROM nota_referencias WHERE nota_id = $1`, [nf])).n === 0
    && (await one(`SELECT count(*)::int n FROM nota_unidades WHERE nota_id = $1`, [nf])).n === 0, 'meses e unidades da nota removidos junto');
  const aud = await one(`SELECT antes, justificativa FROM auditoria WHERE entidade = 'notas_fiscais' AND registro_id = $1 AND acao = 'DELETE'`, [nf]);
  check(aud && aud.antes.numero === 'ED-1A' && aud.justificativa === 'Lançada em duplicidade', 'auditoria guarda a cópia da nota e o motivo');
  check(Math.abs(Number((await one(`SELECT empenho_saldo($1) s`, [ct.empenho])).s) - saldoAntes) < 0.001, 'saldo do empenho volta ao valor anterior');
  await expectOk('o número volta a poder ser lançado', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [dados({ numero: 'ED-1A' })]);

  // com vínculos: atestada, paga ou cancelada não sai
  await db.exec('RESET ROLE');
  const atestada = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto)
    VALUES ($1, $2, $3, $4, $5, 'ED-AT', '2026-10-06', 1.00, 'ATESTADA') RETURNING id`, [A, ct.id, ct.empenho, ct.unidade_id, ct.fornecedor_id])).id;
  const serv = await one(`SELECT id FROM servidores WHERE tenant_id = $1 LIMIT 1`, [A]);
  await db.query(`INSERT INTO nota_atestos (tenant_id, nota_id, servidor_id, user_id, papel, texto) VALUES ($1, $2, $3, $4, 'FISCAL', 'Atesto de teste')`,
    [A, atestada, serv.id, u.adminCoinfra]);
  await expectFail('nota atestada não é excluída', u.adminCoinfra, `SELECT excluir_nota($1, 'Tentativa de exclusão')`, [atestada], /atestada/);
  await db.exec('RESET ROLE');
  await db.query(`INSERT INTO nota_pagamentos (tenant_id, nota_id, data_pagamento, valor, registrado_por, cancelado_em) VALUES ($1, $2, '2026-10-10', 1.00, $3, now())`,
    [A, atestada, u.adminCoinfra]);
  check(/atestada/.test((await as(u.adminCoinfra, `SELECT impedimento_exclusao_nota($1) i`, [atestada])).rows[0].i), 'tela recebe o motivo do impedimento');
  const paga = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, data_emissao, valor)
    VALUES ($1, $2, $3, $4, $5, 'ED-PG', '2026-10-06', 1.00) RETURNING id`, [A, ct.id, ct.empenho, ct.unidade_id, ct.fornecedor_id])).id;
  await db.query(`INSERT INTO nota_pagamentos (tenant_id, nota_id, data_pagamento, valor, registrado_por, cancelado_em) VALUES ($1, $2, '2026-10-10', 1.00, $3, now())`,
    [A, paga, u.adminCoinfra]);
  await expectFail('nota com pagamento (mesmo cancelado) não é excluída', u.adminCoinfra, `SELECT excluir_nota($1, 'Tentativa de exclusão')`, [paga], /pagamento/);

  const cancelar = (await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1) id`, [dados({ numero: 'ED-CN' })])).rows[0].id;
  await expectOk('cancelamento continua funcionando', u.adminCoinfra, `SELECT cancelar_nota($1, 'Serviço não prestado')`, [cancelar]);
  const cn = await one(`SELECT cancelada_em, status_pagamento, motivo_cancelamento FROM notas_fiscais WHERE id = $1`, [cancelar]);
  check(cn.cancelada_em !== null && cn.status_pagamento === 'CANCELADA' && cn.motivo_cancelamento === 'Serviço não prestado', 'nota cancelada fica registrada com o motivo');
  await expectFail('nota cancelada não é excluída', u.adminCoinfra, `SELECT excluir_nota($1, 'Tentativa de exclusão')`, [cancelar], /cancelada/);
  await expectFail('nota cancelada não é editada', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [dados({ id: cancelar, numero: 'ED-CN' })], /cancelada/);

  // nota migrada sem empenho: corrige os dados e continua sem empenho
  await db.exec('RESET ROLE');
  const mig = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, unidade_id, fornecedor_id, numero, data_emissao, valor)
    VALUES ($1, $2, $3, $4, 'ED-MIG', '2025-03-01', 2.00) RETURNING id`, [A, ct.id, ct.unidade_id, ct.fornecedor_id])).id;
  await expectOk('nota migrada sem empenho pode ser editada', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ id: mig, numero: 'ED-MIG2', valor: 2, data_emissao: '2025-03-02', referencias: [{ ano: 2025, mes: 3 }] })]);
  const m = await one(`SELECT numero, empenho_id FROM notas_fiscais WHERE id = $1`, [mig]);
  check(m.numero === 'ED-MIG2' && m.empenho_id === null, 'continua sem empenho depois da edição');
  await db.exec('RESET ROLE');
}
