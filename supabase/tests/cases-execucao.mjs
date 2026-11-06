// Casos das Fases 3 e 4: contratos, designações, dotações, aditivos, empenhos, notas, atesto e pagamentos.
export default async function ({ db, as, ok, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const adminC = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  const C = (await one(`SELECT id FROM tenants WHERE nome_curto = 'Gama'`)).id;
  const dot1 = (await one(`SELECT id FROM classificacoes_orcamentarias WHERE ente_id = (SELECT ente_id FROM tenants WHERE id = $1) AND codigo_completo LIKE '%2090%'`, [A])).id;
  const dot2 = (await one(`SELECT id FROM classificacoes_orcamentarias WHERE ente_id = (SELECT ente_id FROM tenants WHERE id = $1) AND codigo_completo LIKE '2088 | 30.24%'`, [A])).id;
  const caps = (await one(`SELECT id FROM unidades_atendidas WHERE tenant_id = $1 AND nome = 'CAPS'`, [A])).id;
  const ubs1 = (await one(`SELECT id FROM unidades_atendidas WHERE tenant_id = $1 AND nome = 'UBS Centro'`, [A])).id;
  const ubs2 = (await one(`SELECT id FROM unidades_atendidas WHERE tenant_id = $1 AND nome = 'USF Bairro Industrial'`, [A])).id;
  const forn = (await val(u.adminCoinfra, `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '11444777000161', 'Manutenção Predial Beta Ltda') RETURNING id`, [A])).id;
  const fornInativo = (await one(`SELECT id FROM fornecedores WHERE tenant_id = $1 AND NOT ativo`, [A])).id;

  console.log('Contratos');
  const novoContrato = (quem, numero, extra = {}) => as(quem,
    `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global)
     VALUES ($1, $2, $3, 'PREGAO_ELETRONICO', $4, 'Manutenção predial das unidades de saúde', hoje() - 30, hoje() + 300, $5) RETURNING id`,
    [A, extra.unidade ?? coinfra.id, numero, extra.fornecedor ?? forn, extra.valor ?? 100000]);
  const ct = (await expectOk('administrativo cadastra contrato na COINFRA', u.adminCoinfra, `SELECT 1`) && (await novoContrato(u.adminCoinfra, '001/2026')).rows[0].id);
  await expectFail('número de contrato repetido é recusado', u.adminCoinfra,
    `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global) VALUES ($1, $2, ' 001/2026', 'DISPENSA', $3, 'Outro objeto', hoje(), hoje() + 10, 10)`,
    [A, coinfra.id, forn], /contratos_numero_unico/);
  await expectFail('fornecedor inativo não entra em contrato novo', u.adminCoinfra,
    `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global) VALUES ($1, $2, '002/2026', 'DISPENSA', $3, 'Objeto', hoje(), hoje() + 10, 10)`,
    [A, coinfra.id, fornInativo], /inativo/);
  await expectFail('administrativo não cria contrato fora da sua coordenação', u.adminCoinfra,
    `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global) VALUES ($1, $2, '003/2026', 'DISPENSA', $3, 'Objeto', hoje(), hoje() + 10, 10)`,
    [A, coaf.id, forn]);
  await expectFail('diretoria (consulta) não cria contrato', u.dirAdm,
    `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global) VALUES ($1, $2, '004/2026', 'DISPENSA', $3, 'Objeto', hoje(), hoje() + 10, 10)`,
    [A, coinfra.id, forn]);
  await expectFail('data final antes da inicial é recusada', u.adminCoinfra,
    `INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global) VALUES ($1, $2, '005/2026', 'DISPENSA', $3, 'Objeto', hoje(), hoje() - 1, 10)`, [A, coinfra.id, forn]);
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 0, 'administrativo de outra coordenação não vê o contrato');
  check((await val(adminC, `SELECT count(*)::int n FROM contratos`)).n === 0, 'outro órgão não vê contratos');
  check((await val(u.dirAdm, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 1, 'diretoria acima lê o contrato');

  console.log('Dotação do contrato');
  await expectOk('vincula duas dotações (várias classificações por contrato)', u.adminCoinfra,
    `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2), ($1, $3)`, [ct, dot1, dot2]);
  await expectFail('outro órgão não vincula dotação ao contrato', adminC, `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2)`, [ct, dot1]);

  console.log('Designações');
  const fiscal = (await val(u.masterA, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, email_institucional) VALUES ($1, $2, 'Fiscal da COAF', '5001', 'admincoaf@teste.gov.br') RETURNING id, user_id`, [A, coaf.id]));
  check(fiscal.user_id === u.adminCoaf, 'servidor fiscal ligado à conta pelo e-mail');
  const achados = (await as(u.adminCoinfra, `SELECT * FROM buscar_servidores_designacao($1, 'fiscal da')`, [A])).rows;
  check(achados.length === 1 && achados[0].unidade_sigla && !('cpf' in achados[0]), 'administrativo encontra servidor de outra coordenação para designar (sem dados pessoais)');
  check((await as(u.adminCoaf, `SELECT count(*)::int n FROM servidores WHERE id = $1`, [fiscal.id])).rows[0].n === 1, 'a busca não amplia o acesso ao cadastro (só o próprio escopo lê a ficha)');
  await expectFail('quem não administra contratos não usa a busca de designação', u.dirAdm, `SELECT * FROM buscar_servidores_designacao($1, 'a')`, [A], /permissão/);
  const desig = (await val(u.adminCoinfra, `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel, portaria) VALUES ($1, $2, 'FISCAL', 'Portaria 12/2026') RETURNING id`, [ct, fiscal.id])).id;
  ok('administrativo designa fiscal (servidor de outra coordenação)');
  const exonerado = (await one(`SELECT id FROM servidores WHERE matricula = '12345' AND tenant_id = $1`, [A])).id;
  await expectFail('servidor exonerado não pode ser designado', u.adminCoinfra,
    `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel) VALUES ($1, $2, 'GESTOR')`, [ct, exonerado], /exonerad/);
  await expectFail('designação não troca de pessoa (encerrar e criar outra)', u.adminCoinfra,
    `UPDATE contrato_designacoes SET servidor_id = $1 WHERE id = $2`, [exonerado, desig]);
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 1, 'fiscal designado passa a ver o contrato de outra coordenação');
  const resp = (await as(u.adminCoinfra, `SELECT * FROM designacoes_do_contrato($1)`, [ct])).rows;
  check(resp.length === 1 && resp[0].servidor_nome === 'Fiscal da COAF' && resp[0].unidade_sigla, 'quem administra o contrato vê nome e lotação do fiscal de outra coordenação');
  await expectFail('quem não vê o contrato não lista os responsáveis', adminC, `SELECT * FROM designacoes_do_contrato($1)`, [ct], /não encontrado/);
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM contrato_dotacoes WHERE contrato_id = $1`, [ct])).n === 2, 'fiscal vê a dotação do contrato');
  await expectFail('fiscal não edita os dados do contrato', u.adminCoaf, `UPDATE contratos SET valor_global = 1 WHERE id = $1`, [ct]);

  console.log('Empenhos e reforços');
  const emp = (await expectOk('administrativo empenha na dotação do contrato', u.adminCoinfra,
    `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id, unidade_id, fornecedor_id) VALUES ($1, $2, '100', 2026, hoje(), 1000, $3, $4, $5) RETURNING id, unidade_id, fornecedor_id`,
    [A, ct, dot1, coaf.id, fornInativo]))?.rows[0];
  check(emp.unidade_id === coinfra.id && emp.fornecedor_id === forn, 'empenho herda unidade e fornecedor do contrato (ignora o que o app mandar)');
  const dot3 = (await val(u.plat, `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, fonte_id)
    SELECT ente_id, (SELECT acao_id FROM classificacoes_orcamentarias WHERE id = $2), elemento_id, fonte_id FROM classificacoes_orcamentarias WHERE id = $1
    RETURNING id`, [dot1, dot2])).id;
  await expectFail('empenho em dotação não vinculada ao contrato é recusado', u.adminCoinfra,
    `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id) VALUES ($1, $2, '101', 2026, hoje(), 10, $3)`, [A, ct, dot3], /não está vinculada/);
  await expectFail('dotação usada por empenho não sai do contrato', u.adminCoinfra,
    `DELETE FROM contrato_dotacoes WHERE contrato_id = $1 AND classificacao_id = $2`, [ct, dot1], /usada por empenho/);
  await expectFail('número de empenho repetido no ano é recusado', u.adminCoinfra,
    `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id) VALUES ($1, $2, '100', 2026, hoje(), 10, $3)`, [A, ct, dot1], /empenhos_numero_unico/);
  await expectOk('reforço de empenho', u.adminCoinfra, `INSERT INTO empenho_reforcos (empenho_id, data, valor, motivo) VALUES ($1, hoje(), 500, 'Complemento')`, [emp.id]);
  check(Number((await val(u.adminCoinfra, `SELECT saldo FROM v_empenhos WHERE id = $1`, [emp.id])).saldo) === 1500, 'saldo = 1.000 + 500 de reforço');
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM v_empenhos WHERE contrato_id = $1`, [ct])).n === 1, 'fiscal designado vê os empenhos do contrato');

  console.log('Notas fiscais');
  const nota = (quem, dados) => as(quem, `SELECT salvar_nota_fiscal($1) id`, [JSON.stringify({ empenho_id: emp.id, data_emissao: '2026-10-31', referencias: [{ ano: 2026, mes: 10 }], ...dados })]);
  const nf1 = (await nota(u.adminCoinfra, { numero: '5501', valor: 1200, unidades: [{ id: ubs1 }, { id: ubs2 }] })).rows[0].id;
  ok('nota de R$ 1.200 lançada com 2 unidades atendidas');
  await expectFail('nota acima do saldo é recusada com o saldo disponível', u.adminCoinfra,
    `SELECT salvar_nota_fiscal($1)`, [JSON.stringify({ empenho_id: emp.id, numero: '5502', valor: 400, data_emissao: '2026-10-31', referencias: [{ ano: 2026, mes: 10 }] })], /Saldo insuficiente.*R\$ 300,00/);
  await expectFail('exceção de saldo exige permissão de aprovar', u.adminCoinfra,
    `SELECT salvar_nota_fiscal($1)`, [JSON.stringify({ empenho_id: emp.id, numero: '5502', valor: 400, data_emissao: '2026-10-31', excecao_saldo: 'Urgência', referencias: [{ ano: 2026, mes: 10 }] })], /aprovar/);
  const nfExc = (await as(u.masterA, `SELECT salvar_nota_fiscal($1) id`, [JSON.stringify({ empenho_id: emp.id, numero: '5502', valor: 400, data_emissao: '2026-10-31', excecao_saldo: 'Serviço emergencial autorizado no processo', referencias: [{ ano: 2026, mes: 10 }] })])).rows[0].id;
  check((await one(`SELECT excecao_saldo FROM notas_fiscais WHERE id = $1`, [nfExc])).excecao_saldo.startsWith('Serviço emergencial'), 'Master registra exceção de saldo com justificativa');
  await expectOk('Master cancela a nota da exceção (motivo)', u.masterA, `SELECT cancelar_nota($1, 'Lançada só para teste de exceção')`, [nfExc]);
  check(Number((await val(u.adminCoinfra, `SELECT saldo FROM v_empenhos WHERE id = $1`, [emp.id])).saldo) === 300, 'nota cancelada sai do consumo do empenho');
  await expectFail('rateio que não fecha com o valor é recusado', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ empenho_id: emp.id, numero: '5503', valor: 100, data_emissao: '2026-10-31', referencias: [{ ano: 2026, mes: 10 }], unidades: [{ id: ubs1, valor: 60 }, { id: ubs2, valor: 30 }] })], /exatamente o valor/);
  await expectFail('grupo com rateio obrigatório exige escolher as unidades componentes', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ empenho_id: emp.id, numero: '5503', valor: 100, data_emissao: '2026-10-31', referencias: [{ ano: 2026, mes: 10 }], unidades: [{ id: caps }] })], /exige rateio/);
  const nf3 = (await nota(u.adminCoinfra, { numero: '5503', valor: 100, unidades: [{ id: ubs1, valor: 60 }, { id: ubs2, valor: 40 }] })).rows[0].id;
  ok('rateio de R$ 60 + R$ 40 em nota de R$ 100');
  await expectFail('nota sem mês de referência é recusada', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ empenho_id: emp.id, numero: '5504', valor: 10, data_emissao: '2026-10-31', referencias: [] })], /mês de referência/);
  await expectFail('inserir nota direto na tabela é bloqueado', u.adminCoinfra,
    `INSERT INTO notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, data_emissao, valor) VALUES ($1, $2, $3, $4, $5, 'X', hoje(), 1)`, [A, ct, emp.id, coinfra.id, forn]);
  await expectFail('ninguém muda o status de atesto direto', u.adminCoinfra, `UPDATE notas_fiscais SET status_atesto = 'ATESTADA' WHERE id = $1`, [nf1], /permission denied/);
  await expectFail('mesma nota do mesmo fornecedor não é lançada duas vezes', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ empenho_id: emp.id, numero: '5501', valor: 1, data_emissao: '2026-10-31', referencias: [{ ano: 2026, mes: 10 }] })], /notas_numero_unico/);
  check((await val(adminC, `SELECT count(*)::int n FROM notas_fiscais`)).n === 0, 'outro órgão não vê notas');

  console.log('Designado com papel SERVIDOR (sem acesso a fornecedores e à coordenação do contrato)');
  await as(u.plat, `SELECT conceder_vinculo('novo@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, coaf.id]);
  const suplente = (await val(u.masterA, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, email_institucional) VALUES ($1, $2, 'Suplente Servidor', '5002', 'novo@teste.gov.br') RETURNING id, user_id`, [A, coaf.id]));
  check(suplente.user_id === u.novo, 'suplente ligado à conta');
  await as(u.adminCoinfra, `INSERT INTO contrato_designacoes (contrato_id, servidor_id, papel) VALUES ($1, $2, 'SUPLENTE')`, [ct, suplente.id]);
  const vc = await val(u.novo, `SELECT count(*)::int n, max(fornecedor_nome) f, max(saldo::text) s FROM v_contratos`);
  check(vc.n === 1 && vc.f === 'Manutenção Predial Beta Ltda' && vc.s !== null, 'suplente (papel Servidor) vê o contrato com fornecedor e saldo');
  check((await val(u.novo, `SELECT count(*)::int n FROM v_notas`)).n === 3, 'suplente vê as 3 notas do contrato (inclusive a cancelada, no histórico)');
  check((await val(u.novo, `SELECT count(*)::int n FROM v_empenhos`)).n === 1, 'suplente vê o empenho do contrato');
  check((await val(u.novo, `SELECT count(*)::int n FROM v_contrato_dotacoes`)).n === 2, 'suplente vê as dotações com o código');
  check((await val(u.novo, `SELECT count(*)::int n FROM v_nota_unidades WHERE nome IS NOT NULL`)).n >= 2, 'suplente vê os nomes das unidades das notas');
  check((await val(u.novo, `SELECT count(*)::int n FROM fornecedores`)).n === 0, 'mas continua sem acesso ao cadastro de fornecedores');
  check((await val(adminC, `SELECT count(*)::int n FROM v_contratos`)).n === 0 && (await val(adminC, `SELECT count(*)::int n FROM v_notas`)).n === 0, 'visões não vazam para outro órgão');
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM v_contratos WHERE id <> $1`, [ct])).n === 0, 'visões não mostram contratos sem escopo nem designação');

  console.log('Atesto e pagamento');
  const texto = 'Atesto que os serviços da NF 5501 foram prestados de forma satisfatória.';
  // com a opção do órgão desligada, quem lançou a nota (sem designação) não atesta
  await db.query(`UPDATE tenant_configuracoes SET permitir_atesto_lancador = false WHERE tenant_id = $1`, [A]);
  await expectFail('administrativo que lançou, sem designação, não atesta com a opção desligada', u.adminCoinfra, `SELECT atestar_nota($1, $2)`, [nf1, texto], /designado/);
  await db.query(`UPDATE tenant_configuracoes SET permitir_atesto_lancador = true WHERE tenant_id = $1`, [A]);
  await expectFail('Master (não designado) não atesta', u.masterA, `SELECT atestar_nota($1, $2)`, [nf1, texto], /designado/);
  await expectFail('pagamento antes do atesto é recusado', u.adminCoinfra, `SELECT registrar_pagamento($1, hoje(), 100)`, [nf1], /atestada/);
  await expectOk('fiscal designado atesta a nota', u.adminCoaf, `SELECT atestar_nota($1, $2)`, [nf1, texto]);
  const at = await one(`SELECT papel, user_id FROM nota_atestos WHERE nota_id = $1`, [nf1]);
  check(at.papel === 'FISCAL' && at.user_id === u.adminCoaf, 'atesto registra quem atestou e o papel (FISCAL)');
  check((await one(`SELECT count(*)::int n FROM documentos_emitidos WHERE tipo = 'ATESTO' AND registro_id = $1`, [nf1])).n === 1, 'texto do atesto guardado como documento emitido');
  await expectFail('nota já atestada não é atestada de novo', u.adminCoaf, `SELECT atestar_nota($1, $2)`, [nf1, texto], /já foi atestada/);
  await expectFail('fiscal não registra pagamento', u.adminCoaf, `SELECT registrar_pagamento($1, hoje(), 100)`, [nf1]);
  await expectOk('pagamento parcial de R$ 700', u.adminCoinfra, `SELECT registrar_pagamento($1, hoje(), 700, 'OB 1234')`, [nf1]);
  check((await one(`SELECT status_pagamento FROM notas_fiscais WHERE id = $1`, [nf1])).status_pagamento === 'PARCIAL', 'status PARCIAL (não marca pago antes da quitação)');
  await expectFail('pagamento acima do restante é recusado', u.adminCoinfra, `SELECT registrar_pagamento($1, hoje(), 600)`, [nf1], /faltam R\$ 500,00/);
  await expectOk('pagamento do restante', u.adminCoinfra, `SELECT registrar_pagamento($1, hoje(), 500, 'OB 1300')`, [nf1]);
  check((await one(`SELECT status_pagamento FROM notas_fiscais WHERE id = $1`, [nf1])).status_pagamento === 'PAGO', 'status PAGO na quitação integral');
  await expectFail('nota com pagamento não é cancelada', u.masterA, `SELECT cancelar_nota($1, 'Teste de bloqueio')`, [nf1], /pagamentos/);
  await expectFail('nota paga não muda de valor', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ id: nf1, empenho_id: emp.id, numero: '5501', valor: 1100, data_emissao: '2026-10-31', referencias: [{ ano: 2026, mes: 10 }] })], /valor não pode/);

  console.log('Resumo financeiro do contrato');
  const r = await val(u.adminCoinfra, `SELECT valor_atual, empenhado, notas_valor, pago, saldo, situacao FROM v_contratos WHERE id = $1`, [ct]);
  check(Number(r.valor_atual) === 100000 && Number(r.empenhado) === 1500 && Number(r.notas_valor) === 1300 && Number(r.pago) === 1200 && Number(r.saldo) === 98700 && r.situacao === 'VIGENTE',
    `contrato: valor 100.000, empenhado 1.500, notas 1.300, pago 1.200, saldo 98.700, vigente (${JSON.stringify(r)})`);

  console.log('Aditivos e renovação');
  const adt = (await val(u.adminCoinfra, `INSERT INTO contrato_aditivos (contrato_id, numero, tipo, nova_data_fim, valor, descricao) VALUES ($1, '1º TA', 'PRAZO_E_VALOR', hoje() + 665, 25000, 'Prorrogação por 12 meses com acréscimo de 25%') RETURNING id`, [ct])).id;
  ok('aditivo de prazo e valor registrado como rascunho');
  await expectFail('aditivo com nova data anterior à vigência é recusado', u.adminCoinfra,
    `INSERT INTO contrato_aditivos (contrato_id, numero, tipo, nova_data_fim, descricao) VALUES ($1, '2º TA', 'PRAZO', hoje() + 10, 'Prazo menor que o atual')`, [ct], /posterior/);
  await expectFail('administrativo não aprova aditivo', u.adminCoinfra, `SELECT decidir_aditivo($1, true)`, [adt], /permissão/);
  await expectFail('aditivo não é aprovado mudando o status direto', u.masterA, `UPDATE contrato_aditivos SET status = 'APROVADO' WHERE id = $1`, [adt]);
  await expectOk('Master aprova o aditivo', u.masterA, `SELECT decidir_aditivo($1, true, 'Conforme parecer jurídico')`, [adt]);
  const r2 = await val(u.adminCoinfra, `SELECT valor_global, valor_atual, data_fim, data_fim_atual = hoje() + 665 AS fim_ok FROM v_contratos WHERE id = $1`, [ct]);
  check(Number(r2.valor_global) === 100000 && Number(r2.valor_atual) === 125000 && r2.fim_ok, 'valor atual 125.000 e nova vigência, sem sobrescrever o valor original');
  await expectFail('aditivo aprovado não é alterado', u.adminCoinfra, `UPDATE contrato_aditivos SET valor = 1 WHERE id = $1`, [adt], /não pode ser alterado/);
  const novo = (await val(u.adminCoinfra, `SELECT renovar_contrato($1, '010/2027', hoje() + 666, hoje() + 1031, 130000) id`, [ct])).id;
  const rn = await val(u.adminCoinfra, `SELECT numero_renovacao, contrato_origem_id, (SELECT count(*)::int FROM contrato_dotacoes WHERE contrato_id = $1) dot, (SELECT count(*)::int FROM contrato_designacoes WHERE contrato_id = $1 AND fim IS NULL) des FROM contratos WHERE id = $1`, [novo]);
  check(rn.numero_renovacao === 1 && rn.contrato_origem_id === ct && rn.dot === 2 && rn.des === 2, 'renovação cria novo contrato ligado ao anterior, com dotações, fiscal e suplente');
  check((await one(`SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 1, 'contrato anterior preservado como histórico');

  console.log('Extratos e fim da designação');
  const ext = (await val(u.adminCoaf, `SELECT emitir_extrato_contrato($1) id`, [ct])).id;
  const dados = (await one(`SELECT dados FROM documentos_emitidos WHERE id = $1`, [ext])).dados;
  check(dados.notas.length === 2 && dados.responsaveis[0].nome === 'Fiscal da COAF' && Number(dados.valor_atual) === 125000, 'extrato guarda notas, responsáveis e valores da época');
  await expectFail('documento emitido não é alterado', u.masterA, `UPDATE documentos_emitidos SET titulo = 'x' WHERE id = $1`, [ext]);
  await expectOk('extrato do empenho', u.adminCoinfra, `SELECT emitir_extrato_empenho($1)`, [emp.id]);
  await expectOk('administrativo encerra a designação do fiscal', u.adminCoinfra, `UPDATE contrato_designacoes SET fim = hoje(), motivo_fim = 'Substituição' WHERE id = $1`, [desig]);
  check((await val(u.adminCoaf, `SELECT count(*)::int n FROM contratos WHERE id = $1`, [ct])).n === 0, 'fim da designação: o ex-fiscal perde o acesso ao contrato');
  check((await one(`SELECT dados FROM documentos_emitidos WHERE id = $1`, [ext])).dados.responsaveis[0].nome === 'Fiscal da COAF', 'extrato emitido continua com o responsável da época');
  await expectFail('cancelar reforço que deixaria saldo negativo é recusado', u.adminCoinfra,
    `SELECT cancelar_reforco((SELECT id FROM empenho_reforcos WHERE empenho_id = $1), 'Teste de saldo')`, [emp.id], /negativo/);
  void nf3; void g1; void C;
}
