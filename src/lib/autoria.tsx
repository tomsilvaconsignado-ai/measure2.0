// Autoria dos registros na tela: quem cadastrou (ou quem tem "aprovar", como o Master) altera e exclui;
// os demais só consultam. O banco aplica a mesma regra (gatilhos de autoria); aqui só se esconde o botão.
import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { useCallback } from 'react';
import { useSessao } from '@/auth/Sessao';
import { supabase } from '@/lib/supabase';
import type { Recurso } from './tipos';

/** (recurso, autor) => a pessoa logada pode alterar/excluir o registro? Registro antigo sem autor: sim. */
export function useAutoria() {
  const { contexto, pode, ehPlataforma } = useSessao();
  const uid = contexto?.perfil?.id;
  // espelha pode_alterar_registro(): autor, plataforma ou quem tem "aprovar"
  return useCallback((recurso: Recurso, autor: string | null | undefined) => !autor || autor === uid || ehPlataforma || pode(recurso, 'aprovar'), [uid, pode, ehPlataforma]);
}

/** "Cadastrado por Fulano" (e o aviso de somente consulta para quem não é o autor) */
export function CadastradoPor({ autor, recurso, className }: { autor: string | null | undefined; recurso: Recurso; className?: string }) {
  const { orgao, contexto } = useSessao();
  const podeAlterar = useAutoria();
  const q = useQuery({
    queryKey: ['autor', orgao?.id, autor], enabled: !!orgao && !!autor, staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('autores_do_orgao', { p_tenant: orgao!.id, p_ids: [autor] });
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; nome: string }>)[0]?.nome ?? null;
    },
  });
  if (!autor) return null;
  const eu = autor === contexto?.perfil?.id;
  return (
    <p className={className ?? 'flex flex-wrap items-center gap-1.5 text-xs text-slate-500'}>
      <UserRound className="size-3.5" aria-hidden />
      Cadastrado por {eu ? 'você' : q.data ?? 'outro administrador'}
      {!eu && !podeAlterar(recurso, autor) && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">somente consulta: só o autor altera ou exclui</span>}
    </p>
  );
}
