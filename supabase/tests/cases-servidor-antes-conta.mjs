// Servidor cadastrado e designado ANTES de ter conta: ao receber acesso, a conta é ligada ao cadastro e a
// pessoa passa a ver os contratos em que está designada, mesmo de outra coordenação. A plataforma
// (desenvolvedor) cadastra servidores e designa responsáveis sem sessão de suporte.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra, coaf }) {
  await db.exec('RESET ROLE');
  const ct = await one(`SELECT id, unidade_id FROM contratos WHERE tenant_id = $1 ORDER BY unidade_id = $2, criado_em LIMIT 1`, [A, coinfra.id]);

  console.log('Servidor antes da conta; plataforma cadastra e designa');
  const serv = (await expectOk('plataforma cadastra servidor sem sessão de suporte', u.plat,
    `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, email_institucional)
     VALUES ($1, $2, 'Futura Fiscal', 'MAT-FUT-1', 'Futura@Teste.gov.br') RETURNING id, user_id`, [A, coaf.id])).rows[0];
  check(serv.user_id === null, 'sem conta ainda: cadastro fica sem ligação');
  await expectOk('plataforma edita o servidor', u.plat, `UPDATE servidores SET cargo = 'Analista' WHERE id = $1`, [serv.id]);
  await expectFail('plataforma continua sem dados sensíveis fora da sessão de suporte', u.plat,
    `INSERT INTO servidores_dados_pessoais (servidor_id, tenant_id, cpf) VALUES ($1, $2, NULL)`, [serv.id, A]);

  const ids = (await as(u.plat, `SELECT id FROM buscar_servidores_designacao($1, 'Futura')`, [A])).rows.map((r) => r.id);
  check(ids.includes(serv.id), 'plataforma encontra o servidor na busca de responsáveis');
  const desig = (await expectOk('plataforma designa como fiscal (contrato de outra coordenação)', u.plat,
    `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel) VALUES ($1, $2, 'FISCAL') RETURNING id`, [ct.id, serv.id])).rows[0].id;
  await expectFail('quem só consulta continua sem designar', u.dirAdm,
    `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel) VALUES ($1, $2, 'SUPLENTE')`, [ct.id, serv.id]);

  // a pessoa recebe a conta depois (convite) e o vínculo no órgão
  const futura = '00000000-0000-0000-0000-0000000000f1';
  await db.query(`INSERT INTO auth.users VALUES ($1, 'futura@teste.gov.br', '{"nome":"Futura"}')`, [futura]);
  check((await one(`SELECT user_id FROM servidores WHERE id = $1`, [serv.id])).user_id === null, 'conta sem vínculo no órgão ainda não é ligada');
  await expectOk('plataforma concede o acesso (vínculo) à pessoa', u.plat, `SELECT conceder_vinculo('futura@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, coaf.id]);
  check((await one(`SELECT user_id FROM servidores WHERE id = $1`, [serv.id])).user_id === futura, 'ao receber o acesso, a conta é ligada ao cadastro de servidor');

  const ve = (await as(futura, `SELECT designado($1) d, (SELECT count(*)::int FROM v_contratos WHERE id = $1) n`, [ct.id])).rows[0];
  check(ve.d === true && ve.n === 1, 'designada passa a ver o contrato em que foi designada');
  const meus = (await as(futura, `SELECT contrato_id FROM meus_contratos_designados()`)).rows.map((r) => r.contrato_id);
  check(meus.includes(ct.id), 'contrato aparece em "Meus contratos"');

  await expectOk('plataforma encerra a designação registrada por ela', u.plat,
    `UPDATE contrato_designacoes SET fim = hoje(), motivo_fim = 'Teste de encerramento' WHERE id = $1`, [desig]);
  await db.exec('RESET ROLE');
}
