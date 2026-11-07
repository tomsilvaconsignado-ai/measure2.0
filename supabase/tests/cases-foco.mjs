// Coordenação em foco: quem enxerga várias coordenações escolhe uma por vez. O foco só restringe.
export default async function ({ as, check, expectOk, expectFail, u, A, coinfra, coaf }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const pode = async (quem, unidadeId, recurso, acao) => (await val(quem, `SELECT pode($1, $2, $3, $4) p`, [A, unidadeId, recurso, acao])).p;
  const contar = async (quem, sql, params = []) => (await val(quem, `SELECT count(*)::int n FROM (${sql}) x`, params)).n;
  const contratosForaDe = (unidadeId) => `SELECT c.id FROM contratos c JOIN unidades_organizacionais un ON un.id = c.unidade_id
    WHERE NOT ('${unidadeId}'::uuid = ANY(un.caminho))`;

  console.log('Coordenação em foco');
  const opcoes = (await as(u.gm, `SELECT sigla FROM coordenacoes_para_foco($1)`, [A])).rows.map((r) => r.sigla);
  check(opcoes.includes('COINFRA') && opcoes.includes('COAF'), `consulta do órgão inteiro pode focar qualquer coordenação (${opcoes.join(', ')})`);
  const soCoinfra = (await as(u.adminCoinfra, `SELECT sigla FROM coordenacoes_para_foco($1)`, [A])).rows.map((r) => r.sigla);
  check(soCoinfra.join() === 'COINFRA', 'administrativo da COINFRA só tem a própria coordenação para focar');

  const contratosAntes = await contar(u.gm, `SELECT id FROM contratos`);
  const fornecedoresAntes = await contar(u.gm, `SELECT id FROM fornecedores`);
  check(contratosAntes > 0 && await pode(u.gm, coaf.id, 'contratos', 'ler'), `sem foco, vê todas as coordenações (${contratosAntes} contratos)`);

  await expectOk('escolhe a COINFRA como foco', u.gm, `SELECT definir_foco($1, $2)`, [A, coinfra.id]);
  check((await contar(u.gm, contratosForaDe(coinfra.id))) === 0, 'com foco, nenhum contrato de fora da COINFRA aparece');
  check(await pode(u.gm, coinfra.id, 'contratos', 'ler') && !(await pode(u.gm, coaf.id, 'contratos', 'ler')), 'pode(): COINFRA sim, COAF não');
  check((await contar(u.gm, `SELECT unidade_id FROM unidades_acessiveis('notas_fiscais', 'ler') a JOIN unidades_organizacionais un ON un.id = a.unidade_id WHERE NOT ($1::uuid = ANY(un.caminho))`, [coinfra.id])) === 0,
    'unidades_acessiveis() fica só na subárvore da COINFRA');
  check((await contar(u.gm, `SELECT id FROM fornecedores`)) === fornecedoresAntes, 'cadastros do órgão sem unidade (fornecedores) continuam visíveis');
  const ctx = (await val(u.gm, `SELECT meu_contexto() c`)).c;
  check(ctx.focos.length === 1 && ctx.focos[0].sigla === 'COINFRA', 'meu_contexto() informa o foco escolhido');
  check(await pode(u.adminCoaf, coaf.id, 'contratos', 'ler'), 'o foco de uma pessoa não afeta as outras');
  check(!(await pode(u.gm, coinfra.id, 'contratos', 'editar')), 'foco não dá escrita a perfil de consulta');

  await expectFail('não foca coordenação fora do próprio acesso', u.adminCoinfra, `SELECT definir_foco($1, $2)`, [A, coaf.id], /fora do seu acesso/);
  await expectFail('foco não é gravado direto na tabela', u.gm, `INSERT INTO foco_unidade (user_id, tenant_id, unidade_id) VALUES ($1, $2, $3)`, [u.adminCoaf, A, coinfra.id]);
  check((await as(u.adminCoaf, `SELECT 1 FROM foco_unidade`)).rows.length === 0, 'ninguém lê o foco de outra pessoa');

  await expectOk('troca o foco para a COAF', u.gm, `SELECT definir_foco($1, $2)`, [A, coaf.id]);
  check((await contar(u.gm, contratosForaDe(coaf.id))) === 0 && !(await pode(u.gm, coinfra.id, 'contratos', 'ler')), 'agora só a COAF aparece');
  await expectOk('volta a ver todas (limpa o foco)', u.gm, `SELECT definir_foco($1, null)`, [A]);
  check((await contar(u.gm, `SELECT id FROM contratos`)) === contratosAntes, 'sem foco, volta a ver todos os contratos');
}
