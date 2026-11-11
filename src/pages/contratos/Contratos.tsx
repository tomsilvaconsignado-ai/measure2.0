import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { SeletorUnidadeOrg } from '@/components/CamposEndereco';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { BarraUso, CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { brl, centavos, decimalDeCentavos, formatarData } from '@/lib/formatacao';
import type { Contrato, ContratoResumo } from '@/lib/tipos';
import { contarSituacoes, listarContratos, listarDesignacoes, listarDotacoesContrato, modalidades, obterContrato, regimeDoContrato, salvarContrato, type FiltroSituacao } from '@/services/execucao';
import { SeletorFornecedor, SeloSituacao } from './comum';

const POR_PAGINA = 20;

export function FormContrato({ aberto, aoFechar, contrato }: { aberto: boolean; aoFechar: () => void; contrato: ContratoResumo | null }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const mods = useQuery({ queryKey: ['modalidades'], queryFn: modalidades, staleTime: Infinity });
  const [f, setF] = useState({ numero: '', modalidade: '', processo_administrativo: '', numero_licitacao: '', objeto: '', data_inicio: '', data_fim: '', observacoes: '', regime_juridico: '', data_assinatura: '' });
  const extra = useQuery({ queryKey: ['contrato-regime', contrato?.id], queryFn: () => regimeDoContrato(contrato!.id), enabled: aberto && !!contrato });
  const [valor, setValor] = useState<number | null>(null);
  const [forn, setForn] = useState<{ id: string; rotulo: string } | null>(null);
  const [unid, setUnid] = useState<{ id: string; rotulo: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    const c = contrato;
    setF({ numero: c?.numero ?? '', modalidade: c?.modalidade ?? '', processo_administrativo: c?.processo_administrativo ?? '', numero_licitacao: c?.numero_licitacao ?? '',
      objeto: c?.objeto ?? '', data_inicio: c?.data_inicio ?? '', data_fim: c?.data_fim ?? '', observacoes: c?.observacoes ?? '', regime_juridico: '', data_assinatura: '' });
    setValor(c ? centavos(c.valor_global) : null);
    setForn(c ? { id: c.fornecedor_id, rotulo: c.fornecedor_nome } : null);
    setUnid(c ? { id: c.unidade_id, rotulo: `${c.unidade_nome}${c.unidade_sigla ? ` (${c.unidade_sigla})` : ''}` } : null);
  }, [aberto, contrato]);
  useEffect(() => { if (extra.data) setF((x) => ({ ...x, regime_juridico: extra.data.regime_juridico ?? '', data_assinatura: extra.data.data_assinatura ?? '' })); }, [extra.data]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const mod = mods.data?.find((m) => m.codigo === f.modalidade);

  const salvar = useMutation({
    mutationFn: () => salvarContrato(contrato?.id ?? null, {
      tenant_id: orgao!.id, unidade_id: unid!.id, fornecedor_id: forn!.id, numero: f.numero.trim(), modalidade: f.modalidade,
      processo_administrativo: f.processo_administrativo.trim() || null, numero_licitacao: f.numero_licitacao.trim() || null,
      objeto: f.objeto.trim(), data_inicio: f.data_inicio, data_fim: f.data_fim, valor_global: decimalDeCentavos(valor!), observacoes: f.observacoes.trim() || null,
      regime_juridico: (f.regime_juridico || null) as Contrato['regime_juridico'], data_assinatura: f.data_assinatura || null,
    }),
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ['contratos'] });
      await qc.invalidateQueries({ queryKey: ['contrato', c.id] });
      toast.success(contrato ? 'Contrato atualizado.' : 'Contrato cadastrado. Agora inclua os responsáveis e a dotação.');
      aoFechar();
      if (!contrato) navegar(`/contratos/${c.id}`);
    },
    onError: (e) => {
      const msg = (e as Error).message ?? '';
      if (/contratos_numero_unico/.test(msg)) setErros({ numero: 'Já existe um contrato com este número neste órgão.' });
      else if (/contratos_check/.test(msg)) setErros({ data_fim: 'A data final não pode ser anterior à inicial.' });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.numero.trim()) n.numero = 'Informe o número do contrato.';
    if (!f.modalidade) n.modalidade = 'Escolha a modalidade.';
    if (!forn) n.fornecedor_id = 'Escolha o fornecedor.';
    if (!unid) n.unidade_id = 'Escolha a unidade responsável.';
    if (f.objeto.trim().length < 3) n.objeto = 'Descreva o objeto.';
    if (!f.data_inicio) n.data_inicio = 'Informe o início da vigência.';
    if (!f.data_fim) n.data_fim = 'Informe o fim da vigência.';
    else if (f.data_inicio && f.data_fim < f.data_inicio) n.data_fim = 'A data final não pode ser anterior à inicial.';
    if (!valor || valor <= 0) n.valor_global = 'Informe o valor global.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={contrato ? `Editar contrato ${contrato.numero}` : 'Novo contrato'} largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-contrato" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-contrato" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Campo rotulo="Número do contrato" obrigatorio value={f.numero} onChange={set('numero')} erro={erros.numero} maxLength={40} placeholder="001/2026" />
        <Selecao rotulo="Modalidade" obrigatorio value={f.modalidade} onChange={set('modalidade')} erro={erros.modalidade} ajuda={mod?.descricao}>
          <option value="">Escolha…</option>{mods.data?.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
        </Selecao>
        <div className="sm:col-span-2">
          <SeletorFornecedor obrigatorio valor={forn?.id ?? null} rotuloValor={forn?.rotulo} erro={erros.fornecedor_id}
            aoMudar={(v, o) => setForn(v && o ? { id: v, rotulo: o.rotulo } : null)} />
        </div>
        <div className="sm:col-span-2">
          <SeletorUnidadeOrg rotulo="Unidade responsável (Coordenação)" obrigatorio valor={unid?.id ?? null} rotuloValor={unid?.rotulo} erro={erros.unidade_id}
            aoMudar={(v, r) => setUnid(v ? { id: v, rotulo: r ?? '' } : null)} ajuda="Define quem administra o contrato (a unidade e as que estão acima dela)." />
        </div>
        <Campo rotulo="Processo administrativo" value={f.processo_administrativo} onChange={set('processo_administrativo')} maxLength={60} placeholder="000.000/0000" />
        <Campo rotulo="Pregão / licitação" value={f.numero_licitacao} onChange={set('numero_licitacao')} maxLength={60} placeholder="Pregão eletrônico 10/2025" />
        <AreaTexto className="sm:col-span-2" rotulo="Objeto" obrigatorio value={f.objeto} onChange={set('objeto')} erro={erros.objeto} maxLength={4000} rows={3} />
        <Campo rotulo="Início da vigência" type="date" obrigatorio value={f.data_inicio} onChange={set('data_inicio')} erro={erros.data_inicio} />
        <Campo rotulo="Fim da vigência" type="date" obrigatorio value={f.data_fim} onChange={set('data_fim')} erro={erros.data_fim}
          ajuda={contrato?.aditivos_aprovados ? 'Prorrogações por aditivo ficam no aditivo; este é o prazo original.' : undefined} />
        <CampoMoeda rotulo="Valor global" obrigatorio centavos={valor} aoMudar={setValor} erro={erros.valor_global}
          ajuda={contrato?.aditivos_aprovados ? 'Valor original; acréscimos e supressões ficam nos aditivos.' : undefined} />
        <Selecao rotulo="Regime jurídico da contratação" value={f.regime_juridico} onChange={set('regime_juridico')} ajuda="Conforme o processo de contratação e as regras de transição (não pela data). Usado nas notificações formais.">
          <option value="">Não informado</option><option value="LEI_14133">Lei nº 14.133/2021</option><option value="LEI_8666">Lei nº 8.666/1993 (regime anterior)</option><option value="OUTRO">Outro</option>
        </Selecao>
        <Campo rotulo="Data de assinatura" type="date" value={f.data_assinatura} onChange={set('data_assinatura')} />
        <AreaTexto className="sm:col-span-2" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} />
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

export function Contratos() {
  const { orgao, pode } = useSessao();
  const navegar = useNavigate();
  const qc = useQueryClient();
  // a ficha começa a carregar ao passar o mouse: no clique os dados já estão chegando (ficam 30 s no cache)
  const adiantar = (id: string) => {
    void qc.prefetchQuery({ queryKey: ['contrato', id], queryFn: () => obterContrato(id) });
    void qc.prefetchQuery({ queryKey: ['designacoes', id], queryFn: () => listarDesignacoes(id) });
    void qc.prefetchQuery({ queryKey: ['contrato-dotacoes', id], queryFn: () => listarDotacoesContrato(id) });
  };
  const [aba, setAba] = useState<FiltroSituacao>('VIGENTES');
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [forn, setForn] = useState<{ id: string; rotulo: string } | null>(null);
  const [pagina, setPagina] = useState(0);
  const [novo, setNovo] = useState(false);
  useEffect(() => setPagina(0), [aba, termo, forn]);
  const contagem = useQuery({ queryKey: ['contratos', 'contagem', orgao?.id], queryFn: () => contarSituacoes(orgao!.id), enabled: !!orgao });
  const q = useQuery({
    queryKey: ['contratos', orgao?.id, aba, termo, forn?.id, pagina],
    queryFn: () => listarContratos({ tenantId: orgao!.id, situacao: aba, busca: termo, fornecedorId: forn?.id, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao, placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  const c = contagem.data;

  return (
    <>
      <CabecalhoPagina titulo="Contratos" descricao="Ordenados pelo fornecedor (A–Z) e, dentro dele, pelo número. A situação é calculada pelas datas e pelos aditivos aprovados."
        acoes={pode('contratos', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>Novo contrato</Botao>} />
      <Cartao>
        <Abas abas={[
          { id: 'VIGENTES', rotulo: <>Contratos vigentes {c && <span className="numero ml-1 rounded bg-slate-100 px-1.5 text-xs">{c.VIGENTE + c.A_VENCER + c.NAO_INICIADO}</span>}</> },
          { id: 'VENCIDOS', rotulo: <>Contratos vencidos {c && <span className="numero ml-1 rounded bg-slate-100 px-1.5 text-xs">{c.VENCIDO}</span>}</> },
          { id: 'TODOS', rotulo: 'Todos' },
        ]} ativa={aba} aoMudar={setAba} />
        {c && c.A_VENCER > 0 && aba !== 'VENCIDOS' && <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">{c.A_VENCER} contrato(s) perto do vencimento.</p>}
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_20rem_auto] sm:items-end">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número, objeto, fornecedor ou processo" rotulo="Buscar contrato" />
          <SeletorFornecedor valor={forn?.id ?? null} rotuloValor={forn?.rotulo} aoMudar={(v, o) => setForn(v && o ? { id: v, rotulo: o.rotulo } : null)} />
          {(busca || forn) && <Botao variante="fantasma" onClick={() => { setBusca(''); setForn(null); }}>Limpar filtros</Botao>}
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          !q.data!.itens.length ? <Vazio titulo={aba === 'VENCIDOS' ? 'Nenhum contrato vencido' : 'Nenhum contrato encontrado'} /> : (
            <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
              {q.data!.itens.map((ct) => {
                const total = centavos(ct.valor_atual);
                return (
                  <li key={ct.id}>
                    <button className="grid w-full gap-2 py-3 text-left sm:grid-cols-[1fr_16rem] sm:items-center" onClick={() => navegar(`/contratos/${ct.id}`)}
                      onMouseEnter={() => adiantar(ct.id)} onFocus={() => adiantar(ct.id)}>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                          {ct.fornecedor_nome}<span className="font-normal text-slate-500">· Contrato {ct.numero}</span>
                          <SeloSituacao situacao={ct.situacao} dias={ct.dias_para_vencer} />
                          {ct.numero_renovacao > 0 && <span className="text-xs text-slate-500">{ct.numero_renovacao}ª renovação</span>}
                        </p>
                        <p className="line-clamp-1 text-sm text-slate-600">{ct.objeto}</p>
                        <p className="text-xs text-slate-500">{formatarData(ct.data_inicio)} a {formatarData(ct.data_fim_atual)} · {ct.unidade_sigla ?? ct.unidade_nome}</p>
                      </div>
                      <div>
                        <p className="numero mb-1 text-right text-sm"><span className="text-slate-500">Saldo </span><span className="font-semibold">{brl(ct.saldo)}</span><span className="text-slate-500"> de {brl(ct.valor_atual)}</span></p>
                        <BarraUso usado={centavos(ct.notas_valor)} total={total} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
      <FormContrato aberto={novo} aoFechar={() => setNovo(false)} contrato={null} />
    </>
  );
}
