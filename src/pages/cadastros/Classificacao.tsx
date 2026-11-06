// Classificação orçamentária vista pelo órgão: consulta das dotações do município (ente) disponíveis para ele.
// O cadastro é feito pela equipe da plataforma (módulo do desenvolvedor).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSessao } from '@/auth/Sessao';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { CampoBusca } from '@/components/ui/Abas';
import { CabecalhoPagina, CaixaErro, Cartao, Carregando, Paginacao, SemPermissao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import type { DotacaoDetalhada } from '@/lib/tipos';
import { listarClassificacoes } from '@/services/cadastros';

const POR_PAGINA = 25;

function natureza(d: DotacaoDetalhada) {
  if (!d.categoria_codigo || !d.gnd_codigo || !d.modalidade_codigo) return d.elemento_codigo;
  return `${d.categoria_codigo}${d.gnd_codigo}${d.modalidade_codigo.padStart(2, '0')}${d.elemento_codigo.padStart(2, '0')}`;
}

function Linha({ rotulo, codigo, descricao }: { rotulo: string; codigo: string | null; descricao: string | null }) {
  if (!codigo) return null;
  return (
    <div className="grid grid-cols-[9.5rem_6.5rem_1fr] gap-2 py-0.5 text-sm max-sm:grid-cols-[8rem_1fr]">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="numero text-right font-mono text-slate-900 max-sm:text-left">{codigo}</dd>
      <dd className="text-slate-700 max-sm:col-span-2 max-sm:-mt-1">{descricao}</dd>
    </div>
  );
}

export function Classificacao() {
  const { orgao, pode } = useSessao();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [situacao, setSituacao] = useState<'ATIVOS' | 'INATIVOS' | 'TODOS'>('ATIVOS');
  const [exercicio, setExercicio] = useState('');
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState<string | null>(null);
  useEffect(() => setPagina(0), [termo, situacao, exercicio]);
  const q = useQuery({
    queryKey: ['dotacoes', orgao?.id, termo, situacao, exercicio, pagina],
    queryFn: () => listarClassificacoes({ tenantId: orgao!.id, busca: termo, situacao, exercicio: exercicio ? Number(exercicio) : null, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao && pode('classificacoes', 'ler'), placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('classificacoes', 'ler')) return <SemPermissao />;

  return (
    <>
      <CabecalhoPagina titulo="Classificação orçamentária"
        descricao="Dotações do município disponíveis para este órgão. Contratos, empenhos e relatórios usam este catálogo, cadastrado pela equipe da plataforma." />
      <Cartao>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_11rem_10rem] sm:items-center">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Código, fonte, ação, elemento, unidade ou descrição" rotulo="Buscar dotação" />
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={exercicio} onChange={(e) => setExercicio(e.target.value)} aria-label="Exercício">
            <option value="">Todos os exercícios</option>
            {[0, 1, 2, -1].map((k) => new Date().getFullYear() + (k === -1 ? 1 : -k)).map((a) => <option key={a} value={a}>Exercício {a}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
            <option value="ATIVOS">Ativas</option><option value="INATIVOS">Inativas</option><option value="TODOS">Todas</option>
          </select>
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> :
          !q.data!.itens.length ? <Vazio titulo="Nenhuma dotação disponível" descricao={busca ? 'Ajuste a busca.' : 'Peça à equipe da plataforma o cadastro das dotações do município (LOA) e o vínculo deste órgão ao município.'} /> : (
            <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
              {q.data!.itens.map((d) => (
                <li key={d.id} className={cx('py-3', !d.ativo && 'opacity-60')}>
                  <button className="w-full text-left" onClick={() => setAberta(aberta === d.id ? null : d.id)} aria-expanded={aberta === d.id}>
                    <p className="numero flex flex-wrap items-center gap-2 break-words font-mono text-sm font-semibold text-slate-900">{d.codigo_completo}
                      {d.exercicio ? <Selo tom="info">Exercício {d.exercicio}</Selo> : <Selo>Qualquer exercício</Selo>}{!d.ativo && <Selo tom="perigo">Inativa</Selo>}</p>
                    {d.descricao && <p className="text-sm font-medium text-slate-800">{d.descricao}</p>}
                    <p className="text-sm text-slate-700">{d.uo_descricao ? `${d.uo_descricao} · ` : ''}{d.acao_descricao}</p>
                    <p className="text-xs text-slate-600">{d.subelemento_descricao ?? d.elemento_descricao} · Fonte: {d.fonte_descricao}</p>
                  </button>
                  {aberta === d.id && (
                    <dl className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <Linha rotulo="Unidade Orçamentária" codigo={d.uo_codigo} descricao={d.uo_descricao} />
                      <Linha rotulo="Unidade Gestora" codigo={d.ug_codigo} descricao={d.ug_descricao} />
                      <Linha rotulo="Função" codigo={d.funcao_codigo} descricao={d.funcao_descricao} />
                      <Linha rotulo="SubFunção" codigo={d.subfuncao_codigo} descricao={d.subfuncao_descricao} />
                      <Linha rotulo="Programa" codigo={d.programa_codigo} descricao={d.programa_descricao} />
                      <Linha rotulo="Ação" codigo={d.acao_codigo} descricao={d.acao_descricao} />
                      <Linha rotulo="Natureza Despesa" codigo={`${natureza(d)}00`} descricao={d.elemento_descricao} />
                      <Linha rotulo="SubElemento" codigo={d.subelemento_codigo ? `${natureza(d)}${d.subelemento_codigo.padStart(2, '0')}` : null} descricao={d.subelemento_descricao} />
                      <Linha rotulo="Fonte" codigo={d.fonte_codigo} descricao={d.fonte_descricao} />
                      <Linha rotulo="Cód. Acompanhamento" codigo={d.co_codigo} descricao={d.co_descricao} />
                      <Linha rotulo="IdUso" codigo={d.iduso_codigo} descricao={d.iduso_descricao} />
                      <Linha rotulo="IDoc" codigo={d.idoc_codigo} descricao={d.idoc_descricao} />
                      <Linha rotulo="Ind. Result. Prim." codigo={d.resultado_primario_codigo} descricao={d.resultado_primario_descricao} />
                      <Linha rotulo="SubFonte" codigo={d.subfonte_codigo} descricao={d.subfonte_descricao} />
                      {d.descricao && <p className="mt-2 text-xs text-slate-600">{d.descricao}</p>}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
    </>
  );
}
