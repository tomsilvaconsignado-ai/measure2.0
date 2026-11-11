// Notificações formais de empresas contratadas: acesso por designação, dados automáticos, evidências, emissão
// com documento oficial, tramitação com prazos, resposta, análise, histórico do fornecedor, sanção separada,
// preservação e auditoria (critérios de aceite do upgrade 04).
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  console.log('Notificações formais às empresas contratadas');
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const p = { suplente: id(71), gestor: id(73), vizinho: id(74), fiscal: id(75) };
  const ct = (await one(`SELECT id, fornecedor_id FROM contratos WHERE numero = 'PUSH-1/2026'`));
  await db.query(`DELETE FROM foco_unidade`);

  // 1. acesso: designados e perfil autorizado; quem não é designado, não
  const ctx = (await val(p.fiscal, `SELECT nf_contexto($1) c`, [ct.id])).c;
  check(ctx.fornecedor.razao_social && ctx.fornecedor.documento && ctx.contrato.numero === 'PUSH-1/2026' && ctx.contrato.objeto && ctx.emissor.papel === 'FISCAL'
    && ctx.responsaveis.length === 3 && ctx.orgao.nome_oficial, 'critério 2: dados do órgão, fornecedor, contrato, responsáveis e emissor preenchidos automaticamente');
  await expectFail('critério 1: servidor sem designação não registra ocorrência', p.vizinho, `SELECT nf_contexto($1)`, [ct.id], /designado/);
  await expectFail('sem designação também não cria rascunho', p.vizinho, `SELECT nf_salvar($1)`, [JSON.stringify({ contrato_id: ct.id })], /designado/);
  const base = (extra = {}) => JSON.stringify({
    contrato_id: ct.id, regime_juridico: 'LEI_14133', regime_confirmado: true, gravidade: 'MEDIA', data_ocorrencia: '2026-11-05',
    local_ocorrencia: 'UBS Centro', fatos: 'Em 05/11/2026, durante vistoria na UBS Centro, constatou-se que a ordem de serviço nº 12 não foi executada no prazo, mantendo o ar-condicionado da sala de vacinas inoperante.',
    obrigacoes: 'Executar as ordens de serviço no prazo de 48 horas (Termo de Referência, item 8.2).', clausula: 'Cláusula Sétima', fundamentos: ['L14133_ART115', 'L14133_ART155_VII'],
    fundamentacao: 'Art. 115 e art. 155, VII, da Lei Federal nº 14.133/2021; Cláusula Sétima do contrato.', providencias: 'Executar imediatamente a OS nº 12 e apresentar relatório técnico do reparo.',
    prazo_dias: 5, prazo_tipo: 'UTEIS', prazo_resposta_dias: 5, prazo_texto: '5 dias úteis, contados da ciência.',
    consequencias: 'O não atendimento injustificado poderá ensejar a adoção das medidas administrativas cabíveis. Esta notificação não constitui aplicação de penalidade.',
    manifestacao: 'Fica assegurado à contratada o direito de apresentar esclarecimentos.', ...extra });
  const nf = (await val(p.fiscal, `SELECT nf_salvar($1) id`, [base()])).id;
  check(!!nf, 'critério 1: o fiscal registra a ocorrência no contrato em que é designado');
  check(!!(await val(p.suplente, `SELECT nf_salvar($1) id`, [base({ fatos: 'rascunho do suplente' })])).id, 'critério 1: o suplente também registra (condição registrada como suplente)');
  check((await one(`SELECT emissor_papel FROM notificacoes_formais WHERE criado_por = $1 ORDER BY criado_em DESC LIMIT 1`, [p.suplente])).emissor_papel === 'SUPLENTE', 'condição de suplente registrada');
  check(!!(await val(u.adminCoinfra, `SELECT nf_salvar($1) id`, [base()])).id, 'administrador autorizado (matriz) também registra');
  await expectFail('outro responsável não edita o rascunho alheio', p.gestor, `SELECT nf_salvar($1)`, [JSON.stringify({ id: nf, fatos: 'x' })], /outro responsável/);

  // 3. evidências: o fiscal (perfil SERVIDOR) anexa à notificação; quem não atua, não
  const anexo = (quem, cat, nome) => as(quem, `INSERT INTO documentos (tenant_id, unidade_id, recurso, registro_id, categoria, nome_arquivo, mime, tamanho, storage_path)
    VALUES ($1, $2, 'notificacoes_contratuais', $3, $4, $5, 'image/jpeg', 100, 'x') RETURNING id`, [A, coinfra.id, nf, cat, nome]);
  const foto = (await anexo(p.fiscal, 'EVIDENCIA', 'foto-sala.jpg')).rows[0].id;
  await anexo(p.fiscal, 'EVIDENCIA', 'relatorio.pdf');
  check(!!foto, 'critério 3: fiscal anexa várias evidências à notificação');
  await expectFail('quem não atua no contrato não anexa', p.vizinho, `INSERT INTO documentos (tenant_id, unidade_id, recurso, registro_id, nome_arquivo, mime, tamanho, storage_path)
    VALUES ($1, $2, 'notificacoes_contratuais', $3, 'x.pdf', 'application/pdf', 10, 'y')`, [A, coinfra.id, nf]);
  check((await val(p.vizinho, `SELECT count(*)::int n FROM documentos WHERE registro_id = $1`, [nf])).n === 0, 'anexos não ficam visíveis a quem não tem acesso');
  check((await val(p.gestor, `SELECT count(*)::int n FROM documentos WHERE registro_id = $1`, [nf])).n === 2, 'o gestor do contrato vê as evidências');

  // emissão: validações (fatos, regime, revisão, linguagem de penalidade)
  await expectFail('fatos insuficientes impedem a emissão', p.fiscal, `SELECT nf_emitir($1)`, [(await val(p.fiscal, `SELECT nf_salvar($1) id`, [base({ fatos: 'Serviço ruim.' })])).id], /fatos/);
  const semRegime = (await val(p.fiscal, `SELECT nf_salvar($1) id`, [base({ regime_confirmado: false })])).id;
  await expectFail('regime jurídico precisa ser confirmado', p.fiscal, `SELECT nf_emitir($1)`, [semRegime], /regime/);
  const revisar = (await val(p.fiscal, `SELECT nf_salvar($1) id`, [base({ revisao_juridica: true, clausula: '' })])).id;
  await expectFail('sem cláusula/fundamento seguro: exige revisão confirmada', p.fiscal, `SELECT nf_emitir($1)`, [revisar], /revis/);
  const punitiva = (await val(p.fiscal, `SELECT nf_salvar($1) id`, [base({ consequencias: 'Fica a empresa multada em 10% do valor do contrato por descumprimento.' })])).id;
  await expectFail('critério 13: o texto não pode declarar a empresa já penalizada', p.fiscal, `SELECT nf_emitir($1)`, [punitiva], /penalizada/);

  const doc = (await val(p.fiscal, `SELECT nf_emitir($1) d`, [nf])).d;
  const n1 = await one(`SELECT * FROM notificacoes_formais WHERE id = $1`, [nf]);
  check(n1.status === 'AGUARDANDO_ASSINATURA' && n1.numero >= 1 && n1.ano === new Date().getFullYear(), 'emitida com número/ano e aguardando assinatura');
  const emitido = await one(`SELECT tipo, dados FROM documentos_emitidos WHERE id = $1`, [doc]);
  check(emitido.tipo === 'NOTIFICACAO_FORMAL' && emitido.dados.orgao && emitido.dados.titulo.startsWith('NOTIFICAÇÃO FORMAL Nº') && emitido.dados.fatos.includes('ordem de serviço nº 12')
    && emitido.dados.fornecedor.documento && emitido.dados.emissor.papel === 'FISCAL' && emitido.dados.anexos.length === 2,
    'critérios 4 a 6: documento oficial gerado com o timbre do órgão, fundamentação, emissor e lista de evidências');
  check((await val(p.gestor, `SELECT count(*)::int n FROM documentos_emitidos WHERE id = $1`, [doc])).n === 1 && (await val(p.vizinho, `SELECT count(*)::int n FROM documentos_emitidos WHERE id = $1`, [doc])).n === 0,
    'documento legível só por quem tem acesso à notificação');
  check((await one(`SELECT count(*)::int n FROM notificacoes WHERE tipo = 'NOTIF_FORMAL_EMITIDA' AND referencia_id = $1`, [nf])).n === 2, 'gestor e suplente são avisados da emissão (central/PUSH)');
  await expectFail('critério 14: conteúdo emitido não é alterado', p.fiscal, `SELECT nf_salvar($1)`, [JSON.stringify({ id: nf, fatos: 'outro texto' })], /retificação/);
  await db.exec('RESET ROLE');
  let erro = null; try { await db.query(`UPDATE notificacoes_formais SET fatos = 'adulterado' WHERE id = $1`, [nf]); } catch (e) { erro = e.message; }
  check(/não pode ser alterado/.test(erro ?? ''), 'conteúdo emitido protegido até contra alteração direta');
  erro = null; try { await db.query(`DELETE FROM notificacoes_formais WHERE id = $1`, [nf]); } catch (e) { erro = e.message; }
  check(/não pode ser excluída/.test(erro ?? ''), 'notificação emitida não pode ser excluída');

  // 7. assinatura, envio, recusa, ciência e prazo
  await expectFail('assinatura exige o documento assinado anexado', p.fiscal, `SELECT nf_tramitar($1, 'ASSINATURA', $2)`, [nf, JSON.stringify({ assinado_por: 'Fiscal' })], /documento assinado/);
  const assinado = (await anexo(p.fiscal, 'ASSINADA', 'notificacao-assinada.pdf')).rows[0].id;
  check((await val(p.fiscal, `SELECT nf_tramitar($1, 'ASSINATURA', $2) s`, [nf, JSON.stringify({ documento_id: assinado, assinado_por: 'Nina Nova Fiscal', forma: 'MANUAL_DIGITALIZADA' })])).s === 'EMITIDA', 'assinatura manual digitalizada registrada');
  await expectFail('envio por e-mail exige o endereço', p.fiscal, `SELECT nf_tramitar($1, 'ENVIO', $2)`, [nf, JSON.stringify({ forma: 'EMAIL', data_hora: '2026-11-06T10:00' })], /e-mail/);
  check((await val(p.fiscal, `SELECT nf_tramitar($1, 'ENVIO', $2) s`, [nf, JSON.stringify({ forma: 'EMAIL', email: 'contato@empresa.com.br', data_hora: '2026-11-06T10:00', protocolo: 'E-123' })])).s === 'ENVIADA',
    'critério 7: envio registrado (e-mail, data/hora, protocolo) — ainda sem ciência');
  check((await val(p.fiscal, `SELECT nf_tramitar($1, 'RECUSA', '{}', 'Caixa de e-mail cheia; reenviar por protocolo') s`, [nf])).s === 'ENVIADA', 'recusa/impossibilidade de entrega registrada');
  await expectFail('ciência exige comprovante ou descrição do meio', p.fiscal, `SELECT nf_tramitar($1, 'CIENCIA', $2)`, [nf, JSON.stringify({ data_ciencia: '2026-11-06' })], /comprovante/);
  const st = (await val(p.fiscal, `SELECT nf_tramitar($1, 'CIENCIA', $2) s`, [nf, JSON.stringify({ data_ciencia: '2026-11-06', meio: 'Assinatura do representante no protocolo', representante: 'João Preposto' })])).s;
  const n2 = await one(`SELECT data_limite::text, data_limite_resposta::text FROM notificacoes_formais WHERE id = $1`, [nf]);
  check(n2.data_limite === '2026-11-13' && ['EM_PRAZO', 'PRAZO_VENCIDO'].includes(st), 'critérios 7 e 10: ciência registrada; prazo de 5 dias úteis conta da ciência (06/11 → 13/11)');
  check((await one(`SELECT count(*)::int n FROM notificacoes WHERE tipo = 'NOTIF_FORMAL_RECEBIDA' AND referencia_id = $1`, [nf])).n >= 2, 'responsáveis avisados da ciência');

  // prazo vencido pela rotina diária
  await db.exec('RESET ROLE');
  await db.query(`UPDATE notificacoes_formais SET status = 'EM_PRAZO', data_limite = hoje() - 1 WHERE id = $1`, [nf]);
  await db.query(`SELECT nf_prazos_diarios()`);
  check((await one(`SELECT status FROM notificacoes_formais WHERE id = $1`, [nf])).status === 'PRAZO_VENCIDO', 'critério 10: prazo vencido marcado automaticamente');
  check((await one(`SELECT count(*)::int n FROM notificacoes WHERE tipo = 'NOTIF_FORMAL_PRAZO_VENCIDO' AND referencia_id = $1`, [nf])).n >= 1, 'aviso de prazo vencido');

  // 8 e 9. resposta e análise
  const resp = (await val(p.fiscal, `SELECT nf_registrar_resposta($1, $2) id`, [nf, JSON.stringify({ data_resposta: '2026-11-10', recebida_por: 'Protocolo SMS', justificativa: 'Atraso na peça; reparo concluído em 09/11.', providencias_adotadas: 'Compressor substituído.' })])).id;
  check(!!resp && (await one(`SELECT status FROM notificacoes_formais WHERE id = $1`, [nf])).status === 'RESPONDIDA', 'critério 8: resposta da empresa registrada');
  await expectFail('análise exige justificativa', p.gestor, `SELECT nf_tramitar($1, 'ANALISE', $2, 'ok')`, [nf, JSON.stringify({ resultado: 'REGULARIZADA', resposta_id: resp, analise_resposta: 'ACEITA' })], /Fundamente/);
  check((await val(p.gestor, `SELECT nf_tramitar($1, 'ANALISE', $2, 'Vistoria em 10/11 confirmou o equipamento funcionando.') s`, [nf, JSON.stringify({ resultado: 'REGULARIZADA', resposta_id: resp, analise_resposta: 'ACEITA' })])).s === 'REGULARIZADA',
    'critério 9: o gestor analisa e registra o resultado (resposta aceita, regularizada)');
  check((await one(`SELECT analise, analisado_por FROM nf_respostas WHERE id = $1`, [resp])).analisado_por === p.gestor, 'autoria da análise registrada');
  check((await val(p.gestor, `SELECT nf_tramitar($1, 'ENCERRAMENTO', '{}', 'Ocorrência regularizada e verificada.') s`, [nf])).s === 'ENCERRADA', 'ocorrência encerrada com justificativa');
  const trams = (await one(`SELECT array_agg(tipo ORDER BY id) t, bool_and(autor_nome IS NOT NULL) a FROM nf_tramites WHERE notificacao_id = $1`, [nf]));
  check(['CRIADA', 'EMITIDA', 'ASSINATURA', 'ENVIO', 'RECUSA', 'CIENCIA', 'PRAZO_VENCIDO', 'RESPOSTA', 'ANALISE', 'ENCERRAMENTO'].every((t) => trams.t.includes(t)) && trams.a,
    'critério 15: trilha completa (criou, emitiu, assinou, enviou, ciência, respondeu, analisou, encerrou) com autor e data');
  erro = null; try { await db.query(`UPDATE nf_tramites SET justificativa = 'x' WHERE notificacao_id = $1`, [nf]); } catch (e) { erro = e.message; }
  check(/não pode ser alterado/.test(erro ?? ''), 'critério 14: histórico da tramitação não pode ser alterado');

  // 12 e 13. sanção é registro separado, por decisão da autoridade; nada automático
  check((await one(`SELECT count(*)::int n FROM fornecedor_sancoes WHERE fornecedor_id = $1`, [ct.fornecedor_id])).n === 0, 'critério 13: nenhuma sanção é criada pela notificação');
  await expectFail('fiscal não registra sanção aplicada', p.fiscal, `SELECT nf_registrar_sancao($1)`, [JSON.stringify({ fornecedor_id: ct.fornecedor_id, contrato_id: ct.id, tipo: 'ADVERTENCIA', processo: 'PA 1/2026', autoridade: 'Secretário', fundamento: 'Art. 156, I', decisao: 'Advertência', data_decisao: '2026-11-11' })], /autorizados/);
  const sanc = (await val(u.masterA, `SELECT nf_registrar_sancao($1) id`, [JSON.stringify({ fornecedor_id: ct.fornecedor_id, contrato_id: ct.id, notificacao_id: nf, tipo: 'ADVERTENCIA', processo: 'PA 1/2026', autoridade: 'Secretário Municipal de Saúde', fundamento: 'Art. 156, I, Lei 14.133/2021', decisao: 'Aplicada advertência após defesa.', data_decisao: '2026-11-11' })])).id;
  check(!!sanc, 'sanção efetivamente aplicada registrada com processo, autoridade, fundamento e decisão (perfil autorizado)');

  // 11. histórico permanente do fornecedor
  const hist = (await val(p.gestor, `SELECT fornecedor_historico_ocorrencias($1) h`, [ct.fornecedor_id])).h;
  check(hist.itens.some((i) => i.id === nf && i.status === 'ENCERRADA' && i.contrato_numero === 'PUSH-1/2026' && i.analise === 'ACEITA') && hist.sancoes.length === 1,
    'critérios 11 e 12: histórico do fornecedor com a notificação (separada) e a sanção aplicada (à parte)');
  const ctx2 = (await val(p.fiscal, `SELECT nf_contexto($1) c`, [ct.id])).c;
  check(ctx2.recorrencia.total >= 1 && ctx2.recorrencia.sancoes_vigentes === 1, 'alerta de ocorrências anteriores ao registrar nova notificação (sem presumir reincidência)');

  // retificação: nova versão, original preservado
  const nf2 = (await val(p.fiscal, `SELECT nf_salvar($1) id`, [base()])).id;
  await as(p.fiscal, `SELECT nf_emitir($1)`, [nf2]);
  const v2 = (await val(p.fiscal, `SELECT nf_retificar($1, 'Correção do número da OS citada') id`, [nf2])).id;
  await as(p.fiscal, `SELECT nf_salvar($1)`, [JSON.stringify({ ...JSON.parse(base()), id: v2, fatos: JSON.parse(base()).fatos.replace('nº 12', 'nº 13') })]);
  await as(p.fiscal, `SELECT nf_emitir($1)`, [v2]);
  const [a, b] = [await one(`SELECT status, numero, documento_emitido_id FROM notificacoes_formais WHERE id = $1`, [nf2]), await one(`SELECT status, numero, versao FROM notificacoes_formais WHERE id = $1`, [v2])];
  check(a.status === 'RETIFICADA' && b.numero === a.numero && b.versao === 2 && !!a.documento_emitido_id, 'retificação gera 2ª versão com o mesmo número; a original fica preservada');

  // cancelamento e painel
  await expectFail('cancelamento exige justificativa', p.fiscal, `SELECT nf_tramitar($1, 'CANCELAMENTO', '{}', 'erro')`, [v2], /Justifique/);
  await expectOk('cancelamento justificado', p.fiscal, `SELECT nf_tramitar($1, 'CANCELAMENTO', '{}', 'Emitida em duplicidade com outra notificação')`, [v2]);
  const painel = (await val(p.gestor, `SELECT nf_painel($1, $2) p`, [A, JSON.stringify({ contrato_id: ct.id })])).p;
  check(painel.indicadores.emitidas >= 1 && painel.itens.some((i) => i.id === nf && i.cnpj) && painel.indicadores.regularizadas >= 1, 'painel com indicadores e filtro por contrato');
  check((await val(p.vizinho, `SELECT nf_painel($1) p`, [A])).p.total === 0, 'quem não tem acesso não vê notificações no painel');

  // catálogos
  await expectFail('administrativo não mantém catálogos', u.adminCoinfra, `SELECT nf_catalogo_salvar($1, 'tipos', $2)`, [A, JSON.stringify({ grupo: 'F. Outras ocorrências', nome: 'Teste' })], /Master/);
  await expectOk('Master cadastra novo tipo de ocorrência', u.masterA, `SELECT nf_catalogo_salvar($1, 'tipos', $2)`, [A, JSON.stringify({ grupo: 'F. Outras ocorrências', nome: 'Uso indevido de uniforme', fundamentos: ['L14133_ART115'] })]);
  const cat = (await val(p.fiscal, `SELECT nf_catalogos($1) c`, [A])).c;
  check(cat.tipos.some((t) => t.nome === 'Uso indevido de uniforme') && cat.fundamentos.some((f) => f.codigo === 'L14133_ART156') && cat.modelos.length >= 4, 'catálogos do órgão (tipos, fundamentos e modelos)');
  check(cat.fundamentos.filter((f) => f.regime === 'MUNICIPAL').every((f) => f.revisao_pendente), 'normas municipais sem artigos validados ficam marcadas para revisão jurídica');
  await db.exec('RESET ROLE');
}
