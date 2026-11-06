// Decretos do órgão, cadastrados pela plataforma (módulo Desenvolvedor). Ficam disponíveis só para o
// órgão dono, no texto "Decreto em renovação" da nota fiscal. PDF opcional em cada decreto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Plus, Power } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Anexos } from '@/components/Anexos';
import { Botao, CaixaErro, Campo, Carregando, Selo, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarData } from '@/lib/formatacao';
import type { Decreto } from '@/lib/tipos';
import { listarDecretos, salvarDecreto } from '@/services/cadastros';

function FormDecreto({ tenantId, decreto, aberto, aoFechar }: { tenantId: string; decreto: Decreto | null; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ numero: '', descricao: '', data_publicacao: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF({ numero: decreto?.numero ?? '', descricao: decreto?.descricao ?? '', data_publicacao: decreto?.data_publicacao ?? '' });
  }, [aberto, decreto]);
  const salvar = useMutation({
    mutationFn: () => salvarDecreto(decreto?.id ?? null, { tenant_id: tenantId, numero: f.numero.trim(), descricao: f.descricao.trim(), data_publicacao: f.data_publicacao || null }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['decretos', tenantId] }); toast.success(decreto ? 'Decreto atualizado.' : 'Decreto cadastrado.'); aoFechar(); },
    onError: (e) => {
      if (/decretos_orgao_numero_unico/.test((e as Error).message ?? '')) setErros({ numero: 'Este órgão já tem um decreto com este número.' });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.numero.trim()) n.numero = 'Informe o número do decreto.';
    if (f.descricao.trim().length < 3) n.descricao = 'Descreva o decreto (mínimo de 3 caracteres).';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={decreto ? `Editar decreto nº ${decreto.numero}` : 'Novo decreto'} largura="md"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-decreto" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-decreto" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Campo rotulo="Número do decreto" obrigatorio value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} erro={erros.numero} maxLength={60}
          placeholder="Ex.: 7.123/2026" ajuda="Entra no texto como “Decreto nº …”." />
        <Campo rotulo="Data de publicação" type="date" value={f.data_publicacao} onChange={(e) => setF({ ...f, data_publicacao: e.target.value })} />
        <Campo className="sm:col-span-2" rotulo="Descrição / identificação" obrigatorio value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })}
          erro={erros.descricao} maxLength={500} placeholder="Ex.: Regulamenta a fiscalização e a gestão de contratos" />
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
        {!decreto && <p className="text-xs text-slate-500 sm:col-span-2">Depois de salvar, anexe o PDF do decreto na lista.</p>}
      </form>
    </Modal>
  );
}

export function DecretosOrgao({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['decretos', tenantId, 'todos'], queryFn: () => listarDecretos(tenantId) });
  const [editando, setEditando] = useState<Decreto | null | 'novo'>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const alternar = useMutation({
    mutationFn: (d: Decreto) => salvarDecreto(d.id, { ativo: !d.ativo }),
    onSuccess: async (d) => { await qc.invalidateQueries({ queryKey: ['decretos', tenantId] }); toast.success(d.ativo ? 'Decreto reativado.' : 'Decreto inativado: deixa de aparecer nas notas.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Decretos do órgão</h3>
          <p className="text-xs text-slate-500">Usados só por este órgão, no texto “Decreto em renovação” da nota fiscal.</p>
        </div>
        <Botao pequeno icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo decreto</Botao>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} /> : !q.data!.length
        ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nenhum decreto cadastrado.</p>
        : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {q.data!.map((d) => (
            <li key={d.id} className={cx('px-3 py-2', !d.ativo && 'bg-slate-50')}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setAberto(aberto === d.id ? null : d.id)} aria-expanded={aberto === d.id}>
                  {aberto === d.id ? <ChevronUp className="size-4 shrink-0 text-slate-400" /> : <ChevronDown className="size-4 shrink-0 text-slate-400" />}
                  <span className="min-w-0">
                    <span className={cx('flex flex-wrap items-center gap-2 text-sm font-medium', d.ativo ? 'text-slate-900' : 'text-slate-500')}>
                      Decreto nº {d.numero}{!d.ativo && <Selo>Inativo</Selo>}</span>
                    <span className="block truncate text-xs text-slate-500">{d.descricao}{d.data_publicacao ? ` · publicado em ${formatarData(d.data_publicacao)}` : ''}</span>
                  </span>
                </button>
                <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar decreto ${d.numero}`} onClick={() => setEditando(d)} />
                <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} carregando={alternar.isPending && alternar.variables?.id === d.id}
                  aria-label={d.ativo ? `Inativar decreto ${d.numero}` : `Reativar decreto ${d.numero}`} title={d.ativo ? 'Inativar' : 'Reativar'} onClick={() => alternar.mutate(d)} />
              </div>
              {aberto === d.id && <div className="mt-2 pl-6">
                <Anexos recurso="decretos" registroId={d.id} tenantId={tenantId} podeGerenciar titulo="PDF do decreto" vazio="Nenhum arquivo anexado a este decreto." />
              </div>}
            </li>
          ))}
        </ul>}
      <FormDecreto tenantId={tenantId} decreto={editando === 'novo' ? null : editando} aberto={editando !== null} aoFechar={() => setEditando(null)} />
    </div>
  );
}

/** Atalho da lista de órgãos: abre os decretos de um órgão */
export function ModalDecretos({ orgao, aoFechar }: { orgao: { id: string; nome_curto: string } | null; aoFechar: () => void }) {
  return (
    <Modal aberto={!!orgao} aoFechar={aoFechar} titulo={orgao ? `Decretos · ${orgao.nome_curto}` : 'Decretos'} largura="lg"
      rodape={<Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>}>
      {orgao && <DecretosOrgao tenantId={orgao.id} />}
    </Modal>
  );
}
