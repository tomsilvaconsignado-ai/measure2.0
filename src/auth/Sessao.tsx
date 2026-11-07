// Sessão do usuário, órgão em uso e permissões para a INTERFACE.
// A segurança de verdade está no banco (RLS + funções); aqui só decidimos o que mostrar.
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Acao, FocoUnidade, MeuContexto, Recurso, SessaoSuporte, VinculoContexto } from '@/lib/tipos';

const CHAVE_TENANT = 'measure.tenant_atual';
// Recursos que a plataforma administra sem sessão de suporte (espelha recursos.livre_para_plataforma)
const LIVRES_PLATAFORMA: Recurso[] = ['estrutura', 'usuarios', 'configuracoes', 'auditoria', 'decretos'];

export interface OrgaoAtual {
  id: string;
  nome_curto: string;
  nome_oficial: string;
  logo_path: string | null;
}

interface ValorSessao {
  sessao: Session | null;
  carregando: boolean;
  contexto: MeuContexto | null;
  ehPlataforma: boolean;
  /** vínculos ativos do usuário no órgão em uso */
  vinculosDoOrgao: VinculoContexto[];
  orgao: OrgaoAtual | null;
  suporte: SessaoSuporte | null;
  /** coordenação em foco no órgão em uso (o banco limita os dados a ela) */
  foco: FocoUnidade | null;
  definirFoco: (unidadeId: string | null) => Promise<void>;
  escolherOrgao: (orgao: OrgaoAtual | null) => void;
  /** a interface deve oferecer a ação? (o banco decide de verdade) */
  pode: (recurso: Recurso, acao: Acao) => boolean;
  recarregar: () => Promise<unknown>;
  sair: () => Promise<void>;
}

const Contexto = createContext<ValorSessao | null>(null);

function lerTenantSalvo(): string | null {
  try { return localStorage.getItem(CHAVE_TENANT); } catch { return null; }
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [iniciando, setIniciando] = useState(true);
  const [orgaoEscolhido, setOrgaoEscolhido] = useState<OrgaoAtual | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); setIniciando(false); });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'SIGNED_IN') {
        void supabase.rpc('registrar_acesso').then(() => qc.invalidateQueries({ queryKey: ['meu_contexto'] }));
      }
      if (evento === 'SIGNED_OUT') qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const uid = sessao?.user.id;
  const q = useQuery({
    queryKey: ['meu_contexto', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meu_contexto');
      if (error) throw error;
      return data as MeuContexto;
    },
  });
  const contexto = q.data ?? null;
  const ehPlataforma = !!contexto?.perfil?.is_platform_admin && !!contexto.perfil.ativo;

  // Órgão em uso: escolhido na sessão, o salvo no navegador ou o do vínculo padrão
  const orgao = useMemo<OrgaoAtual | null>(() => {
    if (!contexto) return null;
    const vinculos = contexto.vinculos.filter((v) => v.tenant.ativo || ehPlataforma);
    if (orgaoEscolhido) return orgaoEscolhido;
    const salvo = lerTenantSalvo();
    const v = vinculos.find((x) => x.tenant.id === salvo) ?? vinculos.find((x) => x.padrao) ?? vinculos[0];
    return v ? { id: v.tenant.id, nome_curto: v.tenant.nome_curto, nome_oficial: v.tenant.nome_oficial, logo_path: v.tenant.logo_path } : null;
  }, [contexto, orgaoEscolhido, ehPlataforma]);

  const vinculosDoOrgao = useMemo(
    () => (contexto?.vinculos ?? []).filter((v) => v.tenant.id === orgao?.id && v.tenant.ativo),
    [contexto, orgao],
  );
  const suporte = useMemo(
    () => contexto?.suportes.find((s) => s.tenant_id === orgao?.id && new Date(s.expira_em) > new Date()) ?? null,
    [contexto, orgao],
  );

  const foco = useMemo(() => contexto?.focos?.find((f) => f.tenant_id === orgao?.id) ?? null, [contexto, orgao]);
  const definirFoco = useCallback(async (unidadeId: string | null) => {
    if (!orgao) return;
    const { error } = await supabase.rpc('definir_foco', { p_tenant: orgao.id, p_unidade: unidadeId });
    if (error) throw error;
    await q.refetch();
    // todas as telas passam a mostrar só a coordenação escolhida
    await qc.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'meu_contexto' });
  }, [orgao, q, qc]);

  const pode = useCallback((recurso: Recurso, acao: Acao) => {
    if (!orgao) return false;
    if (ehPlataforma && (LIVRES_PLATAFORMA.includes(recurso) || suporte)) return true;
    return vinculosDoOrgao.some((v) => v.permissoes.includes(`${recurso}:${acao}`));
  }, [orgao, ehPlataforma, suporte, vinculosDoOrgao]);

  const escolherOrgao = useCallback((o: OrgaoAtual | null) => {
    setOrgaoEscolhido(o);
    try { if (o) localStorage.setItem(CHAVE_TENANT, o.id); else localStorage.removeItem(CHAVE_TENANT); } catch { /* sem armazenamento */ }
    void qc.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'meu_contexto' });
  }, [qc]);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    setOrgaoEscolhido(null);
  }, []);

  const valor: ValorSessao = {
    sessao, carregando: iniciando || (!!uid && q.isLoading), contexto, ehPlataforma,
    vinculosDoOrgao, orgao, suporte, foco, definirFoco, escolherOrgao, pode, recarregar: q.refetch, sair,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useSessao fora do SessaoProvider');
  return v;
}
