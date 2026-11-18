// Termo de Referência do contrato e OS por modelo (extintores) com documento oficial.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  console.log('Termo de Referência e OS de extintores');
  const ct = await one(`SELECT c.id, c.unidade_id FROM contratos c WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  const emp = await one(`SELECT id FROM empenhos WHERE contrato_id = $1 LIMIT 1`, [ct.id]);
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  const ua = (await one(`INSERT INTO unidades_atendidas (tenant_id, nome, tipo) VALUES ($1, 'USF Teste Extintor', 'USF') RETURNING id`, [A])).id;

  const item = (await expectOk('administrativo cadastra item do TR', u.adminCoinfra,
    `INSERT INTO contrato_tr_itens (contrato_id, item, descricao, tipo, especificacao, quantidade, valor_unitario)
     VALUES ($1, 1, 'Manutenção e recarga de extintores - ABC 8 kg', 'ABC 8 kg', '4-A/40-B:C', 211, 59.83) RETURNING id, valor_total, tenant_id`, [ct.id])).rows[0];
  check(Number(item.valor_total) === 12624.13 && item.tenant_id === A, 'valor total calculado (211 × R$ 59,83 = R$ 12.624,13)');
  await expectOk('edita o valor unitário', u.adminCoinfra, `UPDATE contrato_tr_itens SET valor_unitario = 60 WHERE id = $1`, [item.id]);
  await expectFail('quem só consulta não edita o TR', u.dirAdm, `INSERT INTO contrato_tr_itens (contrato_id, item, descricao, quantidade, valor_unitario) VALUES ($1, 2, 'Item x', 1, 1)`, [ct.id]);
  await expectOk('plataforma cadastra item do TR', u.plat, `INSERT INTO contrato_tr_itens (contrato_id, item, descricao, quantidade, valor_unitario) VALUES ($1, 2, 'Item da plataforma', 2, 10)`, [ct.id]);
  await expectOk('unidade atendida no TR, com endereço', u.adminCoinfra, `INSERT INTO contrato_tr_unidades (contrato_id, unidade_atendida_id, endereco) VALUES ($1, $2, 'Rua A, 1')`, [ct.id, ua]);
  await expectFail('excluir (inativar) sem motivo é recusado', u.adminCoinfra, `UPDATE contrato_tr_itens SET ativo = false WHERE item = 2 AND contrato_id = $1`, [ct.id], /motivo/);

  // OS de extintores
  const os = (await expectOk('abre OS no modelo extintores', u.adminCoinfra,
    `INSERT INTO ordens_servico (tenant_id, unidade_id, numero, ano, titulo, contrato_id, modelo, empenho_id)
     VALUES ($1, $2, 0, 0, 'Recarga de extintores', $3, 'EXTINTORES', $4) RETURNING id`, [A, coinfra.id, ct.id, emp.id])).rows[0].id;
  await expectFail('emitir sem linhas é recusado', u.adminCoinfra, `SELECT emitir_ordem_servico($1)`, [os], /ao menos uma linha/);
  await expectFail('linha com serviço de outro contrato é recusada', u.adminCoinfra, `SELECT salvar_os_itens($1, $2)`,
    [os, JSON.stringify([{ unidade_atendida_id: ua, tr_item_id: '00000000-0000-0000-0000-000000000999', quantidade: 1 }])], /Termo de Referência/);
  await expectOk('salva as linhas da OS', u.adminCoinfra, `SELECT salvar_os_itens($1, $2)`,
    [os, JSON.stringify([{ unidade_atendida_id: ua, tr_item_id: item.id, quantidade: 5, data_solicitacao: '2026-11-10' }])]);
  const linha = await one(`SELECT tipo, especificacao, valor_unitario FROM os_itens WHERE os_id = $1`, [os]);
  check(linha.tipo === 'ABC 8 kg' && linha.especificacao === '4-A/40-B:C' && Number(linha.valor_unitario) === 60, 'tipo, capacidade e preço vêm do TR');
  const tr = (await as(u.adminCoinfra, `SELECT * FROM tr_itens_do_contrato($1) WHERE item = 1`, [ct.id])).rows[0];
  check(Number(tr.solicitado) === 5 && Number(tr.saldo) === 206, 'TR mostra o já solicitado em OS e o saldo (211 − 5)');

  const doc = (await expectOk('gera o documento da OS', u.adminCoinfra, `SELECT emitir_ordem_servico($1) id`, [os])).rows[0].id;
  const d = await one(`SELECT tipo, titulo, dados FROM documentos_emitidos WHERE id = $1`, [doc]);
  check(d.tipo === 'ORDEM_SERVICO' && /^ORDEM DE SERVIÇO Nº \d{4}\/\d{4}$/.test(d.titulo), 'documento ORDEM DE SERVIÇO Nº NNNN/ANO');
  check(d.dados.itens.length === 1 && d.dados.itens[0].unidade === 'USF Teste Extintor' && d.dados.contrato.numero && d.dados.fornecedor.nome && d.dados.empenho,
    'documento traz contrato, fornecedor, empenho e as linhas');
  const lidos = (await as(u.adminCoinfra, `SELECT count(*)::int n FROM documentos_emitidos WHERE id = $1`, [doc])).rows[0].n;
  check(lidos === 1, 'quem vê a OS lê o documento emitido');
  const fora = (await as(u.adminB, `SELECT count(*)::int n FROM documentos_emitidos WHERE id = $1`, [doc])).rows[0].n;
  check(fora === 0, 'outro órgão não lê o documento da OS');
  await db.exec('RESET ROLE');
}
