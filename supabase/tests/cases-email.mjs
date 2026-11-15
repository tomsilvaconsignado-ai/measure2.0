// Aviso por e-mail aos responsáveis pelo contrato: fila, preferências, obrigatórias, chave do órgão,
// fila só para a Edge Function, tentativas, descarte de itens velhos e permissões do painel.
// Roda depois de cases-push.mjs (usa o contrato PUSH-1/2026 e as pessoas criadas lá).
export default async function ({ db, as, check, expectOk, expectFail, one, u, A }) {
  await db.exec('RESET ROLE');
  console.log('Avisos por e-mail (contratos)');
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const p = { fin: id(71), sec: id(72), coaf: id(73), vizinho: id(74), novo: id(75) };
  const naFila = async (uid, tipo) => (await one(`SELECT count(*)::int n FROM email_fila f JOIN notificacoes n ON n.id = f.notificacao_id WHERE n.user_id = $1 AND n.tipo = $2`, [uid, tipo])).n;
  const qtd = async (uid, tipo) => (await one(`SELECT count(*)::int n FROM notificacoes WHERE user_id = $1 AND tipo = $2`, [uid, tipo])).n;

  // o que já aconteceu no contrato (cases-push) foi para a fila de e-mail
  check(await naFila(p.sec, 'NOTA_AGUARDANDO_ATESTO') >= 1 && await naFila(p.fin, 'NOTA_AGUARDANDO_ATESTO') >= 1,
    'nota aguardando atesto vai por e-mail ao fiscal e ao suplente (sem precisar de celular cadastrado)');
  check(await naFila(p.coaf, 'PAGAMENTO_REALIZADO') + await naFila(p.sec, 'PAGAMENTO_REALIZADO') >= 1, 'pagamento realizado vai por e-mail');
  check(await naFila(p.sec, 'MENCAO') === 0 && await naFila(p.sec, 'PUBLICACAO') === 0, 'CONECTA não vai por e-mail (só avisos de contrato)');
  check(await naFila(p.vizinho, 'NOTA_AGUARDANDO_ATESTO') === 0, 'quem não é responsável pelo contrato não recebe e-mail');

  // preferências
  await expectOk('gestor desliga o e-mail de notas fiscais', p.coaf, `SELECT salvar_preferencia_email('CONTRATO_NOTAS', false)`);
  await expectOk('gestor tenta desligar o e-mail de vigência (obrigatória)', p.coaf, `SELECT salvar_preferencia_email('CONTRATO_VIGENCIA', false)`);
  const prefs = (await as(p.coaf, `SELECT * FROM minhas_preferencias_email($1)`, [A])).rows;
  check(prefs.length > 0 && prefs.every((x) => x.categoria.startsWith('CONTRATO_')), 'preferências de e-mail só das categorias de contrato');
  check(prefs.find((x) => x.categoria === 'CONTRATO_NOTAS').email === false && prefs.find((x) => x.categoria === 'CONTRATO_VIGENCIA').email === true,
    'opcional desligada; obrigatória continua ligada');
  const pushCoaf = (await as(p.coaf, `SELECT push FROM minhas_preferencias_notificacao($1) WHERE categoria = 'CONTRATO_NOTAS'`, [A])).rows[0].push;
  check(pushCoaf === false, 'salvar o e-mail não mexe na escolha de PUSH');
  await expectFail('ninguém lê a fila de e-mail direto', p.coaf, `SELECT * FROM email_fila`, [], /permission denied/);
  await db.exec('RESET ROLE');

  // nova nota no contrato: fiscal atual recebe, gestor (que desligou) não
  const ct = (await one(`SELECT id FROM contratos WHERE numero = 'PUSH-1/2026'`)).id;
  const emp = (await one(`SELECT id FROM empenhos WHERE numero = 'PUSH-E1'`)).id;
  const nota = (numero) => JSON.stringify({ empenho_id: emp, numero, valor: 100, data_emissao: '2026-10-10', referencias: [{ ano: 2026, mes: 10 }] });
  const antesCoaf = await naFila(p.coaf, 'NOTA_AGUARDANDO_ATESTO');
  const antesNovo = await naFila(p.novo, 'NOTA_AGUARDANDO_ATESTO');
  await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [nota('MAIL-NF-1')]);
  await db.exec('RESET ROLE');
  check(await naFila(p.novo, 'NOTA_AGUARDANDO_ATESTO') === antesNovo + 1, 'cada nota nova gera e-mail para o fiscal designado');
  check(await naFila(p.coaf, 'NOTA_AGUARDANDO_ATESTO') === antesCoaf && await qtd(p.coaf, 'NOTA_AGUARDANDO_ATESTO') > antesCoaf,
    'gestor sem e-mail de notas continua com o aviso interno');

  // fila: só a Edge Function (chave de serviço)
  await expectFail('usuário não reserva a fila de e-mail', p.sec, `SELECT email_reservar(10)`, [], /permission denied/);
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  const lote = [];
  for (let parte; (parte = (await one(`SELECT email_reservar(100) l`)).l).length;) lote.push(...parte);
  const doNovo = lote.find((x) => x.contrato === 'PUSH-1/2026' && x.titulo === 'Nova nota fiscal aguardando atesto');
  check(lote.length > 0 && lote.every((x) => x.para && x.titulo && x.link && x.link.startsWith('/')), 'lote traz destinatário, título e link interno');
  check(!!doNovo && doNovo.contrato === 'PUSH-1/2026' && doNovo.orgao.startsWith('Alfa'), 'e-mail traz o número do contrato e o órgão');
  check((await one(`SELECT email_reservar(100) l`)).l.length === 0, 'o que está sendo enviado não é reservado de novo');
  const [a, b] = lote;
  await db.query(`SELECT email_concluir($1)`, [JSON.stringify([{ id: a.id, ok: true }, { id: b.id, ok: false, erro: 'Servidor de e-mail indisponível' }])]);
  const st = async (fid) => one(`SELECT status, proxima_em > now() depois FROM email_fila WHERE id = $1`, [fid]);
  check((await st(a.id)).status === 'ENVIADO', 'envio com sucesso registrado');
  const e1 = await st(b.id);
  check(e1.status === 'PENDENTE' && e1.depois, 'falha temporária volta para a fila mais tarde');
  for (let i = 0; i < 5; i++) {
    await db.query(`UPDATE email_fila SET status = 'ENVIANDO', tentativas = tentativas + 1 WHERE id = $1`, [b.id]);
    await db.query(`SELECT email_concluir($1)`, [JSON.stringify([{ id: b.id, ok: false, erro: 'Servidor de e-mail indisponível' }])]);
  }
  check((await st(b.id)).status === 'FALHA', 'depois de 5 tentativas fica como falha registrada');
  // itens velhos não são enviados atrasados
  await db.query(`UPDATE email_fila SET status = 'PENDENTE', proxima_em = now(), criado_em = now() - interval '2 days' WHERE status = 'ENVIANDO'`);
  await db.query(`SELECT email_reservar(100)`);
  check((await one(`SELECT count(*)::int n FROM email_fila WHERE status = 'DESCARTADO' AND ultimo_erro LIKE 'Não enviado%'`)).n >= 1, 'aviso não enviado em 24 horas é descartado');

  // painel e chave do órgão
  const de = '2000-01-01', ate = '2100-01-01';
  await expectFail('situação do e-mail só para Master/plataforma', u.adminCoinfra, `SELECT email_situacao($1, $2, $3)`, [A, de, ate], /Master/);
  await expectFail('administrativo não desliga o e-mail do órgão', u.adminCoinfra, `SELECT salvar_email_notificacoes($1, false)`, [A], /Master/);
  await expectFail('outro órgão não desliga o e-mail de A', u.adminB, `SELECT salvar_email_notificacoes($1, false)`, [A], /Master/);
  const sit = (await as(u.masterA, `SELECT email_situacao($1, $2, $3) s`, [A, de, ate])).rows[0].s;
  check(sit.ativo === true && sit.enviados >= 1 && sit.falhas >= 1 && sit.descartados >= 1, 'situação: enviados, falhas e descartados');
  await expectOk('Master desliga o e-mail do órgão', u.masterA, `SELECT salvar_email_notificacoes($1, false)`, [A]);
  await db.exec('RESET ROLE');
  const antes = await naFila(p.novo, 'NOTA_AGUARDANDO_ATESTO');
  await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [nota('MAIL-NF-2')]);
  await db.exec('RESET ROLE');
  check(await naFila(p.novo, 'NOTA_AGUARDANDO_ATESTO') === antes && await qtd(p.novo, 'NOTA_AGUARDANDO_ATESTO') > antes,
    'e-mail desligado no órgão: só o aviso interno');
  check((await one(`SELECT count(*)::int n FROM email_fila f JOIN notificacoes n ON n.id = f.notificacao_id WHERE n.tenant_id = $1 AND f.status IN ('PENDENTE', 'ENVIANDO')`, [A])).n === 0,
    'ao desligar, o que estava na fila não é mais enviado');
  await expectOk('Master religa o e-mail', u.masterA, `SELECT salvar_email_notificacoes($1, true)`, [A]);
  await db.exec('RESET ROLE');
}
