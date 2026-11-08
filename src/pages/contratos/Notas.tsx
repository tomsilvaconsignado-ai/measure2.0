import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Ban, ClipboardCheck, ClipboardCopy, Layers, Plus, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, centavos, decimalDeCentavos, formatarCentavos, formatarData, formatarDataHora } from '@/lib/formatacao';
import type { ContratoResumo, NotaResumo, StatusPagamento } from '@/lib/tipos';
import { listarTiposServico, listarUnidadesAtendidas, membrosDoGrupo, obterUnidadeAtendida } from '@/services/cadastros';
import {
  atestarNota, cancelarNota, vincularEmpenhoNota, listarEmpenhos, cancelarPagamento, listarEmitidos, listarNotas, modeloAtesto, obterContrato, obterNota, saldoEmpenho, salvarNota,
} from '@/services/execucao';
import { montarAtesto } from '@/lib/atesto';
import { BaixaPagamento, type NotaParaBaixa } from './BaixaPagamento';
import { TextoDecreto, TextoEncaminhamento } from './TextosNota';
import { EmitirChecklist } from './EmitirChecklist';
import { usePendencias } from '@/components/Pendencias';
import { ExtratosNotas } from './ExtratosNotas';
import { AvisoVencido, BotaoAtestar, BotaoBaixa, BotaoVisualizar, SeletorContrato, SeletorEmpenho, SeloAtesto, SeloPagamento } from './comum';

const POR_PAGINA = 25;
const PAPEL_ATESTO: Record<string, string> = { GESTOR: 'gestor', FISCAL: 'fiscal', SUPLENTE: 'suplente', LANCADOR: 'quem lançou a nota' };
const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
interface UnidadeLinha { id: string; nome: string; eh_grupo: boolean; regra: string; valor: number | null }

// Checklist (emitido na hora, com as conferências do sistema) e documentos já emitidos da nota
function DocumentosEmitidosNota({ nota }: { nota: NotaResumo }) {
  const navegar = useNavigate();
  const notaId = nota.id;
  const q = useQuery({ queryKey: ['emitidos', notaId], queryFn: () => listarEmitidos(notaId) });
  const qc = useQueryClient();
  const [emitindo, setEmitindo] = useState(false);
  return (
    <div className="mb-5 rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">Documentos emitidos</p>
        {!nota.cancelada_em && <Botao pequeno variante="secundario" icone={<ClipboardCheck className="size-4" />} onClick={() => setEmitindo(true)}>Emitir checklist</Botao>}
      </div>
      {q.isLoading ? <Carregando /> : !q.data?.length ? <p className="text-xs text-slate-500">Nenhum documento emitido. O checklist sai no formulário de análise dos documentos da nota (modelo da SMS), com os dados do sistema na data da emissão.</p> : (
        <ul className="divide-y divide-slate-100">
          {q.data.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="min-w-0 truncate">{d.titulo}<span className="block text-xs text-slate-500">{formatarDataHora(d.emitido_em)}</span></span>
              <Botao pequeno variante="fantasma" onClick={() => navegar(`/imprimir/${d.id}`)}>Abrir</Botao>
            </li>
          ))}
        </ul>
      )}
      <EmitirChecklist nota={nota} aberto={emitindo} aoFechar={() => setEmitindo(false)} aoEmitir={() => qc.invalidateQueries({ queryKey: ['emitidos', notaId] })} />
    </div>
  );
}

function NovaNota({ aberto, aoFechar, contratoInicial, empenhoInicial, aoSalvar }: { aberto: boolean; aoFechar: () => void; contratoInicial?: string | null; empenhoInicial?: string | null; aoSalvar: (id: string) => void }) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState<'contrato' | 'dados' | 'referencia' | 'atesto'>('contrato');
  const [contrato, setContrato] = useState<{ id: string; rotulo: string } | null>(null);
  const [empenho, setEmpenho] = useState<{ id: string; rotulo: string } | null>(null);
  const [f, setF] = useState({ numero: '', serie: '', data_emissao: hoje(), processo_administrativo: '', tipo_servico_id: '', periodo_inicio: '', periodo_fim: '', observacoes: '', excecao_saldo: '' });
  const [valor, setValor] = useState<number | null>(null);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [meses, setMeses] = useState<Array<{ ano: number; mes: number }>>([]);
  const [unidades, setUnidades] = useState<UnidadeLinha[]>([]);
  const [ratear, setRatear] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    // vindo do contrato ou do empenho, já começa nos dados da nota
    setEtapa(contratoInicial ? 'dados' : 'contrato'); setErros({}); setEmpenho(empenhoInicial ? { id: empenhoInicial, rotulo: 'Empenho selecionado' } : null);
    setValor(null); setMeses([]); setUnidades([]); setRatear(false);
    setContrato(contratoInicial ? { id: contratoInicial, rotulo: 'Contrato selecionado' } : null);
    setF({ numero: '', serie: '', data_emissao: hoje(), processo_administrativo: '', tipo_servico_id: '', periodo_inicio: '', periodo_fim: '', observacoes: '', excecao_saldo: '' });
  }, [aberto, contratoInicial, empenhoInicial]);
  // contrato com um só empenho ativo: ele já vem escolhido (e o rótulo do empenho vindo por atalho é completado)
  const empenhosDoContrato = useQuery({
    queryKey: ['empenhos-opcoes', orgao?.id, contrato?.id, 'auto'], enabled: aberto && !!contrato && !!orgao,
    queryFn: () => listarEmpenhos({ tenantId: orgao!.id, contratoId: contrato!.id, situacao: 'ATIVOS', limite: 30, offset: 0 }),
  });
  useEffect(() => {
    const lista = empenhosDoContrato.data?.itens ?? [];
    if (empenho && empenho.rotulo === 'Empenho selecionado') {
      const x = lista.find((i) => i.id === empenho.id);
      if (x) setEmpenho({ id: x.id, rotulo: `${x.numero}/${x.ano}` });
    } else if (!empenho && lista.length === 1) setEmpenho({ id: lista[0]!.id, rotulo: `${lista[0]!.numero}/${lista[0]!.ano}` });
  }, [empenhosDoContrato.data, empenho]);
  const ct = useQuery({ queryKey: ['contrato', contrato?.id], queryFn: () => obterContrato(contrato!.id), enabled: !!contrato });
  useEffect(() => { if (ct.data && contrato?.rotulo === 'Contrato selecionado') setContrato({ id: ct.data.id, rotulo: `${ct.data.numero} – ${ct.data.fornecedor_nome}` }); }, [ct.data, contrato]);
  const saldo = useQuery({ queryKey: ['saldo-empenho', empenho?.id], queryFn: () => saldoEmpenho(empenho!.id), enabled: !!empenho });
  const tipos = useQuery({ queryKey: ['tipos-servico', orgao?.id], queryFn: () => listarTiposServico(orgao!.id), enabled: !!orgao });
  const atesto = useQuery({ queryKey: ['modelo-atesto', orgao?.id], queryFn: () => modeloAtesto(orgao!.id), enabled: !!orgao });
  const saldoC = saldo.data != null ? centavos(saldo.data) : null;
  const excede = saldoC != null && valor != null && valor > saldoC;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const somaRateio = unidades.reduce((s, u) => s + (u.valor ?? 0), 0);

  const incluirUnidade = async (id: string) => {
    if (unidades.some((x) => x.id === id)) return;
    const ua = await obterUnidadeAtendida(id);
    if (ua.eh_grupo && ua.regra_rateio === 'OBRIGATORIO') {
      // grupo com rateio obrigatório: entra com as unidades componentes
      const membros = await membrosDoGrupo(ua.id);
      setUnidades((x) => [...x, ...membros.filter((m) => !x.some((y) => y.id === m.id)).map((m) => ({ id: m.id, nome: m.nome, eh_grupo: false, regra: m.regra_rateio, valor: null }))]);
      setRatear(true);
      toast.info(`"${ua.nome}" exige rateio: incluídas as ${membros.length} unidades do grupo. Distribua o valor.`);
    } else {
      setUnidades((x) => [...x, { id: ua.id, nome: ua.nome, eh_grupo: ua.eh_grupo, regra: ua.regra_rateio, valor: null }]);
    }
  };
  const expandirGrupo = async (g: UnidadeLinha) => {
    const membros = await membrosDoGrupo(g.id);
    setUnidades((x) => [...x.filter((y) => y.id !== g.id), ...membros.filter((m) => !x.some((y) => y.id === m.id)).map((m) => ({ id: m.id, nome: m.nome, eh_grupo: false, regra: m.regra_rateio, valor: null }))]);
    setRatear(true);
  };
  const dividirIgual = () => {
    if (!valor || !unidades.length) return;
    const base = Math.floor(valor / unidades.length);
    setUnidades((x) => x.map((u, i) => ({ ...u, valor: base + (i < valor - base * unidades.length ? 1 : 0) })));
  };

  const textoAtesto = ct.data && atesto.data ? montarAtesto(atesto.data.modelo, atesto.data.decreto, {
    objeto: ct.data.objeto, contrato: ct.data.numero, fornecedor: ct.data.fornecedor_nome, nota: f.numero ? (f.serie ? `${f.numero}-${f.serie}` : f.numero) : '', valorCentavos: valor ?? 0,
    meses, periodoInicio: f.periodo_inicio, periodoFim: f.periodo_fim, processo: f.processo_administrativo,
    vigenciaInicio: ct.data.data_inicio, vigenciaFim: ct.data.data_fim_atual, locais: unidades.map((u) => u.nome),
  }) : '';

  // Para chegar a uma etapa, valida só as etapas anteriores a ela ('fim' = registrar a nota)
  const validar = (destino: typeof etapa | 'fim') => {
    const alvo = destino === 'fim' ? 4 : ['contrato', 'dados', 'referencia', 'atesto'].indexOf(destino);
    const n: Record<string, string> = {};
    if (alvo >= 1 && !contrato) n.contrato_id = 'Escolha o contrato.';
    if (alvo >= 2) {
      if (!empenho) n.empenho_id = 'Escolha o empenho.';
      if (!f.numero.trim()) n.numero = 'Informe o número da nota.';
      if (!f.data_emissao) n.data_emissao = 'Informe a data da nota.';
      if (!valor) n.valor = 'Informe o valor da nota.';
      if (excede && !f.excecao_saldo.trim()) n.valor = `Saldo insuficiente no empenho (${formatarCentavos(saldoC!)}).`;
    }
    if (alvo >= 3) {
      if (!meses.length) n.referencias = 'Escolha ao menos um mês de referência.';
      if (ratear && somaRateio !== valor) n.unidades = `O rateio soma ${formatarCentavos(somaRateio)}; precisa somar ${formatarCentavos(valor ?? 0)}.`;
    }
    setErros(n);
    // se a falha é de uma etapa anterior, volta para ela
    if (n.contrato_id) setEtapa('contrato');
    else if (n.empenho_id || n.numero || n.data_emissao || n.valor) setEtapa('dados');
    else if (n.referencias || n.unidades) setEtapa('referencia');
    return Object.keys(n).length === 0;
  };
  const irPara = (e: typeof etapa) => { if (validar(e)) setEtapa(e); };

  const salvar = useMutation({
    mutationFn: () => salvarNota({
      empenho_id: empenho!.id, numero: f.numero.trim(), serie: f.serie.trim() || null, data_emissao: f.data_emissao,
      processo_administrativo: f.processo_administrativo.trim() || null, valor: decimalDeCentavos(valor!), tipo_servico_id: f.tipo_servico_id || null,
      periodo_inicio: f.periodo_inicio || null, periodo_fim: f.periodo_fim || null, observacoes: f.observacoes.trim() || null,
      excecao_saldo: excede ? f.excecao_saldo.trim() : null, referencias: meses,
      unidades: unidades.map((u) => ({ id: u.id, valor: ratear && u.valor ? decimalDeCentavos(u.valor) : null })),
    }),
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ['notas'] }); await qc.invalidateQueries({ queryKey: ['empenhos'] }); await qc.invalidateQueries({ queryKey: ['contrato'] });
      toast.success('Nota fiscal registrada. Ela aguarda o atesto do gestor/fiscal.');
      aoFechar(); aoSalvar(id);
    },
    onError: (e) => {
      if (/notas_numero_unico/.test((e as Error).message ?? '')) { setErros({ numero: 'Esta nota (número/série) já foi lançada para este fornecedor.' }); setEtapa('dados'); return; }
      const t = traduzirErro(e);
      setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem });
      if (t.campo && ['empenho_id', 'numero', 'valor', 'data_emissao'].includes(t.campo)) setEtapa('dados');
      if (t.campo && ['referencias', 'unidades'].includes(t.campo)) setEtapa('referencia');
    },
  });

  const ordem = ['contrato', 'dados', 'referencia', 'atesto'] as const;
  const i = ordem.indexOf(etapa);
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Nova nota fiscal" largura="lg"
      rodape={<>
        {i > 0 && <Botao variante="secundario" onClick={() => setEtapa(ordem[i - 1]!)}>Voltar</Botao>}
        {i < 3 ? <Botao onClick={() => irPara(ordem[i + 1]!)}>Continuar</Botao> : <Botao carregando={salvar.isPending} onClick={() => { if (validar('fim')) salvar.mutate(); }}>Registrar nota</Botao>}
      </>}>
      <Abas abas={[{ id: 'contrato', rotulo: '1. Contrato' }, { id: 'dados', rotulo: '2. Dados da nota' }, { id: 'referencia', rotulo: '3. Referência' }, { id: 'atesto', rotulo: '4. Texto de atesto' }]}
        ativa={etapa} aoMudar={(e) => (ordem.indexOf(e) < i ? setEtapa(e) : irPara(e))} />
      {etapa === 'contrato' && <div className="flex flex-col gap-4">
        <SeletorContrato obrigatorio valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} erro={erros.contrato_id}
          aoMudar={(v, o) => { setContrato(v && o ? { id: v, rotulo: o.rotulo } : null); setEmpenho(null); }} />
        {ct.data && <ResumoContrato c={ct.data} />}
      </div>}
      {etapa === 'dados' && <div className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-6"><SeletorEmpenho obrigatorio contratoId={contrato?.id ?? null} valor={empenho?.id ?? null} rotuloValor={empenho?.rotulo} erro={erros.empenho_id}
          aoMudar={(v, o) => setEmpenho(v && o ? { id: v, rotulo: o.rotulo } : null)} /></div>
        {saldoC != null && <p className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700 sm:col-span-6">Saldo disponível no empenho: <strong className="numero">{formatarCentavos(saldoC)}</strong></p>}
        <Campo className="sm:col-span-2" rotulo="Número da nota" obrigatorio value={f.numero} onChange={set('numero')} erro={erros.numero} maxLength={40} />
        <Campo className="sm:col-span-1" rotulo="Série" value={f.serie} onChange={set('serie')} maxLength={10} />
        <Campo className="sm:col-span-3" rotulo="Data da nota" type="date" obrigatorio value={f.data_emissao} onChange={set('data_emissao')} erro={erros.data_emissao} />
        <CampoMoeda className="sm:col-span-3" rotulo="Valor da nota" obrigatorio centavos={valor} aoMudar={setValor} erro={erros.valor} />
        <Campo className="sm:col-span-3" rotulo="Processo administrativo da nota" value={f.processo_administrativo} onChange={set('processo_administrativo')} maxLength={60} placeholder="000.000/0000"
          ajuda="Processo aberto para esta nota (não é o processo do contrato)." />
        {excede && <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:col-span-6">
          <p className="flex items-start gap-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" />O valor ultrapassa o saldo do empenho em {formatarCentavos(valor! - saldoC!)}. Faça um reforço no empenho ou registre a exceção.</p>
          {pode('notas_fiscais', 'aprovar')
            ? <AreaTexto rotulo="Justificativa da exceção de saldo" value={f.excecao_saldo} onChange={set('excecao_saldo')} maxLength={1000} ajuda="Fica registrada na nota e na auditoria." />
            : <p className="text-xs text-amber-800">Só quem tem permissão de aprovar exceções (ex.: Master) pode registrar esta nota acima do saldo.</p>}
        </div>}
      </div>}
      {etapa === 'referencia' && <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 flex items-center gap-3"><span className="text-sm font-medium text-slate-700">Meses de referência *</span>
            <select className="h-8 rounded-lg border border-slate-300 px-2 text-sm" value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano de referência">
              {Array.from({ length: 6 }, (_, k) => new Date().getFullYear() - 3 + k).map((a) => <option key={a}>{a}</option>)}
            </select></div>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {MESES.map((m, k) => {
              const marcado = meses.some((x) => x.ano === ano && x.mes === k + 1);
              return <button key={m} type="button" aria-pressed={marcado} onClick={() => setMeses((x) => marcado ? x.filter((y) => !(y.ano === ano && y.mes === k + 1)) : [...x, { ano, mes: k + 1 }])}
                className={cx('rounded-lg py-1.5 text-sm ring-1 ring-inset', marcado ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{m}</button>;
            })}
          </div>
          {meses.length > 0 && <p className="mt-2 text-xs text-slate-600">Selecionados: {[...meses].sort((a, b) => a.ano - b.ano || a.mes - b.mes).map((m) => `${String(m.mes).padStart(2, '0')}/${m.ano}`).join(', ')}</p>}
          {erros.referencias && <p className="mt-1 text-xs text-red-700" role="alert">{erros.referencias}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Início do período de execução" type="date" value={f.periodo_inicio} onChange={set('periodo_inicio')} />
          <Campo rotulo="Fim do período" type="date" value={f.periodo_fim} onChange={set('periodo_fim')} />
          <Selecao rotulo="Tipo de serviço" value={f.tipo_servico_id} onChange={set('tipo_servico_id')}>
            <option value="">—</option>{tipos.data?.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Selecao>
        </div>
        <div className="flex flex-col gap-2">
          <BuscaSelect rotulo="Unidades atendidas" valor={null} chave={['ua-nota', orgao?.id, unidades.length]} ajuda="Escolha uma ou várias. Valor só é preenchido se houver rateio (a soma tem de fechar com a nota)."
            aoMudar={(v) => { if (v) void incluirUnidade(v); }}
            buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao!.id, busca: t, situacao: 'ATIVOS', limite: 20, offset: 0 })).itens
              .filter((u) => !unidades.some((x) => x.id === u.id)).map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.eh_grupo ? `Grupo · rateio ${u.regra_rateio === 'OBRIGATORIO' ? 'obrigatório' : 'opcional'}` : u.tipo }))} />
          {unidades.length > 0 && <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-marca-700" checked={ratear} onChange={(e) => setRatear(e.target.checked)} />Ratear o valor entre as unidades</label>
              {ratear && <Botao pequeno variante="fantasma" onClick={dividirIgual}>Dividir igualmente</Botao>}
              {ratear && <span className={cx('numero text-sm', somaRateio === valor ? 'text-emerald-700' : 'text-amber-700')}>Distribuído {formatarCentavos(somaRateio)} de {formatarCentavos(valor ?? 0)}</span>}
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {unidades.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm">{u.nome}{u.eh_grupo && <Selo tom="alerta">grupo</Selo>}</span>
                  {u.eh_grupo && <Botao pequeno variante="fantasma" icone={<Layers className="size-4" />} onClick={() => void expandirGrupo(u)}>Ratear entre as unidades do grupo</Botao>}
                  {ratear && <div className="w-40"><CampoMoeda rotulo="" centavos={u.valor} aoMudar={(v) => setUnidades((x) => x.map((y) => (y.id === u.id ? { ...y, valor: v } : y)))} /></div>}
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Tirar ${u.nome}`} onClick={() => setUnidades((x) => x.filter((y) => y.id !== u.id))}><X className="size-4" /></button>
                </li>))}
            </ul>
          </>}
          {erros.unidades && <p className="text-xs text-red-700" role="alert">{erros.unidades}</p>}
        </div>
        <AreaTexto rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} />
      </div>}
      {etapa === 'atesto' && <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Prévia do texto que o gestor/fiscal vai atestar (modelo configurável pelo órgão). Depois de registrada, a nota aparece para o responsável atestar.</p>
        <div className="whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{textoAtesto}</div>
        <Botao variante="secundario" icone={<ClipboardCopy className="size-4" />} className="self-start" onClick={() => { void navigator.clipboard.writeText(textoAtesto); toast.success('Texto copiado.'); }}>Copiar texto</Botao>
        {orgao && <TextoDecreto tenantId={orgao.id} processoContrato={ct.data?.processo_administrativo ?? null} />}
        {erros.geral && <CaixaErro mensagem={erros.geral} />}
      </div>}
    </Modal>
  );
}

function ResumoContrato({ c }: { c: ContratoResumo }) {
  return (
    <div className="flex flex-col gap-2">
      <AvisoVencido c={c} />
      <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Objeto</dt><dd>{c.objeto}</dd></div>
        <div><dt className="text-xs text-slate-500">Fornecedor</dt><dd>{c.fornecedor_nome}</dd></div>
        <div><dt className="text-xs text-slate-500">Vigência</dt><dd>{formatarData(c.data_inicio)} a {formatarData(c.data_fim_atual)}</dd></div>
        <div><dt className="text-xs text-slate-500">Saldo do contrato</dt><dd className="numero">{brl(c.saldo)}</dd></div>
        <div><dt className="text-xs text-slate-500">Empenhado</dt><dd className="numero">{brl(c.empenhado)}</dd></div>
      </dl>
    </div>
  );
}

// Nota migrada do sistema anterior sem empenho: escolha o empenho do contrato para completá-la
function VincularEmpenho({ nota, podeEditar, aoVincular }: { nota: NotaResumo; podeEditar: boolean; aoVincular: () => Promise<void> }) {
  const [empenho, setEmpenho] = useState<{ id: string; rotulo: string } | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [pedeJustificativa, setPedeJustificativa] = useState(false);
  const vincular = useMutation({
    mutationFn: () => vincularEmpenhoNota(nota.id, empenho!.id, justificativa),
    onSuccess: async () => { await aoVincular(); toast.success(`Empenho ${empenho!.rotulo} vinculado à nota.`); },
    onError: (e) => { const t = traduzirErro(e); if (t.campo === 'justificativa') setPedeJustificativa(true); toast.error(t.mensagem); },
  });
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-medium">Nota migrada do sistema anterior sem empenho.</p>
      {podeEditar ? <>
        <p className="mt-0.5 text-amber-900">Escolha o empenho do contrato {nota.contrato_numero} para completar o cadastro. Se o empenho ainda não existe, cadastre-o primeiro em Empenhos.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <SeletorEmpenho contratoId={nota.contrato_id} valor={empenho?.id ?? null} rotuloValor={empenho?.rotulo}
            aoMudar={(v, o) => setEmpenho(v && o ? { id: v, rotulo: o.rotulo } : null)} />
          <Botao disabled={!empenho} carregando={vincular.isPending} onClick={() => vincular.mutate()}>Vincular empenho</Botao>
        </div>
        {pedeJustificativa && <AreaTexto className="mt-2" rotulo="Justificativa da exceção de saldo" value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
          ajuda="O valor da nota passa do saldo do empenho. Só quem pode aprovar exceções conclui o vínculo." />}
      </> : <p className="mt-0.5 text-amber-900">Quem administra as notas da coordenação pode completar o empenho.</p>}
    </div>
  );
}

function DetalheNota({ id, aoFechar, abaInicial = 'dados' }: { id: string | null; aoFechar: () => void; abaInicial?: 'dados' | 'atesto' | 'pagamentos' | 'documentos' }) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['nota', id], queryFn: () => obterNota(id!), enabled: !!id });
  const ct = useQuery({ queryKey: ['contrato', q.data?.nota.contrato_id], queryFn: () => obterContrato(q.data!.nota.contrato_id), enabled: !!q.data });
  const modelo = useQuery({ queryKey: ['modelo-atesto', orgao?.id], queryFn: () => modeloAtesto(orgao!.id), enabled: !!orgao });
  const [aba, setAba] = useState<'dados' | 'atesto' | 'pagamentos' | 'documentos'>(abaInicial);
  const [texto, setTexto] = useState('');
  const [baixando, setBaixando] = useState<NotaParaBaixa | null>(null);
  const [cancelandoPag, setCancelandoPag] = useState<string | null>(null);
  const [cancelandoNota, setCancelandoNota] = useState(false);
  useEffect(() => setAba('dados'), [id]);
  const n = q.data?.nota;
  const sugerido = useMemo(() => (n && ct.data && modelo.data ? montarAtesto(modelo.data.modelo, modelo.data.decreto, {
    objeto: ct.data.objeto, contrato: n.contrato_numero, fornecedor: n.fornecedor_nome, nota: n.serie ? `${n.numero}-${n.serie}` : n.numero,
    valorCentavos: centavos(n.valor), meses: q.data!.referencias, periodoInicio: n.periodo_inicio, periodoFim: n.periodo_fim, processo: n.processo_administrativo,
    vigenciaInicio: ct.data.data_inicio, vigenciaFim: ct.data.data_fim_atual, locais: q.data!.unidades.map((u) => u.nome),
  }) : ''), [n, ct.data, modelo.data, q.data]);
  useEffect(() => { if (sugerido) setTexto(sugerido); }, [sugerido]);
  const invalidar = async () => { await qc.invalidateQueries({ queryKey: ['nota', id] }); await qc.invalidateQueries({ queryKey: ['emitidos', id] }); await qc.invalidateQueries({ queryKey: ['notas'] }); await qc.invalidateQueries({ queryKey: ['empenhos'] }); await qc.invalidateQueries({ queryKey: ['contrato'] }); };
  const atestar = useMutation({ mutationFn: () => atestarNota(id!, texto), onSuccess: async () => { await invalidar(); toast.success('Nota atestada.'); }, onError: (e) => toast.error(mensagemDeErro(e)) });
  if (!id) return null;
  const restante = n ? centavos(n.valor) - centavos(n.pago) : 0;
  const falta = { atesto: !!n && !n.cancelada_em && n.status_atesto === 'PENDENTE' && n.posso_atestar,
    pagamento: !!n && !n.cancelada_em && n.status_atesto === 'ATESTADA' && restante > 0 && pode('notas_fiscais', 'editar') };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={n ? `Nota fiscal ${n.numero}${n.serie ? `-${n.serie}` : ''}` : 'Nota fiscal'} descricao={n ? `${n.fornecedor_nome} · Contrato ${n.contrato_numero}` : undefined} largura="lg"
      rodape={n && !n.cancelada_em && pode('notas_fiscais', 'excluir') && <Botao variante="fantasma" icone={<Ban className="size-4" />} onClick={() => setCancelandoNota(true)}>Cancelar nota</Botao>}>
      {!n ? <Carregando /> : <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="numero text-xl font-semibold">{brl(n.valor)}</span>
          {n.cancelada_em ? <Selo tom="perigo">Cancelada: {n.motivo_cancelamento}</Selo> : <><SeloAtesto status={n.status_atesto} /><SeloPagamento status={n.status_pagamento as StatusPagamento} /></>}
          {n.excecao_saldo && <Selo tom="alerta">Exceção de saldo</Selo>}
          {!n.empenho_id && <Selo tom="alerta">Sem empenho</Selo>}
        </div>
        {!n.empenho_id && <VincularEmpenho nota={n} podeEditar={pode('notas_fiscais', 'editar')} aoVincular={invalidar} />}
        {(falta.atesto || falta.pagamento) && aba !== (falta.atesto ? 'atesto' : 'pagamentos') && (
          <button onClick={() => setAba(falta.atesto ? 'atesto' : 'pagamentos')} className="mb-3 flex w-full items-center gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-950 hover:bg-amber-100">
            <AlertTriangle className="size-4 shrink-0" /><span className="flex-1">{falta.atesto ? 'Esta nota aguarda o seu atesto.' : 'Nota atestada aguardando a baixa do pagamento.'}</span><span className="font-medium">{falta.atesto ? 'Atestar →' : 'Dar baixa →'}</span>
          </button>)}
        <Abas abas={[{ id: 'dados', rotulo: 'Dados' }, { id: 'atesto', rotulo: 'Atesto', alerta: falta.atesto }, { id: 'pagamentos', rotulo: 'Pagamentos', alerta: falta.pagamento }, { id: 'documentos', rotulo: 'Documentos' }]} ativa={aba} aoMudar={setAba} />
        {aba === 'dados' && <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Data da nota</dt><dd>{formatarData(n.data_emissao)}</dd></div>
          <div><dt className="text-xs text-slate-500">Incluída em</dt><dd>{formatarDataHora(n.data_inclusao)}</dd></div>
          <div><dt className="text-xs text-slate-500">Empenho</dt><dd>{n.empenho_numero ? `${n.empenho_numero}/${n.empenho_ano}` : <span className="font-medium text-amber-700">Sem empenho</span>}</dd></div>
          <div><dt className="text-xs text-slate-500">Processo</dt><dd>{n.processo_administrativo ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Meses de referência</dt><dd>{n.meses_referencia}</dd></div>
          <div><dt className="text-xs text-slate-500">Período</dt><dd>{n.periodo_inicio ? `${formatarData(n.periodo_inicio)} a ${formatarData(n.periodo_fim)}` : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Tipo de serviço</dt><dd>{n.tipo_servico_nome ?? '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Unidades atendidas</dt><dd>{q.data!.unidades.length ? q.data!.unidades.map((u) => `${u.nome}${u.valor != null ? ` (${brl(u.valor)})` : ''}`).join(', ') : '—'}</dd></div>
          {n.excecao_saldo && <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Justificativa da exceção de saldo</dt><dd>{n.excecao_saldo}</dd></div>}
          {n.observacoes && <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Observações</dt><dd>{n.observacoes}</dd></div>}
        </dl>}
        {aba === 'atesto' && <div className="flex flex-col gap-3">
          {!n.cancelada_em && <TextoDecreto tenantId={n.tenant_id} processoContrato={ct.data?.processo_administrativo ?? null} />}
          {q.data!.atestos.map((a) => (
            <div key={a.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="mb-1 flex items-center gap-2 font-medium text-emerald-900"><BadgeCheck className="size-4" />Atestada por {a.servidor_nome} ({PAPEL_ATESTO[a.papel] ?? a.papel.toLowerCase()}) em {formatarDataHora(a.atestado_em)}</p>
              <p className="whitespace-pre-line text-slate-800">{a.texto}</p>
              <Botao pequeno variante="fantasma" className="mt-2" icone={<ClipboardCopy className="size-4" />} onClick={() => { void navigator.clipboard.writeText(a.texto); toast.success('Texto copiado.'); }}>Copiar texto</Botao>
            </div>
          ))}
          {n.status_atesto === 'PENDENTE' && !n.cancelada_em && <>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950">Antes de atestar, confira se o que está na nota foi realmente entregue, na quantidade e na qualidade contratadas. Atestar o que não foi entregue gera responsabilidade pessoal. <Link to="/ajuda/capacitacao" className="font-medium underline">Ver a capacitação de fiscais</Link></p>
            <AreaTexto rotulo="Texto de atesto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} maxLength={5000}
              ajuda="Gerado a partir do modelo do órgão. Pode ser copiado para o processo externo." />
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" icone={<ClipboardCopy className="size-4" />} onClick={() => { void navigator.clipboard.writeText(texto); toast.success('Texto copiado.'); }}>Copiar texto</Botao>
              {n.posso_atestar
                ? <Botao destaque icone={<BadgeCheck className="size-4" />} carregando={atestar.isPending} disabled={!texto.trim()} title={texto.trim() ? undefined : 'Aguarde o texto de atesto ser gerado'} onClick={() => atestar.mutate()}>Atestar nota</Botao>
                : <p className="self-center text-xs text-slate-500">Só o gestor, o fiscal ou o suplente designado no contrato (ou quem lançou a nota, se o órgão permitir) pode atestar.</p>}
            </div>
          </>}
          {!n.cancelada_em && <div className="mt-2 border-t border-slate-200 pt-4">
            <TextoEncaminhamento numeroNota={n.serie ? `${n.numero}-${n.serie}` : n.numero} atestada={n.status_atesto === 'ATESTADA'} />
          </div>}
        </div>}
        {aba === 'pagamentos' && <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Pago <strong className="numero">{brl(n.pago)}</strong> de <span className="numero">{brl(n.valor)}</span>{restante > 0 && !n.cancelada_em && <> · falta <strong className="numero">{formatarCentavos(restante)}</strong></>}</span>
            {pode('notas_fiscais', 'editar') && !n.cancelada_em && restante > 0 && (
              n.status_atesto === 'ATESTADA'
                ? <Botao pequeno destaque icone={<Wallet className="size-4" />} onClick={() => setBaixando({ id: n.id, rotulo: `${n.numero}${n.serie ? `-${n.serie}` : ''}`, fornecedor: n.fornecedor_nome, restanteCentavos: restante })}>Dar baixa</Botao>
                : <span className="text-xs text-slate-500">O pagamento é liberado depois do atesto.</span>)}
          </div>
          {!q.data!.pagamentos.length ? <p className="text-sm text-slate-500">Nenhum pagamento registrado.</p> : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {q.data!.pagamentos.map((p) => (
              <li key={p.id} className={cx('flex items-center gap-3 px-3 py-2 text-sm', p.cancelado_em && 'opacity-50')}>
                <span className="flex-1">{formatarData(p.data_pagamento)}{p.documento ? ` · ${p.documento}` : ''}{p.observacao ? ` · ${p.observacao}` : ''}{p.cancelado_em && <> · <Selo>Cancelado: {p.motivo_cancelamento}</Selo></>}
                  {centavos(p.valor) !== centavos(p.valor_liquido) && <span className="block text-xs text-slate-500">Retido {formatarCentavos(centavos(p.valor) - centavos(p.valor_liquido))} · líquido <span className="numero">{brl(p.valor_liquido)}</span></span>}
                  {p.justificativa_ordem && <span className="block text-xs text-amber-800">Fora da ordem cronológica: {p.justificativa_ordem}</span>}</span>
                <span className="numero font-medium" title="Valor bruto">{brl(p.valor)}</span>
                {!p.cancelado_em && pode('notas_fiscais', 'excluir') && <Botao pequeno variante="fantasma" icone={<X className="size-4 text-red-600" />} aria-label="Cancelar pagamento" onClick={() => setCancelandoPag(p.id)} />}
              </li>))}
          </ul>}
        </div>}
        {aba === 'documentos' && <DocumentosEmitidosNota nota={n} />}
        {aba === 'documentos' && <div className="mb-5"><ExtratosNotas contratoId={n.contrato_id} /></div>}
        {aba === 'documentos' && <Anexos recurso="notas_fiscais" registroId={n.id} unidadeId={n.unidade_id} titulo="Nota fiscal e comprovantes" />}
      </>}
      <BaixaPagamento nota={baixando} aoFechar={() => setBaixando(null)} aoConcluir={invalidar} />
      <ConfirmarComMotivo aberto={!!cancelandoPag} aoFechar={() => setCancelandoPag(null)} titulo="Cancelar pagamento?" descricao="O pagamento sai do total pago e o status da nota é recalculado. O registro fica no histórico."
        rotuloConfirmar="Cancelar pagamento" aoConfirmar={async (m) => { await cancelarPagamento(cancelandoPag!, m); await invalidar(); toast.success('Pagamento cancelado.'); }} />
      <ConfirmarComMotivo aberto={cancelandoNota} aoFechar={() => setCancelandoNota(false)} titulo="Cancelar esta nota fiscal?"
        descricao="A nota sai do consumo do empenho e do contrato, mas continua registrada com o motivo." rotuloConfirmar="Cancelar nota"
        aoConfirmar={async (m) => { await cancelarNota(id, m); await invalidar(); toast.success('Nota cancelada.'); }} />
    </Modal>
  );
}

export function Notas() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  // o detalhe da nota começa a carregar ao passar o mouse
  const adiantarNota = (id: string) => { void qc.prefetchQuery({ queryKey: ['nota', id], queryFn: () => obterNota(id) }); };
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  type Filtro = 'TODAS' | 'ATESTO' | 'PAGAMENTO' | 'PAGAS' | 'CANCELADAS';
  const [filtro, setFiltro] = useState<Filtro>(() => (['ATESTO', 'PAGAMENTO', 'PAGAS', 'CANCELADAS'] as const).find((f) => f === params.get('filtro')) ?? 'TODAS');
  const pendencias = usePendencias();
  const podePagar = pode('notas_fiscais', 'editar');
  const [contrato, setContrato] = useState<{ id: string; rotulo: string } | null>(params.get('contrato') ? { id: params.get('contrato')!, rotulo: 'Contrato selecionado' } : null);
  const [pagina, setPagina] = useState(0);
  const [nova, setNova] = useState(false);
  const [empenhoAtalho, setEmpenhoAtalho] = useState<string | null>(null);
  // atalho vindo do contrato ou do empenho: /notas?nova=1&contrato=…&empenho=…
  useEffect(() => {
    if (params.get('nova') !== '1') return;
    setEmpenhoAtalho(params.get('empenho'));
    setNova(true);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('nova'); n.delete('empenho'); return n; }, { replace: true });
  }, [params, setParams]);
  const contratoAtalho = useQuery({ queryKey: ['contrato', contrato?.id], queryFn: () => obterContrato(contrato!.id), enabled: contrato?.rotulo === 'Contrato selecionado' });
  useEffect(() => { const c = contratoAtalho.data; if (c && contrato?.rotulo === 'Contrato selecionado') setContrato({ id: c.id, rotulo: `${c.numero} – ${c.fornecedor_nome}` }); }, [contratoAtalho.data, contrato]);
  const vendo = params.get('ver');
  useEffect(() => setPagina(0), [termo, filtro, contrato]);
  const filtros = { TODAS: {}, ATESTO: { atesto: 'PENDENTE' as const }, PAGAMENTO: { atesto: 'ATESTADA' as const, pagamento: 'PENDENTE' as const }, PAGAS: { pagamento: 'PAGO' as const }, CANCELADAS: { pagamento: 'CANCELADA' as const } }[filtro];
  const q = useQuery({
    queryKey: ['notas', orgao?.id, termo, filtro, contrato?.id, pagina],
    queryFn: () => listarNotas({ tenantId: orgao!.id, busca: termo, contratoId: contrato?.id, ...filtros, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao, placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  // ?ver=<nota> abre o detalhe; ?aba= escolhe a aba (ex.: atesto)
  const abaVendo = (params.get('aba') as 'dados' | 'atesto' | 'pagamentos' | 'documentos' | null) ?? 'dados';
  const [baixando, setBaixando] = useState<NotaParaBaixa | null>(null);
  const ver = (id: string | null, aba?: 'atesto' | 'pagamentos') => setParams((p) => {
    const n = new URLSearchParams(p);
    if (id) n.set('ver', id); else n.delete('ver');
    if (id && aba) n.set('aba', aba); else n.delete('aba');
    return n;
  });
  const linha = (n: NotaResumo) => {
    const minhaVez = !n.cancelada_em && ((n.posso_atestar && n.status_atesto === 'PENDENTE') || (podePagar && n.status_atesto === 'ATESTADA' && n.status_pagamento !== 'PAGO'));
    return (
    <li key={n.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2', minhaVez && '-mx-2 border-l-4 border-amber-400 bg-amber-50/50 px-2')}>
      <button className={cx('grid min-w-0 flex-1 gap-1 py-3 text-left sm:grid-cols-[1fr_auto] sm:items-center', n.cancelada_em && 'opacity-60')} onClick={() => ver(n.id)}
        onMouseEnter={() => adiantarNota(n.id)} onFocus={() => adiantarNota(n.id)}>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">NF {n.numero}{n.serie ? `-${n.serie}` : ''}<span className="font-normal text-slate-500">· {n.fornecedor_nome}</span>
            {n.posso_atestar && n.status_atesto === 'PENDENTE' && !n.cancelada_em && <Selo tom="alerta">Aguardando o seu atesto</Selo>}
            {podePagar && n.status_atesto === 'ATESTADA' && n.status_pagamento !== 'PAGO' && !n.cancelada_em && <Selo tom="alerta">Aguardando baixa</Selo>}</span>
          <span className="block truncate text-sm text-slate-600">Contrato {n.contrato_numero} · {n.empenho_numero ? `Empenho ${n.empenho_numero}/${n.empenho_ano}` : <span className="font-medium text-amber-700">Sem empenho</span>} · Ref. {n.meses_referencia}</span>
          <span className="block text-xs text-slate-500">Emitida em {formatarData(n.data_emissao)}{n.processo_administrativo ? ` · Proc. ${n.processo_administrativo}` : ''}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="numero text-sm font-semibold">{brl(n.valor)}</span>
          {!n.cancelada_em && <SeloAtesto status={n.status_atesto} />}<SeloPagamento status={n.status_pagamento} />
        </span>
      </button>
      {/* ação da vez em destaque; o resto só visualiza */}
      <span className="pb-3 sm:w-36 sm:pb-0 sm:text-right">
        {!n.cancelada_em && n.posso_atestar && n.status_atesto === 'PENDENTE'
          ? <BotaoAtestar rotulo={n.numero} aoClicar={() => ver(n.id, 'atesto')} />
          : !n.cancelada_em && podePagar && n.status_atesto === 'ATESTADA' && n.status_pagamento !== 'PAGO'
            ? <BotaoBaixa rotulo={n.numero} aoClicar={() => setBaixando({ id: n.id, rotulo: `${n.numero}${n.serie ? `-${n.serie}` : ''}`, fornecedor: n.fornecedor_nome, restanteCentavos: centavos(n.valor) - centavos(n.pago) })} />
            : <BotaoVisualizar rotulo={n.numero} aoClicar={() => ver(n.id)} />}
      </span>
    </li>
    );
  };
  return (
    <>
      <CabecalhoPagina titulo="Notas fiscais e execução" descricao="Registro, atesto pelo gestor/fiscal designado e pagamento. Cancelamentos ficam no histórico."
        acoes={pode('notas_fiscais', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setNova(true)}>Nova nota fiscal</Botao>} />
      <Cartao>
        <Abas abas={[{ id: 'TODAS', rotulo: 'Todas' }, { id: 'ATESTO', rotulo: 'Pendentes de atesto', alerta: pendencias.atesto }, { id: 'PAGAMENTO', rotulo: 'Pendentes de pagamento', alerta: pendencias.pagamento }, { id: 'PAGAS', rotulo: 'Pagas' }, { id: 'CANCELADAS', rotulo: 'Canceladas' }]}
          ativa={filtro} aoMudar={setFiltro} />
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_20rem] sm:items-end">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número da nota, contrato, fornecedor ou processo" rotulo="Buscar nota" />
          <SeletorContrato valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} aoMudar={(v, o) => setContrato(v && o ? { id: v, rotulo: o.rotulo } : null)} />
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          !q.data!.itens.length ? <Vazio titulo="Nenhuma nota encontrada" /> : <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>{q.data!.itens.map(linha)}</ul>}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
      <NovaNota aberto={nova} aoFechar={() => { setNova(false); setEmpenhoAtalho(null); }} contratoInicial={contrato?.id} empenhoInicial={empenhoAtalho} aoSalvar={(id) => ver(id)} />
      <DetalheNota key={vendo ?? ''} id={vendo} abaInicial={abaVendo} aoFechar={() => ver(null)} />
      <BaixaPagamento nota={baixando} aoFechar={() => setBaixando(null)} aoConcluir={async () => { await qc.invalidateQueries({ queryKey: ['notas'] }); await qc.invalidateQueries({ queryKey: ['nota'] }); await qc.invalidateQueries({ queryKey: ['fila-pagamentos'] }); }} />
    </>
  );
}
