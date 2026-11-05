import { describe, expect, it } from 'vitest';
import { observacaoFrequencia } from './frequencia';

const base = { nomeacao: null, exoneracao: null, ano: 2026, mes: 3, atrasos: null, faltas: null, justificativa: false, manual: null };

describe('observação do consolidado mensal', () => {
  it('sem ocorrência: frequência integral', () => expect(observacaoFrequencia(base)).toBe('Frequência integral.'));
  it('ocorrência sem justificativa fica em branco', () => expect(observacaoFrequencia({ ...base, faltas: 1 })).toBe(''));
  it('justificativa anexada', () => expect(observacaoFrequencia({ ...base, atrasos: 2, justificativa: true })).toBe('Justificativa anexada.'));
  it('nomeação e exoneração no mês, com as datas', () =>
    expect(observacaoFrequencia({ ...base, nomeacao: '2026-03-02', exoneracao: '2026-03-28' })).toBe('Nomeação em 02/03/2026. Exoneração em 28/03/2026.'));
  it('nomeação de outro mês não aparece', () => expect(observacaoFrequencia({ ...base, nomeacao: '2025-03-02' })).toBe('Frequência integral.'));
  it('texto manual prevalece', () => expect(observacaoFrequencia({ ...base, nomeacao: '2026-03-02', manual: ' Férias. ' })).toBe('Férias.'));
});
