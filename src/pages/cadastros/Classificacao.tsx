import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import type { Classificador, ClassificadorTipo, ClassificacaoOrcamentaria, TipoClassificador } from '@/lib/tipos';
import {
  definirStatusClassificacao, definirStatusClassificador, listarClassificacoes, listarClassificadores, obterClassificadores,
  salvarClassificacao, salvarClassificador, tiposClassificador,
} from '@/services/cadastros';

const POR_PAGINA = 25;
const NATUREZAS = { PROJETO: 'Projeto', ATIVIDADE: 'Atividade', OPERACAO_ESPECIAL: 'Operação especial' } as const;
// campo da dotação → tipo de classificador
const CAMPOS: Array<[keyof ClassificacaoOrcamentaria, TipoClassificador, boolean]> = [
  ['orgao_id', 'ORGAO', false], ['unidade_orcamentaria_id', 'UNIDADE_ORCAMENTARIA', false], ['funcao_id', 'FUNCAO', false],
  ['subfuncao_id', 'SUBFUNCAO', false], ['programa_id', 'PROGRAMA', false], ['acao_id', 'ACAO', true],
  ['categoria_economica_id', 'CATEGORIA_ECONOMICA', false], ['gnd_id', 'GND', false], ['modalidade_id', 'MODALIDADE', false],
  ['elemento_id', 'ELEMENTO', true], ['subelemento_id', 'SUBELEMENTO', false], ['fonte_id', 'FONTE', true], ['detalhamento_fonte_id', 'DETALHAMENTO_FONTE', false],
];
// dependências: o filho só lista opções do pai escolhido
const PAI_DO_CAMPO: Partial<Record<keyof ClassificacaoOrcamentaria, keyof ClassificacaoOrcamentaria>> = {
  subelemento_id: 'elemento_id', detalhamento_fonte_id: 'fonte_id', acao_id: 'programa_id', unidade_orcamentaria_id: 'orgao_id',
};

const rotuloClassificador = (c: Pick<Classificador, 'codigo' | 'descricao'>) => `${c.codigo} – ${c.descricao}`;

function useTipos() {
  return useQuery({ queryKey: ['classificador-tipos'], queryFn: tiposClassificador, staleTime: Infinity });
}

// ---------------------------------------------------------------- classificadores

function FormClassificador({ tipo, tipos, item, aoFechar }: { tipo: ClassificadorTipo; tipos: ClassificadorTipo[]; item: Classificador | null | 'novo'; aoFechar: () => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [pai, setPai] = useState<{ id: string; rotulo: string } | null>(null);
  const [natureza, setNatureza] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const aberto = item !== null;
  const atual = item === 'novo' ? null : item;
  const tipoPai = tipos.find((t) => t.codigo === tipo.pai_tipo);
  const paiAtual = useQuery({ queryKey: ['classificador', atual?.pai_id], queryFn: () => obterClassificadores([atual!.pai_id!]), enabled: !!atual?.pai_id });
  useEffect(() => {
    if (!aberto) return;
    setErros({}); setCodigo(atual?.codigo ?? ''); setDescricao(atual?.descricao ?? ''); setNatureza(atual?.natureza_acao ?? '');
    setPai(null);
  }, [aberto, atual]);
  useEffect(() => { const p = paiAtual.data?.[0]; if (p) setPai({ id: p.id, rotulo: rotuloClassificador(p) }); }, [paiAtual.data]);

  const salvar = useMutation({
    mutationFn: () => salvarClassificador(atual?.id ?? null, {
      tenant_id: orgao!.id, tipo: tipo.codigo, codigo: codigo.trim(), descricao: descricao.trim(), pai_id: pai?.id ?? null,
      natureza_acao: tipo.codigo === 'ACAO' && natureza ? natureza as Classificador['natureza_acao'] : null,
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['classificadores'] }); toast.success(`${tipo.nome} salvo.`); aoFechar(); },
    onError: (e) => {
      if (/classificadores_codigo_unico/.test((e as Error).message ?? '')) setErros({ codigo: `Já existe ${tipo.nome.toLowerCase()} com este código${tipoPai ? ` em ${tipoPai.nome.toLowerCase()}` : ''}.` });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={`${atual ? 'Editar' : 'Novo'}: ${tipo.nome}`}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao carregando={salvar.isPending} disabled={!codigo.trim() || descricao.trim().length < 2 || (tipo.pai_obrigatorio && !pai)} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Código" obrigatorio value={codigo} onChange={(e) => setCodigo(e.target.value)} erro={erros.codigo} maxLength={30} placeholder={tipo.codigo === 'ACAO' ? '2090' : ''} />
        <Campo className="sm:col-span-2" rotulo="Descrição" obrigatorio value={descricao} onChange={(e) => setDescricao(e.target.value)} erro={erros.descricao} maxLength={300} />
        {tipoPai && (
          <div className="sm:col-span-3">
            <BuscaSelect rotulo={tipoPai.nome} obrigatorio={tipo.pai_obrigatorio} valor={pai?.id ?? null} rotuloValor={pai?.rotulo} erro={erros.pai_id}
              aoMudar={(v, o) => setPai(v && o ? { id: v, rotulo: o.rotulo } : null)} chave={['classificadores-opcoes', orgao?.id, tipoPai.codigo]}
              ajuda={tipo.pai_obrigatorio ? undefined : 'Opcional.'}
              buscar={async (t) => (await listarClassificadores({ tenantId: orgao!.id, tipo: tipoPai.codigo, busca: t, somenteAtivos: true, limite: 30 })).itens
                .map((c) => ({ valor: c.id, rotulo: rotuloClassificador(c) }))} />
          </div>
        )}
        {tipo.codigo === 'ACAO' && (
          <Selecao className="sm:col-span-3" rotulo="Natureza" value={natureza} onChange={(e) => setNatureza(e.target.value)}
            ajuda="Em branco: definida pelo 1º dígito do código (1 = projeto, 2 = atividade, 0 = operação especial).">
            <option value="">Automática</option>{Object.entries(NATUREZAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
        )}
        {erros.geral && <div className="sm:col-span-3"><CaixaErro mensagem={erros.geral} /></div>}
      </div>
    </Modal>
  );
}

function Classificadores() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const tipos = useTipos();
  const [tipo, setTipo] = useState<TipoClassificador>('ACAO');
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Classificador | null | 'novo'>(null);
  const [alternando, setAlternando] = useState<Classificador | null>(null);
  useEffect(() => setPagina(0), [tipo, termo]);
  const q = useQuery({
    queryKey: ['classificadores', orgao?.id, tipo, termo, pagina],
    queryFn: () => listarClassificadores({ tenantId: orgao!.id, tipo, busca: termo, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao, placeholderData: (a) => a,
  });
  const paiIds = [...new Set((q.data?.itens ?? []).map((c) => c.pai_id).filter(Boolean))] as string[];
  const pais = useQuery({ queryKey: ['classificadores-pais', paiIds], queryFn: () => obterClassificadores(paiIds), enabled: paiIds.length > 0 });
  const tipoAtual = tipos.data?.find((t) => t.codigo === tipo);
  if (!tipos.data) return <Carregando />;

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Tipos de classificador">
        {tipos.data.map((t) => (
          <button key={t.codigo} onClick={() => setTipo(t.codigo)} aria-current={t.codigo === tipo}
            className={cx('whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm', t.codigo === tipo ? 'bg-marca-50 font-medium text-marca-800' : 'text-slate-600 hover:bg-slate-50')}>
            {t.nome}
          </button>
        ))}
      </nav>
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-60 flex-1"><CampoBusca valor={busca} aoMudar={setBusca} placeholder="Código ou descrição" rotulo="Buscar classificador" /></div>
          {pode('classificacoes', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo</Botao>}
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> :
          !q.data!.itens.length ? <Vazio titulo={`Nenhum registro em ${tipoAtual?.nome}`} descricao="Cadastre os códigos usados pelo órgão (ou peça a carga inicial à plataforma)." /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Código</th><th className="py-2 pr-3 font-medium">Descrição</th>
                {tipoAtual?.pai_tipo && <th className="hidden py-2 pr-3 font-medium sm:table-cell">{tipos.data.find((t) => t.codigo === tipoAtual.pai_tipo)?.nome}</th>}
                <th className="py-2" />
              </tr></thead>
              <tbody>
                {q.data!.itens.map((c) => {
                  const p = pais.data?.find((x) => x.id === c.pai_id);
                  return (
                    <tr key={c.id} className={cx('border-b border-slate-100', !c.ativo && 'opacity-60')}>
                      <td className="numero py-2 pr-3 font-medium text-slate-900">{c.codigo}</td>
                      <td className="py-2 pr-3">{c.descricao} {c.natureza_acao && <Selo>{NATUREZAS[c.natureza_acao]}</Selo>} {!c.ativo && <Selo tom="perigo">Inativo</Selo>}</td>
                      {tipoAtual?.pai_tipo && <td className="hidden py-2 pr-3 text-slate-600 sm:table-cell">{p ? p.codigo : '—'}</td>}
                      <td className="whitespace-nowrap py-2 text-right">
                        {pode('classificacoes', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${c.codigo}`} onClick={() => setEditando(c)} />}
                        {pode('classificacoes', 'excluir') && <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={c.ativo ? `Inativar ${c.codigo}` : `Reativar ${c.codigo}`} onClick={() => setAlternando(c)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </div>
      {tipoAtual && <FormClassificador tipo={tipoAtual} tipos={tipos.data} item={editando} aoFechar={() => setEditando(null)} />}
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Inativar ${alternando.codigo}?` : `Reativar ${alternando?.codigo}?`}
        descricao="Inativo não aparece para novas dotações; as dotações e o histórico que já o usam continuam válidos."
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusClassificador(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['classificadores'] }); toast.success('Situação atualizada.'); }} />
    </div>
  );
}

// ---------------------------------------------------------------- dotações

type Escolhas = Partial<Record<keyof ClassificacaoOrcamentaria, { id: string; rotulo: string }>>;

function FormDotacao({ item, aoFechar }: { item: ClassificacaoOrcamentaria | null | 'nova'; aoFechar: () => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const tipos = useTipos();
  const aberto = item !== null;
  const atual = item === 'nova' ? null : item;
  const [esc, setEsc] = useState<Escolhas>({});
  const [descricao, setDescricao] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const idsAtuais = useMemo(() => (atual ? CAMPOS.map(([c]) => atual[c] as string | null).filter(Boolean) as string[] : []), [atual]);
  const carregados = useQuery({ queryKey: ['classificadores-dotacao', atual?.id], queryFn: () => obterClassificadores(idsAtuais), enabled: aberto && idsAtuais.length > 0 });
  useEffect(() => {
    if (!aberto) return;
    setErros({}); setDescricao(atual?.descricao ?? ''); setEsc({});
  }, [aberto, atual]);
  useEffect(() => {
    if (!atual || !carregados.data) return;
    const e: Escolhas = {};
    for (const [campo] of CAMPOS) {
      const c = carregados.data.find((x) => x.id === atual[campo]);
      if (c) e[campo] = { id: c.id, rotulo: rotuloClassificador(c) };
    }
    setEsc(e);
  }, [atual, carregados.data]);

  const escolher = (campo: keyof ClassificacaoOrcamentaria, v: { id: string; rotulo: string } | null) => {
    setEsc((x) => {
      const n: Escolhas = { ...x, [campo]: v ?? undefined };
      // trocar o pai limpa o filho que dependia dele
      for (const [filho, pai] of Object.entries(PAI_DO_CAMPO)) if (pai === campo && x[pai]?.id !== v?.id) delete n[filho as keyof ClassificacaoOrcamentaria];
      return n;
    });
  };

  const salvar = useMutation({
    mutationFn: () => {
      const dados: Record<string, string | null> = { tenant_id: orgao!.id, descricao: descricao.trim() || null };
      for (const [campo] of CAMPOS) dados[campo] = esc[campo]?.id ?? null;
      return salvarClassificacao(atual?.id ?? null, dados as Partial<ClassificacaoOrcamentaria>);
    },
    onSuccess: async (d) => { await qc.invalidateQueries({ queryKey: ['dotacoes'] }); toast.success(`Dotação salva: ${d.codigo_completo}`); aoFechar(); },
    onError: (e) => {
      if (/classificacoes_combinacao_unica/.test((e as Error).message ?? '')) setErros({ geral: 'Esta combinação já está cadastrada. Use a busca para encontrá-la.' });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });
  const faltando = !esc.acao_id || !esc.elemento_id || !esc.fonte_id;

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={atual ? 'Editar dotação' : 'Nova dotação orçamentária'} largura="lg"
      descricao="Combine os classificadores cadastrados. Ação, elemento e fonte são obrigatórios; o restante, conforme o órgão usa."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvar.isPending} disabled={faltando} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
      {!tipos.data || (atual && carregados.isLoading) ? <Carregando /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS.map(([campo, tipo, obrigatorio]) => {
            const t = tipos.data.find((x) => x.codigo === tipo)!;
            const campoPai = PAI_DO_CAMPO[campo];
            const paiId = campoPai ? esc[campoPai]?.id ?? null : null;
            const exigePai = (campo === 'subelemento_id' && !esc.elemento_id) || (campo === 'detalhamento_fonte_id' && !esc.fonte_id);
            return (
              <BuscaSelect key={campo} rotulo={t.nome} obrigatorio={obrigatorio} valor={esc[campo]?.id ?? null} rotuloValor={esc[campo]?.rotulo}
                erro={erros[campo]} desabilitado={exigePai}
                ajuda={exigePai ? `Escolha antes ${campo === 'subelemento_id' ? 'o elemento' : 'a fonte'}.` : undefined}
                aoMudar={(v, o) => escolher(campo, v && o ? { id: v, rotulo: o.rotulo } : null)}
                chave={['classificadores-opcoes', orgao?.id, tipo, paiId]}
                buscar={async (b) => (await listarClassificadores({ tenantId: orgao!.id, tipo, busca: b, paiId, somenteAtivos: true, limite: 30 })).itens
                  .map((c) => ({ valor: c.id, rotulo: rotuloClassificador(c) }))} />
            );
          })}
          <AreaTexto className="sm:col-span-2" rotulo="Observação" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} />
          {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
        </div>
      )}
    </Modal>
  );
}

function Dotacoes() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [situacao, setSituacao] = useState<'ATIVOS' | 'INATIVOS' | 'TODOS'>('ATIVOS');
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<ClassificacaoOrcamentaria | null | 'nova'>(null);
  const [alternando, setAlternando] = useState<ClassificacaoOrcamentaria | null>(null);
  useEffect(() => setPagina(0), [termo, situacao]);
  const q = useQuery({
    queryKey: ['dotacoes', orgao?.id, termo, situacao, pagina],
    queryFn: () => listarClassificacoes({ tenantId: orgao!.id, busca: termo, situacao, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao, placeholderData: (a) => a,
  });
  const ids = [...new Set((q.data?.itens ?? []).flatMap((d) => [d.acao_id, d.elemento_id, d.subelemento_id, d.fonte_id]).filter(Boolean))] as string[];
  const nomes = useQuery({ queryKey: ['classificadores-nomes', ids], queryFn: () => obterClassificadores(ids), enabled: ids.length > 0 });
  const nome = (id: string | null) => (id ? nomes.data?.find((c) => c.id === id) : undefined);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-center">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Código (ex.: 2090, 39) ou descrição da ação, elemento ou fonte" rotulo="Buscar dotação" />
        <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
          <option value="ATIVOS">Ativas</option><option value="INATIVOS">Inativas</option><option value="TODOS">Todas</option>
        </select>
        {pode('classificacoes', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('nova')}>Nova dotação</Botao>}
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> :
        !q.data!.itens.length ? <Vazio titulo="Nenhuma dotação cadastrada" descricao="Primeiro cadastre os classificadores (ação, elemento, fonte…); depois combine-os aqui." /> : (
          <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
            {q.data!.itens.map((d) => (
              <li key={d.id} className={cx('flex items-start gap-3 py-3', !d.ativo && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="numero font-mono text-sm font-semibold text-slate-900">{d.codigo_completo} {!d.ativo && <Selo tom="perigo">Inativa</Selo>}</p>
                  <p className="text-sm text-slate-600">
                    Ação: {nome(d.acao_id)?.descricao ?? '…'} · Elemento: {nome(d.elemento_id)?.descricao ?? '…'}
                    {d.subelemento_id ? ` · Subelemento: ${nome(d.subelemento_id)?.descricao ?? '…'}` : ''} · Fonte: {nome(d.fonte_id)?.descricao ?? '…'}
                  </p>
                  {d.descricao && <p className="text-xs text-slate-500">{d.descricao}</p>}
                </div>
                {pode('classificacoes', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${d.codigo_completo}`} onClick={() => setEditando(d)} />}
                {pode('classificacoes', 'excluir') && <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={d.ativo ? 'Inativar dotação' : 'Reativar dotação'} onClick={() => setAlternando(d)} />}
              </li>
            ))}
          </ul>
        )}
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      <FormDotacao item={editando} aoFechar={() => setEditando(null)} />
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? 'Inativar dotação?' : 'Reativar dotação?'}
        descricao="Dotação inativa não aparece para novos contratos e empenhos. Os registros que já a usam continuam com ela."
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusClassificacao(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['dotacoes'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}

export function Classificacao() {
  const { orgao, pode } = useSessao();
  const [aba, setAba] = useState<'dotacoes' | 'classificadores'>('dotacoes');
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('classificacoes', 'ler')) return <SemPermissao />;
  return (
    <>
      <CabecalhoPagina titulo="Classificação orçamentária"
        descricao="Fonte única dos dados orçamentários. Contratos, empenhos e notas apontam para estas dotações — nunca para texto digitado." />
      <Cartao>
        <Abas abas={[{ id: 'dotacoes', rotulo: 'Dotações' }, { id: 'classificadores', rotulo: 'Classificadores (códigos)' }]} ativa={aba} aoMudar={setAba} />
        {aba === 'dotacoes' ? <Dotacoes /> : <Classificadores />}
      </Cartao>
    </>
  );
}
