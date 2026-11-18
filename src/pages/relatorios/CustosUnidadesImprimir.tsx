// PDF (A4 paisagem) do relatório de custos por unidade de saúde, para envio ao setor financeiro.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { ImagemPrivada } from '@/components/ImagemPrivada';
import { Botao, CaixaErro, Carregando } from '@/components/ui/basicos';
import { agruparCustos, descreverPeriodo, FORMAS, MESES_CURTOS } from '@/lib/custosUnidades';
import { traduzirErro } from '@/lib/erros';
import { formatarCentavos, formatarDataHora } from '@/lib/formatacao';
import { registrarExportacao, relatorioCustosUnidades } from '@/services/relatorios';
import { obterConfiguracoes } from './apoioImpressao';
import { criteriosCustos, docFornecedor, lerPedidoCustos, paraServidorCustos } from './CustosUnidades';

const pct = (v: number, t: number) => (t ? `${((v / t) * 100).toFixed(1).replace('.', ',')}%` : '—');
const cor = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as const;

export function CustosUnidadesImprimir() {
  const { orgao, contexto } = useSessao();
  const navegar = useNavigate();
  const pedido = lerPedidoCustos();
  const f = paraServidorCustos(pedido);
  const cfg = useQuery({ queryKey: ['configuracoes', orgao?.id], queryFn: () => obterConfiguracoes(orgao!.id), enabled: !!orgao });
  const q = useQuery({ queryKey: ['rel-custos-unidades', orgao?.id, JSON.stringify(f)], queryFn: () => relatorioCustosUnidades(orgao!.id, f), enabled: !!orgao });
  const r = useMemo(() => agruparCustos(q.data ?? []), [q.data]);
  const periodo = descreverPeriodo(pedido.ano, f.mes_inicio, f.mes_fim);
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
  const varios = r.meses.length > 1;
  const pendencias = r.alertas.DIVIDIDA + r.alertas.GRUPO + r.alertas.SEM_UNIDADE + r.alertas.LOCAL_ANTERIOR;
  const maior = Math.max(1, ...r.unidades.map((u) => u.total));

  return (
    <div className="min-h-dvh bg-slate-200 py-6 print:bg-white print:py-0" style={cor}>
      <div className="nao-imprimir mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-between gap-2 px-4">
        <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} onClick={() => navegar('/relatorios')}>Voltar</Botao>
        <p className="text-xs text-slate-600">Use “Salvar como PDF” na janela de impressão. Marque “Gráficos de fundo” para manter as cores.</p>
        <Botao variante="chamada" icone={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / salvar PDF</Botao>
      </div>

      <article className="mx-auto bg-white text-slate-900 shadow-lg print:w-auto print:shadow-none" style={{ width: '297mm', ...cor }}>
        {/* faixa institucional */}
        <header className="flex items-center gap-4 bg-gradient-to-r from-marca-950 via-marca-900 to-marca-800 px-[9mm] py-[5mm] text-white" style={cor}>
          <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-white p-1">
            <ImagemPrivada caminho={orgao?.logo_path} alt="Brasão" className="h-full w-full object-contain" alternativa={<span />} />
          </span>
          <div className="min-w-0 flex-1">
            {(cfg.data?.documento_cabecalho.length ? cfg.data.documento_cabecalho : [orgao?.nome_oficial ?? '']).map((l, i) =>
              <p key={i} className={i === 0 ? 'text-[12px] font-bold uppercase tracking-wide' : 'text-[10px] text-marca-100'}>{l}</p>)}
            <h1 className="mt-1.5 text-[19px] font-extrabold uppercase leading-tight tracking-tight">Informações de custos das unidades</h1>
            <span className="mt-1 block h-1 w-16 rounded-full bg-gradient-to-r from-acento-400 to-chamada-400" />
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-marca-100">Período (competência)</p>
            <p className="text-[15px] font-extrabold text-chamada-300">{periodo.toUpperCase()}</p>
            <p className="text-[10px] text-marca-100">Exercício {pedido.ano}</p>
          </div>
        </header>

        <div className="px-[9mm] py-[5mm]">
          {/* indicadores */}
          <section className="mb-4 grid grid-cols-4 gap-3 text-[10px]">
            {[
              ['Custo total do período', formatarCentavos(r.total), `pago: ${formatarCentavos(r.pago)}`],
              ['Unidades com custo', String(r.unidades.filter((u) => !u.especial).length), r.unidades.some((u) => u.especial) ? '+ notas sem unidade' : ''],
              ['Empresas', String(r.empresas.length), `${new Set(r.empresas.flatMap((e) => e.contratos)).size} contrato(s)`],
              ['Notas fiscais', String(r.notas), 'registradas e não canceladas'],
            ].map(([t, v, d]) => (
              <div key={t} className="rounded-lg border border-slate-200 border-l-4 border-l-acento-500 px-3 py-2" style={cor}>
                <p className="font-semibold uppercase tracking-wide text-slate-500">{t}</p>
                <p className="numero text-[17px] font-extrabold text-marca-900">{v}</p>
                {d && <p className="text-slate-500">{d}</p>}
              </div>
            ))}
          </section>

          {/* resumo por unidade */}
          <h2 className="mb-1.5 flex items-center gap-2 border-b-2 border-marca-900 pb-1 text-[12px] font-extrabold uppercase tracking-wide text-marca-900">
            <span className="h-3.5 w-1 rounded-full bg-acento-500" style={cor} />Resumo por unidade de saúde
          </h2>
          <table className="mb-5 w-full border-collapse text-[9.5px]">
            <thead className="table-header-group"><tr className="bg-marca-900 text-left text-white" style={cor}>
              <th className="px-2 py-1.5">Unidade de saúde</th><th className="px-2 py-1.5">Tipo</th><th className="px-2 py-1.5 text-center">Empresas</th>
              {varios && r.meses.map((m) => <th key={m} className="px-2 py-1.5 text-right">{MESES_CURTOS[m - 1]}</th>)}
              <th className="px-2 py-1.5 text-right">Total</th><th className="w-[22%] px-2 py-1.5">Participação</th>
            </tr></thead>
            <tbody>
              {r.unidades.map((u, i) => (
                <tr key={u.chave} className={i % 2 ? 'bg-slate-50' : ''} style={cor}>
                  <td className="px-2 py-1 font-semibold text-marca-900">{u.nome}</td><td className="px-2 py-1 text-slate-600">{u.tipo ?? '—'}</td>
                  <td className="px-2 py-1 text-center">{u.empresas}</td>
                  {varios && r.meses.map((m) => <td key={m} className="numero whitespace-nowrap px-2 py-1 text-right">{u.meses[m] ? formatarCentavos(u.meses[m]) : '—'}</td>)}
                  <td className="numero whitespace-nowrap px-2 py-1 text-right font-bold">{formatarCentavos(u.total)}</td>
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 flex-1 rounded-full bg-slate-200" style={cor}><span className="block h-2 rounded-full bg-acento-500" style={{ ...cor, width: `${(u.total / maior) * 100}%` }} /></span>
                      <span className="numero w-10 text-right">{pct(u.total, r.total)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-marca-900 font-bold text-white" style={cor}>
              <td className="px-2 py-1.5" colSpan={3}>TOTAL GERAL</td>
              {varios && r.meses.map((m) => <td key={m} className="numero whitespace-nowrap px-2 py-1.5 text-right">{formatarCentavos(r.porMes[m] ?? 0)}</td>)}
              <td className="numero whitespace-nowrap px-2 py-1.5 text-right text-chamada-300">{formatarCentavos(r.total)}</td><td className="px-2 py-1.5">100%</td>
            </tr></tfoot>
          </table>

          {/* detalhe por unidade */}
          <h2 className="mb-2 flex items-center gap-2 border-b-2 border-marca-900 pb-1 text-[12px] font-extrabold uppercase tracking-wide text-marca-900">
            <span className="h-3.5 w-1 rounded-full bg-acento-500" style={cor} />Detalhamento por unidade: empresas e contratos
          </h2>
          {r.unidades.map((u) => (
            <section key={u.chave} className="mb-3 break-inside-avoid overflow-hidden rounded-lg border border-slate-300">
              <div className={`flex items-center justify-between px-3 py-1.5 ${u.especial ? 'bg-amber-100 text-amber-950' : 'bg-marca-900 text-white'}`} style={cor}>
                <p className="text-[10.5px] font-bold uppercase tracking-wide">{u.nome}<span className="ml-2 text-[9px] font-normal normal-case opacity-80">{[u.tipo, `${u.empresas} empresa(s)`].filter(Boolean).join(' · ')}</span></p>
                <p className="numero text-[11px] font-extrabold">{formatarCentavos(u.total)} <span className="text-[9px] font-normal opacity-80">({pct(u.total, r.total)})</span></p>
              </div>
              <table className="w-full border-collapse text-[9px]">
                <thead><tr className="bg-marca-50 text-left text-marca-900" style={cor}>
                  <th className="px-2 py-1">Empresa</th><th className="px-2 py-1">CNPJ/CPF</th><th className="px-2 py-1">Contrato / objeto</th>
                  {varios && r.meses.map((m) => <th key={m} className="px-2 py-1 text-right">{MESES_CURTOS[m - 1]}</th>)}
                  <th className="px-2 py-1 text-right">Total</th>
                </tr></thead>
                <tbody>
                  {u.itens.map((it, i) => (
                    <tr key={it.chave} className={`align-top ${i % 2 ? 'bg-slate-50' : ''}`} style={cor}>
                      <td className="px-2 py-1 font-semibold">{it.fornecedor_nome}</td>
                      <td className="numero whitespace-nowrap px-2 py-1">{docFornecedor(it.fornecedor_tipo, it.fornecedor_documento)}</td>
                      <td className="px-2 py-1"><span className="font-medium">{it.contrato_numero}</span> <span className="text-slate-600">– {it.contrato_objeto}</span>
                        {it.formas.some((x) => x !== 'RATEIO' && x !== 'UNICA') && <span className="block text-[8px] italic text-amber-800">* {it.formas.filter((x) => x !== 'RATEIO' && x !== 'UNICA').map((x) => FORMAS[x]).join('; ')}</span>}</td>
                      {varios && r.meses.map((m) => <td key={m} className="numero whitespace-nowrap px-2 py-1 text-right">{it.meses[m] ? formatarCentavos(it.meses[m]) : '—'}</td>)}
                      <td className="numero whitespace-nowrap px-2 py-1 text-right font-bold">{formatarCentavos(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {/* regras e critérios */}
          <section className="mt-4 grid grid-cols-2 gap-3 text-[8.5px] leading-snug">
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-2" style={cor}>
              <p className="mb-0.5 font-bold uppercase tracking-wide text-marca-900">Critérios</p>
              {criteriosCustos(pedido).map((c) => <p key={c}>{c}</p>)}
            </div>
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-2" style={cor}>
              <p className="mb-0.5 font-bold uppercase tracking-wide text-marca-900">Como os valores foram distribuídos</p>
              <p>Cada nota entra no mês de competência (referência); nota de vários meses é dividida igualmente entre eles.</p>
              <p>Por unidade: o rateio informado na nota; uma só unidade recebe o valor inteiro; várias unidades sem valores: partes iguais (*).</p>
              {pendencias > 0 && <p className="mt-0.5 font-semibold text-amber-800">{formatarCentavos(pendencias)} ({pct(pendencias, r.total)}) sem o valor por unidade informado na nota (*).</p>}
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
