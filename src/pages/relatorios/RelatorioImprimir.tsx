// Pré-visualização/impressão dos relatórios em A4 paisagem, com a identidade do órgão.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Fragment, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { ImagemPrivada } from '@/components/ImagemPrivada';
import { Botao, CaixaErro, Carregando } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl, formatarCentavos, formatarData, formatarDataHora } from '@/lib/formatacao';
import { obterConfiguracoes, registrarAcessoRelatorio } from './apoioImpressao';
import { relatorioConsumo, relatorioNotasTodas, relatorioTotais } from '@/services/relatorios';
import { descreverCriterios, paraServidor } from './filtros';
import { agruparPorAno, doc, METRICAS, type PedidoImpressao } from './Relatorios';

const SIT: Record<string, string> = { PENDENTE: 'Pendente', PARCIAL: 'Parcial', PAGO: 'Pago', CANCELADA: 'Cancelada' };
const th = 'border border-slate-400 bg-slate-100 px-1 py-0.5 text-left font-semibold';
const td = 'border border-slate-400 px-1 py-0.5 align-top break-words';

export function RelatorioImprimir() {
  const { orgao, contexto } = useSessao();
  const navegar = useNavigate();
  const pedido = (() => { try { return JSON.parse(sessionStorage.getItem('measure.relatorios') ?? 'null') as PedidoImpressao | null; } catch { return null; } })();
  const f = pedido ? paraServidor(pedido.estado) : null;
  const cfg = useQuery({ queryKey: ['configuracoes', orgao?.id], queryFn: () => obterConfiguracoes(orgao!.id), enabled: !!orgao });
  const dados = useQuery({
    queryKey: ['rel-imprimir', orgao?.id, JSON.stringify(pedido)], enabled: !!orgao && !!pedido,
    queryFn: async () => {
      if (pedido!.tipo === 'completo') {
        const [linhas, totais] = await Promise.all([relatorioNotasTodas(orgao!.id, f!), relatorioTotais(orgao!.id, f!)]);
        return { tipo: 'completo' as const, linhas, totais };
      }
      return { tipo: 'resumo' as const, linhas: await relatorioConsumo(orgao!.id, { ...f!, metrica: pedido!.metrica, detalhar: pedido!.detalhar }) };
    },
  });
  // A4 paisagem só nesta página
  useEffect(() => {
    const s = document.createElement('style');
    s.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(s);
    return () => s.remove();
  }, []);
  useEffect(() => { if (dados.data && orgao) void registrarAcessoRelatorio(orgao.id, pedido!.tipo, dados.data.linhas.length); }, [dados.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pedido) return <div className="p-6"><CaixaErro mensagem="Nenhuma consulta para imprimir. Volte em Consulta e relatórios." /></div>;
  if (dados.isLoading || cfg.isLoading) return <Carregando texto="Preparando o relatório…" />;
  if (dados.isError) return <div className="p-6"><CaixaErro mensagem={traduzirErro(dados.error).mensagem} /></div>;
  const d = dados.data!;
  const criterios = [...(pedido.tipo === 'resumo' ? [`Métrica do consumo: ${METRICAS[pedido.metrica]}`] : []), ...descreverCriterios(pedido.estado)];
  const titulo = pedido.tipo === 'completo' ? 'RELATÓRIO DE NOTAS FISCAIS POR CLASSIFICAÇÃO ORÇAMENTÁRIA' : 'RELATÓRIO RESUMIDO DE CONSUMO POR CONTRATO E CLASSIFICAÇÃO ORÇAMENTÁRIA';
  const agora = new Date().toISOString();

  return (
    <div className="min-h-dvh bg-slate-200 py-6 print:bg-white print:py-0">
      <div className="nao-imprimir mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-between gap-2 px-4">
        <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} onClick={() => navegar('/relatorios')}>Voltar aos filtros</Botao>
        <p className="text-xs text-slate-600">{d.linhas.length} linha(s). Use “Salvar como PDF” na janela de impressão.</p>
        <Botao icone={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / salvar PDF</Botao>
      </div>
      <article className="mx-auto bg-white px-[10mm] py-[8mm] text-slate-900 shadow-lg print:w-auto print:p-0 print:shadow-none" style={{ width: '297mm' }}>
        <header className="mb-3 flex items-center gap-4 border-b-2 border-slate-800 pb-2">
          <ImagemPrivada caminho={orgao?.logo_path} alt="Brasão" className="h-14 w-14 object-contain" alternativa={<span className="h-14 w-14" />} />
          <div className="flex-1 text-center">
            {(cfg.data?.documento_cabecalho.length ? cfg.data.documento_cabecalho : [orgao?.nome_oficial ?? '']).map((l, i) =>
              <p key={i} className={i === 0 ? 'text-[12px] font-bold' : 'text-[10.5px] font-semibold'}>{l}</p>)}
          </div>
          <span className="h-14 w-14" />
        </header>
        <h1 className="mb-2 text-center text-[13px] font-bold tracking-wide">{titulo}</h1>
        <section className="mb-3 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-[9.5px]">
          <p className="font-semibold uppercase tracking-wide">Critérios da consulta</p>
          {criterios.map((c, i) => <p key={i}>{c}</p>)}
        </section>
        {d.tipo === 'completo' ? (
          <table className="w-full table-fixed border-collapse text-[8.5px] leading-tight">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '7%' }} /><col style={{ width: '13%' }} /><col style={{ width: '14%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '6%' }} /><col style={{ width: '13%' }} /><col style={{ width: '8%' }} /><col style={{ width: '5%' }} />
            </colgroup>
            <thead className="table-header-group"><tr>
              <th className={th}>Ano</th><th className={th}>Nota / data</th><th className={th}>Fornecedor</th><th className={th}>Contrato / objeto</th><th className={th}>Empenho</th>
              <th className={th}>Ação</th><th className={th}>Elemento / subelemento</th><th className={th}>Fonte</th><th className={th}>Unidades atendidas</th>
              <th className={`${th} text-right`}>Valor</th><th className={th}>Situação</th>
            </tr></thead>
            <tbody>
              {d.totais.por_ano.map((a) => (
                <Fragment key={a.ano}>
                  {d.linhas.filter((l) => l.ano === a.ano).map((l) => (
                    <tr key={l.nota_id} className="break-inside-avoid">
                      <td className={td}>{l.ano}</td>
                      <td className={td}>{l.numero}{l.serie ? `-${l.serie}` : ''}<br />{formatarData(l.data_emissao)}</td>
                      <td className={td}>{l.fornecedor_nome}<br />{doc(l.fornecedor_tipo, l.fornecedor_documento)}</td>
                      <td className={td}>{l.contrato_numero}<br /><span className="text-slate-600">{l.contrato_objeto}</span></td>
                      <td className={td}>{l.empenho}</td>
                      <td className={td}>{l.acao_codigo} – {l.acao_descricao}</td>
                      <td className={td}>{l.elemento_codigo}{l.subelemento_codigo ? `.${l.subelemento_codigo}` : ''} – {l.subelemento_descricao ?? l.elemento_descricao}</td>
                      <td className={td}>{l.fonte_codigo}</td>
                      <td className={td}>{l.unidades ?? '—'}</td>
                      <td className={`${td} numero whitespace-nowrap text-right`}>{brl(l.valor)}</td>
                      <td className={td}>{l.cancelada ? 'Cancelada' : `${l.status_atesto === 'ATESTADA' ? 'Atestada' : 'Pend. atesto'} / ${SIT[l.status_pagamento]}`}</td>
                    </tr>
                  ))}
                  <tr className="break-inside-avoid bg-slate-50 font-semibold"><td className={td} colSpan={9}>Subtotal {a.ano} · {a.quantidade} nota(s)</td>
                    <td className={`${td} numero whitespace-nowrap text-right`}>{brl(a.valor)}</td><td className={td} /></tr>
                </Fragment>
              ))}
              <tr className="break-inside-avoid bg-slate-200 font-bold"><td className={td} colSpan={9}>Total geral · {d.totais.quantidade} nota(s) · pago {brl(d.totais.pago)}</td>
                <td className={`${td} numero whitespace-nowrap text-right`}>{brl(d.totais.valor)}</td><td className={td} /></tr>
            </tbody>
          </table>
        ) : (() => {
          const grupos = agruparPorAno(d.linhas);
          const det = pedido.detalhar;
          const cols = 6 + det.length;
          return (
            <table className="w-full table-fixed border-collapse text-[9px] leading-tight">
              <thead className="table-header-group"><tr>
                <th className={th} style={{ width: '5%' }}>Ano</th><th className={th} style={{ width: '17%' }}>Fornecedor</th><th className={th} style={{ width: '8%' }}>Contrato</th>
                <th className={th}>Objeto</th><th className={th} style={{ width: '14%' }}>Ação</th><th className={th} style={{ width: '12%' }}>Elemento</th>
                {det.includes('SUBELEMENTO') && <th className={th} style={{ width: '12%' }}>Subelemento</th>}
                {det.includes('FONTE') && <th className={th} style={{ width: '12%' }}>Fonte</th>}
                <th className={`${th} text-right`} style={{ width: '10%' }}>Valor consumido</th>
              </tr></thead>
              <tbody>
                {grupos.map((g) => (
                  <Fragment key={g.ano}>
                    {g.linhas.map((l, i) => (
                      <tr key={i} className="break-inside-avoid">
                        <td className={td}>{l.ano}</td><td className={td}>{l.fornecedor_nome}</td><td className={td}>{l.contrato_numero}</td><td className={td}>{l.contrato_objeto}</td>
                        <td className={td}>{l.acao_codigo} – {l.acao_descricao}</td><td className={td}>{l.elemento_codigo} – {l.elemento_descricao}</td>
                        {det.includes('SUBELEMENTO') && <td className={td}>{l.subelemento ?? '—'}</td>}
                        {det.includes('FONTE') && <td className={td}>{l.fonte}</td>}
                        <td className={`${td} numero whitespace-nowrap text-right`}>{brl(l.valor)}</td>
                      </tr>
                    ))}
                    <tr className="break-inside-avoid bg-slate-50 font-semibold"><td className={td} colSpan={cols}>Subtotal {g.ano}</td>
                      <td className={`${td} numero whitespace-nowrap text-right`}>{formatarCentavos(g.subtotal)}</td></tr>
                  </Fragment>
                ))}
                <tr className="bg-slate-200 font-bold"><td className={td} colSpan={cols}>Total geral</td>
                  <td className={`${td} numero whitespace-nowrap text-right`}>{formatarCentavos(grupos.reduce((s, g) => s + g.subtotal, 0))}</td></tr>
              </tbody>
            </table>
          );
        })()}
        <footer className="mt-4 border-t border-slate-300 pt-1.5 text-[8.5px] text-slate-600">
          {cfg.data?.documento_rodape && <p>{cfg.data.documento_rodape}</p>}
          <p>Emitido por {contexto?.perfil?.nome || contexto?.perfil?.email} em {formatarDataHora(agora)} · MEASURE</p>
        </footer>
      </article>
    </div>
  );
}

