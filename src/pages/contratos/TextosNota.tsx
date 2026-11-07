// Textos padronizados da nota fiscal, prontos para copiar:
// - decreto em renovação: usado pelo administrativo ao lançar a nota (antes do atesto do fiscal);
// - encaminhamento do atesto: depois que o gestor/fiscal/suplente atesta.
import { useQuery } from '@tanstack/react-query';
import { ClipboardCopy, FileText, Send } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Botao, Selecao } from '@/components/ui/basicos';
import { textoDecretoRenovacao, textoEncaminhamentoAtesto } from '@/lib/atesto';
import { formatarData } from '@/lib/formatacao';
import { listarDecretos } from '@/services/cadastros';

function copiar(texto: string, aviso = 'Texto copiado.') {
  navigator.clipboard.writeText(texto).then(() => toast.success(aviso), () => toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.'));
}

function BlocoTexto({ titulo, icone, texto, rotuloCopiar, children }: { titulo: string; icone: ReactNode; texto: string; rotuloCopiar: string; children?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">{icone}{titulo}</h4>
      {children}
      <div className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800" aria-label={titulo}>{texto}</div>
      <Botao pequeno variante="secundario" className="mt-2" icone={<ClipboardCopy className="size-4" />} onClick={() => copiar(texto)}>{rotuloCopiar}</Botao>
    </section>
  );
}

/** Decreto em renovação (decretos do órgão + processo do contrato): texto do administrativo ao lançar a nota */
export function TextoDecreto({ tenantId, processoContrato }: { tenantId: string; processoContrato: string | null }) {
  const decretos = useQuery({ queryKey: ['decretos', tenantId, 'ativos'], queryFn: () => listarDecretos(tenantId, true) });
  const [decretoId, setDecretoId] = useState('');
  useEffect(() => { if (!decretoId && decretos.data?.length === 1) setDecretoId(decretos.data[0]!.id); }, [decretos.data, decretoId]);
  const decreto = decretos.data?.find((d) => d.id === decretoId) ?? null;
  if (decretos.data && !decretos.data.length) {
    return <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">Nenhum decreto cadastrado para este órgão. O cadastro é feito pelo módulo Desenvolvedor (Órgãos → Decretos).</p>;
  }
  return (
    <BlocoTexto titulo="Decreto em renovação" icone={<FileText className="size-4 text-marca-700" />} rotuloCopiar="Copiar texto do decreto"
      texto={textoDecretoRenovacao(decreto?.numero, processoContrato)}>
      <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Selecao rotulo="Decreto" value={decretoId} onChange={(e) => setDecretoId(e.target.value)} disabled={decretos.isLoading}>
          <option value="">Escolha o decreto…</option>
          {decretos.data?.map((d) => <option key={d.id} value={d.id}>Decreto nº {d.numero}{d.data_publicacao ? ` (${formatarData(d.data_publicacao)})` : ''} – {d.descricao}</option>)}
        </Selecao>
      </div>
      {!processoContrato && <p className="mb-2 text-xs text-amber-800">O contrato não tem número de processo cadastrado: complete no cadastro do contrato para preencher o texto.</p>}
    </BlocoTexto>
  );
}

/** Encaminhamento do atesto à administração: disponível depois que a nota é atestada */
export function TextoEncaminhamento({ numeroNota, atestada }: { numeroNota: string; atestada: boolean }) {
  return atestada
    ? <BlocoTexto titulo="Encaminhamento do atesto" icone={<Send className="size-4 text-marca-700" />} texto={textoEncaminhamentoAtesto(numeroNota)} rotuloCopiar="Copiar texto do atesto" />
    : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">O texto de encaminhamento do atesto fica disponível depois que a nota for atestada.</p>;
}
