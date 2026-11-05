// Excel (.xlsx) e CSV. A biblioteca é carregada só quando a pessoa exporta/importa.
// Valores monetários vão como NÚMERO com formato R$ (dá para somar e filtrar no Excel).

export type TipoColuna = 'texto' | 'moeda' | 'data' | 'numero';
export interface Coluna<T> { titulo: string; valor: (l: T) => unknown; tipo?: TipoColuna; largura?: number }
export interface Aba<T> { nome: string; colunas: Coluna<T>[]; linhas: T[] }

const FORMATO_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

function paraData(v: unknown): Date | null {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

export async function baixarExcel(arquivo: string, abas: Array<Aba<any>>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MEASURE';
  wb.created = new Date();
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = aba.colunas.map((c) => ({
      header: c.titulo, width: c.largura ?? Math.min(60, Math.max(12, c.titulo.length + 4)),
      style: c.tipo === 'moeda' ? { numFmt: FORMATO_MOEDA } : c.tipo === 'data' ? { numFmt: 'dd/mm/yyyy' } : {},
    }));
    for (const l of aba.linhas) {
      ws.addRow(aba.colunas.map((c) => {
        const v = c.valor(l);
        if (c.tipo === 'moeda' || c.tipo === 'numero') return v === null || v === undefined || v === '' ? null : Number(v);
        if (c.tipo === 'data') return paraData(v);
        return v ?? '';
      }));
    }
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16335F' } };
    cab.alignment = { vertical: 'middle', wrapText: true };
    if (aba.linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } };
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.endsWith('.xlsx') ? arquivo : `${arquivo}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Lê .xlsx ou .csv e devolve as linhas como objetos (cabeçalho normalizado: minúsculo, sem acento, _) */
export async function lerPlanilha(arquivo: File): Promise<Array<Record<string, string>>> {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  let matriz: string[][];
  if (/\.csv$/i.test(arquivo.name) || arquivo.type === 'text/csv') {
    const texto = await arquivo.text();
    const sep = (texto.split('\n')[0] ?? '').split(';').length > (texto.split('\n')[0] ?? '').split(',').length ? ';' : ',';
    matriz = parseCsv(texto, sep);
  } else {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await arquivo.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    matriz = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const valores = (row.values as unknown[]).slice(1).map((v) => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (v && typeof v === 'object' && 'text' in (v as object)) return String((v as { text: string }).text);
        if (v && typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result ?? '');
        return v === null || v === undefined ? '' : String(v);
      });
      matriz.push(valores);
    });
  }
  const [cabecalho, ...linhas] = matriz;
  if (!cabecalho) return [];
  const chaves = cabecalho.map(norm);
  return linhas.filter((l) => l.some((c) => String(c).trim())).map((l) => Object.fromEntries(chaves.map((k, i) => [k, String(l[i] ?? '').trim()])));
}

function parseCsv(texto: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let campo = ''; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/** Converte "dd/mm/aaaa" ou "aaaa-mm-dd" para ISO; vazio → '' */
export function dataIso(v: string): string {
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
}
