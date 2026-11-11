// Peças comuns da Gestão Patrimonial: seletores sobre os cadastros existentes e selos de situação.
import { useQuery } from '@tanstack/react-query';
import { useSessao } from '@/auth/Sessao';
import { BuscaSelect, type Opcao } from '@/components/ui/BuscaSelect';
import { Selo } from '@/components/ui/basicos';
import { listarUnidadesAtendidas } from '@/services/cadastros';
import { buscarUnidadesDestino, type Lotacao } from '@/services/conecta';
import { buscarBens, buscarServidoresPatrimonio, CONSERVACAO, listarCategoriasPatrimonio, SITUACAO, SITUACAO_MOV, type BemListado } from '@/services/patrimonio';

type Muda = (v: string | null, o: Opcao | null) => void;

/** Setor responsável: qualquer unidade da estrutura (diretoria, coordenação, gerência, setor, unidade) */
export function SeletorSetor({ rotulo = 'Setor responsável', valor, rotuloValor, aoMudar, erro, obrigatorio, ajuda }: {
  rotulo?: string; valor: string | null; rotuloValor?: string | null; aoMudar: Muda; erro?: string | null; obrigatorio?: boolean; ajuda?: string;
}) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo={rotulo} valor={valor} rotuloValor={rotuloValor} aoMudar={aoMudar} erro={erro} obrigatorio={obrigatorio} ajuda={ajuda}
    chave={['pat-setores', orgao?.id]} placeholder="Diretoria, coordenação, gerência ou setor"
    buscar={async (t) => {
      const grupos = ['SECRETARIA', 'DIRETORIA', 'COORDENACAO', 'SETOR', 'UNIDADE_SAUDE'] as const;
      const r = (await Promise.all(grupos.map((g) => buscarUnidadesDestino(orgao!.id, g, t)))).flat();
      const TIPO: Record<string, string> = { SECRETARIA: 'Secretaria', DIRETORIA: 'Diretoria', COORDENACAO: 'Coordenação', GERENCIA: 'Gerência', DEPARTAMENTO: 'Departamento', SETOR: 'Setor', UNIDADE: 'Unidade' };
      return r.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 40)
        .map((u) => ({ valor: u.id, rotulo: `${u.sigla ? `${u.sigla} – ` : ''}${u.nome}`, detalhe: [TIPO[u.tipo] ?? u.tipo, u.detalhe].filter(Boolean).join(' · ') }));
    }} />;
}

/** Unidade de saúde onde o bem está: cadastro oficial de unidades atendidas */
export function SeletorLocal({ rotulo = 'Unidade de saúde (localização)', valor, rotuloValor, aoMudar, erro, obrigatorio, ajuda }: {
  rotulo?: string; valor: string | null; rotuloValor?: string | null; aoMudar: Muda; erro?: string | null; obrigatorio?: boolean; ajuda?: string;
}) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo={rotulo} valor={valor} rotuloValor={rotuloValor} aoMudar={aoMudar} erro={erro} obrigatorio={obrigatorio} ajuda={ajuda}
    chave={['pat-locais', orgao?.id]} placeholder="Sede, UBS, USF, CAPS, almoxarifado..."
    buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao!.id, busca: t, situacao: 'ATIVOS', limite: 30, offset: 0 })).itens
      .filter((u) => !u.eh_grupo).map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: [u.tipo, u.bairro].filter(Boolean).join(' · ') }))} />;
}

/** Servidor responsável pela guarda (cadastro de servidores), com matrícula, cargo e lotação */
export function SeletorResponsavel({ rotulo = 'Servidor responsável', valor, rotuloValor, aoMudar, erro, obrigatorio, ajuda }: {
  rotulo?: string; valor: string | null; rotuloValor?: string | null; aoMudar: Muda; erro?: string | null; obrigatorio?: boolean; ajuda?: string;
}) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo={rotulo} valor={valor} rotuloValor={rotuloValor} aoMudar={aoMudar} erro={erro} obrigatorio={obrigatorio} ajuda={ajuda}
    chave={['pat-servidores', orgao?.id]} placeholder="Nome ou matrícula"
    buscar={async (t) => (await buscarServidoresPatrimonio(orgao!.id, t)).map((s) => ({
      valor: s.id, rotulo: s.nome,
      detalhe: [`Mat. ${s.matricula}`, s.cargo, s.lotacao && (s.lotacao.sigla ?? s.lotacao.nome), s.tem_acesso ? null : 'sem acesso ao sistema (confirmação por termo físico)'].filter(Boolean).join(' · '),
    }))} />;
}

/** Bem patrimonial visível para quem escolhe */
export function SeletorBem({ rotulo = 'Bem patrimonial', valor, rotuloValor, aoMudar, erro, filtro, excluir = [] }: {
  rotulo?: string; valor: string | null; rotuloValor?: string | null; aoMudar: (v: string | null, b: BemListado | null) => void; erro?: string | null;
  filtro?: (b: BemListado) => boolean; excluir?: string[];
}) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo={rotulo} valor={valor} rotuloValor={rotuloValor} erro={erro} chave={['pat-bens-opcoes', orgao?.id, excluir.join()]}
    placeholder="Número patrimonial ou descrição"
    aoMudar={(v, o) => aoMudar(v, (o as (Opcao & { bem?: BemListado }) | null)?.bem ?? null)}
    buscar={async (t) => (await buscarBens(orgao!.id, { busca: t, limite: 30 })).itens
      .filter((b) => !excluir.includes(b.id) && (!filtro || filtro(b)))
      .map((b) => ({ valor: b.id, rotulo: `${b.numero} – ${b.descricao}`, detalhe: [rotuloUnidade(b.unidade), b.local, b.responsavel, b.pendente ? 'em movimentação' : null].filter(Boolean).join(' · '), bem: b }))} />;
}

export function useCategorias() {
  const { orgao } = useSessao();
  return useQuery({ queryKey: ['pat-categorias', orgao?.id], queryFn: () => listarCategoriasPatrimonio(orgao!.id), enabled: !!orgao, staleTime: 60_000 });
}

export function rotuloUnidade(u: Lotacao | null | undefined) {
  if (!u) return '';
  return [u.sigla ?? u.nome, u.coordenacao && u.coordenacao !== (u.sigla ?? u.nome) ? u.coordenacao : null, u.diretoria && u.diretoria !== (u.sigla ?? u.nome) ? u.diretoria : null]
    .filter(Boolean).join(' · ');
}

const TOM_SITUACAO: Record<string, 'neutro' | 'sucesso' | 'alerta' | 'perigo' | 'info'> = {
  EM_USO: 'sucesso', EM_ESTOQUE: 'info', DISPONIVEL: 'info', EM_MANUTENCAO: 'alerta', AGUARDANDO_AVALIACAO: 'alerta', EMPRESTADO: 'info',
  EM_TRANSFERENCIA: 'alerta', SUBSTITUIDO: 'neutro', BAIXADO: 'neutro', EXTRAVIADO: 'perigo', EM_APURACAO: 'perigo',
};
const TOM_CONSERVACAO: Record<string, 'neutro' | 'sucesso' | 'alerta' | 'perigo' | 'info'> = {
  NOVO: 'sucesso', EXCELENTE: 'sucesso', BOM: 'sucesso', REGULAR: 'alerta', RUIM: 'perigo', PESSIMO: 'perigo', DANIFICADO: 'perigo',
  NECESSITA_MANUTENCAO: 'alerta', EM_MANUTENCAO: 'alerta', IRRECUPERAVEL: 'perigo',
};
export const SeloSituacao = ({ s }: { s: string }) => <Selo tom={TOM_SITUACAO[s] ?? 'neutro'}>{SITUACAO[s] ?? s}</Selo>;
export const SeloConservacao = ({ c }: { c: string }) => <Selo tom={TOM_CONSERVACAO[c] ?? 'neutro'}>{CONSERVACAO[c] ?? c}</Selo>;
export const SeloMov = ({ s }: { s: string }) => <Selo tom={SITUACAO_MOV[s]?.[1] ?? 'neutro'}>{SITUACAO_MOV[s]?.[0] ?? s}</Selo>;

export function Dado({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><dt className="text-xs text-slate-500">{rotulo}</dt><dd className="text-sm text-slate-900">{children || '—'}</dd></div>;
}
