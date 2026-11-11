// Relatórios patrimoniais em PDF (com filtros combináveis), histórico individual, visões agrupadas
// (por coordenação, por unidade, por responsável) e o histórico dos relatórios emitidos.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileDown, FileText, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, SemPermissao, Selecao, Vazio } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import {
  buscarBens, CONSERVACAO, dadosTermoResponsabilidade, fichaBem, listarInventarios, listarMovimentacoes, obterInventario, painelPatrimonio, relatoriosEmitidos,
  SITUACAO, TIPOS_TRANSFERENCIA, type FiltrosBens,
} from '@/services/patrimonio';
import { SeletorBem, SeletorLocal, SeletorResponsavel, SeletorSetor, useCategorias } from './comum';
import { Barras } from './Painel';
import { abrirRelatorioGuardado, pdfBens, pdfHistorico, pdfInventario, pdfMovimentacoes, pdfTermoResponsabilidade, type Agrupamento } from './pdf';

type Fonte = 'bens' | 'movs' | 'historico' | 'inventario' | 'servidor';
const RELATORIOS: Array<{ id: string; titulo: string; fonte: Fonte; agrupar?: Agrupamento; bens?: FiltrosBens; tipos?: string[]; situacoes?: string[] }> = [
  { id: 'GERAL', titulo: 'Relatório geral de patrimônio', fonte: 'bens' },
  { id: 'POR_UNIDADE', titulo: 'Relatório por unidade de saúde', fonte: 'bens', agrupar: 'local' },
  { id: 'POR_DIRETORIA', titulo: 'Relatório por diretoria', fonte: 'bens', agrupar: 'diretoria' },
  { id: 'POR_COORDENACAO', titulo: 'Relatório por coordenação', fonte: 'bens', agrupar: 'coordenacao' },
  { id: 'POR_CATEGORIA', titulo: 'Relatório por categoria', fonte: 'bens', agrupar: 'categoria' },
  { id: 'POR_RESPONSAVEL', titulo: 'Relatório por servidor responsável', fonte: 'bens', agrupar: 'responsavel' },
  { id: 'MANUTENCAO', titulo: 'Relatório de bens em manutenção', fonte: 'bens', bens: { situacoes: ['EM_MANUTENCAO'] } },
  { id: 'DANIFICADOS', titulo: 'Relatório de bens danificados', fonte: 'bens', bens: { conservacoes: ['DANIFICADO', 'RUIM', 'PESSIMO', 'IRRECUPERAVEL', 'NECESSITA_MANUTENCAO'] } },
  { id: 'DISPONIVEIS', titulo: 'Relatório de bens disponíveis', fonte: 'bens', bens: { situacoes: ['DISPONIVEL', 'EM_ESTOQUE'] } },
  { id: 'BAIXADOS', titulo: 'Relatório de bens baixados', fonte: 'bens', bens: { situacoes: ['BAIXADO'] } },
  { id: 'TRANSFERENCIAS', titulo: 'Relatório de transferências', fonte: 'movs', tipos: TIPOS_TRANSFERENCIA },
  { id: 'TROCAS', titulo: 'Relatório de trocas entre coordenações', fonte: 'movs', tipos: ['TROCA'] },
  { id: 'SUBSTITUICOES', titulo: 'Relatório de substituições', fonte: 'movs', tipos: ['SUBSTITUICAO'] },
  { id: 'MOVIMENTACOES', titulo: 'Relatório de movimentações por período', fonte: 'movs' },
  { id: 'HISTORICO', titulo: 'Relatório de histórico individual de patrimônio', fonte: 'historico' },
  { id: 'BENS_SERVIDOR', titulo: 'Relatório de bens sob responsabilidade de cada servidor', fonte: 'servidor' },
  { id: 'INVENTARIO', titulo: 'Relatório de inventário', fonte: 'inventario' },
  { id: 'PENDENTES', titulo: 'Relatório de movimentações pendentes', fonte: 'movs', situacoes: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA_DESTINO', 'PENDENTE_REGULARIZACAO'] },
  { id: 'LOCALIZACAO', titulo: 'Relatório de bens por localização física', fonte: 'bens', agrupar: 'localizacao' },
  { id: 'SEM_RESPONSAVEL', titulo: 'Relatório de bens sem responsável definido', fonte: 'bens', bens: { sem_responsavel: true } },
];

type Ref = { id: string; rotulo: string } | null;

export function Relatorios() {
  const { orgao, contexto, pode } = useSessao();
  const qc = useQueryClient();
  const cats = useCategorias();
  const [tipo, setTipo] = useState('GERAL');
  const [ano, setAno] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [setor, setSetor] = useState<Ref>(null);
  const [local, setLocal] = useState<Ref>(null);
  const [resp, setResp] = useState<Ref>(null);
  const [bem, setBem] = useState<Ref>(null);
  const [categoria, setCategoria] = useState('');
  const [conservacao, setConservacao] = useState('');
  const [situacao, setSituacao] = useState('');
  const [numero, setNumero] = useState('');
  const [inventario, setInventario] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const emitidos = useQuery({ queryKey: ['patrimonio', 'relatorios', orgao?.id], queryFn: () => relatoriosEmitidos(orgao!.id), enabled: !!orgao });
  const invs = useQuery({ queryKey: ['patrimonio', 'inventarios', orgao?.id], queryFn: () => listarInventarios(orgao!.id), enabled: !!orgao && tipo === 'INVENTARIO' });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('patrimonio', 'exportar')) return <SemPermissao texto="Você não tem permissão para emitir relatórios de patrimônio." />;
  const r = RELATORIOS.find((x) => x.id === tipo)!;
  const quem = contexto?.perfil?.nome || contexto?.perfil?.email || '';
  const textoFiltros = () => [
    ano && `Ano ${ano}`, (de || ate) && `Período ${de ? de.split('-').reverse().join('/') : '...'} a ${ate ? ate.split('-').reverse().join('/') : '...'}`,
    setor && `Setor: ${setor.rotulo}`, local && `Unidade: ${local.rotulo}`, resp && `Responsável: ${resp.rotulo}`,
    categoria && `Categoria: ${cats.data?.find((c) => c.id === categoria)?.nome}`, conservacao && `Conservação: ${CONSERVACAO[conservacao]}`,
    situacao && `Situação: ${SITUACAO[situacao]}`, numero && `Nº ${numero}`,
  ].filter(Boolean).join(' · ') || 'Sem filtros (todo o escopo de acesso)';
  const filtrosGravados = { ano, de, ate, setor: setor?.rotulo, local: local?.rotulo, responsavel: resp?.rotulo, categoria_id: categoria, conservacao, situacao, numero };

  const gerar = async () => {
    setErro(null); setGerando(true);
    try {
      if (r.fonte === 'bens' || r.fonte === 'servidor') {
        if (r.fonte === 'servidor' && !resp) throw { erro: 'Escolha o servidor responsável.' };
        const f: FiltrosBens = { ...(r.bens ?? {}), limite: 5000, offset: 0, unidade_id: setor?.id ?? null, local_id: local?.id ?? null, responsavel_id: resp?.id ?? null,
          categoria_id: categoria || null, numero: numero || undefined };
        if (conservacao) f.conservacoes = [conservacao];
        if (situacao) f.situacoes = [situacao];
        let bens = (await buscarBens(orgao.id, f)).itens;
        const inicio = ano ? `${ano}-01-01` : de; const fim = ano ? `${ano}-12-31` : ate;
        if (inicio || fim) bens = bens.filter((b) => b.data_aquisicao && (!inicio || b.data_aquisicao >= inicio) && (!fim || b.data_aquisicao <= fim));
        if (!bens.length) throw { erro: 'Nenhum bem com esses filtros.' };
        if (r.fonte === 'servidor') {
          const d = await dadosTermoResponsabilidade(orgao.id, { responsavel_id: resp!.id });
          await pdfTermoResponsabilidade(orgao.id, quem, { titulo: r.titulo, quem: resp!.rotulo, responsavel: d.responsavel, bens });
        } else {
          await pdfBens({ tenantId: orgao.id, emitidoPor: quem, tipo: r.id, titulo: r.titulo, filtrosTexto: `${textoFiltros()}${ano || de || ate ? ' (pela data de aquisição)' : ''}`, filtros: filtrosGravados, bens, agrupar: r.agrupar ?? 'nenhum' });
        }
      } else if (r.fonte === 'movs') {
        const movs = (await listarMovimentacoes(orgao.id, { tipos: r.tipos, situacoes: r.situacoes, de: ano ? `${ano}-01-01` : de || undefined, ate: ano ? `${ano}-12-31` : ate || undefined,
          unidade_id: setor?.id ?? null, limite: 5000 })).itens;
        if (!movs.length) throw { erro: 'Nenhuma movimentação com esses filtros.' };
        await pdfMovimentacoes({ tenantId: orgao.id, emitidoPor: quem, tipo: r.id, titulo: r.titulo, filtrosTexto: textoFiltros(), filtros: filtrosGravados, movs });
      } else if (r.fonte === 'historico') {
        if (!bem) throw { erro: 'Escolha o bem patrimonial.' };
        await pdfHistorico(orgao.id, await fichaBem(bem.id), quem);
      } else if (r.fonte === 'inventario') {
        if (!inventario) throw { erro: 'Escolha o inventário.' };
        await pdfInventario(orgao.id, await obterInventario(inventario), quem);
      }
      await qc.invalidateQueries({ queryKey: ['patrimonio', 'relatorios'] });
    } catch (e) { setErro(traduzirErro(e).mensagem); } finally { setGerando(false); }
  };
  const anos = Array.from({ length: 8 }, (_, k) => new Date().getFullYear() - k);
  return (
    <>
      <CabecalhoPagina titulo="Relatórios patrimoniais" descricao="PDF com o timbre do órgão, salvo automaticamente como RELATORIO DE PATRIMONIO - ANO AAAA (com numeração sequencial)." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Cartao titulo="Emitir relatório">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selecao className="sm:col-span-2" rotulo="Relatório" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {RELATORIOS.map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.titulo.replace('Relatório ', '').replace(/^de /, '').replace(/^./, (c) => c.toUpperCase())}</option>)}
            </Selecao>
            {r.fonte === 'historico' && <div className="sm:col-span-2"><SeletorBem valor={bem?.id ?? null} rotuloValor={bem?.rotulo} aoMudar={(v, b) => setBem(v && b ? { id: v, rotulo: `${b.numero} – ${b.descricao}` } : null)} /></div>}
            {r.fonte === 'inventario' && <Selecao className="sm:col-span-2" rotulo="Inventário" value={inventario} onChange={(e) => setInventario(e.target.value)}>
              <option value="">Escolha...</option>{invs.data?.map((i) => <option key={i.id} value={i.id}>{i.titulo}</option>)}</Selecao>}
            {(r.fonte === 'bens' || r.fonte === 'movs' || r.fonte === 'servidor') && <>
              <Selecao rotulo={r.fonte === 'movs' ? 'Ano' : 'Ano de aquisição'} value={ano} onChange={(e) => setAno(e.target.value)}><option value="">Todos</option>{anos.map((a) => <option key={a}>{a}</option>)}</Selecao>
              <div className="grid grid-cols-2 gap-2"><Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} disabled={!!ano} /><Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} disabled={!!ano} /></div>
              <SeletorSetor rotulo="Diretoria / coordenação / gerência" valor={setor?.id ?? null} rotuloValor={setor?.rotulo} aoMudar={(v, o) => setSetor(v && o ? { id: v, rotulo: o.rotulo } : null)} />
            </>}
            {(r.fonte === 'bens' || r.fonte === 'servidor') && <>
              <SeletorLocal rotulo="Unidade" valor={local?.id ?? null} rotuloValor={local?.rotulo} aoMudar={(v, o) => setLocal(v && o ? { id: v, rotulo: o.rotulo } : null)} />
              <SeletorResponsavel rotulo={r.fonte === 'servidor' ? 'Servidor responsável *' : 'Responsável'} valor={resp?.id ?? null} rotuloValor={resp?.rotulo} aoMudar={(v, o) => setResp(v && o ? { id: v, rotulo: o.rotulo } : null)} />
              <Selecao rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Todas</option>{(cats.data ?? []).filter((c) => !c.pai_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</Selecao>
              {!r.bens?.conservacoes && <Selecao rotulo="Estado de conservação" value={conservacao} onChange={(e) => setConservacao(e.target.value)}><option value="">Todos</option>{Object.entries(CONSERVACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>}
              {!r.bens?.situacoes && <Selecao rotulo="Situação operacional" value={situacao} onChange={(e) => setSituacao(e.target.value)}><option value="">Todas (sem baixados)</option>{Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>}
              <Campo rotulo="Número patrimonial" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </>}
          </div>
          {erro && <div className="mt-3"><CaixaErro mensagem={erro} /></div>}
          <Botao className="mt-4" icone={<FileDown className="size-4" />} carregando={gerando} onClick={() => void gerar()}>Gerar PDF</Botao>
        </Cartao>
        <Cartao titulo="Relatórios emitidos">
          {emitidos.isLoading ? <Carregando /> : !emitidos.data?.length ? <p className="text-sm text-slate-500">Nenhum relatório emitido ainda.</p> : (
            <ul className="flex max-h-[32rem] flex-col divide-y divide-slate-100 overflow-y-auto">{emitidos.data.map((e) => (
              <li key={e.id} className="flex items-start gap-2 py-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={e.nome_arquivo}>{e.nome_arquivo}</p>
                  <p className="text-xs text-slate-500">{e.titulo} · {formatarDataHora(e.gerado_em)} · {e.gerado_por}</p></div>
                {e.documento && <>
                  <button className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Visualizar ${e.nome_arquivo}`} onClick={() => abrirRelatorioGuardado(e.documento!.storage_path, e.nome_arquivo, false).catch((x) => toast.error(mensagemDeErro(x)))}><Eye className="size-4" /></button>
                  <button className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Baixar ${e.nome_arquivo}`} onClick={() => abrirRelatorioGuardado(e.documento!.storage_path, e.nome_arquivo, true).catch((x) => toast.error(mensagemDeErro(x)))}><Download className="size-4" /></button>
                </>}
              </li>))}</ul>
          )}
        </Cartao>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- histórico de patrimônio

export function Historico() {
  const { orgao } = useSessao();
  const [bem, setBem] = useState<Ref>(null);
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  return (
    <>
      <CabecalhoPagina titulo="Histórico de patrimônio" descricao="A trajetória completa de um bem: movimentações, responsáveis, unidades, confirmações e documentos." />
      <Cartao>
        <div className="max-w-xl"><SeletorBem rotulo="Bem patrimonial" valor={bem?.id ?? null} rotuloValor={bem?.rotulo} aoMudar={(v, b) => setBem(v && b ? { id: v, rotulo: `${b.numero} – ${b.descricao}` } : null)} /></div>
        {bem ? <p className="mt-3 text-sm"><Link to={`/patrimonio/bens?bem=${bem.id}`} className="inline-flex items-center gap-1 font-medium text-marca-700 hover:underline"><Search className="size-4" />Abrir a ficha completa (aba Movimentações e Histórico, e o PDF)</Link></p>
          : <p className="mt-3 text-sm text-slate-500">Escolha um bem para ver o histórico.</p>}
      </Cartao>
    </>
  );
}

// ---------------------------------------------------------------- visões agrupadas

export function Agrupado({ por }: { por: 'coordenacao' | 'local' | 'responsavel' }) {
  const { orgao, contexto, pode } = useSessao();
  const q = useQuery({ queryKey: ['patrimonio', 'painel', orgao?.id, null], queryFn: () => painelPatrimonio(orgao!.id, null), enabled: !!orgao });
  const [gerando, setGerando] = useState<string | null>(null);
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  const titulo = por === 'coordenacao' ? 'Bens por coordenação' : por === 'local' ? 'Bens por unidade' : 'Responsáveis';
  const termo = async (id: string, nome: string) => {
    setGerando(id);
    try {
      const d = await dadosTermoResponsabilidade(orgao.id, por === 'responsavel' ? { responsavel_id: id } : { local_id: id });
      if (!d.bens.length) throw { erro: 'Nenhum bem para este termo.' };
      await pdfTermoResponsabilidade(orgao.id, contexto?.perfil?.nome || '', { titulo: `Termo de responsabilidade – ${nome}`, quem: nome, responsavel: d.responsavel, bens: d.bens });
    } catch (e) { toast.error(mensagemDeErro(e)); } finally { setGerando(null); }
  };
  return (
    <>
      <CabecalhoPagina titulo={titulo} descricao={por === 'responsavel' ? 'Servidores com bens sob a sua guarda e o termo de responsabilidade de cada um.' : 'Distribuição dos bens no seu escopo de acesso. Clique para ver a lista.'} />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data ? null : por === 'coordenacao'
        ? <div className="grid gap-4 lg:grid-cols-2"><Barras titulo="Por coordenação" dados={q.data.por_coordenacao} /><Barras titulo="Por diretoria" dados={q.data.por_diretoria} /></div>
        : (
          <Cartao>
            {!(por === 'local' ? q.data.por_local : q.data.por_responsavel).length ? <Vazio titulo="Sem bens neste recorte" /> : (
              <ul className="divide-y divide-slate-100">
                {(por === 'local' ? q.data.por_local.map((x) => ({ id: x.id, nome: x.nome, detalhe: '', total: x.total }))
                  : q.data.por_responsavel.map((x) => ({ id: x.id, nome: x.nome, detalhe: `Matrícula ${x.matricula}`, total: x.total }))).map((x) => (
                  <li key={`${x.id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Link to={x.id ? `/patrimonio/bens?${por === 'local' ? 'local' : 'responsavel'}=${x.id}` : '/patrimonio/bens'} className="min-w-0 flex-1 hover:underline">
                      <span className="block text-sm font-medium">{x.nome}</span>{x.detalhe && <span className="text-xs text-slate-500">{x.detalhe}</span>}</Link>
                    <span className="numero text-sm text-slate-600">{x.total} bem(ns)</span>
                    {x.id && pode('patrimonio', 'exportar') && <Botao pequeno variante="secundario" icone={<FileDown className="size-4" />} carregando={gerando === x.id} onClick={() => void termo(x.id!, x.nome)}>Termo de responsabilidade</Botao>}
                  </li>
                ))}
              </ul>
            )}
            {por === 'responsavel' && <p className="mt-3 text-xs text-slate-500">Lista os 15 servidores com mais bens. Para outro servidor, use o relatório "bens sob responsabilidade de cada servidor".</p>}
          </Cartao>
        )}
    </>
  );
}

export const PorCoordenacao = () => <Agrupado por="coordenacao" />;
export const PorUnidade = () => <Agrupado por="local" />;
export const Responsaveis = () => <Agrupado por="responsavel" />;
