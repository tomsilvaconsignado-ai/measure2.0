// Observação do consolidado mensal, igual à regra do banco (observacao_frequencia):
// texto manual prevalece; senão nomeação/exoneração no mês, "Justificativa anexada." e,
// sem nenhuma ocorrência, "Frequência integral.". Usada na prévia enquanto a pessoa digita.

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const noMes = (iso: string | null, ano: number, mes: number) => !!iso && Number(iso.slice(0, 4)) === ano && Number(iso.slice(5, 7)) === mes;

export function observacaoFrequencia(p: {
  nomeacao: string | null; exoneracao: string | null; ano: number; mes: number;
  atrasos: number | null; faltas: number | null; justificativa: boolean; manual: string | null;
}) {
  const manual = p.manual?.trim();
  if (manual) return manual;
  const partes = [
    noMes(p.nomeacao, p.ano, p.mes) && `Nomeação em ${dataBr(p.nomeacao!)}.`,
    noMes(p.exoneracao, p.ano, p.mes) && `Exoneração em ${dataBr(p.exoneracao!)}.`,
    p.justificativa && 'Justificativa anexada.',
  ].filter(Boolean);
  if (partes.length) return partes.join(' ');
  return !p.atrasos && !p.faltas ? 'Frequência integral.' : '';
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
