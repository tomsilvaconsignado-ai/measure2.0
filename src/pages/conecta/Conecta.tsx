// CONECTA – Comunicação Institucional: mural de publicações com destinatários, comentários, curtidas,
// anexos, destaques e filtros. O banco decide o que cada pessoa vê; a tela só mostra o que ele devolve.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign, Bell, Building2, ChevronLeft, ChevronRight, Download, EyeOff, FileText, Flag, Globe2, Heart, ImagePlus, Landmark, MessageCircle,
  MoreHorizontal, Paperclip, Pencil, Pin, PinOff, Search, Send, Settings2, SlidersHorizontal, Trash2, User, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { ImagemPrivada, useBuscaAtrasada } from '@/components/ImagemPrivada';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { AreaTexto, Botao, CaixaErro, Campo, Cartao, Carregando, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import { urlArquivo } from '@/services/api';
import {
  anexar, buscarPessoas, buscarUnidadesDestino, comentar, comentarios, curtir, denunciar, editarComentario, editarPublicacao, excluirComentario,
  excluirPublicacao, fixarPublicacao, listarCategorias, moderarPublicacao, mural, painelLateral, publicar, removerAnexo, tiposAceitos, TIPOS_CONECTA,
  urlAnexo, type AnexoConecta, type Comentario, type FiltroMural, type ParametrosMural, type Publicacao, type TipoDestino,
} from '@/services/conecta';
import { marcarMensagensLidas, minhasMensagens } from '@/services/notificacoes';
import { CORES_CATEGORIA, FotoPessoa, IconeCategoria, rotuloLotacao, SeloCategoria, tempoRelativo } from './comum';

const POR_PAGINA = 10;
const GRUPOS: Array<{ id: Exclude<TipoDestino, 'PESSOA'>; rotulo: string; icone: ReactNode }> = [
  { id: 'SECRETARIA', rotulo: 'Secretaria', icone: <Landmark className="size-4" /> },
  { id: 'DIRETORIA', rotulo: 'Diretoria', icone: <Building2 className="size-4" /> },
  { id: 'COORDENACAO', rotulo: 'Coordenação', icone: <Users className="size-4" /> },
  { id: 'SETOR', rotulo: 'Gerência ou setor', icone: <Users className="size-4" /> },
  { id: 'UNIDADE_SAUDE', rotulo: 'Unidade de saúde', icone: <Building2 className="size-4" /> },
];
const ROTULO_DESTINO: Record<TipoDestino, string> = {
  SECRETARIA: 'Secretaria', DIRETORIA: 'Diretoria', COORDENACAO: 'Coordenação', SETOR: 'Setor', UNIDADE_SAUDE: 'Unidade de saúde', PESSOA: 'Servidor',
};
const FILTROS: Array<{ id: string; rotulo: string; filtro: FiltroMural; categoria?: string }> = [
  { id: 'todas', rotulo: 'Todas', filtro: 'TODAS' },
  { id: 'minhas', rotulo: 'Minhas publicações', filtro: 'MINHAS' },
  { id: 'comunicados', rotulo: 'Comunicados', filtro: 'TODAS', categoria: 'COMUNICADO' },
  { id: 'eventos', rotulo: 'Eventos', filtro: 'TODAS', categoria: 'EVENTO' },
  { id: 'avisos', rotulo: 'Avisos', filtro: 'TODAS', categoria: 'AVISO' },
  { id: 'diretoria', rotulo: 'Da minha diretoria', filtro: 'MINHA_DIRETORIA' },
  { id: 'coordenacao', rotulo: 'Da minha coordenação', filtro: 'MINHA_COORDENACAO' },
  { id: 'paramim', rotulo: 'Direcionadas a mim', filtro: 'PARA_MIM' },
];

interface Alvo { id: string; tipo: TipoDestino; rotulo: string }

// ---------------------------------------------------------------- criação / edição

function SeletorDestinatarios({ todos, aoMudarTodos, alvos, aoMudarAlvos, erro }: {
  todos: boolean; aoMudarTodos: (v: boolean) => void; alvos: Alvo[]; aoMudarAlvos: (a: Alvo[]) => void; erro?: string;
}) {
  const { orgao } = useSessao();
  const [grupo, setGrupo] = useState<TipoDestino>('COORDENACAO');
  const incluir = (a: Alvo) => { if (!alvos.some((x) => x.id === a.id)) aoMudarAlvos([...alvos, a]); };
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">Destinatários da publicação <span className="text-red-600" aria-hidden>*</span></legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => aoMudarTodos(true)} aria-pressed={todos}
          className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm', todos ? 'border-marca-600 bg-marca-50 font-medium text-marca-900' : 'border-slate-300 hover:bg-slate-50')}>
          <Globe2 className="size-4" />Todos<span className="ml-auto text-xs font-normal text-slate-500">órgão inteiro</span>
        </button>
        <button type="button" onClick={() => aoMudarTodos(false)} aria-pressed={!todos}
          className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm', !todos ? 'border-marca-600 bg-marca-50 font-medium text-marca-900' : 'border-slate-300 hover:bg-slate-50')}>
          <Users className="size-4" />Direcionar<span className="ml-auto text-xs font-normal text-slate-500">unidades e pessoas</span>
        </button>
      </div>
      {!todos && <>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tipo de destinatário">
          {[...GRUPOS, { id: 'PESSOA' as const, rotulo: 'Servidor específico', icone: <User className="size-4" /> }].map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={grupo === g.id} onClick={() => setGrupo(g.id)}
              className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                grupo === g.id ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{g.icone}{g.rotulo}</button>
          ))}
        </div>
        {grupo === 'PESSOA'
          ? <BuscaSelect key="pessoa" rotulo="Servidor" valor={null} placeholder="Digite o nome do servidor..." chave={['conecta-pessoas', orgao?.id, alvos.length]}
              ajuda="Mostra nome, cargo, diretoria, coordenação e lotação dos cadastros. Escolha uma ou várias pessoas."
              aoMudar={(v, o) => { if (v && o) incluir({ id: v, tipo: 'PESSOA', rotulo: o.rotulo }); }}
              buscar={async (t) => (await buscarPessoas(orgao!.id, t)).filter((p) => !alvos.some((a) => a.id === p.user_id)).map((p) => ({
                valor: p.user_id, rotulo: p.nome,
                detalhe: [p.cargo, p.lotacao?.diretoria, p.lotacao?.coordenacao, p.lotacao && (p.lotacao.sigla ?? p.lotacao.nome)].filter(Boolean).join(' · ') || 'Sem lotação cadastrada',
              }))} />
          : <BuscaSelect key={grupo} rotulo={GRUPOS.find((g) => g.id === grupo)!.rotulo} valor={null} chave={['conecta-unidades', orgao?.id, grupo, alvos.length]}
              placeholder="Digite o nome ou a sigla..." ajuda="Quem está na unidade escolhida ou em qualquer unidade abaixo dela recebe a publicação."
              aoMudar={(v, o) => { if (v && o) incluir({ id: v, tipo: grupo, rotulo: o.rotulo }); }}
              buscar={async (t) => (await buscarUnidadesDestino(orgao!.id, grupo as Exclude<TipoDestino, 'PESSOA'>, t)).filter((u) => !alvos.some((a) => a.id === u.id))
                .map((u) => ({ valor: u.id, rotulo: `${u.sigla ? `${u.sigla} – ` : ''}${u.nome}`, detalhe: u.detalhe ?? undefined }))} />}
        {alvos.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Destinatários escolhidos">
            {alvos.map((a) => (
              <li key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-marca-50 px-2 py-0.5 text-xs text-marca-900 ring-1 ring-marca-200">
                <span className="text-marca-600">{ROTULO_DESTINO[a.tipo]}:</span><span className="truncate">{a.rotulo}</span>
                <button type="button" className="rounded p-0.5 hover:bg-marca-100" aria-label={`Remover ${a.rotulo}`} onClick={() => aoMudarAlvos(alvos.filter((x) => x.id !== a.id))}><X className="size-3" /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">Pode combinar vários grupos e pessoas: quem estiver em mais de um recebe a publicação (e o aviso) uma vez só.</p>
      </>}
      {erro && <p className="text-xs text-red-700" role="alert">{erro}</p>}
    </fieldset>
  );
}

function FormPublicacao({ aberto, aoFechar, editando }: { aberto: boolean; aoFechar: () => void; editando: Publicacao | null }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const categorias = useQuery({ queryKey: ['conecta-categorias', orgao?.id], queryFn: () => listarCategorias(orgao!.id), enabled: !!orgao && aberto });
  const aceitos = useQuery({ queryKey: ['conecta-tipos', orgao?.id], queryFn: () => tiposAceitos(orgao!.id), enabled: !!orgao && aberto });
  const [f, setF] = useState({ titulo: '', texto: '', categoria_id: '' });
  const [todos, setTodos] = useState(false);
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!aberto) return;
    setErros({}); setArquivos([]); setRemovidos([]);
    setF({ titulo: editando?.titulo ?? '', texto: editando?.texto ?? '', categoria_id: editando?.categoria.id ?? '' });
    setTodos(editando?.para_todos ?? false); setAlvos([]);
  }, [aberto, editando]);
  const ativas = (categorias.data ?? []).filter((c) => c.ativo || c.id === f.categoria_id);
  const lista = aceitos.data ?? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const extensoes = lista.flatMap((m) => TIPOS_CONECTA[m]?.extensoes.map((e) => `.${e}`) ?? []).join(',');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (f.titulo.trim().length < 3) n.titulo = 'Informe um título (mínimo de 3 caracteres).';
    if (!f.texto.trim()) n.texto = 'Escreva o texto da publicação.';
    if (!f.categoria_id) n.categoria_id = 'Escolha a categoria.';
    if (!editando && !todos && !alvos.length) n.destinatarios = 'Escolha "Todos" ou ao menos uma unidade ou pessoa.';
    setErros(n);
    if (Object.keys(n).length) return;
    setEnviando(true);
    try {
      let id = editando?.id;
      if (editando) await editarPublicacao(editando.id, { titulo: f.titulo.trim(), texto: f.texto.trim(), categoria_id: f.categoria_id });
      else id = await publicar(orgao!.id, {
        titulo: f.titulo.trim(), texto: f.texto.trim(), categoria_id: f.categoria_id, para_todos: todos,
        unidades: alvos.filter((a) => a.tipo !== 'PESSOA').map((a) => a.id), pessoas: alvos.filter((a) => a.tipo === 'PESSOA').map((a) => a.id),
      });
      for (const r of removidos) await removerAnexo(r);
      const falhas: string[] = [];
      for (const a of arquivos) { try { await anexar(id!, a, lista); } catch (er) { falhas.push(mensagemDeErro(er)); } }
      await qc.invalidateQueries({ queryKey: ['conecta'] });
      if (falhas.length) toast.error(`Publicado, mas ${falhas.length} arquivo(s) não foram enviados: ${falhas.join(' ')}`);
      else toast.success(editando ? 'Publicação atualizada.' : 'Publicação feita. Os destinatários foram avisados.');
      aoFechar();
    } catch (er) {
      const t = traduzirErro(er);
      setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem });
    } finally { setEnviando(false); }
  };

  const atuais = (editando?.anexos ?? []).filter((a) => !removidos.includes(a.id));
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={editando ? 'Editar publicação' : 'Nova publicação'} largura="lg"
      descricao={editando ? 'A versão anterior fica guardada no histórico. Os destinatários não mudam.' : 'Seus dados (nome, cargo e lotação) vêm do cadastro e aparecem automaticamente.'}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-conecta" carregando={enviando} icone={<Send className="size-4" />}>{editando ? 'Salvar' : 'Publicar'}</Botao></>}>
      <form id="form-conecta" onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
          <Campo rotulo="Título" obrigatorio value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} erro={erros.titulo} maxLength={200} placeholder="Ex.: Reunião geral de planejamento" />
          <Selecao rotulo="Categoria" obrigatorio value={f.categoria_id} onChange={(e) => setF({ ...f, categoria_id: e.target.value })} erro={erros.categoria_id}>
            <option value="">Escolha...</option>
            {ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        </div>
        <AreaTexto rotulo="Texto" obrigatorio value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} erro={erros.texto} rows={7} maxLength={20000}
          placeholder="O que você gostaria de compartilhar?" />
        {!editando && <SeletorDestinatarios todos={todos} aoMudarTodos={setTodos} alvos={alvos} aoMudarAlvos={setAlvos} erro={erros.destinatarios} />}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Fotografias e documentos</span>
            <input ref={entrada} type="file" multiple accept={extensoes} className="hidden"
              onChange={(e) => { const novos = [...(e.target.files ?? [])]; setArquivos((x) => [...x, ...novos]); e.target.value = ''; }} />
            <Botao pequeno variante="secundario" icone={<ImagePlus className="size-4" />} onClick={() => entrada.current?.click()}>Adicionar arquivos</Botao>
            <span className="text-xs text-slate-500">{lista.map((m) => TIPOS_CONECTA[m]?.rotulo).filter(Boolean).join(', ')} · até 20 por publicação</span>
          </div>
          {(atuais.length > 0 || arquivos.length > 0) && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {atuais.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                  {a.tipo === 'IMAGEM' ? <ImagePlus className="size-4 text-slate-400" /> : <FileText className="size-4 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate">{a.nome_arquivo}</span>
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Remover ${a.nome_arquivo}`} onClick={() => setRemovidos((x) => [...x, a.id])}><X className="size-4" /></button>
                </li>
              ))}
              {arquivos.map((a, i) => (
                <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-dashed border-marca-300 bg-marca-50/40 px-2.5 py-1.5 text-sm">
                  {a.type.startsWith('image/') ? <ImagePlus className="size-4 text-marca-500" /> : <FileText className="size-4 text-marca-500" />}
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-slate-500">{(a.size / 1048576).toFixed(1).replace('.', ',')} MB</span>
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Tirar ${a.name}`} onClick={() => setArquivos((x) => x.filter((_, k) => k !== i))}><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
          {erros.arquivo && <p className="text-xs text-red-700" role="alert">{erros.arquivo}</p>}
        </div>
        {erros.geral && <CaixaErro mensagem={erros.geral} />}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- anexos

function Galeria({ imagens }: { imagens: AnexoConecta[] }) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (!imagens.length) return null;
  const visiveis = imagens.slice(0, 4);
  return (
    <>
      <div className={cx('mt-3 grid gap-1.5 overflow-hidden rounded-xl', visiveis.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
        {visiveis.map((a, i) => (
          <button key={a.id} type="button" onClick={() => setAberta(i)} className={cx('relative block bg-slate-100', visiveis.length === 1 ? 'aspect-video' : 'aspect-[4/3]', visiveis.length === 3 && i === 0 && 'row-span-2 aspect-auto')}
            aria-label={`Ampliar ${a.nome_arquivo}`}>
            <ImagemPrivada caminho={a.storage_path} alt={a.nome_arquivo} className="size-full" alternativa={<span className="block size-full animate-pulse bg-slate-200" />} />
            {i === 3 && imagens.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-slate-900/55 text-2xl font-semibold text-white">+{imagens.length - 4}</span>}
          </button>
        ))}
      </div>
      {aberta !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4" role="dialog" aria-modal="true" aria-label="Fotografia ampliada"
          onKeyDown={(e) => { if (e.key === 'Escape') setAberta(null); if (e.key === 'ArrowRight') setAberta((x) => ((x ?? 0) + 1) % imagens.length); if (e.key === 'ArrowLeft') setAberta((x) => ((x ?? 0) - 1 + imagens.length) % imagens.length); }}
          tabIndex={-1} ref={(el) => el?.focus()} onMouseDown={(e) => { if (e.target === e.currentTarget) setAberta(null); }}>
          <ImagemPrivada caminho={imagens[aberta]!.storage_path} alt={imagens[aberta]!.nome_arquivo} className="max-h-[85vh] max-w-full rounded-lg object-contain" alternativa={<Carregando />} />
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setAberta(null)} aria-label="Fechar"><X className="size-6" /></button>
          {imagens.length > 1 && <>
            <button className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setAberta((aberta - 1 + imagens.length) % imagens.length)} aria-label="Anterior"><ChevronLeft className="size-6" /></button>
            <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setAberta((aberta + 1) % imagens.length)} aria-label="Próxima"><ChevronRight className="size-6" /></button>
          </>}
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">{aberta + 1} de {imagens.length} · {imagens[aberta]!.nome_arquivo}</span>
        </div>, document.body)}
    </>
  );
}

function Documentos({ docs }: { docs: AnexoConecta[] }) {
  if (!docs.length) return null;
  const abrir = async (a: AnexoConecta, baixar: boolean) => {
    try { window.open(await urlAnexo(a, baixar), '_blank', 'noopener'); } catch (e) { toast.error(mensagemDeErro(e)); }
  };
  return (
    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
      {docs.map((a) => (
        <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
          <FileText className="size-5 shrink-0 text-red-600" />
          <button className="min-w-0 flex-1 truncate text-left text-sm text-slate-800 hover:underline" onClick={() => void abrir(a, false)} title="Visualizar">{a.nome_arquivo}</button>
          <span className="text-xs text-slate-500">{(a.tamanho / 1048576).toFixed(1).replace('.', ',')} MB</span>
          <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => void abrir(a, true)} aria-label={`Baixar ${a.nome_arquivo}`}><Download className="size-4" /></button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- comentários

function CaixaComentario({ publicacaoId, paiId, inicial = '', aoConcluir, aoCancelar, comentarioId }: {
  publicacaoId: string; paiId: string | null; inicial?: string; aoConcluir: () => void; aoCancelar?: () => void; comentarioId?: string;
}) {
  const { orgao } = useSessao();
  const [texto, setTexto] = useState(inicial);
  const [mencoes, setMencoes] = useState<Array<{ id: string; nome: string }>>([]);
  const [mencionando, setMencionando] = useState(false);
  const salvar = useMutation({
    mutationFn: async () => {
      if (comentarioId) await editarComentario(comentarioId, texto.trim());
      else await comentar(publicacaoId, texto.trim(), paiId, mencoes.filter((m) => texto.includes(`@${m.nome}`)).map((m) => m.id));
    },
    onSuccess: () => { setTexto(''); setMencoes([]); aoConcluir(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) salvar.mutate(); }}>
      <textarea className="min-h-16 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={5000}
        placeholder={paiId ? 'Escreva uma resposta...' : 'Escreva um comentário...'} aria-label={paiId ? 'Resposta' : 'Comentário'} />
      {mencionando && (
        <BuscaSelect rotulo="Mencionar servidor" valor={null} placeholder="Digite o nome..." chave={['conecta-mencao', orgao?.id]}
          aoMudar={(v, o) => { if (v && o) { setMencoes((x) => [...x, { id: v, nome: o.rotulo }]); setTexto((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${o.rotulo} `); setMencionando(false); } }}
          buscar={async (t) => (await buscarPessoas(orgao!.id, t)).map((p) => ({ valor: p.user_id, rotulo: p.nome, detalhe: [p.cargo, p.lotacao?.sigla ?? p.lotacao?.nome].filter(Boolean).join(' · ') }))} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!comentarioId && <Botao pequeno variante="fantasma" icone={<AtSign className="size-4" />} onClick={() => setMencionando((m) => !m)}>Mencionar</Botao>}
        <span className="flex-1" />
        {aoCancelar && <Botao pequeno variante="fantasma" onClick={aoCancelar}>Cancelar</Botao>}
        <Botao pequeno type="submit" carregando={salvar.isPending} disabled={!texto.trim()} icone={<Send className="size-4" />}>{comentarioId ? 'Salvar' : paiId ? 'Responder' : 'Comentar'}</Botao>
      </div>
    </form>
  );
}

function ItemComentario({ c, publicacaoId, podeModerar, aoMudar, respostas, aoResponder, respondendo }: {
  c: Comentario; publicacaoId: string; podeModerar: boolean; aoMudar: () => void; respostas?: ReactNode; aoResponder?: () => void; respondendo?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  return (
    <li className="flex gap-2.5">
      <FotoPessoa nome={c.autor.nome} caminho={c.autor.avatar_path} tamanho="sm" />
      <div className="min-w-0 flex-1">
        <div className={cx('rounded-xl px-3 py-2', c.removido ? 'bg-slate-50 italic text-slate-400' : 'bg-slate-100')}>
          <p className="text-xs"><span className="font-semibold text-slate-900">{c.autor.nome}</span>
            {c.autor.lotacao && <span className="text-slate-500"> · {rotuloLotacao(c.autor.lotacao)}</span>}</p>
          {editando ? <div className="mt-1.5"><CaixaComentario publicacaoId={publicacaoId} paiId={null} comentarioId={c.id} inicial={c.texto ?? ''}
            aoConcluir={() => { setEditando(false); aoMudar(); }} aoCancelar={() => setEditando(false)} /></div>
            : <p className="whitespace-pre-line break-words text-sm text-slate-800">{c.removido ? 'Comentário removido.' : c.texto}</p>}
          {c.oculto && !c.removido && <p className="mt-1 text-xs font-medium text-amber-700">Oculto pela moderação</p>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 px-1 text-xs text-slate-500">
          <span title={formatarDataHora(c.criado_em)}>{tempoRelativo(c.criado_em)}{c.editado_em && ' · editado'}</span>
          {!c.removido && aoResponder && <button className="font-medium hover:text-marca-700" onClick={aoResponder}>{respondendo ? 'Fechar' : 'Responder'}</button>}
          {!c.removido && c.sou_autor && !editando && <button className="font-medium hover:text-marca-700" onClick={() => setEditando(true)}>Editar</button>}
          {!c.removido && (c.sou_autor || podeModerar) && <button className="font-medium hover:text-red-700" onClick={() => setExcluindo(true)}>Excluir</button>}
          {!c.removido && !c.sou_autor && <button className="font-medium hover:text-amber-700" onClick={() => setDenunciando(true)}>Denunciar</button>}
        </div>
        {respostas}
      </div>
      <ConfirmarComMotivo aberto={excluindo} aoFechar={() => setExcluindo(false)} titulo="Excluir comentário?" minimo={c.sou_autor ? 0 : 5}
        descricao={c.sou_autor ? 'O comentário deixa de aparecer para todos.' : 'Exclusão pela moderação: informe o motivo (fica na auditoria).'}
        rotuloConfirmar="Excluir" aoConfirmar={async (m) => { await excluirComentario(c.id, m); aoMudar(); toast.success('Comentário excluído.'); }} />
      <ConfirmarComMotivo aberto={denunciando} aoFechar={() => setDenunciando(false)} titulo="Denunciar comentário" perigo={false}
        descricao="A moderação do CONECTA vai analisar. Explique o problema." rotuloConfirmar="Enviar denúncia"
        aoConfirmar={async (m) => { await denunciar(publicacaoId, m, c.id); toast.success('Denúncia enviada à moderação.'); }} />
    </li>
  );
}

function Comentarios({ p, podeModerar, aoMudar }: { p: Publicacao; podeModerar: boolean; aoMudar: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['conecta', 'comentarios', p.id], queryFn: () => comentarios(p.id) });
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const atualizar = () => { void qc.invalidateQueries({ queryKey: ['conecta', 'comentarios', p.id] }); aoMudar(); };
  const principais = (q.data ?? []).filter((c) => !c.pai_id);
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
      {q.isLoading ? <Carregando texto="Carregando comentários..." /> : principais.length > 0 && (
        <ul className="flex flex-col gap-3">
          {principais.map((c) => {
            const filhas = (q.data ?? []).filter((r) => r.pai_id === c.id);
            return (
              <ItemComentario key={c.id} c={c} publicacaoId={p.id} podeModerar={podeModerar} aoMudar={atualizar}
                aoResponder={p.oculta ? undefined : () => setRespondendo(respondendo === c.id ? null : c.id)} respondendo={respondendo === c.id}
                respostas={<>
                  {filhas.length > 0 && <ul className="mt-2 flex flex-col gap-2">{filhas.map((r) => <ItemComentario key={r.id} c={r} publicacaoId={p.id} podeModerar={podeModerar} aoMudar={atualizar} />)}</ul>}
                  {respondendo === c.id && <div className="mt-2"><CaixaComentario publicacaoId={p.id} paiId={c.id} aoConcluir={() => { setRespondendo(null); atualizar(); }} aoCancelar={() => setRespondendo(null)} /></div>}
                </>} />
            );
          })}
        </ul>
      )}
      {!p.oculta && <CaixaComentario publicacaoId={p.id} paiId={null} aoConcluir={atualizar} />}
    </div>
  );
}

// ---------------------------------------------------------------- publicação

function Menu({ itens }: { itens: Array<{ rotulo: string; icone: ReactNode; acao: () => void; perigo?: boolean } | false> }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  const validos = itens.filter((i): i is Exclude<typeof i, false> => !!i);
  if (!validos.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setAberto((a) => !a)} aria-label="Mais opções" aria-expanded={aberto}><MoreHorizontal className="size-5" /></button>
      {aberto && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg" role="menu">
          {validos.map((i) => (
            <button key={i.rotulo} role="menuitem" onClick={() => { setAberto(false); i.acao(); }}
              className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50', i.perigo ? 'text-red-700' : 'text-slate-700')}>{i.icone}{i.rotulo}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoPublicacao({ p, podeModerar, aoEditar, comentariosAbertos = false }: { p: Publicacao; podeModerar: boolean; aoEditar: (p: Publicacao) => void; comentariosAbertos?: boolean }) {
  const qc = useQueryClient();
  const [verComentarios, setVerComentarios] = useState(comentariosAbertos);
  const [expandido, setExpandido] = useState(false);
  const [acao, setAcao] = useState<null | 'excluir' | 'ocultar' | 'denunciar' | 'fixar'>(null);
  const [ate, setAte] = useState('');
  const atualizar = () => qc.invalidateQueries({ queryKey: ['conecta'] });
  const like = useMutation({ mutationFn: () => curtir(p.id), onSuccess: () => atualizar(), onError: (e) => toast.error(mensagemDeErro(e)) });
  const longo = p.texto.length > 600;
  const imagens = p.anexos.filter((a) => a.tipo === 'IMAGEM');
  const docs = p.anexos.filter((a) => a.tipo === 'DOCUMENTO');
  const cor = CORES_CATEGORIA[p.categoria.cor] ?? CORES_CATEGORIA.marca!;
  const curtida = like.isPending ? !p.eu_curti : p.eu_curti;
  return (
    <article id={`pub-${p.id}`} className={cx('rounded-xl border bg-white', p.fixada ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200', p.oculta && 'opacity-80')}>
      {(p.fixada || p.oculta) && (
        <div className={cx('flex items-center gap-1.5 rounded-t-xl px-4 py-1.5 text-xs font-medium', p.oculta ? 'bg-amber-50 text-amber-900' : 'bg-amber-50 text-amber-800')}>
          {p.oculta ? <><EyeOff className="size-3.5" />Oculta pela moderação{p.motivo_ocultacao ? `: ${p.motivo_ocultacao}` : ''} (só você e a moderação veem)</>
            : <><Pin className="size-3.5" />Destaque{p.fixada_ate ? ` até ${new Date(p.fixada_ate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}</>}
        </div>
      )}
      <div className="p-4 sm:p-5">
        <header className="flex items-start gap-3">
          <FotoPessoa nome={p.autor.nome} caminho={p.autor.avatar_path} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{p.autor.nome}</p>
            <p className="truncate text-xs text-slate-500">{[p.autor.cargo, rotuloLotacao(p.autor.lotacao)].filter(Boolean).join(' · ') || 'Servidor'}</p>
            <p className="text-xs text-slate-500" title={formatarDataHora(p.criado_em)}>{formatarDataHora(p.criado_em)}{p.editada_em && ' · editada'}</p>
          </div>
          <span className={cx('hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex', cor.icone)} aria-hidden><IconeCategoria c={p.categoria} tamanho="size-5" /></span>
          <Menu itens={[
            p.sou_autor && { rotulo: 'Editar', icone: <Pencil className="size-4" />, acao: () => aoEditar(p) },
            podeModerar && { rotulo: p.fixada ? 'Retirar destaque' : 'Destacar no topo', icone: p.fixada ? <PinOff className="size-4" /> : <Pin className="size-4" />,
              acao: () => { if (p.fixada) void fixarPublicacao(p.id, false, null).then(atualizar).then(() => toast.success('Destaque retirado.')).catch((e) => toast.error(mensagemDeErro(e))); else setAcao('fixar'); } },
            podeModerar && !p.sou_autor && { rotulo: p.oculta ? 'Restaurar publicação' : 'Ocultar (moderação)', icone: <EyeOff className="size-4" />,
              acao: () => { if (p.oculta) void moderarPublicacao(p.id, false).then(atualizar).then(() => toast.success('Publicação restaurada.')).catch((e) => toast.error(mensagemDeErro(e))); else setAcao('ocultar'); } },
            !p.sou_autor && { rotulo: 'Denunciar', icone: <Flag className="size-4" />, acao: () => setAcao('denunciar') },
            (p.sou_autor || podeModerar) && { rotulo: 'Excluir', icone: <Trash2 className="size-4" />, acao: () => setAcao('excluir'), perigo: true },
          ]} />
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-1.5"><SeloCategoria c={p.categoria} /></div>
        <h2 className="mt-2 text-base font-semibold text-slate-900 sm:text-lg">{p.titulo}</h2>
        <p className={cx('mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700', longo && !expandido && 'line-clamp-6')}>{p.texto}</p>
        {longo && <button className="mt-1 text-sm font-medium text-marca-700 hover:underline" onClick={() => setExpandido((x) => !x)}>{expandido ? 'Ver menos' : 'Ver mais'}</button>}
        <Galeria imagens={imagens} />
        <Documentos docs={docs} />
        <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600">Para:</span>
          {p.para_todos ? <Selo icone={<Globe2 className="size-3" />}>Todos</Selo>
            : p.destinatarios.map((d, i) => <Selo key={i} tom={d.tipo === 'PESSOA' ? 'info' : 'neutro'}>{ROTULO_DESTINO[d.tipo]}: {d.rotulo}</Selo>)}
        </p>
      </div>
      <footer className="flex items-center gap-1 border-t border-slate-100 px-2 py-1.5 sm:px-3">
        <button onClick={() => like.mutate()} aria-pressed={curtida}
          className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', curtida ? 'text-rose-600' : 'text-slate-600 hover:bg-slate-50')}>
          <Heart className={cx('size-4', curtida && 'fill-rose-500')} />Curtir{p.curtidas > 0 && <span className="numero text-xs">({p.curtidas + (like.isPending ? (curtida ? 1 : -1) : 0)})</span>}
        </button>
        <button onClick={() => setVerComentarios((v) => !v)} aria-expanded={verComentarios}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <MessageCircle className="size-4" />Comentários{p.comentarios > 0 && <span className="numero text-xs">({p.comentarios})</span>}
        </button>
      </footer>
      {verComentarios && <div className="px-4 pb-4 sm:px-5"><Comentarios p={p} podeModerar={podeModerar} aoMudar={() => void atualizar()} /></div>}

      <ConfirmarComMotivo aberto={acao === 'excluir'} aoFechar={() => setAcao(null)} titulo="Excluir publicação?" minimo={p.sou_autor ? 0 : 5}
        descricao={p.sou_autor ? 'A publicação sai do mural para todos. O registro fica guardado na auditoria.' : 'Exclusão pela moderação: informe o motivo. O autor é avisado.'}
        rotuloConfirmar="Excluir" aoConfirmar={async (m) => { await excluirPublicacao(p.id, m); await atualizar(); toast.success('Publicação excluída.'); }} />
      <ConfirmarComMotivo aberto={acao === 'ocultar'} aoFechar={() => setAcao(null)} titulo="Ocultar publicação"
        descricao="Some para os destinatários; só o autor e a moderação continuam vendo. O autor é avisado com o motivo." rotuloConfirmar="Ocultar"
        aoConfirmar={async (m) => { await moderarPublicacao(p.id, true, m); await atualizar(); toast.success('Publicação ocultada.'); }} />
      <ConfirmarComMotivo aberto={acao === 'denunciar'} aoFechar={() => setAcao(null)} titulo="Denunciar publicação" perigo={false}
        descricao="A moderação do CONECTA vai analisar. Explique o problema." rotuloConfirmar="Enviar denúncia"
        aoConfirmar={async (m) => { await denunciar(p.id, m); toast.success('Denúncia enviada à moderação.'); }} />
      <Modal aberto={acao === 'fixar'} aoFechar={() => setAcao(null)} titulo="Destacar no topo do mural" largura="sm"
        rodape={<><Botao variante="secundario" onClick={() => setAcao(null)}>Cancelar</Botao>
          <Botao icone={<Pin className="size-4" />} onClick={async () => {
            try { await fixarPublicacao(p.id, true, ate ? new Date(`${ate}T23:59:59-03:00`).toISOString() : null); await atualizar(); toast.success('Publicação destacada.'); setAcao(null); }
            catch (e) { toast.error(mensagemDeErro(e)); }
          }}>Destacar</Botao></>}>
        <Campo rotulo="Destacar até (opcional)" type="date" value={ate} onChange={(e) => setAte(e.target.value)} ajuda="Sem data, o destaque fica até ser retirado." />
      </Modal>
    </article>
  );
}

// ---------------------------------------------------------------- página

function SinoConecta() {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['mensagens', orgao?.id, 'CONECTA'], queryFn: () => minhasMensagens(orgao!.id, 'CONECTA', 15), enabled: !!orgao, refetchInterval: 60_000 });
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  const n = q.data?.nao_lidas ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50" onClick={() => setAberto((a) => !a)}
        aria-label={n ? `${n} notificações do CONECTA não lidas` : 'Notificações do CONECTA'} aria-expanded={aberto}>
        <Bell className="size-5" />
        {n > 0 && <span className="numero absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-5 text-white">{n > 9 ? '9+' : n}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold">Notificações</p>
            {n > 0 && <button className="text-xs font-medium text-marca-700 hover:underline" onClick={async () => { await marcarMensagensLidas(orgao!.id, null, 'CONECTA'); void qc.invalidateQueries({ queryKey: ['mensagens'] }); }}>Marcar como lidas</button>}
          </div>
          {!q.data?.itens.length ? <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhuma notificação.</p> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {q.data.itens.map((m) => (
                <li key={m.id}><button className={cx('block w-full px-4 py-2.5 text-left hover:bg-slate-50', !m.lida_em && 'bg-marca-50/60')}
                  onClick={async () => { setAberto(false); if (!m.lida_em) { await marcarMensagensLidas(orgao!.id, [m.id]).catch(() => undefined); void qc.invalidateQueries({ queryKey: ['mensagens'] }); } if (m.link) navegar(m.link); }}>
                  <span className={cx('block text-sm', !m.lida_em ? 'font-semibold text-slate-900' : 'text-slate-700')}>{m.titulo}</span>
                  {m.descricao && <span className="block truncate text-xs text-slate-500">{m.descricao}</span>}
                  <span className="block text-xs text-slate-500">{tempoRelativo(m.criado_em)}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Conecta() {
  const { orgao, contexto, pode } = useSessao();
  const [params, setParams] = useSearchParams();
  const pubUnica = params.get('p');
  const [filtroId, setFiltroId] = useState('todas');
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [avancado, setAvancado] = useState(false);
  const [avc, setAvc] = useState<{ autor: string; categoria_id: string; de: string; ate: string; unidade: { id: string; rotulo: string } | null }>({ autor: '', categoria_id: '', de: '', ate: '', unidade: null });
  const autorAtrasado = useBuscaAtrasada(avc.autor);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Publicacao | null>(null);
  const lateral = useQuery({ queryKey: ['conecta', 'lateral', orgao?.id], queryFn: () => painelLateral(orgao!.id), enabled: !!orgao });
  const categorias = useQuery({ queryKey: ['conecta-categorias', orgao?.id], queryFn: () => listarCategorias(orgao!.id), enabled: !!orgao });
  const logo = useQuery({ queryKey: ['url', 'arquivos', orgao?.logo_path], queryFn: () => urlArquivo('arquivos', orgao?.logo_path), enabled: !!orgao?.logo_path });
  const f = FILTROS.find((x) => x.id === filtroId)!;
  const categoriaDoFiltro = f.categoria ? categorias.data?.find((c) => c.codigo === f.categoria)?.id : undefined;
  const parametros = useMemo<ParametrosMural>(() => ({
    filtro: f.filtro, busca: termo || undefined, autor: autorAtrasado || undefined,
    categoria_id: avc.categoria_id || categoriaDoFiltro || undefined, unidade_id: avc.unidade?.id, de: avc.de || undefined, ate: avc.ate || undefined,
    id: pubUnica ?? undefined,
  }), [f.filtro, termo, autorAtrasado, avc.categoria_id, categoriaDoFiltro, avc.unidade, avc.de, avc.ate, pubUnica]);
  const feed = useInfiniteQuery({
    queryKey: ['conecta', 'feed', orgao?.id, parametros],
    queryFn: ({ pageParam }) => mural(orgao!.id, { ...parametros, limite: POR_PAGINA, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => { const n = todas.reduce((s, p) => s + p.itens.length, 0); return n < ultima.total ? n : undefined; },
    enabled: !!orgao && (!f.categoria || !!categorias.data),
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  const primeira = feed.data?.pages[0];
  const itens = feed.data?.pages.flatMap((p) => p.itens) ?? [];
  const podeModerar = !!primeira?.pode_moderar;
  const perfil = contexto?.perfil;
  const filtrosVisiveis = FILTROS.filter((x) => (x.filtro !== 'MINHA_DIRETORIA' || primeira?.minha_diretoria !== false) && (x.filtro !== 'MINHA_COORDENACAO' || primeira?.minha_coordenacao !== false));
  const limparAvancado = () => setAvc({ autor: '', categoria_id: '', de: '', ate: '', unidade: null });
  const temAvancado = !!(avc.autor || avc.categoria_id || avc.de || avc.ate || avc.unidade);

  return (
    <div className="-mt-2">
      {/* Cabeçalho do módulo */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-marca-900 to-marca-700 px-4 py-3 text-white sm:px-5">
        {logo.data ? <img src={logo.data} alt="" className="size-10 rounded-lg bg-white/95 object-contain p-0.5" /> : <span className="flex size-10 items-center justify-center rounded-lg bg-white/15"><Landmark className="size-5" /></span>}
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight tracking-wide">CONECTA</p>
          <p className="truncate text-xs text-marca-100">Comunicação institucional · {orgao.nome_curto}</p>
        </div>
        <div className="order-last w-full sm:order-none sm:w-72">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400" placeholder="Pesquisar no mural..."
              value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Pesquisar publicações" />
          </div>
        </div>
        <SinoConecta />
        {(podeModerar || pode('conecta', 'editar')) && <Link to="/conecta/admin" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10" title="Administração do CONECTA" aria-label="Administração do CONECTA"><Settings2 className="size-5" /></Link>}
        {perfil && <Link to="/meu-perfil" title="Meu perfil"><FotoPessoa nome={perfil.nome || perfil.email} caminho={perfil.avatar_path} /></Link>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Criar publicação */}
          <button onClick={() => setCriando(true)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-marca-300 hover:shadow-sm sm:p-4">
            {perfil && <FotoPessoa nome={perfil.nome || perfil.email} caminho={perfil.avatar_path} />}
            <span className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm text-slate-500">O que você gostaria de compartilhar?</span>
            <span className="hidden items-center gap-1 text-sm text-slate-500 sm:flex"><Paperclip className="size-4" />Fotos e documentos</span>
          </button>

          {pubUnica ? (
            <div className="flex items-center justify-between rounded-lg bg-marca-50 px-3 py-2 text-sm text-marca-900">
              <span>Exibindo uma publicação.</span>
              <Botao pequeno variante="secundario" onClick={() => { params.delete('p'); setParams(params, { replace: true }); }}>Ver todo o mural</Botao>
            </div>
          ) : <>
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-1.5">
              {filtrosVisiveis.map((x) => (
                <button key={x.id} onClick={() => setFiltroId(x.id)} aria-pressed={filtroId === x.id}
                  className={cx('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset', filtroId === x.id ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{x.rotulo}</button>
              ))}
              <button onClick={() => setAvancado((a) => !a)} aria-expanded={avancado}
                className={cx('ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset', temAvancado ? 'bg-amber-50 text-amber-900 ring-amber-300' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
                <SlidersHorizontal className="size-3.5" />Pesquisa avançada
              </button>
            </div>
            {avancado && (
              <Cartao>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Campo rotulo="Nome do autor" value={avc.autor} onChange={(e) => setAvc({ ...avc, autor: e.target.value })} placeholder="Ex.: Maria" />
                  <Selecao rotulo="Categoria" value={avc.categoria_id} onChange={(e) => setAvc({ ...avc, categoria_id: e.target.value })}>
                    <option value="">Todas</option>{categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Selecao>
                  <BuscaSelect rotulo="Diretoria ou coordenação" valor={avc.unidade?.id ?? null} rotuloValor={avc.unidade?.rotulo} chave={['conecta-filtro-un', orgao.id]}
                    aoMudar={(v, o) => setAvc({ ...avc, unidade: v && o ? { id: v, rotulo: o.rotulo } : null })}
                    buscar={async (t) => [...await buscarUnidadesDestino(orgao.id, 'DIRETORIA', t), ...await buscarUnidadesDestino(orgao.id, 'COORDENACAO', t)]
                      .map((u) => ({ valor: u.id, rotulo: `${u.sigla ? `${u.sigla} – ` : ''}${u.nome}`, detalhe: u.tipo === 'DIRETORIA' ? 'Diretoria' : `Coordenação${u.detalhe ? ` · ${u.detalhe}` : ''}` }))} />
                  <Campo rotulo="De" type="date" value={avc.de} onChange={(e) => setAvc({ ...avc, de: e.target.value })} />
                  <Campo rotulo="Até" type="date" value={avc.ate} onChange={(e) => setAvc({ ...avc, ate: e.target.value })} />
                  <div className="flex items-end">{temAvancado && <Botao variante="fantasma" onClick={limparAvancado}>Limpar filtros</Botao>}</div>
                </div>
              </Cartao>
            )}
          </>}

          {feed.isLoading ? <Carregando /> : feed.isError ? <CaixaErro mensagem={traduzirErro(feed.error).mensagem} tentarDeNovo={() => void feed.refetch()} />
            : !itens.length ? <Cartao><Vazio titulo={pubUnica ? 'Publicação não encontrada' : 'Nenhuma publicação por aqui'}
                descricao={pubUnica ? 'Ela pode ter sido excluída ou não estar direcionada a você.' : termo || temAvancado || filtroId !== 'todas' ? 'Ajuste a pesquisa ou os filtros.' : 'Seja o primeiro a compartilhar uma informação com os colegas.'} /></Cartao>
            : <>
              {itens.map((p) => <CartaoPublicacao key={p.id} p={p} podeModerar={podeModerar} aoEditar={setEditando} comentariosAbertos={!!pubUnica} />)}
              {feed.hasNextPage && <Botao variante="secundario" className="self-center" carregando={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>Carregar mais publicações</Botao>}
            </>}
        </div>

        {/* Painel lateral */}
        <aside className="flex flex-col gap-4">
          <Cartao titulo={<span className="inline-flex items-center gap-1.5"><Pin className="size-4 text-amber-600" />Comunicados destacados</span>}>
            {!lateral.data?.destaques.length ? <p className="text-sm text-slate-500">Nenhum destaque no momento.</p> : (
              <ul className="flex flex-col gap-2">{lateral.data.destaques.map((d) => (
                <li key={d.id}><Link to={`/conecta?p=${d.id}`} className="block text-sm font-medium text-slate-800 hover:text-marca-700 hover:underline">{d.titulo}</Link>
                  <span className="text-xs text-slate-500">{tempoRelativo(d.criado_em)}</span></li>))}</ul>
            )}
          </Cartao>
          <Cartao titulo="Publicações recentes">
            {!lateral.data?.recentes.length ? <p className="text-sm text-slate-500">Ainda não há publicações.</p> : (
              <ul className="flex flex-col gap-2">{lateral.data.recentes.map((d) => (
                <li key={d.id}><Link to={`/conecta?p=${d.id}`} className="line-clamp-2 text-sm text-slate-800 hover:text-marca-700 hover:underline">{d.titulo}</Link>
                  <span className="text-xs text-slate-500">{tempoRelativo(d.criado_em)}</span></li>))}</ul>
            )}
          </Cartao>
          <Cartao titulo="Categorias">
            <ul className="flex flex-col gap-0.5">
              {(lateral.data?.categorias ?? []).map((c) => (
                <li key={c.id}><button onClick={() => { setAvancado(true); setFiltroId('todas'); setAvc({ ...avc, categoria_id: avc.categoria_id === c.id ? '' : c.id }); if (pubUnica) { params.delete('p'); setParams(params, { replace: true }); } }}
                  className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50', avc.categoria_id === c.id && 'bg-marca-50 font-medium')}>
                  <span className={cx('flex size-6 items-center justify-center rounded-md', (CORES_CATEGORIA[c.cor] ?? CORES_CATEGORIA.marca!).icone)}><IconeCategoria c={c} tamanho="size-3.5" /></span>
                  <span className="flex-1 truncate">{c.nome}</span><span className="numero text-xs text-slate-500">{c.total}</span>
                </button></li>
              ))}
            </ul>
          </Cartao>
          <Cartao titulo="Filtrar por diretoria ou coordenação">
            <BuscaSelect rotulo="Unidade" valor={avc.unidade?.id ?? null} rotuloValor={avc.unidade?.rotulo} chave={['conecta-filtro-un2', orgao.id]}
              aoMudar={(v, o) => { setAvc({ ...avc, unidade: v && o ? { id: v, rotulo: o.rotulo } : null }); if (pubUnica) { params.delete('p'); setParams(params, { replace: true }); } }}
              buscar={async (t) => [...await buscarUnidadesDestino(orgao.id, 'DIRETORIA', t), ...await buscarUnidadesDestino(orgao.id, 'COORDENACAO', t)]
                .map((u) => ({ valor: u.id, rotulo: `${u.sigla ? `${u.sigla} – ` : ''}${u.nome}`, detalhe: u.tipo === 'DIRETORIA' ? 'Diretoria' : 'Coordenação' }))} />
            <p className="mt-2 text-xs text-slate-500">Mostra o que foi publicado por quem está na unidade ou direcionado a ela.</p>
          </Cartao>
        </aside>
      </div>

      <FormPublicacao aberto={criando || !!editando} aoFechar={() => { setCriando(false); setEditando(null); }} editando={editando} />
    </div>
  );
}
