import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Layers, Pencil, Plus, Power, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { BotoesPlanilha } from '@/components/Planilhas';
import { CamposEndereco, enderecoDe, enderecoParaGravar, enderecoVazio, SeletorUnidadeOrg, type Endereco } from '@/components/CamposEndereco';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { CampoBusca } from '@/components/ui/Abas';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Interruptor, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarCep, formatarTelefone, somenteDigitos } from '@/lib/formatacao';
import type { UnidadeAtendida } from '@/lib/tipos';
import {
  definirStatusUnidadeAtendida, gruposDaUnidade, incluirNoGrupo, listarServidores, listarUnidadesAtendidas, membrosDoGrupo,
  removerDoGrupo, salvarUnidadeAtendida,
} from '@/services/cadastros';

const POR_PAGINA = 25;
const TIPOS_SUGERIDOS = ['UBS', 'USF', 'CAPS', 'Hospital', 'Maternidade', 'Policlínica', 'UPA', 'Laboratório', 'Farmácia', 'Centro de Especialidades', 'Administrativa', 'Almoxarifado', 'Outra'];
const REGRAS: Record<UnidadeAtendida['regra_rateio'], string> = { OBRIGATORIO: 'Rateio obrigatório', OPCIONAL: 'Rateio opcional', NAO_APLICAVEL: 'Sem rateio' };

function FormUnidade({ aberto, aoFechar, unidade }: { aberto: boolean; aoFechar: () => void; unidade: UnidadeAtendida | null }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [f, setF] = useState({ nome: '', sigla: '', tipo: 'UBS', codigo: '', telefone: '', email: '', observacoes: '', eh_grupo: false,
    regra_rateio: 'NAO_APLICAVEL' as UnidadeAtendida['regra_rateio'], participa_rateio: true });
  const [resp, setResp] = useState<{ id: string; rotulo: string } | null>(null);
  const [org, setOrg] = useState<{ id: string; rotulo: string } | null>(null);
  const [end, setEnd] = useState<Endereco>(enderecoVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF(unidade ? { nome: unidade.nome, sigla: unidade.sigla ?? '', tipo: unidade.tipo, codigo: unidade.codigo ?? '', telefone: formatarTelefone(unidade.telefone),
      email: unidade.email ?? '', observacoes: unidade.observacoes ?? '', eh_grupo: unidade.eh_grupo, regra_rateio: unidade.regra_rateio, participa_rateio: unidade.participa_rateio }
      : { nome: '', sigla: '', tipo: 'UBS', codigo: '', telefone: '', email: '', observacoes: '', eh_grupo: false, regra_rateio: 'NAO_APLICAVEL', participa_rateio: true });
    setResp(unidade?.responsavel_id ? { id: unidade.responsavel_id, rotulo: 'Responsável atual' } : null);
    setOrg(unidade?.unidade_org_id ? { id: unidade.unidade_org_id, rotulo: 'Unidade atual' } : null);
    setEnd(enderecoDe(unidade));
  }, [aberto, unidade]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = useMutation({
    mutationFn: () => salvarUnidadeAtendida(unidade?.id ?? null, {
      tenant_id: orgao!.id, nome: f.nome.trim(), sigla: f.sigla.trim() || null, tipo: f.tipo.trim(), codigo: f.codigo.trim() || null,
      telefone: somenteDigitos(f.telefone) || null, email: f.email.trim() || null, observacoes: f.observacoes.trim() || null,
      eh_grupo: f.eh_grupo, regra_rateio: f.eh_grupo ? f.regra_rateio : 'NAO_APLICAVEL', participa_rateio: f.participa_rateio,
      responsavel_id: resp?.id ?? null, unidade_org_id: org?.id ?? null, ...enderecoParaGravar(end),
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['unidades-atendidas'] }); toast.success(unidade ? 'Unidade atualizada.' : 'Unidade cadastrada.'); aoFechar(); },
    onError: (e) => {
      if (/unidades_atendidas_nome_unico/.test((e as Error).message ?? '')) setErros({ nome: 'Já existe uma unidade com este nome.' });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (f.nome.trim().length < 2) { setErros({ nome: 'Informe o nome da unidade.' }); return; }
    if (f.tipo.trim().length < 2) { setErros({ tipo: 'Informe o tipo.' }); return; }
    salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={unidade ? 'Editar unidade atendida' : 'Nova unidade atendida'} largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-ua" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-ua" onSubmit={enviar} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-4" rotulo="Nome" obrigatorio value={f.nome} onChange={set('nome')} erro={erros.nome} maxLength={200} placeholder="UBS Augusto Franco" />
          <Campo className="sm:col-span-2" rotulo="Sigla" value={f.sigla} onChange={set('sigla')} maxLength={30} />
          <div className="sm:col-span-3">
            <Campo rotulo="Tipo" obrigatorio value={f.tipo} onChange={set('tipo')} erro={erros.tipo} list="tipos-unidade" maxLength={60} />
            <datalist id="tipos-unidade">{TIPOS_SUGERIDOS.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <Campo className="sm:col-span-3" rotulo="Código (ex.: CNES)" value={f.codigo} onChange={set('codigo')} maxLength={30} />
          <div className="sm:col-span-3">
            <BuscaSelect rotulo="Responsável (servidor)" valor={resp?.id ?? null} rotuloValor={resp?.rotulo} chave={['servidores-busca', orgao?.id]}
              aoMudar={(v, o) => setResp(v && o ? { id: v, rotulo: o.rotulo } : null)} erro={erros.responsavel_id}
              buscar={async (t) => (await listarServidores({ tenantId: orgao!.id, busca: t, situacao: 'ATIVOS', limite: 20, offset: 0 })).itens
                .map((s) => ({ valor: s.id, rotulo: s.nome, detalhe: `Mat. ${s.matricula} · ${s.unidade_sigla ?? s.unidade_nome}` }))} />
          </div>
          <div className="sm:col-span-3">
            <SeletorUnidadeOrg rotulo="Coordenação/setor responsável" valor={org?.id ?? null} rotuloValor={org?.rotulo} erro={erros.unidade_org_id}
              aoMudar={(v, r) => setOrg(v ? { id: v, rotulo: r ?? '' } : null)} />
          </div>
          <Campo className="sm:col-span-3" rotulo="Telefone" inputMode="tel" value={f.telefone} onChange={(e) => setF((x) => ({ ...x, telefone: formatarTelefone(e.target.value) }))} />
          <Campo className="sm:col-span-3" rotulo="E-mail" type="email" value={f.email} onChange={set('email')} />
        </div>
        <CamposEndereco valor={end} aoMudar={setEnd} />
        <fieldset className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">Rateio</legend>
          <Interruptor rotulo="É um grupo agrupador (ex.: UBS/USF, CAPS)" descricao="Ao lançar uma nota para o grupo, o valor pode ser dividido entre as unidades que fazem parte dele."
            marcado={f.eh_grupo} aoMudar={(v) => setF((x) => ({ ...x, eh_grupo: v, regra_rateio: v ? (x.regra_rateio === 'NAO_APLICAVEL' ? 'OPCIONAL' : x.regra_rateio) : 'NAO_APLICAVEL' }))} />
          {f.eh_grupo && (
            <Selecao rotulo="Regra de rateio" value={f.regra_rateio} onChange={set('regra_rateio')} erro={erros.eh_grupo}>
              <option value="OPCIONAL">Opcional: quem lança decide se divide</option>
              <option value="OBRIGATORIO">Obrigatório: o valor sempre é dividido</option>
            </Selecao>
          )}
          {!f.eh_grupo && <Interruptor rotulo="Participa de rateios" marcado={f.participa_rateio} aoMudar={(v) => setF((x) => ({ ...x, participa_rateio: v }))} />}
        </fieldset>
        <AreaTexto rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} />
        {erros.geral && <CaixaErro mensagem={erros.geral} />}
      </form>
    </Modal>
  );
}

function MembrosGrupo({ grupo }: { grupo: UnidadeAtendida }) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const chave = ['membros', grupo.id];
  const q = useQuery({ queryKey: chave, queryFn: () => membrosDoGrupo(grupo.id) });
  const incluir = useMutation({
    mutationFn: (id: string) => incluirNoGrupo(grupo.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }), onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const remover = useMutation({
    mutationFn: (id: string) => removerDoGrupo(grupo.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }), onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const podeEditar = pode('unidades', 'editar');
  const jaTem = new Set(q.data?.map((m) => m.id));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">{REGRAS[grupo.regra_rateio]}. Ao lançar uma nota para <strong>{grupo.nome}</strong>, o valor poderá ser dividido entre estas unidades, sem duplicar o total.</p>
      {podeEditar && (
        <BuscaSelect rotulo="Incluir unidade no grupo" valor={null} aoMudar={(v) => { if (v) incluir.mutate(v); }} chave={['ua-busca', orgao?.id, grupo.id, q.data?.length]}
          buscar={async (t) => (await listarUnidadesAtendidas({ tenantId: orgao!.id, busca: t, situacao: 'ATIVOS', limite: 20, offset: 0 })).itens
            .filter((u) => !u.eh_grupo && !jaTem.has(u.id)).map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.tipo }))} />
      )}
      {q.isLoading ? <Carregando /> : !q.data?.length ? <p className="text-sm text-slate-500">Nenhuma unidade no grupo ainda.</p> : (
        <ul className="flex flex-wrap gap-2">
          {q.data.map((m) => (
            <li key={m.id} className="inline-flex items-center gap-1 rounded-lg bg-marca-50 px-2.5 py-1 text-sm text-marca-900 ring-1 ring-marca-200">
              {m.nome}
              {podeEditar && <button className="rounded p-0.5 hover:bg-marca-100" aria-label={`Tirar ${m.nome} do grupo`} onClick={() => remover.mutate(m.id)}><X className="size-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetalheUnidade({ unidade, aoFechar }: { unidade: UnidadeAtendida | null; aoFechar: () => void }) {
  const grupos = useQuery({ queryKey: ['grupos-da-unidade', unidade?.id], queryFn: () => gruposDaUnidade(unidade!.id), enabled: !!unidade && !unidade.eh_grupo });
  if (!unidade) return null;
  const u = unidade;
  const linha = (r: string, v: string | null | undefined) => <div><dt className="text-xs text-slate-500">{r}</dt><dd className="text-sm text-slate-900">{v || '—'}</dd></div>;
  return (
    <Modal aberto aoFechar={aoFechar} titulo={u.nome} descricao={[u.tipo, u.sigla, u.codigo && `Código ${u.codigo}`].filter(Boolean).join(' · ')} largura="lg">
      <dl className="mb-5 grid gap-3 sm:grid-cols-2">
        {linha('Endereço', [u.logradouro, u.numero, u.complemento, u.bairro].filter(Boolean).join(', '))}
        {linha('Cidade / CEP', [u.cidade && `${u.cidade}/${u.uf ?? ''}`, formatarCep(u.cep)].filter(Boolean).join(' · '))}
        {linha('Telefone', formatarTelefone(u.telefone))}{linha('E-mail', u.email)}
        {!u.eh_grupo && linha('Grupos de rateio', grupos.data?.map((g) => g.nome).join(', ') || 'Nenhum')}
        {linha('Situação', u.ativo ? 'Ativa' : 'Inativa')}
        <div className="sm:col-span-2">{linha('Observações', u.observacoes)}</div>
      </dl>
      {u.eh_grupo && <MembrosGrupo grupo={u} />}
    </Modal>
  );
}

export function UnidadesAtendidas() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [situacao, setSituacao] = useState<'ATIVOS' | 'INATIVOS' | 'TODOS'>('ATIVOS');
  const [soGrupos, setSoGrupos] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<UnidadeAtendida | null | 'novo'>(null);
  const [vendo, setVendo] = useState<UnidadeAtendida | null>(null);
  const [alternando, setAlternando] = useState<UnidadeAtendida | null>(null);
  useEffect(() => setPagina(0), [termo, situacao, soGrupos]);
  const q = useQuery({
    queryKey: ['unidades-atendidas', orgao?.id, termo, situacao, soGrupos, pagina],
    queryFn: () => listarUnidadesAtendidas({ tenantId: orgao!.id, busca: termo, situacao, somenteGrupos: soGrupos, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao && pode('unidades', 'ler'), placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('unidades', 'ler')) return <SemPermissao />;

  return (
    <>
      <CabecalhoPagina titulo="Unidades atendidas" descricao="Unidades que recebem serviços e materiais (UBS, CAPS, hospitais…) e os grupos usados no rateio das notas."
        acoes={<><BotoesPlanilha tipo="unidades_atendidas" />{pode('unidades', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Nova unidade</Botao>}</>} />
      <Cartao>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-center">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, sigla, tipo ou bairro" rotulo="Buscar unidade" />
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
            <option value="ATIVOS">Ativas</option><option value="INATIVOS">Inativas</option><option value="TODOS">Todas</option>
          </select>
          <Interruptor rotulo="Só grupos" marcado={soGrupos} aoMudar={setSoGrupos} />
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          !q.data!.itens.length ? <Vazio titulo="Nenhuma unidade encontrada" /> : (
            <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
              {q.data!.itens.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-3">
                  <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-lg', u.eh_grupo ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500')}>
                    {u.eh_grupo ? <Layers className="size-5" /> : <span className="text-[11px] font-semibold">{u.tipo.slice(0, 4).toUpperCase()}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                      {u.nome}{u.sigla && <span className="font-normal text-slate-500">({u.sigla})</span>}
                      {u.eh_grupo && <Selo tom="alerta">Grupo · {REGRAS[u.regra_rateio].toLowerCase()}</Selo>}
                      {!u.ativo && <Selo tom="perigo">Inativa</Selo>}
                    </p>
                    <p className="truncate text-sm text-slate-600">{[u.tipo, u.bairro, u.cidade].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Botao pequeno variante="fantasma" icone={<Eye className="size-4" />} aria-label={`Ver ${u.nome}`} onClick={() => setVendo(u)} />
                  {pode('unidades', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${u.nome}`} onClick={() => setEditando(u)} />}
                  {pode('unidades', 'excluir') && <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={u.ativo ? `Inativar ${u.nome}` : `Reativar ${u.nome}`} onClick={() => setAlternando(u)} />}
                </li>
              ))}
            </ul>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
      <FormUnidade aberto={editando !== null} aoFechar={() => setEditando(null)} unidade={editando === 'novo' ? null : editando} />
      <DetalheUnidade unidade={vendo} aoFechar={() => setVendo(null)} />
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Inativar ${alternando.nome}?` : `Reativar ${alternando?.nome}?`}
        descricao={alternando?.ativo ? 'A unidade deixa de aparecer para novos lançamentos. O histórico é preservado.' : 'A unidade volta a ficar disponível.'}
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusUnidadeAtendida(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['unidades-atendidas'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}
