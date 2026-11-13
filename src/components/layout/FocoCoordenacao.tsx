// Para quem enxerga várias coordenações (ex.: consulta da Secretaria inteira): escolhe qual visualizar.
// O filtro vale no banco, para todas as telas e relatórios; só restringe o que a pessoa já pode ver.
import { useQuery } from '@tanstack/react-query';
import { Filter } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/lib/supabase';
import { ListaSelecao } from '@/components/ui/ListaSelecao';

interface Coordenacao { id: string; nome: string; sigla: string | null; diretoria: string | null }

export function FocoCoordenacao() {
  const { orgao, vinculosDoOrgao, foco, definirFoco } = useSessao();
  const [salvando, setSalvando] = useState(false);
  // quem tem vínculo só numa coordenação (ou abaixo dela) não precisa do filtro
  const alcancaVarias = vinculosDoOrgao.some((v) => !v.unidade || ['ORGANIZACAO', 'SECRETARIA', 'DIRETORIA', 'DEPARTAMENTO'].includes(v.unidade.tipo));
  const opcoes = useQuery({
    queryKey: ['coordenacoes-foco', orgao?.id],
    enabled: !!orgao && alcancaVarias,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('coordenacoes_para_foco', { p_tenant: orgao!.id });
      if (error) throw error;
      return data as Coordenacao[];
    },
  });
  if (!alcancaVarias || (opcoes.data?.length ?? 0) < 2) return null;

  const mudar = async (valor: string) => {
    setSalvando(true);
    try { await definirFoco(valor || null); }
    catch (e) { toast.error(mensagemDeErro(e)); }
    finally { setSalvando(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-marca-50/60 px-4 py-2 text-sm sm:px-6">
      <Filter className="size-4 text-marca-700" aria-hidden />
      <label htmlFor="foco-coordenacao" className="font-medium text-slate-700">Coordenação em visualização</label>
      <ListaSelecao id="foco-coordenacao" className="min-w-0 max-w-full flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm sm:max-w-md sm:flex-none"
        value={foco?.unidade_id ?? ''} disabled={salvando} onChange={(e) => void mudar(e.target.value)}>
        <option value="">Todas as coordenações</option>
        {opcoes.data!.map((c) => (
          <option key={c.id} value={c.id}>{[c.diretoria, c.sigla].filter(Boolean).join(' · ')}{c.sigla ? ' — ' : ''}{c.nome}</option>
        ))}
      </ListaSelecao>
      {foco && <span className="text-xs text-slate-500">Mostrando só a {foco.sigla ?? foco.nome}.</span>}
    </div>
  );
}
