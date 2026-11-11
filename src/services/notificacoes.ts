// Central de notificações internas (CONECTA e Patrimônio): gravadas pelo banco, lidas pela própria pessoa.
import { supabase } from '@/lib/supabase';

export type ModuloNotificacao = 'CONECTA' | 'PATRIMONIO';

export interface Mensagem {
  id: string;
  modulo: ModuloNotificacao;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  referencia_id: string | null;
  criado_em: string;
  lida_em: string | null;
}

export async function minhasMensagens(tenantId: string, modulo: ModuloNotificacao | null = null, limite = 30) {
  const { data, error } = await supabase.rpc('minhas_mensagens', { p_tenant: tenantId, p_modulo: modulo, p_limite: limite });
  if (error) throw error;
  return data as { nao_lidas: number; itens: Mensagem[] };
}

/** Marca como lidas as indicadas, ou todas (do módulo) quando ids é nulo */
export async function marcarMensagensLidas(tenantId: string, ids: string[] | null, modulo: ModuloNotificacao | null = null) {
  const { error } = await supabase.rpc('marcar_mensagens_lidas', { p_tenant: tenantId, p_ids: ids, p_modulo: modulo });
  if (error) throw error;
}
