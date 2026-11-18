// Aba "Termo de Referência" do contrato: serviços do TR (com valor unitário e total, o já pedido em ordens de
// serviço e o saldo) e as unidades atendidas com o endereço. Cadastro, edição e exclusão manuais
// ("excluir" = inativar com motivo, que fica na auditoria e preserva o histórico das OS).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { SeletorUnidadesAtendidas, type UnidadeEscolhida } from '@/components/SeletorUnidadesAtendidas';
import { CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CaixaErro, Campo, Carregando, Selo, TituloSecao, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, centavos, decimalDeCentavos, formatarCentavos } from '@/lib/formatacao';
import type { ContratoResumo } from '@/lib/tipos';
import {
  definirEnderecoUnidadeTr, inativarItemTr, incluirUnidadesTr, listarItensTr, listarUnidadesTr, removerUnidadeTr, salvarItemTr, type ItemTr,
} from '@/services/execucao';

const num = (v: number | string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function FormItem({ contratoId, item, proximo, aoFechar }: { contratoId: string; item: ItemTr | null; proximo: number; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ item: '', descricao: '', tipo: '', especificacao: '', unidade_medida: 'UNIDADE', quantidade: '', observacoes: '' });
  const [valor, setValor] = useState<number | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    setErros({});
    setF({ item: String(item?.item ?? proximo), descricao: item?.descricao ?? '', tipo: item?.tipo ?? '', especificacao: item?.especificacao ?? '',
      unidade_medida: item?.unidade_medida ?? 'UNIDADE', quantidade: item ? String(Number(item.quantidade)) : '', observacoes: item?.observacoes ?? '' });
    setValor(item ? centavos(item.valor_unitario) : null);
  }, [item, proximo]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const qtd = Number(f.quantidade.replace(',', '.'));
  const salvar = useMutation({
    mutationFn: () => salvarItemTr(item?.id ?? null, {
      contrato_id: contratoId, item: Number(f.item), descricao: f.descricao.trim(), tipo: f.tipo.trim() || null, especificacao: f.especificacao.trim() || null,
      unidade_medida: f.unidade_medida.trim() || 'UNIDADE', quantidade: String(qtd), valor_unitario: decimalDeCentavos(valor ?? 0), observacoes: f.observacoes.trim() || null,
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['tr-itens', contratoId] }); toast.success(item ? 'Item do TR atualizado.' : 'Item incluído no TR.'); aoFechar(); },
    onError: (e) => {
      if (/tr_itens_numero/.test((e as Error).message ?? '')) { setErros({ item: `Já existe o item ${f.item} neste TR.` }); return; }
      const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem });
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!Number.isInteger(Number(f.item)) || Number(f.item) < 1) n.item = 'Número do item inválido.';
    if (f.descricao.trim().length < 3) n.descricao = 'Descreva o serviço.';
    if (!(qtd > 0)) n.quantidade = 'Informe a quantidade.';
    if (valor === null) n.valor_unitario = 'Informe o valor unitário.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={item ? `Editar item ${item.item} do TR` : 'Novo item do Termo de Referência'} largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-item-tr" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-item-tr" onSubmit={enviar} className="grid gap-4 sm:grid-cols-6" noValidate>
        <Campo className="sm:col-span-1" rotulo="Item nº" obrigatorio inputMode="numeric" value={f.item} onChange={set('item')} erro={erros.item} />
        <Campo className="sm:col-span-5" rotulo="Descrição do serviço" obrigatorio value={f.descricao} onChange={set('descricao')} erro={erros.descricao} maxLength={500}
          placeholder="Ex.: Manutenção e recarga de extintores - ABC 8 kg (4-A/40-B:C)" />
        <Campo className="sm:col-span-3" rotulo="Tipo" value={f.tipo} onChange={set('tipo')} maxLength={120} placeholder="Ex.: ABC 8 kg"
          ajuda="Aparece na ordem de serviço (ex.: tipo de extintor)." />
        <Campo className="sm:col-span-3" rotulo="Capacidade / especificação" value={f.especificacao} onChange={set('especificacao')} maxLength={200} placeholder="Ex.: 4-A/40-B:C" />
        <Campo className="sm:col-span-2" rotulo="Unidade de medida" value={f.unidade_medida} onChange={set('unidade_medida')} maxLength={40} />
        <Campo className="sm:col-span-2" rotulo="Quantidade" obrigatorio inputMode="decimal" value={f.quantidade} onChange={set('quantidade')} erro={erros.quantidade} />
        <CampoMoeda className="sm:col-span-2" rotulo="Valor unitário" obrigatorio centavos={valor} aoMudar={setValor} erro={erros.valor_unitario} />
        <p className="rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-900 sm:col-span-6">
          Valor total do item: <strong className="numero">{qtd > 0 && valor !== null ? formatarCentavos(Math.round(qtd * valor)) : '—'}</strong>
        </p>
        <AreaTexto className="sm:col-span-6" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} rows={2} />
        {erros.geral && <div className="sm:col-span-6"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

function UnidadesTr({ c, podeEditar }: { c: ContratoResumo; podeEditar: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tr-unidades', c.id], queryFn: () => listarUnidadesTr(c.id) });
  const [incluindo, setIncluindo] = useState<UnidadeEscolhida[] | null>(null);
  const [editando, setEditando] = useState<{ id: string; endereco: string } | null>(null);
  const atualizar = () => qc.invalidateQueries({ queryKey: ['tr-unidades', c.id] });
  const incluir = useMutation({
    mutationFn: () => incluirUnidadesTr(c.id, (incluindo ?? []).map((u) => u.id)),
    onSuccess: async () => { await atualizar(); toast.success('Unidades incluídas no TR.'); setIncluindo(null); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const endereco = useMutation({
    mutationFn: () => definirEnderecoUnidadeTr(c.id, editando!.id, editando!.endereco.trim() || null),
    onSuccess: async () => { await atualizar(); setEditando(null); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const remover = useMutation({
    mutationFn: (id: string) => removerUnidadeTr(c.id, id),
    onSuccess: async () => { await atualizar(); toast.success('Unidade retirada do TR.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <section>
      <TituloSecao acoes={podeEditar && <Botao pequeno variante="secundario" icone={<Plus className="size-4" />} onClick={() => setIncluindo([])}>Incluir unidades</Botao>}>
        Unidades atendidas ({q.data?.length ?? 0})
      </TituloSecao>
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio titulo="Nenhuma unidade no TR" descricao="Inclua as unidades onde o serviço é prestado (item de execução do TR)." /> : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((u) => (
            <li key={u.unidade_atendida_id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-acento-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-marca-900">{u.unidade.nome}</p>
                {editando?.id === u.unidade_atendida_id ? (
                  <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); endereco.mutate(); }}>
                    <input autoFocus value={editando.endereco} onChange={(e) => setEditando({ ...editando, endereco: e.target.value })} maxLength={300}
                      className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-xs" aria-label="Endereço" />
                    <Botao pequeno type="submit" carregando={endereco.isPending}>OK</Botao>
                  </form>
                ) : <p className="text-xs text-slate-600">{u.endereco ?? 'Endereço não informado'}</p>}
              </div>
              {podeEditar && editando?.id !== u.unidade_atendida_id && <span className="flex shrink-0">
                <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar endereço" aria-label={`Editar endereço de ${u.unidade.nome}`}
                  onClick={() => setEditando({ id: u.unidade_atendida_id, endereco: u.endereco ?? '' })}><Pencil className="size-3.5" /></button>
                <button type="button" className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Retirar do TR" aria-label={`Retirar ${u.unidade.nome} do TR`}
                  onClick={() => remover.mutate(u.unidade_atendida_id)}><X className="size-3.5" /></button>
              </span>}
            </li>
          ))}
        </ul>
      )}
      {incluindo !== null && (
        <Modal aberto aoFechar={() => setIncluindo(null)} titulo="Incluir unidades atendidas no TR" largura="lg"
          rodape={<><Botao variante="secundario" onClick={() => setIncluindo(null)}>Cancelar</Botao>
            <Botao disabled={!incluindo.length} carregando={incluir.isPending} onClick={() => incluir.mutate()}>Incluir {incluindo.length || ''}</Botao></>}>
          <SeletorUnidadesAtendidas valor={incluindo} aoMudar={setIncluindo} ajuda="O endereço de cada unidade pode ser informado depois, no lápis ao lado do nome." />
        </Modal>
      )}
    </section>
  );
}

export function TermoReferencia({ c }: { c: ContratoResumo }) {
  const { pode, ehPlataforma } = useSessao();
  const qc = useQueryClient();
  const podeEditar = pode('contratos', 'editar') || ehPlataforma;
  const q = useQuery({ queryKey: ['tr-itens', c.id], queryFn: () => listarItensTr(c.id) });
  const [editando, setEditando] = useState<ItemTr | null | 'novo'>(null);
  const [excluindo, setExcluindo] = useState<ItemTr | null>(null);
  const [verInativos, setVerInativos] = useState(false);
  const ativos = (q.data ?? []).filter((i) => i.ativo);
  const lista = verInativos ? q.data ?? [] : ativos;
  const total = ativos.reduce((s, i) => s + centavos(i.valor_total), 0);
  const solicitado = ativos.reduce((s, i) => s + Math.round(Number(i.solicitado) * centavos(i.valor_unitario)), 0);
  const proximo = Math.max(0, ...ativos.map((i) => i.item)) + 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Valor total do TR', formatarCentavos(total), `${ativos.length} item(ns)`], ['Já solicitado em OS', formatarCentavos(solicitado), 'pelo valor unitário do TR'],
          ['Saldo do TR', formatarCentavos(total - solicitado), total ? `${(((total - solicitado) / total) * 100).toFixed(1).replace('.', ',')}% disponível` : '']].map(([t, v, d]) => (
          <div key={t} className="rounded-xl border border-slate-200 border-l-4 border-l-acento-500 bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t}</p>
            <p className="numero text-xl font-extrabold text-marca-900">{v}</p>
            <p className="text-xs text-slate-500">{d}</p>
          </div>
        ))}
      </div>

      <section>
        <TituloSecao acoes={<>
          {(q.data ?? []).some((i) => !i.ativo) && <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" className="size-3.5 accent-marca-700"
            checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} />Mostrar excluídos</label>}
          {podeEditar && <Botao pequeno icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo item</Botao>}
        </>}>
          <span className="inline-flex items-center gap-1.5"><ClipboardList className="size-4" aria-hidden />Serviços do Termo de Referência</span>
        </TituloSecao>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !lista.length ? (
          <Vazio titulo="Termo de Referência sem itens" descricao="Cadastre os serviços do TR com quantidade e valor unitário. Eles serão usados nas ordens de serviço." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr>
                <th className="text-left">Item</th><th className="text-left">Serviço</th><th className="text-left">Tipo</th><th className="text-left">Capacidade / espec.</th>
                <th className="text-right">Qtd.</th><th className="text-right">Valor unit.</th><th className="text-right">Valor total</th>
                <th className="text-right">Solicitado em OS</th><th className="text-right">Saldo</th>{podeEditar && <th />}
              </tr></thead>
              <tbody>{lista.map((i) => (
                <tr key={i.id} className={cx('align-top', !i.ativo && 'text-slate-400 line-through')}>
                  <td className="numero py-2 font-bold">{i.item}</td>
                  <td className="max-w-xs py-2">{i.descricao}<span className="block text-xs text-slate-500">{i.unidade_medida}</span></td>
                  <td className="py-2 font-semibold text-marca-900">{i.tipo ?? '—'}</td>
                  <td className="py-2">{i.especificacao ?? '—'}</td>
                  <td className="numero py-2 text-right">{num(i.quantidade)}</td>
                  <td className="numero whitespace-nowrap py-2 text-right">{brl(i.valor_unitario)}</td>
                  <td className="numero whitespace-nowrap py-2 text-right font-bold">{brl(i.valor_total)}</td>
                  <td className="numero py-2 text-right">{num(i.solicitado)}</td>
                  <td className="numero py-2 text-right">{i.ativo && <Selo tom={Number(i.saldo) <= 0 ? 'perigo' : Number(i.saldo) < Number(i.quantidade) * 0.15 ? 'alerta' : 'sucesso'}>{num(i.saldo)}</Selo>}</td>
                  {podeEditar && <td className="whitespace-nowrap py-2 text-right">{i.ativo && <>
                    <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Editar item ${i.item}`} onClick={() => setEditando(i)}><Pencil className="size-4" /></button>
                    <button type="button" className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Excluir item ${i.item}`} onClick={() => setExcluindo(i)}><Trash2 className="size-4" /></button>
                  </>}</td>}
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={6}>Valor total do Termo de Referência</td><td className="numero whitespace-nowrap text-right">{formatarCentavos(total)}</td><td colSpan={podeEditar ? 3 : 2} /></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <UnidadesTr c={c} podeEditar={podeEditar} />

      {editando !== null && <FormItem contratoId={c.id} item={editando === 'novo' ? null : editando} proximo={proximo} aoFechar={() => setEditando(null)} />}
      <ConfirmarComMotivo aberto={!!excluindo} aoFechar={() => setExcluindo(null)} titulo={`Excluir o item ${excluindo?.item ?? ''} do TR?`}
        descricao="O item sai do Termo de Referência e não pode mais ser usado em novas ordens de serviço. As OS já emitidas continuam com ele no histórico."
        rotuloConfirmar="Excluir item"
        aoConfirmar={async (m) => { await inativarItemTr(excluindo!.id, m); await qc.invalidateQueries({ queryKey: ['tr-itens', c.id] }); toast.success('Item excluído do TR.'); }} />
    </div>
  );
}
