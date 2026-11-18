// Modelos de ordem de serviço. Cada tipo de serviço tem o seu formulário e o seu documento.
// Para incluir um novo modelo: acrescente em MODELOS_OS, crie o formulário e o bloco do documento (DocumentoOs).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Copy, FireExtinguisher, Plus, Trash2, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { ListaSelecao } from '@/components/ui/ListaSelecao';
import { AreaTexto, Botao, CaixaErro, Campo, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { centavos, formatarCentavos } from '@/lib/formatacao';
import { listarUnidadesAtendidas } from '@/services/cadastros';
import { listarItensTr, listarUnidadesTr, obterContrato } from '@/services/execucao';
import { emitirOs, listarItensOs, numeroOs, salvarItensOs, salvarOs, type OrdemServico } from '@/services/relatorios';
import { SeletorContrato, SeletorEmpenho } from '../contratos/comum';

export type ModeloOs = OrdemServico['modelo'];
export const MODELOS_OS: Array<{ id: ModeloOs; titulo: string; descricao: string; icone: ReactNode }> = [
  { id: 'EXTINTORES', titulo: 'Recarga e manutenção de extintores', icone: <FireExtinguisher className="size-6" />,
    descricao: 'Unidade, quantidade, tipo de extintor e capacidade extintora, pelos itens do Termo de Referência do contrato.' },
  { id: 'GERAL', titulo: 'Outros serviços (OS geral)', icone: <Wrench className="size-6" />,
    descricao: 'Ordem de serviço com título, descrição, unidades atendidas, prioridade e responsável.' },
];

/** Primeiro passo da nova OS: qual o tipo de serviço (direciona para o modelo certo) */
export function EscolherModeloOs({ aberto, aoFechar, aoEscolher }: { aberto: boolean; aoFechar: () => void; aoEscolher: (m: ModeloOs) => void }) {
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Nova ordem de serviço" descricao="Qual é o tipo de serviço? O formulário e o documento seguem o modelo escolhido.">
      <ul className="grid gap-3">
        {MODELOS_OS.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => aoEscolher(m.id)}
              className="flex w-full items-start gap-3 rounded-xl border-2 border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-marca-600 hover:shadow-md">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-marca-900 text-white">{m.icone}</span>
              <span><span className="block text-sm font-bold text-marca-900">{m.titulo}</span><span className="block text-xs text-slate-600">{m.descricao}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Novos modelos (outros tipos de serviço) aparecem aqui quando forem cadastrados.</p>
    </Modal>
  );
}

interface Linha { chave: string; unidade_atendida_id: string; tr_item_id: string; quantidade: string; data_solicitacao: string }
const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });
const novaLinha = (base?: Partial<Linha>): Linha => ({ chave: crypto.randomUUID(), unidade_atendida_id: '', tr_item_id: '', quantidade: '1', data_solicitacao: hoje(), ...base });

/** Formulário do modelo EXTINTORES: contrato, empenho e linhas (unidade, quantidade, tipo e capacidade pelo TR, data de solicitação) */
export function FormOsExtintores({ aberto, aoFechar, os }: { aberto: boolean; aoFechar: () => void; os: OrdemServico | null }) {
  const { orgao } = useSessao();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [contrato, setContrato] = useState<{ id: string; rotulo: string } | null>(null);
  const [empenho, setEmpenho] = useState<{ id: string; rotulo: string } | null>(null);
  const [f, setF] = useState({ titulo: 'Recarga e manutenção de extintores', data_abertura: hoje(), observacoes: '' });
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const atuais = useQuery({ queryKey: ['os-itens', os?.id], queryFn: () => listarItensOs(os!.id), enabled: aberto && !!os });
  const ct = useQuery({ queryKey: ['contrato', contrato?.id], queryFn: () => obterContrato(contrato!.id), enabled: !!contrato });
  const tr = useQuery({ queryKey: ['tr-itens', contrato?.id], queryFn: () => listarItensTr(contrato!.id), enabled: !!contrato });
  const trUnid = useQuery({ queryKey: ['tr-unidades', contrato?.id], queryFn: () => listarUnidadesTr(contrato!.id), enabled: !!contrato });
  const todas = useQuery({ queryKey: ['unidades-atendidas-todas', orgao?.id], enabled: !!orgao && !!contrato && trUnid.data?.length === 0, staleTime: 5 * 60_000,
    queryFn: async () => (await listarUnidadesAtendidas({ tenantId: orgao!.id, situacao: 'ATIVOS', limite: 1000, offset: 0 })).itens.filter((u) => !u.eh_grupo) });
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setContrato(os?.contrato_id ? { id: os.contrato_id, rotulo: os.contrato?.numero ?? 'Contrato' } : null);
    setEmpenho(os?.empenho_id ? { id: os.empenho_id, rotulo: os.empenho ? `${os.empenho.numero}/${os.empenho.ano}` : 'Empenho' } : null);
    setF({ titulo: os?.titulo ?? 'Recarga e manutenção de extintores', data_abertura: os?.data_abertura ?? hoje(), observacoes: os?.observacoes ?? '' });
    setLinhas([novaLinha()]);
  }, [aberto, os]);
  useEffect(() => {
    if (atuais.data?.length) setLinhas(atuais.data.map((i) => novaLinha({ unidade_atendida_id: i.unidade_atendida_id, tr_item_id: i.tr_item_id ?? '',
      quantidade: String(Number(i.quantidade)), data_solicitacao: i.data_solicitacao })));
  }, [atuais.data]);
  const itensTr = (tr.data ?? []).filter((i) => i.ativo);
  const porId = useMemo(() => new Map(itensTr.map((i) => [i.id, i])), [itensTr]);
  const unidades = trUnid.data?.length ? trUnid.data.map((u) => ({ id: u.unidade_atendida_id, nome: u.unidade.nome })) : (todas.data ?? []).map((u) => ({ id: u.id, nome: u.nome }));
  const total = linhas.reduce((s, l) => s + Math.round(Number(l.quantidade.replace(',', '.')) * centavos(porId.get(l.tr_item_id)?.valor_unitario ?? 0) || 0), 0);
  const setL = (chave: string, k: keyof Linha, v: string) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [k]: v } : l)));

  const salvar = useMutation({
    mutationFn: async () => {
      const o = await salvarOs(os?.id ?? null, {
        tenant_id: orgao!.id, unidade_id: os?.unidade_id ?? ct.data!.unidade_id, titulo: f.titulo.trim(), data_abertura: f.data_abertura,
        observacoes: f.observacoes.trim() || null, contrato_id: contrato!.id, empenho_id: empenho?.id ?? null, modelo: 'EXTINTORES',
      }, null);
      await salvarItensOs(o.id, linhas.map((l) => {
        const t = porId.get(l.tr_item_id);
        return { unidade_atendida_id: l.unidade_atendida_id, tr_item_id: l.tr_item_id || null, quantidade: l.quantidade.replace(',', '.'),
          tipo: t?.tipo ?? t?.descricao ?? null, especificacao: t?.especificacao ?? null, data_solicitacao: l.data_solicitacao };
      }));
      return o;
    },
    onSuccess: async (o) => {
      await qc.invalidateQueries({ queryKey: ['os'] }); await qc.invalidateQueries({ queryKey: ['os-itens', o.id] }); await qc.invalidateQueries({ queryKey: ['tr-itens'] });
      // próximo passo: o documento da OS no papel timbrado
      toast.success(os ? `OS ${numeroOs(o)} atualizada.` : `OS ${numeroOs(o)} aberta.`, { duration: 12000,
        action: { label: 'Gerar PDF', onClick: () => { emitirOs(o.id).then((id) => navegar(`/imprimir/${id}`)).catch((er) => toast.error(traduzirErro(er).mensagem)); } } });
      aoFechar();
    },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo === 'itens' ? 'itens' : t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!contrato) n.contrato_id = 'Escolha o contrato.';
    if (f.titulo.trim().length < 3) n.titulo = 'Informe o título.';
    if (!linhas.length) n.itens = 'Inclua ao menos uma linha.';
    linhas.forEach((l, i) => {
      if (!n.itens && !l.unidade_atendida_id) n.itens = `Linha ${i + 1}: escolha a unidade.`;
      else if (!n.itens && !l.tr_item_id) n.itens = `Linha ${i + 1}: escolha o tipo de extintor.`;
      else if (!n.itens && !(Number(l.quantidade.replace(',', '.')) > 0)) n.itens = `Linha ${i + 1}: informe a quantidade.`;
    });
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} largura="lg" titulo={os ? `Editar OS ${numeroOs(os)} · extintores` : 'Nova OS · recarga e manutenção de extintores'}
      descricao="O número (NNNN/ANO) é gerado ao salvar. Tipo e capacidade vêm do Termo de Referência do contrato."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-os-ext" carregando={salvar.isPending}>Salvar OS</Botao></>}>
      <form id="form-os-ext" onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SeletorContrato obrigatorio valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} erro={erros.contrato_id} desabilitado={!!os}
            aoMudar={(v, o) => { setContrato(v && o ? { id: v, rotulo: o.rotulo } : null); setEmpenho(null); setLinhas([novaLinha()]); }} />
          <SeletorEmpenho contratoId={contrato?.id ?? null} valor={empenho?.id ?? null} rotuloValor={empenho?.rotulo}
            aoMudar={(v, o) => setEmpenho(v && o ? { id: v, rotulo: o.rotulo } : null)} />
          <Campo rotulo="Título" obrigatorio value={f.titulo} onChange={(e) => setF((x) => ({ ...x, titulo: e.target.value }))} erro={erros.titulo} maxLength={200} />
          <Campo rotulo="Data de abertura" type="date" value={f.data_abertura} disabled={!!os} onChange={(e) => setF((x) => ({ ...x, data_abertura: e.target.value }))} />
        </div>

        {contrato && !tr.isLoading && !itensTr.length && (
          <CaixaErro mensagem="Este contrato ainda não tem itens no Termo de Referência. Cadastre os serviços na aba “Termo de referência” do contrato." />
        )}

        <fieldset className="overflow-hidden rounded-xl border border-slate-300">
          <legend className="sr-only">Linhas da ordem de serviço</legend>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-marca-900 px-3 py-2 text-white">
            <span className="text-xs font-bold uppercase tracking-wide">Unidades e extintores</span>
            <Botao pequeno variante="chamada" icone={<Plus className="size-4" />} disabled={!contrato} onClick={() => setLinhas((ls) => [...ls, novaLinha()])}>Linha</Botao>
          </div>
          {!contrato ? <p className="p-4 text-sm text-slate-500">Escolha o contrato para listar as unidades e os tipos de extintor do TR.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr><th className="text-left">Unidade</th><th className="w-24 text-left">Qtd.</th><th className="text-left">Tipo de extintor</th>
                  <th className="text-left">Capacidade extintora</th><th className="w-40 text-left">Data de solicitação</th><th className="w-16" /></tr></thead>
                <tbody>{linhas.map((l) => {
                  const t = porId.get(l.tr_item_id);
                  return (
                    <tr key={l.chave} className="align-top">
                      <td className="py-1.5"><ListaSelecao value={l.unidade_atendida_id} aria-label="Unidade" onChange={(e) => setL(l.chave, 'unidade_atendida_id', e.target.value)}>
                        <option value="">Escolha…</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</ListaSelecao></td>
                      <td className="py-1.5"><input className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" inputMode="decimal" aria-label="Quantidade"
                        value={l.quantidade} onChange={(e) => setL(l.chave, 'quantidade', e.target.value)} /></td>
                      <td className="py-1.5"><ListaSelecao value={l.tr_item_id} aria-label="Tipo de extintor" onChange={(e) => setL(l.chave, 'tr_item_id', e.target.value)}>
                        <option value="">Escolha…</option>
                        {itensTr.map((i) => <option key={i.id} value={i.id}>{`${i.tipo ?? i.descricao} · saldo ${Number(i.saldo).toLocaleString('pt-BR')}`}</option>)}</ListaSelecao></td>
                      <td className="py-1.5"><span className="flex h-10 items-center rounded-lg bg-slate-100 px-2 text-sm text-slate-700">{t?.especificacao ?? '—'}</span></td>
                      <td className="py-1.5"><input type="date" className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" aria-label="Data de solicitação"
                        value={l.data_solicitacao} onChange={(e) => setL(l.chave, 'data_solicitacao', e.target.value)} /></td>
                      <td className="whitespace-nowrap py-1.5 text-right">
                        <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Copiar linha" aria-label="Copiar linha"
                          onClick={() => setLinhas((ls) => { const i = ls.findIndex((x) => x.chave === l.chave); const c = [...ls]; c.splice(i + 1, 0, novaLinha({ ...l, chave: undefined, unidade_atendida_id: '' })); return c; })}><Copy className="size-4" /></button>
                        <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Remover linha" aria-label="Remover linha"
                          disabled={linhas.length === 1} onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}><Trash2 className="size-4" /></button>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">{linhas.length} linha(s) · {trUnid.data?.length ? 'unidades do Termo de Referência' : 'todas as unidades atendidas'}</span>
            <span>Valor estimado (preço do TR): <strong className="numero text-marca-900">{formatarCentavos(total)}</strong></span>
          </div>
        </fieldset>
        {erros.itens && <CaixaErro mensagem={erros.itens} />}
        <AreaTexto rotulo="Observações" value={f.observacoes} onChange={(e) => setF((x) => ({ ...x, observacoes: e.target.value }))} maxLength={2000} rows={2} />
        {erros.geral && <CaixaErro mensagem={erros.geral} />}
      </form>
    </Modal>
  );
}

/** Linhas da OS no detalhe (modelo extintores) */
export function ItensOs({ osId }: { osId: string }) {
  const q = useQuery({ queryKey: ['os-itens', osId], queryFn: () => listarItensOs(osId) });
  if (!q.data?.length) return q.isLoading ? null : <Vazio titulo="OS sem linhas" descricao="Edite a OS para incluir as unidades e os extintores." />;
  const total = q.data.reduce((s, i) => s + Math.round(Number(i.quantidade) * centavos(i.valor_unitario ?? 0)), 0);
  return (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr><th className="text-left">Unidade</th><th className="text-right">Qtd.</th><th className="text-left">Tipo de extintor</th><th className="text-left">Capacidade</th><th className="text-left">Solicitação</th></tr></thead>
        <tbody>{q.data.map((i) => (
          <tr key={i.id}><td className="py-1.5 font-semibold">{i.unidade?.nome}</td><td className="numero py-1.5 text-right">{Number(i.quantidade).toLocaleString('pt-BR')}</td>
            <td className="py-1.5">{i.tipo}</td><td className="py-1.5">{i.especificacao ?? '—'}</td>
            <td className="py-1.5">{new Date(`${i.data_solicitacao}T12:00:00`).toLocaleDateString('pt-BR')}</td></tr>))}</tbody>
        <tfoot><tr><td colSpan={4} className="text-right">Valor estimado pelo TR</td><td className="numero">{formatarCentavos(total)}</td></tr></tfoot>
      </table>
    </div>
  );
}

export const IconeModelo = ({ modelo, className }: { modelo: ModeloOs; className?: string }) =>
  modelo === 'EXTINTORES' ? <FireExtinguisher className={cx('size-4', className)} aria-hidden /> : <ClipboardList className={cx('size-4', className)} aria-hidden />;
