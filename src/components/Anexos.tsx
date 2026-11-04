// Lista de anexos de um registro (vários arquivos; adicionar nunca substitui os anteriores).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { mensagemDeErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import type { Recurso } from '@/lib/tipos';
import { abrirDocumento, enviarDocumento, excluirDocumento, listarDocumentos, type Documento } from '@/services/documentos';
import { Botao, Carregando } from './ui/basicos';
import { ConfirmarComMotivo } from './ui/Modal';

export function Anexos({ recurso, registroId, unidadeId = null, categoria = 'GERAL', titulo = 'Documentos anexados', vazio = 'Nenhum documento anexado.' }: {
  recurso: Recurso; registroId: string; unidadeId?: string | null; categoria?: string; titulo?: string; vazio?: string;
}) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [excluindo, setExcluindo] = useState<Documento | null>(null);
  const chave = ['documentos', orgao?.id, recurso, registroId, categoria];
  const q = useQuery({ queryKey: chave, queryFn: () => listarDocumentos(orgao!.id, recurso, registroId, categoria), enabled: !!orgao });
  const enviar = useMutation({
    mutationFn: async (arquivos: File[]) => {
      for (const a of arquivos) {
        await enviarDocumento({ tenantId: orgao!.id, unidadeId, recurso, registroId, categoria, arquivo: a, nome: a.name });
      }
    },
    onSuccess: (_r, arquivos) => toast.success(arquivos.length > 1 ? `${arquivos.length} arquivos anexados.` : 'Arquivo anexado.'),
    onError: (e) => toast.error(mensagemDeErro(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: chave }),
  });
  const podeEnviar = pode(recurso, 'criar') || pode(recurso, 'editar');
  const podeExcluir = pode(recurso, 'excluir');

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        {podeEnviar && <>
          <input ref={entrada} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) enviar.mutate(f); e.target.value = ''; }} />
          <Botao pequeno variante="secundario" icone={<Paperclip className="size-4" />} carregando={enviar.isPending} onClick={() => entrada.current?.click()}>Anexar</Botao>
        </>}
      </div>
      {q.isLoading ? <Carregando /> : !q.data?.length ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">{vazio}</p> : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {q.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <FileText className="size-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-900">{d.nome_arquivo}</p>
                <p className="text-xs text-slate-500">{formatarDataHora(d.enviado_em)} · {(d.tamanho / 1024 / 1024).toFixed(2).replace('.', ',')} MB</p>
              </div>
              <Botao pequeno variante="fantasma" icone={<Eye className="size-4" />} aria-label={`Visualizar ${d.nome_arquivo}`}
                onClick={() => abrirDocumento(d).catch((e) => toast.error(mensagemDeErro(e)))} />
              <Botao pequeno variante="fantasma" icone={<Download className="size-4" />} aria-label={`Baixar ${d.nome_arquivo}`}
                onClick={() => abrirDocumento(d, true).catch((e) => toast.error(mensagemDeErro(e)))} />
              {podeExcluir && <Botao pequeno variante="fantasma" icone={<Trash2 className="size-4 text-red-600" />} aria-label={`Excluir ${d.nome_arquivo}`} onClick={() => setExcluindo(d)} />}
            </li>
          ))}
        </ul>
      )}
      <ConfirmarComMotivo aberto={!!excluindo} aoFechar={() => setExcluindo(null)} titulo={`Excluir ${excluindo?.nome_arquivo ?? ''}?`}
        descricao="O arquivo deixa de aparecer, mas continua guardado com o registro de quem excluiu e por quê."
        rotuloConfirmar="Excluir" aoConfirmar={async (m) => { await excluirDocumento(excluindo!.id, m); await qc.invalidateQueries({ queryKey: chave }); toast.success('Documento excluído.'); }} />
    </div>
  );
}
