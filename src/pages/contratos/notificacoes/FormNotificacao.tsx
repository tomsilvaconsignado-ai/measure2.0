// Formulário da notificação formal: dados do órgão, contrato e empresa vêm do banco (sem redigitar); o
// responsável descreve os fatos, anexa evidências, escolhe o tipo e os fundamentos, revisa o texto sugerido
// e emite. Quando algo não é seguro (regime, cláusula, fundamento), o sistema pede revisão em vez de supor.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, FileCheck2, RefreshCw, Save, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Selecao, cx } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarCpf, formatarData } from '@/lib/formatacao';
import { GRAVIDADES, PAPEIS, REGIMES, citacao, compor, declaraPenalidade, fundamentosDoRegime, type Gravidade, type Regime } from '@/lib/notificacaoFormal';
import { listarUnidadesAtendidas } from '@/services/cadastros';
import { catalogos, contexto, emitir, obter, salvar } from '@/services/notificacoesFormais';

const DIRETAS = ['DISPENSA', 'INEXIGIBILIDADE'];

interface Form {
  regime_juridico: Regime; regime_confirmado: boolean; tipo_id: string; gravidade: Gravidade; data_ocorrencia: string; local_ocorrencia: string;
  unidade_atendida: { id: string; rotulo: string } | null; fatos: string; obrigacoes: string; clausula: string; fundamentos: string[];
  fundamentacao: string; providencias: string; prazo_dias: string; prazo_tipo: 'CORRIDOS' | 'UTEIS'; prazo_resposta_dias: string;
  prazo_texto: string; consequencias: string; manifestacao: string; observacoes: string; revisao_juridica: boolean; revisao_confirmada: boolean;
}

const Dado = ({ r, v }: { r: string; v: ReactNode }) => <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{r}</dt><dd className="text-sm text-slate-900">{v || '—'}</dd></div>;

export function FormNotificacao() {
  const { orgao } = useSessao();
  const { id: idRota } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(idRota ?? null);
  const existente = useQuery({ queryKey: ['nf', idRota], queryFn: () => obter(idRota!), enabled: !!idRota });
  const contratoId = existente.data?.contrato_id ?? params.get('contrato');
  const ctx = useQuery({ queryKey: ['nf-contexto', contratoId], queryFn: () => contexto(contratoId!), enabled: !!contratoId });
  const cat = useQuery({ queryKey: ['nf-catalogos', orgao?.id], queryFn: () => catalogos(orgao!.id), enabled: !!orgao });
  const [f, setF] = useState<Form | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<'salvar' | 'emitir' | null>(null);
  const [erro, setErro] = useState<{ campo?: string; mensagem: string } | null>(null);

  // estado inicial: rascunho existente ou novo (regime do contrato, se cadastrado)
  useEffect(() => {
    if (f || !ctx.data || (idRota && !existente.data)) return;
    const n = existente.data;
    setF({
      regime_juridico: n?.regime_juridico ?? ctx.data.contrato.regime_juridico ?? 'LEI_14133', regime_confirmado: n?.regime_confirmado ?? false,
      tipo_id: n?.tipo_id ?? '', gravidade: n?.gravidade ?? 'MEDIA', data_ocorrencia: n?.data_ocorrencia ?? '', local_ocorrencia: n?.local_ocorrencia ?? '',
      unidade_atendida: null, fatos: n?.fatos ?? '', obrigacoes: n?.obrigacoes ?? '', clausula: n?.clausula ?? '', fundamentos: n?.fundamentos ?? [],
      fundamentacao: n?.fundamentacao ?? '', providencias: n?.providencias ?? '', prazo_dias: n?.prazo_dias ? String(n.prazo_dias) : '', prazo_tipo: n?.prazo_tipo ?? 'CORRIDOS',
      prazo_resposta_dias: n?.prazo_resposta_dias ? String(n.prazo_resposta_dias) : '', prazo_texto: n?.prazo_texto ?? '', consequencias: n?.consequencias ?? '',
      manifestacao: n?.manifestacao ?? '', observacoes: n?.observacoes ?? '', revisao_juridica: n?.revisao_juridica ?? false, revisao_confirmada: n?.revisao_confirmada ?? false,
    });
  }, [ctx.data, existente.data, f, idRota]);

  const fundsRegime = useMemo(() => (cat.data && f ? fundamentosDoRegime(cat.data.fundamentos, f.regime_juridico) : []), [cat.data, f]);
  const tipos = cat.data?.tipos.filter((t) => t.ativo) ?? [];
  const grupos = [...new Set(tipos.map((t) => t.grupo))];

  if (!contratoId) return <CaixaErro mensagem="Escolha o contrato pela tela de notificações." />;
  if (ctx.isError) return <CaixaErro mensagem={traduzirErro(ctx.error).mensagem} />;
  if (existente.data && !existente.data.pode_editar) return <CaixaErro mensagem="Esta notificação não pode mais ser editada (já emitida ou de outro responsável)." />;
  if (!ctx.data || !cat.data || !f || !orgao) return <Carregando />;
  const c = ctx.data;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  const escolherTipo = (tipoId: string) => {
    const t = tipos.find((x) => x.id === tipoId);
    setF((x) => x && ({ ...x, tipo_id: tipoId, fundamentos: t ? t.fundamentos.filter((cod) => fundsRegime.some((fr) => fr.codigo === cod)) : x.fundamentos,
      prazo_dias: x.prazo_dias || (t?.prazo_padrao_dias ? String(t.prazo_padrao_dias) : '') }));
  };
  const gerarTexto = () => {
    const r = compor({
      contratoNumero: c.contrato.numero, clausula: f.clausula, regime: f.regime_juridico, regimeDoContrato: c.contrato.regime_juridico, gravidade: f.gravidade,
      selecionados: fundsRegime.filter((x) => f.fundamentos.includes(x.codigo)), modelos: cat.data!.modelos, prazoDias: Number(f.prazo_dias) || null, prazoTipo: f.prazo_tipo,
      prazoRespostaDias: Number(f.prazo_resposta_dias) || null, contratacaoDireta: DIRETAS.includes(c.contrato.modalidade_codigo),
    });
    setF((x) => x && ({ ...x, fundamentacao: r.fundamentacao, prazo_texto: r.prazo_texto, consequencias: r.consequencias, manifestacao: r.manifestacao,
      revisao_juridica: r.revisao_juridica, revisao_confirmada: r.revisao_juridica ? false : x.revisao_confirmada }));
    setAvisos(r.avisos);
    toast.info('Texto sugerido gerado. Revise e adapte ao caso antes de emitir.');
  };
  const dados = () => ({
    id, contrato_id: c.contrato.id, regime_juridico: f.regime_juridico, regime_confirmado: f.regime_confirmado, tipo_id: f.tipo_id || null, gravidade: f.gravidade,
    data_ocorrencia: f.data_ocorrencia || null, local_ocorrencia: f.local_ocorrencia, unidade_atendida_id: f.unidade_atendida?.id ?? null,
    fatos: f.fatos, obrigacoes: f.obrigacoes, clausula: f.clausula, fundamentos: f.fundamentos, fundamentacao: f.fundamentacao, providencias: f.providencias,
    prazo_dias: f.prazo_dias || null, prazo_tipo: f.prazo_tipo, prazo_resposta_dias: f.prazo_resposta_dias || null, prazo_texto: f.prazo_texto,
    consequencias: f.consequencias, manifestacao: f.manifestacao, observacoes: f.observacoes, revisao_juridica: f.revisao_juridica, revisao_confirmada: f.revisao_confirmada,
  });
  const gravar = async () => {
    const novo = await salvar(dados());
    if (!id) { setId(novo); window.history.replaceState(null, '', `${import.meta.env.BASE_URL.replace(/\/$/, '')}/notificacoes-contratuais/${novo}/editar`); }
    await qc.invalidateQueries({ queryKey: ['nf-painel'] });
    return novo;
  };
  const acao = async (tipo: 'salvar' | 'emitir') => {
    setErro(null);
    if (tipo === 'emitir' && declaraPenalidade(f.consequencias)) { setErro({ campo: 'consequencias', mensagem: 'O texto não pode declarar a empresa já penalizada: indique só as consequências possíveis.' }); return; }
    setOcupado(tipo);
    try {
      const nid = await gravar();
      if (tipo === 'salvar') toast.success('Rascunho salvo.');
      else { await emitir(nid); toast.success('Notificação emitida. Agora imprima, assine e anexe o documento assinado.'); navegar(`/notificacoes-contratuais/${nid}`); }
    } catch (e) { const t = traduzirErro(e); setErro({ campo: t.campo, mensagem: t.mensagem ?? mensagemDeErro(e) }); }
    finally { setOcupado(null); }
  };
  const erroDe = (campo: string) => (erro?.campo === campo ? erro.mensagem : null);

  return (
    <>
      <CabecalhoPagina titulo={existente.data?.versao_de ? `Retificação – ${existente.data.versao}ª versão` : id ? 'Notificação em elaboração' : 'Nova notificação formal'}
        descricao={`Contrato nº ${c.contrato.numero} · ${c.fornecedor.razao_social}`}
        acoes={<Botao variante="secundario" icone={<ArrowLeft className="size-4" />} onClick={() => navegar(id ? `/notificacoes-contratuais/${id}` : '/notificacoes-contratuais')}>Voltar</Botao>} />

      {c.recorrencia.total > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p><b>ATENÇÃO:</b> este fornecedor possui {c.recorrencia.total} notificação(ões) anterior(es) registrada(s) no histórico contratual{c.recorrencia.neste_contrato ? ` (${c.recorrencia.neste_contrato} neste contrato)` : ''}
            {c.recorrencia.sancoes_vigentes ? ` e ${c.recorrencia.sancoes_vigentes} sanção(ões) vigente(s)` : ''}. Consulte as notificações anteriores antes de concluir a análise. A repetição não caracteriza, por si só, reincidência jurídica.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Administração">
          <dl className="grid gap-2">
            <Dado r="Órgão" v={(c.orgao.cabecalho ?? [c.orgao.nome_oficial]).join(' · ')} />
            <Dado r="Estrutura responsável" v={c.estrutura?.descricao ?? c.unidade.nome} />
            <Dado r="Emissor" v={`${c.emissor.nome}${c.emissor.matricula ? ` · mat. ${c.emissor.matricula}` : ''}`} />
            <Dado r="Cargo / condição" v={`${c.emissor.cargo ?? '—'} · ${PAPEIS[c.emissor.papel]}`} />
          </dl>
        </Cartao>
        <Cartao titulo="Empresa contratada">
          <dl className="grid gap-2">
            <Dado r="Razão social" v={`${c.fornecedor.razao_social}${c.fornecedor.nome_fantasia ? ` (${c.fornecedor.nome_fantasia})` : ''}`} />
            <Dado r={c.fornecedor.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} v={c.fornecedor.tipo_pessoa === 'PJ' ? formatarCnpj(c.fornecedor.documento) : formatarCpf(c.fornecedor.documento)} />
            <Dado r="Endereço" v={c.fornecedor.endereco} />
            <Dado r="Contato / representante" v={[c.fornecedor.representante, c.fornecedor.email, c.fornecedor.telefone].filter(Boolean).join(' · ')} />
          </dl>
        </Cartao>
        <Cartao titulo="Contrato">
          <dl className="grid grid-cols-2 gap-2">
            <Dado r="Número" v={c.contrato.numero} /><Dado r="Processo" v={c.contrato.processo_administrativo} />
            <Dado r="Contratação" v={`${c.contrato.modalidade}${c.contrato.numero_licitacao ? ` ${c.contrato.numero_licitacao}` : ''}`} /><Dado r="Assinatura" v={c.contrato.data_assinatura ? formatarData(c.contrato.data_assinatura) : 'não cadastrada'} />
            <Dado r="Vigência" v={`${formatarData(c.contrato.data_inicio)} a ${formatarData(c.contrato.data_fim)}`} /><Dado r="Valor atual" v={brl(c.contrato.valor_atual)} />
            <div className="col-span-2"><Dado r="Objeto" v={<span className="line-clamp-3">{c.contrato.objeto}</span>} /></div>
            <div className="col-span-2"><Dado r="Responsáveis" v={c.responsaveis.map((r) => `${PAPEIS[r.papel]?.split(' ')[0]}: ${r.nome}`).join(' · ')} /></div>
          </dl>
        </Cartao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Cartao titulo="Ocorrência">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selecao rotulo="Tipo de ocorrência" value={f.tipo_id} onChange={(e) => escolherTipo(e.target.value)} className="sm:col-span-2">
              <option value="">Escolha…</option>{grupos.map((g) => <optgroup key={g} label={g}>{tipos.filter((t) => t.grupo === g).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</optgroup>)}
            </Selecao>
            <Campo rotulo="Data da ocorrência" type="date" obrigatorio value={f.data_ocorrencia} onChange={(e) => set('data_ocorrencia', e.target.value)} erro={erroDe('data_ocorrencia')} />
            <Selecao rotulo="Gravidade (avaliação da fiscalização)" value={f.gravidade} onChange={(e) => set('gravidade', e.target.value as Gravidade)}>
              {Object.entries(GRAVIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
            <Campo rotulo="Local onde ocorreu" value={f.local_ocorrencia} onChange={(e) => set('local_ocorrencia', e.target.value)} maxLength={200} />
            <BuscaSelect rotulo="Unidade de saúde / setor relacionado" valor={f.unidade_atendida?.id ?? existente.data?.unidade_atendida_id ?? null} rotuloValor={f.unidade_atendida?.rotulo}
              chave={['unidades-atendidas-opcoes', orgao.id]} aoMudar={(v, o) => set('unidade_atendida', v && o ? { id: v, rotulo: o.rotulo } : null)}
              buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao.id, busca: t, situacao: 'ATIVOS', limite: 20, offset: 0 })).itens.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
            <AreaTexto className="sm:col-span-2" rotulo="1. Descrição detalhada dos fatos" obrigatorio rows={6} value={f.fatos} onChange={(e) => set('fatos', e.target.value)} erro={erroDe('fatos')}
              ajuda={`O que ocorreu, quando, onde, como foi constatado e por quem. ${f.fatos.trim().length}/80 caracteres mínimos.`} maxLength={8000} />
            <AreaTexto className="sm:col-span-2" rotulo="2. Obrigação contratual possivelmente descumprida" obrigatorio rows={3} value={f.obrigacoes} onChange={(e) => set('obrigacoes', e.target.value)} erro={erroDe('obrigacoes')} maxLength={3000} />
            <Campo rotulo="Cláusula contratual / item do termo de referência" value={f.clausula} onChange={(e) => set('clausula', e.target.value)} placeholder="Cláusula Sétima, item 7.3" maxLength={200} />
            <div />
            <AreaTexto className="sm:col-span-2" rotulo="4. Providências exigidas da empresa" obrigatorio rows={3} value={f.providencias} onChange={(e) => set('providencias', e.target.value)} erro={erroDe('providencias')} maxLength={3000} />
            <Campo rotulo="Prazo para regularização (dias)" type="number" min={1} max={365} obrigatorio value={f.prazo_dias} onChange={(e) => set('prazo_dias', e.target.value)} erro={erroDe('prazo_dias')}
              ajuda="Definido pela fiscalização conforme o contrato e a natureza da ocorrência (não é o prazo de defesa de 15 dias úteis)." />
            <Selecao rotulo="Contagem" value={f.prazo_tipo} onChange={(e) => set('prazo_tipo', e.target.value as 'CORRIDOS' | 'UTEIS')}>
              <option value="CORRIDOS">Dias corridos</option><option value="UTEIS">Dias úteis (feriados não descontados – confira)</option></Selecao>
            <Campo rotulo="Prazo para resposta da empresa (dias, opcional)" type="number" min={1} max={365} value={f.prazo_resposta_dias} onChange={(e) => set('prazo_resposta_dias', e.target.value)} />
            <AreaTexto className="sm:col-span-2" rotulo="Observações complementares" rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} maxLength={2000} />
          </div>
        </Cartao>
        <div className="flex flex-col gap-4">
          <Cartao titulo="Regime jurídico e fundamentos">
            <Selecao rotulo="Regime jurídico aplicável" value={f.regime_juridico} onChange={(e) => setF((x) => x && ({ ...x, regime_juridico: e.target.value as Regime, fundamentos: [] }))}
              ajuda={c.contrato.regime_juridico ? `Cadastrado no contrato: ${REGIMES[c.contrato.regime_juridico]}.` : 'Não cadastrado no contrato: confirme pelo processo de contratação (não pela data do contrato).'}>
              {Object.entries(REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
            <label className={cx('mt-2 flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm', erroDe('regime') && 'bg-red-50')}>
              <input type="checkbox" className="mt-0.5 size-4 accent-marca-700" checked={f.regime_confirmado} onChange={(e) => set('regime_confirmado', e.target.checked)} />
              Confirmo que este é o regime indicado no processo de contratação, observadas as regras de transição.</label>
            <p className="mb-1 mt-3 text-xs font-medium text-slate-600">Fundamentos (sugeridos pelo tipo de ocorrência)</p>
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {fundsRegime.map((fu) => (
                <li key={fu.codigo} className="border-b border-slate-100 px-2 py-1.5 last:border-0">
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-marca-700" checked={f.fundamentos.includes(fu.codigo)}
                      onChange={(e) => set('fundamentos', e.target.checked ? [...f.fundamentos, fu.codigo] : f.fundamentos.filter((x) => x !== fu.codigo))} />
                    <span><b>{citacao(fu)}</b>{fu.revisao_pendente && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">revisão jurídica</span>}<br /><span className="text-slate-600">{fu.texto}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <Botao className="mt-3 w-full" variante="secundario" icone={<Wand2 className="size-4" />} onClick={gerarTexto}>Gerar texto sugerido</Botao>
          </Cartao>
          {id ? <Cartao><Anexos recurso="notificacoes_contratuais" registroId={id} unidadeId={null} categoria="EVIDENCIA" titulo="Evidências (fotos, PDFs, relatórios, OS, medições)" podeGerenciar /></Cartao>
            : <Cartao><p className="text-sm text-slate-600">Salve o rascunho para anexar fotografias, relatórios técnicos, ordens de serviço e outros documentos comprobatórios.</p></Cartao>}
        </div>
      </div>

      <Cartao className="mt-4" titulo={<span className="inline-flex items-center gap-2"><FileCheck2 className="size-4" />Texto do documento (revise antes de emitir)</span>}
        acoes={<Botao pequeno variante="fantasma" icone={<RefreshCw className="size-4" />} onClick={gerarTexto}>Atualizar sugestão</Botao>}>
        {avisos.length > 0 && <ul className="mb-3 list-disc rounded-lg border border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
        <div className="grid gap-3">
          <AreaTexto rotulo="3. Da fundamentação legal" rows={6} value={f.fundamentacao} onChange={(e) => set('fundamentacao', e.target.value)} erro={erroDe('fundamentacao')} maxLength={8000} />
          <AreaTexto rotulo="5. Do prazo" rows={3} value={f.prazo_texto} onChange={(e) => set('prazo_texto', e.target.value)} maxLength={2000} />
          <AreaTexto rotulo="6. Das consequências do não atendimento" rows={7} value={f.consequencias} onChange={(e) => set('consequencias', e.target.value)} erro={erroDe('consequencias')}
            ajuda="Indique apenas as consequências juridicamente possíveis; a notificação não aplica penalidade." maxLength={6000} />
          <AreaTexto rotulo="7. Da manifestação da contratada" rows={3} value={f.manifestacao} onChange={(e) => set('manifestacao', e.target.value)} maxLength={3000} />
          {f.revisao_juridica && (
            <label className={cx('flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900', erroDe('revisao') && 'ring-2 ring-red-300')}>
              <input type="checkbox" className="mt-0.5 size-4 accent-marca-700" checked={f.revisao_confirmada} onChange={(e) => set('revisao_confirmada', e.target.checked)} />
              O sistema não identificou com segurança a cláusula, o regime ou o fundamento aplicável. Declaro que revisei o texto (se necessário, com a assessoria jurídica ou a autoridade competente).</label>
          )}
          {erro && <CaixaErro mensagem={erro.mensagem} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Botao variante="secundario" icone={<Save className="size-4" />} carregando={ocupado === 'salvar'} disabled={!!ocupado} onClick={() => void acao('salvar')}>Salvar rascunho</Botao>
            <Botao icone={<FileCheck2 className="size-4" />} carregando={ocupado === 'emitir'} disabled={!!ocupado} onClick={() => void acao('emitir')}>Emitir notificação</Botao>
          </div>
        </div>
      </Cartao>
    </>
  );
}
