import { describe, expect, it } from 'vitest';
import { agruparCustos, descreverPeriodo, type LinhaCusto } from './custosUnidades';

const l = (p: Partial<LinhaCusto>): LinhaCusto => ({
  ano: 2026, mes: 1, unidade_chave: 'u1', unidade_nome: 'USF Um', unidade_tipo: 'USF', unidade_grupo: false,
  fornecedor_id: 'f1', fornecedor_nome: 'Empresa A', fornecedor_documento: '1', fornecedor_tipo: 'PJ',
  contrato_id: 'c1', contrato_numero: '001/2026', contrato_objeto: 'Limpeza', nota_id: 'n1', nota_numero: '1', data_emissao: '2026-01-10',
  forma: 'UNICA', valor: '100.10', pago: '50.05', ...p,
});

describe('agruparCustos', () => {
  const r = agruparCustos([
    l({}),
    l({ mes: 2, nota_id: 'n2', valor: '0.20', pago: 0 }),
    l({ unidade_chave: 'u2', unidade_nome: 'CAPS Dois', fornecedor_id: 'f2', fornecedor_nome: 'Empresa B', contrato_id: 'c2', nota_id: 'n3', valor: '33.33', forma: 'DIVIDIDA' }),
    l({ unidade_chave: 'SEM_UNIDADE', unidade_nome: 'Sem unidade informada', unidade_tipo: null, nota_id: 'n4', valor: 5, forma: 'SEM_UNIDADE' }),
  ]);

  it('soma em centavos, sem erro de arredondamento', () => {
    expect(r.total).toBe(10010 + 20 + 3333 + 500);
    expect(r.porMes[1]).toBe(10010 + 3333 + 500);
    expect(r.meses).toEqual([1, 2]);
    expect(r.notas).toBe(4);
  });

  it('agrupa por unidade e por empresa/contrato, com os meses', () => {
    const u1 = r.unidades.find((u) => u.chave === 'u1')!;
    expect(u1.total).toBe(10030);
    expect(u1.itens).toHaveLength(1);
    expect(u1.itens[0]!.meses).toEqual({ 1: 10010, 2: 20 });
    expect(u1.itens[0]!.notas).toBe(2);
  });

  it('sem unidade fica por último e as formas de alocação são contadas', () => {
    expect(r.unidades.at(-1)!.chave).toBe('SEM_UNIDADE');
    expect(r.alertas.DIVIDIDA).toBe(3333);
    expect(r.alertas.SEM_UNIDADE).toBe(500);
  });

  it('empresas em ordem de valor, com as unidades atendidas', () => {
    expect(r.empresas[0]!.nome).toBe('Empresa A');
    expect(r.empresas[0]!.unidades.map((u) => u.nome)).toEqual(['USF Um', 'Sem unidade informada']);
  });
});

describe('descreverPeriodo', () => {
  it('um mês ou intervalo', () => {
    expect(descreverPeriodo(2026, 10, 10)).toBe('outubro de 2026');
    expect(descreverPeriodo(2026, 1, 3)).toBe('janeiro a março de 2026');
  });
});
