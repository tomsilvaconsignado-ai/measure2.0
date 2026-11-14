// Detalhe da notificação formal: documento oficial (imprimir/PDF), anexos por finalidade, andamento
// (assinatura, envio, recusa, recebimento, ciência, resposta, análise, encaminhamento, encerramento,
// cancelamento, retificação), sanções aplicadas e o histórico completo com autor e data.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileDown, FilePen, Gavel, Pencil, Printer, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Selecao } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarData, formatarDataHora } from '@/lib/formatacao';
import { FORMAS_ENVIO, GRAVIDADES, PAPEIS, REGIMES, SANCOES, STATUS } from '@/lib/notificacaoFormal';
import { listarDocumentos } from '@/services/documentos';
import { obterEmitido } from '@/services/execucao';
import { excluirRascunho, obter, registrarResposta, registrarSancao, retificar, tramitar, type Notificacao } from '@/services/notificacoesFormais';
import { SeloStatus } from './comum';

type Acao = 'ASSINATURA' | 'ENVIO' | 'RECUSA' | 'RECEBIMENTO' | 'CIENCIA' | 'RESPOSTA' | 'INICIAR_ANALISE' | 'ANALISE' | 'ENCAMINHAMENTO' | 'ENCERRAMENTO' | 'SANCAO';

const ACOES: Record<Acao, { rotulo: string; quando: string[] }> = {
  ASSINATURA: { rotulo: 'Registrar assinatura', quando: ['AGUARDANDO_ASSINATURA'] },
  ENVIO: { rotulo: 'Registrar envio à empresa', quando: ['EMITIDA', 'ENVIADA'] },
  RECUSA: { rotulo: 'Recusa / impossibilidade de entrega', quando: ['ENVIADA'] },
  RECEBIMENTO: { rotulo: 'Registrar recebimento', quando: ['ENVIADA'] },
  CIENCIA: { rotulo: 'Registrar ciência da empresa', quando: ['ENVIADA', 'RECEBIDA'] },
  RESPOSTA: { rotulo: 'Registrar resposta da empresa', quando: ['ENVIADA', 'RECEBIDA', 'EM_PRAZO', 'PRAZO_VENCIDO', 'RESPONDIDA', 'EM_ANALISE'] },
  INICIAR_ANALISE: { rotulo: 'Iniciar análise', quando: ['RESPONDIDA'] },
  ANALISE: { rotulo: 'Registrar análise e resultado', quando: ['RESPONDIDA', 'EM_ANALISE', 'EM_PRAZO', 'PRAZO_VENCIDO'] },
  ENCAMINHAMENTO: { rotulo: 'Encaminhar à autoridade competente', quando: ['NAO_REGULARIZADA', 'PRAZO_VENCIDO', 'EM_ANALISE', 'RESPONDIDA'] },
  ENCERRAMENTO: { rotulo: 'Encerrar ocorrência', quando: ['REGULARIZADA', 'NAO_REGULARIZADA', 'ENCAMINHADA'] },
  SANCAO: { rotulo: 'Registrar sanção aplicada', quando: ['ENCAMINHADA', 'NAO_REGULARIZADA', 'ENCERRADA', 'PRAZO_VENCIDO'] },
};
const TIPOS_TRAMITE: Record<string, string> = {
  CRIADA: 'Registro criado', EMITIDA: 'Notificação emitida', ASSINATURA: 'Assinatura registrada', ENVIO: 'Envio registrado', RECUSA: 'Recusa ou impossibilidade de entrega',
  RECEBIMENTO: 'Recebimento confirmado', CIENCIA: 'Ciência da empresa', RESPOSTA: 'Resposta da empresa', INICIAR_ANALISE: 'Análise iniciada', ANALISE: 'Análise e resultado',
  ENCAMINHAMENTO: 'Encaminhada à autoridade competente', ENCERRAMENTO: 'Encerrada', CANCELAMENTO: 'Cancelada', PRAZO_VENCIDO: 'Prazo vencido (rotina diária)',
  RETIFICADA: 'Substituída por nova versão', RETIFICACAO_INICIADA: 'Retificação iniciada', SANCAO_REGISTRADA: 'Sanção aplicada registrada',
};

const Secao = ({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) => (
  <section><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{n}. {titulo}</h3><div className="whitespace-pre-line text-sm text-slate-800">{children}</div></section>
);

export function DetalheNotificacao() {
  const { id } = useParams();
  const { orgao } = useSessao();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['nf', id], queryFn: () => obter(id!), enabled: !!id });
  const [acao, setAcao] = useState<Acao | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [retificando, setRetificando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={traduzirErro(q.error).mensagem} />;
  const n = q.data!;
  const atualizar = () => Promise.all([qc.invalidateQueries({ queryKey: ['nf', id] }), qc.invalidateQueries({ queryKey: ['nf-painel'] })]);
  const finais = ['ENCERRADA', 'CANCELADA', 'RETIFICADA'];
  const disponiveis = (Object.keys(ACOES) as Acao[]).filter((a) => ACOES[a].quando.includes(n.status) && (a !== 'SANCAO' || n.pode_sancionar));
  const baixarPdf = async () => {
    setBaixando(true);
    try {
      const { pdfDoEmitido } = await import('../pdfEmitidos');
      const blob = await pdfDoEmitido(qc, await obterEmitido(n.documento_emitido_id!));
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `notificacao_${n.numero}_${n.ano}${n.versao > 1 ? `_v${n.versao}` : ''}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast.error(mensagemDeErro(e)); } finally { setBaixando(false); }
  };

  return (
    <>
      <CabecalhoPagina titulo={n.rotulo} descricao={<span className="inline-flex flex-wrap items-center gap-2">{n.fornecedor_nome} · {formatarCnpj(n.fornecedor_documento)} · <Link to={`/contratos/${n.contrato_id}`} className="text-marca-700 hover:underline">Contrato nº {n.contrato_numero}</Link> <SeloStatus status={n.status} /></span>}
        acoes={<div className="flex flex-wrap gap-2">
          <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} onClick={() => navegar('/notificacoes-contratuais')}>Voltar</Botao>
          {n.pode_editar && <Link to={`/notificacoes-contratuais/${n.id}/editar`}><Botao icone={<Pencil className="size-4" />}>Continuar edição</Botao></Link>}
          {n.pode_editar && <Botao variante="perigo" icone={<Trash2 className="size-4" />} onClick={async () => {
            if (!confirm('Excluir este rascunho? Nada foi emitido; a exclusão fica registrada na auditoria.')) return;
            try { await excluirRascunho(n.id); await atualizar(); navegar('/notificacoes-contratuais'); } catch (e) { toast.error(mensagemDeErro(e)); }
          }}>Excluir rascunho</Botao>}
          {n.documento_emitido_id && <>
            <Link to={`/imprimir/${n.documento_emitido_id}`}><Botao variante="secundario" icone={<Printer className="size-4" />}>Imprimir</Botao></Link>
            <Botao variante="secundario" icone={<FileDown className="size-4" />} carregando={baixando} onClick={() => void baixarPdf()}>Baixar PDF</Botao>
          </>}
        </div>} />

      {n.versao_nova && <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Esta versão foi retificada. <Link className="text-marca-700 hover:underline" to={`/notificacoes-contratuais/${n.versao_nova}`}>Abrir a versão mais recente</Link>.</p>}
      {n.recorrencia > 0 && <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>ATENÇÃO:</b> este fornecedor possui {n.recorrencia} outra(s) ocorrência(s) registrada(s) no histórico. Consulte-as antes de concluir a análise.</p>}
      {n.status === 'CANCELADA' && n.cancelada_motivo && <CaixaErro mensagem={`Cancelada: ${n.cancelada_motivo}`} />}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Cartao titulo="Conteúdo da notificação">
          <dl className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs uppercase text-slate-500">Ocorrência</dt><dd>{n.tipo_nome ?? '—'}</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Data / gravidade</dt><dd>{n.data_ocorrencia ? formatarData(n.data_ocorrencia) : '—'} · {GRAVIDADES[n.gravidade]}</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Regime</dt><dd>{REGIMES[n.regime_juridico]}</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Emissor</dt><dd>{n.emissor_nome ?? '—'}{n.emissor_papel && <span className="text-slate-500"> · {PAPEIS[n.emissor_papel]}</span>}</dd></div>
          </dl>
          <div className="flex flex-col gap-4">
            <Secao n={1} titulo="Dos fatos">{n.local_ocorrencia && <b>Local: {n.local_ocorrencia}. </b>}{n.fatos || '—'}</Secao>
            <Secao n={2} titulo="Das obrigações contratuais">{n.obrigacoes}{n.clausula && `\n${n.clausula}`}</Secao>
            <Secao n={3} titulo="Da fundamentação legal">{n.fundamentacao}</Secao>
            <Secao n={4} titulo="Das providências exigidas">{n.providencias}</Secao>
            <Secao n={5} titulo="Do prazo">{n.prazo_texto}{n.data_limite && <b>{`\nData limite: ${formatarData(n.data_limite)}`}{n.data_limite_resposta ? ` · resposta até ${formatarData(n.data_limite_resposta)}` : ''}</b>}</Secao>
            <Secao n={6} titulo="Das consequências do não atendimento">{n.consequencias}</Secao>
            <Secao n={7} titulo="Da manifestação da contratada">{n.manifestacao}</Secao>
          </div>
        </Cartao>
        <div className="flex flex-col gap-4">
          <Cartao titulo="Andamento">
            <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs uppercase text-slate-500">Emitida em</dt><dd>{n.emitida_em ? formatarDataHora(n.emitida_em) : '—'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Ciência</dt><dd>{n.data_ciencia ? formatarData(n.data_ciencia) : '—'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Prazo concedido</dt><dd>{n.prazo_dias ? `${n.prazo_dias} dias ${n.prazo_tipo === 'UTEIS' ? 'úteis' : 'corridos'}` : '—'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Data limite</dt><dd className={n.status === 'PRAZO_VENCIDO' ? 'font-semibold text-red-700' : ''}>{n.data_limite ? formatarData(n.data_limite) : 'conta da ciência'}</dd></div>
            </dl>
            {n.pode_atuar && !finais.includes(n.status) && n.status !== 'RASCUNHO' ? (
              <div className="flex flex-col gap-2">
                {disponiveis.map((a) => <Botao key={a} variante={a === 'ENCAMINHAMENTO' || a === 'SANCAO' ? 'secundario' : 'primario'} icone={a === 'SANCAO' ? <Gavel className="size-4" /> : undefined} onClick={() => setAcao(a)}>{ACOES[a].rotulo}</Botao>)}
                <div className="mt-1 flex gap-2">
                  <Botao className="flex-1" pequeno variante="secundario" icone={<FilePen className="size-4" />} onClick={() => setRetificando(true)}>Retificar (nova versão)</Botao>
                  {STATUS[n.status] && !['REGULARIZADA', 'NAO_REGULARIZADA', 'ENCAMINHADA'].includes(n.status) && <Botao className="flex-1" pequeno variante="fantasma" onClick={() => setCancelando(true)}>Cancelar</Botao>}
                </div>
              </div>
            ) : n.status === 'ENCERRADA' && n.pode_sancionar ? <Botao variante="secundario" icone={<Gavel className="size-4" />} onClick={() => setAcao('SANCAO')}>Registrar sanção aplicada</Botao>
              : <p className="text-sm text-slate-500">{n.status === 'RASCUNHO' ? 'Ainda em elaboração.' : finais.includes(n.status) ? 'Sem ações pendentes.' : 'Somente o gestor, o fiscal ou o suplente designado (ou perfil autorizado) conduz esta notificação.'}</p>}
          </Cartao>
          {n.status !== 'RASCUNHO' && <Cartao>
            <div className="flex flex-col gap-4">
              <Anexos recurso="notificacoes_contratuais" registroId={n.id} unidadeId={null} categoria="EVIDENCIA" titulo="Evidências" podeGerenciar={n.pode_atuar && !finais.includes(n.status)} />
              <Anexos recurso="notificacoes_contratuais" registroId={n.id} unidadeId={null} categoria="ASSINADA" titulo="Documento assinado" vazio="Imprima, assine e anexe aqui o documento assinado (ou o PDF assinado no sistema oficial)." podeGerenciar={n.pode_atuar && !finais.includes(n.status)} />
              <Anexos recurso="notificacoes_contratuais" registroId={n.id} unidadeId={null} categoria="COMPROVANTE" titulo="Comprovantes de envio, recebimento e ciência" podeGerenciar={n.pode_atuar && !finais.includes(n.status)} />
              <Anexos recurso="notificacoes_contratuais" registroId={n.id} unidadeId={null} categoria="RESPOSTA" titulo="Resposta e documentos da empresa" podeGerenciar={n.pode_atuar && !finais.includes(n.status)} />
            </div>
          </Cartao>}
        </div>
      </div>

      {(n.respostas.length > 0 || n.sancoes.length > 0) && <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {n.respostas.length > 0 && <Cartao titulo="Respostas da empresa">
          <ul className="flex flex-col gap-3">{n.respostas.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="text-xs text-slate-500">Resposta de {formatarData(r.data_resposta)}{r.recebida_por ? ` · recebida por ${r.recebida_por}` : ''}</p>
              <p className="mt-1 whitespace-pre-line">{r.justificativa}</p>
              {r.providencias_adotadas && <p className="mt-1 text-slate-700"><b>Providências informadas:</b> {r.providencias_adotadas}</p>}
              {r.analise && <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs"><b>Análise:</b> {({ ACEITA: 'Aceita', PARCIALMENTE_ACEITA: 'Parcialmente aceita', NAO_ACEITA: 'Não aceita' } as Record<string, string>)[r.analise]} – {r.analise_justificativa}</p>}
            </li>
          ))}</ul>
        </Cartao>}
        {n.sancoes.length > 0 && <Cartao titulo="Sanções efetivamente aplicadas (processo próprio)">
          <ul className="flex flex-col gap-2 text-sm">{n.sancoes.map((s) => (
            <li key={s.id} className="rounded-lg border border-red-200 bg-red-50/40 p-3"><b>{SANCOES[s.tipo]}</b> · {s.situacao.toLowerCase()} · processo {s.processo}<br />
              <span className="text-xs text-slate-600">{s.autoridade} · decisão de {formatarData(s.data_decisao)} · {s.fundamento}{s.valor ? ` · ${brl(s.valor)}` : ''}</span></li>
          ))}</ul>
        </Cartao>}
      </div>}

      <Cartao className="mt-4" titulo="Histórico (não pode ser alterado nem apagado)">
        <ol className="relative ml-2 border-l border-slate-200">
          {n.tramites.map((t) => (
            <li key={t.id} className="mb-3 ml-4">
              <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-marca-600" />
              <p className="text-sm font-medium text-slate-800">{TIPOS_TRAMITE[t.tipo] ?? t.tipo}{t.status_novo && t.status_novo !== t.status_anterior && <span className="ml-2 font-normal text-slate-500">→ {STATUS[t.status_novo as keyof typeof STATUS]?.rotulo ?? t.status_novo}</span>}</p>
              <p className="text-xs text-slate-500">{formatarDataHora(t.criado_em)} · {t.autor_nome ?? 'sistema'}</p>
              {t.justificativa && <p className="text-sm text-slate-700">{t.justificativa}</p>}
              {Object.keys(t.dados).length > 0 && <p className="text-xs text-slate-500">{resumoDados(t.dados)}</p>}
            </li>
          ))}
        </ol>
      </Cartao>

      {acao && orgao && <DialogoAcao n={n} acao={acao} aoFechar={() => setAcao(null)} aoConcluir={async () => { setAcao(null); await atualizar(); }} tenantId={orgao.id} />}
      <ConfirmarComMotivo aberto={cancelando} aoFechar={() => setCancelando(false)} titulo="Cancelar notificação?" rotuloConfirmar="Cancelar notificação"
        descricao="A notificação continua no histórico como cancelada, com a justificativa. Nada é apagado."
        aoConfirmar={async (m) => { await tramitar(n.id, 'CANCELAMENTO', {}, m); toast.success('Notificação cancelada.'); await atualizar(); }} />
      <ConfirmarComMotivo aberto={retificando} aoFechar={() => setRetificando(false)} titulo="Retificar notificação?" rotuloConfirmar="Criar nova versão"
        descricao="Cria uma nova versão em elaboração com o mesmo conteúdo. Ao emitir, esta versão fica preservada como retificada."
        aoConfirmar={async (m) => { const v = await retificar(n.id, m); await atualizar(); navegar(`/notificacoes-contratuais/${v}/editar`); }} />
    </>
  );
}

function resumoDados(d: Record<string, unknown>) {
  const r: string[] = [];
  if (d.forma) r.push(FORMAS_ENVIO[String(d.forma)] ?? String(d.forma));
  if (d.email) r.push(`e-mail ${d.email}`);
  if (d.data_hora) r.push(`em ${formatarDataHora(String(d.data_hora))}`);
  if (d.protocolo) r.push(`protocolo ${d.protocolo}`);
  if (d.assinado_por) r.push(`assinado por ${d.assinado_por}`);
  if (d.data_ciencia) r.push(`ciência em ${formatarData(String(d.data_ciencia))}`);
  if (d.representante) r.push(`representante ${d.representante}`);
  if (d.meio) r.push(String(d.meio));
  if (d.data_limite) r.push(`prazo até ${formatarData(String(d.data_limite))}`);
  if (d.data) r.push(`em ${formatarData(String(d.data))}`);
  if (d.autoridade) r.push(`autoridade: ${d.autoridade}`);
  if (d.processo) r.push(`processo ${d.processo}`);
  if (d.resultado) r.push(String(d.resultado) === 'REGULARIZADA' ? 'irregularidade corrigida' : 'irregularidade não corrigida');
  if (d.numero) r.push(`nº ${d.numero}/${d.ano}`);
  return r.join(' · ');
}

function DialogoAcao({ n, acao, aoFechar, aoConcluir, tenantId }: { n: Notificacao; acao: Acao; aoFechar: () => void; aoConcluir: () => Promise<void>; tenantId: string }) {
  const [v, setV] = useState<Record<string, string>>({ forma: acao === 'ENVIO' ? 'EMAIL' : acao === 'ASSINATURA' ? 'MANUAL_DIGITALIZADA' : '', data_hora: new Date().toISOString().slice(0, 16),
    data: new Date().toISOString().slice(0, 10), data_ciencia: '', data_resposta: new Date().toISOString().slice(0, 10), resultado: 'REGULARIZADA', analise_resposta: 'ACEITA', tipo: 'ADVERTENCIA' });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cat = acao === 'ASSINATURA' ? 'ASSINADA' : ['ENVIO', 'RECEBIMENTO', 'CIENCIA', 'RECUSA'].includes(acao) ? 'COMPROVANTE' : acao === 'RESPOSTA' ? 'RESPOSTA' : null;
  const docs = useQuery({ queryKey: ['documentos', tenantId, 'notificacoes_contratuais', n.id, cat], queryFn: () => listarDocumentos(tenantId, 'notificacoes_contratuais', n.id, cat!), enabled: !!cat });
  const ultimaResposta = n.respostas.at(-1);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const enviar = async () => {
    setOcupado(true); setErro(null);
    try {
      if (acao === 'RESPOSTA') await registrarResposta(n.id, { data_resposta: v.data_resposta, recebida_por: v.recebida_por, justificativa: v.justificativa, providencias_adotadas: v.providencias });
      else if (acao === 'SANCAO') await registrarSancao({ fornecedor_id: n.fornecedor_id, contrato_id: n.contrato_id, notificacao_id: n.id, tipo: v.tipo, processo: v.processo, autoridade: v.autoridade,
        fundamento: v.fundamento, decisao: v.decisao, data_decisao: v.data_decisao, vigencia_inicio: v.vigencia_inicio, vigencia_fim: v.vigencia_fim, valor: v.valor?.replace(/\./g, '').replace(',', '.') });
      else {
        const dados: Record<string, unknown> = { documento_id: v.documento_id || null };
        if (acao === 'ASSINATURA') Object.assign(dados, { assinado_por: v.assinado_por, forma: v.forma, data: v.data });
        if (acao === 'ENVIO') Object.assign(dados, { forma: v.forma, email: v.email, data_hora: v.data_hora, protocolo: v.protocolo });
        if (acao === 'RECEBIMENTO') Object.assign(dados, { data: v.data, recebido_por: v.recebido_por });
        if (acao === 'CIENCIA') Object.assign(dados, { data_ciencia: v.data_ciencia, representante: v.representante, meio: v.meio });
        if (acao === 'ANALISE') Object.assign(dados, { resultado: v.resultado, resposta_id: ultimaResposta?.id ?? null, analise_resposta: ultimaResposta ? v.analise_resposta : null });
        if (acao === 'ENCAMINHAMENTO') Object.assign(dados, { autoridade: v.autoridade, processo: v.processo });
        await tramitar(n.id, acao, dados, v.justificativa || null);
      }
      toast.success('Andamento registrado.');
      await aoConcluir();
    } catch (e) { setErro(traduzirErro(e).mensagem ?? mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  const seletorDoc = (rotulo: string, obrigatorio?: boolean) => (
    <Selecao rotulo={rotulo} obrigatorio={obrigatorio} value={v.documento_id ?? ''} onChange={set('documento_id')}
      ajuda={!docs.data?.length ? `Anexe antes o arquivo em "${cat === 'ASSINADA' ? 'Documento assinado' : cat === 'RESPOSTA' ? 'Resposta e documentos da empresa' : 'Comprovantes'}".` : undefined}>
      <option value="">{obrigatorio ? 'Escolha o arquivo anexado…' : 'Sem comprovante anexado'}</option>{docs.data?.map((d) => <option key={d.id} value={d.id}>{d.nome_arquivo}</option>)}
    </Selecao>
  );
  return (
    <Modal aberto aoFechar={aoFechar} titulo={ACOES[acao].rotulo} largura="md"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Voltar</Botao><Botao carregando={ocupado} onClick={() => void enviar()}>Registrar</Botao></>}>
      <div className="flex flex-col gap-3">
        {acao === 'ASSINATURA' && <>
          <p className="text-sm text-slate-600">Imprima o documento, colha a assinatura e anexe o digitalizado; ou anexe o PDF assinado eletronicamente no sistema oficial. Uma imagem de assinatura colada não é assinatura digital.</p>
          <Selecao rotulo="Forma" value={v.forma} onChange={set('forma')}><option value="MANUAL_DIGITALIZADA">Assinatura manual (documento digitalizado)</option><option value="ELETRONICA_EXTERNA">Assinatura eletrônica em sistema oficial</option></Selecao>
          <Campo rotulo="Assinado por" obrigatorio value={v.assinado_por ?? ''} onChange={set('assinado_por')} />
          <Campo rotulo="Data da assinatura" type="date" value={v.data} onChange={set('data')} />
          {seletorDoc('Documento assinado', true)}
        </>}
        {acao === 'ENVIO' && <>
          <Selecao rotulo="Forma de envio" value={v.forma} onChange={set('forma')}>{Object.entries(FORMAS_ENVIO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</Selecao>
          {v.forma === 'EMAIL' && <Campo rotulo="E-mail do destinatário" type="email" obrigatorio value={v.email ?? ''} onChange={set('email')} />}
          <Campo rotulo="Data e hora do envio" type="datetime-local" obrigatorio value={v.data_hora} onChange={set('data_hora')} />
          <Campo rotulo="Protocolo / número do processo" value={v.protocolo ?? ''} onChange={set('protocolo')} />
          {seletorDoc('Comprovante de envio')}
          <p className="text-xs text-slate-500">O envio, sozinho, não comprova ciência: registre a ciência quando houver prova (assinatura do representante, confirmação de leitura no sistema oficial, AR...).</p>
        </>}
        {acao === 'RECUSA' && <AreaTexto rotulo="Descreva a recusa ou a impossibilidade de entrega" obrigatorio rows={3} value={v.justificativa ?? ''} onChange={set('justificativa')} />}
        {acao === 'RECEBIMENTO' && <>
          <Campo rotulo="Data do recebimento" type="date" obrigatorio value={v.data} onChange={set('data')} />
          <Campo rotulo="Recebido por" value={v.recebido_por ?? ''} onChange={set('recebido_por')} />
          {seletorDoc('Comprovante de recebimento')}
        </>}
        {acao === 'CIENCIA' && <>
          <Campo rotulo="Data da ciência" type="date" obrigatorio value={v.data_ciencia} onChange={set('data_ciencia')} ajuda="O prazo de regularização conta a partir desta data." />
          <Campo rotulo="Representante da empresa" value={v.representante ?? ''} onChange={set('representante')} />
          <Campo rotulo="Como a ciência foi comprovada" value={v.meio ?? ''} onChange={set('meio')} placeholder="Assinatura do representante no protocolo" />
          {seletorDoc('Comprovante da ciência')}
        </>}
        {acao === 'RESPOSTA' && <>
          <Campo rotulo="Data da resposta" type="date" obrigatorio value={v.data_resposta} onChange={set('data_resposta')} />
          <Campo rotulo="Recebida por / via" value={v.recebida_por ?? ''} onChange={set('recebida_por')} placeholder="Protocolo, e-mail, sistema oficial" />
          <AreaTexto rotulo="Justificativa / manifestação da empresa" obrigatorio rows={4} value={v.justificativa ?? ''} onChange={set('justificativa')} />
          <AreaTexto rotulo="Providências que a empresa informa ter adotado" rows={3} value={v.providencias ?? ''} onChange={set('providencias')} />
          <p className="text-xs text-slate-500">Anexe a resposta formal, fotos e documentos em "Resposta e documentos da empresa".</p>
        </>}
        {acao === 'INICIAR_ANALISE' && <p className="text-sm text-slate-600">Marca a notificação como em análise pela fiscalização.</p>}
        {acao === 'ANALISE' && <>
          {ultimaResposta && <Selecao rotulo="Resposta da empresa" value={v.analise_resposta} onChange={set('analise_resposta')}>
            <option value="ACEITA">Aceita</option><option value="PARCIALMENTE_ACEITA">Parcialmente aceita</option><option value="NAO_ACEITA">Não aceita</option></Selecao>}
          <Selecao rotulo="Resultado" value={v.resultado} onChange={set('resultado')}><option value="REGULARIZADA">Irregularidade corrigida (regularizada)</option><option value="NAO_REGULARIZADA">Irregularidade não corrigida</option></Selecao>
          <AreaTexto rotulo="Fundamentação da análise" obrigatorio rows={4} value={v.justificativa ?? ''} onChange={set('justificativa')} ajuda="O que foi verificado, quando e por quem. Se necessário, indique nova notificação ou encaminhamento." />
        </>}
        {acao === 'ENCAMINHAMENTO' && <>
          <Campo rotulo="Autoridade competente" obrigatorio value={v.autoridade ?? ''} onChange={set('autoridade')} placeholder="Secretário(a), assessoria jurídica…" />
          <Campo rotulo="Processo / protocolo do encaminhamento" value={v.processo ?? ''} onChange={set('processo')} />
          <AreaTexto rotulo="Justificativa do encaminhamento" obrigatorio rows={4} value={v.justificativa ?? ''} onChange={set('justificativa')} />
        </>}
        {acao === 'ENCERRAMENTO' && <AreaTexto rotulo="Justificativa do encerramento" obrigatorio rows={3} value={v.justificativa ?? ''} onChange={set('justificativa')} />}
        {acao === 'SANCAO' && <>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Registre apenas sanção efetivamente aplicada pela autoridade competente, em processo próprio com direito de defesa. A notificação não gera sanção.</p>
          <Selecao rotulo="Sanção" value={v.tipo} onChange={set('tipo')}>{Object.entries(SANCOES).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</Selecao>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Processo" obrigatorio value={v.processo ?? ''} onChange={set('processo')} />
            <Campo rotulo="Autoridade que decidiu" obrigatorio value={v.autoridade ?? ''} onChange={set('autoridade')} />
            <Campo rotulo="Data da decisão" type="date" obrigatorio value={v.data_decisao ?? ''} onChange={set('data_decisao')} />
            <Campo rotulo="Valor da multa (se houver)" value={v.valor ?? ''} onChange={set('valor')} placeholder="0,00" />
            <Campo rotulo="Vigência – início" type="date" value={v.vigencia_inicio ?? ''} onChange={set('vigencia_inicio')} />
            <Campo rotulo="Vigência – fim" type="date" value={v.vigencia_fim ?? ''} onChange={set('vigencia_fim')} />
          </div>
          <Campo rotulo="Fundamento" obrigatorio value={v.fundamento ?? ''} onChange={set('fundamento')} placeholder="Art. 156, II, da Lei nº 14.133/2021; cláusula ..." />
          <AreaTexto rotulo="Decisão" obrigatorio rows={3} value={v.decisao ?? ''} onChange={set('decisao')} />
        </>}
        {erro && <CaixaErro mensagem={erro} />}
      </div>
    </Modal>
  );
}
