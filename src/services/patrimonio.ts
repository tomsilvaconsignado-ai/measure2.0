// Gestão patrimonial. Localização, responsável e situação mudam só por movimentação (função do banco);
// a tela edita direto apenas os dados descritivos e a avaliação do bem.
import { supabase } from '@/lib/supabase';
import { cabecalhoJustificativa } from './api';
import type { Lotacao } from './conecta';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export const CONSERVACAO: Record<string, string> = {
  NOVO: 'Novo', EXCELENTE: 'Excelente', BOM: 'Bom', REGULAR: 'Regular', RUIM: 'Ruim', PESSIMO: 'Péssimo', DANIFICADO: 'Danificado',
  NECESSITA_MANUTENCAO: 'Necessita manutenção', EM_MANUTENCAO: 'Em manutenção', IRRECUPERAVEL: 'Irrecuperável',
};
export const SITUACAO: Record<string, string> = {
  EM_USO: 'Em uso', EM_ESTOQUE: 'Em estoque', DISPONIVEL: 'Disponível', EM_MANUTENCAO: 'Em manutenção', AGUARDANDO_AVALIACAO: 'Aguardando avaliação',
  EMPRESTADO: 'Emprestado', EM_TRANSFERENCIA: 'Em processo de transferência', SUBSTITUIDO: 'Substituído', BAIXADO: 'Baixado', EXTRAVIADO: 'Extraviado',
  EM_APURACAO: 'Em apuração',
};
export const FUNCIONAMENTO: Record<string, string> = {
  FUNCIONANDO: 'Funcionando', FUNCIONANDO_PARCIAL: 'Funcionando parcialmente', NAO_FUNCIONA: 'Não funciona', NAO_SE_APLICA: 'Não se aplica',
};
export const AMBIENTES: Record<string, string> = {
  SALA: 'Sala', COORDENACAO: 'Coordenação', GERENCIA: 'Gerência', DEPARTAMENTO: 'Departamento', RECEPCAO: 'Recepção', ALMOXARIFADO: 'Almoxarifado',
  CONSULTORIO: 'Consultório', OFICINA: 'Oficina', DEPOSITO: 'Depósito', OUTRO: 'Outro ambiente',
};
export const TIPOS_MOV: Record<string, string> = {
  TRANSFERENCIA_SALA: 'Transferência entre salas', TRANSFERENCIA_SETOR: 'Transferência entre setores', TRANSFERENCIA_COORDENACAO: 'Transferência entre coordenações',
  TRANSFERENCIA_DIRETORIA: 'Transferência entre diretorias', TRANSFERENCIA_UNIDADE: 'Transferência entre unidades de saúde', ALMOXARIFADO: 'Transferência para o almoxarifado',
  MANUTENCAO: 'Transferência para manutenção', SUBSTITUICAO: 'Substituição de equipamento', TROCA: 'Troca de patrimônio', DEVOLUCAO: 'Devolução',
  EMPRESTIMO: 'Empréstimo temporário', RECOLHIMENTO: 'Recolhimento', BAIXA: 'Baixa patrimonial', RESPONSABILIDADE: 'Alteração de responsável', RETIFICACAO: 'Retificação',
};
export const TIPOS_TRANSFERENCIA = ['TRANSFERENCIA_SALA', 'TRANSFERENCIA_SETOR', 'TRANSFERENCIA_COORDENACAO', 'TRANSFERENCIA_DIRETORIA', 'TRANSFERENCIA_UNIDADE',
  'ALMOXARIFADO', 'MANUTENCAO', 'DEVOLUCAO', 'EMPRESTIMO', 'RECOLHIMENTO'];
export const SITUACAO_MOV: Record<string, [string, 'neutro' | 'sucesso' | 'alerta' | 'perigo' | 'info']> = {
  RASCUNHO: ['Rascunho', 'neutro'], SOLICITADA: ['Solicitada', 'info'], AGUARDANDO_CONFIRMACAO: ['Aguardando confirmação', 'alerta'],
  CONFIRMADA_DESTINO: ['Confirmada em parte', 'alerta'], REJEITADA: ['Rejeitada', 'perigo'], CANCELADA: ['Cancelada', 'neutro'],
  CONCLUIDA: ['Concluída', 'sucesso'], PENDENTE_REGULARIZACAO: ['Pendente de regularização física', 'alerta'],
};
export const DESTINO_SUBSTITUIDO: Record<string, string> = {
  ALMOXARIFADO: 'Encaminhar ao almoxarifado', OUTRA_COORDENACAO: 'Transferir para outra coordenação', MANUTENCAO: 'Encaminhar para manutenção',
  RESERVA: 'Manter como reserva', AVALIACAO_BAIXA: 'Encaminhar para avaliação de baixa',
};
export const STATUS_INVENTARIO: Record<string, [string, 'neutro' | 'sucesso' | 'alerta' | 'perigo' | 'info']> = {
  PENDENTE: ['Pendente de conferência', 'neutro'], LOCALIZADO: ['Localizado e conferido', 'sucesso'], NAO_LOCALIZADO: ['Não localizado', 'perigo'],
  SEM_CADASTRO: ['Encontrado sem cadastro', 'info'], DIVERGENCIA: ['Com divergência', 'alerta'], NECESSITA_AVALIACAO: ['Necessita avaliação', 'alerta'],
};
export const DECLARACAO = 'Declaro que recebi o bem patrimonial descrito neste documento, responsabilizando-me por sua guarda e conservação, conforme as normas institucionais aplicáveis.';
export const codigoMov = (m: { numero: number; ano: number }) => `${String(m.numero).padStart(4, '0')}/${m.ano}`;

// ---------------------------------------------------------------- categorias

export interface CategoriaPatrimonio { id: string; tenant_id: string; pai_id: string | null; nome: string; ordem: number; ativo: boolean }

export async function listarCategoriasPatrimonio(tenantId: string) {
  return falhou(await supabase.from('patrimonio_categorias').select('id, tenant_id, pai_id, nome, ordem, ativo').eq('tenant_id', tenantId)
    .order('ordem').order('nome')) as CategoriaPatrimonio[];
}

export async function salvarCategoriaPatrimonio(tenantId: string, id: string | null, dados: { nome: string; pai_id: string | null; ordem: number }) {
  if (id) falhou(await supabase.from('patrimonio_categorias').update(dados).eq('id', id));
  else falhou(await supabase.from('patrimonio_categorias').insert({ tenant_id: tenantId, ...dados }));
}

export async function definirStatusCategoriaPatrimonio(id: string, ativo: boolean, motivo: string) {
  falhou(await supabase.from('patrimonio_categorias').update({ ativo }).eq('id', id).setHeader('x-justificativa', cabecalhoJustificativa(motivo)));
}

// ---------------------------------------------------------------- bens

export interface BemListado {
  id: string; numero: string; descricao: string; marca: string | null; modelo: string | null; numero_serie: string | null; quantidade: number;
  valor_aquisicao: number | null; data_aquisicao: string | null; categoria: string; subcategoria: string | null; categoria_id: string;
  unidade_id: string; unidade: Lotacao | null; local_id: string | null; local: string | null; ambiente: string | null; sala: string | null;
  responsavel_id: string | null; responsavel: string | null; responsavel_matricula: string | null;
  conservacao: string; situacao: string; funcionamento: string; pendente: boolean; criado_em: string; meu: boolean;
}

export interface FiltrosBens {
  busca?: string; numero?: string; categoria_id?: string | null; subcategoria_id?: string | null; unidade_id?: string | null; local_id?: string | null;
  responsavel_id?: string | null; situacoes?: string[]; conservacoes?: string[]; meus?: boolean; sem_responsavel?: boolean; incluir_baixados?: boolean;
  limite?: number; offset?: number;
}

export async function buscarBens(tenantId: string, p: FiltrosBens) {
  return falhou(await supabase.rpc('patrimonio_buscar', { p_tenant: tenantId, p })) as { total: number; itens: BemListado[] };
}

export interface DadosBem {
  numero: string; descricao: string; categoria_id: string; subcategoria_id: string | null; marca: string | null; modelo: string | null;
  numero_serie: string | null; fabricante: string | null; quantidade: number; data_aquisicao: string | null; valor_aquisicao: string | null;
  nota_fiscal: string | null; fornecedor_id: string | null; observacoes: string | null; responsavel_obs: string | null;
  conservacao: string; funcionamento: string; data_ultima_avaliacao: string | null; observacoes_tecnicas: string | null;
}
export interface LocalizacaoInicial {
  unidade_id: string; local_id: string | null; ambiente: string | null; sala: string | null; responsavel_id: string | null;
  responsavel_desde: string | null; situacao: string;
}

export async function cadastrarBem(tenantId: string, dados: DadosBem, local: LocalizacaoInicial) {
  return (falhou(await supabase.from('patrimonio_bens').insert({ tenant_id: tenantId, ...dados, ...local }).select('id').single()) as { id: string }).id;
}

export async function editarBem(id: string, dados: Partial<DadosBem>) {
  const r = await supabase.from('patrimonio_bens').update(dados).eq('id', id).select('id');
  if (r.error) throw r.error;
  if (!r.data?.length) throw { erro: 'Você não tem permissão para editar este bem.' };
}

export interface FichaBem extends Record<string, unknown> {
  id: string; tenant_id: string; numero: string; descricao: string; categoria_id: string; subcategoria_id: string | null; categoria: string; subcategoria: string | null;
  marca: string | null; modelo: string | null; numero_serie: string | null; fabricante: string | null; quantidade: number; data_aquisicao: string | null;
  valor_aquisicao: number | null; nota_fiscal: string | null; fornecedor_id: string | null; fornecedor: string | null; observacoes: string | null;
  unidade_id: string; unidade: Lotacao | null; local_id: string | null; local: { nome: string; tipo: string; endereco: string | null } | null;
  ambiente: string | null; sala: string | null; responsavel_id: string | null; responsavel_desde: string | null; responsavel_obs: string | null;
  responsavel: { id: string; nome: string; matricula: string; cargo: string | null; funcao: string | null; lotacao: Lotacao | null } | null;
  conservacao: string; funcionamento: string; situacao: string; data_ultima_avaliacao: string | null; observacoes_tecnicas: string | null;
  baixado_em: string | null; criado_em: string; pode_editar: boolean; pode_movimentar: boolean; pode_baixar: boolean; movimentacao_pendente: string | null;
  movimentacoes: Array<{ id: string; codigo: string; tipo: string; situacao: string; criado_em: string; concluida_em: string | null; justificativa: string; papel: string;
    solicitante: string; origem: string; destino: string; responsavel_anterior: string | null; novo_responsavel: string | null; confirmacao: string;
    confirmacao_tipo: string | null; confirmado_em: string | null; confirmado_por: string | null; documentos: number }>;
  responsaveis: Array<{ servidor: string | null; matricula: string | null; unidade: string; local: string | null; inicio: string; fim: string | null; motivo: string | null; registrado_por: string | null }>;
  inventarios: Array<{ titulo: string; status: string; conferido_em: string | null; conservacao_avaliada: string | null; observacao: string | null }>;
  auditoria: Array<{ criado_em: string; acao: string; usuario: string | null; campos: string[] | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; justificativa: string | null }> | null;
}

export async function fichaBem(id: string) {
  return falhou(await supabase.rpc('patrimonio_ficha', { p_bem: id })) as FichaBem;
}

export async function painelPatrimonio(tenantId: string, unidadeId: string | null) {
  return falhou(await supabase.rpc('patrimonio_painel', { p_tenant: tenantId, p_unidade: unidadeId })) as {
    total: number; valor_total: number; por_situacao: Record<string, number>; por_conservacao: Record<string, number>; danificados: number; sem_responsavel: number;
    por_categoria: Array<{ nome: string; total: number }>; por_local: Array<{ id: string | null; nome: string; total: number }>;
    por_diretoria: Array<{ nome: string; total: number }>; por_coordenacao: Array<{ nome: string; total: number }>;
    por_responsavel: Array<{ id: string; nome: string; matricula: string; total: number }>; pendencias: number; aguardando_mim: number;
  };
}

export interface ServidorOpcao { id: string; nome: string; matricula: string; cargo: string | null; lotacao: Lotacao | null; tem_acesso: boolean }

export async function buscarServidoresPatrimonio(tenantId: string, termo: string) {
  return falhou(await supabase.rpc('patrimonio_buscar_servidores', { p_tenant: tenantId, p_termo: termo || null })) as ServidorOpcao[];
}

// ---------------------------------------------------------------- movimentações

export interface ItemMovimentacao {
  bem_id: string; papel?: 'PRINCIPAL' | 'ENTREGUE' | 'RECEBIDO' | 'SUBSTITUIDO' | 'SUBSTITUTO';
  destino_unidade_id?: string | null; destino_local_id?: string | null; destino_ambiente?: string | null; destino_sala?: string | null;
  destino_responsavel_id?: string | null; destino_situacao?: string | null;
}

export async function movimentar(tenantId: string, p: { tipo: string; justificativa: string; observacoes?: string | null; destino_substituido?: string | null; devolucao_prevista?: string | null; itens: ItemMovimentacao[] }) {
  return falhou(await supabase.rpc('patrimonio_movimentar', { p_tenant: tenantId, p })) as string;
}

interface Pessoa { nome: string; matricula: string; cargo: string | null }
interface PontaMov { unidade: Lotacao | null; local: string | null; ambiente: string | null; sala: string | null; situacao: string; responsavel: Pessoa | null }
export interface Movimentacao {
  id: string; tenant_id: string; numero: number; ano: number; codigo: string; tipo: string; situacao: string; justificativa: string; observacoes: string | null;
  destino_substituido: string | null; devolucao_prevista: string | null; solicitante: string; solicitante_matricula: string | null; criado_em: string;
  concluida_em: string | null; termo_emitido_em: string | null; termo_emitido_por_nome: string | null; conferido_em: string | null; conferido_por_nome: string | null;
  rejeitada_em: string | null; rejeitada_por_nome: string | null; motivo_rejeicao: string | null; cancelada_em: string | null; motivo_cancelamento: string | null;
  unidade_id: string; unidade_destino_id: string | null; retifica_codigo: string | null; retificada_por_codigo: string | null;
  aguarda_minha_confirmacao: boolean; posso_confirmar_adm: boolean; posso_cancelar: boolean; posso_retificar: boolean;
  itens: Array<{ id: string; papel: string; bem_id: string; numero: string; descricao: string; categoria: string; conservacao: string; origem: PontaMov; destino: PontaMov;
    confirmacao: 'PENDENTE' | 'CONFIRMADO' | 'REJEITADO'; confirmacao_tipo: string | null; confirmado_em: string | null; confirmado_por: string | null;
    confirmado_matricula: string | null; declaracao: string | null }>;
}

export async function obterMovimentacao(id: string) {
  return falhou(await supabase.rpc('patrimonio_movimentacao', { p_mov: id })) as Movimentacao;
}

export interface MovListada {
  id: string; codigo: string; tipo: string; situacao: string; criado_em: string; concluida_em: string | null; justificativa: string; solicitante: string;
  origem: Lotacao | null; destino: Lotacao | null; termo_emitido: boolean; retificada: boolean; aguarda_minha_confirmacao: boolean;
  bens: Array<{ numero: string; descricao: string; papel: string; confirmacao: string; origem_responsavel: string | null; destino_responsavel: string | null; origem_local: string | null; destino_local: string | null }>;
}

export async function listarMovimentacoes(tenantId: string, p: { tipos?: string[]; situacoes?: string[]; de?: string; ate?: string; bem_id?: string; unidade_id?: string | null; para_mim?: boolean; pendentes?: boolean; limite?: number; offset?: number }) {
  return falhou(await supabase.rpc('patrimonio_movimentacoes_lista', { p_tenant: tenantId, p })) as { total: number; itens: MovListada[] };
}

export async function responderMovimentacao(id: string, aceitar: boolean, texto?: string) {
  return falhou(await supabase.rpc('patrimonio_responder', { p_mov: id, p_aceitar: aceitar, p_texto: texto ?? null })) as 'CONCLUIDA' | 'PARCIAL' | 'REJEITADA';
}

export async function confirmarAdministrativo(id: string, documentoId: string | null, observacao?: string) {
  return falhou(await supabase.rpc('patrimonio_confirmar_administrativo', { p_mov: id, p_documento: documentoId, p_observacao: observacao ?? null })) as 'CONCLUIDA' | 'PARCIAL';
}

export async function cancelarMovimentacao(id: string, motivo: string) {
  falhou(await supabase.rpc('patrimonio_cancelar', { p_mov: id, p_motivo: motivo }));
}

export async function retificarMovimentacao(id: string, justificativa: string) {
  return falhou(await supabase.rpc('patrimonio_retificar', { p_mov: id, p_justificativa: justificativa })) as string;
}

/** Marca a emissão do termo físico e devolve os dados para o PDF */
export async function dadosTermo(id: string) {
  return falhou(await supabase.rpc('patrimonio_termo', { p_mov: id })) as Movimentacao;
}

// ---------------------------------------------------------------- inventário

export interface InventarioResumo { id: string; titulo: string; situacao: string; unidade_id: string; local_id: string | null; iniciado_em: string; concluido_em: string | null }

export async function listarInventarios(tenantId: string) {
  return falhou(await supabase.from('patrimonio_inventarios').select('id, titulo, situacao, unidade_id, local_id, iniciado_em, concluido_em, unidade:unidades_organizacionais(nome, sigla)')
    .eq('tenant_id', tenantId).order('iniciado_em', { ascending: false }).limit(100)) as unknown as Array<InventarioResumo & { unidade: { nome: string; sigla: string | null } | null }>;
}

export async function abrirInventario(tenantId: string, p: { titulo: string; unidade_id: string; local_id: string | null; observacoes: string | null }) {
  return falhou(await supabase.rpc('patrimonio_abrir_inventario', { p_tenant: tenantId, p })) as string;
}

export interface Inventario {
  id: string; tenant_id: string; titulo: string; situacao: string; unidade_id: string; local_id: string | null; iniciado_em: string; concluido_em: string | null;
  observacoes: string | null; unidade: Lotacao | null; local: string | null; responsavel: string; pode_editar: boolean; resumo: Record<string, number> | null;
  itens: Array<{ id: string; status: string; conservacao_avaliada: string | null; observacao: string | null; numero_encontrado: string | null; descricao_encontrada: string | null;
    conferido_em: string | null; conferido_por: string | null;
    bem: { id: string; numero: string; descricao: string; conservacao: string; sala: string | null; local: string | null; unidade: string; responsavel: string | null } | null }>;
}

export async function obterInventario(id: string) {
  return falhou(await supabase.rpc('patrimonio_inventario', { p_inventario: id })) as Inventario;
}

export async function conferirItem(id: string, p: { status: string; conservacao?: string | null; observacao?: string | null }) {
  falhou(await supabase.rpc('patrimonio_conferir', { p_item: id, p }));
}

export async function bemSemCadastro(inventarioId: string, p: { descricao: string; numero?: string | null; observacao?: string | null }) {
  falhou(await supabase.rpc('patrimonio_bem_sem_cadastro', { p_inventario: inventarioId, p }));
}

export async function encerrarInventario(id: string, cancelar = false, motivo?: string) {
  falhou(await supabase.rpc('patrimonio_encerrar_inventario', { p_inventario: id, p_cancelar: cancelar, p_motivo: motivo ?? null }));
}

// ---------------------------------------------------------------- relatórios e timbre

export async function registrarRelatorio(tenantId: string, tipo: string, titulo: string, filtros: Record<string, unknown>, pdf: Blob) {
  const r = falhou(await supabase.rpc('patrimonio_registrar_relatorio', { p_tenant: tenantId, p_tipo: tipo, p_titulo: titulo, p_filtros: filtros, p_tamanho: pdf.size })) as
    { id: string; nome_arquivo: string; storage_path: string; documento_id: string };
  const envio = await supabase.storage.from('arquivos').upload(r.storage_path, pdf, { contentType: 'application/pdf', upsert: false });
  if (envio.error) throw { erro: `O relatório foi numerado, mas o arquivo não foi salvo: ${envio.error.message}` };
  return r;
}

export interface RelatorioEmitido { id: string; tipo: string; titulo: string; nome_arquivo: string; filtros: Record<string, unknown>; gerado_em: string; gerado_por: string;
  documento: { id: string; storage_path: string; nome_arquivo: string } | null }

export async function relatoriosEmitidos(tenantId: string) {
  return falhou(await supabase.rpc('patrimonio_relatorios_emitidos', { p_tenant: tenantId })) as RelatorioEmitido[];
}

export async function dadosTermoResponsabilidade(tenantId: string, p: { responsavel_id?: string | null; unidade_id?: string | null; local_id?: string | null }) {
  return falhou(await supabase.rpc('patrimonio_termo_responsabilidade', { p_tenant: tenantId, p })) as {
    responsavel: { nome: string; matricula: string; cargo: string | null; lotacao: Lotacao | null } | null; unidade: Lotacao | null; local: string | null; bens: BemListado[] };
}

export interface Timbre {
  nome_oficial: string; nome_curto: string; cnpj: string | null; endereco: string | null; cidade: string | null; uf: string | null; cep: string | null;
  telefone: string | null; email: string | null; site: string | null; logo_path: string | null; cabecalho: string[] | null; rodape: string | null;
  secretaria: string | null; orgao_fundo: string | null; setor: string | null; contato: string | null;
}

export async function timbrePatrimonio(tenantId: string) {
  return falhou(await supabase.rpc('patrimonio_timbre', { p_tenant: tenantId })) as Timbre;
}

/** Localiza um bem pelo número exato, mesmo de outro setor (usado na troca) */
export async function localizarBem(tenantId: string, numero: string) {
  return falhou(await supabase.rpc('patrimonio_localizar', { p_tenant: tenantId, p_numero: numero })) as
    { id: string; numero: string; descricao: string; situacao: string; pendente: boolean; unidade: Lotacao | null; local: string | null; responsavel: string | null } | null;
}
