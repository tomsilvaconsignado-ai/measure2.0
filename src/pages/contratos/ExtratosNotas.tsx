// Extratos de notas do contrato no modelo aprovado pelo Controle Interno (A4 paisagem).
// Cada emissão guarda o retrato do momento e abre a página de impressão.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Botao } from '@/components/ui/basicos';
import { mensagemDeErro } from '@/lib/erros';
import { emitirExtratoNotas, type ModeloExtratoNotas } from '@/services/execucao';

const MODELOS: Array<{ modelo: ModeloExtratoNotas; titulo: string; descricao: string }> = [
  { modelo: 'EXTRATO_NOTAS', titulo: '1. Histórico de notas do contrato', descricao: 'Todas as notas, com valor pago, impostos retidos, pendência e saldo' },
  { modelo: 'EXTRATO_UNIDADES', titulo: '2. Histórico por unidade', descricao: 'Notas por unidade de saúde e mês de referência, com resumo por unidade' },
  { modelo: 'EXTRATO_RATEIO', titulo: '3. Rateio por unidade', descricao: 'Valor de cada unidade rateada em cada nota, com resumo por unidade' },
];

export function ExtratosNotas({ contratoId }: { contratoId: string }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const emitir = useMutation({
    mutationFn: (modelo: ModeloExtratoNotas) => emitirExtratoNotas(contratoId, modelo),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['emitidos', contratoId] }); navegar(`/imprimir/${id}`); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-900">Extratos de notas fiscais</p>
      <p className="mb-2 text-xs text-slate-500">Modelo do Controle Interno, em A4 paisagem. Os dados ficam guardados como estavam na emissão.</p>
      <ul className="divide-y divide-slate-100">
        {MODELOS.map((m) => (
          <li key={m.modelo} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-start gap-2.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-marca-700" aria-hidden />
              <span className="min-w-0 text-sm"><span className="font-medium text-slate-800">{m.titulo}</span><span className="block text-xs text-slate-500">{m.descricao}</span></span>
            </span>
            <Botao pequeno variante="secundario" carregando={emitir.isPending && emitir.variables === m.modelo} disabled={emitir.isPending}
              onClick={() => emitir.mutate(m.modelo)} aria-label={`Emitir ${m.titulo}`}>Emitir</Botao>
          </li>
        ))}
      </ul>
    </div>
  );
}
