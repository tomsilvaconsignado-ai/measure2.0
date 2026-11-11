// Painel administrativo das notificações (Master do órgão e plataforma): números do envio, eventos por
// módulo, falhas com reprocessamento, histórico por servidor/contrato/período e a configuração
// (categorias ativas e obrigatórias, antecedências do vencimento e lembrete de atesto).
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, RotateCcw, Save, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Progresso } from '@/components/graficos';
import { Abas } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, Selecao, SemPermissao, Vazio, cx } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import { PERIODOS, intervalo, type Periodo } from '@/lib/monitoramentoOrganizacional';
import {
  MODULOS_NOTIFICACAO, historicoAdmin, painelNotificacoes, reprocessarFalhas, salvarConfigNotificacoes, type CategoriaConfig, type PainelNotificacoes as Dados,
} from '@/services/notificacoes';
import { SeletorContrato } from '@/pages/contratos/comum';

type Aba = 'resumo' | 'historico' | 'configuracao';

function Numero({ titulo, valor, detalhe, alerta }: { titulo: string; valor: number | string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={cx('rounded-xl border bg-white p-4', alerta ? 'border-amber-300' : 'border-slate-200')}>
      <p className="text-xs text-slate-600">{titulo}</p>
      <p className="numero mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

export function PainelNotificacoes() {
  const { orgao, ehPlataforma, vinculosDoOrgao } = useSessao();
  const permitido = ehPlataforma || vinculosDoOrgao.some((v) => v.papel === 'MASTER');
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [aba, setAba] = useState<Aba>('resumo');
  const { de, ate } = intervalo(periodo === 'personalizado' ? '30' : periodo);
  const q = useQuery({ queryKey: ['painel-notificacoes', orgao?.id, de, ate], queryFn: () => painelNotificacoes(orgao!.id, de, ate),
    enabled: !!orgao && permitido, refetchInterval: 60_000, placeholderData: keepPreviousData });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!permitido) return <SemPermissao texto="O painel de notificações é exclusivo do Master do órgão e da equipe da plataforma." />;
  const d = q.data;
  return (
    <>
      <CabecalhoPagina titulo="Painel de notificações" descricao={`${orgao.nome_curto} · central de notificações e envio PUSH para celulares e computadores.`}
        acoes={<div className="flex items-end gap-2">
          <Selecao rotulo="Período" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className="w-48">
            {PERIODOS.filter((p) => p.id !== 'personalizado').map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}</Selecao>
          <Botao variante="secundario" icone={<RefreshCw className={cx('size-4', q.isFetching && 'animate-spin')} />} onClick={() => q.refetch()} aria-label="Atualizar" />
        </div>} />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> : d && <>
        {!d.push_configurado && <CaixaErro mensagem="O envio PUSH ainda não foi configurado no servidor (chaves VAPID). As notificações ficam só na central interna." />}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero titulo="Notificações geradas" valor={d.geradas} detalhe={`${d.eventos} eventos`} />
          <Numero titulo="PUSH enviados" valor={d.push_enviados} detalhe={d.push_pendentes ? `${d.push_pendentes} na fila` : 'aceitos pelo serviço de push'} />
          <Numero titulo="Lidas" valor={d.lidas} detalhe={d.geradas ? `${Math.round((d.lidas / d.geradas) * 100)}% das geradas` : undefined} />
          <Numero titulo="Falhas de envio" valor={d.push_falhas} detalhe={`${d.push_descartados} descartados (aparelho expirado)`} alerta={d.push_falhas > 0} />
          <Numero titulo="Usuários com PUSH ativo" valor={d.usuarios_com_push} />
          <Numero titulo="Aparelhos cadastrados" valor={d.dispositivos} />
        </div>
        <Abas<Aba> ativa={aba} aoMudar={setAba} abas={[{ id: 'resumo', rotulo: 'Eventos por módulo' }, { id: 'historico', rotulo: 'Histórico e falhas', alerta: d.push_falhas || undefined },
          { id: 'configuracao', rotulo: 'Configuração' }]} />
        {aba === 'resumo' && <Resumo d={d} />}
        {aba === 'historico' && <Historico tenantId={orgao.id} de={de} ate={ate} falhas={d.push_falhas} />}
        {aba === 'configuracao' && <Configuracao tenantId={orgao.id} d={d} />}
      </>}
    </>
  );
}

function Resumo({ d }: { d: Dados }) {
  const total = Object.values(d.por_modulo).reduce((s, n) => s + n, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Cartao titulo="Notificações por módulo">
        {!total ? <p className="text-sm text-slate-500">Nenhuma notificação no período.</p> : (
          <div className="flex flex-col gap-3">{Object.entries(d.por_modulo).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
            <Progresso key={m} rotulo={MODULOS_NOTIFICACAO[m] ?? m} valor={n} detalhe={`${Math.round((n / total) * 100)}%`} parte={n} total={total} />
          ))}</div>
        )}
      </Cartao>
      <Cartao titulo="Tipos de evento mais frequentes">
        {!d.por_tipo.length ? <p className="text-sm text-slate-500">Nenhum evento no período.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{d.por_tipo.slice(0, 12).map((t) => (
            <li key={t.modulo + t.tipo} className="flex justify-between gap-2 py-1.5"><span className="text-slate-700">{MODULOS_NOTIFICACAO[t.modulo] ?? t.modulo} · {t.tipo.toLowerCase().replace(/_/g, ' ')}</span><span className="numero">{t.n}</span></li>
          ))}</ul>
        )}
      </Cartao>
    </div>
  );
}

function Historico({ tenantId, de, ate, falhas }: { tenantId: string; de: string; ate: string; falhas: number }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [contrato, setContrato] = useState<{ id: string; rotulo: string } | null>(null);
  const [status, setStatus] = useState('');
  const [pagina, setPagina] = useState(0);
  const por = 50;
  const q = useQuery({
    queryKey: ['historico-notificacoes-admin', tenantId, de, ate, busca, contrato?.id, status, pagina],
    queryFn: () => historicoAdmin({ tenantId, de, ate, busca, contratoId: contrato?.id ?? null, status: status || null, limite: por, offset: pagina * por }),
    placeholderData: keepPreviousData,
  });
  return (
    <Cartao className="p-3 sm:p-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_12rem_auto] lg:items-end">
        <Campo rotulo="Servidor ou assunto" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Nome, e-mail ou título" />
        <SeletorContrato valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} aoMudar={(v, o) => { setContrato(v && o ? { id: v, rotulo: o.rotulo } : null); setPagina(0); }} />
        <Selecao rotulo="Situação" value={status} onChange={(e) => { setStatus(e.target.value); setPagina(0); }}>
          <option value="">Todas</option><option value="FALHA">Com falha de envio</option><option value="ENVIADO">PUSH enviado</option>
          <option value="SEM_PUSH">Só na central (sem PUSH)</option><option value="NAO_LIDA">Não lidas</option></Selecao>
        <Botao variante="secundario" icone={<RotateCcw className="size-4" />} disabled={!falhas} onClick={async () => {
          try { const n = await reprocessarFalhas(tenantId); toast.success(`${n} envio(s) voltaram para a fila.`); await qc.invalidateQueries({ queryKey: ['painel-notificacoes'] }); await q.refetch(); }
          catch (e) { toast.error(mensagemDeErro(e)); }
        }}>Reprocessar falhas</Botao>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data?.itens.length ? <Vazio titulo="Nenhuma notificação encontrada" /> : <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-2 py-2 font-medium">Data</th><th className="px-2 py-2 font-medium">Destinatário</th><th className="px-2 py-2 font-medium">Notificação</th>
              <th className="px-2 py-2 font-medium">Contrato</th><th className="px-2 py-2 font-medium">PUSH</th><th className="px-2 py-2 font-medium">Leitura</th>
            </tr></thead>
            <tbody>{q.data.itens.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 align-top">
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-600">{formatarDataHora(i.criado_em)}</td>
                <td className="px-2 py-1.5">{i.pessoa}</td>
                <td className="px-2 py-1.5"><p>{i.titulo}</p><p className="text-xs text-slate-500">{MODULOS_NOTIFICACAO[i.modulo] ?? i.modulo}</p></td>
                <td className="px-2 py-1.5">{i.contrato ?? '—'}</td>
                <td className="px-2 py-1.5 text-xs">{i.push.falhas ? <span className="text-red-700" title={i.push.erro ?? undefined}>falha ({i.push.falhas})</span>
                  : i.push.enviados ? <span className="text-emerald-700">enviado ({i.push.enviados})</span> : i.push.pendentes ? <span className="text-slate-600">na fila</span> : <span className="text-slate-400">sem aparelho</span>}</td>
                <td className="px-2 py-1.5 text-xs">{i.lida_em ? formatarDataHora(i.lida_em) : <span className="text-slate-400">não lida</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Paginacao pagina={pagina} total={q.data.total} porPagina={por} aoMudar={setPagina} />
      </>}
    </Cartao>
  );
}

function Configuracao({ tenantId, d }: { tenantId: string; d: Dados }) {
  const qc = useQueryClient();
  const [cats, setCats] = useState<CategoriaConfig[]>(d.config.categorias);
  const [dias, setDias] = useState(d.config.push_vencimento_dias.join(', '));
  const [lembrete, setLembrete] = useState(d.config.lembrete_atesto_dias);
  const [salvando, setSalvando] = useState(false);
  const lista = dias.split(/[,;\s]+/).filter(Boolean).map(Number);
  const valido = lista.length > 0 && lista.every((n) => Number.isInteger(n) && n >= 0 && n <= 365) && lembrete >= 1 && lembrete <= 90;
  const mudar = (codigo: string, campo: 'ativa' | 'obrigatoria', v: boolean) => setCats((cs) => cs.map((c) => (c.codigo === codigo ? { ...c, [campo]: v } : c)));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Cartao titulo={<span className="inline-flex items-center gap-2"><Settings2 className="size-4" />Categorias de notificação</span>}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1.5 font-medium">Categoria</th>
            <th className="py-1.5 text-center font-medium">Gera notificação</th><th className="py-1.5 text-center font-medium">PUSH obrigatório</th></tr></thead>
          <tbody>{cats.map((c) => (
            <tr key={c.codigo} className="border-b border-slate-100 align-top">
              <td className="py-2 pr-2"><p className="font-medium text-slate-800">{c.nome}</p><p className="text-xs text-slate-500">{c.descricao}</p></td>
              <td className="py-2 text-center"><input type="checkbox" className="size-4 accent-marca-700" checked={c.ativa} onChange={(e) => mudar(c.codigo, 'ativa', e.target.checked)} aria-label={`${c.nome}: gera notificação`} /></td>
              <td className="py-2 text-center"><input type="checkbox" className="size-4 accent-marca-700" checked={c.obrigatoria} disabled={!c.ativa} onChange={(e) => mudar(c.codigo, 'obrigatoria', e.target.checked)} aria-label={`${c.nome}: PUSH obrigatório`} /></td>
            </tr>
          ))}</tbody>
        </table>
      </Cartao>
      <Cartao titulo="Prazos">
        <div className="flex flex-col gap-4">
          <Campo rotulo="Avisar o vencimento do contrato com (dias de antecedência)" value={dias} onChange={(e) => setDias(e.target.value)} placeholder="120, 90, 60, 30, 15, 7, 0"
            ajuda="Separe por vírgula. 0 = no dia do vencimento." erro={lista.every((n) => Number.isInteger(n) && n >= 0 && n <= 365) ? null : 'Use números de 0 a 365.'} />
          <Campo rotulo="Lembrar o atesto da nota pendente há (dias)" type="number" min={1} max={90} value={lembrete} onChange={(e) => setLembrete(Number(e.target.value))} />
          <Botao icone={<Save className="size-4" />} carregando={salvando} disabled={!valido} onClick={async () => {
            setSalvando(true);
            try { await salvarConfigNotificacoes(tenantId, cats, lista, lembrete); await qc.invalidateQueries({ queryKey: ['painel-notificacoes'] }); toast.success('Configuração das notificações salva.'); }
            catch (e) { toast.error(mensagemDeErro(e)); } finally { setSalvando(false); }
          }}>Salvar configuração</Botao>
          <p className="text-xs text-slate-500">Os avisos de vencimento e os lembretes de atesto saem todo dia às 8h. Cada aviso é enviado uma vez por antecedência.</p>
        </div>
      </Cartao>
    </div>
  );
}
