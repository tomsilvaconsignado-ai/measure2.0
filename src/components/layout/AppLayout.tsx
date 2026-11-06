import { useQuery } from '@tanstack/react-query';
import {
  Building2, ChevronDown, ClipboardList, FileSpreadsheet, FileText, FolderTree, Home, KeyRound, Landmark, LifeBuoy,
  ListChecks, LogOut, Menu, Receipt, ScrollText, Settings, ShieldCheck, Truck, UserCircle, Users, Wallet, X, Network, BarChart3,
  CalendarCheck, Bug, HelpCircle, GraduationCap,
} from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { mensagemDeErro } from '@/lib/erros';
import { encerrarSuporte, urlArquivo } from '@/services/api';
import { Avatar, Botao, Carregando, cx } from '../ui/basicos';
import { Marca } from './Marca';
import { Notificacoes } from './Notificacoes';
import { definirOrgaoMonitorado, LimiteDeErro } from '@/lib/monitoramento';
import type { Recurso } from '@/lib/tipos';

interface Item { para: string; rotulo: string; icone: ReactNode; recurso?: Recurso; plataforma?: boolean }

const ADMINISTRACAO: Item[] = [
  { para: '/estrutura', rotulo: 'Estrutura organizacional', icone: <FolderTree className="size-4" />, recurso: 'estrutura' },
  { para: '/usuarios', rotulo: 'Usuários e acessos', icone: <Users className="size-4" />, recurso: 'usuarios' },
  { para: '/configuracoes', rotulo: 'Configurações do órgão', icone: <Settings className="size-4" />, recurso: 'configuracoes' },
  { para: '/auditoria', rotulo: 'Auditoria', icone: <ScrollText className="size-4" />, recurso: 'auditoria' },
];
const PLATAFORMA: Item[] = [
  { para: '/plataforma/orgaos', rotulo: 'Órgãos', icone: <Landmark className="size-4" />, plataforma: true },
  { para: '/plataforma/permissoes', rotulo: 'Matriz de permissões', icone: <KeyRound className="size-4" />, plataforma: true },
  { para: '/plataforma/dotacoes', rotulo: 'Dotações orçamentárias', icone: <Network className="size-4" />, plataforma: true },
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
  { para: '/ordens-servico', rotulo: 'Ordens de serviço', icone: <ClipboardList className="size-4" />, recurso: 'ordens_servico' },
];
const GESTAO: Item[] = [
  { para: '/painel', rotulo: 'Painel gerencial', icone: <BarChart3 className="size-4" /> },
  { para: '/relatorios', rotulo: 'Consulta e relatórios', icone: <FileSpreadsheet className="size-4" /> },
];

function Link({ item, aoNavegar }: { item: Item; aoNavegar: () => void }) {
  return (
    <NavLink to={item.para} onClick={aoNavegar} end={item.para === '/' || item.para === '/servidores' || item.para === '/ajuda'}
      className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
        isActive ? 'bg-white/12 font-medium text-white' : 'text-marca-100 hover:bg-white/8 hover:text-white')}>
      {item.icone}<span className="truncate">{item.rotulo}</span>
    </NavLink>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-marca-300">{titulo}</p>
      {children}
    </div>
  );
}

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
  const administracao = ADMINISTRACAO.filter((i) => !i.recurso || pode(i.recurso, 'ler'));
  const cadastros = CADASTROS.filter((i) => !i.recurso || pode(i.recurso, 'ler'));

  const lateral = (
    <nav className="flex h-full flex-col bg-marca-900 px-3 pb-4 text-white" aria-label="Menu principal">
      <div className="flex h-16 items-center justify-between px-2">
        <Marca clara />
        <button className="rounded-md p-1 text-marca-200 hover:bg-white/10 lg:hidden" onClick={fecharMenu} aria-label="Fechar menu"><X className="size-5" /></button>
      </div>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <Link item={{ para: '/', rotulo: 'Início', icone: <Home className="size-4" /> }} aoNavegar={fecharMenu} />
        {orgao && (
          <Grupo titulo="Gestão">{GESTAO.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} />)}</Grupo>
        )}
        {orgao && (
          <Grupo titulo="Contratos e execução">{EXECUCAO.filter((i) => !i.recurso || pode(i.recurso, 'ler')).map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} />)}</Grupo>
        )}
        {orgao && cadastros.length > 0 && (
          <Grupo titulo="Cadastros">{cadastros.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} />)}</Grupo>
        )}
        {orgao && administracao.length > 0 && (
          <Grupo titulo="Administração">{administracao.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} />)}</Grupo>
        )}
        {ehPlataforma && (
          <Grupo titulo="Plataforma">{PLATAFORMA.map((i) => <Link key={i.para} item={i} aoNavegar={fecharMenu} />)}</Grupo>
        )}
        <Grupo titulo="Suporte">
          <Link item={{ para: '/ajuda', rotulo: 'Ajuda e manual', icone: <HelpCircle className="size-4" /> }} aoNavegar={fecharMenu} />
          <Link item={{ para: '/ajuda/capacitacao', rotulo: 'Capacitação de fiscais', icone: <GraduationCap className="size-4" /> }} aoNavegar={fecharMenu} />
        </Grupo>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{lateral}</aside>
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={fecharMenu} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{lateral}</aside>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
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
        {ehPlataforma && orgao && !suporte && vinculosDoOrgao.length === 0 && (
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 sm:px-6">
            <ShieldCheck className="size-4" aria-hidden />
            Você está administrando este órgão como plataforma (estrutura, usuários e configurações). Dados operacionais exigem sessão de suporte.
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <LimiteDeErro key={local.pathname}><Suspense fallback={<Carregando />}><Outlet /></Suspense></LimiteDeErro>
      </main>
    </div>
  );
}
