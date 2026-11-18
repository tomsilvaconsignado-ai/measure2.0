// Relatório mensal de custos por unidade de saúde (envio ao setor financeiro até o dia 25 de cada mês):
// quanto cada empresa/contrato custou em cada unidade, no período escolhido, com PDF e Excel.
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, ChevronDown, FileSpreadsheet, Info, Printer, Receipt, Truck, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { MultiBusca, type Item } from '@/components/ui/MultiBusca';
import { Botao, CaixaErro, Carregando, Vazio, cx } from '@/components/ui/basicos';
import { ListaSelecao } from '@/components/ui/ListaSelecao';
import { agruparCustos, descreverPeriodo, FORMAS, MESES_CURTOS, MESES_LONGOS, SITUACAO_PAGAMENTO, type GrupoContrato, type GrupoUnidade } from '@/lib/custosUnidades';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarCentavos, formatarCnpj, formatarCpf, formatarData } from '@/lib/formatacao';
import { supabase } from '@/lib/supabase';
import { buscarFornecedoresOpcoes, listarUnidadesAtendidas } from '@/services/cadastros';
import { anosComMovimento, registrarExportacao, relatorioCustosUnidades } from '@/services/relatorios';
import { exportarCustosUnidades } from './custosUnidadesExcel';

export const CHAVE_CUSTOS = 'measure.custos_unidades';
export interface Coordenacao { id: string; sigla: string | null; nome: string }
export interface PedidoCustos { ano: number; mesInicio: number; mesFim: number; fornecedores: Item[]; unidades: Item[]; coordenacao: Coordenacao | null }

const hoje = new Date();
export const pedidoPadrao = (): PedidoCustos => ({ ano: hoje.getFullYear(), mesInicio: hoje.getMonth() + 1, mesFim: hoje.getMonth() + 1, fornecedores: [], unidades: [], coordenacao: null });
export function lerPedidoCustos(): PedidoCustos {
  try { const s = sessionStorage.getItem(CHAVE_CUSTOS); return s ? { ...pedidoPadrao(), ...JSON.parse(s) as PedidoCustos } : pedidoPadrao(); } catch { return pedidoPadrao(); }
}
export const paraServidorCustos = (p: PedidoCustos) => ({
  ano: p.ano, mes_inicio: Math.min(p.mesInicio, p.mesFim), mes_fim: Math.max(p.mesInicio, p.mesFim),
  fornecedores: p.fornecedores.map((i) => i.id), unidades: p.unidades.map((i) => i.id), coordenacoes: p.coordenacao ? [p.coordenacao.id] : [],
});
/** Título no padrão do relatório da coordenação: "COINFRA SMS — Relatório Mensal de Gastos por Unidade de Saúde" */
export const tituloCustos = (p: PedidoCustos, orgao: string) => `${p.coordenacao ? `${p.coordenacao.sigla ?? p.coordenacao.nome} ` : ''}${orgao} — Relatório Mensal de Gastos por Unidade de Saúde`;
export function criteriosCustos(p: PedidoCustos) {
  const f = paraServidorCustos(p);
  return [
    `Período: ${descreverPeriodo(p.ano, f.mes_inicio, f.mes_fim)} (mês de competência das notas fiscais)`,
    `Coordenação: ${p.coordenacao ? `${p.coordenacao.sigla ? `${p.coordenacao.sigla} – ` : ''}${p.coordenacao.nome}` : 'todas'} (unidade responsável pelo contrato)`,
    `Empresas: ${p.fornecedores.length ? p.fornecedores.map((i) => i.rotulo).join('; ') : 'todas'}`,
    `Unidades de saúde: ${p.unidades.length ? p.unidades.map((i) => i.rotulo).join('; ') : 'todas'}`,
    'Notas fiscais registradas e não canceladas.',
  ];
}
export const docFornecedor = (tipo: string, d: string) => (tipo === 'PF' ? formatarCpf(d) : formatarCnpj(d));
const pct = (v: number, t: number) => (t ? `${((v / t) * 100).toFixed(1).replace('.', ',')}%` : '—');

function Indicador({ icone, rotulo, valor, detalhe }: { icone: ReactNode; rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 border-l-4 border-l-acento-500 bg-white p-3.5 shadow-sm">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-marca-900 text-white">{icone}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
        <span className="numero block truncate text-xl font-extrabold text-marca-900">{valor}</span>
        {detalhe && <span className="block text-xs text-slate-500">{detalhe}</span>}
      </span>
    </div>
  );
}

function BlocoUnidade({ u, total, meses, aberto, alternar }: { u: GrupoUnidade; total: number; meses: number[]; aberto: boolean; alternar: () => void }) {
  const varios = meses.length > 1;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={alternar} aria-expanded={aberto}
        className={cx('flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors', u.especial ? 'bg-amber-50 hover:bg-amber-100' : 'bg-marca-900 hover:bg-marca-800')}>
        <ChevronDown className={cx('size-4 shrink-0 transition-transform', !aberto && '-rotate-90', u.especial ? 'text-amber-800' : 'text-marca-100')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-sm font-bold uppercase tracking-wide', u.especial ? 'text-amber-900' : 'text-white')}>{u.nome}</span>
          <span className={cx('block text-xs', u.especial ? 'text-amber-800' : 'text-marca-100')}>
            {[u.tipo, u.grupo ? 'grupo' : null, `${u.empresas} empresa(s)`].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="text-right">
          <span className={cx('numero block text-lg font-extrabold', u.especial ? 'text-amber-900' : 'text-chamada-300')}>{formatarCentavos(u.total)}</span>
          <span className={cx('block text-xs', u.especial ? 'text-amber-800' : 'text-marca-100')}>{pct(u.total, total)} do total</span>
        </span>
      </button>
      <div className="h-1.5 bg-slate-100" aria-hidden><div className="h-full bg-acento-500" style={{ width: `${total ? Math.max(1, (u.total / total) * 100) : 0}%` }} /></div>
      {aberto && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr>
              <th className="text-left">Empresa</th><th className="text-left">Contrato</th>
              {varios && meses.map((m) => <th key={m} className="text-right">{MESES_CURTOS[m - 1]}</th>)}
              <th className="text-right">Total</th>
            </tr></thead>
            <tbody>
              {u.itens.map((it) => (
                <tr key={it.chave} className="align-top">
                  <td className="py-2"><span className="font-semibold text-marca-900">{it.fornecedor_nome}</span>
                    <span className="numero block text-xs text-slate-500">{docFornecedor(it.fornecedor_tipo, it.fornecedor_documento)}</span></td>
                  <td className="py-2"><span className="font-medium">{it.contrato_numero}</span>
                    <span className="line-clamp-2 block max-w-md text-xs text-slate-500">{it.contrato_objeto}</span>
                    {it.formas.some((f) => f !== 'RATEIO' && f !== 'UNICA') && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-800" title={it.formas.map((f) => FORMAS[f]).join('; ')}>
                        <Info className="size-3" aria-hidden />{it.formas.filter((f) => f !== 'RATEIO' && f !== 'UNICA').map((f) => FORMAS[f]).join('; ')}</span>
                    )}</td>
                  {varios && meses.map((m) => <td key={m} className="numero whitespace-nowrap py-2 text-right">{it.meses[m] ? formatarCentavos(it.meses[m]) : '—'}</td>)}
                  <td className="numero whitespace-nowrap py-2 text-right font-bold text-marca-900">{formatarCentavos(it.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={2}>Subtotal da unidade</td>
              {varios && meses.map((m) => <td key={m} className="numero whitespace-nowrap text-right">{formatarCentavos(u.meses[m] ?? 0)}</td>)}
              <td className="numero whitespace-nowrap text-right">{formatarCentavos(u.total)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

const TOM_SITUACAO: Record<string, string> = { PAGO: 'text-emerald-700', PARCIAL: 'text-sky-700', PENDENTE: 'text-amber-700', CANCELADA: 'text-slate-500' };

/** Bloco por empresa/contrato, no formato do relatório mensal da coordenação */
export function BlocoContrato({ k, meses }: { k: GrupoContrato; meses: number[] }) {
  void meses;
  const qtd = k.notas.length;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-marca-900 px-4 py-2.5 text-white">
        <h3 className="text-sm font-bold uppercase tracking-wide">{k.fornecedor_nome}</h3>
        <span className="numero text-xs text-marca-100">{k.fornecedor_tipo === 'PF' ? 'CPF' : 'CNPJ'}: {docFornecedor(k.fornecedor_tipo, k.fornecedor_documento)}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-1 bg-marca-50 px-4 py-2.5 text-xs sm:grid-cols-3">
        <div><dt className="inline text-slate-500">Contrato: </dt><dd className="inline font-semibold text-marca-900">{k.contrato_numero}</dd>
          {k.unidade && <span className="ml-1 text-slate-500">· {k.unidade}</span>}</div>
        <div><dt className="inline text-slate-500">Valor global: </dt><dd className="numero inline font-semibold">{formatarCentavos(k.valor)}</dd></div>
        <div><dt className="inline text-slate-500">Saldo restante: </dt>
          <dd className={cx('numero inline font-bold', k.saldo < 0 ? 'text-red-700' : 'text-emerald-700')}>{formatarCentavos(k.saldo)}</dd></div>
        <div><dt className="inline text-slate-500">Vigência: </dt><dd className="inline">{k.inicio ? formatarData(k.inicio) : '—'} a {k.fim ? formatarData(k.fim) : '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-slate-500">Objeto: </dt><dd className="inline">{k.contrato_objeto}</dd></div>
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr><th className="text-left">Unidade de saúde</th><th className="text-right">Valor no período</th><th className="text-right">Qtd. notas</th></tr></thead>
          <tbody>{k.unidades.map((u) => (
            <tr key={u.nome}><td className="py-1.5">{u.nome}</td><td className="numero whitespace-nowrap py-1.5 text-right font-semibold">{formatarCentavos(u.total)}</td>
              <td className="numero py-1.5 text-right">{u.notas}</td></tr>))}</tbody>
          <tfoot><tr><td>Total · {k.fornecedor_nome}</td><td className="numero whitespace-nowrap text-right">{formatarCentavos(k.total)}</td><td className="numero text-right">{qtd}</td></tr></tfoot>
        </table>
      </div>
      <details className="group border-t border-slate-200">
        <summary className="flex cursor-pointer list-none items-center gap-2 bg-slate-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white">
          <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden />Notas do período ({qtd} {qtd === 1 ? 'nota' : 'notas'})
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr><th className="text-left">Nº nota</th><th className="text-left">Referência</th><th className="text-left">Unidade / local</th>
              <th className="text-right">Valor</th><th className="text-left">Situação</th></tr></thead>
            <tbody>{k.notas.map((n) => (
              <tr key={n.id}><td className="py-1.5 font-semibold">{n.numero}</td><td className="py-1.5">{referenciaPorExtenso(n.referencias)}</td>
                <td className="max-w-xs py-1.5"><span className="line-clamp-2">{n.local}</span></td>
                <td className="numero whitespace-nowrap py-1.5 text-right">{formatarCentavos(n.valor)}{n.valor !== n.nota_valor && <span className="block text-[10px] text-slate-500">nota: {formatarCentavos(n.nota_valor)}</span>}</td>
                <td className={cx('py-1.5 font-bold uppercase', TOM_SITUACAO[n.status] ?? '')}>{SITUACAO_PAGAMENTO[n.status] ?? n.status}</td></tr>))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

/** "10/2026, 11/2026" → "Outubro/2026, Novembro/2026" */
export const referenciaPorExtenso = (refs: string) => refs.split(',').map((r) => r.trim()).filter(Boolean).map((r) => {
  const [m, a] = r.split('/');
  const nome = MESES_LONGOS[Number(m) - 1];
  return nome ? `${nome[0]!.toUpperCase()}${nome.slice(1)}/${a}` : r;
}).join(', ') || '—';

/** Consolidado geral por empresa/contrato (fecha o relatório, como no modelo da coordenação) */
export function ConsolidadoGeral({ resumo }: { resumo: ReturnType<typeof agruparCustos> }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <h3 className="bg-marca-950 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white">Consolidado geral</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr><th className="text-left">Empresa</th><th className="text-left">Contrato</th><th className="text-right">Total no período</th><th className="text-right">Qtd. notas</th><th className="text-right">% do total</th></tr></thead>
          <tbody>{resumo.contratos.map((k) => (
            <tr key={k.chave}><td className="py-1.5 font-semibold text-marca-900">{k.fornecedor_nome}</td><td className="py-1.5">{k.contrato_numero}</td>
              <td className="numero whitespace-nowrap py-1.5 text-right font-bold">{formatarCentavos(k.total)}</td><td className="numero py-1.5 text-right">{k.notas.length}</td>
              <td className="numero py-1.5 text-right">{pct(k.total, resumo.total)}</td></tr>))}</tbody>
          <tfoot><tr><td colSpan={2}>Total geral</td><td className="numero whitespace-nowrap text-right">{formatarCentavos(resumo.total)}</td><td className="numero text-right">{resumo.notas}</td><td className="text-right">100%</td></tr></tfoot>
        </table>
      </div>
    </section>
  );
}

export function CustosUnidades() {
  const { orgao, pode, contexto } = useSessao();
  const navegar = useNavigate();
  const [pedido, setPedido] = useState<PedidoCustos>(lerPedidoCustos);
  const [visao, setVisao] = useState<'contratos' | 'unidades'>('contratos');
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  useEffect(() => { try { sessionStorage.setItem(CHAVE_CUSTOS, JSON.stringify(pedido)); } catch { /* sem armazenamento */ } }, [pedido]);
  const set = <K extends keyof PedidoCustos>(k: K, v: PedidoCustos[K]) => setPedido((p) => ({ ...p, [k]: v }));
  const f = paraServidorCustos(pedido);
  const anos = useQuery({ queryKey: ['anos-movimento', orgao?.id], queryFn: () => anosComMovimento(orgao!.id), enabled: !!orgao });
  const coordenacoes = useQuery({
    queryKey: ['coordenacoes-foco', orgao?.id], enabled: !!orgao, staleTime: 5 * 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('coordenacoes_para_foco', { p_tenant: orgao!.id }); if (error) throw error; return data as Array<{ id: string; nome: string; sigla: string | null; diretoria: string | null }>; },
  });
  const anosDisponiveis = [...new Set([...(anos.data ?? []), hoje.getFullYear()])].sort((a, b) => b - a);
  const q = useQuery({
    queryKey: ['rel-custos-unidades', orgao?.id, JSON.stringify(f)], enabled: !!orgao,
    queryFn: () => relatorioCustosUnidades(orgao!.id, f), placeholderData: (a) => a,
  });
  const resumo = useMemo(() => agruparCustos(q.data ?? []), [q.data]);
  const periodo = descreverPeriodo(pedido.ano, f.mes_inicio, f.mes_fim);
  const excel = useMutation({
    mutationFn: async () => {
      const linhas = q.data ?? await relatorioCustosUnidades(orgao!.id, f);
      await exportarCustosUnidades({ resumo: agruparCustos(linhas), linhas, orgao: orgao!.nome_oficial, periodo, criterios: criteriosCustos(pedido), titulo: tituloCustos(pedido, orgao!.nome_curto),
        emitidoPor: contexto?.perfil?.nome || contexto?.perfil?.email || '' });
      await registrarExportacao(orgao!.id, 'relatorios', `Excel: custos por unidade de saúde (${periodo})`, linhas.length);
    },
    onSuccess: () => toast.success('Planilha gerada.'),
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const pendencias = resumo.alertas.DIVIDIDA + resumo.alertas.GRUPO + resumo.alertas.SEM_UNIDADE + resumo.alertas.LOCAL_ANTERIOR;

  return (
    <div className="flex flex-col gap-5">
      {/* filtros e ações */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-4 md:grid-cols-[8rem_10rem_10rem_1fr] md:items-start">
          <div className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Exercício</span>
            <ListaSelecao value={String(pedido.ano)} aria-label="Exercício" onChange={(e) => set('ano', Number(e.target.value))}>
              {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
            </ListaSelecao></div>
          <div className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Mês inicial</span>
            <ListaSelecao value={String(pedido.mesInicio)} aria-label="Mês inicial" onChange={(e) => set('mesInicio', Number(e.target.value))}>
              {MESES_LONGOS.map((m, i) => <option key={m} value={i + 1}>{m[0]!.toUpperCase() + m.slice(1)}</option>)}
            </ListaSelecao></div>
          <div className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Mês final</span>
            <ListaSelecao value={String(pedido.mesFim)} aria-label="Mês final" onChange={(e) => set('mesFim', Number(e.target.value))}>
              {MESES_LONGOS.map((m, i) => <option key={m} value={i + 1}>{m[0]!.toUpperCase() + m.slice(1)}</option>)}
            </ListaSelecao></div>
          <div className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Coordenação (do contrato)</span>
            <ListaSelecao value={pedido.coordenacao?.id ?? ''} aria-label="Coordenação" onChange={(e) => { const c = coordenacoes.data?.find((x) => x.id === e.target.value); set('coordenacao', c ? { id: c.id, sigla: c.sigla, nome: c.nome } : null); }}>
              <option value="">Todas as coordenações</option>
              {(coordenacoes.data ?? []).map((c) => <option key={c.id} value={c.id}>{[c.diretoria, c.sigla].filter(Boolean).join(' › ') || c.nome}</option>)}
            </ListaSelecao></div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start">
          <MultiBusca rotulo="Empresa(s)" itens={pedido.fornecedores} aoMudar={(v) => set('fornecedores', v)} chave={['cu-fornecedores', orgao?.id]}
            placeholder="Todas · razão social ou CNPJ"
            buscar={async (t) => (await buscarFornecedoresOpcoes(orgao!.id, t)).map((x) => ({ valor: x.id, rotulo: x.razao_social || x.nome_fantasia || '', detalhe: docFornecedor(x.tipo_pessoa, x.documento) }))} />
          <MultiBusca rotulo="Unidade(s) de saúde" itens={pedido.unidades} aoMudar={(v) => set('unidades', v)} chave={['cu-unidades', orgao?.id]}
            placeholder="Todas · nome da unidade"
            buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao!.id, busca: t, situacao: 'TODOS', limite: 20, offset: 0 })).itens.map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.tipo }))} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-sm text-slate-700">Período: <strong className="text-marca-900">{periodo}</strong> · pelo mês de competência das notas fiscais</p>
          <div className="flex flex-wrap gap-2">
            {pode('relatorios', 'exportar') && <Botao variante="sucesso" icone={<FileSpreadsheet className="size-4" />} carregando={excel.isPending}
              disabled={!q.data?.length} onClick={() => excel.mutate()}>Baixar Excel</Botao>}
            <Botao variante="chamada" icone={<Printer className="size-4" />} disabled={!q.data?.length}
              onClick={() => { sessionStorage.setItem(CHAVE_CUSTOS, JSON.stringify(pedido)); navegar('/relatorios/custos-unidades'); }}>Gerar PDF</Botao>
          </div>
        </div>
      </div>

      {q.isLoading ? <Carregando texto="Calculando os custos por unidade…" /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />
        : !resumo.unidades.length ? <Vazio titulo="Nenhum custo no período" descricao="Não há notas fiscais com competência nesses meses para os filtros escolhidos." /> : (
        <div className={cx('flex flex-col gap-5', q.isFetching && 'opacity-70')}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador icone={<Wallet className="size-5" />} rotulo="Custo total do período" valor={formatarCentavos(resumo.total)} detalhe={`pago ${formatarCentavos(resumo.pago)}`} />
            <Indicador icone={<Building2 className="size-5" />} rotulo="Unidades com custo" valor={resumo.unidades.filter((u) => !u.especial).length} />
            <Indicador icone={<Truck className="size-5" />} rotulo="Empresas / contratos" valor={resumo.empresas.length} detalhe={`${new Set(resumo.empresas.flatMap((e) => e.contratos)).size} contrato(s)`} />
            <Indicador icone={<Receipt className="size-5" />} rotulo="Notas fiscais" valor={resumo.notas} />
          </div>

          {pendencias > 0 && (
            <div className="flex flex-wrap items-start gap-3 rounded-xl border-l-4 border-chamada-500 bg-chamada-300/25 p-3 text-sm text-marca-950">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{formatarCentavos(pendencias)} ({pct(pendencias, resumo.total)}) não têm o valor por unidade informado na nota.</p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  {(['DIVIDIDA', 'GRUPO', 'LOCAL_ANTERIOR', 'SEM_UNIDADE'] as const).filter((k) => resumo.alertas[k]).map((k) => (
                    <li key={k}>{FORMAS[k]}: <strong className="numero">{formatarCentavos(resumo.alertas[k])}</strong></li>))}
                </ul>
                <p className="mt-1 text-xs">Para o custo exato de cada unidade, informe o rateio por unidade nas notas fiscais.</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1" role="tablist" aria-label="Visão do relatório">
              {([['contratos', 'Por empresa e contrato'], ['unidades', 'Por unidade de saúde']] as const).map(([v, r]) => (
                <button key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => setVisao(v)}
                  className={cx('rounded-lg px-3.5 py-1.5 text-sm font-semibold', visao === v ? 'bg-marca-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white')}>{r}</button>
              ))}
            </div>
            {visao === 'unidades' && <div className="flex gap-2 text-xs">
              <button type="button" className="font-semibold text-marca-700 hover:underline" onClick={() => setFechados(new Set())}>Abrir todas</button>
              <button type="button" className="font-semibold text-marca-700 hover:underline" onClick={() => setFechados(new Set(resumo.unidades.map((u) => u.chave)))}>Recolher todas</button>
            </div>}
          </div>

          {visao === 'contratos' ? (
            <div className="flex flex-col gap-3">
              {resumo.contratos.map((k) => <BlocoContrato key={k.chave} k={k} meses={resumo.meses} />)}
              <ConsolidadoGeral resumo={resumo} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {resumo.unidades.map((u) => (
                <BlocoUnidade key={u.chave} u={u} total={resumo.total} meses={resumo.meses} aberto={!fechados.has(u.chave)}
                  alternar={() => setFechados((s) => { const n = new Set(s); if (n.has(u.chave)) n.delete(u.chave); else n.add(u.chave); return n; })} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
