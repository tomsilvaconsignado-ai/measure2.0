// Desenvolvedor cadastra as classificações (inclusive a natureza de 8 dígitos); o administrador forma as dotações
// no contrato (várias) e no empenho escolhendo essas classificações.
export default async function ({ as, check, expectOk, expectFail, one, u, A }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const ente = (await one(`SELECT ente_id FROM tenants WHERE id = $1`, [A])).ente_id;
  const ct = (await one(`SELECT id FROM contratos WHERE tenant_id = $1 AND numero = '001/2026'`, [A])).id;
  const cl = async (tipo, codigo, paiCodigo) => (await one(`SELECT c.id FROM classificadores c LEFT JOIN classificadores p ON p.id = c.pai_id
    WHERE c.ente_id = $1 AND c.tipo = $2 AND c.codigo = $3 AND ($4::text IS NULL OR p.codigo = $4) LIMIT 1`, [ente, tipo, codigo, paiCodigo ?? null]))?.id;

  console.log('Natureza da despesa cadastrada sozinha (Desenvolvedor)');
  const nat = (await val(u.plat, `SELECT cadastrar_natureza($1, '3.3.90.30.00', 'Material de Consumo') id`, [ente])).id;
  check(!!nat && !!(await cl('ELEMENTO', '30')) && !!(await cl('MODALIDADE', '90')), 'natureza 33903000 cadastrada; categoria, grupo, modalidade e elemento desmembrados');
  check((await val(u.plat, `SELECT cadastrar_natureza($1, '33903000', 'Material de Consumo (corrigido)') id`, [ente])).id === nat, 'cadastrar de novo corrige a descrição, sem duplicar');
  await expectFail('natureza com subelemento no lugar é recusada', u.plat, `SELECT cadastrar_natureza($1, '33903014', 'X')`, [ente], /termina em 00/);
  await expectFail('órgão não cadastra natureza', u.masterA, `SELECT cadastrar_natureza($1, '33903600', 'Pessoa Física')`, [ente], /plataforma/);
  await expectFail('órgão não inclui natureza direto na tabela', u.masterA, `INSERT INTO naturezas_despesa (ente_id, codigo, descricao, categoria_id, gnd_id, modalidade_id, elemento_id) SELECT ente_id, '33903600', 'x', categoria_id, gnd_id, modalidade_id, elemento_id FROM naturezas_despesa WHERE id = $1`, [nat]);
  const n30 = (await as(u.adminCoinfra, `SELECT * FROM naturezas_do_orgao($1, '339030')`, [A])).rows.find((x) => x.codigo === '33903000');
  check(!!n30 && n30.descricao === 'Material de Consumo (corrigido)', 'a natureza aparece para o órgão escolher, mesmo sem nenhuma dotação');
  check((await as(u.adminCoinfra, `SELECT * FROM naturezas_do_orgao($1, '33903900')`, [A])).rows.length === 1, 'naturezas usadas em dotações também ficam no cadastro');

  console.log('Contrato: várias dotações formadas pelas classificações');
  const base = {
    contrato_id: ct, funcao_id: await cl('FUNCAO', '10'), subfuncao_id: await cl('SUBFUNCAO', '302'), programa_id: await cl('PROGRAMA', '0086'),
    acao_id: await cl('ACAO', '2099'), categoria_economica_id: n30.categoria_id, gnd_id: n30.gnd_id, modalidade_id: n30.modalidade_id,
    elemento_id: n30.elemento_id, fonte_id: await cl('FONTE', '16000000'),
  };
  const add = (quem, p) => as(quem, `SELECT adicionar_dotacao_contrato($1) id`, [JSON.stringify(p)]);
  const d1 = (await add(u.adminCoinfra, base)).rows[0].id;
  const r1 = await one(`SELECT exercicio, codigo_completo FROM classificacoes_orcamentarias WHERE id = $1`, [d1]);
  check(r1.exercicio === null && r1.codigo_completo === '10.302.0086.2099 | 33903000 | Fonte 16000000', `dotação formada no contrato (${r1.codigo_completo}), válida para todos os exercícios`);
  const d2 = (await add(u.adminCoinfra, { ...base, fonte_id: await cl('FONTE', '27490000') })).rows[0].id;
  const d3 = (await add(u.adminCoinfra, { ...base, exercicio: 2027, programa_id: await cl('PROGRAMA', '0085'), acao_id: await cl('ACAO', '2091') })).rows[0].id;
  await expectFail('ação de outro programa é recusada', u.adminCoinfra, `SELECT adicionar_dotacao_contrato($1)`, [JSON.stringify({ ...base, acao_id: await cl('ACAO', '2091') })], /não pertence ao programa/);
  const doContrato = (await as(u.adminCoinfra, `SELECT id FROM v_contrato_dotacoes WHERE contrato_id = $1 AND id = ANY($2)`, [ct, [d1, d2, d3]])).rows;
  check(doContrato.length === 3, 'o contrato recebe várias dotações (outra fonte, outra ação, outro exercício)');
  await expectFail('a mesma dotação duas vezes no contrato é recusada', u.adminCoinfra, `SELECT adicionar_dotacao_contrato($1)`, [JSON.stringify(base)], /já está no contrato/);
  await expectFail('subelemento de outra natureza é recusado', u.adminCoinfra, `SELECT adicionar_dotacao_contrato($1)`,
    [JSON.stringify({ ...base, subelemento_id: await cl('SUBELEMENTO', '16', '39') })], /não pertence/);
  await expectFail('perfil de consulta não altera dotações do contrato', u.dirAdm, `SELECT adicionar_dotacao_contrato($1)`, [JSON.stringify(base)], /permissão/);
  const de = (await val(u.adminCoinfra, `SELECT dotacao_do_empenho($1) id`, [JSON.stringify({ ...base, exercicio: 2026 })])).id;
  check(de === d1, 'o empenho com as mesmas classificações usa a dotação já formada no contrato');
  await expectOk('empenho gravado com a dotação do contrato', u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id)
    VALUES ($1, $2, '10230099', 2026, hoje(), 1000, $3)`, [A, ct, de]);
}
