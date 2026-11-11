// Movimentações de patrimônio: solicitar (transferência, troca, substituição, baixa...), confirmar ou
// rejeitar o recebimento, confirmar por termo físico assinado, cancelar e retificar. Nada muda no bem
// antes da confirmação completa; tudo fica no histórico.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Ban, CheckCircle2, FileSignature, Plus, RotateCcw, Search, XCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Interruptor, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarData, formatarDataHora } from '@/lib/formatacao';
import { listarDocumentos } from '@/services/documentos';
import {
  AMBIENTES, cancelarMovimentacao, confirmarAdministrativo, dadosTermo, DECLARACAO, DESTINO_SUBSTITUIDO, listarMovimentacoes, localizarBem, movimentar, obterMovimentacao,
  responderMovimentacao, retificarMovimentacao, SITUACAO, TIPOS_MOV, TIPOS_TRANSFERENCIA, type BemListado, type ItemMovimentacao, type Movimentacao,
} from '@/services/patrimonio';
import { Dado, rotuloUnidade, SeletorBem, SeletorLocal, SeletorResponsavel, SeletorSetor, SeloMov } from './comum';
import { pdfTermo } from './pdf';

const POR_PAGINA = 20;
type Ref = { id: string; rotulo: string } | null;
const TIPOS_SOLICITAVEIS = Object.keys(TIPOS_MOV).filter((t) => t !== 'RETIFICACAO');
const SEM_DESTINO = ['BAIXA', 'RESPONSABILIDADE'];

// ---------------------------------------------------------------- nova movimentação

export function NovaMovimentacao({ aberto, aoFechar, tipoInicial = 'TRANSFERENCIA_COORDENACAO', bemInicial = null, aoConcluir }: {
  aberto: boolean; aoFechar: () => void; tipoInicial?: string; bemInicial?: Ref; aoConcluir?: (id: string) => void;
}) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState(tipoInicial);
  const [bens, setBens] = useState<Array<{ id: string; rotulo: string; bem?: BemListado | null }>>([]);
  const [segundo, setSegundo] = useState<Ref>(null);
  const [numeroTroca, setNumeroTroca] = useState('');
  const [procurando, setProcurando] = useState(false);
  const [setor, setSetor] = useState<Ref>(null);
  const [local, setLocal] = useState<Ref>(null);
  const [resp, setResp] = useState<Ref>(null);
  const [semResp, setSemResp] = useState(false);
  const [manterResp, setManterResp] = useState(false);
  const [f, setF] = useState({ ambiente: '', sala: '', justificativa: '', observacoes: '', destino_substituido: 'ALMOXARIFADO', devolucao_prevista: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setTipo(tipoInicial); setBens(bemInicial ? [bemInicial] : []); setSegundo(null); setNumeroTroca(''); setSetor(null); setLocal(null); setResp(null);
    setSemResp(false); setManterResp(false); setErros({});
    setF({ ambiente: '', sala: '', justificativa: '', observacoes: '', destino_substituido: 'ALMOXARIFADO', devolucao_prevista: '' });
  }, [aberto, tipoInicial, bemInicial]);
  const troca = tipo === 'TROCA';
  const subst = tipo === 'SUBSTITUICAO';
  const multiplos = !troca && !subst;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const procurarTroca = async () => {
    if (!numeroTroca.trim()) return;
    setProcurando(true);
    try {
      const b = await localizarBem(orgao!.id, numeroTroca.trim());
      if (!b) { setErros({ segundo: 'Nenhum bem com este número neste órgão.' }); setSegundo(null); }
      else if (b.pendente || b.situacao === 'BAIXADO') { setErros({ segundo: `O bem ${b.numero} está ${b.situacao === 'BAIXADO' ? 'baixado' : 'em outra movimentação'}.` }); setSegundo(null); }
      else { setErros({}); setSegundo({ id: b.id, rotulo: `${b.numero} – ${b.descricao} · ${rotuloUnidade(b.unidade)}${b.responsavel ? ` · ${b.responsavel}` : ''}` }); }
    } catch (e) { setErros({ segundo: mensagemDeErro(e) }); } finally { setProcurando(false); }
  };

  const salvar = useMutation({
    mutationFn: () => {
      let itens: ItemMovimentacao[];
      if (troca) itens = [{ bem_id: bens[0]!.id, papel: 'ENTREGUE' }, { bem_id: segundo!.id, papel: 'RECEBIDO' }];
      else if (subst) itens = [
        { bem_id: bens[0]!.id, papel: 'SUBSTITUIDO', destino_responsavel_id: null, ...(setor ? { destino_unidade_id: setor.id } : {}),
          ...(local ? { destino_local_id: local.id } : {}), ...(f.ambiente ? { destino_ambiente: f.ambiente } : {}), ...(f.sala.trim() ? { destino_sala: f.sala.trim() } : {}) },
        { bem_id: segundo!.id, papel: 'SUBSTITUTO', ...(manterResp ? {} : { destino_responsavel_id: resp?.id ?? null }) },
      ];
      else itens = bens.map((b) => {
        const i: ItemMovimentacao = { bem_id: b.id };
        if (tipo === 'BAIXA') return i;
        if (tipo !== 'RESPONSABILIDADE') {
          if (setor) i.destino_unidade_id = setor.id;
          if (local) i.destino_local_id = local.id;
          if (f.ambiente) i.destino_ambiente = f.ambiente;
          if (f.sala.trim()) i.destino_sala = f.sala.trim();
        }
        if (semResp) i.destino_responsavel_id = null; else if (resp) i.destino_responsavel_id = resp.id;
        return i;
      });
      return movimentar(orgao!.id, { tipo, justificativa: f.justificativa.trim(), observacoes: f.observacoes.trim() || null,
        destino_substituido: subst ? f.destino_substituido : null, devolucao_prevista: f.devolucao_prevista || null, itens });
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ['patrimonio'] });
      const m = await obterMovimentacao(id).catch(() => null);
      toast.success(m?.situacao === 'CONCLUIDA' ? `Movimentação ${m.codigo} concluída.` : `Movimentação ${m?.codigo ?? ''} registrada: aguardando a confirmação de quem recebe.`);
      aoFechar(); aoConcluir?.(id);
    },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!bens.length) n.itens = troca ? 'Escolha o bem que você entrega.' : subst ? 'Escolha o bem substituído.' : 'Escolha ao menos um bem.';
    if ((troca || subst) && !segundo) n.segundo = troca ? 'Localize o bem que você recebe.' : 'Escolha o bem substituto.';
    if (f.justificativa.trim().length < 5) n.justificativa = 'Informe a justificativa (mínimo de 5 caracteres).';
    if (tipo === 'RESPONSABILIDADE' && !resp && !semResp) n.destino_responsavel_id = 'Escolha o novo responsável.';
    if (multiplos && !SEM_DESTINO.includes(tipo) && tipo !== 'TRANSFERENCIA_SALA' && !setor && !local && !resp && !f.sala.trim() && !semResp)
      n.destino_unidade_id = 'Informe o destino (setor, unidade, sala ou responsável).';
    if (tipo === 'TRANSFERENCIA_SALA' && !f.sala.trim() && !f.ambiente) n.destino_sala = 'Informe a nova sala ou ambiente.';
    if (tipo === 'EMPRESTIMO' && !f.devolucao_prevista) n.devolucao_prevista = 'Informe a data prevista de devolução.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Nova movimentação de patrimônio" largura="lg"
      descricao="O bem só muda de lugar ou de responsável depois da confirmação de quem recebe (ou do termo físico assinado)."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-mov" carregando={salvar.isPending}>Registrar movimentação</Botao></>}>
      <form id="form-mov" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Selecao className="sm:col-span-2" rotulo="Tipo de movimentação" obrigatorio value={tipo} onChange={(e) => { setTipo(e.target.value); setSegundo(null); if (['TROCA', 'SUBSTITUICAO'].includes(e.target.value)) setBens((x) => x.slice(0, 1)); }} erro={erros.tipo}>
          {TIPOS_SOLICITAVEIS.filter((t) => t !== 'BAIXA' || pode('patrimonio', 'aprovar')).map((t) => <option key={t} value={t}>{TIPOS_MOV[t]}</option>)}
        </Selecao>

        {/* bens */}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <SeletorBem rotulo={troca ? 'Bem que você entrega' : subst ? 'Bem substituído (sai)' : multiplos && bens.length ? 'Adicionar outro bem' : 'Bem patrimonial'}
            valor={null} excluir={bens.map((b) => b.id)} erro={erros.itens} filtro={(b) => !b.pendente && b.situacao !== 'BAIXADO'}
            aoMudar={(v, b) => { if (v && b) setBens((x) => (multiplos ? [...x, { id: v, rotulo: `${b.numero} – ${b.descricao}`, bem: b }] : [{ id: v, rotulo: `${b.numero} – ${b.descricao}`, bem: b }])); }} />
          {bens.length > 0 && <ul className="flex flex-wrap gap-1.5">{bens.map((b) => (
            <li key={b.id} className="inline-flex items-center gap-1 rounded-md bg-marca-50 px-2 py-0.5 text-xs text-marca-900 ring-1 ring-marca-200">{b.rotulo}
              {b.bem && <span className="text-marca-600">· {rotuloUnidade(b.bem.unidade)}{b.bem.responsavel ? ` · ${b.bem.responsavel}` : ''}</span>}
              <button type="button" className="ml-1 rounded px-1 hover:bg-marca-100" aria-label={`Tirar ${b.rotulo}`} onClick={() => setBens((x) => x.filter((y) => y.id !== b.id))}>×</button></li>))}</ul>}
        </div>

        {troca && <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="flex items-end gap-2">
            <Campo className="flex-1" rotulo="Número do bem que você recebe (de outro setor)" value={numeroTroca} onChange={(e) => setNumeroTroca(e.target.value)} erro={erros.segundo}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void procurarTroca(); } }} />
            <Botao variante="secundario" icone={<Search className="size-4" />} carregando={procurando} onClick={() => void procurarTroca()}>Localizar</Botao>
          </div>
          {segundo && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Recebe: {segundo.rotulo}</p>}
          <p className="text-xs text-slate-500">Cada bem vai para o setor, a unidade e o responsável do outro. Os dois responsáveis precisam confirmar; enquanto só um confirmar, a troca fica pendente.</p>
        </div>}

        {subst && <>
          <div className="sm:col-span-2"><SeletorBem rotulo="Bem substituto (entra no lugar)" valor={segundo?.id ?? null} rotuloValor={segundo?.rotulo} erro={erros.segundo}
            excluir={bens.map((b) => b.id)} filtro={(b) => !b.pendente && b.situacao !== 'BAIXADO'} aoMudar={(v, b) => setSegundo(v && b ? { id: v, rotulo: `${b.numero} – ${b.descricao}` } : null)} /></div>
          <Selecao rotulo="Destino do bem substituído" value={f.destino_substituido} onChange={set('destino_substituido')}>
            {Object.entries(DESTINO_SUBSTITUIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          <SeletorSetor rotulo="Setor que recebe o bem substituído" valor={setor?.id ?? null} rotuloValor={setor?.rotulo} aoMudar={(v, o) => setSetor(v && o ? { id: v, rotulo: o.rotulo } : null)}
            ajuda="Vazio: continua no mesmo setor." />
          <SeletorLocal rotulo="Unidade para onde vai o substituído" valor={local?.id ?? null} rotuloValor={local?.rotulo} aoMudar={(v, o) => setLocal(v && o ? { id: v, rotulo: o.rotulo } : null)} ajuda="Ex.: almoxarifado." />
          <Campo rotulo="Sala / ambiente do substituído" value={f.sala} onChange={set('sala')} maxLength={80} />
          <div className="sm:col-span-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
            <Interruptor rotulo="O substituto fica com o mesmo responsável do bem substituído" marcado={manterResp} aoMudar={setManterResp} />
            {!manterResp && <SeletorResponsavel rotulo="Responsável pelo bem substituto" valor={resp?.id ?? null} rotuloValor={resp?.rotulo} aoMudar={(v, o) => setResp(v && o ? { id: v, rotulo: o.rotulo } : null)} />}
          </div>
        </>}

        {multiplos && tipo !== 'BAIXA' && tipo !== 'RESPONSABILIDADE' && <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-marca-700 sm:col-span-2">Destino</h3>
          {tipo !== 'TRANSFERENCIA_SALA' && <SeletorSetor rotulo="Setor de destino (diretoria, coordenação, setor)" valor={setor?.id ?? null} rotuloValor={setor?.rotulo} erro={erros.destino_unidade_id}
            aoMudar={(v, o) => setSetor(v && o ? { id: v, rotulo: o.rotulo } : null)} ajuda="Vazio: mantém o setor atual." />}
          {tipo !== 'TRANSFERENCIA_SALA' && <SeletorLocal rotulo="Unidade de destino" valor={local?.id ?? null} rotuloValor={local?.rotulo} erro={erros.destino_local_id}
            aoMudar={(v, o) => setLocal(v && o ? { id: v, rotulo: o.rotulo } : null)} ajuda="Vazio: mantém a unidade atual." />}
          <Selecao rotulo="Ambiente" value={f.ambiente} onChange={set('ambiente')}><option value="">—</option>{Object.entries(AMBIENTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
          <Campo rotulo="Sala / identificação" value={f.sala} onChange={set('sala')} erro={erros.destino_sala} maxLength={80} />
          {tipo === 'EMPRESTIMO' && <Campo rotulo="Devolução prevista" type="date" obrigatorio value={f.devolucao_prevista} onChange={set('devolucao_prevista')} erro={erros.devolucao_prevista} />}
        </>}

        {multiplos && tipo !== 'BAIXA' && <div className="flex flex-col gap-2 sm:col-span-2 rounded-lg bg-slate-50 p-3">
          {!semResp && <SeletorResponsavel rotulo={tipo === 'RESPONSABILIDADE' ? 'Novo responsável' : 'Novo responsável (quem recebe)'} valor={resp?.id ?? null} rotuloValor={resp?.rotulo}
            erro={erros.destino_responsavel_id} aoMudar={(v, o) => setResp(v && o ? { id: v, rotulo: o.rotulo } : null)}
            ajuda={tipo === 'RESPONSABILIDADE' ? undefined : 'Vazio: mantém o responsável atual. O novo responsável confirma o recebimento pela conta dele.'} />}
          <Interruptor rotulo="Deixar sem responsável (ex.: estoque, manutenção)" marcado={semResp} aoMudar={(v) => { setSemResp(v); if (v) setResp(null); }} />
        </div>}

        <AreaTexto className="sm:col-span-2" rotulo="Justificativa" obrigatorio value={f.justificativa} onChange={set('justificativa')} erro={erros.justificativa} maxLength={2000} rows={2} />
        <AreaTexto className="sm:col-span-2" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} rows={2} />
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- detalhe

function Ponta({ titulo, p }: { titulo: string; p: Movimentacao['itens'][number]['origem'] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <dl className="grid gap-1.5 text-sm">
        <Dado rotulo="Setor">{p.unidade ? `${p.unidade.sigla ? `${p.unidade.sigla} – ` : ''}${p.unidade.nome}` : null}</Dado>
        <Dado rotulo="Diretoria / coordenação">{[p.unidade?.diretoria, p.unidade?.coordenacao].filter(Boolean).join(' · ')}</Dado>
        <Dado rotulo="Unidade · sala">{[p.local, p.ambiente && AMBIENTES[p.ambiente], p.sala].filter(Boolean).join(' · ')}</Dado>
        <Dado rotulo="Responsável">{p.responsavel ? `${p.responsavel.nome} (mat. ${p.responsavel.matricula})` : 'Sem responsável'}</Dado>
        <Dado rotulo="Situação">{SITUACAO[p.situacao] ?? p.situacao}</Dado>
      </dl>
    </div>
  );
}

export function DetalheMovimentacao({ id, aoFechar }: { id: string | null; aoFechar: () => void }) {
  const { orgao, contexto } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['patrimonio', 'mov', id], queryFn: () => obterMovimentacao(id!), enabled: !!id });
  const termos = useQuery({ queryKey: ['documentos', orgao?.id, 'patrimonio', id, 'TERMO_ASSINADO'], queryFn: () => listarDocumentos(orgao!.id, 'patrimonio', id!, 'TERMO_ASSINADO'), enabled: !!id && !!orgao });
  const [acao, setAcao] = useState<null | 'rejeitar' | 'cancelar' | 'retificar'>(null);
  const [aceite, setAceite] = useState(false);
  const [gerando, setGerando] = useState(false);
  const atualizar = async () => { await qc.invalidateQueries({ queryKey: ['patrimonio'] }); await qc.invalidateQueries({ queryKey: ['mensagens'] }); };
  const aceitar = useMutation({
    mutationFn: () => responderMovimentacao(id!, true, DECLARACAO),
    onSuccess: async (r) => { await atualizar(); toast.success(r === 'CONCLUIDA' ? 'Recebimento confirmado. Movimentação concluída.' : 'Sua confirmação foi registrada; falta a do outro responsável.'); setAceite(false); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const adm = useMutation({
    mutationFn: (doc: string | null) => confirmarAdministrativo(id!, doc, doc ? 'Conferido o termo físico assinado' : 'Confirmação administrativa'),
    onSuccess: async (r) => { await atualizar(); toast.success(r === 'CONCLUIDA' ? 'Movimentação concluída.' : 'Confirmação registrada.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  if (!id) return null;
  const m = q.data;
  const precisaTermo = !!m?.itens.some((i) => i.confirmacao === 'PENDENTE' && i.destino.responsavel && i.destino.responsavel.nome !== i.origem.responsavel?.nome);
  const emitirTermo = async () => {
    setGerando(true);
    try { const d = await dadosTermo(m!.id); await pdfTermo(orgao!.id, d, contexto?.perfil?.nome || contexto?.perfil?.email || ''); await atualizar(); }
    catch (e) { toast.error(mensagemDeErro(e)); } finally { setGerando(false); }
  };
  const aberta = !!m && ['AGUARDANDO_CONFIRMACAO', 'PENDENTE_REGULARIZACAO', 'CONFIRMADA_DESTINO'].includes(m.situacao);
  return (
    <Modal aberto aoFechar={aoFechar} largura="lg" titulo={m ? `Movimentação ${m.codigo}` : 'Movimentação'} descricao={m ? TIPOS_MOV[m.tipo] : undefined}
      rodape={m && <>
        {m.posso_retificar && <Botao variante="fantasma" icone={<RotateCcw className="size-4" />} onClick={() => setAcao('retificar')}>Retificar</Botao>}
        {m.posso_cancelar && <Botao variante="fantasma" icone={<Ban className="size-4" />} onClick={() => setAcao('cancelar')}>Cancelar</Botao>}
        {m.tipo !== 'BAIXA' && m.situacao !== 'CANCELADA' && m.situacao !== 'REJEITADA' &&
          <Botao variante="secundario" icone={<FileSignature className="size-4" />} carregando={gerando} onClick={() => void emitirTermo()}>Emitir termo físico (PDF)</Botao>}
        {m.aguarda_minha_confirmacao && <>
          <Botao variante="secundario" className="text-red-700" icone={<XCircle className="size-4" />} onClick={() => setAcao('rejeitar')}>Rejeitar</Botao>
          <Botao destaque icone={<BadgeCheck className="size-4" />} onClick={() => setAceite(true)}>Confirmar recebimento</Botao>
        </>}
      </>}>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !m ? null : <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2"><SeloMov s={m.situacao} />{m.retificada_por_codigo && <Selo tom="alerta">Retificada pela {m.retificada_por_codigo}</Selo>}
          {m.retifica_codigo && <Selo tom="info">Retifica a {m.retifica_codigo}</Selo>}{m.termo_emitido_em && <Selo>Termo emitido em {formatarDataHora(m.termo_emitido_em)}</Selo>}</div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Dado rotulo="Solicitada por">{m.solicitante}{m.solicitante_matricula ? ` (mat. ${m.solicitante_matricula})` : ''}</Dado>
          <Dado rotulo="Data">{formatarDataHora(m.criado_em)}</Dado>
          <Dado rotulo="Concluída em">{m.concluida_em ? formatarDataHora(m.concluida_em) : null}</Dado>
          <Dado className="sm:col-span-3" rotulo="Justificativa">{m.justificativa}</Dado>
          {m.observacoes && <Dado className="sm:col-span-3" rotulo="Observações">{m.observacoes}</Dado>}
          {m.destino_substituido && <Dado rotulo="Destino do substituído">{DESTINO_SUBSTITUIDO[m.destino_substituido]}</Dado>}
          {m.devolucao_prevista && <Dado rotulo="Devolução prevista">{formatarData(m.devolucao_prevista)}</Dado>}
          {m.motivo_rejeicao && <Dado className="sm:col-span-3" rotulo={`Rejeitada por ${m.rejeitada_por_nome ?? ''}`}>{m.motivo_rejeicao}</Dado>}
          {m.motivo_cancelamento && <Dado className="sm:col-span-3" rotulo="Motivo do cancelamento">{m.motivo_cancelamento}</Dado>}
          {m.conferido_em && <Dado className="sm:col-span-3" rotulo="Termo físico conferido">{`${m.conferido_por_nome} em ${formatarDataHora(m.conferido_em)}`}</Dado>}
        </dl>
        {m.itens.map((i) => (
          <section key={i.id} className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold">{i.papel !== 'PRINCIPAL' && <span className="mr-1 text-marca-700">{({ ENTREGUE: 'Entregue:', RECEBIDO: 'Recebido:', SUBSTITUIDO: 'Substituído:', SUBSTITUTO: 'Substituto:' } as Record<string, string>)[i.papel]}</span>}
              <span className="font-mono">{i.numero}</span> · {i.descricao}</p>
            <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]"><Ponta titulo="Origem" p={i.origem} /><ArrowRight className="mx-auto hidden size-5 text-slate-400 md:block" /><Ponta titulo="Destino" p={i.destino} /></div>
            <p className={cx('mt-2 flex items-center gap-1.5 text-xs', i.confirmacao === 'CONFIRMADO' ? 'text-emerald-700' : i.confirmacao === 'REJEITADO' ? 'text-red-700' : 'text-amber-700')}>
              {i.confirmacao === 'CONFIRMADO' ? <CheckCircle2 className="size-4" /> : i.confirmacao === 'REJEITADO' ? <XCircle className="size-4" /> : <FileSignature className="size-4" />}
              {i.confirmacao === 'CONFIRMADO' ? `Confirmado ${({ DIGITAL: 'digitalmente', DOCUMENTO_FISICO: 'por termo físico assinado', ADMINISTRATIVA: 'pela administração', AUTOMATICA: 'automaticamente (competência de quem solicitou)' } as Record<string, string>)[i.confirmacao_tipo ?? ''] ?? ''} por ${i.confirmado_por ?? ''}${i.confirmado_matricula ? ` (mat. ${i.confirmado_matricula})` : ''} em ${formatarDataHora(i.confirmado_em)}`
                : i.confirmacao === 'REJEITADO' ? `Rejeitado: ${i.declaracao ?? ''}` : `Aguardando confirmação de ${i.destino.responsavel?.nome ?? 'administração patrimonial do destino'}`}
            </p>
          </section>
        ))}
        {aberta && (m.posso_confirmar_adm || precisaTermo) && (
          <Cartao titulo="Confirmação por documento físico">
            <p className="mb-3 text-sm text-slate-600">Quando não for possível a confirmação pelo sistema: emita o termo físico, colha as assinaturas, digitalize e anexe abaixo. A administração patrimonial confere e confirma.</p>
            <Anexos recurso="patrimonio" registroId={m.id} unidadeId={m.unidade_id} categoria="TERMO_ASSINADO" titulo="Termo assinado (digitalizado)" vazio="Nenhum termo assinado anexado." />
            {m.posso_confirmar_adm && <div className="mt-3 flex flex-wrap gap-2">
              {termos.data?.length ? <Botao icone={<BadgeCheck className="size-4" />} carregando={adm.isPending} onClick={() => adm.mutate(termos.data![0]!.id)}>Confirmar com o termo anexado</Botao> : null}
              {!precisaTermo && <Botao variante="secundario" carregando={adm.isPending} onClick={() => adm.mutate(null)}>Confirmar pela administração</Botao>}
            </div>}
          </Cartao>
        )}
        <Anexos recurso="patrimonio" registroId={m.id} unidadeId={m.unidade_id} categoria="GERAL" titulo="Fotografias e documentos da operação" />
      </div>}
      <Modal aberto={aceite} aoFechar={() => setAceite(false)} titulo="Confirmar recebimento" largura="sm"
        rodape={<><Botao variante="secundario" onClick={() => setAceite(false)}>Voltar</Botao><Botao carregando={aceitar.isPending} icone={<BadgeCheck className="size-4" />} onClick={() => aceitar.mutate()}>Confirmo</Botao></>}>
        <p className="text-sm text-slate-700">“{DECLARACAO}”</p>
        <p className="mt-3 text-xs text-slate-500">A confirmação fica registrada com a sua conta, nome, matrícula, data e horário.</p>
      </Modal>
      <ConfirmarComMotivo aberto={acao === 'rejeitar'} aoFechar={() => setAcao(null)} titulo="Rejeitar a movimentação"
        descricao="O bem continua onde está, com o mesmo responsável. Quem solicitou é avisado." rotuloConfirmar="Rejeitar"
        aoConfirmar={async (mot) => { await responderMovimentacao(id, false, mot); await atualizar(); toast.success('Movimentação rejeitada.'); }} />
      <ConfirmarComMotivo aberto={acao === 'cancelar'} aoFechar={() => setAcao(null)} titulo="Cancelar a movimentação"
        descricao="Os bens são liberados e voltam à situação anterior. O registro fica no histórico." rotuloConfirmar="Cancelar movimentação"
        aoConfirmar={async (mot) => { await cancelarMovimentacao(id, mot); await atualizar(); toast.success('Movimentação cancelada.'); }} />
      <ConfirmarComMotivo aberto={acao === 'retificar'} aoFechar={() => setAcao(null)} titulo="Retificar movimentação concluída" minimo={10}
        descricao="Cria uma movimentação de retificação que devolve os bens ao estado anterior. A original é preservada e fica marcada como retificada." rotuloConfirmar="Retificar"
        aoConfirmar={async (mot) => { await retificarMovimentacao(id, mot); await atualizar(); toast.success('Movimentação retificada.'); }} />
    </Modal>
  );
}

// ---------------------------------------------------------------- listas

function ListaMovimentacoes({ tipos, paraMim, pendentes, situacao, titulo, vazio }: { tipos?: string[]; paraMim?: boolean; pendentes?: boolean; situacao?: string[]; titulo?: string; vazio: string }) {
  const { orgao } = useSessao();
  const [params, setParams] = useSearchParams();
  const [pagina, setPagina] = useState(0);
  const q = useQuery({
    queryKey: ['patrimonio', 'movs', orgao?.id, tipos, paraMim, pendentes, situacao, pagina], enabled: !!orgao, placeholderData: (a) => a,
    queryFn: () => listarMovimentacoes(orgao!.id, { tipos, para_mim: paraMim, pendentes, situacoes: situacao, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
  });
  const abrir = (id: string) => { params.set('m', id); setParams(params, { replace: true }); };
  return (
    <Cartao titulo={titulo}>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data!.itens.length ? <Vazio titulo={vazio} /> : <>
        <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
          {q.data!.itens.map((m) => (
            <li key={m.id}><button className="flex w-full flex-wrap items-start gap-3 py-3 text-left" onClick={() => abrir(m.id)}>
              <span className="numero w-20 font-mono text-sm font-semibold">{m.codigo}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{TIPOS_MOV[m.tipo]} · {m.bens.map((b) => `${b.numero} ${b.descricao}`).join('; ')}</span>
                <span className="block text-xs text-slate-500">{rotuloUnidade(m.origem)}{m.destino && m.destino.id !== m.origem?.id ? ` → ${rotuloUnidade(m.destino)}` : ''} · {formatarDataHora(m.criado_em)} · {m.solicitante}</span>
              </span>
              {m.aguarda_minha_confirmacao && <Selo tom="alerta">Aguarda você</Selo>}
              <SeloMov s={m.situacao} />
            </button></li>
          ))}
        </ul>
        <Paginacao pagina={pagina} total={q.data!.total} porPagina={POR_PAGINA} aoMudar={setPagina} />
      </>}
    </Cartao>
  );
}

export function Movimentacoes({ titulo = 'Movimentações', tipos, tipoNovo = 'TRANSFERENCIA_COORDENACAO', descricao }: { titulo?: string; tipos?: string[]; tipoNovo?: string; descricao?: string }) {
  const { orgao } = useSessao();
  const [params, setParams] = useSearchParams();
  const [nova, setNova] = useState(false);
  const [situacao, setSituacao] = useState('');
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  return (
    <>
      <CabecalhoPagina titulo={titulo} descricao={descricao ?? 'Toda movimentação gera registro permanente: origem, destino, responsáveis, justificativa e confirmações.'}
        acoes={<Botao icone={<Plus className="size-4" />} onClick={() => setNova(true)}>Nova movimentação</Botao>} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[['', 'Todas'], ['AGUARDANDO_CONFIRMACAO,CONFIRMADA_DESTINO,PENDENTE_REGULARIZACAO', 'Em andamento'], ['CONCLUIDA', 'Concluídas'], ['REJEITADA', 'Rejeitadas'], ['CANCELADA', 'Canceladas']].map(([v, r]) => (
          <button key={r} onClick={() => setSituacao(v!)} aria-pressed={situacao === v}
            className={cx('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset', situacao === v ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{r}</button>
        ))}
      </div>
      <ListaMovimentacoes tipos={tipos} situacao={situacao ? situacao.split(',') : undefined} vazio="Nenhuma movimentação" />
      <NovaMovimentacao aberto={nova} aoFechar={() => setNova(false)} tipoInicial={tipoNovo} aoConcluir={(id) => { params.set('m', id); setParams(params, { replace: true }); }} />
      <DetalheMovimentacao id={params.get('m')} aoFechar={() => { params.delete('m'); setParams(params, { replace: true }); }} />
    </>
  );
}

export const Transferencias = () => <Movimentacoes titulo="Transferências" tipos={TIPOS_TRANSFERENCIA} descricao="Transferências entre salas, setores, coordenações, diretorias e unidades, almoxarifado, manutenção, empréstimos e devoluções." />;
export const Trocas = () => <Movimentacoes titulo="Trocas de patrimônio" tipos={['TROCA']} tipoNovo="TROCA" descricao="Um bem entregue e outro recebido na mesma operação, com número único e confirmação dos dois responsáveis." />;
export const Substituicoes = () => <Movimentacoes titulo="Substituições" tipos={['SUBSTITUICAO']} tipoNovo="SUBSTITUICAO" descricao="Um equipamento sai e outro ocupa o lugar; o histórico do bem anterior é preservado." />;

export function Pendencias() {
  const { orgao, pode } = useSessao();
  const [params, setParams] = useSearchParams();
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  return (
    <>
      <CabecalhoPagina titulo="Pendências e confirmações" descricao="Transferências e trocas que aguardam aceite, termos físicos pendentes e movimentações recentes." />
      <div className="flex flex-col gap-4">
        <ListaMovimentacoes paraMim titulo="Aguardando a sua confirmação de recebimento" vazio="Nada aguardando a sua confirmação." />
        <ListaMovimentacoes situacao={['PENDENTE_REGULARIZACAO']} titulo="Documentos físicos pendentes (termo emitido)" vazio="Nenhum termo físico pendente." />
        {pode('patrimonio', 'ler') && <>
          <ListaMovimentacoes situacao={['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA_DESTINO']} titulo="Movimentações em andamento no seu escopo" vazio="Nenhuma movimentação em andamento." />
          <ListaMovimentacoes situacao={['REJEITADA']} titulo="Solicitações rejeitadas" vazio="Nenhuma rejeição." />
          <ListaMovimentacoes situacao={['CONCLUIDA']} titulo="Movimentações concluídas" vazio="Nenhuma movimentação concluída." />
        </>}
      </div>
      <DetalheMovimentacao id={params.get('m')} aoFechar={() => { params.delete('m'); setParams(params, { replace: true }); }} />
    </>
  );
}

