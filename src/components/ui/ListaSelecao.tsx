// Seleção no padrão visual do app, no lugar do <select> nativo (cuja lista aberta é desenhada pelo sistema
// e não segue o visual do MEASURE). Mesma interface do <select>: value, onChange(e.target.value), disabled,
// filhos <option>/<optgroup>. A lista abre numa camada flutuante (não é cortada dentro de janelas com rolagem),
// com teclado (setas, Home/End, Enter, Esc, letra inicial) e campo de busca quando há muitas opções.
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type ChangeEvent, type CSSProperties, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

interface Item { valor: string; rotulo: string; desabilitado: boolean; grupo?: string }

const texto = (n: ReactNode): string => {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(texto).join('');
  if (isValidElement<{ children?: ReactNode }>(n)) return texto(n.props.children);
  return '';
};

/** Lê as <option>/<optgroup> (também dentro de fragmentos e listas) */
export function lerOpcoes(filhos: ReactNode, grupo?: string, saida: Item[] = []): Item[] {
  Children.forEach(filhos, (f) => {
    if (!isValidElement<{ children?: ReactNode; value?: unknown; disabled?: boolean; label?: string }>(f)) return;
    if (f.type === Fragment) lerOpcoes(f.props.children, grupo, saida);
    else if (f.type === 'optgroup') lerOpcoes(f.props.children, f.props.label, saida);
    else if (f.type === 'option') {
      const rotulo = texto(f.props.children);
      saida.push({ valor: f.props.value != null ? String(f.props.value) : rotulo, rotulo, desabilitado: !!f.props.disabled, grupo });
    }
  });
  return saida;
}

const MIN_PARA_BUSCA = 9;

export type PropsListaSelecao = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple'>;

export function ListaSelecao({ value, defaultValue, onChange, disabled, children, className, id, required, style, ...aria }: PropsListaSelecao) {
  const gerado = useId();
  const idBotao = id ?? gerado;
  const idLista = `${idBotao}-lista`;
  const itens = useMemo(() => lerOpcoes(children), [children]);
  const [interno, setInterno] = useState(() => String(defaultValue ?? itens[0]?.valor ?? ''));
  const atual = value != null ? String(value) : interno;
  const selecionado = itens.find((i) => i.valor === atual);

  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [pos, setPos] = useState<CSSProperties>({});
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const busca = useRef<HTMLInputElement>(null);
  const comBusca = itens.length >= MIN_PARA_BUSCA;

  const visiveis = useMemo(() => {
    const t = filtro.trim().toLocaleLowerCase('pt-BR');
    return t ? itens.filter((i) => i.rotulo.toLocaleLowerCase('pt-BR').includes(t)) : itens;
  }, [itens, filtro]);

  // posição da camada flutuante: abaixo do campo (ou acima, se não couber), com a largura do campo
  const posicionar = () => {
    const r = botao.current?.getBoundingClientRect();
    if (!r) return;
    const alturaMax = 320;
    const abaixo = window.innerHeight - r.bottom - 8;
    const acima = r.top - 8;
    const paraCima = abaixo < Math.min(alturaMax, 200) && acima > abaixo;
    setPos({
      position: 'fixed', left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 224) - 8)),
      width: Math.max(r.width, 224), maxHeight: Math.min(alturaMax, paraCima ? acima : abaixo),
      ...(paraCima ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  };
  useLayoutEffect(() => { if (aberto) posicionar(); }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!botao.current?.contains(alvo) && !lista.current?.contains(alvo)) setAberto(false);
    };
    const reposicionar = (e: Event) => { if (!lista.current?.contains(e.target as Node)) posicionar(); };
    document.addEventListener('mousedown', fora);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', reposicionar, true);
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', reposicionar, true); };
  }, [aberto]);
  // ao abrir: destaca o item escolhido e foca a busca (se houver)
  useEffect(() => {
    if (!aberto) { setFiltro(''); return; }
    setAtivo(Math.max(0, itens.findIndex((i) => i.valor === atual)));
    if (comBusca) setTimeout(() => busca.current?.focus(), 0);
  }, [aberto]);
  useEffect(() => { if (filtro) setAtivo(0); }, [filtro]);
  useEffect(() => { lista.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: 'nearest' }); }, [ativo, aberto]);

  const escolher = (item: Item | undefined) => {
    if (!item || item.desabilitado) return;
    setAberto(false);
    botao.current?.focus();
    if (item.valor === atual) return;
    if (value == null) setInterno(item.valor);
    // mesmo formato do evento do <select>: quem usa lê e.target.value
    const alvo = { value: item.valor, name: aria.name, id: idBotao } as unknown as HTMLSelectElement;
    onChange?.({ target: alvo, currentTarget: alvo } as ChangeEvent<HTMLSelectElement>);
  };
  const mover = (passo: number) => {
    if (!visiveis.length) return;
    let i = ativo;
    for (let n = 0; n < visiveis.length; n++) {
      i = (i + passo + visiveis.length) % visiveis.length;
      if (!visiveis[i]!.desabilitado) break;
    }
    setAtivo(i);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setAberto(true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setAtivo(0); }
    else if (e.key === 'End') { e.preventDefault(); setAtivo(visiveis.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && !comBusca)) { e.preventDefault(); escolher(visiveis[ativo]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAberto(false); botao.current?.focus(); }
    else if (e.key === 'Tab') setAberto(false);
    else if (!comBusca && e.key.length === 1) {
      // letra inicial: vai para a próxima opção que começa com ela
      const l = e.key.toLocaleLowerCase('pt-BR');
      const i = visiveis.findIndex((x, n) => n > ativo && x.rotulo.toLocaleLowerCase('pt-BR').startsWith(l));
      const j = i >= 0 ? i : visiveis.findIndex((x) => x.rotulo.toLocaleLowerCase('pt-BR').startsWith(l));
      if (j >= 0) setAtivo(j);
    }
  };

  let grupoAnterior: string | undefined;
  return (
    <>
      <button
        ref={botao} id={idBotao} type="button" data-variante="campo" disabled={disabled} role="combobox" aria-haspopup="listbox" aria-expanded={aberto} aria-controls={idLista}
        aria-required={required || undefined} aria-label={aria['aria-label']} aria-invalid={aria['aria-invalid']} aria-describedby={aria['aria-describedby']}
        title={aria.title ?? selecionado?.rotulo}
        onClick={() => setAberto((a) => !a)} onKeyDown={tecla} style={style}
        className={cx('flex items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm text-slate-900 transition-colors',
          'hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marca-600',
          'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
          // altura e largura: as da tela, quando ela define; senão o padrão dos campos
          !/(^|\s)h-/.test(className ?? '') && 'h-10', !/(^|\s)(w-|flex-1)/.test(className ?? '') && 'w-full',
          aria['aria-invalid'] ? 'border-red-500' : aberto ? 'border-marca-600 ring-2 ring-marca-100' : 'border-slate-300',
          className?.replace(/(^|\s)(border-slate-\d+|border-red-\d+|bg-white|px-\d+)(?=\s|$)/g, ' '))}>
        <span className={cx('min-w-0 truncate', !selecionado?.rotulo && 'text-slate-400')}>{selecionado?.rotulo || 'Escolha…'}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-slate-400 transition-transform', aberto && 'rotate-180 text-marca-700')} aria-hidden />
      </button>
      {aberto && createPortal(
        <div ref={lista} style={pos} onKeyDown={tecla}
          className="z-[70] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
          {comBusca && (
            <div className="relative border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input ref={busca} value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar na lista…" aria-label="Buscar na lista"
                aria-controls={idLista} aria-activedescendant={visiveis[ativo] ? `${idLista}-${ativo}` : undefined}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-sm focus:border-marca-500 focus:bg-white focus:outline-none" />
            </div>
          )}
          <ul id={idLista} role="listbox" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-1">
            {!visiveis.length && <li className="px-3 py-2 text-sm text-slate-500">Nada encontrado{filtro ? ` para "${filtro}"` : ''}.</li>}
            {visiveis.map((item, i) => {
              const marcado = item.valor === atual;
              const cabecalho = item.grupo && item.grupo !== grupoAnterior ? item.grupo : null;
              grupoAnterior = item.grupo;
              return (
                <Fragment key={`${item.grupo ?? ''}|${item.valor}|${i}`}>
                  {cabecalho && <li role="presentation" className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{cabecalho}</li>}
                  <li id={`${idLista}-${i}`} data-indice={i} role="option" aria-selected={marcado} aria-disabled={item.desabilitado || undefined}
                    onMouseDown={(e) => { e.preventDefault(); escolher(item); }} onMouseEnter={() => setAtivo(i)}
                    className={cx('flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
                      item.desabilitado ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-800',
                      i === ativo && !item.desabilitado && 'bg-marca-50',
                      marcado && 'font-semibold text-marca-800')}>
                    <Check className={cx('size-4 shrink-0', marcado ? 'text-marca-700' : 'invisible')} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.rotulo || 'Escolha…'}</span>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
