export type Papel = 'MASTER' | 'GESTAO_MUNICIPAL' | 'SECRETARIO' | 'DIRETOR' | 'COORDENADOR' | 'ADMINISTRATIVO' | 'PATRIMONIAL' | 'SERVIDOR';
export type TipoUnidade = 'ORGANIZACAO' | 'SECRETARIA' | 'DIRETORIA' | 'COORDENACAO' | 'GERENCIA' | 'DEPARTAMENTO' | 'SETOR' | 'UNIDADE';
export type Recurso =
  | 'estrutura' | 'usuarios' | 'configuracoes' | 'auditoria'
  | 'fornecedores' | 'servidores' | 'servidores_sensiveis' | 'unidades' | 'classificacoes' | 'tipos_servico'
  | 'contratos' | 'empenhos' | 'notas_fiscais' | 'decretos' | 'ordens_servico' | 'relatorios' | 'conecta' | 'patrimonio';
export type Acao = 'ler' | 'criar' | 'editar' | 'excluir' | 'aprovar' | 'atestar' | 'exportar';

export const TIPOS_UNIDADE: Record<TipoUnidade, string> = {
  ORGANIZACAO: 'Organização',
  SECRETARIA: 'Secretaria',
  DIRETORIA: 'Diretoria',
  COORDENACAO: 'Coordenação',
  GERENCIA: 'Gerência',
  DEPARTAMENTO: 'Departamento',
  SETOR: 'Setor',
  UNIDADE: 'Unidade vinculada',
};

export interface Perfil {
  id: string;
  email: string;
  nome: string;
  telefone: string | null;
  avatar_path: string | null;
  is_platform_admin: boolean;
  ativo: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
}

export interface VinculoContexto {
  id: string;
  papel: Papel;
  papel_nome: string;
  somente_leitura: boolean;
  padrao: boolean;
  tenant: { id: string; nome_curto: string; nome_oficial: string; logo_path: string | null; ativo: boolean };
  unidade: { id: string; nome: string; sigla: string | null; tipo: TipoUnidade } | null;
  permissoes: string[];
}

export interface SessaoSuporte { id: string; tenant_id: string; expira_em: string }

/** coordenação escolhida para visualizar, quando a pessoa enxerga várias */
export interface FocoUnidade { tenant_id: string; unidade_id: string; nome: string; sigla: string | null }

export interface MeuContexto {
  perfil: Perfil | null;
  vinculos: VinculoContexto[];
  suportes: SessaoSuporte[];
  focos?: FocoUnidade[];
}

export interface Tenant {
  id: string;
  /** município (ente) cujo catálogo orçamentário o órgão usa */
  ente_id?: string | null;
  nome_oficial: string;
  nome_curto: string;
  cnpj: string | null;
  endereco: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email_contato: string | null;
  site: string | null;
  logo_path: string | null;
  dominios_email: string[];
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface UnidadeOrganizacional {
  id: string;
  tenant_id: string;
  pai_id: string | null;
  tipo: TipoUnidade;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  caminho: string[];
  ativo: boolean;
}

export interface TenantConfiguracoes {
  tenant_id: string;
  documento_cabecalho: string[];
  documento_rodape: string | null;
  alerta_vencimento_dias: number[];
  anexo_tamanho_max_mb: number;
  bloquear_nota_contrato_vencido: boolean;
  /** quem lançou a nota também pode atestá-la (além dos designados) */
  permitir_atesto_lancador: boolean;
  textos: Record<string, string | string[]>;
}

export interface UsuarioListado {
  id: string;
  email: string;
  nome: string;
  telefone: string | null;
  avatar_path: string | null;
  ativo: boolean;
  is_platform_admin: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
  vinculos: Array<{
    id: string; papel: Papel; papel_nome: string; ativo: boolean;
    tenant_id: string; tenant_nome: string;
    unidade_id: string | null; unidade_nome: string | null; unidade_sigla: string | null;
  }>;
}

export interface RegistroAuditoria {
  id: number;
  criado_em: string;
  tenant_id: string | null;
  usuario_id: string | null;
  usuario_email: string | null;
  papeis: string | null;
  via_suporte: boolean;
  entidade: string;
  registro_id: string | null;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  campos_alterados: string[] | null;
  justificativa: string | null;
}

export interface PapelInfo { codigo: Papel; nome: string; descricao: string; somente_leitura: boolean; exige_unidade: boolean; ordem: number }
export interface RecursoInfo { codigo: Recurso; nome: string; grupo: string; ordem: number; livre_para_plataforma: boolean }
export interface AcaoInfo { codigo: Acao; nome: string; ordem: number; leitura: boolean }

// ---------------------------------------------------------------- Fase 2: cadastros

export interface Fornecedor {
  id: string; tenant_id: string;
  tipo_pessoa: 'PJ' | 'PF'; documento: string; razao_social: string; nome_fantasia: string | null;
  inscricao_estadual: string | null; inscricao_municipal: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null;
  telefone: string | null; telefone_secundario: string | null; email: string | null; site: string | null; nome_contato: string | null;
  observacoes: string | null; logo_path: string | null; ativo: boolean; criado_em: string; atualizado_em: string;
}

export interface ContaBancaria {
  id: string; fornecedor_id: string; banco_codigo: string | null; banco_nome: string; agencia: string; conta: string;
  tipo_conta: 'CORRENTE' | 'POUPANCA' | 'PAGAMENTO'; pix_tipo: 'CNPJ' | 'CPF' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA' | null;
  pix_chave: string | null; principal: boolean; ativo: boolean;
}

export interface Servidor {
  id: string; tenant_id: string; unidade_id: string; nome: string; matricula: string; cargo: string | null; funcao: string | null;
  email_institucional: string | null; telefone: string | null; data_nomeacao: string | null; data_exoneracao: string | null;
  jornada: string | null; numero_comunicado: string | null; atribuicoes: string | null; observacoes: string | null;
  foto_path: string | null; user_id: string | null;
  escolaridade: Escolaridade | null; curriculo_observacoes: string | null;
}

export type Escolaridade = 'FUNDAMENTAL_INCOMPLETO' | 'FUNDAMENTAL' | 'MEDIO_INCOMPLETO' | 'MEDIO' | 'TECNICO' | 'SUPERIOR_INCOMPLETO'
  | 'SUPERIOR' | 'ESPECIALIZACAO' | 'MESTRADO' | 'DOUTORADO' | 'POS_DOUTORADO';
export type TipoItemCurriculo = 'FORMACAO' | 'CURSO' | 'CAPACITACAO' | 'ESPECIALIZACAO' | 'CERTIFICACAO' | 'EXPERIENCIA';
export interface ItemCurriculo {
  id: string; servidor_id: string; tipo: TipoItemCurriculo; titulo: string; instituicao: string | null; ano_conclusao: number | null;
  carga_horaria: number | null; inicio: string | null; fim: string | null; observacoes: string | null; criado_em: string;
}
export type SituacaoFerias = 'PENDENTE' | 'PROGRAMADA' | 'EM_GOZO' | 'GOZADA' | 'CANCELADA';
export interface FeriasServidor {
  id: string; servidor_id: string; aquisitivo_inicio: string; aquisitivo_fim: string; gozo_inicio: string | null; gozo_fim: string | null;
  dias: number | null; observacoes: string | null; situacao: SituacaoFerias; criado_em: string; registrado_por_nome: string | null;
  cancelada_em: string | null; motivo_cancelamento: string | null; cancelada_por_nome: string | null;
}

/** Decreto do órgão (cadastrado pela plataforma; usado nos textos da nota fiscal) */
export interface Decreto { id: string; tenant_id: string; numero: string; descricao: string; data_publicacao: string | null; ativo: boolean }

export interface ServidorListado {
  id: string; nome: string; matricula: string; cargo: string | null; funcao: string | null;
  unidade_id: string; unidade_nome: string; unidade_sigla: string | null;
  email_institucional: string | null; telefone: string | null; foto_path: string | null;
  data_nomeacao: string | null; data_exoneracao: string | null; exonerado: boolean; tem_acesso: boolean; cpf: string | null;
  /** entra nos consolidados mensais (padrão SIM) */
  entra_consolidado: boolean;
}

export interface DadosPessoais {
  servidor_id: string; cpf: string | null; data_nascimento: string | null; nome_mae: string | null; naturalidade: string | null;
  tipo_sanguineo: string | null; email_pessoal: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null;
}

export interface Aniversariante { servidor_id: string; nome: string; dia: number; mes: number; unidade_sigla: string | null; unidade_nome: string; foto_path: string | null; hoje: boolean }

export interface UnidadeAtendida {
  id: string; tenant_id: string; nome: string; sigla: string | null; tipo: string; codigo: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null;
  telefone: string | null; email: string | null; responsavel_id: string | null; unidade_org_id: string | null;
  eh_grupo: boolean; regra_rateio: 'OBRIGATORIO' | 'OPCIONAL' | 'NAO_APLICAVEL'; participa_rateio: boolean;
  observacoes: string | null; ativo: boolean;
}

export type TipoClassificador = 'ORGAO' | 'UNIDADE_ORCAMENTARIA' | 'UNIDADE_GESTORA' | 'FUNCAO' | 'SUBFUNCAO' | 'PROGRAMA' | 'ACAO'
  | 'CATEGORIA_ECONOMICA' | 'GND' | 'MODALIDADE' | 'ELEMENTO' | 'SUBELEMENTO' | 'FONTE' | 'DETALHAMENTO_FONTE'
  | 'SUBFONTE' | 'CODIGO_ACOMPANHAMENTO' | 'ID_USO' | 'IDOC' | 'RESULTADO_PRIMARIO';

export interface ClassificadorTipo { codigo: TipoClassificador; nome: string; pai_tipo: TipoClassificador | null; pai_obrigatorio: boolean; ordem: number }

export interface Classificador {
  id: string; ente_id: string; tipo: TipoClassificador; codigo: string; descricao: string; pai_id: string | null;
  natureza_acao: 'PROJETO' | 'ATIVIDADE' | 'OPERACAO_ESPECIAL' | null; ativo: boolean;
}

export interface ClassificacaoOrcamentaria {
  id: string; ente_id: string;
  orgao_id: string | null; unidade_orcamentaria_id: string | null; funcao_id: string | null; subfuncao_id: string | null;
  programa_id: string | null; acao_id: string; categoria_economica_id: string | null; gnd_id: string | null;
  modalidade_id: string | null; elemento_id: string; subelemento_id: string | null; fonte_id: string; detalhamento_fonte_id: string | null;
  subfonte_id: string | null; codigo_acompanhamento_id: string | null; id_uso_id: string | null; idoc_id: string | null; resultado_primario_id: string | null;
  descricao: string | null; codigo_completo: string; ativo: boolean;
  unidade_gestora_id: string | null;
  /** exercício financeiro (LOA); vazio = vale para qualquer exercício */
  exercicio: number | null;
}

/** Município (ente): dono do catálogo orçamentário, compartilhado pelos órgãos dele */
export interface Ente { id: string; nome: string; uf: string | null; cnpj: string | null; ativo: boolean }

/** Dotação com o código e a descrição de cada campo (como na nota de empenho) */
export interface DotacaoDetalhada {
  id: string; ente_id: string; codigo_completo: string; descricao: string | null; ativo: boolean;
  uo_codigo: string | null; uo_descricao: string | null; funcao_codigo: string | null; funcao_descricao: string | null;
  subfuncao_codigo: string | null; subfuncao_descricao: string | null; programa_codigo: string | null; programa_descricao: string | null;
  acao_codigo: string; acao_descricao: string; categoria_codigo: string | null; gnd_codigo: string | null; modalidade_codigo: string | null;
  elemento_codigo: string; elemento_descricao: string; subelemento_codigo: string | null; subelemento_descricao: string | null;
  fonte_codigo: string; fonte_descricao: string; co_codigo: string | null; co_descricao: string | null;
  iduso_codigo: string | null; iduso_descricao: string | null; idoc_codigo: string | null; idoc_descricao: string | null;
  resultado_primario_codigo: string | null; resultado_primario_descricao: string | null; subfonte_codigo: string | null; subfonte_descricao: string | null;
  ug_codigo: string | null; ug_descricao: string | null; exercicio: number | null; natureza_acao: 'PROJETO' | 'ATIVIDADE' | 'OPERACAO_ESPECIAL' | null;
  detalhamento_codigo: string | null;
}

/** Dotação vinculada ao contrato, com as classificações e o valor empenhado nela */
export interface DotacaoDoContrato {
  contrato_id: string; id: string; codigo_completo: string; descricao: string | null; ativo: boolean; exercicio: number | null;
  uo_codigo: string | null; uo_descricao: string | null; ug_codigo: string | null; ug_descricao: string | null;
  funcao_codigo: string | null; subfuncao_codigo: string | null; programa_codigo: string | null; programa_descricao: string | null;
  acao_codigo: string; acao_descricao: string; natureza_acao: 'PROJETO' | 'ATIVIDADE' | 'OPERACAO_ESPECIAL' | null;
  categoria_codigo: string | null; gnd_codigo: string | null; modalidade_codigo: string | null;
  elemento_codigo: string; elemento_descricao: string; subelemento_codigo: string | null; subelemento_descricao: string | null;
  fonte_codigo: string; fonte_descricao: string; detalhamento_codigo: string | null; empenhos: number; empenhado: Decimal;
}

export interface TipoServico { id: string; tenant_id: string; nome: string; descricao: string | null; ordem: number; ativo: boolean }

// ---------------------------------------------------------------- Fases 3 e 4: contratos e execução

/** numeric do Postgres chega como número ou texto: sempre convertido para centavos inteiros */
export type Decimal = number | string;

export type SituacaoContrato = 'NAO_INICIADO' | 'VIGENTE' | 'A_VENCER' | 'VENCIDO';

export interface Modalidade { codigo: string; nome: string; descricao: string; ordem: number }

export interface Contrato {
  id: string; tenant_id: string; unidade_id: string; numero: string; modalidade: string; fornecedor_id: string;
  processo_administrativo: string | null; numero_licitacao: string | null; objeto: string; data_inicio: string; data_fim: string;
  valor_global: Decimal; observacoes: string | null; contrato_origem_id: string | null; numero_renovacao: number; ativo: boolean;
  /** id de quem cadastrou (gravado pelo banco; nulo nos registros migrados) */
  criado_por?: string | null;
}

export interface ContratoResumo extends Contrato {
  fornecedor_nome: string; fornecedor_fantasia: string | null; fornecedor_documento: string; fornecedor_tipo: 'PJ' | 'PF';
  unidade_nome: string; unidade_sigla: string | null; aditivos_valor: Decimal; valor_atual: Decimal; data_fim_atual: string;
  empenhado: Decimal; notas_valor: Decimal; pago: Decimal; saldo: Decimal; situacao: SituacaoContrato; dias_para_vencer: number;
  aditivos_aprovados: number;
}

export interface Designacao {
  id: string; contrato_id: string; servidor_id: string; papel: 'GESTOR' | 'FISCAL' | 'SUPLENTE'; inicio: string; fim: string | null;
  portaria: string | null; motivo_fim: string | null;
  servidor_nome: string; servidor_matricula: string; servidor_cargo: string | null; unidade_sigla: string | null; unidade_nome: string; tem_acesso: boolean;
}

export interface Aditivo {
  id: string; contrato_id: string; numero: string; tipo: 'PRAZO' | 'VALOR' | 'PRAZO_E_VALOR' | 'SUPRESSAO' | 'OUTRO';
  data_assinatura: string | null; nova_data_fim: string | null; valor: Decimal; descricao: string;
  status: 'RASCUNHO' | 'APROVADO' | 'REJEITADO'; decidido_em: string | null; motivo_decisao: string | null; criado_em: string;
  /** id de quem cadastrou (gravado pelo banco; nulo nos registros migrados) */
  criado_por?: string | null;
}

export interface Empenho {
  id: string; tenant_id: string; contrato_id: string; unidade_id: string; fornecedor_id: string; numero: string; ano: number;
  tipo: 'ORDINARIO' | 'ESTIMATIVO' | 'GLOBAL'; data_empenho: string; vigencia_fim: string | null; valor: Decimal;
  classificacao_id: string; processo: string | null; sd: string | null; licitacao: string | null; observacoes: string | null; ativo: boolean;
  /** id de quem cadastrou (gravado pelo banco; nulo nos registros migrados) */
  criado_por?: string | null;
}

export interface EmpenhoResumo extends Empenho {
  contrato_numero: string; contrato_objeto: string; fornecedor_nome: string; classificacao_codigo: string;
  reforcos: Decimal; valor_total: Decimal; utilizado: Decimal; saldo: Decimal;
}

export interface Reforco { id: string; empenho_id: string; numero: string | null; data: string; valor: Decimal; motivo: string | null; cancelado_em: string | null; motivo_cancelamento: string | null; criado_por?: string | null }

export type StatusPagamento = 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'CANCELADA';

export interface NotaResumo {
  id: string; tenant_id: string; contrato_id: string; empenho_id: string | null; unidade_id: string; fornecedor_id: string;
  numero: string; serie: string | null; data_emissao: string; data_inclusao: string; processo_administrativo: string | null;
  valor: Decimal; tipo_servico_id: string | null; periodo_inicio: string | null; periodo_fim: string | null; observacoes: string | null;
  status_atesto: 'PENDENTE' | 'ATESTADA'; status_pagamento: StatusPagamento; excecao_saldo: string | null;
  cancelada_em: string | null; motivo_cancelamento: string | null;
  contrato_numero: string; contrato_objeto: string; fornecedor_nome: string; fornecedor_documento: string;
  /** nulos nas notas migradas do sistema anterior sem empenho (completadas depois) */
  empenho_numero: string | null; empenho_ano: number | null; tipo_servico_nome: string | null; pago: Decimal; meses_referencia: string | null; sou_designado: boolean;
  /** designado no contrato ou quem lançou a nota (se o órgão permitir) */
  posso_atestar: boolean; atestado_em: string | null; retido: Decimal;
  /** id de quem cadastrou (gravado pelo banco; nulo nos registros migrados) */
  criado_por?: string | null;
}

export interface Pagamento {
  id: string; nota_id: string; data_pagamento: string; valor: Decimal; documento: string | null; observacao: string | null; registrado_em: string;
  cancelado_em: string | null; motivo_cancelamento: string | null;
  retencao_iss: Decimal; retencao_irrf: Decimal; retencao_inss: Decimal; retencao_federais: Decimal; retencao_outras: Decimal;
  retencao_outras_descricao: string | null; valor_liquido: Decimal; justificativa_ordem: string | null;
  /** quem registrou o pagamento (só essa pessoa ou o Master cancela) */
  registrado_por?: string | null;
}
export interface Atesto { id: string; nota_id: string; servidor_id: string; papel: string; texto: string; atestado_em: string; servidor_nome: string | null; servidor_matricula: string | null }

/** Nota atestada aguardando pagamento, na fila da ordem cronológica (por fonte de recurso) */
export interface ItemFilaPagamento {
  nota_id: string; numero: string; serie: string | null; fornecedor_nome: string; contrato_numero: string; empenho: string | null;
  valor: Decimal; pago: Decimal; restante: Decimal; status_pagamento: StatusPagamento; atestado_em: string; dias_aguardando: number;
  fonte_id: string; fonte: string; posicao: number; unidade_id: string;
}

export interface PagamentoRealizado {
  pagamento_id: string; nota_id: string; numero: string; fornecedor_nome: string; contrato_numero: string; data_pagamento: string; valor: Decimal;
  retencao_iss: Decimal; retencao_irrf: Decimal; retencao_inss: Decimal; retencao_federais: Decimal; retencao_outras: Decimal;
  retencao_outras_descricao: string | null; valor_liquido: Decimal; documento: string | null; justificativa_ordem: string | null;
  registrado_por: string; registrado_em: string;
}

export interface DocumentoEmitido { id: string; tenant_id: string; tipo: 'EXTRATO_CONTRATO' | 'EXTRATO_EMPENHO' | 'ATESTO' | 'CONSOLIDADO_MENSAL' | 'CHECKLIST_NOTA' | 'EXTRATO_NOTAS' | 'EXTRATO_UNIDADES' | 'EXTRATO_RATEIO'; registro_id: string; titulo: string; dados: Record<string, unknown>; emitido_em: string }
