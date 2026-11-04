// Seleção com busca digitável e carregamento sob demanda (nunca carrega milhares de opções).
// A busca roda no servidor com espera de 250 ms entre teclas; setas, Enter e Esc funcionam.
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from './basicos';

export interface Opcao { valor: string; rotulo: string; detalhe?: string }

export function BuscaSelect({ rotulo, valor, rotuloValor, aoMudar, buscar, chave, placeholder = 'Digite para buscar...', erro, obrigatorio, desabilitado, ajuda }: {
  rotulo: string;
  valor: string | null;
  /** texto exibido do valor atual (evita buscar de novo só para mostrar) */
  rotuloValor?: string | null;
  aoMudar: (valor: string | null, opcao: Opcao | null) => void;
  buscar: (termo: string) => Promise<Opcao[]>;
  /** identifica a lista no cache (ex.: ['unidades', tenantId]) */
  chave: unknown[];
  placeholder?: string; erro?: string | null; obrigatorio?: boolean; desabilitado?: boolean; ajuda?: string;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [termoAtrasado, setTermoAtrasado] = useState('');
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setTermoAtrasado(termo.trim()), 250); return () => clearTimeout(t); }, [termo]);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const q = useQuery({ queryKey: [...chave, 'busca', termoAtrasado], queryFn: () => buscar(termoAtrasado), enabled: aberto, staleTime: 30_000 });
  const opcoes = q.data ?? [];
  useEffect(() => setAtivo(0), [termoAtrasado]);

  const escolher = (o: Opcao | null) => { aoMudar(o?.valor ?? null, o); setAberto(false); setTermo(''); };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, opcoes.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && aberto && opcoes[ativo]) { e.preventDefault(); escolher(opcoes[ativo]!); }
    else if (e.key === 'Escape') setAberto(false);
  };

  return (
    <div className="flex flex-col gap-1" ref={caixa}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{rotulo}{obrigatorio && <span className="text-red-600" aria-hidden> *</span>}</label>
      <div className="relative">
        <input
          id={id} role="combobox" aria-expanded={aberto} aria-controls={`${id}-lista`} aria-autocomplete="list" aria-invalid={!!erro}
          disabled={desabilitado} autoComplete="off"
          className={cx('h-10 w-full rounded-lg border bg-white pl-3 pr-16 text-sm disabled:bg-slate-100', erro ? 'border-red-500' : 'border-slate-300')}
          placeholder={valor ? (rotuloValor ?? 'Selecionado') : placeholder}
          value={aberto ? termo : (valor ? rotuloValor ?? '' : '')}
          onFocus={() => setAberto(true)}
          onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
          onKeyDown={tecla}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-slate-400">
          {q.isFetching && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {valor && !desabilitado && (
            <button type="button" onClick={() => escolher(null)} className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700" aria-label="Limpar seleção"><X className="size-4" /></button>
          )}
          <ChevronsUpDown className="size-4" aria-hidden />
        </div>
        {aberto && (
          <ul id={`${id}-lista`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {q.isError && <li className="px-3 py-2 text-sm text-red-700">Não foi possível buscar. Tente de novo.</li>}
            {!q.isFetching && !q.isError && opcoes.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nada encontrado{termoAtrasado ? ` para "${termoAtrasado}"` : ''}.</li>}
            {opcoes.map((o, i) => (
              <li key={o.valor} role="option" aria-selected={o.valor === valor}
                onMouseDown={(e) => { e.preventDefault(); escolher(o); }} onMouseEnter={() => setAtivo(i)}
                className={cx('flex cursor-pointer items-start gap-2 px-3 py-2 text-sm', i === ativo && 'bg-marca-50')}>
                <Check className={cx('mt-0.5 size-4 shrink-0', o.valor === valor ? 'text-marca-700' : 'invisible')} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-slate-900">{o.rotulo}</span>
                  {o.detalhe && <span className="block truncate text-xs text-slate-500">{o.detalhe}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {erro ? <p className="text-xs text-red-700" role="alert">{erro}</p> : ajuda ? <p className="text-xs text-slate-500">{ajuda}</p> : null}
    </div>
  );
}
