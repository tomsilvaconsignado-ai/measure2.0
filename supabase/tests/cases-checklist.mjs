// Checklist da nota no modelo da SMS: dados preenchidos pelo sistema, itens SIM/NÃO, declaração e responsável.
export default async function ({ as, check, expectFail, one, u, A }) {
  const val = async (quem, sql, params = []) => (await as(quem, sql, params)).rows[0];
  const nota = (await one(`SELECT id, contrato_id FROM notas_fiscais WHERE tenant_id = $1 AND numero = '5501'`, [A]));
  const dados = async (id) => (await one(`SELECT dados FROM documentos_emitidos WHERE id = $1`, [id])).dados;
  const emitir = async (opcoes) => (await val(u.adminCoinfra, `SELECT emitir_checklist_nota($1, $2) id`, [nota.id, JSON.stringify(opcoes)])).id;

  console.log('Checklist no modelo da SMS');
  const d = await dados(await emitir({}));
  check(d.titulo.startsWith('FORMULÁRIO PARA ANÁLISE DOS DOCUMENTOS'), 'título do modelo');
  check(d.itens.length === 20 && d.itens[0].marca === 'SIM' && d.itens[1].marca === null && d.itens[19].descricao.includes('RANFS') && d.itens[19].marca === 'SIM',
    'itens e marcações iniciais do modelo (1 SIM, 2 em branco, 20 SIM)');
  const ct = await one(`SELECT numero, objeto FROM contratos WHERE id = $1`, [nota.contrato_id]);
  check(d.contrato.numero === ct.numero && d.contrato.objeto === ct.objeto && !!d.fornecedor.nome && d.nota.numero === '5501', 'contrato, objeto, contratada e nota preenchidos');
  check(!!d.meses && !!d.periodo_inicio && !!d.periodo_fim && !!d.nota.apresentacao && Number(d.nota.valor) > 0, 'mês de referência, período de execução, data de apresentação e valor');
  check(d.nota_pendente === false, 'declaração padrão: não existe nota pendente');

  const desig = (await as(u.adminCoinfra, `SELECT d.id, d.papel FROM contrato_designacoes d WHERE d.contrato_id = $1 AND d.fim IS NULL ORDER BY d.papel`, [nota.contrato_id])).rows;
  const fiscal = desig.find((x) => x.papel === 'FISCAL');
  if (fiscal) check(d.responsavel?.papel === 'FISCAL' && !!d.responsavel.nome && !!d.responsavel.matricula, 'fiscal do contrato por padrão (nome e matrícula)');
  const outro = desig.find((x) => x.papel !== 'FISCAL');
  if (outro) check((await dados(await emitir({ designacao_id: outro.id }))).responsavel.papel === outro.papel, `responsável trocado para ${outro.papel.toLowerCase()}`);
  await expectFail('responsável que não está designado no contrato é recusado', u.adminCoinfra, `SELECT emitir_checklist_nota($1, $2)`,
    [nota.id, JSON.stringify({ designacao_id: '00000000-0000-0000-0000-000000000099' })], /não está designado/);

  const itens = d.itens.map((i, k) => ({ descricao: i.descricao, marca: k === 1 ? 'SIM' : k === 2 ? 'NAO' : i.marca }));
  const d2 = await dados(await emitir({ itens, funcionarios: '12', nota_pendente: true }));
  check(d2.itens[1].marca === 'SIM' && d2.itens[2].marca === 'NAO' && d2.funcionarios === '12' && d2.nota_pendente === true, 'marcações, nº de funcionários e declaração escolhidos na emissão');
  await expectFail('marcação inválida é recusada', u.adminCoinfra, `SELECT emitir_checklist_nota($1, $2)`,
    [nota.id, JSON.stringify({ itens: [{ descricao: 'NOTA FISCAL', marca: 'TALVEZ' }] })], /Marcação inválida/);
  const outroOrgao = (await one(`SELECT id FROM perfis WHERE email = 'adminc@teste.gov.br'`)).id;
  await expectFail('outro órgão não emite o checklist', outroOrgao, `SELECT emitir_checklist_nota($1, '{}')`, [nota.id], /não encontrada/);
}
