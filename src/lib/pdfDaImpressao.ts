// Gera o PDF a partir da mesma página de impressão do sistema (sem mudar conteúdo nem formatação):
// monta o documento fora da tela, fotografa em alta resolução e reparte em páginas A4, cortando entre
// linhas, repetindo o cabeçalho da tabela e o rodapé em cada página, como na impressão do navegador.
import { jsPDF } from 'jspdf';

/** Onde cortar: a maior borda inferior de linha que cabe na página (sem nenhuma, corta no limite) */
export function calcularCortes(candidatos: number[], alturaTotal: number, alturaPagina: (indice: number, inicio: number) => number) {
  const bordas = [...new Set(candidatos.filter((c) => c > 0 && c < alturaTotal))].sort((a, b) => a - b);
  const cortes: Array<[number, number]> = [];
  let inicio = 0;
  while (inicio < alturaTotal - 1 && cortes.length < 500) {
    const limite = inicio + alturaPagina(cortes.length, inicio);
    if (limite >= alturaTotal) { cortes.push([inicio, alturaTotal]); break; }
    const corte = [...bordas].reverse().find((b) => b > inicio + 20 && b <= limite) ?? limite;
    cortes.push([inicio, corte]);
    inicio = corte;
  }
  return cortes;
}

const topoRelativo = (el: Element, raiz: Element) => el.getBoundingClientRect().top - raiz.getBoundingClientRect().top;

/** Espera as imagens (brasão) carregarem e o navegador desenhar */
async function esperarPronto(raiz: HTMLElement, limiteMs = 8000) {
  const inicio = Date.now();
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  while (Date.now() - inicio < limiteMs) {
    const imgs = [...raiz.querySelectorAll('img')];
    if (imgs.every((i) => i.complete && i.naturalWidth > 0)) break;
    await new Promise((ok) => setTimeout(ok, 120));
  }
  await Promise.all([...raiz.querySelectorAll('img')].map((i) => i.decode().catch(() => undefined)));
  await document.fonts?.ready;
}

export async function pdfDoElemento(raiz: HTMLElement, opcoes: { paisagem: boolean; rodape?: string | null; repetirCabecalho?: boolean; aoGerarPagina?: (png: string) => void }) {
  const { toCanvas } = await import('html-to-image');
  await esperarPronto(raiz);
  const larguraPx = raiz.offsetWidth;
  const alturaPx = raiz.scrollHeight;
  const escala = 2;
  const tela = await toCanvas(raiz, { pixelRatio: escala, backgroundColor: '#ffffff', cacheBust: true, width: larguraPx, height: alturaPx });
  const alturaPaginaPx = larguraPx * (opcoes.paisagem ? 210 / 297 : 297 / 210);

  // rodapé fixo (repetido em cada página) e cabeçalho da tabela principal
  const rodape = opcoes.rodape ? raiz.querySelector<HTMLElement>(opcoes.rodape) : null;
  const rodapeTopo = rodape ? topoRelativo(rodape, raiz) : alturaPx;
  const rodapeAltura = rodape ? rodape.offsetHeight : 0;
  // o PDF termina no fim real do conteúdo: a altura mínima de folha A4 não pode gerar página em branco
  const ultimoConteudo = Math.max(0, ...[...raiz.querySelectorAll<HTMLElement>('*')]
    .filter((e) => e !== rodape && !rodape?.contains(e) && e.offsetHeight > 0 && e.tagName !== 'STYLE')
    .map((e) => topoRelativo(e, raiz) + e.offsetHeight));
  const margemFinal = parseFloat(getComputedStyle(raiz).paddingBottom) || 0;
  const fimConteudo = Math.min(rodape ? rodapeTopo : alturaPx, Math.ceil(ultimoConteudo + margemFinal));
  const cab = opcoes.repetirCabecalho ? [...raiz.querySelectorAll<HTMLElement>('thead')].find((t) => t.closest('table')?.querySelector('tbody tr td')) ?? null : null;
  const cabTopo = cab ? topoRelativo(cab, raiz) : 0;
  const cabAltura = cab ? cab.offsetHeight : 0;
  const tabelaFim = cab ? topoRelativo(cab.closest('table')!, raiz) + cab.closest('table')!.offsetHeight : 0;
  const repete = (inicio: number) => !!cab && inicio > cabTopo + cabAltura && inicio < tabelaFim;

  // blocos marcados para não dividir na impressão (quadro de totais, assinaturas...) não são cortados ao meio:
  // dá para cortar antes deles, nunca dentro
  const blocos = [...raiz.querySelectorAll<HTMLElement>('.break-inside-avoid')].filter((e) => e.tagName !== 'TR')
    .map((e) => [topoRelativo(e, raiz), topoRelativo(e, raiz) + e.offsetHeight] as const);
  const dentroDeBloco = (y: number) => blocos.some(([t, b]) => y > t + 0.5 && y < b - 0.5);
  const candidatos = [...raiz.querySelectorAll('tr, p, h1, h2, h3, header, section, li, .break-inside-avoid')]
    .map((e) => topoRelativo(e, raiz) + (e as HTMLElement).offsetHeight)
    .concat(blocos.map(([t]) => t))
    .filter((y) => !dentroDeBloco(y));
  const cortes = calcularCortes(candidatos, fimConteudo, (_i, inicio) => alturaPaginaPx - rodapeAltura - (repete(inicio) ? cabAltura : 0) - 2);

  const pdf = new jsPDF({ orientation: opcoes.paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  const mmPorPx = pdf.internal.pageSize.getWidth() / larguraPx;
  cortes.forEach(([inicio, fim], i) => {
    if (i > 0) pdf.addPage();
    const pagina = document.createElement('canvas');
    pagina.width = Math.round(larguraPx * escala);
    pagina.height = Math.round(alturaPaginaPx * escala);
    const ctx = pagina.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pagina.width, pagina.height);
    let y = 0;
    if (i > 0 && repete(inicio)) {
      ctx.drawImage(tela, 0, cabTopo * escala, tela.width, cabAltura * escala, 0, 0, pagina.width, cabAltura * escala);
      y = cabAltura * escala;
    }
    ctx.drawImage(tela, 0, inicio * escala, tela.width, (fim - inicio) * escala, 0, y, pagina.width, (fim - inicio) * escala);
    if (rodape) {
      ctx.drawImage(tela, 0, rodapeTopo * escala, tela.width, rodapeAltura * escala, 0, pagina.height - rodapeAltura * escala, pagina.width, rodapeAltura * escala);
    }
    const png = pagina.toDataURL('image/png');
    opcoes.aoGerarPagina?.(png);
    pdf.addImage(png, 'PNG', 0, 0, larguraPx * mmPorPx, alturaPaginaPx * mmPorPx, undefined, 'FAST');
  });
  return pdf.output('blob');
}
