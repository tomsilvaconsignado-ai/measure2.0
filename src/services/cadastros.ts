// Acesso a dados dos cadastros da Fase 2 (fornecedores, servidores, unidades atendidas,
// classificação orçamentária e tipos de serviço).
import { supabase } from '@/lib/supabase';
import type {
  Aniversariante, Classificador, Decreto, FeriasServidor, ItemCurriculo, ClassificadorTipo, ClassificacaoOrcamentaria, ContaBancaria, DadosPessoais, DotacaoDetalhada, Ente, Fornecedor,
  Servidor, ServidorListado, TipoClassificador, TipoServico, UnidadeAtendida,
} from '@/lib/tipos';
import { cabecalhoJustificativa } from './api';
import { enviarDocumento, reduzirImagem } from './documentos';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

/** termo seguro para filtros .or()/.ilike() do PostgREST */
const termo = (t: string) => t.replace(/[%,()*\\]/g, ' ').trim();

// ---------------------------------------------------------------- fornecedores

export async function listarFornecedores(p: { tenantId: string; busca?: string; situacao: 'ATIVOS' | 'INATIVOS' | 'TODOS'; limite: number; offset: number }) {
  let q = supabase.from('fornecedores').select('*', { count: 'exact' }).eq('tenant_id', p.tenantId)
    .order('razao_social').range(p.offset, p.offset + p.limite - 1);
  if (p.situacao !== 'TODOS') q = q.eq('ativo', p.situacao === 'ATIVOS');
  const t = termo(p.busca ?? '');
  if (t) {
    const digitos = t.replace(/\D/g, '');
    q = q.or([`razao_social.ilike.*${t}*`, `nome_fantasia.ilike.*${t}*`, ...(digitos.length >= 3 ? [`documento.like.*${digitos}*`] : [])].join(','));
  }
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as Fornecedor[], total: r.count ?? 0 };
}

export async function buscarFornecedoresOpcoes(tenantId: string, busca: string) {
  return (await listarFornecedores({ tenantId, busca, situacao: 'ATIVOS', limite: 20, offset: 0 })).itens;
}

export type DadosFornecedor = Omit<Fornecedor, 'id' | 'ativo' | 'criado_em' | 'atualizado_em' | 'logo_path'>;

export async function salvarFornecedor(id: string | null, dados: Partial<DadosFornecedor>) {
  if (id) {
    const { tenant_id: _t, ...resto } = dados;
    return falhou(await supabase.from('fornecedores').update(resto).eq('id', id).select().single()) as Fornecedor;
  }
  return falhou(await supabase.from('fornecedores').insert(dados).select().single()) as Fornecedor;
}

export async function definirStatusFornecedor(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('fornecedores').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function enviarLogoFornecedor(f: Fornecedor, arquivo: File) {
  const reduzida = await reduzirImagem(arquivo, 512);
  const doc = await enviarDocumento({ tenantId: f.tenant_id, unidadeId: null, recurso: 'fornecedores', registroId: f.id, categoria: 'LOGO', arquivo: reduzida, nome: reduzida.name });
  falhou(await supabase.from('fornecedores').update({ logo_path: doc.storage_path }).eq('id', f.id));
  return doc.storage_path;
}

export async function listarContas(fornecedorId: string) {
  return falhou(await supabase.from('fornecedor_contas').select('*').eq('fornecedor_id', fornecedorId).eq('ativo', true)
    .order('principal', { ascending: false })) as ContaBancaria[];
}

export async function salvarConta(id: string | null, dados: Partial<ContaBancaria>) {
  // só uma conta principal por fornecedor: desmarca a anterior antes
  if (dados.principal && dados.fornecedor_id) {
    falhou(await supabase.from('fornecedor_contas').update({ principal: false }).eq('fornecedor_id', dados.fornecedor_id).eq('principal', true).neq('id', id ?? '00000000-0000-0000-0000-000000000000'));
  }
  if (id) return falhou(await supabase.from('fornecedor_contas').update(dados).eq('id', id));
  return falhou(await supabase.from('fornecedor_contas').insert(dados));
}

export async function removerConta(id: string, motivo: string) {
  falhou(await supabase.from('fornecedor_contas').update({ ativo: false, principal: false }).eq('id', id)
    .setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

// ---------------------------------------------------------------- servidores

export async function listarServidores(p: { tenantId: string; busca?: string; situacao: 'ATIVOS' | 'EXONERADOS' | 'TODOS'; unidadeId?: string | null; limite: number; offset: number }) {
  return falhou(await supabase.rpc('buscar_servidores', {
    p_tenant: p.tenantId, p_busca: p.busca || null, p_situacao: p.situacao, p_unidade: p.unidadeId || null,
    p_limite: p.limite, p_offset: p.offset,
  })) as { total: number; itens: ServidorListado[] };
}

export async function obterServidor(id: string) {
  const s = falhou(await supabase.from('servidores').select('*').eq('id', id).single()) as Servidor;
  // sem permissão de dados pessoais o RLS devolve vazio (não é erro)
  const { data } = await supabase.from('servidores_dados_pessoais').select('*').eq('servidor_id', id).maybeSingle();
  return { servidor: s, pessoais: (data ?? null) as DadosPessoais | null };
}

export type DadosServidor = Omit<Servidor, 'id' | 'user_id' | 'foto_path'>;

export async function salvarServidor(id: string | null, dados: Partial<DadosServidor>, pessoais: Partial<DadosPessoais> | null) {
  let s: Servidor;
  if (id) {
    const { tenant_id: _t, ...resto } = dados;
    s = falhou(await supabase.from('servidores').update(resto).eq('id', id).select().single()) as Servidor;
  } else {
    s = falhou(await supabase.from('servidores').insert(dados).select().single()) as Servidor;
  }
  if (pessoais) {
    falhou(await supabase.from('servidores_dados_pessoais').upsert({ ...pessoais, servidor_id: s.id }, { onConflict: 'servidor_id' }));
  }
  return s;
}

export async function enviarFotoServidor(s: Servidor, arquivo: File) {
  const reduzida = await reduzirImagem(arquivo, 512);
  const doc = await enviarDocumento({ tenantId: s.tenant_id, unidadeId: s.unidade_id, recurso: 'servidores', registroId: s.id, categoria: 'FOTO', arquivo: reduzida, nome: reduzida.name });
  falhou(await supabase.from('servidores').update({ foto_path: doc.storage_path }).eq('id', s.id));
  return doc.storage_path;
}

export async function aniversariantes(tenantId: string, mes: number) {
  return falhou(await supabase.rpc('aniversariantes', { p_tenant: tenantId, p_mes: mes })) as Aniversariante[];
}

export async function meuCadastroServidor(userId: string, tenantId: string) {
  const { data } = await supabase.from('servidores').select('id').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle();
  return data ? obterServidor((data as { id: string }).id) : null;
}

export async function atualizarMeusDados(servidorId: string, dados: Record<string, string | null>) {
  falhou(await supabase.rpc('atualizar_meus_dados_servidor', { p_servidor: servidorId, p_dados: dados }));
}

// ---------------------------------------------------------------- unidades atendidas

export async function listarUnidadesAtendidas(p: { tenantId: string; busca?: string; situacao: 'ATIVOS' | 'INATIVOS' | 'TODOS'; somenteGrupos?: boolean; limite: number; offset: number }) {
  let q = supabase.from('unidades_atendidas').select('*', { count: 'exact' }).eq('tenant_id', p.tenantId)
    .order('nome').range(p.offset, p.offset + p.limite - 1);
  if (p.situacao !== 'TODOS') q = q.eq('ativo', p.situacao === 'ATIVOS');
  if (p.somenteGrupos) q = q.eq('eh_grupo', true);
  const t = termo(p.busca ?? '');
  if (t) q = q.or(`nome.ilike.*${t}*,sigla.ilike.*${t}*,tipo.ilike.*${t}*,bairro.ilike.*${t}*`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as UnidadeAtendida[], total: r.count ?? 0 };
}

export async function salvarUnidadeAtendida(id: string | null, dados: Partial<UnidadeAtendida>) {
  if (id) {
    const { tenant_id: _t, ...resto } = dados;
    return falhou(await supabase.from('unidades_atendidas').update(resto).eq('id', id).select().single()) as UnidadeAtendida;
  }
  return falhou(await supabase.from('unidades_atendidas').insert(dados).select().single()) as UnidadeAtendida;
}

export async function definirStatusUnidadeAtendida(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('unidades_atendidas').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function obterUnidadeAtendida(id: string) {
  return falhou(await supabase.from('unidades_atendidas').select('*').eq('id', id).single()) as UnidadeAtendida;
}

export async function membrosDoGrupo(grupoId: string) {
  const r = falhou(await supabase.from('unidades_grupo_membros').select('membro:unidades_atendidas!unidades_grupo_membros_membro_id_fkey(*)')
    .eq('grupo_id', grupoId)) as unknown as Array<{ membro: UnidadeAtendida }>;
  return r.map((x) => x.membro).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function gruposDaUnidade(membroId: string) {
  const r = falhou(await supabase.from('unidades_grupo_membros').select('grupo:unidades_atendidas!unidades_grupo_membros_grupo_id_fkey(id, nome)')
    .eq('membro_id', membroId)) as unknown as Array<{ grupo: { id: string; nome: string } }>;
  return r.map((x) => x.grupo);
}

export async function incluirNoGrupo(grupoId: string, membroId: string) {
  falhou(await supabase.from('unidades_grupo_membros').insert({ grupo_id: grupoId, membro_id: membroId }));
}

export async function removerDoGrupo(grupoId: string, membroId: string) {
  falhou(await supabase.from('unidades_grupo_membros').delete().match({ grupo_id: grupoId, membro_id: membroId }));
}

// ---------------------------------------------------------------- classificação orçamentária
// O catálogo pertence ao ente (município) e é cadastrado pela plataforma; os órgãos só consultam.

export async function tiposClassificador() {
  return falhou(await supabase.from('classificador_tipos').select('*').order('ordem')) as ClassificadorTipo[];
}

/** Plataforma: classificadores de um ente */
export async function listarClassificadores(p: { enteId: string; tipo?: TipoClassificador; busca?: string; paiId?: string | null; somenteAtivos?: boolean; limite?: number; offset?: number }) {
  let q = supabase.from('classificadores').select('*', { count: 'exact' }).eq('ente_id', p.enteId).order('codigo');
  if (p.tipo) q = q.eq('tipo', p.tipo);
  if (p.paiId) q = q.eq('pai_id', p.paiId);
  if (p.somenteAtivos) q = q.eq('ativo', true);
  const t = termo(p.busca ?? '');
  if (t) q = q.or(`codigo.ilike.${t}*,descricao.ilike.*${t}*`);
  const limite = p.limite ?? 50;
  q = q.range(p.offset ?? 0, (p.offset ?? 0) + limite - 1);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as Classificador[], total: r.count ?? 0 };
}

/** Órgão: classificadores do ente dele (filtros de relatório) */
export async function buscarClassificadoresOrgao(tenantId: string, tipo: TipoClassificador, busca: string, paiId?: string | null) {
  return falhou(await supabase.rpc('buscar_classificadores', { p_tenant: tenantId, p_tipo: tipo, p_busca: busca || null, p_pai: paiId ?? null, p_limite: 30 })) as Classificador[];
}

export async function obterClassificadores(ids: string[]) {
  if (!ids.length) return [];
  return falhou(await supabase.from('classificadores').select('*').in('id', ids)) as Classificador[];
}

export async function salvarClassificador(id: string | null, dados: Partial<Classificador>) {
  if (id) {
    const { ente_id: _e, tipo: _tp, ...resto } = dados;
    return falhou(await supabase.from('classificadores').update(resto).eq('id', id).select().single()) as Classificador;
  }
  return falhou(await supabase.from('classificadores').insert(dados).select().single()) as Classificador;
}

export async function definirStatusClassificador(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('classificadores').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

/** Órgão: dotações do ente disponíveis para ele (conforme a unidade orçamentária) */
export async function listarClassificacoes(p: { tenantId: string; busca?: string; situacao: 'ATIVOS' | 'INATIVOS' | 'TODOS'; limite: number; offset: number; exercicio?: number | null }) {
  const r = falhou(await supabase.rpc('dotacoes_do_orgao', { p_tenant: p.tenantId, p_busca: termo(p.busca ?? '') || null, p_situacao: p.situacao, p_limite: p.limite, p_offset: p.offset, p_exercicio: p.exercicio ?? null })) as
    { total: number; itens: DotacaoDetalhada[] };
  return r;
}

/** Plataforma: dotações de um ente */
export async function listarDotacoesEnte(p: { enteId: string; busca?: string; situacao: 'ATIVOS' | 'INATIVOS' | 'TODOS'; limite: number; offset: number; exercicio?: number | 'SEM' | null }) {
  let q = supabase.from('classificacoes_orcamentarias').select('*', { count: 'exact' }).eq('ente_id', p.enteId)
    .order('exercicio', { ascending: false, nullsFirst: false }).order('codigo_completo').range(p.offset, p.offset + p.limite - 1);
  if (p.situacao !== 'TODOS') q = q.eq('ativo', p.situacao === 'ATIVOS');
  if (p.exercicio === 'SEM') q = q.is('exercicio', null); else if (p.exercicio) q = q.eq('exercicio', p.exercicio);
  const t = termo(p.busca ?? '').toLowerCase();
  if (t) q = q.ilike('busca', `%${t}%`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as ClassificacaoOrcamentaria[], total: r.count ?? 0 };
}

export async function definirStatusClassificacao(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('classificacoes_orcamentarias').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function salvarObservacaoDotacao(id: string, descricao: string | null) {
  falhou(await supabase.from('classificacoes_orcamentarias').update({ descricao }).eq('id', id));
}

/** Plataforma: identificação e exercício da dotação (as classificações não mudam: para outra combinação, cadastre uma nova) */
export async function editarDotacao(id: string, dados: { descricao: string | null; exercicio: number | null }) {
  falhou(await supabase.from('classificacoes_orcamentarias').update(dados).eq('id', id).select('id').single());
}

export type CampoEmpenho = 'unidade_orcamentaria' | 'unidade_gestora' | 'funcao' | 'subfuncao' | 'programa' | 'acao' | 'natureza' | 'subelemento' | 'fonte'
  | 'codigo_acompanhamento' | 'id_uso' | 'idoc' | 'resultado_primario' | 'subfonte';
export type CamposEmpenho = Partial<Record<CampoEmpenho, { codigo: string; descricao: string }>>;

/** Plataforma: cadastra a dotação no formato da nota de empenho (reaproveita códigos já existentes) */
export async function cadastrarDotacao(p: { enteId: string; campos: CamposEmpenho; orgaos: string[]; descricao?: string | null; exercicio?: number | null }) {
  return falhou(await supabase.rpc('cadastrar_dotacao', { p: { ente_id: p.enteId, campos: p.campos, orgaos: p.orgaos, descricao: p.descricao ?? null, exercicio: p.exercicio ?? null } })) as
    { id: string; criada: boolean; codigo_completo: string; exercicio: number | null };
}

export interface ResultadoImportacaoDotacoes { total: number; novas: number; existentes: number; erros: Array<{ linha: number; mensagem: string }>; aplicado: boolean }

export async function importarDotacoes(enteId: string, linhas: Array<{ linha: number; campos: CamposEmpenho; orgaos?: string[]; descricao?: string | null; exercicio?: string | null }>, aplicar: boolean) {
  return falhou(await supabase.rpc('importar_dotacoes', { p_ente: enteId, p_linhas: linhas, p_aplicar: aplicar })) as ResultadoImportacaoDotacoes;
}

// ---------------------------------------------------------------- entes (plataforma)

export async function listarEntes() {
  return falhou(await supabase.from('entes').select('*').order('nome')) as Ente[];
}

export async function salvarEnte(id: string | null, dados: Partial<Ente>) {
  if (id) return falhou(await supabase.from('entes').update(dados).eq('id', id).select().single()) as Ente;
  return falhou(await supabase.from('entes').insert(dados).select().single()) as Ente;
}

export async function vincularOrgaoAoEnte(tenantId: string, enteId: string | null) {
  falhou(await supabase.from('tenants').update({ ente_id: enteId }).eq('id', tenantId));
}

/** Órgãos que usam cada unidade orçamentária (vazio = todos os órgãos do ente) */
export async function orgaosDasUos(uoIds: string[]) {
  if (!uoIds.length) return [];
  return falhou(await supabase.from('unidade_orcamentaria_orgaos').select('classificador_id, tenant_id').in('classificador_id', uoIds)) as Array<{ classificador_id: string; tenant_id: string }>;
}

export async function definirOrgaosDaUo(uoId: string, atuais: string[], novos: string[]) {
  const sair = atuais.filter((t) => !novos.includes(t));
  const entrar = novos.filter((t) => !atuais.includes(t));
  if (sair.length) falhou(await supabase.from('unidade_orcamentaria_orgaos').delete().eq('classificador_id', uoId).in('tenant_id', sair));
  if (entrar.length) falhou(await supabase.from('unidade_orcamentaria_orgaos').insert(entrar.map((t) => ({ classificador_id: uoId, tenant_id: t }))));
}

// ---------------------------------------------------------------- tipos de serviço

export async function listarTiposServico(tenantId: string) {
  return falhou(await supabase.from('tipos_servico').select('*').eq('tenant_id', tenantId).order('ordem').order('nome')) as TipoServico[];
}

export async function salvarTipoServico(id: string | null, dados: Partial<TipoServico>) {
  if (id) return falhou(await supabase.from('tipos_servico').update({ nome: dados.nome, descricao: dados.descricao, ordem: dados.ordem }).eq('id', id));
  return falhou(await supabase.from('tipos_servico').insert(dados));
}

export async function definirStatusTipoServico(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('tipos_servico').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

// ---------------------------------------------------------------- decretos do órgão (cadastro pela plataforma)

export async function listarDecretos(tenantId: string, somenteAtivos = false) {
  let q = supabase.from('decretos_orgao').select('*').eq('tenant_id', tenantId).order('data_publicacao', { ascending: false, nullsFirst: false }).order('numero');
  if (somenteAtivos) q = q.eq('ativo', true);
  return falhou(await q) as Decreto[];
}

export async function salvarDecreto(id: string | null, dados: Pick<Decreto, 'tenant_id' | 'numero' | 'descricao' | 'data_publicacao'> | Partial<Pick<Decreto, 'ativo'>>) {
  if (id) {
    const { tenant_id: _t, ...resto } = dados as Partial<Decreto>;
    return falhou(await supabase.from('decretos_orgao').update(resto).eq('id', id).select().single()) as Decreto;
  }
  return falhou(await supabase.from('decretos_orgao').insert(dados).select().single()) as Decreto;
}

// ---------------------------------------------------------------- currículo e férias do servidor

export async function salvarCurriculoServidor(servidorId: string, dados: Pick<Servidor, 'escolaridade' | 'curriculo_observacoes'>) {
  falhou(await supabase.from('servidores').update(dados).eq('id', servidorId).select('id').single());
}

export async function listarCurriculo(servidorId: string) {
  return falhou(await supabase.from('servidor_curriculo_itens').select('*').eq('servidor_id', servidorId).is('excluido_em', null)
    .order('tipo').order('ano_conclusao', { ascending: false, nullsFirst: false }).order('inicio', { ascending: false, nullsFirst: false })) as ItemCurriculo[];
}

export type DadosItemCurriculo = Omit<ItemCurriculo, 'id' | 'criado_em'>;

export async function salvarItemCurriculo(id: string | null, dados: DadosItemCurriculo) {
  if (id) {
    const { servidor_id: _s, ...resto } = dados;
    falhou(await supabase.from('servidor_curriculo_itens').update(resto).eq('id', id).select('id').single());
  } else {
    falhou(await supabase.from('servidor_curriculo_itens').insert(dados));
  }
}

/** Remoção lógica: o item sai do currículo e o registro fica na auditoria */
export async function removerItemCurriculo(id: string) {
  falhou(await supabase.from('servidor_curriculo_itens').update({ excluido_em: new Date().toISOString() }).eq('id', id).select('id').single());
}

export async function listarFerias(servidorId: string) {
  return falhou(await supabase.from('v_servidor_ferias').select('*').eq('servidor_id', servidorId)
    .order('aquisitivo_inicio', { ascending: false }).order('gozo_inicio', { ascending: false, nullsFirst: true })) as FeriasServidor[];
}

export interface DadosFerias {
  servidor_id: string; aquisitivo_inicio: string; aquisitivo_fim: string; gozo_inicio: string | null; gozo_fim: string | null; observacoes: string | null;
}

export async function salvarFerias(id: string | null, dados: DadosFerias) {
  if (id) {
    const { servidor_id: _s, ...resto } = dados;
    falhou(await supabase.from('servidor_ferias').update(resto).eq('id', id).select('id').single());
  } else {
    falhou(await supabase.from('servidor_ferias').insert(dados));
  }
}

/** Cancela mantendo o registro no histórico (o banco carimba quem e quando) */
export async function cancelarFerias(id: string, motivo: string) {
  falhou(await supabase.from('servidor_ferias').update({ cancelada_em: new Date().toISOString(), motivo_cancelamento: motivo }).eq('id', id).select('id').single());
}

// ---------------------------------------------------------------- classificação do empenho (campo a campo)

export interface NaturezaDoCatalogo { categoria_id: string; gnd_id: string; modalidade_id: string; elemento_id: string; codigo: string; descricao: string }

/** Naturezas da despesa (8 dígitos) já usadas no catálogo do município */
export async function naturezasDoOrgao(tenantId: string, busca: string) {
  return falhou(await supabase.rpc('naturezas_do_orgao', { p_tenant: tenantId, p_busca: busca || null })) as NaturezaDoCatalogo[];
}

/** Dotação gravada e os seus classificadores (para preencher o quadro de classificação) */
export async function classificacaoDaDotacao(id: string) {
  const dotacao = falhou(await supabase.from('classificacoes_orcamentarias').select('*').eq('id', id).single()) as ClassificacaoOrcamentaria;
  const ids = Object.entries(dotacao).filter(([k, v]) => k.endsWith('_id') && k !== 'ente_id' && typeof v === 'string').map(([, v]) => v as string);
  return { dotacao, classificadores: await obterClassificadores(ids) };
}

/** Acha (ou monta, só com códigos já cadastrados) a dotação da classificação escolhida e a vincula ao contrato */
export async function dotacaoDoEmpenho(p: Record<string, string | number | null>) {
  return falhou(await supabase.rpc('dotacao_do_empenho', { p })) as string;
}

// ---------------------------------------------------------------- naturezas da despesa (Desenvolvedor) e dotações do contrato

export interface NaturezaDespesa { id: string; ente_id: string; codigo: string; descricao: string; elemento_id: string; ativo: boolean }

export async function listarNaturezas(p: { enteId: string; busca?: string; limite: number; offset: number }) {
  let q = supabase.from('naturezas_despesa').select('*', { count: 'exact' }).eq('ente_id', p.enteId).order('codigo').range(p.offset, p.offset + p.limite - 1);
  const t = termo(p.busca ?? '');
  if (t) q = /^\d+$/.test(t) ? q.like('codigo', `${t}%`) : q.ilike('descricao', `%${t}%`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as NaturezaDespesa[], total: r.count ?? 0 };
}

/** Plataforma: natureza de 8 dígitos (desmembra categoria, grupo, modalidade e elemento); repetir corrige a descrição */
export async function cadastrarNatureza(enteId: string, codigo: string, descricao: string) {
  return falhou(await supabase.rpc('cadastrar_natureza', { p_ente: enteId, p_codigo: codigo, p_descricao: descricao })) as string;
}

export async function definirStatusNatureza(id: string, ativo: boolean) {
  falhou(await supabase.from('naturezas_despesa').update({ ativo }).eq('id', id).select('id').single());
}

/** Administrador: forma uma dotação do contrato escolhendo as classificações (o contrato pode ter várias) */
export async function adicionarDotacaoContrato(p: Record<string, string | number | null>) {
  return falhou(await supabase.rpc('adicionar_dotacao_contrato', { p })) as string;
}
