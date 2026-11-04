import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { traduzirErro } from '@/lib/erros';
import { AreaTexto, Botao, CaixaErro, cx } from './basicos';

export function Modal({ aberto, aoFechar, titulo, descricao, children, rodape, largura = 'md' }: {
  aberto: boolean; aoFechar: () => void; titulo: string; descricao?: ReactNode; children: ReactNode;
  rodape?: ReactNode; largura?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    // foca o primeiro campo
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-fechar])')?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      anterior?.focus();
    };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-titulo"
        className={cx('flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl',
          { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }[largura])}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="modal-titulo" className="text-base font-semibold text-slate-900">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-slate-600">{descricao}</p>}
          </div>
          <button data-fechar type="button" onClick={aoFechar} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{rodape}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmação de operação sensível, com motivo obrigatório (vai para a auditoria). */
export function ConfirmarComMotivo({ aberto, aoFechar, titulo, descricao, rotuloConfirmar = 'Confirmar', perigo = true, minimo = 5, aoConfirmar }: {
  aberto: boolean; aoFechar: () => void; titulo: string; descricao: ReactNode; rotuloConfirmar?: string;
  perigo?: boolean; minimo?: number; aoConfirmar: (motivo: string) => Promise<unknown>;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (aberto) { setMotivo(''); setErro(null); } }, [aberto]);
  const curto = motivo.trim().length < minimo;
  const confirmar = async () => {
    setEnviando(true); setErro(null);
    try { await aoConfirmar(motivo.trim()); aoFechar(); }
    catch (e) { setErro(traduzirErro(e).mensagem); }
    finally { setEnviando(false); }
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura="sm"
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante={perigo ? 'perigo' : 'primario'} disabled={curto} carregando={enviando} onClick={confirmar}>{rotuloConfirmar}</Botao>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="text-sm text-slate-700">{descricao}</div>
        <AreaTexto rotulo={minimo > 0 ? 'Motivo' : 'Motivo (opcional)'} obrigatorio={minimo > 0} value={motivo}
          onChange={(e) => setMotivo(e.target.value)} maxLength={500}
          ajuda={minimo > 0 ? `Fica registrado na auditoria. Mínimo de ${minimo} caracteres.` : 'Fica registrado na auditoria.'} />
        {erro && <CaixaErro mensagem={erro} />}
      </div>
    </Modal>
  );
}
