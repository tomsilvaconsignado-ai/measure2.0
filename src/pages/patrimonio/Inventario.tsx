// Inventário patrimonial: conferência física dos bens de uma unidade, com avaliação de conservação,
// divergências, bens não localizados e bens encontrados sem cadastro. Gera o relatório em PDF.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, FileDown, Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import {
  abrirInventario, bemSemCadastro, conferirItem, CONSERVACAO, encerrarInventario, listarInventarios, obterInventario, STATUS_INVENTARIO, type Inventario as TInventario,
} from '@/services/patrimonio';
import { rotuloUnidade, SeletorLocal, SeletorSetor } from './comum';
import { pdfInventario } from './pdf';

function NovoInventario({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [setor, setSetor] = useState<{ id: string; rotulo: string } | null>(null);
  const [local, setLocal] = useState<{ id: string; rotulo: string } | null>(null);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const criar = useMutation({
    mutationFn: () => abrirInventario(orgao!.id, { titulo: titulo.trim(), unidade_id: setor!.id, local_id: local?.id ?? null, observacoes: obs.trim() || null }),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['patrimonio'] }); toast.success('Inventário aberto com a lista dos bens cadastrados.'); aoFechar(); aoCriar(id); },
    onError: (e) => setErro(traduzirErro(e).mensagem),
  });
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Novo inventário" largura="md"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending} disabled={titulo.trim().length < 3 || !setor} onClick={() => criar.mutate()}>Abrir inventário</Botao></>}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Título" obrigatorio value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Inventário anual 2026 – COINFRA" maxLength={200} />
        <SeletorSetor rotulo="Diretoria, coordenação ou setor" obrigatorio valor={setor?.id ?? null} rotuloValor={setor?.rotulo} aoMudar={(v, o) => setSetor(v && o ? { id: v, rotulo: o.rotulo } : null)}
          ajuda="Entram os bens deste setor e dos setores abaixo dele (sem os baixados)." />
        <SeletorLocal rotulo="Somente da unidade (opcional)" valor={local?.id ?? null} rotuloValor={local?.rotulo} aoMudar={(v, o) => setLocal(v && o ? { id: v, rotulo: o.rotulo } : null)} />
        <AreaTexto rotulo="Observações" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} />
        {erro && <CaixaErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

function ItemConferencia({ inv, item, aoMudar }: { inv: TInventario; item: TInventario['itens'][number]; aoMudar: () => void }) {
  const [status, setStatus] = useState(item.status);
  const [cons, setCons] = useState(item.conservacao_avaliada ?? '');
  const [obs, setObs] = useState(item.observacao ?? '');
  const [fotos, setFotos] = useState(false);
  const salvar = useMutation({
    mutationFn: () => conferirItem(item.id, { status, conservacao: cons || null, observacao: obs || null }),
    onSuccess: () => { toast.success(`Conferência de ${item.bem?.numero ?? 'item'} registrada.`); aoMudar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const mudou = status !== item.status || cons !== (item.conservacao_avaliada ?? '') || obs !== (item.observacao ?? '');
  const [rot, tom] = STATUS_INVENTARIO[item.status] ?? [item.status, 'neutro' as const];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium"><span className="font-mono">{item.bem?.numero ?? item.numero_encontrado ?? '(sem número)'}</span> · {item.bem?.descricao ?? item.descricao_encontrada}</p>
          {item.bem && <p className="text-xs text-slate-500">{[item.bem.unidade, item.bem.local, item.bem.sala, item.bem.responsavel].filter(Boolean).join(' · ')} · cadastro: {CONSERVACAO[item.bem.conservacao]}</p>}
          {item.conferido_em && <p className="text-xs text-slate-400">Conferido por {item.conferido_por} em {formatarDataHora(item.conferido_em)}</p>}
        </div>
        <Selo tom={tom}>{rot}</Selo>
      </div>
      {inv.pode_editar && item.bem && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[12rem_12rem_1fr_auto] sm:items-end">
          <Selecao rotulo="Conferência" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['PENDENTE', 'LOCALIZADO', 'NAO_LOCALIZADO', 'DIVERGENCIA', 'NECESSITA_AVALIACAO'].map((k) => <option key={k} value={k}>{STATUS_INVENTARIO[k]![0]}</option>)}
          </Selecao>
          <Selecao rotulo="Conservação avaliada" value={cons} onChange={(e) => setCons(e.target.value)}>
            <option value="">Não avaliar</option>{Object.entries(CONSERVACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          <Campo rotulo="Observação / divergência" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} />
          <div className="flex gap-1">
            <Botao pequeno variante="fantasma" onClick={() => setFotos((x) => !x)}>Fotos</Botao>
            <Botao pequeno disabled={!mudou} carregando={salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Botao>
          </div>
        </div>
      )}
      {fotos && item.bem && <div className="mt-2"><Anexos recurso="patrimonio" registroId={inv.id} unidadeId={inv.unidade_id} categoria="FOTO" titulo="Fotografias do inventário" /></div>}
    </li>
  );
}

function DetalheInventario({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { orgao, contexto } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['patrimonio', 'inventario', id], queryFn: () => obterInventario(id) });
  const [filtro, setFiltro] = useState('');
  const [semCad, setSemCad] = useState(false);
  const [sc, setSc] = useState({ descricao: '', numero: '', observacao: '' });
  const [cancelando, setCancelando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const atualizar = () => void qc.invalidateQueries({ queryKey: ['patrimonio'] });
  const inv = q.data;
  const itens = (inv?.itens ?? []).filter((i) => !filtro || i.status === filtro);
  return (
    <Modal aberto aoFechar={aoFechar} largura="lg" titulo={inv?.titulo ?? 'Inventário'} descricao={inv ? `${rotuloUnidade(inv.unidade)}${inv.local ? ` · ${inv.local}` : ''} · responsável: ${inv.responsavel}` : undefined}
      rodape={inv && <>
        <Botao variante="fantasma" icone={<FileDown className="size-4" />} carregando={gerando} onClick={async () => {
          setGerando(true); try { await pdfInventario(orgao!.id, inv, contexto?.perfil?.nome || contexto?.perfil?.email || ''); } catch (e) { toast.error(mensagemDeErro(e)); } finally { setGerando(false); }
        }}>Relatório em PDF</Botao>
        {inv.pode_editar && <>
          <Botao variante="fantasma" onClick={() => setCancelando(true)}>Cancelar inventário</Botao>
          <Botao variante="secundario" icone={<Plus className="size-4" />} onClick={() => setSemCad(true)}>Bem encontrado sem cadastro</Botao>
          <Botao icone={<Lock className="size-4" />} onClick={async () => { try { await encerrarInventario(id); atualizar(); toast.success('Inventário encerrado.'); } catch (e) { toast.error(mensagemDeErro(e)); } }}>Encerrar</Botao>
        </>}
      </>}>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !inv ? null : <>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button onClick={() => setFiltro('')} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', !filtro ? 'bg-marca-700 text-white ring-marca-700' : 'ring-slate-300')}>Todos ({inv.itens.length})</button>
          {Object.entries(STATUS_INVENTARIO).map(([k, [r]]) => (inv.resumo?.[k] ? (
            <button key={k} onClick={() => setFiltro(k)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', filtro === k ? 'bg-marca-700 text-white ring-marca-700' : 'ring-slate-300')}>{r} ({inv.resumo[k]})</button>
          ) : null))}
        </div>
        {inv.situacao !== 'ABERTO' && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Inventário {inv.situacao === 'CONCLUIDO' ? 'encerrado' : 'cancelado'} em {formatarDataHora(inv.concluido_em)}. Somente consulta.</p>}
        {!itens.length ? <Vazio titulo="Nenhum item" /> : <ul className="divide-y divide-slate-100">{itens.map((i) => <ItemConferencia key={i.id} inv={inv} item={i} aoMudar={atualizar} />)}</ul>}
      </>}
      <Modal aberto={semCad} aoFechar={() => setSemCad(false)} titulo="Bem encontrado sem cadastro" largura="sm"
        rodape={<><Botao variante="secundario" onClick={() => setSemCad(false)}>Cancelar</Botao>
          <Botao disabled={sc.descricao.trim().length < 3} onClick={async () => { try { await bemSemCadastro(id, sc); setSemCad(false); setSc({ descricao: '', numero: '', observacao: '' }); atualizar(); toast.success('Registrado.'); } catch (e) { toast.error(mensagemDeErro(e)); } }}>Registrar</Botao></>}>
        <div className="flex flex-col gap-3">
          <Campo rotulo="Descrição do bem" obrigatorio value={sc.descricao} onChange={(e) => setSc({ ...sc, descricao: e.target.value })} />
          <Campo rotulo="Número / plaqueta encontrada" value={sc.numero} onChange={(e) => setSc({ ...sc, numero: e.target.value })} />
          <AreaTexto rotulo="Observação (onde estava, estado...)" value={sc.observacao} onChange={(e) => setSc({ ...sc, observacao: e.target.value })} />
        </div>
      </Modal>
      <ConfirmarComMotivo aberto={cancelando} aoFechar={() => setCancelando(false)} titulo="Cancelar inventário" descricao="As conferências feitas ficam registradas." rotuloConfirmar="Cancelar inventário"
        aoConfirmar={async (m) => { await encerrarInventario(id, true, m); atualizar(); toast.success('Inventário cancelado.'); }} />
    </Modal>
  );
}

export function Inventario() {
  const { orgao, pode } = useSessao();
  const [params, setParams] = useSearchParams();
  const [novo, setNovo] = useState(false);
  const q = useQuery({ queryKey: ['patrimonio', 'inventarios', orgao?.id], queryFn: () => listarInventarios(orgao!.id), enabled: !!orgao });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('patrimonio', 'ler')) return <SemPermissao />;
  const abrir = (id: string | null) => { if (id) params.set('i', id); else params.delete('i'); setParams(params, { replace: true }); };
  return (
    <>
      <CabecalhoPagina titulo="Inventário patrimonial" descricao="Conferência física dos bens por unidade, diretoria ou coordenação."
        acoes={pode('patrimonio', 'editar') && <Botao icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>Novo inventário</Botao>} />
      <Cartao>
        {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio titulo="Nenhum inventário" descricao="Abra um inventário para conferir os bens de uma unidade." /> : (
          <ul className="divide-y divide-slate-100">{q.data.map((i) => (
            <li key={i.id}><button className="flex w-full items-center gap-3 py-3 text-left" onClick={() => abrir(i.id)}>
              {i.situacao === 'ABERTO' ? <ClipboardList className="size-5 text-amber-600" /> : <CheckCircle2 className="size-5 text-emerald-600" />}
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{i.titulo}</span>
                <span className="block text-xs text-slate-500">{i.unidade?.sigla ?? i.unidade?.nome} · iniciado em {formatarDataHora(i.iniciado_em)}</span></span>
              <Selo tom={i.situacao === 'ABERTO' ? 'alerta' : i.situacao === 'CONCLUIDO' ? 'sucesso' : 'neutro'}>{i.situacao === 'ABERTO' ? 'Em andamento' : i.situacao === 'CONCLUIDO' ? 'Encerrado' : 'Cancelado'}</Selo>
            </button></li>))}</ul>
        )}
      </Cartao>
      <NovoInventario aberto={novo} aoFechar={() => setNovo(false)} aoCriar={abrir} />
      {params.get('i') && <DetalheInventario id={params.get('i')!} aoFechar={() => abrir(null)} />}
    </>
  );
}
