// Dados abertos do Compras.gov.br dentro do MEASURE: o servidor consulta a API oficial do governo e a tela mostra os
// resultados aqui mesmo (preços praticados, atas de registro de preços e situação do fornecedor). Os códigos CATMAT e
// CATSER vêm do catálogo guardado no banco, limitado às categorias de cada órgão (a SMS começa com as de saúde).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, BadgeDollarSign, BookMarked, Building2, ChevronLeft, ChevronRight, Database, FileSearch, FileText, Info, Lightbulb, Loader2, Plus,
  RefreshCw, ScrollText, Search, ShieldCheck, Tags,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { Botao, CaixaErro, Campo, Carregando, Indicador, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { mensagemDeErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarData, formatarDataHora } from '@/lib/formatacao';
import {
  buscarCatalogo, consultarComprasGov, listarCategoriasCatalogo, salvarCategoriaCatalogo, sincronizarCategoria,
  type CategoriaCatalogo, type ConsultaComprasGov, type TipoCatalogo,
} from '@/services/comprasGov';

export const SWAGGER_COMPRAS = 'https://dadosabertos.compras.gov.br/swagger-ui/index.html';
const FONTE = 'Dados abertos do Compras.gov.br (Ministério da Gestão e da Inovação em Serviços Públicos), consultados pelo MEASURE na API oficial.';

/** Faixa de destaque: chama para a pesquisa (topo da capacitação). */
export function DestaqueDadosAbertos({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <section className="mb-5 flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border-l-4 border-chamada-500 bg-gradient-to-r from-marca-950 via-marca-900 to-marca-800 p-5 text-white shadow-lg">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/25"><BadgeDollarSign className="size-6" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">Pesquisa de preços do Compras.gov.br</h2>
        <p className="text-sm text-marca-100">Veja aqui mesmo quanto outros órgãos pagaram por um material ou serviço, as atas de registro de preços e a situação do fornecedor. Os códigos de saúde já estão disponíveis para escolher.</p>
      </div>
      <Botao variante="chamada" icone={<Search className="size-4" />} onClick={aoAbrir}>Pesquisar preços</Botao>
    </section>
  );
}

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

function Fonte({ em }: { em?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
      <ShieldCheck className="size-3.5 text-acento-600" aria-hidden />{FONTE}{em && <> Consulta de {formatarDataHora(em)}.</>}
    </p>
  );
}

// ---------------------------------------------------------------- seletor de item do catálogo

function SeletorItem({ tipo, valor, aoMudar }: { tipo: TipoCatalogo; valor: { codigo: string; rotulo: string } | null; aoMudar: (v: { codigo: string; rotulo: string } | null) => void }) {
  const { orgao } = useSessao();
  return (
    <BuscaSelect rotulo={tipo === 'MATERIAL' ? 'Material (código CATMAT)' : 'Serviço (código CATSER)'} obrigatorio
      valor={valor?.codigo ?? null} rotuloValor={valor?.rotulo}
      chave={['catalogo', orgao?.id, tipo]}
      placeholder={tipo === 'MATERIAL' ? 'Digite o nome ou o código. Ex.: seringa, luva, dipirona' : 'Digite o nome ou o código. Ex.: extintor, limpeza, manutenção'}
      ajuda="A lista mostra os códigos liberados para este órgão."
      buscar={async (t) => (await buscarCatalogo(orgao!.id, tipo, t)).map((i) => ({
        valor: String(i.codigo), rotulo: `${i.codigo} — ${i.descricao}`,
        detalhe: [i.categoria ?? i.nome_classe ?? i.nome_grupo].filter(Boolean).join(''),
      }))}
      aoMudar={(v, o) => aoMudar(v && o ? { codigo: v, rotulo: o.rotulo } : null)} />
  );
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

function TabelaPrecos({ linhas, servico }: { linhas: Linha[]; servico: boolean }) {
  const est = estatisticas(linhas.map((l) => num(l.precoUnitario)));
  return (
    <>
      {est && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Menor preço unitário" valor={brl(est.min)} detalhe={`${est.n} compras nesta página`} />
          <Indicador rotulo="Mediana" valor={brl(est.mediana)} detalhe="metade pagou menos, metade pagou mais" tom="sucesso" />
          <Indicador rotulo="Média" valor={brl(est.media)} />
          <Indicador rotulo="Maior preço unitário" valor={brl(est.max)} tom={est.max > est.mediana * 3 ? 'alerta' : 'normal'}
            detalhe={est.max > est.mediana * 3 ? 'muito acima da mediana: confira' : undefined} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead><tr className="text-left">
            <th>Data</th><th>Descrição</th><th>{servico ? 'Unidade' : 'Fornecimento'}</th><th className="text-right">Qtd.</th>
            <th className="text-right">Preço unitário</th><th>Fornecedor</th><th>Órgão comprador</th>
          </tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={String(l.idCompraItem ?? l.idItemCompra ?? i)} className="border-b border-slate-100 align-top">
                <td className="numero whitespace-nowrap py-2">{formatarData(String(l.dataCompra ?? l.dataResultado ?? ''))}</td>
                <td className="py-2"><span className="line-clamp-3" title={String(l.descricaoDetalhadaItem ?? l.descricaoItem ?? '')}>{txt(l.descricaoDetalhadaItem ?? l.descricaoItem)}</span>{l.marca ? <span className="block text-xs text-slate-500">Marca: {String(l.marca)}</span> : null}</td>
                <td className="py-2 text-xs">{servico ? txt(l.nomeUnidadeMedida ?? l.siglaUnidadeMedida)
                  : <>{txt(l.nomeUnidadeFornecimento ?? l.siglaUnidadeFornecimento)}{num(l.capacidadeUnidadeFornecimento) > 1 && <> com {String(l.capacidadeUnidadeFornecimento)} {txt(l.siglaUnidadeMedida)}</>}</>}</td>
                <td className="numero py-2 text-right">{Number.isFinite(num(l.quantidade)) ? num(l.quantidade).toLocaleString('pt-BR') : '—'}</td>
                <td className="numero py-2 text-right font-semibold text-marca-900">{Number.isFinite(num(l.precoUnitario)) ? brl(num(l.precoUnitario)) : '—'}</td>
                <td className="py-2 text-xs">{txt(l.nomeFornecedor)}{l.niFornecedor ? <span className="block text-slate-500">{formatarCnpj(String(l.niFornecedor))}</span> : null}</td>
                <td className="py-2 text-xs">{txt(l.nomeUasg ?? l.nomeOrgao)}<span className="block text-slate-500">{txt(l.municipio)}/{txt(l.estado)}{l.esfera ? ` · ${ESFERA[String(l.esfera)] ?? l.esfera}` : ''}</span></td>
              </tr>
            ))}
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
        <h4 className="text-base font-bold text-marca-900">{txt(f.nomeRazaoSocialFornecedor)}</h4>
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

type Modo = 'preco_material' | 'preco_servico' | 'arp_item' | 'fornecedor';
const MODOS: Array<{ id: Modo; rotulo: string; icone: ReactNode }> = [
  { id: 'preco_material', rotulo: 'Preço de material', icone: <BadgeDollarSign className="size-4" aria-hidden /> },
  { id: 'preco_servico', rotulo: 'Preço de serviço', icone: <BadgeDollarSign className="size-4" aria-hidden /> },
  { id: 'arp_item', rotulo: 'Atas de registro de preços', icone: <ScrollText className="size-4" aria-hidden /> },
  { id: 'fornecedor', rotulo: 'Situação do fornecedor', icone: <Building2 className="size-4" aria-hidden /> },
];

export function PesquisaComprasGov() {
  const [modo, setModo] = useState<Modo>('preco_material');
  const [tipoAta, setTipoAta] = useState<TipoCatalogo>('MATERIAL');
  const [item, setItem] = useState<{ codigo: string; rotulo: string } | null>(null);
  const [uf, setUf] = useState('');
  const [desde, setDesde] = useState(umAnoAtras());
  const [cnpj, setCnpj] = useState('');
  const [pedido, setPedido] = useState<{ consulta: ConsultaComprasGov; parametros: Record<string, string>; pagina: number } | null>(null);

  const tipoItem: TipoCatalogo = modo === 'preco_servico' ? 'SERVICO' : modo === 'arp_item' ? tipoAta : 'MATERIAL';
  const trocarModo = (m: Modo) => { setModo(m); setItem(null); setPedido(null); };

  const parametros = (): Record<string, string> | null => {
    if (modo === 'fornecedor') return cnpj.replace(/\D/g, '').length === 14 ? { cnpj: cnpj.replace(/\D/g, '') } : null;
    if (!item) return null;
    if (modo === 'preco_material') return { codigo: item.codigo, estado: uf, dataCompraInicio: desde };
    if (modo === 'preco_servico') return { codigoItemCatalogo: item.codigo, estado: uf, dataCompraInicio: desde };
    return { codigoItem: item.codigo, dataVigenciaInicialMin: desde || umAnoAtras(), dataVigenciaInicialMax: hojeIso() };
  };
  const p = parametros();

  const q = useQuery({
    queryKey: ['compras-gov', pedido], enabled: !!pedido, staleTime: 10 * 60_000, retry: false,
    queryFn: () => consultarComprasGov<Linha>(pedido!.consulta, pedido!.parametros, pedido!.pagina),
  });
  const r = q.data;

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-marca-900 bg-white shadow-lg" aria-labelledby="titulo-pesquisa-compras">
      <header className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-marca-950 via-marca-900 to-marca-800 px-5 py-4 text-white">
        <span className="grid size-10 place-items-center rounded-xl bg-chamada-500 text-marca-950"><Search className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 id="titulo-pesquisa-compras" className="text-lg font-bold">Pesquisa de preços e fornecedores</h3>
          <p className="text-xs text-marca-100">Os dados vêm da página oficial do Compras.gov.br e aparecem aqui, sem sair do MEASURE.</p>
        </div>
      </header>

      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Tipo de pesquisa">
          {MODOS.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={modo === m.id} onClick={() => trocarModo(m.id)}
              className={cx('inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                modo === m.id ? 'bg-marca-900 text-white shadow-sm' : 'text-slate-700 hover:bg-white hover:text-marca-900')}>{m.icone}{m.rotulo}</button>
          ))}
        </div>

        <form className="grid gap-3 lg:grid-cols-[1fr_9rem_11rem_auto] lg:items-end"
          onSubmit={(e) => { e.preventDefault(); if (p) setPedido({ consulta: modo, parametros: p, pagina: 1 }); }}>
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
                <SeletorItem key={tipoItem} tipo={tipoItem} valor={item} aoMudar={setItem} />
              </div>
              {modo !== 'arp_item' ? (
                <Selecao rotulo="UF" value={uf} onChange={(e) => setUf(e.target.value)}>
                  <option value="">Brasil todo</option>{UFS.map((x) => <option key={x} value={x}>{x}</option>)}
                </Selecao>
              ) : <span className="hidden lg:block" />}
              <Campo rotulo={modo === 'arp_item' ? 'Atas vigentes desde' : 'Compras a partir de'} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </>
          )}
          <Botao type="submit" variante="chamada" disabled={!p} carregando={q.isFetching} icone={<Search className="size-4" />}>Pesquisar</Botao>
        </form>

        <div className="mt-5">
          {!pedido ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              {modo === 'fornecedor' ? 'Informe o CNPJ para ver se a empresa está ativa e habilitada a licitar.'
                : 'Escolha o item na lista (digite parte do nome ou o código) e clique em Pesquisar.'}
            </div>
          ) : q.isLoading ? <Carregando texto="Consultando o Compras.gov.br..." />
            : q.error ? <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} />
            : r && !r.resultado?.length ? <Vazio titulo="Nada encontrado" descricao="O Compras.gov.br não tem registros para esta pesquisa. Tente sem a UF ou com uma data mais antiga." />
            : r ? (
              <>
                {modo === 'fornecedor' ? <FichaFornecedor f={r.resultado[0]!} />
                  : modo === 'arp_item' ? <TabelaAtas linhas={r.resultado} />
                  : <TabelaPrecos linhas={r.resultado} servico={modo === 'preco_servico'} />}
                <Paginas r={r} aoMudar={(pg) => setPedido((x) => x && { ...x, pagina: pg })} />
                <div className="mt-3"><Fonte em={r.consultado_em} /></div>
              </>
            ) : null}
          {q.isFetching && !q.isLoading && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="size-3.5 animate-spin" aria-hidden />Atualizando...</p>}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- códigos liberados para o órgão

function CategoriasDoOrgao() {
  const { orgao, pode, ehPlataforma } = useSessao();
  const qc = useQueryClient();
  const podeEditar = pode('configuracoes', 'editar') || ehPlataforma;
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState<{ tipo: TipoCatalogo; codigo: string; nome: string } | null>(null);
  const [progresso, setProgresso] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ['catalogo-categorias', orgao?.id], queryFn: () => listarCategoriasCatalogo(orgao!.id), enabled: !!orgao && aberto });
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
  const sincronizarTodas = async () => { for (const c of lista.filter((x) => x.ativo)) await sincronizar(c); };
  const salvar = useMutation({
    mutationFn: (c: Parameters<typeof salvarCategoriaCatalogo>[1]) => salvarCategoriaCatalogo(orgao!.id, c),
    onSuccess: async () => { setNova(null); await qc.invalidateQueries({ queryKey: ['catalogo-categorias', orgao?.id] }); toast.success('Categoria salva.'); },
    onError: (e) => toast.error(/duplicate|unique/.test((e as Error).message ?? '') ? 'Esta categoria já está cadastrada.' : mensagemDeErro(e)),
  });

  const secao = (tipo: TipoCatalogo) => lista.filter((c) => c.tipo === tipo);
  return (
    <section className="rounded-xl border border-slate-200">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <Tags className="size-5 text-marca-700" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-marca-900">Códigos CATMAT e CATSER liberados para este órgão</span>
          <span className="block text-xs text-slate-600">Cada secretaria tem as suas categorias. {podeEditar ? 'Você pode incluir categorias e atualizar os códigos com o catálogo do governo.' : 'Quem administra o órgão define as categorias.'}</span>
        </span>
        <ChevronRight className={cx('size-4 text-slate-500 transition-transform', aberto && 'rotate-90')} aria-hidden />
      </button>
      {aberto && (
        <div className="border-t border-slate-200 p-4">
          {q.isLoading ? <Carregando /> : q.error ? <CaixaErro mensagem={mensagemDeErro(q.error)} /> : (
            <>
              {podeEditar && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <Botao pequeno variante="secundario" icone={<RefreshCw className="size-4" />} disabled={!lista.length || Object.keys(progresso).length > 0} onClick={() => void sincronizarTodas()}>Atualizar todos os códigos</Botao>
                  <Botao pequeno variante="secundario" icone={<Plus className="size-4" />} onClick={() => setNova({ tipo: 'MATERIAL', codigo: '', nome: '' })}>Incluir categoria</Botao>
                </div>
              )}
              {nova && (
                <form className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[10rem_9rem_1fr_auto] sm:items-end"
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
              {!lista.length ? <Vazio titulo="Nenhuma categoria definida" descricao="Sem categorias, a pesquisa mostra todo o catálogo do governo." /> : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {(['MATERIAL', 'SERVICO'] as TipoCatalogo[]).map((tipo) => (
                    <div key={tipo}>
                      <h4 className="mb-2 text-sm font-bold text-marca-900">{tipo === 'MATERIAL' ? 'Materiais (CATMAT, por classe)' : 'Serviços (CATSER, por grupo)'}</h4>
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {secao(tipo).map((c) => (
                          <li key={c.id} className={cx('flex flex-wrap items-center gap-2 px-3 py-2 text-sm', !c.ativo && 'opacity-60')}>
                            <span className="numero w-12 font-semibold text-marca-900">{c.codigo}</span>
                            <span className="min-w-0 flex-1">{c.nome}
                              <span className="block text-xs text-slate-500">{progresso[c.id] ? `Atualizando: ${progresso[c.id]}` : c.itens ? `${c.itens.toLocaleString('pt-BR')} códigos · atualizado em ${formatarData(c.sincronizado_em)}` : 'Códigos ainda não baixados'}</span>
                            </span>
                            {podeEditar && <>
                              <Botao pequeno variante="fantasma" carregando={!!progresso[c.id]} disabled={!c.ativo} onClick={() => void sincronizar(c)} icone={<RefreshCw className="size-3.5" />} aria-label={`Atualizar códigos de ${c.nome}`} />
                              <Botao pequeno variante="fantasma" onClick={() => salvar.mutate({ id: c.id, tipo: c.tipo, codigo: c.codigo, nome: c.nome, ativo: !c.ativo })}>{c.ativo ? 'Desativar' : 'Reativar'}</Botao>
                            </>}
                          </li>
                        ))}
                        {!secao(tipo).length && <li className="px-3 py-2 text-sm text-slate-500">Nenhuma: a pesquisa mostra todo o catálogo.</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- para que serve

const USOS: Array<{ icone: ReactNode; titulo: string; texto: string; quem: string }> = [
  { icone: <BadgeDollarSign className="size-5" aria-hidden />, titulo: 'Pesquisa de preço', quem: 'Gestor e fiscal',
    texto: 'Mostra quanto outros órgãos pagaram pelo mesmo material ou serviço, com data, quantidade, fornecedor e local. Ajuda a perceber preço fora da realidade antes de um aditivo, repactuação ou nova contratação.' },
  { icone: <ScrollText className="size-5" aria-hidden />, titulo: 'Atas de registro de preços', quem: 'Gestor',
    texto: 'Atas com o item, valor unitário, fornecedor e quantidade registrada. Antes de abrir uma licitação, vale ver se já existe ata com o item.' },
  { icone: <Building2 className="size-5" aria-hidden />, titulo: 'Situação do fornecedor', quem: 'Gestor e fiscal',
    texto: 'Confirma se o CNPJ está ativo e habilitado a licitar, com atividade, porte da empresa e município.' },
  { icone: <BookMarked className="size-5" aria-hidden />, titulo: 'Catálogo de materiais e serviços', quem: 'Todos',
    texto: 'Os códigos CATMAT (material) e CATSER (serviço) ligam todas as pesquisas. O MEASURE já traz os códigos do ramo de cada secretaria.' },
  { icone: <FileText className="size-5" aria-hidden />, titulo: 'Contratos e planos de contratação', quem: 'Chefias',
    texto: 'Contratos publicados por órgão e planos de contratação anual estão na documentação técnica da API (link no fim da página).' },
  { icone: <FileSearch className="size-5" aria-hidden />, titulo: 'Base da decisão', quem: 'Todos',
    texto: 'A pesquisa mostra a data da consulta e a fonte oficial. Guarde o resultado no processo para fundamentar a análise.' },
];

// ---------------------------------------------------------------- seção completa

export function DadosAbertosCompras() {
  return (
    <div className="flex flex-col gap-6">
      <PesquisaComprasGov />
      <CategoriasDoOrgao />

      <div className="rounded-xl border border-marca-200 bg-marca-50 p-4 text-[15px] leading-relaxed text-marca-950">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-marca-700"><Lightbulb className="size-4" aria-hidden />Em palavras simples</p>
        O governo federal publica, de graça, os dados das compras feitas pelo <b>Compras.gov.br</b>: preços pagos, atas, fornecedores e contratos. Usam o
        sistema os órgãos federais e também estados e municípios que aderiram. O MEASURE consulta esses dados na fonte oficial e mostra aqui. Para o gestor e o
        fiscal, a utilidade principal é <b>comparar</b>: o preço que a empresa cobra está parecido com o que outros órgãos pagaram pelo mesmo item?
      </div>

      <section>
        <h3 className="mb-3 text-base font-bold text-marca-900">Para que serve no seu trabalho</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USOS.map((u) => (
            <li key={u.titulo} className="flex gap-3 rounded-xl border border-slate-200 border-l-4 border-l-acento-500 bg-white p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-marca-900 text-white">{u.icone}</span>
              <span>
                <b className="block text-marca-900">{u.titulo}</b>
                <span className="block text-sm text-slate-700">{u.texto}</span>
                <span className="mt-1 block text-xs font-semibold text-acento-700">{u.quem}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-marca-900"><Info className="size-4" aria-hidden />Como fazer uma pesquisa de preço</h3>
          <ol className="ml-5 list-decimal space-y-1.5 text-sm text-slate-800">
            <li>Escolha "Preço de material" ou "Preço de serviço" e digite parte do nome do item; escolha o código na lista.</li>
            <li>Filtre pela UF para comparar com a região e ajuste a data para ver só compras recentes.</li>
            <li>Compare o <b>preço unitário</b> considerando a <b>quantidade</b>, a <b>data</b> e a <b>forma de fornecimento</b>: caixa com 100 não é o mesmo que unidade.</li>
            <li>Use a <b>mediana</b> como referência e desconfie dos valores muito acima ou muito abaixo dos demais.</li>
            <li>Guarde o resultado no processo, com a data da consulta. Se o preço do contrato estiver muito diferente, comunique o gestor por escrito.</li>
          </ol>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h3 className="mb-2 flex items-center gap-2 text-base font-bold"><AlertTriangle className="size-4" aria-hidden />Cuidados</h3>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>A pesquisa é um apoio. A pesquisa de preço formal segue o art. 23 da Lei nº 14.133/2021 e as normas e modelos do município (INC 03 e 04/2026).</li>
            <li>Os dados são das compras feitas pelo Compras.gov.br. Contratações de Aracaju feitas por outro sistema podem não aparecer.</li>
            <li>Preços antigos precisam ser atualizados antes de comparar; preço de outra região pode ter frete diferente.</li>
            <li>A mesma pesquisa feita de novo em até 12 horas usa a resposta já consultada, para não sobrecarregar o serviço do governo.</li>
          </ul>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <Database className="size-5 shrink-0 text-marca-700" aria-hidden />
        <span className="min-w-0 flex-1">Fonte: API de Dados Abertos do Compras.gov.br (manual do usuário, versão 2.0, fev/2026, MGI/Seges). A documentação técnica completa fica na página oficial.</span>
        <a href={SWAGGER_COMPRAS} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-marca-700 underline hover:text-marca-900">Documentação técnica oficial</a>
      </div>
    </div>
  );
}
