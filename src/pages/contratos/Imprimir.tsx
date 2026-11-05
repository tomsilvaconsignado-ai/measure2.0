// Impressão de documentos emitidos (A4). Mostra o retrato salvo na emissão: alterações
// posteriores nos cadastros não mudam o documento.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImagemPrivada } from '@/components/ImagemPrivada';
import { Botao, CaixaErro, Carregando } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarCpf, formatarData, formatarDataHora } from '@/lib/formatacao';
import { obterEmitido } from '@/services/execucao';

/* eslint-disable @typescript-eslint/no-explicit-any */
type D = Record<string, any>;

const PAPEIS: Record<string, string> = { GESTOR: 'Gestor', FISCAL: 'Fiscal', SUPLENTE: 'Suplente' };
const SIT_PAG: Record<string, string> = { PENDENTE: 'Pendente', PARCIAL: 'Parcial', PAGO: 'Paga', CANCELADA: 'Cancelada' };
const TIPO_ADITIVO: Record<string, string> = { PRAZO: 'Prazo', VALOR: 'Valor', PRAZO_E_VALOR: 'Prazo e valor', SUPRESSAO: 'Supressão', OUTRO: 'Outro' };
const TIPO_EMPENHO: Record<string, string> = { ORDINARIO: 'Ordinário', ESTIMATIVO: 'Estimativo', GLOBAL: 'Global' };

function Tabela({ colunas, linhas, total }: { colunas: Array<[string, string?]>; linhas: ReactNode[][]; total?: ReactNode[] }) {
  return (
    <table className="mb-4 w-full border-collapse text-[10.5px]">
      <thead className="table-header-group"><tr>{colunas.map(([c, al]) => <th key={c} className={`border border-slate-400 bg-slate-100 px-1.5 py-1 font-semibold ${al === 'r' ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
      <tbody>
        {linhas.length === 0 && <tr><td colSpan={colunas.length} className="border border-slate-400 px-1.5 py-1 text-center text-slate-500">Nenhum registro.</td></tr>}
        {linhas.map((l, i) => <tr key={i} className="break-inside-avoid">{l.map((c, j) => <td key={j} className={`border border-slate-400 px-1.5 py-1 align-top break-words ${colunas[j]?.[1] === 'r' ? 'numero text-right whitespace-nowrap' : ''}`}>{c}</td>)}</tr>)}
        {total && <tr className="font-semibold">{total.map((c, j) => <td key={j} className={`border border-slate-400 bg-slate-50 px-1.5 py-1 ${colunas[j]?.[1] === 'r' ? 'numero text-right' : ''}`}>{c}</td>)}</tr>}
      </tbody>
    </table>
  );
}

const Secao = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section className="mb-3"><h2 className="mb-1.5 border-b border-slate-300 pb-0.5 text-[11.5px] font-bold uppercase tracking-wide">{titulo}</h2>{children}</section>
);

function ExtratoContrato({ d }: { d: D }) {
  const c = d.contrato;
  const somaNotas = (d.notas as D[]).reduce((s, n) => s + Number(n.valor), 0);
  return <>
    <Secao titulo="Dados do contrato">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <p><b>Fornecedor:</b> {d.fornecedor.nome} ({d.fornecedor.tipo === 'PF' ? formatarCpf(d.fornecedor.documento) : formatarCnpj(d.fornecedor.documento)})</p>
        <p><b>Modalidade:</b> {d.modalidade}</p>
        <p><b>Processo:</b> {c.processo_administrativo ?? '—'}</p><p><b>Licitação:</b> {c.numero_licitacao ?? '—'}</p>
        <p><b>Vigência:</b> {formatarData(c.data_inicio)} a {formatarData(d.data_fim_atual)}</p><p><b>Unidade responsável:</b> {d.unidade.nome}</p>
        <p><b>Valor global:</b> {brl(c.valor_global)}</p><p><b>Valor atual (com aditivos):</b> {brl(d.valor_atual)}</p>
        <p className="col-span-2"><b>Objeto:</b> {c.objeto}</p>
      </div>
    </Secao>
    <Secao titulo="Responsáveis">
      <Tabela colunas={[['Função'], ['Servidor'], ['Matrícula'], ['Portaria']]} linhas={(d.responsaveis as D[]).map((r) => [PAPEIS[r.papel], r.nome, r.matricula, r.portaria ?? '—'])} />
    </Secao>
    <Secao titulo="Dotação orçamentária"><p className="text-[11px]">{(d.dotacoes as string[]).join(' · ') || '—'}</p></Secao>
    {(d.aditivos as D[]).length > 0 && <Secao titulo="Aditivos aprovados">
      <Tabela colunas={[['Aditivo'], ['Tipo'], ['Assinatura'], ['Nova vigência'], ['Valor', 'r']]}
        linhas={(d.aditivos as D[]).map((a) => [a.numero, TIPO_ADITIVO[a.tipo] ?? a.tipo, formatarData(a.data_assinatura), formatarData(a.nova_data_fim), brl(a.valor)])} />
    </Secao>}
    <Secao titulo="Empenhos">
      <Tabela colunas={[['Empenho'], ['Data'], ['Dotação'], ['Valor + reforços', 'r'], ['Utilizado', 'r'], ['Saldo', 'r']]}
        linhas={(d.empenhos as D[]).map((e) => [`${e.numero}/${e.ano}`, formatarData(e.data), e.classificacao, brl(e.valor_total), brl(e.utilizado), brl(e.saldo)])} />
    </Secao>
    <Secao titulo="Notas fiscais">
      <Tabela colunas={[['Nota'], ['Data'], ['Empenho'], ['Referência'], ['Atesto'], ['Pagamento'], ['Valor', 'r']]}
        linhas={(d.notas as D[]).map((n) => [n.numero, formatarData(n.data), n.empenho, n.meses, n.atesto === 'ATESTADA' ? 'Atestada' : 'Pendente', SIT_PAG[n.pagamento], brl(n.valor)])}
        total={['Total', '', '', '', '', '', brl(somaNotas)]} />
      <p className="text-[11px]"><b>Saldo do contrato:</b> {brl(Number(d.valor_atual) - somaNotas)}</p>
    </Secao>
  </>;
}

function ExtratoEmpenho({ d }: { d: D }) {
  const e = d.empenho;
  return <>
    <Secao titulo="Dados do empenho">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <p><b>Fornecedor:</b> {e.fornecedor_nome}</p><p><b>Contrato:</b> {e.contrato_numero}</p>
        <p><b>Data:</b> {formatarData(e.data_empenho)}</p><p><b>Tipo:</b> {TIPO_EMPENHO[e.tipo] ?? e.tipo}</p>
        <p><b>Processo:</b> {e.processo ?? '—'}</p><p><b>SD:</b> {e.sd ?? '—'}</p>
        <p className="col-span-2"><b>Dotação:</b> {e.classificacao_codigo}</p>
        <p className="col-span-2"><b>Unidades atendidas:</b> {(d.unidades as string[]).join(', ') || '—'}</p>
        <p className="col-span-2"><b>Objeto:</b> {e.contrato_objeto}</p>
      </div>
    </Secao>
    <Secao titulo="Resumo financeiro">
      <Tabela colunas={[['Valor empenhado', 'r'], ['Reforços', 'r'], ['Total', 'r'], ['Utilizado em notas', 'r'], ['Saldo', 'r']]}
        linhas={[[brl(e.valor), brl(e.reforcos), brl(e.valor_total), brl(e.utilizado), brl(e.saldo)]]} />
    </Secao>
    <Secao titulo="Reforços">
      <Tabela colunas={[['Data'], ['Número'], ['Motivo'], ['Valor', 'r']]} linhas={(d.reforcos as D[]).map((r) => [formatarData(r.data), r.numero ?? '—', r.motivo ?? '—', brl(r.valor)])} />
    </Secao>
    <Secao titulo="Notas fiscais">
      <Tabela colunas={[['Nota'], ['Data'], ['Referência'], ['Atesto'], ['Pagamento'], ['Valor', 'r']]}
        linhas={(d.notas as D[]).map((n) => [n.numero, formatarData(n.data), n.meses, n.atesto === 'ATESTADA' ? 'Atestada' : 'Pendente', SIT_PAG[n.pagamento], brl(n.valor)])} />
    </Secao>
  </>;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Consolidado mensal (A4 paisagem): título fixo do modelo; o filtro aparece só nos critérios.
// O cabeçalho da tabela repete em cada página; o rodapé da tabela leva endereço e Secretaria.
function ConsolidadoMensal({ d }: { d: D }) {
  const linhas = d.linhas as D[];
  const cel = 'border border-slate-500 px-1.5 py-1 align-top break-words';
  return <>
    <p className="mb-3 text-center text-[12px] font-semibold">Mês de referência: {MESES[(d.mes as number) - 1]} de {d.ano}</p>
    <p className="mb-2 text-[10.5px]"><b>Unidade:</b> {d.unidade.sigla ? `${d.unidade.sigla} · ` : ''}{d.unidade.nome}{d.secretaria ? ` · ${d.secretaria}` : ''}</p>
    <table className="w-full table-fixed border-collapse text-[10px] leading-snug">
      <colgroup><col style={{ width: '9%' }} /><col style={{ width: '25%' }} /><col style={{ width: '8%' }} /><col style={{ width: '17%' }} />
        <col style={{ width: '6.5%' }} /><col style={{ width: '6.5%' }} /><col style={{ width: '28%' }} /></colgroup>
      <thead className="table-header-group">
        <tr className="bg-slate-100">{['Matrícula', 'Nome do servidor', 'Cargo', 'Função', 'Atrasos', 'Faltas', 'Observações'].map((c) =>
          <th key={c} className={`${cel} font-semibold ${c === 'Atrasos' || c === 'Faltas' ? 'text-center' : 'text-left'}`}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.length === 0 && <tr><td colSpan={7} className={`${cel} text-center`}>Nenhum servidor ativo no mês.</td></tr>}
        {linhas.map((l, i) => (
          <tr key={i} className="break-inside-avoid">
            <td className={cel}>{l.matricula}</td><td className={cel}>{l.nome}</td><td className={cel}>{l.cargo ?? ''}</td><td className={cel}>{l.funcao ?? ''}</td>
            <td className={`${cel} text-center`}>{l.atrasos || ''}</td><td className={`${cel} text-center`}>{l.faltas || ''}</td><td className={cel}>{l.observacao}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="table-footer-group">
        <tr><td colSpan={7} className="pt-2 text-center text-[8.5px] text-slate-600">{[d.secretaria, d.orgao?.endereco].filter(Boolean).join(' · ')}</td></tr>
      </tfoot>
    </table>
    <Assinaturas nomes={d.assinaturas as string[]} />
  </>;
}

function Assinaturas({ nomes }: { nomes: string[] }) {
  return (
    <div className="mt-14 grid break-inside-avoid gap-10 text-center text-[10.5px]" style={{ gridTemplateColumns: `repeat(${Math.max(1, nomes.length)}, minmax(0, 1fr))` }}>
      {nomes.map((n) => <div key={n}><div className="mx-auto mb-1 w-4/5 border-t border-slate-700" />{n}</div>)}
    </div>
  );
}

// Checklist da nota fiscal: conferências do sistema (no momento da emissão) e itens para marcação manual
function ChecklistNota({ d }: { d: D }) {
  const n = d.nota; const f = d.fornecedor;
  return <>
    <Secao titulo="Dados da nota fiscal">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <p><b>Nota fiscal:</b> {n.numero}{n.serie ? `-${n.serie}` : ''}</p><p><b>Emissão:</b> {formatarData(n.data_emissao)}</p>
        <p><b>Valor:</b> {brl(n.valor)}</p><p><b>Referência:</b> {n.meses || '—'}{n.periodo_inicio ? ` (${formatarData(n.periodo_inicio)} a ${formatarData(n.periodo_fim)})` : ''}</p>
        <p className="col-span-2"><b>Fornecedor:</b> {f.nome} ({f.tipo === 'PF' ? formatarCpf(f.documento) : formatarCnpj(f.documento)})</p>
        <p><b>Contrato:</b> {d.contrato.numero} · vigência {formatarData(d.contrato.inicio)} a {formatarData(d.contrato.fim)}</p>
        <p><b>Empenho:</b> {d.empenho.numero}/{d.empenho.ano}</p>
        <p className="col-span-2"><b>Dotação:</b> {d.empenho.classificacao}</p>
        <p><b>Processo:</b> {n.processo ?? '—'}</p><p><b>Unidades atendidas:</b> {(d.unidades as string[]).join(', ') || '—'}</p>
        <p className="col-span-2"><b>Objeto:</b> {d.contrato.objeto}</p>
      </div>
    </Secao>
    <Secao titulo="Conferências do sistema">
      <Tabela colunas={[['Item'], ['Situação']]} linhas={(d.verificacoes as D[]).map((v) => [v.item,
        <span className={v.ok ? 'font-semibold text-emerald-800' : 'font-semibold text-red-800'}>{v.ok ? '✔ Conforme' : '✘ Pendente'}{v.detalhe ? <span className="block font-normal text-slate-700">{v.detalhe}</span> : null}</span>])} />
    </Secao>
    <Secao titulo="Conferência documental">
      <Tabela colunas={[['Item'], ['Sim'], ['Não'], ['Observação']]} linhas={(d.itens_manuais as string[]).map((i) => [i, '( )', '( )', ''])} />
    </Secao>
    <Secao titulo="Responsáveis">
      <Tabela colunas={[['Função'], ['Servidor'], ['Matrícula']]} linhas={(d.responsaveis as D[]).map((r) => [PAPEIS[r.papel], r.nome, r.matricula])} />
      <p className="text-[11px]"><b>Atesto:</b> {d.atesto ? `${d.atesto.nome} (${PAPEIS[d.atesto.papel] ?? d.atesto.papel}) em ${formatarDataHora(d.atesto.em)}` : 'pendente'}</p>
    </Secao>
    <Assinaturas nomes={['Responsável pela conferência', 'Gestor/Fiscal do contrato']} />
  </>;
}

export function Imprimir() {
  const { id } = useParams();
  const navegar = useNavigate();
  const q = useQuery({ queryKey: ['emitido', id], queryFn: () => obterEmitido(id!), enabled: !!id });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <div className="p-6"><CaixaErro mensagem={traduzirErro(q.error).mensagem} /></div>;
  const doc = q.data!;
  const d = doc.dados as D;
  const paisagem = doc.tipo === 'CONSOLIDADO_MENSAL';
  const titulo = doc.tipo === 'CONSOLIDADO_MENSAL' || doc.tipo === 'CHECKLIST_NOTA' ? String(d.titulo) : doc.tipo === 'EXTRATO_CONTRATO' ? `EXTRATO DO CONTRATO Nº ${d.contrato.numero}` : doc.tipo === 'EXTRATO_EMPENHO' ? `EXTRATO DO EMPENHO Nº ${d.empenho.numero}/${d.empenho.ano}` : doc.titulo.toUpperCase();
  return (
    <div className="min-h-dvh bg-slate-200 py-6 print:bg-white print:py-0">
      {paisagem && <style>{'@page { size: A4 landscape; margin: 10mm 10mm 12mm; } @media print { .folha { padding: 0 !important; } }'}</style>}
      <div className={`nao-imprimir mx-auto mb-4 flex ${paisagem ? 'max-w-[297mm]' : 'max-w-[210mm]'} flex-wrap items-center justify-between gap-2 px-4`}>
        <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} onClick={() => navegar(-1)}>Voltar</Botao>
        <p className="text-xs text-slate-600">Documento emitido em {formatarDataHora(doc.emitido_em)}: os dados são os daquele momento.</p>
        <Botao icone={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / salvar PDF</Botao>
      </div>
      <article className="folha mx-auto bg-white px-[14mm] py-[12mm] text-slate-900 shadow-lg print:shadow-none" style={paisagem ? { width: '297mm', minHeight: '210mm' } : { width: '210mm', minHeight: '297mm' }}>
        <header className="mb-4 flex items-center gap-4 border-b-2 border-slate-800 pb-3">
          <ImagemPrivada caminho={d.orgao?.logo_path} alt="Brasão" className="h-16 w-16 object-contain" alternativa={<span className="h-16 w-16" />} />
          <div className="flex-1 text-center">
            {((d.orgao?.cabecalho as string[]) ?? [d.orgao?.nome_oficial]).map((l, i) => <p key={i} className={i === 0 ? 'text-[13px] font-bold' : 'text-[11px] font-semibold'}>{l}</p>)}
          </div>
          <span className="h-16 w-16" />
        </header>
        <h1 className="mb-4 text-center text-[14px] font-bold tracking-wide">{titulo}</h1>
        {doc.tipo === 'EXTRATO_CONTRATO' && <ExtratoContrato d={d} />}
        {doc.tipo === 'EXTRATO_EMPENHO' && <ExtratoEmpenho d={d} />}
        {doc.tipo === 'CONSOLIDADO_MENSAL' && <ConsolidadoMensal d={d} />}
        {doc.tipo === 'CHECKLIST_NOTA' && <ChecklistNota d={d} />}
        {doc.tipo === 'ATESTO' && <p className="whitespace-pre-line text-[12px] leading-relaxed">{d.texto}</p>}
        <footer className="mt-6 border-t border-slate-300 pt-2 text-[9.5px] text-slate-600">
          {d.orgao?.rodape && <p>{d.orgao.rodape}</p>}
          {!paisagem && d.orgao?.endereco && <p>{d.orgao.endereco}</p>}
          <p>Emitido por {d.emitido_por ?? '—'} em {formatarDataHora(doc.emitido_em)} · MEASURE · Documento nº {doc.id.slice(0, 8).toUpperCase()}</p>
        </footer>
      </article>
    </div>
  );
}
