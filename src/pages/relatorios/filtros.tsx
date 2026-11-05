// Estado e painel de filtros dos relatórios (compartilhados pelo completo, pelo resumo e pela impressão).
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useSessao } from '@/auth/Sessao';
import { MultiBusca, type Item } from '@/components/ui/MultiBusca';
import { Botao, Selecao, cx } from '@/components/ui/basicos';
import { formatarCnpj, formatarCpf } from '@/lib/formatacao';
import { buscarFornecedoresOpcoes, listarClassificadores, listarUnidadesAtendidas } from '@/services/cadastros';
import { listarContratos } from '@/services/execucao';
import { anosComMovimento, CAMPOS_CLASSIFICACAO, type Filtros } from '@/services/relatorios';

export interface EstadoFiltros {
  anoBase: 'EMPENHO' | 'EMISSAO';
  anos: number[];
  contratos: Item[];
  fornecedores: Item[];
  unidades: Item[];
  classificadores: Record<string, Item[]>;
  statusAtesto: string;
  statusPagamento: string;
  incluirCanceladas: boolean;
}

export const filtrosVazios = (): EstadoFiltros => ({
  anoBase: 'EMPENHO', anos: [], contratos: [], fornecedores: [], unidades: [], classificadores: {}, statusAtesto: '', statusPagamento: '', incluirCanceladas: false,
});

/** Estado da tela → parâmetros do servidor */
export function paraServidor(e: EstadoFiltros): Filtros {
  const f: Filtros = {
    ano_base: e.anoBase, anos: e.anos, contratos: e.contratos.map((i) => i.id), fornecedores: e.fornecedores.map((i) => i.id),
    unidades: e.unidades.map((i) => i.id), status_atesto: e.statusAtesto, status_pagamento: e.statusPagamento, incluir_canceladas: e.incluirCanceladas,
  };
  for (const [chave, itens] of Object.entries(e.classificadores)) if (itens.length) f[chave] = itens.map((i) => i.id);
  return f;
}

/** Critérios por extenso (impressos separados do título, como pede a especificação) */
export function descreverCriterios(e: EstadoFiltros): string[] {
  const c: string[] = [];
  c.push(`Ano considerado: ${e.anoBase === 'EMISSAO' ? 'data de emissão da nota' : 'exercício do empenho'}`);
  if (e.anos.length) c.push(`Ano(s): ${[...e.anos].sort().join(', ')}`);
  if (e.contratos.length) c.push(`Contrato(s): ${e.contratos.map((i) => i.rotulo).join('; ')}`);
  if (e.fornecedores.length) c.push(`Fornecedor(es): ${e.fornecedores.map((i) => i.rotulo).join('; ')}`);
  for (const [chave, , nome] of CAMPOS_CLASSIFICACAO) {
    const itens = e.classificadores[chave] ?? [];
    if (itens.length) c.push(`${nome}: ${itens.map((i) => i.rotulo).join('; ')}`);
  }
  if (e.unidades.length) c.push(`Unidade(s) atendida(s): ${e.unidades.map((i) => i.rotulo).join('; ')}`);
  if (e.statusAtesto) c.push(`Atesto: ${e.statusAtesto === 'ATESTADA' ? 'atestadas' : 'pendentes'}`);
  if (e.statusPagamento) c.push(`Pagamento: ${e.statusPagamento.toLowerCase()}`);
  if (e.incluirCanceladas) c.push('Inclui notas canceladas (não somadas nos totais)');
  return c;
}

export const temFiltro = (e: EstadoFiltros) => !!(e.anos.length || e.contratos.length || e.fornecedores.length || e.unidades.length
  || Object.values(e.classificadores).some((v) => v.length) || e.statusAtesto || e.statusPagamento || e.incluirCanceladas || e.anoBase !== 'EMPENHO');

export function PainelFiltros({ estado, aoMudar, completo }: { estado: EstadoFiltros; aoMudar: (e: EstadoFiltros) => void; completo: boolean }) {
  const { orgao } = useSessao();
  const [mais, setMais] = useState(Object.values(estado.classificadores).some((v) => v.length));
  const anos = useQuery({ queryKey: ['anos-movimento', orgao?.id], queryFn: () => anosComMovimento(orgao!.id), enabled: !!orgao });
  const set = <K extends keyof EstadoFiltros>(k: K, v: EstadoFiltros[K]) => aoMudar({ ...estado, [k]: v });
  const setClass = (chave: string, itens: Item[]) => aoMudar({ ...estado, classificadores: { ...estado.classificadores, [chave]: itens } });
  const anosDisponiveis = [...new Set([...(anos.data ?? []), new Date().getFullYear()])].sort((a, b) => b - a);
  const classificadorBusca = (tipo: string) => async (t: string) =>
    (await listarClassificadores({ tenantId: orgao!.id, tipo: tipo as never, busca: t, limite: 30 })).itens.map((c) => ({ valor: c.id, rotulo: `${c.codigo} – ${c.descricao}` }));
  const principais = CAMPOS_CLASSIFICACAO.filter(([k]) => ['acoes', 'elementos', 'subelementos', 'fontes'].includes(k));
  const outros = CAMPOS_CLASSIFICACAO.filter(([k]) => !['acoes', 'elementos', 'subelementos', 'fontes'].includes(k));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Ano(s)</span>
          <select className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs" value={estado.anoBase} aria-label="Ano considerado"
            onChange={(e) => set('anoBase', e.target.value as EstadoFiltros['anoBase'])}>
            <option value="EMPENHO">pelo exercício do empenho</option><option value="EMISSAO">pela data de emissão da nota</option>
          </select>
          {estado.anos.length > 0 && <button type="button" className="text-xs text-marca-700 hover:underline" onClick={() => set('anos', [])}>limpar anos</button>}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Anos">
          {anosDisponiveis.map((a) => {
            const on = estado.anos.includes(a);
            return <button key={a} type="button" aria-pressed={on} onClick={() => set('anos', on ? estado.anos.filter((x) => x !== a) : [...estado.anos, a])}
              className={cx('numero rounded-lg px-3 py-1 text-sm ring-1 ring-inset', on ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{a}</button>;
          })}
          <span className="self-center text-xs text-slate-500">{estado.anos.length ? '' : 'todos os anos'}</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <MultiBusca rotulo="Contrato(s)" itens={estado.contratos} aoMudar={(v) => set('contratos', v)} chave={['f-contratos', orgao?.id]}
          placeholder="Número, fornecedor ou objeto"
          buscar={async (t) => (await listarContratos({ tenantId: orgao!.id, busca: t, situacao: 'TODOS', limite: 20, offset: 0 })).itens
            .map((c) => ({ valor: c.id, rotulo: `${c.numero} – ${c.fornecedor_nome}`, detalhe: c.objeto.slice(0, 80) }))} />
        <MultiBusca rotulo="Fornecedor(es)" itens={estado.fornecedores} aoMudar={(v) => set('fornecedores', v)} chave={['f-fornecedores', orgao?.id]}
          placeholder="Razão social, nome fantasia ou CNPJ/CPF"
          buscar={async (t) => (await buscarFornecedoresOpcoes(orgao!.id, t)).map((f) => ({ valor: f.id, rotulo: f.razao_social || f.nome_fantasia || '',
            detalhe: f.tipo_pessoa === 'PF' ? formatarCpf(f.documento) : formatarCnpj(f.documento) }))} />
        {principais.map(([chave, tipo, nome]) => (
          <MultiBusca key={chave} rotulo={nome} itens={estado.classificadores[chave] ?? []} aoMudar={(v) => setClass(chave, v)}
            chave={['f-class', orgao?.id, tipo]} buscar={classificadorBusca(tipo)} placeholder="Código ou descrição" />
        ))}
      </div>
      <button type="button" className="flex items-center gap-1 self-start text-sm font-medium text-marca-700" onClick={() => setMais((m) => !m)} aria-expanded={mais}>
        {mais ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}Todos os campos da classificação e demais filtros
      </button>
      {mais && (
        <div className="grid gap-4 md:grid-cols-3">
          {outros.map(([chave, tipo, nome]) => (
            <MultiBusca key={chave} rotulo={nome} itens={estado.classificadores[chave] ?? []} aoMudar={(v) => setClass(chave, v)}
              chave={['f-class', orgao?.id, tipo]} buscar={classificadorBusca(tipo)} placeholder="Código ou descrição" />
          ))}
          {completo && <>
            <MultiBusca rotulo="Unidade(s) atendida(s)" itens={estado.unidades} aoMudar={(v) => set('unidades', v)} chave={['f-unidades', orgao?.id]}
              buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao!.id, busca: t, situacao: 'TODOS', limite: 20, offset: 0 })).itens.map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.tipo }))} />
            <Selecao rotulo="Atesto" value={estado.statusAtesto} onChange={(e) => set('statusAtesto', e.target.value)}>
              <option value="">Todos</option><option value="PENDENTE">Pendentes de atesto</option><option value="ATESTADA">Atestadas</option>
            </Selecao>
            <Selecao rotulo="Pagamento" value={estado.statusPagamento} onChange={(e) => set('statusPagamento', e.target.value)}>
              <option value="">Todos</option><option value="PENDENTE">Pendente</option><option value="PARCIAL">Parcial</option><option value="PAGO">Pago</option>
            </Selecao>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4 accent-marca-700" checked={estado.incluirCanceladas}
              onChange={(e) => set('incluirCanceladas', e.target.checked)} />Incluir notas canceladas (histórico)</label>
          </>}
        </div>
      )}
      {temFiltro(estado) && <Botao variante="fantasma" className="self-start" onClick={() => aoMudar(filtrosVazios())}>Limpar todos os filtros</Botao>}
    </div>
  );
}
