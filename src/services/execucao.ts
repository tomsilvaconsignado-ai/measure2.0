// Acesso a dados de contratos, empenhos, notas fiscais, atesto, pagamentos e documentos emitidos.
import { supabase } from '@/lib/supabase';
import type {
  Aditivo, Atesto, Contrato, ContratoResumo, Designacao, DocumentoEmitido, Empenho, EmpenhoResumo, Modalidade, NotaResumo,
  ItemFilaPagamento, Pagamento, PagamentoRealizado, Reforco, SituacaoContrato, StatusPagamento,
} from '@/lib/tipos';
import { cabecalhoJustificativa } from './api';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const termo = (t: string) => t.replace(/[%,()*\\]/g, ' ').trim();

// ---------------------------------------------------------------- contratos

export async function modalidades() {
  return falhou(await supabase.from('modalidades_contratacao').select('*').order('ordem')) as Modalidade[];
}

export type FiltroSituacao = 'VIGENTES' | 'VENCIDOS' | 'TODOS';

export async function listarContratos(p: { tenantId: string; busca?: string; situacao: FiltroSituacao; fornecedorId?: string | null; limite: number; offset: number }) {
  let q = supabase.from('v_contratos').select('*', { count: 'exact' }).eq('tenant_id', p.tenantId).eq('ativo', true)
    // A–Z pelo fornecedor; dentro do fornecedor, pelo número do contrato
    .order('fornecedor_nome').order('numero').range(p.offset, p.offset + p.limite - 1);
  if (p.situacao === 'VIGENTES') q = q.in('situacao', ['VIGENTE', 'A_VENCER', 'NAO_INICIADO']);
  if (p.situacao === 'VENCIDOS') q = q.eq('situacao', 'VENCIDO');
  if (p.fornecedorId) q = q.eq('fornecedor_id', p.fornecedorId);
  const t = termo(p.busca ?? '');
  if (t) q = q.or(`numero.ilike.*${t}*,objeto.ilike.*${t}*,fornecedor_nome.ilike.*${t}*,processo_administrativo.ilike.*${t}*`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as ContratoResumo[], total: r.count ?? 0 };
}

export async function obterContrato(id: string) {
  return falhou(await supabase.from('v_contratos').select('*').eq('id', id).single()) as ContratoResumo;
}

/** Pendências de quem está logado: notas que pode atestar e (se dá baixa) notas na fila de pagamento */
export async function contarPendencias(tenantId: string, podePagar: boolean) {
  const [atesto, fila] = await Promise.all([
    supabase.from('v_notas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      .eq('posso_atestar', true).eq('status_atesto', 'PENDENTE').is('cancelada_em', null),
    podePagar ? supabase.rpc('fila_pagamentos', { p_tenant: tenantId }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (atesto.error) throw atesto.error;
  if (fila.error) throw fila.error;
  return { atesto: atesto.count ?? 0, pagamento: (fila.data as unknown[]).length };
}

export async function contarSituacoes(tenantId: string) {
  const { data, error } = await supabase.from('v_contratos').select('situacao').eq('tenant_id', tenantId).eq('ativo', true);
  if (error) throw error;
  const c: Record<SituacaoContrato, number> = { NAO_INICIADO: 0, VIGENTE: 0, A_VENCER: 0, VENCIDO: 0 };
  for (const r of data as Array<{ situacao: SituacaoContrato }>) c[r.situacao]++;
  return c;
}

export async function salvarContrato(id: string | null, dados: Partial<Contrato>) {
  if (id) {
    const { tenant_id: _t, ...resto } = dados;
    return falhou(await supabase.from('contratos').update(resto).eq('id', id).select().single()) as Contrato;
  }
  return falhou(await supabase.from('contratos').insert(dados).select().single()) as Contrato;
}

export async function definirStatusContrato(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('contratos').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function renovarContrato(origem: string, numero: string, inicio: string, fim: string, valor: string) {
  return falhou(await supabase.rpc('renovar_contrato', { p_origem: origem, p_numero: numero, p_inicio: inicio, p_fim: fim, p_valor: valor })) as string;
}

export async function listarDesignacoes(contratoId: string, incluirEncerradas = false) {
  return falhou(await supabase.rpc('designacoes_do_contrato', { p_contrato: contratoId, p_historico: incluirEncerradas })) as Designacao[];
}

export async function designar(contratoId: string, servidorId: string, papel: Designacao['papel'], inicio: string, portaria: string | null) {
  falhou(await supabase.from('contrato_designacoes').insert({ contrato_id: contratoId, servidor_id: servidorId, papel, inicio, portaria }));
}

export async function encerrarDesignacao(id: string, fim: string, motivo: string) {
  falhou(await supabase.from('contrato_designacoes').update({ fim, motivo_fim: motivo }).eq('id', id)
    .setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function listarDotacoesContrato(contratoId: string) {
  return falhou(await supabase.from('v_contrato_dotacoes').select('id, codigo_completo, descricao, ativo').eq('contrato_id', contratoId).order('codigo_completo')) as Array<{ id: string; codigo_completo: string; descricao: string | null; ativo: boolean }>;
}

export async function vincularDotacao(contratoId: string, classificacaoId: string) {
  falhou(await supabase.from('contrato_dotacoes').insert({ contrato_id: contratoId, classificacao_id: classificacaoId }));
}

export async function desvincularDotacao(contratoId: string, classificacaoId: string) {
  falhou(await supabase.from('contrato_dotacoes').delete().match({ contrato_id: contratoId, classificacao_id: classificacaoId }));
}

export async function listarAditivos(contratoId: string) {
  return falhou(await supabase.from('contrato_aditivos').select('*').eq('contrato_id', contratoId).order('criado_em')) as Aditivo[];
}

export async function salvarAditivo(id: string | null, dados: Partial<Aditivo>) {
  if (id) return falhou(await supabase.from('contrato_aditivos').update(dados).eq('id', id));
  return falhou(await supabase.from('contrato_aditivos').insert(dados));
}

export async function decidirAditivo(id: string, aprovar: boolean, motivo: string) {
  falhou(await supabase.rpc('decidir_aditivo', { p_aditivo: id, p_aprovar: aprovar, p_motivo: motivo || null }));
}

/** Contratos em que a pessoa logada está designada (gestor/fiscal/suplente) */
export async function minhasDesignacoes(userId: string, tenantId: string) {
  const r = falhou(await supabase.from('contrato_designacoes').select('id, papel, contrato_id, servidores!inner(user_id)')
    .eq('tenant_id', tenantId).is('fim', null).eq('servidores.user_id', userId)) as unknown as Array<{ papel: string; contrato_id: string }>;
  return r;
}

// ---------------------------------------------------------------- empenhos

export async function listarEmpenhos(p: { tenantId: string; busca?: string; contratoId?: string | null; ano?: number | null; situacao: 'ATIVOS' | 'INATIVOS' | 'TODOS'; limite: number; offset: number }) {
  let q = supabase.from('v_empenhos').select('*', { count: 'exact' }).eq('tenant_id', p.tenantId)
    .order('ano', { ascending: false }).order('numero').range(p.offset, p.offset + p.limite - 1);
  if (p.situacao !== 'TODOS') q = q.eq('ativo', p.situacao === 'ATIVOS');
  if (p.contratoId) q = q.eq('contrato_id', p.contratoId);
  if (p.ano) q = q.eq('ano', p.ano);
  const t = termo(p.busca ?? '');
  if (t) q = q.or(`numero.ilike.*${t}*,contrato_numero.ilike.*${t}*,fornecedor_nome.ilike.*${t}*,classificacao_codigo.ilike.*${t}*`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as EmpenhoResumo[], total: r.count ?? 0 };
}

export async function obterEmpenho(id: string) {
  return falhou(await supabase.from('v_empenhos').select('*').eq('id', id).single()) as EmpenhoResumo;
}

export async function salvarEmpenho(id: string | null, dados: Partial<Empenho>, unidades: string[]) {
  let e: Empenho;
  if (id) {
    const { tenant_id: _t, contrato_id: _c, ...resto } = dados;
    e = falhou(await supabase.from('empenhos').update(resto).eq('id', id).select().single()) as Empenho;
    falhou(await supabase.from('empenho_unidades').delete().eq('empenho_id', id));
  } else {
    e = falhou(await supabase.from('empenhos').insert(dados).select().single()) as Empenho;
  }
  if (unidades.length) falhou(await supabase.from('empenho_unidades').insert(unidades.map((u) => ({ empenho_id: e.id, unidade_atendida_id: u }))));
  return e;
}

export async function unidadesDoEmpenho(empenhoId: string) {
  const r = falhou(await supabase.from('empenho_unidades').select('unidade:unidades_atendidas(id, nome, tipo)').eq('empenho_id', empenhoId)) as unknown as Array<{ unidade: { id: string; nome: string; tipo: string } }>;
  return r.map((x) => x.unidade);
}

export async function definirStatusEmpenho(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('empenhos').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function listarReforcos(empenhoId: string) {
  return falhou(await supabase.from('empenho_reforcos').select('*').eq('empenho_id', empenhoId).order('data')) as Reforco[];
}

export async function criarReforco(empenhoId: string, data: string, valor: string, numero: string | null, motivo: string | null) {
  falhou(await supabase.from('empenho_reforcos').insert({ empenho_id: empenhoId, data, valor, numero, motivo }));
}

export async function cancelarReforco(id: string, motivo: string) {
  falhou(await supabase.rpc('cancelar_reforco', { p_reforco: id, p_motivo: motivo }));
}

// ---------------------------------------------------------------- notas fiscais

export async function listarNotas(p: {
  tenantId: string; busca?: string; contratoId?: string | null; empenhoId?: string | null; atesto?: 'PENDENTE' | 'ATESTADA' | null;
  pagamento?: StatusPagamento | null; limite: number; offset: number;
}) {
  let q = supabase.from('v_notas').select('*', { count: 'exact' }).eq('tenant_id', p.tenantId)
    .order('data_emissao', { ascending: false }).order('numero').range(p.offset, p.offset + p.limite - 1);
  if (p.contratoId) q = q.eq('contrato_id', p.contratoId);
  if (p.empenhoId) q = q.eq('empenho_id', p.empenhoId);
  if (p.atesto) q = q.eq('status_atesto', p.atesto).is('cancelada_em', null);
  if (p.pagamento) q = q.eq('status_pagamento', p.pagamento);
  const t = termo(p.busca ?? '');
  if (t) q = q.or(`numero.ilike.*${t}*,contrato_numero.ilike.*${t}*,fornecedor_nome.ilike.*${t}*,processo_administrativo.ilike.*${t}*`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as NotaResumo[], total: r.count ?? 0 };
}

export async function obterNota(id: string) {
  const [nota, refs, unidades, atestos, pagamentos] = await Promise.all([
    supabase.from('v_notas').select('*').eq('id', id).single(),
    supabase.from('nota_referencias').select('ano, mes').eq('nota_id', id).order('ano').order('mes'),
    supabase.from('v_nota_unidades').select('valor, unidade_id, nome, tipo, eh_grupo').eq('nota_id', id).order('nome'),
    supabase.from('nota_atestos').select('*').eq('nota_id', id).order('atestado_em'),
    supabase.from('nota_pagamentos').select('*').eq('nota_id', id).order('data_pagamento'),
  ]);
  return {
    nota: falhou(nota) as NotaResumo,
    referencias: falhou(refs) as Array<{ ano: number; mes: number }>,
    unidades: falhou(unidades) as Array<{ valor: string | number | null; unidade_id: string; nome: string; tipo: string; eh_grupo: boolean }>,
    atestos: falhou(atestos) as Atesto[],
    pagamentos: falhou(pagamentos) as Pagamento[],
  };
}

export interface DadosNota {
  id?: string; empenho_id: string; numero: string; serie?: string | null; data_emissao: string; processo_administrativo?: string | null;
  valor: string; tipo_servico_id?: string | null; periodo_inicio?: string | null; periodo_fim?: string | null; observacoes?: string | null;
  excecao_saldo?: string | null; referencias: Array<{ ano: number; mes: number }>; unidades: Array<{ id: string; valor: string | null }>;
}

export async function salvarNota(dados: DadosNota) {
  return falhou(await supabase.rpc('salvar_nota_fiscal', { p: dados })) as string;
}

export async function atestarNota(id: string, texto: string) {
  falhou(await supabase.rpc('atestar_nota', { p_nota: id, p_texto: texto }));
}

export interface DadosBaixa {
  nota_id: string; data_pagamento: string; valor: string; documento?: string | null; observacao?: string | null; justificativa_ordem?: string | null;
  retencoes: { iss: string; irrf: string; inss: string; federais: string; outras: string; outras_descricao?: string | null };
}

/** Baixa do pagamento com retenções (o banco confere atesto, datas, saldo e ordem cronológica) */
export async function baixarPagamento(p: DadosBaixa) {
  return falhou(await supabase.rpc('baixar_pagamento', { p })) as string;
}

export async function filaPagamentos(tenantId: string) {
  return falhou(await supabase.rpc('fila_pagamentos', { p_tenant: tenantId })) as ItemFilaPagamento[];
}

export async function pagamentosRealizados(tenantId: string, inicio: string, fim: string, busca: string) {
  return falhou(await supabase.rpc('pagamentos_realizados', { p_tenant: tenantId, p_inicio: inicio, p_fim: fim, p_busca: busca || null })) as PagamentoRealizado[];
}

export async function registrarPagamento(nota: string, data: string, valor: string, documento: string | null, observacao: string | null) {
  falhou(await supabase.rpc('registrar_pagamento', { p_nota: nota, p_data: data, p_valor: valor, p_documento: documento, p_observacao: observacao }));
}

export async function cancelarPagamento(id: string, motivo: string) {
  falhou(await supabase.rpc('cancelar_pagamento', { p_pagamento: id, p_motivo: motivo }));
}

export async function cancelarNota(id: string, motivo: string) {
  falhou(await supabase.rpc('cancelar_nota', { p_nota: id, p_motivo: motivo }));
}

export async function saldoEmpenho(empenhoId: string, ignorarNota?: string | null) {
  return falhou(await supabase.rpc('empenho_saldo', { p_empenho: empenhoId, p_ignorar_nota: ignorarNota ?? null })) as number | string;
}

// ---------------------------------------------------------------- textos e documentos emitidos

export async function modeloAtesto(tenantId: string) {
  const [cfg, glob] = await Promise.all([
    supabase.from('tenant_configuracoes').select('textos').eq('tenant_id', tenantId).single(),
    supabase.from('configuracoes_globais').select('valor').eq('chave', 'texto_atesto_padrao').maybeSingle(),
  ]);
  const textos = (cfg.data?.textos ?? {}) as Record<string, string>;
  return { modelo: textos.atesto || (glob.data?.valor as string | undefined) || '', decreto: textos.decreto || '' };
}

export async function emitirExtrato(tipo: 'contrato' | 'empenho', id: string) {
  return falhou(await supabase.rpc(tipo === 'contrato' ? 'emitir_extrato_contrato' : 'emitir_extrato_empenho', tipo === 'contrato' ? { p_contrato: id } : { p_empenho: id })) as string;
}

export async function obterEmitido(id: string) {
  return falhou(await supabase.from('documentos_emitidos').select('*').eq('id', id).single()) as DocumentoEmitido;
}

export async function listarEmitidos(registroId: string) {
  return falhou(await supabase.from('documentos_emitidos').select('id, tipo, titulo, emitido_em').eq('registro_id', registroId).order('emitido_em', { ascending: false })) as Array<Pick<DocumentoEmitido, 'id' | 'tipo' | 'titulo' | 'emitido_em'>>;
}

/** Servidores do órgão inteiro para designação (dados mínimos, sem dados pessoais) */
export async function buscarServidoresDesignacao(tenantId: string, busca: string) {
  return falhou(await supabase.rpc('buscar_servidores_designacao', { p_tenant: tenantId, p_busca: busca || null, p_limite: 20 })) as Array<{
    id: string; nome: string; matricula: string; cargo: string | null; unidade_nome: string; unidade_sigla: string | null; tem_acesso: boolean;
  }>;
}
