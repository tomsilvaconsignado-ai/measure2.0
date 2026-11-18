// PDF (A4 paisagem) do relatório mensal de gastos por unidade de saúde, para envio ao setor financeiro.
// Mesma estrutura do relatório usado pela coordenação: por empresa/contrato (dados do contrato, valor por
// unidade com quantidade de notas e as notas do período com a situação) e o consolidado geral; ao final,
// o resumo por unidade de saúde e as regras de distribuição.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { ImagemPrivada } from '@/components/ImagemPrivada';
import { Botao, CaixaErro, Carregando } from '@/components/ui/basicos';
import { agruparCustos, descreverPeriodo, FORMAS, SITUACAO_PAGAMENTO } from '@/lib/custosUnidades';
import { traduzirErro } from '@/lib/erros';
import { formatarCentavos, formatarData, formatarDataHora } from '@/lib/formatacao';
import { registrarExportacao, relatorioCustosUnidades } from '@/services/relatorios';
import { obterConfiguracoes } from './apoioImpressao';
import { criteriosCustos, docFornecedor, lerPedidoCustos, paraServidorCustos, referenciaPorExtenso, tituloCustos } from './CustosUnidades';

const pct = (v: number, t: number) => (t ? `${((v / t) * 100).toFixed(1).replace('.', ',')}%` : '—');
const cor = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as const;
const SIT_COR: Record<string, string> = { PAGO: 'text-emerald-700', PARCIAL: 'text-sky-700', PENDENTE: 'text-amber-700' };

export function CustosUnidadesImprimir() {
  const { orgao, contexto } = useSessao();
  const navegar = useNavigate();
  const pedido = lerPedidoCustos();
  const f = paraServidorCustos(pedido);
  const cfg = useQuery({ queryKey: ['configuracoes', orgao?.id], queryFn: () => obterConfiguracoes(orgao!.id), enabled: !!orgao });
  const q = useQuery({ queryKey: ['rel-custos-unidades', orgao?.id, JSON.stringify(f)], queryFn: () => relatorioCustosUnidades(orgao!.id, f), enabled: !!orgao });
  const r = useMemo(() => agruparCustos(q.data ?? []), [q.data]);
  const periodo = descreverPeriodo(pedido.ano, f.mes_inicio, f.mes_fim);
  const periodoCurto = f.mes_inicio === 1 && f.mes_fim === 12 ? `TODOS/${pedido.ano}` : periodo.toUpperCase();
  useEffect(() => {
    const s = document.createElement('style');
    s.textContent = '@page { size: A4 landscape; margin: 9mm; }';
    document.head.appendChild(s);
    return () => s.remove();
  }, []);
  // a impressão/PDF conta como exportação na auditoria (sem permissão de exportar, só visualiza)
  useEffect(() => { if (q.data && orgao) registrarExportacao(orgao.id, 'relatorios', `PDF: custos por unidade de saúde (${periodo})`, q.data.length).catch(() => undefined); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading || cfg.isLoading) return <Carregando texto="Preparando o relatório…" />;
  if (q.isError) return <div className="p-6"><CaixaErro mensagem={traduzirErro(q.error).mensagem} /></div>;
  const pendencias = r.alertas.DIVIDIDA + r.alertas.GRUPO + r.alertas.SEM_UNIDADE + r.alertas.LOCAL_ANTERIOR;
  const maior = Math.max(1, ...r.unidades.map((u) => u.total));
  const titulo = tituloCustos(pedido, orgao?.nome_curto ?? '');
  const secao = (t: string) => (
    <h2 className="mb-2 mt-1 flex items-center gap-2 border-b-2 border-marca-900 pb-1 text-[12px] font-extrabold uppercase tracking-wide text-marca-900">
      <span className="h-3.5 w-1 rounded-full bg-acento-500" style={cor} />{t}
    </h2>
  );

  return (
    <div className="min-h-dvh bg-slate-200 py-6 print:bg-white print:py-0" style={cor}>
      <div className="nao-imprimir mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-between gap-2 px-4">
        <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} onClick={() => navegar('/relatorios')}>Voltar</Botao>
        <p className="text-xs text-slate-600">Use “Salvar como PDF” na janela de impressão e marque “Gráficos de fundo” para manter as cores.</p>
        <Botao variante="chamada" icone={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / salvar PDF</Botao>
      </div>

      <article className="mx-auto bg-white text-slate-900 shadow-lg print:w-auto print:shadow-none" style={{ width: '297mm', ...cor }}>
        {/* faixa institucional */}
        <header className="flex items-center gap-4 bg-gradient-to-r from-marca-950 via-marca-900 to-marca-800 px-[9mm] py-[5mm] text-white" style={cor}>
          <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-white p-1">
            <ImagemPrivada caminho={orgao?.logo_path} alt="Brasão" className="h-full w-full object-contain" alternativa={<span />} />
          </span>
          <div className="min-w-0 flex-1">
            {(cfg.data?.documento_cabecalho.length ? cfg.data.documento_cabecalho : [orgao?.nome_oficial ?? '']).slice(0, 2).map((l, i) =>
              <p key={i} className={i === 0 ? 'text-[11px] font-bold uppercase tracking-wide' : 'text-[9.5px] text-marca-100'}>{l}</p>)}
            <h1 className="mt-1.5 text-[17px] font-extrabold leading-tight">{titulo}</h1>
            <span className="mt-1 block h-1 w-16 rounded-full bg-gradient-to-r from-acento-400 to-chamada-400" />
          </div>
          <div className="text-right">
            <p className="text-[9.5px] uppercase tracking-wide text-marca-100">Período (competência)</p>
            <p className="text-[15px] font-extrabold text-chamada-300">{periodoCurto}</p>
            <p className="text-[9.5px] text-marca-100">Gerado em {formatarDataHora(new Date().toISOString())}</p>
          </div>
        </header>

        <div className="px-[9mm] py-[5mm]">
          {/* indicadores */}
          <section className="mb-4 grid grid-cols-4 gap-3 text-[10px]">
            {[
              ['Total do período', formatarCentavos(r.total), `pago: ${formatarCentavos(r.pago)}`],
              ['Empresas / contratos', `${r.empresas.length} / ${r.contratos.length}`, ''],
              ['Unidades de saúde', String(r.unidades.filter((u) => !u.especial).length), 'com custo no período'],
              ['Notas fiscais', String(r.notas), 'registradas e não canceladas'],
            ].map(([t, v, d]) => (
              <div key={t} className="rounded-lg border border-slate-200 border-l-4 border-l-acento-500 px-3 py-2" style={cor}>
                <p className="font-semibold uppercase tracking-wide text-slate-500">{t}</p>
                <p className="numero text-[17px] font-extrabold text-marca-900">{v}</p>
                {d && <p className="text-slate-500">{d}</p>}
              </div>
            ))}
          </section>

          {/* por empresa/contrato */}
          {r.contratos.map((k) => (
            <section key={k.chave} className="mb-4 overflow-hidden rounded-lg border border-slate-300">
              <div className="flex items-center justify-between bg-marca-900 px-3 py-1.5 text-white" style={cor}>
                <p className="text-[11px] font-bold uppercase tracking-wide">{k.fornecedor_nome}</p>
                <p className="numero text-[9.5px] text-marca-100">{k.fornecedor_tipo === 'PF' ? 'CPF' : 'CNPJ'}: {docFornecedor(k.fornecedor_tipo, k.fornecedor_documento)}</p>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 bg-marca-50 px-3 py-1.5 text-[9.5px]" style={cor}>
                <p>Contrato: <strong>{k.contrato_numero}</strong>{k.unidade ? ` · ${k.unidade}` : ''}</p>
                <p>Valor global: <strong className="numero">{formatarCentavos(k.valor)}</strong></p>
                <p className={`font-bold ${k.saldo < 0 ? 'text-red-700' : 'text-emerald-700'}`}>Saldo restante: <span className="numero">{formatarCentavos(k.saldo)}</span></p>
                <p>Vigência: {k.inicio ? formatarData(k.inicio) : '—'} a {k.fim ? formatarData(k.fim) : '—'}</p>
                <p className="col-span-2">Objeto: {k.contrato_objeto}</p>
              </div>
              <table className="w-full border-collapse text-[9.5px]">
                <thead><tr className="bg-slate-100 text-left text-slate-700" style={cor}>
                  <th className="px-3 py-1">Unidade de saúde</th><th className="w-36 px-3 py-1 text-right">Valor no período</th><th className="w-24 px-3 py-1 text-right">Qtd. notas</th>
                </tr></thead>
                <tbody>{k.unidades.map((u, i) => (
                  <tr key={u.nome} className={i % 2 ? 'bg-slate-50' : ''} style={cor}>
                    <td className="px-3 py-0.5">{u.nome}</td><td className="numero px-3 py-0.5 text-right">{formatarCentavos(u.total)}</td><td className="px-3 py-0.5 text-right">{u.notas}</td>
                  </tr>))}</tbody>
                <tfoot><tr className="bg-marca-700 font-bold text-white" style={cor}>
                  <td className="px-3 py-1 uppercase">Total · {k.fornecedor_nome}</td><td className="numero px-3 py-1 text-right">{formatarCentavos(k.total)}</td><td className="px-3 py-1 text-right">{k.notas.length}</td>
                </tr></tfoot>
              </table>
              <p className="bg-slate-600 px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-white" style={cor}>Notas do período ({k.notas.length} {k.notas.length === 1 ? 'nota' : 'notas'})</p>
              <table className="w-full border-collapse text-[9px]">
                <thead><tr className="bg-slate-100 text-left text-slate-700" style={cor}>
                  <th className="w-20 px-3 py-1">Nº nota</th><th className="w-36 px-3 py-1">Referência</th><th className="px-3 py-1">Unidade / local</th>
                  <th className="w-32 px-3 py-1 text-right">Valor</th><th className="w-24 px-3 py-1">Situação</th>
                </tr></thead>
                <tbody>{k.notas.map((n, i) => (
                  <tr key={n.id} className={`break-inside-avoid ${i % 2 ? 'bg-slate-50' : ''}`} style={cor}>
                    <td className="px-3 py-0.5 font-semibold">{n.numero}</td><td className="px-3 py-0.5">{referenciaPorExtenso(n.referencias)}</td>
                    <td className="px-3 py-0.5">{n.local}</td>
                    <td className="numero px-3 py-0.5 text-right">{formatarCentavos(n.valor)}{n.valor !== n.nota_valor && <span className="text-[8px] text-slate-500"> (nota {formatarCentavos(n.nota_valor)})</span>}</td>
                    <td className={`px-3 py-0.5 font-bold uppercase ${SIT_COR[n.status] ?? ''}`}>{SITUACAO_PAGAMENTO[n.status] ?? n.status}</td>
                  </tr>))}</tbody>
              </table>
            </section>
          ))}

          {/* consolidado geral */}
          <section className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-slate-300">
            <p className="bg-marca-950 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white" style={cor}>Consolidado geral</p>
            <table className="w-full border-collapse text-[9.5px]">
              <thead><tr className="bg-slate-100 text-left text-slate-700" style={cor}>
                <th className="px-3 py-1">Empresa</th><th className="w-28 px-3 py-1">Contrato</th><th className="w-36 px-3 py-1 text-right">Total no período</th>
                <th className="w-24 px-3 py-1 text-right">Qtd. notas</th><th className="w-20 px-3 py-1 text-right">% do total</th>
              </tr></thead>
              <tbody>{r.contratos.map((k, i) => (
                <tr key={k.chave} className={i % 2 ? 'bg-slate-50' : ''} style={cor}>
                  <td className="px-3 py-0.5">{k.fornecedor_nome}</td><td className="px-3 py-0.5">{k.contrato_numero}</td>
                  <td className="numero px-3 py-0.5 text-right font-semibold">{formatarCentavos(k.total)}</td><td className="px-3 py-0.5 text-right">{k.notas.length}</td>
                  <td className="numero px-3 py-0.5 text-right">{pct(k.total, r.total)}</td>
                </tr>))}</tbody>
              <tfoot><tr className="bg-marca-950 font-extrabold text-white" style={cor}>
                <td className="px-3 py-1.5" colSpan={2}>TOTAL GERAL</td><td className="numero px-3 py-1.5 text-right text-chamada-300">{formatarCentavos(r.total)}</td>
                <td className="px-3 py-1.5 text-right">{r.notas}</td><td className="px-3 py-1.5 text-right">100%</td>
              </tr></tfoot>
            </table>
          </section>

          {/* resumo por unidade de saúde (centro de custo) */}
          <div className="break-inside-avoid">
            {secao('Resumo por unidade de saúde (centro de custo)')}
            <table className="mb-4 w-full border-collapse text-[9px]">
              <thead><tr className="bg-marca-900 text-left text-white" style={cor}>
                <th className="px-2 py-1">Unidade de saúde</th><th className="px-2 py-1">Tipo</th><th className="px-2 py-1 text-center">Empresas</th>
                <th className="px-2 py-1 text-right">Total</th><th className="w-[24%] px-2 py-1">Participação</th>
              </tr></thead>
              <tbody>{r.unidades.map((u, i) => (
                <tr key={u.chave} className={i % 2 ? 'bg-slate-50' : ''} style={cor}>
                  <td className="px-2 py-0.5 font-semibold text-marca-900">{u.nome}</td><td className="px-2 py-0.5 text-slate-600">{u.tipo ?? '—'}</td>
                  <td className="px-2 py-0.5 text-center">{u.empresas}</td><td className="numero whitespace-nowrap px-2 py-0.5 text-right font-bold">{formatarCentavos(u.total)}</td>
                  <td className="px-2 py-0.5"><span className="flex items-center gap-1.5">
                    <span className="h-2 flex-1 rounded-full bg-slate-200" style={cor}><span className="block h-2 rounded-full bg-acento-500" style={{ ...cor, width: `${(u.total / maior) * 100}%` }} /></span>
                    <span className="numero w-10 text-right">{pct(u.total, r.total)}</span></span></td>
                </tr>))}</tbody>
            </table>
          </div>

          {/* critérios e regras */}
          <section className="grid grid-cols-2 gap-3 text-[8.5px] leading-snug">
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-2" style={cor}>
              <p className="mb-0.5 font-bold uppercase tracking-wide text-marca-900">Critérios</p>
              {criteriosCustos(pedido).map((c) => <p key={c}>{c}</p>)}
            </div>
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-2" style={cor}>
              <p className="mb-0.5 font-bold uppercase tracking-wide text-marca-900">Como os valores foram distribuídos</p>
              <p>Cada nota entra no mês de competência (referência); nota de vários meses é dividida igualmente entre eles.</p>
              <p>Por unidade: o rateio informado na nota; uma só unidade recebe o valor inteiro; várias unidades sem valores: partes iguais.</p>
              {pendencias > 0 && <p className="mt-0.5 font-semibold text-amber-800">{formatarCentavos(pendencias)} ({pct(pendencias, r.total)}) sem o valor por unidade informado na nota: {(['DIVIDIDA', 'GRUPO', 'LOCAL_ANTERIOR', 'SEM_UNIDADE'] as const).filter((x) => r.alertas[x]).map((x) => FORMAS[x].toLowerCase()).join('; ')}.</p>}
            </div>
          </section>
          <footer className="mt-3 flex justify-between border-t border-slate-300 pt-1.5 text-[8.5px] text-slate-500">
            <span>MEASURE 2.0 · Gestão de contratos e despesas públicas</span>
            <span>Emitido em {formatarDataHora(new Date().toISOString())} por {contexto?.perfil?.nome || contexto?.perfil?.email}</span>
          </footer>
        </div>
      </article>
    </div>
  );
}
