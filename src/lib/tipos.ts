export type Papel = 'MASTER' | 'GESTAO_MUNICIPAL' | 'SECRETARIO' | 'DIRETOR' | 'COORDENADOR' | 'ADMINISTRATIVO' | 'SERVIDOR';
export type TipoUnidade = 'ORGANIZACAO' | 'SECRETARIA' | 'DIRETORIA' | 'COORDENACAO' | 'GERENCIA' | 'DEPARTAMENTO' | 'SETOR' | 'UNIDADE';
export type Recurso =
  | 'estrutura' | 'usuarios' | 'configuracoes' | 'auditoria'
  | 'fornecedores' | 'servidores' | 'unidades' | 'classificacoes' | 'tipos_servico'
  | 'contratos' | 'empenhos' | 'notas_fiscais' | 'ordens_servico' | 'relatorios';
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

export interface MeuContexto {
  perfil: Perfil | null;
  vinculos: VinculoContexto[];
  suportes: SessaoSuporte[];
}

export interface Tenant {
  id: string;
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
  textos: Record<string, string>;
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
