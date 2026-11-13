// Escolha de várias unidades atendidas de uma vez: lista com caixas de marcar que fica aberta, busca
// instantânea, filtro por tipo, "marcar todas" do que está na tela e atalho para marcar as unidades de um
// grupo. As unidades ativas do órgão são poucas (dezenas), então a lista vem inteira e o filtro é local.
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, ChevronDown, Layers, Search, Square, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSessao } from '@/auth/Sessao';
import { Carregando, CaixaErro, cx } from '@/components/ui/basicos';
import { mensagemDeErro } from '@/lib/erros';
import type { UnidadeAtendida } from '@/lib/tipos';
import { listarUnidadesAtendidas, membrosDoGrupo } from '@/services/cadastros';

export interface UnidadeEscolhida { id: string; nome: string }

export function SeletorUnidadesAtendidas({ rotulo = 'Unidades atendidas', valor, aoMudar, ajuda }: {
  rotulo?: string; valor: UnidadeEscolhida[]; aoMudar: (v: UnidadeEscolhida[]) => void; ajuda?: string;
}) {
  const { orgao } = useSessao();
  const [aberto, setAberto] = useState(valor.length === 0);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<string>('');
  const [carregandoGrupo, setCarregandoGrupo] = useState<string | null>(null);
  const [erroGrupo, setErroGrupo] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['unidades-atendidas-todas', orgao?.id], enabled: !!orgao && aberto, staleTime: 5 * 60_000,
    queryFn: async () => (await listarUnidadesAtendidas({ tenantId: orgao!.id, situacao: 'ATIVOS', limite: 1000, offset: 0 })).itens,
  });
  const todas = q.data ?? [];
  const marcadas = useMemo(() => new Set(valor.map((v) => v.id)), [valor]);
  const tipos = useMemo(() => [...new Set(todas.map((u) => u.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [todas]);
  const visiveis = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR');
    return todas.filter((u) => (!tipo || u.tipo === tipo)
      && (!t || [u.nome, u.sigla, u.tipo, u.bairro, u.codigo].some((x) => x?.toLocaleLowerCase('pt-BR').includes(t))));
  }, [todas, busca, tipo]);
  const grupos = visiveis.filter((u) => u.eh_grupo);
  const unidades = visiveis.filter((u) => !u.eh_grupo);
  const marcadasVisiveis = unidades.filter((u) => marcadas.has(u.id)).length;

  const alternar = (u: UnidadeAtendida) => aoMudar(marcadas.has(u.id) ? valor.filter((v) => v.id !== u.id) : [...valor, { id: u.id, nome: u.nome }]);
  const marcarVarias = (lista: Array<{ id: string; nome: string }>) =>
    aoMudar([...valor, ...lista.filter((u) => !marcadas.has(u.id)).map((u) => ({ id: u.id, nome: u.nome }))]);
  const desmarcarVarias = (ids: Set<string>) => aoMudar(valor.filter((v) => !ids.has(v.id)));
  const marcarDoGrupo = async (g: UnidadeAtendida) => {
    setCarregandoGrupo(g.id); setErroGrupo(null);
    try { marcarVarias((await membrosDoGrupo(g.id)).filter((m) => m.ativo)); }
    catch (e) { setErroGrupo(mensagemDeErro(e)); }
    finally { setCarregandoGrupo(null); }
  };

  // função de desenho (não componente), para a caixa não perder o foco a cada clique
  const linha = (u: UnidadeAtendida) => {
    const m = marcadas.has(u.id);
    return (
      <label className={cx('flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors',
        m ? 'border-marca-600 bg-marca-50 text-marca-900' : 'border-slate-200 bg-white hover:border-marca-300 hover:bg-slate-50')}>
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-marca-800" checked={m} onChange={() => alternar(u)} />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate', m && 'font-semibold')} title={u.nome}>{u.nome}</span>
          <span className="block truncate text-xs text-slate-500">{[u.tipo, u.sigla, u.bairro].filter(Boolean).join(' · ')}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{rotulo}</span>
        <span className="flex items-center gap-2">
          <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', valor.length ? 'bg-marca-900 text-white' : 'bg-slate-200 text-slate-600')}>
            {valor.length} selecionada{valor.length === 1 ? '' : 's'}
          </span>
          <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-marca-900 shadow-sm hover:bg-marca-50">
            {aberto ? 'Fechar lista' : 'Escolher unidades'}<ChevronDown className={cx('size-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden />
          </button>
        </span>
      </div>

      {valor.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Unidades selecionadas">
          {valor.map((u) => (
            <li key={u.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-marca-50 px-2 py-0.5 text-xs font-medium text-marca-900 ring-1 ring-marca-200">
              <span className="truncate">{u.nome}</span>
              <button type="button" className="rounded p-0.5 hover:bg-marca-100" aria-label={`Tirar ${u.nome}`} onClick={() => aoMudar(valor.filter((x) => x.id !== u.id))}><X className="size-3" /></button>
            </li>
          ))}
          <li><button type="button" className="rounded-md px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => aoMudar([])}>Limpar todas</button></li>
        </ul>
      )}

      {aberto && (
        <div className="rounded-xl border border-slate-300 bg-slate-50/70 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome, sigla, tipo ou bairro" aria-label="Filtrar unidades"
                className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-100" />
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por tipo">
              {['', ...tipos].map((t) => (
                <button key={t || 'todos'} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t}
                  className={cx('rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                    tipo === t ? 'bg-marca-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-marca-50')}>{t || 'Todos'}</button>
              ))}
            </div>
          </div>

          {q.isLoading ? <Carregando texto="Carregando unidades..." /> : q.isError ? <div className="mt-2"><CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => q.refetch()} /></div> : (
            <>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">{unidades.length} unidade{unidades.length === 1 ? '' : 's'} na lista · {marcadasVisiveis} marcada{marcadasVisiveis === 1 ? '' : 's'}</span>
                <span className="flex gap-1.5">
                  <button type="button" disabled={!unidades.length || marcadasVisiveis === unidades.length} onClick={() => marcarVarias(unidades)}
                    className="inline-flex items-center gap-1 rounded-lg bg-marca-800 px-2.5 py-1 font-semibold text-white hover:bg-marca-900 disabled:bg-slate-300">
                    <CheckSquare className="size-3.5" aria-hidden />Marcar todas{busca || tipo ? ' da lista' : ''} ({unidades.length})</button>
                  <button type="button" disabled={!marcadasVisiveis} onClick={() => desmarcarVarias(new Set(unidades.map((u) => u.id)))}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 disabled:text-slate-400">
                    <Square className="size-3.5" aria-hidden />Desmarcar{busca || tipo ? ' da lista' : ' todas'}</button>
                </span>
              </div>

              {grupos.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-marca-900"><Layers className="size-3.5" aria-hidden />Grupos</p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {grupos.map((g) => (
                      <li key={g.id} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">{linha(g)}</div>
                        <button type="button" onClick={() => void marcarDoGrupo(g)} disabled={carregandoGrupo === g.id}
                          className="shrink-0 rounded-lg bg-chamada-500 px-2 py-1.5 text-xs font-bold text-marca-950 hover:bg-chamada-400 disabled:opacity-60"
                          title={`Marcar todas as unidades do grupo ${g.nome}`}>{carregandoGrupo === g.id ? '…' : '+ unidades do grupo'}</button>
                      </li>
                    ))}
                  </ul>
                  {erroGrupo && <div className="mt-2"><CaixaErro mensagem={erroGrupo} /></div>}
                </div>
              )}

              <div className="mt-3">
                {grupos.length > 0 && <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-marca-900">Unidades</p>}
                {!unidades.length ? <p className="py-4 text-center text-sm text-slate-500">Nenhuma unidade com esse filtro.</p> : (
                  <ul className="grid max-h-80 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    {unidades.map((u) => <li key={u.id}>{linha(u)}</li>)}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {ajuda && <p className="text-xs text-slate-500">{ajuda}</p>}
    </div>
  );
}
