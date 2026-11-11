// PDFs do patrimônio (relatórios, termos e histórico) com o timbre configurado do órgão: brasão, linhas do
// cabeçalho, setor responsável, rodapé, data e responsável pela emissão e paginação em todas as páginas.
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { urlArquivo } from '@/services/api';
import type { Timbre } from '@/services/patrimonio';

/** As fontes padrão do PDF usam Latin-1: troca o que está fora dele (travessões, aspas curvas) por equivalentes */
export const t = (s: unknown): string => String(s ?? '')
  .replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

async function dataUrl(caminho: string | null) {
  if (!caminho) return null;
  try {
    const url = await urlArquivo('arquivos', caminho);
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    return await new Promise<{ dados: string; formato: string; w: number; h: number } | null>((ok) => {
      const leitor = new FileReader();
      leitor.onload = () => {
        const img = new Image();
        img.onload = () => ok({ dados: String(leitor.result), formato: blob.type.includes('png') ? 'PNG' : 'JPEG', w: img.width, h: img.height });
        img.onerror = () => ok(null);
        img.src = String(leitor.result);
      };
      leitor.onerror = () => ok(null);
      leitor.readAsDataURL(blob);
    });
  } catch { return null; }
}

export interface Emissao { titulo: string; subtitulo?: string; emitidoPor: string; paisagem?: boolean; numero?: string }

const MARGEM = 14;
const TOPO = 40;

/** Documento com espaço reservado para o cabeçalho; o timbre é desenhado em todas as páginas no final */
export async function novoDocumento(timbre: Timbre, e: Emissao) {
  const doc = new jsPDF({ orientation: e.paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const logo = await dataUrl(timbre.logo_path);
  const finalizar = () => {
    const total = doc.getNumberOfPages();
    const larg = doc.internal.pageSize.getWidth();
    const alt = doc.internal.pageSize.getHeight();
    const emitido = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      let x = MARGEM;
      if (logo) {
        const h = 18; const w = Math.min(30, (logo.w / logo.h) * h);
        doc.addImage(logo.dados, logo.formato, MARGEM, 8, w, h);
        x = MARGEM + w + 4;
      }
      const linhas = [
        ...(timbre.cabecalho?.length ? timbre.cabecalho : [timbre.nome_oficial]),
        timbre.secretaria, timbre.orgao_fundo, timbre.setor,
      ].filter((l): l is string => !!l && !!l.trim());
      doc.setTextColor(30);
      linhas.slice(0, 4).forEach((l, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.setFontSize(i === 0 ? 10 : 8.5);
        doc.text(t(l), x, 11 + i * 4.2);
      });
      doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(MARGEM, 29, larg - MARGEM, 29);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
      doc.text(t(e.titulo), larg / 2, 34.5, { align: 'center' });
      if (e.subtitulo) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(t(e.subtitulo), larg / 2, 38.5, { align: 'center' }); }
      // rodapé
      doc.setDrawColor(200); doc.line(MARGEM, alt - 14, larg - MARGEM, alt - 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
      const endereco = [timbre.endereco, timbre.cidade && timbre.uf ? `${timbre.cidade}/${timbre.uf}` : timbre.cidade, timbre.cep ? `CEP ${timbre.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : null,
        timbre.contato ?? timbre.telefone, timbre.email].filter(Boolean).join(' · ');
      if (timbre.rodape) doc.text(t(timbre.rodape), MARGEM, alt - 10.5, { maxWidth: larg - 2 * MARGEM - 30 });
      else if (endereco) doc.text(t(endereco), MARGEM, alt - 10.5, { maxWidth: larg - 2 * MARGEM - 30 });
      doc.text(t(`Emitido em ${emitido} por ${e.emitidoPor}${e.numero ? ` · ${e.numero}` : ''}`), MARGEM, alt - 6.5);
      doc.text(`Página ${p} de ${total}`, larg - MARGEM, alt - 6.5, { align: 'right' });
    }
    return doc.output('blob');
  };
  return { doc, finalizar, larguraUtil: doc.internal.pageSize.getWidth() - 2 * MARGEM };
}

export function tabela(doc: jsPDF, inicioY: number, head: string[], body: Array<Array<string | number | null | undefined>>, opcoes: { fonte?: number; colunas?: Record<number, { cellWidth?: number | 'auto'; halign?: 'left' | 'right' | 'center' }> } = {}) {
  autoTable(doc, {
    startY: inicioY, head: [head.map(t)], body: body.map((l) => l.map((c) => t(c ?? '—'))) as RowInput[],
    margin: { top: TOPO + 2, bottom: 18, left: MARGEM, right: MARGEM },
    styles: { font: 'helvetica', fontSize: opcoes.fonte ?? 7.5, cellPadding: 1.4, overflow: 'linebreak', lineColor: [220, 220, 220], lineWidth: 0.1 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    columnStyles: opcoes.colunas,
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Bloco de texto com quebra e troca de página automática; devolve o novo y */
export function paragrafo(doc: jsPDF, y: number, texto: string, opcoes: { negrito?: boolean; tamanho?: number; largura?: number } = {}) {
  const alt = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', opcoes.negrito ? 'bold' : 'normal'); doc.setFontSize(opcoes.tamanho ?? 9); doc.setTextColor(25);
  const linhas = doc.splitTextToSize(t(texto), opcoes.largura ?? doc.internal.pageSize.getWidth() - 2 * MARGEM) as string[];
  for (const l of linhas) {
    if (y > alt - 22) { doc.addPage(); y = TOPO + 4; }
    doc.text(l, MARGEM, y);
    y += (opcoes.tamanho ?? 9) * 0.45;
  }
  return y + 1.5;
}

export function garantirEspaco(doc: jsPDF, y: number, precisa: number) {
  if (y + precisa > doc.internal.pageSize.getHeight() - 22) { doc.addPage(); return TOPO + 4; }
  return y;
}

/** Linhas para assinatura manuscrita lado a lado */
export function assinaturas(doc: jsPDF, y: number, quem: Array<{ papel: string; nome?: string | null; matricula?: string | null }>) {
  y = garantirEspaco(doc, y, 34);
  const larg = doc.internal.pageSize.getWidth() - 2 * MARGEM;
  const porLinha = Math.min(quem.length, 3);
  const w = larg / porLinha;
  quem.forEach((q, i) => {
    const col = i % porLinha;
    const lin = Math.floor(i / porLinha);
    const x = MARGEM + col * w;
    const yy = y + 18 + lin * 30;
    doc.setDrawColor(60); doc.setLineWidth(0.3); doc.line(x + 4, yy, x + w - 4, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(t(q.papel), x + w / 2, yy + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    if (q.nome) doc.text(t(q.nome), x + w / 2, yy + 8, { align: 'center', maxWidth: w - 8 });
    if (q.matricula) doc.text(t(`Matrícula ${q.matricula}`), x + w / 2, yy + 11.5, { align: 'center' });
    doc.text('Data: ____/____/________', x + w / 2, yy + 15.5, { align: 'center' });
  });
  return y + 18 + Math.ceil(quem.length / porLinha) * 30;
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const TOPO_CONTEUDO = TOPO + 4;
export const MARGEM_PDF = MARGEM;
