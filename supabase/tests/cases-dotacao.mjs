// Dotação orçamentária do ente, cadastrada pela plataforma no formato da nota de empenho
// (modelo: empenho 10230012/2026 do Fundo Municipal de Saúde de Aracaju).
export default async function ({ as, check, expectOk, expectFail, one, u, A }) {
  const C = (await one(`SELECT id FROM tenants WHERE nome_curto = 'Gama'`)).id;
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const adminC = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  const enteA = (await one(`SELECT ente_id FROM tenants WHERE id = $1`, [A])).ente_id;
  const F = (await val(u.plat, `INSERT INTO tenants (nome_oficial, nome_curto, ente_id) VALUES ('Fundo Municipal de Saúde de Alfa', 'FMS Alfa', $1) RETURNING id`, [enteA])).id;
  const campos = {
    unidade_orcamentaria: { codigo: '18401', descricao: 'FUNDO MUNICIPAL DE SAÚDE' },
    funcao: { codigo: '10', descricao: 'Saúde' },
    subfuncao: { codigo: '301', descricao: 'Atenção Básica' },
    programa: { codigo: '0085', descricao: 'ATENÇÃO A SAUDE' },
    acao: { codigo: '2091', descricao: 'Fortalecimento da Rede de Atenção Primária a Saúde' },
    natureza: { codigo: '33903900', descricao: 'Outros Serviços de Terceiros - Pessoa Jurídica' },
    subelemento: { codigo: '33903914', descricao: 'Manutenção e Conservação de Bens Imóveis' },
    fonte: { codigo: '27490000', descricao: 'Outras vinculações de transferências' },
    codigo_acompanhamento: { codigo: '27490000', descricao: 'Outras vinculações de transferências' },
    id_uso: { codigo: '0', descricao: 'Recursos não destinados à contrapartida' },
    idoc: { codigo: '0000', descricao: 'Sem identificação' },
    resultado_primario: { codigo: '2', descricao: 'Despesa Primária Discricionária' },
    subfonte: { codigo: '0', descricao: 'Sem subFonte' },
  };
  const modelo = { ente_id: enteA, orgaos: [F], campos };
  const cad = (quem, p) => as(quem, `SELECT cadastrar_dotacao($1) r`, [JSON.stringify(p)]);

  console.log('Dotação no formato da nota de empenho (plataforma)');
  await expectFail('Master do órgão não cadastra dotação', u.masterA, `SELECT cadastrar_dotacao($1)`, [JSON.stringify(modelo)], /plataforma/);
  const r = (await cad(u.plat, modelo)).rows[0].r;
  check(r.criada && r.codigo_completo === '18401 | 10.301.0085.2091 | 33903914 | Fonte 27490000', `código como na nota de empenho (${r.codigo_completo})`);
  const det = await one(`SELECT * FROM classificacao_detalhada WHERE id = $1`, [r.id]);
  check(det.categoria_codigo === '3' && det.gnd_codigo === '3' && det.modalidade_codigo === '90' && det.elemento_codigo === '39' && det.subelemento_codigo === '14',
    'natureza 33903900 desmembrada: categoria 3, GND 3, modalidade 90, elemento 39; subelemento 14');
  check(det.categoria_descricao === 'Despesas Correntes' && det.gnd_descricao === 'Outras Despesas Correntes' && det.modalidade_descricao === 'Aplicações Diretas',
    'descrições padrão de categoria, GND e modalidade');
  check(det.co_codigo === '27490000' && det.iduso_codigo === '0' && det.idoc_codigo === '0000' && det.resultado_primario_codigo === '2' && det.subfonte_codigo === '0',
    'CO, IdUso, IDoc, resultado primário e subfonte gravados');
  check(det.programa_codigo === '0085' && det.natureza_acao === 'ATIVIDADE' && det.uo_descricao === 'FUNDO MUNICIPAL DE SAÚDE', 'UO, programa e ação (atividade)');
  const r2 = (await cad(u.plat, modelo)).rows[0].r;
  check(!r2.criada && r2.id === r.id, 'mesmo empenho cadastrado de novo: reaproveita a dotação, sem duplicar');
  const antes = (await one(`SELECT count(*)::int n FROM classificadores WHERE ente_id = $1`, [enteA])).n;
  const outra = (await cad(u.plat, { ...modelo, campos: { ...campos, subelemento: { codigo: '33903917', descricao: 'Manutenção e Conservação de Máquinas e Equipamentos' } } })).rows[0].r;
  check(outra.criada && (await one(`SELECT count(*)::int n FROM classificadores WHERE ente_id = $1`, [enteA])).n === antes + 1,
    'outra dotação da mesma UO cria só o subelemento novo (reaproveita os códigos)');
  await expectFail('natureza com menos de 8 dígitos é recusada', u.plat, `SELECT cadastrar_dotacao($1)`,
    [JSON.stringify({ ...modelo, campos: { ...campos, natureza: { codigo: '339039', descricao: 'x' } } })], /8 dígitos/);
  await expectFail('subelemento de outra natureza é recusado', u.plat, `SELECT cadastrar_dotacao($1)`,
    [JSON.stringify({ ...modelo, campos: { ...campos, subelemento: { codigo: '33903014', descricao: 'x' } } })], /não pertence à natureza/);
  await expectFail('código novo sem descrição é recusado', u.plat, `SELECT cadastrar_dotacao($1)`,
    [JSON.stringify({ ...modelo, campos: { ...campos, acao: { codigo: '9999', descricao: '' } } })], /Informe a descrição/);

  console.log('Quem usa a dotação: unidade orçamentária → órgãos');
  check((await val(u.plat, `SELECT dotacao_disponivel($1, $2) d`, [r.id, F])).d === true, 'UO 18401 indicada para o Fundo: dotação disponível para ele');
  check((await val(u.plat, `SELECT dotacao_disponivel($1, $2) d`, [r.id, A])).d === false, 'mesmo ente, UO não indicada para a Prefeitura: indisponível');
  const lista = (await val(u.masterA, `SELECT dotacoes_do_orgao($1, null, 'ATIVOS', 100, 0) d`, [A])).d;
  check(!lista.itens.some((x) => x.id === r.id) && lista.total >= 2, 'a Prefeitura não vê a dotação do Fundo na lista dela (vê as sem UO)');
  const ct = (await one(`SELECT id FROM contratos WHERE tenant_id = $1 ORDER BY criado_em LIMIT 1`, [A])).id;
  await expectFail('contrato da Prefeitura não recebe dotação de UO de outro órgão', u.masterA,
    `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2)`, [ct, r.id], /não disponível/);
  const uo = (await one(`SELECT id FROM classificadores WHERE ente_id = $1 AND tipo = 'UNIDADE_ORCAMENTARIA' AND codigo = '18401'`, [enteA])).id;
  await expectFail('Master do órgão não indica UO para órgão', u.masterA, `INSERT INTO unidade_orcamentaria_orgaos (classificador_id, tenant_id) VALUES ($1, $2)`, [uo, A]);
  await expectFail('UO não é indicada para órgão de outro ente', u.plat, `INSERT INTO unidade_orcamentaria_orgaos (classificador_id, tenant_id) VALUES ($1, $2)`, [uo, C], /mesmo ente/);
  await expectOk('plataforma indica a UO 18401 também para a Prefeitura', u.plat, `INSERT INTO unidade_orcamentaria_orgaos (classificador_id, tenant_id) VALUES ($1, $2)`, [uo, A]);
  check((await val(u.masterA, `SELECT dotacoes_do_orgao($1, '33903914', 'ATIVOS', 50, 0) d`, [A])).d.total === 1, 'agora a Prefeitura encontra a dotação pela natureza 33903914');
  await expectOk('contrato da Prefeitura passa a receber a dotação', u.masterA, `INSERT INTO contrato_dotacoes (contrato_id, classificacao_id) VALUES ($1, $2)`, [ct, r.id]);

  console.log('Isolamento e leitura do catálogo');
  check((await as(adminC, `SELECT id FROM classificacoes_orcamentarias WHERE id = $1`, [r.id])).rows.length === 0, 'órgão de outro ente não vê o catálogo de Alfa');
  check((await val(adminC, `SELECT dotacoes_do_orgao($1) d`, [A])).d.total === 0, 'nem pela função, passando o órgão de Alfa');
  check((await as(adminC, `SELECT * FROM buscar_classificadores($1, 'ACAO')`, [A])).rows.length === 0, 'nem nos classificadores');
  check((await as(u.adminCoinfra, `SELECT codigo FROM buscar_classificadores($1, 'SUBELEMENTO', '14')`, [A])).rows.some((x) => x.codigo === '14'), 'membro do órgão busca classificadores do ente (filtros de relatório)');
  check((await as(u.servidor, `SELECT count(*)::int n FROM classificacoes_orcamentarias`)).rows[0].n >= 3, 'qualquer membro do órgão consulta o catálogo (orçamento é público)');
  await expectFail('ente nunca muda depois de criado', u.plat, `UPDATE classificacoes_orcamentarias SET ente_id = (SELECT ente_id FROM tenants WHERE id = $1) WHERE id = $2`, [C, r.id], /não pode ser alterado/);

  console.log('Importação em lote (LOA)');
  const linhas = [
    { linha: 2, orgaos: [F], campos: { ...campos, acao: { codigo: '2092', descricao: 'Ação importada' } } },
    { linha: 3, campos: { ...campos, natureza: { codigo: '339039', descricao: 'Errada' } } },
  ];
  const prev = (await val(u.plat, `SELECT importar_dotacoes($1, $2, false) r`, [enteA, JSON.stringify(linhas)])).r;
  check(prev.novas === 1 && prev.erros.length === 1 && prev.erros[0].linha === 3, `prévia aponta a linha com erro (${JSON.stringify(prev.erros)})`);
  check((await one(`SELECT count(*)::int n FROM classificadores WHERE ente_id = $1 AND codigo = '2092'`, [enteA])).n === 0, 'prévia não grava nada');
  await expectFail('com erro, a importação não grava nada', u.plat, `SELECT importar_dotacoes($1, $2, true)`, [enteA, JSON.stringify(linhas)], /Nada foi gravado/);
  check((await one(`SELECT count(*)::int n FROM classificadores WHERE ente_id = $1 AND codigo = '2092'`, [enteA])).n === 0, 'nada gravado após a recusa');
  const ok = (await val(u.plat, `SELECT importar_dotacoes($1, $2, true) r`, [enteA, JSON.stringify([linhas[0]])])).r;
  check(ok.novas === 1 && ok.aplicado, 'importação válida grava');
  await expectFail('Master do órgão não importa dotações', u.masterA, `SELECT importar_dotacoes($1, $2, true)`, [enteA, JSON.stringify([linhas[0]])], /plataforma/);
  check((await one(`SELECT count(*)::int n FROM auditoria WHERE entidade = 'classificacoes_orcamentarias' AND acao = 'IMPORTACAO'`)).n === 1, 'importação registrada na auditoria');

  console.log('Relatório usa o catálogo do ente');
  const rel = (await as(u.adminCoinfra, `SELECT count(*)::int n FROM relatorio_notas($1)`, [JSON.stringify({ tenant_id: A })])).rows[0].n;
  check(rel >= 3, `relatório completo continua trazendo as notas do órgão (${rel})`);
}
