// Monitoramento organizacional (área da plataforma/desenvolvedor e Master do órgão): quais estruturas já têm
// servidores, quais estão usando o sistema, em quais módulos, quem está usando e quando foi a última atividade.
// Tudo vem do banco (estrutura, servidores e o registro de atividades alimentado pela auditoria).
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowLeft, Building2, CheckCircle2, ChevronDown, ChevronRight, FileDown, MinusCircle, RefreshCw, Settings2, Users, XCircle,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Rosca } from '@/components/graficos';
import { Abas } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, Selecao, SemPermissao, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import {
  ATIVIDADE, CADASTRAL, MODULOS, PERIODOS, ancestral, indicadores, intervalo, nomeUnidade, pendencias, situacaoAtividade, situacaoCadastral,
  type Periodo, type SituacaoAtividade, type SituacaoCadastral,
} from '@/lib/monitoramentoOrganizacional';
import {
  monitoramentoEstrutura, monitoramentoHistorico, monitoramentoServidores, salvarFaixas, type Faixas, type Monitoramento as Dados, type UnidadeMonitorada,
} from '@/services/monitoramento';

type Tom = 'verde' | 'azul' | 'amarelo' | 'cinza' | 'vermelho';
const TOM: Record<Tom, { classe: string; icone: ReactNode }> = {
  verde: { classe: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icone: <CheckCircle2 className="size-3.5" /> },
  azul: { classe: 'bg-marca-50 text-marca-800 ring-marca-200', icone: <Activity className="size-3.5" /> },
  amarelo: { classe: 'bg-amber-50 text-amber-800 ring-amber-200', icone: <AlertTriangle className="size-3.5" /> },
  cinza: { classe: 'bg-slate-100 text-slate-600 ring-slate-200', icone: <MinusCircle className="size-3.5" /> },
  vermelho: { classe: 'bg-red-50 text-red-800 ring-red-200', icone: <XCircle className="size-3.5" /> },
};
/** Sinalização: cor sempre acompanhada de ícone e texto */
function Sinal({ tom, children, titulo }: { tom: Tom; children: ReactNode; titulo?: string }) {
  return <span title={titulo} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TOM[tom].classe)}>{TOM[tom].icone}{children}</span>;
}
const SinalCadastral = ({ u }: { u: UnidadeMonitorada }) => {
  const s = situacaoCadastral(u);
  return <Sinal tom={CADASTRAL[s].tom} titulo={pendencias(u).join('; ') || undefined}>{CADASTRAL[s].rotulo}</Sinal>;
};
const SinalAtividade = ({ u, faixas }: { u: UnidadeMonitorada; faixas: Faixas }) => {
  const s = situacaoAtividade(u.ultima_atividade, faixas);
  return <Sinal tom={ATIVIDADE[s].tom}>{ATIVIDADE[s].rotulo}</Sinal>;
};

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-600">{titulo}</p>
      <p className="numero mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

type Aba = 'estrutura' | 'acompanhamento' | 'modulos' | 'historico';

export function Monitoramento() {
  const { orgao, ehPlataforma, vinculosDoOrgao } = useSessao();
  const permitido = ehPlataforma || vinculosDoOrgao.some((v) => v.papel === 'MASTER');
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [pers, setPers] = useState({ de: '', ate: '' });
  const [aba, setAba] = useState<Aba>('estrutura');
  const [sel, setSel] = useState<string | null>(null);
  const [config, setConfig] = useState(false);
  const { de, ate } = useMemo(() => intervalo(periodo, new Date(), pers), [periodo, pers]);
  const q = useQuery({
    queryKey: ['monitoramento', orgao?.id, de, ate], queryFn: () => monitoramentoEstrutura(orgao!.id, de, ate),
    enabled: !!orgao && permitido, refetchInterval: 60_000, placeholderData: keepPreviousData,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão para monitorar." />;
  if (!permitido) return <SemPermissao texto="O monitoramento organizacional é exclusivo do Master do órgão e da equipe da plataforma." />;
  const dados = q.data;
  const porId = new Map(dados?.unidades.map((u) => [u.id, u]) ?? []);
  const rotuloPeriodo = periodo === 'personalizado' ? `${pers.de || '…'} a ${pers.ate || '…'}` : PERIODOS.find((p) => p.id === periodo)!.rotulo;
  const unidadeSel = sel ? porId.get(sel) ?? null : null;

  return (
    <>
      <CabecalhoPagina titulo="Monitoramento organizacional"
        descricao={`${orgao.nome_curto} · implantação e uso do sistema por diretoria, coordenação, gerência e setor. Atualiza sozinho a cada minuto.`}
        acoes={<div className="flex flex-wrap items-end gap-2">
          <Selecao rotulo="Período" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className="w-52">
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </Selecao>
          {periodo === 'personalizado' && <>
            <Campo rotulo="De" type="date" value={pers.de} onChange={(e) => setPers({ ...pers, de: e.target.value })} className="w-40" />
            <Campo rotulo="Até" type="date" value={pers.ate} onChange={(e) => setPers({ ...pers, ate: e.target.value })} className="w-40" />
          </>}
          <Botao variante="secundario" icone={<RefreshCw className={cx('size-4', q.isFetching && 'animate-spin')} />} onClick={() => q.refetch()} aria-label="Atualizar" />
          {dados && <Botao variante="secundario" icone={<FileDown className="size-4" />} onClick={() => void gerarPdf(dados, orgao.nome_curto, rotuloPeriodo, unidadeSel)}>
            {unidadeSel ? 'PDF desta estrutura' : 'Relatório PDF'}</Botao>}
          {ehPlataforma && dados && <Botao variante="fantasma" icone={<Settings2 className="size-4" />} onClick={() => setConfig(true)} aria-label="Configurar faixas de atividade" />}
        </div>} />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> : dados && (
        unidadeSel ? <Detalhe u={unidadeSel} dados={dados} porId={porId} de={de} ate={ate} tenantId={orgao.id} voltar={() => setSel(null)} abrir={setSel} />
          : <>
            <Painel dados={dados} />
            <Abas<Aba> ativa={aba} aoMudar={setAba} abas={[{ id: 'estrutura', rotulo: 'Estrutura' }, { id: 'acompanhamento', rotulo: 'Acompanhamento' },
              { id: 'modulos', rotulo: 'Uso por módulo' }, { id: 'historico', rotulo: 'Histórico' }]} />
            {aba === 'estrutura' && <Arvore dados={dados} abrir={setSel} />}
            {aba === 'acompanhamento' && <Tabela dados={dados} porId={porId} abrir={setSel} />}
            {aba === 'modulos' && <MatrizModulos unidades={dados.unidades.filter((u) => u.tipo === 'DIRETORIA' || u.tipo === 'COORDENACAO')} porId={porId} abrir={setSel} />}
            {aba === 'historico' && <Historico tenantId={orgao.id} unidadeId={null} de={de} ate={ate} />}
          </>
      )}
      {dados && <ConfigFaixas aberto={config} aoFechar={() => setConfig(false)} faixas={dados.faixas} />}
    </>
  );
}

function Painel({ dados }: { dados: Dados }) {
  const i = indicadores(dados.unidades, dados.faixas);
  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_auto]">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="Diretorias cadastradas" valor={i.diretorias} detalhe={`${i.diretoriasComServidores} com servidores`} />
        <Indicador titulo="Coordenações cadastradas" valor={i.coordenacoes} detalhe={`${i.coordenacoesComServidores} com servidores`} />
        <Indicador titulo="Diretorias com servidores" valor={i.diretoriasComServidores} detalhe={`de ${i.diretorias}`} />
        <Indicador titulo="Coordenações com servidores" valor={i.coordenacoesComServidores} detalhe={`de ${i.coordenacoes}`} />
        <Indicador titulo="Estruturas sem servidores" valor={i.estruturasSemServidores} detalhe="diretorias, coordenações, gerências e setores ativos" />
        <Indicador titulo="Com atividade recente" valor={i.comAtividadeRecente} detalhe={`última atividade em até ${dados.faixas.recente} dias`} />
        <Indicador titulo="Sem atividade no período" valor={i.semAtividade} detalhe="estruturas sem nenhuma operação registrada" />
        <Indicador titulo="Servidores ativos vinculados" valor={i.servidoresAtivos} />
      </div>
      <Cartao className="flex items-center gap-4 p-4 lg:w-72">
        <Rosca parte={i.estruturasUsando} total={i.estruturasComServidores} tamanho={104} espessura={11} rotulo="Utilização do sistema pelas estruturas" legenda="em uso" />
        <div className="text-sm">
          <p className="font-medium text-slate-800">Utilização do sistema</p>
          <p className="mt-1 text-xs text-slate-500">{i.estruturasUsando} de {i.estruturasComServidores} estruturas com servidores tiveram atividade no período.</p>
        </div>
      </Cartao>
    </div>
  );
}

function Legenda() {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
      <span className="font-medium">Cadastro:</span>{(Object.keys(CADASTRAL) as SituacaoCadastral[]).map((k) => <Sinal key={k} tom={CADASTRAL[k].tom}>{CADASTRAL[k].rotulo}</Sinal>)}
      <span className="ml-2 font-medium">Atividade:</span>{(Object.keys(ATIVIDADE) as SituacaoAtividade[]).map((k) => <Sinal key={k} tom={ATIVIDADE[k].tom}>{ATIVIDADE[k].rotulo}</Sinal>)}
    </div>
  );
}

function Arvore({ dados, abrir }: { dados: Dados; abrir: (id: string) => void }) {
  const filhos = useMemo(() => {
    const m = new Map<string | null, UnidadeMonitorada[]>();
    for (const u of dados.unidades) m.set(u.pai_id, [...(m.get(u.pai_id) ?? []), u]);
    return m;
  }, [dados]);
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(dados.unidades.filter((u) => ['ORGANIZACAO', 'SECRETARIA'].includes(u.tipo)).map((u) => u.id)));
  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const no = (u: UnidadeMonitorada, nivel: number): ReactNode => {
    const f = filhos.get(u.id) ?? [];
    const aberto = abertos.has(u.id);
    return (
      <li key={u.id}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-slate-50" style={{ paddingLeft: nivel * 18 }}>
          <button className={cx('grid size-6 place-items-center rounded text-slate-500 hover:bg-slate-200', !f.length && 'invisible')} onClick={() => alternar(u.id)} aria-label={aberto ? 'Recolher' : 'Expandir'} aria-expanded={aberto}>
            {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          <button className="min-w-0 text-left text-sm hover:text-marca-700 hover:underline" onClick={() => abrir(u.id)}>
            <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{u.tipo.toLowerCase()}</span>
            <span className="font-medium text-slate-800">{u.sigla ?? u.nome}</span>{u.sigla && <span className="ml-1 text-slate-500">{u.nome}</span>}
          </button>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="numero inline-flex items-center gap-1 text-xs text-slate-600" title="Servidores ativos (com as unidades abaixo)"><Users className="size-3.5" />{u.servidores}</span>
            <SinalCadastral u={u} /><SinalAtividade u={u} faixas={dados.faixas} />
          </span>
        </div>
        {aberto && f.length > 0 && <ul>{f.map((x) => no(x, nivel + 1))}</ul>}
      </li>
    );
  };
  return (
    <Cartao className="p-3 sm:p-4">
      <Legenda />
      <ul>{(filhos.get(null) ?? []).map((u) => no(u, 0))}</ul>
      {dados.sem_lotacao.total > 0 && <p className="mt-3 text-xs text-slate-500">{dados.sem_lotacao.total} atividade(s) de usuários com acesso ao órgão inteiro (sem lotação em uma unidade) não entram em nenhuma estrutura.</p>}
    </Cartao>
  );
}

type Ordem = 'diretoria' | 'coordenacao' | 'servidores' | 'atividades' | 'ultima';
function Tabela({ dados, porId, abrir }: { dados: Dados; porId: Map<string, UnidadeMonitorada>; abrir: (id: string) => void }) {
  const [escopo, setEscopo] = useState<'dc' | 'todas'>('dc');
  const [fDir, setFDir] = useState('');
  const [fCad, setFCad] = useState<'' | SituacaoCadastral>('');
  const [fAtv, setFAtv] = useState<'' | SituacaoAtividade>('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<{ campo: Ordem; desc: boolean }>({ campo: 'diretoria', desc: false });
  const diretorias = dados.unidades.filter((u) => u.tipo === 'DIRETORIA');
  const linhas = dados.unidades
    .filter((u) => (escopo === 'dc' ? u.tipo === 'DIRETORIA' || u.tipo === 'COORDENACAO' : !['ORGANIZACAO', 'SECRETARIA'].includes(u.tipo)))
    .map((u) => {
      const dir = u.tipo === 'DIRETORIA' ? u : ancestral(u, 'DIRETORIA', porId);
      const coord = u.tipo === 'COORDENACAO' ? u : u.tipo === 'DIRETORIA' ? null : ancestral(u, 'COORDENACAO', porId);
      return { u, dir, coord, cad: situacaoCadastral(u), atv: situacaoAtividade(u.ultima_atividade, dados.faixas) };
    })
    .filter((l) => (!fDir || l.dir?.id === fDir) && (!fCad || l.cad === fCad) && (!fAtv || l.atv === fAtv)
      && (!busca || `${l.u.nome} ${l.u.sigla ?? ''} ${l.dir?.nome ?? ''} ${l.coord?.nome ?? ''}`.toLowerCase().includes(busca.toLowerCase())));
  const chave = (l: (typeof linhas)[number]): string | number => {
    switch (ordem.campo) {
      case 'diretoria': return `${l.dir?.sigla ?? l.dir?.nome ?? ''} ${l.coord?.sigla ?? ''} ${l.u.tipo === 'DIRETORIA' ? '' : l.u.nome}`.toLowerCase();
      case 'coordenacao': return `${l.coord?.sigla ?? l.coord?.nome ?? '~'} ${l.u.nome}`.toLowerCase();
      case 'servidores': return l.u.servidores;
      case 'atividades': return l.u.atividades_periodo;
      case 'ultima': return l.u.ultima_atividade ?? '';
    }
  };
  linhas.sort((a, b) => { const x = chave(a), y = chave(b); const r = x < y ? -1 : x > y ? 1 : 0; return ordem.desc ? -r : r; });
  const Th = ({ campo, children, direita }: { campo: Ordem; children: ReactNode; direita?: boolean }) => (
    <th className={cx('px-3 py-2 font-medium', direita && 'text-right')} aria-sort={ordem.campo === campo ? (ordem.desc ? 'descending' : 'ascending') : 'none'}>
      <button className="hover:text-slate-900" onClick={() => setOrdem((o) => ({ campo, desc: o.campo === campo ? !o.desc : campo !== 'diretoria' && campo !== 'coordenacao' }))}>
        {children}{ordem.campo === campo ? (ordem.desc ? ' ↓' : ' ↑') : ''}</button>
    </th>
  );
  return (
    <Cartao className="p-3 sm:p-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Campo rotulo="Pesquisar" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Diretoria, coordenação, setor" />
        <Selecao rotulo="Mostrar" value={escopo} onChange={(e) => setEscopo(e.target.value as 'dc' | 'todas')}>
          <option value="dc">Diretorias e coordenações</option><option value="todas">Todas as estruturas</option></Selecao>
        <Selecao rotulo="Diretoria" value={fDir} onChange={(e) => setFDir(e.target.value)}>
          <option value="">Todas</option>{diretorias.map((d) => <option key={d.id} value={d.id}>{nomeUnidade(d)}</option>)}</Selecao>
        <Selecao rotulo="Situação cadastral" value={fCad} onChange={(e) => setFCad(e.target.value as SituacaoCadastral | '')}>
          <option value="">Todas</option>{(Object.keys(CADASTRAL) as SituacaoCadastral[]).map((k) => <option key={k} value={k}>{CADASTRAL[k].rotulo}</option>)}</Selecao>
        <Selecao rotulo="Situação de atividade" value={fAtv} onChange={(e) => setFAtv(e.target.value as SituacaoAtividade | '')}>
          <option value="">Todas</option>{(Object.keys(ATIVIDADE) as SituacaoAtividade[]).map((k) => <option key={k} value={k}>{ATIVIDADE[k].rotulo}</option>)}</Selecao>
      </div>
      <p className="mb-2 text-xs text-slate-500">{linhas.length} estrutura(s). Clique para ver o detalhamento.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <Th campo="diretoria">Diretoria</Th><Th campo="coordenacao">Coordenação / estrutura</Th><Th campo="servidores" direita>Servidores</Th>
            <th className="px-3 py-2 font-medium">Cadastro</th><th className="px-3 py-2 font-medium">Atividade</th>
            <Th campo="atividades" direita>Operações no período</Th><Th campo="ultima">Última atividade</Th>
          </tr></thead>
          <tbody>
            {linhas.map(({ u, dir, coord }) => (
              <tr key={u.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => abrir(u.id)}>
                <td className="px-3 py-2">{dir ? dir.sigla ?? dir.nome : '—'}</td>
                <td className="px-3 py-2">{u.tipo === 'DIRETORIA' ? <span className="text-slate-400">(diretoria)</span>
                  : <><span className="font-medium text-slate-800">{u.sigla ?? u.nome}</span>{u.tipo !== 'COORDENACAO' && coord && <span className="text-xs text-slate-500"> · {coord.sigla ?? coord.nome}</span>}</>}</td>
                <td className="numero px-3 py-2 text-right">{u.servidores}</td>
                <td className="px-3 py-2"><SinalCadastral u={u} /></td>
                <td className="px-3 py-2"><SinalAtividade u={u} faixas={dados.faixas} /></td>
                <td className="numero px-3 py-2 text-right">{u.atividades_periodo}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{u.ultima_atividade ? formatarDataHora(u.ultima_atividade) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

function MatrizModulos({ unidades, porId, abrir }: { unidades: UnidadeMonitorada[]; porId: Map<string, UnidadeMonitorada>; abrir: (id: string) => void }) {
  const nome = (u: UnidadeMonitorada | null) => (u?.sigla ?? u?.nome ?? '').toLowerCase();
  const chave = (u: UnidadeMonitorada) => (u.tipo === 'DIRETORIA' ? `${nome(u)} ` : `${nome(ancestral(u, 'DIRETORIA', porId))}${nome(u)}`);
  unidades = [...unidades].sort((x, y) => chave(x).localeCompare(chave(y)));
  const usados = Object.keys(MODULOS).filter((m) => unidades.some((u) => u.modulos[m]));
  const colunas = usados.length ? usados : ['CONECTA', 'PATRIMONIO', 'CONTRATOS'];
  return (
    <Cartao className="p-3 sm:p-4">
      <p className="mb-3 text-xs text-slate-500">"Sem atividade" quer dizer só que não houve uso do módulo no período escolhido, e não que a estrutura esteja inativa.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-3 py-2 font-medium">Estrutura</th>{colunas.map((m) => <th key={m} className="px-3 py-2 font-medium">{MODULOS[m]}</th>)}
          </tr></thead>
          <tbody>
            {unidades.map((u) => {
              const dir = u.tipo === 'COORDENACAO' ? ancestral(u, 'DIRETORIA', porId) : null;
              return (
                <tr key={u.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => abrir(u.id)}>
                  <td className="px-3 py-2"><span className={cx(u.tipo === 'DIRETORIA' ? 'font-semibold' : 'pl-3')}>{u.sigla ?? u.nome}</span>
                    {dir && <span className="text-xs text-slate-400"> · {dir.sigla ?? dir.nome}</span>}</td>
                  {colunas.map((m) => <td key={m} className="px-3 py-2">{u.modulos[m] ? <Sinal tom="verde">Em uso ({u.modulos[m]})</Sinal> : <Sinal tom="cinza">Sem atividade</Sinal>}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

function Historico({ tenantId, unidadeId, de, ate }: { tenantId: string; unidadeId: string | null; de: string; ate: string }) {
  const [busca, setBusca] = useState('');
  const [modulo, setModulo] = useState('');
  const [pagina, setPagina] = useState(0);
  const por = 50;
  const q = useQuery({
    queryKey: ['monitoramento-historico', tenantId, unidadeId, de, ate, busca, modulo, pagina],
    queryFn: () => monitoramentoHistorico({ tenantId, unidadeId, de, ate, busca, modulo: modulo || null, limite: por, offset: pagina * por }),
    placeholderData: keepPreviousData, refetchInterval: 60_000,
  });
  return (
    <Cartao className="p-3 sm:p-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_14rem]">
        <Campo rotulo="Pesquisar" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Servidor, matrícula, diretoria, coordenação ou operação" />
        <Selecao rotulo="Módulo" value={modulo} onChange={(e) => { setModulo(e.target.value); setPagina(0); }}>
          <option value="">Todos</option>{Object.entries(MODULOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />
        : !q.data?.itens.length ? <Vazio titulo="Nenhuma atividade no período" descricao="Só aparecem operações efetivamente registradas no sistema." />
        : <>
          <ol className="divide-y divide-slate-100">
            {q.data.itens.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="numero w-36 shrink-0 text-xs text-slate-500">{formatarDataHora(e.criado_em)}</span>
                <span className="min-w-0 flex-1"><b className="font-medium text-slate-800">{e.servidor}</b>{e.matricula && <span className="text-xs text-slate-500"> (mat. {e.matricula})</span>}
                  <span className="text-slate-700"> · {e.tipo}</span></span>
                <span className="text-xs text-slate-500">{[e.diretoria, e.coordenacao, e.setor].filter(Boolean).join(' › ') || 'sem lotação'}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{MODULOS[e.modulo] ?? e.modulo}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3"><Paginacao pagina={pagina} total={q.data.total} porPagina={por} aoMudar={setPagina} /></div>
        </>}
    </Cartao>
  );
}

function Detalhe({ u, dados, porId, de, ate, tenantId, voltar, abrir }: {
  u: UnidadeMonitorada; dados: Dados; porId: Map<string, UnidadeMonitorada>; de: string; ate: string; tenantId: string; voltar: () => void; abrir: (id: string) => void;
}) {
  const serv = useQuery({ queryKey: ['monitoramento-servidores', tenantId, u.id, de, ate], queryFn: () => monitoramentoServidores(tenantId, u.id, de, ate) });
  const dir = u.tipo === 'DIRETORIA' ? null : ancestral(u, 'DIRETORIA', porId);
  const filhos = dados.unidades.filter((x) => x.pai_id === u.id);
  const coords = dados.unidades.filter((x) => x.tipo === 'COORDENACAO' && ancestral(x, u.tipo, porId)?.id === u.id);
  const modulos = Object.entries(u.modulos).sort((a, b) => b[1] - a[1]);
  const pend = pendencias(u);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Botao pequeno variante="fantasma" icone={<ArrowLeft className="size-4" />} onClick={voltar}>Voltar ao painel</Botao>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Building2 className="size-5 text-marca-700" />
          <h2 className="text-lg font-semibold text-slate-900">{nomeUnidade(u)}</h2>
          <span className="text-xs uppercase tracking-wide text-slate-400">{u.tipo.toLowerCase()}</span>
          <SinalCadastral u={u} /><SinalAtividade u={u} faixas={dados.faixas} />
        </div>
        {dir && <p className="mt-1 text-sm text-slate-600">Diretoria: <button className="text-marca-700 hover:underline" onClick={() => abrir(dir.id)}>{nomeUnidade(dir)}</button></p>}
        {pend.length > 0 && <p className="mt-1 text-xs text-amber-800">Pendências de cadastro: {pend.join('; ')}.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {u.tipo === 'DIRETORIA' && <Indicador titulo="Coordenações" valor={coords.length} detalhe={`${coords.filter((c) => c.servidores > 0).length} com servidores`} />}
        <Indicador titulo="Servidores vinculados" valor={u.servidores} detalhe={`${u.com_acesso} com acesso ao sistema`} />
        <Indicador titulo="Operações no período" valor={u.atividades_periodo} detalhe={`${u.usuarios_periodo} pessoa(s) atuando`} />
        <Indicador titulo="Operações (todo o histórico)" valor={u.atividades_total} />
        <Indicador titulo="Última atividade" valor={<span className="text-base">{u.ultima_atividade ? formatarDataHora(u.ultima_atividade) : '—'}</span>} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Cartao titulo="Módulos utilizados no período">
          {!modulos.length ? <p className="text-sm text-slate-500">Nenhum uso identificado no período.</p> : (
            <ul className="flex flex-col gap-2">{modulos.map(([m, n]) => (
              <li key={m} className="flex items-center justify-between gap-2 text-sm"><span>{MODULOS[m] ?? m}</span><span className="numero text-slate-700">{n} operação(ões)</span></li>
            ))}</ul>
          )}
          {filhos.length > 0 && <>
            <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">Estruturas abaixo</p>
            <ul className="flex flex-col gap-1.5">{filhos.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button className="text-left text-marca-700 hover:underline" onClick={() => abrir(f.id)}>{f.sigla ?? f.nome}</button>
                <span className="flex gap-1.5"><span className="numero text-xs text-slate-500">{f.servidores} serv.</span><SinalAtividade u={f} faixas={dados.faixas} /></span>
              </li>
            ))}</ul>
          </>}
        </Cartao>
        <Cartao titulo="Servidores vinculados e uso do sistema">
          {serv.isLoading ? <Carregando /> : serv.isError ? <CaixaErro mensagem={traduzirErro(serv.error).mensagem} /> : !serv.data?.length ? <p className="text-sm text-slate-500">Nenhum servidor ativo vinculado.</p> : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1.5 pr-2 font-medium">Servidor</th><th className="py-1.5 pr-2 font-medium">Uso</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Período</th><th className="py-1.5 font-medium">Última</th></tr></thead>
                <tbody>{serv.data.map((s) => (
                  <tr key={s.servidor_id} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-2"><p className="font-medium text-slate-800">{s.nome}</p><p className="text-xs text-slate-500">Mat. {s.matricula}{s.cargo ? ` · ${s.cargo}` : ''} · {s.lotacao}</p></td>
                    <td className="py-1.5 pr-2">{!s.tem_acesso ? <Sinal tom="cinza">Sem acesso</Sinal> : s.atividades_periodo > 0 ? <Sinal tom="verde">Usando</Sinal> : s.atividades_total > 0 ? <Sinal tom="amarelo">Sem uso no período</Sinal> : <Sinal tom="cinza">Nunca operou</Sinal>}</td>
                    <td className="numero py-1.5 pr-2 text-right">{s.atividades_periodo}</td>
                    <td className="whitespace-nowrap py-1.5 text-xs text-slate-600">{s.ultima_atividade ? formatarDataHora(s.ultima_atividade) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
      <div><h3 className="mb-2 text-sm font-semibold text-slate-800">Histórico de atividades</h3><Historico tenantId={tenantId} unidadeId={u.id} de={de} ate={ate} /></div>
    </div>
  );
}

function ConfigFaixas({ aberto, aoFechar, faixas }: { aberto: boolean; aoFechar: () => void; faixas: Faixas }) {
  const qc = useQueryClient();
  const [f, setF] = useState(faixas);
  const [salvando, setSalvando] = useState(false);
  const valido = f.recente >= 1 && f.moderada > f.recente && f.moderada <= 3650;
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Faixas de atividade" largura="sm"
      descricao="Classificação pela última atividade registrada (não pelo login)."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvando} disabled={!valido} onClick={async () => {
        setSalvando(true);
        try { await salvarFaixas(f); await qc.invalidateQueries({ queryKey: ['monitoramento'] }); toast.success('Faixas atualizadas.'); aoFechar(); }
        catch (e) { toast.error(mensagemDeErro(e)); } finally { setSalvando(false); }
      }}>Salvar</Botao></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Recente (verde) até, em dias" type="number" min={1} value={f.recente} onChange={(e) => setF({ ...f, recente: Number(e.target.value) })} />
        <Campo rotulo="Moderada (azul) até, em dias" type="number" min={2} value={f.moderada} onChange={(e) => setF({ ...f, moderada: Number(e.target.value) })} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Acima de {f.moderada} dias: sem atividade recente (amarelo). Nenhum registro: sem histórico (cinza).</p>
      {!valido && <p className="mt-2 text-xs text-red-700">A faixa moderada precisa ser maior que a recente.</p>}
    </Modal>
  );
}

/** Relatório em PDF: geral (toda a estrutura) ou de uma diretoria/coordenação e o que está abaixo dela */
async function gerarPdf(dados: Dados, orgao: string, periodo: string, alvo: UnidadeMonitorada | null) {
  const [{ jsPDF }, { default: autoTable }, { t }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('@/lib/pdfPatrimonio')]);
  const porId = new Map(dados.unidades.map((u) => [u.id, u]));
  const dentro = (u: UnidadeMonitorada) => { if (!alvo) return true; let x: UnidadeMonitorada | undefined = u; while (x) { if (x.id === alvo.id) return true; x = x.pai_id ? porId.get(x.pai_id) : undefined; } return false; };
  const lista = dados.unidades.filter((u) => dentro(u) && !['ORGANIZACAO', 'SECRETARIA'].includes(u.tipo));
  const i = indicadores(alvo ? dados.unidades.filter(dentro) : dados.unidades, dados.faixas);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setFontSize(14); pdf.text(t(`Monitoramento organizacional - ${orgao}`), 14, 15);
  pdf.setFontSize(9);
  pdf.text(t(`${alvo ? `Estrutura: ${nomeUnidade(alvo)}` : 'Relatório geral'} · Período: ${periodo} · Emitido em ${formatarDataHora(new Date().toISOString())}`), 14, 21);
  autoTable(pdf, {
    startY: 26, theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [26, 63, 128] },
    head: [['Diretorias', 'Coordenações', 'Diretorias c/ servidores', 'Coordenações c/ servidores', 'Estruturas sem servidores', 'Com atividade recente', 'Sem atividade no período', 'Servidores ativos']],
    body: [[i.diretorias, i.coordenacoes, i.diretoriasComServidores, i.coordenacoesComServidores, i.estruturasSemServidores, i.comAtividadeRecente, i.semAtividade, i.servidoresAtivos].map(String)],
  });
  autoTable(pdf, {
    theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.2 }, headStyles: { fillColor: [26, 63, 128] },
    head: [['Tipo', 'Diretoria', 'Estrutura', 'Servidores', 'Cadastro', 'Atividade', 'Operações no período', 'Módulos utilizados', 'Última atividade']],
    body: lista.map((u) => {
      const dir = u.tipo === 'DIRETORIA' ? u : ancestral(u, 'DIRETORIA', porId);
      return [u.tipo.toLowerCase(), t(dir?.sigla ?? dir?.nome ?? '-'), t(u.sigla ? `${u.sigla} - ${u.nome}` : u.nome), String(u.servidores),
        t(CADASTRAL[situacaoCadastral(u)].rotulo), t(ATIVIDADE[situacaoAtividade(u.ultima_atividade, dados.faixas)].rotulo), String(u.atividades_periodo),
        t(Object.entries(u.modulos).map(([m, n]) => `${MODULOS[m] ?? m} (${n})`).join(', ') || '-'), u.ultima_atividade ? formatarDataHora(u.ultima_atividade) : '-'];
    }),
    didDrawPage: () => {
      pdf.setFontSize(7); pdf.setTextColor(100);
      pdf.text(t(`Página ${pdf.getCurrentPageInfo().pageNumber} · dados registrados no sistema (auditoria das operações)`), 14, pdf.internal.pageSize.getHeight() - 6);
      pdf.setTextColor(0);
    },
  });
  const nome = `monitoramento_${(alvo?.sigla ?? alvo?.nome ?? 'geral').replace(/[^\w-]+/g, '_')}.pdf`;
  pdf.save(nome);
}
