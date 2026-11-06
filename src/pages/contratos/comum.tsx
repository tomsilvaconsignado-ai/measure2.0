// Peças compartilhadas pelas telas de contratos, empenhos e notas.
import { AlertTriangle, CalendarClock, CheckCircle2, CircleSlash, Clock } from 'lucide-react';
import { useSessao } from '@/auth/Sessao';
import { BuscaSelect, type Opcao } from '@/components/ui/BuscaSelect';
import { Selo } from '@/components/ui/basicos';
import { brl, formatarCnpj, formatarCpf, formatarData } from '@/lib/formatacao';
import type { ContratoResumo, SituacaoContrato, StatusPagamento } from '@/lib/tipos';
import { buscarFornecedoresOpcoes, listarClassificacoes } from '@/services/cadastros';
import { buscarServidoresDesignacao, listarContratos, listarEmpenhos } from '@/services/execucao';

export function SeloSituacao({ situacao, dias }: { situacao: SituacaoContrato; dias?: number }) {
  if (situacao === 'VENCIDO') return <Selo tom="perigo" icone={<CircleSlash className="size-3" />}>Vencido</Selo>;
  if (situacao === 'A_VENCER') return <Selo tom="alerta" icone={<CalendarClock className="size-3" />}>Vence em {dias} dia{dias === 1 ? '' : 's'}</Selo>;
  if (situacao === 'NAO_INICIADO') return <Selo tom="info" icone={<Clock className="size-3" />}>Não iniciado</Selo>;
  return <Selo tom="sucesso" icone={<CheckCircle2 className="size-3" />}>Vigente</Selo>;
}

export function SeloAtesto({ status }: { status: 'PENDENTE' | 'ATESTADA' }) {
  return status === 'ATESTADA' ? <Selo tom="sucesso" icone={<CheckCircle2 className="size-3" />}>Atestada</Selo> : <Selo tom="alerta" icone={<Clock className="size-3" />}>Pendente de atesto</Selo>;
}

export function SeloPagamento({ status }: { status: StatusPagamento }) {
  const m: Record<StatusPagamento, [string, 'sucesso' | 'alerta' | 'info' | 'neutro']> = {
    PENDENTE: ['Pagamento pendente', 'neutro'], PARCIAL: ['Pago parcialmente', 'info'], PAGO: ['Paga', 'sucesso'], CANCELADA: ['Cancelada', 'neutro'],
  };
  return <Selo tom={m[status][1]}>{m[status][0]}</Selo>;
}

export const documentoFornecedor = (c: Pick<ContratoResumo, 'fornecedor_tipo' | 'fornecedor_documento'>) =>
  c.fornecedor_tipo === 'PF' ? formatarCpf(c.fornecedor_documento) : formatarCnpj(c.fornecedor_documento);

export const rotuloContrato = (c: Pick<ContratoResumo, 'numero' | 'fornecedor_nome'>) => `${c.numero} – ${c.fornecedor_nome}`;

export function AvisoVencido({ c }: { c: Pick<ContratoResumo, 'situacao' | 'data_fim_atual' | 'numero'> }) {
  if (c.situacao !== 'VENCIDO') return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />O contrato {c.numero} venceu em {formatarData(c.data_fim_atual)}. Confira se o lançamento é administrativamente legítimo.
    </p>
  );
}

// ---------------------------------------------------------------- seletores com busca no servidor

export function SeletorFornecedor(p: { valor: string | null; rotuloValor?: string | null; aoMudar: (v: string | null, o: Opcao | null) => void; erro?: string | null; obrigatorio?: boolean; desabilitado?: boolean }) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo="Fornecedor" {...p} chave={['fornecedores-opcoes', orgao?.id]} placeholder="Razão social, nome fantasia ou CNPJ/CPF"
    buscar={async (t) => (await buscarFornecedoresOpcoes(orgao!.id, t)).map((f) => ({
      valor: f.id, rotulo: f.razao_social || f.nome_fantasia || '', detalhe: `${f.tipo_pessoa === 'PF' ? formatarCpf(f.documento) : formatarCnpj(f.documento)}${f.nome_fantasia && f.razao_social ? ` · ${f.nome_fantasia}` : ''}`,
    }))} />;
}

/** Servidores de todo o órgão (gestor/fiscal/suplente podem ser de outra coordenação); só dados mínimos */
export function SeletorServidor(p: { rotulo: string; valor: string | null; rotuloValor?: string | null; aoMudar: (v: string | null, o: Opcao | null) => void; erro?: string | null; obrigatorio?: boolean }) {
  const { orgao } = useSessao();
  return <BuscaSelect {...p} chave={['servidores-designacao', orgao?.id]} placeholder="Nome, matrícula ou sigla da unidade"
    buscar={async (t) => (await buscarServidoresDesignacao(orgao!.id, t))
      .map((s) => ({ valor: s.id, rotulo: s.nome, detalhe: `Mat. ${s.matricula} · ${s.unidade_sigla ?? s.unidade_nome}${s.tem_acesso ? '' : ' · sem acesso ao sistema'}` }))} />;
}

export function SeletorDotacao(p: { rotulo?: string; valor: string | null; rotuloValor?: string | null; aoMudar: (v: string | null, o: Opcao | null) => void; erro?: string | null; excluir?: string[]; exercicio?: number | null; ajuda?: string }) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo={p.rotulo ?? 'Dotação orçamentária'} valor={p.valor} rotuloValor={p.rotuloValor} aoMudar={p.aoMudar} erro={p.erro} ajuda={p.ajuda}
    chave={['dotacoes-opcoes', orgao?.id, p.excluir?.length, p.exercicio]} placeholder="UO, ação, natureza (33903914), fonte ou descrição"
    buscar={async (t) => (await listarClassificacoes({ tenantId: orgao!.id, busca: t, situacao: 'ATIVOS', limite: 20, offset: 0, exercicio: p.exercicio ?? null })).itens
      .filter((d) => !p.excluir?.includes(d.id)).map((d) => ({ valor: d.id, rotulo: d.codigo_completo,
        detalhe: [d.exercicio ? `Exercício ${d.exercicio}` : 'Qualquer exercício', d.uo_descricao, d.acao_descricao, d.subelemento_descricao ?? d.elemento_descricao, `Fonte ${d.fonte_codigo}`].filter(Boolean).join(' · ') }))} />;
}

export function SeletorContrato(p: { valor: string | null; rotuloValor?: string | null; aoMudar: (v: string | null, o: Opcao | null) => void; erro?: string | null; obrigatorio?: boolean; desabilitado?: boolean }) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo="Contrato" {...p} chave={['contratos-opcoes', orgao?.id]} placeholder="Número, fornecedor ou objeto"
    buscar={async (t) => (await listarContratos({ tenantId: orgao!.id, busca: t, situacao: 'TODOS', limite: 20, offset: 0 })).itens
      .map((c) => ({ valor: c.id, rotulo: rotuloContrato(c), detalhe: `${c.situacao === 'VENCIDO' ? 'VENCIDO · ' : ''}${c.objeto.slice(0, 90)}` }))} />;
}

export function SeletorEmpenho(p: { contratoId: string | null; valor: string | null; rotuloValor?: string | null; aoMudar: (v: string | null, o: Opcao | null) => void; erro?: string | null; obrigatorio?: boolean }) {
  const { orgao } = useSessao();
  return <BuscaSelect rotulo="Empenho" valor={p.valor} rotuloValor={p.rotuloValor} aoMudar={p.aoMudar} erro={p.erro} obrigatorio={p.obrigatorio}
    desabilitado={!p.contratoId} ajuda={!p.contratoId ? 'Escolha antes o contrato.' : undefined}
    chave={['empenhos-opcoes', orgao?.id, p.contratoId]} placeholder="Número do empenho"
    buscar={async (t) => (await listarEmpenhos({ tenantId: orgao!.id, contratoId: p.contratoId, busca: t, situacao: 'ATIVOS', limite: 30, offset: 0 })).itens
      .map((e) => ({ valor: e.id, rotulo: `${e.numero}/${e.ano}`, detalhe: `Saldo ${brl(e.saldo)} · ${e.classificacao_codigo}` }))} />;
}
