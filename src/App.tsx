import { Loader2, ShieldOff } from 'lucide-react';
import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { AppLayout } from '@/components/layout/AppLayout';
import { Marca } from '@/components/layout/Marca';
import { Botao, Carregando } from '@/components/ui/basicos';
import { precisaDefinirSenha } from '@/lib/supabase';
import { DefinirSenha, Entrar, EsqueciSenha } from '@/pages/Acesso';
import { Inicio } from '@/pages/Inicio';

// Cada módulo é carregado só quando aberto (o primeiro acesso fica mais leve)
const pagina = <T extends string>(carregar: () => Promise<Record<T, ComponentType>>, nome: T) =>
  lazy(() => carregar().then((m) => ({ default: m[nome] })));
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

function TelaCheia({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-white p-6 text-center">{children}</div>;
}

export function App() {
  const { sessao, carregando, contexto, sair } = useSessao();

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
        <Route path="servidores" element={<Servidores />} />
        <Route path="servidores/consolidado" element={<Consolidado />} />
        <Route path="ajuda" element={<Ajuda />} />
        <Route path="ajuda/capacitacao" element={<Capacitacao />} />
        <Route path="unidades-atendidas" element={<UnidadesAtendidas />} />
        <Route path="classificacao" element={<Classificacao />} />
        <Route path="tipos-servico" element={<TiposServico />} />
        <Route path="contratos" element={<Contratos />} />
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
        <Route path="entrar" element={<Navigate to="/" replace />} />
        <Route path="*" element={<div className="py-16 text-center text-sm text-slate-600">Página não encontrada.</div>} />
      </Route>
    </Routes>
    </Suspense>
  );
}
