// Fluxo de trabalho da execução de contratos, na ordem em que acontece. Cada passo leva à tela certa;
// os passos com pendência do usuário (atesto, pagamento) aparecem em destaque com a quantidade.
import { Link } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { ContadorPendente, cx } from './ui/basicos';
import { usePendencias } from './Pendencias';

export function FluxoTrabalho() {
  const { pode, orgao } = useSessao();
  const pendencias = usePendencias();
  if (!orgao) return null;
  const passos = [
    { n: 1, titulo: 'Contrato', texto: 'Cadastre o contrato e o fornecedor', para: '/contratos', ok: pode('contratos', 'criar') },
    { n: 2, titulo: 'Responsáveis e dotação', texto: 'Designe o fiscal e adicione as dotações', para: '/contratos', ok: pode('contratos', 'editar') },
    { n: 3, titulo: 'Empenho', texto: 'Lance a nota de empenho', para: '/empenhos', ok: pode('empenhos', 'criar') },
    { n: 4, titulo: 'Nota fiscal', texto: 'Lance a nota do mês', para: '/notas', ok: pode('notas_fiscais', 'criar') },
    { n: 5, titulo: 'Atesto', texto: 'Gestor, fiscal ou suplente atesta', para: '/notas?filtro=ATESTO', ok: true, pendentes: pendencias.atesto },
    { n: 6, titulo: 'Pagamento', texto: 'Baixa com retenções e data', para: '/pagamentos', ok: pode('notas_fiscais', 'editar'), pendentes: pendencias.pagamento },
    { n: 7, titulo: 'Documentos', texto: 'Checklist, extratos e relatórios', para: '/relatorios', ok: true },
  ].filter((p) => p.ok);
  return (
    <section aria-label="Fluxo de trabalho" className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Fluxo de trabalho</h2>
        <Link to="/ajuda" className="text-xs text-marca-700 hover:underline">Como fazer cada passo</Link>
      </div>
      <ol className="grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {passos.map((p, i) => (
          <li key={p.n}>
            <Link to={p.para} className={cx('group flex h-full flex-col rounded-lg border p-2.5 transition-colors',
              p.pendentes ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 hover:border-marca-300 hover:bg-marca-50')}>
              <span className="flex items-center gap-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-marca-700 text-[11px] font-bold text-white">{i + 1}</span>
                <span className="text-sm font-medium text-slate-900">{p.titulo}</span>
                {!!p.pendentes && <ContadorPendente n={p.pendentes} className="ml-auto" />}
              </span>
              <span className="mt-1 text-xs leading-snug text-slate-600">{p.texto}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
