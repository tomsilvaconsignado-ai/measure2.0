// Empenho e renovações: a nota fica no contrato da vigência dela, e o empenho pode ser de qualquer contrato
// da mesma cadeia de renovação (mesmo fornecedor e número-base, ex.: "027/2023" e "027/2023 (02)").
export default async function ({ db, as, check, expectOk, expectFail, one, u, A, coinfra }) {
  await db.exec('RESET ROLE');
  const ct = await one(`SELECT c.id, c.numero, c.unidade_id, c.fornecedor_id, c.modalidade, e.id AS empenho FROM contratos c
                         JOIN empenhos e ON e.contrato_id = c.id AND e.ativo
                        WHERE c.tenant_id = $1 AND c.unidade_id = $2 ORDER BY c.criado_em LIMIT 1`, [A, coinfra.id]);
  const outro = await one(`SELECT e.id FROM empenhos e JOIN contratos c ON c.id = e.contrato_id
                            WHERE e.tenant_id = $1 AND c.fornecedor_id <> $2 AND e.ativo LIMIT 1`, [A, ct.fornecedor_id]);

  console.log('Notas: empenho vale para as renovações do contrato');
  // contrato anterior da cadeia, como a migração grava (sem usuário logado)
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  const anterior = (await one(`INSERT INTO contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, objeto, data_inicio, data_fim, valor_global)
    VALUES ($1, $2, $3, $4, $5, 'Vigência anterior', '2020-01-01', '2020-12-31', 1000) RETURNING id`,
    [A, ct.unidade_id, `${ct.numero} (02)`, ct.modalidade, ct.fornecedor_id])).id;

  const cadeia = (await as(u.adminCoinfra, `SELECT array_agg(x) ids FROM contratos_da_cadeia($1) x`, [ct.id])).rows[0].ids;
  check(cadeia.includes(anterior) && cadeia.includes(ct.id), 'cadeia de renovação reúne o contrato e o anterior');

  const dados = (num, contrato, empenho) => JSON.stringify({ contrato_id: contrato, empenho_id: empenho, numero: num, data_emissao: '2020-06-10',
    valor: 1, referencias: [{ ano: 2020, mes: 6 }] });
  await expectOk('nota da vigência anterior com o empenho da renovação', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`, [dados('CAD-1', anterior, ct.empenho)]);
  const nota = await one(`SELECT id, contrato_id, empenho_id FROM notas_fiscais WHERE numero = 'CAD-1' AND fornecedor_id = $1`, [ct.fornecedor_id]);
  check(nota.contrato_id === anterior && nota.empenho_id === ct.empenho, 'nota fica no contrato escolhido e usa o empenho da cadeia');

  // edição sem informar contrato: continua no contrato da vigência
  await expectOk('edição mantém o contrato da nota', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ id: nota.id, empenho_id: ct.empenho, numero: 'CAD-1', data_emissao: '2020-06-11', valor: 1, referencias: [{ ano: 2020, mes: 6 }] })]);
  check((await one(`SELECT contrato_id FROM notas_fiscais WHERE id = $1`, [nota.id])).contrato_id === anterior, 'nota editada não volta para o contrato do empenho');
  await expectFail('edição não troca o contrato da nota', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [JSON.stringify({ id: nota.id, contrato_id: ct.id, empenho_id: ct.empenho, numero: 'CAD-1', data_emissao: '2020-06-11', valor: 1, referencias: [{ ano: 2020, mes: 6 }] })], /não muda/);

  if (outro) await expectFail('empenho de outro fornecedor continua recusado', u.adminCoinfra, `SELECT salvar_nota_fiscal($1)`,
    [dados('CAD-2', anterior, outro.id)], /renovação/);

  // nota migrada sem empenho no contrato anterior: vincula o empenho da renovação
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  const mig = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto)
    VALUES ($1, $2, $3, $4, 'CAD-MIG', '2020-05-10', 1.00, 'ATESTADA') RETURNING id`, [A, anterior, ct.unidade_id, ct.fornecedor_id])).id;
  await expectOk('vincular empenho da renovação a nota migrada do contrato anterior', u.adminCoinfra, `SELECT vincular_empenho_nota($1, $2)`, [mig, ct.empenho]);

  // correção da migração: nota da vigência anterior lançada no contrato novo vai para o anterior
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  const errada = (await one(`INSERT INTO notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, data_emissao, valor, status_atesto)
    VALUES ($1, $2, $3, $4, $5, 'CAD-ERR', '2020-03-10', 1.00, 'ATESTADA') RETURNING id`, [A, ct.id, ct.empenho, ct.unidade_id, ct.fornecedor_id])).id;
  await db.query(`INSERT INTO nota_referencias (nota_id, ano, mes, tenant_id) VALUES ($1, 2020, 3, $2)`, [errada, A]);
  const fs = await import('node:fs');
  const sql = fs.readFileSync(new URL('../migrations/20261205000200_corrige_notas_contrato_vigencia.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  check((await one(`SELECT contrato_id FROM notas_fiscais WHERE id = $1`, [errada])).contrato_id === anterior, 'correção leva a nota ao contrato da vigência dela');
  await db.exec(sql);
  check((await one(`SELECT contrato_id FROM notas_fiscais WHERE id = $1`, [errada])).contrato_id === anterior, 'correção é idempotente');
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE entidade = 'notas_fiscais' AND registro_id = $1 AND acao = 'UPDATE' AND justificativa ILIKE 'Correção da migração%'`, [errada])),
    'correção registrada na auditoria com a justificativa');
  await db.exec('RESET ROLE');
}
