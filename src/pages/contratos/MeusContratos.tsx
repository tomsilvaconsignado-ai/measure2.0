// Meus contratos: onde a pessoa logada é gestora, fiscal ou suplente, em qualquer secretaria, diretoria ou
// coordenação (o acesso nasce da designação, não da lotação). O banco devolve só as designações vigentes.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CabecalhoPagina, CaixaErro, Cartao, Carregando, Selo, Vazio } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl, formatarData } from '@/lib/formatacao';
import { meusContratosDesignados } from '@/services/execucao';
import { SeloSituacao } from './comum';

const PAPEL = { GESTOR: 'Gestor', FISCAL: 'Fiscal', SUPLENTE: 'Suplente' } as const;
const dias = (fim: string) => Math.round((new Date(`${fim}T12:00:00`).getTime() - Date.now()) / 86_400_000);

export function MeusContratos() {
  const q = useQuery({ queryKey: ['meus-contratos-designados'], queryFn: meusContratosDesignados });
  const varios = new Set(q.data?.map((c) => c.tenant_id)).size > 1;
  return (
    <>
      <CabecalhoPagina titulo="Meus contratos" descricao="Contratos em que você está designado(a) como gestor, fiscal ou suplente, de qualquer secretaria, diretoria ou coordenação." />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />
        : !q.data?.length ? <Vazio titulo="Nenhuma designação vigente" descricao="Quando um administrador designar você como gestor, fiscal ou suplente de um contrato, ele aparece aqui." />
        : (
          <Cartao>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Contrato</th><th className="px-3 py-2 font-medium">Empresa e objeto</th>
                  <th className="px-3 py-2 font-medium">Estrutura responsável</th><th className="px-3 py-2 font-medium">Sua função</th>
                  <th className="px-3 py-2 font-medium">Vigência</th><th className="px-3 py-2 font-medium">Situação</th>
                </tr></thead>
                <tbody>
                  {q.data.map((c) => (
                    <tr key={c.contrato_id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                      <td className="px-3 py-2"><Link to={`/contratos/${c.contrato_id}`} className="font-medium text-marca-700 hover:underline">{c.numero}</Link>
                        {varios && <p className="text-xs text-slate-500">{c.orgao}</p>}</td>
                      <td className="max-w-md px-3 py-2"><p className="font-medium text-slate-800">{c.fornecedor_nome}</p><p className="line-clamp-2 text-xs text-slate-500">{c.objeto}</p></td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {c.secretaria && <p>Secretaria: {c.secretaria}</p>}{c.diretoria && <p>Diretoria: {c.diretoria}</p>}
                        <p>Coordenação: {c.coordenacao ?? c.unidade_sigla ?? '—'}</p></td>
                      <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{c.papeis.map((p) => <Selo key={p} tom="info">{PAPEL[p]}</Selo>)}</div>
                        <p className="mt-1 text-xs text-slate-500">desde {formatarData(c.designado_desde)}</p></td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatarData(c.data_inicio)} a {formatarData(c.data_fim_atual)}<p className="numero">saldo {brl(c.saldo)}</p></td>
                      <td className="px-3 py-2"><SeloSituacao situacao={c.situacao} dias={dias(c.data_fim_atual)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        )}
    </>
  );
}
