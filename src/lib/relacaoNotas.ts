// Período da relação de notas (data de emissão): do primeiro dia do mês inicial ao último dia do mês final.
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** meses de 1 a 12 */
export function periodoDe(ano: number, de: number, ate: number) {
  const ultimo = new Date(Date.UTC(ano, ate, 0)).getUTCDate();
  return { inicio: `${ano}-${doisDigitos(de)}-01`, fim: `${ano}-${doisDigitos(ate)}-${doisDigitos(ultimo)}` };
}
