// Consolidado mensal: só servidores com data de nomeação no cadastro
export default async function ({ as, check, one, u, A, coinfra }) {
  console.log('Consolidado exige data de nomeação');
  const sem = (await as(u.adminCoinfra, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula) VALUES ($1, $2, 'Sem Nomeação Teste', 'SN-01') RETURNING id`, [A, coinfra.id])).rows[0].id;
  const com = (await as(u.adminCoinfra, `INSERT INTO servidores (tenant_id, unidade_id, nome, matricula, data_nomeacao) VALUES ($1, $2, 'Com Nomeação Teste', 'CN-01', '2026-01-05') RETURNING id`, [A, coinfra.id])).rows[0].id;
  const ids = (await as(u.adminCoinfra, `SELECT servidor_id FROM consolidado_mensal($1, $2, 2026, 3)`, [A, coinfra.id])).rows.map((r) => r.servidor_id);
  check(!ids.includes(sem), 'servidor sem data de nomeação fica fora do consolidado');
  check(ids.includes(com), 'servidor com data de nomeação entra no consolidado');
  check(!(await as(u.adminCoinfra, `SELECT servidor_id FROM consolidado_mensal($1, $2, 2025, 12)`, [A, coinfra.id])).rows.some((r) => r.servidor_id === com),
    'mês anterior à nomeação também não lista o servidor');
  const doc = (await as(u.adminCoinfra, `SELECT emitir_consolidado($1, $2, 2026, 3) id`, [A, coinfra.id])).rows[0].id;
  const dados = (await one(`SELECT dados FROM documentos_emitidos WHERE id = $1`, [doc])).dados;
  const texto = JSON.stringify(dados);
  check(!texto.includes('Sem Nomeação Teste') && texto.includes('Com Nomeação Teste'), 'documento emitido segue a mesma regra');
}
