// Balões de orientação: a pessoa desliga os próprios; a administração reativa dentro do escopo.
export default async function ({ as, check, expectOk, expectFail, one, u, A }) {
  console.log('Balões de orientação');
  const ativas = async (uid) => (await one(`SELECT orientacoes_ativas a FROM perfis WHERE id = $1`, [uid])).a;

  check(await ativas(u.coordCoinfra) === true, 'perfil nasce com os balões de orientação ligados');
  await expectOk('a pessoa desliga os próprios balões', u.coordCoinfra, `SELECT definir_minhas_orientacoes(false)`);
  check(await ativas(u.coordCoinfra) === false, 'balões desligados ficam gravados no perfil');
  await expectFail('ninguém altera a coluna direto (só pela função)', u.coordCoinfra,
    `UPDATE perfis SET orientacoes_ativas = true WHERE id = $1`, [u.coordCoinfra]);

  // escopo, isolamento e papéis somente leitura
  await expectFail('administrativo de outra coordenação não reativa', u.adminCoaf,
    `SELECT reativar_orientacoes($1, $2)`, [A, u.coordCoinfra], /permissão/);
  await expectFail('administrativo de outro órgão não reativa', u.adminB,
    `SELECT reativar_orientacoes($1, $2)`, [A, u.coordCoinfra], /permissão/);
  await expectFail('diretor (somente leitura em usuários) não reativa', u.dirAdm,
    `SELECT reativar_orientacoes($1, $2)`, [A, u.coordCoinfra], /permissão/);
  await expectFail('servidor não reativa os balões de ninguém', u.servidor,
    `SELECT reativar_orientacoes($1, null)`, [A], /permissão/);
  await expectFail('administrativo de coordenação não alcança vínculo do órgão inteiro', u.adminCoinfra,
    `SELECT reativar_orientacoes($1, $2)`, [A, u.masterA], /permissão/);
  check(await ativas(u.coordCoinfra) === false, 'tentativas recusadas não mudam nada');

  const r = (await expectOk('administrativo da coordenação reativa', u.adminCoinfra,
    `SELECT reativar_orientacoes($1, $2) n`, [A, u.coordCoinfra])).rows[0].n;
  check(r === 1 && await ativas(u.coordCoinfra) === true, 'balões reativados para a pessoa (1 alteração)');

  // reativar para todos do escopo
  await as(u.coordCoinfra, `SELECT definir_minhas_orientacoes(false)`);
  await as(u.dirAdm, `SELECT definir_minhas_orientacoes(false)`);
  const todos = (await expectOk('master reativa para todos do órgão', u.masterA, `SELECT reativar_orientacoes($1, null) n`, [A])).rows[0].n;
  check(todos === 2 && await ativas(u.dirAdm) === true, 'reativação em massa alcança todo o órgão do master');
  await as(u.adminB, `SELECT definir_minhas_orientacoes(false)`);
  await expectOk('master de A reativando "todos" não alcança o órgão B', u.masterA, `SELECT reativar_orientacoes($1, null)`, [A]);
  check(await ativas(u.adminB) === false, 'perfil só vinculado ao órgão B continua como estava');
  await expectOk('plataforma reativa no órgão B', u.plat, `SELECT reativar_orientacoes((SELECT tenant_id FROM vinculos WHERE user_id = $1 LIMIT 1), $1)`, [u.adminB]);
  check(await ativas(u.adminB) === true, 'plataforma reativou');
}
