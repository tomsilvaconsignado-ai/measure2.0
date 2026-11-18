// Pesquisa de preços: página própria, minimalista (no espírito de uma página de busca), com a marca MEASURE ao centro e
// uma barra flutuante que reconhece material, serviço ou CNPJ. Os dados vêm da API oficial do Compras.gov.br, consultada
// pelo servidor do MEASURE; o catálogo CATMAT/CATSER completo fica no banco, com busca indexada e prioridade às
// categorias do órgão. O histórico de pesquisas fica salvo por usuário neste navegador.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ambulance, Armchair, ArrowDownUp, Bandage, Building2, ChevronLeft, ChevronRight, Droplets, FireExtinguisher, Hammer, HeartPulse, History, Hospital,
  Lightbulb, Loader2, Microscope, Monitor, Package, Paintbrush, Pill, Plus, Printer, RefreshCw, Search, Shirt, ShieldCheck, SprayCan, Stethoscope,
  Syringe, Tags, Thermometer, Truck, Utensils, Wrench, X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import palavraClara from '@/assets/marca/palavra-measure-clara.png';
import { useSessao } from '@/auth/Sessao';
import { Botao, CaixaErro, Campo, Carregando, Indicador, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarData, formatarDataHora } from '@/lib/formatacao';
import {
  buscarCatalogo, consultarComprasGov, listarCategoriasCatalogo, salvarCategoriaCatalogo, sincronizarCategoria,
  type CategoriaCatalogo, type ConsultaComprasGov, type TipoCatalogo,
} from '@/services/comprasGov';

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

// ---------------------------------------------------------------- histórico (por usuário, neste navegador)

type Modo = ConsultaComprasGov;
interface Historico { modo: Modo; tipo?: TipoCatalogo; codigo?: string; rotulo: string; cnpj?: string; em: string }
const chaveHistorico = (uid: string) => `measure.pesquisa_precos.historico.${uid}`;
function lerHistorico(uid: string): Historico[] { try { return JSON.parse(localStorage.getItem(chaveHistorico(uid)) ?? '[]') as Historico[]; } catch { return []; } }
function gravarHistorico(uid: string, lista: Historico[]) { try { localStorage.setItem(chaveHistorico(uid), JSON.stringify(lista.slice(0, 20))); } catch { /* sem armazenamento */ } }
const mesmo = (a: Historico, b: Historico) => a.modo === b.modo && (a.codigo ?? a.cnpj) === (b.codigo ?? b.cnpj);

// ---------------------------------------------------------------- fundo: produtos e serviços públicos

const ICONES_FUNDO = [Syringe, Pill, Stethoscope, FireExtinguisher, Wrench, Truck, SprayCan, HeartPulse, Microscope, Thermometer, Package, Bandage,
  Hammer, Shirt, Utensils, Droplets, Lightbulb, Paintbrush, Monitor, Ambulance, Building2, Armchair, Printer, Hospital];

function FundoBusca() {
  // grade fixa de ícones (posições determinísticas), em duas camadas que se movem devagar em sentidos opostos
  const celulas = Array.from({ length: 48 }, (_, i) => ({ Icone: ICONES_FUNDO[(i * 7) % ICONES_FUNDO.length]!, x: (i % 8) * 12.5 + ((i * 37) % 9) - 3, y: Math.floor(i / 8) * 17 + ((i * 53) % 11) - 2, r: ((i * 29) % 50) - 25, t: 28 + ((i * 13) % 26) }));
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#06111f]" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_38%,rgba(31,79,159,0.55),transparent_70%),radial-gradient(35%_30%_at_50%_42%,rgba(52,199,154,0.16),transparent_70%)]" />
      <div className="busca-fundo-a absolute -inset-[6%]">
        {celulas.filter((_, i) => i % 2 === 0).map(({ Icone, x, y, r, t }, i) => (
          <Icone key={i} className="absolute text-white/[0.07]" style={{ left: `${x}%`, top: `${y}%`, width: t * 1.6, height: t * 1.6, transform: `rotate(${r}deg)` }} strokeWidth={1.25} />
        ))}
      </div>
      <div className="busca-fundo-b absolute -inset-[6%]">
        {celulas.filter((_, i) => i % 2 === 1).map(({ Icone, x, y, r, t }, i) => (
          <Icone key={i} className="absolute text-acento-300/[0.08]" style={{ left: `${x}%`, top: `${y}%`, width: t * 1.2, height: t * 1.2, transform: `rotate(${-r}deg)` }} strokeWidth={1.25} />
        ))}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(75%_65%_at_50%_45%,transparent_35%,#06111f_100%)]" />
    </div>
  );
}

// ---------------------------------------------------------------- barra de pesquisa flutuante

type Sugestao = { tipo: 'MATERIAL' | 'SERVICO'; codigo: string; descricao: string; categoria: string | null; classe: string | null } | { tipo: 'CNPJ'; cnpj: string } | { tipo: 'HISTORICO'; h: Historico };

function BarraBusca({ compacta, valorInicial, aoEscolher, historico, aoRemoverHistorico }: {
  compacta?: boolean; valorInicial?: string;
  aoEscolher: (s: Exclude<Sugestao, { tipo: 'HISTORICO' }> | Historico) => void;
  historico: Historico[]; aoRemoverHistorico: (h: Historico) => void;
}) {
  const { orgao } = useSessao();
  const [texto, setTexto] = useState(valorInicial ?? '');
  const [atrasado, setAtrasado] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => setTexto(valorInicial ?? ''), [valorInicial]);
  useEffect(() => { const t = setTimeout(() => setAtrasado(texto.trim()), 180); return () => clearTimeout(t); }, [texto]);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const soDigitos = atrasado.replace(/\D/g, '');
  const ehCnpj = soDigitos.length === 14 && /^[\d./-]+$/.test(atrasado);
  const buscar = atrasado.length >= 2 && !ehCnpj;
  const q = useQuery({
    queryKey: ['catalogo-busca', orgao?.id, atrasado], enabled: buscar && !!orgao, staleTime: 5 * 60_000, placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const [m, s] = await Promise.all([buscarCatalogo(orgao!.id, 'MATERIAL', atrasado, 7), buscarCatalogo(orgao!.id, 'SERVICO', atrasado, 5)]);
      return [...m, ...s];
    },
  });
  const sugestoes: Sugestao[] = !texto.trim() ? historico.slice(0, 8).map((h) => ({ tipo: 'HISTORICO' as const, h }))
    : ehCnpj ? [{ tipo: 'CNPJ', cnpj: soDigitos }]
    : [
      ...(q.data ?? []).map((i) => ({ tipo: i.tipo, codigo: String(i.codigo), descricao: i.descricao, categoria: i.categoria, classe: i.nome_classe ?? i.nome_grupo })),
      // código que não está no catálogo local: pesquisa direto na fonte oficial
      ...(/^\d{1,9}$/.test(atrasado) && !(q.data ?? []).some((i) => String(i.codigo) === atrasado)
        ? (['MATERIAL', 'SERVICO'] as const).map((t) => ({ tipo: t, codigo: atrasado, descricao: `${t === 'MATERIAL' ? 'Material' : 'Serviço'} código ${atrasado}`,
            categoria: null, classe: 'pesquisar direto no Compras.gov.br' }))
        : []),
    ];
  useEffect(() => setAtivo(0), [atrasado, aberto]);

  const escolher = (s: Sugestao) => {
    setAberto(false);
    if (s.tipo === 'HISTORICO') { setTexto(s.h.modo === 'fornecedor' ? s.h.cnpj ?? '' : s.h.rotulo); aoEscolher(s.h); return; }
    if (s.tipo === 'CNPJ') setTexto(formatarCnpj(s.cnpj)); else setTexto(s.descricao);
    aoEscolher(s);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, sugestoes.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const s = sugestoes[ativo]; if (s) escolher(s); }
    else if (e.key === 'Escape') setAberto(false);
  };
  const grupo = (s: Sugestao, i: number) => {
    const ant = sugestoes[i - 1];
    if (s.tipo === 'MATERIAL' && (!ant || ant.tipo !== 'MATERIAL')) return 'Materiais (CATMAT)';
    if (s.tipo === 'SERVICO' && (!ant || ant.tipo !== 'SERVICO')) return 'Serviços (CATSER)';
    if (s.tipo === 'HISTORICO' && i === 0) return 'Pesquisas recentes';
    return null;
  };
  const listaAberta = aberto && (sugestoes.length > 0 || (buscar && !q.isFetching));

  return (
    <div ref={caixa} className={cx('relative w-full', compacta ? 'max-w-2xl' : 'max-w-2xl')}>
      <div className={cx('busca-flutuante flex items-center gap-3 border bg-white/95 text-slate-900 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur transition-[box-shadow,border-radius]',
        compacta ? 'h-12 px-4' : 'h-14 px-5', listaAberta ? 'rounded-t-[1.6rem] border-transparent' : 'rounded-full border-white/40 hover:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.15)]')}>
        <Search className="size-5 shrink-0 text-slate-500" aria-hidden />
        <input value={texto} onChange={(e) => { setTexto(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} onKeyDown={tecla}
          role="combobox" aria-expanded={listaAberta} aria-controls="busca-precos-lista" aria-autocomplete="list" aria-label="Pesquisar material, serviço ou CNPJ"
          placeholder="Material, serviço ou CNPJ do fornecedor" autoComplete="off" spellCheck={false}
          className="busca-campo h-full min-w-0 flex-1 border-0 bg-transparent text-base text-slate-900 placeholder:text-slate-500 focus:outline-none" />
        {q.isFetching && buscar && <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" aria-hidden />}
        {texto && <button type="button" onClick={() => { setTexto(''); setAberto(true); }} className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="Limpar"><X className="size-4" /></button>}
      </div>
      {listaAberta && (
        <ul id="busca-precos-lista" role="listbox" className="absolute inset-x-0 top-full z-30 max-h-[60vh] overflow-auto rounded-b-[1.6rem] bg-white/95 pb-3 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur">
          <li aria-hidden className="mx-5 mb-1 border-t border-slate-200" />
          {sugestoes.map((s, i) => {
            const titulo = grupo(s, i);
            const chave = s.tipo === 'HISTORICO' ? `h${i}` : s.tipo === 'CNPJ' ? 'cnpj' : `${s.tipo}${s.codigo}`;
            return (
              <li key={chave} role="presentation">
                {titulo && <p className="px-5 pb-1 pt-2 text-[11px] font-bold text-slate-500">{titulo}</p>}
                <div role="option" aria-selected={i === ativo} onMouseEnter={() => setAtivo(i)} onMouseDown={(e) => { e.preventDefault(); escolher(s); }}
                  className={cx('flex cursor-pointer items-center gap-3 px-5 py-2 text-sm', i === ativo && 'bg-marca-50')}>
                  {s.tipo === 'HISTORICO' ? <>
                    <History className="size-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-marca-900">{s.h.rotulo}<span className="ml-2 text-xs text-slate-500">{ROTULO_MODO[s.h.modo]}</span></span>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); aoRemoverHistorico(s.h); }}
                      className="rounded px-1.5 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-800" aria-label={`Remover ${s.h.rotulo} do histórico`}>Remover</button>
                  </> : s.tipo === 'CNPJ' ? <>
                    <Building2 className="size-4 shrink-0 text-marca-700" aria-hidden />
                    <span className="flex-1">Situação do fornecedor <b>{formatarCnpj(s.cnpj)}</b></span>
                  </> : <>
                    {s.tipo === 'MATERIAL' ? <Package className="size-4 shrink-0 text-marca-700" aria-hidden /> : <Wrench className="size-4 shrink-0 text-acento-700" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-slate-900">{s.descricao}</span>
                      <span className="block truncate text-xs text-slate-500"><span className="numero font-semibold text-slate-600">{s.codigo}</span>{s.categoria ? <> · <span className="text-acento-700">★ {s.categoria}</span></> : s.classe ? ` · ${s.classe}` : ''}</span>
                    </span>
                  </>}
                </div>
              </li>
            );
          })}
          {!sugestoes.length && <li className="px-5 py-3 text-sm text-slate-600">Nenhum item com esse nome no catálogo. Tente outra palavra ou digite o código CATMAT/CATSER para pesquisar direto na fonte.</li>}
        </ul>
      )}
    </div>
  );
}

const ROTULO_MODO: Record<Modo, string> = { preco_material: 'preço de material', preco_servico: 'preço de serviço', arp_item: 'atas de registro', fornecedor: 'fornecedor' };

// ---------------------------------------------------------------- página

interface Selecionado { tipo: TipoCatalogo; codigo: string; rotulo: string }

export function PesquisaPrecos() {
  const { orgao, contexto, pode, ehPlataforma } = useSessao();
  const uid = contexto?.perfil?.id ?? 'anonimo';
  const [historico, setHistorico] = useState<Historico[]>(() => lerHistorico(uid));
  const [item, setItem] = useState<Selecionado | null>(null);
  const [cnpj, setCnpj] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const [uf, setUf] = useState('');
  const [desde, setDesde] = useState(umAnoAtras());
  const [pagina, setPagina] = useState(1);
  const [categorias, setCategorias] = useState(false);
  useEffect(() => { document.title = 'Pesquisa de preços · MEASURE'; }, []);

  const registrar = (h: Omit<Historico, 'em'>) => setHistorico((lista) => {
    const novo = { ...h, em: new Date().toISOString() };
    const n = [novo, ...lista.filter((x) => !mesmo(x, novo))];
    gravarHistorico(uid, n);
    return n;
  });
  const remover = (h: Historico) => setHistorico((lista) => { const n = lista.filter((x) => !mesmo(x, h)); gravarHistorico(uid, n); return n; });

  const executar = (m: Modo, it: Selecionado | null, c: string | null) => {
    setModo(m); setItem(it); setCnpj(c); setPagina(1);
    if (m === 'fornecedor' && c) registrar({ modo: m, cnpj: c, rotulo: formatarCnpj(c) });
    else if (it) registrar({ modo: m, tipo: it.tipo, codigo: it.codigo, rotulo: it.rotulo });
  };
  const escolher = (s: Exclude<Sugestao, { tipo: 'HISTORICO' }> | Historico) => {
    if ('em' in s) {  // item do histórico
      if (s.modo === 'fornecedor') executar('fornecedor', null, s.cnpj ?? null);
      else executar(s.modo, { tipo: s.tipo ?? 'MATERIAL', codigo: s.codigo!, rotulo: s.rotulo }, null);
    } else if (s.tipo === 'CNPJ') executar('fornecedor', null, s.cnpj);
    else executar(s.tipo === 'SERVICO' ? 'preco_servico' : 'preco_material', { tipo: s.tipo, codigo: s.codigo, rotulo: s.descricao }, null);
  };

  const parametros: Record<string, string> | null = !modo ? null
    : modo === 'fornecedor' ? (cnpj ? { cnpj } : null)
    : !item ? null
    : modo === 'preco_material' ? { codigo: item.codigo, estado: uf, dataCompraInicio: desde }
    : modo === 'preco_servico' ? { codigoItemCatalogo: item.codigo, estado: uf, dataCompraInicio: desde }
    : { codigoItem: item.codigo, dataVigenciaInicialMin: desde || umAnoAtras(), dataVigenciaInicialMax: hojeIso() };
  const q = useQuery({
    queryKey: ['compras-gov', modo, parametros, pagina], enabled: !!parametros, staleTime: 10 * 60_000, retry: false,
    queryFn: () => consultarComprasGov<Linha>(modo!, parametros!, pagina),
  });
  const r = q.data;
  const resultados = !!modo;
  const podeEditarCategorias = pode('configuracoes', 'editar') || ehPlataforma;

  if (!orgao) return <SemPermissao texto="Escolha um órgão para pesquisar preços." />;

  const barra = (compacta: boolean) => (
    <BarraBusca compacta={compacta} valorInicial={modo === 'fornecedor' ? (cnpj ? formatarCnpj(cnpj) : '') : item?.rotulo}
      aoEscolher={escolher} historico={historico} aoRemoverHistorico={remover} />
  );

  return (
    <div className="pesquisa-precos -mx-4 -my-6 min-h-[calc(100dvh-4rem)] px-4 pb-10 text-white sm:-mx-6 sm:px-6">
      <FundoBusca />

      {!resultados ? (
        <div className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center pb-16 pt-10">
          <div className="busca-entrada flex w-full flex-col items-center">
            <img src={palavraClara} alt="MEASURE" draggable={false} className="h-11 w-auto drop-shadow-[0_6px_24px_rgba(52,199,154,0.25)] sm:h-16" />
            <p className="mb-9 mt-4 text-sm font-medium tracking-wide text-marca-200">Pesquisa de preços públicos</p>
            {barra(false)}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button type="button" disabled={!item} onClick={() => item && executar(item.tipo === 'SERVICO' ? 'preco_servico' : 'preco_material', item, null)}
                className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15 hover:ring-white/30 disabled:cursor-default disabled:opacity-60">Pesquisar preço</button>
              <button type="button" disabled={!item} onClick={() => item && executar('arp_item', item, null)}
                className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15 hover:ring-white/30 disabled:cursor-default disabled:opacity-60">Atas de registro de preços</button>
            </div>
            <p className="mt-8 max-w-xl text-center text-sm leading-relaxed text-marca-200">
              Digite o nome do item, como <i>seringa</i> ou <i>recarga de extintor</i>, e escolha na lista. Para ver a situação de uma empresa, digite o CNPJ.
            </p>
          </div>
        </div>
      ) : (
        <div className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <button type="button" onClick={() => { setModo(null); setItem(null); setCnpj(null); }} title="Nova pesquisa" className="shrink-0">
              <img src={palavraClara} alt="MEASURE — nova pesquisa" className="h-6 w-auto" draggable={false} />
            </button>
            {barra(true)}
          </div>

          {modo !== 'fornecedor' && item && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 text-sm sm:pl-[calc(6rem+1rem)]">
              {([['preco', 'Preços praticados'], ['arp_item', 'Atas de registro']] as Array<['preco' | 'arp_item', string]>).map(([id, rot]) => {
                const ativo = id === 'arp_item' ? modo === 'arp_item' : modo !== 'arp_item';
                return (
                  <button key={id} type="button" onClick={() => executar(id === 'arp_item' ? 'arp_item' : item.tipo === 'SERVICO' ? 'preco_servico' : 'preco_material', item, null)}
                    className={cx('rounded-full px-3.5 py-1 font-semibold transition-colors', ativo ? 'bg-chamada-500 text-marca-950' : 'text-marca-100 hover:bg-white/10')}>{rot}</button>
                );
              })}
              <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" aria-hidden />
              {modo !== 'arp_item' && (
                <label className="flex items-center gap-1.5 text-marca-100">UF
                  <select value={uf} onChange={(e) => { setUf(e.target.value); setPagina(1); }} className="busca-filtro rounded-md px-2 py-1 text-sm">
                    <option value="">Brasil todo</option>{UFS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1.5 text-marca-100">{modo === 'arp_item' ? 'Vigentes desde' : 'Desde'}
                <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} className="busca-filtro rounded-md px-2 py-1 text-sm" />
              </label>
            </div>
          )}

          <div className="mx-auto mt-5 max-w-6xl" aria-live="polite">
            {modo !== 'fornecedor' && item && (
              <p className="mb-3 text-sm text-marca-100"><span className="numero font-semibold text-chamada-300">{item.tipo === 'SERVICO' ? 'CATSER' : 'CATMAT'} {item.codigo}</span> · {item.rotulo}</p>
            )}
            {q.isLoading ? (
              <div className="rounded-2xl bg-white p-6 text-slate-900 shadow-2xl"><Carregando texto="Consultando o Compras.gov.br... a primeira consulta de um item leva alguns segundos; as próximas são imediatas." /></div>
            ) : q.error ? <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} />
              : r && !r.resultado?.length ? (
                <div className="rounded-2xl bg-white p-2 text-slate-900 shadow-2xl"><Vazio titulo="Nada encontrado" descricao="O Compras.gov.br não tem registros para esta pesquisa. Tente sem a UF ou com uma data mais antiga." /></div>
              ) : r ? (
                <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-2xl sm:p-5">
                  {modo === 'fornecedor' ? <FichaFornecedor f={r.resultado[0]!} />
                    : modo === 'arp_item' ? <TabelaAtas linhas={r.resultado} />
                    : <TabelaPrecos linhas={r.resultado} servico={modo === 'preco_servico'} />}
                  <Paginas r={r} aoMudar={setPagina} />
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <ShieldCheck className="size-3.5 text-acento-600" aria-hidden />
                    Fonte: dados abertos oficiais do Compras.gov.br. Consulta de {formatarDataHora(r.consultado_em)}. A pesquisa é apoio; a pesquisa formal segue o art. 23 da Lei nº 14.133/2021.
                  </p>
                </div>
              ) : null}
            {q.isFetching && !q.isLoading && <p className="mt-2 flex items-center gap-1.5 text-xs text-marca-200"><Loader2 className="size-3.5 animate-spin" aria-hidden />Atualizando...</p>}
          </div>
        </div>
      )}

      <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-marca-200/80">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden />Dados da página oficial do Compras.gov.br</span>
        <button type="button" onClick={() => setCategorias(true)} className="inline-flex items-center gap-1.5 hover:text-white"><Tags className="size-3.5" aria-hidden />Categorias prioritárias do órgão</button>
        {historico.length > 0 && <button type="button" onClick={() => { gravarHistorico(uid, []); setHistorico([]); }} className="inline-flex items-center gap-1.5 hover:text-white"><History className="size-3.5" aria-hidden />Limpar histórico</button>}
      </footer>

      <Modal aberto={categorias} aoFechar={() => setCategorias(false)} titulo="Categorias prioritárias do órgão" largura="lg"
        descricao={podeEditarCategorias ? 'Os itens destas categorias aparecem primeiro na pesquisa, marcados com ★.' : undefined}>
        <CategoriasDoOrgao />
      </Modal>
    </div>
  );
}
