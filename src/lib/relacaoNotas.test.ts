// Período da relação de notas: do primeiro dia do mês inicial ao último dia do mês final.
import { describe, expect, it } from 'vitest';
import { periodoDe } from './relacaoNotas';

describe('periodoDe', () => {
  it('maio a junho', () => expect(periodoDe(2026, 5, 6)).toEqual({ inicio: '2026-05-01', fim: '2026-06-30' }));
  it('fevereiro de ano bissexto termina no dia 29', () => expect(periodoDe(2024, 2, 2)).toEqual({ inicio: '2024-02-01', fim: '2024-02-29' }));
  it('fevereiro comum termina no dia 28', () => expect(periodoDe(2026, 2, 2).fim).toBe('2026-02-28'));
  it('ano inteiro', () => expect(periodoDe(2026, 1, 12)).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' }));
});
