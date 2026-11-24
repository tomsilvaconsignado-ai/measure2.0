// Relação de notas fiscais (para responder ao fornecedor: "foram pagas? quando?"), A4 paisagem no modelo dos
// extratos: faixa azul com órgão e título, filtro usado (contrato ou empresa e situação), tabela com cabeçalho
// repetido em cada página e quadro de totais; o rodapé "Gerado em" sai em todas as páginas.
import type { ReactNode } from 'react';
import { brl, formatarCnpj, formatarCpf, formatarData, formatarDataHora } from '@/lib/formatacao';
import type { DocumentoEmitido } from '@/lib/tipos';
import { AZUL, Tabela } from './ImprimirExtratoNotas';

/* eslint-disable @typescript-eslint/no-explicit-any */
type D = Record<string, any>;
interface Pagamento { data: string; valor: number; liquido: number | null }
interface NotaRelacao {
  numero: string; data: string; processo: string | null; valor: number; fornecedor: string; contrato: string;
  atesto: 'PENDENTE' | 'ATESTADA'; pagamento: 'PENDENTE' | 'PARCIAL' | 'PAGO'; pago: number; liquido: number; pagamentos: Pagamento[];
}

const num = (v: unknown) => Number(v) || 0;

export const SITUACOES_RELACAO = {
  NAO_PAGAS: { rotulo: 'Não pagas', explicacao: 'pendentes de pagamento ou pagas só em parte (inclui as que ainda aguardam atesto)' },
  PAGAS: { rotulo: 'Pagas', explicacao: 'pagas por inteiro' },
  FALTANDO_ATESTO: { rotulo: 'Faltando atesto', explicacao: 'ainda não atestadas' },
  TODAS: { rotulo: 'Todas', explicacao: 'todas as notas, exceto as canceladas' },
} as const;
export type SituacaoRelacao = keyof typeof SITUACOES_RELACAO;

function situacao(n: NotaRelacao) {
  if (n.pagamento === 'PAGO') return 'PAGO';
  if (n.pagamento === 'PARCIAL') return 'PAGO EM PARTE';
  return n.atesto === 'PENDENTE' ? 'AGUARD. ATESTO' : 'A PAGAR';
}

export function ImprimirRelacaoNotas({ doc }: { doc: DocumentoEmitido }) {
  const d = doc.dados as D;
  const notas = (d.notas as NotaRelacao[]) ?? [];
  const sit = SITUACOES_RELACAO[(d.situacao as SituacaoRelacao) ?? 'TODAS'];
  const orgao = ((d.orgao?.cabecalho as string[] | undefined)?.[0] ?? d.orgao?.nome_oficial ?? '').toUpperCase();
  const sigla = d.unidade?.sigla ?? d.unidade?.nome ?? '';
  const f = d.fornecedor as { nome?: string; documento?: string; tipo_pessoa?: string } | undefined;
  const documento = f?.documento ? (f.tipo_pessoa === 'PF' ? `CPF ${formatarCpf(f.documento)}` : `CNPJ ${formatarCnpj(f.documento)}`) : '';
  const total = notas.reduce((s, n) => s + num(n.valor), 0);
  const pago = notas.reduce((s, n) => s + num(n.pago), 0);
  const falta = notas.reduce((s, n) => s + Math.max(0, num(n.valor) - num(n.pago)), 0);
  const rodape = `Gerado em: ${formatarDataHora(d.emitido_em ?? doc.emitido_em)}${[sigla, d.orgao_curto].filter(Boolean).length ? ` - ${[sigla, d.orgao_curto].filter(Boolean).join('/')}` : ''} · Emitido por ${d.emitido_por ?? '—'} · MEASURE · Documento nº ${doc.id.slice(0, 8).toUpperCase()}`;
  const campo = (rotulo: string, valor: ReactNode) => <p className="flex gap-2"><b className="w-[22mm] shrink-0">{rotulo}</b><span className="min-w-0">{valor}</span></p>;
  const linhaTotal = (rotulo: string, valor: ReactNode, cor = '#28285a') => (
    <div className="flex justify-between gap-6 py-[3px]"><b className="text-[#28285a]">{rotulo}</b><span className="numero" style={{ color: cor }}>{valor}</span></div>
  );

  return (
    <article className="extrato-notas mx-auto flex flex-col bg-white text-slate-900 shadow-lg print:shadow-none" style={{ width: '297mm', minHeight: '210mm' }}>
      <style>{`@page { size: A4 landscape; margin: 8mm 8mm 0; }
        .extrato-notas { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print { .extrato-notas { width: auto !important; min-height: 0 !important; }
          .extrato-rodape { position: fixed; left: 0; right: 0; bottom: 0; } }`}</style>
      <table className="w-full border-collapse">
        <tbody><tr><td className="p-0 align-top">
          <header style={{ background: AZUL }} className="px-8 pb-2.5 pt-3 text-center text-white">
            <p className="text-[14px] font-bold">{orgao}{sigla ? ` / ${sigla}` : ''}</p>
            <p className="mt-0.5 text-[10.5px]">{d.titulo}</p>
          </header>
          <div className="mx-[10mm] h-[2px] bg-[#00b4c8]" />
          <section className="mx-[12mm] mt-2.5 border-b border-slate-300 pb-2 text-[10px]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {d.filtro === 'CONTRATO'
                ? campo('Contrato:', `${d.contrato?.numero ?? '-'} - ${f?.nome ?? '-'}`)
                : campo('Empresa:', f?.nome ?? '-')}
              {campo(d.filtro === 'CONTRATO' ? 'Fornecedor:' : 'Documento:', d.filtro === 'CONTRATO' ? [f?.nome, documento].filter(Boolean).join(' · ') : documento || '-')}
              {campo('Situação:', <><b>{sit.rotulo}</b> <span className="text-slate-600">({sit.explicacao})</span></>)}
              {campo('Notas:', `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}`)}
            </div>
            {d.filtro === 'CONTRATO' && d.contrato?.objeto && <div className="mt-1">{campo('Objeto:', d.contrato.objeto)}</div>}
          </section>
          <div className="mx-[10mm] mt-3">
            <Tabela
              colunas={[{ rotulo: '#', largura: '4%', alinhar: 'centro' }, { rotulo: 'Nota Fiscal', largura: '9%' }, { rotulo: 'Emissão', largura: '7.5%', alinhar: 'centro' },
                { rotulo: 'Processo', largura: '12%' }, { rotulo: 'Fornecedor', largura: '19%' }, { rotulo: 'Contrato', largura: '8.5%' },
                { rotulo: 'Situação', largura: '9.5%', alinhar: 'centro' }, { rotulo: 'Valor Nota', largura: '10%', alinhar: 'direita' },
                { rotulo: 'Valor Pago', largura: '11%', alinhar: 'direita' }, { rotulo: 'Data Pgto.', largura: '9.5%', alinhar: 'centro' }]}
              linhas={notas.map((n, i) => {
                const temPagamento = num(n.pago) > 0;
                const retido = num(n.pago) - num(n.liquido);
                return [
                  i + 1, `#${n.numero}`, formatarData(n.data), n.processo || '-', n.fornecedor, n.contrato, situacao(n), brl(n.valor),
                  temPagamento ? <>{brl(n.pago)}{retido > 0.01 && <span className="block text-[8px] text-slate-500">líquido {brl(n.liquido)}</span>}</> : '-',
                  // vários pagamentos: cada data com o valor pago nela logo abaixo
                  temPagamento ? n.pagamentos.map((p, j) => (
                    <span key={j} className={j > 0 ? 'mt-0.5 block' : 'block'}>
                      {formatarData(p.data)}
                      {n.pagamentos.length > 1 && <span className="block text-[8px] leading-tight text-slate-500">{brl(p.valor)}</span>}
                    </span>
                  )) : '-',
                ];
              })} />
            <div className="mt-4 flex items-start justify-between gap-6">
              <p className="max-w-[150mm] text-[8.5px] leading-snug text-slate-600">
                Valor pago é o valor quitado da nota (bruto). Quando houve retenção de impostos, o valor líquido creditado aparece logo abaixo.
                Notas canceladas não entram nesta relação.
              </p>
              <div className="w-[92mm] shrink-0 break-inside-avoid rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: AZUL, background: '#e8f0fe' }}>
                {linhaTotal('Quantidade de notas:', notas.length)}
                {linhaTotal('Total das notas:', brl(total), '#b41e1e')}
                {linhaTotal('Total pago:', brl(pago), '#16a34a')}
                <div className="mt-1 border-t border-[#0a2d6e]/30 pt-1">{linhaTotal('Falta pagar:', brl(falta), falta > 0.01 ? '#b47800' : '#16a34a')}</div>
              </div>
            </div>
          </div>
        </td></tr></tbody>
        <tfoot className="table-footer-group"><tr><td className="h-[14mm] p-0" /></tr></tfoot>
      </table>
      <footer style={{ background: AZUL }} className="extrato-rodape mt-auto px-6 py-2 text-center text-[8.5px] text-[#c8d2ff]">{rodape}</footer>
    </article>
  );
}
