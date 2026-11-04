import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { CabecalhoPagina, CaixaErro, Cartao, Carregando, Selo, cx } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import type { Papel } from '@/lib/tipos';
import { alternarPermissao, catalogoPermissoes } from '@/services/api';

// Leitura para todos os autenticados; edição só para a plataforma (o banco impõe as duas coisas)
export function Permissoes() {
  const { ehPlataforma, recarregar } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['catalogo-permissoes'], queryFn: catalogoPermissoes });
  const [papelSel, setPapelSel] = useState<Papel>('ADMINISTRATIVO');
  const mudar = useMutation({
    mutationFn: (p: { recurso: string; acao: string; ligar: boolean }) => alternarPermissao(papelSel, p.recurso, p.acao, p.ligar),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['catalogo-permissoes'] }); await recarregar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />;
  const { papeis, recursos, acoes, matriz, concede } = q.data!;
  const papel = papeis.find((p) => p.codigo === papelSel)!;
  const tem = new Set(matriz.filter((m) => m.papel === papelSel).map((m) => `${m.recurso}:${m.acao}`));
  const grupos = [...new Set(recursos.map((r) => r.grupo))];

  return (
    <>
      <CabecalhoPagina titulo="Matriz de permissões"
        descricao="O que cada papel pode fazer em cada módulo, dentro do órgão e da unidade do vínculo (e das unidades abaixo dela)." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Papéis">
        {papeis.map((p) => (
          <button key={p.codigo} role="tab" aria-selected={p.codigo === papelSel} onClick={() => setPapelSel(p.codigo)}
            className={cx('rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset', p.codigo === papelSel ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
            {p.nome}
          </button>
        ))}
      </div>
      <Cartao titulo={<>{papel.nome} {papel.somente_leitura && <Selo tom="info">Somente leitura</Selo>}</>}>
        <p className="mb-2 text-sm text-slate-600">{papel.descricao}</p>
        <p className="mb-4 text-xs text-slate-500">
          Pode conceder: {concede.filter((c) => c.concedente === papelSel).map((c) => papeis.find((p) => p.codigo === c.concedido)?.nome).join(', ') || 'nenhum papel'}.
          {papel.somente_leitura && ' Papéis somente leitura não recebem ações de escrita (o banco recusa).'}
          {' '}Gestor, fiscal e suplente de contrato não estão na matriz: o acesso deles vem da designação em cada contrato.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Módulo</th>
                {acoes.map((a) => <th key={a.codigo} className="px-2 py-2 text-center font-medium">{a.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g}>
                  <tr><td colSpan={acoes.length + 1} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-marca-700">{g}</td></tr>
                  {recursos.filter((r) => r.grupo === g).map((r) => (
                    <tr key={r.codigo} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-800">{r.nome}</td>
                      {acoes.map((a) => {
                        const marcado = tem.has(`${r.codigo}:${a.codigo}`);
                        const bloqueado = !ehPlataforma || (papel.somente_leitura && !a.leitura) || mudar.isPending;
                        return (
                          <td key={a.codigo} className="px-2 py-2 text-center">
                            <input type="checkbox" className="size-4 accent-marca-700 disabled:opacity-40" checked={marcado} disabled={bloqueado}
                              aria-label={`${papel.nome}: ${a.nome} em ${r.nome}`}
                              onChange={(e) => mudar.mutate({ recurso: r.codigo, acao: a.codigo, ligar: e.target.checked })} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!ehPlataforma && <p className="mt-3 text-xs text-slate-500">Somente o administrador da plataforma altera a matriz.</p>}
      </Cartao>
    </>
  );
}
