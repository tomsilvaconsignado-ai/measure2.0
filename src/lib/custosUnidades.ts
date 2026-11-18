// Agrupamento do relatório de custos por unidade de saúde (valores em centavos, sem erro de arredondamento).
// As linhas vêm do banco já distribuídas por mês de competência e por unidade (relatorio_custos_unidades).

export type FormaAlocacao = 'RATEIO' | 'UNICA' | 'DIVIDIDA' | 'GRUPO' | 'LOCAL_ANTERIOR' | 'SEM_UNIDADE';

export interface LinhaCusto {
  ano: number; mes: number; unidade_chave: string; unidade_nome: string; unidade_tipo: string | null; unidade_grupo: boolean;
  fornecedor_id: string; fornecedor_nome: string; fornecedor_documento: string; fornecedor_tipo: string;
  contrato_id: string; contrato_numero: string; contrato_objeto: string;
  contrato_inicio?: string | null; contrato_fim?: string | null; contrato_valor?: number | string | null; contrato_saldo?: number | string | null; contrato_unidade?: string | null;
  nota_id: string; nota_numero: string; data_emissao: string; forma: FormaAlocacao; valor: number | string; pago: number | string;
  nota_referencias?: string | null; nota_local?: string | null; nota_valor?: number | string | null; status_pagamento?: string | null;
}

/** Bloco por empresa/contrato (formato do relatório mensal usado pela coordenação) */
export interface GrupoContrato {
  chave: string; fornecedor_nome: string; fornecedor_documento: string; fornecedor_tipo: string;
  contrato_numero: string; contrato_objeto: string; inicio: string | null; fim: string | null; valor: number; saldo: number; unidade: string | null;
  total: number; pago: number;
  /** unidades em ordem alfabética (as USFs ficam juntas, uma abaixo da outra), com o valor de cada mês */
  unidades: Array<{ nome: string; tipo: string | null; total: number; notas: number; meses: Record<number, number>; notasMeses: Record<number, number> }>;
  /** notas em ordem de mês de referência; cada uma com as unidades atendidas (uma por linha, com o valor) */
  notas: NotaContrato[];
  /** notas agrupadas por mês de referência, com o subtotal (linha de separação entre os meses) */
  porMesReferencia: Array<{ chave: number; ano: number; mes: number; total: number; notas: NotaContrato[] }>;
}
export interface NotaContrato {
  id: string; numero: string; data: string; referencias: string; local: string; valor: number; nota_valor: number; status: string;
  /** mês de referência que agrupa a nota (ano × 100 + mês) */
  mes_ref: number;
  unidades: Array<{ nome: string; valor: number }>;
}

const ordemNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' });

export const FORMAS: Record<FormaAlocacao, string> = {
  RATEIO: 'Rateio informado na nota',
  UNICA: 'Unidade única da nota',
  DIVIDIDA: 'Dividido igualmente entre as unidades da nota',
  GRUPO: 'Lançado no grupo (unidades não informadas)',
  LOCAL_ANTERIOR: 'Local registrado no sistema anterior',
  SEM_UNIDADE: 'Nota sem unidade informada',
};

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const c = (v: number | string) => Math.round(Number(v ?? 0) * 100);

export interface ItemCusto {
  chave: string; fornecedor_nome: string; fornecedor_documento: string; fornecedor_tipo: string;
  contrato_numero: string; contrato_objeto: string;
  /** centavos por mês (1–12) */
  meses: Record<number, number>; total: number; pago: number; notas: number; formas: FormaAlocacao[];
}
export interface GrupoUnidade {
  chave: string; nome: string; tipo: string | null; grupo: boolean; especial: boolean;
  meses: Record<number, number>; total: number; pago: number; itens: ItemCusto[]; empresas: number;
}
export interface GrupoEmpresa {
  chave: string; nome: string; documento: string; tipo: string; meses: Record<number, number>; total: number; pago: number;
  unidades: Array<{ nome: string; total: number }>; contratos: string[]; notas: number;
}
export interface ResumoCustos {
  meses: number[]; total: number; pago: number; notas: number; unidades: GrupoUnidade[]; empresas: GrupoEmpresa[]; contratos: GrupoContrato[];
  porMes: Record<number, number>; alertas: Record<FormaAlocacao, number>;
}

const soma = (m: Record<number, number>, mes: number, v: number) => { m[mes] = (m[mes] ?? 0) + v; };

export function agruparCustos(linhas: LinhaCusto[]): ResumoCustos {
  const unidades = new Map<string, GrupoUnidade & { itensMap: Map<string, ItemCusto & { notasSet: Set<string> }> }>();
  const empresas = new Map<string, GrupoEmpresa & { unidadesMap: Map<string, number>; contratosSet: Set<string>; notasSet: Set<string> }>();
  type Ct = Omit<GrupoContrato, 'unidades' | 'notas' | 'porMesReferencia'> & {
    unidadesMap: Map<string, { nome: string; tipo: string | null; total: number; notas: Set<string>; meses: Record<number, number>; notasMeses: Map<number, Set<string>> }>;
    notasMap: Map<string, Omit<NotaContrato, 'unidades'> & { unidadesMap: Map<string, { nome: string; valor: number }> }>;
  };
  const contratos = new Map<string, Ct>();
  const porMes: Record<number, number> = {};
  const meses = new Set<number>();
  const notas = new Set<string>();
  const alertas = { RATEIO: 0, UNICA: 0, DIVIDIDA: 0, GRUPO: 0, LOCAL_ANTERIOR: 0, SEM_UNIDADE: 0 } as Record<FormaAlocacao, number>;
  let total = 0; let pago = 0;

  for (const l of linhas) {
    const v = c(l.valor); const p = c(l.pago);
    total += v; pago += p; meses.add(l.mes); notas.add(l.nota_id); soma(porMes, l.mes, v);
    alertas[l.forma] += v;

    let u = unidades.get(l.unidade_chave);
    if (!u) {
      u = { chave: l.unidade_chave, nome: l.unidade_nome, tipo: l.unidade_tipo, grupo: l.unidade_grupo,
        especial: l.forma === 'SEM_UNIDADE' || l.forma === 'LOCAL_ANTERIOR', meses: {}, total: 0, pago: 0, itens: [], empresas: 0, itensMap: new Map() };
      unidades.set(l.unidade_chave, u);
    }
    u.total += v; u.pago += p; soma(u.meses, l.mes, v);
    const ki = `${l.fornecedor_id}|${l.contrato_id}`;
    let it = u.itensMap.get(ki);
    if (!it) {
      it = { chave: ki, fornecedor_nome: l.fornecedor_nome, fornecedor_documento: l.fornecedor_documento, fornecedor_tipo: l.fornecedor_tipo,
        contrato_numero: l.contrato_numero, contrato_objeto: l.contrato_objeto, meses: {}, total: 0, pago: 0, notas: 0, formas: [], notasSet: new Set() };
      u.itensMap.set(ki, it);
    }
    it.total += v; it.pago += p; soma(it.meses, l.mes, v); it.notasSet.add(l.nota_id);
    if (!it.formas.includes(l.forma)) it.formas.push(l.forma);

    let e = empresas.get(l.fornecedor_id);
    if (!e) {
      e = { chave: l.fornecedor_id, nome: l.fornecedor_nome, documento: l.fornecedor_documento, tipo: l.fornecedor_tipo, meses: {}, total: 0, pago: 0,
        unidades: [], contratos: [], notas: 0, unidadesMap: new Map(), contratosSet: new Set(), notasSet: new Set() };
      empresas.set(l.fornecedor_id, e);
    }
    e.total += v; e.pago += p; soma(e.meses, l.mes, v);
    e.unidadesMap.set(l.unidade_nome, (e.unidadesMap.get(l.unidade_nome) ?? 0) + v);
    e.contratosSet.add(l.contrato_numero); e.notasSet.add(l.nota_id);

    let k = contratos.get(l.contrato_id);
    if (!k) {
      k = { chave: l.contrato_id, fornecedor_nome: l.fornecedor_nome, fornecedor_documento: l.fornecedor_documento, fornecedor_tipo: l.fornecedor_tipo,
        contrato_numero: l.contrato_numero, contrato_objeto: l.contrato_objeto, inicio: l.contrato_inicio ?? null, fim: l.contrato_fim ?? null,
        valor: c(l.contrato_valor ?? 0), saldo: c(l.contrato_saldo ?? 0), unidade: l.contrato_unidade ?? null, total: 0, pago: 0,
        unidadesMap: new Map(), notasMap: new Map() };
      contratos.set(l.contrato_id, k);
    }
    k.total += v; k.pago += p;
    const ku = k.unidadesMap.get(l.unidade_chave) ?? { nome: l.unidade_nome, tipo: l.unidade_tipo, total: 0, notas: new Set<string>(), meses: {}, notasMeses: new Map() };
    ku.total += v; ku.notas.add(l.nota_id); soma(ku.meses, l.mes, v);
    ku.notasMeses.set(l.mes, (ku.notasMeses.get(l.mes) ?? new Set<string>()).add(l.nota_id)); k.unidadesMap.set(l.unidade_chave, ku);
    const kn = k.notasMap.get(l.nota_id) ?? { id: l.nota_id, numero: l.nota_numero, data: l.data_emissao, referencias: l.nota_referencias ?? '',
      local: l.nota_local ?? l.unidade_nome, valor: 0, nota_valor: c(l.nota_valor ?? l.valor), status: l.status_pagamento ?? '',
      mes_ref: l.ano * 100 + l.mes, unidadesMap: new Map() };
    kn.valor += v; kn.mes_ref = Math.min(kn.mes_ref, l.ano * 100 + l.mes);
    const kun = kn.unidadesMap.get(l.unidade_chave) ?? { nome: l.unidade_nome, valor: 0 };
    kun.valor += v; kn.unidadesMap.set(l.unidade_chave, kun);
    k.notasMap.set(l.nota_id, kn);
  }

  const listaUnidades: GrupoUnidade[] = [...unidades.values()].map(({ itensMap, ...u }) => {
    const itens = [...itensMap.values()].map(({ notasSet, ...i }) => ({ ...i, notas: notasSet.size }))
      .sort((a, b) => b.total - a.total || a.fornecedor_nome.localeCompare(b.fornecedor_nome, 'pt-BR'));
    return { ...u, itens, empresas: new Set(itens.map((i) => i.fornecedor_nome)).size };
  }).sort((a, b) => Number(a.especial) - Number(b.especial) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const listaEmpresas: GrupoEmpresa[] = [...empresas.values()].map(({ unidadesMap, contratosSet, notasSet, ...e }) => ({
    ...e, notas: notasSet.size, unidades: [...unidadesMap.entries()].map(([nome, t]) => ({ nome, total: t })).sort((a, b) => b.total - a.total),
    contratos: [...contratosSet].sort(),
  })).sort((a, b) => b.total - a.total);

  const listaContratos: GrupoContrato[] = [...contratos.values()].map(({ unidadesMap, notasMap, ...k }) => {
    const notasK: NotaContrato[] = [...notasMap.values()].map(({ unidadesMap: um, ...n }) => ({ ...n, unidades: [...um.values()].sort(ordemNome) }))
      .sort((a, b) => a.mes_ref - b.mes_ref || a.data.localeCompare(b.data) || a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
    const grupos = new Map<number, GrupoContrato['porMesReferencia'][number]>();
    for (const n of notasK) {
      const g = grupos.get(n.mes_ref) ?? { chave: n.mes_ref, ano: Math.floor(n.mes_ref / 100), mes: n.mes_ref % 100, total: 0, notas: [] };
      g.total += n.valor; g.notas.push(n); grupos.set(n.mes_ref, g);
    }
    return {
      ...k,
      unidades: [...unidadesMap.values()].map((u) => ({ nome: u.nome, tipo: u.tipo, total: u.total, notas: u.notas.size, meses: u.meses,
        notasMeses: Object.fromEntries([...u.notasMeses].map(([m, ns]) => [m, ns.size])) })).sort(ordemNome),
      notas: notasK,
      porMesReferencia: [...grupos.values()],
    };
  }).sort((a, b) => a.fornecedor_nome.localeCompare(b.fornecedor_nome, 'pt-BR') || a.contrato_numero.localeCompare(b.contrato_numero));

  return { meses: [...meses].sort((a, b) => a - b), total, pago, notas: notas.size, unidades: listaUnidades, empresas: listaEmpresas, contratos: listaContratos, porMes, alertas };
}

/** "janeiro a março de 2026", "outubro de 2026" */
export function descreverPeriodo(ano: number, ini: number, fim: number) {
  return ini === fim ? `${MESES_LONGOS[ini - 1]} de ${ano}` : `${MESES_LONGOS[ini - 1]} a ${MESES_LONGOS[fim - 1]} de ${ano}`;
}

export const SITUACAO_PAGAMENTO: Record<string, string> = { PAGO: 'Pago', PARCIAL: 'Parcial', PENDENTE: 'Pendente', CANCELADA: 'Cancelada' };

/** 'JANEIRO/2026' */
export const mesReferencia = (ano: number, mes: number) => `${(MESES_LONGOS[mes - 1] ?? '').toUpperCase()}/${ano}`;
