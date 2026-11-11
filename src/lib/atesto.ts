// Texto de atesto a partir do modelo configurado pelo órgão (variáveis entre chaves).
// Aceita as variáveis do modelo do órgão em maiúsculas ({NUMERO_NOTA}, {NOME EMPRESA}, {LOCAL_SERVIÇO}…)
// e as antigas em minúsculas ({nota}, {fornecedor}…). Os dados vêm do contrato, da nota e das unidades.
import { formatarCentavos, formatarData } from './formatacao';

const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 0 a 999 por extenso */
function ate999(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100); const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]!);
  if (r) partes.push(r < 20 ? UNIDADES[r]! : [DEZENAS[Math.floor(r / 10)]!, UNIDADES[r % 10]!].filter(Boolean).join(' e '));
  return partes.join(' e ');
}

/** Número inteiro por extenso (até a casa dos trilhões) */
export function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const escalas: Array<[string, string]> = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões']];
  const grupos: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const partes: Array<{ texto: string; valor: number }> = [];
  grupos.forEach((g, i) => {
    if (!g) return;
    const [sing, plur] = escalas[i]!;
    const texto = i === 0 ? ate999(g) : i === 1 ? (g === 1 ? 'mil' : `${ate999(g)} mil`) : `${ate999(g)} ${g === 1 ? sing : plur}`;
    partes.unshift({ texto, valor: g });
  });
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda (mil e cem, mil e cinquenta)
  return partes.map((p, i) => {
    if (i === 0) return p.texto;
    const ultimo = i === partes.length - 1;
    return (ultimo && (p.valor < 100 || p.valor % 100 === 0) ? ' e ' : ' ') + p.texto;
  }).join('');
}

/** Valor em reais por extenso, a partir de centavos inteiros (ex.: 150000 → "mil e quinhentos reais") */
export function valorPorExtenso(centavosTotal: number): string {
  const total = Math.round(Math.abs(centavosTotal));
  const reais = Math.floor(total / 100);
  const cents = total % 100;
  const partes: string[] = [];
  if (reais) {
    const milhoesRedondos = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${inteiroPorExtenso(reais)}${milhoesRedondos ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cents) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}

/** Lista em português: "a", "a e b", "a, b e c" */
function listar(itens: string[]) {
  return itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** Meses de referência agrupados por ano: "outubro de 2026", "setembro e outubro de 2026", "dezembro de 2025 e janeiro de 2026" */
export function mesesDeReferencia(meses: Array<{ ano: number; mes: number }>) {
  const ord = [...meses].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const anos = [...new Set(ord.map((m) => m.ano))];
  return listar(anos.map((a) => `${listar(ord.filter((m) => m.ano === a).map((m) => MESES_EXTENSO[m.mes - 1]!))} de ${a}`));
}

/** Primeira letra minúscula para o objeto entrar no meio da frase (preserva siglas como "UBS") */
function noMeioDaFrase(t: string) {
  const s = t.trim().replace(/[.;]+$/, '');
  return /^[A-ZÀ-Ú][a-zà-ú]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
}

/** Normaliza o nome da variável: {NOME EMPRESA}, {nome_empresa} e {LOCAL_SERVIÇO} viram NOME_EMPRESA e LOCAL_SERVICO */
const chave = (k: string) => k.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, '_');

export interface DadosAtesto {
  objeto: string; contrato: string; fornecedor: string; nota: string; valorCentavos: number; meses: Array<{ ano: number; mes: number }>;
  periodoInicio?: string | null; periodoFim?: string | null; processo?: string | null;
  /** vigência do contrato (fim já com os aditivos de prazo aprovados) */
  vigenciaInicio?: string | null; vigenciaFim?: string | null;
  /** unidades atendidas da nota (local do serviço) */
  locais?: string[];
}

/** Monta o texto do atesto a partir do modelo do órgão (variáveis entre chaves) */
export interface UnidadeDoAtesto { nome: string; sigla?: string | null; tipo?: string | null; valor?: number | string | null }

/** Identificação curta da unidade: a sigla cadastrada; sem sigla, o tipo (USF, CAPS...); sem tipo útil, o nome */
export function siglaDaUnidade(u: UnidadeDoAtesto) {
  const sigla = u.sigla?.trim();
  if (sigla) return sigla;
  const tipo = u.tipo?.trim() ?? '';
  // tipo útil é uma sigla em maiúsculas (USF, CAPS, SEDE); "Outra" e o genérico "UNIDADE" não identificam nada
  if (/^[A-ZÀ-Ú0-9/-]{2,12}$/.test(tipo) && tipo !== 'UNIDADE') return tipo;
  return u.nome;
}

/**
 * Locais do serviço para o texto do atesto. Nota com rateio: só as siglas, sem repetir (12 USFs e 2 CAPS viram
 * "USF" e "CAPS"). Sem rateio: o nome de cada unidade, como antes. Só muda o texto; os valores ficam como estão.
 */
export function locaisDoAtesto(unidades: UnidadeDoAtesto[]) {
  const rateada = unidades.some((u) => u.valor != null && u.valor !== '');
  if (!rateada) return unidades.map((u) => u.nome);
  return [...new Set(unidades.map(siglaDaUnidade))];
}

export function montarAtesto(modelo: string, decreto: string, d: DadosAtesto) {
  const ord = [...d.meses].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const mesesBarra = ord.map((m) => `${MESES_EXTENSO[m.mes - 1]}/${m.ano}`).join(', ');
  const periodo = d.periodoInicio && d.periodoFim ? ` (período de ${formatarData(d.periodoInicio)} a ${formatarData(d.periodoFim)})` : '';
  const pendente = '________';
  const valor = formatarCentavos(d.valorCentavos);
  const locais = (d.locais ?? []).filter(Boolean);
  const valores: Record<string, string> = {
    // modelo do órgão (maiúsculas)
    NUMERO_NOTA: d.nota || pendente,
    VALOR_NOTA: d.valorCentavos ? valor : pendente,
    VALOR_POR_EXTENSO: d.valorCentavos ? valorPorExtenso(d.valorCentavos) : pendente,
    NUMERO_CONTRATO: d.contrato,
    NOME_EMPRESA: d.fornecedor,
    DATA_INICIO: d.vigenciaInicio ? formatarData(d.vigenciaInicio) : pendente,
    DATA_FIM: d.vigenciaFim ? formatarData(d.vigenciaFim) : pendente,
    OBJETO_CONTRATO: noMeioDaFrase(d.objeto),
    LOCAL_SERVICO: locais.length ? listar(locais) : pendente,
    MES_REFERENCIA: ord.length ? mesesDeReferencia(ord) : pendente,
    PROCESSO: d.processo || pendente,
    DECRETO: decreto,
    // variáveis antigas (minúsculas), mantidas para modelos já salvos
    objeto: d.objeto, contrato: d.contrato, fornecedor: d.fornecedor, nota: d.nota, valor,
    meses: mesesBarra || '—', periodo, processo: d.processo || '—', decreto,
  };
  return modelo
    .replace(/\{([^{}\n]+)\}/g, (orig, k: string) => valores[k] ?? valores[chave(k)] ?? orig)
    .replace(/[ \t]+\./g, '.').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Variáveis disponíveis (exibidas em Configurações) */
export const VARIAVEIS_ATESTO: Array<[string, string]> = [
  ['{NUMERO_NOTA}', 'número da nota fiscal (com série)'],
  ['{VALOR_NOTA}', 'valor da nota (R$)'],
  ['{VALOR_POR_EXTENSO}', 'valor da nota por extenso'],
  ['{NUMERO_CONTRATO}', 'número do contrato'],
  ['{NOME_EMPRESA}', 'razão social do fornecedor'],
  ['{DATA_INICIO}', 'início da vigência do contrato'],
  ['{DATA_FIM}', 'fim da vigência atual (com aditivos)'],
  ['{OBJETO_CONTRATO}', 'objeto do contrato'],
  ['{LOCAL_SERVICO}', 'unidades atendidas da nota'],
  ['{MES_REFERENCIA}', 'mês(es) de referência da nota'],
  ['{PROCESSO}', 'processo administrativo'],
  ['{DECRETO}', 'texto do decreto configurado'],
];

// Textos padronizados da nota fiscal, prontos para copiar (além do texto de atesto do órgão)

/** Encaminhamento do atesto à administração (depois que o gestor/fiscal/suplente atesta) */
export const MODELO_ENCAMINHAMENTO_ATESTO = 'Prezados,\n\nAtesto, nota fiscal n° {NUMERO_NOTA} e toda documentação exigida no contrato, as quais estão devidamente conferidas.\n\nSegue para análise, providências e posterior encaminhamento ao setor financeiro.';

/** Decreto cuja documentação está em renovação, no processo do contrato */
export const MODELO_DECRETO_RENOVACAO = 'Prezados,\n\nDocumentação referente ao Decreto nº {NUMERO_DECRETO_01} encontra-se no processo de renovação através do processo nº {NUMERO_PROCESSO_CONTRATO}.';

const PENDENTE = '________';
const preencher = (modelo: string, valores: Record<string, string | null | undefined>) =>
  modelo.replace(/\{([A-Z0-9_]+)\}/g, (orig, k: string) => (k in valores ? valores[k]?.trim() || PENDENTE : orig));

export function textoEncaminhamentoAtesto(numeroNota: string) {
  return preencher(MODELO_ENCAMINHAMENTO_ATESTO, { NUMERO_NOTA: numeroNota });
}

export function textoDecretoRenovacao(numeroDecreto: string | null | undefined, processoContrato: string | null | undefined) {
  return preencher(MODELO_DECRETO_RENOVACAO, { NUMERO_DECRETO_01: numeroDecreto, NUMERO_PROCESSO_CONTRATO: processoContrato });
}
