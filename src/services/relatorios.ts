// Relatórios, painel, notificações, ordens de serviço, importação e exportação.
import { supabase } from '@/lib/supabase';
import type { Decimal } from '@/lib/tipos';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

// ---------------------------------------------------------------- relatórios

export const CAMPOS_CLASSIFICACAO = [
  ['orgaos', 'ORGAO', 'Órgão'], ['unidades_orcamentarias', 'UNIDADE_ORCAMENTARIA', 'Unidade orçamentária'], ['funcoes', 'FUNCAO', 'Função'],
  ['subfuncoes', 'SUBFUNCAO', 'Subfunção'], ['programas', 'PROGRAMA', 'Programa'], ['acoes', 'ACAO', 'Ação'],
  ['categorias', 'CATEGORIA_ECONOMICA', 'Categoria econômica'], ['gnds', 'GND', 'GND'], ['modalidades', 'MODALIDADE', 'Modalidade de aplicação'],
  ['elementos', 'ELEMENTO', 'Elemento de despesa'], ['subelementos', 'SUBELEMENTO', 'Subelemento'], ['fontes', 'FONTE', 'Fonte de recurso'],
  ['detalhamentos', 'DETALHAMENTO_FONTE', 'Detalhamento da fonte'],
] as const;

export interface Filtros {
  ano_base?: 'EMPENHO' | 'EMISSAO';
  anos?: number[];
  contratos?: string[];
  fornecedores?: string[];
  unidades?: string[];
  status_atesto?: string;
  status_pagamento?: string;
  incluir_canceladas?: boolean;
  metrica?: 'NOTAS' | 'PAGO' | 'EMPENHADO';
  detalhar?: Array<'SUBELEMENTO' | 'FONTE'>;
  [classificador: string]: unknown;
}

export interface LinhaNota {
  ano: number; nota_id: string; numero: string; serie: string | null; data_emissao: string;
  fornecedor_nome: string; fornecedor_documento: string; fornecedor_tipo: string;
  contrato_id: string; contrato_numero: string; contrato_objeto: string; empenho: string; processo: string | null; codigo_completo: string;
  orgao: string | null; unidade_orcamentaria: string | null; funcao: string | null; subfuncao: string | null; programa: string | null;
  acao_codigo: string; acao_descricao: string; natureza_acao: string | null; categoria: string | null; gnd: string | null; modalidade: string | null;
  elemento_codigo: string; elemento_descricao: string; subelemento_codigo: string | null; subelemento_descricao: string | null;
  fonte_codigo: string; fonte_descricao: string; detalhamento: string | null; unidades: string | null; meses_referencia: string | null;
  valor: Decimal; pago: Decimal; status_atesto: string; status_pagamento: string; cancelada: boolean;
}

export interface LinhaConsumo {
  ano: number; fornecedor_nome: string; contrato_id: string; contrato_numero: string; contrato_objeto: string;
  acao_codigo: string; acao_descricao: string; elemento_codigo: string; elemento_descricao: string;
  subelemento: string | null; fonte: string | null; valor: Decimal;
}

export interface Totais { quantidade: number; valor: Decimal; pago: Decimal; por_ano: Array<{ ano: number; quantidade: number; valor: Decimal; pago: Decimal }> }

const limpar = (tenantId: string, f: Filtros) => {
  const p: Record<string, unknown> = { tenant_id: tenantId };
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) p[k] = v;
  return p;
};

export async function relatorioNotas(tenantId: string, f: Filtros, limite: number, offset: number) {
  const r = await supabase.rpc('relatorio_notas', { p: limpar(tenantId, f) }, { count: 'exact' }).range(offset, offset + limite - 1);
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as LinhaNota[], total: r.count ?? 0 };
}

export async function relatorioNotasTodas(tenantId: string, f: Filtros, maximo = 10000) {
  const todas: LinhaNota[] = [];
  for (let o = 0; o < maximo; o += 1000) {
    const { itens } = await relatorioNotas(tenantId, f, 1000, o);
    todas.push(...itens);
    if (itens.length < 1000) break;
  }
  return todas;
}

export async function relatorioTotais(tenantId: string, f: Filtros) {
  return falhou(await supabase.rpc('relatorio_notas_totais', { p: limpar(tenantId, f) })) as Totais;
}

export async function relatorioConsumo(tenantId: string, f: Filtros) {
  return falhou(await supabase.rpc('relatorio_consumo', { p: limpar(tenantId, f) })) as LinhaConsumo[];
}

export async function anosComMovimento(tenantId: string) {
  return falhou(await supabase.rpc('anos_com_movimento', { p_tenant: tenantId })) as number[];
}

export async function registrarExportacao(tenantId: string, recurso: string, descricao: string, quantidade: number) {
  falhou(await supabase.rpc('registrar_exportacao', { p_tenant: tenantId, p_recurso: recurso, p_descricao: descricao, p_quantidade: quantidade }));
}

// ---------------------------------------------------------------- painel e notificações

export interface Painel {
  ano: number;
  contratos: { vigentes: number; a_vencer: number; vencidos: number; nao_iniciados: number; valor_vigentes: Decimal; saldo_vigentes: Decimal };
  empenhos: { quantidade: number; empenhado: Decimal; utilizado: Decimal; saldo: Decimal; saldo_baixo: number };
  notas: { quantidade: number; valor: Decimal; pago: Decimal; pendentes_atesto: number; pendentes_pagamento: number; atestadas: number };
  cadastros: { fornecedores_ativos: number | null; servidores_ativos: number; servidores_exonerados: number; unidades_atendidas: number | null; os_abertas: number };
  mensal: Array<{ mes: number; notas: Decimal }>;
  por_acao: Array<{ codigo: string; descricao: string; valor: Decimal }>;
  vencendo: Array<{ id: string; numero: string; fornecedor_nome: string; data_fim_atual: string; dias_para_vencer: number; saldo: Decimal }>;
}

export async function painel(tenantId: string, ano: number | null) {
  return falhou(await supabase.rpc('painel', { p_tenant: tenantId, p_ano: ano })) as Painel;
}

export interface Notificacao { tipo: 'ATESTO' | 'VENCIMENTO' | 'PAGAMENTO' | 'SALDO'; severidade: 'alta' | 'media'; titulo: string; descricao: string; link: string }

export async function minhasNotificacoes(tenantId: string) {
  return falhou(await supabase.rpc('minhas_notificacoes', { p_tenant: tenantId })) as Notificacao[];
}

// ---------------------------------------------------------------- ordens de serviço

export interface OrdemServico {
  id: string; tenant_id: string; unidade_id: string; numero: number; ano: number; data_abertura: string; titulo: string;
  descricao: string | null; contrato_id: string | null; tipo_servico_id: string | null; responsavel_id: string | null;
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'; status: 'ABERTA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  previsao: string | null; data_conclusao: string | null; observacoes: string | null; motivo_cancelamento: string | null;
  unidade?: { nome: string; sigla: string | null } | null;
  contrato?: { numero: string } | null;
  tipo_servico?: { nome: string } | null;
}

export const numeroOs = (o: Pick<OrdemServico, 'numero' | 'ano'>) => `${String(o.numero).padStart(4, '0')}/${o.ano}`;

export async function listarOs(p: { tenantId: string; busca?: string; status?: string | null; ano?: number | null; limite: number; offset: number }) {
  let q = supabase.from('ordens_servico').select('*, unidade:unidades_organizacionais(nome, sigla), contrato:contratos(numero), tipo_servico:tipos_servico(nome)', { count: 'exact' })
    .eq('tenant_id', p.tenantId).order('ano', { ascending: false }).order('numero', { ascending: false }).range(p.offset, p.offset + p.limite - 1);
  if (p.status) q = q.eq('status', p.status);
  if (p.ano) q = q.eq('ano', p.ano);
  const t = (p.busca ?? '').replace(/[%,()*\\]/g, ' ').trim();
  if (t) {
    const m = t.match(/^(\d{1,4})(?:\/(\d{4}))?$/);
    q = m ? q.eq('numero', Number(m[1])) : q.or(`titulo.ilike.*${t}*,descricao.ilike.*${t}*`);
  }
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as OrdemServico[], total: r.count ?? 0 };
}

export async function salvarOs(id: string | null, dados: Partial<OrdemServico>, unidades: string[] | null) {
  let o: OrdemServico;
  if (id) {
    const { tenant_id: _t, numero: _n, ano: _a, ...resto } = dados;
    o = falhou(await supabase.from('ordens_servico').update(resto).eq('id', id).select().single()) as OrdemServico;
  } else {
    o = falhou(await supabase.from('ordens_servico').insert({ ...dados, numero: 0, ano: 0 }).select().single()) as OrdemServico;
  }
  if (unidades) {
    if (id) falhou(await supabase.from('os_unidades').delete().eq('os_id', o.id));
    if (unidades.length) falhou(await supabase.from('os_unidades').insert(unidades.map((u) => ({ os_id: o.id, unidade_atendida_id: u }))));
  }
  return o;
}

export async function unidadesDaOs(osId: string) {
  const r = falhou(await supabase.from('os_unidades').select('unidade:unidades_atendidas(id, nome)').eq('os_id', osId)) as unknown as Array<{ unidade: { id: string; nome: string } }>;
  return r.map((x) => x.unidade);
}

// ---------------------------------------------------------------- importação

export interface ResultadoImportacao {
  total: number; validos: number; aplicado: boolean;
  duplicados: Array<{ linha: number; documento: string; motivo: string }>;
  erros: Array<{ linha: number; campo: string; mensagem: string }>;
}

export async function importar(tipo: 'fornecedores' | 'servidores' | 'unidades_atendidas', tenantId: string, linhas: Array<Record<string, unknown>>, aplicar: boolean, ignorarDuplicados: boolean) {
  return falhou(await supabase.rpc(`importar_${tipo}`, { p_tenant: tenantId, p_linhas: linhas, p_aplicar: aplicar, p_ignorar_duplicados: ignorarDuplicados })) as ResultadoImportacao;
}
