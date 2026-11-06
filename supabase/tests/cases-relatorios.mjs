// Casos das Fases 5 e 7: relatórios, painel, notificações, ordens de serviço, importação e exportação.
export default async function ({ db, as, ok, check, expectOk, expectFail, one, u, A, coinfra, coaf }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const rel = async (quem, filtros) => (await as(quem, `SELECT * FROM relatorio_notas($1)`, [JSON.stringify({ tenant_id: A, ...filtros })])).rows;
  const cons = async (quem, filtros) => (await as(quem, `SELECT * FROM relatorio_consumo($1)`, [JSON.stringify({ tenant_id: A, ...filtros })])).rows;
  const adminC = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  const ct = (await one(`SELECT id FROM contratos WHERE tenant_id = $1 AND numero = '001/2026'`, [A])).id;
  const dot2 = (await one(`SELECT id FROM classificacoes_orcamentarias WHERE ente_id = (SELECT ente_id FROM tenants WHERE id = $1) AND codigo_completo LIKE '2088 | 30.24%'`, [A])).id;
  const acao2090 = (await one(`SELECT id FROM classificadores WHERE ente_id = (SELECT ente_id FROM tenants WHERE id = $1) AND tipo = 'ACAO' AND codigo = '2090'`, [A])).id;
  const acao2088 = (await one(`SELECT id FROM classificadores WHERE ente_id = (SELECT ente_id FROM tenants WHERE id = $1) AND tipo = 'ACAO' AND codigo = '2088'`, [A])).id;
  const el30 = (await one(`SELECT id FROM classificadores WHERE ente_id = (SELECT ente_id FROM tenants WHERE id = $1) AND tipo = 'ELEMENTO' AND codigo = '30'`, [A])).id;
  const forn = (await one(`SELECT fornecedor_id FROM contratos WHERE id = $1`, [ct])).fornecedor_id;

  // Segundo empenho (exercício 2025, dotação 2088/30) com uma nota de R$ 250
  const emp25 = (await val(u.adminCoinfra, `INSERT INTO empenhos (tenant_id, contrato_id, numero, ano, data_empenho, valor, classificacao_id) VALUES ($1, $2, '900', 2025, '2025-12-10', 800, $3) RETURNING id`, [A, ct, dot2])).id;
  await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [JSON.stringify({ empenho_id: emp25, numero: '7001', valor: 250, data_emissao: '2026-01-15', referencias: [{ ano: 2025, mes: 12 }] })]);

  console.log('Relatório completo de notas por classificação');
  check((await rel(u.adminCoinfra, {})).length === 3, 'sem filtros: 3 notas válidas (a cancelada fica fora)');
  check((await rel(u.adminCoinfra, { incluir_canceladas: true })).length === 4, 'com canceladas: 4 notas, para relatório histórico');
  const nf1 = (await rel(u.adminCoinfra, {})).filter((r) => r.numero === '5501');
  check(nf1.length === 1 && nf1[0].unidades.includes(';'), 'nota com 2 unidades aparece UMA vez (unidades agregadas)');
  check((await rel(u.adminCoinfra, { anos: [2025] })).length === 1, 'ano 2025 (exercício do empenho): 1 nota');
  check((await rel(u.adminCoinfra, { anos: [2025, 2026] })).length === 3, 'vários anos: 2025 OU 2026 → 3 notas');
  check((await rel(u.adminCoinfra, { ano_base: 'EMISSAO', anos: [2025] })).length === 0, 'por data de emissão, nenhuma nota é de 2025');
  check((await rel(u.adminCoinfra, { acoes: [acao2090] })).length === 2, 'ação 2090: só as notas dos empenhos dessa ação');
  check((await rel(u.adminCoinfra, { acoes: [acao2090, acao2088] })).length === 3, 'ação 2090 OU 2088');
  check((await rel(u.adminCoinfra, { acoes: [acao2090], elementos: [el30] })).length === 0, 'ação 2090 E elemento 30 → nenhuma (E entre campos)');
  check((await rel(u.adminCoinfra, { acoes: [acao2088], elementos: [el30], anos: [2025] })).length === 1, 'ação + elemento + ano combinados');
  check((await rel(u.adminCoinfra, { fornecedores: [forn], contratos: [ct] })).length === 3, 'fornecedor + contrato');
  check((await rel(u.adminCoinfra, { fornecedores: ['00000000-0000-0000-0000-000000000099'] })).length === 0, 'fornecedor sem notas → vazio');
  const tot = (await val(u.adminCoinfra, `SELECT relatorio_notas_totais($1) t`, [JSON.stringify({ tenant_id: A })])).t;
  check(Number(tot.valor) === 1550 && tot.por_ano.length === 2 && Number(tot.por_ano.find((x) => x.ano === 2025).valor) === 250,
    `totais: geral R$ 1.550 e subtotal por ano (${JSON.stringify(tot.por_ano)})`);
  check((await rel(u.dirAdm, {})).length === 3, 'diretoria (consulta) gera o relatório da sua subárvore');
  check((await rel(u.adminCoaf, {})).length === 0, 'coordenação vizinha (sem designação vigente) não vê notas no relatório');
  check((await as(adminC, `SELECT * FROM relatorio_notas($1)`, [JSON.stringify({ tenant_id: A })])).rows.length === 0, 'outro órgão não vê nada, mesmo passando o id');
  await expectFail('a visão interna de classificação não é acessível pela API', u.adminCoinfra, `SELECT * FROM classificacao_detalhada`, [], /permission denied/);

  console.log('Relatório resumido de consumo');
  const c1 = await cons(u.adminCoinfra, {});
  const l2026 = c1.find((r) => r.ano === 2026 && r.acao_codigo === '2090');
  const l2025 = c1.find((r) => r.ano === 2025 && r.acao_codigo === '2088');
  check(c1.length === 2 && Number(l2026.valor) === 1300 && Number(l2025.valor) === 250, 'consumo (notas): 2026/2090/39 = R$ 1.300 e 2025/2088/30 = R$ 250, cada um na sua classificação');
  const c2 = await cons(u.adminCoinfra, { metrica: 'PAGO' });
  check(Number(c2.find((r) => r.ano === 2026).valor) === 1200, 'consumo pela métrica PAGO = R$ 1.200');
  const c3 = await cons(u.adminCoinfra, { metrica: 'EMPENHADO' });
  check(Number(c3.find((r) => r.ano === 2026).valor) === 1500 && Number(c3.find((r) => r.ano === 2025).valor) === 800, 'métrica EMPENHADO: 2026 = 1.500 (com reforço), 2025 = 800');
  const c4 = await cons(u.adminCoinfra, { detalhar: ['SUBELEMENTO', 'FONTE'] });
  check(c4.every((r) => r.fonte) && c4.find((r) => r.ano === 2026).subelemento.startsWith('16'), 'detalhamento por subelemento e fonte');
  check((await cons(u.adminCoinfra, { anos: [2025], acoes: [acao2090] })).length === 0, 'filtros combinados no resumo');
  await expectFail('métrica inválida é recusada', u.adminCoinfra, `SELECT * FROM relatorio_consumo($1)`, [JSON.stringify({ tenant_id: A, metrica: 'X' })], /Métrica/);
  check((await val(u.adminCoinfra, `SELECT anos_com_movimento($1) a`, [A])).a.join() === '2026,2025', 'anos com movimento para o filtro');

  console.log('Painel e notificações');
  const p = (await val(u.adminCoinfra, `SELECT painel($1, 2026) p`, [A])).p;
  check(p.contratos.vigentes >= 1 && Number(p.notas.valor) === 1300 && p.notas.pendentes_atesto === 1 && p.mensal.length === 12,
    `painel 2026: contratos, notas (R$ 1.300), pendências e série mensal (${JSON.stringify(p.notas)})`);
  check(p.por_acao[0].codigo === '2090', 'painel: consumo por ação');
  check((await val(adminC, `SELECT painel($1) p`, [A])).p.contratos.vigentes === 0, 'painel não vaza para outro órgão');
  const notif = (await val(u.novo, `SELECT minhas_notificacoes($1) n`, [A])).n;
  check(notif.some((x) => x.tipo === 'ATESTO'), 'suplente designado recebe a notificação de nota aguardando atesto');
  // empenho 100/2026: saldo R$ 200 de R$ 1.500 (13%); nota de R$ 150 deixa 3% → alerta de saldo baixo
  const emp26 = (await one(`SELECT id FROM empenhos WHERE tenant_id = $1 AND numero = '100'`, [A])).id;
  await as(u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [JSON.stringify({ empenho_id: emp26, numero: '5599', valor: 150, data_emissao: '2026-10-31', referencias: [{ ano: 2026, mes: 10 }] })]);
  const notifAdm = (await val(u.adminCoinfra, `SELECT minhas_notificacoes($1) n`, [A])).n;
  check(!notifAdm.some((x) => x.tipo === 'ATESTO') && notifAdm.some((x) => x.tipo === 'SALDO'), 'administrativo não recebe "seu atesto", mas recebe saldo baixo do empenho');

  console.log('Ordens de serviço');
  const os1 = await val(u.adminCoinfra, `INSERT INTO ordens_servico (tenant_id, unidade_id, titulo, numero, ano) VALUES ($1, $2, 'Troca de lâmpadas', 999, 1999) RETURNING id, numero, ano`, [A, coinfra.id]);
  const os2 = await val(u.adminCoinfra, `INSERT INTO ordens_servico (tenant_id, unidade_id, titulo, numero, ano) VALUES ($1, $2, 'Reparo hidráulico', 0, 0) RETURNING id, numero, ano`, [A, coinfra.id]);
  check(os1.numero === 1 && os2.numero === 2 && os1.ano === os2.ano, 'numeração automática NNNN/ANO (ignora o que o app mandar)');
  await expectFail('número de OS não muda', u.adminCoinfra, `UPDATE ordens_servico SET numero = 7 WHERE id = $1`, [os1.id], /permission denied|não pode/);
  await expectFail('cancelar OS sem motivo é recusado', u.adminCoinfra, `UPDATE ordens_servico SET status = 'CANCELADA' WHERE id = $1`, [os2.id], /motivo/);
  await expectOk('cancelar OS com motivo', u.adminCoinfra, `UPDATE ordens_servico SET status = 'CANCELADA', motivo_cancelamento = 'Aberta em duplicidade' WHERE id = $1`, [os2.id]);
  await expectFail('OS cancelada não reabre', u.adminCoinfra, `UPDATE ordens_servico SET status = 'ABERTA' WHERE id = $1`, [os2.id], /não pode mudar/);
  await expectOk('concluir OS', u.adminCoinfra, `UPDATE ordens_servico SET status = 'CONCLUIDA' WHERE id = $1`, [os1.id]);
  check(!!(await one(`SELECT data_conclusao FROM ordens_servico WHERE id = $1`, [os1.id])).data_conclusao, 'conclusão registra a data');
  await expectFail('diretoria (consulta) não abre OS', u.dirAdm, `INSERT INTO ordens_servico (tenant_id, unidade_id, titulo, numero, ano) VALUES ($1, $2, 'X', 0, 0)`, [A, coinfra.id]);
  await expectFail('administrativo não abre OS fora do escopo', u.adminCoinfra, `INSERT INTO ordens_servico (tenant_id, unidade_id, titulo, numero, ano) VALUES ($1, $2, 'Fora', 0, 0)`, [A, coaf.id]);
  check((await val(adminC, `SELECT count(*)::int n FROM ordens_servico`)).n === 0, 'outro órgão não vê OS');

  console.log('Importação');
  const linhasF = [
    { linha: 2, documento: '45.723.174/0001-10', razao_social: 'Nova Empresa Ltda', cidade: 'Aracaju', uf: 'se' },
    { linha: 3, documento: '11.222.333/0001-81', razao_social: 'Já existe' },
    { linha: 4, documento: '45723174000110', razao_social: 'Repetida no arquivo' },
    { linha: 5, documento: '123', razao_social: 'CNPJ ruim' },
  ];
  const prev = (await val(u.adminCoinfra, `SELECT importar_fornecedores($1, $2) r`, [A, JSON.stringify(linhasF)])).r;
  check(prev.validos === 1 && prev.duplicados.length === 2 && prev.erros.length === 1 && !prev.aplicado, 'prévia: 1 válido, 2 duplicados (cadastro e arquivo), 1 erro, nada gravado');
  await expectFail('com erros, a importação não grava nada', u.adminCoinfra, `SELECT importar_fornecedores($1, $2, true, true)`, [A, JSON.stringify(linhasF)], /Corrija/);
  await expectFail('com duplicados, exige confirmação para ignorar', u.adminCoinfra, `SELECT importar_fornecedores($1, $2, true, false)`, [A, JSON.stringify(linhasF.slice(0, 3))], /duplicado/);
  await expectOk('importa ignorando duplicados', u.adminCoinfra, `SELECT importar_fornecedores($1, $2, true, true)`, [A, JSON.stringify(linhasF.slice(0, 3))]);
  check(!!(await one(`SELECT 1 x FROM fornecedores WHERE tenant_id = $1 AND documento = '45723174000110' AND uf = 'SE'`, [A])), 'fornecedor importado com dados normalizados');
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE tenant_id = $1 AND acao = 'IMPORTACAO' AND entidade = 'fornecedores'`, [A])), 'importação registrada na auditoria');
  await expectFail('diretoria (consulta) não importa', u.dirAdm, `SELECT importar_fornecedores($1, '[]')`, [A], /permissão/);
  const ps = (await val(u.adminCoinfra, `SELECT importar_servidores($1, $2) r`, [A, JSON.stringify([
    { linha: 2, nome: 'Importado Um', matricula: '8001', unidade: 'GEMAN', cpf: '390.533.447-05' },
    { linha: 3, nome: 'Fora do Escopo', matricula: '8002', unidade: 'COAF' },
    { linha: 4, nome: 'Unidade Inexistente', matricula: '8003', unidade: 'XYZ' },
  ])])).r;
  check(ps.validos === 1 && ps.erros.length === 2 && ps.erros.some((e) => /escopo/.test(e.mensagem)), 'servidores: lotação pela sigla, recusa fora do escopo e unidade inexistente');
  await expectOk('importa o servidor válido (com CPF em dados pessoais)', u.adminCoinfra, `SELECT importar_servidores($1, $2, true)`, [A, JSON.stringify([{ linha: 2, nome: 'Importado Um', matricula: '8001', unidade: 'GEMAN', cpf: '390.533.447-05' }])]);
  check(!!(await one(`SELECT 1 x FROM servidores s JOIN servidores_dados_pessoais d ON d.servidor_id = s.id WHERE s.matricula = '8001' AND d.cpf = '39053344705'`)), 'CPF importado na tabela protegida');
  const pu = (await val(u.adminCoinfra, `SELECT importar_unidades_atendidas($1, $2, true, true) r`, [A, JSON.stringify([{ linha: 2, nome: 'UBS Nova', tipo: 'UBS' }, { linha: 3, nome: 'ubs centro', tipo: 'UBS' }])])).r;
  check(pu.validos === 1 && pu.duplicados.length === 1, 'unidades: nome já cadastrado (sem diferenciar maiúsculas) é duplicado');

  console.log('Exportação');
  await expectOk('exportação registrada por quem pode exportar', u.dirAdm, `SELECT registrar_exportacao($1, 'relatorios', 'Relatório completo 2026', 3)`, [A]);
  await expectFail('outro órgão não registra exportação em Alfa', adminC, `SELECT registrar_exportacao($1, 'fornecedores', 'x', 1)`, [A], /permissão/);
}
