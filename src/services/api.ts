// Acesso a dados do MEASURE. As páginas não chamam o Supabase direto: tudo passa por aqui.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, urlDoApp } from '@/lib/supabase';
import type {
  AcaoInfo, Papel, PapelInfo, RecursoInfo, RegistroAuditoria, Tenant, TenantConfiguracoes, TipoUnidade,
  UnidadeOrganizacional, UsuarioListado,
} from '@/lib/tipos';

/** Motivo da operação em base64 (UTF-8), lido pelo gatilho de auditoria no banco */
export function cabecalhoJustificativa(motivo: string) {
  const bytes = new TextEncoder().encode(motivo);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

// ---------------------------------------------------------------- arquivos

const urlsAssinadas = new Map<string, { url: string; expira: number }>();

/** URL temporária (1 h) para arquivos privados; reaproveitada enquanto válida */
export async function urlArquivo(bucket: 'arquivos' | 'avatares', caminho: string | null | undefined): Promise<string | null> {
  if (!caminho) return null;
  const chave = `${bucket}/${caminho}`;
  const cache = urlsAssinadas.get(chave);
  if (cache && cache.expira > Date.now()) return cache.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, 3600);
  if (error || !data) return null;
  urlsAssinadas.set(chave, { url: data.signedUrl, expira: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

const EXTENSOES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function validarImagem(arquivo: File, maxMb: number) {
  if (!EXTENSOES[arquivo.type]) throw { erro: 'Envie uma imagem PNG, JPG ou WEBP.', campo: 'arquivo' };
  if (arquivo.size > maxMb * 1024 * 1024) throw { erro: `A imagem deve ter no máximo ${maxMb} MB.`, campo: 'arquivo' };
}

/** Brasão/logomarca do órgão: novo arquivo a cada troca (o anterior fica no histórico do storage) */
export async function enviarLogoOrgao(tenantId: string, arquivo: File) {
  validarImagem(arquivo, 5);
  const caminho = `${tenantId}/identidade/logo-${Date.now()}.${EXTENSOES[arquivo.type]}`;
  falhou(await supabase.storage.from('arquivos').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false }));
  falhou(await supabase.from('tenants').update({ logo_path: caminho }).eq('id', tenantId));
  return caminho;
}

export async function enviarMinhaFoto(userId: string, arquivo: File) {
  validarImagem(arquivo, 2);
  const caminho = `${userId}/foto-${Date.now()}.${EXTENSOES[arquivo.type]}`;
  falhou(await supabase.storage.from('avatares').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false }));
  falhou(await supabase.from('perfis').update({ avatar_path: caminho }).eq('id', userId));
  return caminho;
}

// ---------------------------------------------------------------- órgãos

export async function listarOrgaos(busca = '') {
  let q = supabase.from('tenants').select('*').order('nome_curto');
  const termo = busca.trim();
  if (termo) q = q.or(`nome_curto.ilike.%${termo.replace(/[%,()]/g, ' ')}%,nome_oficial.ilike.%${termo.replace(/[%,()]/g, ' ')}%`);
  return falhou(await q) as Tenant[];
}

export async function obterOrgao(id: string) {
  return falhou(await supabase.from('tenants').select('*').eq('id', id).single()) as Tenant;
}

export type DadosOrgao = Pick<Tenant, 'nome_oficial' | 'nome_curto' | 'cnpj' | 'endereco' | 'cep' | 'cidade' | 'uf' | 'telefone' | 'email_contato' | 'site' | 'dominios_email'>;

export async function salvarOrgao(id: string | null, dados: Partial<DadosOrgao>) {
  if (id) return falhou(await supabase.from('tenants').update(dados).eq('id', id).select().single()) as Tenant;
  return falhou(await supabase.from('tenants').insert(dados).select().single()) as Tenant;
}

export async function definirStatusOrgao(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('tenants').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

export async function obterConfiguracoes(tenantId: string) {
  return falhou(await supabase.from('tenant_configuracoes').select('*').eq('tenant_id', tenantId).single()) as TenantConfiguracoes;
}

export async function salvarConfiguracoes(tenantId: string, dados: Partial<TenantConfiguracoes>) {
  falhou(await supabase.from('tenant_configuracoes').update(dados).eq('tenant_id', tenantId));
}

export async function iniciarSuporte(tenantId: string, motivo: string, minutos: number) {
  return falhou(await supabase.rpc('iniciar_suporte', { p_tenant: tenantId, p_justificativa: motivo, p_minutos: minutos })) as string;
}

export async function encerrarSuporte(id: string) {
  falhou(await supabase.rpc('encerrar_suporte', { p_id: id }));
}

// ---------------------------------------------------------------- estrutura

export async function listarUnidades(tenantId: string) {
  return falhou(await supabase.from('unidades_organizacionais').select('*').eq('tenant_id', tenantId)
    .order('nome')) as UnidadeOrganizacional[];
}

export async function buscarUnidades(tenantId: string, termo: string, somenteAtivas = true) {
  let q = supabase.from('unidades_organizacionais').select('id, nome, sigla, tipo, ativo')
    .eq('tenant_id', tenantId).order('nome').limit(30);
  if (somenteAtivas) q = q.eq('ativo', true);
  const t = termo.replace(/[%,()]/g, ' ').trim();
  if (t) q = q.or(`nome.ilike.%${t}%,sigla.ilike.%${t}%`);
  return falhou(await q) as Array<Pick<UnidadeOrganizacional, 'id' | 'nome' | 'sigla' | 'tipo' | 'ativo'>>;
}

export interface DadosUnidade {
  tenant_id: string; pai_id: string | null; tipo: TipoUnidade; nome: string; sigla: string | null;
  descricao: string | null; endereco: string | null; telefone: string | null; email: string | null;
}

export async function salvarUnidade(id: string | null, dados: Partial<DadosUnidade>) {
  if (id) {
    const { tenant_id: _ignorado, ...resto } = dados;
    return falhou(await supabase.from('unidades_organizacionais').update(resto).eq('id', id).select().single()) as UnidadeOrganizacional;
  }
  return falhou(await supabase.from('unidades_organizacionais').insert(dados).select().single()) as UnidadeOrganizacional;
}

export async function definirStatusUnidade(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('unidades_organizacionais').update({ ativo }).eq('id', id)
    .setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

// ---------------------------------------------------------------- usuários

export async function listarUsuarios(params: {
  tenantId: string | null; busca?: string; papel?: Papel | null; unidadeId?: string | null;
  situacao?: 'ATIVOS' | 'INATIVOS' | 'TODOS'; limite: number; offset: number;
}) {
  return falhou(await supabase.rpc('listar_usuarios', {
    p_tenant: params.tenantId, p_busca: params.busca || null, p_papel: params.papel || null,
    p_unidade: params.unidadeId || null, p_situacao: params.situacao ?? 'ATIVOS',
    p_limite: params.limite, p_offset: params.offset,
  })) as { total: number; itens: UsuarioListado[] };
}

async function chamarFuncaoUsuarios(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('usuarios', { body: { ...corpo, redirect_to: urlDoApp() } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const resposta = await error.context.json().catch(() => null);
      if (resposta?.erro) throw resposta;
    }
    throw error;
  }
  return data;
}

export async function convidarUsuario(dados: { email: string; nome: string; tenant_id: string; unidade_id: string | null; papel: Papel }) {
  return chamarFuncaoUsuarios({ acao: 'convidar', ...dados }) as Promise<{ vinculo_id: string; conta_criada: boolean; email_enviado: boolean }>;
}

export async function reenviarAcesso(userId: string) {
  return chamarFuncaoUsuarios({ acao: 'reenviar', user_id: userId }) as Promise<{ email_enviado: boolean; tipo: 'ativacao' | 'nova_senha' }>;
}

export async function definirStatusVinculo(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.rpc('definir_status_vinculo', { p_id: id, p_ativo: ativo, p_justificativa: motivo || null }));
}

export async function definirStatusUsuario(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.rpc('definir_status_usuario', { p_user: id, p_ativo: ativo, p_justificativa: motivo || null }));
}

export async function definirAdminPlataforma(id: string, valor: boolean, motivo: string) {
  falhou(await supabase.rpc('definir_admin_plataforma', { p_user: id, p_valor: valor, p_justificativa: motivo }));
}

export async function definirVinculoPadrao(id: string) {
  falhou(await supabase.rpc('definir_vinculo_padrao', { p_id: id }));
}

export async function atualizarMeuPerfil(id: string, dados: { nome?: string; telefone?: string | null }) {
  falhou(await supabase.from('perfis').update(dados).eq('id', id));
}

// ---------------------------------------------------------------- permissões

export async function catalogoPermissoes() {
  const [papeis, recursos, acoes, matriz, concede] = await Promise.all([
    supabase.from('papeis').select('*').order('ordem'),
    supabase.from('recursos').select('*').order('ordem'),
    supabase.from('acoes').select('*').order('ordem'),
    supabase.from('permissoes_papel').select('*'),
    supabase.from('papel_concede').select('*'),
  ]);
  return {
    papeis: falhou(papeis) as PapelInfo[],
    recursos: falhou(recursos) as RecursoInfo[],
    acoes: falhou(acoes) as AcaoInfo[],
    matriz: falhou(matriz) as Array<{ papel: Papel; recurso: string; acao: string }>,
    concede: falhou(concede) as Array<{ concedente: Papel; concedido: Papel }>,
  };
}

export async function alternarPermissao(papel: Papel, recurso: string, acao: string, ligar: boolean) {
  if (ligar) falhou(await supabase.from('permissoes_papel').insert({ papel, recurso, acao }));
  else falhou(await supabase.from('permissoes_papel').delete().match({ papel, recurso, acao }));
}

// ---------------------------------------------------------------- auditoria

export async function listarAuditoria(params: {
  tenantId: string | null; entidade?: string; acao?: string; usuario?: string; de?: string; ate?: string;
  limite: number; offset: number;
}) {
  let q = supabase.from('auditoria').select('*', { count: 'exact' }).order('id', { ascending: false })
    .range(params.offset, params.offset + params.limite - 1);
  if (params.tenantId) q = q.eq('tenant_id', params.tenantId);
  if (params.entidade) q = q.eq('entidade', params.entidade);
  if (params.acao) q = q.eq('acao', params.acao);
  if (params.usuario) q = q.ilike('usuario_email', `%${params.usuario.replace(/[%_]/g, '')}%`);
  if (params.de) q = q.gte('criado_em', `${params.de}T00:00:00-03:00`);
  if (params.ate) q = q.lte('criado_em', `${params.ate}T23:59:59.999-03:00`);
  const r = await q;
  if (r.error) throw r.error;
  return { itens: (r.data ?? []) as RegistroAuditoria[], total: r.count ?? 0 };
}

// ---------------------------------------------------------------- painel

export async function resumoOrgao(tenantId: string) {
  const [unidades, vinculos, eventos] = await Promise.all([
    supabase.from('unidades_organizacionais').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('ativo', true),
    supabase.from('vinculos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('ativo', true),
    supabase.from('auditoria').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      .gte('criado_em', new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);
  return {
    unidades: unidades.count ?? 0,
    vinculos: vinculos.count ?? 0,
    // sem permissão de auditoria o RLS devolve 0 — o painel só mostra o card a quem pode
    eventos7dias: eventos.count ?? 0,
  };
}
