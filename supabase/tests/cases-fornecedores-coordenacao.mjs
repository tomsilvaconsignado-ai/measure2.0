// Fornecedores por coordenação: cada coordenação vê só os seus; o CNPJ continua único no órgão e pode ser
// vinculado a outra coordenação sem duplicar a empresa.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra, coaf }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const ve = async (quem, id) => (await as(quem, `SELECT 1 FROM fornecedores WHERE id = $1`, [id])).rows.length === 1;

  console.log('Fornecedores por coordenação');
  const s1 = (await val(u.adminCoinfra, `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '45997418000153', 'Elétrica Gama Ltda') RETURNING id`, [A])).id;
  check(!!(await one(`SELECT 1 x FROM fornecedor_unidades WHERE fornecedor_id = $1 AND unidade_id = $2`, [s1, coinfra.id])), 'fornecedor novo fica ligado à coordenação de quem cadastrou (COINFRA)');
  check(await ve(u.adminCoinfra, s1) && await ve(u.dirAdm, s1), 'a COINFRA e a diretoria acima dela veem o fornecedor');
  check(!(await ve(u.adminCoaf, s1)), 'a COAF não vê o fornecedor da COINFRA');
  check((await as(u.adminCoaf, `UPDATE fornecedores SET razao_social = 'Invasão' WHERE id = $1 RETURNING id`, [s1])).rows.length === 0, 'a COAF não altera o fornecedor da COINFRA');
  check((await as(u.adminCoaf, `SELECT 1 FROM fornecedor_contas WHERE fornecedor_id = $1`, [s1])).rows.length === 0, 'a COAF não vê as contas bancárias dele');
  check(await ve(u.gm, s1), 'quem atua no órgão inteiro vê o fornecedor');

  await expectFail('a COAF não duplica o CNPJ', u.adminCoaf, `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '45997418000153', 'Elétrica Gama Ltda')`, [A], /fornecedores_documento_unico/);
  const r = (await val(u.adminCoaf, `SELECT vincular_fornecedor($1, '45.997.418/0001-53') r`, [A])).r;
  check(r.id === s1 && await ve(u.adminCoaf, s1), 'a COAF vincula a empresa já cadastrada e passa a vê-la');
  await expectFail('quem só consulta não vincula fornecedor', u.dirAdm, `SELECT vincular_fornecedor($1, '45997418000153')`, [A], /permissão/);
  await expectFail('ninguém grava o vínculo direto na tabela', u.adminCoaf, `INSERT INTO fornecedor_unidades (fornecedor_id, unidade_id, tenant_id) VALUES ($1, $2, $3)`, [s1, coinfra.id, A]);

  const s2 = (await val(u.adminCoaf, `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '58212862000168', 'Limpeza Delta Ltda') RETURNING id`, [A])).id;
  check(!(await ve(u.adminCoinfra, s2)) && await ve(u.adminCoaf, s2), 'fornecedor da COAF não aparece na COINFRA');
  await expectOk('foco do órgão inteiro na COINFRA', u.gm, `SELECT definir_foco($1, $2)`, [A, coinfra.id]);
  check(await ve(u.gm, s1) && !(await ve(u.gm, s2)), 'com foco na COINFRA, só os fornecedores dela');
  await expectOk('limpa o foco', u.gm, `SELECT definir_foco($1, null)`, [A]);
  check(await ve(u.gm, s2), 'sem foco, o órgão inteiro volta a ver todos');

  const forn = (await one(`SELECT id FROM fornecedores WHERE tenant_id = $1 AND documento = '11444777000161'`, [A]))?.id;
  check(!!forn && !!(await one(`SELECT 1 x FROM fornecedor_unidades WHERE fornecedor_id = $1`, [forn])), 'fornecedor com contrato fica ligado à coordenação do contrato');
  await db.exec('RESET ROLE');
}
