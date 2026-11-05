import { obterConfiguracoes } from '@/services/api';
import { registrarExportacao } from '@/services/relatorios';

export { obterConfiguracoes };

/** A impressão/PDF de relatório conta como exportação na auditoria */
export async function registrarAcessoRelatorio(tenantId: string, tipo: string, linhas: number) {
  try {
    await registrarExportacao(tenantId, 'relatorios', `PDF: ${tipo === 'completo' ? 'notas por classificação orçamentária' : 'consumo resumido'}`, linhas);
  } catch { /* sem permissão de exportar: a visualização continua permitida */ }
}
