// Regras do monitoramento organizacional (puras, testáveis): período, situação cadastral, situação de
// atividade, hierarquia e indicadores. Os números vêm do banco; aqui só se classifica e se soma.
import type { Faixas, UnidadeMonitorada } from '@/services/monitoramento';

export type Periodo = 'hoje' | '7' | '15' | '30' | '90' | 'mes' | 'mes_anterior' | 'ano' | 'personalizado';
export const PERIODOS: Array<{ id: Periodo; rotulo: string }> = [
  { id: 'hoje', rotulo: 'Hoje' }, { id: '7', rotulo: 'Últimos 7 dias' }, { id: '15', rotulo: 'Últimos 15 dias' },
  { id: '30', rotulo: 'Últimos 30 dias' }, { id: '90', rotulo: 'Últimos 90 dias' }, { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_anterior', rotulo: 'Mês anterior' }, { id: 'ano', rotulo: 'Ano atual' }, { id: 'personalizado', rotulo: 'Período personalizado' },
];

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Intervalo [de, ate) em horário local, convertido para ISO */
export function intervalo(p: Periodo, agora = new Date(), personalizado?: { de: string; ate: string }) {
  const hoje = inicioDoDia(agora), amanha = somarDias(hoje, 1);
  let de: Date, ate: Date = amanha;
  switch (p) {
    case 'hoje': de = hoje; break;
    case '7': case '15': case '30': case '90': de = somarDias(hoje, -(Number(p) - 1)); break;
    case 'mes': de = new Date(hoje.getFullYear(), hoje.getMonth(), 1); break;
    case 'mes_anterior': de = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); ate = new Date(hoje.getFullYear(), hoje.getMonth(), 1); break;
    case 'ano': de = new Date(hoje.getFullYear(), 0, 1); break;
    case 'personalizado': {
      const [a, b] = [personalizado?.de, personalizado?.ate];
      de = a ? new Date(`${a}T00:00:00`) : somarDias(hoje, -29);
      ate = b ? somarDias(new Date(`${b}T00:00:00`), 1) : amanha;
      if (ate <= de) ate = somarDias(de, 1);
    }
  }
  return { de: de.toISOString(), ate: ate.toISOString() };
}

export type SituacaoCadastral = 'COM_SERVIDORES' | 'SEM_SERVIDORES' | 'INCOMPLETA' | 'INATIVA';
export type SituacaoAtividade = 'RECENTE' | 'MODERADA' | 'SEM_RECENTE' | 'SEM_HISTORICO';

export const CADASTRAL: Record<SituacaoCadastral, { rotulo: string; tom: 'verde' | 'cinza' | 'amarelo' | 'vermelho' }> = {
  COM_SERVIDORES: { rotulo: 'Com servidores', tom: 'verde' },
  SEM_SERVIDORES: { rotulo: 'Sem servidores', tom: 'cinza' },
  INCOMPLETA: { rotulo: 'Cadastro incompleto', tom: 'amarelo' },
  INATIVA: { rotulo: 'Inativa', tom: 'vermelho' },
};
export const ATIVIDADE: Record<SituacaoAtividade, { rotulo: string; tom: 'verde' | 'azul' | 'amarelo' | 'cinza' }> = {
  RECENTE: { rotulo: 'Atividade recente', tom: 'verde' },
  MODERADA: { rotulo: 'Atividade moderada', tom: 'azul' },
  SEM_RECENTE: { rotulo: 'Sem atividade recente', tom: 'amarelo' },
  SEM_HISTORICO: { rotulo: 'Sem histórico', tom: 'cinza' },
};

export const MODULOS: Record<string, string> = {
  CONECTA: 'CONECTA', PATRIMONIO: 'Patrimônio', CONTRATOS: 'Contratos e execução', SERVIDORES: 'Servidores',
  ORDENS_SERVICO: 'Ordens de serviço', CADASTROS: 'Cadastros', DOCUMENTOS: 'Documentos', RELATORIOS: 'Relatórios',
  ADMINISTRACAO: 'Administração', OUTROS: 'Outros módulos',
};

export function pendencias(u: UnidadeMonitorada): string[] {
  const p: string[] = [];
  if (u.sem_cargo) p.push(`${u.sem_cargo} servidor(es) sem cargo`);
  if (u.sem_email) p.push(`${u.sem_email} servidor(es) sem e-mail institucional`);
  if (u.acesso_sem_cadastro) p.push(`${u.acesso_sem_cadastro} acesso(s) sem cadastro de servidor`);
  return p;
}

export function situacaoCadastral(u: UnidadeMonitorada): SituacaoCadastral {
  if (!u.ativo) return 'INATIVA';
  if (u.servidores === 0) return u.acesso_sem_cadastro ? 'INCOMPLETA' : 'SEM_SERVIDORES';
  return pendencias(u).length ? 'INCOMPLETA' : 'COM_SERVIDORES';
}

/** Pela última atividade válida registrada (não pelo login), conforme as faixas configuradas */
export function situacaoAtividade(ultima: string | null, faixas: Faixas, agora = new Date()): SituacaoAtividade {
  if (!ultima) return 'SEM_HISTORICO';
  const dias = (agora.getTime() - new Date(ultima).getTime()) / 86_400_000;
  if (dias <= faixas.recente) return 'RECENTE';
  if (dias <= faixas.moderada) return 'MODERADA';
  return 'SEM_RECENTE';
}

/** Ancestral mais próximo de um tipo (ex.: a diretoria de uma coordenação) */
export function ancestral(u: UnidadeMonitorada, tipo: UnidadeMonitorada['tipo'], porId: Map<string, UnidadeMonitorada>) {
  let atual = u.pai_id ? porId.get(u.pai_id) : undefined;
  while (atual) { if (atual.tipo === tipo) return atual; atual = atual.pai_id ? porId.get(atual.pai_id) : undefined; }
  return null;
}

export const nomeUnidade = (u: UnidadeMonitorada | null | undefined) => (u ? (u.sigla ? `${u.sigla} – ${u.nome}` : u.nome) : '—');

export function indicadores(unidades: UnidadeMonitorada[], faixas: Faixas, agora = new Date()) {
  const dir = unidades.filter((u) => u.tipo === 'DIRETORIA'), coord = unidades.filter((u) => u.tipo === 'COORDENACAO');
  const estruturas = unidades.filter((u) => u.tipo !== 'ORGANIZACAO' && u.tipo !== 'SECRETARIA');
  const comServ = estruturas.filter((u) => u.servidores > 0 && u.ativo);
  const raiz = unidades.filter((u) => !u.pai_id);
  return {
    diretorias: dir.length, coordenacoes: coord.length,
    diretoriasComServidores: dir.filter((u) => u.servidores > 0).length,
    coordenacoesComServidores: coord.filter((u) => u.servidores > 0).length,
    estruturasSemServidores: estruturas.filter((u) => u.servidores === 0 && u.ativo).length,
    comAtividadeRecente: estruturas.filter((u) => situacaoAtividade(u.ultima_atividade, faixas, agora) === 'RECENTE').length,
    semAtividade: estruturas.filter((u) => u.atividades_periodo === 0).length,
    servidoresAtivos: raiz.reduce((s, u) => s + u.servidores, 0),
    // utilização: das estruturas que já têm servidores, quantas tiveram atividade no período
    estruturasComServidores: comServ.length,
    estruturasUsando: comServ.filter((u) => u.atividades_periodo > 0).length,
  };
}
