// Gestão patrimonial: cadastro, escopo, transferência com aceite, rejeição, troca, substituição, termo físico,
// baixa, retificação, inventário, relatórios numerados e painel.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 }) {
  await db.exec('RESET ROLE');
  console.log('Gestão patrimonial');
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const patri = '00000000-0000-0000-0000-000000000050';
  await db.query(`INSERT INTO auth.users VALUES ($1, 'patri@teste.gov.br', '{"nome":"Adm Patrimonial"}')`, [patri]);
  await expectOk('plataforma concede o papel Administrador patrimonial', u.plat, `SELECT conceder_vinculo('patri@teste.gov.br', $1, null, 'PATRIMONIAL')`, [A]);
  await db.query(`UPDATE vinculos SET ativo = true WHERE user_id = $1 AND tenant_id = $2`, [u.coordCoinfra, A]);
  await db.query(`DELETE FROM foco_unidade`);
  check((await one(`SELECT count(*)::int n FROM patrimonio_categorias WHERE tenant_id = $1 AND pai_id IS NULL`, [A])).n === 10, 'órgão nasce com as 10 categorias');
  const cat = (await one(`SELECT id FROM patrimonio_categorias WHERE tenant_id = $1 AND nome = 'Informática e tecnologia'`, [A])).id;
  const sub = (await one(`SELECT id FROM patrimonio_categorias WHERE pai_id = $1 AND nome = 'Computadores'`, [cat])).id;
  const outraSub = (await one(`SELECT id FROM patrimonio_categorias WHERE tenant_id = $1 AND nome = 'Cadeiras'`, [A])).id;

  // responsáveis (cadastro de servidores ligado às contas pelo e-mail)
  const respCoinfra = (await val(u.adminCoinfra, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, email_institucional) VALUES ($1, $2, 'Resp Coinfra', 'P-01', 'coordcoinfra@teste.gov.br') RETURNING id, user_id`, [A, coinfra.id]));
  const respCoaf = (await val(u.adminCoaf, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, email_institucional) VALUES ($1, $2, 'Resp Coaf', 'P-02', 'admincoaf@teste.gov.br') RETURNING id, user_id`, [A, coaf.id]));
  check(respCoinfra.user_id === u.coordCoinfra && respCoaf.user_id === u.adminCoaf, 'responsáveis vêm do cadastro de servidores, ligados às contas');
  const respServ = (await one(`SELECT id FROM servidores WHERE user_id = $1`, [u.servidor])).id;
  await db.query(`UPDATE servidores SET data_exoneracao = null WHERE id = $1`, [respServ]);
  const usf = (await val(u.adminCoinfra, `INSERT INTO unidades_atendidas (tenant_id, nome, tipo) VALUES ($1, 'USF Patrimônio', 'USF') RETURNING id`, [A])).id;

  console.log('  cadastro');
  const novoBem = (quem, dados) => as(quem, `INSERT INTO patrimonio_bens (tenant_id, numero, descricao, categoria_id, subcategoria_id, unidade_id, local_id, responsavel_id, sala, valor_aquisicao)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`, [A, dados.numero, dados.descricao, cat, dados.sub ?? sub, dados.unidade, dados.local ?? usf, dados.resp ?? null, dados.sala ?? null, dados.valor ?? 3500]);
  const bem1 = (await novoBem(u.adminCoinfra, { numero: '12345', descricao: 'Computador Dell OptiPlex', unidade: coinfra.id, resp: respCoinfra.id, sala: 'Sala 2' })).rows[0].id;
  await expectFail('número patrimonial duplicado é recusado', u.adminCoinfra, `INSERT INTO patrimonio_bens (tenant_id, numero, descricao, categoria_id, unidade_id) VALUES ($1, ' 12345', 'Outro', $2, $3)`,
    [A, cat, coinfra.id], /patrimonio_numero_unico/);
  await expectFail('subcategoria de outra categoria é recusada', u.adminCoinfra, `INSERT INTO patrimonio_bens (tenant_id, numero, descricao, categoria_id, subcategoria_id, unidade_id) VALUES ($1, 'X1', 'Cadeira', $2, $3, $4)`,
    [A, cat, outraSub, coinfra.id], /subcategoria/);
  await expectFail('administrativo não cadastra bem de outra coordenação', u.adminCoinfra, `INSERT INTO patrimonio_bens (tenant_id, numero, descricao, categoria_id, unidade_id) VALUES ($1, 'X2', 'Mesa', $2, $3)`, [A, cat, coaf.id]);
  await expectFail('coordenador (consulta) não cadastra', u.coordCoinfra, `INSERT INTO patrimonio_bens (tenant_id, numero, descricao, categoria_id, unidade_id) VALUES ($1, 'X3', 'Mesa', $2, $3)`, [A, cat, coinfra.id]);
  await expectFail('responsável não muda por edição direta (só por movimentação)', u.adminCoinfra, `UPDATE patrimonio_bens SET responsavel_id = $2 WHERE id = $1`, [bem1, respCoaf.id], /permission denied/);
  await expectFail('localização não muda por edição direta', u.adminCoinfra, `UPDATE patrimonio_bens SET unidade_id = $2 WHERE id = $1`, [bem1, coaf.id], /permission denied/);
  await expectOk('dados descritivos podem ser corrigidos', u.adminCoinfra, `UPDATE patrimonio_bens SET marca = 'Dell', modelo = 'OptiPlex 7090', conservacao = 'EXCELENTE' WHERE id = $1`, [bem1]);
  await expectFail('ninguém apaga bem', u.masterA, `DELETE FROM patrimonio_bens WHERE id = $1`, [bem1]);
  check((await one(`SELECT count(*)::int n FROM patrimonio_responsabilidades WHERE bem_id = $1 AND fim IS NULL AND servidor_id = $2`, [bem1, respCoinfra.id])).n === 1, 'cadastro abre o histórico de responsabilidade');
  const busca = await val(u.coordCoinfra, `SELECT patrimonio_buscar($1, $2) r`, [A, JSON.stringify({ busca: 'optiplex' })]);
  check(busca.r.total === 1 && busca.r.itens[0].responsavel === 'Resp Coinfra' && busca.r.itens[0].unidade.sigla === 'COINFRA', 'pesquisa por descrição traz unidade e responsável');
  check((await val(u.adminCoaf, `SELECT patrimonio_buscar($1, '{}') r`, [A])).r.total === 0, 'outra coordenação não vê os bens da COINFRA');
  check((await val(u.dirAdm, `SELECT patrimonio_buscar($1, $2) r`, [A, JSON.stringify({ numero: '12345' })])).r.total === 1, 'gestor da diretoria vê os bens das coordenações dela');
  check((await as(u.adminB, `SELECT count(*)::int n FROM patrimonio_bens WHERE id = $1`, [bem1])).rows[0].n === 0, 'outro órgão não vê o bem');

  console.log('  transferência entre coordenações');
  const mov1 = (await expectOk('administrativo da origem solicita a transferência', u.adminCoinfra, `SELECT patrimonio_movimentar($1, $2) id`, [A, JSON.stringify({
    tipo: 'TRANSFERENCIA_COORDENACAO', justificativa: 'Reforço da equipe da COAF', itens: [{ bem_id: bem1, destino_unidade_id: coaf.id, destino_responsavel_id: respCoaf.id, destino_sala: 'Sala 10' }],
  })]))?.rows[0].id;
  let b = await one(`SELECT unidade_id, situacao, responsavel_id, movimentacao_pendente_id FROM patrimonio_bens WHERE id = $1`, [bem1]);
  check(b.unidade_id === coinfra.id && b.responsavel_id === respCoinfra.id && b.situacao === 'EM_TRANSFERENCIA', 'solicitar não muda localização nem responsável (bem fica "em transferência")');
  check((await one(`SELECT situacao FROM patrimonio_movimentacoes WHERE id = $1`, [mov1])).situacao === 'AGUARDANDO_CONFIRMACAO', 'movimentação aguardando confirmação');
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM notificacoes WHERE tipo = 'CONFIRMAR_RECEBIMENTO' AND referencia_id = $1`, [mov1])).n === 1, 'responsável do destino é notificado');
  await expectFail('segunda movimentação simultânea do mesmo bem é recusada', u.adminCoinfra, `SELECT patrimonio_movimentar($1, $2)`, [A, JSON.stringify({
    tipo: 'MANUTENCAO', justificativa: 'Teste de conflito', itens: [{ bem_id: bem1 }] })], /em andamento/);
  await expectFail('quem não é o destinatário não confirma', u.coordCoinfra, `SELECT patrimonio_responder($1, true)`, [mov1], /sua confirmação/);
  check((await val(u.adminCoaf, `SELECT patrimonio_movimentacao($1) m`, [mov1])).m.aguarda_minha_confirmacao === true, 'destinatário vê a transferência que aguarda o aceite dele');
  check((await val(u.adminCoaf, `SELECT patrimonio_responder($1, true) r`, [mov1])).r === 'CONCLUIDA', 'destinatário confirma o recebimento');
  b = await one(`SELECT unidade_id, situacao, responsavel_id, sala, movimentacao_pendente_id FROM patrimonio_bens WHERE id = $1`, [bem1]);
  check(b.unidade_id === coaf.id && b.responsavel_id === respCoaf.id && b.situacao === 'EM_USO' && b.sala === 'Sala 10' && b.movimentacao_pendente_id === null,
    'depois do aceite: nova localização, novo responsável, bem liberado');
  const conf = await one(`SELECT confirmacao_tipo, confirmado_por, confirmado_servidor_id, declaracao FROM patrimonio_mov_itens WHERE movimentacao_id = $1`, [mov1]);
  check(conf.confirmacao_tipo === 'DIGITAL' && conf.confirmado_por === u.adminCoaf && conf.confirmado_servidor_id === respCoaf.id && /Declaro que recebi/.test(conf.declaracao),
    'aceite ligado à conta autenticada, com matrícula (servidor) e declaração');
  check((await one(`SELECT count(*)::int n FROM patrimonio_responsabilidades WHERE bem_id = $1`, [bem1])).n === 2
    && (await one(`SELECT count(*)::int n FROM patrimonio_responsabilidades WHERE bem_id = $1 AND fim IS NULL`, [bem1])).n === 1, 'responsável anterior fica no histórico');
  check((await val(u.adminCoinfra, `SELECT count(*)::int n FROM notificacoes WHERE tipo = 'MOVIMENTACAO_CONCLUIDA'`)).n >= 1, 'solicitante avisado da conclusão');
  await db.exec('RESET ROLE');
  try { await db.query(`UPDATE patrimonio_movimentacoes SET justificativa = 'alterada' WHERE id = $1`, [mov1]); check(false, 'movimentação concluída não pode ser alterada'); }
  catch (e) { check(/retificação/.test(e.message), 'movimentação concluída não pode ser alterada nem pelo banco (gatilho)'); }

  console.log('  rejeição');
  const mov2 = (await val(u.adminCoaf, `SELECT patrimonio_movimentar($1, $2) id`, [A, JSON.stringify({
    tipo: 'TRANSFERENCIA_COORDENACAO', justificativa: 'Devolução para a COINFRA', itens: [{ bem_id: bem1, destino_unidade_id: coinfra.id, destino_responsavel_id: respCoinfra.id }] })])).id;
  await expectFail('rejeição exige motivo', u.coordCoinfra, `SELECT patrimonio_responder($1, false, '')`, [mov2], /motivo/);
  check((await val(u.coordCoinfra, `SELECT patrimonio_responder($1, false, 'Não temos espaço na sala') r`, [mov2])).r === 'REJEITADA', 'destinatário rejeita');
  b = await one(`SELECT unidade_id, situacao, responsavel_id, movimentacao_pendente_id FROM patrimonio_bens WHERE id = $1`, [bem1]);
  check(b.unidade_id === coaf.id && b.responsavel_id === respCoaf.id && b.situacao === 'EM_USO' && b.movimentacao_pendente_id === null, 'rejeitada: bem continua onde estava, liberado');
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM notificacoes WHERE tipo = 'MOVIMENTACAO_REJEITADA' AND referencia_id = $1`, [mov2])).n === 1, 'solicitante avisado da rejeição');
  await expectFail('servidor sem competência não movimenta bem de outro setor', u.coordCoinfra, `SELECT patrimonio_movimentar($1, $2)`, [A, JSON.stringify({
    tipo: 'TRANSFERENCIA_COORDENACAO', justificativa: 'Quero o computador', itens: [{ bem_id: bem1, destino_unidade_id: coinfra.id, destino_responsavel_id: respCoinfra.id }] })], /competência/);

  console.log('  troca');
  const bem2 = (await novoBem(u.adminCoinfra, { numero: '20001', descricao: 'Impressora HP LaserJet', unidade: coinfra.id, resp: respCoinfra.id })).rows[0].id;
  const troca = (await expectOk('COINFRA propõe trocar a impressora pelo computador da COAF', u.adminCoinfra, `SELECT patrimonio_movimentar($1, $2) id`, [A, JSON.stringify({
    tipo: 'TROCA', justificativa: 'Troca acordada entre as coordenações', itens: [{ bem_id: bem2, papel: 'ENTREGUE' }, { bem_id: bem1, papel: 'RECEBIDO' }] })]))?.rows[0].id;
  check((await one(`SELECT count(*)::int n FROM patrimonio_mov_itens WHERE movimentacao_id = $1`, [troca])).n === 2, 'os dois bens na mesma operação (um só número)');
  check((await val(u.coordCoinfra, `SELECT patrimonio_responder($1, true) r`, [troca])).r === 'PARCIAL', 'um lado confirma: troca fica pendente');
  check((await one(`SELECT unidade_id FROM patrimonio_bens WHERE id = $1`, [bem1])).unidade_id === coaf.id, 'nada muda antes da confirmação completa');
  check((await val(u.adminCoaf, `SELECT patrimonio_responder($1, true) r`, [troca])).r === 'CONCLUIDA', 'o outro lado confirma: troca concluída');
  const t1 = await one(`SELECT unidade_id, responsavel_id FROM patrimonio_bens WHERE id = $1`, [bem1]);
  const t2 = await one(`SELECT unidade_id, responsavel_id FROM patrimonio_bens WHERE id = $1`, [bem2]);
  check(t1.unidade_id === coinfra.id && t1.responsavel_id === respCoinfra.id && t2.unidade_id === coaf.id && t2.responsavel_id === respCoaf.id, 'cada bem foi para o lado do outro');

  console.log('  termo físico');
  const mov3 = (await val(u.adminCoinfra, `SELECT patrimonio_movimentar($1, $2) id`, [A, JSON.stringify({
    tipo: 'TRANSFERENCIA_SETOR', justificativa: 'Uso na gerência de manutenção', itens: [{ bem_id: bem1, destino_unidade_id: g1.id, destino_responsavel_id: respServ }] })])).id;
  await expectFail('administração não confirma sem o termo assinado quando há novo responsável', patri, `SELECT patrimonio_confirmar_administrativo($1)`, [mov3], /termo físico/);
  const termo = (await val(u.adminCoinfra, `SELECT patrimonio_termo($1) t`, [mov3])).t;
  check(!!termo.itens[0].destino.responsavel?.nome && termo.itens[0].destino.responsavel.matricula === '12345' && termo.itens[0].origem.unidade.sigla === 'COINFRA' && termo.itens[0].origem.responsavel.nome === 'Resp Coinfra', 'termo traz origem, destino e responsáveis');
  check((await one(`SELECT situacao FROM patrimonio_movimentacoes WHERE id = $1`, [mov3])).situacao === 'PENDENTE_REGULARIZACAO', 'termo emitido: pendente de regularização física');
  const doc = (await val(patri, `INSERT INTO documentos (tenant_id, unidade_id, recurso, registro_id, categoria, nome_arquivo, mime, tamanho) VALUES ($1, $2, 'patrimonio', $3, 'TERMO_ASSINADO', 'termo.pdf', 'application/pdf', 100) RETURNING id`, [A, coinfra.id, mov3])).id;
  await expectFail('confirmação por documento é só da administração patrimonial', u.adminCoinfra, `SELECT patrimonio_confirmar_administrativo($1, $2)`, [mov3, doc], /administração/);
  check((await val(patri, `SELECT patrimonio_confirmar_administrativo($1, $2, 'Conferido o termo assinado') r`, [mov3, doc])).r === 'CONCLUIDA', 'administração confirma com o termo digitalizado');
  const i3 = await one(`SELECT confirmacao_tipo, confirmado_por FROM patrimonio_mov_itens WHERE movimentacao_id = $1`, [mov3]);
  check(i3.confirmacao_tipo === 'DOCUMENTO_FISICO' && i3.confirmado_por === patri, 'confirmação registrada como documento físico, com quem conferiu');
  const meus = (await val(u.servidor, `SELECT patrimonio_buscar($1, '{"meus": true}') r`, [A])).r;
  check(meus.total === 1 && meus.itens[0].numero === '12345', 'servidor responsável consulta os bens sob sua guarda');
  check((await val(u.servidor, `SELECT patrimonio_ficha($1) f`, [bem1])).f.movimentacoes.length === 4, 'ficha do bem traz todas as movimentações');

  console.log('  retificação e baixa');
  const ret = (await expectOk('administração retifica a última transferência', patri, `SELECT patrimonio_retificar($1, 'Transferência registrada por engano') id`, [mov3]))?.rows[0].id;
  b = await one(`SELECT unidade_id, responsavel_id FROM patrimonio_bens WHERE id = $1`, [bem1]);
  check(b.unidade_id === coinfra.id && b.responsavel_id === respCoinfra.id, 'retificação devolve o bem ao estado anterior');
  check((await one(`SELECT retificada_por_id FROM patrimonio_movimentacoes WHERE id = $1`, [mov3])).retificada_por_id === ret, 'original preservada e marcada como retificada');
  await expectFail('não retifica duas vezes', patri, `SELECT patrimonio_retificar($1, 'Transferência registrada por engano')`, [mov3], /retificada/);
  await expectFail('administrativo não registra baixa', u.adminCoaf, `SELECT patrimonio_movimentar($1, $2)`, [A, JSON.stringify({ tipo: 'BAIXA', justificativa: 'Equipamento inservível', itens: [{ bem_id: bem2 }] })], /administração/);
  const baixa = (await val(patri, `SELECT patrimonio_movimentar($1, $2) id`, [A, JSON.stringify({ tipo: 'BAIXA', justificativa: 'Equipamento inservível (laudo 12/2026)', itens: [{ bem_id: bem2 }] })])).id;
  const bx = await one(`SELECT situacao, baixado_em, responsavel_id FROM patrimonio_bens WHERE id = $1`, [bem2]);
  check(bx.situacao === 'BAIXADO' && bx.baixado_em !== null && bx.responsavel_id === null && (await one(`SELECT situacao FROM patrimonio_movimentacoes WHERE id = $1`, [baixa])).situacao === 'CONCLUIDA', 'baixa registrada pela administração');
  await expectFail('bem baixado não se movimenta', patri, `SELECT patrimonio_movimentar($1, $2)`, [A, JSON.stringify({ tipo: 'MANUTENCAO', justificativa: 'Teste', itens: [{ bem_id: bem2 }] })], /baixado/);
  check((await one(`SELECT count(*)::int n FROM patrimonio_bens WHERE id = $1`, [bem2])).n === 1 && (await val(patri, `SELECT patrimonio_buscar($1, '{"situacoes": ["BAIXADO"]}') r`, [A])).r.total === 1,
    'bem baixado continua no cadastro e no histórico');

  console.log('  substituição');
  const bem4 = (await novoBem(u.adminCoinfra, { numero: '30001', descricao: 'Computador novo Lenovo', unidade: coinfra.id, resp: null })).rows[0].id;
  const subst = (await val(u.adminCoinfra, `SELECT patrimonio_movimentar($1, $2) id`, [A, JSON.stringify({
    tipo: 'SUBSTITUICAO', justificativa: 'Computador antigo lento', destino_substituido: 'ALMOXARIFADO',
    itens: [{ bem_id: bem1, papel: 'SUBSTITUIDO', destino_responsavel_id: null }, { bem_id: bem4, papel: 'SUBSTITUTO' }] })])).id;
  check((await val(u.coordCoinfra, `SELECT patrimonio_responder($1, true) r`, [subst])).r === 'CONCLUIDA', 'responsável confirma o substituto');
  const s1 = await one(`SELECT situacao, responsavel_id FROM patrimonio_bens WHERE id = $1`, [bem1]);
  const s4 = await one(`SELECT situacao, responsavel_id, local_id FROM patrimonio_bens WHERE id = $1`, [bem4]);
  check(s1.situacao === 'EM_ESTOQUE' && s1.responsavel_id === null && s4.situacao === 'EM_USO' && s4.responsavel_id === respCoinfra.id && s4.local_id === usf,
    'substituto assume o lugar e o responsável; o antigo vai para o almoxarifado');

  console.log('  inventário');
  const inv = (await expectOk('abre inventário da COINFRA', u.adminCoinfra, `SELECT patrimonio_abrir_inventario($1, $2) id`, [A, JSON.stringify({ titulo: 'Inventário anual COINFRA', unidade_id: coinfra.id })]))?.rows[0].id;
  const itens = (await val(u.adminCoinfra, `SELECT patrimonio_inventario($1) i`, [inv])).i.itens;
  check(itens.length === 2 && !itens.some((i) => i.bem.numero === '20001'), 'inventário lista os bens da unidade (sem os baixados)');
  const it4 = itens.find((i) => i.bem.numero === '30001').id;
  await expectOk('confere bem localizado com avaliação', u.adminCoinfra, `SELECT patrimonio_conferir($1, '{"status": "LOCALIZADO", "conservacao": "REGULAR"}')`, [it4]);
  check((await one(`SELECT conservacao, data_ultima_avaliacao FROM patrimonio_bens WHERE id = $1`, [bem4])).conservacao === 'REGULAR', 'avaliação do inventário atualiza a conservação do bem');
  await expectFail('divergência exige descrição', u.adminCoinfra, `SELECT patrimonio_conferir($1, '{"status": "DIVERGENCIA"}')`, [itens.find((i) => i.bem.numero === '12345').id], /divergência/);
  await expectOk('registra bem encontrado sem cadastro', u.adminCoinfra, `SELECT patrimonio_bem_sem_cadastro($1, '{"descricao": "Cadeira sem plaqueta", "numero": "?"}')`, [inv]);
  await expectFail('coordenador (consulta) não confere', u.coordCoinfra, `SELECT patrimonio_conferir($1, '{"status": "LOCALIZADO"}')`, [it4], /permissão/);
  await expectOk('encerra o inventário', u.adminCoinfra, `SELECT patrimonio_encerrar_inventario($1)`, [inv]);
  await expectFail('inventário encerrado não muda', u.adminCoinfra, `SELECT patrimonio_conferir($1, '{"status": "PENDENTE"}')`, [it4], /encerrado/);
  const resumo = (await val(u.coordCoinfra, `SELECT patrimonio_inventario($1) i`, [inv])).i.resumo;
  check(resumo.LOCALIZADO === 1 && resumo.SEM_CADASTRO === 1 && resumo.PENDENTE === 1, 'resumo do inventário por situação');

  const loc = (await val(u.adminCoaf, `SELECT patrimonio_localizar($1, '30001') l`, [A])).l;
  check(loc?.descricao === 'Computador novo Lenovo' && loc?.unidade?.sigla === 'COINFRA', 'localiza bem de outro setor pelo número (para a troca)');
  check((await val(u.adminB, `SELECT patrimonio_localizar($1, '30001') l`, [A])).l === null, 'outro órgão não localiza');

  console.log('  relatórios e painel');
  const ano = new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }).slice(0, 4);
  const r1 = (await val(u.gm, `SELECT patrimonio_registrar_relatorio($1, 'GERAL', 'Relatório geral', '{}', 2048) r`, [A])).r;
  const r2 = (await val(u.gm, `SELECT patrimonio_registrar_relatorio($1, 'CATEGORIA', 'Por categoria', '{"categoria_id": "x"}', 2048) r`, [A])).r;
  const r3 = (await val(patri, `SELECT patrimonio_registrar_relatorio($1, 'GERAL', 'Relatório geral', '{}', 2048) r`, [A])).r;
  check(r1.nome_arquivo === `RELATORIO DE PATRIMONIO - ANO ${ano}.pdf` && r2.nome_arquivo === `RELATORIO DE PATRIMONIO - ANO ${ano} - 001.pdf`
    && r3.nome_arquivo === `RELATORIO DE PATRIMONIO - ANO ${ano} - 002.pdf`, 'nome automático do arquivo, sem sobrescrever os anteriores');
  check((await val(u.gm, `SELECT arquivo_pode('arquivos', $1, 'enviar') p`, [r1.storage_path])).p === true, 'quem emitiu envia o PDF ao armazenamento');
  check((await val(u.gm, `SELECT arquivo_pode('arquivos', $1, 'ler') p`, [r1.storage_path])).p === true
    && (await val(patri, `SELECT arquivo_pode('arquivos', $1, 'ler') p`, [r1.storage_path])).p === true
    && (await val(u.dirAdm, `SELECT arquivo_pode('arquivos', $1, 'ler') p`, [r1.storage_path])).p === false, 'relatório: lido por quem emitiu e pela administração patrimonial');
  await expectFail('quem não exporta não emite relatório', u.servidor, `SELECT patrimonio_registrar_relatorio($1, 'GERAL', 'x', '{}', 10)`, [A], /permissão/);
  check((await val(u.gm, `SELECT patrimonio_relatorios_emitidos($1) r`, [A])).r.length === 2, 'histórico de relatórios emitidos');
  const painel = (await val(patri, `SELECT patrimonio_painel($1) p`, [A])).p;
  check(painel.total === 2 && painel.por_situacao.BAIXADO === 1 && painel.por_coordenacao.length >= 1 && painel.sem_responsavel === 1, 'painel com totais por situação, coordenação e sem responsável');
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE entidade = 'patrimonio_bens' AND registro_id = $1 AND acao = 'UPDATE'`, [bem1])), 'alterações do bem na auditoria');
  await db.exec('RESET ROLE');
}
