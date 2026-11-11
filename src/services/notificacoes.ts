// Central de notificações (contratos, CONECTA, Patrimônio e módulos futuros): gravadas pelo banco, lidas
// pela própria pessoa; preferências de PUSH, dispositivos e o painel administrativo.
import { supabase } from '@/lib/supabase';

export type ModuloNotificacao = 'CONTRATOS' | 'CONECTA' | 'PATRIMONIO' | (string & {});
export const MODULOS_NOTIFICACAO: Record<string, string> = { CONTRATOS: 'Contratos', CONECTA: 'CONECTA', PATRIMONIO: 'Patrimônio', OUTROS: 'Outros' };

export interface Mensagem {
  id: string;
  modulo: ModuloNotificacao;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  referencia_id?: string | null;
  categoria?: string | null;
  contrato?: string | null;
  criado_em: string;
  lida_em: string | null;
}

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export async function minhasMensagens(tenantId: string, modulo: ModuloNotificacao | null = null, limite = 30) {
  return falhou(await supabase.rpc('minhas_mensagens', { p_tenant: tenantId, p_modulo: modulo, p_limite: limite })) as { nao_lidas: number; itens: Mensagem[] };
}

/** Marca como lidas as indicadas, ou todas (do módulo) quando ids é nulo */
export async function marcarMensagensLidas(tenantId: string, ids: string[] | null, modulo: ModuloNotificacao | null = null) {
  falhou(await supabase.rpc('marcar_mensagens_lidas', { p_tenant: tenantId, p_ids: ids, p_modulo: modulo }));
}

export async function historicoNotificacoes(f: { tenantId: string; modulo: string | null; de: string | null; ate: string | null; naoLidas: boolean; limite: number; offset: number }) {
  return falhou(await supabase.rpc('minhas_notificacoes_historico', {
    p_tenant: f.tenantId, p_modulo: f.modulo, p_de: f.de, p_ate: f.ate, p_nao_lidas: f.naoLidas, p_limite: f.limite, p_offset: f.offset,
  })) as { total: number; nao_lidas: number; itens: Mensagem[] };
}

export interface PreferenciaNotificacao { categoria: string; modulo: string; nome: string; descricao: string; obrigatoria: boolean; ativa: boolean; push: boolean }
export async function minhasPreferencias(tenantId: string) {
  return falhou(await supabase.rpc('minhas_preferencias_notificacao', { p_tenant: tenantId })) as PreferenciaNotificacao[];
}
export async function salvarPreferencia(categoria: string, push: boolean) {
  falhou(await supabase.rpc('salvar_preferencia_notificacao', { p_categoria: categoria, p_push: push }));
}

export interface Dispositivo { id: string; dispositivo: string | null; criado_em: string; ultimo_envio: string | null; ativo: boolean; endpoint_final: string }
export async function meusDispositivos() {
  return falhou(await supabase.rpc('minhas_inscricoes_push')) as Dispositivo[];
}
export async function revogarDispositivo(id: string) {
  falhou(await supabase.rpc('revogar_inscricao_push', { p_id: id, p_endpoint: null }));
}

// ---------------------------------------------------------------- painel administrativo
export interface CategoriaConfig { codigo: string; modulo: string; nome: string; descricao: string; ativa: boolean; obrigatoria: boolean }
export interface PainelNotificacoes {
  geradas: number; eventos: number; lidas: number; push_enviados: number; push_pendentes: number; push_falhas: number; push_descartados: number;
  usuarios_com_push: number; dispositivos: number; por_modulo: Record<string, number>; por_tipo: Array<{ modulo: string; tipo: string; n: number }>;
  config: { push_vencimento_dias: number[]; lembrete_atesto_dias: number; categorias: CategoriaConfig[] }; push_configurado: boolean;
}
export interface ItemHistoricoAdmin {
  id: string; criado_em: string; modulo: string; tipo: string; titulo: string; lida_em: string | null; contrato_id: string | null; pessoa: string; contrato: string | null;
  push: { enviados: number; falhas: number; pendentes: number; erro: string | null };
}

export async function painelNotificacoes(tenantId: string, de: string, ate: string) {
  return falhou(await supabase.rpc('notificacoes_painel', { p_tenant: tenantId, p_de: de, p_ate: ate })) as PainelNotificacoes;
}
export async function historicoAdmin(f: { tenantId: string; de: string; ate: string; busca: string; contratoId: string | null; status: string | null; limite: number; offset: number }) {
  return falhou(await supabase.rpc('notificacoes_historico_admin', {
    p_tenant: f.tenantId, p_de: f.de, p_ate: f.ate, p_busca: f.busca || null, p_contrato: f.contratoId, p_status: f.status, p_limite: f.limite, p_offset: f.offset,
  })) as { total: number; itens: ItemHistoricoAdmin[] };
}
export async function reprocessarFalhas(tenantId: string, ids: string[] | null = null) {
  return falhou(await supabase.rpc('push_reprocessar', { p_tenant: tenantId, p_notificacoes: ids })) as number;
}
export async function salvarConfigNotificacoes(tenantId: string, categorias: CategoriaConfig[], vencimentoDias: number[], lembreteAtesto: number) {
  falhou(await supabase.rpc('salvar_config_notificacoes', {
    p_tenant: tenantId, p_categorias: categorias.map((c) => ({ codigo: c.codigo, ativa: c.ativa, obrigatoria: c.obrigatoria })),
    p_vencimento_dias: vencimentoDias, p_lembrete_atesto: lembreteAtesto,
  }));
}
