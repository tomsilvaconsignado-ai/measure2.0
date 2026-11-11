import { Loader2, ShieldOff } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { AppLayout } from '@/components/layout/AppLayout';
import { Marca } from '@/components/layout/Marca';
import { Botao, Carregando } from '@/components/ui/basicos';
import { precisaDefinirSenha } from '@/lib/supabase';
import { DefinirSenha, Entrar, EsqueciSenha } from '@/pages/Acesso';
import { Inicio } from '@/pages/Inicio';
import { ModuloPatrimonio } from '@/pages/patrimonio/Layout';
import { ModuloServidores } from '@/pages/cadastros/AbasServidores';

// Cada módulo é carregado só quando aberto (o primeiro acesso fica mais leve) e, depois do login,
// baixado em segundo plano quando o navegador está ocioso: a primeira abertura de cada tela fica instantânea.
const carregadores: Array<() => Promise<unknown>> = [];
// Tela já baixada é desenhada direto, sem suspender: o React segura por 300 ms a troca de uma tela suspensa
const pagina = <T extends string>(carregar: () => Promise<Record<T, ComponentType>>, nome: T) => {
  let pronta: ComponentType | null = null;
  const baixar = () => carregar().then((m) => { pronta = m[nome]; return m; });
  carregadores.push(baixar);
  const Preguicosa = lazy(() => baixar().then((m) => ({ default: m[nome] as ComponentType })));
  return function Pagina() {
    // decidido uma vez ao abrir a tela: trocar de componente depois recriaria a tela e perderia o que foi preenchido
    const [Tela] = useState(() => pronta ?? Preguicosa);
    return <Tela />;
  };
};

/** Baixa o código das telas em segundo plano, uma de cada vez, sem disputar com o que a pessoa está fazendo */
let preCarregado = false;
export function preCarregarTelas() {
  if (preCarregado) return;
  preCarregado = true;
  return preCarregarTodas();
}
function preCarregarTodas() {
  const ocioso = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));
  const fila = [...carregadores];
  const proxima = () => { const c = fila.shift(); if (c) ocioso(() => { void c().catch(() => undefined).finally(proxima); }); };
  proxima();
}
const Auditoria = pagina(() => import('@/pages/Auditoria'), 'Auditoria');
const Configuracoes = pagina(() => import('@/pages/Configuracoes'), 'Configuracoes');
const Estrutura = pagina(() => import('@/pages/Estrutura'), 'Estrutura');
const MeuPerfil = pagina(() => import('@/pages/MeuPerfil'), 'MeuPerfil');
const Orgaos = pagina(() => import('@/pages/plataforma/Orgaos'), 'Orgaos');
const Permissoes = pagina(() => import('@/pages/plataforma/Permissoes'), 'Permissoes');
const Usuarios = pagina(() => import('@/pages/Usuarios'), 'Usuarios');
const Classificacao = pagina(() => import('@/pages/cadastros/Classificacao'), 'Classificacao');
const Fornecedores = pagina(() => import('@/pages/cadastros/Fornecedores'), 'Fornecedores');
const Servidores = pagina(() => import('@/pages/cadastros/Servidores'), 'Servidores');
const TiposServico = pagina(() => import('@/pages/cadastros/TiposServico'), 'TiposServico');
const UnidadesAtendidas = pagina(() => import('@/pages/cadastros/UnidadesAtendidas'), 'UnidadesAtendidas');
const ContratoDetalhe = pagina(() => import('@/pages/contratos/ContratoDetalhe'), 'ContratoDetalhe');
const Contratos = pagina(() => import('@/pages/contratos/Contratos'), 'Contratos');
const MeusContratos = pagina(() => import('@/pages/contratos/MeusContratos'), 'MeusContratos');
const Empenhos = pagina(() => import('@/pages/contratos/Empenhos'), 'Empenhos');
const Imprimir = pagina(() => import('@/pages/contratos/Imprimir'), 'Imprimir');
const Notas = pagina(() => import('@/pages/contratos/Notas'), 'Notas');
const Pagamentos = pagina(() => import('@/pages/contratos/Pagamentos'), 'Pagamentos');
const Relatorios = pagina(() => import('@/pages/relatorios/Relatorios'), 'Relatorios');
const RelatorioImprimir = pagina(() => import('@/pages/relatorios/RelatorioImprimir'), 'RelatorioImprimir');
const Painel = pagina(() => import('@/pages/Painel'), 'Painel');
const OrdensServico = pagina(() => import('@/pages/OrdensServico'), 'OrdensServico');
const Consolidado = pagina(() => import('@/pages/cadastros/Consolidado'), 'Consolidado');
const Ajuda = pagina(() => import('@/pages/Ajuda'), 'Ajuda');
const Capacitacao = pagina(() => import('@/pages/ajuda/Capacitacao'), 'Capacitacao');
const Erros = pagina(() => import('@/pages/plataforma/Erros'), 'Erros');
const Dotacoes = pagina(() => import('@/pages/plataforma/Dotacoes'), 'Dotacoes');
const Monitoramento = pagina(() => import('@/pages/plataforma/Monitoramento'), 'Monitoramento');
const PainelNotificacoes = pagina(() => import('@/pages/plataforma/PainelNotificacoes'), 'PainelNotificacoes');
const MinhasNotificacoes = pagina(() => import('@/pages/MinhasNotificacoes'), 'MinhasNotificacoes');
const Conecta = pagina(() => import('@/pages/conecta/Conecta'), 'Conecta');
const ConectaAdmin = pagina(() => import('@/pages/conecta/ConectaAdmin'), 'ConectaAdmin');
const PainelPatrimonio = pagina(() => import('@/pages/patrimonio/Painel'), 'PainelPatrimonio');
const CadastroPatrimonio = pagina(() => import('@/pages/patrimonio/Bens'), 'CadastroPatrimonio');
const BensPatrimonio = pagina(() => import('@/pages/patrimonio/Bens'), 'Bens');
const PorCoordenacao = pagina(() => import('@/pages/patrimonio/Relatorios'), 'PorCoordenacao');
const PorUnidade = pagina(() => import('@/pages/patrimonio/Relatorios'), 'PorUnidade');
const Responsaveis = pagina(() => import('@/pages/patrimonio/Relatorios'), 'Responsaveis');
const MovimentacoesPatrimonio = pagina(() => import('@/pages/patrimonio/Movimentacoes'), 'Movimentacoes');
const Transferencias = pagina(() => import('@/pages/patrimonio/Movimentacoes'), 'Transferencias');
const Trocas = pagina(() => import('@/pages/patrimonio/Movimentacoes'), 'Trocas');
const Substituicoes = pagina(() => import('@/pages/patrimonio/Movimentacoes'), 'Substituicoes');
const PendenciasPatrimonio = pagina(() => import('@/pages/patrimonio/Movimentacoes'), 'Pendencias');
const InventarioPatrimonio = pagina(() => import('@/pages/patrimonio/Inventario'), 'Inventario');
const RelatoriosPatrimonio = pagina(() => import('@/pages/patrimonio/Relatorios'), 'Relatorios');
const HistoricoPatrimonio = pagina(() => import('@/pages/patrimonio/Relatorios'), 'Historico');
const ConfiguracoesPatrimonio = pagina(() => import('@/pages/patrimonio/Configuracoes'), 'ConfiguracoesPatrimonio');

function TelaCheia({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-white p-6 text-center">{children}</div>;
}

export function App() {
  const { sessao, carregando, contexto, sair } = useSessao();
  const logado = !!sessao && !!contexto?.perfil?.ativo;
  useEffect(() => { if (logado) preCarregarTelas(); }, [logado]);

  if (carregando) {
    return <TelaCheia><Marca /><Loader2 className="size-6 animate-spin text-marca-600" aria-label="Carregando" /></TelaCheia>;
  }

  if (!sessao) {
    return (
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );
  }

  const tipoLink = precisaDefinirSenha();
  if (tipoLink) return <DefinirSenha tipo={tipoLink} />;

  if (!contexto?.perfil || !contexto.perfil.ativo) {
    return (
      <TelaCheia>
        <Marca />
        <ShieldOff className="size-10 text-slate-300" />
        <div>
          <p className="font-medium text-slate-900">{contexto?.perfil ? 'Conta suspensa' : 'Conta sem cadastro no sistema'}</p>
          <p className="mt-1 max-w-md text-sm text-slate-600">Procure o administrador do seu órgão para liberar o acesso.</p>
        </div>
        <Botao variante="secundario" onClick={() => void sair()}>Sair</Botao>
      </TelaCheia>
    );
  }

  return (
    <Suspense fallback={<Carregando />}>
    <Routes>
      <Route path="imprimir/:id" element={<Imprimir />} />
      <Route path="relatorios/imprimir" element={<RelatorioImprimir />} />
      <Route element={<AppLayout />}>
        <Route index element={<Inicio />} />
        <Route path="estrutura" element={<Estrutura />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="meu-perfil" element={<MeuPerfil />} />
        <Route path="fornecedores" element={<Fornecedores />} />
        <Route path="servidores" element={<ModuloServidores><Servidores /></ModuloServidores>} />
        <Route path="servidores/consolidado" element={<ModuloServidores><Consolidado /></ModuloServidores>} />
        <Route path="ajuda" element={<Ajuda />} />
        <Route path="ajuda/capacitacao" element={<Capacitacao />} />
        <Route path="unidades-atendidas" element={<UnidadesAtendidas />} />
        <Route path="classificacao" element={<Classificacao />} />
        <Route path="tipos-servico" element={<TiposServico />} />
        <Route path="contratos" element={<Contratos />} />
        <Route path="meus-contratos" element={<MeusContratos />} />
        <Route path="contratos/:id" element={<ContratoDetalhe />} />
        <Route path="empenhos" element={<Empenhos />} />
        <Route path="notas" element={<Notas />} />
        <Route path="pagamentos" element={<Pagamentos />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="painel" element={<Painel />} />
        <Route path="ordens-servico" element={<OrdensServico />} />
        <Route path="plataforma/orgaos" element={<Orgaos />} />
        <Route path="plataforma/permissoes" element={<Permissoes />} />
        <Route path="plataforma/erros" element={<Erros />} />
        <Route path="plataforma/dotacoes" element={<Dotacoes />} />
        <Route path="plataforma/monitoramento" element={<Monitoramento />} />
        <Route path="plataforma/notificacoes" element={<PainelNotificacoes />} />
        <Route path="minhas-notificacoes" element={<MinhasNotificacoes />} />
        <Route path="conecta" element={<Conecta />} />
        <Route path="conecta/admin" element={<ConectaAdmin />} />
        <Route path="patrimonio" element={<ModuloPatrimonio><PainelPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/cadastro" element={<ModuloPatrimonio><CadastroPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/bens" element={<ModuloPatrimonio><BensPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/por-coordenacao" element={<ModuloPatrimonio><PorCoordenacao /></ModuloPatrimonio>} />
        <Route path="patrimonio/por-unidade" element={<ModuloPatrimonio><PorUnidade /></ModuloPatrimonio>} />
        <Route path="patrimonio/responsaveis" element={<ModuloPatrimonio><Responsaveis /></ModuloPatrimonio>} />
        <Route path="patrimonio/movimentacoes" element={<ModuloPatrimonio><MovimentacoesPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/transferencias" element={<ModuloPatrimonio><Transferencias /></ModuloPatrimonio>} />
        <Route path="patrimonio/trocas" element={<ModuloPatrimonio><Trocas /></ModuloPatrimonio>} />
        <Route path="patrimonio/substituicoes" element={<ModuloPatrimonio><Substituicoes /></ModuloPatrimonio>} />
        <Route path="patrimonio/inventario" element={<ModuloPatrimonio><InventarioPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/pendencias" element={<ModuloPatrimonio><PendenciasPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/relatorios" element={<ModuloPatrimonio><RelatoriosPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/historico" element={<ModuloPatrimonio><HistoricoPatrimonio /></ModuloPatrimonio>} />
        <Route path="patrimonio/configuracoes" element={<ModuloPatrimonio><ConfiguracoesPatrimonio /></ModuloPatrimonio>} />
        <Route path="entrar" element={<Navigate to="/" replace />} />
        <Route path="*" element={<div className="py-16 text-center text-sm text-slate-600">Página não encontrada.</div>} />
      </Route>
    </Routes>
    </Suspense>
  );
}
