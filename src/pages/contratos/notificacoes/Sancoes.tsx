// Sanções efetivamente aplicadas (decisão da autoridade competente, em processo próprio), separadas das
// notificações. Mudança de situação (cumprida, suspensa, anulada, encerrada) exige justificativa.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileDown } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Botao, CabecalhoPagina, CaixaErro, Cartao, Carregando, Selecao, Vazio } from '@/components/ui/basicos';
import { ConfirmarComMotivo } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarData, formatarDataHora } from '@/lib/formatacao';
import { SANCOES, SITUACOES_SANCAO } from '@/lib/notificacaoFormal';
import { supabase } from '@/lib/supabase';
import { situacaoSancao } from '@/services/notificacoesFormais';

interface Linha { id: string; tipo: string; processo: string; autoridade: string; fundamento: string; decisao: string; data_decisao: string; vigencia_inicio: string | null; vigencia_fim: string | null;
  valor: string | null; situacao: string; situacao_justificativa: string | null; notificacao_id: string | null; fornecedores: { razao_social: string; documento: string }; contratos: { numero: string } | null }

export function Sancoes() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [alterando, setAlterando] = useState<{ id: string; situacao: string } | null>(null);
  const q = useQuery({ queryKey: ['sancoes', orgao?.id], enabled: !!orgao, queryFn: async () => {
    const r = await supabase.from('fornecedor_sancoes').select('*, fornecedores(razao_social, documento), contratos(numero)').eq('tenant_id', orgao!.id).order('data_decisao', { ascending: false });
    if (r.error) throw r.error;
    return r.data as unknown as Linha[];
  } });
  if (!orgao) return null;
  const podeAlterar = pode('notificacoes_contratuais', 'aprovar');
  const pdf = async () => {
    const [{ jsPDF }, { default: autoTable }, { t }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('@/lib/pdfPatrimonio')]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(13); doc.text(t('Sanções efetivamente aplicadas a fornecedores'), 14, 14);
    doc.setFontSize(8.5); doc.text(t(`${orgao.nome_curto} · emitido em ${formatarDataHora(new Date().toISOString())}`), 14, 20);
    autoTable(doc, { startY: 25, theme: 'grid', styles: { fontSize: 7.5 }, headStyles: { fillColor: [26, 63, 128] },
      head: [['Empresa', 'CNPJ', 'Contrato', 'Sanção', 'Processo', 'Autoridade', 'Decisão', 'Vigência', 'Situação']],
      body: (q.data ?? []).map((s) => [t(s.fornecedores.razao_social), formatarCnpj(s.fornecedores.documento), s.contratos?.numero ?? '-', t(SANCOES[s.tipo] ?? s.tipo), t(s.processo), t(s.autoridade),
        formatarData(s.data_decisao), s.vigencia_inicio ? `${formatarData(s.vigencia_inicio)} a ${s.vigencia_fim ? formatarData(s.vigencia_fim) : '-'}` : '-', t(SITUACOES_SANCAO[s.situacao] ?? s.situacao)]) });
    doc.save('sancoes_aplicadas.pdf');
  };
  return (
    <>
      <CabecalhoPagina titulo="Sanções aplicadas" descricao="Registro das sanções efetivamente aplicadas pela autoridade competente. Não substitui os cadastros oficiais de sanções nem impede, por si, futuras contratações."
        acoes={<div className="flex gap-2"><Link to="/notificacoes-contratuais"><Botao variante="secundario" icone={<ArrowLeft className="size-4" />}>Voltar</Botao></Link>
          <Botao variante="secundario" icone={<FileDown className="size-4" />} disabled={!q.data?.length} onClick={() => void pdf()}>Relatório PDF</Botao></div>} />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data?.length ? <Vazio titulo="Nenhuma sanção registrada" /> : (
        <Cartao className="p-3 sm:p-4"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-2 py-2">Empresa</th><th className="px-2 py-2">Sanção</th><th className="px-2 py-2">Processo e decisão</th><th className="px-2 py-2">Vigência</th><th className="px-2 py-2">Situação</th></tr></thead>
          <tbody>{q.data.map((s) => (
            <tr key={s.id} className="border-b border-slate-100 align-top">
              <td className="px-2 py-2"><p className="font-medium">{s.fornecedores.razao_social}</p><p className="text-xs text-slate-500">{formatarCnpj(s.fornecedores.documento)}{s.contratos ? ` · contrato ${s.contratos.numero}` : ''}</p>
                {s.notificacao_id && <Link to={`/notificacoes-contratuais/${s.notificacao_id}`} className="text-xs text-marca-700 hover:underline">notificação de origem</Link>}</td>
              <td className="px-2 py-2">{SANCOES[s.tipo]}{s.valor && <p className="text-xs text-slate-500">{brl(s.valor)}</p>}</td>
              <td className="px-2 py-2 text-xs"><p>{s.processo} · {s.autoridade} · {formatarData(s.data_decisao)}</p><p className="text-slate-600">{s.fundamento}</p><p className="text-slate-600">{s.decisao}</p></td>
              <td className="whitespace-nowrap px-2 py-2 text-xs">{s.vigencia_inicio ? `${formatarData(s.vigencia_inicio)} a ${s.vigencia_fim ? formatarData(s.vigencia_fim) : '—'}` : '—'}</td>
              <td className="px-2 py-2 text-xs">{podeAlterar ? <Selecao rotulo="" aria-label="Situação" value={s.situacao} onChange={(e) => setAlterando({ id: s.id, situacao: e.target.value })}>
                {Object.entries(SITUACOES_SANCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao> : SITUACOES_SANCAO[s.situacao]}
                {s.situacao_justificativa && <p className="mt-1 text-slate-500">{s.situacao_justificativa}</p>}</td>
            </tr>
          ))}</tbody>
        </table></div></Cartao>
      )}
      <ConfirmarComMotivo aberto={!!alterando} aoFechar={() => setAlterando(null)} titulo="Alterar a situação da sanção?" rotuloConfirmar="Alterar"
        descricao={`Nova situação: ${alterando ? SITUACOES_SANCAO[alterando.situacao] : ''}. A justificativa fica registrada.`}
        aoConfirmar={async (m) => { await situacaoSancao(alterando!.id, alterando!.situacao, m); toast.success('Situação atualizada.'); await qc.invalidateQueries({ queryKey: ['sancoes'] }); }} />
    </>
  );
}
