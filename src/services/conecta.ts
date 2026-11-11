// CONECTA – Comunicação Institucional. Toda escrita passa por funções do banco, que conferem quem pode
// publicar, ver, comentar e moderar; a tela só mostra o que o banco devolve.
import { supabase } from '@/lib/supabase';
import { cabecalhoJustificativa } from './api';
import { reduzirImagem } from './documentos';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export type TipoDestino = 'SECRETARIA' | 'DIRETORIA' | 'COORDENACAO' | 'SETOR' | 'UNIDADE_SAUDE' | 'PESSOA';
export type FiltroMural = 'TODAS' | 'MINHAS' | 'PARA_MIM' | 'MINHA_DIRETORIA' | 'MINHA_COORDENACAO';

export interface Lotacao { id: string; nome: string; sigla: string | null; tipo: string; secretaria: string | null; diretoria: string | null; coordenacao: string | null }
export interface CategoriaConecta { id: string; nome: string; codigo: string | null; icone: string; cor: string; ordem?: number; ativo?: boolean; total?: number }
export interface AnexoConecta { id: string; nome_arquivo: string; mime: string; tamanho: number; tipo: 'IMAGEM' | 'DOCUMENTO'; storage_path: string }

export interface Publicacao {
  id: string; titulo: string; texto: string; criado_em: string; editada_em: string | null;
  para_todos: boolean; fixada: boolean; fixada_ate: string | null; oculta: boolean; motivo_ocultacao: string | null; sou_autor: boolean;
  autor: { id: string; nome: string; avatar_path: string | null; cargo: string | null; lotacao: Lotacao | null };
  categoria: CategoriaConecta;
  destinatarios: Array<{ tipo: TipoDestino; rotulo: string }>;
  curtidas: number; eu_curti: boolean; comentarios: number; anexos: AnexoConecta[];
}

export interface Mural { total: number; pode_moderar: boolean; minha_diretoria: boolean; minha_coordenacao: boolean; itens: Publicacao[] }

export interface ParametrosMural {
  filtro?: FiltroMural; categoria_id?: string | null; busca?: string; autor?: string; unidade_id?: string | null;
  de?: string; ate?: string; id?: string; limite?: number; offset?: number;
}

export async function mural(tenantId: string, p: ParametrosMural) {
  return falhou(await supabase.rpc('conecta_feed', { p_tenant: tenantId, p })) as Mural;
}

export async function painelLateral(tenantId: string) {
  return falhou(await supabase.rpc('conecta_lateral', { p_tenant: tenantId })) as {
    destaques: Array<{ id: string; titulo: string; criado_em: string; fixada_ate: string | null }>;
    recentes: Array<{ id: string; titulo: string; criado_em: string }>;
    categorias: CategoriaConecta[];
  } | null;
}

export interface NovaPublicacao { categoria_id: string; titulo: string; texto: string; para_todos: boolean; unidades: string[]; pessoas: string[] }

export async function publicar(tenantId: string, dados: NovaPublicacao) {
  return falhou(await supabase.rpc('conecta_publicar', { p_tenant: tenantId, p: dados })) as string;
}

export async function editarPublicacao(id: string, dados: { titulo: string; texto: string; categoria_id: string }) {
  falhou(await supabase.rpc('conecta_editar_publicacao', { p_id: id, p: dados }));
}

export async function excluirPublicacao(id: string, motivo?: string) {
  falhou(await supabase.rpc('conecta_excluir_publicacao', { p_id: id, p_motivo: motivo ?? null }));
}

export async function moderarPublicacao(id: string, ocultar: boolean, motivo?: string) {
  falhou(await supabase.rpc('conecta_moderar_publicacao', { p_id: id, p_ocultar: ocultar, p_motivo: motivo ?? null }));
}

export async function fixarPublicacao(id: string, fixar: boolean, ate: string | null) {
  falhou(await supabase.rpc('conecta_fixar', { p_id: id, p_fixar: fixar, p_ate: ate }));
}

export async function curtir(id: string) {
  return falhou(await supabase.rpc('conecta_curtir', { p_pub: id })) as boolean;
}

export interface Comentario {
  id: string; pai_id: string | null; criado_em: string; editado_em: string | null; removido: boolean; oculto: boolean;
  texto: string | null; sou_autor: boolean;
  autor: { id: string; nome: string; avatar_path: string | null; lotacao: Lotacao | null };
}

export async function comentarios(publicacaoId: string) {
  return falhou(await supabase.rpc('conecta_comentarios_de', { p_pub: publicacaoId })) as Comentario[];
}

export async function comentar(publicacaoId: string, texto: string, paiId: string | null, mencoes: string[]) {
  return falhou(await supabase.rpc('conecta_comentar', { p_pub: publicacaoId, p_texto: texto, p_pai: paiId, p_mencoes: mencoes.length ? mencoes : null })) as string;
}

export async function editarComentario(id: string, texto: string) {
  falhou(await supabase.rpc('conecta_editar_comentario', { p_id: id, p_texto: texto }));
}

export async function excluirComentario(id: string, motivo?: string) {
  falhou(await supabase.rpc('conecta_excluir_comentario', { p_id: id, p_motivo: motivo ?? null }));
}

export async function denunciar(publicacaoId: string, motivo: string, comentarioId: string | null = null) {
  falhou(await supabase.rpc('conecta_denunciar', { p_pub: publicacaoId, p_motivo: motivo, p_comentario: comentarioId }));
}

export async function resolverDenuncia(id: string, procedente: boolean, resolucao: string) {
  falhou(await supabase.rpc('conecta_resolver_denuncia', { p_id: id, p_procedente: procedente, p_resolucao: resolucao }));
}

export async function buscarUnidadesDestino(tenantId: string, grupo: Exclude<TipoDestino, 'PESSOA'>, termo: string) {
  return falhou(await supabase.rpc('conecta_buscar_unidades', { p_tenant: tenantId, p_grupo: grupo, p_termo: termo || null })) as
    Array<{ id: string; nome: string; sigla: string | null; tipo: string; detalhe: string | null }>;
}

export interface PessoaDestino { user_id: string; nome: string; cargo: string | null; avatar_path: string | null; lotacao: Lotacao | null }

export async function buscarPessoas(tenantId: string, termo: string) {
  if (termo.trim().length < 2) return [];
  return falhou(await supabase.rpc('conecta_buscar_pessoas', { p_tenant: tenantId, p_termo: termo })) as PessoaDestino[];
}

// ---------------------------------------------------------------- anexos

/** Tipos aceitos: imagens e PDF; documentos de escritório só os autorizados pela administração */
export const TIPOS_CONECTA: Record<string, { rotulo: string; extensoes: string[] }> = {
  'image/jpeg': { rotulo: 'JPG', extensoes: ['jpg', 'jpeg'] },
  'image/png': { rotulo: 'PNG', extensoes: ['png'] },
  'image/webp': { rotulo: 'WEBP', extensoes: ['webp'] },
  'application/pdf': { rotulo: 'PDF', extensoes: ['pdf'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { rotulo: 'Word (DOCX)', extensoes: ['docx'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { rotulo: 'Excel (XLSX)', extensoes: ['xlsx'] },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { rotulo: 'PowerPoint (PPTX)', extensoes: ['pptx'] },
  'application/vnd.oasis.opendocument.text': { rotulo: 'Texto (ODT)', extensoes: ['odt'] },
  'application/vnd.oasis.opendocument.spreadsheet': { rotulo: 'Planilha (ODS)', extensoes: ['ods'] },
};

export async function tiposAceitos(tenantId: string) {
  return falhou(await supabase.rpc('conecta_tipos_aceitos', { p_tenant: tenantId })) as string[];
}

/** Envia um arquivo da publicação: o banco valida tipo, tamanho e autoria e define o caminho */
export async function anexar(publicacaoId: string, arquivo: File, aceitos: string[]) {
  let f = arquivo;
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  const tipo = TIPOS_CONECTA[f.type];
  if (!tipo || !aceitos.includes(f.type)) throw { erro: `"${f.name}": tipo de arquivo não autorizado.`, campo: 'arquivo' };
  if (!tipo.extensoes.includes(ext)) throw { erro: `"${f.name}": a extensão não corresponde ao tipo do arquivo.`, campo: 'arquivo' };
  if (f.type === 'application/pdf') {
    const cab = new Uint8Array(await f.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...cab) !== '%PDF-') throw { erro: `"${f.name}" não é um PDF válido.`, campo: 'arquivo' };
  }
  // fotos grandes são reduzidas (economiza espaço e abre rápido no celular)
  if (f.type.startsWith('image/') && f.type !== 'image/webp' && f.size > 400 * 1024) f = await reduzirImagem(f, 1920);
  const r = falhou(await supabase.rpc('conecta_registrar_anexo', { p_pub: publicacaoId, p_nome: f.name, p_mime: f.type, p_tamanho: f.size })) as { id: string; storage_path: string };
  const envio = await supabase.storage.from('arquivos').upload(r.storage_path, f, { contentType: f.type, upsert: false });
  if (envio.error) {
    await supabase.rpc('conecta_remover_anexo', { p_id: r.id });
    throw { erro: `Não foi possível enviar "${f.name}": ${envio.error.message}` };
  }
  return r.id;
}

export async function removerAnexo(id: string) {
  falhou(await supabase.rpc('conecta_remover_anexo', { p_id: id }));
}

export async function urlAnexo(a: Pick<AnexoConecta, 'storage_path' | 'nome_arquivo'>, baixar = false) {
  const { data, error } = await supabase.storage.from('arquivos').createSignedUrl(a.storage_path, 600, baixar ? { download: a.nome_arquivo } : undefined);
  if (error || !data) throw error ?? { erro: 'Arquivo indisponível.' };
  return data.signedUrl;
}

// ---------------------------------------------------------------- administração

export interface PainelAdminConecta {
  publicacoes: number; publicacoes_30d: number; comentarios: number; curtidas: number; autores: number; ocultas: number;
  por_categoria: Array<{ nome: string; total: number }>; mais_ativos: Array<{ nome: string; total: number }>;
  denuncias: Array<{ id: string; motivo: string; criado_em: string; situacao: 'ABERTA' | 'PROCEDENTE' | 'IMPROCEDENTE'; resolucao: string | null;
    publicacao_id: string; titulo: string; comentario: string | null; denunciante: string }>;
  ocultas_lista: Array<{ id: string; titulo: string; motivo: string | null; oculta_em: string; autor: string }>;
}

export async function painelAdmin(tenantId: string) {
  return falhou(await supabase.rpc('conecta_admin', { p_tenant: tenantId })) as PainelAdminConecta;
}

export async function listarCategorias(tenantId: string) {
  return falhou(await supabase.from('conecta_categorias').select('*').eq('tenant_id', tenantId).order('ordem').order('nome')) as CategoriaConecta[];
}

export async function salvarCategoria(tenantId: string, id: string | null, dados: { nome: string; icone: string; cor: string; ordem: number }) {
  if (id) falhou(await supabase.from('conecta_categorias').update(dados).eq('id', id));
  else falhou(await supabase.from('conecta_categorias').insert({ tenant_id: tenantId, ...dados }));
}

export async function definirStatusCategoria(id: string, ativo: boolean, motivo: string) {

  falhou(await supabase.from('conecta_categorias').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}
