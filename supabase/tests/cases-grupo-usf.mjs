// Grupo USF: unidade cujo nome começa com "USF" entra sozinha no grupo USF do órgão (e sai se for renomeada).
export default async function ({ db, as, check, expectOk, one, u, A }) {
  await db.exec('RESET ROLE');
  console.log('Grupo USF');
  const ins = (nome, extra = {}) => expectOk(`cadastra "${nome}"`, u.masterA, `INSERT INTO unidades_atendidas (tenant_id, nome, tipo, eh_grupo, regra_rateio, sigla)
    VALUES ($1, $2, 'USF', $3, $4, $5) RETURNING id`, [A, nome, extra.grupo ?? false, extra.grupo ? 'OPCIONAL' : 'NAO_APLICAVEL', extra.sigla ?? null]);
  const antes = (await ins('USF Primeira')).rows[0].id;
  const grupo = (await ins('USF – Unidades de Saúde da Família', { grupo: true, sigla: 'USF' })).rows[0].id;
  const membros = async () => (await one(`SELECT array_agg(membro_id) ids FROM unidades_grupo_membros WHERE grupo_id = $1`, [grupo])).ids ?? [];
  const nova = (await ins('USF Nova Esperança')).rows[0].id;
  const outra = (await ins('Academia da Cidade Teste')).rows[0].id;
  let m = await membros();
  check(m.includes(nova), 'USF nova entra sozinha no grupo USF');
  check(!m.includes(outra), 'unidade que não começa com USF fica fora');
  check(!m.includes(grupo), 'o grupo não entra nele mesmo');
  await as(u.masterA, `UPDATE unidades_atendidas SET nome = 'USF Primeira Renomeada' WHERE id = $1`, [antes]);
  check((await membros()).includes(antes), 'USF já existente entra ao ser salva');
  await as(u.masterA, `UPDATE unidades_atendidas SET nome = 'Posto Nova Esperança' WHERE id = $1`, [nova]);
  check(!(await membros()).includes(nova), 'renomeada sem USF, sai do grupo');
  check(!!(await one(`SELECT 1 x FROM auditoria WHERE entidade = 'unidades_grupo_membros' AND acao = 'INSERT' LIMIT 1`)), 'entrada no grupo registrada na auditoria');
  await db.exec('RESET ROLE');
}
