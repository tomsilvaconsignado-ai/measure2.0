// Decretos do órgão (plataforma cadastra, órgão consulta), currículo e férias do servidor,
// férias no consolidado mensal e varredura de segurança dos objetos novos.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const adminC = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  const serv = (await one(`SELECT id FROM servidores WHERE tenant_id = $1 AND matricula = '12345'`, [A])).id;

  console.log('Decretos do órgão');
  const dec = (await val(u.plat, `INSERT INTO decretos_orgao (tenant_id, numero, descricao, data_publicacao) VALUES ($1, '7.123/2026', 'Regulamenta a fiscalização de contratos', '2026-01-15') RETURNING id`, [A])).id;
  check(!!dec, 'plataforma cadastra decreto do órgão');
  await expectFail('número de decreto repetido no mesmo órgão é recusado', u.plat,
    `INSERT INTO decretos_orgao (tenant_id, numero, descricao) VALUES ($1, ' 7.123/2026 ', 'Duplicado')`, [A]);
  await expectFail('Master do órgão não cadastra decreto (só a plataforma)', u.masterA,
    `INSERT INTO decretos_orgao (tenant_id, numero, descricao) VALUES ($1, '1/2026', 'Tentativa')`, [A]);
  check((await as(u.adminCoinfra, `SELECT numero FROM decretos_orgao WHERE tenant_id = $1`, [A])).rows.length === 1, 'administrativo do órgão consulta os decretos');
  check((await as(adminC, `SELECT 1 FROM decretos_orgao WHERE tenant_id = $1`, [A])).rows.length === 0, 'outro órgão não vê os decretos');
  check((await as(u.masterA, `UPDATE decretos_orgao SET descricao = 'Alterado' WHERE id = $1 RETURNING id`, [dec])).rows.length === 0, 'órgão não altera decreto');
  await expectFail('decreto não é apagado', u.plat, `DELETE FROM decretos_orgao WHERE id = $1`, [dec]);
  await expectOk('plataforma inativa decreto', u.plat, `UPDATE decretos_orgao SET ativo = false WHERE id = $1`, [dec]);
  await expectOk('plataforma reativa decreto', u.plat, `UPDATE decretos_orgao SET ativo = true WHERE id = $1`, [dec]);
  check((await val(u.adminCoinfra, `SELECT pode($1, null, 'decretos', 'ler') p`, [A])).p === true, 'papel operacional pode ler o PDF do decreto');
  check((await val(u.servidor, `SELECT pode($1, null, 'decretos', 'ler') p`, [A])).p === false, 'papel Servidor não acessa decretos');
  check((await one(`SELECT count(*)::int n FROM auditoria WHERE entidade = 'decretos_orgao' AND registro_id = $1`, [dec])).n >= 3, 'cadastro e alterações do decreto na auditoria');

  console.log('Dados curriculares');
  await expectOk('administrativo informa a escolaridade', u.adminCoinfra, `UPDATE servidores SET escolaridade = 'ESPECIALIZACAO', curriculo_observacoes = 'Atua com fiscalização desde 2020' WHERE id = $1`, [serv]);
  await expectFail('escolaridade fora da lista é recusada', u.adminCoinfra, `UPDATE servidores SET escolaridade = 'QUALQUER' WHERE id = $1`, [serv]);
  const item = (await val(u.adminCoinfra, `INSERT INTO servidor_curriculo_itens (servidor_id, tipo, titulo, instituicao, ano_conclusao, carga_horaria)
    VALUES ($1, 'CAPACITACAO', 'Fiscalização de contratos – Lei 14.133', 'Escola de Governo', 2025, 40) RETURNING id, tenant_id`, [serv]));
  check(item.tenant_id === A, 'item do currículo herda o órgão do servidor');
  await expectFail('outro órgão não inclui item no currículo', adminC, `INSERT INTO servidor_curriculo_itens (servidor_id, tipo, titulo) VALUES ($1, 'CURSO', 'Intruso')`, [serv]);
  await expectFail('perfil de consulta não inclui item no currículo', u.dirAdm, `INSERT INTO servidor_curriculo_itens (servidor_id, tipo, titulo) VALUES ($1, 'CURSO', 'Consulta')`, [serv]);
  check((await as(u.dirAdm, `SELECT 1 FROM servidor_curriculo_itens WHERE servidor_id = $1`, [serv])).rows.length === 1, 'perfil de consulta vê o currículo');
  check((await as(adminC, `SELECT 1 FROM servidor_curriculo_itens WHERE servidor_id = $1`, [serv])).rows.length === 0, 'outro órgão não vê o currículo');
  await expectFail('experiência com fim antes do início é recusada', u.adminCoinfra,
    `INSERT INTO servidor_curriculo_itens (servidor_id, tipo, titulo, inicio, fim) VALUES ($1, 'EXPERIENCIA', 'Analista', '2020-05-01', '2019-01-01')`, [serv]);
  await expectFail('item do currículo não é apagado', u.adminCoinfra, `DELETE FROM servidor_curriculo_itens WHERE id = $1`, [item.id]);
  await expectOk('item do currículo é removido logicamente', u.adminCoinfra, `UPDATE servidor_curriculo_itens SET excluido_em = now() WHERE id = $1`, [item.id]);

  console.log('Histórico de férias');
  const ins = (quem, f) => as(quem, `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim, gozo_inicio, gozo_fim, observacoes)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, dias, tenant_id`, [serv, f.ai, f.af, f.gi ?? null, f.gf ?? null, f.obs ?? null]);
  const f1 = (await ins(u.adminCoinfra, { ai: '2025-02-10', af: '2026-02-09', gi: '2026-03-02', gf: '2026-03-31' })).rows[0];
  check(f1.dias === 30 && f1.tenant_id === A, 'férias registradas: 30 dias, no órgão do servidor');
  const v1 = await val(u.adminCoinfra, `SELECT situacao, registrado_por_nome FROM v_servidor_ferias WHERE id = $1`, [f1.id]);
  check(v1.situacao === 'GOZADA' && !!v1.registrado_por_nome, `situação calculada (${v1.situacao}) e responsável pelo lançamento (${v1.registrado_por_nome})`);
  await expectFail('gozo sobreposto é recusado (duplicidade)', u.adminCoinfra, `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim, gozo_inicio, gozo_fim) VALUES ($1, '2025-02-10', '2026-02-09', '2026-03-15', '2026-03-20')`, [serv], /coincidem/);
  await expectFail('mais de 60 dias no mesmo período aquisitivo é recusado', u.adminCoinfra, `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim, gozo_inicio, gozo_fim) VALUES ($1, '2025-02-10', '2026-02-09', '2026-05-01', '2026-05-31')`, [serv], /60/);
  await expectFail('gozo maior que 60 dias é recusado', u.adminCoinfra, `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim, gozo_inicio, gozo_fim) VALUES ($1, '2024-02-10', '2025-02-09', '2025-06-01', '2025-08-30')`, [serv]);
  await expectFail('aquisitivo com fim antes do início é recusado', u.adminCoinfra, `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim) VALUES ($1, '2026-02-10', '2025-02-09')`, [serv]);
  const f2 = (await ins(u.adminCoinfra, { ai: '2026-02-10', af: '2027-02-09', obs: 'Aguardando programação' })).rows[0];
  check((await val(u.adminCoinfra, `SELECT situacao FROM v_servidor_ferias WHERE id = $1`, [f2.id])).situacao === 'PENDENTE', 'sem gozo: PENDENTE');
  await expectFail('mesmo período aquisitivo pendente duas vezes é recusado', u.adminCoinfra, `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim) VALUES ($1, '2026-02-10', '2027-02-09')`, [serv], /pendente/);
  await expectOk('programa o gozo do período pendente', u.adminCoinfra, `UPDATE servidor_ferias SET gozo_inicio = '2027-03-01', gozo_fim = '2027-03-15' WHERE id = $1`, [f2.id]);
  check((await val(u.adminCoinfra, `SELECT situacao, dias FROM v_servidor_ferias WHERE id = $1`, [f2.id])).situacao === 'PROGRAMADA', 'gozo no futuro: PROGRAMADA');
  await expectFail('perfil de consulta não lança férias', u.dirAdm, `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim) VALUES ($1, '2023-02-10', '2024-02-09')`, [serv]);
  check((await as(adminC, `SELECT 1 FROM v_servidor_ferias WHERE servidor_id = $1`, [serv])).rows.length === 0, 'outro órgão não vê as férias');
  check((await as(u.dirAdm, `SELECT 1 FROM v_servidor_ferias WHERE servidor_id = $1`, [serv])).rows.length === 2, 'perfil de consulta vê o histórico de férias');
  await expectFail('férias não são apagadas', u.adminCoinfra, `DELETE FROM servidor_ferias WHERE id = $1`, [f2.id]);
  await expectFail('cancelar sem motivo é recusado', u.adminCoinfra, `UPDATE servidor_ferias SET cancelada_em = now(), motivo_cancelamento = 'x' WHERE id = $1`, [f2.id], /motivo/);
  await expectOk('cancela as férias programadas com motivo', u.adminCoinfra,
    `UPDATE servidor_ferias SET cancelada_em = now(), motivo_cancelamento = 'Interesse do serviço', gozo_fim = '2027-03-30' WHERE id = $1`, [f2.id]);
  const c2 = await val(u.adminCoinfra, `SELECT situacao, gozo_fim::text, cancelada_por_nome FROM v_servidor_ferias WHERE id = $1`, [f2.id]);
  check(c2.situacao === 'CANCELADA' && c2.gozo_fim === '2027-03-15' && !!c2.cancelada_por_nome, 'cancelamento mantém o registro e não altera as datas');
  await expectFail('registro cancelado não é editado', u.adminCoinfra, `UPDATE servidor_ferias SET observacoes = 'nova' WHERE id = $1`, [f2.id], /canceladas/);
  await expectOk('período cancelado libera nova programação nas mesmas datas', u.adminCoinfra,
    `INSERT INTO servidor_ferias (servidor_id, aquisitivo_inicio, aquisitivo_fim, gozo_inicio, gozo_fim) VALUES ($1, '2026-02-10', '2027-02-09', '2027-03-01', '2027-03-15')`, [serv]);
  check((await one(`SELECT count(*)::int n FROM auditoria WHERE entidade = 'servidor_ferias'`)).n >= 4, 'férias registradas na auditoria');

  console.log('Férias no consolidado mensal');
  const fm = (await as(u.adminCoinfra, `SELECT * FROM ferias_do_consolidado($1, $2, 2026, 3)`, [A, coinfra.id])).rows;
  const linhaF = fm.find((r) => r.servidor_id === serv);
  check(linhaF && linhaF.dias === 30 && linhaF.dias_no_mes === 30 && linhaF.situacao === 'GOZADA', 'consolidado de março traz o servidor em férias (30 dias)');
  check((await as(u.adminCoinfra, `SELECT * FROM ferias_do_consolidado($1, $2, 2026, 2)`, [A, coinfra.id])).rows.every((r) => r.servidor_id !== serv), 'mês sem férias não traz o servidor');
  await expectFail('coordenação vizinha não vê as férias da COINFRA', u.adminCoaf, `SELECT * FROM ferias_do_consolidado($1, $2, 2026, 3)`, [A, coinfra.id], /acesso/);
  const doc = (await val(u.adminCoinfra, `SELECT emitir_consolidado($1, $2, 2026, 3) id`, [A, coinfra.id])).id;
  const dados = (await one(`SELECT dados FROM documentos_emitidos WHERE id = $1`, [doc])).dados;
  check(dados.ferias.some((f) => f.nome && f.inicio === '2026-03-02' && f.fim === '2026-03-31' && f.dias === 30 && f.situacao === 'GOZADA'),
    'consolidado emitido lista as férias do mês (nome, período, dias e situação)');
  const backup = (await val(u.masterA, `SELECT exportar_backup_orgao($1) b`, [A])).b;
  check(backup.tabelas.servidor_ferias.length >= 3 && backup.tabelas.decretos_orgao.length === 1 && 'servidor_curriculo_itens' in backup.tabelas,
    'cópia de segurança inclui decretos, currículo e férias');

  console.log('Varredura de segurança (objetos novos)');
  const semRls = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
  check(semRls.rows.length === 0, 'toda tabela pública tem RLS ' + (semRls.rows.length ? JSON.stringify(semRls.rows) : ''));
  const anonFn = await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')`);
  check(anonFn.rows.length === 0, 'nenhuma função pública executável sem login ' + (anonFn.rows.length ? JSON.stringify(anonFn.rows.map((r) => r.proname)) : ''));
  const anonTab = await db.query(`SELECT DISTINCT table_name FROM information_schema.role_table_grants WHERE grantee = 'anon' AND table_schema = 'public'`);
  check(anonTab.rows.length === 0, 'nenhuma tabela ou visão acessível sem login ' + (anonTab.rows.length ? JSON.stringify(anonTab.rows) : ''));
  const gatilhos = await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`);
  check(gatilhos.rows.length === 0, 'funções de gatilho não ficam executáveis pela API ' + (gatilhos.rows.length ? JSON.stringify(gatilhos.rows.map((r) => r.proname)) : ''));
}
