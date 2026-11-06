import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Pencil, Plus, Power, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { CampoBusca } from '@/components/ui/Abas';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { BarraUso, CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, centavos, decimalDeCentavos, formatarData } from '@/lib/formatacao';
import type { EmpenhoResumo } from '@/lib/tipos';
import { listarUnidadesAtendidas } from '@/services/cadastros';
import {
  cancelarReforco, criarReforco, definirStatusEmpenho, emitirExtrato, listarDotacoesContrato, listarEmpenhos, listarNotas, listarReforcos,
  obterContrato, obterEmpenho, salvarEmpenho, unidadesDoEmpenho, vincularDotacao,
} from '@/services/execucao';
import { AvisoVencido, SeletorContrato, SeletorDotacao, SeloAtesto, SeloPagamento } from './comum';
import { ClassificacoesDaDotacao } from './DotacoesContrato';

const POR_PAGINA = 25;
const TIPOS = { ORDINARIO: 'Ordinário', ESTIMATIVO: 'Estimativo', GLOBAL: 'Global' } as const;
const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });

function FormEmpenho({ aberto, aoFechar, empenho, contratoInicial }: { aberto: boolean; aoFechar: () => void; empenho: EmpenhoResumo | null; contratoInicial?: string | null }) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [contrato, setContrato] = useState<{ id: string; rotulo: string } | null>(null);
  const [f, setF] = useState({ numero: '', ano: String(new Date().getFullYear()), tipo: 'ORDINARIO', data_empenho: hoje(), vigencia_fim: '', classificacao_id: '', processo: '', sd: '', licitacao: '', observacoes: '' });
  const [valor, setValor] = useState<number | null>(null);
  const [unidades, setUnidades] = useState<Array<{ id: string; nome: string }>>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  // dotação do órgão que ainda não está no contrato: é vinculada ao contrato ao salvar
  const [outra, setOutra] = useState<{ id: string; rotulo: string } | null>(null);
  const ct = useQuery({ queryKey: ['contrato', contrato?.id], queryFn: () => obterContrato(contrato!.id), enabled: !!contrato });
  const dots = useQuery({ queryKey: ['contrato-dotacoes', contrato?.id], queryFn: () => listarDotacoesContrato(contrato!.id), enabled: !!contrato });
  const unidAtuais = useQuery({ queryKey: ['empenho-unidades', empenho?.id], queryFn: () => unidadesDoEmpenho(empenho!.id), enabled: aberto && !!empenho });
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    const e = empenho;
    setContrato(e ? { id: e.contrato_id, rotulo: `${e.contrato_numero} – ${e.fornecedor_nome}` } : contratoInicial ? { id: contratoInicial, rotulo: 'Contrato selecionado' } : null);
    setF({ numero: e?.numero ?? '', ano: String(e?.ano ?? new Date().getFullYear()), tipo: e?.tipo ?? 'ORDINARIO', data_empenho: e?.data_empenho ?? hoje(),
      vigencia_fim: e?.vigencia_fim ?? '', classificacao_id: e?.classificacao_id ?? '', processo: e?.processo ?? '', sd: e?.sd ?? '', licitacao: e?.licitacao ?? '', observacoes: e?.observacoes ?? '' });
    setValor(e ? centavos(e.valor) : null);
    setUnidades([]);
    setOutra(null);
  }, [aberto, empenho, contratoInicial]);
  useEffect(() => { if (unidAtuais.data) setUnidades(unidAtuais.data.map((u) => ({ id: u.id, nome: u.nome }))); }, [unidAtuais.data]);
  useEffect(() => { if (ct.data && contrato?.rotulo === 'Contrato selecionado') setContrato({ id: ct.data.id, rotulo: `${ct.data.numero} – ${ct.data.fornecedor_nome}` }); }, [ct.data, contrato]);
  // dotações do contrato que servem para o exercício do empenho (as sem exercício valem para qualquer ano)
  const doAno = (dots.data ?? []).filter((d) => !d.exercicio || String(d.exercicio) === f.ano);
  useEffect(() => { if (doAno.length === 1 && !f.classificacao_id && !outra) setF((x) => ({ ...x, classificacao_id: doAno[0]!.id })); }, [doAno, f.classificacao_id, outra]);
  const escolhida = dots.data?.find((d) => d.id === f.classificacao_id) ?? null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = useMutation({
    mutationFn: async () => {
      if (outra) await vincularDotacao(contrato!.id, outra.id);
      return salvarEmpenho(empenho?.id ?? null, {
      tenant_id: orgao!.id, contrato_id: contrato!.id, numero: f.numero.trim(), ano: Number(f.ano), tipo: f.tipo as EmpenhoResumo['tipo'],
      data_empenho: f.data_empenho, vigencia_fim: f.vigencia_fim || null, valor: decimalDeCentavos(valor!), classificacao_id: outra?.id ?? f.classificacao_id,
      processo: f.processo.trim() || null, sd: f.sd.trim() || null, licitacao: f.licitacao.trim() || null, observacoes: f.observacoes.trim() || null,
    }, unidades.map((u) => u.id));
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['empenhos'] }); await qc.invalidateQueries({ queryKey: ['contrato'] }); await qc.invalidateQueries({ queryKey: ['contrato-dotacoes'] }); toast.success(empenho ? 'Empenho atualizado.' : 'Empenho cadastrado.'); aoFechar(); },
    onError: (e) => {
      const msg = (e as Error).message ?? '';
      if (/empenhos_numero_unico/.test(msg)) setErros({ numero: `Já existe o empenho ${f.numero}/${f.ano} neste órgão.` });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!contrato) n.contrato_id = 'Escolha o contrato.';
    if (!f.numero.trim()) n.numero = 'Informe o número do empenho.';
    if (!/^\d{4}$/.test(f.ano)) n.ano = 'Ano inválido.';
    if (!f.classificacao_id && !outra) n.classificacao_id = 'Escolha a dotação usada pelo empenho.';
    else if (escolhida?.exercicio && String(escolhida.exercicio) !== f.ano) n.classificacao_id = `Esta dotação é do exercício ${escolhida.exercicio}; o empenho é de ${f.ano}. Escolha uma dotação do exercício ${f.ano}.`;
    if (!valor || valor <= 0) n.valor = 'Informe o valor.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={empenho ? `Editar empenho ${empenho.numero}/${empenho.ano}` : 'Novo empenho'} largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-empenho" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-empenho" onSubmit={enviar} className="grid gap-4 sm:grid-cols-6" noValidate>
        <div className="sm:col-span-6"><SeletorContrato obrigatorio valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} erro={erros.contrato_id} desabilitado={!!empenho}
          aoMudar={(v, o) => { setContrato(v && o ? { id: v, rotulo: o.rotulo } : null); setF((x) => ({ ...x, classificacao_id: '' })); }} /></div>
        {ct.data && <div className="sm:col-span-6 flex flex-col gap-2">
          <AvisoVencido c={ct.data} />
          <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">{ct.data.objeto.slice(0, 220)} · Vigência até {formatarData(ct.data.data_fim_atual)} · Saldo do contrato {brl(ct.data.saldo)} · Empenhado {brl(ct.data.empenhado)}</p>
        </div>}
        <Campo className="sm:col-span-2" rotulo="Número" obrigatorio value={f.numero} onChange={set('numero')} erro={erros.numero} maxLength={40} />
        <Campo className="sm:col-span-1" rotulo="Ano" obrigatorio inputMode="numeric" value={f.ano} onChange={set('ano')} erro={erros.ano} maxLength={4} />
        <Selecao className="sm:col-span-3" rotulo="Tipo" value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
        {!outra ? <Selecao className="sm:col-span-6" rotulo="Dotação (classificação usada)" obrigatorio value={f.classificacao_id} onChange={set('classificacao_id')} erro={erros.classificacao_id}
          disabled={!contrato} ajuda={contrato && dots.data && !dots.data.length ? 'O contrato ainda não tem dotação vinculada: vincule na aba Dotação do contrato.'
            : `Dotações do contrato para o exercício ${f.ano}. As de outros exercícios aparecem desabilitadas.`}>
          <option value="">{contrato ? 'Escolha…' : 'Escolha antes o contrato'}</option>
          {dots.data?.map((d) => {
            const outroAno = !!d.exercicio && String(d.exercicio) !== f.ano;
            return <option key={d.id} value={d.id} disabled={outroAno && d.id !== f.classificacao_id}>
              {d.exercicio ? `[${d.exercicio}] ` : ''}{d.codigo_completo} · {d.acao_descricao} · Fonte {d.fonte_codigo}{outroAno ? ' (outro exercício)' : ''}</option>;
          })}
        </Selecao> : (
          <div className="sm:col-span-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p>Dotação escolhida fora do contrato: <span className="numero font-mono">{outra.rotulo}</span>. Ela será <b>vinculada ao contrato</b> ao salvar o empenho.</p>
            <Botao pequeno variante="secundario" className="mt-2" onClick={() => setOutra(null)}>Voltar às dotações do contrato</Botao>
          </div>
        )}
        {!outra && escolhida && <div className="sm:col-span-6"><ClassificacoesDaDotacao d={escolhida} /></div>}
        {contrato && !outra && !empenho && pode('contratos', 'editar') && (
          <div className="sm:col-span-6">
            <SeletorDotacao rotulo="Ou use outra dotação do órgão (exercício do empenho)" valor={null} exercicio={/^\d{4}$/.test(f.ano) ? Number(f.ano) : null}
              excluir={dots.data?.map((d) => d.id)} ajuda="Só quando a dotação certa ainda não está no contrato. Ela passa a fazer parte das dotações do contrato."
              aoMudar={(v, o) => { if (v && o) { setOutra({ id: v, rotulo: o.rotulo }); setF((x) => ({ ...x, classificacao_id: '' })); } }} />
          </div>
        )}
        <CampoMoeda className="sm:col-span-2" rotulo="Valor do empenho" obrigatorio centavos={valor} aoMudar={setValor} erro={erros.valor} />
        <Campo className="sm:col-span-2" rotulo="Data do empenho" type="date" obrigatorio value={f.data_empenho} onChange={set('data_empenho')} />
        <Campo className="sm:col-span-2" rotulo="Vigência" type="date" value={f.vigencia_fim} onChange={set('vigencia_fim')} />
        <Campo className="sm:col-span-2" rotulo="Processo de empenho" value={f.processo} onChange={set('processo')} maxLength={60} />
        <Campo className="sm:col-span-2" rotulo="SD / ano" value={f.sd} onChange={set('sd')} maxLength={40} />
        <Campo className="sm:col-span-2" rotulo="Licitação / pregão" value={f.licitacao} onChange={set('licitacao')} maxLength={60} />
        <div className="sm:col-span-6">
          <BuscaSelect rotulo="Unidades atendidas" valor={null} chave={['ua-opcoes', orgao?.id, unidades.length]} ajuda="Escolha uma ou várias."
            aoMudar={(v, o) => { if (v && o && !unidades.some((u) => u.id === v)) setUnidades((x) => [...x, { id: v, nome: o.rotulo }]); }}
            buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao!.id, busca: t, situacao: 'ATIVOS', limite: 20, offset: 0 })).itens
              .filter((u) => !unidades.some((x) => x.id === u.id)).map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.eh_grupo ? 'Grupo de rateio' : u.tipo }))} />
          {unidades.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{unidades.map((u) => (
            <li key={u.id} className="inline-flex items-center gap-1 rounded-lg bg-marca-50 px-2.5 py-1 text-sm text-marca-900 ring-1 ring-marca-200">
              {u.nome}<button type="button" className="rounded p-0.5 hover:bg-marca-100" aria-label={`Tirar ${u.nome}`} onClick={() => setUnidades((x) => x.filter((y) => y.id !== u.id))}><X className="size-3.5" /></button>
            </li>))}</ul>}
        </div>
        <AreaTexto className="sm:col-span-6" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} />
        {erros.geral && <div className="sm:col-span-6"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

function DetalheEmpenho({ id, aoFechar, aoEditar }: { id: string | null; aoFechar: () => void; aoEditar: (e: EmpenhoResumo) => void }) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const q = useQuery({ queryKey: ['empenho', id], queryFn: () => obterEmpenho(id!), enabled: !!id });
  const reforcos = useQuery({ queryKey: ['reforcos', id], queryFn: () => listarReforcos(id!), enabled: !!id });
  const unidades = useQuery({ queryKey: ['empenho-unidades', id], queryFn: () => unidadesDoEmpenho(id!), enabled: !!id });
  const notas = useQuery({ queryKey: ['notas', orgao?.id, 'empenho', id], queryFn: () => listarNotas({ tenantId: orgao!.id, empenhoId: id, limite: 100, offset: 0 }), enabled: !!id });
  const [reforco, setReforco] = useState<{ data: string; valor: number | null; numero: string; motivo: string } | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const invalidar = async () => { await qc.invalidateQueries({ queryKey: ['empenho', id] }); await qc.invalidateQueries({ queryKey: ['reforcos', id] }); await qc.invalidateQueries({ queryKey: ['empenhos'] }); await qc.invalidateQueries({ queryKey: ['contrato'] }); await qc.invalidateQueries({ queryKey: ['contratos'] }); };
  const salvarReforco = useMutation({
    mutationFn: () => criarReforco(id!, reforco!.data, decimalDeCentavos(reforco!.valor!), reforco!.numero.trim() || null, reforco!.motivo.trim() || null),
    onSuccess: async () => { await invalidar(); setReforco(null); toast.success('Reforço registrado; saldo atualizado.'); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const extrato = useMutation({ mutationFn: () => emitirExtrato('empenho', id!), onSuccess: (doc) => navegar(`/imprimir/${doc}`), onError: (e) => toast.error(mensagemDeErro(e)) });
  if (!id) return null;
  const e = q.data;
  return (
    <Modal aberto aoFechar={aoFechar} titulo={e ? `Empenho ${e.numero}/${e.ano}` : 'Empenho'} descricao={e ? `${e.fornecedor_nome} · Contrato ${e.contrato_numero}` : undefined} largura="lg"
      rodape={<>
        <Botao variante="secundario" icone={<FileDown className="size-4" />} carregando={extrato.isPending} onClick={() => extrato.mutate()}>Extrato</Botao>
        {e && pode('empenhos', 'editar') && <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={() => aoEditar(e)}>Editar</Botao>}
      </>}>
      {!e ? <Carregando /> : <div className="flex flex-col gap-5">
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
          {[['Valor', e.valor], ['Reforços', e.reforcos], ['Utilizado (notas)', e.utilizado], ['Saldo', e.saldo]].map(([r, v]) => (
            <div key={r as string}><p className="text-xs text-slate-500">{r}</p><p className={cx('numero text-base font-semibold', r === 'Saldo' && centavos(v as string) < 0 && 'text-red-700')}>{brl(v as string)}</p></div>
          ))}
          <div className="sm:col-span-4"><BarraUso usado={centavos(e.utilizado)} total={centavos(e.valor_total)} rotulo="Utilização do empenho" /></div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Tipo</dt><dd>{TIPOS[e.tipo]}</dd></div>
          <div><dt className="text-xs text-slate-500">Data</dt><dd>{formatarData(e.data_empenho)}</dd></div>
          <div><dt className="text-xs text-slate-500">Vigência</dt><dd>{formatarData(e.vigencia_fim)}</dd></div>
          <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Dotação</dt><dd className="font-mono">{e.classificacao_codigo}</dd></div>
          <div><dt className="text-xs text-slate-500">Processo</dt><dd>{e.processo ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">SD</dt><dd>{e.sd ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Licitação</dt><dd>{e.licitacao ?? '—'}</dd></div>
          <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Unidades atendidas</dt><dd>{unidades.data?.map((u) => u.nome).join(', ') || '—'}</dd></div>
        </dl>
        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Reforços</h3>
            {pode('empenhos', 'editar') && e.ativo && <Botao pequeno variante="secundario" icone={<Plus className="size-4" />} onClick={() => { setErro(null); setReforco({ data: hoje(), valor: null, numero: '', motivo: '' }); }}>Reforçar</Botao>}</div>
          {!reforcos.data?.length ? <p className="text-sm text-slate-500">Nenhum reforço.</p> : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {reforcos.data.map((r) => (
              <li key={r.id} className={cx('flex items-center gap-3 px-3 py-2 text-sm', r.cancelado_em && 'opacity-50')}>
                <span className="flex-1">{formatarData(r.data)}{r.numero ? ` · nº ${r.numero}` : ''}{r.motivo ? ` · ${r.motivo}` : ''}{r.cancelado_em && <> · <Selo>Cancelado: {r.motivo_cancelamento}</Selo></>}</span>
                <span className="numero font-medium">{brl(r.valor)}</span>
                {!r.cancelado_em && pode('empenhos', 'editar') && <Botao pequeno variante="fantasma" icone={<X className="size-4 text-red-600" />} aria-label="Cancelar reforço" onClick={() => setCancelando(r.id)} />}
              </li>))}
          </ul>}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Notas fiscais deste empenho</h3>
          {!notas.data?.itens.length ? <p className="text-sm text-slate-500">Nenhuma nota lançada.</p> : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {notas.data.itens.map((n) => (
              <li key={n.id} className={cx('flex flex-wrap items-center gap-2 px-3 py-2 text-sm', n.cancelada_em && 'opacity-50')}>
                <Link to={`/notas?ver=${n.id}`} className="font-medium text-marca-700 hover:underline">NF {n.numero}</Link>
                <span className="text-slate-500">{formatarData(n.data_emissao)} · {n.meses_referencia}</span>
                <span className="numero ml-auto">{brl(n.valor)}</span>{!n.cancelada_em && <SeloAtesto status={n.status_atesto} />}<SeloPagamento status={n.status_pagamento} />
              </li>))}
          </ul>}
        </div>
      </div>}
      <Modal aberto={!!reforco} aoFechar={() => setReforco(null)} titulo="Reforço de empenho" largura="sm"
        rodape={<><Botao variante="secundario" onClick={() => setReforco(null)}>Cancelar</Botao><Botao carregando={salvarReforco.isPending} disabled={!reforco?.valor} onClick={() => salvarReforco.mutate()}>Registrar</Botao></>}>
        {reforco && <div className="flex flex-col gap-4">
          <CampoMoeda rotulo="Valor do reforço" obrigatorio centavos={reforco.valor} aoMudar={(v) => setReforco({ ...reforco, valor: v })} />
          <Campo rotulo="Data" type="date" value={reforco.data} onChange={(ev) => setReforco({ ...reforco, data: ev.target.value })} />
          <Campo rotulo="Número" value={reforco.numero} onChange={(ev) => setReforco({ ...reforco, numero: ev.target.value })} maxLength={40} />
          <AreaTexto rotulo="Motivo" value={reforco.motivo} onChange={(ev) => setReforco({ ...reforco, motivo: ev.target.value })} maxLength={500} />
          {erro && <CaixaErro mensagem={erro} />}
        </div>}
      </Modal>
      <ConfirmarComMotivo aberto={!!cancelando} aoFechar={() => setCancelando(null)} titulo="Cancelar reforço?" descricao="O reforço sai do saldo, mas continua no histórico." rotuloConfirmar="Cancelar reforço"
        aoConfirmar={async (m) => { await cancelarReforco(cancelando!, m); await invalidar(); toast.success('Reforço cancelado.'); }} />
    </Modal>
  );
}

export function Empenhos() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [contrato, setContrato] = useState<{ id: string; rotulo: string } | null>(params.get('contrato') ? { id: params.get('contrato')!, rotulo: 'Contrato selecionado' } : null);
  const [ano, setAno] = useState('');
  const [situacao, setSituacao] = useState<'ATIVOS' | 'INATIVOS' | 'TODOS'>('ATIVOS');
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<EmpenhoResumo | null | 'novo'>(null);
  const [alternando, setAlternando] = useState<EmpenhoResumo | null>(null);
  const vendo = params.get('ver');
  useEffect(() => setPagina(0), [termo, contrato, ano, situacao]);
  const q = useQuery({
    queryKey: ['empenhos', orgao?.id, termo, contrato?.id, ano, situacao, pagina],
    queryFn: () => listarEmpenhos({ tenantId: orgao!.id, busca: termo, contratoId: contrato?.id, ano: /^\d{4}$/.test(ano) ? Number(ano) : null, situacao, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao, placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  const ver = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('ver', id); else n.delete('ver'); return n; });

  return (
    <>
      <CabecalhoPagina titulo="Empenhos" descricao="Cada empenho aponta para a dotação efetivamente usada. Saldo = valor + reforços − notas fiscais não canceladas."
        acoes={pode('empenhos', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo empenho</Botao>} />
      <Cartao>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_20rem_7rem_9rem] sm:items-end">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número, contrato, fornecedor ou dotação" rotulo="Buscar empenho" />
          <SeletorContrato valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} aoMudar={(v, o) => setContrato(v && o ? { id: v, rotulo: o.rotulo } : null)} />
          <Campo rotulo="Ano" inputMode="numeric" value={ano} onChange={(e) => setAno(e.target.value)} maxLength={4} />
          <Selecao rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
            <option value="ATIVOS">Ativos</option><option value="INATIVOS">Inativos</option><option value="TODOS">Todos</option>
          </Selecao>
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          !q.data!.itens.length ? <Vazio titulo="Nenhum empenho encontrado" /> : (
            <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
              {q.data!.itens.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-3">
                  <button className="grid min-w-0 flex-1 gap-2 text-left sm:grid-cols-[1fr_15rem] sm:items-center" onClick={() => ver(e.id)}>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">Empenho {e.numero}/{e.ano}<span className="font-normal text-slate-500">· {TIPOS[e.tipo]}</span>{!e.ativo && <Selo tom="perigo">Inativo</Selo>}</span>
                      <span className="block truncate text-sm text-slate-600">{e.fornecedor_nome} · Contrato {e.contrato_numero}</span>
                      <span className="block truncate font-mono text-xs text-slate-500">{e.classificacao_codigo}</span>
                    </span>
                    <span>
                      <span className="numero mb-1 block text-right text-sm"><span className="text-slate-500">Saldo </span><span className={cx('font-semibold', centavos(e.saldo) < 0 && 'text-red-700')}>{brl(e.saldo)}</span><span className="text-slate-500"> de {brl(e.valor_total)}</span></span>
                      <BarraUso usado={centavos(e.utilizado)} total={centavos(e.valor_total)} />
                    </span>
                  </button>
                  {pode('empenhos', 'excluir') && <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={e.ativo ? `Inativar empenho ${e.numero}` : `Reativar empenho ${e.numero}`} onClick={() => setAlternando(e)} />}
                </li>
              ))}
            </ul>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
      <FormEmpenho aberto={editando !== null} aoFechar={() => setEditando(null)} empenho={editando === 'novo' ? null : editando} contratoInicial={contrato?.id} />
      <DetalheEmpenho id={vendo} aoFechar={() => ver(null)} aoEditar={(e) => { ver(null); setEditando(e); }} />
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Inativar o empenho ${alternando.numero}/${alternando.ano}?` : 'Reativar empenho?'}
        descricao={alternando?.ativo ? 'O empenho deixa de receber notas. Notas, reforços e histórico continuam guardados.' : 'O empenho volta a receber notas.'}
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusEmpenho(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['empenhos'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}
