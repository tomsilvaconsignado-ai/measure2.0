// Extratos de notas do contrato (modelo aprovado pelo Controle Interno), A4 paisagem:
// faixa azul com órgão e título, dados do contrato, tabela com cabeçalho repetido em cada página,
// resumo por unidade e quadro de totais; o rodapé "Gerado em" sai em todas as páginas.
// Nota cancelada aparece na lista, mas fica fora dos totais e do saldo.
import type { ReactNode } from 'react';
import { brl, formatarData, formatarDataHora } from '@/lib/formatacao';
import type { DocumentoEmitido } from '@/lib/tipos';

/* eslint-disable @typescript-eslint/no-explicit-any */
type D = Record<string, any>;
interface Nota { numero: string; data: string; valor: number; fornecedor: string; cancelada: boolean; pago: number; liquido: number; retido: number; unidade: string; referencia: string | null; rateio: Array<{ unidade: string; valor: number | null }> }

const AZUL = '#0a2d6e';
const num = (v: unknown) => Number(v) || 0;
const pagoInteiro = (n: Nota) => num(n.pago) >= num(n.valor) - 0.01;

function situacao(n: Nota, curta = false) {
  if (n.cancelada) return curta ? 'CANCEL.' : 'CANCELADO';
  if (num(n.pago) <= 0) return curta ? 'PEND.' : 'PENDENTE';
  if (!pagoInteiro(n)) return 'PARCIAL';
  if (curta) return 'PAGO';
  return num(n.retido) > 0.01 ? 'PAGO c/ RET.' : 'PAGO INTEG.';
}

// Totais do contrato (só notas não canceladas)
function totais(notas: Nota[], valorContrato: number) {
  const validas = notas.filter((n) => !n.cancelada);
  const utilizado = validas.reduce((s, n) => s + num(n.valor), 0);
  return {
    utilizado,
    pago: validas.reduce((s, n) => s + num(n.liquido), 0),
    retido: validas.reduce((s, n) => s + num(n.retido), 0),
    pendente: validas.reduce((s, n) => s + Math.max(0, num(n.valor) - num(n.pago)), 0),
    canceladas: notas.filter((n) => n.cancelada).reduce((s, n) => s + num(n.valor), 0),
    saldo: valorContrato - utilizado,
  };
}

type Coluna = { rotulo: string; largura: string; alinhar?: 'centro' | 'direita' };
const alinhamento = (a?: Coluna['alinhar']) => (a === 'direita' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left');

function Tabela({ colunas, linhas, apagadas }: { colunas: Coluna[]; linhas: ReactNode[][]; apagadas?: boolean[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[9.5px] leading-tight">
      <colgroup>{colunas.map((c) => <col key={c.rotulo} style={{ width: c.largura }} />)}</colgroup>
      <thead className="table-header-group">
        <tr style={{ background: AZUL }} className="text-white">
          {colunas.map((c) => <th key={c.rotulo} className={`px-1.5 py-1.5 font-semibold ${alinhamento(c.alinhar)}`}>{c.rotulo}</th>)}
        </tr>
      </thead>
      <tbody>
        {linhas.length === 0 && <tr><td colSpan={colunas.length} className="px-1.5 py-3 text-center text-slate-500">Nenhum registro.</td></tr>}
        {linhas.map((l, i) => (
          <tr key={i} className={`break-inside-avoid border-b border-slate-200 ${i % 2 ? 'bg-[#f5f7fc]' : ''} ${apagadas?.[i] ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800'}`}>
            {l.map((c, j) => <td key={j} className={`px-1.5 py-1 align-top break-words ${alinhamento(colunas[j].alinhar)} ${colunas[j].alinhar === 'direita' ? 'numero whitespace-nowrap' : ''}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuadroTotais({ t }: { t: ReturnType<typeof totais> }) {
  const linha = (rotulo: string, valor: number, cor: string) => (
    <div className="flex justify-between gap-6 py-[3px]"><b className="text-[#28285a]">{rotulo}</b><span className="numero" style={{ color: cor }}>{brl(valor)}</span></div>
  );
  return (
    <div className="w-[92mm] shrink-0 break-inside-avoid rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: AZUL, background: '#e8f0fe' }}>
      {linha('Total utilizado:', t.utilizado, '#b41e1e')}
      {linha('Total pago:', t.pago, '#16a34a')}
      {linha('Pendência real:', t.pendente, '#b47800')}
      {linha('Imp. retidos:', t.retido, '#0d9488')}
      <div className="mt-1 border-t border-[#0a2d6e]/30 pt-1">{linha('Saldo restante:', t.saldo, t.saldo < 0 ? '#b41e1e' : '#16a34a')}</div>
      {t.canceladas > 0 && <p className="mt-1 text-[8.5px] text-slate-600">Notas canceladas ({brl(t.canceladas)}) aparecem na lista, mas não entram nos totais.</p>}
    </div>
  );
}

function Resumo({ titulo, itens }: { titulo: string; itens: Array<[string, number]> }) {
  return (
    <div className="min-w-0 flex-1 text-[10px]">
      <p className="mb-1 font-bold text-[#28285a]">{titulo}</p>
      <table className="border-collapse">
        <tbody>
          {itens.map(([u, v]) => (
            <tr key={u}><td className="py-[2px] pr-6 text-slate-700">• {u}</td><td className="numero py-[2px] text-right font-bold" style={{ color: AZUL }}>{brl(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const somarPor = (pares: Array<[string, number]>) => {
  const m = new Map<string, number>();
  for (const [k, v] of pares) m.set(k, (m.get(k) ?? 0) + v);
  return [...m.entries()];
};

function Extrato1({ notas }: { notas: Nota[] }) {
  return <Tabela
    colunas={[{ rotulo: '#', largura: '4%', alinhar: 'centro' }, { rotulo: 'Nota Fiscal', largura: '8%' }, { rotulo: 'Data', largura: '8%', alinhar: 'centro' },
      { rotulo: 'Fornecedor', largura: '20%' }, { rotulo: 'Unidade', largura: '17%' }, { rotulo: 'Status', largura: '10%', alinhar: 'centro' },
      { rotulo: 'Valor Nota', largura: '11%', alinhar: 'direita' }, { rotulo: 'Valor Pago', largura: '11%', alinhar: 'direita' }, { rotulo: 'Imp. Retido', largura: '11%', alinhar: 'direita' }]}
    apagadas={notas.map((n) => n.cancelada)}
    linhas={notas.map((n, i) => [i + 1, `#${n.numero}`, formatarData(n.data), n.fornecedor, n.unidade, situacao(n), brl(n.valor),
      num(n.liquido) > 0 ? brl(n.liquido) : '-', num(n.retido) > 0.01 ? brl(n.retido) : '-'])} />;
}

function Extrato2({ notas }: { notas: Nota[] }) {
  const local = (n: Nota) => (n.rateio.length > 1 ? `${n.rateio.length} unidades (rateio)` : n.rateio[0]?.unidade ?? n.unidade);
  return <Tabela
    colunas={[{ rotulo: '#', largura: '4%', alinhar: 'centro' }, { rotulo: 'Nota Fiscal', largura: '9%' }, { rotulo: 'Data', largura: '9%', alinhar: 'centro' },
      { rotulo: 'Unidade', largura: '20%' }, { rotulo: 'Mês Referência', largura: '15%' }, { rotulo: 'Local Serviço', largura: '22%' },
      { rotulo: 'Pgto', largura: '8%', alinhar: 'centro' }, { rotulo: 'Valor (R$)', largura: '13%', alinhar: 'direita' }]}
    apagadas={notas.map((n) => n.cancelada)}
    linhas={notas.map((n, i) => [i + 1, `#${n.numero}`, formatarData(n.data), n.unidade, n.referencia ?? '-', local(n), situacao(n, true), brl(n.valor)])} />;
}

// Rateio: uma linha por unidade de cada nota (nota com uma só unidade e sem valor rateado leva o valor da nota)
function linhasRateio(notas: Nota[]) {
  return notas.filter((n) => !n.cancelada).flatMap((n) => n.rateio.map((r) => ({ n, unidade: r.unidade, valor: r.valor ?? (n.rateio.length === 1 ? num(n.valor) : null) })));
}

function Extrato3({ notas }: { notas: Nota[] }) {
  const linhas = linhasRateio(notas);
  return <Tabela
    colunas={[{ rotulo: 'Nota Fiscal', largura: '11%' }, { rotulo: 'Data', largura: '10%', alinhar: 'centro' }, { rotulo: 'Mês Referência', largura: '17%' },
      { rotulo: 'Unidade', largura: '30%' }, { rotulo: 'Valor Rateado (R$)', largura: '16%', alinhar: 'direita' }, { rotulo: 'Total Nota (R$)', largura: '16%', alinhar: 'direita' }]}
    linhas={linhas.map((l) => [`#${l.n.numero}`, formatarData(l.n.data), l.n.referencia ?? '-', l.unidade, l.valor == null ? '-' : brl(l.valor), brl(l.n.valor)])} />;
}

export function ImprimirExtratoNotas({ doc }: { doc: DocumentoEmitido }) {
  const d = doc.dados as D;
  const c = d.contrato as D;
  const notas = (d.notas as Nota[]) ?? [];
  const valorContrato = num(c.valor_atual ?? c.valor_global);
  const t = totais(notas, valorContrato);
  const orgao = ((d.orgao?.cabecalho as string[] | undefined)?.[0] ?? d.orgao?.nome_oficial ?? '').toUpperCase();
  const sigla = d.unidade?.sigla ?? d.unidade?.nome ?? '';
  const resumo: Array<[string, number]> | null =
    doc.tipo === 'EXTRATO_UNIDADES' ? somarPor(notas.filter((n) => !n.cancelada).map((n) => [n.unidade, num(n.valor)]))
      : doc.tipo === 'EXTRATO_RATEIO' ? somarPor(linhasRateio(notas).map((l) => [l.unidade, num(l.valor)])).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        : null;
  const rodape = `Gerado em: ${formatarDataHora(d.emitido_em ?? doc.emitido_em)} - ${[sigla, d.orgao_curto].filter(Boolean).join('/')} · Emitido por ${d.emitido_por ?? '—'} · MEASURE · Documento nº ${doc.id.slice(0, 8).toUpperCase()}`;
  const campo = (rotulo: string, valor: ReactNode) => <p className="flex gap-2"><b className="w-[22mm] shrink-0">{rotulo}</b><span className="min-w-0">{valor}</span></p>;

  return (
    <article className="extrato-notas mx-auto flex flex-col bg-white text-slate-900 shadow-lg print:shadow-none" style={{ width: '297mm', minHeight: '210mm' }}>
      <style>{`@page { size: A4 landscape; margin: 8mm 8mm 0; }
        .extrato-notas { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print { .extrato-notas { width: auto !important; min-height: 0 !important; }
          .extrato-rodape { position: fixed; left: 0; right: 0; bottom: 0; } }`}</style>
      {/* tabela externa: o espaço do rodapé se repete no fim de cada página impressa */}
      <table className="w-full border-collapse">
        <tbody><tr><td className="p-0 align-top">
          <header style={{ background: AZUL }} className="px-8 pb-2.5 pt-3 text-center text-white">
            <p className="text-[14px] font-bold">{orgao}{sigla ? ` / ${sigla}` : ''}</p>
            <p className="mt-0.5 text-[10.5px]">{d.titulo}</p>
          </header>
          <div className="mx-[10mm] h-[2px] bg-[#00b4c8]" />
          <section className="mx-[12mm] mt-2.5 border-b border-slate-300 pb-2 text-[10px]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {campo('Contrato:', `${c.numero} - ${d.fornecedor ?? '-'}`)}
              {campo('Início:', formatarData(c.data_inicio))}
              {campo('Vigência:', formatarData(c.data_fim))}
              {campo('Valor Global:', <>{brl(c.valor_global)}{num(c.valor_atual) !== num(c.valor_global) && <span className="text-slate-600"> (atual, com aditivos: {brl(c.valor_atual)})</span>}</>)}
            </div>
            <div className="mt-1">{campo('Objeto:', c.objeto)}</div>
          </section>
          <div className="mx-[10mm] mt-3">
            {doc.tipo === 'EXTRATO_NOTAS' && <Extrato1 notas={notas} />}
            {doc.tipo === 'EXTRATO_UNIDADES' && <Extrato2 notas={notas} />}
            {doc.tipo === 'EXTRATO_RATEIO' && <Extrato3 notas={notas} />}
            <div className="mt-4 flex items-start justify-between gap-6">
              {resumo ? <Resumo titulo={doc.tipo === 'EXTRATO_RATEIO' ? 'Resumo Rateio por Unidade:' : 'Resumo por Unidade:'} itens={resumo} /> : <span />}
              <QuadroTotais t={t} />
            </div>
          </div>
        </td></tr></tbody>
        <tfoot className="table-footer-group"><tr><td className="h-[14mm] p-0" /></tr></tfoot>
      </table>
      <footer style={{ background: AZUL }} className="extrato-rodape mt-auto px-6 py-2 text-center text-[8.5px] text-[#c8d2ff]">{rodape}</footer>
    </article>
  );
}
