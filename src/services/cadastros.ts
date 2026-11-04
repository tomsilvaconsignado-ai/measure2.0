// Acesso a dados dos cadastros da Fase 2 (fornecedores, servidores, unidades atendidas,
// classificação orçamentária e tipos de serviço).
import { supabase } from '@/lib/supabase';
import type {
  Aniversariante, Classificador, ClassificadorTipo, ClassificacaoOrcamentaria, ContaBancaria, DadosPessoais, Fornecedor,
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

export async function tiposClassificador() {
  return falhou(await supabase.from('classificador_tipos').select('*').order('ordem')) as ClassificadorTipo[];
}

export async function listarClassificadores(p: { tenantId: string; tipo?: TipoClassificador; busca?: string; paiId?: string | null; somenteAtivos?: boolean; limite?: number; offset?: number }) {
  let q = supabase.from('classificadores').select('*', { count: 'exact' }).eq('tenant_id', p.tenantId).order('codigo');
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

export async function obterClassificadores(ids: string[]) {
  if (!ids.length) return [];
  return falhou(await supabase.from('classificadores').select('*').in('id', ids)) as Classificador[];
}

export async function salvarClassificador(id: string | null, dados: Partial<Classificador>) {
  if (id) {
    const { tenant_id: _t, tipo: _tp, ...resto } = dados;
    return falhou(await supabase.from('classificadores').update(resto).eq('id', id).select().single()) as Classificador;
  }
  return falhou(await supabase.from('classificadores').insert(dados).select().single()) as Classificador;
}

export async function definirStatusClassificador(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('classificadores').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function listarClassificacoes(p: { tenantId: string; busca?: string; situacao: 'ATIVOS' | 'INATIVOS' | 'TODOS'; limite: number; offset: number }) {
  let q = supabase.from('classificacoes_orcamentarias').select('*', { count: 'exact' }).eq('tenant_id', p.tenantId)
    .order('codigo_completo').range(p.offset, p.offset + p.limite - 1);
  if (p.situacao !== 'TODOS') q = q.eq('ativo', p.situacao === 'ATIVOS');
  const t = termo(p.busca ?? '').toLowerCase();
  if (t) q = q.ilike('busca', `%${t}%`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as ClassificacaoOrcamentaria[], total: r.count ?? 0 };
}

export async function salvarClassificacao(id: string | null, dados: Partial<ClassificacaoOrcamentaria>) {
  if (id) {
    const { tenant_id: _t, ...resto } = dados;
    return falhou(await supabase.from('classificacoes_orcamentarias').update(resto).eq('id', id).select().single()) as ClassificacaoOrcamentaria;
  }
  return falhou(await supabase.from('classificacoes_orcamentarias').insert(dados).select().single()) as ClassificacaoOrcamentaria;
}

export async function definirStatusClassificacao(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('classificacoes_orcamentarias').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
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
