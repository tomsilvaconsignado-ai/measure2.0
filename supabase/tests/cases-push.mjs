// Central de notificações com PUSH: destinatários por designação, fila por dispositivo, preferências,
// resumo seguro, antiduplicidade, rotina diária, painel administrativo e privacidade (critérios de aceite).
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  console.log('Notificações PUSH (contratos e CONECTA)');
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const p = { fin: id(71), sec: id(72), coaf: id(73), vizinho: id(74), novo: id(75) };
  const serv = async (uid) => (await one(`SELECT id FROM servidores WHERE user_id = $1 AND tenant_id = $2 ORDER BY criado_em DESC LIMIT 1`, [uid, A])).id;
  const qtd = async (uid, tipo) => (await one(`SELECT count(*)::int n FROM notificacoes WHERE user_id = $1 AND tipo = $2`, [uid, tipo])).n;
  const fila = async (uid, tipo) => (await one(`SELECT count(*)::int n FROM push_fila f JOIN notificacoes n ON n.id = f.notificacao_id WHERE n.user_id = $1 AND n.tipo = $2`, [uid, tipo])).n;
  await db.query(`UPDATE vinculos SET ativo = true WHERE user_id = $1 AND tenant_id = $2`, [u.adminCoinfra, A]);
  await db.query(`DELETE FROM foco_unidade`);

  // dispositivos: fiscal e gestor autorizaram PUSH; o suplente não
  const endpoint = (n) => `https://fcm.googleapis.com/fcm/send/teste-${n}`;
  const chaves = ['BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg'];
  await expectOk('fiscal registra o celular para PUSH', p.sec, `SELECT registrar_inscricao_push($1, $2, $3, 'Android · Chrome')`, [endpoint('sec'), ...chaves]);
  await expectOk('gestor registra o computador', p.coaf, `SELECT registrar_inscricao_push($1, $2, $3, 'Windows · Edge')`, [endpoint('coaf'), ...chaves]);
  await expectFail('endereço de push precisa ser https', p.coaf, `SELECT registrar_inscricao_push('http://inseguro', $1, $2, 'x')`, chaves);
  await expectFail('ninguém lê as inscrições (chaves) direto', p.sec, `SELECT * FROM push_inscricoes`, [], /permission denied/);
  check((await as(p.sec, `SELECT * FROM minhas_inscricoes_push()`)).rows.length === 1, 'a pessoa vê só os próprios dispositivos (sem as chaves)');
  // o gestor desliga PUSH de notas fiscais (categoria opcional) e tenta desligar vigência (obrigatória)
  await expectOk('gestor desliga PUSH de notas fiscais', p.coaf, `SELECT salvar_preferencia_notificacao('CONTRATO_NOTAS', false)`);
  await expectOk('gestor tenta desligar a vigência (obrigatória)', p.coaf, `SELECT salvar_preferencia_notificacao('CONTRATO_VIGENCIA', false)`);
  const prefs = (await as(p.coaf, `SELECT * FROM minhas_preferencias_notificacao($1)`, [A])).rows;
  check(prefs.find((x) => x.categoria === 'CONTRATO_NOTAS').push === false && prefs.find((x) => x.categoria === 'CONTRATO_VIGENCIA').push === true
    && prefs.find((x) => x.categoria === 'CONTRATO_VIGENCIA').obrigatoria, 'preferências: opcional desligada, obrigatória continua ligada');

  // contrato da COINFRA com responsáveis de outra coordenação, diretoria e secretaria
  const forn = (await one(`SELECT id FROM fornecedores WHERE documento = '11444777000161'`)).id;
  const ct = (await val(u.adminCoinfra, `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global)
    VALUES ($1, $2, 'PUSH-1/2026', 'DISPENSA', $3, 'Contrato das notificações', hoje() - 10, hoje() + 200, 9000) RETURNING id`, [A, coinfra.id, forn])).id;
  const designar = async (uid, papel) => (await val(u.adminCoinfra, `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel) VALUES ($1, $2, $3) RETURNING id`, [ct, await serv(uid), papel])).id;
  await designar(p.coaf, 'GESTOR');
  const dFiscal = await designar(p.sec, 'FISCAL');
  await designar(p.fin, 'SUPLENTE');
  check(await qtd(p.sec, 'DESIGNACAO_RECEBIDA') >= 1 && await qtd(p.fin, 'DESIGNACAO_RECEBIDA') >= 1, 'quem é designado recebe o aviso da designação');

  const dot = (await one(`SELECT classificacao_id FROM empenhos WHERE tenant_id = $1 AND ano = 2026 AND classificacao_id IS NOT NULL LIMIT 1`, [A])).classificacao_id;
  await as(u.adminCoinfra, `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2)`, [ct, dot]);
  const emp = (await val(u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id) VALUES ($1, $2, 'PUSH-E1', 2026, hoje(), 5000, $3) RETURNING id`, [A, ct, dot])).id;
  const nota = (numero, extra = {}) => JSON.stringify({ empenho_id: emp, numero, valor: 100, data_emissao: '2026-10-10', referencias: [{ ano: 2026, mes: 10 }], ...extra });
  const nf = (await val(u.adminCoinfra, `SELECT salvar_nota_fiscal($1) id`, [nota('PUSH-NF-1')])).id;

  // critérios 1, 2, 3, 5 e 7
  check(await qtd(p.sec, 'NOTA_AGUARDANDO_ATESTO') === 1, 'critério 1: o fiscal (outra secretaria) é avisado da nota aguardando atesto');
  check(await qtd(p.coaf, 'NOTA_AGUARDANDO_ATESTO') === 1, 'critério 2: o gestor (outra coordenação) recebe a mesma notificação');
  check(await qtd(p.fin, 'NOTA_AGUARDANDO_ATESTO') === 1, 'critério 3: o suplente (outra diretoria) recebe a mesma notificação');
  check(await qtd(p.vizinho, 'NOTA_AGUARDANDO_ATESTO') === 0 && await qtd(u.adminCoinfra, 'NOTA_AGUARDANDO_ATESTO') === 0,
    'critério 4: quem não é designado (mesma coordenação do contrato) e quem lançou não recebem');
  const n1 = await one(`SELECT titulo, descricao, link, contrato_id, categoria FROM notificacoes WHERE user_id = $1 AND tipo = 'NOTA_AGUARDANDO_ATESTO'`, [p.sec]);
  check(n1.titulo === 'Nova nota fiscal aguardando atesto' && n1.descricao.includes('PUSH-1/2026') && n1.link === `/notas?ver=${nf}&aba=atesto` && n1.contrato_id === ct,
    'critério 7 e 11: texto objetivo com o contrato e link direto para o atesto da nota');
  check(await fila(p.sec, 'NOTA_AGUARDANDO_ATESTO') === 1, 'PUSH na fila do dispositivo do fiscal');
  check(await fila(p.coaf, 'NOTA_AGUARDANDO_ATESTO') === 0 && await qtd(p.coaf, 'NOTA_AGUARDANDO_ATESTO') === 1,
    'preferência: gestor sem PUSH de notas continua com a notificação interna');
  check(await fila(p.fin, 'NOTA_AGUARDANDO_ATESTO') === 0, 'sem dispositivo autorizado não há PUSH (só a central interna)');

  // critério 14: duplicidade
  const repetido = (await one(`SELECT notificar_evento($1, $2, 'CONTRATOS', 'NOTA_AGUARDANDO_ATESTO', $3, 't', 'd', '/x', $4, $5) n`,
    [A, `nota:${nf}:recebida`, [p.sec, p.coaf, p.fin], nf, ct])).n;
  check(repetido === 0 && await qtd(p.sec, 'NOTA_AGUARDANDO_ATESTO') === 1, 'critério 14: o mesmo evento não gera notificação duplicada');
  await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [nota('PUSH-NF-1', { id: nf, valor: 110 })]);
  await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [nota('PUSH-NF-1', { id: nf, valor: 120 })]);
  check(await qtd(p.sec, 'NOTA_ALTERADA') === 1, 'edições seguidas da nota geram um aviso só');
  const dup = (await one(`SELECT count(*)::int n FROM (SELECT user_id, evento_id FROM notificacoes WHERE evento_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) x`)).n;
  check(dup === 0, 'ninguém recebe duas notificações do mesmo evento');

  // atesto e pagamento
  await expectOk('fiscal atesta', p.sec, `SELECT atestar_nota($1, 'Atesto o serviço prestado conforme contrato')`, [nf]);
  check(await qtd(p.coaf, 'NOTA_ATESTADA') === 1 && await qtd(p.sec, 'NOTA_ATESTADA') === 0, 'nota atestada: avisa os outros responsáveis (não quem atestou)');
  await as(u.adminCoinfra, `SELECT baixar_pagamento($1)`, [JSON.stringify({ nota_id: nf, data_pagamento: new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }), valor: '50',
    documento: 'OB 1', justificativa_ordem: 'Pagamento de teste das notificações', retencoes: { iss: '0', irrf: '0', inss: '0', federais: '0', outras: '0' } })]);
  check(await qtd(p.sec, 'PAGAMENTO_REALIZADO') === 1, 'pagamento realizado avisa os responsáveis');

  // vigência: alerta automático nas antecedências configuradas (critério 6)
  await as(u.adminCoinfra, `UPDATE contratos SET data_fim = hoje() + 30 WHERE id = $1`, [ct]);
  check(await qtd(p.sec, 'CONTRATO_ALTERADO') === 1, 'alteração de vigência avisa os responsáveis');
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  await db.query(`SELECT notificacoes_diarias()`);
  await db.query(`SELECT notificacoes_diarias()`);
  check(await qtd(p.sec, 'CONTRATO_VENCENDO') === 1 && await qtd(p.coaf, 'CONTRATO_VENCENDO') === 1 && await qtd(p.vizinho, 'CONTRATO_VENCENDO') === 0,
    'critério 6: aviso de vencimento a 30 dias para os responsáveis, uma vez só');
  check(await fila(p.coaf, 'CONTRATO_VENCENDO') === 1, 'categoria obrigatória vai por PUSH mesmo com a preferência desligada');
  const venc = await one(`SELECT titulo, descricao FROM notificacoes WHERE user_id = $1 AND tipo = 'CONTRATO_VENCENDO'`, [p.sec]);
  check(venc.titulo === 'Atenção: contrato próximo do vencimento' && venc.descricao.includes('30 dias'), 'texto do vencimento conforme o modelo');

  // lembrete de atesto (nota pendente há mais dias que o configurado)
  const nf2 = (await val(u.adminCoinfra, `SELECT salvar_nota_fiscal($1) id`, [nota('PUSH-NF-2')])).id;
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  await db.query(`UPDATE notas_fiscais SET criado_em = now() - interval '10 days' WHERE id = $1`, [nf2]);
  await db.query(`SELECT notificacoes_diarias()`);
  check(await qtd(p.sec, 'NOTA_LEMBRETE_ATESTO') >= 1, 'lembrete de nota aguardando atesto');

  // CONECTA (critérios 8, 9 e 12): resumo seguro na tela bloqueada
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [p.coaf]);
  await db.query(`SELECT notificar($1, $2, 'CONECTA', 'MENCAO', 'Carla mencionou você em: Assunto reservado da equipe', 'conteúdo', '/conecta?p=1', null)`, [A, [p.sec]]);
  await db.query(`SELECT notificar($1, $2, 'CONECTA', 'PUBLICACAO', 'Comunicados: Convocação reservada', 'texto', '/conecta?p=2', null)`, [A, [p.sec]]);
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  check(await fila(p.sec, 'MENCAO') === 1 && await fila(p.sec, 'PUBLICACAO') === 1, 'critérios 8 e 9: publicação direcionada e menção vão por PUSH');

  // fila: só a Edge Function (chave de serviço) reserva e conclui
  await expectFail('usuário não acessa a fila de envio', p.sec, `SELECT push_reservar(10)`, [], /permission denied/);
  const lote = (await one(`SELECT push_reservar(200) l`)).l;
  const mencao = lote.find((x) => x.payload.titulo === 'Você foi mencionado no CONECTA');
  check(!!mencao && !JSON.stringify(lote).includes('reservad') && lote.every((x) => x.endpoint && x.p256dh && x.payload.link),
    'critério 12: na tela bloqueada só vai o resumo (sem o assunto do CONECTA), com o link do conteúdo');
  check(lote.some((x) => x.payload.titulo === 'Nova nota fiscal aguardando atesto'), 'PUSH de contrato traz título objetivo');
  check((await one(`SELECT push_reservar(200) l`)).l.length === 0, 'o que está sendo enviado não é reservado de novo');
  const doFiscal = lote.filter((x) => x.endpoint.endsWith('sec'));
  const [ok1, gone, erro] = [doFiscal[0], lote.find((x) => x.endpoint.endsWith('coaf')), doFiscal[1]];
  await db.query(`SELECT push_concluir($1)`, [JSON.stringify([{ id: ok1.id, ok: true, status: 201 }, { id: gone.id, ok: false, status: 410, erro: 'Gone' },
    { id: erro.id, ok: false, status: 500, erro: 'Falha temporária' }])]);
  const st = async (fid) => one(`SELECT status, tentativas, proxima_em > now() depois FROM push_fila WHERE id = $1`, [fid]);
  check((await st(ok1.id)).status === 'ENVIADO', 'envio com sucesso registrado');
  check((await one(`SELECT ativo FROM push_inscricoes WHERE endpoint = $1`, [endpoint('coaf')])).ativo === false, 'dispositivo expirado (410) é desativado');
  const e1 = await st(erro.id);
  check(e1.status === 'PENDENTE' && e1.depois, 'falha temporária volta para a fila com nova tentativa mais tarde');
  for (let i = 0; i < 5; i++) {
    await db.query(`UPDATE push_fila SET proxima_em = now() - interval '1 second', status = 'PENDENTE' WHERE id = $1`, [erro.id]);
    await db.query(`UPDATE push_fila SET status = 'ENVIANDO', tentativas = tentativas + 1 WHERE id = $1`, [erro.id]);
    await db.query(`SELECT push_concluir($1)`, [JSON.stringify([{ id: erro.id, ok: false, status: 500, erro: 'Falha temporária' }])]);
  }
  check((await st(erro.id)).status === 'FALHA', 'depois de 5 tentativas o envio fica como falha registrada');
  check((await one(`SELECT count(*)::int n FROM notificacoes WHERE user_id = $1 AND referencia_id = $2 AND tipo = 'NOTA_AGUARDANDO_ATESTO'`, [p.sec, nf])).n === 1, 'critério 13: a notificação interna continua no histórico mesmo com o PUSH falhando');

  // painel administrativo
  const de = '2000-01-01', ate = '2100-01-01';
  await expectFail('painel de notificações só para Master/plataforma', u.adminCoinfra, `SELECT notificacoes_painel($1, $2, $3)`, [A, de, ate], /Master/);
  const painel = (await val(u.masterA, `SELECT notificacoes_painel($1, $2, $3) p`, [A, de, ate])).p;
  check(painel.geradas > 0 && painel.push_enviados >= 1 && painel.push_falhas >= 1 && painel.dispositivos >= 1 && painel.por_modulo.CONTRATOS > 0,
    'painel: geradas, enviadas, falhas, dispositivos e eventos por módulo');
  const hist = (await val(u.masterA, `SELECT notificacoes_historico_admin($1, $2, $3, null, $4, 'FALHA') h`, [A, de, ate, ct])).h;
  check(hist.total >= 1 && hist.itens.every((i) => i.contrato === 'PUSH-1/2026'), 'histórico por contrato e por falha');
  check((await val(u.masterA, `SELECT push_reprocessar($1) n`, [A])).n >= 1 && (await st(erro.id)).status === 'PENDENTE', 'reprocessar falhas devolve à fila');
  await expectOk('Master configura antecedências e categorias', u.masterA, `SELECT salvar_config_notificacoes($1, $2, '{60,10}', 3)`,
    [A, JSON.stringify([{ codigo: 'CONTRATO_DOCUMENTOS', ativa: false, obrigatoria: false }])]);
  await as(u.adminCoinfra, `INSERT INTO documentos (tenant_id, unidade_id, recurso, registro_id, nome_arquivo, mime, tamanho, storage_path) VALUES ($1, $2, 'contratos', $3, 'a.pdf', 'application/pdf', 10, $4)`,
    [A, coinfra.id, ct, `${A}/contratos/push-teste.pdf`]).catch(() => undefined);
  check(await qtd(p.sec, 'DOCUMENTO_ANEXADO') === 0, 'categoria desativada pelo administrador não gera notificação');
  await expectFail('outro perfil não configura', u.adminCoinfra, `SELECT salvar_config_notificacoes($1, '[]', '{30}', 5)`, [A], /Master/);

  // privacidade
  check((await val(p.sec, `SELECT count(*)::int n FROM notificacoes WHERE user_id <> $1`, [p.sec])).n === 0, 'ninguém lê notificações de outra pessoa');
  const minhas = (await val(p.sec, `SELECT minhas_notificacoes_historico($1, 'CONTRATOS', null, null, false, 5, 0) h`, [A])).h;
  check(minhas.total >= 5 && minhas.itens.length === 5 && minhas.itens.every((i) => i.modulo === 'CONTRATOS') && minhas.nao_lidas > 0, 'histórico próprio com filtro e paginação');

  // substituição: o anterior deixa de receber, o novo passa a receber
  const antesSec = await qtd(p.sec, 'NOTA_AGUARDANDO_ATESTO');
  await as(u.adminCoinfra, `SELECT substituir_designacao($1, $2, hoje(), null, 'Troca de fiscal')`, [dFiscal, await serv(p.novo)]);
  check((await one(`SELECT count(*)::int n FROM notificacoes WHERE user_id = $1 AND contrato_id = $2 AND tipo = 'DESIGNACAO_ENCERRADA'`, [p.sec, ct])).n === 1, 'o fiscal substituído é avisado do encerramento');
  await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [nota('PUSH-NF-3')]);
  check(await qtd(p.sec, 'NOTA_AGUARDANDO_ATESTO') === antesSec && await qtd(p.novo, 'NOTA_AGUARDANDO_ATESTO') >= 1, 'destinatários futuros seguem a designação atual');

  // dispositivo revogado pelo usuário
  await expectOk('usuário revoga o dispositivo', p.sec, `SELECT revogar_inscricao_push(null, $1)`, [endpoint('sec')]);
  check((await one(`SELECT count(*)::int n FROM push_fila f JOIN push_inscricoes i ON i.id = f.inscricao_id WHERE i.endpoint = $1 AND f.status IN ('PENDENTE', 'ENVIANDO')`, [endpoint('sec')])).n === 0,
    'critério 15: dispositivo revogado não recebe mais nada');
  await db.exec('RESET ROLE');
}
