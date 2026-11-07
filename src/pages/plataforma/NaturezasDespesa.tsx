// Módulo do desenvolvedor: naturezas da despesa (8 dígitos, ex.: 33903900) do ente. Cada uma é cadastrada sozinha;
// o sistema desmembra categoria, grupo, modalidade e elemento. O subelemento é cadastrado à parte (33903914).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { CampoBusca } from '@/components/ui/Abas';
import { Botao, CaixaErro, Campo, Carregando, Paginacao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import type { Ente } from '@/lib/tipos';
import { cadastrarNatureza, definirStatusNatureza, listarNaturezas, type NaturezaDespesa } from '@/services/cadastros';

const POR_PAGINA = 25;
const digitos = (s: string) => s.replace(/\D/g, '');
/** 33903900 → 3.3.90.39.00 */
export const naturezaFormatada = (c: string) => (c.length === 8 ? `${c[0]}.${c[1]}.${c.slice(2, 4)}.${c.slice(4, 6)}.${c.slice(6)}` : c);

function FormNatureza({ ente, item, aoFechar }: { ente: Ente; item: NaturezaDespesa | null | 'novo'; aoFechar: () => void }) {
  const qc = useQueryClient();
  const atual = item === 'novo' ? null : item;
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => { if (item) { setErros({}); setCodigo(atual?.codigo ?? ''); setDescricao(atual?.descricao ?? ''); } }, [item, atual]);
  const cod = digitos(codigo);
  const salvar = useMutation({
    mutationFn: () => cadastrarNatureza(ente.id, cod, descricao.trim()),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['naturezas-ente'] }); toast.success('Natureza da despesa salva.'); aoFechar(); },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });
  const invalida = cod.length > 0 && (cod.length !== 8 || !cod.endsWith('00'));
  return (
    <Modal aberto={!!item} aoFechar={aoFechar} titulo={atual ? `Editar natureza ${naturezaFormatada(atual.codigo)}` : 'Nova natureza da despesa'} largura="md"
      descricao="Como na nota de empenho (Natureza Despesa). Categoria, grupo, modalidade e elemento saem dos dígitos."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao carregando={salvar.isPending} disabled={cod.length !== 8 || invalida || descricao.trim().length < 2} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Código (8 dígitos)" obrigatorio inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={!!atual} maxLength={14}
          placeholder="33903900" erro={invalida ? 'Use 8 dígitos terminando em 00 (o subelemento é cadastrado à parte).' : erros.codigo}
          ajuda={cod.length === 8 && !invalida ? naturezaFormatada(cod) : undefined} />
        <Campo className="sm:col-span-2" rotulo="Descrição" obrigatorio value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300}
          placeholder="Outros Serviços de Terceiros - Pessoa Jurídica" erro={erros.descricao} />
        {erros.geral && <div className="sm:col-span-3"><CaixaErro mensagem={erros.geral} /></div>}
      </div>
    </Modal>
  );
}

export function NaturezasDespesa({ ente }: { ente: Ente }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<NaturezaDespesa | null | 'novo'>(null);
  useEffect(() => setPagina(0), [termo, ente.id]);
  const q = useQuery({
    queryKey: ['naturezas-ente', ente.id, termo, pagina], placeholderData: (a) => a,
    queryFn: () => listarNaturezas({ enteId: ente.id, busca: termo, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
  });
  const alternar = useMutation({
    mutationFn: (n: NaturezaDespesa) => definirStatusNatureza(n.id, !n.ativo),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['naturezas-ente'] }); toast.success('Situação atualizada.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1"><CampoBusca valor={busca} aoMudar={setBusca} placeholder="Código (339039) ou descrição" rotulo="Buscar natureza" /></div>
        <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Nova</Botao>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={mensagemDeErro(q.error)} /> : !q.data!.itens.length
        ? <Vazio titulo="Nenhuma natureza da despesa" descricao="Cadastre as naturezas usadas pelo município (ex.: 33903900, 33903000, 44905100)." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Código</th><th className="py-2 pr-3 font-medium">Descrição</th><th className="py-2" />
            </tr></thead>
            <tbody>
              {q.data!.itens.map((n) => (
                <tr key={n.id} className={cx('border-b border-slate-100', !n.ativo && 'opacity-60')}>
                  <td className="numero py-2 pr-3 font-medium text-slate-900">{n.codigo}<span className="block text-xs font-normal text-slate-500">{naturezaFormatada(n.codigo)}</span></td>
                  <td className="py-2 pr-3">{n.descricao} {!n.ativo && <Selo tom="perigo">Inativa</Selo>}</td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${n.codigo}`} onClick={() => setEditando(n)} />
                    <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={n.ativo ? `Inativar ${n.codigo}` : `Reativar ${n.codigo}`}
                      carregando={alternar.isPending && alternar.variables?.id === n.id} onClick={() => alternar.mutate(n)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      <FormNatureza ente={ente} item={editando} aoFechar={() => setEditando(null)} />
    </div>
  );
}
