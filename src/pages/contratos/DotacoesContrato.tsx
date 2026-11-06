// Dotações do contrato: várias por contrato (ações, fontes, elementos e exercícios diferentes), cada uma com as
// classificações originais do catálogo do ente. Seleção múltipla com pesquisa; remoção só se nenhum empenho usa.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { CampoBusca } from '@/components/ui/Abas';
import { Botao, CaixaErro, Carregando, Selo, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro } from '@/lib/erros';
import { brl } from '@/lib/formatacao';
import type { ContratoResumo, DotacaoDetalhada, DotacaoDoContrato } from '@/lib/tipos';
import { listarClassificacoes } from '@/services/cadastros';
import { desvincularDotacao, listarDotacoesContrato, vincularDotacoes } from '@/services/execucao';

const NATUREZA_ACAO = { PROJETO: 'Projeto', ATIVIDADE: 'Atividade', OPERACAO_ESPECIAL: 'Op. especial' } as const;

/** Natureza no formato da nota de empenho (33903914), a partir dos códigos da dotação */
export function naturezaDaDotacao(d: Pick<DotacaoDetalhada, 'categoria_codigo' | 'gnd_codigo' | 'modalidade_codigo' | 'elemento_codigo' | 'subelemento_codigo'>) {
  if (!d.categoria_codigo || !d.gnd_codigo || !d.modalidade_codigo) return d.elemento_codigo;
  return `${d.categoria_codigo}${d.gnd_codigo}${d.modalidade_codigo.padStart(2, '0')}${d.elemento_codigo.padStart(2, '0')}${(d.subelemento_codigo ?? '0').padStart(2, '0')}`;
}

/** Quadro com as classificações da dotação (preenchimento automático no empenho e no contrato) */
export function ClassificacoesDaDotacao({ d }: { d: DotacaoDetalhada | DotacaoDoContrato }) {
  const linha = (r: string, v: string | null | undefined) => (v ? <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{r}</dt><dd className="text-sm text-slate-900">{v}</dd></div> : null);
  const cod = (c: string | null | undefined, t: string | null | undefined) => (c ? `${c}${t ? ` – ${t}` : ''}` : null);
  return (
    <dl className="grid gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
      {linha('Exercício', d.exercicio ? String(d.exercicio) : 'Qualquer exercício')}
      {linha('Unidade orçamentária', cod(d.uo_codigo, d.uo_descricao))}
      {linha('Unidade gestora', cod(d.ug_codigo, d.ug_descricao))}
      {linha('Funcional', [d.funcao_codigo, d.subfuncao_codigo, d.programa_codigo].filter(Boolean).join('.') || null)}
      {linha('Ação', `${d.acao_codigo} – ${d.acao_descricao}${d.natureza_acao ? ` (${NATUREZA_ACAO[d.natureza_acao]})` : ''}`)}
      {linha('Natureza da despesa', `${naturezaDaDotacao(d)} – ${d.subelemento_descricao ?? d.elemento_descricao}`)}
      {linha('Fonte de recurso', `${d.fonte_codigo}${d.detalhamento_codigo ? `.${d.detalhamento_codigo}` : ''} – ${d.fonte_descricao}`)}
    </dl>
  );
}

function SelecionarDotacoes({ contrato, jaVinculadas, aberto, aoFechar }: { contrato: ContratoResumo; jaVinculadas: string[]; aberto: boolean; aoFechar: () => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [exercicio, setExercicio] = useState('');
  const [marcadas, setMarcadas] = useState<string[]>([]);
  useEffect(() => { if (aberto) { setMarcadas([]); setBusca(''); setExercicio(''); } }, [aberto]);
  const anos = useMemo(() => {
    const ini = Number(contrato.data_inicio.slice(0, 4)); const fim = Number(contrato.data_fim_atual.slice(0, 4));
    return Array.from({ length: Math.max(1, Math.min(10, fim - ini + 1)) }, (_, i) => ini + i);
  }, [contrato]);
  const q = useQuery({
    queryKey: ['dotacoes-opcoes', orgao?.id, termo, exercicio], enabled: aberto && !!orgao,
    queryFn: () => listarClassificacoes({ tenantId: orgao!.id, busca: termo, situacao: 'ATIVOS', limite: 100, offset: 0, exercicio: exercicio ? Number(exercicio) : null }),
  });
  const vincular = useMutation({
    mutationFn: () => vincularDotacoes(contrato.id, marcadas),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['contrato-dotacoes', contrato.id] }); toast.success(`${marcadas.length} dotação(ões) vinculada(s) ao contrato.`); aoFechar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const itens = (q.data?.itens ?? []).filter((d) => !jaVinculadas.includes(d.id));
  const alternar = (id: string) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Vincular dotações ao contrato" largura="lg"
      descricao="Marque uma ou várias. Cada dotação mantém as suas classificações (ação, fonte, natureza, exercício)."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao disabled={!marcadas.length} carregando={vincular.isPending} onClick={() => vincular.mutate()}>Vincular {marcadas.length || ''} dotação(ões)</Botao></>}>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_11rem]">
        <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar dotação" placeholder="Código, fonte, ação, elemento (33903914), unidade ou descrição" />
        <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={exercicio} onChange={(e) => setExercicio(e.target.value)} aria-label="Exercício">
          <option value="">Todos os exercícios</option>
          {anos.map((a) => <option key={a} value={a}>Exercício {a}</option>)}
        </select>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={mensagemDeErro(q.error)} /> : !itens.length
        ? <Vazio titulo="Nenhuma dotação disponível" descricao={busca || exercicio ? 'Ajuste a busca ou o exercício.' : 'As dotações são cadastradas pelo módulo Desenvolvedor (Dotações orçamentárias).'} />
        : <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="w-8 px-2 py-2" /><th className="px-2 py-2 font-medium">Exercício</th><th className="px-2 py-2 font-medium">Código da dotação</th>
              <th className="px-2 py-2 font-medium">Ação</th><th className="px-2 py-2 font-medium">Natureza</th><th className="px-2 py-2 font-medium">Fonte</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {itens.map((d) => {
                const fora = d.exercicio && !anos.includes(d.exercicio);
                return (
                  <tr key={d.id} className={cx('cursor-pointer hover:bg-slate-50', marcadas.includes(d.id) && 'bg-marca-50')} onClick={() => alternar(d.id)}>
                    <td className="px-2 py-2"><input type="checkbox" className="size-4 accent-marca-700" checked={marcadas.includes(d.id)} onChange={() => alternar(d.id)} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar ${d.codigo_completo}`} /></td>
                    <td className="px-2 py-2">{d.exercicio ?? 'Qualquer'}{fora && <span className="block text-[11px] text-amber-700">fora da vigência</span>}</td>
                    <td className="numero px-2 py-2 font-mono text-xs">{d.codigo_completo}{d.descricao && <span className="block font-sans text-xs text-slate-500">{d.descricao}</span>}</td>
                    <td className="px-2 py-2">{d.acao_codigo}<span className="block text-xs text-slate-500">{d.acao_descricao}</span></td>
                    <td className="px-2 py-2">{naturezaDaDotacao(d)}<span className="block text-xs text-slate-500">{d.subelemento_descricao ?? d.elemento_descricao}</span></td>
                    <td className="px-2 py-2">{d.fonte_codigo}<span className="block text-xs text-slate-500">{d.fonte_descricao}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      {!!q.data && q.data.total > 100 && <p className="mt-2 text-xs text-slate-500">Mostrando 100 de {q.data.total}. Refine a busca para achar as demais.</p>}
    </Modal>
  );
}

export function DotacoesContrato({ c }: { c: ContratoResumo }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['contrato-dotacoes', c.id], queryFn: () => listarDotacoesContrato(c.id) });
  const [selecionando, setSelecionando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const remover = useMutation({
    mutationFn: (id: string) => desvincularDotacao(c.id, id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['contrato-dotacoes', c.id] }); toast.success('Dotação desvinculada do contrato.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const podeEditar = pode('contratos', 'editar');
  const lista = q.data ?? [];
  const fontes = new Set(lista.map((d) => d.fonte_codigo)).size;
  const acoes = new Set(lista.map((d) => d.acao_codigo)).size;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">As dotações vêm do catálogo cadastrado no módulo Desenvolvedor (nada é digitado aqui). Cada empenho escolhe uma delas.</p>
        {podeEditar && <Botao icone={<Plus className="size-4" />} onClick={() => setSelecionando(true)}>Vincular dotações</Botao>}
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} /> : !lista.length
        ? <Vazio titulo="Nenhuma dotação vinculada" descricao="Vincule ao menos uma dotação para poder empenhar." /> : <>
          <p className="text-xs text-slate-500">{lista.length} dotação(ões) · {acoes} ação(ões) · {fontes} fonte(s) de recurso</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-2 py-2 font-medium">Exercício</th><th className="px-2 py-2 font-medium">Código da dotação</th><th className="px-2 py-2 font-medium">Ação</th>
                <th className="px-2 py-2 font-medium">Natureza</th><th className="px-2 py-2 font-medium">Fonte</th><th className="px-2 py-2 text-right font-medium">Empenhado</th><th />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((d) => (<Fragment key={d.id}>
                  <tr className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setAberta(aberta === d.id ? null : d.id)}>
                    <td className="px-2 py-2">{d.exercicio ?? 'Qualquer'}</td>
                    <td className="numero px-2 py-2 font-mono text-xs">{d.codigo_completo} {!d.ativo && <Selo tom="perigo">Inativa</Selo>}{d.descricao && <span className="block font-sans text-xs text-slate-500">{d.descricao}</span>}</td>
                    <td className="px-2 py-2">{d.acao_codigo}<span className="block text-xs text-slate-500">{d.acao_descricao}</span></td>
                    <td className="px-2 py-2">{naturezaDaDotacao(d)}<span className="block text-xs text-slate-500">{d.subelemento_descricao ?? d.elemento_descricao}</span></td>
                    <td className="px-2 py-2">{d.fonte_codigo}<span className="block text-xs text-slate-500">{d.fonte_descricao}</span></td>
                    <td className="numero px-2 py-2 text-right">{brl(d.empenhado)}<span className="block text-xs text-slate-500">{d.empenhos} empenho(s)</span></td>
                    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {podeEditar && <Botao pequeno variante="fantasma" icone={<Trash2 className="size-4 text-red-600" />} disabled={d.empenhos > 0}
                        title={d.empenhos > 0 ? 'Usada por empenho: não pode ser desvinculada' : 'Desvincular'} aria-label={`Desvincular ${d.codigo_completo}`}
                        carregando={remover.isPending && remover.variables === d.id} onClick={() => remover.mutate(d.id)} />}
                    </td>
                  </tr>
                  {aberta === d.id && <tr><td colSpan={7} className="px-2 pb-3"><ClassificacoesDaDotacao d={d} /></td></tr>}
                </Fragment>))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Clique numa linha para ver todas as classificações. Dotação já usada por empenho não pode ser desvinculada.</p>
        </>}
      <SelecionarDotacoes contrato={c} jaVinculadas={lista.map((d) => d.id)} aberto={selecionando} aoFechar={() => setSelecionando(false)} />
    </div>
  );
}
