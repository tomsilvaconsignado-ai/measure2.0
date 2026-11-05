import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cake, Camera, Lock, Pencil, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { BotoesPlanilha } from '@/components/Planilhas';
import { CamposEndereco, enderecoDe, enderecoParaGravar, enderecoVazio, SeletorUnidadeOrg, type Endereco } from '@/components/CamposEndereco';
import { ImagemPrivada, useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { cpfValido, formatarCpf, formatarData, formatarTelefone, iniciais, somenteDigitos } from '@/lib/formatacao';
import type { DadosPessoais, Servidor, ServidorListado } from '@/lib/tipos';
import { aniversariantes, enviarFotoServidor, listarServidores, obterServidor, salvarServidor } from '@/services/cadastros';

const POR_PAGINA = 20;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS_SANGUE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function FotoServidor({ caminho, nome, tamanho = 'size-11', exonerado }: { caminho: string | null; nome: string; tamanho?: string; exonerado?: boolean }) {
  return (
    <ImagemPrivada caminho={caminho} alt="" className={cx(tamanho, 'shrink-0 rounded-full ring-1 ring-slate-200', exonerado && 'grayscale')}
      alternativa={<span className={cx(tamanho, 'flex shrink-0 items-center justify-center rounded-full text-xs font-semibold', exonerado ? 'bg-slate-100 text-slate-500' : 'bg-marca-100 text-marca-800')}>{iniciais(nome)}</span>} />
  );
}

interface FormS { nome: string; matricula: string; cargo: string; funcao: string; unidade_id: string | null; unidade_rotulo: string | null;
  email_institucional: string; telefone: string; data_nomeacao: string; data_exoneracao: string; jornada: string; numero_comunicado: string;
  atribuicoes: string; observacoes: string }
interface FormP { cpf: string; data_nascimento: string; nome_mae: string; naturalidade: string; tipo_sanguineo: string; email_pessoal: string }
const vazioS: FormS = { nome: '', matricula: '', cargo: '', funcao: '', unidade_id: null, unidade_rotulo: null, email_institucional: '', telefone: '',
  data_nomeacao: '', data_exoneracao: '', jornada: '', numero_comunicado: '', atribuicoes: '', observacoes: '' };
const vazioP: FormP = { cpf: '', data_nascimento: '', nome_mae: '', naturalidade: '', tipo_sanguineo: '', email_pessoal: '' };

function FormServidor({ id, aberto, aoFechar }: { id: string | null; aberto: boolean; aoFechar: () => void }) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const atual = useQuery({ queryKey: ['servidor', id], queryFn: () => obterServidor(id!), enabled: aberto && !!id });
  const [s, setS] = useState<FormS>(vazioS);
  const [p, setP] = useState<FormP>(vazioP);
  const [end, setEnd] = useState<Endereco>(enderecoVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const editaSensivel = pode('servidores_sensiveis', 'editar') || pode('servidores_sensiveis', 'criar');

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    if (!id) { setS(vazioS); setP(vazioP); setEnd(enderecoVazio); return; }
    const d = atual.data;
    if (!d) return;
    const v = d.servidor;
    setS({ nome: v.nome, matricula: v.matricula, cargo: v.cargo ?? '', funcao: v.funcao ?? '', unidade_id: v.unidade_id, unidade_rotulo: null,
      email_institucional: v.email_institucional ?? '', telefone: formatarTelefone(v.telefone), data_nomeacao: v.data_nomeacao ?? '',
      data_exoneracao: v.data_exoneracao ?? '', jornada: v.jornada ?? '', numero_comunicado: v.numero_comunicado ?? '',
      atribuicoes: v.atribuicoes ?? '', observacoes: v.observacoes ?? '' });
    const x = d.pessoais;
    setP({ cpf: formatarCpf(x?.cpf), data_nascimento: x?.data_nascimento ?? '', nome_mae: x?.nome_mae ?? '', naturalidade: x?.naturalidade ?? '',
      tipo_sanguineo: x?.tipo_sanguineo ?? '', email_pessoal: x?.email_pessoal ?? '' });
    setEnd(enderecoDe(x));
  }, [aberto, id, atual.data]);
  const set = (k: keyof FormS) => (e: { target: { value: string } }) => setS((x) => ({ ...x, [k]: e.target.value }));
  const setp = (k: keyof FormP) => (e: { target: { value: string } }) => setP((x) => ({ ...x, [k]: e.target.value }));

  const salvar = useMutation({
    mutationFn: () => salvarServidor(id, {
      tenant_id: orgao!.id, unidade_id: s.unidade_id!, nome: s.nome.trim(), matricula: s.matricula.trim(), cargo: s.cargo.trim() || null,
      funcao: s.funcao.trim() || null, email_institucional: s.email_institucional.trim() || null, telefone: somenteDigitos(s.telefone) || null,
      data_nomeacao: s.data_nomeacao || null, data_exoneracao: s.data_exoneracao || null, jornada: s.jornada.trim() || null,
      numero_comunicado: s.numero_comunicado.trim() || null, atribuicoes: s.atribuicoes.trim() || null, observacoes: s.observacoes.trim() || null,
    }, editaSensivel ? {
      cpf: somenteDigitos(p.cpf) || null, data_nascimento: p.data_nascimento || null, nome_mae: p.nome_mae.trim() || null,
      naturalidade: p.naturalidade.trim() || null, tipo_sanguineo: p.tipo_sanguineo || null, email_pessoal: p.email_pessoal.trim().toLowerCase() || null,
      ...enderecoParaGravar(end),
    } as Partial<DadosPessoais> : null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['servidores'] });
      await qc.invalidateQueries({ queryKey: ['servidor', id] });
      toast.success(id ? 'Cadastro atualizado.' : 'Servidor cadastrado.');
      aoFechar();
    },
    onError: (e) => {
      const msg = (e as Error).message ?? '';
      if (/servidores_matricula_unica/.test(msg)) setErros({ matricula: 'Já existe um servidor com esta matrícula neste órgão.' });
      else if (/servidores_cpf_unico/.test(msg)) setErros({ cpf: 'Já existe um servidor com este CPF neste órgão.' });
      else if (/servidores_check/.test(msg)) setErros({ data_exoneracao: 'A exoneração não pode ser anterior à nomeação.' });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (s.nome.trim().length < 3) n.nome = 'Informe o nome completo.';
    if (!s.matricula.trim()) n.matricula = 'Informe a matrícula.';
    if (!s.unidade_id) n.unidade_id = 'Escolha a unidade de lotação.';
    if (editaSensivel && p.cpf && !cpfValido(p.cpf)) n.cpf = 'CPF inválido: confira os dígitos.';
    if (s.data_exoneracao && s.data_nomeacao && s.data_exoneracao < s.data_nomeacao) n.data_exoneracao = 'A exoneração não pode ser anterior à nomeação.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={id ? 'Editar servidor' : 'Novo servidor'} largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-servidor" carregando={salvar.isPending} disabled={!!id && !atual.data}>Salvar</Botao></>}>
      {id && atual.isLoading ? <Carregando /> : (
        <form id="form-servidor" onSubmit={enviar} className="flex flex-col gap-5" noValidate>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-slate-800">Dados funcionais</legend>
            <Campo className="sm:col-span-2" rotulo="Nome completo" obrigatorio value={s.nome} onChange={set('nome')} erro={erros.nome} maxLength={200} />
            <Campo rotulo="Matrícula" obrigatorio value={s.matricula} onChange={set('matricula')} erro={erros.matricula} maxLength={30} />
            <SeletorUnidadeOrg rotulo="Lotação (unidade)" obrigatorio valor={s.unidade_id} rotuloValor={s.unidade_rotulo ?? (s.unidade_id ? 'Unidade atual' : null)}
              aoMudar={(v, r) => setS((x) => ({ ...x, unidade_id: v, unidade_rotulo: r }))} erro={erros.unidade_id} />
            <Campo rotulo="Cargo" value={s.cargo} onChange={set('cargo')} maxLength={120} placeholder="Ex.: CC, Agente Administrativo" />
            <Campo rotulo="Função" value={s.funcao} onChange={set('funcao')} maxLength={120} />
            <Campo rotulo="E-mail institucional" type="email" value={s.email_institucional} onChange={set('email_institucional')}
              ajuda="Se a pessoa tiver acesso ao sistema com este e-mail, o cadastro fica ligado à conta dela." />
            <Campo rotulo="Telefone" inputMode="tel" value={s.telefone} onChange={(e) => setS((x) => ({ ...x, telefone: formatarTelefone(e.target.value) }))} />
            <Campo rotulo="Data de nomeação" type="date" value={s.data_nomeacao} onChange={set('data_nomeacao')} />
            <Campo rotulo="Data de exoneração" type="date" value={s.data_exoneracao} onChange={set('data_exoneracao')} erro={erros.data_exoneracao}
              ajuda="A partir desta data o servidor passa para a aba Exonerados (o cadastro e o histórico são mantidos)." />
            <Campo rotulo="Jornada de trabalho" value={s.jornada} onChange={set('jornada')} maxLength={60} placeholder="Ex.: 40h semanais" />
            <Campo rotulo="Nº do comunicado" value={s.numero_comunicado} onChange={set('numero_comunicado')} maxLength={60} />
            <AreaTexto className="sm:col-span-2" rotulo="Atribuições" value={s.atribuicoes} onChange={set('atribuicoes')} maxLength={4000} rows={3} />
            <AreaTexto className="sm:col-span-2" rotulo="Observações" value={s.observacoes} onChange={set('observacoes')} maxLength={2000} />
          </fieldset>
          {editaSensivel ? (
            <fieldset className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:grid-cols-2">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-amber-900"><Lock className="size-4" />Dados pessoais (acesso restrito – LGPD)</legend>
              <Campo rotulo="CPF" inputMode="numeric" value={p.cpf} onChange={(e) => setP((x) => ({ ...x, cpf: formatarCpf(e.target.value) }))} erro={erros.cpf} />
              <Campo rotulo="Data de nascimento" type="date" value={p.data_nascimento} onChange={setp('data_nascimento')} />
              <Campo rotulo="Nome da mãe" value={p.nome_mae} onChange={setp('nome_mae')} maxLength={200} />
              <Campo rotulo="Naturalidade" value={p.naturalidade} onChange={setp('naturalidade')} maxLength={120} />
              <Selecao rotulo="Tipo sanguíneo" value={p.tipo_sanguineo} onChange={setp('tipo_sanguineo')} ajuda="Dado sensível: preencha só se o órgão exigir.">
                <option value="">Não informado</option>{TIPOS_SANGUE.map((t) => <option key={t}>{t}</option>)}
              </Selecao>
              <Campo rotulo="E-mail pessoal" type="email" value={p.email_pessoal} onChange={setp('email_pessoal')} />
              <div className="sm:col-span-2"><CamposEndereco valor={end} aoMudar={setEnd} /></div>
            </fieldset>
          ) : <p className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><Lock className="size-4" />Os dados pessoais (CPF, nascimento, endereço…) só são editados por quem tem essa permissão.</p>}
          {erros.geral && <CaixaErro mensagem={erros.geral} />}
        </form>
      )}
    </Modal>
  );
}

function DetalheServidor({ id, aoFechar, aoEditar }: { id: string | null; aoFechar: () => void; aoEditar: () => void }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['servidor', id], queryFn: () => obterServidor(id!), enabled: !!id });
  const [aba, setAba] = useState<'funcionais' | 'pessoais' | 'documentos'>('funcionais');
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => setAba('funcionais'), [id]);
  const foto = useMutation({
    mutationFn: (a: File) => enviarFotoServidor(q.data!.servidor as Servidor, a),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['servidor', id] }); await qc.invalidateQueries({ queryKey: ['servidores'] }); toast.success('Foto atualizada.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  if (!id) return null;
  const v = q.data?.servidor;
  const x = q.data?.pessoais;
  const exonerado = !!v?.data_exoneracao && v.data_exoneracao <= new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });
  const linha = (r: string, val: string | null | undefined) => <div><dt className="text-xs text-slate-500">{r}</dt><dd className="whitespace-pre-line text-sm text-slate-900">{val || '—'}</dd></div>;
  return (
    <Modal aberto aoFechar={aoFechar} titulo={v?.nome ?? 'Servidor'} descricao={v ? `Matrícula ${v.matricula}` : undefined} largura="lg"
      rodape={pode('servidores', 'editar') && <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={aoEditar}>Editar</Botao>}>
      {!v ? <Carregando /> : <>
        <div className="mb-4 flex items-center gap-4">
          <FotoServidor caminho={v.foto_path} nome={v.nome} tamanho="size-16" exonerado={exonerado} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700">{[v.cargo, v.funcao].filter(Boolean).join(' · ') || 'Cargo não informado'}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {exonerado ? <Selo>EXONERADO</Selo> : <Selo tom="sucesso">Ativo</Selo>}
              {v.user_id && <Selo tom="info">Tem acesso ao sistema</Selo>}
            </div>
          </div>
          {pode('servidores', 'editar') && <>
            <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const a = e.target.files?.[0]; if (a) foto.mutate(a); e.target.value = ''; }} />
            <Botao pequeno variante="secundario" icone={<Camera className="size-4" />} carregando={foto.isPending} onClick={() => entrada.current?.click()}>Foto</Botao>
          </>}
        </div>
        <Abas abas={[{ id: 'funcionais', rotulo: 'Dados funcionais' }, ...(x ? [{ id: 'pessoais' as const, rotulo: 'Dados pessoais' }] : []), { id: 'documentos', rotulo: 'Documentos' }]} ativa={aba} aoMudar={setAba} />
        {aba === 'funcionais' && (
          <dl className="grid gap-3 sm:grid-cols-2">
            {linha('E-mail institucional', v.email_institucional)}{linha('Telefone', formatarTelefone(v.telefone))}
            {linha('Nomeação', formatarData(v.data_nomeacao))}{linha('Exoneração', formatarData(v.data_exoneracao))}
            {linha('Jornada', v.jornada)}{linha('Nº do comunicado', v.numero_comunicado)}
            <div className="sm:col-span-2">{linha('Atribuições', v.atribuicoes)}</div>
            <div className="sm:col-span-2">{linha('Observações', v.observacoes)}</div>
          </dl>
        )}
        {aba === 'pessoais' && x && (
          <dl className="grid gap-3 sm:grid-cols-2">
            {linha('CPF', formatarCpf(x.cpf))}{linha('Nascimento', formatarData(x.data_nascimento))}
            {linha('Nome da mãe', x.nome_mae)}{linha('Naturalidade', x.naturalidade)}
            {linha('Tipo sanguíneo', x.tipo_sanguineo)}{linha('E-mail pessoal', x.email_pessoal)}
            <div className="sm:col-span-2">{linha('Endereço', [x.logradouro, x.numero, x.complemento, x.bairro, x.cidade && `${x.cidade}/${x.uf ?? ''}`].filter(Boolean).join(', '))}</div>
          </dl>
        )}
        {aba === 'documentos' && <Anexos recurso="servidores" registroId={v.id} unidadeId={v.unidade_id} categoria="FUNCIONAL" titulo="Documentos funcionais" />}
      </>}
    </Modal>
  );
}

function Aniversariantes() {
  const { orgao } = useSessao();
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const q = useQuery({ queryKey: ['aniversariantes', orgao?.id, mes], queryFn: () => aniversariantes(orgao!.id, mes), enabled: !!orgao });
  return (
    <div>
      <div className="mb-4 max-w-xs">
        <Selecao rotulo="Mês" value={String(mes)} onChange={(e) => setMes(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </Selecao>
      </div>
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio titulo={`Nenhum aniversariante em ${MESES[mes - 1]!.toLowerCase()}`} descricao="Aparecem aqui os servidores ativos com data de nascimento cadastrada." /> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((a) => (
            <li key={a.servidor_id} className={cx('flex items-center gap-3 rounded-xl border p-3', a.hoje ? 'border-amber-300 bg-amber-50' : 'border-slate-200')}>
              <FotoServidor caminho={a.foto_path} nome={a.nome} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{a.nome}</p>
                <p className="truncate text-xs text-slate-500">{a.unidade_sigla ?? a.unidade_nome}</p>
              </div>
              <span className="text-right">
                <span className="numero block text-lg font-semibold text-marca-800">{String(a.dia).padStart(2, '0')}/{String(a.mes).padStart(2, '0')}</span>
                {a.hoje && <Selo tom="alerta" icone={<Cake className="size-3" />}>Hoje!</Selo>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Servidores() {
  const { orgao, pode } = useSessao();
  const [aba, setAba] = useState<'ATIVOS' | 'EXONERADOS' | 'ANIVERSARIANTES'>('ATIVOS');
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [unidade, setUnidade] = useState<{ id: string; rotulo: string } | null>(null);
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<string | null | 'novo'>(null);
  const [vendo, setVendo] = useState<string | null>(null);
  useEffect(() => setPagina(0), [termo, aba, unidade]);
  const lista = aba !== 'ANIVERSARIANTES';
  const q = useQuery({
    queryKey: ['servidores', orgao?.id, aba, termo, unidade?.id, pagina],
    queryFn: () => listarServidores({ tenantId: orgao!.id, situacao: aba as 'ATIVOS' | 'EXONERADOS', busca: termo, unidadeId: unidade?.id, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao && lista && pode('servidores', 'ler'), placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('servidores', 'ler')) return <SemPermissao />;

  const linha = (s: ServidorListado) => (
    <li key={s.id} className="flex items-center gap-3 py-3">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setVendo(s.id)}>
        <FotoServidor caminho={s.foto_path} nome={s.nome} exonerado={s.exonerado} />
        <span className="min-w-0">
          <span className={cx('flex flex-wrap items-center gap-2 text-sm font-medium', s.exonerado ? 'text-slate-500' : 'text-slate-900')}>
            {s.nome}{s.exonerado && <Selo>EXONERADO</Selo>}
          </span>
          <span className="block truncate text-sm text-slate-600">Mat. {s.matricula}{s.cargo ? ` · ${s.cargo}` : ''}{s.funcao ? ` · ${s.funcao}` : ''}</span>
          <span className="block truncate text-xs text-slate-500">{s.unidade_sigla ?? s.unidade_nome}{s.cpf ? ` · CPF ${formatarCpf(s.cpf)}` : ''}{s.exonerado && s.data_exoneracao ? ` · exonerado em ${formatarData(s.data_exoneracao)}` : ''}</span>
        </span>
      </button>
      {pode('servidores', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${s.nome}`} onClick={() => setEditando(s.id)} />}
    </li>
  );

  return (
    <>
      <CabecalhoPagina titulo="Servidores" descricao="Cadastro funcional. Ativos e exonerados ficam no mesmo cadastro, sem duplicar a pessoa."
        acoes={<><BotoesPlanilha tipo="servidores" />{pode('servidores', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo servidor</Botao>}</>} />
      <Cartao>
        <Abas abas={[{ id: 'ATIVOS', rotulo: 'Servidores ativos' }, { id: 'EXONERADOS', rotulo: 'Servidores exonerados' }, { id: 'ANIVERSARIANTES', rotulo: 'Aniversariantes' }]}
          ativa={aba} aoMudar={setAba} />
        {aba === 'ANIVERSARIANTES' ? <Aniversariantes /> : <>
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_18rem_auto] sm:items-end">
            <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar servidor"
              placeholder={pode('servidores_sensiveis', 'ler') ? 'Nome, matrícula, CPF, cargo, função ou unidade' : 'Nome, matrícula, cargo, função ou unidade'} />
            <SeletorUnidadeOrg rotulo="Unidade (inclui as abaixo dela)" valor={unidade?.id ?? null} rotuloValor={unidade?.rotulo}
              aoMudar={(v, r) => setUnidade(v ? { id: v, rotulo: r ?? '' } : null)} />
            {(busca || unidade) && <Botao variante="fantasma" onClick={() => { setBusca(''); setUnidade(null); }}>Limpar filtros</Botao>}
          </div>
          {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
            !q.data!.itens.length ? <Vazio titulo={aba === 'ATIVOS' ? 'Nenhum servidor ativo encontrado' : 'Nenhum servidor exonerado'}
              descricao={busca || unidade ? 'Ajuste os filtros.' : undefined} /> : (
              <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>{q.data!.itens.map(linha)}</ul>
            )}
          {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
        </>}
      </Cartao>
      <FormServidor id={editando === 'novo' ? null : editando} aberto={editando !== null} aoFechar={() => setEditando(null)} />
      <DetalheServidor id={vendo} aoFechar={() => setVendo(null)} aoEditar={() => { const v = vendo; setVendo(null); setEditando(v); }} />
    </>
  );
}

