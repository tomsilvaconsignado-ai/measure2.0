import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, ArrowLeft, Briefcase, Check, CheckCircle2, ClipboardCheck, FileDown, FilePlus2, Pencil, Plus, Power, RefreshCw, Repeat, UserMinus, UserRoundCog, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { CadastradoPor, useAutoria } from '@/lib/autoria';
import { Anexos } from '@/components/Anexos';
import { Abas } from '@/components/ui/Abas';
import { BarraUso, CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, centavos, decimalDeCentavos, formatarData, formatarDataHora } from '@/lib/formatacao';
import type { Aditivo, ContratoResumo, Designacao } from '@/lib/tipos';
import { FotoServidor } from '@/pages/cadastros/Servidores';
import {
  autoriaDoContrato, decidirAditivo, definirStatusContrato, designar, emitirExtrato, encerrarDesignacao, listarAditivos, listarDesignacoes,
  listarEmitidos, substituirDesignacao, listarEmpenhos, listarNotas, modalidades, obterContrato, renovarContrato, salvarAditivo,
} from '@/services/execucao';
import { AvisoVencido, SeletorServidor, SeloAtesto, SeloPagamento, SeloSituacao, documentoFornecedor } from './comum';
import { FormContrato } from './Contratos';
import { DotacoesContrato } from './DotacoesContrato';
import { EtapasContrato } from './EtapasContrato';
import { ExtratosNotas } from './ExtratosNotas';
import { NotificacoesDoContrato } from './notificacoes/comum';

type Aba = 'resumo' | 'responsaveis' | 'dotacao' | 'aditivos' | 'empenhos' | 'notas' | 'documentos' | 'notificacoes';
const PAPEIS = { GESTOR: 'Gestor do contrato', FISCAL: 'Fiscal do contrato', SUPLENTE: 'Suplente de fiscal' } as const;
type PapelDesignacao = keyof typeof PAPEIS;
const ORDEM_PAPEIS: PapelDesignacao[] = ['GESTOR', 'FISCAL', 'SUPLENTE'];
// Cada papel com cor e ícone próprios, para ficar claro quem é gestor, fiscal e suplente de fiscal
const INFO_PAPEL: Record<PapelDesignacao, { descricao: string; icone: typeof Briefcase; cabecalho: string; selo: string; cartao: string; marcado: string }> = {
  GESTOR: { descricao: 'Coordena e acompanha a execução do contrato como um todo.', icone: Briefcase,
    cabecalho: 'border-sky-600 text-sky-800', selo: 'bg-sky-600 text-white', cartao: 'border-l-sky-600', marcado: 'border-sky-600 bg-sky-50 ring-1 ring-sky-600' },
  FISCAL: { descricao: 'Fiscaliza a execução no dia a dia e atesta as notas fiscais.', icone: ClipboardCheck,
    cabecalho: 'border-emerald-600 text-emerald-800', selo: 'bg-emerald-600 text-white', cartao: 'border-l-emerald-600', marcado: 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600' },
  SUPLENTE: { descricao: 'Substitui o fiscal nas ausências e impedimentos.', icone: UserRoundCog,
    cabecalho: 'border-amber-500 text-amber-800', selo: 'bg-amber-500 text-white', cartao: 'border-l-amber-500', marcado: 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' },
};
const TIPOS_ADITIVO = { PRAZO: 'Prazo', VALOR: 'Valor (acréscimo)', PRAZO_E_VALOR: 'Prazo e valor', SUPRESSAO: 'Supressão de valor', OUTRO: 'Outro' } as const;
const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });

/** Destaque do contrato: número, fornecedor e os três valores que importam (global, usado e saldo) */
function DestaqueContrato({ c }: { c: ContratoResumo }) {
  const total = centavos(c.valor_atual);
  const usado = centavos(c.notas_valor);
  const saldo = centavos(c.saldo);
  const pct = total > 0 ? (usado / total) * 100 : 0;
  const pctTexto = `${pct.toFixed(1).replace('.', ',')}%`;
  // situação do saldo: sempre com ícone e texto, nunca só pela cor
  const estado = saldo < 0 ? { icone: AlertOctagon, texto: 'Saldo negativo: as notas passam do valor do contrato', faixa: 'border-red-600', icor: 'text-red-600', barra: 'bg-red-600' }
    : pct >= 85 ? { icone: AlertTriangle, texto: 'Saldo baixo: mais de 85% do contrato já foi usado', faixa: 'border-amber-500', icor: 'text-amber-600', barra: 'bg-amber-500' }
      : { icone: CheckCircle2, texto: 'Saldo disponível', faixa: 'border-emerald-600', icor: 'text-emerald-600', barra: 'bg-marca-600' };
  const IconeEstado = estado.icone;
  const temAditivo = centavos(c.aditivos_valor) !== 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Contrato</p>
          <p className="numero text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{c.numero}</p>
          <p className="mt-1 text-xs text-slate-600">Vigência {formatarData(c.data_inicio)} a {formatarData(c.data_fim_atual)}</p>
        </div>
        <div className="min-w-0 flex-1 sm:max-w-md sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fornecedor</p>
          <p className="text-lg font-semibold leading-snug text-slate-900">{c.fornecedor_nome}</p>
          <p className="numero text-xs text-slate-600">{documentoFornecedor(c)}</p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor global</dt>
          <dd className="numero mt-1 text-2xl font-bold text-slate-900">{brl(c.valor_atual)}</dd>
          <dd className="mt-1 text-xs text-slate-500">{temAditivo ? `Original ${brl(c.valor_global)} + aditivos ${brl(c.aditivos_valor)}` : 'Sem aditivo de valor'}</dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor usado</dt>
          <dd className="numero mt-1 text-2xl font-bold text-slate-900">{brl(c.notas_valor)}</dd>
          <dd className="mt-1 text-xs text-slate-500"><span className="numero">{pctTexto}</span> do valor global · notas fiscais não canceladas</dd>
        </div>
        <div className={cx('rounded-xl border border-l-4 border-slate-200 bg-white p-4', estado.faixa)}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo do contrato</dt>
          <dd className="numero mt-1 text-2xl font-bold text-slate-900">{brl(c.saldo)}</dd>
          <dd className="mt-1 flex items-start gap-1 text-xs text-slate-600"><IconeEstado className={cx('mt-px size-3.5 shrink-0', estado.icor)} aria-hidden />{estado.texto}</dd>
        </div>
      </dl>

      <div>
        <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-slate-600">
          <span>Uso do contrato</span>
          <span className="numero">{brl(c.notas_valor)} de {brl(c.valor_atual)} ({pctTexto})</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(Math.min(pct, 100))} aria-valuemin={0} aria-valuemax={100}
          aria-label={`Uso do contrato: ${pctTexto}`}>
          <div className={cx('h-full rounded-full', estado.barra)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      </div>
    </div>
  );
}

function Resumo({ c }: { c: ContratoResumo }) {
  const mods = useQuery({ queryKey: ['modalidades'], queryFn: modalidades, staleTime: Infinity });
  const item = (r: string, v: React.ReactNode) => <div><dt className="text-xs text-slate-500">{r}</dt><dd className="text-sm text-slate-900">{v || '—'}</dd></div>;
  const total = centavos(c.valor_atual);
  return (
    <div className="flex flex-col gap-6">
    <DestaqueContrato c={c} />
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{item('Objeto', <span className="whitespace-pre-line">{c.objeto}</span>)}</div>
        {item('Modalidade', mods.data?.find((m) => m.codigo === c.modalidade)?.nome ?? c.modalidade)}
        {item('Processo administrativo', c.processo_administrativo)}{item('Pregão / licitação', c.numero_licitacao)}
        {item('Vigência', <>{formatarData(c.data_inicio)} a {formatarData(c.data_fim_atual)}{c.data_fim_atual !== c.data_fim && <span className="block text-xs text-slate-500">original: {formatarData(c.data_fim)}</span>}</>)}
        {item('Unidade responsável', `${c.unidade_nome}${c.unidade_sigla ? ` (${c.unidade_sigla})` : ''}`)}
        {c.numero_renovacao > 0 && item('Renovação', `${c.numero_renovacao}ª renovação`)}
        {c.observacoes && <div className="sm:col-span-2">{item('Observações', c.observacoes)}</div>}
      </dl>
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">Execução financeira (detalhe)</p>
        {[['Valor global (original)', c.valor_global], ['Aditivos aprovados', c.aditivos_valor], ['Valor atual', c.valor_atual], ['Empenhado', c.empenhado],
          ['Notas fiscais (usado)', c.notas_valor], ['Pago', c.pago], ['Saldo do contrato', c.saldo]].map(([r, v]) => (
          <div key={r as string} className={cx('flex justify-between text-sm', r === 'Saldo do contrato' && 'border-t border-slate-200 pt-2 font-semibold')}>
            <span className="text-slate-600">{r}</span><span className="numero">{brl(v as string)}</span>
          </div>
        ))}
        <BarraUso usado={centavos(c.empenhado)} total={total} rotulo="Empenhado" />
        <p className="text-xs text-slate-500">"Usado" = notas fiscais registradas e não canceladas. Empenho, nota e pagamento não são somados entre si.</p>
      </div>
    </div>
    </div>
  );
}

function Responsaveis({ c }: { c: ContratoResumo }) {
  const { pode, ehPlataforma } = useSessao();
  const podeAlterar = useAutoria();
  const autoria = useQuery({ queryKey: ['autoria-contrato', c.id], queryFn: () => autoriaDoContrato(c.id) });
  const qc = useQueryClient();
  const [historico, setHistorico] = useState(false);
  const q = useQuery({ queryKey: ['designacoes', c.id, historico], queryFn: () => listarDesignacoes(c.id, historico) });
  const [novo, setNovo] = useState<{ papel: Designacao['papel']; servidor: { id: string; rotulo: string } | null; inicio: string; portaria: string } | null>(null);
  const [encerrando, setEncerrando] = useState<Designacao | null>(null);
  const [trocando, setTrocando] = useState<{ d: Designacao; servidor: { id: string; rotulo: string } | null; inicio: string; portaria: string; motivo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // a plataforma (desenvolvedor) também designa, encerra e substitui responsáveis (regra no banco: pode_designar)
  const podeEditar = pode('contratos', 'editar') || ehPlataforma;
  const salvar = useMutation({
    mutationFn: () => designar(c.id, novo!.servidor!.id, novo!.papel, novo!.inicio, novo!.portaria.trim() || null),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['designacoes', c.id] }); setNovo(null); toast.success('Designação registrada. A pessoa já vê este contrato.'); },
    onError: (e) => setErro(/designacoes_ativa_unica/.test((e as Error).message ?? '') ? 'Esta pessoa já está designada nesse papel.' : mensagemDeErro(e)),
  });
  const substituir = useMutation({
    mutationFn: () => substituirDesignacao(trocando!.d.id, trocando!.servidor!.id, trocando!.inicio, trocando!.portaria.trim() || null, trocando!.motivo.trim()),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['designacoes', c.id] }); await qc.invalidateQueries({ queryKey: ['autoria-contrato', c.id] }); setTrocando(null); toast.success('Responsável substituído. O anterior deixou de ver o contrato (se não tiver outra designação nele) e o histórico foi mantido.'); },
    onError: (e) => setErro(/designacoes_ativa_unica/.test((e as Error).message ?? '') ? 'Esta pessoa já está designada nesse papel.' : mensagemDeErro(e)),
  });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Responsáveis {historico ? '(inclui encerrados)' : 'atuais'}</h3>
          <div className="flex gap-2">
            <Botao pequeno variante="fantasma" onClick={() => setHistorico((h) => !h)}>{historico ? 'Só os atuais' : 'Ver histórico'}</Botao>
            {podeEditar && <Botao pequeno variante="secundario" icone={<Plus className="size-4" />} onClick={() => { setErro(null); setNovo({ papel: 'GESTOR', servidor: null, inicio: hoje(), portaria: '' }); }}>Designar</Botao>}
          </div>
        </div>
        {q.isLoading ? <Carregando /> : (
          <div className="grid gap-4 lg:grid-cols-3">
            {ORDEM_PAPEIS.map((papel) => {
              const info = INFO_PAPEL[papel];
              const Icone = info.icone;
              const lista = (q.data ?? []).filter((d) => d.papel === papel);
              return (
                <section key={papel} aria-label={PAPEIS[papel]} className="flex flex-col gap-3">
                  <header className={cx('flex items-center gap-2 border-b-2 pb-2', info.cabecalho)}>
                    <span className={cx('grid size-7 place-items-center rounded-full', info.selo)}><Icone className="size-4" aria-hidden /></span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold uppercase tracking-wide">{PAPEIS[papel]}</h4>
                      <p className="text-xs font-normal text-slate-500">{info.descricao}</p>
                    </div>
                  </header>
                  {!lista.length ? (
                    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                      <p className="text-sm text-slate-500">Não designado</p>
                      {podeEditar && !historico && <Botao pequeno variante="secundario" icone={<Plus className="size-4" />}
                        onClick={() => { setErro(null); setNovo({ papel, servidor: null, inicio: hoje(), portaria: '' }); }}>
                        Designar {papel === 'SUPLENTE' ? 'suplente de fiscal' : papel === 'GESTOR' ? 'gestor' : 'fiscal'}</Botao>}
                    </div>
                  ) : (
          <ul className="flex flex-col gap-3">
            {lista.map((d) => (
              <li key={d.id} className={cx('flex items-start gap-3 rounded-xl border border-l-4 p-3', info.cartao, d.fim ? 'border-slate-200 opacity-60' : 'border-slate-200 bg-white')}>
                <FotoServidor caminho={null} nome={d.servidor_nome} />
                <div className="min-w-0 flex-1">
                  <span className={cx('inline-block rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide', info.selo)}>{PAPEIS[d.papel]}</span>
                  <p className="mt-1 truncate text-sm font-medium text-slate-900">{d.servidor_nome}</p>
                  <p className="text-xs text-slate-500">Mat. {d.servidor_matricula}{d.servidor_cargo ? ` · ${d.servidor_cargo}` : ''}</p>
                  <p className="text-xs text-slate-500" title="Lotação do servidor no momento da designação (a lotação dele não muda)">Lotação: {d.lotacao_descricao ?? d.unidade_sigla ?? d.unidade_nome}</p>
                  <p className="text-xs text-slate-500">Desde {formatarData(d.inicio)}{d.fim ? ` até ${formatarData(d.fim)}` : ''}</p>
                  {d.portaria && <p className="text-xs text-slate-500">{d.portaria}</p>}
                  {d.substitui_nome && <p className="text-xs text-slate-500">Substituiu {d.substitui_nome}</p>}
                  {d.fim && <p className="text-xs text-slate-500">{d.substituido_por_nome ? `Substituído(a) por ${d.substituido_por_nome}` : 'Encerrada'}{d.motivo_fim ? ` · ${d.motivo_fim}` : ''}{d.encerrado_por ? ` · por ${d.encerrado_por}` : ''}</p>}
                  <p className="text-xs text-slate-500">Designado{d.designado_por ? ` por ${d.designado_por}` : ''} em {formatarDataHora(d.designado_em)}</p>
                  {!d.tem_acesso && !d.fim && <p className="mt-1 text-xs text-amber-700">Sem acesso ao sistema: convide a pessoa com o e-mail institucional do cadastro.</p>}
                </div>
                {podeEditar && !d.fim && podeAlterar('contratos', autoria.data?.designacoes[d.id]) && <div className="flex flex-col">
                  <Botao pequeno variante="fantasma" icone={<Repeat className="size-4" />} aria-label={`Substituir ${d.servidor_nome}`} title="Substituir por outro servidor"
                    onClick={() => { setErro(null); setTrocando({ d, servidor: null, inicio: hoje(), portaria: '', motivo: '' }); }} />
                  <Botao pequeno variante="fantasma" icone={<UserMinus className="size-4" />} aria-label={`Encerrar designação de ${d.servidor_nome}`} title="Encerrar designação" onClick={() => setEncerrando(d)} />
                </div>}
              </li>
            ))}
          </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="PORTARIA_GESTOR" titulo="Portaria de gestor" vazio="Nenhuma portaria anexada." />
        <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="PORTARIA_FISCAL" titulo="Portaria de fiscal" vazio="Nenhuma portaria anexada." />
        <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="PORTARIA_SUPLENTE" titulo="Portaria de suplente" vazio="Nenhuma portaria anexada." />
      </div>
      <Modal aberto={!!novo} aoFechar={() => setNovo(null)} titulo={novo ? `Designar ${PAPEIS[novo.papel].toLowerCase()}` : 'Designar responsável'}
        descricao="Qualquer servidor ativo do órgão, de qualquer secretaria, diretoria ou coordenação. A pessoa passa a ver só este contrato e pode atestar as notas dele; a lotação dela não muda."
        rodape={<><Botao variante="secundario" onClick={() => setNovo(null)}>Cancelar</Botao><Botao carregando={salvar.isPending} disabled={!novo?.servidor} onClick={() => salvar.mutate()}>{novo ? `Designar como ${PAPEIS[novo.papel].toLowerCase()}` : 'Designar'}</Botao></>}>
        {novo && <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-800">Função no contrato <span className="text-red-600">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {ORDEM_PAPEIS.map((papel) => {
                const info = INFO_PAPEL[papel];
                const Icone = info.icone;
                const marcado = novo.papel === papel;
                return (
                  <label key={papel} className={cx('flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors', marcado ? info.marcado : 'border-slate-200 hover:border-slate-400')}>
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                      <input type="radio" name="papel-designacao" className="sr-only" checked={marcado} onChange={() => setNovo({ ...novo, papel })} />
                      <span className={cx('grid size-6 place-items-center rounded-full', info.selo)}><Icone className="size-3.5" aria-hidden /></span>
                      {PAPEIS[papel]}
                    </span>
                    <span className="text-xs text-slate-600">{info.descricao}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <SeletorServidor rotulo="Servidor" obrigatorio valor={novo.servidor?.id ?? null} rotuloValor={novo.servidor?.rotulo}
            aoMudar={(v, o) => setNovo({ ...novo, servidor: v && o ? { id: v, rotulo: o.rotulo } : null })} />
          <Campo rotulo="Início da designação" type="date" value={novo.inicio} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} />
          <Campo rotulo="Portaria" value={novo.portaria} onChange={(e) => setNovo({ ...novo, portaria: e.target.value })} placeholder="Portaria nº 123/2026" maxLength={120} />
          {erro && <CaixaErro mensagem={erro} />}
        </div>}
      </Modal>
      <Modal aberto={!!trocando} aoFechar={() => setTrocando(null)} titulo={`Substituir ${trocando ? PAPEIS[trocando.d.papel].toLowerCase() : ''}`}
        descricao={`${trocando?.d.servidor_nome ?? ''} deixa a função (o histórico é mantido) e o novo responsável passa a ver o contrato.`}
        rodape={<><Botao variante="secundario" onClick={() => setTrocando(null)}>Cancelar</Botao><Botao carregando={substituir.isPending} disabled={!trocando?.servidor || (trocando?.motivo.trim().length ?? 0) < 5} onClick={() => substituir.mutate()}>Substituir</Botao></>}>
        {trocando && <div className="flex flex-col gap-4">
          <SeletorServidor rotulo="Novo responsável" obrigatorio valor={trocando.servidor?.id ?? null} rotuloValor={trocando.servidor?.rotulo}
            aoMudar={(v, o) => setTrocando({ ...trocando, servidor: v && o ? { id: v, rotulo: o.rotulo } : null })} />
          <Campo rotulo="A partir de" type="date" value={trocando.inicio} onChange={(e) => setTrocando({ ...trocando, inicio: e.target.value })} />
          <Campo rotulo="Portaria do novo responsável" value={trocando.portaria} onChange={(e) => setTrocando({ ...trocando, portaria: e.target.value })} placeholder="Portaria nº 123/2026" maxLength={120} />
          <AreaTexto rotulo="Motivo da substituição" obrigatorio value={trocando.motivo} onChange={(e) => setTrocando({ ...trocando, motivo: e.target.value })} rows={2} maxLength={500} />
          {erro && <CaixaErro mensagem={erro} />}
        </div>}
      </Modal>
      <ConfirmarComMotivo aberto={!!encerrando} aoFechar={() => setEncerrando(null)} titulo={`Encerrar a designação de ${encerrando?.servidor_nome ?? ''}?`}
        descricao="A pessoa deixa de ver o contrato e não atesta mais. O histórico e os documentos já emitidos continuam com o nome dela."
        rotuloConfirmar="Encerrar" aoConfirmar={async (m) => { await encerrarDesignacao(encerrando!.id, hoje(), m); await qc.invalidateQueries({ queryKey: ['designacoes', c.id] }); toast.success('Designação encerrada.'); }} />
    </div>
  );
}

function Aditivos({ c }: { c: ContratoResumo }) {
  const { pode } = useSessao();
  const podeAlterar = useAutoria();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const q = useQuery({ queryKey: ['aditivos', c.id], queryFn: () => listarAditivos(c.id) });
  const [form, setForm] = useState<{ id?: string; numero: string; tipo: Aditivo['tipo']; data_assinatura: string; nova_data_fim: string; valor: number | null; descricao: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState<Aditivo | null>(null);
  const [renovar, setRenovar] = useState<{ numero: string; inicio: string; fim: string; valor: number | null } | null>(null);
  const invalidar = async () => { await qc.invalidateQueries({ queryKey: ['aditivos', c.id] }); await qc.invalidateQueries({ queryKey: ['contrato', c.id] }); await qc.invalidateQueries({ queryKey: ['contratos'] }); };
  const salvar = useMutation({
    mutationFn: () => salvarAditivo(form!.id ?? null, {
      ...(form!.id ? {} : { contrato_id: c.id }), numero: form!.numero.trim(), tipo: form!.tipo, data_assinatura: form!.data_assinatura || null,
      nova_data_fim: ['PRAZO', 'PRAZO_E_VALOR'].includes(form!.tipo) ? form!.nova_data_fim || null : null,
      valor: ['VALOR', 'PRAZO_E_VALOR', 'SUPRESSAO'].includes(form!.tipo) ? decimalDeCentavos(form!.tipo === 'SUPRESSAO' ? -Math.abs(form!.valor ?? 0) : form!.valor ?? 0) : '0',
      descricao: form!.descricao.trim(),
    }),
    onSuccess: async () => { await invalidar(); setForm(null); toast.success('Aditivo salvo como rascunho. Falta a aprovação.'); },
    onError: (e) => setErro(/aditivos_numero_unico/.test((e as Error).message ?? '') ? 'Já existe aditivo com este número.' : traduzirErro(e).mensagem),
  });
  const aprovar = useMutation({ mutationFn: (a: Aditivo) => decidirAditivo(a.id, true, ''), onSuccess: async () => { await invalidar(); toast.success('Aditivo aprovado: vigência e valor do contrato atualizados.'); }, onError: (e) => toast.error(mensagemDeErro(e)) });
  const renovacao = useMutation({
    mutationFn: () => renovarContrato(c.id, renovar!.numero.trim(), renovar!.inicio, renovar!.fim, decimalDeCentavos(renovar!.valor ?? 0)),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['contratos'] }); setRenovar(null); toast.success('Novo contrato criado a partir deste. O anterior fica como histórico.'); navegar(`/contratos/${id}`); },
    onError: (e) => setErro(/contratos_numero_unico/.test((e as Error).message ?? '') ? 'Já existe contrato com este número.' : traduzirErro(e).mensagem),
  });
  const amanha = new Date(new Date(c.data_fim_atual + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        {pode('contratos', 'criar') && <Botao pequeno variante="secundario" icone={<RefreshCw className="size-4" />} onClick={() => { setErro(null); setRenovar({ numero: '', inicio: amanha, fim: '', valor: centavos(c.valor_atual) }); }}>Renovar como novo contrato</Botao>}
        {pode('contratos', 'editar') && <Botao pequeno icone={<FilePlus2 className="size-4" />} onClick={() => { setErro(null); setForm({ numero: `${(q.data?.length ?? 0) + 1}º Termo Aditivo`, tipo: 'PRAZO', data_assinatura: '', nova_data_fim: '', valor: null, descricao: '' }); }}>Novo aditivo</Botao>}
      </div>
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio titulo="Nenhum aditivo" descricao="Prorrogações, acréscimos e supressões ficam registrados aqui, sem apagar os dados originais do contrato." /> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {q.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  {a.numero} <Selo>{TIPOS_ADITIVO[a.tipo]}</Selo>
                  {a.status === 'APROVADO' ? <Selo tom="sucesso">Aprovado</Selo> : a.status === 'REJEITADO' ? <Selo tom="perigo">Rejeitado</Selo> : <Selo tom="alerta">Rascunho – aguardando aprovação</Selo>}
                </p>
                <p className="text-sm text-slate-600">{a.descricao}</p>
                <p className="text-xs text-slate-500">
                  {a.nova_data_fim && <>Nova vigência até {formatarData(a.nova_data_fim)} · </>}
                  {centavos(a.valor) !== 0 && <>{centavos(a.valor) > 0 ? 'Acréscimo' : 'Supressão'} de {brl(Math.abs(Number(a.valor)))} · </>}
                  {a.data_assinatura ? `assinado em ${formatarData(a.data_assinatura)}` : 'sem data de assinatura'}
                  {a.decidido_em && ` · decidido em ${formatarDataHora(a.decidido_em)}`}{a.motivo_decisao && ` (${a.motivo_decisao})`}
                </p>
              </div>
              {a.status === 'RASCUNHO' && <div className="flex gap-1">
                {pode('contratos', 'editar') && podeAlterar('contratos', a.criado_por) && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar aditivo"
                  onClick={() => { setErro(null); setForm({ id: a.id, numero: a.numero, tipo: a.tipo, data_assinatura: a.data_assinatura ?? '', nova_data_fim: a.nova_data_fim ?? '', valor: Math.abs(centavos(a.valor)) || null, descricao: a.descricao }); }} />}
                {pode('contratos', 'aprovar') && <>
                  <Botao pequeno variante="secundario" icone={<Check className="size-4 text-emerald-700" />} carregando={aprovar.isPending} onClick={() => aprovar.mutate(a)}>Aprovar</Botao>
                  <Botao pequeno variante="fantasma" icone={<X className="size-4 text-red-600" />} onClick={() => setRejeitando(a)}>Rejeitar</Botao>
                </>}
              </div>}
            </li>
          ))}
        </ul>
      )}
      <Modal aberto={!!form} aoFechar={() => setForm(null)} titulo={form?.id ? 'Editar aditivo' : 'Novo aditivo'}
        rodape={<><Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao><Botao carregando={salvar.isPending} onClick={() => salvar.mutate()}>Salvar rascunho</Botao></>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Número" obrigatorio value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} maxLength={60} />
          <Selecao rotulo="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Aditivo['tipo'] })}>
            {Object.entries(TIPOS_ADITIVO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          {['PRAZO', 'PRAZO_E_VALOR'].includes(form.tipo) && <Campo rotulo="Nova data final" type="date" obrigatorio value={form.nova_data_fim} onChange={(e) => setForm({ ...form, nova_data_fim: e.target.value })} ajuda={`Vigência atual até ${formatarData(c.data_fim_atual)}.`} />}
          {['VALOR', 'PRAZO_E_VALOR', 'SUPRESSAO'].includes(form.tipo) && <CampoMoeda rotulo={form.tipo === 'SUPRESSAO' ? 'Valor suprimido' : 'Valor acrescido'} obrigatorio centavos={form.valor} aoMudar={(v) => setForm({ ...form, valor: v })} />}
          <Campo rotulo="Data de assinatura" type="date" value={form.data_assinatura} onChange={(e) => setForm({ ...form, data_assinatura: e.target.value })} />
          <AreaTexto className="sm:col-span-2" rotulo="Descrição / justificativa" obrigatorio value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} maxLength={2000} />
          {erro && <div className="sm:col-span-2"><CaixaErro mensagem={erro} /></div>}
        </div>}
      </Modal>
      <Modal aberto={!!renovar} aoFechar={() => setRenovar(null)} titulo="Renovar como novo contrato"
        descricao="Cria um contrato novo com fornecedor, objeto, unidade, dotações e responsáveis atuais. Este contrato continua guardado como histórico."
        rodape={<><Botao variante="secundario" onClick={() => setRenovar(null)}>Cancelar</Botao><Botao carregando={renovacao.isPending} disabled={!renovar?.numero.trim() || !renovar?.fim || !renovar?.valor} onClick={() => renovacao.mutate()}>Criar contrato</Botao></>}>
        {renovar && <div className="grid gap-4 sm:grid-cols-2">
          <Campo className="sm:col-span-2" rotulo="Número do novo contrato" obrigatorio value={renovar.numero} onChange={(e) => setRenovar({ ...renovar, numero: e.target.value })} maxLength={40} />
          <Campo rotulo="Início" type="date" value={renovar.inicio} onChange={(e) => setRenovar({ ...renovar, inicio: e.target.value })} />
          <Campo rotulo="Fim" type="date" obrigatorio value={renovar.fim} onChange={(e) => setRenovar({ ...renovar, fim: e.target.value })} />
          <CampoMoeda className="sm:col-span-2" rotulo="Valor global do novo contrato" obrigatorio centavos={renovar.valor} aoMudar={(v) => setRenovar({ ...renovar, valor: v })} />
          {erro && <div className="sm:col-span-2"><CaixaErro mensagem={erro} /></div>}
        </div>}
      </Modal>
      <ConfirmarComMotivo aberto={!!rejeitando} aoFechar={() => setRejeitando(null)} titulo={`Rejeitar ${rejeitando?.numero ?? ''}?`}
        descricao="O aditivo fica registrado como rejeitado e não altera o contrato." rotuloConfirmar="Rejeitar"
        aoConfirmar={async (m) => { await decidirAditivo(rejeitando!.id, false, m); await invalidar(); toast.success('Aditivo rejeitado.'); }} />
    </div>
  );
}

function ListaEmpenhos({ c }: { c: ContratoResumo }) {
  const { orgao } = useSessao();
  const q = useQuery({ queryKey: ['empenhos', orgao?.id, 'contrato', c.id], queryFn: () => listarEmpenhos({ tenantId: orgao!.id, contratoId: c.id, situacao: 'TODOS', limite: 100, offset: 0 }) });
  if (q.isLoading) return <Carregando />;
  return !q.data?.itens.length ? <Vazio titulo="Nenhum empenho" descricao="Os empenhos são lançados em Empenhos, escolhendo este contrato." acao={<Link to={`/empenhos?contrato=${c.id}`} className="text-sm text-marca-700 hover:underline">Ir para Empenhos</Link>} /> : (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
        <th className="py-2 pr-3 font-medium">Empenho</th><th className="py-2 pr-3 font-medium">Dotação</th><th className="py-2 pr-3 text-right font-medium">Valor + reforços</th><th className="py-2 pr-3 text-right font-medium">Utilizado</th><th className="py-2 text-right font-medium">Saldo</th>
      </tr></thead>
      <tbody>{q.data.itens.map((e) => (
        <tr key={e.id} className={cx('border-b border-slate-100', !e.ativo && 'opacity-50')}>
          <td className="py-2 pr-3"><Link to={`/empenhos?ver=${e.id}`} className="font-medium text-marca-700 hover:underline">{e.numero}/{e.ano}</Link><span className="block text-xs text-slate-500">{formatarData(e.data_empenho)}</span></td>
          <td className="numero py-2 pr-3 font-mono text-xs">{e.classificacao_codigo}</td>
          <td className="numero py-2 pr-3 text-right">{brl(e.valor_total)}</td><td className="numero py-2 pr-3 text-right">{brl(e.utilizado)}</td>
          <td className={cx('numero py-2 text-right font-medium', centavos(e.saldo) < 0 && 'text-red-700')}>{brl(e.saldo)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function ListaNotas({ c }: { c: ContratoResumo }) {
  const { orgao } = useSessao();
  const q = useQuery({ queryKey: ['notas', orgao?.id, 'contrato', c.id], queryFn: () => listarNotas({ tenantId: orgao!.id, contratoId: c.id, limite: 100, offset: 0 }) });
  if (q.isLoading) return <Carregando />;
  return !q.data?.itens.length ? <Vazio titulo="Nenhuma nota fiscal" acao={<Link to={`/notas?contrato=${c.id}`} className="text-sm text-marca-700 hover:underline">Ir para Notas fiscais</Link>} /> : (
    <ul className="divide-y divide-slate-100">
      {q.data.itens.map((n) => (
        <li key={n.id} className={cx('flex flex-wrap items-center gap-2 py-2.5 text-sm', n.cancelada_em && 'opacity-50')}>
          <Link to={`/notas?ver=${n.id}`} className="font-medium text-marca-700 hover:underline">NF {n.numero}</Link>
          <span className="text-slate-500">{formatarData(n.data_emissao)} · {n.empenho_numero ? `Emp. ${n.empenho_numero}/${n.empenho_ano}` : 'Sem empenho'} · {n.meses_referencia}</span>
          <span className="numero ml-auto font-medium">{brl(n.valor)}</span>
          {!n.cancelada_em && <SeloAtesto status={n.status_atesto} />}<SeloPagamento status={n.status_pagamento} />
        </li>
      ))}
    </ul>
  );
}

function Documentos({ c }: { c: ContratoResumo }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const emitidos = useQuery({ queryKey: ['emitidos', c.id], queryFn: () => listarEmitidos(c.id) });
  const emitir = useMutation({
    mutationFn: () => emitirExtrato('contrato', c.id),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['emitidos', c.id] }); navegar(`/imprimir/${id}`); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="GERAL" titulo="Documentos do contrato" />
      <div className="flex flex-col gap-4">
        <ExtratosNotas contratoId={c.id} />
        <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Extratos emitidos</h3>
          <Botao pequeno variante="secundario" icone={<FileDown className="size-4" />} carregando={emitir.isPending} onClick={() => emitir.mutate()}>Emitir extrato</Botao>
        </div>
        {!emitidos.data?.length ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nenhum extrato emitido. Cada emissão guarda os dados do momento.</p> : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {emitidos.data.map((d) => (
              <li key={d.id}><Link to={`/imprimir/${d.id}`} className="flex justify-between px-3 py-2 text-sm hover:bg-slate-50"><span>{d.titulo}</span><span className="text-xs text-slate-500">{formatarDataHora(d.emitido_em)}</span></Link></li>
            ))}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}

export function ContratoDetalhe() {
  const { id } = useParams();
  const { pode } = useSessao();
  const podeAlterar = useAutoria();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [aba, setAba] = useState<Aba>(() => (['resumo', 'responsaveis', 'dotacao', 'aditivos', 'empenhos', 'notas', 'documentos', 'notificacoes'] as const).find((a) => a === params.get('aba')) ?? 'resumo');
  const [editando, setEditando] = useState(false);
  const [inativando, setInativando] = useState(false);
  const q = useQuery({ queryKey: ['contrato', id], queryFn: () => obterContrato(id!), enabled: !!id });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={/0 rows|PGRST116/.test((q.error as Error).message) ? 'Contrato não encontrado ou sem permissão.' : traduzirErro(q.error).mensagem} />;
  const c = q.data!;
  return (
    <>
      <Link to="/contratos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" />Contratos</Link>
      <CabecalhoPagina titulo={`Contrato ${c.numero}`}
        descricao={<span className="flex flex-wrap items-center gap-2">{c.fornecedor_nome} <SeloSituacao situacao={c.situacao} dias={c.dias_para_vencer} />{!c.ativo && <Selo tom="perigo">Inativo</Selo>}
          {c.contrato_origem_id && <Link to={`/contratos/${c.contrato_origem_id}`} className="text-xs text-marca-700 hover:underline">ver contrato anterior</Link>}</span>}
        acoes={<>
          {pode('contratos', 'editar') && podeAlterar('contratos', c.criado_por) && <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={() => setEditando(true)}>Editar</Botao>}
          {pode('contratos', 'excluir') && podeAlterar('contratos', c.criado_por) && <Botao variante="fantasma" icone={<Power className="size-4" />} onClick={() => setInativando(true)}>{c.ativo ? 'Inativar' : 'Reativar'}</Botao>}
        </>} />
      <CadastradoPor autor={c.criado_por} recurso="contratos" className="-mt-3 mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" />
      <div className="mb-4"><AvisoVencido c={c} /></div>
      <EtapasContrato c={c} abaAtual={aba} irParaAba={setAba} />
      <Cartao>
        <Abas abas={[{ id: 'resumo', rotulo: 'Resumo' }, { id: 'responsaveis', rotulo: 'Responsáveis e portarias' }, { id: 'dotacao', rotulo: 'Dotação' },
          { id: 'aditivos', rotulo: `Aditivos${c.aditivos_aprovados ? ` (${c.aditivos_aprovados})` : ''}` }, { id: 'empenhos', rotulo: 'Empenhos' }, { id: 'notas', rotulo: 'Notas fiscais' },
          { id: 'documentos', rotulo: 'Documentos e extratos' }, { id: 'notificacoes', rotulo: 'Notificações à empresa' }]} ativa={aba} aoMudar={setAba} />
        {aba === 'resumo' && <Resumo c={c} />}
        {aba === 'responsaveis' && <Responsaveis c={c} />}
        {aba === 'dotacao' && <DotacoesContrato c={c} />}
        {aba === 'aditivos' && <Aditivos c={c} />}
        {aba === 'empenhos' && <ListaEmpenhos c={c} />}
        {aba === 'notas' && <ListaNotas c={c} />}
        {aba === 'documentos' && <Documentos c={c} />}
        {aba === 'notificacoes' && <div className="flex flex-col gap-3"><div className="flex justify-end"><Link to={`/notificacoes-contratuais/nova?contrato=${c.id}`}><Botao icone={<Plus className="size-4" />}>EMITIR NOVA NOTIFICAÇÃO</Botao></Link></div><NotificacoesDoContrato contratoId={c.id} /></div>}
      </Cartao>
      <FormContrato aberto={editando} aoFechar={() => { setEditando(false); void qc.invalidateQueries({ queryKey: ['contrato', id] }); }} contrato={c} />
      <ConfirmarComMotivo aberto={inativando} aoFechar={() => setInativando(false)} perigo={c.ativo}
        titulo={c.ativo ? `Inativar o contrato ${c.numero}?` : `Reativar o contrato ${c.numero}?`}
        descricao={c.ativo ? 'Use só para cadastro feito por engano. Empenhos, notas, documentos e histórico continuam guardados e consultáveis.' : 'O contrato volta a aparecer nas listas.'}
        rotuloConfirmar={c.ativo ? 'Inativar' : 'Reativar'} minimo={c.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusContrato(c.id, !c.ativo, m); await qc.invalidateQueries({ queryKey: ['contrato', id] }); await qc.invalidateQueries({ queryKey: ['contratos'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}
