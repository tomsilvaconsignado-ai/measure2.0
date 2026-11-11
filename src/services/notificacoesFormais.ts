// Notificações formais às empresas contratadas: rascunho, emissão, tramitação, respostas, sanções,
// histórico do fornecedor e catálogos. Toda regra e permissão é conferida no banco.
import { supabase } from '@/lib/supabase';
import type { Fundamento, Gravidade, Modelo, Regime, StatusNotificacao } from '@/lib/notificacaoFormal';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export interface TipoOcorrencia { id: string; tenant_id: string | null; grupo: string; nome: string; descricao: string | null; fundamentos: string[]; prazo_padrao_dias: number | null; ativo: boolean }
export interface Catalogos { tipos: TipoOcorrencia[]; fundamentos: Array<Fundamento & { id: string; tenant_id: string | null; vigencia_inicio: string | null; vigencia_fim: string | null; ativo: boolean }>;
  modelos: Array<Modelo & { id: string; tenant_id: string | null; nome: string }>; pode_configurar: boolean }

export interface ContextoContrato {
  orgao: { nome_oficial: string; cabecalho: string[] | null; logo_path: string | null };
  estrutura: { secretaria: string | null; diretoria: string | null; coordenacao: string | null; setor: string | null; descricao: string | null } | null;
  unidade: { nome: string; sigla: string | null };
  contrato: { id: string; numero: string; processo_administrativo: string | null; numero_licitacao: string | null; modalidade: string; modalidade_codigo: string; objeto: string;
    data_assinatura: string | null; data_inicio: string; data_fim: string; valor_global: string; valor_atual: string; regime_juridico: Regime | null };
  fornecedor: { id: string; razao_social: string; nome_fantasia: string | null; documento: string; tipo_pessoa: 'PJ' | 'PF'; endereco: string; representante: string | null; email: string | null; telefone: string | null };
  responsaveis: Array<{ papel: string; nome: string; matricula: string; cargo: string | null }>;
  emissor: { nome: string; matricula: string | null; cargo: string | null; papel: string; lotacao: string | null };
  recorrencia: { total: number; neste_contrato: number; sancoes_vigentes: number };
}

export interface Tramite { id: number; tipo: string; status_anterior: string | null; status_novo: string | null; dados: Record<string, unknown>; justificativa: string | null; autor_nome: string | null; criado_em: string }
export interface Resposta { id: string; data_resposta: string; recebida_por: string | null; justificativa: string; providencias_adotadas: string | null; analise: string | null; analise_justificativa: string | null; analisado_em: string | null; criado_em: string }
export interface Sancao { id: string; fornecedor_id: string; contrato_id: string | null; notificacao_id: string | null; tipo: string; processo: string; autoridade: string; fundamento: string; decisao: string;
  data_decisao: string; vigencia_inicio: string | null; vigencia_fim: string | null; valor: string | null; situacao: string; situacao_justificativa: string | null; contrato_numero?: string | null }

export interface Notificacao {
  id: string; tenant_id: string; contrato_id: string; fornecedor_id: string; unidade_id: string; numero: number | null; ano: number | null; versao: number; versao_de: string | null;
  status: StatusNotificacao; regime_juridico: Regime; regime_confirmado: boolean; tipo_id: string | null; gravidade: Gravidade; data_ocorrencia: string | null; local_ocorrencia: string | null;
  unidade_atendida_id: string | null; fatos: string; obrigacoes: string; clausula: string | null; fundamentos: string[]; fundamentacao: string; providencias: string;
  prazo_dias: number | null; prazo_tipo: 'CORRIDOS' | 'UTEIS'; prazo_resposta_dias: number | null; prazo_texto: string; consequencias: string; manifestacao: string; observacoes: string | null;
  revisao_juridica: boolean; revisao_confirmada: boolean; emissor_papel: string | null; documento_emitido_id: string | null; emitida_em: string | null;
  data_ciencia: string | null; data_limite: string | null; data_limite_resposta: string | null; cancelada_motivo: string | null; criado_em: string;
  rotulo: string; contrato_numero: string; fornecedor_nome: string; fornecedor_documento: string; tipo_nome: string | null; emissor_nome: string | null;
  pode_atuar: boolean; pode_editar: boolean; pode_sancionar: boolean; versao_nova: string | null; tramites: Tramite[]; respostas: Resposta[]; sancoes: Sancao[]; recorrencia: number;
}

export interface ItemPainel {
  id: string; rotulo: string; numero: number | null; ano: number | null; versao: number; status: StatusNotificacao; contrato_id: string; contrato_numero: string; fornecedor_id: string; fornecedor_nome: string;
  cnpj: string; tipo: string | null; tipo_grupo: string | null; gravidade: Gravidade; emitida_em: string | null; criado_em: string; data_ocorrencia: string | null; emissor: string | null; emissor_papel: string | null;
  data_limite: string | null; respostas: number; secretaria: string | null; diretoria: string | null; coordenacao: string | null;
}
export interface Painel {
  indicadores: { emitidas: number; rascunhos: number; aguardando_resposta: number; prazo_vencido: number; regularizadas: number; nao_regularizadas: number;
    recorrentes: Array<{ fornecedor_id: string; fornecedor_nome: string; cnpj: string; n: number }>; por_contrato: Array<{ contrato_id: string; contrato_numero: string; n: number }> };
  total: number; itens: ItemPainel[];
}
export interface FiltroPainel {
  busca?: string; fornecedor_id?: string; contrato_id?: string; unidade_id?: string; tipo_id?: string; status?: string; emissor_papel?: string; responsavel?: string;
  de?: string; ate?: string; incluir_rascunhos?: boolean; limite?: number; offset?: number;
}

export const catalogos = async (tenantId: string) => falhou(await supabase.rpc('nf_catalogos', { p_tenant: tenantId })) as Catalogos;
export const contexto = async (contratoId: string) => falhou(await supabase.rpc('nf_contexto', { p_contrato: contratoId })) as ContextoContrato;
export const contratosDisponiveis = async (tenantId: string, busca: string) =>
  falhou(await supabase.rpc('nf_contratos_disponiveis', { p_tenant: tenantId, p_busca: busca || null })) as Array<{ id: string; numero: string; fornecedor: string; objeto: string; papel: string }>;
export const salvar = async (dados: Record<string, unknown>) => falhou(await supabase.rpc('nf_salvar', { p: dados })) as string;
export const excluirRascunho = async (id: string) => { falhou(await supabase.rpc('nf_excluir_rascunho', { p_id: id })); };
export const emitir = async (id: string) => falhou(await supabase.rpc('nf_emitir', { p_id: id })) as string;
export const retificar = async (id: string, justificativa: string) => falhou(await supabase.rpc('nf_retificar', { p_id: id, p_justificativa: justificativa })) as string;
export const tramitar = async (id: string, acao: string, dados: Record<string, unknown>, justificativa: string | null) =>
  falhou(await supabase.rpc('nf_tramitar', { p_id: id, p_acao: acao, p_dados: dados, p_justificativa: justificativa })) as StatusNotificacao;
export const registrarResposta = async (id: string, dados: Record<string, unknown>) => falhou(await supabase.rpc('nf_registrar_resposta', { p_id: id, p: dados })) as string;
export const registrarSancao = async (dados: Record<string, unknown>) => falhou(await supabase.rpc('nf_registrar_sancao', { p: dados })) as string;
export const situacaoSancao = async (id: string, situacao: string, justificativa: string) =>
  { falhou(await supabase.rpc('nf_situacao_sancao', { p_id: id, p_situacao: situacao, p_justificativa: justificativa })); };
export const obter = async (id: string) => falhou(await supabase.rpc('nf_obter', { p_id: id })) as Notificacao;
export const painel = async (tenantId: string, f: FiltroPainel) => falhou(await supabase.rpc('nf_painel', { p_tenant: tenantId, f })) as Painel;
export const historicoFornecedor = async (fornecedorId: string) => falhou(await supabase.rpc('fornecedor_historico_ocorrencias', { p_fornecedor: fornecedorId })) as {
  itens: Array<{ id: string; rotulo: string; status: StatusNotificacao; contrato_numero: string; objeto: string; orgao: string; data_ocorrencia: string | null; emitida_em: string | null;
    resumo: string; tipo: string | null; emissor: string | null; emissor_papel: string | null; prazo_dias: number | null; prazo_tipo: string; data_limite: string | null;
    respostas: number; analise: string | null; encaminhada: boolean }>;
  fora_do_acesso: number; sancoes: Sancao[]; pode_sancionar: boolean;
};
export const salvarCatalogo = async (tenantId: string, tabela: 'tipos' | 'fundamentos' | 'modelos', dados: Record<string, unknown>) =>
  falhou(await supabase.rpc('nf_catalogo_salvar', { p_tenant: tenantId, p_tabela: tabela, p: dados })) as string;
