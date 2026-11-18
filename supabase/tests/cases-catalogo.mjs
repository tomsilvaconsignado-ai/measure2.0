// Catálogo CATMAT/CATSER com categorias por órgão e consulta aos dados abertos do Compras.gov.br.
export default async function ({ db, as, check, expectOk, expectFail, one, u, A }) {
  await db.exec('RESET ROLE');
  console.log('Catálogo do Compras.gov.br e categorias por órgão');
  await db.query(`INSERT INTO catalogo_compras (tipo, codigo, descricao, codigo_grupo, nome_grupo, codigo_classe, nome_classe) VALUES
    ('MATERIAL', 461777, 'SERINGA DESCARTÁVEL, CAPACIDADE: 10 ML', 65, 'MÉDICO', 6515, 'INSTRUMENTOS MÉDICOS'),
    ('MATERIAL', 150574, 'CALIBRADOR, NOME: CALIBRADOR', 52, 'MEDIÇÃO', 5220, 'CALIBRES'),
    ('SERVICO', 3662, 'MANUTENCAO EXTINTORES / MANGUEIRAS - COMBATE INCENDIO', 871, 'MANUTENÇÃO', null, null)`);

  await expectFail('quem só consulta não define categorias', u.dirAdm,
    `INSERT INTO catalogo_categorias_orgao (tenant_id, tipo, codigo, nome) VALUES ($1, 'MATERIAL', 6515, 'Médicos')`, [A]);
  await expectOk('o master define a categoria de material do órgão', u.masterA,
    `INSERT INTO catalogo_categorias_orgao (tenant_id, tipo, codigo, nome) VALUES ($1, 'MATERIAL', 6515, 'Instrumentos médicos')`, [A]);

  const busca = async (quem, tipo, texto) => (await as(quem, `SELECT codigo::int, categoria FROM catalogo_buscar($1, $2, $3)`, [A, tipo, texto])).rows;
  const r1 = await busca(u.dirAdm, 'MATERIAL', 'seringa descartavel');
  check(r1.length === 1 && r1[0].codigo === 461777 && r1[0].categoria === 'Instrumentos médicos', 'busca por palavras sem acento acha o item da categoria do órgão');
  const cal = await busca(u.dirAdm, 'MATERIAL', 'calibrador');
  check(cal.length === 1 && cal[0].categoria === null, 'item de outras áreas também aparece (catálogo completo), sem a etiqueta de categoria');
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO catalogo_compras (tipo, codigo, descricao, codigo_classe) VALUES ('MATERIAL', 999001, 'SERINGA DE VIDRO REUTILIZÁVEL', 6640)");
  const ord = await busca(u.dirAdm, 'MATERIAL', 'seringa');
  check(ord.length === 2 && ord[0].codigo === 461777, 'itens das categorias do órgão aparecem primeiro');
  check((await busca(u.dirAdm, 'MATERIAL', 'SERINGA 10ml')).length === 0 && (await busca(u.dirAdm, 'MATERIAL', 'seringa 10')).length === 1, 'todas as palavras precisam estar na descrição');
  check((await busca(u.dirAdm, 'MATERIAL', '4617')).length === 1, 'busca pelo começo do código');
  check((await busca(u.dirAdm, 'SERVICO', 'extintores')).length === 1, 'sem categoria de serviço definida, busca em todo o catálogo de serviços');
  await expectFail('quem não é do órgão não busca', u.adminB, `SELECT * FROM catalogo_buscar($1, 'MATERIAL', 'seringa')`, [A]);
  const resumo = (await as(u.dirAdm, `SELECT itens::int FROM catalogo_categorias_resumo($1) WHERE codigo = 6515`, [A])).rows[0];
  check(resumo?.itens === 1, 'resumo mostra quantos itens da categoria já estão no catálogo');

  await expectFail('ninguém grava no catálogo direto', u.masterA, `INSERT INTO catalogo_compras (tipo, codigo, descricao) VALUES ('MATERIAL', 1, 'x')`);
  await expectFail('quem não edita configurações não sincroniza', u.dirAdm, `SELECT catalogo_sincronizar('MATERIAL', 6515)`, [], /permissão/);
  await expectFail('consulta desconhecida é recusada', u.dirAdm, `SELECT consultar_compras_gov('qualquer', '{}')`, [], /desconhecida/);
  await expectFail('CNPJ inválido é recusado antes de consultar', u.dirAdm, `SELECT consultar_compras_gov('fornecedor', '{"cnpj": "123"}')`, [], /14 números/);
  await expectFail('campo obrigatório faltando é recusado', u.dirAdm, `SELECT consultar_compras_gov('preco_material', '{"estado": "SE"}')`, [], /obrigatório/);
  await expectFail('sem a extensão http (ambiente de teste) a consulta avisa que está indisponível', u.dirAdm,
    `SELECT consultar_compras_gov('preco_material', '{"codigo": "461777", "estado": "se"}')`, [], /não está disponível/);
  await expectFail('a função interna de chamada à API não é exposta', u.dirAdm, `SELECT compras_gov_get('/modulo-material/4_consultarItemMaterial', '{}')`);
  await expectFail('a rotina de atualização do catálogo não é chamada por usuários', u.masterA, 'SELECT catalogo_atualizar_lote(1)');
  await db.exec('RESET ROLE');
  const lote = (await db.query('SELECT catalogo_atualizar_lote(1) r')).rows[0].r;
  check(lote.paginas === 0 && /não está disponível/.test(lote.erro ?? ''), 'sem a extensão http a rotina registra o erro e para, sem quebrar');
  await expectFail('cache da API não é lido por usuários', u.dirAdm, `SELECT * FROM compras_gov_cache`);
}
