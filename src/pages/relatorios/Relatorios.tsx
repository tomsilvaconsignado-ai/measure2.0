import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Abas } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, CaixaErro, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Vazio, cx } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, centavos, formatarCentavos, formatarCnpj, formatarCpf, formatarData } from '@/lib/formatacao';
import { baixarExcel } from '@/lib/planilhas';
import { registrarExportacao, relatorioConsumo, relatorioNotas, relatorioNotasTodas, relatorioTotais, type Filtros, type LinhaConsumo, type LinhaNota } from '@/services/relatorios';
import { descreverCriterios, filtrosVazios, PainelFiltros, paraServidor, type EstadoFiltros } from './filtros';

const POR_PAGINA = 50;
const CHAVE = 'measure.relatorios';
type Tipo = 'completo' | 'resumo';
const SIT_PAG: Record<string, string> = { PENDENTE: 'Pendente', PARCIAL: 'Parcial', PAGO: 'Pago', CANCELADA: 'Cancelada' };
const METRICAS = { NOTAS: 'Notas fiscais registradas (não canceladas)', PAGO: 'Valor pago', EMPENHADO: 'Valor empenhado (com reforços)' } as const;
export const doc = (tipo: string, d: string) => (tipo === 'PF' ? formatarCpf(d) : formatarCnpj(d));

export interface PedidoImpressao { tipo: Tipo; estado: EstadoFiltros; metrica: keyof typeof METRICAS; detalhar: Array<'SUBELEMENTO' | 'FONTE'> }

function lerSalvo(): PedidoImpressao | null {
  try { const s = sessionStorage.getItem(CHAVE); return s ? JSON.parse(s) as PedidoImpressao : null; } catch { return null; }
}

/** Agrupa o resumo por ano com subtotais (o servidor já soma por classificação) */
export function agruparPorAno(linhas: LinhaConsumo[]) {
  const anos = new Map<number, LinhaConsumo[]>();
  for (const l of linhas) anos.set(l.ano, [...(anos.get(l.ano) ?? []), l]);
  return [...anos.entries()].sort((a, b) => a[0] - b[0]).map(([ano, ls]) => ({ ano, linhas: ls, subtotal: ls.reduce((s, l) => s + centavos(l.valor), 0) }));
}

async function exportarCompleto(tenantId: string, f: Filtros, criterios: string[]) {
  const [linhas, totais] = await Promise.all([relatorioNotasTodas(tenantId, f), relatorioTotais(tenantId, f)]);
  await baixarExcel(`relatorio-notas-classificacao-${new Date().toISOString().slice(0, 10)}`, [
    { nome: 'Notas', linhas, colunas: [
      { titulo: 'Ano', valor: (l: LinhaNota) => l.ano, tipo: 'numero', largura: 8 },
      { titulo: 'Nota fiscal', valor: (l: LinhaNota) => (l.serie ? `${l.numero}-${l.serie}` : l.numero), largura: 12 },
      { titulo: 'Data da nota', valor: (l: LinhaNota) => l.data_emissao, tipo: 'data' },
      { titulo: 'Fornecedor', valor: (l: LinhaNota) => l.fornecedor_nome, largura: 36 },
      { titulo: 'CNPJ/CPF', valor: (l: LinhaNota) => doc(l.fornecedor_tipo, l.fornecedor_documento), largura: 20 },
      { titulo: 'Contrato', valor: (l: LinhaNota) => l.contrato_numero, largura: 12 },
      { titulo: 'Objeto do contrato', valor: (l: LinhaNota) => l.contrato_objeto, largura: 50 },
      { titulo: 'Empenho', valor: (l: LinhaNota) => l.empenho, largura: 14 },
      { titulo: 'Processo', valor: (l: LinhaNota) => l.processo, largura: 16 },
      { titulo: 'Órgão', valor: (l: LinhaNota) => l.orgao, largura: 24 },
      { titulo: 'Unidade orçamentária', valor: (l: LinhaNota) => l.unidade_orcamentaria, largura: 24 },
      { titulo: 'Função', valor: (l: LinhaNota) => l.funcao, largura: 20 },
      { titulo: 'Subfunção', valor: (l: LinhaNota) => l.subfuncao, largura: 20 },
      { titulo: 'Programa', valor: (l: LinhaNota) => l.programa, largura: 24 },
      { titulo: 'Ação', valor: (l: LinhaNota) => l.acao_codigo, largura: 8 },
      { titulo: 'Descrição da ação', valor: (l: LinhaNota) => l.acao_descricao, largura: 36 },
      { titulo: 'Projeto/Atividade/Op. especial', valor: (l: LinhaNota) => ({ PROJETO: 'Projeto', ATIVIDADE: 'Atividade', OPERACAO_ESPECIAL: 'Operação especial' } as Record<string, string>)[l.natureza_acao ?? ''] ?? '', largura: 16 },
      { titulo: 'Categoria econômica', valor: (l: LinhaNota) => l.categoria, largura: 20 },
      { titulo: 'GND', valor: (l: LinhaNota) => l.gnd, largura: 20 },
      { titulo: 'Modalidade de aplicação', valor: (l: LinhaNota) => l.modalidade, largura: 20 },
      { titulo: 'Elemento', valor: (l: LinhaNota) => l.elemento_codigo, largura: 9 },
      { titulo: 'Descrição do elemento', valor: (l: LinhaNota) => l.elemento_descricao, largura: 32 },
      { titulo: 'Subelemento', valor: (l: LinhaNota) => l.subelemento_codigo, largura: 11 },
      { titulo: 'Descrição do subelemento', valor: (l: LinhaNota) => l.subelemento_descricao, largura: 32 },
      { titulo: 'Fonte', valor: (l: LinhaNota) => l.fonte_codigo, largura: 8 },
      { titulo: 'Descrição da fonte', valor: (l: LinhaNota) => l.fonte_descricao, largura: 32 },
      { titulo: 'Detalhamento da fonte', valor: (l: LinhaNota) => l.detalhamento, largura: 24 },
      { titulo: 'Classificação completa', valor: (l: LinhaNota) => l.codigo_completo, largura: 32 },
      { titulo: 'Unidades atendidas', valor: (l: LinhaNota) => l.unidades, largura: 40 },
      { titulo: 'Meses de referência', valor: (l: LinhaNota) => l.meses_referencia, largura: 18 },
      { titulo: 'Valor da nota', valor: (l: LinhaNota) => l.valor, tipo: 'moeda', largura: 16 },
      { titulo: 'Valor pago', valor: (l: LinhaNota) => l.pago, tipo: 'moeda', largura: 16 },
      { titulo: 'Atesto', valor: (l: LinhaNota) => (l.status_atesto === 'ATESTADA' ? 'Atestada' : 'Pendente'), largura: 11 },
      { titulo: 'Pagamento', valor: (l: LinhaNota) => SIT_PAG[l.status_pagamento] ?? l.status_pagamento, largura: 11 },
      { titulo: 'Cancelada', valor: (l: LinhaNota) => (l.cancelada ? 'Sim' : 'Não'), largura: 10 },
    ] },
    { nome: 'Totais por ano', linhas: [...totais.por_ano, { ano: 'Total geral', quantidade: totais.quantidade, valor: totais.valor, pago: totais.pago }], colunas: [
      { titulo: 'Ano', valor: (t: { ano: number | string }) => t.ano, largura: 12 },
      { titulo: 'Quantidade de notas', valor: (t: { quantidade: number }) => t.quantidade, tipo: 'numero', largura: 18 },
      { titulo: 'Valor das notas', valor: (t: { valor: unknown }) => t.valor, tipo: 'moeda', largura: 18 },
      { titulo: 'Valor pago', valor: (t: { pago: unknown }) => t.pago, tipo: 'moeda', largura: 18 },
    ] },
    { nome: 'Critérios', linhas: criterios, colunas: [{ titulo: 'Critérios da consulta', valor: (c: string) => c, largura: 100 }] },
  ]);
  return linhas.length;
}

async function exportarResumo(linhas: LinhaConsumo[], detalhar: string[], metrica: keyof typeof METRICAS, criterios: string[]) {
  const grupos = agruparPorAno(linhas);
  await baixarExcel(`relatorio-consumo-resumido-${new Date().toISOString().slice(0, 10)}`, [
    { nome: 'Consumo', linhas, colunas: [
      { titulo: 'Ano', valor: (l: LinhaConsumo) => l.ano, tipo: 'numero', largura: 8 },
      { titulo: 'Fornecedor', valor: (l: LinhaConsumo) => l.fornecedor_nome, largura: 36 },
      { titulo: 'Número do contrato', valor: (l: LinhaConsumo) => l.contrato_numero, largura: 14 },
      { titulo: 'Objeto', valor: (l: LinhaConsumo) => l.contrato_objeto, largura: 50 },
      { titulo: 'Número da ação', valor: (l: LinhaConsumo) => l.acao_codigo, largura: 10 },
      { titulo: 'Descrição da ação', valor: (l: LinhaConsumo) => l.acao_descricao, largura: 32 },
      { titulo: 'Elemento de despesa', valor: (l: LinhaConsumo) => l.elemento_codigo, largura: 10 },
      { titulo: 'Descrição do elemento', valor: (l: LinhaConsumo) => l.elemento_descricao, largura: 30 },
      ...(detalhar.includes('SUBELEMENTO') ? [{ titulo: 'Subelemento', valor: (l: LinhaConsumo) => l.subelemento, largura: 30 }] : []),
      ...(detalhar.includes('FONTE') ? [{ titulo: 'Fonte', valor: (l: LinhaConsumo) => l.fonte, largura: 30 }] : []),
      { titulo: `Valor consumido (${METRICAS[metrica]})`, valor: (l: LinhaConsumo) => l.valor, tipo: 'moeda' as const, largura: 20 },
    ] },
    { nome: 'Totais por ano', linhas: [...grupos.map((g) => ({ ano: g.ano, valor: g.subtotal / 100 })), { ano: 'Total geral', valor: grupos.reduce((s, g) => s + g.subtotal, 0) / 100 }], colunas: [
      { titulo: 'Ano', valor: (t: { ano: number | string }) => t.ano, largura: 12 },
      { titulo: 'Valor consumido', valor: (t: { valor: number }) => t.valor, tipo: 'moeda', largura: 20 },
    ] },
    { nome: 'Critérios', linhas: [`Métrica do consumo: ${METRICAS[metrica]}`, ...criterios], colunas: [{ titulo: 'Critérios da consulta', valor: (c: string) => c, largura: 100 }] },
  ]);
}

function Completo({ f, estado }: { f: Filtros; estado: EstadoFiltros }) {
  const { orgao } = useSessao();
  const [pagina, setPagina] = useState(0);
  const chave = JSON.stringify(f);
  useEffect(() => setPagina(0), [chave]);
  const q = useQuery({ queryKey: ['rel-notas', orgao?.id, chave, pagina], queryFn: () => relatorioNotas(orgao!.id, f, POR_PAGINA, pagina * POR_PAGINA), placeholderData: (a) => a });
  const t = useQuery({ queryKey: ['rel-totais', orgao?.id, chave], queryFn: () => relatorioTotais(orgao!.id, f) });
  void estado;
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={traduzirErro(q.error).mensagem} />;
  return (
    <>
      {t.data && <div className="mb-4 flex flex-wrap gap-2">
        {t.data.por_ano.map((a) => (
          <div key={a.ano} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">{a.ano} · {a.quantidade} nota(s)</span><span className="numero ml-2 font-semibold">{brl(a.valor)}</span></div>
        ))}
        <div className="rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-900"><span>Total geral · {t.data.quantidade} nota(s)</span><span className="numero ml-2 font-semibold">{brl(t.data.valor)}</span><span className="ml-2 text-xs">(pago {brl(t.data.pago)})</span></div>
      </div>}
      {!q.data!.itens.length ? <Vazio titulo="Nenhuma nota com estes filtros" /> : (
        <div className={cx('overflow-x-auto', q.isFetching && 'opacity-70')}>
          <table className="w-full min-w-[1100px] text-xs">
            <thead><tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
              {['Ano', 'NF / data', 'Fornecedor', 'Contrato', 'Empenho', 'Ação', 'Elemento / sub.', 'Fonte', 'Unidades atendidas', 'Valor', 'Situação'].map((c) =>
                <th key={c} className={cx('px-2 py-2 font-medium', c === 'Valor' && 'text-right')}>{c}</th>)}
            </tr></thead>
            <tbody>
              {q.data!.itens.map((l) => (
                <tr key={l.nota_id} className={cx('border-b border-slate-100 align-top', l.cancelada && 'text-slate-400 line-through')}>
                  <td className="numero px-2 py-2">{l.ano}</td>
                  <td className="px-2 py-2"><span className="font-medium">{l.numero}{l.serie ? `-${l.serie}` : ''}</span><span className="block text-slate-500">{formatarData(l.data_emissao)}</span></td>
                  <td className="max-w-48 px-2 py-2">{l.fornecedor_nome}<span className="block text-slate-500">{doc(l.fornecedor_tipo, l.fornecedor_documento)}</span></td>
                  <td className="max-w-56 px-2 py-2"><span className="font-medium">{l.contrato_numero}</span><span className="line-clamp-2 block text-slate-500">{l.contrato_objeto}</span></td>
                  <td className="whitespace-nowrap px-2 py-2">{l.empenho}</td>
                  <td className="max-w-40 px-2 py-2"><span className="font-medium">{l.acao_codigo}</span><span className="line-clamp-2 block text-slate-500">{l.acao_descricao}</span></td>
                  <td className="px-2 py-2">{l.elemento_codigo}{l.subelemento_codigo ? `.${l.subelemento_codigo}` : ''}<span className="line-clamp-2 block text-slate-500">{l.subelemento_descricao ?? l.elemento_descricao}</span></td>
                  <td className="px-2 py-2">{l.fonte_codigo}</td>
                  <td className="max-w-48 px-2 py-2 text-slate-600">{l.unidades ?? '—'}</td>
                  <td className="numero whitespace-nowrap px-2 py-2 text-right font-medium">{brl(l.valor)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{l.cancelada ? 'Cancelada' : <>{l.status_atesto === 'ATESTADA' ? 'Atestada' : 'Pend. atesto'}<span className="block text-slate-500">{SIT_PAG[l.status_pagamento]}</span></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao pagina={pagina} total={q.data!.total} porPagina={POR_PAGINA} aoMudar={setPagina} />
    </>
  );
}

function Resumo({ f, metrica, detalhar }: { f: Filtros; metrica: keyof typeof METRICAS; detalhar: Array<'SUBELEMENTO' | 'FONTE'> }) {
  const { orgao } = useSessao();
  const p = { ...f, metrica, detalhar };
  const q = useQuery({ queryKey: ['rel-consumo', orgao?.id, JSON.stringify(p)], queryFn: () => relatorioConsumo(orgao!.id, p), placeholderData: (a) => a });
  const grupos = useMemo(() => agruparPorAno(q.data ?? []), [q.data]);
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={traduzirErro(q.error).mensagem} />;
  if (!q.data!.length) return <Vazio titulo="Nenhum consumo com estes filtros" />;
  const total = grupos.reduce((s, g) => s + g.subtotal, 0);
  return (
    <div className={cx('overflow-x-auto', q.isFetching && 'opacity-70')}>
      <table className="w-full min-w-[860px] text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="px-2 py-2 font-medium">Ano</th><th className="px-2 py-2 font-medium">Fornecedor</th><th className="px-2 py-2 font-medium">Contrato</th>
          <th className="px-2 py-2 font-medium">Objeto</th><th className="px-2 py-2 font-medium">Ação</th><th className="px-2 py-2 font-medium">Elemento</th>
          {detalhar.includes('SUBELEMENTO') && <th className="px-2 py-2 font-medium">Subelemento</th>}
          {detalhar.includes('FONTE') && <th className="px-2 py-2 font-medium">Fonte</th>}
          <th className="px-2 py-2 text-right font-medium">Valor consumido</th>
        </tr></thead>
        <tbody>
          {grupos.map((g) => (
            <Fragment key={g.ano}>{g.linhas.map((l, i) => (
              <tr key={`${g.ano}-${i}`} className="border-b border-slate-100 align-top">
                <td className="numero px-2 py-2">{l.ano}</td><td className="px-2 py-2">{l.fornecedor_nome}</td><td className="px-2 py-2">{l.contrato_numero}</td>
                <td className="max-w-64 px-2 py-2 text-slate-600"><span className="line-clamp-2">{l.contrato_objeto}</span></td>
                <td className="px-2 py-2" title={l.acao_descricao}>{l.acao_codigo}</td><td className="px-2 py-2" title={l.elemento_descricao}>{l.elemento_codigo}</td>
                {detalhar.includes('SUBELEMENTO') && <td className="px-2 py-2 text-slate-600">{l.subelemento ?? '—'}</td>}
                {detalhar.includes('FONTE') && <td className="px-2 py-2 text-slate-600">{l.fonte}</td>}
                <td className="numero whitespace-nowrap px-2 py-2 text-right">{brl(l.valor)}</td>
              </tr>
            ))}
            <tr className="border-b border-slate-200 bg-slate-50 font-semibold">
              <td className="px-2 py-2" colSpan={6 + detalhar.length}>Subtotal {g.ano}</td>
              <td className="numero whitespace-nowrap px-2 py-2 text-right">{formatarCentavos(g.subtotal)}</td>
            </tr></Fragment>
          ))}
          <tr className="bg-marca-50 font-semibold text-marca-900"><td className="px-2 py-2" colSpan={6 + detalhar.length}>Total geral</td>
            <td className="numero whitespace-nowrap px-2 py-2 text-right">{formatarCentavos(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function Relatorios() {
  const { orgao, pode } = useSessao();
  const navegar = useNavigate();
  const salvo = lerSalvo();
  const [tipo, setTipo] = useState<Tipo>(salvo?.tipo ?? 'completo');
  const [estado, setEstado] = useState<EstadoFiltros>(salvo?.estado ?? filtrosVazios());
  const [metrica, setMetrica] = useState<keyof typeof METRICAS>(salvo?.metrica ?? 'NOTAS');
  const [detalhar, setDetalhar] = useState<Array<'SUBELEMENTO' | 'FONTE'>>(salvo?.detalhar ?? []);
  const f = paraServidor(estado);
  const pedido: PedidoImpressao = { tipo, estado, metrica, detalhar };
  useEffect(() => { try { sessionStorage.setItem(CHAVE, JSON.stringify(pedido)); } catch { /* sem armazenamento */ } }); // filtros persistem na sessão
  const criterios = descreverCriterios(estado);
  const excel = useMutation({
    mutationFn: async () => {
      if (tipo === 'completo') {
        const n = await exportarCompleto(orgao!.id, f, criterios);
        await registrarExportacao(orgao!.id, 'relatorios', 'Excel: notas por classificação orçamentária', n);
      } else {
        const linhas = await relatorioConsumo(orgao!.id, { ...f, metrica, detalhar });
        await exportarResumo(linhas, detalhar, metrica, criterios);
        await registrarExportacao(orgao!.id, 'relatorios', 'Excel: consumo resumido por contrato e classificação', linhas.length);
      }
    },
    onSuccess: () => toast.success('Planilha gerada.'),
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;

  return (
    <>
      <CabecalhoPagina titulo="Consulta e relatórios" descricao="Filtros combinados: todos os campos ao mesmo tempo (E) e, dentro de cada campo, qualquer item escolhido (OU)."
        acoes={<>
          {pode('relatorios', 'exportar') && <Botao variante="secundario" icone={<FileSpreadsheet className="size-4" />} carregando={excel.isPending} onClick={() => excel.mutate()}>Excel</Botao>}
          <Botao icone={<Printer className="size-4" />} onClick={() => { sessionStorage.setItem(CHAVE, JSON.stringify(pedido)); navegar('/relatorios/imprimir'); }}>Pré-visualizar PDF</Botao>
        </>} />
      <Cartao className="mb-4"><PainelFiltros estado={estado} aoMudar={setEstado} completo={tipo === 'completo'} /></Cartao>
      <Cartao>
        <Abas abas={[{ id: 'completo', rotulo: 'Notas por classificação orçamentária (completo)' }, { id: 'resumo', rotulo: 'Consumo resumido por contrato e classificação' }]} ativa={tipo} aoMudar={setTipo} />
        {tipo === 'resumo' && (
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <Selecao rotulo="Métrica do consumo" value={metrica} onChange={(e) => setMetrica(e.target.value as keyof typeof METRICAS)} className="min-w-72">
              {Object.entries(METRICAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Selecao>
            {(['SUBELEMENTO', 'FONTE'] as const).map((d) => (
              <label key={d} className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="size-4 accent-marca-700" checked={detalhar.includes(d)}
                onChange={(e) => setDetalhar((x) => (e.target.checked ? [...x, d] : x.filter((y) => y !== d)))} />Detalhar por {d === 'FONTE' ? 'fonte' : 'subelemento'}</label>
            ))}
            <p className="pb-2 text-xs text-slate-500">O consumo fica na classificação do empenho de cada nota; empenhado, notas e pago nunca são somados entre si.</p>
          </div>
        )}
        {tipo === 'completo' ? <Completo f={f} estado={estado} /> : <Resumo f={f} metrica={metrica} detalhar={detalhar} />}
      </Cartao>
    </>
  );
}

export { METRICAS };
