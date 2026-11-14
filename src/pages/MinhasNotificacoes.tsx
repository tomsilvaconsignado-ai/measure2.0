// Minhas notificações: histórico completo (com filtros), preferências de PUSH por categoria e os aparelhos
// autorizados — com o passo a passo para instalar o aplicativo e ativar as notificações.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, CheckCheck, Laptop, Lock, Smartphone, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Abas } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, CaixaErro, Cartao, Carregando, Paginacao, Selecao, Vazio, cx } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import { PERIODOS, intervalo, type Periodo } from '@/lib/monitoramentoOrganizacional';
import { ativarPush, desativarPushNesteAparelho, endpointAtual, situacaoPush, type SituacaoPush } from '@/lib/push';
import {
  MODULOS_NOTIFICACAO, historicoNotificacoes, marcarMensagensLidas, meusDispositivos, minhasPreferencias, revogarDispositivo, salvarPreferencia, type Mensagem,
} from '@/services/notificacoes';

type Aba = 'notificacoes' | 'preferencias' | 'dispositivos';

export function MinhasNotificacoes() {
  const { orgao } = useSessao();
  const [aba, setAba] = useState<Aba>('notificacoes');
  if (!orgao) return <Vazio titulo="Escolha um órgão" />;
  return (
    <>
      <CabecalhoPagina titulo="Minhas notificações" descricao="Tudo o que o sistema avisou a você, o que chega por PUSH no celular ou computador e os aparelhos autorizados." />
      <AtivarPush compacto />
      <Abas<Aba> ativa={aba} aoMudar={setAba} abas={[{ id: 'notificacoes', rotulo: 'Notificações' }, { id: 'preferencias', rotulo: 'Preferências' }, { id: 'dispositivos', rotulo: 'Aparelhos e instalação' }]} />
      {aba === 'notificacoes' && <Lista tenantId={orgao.id} />}
      {aba === 'preferencias' && <Preferencias tenantId={orgao.id} />}
      {aba === 'dispositivos' && <Dispositivos />}
    </>
  );
}

function Lista({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [modulo, setModulo] = useState('');
  const [periodo, setPeriodo] = useState<Periodo | ''>('');
  const [naoLidas, setNaoLidas] = useState(false);
  const [pagina, setPagina] = useState(0);
  const por = 30;
  const faixa = periodo && periodo !== 'personalizado' ? intervalo(periodo) : null;
  const q = useQuery({
    queryKey: ['minhas-notificacoes', tenantId, modulo, periodo, naoLidas, pagina],
    queryFn: () => historicoNotificacoes({ tenantId, modulo: modulo || null, de: faixa?.de ?? null, ate: faixa?.ate ?? null, naoLidas, limite: por, offset: pagina * por }),
    placeholderData: keepPreviousData, refetchInterval: 60_000,
  });
  const atualizar = () => Promise.all([qc.invalidateQueries({ queryKey: ['minhas-notificacoes'] }), qc.invalidateQueries({ queryKey: ['mensagens'] })]);
  const abrir = async (m: Mensagem) => {
    if (!m.lida_em) { await marcarMensagensLidas(tenantId, [m.id]).catch(() => undefined); void atualizar(); }
    if (m.link) navegar(m.link);
  };
  return (
    <Cartao className="p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Selecao rotulo="Módulo" value={modulo} onChange={(e) => { setModulo(e.target.value); setPagina(0); }} className="w-44">
          <option value="">Todos</option>{Object.entries(MODULOS_NOTIFICACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Selecao>
        <Selecao rotulo="Período" value={periodo} onChange={(e) => { setPeriodo(e.target.value as Periodo | ''); setPagina(0); }} className="w-48">
          <option value="">Todo o histórico</option>{PERIODOS.filter((p) => p.id !== 'personalizado').map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </Selecao>
        <label className="mb-2 inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={naoLidas} onChange={(e) => { setNaoLidas(e.target.checked); setPagina(0); }} className="size-4 accent-marca-700" />Só não lidas</label>
        <Botao className="ml-auto" pequeno variante="secundario" icone={<CheckCheck className="size-4" />} disabled={!q.data?.nao_lidas}
          onClick={async () => { await marcarMensagensLidas(tenantId, null, modulo || null); await atualizar(); toast.success('Notificações marcadas como lidas.'); }}>
          Marcar todas como lidas{q.data?.nao_lidas ? ` (${q.data.nao_lidas})` : ''}</Botao>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />
        : !q.data?.itens.length ? <Vazio titulo="Nenhuma notificação" descricao="Quando houver movimentação nos seus contratos, no CONECTA ou no patrimônio, ela aparece aqui." />
        : <>
          <ul className="divide-y divide-slate-100">
            {q.data.itens.map((m) => (
              <li key={m.id}>
                <button onClick={() => void abrir(m)} className={cx('flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50', !m.lida_em && 'bg-marca-50/50')}>
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', m.lida_em ? 'bg-transparent' : 'bg-marca-600')} aria-label={m.lida_em ? 'Lida' : 'Não lida'} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-sm', m.lida_em ? 'text-slate-700' : 'font-semibold text-slate-900')}>{m.titulo}</span>
                    {m.descricao && <span className="block text-xs text-slate-600">{m.descricao}</span>}
                    <span className="mt-0.5 block text-xs text-slate-500">{MODULOS_NOTIFICACAO[m.modulo] ?? m.modulo}{m.contrato ? ` · Contrato nº ${m.contrato}` : ''} · {formatarDataHora(m.criado_em)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Paginacao pagina={pagina} total={q.data.total} porPagina={por} aoMudar={setPagina} />
        </>}
    </Cartao>
  );
}

function Preferencias({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['preferencias-notificacao', tenantId], queryFn: () => minhasPreferencias(tenantId) });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />;
  const grupos = [...new Set(q.data!.map((p) => p.modulo))];
  return (
    <Cartao className="p-3 sm:p-4">
      <p className="mb-4 text-sm text-slate-600">Escolha o que chega por PUSH no celular ou computador. Tudo continua registrado aqui na central, mesmo desligado. As marcadas como obrigatórias foram definidas pela administração.</p>
      <div className="flex flex-col gap-5">
        {grupos.map((g) => (
          <div key={g}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{MODULOS_NOTIFICACAO[g] ?? g}</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {q.data!.filter((p) => p.modulo === g).map((p) => (
                <li key={p.categoria} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{p.nome}{p.obrigatoria && <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600"><Lock className="size-3" />Obrigatória</span>}
                      {!p.ativa && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">Desativada pela administração</span>}</p>
                    <p className="text-xs text-slate-500">{p.descricao}</p>
                  </div>
                  <label className="inline-flex shrink-0 items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" role="switch" className="size-4 accent-marca-700" checked={p.push} disabled={p.obrigatoria || !p.ativa}
                      onChange={async (e) => {
                        try { await salvarPreferencia(p.categoria, e.target.checked); await qc.invalidateQueries({ queryKey: ['preferencias-notificacao'] }); }
                        catch (err) { toast.error(mensagemDeErro(err)); }
                      }} />
                    PUSH
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Cartao>
  );
}

function Dispositivos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meus-dispositivos'], queryFn: meusDispositivos });
  const atual = useQuery({ queryKey: ['endpoint-atual'], queryFn: endpointAtual });
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <Cartao titulo="Aparelhos que recebem PUSH">
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data?.length
          ? <p className="text-sm text-slate-500">Nenhum aparelho autorizado ainda. Use o botão "Ativar notificações neste aparelho".</p> : (
          <ul className="divide-y divide-slate-100">
            {q.data.map((d) => {
              const este = !!atual.data && atual.data.endsWith(d.endpoint_final);
              return (
                <li key={d.id} className={cx('flex items-center gap-3 py-2.5', !d.ativo && 'opacity-60')}>
                  {/Android|iPhone/.test(d.dispositivo ?? '') ? <Smartphone className="size-5 text-slate-500" /> : <Laptop className="size-5 text-slate-500" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-slate-800">{d.dispositivo ?? 'Aparelho'}{este && <span className="ml-2 rounded bg-marca-50 px-1.5 py-0.5 text-xs text-marca-700">este aparelho</span>}</p>
                    <p className="text-xs text-slate-500">Autorizado em {formatarDataHora(d.criado_em)}{d.ultimo_envio ? ` · último envio ${formatarDataHora(d.ultimo_envio)}` : ''}{!d.ativo ? ' · desativado' : ''}</p>
                  </div>
                  {d.ativo && <Botao pequeno variante="fantasma" icone={<Trash2 className="size-4" />} aria-label="Revogar este aparelho" title="Revogar"
                    onClick={async () => {
                      try {
                        if (este) await desativarPushNesteAparelho(); else await revogarDispositivo(d.id);
                        await Promise.all([qc.invalidateQueries({ queryKey: ['meus-dispositivos'] }), qc.invalidateQueries({ queryKey: ['situacao-push'] }), qc.invalidateQueries({ queryKey: ['endpoint-atual'] })]);
                        toast.success('Aparelho revogado: ele não recebe mais notificações.');
                      } catch (e) { toast.error(mensagemDeErro(e)); }
                    }} />}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
      <Cartao titulo="Como instalar e ativar">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-slate-700">
          <li><b>Android (Chrome, Edge, Samsung):</b> abra o MEASURE, toque no menu ⋮ e em <i>Instalar aplicativo</i> ou <i>Adicionar à tela inicial</i>. Depois toque em "Ativar notificações" e permita.</li>
          <li><b>iPhone e iPad (iOS 16.4 ou mais novo):</b> abra no Safari, toque em Compartilhar e em <i>Adicionar à Tela de Início</i>. Abra o MEASURE pelo ícone criado e só então ative as notificações. Pelo Safari comum o iPhone não recebe PUSH.</li>
          <li><b>Windows e macOS (Chrome ou Edge):</b> clique no ícone de instalar na barra de endereço (ou menu › <i>Instalar MEASURE</i>) e ative as notificações. Também funciona sem instalar, com o navegador aberto em segundo plano.</li>
          <li>Se recusou o pedido sem querer, libere em <i>Configurações do site › Notificações</i> no navegador e ative de novo aqui.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">Na tela bloqueada aparece só um resumo. O conteúdo completo abre depois do login, e o sistema confere de novo se você ainda tem acesso.</p>
      </Cartao>
    </div>
  );
}

const TEXTO: Record<SituacaoPush, { icone: ReactNode; texto: string }> = {
  ativo: { icone: <BellRing className="size-5 text-emerald-700" />, texto: 'Este aparelho recebe notificações PUSH.' },
  desativado: { icone: <Bell className="size-5 text-marca-700" />, texto: 'Receba os avisos dos seus contratos e do CONECTA no celular ou computador, mesmo com o sistema fechado.' },
  bloqueado: { icone: <BellOff className="size-5 text-amber-700" />, texto: 'As notificações estão bloqueadas para este site no navegador. Libere em Configurações do site › Notificações.' },
  ios_instalar: { icone: <Smartphone className="size-5 text-marca-700" />, texto: 'No iPhone/iPad, adicione o MEASURE à Tela de Início (Compartilhar › Adicionar à Tela de Início) e abra por lá para ativar.' },
  sem_suporte: { icone: <BellOff className="size-5 text-slate-500" />, texto: 'Este navegador não recebe notificações PUSH. Use Chrome, Edge, Firefox ou o aplicativo instalado.' },
  inseguro: { icone: <BellOff className="size-5 text-slate-500" />, texto: 'Notificações PUSH exigem conexão segura (HTTPS).' },
};

/** Faixa para ativar o PUSH neste aparelho (também usada no início) */
export function AtivarPush({ compacto }: { compacto?: boolean }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const s = useQuery({ queryKey: ['situacao-push'], queryFn: situacaoPush });
  if (!s.data || (compacto === false && s.data === 'ativo')) return null;
  const t = TEXTO[s.data];
  return (
    <div className={cx('mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3', s.data === 'ativo' ? 'border-emerald-200 bg-emerald-50/60' : 'border-marca-200 bg-marca-50/60')}>
      {t.icone}
      <p className="min-w-0 flex-1 text-sm text-slate-700">{t.texto}</p>
      {s.data === 'desativado' && <Botao pequeno carregando={ocupado} onClick={async () => {
        setOcupado(true);
        try { await ativarPush(); toast.success('Pronto! Este aparelho vai receber as notificações.'); }
        catch (e) { toast.error(mensagemDeErro(e)); }
        finally {
          setOcupado(false);
          await Promise.all([qc.invalidateQueries({ queryKey: ['situacao-push'] }), qc.invalidateQueries({ queryKey: ['meus-dispositivos'] }), qc.invalidateQueries({ queryKey: ['endpoint-atual'] })]);
        }
      }}>Ativar notificações neste aparelho</Botao>}
      {s.data === 'ativo' && <Botao pequeno variante="secundario" onClick={async () => {
        await desativarPushNesteAparelho().catch((e) => toast.error(mensagemDeErro(e)));
        await Promise.all([qc.invalidateQueries({ queryKey: ['situacao-push'] }), qc.invalidateQueries({ queryKey: ['meus-dispositivos'] }), qc.invalidateQueries({ queryKey: ['endpoint-atual'] })]);
      }}>Desativar neste aparelho</Botao>}
    </div>
  );
}
