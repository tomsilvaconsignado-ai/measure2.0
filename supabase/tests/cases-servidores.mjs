// Casos das Fases 6 e 8: frequência mensal, consolidado, checklist da nota, cópia de segurança,
// registro de erros e varredura de segurança (RLS e funções expostas).
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra, coaf }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const cons = async (quem, unidade, ano, mes) => (await as(quem, `SELECT * FROM consolidado_mensal($1, $2, $3, $4)`, [A, unidade, ano, mes])).rows;
  const adminC = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  const serv = (await one(`SELECT id, atualizado_em FROM servidores WHERE tenant_id = $1 AND matricula = '12345'`, [A]));
  const semCpf = (await one(`SELECT id FROM servidores WHERE tenant_id = $1 AND matricula = '777'`, [A])).id;
  const daCoaf = (await one(`SELECT id FROM servidores WHERE tenant_id = $1 AND matricula = '5001'`, [A])).id;

  console.log('Consolidado mensal: servidores do mês');
  const fev25 = await cons(u.adminCoinfra, coinfra.id, 2025, 2);
  const st = fev25.find((r) => r.matricula === '12345');
  check(st && st.observacao === 'Nomeação em 10/02/2025.', `nomeação no mês aparece na observação (${st?.observacao})`);
  check(!fev25.some((r) => r.matricula === '5001'), 'Coordenação escolhida não traz servidor de outra coordenação');
  check((await cons(u.adminCoinfra, coinfra.id, 2025, 1)).every((r) => r.matricula !== '12345'), 'antes da nomeação o servidor não entra');
  const mar = await cons(u.adminCoinfra, coinfra.id, 2026, 3);
  check(mar.some((r) => r.matricula === '12345') && mar.some((r) => r.matricula === '777'), 'Coordenação inclui as gerências subordinadas (GEMAN)');
  check(new Set(mar.map((r) => r.servidor_id)).size === mar.length, 'sem servidor duplicado');
  check(mar.find((r) => r.matricula === '777').observacao === 'Frequência integral.', 'sem ocorrência: "Frequência integral."');
  check(mar.map((r) => r.nome.toLowerCase()).join() === mar.map((r) => r.nome.toLowerCase()).sort((a, b) => a.localeCompare(b)).join(), 'ordem alfabética');
  check((await cons(u.dirAdm, coinfra.id, 2026, 3)).length === mar.length, 'diretoria (consulta) vê o consolidado da subárvore');
  await expectFail('outro órgão não consulta o consolidado', adminC, `SELECT * FROM consolidado_mensal($1, $2, 2026, 3)`, [A, coinfra.id], /acesso/);
  await expectFail('coordenação vizinha não consulta o consolidado da COINFRA', u.adminCoaf, `SELECT * FROM consolidado_mensal($1, $2, 2026, 3)`, [A, coinfra.id], /acesso/);
  await expectFail('mês inválido é recusado', u.adminCoinfra, `SELECT * FROM consolidado_mensal($1, $2, 2026, 13)`, [A, coinfra.id], /inválido/);

  console.log('Lançamento de atrasos e faltas');
  const lanc = (linhas) => JSON.stringify(linhas);
  await expectOk('administrativo lança atrasos/faltas do mês', u.adminCoinfra, `SELECT salvar_frequencias($1, 2026, 3, $2)`,
    [A, lanc([{ servidor_id: serv.id, atrasos: 2, faltas: 1, justificativa_anexada: true }, { servidor_id: semCpf, atrasos: 1 }])]);
  const mar2 = await cons(u.adminCoinfra, coinfra.id, 2026, 3);
  const a = mar2.find((r) => r.matricula === '12345');
  check(a.atrasos === 2 && a.faltas === 1 && a.observacao === 'Justificativa anexada.', 'com justificativa: "Justificativa anexada."');
  check(mar2.find((r) => r.matricula === '777').observacao === '', 'ocorrência sem justificativa: observação em branco');
  check((await one(`SELECT atualizado_em FROM servidores WHERE id = $1`, [serv.id])).atualizado_em.getTime() === serv.atualizado_em.getTime(),
    'o lançamento mensal não altera o cadastro permanente do servidor');
  await expectOk('texto ajustado à mão prevalece', u.adminCoinfra, `SELECT salvar_frequencias($1, 2026, 3, $2)`,
    [A, lanc([{ servidor_id: semCpf, atrasos: 1, observacao: 'Atraso compensado.' }])]);
  check((await cons(u.adminCoinfra, coinfra.id, 2026, 3)).find((r) => r.matricula === '777').observacao === 'Atraso compensado.', 'observação manual no consolidado');
  check((await one(`SELECT count(*)::int n FROM frequencias_mensais WHERE servidor_id = $1`, [semCpf])).n === 1, 'regravar o mês atualiza, sem duplicar o lançamento');
  await expectFail('perfil de consulta não lança frequência', u.dirAdm, `SELECT salvar_frequencias($1, 2026, 3, $2)`, [A, lanc([{ servidor_id: serv.id, faltas: 3 }])], /permiss|não pode/);
  await expectFail('administrativo não lança frequência fora do escopo (COAF)', u.adminCoinfra, `SELECT salvar_frequencias($1, 2026, 3, $2)`, [A, lanc([{ servidor_id: daCoaf, faltas: 3 }])], /não pode/);
  await expectFail('faltas acima do limite do mês são recusadas', u.adminCoinfra, `SELECT salvar_frequencias($1, 2026, 3, $2)`, [A, lanc([{ servidor_id: serv.id, faltas: 40 }])], /check/);
  await expectFail('ninguém grava direto na tabela (só pela função)', u.adminCoinfra,
    `INSERT INTO frequencias_mensais (tenant_id, servidor_id, unidade_id, ano, mes) VALUES ($1, $2, $3, 2026, 4)`, [A, serv.id, coinfra.id], /permission denied/);
  check((await one(`SELECT count(*)::int n FROM auditoria WHERE entidade = 'frequencias_mensais'`)).n >= 3, 'lançamentos auditados');

  console.log('Exoneração no mês');
  await expectOk('exoneração registrada no cadastro', u.adminCoinfra, `UPDATE servidores SET data_exoneracao = '2026-03-20' WHERE id = $1`, [semCpf]);
  await expectOk('limpa o texto manual', u.adminCoinfra, `SELECT salvar_frequencias($1, 2026, 3, $2)`, [A, lanc([{ servidor_id: semCpf }])]);
  check((await cons(u.adminCoinfra, coinfra.id, 2026, 3)).find((r) => r.matricula === '777').observacao === 'Exoneração em 20/03/2026.', 'exoneração no mês aparece na observação');
  check(!(await cons(u.adminCoinfra, coinfra.id, 2026, 4)).some((r) => r.matricula === '777'), 'exonerado não entra no consolidado do mês seguinte');

  console.log('Emissão do consolidado (documento histórico)');
  await expectFail('perfil sem exportar não emite (servidor)', u.servidor, `SELECT emitir_consolidado($1, $2, 2026, 3)`, [A, coinfra.id], /permissão/);
  const doc = (await val(u.adminCoinfra, `SELECT emitir_consolidado($1, $2, 2026, 3) id`, [A, coinfra.id])).id;
  const d1 = (await val(u.adminCoinfra, `SELECT dados, referencia FROM documentos_emitidos WHERE id = $1`, [doc]));
  check(d1.referencia === 202603 && d1.dados.titulo === 'CONSOLIDADO MENSAL DE FREQUÊNCIA' && d1.dados.linhas.length === mar.length, 'consolidado emitido com título, período e linhas');
  check(!d1.dados.titulo.includes('COINFRA'), 'o título não recebe o nome do filtro');
  check(d1.dados.secretaria === 'Secretaria Municipal de Saúde' && d1.dados.assinaturas.length === 2, 'secretaria no cabeçalho e espaço para as duas assinaturas');
  await expectOk('cadastro do servidor muda depois', u.adminCoinfra, `UPDATE servidores SET nome = 'Servidor Renomeado' WHERE id = $1`, [serv.id]);
  const d2 = (await val(u.adminCoinfra, `SELECT dados FROM documentos_emitidos WHERE id = $1`, [doc])).dados;
  check(d2.linhas.some((l) => l.nome === 'Servidor Teste') && !d2.linhas.some((l) => l.nome === 'Servidor Renomeado'), 'documento emitido não muda após alteração cadastral');
  await expectFail('documento emitido não pode ser alterado', u.adminCoinfra, `UPDATE documentos_emitidos SET titulo = 'x' WHERE id = $1`, [doc], /permission denied/);
  check((await as(u.adminCoaf, `SELECT id FROM documentos_emitidos WHERE id = $1`, [doc])).rows.length === 0, 'coordenação vizinha não vê o consolidado emitido');
  check((await as(u.dirAdm, `SELECT id FROM documentos_emitidos WHERE id = $1`, [doc])).rows.length === 1, 'diretoria vê o consolidado emitido da subárvore');
  await db.query(`UPDATE tenant_configuracoes SET textos = textos || '{"consolidado_titulo": "FREQUÊNCIA MENSAL DOS SERVIDORES"}' WHERE tenant_id = $1`, [A]);
  const doc2 = (await val(u.adminCoinfra, `SELECT emitir_consolidado($1, $2, 2026, 3) id`, [A, coinfra.id])).id;
  check((await one(`SELECT dados->>'titulo' t FROM documentos_emitidos WHERE id = $1`, [doc2])).t === 'FREQUÊNCIA MENSAL DOS SERVIDORES', 'título configurável pelo órgão (modelo oficial)');

  console.log('Checklist da nota fiscal');
  const nota = (await one(`SELECT id FROM notas_fiscais WHERE tenant_id = $1 AND numero = '5501'`, [A])).id;
  const ck = (await val(u.adminCoinfra, `SELECT emitir_checklist_nota($1) id`, [nota])).id;
  const dk = (await one(`SELECT dados, tipo FROM documentos_emitidos WHERE id = $1`, [ck]));
  check(dk.tipo === 'CHECKLIST_NOTA' && dk.dados.verificacoes.length === 6 && dk.dados.itens_manuais.length === 4, 'checklist com conferências automáticas e itens manuais');
  check(dk.dados.verificacoes[1].ok === true && dk.dados.verificacoes[4].ok === true, 'dotação vinculada e atesto conferidos');
  await expectFail('outro órgão não emite checklist da nota', adminC, `SELECT emitir_checklist_nota($1)`, [nota], /não encontrada/);

  console.log('Cópia de segurança (JSON)');
  const bk = (await val(u.masterA, `SELECT exportar_backup_orgao($1) b`, [A])).b;
  check(bk.formato === 'measure-backup' && bk.tabelas.servidores.length >= 3 && bk.tabelas.notas_fiscais.length >= 1, 'Master gera a cópia com as tabelas do órgão');
  check(Object.values(bk.tabelas).every((linhas) => linhas.every((l) => l.tenant_id === A)), 'cópia não traz dados de outro órgão');
  check((await one(`SELECT count(*)::int n FROM auditoria WHERE acao = 'EXPORTACAO' AND entidade = 'tenants'`)).n === 1, 'cópia de segurança registrada na auditoria');
  await expectFail('administrativo de coordenação não gera cópia do órgão', u.adminCoinfra, `SELECT exportar_backup_orgao($1)`, [A], /administração/);
  await expectFail('outro órgão não gera cópia de Alfa', adminC, `SELECT exportar_backup_orgao($1)`, [A], /administração/);

  console.log('Registro de erros do aplicativo');
  await expectOk('usuário registra um erro do navegador', u.adminCoinfra, `SELECT registrar_erro_aplicativo('Falha X', 'pilha', '/notas', 'Chrome', '2.0', $1)`, [A]);
  check((await as(u.adminCoinfra, `SELECT * FROM erros_aplicativo`)).rows.length === 0, 'usuário comum não lê o registro de erros');
  check((await as(u.plat, `SELECT * FROM erros_aplicativo`)).rows.length === 1, 'plataforma lê o registro de erros');
  await expectFail('ninguém grava erro direto na tabela', u.adminCoinfra, `INSERT INTO erros_aplicativo (mensagem) VALUES ('x')`, [], /permission denied/);

  console.log('Varredura de segurança');
  const semRls = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
  check(semRls.rows.length === 0, 'toda tabela pública tem RLS ' + (semRls.rows.length ? JSON.stringify(semRls.rows) : ''));
  const anonFn = await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')`);
  check(anonFn.rows.length === 0, 'nenhuma função pública executável sem login ' + (anonFn.rows.length ? JSON.stringify(anonFn.rows.map((r) => r.proname)) : ''));
  const anonTab = await db.query(`SELECT DISTINCT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'`);
  check(anonTab.rows.length === 0, 'nenhuma tabela ou visão acessível sem login ' + (anonTab.rows.length ? JSON.stringify(anonTab.rows) : ''));
  const gatilhos = await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`);
  check(gatilhos.rows.length === 0, 'funções de gatilho não ficam executáveis pela API ' + (gatilhos.rows.length ? JSON.stringify(gatilhos.rows.map((r) => r.proname)) : ''));
  const definerSemPath = await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND NOT coalesce(p.proconfig::text LIKE '%search_path%', false)`);
  check(definerSemPath.rows.length === 0, 'toda função security definer fixa o search_path ' + (definerSemPath.rows.length ? JSON.stringify(definerSemPath.rows) : ''));
}
