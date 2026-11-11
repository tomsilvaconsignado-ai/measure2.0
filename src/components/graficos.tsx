// Gráficos do painel (SVG puro, sem biblioteca): rosca com percentual, linha suave com selos de valor,
// colunas agrupadas, barras de progresso e lista com selos. Marcas finas, pontas arredondadas, grade discreta
// e dica ao passar o mouse (ou focar com o teclado). Cores validadas contra o fundo branco.
import { useState, type ReactNode } from 'react';
import { cx } from './ui/basicos';

export const CORES = { emitido: '#2f66bd', pago: '#14a38b', trilho: '#e8eef6', grade: '#eef2f6', base: '#cbd5e1' } as const;

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pct = (parte: number, total: number) => (total > 0 ? limitar((parte / total) * 100, 0, 100) : 0);
export const percentual = (parte: number, total: number) => Math.round(pct(parte, total));

/** Rosca com o percentual no centro */
export function Rosca({ parte, total, cor = CORES.emitido, tamanho = 64, espessura = 7, rotulo, legenda }: {
  parte: number; total: number; cor?: string; tamanho?: number; espessura?: number; rotulo: string; legenda?: string;
}) {
  const r = (tamanho - espessura) / 2, c = 2 * Math.PI * r, p = pct(parte, total);
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={`${rotulo}: ${Math.round(p)}%`} className="shrink-0">
      <title>{`${rotulo}: ${Math.round(p)}%`}</title>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={CORES.trilho} strokeWidth={espessura} />
      {p > 0 && <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round"
        strokeDasharray={`${Math.max(0.5, (c * p) / 100)} ${c}`} transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`} />}
      <text x="50%" y={legenda ? '47%' : '50%'} dominantBaseline="middle" textAnchor="middle" fontSize={tamanho * 0.22} fontWeight={600} fill="#0f172a">{Math.round(p)}%</text>
      {legenda && <text x="50%" y="66%" dominantBaseline="middle" textAnchor="middle" fontSize={tamanho * 0.11} fill="#64748b">{legenda}</text>}
    </svg>
  );
}

/** Barra de progresso horizontal com rótulo e valor */
export function Progresso({ rotulo, valor, parte, total, cor = CORES.emitido, detalhe }: {
  rotulo: ReactNode; valor: ReactNode; parte: number; total: number; cor?: string; detalhe?: ReactNode;
}) {
  const p = pct(parte, total);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-slate-700">{rotulo}</span>
        <span className="numero shrink-0 text-slate-900">{valor}{detalhe && <span className="ml-1.5 text-slate-500">{detalhe}</span>}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: CORES.trilho }} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
        {p > 0 && <div className="h-2 rounded-full" style={{ width: `${Math.max(p, 1.5)}%`, background: cor }} />}
      </div>
    </div>
  );
}

/** Legenda das séries (sempre presente com duas ou mais) */
export function Legenda({ series }: { series: Array<{ nome: string; cor: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => <span key={s.nome} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: s.cor }} />{s.nome}</span>)}
    </div>
  );
}

function Dica({ x, titulo, linhas }: { x: number; titulo: string; linhas: Array<{ nome?: string; cor?: string; valor: string }> }) {
  return (
    <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: `${limitar(x, 0, 100)}%`, transform: `translateX(${x > 60 ? '-105%' : '8px'})` }}>
      <p className="font-medium text-slate-900">{titulo}</p>
      {linhas.map((l, i) => (
        <p key={i} className="numero flex items-center gap-1.5 whitespace-nowrap text-slate-700">
          {l.cor && <span className="size-2 rounded-full" style={{ background: l.cor }} />}{l.nome && <span className="text-slate-500">{l.nome}:</span>}{l.valor}
        </p>
      ))}
    </div>
  );
}

/** Caminho suave (curva monotônica: não passa acima nem abaixo dos pontos vizinhos) */
function caminhoSuave(pts: Array<[number, number]>) {
  if (pts.length < 2) return '';
  const n = pts.length, dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1]![0] - pts[i]![0]); m.push((pts[i + 1]![1] - pts[i]![1]) / dx[i]!); }
  const t = pts.map((_, i) => {
    if (i === 0) return m[0]!;
    if (i === n - 1) return m[n - 2]!;
    const a = m[i - 1]!, b = m[i]!;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!, h = dx[i]! / 3;
    d += ` C${x0 + h},${y0 + t[i]! * h} ${x1 - h},${y1 - t[i + 1]! * h} ${x1},${y1}`;
  }
  return d;
}

/** Linha suave de uma série, com área clara, selos no maior valor e no último mês com movimento */
export function LinhaSuave({ rotulos, valores: todos, formatar, nome, cor = CORES.emitido, ate }: {
  rotulos: string[]; valores: number[]; /** último índice desenhado (meses ainda por vir ficam de fora) */ ate?: number; formatar: (v: number) => string; nome: string; cor?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const valores = ate === undefined ? todos : todos.slice(0, ate + 1);
  const L = 640, A = 220, base = 190, topo = 34, esq = 16, dir = 16;
  const max = Math.max(1, ...valores) * 1.08;
  const passo = (L - esq - dir) / Math.max(1, rotulos.length - 1);
  const pts = valores.map((v, i) => [esq + i * passo, base - ((base - topo) * v) / max] as [number, number]);
  const imax = valores.indexOf(Math.max(...valores));
  let iult = -1; valores.forEach((v, i) => { if (v > 0) iult = i; });
  const selos = [...new Set([imax, iult])].filter((i) => i >= 0 && valores[i]! > 0);
  const linha = caminhoSuave(pts);
  const idGrad = `grad-${nome.replace(/\W/g, '')}`;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label={nome} onMouseLeave={() => setAtivo(null)}>
        <defs><linearGradient id={idGrad} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={cor} stopOpacity={0.16} /><stop offset="100%" stopColor={cor} stopOpacity={0} /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map((p) => <line key={p} x1={esq} x2={L - dir} y1={base - (base - topo) * p} y2={base - (base - topo) * p} stroke={CORES.grade} strokeWidth={1} />)}
        <line x1={esq} x2={L - dir} y1={base} y2={base} stroke={CORES.base} strokeWidth={1} />
        {linha && <path d={`${linha} L${pts.at(-1)![0]},${base} L${pts[0]![0]},${base} Z`} fill={`url(#${idGrad})`} />}
        {linha && <path d={linha} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {ativo !== null && <line x1={pts[ativo]![0]} x2={pts[ativo]![0]} y1={topo - 10} y2={base} stroke={CORES.base} strokeWidth={1} strokeDasharray="3 3" />}
        {rotulos.map((rot, i) => (
          <g key={i}>
            {pts[i] && (ativo === i || selos.includes(i)) && <circle cx={pts[i][0]} cy={pts[i][1]} r={4.5} fill="#fff" stroke={cor} strokeWidth={2} />}
            <text x={esq + i * passo} y={base + 18} textAnchor="middle" fontSize={11} fill={pts[i] ? "#64748b" : "#cbd5e1"}>{rot}</text>
          </g>
        ))}
        {ativo === null && selos.map((i) => {
          const texto = formatar(valores[i]!), w = texto.length * 6.4 + 14, [x, y] = pts[i]!;
          const bx = limitar(x - w / 2, 2, L - w - 2);
          return (
            <g key={`s${i}`}>
              <rect x={bx} y={y - 30} width={w} height={20} rx={10} fill={cor} />
              <text x={bx + w / 2} y={y - 16} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">{texto}</text>
            </g>
          );
        })}
        {pts.map(([x], i) => (
          <rect key={`h${i}`} x={x - passo / 2} y={0} width={passo} height={A} fill="transparent" tabIndex={0}
            aria-label={`${rotulos[i]}: ${formatar(valores[i]!)}`} onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)} />
        ))}
      </svg>
      {ativo !== null && <Dica x={(pts[ativo]![0] / L) * 100} titulo={rotulos[ativo]!} linhas={[{ nome, cor, valor: formatar(valores[ativo]!) }]} />}
    </div>
  );
}

/** Colunas agrupadas (até 3 séries): barras finas com 2px de folga, ponta arredondada, dica por mês */
export function ColunasAgrupadas({ rotulos, series, formatar, rotulo }: {
  rotulos: string[]; series: Array<{ nome: string; cor: string; valores: number[] }>; formatar: (v: number) => string; rotulo: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const L = 640, A = 210, base = 182, topo = 16;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const faixa = L / rotulos.length, larg = Math.min(14, (faixa * 0.62) / series.length - 2), grupo = series.length * larg + (series.length - 1) * 2;
  const coluna = (x: number, h: number) => {
    const r = Math.min(4, h, larg / 2);
    return `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + larg - r} Q${x + larg},${base - h} ${x + larg},${base - h + r} V${base} Z`;
  };
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label={rotulo} onMouseLeave={() => setAtivo(null)}>
        {[0.25, 0.5, 0.75, 1].map((p) => <line key={p} x1={0} x2={L} y1={base - (base - topo) * p} y2={base - (base - topo) * p} stroke={CORES.grade} strokeWidth={1} />)}
        {rotulos.map((r, i) => {
          const x0 = i * faixa + (faixa - grupo) / 2;
          return (
            <g key={r} opacity={ativo === null || ativo === i ? 1 : 0.5}>
              {ativo === i && <rect x={i * faixa + 2} y={topo - 8} width={faixa - 4} height={base - topo + 8} rx={6} fill="#f1f5f9" />}
              {series.map((s, j) => {
                const v = s.valores[i] ?? 0, h = v > 0 ? Math.max(2, ((base - topo) * v) / max) : 0;
                return h > 0 ? <path key={s.nome} d={coluna(x0 + j * (larg + 2), h)} fill={s.cor} /> : null;
              })}
              <text x={i * faixa + faixa / 2} y={base + 17} textAnchor="middle" fontSize={11} fill="#64748b">{r}</text>
              <rect x={i * faixa} y={0} width={faixa} height={A} fill="transparent" tabIndex={0}
                aria-label={`${r}: ${series.map((s) => `${s.nome} ${formatar(s.valores[i] ?? 0)}`).join(', ')}`}
                onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)} />
            </g>
          );
        })}
        <line x1={0} x2={L} y1={base} y2={base} stroke={CORES.base} strokeWidth={1} />
      </svg>
      {ativo !== null && <Dica x={((ativo + 0.5) / rotulos.length) * 100} titulo={rotulos[ativo]!}
        linhas={series.map((s) => ({ nome: s.nome, cor: s.cor, valor: formatar(s.valores[ativo] ?? 0) }))} />}
    </div>
  );
}

/** Item de lista com selo de valor à direita */
export function ItemSelo({ titulo, detalhe, selo, tom = 'marca' }: { titulo: ReactNode; detalhe?: ReactNode; selo: ReactNode; tom?: 'marca' | 'alerta' | 'neutro' }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{titulo}</p>
        {detalhe && <p className="truncate text-xs text-slate-500">{detalhe}</p>}
      </div>
      <span className={cx('numero shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tom === 'marca' && 'bg-marca-50 text-marca-700', tom === 'alerta' && 'bg-amber-50 text-amber-800', tom === 'neutro' && 'bg-slate-100 text-slate-700')}>{selo}</span>
    </div>
  );
}
