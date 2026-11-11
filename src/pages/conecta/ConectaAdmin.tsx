// Administração do CONECTA: estatísticas, denúncias, publicações ocultas, categorias e tipos de arquivo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Flag, Pencil, Plus, Power, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Abas } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Interruptor, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import { obterConfiguracoes, salvarConfiguracoes } from '@/services/api';
import {
  definirStatusCategoria, listarCategorias, moderarPublicacao, painelAdmin, resolverDenuncia, salvarCategoria, TIPOS_CONECTA, type CategoriaConecta,
} from '@/services/conecta';
import { CORES_CATEGORIA, ICONES_CATEGORIA, IconeCategoria, SeloCategoria } from './comum';

const EXTRAS = Object.keys(TIPOS_CONECTA).filter((m) => !m.startsWith('image/') && m !== 'application/pdf');

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{rotulo}</p><p className="numero mt-1 text-2xl font-semibold text-slate-900">{valor}</p></div>;
}

function Barras({ titulo, dados }: { titulo: string; dados: Array<{ nome: string; total: number }> }) {
  const max = Math.max(1, ...dados.map((d) => d.total));
  return (
    <Cartao titulo={titulo}>
      {!dados.length ? <p className="text-sm text-slate-500">Sem dados.</p> : (
        <ul className="flex flex-col gap-2">{dados.map((d) => (
          <li key={d.nome} className="text-sm"><div className="flex justify-between"><span className="truncate">{d.nome}</span><span className="numero text-slate-500">{d.total}</span></div>
            <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-marca-600" style={{ width: `${(d.total / max) * 100}%` }} /></div></li>
        ))}</ul>
      )}
    </Cartao>
  );
}

function FormCategoria({ c, aberto, aoFechar }: { c: CategoriaConecta | null; aberto: boolean; aoFechar: () => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [f, setF] = useState({ nome: c?.nome ?? '', icone: c?.icone ?? 'mensagem', cor: c?.cor ?? 'marca', ordem: String(c?.ordem ?? 130) });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => salvarCategoria(orgao!.id, c?.id ?? null, { nome: f.nome.trim(), icone: f.icone, cor: f.cor, ordem: Number(f.ordem) || 100 }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['conecta-categorias'] }); await qc.invalidateQueries({ queryKey: ['conecta'] }); toast.success('Categoria salva.'); aoFechar(); },
    onError: (e) => setErro(/duplicate|conecta_categorias_nome/.test(String((e as Error).message)) ? 'Já existe uma categoria com esse nome.' : traduzirErro(e).mensagem),
  });
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={c ? 'Editar categoria' : 'Nova categoria'} largura="sm"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvar.isPending} disabled={f.nome.trim().length < 2} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Nome" obrigatorio value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={60} />
        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Ícone" value={f.icone} onChange={(e) => setF({ ...f, icone: e.target.value })}>
            {Object.entries(ICONES_CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </Selecao>
          <Selecao rotulo="Cor" value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })}>
            {Object.entries(CORES_CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </Selecao>
        </div>
        <Campo rotulo="Ordem" type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} ajuda="Menor aparece primeiro." />
        <div><span className="text-xs text-slate-500">Prévia: </span><SeloCategoria c={{ nome: f.nome || 'Categoria', icone: f.icone, cor: f.cor }} /></div>
        {erro && <CaixaErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

export function ConectaAdmin() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [aba, setAba] = useState<'painel' | 'denuncias' | 'ocultas' | 'categorias' | 'arquivos' | 'permissoes'>('painel');
  const moderador = pode('conecta', 'aprovar');
  const q = useQuery({ queryKey: ['conecta', 'admin', orgao?.id], queryFn: () => painelAdmin(orgao!.id), enabled: !!orgao && moderador });
  const cats = useQuery({ queryKey: ['conecta-categorias', orgao?.id], queryFn: () => listarCategorias(orgao!.id), enabled: !!orgao });
  const config = useQuery({ queryKey: ['configuracoes', orgao?.id], queryFn: () => obterConfiguracoes(orgao!.id), enabled: !!orgao && pode('configuracoes', 'ler') });
  const [denuncia, setDenuncia] = useState<{ id: string; procedente: boolean } | null>(null);
  const [categoria, setCategoria] = useState<CategoriaConecta | null | 'nova'>(null);
  const [inativando, setInativando] = useState<CategoriaConecta | null>(null);
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!moderador && !pode('conecta', 'editar')) return <SemPermissao texto="Somente a moderação do CONECTA acessa a administração." />;
  const d = q.data;
  const extras = ((config.data?.textos ?? {}) as Record<string, unknown>).conecta_tipos_extras as string[] | undefined ?? [];
  const mudarExtra = async (mime: string, ligado: boolean) => {
    try {
      const textos = { ...((config.data?.textos ?? {}) as Record<string, unknown>), conecta_tipos_extras: ligado ? [...new Set([...extras, mime])] : extras.filter((x) => x !== mime) };
      await salvarConfiguracoes(orgao.id, { textos } as never);
      await qc.invalidateQueries({ queryKey: ['configuracoes'] }); await qc.invalidateQueries({ queryKey: ['conecta-tipos'] });
      toast.success('Tipos de arquivo atualizados.');
    } catch (e) { toast.error(mensagemDeErro(e)); }
  };
  const abertas = d?.denuncias.filter((x) => x.situacao === 'ABERTA').length ?? 0;
  return (
    <>
      <CabecalhoPagina titulo="Administração do CONECTA" descricao="Moderação, categorias, estatísticas e configurações do fórum institucional."
        acoes={<Link to="/conecta"><Botao variante="secundario" icone={<ArrowLeft className="size-4" />}>Voltar ao mural</Botao></Link>} />
      <Abas ativa={aba} aoMudar={setAba} abas={[
        { id: 'painel', rotulo: 'Estatísticas' }, { id: 'denuncias', rotulo: 'Denúncias', alerta: abertas },
        { id: 'ocultas', rotulo: 'Publicações ocultas' }, { id: 'categorias', rotulo: 'Categorias' }, { id: 'arquivos', rotulo: 'Tipos de arquivo' }, { id: 'permissoes', rotulo: 'Permissões' },
      ]} />
      {(aba === 'painel' || aba === 'denuncias' || aba === 'ocultas') && (q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !d ? null : <>
        {aba === 'painel' && <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Numero rotulo="Publicações" valor={d.publicacoes} /><Numero rotulo="Nos últimos 30 dias" valor={d.publicacoes_30d} />
            <Numero rotulo="Comentários" valor={d.comentarios} /><Numero rotulo="Curtidas" valor={d.curtidas} />
            <Numero rotulo="Pessoas que publicaram" valor={d.autores} /><Numero rotulo="Ocultas" valor={d.ocultas} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2"><Barras titulo="Publicações por categoria" dados={d.por_categoria} /><Barras titulo="Quem mais publica" dados={d.mais_ativos} /></div>
        </div>}
        {aba === 'denuncias' && <Cartao>
          {!d.denuncias.length ? <Vazio titulo="Nenhuma denúncia" /> : (
            <ul className="divide-y divide-slate-100">{d.denuncias.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start gap-3 py-3">
                <Flag className={cx('mt-0.5 size-4', x.situacao === 'ABERTA' ? 'text-amber-600' : 'text-slate-400')} />
                <div className="min-w-0 flex-1 text-sm">
                  <p><Link to={`/conecta?p=${x.publicacao_id}`} className="font-medium text-marca-700 hover:underline">{x.titulo}</Link>{x.comentario && <span className="text-slate-500"> · comentário: “{x.comentario.slice(0, 80)}”</span>}</p>
                  <p className="text-slate-700">Motivo: {x.motivo}</p>
                  <p className="text-xs text-slate-500">Por {x.denunciante} em {formatarDataHora(x.criado_em)}{x.resolucao && ` · Resolução: ${x.resolucao}`}</p>
                </div>
                {x.situacao === 'ABERTA' ? <div className="flex gap-2">
                  <Botao pequeno variante="perigo" icone={<CheckCircle2 className="size-4" />} onClick={() => setDenuncia({ id: x.id, procedente: true })}>Procedente</Botao>
                  <Botao pequeno variante="secundario" icone={<XCircle className="size-4" />} onClick={() => setDenuncia({ id: x.id, procedente: false })}>Improcedente</Botao>
                </div> : <Selo tom={x.situacao === 'PROCEDENTE' ? 'perigo' : 'neutro'}>{x.situacao === 'PROCEDENTE' ? 'Procedente' : 'Improcedente'}</Selo>}
              </li>))}</ul>
          )}
        </Cartao>}
        {aba === 'ocultas' && <Cartao>
          {!d.ocultas_lista.length ? <Vazio titulo="Nenhuma publicação oculta" /> : (
            <ul className="divide-y divide-slate-100">{d.ocultas_lista.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1"><Link to={`/conecta?p=${x.id}`} className="font-medium text-marca-700 hover:underline">{x.titulo}</Link>
                  <p className="text-xs text-slate-500">{x.autor} · ocultada em {formatarDataHora(x.oculta_em)}{x.motivo && ` · ${x.motivo}`}</p></div>
                <Botao pequeno variante="secundario" onClick={async () => { try { await moderarPublicacao(x.id, false); await qc.invalidateQueries({ queryKey: ['conecta'] }); toast.success('Publicação restaurada.'); } catch (e) { toast.error(mensagemDeErro(e)); } }}>Restaurar</Botao>
              </li>))}</ul>
          )}
        </Cartao>}
      </>)}
      {aba === 'categorias' && <Cartao acoes={pode('conecta', 'editar') && <Botao pequeno icone={<Plus className="size-4" />} onClick={() => setCategoria('nova')}>Nova categoria</Botao>}>
        {cats.isLoading ? <Carregando /> : (
          <ul className="divide-y divide-slate-100">{(cats.data ?? []).map((c) => (
            <li key={c.id} className={cx('flex items-center gap-3 py-2.5', !c.ativo && 'opacity-50')}>
              <span className={cx('flex size-8 items-center justify-center rounded-lg', (CORES_CATEGORIA[c.cor] ?? CORES_CATEGORIA.marca!).icone)}><IconeCategoria c={c} /></span>
              <span className="flex-1 text-sm font-medium">{c.nome}{!c.ativo && <Selo>inativa</Selo>}</span>
              {pode('conecta', 'editar') && <>
                <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${c.nome}`} onClick={() => setCategoria(c)} />
                <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={c.ativo ? `Desativar ${c.nome}` : `Reativar ${c.nome}`}
                  onClick={async () => { if (c.ativo) setInativando(c); else { try { await definirStatusCategoria(c.id, true, 'Reativação'); await qc.invalidateQueries({ queryKey: ['conecta-categorias'] }); } catch (e) { toast.error(mensagemDeErro(e)); } } }} />
              </>}
            </li>))}</ul>
        )}
      </Cartao>}
      {aba === 'arquivos' && <Cartao titulo="Documentos aceitos nas publicações">
        <p className="mb-3 text-sm text-slate-600">Fotografias (JPG, PNG, WEBP) e PDF são sempre aceitos. Abaixo, outros documentos que a administração pode autorizar. O limite de tamanho por arquivo é o do órgão (Configurações).</p>
        {!pode('configuracoes', 'editar') ? <p className="text-sm text-slate-500">Somente quem altera as configurações do órgão (Master) muda esta lista.</p> : config.isLoading ? <Carregando /> : (
          <div className="flex flex-col gap-3">{EXTRAS.map((m) => <Interruptor key={m} rotulo={TIPOS_CONECTA[m]!.rotulo} marcado={extras.includes(m)} aoMudar={(v) => void mudarExtra(m, v)} />)}</div>
        )}
      </Cartao>}
      {aba === 'permissoes' && <Cartao titulo="Quem pode o quê no CONECTA">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Qualquer pessoa com acesso ativo no órgão publica, comenta e curte, inclusive os perfis de consulta.</li>
          <li>Cada um edita e exclui apenas as próprias publicações e comentários.</li>
          <li>Moderação (ocultar, destacar, resolver denúncias e ver as publicações de todos) é a permissão "CONECTA · Aprovar" da matriz. Hoje: papel Master.</li>
          <li>Gerenciar categorias é "CONECTA · Editar"; tipos de arquivo dependem de "Configurações · Editar".</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600">Para dar moderação a outra pessoa, conceda o papel em <Link to="/usuarios" className="font-medium text-marca-700 underline">Usuários e acessos</Link>. A matriz é ajustada pela plataforma em Matriz de permissões.</p>
      </Cartao>}

      <ConfirmarComMotivo aberto={!!denuncia} aoFechar={() => setDenuncia(null)} perigo={!!denuncia?.procedente}
        titulo={denuncia?.procedente ? 'Denúncia procedente' : 'Denúncia improcedente'}
        descricao={denuncia?.procedente ? 'O conteúdo denunciado será ocultado. Registre a resolução (o denunciante é avisado).' : 'Nada muda no conteúdo. Registre a resolução (o denunciante é avisado).'}
        rotuloConfirmar="Registrar" aoConfirmar={async (m) => { await resolverDenuncia(denuncia!.id, denuncia!.procedente, m); await qc.invalidateQueries({ queryKey: ['conecta'] }); toast.success('Denúncia resolvida.'); }} />
      {categoria && <FormCategoria c={categoria === 'nova' ? null : categoria} aberto aoFechar={() => setCategoria(null)} />}
      <ConfirmarComMotivo aberto={!!inativando} aoFechar={() => setInativando(null)} titulo={`Desativar a categoria ${inativando?.nome ?? ''}?`}
        descricao="Ela deixa de aparecer para novas publicações; as antigas continuam com ela." rotuloConfirmar="Desativar"
        aoConfirmar={async (m) => { await definirStatusCategoria(inativando!.id, false, m); await qc.invalidateQueries({ queryKey: ['conecta-categorias'] }); toast.success('Categoria desativada.'); }} />
    </>
  );
}
