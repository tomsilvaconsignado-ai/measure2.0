// Extratos de notas do contrato no modelo aprovado pelo Controle Interno (A4 paisagem).
// Cada emissão guarda o retrato do momento e abre a página de impressão. Na nota, "BAIXAR OS 3 EXTRATOS"
// emite os três e salva os PDFs numa pasta escolhida (extrato_01{nº da nota}.pdf, _02 e _03).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, FolderDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSalvarEmPasta } from '@/components/SalvarEmPasta';
import { Botao } from '@/components/ui/basicos';
import { mensagemDeErro } from '@/lib/erros';
import { nomesExtratos } from '@/lib/salvarEmPasta';
import { emitirExtratoNotas, obterEmitido, type ModeloExtratoNotas } from '@/services/execucao';
import { extratoValido, pdfDoEmitido } from './pdfEmitidos';

const MODELOS: Array<{ modelo: ModeloExtratoNotas; titulo: string; descricao: string }> = [
  { modelo: 'EXTRATO_NOTAS', titulo: '1. Histórico de notas do contrato', descricao: 'Todas as notas, com valor pago, impostos retidos, pendência e saldo' },
  { modelo: 'EXTRATO_UNIDADES', titulo: '2. Histórico por unidade', descricao: 'Notas por unidade de saúde e mês de referência, com resumo por unidade' },
  { modelo: 'EXTRATO_RATEIO', titulo: '3. Rateio por unidade', descricao: 'Valor de cada unidade rateada em cada nota, com resumo por unidade' },
];

export function ExtratosNotas({ contratoId, numeroNota }: { contratoId: string; numeroNota?: string }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const pasta = useSalvarEmPasta();
  const emitir = useMutation({
    mutationFn: (modelo: ModeloExtratoNotas) => emitirExtratoNotas(contratoId, modelo),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['emitidos', contratoId] }); navegar(`/imprimir/${id}`); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  // emite os três, confere se saíram completos e só então gera os PDFs
  const gerarTres = async () => {
    const docs = [];
    for (const m of MODELOS) {
      const doc = await obterEmitido(await emitirExtratoNotas(contratoId, m.modelo));
      if (!extratoValido(doc, m.modelo)) throw { erro: `O extrato "${m.titulo}" não foi gerado corretamente. Nada foi salvo.` };
      docs.push(doc);
    }
    await qc.invalidateQueries({ queryKey: ['emitidos', contratoId] });
    const pdfs: Blob[] = [];
    for (const d of docs) pdfs.push(await pdfDoEmitido(qc, d));
    return pdfs;
  };
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">Extratos de notas fiscais</p>
          <p className="mb-2 text-xs text-slate-500">Modelo do Controle Interno, em A4 paisagem. Os dados ficam guardados como estavam na emissão.</p>
        </div>
        {numeroNota && <Botao pequeno icone={<FolderDown className="size-4" />} carregando={pasta.ocupado} disabled={emitir.isPending}
          title={`Salva extrato_01${numeroNota}.pdf, extrato_02${numeroNota}.pdf e extrato_03${numeroNota}.pdf na pasta que você escolher`}
          onClick={() => void pasta.salvar(nomesExtratos(numeroNota), gerarTres, {
            pasta: 'Os três extratos foram salvos com sucesso na pasta selecionada.', download: 'Os três extratos foram baixados.' })}>BAIXAR OS 3 EXTRATOS</Botao>}
      </div>
      <ul className="divide-y divide-slate-100">
        {MODELOS.map((m) => (
          <li key={m.modelo} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-start gap-2.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-marca-700" aria-hidden />
              <span className="min-w-0 text-sm"><span className="font-medium text-slate-800">{m.titulo}</span><span className="block text-xs text-slate-500">{m.descricao}</span></span>
            </span>
            <Botao pequeno variante="secundario" carregando={emitir.isPending && emitir.variables === m.modelo} disabled={emitir.isPending || pasta.ocupado}
              onClick={() => emitir.mutate(m.modelo)} aria-label={`Emitir ${m.titulo}`}>Emitir</Botao>
          </li>
        ))}
      </ul>
      {numeroNota && !pasta.pastaDisponivel && <p className="mt-1 text-xs text-slate-500">Este navegador não permite escolher a pasta: os extratos vão para a pasta de downloads, com os nomes padronizados.</p>}
      {pasta.dialogo}
    </div>
  );
}
