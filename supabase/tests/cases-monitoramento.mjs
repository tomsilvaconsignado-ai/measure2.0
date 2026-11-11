// Monitoramento organizacional: atividade vinda da auditoria, com a lotação do momento; acesso só Master/plataforma.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra, coaf }) {
  await db.exec('RESET ROLE');
  console.log('Monitoramento organizacional');
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  // evento gravado como se a pessoa tivesse operado (a auditoria pega o usuário do token)
  const evento = async (quem, entidade, acao = 'INSERT') => {
    await db.exec('RESET ROLE');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [quem]);
    await db.query(`SELECT registrar_auditoria($1, $2, gen_random_uuid()::text, $3, null, '{"texto":"conteúdo que não deve aparecer"}'::jsonb)`, [A, entidade, acao]);
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  };
  const de = '2000-01-01', ate = '2100-01-01';
  const siglaDir = (await one(`SELECT p.sigla FROM unidades_organizacionais c JOIN unidades_organizacionais p ON p.id = c.pai_id WHERE c.id = $1`, [coaf.id])).sigla;
  const dirAdm = (await one(`SELECT pai_id FROM unidades_organizacionais WHERE id = $1`, [coaf.id])).pai_id;
  const fiscal = await one(`SELECT id, unidade_id, nome FROM servidores WHERE user_id = $1 AND tenant_id = $2 ORDER BY (data_exoneracao IS NULL) DESC, criado_em DESC LIMIT 1`, [u.adminCoaf, A]);
  check(fiscal.unidade_id === coaf.id, 'servidor de teste lotado na COAF');

  // quem acessa
  await expectFail('administrativo comum não abre o monitoramento', u.adminCoinfra, `SELECT monitoramento_estrutura($1, $2, $3)`, [A, de, ate], /Master/);
  await expectFail('Master de outro órgão não monitora este', u.adminB, `SELECT monitoramento_estrutura($1, $2, $3)`, [A, de, ate], /Master/);
  await expectFail('ninguém lê a tabela de atividades direto', u.masterA, `SELECT count(*) FROM atividades_estrutura`, [], /permission denied/);
  await expectOk('Master do órgão abre o monitoramento', u.masterA, `SELECT monitoramento_estrutura($1, $2, $3)`, [A, de, ate]);
  await expectOk('plataforma (desenvolvedor) abre o monitoramento', u.plat, `SELECT monitoramento_estrutura($1, $2, $3)`, [A, de, ate]);

  // registro do evento
  const antes = (await one(`SELECT count(*)::int n FROM atividades_estrutura`)).n;
  await evento(u.adminCoaf, 'conecta_publicacoes');
  await evento(u.adminCoaf, 'patrimonio_movimentacoes');
  await evento(u.adminCoaf, 'perfis', 'LOGIN');
  await evento(u.adminCoaf, 'nota_unidades');
  check((await one(`SELECT count(*)::int n FROM atividades_estrutura`)).n === antes + 2, 'conta publicação e movimentação; login e linha técnica (filha) não contam');
  const ult = await one(`SELECT * FROM atividades_estrutura WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1`, [u.adminCoaf]);
  check(ult.modulo === 'PATRIMONIO' && ult.tipo === 'Cadastro — movimentação patrimonial' && ult.servidor_id === fiscal.id
    && ult.unidade_id === coaf.id && ult.caminho.includes(dirAdm), 'evento traz servidor, lotação (com a diretoria), módulo e tipo');
  check(!('depois' in ult) && !('antes' in ult), 'o registro de atividade não guarda conteúdo');
  await evento(u.adminCoaf, 'tabela_de_um_modulo_futuro');
  check((await one(`SELECT modulo FROM atividades_estrutura ORDER BY id DESC LIMIT 1`)).modulo === 'OUTROS', 'módulo futuro entra sozinho (como Outros)');

  // lotação do momento: mudar a lotação depois não muda o histórico
  await db.query(`UPDATE servidores SET unidade_id = $1 WHERE id = $2`, [coinfra.id, fiscal.id]);
  await evento(u.adminCoaf, 'conecta_comentarios');
  const dois = (await db.query(`SELECT unidade_id FROM atividades_estrutura WHERE usuario_id = $1 AND modulo IN ('CONECTA') ORDER BY id`, [u.adminCoaf])).rows;
  check(dois[0].unidade_id === coaf.id && dois.at(-1).unidade_id === coinfra.id, 'cada atividade fica com a estrutura do momento da operação');
  await db.query(`UPDATE servidores SET unidade_id = $1 WHERE id = $2`, [coaf.id, fiscal.id]);

  // visão geral
  const m = (await val(u.masterA, `SELECT monitoramento_estrutura($1, $2, $3) m`, [A, de, ate])).m;
  const un = (sigla) => m.unidades.find((x) => (sigla === 'DIRADM' ? x.id === dirAdm : sigla === 'COAF' ? x.id === coaf.id : x.id === coinfra.id));
  check(m.faixas.recente === 7 && m.faixas.moderada === 30, 'faixas de atividade configuráveis (padrão 7 e 30 dias)');
  check(un('COAF').atividades_periodo >= 3 && un('COAF').modulos.CONECTA >= 1 && un('COAF').modulos.PATRIMONIO >= 1 && un('COAF').ultima_atividade,
    'coordenação com atividades por módulo e última atividade');
  check(un('DIRADM').atividades_periodo >= un('COAF').atividades_periodo && un('DIRADM').servidores >= un('COAF').servidores,
    'diretoria soma as coordenações abaixo dela (servidores e atividades)');
  check(un('COAF').servidores >= 1 && un('COAF').com_acesso >= 1, 'coordenação com servidores ativos vinculados');
  const vazia = m.unidades.find((x) => x.servidores === 0 && x.atividades_total === 0);
  check(!!vazia, `estrutura sem servidores e sem histórico aparece como tal (${vazia?.sigla ?? vazia?.nome})`);
  const futuro = (await val(u.masterA, `SELECT monitoramento_estrutura($1, $2, $3) m`, [A, '2099-01-01', '2100-01-01'])).m;
  check(futuro.unidades.every((x) => x.atividades_periodo === 0) && futuro.unidades.find((x) => x.id === coaf.id).ultima_atividade,
    'período sem movimento: zera o período, mas mantém a última atividade');

  // histórico
  const h = (await val(u.masterA, `SELECT monitoramento_historico($1, $2, $3, $4, $5, null, 2, 0) h`, [A, coaf.id, de, ate, fiscal.nome])).h;
  check(h.total >= 3 && h.itens.length === 2 && h.itens[0].servidor === fiscal.nome && h.itens[0].coordenacao === 'COAF' && h.itens[0].diretoria === siglaDir
    && h.itens[0].matricula && !JSON.stringify(h).includes('conteúdo que não deve'), 'histórico paginado com servidor, matrícula, diretoria, coordenação, módulo e tipo — sem conteúdo');
  const hp = (await val(u.masterA, `SELECT monitoramento_historico($1, null, $2, $3, null, 'PATRIMONIO') h`, [A, de, ate])).h;
  check(hp.itens.length >= 1 && hp.itens.every((i) => i.modulo === 'PATRIMONIO'), 'filtro por módulo');
  await expectFail('histórico também é restrito', u.adminCoinfra, `SELECT monitoramento_historico($1, null, $2, $3)`, [A, de, ate], /Master/);

  // servidores da estrutura e uso
  const s = (await as(u.masterA, `SELECT * FROM monitoramento_servidores($1, $2, $3, $4)`, [A, coaf.id, de, ate])).rows;
  const f = s.find((x) => x.servidor_id === fiscal.id);
  check(f && Number(f.atividades_periodo) >= 3 && f.modulos.includes('CONECTA') && f.tem_acesso, 'lista quem está usando o sistema na coordenação');
  await db.exec('RESET ROLE');
}
