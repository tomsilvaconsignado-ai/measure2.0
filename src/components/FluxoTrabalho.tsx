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
  // faixa azul-marinho com o título; passos numerados como uma linha do tempo; o passo com pendência
  // do usuário fica na chamada amarela, com a quantidade e o comando para resolver
  return (
    <section aria-label="Fluxo de trabalho" className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-marca-900 px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white">Fluxo de trabalho</h2>
        <Link to="/ajuda" className="text-xs font-medium text-chamada-300 hover:text-white">Como fazer cada passo →</Link>
      </div>
      <ol className="grid gap-2 p-3 sm:grid-cols-4 xl:grid-cols-7">
        {passos.map((p, i) => (
          <li key={p.n} className="relative">
            <Link to={p.para} className={cx('group flex h-full flex-col rounded-lg border-2 p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md',
              p.pendentes ? 'border-chamada-500 bg-chamada-300/30 hover:bg-chamada-300/50' : 'border-slate-200 bg-white hover:border-marca-400')}>
              <span className="flex items-center gap-1.5">
                <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold',
                  p.pendentes ? 'bg-chamada-500 text-marca-950' : 'bg-marca-900 text-white')}>{i + 1}</span>
                <span className="text-sm font-bold text-marca-900">{p.titulo}</span>
                {!!p.pendentes && <ContadorPendente n={p.pendentes} className="ml-auto" />}
              </span>
              <span className="mt-1 text-xs leading-snug text-slate-600">{p.texto}</span>
              {!!p.pendentes && <span className="mt-2 inline-flex w-fit items-center rounded-md bg-chamada-500 px-2 py-0.5 text-xs font-bold text-marca-950">Resolver agora →</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
