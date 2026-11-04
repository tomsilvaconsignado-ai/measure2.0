import { Loader2, ShieldOff } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { AppLayout } from '@/components/layout/AppLayout';
import { Marca } from '@/components/layout/Marca';
import { Botao } from '@/components/ui/basicos';
import { precisaDefinirSenha } from '@/lib/supabase';
import { DefinirSenha, Entrar, EsqueciSenha } from '@/pages/Acesso';
import { Auditoria } from '@/pages/Auditoria';
import { Configuracoes } from '@/pages/Configuracoes';
import { Estrutura } from '@/pages/Estrutura';
import { Inicio } from '@/pages/Inicio';
import { MeuPerfil } from '@/pages/MeuPerfil';
import { Orgaos } from '@/pages/plataforma/Orgaos';
import { Permissoes } from '@/pages/plataforma/Permissoes';
import { Usuarios } from '@/pages/Usuarios';

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
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Inicio />} />
        <Route path="estrutura" element={<Estrutura />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="meu-perfil" element={<MeuPerfil />} />
        <Route path="plataforma/orgaos" element={<Orgaos />} />
        <Route path="plataforma/permissoes" element={<Permissoes />} />
        <Route path="entrar" element={<Navigate to="/" replace />} />
        <Route path="*" element={<div className="py-16 text-center text-sm text-slate-600">Página não encontrada.</div>} />
      </Route>
    </Routes>
  );
}
