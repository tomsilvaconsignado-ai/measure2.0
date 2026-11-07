// Frequência mensal, consolidado de servidores, checklist da nota, cópia de segurança e registro de erros.
import { supabase } from '@/lib/supabase';
import { itensDeLinhas, type ItemChecklist } from '@/lib/checklist';
import type { DocumentoEmitido } from '@/lib/tipos';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export interface LinhaConsolidado {
  servidor_id: string; matricula: string; nome: string; cargo: string | null; funcao: string | null;
  unidade_sigla: string | null; unidade_nome: string; data_nomeacao: string | null; data_exoneracao: string | null;
  atrasos: number | null; faltas: number | null; justificativa_anexada: boolean; observacao_manual: string | null;
  observacao: string; pode_editar: boolean;
}

/** Busca em páginas: a API devolve no máximo 1.000 linhas por chamada */
export async function consolidadoMensal(tenantId: string, unidadeId: string, ano: number, mes: number) {
  const tudo: LinhaConsolidado[] = [];
  for (let de = 0; ; de += 1000) {
    const pagina = falhou(await supabase.rpc('consolidado_mensal', { p_tenant: tenantId, p_unidade: unidadeId, p_ano: ano, p_mes: mes }).range(de, de + 999)) as LinhaConsolidado[];
    tudo.push(...pagina);
    if (pagina.length < 1000) return tudo;
  }
}

/** Servidores do consolidado com férias no mês (a mesma regra entra no documento emitido) */
export interface FeriasDoMes { servidor_id: string; matricula: string; nome: string; gozo_inicio: string; gozo_fim: string; dias: number; dias_no_mes: number; situacao: string }

export async function feriasDoConsolidado(tenantId: string, unidadeId: string, ano: number, mes: number) {
  return falhou(await supabase.rpc('ferias_do_consolidado', { p_tenant: tenantId, p_unidade: unidadeId, p_ano: ano, p_mes: mes })) as FeriasDoMes[];
}

export interface Lancamento { servidor_id: string; atrasos: number | null; faltas: number | null; justificativa_anexada: boolean; observacao: string | null }

export async function salvarFrequencias(tenantId: string, ano: number, mes: number, linhas: Lancamento[]) {
  return falhou(await supabase.rpc('salvar_frequencias', { p_tenant: tenantId, p_ano: ano, p_mes: mes, p_linhas: linhas })) as number;
}

export async function emitirConsolidado(tenantId: string, unidadeId: string, ano: number, mes: number) {
  return falhou(await supabase.rpc('emitir_consolidado', { p_tenant: tenantId, p_unidade: unidadeId, p_ano: ano, p_mes: mes })) as string;
}

/** Consolidados já emitidos (histórico imutável), do mais recente para o mais antigo */
export async function listarConsolidados(tenantId: string, unidadeId: string | null) {
  let q = supabase.from('documentos_emitidos').select('id, titulo, referencia, emitido_em, unidade_id')
    .eq('tenant_id', tenantId).eq('tipo', 'CONSOLIDADO_MENSAL').order('referencia', { ascending: false }).order('emitido_em', { ascending: false }).limit(30);
  if (unidadeId) q = q.eq('unidade_id', unidadeId);
  return falhou(await q) as Array<Pick<DocumentoEmitido, 'id' | 'titulo' | 'emitido_em'> & { referencia: number }>;
}

export interface OpcoesChecklist { itens: ItemChecklist[]; funcionarios: string | null; nota_pendente: boolean; designacao_id: string | null }

export async function emitirChecklist(notaId: string, opcoes?: OpcoesChecklist) {
  if (!opcoes) return falhou(await supabase.rpc('emitir_checklist_nota', { p_nota: notaId })) as string;
  return falhou(await supabase.rpc('emitir_checklist_nota', { p_nota: notaId, p_opcoes: opcoes })) as string;
}

/** Itens do checklist: os configurados pelo órgão ou o modelo padrão (com a marcação inicial) */
export async function itensChecklist(tenantId: string) {
  const [cfg, padrao] = await Promise.all([
    supabase.from('tenant_configuracoes').select('textos').eq('tenant_id', tenantId).single(),
    supabase.rpc('checklist_itens_padrao'),
  ]);
  const proprios = (cfg.data?.textos as Record<string, unknown> | undefined)?.checklist_modelo_itens;
  const doOrgao = Array.isArray(proprios) ? itensDeLinhas(proprios as string[]) : [];
  return { itens: doOrgao.length ? doOrgao : (falhou(padrao) as ItemChecklist[]), personalizados: doOrgao.length > 0 };
}

export async function exportarBackup(tenantId: string) {
  return falhou(await supabase.rpc('exportar_backup_orgao', { p_tenant: tenantId })) as Record<string, unknown>;
}

export interface ErroAplicativo { id: number; ocorrido_em: string; user_id: string | null; tenant_id: string | null; mensagem: string; pilha: string | null; pagina: string | null; navegador: string | null; versao: string | null }

export async function listarErros(limite = 100) {
  return falhou(await supabase.from('erros_aplicativo').select('*').order('ocorrido_em', { ascending: false }).limit(limite)) as ErroAplicativo[];
}
