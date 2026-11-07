// Casos da Fase 1: isolamento entre órgãos, escopo, papéis, vínculos, suporte, auditoria e storage.
export default async function ({ db, as, ok, bad, check, expectOk, expectFail, one }) {
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const u = {
    plat: id(1), masterA: id(2), adminCoinfra: id(3), coordCoinfra: id(4), dirAdm: id(5),
    gm: id(6), servidor: id(7), adminB: id(8), adminCoaf: id(9), novo: id(10), semVinculo: id(11),
  };
  for (const [nome, uid] of Object.entries(u)) {
    await db.query(`INSERT INTO auth.users VALUES ($1, $2, $3)`, [uid, `${nome.toLowerCase()}@teste.gov.br`, JSON.stringify({ nome })]);
  }
  await db.query(`UPDATE perfis SET is_platform_admin = true WHERE id = $1`, [u.plat]);

  console.log('Estrutura básica');
  check((await one(`SELECT count(*)::int n FROM perfis`)).n === 11, 'perfis criados pelo gatilho de auth.users');
  const semRls = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
  check(semRls.rows.length === 0, 'toda tabela pública tem RLS ' + (semRls.rows.length ? JSON.stringify(semRls.rows) : ''));

  // Órgãos e árvore, criados pela plataforma
  const A = (await expectOk('plataforma cria o órgão A', u.plat,
    `INSERT INTO tenants (nome_oficial, nome_curto) VALUES ('Prefeitura Municipal de Alfa', 'Alfa') RETURNING id`)).rows[0].id;
  const B = (await expectOk('plataforma cria o órgão B', u.plat,
    `INSERT INTO tenants (nome_oficial, nome_curto) VALUES ('Prefeitura Municipal de Beta', 'Beta') RETURNING id`)).rows[0].id;
  check((await one(`SELECT count(*)::int n FROM tenant_configuracoes`)).n === 2, 'configurações criadas com o órgão');
  await expectFail('quem não é da plataforma não cria órgão', u.semVinculo,
    `INSERT INTO tenants (nome_oficial, nome_curto) VALUES ('Intruso', 'X')`);

  const unidade = async (tenant, pai, tipo, nome, sigla) => (await as(u.plat,
    `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome, sigla) VALUES ($1, $2, $3, $4, $5) RETURNING id, caminho`,
    [tenant, pai, tipo, nome, sigla])).rows[0];
  const org = await unidade(A, null, 'ORGANIZACAO', 'Prefeitura de Alfa', 'PMA');
  const sms = await unidade(A, org.id, 'SECRETARIA', 'Secretaria Municipal de Saúde', 'SMS');
  const dirAdm = await unidade(A, sms.id, 'DIRETORIA', 'Diretoria Administrativa', 'DIRADM');
  const dirFin = await unidade(A, sms.id, 'DIRETORIA', 'Diretoria Financeira', 'DIRFIN');
  const coinfra = await unidade(A, dirAdm.id, 'COORDENACAO', 'Coordenação de Infraestrutura', 'COINFRA');
  const coaf = await unidade(A, dirAdm.id, 'COORDENACAO', 'Coordenação Administrativo-Financeira', 'COAF');
  const g1 = await unidade(A, coinfra.id, 'GERENCIA', 'Gerência de Manutenção', 'GEMAN');
  const smsB = await unidade(B, null, 'SECRETARIA', 'Secretaria de Saúde de Beta', 'SMSB');
  check(g1.caminho.length === 5 && g1.caminho[0] === org.id && g1.caminho[4] === g1.id, 'caminho da unidade calculado da raiz até ela');
  await expectFail('unidade com pai de outro órgão é recusada', u.plat,
    `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome) VALUES ($1, $2, 'SETOR', 'Setor cruzado')`, [B, sms.id], /outro órgão/);
  await expectFail('nome repetido sob o mesmo pai é recusado', u.plat,
    `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome) VALUES ($1, $2, 'DIRETORIA', 'diretoria administrativa ')`, [A, sms.id]);

  // Vínculos iniciais pela plataforma
  const conceder = (quem, email, tenant, unidadeId, papel) =>
    as(quem, `SELECT conceder_vinculo($1, $2, $3, $4) id`, [email, tenant, unidadeId, papel]);
  await expectOk('plataforma concede MASTER (órgão inteiro)', u.plat, `SELECT conceder_vinculo('masterA@teste.gov.br', $1, null, 'MASTER')`, [A]);
  await conceder(u.plat, 'admincoinfra@teste.gov.br', A, coinfra.id, 'ADMINISTRATIVO');
  await conceder(u.plat, 'coordcoinfra@teste.gov.br', A, coinfra.id, 'COORDENADOR');
  await conceder(u.plat, 'diradm@teste.gov.br', A, dirAdm.id, 'DIRETOR');
  await conceder(u.plat, 'gm@teste.gov.br', A, null, 'GESTAO_MUNICIPAL');
  await conceder(u.plat, 'adminb@teste.gov.br', B, smsB.id, 'ADMINISTRATIVO');
  await conceder(u.plat, 'admincoaf@teste.gov.br', A, coaf.id, 'ADMINISTRATIVO');
  check((await one(`SELECT padrao FROM vinculos WHERE user_id = $1`, [u.masterA])).padrao === true, 'primeiro vínculo vira o padrão');
  await expectFail('papel que exige unidade sem unidade é recusado', u.plat,
    `SELECT conceder_vinculo('servidor@teste.gov.br', $1, null, 'SERVIDOR')`, [A], /exige/);

  const pode = async (quem, tenant, unidadeId, recurso, acao, estrito = false) =>
    (await as(quem, `SELECT pode($1, $2, $3, $4, $5) p`, [tenant, unidadeId, recurso, acao, estrito])).rows[0].p;

  console.log('Isolamento entre órgãos');
  await expectFail('anônimo não lê órgãos', null, `SELECT * FROM tenants`);
  check((await as(u.adminB, `SELECT id FROM tenants`)).rows.map((r) => r.id).join() === B, 'usuário de Beta só vê Beta');
  check((await as(u.adminB, `SELECT count(*)::int n FROM unidades_organizacionais WHERE tenant_id = $1`, [A])).rows[0].n === 0, 'Beta não vê a estrutura de Alfa');
  check((await as(u.adminB, `SELECT count(*)::int n FROM vinculos WHERE tenant_id = $1`, [A])).rows[0].n === 0, 'Beta não vê vínculos de Alfa');
  check(!(await pode(u.adminB, A, null, 'fornecedores', 'ler')), 'Beta não tem permissão em Alfa, mesmo passando o id');
  check(!(await pode(u.adminB, A, coinfra.id, 'fornecedores', 'criar')), 'Beta não cria em unidade de Alfa');
  check(!(await pode(u.adminCoinfra, B, smsB.id, 'fornecedores', 'ler')), 'Alfa não lê Beta');
  await expectFail('ninguém transfere unidade para outro órgão', u.plat,
    `UPDATE unidades_organizacionais SET tenant_id = $1 WHERE id = $2`, [B, coaf.id], /outro órgão/);

  console.log('Escopo pela subárvore');
  check(await pode(u.adminCoinfra, A, g1.id, 'fornecedores', 'criar'), 'administrativo da COINFRA cria na gerência abaixo dela');
  check(!(await pode(u.adminCoinfra, A, coaf.id, 'fornecedores', 'criar')), 'administrativo da COINFRA não cria na COAF (vizinha)');
  check(!(await pode(u.adminCoinfra, A, dirAdm.id, 'fornecedores', 'criar')), 'administrativo da COINFRA não cria na Diretoria acima');
  check(await pode(u.adminCoinfra, A, null, 'fornecedores', 'ler'), 'cadastro do órgão inteiro (sem unidade) é lido por qualquer escopo');
  check(!(await pode(u.adminCoinfra, A, null, 'estrutura', 'criar', true)), 'modo estrito: sem unidade exige escopo do órgão inteiro');
  const visDir = (await as(u.dirAdm, `SELECT sigla FROM unidades_organizacionais ORDER BY sigla`)).rows.map((r) => r.sigla).join();
  check(visDir === 'COAF,COINFRA,DIRADM,GEMAN,PMA,SMS', `diretor vê a subárvore e o caminho até a raiz, sem a Diretoria vizinha (${visDir})`);

  console.log('Papéis somente leitura');
  check(await pode(u.coordCoinfra, A, coinfra.id, 'contratos', 'ler'), 'coordenador lê contratos da coordenação');
  check(!(await pode(u.coordCoinfra, A, coinfra.id, 'contratos', 'criar')), 'coordenador não cria');
  check(!(await pode(u.dirAdm, A, coinfra.id, 'notas_fiscais', 'editar')), 'diretoria não edita');
  check(await pode(u.gm, A, g1.id, 'relatorios', 'exportar'), 'gestão municipal exporta relatórios de todo o órgão');
  check(!(await pode(u.gm, A, g1.id, 'empenhos', 'excluir')), 'gestão municipal não exclui');
  await expectFail('matriz recusa ação de escrita para papel somente leitura', u.plat,
    `INSERT INTO permissoes_papel VALUES ('COORDENADOR', 'contratos', 'criar')`, [], /somente leitura/);
  await expectFail('só a plataforma altera a matriz', u.masterA,
    `INSERT INTO permissoes_papel VALUES ('ADMINISTRATIVO', 'auditoria', 'ler')`);
  check(!(await pode(u.adminCoinfra, A, coinfra.id, 'notas_fiscais', 'atestar')), 'ninguém atesta pela matriz (atesto é por designação)');

  console.log('Estrutura organizacional');
  await expectOk('Master cria unidade', u.masterA,
    `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome, sigla) VALUES ($1, $2, 'SETOR', 'Setor de Compras', 'SECOMP')`, [A, coaf.id]);
  await expectFail('administrativo não cria unidade', u.adminCoinfra,
    `INSERT INTO unidades_organizacionais (tenant_id, pai_id, tipo, nome) VALUES ($1, $2, 'SETOR', 'Setor X')`, [A, coinfra.id]);
  await expectFail('ciclo na árvore é recusado', u.masterA,
    `UPDATE unidades_organizacionais SET pai_id = $1 WHERE id = $2`, [g1.id, sms.id], /subordinada/);
  await expectOk('Master move a COAF para a Diretoria Financeira', u.masterA,
    `UPDATE unidades_organizacionais SET pai_id = $1 WHERE id = $2`, [dirFin.id, coaf.id]);
  const setor = await one(`SELECT caminho FROM unidades_organizacionais WHERE sigla = 'SECOMP'`);
  check(setor.caminho.includes(dirFin.id) && !setor.caminho.includes(dirAdm.id), 'caminho dos descendentes acompanha a mudança');
  check(!(await pode(u.dirAdm, A, coaf.id, 'contratos', 'ler')), 'diretoria antiga perde o acesso à unidade movida');
  await expectFail('inativar unidade sem motivo é recusado', u.masterA,
    `UPDATE unidades_organizacionais SET ativo = false WHERE sigla = 'SECOMP'`, [], /motivo/);
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('measure.justificativa', 'Setor extinto pela reforma', false)`);
  await expectOk('inativar unidade com motivo', u.masterA, `UPDATE unidades_organizacionais SET ativo = false WHERE sigla = 'SECOMP'`);
  await db.query(`SELECT set_config('measure.justificativa', '', false)`);
  const audUnidade = await one(`SELECT justificativa, usuario_email FROM auditoria WHERE entidade = 'unidades_organizacionais' AND depois->>'sigla' = 'SECOMP' ORDER BY id DESC LIMIT 1`);
  check(audUnidade?.justificativa === 'Setor extinto pela reforma' && audUnidade.usuario_email === 'mastera@teste.gov.br', 'auditoria guarda quem inativou e o motivo');

  console.log('Vínculos e convites');
  await expectOk('administrativo concede SERVIDOR na gerência abaixo dele', u.adminCoinfra,
    `SELECT conceder_vinculo('servidor@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, g1.id]);
  await expectFail('administrativo não concede COORDENADOR', u.adminCoinfra,
    `SELECT conceder_vinculo('novo@teste.gov.br', $1, $2, 'COORDENADOR')`, [A, coinfra.id], /não pode conceder/);
  await expectFail('administrativo não concede fora do escopo', u.adminCoinfra,
    `SELECT conceder_vinculo('novo@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, coaf.id], /não pode conceder/);
  await expectFail('Master não cria outro Master', u.masterA,
    `SELECT conceder_vinculo('novo@teste.gov.br', $1, null, 'MASTER')`, [A], /não pode conceder/);
  await expectFail('ninguém altera os próprios acessos', u.masterA,
    `SELECT conceder_vinculo('mastera@teste.gov.br', $1, $2, 'DIRETOR')`, [A, dirAdm.id], /próprios/);
  await expectFail('vínculo repetido é recusado com mensagem clara', u.masterA,
    `SELECT conceder_vinculo('servidor@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, g1.id], /já tem esse papel/);
  await expectFail('e-mail sem conta pede convite', u.masterA,
    `SELECT conceder_vinculo('inexistente@teste.gov.br', $1, $2, 'SERVIDOR')`, [A, g1.id], /convite/);
  const val = (await as(u.masterA, `SELECT validar_concessao('inexistente@teste.gov.br', $1, $2, 'SERVIDOR') v`, [A, g1.id])).rows[0].v;
  check(val.existe_usuario === false, 'validar_concessao informa que a conta ainda não existe');
  await expectFail('inserir vínculo direto na tabela é bloqueado', u.masterA,
    `INSERT INTO vinculos (user_id, tenant_id, unidade_id, papel) VALUES ($1, $2, $3, 'DIRETOR')`, [u.novo, A, dirAdm.id]);
  await as(u.plat, `UPDATE tenants SET dominios_email = '{"@aracaju.se.gov.br", "Teste.gov.br"}' WHERE id = $1`, [A]);
  check((await one(`SELECT dominios_email FROM tenants WHERE id = $1`, [A])).dominios_email.join() === 'aracaju.se.gov.br,teste.gov.br', 'domínios normalizados (sem @, minúsculos)');
  await db.query(`INSERT INTO auth.users VALUES ($1, 'pessoa@gmail.com', '{}')`, [id(20)]);
  await expectFail('domínio fora da lista do órgão é recusado', u.masterA,
    `SELECT conceder_vinculo('pessoa@gmail.com', $1, $2, 'SERVIDOR')`, [A, g1.id], /institucionais/);
  await expectFail('Master não altera domínios (só a plataforma)', u.masterA,
    `UPDATE tenants SET dominios_email = '{}' WHERE id = $1`, [A], /plataforma/);
  await expectOk('Master altera o nome curto do órgão', u.masterA, `UPDATE tenants SET nome_curto = 'Alfa (SMS)' WHERE id = $1`, [A]);
  await expectOk('Master salva as configurações do órgão', u.masterA,
    `UPDATE tenant_configuracoes SET alerta_vencimento_dias = '{30,15}', documento_cabecalho = '{"PREFEITURA DE ALFA"}' WHERE tenant_id = $1`, [A]);
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE entidade = 'tenant_configuracoes' AND registro_id = $1::text AND tenant_id = $1::uuid`, [A])),
    'alteração das configurações auditada no órgão certo');
  await expectFail('administrativo não altera as configurações', u.adminCoinfra,
    `UPDATE tenant_configuracoes SET anexo_tamanho_max_mb = 50 WHERE tenant_id = $1`, [A]);
  const vServ = (await one(`SELECT id FROM vinculos WHERE user_id = $1`, [u.servidor])).id;
  await expectFail('suspender vínculo sem motivo é recusado', u.adminCoinfra, `SELECT definir_status_vinculo($1, false, null)`, [vServ], /motivo/);
  await expectFail('administrativo de outra coordenação não suspende', u.adminCoaf,
    `SELECT definir_status_vinculo($1, false, 'Fora da coordenação')`, [vServ], /permissão/);
  await expectOk('administrativo suspende com motivo', u.adminCoinfra, `SELECT definir_status_vinculo($1, false, 'Servidor exonerado')`, [vServ]);
  const audV = await one(`SELECT justificativa FROM auditoria WHERE entidade = 'vinculos' AND registro_id = $1 AND acao = 'UPDATE' ORDER BY id DESC LIMIT 1`, [vServ]);
  check(audV?.justificativa === 'Servidor exonerado', 'motivo da suspensão registrado na auditoria');
  check(!(await pode(u.servidor, A, g1.id, 'estrutura', 'ler')), 'vínculo suspenso perde o acesso');

  console.log('Perfis');
  await expectOk('usuário altera o próprio nome', u.adminCoinfra, `UPDATE perfis SET nome = 'Ana Infra' WHERE id = $1`, [u.adminCoinfra]);
  await expectFail('usuário não se promove a administrador da plataforma', u.adminCoinfra,
    `UPDATE perfis SET is_platform_admin = true WHERE id = $1`, [u.adminCoinfra]);
  await expectFail('usuário não altera o perfil de outro', u.adminCoinfra, `UPDATE perfis SET nome = 'x' WHERE id = $1`, [u.coordCoinfra]);
  check((await as(u.adminB, `SELECT count(*)::int n FROM perfis`)).rows[0].n === 1, 'Beta só vê o próprio perfil (sem gestão de usuários lá)');
  const listaInfra = (await as(u.adminCoinfra, `SELECT listar_usuarios($1) r`, [A])).rows[0].r;
  check(listaInfra.itens.every((p) => p.email !== 'adminb@teste.gov.br') && listaInfra.itens.some((p) => p.email === 'coordcoinfra@teste.gov.br'),
    `listagem respeita órgão e escopo (${listaInfra.total} usuários)`);
  check(!listaInfra.itens.some((p) => p.email === 'admincoaf@teste.gov.br'), 'administrativo da COINFRA não lista o da COAF');
  const busca = (await as(u.masterA, `SELECT listar_usuarios($1, 'COORD%') r`, [A])).rows[0].r;
  check(busca.total === 0, 'busca trata % como texto literal');
  const ctx = (await as(u.adminCoinfra, `SELECT meu_contexto() c`)).rows[0].c;
  check(ctx.vinculos.length === 1 && ctx.vinculos[0].permissoes.includes('fornecedores:criar') && ctx.vinculos[0].unidade.sigla === 'COINFRA',
    'meu_contexto traz vínculos, unidade e permissões');

  console.log('Administrador da plataforma e suporte');
  check(await pode(u.plat, A, null, 'estrutura', 'editar'), 'plataforma administra a estrutura sem sessão de suporte');
  check(!(await pode(u.plat, A, null, 'fornecedores', 'ler')), 'plataforma não lê dados operacionais sem sessão de suporte');
  await expectFail('suporte exige motivo', u.plat, `SELECT iniciar_suporte($1, 'curto')`, [A], /motivo/);
  await expectFail('só a plataforma abre suporte', u.masterA, `SELECT iniciar_suporte($1, 'Chamado 123 do órgão Alfa')`, [A]);
  const sessao = (await as(u.plat, `SELECT iniciar_suporte($1, 'Chamado 123: conferir cadastro', 30) s`, [A])).rows[0].s;
  check(await pode(u.plat, A, coinfra.id, 'fornecedores', 'ler'), 'com sessão de suporte, plataforma acessa os dados do órgão');
  check(!(await pode(u.plat, B, smsB.id, 'fornecedores', 'ler')), 'a sessão vale só para o órgão escolhido');
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE acao = 'SUPORTE_INICIADO' AND tenant_id = $1 AND justificativa LIKE 'Chamado 123%'`, [A])), 'abertura do suporte auditada com o motivo');
  await as(u.plat, `SELECT encerrar_suporte($1)`, [sessao]);
  check(!(await pode(u.plat, A, coinfra.id, 'fornecedores', 'ler')), 'ao encerrar, o acesso operacional acaba');
  await expectFail('plataforma não suspende a própria conta', u.plat, `SELECT definir_status_usuario($1, false, 'teste de bloqueio')`, [u.plat]);
  await expectOk('plataforma suspende conta com motivo', u.plat, `SELECT definir_status_usuario($1, false, 'Desligado do órgão')`, [u.coordCoinfra]);
  check(!(await pode(u.coordCoinfra, A, coinfra.id, 'contratos', 'ler')), 'conta suspensa perde todo acesso');
  await expectFail('Master não suspende contas', u.masterA, `SELECT definir_status_usuario($1, false, 'qualquer motivo')`, [u.dirAdm]);

  console.log('Auditoria');
  await expectFail('ninguém grava na auditoria direto', u.masterA, `INSERT INTO auditoria (entidade, acao) VALUES ('x', 'FAKE')`);
  await expectFail('ninguém altera a auditoria', u.plat, `UPDATE auditoria SET acao = 'x'`);
  await expectFail('ninguém apaga a auditoria', u.plat, `DELETE FROM auditoria`);
  await expectFail('registrar_auditoria não é chamável pela API', u.masterA,
    `SELECT registrar_auditoria(null, 'x', null, 'FAKE')`, [], /permission denied/);
  const audA = (await as(u.masterA, `SELECT DISTINCT tenant_id FROM auditoria`)).rows;
  check(audA.length === 1 && audA[0].tenant_id === A, 'Master só vê a auditoria do próprio órgão');
  check((await as(u.adminCoinfra, `SELECT count(*)::int n FROM auditoria`)).rows[0].n === 0, 'administrativo não vê a auditoria');
  await expectOk('registrar_acesso marca o login', u.masterA, `SELECT registrar_acesso()`);
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE acao = 'LOGIN' AND usuario_id = $1`, [u.masterA])), 'login auditado');

  console.log('Documentos e storage');
  const doc = (await expectOk('administrativo registra documento de contrato da COINFRA', u.adminCoinfra,
    `INSERT INTO documentos (tenant_id, unidade_id, recurso, nome_arquivo, mime, tamanho) VALUES ($1, $2, 'contratos', 'portaria.pdf', 'application/pdf', 1000) RETURNING id, storage_path`,
    [A, coinfra.id]))?.rows[0];
  check(doc?.storage_path === `${A}/contratos/${doc?.id}`, 'caminho do arquivo definido pelo servidor');
  await expectFail('arquivo acima do limite do órgão é recusado', u.adminCoinfra,
    `INSERT INTO documentos (tenant_id, unidade_id, recurso, nome_arquivo, mime, tamanho) VALUES ($1, $2, 'contratos', 'grande.pdf', 'application/pdf', 20971520)`,
    [A, coinfra.id], /limite/);
  await expectFail('tipo de arquivo não permitido é recusado', u.adminCoinfra,
    `INSERT INTO documentos (tenant_id, unidade_id, recurso, nome_arquivo, mime, tamanho) VALUES ($1, $2, 'contratos', 'x.exe', 'application/x-msdownload', 10)`, [A, coinfra.id]);
  await expectFail('administrativo da COAF não registra documento na COINFRA', u.adminCoaf,
    `INSERT INTO documentos (tenant_id, unidade_id, recurso, nome_arquivo, mime, tamanho) VALUES ($1, $2, 'contratos', 'x.pdf', 'application/pdf', 10)`, [A, coinfra.id]);
  await expectFail('outra pessoa não envia o arquivo do documento', u.adminCoaf,
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('arquivos', $1)`, [doc.storage_path]);
  await expectOk('quem registrou envia o arquivo', u.adminCoinfra, `INSERT INTO storage.objects (bucket_id, name) VALUES ('arquivos', $1)`, [doc.storage_path]);
  await expectFail('arquivo de documento não é sobrescrito', u.adminCoinfra,
    `UPDATE storage.objects SET owner = null WHERE name = $1`, [doc.storage_path]);
  const lerObj = async (quem) => (await as(quem, `SELECT count(*)::int n FROM storage.objects WHERE name = $1`, [doc.storage_path])).rows[0].n;
  check((await lerObj(u.dirAdm)) === 1, 'diretoria acima lê o arquivo');
  check((await lerObj(u.adminCoaf)) === 0, 'coordenação vizinha não lê o arquivo');
  check((await lerObj(u.adminB)) === 0, 'outro órgão não lê o arquivo');
  await expectFail('documento não é editado', u.adminCoinfra, `UPDATE documentos SET nome_arquivo = 'outro.pdf' WHERE id = $1`, [doc.id]);
  await expectFail('excluir documento exige motivo', u.adminCoinfra, `SELECT excluir_documento($1, '')`, [doc.id], /motivo/);
  await expectOk('excluir documento com motivo (exclusão lógica)', u.adminCoinfra, `SELECT excluir_documento($1, 'Enviado por engano')`, [doc.id]);
  check((await lerObj(u.dirAdm)) === 0, 'documento excluído deixa de ser baixado');
  check(!!(await one(`SELECT 1 x FROM documentos WHERE id = $1 AND excluido_em IS NOT NULL AND motivo_exclusao = 'Enviado por engano'`, [doc.id])), 'documento excluído continua guardado com o motivo');
  const logo = `${A}/identidade/brasao.png`;
  await expectFail('administrativo não troca o brasão', u.adminCoinfra, `INSERT INTO storage.objects (bucket_id, name) VALUES ('arquivos', $1)`, [logo]);
  await expectOk('Master envia o brasão', u.masterA, `INSERT INTO storage.objects (bucket_id, name) VALUES ('arquivos', $1)`, [logo]);
  check((await as(u.adminCoinfra, `SELECT count(*)::int n FROM storage.objects WHERE name = $1`, [logo])).rows[0].n === 1, 'membros do órgão leem o brasão');
  check((await as(u.adminB, `SELECT count(*)::int n FROM storage.objects WHERE name = $1`, [logo])).rows[0].n === 0, 'outro órgão não lê o brasão');
  await expectOk('usuário envia a própria foto', u.adminCoinfra, `INSERT INTO storage.objects (bucket_id, name) VALUES ('avatares', $1)`, [`${u.adminCoinfra}/foto.jpg`]);
  await expectFail('usuário não envia foto de outro', u.adminCoinfra, `INSERT INTO storage.objects (bucket_id, name) VALUES ('avatares', $1)`, [`${u.dirAdm}/foto.jpg`]);
  await expectFail('caminho fora do padrão é recusado', u.masterA, `INSERT INTO storage.objects (bucket_id, name) VALUES ('arquivos', 'qualquer/coisa.pdf')`);

  console.log('Órgão inativo');
  await expectFail('inativar órgão sem motivo é recusado', u.plat, `UPDATE tenants SET ativo = false WHERE id = $1`, [B], /motivo/);
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('measure.justificativa', 'Contrato encerrado', false)`);
  await expectOk('plataforma inativa órgão com motivo', u.plat, `UPDATE tenants SET ativo = false WHERE id = $1`, [B]);
  await db.query(`SELECT set_config('measure.justificativa', '', false)`);
  check(!(await pode(u.adminB, B, smsB.id, 'fornecedores', 'ler')), 'usuários de órgão inativo perdem o acesso');
  await expectFail('não se concede vínculo em órgão inativo', u.plat,
    `SELECT conceder_vinculo('novo@teste.gov.br', $1, $2, 'SERVIDOR')`, [B, smsB.id], /inativo/);

  await (await import('./cases-cadastros.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-execucao.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-relatorios.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-servidores.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-dotacao.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-pagamentos.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-decretos-ferias.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-dotacao-exercicio.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-checklist.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-empenho-classificacao.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-classificacoes.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
  await (await import('./cases-foco.mjs')).default({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 });
}
