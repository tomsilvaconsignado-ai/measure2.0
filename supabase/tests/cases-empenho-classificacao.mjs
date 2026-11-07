// Empenho com a classificação escolhida campo a campo (formato da nota de empenho), só com códigos já cadastrados.
export default async function ({ as, check, expectOk, expectFail, one, u, A }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const ente = (await one(`SELECT ente_id FROM tenants WHERE id = $1`, [A])).ente_id;
  const ct = (await one(`SELECT id FROM contratos WHERE tenant_id = $1 AND numero = '001/2026'`, [A])).id;
  const cl = async (tipo, codigo, paiCodigo) => (await one(`SELECT c.id FROM classificadores c LEFT JOIN classificadores p ON p.id = c.pai_id
    WHERE c.ente_id = $1 AND c.tipo = $2 AND c.codigo = $3 AND ($4::text IS NULL OR p.codigo = $4) LIMIT 1`, [ente, tipo, codigo, paiCodigo ?? null]))?.id;

  console.log('Naturezas da despesa do catálogo');
  const nat = (await as(u.adminCoinfra, `SELECT * FROM naturezas_do_orgao($1, '339039')`, [A])).rows;
  const n39 = nat.find((x) => x.codigo === '33903900');
  check(!!n39 && !!n39.categoria_id && !!n39.elemento_id, `natureza 33903900 disponível para escolha (${n39?.descricao})`);
  check((await as(u.adminCoinfra, `SELECT * FROM naturezas_do_orgao($1, 'terceiros')`, [A])).rows.some((x) => x.codigo === '33903900'), 'busca da natureza pela descrição');

  const base = {
    contrato_id: ct, exercicio: 2026,
    funcao_id: await cl('FUNCAO', '10'), subfuncao_id: await cl('SUBFUNCAO', '302'), programa_id: await cl('PROGRAMA', '0086'),
    acao_id: await cl('ACAO', '2099'), categoria_economica_id: n39.categoria_id, gnd_id: n39.gnd_id, modalidade_id: n39.modalidade_id,
    elemento_id: n39.elemento_id, subelemento_id: await cl('SUBELEMENTO', '16', '39'), fonte_id: await cl('FONTE', '16000000'),
  };
  const dot = (quem, p) => as(quem, `SELECT dotacao_do_empenho($1) id`, [JSON.stringify(p)]);

  console.log('Classificação campo a campo no empenho');
  const existente = (await one(`SELECT id FROM classificacoes_orcamentarias WHERE ente_id = $1 AND exercicio = 2026 AND descricao = 'Manutenção de equipamentos hospitalares'`, [ente])).id;
  const r1 = (await dot(u.adminCoinfra, base)).rows[0].id;
  check(r1 === existente, 'a combinação já cadastrada no exercício é reaproveitada (sem duplicar)');
  const antes = (await one(`SELECT count(*)::int n FROM classificacoes_orcamentarias WHERE ente_id = $1`, [ente])).n;
  const nova = { ...base, fonte_id: await cl('FONTE', '27490000') };
  const r2 = (await dot(u.adminCoinfra, nova)).rows[0].id;
  const d2 = await one(`SELECT exercicio, codigo_completo FROM classificacoes_orcamentarias WHERE id = $1`, [r2]);
  check(r2 !== existente && d2.exercicio === 2026 && d2.codigo_completo === '10.302.0086.2099 | 33903916 | Fonte 27490000'
    && (await one(`SELECT count(*)::int n FROM classificacoes_orcamentarias WHERE ente_id = $1`, [ente])).n === antes + 1,
    `combinação nova montada só com códigos do catálogo (${d2.codigo_completo})`);
  check((await one(`SELECT count(*)::int n FROM contrato_dotacoes WHERE contrato_id = $1 AND classificacao_id = $2`, [ct, r2])).n === 1, 'a dotação passa a fazer parte do contrato');
  check((await dot(u.adminCoinfra, nova)).rows[0].id === r2, 'escolher de novo a mesma classificação não duplica');
  await expectOk('empenho gravado com a dotação montada', u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id)
    VALUES ($1, $2, '10230012', 2026, hoje(), 1300769.84, $3)`, [A, ct, r2]);
  const r25 = (await dot(u.adminCoinfra, { ...base, exercicio: 2025 })).rows[0].id;
  check((await one(`SELECT exercicio FROM classificacoes_orcamentarias WHERE id = $1`, [r25])).exercicio === 2025, 'empenho de outro ano usa (ou monta) a dotação daquele exercício');

  await expectFail('sem ação é recusado', u.adminCoinfra, `SELECT dotacao_do_empenho($1)`, [JSON.stringify({ ...base, acao_id: null })], /ação/);
  await expectFail('sem fonte é recusado', u.adminCoinfra, `SELECT dotacao_do_empenho($1)`, [JSON.stringify({ ...base, fonte_id: null })], /fonte/);
  await expectFail('código fora do catálogo é recusado', u.adminCoinfra, `SELECT dotacao_do_empenho($1)`,
    [JSON.stringify({ ...base, fonte_id: '00000000-0000-0000-0000-000000000077' })], /não encontrado/);
  await expectFail('código de outro tipo no campo errado é recusado', u.adminCoinfra, `SELECT dotacao_do_empenho($1)`,
    [JSON.stringify({ ...base, fonte_id: base.acao_id })], /Fonte/);
  await expectFail('perfil de consulta não monta dotação de empenho', u.dirAdm, `SELECT dotacao_do_empenho($1)`, [JSON.stringify(base)], /permissão/);
  const adminC = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  await expectFail('outro órgão não usa o contrato', adminC, `SELECT dotacao_do_empenho($1)`, [JSON.stringify(base)], /permissão/);
}
