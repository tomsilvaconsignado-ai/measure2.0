// Configurações da Gestão Patrimonial: categorias e subcategorias (administráveis) e o timbre dos documentos.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Plus, Power } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Abas } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, SemPermissao, Selo, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { obterConfiguracoes, salvarConfiguracoes } from '@/services/api';
import { definirStatusCategoriaPatrimonio, salvarCategoriaPatrimonio, timbrePatrimonio, type CategoriaPatrimonio } from '@/services/patrimonio';
import { useCategorias } from './comum';

function FormCategoria({ c, pai, aoFechar }: { c: CategoriaPatrimonio | null; pai: CategoriaPatrimonio | null; aoFechar: () => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [nome, setNome] = useState(c?.nome ?? '');
  const [ordem, setOrdem] = useState(String(c?.ordem ?? 100));
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => salvarCategoriaPatrimonio(orgao!.id, c?.id ?? null, { nome: nome.trim(), pai_id: c ? c.pai_id : pai?.id ?? null, ordem: Number(ordem) || 100 }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['pat-categorias'] }); toast.success('Categoria salva.'); aoFechar(); },
    onError: (e) => setErro(/patrimonio_categorias_nome|duplicate/.test(String((e as Error).message)) ? 'Já existe uma categoria com esse nome neste nível.' : traduzirErro(e).mensagem),
  });
  return (
    <Modal aberto aoFechar={aoFechar} largura="sm" titulo={c ? 'Editar' : pai ? `Nova subcategoria de ${pai.nome}` : 'Nova categoria'}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao disabled={nome.trim().length < 2} carregando={salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Nome" obrigatorio value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
        <Campo rotulo="Ordem" type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} ajuda="Menor aparece primeiro." />
        {erro && <CaixaErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

function Categorias() {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const q = useCategorias();
  const [abertas, setAbertas] = useState<string[]>([]);
  const [form, setForm] = useState<{ c: CategoriaPatrimonio | null; pai: CategoriaPatrimonio | null } | null>(null);
  const [inativando, setInativando] = useState<CategoriaPatrimonio | null>(null);
  const editavel = pode('patrimonio', 'aprovar');
  if (q.isLoading) return <Carregando />;
  const raiz = (q.data ?? []).filter((c) => !c.pai_id);
  const filhos = (id: string) => (q.data ?? []).filter((c) => c.pai_id === id);
  const reativar = async (c: CategoriaPatrimonio) => { try { await definirStatusCategoriaPatrimonio(c.id, true, 'Reativação'); await qc.invalidateQueries({ queryKey: ['pat-categorias'] }); } catch (e) { toast.error(mensagemDeErro(e)); } };
  const Acoes = ({ c, pai }: { c: CategoriaPatrimonio; pai?: boolean }) => editavel ? <span className="flex gap-0.5">
    {pai && <Botao pequeno variante="fantasma" icone={<Plus className="size-4" />} aria-label={`Nova subcategoria em ${c.nome}`} onClick={() => setForm({ c: null, pai: c })} />}
    <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${c.nome}`} onClick={() => setForm({ c, pai: null })} />
    <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={c.ativo ? `Desativar ${c.nome}` : `Reativar ${c.nome}`} onClick={() => (c.ativo ? setInativando(c) : void reativar(c))} />
  </span> : null;
  return (
    <Cartao titulo="Categorias e subcategorias" acoes={editavel && <Botao pequeno icone={<Plus className="size-4" />} onClick={() => setForm({ c: null, pai: null })}>Nova categoria</Botao>}>
      {!editavel && <p className="mb-3 text-sm text-slate-500">Somente a administração patrimonial altera as categorias.</p>}
      <ul className="divide-y divide-slate-100">{raiz.map((c) => {
        const aberta = abertas.includes(c.id);
        return (
          <li key={c.id} className="py-1.5">
            <div className={cx('flex items-center gap-2', !c.ativo && 'opacity-50')}>
              <button className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium" onClick={() => setAbertas((x) => (aberta ? x.filter((y) => y !== c.id) : [...x, c.id]))} aria-expanded={aberta}>
                {aberta ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{c.nome}<span className="text-xs font-normal text-slate-400">({filhos(c.id).length})</span>{!c.ativo && <Selo>inativa</Selo>}
              </button>
              <Acoes c={c} pai />
            </div>
            {aberta && <ul className="ml-6 mt-1 border-l border-slate-200 pl-3">{filhos(c.id).map((s) => (
              <li key={s.id} className={cx('flex items-center gap-2 py-0.5 text-sm', !s.ativo && 'opacity-50')}><span className="flex-1">{s.nome}{!s.ativo && <Selo>inativa</Selo>}</span><Acoes c={s} /></li>
            ))}</ul>}
          </li>
        );
      })}</ul>
      {form && <FormCategoria c={form.c} pai={form.pai} aoFechar={() => setForm(null)} />}
      <ConfirmarComMotivo aberto={!!inativando} aoFechar={() => setInativando(null)} titulo={`Desativar ${inativando?.nome ?? ''}?`}
        descricao="Some das opções de cadastro; os bens já classificados continuam com ela." rotuloConfirmar="Desativar"
        aoConfirmar={async (m) => { await definirStatusCategoriaPatrimonio(inativando!.id, false, m); await qc.invalidateQueries({ queryKey: ['pat-categorias'] }); toast.success('Categoria desativada.'); }} />
    </Cartao>
  );
}

function Timbre() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ['patrimonio', 'timbre', orgao?.id], queryFn: () => timbrePatrimonio(orgao!.id), enabled: !!orgao });
  const config = useQuery({ queryKey: ['configuracoes', orgao?.id], queryFn: () => obterConfiguracoes(orgao!.id), enabled: !!orgao && pode('configuracoes', 'ler') });
  const [f, setF] = useState({ secretaria: '', orgao_fundo: '', setor: '', contato: '' });
  useEffect(() => { if (t.data) setF({ secretaria: t.data.secretaria ?? '', orgao_fundo: t.data.orgao_fundo ?? '', setor: t.data.setor ?? '', contato: t.data.contato ?? '' }); }, [t.data]);
  const editavel = pode('configuracoes', 'editar');
  const salvar = useMutation({
    mutationFn: () => salvarConfiguracoes(orgao!.id, { textos: { ...((config.data?.textos ?? {}) as Record<string, unknown>),
      patrimonio_secretaria: f.secretaria.trim() || null, patrimonio_orgao_fundo: f.orgao_fundo.trim() || null, patrimonio_setor: f.setor.trim() || null, patrimonio_contato: f.contato.trim() || null } } as never),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['patrimonio', 'timbre'] }); await qc.invalidateQueries({ queryKey: ['configuracoes'] }); toast.success('Timbre atualizado.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  if (t.isLoading) return <Carregando />;
  return (
    <Cartao titulo="Timbre dos relatórios e termos">
      <p className="mb-3 text-sm text-slate-600">O brasão, o nome oficial, as linhas do cabeçalho, o rodapé e o endereço vêm das <Link to="/configuracoes" className="font-medium text-marca-700 underline">Configurações do órgão</Link>. Abaixo, os dados próprios dos documentos do patrimônio. Nada é inventado: o que ficar em branco não aparece.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da Secretaria" value={f.secretaria} onChange={(e) => setF({ ...f, secretaria: e.target.value })} disabled={!editavel} placeholder="Ex.: Secretaria Municipal da Saúde" />
        <Campo rotulo="Órgão ou fundo municipal" value={f.orgao_fundo} onChange={(e) => setF({ ...f, orgao_fundo: e.target.value })} disabled={!editavel} placeholder="Ex.: Fundo Municipal de Saúde" />
        <Campo rotulo="Setor responsável pelo patrimônio" value={f.setor} onChange={(e) => setF({ ...f, setor: e.target.value })} disabled={!editavel} placeholder="Ex.: Coordenação de Patrimônio" />
        <Campo rotulo="Informações de contato" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} disabled={!editavel} placeholder="Telefone e e-mail do setor" />
      </div>
      {editavel ? <Botao className="mt-4" carregando={salvar.isPending} onClick={() => salvar.mutate()}>Salvar timbre</Botao>
        : <p className="mt-3 text-xs text-slate-500">Somente quem altera as configurações do órgão (Master) muda o timbre.</p>}
      {t.data && <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Prévia do cabeçalho</p>
        {[...(t.data.cabecalho?.length ? t.data.cabecalho : [t.data.nome_oficial]), f.secretaria, f.orgao_fundo, f.setor].filter(Boolean).slice(0, 4).map((l, i) => <p key={i} className={i === 0 ? 'font-semibold' : ''}>{l}</p>)}
        {!t.data.logo_path && <p className="mt-1 text-xs text-amber-700">O órgão ainda não tem brasão cadastrado.</p>}
      </div>}
    </Cartao>
  );
}

export function ConfiguracoesPatrimonio() {
  const { orgao, pode } = useSessao();
  const [aba, setAba] = useState<'categorias' | 'timbre'>('categorias');
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('patrimonio', 'ler')) return <SemPermissao />;
  return (
    <>
      <CabecalhoPagina titulo="Configurações do patrimônio" descricao="Classificação dos bens e identidade visual dos documentos emitidos." />
      <Abas ativa={aba} aoMudar={setAba} abas={[{ id: 'categorias', rotulo: 'Categorias' }, { id: 'timbre', rotulo: 'Timbre dos documentos' }]} />
      {aba === 'categorias' ? <Categorias /> : <Timbre />}
    </>
  );
}
