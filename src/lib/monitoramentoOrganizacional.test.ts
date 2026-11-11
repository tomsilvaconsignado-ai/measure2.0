import { describe, expect, it } from 'vitest';
import type { UnidadeMonitorada } from '@/services/monitoramento';
import { ancestral, indicadores, intervalo, situacaoAtividade, situacaoCadastral } from './monitoramentoOrganizacional';

const base: UnidadeMonitorada = {
  id: 'x', pai_id: null, tipo: 'COORDENACAO', nome: 'Coordenação', sigla: 'C', ativo: true, nivel: 3,
  servidores: 3, servidores_diretos: 3, com_acesso: 2, sem_cargo: 0, sem_email: 0, acesso_sem_cadastro: 0,
  atividades_total: 0, ultima_atividade: null, atividades_periodo: 0, usuarios_periodo: 0, ultima_no_periodo: null, modulos: {},
};
const un = (p: Partial<UnidadeMonitorada>) => ({ ...base, ...p });
const faixas = { recente: 7, moderada: 30 };
const agora = new Date('2026-11-11T12:00:00');

describe('situação cadastral', () => {
  it('verde com servidores, cinza sem, amarelo com pendência, vermelho inativa', () => {
    expect(situacaoCadastral(un({}))).toBe('COM_SERVIDORES');
    expect(situacaoCadastral(un({ servidores: 0 }))).toBe('SEM_SERVIDORES');
    expect(situacaoCadastral(un({ sem_email: 1 }))).toBe('INCOMPLETA');
    expect(situacaoCadastral(un({ servidores: 0, acesso_sem_cadastro: 2 }))).toBe('INCOMPLETA');
    expect(situacaoCadastral(un({ ativo: false }))).toBe('INATIVA');
  });
});

describe('situação de atividade (pela última atividade, conforme as faixas)', () => {
  it('recente até 7 dias, moderada até 30, depois sem atividade recente; sem registro = sem histórico', () => {
    expect(situacaoAtividade('2026-11-08T10:00:00', faixas, agora)).toBe('RECENTE');
    expect(situacaoAtividade('2026-10-25T10:00:00', faixas, agora)).toBe('MODERADA');
    expect(situacaoAtividade('2026-09-01T10:00:00', faixas, agora)).toBe('SEM_RECENTE');
    expect(situacaoAtividade(null, faixas, agora)).toBe('SEM_HISTORICO');
  });
  it('faixas configuráveis mudam a classificação', () => {
    expect(situacaoAtividade('2026-10-25T10:00:00', { recente: 20, moderada: 60 }, agora)).toBe('RECENTE');
  });
});

describe('períodos', () => {
  it('últimos 7 dias incluem hoje; mês anterior termina no início deste mês', () => {
    const s = intervalo('7', agora);
    expect(new Date(s.de).getDate()).toBe(5);
    expect(new Date(s.ate).getDate()).toBe(12);
    const m = intervalo('mes_anterior', agora);
    expect(new Date(m.de).getMonth()).toBe(9);
    expect(new Date(m.ate).getMonth()).toBe(10);
    expect(new Date(m.ate).getDate()).toBe(1);
  });
  it('personalizado inclui o último dia', () => {
    const p = intervalo('personalizado', agora, { de: '2026-01-10', ate: '2026-01-20' });
    expect(new Date(p.ate).getDate()).toBe(21);
  });
});

describe('hierarquia e indicadores', () => {
  const sec = un({ id: 's', tipo: 'SECRETARIA', servidores: 5 });
  const dir = un({ id: 'd', pai_id: 's', tipo: 'DIRETORIA', servidores: 5, atividades_periodo: 4, ultima_atividade: '2026-11-10T09:00:00' });
  const c1 = un({ id: 'c1', pai_id: 'd', servidores: 5, atividades_periodo: 4, ultima_atividade: '2026-11-10T09:00:00' });
  const c2 = un({ id: 'c2', pai_id: 'd', servidores: 0 });
  const g = un({ id: 'g', pai_id: 'c1', tipo: 'GERENCIA', servidores: 2 });
  const todas = [sec, dir, c1, c2, g];
  it('acha a diretoria de uma gerência', () => {
    expect(ancestral(g, 'DIRETORIA', new Map(todas.map((u) => [u.id, u])))?.id).toBe('d');
  });
  it('cards e utilização refletem só o que foi registrado', () => {
    const i = indicadores(todas, faixas, agora);
    expect(i).toMatchObject({ diretorias: 1, coordenacoes: 2, diretoriasComServidores: 1, coordenacoesComServidores: 1, estruturasSemServidores: 1,
      comAtividadeRecente: 2, servidoresAtivos: 5, estruturasComServidores: 3, estruturasUsando: 2 });
  });
});
