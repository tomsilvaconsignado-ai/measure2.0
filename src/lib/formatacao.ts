// Formatação no padrão brasileiro. Valores monetários trafegam como centavos inteiros (sem
// ponto flutuante) e só viram texto na exibição.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" (o Intl usa espaço não separável; trocamos por espaço comum) */
export function formatarCentavos(centavos: number | bigint | null | undefined): string {
  const n = Number(centavos ?? 0);
  return BRL.format(n / 100).replace(/ /g, ' ');
}

/** "R$ 1.234,56" | "1234,56" | "1.234" → 123456 centavos (null se vazio/inválido) */
export function centavosDeTexto(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  if (!limpo || !/\d/.test(limpo)) return null;
  const negativo = limpo.startsWith('-');
  const [inteira, decimal = ''] = limpo.replace(/-/g, '').replace(/\./g, '').split(',');
  const centavos = Number(inteira || '0') * 100 + Number((decimal + '00').slice(0, 2));
  return negativo ? -centavos : centavos;
}

/** Máscara de digitação: cada dígito empurra da direita ("1" → R$ 0,01; "123" → R$ 1,23) */
export function mascaraMoeda(digitado: string): { texto: string; centavos: number } {
  const digitos = digitado.replace(/\D/g, '').replace(/^0+/, '').slice(0, 15);
  const centavos = Number(digitos || '0');
  return { texto: formatarCentavos(centavos), centavos };
}

export const somenteDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function formatarCnpj(v: string | null | undefined): string {
  const d = somenteDigitos(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatarCpf(v: string | null | undefined): string {
  const d = somenteDigitos(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatarCep(v: string | null | undefined): string {
  const d = somenteDigitos(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}

export function formatarTelefone(v: string | null | undefined): string {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

/** Dígitos verificadores do CNPJ */
export function cnpjValido(v: string): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((s, c, i) => s + Number(c) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12));
  const d2 = calc(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

/** Dígitos verificadores do CPF */
export function cpfValido(v: string): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const soma = d.slice(0, n).split('').reduce((s, c, i) => s + Number(c) * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

const FUSO = 'America/Sao_Paulo';

/** Data e hora no horário de Brasília */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

/** Data de calendário (AAAA-MM-DD) sem deslocar o dia pelo fuso */
export function formatarData(data: string | null | undefined): string {
  if (!data) return '—';
  const m = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO }).format(new Date(data));
}

export function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}
