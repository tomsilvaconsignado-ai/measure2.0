// Monitoramento organizacional: estrutura, uso por módulo, servidores e histórico (só Master e plataforma).
import { supabase } from '@/lib/supabase';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export type TipoUnidade = 'ORGANIZACAO' | 'SECRETARIA' | 'DIRETORIA' | 'COORDENACAO' | 'GERENCIA' | 'DEPARTAMENTO' | 'SETOR' | 'UNIDADE';
export interface UnidadeMonitorada {
  id: string; pai_id: string | null; tipo: TipoUnidade; nome: string; sigla: string | null; ativo: boolean; nivel: number;
  /** subárvore (a unidade e tudo abaixo dela) */
  servidores: number; servidores_diretos: number; com_acesso: number; sem_cargo: number; sem_email: number; acesso_sem_cadastro: number;
  atividades_total: number; ultima_atividade: string | null;
  atividades_periodo: number; usuarios_periodo: number; ultima_no_periodo: string | null;
  modulos: Record<string, number>;
}
export interface Faixas { recente: number; moderada: number }
export interface Monitoramento {
  faixas: Faixas; gerado_em: string; sem_lotacao: { periodo: number; total: number }; unidades: UnidadeMonitorada[];
}
export interface EventoAtividade {
  id: number; criado_em: string; servidor: string; matricula: string | null; secretaria: string | null; diretoria: string | null;
  coordenacao: string | null; setor: string | null; modulo: string; tipo: string;
}
export interface UsoServidor {
  servidor_id: string; nome: string; matricula: string; cargo: string | null; lotacao: string | null; tem_acesso: boolean;
  atividades_periodo: number; atividades_total: number; ultima_atividade: string | null; modulos: string[];
}

export async function monitoramentoEstrutura(tenantId: string, de: string, ate: string) {
  return falhou(await supabase.rpc('monitoramento_estrutura', { p_tenant: tenantId, p_de: de, p_ate: ate })) as Monitoramento;
}

export async function monitoramentoHistorico(f: { tenantId: string; unidadeId: string | null; de: string; ate: string; busca: string; modulo: string | null; limite: number; offset: number }) {
  return falhou(await supabase.rpc('monitoramento_historico', {
    p_tenant: f.tenantId, p_unidade: f.unidadeId, p_de: f.de, p_ate: f.ate, p_busca: f.busca || null, p_modulo: f.modulo, p_limite: f.limite, p_offset: f.offset,
  })) as { total: number; itens: EventoAtividade[] };
}

export async function monitoramentoServidores(tenantId: string, unidadeId: string, de: string, ate: string) {
  const r = falhou(await supabase.rpc('monitoramento_servidores', { p_tenant: tenantId, p_unidade: unidadeId, p_de: de, p_ate: ate })) as UsoServidor[];
  return r.map((s) => ({ ...s, atividades_periodo: Number(s.atividades_periodo), atividades_total: Number(s.atividades_total) }));
}

/** Faixas de atividade (só a plataforma grava; o banco confere) */
export async function salvarFaixas(f: Faixas) {
  falhou(await supabase.from('configuracoes_globais').update({ valor: f }).eq('chave', 'monitoramento_faixas'));
}
