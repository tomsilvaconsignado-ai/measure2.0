// Designação de gestor, fiscal e suplente entre secretarias, diretorias e coordenações (critérios de aceite do upgrade 02).
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  console.log('Designações entre estruturas (critérios de aceite)');
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const pessoas = { fin: id(71), sec: id(72), coaf: id(73), vizinho: id(74), novo: id(75) };
  for (const [nome, uid] of Object.entries(pessoas)) {
    await db.query(`INSERT INTO auth.users VALUES ($1, $2, $3)`, [uid, `desig${nome}@teste.gov.br`, JSON.stringify({ nome: `Designável ${nome}` })]);
  }
  const unid = async (sigla) => (await one(`SELECT id FROM unidades_organizacionais WHERE tenant_id = $1 AND sigla = $2`, [A, sigla])).id;
  const org = await unid('PMA');
  const dirfin = await unid('DIRFIN');
  const coaf = await unid('COAF');
  // outra secretaria do mesmo órgão, com diretoria e coordenação próprias
  const semed = (await val(u.plat, `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome, sigla) VALUES ($1, $2, 'SECRETARIA', 'Secretaria de Educação', 'SEMED') RETURNING id`, [A, org])).id;
  const dped = (await val(u.plat, `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome, sigla) VALUES ($1, $2, 'DIRETORIA', 'Diretoria Pedagógica', 'DIPED') RETURNING id`, [A, semed])).id;
  const coesc = (await val(u.plat, `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome, sigla) VALUES ($1, $2, 'COORDENACAO', 'Coordenação de Escolas', 'COESC') RETURNING id`, [A, dped])).id;

  for (const [email, unidade] of [['desigfin', dirfin], ['desigsec', coesc], ['desigcoaf', coaf], ['desigvizinho', coinfra.id], ['designovo', coesc]]) {
    await as(u.plat, `SELECT conceder_vinculo($1, $2, $3, 'SERVIDOR')`, [`${email}@teste.gov.br`, A, unidade]);
  }
  await db.exec('RESET ROLE');
  const servidor = async (nome, mat, cargo, unidade, email) => (await val(u.masterA,
    `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, cargo, email_institucional) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, user_id`,
    [A, unidade, nome, mat, cargo, email]));
  const sFin = await servidor('Daniela Finanças Teste', '7101', 'Analista Contábil', dirfin, 'desigfin@teste.gov.br');
  const sSec = await servidor('Sérgio Educação Teste', '7102', 'Engenheiro Civil', coesc, 'desigsec@teste.gov.br');
  const sCoaf = await servidor('Carla Coaf Teste', '7103', 'Técnica Administrativa', coaf, 'desigcoaf@teste.gov.br');
  const sViz = await servidor('Vitor Vizinho Teste', '7104', 'Auxiliar', coinfra.id, 'desigvizinho@teste.gov.br');
  const sNovo = await servidor('Nina Nova Fiscal Teste', '7105', 'Arquiteta', coesc, 'designovo@teste.gov.br');
  check(sSec.user_id === pessoas.sec && sNovo.user_id === pessoas.novo, 'servidores de teste ligados às contas pelo e-mail');
  await db.exec('RESET ROLE');
  await db.query(`UPDATE vinculos SET ativo = true WHERE user_id = $1 AND tenant_id = $2`, [u.adminCoinfra, A]);
  await db.query(`DELETE FROM foco_unidade`);

  // critério 4: a lista traz todos os servidores ativos do órgão, não só os da lotação do administrador
  const todos = (await as(u.adminCoinfra, `SELECT * FROM buscar_servidores_designacao($1, null, 200)`, [A])).rows;
  const ativos = (await one(`SELECT count(*)::int n FROM servidores WHERE tenant_id = $1 AND (data_exoneracao IS NULL OR data_exoneracao > hoje())`, [A])).n;
  check(todos.length === Math.min(ativos, 200) && todos.some((s) => s.id === sSec.id) && todos.some((s) => s.id === sFin.id),
    `lista geral com todos os servidores ativos do órgão (${todos.length} de ${ativos})`);
  const sec = todos.find((s) => s.id === sSec.id);
  check(sec.secretaria === 'SEMED' && sec.diretoria === 'DIPED' && sec.coordenacao === 'COESC' && sec.cargo === 'Engenheiro Civil' && sec.situacao === 'ATIVO',
    'lista mostra cargo, secretaria, diretoria, coordenação e situação cadastral');
  const busca = async (t) => (await as(u.adminCoinfra, `SELECT id FROM buscar_servidores_designacao($1, $2)`, [A, t])).rows.map((r) => r.id);
  check((await busca('engenheiro civil')).includes(sSec.id), 'pesquisa por cargo');
  check((await busca('Secretaria de Educação')).includes(sSec.id) && (await busca('semed')).includes(sNovo.id), 'pesquisa por secretaria (nome ou sigla)');
  check((await busca('Diretoria Financeira')).includes(sFin.id), 'pesquisa por diretoria');
  check((await busca('coaf')).includes(sCoaf.id), 'pesquisa por coordenação');
  check((await busca('7102')).includes(sSec.id) && (await busca('sérgio educ')).includes(sSec.id), 'pesquisa por matrícula e por nome parcial');

  // contrato da COINFRA
  const forn = (await one(`SELECT id FROM fornecedores WHERE documento = '11444777000161'`)).id;
  const ct = (await val(u.adminCoinfra, `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global)
    VALUES ($1, $2, 'DES-1/2026', 'DISPENSA', $3, 'Contrato para designações entre estruturas', hoje() - 10, hoje() + 200, 5000) RETURNING id`, [A, coinfra.id, forn])).id;
  const designar = (sid, papel) => val(u.adminCoinfra, `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel, portaria) VALUES ($1, $2, $3, 'Portaria 99/2026') RETURNING id`, [ct, sid, papel]);
  const lotacaoAntes = (await one(`SELECT unidade_id FROM servidores WHERE id = $1`, [sSec.id])).unidade_id;
  const dCoaf = (await expectOk('critério 1: COINFRA designa servidor de outra coordenação (gestor)', u.adminCoinfra, `SELECT 1`)) && (await designar(sCoaf.id, 'GESTOR')).id;
  const dFin = (await designar(sFin.id, 'SUPLENTE')).id;
  check(!!dFin, 'critério 2: designa servidor de outra diretoria (suplente)');
  const dSec = (await designar(sSec.id, 'FISCAL')).id;
  check(!!dSec, 'critério 3: designa servidor de outra secretaria (fiscal)');
  check(!!dCoaf, 'designações registradas');

  const reg = await one(`SELECT servidor_matricula, servidor_cargo, lotacao_unidade_id, lotacao_descricao, criado_por, criado_em FROM contrato_designacoes WHERE id = $1`, [dSec]);
  check(reg.servidor_matricula === '7102' && reg.servidor_cargo === 'Engenheiro Civil' && reg.lotacao_unidade_id === coesc
    && reg.lotacao_descricao === 'SEMED › DIPED › COESC' && reg.criado_por === u.adminCoinfra && reg.criado_em,
    'registro guarda matrícula, cargo, lotação do momento, quem designou e quando');
  check((await one(`SELECT unidade_id FROM servidores WHERE id = $1`, [sSec.id])).unidade_id === lotacaoAntes, 'critério 7: a designação não altera a lotação do servidor');
  await expectFail('o retrato da designação não pode ser alterado', u.adminCoinfra, `UPDATE contrato_designacoes SET lotacao_descricao = 'outra', servidor_cargo = 'outro' WHERE id = $1`, [dSec], /permission denied/);
  check((await one(`SELECT lotacao_descricao FROM contrato_designacoes WHERE id = $1`, [dSec])).lotacao_descricao === 'SEMED › DIPED › COESC', 'retrato preservado');

  // critério 5 e 6: o designado vê o contrato e os dados dele, e só ele
  const meus = (await as(pessoas.sec, `SELECT * FROM meus_contratos_designados()`)).rows;
  check(meus.length === 1 && meus[0].contrato_id === ct && meus[0].papeis.join() === 'FISCAL' && meus[0].coordenacao === 'COINFRA'
    && meus[0].secretaria === 'SMS' && meus[0].diretoria === 'DIRADM' && meus[0].situacao && meus[0].data_fim_atual,
    'critério 5: "Meus contratos" do fiscal de outra secretaria traz o contrato com estrutura, papel, vigência e situação');
  check((await val(pessoas.sec, `SELECT count(*)::int n FROM v_contratos WHERE id = $1`, [ct])).n === 1, 'designado abre o contrato de outra secretaria');
  check((await val(pessoas.sec, `SELECT count(*)::int n FROM v_contratos WHERE id <> $1`, [ct])).n === 0, 'critério 6: designado não vê os demais contratos da COINFRA');
  check((await as(pessoas.sec, `SELECT * FROM designacoes_do_contrato($1)`, [ct])).rows.length === 3, 'designado consulta os responsáveis do contrato');
  check((await val(pessoas.fin, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 1, 'suplente de outra diretoria vê o contrato');

  // critério 9: sem designação, nem pela API (mesma coordenação do contrato inclusive)
  check((await val(pessoas.vizinho, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 0, 'critério 9: servidor da mesma coordenação, sem designação, não lê o contrato pela API');
  check((await val(pessoas.vizinho, `SELECT count(*)::int n FROM v_contratos WHERE id = $1`, [ct])).n === 0, 'critério 9: nem pela visão de detalhes');
  await expectFail('critério 9: sem designação não lista os responsáveis', pessoas.vizinho, `SELECT * FROM designacoes_do_contrato($1)`, [ct], /não encontrado/);
  check((await as(pessoas.vizinho, `SELECT * FROM meus_contratos_designados()`)).rows.length === 0, 'sem designação, "Meus contratos" vem vazio');
  await expectFail('designado não designa outras pessoas', pessoas.sec, `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel) VALUES ($1, $2, 'FISCAL')`, [ct, sViz.id]);
  await expectFail('servidor sem papel de administração não usa a busca geral', pessoas.sec, `SELECT * FROM buscar_servidores_designacao($1, 'a')`, [A], /permissão/);

  // critério 8: substituição atualiza o acesso e mantém o histórico
  await expectFail('substituição exige motivo', u.adminCoinfra, `SELECT substituir_designacao($1, $2, hoje(), null, '')`, [dSec, sNovo.id], /motivo/);
  await expectFail('quem não administra o contrato não substitui', pessoas.sec, `SELECT substituir_designacao($1, $2, hoje(), null, 'Troca de fiscal')`, [dSec, sNovo.id]);
  const dNovo = (await val(u.adminCoinfra, `SELECT substituir_designacao($1, $2, hoje(), 'Portaria 100/2026', 'Troca de fiscal a pedido') id`, [dSec, sNovo.id])).id;
  check(!!dNovo, 'administrador substitui o fiscal');
  check((await val(pessoas.sec, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 0, 'critério 8: o fiscal anterior perde o acesso');
  check((await as(pessoas.sec, `SELECT * FROM meus_contratos_designados()`)).rows.length === 0, 'o contrato sai de "Meus contratos" do anterior');
  check((await val(pessoas.novo, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 1, 'o novo fiscal passa a ver o contrato');
  const hist = (await as(u.adminCoinfra, `SELECT * FROM designacoes_do_contrato($1, true)`, [ct])).rows;
  const antigo = hist.find((h) => h.id === dSec), novo = hist.find((h) => h.id === dNovo);
  check(antigo.fim && antigo.motivo_fim === 'Troca de fiscal a pedido' && antigo.substituido_por_nome === 'Nina Nova Fiscal Teste' && antigo.encerrado_por
    && novo.substitui_nome === 'Sérgio Educação Teste' && novo.designado_por && hist.length === 4,
    'histórico mantém anterior e novo, ligados, com motivo, quem fez e quando');
  await expectFail('designação encerrada não é substituída de novo', u.adminCoinfra, `SELECT substituir_designacao($1, $2, hoje(), null, 'Outra troca')`, [dSec, sViz.id], /encerrada/);

  // revogação com outra designação ativa no mesmo contrato: continua com acesso
  const dFin2 = (await designar(sFin.id, 'FISCAL')).id;
  await expectOk('encerra só a suplência de quem também é fiscal', u.adminCoinfra, `UPDATE contrato_designacoes SET fim = hoje(), motivo_fim = 'Fim da suplência' WHERE id = $1`, [dFin]);
  check((await val(pessoas.fin, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 1, 'ainda fiscal no mesmo contrato: mantém o acesso');
  check((await as(pessoas.fin, `SELECT papeis FROM meus_contratos_designados()`)).rows[0]?.papeis.join() === 'FISCAL', '"Meus contratos" mostra só o papel ativo');
  await expectOk('encerra a última designação', u.adminCoinfra, `UPDATE contrato_designacoes SET fim = hoje(), motivo_fim = 'Encerramento' WHERE id = $1`, [dFin2]);
  check((await val(pessoas.fin, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 0, 'sem designação ativa: perde o acesso');
  check((await one(`SELECT count(*)::int n FROM contrato_designacoes WHERE contrato_id = $1`, [ct])).n === 5, 'nenhuma designação apagada (histórico completo)');
  await db.exec('RESET ROLE');
}
