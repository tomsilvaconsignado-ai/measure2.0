// Pendências de quem está logado (notas para atestar e fila de pagamento), usadas para destacar
// menu, abas e botões até a ação ser feita. Atualiza junto com as notas (chave ['notas', ...]).
import { useQuery } from '@tanstack/react-query';
import { useSessao } from '@/auth/Sessao';
import { contarPendencias } from '@/services/execucao';

export function usePendencias() {
  const { orgao, pode } = useSessao();
  const podePagar = !!orgao && pode('notas_fiscais', 'editar');
  const q = useQuery({
    queryKey: ['notas', orgao?.id, 'pendencias', podePagar], enabled: !!orgao,
    queryFn: () => contarPendencias(orgao!.id, podePagar), refetchInterval: 120_000,
  });
  return q.data ?? { atesto: 0, pagamento: 0 };
}
