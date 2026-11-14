// Consolidado mensal de servidores: lança atrasos/faltas do mês, mostra a prévia e emite o documento
// (versão histórica imutável, impressa em A4 paisagem).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, History, Palmtree, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { SeletorUnidadeOrg } from '@/components/CamposEndereco';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarData, formatarDataHora } from '@/lib/formatacao';
import { MESES, observacaoFrequencia } from '@/lib/frequencia';
import { consolidadoMensal, emitirConsolidado, feriasDoConsolidado, listarConsolidados, salvarFrequencias, type Lancamento, type LinhaConsolidado } from '@/services/consolidado';
import { SITUACAO_FERIAS } from './ServidorFerias';
import type { SituacaoFerias } from '@/lib/tipos';

type Edicao = Omit<Lancamento, 'servidor_id'>;
const inteiro = (v: string, max: number) => (v === '' ? null : Math.min(max, Math.max(0, Math.trunc(Number(v)) || 0)));

export function Consolidado() {
  const { orgao, pode } = useSessao();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const hoje = new Date();
  const [unidade, setUnidade] = useState<{ id: string; rotulo: string } | null>(null);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  useEffect(() => setEdicoes({}), [unidade?.id, ano, mes]);

  const q = useQuery({
    queryKey: ['consolidado', orgao?.id, unidade?.id, ano, mes],
    queryFn: () => consolidadoMensal(orgao!.id, unidade!.id, ano, mes),
    enabled: !!orgao && !!unidade && ano >= 2000 && ano <= 2100,
  });
  const ferias = useQuery({
    queryKey: ['consolidado', orgao?.id, unidade?.id, ano, mes, 'ferias'],
    queryFn: () => feriasDoConsolidado(orgao!.id, unidade!.id, ano, mes),
    enabled: !!orgao && !!unidade && ano >= 2000 && ano <= 2100,
  });
  const feriasDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of ferias.data ?? []) m.set(f.servidor_id, [m.get(f.servidor_id), `${formatarData(f.gozo_inicio)} a ${formatarData(f.gozo_fim)}`].filter(Boolean).join(' e '));
    return m;
  }, [ferias.data]);
  const historico = useQuery({
    queryKey: ['consolidados', orgao?.id, unidade?.id],
    queryFn: () => listarConsolidados(orgao!.id, unidade?.id ?? null),
    enabled: !!orgao && pode('servidores', 'ler'),
  });

  const valor = (l: LinhaConsolidado): Edicao => edicoes[l.servidor_id] ?? {
    atrasos: l.atrasos, faltas: l.faltas, justificativa_anexada: l.justificativa_anexada, observacao: l.observacao_manual,
  };
  const editar = (l: LinhaConsolidado, mudanca: Partial<Edicao>) => setEdicoes((e) => ({ ...e, [l.servidor_id]: { ...valor(l), ...mudanca } }));
  const alterados = useMemo(() => Object.entries(edicoes).map(([servidor_id, e]) => ({ servidor_id, ...e })), [edicoes]);

  const salvar = useMutation({
    mutationFn: () => salvarFrequencias(orgao!.id, ano, mes, alterados),
    onSuccess: async () => { setEdicoes({}); await qc.invalidateQueries({ queryKey: ['consolidado'] }); toast.success('Lançamentos do mês salvos.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const emitir = useMutation({
    mutationFn: async () => {
      if (alterados.length) await salvarFrequencias(orgao!.id, ano, mes, alterados);
      return emitirConsolidado(orgao!.id, unidade!.id, ano, mes);
    },
    onSuccess: async (id) => { setEdicoes({}); await qc.invalidateQueries({ queryKey: ['consolidados'] }); navegar(`/imprimir/${id}`); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('servidores', 'ler')) return <SemPermissao />;
  const linhas = q.data ?? [];
  const algumEditavel = linhas.some((l) => l.pode_editar);

  return (
    <>
      <CabecalhoPagina titulo="Consolidado mensal de servidores"
        descricao="Escolha a Coordenação (inclui todas as Gerências e setores abaixo dela), uma Gerência ou um setor e o mês. Lance atrasos e faltas e emita o documento." />
      <Cartao className="mb-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem] sm:items-end">
          <SeletorUnidadeOrg rotulo="Coordenação, Gerência ou setor" obrigatorio valor={unidade?.id ?? null} rotuloValor={unidade?.rotulo}
            aoMudar={(v, r) => setUnidade(v ? { id: v, rotulo: r ?? '' } : null)} />
          <Selecao rotulo="Mês" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Selecao>
          <Campo rotulo="Ano" type="number" inputMode="numeric" min={2000} max={2100} value={ano} onChange={(e) => setAno(Number(e.target.value))} />
        </div>
      </Cartao>

      {!unidade ? <Cartao><Vazio titulo="Escolha a unidade" descricao="O consolidado lista os servidores ativos no mês, em ordem alfabética, sem repetir ninguém. Só entra quem tem data de nomeação no cadastro e está marcado com SIM em “Entra nos consolidados?” (lista de Servidores)." /></Cartao>
        : q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> : (
          <Cartao titulo={`${MESES[mes - 1]} de ${ano} · ${linhas.length} servidor(es)`}
            acoes={<div className="flex flex-wrap gap-2">
              {algumEditavel && <Botao variante="secundario" icone={<Save className="size-4" />} disabled={!alterados.length} carregando={salvar.isPending} onClick={() => salvar.mutate()}>
                Salvar lançamentos{alterados.length ? ` (${alterados.length})` : ''}</Botao>}
              {pode('servidores', 'exportar') && <Botao icone={<FileCheck2 className="size-4" />} disabled={!linhas.length} carregando={emitir.isPending} onClick={() => emitir.mutate()}>Emitir consolidado</Botao>}
            </div>}>
            {!linhas.length ? <Vazio titulo="Nenhum servidor ativo neste mês" descricao="Confira a unidade e as datas de nomeação/exoneração no cadastro: servidor sem data de nomeação ou marcado com NÃO em “Entra nos consolidados?” não entra no consolidado." /> : (
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="py-2 pr-3 font-medium">Matrícula</th><th className="py-2 pr-3 font-medium">Servidor</th>
                      <th className="py-2 pr-3 font-medium">Cargo / função</th>
                      <th className="w-20 py-2 pr-3 font-medium">Atrasos</th><th className="w-20 py-2 pr-3 font-medium">Faltas</th>
                      <th className="py-2 pr-3 font-medium" title="Justificativa ou documentação anexada">Justif.</th>
                      <th className="py-2 font-medium">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => {
                      const v = valor(l);
                      const auto = observacaoFrequencia({ nomeacao: l.data_nomeacao, exoneracao: l.data_exoneracao, ano, mes,
                        atrasos: v.atrasos, faltas: v.faltas, justificativa: v.justificativa_anexada, manual: null });
                      const ed = !l.pode_editar;
                      return (
                        <tr key={l.servidor_id} className={cx('border-b border-slate-100 align-top', edicoes[l.servidor_id] && 'bg-marca-50/50')}>
                          <td className="numero py-2 pr-3">{l.matricula}</td>
                          <td className="py-2 pr-3"><span className="font-medium text-slate-900">{l.nome}</span>
                            <span className="block text-xs text-slate-500">{l.unidade_sigla ?? l.unidade_nome}</span>
                            {feriasDe.has(l.servidor_id) && <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-900"><Palmtree className="size-3" />Férias {feriasDe.get(l.servidor_id)}</span>}</td>
                          <td className="py-2 pr-3 text-slate-700">{l.cargo ?? '—'}<span className="block text-xs text-slate-500">{l.funcao ?? ''}</span></td>
                          <td className="py-1.5 pr-3"><input type="number" min={0} max={999} disabled={ed} aria-label={`Atrasos de ${l.nome}`}
                            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50" value={v.atrasos ?? ''}
                            onChange={(e) => editar(l, { atrasos: inteiro(e.target.value, 999) })} /></td>
                          <td className="py-1.5 pr-3"><input type="number" min={0} max={31} disabled={ed} aria-label={`Faltas de ${l.nome}`}
                            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50" value={v.faltas ?? ''}
                            onChange={(e) => editar(l, { faltas: inteiro(e.target.value, 31) })} /></td>
                          <td className="py-2 pr-3 text-center"><input type="checkbox" disabled={ed} aria-label={`Justificativa anexada de ${l.nome}`}
                            className="size-4 accent-marca-700" checked={v.justificativa_anexada} onChange={(e) => editar(l, { justificativa_anexada: e.target.checked })} /></td>
                          <td className="py-1.5"><input type="text" maxLength={500} disabled={ed} aria-label={`Observação de ${l.nome}`}
                            className="w-full min-w-[14rem] rounded-md border border-slate-300 px-2 py-1 text-sm placeholder:text-slate-500 disabled:bg-slate-50"
                            placeholder={auto || '(em branco)'} value={v.observacao ?? ''} onChange={(e) => editar(l, { observacao: e.target.value || null })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">A observação em cinza é a automática (nomeação, exoneração, justificativa ou "Frequência integral."). Digite para substituí-la; apague para voltar à automática. Os lançamentos do mês não alteram o cadastro do servidor.</p>
              </div>
            )}
          </Cartao>
        )}

      {unidade && !!ferias.data?.length && (
        <Cartao className="mt-6" titulo={<span className="flex items-center gap-2"><Palmtree className="size-4" />Servidores em férias em {MESES[mes - 1]!.toLowerCase()} de {ano} · {new Set(ferias.data.map((f) => f.servidor_id)).size}</span>}>
          <p className="mb-2 text-xs text-slate-500">Vem do histórico de férias de cada servidor e entra automaticamente no consolidado emitido.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Servidor</th><th className="py-2 pr-3 font-medium">Período de férias</th>
                <th className="py-2 pr-3 font-medium">Dias</th><th className="py-2 font-medium">Situação</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {ferias.data.map((f) => {
                  const s = SITUACAO_FERIAS[f.situacao as SituacaoFerias];
                  return (
                    <tr key={`${f.servidor_id}-${f.gozo_inicio}`}>
                      <td className="py-2 pr-3"><span className="font-medium text-slate-900">{f.nome}</span><span className="block text-xs text-slate-500">Mat. {f.matricula}</span></td>
                      <td className="py-2 pr-3">{formatarData(f.gozo_inicio)} a {formatarData(f.gozo_fim)}</td>
                      <td className="py-2 pr-3">{f.dias}{f.dias_no_mes !== f.dias && <span className="block text-xs text-slate-500">{f.dias_no_mes} neste mês</span>}</td>
                      <td className="py-2">{s ? <Selo tom={s.tom}>{s.rotulo}</Selo> : f.situacao}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      <Cartao className="mt-6" titulo={<span className="flex items-center gap-2"><History className="size-4" />Consolidados emitidos{unidade ? ` · ${unidade.rotulo}` : ''}</span>}>
        {historico.isLoading ? <Carregando /> : !historico.data?.length ? <p className="text-sm text-slate-600">Nenhum consolidado emitido ainda.</p> : (
          <ul className="divide-y divide-slate-100">
            {historico.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><span className="font-medium text-slate-900">{d.titulo}</span><span className="block text-xs text-slate-500">Emitido em {formatarDataHora(d.emitido_em)}</span></span>
                <Botao pequeno variante="secundario" onClick={() => navegar(`/imprimir/${d.id}`)}>Abrir</Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}
