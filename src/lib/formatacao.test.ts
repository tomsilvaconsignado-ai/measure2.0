import { describe, expect, it } from 'vitest';
import {
  centavosDeTexto, cnpjValido, cpfValido, formatarCentavos, formatarCnpj, formatarCpf, formatarData, mascaraMoeda,
} from './formatacao';
import { traduzirErro } from './erros';

describe('moeda', () => {
  it('formata centavos no padrão brasileiro', () => {
    expect(formatarCentavos(123456)).toBe('R$ 1.234,56');
    expect(formatarCentavos(0)).toBe('R$ 0,00');
    expect(formatarCentavos(null)).toBe('R$ 0,00');
    expect(formatarCentavos(100000000)).toBe('R$ 1.000.000,00');
    expect(formatarCentavos(-550)).toBe('-R$ 5,50');
  });
  it('lê texto em centavos sem ponto flutuante', () => {
    expect(centavosDeTexto('R$ 1.234,56')).toBe(123456);
    expect(centavosDeTexto('0,1')).toBe(10);
    expect(centavosDeTexto('1.234')).toBe(123400);
    expect(centavosDeTexto('')).toBeNull();
    // 0,1 + 0,2 em float daria 0,30000000000000004
    expect((centavosDeTexto('0,10')! + centavosDeTexto('0,20')!)).toBe(30);
  });
  it('máscara de digitação empurra da direita', () => {
    expect(mascaraMoeda('1')).toEqual({ texto: 'R$ 0,01', centavos: 1 });
    expect(mascaraMoeda('123456')).toEqual({ texto: 'R$ 1.234,56', centavos: 123456 });
    expect(mascaraMoeda('R$ 0,00').centavos).toBe(0);
  });
});

describe('documentos', () => {
  it('CNPJ', () => {
    expect(formatarCnpj('13128780000100')).toBe('13.128.780/0001-00');
    expect(cnpjValido('13.128.780/0001-00')).toBe(true);
    expect(cnpjValido('13.128.780/0001-01')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });
  it('CPF', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
  });
  it('data de calendário não muda de dia pelo fuso', () => {
    expect(formatarData('2026-01-01')).toBe('01/01/2026');
  });
});

describe('erros', () => {
  it('traduz violação de unicidade conhecida com o campo', () => {
    expect(traduzirErro({ code: '23505', message: 'duplicate key value violates unique constraint "tenants_cnpj_key"' }))
      .toEqual({ mensagem: 'Já existe um órgão cadastrado com esse CNPJ.', campo: 'cnpj' });
  });
  it('duplicidade apontada pelas nossas funções mantém a mensagem clara do banco', () => {
    expect(traduzirErro({ code: '23505', message: 'Esta dotação já está no contrato.', hint: 'acao_id' }))
      .toEqual({ mensagem: 'Esta dotação já está no contrato.', campo: 'acao_id' });
    expect(traduzirErro({ code: '23505', message: 'duplicate key value violates unique constraint "x_unico"' }).mensagem).toMatch(/já existe/);
  });
  it('mantém mensagem das funções do banco e usa o hint como campo', () => {
    expect(traduzirErro({ code: '23514', message: 'Informe o motivo (mínimo de 5 caracteres).', hint: 'justificativa' }))
      .toEqual({ mensagem: 'Informe o motivo (mínimo de 5 caracteres).', campo: 'justificativa' });
  });
  it('não mostra códigos genéricos de RLS', () => {
    expect(traduzirErro({ code: '42501', message: 'new row violates row-level security policy for table "x"' }).mensagem)
      .toMatch(/não tem permissão/);
  });
  it('erros de login em português', () => {
    expect(traduzirErro({ message: 'Invalid login credentials' }).mensagem).toBe('E-mail ou senha incorretos.');
  });
  it('resposta da função de convites', () => {
    expect(traduzirErro({ erro: 'O órgão só aceita e-mails institucionais.', campo: 'email' }))
      .toEqual({ mensagem: 'O órgão só aceita e-mails institucionais.', campo: 'email' });
  });
});
