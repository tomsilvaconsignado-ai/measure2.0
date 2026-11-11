import { describe, expect, it } from 'vitest';
import { citacao, compor, declaraPenalidade, extenso, fundamentosDoRegime, medidasPossiveis, textoPrazo, type Fundamento, type Modelo } from './notificacaoFormal';

const F = (codigo: string, regime: string, artigo: string | null, inciso: string | null = null, revisao = false): Fundamento =>
  ({ codigo, regime, norma: regime === 'LEI_8666' ? 'Lei Federal nº 8.666/1993' : regime === 'MUNICIPAL' ? 'Decreto Municipal nº 7.178/2023' : 'Lei Federal nº 14.133/2021', artigo, inciso, texto: 'texto', revisao_pendente: revisao });
const modelos: Modelo[] = [
  { tipo: 'CONSEQUENCIAS', regime: 'LEI_14133', texto: 'NOTIFICADA no {contrato}{clausula_texto}, prazo de {prazo}. Medidas: {medidas}. Arts. 155 e 156.' },
  { tipo: 'MANIFESTACAO', regime: 'LEI_14133', texto: 'Manifestação {prazo_resposta}.' },
  { tipo: 'CONSEQUENCIAS', regime: 'OUTRO', texto: 'Regime a confirmar {contrato}.' },
  { tipo: 'MANIFESTACAO', regime: 'OUTRO', texto: 'Manifestação.' },
];
const base = { contratoNumero: '056/2022', clausula: 'Cláusula Sétima', regime: 'LEI_14133' as const, regimeDoContrato: 'LEI_14133' as const, gravidade: 'MEDIA' as const,
  modelos, prazoDias: 5, prazoTipo: 'UTEIS' as const, prazoRespostaDias: 5, contratacaoDireta: false };

describe('composição do texto', () => {
  it('preenche contrato, cláusula, prazo e medidas, sem pedir revisão quando tudo é seguro', () => {
    const c = compor({ ...base, selecionados: [F('L14133_ART115', 'LEI_14133', 'art. 115'), F('L14133_ART162', 'LEI_14133', 'art. 162')] });
    expect(c.revisao_juridica).toBe(false);
    expect(c.consequencias).toContain('Contrato nº 056/2022, especialmente a Cláusula Sétima');
    expect(c.consequencias).toContain('5 (cinco) dias úteis');
    expect(c.consequencias).toContain('multa de mora');
    expect(c.fundamentacao).toContain('Art. 115, da Lei Federal nº 14.133/2021');
    expect(c.manifestacao).toContain('5 dias úteis');
  });
  it('sem cláusula, sem regime no contrato ou regime incerto: pede revisão (não inventa)', () => {
    expect(compor({ ...base, clausula: '', selecionados: [F('L14133_ART115', 'LEI_14133', 'art. 115')] }).revisao_juridica).toBe(true);
    expect(compor({ ...base, regimeDoContrato: null, selecionados: [F('L14133_ART115', 'LEI_14133', 'art. 115')] }).revisao_juridica).toBe(true);
    const o = compor({ ...base, regime: 'OUTRO', selecionados: [] });
    expect(o.revisao_juridica).toBe(true);
    expect(o.consequencias).toBe('Regime a confirmar Contrato nº 056/2022.');
  });
  it('Decreto 7.177/2023 só entra em contratação direta', () => {
    const sel = [F('L14133_ART115', 'LEI_14133', 'art. 115'), { ...F('MUN_DEC_7177_2023', 'MUNICIPAL', null, null, true), norma: 'Decreto Municipal nº 7.177/2023' }];
    expect(compor({ ...base, selecionados: sel }).fundamentacao).not.toContain('7.177');
    expect(compor({ ...base, contratacaoDireta: true, selecionados: sel }).fundamentacao).toContain('7.177');
  });
  it('extinção só aparece como possibilidade em ocorrência grave com fundamento próprio', () => {
    expect(medidasPossiveis(['L14133_ART137'], 'MEDIA', 'LEI_14133').join()).not.toContain('extinção');
    expect(medidasPossiveis(['L14133_ART137'], 'GRAVE', 'LEI_14133').join()).toContain('extinção');
  });
});

describe('apoio', () => {
  it('prazo de regularização não se confunde com prazo de defesa', () => {
    const t = textoPrazo(10, 'CORRIDOS', null);
    expect(t).toContain('10 (dez) dias corridos');
    expect(t).toContain('não se confunde com o prazo de defesa');
  });
  it('números por extenso', () => {
    expect(extenso(15)).toBe('quinze');
    expect(extenso(30)).toBe('trinta');
    expect(extenso(45)).toBe('quarenta e cinco');
    expect(extenso(120)).toBe('cento e vinte');
  });
  it('citação com inciso e parágrafo', () => {
    expect(citacao(F('X', 'LEI_14133', 'art. 155', 'VII'))).toBe('Art. 155, inciso VII, da Lei Federal nº 14.133/2021');
    expect(citacao(F('X', 'LEI_14133', 'art. 117', '§ 1º'))).toBe('Art. 117, § 1º, da Lei Federal nº 14.133/2021');
  });
  it('regime filtra os fundamentos', () => {
    const todos = [F('A', 'LEI_14133', 'art. 1'), F('B', 'LEI_8666', 'art. 2'), F('C', 'MUNICIPAL', null)];
    expect(fundamentosDoRegime(todos, 'LEI_8666').map((f) => f.codigo)).toEqual(['B']);
    expect(fundamentosDoRegime(todos, 'LEI_14133').map((f) => f.codigo)).toEqual(['A', 'C']);
  });
  it('detecta texto que declara a empresa já penalizada', () => {
    expect(declaraPenalidade('Fica a empresa multada em 10%')).toBe(true);
    expect(declaraPenalidade('Esta notificação não constitui aplicação de penalidade.')).toBe(false);
  });
});
