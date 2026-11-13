import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Lock } from 'lucide-react';
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { ListaSelecao } from './ListaSelecao';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
export { cx };
export { ListaSelecao };

// Identidade visual: azul-marinho para a ação principal, amarelo de chamada para o próximo passo do fluxo
// (e para ação pendente), verde para concluir/confirmar, vermelho para operações de risco.
type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'chamada' | 'sucesso';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-800 text-white shadow-sm hover:bg-marca-900 disabled:bg-marca-300 disabled:shadow-none',
  secundario: 'bg-white text-marca-900 border border-slate-300 shadow-sm hover:border-marca-400 hover:bg-marca-50 disabled:text-slate-400 disabled:shadow-none',
  perigo: 'bg-red-700 text-white shadow-sm hover:bg-red-800 disabled:bg-red-300 disabled:shadow-none',
  fantasma: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  chamada: 'bg-chamada-500 font-bold text-marca-950 shadow-sm hover:bg-chamada-400 disabled:bg-chamada-300 disabled:text-marca-950/50',
  sucesso: 'bg-acento-600 font-semibold text-white shadow-sm hover:bg-acento-700 disabled:bg-acento-300',
};

export const Botao = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante; carregando?: boolean; icone?: ReactNode; pequeno?: boolean;
  /** ação pendente: anel e ponto pulsante até a ação ser feita */
  destaque?: boolean;
}>(function Botao({ variante = 'primario', carregando, icone, pequeno, destaque, className, children, disabled, type = 'button', ...resto }, ref) {
  // ação pendente do fluxo: vira a chamada amarela, com anel e ponto pulsante
  const v: Variante = destaque && !disabled && (variante === 'primario' || variante === 'secundario') ? 'chamada' : variante;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      data-variante={v}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        pequeno ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm', VARIANTES[v], destaque && !disabled && 'relative ring-2 ring-chamada-400 ring-offset-2', className)}
      {...resto}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icone}
      {children}
      {destaque && !disabled && <PontoPendente className="absolute -right-1.5 -top-1.5" rotulo="Ação pendente" />}
    </button>
  );
});

interface PropsCampo { rotulo: string; erro?: string | null; ajuda?: ReactNode; obrigatorio?: boolean; className?: string }

function Moldura({ id, rotulo, erro, ajuda, obrigatorio, className, children }: PropsCampo & { id: string; children: ReactNode }) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {rotulo}{obrigatorio && <span className="text-red-600" aria-hidden> *</span>}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="flex items-start gap-1 text-xs text-red-700" role="alert">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />{erro}
        </p>
      ) : ajuda ? <p id={`${id}-ajuda`} className="text-xs text-slate-500">{ajuda}</p> : null}
    </div>
  );
}

const estiloEntrada = (erro?: string | null) => cx(
  'w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500',
  erro ? 'border-red-500 focus:outline-red-600' : 'border-slate-300',
);

export const Campo = forwardRef<HTMLInputElement, PropsCampo & InputHTMLAttributes<HTMLInputElement>>(
  function Campo({ rotulo, erro, ajuda, obrigatorio, className, id, ...resto }, ref) {
    const gerado = useId();
    const cid = id ?? gerado;
    return (
      <Moldura id={cid} rotulo={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
        <input ref={ref} id={cid} required={obrigatorio} aria-invalid={!!erro}
          aria-describedby={erro ? `${cid}-erro` : ajuda ? `${cid}-ajuda` : undefined}
          className={cx(estiloEntrada(erro), 'h-10')} {...resto} />
      </Moldura>
    );
  });

export function AreaTexto({ rotulo, erro, ajuda, obrigatorio, className, id, ...resto }: PropsCampo & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const gerado = useId();
  const cid = id ?? gerado;
  return (
    <Moldura id={cid} rotulo={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
      <textarea id={cid} required={obrigatorio} aria-invalid={!!erro} className={cx(estiloEntrada(erro), 'min-h-20 py-2')} {...resto} />
    </Moldura>
  );
}

export function Selecao({ rotulo, erro, ajuda, obrigatorio, className, id, children, ...resto }: PropsCampo & SelectHTMLAttributes<HTMLSelectElement>) {
  const gerado = useId();
  const cid = id ?? gerado;
  return (
    <Moldura id={cid} rotulo={rotulo} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
      <ListaSelecao id={cid} required={obrigatorio} aria-invalid={!!erro} aria-describedby={erro ? `${cid}-erro` : ajuda ? `${cid}-ajuda` : undefined} {...resto}>{children}</ListaSelecao>
    </Moldura>
  );
}

export function Interruptor({ rotulo, descricao, marcado, aoMudar, desabilitado }: {
  rotulo: string; descricao?: string; marcado: boolean; aoMudar: (v: boolean) => void; desabilitado?: boolean;
}) {
  return (
    <label className={cx('flex items-start gap-3', desabilitado ? 'opacity-60' : 'cursor-pointer')}>
      <input type="checkbox" className="mt-0.5 size-4 accent-marca-700" checked={marcado} disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-slate-800">{rotulo}</span>
        {descricao && <span className="block text-xs text-slate-500">{descricao}</span>}
      </span>
    </label>
  );
}

type Tom = 'neutro' | 'sucesso' | 'alerta' | 'perigo' | 'info' | 'marca';
const TONS: Record<Tom, string> = {
  neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  sucesso: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  alerta: 'bg-amber-50 text-amber-800 ring-amber-200',
  perigo: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  marca: 'bg-marca-50 text-marca-800 ring-marca-200',
};
export function Selo({ tom = 'neutro', children, icone }: { tom?: Tom; children: ReactNode; icone?: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', TONS[tom])}>
      {icone}{children}
    </span>
  );
}

/** Cartão. Com título: faixa azul-marinho com o título em branco (como os blocos de um termo de abertura). */
export function Cartao({ children, className, titulo, acoes }: { children: ReactNode; className?: string; titulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <section className={cx('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(titulo || acoes) && (
        <header className="faixa-pagina flex flex-wrap items-center justify-between gap-2 bg-marca-900 px-4 py-2.5 sm:px-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">{titulo}</h2>
          {acoes && <div className="flex flex-wrap items-center gap-2 [&_a]:text-chamada-300 [&_button:not([data-variante])]:text-chamada-300">{acoes}</div>}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Título da página: faixa azul-marinho com linha de acento; o botão principal vira a chamada amarela. */
export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="faixa-pagina relative mb-5 overflow-hidden rounded-xl bg-gradient-to-r from-marca-950 via-marca-900 to-marca-800 px-5 py-4 shadow-md sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-white/5" aria-hidden />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold uppercase tracking-tight text-white sm:text-2xl">{titulo}</h1>
          <span className="mt-1.5 block h-1 w-14 rounded-full bg-gradient-to-r from-acento-400 to-chamada-400" aria-hidden />
          {descricao && <div className="mt-2 text-sm text-marca-100 [&_a]:text-chamada-300 [&_a:hover]:text-white">{descricao}</div>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2 [&_a:not([data-variante])]:text-chamada-300 [&_button:not([data-variante])]:text-marca-50">{acoes}</div>}
      </div>
    </div>
  );
}

/** Subtítulo de seção dentro de um cartão (barra de acento + texto em caixa alta) */
export function TituloSecao({ children, acoes, className }: { children: ReactNode; acoes?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-marca-900 pb-1.5', className)}>
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-marca-900">
        <span className="h-4 w-1 rounded-full bg-acento-500" aria-hidden />{children}
      </h3>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />{texto}
    </div>
  );
}

export function Vazio({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-marca-100 text-marca-700"><Inbox className="size-6" aria-hidden /></span>
      <p className="text-sm font-bold text-marca-900">{titulo}</p>
      {descricao && <p className="max-w-md text-sm text-slate-500">{descricao}</p>}
      {acao}
    </div>
  );
}

export function CaixaErro({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo?: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{mensagem}</p>
      {tentarDeNovo && <Botao pequeno variante="secundario" onClick={tentarDeNovo}>Tentar de novo</Botao>}
    </div>
  );
}

export function SemPermissao({ texto = 'Você não tem permissão para acessar esta área neste órgão.' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <Lock className="size-8 text-slate-300" aria-hidden />
      <p className="text-sm font-medium text-slate-700">Acesso restrito</p>
      <p className="max-w-md text-sm text-slate-500">{texto}</p>
    </div>
  );
}

export function Paginacao({ pagina, total, porPagina, aoMudar }: { pagina: number; total: number; porPagina: number; aoMudar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;
  const inicio = pagina * porPagina + 1;
  const fim = Math.min(total, (pagina + 1) * porPagina);
  return (
    <nav className="flex items-center justify-between gap-2 pt-3 text-sm text-slate-600" aria-label="Paginação">
      <span className="numero">{inicio}–{fim} de {total}</span>
      <div className="flex gap-1">
        <Botao pequeno variante="secundario" disabled={pagina === 0} onClick={() => aoMudar(pagina - 1)} aria-label="Página anterior" icone={<ChevronLeft className="size-4" />} />
        <span className="numero px-2 leading-8">{pagina + 1}/{paginas}</span>
        <Botao pequeno variante="secundario" disabled={pagina + 1 >= paginas} onClick={() => aoMudar(pagina + 1)} aria-label="Próxima página" icone={<ChevronRight className="size-4" />} />
      </div>
    </nav>
  );
}

export function Avatar({ nome, url, tamanho = 'md' }: { nome: string; url?: string | null; tamanho?: 'sm' | 'md' | 'lg' }) {
  const cls = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-16 text-lg' }[tamanho];
  const ini = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return url
    ? <img src={url} alt="" className={cx(cls, 'shrink-0 rounded-full object-cover ring-1 ring-slate-200')} />
    : <span className={cx(cls, 'inline-flex shrink-0 items-center justify-center rounded-full bg-marca-100 font-semibold text-marca-800')} aria-hidden>{ini}</span>;
}

/** Ponto âmbar pulsante que sinaliza uma ação pendente */
export function PontoPendente({ className, rotulo }: { className?: string; rotulo?: string }) {
  return (
    <span className={cx('flex size-3', className)} aria-hidden={!rotulo}>
      <span className="absolute inline-flex size-3 rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping" />
      <span className="relative inline-flex size-3 rounded-full border-2 border-white bg-amber-500" />
      {rotulo && <span className="sr-only">{rotulo}</span>}
    </span>
  );
}

/** Contador âmbar de pendências (menu, abas) */
export function ContadorPendente({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <span className={cx('inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold leading-5 text-amber-950', className)} title={`${n} pendente(s)`}><span aria-hidden>{n > 99 ? '99+' : n}</span><span className="sr-only">, {n} pendente(s)</span></span>;
}
