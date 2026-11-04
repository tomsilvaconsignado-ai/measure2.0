import { describe, expect, it } from 'vitest';
import { brl, centavos, decimalDeCentavos } from './formatacao';
import { montarAtesto } from './atesto';

describe('dinheiro entre banco e tela', () => {
  it('numeric do banco vira centavos inteiros', () => {
    expect(centavos('1234.56')).toBe(123456);
    expect(centavos(0.1 + 0.2)).toBe(30);
    expect(centavos(null)).toBe(0);
  });
  it('centavos voltam como decimal exato para o banco', () => {
    expect(decimalDeCentavos(123456)).toBe('1234.56');
    expect(decimalDeCentavos(5)).toBe('0.05');
    expect(decimalDeCentavos(-2500)).toBe('-25.00');
  });
  it('exibição direta do valor do banco', () => {
    expect(brl('98700.00')).toBe('R$ 98.700,00');
  });
});

describe('texto de atesto', () => {
  it('preenche as variáveis do modelo e ordena os meses', () => {
    const t = montarAtesto('Atesto o objeto "{objeto}" do Contrato nº {contrato} ({fornecedor}), NF {nota} de {valor}, ref. {meses}{periodo}, Proc. {processo}. {decreto}', 'Decreto 123/2025.', {
      objeto: 'Manutenção predial', contrato: '001/2026', fornecedor: 'Beta Ltda', nota: '5501', valorCentavos: 120000,
      meses: [{ ano: 2026, mes: 10 }, { ano: 2026, mes: 9 }], periodoInicio: '2026-09-01', periodoFim: '2026-10-31', processo: '123.456/2026',
    });
    expect(t).toBe('Atesto o objeto "Manutenção predial" do Contrato nº 001/2026 (Beta Ltda), NF 5501 de R$ 1.200,00, ref. setembro/2026, outubro/2026 (período de 01/09/2026 a 31/10/2026), Proc. 123.456/2026. Decreto 123/2025.');
  });
});
