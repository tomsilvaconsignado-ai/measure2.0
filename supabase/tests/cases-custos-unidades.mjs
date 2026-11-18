// Relatório de custos por unidade de saúde: distribuição de cada nota por mês de competência e por unidade.
export default async function ({ db, as, check, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  console.log('Relatório de custos por unidade');
  const ct = await one(`SELECT c.id, c.unidade_id, c.fornecedor_id, e.id AS empenho FROM contratos c JOIN empenhos e ON e.contrato_id = c.id AND e.ativo
                         WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  const ua = async (nome, grupo = false) => (await one(`INSERT INTO unidades_atendidas (tenant_id, nome, tipo, eh_grupo, regra_rateio)
    VALUES ($1, $2, 'TESTE', $3, $4) RETURNING id`, [A, nome, grupo, grupo ? 'OPCIONAL' : 'NAO_APLICAVEL'])).id;
  const u1 = await ua('Custo Unidade Um'); const u2 = await ua('Custo Unidade Dois'); const g = await ua('Custo Grupo', true);
  const nota = async (num, valor, refs, unidades, obs = null) => {
    const id = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, data_emissao, valor, observacoes)
      VALUES ($1, $2, $3, $4, $5, $6, '2031-02-10', $7, $8) RETURNING id`, [A, ct.id, ct.empenho, ct.unidade_id, ct.fornecedor_id, num, valor, obs])).id;
    for (const [ano, mes] of refs) await db.query(`INSERT INTO nota_referencias (nota_id, ano, mes, tenant_id) VALUES ($1, $2, $3, $4)`, [id, ano, mes, A]);
    for (const [uid, v] of unidades) await db.query(`INSERT INTO nota_unidades (nota_id, unidade_atendida_id, valor, tenant_id) VALUES ($1, $2, $3, $4)`, [id, uid, v, A]);
    return id;
  };
  await nota('CU-1', 100.00, [[2031, 1]], [[u1, null], [u2, null]]);                 // dividida igualmente
  await nota('CU-2', 90.00, [[2031, 1]], [[u1, 60.00], [u2, 30.00]]);               // rateio informado
  await nota('CU-3', 50.00, [[2031, 1], [2031, 2]], [[u1, null]]);                  // uma unidade, dois meses
  await nota('CU-4', 40.00, [[2031, 2]], [[g, null]]);                              // grupo
  await nota('CU-5', 10.00, [], [], 'Local no sistema anterior: UBS Antiga');       // migrada: local do sistema anterior, mês da emissão

  const r = (await as(u.masterA, `SELECT * FROM relatorio_custos_unidades($1)`, [JSON.stringify({ tenant_id: A, ano: 2031 })])).rows
    .filter((x) => String(x.nota_numero).startsWith('CU-'));
  const soma = (f) => r.filter(f).reduce((s, x) => s + Number(x.valor), 0);
  check(soma((x) => x.nota_numero === 'CU-1' && x.unidade_nome === 'Custo Unidade Um') === 50 && r.find((x) => x.nota_numero === 'CU-1')?.forma === 'DIVIDIDA',
    'várias unidades sem valores: partes iguais (DIVIDIDA)');
  check(soma((x) => x.nota_numero === 'CU-2' && x.unidade_nome === 'Custo Unidade Um') === 60 && r.find((x) => x.nota_numero === 'CU-2')?.forma === 'RATEIO',
    'rateio informado: o valor de cada unidade (RATEIO)');
  check(soma((x) => x.nota_numero === 'CU-3' && x.mes === 1) === 25 && soma((x) => x.nota_numero === 'CU-3' && x.mes === 2) === 25,
    'nota de dois meses: metade em cada mês de competência');
  check(r.find((x) => x.nota_numero === 'CU-4')?.forma === 'GRUPO' && soma((x) => x.nota_numero === 'CU-4') === 40, 'grupo sem unidades: fica no grupo (GRUPO)');
  const mig = r.find((x) => x.nota_numero === 'CU-5');
  check(mig?.forma === 'LOCAL_ANTERIOR' && mig?.unidade_nome === 'UBS Antiga' && mig?.mes === 2, 'migrada sem unidade: local do sistema anterior, no mês da emissão');
  check(soma(() => true) === 290, 'a soma distribuída fecha com o total das notas');
  const so = (await as(u.masterA, `SELECT count(*)::int n FROM relatorio_custos_unidades($1) WHERE nota_numero LIKE 'CU-%'`,
    [JSON.stringify({ tenant_id: A, ano: 2031, mes_inicio: 2, mes_fim: 2, unidades: [u1] })])).rows[0].n;
  check(so === 1, 'filtros de mês e de unidade');
  const fora = (await as(u.adminB, `SELECT count(*)::int n FROM relatorio_custos_unidades($1)`, [JSON.stringify({ tenant_id: A, ano: 2031 })])).rows[0].n;
  check(fora === 0, 'outro órgão não vê os custos');
  await db.exec('RESET ROLE');
  // devolve o saldo do empenho usado pelos casos seguintes
  await db.query(`SELECT set_config('measure.nota_rpc', 'sim', false)`);
  await db.query(`UPDATE notas_fiscais SET cancelada_em = now(), motivo_cancelamento = 'teste' WHERE numero LIKE 'CU-%' AND tenant_id = $1`, [A]);
  await db.query(`SELECT set_config('measure.nota_rpc', '', false)`);
}
