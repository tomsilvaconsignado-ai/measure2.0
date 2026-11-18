// Pesquisa de preços: dados abertos do Compras.gov.br consultados pelo servidor do MEASURE e mostrados aqui
// (preços praticados, atas de registro de preços e situação do fornecedor). O catálogo CATMAT/CATSER completo fica
// no banco, com busca indexada; as categorias do órgão só dão prioridade (na SMS, os itens de saúde vêm primeiro).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDownUp, BadgeDollarSign, Building2, ChevronLeft, ChevronRight, Clock, Database, History, Info, Loader2, Package, Plus,
  RefreshCw, ScrollText, Search, ShieldCheck, Tags, Wrench, X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Carregando, Indicador, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { mensagemDeErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarData, formatarDataHora } from '@/lib/formatacao';
import {
  buscarCatalogo, consultarComprasGov, estadoCatalogo, listarCategoriasCatalogo, salvarCategoriaCatalogo, sincronizarCategoria,
  type CategoriaCatalogo, type ConsultaComprasGov, type TipoCatalogo,
} from '@/services/comprasGov';

const SWAGGER_COMPRAS = 'https://dadosabertos.compras.gov.br/swagger-ui/index.html';

// ---------------------------------------------------------------- utilidades

type Linha = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? NaN));
const umAnoAtras = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };
const hojeIso = () => new Date().toISOString().slice(0, 10);
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const ESFERA: Record<string, string> = { F: 'Federal', U: 'Federal', E: 'Estadual', M: 'Municipal' };

function estatisticas(precos: number[]) {
  const v = precos.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  const mediana = v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
  return { n: v.length, min: v[0]!, max: v[v.length - 1]!, mediana, media: v.reduce((s, x) => s + x, 0) / v.length };
}

// ---------------------------------------------------------------- pesquisas recentes (só neste navegador)

interface Recente { modo: Modo; item?: { codigo: string; rotulo: string }; cnpj?: string; uf?: string }
const CHAVE_RECENTES = 'measure.pesquisa_precos.recentes';
function lerRecentes(): Recente[] { try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]') as Recente[]; } catch { return []; } }
function gravarRecente(r: Recente) {
  try {
    const chave = (x: Recente) => `${x.modo}|${x.item?.codigo ?? x.cnpj}|${x.uf ?? ''}`;
    const lista = [r, ...lerRecentes().filter((x) => chave(x) !== chave(r))].slice(0, 6);
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista));
    return lista;
  } catch { return []; }
}

// ---------------------------------------------------------------- resultados

function Paginas({ r, aoMudar }: { r: { pagina: number; totalPaginas: number; totalRegistros: number }; aoMudar: (p: number) => void }) {
  if (r.totalPaginas <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-2 pt-3 text-sm text-slate-600" aria-label="Páginas do resultado">
      <span className="numero">{r.totalRegistros.toLocaleString('pt-BR')} registros · página {r.pagina} de {r.totalPaginas.toLocaleString('pt-BR')}</span>
      <div className="flex gap-1">
        <Botao pequeno variante="secundario" disabled={r.pagina <= 1} onClick={() => aoMudar(r.pagina - 1)} aria-label="Página anterior" icone={<ChevronLeft className="size-4" />} />
        <Botao pequeno variante="secundario" disabled={r.pagina >= r.totalPaginas} onClick={() => aoMudar(r.pagina + 1)} aria-label="Próxima página" icone={<ChevronRight className="size-4" />} />
      </div>
    </nav>
  );
}

type Ordem = 'recentes' | 'menor' | 'maior';
function TabelaPrecos({ linhas, servico }: { linhas: Linha[]; servico: boolean }) {
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const est = estatisticas(linhas.map((l) => num(l.precoUnitario)));
  const data = (l: Linha) => String(l.dataCompra ?? l.dataResultado ?? '');
  const ordenadas = [...linhas].sort((a, b) => ordem === 'recentes' ? data(b).localeCompare(data(a))
    : ordem === 'menor' ? num(a.precoUnitario) - num(b.precoUnitario) : num(b.precoUnitario) - num(a.precoUnitario));
  return (
    <>
      {est && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Menor preço unitário" valor={brl(est.min)} detalhe={`${est.n} compras nesta página`} />
          <Indicador rotulo="Mediana (referência)" valor={brl(est.mediana)} detalhe="metade pagou menos, metade pagou mais" tom="sucesso" />
          <Indicador rotulo="Média" valor={brl(est.media)} />
          <Indicador rotulo="Maior preço unitário" valor={brl(est.max)} tom={est.max > est.mediana * 3 ? 'alerta' : 'normal'}
            detalhe={est.max > est.mediana * 3 ? 'muito acima da mediana: confira' : undefined} />
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 text-xs" role="group" aria-label="Ordenar">
        <ArrowDownUp className="size-3.5 text-slate-500" aria-hidden /><span className="text-slate-600">Ordenar:</span>
        {([['recentes', 'mais recentes'], ['menor', 'menor preço'], ['maior', 'maior preço']] as Array<[Ordem, string]>).map(([id, r]) => (
          <button key={id} type="button" aria-pressed={ordem === id} onClick={() => setOrdem(id)}
            className={cx('rounded-full border px-2.5 py-0.5 font-semibold', ordem === id ? 'border-marca-900 bg-marca-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>{r}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead><tr className="text-left">
            <th>Data</th><th>Descrição</th><th>{servico ? 'Unidade' : 'Fornecimento'}</th><th className="text-right">Qtd.</th>
            <th className="text-right">Preço unitário</th><th>Fornecedor</th><th>Órgão comprador</th>
          </tr></thead>
          <tbody>
            {ordenadas.map((l, i) => {
              const p = num(l.precoUnitario);
              const fora = est && Number.isFinite(p) && (p > est.mediana * 3 || p < est.mediana / 3);
              return (
                <tr key={String(l.idCompraItem ?? l.idItemCompra ?? i)} className="border-b border-slate-100 align-top">
                  <td className="numero whitespace-nowrap py-2">{formatarData(data(l))}</td>
                  <td className="py-2"><span className="line-clamp-3" title={String(l.descricaoDetalhadaItem ?? l.descricaoItem ?? '')}>{txt(l.descricaoDetalhadaItem ?? l.descricaoItem)}</span>{l.marca ? <span className="block text-xs text-slate-500">Marca: {String(l.marca)}</span> : null}</td>
                  <td className="py-2 text-xs">{servico ? txt(l.nomeUnidadeMedida ?? l.siglaUnidadeMedida)
                    : <>{txt(l.nomeUnidadeFornecimento ?? l.siglaUnidadeFornecimento)}{num(l.capacidadeUnidadeFornecimento) > 1 && <> com {String(l.capacidadeUnidadeFornecimento)} {txt(l.siglaUnidadeMedida)}</>}</>}</td>
                  <td className="numero py-2 text-right">{Number.isFinite(num(l.quantidade)) ? num(l.quantidade).toLocaleString('pt-BR') : '—'}</td>
                  <td className={cx('numero py-2 text-right font-semibold', fora ? 'text-amber-700' : 'text-marca-900')} title={fora ? 'Muito distante da mediana' : undefined}>
                    {Number.isFinite(p) ? brl(p) : '—'}</td>
                  <td className="py-2 text-xs">{txt(l.nomeFornecedor)}{l.niFornecedor ? <span className="block text-slate-500">{formatarCnpj(String(l.niFornecedor))}</span> : null}</td>
                  <td className="py-2 text-xs">{txt(l.nomeUasg ?? l.nomeOrgao)}<span className="block text-slate-500">{txt(l.municipio)}/{txt(l.estado)}{l.esfera ? ` · ${ESFERA[String(l.esfera)] ?? l.esfera}` : ''}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TabelaAtas({ linhas }: { linhas: Linha[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead><tr className="text-left"><th>Ata</th><th>Descrição</th><th>Fornecedor</th><th className="text-right">Valor unitário</th><th className="text-right">Qtd. registrada</th><th>Vigência</th><th>Gerenciador</th></tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 align-top">
              <td className="numero py-2">{txt(l.numeroAtaRegistroPreco)}</td>
              <td className="py-2"><span className="line-clamp-3">{txt(l.descricaoItem)}</span></td>
              <td className="py-2 text-xs">{txt(l.nomeRazaoSocialFornecedor)}{l.niFornecedor ? <span className="block text-slate-500">{formatarCnpj(String(l.niFornecedor))}</span> : null}</td>
              <td className="numero py-2 text-right font-semibold text-marca-900">{Number.isFinite(num(l.valorUnitario)) ? brl(num(l.valorUnitario)) : '—'}</td>
              <td className="numero py-2 text-right">{Number.isFinite(num(l.quantidadeHomologadaItem)) ? num(l.quantidadeHomologadaItem).toLocaleString('pt-BR') : '—'}</td>
              <td className="numero whitespace-nowrap py-2 text-xs">{formatarData(String(l.dataVigenciaInicial ?? ''))} a {formatarData(String(l.dataVigenciaFinal ?? ''))}</td>
              <td className="py-2 text-xs">{txt(l.nomeUnidadeGerenciadora)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FichaFornecedor({ f }: { f: Linha }) {
  const item = (r: string, v: ReactNode) => <div><dt className="text-xs font-semibold text-marca-800">{r}</dt><dd className="mt-0.5 text-sm text-slate-900">{v}</dd></div>;
  return (
    <div className="rounded-xl border border-slate-200 border-l-4 border-l-acento-500 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-marca-900">{txt(f.nomeRazaoSocialFornecedor)}</h3>
        <Selo tom={f.ativo ? 'sucesso' : 'perigo'}>{f.ativo ? 'Ativo no cadastro' : 'Inativo'}</Selo>
        {f.habilitadoLicitar !== undefined && <Selo tom={f.habilitadoLicitar ? 'sucesso' : 'alerta'}>{f.habilitadoLicitar ? 'Habilitado a licitar' : 'Não habilitado a licitar'}</Selo>}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {item('CNPJ', formatarCnpj(String(f.cnpj ?? '')))}
        {item('Porte', txt(f.porteEmpresaNome))}
        {item('Natureza jurídica', txt(f.naturezaJuridicaNome ?? f.naturezaJuridica))}
        {item('Atividade principal (CNAE)', <>{txt(f.codigoCnae)} — {txt(f.nomeCnae)}</>)}
        {item('Município', <>{txt(f.nomeMunicipio ?? f.municipio)}{f.ufSigla ? `/${String(f.ufSigla)}` : ''}</>)}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- pesquisa

type Modo = ConsultaComprasGov;
const MODOS: Array<{ id: Modo; titulo: string; texto: string; icone: ReactNode }> = [
  { id: 'preco_material', titulo: 'Preço de material', texto: 'Medicamentos, insumos, equipamentos... (CATMAT)', icone: <Package className="size-5" aria-hidden /> },
  { id: 'preco_servico', titulo: 'Preço de serviço', texto: 'Manutenção, limpeza, exames... (CATSER)', icone: <Wrench className="size-5" aria-hidden /> },
  { id: 'arp_item', titulo: 'Atas de registro de preços', texto: 'Atas com o item, valor e fornecedor', icone: <ScrollText className="size-5" aria-hidden /> },
  { id: 'fornecedor', titulo: 'Situação do fornecedor', texto: 'CNPJ ativo e habilitado a licitar', icone: <Building2 className="size-5" aria-hidden /> },
];

function Pesquisa() {
  const { orgao } = useSessao();
  const [modo, setModo] = useState<Modo>('preco_material');
  const [tipoAta, setTipoAta] = useState<TipoCatalogo>('MATERIAL');
  const [item, setItem] = useState<{ codigo: string; rotulo: string } | null>(null);
  const [uf, setUf] = useState('');
  const [desde, setDesde] = useState(umAnoAtras());
  const [cnpj, setCnpj] = useState('');
  const [pedido, setPedido] = useState<{ consulta: ConsultaComprasGov; parametros: Record<string, string>; pagina: number } | null>(null);
  const [recentes, setRecentes] = useState<Recente[]>(lerRecentes);

  const tipoItem: TipoCatalogo = modo === 'preco_servico' ? 'SERVICO' : modo === 'arp_item' ? tipoAta : 'MATERIAL';
  const trocarModo = (m: Modo) => { setModo(m); setItem(null); setPedido(null); };

  const montar = (m: Modo, it: typeof item, filtroUf: string, cnpjAtual: string): Record<string, string> | null => {
    if (m === 'fornecedor') return cnpjAtual.replace(/\D/g, '').length === 14 ? { cnpj: cnpjAtual.replace(/\D/g, '') } : null;
    if (!it) return null;
    if (m === 'preco_material') return { codigo: it.codigo, estado: filtroUf, dataCompraInicio: desde };
    if (m === 'preco_servico') return { codigoItemCatalogo: it.codigo, estado: filtroUf, dataCompraInicio: desde };
    return { codigoItem: it.codigo, dataVigenciaInicialMin: desde || umAnoAtras(), dataVigenciaInicialMax: hojeIso() };
  };
  const pesquisar = (m = modo, it = item, filtroUf = uf, cnpjAtual = cnpj) => {
    const p = montar(m, it, filtroUf, cnpjAtual);
    if (!p) return;
    setPedido({ consulta: m, parametros: p, pagina: 1 });
    setRecentes(gravarRecente({ modo: m, item: it ?? undefined, cnpj: m === 'fornecedor' ? cnpjAtual : undefined, uf: filtroUf || undefined }));
  };
  const p = montar(modo, item, uf, cnpj);

  const q = useQuery({
    queryKey: ['compras-gov', pedido], enabled: !!pedido, staleTime: 10 * 60_000, retry: false,
    queryFn: () => consultarComprasGov<Linha>(pedido!.consulta, pedido!.parametros, pedido!.pagina),
  });
  const r = q.data;

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Tipo de pesquisa">
        {MODOS.map((m) => {
          const ativo = modo === m.id;
          return (
            <button key={m.id} type="button" role="tab" aria-selected={ativo} onClick={() => trocarModo(m.id)}
              className={cx('flex items-center gap-3 rounded-xl border border-l-4 p-3.5 text-left transition-colors',
                ativo ? 'border-marca-900 border-l-chamada-500 bg-marca-900 text-white shadow-md' : 'border-slate-200 border-l-slate-200 bg-white hover:border-marca-300 hover:bg-marca-50')}>
              <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', ativo ? 'bg-chamada-500 text-marca-950' : 'bg-marca-100 text-marca-800')}>{m.icone}</span>
              <span className="min-w-0">
                <span className="block font-bold">{m.titulo}</span>
                <span className={cx('block text-xs', ativo ? 'text-marca-100' : 'text-slate-600')}>{m.texto}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Filtros da pesquisa">
        <form className="grid gap-3 lg:grid-cols-[1fr_9rem_11rem_auto] lg:items-end" onSubmit={(e) => { e.preventDefault(); pesquisar(); }}>
          {modo === 'fornecedor' ? (
            <Campo rotulo="CNPJ do fornecedor" obrigatorio value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric"
              className="lg:col-span-3" />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {modo === 'arp_item' && (
                  <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo do item">
                    {(['MATERIAL', 'SERVICO'] as TipoCatalogo[]).map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={tipoAta === t} onClick={() => { setTipoAta(t); setItem(null); }}
                        className={cx('rounded-full border px-3 py-0.5 text-xs font-semibold', tipoAta === t ? 'border-marca-900 bg-marca-900 text-white' : 'border-slate-300 text-slate-700')}>
                        {t === 'MATERIAL' ? 'Material' : 'Serviço'}</button>
                    ))}
                  </div>
                )}
                <BuscaSelect key={tipoItem} rotulo={tipoItem === 'MATERIAL' ? 'Material (nome ou código CATMAT)' : 'Serviço (nome ou código CATSER)'} obrigatorio
                  valor={item?.codigo ?? null} rotuloValor={item?.rotulo} chave={['catalogo', orgao?.id, tipoItem]}
                  placeholder={tipoItem === 'MATERIAL' ? 'Ex.: seringa 10 ml, luva, dipirona, extintor' : 'Ex.: recarga extintor, limpeza hospitalar, manutenção'}
                  ajuda="Todas as áreas do catálogo do governo; os itens do ramo do órgão aparecem primeiro."
                  buscar={async (t) => (await buscarCatalogo(orgao!.id, tipoItem, t, 40)).map((i) => ({
                    valor: String(i.codigo), rotulo: `${i.codigo} — ${i.descricao}`,
                    detalhe: i.categoria ? `★ ${i.categoria}` : (i.nome_classe ?? i.nome_grupo ?? undefined),
                  }))}
                  aoMudar={(v, o) => { const novo = v && o ? { codigo: v, rotulo: o.rotulo } : null; setItem(novo); if (novo) pesquisar(modo, novo); }} />
              </div>
              {modo !== 'arp_item' ? (
                <Selecao rotulo="UF" value={uf} onChange={(e) => { setUf(e.target.value); if (pedido && item) pesquisar(modo, item, e.target.value); }}>
                  <option value="">Brasil todo</option>{UFS.map((x) => <option key={x} value={x}>{x}</option>)}
                </Selecao>
              ) : <span className="hidden lg:block" />}
              <Campo rotulo={modo === 'arp_item' ? 'Atas vigentes desde' : 'Compras a partir de'} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </>
          )}
          <Botao type="submit" variante="chamada" disabled={!p} carregando={q.isFetching} icone={<Search className="size-4" />}>Pesquisar</Botao>
        </form>

        {recentes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <History className="size-3.5 text-slate-500" aria-hidden /><span className="text-xs text-slate-600">Recentes:</span>
            {recentes.map((x, i) => (
              <button key={i} type="button" title={x.item?.rotulo ?? x.cnpj}
                onClick={() => { setModo(x.modo); setItem(x.item ?? null); setUf(x.uf ?? ''); if (x.cnpj) setCnpj(x.cnpj); pesquisar(x.modo, x.item ?? null, x.uf ?? '', x.cnpj ?? ''); }}
                className="max-w-64 truncate rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700 hover:border-marca-400 hover:bg-marca-50">
                {x.modo === 'fornecedor' ? `CNPJ ${x.cnpj}` : (x.item?.rotulo ?? '').replace(/^(\d+) — /, '$1 · ')}{x.uf ? ` (${x.uf})` : ''}
              </button>
            ))}
            <button type="button" onClick={() => { try { localStorage.removeItem(CHAVE_RECENTES); } catch { /* sem armazenamento */ } setRecentes([]); }}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="Limpar pesquisas recentes"><X className="size-3.5" /></button>
          </div>
        )}
      </section>

      <section className="mt-5" aria-live="polite">
        {!pedido ? (
          <div className="flex items-start gap-3 rounded-2xl border border-dashed border-marca-200 bg-marca-50/50 p-5 text-sm text-marca-950">
            <Info className="mt-0.5 size-5 shrink-0 text-marca-700" aria-hidden />
            <p>{modo === 'fornecedor' ? 'Informe o CNPJ e clique em Pesquisar para ver se a empresa está ativa e habilitada a licitar.'
              : 'Digite parte do nome do item (ou o código) e escolha na lista: a pesquisa começa sozinha. Use a UF para comparar com a região.'}</p>
          </div>
        ) : q.isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6"><Carregando texto="Consultando o Compras.gov.br... a primeira consulta de um item leva alguns segundos; as próximas são imediatas." /></div>
        ) : q.error ? <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} />
          : r && !r.resultado?.length ? <Vazio titulo="Nada encontrado" descricao="O Compras.gov.br não tem registros para esta pesquisa. Tente sem a UF ou com uma data mais antiga." />
          : r ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              {modo === 'fornecedor' ? <FichaFornecedor f={r.resultado[0]!} />
                : modo === 'arp_item' ? <TabelaAtas linhas={r.resultado} />
                : <TabelaPrecos linhas={r.resultado} servico={modo === 'preco_servico'} />}
              <Paginas r={r} aoMudar={(pg) => setPedido((x) => x && { ...x, pagina: pg })} />
              <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <ShieldCheck className="size-3.5 text-acento-600" aria-hidden />
                Fonte: dados abertos oficiais do Compras.gov.br (Ministério da Gestão e da Inovação em Serviços Públicos). Consulta de {formatarDataHora(r.consultado_em)}.
              </p>
            </div>
          ) : null}
        {q.isFetching && !q.isLoading && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="size-3.5 animate-spin" aria-hidden />Atualizando...</p>}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- categorias prioritárias do órgão

function CategoriasDoOrgao() {
  const { orgao, pode, ehPlataforma } = useSessao();
  const qc = useQueryClient();
  const podeEditar = pode('configuracoes', 'editar') || ehPlataforma;
  const [nova, setNova] = useState<{ tipo: TipoCatalogo; codigo: string; nome: string } | null>(null);
  const [progresso, setProgresso] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ['catalogo-categorias', orgao?.id], queryFn: () => listarCategoriasCatalogo(orgao!.id), enabled: !!orgao });
  const lista = q.data ?? [];

  const sincronizar = async (c: CategoriaCatalogo) => {
    setProgresso((x) => ({ ...x, [c.id]: 'iniciando...' }));
    try {
      const n = await sincronizarCategoria(c.tipo, c.codigo, (pg, total) => setProgresso((x) => ({ ...x, [c.id]: `página ${pg} de ${total}` })));
      toast.success(`${c.nome}: ${n.toLocaleString('pt-BR')} códigos atualizados.`);
    } catch (e) { toast.error(mensagemDeErro(e)); }
    setProgresso((x) => { const { [c.id]: _, ...resto } = x; return resto; });
    await qc.invalidateQueries({ queryKey: ['catalogo-categorias', orgao?.id] });
    await qc.invalidateQueries({ queryKey: ['catalogo'] });
  };
  const salvar = useMutation({
    mutationFn: (c: Parameters<typeof salvarCategoriaCatalogo>[1]) => salvarCategoriaCatalogo(orgao!.id, c),
    onSuccess: async () => { setNova(null); await qc.invalidateQueries({ queryKey: ['catalogo-categorias', orgao?.id] }); toast.success('Categoria salva.'); },
    onError: (e) => toast.error(/duplicate|unique/.test((e as Error).message ?? '') ? 'Esta categoria já está cadastrada.' : mensagemDeErro(e)),
  });
  const secao = (tipo: TipoCatalogo) => lista.filter((c) => c.tipo === tipo);

  if (q.isLoading) return <Carregando />;
  if (q.error) return <CaixaErro mensagem={mensagemDeErro(q.error)} />;
  return (
    <>
      <p className="mb-3 text-sm text-slate-700">A pesquisa mostra o catálogo de <b>todas as áreas</b>. As categorias abaixo são as do ramo deste órgão: os itens delas aparecem <b>primeiro</b> na lista, marcados com ★.</p>
      {podeEditar && (
        <div className="mb-4">
          {!nova ? <Botao pequeno variante="secundario" icone={<Plus className="size-4" />} onClick={() => setNova({ tipo: 'MATERIAL', codigo: '', nome: '' })}>Incluir categoria</Botao> : (
            <form className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[10rem_9rem_1fr_auto] sm:items-end"
              onSubmit={(e) => { e.preventDefault(); salvar.mutate({ tipo: nova.tipo, codigo: Number(nova.codigo), nome: nova.nome.trim() }); }}>
              <Selecao rotulo="Tipo" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoCatalogo })}>
                <option value="MATERIAL">Material (classe)</option><option value="SERVICO">Serviço (grupo)</option>
              </Selecao>
              <Campo rotulo={nova.tipo === 'MATERIAL' ? 'Classe CATMAT' : 'Grupo CATSER'} obrigatorio inputMode="numeric" value={nova.codigo}
                onChange={(e) => setNova({ ...nova, codigo: e.target.value.replace(/\D/g, '') })} ajuda={nova.tipo === 'MATERIAL' ? '4 dígitos. Ex.: 6505' : '3 dígitos. Ex.: 931'} />
              <Campo rotulo="Nome da categoria" obrigatorio value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
              <div className="flex gap-2">
                <Botao type="submit" pequeno carregando={salvar.isPending} disabled={!nova.codigo || nova.nome.trim().length < 2}>Salvar</Botao>
                <Botao pequeno variante="fantasma" onClick={() => setNova(null)}>Cancelar</Botao>
              </div>
            </form>
          )}
        </div>
      )}
      {!lista.length ? <Vazio titulo="Nenhuma categoria prioritária" descricao="A pesquisa mostra todo o catálogo, sem prioridade." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(['MATERIAL', 'SERVICO'] as TipoCatalogo[]).map((tipo) => (
            <div key={tipo}>
              <h3 className="mb-2 text-sm font-bold text-marca-900">{tipo === 'MATERIAL' ? 'Materiais (CATMAT, por classe)' : 'Serviços (CATSER, por grupo)'}</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {secao(tipo).map((c) => (
                  <li key={c.id} className={cx('flex flex-wrap items-center gap-2 px-3 py-2 text-sm', !c.ativo && 'opacity-60')}>
                    <span className="numero w-12 font-semibold text-marca-900">{c.codigo}</span>
                    <span className="min-w-0 flex-1">{c.nome}
                      <span className="block text-xs text-slate-500">{progresso[c.id] ? `Atualizando: ${progresso[c.id]}` : c.itens ? `${c.itens.toLocaleString('pt-BR')} códigos` : 'Códigos em atualização automática'}</span>
                    </span>
                    {podeEditar && <>
                      <Botao pequeno variante="fantasma" carregando={!!progresso[c.id]} disabled={!c.ativo} onClick={() => void sincronizar(c)} icone={<RefreshCw className="size-3.5" />} aria-label={`Atualizar agora os códigos de ${c.nome}`} title="Atualizar agora" />
                      <Botao pequeno variante="fantasma" onClick={() => salvar.mutate({ id: c.id, tipo: c.tipo, codigo: c.codigo, nome: c.nome, ativo: !c.ativo })}>{c.ativo ? 'Desativar' : 'Reativar'}</Botao>
                    </>}
                  </li>
                ))}
                {!secao(tipo).length && <li className="px-3 py-2 text-sm text-slate-500">Nenhuma.</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- seção recolhível

function Recolhivel({ icone, titulo, resumo, children }: { icone: ReactNode; titulo: string; resumo: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <span className="text-marca-700">{icone}</span>
        <span className="min-w-0 flex-1"><span className="block font-semibold text-marca-900">{titulo}</span><span className="block text-xs text-slate-600">{resumo}</span></span>
        <ChevronRight className={cx('size-4 text-slate-500 transition-transform', aberto && 'rotate-90')} aria-hidden />
      </button>
      {aberto && <div className="border-t border-slate-200 p-4">{children}</div>}
    </section>
  );
}

function EstadoCatalogo() {
  const q = useQuery({ queryKey: ['catalogo-estado'], queryFn: estadoCatalogo, staleTime: 5 * 60_000 });
  const m = q.data?.find((x) => x.tipo === 'MATERIAL');
  const s = q.data?.find((x) => x.tipo === 'SERVICO');
  const linha = (x: typeof m, nome: string) => !x ? null : x.ciclo_concluido_em
    ? `${nome}: atualizado em ${formatarData(x.ciclo_concluido_em)}`
    : x.total_paginas ? `${nome}: carregando (${Math.round(((x.proxima_pagina - 1) / x.total_paginas) * 100)}%)` : `${nome}: carregando`;
  const partes = [linha(s, 'serviços'), linha(m, 'materiais')].filter(Boolean);
  if (!partes.length) return null;
  return <span className="inline-flex items-center gap-1.5 text-xs text-marca-100"><Clock className="size-3.5" aria-hidden />Catálogo de códigos — {partes.join(' · ')}</span>;
}

// ---------------------------------------------------------------- página

export function PesquisaPrecos() {
  const { orgao } = useSessao();
  useEffect(() => { document.title = 'Pesquisa de preços · MEASURE'; }, []);
  if (!orgao) return <SemPermissao texto="Escolha um órgão para pesquisar preços." />;
  return (
    <>
      <CabecalhoPagina titulo="Pesquisa de preços"
        descricao={<>
          <span className="block">Quanto outros órgãos pagaram, atas de registro de preços e situação de fornecedores, sem sair do MEASURE.</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-xs text-marca-100"><ShieldCheck className="size-3.5" aria-hidden />Dados da página oficial do Compras.gov.br</span>
            <EstadoCatalogo />
          </span>
        </>} />
      <Pesquisa />
      <div className="mt-6 flex flex-col gap-3">
        <Recolhivel icone={<Tags className="size-5" aria-hidden />} titulo="Categorias prioritárias deste órgão" resumo="Os itens do ramo da secretaria aparecem primeiro na busca.">
          <CategoriasDoOrgao />
        </Recolhivel>
        <Recolhivel icone={<BadgeDollarSign className="size-5" aria-hidden />} titulo="Como usar a pesquisa de preço" resumo="Passo a passo, referência pela mediana e cuidados.">
          <div className="grid gap-4 lg:grid-cols-2">
            <ol className="ml-5 list-decimal space-y-1.5 text-sm text-slate-800">
              <li>Escolha o tipo de pesquisa e digite parte do nome do item; a pesquisa começa ao escolher.</li>
              <li>Filtre pela UF para comparar com a região e ajuste a data para ver só compras recentes.</li>
              <li>Compare o <b>preço unitário</b> considerando a <b>quantidade</b>, a <b>data</b> e a <b>forma de fornecimento</b>: caixa com 100 não é o mesmo que unidade.</li>
              <li>Use a <b>mediana</b> como referência; valores em amarelo estão muito distantes dela.</li>
              <li>Guarde o resultado no processo, com a data da consulta. Se o preço do contrato estiver muito diferente, comunique o gestor por escrito.</li>
            </ol>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="mb-2 flex items-center gap-2 font-bold"><AlertTriangle className="size-4" aria-hidden />Cuidados</p>
              <ul className="ml-5 list-disc space-y-1.5">
                <li>A pesquisa é um apoio. A pesquisa de preço formal segue o art. 23 da Lei nº 14.133/2021 e as normas e modelos do município.</li>
                <li>Os dados são das compras feitas pelo Compras.gov.br. Contratações de Aracaju feitas por outro sistema podem não aparecer.</li>
                <li>Preços antigos precisam ser atualizados antes de comparar; preço de outra região pode ter frete diferente.</li>
                <li>A mesma pesquisa feita de novo em até 12 horas usa a resposta já consultada, para ser imediata.</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-600"><Database className="size-4 text-marca-700" aria-hidden />
            Fonte: API de Dados Abertos do Compras.gov.br (MGI/Seges). <a href={SWAGGER_COMPRAS} target="_blank" rel="noopener noreferrer" className="font-medium text-marca-700 underline">Documentação técnica oficial</a></p>
        </Recolhivel>
      </div>
    </>
  );
}
