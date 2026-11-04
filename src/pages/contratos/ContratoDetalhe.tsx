import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, FileDown, FilePlus2, Pencil, Plus, Power, RefreshCw, Trash2, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { Abas } from '@/components/ui/Abas';
import { BarraUso, CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, centavos, decimalDeCentavos, formatarData, formatarDataHora } from '@/lib/formatacao';
import type { Aditivo, ContratoResumo, Designacao } from '@/lib/tipos';
import { FotoServidor } from '@/pages/cadastros/Servidores';
import {
  decidirAditivo, definirStatusContrato, designar, desvincularDotacao, emitirExtrato, encerrarDesignacao, listarAditivos, listarDesignacoes,
  listarDotacoesContrato, listarEmitidos, listarEmpenhos, listarNotas, modalidades, obterContrato, renovarContrato, salvarAditivo, vincularDotacao,
} from '@/services/execucao';
import { AvisoVencido, SeletorDotacao, SeletorServidor, SeloAtesto, SeloPagamento, SeloSituacao, documentoFornecedor } from './comum';
import { FormContrato } from './Contratos';

type Aba = 'resumo' | 'responsaveis' | 'dotacao' | 'aditivos' | 'empenhos' | 'notas' | 'documentos';
const PAPEIS = { GESTOR: 'Gestor do contrato', FISCAL: 'Fiscal do contrato', SUPLENTE: 'Suplente de fiscal' } as const;
const TIPOS_ADITIVO = { PRAZO: 'Prazo', VALOR: 'Valor (acréscimo)', PRAZO_E_VALOR: 'Prazo e valor', SUPRESSAO: 'Supressão de valor', OUTRO: 'Outro' } as const;
const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });

function Resumo({ c }: { c: ContratoResumo }) {
  const mods = useQuery({ queryKey: ['modalidades'], queryFn: modalidades, staleTime: Infinity });
  const item = (r: string, v: React.ReactNode) => <div><dt className="text-xs text-slate-500">{r}</dt><dd className="text-sm text-slate-900">{v || '—'}</dd></div>;
  const total = centavos(c.valor_atual);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{item('Objeto', <span className="whitespace-pre-line">{c.objeto}</span>)}</div>
        {item('Fornecedor', <>{c.fornecedor_nome}<span className="block text-xs text-slate-500">{documentoFornecedor(c)}</span></>)}
        {item('Modalidade', mods.data?.find((m) => m.codigo === c.modalidade)?.nome ?? c.modalidade)}
        {item('Processo administrativo', c.processo_administrativo)}{item('Pregão / licitação', c.numero_licitacao)}
        {item('Vigência', <>{formatarData(c.data_inicio)} a {formatarData(c.data_fim_atual)}{c.data_fim_atual !== c.data_fim && <span className="block text-xs text-slate-500">original: {formatarData(c.data_fim)}</span>}</>)}
        {item('Unidade responsável', `${c.unidade_nome}${c.unidade_sigla ? ` (${c.unidade_sigla})` : ''}`)}
        {c.numero_renovacao > 0 && item('Renovação', `${c.numero_renovacao}ª renovação`)}
        {c.observacoes && <div className="sm:col-span-2">{item('Observações', c.observacoes)}</div>}
      </dl>
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">Execução financeira</p>
        {[['Valor global (original)', c.valor_global], ['Aditivos aprovados', c.aditivos_valor], ['Valor atual', c.valor_atual], ['Empenhado', c.empenhado],
          ['Notas fiscais (consumido)', c.notas_valor], ['Pago', c.pago], ['Saldo do contrato', c.saldo]].map(([r, v]) => (
          <div key={r as string} className={cx('flex justify-between text-sm', r === 'Saldo do contrato' && 'border-t border-slate-200 pt-2 font-semibold')}>
            <span className="text-slate-600">{r}</span><span className="numero">{brl(v as string)}</span>
          </div>
        ))}
        <BarraUso usado={centavos(c.notas_valor)} total={total} rotulo="Consumido (notas não canceladas)" />
        <BarraUso usado={centavos(c.empenhado)} total={total} rotulo="Empenhado" />
        <p className="text-xs text-slate-500">"Consumido" = notas fiscais registradas e não canceladas. Empenho, nota e pagamento não são somados entre si.</p>
      </div>
    </div>
  );
}

function Responsaveis({ c }: { c: ContratoResumo }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const [historico, setHistorico] = useState(false);
  const q = useQuery({ queryKey: ['designacoes', c.id, historico], queryFn: () => listarDesignacoes(c.id, historico) });
  const [novo, setNovo] = useState<{ papel: Designacao['papel']; servidor: { id: string; rotulo: string } | null; inicio: string; portaria: string } | null>(null);
  const [encerrando, setEncerrando] = useState<Designacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const podeEditar = pode('contratos', 'editar');
  const salvar = useMutation({
    mutationFn: () => designar(c.id, novo!.servidor!.id, novo!.papel, novo!.inicio, novo!.portaria.trim() || null),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['designacoes', c.id] }); setNovo(null); toast.success('Designação registrada. A pessoa já vê este contrato.'); },
    onError: (e) => setErro(/designacoes_ativa_unica/.test((e as Error).message ?? '') ? 'Esta pessoa já está designada nesse papel.' : mensagemDeErro(e)),
  });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Responsáveis {historico ? '(inclui encerrados)' : 'atuais'}</h3>
          <div className="flex gap-2">
            <Botao pequeno variante="fantasma" onClick={() => setHistorico((h) => !h)}>{historico ? 'Só os atuais' : 'Ver histórico'}</Botao>
            {podeEditar && <Botao pequeno variante="secundario" icone={<Plus className="size-4" />} onClick={() => { setErro(null); setNovo({ papel: 'GESTOR', servidor: null, inicio: hoje(), portaria: '' }); }}>Designar</Botao>}
          </div>
        </div>
        {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio titulo="Nenhum responsável designado" descricao="Designe o gestor, o fiscal e o suplente. Eles passam a ver o contrato e a atestar as notas." /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.map((d) => (
              <li key={d.id} className={cx('flex items-start gap-3 rounded-xl border p-3', d.fim ? 'border-slate-200 opacity-60' : 'border-marca-200 bg-marca-50/40')}>
                <FotoServidor caminho={null} nome={d.servidor_nome} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-marca-700">{PAPEIS[d.papel]}</p>
                  <p className="truncate text-sm font-medium text-slate-900">{d.servidor_nome}</p>
                  <p className="text-xs text-slate-500">Mat. {d.servidor_matricula} · {d.unidade_sigla ?? d.unidade_nome} · desde {formatarData(d.inicio)}{d.fim ? ` até ${formatarData(d.fim)}` : ''}</p>
                  {d.portaria && <p className="text-xs text-slate-500">{d.portaria}</p>}
                  {!d.tem_acesso && !d.fim && <p className="mt-1 text-xs text-amber-700">Sem acesso ao sistema: convide a pessoa com o e-mail institucional do cadastro.</p>}
                </div>
                {podeEditar && !d.fim && <Botao pequeno variante="fantasma" icone={<UserMinus className="size-4" />} aria-label={`Encerrar designação de ${d.servidor_nome}`} onClick={() => setEncerrando(d)} />}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="PORTARIA_GESTOR" titulo="Portaria de gestor" vazio="Nenhuma portaria anexada." />
        <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="PORTARIA_FISCAL" titulo="Portaria de fiscal" vazio="Nenhuma portaria anexada." />
        <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="PORTARIA_SUPLENTE" titulo="Portaria de suplente" vazio="Nenhuma portaria anexada." />
      </div>
      <Modal aberto={!!novo} aoFechar={() => setNovo(null)} titulo="Designar responsável"
        descricao="A pessoa passa a ver só este contrato (mesmo sendo de outra coordenação) e pode atestar as notas dele."
        rodape={<><Botao variante="secundario" onClick={() => setNovo(null)}>Cancelar</Botao><Botao carregando={salvar.isPending} disabled={!novo?.servidor} onClick={() => salvar.mutate()}>Designar</Botao></>}>
        {novo && <div className="flex flex-col gap-4">
          <Selecao rotulo="Papel" value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as Designacao['papel'] })}>
            {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          <SeletorServidor rotulo="Servidor" obrigatorio valor={novo.servidor?.id ?? null} rotuloValor={novo.servidor?.rotulo}
            aoMudar={(v, o) => setNovo({ ...novo, servidor: v && o ? { id: v, rotulo: o.rotulo } : null })} />
          <Campo rotulo="Início da designação" type="date" value={novo.inicio} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} />
          <Campo rotulo="Portaria" value={novo.portaria} onChange={(e) => setNovo({ ...novo, portaria: e.target.value })} placeholder="Portaria nº 123/2026" maxLength={120} />
          {erro && <CaixaErro mensagem={erro} />}
        </div>}
      </Modal>
      <ConfirmarComMotivo aberto={!!encerrando} aoFechar={() => setEncerrando(null)} titulo={`Encerrar a designação de ${encerrando?.servidor_nome ?? ''}?`}
        descricao="A pessoa deixa de ver o contrato e não atesta mais. O histórico e os documentos já emitidos continuam com o nome dela."
        rotuloConfirmar="Encerrar" aoConfirmar={async (m) => { await encerrarDesignacao(encerrando!.id, hoje(), m); await qc.invalidateQueries({ queryKey: ['designacoes', c.id] }); toast.success('Designação encerrada.'); }} />
    </div>
  );
}

function Dotacao({ c }: { c: ContratoResumo }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['contrato-dotacoes', c.id], queryFn: () => listarDotacoesContrato(c.id) });
  const incluir = useMutation({ mutationFn: (id: string) => vincularDotacao(c.id, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['contrato-dotacoes', c.id] }), onError: (e) => toast.error(mensagemDeErro(e)) });
  const remover = useMutation({ mutationFn: (id: string) => desvincularDotacao(c.id, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['contrato-dotacoes', c.id] }), onError: (e) => toast.error(mensagemDeErro(e)) });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">As dotações vêm do cadastro de Classificação orçamentária (nada é digitado aqui). Cada empenho escolhe uma delas.</p>
      {pode('contratos', 'editar') && (
        <div className="max-w-2xl"><SeletorDotacao rotulo="Vincular dotação" valor={null} aoMudar={(v) => { if (v) incluir.mutate(v); }} excluir={q.data?.map((d) => d.id)} /></div>
      )}
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio titulo="Nenhuma dotação vinculada" descricao="Vincule ao menos uma dotação para poder empenhar." /> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-medium">Classificação</th><th className="py-2 pr-3 font-medium">Observação</th><th /></tr></thead>
          <tbody>
            {q.data.map((d) => (
              <tr key={d.id} className="border-b border-slate-100">
                <td className="numero py-2 pr-3 font-mono">{d.codigo_completo} {!d.ativo && <Selo tom="perigo">Inativa</Selo>}</td>
                <td className="py-2 pr-3 text-slate-600">{d.descricao ?? '—'}</td>
                <td className="py-2 text-right">{pode('contratos', 'editar') && <Botao pequeno variante="fantasma" icone={<Trash2 className="size-4 text-red-600" />} aria-label={`Desvincular ${d.codigo_completo}`} onClick={() => remover.mutate(d.id)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Aditivos({ c }: { c: ContratoResumo }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const q = useQuery({ queryKey: ['aditivos', c.id], queryFn: () => listarAditivos(c.id) });
  const [form, setForm] = useState<{ id?: string; numero: string; tipo: Aditivo['tipo']; data_assinatura: string; nova_data_fim: string; valor: number | null; descricao: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState<Aditivo | null>(null);
  const [renovar, setRenovar] = useState<{ numero: string; inicio: string; fim: string; valor: number | null } | null>(null);
  const invalidar = async () => { await qc.invalidateQueries({ queryKey: ['aditivos', c.id] }); await qc.invalidateQueries({ queryKey: ['contrato', c.id] }); await qc.invalidateQueries({ queryKey: ['contratos'] }); };
  const salvar = useMutation({
    mutationFn: () => salvarAditivo(form!.id ?? null, {
      ...(form!.id ? {} : { contrato_id: c.id }), numero: form!.numero.trim(), tipo: form!.tipo, data_assinatura: form!.data_assinatura || null,
      nova_data_fim: ['PRAZO', 'PRAZO_E_VALOR'].includes(form!.tipo) ? form!.nova_data_fim || null : null,
      valor: ['VALOR', 'PRAZO_E_VALOR', 'SUPRESSAO'].includes(form!.tipo) ? decimalDeCentavos(form!.tipo === 'SUPRESSAO' ? -Math.abs(form!.valor ?? 0) : form!.valor ?? 0) : '0',
      descricao: form!.descricao.trim(),
    }),
    onSuccess: async () => { await invalidar(); setForm(null); toast.success('Aditivo salvo como rascunho. Falta a aprovação.'); },
    onError: (e) => setErro(/aditivos_numero_unico/.test((e as Error).message ?? '') ? 'Já existe aditivo com este número.' : traduzirErro(e).mensagem),
  });
  const aprovar = useMutation({ mutationFn: (a: Aditivo) => decidirAditivo(a.id, true, ''), onSuccess: async () => { await invalidar(); toast.success('Aditivo aprovado: vigência e valor do contrato atualizados.'); }, onError: (e) => toast.error(mensagemDeErro(e)) });
  const renovacao = useMutation({
    mutationFn: () => renovarContrato(c.id, renovar!.numero.trim(), renovar!.inicio, renovar!.fim, decimalDeCentavos(renovar!.valor ?? 0)),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['contratos'] }); setRenovar(null); toast.success('Novo contrato criado a partir deste. O anterior fica como histórico.'); navegar(`/contratos/${id}`); },
    onError: (e) => setErro(/contratos_numero_unico/.test((e as Error).message ?? '') ? 'Já existe contrato com este número.' : traduzirErro(e).mensagem),
  });
  const amanha = new Date(new Date(c.data_fim_atual + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        {pode('contratos', 'criar') && <Botao pequeno variante="secundario" icone={<RefreshCw className="size-4" />} onClick={() => { setErro(null); setRenovar({ numero: '', inicio: amanha, fim: '', valor: centavos(c.valor_atual) }); }}>Renovar como novo contrato</Botao>}
        {pode('contratos', 'editar') && <Botao pequeno icone={<FilePlus2 className="size-4" />} onClick={() => { setErro(null); setForm({ numero: `${(q.data?.length ?? 0) + 1}º Termo Aditivo`, tipo: 'PRAZO', data_assinatura: '', nova_data_fim: '', valor: null, descricao: '' }); }}>Novo aditivo</Botao>}
      </div>
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio titulo="Nenhum aditivo" descricao="Prorrogações, acréscimos e supressões ficam registrados aqui, sem apagar os dados originais do contrato." /> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {q.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  {a.numero} <Selo>{TIPOS_ADITIVO[a.tipo]}</Selo>
                  {a.status === 'APROVADO' ? <Selo tom="sucesso">Aprovado</Selo> : a.status === 'REJEITADO' ? <Selo tom="perigo">Rejeitado</Selo> : <Selo tom="alerta">Rascunho – aguardando aprovação</Selo>}
                </p>
                <p className="text-sm text-slate-600">{a.descricao}</p>
                <p className="text-xs text-slate-500">
                  {a.nova_data_fim && <>Nova vigência até {formatarData(a.nova_data_fim)} · </>}
                  {centavos(a.valor) !== 0 && <>{centavos(a.valor) > 0 ? 'Acréscimo' : 'Supressão'} de {brl(Math.abs(Number(a.valor)))} · </>}
                  {a.data_assinatura ? `assinado em ${formatarData(a.data_assinatura)}` : 'sem data de assinatura'}
                  {a.decidido_em && ` · decidido em ${formatarDataHora(a.decidido_em)}`}{a.motivo_decisao && ` (${a.motivo_decisao})`}
                </p>
              </div>
              {a.status === 'RASCUNHO' && <div className="flex gap-1">
                {pode('contratos', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar aditivo"
                  onClick={() => { setErro(null); setForm({ id: a.id, numero: a.numero, tipo: a.tipo, data_assinatura: a.data_assinatura ?? '', nova_data_fim: a.nova_data_fim ?? '', valor: Math.abs(centavos(a.valor)) || null, descricao: a.descricao }); }} />}
                {pode('contratos', 'aprovar') && <>
                  <Botao pequeno variante="secundario" icone={<Check className="size-4 text-emerald-700" />} carregando={aprovar.isPending} onClick={() => aprovar.mutate(a)}>Aprovar</Botao>
                  <Botao pequeno variante="fantasma" icone={<X className="size-4 text-red-600" />} onClick={() => setRejeitando(a)}>Rejeitar</Botao>
                </>}
              </div>}
            </li>
          ))}
        </ul>
      )}
      <Modal aberto={!!form} aoFechar={() => setForm(null)} titulo={form?.id ? 'Editar aditivo' : 'Novo aditivo'}
        rodape={<><Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao><Botao carregando={salvar.isPending} onClick={() => salvar.mutate()}>Salvar rascunho</Botao></>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Número" obrigatorio value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} maxLength={60} />
          <Selecao rotulo="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Aditivo['tipo'] })}>
            {Object.entries(TIPOS_ADITIVO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          {['PRAZO', 'PRAZO_E_VALOR'].includes(form.tipo) && <Campo rotulo="Nova data final" type="date" obrigatorio value={form.nova_data_fim} onChange={(e) => setForm({ ...form, nova_data_fim: e.target.value })} ajuda={`Vigência atual até ${formatarData(c.data_fim_atual)}.`} />}
          {['VALOR', 'PRAZO_E_VALOR', 'SUPRESSAO'].includes(form.tipo) && <CampoMoeda rotulo={form.tipo === 'SUPRESSAO' ? 'Valor suprimido' : 'Valor acrescido'} obrigatorio centavos={form.valor} aoMudar={(v) => setForm({ ...form, valor: v })} />}
          <Campo rotulo="Data de assinatura" type="date" value={form.data_assinatura} onChange={(e) => setForm({ ...form, data_assinatura: e.target.value })} />
          <AreaTexto className="sm:col-span-2" rotulo="Descrição / justificativa" obrigatorio value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} maxLength={2000} />
          {erro && <div className="sm:col-span-2"><CaixaErro mensagem={erro} /></div>}
        </div>}
      </Modal>
      <Modal aberto={!!renovar} aoFechar={() => setRenovar(null)} titulo="Renovar como novo contrato"
        descricao="Cria um contrato novo com fornecedor, objeto, unidade, dotações e responsáveis atuais. Este contrato continua guardado como histórico."
        rodape={<><Botao variante="secundario" onClick={() => setRenovar(null)}>Cancelar</Botao><Botao carregando={renovacao.isPending} disabled={!renovar?.numero.trim() || !renovar?.fim || !renovar?.valor} onClick={() => renovacao.mutate()}>Criar contrato</Botao></>}>
        {renovar && <div className="grid gap-4 sm:grid-cols-2">
          <Campo className="sm:col-span-2" rotulo="Número do novo contrato" obrigatorio value={renovar.numero} onChange={(e) => setRenovar({ ...renovar, numero: e.target.value })} maxLength={40} />
          <Campo rotulo="Início" type="date" value={renovar.inicio} onChange={(e) => setRenovar({ ...renovar, inicio: e.target.value })} />
          <Campo rotulo="Fim" type="date" obrigatorio value={renovar.fim} onChange={(e) => setRenovar({ ...renovar, fim: e.target.value })} />
          <CampoMoeda className="sm:col-span-2" rotulo="Valor global do novo contrato" obrigatorio centavos={renovar.valor} aoMudar={(v) => setRenovar({ ...renovar, valor: v })} />
          {erro && <div className="sm:col-span-2"><CaixaErro mensagem={erro} /></div>}
        </div>}
      </Modal>
      <ConfirmarComMotivo aberto={!!rejeitando} aoFechar={() => setRejeitando(null)} titulo={`Rejeitar ${rejeitando?.numero ?? ''}?`}
        descricao="O aditivo fica registrado como rejeitado e não altera o contrato." rotuloConfirmar="Rejeitar"
        aoConfirmar={async (m) => { await decidirAditivo(rejeitando!.id, false, m); await invalidar(); toast.success('Aditivo rejeitado.'); }} />
    </div>
  );
}

function ListaEmpenhos({ c }: { c: ContratoResumo }) {
  const { orgao } = useSessao();
  const q = useQuery({ queryKey: ['empenhos', orgao?.id, 'contrato', c.id], queryFn: () => listarEmpenhos({ tenantId: orgao!.id, contratoId: c.id, situacao: 'TODOS', limite: 100, offset: 0 }) });
  if (q.isLoading) return <Carregando />;
  return !q.data?.itens.length ? <Vazio titulo="Nenhum empenho" descricao="Os empenhos são lançados em Empenhos, escolhendo este contrato." acao={<Link to={`/empenhos?contrato=${c.id}`} className="text-sm text-marca-700 hover:underline">Ir para Empenhos</Link>} /> : (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
        <th className="py-2 pr-3 font-medium">Empenho</th><th className="py-2 pr-3 font-medium">Dotação</th><th className="py-2 pr-3 text-right font-medium">Valor + reforços</th><th className="py-2 pr-3 text-right font-medium">Utilizado</th><th className="py-2 text-right font-medium">Saldo</th>
      </tr></thead>
      <tbody>{q.data.itens.map((e) => (
        <tr key={e.id} className={cx('border-b border-slate-100', !e.ativo && 'opacity-50')}>
          <td className="py-2 pr-3"><Link to={`/empenhos?ver=${e.id}`} className="font-medium text-marca-700 hover:underline">{e.numero}/{e.ano}</Link><span className="block text-xs text-slate-500">{formatarData(e.data_empenho)}</span></td>
          <td className="numero py-2 pr-3 font-mono text-xs">{e.classificacao_codigo}</td>
          <td className="numero py-2 pr-3 text-right">{brl(e.valor_total)}</td><td className="numero py-2 pr-3 text-right">{brl(e.utilizado)}</td>
          <td className={cx('numero py-2 text-right font-medium', centavos(e.saldo) < 0 && 'text-red-700')}>{brl(e.saldo)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function ListaNotas({ c }: { c: ContratoResumo }) {
  const { orgao } = useSessao();
  const q = useQuery({ queryKey: ['notas', orgao?.id, 'contrato', c.id], queryFn: () => listarNotas({ tenantId: orgao!.id, contratoId: c.id, limite: 100, offset: 0 }) });
  if (q.isLoading) return <Carregando />;
  return !q.data?.itens.length ? <Vazio titulo="Nenhuma nota fiscal" acao={<Link to={`/notas?contrato=${c.id}`} className="text-sm text-marca-700 hover:underline">Ir para Notas fiscais</Link>} /> : (
    <ul className="divide-y divide-slate-100">
      {q.data.itens.map((n) => (
        <li key={n.id} className={cx('flex flex-wrap items-center gap-2 py-2.5 text-sm', n.cancelada_em && 'opacity-50')}>
          <Link to={`/notas?ver=${n.id}`} className="font-medium text-marca-700 hover:underline">NF {n.numero}</Link>
          <span className="text-slate-500">{formatarData(n.data_emissao)} · Emp. {n.empenho_numero}/{n.empenho_ano} · {n.meses_referencia}</span>
          <span className="numero ml-auto font-medium">{brl(n.valor)}</span>
          {!n.cancelada_em && <SeloAtesto status={n.status_atesto} />}<SeloPagamento status={n.status_pagamento} />
        </li>
      ))}
    </ul>
  );
}

function Documentos({ c }: { c: ContratoResumo }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const emitidos = useQuery({ queryKey: ['emitidos', c.id], queryFn: () => listarEmitidos(c.id) });
  const emitir = useMutation({
    mutationFn: () => emitirExtrato('contrato', c.id),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['emitidos', c.id] }); navegar(`/imprimir/${id}`); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Anexos recurso="contratos" registroId={c.id} unidadeId={c.unidade_id} categoria="GERAL" titulo="Documentos do contrato" />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Extratos emitidos</h3>
          <Botao pequeno variante="secundario" icone={<FileDown className="size-4" />} carregando={emitir.isPending} onClick={() => emitir.mutate()}>Emitir extrato</Botao>
        </div>
        {!emitidos.data?.length ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nenhum extrato emitido. Cada emissão guarda os dados do momento.</p> : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {emitidos.data.map((d) => (
              <li key={d.id}><Link to={`/imprimir/${d.id}`} className="flex justify-between px-3 py-2 text-sm hover:bg-slate-50"><span>{d.titulo}</span><span className="text-xs text-slate-500">{formatarDataHora(d.emitido_em)}</span></Link></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ContratoDetalhe() {
  const { id } = useParams();
  const { pode } = useSessao();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('resumo');
  const [editando, setEditando] = useState(false);
  const [inativando, setInativando] = useState(false);
  const q = useQuery({ queryKey: ['contrato', id], queryFn: () => obterContrato(id!), enabled: !!id });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={/0 rows|PGRST116/.test((q.error as Error).message) ? 'Contrato não encontrado ou sem permissão.' : traduzirErro(q.error).mensagem} />;
  const c = q.data!;
  return (
    <>
      <Link to="/contratos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" />Contratos</Link>
      <CabecalhoPagina titulo={`Contrato ${c.numero}`}
        descricao={<span className="flex flex-wrap items-center gap-2">{c.fornecedor_nome} <SeloSituacao situacao={c.situacao} dias={c.dias_para_vencer} />{!c.ativo && <Selo tom="perigo">Inativo</Selo>}
          {c.contrato_origem_id && <Link to={`/contratos/${c.contrato_origem_id}`} className="text-xs text-marca-700 hover:underline">ver contrato anterior</Link>}</span>}
        acoes={<>
          {pode('contratos', 'editar') && <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={() => setEditando(true)}>Editar</Botao>}
          {pode('contratos', 'excluir') && <Botao variante="fantasma" icone={<Power className="size-4" />} onClick={() => setInativando(true)}>{c.ativo ? 'Inativar' : 'Reativar'}</Botao>}
        </>} />
      <div className="mb-4"><AvisoVencido c={c} /></div>
      <Cartao>
        <Abas abas={[{ id: 'resumo', rotulo: 'Resumo' }, { id: 'responsaveis', rotulo: 'Responsáveis e portarias' }, { id: 'dotacao', rotulo: 'Dotação' },
          { id: 'aditivos', rotulo: `Aditivos${c.aditivos_aprovados ? ` (${c.aditivos_aprovados})` : ''}` }, { id: 'empenhos', rotulo: 'Empenhos' }, { id: 'notas', rotulo: 'Notas fiscais' },
          { id: 'documentos', rotulo: 'Documentos e extratos' }]} ativa={aba} aoMudar={setAba} />
        {aba === 'resumo' && <Resumo c={c} />}
        {aba === 'responsaveis' && <Responsaveis c={c} />}
        {aba === 'dotacao' && <Dotacao c={c} />}
        {aba === 'aditivos' && <Aditivos c={c} />}
        {aba === 'empenhos' && <ListaEmpenhos c={c} />}
        {aba === 'notas' && <ListaNotas c={c} />}
        {aba === 'documentos' && <Documentos c={c} />}
      </Cartao>
      <FormContrato aberto={editando} aoFechar={() => { setEditando(false); void qc.invalidateQueries({ queryKey: ['contrato', id] }); }} contrato={c} />
      <ConfirmarComMotivo aberto={inativando} aoFechar={() => setInativando(false)} perigo={c.ativo}
        titulo={c.ativo ? `Inativar o contrato ${c.numero}?` : `Reativar o contrato ${c.numero}?`}
        descricao={c.ativo ? 'Use só para cadastro feito por engano. Empenhos, notas, documentos e histórico continuam guardados e consultáveis.' : 'O contrato volta a aparecer nas listas.'}
        rotuloConfirmar={c.ativo ? 'Inativar' : 'Reativar'} minimo={c.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusContrato(c.id, !c.ativo, m); await qc.invalidateQueries({ queryKey: ['contrato', id] }); await qc.invalidateQueries({ queryKey: ['contratos'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}
