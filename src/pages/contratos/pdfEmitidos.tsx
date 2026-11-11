// Gera o PDF de um documento emitido (extratos, checklist) a partir da mesma folha da página de impressão.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { pdfDoElemento } from '@/lib/pdfDaImpressao';
import type { DocumentoEmitido } from '@/lib/tipos';
import { urlArquivo } from '@/services/api';
import { FolhaImpressao } from './Imprimir';

const EXTRATOS = ['EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO'];

export async function pdfDoEmitido(qc: QueryClient, doc: DocumentoEmitido, aoGerarPagina?: (png: string) => void) {
  // o brasão já entra no cache antes de montar a folha (a imagem é privada, por URL temporária)
  const logo = (doc.dados as { orgao?: { logo_path?: string | null } }).orgao?.logo_path;
  if (logo) await qc.fetchQuery({ queryKey: ['url', 'arquivos', logo], queryFn: () => urlArquivo('arquivos', logo), staleTime: 45 * 60_000 }).catch(() => null);
  const caixa = document.createElement('div');
  caixa.setAttribute('aria-hidden', 'true');
  Object.assign(caixa.style, { position: 'fixed', left: '-20000px', top: '0', pointerEvents: 'none', background: '#fff' });
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  try {
    raiz.render(<QueryClientProvider client={qc}><FolhaImpressao doc={doc} /></QueryClientProvider>);
    await new Promise((ok) => setTimeout(ok, 60));
    const folha = caixa.querySelector<HTMLElement>('article');
    if (!folha) throw { erro: 'O documento não foi montado. Nada foi salvo.' };
    folha.classList.remove('shadow-lg');
    const extrato = EXTRATOS.includes(doc.tipo);
    return await pdfDoElemento(folha, { paisagem: extrato || doc.tipo === 'CONSOLIDADO_MENSAL', rodape: extrato ? '.extrato-rodape' : null, repetirCabecalho: extrato, aoGerarPagina });
  } finally {
    raiz.unmount();
    caixa.remove();
  }
}

/** Confere se o extrato saiu completo (dados do contrato e lista de notas) */
export function extratoValido(doc: DocumentoEmitido, tipo: string) {
  const d = doc.dados as { contrato?: unknown; notas?: unknown };
  return doc.tipo === tipo && !!d.contrato && Array.isArray(d.notas);
}
