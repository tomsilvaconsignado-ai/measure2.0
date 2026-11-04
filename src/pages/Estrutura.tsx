import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Plus, Power, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Interruptor, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { formatarTelefone, somenteDigitos } from '@/lib/formatacao';
import { TIPOS_UNIDADE, type TipoUnidade, type UnidadeOrganizacional } from '@/lib/tipos';
import { definirStatusUnidade, listarUnidades, salvarUnidade } from '@/services/api';

interface No { u: UnidadeOrganizacional; filhos: No[] }

function montarArvore(unidades: UnidadeOrganizacional[]): No[] {
  const porId = new Map(unidades.map((u) => [u.id, { u, filhos: [] as No[] }]));
  const raizes: No[] = [];
  for (const no of porId.values()) {
    const pai = no.u.pai_id ? porId.get(no.u.pai_id) : undefined;
    // sem o pai visível (fora do escopo), a unidade aparece como raiz
    (pai ? pai.filhos : raizes).push(no);
  }
  const ordenar = (nos: No[]) => { nos.sort((a, b) => a.u.nome.localeCompare(b.u.nome, 'pt-BR')); nos.forEach((n) => ordenar(n.filhos)); };
  ordenar(raizes);
  return raizes;
}

// Tipo sugerido para a unidade filha
const PROXIMO_TIPO: Partial<Record<TipoUnidade, TipoUnidade>> = {
  ORGANIZACAO: 'SECRETARIA', SECRETARIA: 'DIRETORIA', DIRETORIA: 'COORDENACAO', COORDENACAO: 'GERENCIA', GERENCIA: 'SETOR', DEPARTAMENTO: 'SETOR', SETOR: 'UNIDADE',
};

function FormUnidade({ aberto, aoFechar, tenantId, unidade, paiInicial, unidades, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; tenantId: string; unidade: UnidadeOrganizacional | null;
  paiInicial: UnidadeOrganizacional | null; unidades: UnidadeOrganizacional[]; aoSalvar: (u: UnidadeOrganizacional) => void;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoUnidade>('SECRETARIA');
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState('');
  const [paiId, setPaiId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setTipo(unidade?.tipo ?? (paiInicial ? PROXIMO_TIPO[paiInicial.tipo] ?? 'SETOR' : 'ORGANIZACAO'));
    setNome(unidade?.nome ?? ''); setSigla(unidade?.sigla ?? '');
    setPaiId(unidade ? unidade.pai_id : paiInicial?.id ?? null);
    setDescricao(unidade?.descricao ?? ''); setEndereco(unidade?.endereco ?? '');
    setTelefone(formatarTelefone(unidade?.telefone)); setEmail(unidade?.email ?? '');
  }, [aberto, unidade, paiInicial]);

  const porId = useMemo(() => new Map(unidades.map((u) => [u.id, u])), [unidades]);
  const rotuloDe = (u: UnidadeOrganizacional) => `${u.nome}${u.sigla ? ` (${u.sigla})` : ''}`;
  // Não pode escolher a própria unidade nem uma abaixo dela
  const candidatos = unidades.filter((u) => u.ativo && (!unidade || !u.caminho.includes(unidade.id)));

  const salvar = useMutation({
    mutationFn: () => salvarUnidade(unidade?.id ?? null, {
      tenant_id: tenantId, pai_id: paiId, tipo, nome: nome.trim(), sigla: sigla.trim() || null,
      descricao: descricao.trim() || null, endereco: endereco.trim() || null, telefone: somenteDigitos(telefone) || null, email: email.trim() || null,
    }),
    onSuccess: async (salva) => {
      await qc.invalidateQueries({ queryKey: ['unidades', tenantId] });
      aoSalvar(salva);
      toast.success(unidade ? 'Unidade atualizada.' : 'Unidade criada.');
      aoFechar();
    },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) { setErros({ nome: 'Informe o nome da unidade.' }); return; }
    salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={unidade ? 'Editar unidade' : 'Nova unidade'} largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-unidade" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-unidade" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Selecao rotulo="Tipo" obrigatorio value={tipo} onChange={(e) => setTipo(e.target.value as TipoUnidade)}>
          {Object.entries(TIPOS_UNIDADE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </Selecao>
        <BuscaSelect rotulo="Unidade superior" valor={paiId} rotuloValor={paiId ? rotuloDe(porId.get(paiId)!) : null}
          aoMudar={(v) => setPaiId(v)} chave={['unidades-local', tenantId, unidade?.id, unidades.length]} erro={erros.pai_id}
          ajuda="Vazio = unidade raiz do órgão."
          buscar={async (termo) => {
            const t = termo.toLocaleLowerCase('pt-BR');
            return candidatos.filter((u) => !t || u.nome.toLocaleLowerCase('pt-BR').includes(t) || (u.sigla ?? '').toLocaleLowerCase('pt-BR').includes(t))
              .slice(0, 30).map((u) => ({ valor: u.id, rotulo: rotuloDe(u), detalhe: TIPOS_UNIDADE[u.tipo] }));
          }} />
        <Campo className="sm:col-span-2" rotulo="Nome" obrigatorio value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} maxLength={200}
          placeholder="Coordenação de Infraestrutura" />
        <Campo rotulo="Sigla" value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} erro={erros.sigla} maxLength={30} placeholder="COINFRA" />
        <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo rotulo="Telefone" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} inputMode="tel" />
        <Campo rotulo="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={300} />
        <AreaTexto className="sm:col-span-2" rotulo="Descrição / atribuições" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

export function Estrutura() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState<{ unidade: UnidadeOrganizacional | null; pai: UnidadeOrganizacional | null } | null>(null);
  const [alternando, setAlternando] = useState<UnidadeOrganizacional | null>(null);
  const q = useQuery({ queryKey: ['unidades', orgao?.id], queryFn: () => listarUnidades(orgao!.id), enabled: !!orgao && pode('estrutura', 'ler') });

  const visiveis = useMemo(() => (q.data ?? []).filter((u) => mostrarInativas || u.ativo), [q.data, mostrarInativas]);
  const arvore = useMemo(() => montarArvore(visiveis), [visiveis]);
  // na primeira carga de cada órgão, abre as unidades raiz; depois, preserva o que a pessoa abriu
  const [iniciado, setIniciado] = useState<string | null>(null);
  useEffect(() => {
    if (q.data && orgao && iniciado !== orgao.id) {
      setAbertos(new Set(q.data.filter((u) => !u.pai_id).map((u) => u.id)));
      setIniciado(orgao.id);
    }
  }, [q.data, orgao, iniciado]);
  const mostrarSalva = (u: UnidadeOrganizacional) => setAbertos((s) => new Set([...s, ...u.caminho.slice(0, -1)]));
  const termo = filtro.trim().toLocaleLowerCase('pt-BR');
  const casa = (u: UnidadeOrganizacional) => !termo || u.nome.toLocaleLowerCase('pt-BR').includes(termo) || (u.sigla ?? '').toLocaleLowerCase('pt-BR').includes(termo);
  const temCasamento = (n: No): boolean => casa(n.u) || n.filhos.some(temCasamento);

  if (!orgao) return <SemPermissao texto="Escolha um órgão para ver a estrutura." />;
  if (!pode('estrutura', 'ler')) return <SemPermissao />;
  const podeCriar = pode('estrutura', 'criar');
  const podeEditar = pode('estrutura', 'editar');

  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const linha = (n: No, nivel: number): React.ReactNode => {
    if (!temCasamento(n)) return null;
    const aberto = abertos.has(n.u.id) || !!termo;
    return (
      <li key={n.u.id}>
        <div className={cx('group flex items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-slate-50', !n.u.ativo && 'opacity-60')} style={{ paddingLeft: `${nivel * 1.25 + 0.25}rem` }}>
          {n.filhos.length > 0 ? (
            <button onClick={() => alternar(n.u.id)} className="rounded p-0.5 text-slate-500 hover:bg-slate-200" aria-label={aberto ? 'Recolher' : 'Expandir'} aria-expanded={aberto}>
              {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : <span className="w-5" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-900">
              <span className={cx(casa(n.u) && termo && 'bg-amber-100')}>{n.u.nome}</span>
              {n.u.sigla && <span className="ml-1.5 text-slate-500">({n.u.sigla})</span>}
            </p>
          </div>
          <span className="hidden sm:inline"><Selo>{TIPOS_UNIDADE[n.u.tipo]}</Selo></span>
          {!n.u.ativo && <Selo tom="perigo">Inativa</Selo>}
          <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {podeCriar && n.u.ativo && <Botao pequeno variante="fantasma" icone={<Plus className="size-4" />} onClick={() => setForm({ unidade: null, pai: n.u })} aria-label={`Nova unidade dentro de ${n.u.nome}`} />}
            {podeEditar && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} onClick={() => setForm({ unidade: n.u, pai: null })} aria-label={`Editar ${n.u.nome}`} />}
            {podeEditar && <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} onClick={() => setAlternando(n.u)} aria-label={n.u.ativo ? `Inativar ${n.u.nome}` : `Reativar ${n.u.nome}`} />}
          </div>
        </div>
        {aberto && n.filhos.length > 0 && <ul>{n.filhos.map((f) => linha(f, nivel + 1))}</ul>}
      </li>
    );
  };

  const filhosAtivos = alternando ? (q.data ?? []).filter((u) => u.ativo && u.id !== alternando.id && u.caminho.includes(alternando.id)).length : 0;

  return (
    <>
      <CabecalhoPagina titulo="Estrutura organizacional"
        descricao="Secretarias, Diretorias, Coordenações, Gerências e unidades. O acesso de cada pessoa vale para a unidade do vínculo e tudo abaixo dela."
        acoes={podeCriar && <Botao icone={<Plus className="size-4" />} onClick={() => setForm({ unidade: null, pai: null })}>Nova unidade raiz</Botao>} />
      <Cartao>
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" placeholder="Filtrar por nome ou sigla" value={filtro}
              onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar unidades" />
          </div>
          <Interruptor rotulo="Mostrar inativas" marcado={mostrarInativas} aoMudar={setMostrarInativas} />
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          arvore.length === 0 ? (
            <Vazio titulo="Nenhuma unidade cadastrada" descricao="Comece pela unidade raiz (Prefeitura/Organização ou Secretaria) e vá descendo os níveis."
              acao={podeCriar && <Botao icone={<Plus className="size-4" />} onClick={() => setForm({ unidade: null, pai: null })}>Criar unidade raiz</Botao>} />
          ) : <ul className="-mx-2">{arvore.map((r) => linha(r, 0))}</ul>}
      </Cartao>

      <FormUnidade aberto={!!form} aoFechar={() => setForm(null)} tenantId={orgao.id} unidade={form?.unidade ?? null}
        paiInicial={form?.pai ?? null} unidades={q.data ?? []} aoSalvar={mostrarSalva} />
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Inativar ${alternando.nome}?` : `Reativar ${alternando?.nome}?`}
        descricao={alternando?.ativo ? (
          <>A unidade deixa de aparecer para novos cadastros e vínculos. Nada é apagado: histórico, documentos e vínculos são preservados.
            {filhosAtivos > 0 && <strong className="mt-2 block text-amber-800">Atenção: {filhosAtivos} unidade(s) abaixo dela continuam ativas.</strong>}</>
        ) : 'A unidade volta a ficar disponível.'}
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (motivo) => {
          await definirStatusUnidade(alternando!.id, !alternando!.ativo, motivo);
          await qc.invalidateQueries({ queryKey: ['unidades', orgao.id] });
          toast.success(alternando!.ativo ? 'Unidade inativada.' : 'Unidade reativada.');
        }} />
    </>
  );
}
