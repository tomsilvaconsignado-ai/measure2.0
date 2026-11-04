// Arquivos de negócio: a linha em `documentos` vem primeiro (o banco autoriza e define o caminho),
// depois o envio do arquivo para esse caminho no storage privado.
import { supabase } from '@/lib/supabase';
import type { Recurso } from '@/lib/tipos';

export interface Documento {
  id: string;
  tenant_id: string;
  unidade_id: string | null;
  recurso: Recurso;
  registro_id: string | null;
  categoria: string;
  nome_arquivo: string;
  mime: string;
  tamanho: number;
  storage_path: string;
  enviado_por: string;
  enviado_em: string;
  perfil?: { nome: string; email: string } | null;
}

export const TIPOS_ACEITOS: Record<string, string> = {
  'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP',
};

export async function listarDocumentos(tenantId: string, recurso: Recurso, registroId: string, categoria?: string) {
  let q = supabase.from('documentos').select('*').eq('tenant_id', tenantId).eq('recurso', recurso)
    .eq('registro_id', registroId).is('excluido_em', null).order('enviado_em', { ascending: false });
  if (categoria) q = q.eq('categoria', categoria);
  const { data, error } = await q;
  if (error) throw error;
  return data as Documento[];
}

export async function enviarDocumento(p: {
  tenantId: string; unidadeId: string | null; recurso: Recurso; registroId: string; categoria: string; arquivo: File | Blob; nome: string;
}): Promise<Documento> {
  const mime = p.arquivo.type;
  if (!TIPOS_ACEITOS[mime]) throw { erro: 'Tipo de arquivo não aceito. Envie PDF, JPG, PNG ou WEBP.', campo: 'arquivo' };
  // A extensão precisa bater com o tipo (evita "nota.pdf.exe" e afins)
  const ext = p.nome.toLowerCase().split('.').pop() ?? '';
  const esperado: Record<string, string[]> = { 'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
  if (!esperado[mime]!.includes(ext)) throw { erro: `A extensão ".${ext}" não corresponde a um arquivo ${TIPOS_ACEITOS[mime]}.`, campo: 'arquivo' };
  if (mime === 'application/pdf') {
    const cabecalho = new Uint8Array(await p.arquivo.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...cabecalho) !== '%PDF-') throw { erro: 'O arquivo não é um PDF válido.', campo: 'arquivo' };
  }
  const { data, error } = await supabase.from('documentos').insert({
    tenant_id: p.tenantId, unidade_id: p.unidadeId, recurso: p.recurso, registro_id: p.registroId,
    categoria: p.categoria, nome_arquivo: p.nome.slice(0, 255), mime, tamanho: p.arquivo.size,
  }).select().single();
  if (error) throw error;
  const doc = data as Documento;
  const envio = await supabase.storage.from('arquivos').upload(doc.storage_path, p.arquivo, { contentType: mime, upsert: false });
  if (envio.error) {
    // sem o arquivo, a linha não tem sentido: marca como excluída para não aparecer
    await supabase.rpc('excluir_documento', { p_id: doc.id, p_motivo: 'Falha no envio do arquivo' });
    throw { erro: `Não foi possível enviar o arquivo: ${envio.error.message}` };
  }
  return doc;
}

export async function abrirDocumento(doc: Pick<Documento, 'id' | 'storage_path' | 'nome_arquivo'>, baixar = false) {
  await supabase.rpc('registrar_acesso_documento', { p_id: doc.id, p_acao: baixar ? 'DOWNLOAD' : 'VISUALIZACAO' });
  const { data, error } = await supabase.storage.from('arquivos').createSignedUrl(doc.storage_path, 300, baixar ? { download: doc.nome_arquivo } : undefined);
  if (error || !data) throw error ?? { erro: 'Arquivo indisponível.' };
  window.open(data.signedUrl, '_blank', 'noopener');
}

export async function excluirDocumento(id: string, motivo: string) {
  const { error } = await supabase.rpc('excluir_documento', { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

/** Reduz fotos/logos para no máximo `lado` px (JPEG/PNG), economizando espaço e banda */
export async function reduzirImagem(arquivo: File, lado = 512): Promise<File> {
  if (!arquivo.type.startsWith('image/')) return arquivo;
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const tipo = arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), tipo, 0.85));
  const nome = arquivo.name.replace(/\.[^.]+$/, '') + (tipo === 'image/png' ? '.png' : '.jpg');
  return new File([blob], nome, { type: tipo });
}
