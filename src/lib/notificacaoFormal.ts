// Notificação formal: situações, papéis e composição do texto (fundamentação, prazo, consequências e
// manifestação) a partir do tipo de ocorrência, do regime jurídico, da cláusula e dos modelos do órgão.
// O texto é uma SUGESTÃO para o responsável revisar; quando algo não é seguro, pede revisão (sem inventar).

export type Regime = 'LEI_14133' | 'LEI_8666' | 'OUTRO';
export type Gravidade = 'LEVE' | 'MEDIA' | 'GRAVE';
export type StatusNotificacao = 'RASCUNHO' | 'AGUARDANDO_ASSINATURA' | 'EMITIDA' | 'ENVIADA' | 'RECEBIDA' | 'EM_PRAZO' | 'PRAZO_VENCIDO' | 'RESPONDIDA'
  | 'EM_ANALISE' | 'REGULARIZADA' | 'NAO_REGULARIZADA' | 'ENCAMINHADA' | 'ENCERRADA' | 'CANCELADA' | 'RETIFICADA';

export const STATUS: Record<StatusNotificacao, { rotulo: string; tom: 'neutro' | 'info' | 'alerta' | 'perigo' | 'sucesso' }> = {
  RASCUNHO: { rotulo: 'Rascunho (em elaboração)', tom: 'neutro' },
  AGUARDANDO_ASSINATURA: { rotulo: 'Aguardando assinatura', tom: 'info' },
  EMITIDA: { rotulo: 'Emitida (assinada)', tom: 'info' },
  ENVIADA: { rotulo: 'Enviada – aguardando ciência', tom: 'info' },
  RECEBIDA: { rotulo: 'Recebida – ciência a registrar', tom: 'info' },
  EM_PRAZO: { rotulo: 'Em prazo de regularização (aguardando resposta)', tom: 'alerta' },
  PRAZO_VENCIDO: { rotulo: 'Prazo vencido', tom: 'perigo' },
  RESPONDIDA: { rotulo: 'Respondida', tom: 'info' },
  EM_ANALISE: { rotulo: 'Em análise', tom: 'info' },
  REGULARIZADA: { rotulo: 'Regularizada', tom: 'sucesso' },
  NAO_REGULARIZADA: { rotulo: 'Não regularizada', tom: 'perigo' },
  ENCAMINHADA: { rotulo: 'Encaminhada para apuração', tom: 'perigo' },
  ENCERRADA: { rotulo: 'Encerrada', tom: 'neutro' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'neutro' },
  RETIFICADA: { rotulo: 'Retificada (substituída por nova versão)', tom: 'neutro' },
};

export const REGIMES: Record<Regime, string> = { LEI_14133: 'Lei nº 14.133/2021', LEI_8666: 'Lei nº 8.666/1993 (regime anterior)', OUTRO: 'Outro / a confirmar' };
export const PAPEIS: Record<string, string> = { GESTOR: 'Gestor do contrato', FISCAL: 'Fiscal do contrato', SUPLENTE: 'Suplente de fiscal', ADMINISTRADOR: 'Administrador autorizado' };
export const GRAVIDADES: Record<Gravidade, string> = { LEVE: 'Leve', MEDIA: 'Média', GRAVE: 'Grave' };
export const SANCOES: Record<string, string> = { ADVERTENCIA: 'Advertência', MULTA: 'Multa', IMPEDIMENTO: 'Impedimento de licitar e contratar', INIDONEIDADE: 'Declaração de inidoneidade', SUSPENSAO: 'Suspensão temporária (Lei 8.666/1993)' };
export const SITUACOES_SANCAO: Record<string, string> = { VIGENTE: 'Vigente', CUMPRIDA: 'Cumprida', SUSPENSA: 'Suspensa', ANULADA: 'Anulada', ENCERRADA: 'Encerrada' };
export const FORMAS_ENVIO: Record<string, string> = { EMAIL: 'E-mail', PROTOCOLO: 'Protocolo presencial', SISTEMA_OFICIAL: 'Sistema oficial de processos (ex.: 1Doc)', CORREIOS: 'Correios (AR)', PESSOALMENTE: 'Entrega pessoal ao preposto' };

export interface Fundamento { codigo: string; regime: string; norma: string; artigo: string | null; inciso: string | null; texto: string; revisao_pendente: boolean; observacoes?: string | null }
export interface Modelo { tipo: 'CONSEQUENCIAS' | 'MANIFESTACAO'; regime: Regime; texto: string }

/** Fundamentos que valem para o regime (as normas municipais acompanham a Lei 14.133) */
export function fundamentosDoRegime(todos: Fundamento[], regime: Regime) {
  return todos.filter((f) => (regime === 'LEI_14133' ? f.regime === 'LEI_14133' || f.regime === 'MUNICIPAL' : regime === 'LEI_8666' ? f.regime === 'LEI_8666' : true) || f.regime === 'GERAL');
}

export function citacao(f: Fundamento) {
  const lei = f.norma.replace(/^Lei Federal/, 'Lei Federal');
  if (!f.artigo) return lei;
  return `${f.artigo.replace(/^art\./, 'Art.')}${f.inciso ? `, ${/§/.test(f.inciso) ? '' : 'inciso '}${f.inciso}` : ''}, da ${lei}`;
}

export function textoPrazo(dias: number | null, tipo: 'CORRIDOS' | 'UTEIS', diasResposta: number | null) {
  if (!dias) return '';
  const d = `${dias} (${extenso(dias)}) dia${dias > 1 ? 's' : ''} ${tipo === 'UTEIS' ? (dias > 1 ? 'úteis' : 'útil') : 'corrido' + (dias > 1 ? 's' : '')}`;
  return `Fica concedido o prazo de ${d} para a regularização da ocorrência, contado da data da ciência desta notificação.`
    + (diasResposta ? ` No mesmo prazo de ${diasResposta} dia${diasResposta > 1 ? 's' : ''} ${tipo === 'UTEIS' ? 'úteis' : 'corridos'}, a contratada poderá apresentar manifestação.` : '')
    + ' Este prazo foi definido pela fiscalização conforme o contrato e a natureza da ocorrência, e não se confunde com o prazo de defesa de eventual procedimento sancionador.';
}

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
export function extenso(n: number): string {
  if (n < 20) return UNIDADES[n]!;
  if (n < 100) return DEZENAS[Math.floor(n / 10)]! + (n % 10 ? ` e ${UNIDADES[n % 10]}` : '');
  if (n === 100) return 'cem';
  if (n < 1000) return `${['', 'cento', 'duzentos', 'trezentos'][Math.floor(n / 100)] ?? String(Math.floor(n / 100) * 100)}${n % 100 ? ` e ${extenso(n % 100)}` : ''}`;
  return String(n);
}

/** Medidas possíveis, conforme os fundamentos e a gravidade (advertência sobre o que PODE ocorrer) */
export function medidasPossiveis(codigos: string[], gravidade: Gravidade, regime: Regime) {
  const tem = (re: RegExp) => codigos.some((c) => re.test(c));
  const m = ['a determinação de correção da irregularidade'];
  if (tem(/ART119|ART69$/)) m.push('a reexecução do serviço ou a substituição do material ou equipamento inadequado, às expensas da contratada');
  if (tem(/ART120/)) m.push('o ressarcimento de prejuízos comprovados');
  m.push('a glosa ou a rejeição dos serviços não executados ou executados em desacordo, conforme o contrato e a legislação');
  if (tem(/ART162|ART86/)) m.push('a aplicação de multa de mora, quando prevista no edital ou no contrato');
  m.push('a instauração de procedimento para apuração de responsabilidade');
  if (regime !== 'OUTRO' && gravidade === 'GRAVE' && tem(/ART137|ART78/)) m.push(`a extinção ${regime === 'LEI_8666' ? '(rescisão) ' : ''}do contrato, nas hipóteses e condições previstas na legislação, assegurados o contraditório e a ampla defesa`);
  return m;
}

const juntar = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join('; ')}; e ${l.at(-1)}`);

export interface Composicao { fundamentacao: string; prazo_texto: string; consequencias: string; manifestacao: string; revisao_juridica: boolean; avisos: string[] }

export function compor(e: {
  contratoNumero: string; clausula: string; regime: Regime; regimeDoContrato: Regime | null; gravidade: Gravidade;
  selecionados: Fundamento[]; modelos: Modelo[]; prazoDias: number | null; prazoTipo: 'CORRIDOS' | 'UTEIS'; prazoRespostaDias: number | null;
  contratacaoDireta: boolean;
}): Composicao {
  const avisos: string[] = [];
  let revisao = false;
  if (!e.regimeDoContrato) { avisos.push('O regime jurídico não está cadastrado no contrato: confirme-o pelo processo de contratação (não pela data).'); revisao = true; }
  if (e.regime === 'OUTRO') { avisos.push('Regime jurídico a confirmar: a fundamentação legal específica deve ser validada pela assessoria jurídica.'); revisao = true; }
  if (!e.clausula.trim()) { avisos.push('Cláusula contratual não informada: indique a cláusula ou o item do termo de referência descumprido.'); revisao = true; }
  const legais = e.selecionados.filter((f) => f.regime !== 'MUNICIPAL');
  const municipais = e.selecionados.filter((f) => f.regime === 'MUNICIPAL' && (f.codigo !== 'MUN_DEC_7177_2023' || e.contratacaoDireta));
  if (!legais.length) { avisos.push('Nenhum fundamento legal selecionado.'); revisao = true; }
  if (e.selecionados.some((f) => f.regime === 'MUNICIPAL' && f.codigo === 'MUN_DEC_7177_2023') && !e.contratacaoDireta) {
    avisos.push('O Decreto nº 7.177/2023 só se aplica às contratações diretas por ele abrangidas: foi retirado da fundamentação.');
  }
  if (municipais.some((f) => f.revisao_pendente)) avisos.push('Normas municipais citadas de forma geral: indique artigos específicos somente após validação jurídica.');

  const linhas = legais.map((f) => `• ${citacao(f)}: ${f.texto}`);
  if (municipais.length) linhas.push(`• Observadas as disposições do ${municipais.map((m) => m.norma).join(', da ')}, no que couber.`);
  linhas.push(`• ${e.clausula.trim() ? `${e.clausula.trim()} do Contrato nº ${e.contratoNumero}` : `Cláusulas do Contrato nº ${e.contratoNumero}`}, bem como o edital, o termo de referência ou projeto básico e eventuais aditivos.`);

  const prazo = textoPrazo(e.prazoDias, e.prazoTipo, e.prazoRespostaDias);
  const prazoCurto = e.prazoDias ? `${e.prazoDias} (${extenso(e.prazoDias)}) dia${e.prazoDias > 1 ? 's' : ''} ${e.prazoTipo === 'UTEIS' ? 'úteis' : 'corridos'}` : '[PRAZO]';
  const modelo = (tipo: Modelo['tipo']) => e.modelos.find((m) => m.tipo === tipo && m.regime === e.regime)?.texto ?? e.modelos.find((m) => m.tipo === tipo && m.regime === 'OUTRO')?.texto ?? '';
  const medidas = juntar(medidasPossiveis(e.selecionados.map((f) => f.codigo), e.gravidade, e.regime));
  const preencher = (t: string) => t
    .replaceAll('{contrato}', `Contrato nº ${e.contratoNumero}`)
    .replaceAll('{clausula_texto}', e.clausula.trim() ? `, especialmente a ${e.clausula.trim()}` : '')
    .replaceAll('{prazo}', prazoCurto)
    .replaceAll('{prazo_resposta}', e.prazoRespostaDias ? `no prazo de ${e.prazoRespostaDias} dia${e.prazoRespostaDias > 1 ? 's' : ''} ${e.prazoTipo === 'UTEIS' ? 'úteis' : 'corridos'}, contado da ciência desta notificação` : 'no prazo concedido nesta notificação')
    .replaceAll('{medidas}', medidas);
  if (e.gravidade === 'GRAVE') avisos.push('Ocorrência grave: avalie, com a autoridade competente, a necessidade de apuração de responsabilidade.');
  return { fundamentacao: linhas.join('\n'), prazo_texto: prazo, consequencias: preencher(modelo('CONSEQUENCIAS')), manifestacao: preencher(modelo('MANIFESTACAO')), revisao_juridica: revisao, avisos };
}

/** Texto que não pode aparecer: declarar a empresa já penalizada (a notificação não aplica sanção) */
export const declaraPenalidade = (t: string) => /(fica|está|esta) (a empresa )?(penalizad|multad|declarad[ao] inid|impedid)/i.test(t);
