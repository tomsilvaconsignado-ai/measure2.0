// Pré-cadastro: o convidado cria a própria ficha de servidor ao ativar o acesso; o administrador confere.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coaf }) {
  await db.exec('RESET ROLE');
  console.log('Pré-cadastro do servidor');
  const pre = '00000000-0000-0000-0000-0000000000a1';
  await db.query(`INSERT INTO auth.users VALUES ($1, 'precad@teste.gov.br', '{"nome":"Pessoa Pré"}')`, [pre]);
  await expectOk('convite: vínculo SERVIDOR na COAF', u.masterA, `SELECT conceder_vinculo('precad@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, coaf.id]);

  const meu = (await as(pre, `SELECT meu_servidor($1) r`, [A])).rows[0].r;
  check(meu.servidor === null && meu.pode_completar === true && meu.lotacao?.id === coaf.id, 'sem ficha: pode completar, lotação sugerida = unidade do vínculo');
  await expectFail('matrícula obrigatória', pre, `SELECT completar_pre_cadastro($1, '  ')`, [A], /matrícula/);
  const id = (await expectOk('pessoa completa o pré-cadastro', pre, `SELECT completar_pre_cadastro($1, 'PRE-001', 'Analista', '(79) 99999-0000') id`, [A])).rows[0].id;
  const s = await one(`SELECT user_id, unidade_id, pre_cadastro, email_institucional, telefone, nome FROM servidores WHERE id = $1`, [id]);
  check(s.user_id === pre && s.unidade_id === coaf.id && s.pre_cadastro === true, 'ficha criada ligada à conta, na lotação do vínculo, como pré-cadastro');
  check(s.email_institucional === 'precad@teste.gov.br' && s.telefone === '79999990000' && s.nome === 'Pessoa Pré', 'nome, e-mail e telefone vindos da conta');
  check((await as(pre, `SELECT completar_pre_cadastro($1, 'OUTRA') id`, [A])).rows[0].id === id, 'repetir não duplica a ficha');

  await expectOk('servidor atualiza os próprios dados (cargo, telefone, dados pessoais)', pre,
    `SELECT atualizar_meu_cadastro($1, $2)`, [A, JSON.stringify({ cargo: 'Analista II', telefone: '79988887777', pessoais: { naturalidade: 'Aracaju', uf: 'se' } })]);
  check((await one(`SELECT cargo FROM servidores WHERE id = $1`, [id])).cargo === 'Analista II', 'cargo atualizado pelo servidor');
  check((await one(`SELECT uf, naturalidade FROM servidores_dados_pessoais WHERE servidor_id = $1`, [id])).uf === 'SE', 'dados pessoais gravados');
  await expectOk('matrícula pode ser corrigida enquanto é pré-cadastro', pre, `SELECT atualizar_meu_cadastro($1, '{"matricula":"PRE-002"}')`, [A]);

  await expectFail('quem não administra servidores não confirma', pre, `SELECT confirmar_pre_cadastro($1)`, [id], /permissão/);
  await expectOk('Master confere o pré-cadastro', u.masterA, `SELECT confirmar_pre_cadastro($1)`, [id]);
  check((await one(`SELECT pre_cadastro FROM servidores WHERE id = $1`, [id])).pre_cadastro === false, 'pré-cadastro conferido');
  await expectFail('depois de conferida, a matrícula não muda pelo servidor', pre, `SELECT atualizar_meu_cadastro($1, '{"matricula":"PRE-003"}')`, [A], /conferida/);

  // ficha já cadastrada pelo administrador com o e-mail: só liga, sem duplicar
  const ficha = (await expectOk('admin cadastra a ficha antes', u.masterA, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, email_institucional)
    VALUES ($1, $2, 'Já Cadastrada', 'JC-1', 'jacad@teste.gov.br') RETURNING id`, [A, coaf.id])).rows[0].id;
  const jc = '00000000-0000-0000-0000-0000000000a2';
  await db.query(`INSERT INTO auth.users VALUES ($1, 'jacad@teste.gov.br', '{"nome":"Já Cadastrada"}')`, [jc]);
  await as(u.masterA, `SELECT conceder_vinculo('jacad@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, coaf.id]);
  check((await as(jc, `SELECT completar_pre_cadastro($1, 'QUALQUER') id`, [A])).rows[0].id === ficha, 'ficha existente com o e-mail é só ligada');
  await expectFail('matrícula já usada por outro servidor é recusada', pre, `SELECT atualizar_meu_cadastro($1, '{"matricula":"JC-1"}')`, [A], /conferida|matrícula/);
  await db.exec('RESET ROLE');
}
