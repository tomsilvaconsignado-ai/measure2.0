import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Play, Plus, XCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { CadastradoPor, useAutoria } from '@/lib/autoria';
import { Anexos } from '@/components/Anexos';
import { SeletorUnidadeOrg } from '@/components/CamposEndereco';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { MultiBusca, type Item } from '@/components/ui/MultiBusca';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarData } from '@/lib/formatacao';
import { listarTiposServico, listarUnidadesAtendidas } from '@/services/cadastros';
import { listarOs, numeroOs, salvarOs, unidadesDaOs, type OrdemServico } from '@/services/relatorios';
import { SeletorContrato, SeletorServidor } from './contratos/comum';

const POR_PAGINA = 25;
const STATUS: Record<OrdemServico['status'], [string, 'info' | 'alerta' | 'sucesso' | 'neutro']> = {
  ABERTA: ['Aberta', 'info'], EM_ANDAMENTO: ['Em andamento', 'alerta'], CONCLUIDA: ['Concluída', 'sucesso'], CANCELADA: ['Cancelada', 'neutro'],
};
const PRIORIDADES: Record<OrdemServico['prioridade'], string> = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente' };

function FormOs({ aberto, aoFechar, os }: { aberto: boolean; aoFechar: () => void; os: OrdemServico | null }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const tipos = useQuery({ queryKey: ['tipos-servico', orgao?.id], queryFn: () => listarTiposServico(orgao!.id), enabled: !!orgao });
  const atuais = useQuery({ queryKey: ['os-unidades', os?.id], queryFn: () => unidadesDaOs(os!.id), enabled: aberto && !!os });
  const [f, setF] = useState({ titulo: '', descricao: '', prioridade: 'MEDIA', tipo_servico_id: '', previsao: '', observacoes: '', data_abertura: '' });
  const [unidade, setUnidade] = useState<{ id: string; rotulo: string } | null>(null);
  const [contrato, setContrato] = useState<{ id: string; rotulo: string } | null>(null);
  const [resp, setResp] = useState<{ id: string; rotulo: string } | null>(null);
  const [unidades, setUnidades] = useState<Item[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF({ titulo: os?.titulo ?? '', descricao: os?.descricao ?? '', prioridade: os?.prioridade ?? 'MEDIA', tipo_servico_id: os?.tipo_servico_id ?? '',
      previsao: os?.previsao ?? '', observacoes: os?.observacoes ?? '', data_abertura: os?.data_abertura ?? new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }) });
    setUnidade(os ? { id: os.unidade_id, rotulo: os.unidade ? `${os.unidade.nome}${os.unidade.sigla ? ` (${os.unidade.sigla})` : ''}` : 'Unidade atual' } : null);
    setContrato(os?.contrato_id ? { id: os.contrato_id, rotulo: os.contrato?.numero ?? 'Contrato' } : null);
    setResp(os?.responsavel_id ? { id: os.responsavel_id, rotulo: 'Responsável atual' } : null);
    setUnidades([]);
  }, [aberto, os]);
  useEffect(() => { if (atuais.data) setUnidades(atuais.data.map((u) => ({ id: u.id, rotulo: u.nome }))); }, [atuais.data]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const salvar = useMutation({
    mutationFn: () => salvarOs(os?.id ?? null, {
      tenant_id: orgao!.id, unidade_id: unidade!.id, titulo: f.titulo.trim(), descricao: f.descricao.trim() || null, prioridade: f.prioridade as OrdemServico['prioridade'],
      tipo_servico_id: f.tipo_servico_id || null, previsao: f.previsao || null, observacoes: f.observacoes.trim() || null, data_abertura: f.data_abertura,
      contrato_id: contrato?.id ?? null, responsavel_id: resp?.id ?? null,
    }, unidades.map((u) => u.id)),
    onSuccess: async (o) => { await qc.invalidateQueries({ queryKey: ['os'] }); toast.success(os ? 'OS atualizada.' : `OS ${numeroOs(o)} aberta.`); aoFechar(); },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (f.titulo.trim().length < 3) n.titulo = 'Descreva o serviço em poucas palavras.';
    if (!unidade) n.unidade_id = 'Escolha a unidade responsável.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={os ? `Editar OS ${numeroOs(os)}` : 'Nova ordem de serviço'} largura="lg"
      descricao={os ? undefined : 'O número (NNNN/ANO) é gerado automaticamente ao salvar.'}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-os" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-os" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Campo className="sm:col-span-2" rotulo="Título" obrigatorio value={f.titulo} onChange={set('titulo')} erro={erros.titulo} maxLength={200} placeholder="Ex.: Reparo elétrico no consultório 3" />
        <div className="sm:col-span-2"><SeletorUnidadeOrg rotulo="Unidade responsável" obrigatorio valor={unidade?.id ?? null} rotuloValor={unidade?.rotulo} erro={erros.unidade_id}
          aoMudar={(v, r) => setUnidade(v ? { id: v, rotulo: r ?? '' } : null)} /></div>
        <div className="sm:col-span-2">
          <MultiBusca rotulo="Unidade(s) atendida(s)" itens={unidades} aoMudar={setUnidades} chave={['os-ua', orgao?.id]}
            buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao!.id, busca: t, situacao: 'ATIVOS', limite: 20, offset: 0 })).itens.map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.tipo }))} />
        </div>
        <Selecao rotulo="Tipo de serviço" value={f.tipo_servico_id} onChange={set('tipo_servico_id')}>
          <option value="">—</option>{tipos.data?.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </Selecao>
        <Selecao rotulo="Prioridade" value={f.prioridade} onChange={set('prioridade')}>{Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
        <SeletorContrato valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} aoMudar={(v, o) => setContrato(v && o ? { id: v, rotulo: o.rotulo } : null)} />
        <SeletorServidor rotulo="Responsável pela execução" valor={resp?.id ?? null} rotuloValor={resp?.rotulo} aoMudar={(v, o) => setResp(v && o ? { id: v, rotulo: o.rotulo } : null)} />
        <Campo rotulo="Data de abertura" type="date" value={f.data_abertura} onChange={set('data_abertura')} disabled={!!os} />
        <Campo rotulo="Previsão de conclusão" type="date" value={f.previsao} onChange={set('previsao')} />
        <AreaTexto className="sm:col-span-2" rotulo="Descrição" value={f.descricao} onChange={set('descricao')} maxLength={4000} rows={4} />
        <AreaTexto className="sm:col-span-2" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} />
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

function DetalheOs({ os, aoFechar, aoEditar }: { os: OrdemServico | null; aoFechar: () => void; aoEditar: (o: OrdemServico) => void }) {
  const { pode } = useSessao();
  const podeAlterar = useAutoria();
  const qc = useQueryClient();
  const unidades = useQuery({ queryKey: ['os-unidades', os?.id], queryFn: () => unidadesDaOs(os!.id), enabled: !!os });
  const [cancelando, setCancelando] = useState(false);
  const mudar = useMutation({
    mutationFn: (status: OrdemServico['status']) => salvarOs(os!.id, { status }, null),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['os'] }); toast.success('Situação atualizada.'); aoFechar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  if (!os) return null;
  const editavel = pode('ordens_servico', 'editar') && podeAlterar('ordens_servico', os.criado_por) && !['CONCLUIDA', 'CANCELADA'].includes(os.status);
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`OS ${numeroOs(os)} – ${os.titulo}`} largura="lg"
      rodape={editavel && <>
        <Botao variante="fantasma" icone={<XCircle className="size-4" />} onClick={() => setCancelando(true)}>Cancelar OS</Botao>
        <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={() => aoEditar(os)}>Editar</Botao>
        {os.status === 'ABERTA' && <Botao variante="secundario" icone={<Play className="size-4" />} carregando={mudar.isPending} onClick={() => mudar.mutate('EM_ANDAMENTO')}>Iniciar</Botao>}
        <Botao icone={<CheckCircle2 className="size-4" />} carregando={mudar.isPending} onClick={() => mudar.mutate('CONCLUIDA')}>Concluir</Botao>
      </>}>
      <CadastradoPor autor={os.criado_por} recurso="ordens_servico" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" />
      <div className="mb-3 flex flex-wrap gap-2"><Selo tom={STATUS[os.status][1]}>{STATUS[os.status][0]}</Selo><Selo>Prioridade {PRIORIDADES[os.prioridade].toLowerCase()}</Selo></div>
      <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Abertura</dt><dd>{formatarData(os.data_abertura)}</dd></div>
        <div><dt className="text-xs text-slate-500">Previsão</dt><dd>{formatarData(os.previsao)}</dd></div>
        <div><dt className="text-xs text-slate-500">Conclusão</dt><dd>{formatarData(os.data_conclusao)}</dd></div>
        <div><dt className="text-xs text-slate-500">Unidade responsável</dt><dd>{os.unidade?.sigla ?? os.unidade?.nome}</dd></div>
        <div><dt className="text-xs text-slate-500">Tipo de serviço</dt><dd>{os.tipo_servico?.nome ?? '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Contrato</dt><dd>{os.contrato?.numero ?? '—'}</dd></div>
        <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Unidades atendidas</dt><dd>{unidades.data?.map((u) => u.nome).join(', ') || '—'}</dd></div>
        {os.descricao && <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Descrição</dt><dd className="whitespace-pre-line">{os.descricao}</dd></div>}
        {os.motivo_cancelamento && <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Motivo do cancelamento</dt><dd>{os.motivo_cancelamento}</dd></div>}
      </dl>
      <Anexos recurso="ordens_servico" registroId={os.id} unidadeId={os.unidade_id} titulo="Fotos e documentos da OS" />
      <ConfirmarComMotivo aberto={cancelando} aoFechar={() => setCancelando(false)} titulo={`Cancelar a OS ${numeroOs(os)}?`}
        descricao="A OS fica registrada como cancelada, com o motivo. Não pode ser reaberta." rotuloConfirmar="Cancelar OS"
        aoConfirmar={async (m) => { await salvarOs(os.id, { status: 'CANCELADA', motivo_cancelamento: m }, null); await qc.invalidateQueries({ queryKey: ['os'] }); toast.success('OS cancelada.'); aoFechar(); }} />
    </Modal>
  );
}

export function OrdensServico() {
  const { orgao, pode } = useSessao();
  const [aba, setAba] = useState<'ABERTAS' | 'CONCLUIDA' | 'CANCELADA' | 'TODAS'>('ABERTAS');
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<OrdemServico | null | 'nova'>(null);
  const [vendo, setVendo] = useState<OrdemServico | null>(null);
  useEffect(() => setPagina(0), [aba, termo]);
  const q = useQuery({
    queryKey: ['os', orgao?.id, aba, termo, pagina], enabled: !!orgao && pode('ordens_servico', 'ler'), placeholderData: (a) => a,
    queryFn: async () => {
      if (aba !== 'ABERTAS') return listarOs({ tenantId: orgao!.id, busca: termo, status: aba === 'TODAS' ? null : aba, limite: POR_PAGINA, offset: pagina * POR_PAGINA });
      const [a, b] = await Promise.all([
        listarOs({ tenantId: orgao!.id, busca: termo, status: 'ABERTA', limite: 200, offset: 0 }),
        listarOs({ tenantId: orgao!.id, busca: termo, status: 'EM_ANDAMENTO', limite: 200, offset: 0 }),
      ]);
      const itens = [...b.itens, ...a.itens].sort((x, y) => y.ano - x.ano || y.numero - x.numero);
      return { itens: itens.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA), total: itens.length };
    },
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('ordens_servico', 'ler')) return <SemPermissao />;
  return (
    <>
      <CabecalhoPagina titulo="Ordens de serviço" descricao="Numeração NNNN/ANO automática por órgão. Concluídas e canceladas ficam no histórico."
        acoes={pode('ordens_servico', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('nova')}>Nova OS</Botao>} />
      <Cartao>
        <Abas abas={[{ id: 'ABERTAS', rotulo: 'Em aberto' }, { id: 'CONCLUIDA', rotulo: 'Concluídas' }, { id: 'CANCELADA', rotulo: 'Canceladas' }, { id: 'TODAS', rotulo: 'Todas' }]} ativa={aba} aoMudar={setAba} />
        <div className="mb-4 max-w-md"><CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número (ex.: 12 ou 12/2026), título ou descrição" rotulo="Buscar OS" /></div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data!.itens.length ? <Vazio titulo="Nenhuma ordem de serviço" /> : (
          <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
            {q.data!.itens.map((o) => (
              <li key={o.id}><button className="flex w-full flex-wrap items-center gap-3 py-3 text-left" onClick={() => setVendo(o)}>
                <span className="numero w-24 font-mono text-sm font-semibold text-slate-900">{numeroOs(o)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{o.titulo}</span>
                  <span className="block truncate text-xs text-slate-500">{o.unidade?.sigla ?? o.unidade?.nome} · aberta em {formatarData(o.data_abertura)}{o.tipo_servico ? ` · ${o.tipo_servico.nome}` : ''}</span></span>
                {['ALTA', 'URGENTE'].includes(o.prioridade) && o.status !== 'CONCLUIDA' && <Selo tom="perigo">{PRIORIDADES[o.prioridade]}</Selo>}
                <Selo tom={STATUS[o.status][1]}>{STATUS[o.status][0]}</Selo>
              </button></li>
            ))}
          </ul>
        )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
      <FormOs aberto={editando !== null} aoFechar={() => setEditando(null)} os={editando === 'nova' ? null : editando} />
      <DetalheOs os={vendo} aoFechar={() => setVendo(null)} aoEditar={(o) => { setVendo(null); setEditando(o); }} />
    </>
  );
}
