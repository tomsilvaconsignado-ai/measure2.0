// CONECTA: publicação direcionada, visibilidade no banco (RLS + funções), notificações sem duplicidade,
// comentários, curtidas, anexos (storage), moderação, destaque e denúncias.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra, coaf }) {
  await db.exec('RESET ROLE');
  console.log('CONECTA');
  // testes anteriores suspendem o acesso do coordenador; aqui ele volta a estar ativo
  await db.query(`UPDATE perfis SET ativo = true WHERE id = $1`, [u.coordCoinfra]);
  await db.query(`UPDATE vinculos SET ativo = true WHERE user_id = $1 AND tenant_id = $2`, [u.coordCoinfra, A]);
  await db.query(`DELETE FROM foco_unidade`);
  const dirAdm = (await one(`SELECT pai_id FROM unidades_organizacionais WHERE id = $1`, [coinfra.id])).pai_id;
  const B = (await one(`SELECT tenant_id FROM vinculos WHERE user_id = $1`, [u.adminB])).tenant_id;
  const cat = async (codigo) => (await one(`SELECT id FROM conecta_categorias WHERE tenant_id = $1 AND codigo = $2`, [A, codigo])).id;
  check((await one(`SELECT count(*)::int n FROM conecta_categorias WHERE tenant_id = $1`, [A])).n === 12, 'órgão nasce com as 12 categorias iniciais');
  const comunicado = await cat('COMUNICADO');
  const publicar = (quem, dados, tenant = A) => as(quem, `SELECT conecta_publicar($1, $2) id`, [tenant, JSON.stringify({ categoria_id: comunicado, texto: 'Texto do comunicado', ...dados })]);
  const vejo = async (quem, pub) => (await as(quem, `SELECT conecta_feed($1, $2) f`, [A, JSON.stringify({ id: pub })])).rows[0].f.itens.length === 1;
  const notificacoes = async (quem, ref) => (await as(quem, `SELECT count(*)::int n FROM notificacoes WHERE referencia_id = $1`, [ref])).rows[0].n;

  // 1. Coordenação
  const pCoord = (await publicar(u.adminCoinfra, { titulo: 'Reunião da COINFRA', unidades: [coinfra.id] })).rows[0].id;
  check(await vejo(u.coordCoinfra, pCoord), 'integrante da coordenação vê a publicação dirigida a ela');
  check(await vejo(u.adminCoinfra, pCoord), 'o autor vê a própria publicação');
  check(!(await vejo(u.dirAdm, pCoord)), 'diretor (unidade acima) não vê publicação só da coordenação');
  check(!(await vejo(u.adminCoaf, pCoord)), 'outra coordenação não vê');
  check(!(await vejo(u.gm, pCoord)), 'gestão municipal (órgão inteiro, sem lotação) não vê publicação restrita');
  check(await vejo(u.masterA, pCoord), 'moderador (Master) vê para moderar');
  check((await as(u.dirAdm, `SELECT count(*)::int n FROM conecta_publicacoes WHERE id = $1`, [pCoord])).rows[0].n === 0, 'consulta direta à tabela também esconde (RLS)');
  check((await as(u.dirAdm, `SELECT count(*)::int n FROM conecta_destinatarios WHERE publicacao_id = $1`, [pCoord])).rows[0].n === 0, 'destinatários também ficam ocultos');
  await expectFail('inserção direta na tabela é recusada', u.adminCoinfra,
    `INSERT INTO conecta_publicacoes (tenant_id, autor_id, categoria_id, titulo, texto) VALUES ($1, $2, $3, 'Direto', 'x')`, [A, u.adminCoinfra, comunicado]);
  await expectFail('outro órgão não publica aqui', u.adminB, `SELECT conecta_publicar($1, $2)`, [A, JSON.stringify({ categoria_id: comunicado, titulo: 'Intruso', texto: 'x', para_todos: true })], /acesso ativo/);
  await expectFail('outro órgão não lê o mural', u.adminB, `SELECT conecta_feed($1, '{}')`, [A], /acesso/);
  check((await notificacoes(u.coordCoinfra, pCoord)) === 1, 'integrante da coordenação recebe a notificação');
  check((await notificacoes(u.adminCoinfra, pCoord)) === 0, 'o autor não notifica a si mesmo');
  check((await notificacoes(u.dirAdm, pCoord)) === 0, 'quem não é destinatário não é notificado');
  const autor = (await as(u.coordCoinfra, `SELECT conecta_feed($1, $2) f`, [A, JSON.stringify({ id: pCoord })])).rows[0].f.itens[0];
  check(autor.autor.lotacao?.sigla === 'COINFRA' && autor.autor.lotacao?.diretoria === 'DIRADM', 'autor identificado com lotação e diretoria dos cadastros');

  // 2. Diretoria: chega às coordenações abaixo dela
  const pDir = (await publicar(u.adminCoaf, { titulo: 'Aviso da Diretoria Administrativa', unidades: [dirAdm] })).rows[0].id;
  check(await vejo(u.adminCoinfra, pDir) && await vejo(u.coordCoinfra, pDir) && await vejo(u.dirAdm, pDir), 'publicação para a diretoria chega às coordenações subordinadas');
  check(!(await vejo(u.gm, pDir)), 'quem está fora da diretoria não vê');

  // 3. Todos: papel somente leitura também publica
  const pTodos = (await publicar(u.coordCoinfra, { titulo: 'Campanha de vacinação', para_todos: true })).rows[0].id;
  check(await vejo(u.gm, pTodos) && await vejo(u.dirAdm, pTodos) && await vejo(u.adminCoaf, pTodos), 'publicação para todos é vista por todo o órgão');
  check((await as(u.adminB, `SELECT count(*)::int n FROM conecta_publicacoes WHERE id = $1`, [pTodos])).rows[0].n === 0, 'outro órgão não vê nem a publicação para todos');

  // 4. Pessoa + grupos combinados, sem duplicar notificação
  const pPessoa = (await publicar(u.adminCoaf, { titulo: 'Convocação individual', unidades: [coinfra.id], pessoas: [u.coordCoinfra, u.gm] })).rows[0].id;
  check(await vejo(u.gm, pPessoa), 'pessoa escolhida vê a publicação');
  check(!(await vejo(u.dirAdm, pPessoa)), 'quem não foi escolhido não vê');
  check((await notificacoes(u.coordCoinfra, pPessoa)) === 1, 'servidor em mais de um grupo escolhido recebe uma notificação só');
  await expectFail('sem destinatário é recusado', u.adminCoaf, `SELECT conecta_publicar($1, $2)`, [A, JSON.stringify({ categoria_id: comunicado, titulo: 'Sem destino', texto: 'x' })], /destinatários/);
  await expectFail('pessoa de outro órgão não é destinatária', u.adminCoaf, `SELECT conecta_publicar($1, $2)`,
    [A, JSON.stringify({ categoria_id: comunicado, titulo: 'Fora', texto: 'x', pessoas: [u.adminB] })], /acesso ativo/);

  // filtros do mural
  const feed = async (quem, p) => (await as(quem, `SELECT conecta_feed($1, $2) f`, [A, JSON.stringify(p)])).rows[0].f;
  check((await feed(u.coordCoinfra, { filtro: 'MINHAS' })).itens.every((i) => i.sou_autor), 'filtro "minhas publicações"');
  const paraMim = (await feed(u.coordCoinfra, { filtro: 'PARA_MIM' })).itens.map((i) => i.id);
  check(paraMim.includes(pCoord) && paraMim.includes(pPessoa) && !paraMim.includes(pTodos), 'filtro "direcionadas a mim" não inclui as de todos');
  check((await feed(u.coordCoinfra, { filtro: 'MINHA_COORDENACAO' })).itens.some((i) => i.id === pCoord), 'filtro "minha coordenação"');
  check((await feed(u.coordCoinfra, { busca: 'vacinação' })).itens.map((i) => i.id).join() === pTodos, 'busca por título/conteúdo');

  // 5. Comentários, respostas, menções e curtidas
  const com = (await expectOk('destinatário comenta', u.coordCoinfra, `SELECT conecta_comentar($1, 'Estarei presente', null, $2) id`, [pCoord, [u.dirAdm]]))?.rows[0].id;
  check((await as(u.adminCoinfra, `SELECT count(*)::int n FROM notificacoes WHERE tipo = 'COMENTARIO' AND referencia_id = $1`, [pCoord])).rows[0].n === 1, 'autor é notificado do comentário');
  check((await notificacoes(u.dirAdm, pCoord)) === 0, 'menção a quem não pode ver a publicação não gera aviso');
  await expectOk('autor responde ao comentário', u.adminCoinfra, `SELECT conecta_comentar($1, 'Obrigado', $2)`, [pCoord, com]);
  check((await as(u.coordCoinfra, `SELECT count(*)::int n FROM notificacoes WHERE tipo = 'RESPOSTA' AND referencia_id = $1`, [pCoord])).rows[0].n === 1, 'quem comentou é avisado da resposta');
  await expectFail('quem não vê a publicação não comenta', u.dirAdm, `SELECT conecta_comentar($1, 'Oi')`, [pCoord], /não encontrada/);
  check((await as(u.dirAdm, `SELECT count(*)::int n FROM conecta_comentarios WHERE publicacao_id = $1`, [pCoord])).rows[0].n === 0, 'comentários seguem a visibilidade da publicação');
  await expectFail('só o autor edita o comentário', u.adminCoinfra, `SELECT conecta_editar_comentario($1, 'Alterado')`, [com], /autor/);
  await expectOk('autor edita o próprio comentário', u.coordCoinfra, `SELECT conecta_editar_comentario($1, 'Estarei presente, com a equipe')`, [com]);
  check((await as(u.coordCoinfra, `SELECT conecta_curtir($1) c`, [pCoord])).rows[0].c === true, 'curtir');
  check((await feed(u.coordCoinfra, { id: pCoord })).itens[0].curtidas === 1, 'curtida contada no mural');
  check((await as(u.coordCoinfra, `SELECT conecta_curtir($1) c`, [pCoord])).rows[0].c === false, 'curtir de novo desfaz');
  await expectFail('quem não vê não curte', u.dirAdm, `SELECT conecta_curtir($1)`, [pCoord], /não encontrada/);

  // 6. Edição com histórico
  await expectFail('só o autor edita a publicação', u.coordCoinfra, `SELECT conecta_editar_publicacao($1, $2)`, [pCoord, JSON.stringify({ titulo: 'Outro', texto: 'x' })], /autor/);
  await expectOk('autor edita a publicação', u.adminCoinfra, `SELECT conecta_editar_publicacao($1, $2)`, [pCoord, JSON.stringify({ titulo: 'Reunião da COINFRA (nova data)', texto: 'Remarcada' })]);
  check((await one(`SELECT titulo FROM conecta_versoes WHERE publicacao_id = $1`, [pCoord])).titulo === 'Reunião da COINFRA', 'versão anterior guardada no histórico');

  // 7. Anexos e storage
  const anexo = (await as(u.adminCoinfra, `SELECT conecta_registrar_anexo($1, 'foto.jpg', 'image/jpeg', 2048) a`, [pCoord])).rows[0].a;
  check(anexo.storage_path.startsWith(`${A}/conecta/`), 'caminho do arquivo definido pelo banco');
  const pode = async (quem, acao) => (await as(quem, `SELECT arquivo_pode('arquivos', $1, $2) p`, [anexo.storage_path, acao])).rows[0].p;
  check(await pode(u.coordCoinfra, 'ler') && !(await pode(u.dirAdm, 'ler')), 'arquivo segue a visibilidade da publicação');
  check(await pode(u.adminCoinfra, 'enviar') && !(await pode(u.coordCoinfra, 'enviar')), 'só quem registrou envia o arquivo');
  await expectFail('outra pessoa não anexa na publicação alheia', u.coordCoinfra, `SELECT conecta_registrar_anexo($1, 'x.pdf', 'application/pdf', 10)`, [pCoord], /autor/);
  await expectFail('tipo não autorizado é recusado', u.adminCoinfra, `SELECT conecta_registrar_anexo($1, 'x.exe', 'application/x-msdownload', 10)`, [pCoord], /não autorizado/);
  await expectFail('arquivo acima do limite é recusado', u.adminCoinfra, `SELECT conecta_registrar_anexo($1, 'x.pdf', 'application/pdf', 999999999)`, [pCoord], /limite/);
  check((await feed(u.coordCoinfra, { id: pCoord })).itens[0].anexos.length === 1, 'anexo aparece no mural');
  const avatar = `${u.adminCoaf}/foto.png`;
  check((await as(u.coordCoinfra, `SELECT arquivo_pode('avatares', $1, 'ler') p`, [avatar])).rows[0].p === true, 'colega do órgão vê a foto de perfil de quem publicou');
  check((await as(u.adminB, `SELECT arquivo_pode('avatares', $1, 'ler') p`, [avatar])).rows[0].p === false, 'outro órgão não vê a foto');

  // 8. Moderação, destaque e denúncia
  await expectFail('quem não modera não oculta', u.adminCoinfra, `SELECT conecta_moderar_publicacao($1, true, 'Conteúdo indevido')`, [pTodos], /moderação/);
  await expectOk('moderador oculta com motivo', u.masterA, `SELECT conecta_moderar_publicacao($1, true, 'Conteúdo fora das regras')`, [pTodos]);
  check(!(await vejo(u.gm, pTodos)), 'publicação ocultada some para os destinatários');
  check(await vejo(u.coordCoinfra, pTodos), 'o autor continua vendo a sua publicação ocultada');
  await expectFail('publicação ocultada não recebe comentários', u.coordCoinfra, `SELECT conecta_comentar($1, 'Oi')`, [pTodos], /ocultada/);
  await expectOk('moderador restaura', u.masterA, `SELECT conecta_moderar_publicacao($1, false)`, [pTodos]);
  await expectFail('quem não modera não fixa', u.coordCoinfra, `SELECT conecta_fixar($1, true)`, [pTodos], /permissão/);
  await expectOk('moderador fixa no topo', u.masterA, `SELECT conecta_fixar($1, true, now() + interval '7 days')`, [pTodos]);
  const topo = (await feed(u.gm, {})).itens[0];
  check(topo.id === pTodos && topo.fixada, 'publicação fixada aparece primeiro no mural');
  check((await as(u.gm, `SELECT conecta_lateral($1) l`, [A])).rows[0].l.destaques.some((d) => d.id === pTodos), 'destaque no painel lateral');
  const den = (await expectOk('destinatário denuncia', u.gm, `SELECT conecta_denunciar($1, 'Informação incorreta') id`, [pTodos]))?.rows[0].id;
  await expectFail('denúncia repetida é recusada', u.gm, `SELECT conecta_denunciar($1, 'Informação incorreta')`, [pTodos], /já denunciou/);
  await expectFail('quem não modera não resolve denúncia', u.coordCoinfra, `SELECT conecta_resolver_denuncia($1, true, 'Procede')`, [den], /moderação/);
  await expectOk('moderador julga procedente (oculta)', u.masterA, `SELECT conecta_resolver_denuncia($1, true, 'Informação corrigida em nova publicação')`, [den]);
  check(!(await vejo(u.gm, pTodos)), 'denúncia procedente oculta a publicação');
  const adm = (await as(u.masterA, `SELECT conecta_admin($1) a`, [A])).rows[0].a;
  check(adm.publicacoes >= 4 && adm.ocultas >= 1 && adm.denuncias.length === 1, 'painel administrativo com estatísticas e denúncias');
  await expectFail('painel administrativo só para moderadores', u.adminCoinfra, `SELECT conecta_admin($1)`, [A], /moderação/);

  // 9. Exclusão
  await expectFail('não exclui publicação alheia', u.coordCoinfra, `SELECT conecta_excluir_publicacao($1)`, [pCoord], /suas publicações/);
  await expectOk('autor exclui a própria publicação', u.adminCoaf, `SELECT conecta_excluir_publicacao($1)`, [pPessoa]);
  check(!(await vejo(u.gm, pPessoa)) && !(await vejo(u.adminCoaf, pPessoa)), 'publicação excluída sai do mural');
  check((await one(`SELECT count(*)::int n FROM conecta_publicacoes WHERE id = $1`, [pPessoa])).n === 1, 'exclusão é lógica (registro preservado)');

  // 10. Destinos e notificações
  const unid = (await as(u.coordCoinfra, `SELECT * FROM conecta_buscar_unidades($1, 'COORDENACAO', 'coaf')`, [A])).rows;
  check(unid.length === 1 && unid[0].id === coaf.id, 'busca de coordenação de outro ramo para direcionar');
  const pessoas = (await as(u.coordCoinfra, `SELECT * FROM conecta_buscar_pessoas($1, 'gm')`, [A])).rows;
  check(pessoas.some((x) => x.user_id === u.gm) && !pessoas.some((x) => x.user_id === u.adminB), 'busca de servidor só traz pessoas do órgão');
  check((await as(u.adminB, `SELECT * FROM conecta_buscar_pessoas($1, 'gm')`, [A])).rows.length === 0, 'outro órgão não pesquisa pessoas daqui');
  const caixa = (await as(u.coordCoinfra, `SELECT minhas_mensagens($1, 'CONECTA') m`, [A])).rows[0].m;
  check(caixa.nao_lidas >= 2, 'contador de notificações não lidas');
  await as(u.coordCoinfra, `SELECT marcar_mensagens_lidas($1, null, 'CONECTA')`, [A]);
  check((await as(u.coordCoinfra, `SELECT minhas_mensagens($1, 'CONECTA') m`, [A])).rows[0].m.nao_lidas === 0, 'marcar como lidas zera o contador');
  await expectFail('ninguém grava notificação direto', u.coordCoinfra, `INSERT INTO notificacoes (tenant_id, user_id, modulo, tipo, titulo) VALUES ($1, $2, 'CONECTA', 'TESTE', 'x')`, [A, u.gm]);
  check((await as(u.gm, `SELECT count(*)::int n FROM notificacoes WHERE user_id = $1`, [u.coordCoinfra])).rows[0].n === 0, 'cada um só lê as próprias notificações');
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE entidade = 'conecta_publicacoes' AND registro_id = $1 AND acao = 'UPDATE'`, [pCoord])), 'alterações registradas na auditoria');
  check(B !== A, 'órgãos distintos no teste');
  await db.exec('RESET ROLE');
}
