import type { ReactNode } from 'react';
import { ContadorPendente, PontoPendente, cx } from './basicos';

export function Abas<T extends string>({ abas, ativa, aoMudar }: { abas: Array<{ id: T; rotulo: ReactNode; /** pendência: número = contador, true = ponto */ alerta?: number | boolean }>; ativa: T; aoMudar: (id: T) => void }) {
  return (
    // abas em segmentos: a ativa em azul-marinho preenchido, com a linha de acento embaixo
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1" role="tablist">
      {abas.map((a) => (
        <button key={a.id} role="tab" aria-selected={a.id === ativa} onClick={() => aoMudar(a.id)}
          className={cx('relative whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
            a.id === ativa ? 'bg-marca-900 text-white shadow-sm after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-acento-400'
              : 'text-slate-600 hover:bg-white hover:text-marca-900')}>
          <span className="inline-flex items-center gap-1.5">{a.rotulo}{typeof a.alerta === 'number' ? <ContadorPendente n={a.alerta} /> : a.alerta && <span className="relative"><PontoPendente rotulo="pendente" /></span>}</span>
        </button>
      ))}
    </div>
  );
}

/** Campo de busca das listagens (a espera entre teclas fica com useBuscaAtrasada) */
export function CampoBusca({ valor, aoMudar, placeholder, rotulo }: { valor: string; aoMudar: (v: string) => void; placeholder: string; rotulo: string }) {
  return (
    <div className="relative w-full">
      <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm transition-colors hover:border-slate-400 focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-100" placeholder={placeholder} value={valor}
        onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo} />
    </div>
  );
}
