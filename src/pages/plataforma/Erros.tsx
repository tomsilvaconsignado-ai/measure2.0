// Erros registrados pelo navegador dos usuários (monitoramento), visíveis só para a plataforma.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSessao } from '@/auth/Sessao';
import { Botao, CabecalhoPagina, CaixaErro, Cartao, Carregando, SemPermissao, Vazio } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import { listarErros } from '@/services/consolidado';

export function Erros() {
  const { ehPlataforma } = useSessao();
  const [aberto, setAberto] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['erros-aplicativo'], queryFn: () => listarErros(100), enabled: ehPlataforma });
  if (!ehPlataforma) return <SemPermissao />;
  return (
    <>
      <CabecalhoPagina titulo="Erros do sistema" descricao="Falhas registradas no navegador dos usuários (últimas 100). Use para acompanhar problemas depois de cada publicação."
        acoes={<Botao variante="secundario" carregando={q.isFetching} onClick={() => q.refetch()}>Atualizar</Botao>} />
      <Cartao>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data!.length ? (
          <Vazio titulo="Nenhum erro registrado" descricao="Quando uma tela falhar no navegador de alguém, o erro aparece aqui." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {q.data!.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <button className="w-full text-left" onClick={() => setAberto(aberto === e.id ? null : e.id)} aria-expanded={aberto === e.id}>
                  <span className="block break-words font-medium text-slate-900">{e.mensagem}</span>
                  <span className="block text-xs text-slate-500">{formatarDataHora(e.ocorrido_em)} · {e.pagina ?? '—'} · versão {e.versao ?? '—'}</span>
                </button>
                {aberto === e.id && (
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{[e.navegador, e.pilha].filter(Boolean).join('\n\n')}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}
