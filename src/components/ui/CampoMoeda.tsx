// Campo monetário com máscara brasileira em tempo real; o valor sai em centavos inteiros.
import { useId } from 'react';
import { formatarCentavos, mascaraMoeda } from '@/lib/formatacao';
import { cx } from './basicos';

export function CampoMoeda({ rotulo, centavos, aoMudar, erro, ajuda, obrigatorio, disabled, className, permitirNegativo }: {
  rotulo: string; centavos: number | null; aoMudar: (c: number | null) => void; erro?: string | null; ajuda?: string;
  obrigatorio?: boolean; disabled?: boolean; className?: string; permitirNegativo?: boolean;
}) {
  const id = useId();
  const negativo = (centavos ?? 0) < 0;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{rotulo}{obrigatorio && <span className="text-red-600" aria-hidden> *</span>}</label>
      <div className="flex gap-2">
        {permitirNegativo && (
          <button type="button" disabled={disabled} onClick={() => aoMudar(centavos ? -centavos : centavos)}
            className={cx('h-10 w-10 shrink-0 rounded-lg border text-sm font-semibold', negativo ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-emerald-700')}
            aria-label={negativo ? 'Valor negativo (supressão): tocar para tornar positivo' : 'Valor positivo: tocar para tornar negativo'}>
            {negativo ? '−' : '+'}
          </button>
        )}
        <input id={id} inputMode="numeric" disabled={disabled} aria-invalid={!!erro}
          className={cx('numero h-10 w-full rounded-lg border bg-white px-3 text-right text-sm disabled:bg-slate-100', erro ? 'border-red-500' : 'border-slate-300')}
          value={centavos === null ? '' : formatarCentavos(Math.abs(centavos))}
          placeholder="R$ 0,00"
          onChange={(e) => {
            const { centavos: c } = mascaraMoeda(e.target.value);
            aoMudar(e.target.value.replace(/\D/g, '') === '' ? null : negativo ? -c : c);
          }} />
      </div>
      {erro ? <p className="text-xs text-red-700" role="alert">{erro}</p> : ajuda ? <p className="text-xs text-slate-500">{ajuda}</p> : null}
    </div>
  );
}

/** Barra de utilização (ex.: consumido do contrato/empenho) */
export function BarraUso({ usado, total, rotulo }: { usado: number; total: number; rotulo?: string }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (usado / total) * 100)) : 0;
  const cor = pct >= 100 ? 'bg-red-600' : pct >= 85 ? 'bg-amber-500' : 'bg-marca-600';
  return (
    <div>
      {rotulo && <div className="mb-1 flex justify-between text-xs text-slate-600"><span>{rotulo}</span><span className="numero">{pct.toFixed(1).replace('.', ',')}%</span></div>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
        <div className={cx('h-full rounded-full transition-all', cor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
