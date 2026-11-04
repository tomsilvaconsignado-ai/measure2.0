import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, SemPermissao, Selo, Vazio } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import type { TipoServico } from '@/lib/tipos';
import { definirStatusTipoServico, listarTiposServico, salvarTipoServico } from '@/services/cadastros';

export function TiposServico() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tipos-servico', orgao?.id], queryFn: () => listarTiposServico(orgao!.id), enabled: !!orgao && pode('tipos_servico', 'ler') });
  const [form, setForm] = useState<Partial<TipoServico> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [alternando, setAlternando] = useState<TipoServico | null>(null);
  const salvar = useMutation({
    mutationFn: () => salvarTipoServico(form!.id ?? null, { tenant_id: orgao!.id, nome: form!.nome!.trim(), descricao: form!.descricao?.trim() || null, ordem: Number(form!.ordem ?? 100) }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['tipos-servico'] }); setForm(null); toast.success('Tipo de serviço salvo.'); },
    onError: (e) => setErro(/tipos_servico_nome_unico/.test((e as Error).message ?? '') ? 'Já existe um tipo de serviço com este nome.' : mensagemDeErro(e)),
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('tipos_servico', 'ler')) return <SemPermissao />;

  return (
    <>
      <CabecalhoPagina titulo="Tipos de serviço" descricao="Usados na referência das notas fiscais (manutenção, material, limpeza…). Administráveis sem mudar o sistema."
        acoes={pode('tipos_servico', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => { setErro(null); setForm({ ordem: 100 }); }}>Novo tipo</Botao>} />
      <Cartao>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data?.length ? <Vazio titulo="Nenhum tipo cadastrado" /> : (
          <ul className="divide-y divide-slate-100">
            {q.data.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">{t.nome}{!t.ativo && <Selo tom="perigo">Inativo</Selo>}</p>
                  {t.descricao && <p className="text-sm text-slate-600">{t.descricao}</p>}
                </div>
                {pode('tipos_servico', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${t.nome}`} onClick={() => { setErro(null); setForm(t); }} />}
                {pode('tipos_servico', 'excluir') && <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={t.ativo ? `Inativar ${t.nome}` : `Reativar ${t.nome}`} onClick={() => setAlternando(t)} />}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <Modal aberto={!!form} aoFechar={() => setForm(null)} titulo={form?.id ? 'Editar tipo de serviço' : 'Novo tipo de serviço'} largura="sm"
        rodape={<><Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao><Botao carregando={salvar.isPending} disabled={(form?.nome ?? '').trim().length < 2} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
        {form && <div className="flex flex-col gap-4">
          <Campo rotulo="Nome" obrigatorio value={form.nome ?? ''} onChange={(e) => setForm((x) => ({ ...x, nome: e.target.value }))} maxLength={100} />
          <Campo rotulo="Descrição" value={form.descricao ?? ''} onChange={(e) => setForm((x) => ({ ...x, descricao: e.target.value }))} maxLength={300} />
          <Campo rotulo="Ordem na lista" type="number" value={String(form.ordem ?? 100)} onChange={(e) => setForm((x) => ({ ...x, ordem: Number(e.target.value) }))} />
          {erro && <CaixaErro mensagem={erro} />}
        </div>}
      </Modal>
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Inativar ${alternando.nome}?` : `Reativar ${alternando?.nome}?`}
        descricao="Tipos inativos não aparecem em novos lançamentos; os já usados continuam no histórico."
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusTipoServico(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['tipos-servico'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}
