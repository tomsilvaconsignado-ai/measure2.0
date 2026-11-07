// Pagamentos da administração: fila das notas atestadas (ordem cronológica por fonte de recurso, art. 141)
// com a baixa (retenções e data) e a consulta dos pagamentos realizados, com exportação para Excel.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Banknote, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, PontoPendente, SemPermissao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { mensagemDeErro } from '@/lib/erros';
import { brl, centavos, formatarCentavos, formatarData, formatarDataHora } from '@/lib/formatacao';
import { baixarExcel } from '@/lib/planilhas';
import type { ItemFilaPagamento, PagamentoRealizado } from '@/lib/tipos';
import { registrarExportacao } from '@/services/relatorios';
import { filaPagamentos, pagamentosRealizados } from '@/services/execucao';
import { BaixaPagamento, type NotaParaBaixa } from './BaixaPagamento';

const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });
const inicioDoMes = () => `${hoje().slice(0, 8)}01`;
const rotuloNota = (r: { numero: string; serie?: string | null }) => (r.serie ? `${r.numero}-${r.serie}` : r.numero);

function Fila() {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [baixando, setBaixando] = useState<NotaParaBaixa | null>(null);
  const q = useQuery({ queryKey: ['fila-pagamentos', orgao?.id], queryFn: () => filaPagamentos(orgao!.id), enabled: !!orgao });
  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const itens = (q.data ?? []).filter((r) => !t || [r.numero, r.fornecedor_nome, r.contrato_numero, r.empenho].some((v) => v?.toLowerCase().includes(t)));
    const mapa = new Map<string, { fonte: string; itens: ItemFilaPagamento[] }>();
    for (const r of itens) {
      const g = mapa.get(r.fonte_id) ?? { fonte: r.fonte, itens: [] };
      g.itens.push(r); mapa.set(r.fonte_id, g);
    }
    return [...mapa.values()].sort((a, b) => a.fonte.localeCompare(b.fonte));
  }, [q.data, busca]);
  const total = (q.data ?? []).reduce((s, r) => s + centavos(r.restante), 0);
  const atualizar = async () => {
    await qc.invalidateQueries({ queryKey: ['fila-pagamentos'] }); await qc.invalidateQueries({ queryKey: ['pagamentos-realizados'] });
    await qc.invalidateQueries({ queryKey: ['notas'] }); await qc.invalidateQueries({ queryKey: ['nota'] });
  };

  if (q.isLoading) return <Carregando />;
  if (q.error) return <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1"><CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar na fila" placeholder="Nota, fornecedor, contrato ou empenho" /></div>
        <p className="text-sm text-slate-600"><strong>{q.data!.length}</strong> nota(s) aguardando · <strong className="numero">{formatarCentavos(total)}</strong> a pagar</p>
      </div>
      <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950">
        A fila segue a ordem do atesto dentro de cada fonte de recurso (Lei 14.133/2021, art. 141). Pague de cima para baixo; furar a fila só nas hipóteses do § 1º, com justificativa.
      </p>
      {!grupos.length ? <Vazio titulo={busca ? 'Nada encontrado na fila' : 'Nenhuma nota aguardando pagamento'} descricao={busca ? undefined : 'As notas entram aqui assim que são atestadas.'} /> : grupos.map((g) => (
        <Cartao key={g.fonte} titulo={<span className="flex items-center gap-2">{g.fonte}<Selo>{g.itens.length}</Selo></span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-2 py-2 font-medium">Fila</th><th className="px-2 py-2 font-medium">Nota</th><th className="px-2 py-2 font-medium">Fornecedor · contrato</th>
                <th className="px-2 py-2 font-medium">Atestada em</th><th className="px-2 py-2 text-right font-medium">Valor</th><th className="px-2 py-2 text-right font-medium">A pagar</th><th className="px-2 py-2" />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {g.itens.map((r) => (
                  <tr key={r.nota_id}>
                    <td className="px-2 py-2"><span className={r.posicao === 1 ? 'inline-flex size-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white' : 'inline-flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700'}>{r.posicao}º</span></td>
                    <td className="px-2 py-2"><Link to={`/notas?ver=${r.nota_id}`} className="font-medium text-marca-700 hover:underline">{rotuloNota(r)}</Link>
                      <span className="block text-xs text-slate-500">{r.empenho ? `Empenho ${r.empenho}` : 'Sem empenho'}</span></td>
                    <td className="px-2 py-2">{r.fornecedor_nome}<span className="block text-xs text-slate-500">Contrato {r.contrato_numero}</span></td>
                    <td className="px-2 py-2">{r.atestado_em ? <>{formatarData(r.atestado_em)}
                      <span className="block text-xs text-slate-500">{r.dias_aguardando} dia(s) aguardando{r.status_pagamento === 'PARCIAL' && ' · parcial'}</span></>
                      : <span className="text-xs text-slate-500">Atestada no sistema anterior</span>}</td>
                    <td className="numero whitespace-nowrap px-2 py-2 text-right">{brl(r.valor)}</td>
                    <td className="numero whitespace-nowrap px-2 py-2 text-right font-medium">{brl(r.restante)}</td>
                    <td className="px-2 py-2 text-right">
                      <BotaoBaixa primeiro={r.posicao === 1} rotulo={rotuloNota(r)}
                        aoClicar={() => setBaixando({ id: r.nota_id, rotulo: rotuloNota(r), fornecedor: r.fornecedor_nome, restanteCentavos: centavos(r.restante), posicao: r.posicao })} />
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </Cartao>
      ))}
      <BaixaPagamento nota={baixando} aoFechar={() => setBaixando(null)} aoConcluir={atualizar} />
    </div>
  );
}

// Botão da fila: o 1º da vez em destaque (verde, com o ponto de ação pendente); os demais discretos.
function BotaoBaixa({ primeiro, rotulo, aoClicar }: { primeiro: boolean; rotulo: string; aoClicar: () => void }) {
  return (
    <button type="button" onClick={aoClicar} aria-label={`Dar baixa na nota ${rotulo}`}
      className={cx('group relative inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
        primeiro
          ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-600/25 hover:-translate-y-px hover:from-emerald-700 hover:to-emerald-600 hover:shadow-lg'
          : 'border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-500 hover:bg-emerald-50')}>
      <Banknote className="size-4" aria-hidden />
      Dar baixa
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      {primeiro && <PontoPendente className="absolute -right-1 -top-1" rotulo="Próxima da fila" />}
    </button>
  );
}

const RET: Array<[keyof PagamentoRealizado, string]> =[['retencao_iss', 'ISS'], ['retencao_irrf', 'IRRF'], ['retencao_inss', 'INSS'], ['retencao_federais', 'PIS/COFINS/CSLL'], ['retencao_outras', 'Outras']];

function Realizados() {
  const { orgao } = useSessao();
  const [inicio, setInicio] = useState(inicioDoMes());
  const [fim, setFim] = useState(hoje());
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const periodoOk = !!inicio && !!fim && inicio <= fim;
  const q = useQuery({ queryKey: ['pagamentos-realizados', orgao?.id, inicio, fim, termo], queryFn: () => pagamentosRealizados(orgao!.id, inicio, fim, termo), enabled: !!orgao && periodoOk });
  const linhas = q.data ?? [];
  const soma = (k: keyof PagamentoRealizado) => linhas.reduce((s, r) => s + centavos(r[k] as string), 0);
  const retidoDe = (r: PagamentoRealizado) => RET.reduce((s, [k]) => s + centavos(r[k] as string), 0);
  const exportar = useMutation({
    mutationFn: async () => {
      await baixarExcel(`pagamentos_${inicio}_a_${fim}.xlsx`, [{
        nome: 'Pagamentos', linhas, colunas: [
          { titulo: 'Data do pagamento', tipo: 'data', valor: (r: PagamentoRealizado) => r.data_pagamento },
          { titulo: 'Nota fiscal', valor: (r: PagamentoRealizado) => r.numero },
          { titulo: 'Fornecedor', valor: (r: PagamentoRealizado) => r.fornecedor_nome, largura: 40 },
          { titulo: 'Contrato', valor: (r: PagamentoRealizado) => r.contrato_numero },
          { titulo: 'Valor bruto', tipo: 'moeda', valor: (r: PagamentoRealizado) => r.valor },
          ...RET.map(([k, t]) => ({ titulo: t, tipo: 'moeda' as const, valor: (r: PagamentoRealizado) => r[k] })),
          { titulo: 'Descrição de outras', valor: (r: PagamentoRealizado) => r.retencao_outras_descricao ?? '' },
          { titulo: 'Valor líquido', tipo: 'moeda', valor: (r: PagamentoRealizado) => r.valor_liquido },
          { titulo: 'Documento (OB)', valor: (r: PagamentoRealizado) => r.documento ?? '' },
          { titulo: 'Justificativa de quebra da ordem', valor: (r: PagamentoRealizado) => r.justificativa_ordem ?? '', largura: 50 },
          { titulo: 'Registrado por', valor: (r: PagamentoRealizado) => r.registrado_por, largura: 30 },
          { titulo: 'Registrado em', valor: (r: PagamentoRealizado) => formatarDataHora(r.registrado_em), largura: 20 },
        ],
      }]);
      await registrarExportacao(orgao!.id, 'notas_fiscais', 'Excel: pagamentos realizados', linhas.length);
    },
    onSuccess: () => toast.success('Planilha gerada.'), onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="De" type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className="w-40" />
        <Campo rotulo="Até" type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className="w-40" />
        <div className="min-w-60 flex-1"><CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar pagamentos" placeholder="Nota, fornecedor, contrato ou OB" /></div>
        <Botao variante="secundario" icone={<FileSpreadsheet className="size-4" />} disabled={!linhas.length} carregando={exportar.isPending} onClick={() => exportar.mutate()}>Exportar Excel</Botao>
      </div>
      {!periodoOk ? <CaixaErro mensagem="Informe um período válido (a data inicial não pode ser depois da final)." />
        : q.isLoading ? <Carregando /> : q.error ? <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} /> : <>
          <dl className="grid gap-3 sm:grid-cols-4">
            {[['Pagamentos', String(linhas.length)], ['Bruto pago', formatarCentavos(soma('valor'))], ['Retido', formatarCentavos(linhas.reduce((s, r) => s + retidoDe(r), 0))], ['Líquido às empresas', formatarCentavos(soma('valor_liquido'))]].map(([t, v]) => (
              <div key={t} className="rounded-xl border border-slate-200 bg-white p-3"><dt className="text-xs text-slate-500">{t}</dt><dd className="numero text-lg font-semibold">{v}</dd></div>
            ))}
          </dl>
          {!linhas.length ? <Vazio titulo="Nenhum pagamento no período" /> : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Nota · fornecedor</th><th className="px-3 py-2 text-right font-medium">Bruto</th>
                  <th className="px-3 py-2 font-medium">Retenções</th><th className="px-3 py-2 text-right font-medium">Líquido</th><th className="px-3 py-2 font-medium">Documento</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {linhas.map((r) => (
                    <tr key={r.pagamento_id}>
                      <td className="px-3 py-2">{formatarData(r.data_pagamento)}</td>
                      <td className="px-3 py-2"><Link to={`/notas?ver=${r.nota_id}`} className="font-medium text-marca-700 hover:underline">{r.numero}</Link> · {r.fornecedor_nome}
                        <span className="block text-xs text-slate-500">Contrato {r.contrato_numero} · por {r.registrado_por}</span>
                        {r.justificativa_ordem && <span className="mt-1 flex items-start gap-1 text-xs text-amber-800"><AlertTriangle className="mt-0.5 size-3 shrink-0" />Fora da ordem: {r.justificativa_ordem}</span>}</td>
                      <td className="numero px-3 py-2 text-right">{brl(r.valor)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{RET.filter(([k]) => centavos(r[k] as string) > 0).map(([k, t]) => `${t} ${brl(r[k] as string)}`).join(' · ') || '—'}</td>
                      <td className="numero px-3 py-2 text-right font-medium">{brl(r.valor_liquido)}</td>
                      <td className="px-3 py-2">{r.documento ?? '—'}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </>}
    </div>
  );
}

export function Pagamentos() {
  const { pode } = useSessao();
  const [aba, setAba] = useState<'fila' | 'realizados'>('fila');
  if (!pode('notas_fiscais', 'editar')) return <SemPermissao texto="A baixa de pagamentos é feita pela administração do órgão (permissão de editar notas fiscais)." />;
  return (
    <div>
      <CabecalhoPagina titulo="Pagamentos" descricao="Dê baixa nas notas atestadas, com as retenções e a data do pagamento, seguindo a ordem cronológica." />
      <Abas abas={[{ id: 'fila', rotulo: 'Aguardando pagamento' }, { id: 'realizados', rotulo: 'Pagamentos realizados' }]} ativa={aba} aoMudar={setAba} />
      {aba === 'fila' ? <Fila /> : <Realizados />}
    </div>
  );
}
