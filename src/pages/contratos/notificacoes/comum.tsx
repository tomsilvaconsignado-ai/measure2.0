// Peças comuns das notificações formais: selo de situação, lista compacta (contrato e fornecedor) e relatório PDF.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { Carregando, Selo, cx } from '@/components/ui/basicos';
import { formatarCnpj, formatarData, formatarDataHora } from '@/lib/formatacao';
import { GRAVIDADES, PAPEIS, SANCOES, SITUACOES_SANCAO, STATUS, type StatusNotificacao } from '@/lib/notificacaoFormal';
import { historicoFornecedor, painel, type ItemPainel } from '@/services/notificacoesFormais';

export function SeloStatus({ status }: { status: StatusNotificacao }) {
  return <Selo tom={STATUS[status].tom}>{STATUS[status].rotulo}</Selo>;
}

/** Lista das notificações de um contrato (aba do contrato) */
export function NotificacoesDoContrato({ contratoId }: { contratoId: string }) {
  const { orgao } = useSessao();
  const q = useQuery({ queryKey: ['nf-painel', orgao?.id, { contrato_id: contratoId }], queryFn: () => painel(orgao!.id, { contrato_id: contratoId, limite: 100 }), enabled: !!orgao });
  if (q.isLoading) return <Carregando />;
  if (!q.data?.itens.length) return <p className="text-sm text-slate-500">Nenhuma notificação formal registrada neste contrato.</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {q.data.itens.map((n) => (
        <li key={n.id}><Link to={`/notificacoes-contratuais/${n.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
          <span className="font-medium text-slate-800">{n.rotulo}</span>
          <span className="min-w-0 flex-1 truncate text-slate-600">{n.tipo ?? '—'}</span>
          <span className="text-xs text-slate-500">{n.emitida_em ? formatarData(n.emitida_em) : 'não emitida'}</span>
          <SeloStatus status={n.status} />
        </Link></li>
      ))}
    </ul>
  );
}

export function LinhaPainel({ n }: { n: ItemPainel }) {
  const vencida = n.status === 'PRAZO_VENCIDO';
  return (
    <tr className={cx('border-b border-slate-100 align-top hover:bg-slate-50', vencida && 'bg-red-50/40')}>
      <td className="px-2 py-2"><Link to={`/notificacoes-contratuais/${n.id}`} className="font-medium text-marca-700 hover:underline">{n.numero ? `${n.numero}/${n.ano}${n.versao > 1 ? ` v${n.versao}` : ''}` : 'Rascunho'}</Link></td>
      <td className="px-2 py-2"><p className="font-medium text-slate-800">{n.fornecedor_nome}</p><p className="text-xs text-slate-500">{formatarCnpj(n.cnpj)}</p></td>
      <td className="px-2 py-2"><Link to={`/contratos/${n.contrato_id}`} className="hover:underline">{n.contrato_numero}</Link><p className="text-xs text-slate-500">{n.coordenacao ?? n.diretoria ?? ''}</p></td>
      <td className="px-2 py-2"><p>{n.tipo ?? '—'}</p><p className="text-xs text-slate-500">Gravidade {GRAVIDADES[n.gravidade].toLowerCase()}</p></td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{n.emitida_em ? formatarDataHora(n.emitida_em) : '—'}</td>
      <td className="px-2 py-2 text-xs"><p>{n.emissor ?? '—'}</p><p className="text-slate-500">{n.emissor_papel ? PAPEIS[n.emissor_papel] : ''}</p></td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{n.data_limite ? formatarData(n.data_limite) : '—'}{n.respostas > 0 && <p className="text-slate-500">{n.respostas} resposta(s)</p>}</td>
      <td className="px-2 py-2"><SeloStatus status={n.status} /></td>
    </tr>
  );
}

/** Relatório PDF da lista filtrada, agrupado (empresa, contrato, coordenação, emissor, situação) */
export async function relatorioPdf(itens: ItemPainel[], titulo: string, agrupar: 'fornecedor' | 'contrato' | 'coordenacao' | 'emissor' | 'status', orgao: string) {
  const [{ jsPDF }, { default: autoTable }, { t }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('@/lib/pdfPatrimonio')]);
  const chave = (n: ItemPainel) => agrupar === 'fornecedor' ? `${n.fornecedor_nome} (${formatarCnpj(n.cnpj)})` : agrupar === 'contrato' ? `Contrato nº ${n.contrato_numero}`
    : agrupar === 'coordenacao' ? [n.secretaria, n.diretoria, n.coordenacao].filter(Boolean).join(' › ') || 'Sem estrutura' : agrupar === 'emissor' ? `${n.emissor ?? '—'}${n.emissor_papel ? ` (${PAPEIS[n.emissor_papel]})` : ''}` : STATUS[n.status].rotulo;
  const grupos = new Map<string, ItemPainel[]>();
  for (const n of itens) grupos.set(chave(n), [...(grupos.get(chave(n)) ?? []), n]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setFontSize(13); pdf.text(t(titulo), 14, 14);
  pdf.setFontSize(8.5); pdf.text(t(`${orgao} · ${itens.length} notificação(ões) · emitido em ${formatarDataHora(new Date().toISOString())} · notificação não constitui sanção`), 14, 20);
  let y = 25;
  for (const [g, lista] of [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)) {
    autoTable(pdf, {
      startY: y, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.1 }, headStyles: { fillColor: [26, 63, 128] },
      head: [[{ content: t(`${g} — ${lista.length}`), colSpan: 7, styles: { halign: 'left', fillColor: [219, 231, 246], textColor: [15, 42, 74] } }],
        ['Nº', 'Empresa', 'Contrato', 'Ocorrência', 'Emissão', 'Prazo', 'Situação']],
      body: lista.map((n) => [n.numero ? `${n.numero}/${n.ano}` : 'rascunho', t(n.fornecedor_nome), n.contrato_numero, t(n.tipo ?? '-'),
        n.emitida_em ? formatarData(n.emitida_em) : '-', n.data_limite ? formatarData(n.data_limite) : '-', t(STATUS[n.status].rotulo)]),
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }
  const paginas = pdf.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) { pdf.setPage(i); pdf.setFontSize(7); pdf.text(t(`Página ${i} de ${paginas} · MEASURE`), 14, pdf.internal.pageSize.getHeight() - 6); }
  pdf.save(`${titulo.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '_').replace(/_+$/, '')}.pdf`);
}

/** Aba do cadastro do fornecedor: histórico permanente de ocorrências, notificações e sanções aplicadas */
export function HistoricoFornecedor({ fornecedorId, nome, documento }: { fornecedorId: string; nome: string; documento: string }) {
  const q = useQuery({ queryKey: ['nf-historico-fornecedor', fornecedorId], queryFn: () => historicoFornecedor(fornecedorId) });
  if (q.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <p className="text-sm text-slate-500">Histórico indisponível para o seu perfil.</p>;
  const h = q.data;
  const pdf = async () => {
    const [{ jsPDF }, { default: autoTable }, { t }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('@/lib/pdfPatrimonio')]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(13); doc.text(t(`Histórico de ocorrências e notificações – ${nome}`), 14, 14);
    doc.setFontSize(8.5); doc.text(t(`CNPJ ${formatarCnpj(documento)} · emitido em ${formatarDataHora(new Date().toISOString())} · notificações não constituem sanção`), 14, 20);
    autoTable(doc, { startY: 25, theme: 'grid', styles: { fontSize: 7.5 }, headStyles: { fillColor: [26, 63, 128] },
      head: [['Notificação', 'Contrato', 'Ocorrência', 'Data', 'Responsável', 'Prazo', 'Resposta / análise', 'Situação']],
      body: h.itens.map((i) => [t(i.rotulo), i.contrato_numero, t(i.tipo ?? '-'), i.data_ocorrencia ? formatarData(i.data_ocorrencia) : '-', t(`${i.emissor ?? '-'}`),
        i.prazo_dias ? `${i.prazo_dias} d ${i.prazo_tipo === 'UTEIS' ? 'úteis' : 'corridos'}` : '-', t(`${i.respostas ? 'respondida' : 'sem resposta'}${i.analise ? ` / ${i.analise.toLowerCase()}` : ''}`), t(STATUS[i.status].rotulo + (i.encaminhada ? ' (encaminhada)' : ''))]) });
    if (h.sancoes.length) {
      autoTable(doc, { theme: 'grid', styles: { fontSize: 7.5 }, headStyles: { fillColor: [127, 29, 29] }, head: [['Sanção aplicada', 'Processo', 'Autoridade', 'Decisão', 'Vigência', 'Situação']],
        body: h.sancoes.map((s) => [t(SANCOES[s.tipo] ?? s.tipo), t(s.processo), t(s.autoridade), formatarData(s.data_decisao), s.vigencia_inicio ? `${formatarData(s.vigencia_inicio)} a ${s.vigencia_fim ? formatarData(s.vigencia_fim) : '-'}` : '-', t(SITUACOES_SANCAO[s.situacao] ?? s.situacao)]) });
    }
    doc.save(`historico_ocorrencias_${documento}.pdf`);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Histórico informativo. Uma notificação não representa sanção nem declara a empresa inidônea ou impedida.</p>
        <button className="text-sm text-marca-700 hover:underline" onClick={() => void pdf()}>Relatório PDF</button>
      </div>
      {h.fora_do_acesso > 0 && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Há mais {h.fora_do_acesso} notificação(ões) desta empresa em contratos fora do seu acesso (detalhes restritos).</p>}
      {!h.itens.length ? <p className="text-sm text-slate-500">Nenhuma ocorrência ou notificação registrada.</p> : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {h.itens.map((i) => (
            <li key={i.id}><Link to={`/notificacoes-contratuais/${i.id}`} className="block px-3 py-2 text-sm hover:bg-slate-50">
              <div className="flex flex-wrap items-center gap-2"><b>{i.rotulo}</b><span className="text-slate-600">Contrato nº {i.contrato_numero} · {i.orgao}</span><span className="ml-auto"><SeloStatus status={i.status} /></span></div>
              <p className="text-xs text-slate-600">{i.tipo ?? 'Ocorrência'}{i.data_ocorrencia ? ` em ${formatarData(i.data_ocorrencia)}` : ''} · {i.emissor ?? '—'}{i.emissor_papel ? ` (${PAPEIS[i.emissor_papel]})` : ''}
                {i.prazo_dias ? ` · prazo ${i.prazo_dias} dias${i.data_limite ? ` até ${formatarData(i.data_limite)}` : ''}` : ''} · {i.respostas ? `resposta registrada${i.analise ? ` (${i.analise.toLowerCase().replace('_', ' ')})` : ''}` : 'sem resposta'}{i.encaminhada ? ' · encaminhada para apuração' : ''}</p>
              <p className="line-clamp-2 text-xs text-slate-500">{i.resumo}</p>
            </Link></li>
          ))}
        </ul>
      )}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Sanções efetivamente aplicadas</h3>
        {!h.sancoes.length ? <p className="text-sm text-slate-500">Nenhuma sanção registrada.</p> : (
          <ul className="flex flex-col gap-2 text-sm">{h.sancoes.map((s) => (
            <li key={s.id} className="rounded-lg border border-red-200 bg-red-50/40 px-3 py-2"><b>{SANCOES[s.tipo]}</b> · {SITUACOES_SANCAO[s.situacao]} · processo {s.processo}{s.contrato_numero ? ` · contrato ${s.contrato_numero}` : ''}
              <p className="text-xs text-slate-600">{s.autoridade} · decisão de {formatarData(s.data_decisao)} · {s.fundamento}</p></li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}
