// Autoria dos registros: dois administradores na mesma coordenação. A cadastra; B vê, mas não altera nem exclui.
// O Master (permissão "aprovar") continua alterando; registros antigos sem autor seguem livres para o escopo.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  console.log('Autoria dos registros (administrador A × administrador B na mesma coordenação)');
  const B = '00000000-0000-0000-0000-000000000061';
  await db.query(`INSERT INTO auth.users VALUES ($1, 'admin2coinfra@teste.gov.br', '{"nome":"Administrador B"}')`, [B]);
  await expectOk('plataforma concede o segundo administrador da COINFRA', u.plat, `SELECT conceder_vinculo('admin2coinfra@teste.gov.br', $1, $2, 'ADMINISTRATIVO')`, [A, coinfra.id]);
  await db.query(`UPDATE vinculos SET ativo = true WHERE user_id = $1 AND tenant_id = $2`, [u.adminCoinfra, A]);
  await db.query(`DELETE FROM foco_unidade`);
  const naoAutor = /outro administrador/;
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];

  // ---------------------------------------------------------------- contrato
  const forn = (await one(`SELECT id FROM fornecedores WHERE documento = '11444777000161'`)).id;
  const ct = (await val(u.adminCoinfra, `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global, criado_por)
    VALUES ($1, $2, 'AUT-1/2026', 'DISPENSA', $3, 'Contrato do administrador A', hoje(), hoje() + 300, 1000, $4) RETURNING id, criado_por`, [A, coinfra.id, forn, B]));
  check(ct.criado_por === u.adminCoinfra, 'autoria gravada pelo banco com o id de quem cadastrou (não aceita outro autor)');
  check((await val(B, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct.id])).n === 1, 'contrato: B visualiza');
  check((await val(B, `SELECT count(*)::int n FROM v_contratos WHERE id = $1`, [ct.id])).n === 1, 'contrato: B consulta os detalhes');
  await expectFail('contrato: B não edita', B, `UPDATE contratos SET objeto = 'Alterado por B' WHERE id = $1`, [ct.id], naoAutor);
  await expectOk('contrato: A edita', u.adminCoinfra, `UPDATE contratos SET objeto = 'Corrigido por A' WHERE id = $1`, [ct.id]);
  await expectFail('contrato: ninguém troca o autor', u.adminCoinfra, `UPDATE contratos SET criado_por = $2 WHERE id = $1`, [ct.id, B]);
  await expectOk('contrato: Master (perfil superior) edita', u.masterA, `UPDATE contratos SET observacoes = 'Revisado pelo Master' WHERE id = $1`, [ct.id]);
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('measure.justificativa', 'Inativação de teste', false)`);
  await expectFail('contrato: B não inativa', B, `UPDATE contratos SET ativo = false WHERE id = $1`, [ct.id], naoAutor);
  await db.query(`SELECT set_config('measure.justificativa', '', false)`);
  const dot = (await one(`SELECT classificacao_id FROM empenhos WHERE tenant_id = $1 AND ano = 2026 AND classificacao_id IS NOT NULL LIMIT 1`, [A])).classificacao_id;
  await expectOk('contrato: A vincula dotação', u.adminCoinfra, `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2)`, [ct.id, dot]);
  await expectFail('contrato: B não remove a dotação lançada por A', B, `DELETE FROM contrato_dotacoes WHERE contrato_id = $1`, [ct.id], naoAutor);

  // ---------------------------------------------------------------- empenho e reforço
  const emp = (await val(u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id) VALUES ($1, $2, 'AUT-9', 2026, hoje(), 900, $3) RETURNING id`, [A, ct.id, dot])).id;
  check((await val(B, `SELECT count(*)::int n FROM v_empenhos WHERE id = $1`, [emp])).n === 1, 'empenho: B visualiza');
  await expectFail('empenho: B não edita', B, `UPDATE empenhos SET observacoes = 'B' WHERE id = $1`, [emp], naoAutor);
  await expectOk('empenho: A edita', u.adminCoinfra, `UPDATE empenhos SET observacoes = 'A' WHERE id = $1`, [emp]);
  const ref = (await val(u.adminCoinfra, `INSERT INTO empenho_reforcos (empenho_id, data, valor, motivo) VALUES ($1, hoje(), 10, 'Complemento') RETURNING id`, [emp])).id;
  await expectFail('reforço: B não cancela o reforço de A', B, `SELECT cancelar_reforco($1, 'Lançado errado')`, [ref], naoAutor);
  await expectOk('reforço: B lança um reforço novo no empenho de A (registro dele)', B, `INSERT INTO empenho_reforcos (empenho_id, data, valor, motivo) VALUES ($1, hoje(), 5, 'Reforço de B')`, [emp]);

  // ---------------------------------------------------------------- nota fiscal
  const dadosNota = (extra) => JSON.stringify({ empenho_id: emp, numero: 'AUT-NF-1', valor: 100, data_emissao: '2026-10-10', referencias: [{ ano: 2026, mes: 10 }], ...extra });
  const nf = (await val(u.adminCoinfra, `SELECT salvar_nota_fiscal($1) id`, [dadosNota({})])).id;
  check((await one(`SELECT criado_por FROM notas_fiscais WHERE id = $1`, [nf])).criado_por === u.adminCoinfra, 'nota: autor gravado');
  check((await val(B, `SELECT count(*)::int n FROM v_notas WHERE id = $1`, [nf])).n === 1, 'nota: B visualiza e consulta os detalhes');
  await expectFail('nota: B não edita', B, `SELECT salvar_nota_fiscal($1)`, [dadosNota({ id: nf, numero: 'AUT-NF-1B' })], naoAutor);
  await expectFail('nota: B não edita campos direto', B, `UPDATE notas_fiscais SET observacoes = 'B' WHERE id = $1`, [nf], naoAutor);
  await expectFail('nota: B não exclui', B, `SELECT excluir_nota($1, 'Tentativa de B')`, [nf], naoAutor);
  await expectFail('nota: B não cancela', B, `SELECT cancelar_nota($1, 'Tentativa de B')`, [nf], naoAutor);
  await expectOk('nota: A edita', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [dadosNota({ id: nf, observacoes: 'Ajuste de A' })]);
  // atesto pelo fiscal designado e pagamento por B: registros novos, que só atualizam a situação da nota
  await db.exec('RESET ROLE');
  const desig = await one(`SELECT s.id, s.user_id FROM servidores s WHERE s.tenant_id = $1 AND s.user_id = $2
    AND (s.data_exoneracao IS NULL OR s.data_exoneracao > hoje()) LIMIT 1`, [A, u.adminCoaf]);
  await expectOk('atesto: A designa o fiscal no próprio contrato', u.adminCoinfra,
    `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel) VALUES ($1, $2, 'FISCAL')`, [ct.id, desig.id]);
  await expectOk('atesto: o fiscal designado atesta a nota cadastrada por A', u.adminCoaf, `SELECT atestar_nota($1, 'Atesto o serviço prestado')`, [nf]);
  await expectFail('atesto: ninguém altera o atesto registrado', B, `UPDATE nota_atestos SET texto = 'x' WHERE nota_id = $1`, [nf]);
  await expectOk('pagamento: B registra o pagamento da nota de A (registro dele)', B, `SELECT baixar_pagamento($1)`, [JSON.stringify({ nota_id: nf, data_pagamento: new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }), valor: '40', documento: 'OB B', justificativa_ordem: 'Teste de autoria fora da ordem', retencoes: { iss: '0', irrf: '0', inss: '0', federais: '0', outras: '0' } })]);
  const pg = (await one(`SELECT id, registrado_por FROM nota_pagamentos WHERE nota_id = $1`, [nf]));
  check(pg.registrado_por === B, 'pagamento: autor gravado (B)');
  await expectFail('pagamento: A não cancela o pagamento lançado por B', u.adminCoinfra, `SELECT cancelar_pagamento($1, 'Tentativa de A')`, [pg.id], naoAutor);
  await expectOk('pagamento: B cancela o próprio pagamento', B, `SELECT cancelar_pagamento($1, 'Valor errado')`, [pg.id]);
  check((await one(`SELECT status_pagamento FROM notas_fiscais WHERE id = $1`, [nf])).status_pagamento === 'PENDENTE', 'nota volta a pendente (situação atualizada mesmo sendo de A)');
  // nota antiga sem autor: qualquer administrador do escopo
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  const antiga = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, data_emissao, valor)
    VALUES ($1, $2, $3, $4, $5, 'AUT-ANTIGA', '2025-01-10', 1.00) RETURNING id, criado_por`, [A, ct.id, emp, coinfra.id, forn]));
  check(antiga.criado_por === null, 'nota migrada fica sem autor (nenhuma autoria retroativa)');
  await expectOk('nota antiga sem autor: B edita, como antes', B, `UPDATE notas_fiscais SET observacoes = 'Ajuste de B' WHERE id = $1`, [antiga.id]);

  // ---------------------------------------------------------------- ordem de serviço
  const os = (await val(u.adminCoinfra, `INSERT INTO ordens_servico (tenant_id, unidade_id, titulo, numero, ano) VALUES ($1, $2, 'OS do A', 0, 0) RETURNING id`, [A, coinfra.id])).id;
  check((await val(B, `SELECT count(*)::int n FROM ordens_servico WHERE id = $1`, [os])).n === 1, 'OS: B visualiza');
  await expectFail('OS: B não edita', B, `UPDATE ordens_servico SET titulo = 'B' WHERE id = $1`, [os], naoAutor);
  await expectOk('OS: A edita', u.adminCoinfra, `UPDATE ordens_servico SET titulo = 'OS do A (ajustada)' WHERE id = $1`, [os]);

  // ---------------------------------------------------------------- documentos anexados
  const doc = (await val(u.adminCoinfra, `INSERT INTO documentos (tenant_id, unidade_id, recurso, registro_id, nome_arquivo, mime, tamanho) VALUES ($1, $2, 'notas_fiscais', $3, 'nf.pdf', 'application/pdf', 10) RETURNING id`, [A, coinfra.id, nf])).id;
  check((await val(B, `SELECT count(*)::int n FROM documentos WHERE id = $1`, [doc])).n === 1, 'documento: B visualiza');
  await expectFail('documento: B não exclui o documento enviado por A', B, `SELECT excluir_documento($1, 'Tentativa de B')`, [doc], naoAutor);
  await expectOk('documento: A exclui o próprio documento', u.adminCoinfra, `SELECT excluir_documento($1, 'Arquivo errado')`, [doc]);

  // ---------------------------------------------------------------- patrimônio
  const cat = (await one(`SELECT id FROM patrimonio_categorias WHERE tenant_id = $1 AND pai_id IS NULL LIMIT 1`, [A])).id;
  const bem = (await val(u.adminCoinfra, `INSERT INTO patrimonio_bens (tenant_id, numero, descricao, categoria_id, unidade_id) VALUES ($1, 'AUT-BEM-1', 'Mesa do A', $2, $3) RETURNING id`, [A, cat, coinfra.id])).id;
  check((await val(B, `SELECT count(*)::int n FROM patrimonio_bens WHERE id = $1`, [bem])).n === 1, 'patrimônio: B visualiza');
  await expectFail('patrimônio: B não edita o cadastro do bem', B, `UPDATE patrimonio_bens SET descricao = 'B' WHERE id = $1`, [bem], naoAutor);
  await expectOk('patrimônio: A edita', u.adminCoinfra, `UPDATE patrimonio_bens SET descricao = 'Mesa do A (ajustada)' WHERE id = $1`, [bem]);

  // ---------------------------------------------------------------- tela
  check((await val(B, `SELECT pode_alterar_registro($1, $2, 'notas_fiscais', $3) p`, [A, coinfra.id, u.adminCoinfra])).p === false
    && (await val(u.adminCoinfra, `SELECT pode_alterar_registro($1, $2, 'notas_fiscais', $3) p`, [A, coinfra.id, u.adminCoinfra])).p === true
    && (await val(u.masterA, `SELECT pode_alterar_registro($1, $2, 'notas_fiscais', $3) p`, [A, coinfra.id, u.adminCoinfra])).p === true,
    'a tela recebe a mesma regra (autor e Master alteram; B só consulta)');
  check((await val(B, `SELECT nome FROM autores_do_orgao($1, $2)`, [A, [u.adminCoinfra]]))?.nome?.length > 0, 'nome do autor exibido para os colegas do órgão');
  check(desig !== undefined, 'fixture de designação disponível');
  await db.exec('RESET ROLE');
}
