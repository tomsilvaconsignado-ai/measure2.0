import { describe, expect, it } from 'vitest';
import { itensDeLinhas, linhasDeItens } from './checklist';
import { inteiroPorExtenso, locaisDoAtesto, mesesDeReferencia, montarAtesto, siglaDaUnidade, textoDecretoRenovacao, textoEncaminhamentoAtesto, valorPorExtenso } from './atesto';

describe('unidades rateadas no atesto', () => {
  const usf = (nome: string, valor: number | null = 100) => ({ nome, tipo: 'USF', sigla: null, valor });
  it('sigla cadastrada vem primeiro; sem sigla, o tipo; sem tipo útil, o nome', () => {
    expect(siglaDaUnidade({ nome: 'Unidade de Saúde Centro', sigla: 'USF-C', tipo: 'USF' })).toBe('USF-C');
    expect(siglaDaUnidade({ nome: 'CAPS III Liberdade', sigla: '', tipo: 'CAPS' })).toBe('CAPS');
    expect(siglaDaUnidade({ nome: 'Hospital Fernando Franco', tipo: 'Outra' })).toBe('Hospital Fernando Franco');
    expect(siglaDaUnidade({ nome: 'Galpão', tipo: 'UNIDADE' })).toBe('Galpão');
  });
  it('rateio: só as siglas, sem repetir', () => {
    expect(locaisDoAtesto([usf('USF Augusto Franco'), usf('USF Bairro América'), { nome: 'CAPS David Capistrano', tipo: 'CAPS', valor: '50.00' }]))
      .toEqual(['USF', 'CAPS']);
  });
  it('sem rateio: os nomes continuam como antes', () => {
    expect(locaisDoAtesto([usf('USF Augusto Franco', null), usf('USF Bairro América', null)])).toEqual(['USF Augusto Franco', 'USF Bairro América']);
  });
  it('o valor do atesto não muda, só o local', () => {
    const modelo = 'NF {NUMERO_NOTA}, {VALOR_NOTA}, na {LOCAL_SERVIÇO}.';
    const base = { objeto: 'x', contrato: '1', fornecedor: 'y', nota: '10', valorCentavos: 1250075, meses: [] };
    const t = montarAtesto(modelo, '', { ...base, locais: locaisDoAtesto([usf('USF A', 6250037), usf('USF B', 6250038), { nome: 'CAPS AD', tipo: 'CAPS', valor: 1 }]) });
    expect(t).toBe('NF 10, R$ 12.500,75, na USF e CAPS.');
  });
});

describe('valor por extenso', () => {
  it.each([
    [100, 'um real'], [1, 'um centavo'], [50, 'cinquenta centavos'], [0, 'zero real'],
    [150000, 'mil e quinhentos reais'], [123456, 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [10000, 'cem reais'], [10100, 'cento e um reais'], [110000, 'mil e cem reais'], [105000, 'mil e cinquenta reais'],
    [200000000, 'dois milhões de reais'], [100000000, 'um milhão de reais'],
    [215000000, 'dois milhões cento e cinquenta mil reais'], [100000050, 'um milhão de reais e cinquenta centavos'],
    [2000000099, 'vinte milhões de reais e noventa e nove centavos'], [1914, 'dezenove reais e quatorze centavos'],
    [1100000000, 'onze milhões de reais'], [100100000, 'um milhão e mil reais'], [5000000000, 'cinquenta milhões de reais'],
  ])('%i centavos → %s', (c, t) => expect(valorPorExtenso(c)).toBe(t));
  it('inteiros', () => {
    expect(inteiroPorExtenso(999999)).toBe('novecentos e noventa e nove mil novecentos e noventa e nove');
    expect(inteiroPorExtenso(1000001)).toBe('um milhão e um');
    expect(inteiroPorExtenso(2000000000)).toBe('dois bilhões');
  });
});

describe('meses de referência', () => {
  it('agrupa por ano', () => {
    expect(mesesDeReferencia([{ ano: 2026, mes: 10 }])).toBe('outubro de 2026');
    expect(mesesDeReferencia([{ ano: 2026, mes: 10 }, { ano: 2026, mes: 9 }])).toBe('setembro e outubro de 2026');
    expect(mesesDeReferencia([{ ano: 2026, mes: 1 }, { ano: 2025, mes: 12 }, { ano: 2025, mes: 11 }])).toBe('novembro e dezembro de 2025 e janeiro de 2026');
  });
});

describe('modelo do órgão (SMS Aracaju)', () => {
  const modelo = 'Estimado Gerente,\nApós análise da documentação encaminhada para atesto, nota fiscal nº {NUMERO_NOTA}, {VALOR_NOTA} ({VALOR_POR_EXTENSO}), do contrato nº {NUMERO_CONTRATO} da {NOME EMPRESA}. Vigência de {DATA_INICIO} a {DATA_FIM}. Referente ao serviço de {OBJETO_CONTRATO} na {LOCAL_SERVIÇO}. Referente a {MES_REFERENCIA}.';
  it('preenche todas as variáveis com dados do contrato e da nota', () => {
    const t = montarAtesto(modelo, '', {
      objeto: 'Manutenção predial preventiva e corretiva', contrato: '1889/2026', fornecedor: 'SOLLO EMPREENDIMENTOS LTDA', nota: '10230', valorCentavos: 1250075,
      meses: [{ ano: 2026, mes: 10 }], vigenciaInicio: '2026-01-15', vigenciaFim: '2027-01-14', locais: ['UBS Centro', 'USF Industrial'],
    });
    expect(t).toBe('Estimado Gerente,\nApós análise da documentação encaminhada para atesto, nota fiscal nº 10230, R$ 12.500,75 (doze mil e quinhentos reais e setenta e cinco centavos), do contrato nº 1889/2026 da SOLLO EMPREENDIMENTOS LTDA. Vigência de 15/01/2026 a 14/01/2027. Referente ao serviço de manutenção predial preventiva e corretiva na UBS Centro e USF Industrial. Referente a outubro de 2026.');
  });
  it('dado ainda não informado vira lacuna para preencher', () => {
    const t = montarAtesto('NF {NUMERO_NOTA} em {LOCAL_SERVICO} ({MES_REFERENCIA})', '', { objeto: 'x', contrato: '1', fornecedor: 'y', nota: '', valorCentavos: 0, meses: [] });
    expect(t).toBe('NF ________ em ________ (________)');
  });
  it('variável desconhecida fica como está', () => {
    expect(montarAtesto('{QUALQUER}', '', { objeto: 'x', contrato: '1', fornecedor: 'y', nota: '1', valorCentavos: 1, meses: [] })).toBe('{QUALQUER}');
  });
});

describe('textos copiáveis da nota', () => {
  it('encaminhamento do atesto com o número da nota e parágrafos', () => {
    expect(textoEncaminhamentoAtesto('5501-A')).toBe('Prezados,\n\nAtesto, nota fiscal n° 5501-A e toda documentação exigida no contrato, as quais estão devidamente conferidas.\n\nSegue para análise, providências e posterior encaminhamento ao setor financeiro.');
  });
  it('decreto em renovação com o número do decreto e o processo do contrato', () => {
    expect(textoDecretoRenovacao('7.123/2026', ' 2026.01.000123 ')).toBe('Prezados,\n\nDocumentação referente ao Decreto nº 7.123/2026 encontra-se no processo de renovação através do processo nº 2026.01.000123.');
  });
  it('dado que falta vira lacuna para preencher, nunca "undefined"', () => {
    const t = textoDecretoRenovacao(null, '');
    expect(t).toContain('Decreto nº ________ encontra-se');
    expect(t).toContain('processo nº ________.');
    expect(t).not.toMatch(/undefined|null|\{/);
  });
});

describe('checklist da nota', () => {
  it('lê os itens das Configurações com a marcação inicial', () => {
    expect(itensDeLinhas(['[X] NOTA FISCAL', 'NOTA DE EMPENHO', '  ', '[ ] FOLHA DE PONTO'])).toEqual([
      { descricao: 'NOTA FISCAL', marca: 'SIM' }, { descricao: 'NOTA DE EMPENHO', marca: null }, { descricao: 'FOLHA DE PONTO', marca: null },
    ]);
    expect(linhasDeItens([{ descricao: 'NOTA FISCAL', marca: 'SIM' }, { descricao: 'GPS', marca: null }])).toEqual(['[X] NOTA FISCAL', 'GPS']);
  });
});
