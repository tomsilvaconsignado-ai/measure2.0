// Texto de atesto a partir do modelo configurado pelo órgão (variáveis entre chaves).
import { formatarCentavos, formatarData } from './formatacao';

const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Monta o texto do atesto a partir do modelo do órgão (variáveis entre chaves) */
export function montarAtesto(modelo: string, decreto: string, d: {
  objeto: string; contrato: string; fornecedor: string; nota: string; valorCentavos: number; meses: Array<{ ano: number; mes: number }>;
  periodoInicio?: string | null; periodoFim?: string | null; processo?: string | null;
}) {
  const meses = [...d.meses].sort((a, b) => a.ano - b.ano || a.mes - b.mes).map((m) => `${MESES_EXTENSO[m.mes - 1]}/${m.ano}`).join(', ');
  const periodo = d.periodoInicio && d.periodoFim ? ` (período de ${formatarData(d.periodoInicio)} a ${formatarData(d.periodoFim)})` : '';
  const valores: Record<string, string> = {
    objeto: d.objeto, contrato: d.contrato, fornecedor: d.fornecedor, nota: d.nota, valor: formatarCentavos(d.valorCentavos),
    meses: meses || '—', periodo, processo: d.processo || '—', decreto,
  };
  return modelo.replace(/\{(\w+)\}/g, (_, k: string) => valores[k] ?? `{${k}}`).replace(/\s+\./g, '.').trim();
}
