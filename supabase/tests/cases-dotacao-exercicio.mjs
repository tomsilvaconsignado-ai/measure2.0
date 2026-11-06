// Dotação com exercício financeiro e unidade gestora: identificação automática por exercício,
// filtro por exercício, empenho só com dotação do mesmo exercício e dotações do contrato detalhadas.
export default async function ({ as, check, expectOk, expectFail, one, u, A }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const enteA = (await one(`SELECT ente_id FROM tenants WHERE id = $1`, [A])).ente_id;
  const ct = (await one(`SELECT id FROM contratos WHERE tenant_id = $1 AND numero = '001/2026'`, [A])).id;
  const campos = {
    unidade_gestora: { codigo: '184010', descricao: 'Fundo Municipal de Saúde – UG' },
    funcao: { codigo: '10', descricao: 'Saúde' },
    subfuncao: { codigo: '302', descricao: 'Assistência Hospitalar e Ambulatorial' },
    programa: { codigo: '0086', descricao: 'MÉDIA E ALTA COMPLEXIDADE' },
    acao: { codigo: '2099', descricao: 'Manutenção da Rede Hospitalar' },
    natureza: { codigo: '33903900', descricao: 'Outros Serviços de Terceiros - Pessoa Jurídica' },
    subelemento: { codigo: '33903916', descricao: 'Manutenção e Conservação de Bens Móveis' },
    fonte: { codigo: '16000000', descricao: 'Transferências Fundo a Fundo do SUS' },
  };
  const cad = async (p) => (await val(u.plat, `SELECT cadastrar_dotacao($1) r`, [JSON.stringify({ ente_id: enteA, campos, ...p })])).r;

  console.log('Dotação com exercício e unidade gestora');
  const d26 = await cad({ exercicio: 2026, descricao: 'Manutenção hospitalar 2026' });
  check(d26.criada && d26.exercicio === 2026, `dotação do exercício 2026 cadastrada (${d26.codigo_completo})`);
  check(d26.codigo_completo === '10.302.0086.2099 | 33903916 | Fonte 16000000', 'código completo no mesmo formato de antes (exercício e UG à parte)');
  const ug = await one(`SELECT c.tipo, c.codigo FROM classificacoes_orcamentarias d JOIN classificadores c ON c.id = d.unidade_gestora_id WHERE d.id = $1`, [d26.id]);
  check(ug.tipo === 'UNIDADE_GESTORA' && ug.codigo === '184010', 'unidade gestora guardada como classificador próprio');
  check((await cad({ exercicio: 2026 })).criada === false, 'mesma combinação no mesmo exercício é reconhecida (sem duplicar)');
  const d27 = await cad({ exercicio: '2027' });
  check(d27.criada && d27.id !== d26.id, 'a mesma combinação pode ser cadastrada para outro exercício (cópia para a LOA seguinte)');
  await expectFail('exercício inválido é recusado', u.plat, `SELECT cadastrar_dotacao($1)`, [JSON.stringify({ ente_id: enteA, campos, exercicio: '26' })], /Exercício/);
  const semEx = await cad({});
  check(semEx.criada && semEx.exercicio === null, 'sem exercício informado: dotação válida para qualquer exercício');

  const lista = (ex) => as(u.adminCoinfra, `SELECT dotacoes_do_orgao($1, '2099', 'ATIVOS', 100, 0, $2) d`, [A, ex]);
  const em27 = (await lista(2027)).rows[0].d.itens.map((i) => i.id);
  check(em27.includes(d27.id) && !em27.includes(d26.id) && em27.includes(semEx.id), 'filtro por exercício traz as do ano e as sem exercício');
  const todas = (await val(u.adminCoinfra, `SELECT dotacoes_do_orgao($1, '184010', 'ATIVOS', 100, 0) d`, [A])).d;
  check(todas.total === 3 && todas.itens[0].exercicio === 2027 && todas.itens[0].ug_codigo === '184010', 'busca pela unidade gestora; exercício mais recente primeiro');
  check((await val(u.adminCoinfra, `SELECT dotacoes_do_orgao($1, '2026', 'ATIVOS', 100, 0) d`, [A])).d.itens.some((i) => i.id === d26.id), 'busca pelo exercício');

  console.log('Contrato com várias dotações e empenho do mesmo exercício');
  await expectOk('contrato recebe a dotação de 2026', u.adminCoinfra, `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2)`, [ct, d26.id]);
  await expectOk('o mesmo contrato recebe a dotação de 2027 (várias dotações)', u.adminCoinfra, `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2)`, [ct, d27.id]);
  const emp = (ano, dot, numero) => as(u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id)
    VALUES ($1, $2, $3, $4, hoje(), 1500, $5) RETURNING id`, [A, ct, numero, ano, dot]);
  await expectFail('empenho de 2025 com dotação de 2026 é recusado', u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id) VALUES ($1, $2, '9601', 2025, hoje(), 1500, $3)`, [A, ct, d26.id], /exercício 2026/);
  const e26 = (await emp(2026, d26.id, '9602')).rows[0].id;
  check(!!e26, 'empenho de 2026 com dotação de 2026');
  await expectFail('trocar o ano do empenho para outro exercício é recusado', u.adminCoinfra, `UPDATE empenhos SET ano = 2027 WHERE id = $1`, [e26], /exercício/);
  const vd = (await as(u.adminCoinfra, `SELECT * FROM v_contrato_dotacoes WHERE contrato_id = $1 AND id = ANY($2)`, [ct, [d26.id, d27.id]])).rows;
  const v26 = vd.find((x) => x.id === d26.id);
  check(vd.length === 2 && v26.exercicio === 2026 && v26.acao_codigo === '2099' && v26.fonte_codigo === '16000000' && v26.subelemento_codigo === '16',
    'dotações do contrato com exercício, ação, fonte e subelemento (cada combinação separada)');
  check(Number(v26.empenhado) === 1500 && v26.empenhos === 1, 'valor empenhado por dotação do contrato');
  await expectFail('dotação usada por empenho não sai do contrato', u.adminCoinfra, `DELETE FROM contrato_dotacoes WHERE contrato_id = $1 AND classificacao_id = $2`, [ct, d26.id], /empenho/);

  console.log('Manutenção da dotação pela plataforma');
  await expectFail('exercício de dotação já empenhada não muda', u.plat, `UPDATE classificacoes_orcamentarias SET exercicio = 2027 WHERE id = $1`, [d26.id], /outro exercício/);
  await expectOk('plataforma ajusta a identificação da dotação', u.plat, `UPDATE classificacoes_orcamentarias SET descricao = 'Manutenção de equipamentos hospitalares' WHERE id = $1`, [d26.id]);
  check((await one(`SELECT busca FROM classificacoes_orcamentarias WHERE id = $1`, [d26.id])).busca.includes('equipamentos hospitalares'), 'nova identificação entra na busca');
  check((await as(u.masterA, `UPDATE classificacoes_orcamentarias SET descricao = 'x' WHERE id = $1 RETURNING id`, [d26.id])).rows.length === 0, 'órgão não altera dotação');
  await expectFail('definir o exercício que a tornaria igual a outra dotação é recusado', u.plat, `UPDATE classificacoes_orcamentarias SET exercicio = 2026 WHERE id = $1`, [semEx.id], /combinacao_unica/);
  await expectOk('dotação sem exercício recebe o exercício depois', u.plat, `UPDATE classificacoes_orcamentarias SET exercicio = 2029 WHERE id = $1`, [semEx.id]);

  const imp = (await val(u.plat, `SELECT importar_dotacoes($1, $2, true) r`, [enteA, JSON.stringify([{ linha: 2, campos, exercicio: '2028', orgaos: [] }])])).r;
  check(imp.novas === 1 && (await one(`SELECT count(*)::int n FROM classificacoes_orcamentarias WHERE ente_id = $1 AND exercicio = 2028`, [enteA])).n === 1,
    'importação por planilha com a coluna Exercício');
}
