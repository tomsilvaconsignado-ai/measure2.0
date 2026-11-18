// Planilha do relatório de custos por unidade de saúde, com a identidade do MEASURE: título, subtotal por
// unidade, total geral, valores como número em R$ (dá para somar e filtrar) e as regras de distribuição.
import { formatarCnpj, formatarCpf, formatarData } from '@/lib/formatacao';
import { FORMAS, MESES_CURTOS, type LinhaCusto, type ResumoCustos } from '@/lib/custosUnidades';

const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const AZUL = 'FF0F2A4A'; const AZUL_CLARO = 'FFE8EEF8'; const ZEBRA = 'FFF6F8FC'; const AMARELO = 'FFF5B70A';
const doc = (tipo: string, d: string) => (tipo === 'PF' ? formatarCpf(d) : formatarCnpj(d));
const r$ = (centavos: number) => centavos / 100;

export async function exportarCustosUnidades(p: {
  resumo: ResumoCustos; linhas: LinhaCusto[]; orgao: string; periodo: string; criterios: string[]; emitidoPor: string;
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MEASURE'; wb.created = new Date();
  const { resumo } = p;
  const meses = resumo.meses;
  const varios = meses.length > 1;
  const emitido = `Emitido em ${new Date().toLocaleString('pt-BR')} por ${p.emitidoPor}`;
  type Ws = ReturnType<typeof wb.addWorksheet>;

  // cabeçalho padrão: título, órgão/período, linha em branco; devolve a linha do cabeçalho da tabela
  const titulo = (ws: Ws, texto: string, colunas: number) => {
    ws.mergeCells(1, 1, 1, colunas); ws.mergeCells(2, 1, 2, colunas); ws.mergeCells(3, 1, 3, colunas);
    const t = ws.getCell(1, 1);
    t.value = texto; t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; t.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 26;
    const s = ws.getCell(2, 1);
    s.value = `${p.orgao} · Período: ${p.periodo} (mês de competência das notas fiscais)`; s.font = { bold: true, color: { argb: AZUL } };
    const e = ws.getCell(3, 1); e.value = emitido; e.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    return 5;
  };
  const cabecalho = (ws: Ws, linha: number, nomes: string[]) => {
    const r = ws.getRow(linha);
    nomes.forEach((n, i) => { r.getCell(i + 1).value = n; });
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.alignment = { vertical: 'middle', wrapText: true };
    r.eachCell((cel) => { cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16335F' } }; });
    r.height = 30;
    ws.views = [{ state: 'frozen', ySplit: linha }];
  };
  const pintar = (r: { eachCell: (f: (c: { fill: unknown; font: unknown }) => void) => void }, cor: string, negrito = false, branco = false) =>
    r.eachCell((cel) => { cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }; if (negrito || branco) cel.font = { bold: negrito, color: { argb: branco ? 'FFFFFFFF' : 'FF0F172A' } }; });
  const colsMeses = varios ? meses.map((m) => MESES_CURTOS[m - 1]!) : [];
  const valoresMeses = (m: Record<number, number>) => (varios ? meses.map((x) => r$(m[x] ?? 0)) : []);

  // 1. Custos por unidade (detalhado)
  {
    const ws = wb.addWorksheet('Custos por unidade');
    const nomes = ['Unidade de saúde', 'Tipo', 'Empresa', 'CNPJ/CPF', 'Contrato', 'Objeto', ...colsMeses, 'Total', 'Forma de distribuição'];
    let linha = titulo(ws, 'INFORMAÇÕES DE CUSTOS DAS UNIDADES', nomes.length);
    cabecalho(ws, linha, nomes);
    ws.columns = nomes.map((n, i) => ({ width: [34, 10, 36, 20, 13, 44][i] ?? (n === 'Forma de distribuição' ? 40 : 15) }));
    const iTotal = 7 + colsMeses.length;
    for (const u of resumo.unidades) {
      u.itens.forEach((it, k) => {
        linha++;
        const r = ws.getRow(linha);
        r.values = [u.nome, u.tipo ?? '', it.fornecedor_nome, doc(it.fornecedor_tipo, it.fornecedor_documento), it.contrato_numero, it.contrato_objeto,
          ...valoresMeses(it.meses), r$(it.total), it.formas.map((f) => FORMAS[f]).join('; ')];
        if (k % 2) pintar(r, ZEBRA);
      });
      linha++;
      const sub = ws.getRow(linha);
      sub.values = [`Subtotal · ${u.nome}`, '', `${u.empresas} empresa(s)`, '', '', '', ...valoresMeses(u.meses), r$(u.total), ''];
      pintar(sub, AZUL_CLARO, true);
    }
    linha++;
    const tot = ws.getRow(linha);
    tot.values = ['TOTAL GERAL', '', `${resumo.empresas.length} empresa(s)`, '', '', `${resumo.unidades.length} unidade(s)`, ...valoresMeses(resumo.porMes), r$(resumo.total), ''];
    pintar(tot, AZUL, true, true);
    for (let i = 7; i <= iTotal; i++) ws.getColumn(i).numFmt = MOEDA;
    ws.getColumn(6).alignment = { wrapText: true, vertical: 'top' };
  }

  // 2. Resumo por unidade
  {
    const ws = wb.addWorksheet('Resumo por unidade');
    const nomes = ['Unidade de saúde', 'Tipo', 'Empresas', ...colsMeses, 'Total', '% do total'];
    let linha = titulo(ws, 'RESUMO DE CUSTOS POR UNIDADE DE SAÚDE', nomes.length);
    cabecalho(ws, linha, nomes);
    ws.columns = nomes.map((_, i) => ({ width: [38, 10, 10][i] ?? 15 }));
    resumo.unidades.forEach((u, k) => {
      linha++;
      const r = ws.getRow(linha);
      r.values = [u.nome, u.tipo ?? '', u.empresas, ...valoresMeses(u.meses), r$(u.total), resumo.total ? u.total / resumo.total : 0];
      if (k % 2) pintar(r, ZEBRA);
    });
    linha++;
    const tot = ws.getRow(linha);
    tot.values = ['TOTAL GERAL', '', resumo.empresas.length, ...valoresMeses(resumo.porMes), r$(resumo.total), 1];
    pintar(tot, AZUL, true, true);
    for (let i = 4; i <= 4 + colsMeses.length; i++) ws.getColumn(i).numFmt = MOEDA;
    ws.getColumn(nomes.length).numFmt = '0.0%';
  }

  // 3. Resumo por empresa
  {
    const ws = wb.addWorksheet('Resumo por empresa');
    const nomes = ['Empresa', 'CNPJ/CPF', 'Contratos', 'Unidades atendidas', ...colsMeses, 'Total', '% do total'];
    let linha = titulo(ws, 'RESUMO DE CUSTOS POR EMPRESA', nomes.length);
    cabecalho(ws, linha, nomes);
    ws.columns = nomes.map((_, i) => ({ width: [38, 20, 18, 12][i] ?? 15 }));
    resumo.empresas.forEach((e, k) => {
      linha++;
      const r = ws.getRow(linha);
      r.values = [e.nome, doc(e.tipo, e.documento), e.contratos.join(', '), e.unidades.length, ...valoresMeses(e.meses), r$(e.total), resumo.total ? e.total / resumo.total : 0];
      if (k % 2) pintar(r, ZEBRA);
    });
    linha++;
    const tot = ws.getRow(linha);
    tot.values = ['TOTAL GERAL', '', '', resumo.unidades.length, ...valoresMeses(resumo.porMes), r$(resumo.total), 1];
    pintar(tot, AZUL, true, true);
    for (let i = 5; i <= 5 + colsMeses.length; i++) ws.getColumn(i).numFmt = MOEDA;
    ws.getColumn(nomes.length).numFmt = '0.0%';
  }

  // 4. Notas (detalhe, para conferência)
  {
    const ws = wb.addWorksheet('Notas (detalhe)');
    const nomes = ['Competência', 'Unidade de saúde', 'Empresa', 'CNPJ/CPF', 'Contrato', 'Nota fiscal', 'Data da nota', 'Forma de distribuição', 'Valor distribuído', 'Pago (proporcional)'];
    let linha = titulo(ws, 'NOTAS FISCAIS DISTRIBUÍDAS POR UNIDADE (CONFERÊNCIA)', nomes.length);
    cabecalho(ws, linha, nomes);
    ws.columns = [12, 34, 36, 20, 13, 12, 12, 40, 16, 16].map((w) => ({ width: w }));
    p.linhas.forEach((l, k) => {
      linha++;
      const r = ws.getRow(linha);
      r.values = [`${String(l.mes).padStart(2, '0')}/${l.ano}`, l.unidade_nome, l.fornecedor_nome, doc(l.fornecedor_tipo, l.fornecedor_documento), l.contrato_numero,
        l.nota_numero, formatarData(l.data_emissao), FORMAS[l.forma], Number(l.valor), Number(l.pago)];
      if (k % 2) pintar(r, ZEBRA);
    });
    ws.getColumn(9).numFmt = MOEDA; ws.getColumn(10).numFmt = MOEDA;
    if (p.linhas.length) ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: nomes.length } };
  }

  // 5. Critérios e regras
  {
    const ws = wb.addWorksheet('Critérios e regras');
    ws.columns = [{ width: 110 }];
    titulo(ws, 'CRITÉRIOS DA CONSULTA E REGRAS DE DISTRIBUIÇÃO', 1);
    const linhas = [
      'CRITÉRIOS', ...p.criterios, '',
      'COMO OS VALORES SÃO DISTRIBUÍDOS',
      'Consideradas as notas fiscais registradas e não canceladas, pelo mês de competência (mês de referência da nota).',
      'Nota com mais de um mês de referência: o valor é dividido igualmente entre os meses. Sem mês de referência: vale o mês da emissão.',
      ...Object.values(FORMAS).map((f) => `• ${f}`),
      '"Dividido igualmente": a nota indicou várias unidades sem informar o valor de cada uma. Para custo exato, informe o rateio na nota.',
      '"Lançado no grupo": a nota indicou um grupo (ex.: USF) sem as unidades; o valor fica no grupo.',
      'O valor pago acompanha a mesma proporção do valor da nota.',
    ];
    linhas.forEach((t, i) => {
      const cel = ws.getCell(5 + i, 1);
      cel.value = t; cel.alignment = { wrapText: true };
      if (t === 'CRITÉRIOS' || t === 'COMO OS VALORES SÃO DISTRIBUÍDOS') { cel.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16335F' } }; }
    });
    ws.getCell(4, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `custos-por-unidade-${p.periodo.replace(/\s+/g, '-')}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
