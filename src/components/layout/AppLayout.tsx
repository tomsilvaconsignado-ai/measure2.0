import { useQuery } from '@tanstack/react-query';
import {
  Building2, ChevronDown, ClipboardList, FileSpreadsheet, FileText, FolderTree, Home, KeyRound, Landmark, LifeBuoy,
  ListChecks, LogOut, Menu, Receipt, ScrollText, Settings, ShieldCheck, Truck, UserCircle, Users, Wallet, X, Network, BarChart3,
  CalendarCheck, Bug, HelpCircle, GraduationCap, Banknote, ChevronLeft, MessagesSquare, Package, PackagePlus, PackageSearch, Boxes, MapPin,
  UserCheck, ArrowLeftRight, Repeat, Replace, ClipboardCheck, BellRing, FileDown, History, SlidersHorizontal,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { mensagemDeErro } from '@/lib/erros';
import { encerrarSuporte, urlArquivo } from '@/services/api';
import { Avatar, Botao, Carregando, ContadorPendente, cx } from '../ui/basicos';
import { usePendencias } from '../Pendencias';
import { FocoCoordenacao } from './FocoCoordenacao';
import { Marca, Simbolo } from './Marca';
import { Notificacoes } from './Notificacoes';
import { definirOrgaoMonitorado, LimiteDeErro } from '@/lib/monitoramento';
import type { Recurso } from '@/lib/tipos';

interface Item { para: string; rotulo: string; icone: ReactNode; recurso?: Recurso; acao?: 'ler' | 'editar'; plataforma?: boolean }

const ADMINISTRACAO: Item[] = [
  { para: '/estrutura', rotulo: 'Estrutura organizacional', icone: <FolderTree className="size-4" />, recurso: 'estrutura' },
  { para: '/usuarios', rotulo: 'Usuários e acessos', icone: <Users className="size-4" />, recurso: 'usuarios' },
  { para: '/configuracoes', rotulo: 'Configurações do órgão', icone: <Settings className="size-4" />, recurso: 'configuracoes' },
  { para: '/auditoria', rotulo: 'Auditoria', icone: <ScrollText className="size-4" />, recurso: 'auditoria' },
];
const PLATAFORMA: Item[] = [
  { para: '/plataforma/orgaos', rotulo: 'Órgãos', icone: <Landmark className="size-4" />, plataforma: true },
  { para: '/plataforma/permissoes', rotulo: 'Matriz de permissões', icone: <KeyRound className="size-4" />, plataforma: true },
  { para: '/plataforma/dotacoes', rotulo: 'Classificações orçamentárias', icone: <Network className="size-4" />, plataforma: true },
  { para: '/plataforma/erros', rotulo: 'Erros do sistema', icone: <Bug className="size-4" />, plataforma: true },
];
const CADASTROS: Item[] = [
  { para: '/fornecedores', rotulo: 'Fornecedores', icone: <Truck className="size-4" />, recurso: 'fornecedores' },
  { para: '/servidores', rotulo: 'Servidores', icone: <UserCircle className="size-4" />, recurso: 'servidores' },
  { para: '/servidores/consolidado', rotulo: 'Consolidado mensal', icone: <CalendarCheck className="size-4" />, recurso: 'servidores' },
  { para: '/unidades-atendidas', rotulo: 'Unidades atendidas', icone: <Building2 className="size-4" />, recurso: 'unidades' },
  { para: '/classificacao', rotulo: 'Classificação orçamentária', icone: <Network className="size-4" />, recurso: 'classificacoes' },
  { para: '/tipos-servico', rotulo: 'Tipos de serviço', icone: <ListChecks className="size-4" />, recurso: 'tipos_servico' },
];
// Sem filtro de recurso: gestores/fiscais/suplentes veem só os contratos da designação (o banco filtra)
const EXECUCAO: Item[] = [
  { para: '/contratos', rotulo: 'Contratos', icone: <FileText className="size-4" /> },
  { para: '/empenhos', rotulo: 'Empenhos', icone: <Wallet className="size-4" /> },
  { para: '/notas', rotulo: 'Notas fiscais e execução', icone: <Receipt className="size-4" /> },
  { para: '/pagamentos', rotulo: 'Pagamentos', icone: <Banknote className="size-4" />, recurso: 'notas_fiscais', acao: 'editar' },
  { para: '/ordens-servico', rotulo: 'Ordens de serviço', icone: <ClipboardList className="size-4" />, recurso: 'ordens_servico' },
];
// Gestão patrimonial: o servidor sem acesso ao módulo vê só os bens sob a sua guarda e as pendências
const PATRIMONIO: Item[] = [
  { para: '/patrimonio', rotulo: 'Dashboard', icone: <Package className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/cadastro', rotulo: 'Cadastro de patrimônio', icone: <PackagePlus className="size-4" />, recurso: 'patrimonio', acao: 'editar' },
  { para: '/patrimonio/bens', rotulo: 'Consulta de patrimônio', icone: <PackageSearch className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/por-coordenacao', rotulo: 'Bens por coordenação', icone: <Boxes className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/por-unidade', rotulo: 'Bens por unidade', icone: <MapPin className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/responsaveis', rotulo: 'Responsáveis', icone: <UserCheck className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/movimentacoes', rotulo: 'Movimentações', icone: <ArrowLeftRight className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/transferencias', rotulo: 'Transferências', icone: <Truck className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/trocas', rotulo: 'Trocas de patrimônio', icone: <Repeat className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/substituicoes', rotulo: 'Substituições', icone: <Replace className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/inventario', rotulo: 'Inventário', icone: <ClipboardCheck className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/pendencias', rotulo: 'Pendências e confirmações', icone: <BellRing className="size-4" /> },
  { para: '/patrimonio/relatorios', rotulo: 'Relatórios', icone: <FileDown className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/historico', rotulo: 'Histórico de patrimônio', icone: <History className="size-4" />, recurso: 'patrimonio' },
  { para: '/patrimonio/configuracoes', rotulo: 'Configurações', icone: <SlidersHorizontal className="size-4" />, recurso: 'patrimonio' },
];
const MEUS_BENS: Item = { para: '/patrimonio/bens?meus=1', rotulo: 'Meus bens patrimoniais', icone: <PackageSearch className="size-4" /> };

const GESTAO: Item[] = [
  { para: '/painel', rotulo: 'Painel gerencial', icone: <BarChart3 className="size-4" /> },
  { para: '/relatorios', rotulo: 'Consulta e relatórios', icone: <FileSpreadsheet className="size-4" /> },
];

// Menu recolhido: só os ícones (o nome aparece ao passar o mouse); os pendentes viram um ponto
function Link({ item, aoNavegar, pendentes = 0, recolhido = false }: { item: Item; aoNavegar: () => void; pendentes?: number; recolhido?: boolean }) {
  return (
    <NavLink to={item.para} onClick={aoNavegar} end={['/', '/servidores', '/ajuda', '/patrimonio', '/conecta'].includes(item.para)}
      data-flip={item.para} title={recolhido ? item.rotulo : undefined} aria-label={recolhido ? item.rotulo : undefined}
      className={({ isActive }) => cx('relative flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors', recolhido ? 'justify-center px-0' : 'px-3',
        isActive ? 'bg-white/12 font-medium text-white' : 'text-marca-100 hover:bg-white/8 hover:text-white')}>
      {item.icone}
      {!recolhido && <span data-rotulo className="flex-1 truncate">{item.rotulo}</span>}
      {recolhido
        ? pendentes > 0 && <span className="absolute right-3 top-1.5 size-2 rounded-full bg-amber-400" aria-hidden />
        : <ContadorPendente n={pendentes} />}
    </NavLink>
  );
}

function Grupo({ titulo, children, recolhido = false }: { titulo: string; children: ReactNode; recolhido?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5" role="group" aria-label={titulo}>
      {recolhido
        ? <div data-flip={'grupo:' + titulo} className="mx-3 mb-1.5 mt-3.5 h-px bg-white/10" aria-hidden />
        : <p data-flip={'grupo:' + titulo} data-rotulo className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-marca-300">{titulo}</p>}
      {children}
    </div>
  );
}

// Animação do menu (técnica FLIP com a animação nativa do navegador): mede antes e depois da troca e anima a diferença
const ANIMACAO = { duration: 450, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const LARGURA_RECOLHIDO = 80;
const CHAVE_MENU = 'measure.menu_recolhido';
const menosMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Contagem({ ate }: { ate: string }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const min = Math.max(0, Math.round((new Date(ate).getTime() - agora) / 60000));
  return <>{min} min</>;
}

export function AppLayout() {
  const { contexto, ehPlataforma, orgao, vinculosDoOrgao, suporte, escolherOrgao, pode, sair, recarregar } = useSessao();
  const [menuAberto, setMenuAberto] = useState(false);
  const [orgaosAbertos, setOrgaosAbertos] = useState(false);
  const [recolhido, setRecolhido] = useState(() => { try { return localStorage.getItem(CHAVE_MENU) === '1'; } catch { return false; } });
  const lateralRef = useRef<HTMLElement>(null);
  const cabecalhoRef = useRef<HTMLElement>(null);
  const principalRef = useRef<HTMLElement>(null);
  const local = useLocation();
  const navegar = useNavigate();
  useEffect(() => { setMenuAberto(false); setOrgaosAbertos(false); }, [local.pathname]);
  useEffect(() => definirOrgaoMonitorado(orgao?.id ?? null), [orgao?.id]);

  const perfil = contexto!.perfil!;
  const foto = useQuery({ queryKey: ['url', 'avatares', perfil.avatar_path], queryFn: () => urlArquivo('avatares', perfil.avatar_path), enabled: !!perfil.avatar_path });
  const logo = useQuery({ queryKey: ['url', 'arquivos', orgao?.logo_path], queryFn: () => urlArquivo('arquivos', orgao?.logo_path), enabled: !!orgao?.logo_path });

  // órgãos dos vínculos (sem repetir)
  const orgaosDoUsuario = [...new Map(contexto!.vinculos.filter((v) => v.tenant.ativo)
    .map((v) => [v.tenant.id, v.tenant])).values()];
  const papelAtual = vinculosDoOrgao.map((v) => v.unidade ? `${v.papel_nome} · ${v.unidade.sigla ?? v.unidade.nome}` : v.papel_nome).join(' | ');

  const fecharMenu = () => setMenuAberto(false);

  // Recolher/expandir: a borda do menu corre (recorte animado no CSS), o conteúdo e os itens acompanham,
  // e ao expandir os nomes reaparecem um após o outro
  const alternarMenu = () => {
    const novo = !recolhido;
    try { localStorage.setItem(CHAVE_MENU, novo ? '1' : '0'); } catch { /* sem armazenamento */ }
    if (menosMovimento()) { setRecolhido(novo); return; }
    const conteudo = [cabecalhoRef.current, principalRef.current].filter((e): e is HTMLElement => !!e);
    const antesX = conteudo.map((e) => e.getBoundingClientRect().left);
    const itens = () => [...(lateralRef.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? [])];
    const antesY = new Map(itens().map((e) => [e.dataset.flip, e.getBoundingClientRect().top]));
    flushSync(() => setRecolhido(novo));
    conteudo.forEach((e, i) => {
      const dx = antesX[i] - e.getBoundingClientRect().left;
      if (dx) e.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], ANIMACAO);
    });
    for (const e of itens()) {
      const dy = (antesY.get(e.dataset.flip) ?? e.getBoundingClientRect().top) - e.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], ANIMACAO);
    }
    if (!novo) {
      lateralRef.current?.querySelectorAll<HTMLElement>('[data-rotulo]').forEach((e, i) =>
        e.animate([{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }],
          { ...ANIMACAO, delay: ANIMACAO.duration * 0.35 + i * 12, fill: 'backwards' }));
    }
  };
  const pendencias = usePendencias();
  const pendentesDe: Record<string, number> = { '/notas': pendencias.atesto, '/pagamentos': pendencias.pagamento };
  const administracao = ADMINISTRACAO.filter((i) => !i.recurso || pode(i.recurso, 'ler'));
  const cadastros = CADASTROS.filter((i) => !i.recurso || pode(i.recurso, 'ler'));

  const menuLateral = (rec: boolean) => (
    <nav className="flex h-full flex-col bg-marca-900 px-3 pb-4 text-white" aria-label="Menu principal">
      <div className="flex h-16 items-center justify-between px-2" style={rec ? { width: LARGURA_RECOLHIDO - 24 } : undefined}>
        {rec ? <Simbolo clara className="h-7 w-auto" /> : <span data-rotulo><Marca clara /></span>}
        <button className="rounded-md p-1 text-marca-200 hover:bg-white/10 lg:hidden" onClick={fecharMenu} aria-label="Fechar menu"><X className="size-5" /></button>
      </div>
      <div className="-mx-1 flex-1 overflow-y-auto overflow-x-hidden px-1" style={rec ? { width: LARGURA_RECOLHIDO - 16 } : undefined}>
        <Link item={{ para: '/', rotulo: 'Início', icone: <Home className="size-4" /> }} aoNavegar={fecharMenu} recolhido={rec} />
        {orgao && <Link item={{ para: '/conecta', rotulo: 'CONECTA', icone: <MessagesSquare className="size-4" /> }} aoNavegar={fecharMenu} recolhido={rec} />}
        {orgao && (
          <Grupo titulo="Gestão" recolhido={rec}>{GESTAO.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} recolhido={rec} />)}</Grupo>
        )}
        {orgao && (
          <Grupo titulo="Contratos e execução" recolhido={rec}>{EXECUCAO.filter((i) => !i.recurso || pode(i.recurso, i.acao ?? 'ler')).map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} pendentes={pendentesDe[i.para]} recolhido={rec} />)}</Grupo>
        )}
        {orgao && (
          <Grupo titulo="Gestão patrimonial" recolhido={rec}>
            {(pode('patrimonio', 'ler') ? PATRIMONIO.filter((i) => !i.recurso || pode(i.recurso, i.acao ?? 'ler')) : [MEUS_BENS, PATRIMONIO.find((i) => i.para === '/patrimonio/pendencias')!])
              .map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} recolhido={rec} />)}
          </Grupo>
        )}
        {orgao && cadastros.length > 0 && (
          <Grupo titulo="Cadastros" recolhido={rec}>{cadastros.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} recolhido={rec} />)}</Grupo>
        )}
        {orgao && administracao.length > 0 && (
          <Grupo titulo="Administração" recolhido={rec}>{administracao.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} recolhido={rec} />)}</Grupo>
        )}
        {ehPlataforma && (
          <Grupo titulo="Plataforma" recolhido={rec}>{PLATAFORMA.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} recolhido={rec} />)}</Grupo>
        )}
        <Grupo titulo="Suporte" recolhido={rec}>
          <Link item={{ para: '/ajuda', rotulo: 'Ajuda e manual', icone: <HelpCircle className="size-4" /> }} aoNavegar={fecharMenu} recolhido={rec} />
          <Link item={{ para: '/ajuda/capacitacao', rotulo: 'Capacitação de fiscais', icone: <GraduationCap className="size-4" /> }} aoNavegar={fecharMenu} recolhido={rec} />
        </Grupo>
      </div>
    </nav>
  );

  return (
    <div className={cx('min-h-dvh overflow-x-clip', recolhido ? 'lg:pl-20' : 'lg:pl-64')}>
      {/* o painel mantém a largura; só a borda corre (recorte animado) */}
      <aside ref={lateralRef} className="menu-lateral fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"
        style={{ clipPath: recolhido ? `inset(0 calc(100% - ${LARGURA_RECOLHIDO}px) 0 0)` : 'inset(0 0 0 0)' }}>{menuLateral(recolhido)}</aside>
      {/* alça na borda do menu: acompanha a borda e a seta gira */}
      <button type="button" onClick={alternarMenu} aria-expanded={!recolhido} aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
        title={recolhido ? 'Expandir menu' : 'Recolher menu'}
        className="menu-alca fixed top-[76px] z-40 hidden size-7 items-center justify-center rounded-full border border-marca-700 bg-marca-800 text-marca-100 shadow-md hover:bg-marca-700 hover:text-white lg:flex"
        style={{ left: (recolhido ? LARGURA_RECOLHIDO : 256) - 14 }}>
        <ChevronLeft className="menu-seta size-4" style={{ transform: recolhido ? 'rotate(180deg)' : 'none' }} />
      </button>
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={fecharMenu} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{menuLateral(false)}</aside>
        </div>
      )}

      <header ref={cabecalhoRef} className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Menu className="size-5" /></button>

          <div className="relative min-w-0 flex-1">
            <button className="flex max-w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
              onClick={() => setOrgaosAbertos((v) => !v)} aria-expanded={orgaosAbertos} aria-haspopup="listbox">
              {logo.data
                ? <img src={logo.data} alt="" className="size-9 shrink-0 rounded object-contain" />
                : <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Landmark className="size-5" /></span>}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{orgao?.nome_curto ?? 'Nenhum órgão selecionado'}</span>
                <span className="block truncate text-xs text-slate-500">{papelAtual || (ehPlataforma ? 'Administrador da plataforma' : 'Sem vínculo ativo')}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-slate-400" />
            </button>
            {orgaosAbertos && (
              <div className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-lg" role="listbox">
                {orgaosDoUsuario.map((t) => (
                  <button key={t.id} role="option" aria-selected={t.id === orgao?.id}
                    className={cx('block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50', t.id === orgao?.id && 'bg-marca-50 font-medium')}
                    onClick={() => { escolherOrgao({ id: t.id, nome_curto: t.nome_curto, nome_oficial: t.nome_oficial, logo_path: t.logo_path }); setOrgaosAbertos(false); }}>
                    {t.nome_curto}<span className="block truncate text-xs font-normal text-slate-500">{t.nome_oficial}</span>
                  </button>
                ))}
                {orgaosDoUsuario.length === 0 && !ehPlataforma && <p className="px-3 py-2 text-sm text-slate-500">Você ainda não tem vínculo com nenhum órgão.</p>}
                {ehPlataforma && (
                  <button className="mt-1 block w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm text-marca-700 hover:bg-slate-50"
                    onClick={() => navegar('/plataforma/orgaos')}>Escolher qualquer órgão da plataforma…</button>
                )}
              </div>
            )}
          </div>

          <Notificacoes />
          <NavLink to="/meu-perfil" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50" title="Meu perfil">
            <Avatar nome={perfil.nome || perfil.email} url={foto.data} />
            <span className="hidden max-w-40 truncate text-sm text-slate-700 md:block">{perfil.nome || perfil.email}</span>
          </NavLink>
          <Botao variante="fantasma" pequeno onClick={() => void sair()} icone={<LogOut className="size-4" />} aria-label="Sair">
            <span className="hidden sm:inline">Sair</span>
          </Botao>
        </div>

        {suporte && (
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6" role="status">
            <LifeBuoy className="size-4" aria-hidden />
            <span className="flex-1">Sessão de suporte ativa neste órgão: os dados operacionais estão liberados e tudo é auditado. Termina em <Contagem ate={suporte.expira_em} />.</span>
            <Botao pequeno variante="secundario" onClick={async () => {
              try { await encerrarSuporte(suporte.id); await recarregar(); toast.success('Sessão de suporte encerrada.'); }
              catch (e) { toast.error(mensagemDeErro(e)); }
            }}>Encerrar</Botao>
          </div>
        )}
        {orgao && <FocoCoordenacao />}
        {ehPlataforma && orgao && !suporte && vinculosDoOrgao.length === 0 && (
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 sm:px-6">
            <ShieldCheck className="size-4" aria-hidden />
            Você está administrando este órgão como plataforma (estrutura, usuários e configurações). Dados operacionais exigem sessão de suporte.
          </div>
        )}
      </header>

      <main ref={principalRef} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <LimiteDeErro key={local.pathname}><Suspense fallback={<Carregando />}><Outlet /></Suspense></LimiteDeErro>
      </main>
    </div>
  );
}
