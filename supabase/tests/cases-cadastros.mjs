// Casos da Fase 2: fornecedores, servidores (dados sensíveis), unidades atendidas, classificação e tipos de serviço.
export default async function ({ db, as, ok, bad, check, expectOk, expectFail, one, u, A, coinfra, coaf, g1 }) {
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  // Órgão C, ativo, para os testes de isolamento (Beta foi inativado nos casos da Fase 1)
  const adminC = id(30);
  await db.query(`INSERT INTO auth.users VALUES ($1, 'adminc@teste.gov.br', '{}')`, [adminC]);
  const C = (await as(u.plat, `INSERT INTO tenants (nome_oficial, nome_curto) VALUES ('Prefeitura de Gama', 'Gama') RETURNING id`)).rows[0].id;
  const smsC = (await as(u.plat, `INSERT INTO unidades_organizacionais (tenant_id, tipo, nome) VALUES ($1, 'SECRETARIA', 'SMS Gama') RETURNING id`, [C])).rows[0].id;
  await as(u.plat, `SELECT conceder_vinculo('adminc@teste.gov.br', $1, $2, 'ADMINISTRATIVO')`, [C, smsC]);
  const gm = u.gm;

  console.log('Tipos de serviço');
  check((await one(`SELECT count(*)::int n FROM tipos_servico WHERE tenant_id = $1`, [A])).n === 10, 'órgão novo nasce com os 10 tipos de serviço padrão');
  await expectOk('administrativo cadastra tipo de serviço', u.adminCoinfra, `INSERT INTO tipos_servico (tenant_id, nome) VALUES ($1, 'Dedetização')`, [A]);
  await expectFail('tipo de serviço repetido é recusado', u.adminCoinfra, `INSERT INTO tipos_servico (tenant_id, nome) VALUES ($1, ' dedetização')`, [A], /tipos_servico_nome_unico/);
  await expectFail('diretoria não cadastra tipo de serviço', u.dirAdm, `INSERT INTO tipos_servico (tenant_id, nome) VALUES ($1, 'Pintura')`, [A]);
  await expectFail('administrativo não inativa tipo de serviço (sem permissão de excluir)', u.adminCoinfra,
    `UPDATE tipos_servico SET ativo = false WHERE tenant_id = $1 AND nome = 'Dedetização'`, [A]);

  console.log('Fornecedores');
  const forn = (await expectOk('administrativo cadastra fornecedor PJ', u.adminCoinfra,
    `INSERT INTO fornecedores (tenant_id, documento, razao_social, nome_fantasia) VALUES ($1, '11222333000181', 'Construtora Alfa Ltda', 'Alfa Obras') RETURNING id`, [A]))?.rows[0].id;
  await expectFail('CNPJ com dígito errado é recusado', u.adminCoinfra,
    `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '11222333000182', 'X')`, [A], /documento_valido/);
  await expectFail('CNPJ repetido no órgão é recusado', u.adminCoinfra,
    `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '11222333000181', 'Outra')`, [A], /fornecedores_documento_unico/);
  await expectOk('pessoa física com CPF válido', u.adminCoinfra,
    `INSERT INTO fornecedores (tenant_id, tipo_pessoa, documento, razao_social) VALUES ($1, 'PF', '52998224725', 'João da Silva')`, [A]);
  await expectOk('o mesmo CNPJ pode existir em outro órgão', adminC,
    `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '11222333000181', 'Construtora Alfa Ltda')`, [C]);
  check((await as(adminC, `SELECT count(*)::int n FROM fornecedores`)).rows[0].n === 1, 'outro órgão só vê os próprios fornecedores');
  check((await as(u.dirAdm, `SELECT count(*)::int n FROM fornecedores WHERE tenant_id = $1`, [A])).rows[0].n === 2, 'diretoria lê os fornecedores do órgão');
  await expectFail('diretoria (consulta) não cadastra fornecedor', u.dirAdm,
    `INSERT INTO fornecedores (tenant_id, documento, razao_social) VALUES ($1, '11444777000161', 'Y')`, [A]);
  await expectFail('diretoria não edita fornecedor', u.dirAdm, `UPDATE fornecedores SET razao_social = 'x' WHERE id = $1`, [forn]);
  await expectFail('ninguém apaga fornecedor pela API', u.masterA, `DELETE FROM fornecedores WHERE id = $1`, [forn]);
  await expectOk('conta bancária herda o órgão do fornecedor', u.adminCoinfra,
    `INSERT INTO fornecedor_contas (fornecedor_id, banco_codigo, banco_nome, agencia, conta, principal) VALUES ($1, '001', 'Banco do Brasil', '1234-5', '98765-0', true)`, [forn]);
  check((await one(`SELECT tenant_id FROM fornecedor_contas WHERE fornecedor_id = $1`, [forn])).tenant_id === A, 'tenant_id da conta definido pelo servidor');
  await expectFail('outro órgão não inclui conta em fornecedor alheio', adminC,
    `INSERT INTO fornecedor_contas (fornecedor_id, banco_nome, agencia, conta) VALUES ($1, 'Caixa', '1', '2')`, [forn]);
  await expectFail('inativar fornecedor exige motivo', u.adminCoinfra, `UPDATE fornecedores SET ativo = false WHERE id = $1`, [forn], /motivo/);
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('measure.justificativa', 'Empresa encerrou as atividades', false)`);
  await expectOk('inativar fornecedor com motivo', u.adminCoinfra, `UPDATE fornecedores SET ativo = false WHERE id = $1`, [forn]);
  await db.query(`SELECT set_config('measure.justificativa', '', false)`);
  check((await one(`SELECT justificativa FROM auditoria WHERE entidade = 'fornecedores' AND registro_id = $1 ORDER BY id DESC LIMIT 1`, [forn])).justificativa === 'Empresa encerrou as atividades',
    'inativação do fornecedor auditada com o motivo');

  console.log('Servidores e dados pessoais');
  const serv = (await expectOk('administrativo cadastra servidor na gerência', u.adminCoinfra,
    `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, cargo, funcao, email_institucional, data_nomeacao)
     VALUES ($1, $2, 'Servidor Teste', '12345', 'CC', 'Assessor', 'SERVIDOR@teste.gov.br', '2025-02-10') RETURNING id, user_id, email_institucional`, [A, g1.id]))?.rows[0];
  check(serv.user_id === u.servidor && serv.email_institucional === 'servidor@teste.gov.br', 'servidor ligado à conta pelo e-mail institucional');
  await expectFail('administrativo não lota servidor fora do escopo (COAF)', u.adminCoinfra,
    `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula) VALUES ($1, $2, 'Fora', '999')`, [A, coaf.id]);
  await expectFail('matrícula repetida é recusada', u.adminCoinfra,
    `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula) VALUES ($1, $2, 'Outro', ' 12345')`, [A, g1.id], /servidores_matricula_unica/);
  await expectFail('lotação em unidade de outro órgão é recusada', adminC,
    `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula) VALUES ($1, $2, 'Cruzado', '1')`, [C, g1.id]);
  await expectFail('o app não troca a conta ligada ao servidor', u.adminCoinfra, `UPDATE servidores SET user_id = $1 WHERE id = $2`, [u.adminCoinfra, serv.id], /permission denied/);
  const mes = (await one(`SELECT extract(month from hoje())::int m, extract(day from hoje())::int d`));
  const nasc = `1990-${String(mes.m).padStart(2, '0')}-${String(mes.d).padStart(2, '0')}`;
  await expectOk('administrativo grava dados pessoais', u.adminCoinfra,
    `INSERT INTO servidores_dados_pessoais (servidor_id, cpf, data_nascimento, nome_mae, tipo_sanguineo) VALUES ($1, '52998224725', $2, 'Maria Teste', 'O+')`, [serv.id, nasc]);
  check((await one(`SELECT tenant_id FROM servidores_dados_pessoais WHERE servidor_id = $1`, [serv.id])).tenant_id === A, 'dados pessoais herdam o órgão');
  await expectFail('tipo sanguíneo inválido é recusado', u.adminCoinfra, `UPDATE servidores_dados_pessoais SET tipo_sanguineo = 'Z' WHERE servidor_id = $1`, [serv.id]);
  check((await as(u.dirAdm, `SELECT count(*)::int n FROM servidores WHERE id = $1`, [serv.id])).rows[0].n === 1, 'diretoria lê o servidor da sua subárvore');
  check((await as(u.dirAdm, `SELECT count(*)::int n FROM servidores_dados_pessoais WHERE servidor_id = $1`, [serv.id])).rows[0].n === 0, 'diretoria NÃO lê dados pessoais (CPF, mãe, tipo sanguíneo)');
  check((await as(gm, `SELECT count(*)::int n FROM servidores_dados_pessoais`)).rows[0].n === 0, 'gestão municipal NÃO lê dados pessoais');
  check((await as(u.adminCoaf, `SELECT count(*)::int n FROM servidores WHERE id = $1`, [serv.id])).rows[0].n === 0, 'administrativo da COAF não vê servidor da COINFRA');
  await expectFail('matriz recusa dados sensíveis para papel de consulta', u.plat,
    `INSERT INTO permissoes_papel VALUES ('DIRETOR', 'servidores_sensiveis', 'editar')`, [], /somente leitura/);
  const aud = await one(`SELECT depois FROM auditoria WHERE entidade = 'servidores_dados_pessoais' ORDER BY id DESC LIMIT 1`);
  check(aud.depois.tipo_sanguineo === '***' && aud.depois.cpf === '***' && aud.depois.nome_mae === '***', 'auditoria mascara tipo sanguíneo, CPF e nome da mãe');
  // A própria pessoa (vínculo reativado para o teste)
  const vServ = (await one(`SELECT id FROM vinculos WHERE user_id = $1`, [u.servidor])).id;
  await as(u.adminCoinfra, `SELECT definir_status_vinculo($1, true, null)`, [vServ]);
  check((await as(u.servidor, `SELECT nome_mae FROM servidores_dados_pessoais WHERE servidor_id = $1`, [serv.id])).rows[0]?.nome_mae === 'Maria Teste', 'o servidor vê os próprios dados pessoais');
  await expectOk('o servidor atualiza telefone e endereço', u.servidor,
    `SELECT atualizar_meus_dados_servidor($1, '{"telefone":"79999990000","cep":"49000-000","cidade":"Aracaju"}')`, [serv.id]);
  check((await one(`SELECT cep, cidade FROM servidores_dados_pessoais WHERE servidor_id = $1`, [serv.id])).cep === '49000000', 'endereço gravado sem máscara');
  await expectFail('o servidor não altera o tipo sanguíneo', u.servidor,
    `SELECT atualizar_meus_dados_servidor($1, '{"tipo_sanguineo":"A+"}')`, [serv.id], /administração/);
  await expectFail('o servidor não altera a matrícula direto', u.servidor, `UPDATE servidores SET matricula = '0' WHERE id = $1`, [serv.id]);
  await expectFail('ninguém altera cadastro de outro servidor pela RPC', u.adminCoinfra,
    `SELECT atualizar_meus_dados_servidor($1, '{"telefone":"1"}')`, [serv.id], /próprio/);
  const buscaAdm = (await as(u.adminCoinfra, `SELECT buscar_servidores($1, '529.982') r`, [A])).rows[0].r;
  check(buscaAdm.total === 1 && buscaAdm.itens[0].cpf === '52998224725', 'busca por CPF para quem pode ver dados pessoais');
  const buscaDir = (await as(u.dirAdm, `SELECT buscar_servidores($1, '52998') r`, [A])).rows[0].r;
  check(buscaDir.total === 0, 'busca por CPF não funciona para quem não vê dados pessoais');
  const buscaNome = (await as(u.dirAdm, `SELECT buscar_servidores($1, 'servidor teste') r`, [A])).rows[0].r;
  check(buscaNome.total === 1 && buscaNome.itens[0].cpf === null, 'diretoria encontra pelo nome, sem CPF no resultado');
  const aniv = (await as(u.dirAdm, `SELECT * FROM aniversariantes($1)`, [A])).rows;
  check(aniv.length === 1 && aniv[0].hoje === true && aniv[0].dia === mes.d && !('data_nascimento' in aniv[0]), 'aniversariante do dia aparece só com dia e mês');
  await expectOk('registrar exoneração', u.adminCoinfra, `UPDATE servidores SET data_exoneracao = hoje() WHERE id = $1`, [serv.id]);
  const ativos = (await as(u.adminCoinfra, `SELECT buscar_servidores($1, null, 'ATIVOS') r`, [A])).rows[0].r;
  const exon = (await as(u.adminCoinfra, `SELECT buscar_servidores($1, null, 'EXONERADOS') r`, [A])).rows[0].r;
  check(ativos.total === 0 && exon.total === 1 && exon.itens[0].exonerado, 'exonerado sai dos ativos e vai para exonerados (mesmo cadastro)');
  check((await as(u.dirAdm, `SELECT * FROM aniversariantes($1)`, [A])).rows.length === 0, 'exonerado não aparece nos aniversariantes');
  await expectFail('exoneração antes da nomeação é recusada', u.adminCoinfra, `UPDATE servidores SET data_exoneracao = '2020-01-01' WHERE id = $1`, [serv.id]);

  const semCpf = (await as(u.adminCoinfra, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula) VALUES ($1, $2, 'Sem CPF', '777') RETURNING id`, [A, g1.id])).rows[0].id;
  await expectOk('dados pessoais sem CPF são aceitos', u.adminCoinfra, `INSERT INTO servidores_dados_pessoais (servidor_id, nome_mae) VALUES ($1, 'Ana')`, [semCpf]);

  console.log('Unidades atendidas e rateio');
  const ua = async (nome, extra = {}) => (await as(u.adminCoinfra,
    `INSERT INTO unidades_atendidas (tenant_id, nome, tipo, eh_grupo, regra_rateio) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [A, nome, extra.tipo ?? 'UBS', !!extra.grupo, extra.regra ?? 'NAO_APLICAVEL'])).rows[0].id;
  const grupo = await ua('UBS/USF', { grupo: true, regra: 'OPCIONAL', tipo: 'Grupo' });
  const ubs1 = await ua('UBS Centro');
  const ubs2 = await ua('USF Bairro Industrial', { tipo: 'USF' });
  const caps = await ua('CAPS', { grupo: true, regra: 'OBRIGATORIO', tipo: 'Grupo' });
  await expectOk('administrativo inclui unidades no grupo', u.adminCoinfra,
    `INSERT INTO unidades_grupo_membros (grupo_id, membro_id) VALUES ($1, $2), ($1, $3)`, [grupo, ubs1, ubs2]);
  await expectFail('grupo dentro de grupo é recusado', u.adminCoinfra, `INSERT INTO unidades_grupo_membros (grupo_id, membro_id) VALUES ($1, $2)`, [grupo, caps], /grupo/);
  await expectFail('unidade comum não recebe membros', u.adminCoinfra, `INSERT INTO unidades_grupo_membros (grupo_id, membro_id) VALUES ($1, $2)`, [ubs1, ubs2], /não é um grupo/);
  await expectFail('regra de rateio só vale para grupo', u.adminCoinfra,
    `INSERT INTO unidades_atendidas (tenant_id, nome, regra_rateio) VALUES ($1, 'Hospital', 'OBRIGATORIO')`, [A]);
  await expectFail('grupo com membros não deixa de ser grupo', u.adminCoinfra, `UPDATE unidades_atendidas SET eh_grupo = false, regra_rateio = 'NAO_APLICAVEL' WHERE id = $1`, [grupo], /Remova/);
  const ucC = (await as(adminC, `INSERT INTO unidades_atendidas (tenant_id, nome, tipo) VALUES ($1, 'UBS Gama', 'UBS') RETURNING id`, [C])).rows[0].id;
  await expectFail('unidade de outro órgão não entra no grupo', u.adminCoinfra, `INSERT INTO unidades_grupo_membros (grupo_id, membro_id) VALUES ($1, $2)`, [grupo, ucC]);
  await expectFail('diretoria não cadastra unidade atendida', u.dirAdm, `INSERT INTO unidades_atendidas (tenant_id, nome) VALUES ($1, 'Z')`, [A]);
  await expectFail('responsável precisa ser servidor do órgão', adminC,
    `UPDATE unidades_atendidas SET responsavel_id = $1 WHERE id = $2`, [serv.id, ucC], /responsável/);
  await expectOk('administrativo tira unidade do grupo', u.adminCoinfra, `DELETE FROM unidades_grupo_membros WHERE grupo_id = $1 AND membro_id = $2`, [grupo, ubs2]);

  console.log('Classificação orçamentária (catálogo do ente, cadastrado pela plataforma)');
  const enteA = (await expectOk('plataforma cria o ente (município)', u.plat, `INSERT INTO entes (nome, uf) VALUES ('Município de Alfa', 'SE') RETURNING id`))?.rows[0].id;
  await expectFail('Master do órgão não cria ente', u.masterA, `INSERT INTO entes (nome) VALUES ('Município Intruso')`);
  await expectFail('Master do órgão não vincula o próprio órgão a um ente', u.masterA, `UPDATE tenants SET ente_id = $1 WHERE id = $2`, [enteA, A], /plataforma/);
  await expectOk('plataforma vincula o órgão ao ente', u.plat, `UPDATE tenants SET ente_id = $1 WHERE id = $2`, [enteA, A]);
  const enteC = (await as(u.plat, `INSERT INTO entes (nome) VALUES ('Município de Gama') RETURNING id`)).rows[0].id;
  await as(u.plat, `UPDATE tenants SET ente_id = $1 WHERE id = $2`, [enteC, C]);
  const cl = (tipo, codigo, descricao, pai = null, quem = u.plat, ente = enteA) =>
    as(quem, `INSERT INTO classificadores (ente_id, tipo, codigo, descricao, pai_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, natureza_acao`, [ente, tipo, codigo, descricao, pai]);
  await expectFail('Master do órgão não cadastra classificador (só a plataforma)', u.masterA,
    `INSERT INTO classificadores (ente_id, tipo, codigo, descricao) VALUES ($1, 'FONTE', '1500', 'Recursos livres')`, [enteA]);
  await expectFail('administrativo não cadastra classificador (só lê)', u.adminCoinfra,
    `INSERT INTO classificadores (ente_id, tipo, codigo, descricao) VALUES ($1, 'FONTE', '1500', 'Recursos livres')`, [enteA]);
  const prog = (await cl('PROGRAMA', '0017', 'Atenção Básica')).rows[0].id;
  const acao = (await cl('ACAO', '2090', 'Manutenção da Rede Básica', prog)).rows[0];
  check(acao.natureza_acao === 'ATIVIDADE', 'natureza da ação pelo 1º dígito (2 = atividade)');
  const acao2 = (await cl('ACAO', '2088', 'Manutenção da Atenção Especializada')).rows[0].id;
  const el39 = (await cl('ELEMENTO', '39', 'Outros Serviços de Terceiros - PJ')).rows[0].id;
  const el30 = (await cl('ELEMENTO', '30', 'Material de Consumo')).rows[0].id;
  const sub39 = (await cl('SUBELEMENTO', '16', 'Manutenção e conservação de bens imóveis', el39)).rows[0].id;
  const sub30 = (await cl('SUBELEMENTO', '24', 'Material para manutenção de bens imóveis', el30)).rows[0].id;
  await expectFail('subelemento sem elemento é recusado', u.plat,
    `INSERT INTO classificadores (ente_id, tipo, codigo, descricao) VALUES ($1, 'SUBELEMENTO', '99', 'Solto')`, [enteA], /exige/);
  await expectFail('subelemento abaixo de programa é recusado', u.plat,
    `INSERT INTO classificadores (ente_id, tipo, codigo, descricao, pai_id) VALUES ($1, 'SUBELEMENTO', '98', 'Errado', $2)`, [enteA, prog], /só pode ficar abaixo/);
  const fonte = (await cl('FONTE', '1500', 'Recursos não vinculados de impostos')).rows[0].id;
  const fonteC = (await cl('FONTE', '1500', 'Recursos livres', null, u.plat, enteC)).rows[0].id;
  await expectFail('código repetido do mesmo tipo no ente é recusado', u.plat,
    `INSERT INTO classificadores (ente_id, tipo, codigo, descricao) VALUES ($1, 'ELEMENTO', '39', 'Duplicado')`, [enteA], /classificadores_codigo_unico/);
  await expectFail('Master do órgão não monta dotação', u.masterA,
    `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, fonte_id) VALUES ($1, $2, $3, $4)`, [enteA, acao.id, el39, fonte]);
  const dot = (await expectOk('plataforma monta a dotação (ação + elemento + subelemento + fonte)', u.plat,
    `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, subelemento_id, fonte_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, programa_id, codigo_completo`,
    [enteA, acao.id, el39, sub39, fonte]))?.rows[0];
  check(dot.programa_id === prog, 'programa preenchido a partir da ação');
  check(dot.codigo_completo === '0017.2090 | 39.16 | Fonte 1500', `código completo montado pelo banco (${dot.codigo_completo})`);
  await expectFail('a mesma combinação não é cadastrada duas vezes', u.plat,
    `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, subelemento_id, fonte_id) VALUES ($1, $2, $3, $4, $5)`,
    [enteA, acao.id, el39, sub39, fonte], /classificacoes_combinacao_unica/);
  await expectFail('subelemento de outro elemento é recusado', u.plat,
    `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, subelemento_id, fonte_id) VALUES ($1, $2, $3, $4, $5)`,
    [enteA, acao2, el39, sub30, fonte], /não pertence ao elemento/);
  await expectFail('classificador de outro ente é recusado', u.plat,
    `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, fonte_id) VALUES ($1, $2, $3, $4)`, [enteA, acao2, el30, fonteC], /neste ente/);
  await expectFail('classificador do tipo errado no campo é recusado', u.plat,
    `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, fonte_id) VALUES ($1, $2, $3, $4)`, [enteA, el30, el30, fonte], /tipo errado/);
  await expectOk('segunda dotação (2088 / 30.24)', u.plat,
    `INSERT INTO classificacoes_orcamentarias (ente_id, acao_id, elemento_id, subelemento_id, fonte_id) VALUES ($1, $2, $3, $4, $5)`, [enteA, acao2, el30, sub30, fonte]);
  check((await as(u.adminCoinfra, `SELECT count(*)::int n FROM classificacoes_orcamentarias WHERE busca LIKE '%manutenção da rede%'`)).rows[0].n === 1,
    'administrativo do órgão pesquisa as dotações do ente pela descrição da ação');
  check((await as(u.masterA, `UPDATE classificadores SET descricao = 'X' WHERE id = $1 RETURNING id`, [acao.id])).rows.length === 0,
    'Master do órgão não altera classificador (nenhuma linha atualizada)');
  await as(u.plat, `UPDATE classificadores SET descricao = 'Manutenção da Atenção Primária' WHERE id = $1`, [acao.id]);
  check((await one(`SELECT busca FROM classificacoes_orcamentarias WHERE id = $1`, [dot.id])).busca.includes('atenção primária'), 'mudar a descrição do classificador atualiza as dotações');
  check((await as(adminC, `SELECT count(*)::int n FROM classificacoes_orcamentarias`)).rows[0].n === 0, 'órgão de outro ente não vê as dotações');
  await expectFail('ninguém apaga dotação pela API', u.plat, `DELETE FROM classificacoes_orcamentarias WHERE id = $1`, [dot.id]);
}
