// Cadastro e consulta de patrimônio, com a ficha completa do bem (dados, localização, responsável,
// conservação, movimentações, histórico, documentos e auditoria).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, FileDown, Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { CadastradoPor, useAutoria } from '@/lib/autoria';
import { Anexos } from '@/components/Anexos';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { brl, centavos, decimalDeCentavos, formatarData, formatarDataHora } from '@/lib/formatacao';
import { buscarFornecedoresOpcoes } from '@/services/cadastros';
import {
  AMBIENTES, buscarBens, cadastrarBem, CONSERVACAO, editarBem, fichaBem, FUNCIONAMENTO, SITUACAO, TIPOS_MOV, type FichaBem, type FiltrosBens,
} from '@/services/patrimonio';
import { Dado, rotuloUnidade, SeletorLocal, SeletorResponsavel, SeletorSetor, SeloConservacao, SeloMov, SeloSituacao, useCategorias } from './comum';
import { NovaMovimentacao } from './Movimentacoes';
import { pdfHistorico } from './pdf';

const POR_PAGINA = 25;
const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });

// ---------------------------------------------------------------- cadastro / edição

function FormBem({ aberto, aoFechar, ficha, aoSalvar }: { aberto: boolean; aoFechar: () => void; ficha: FichaBem | null; aoSalvar: (id: string) => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const cats = useCategorias();
  const vazio = { numero: '', descricao: '', categoria_id: '', subcategoria_id: '', marca: '', modelo: '', numero_serie: '', fabricante: '', quantidade: '1',
    data_aquisicao: '', nota_fiscal: '', observacoes: '', responsavel_obs: '', conservacao: 'BOM', funcionamento: 'FUNCIONANDO', data_ultima_avaliacao: '',
    observacoes_tecnicas: '', ambiente: '', sala: '', situacao: 'EM_USO', responsavel_desde: hoje() };
  const [f, setF] = useState(vazio);
  const [valor, setValor] = useState<number | null>(null);
  const [fornecedor, setFornecedor] = useState<{ id: string; rotulo: string } | null>(null);
  const [setor, setSetor] = useState<{ id: string; rotulo: string } | null>(null);
  const [local, setLocal] = useState<{ id: string; rotulo: string } | null>(null);
  const [resp, setResp] = useState<{ id: string; rotulo: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    if (!ficha) { setF(vazio); setValor(null); setFornecedor(null); setSetor(null); setLocal(null); setResp(null); return; }
    setF({ ...vazio, numero: ficha.numero, descricao: ficha.descricao, categoria_id: ficha.categoria_id, subcategoria_id: ficha.subcategoria_id ?? '',
      marca: ficha.marca ?? '', modelo: ficha.modelo ?? '', numero_serie: ficha.numero_serie ?? '', fabricante: ficha.fabricante ?? '', quantidade: String(ficha.quantidade),
      data_aquisicao: ficha.data_aquisicao ?? '', nota_fiscal: ficha.nota_fiscal ?? '', observacoes: ficha.observacoes ?? '', responsavel_obs: ficha.responsavel_obs ?? '',
      conservacao: ficha.conservacao, funcionamento: ficha.funcionamento, data_ultima_avaliacao: ficha.data_ultima_avaliacao ?? '', observacoes_tecnicas: ficha.observacoes_tecnicas ?? '' });
    setValor(ficha.valor_aquisicao != null ? centavos(ficha.valor_aquisicao) : null);
    setFornecedor(ficha.fornecedor_id ? { id: ficha.fornecedor_id, rotulo: ficha.fornecedor ?? 'Fornecedor' } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, ficha]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const categorias = (cats.data ?? []).filter((c) => !c.pai_id && (c.ativo || c.id === f.categoria_id));
  const subcategorias = (cats.data ?? []).filter((c) => c.pai_id === f.categoria_id && (c.ativo || c.id === f.subcategoria_id));
  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        numero: f.numero.trim(), descricao: f.descricao.trim(), categoria_id: f.categoria_id, subcategoria_id: f.subcategoria_id || null,
        marca: f.marca.trim() || null, modelo: f.modelo.trim() || null, numero_serie: f.numero_serie.trim() || null, fabricante: f.fabricante.trim() || null,
        quantidade: Math.max(1, Number(f.quantidade) || 1), data_aquisicao: f.data_aquisicao || null, valor_aquisicao: valor != null ? decimalDeCentavos(valor) : null,
        nota_fiscal: f.nota_fiscal.trim() || null, fornecedor_id: fornecedor?.id ?? null, observacoes: f.observacoes.trim() || null, responsavel_obs: f.responsavel_obs.trim() || null,
        conservacao: f.conservacao, funcionamento: f.funcionamento, data_ultima_avaliacao: f.data_ultima_avaliacao || null, observacoes_tecnicas: f.observacoes_tecnicas.trim() || null,
      };
      if (ficha) { await editarBem(ficha.id, dados); return ficha.id; }
      return cadastrarBem(orgao!.id, dados, { unidade_id: setor!.id, local_id: local?.id ?? null, ambiente: f.ambiente || null, sala: f.sala.trim() || null,
        responsavel_id: resp?.id ?? null, responsavel_desde: resp ? f.responsavel_desde || hoje() : null, situacao: f.situacao });
    },
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ['patrimonio'] }); toast.success(ficha ? 'Bem atualizado.' : 'Bem cadastrado.'); aoFechar(); aoSalvar(id); },
    onError: (e) => {
      if (/patrimonio_numero_unico/.test(String((e as Error).message))) { setErros({ numero: 'Já existe um bem com este número patrimonial.' }); return; }
      const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem });
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.numero.trim()) n.numero = 'Informe o número do patrimônio.';
    if (f.descricao.trim().length < 3) n.descricao = 'Descreva o bem.';
    if (!f.categoria_id) n.categoria_id = 'Escolha a categoria.';
    if (!ficha && !setor) n.unidade_id = 'Escolha o setor responsável.';
    if (!ficha && !local) n.local_id = 'Escolha a unidade onde o bem está.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };
  const Titulo = ({ t }: { t: string }) => <h3 className="text-xs font-semibold uppercase tracking-wide text-marca-700 sm:col-span-6">{t}</h3>;
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={ficha ? `Editar bem ${ficha.numero}` : 'Cadastro de patrimônio'} largura="lg"
      descricao={ficha ? 'Localização, responsável e situação mudam só por movimentação, para manter o histórico.' : 'Cada item tem registro próprio. O número patrimonial não se repete.'}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-bem" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-bem" onSubmit={enviar} className="grid gap-4 sm:grid-cols-6" noValidate>
        <Titulo t="Identificação do bem" />
        <Campo className="sm:col-span-2" rotulo="Número do patrimônio" obrigatorio value={f.numero} onChange={set('numero')} erro={erros.numero} maxLength={40} />
        <Campo className="sm:col-span-4" rotulo="Descrição do item" obrigatorio value={f.descricao} onChange={set('descricao')} erro={erros.descricao} maxLength={500} />
        <Selecao className="sm:col-span-3" rotulo="Categoria" obrigatorio value={f.categoria_id} erro={erros.categoria_id} onChange={(e) => setF({ ...f, categoria_id: e.target.value, subcategoria_id: '' })}>
          <option value="">Escolha...</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Selecao>
        <Selecao className="sm:col-span-3" rotulo="Subcategoria" value={f.subcategoria_id} onChange={set('subcategoria_id')} erro={erros.subcategoria_id} disabled={!f.categoria_id}>
          <option value="">—</option>{subcategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Selecao>
        <Campo className="sm:col-span-2" rotulo="Marca" value={f.marca} onChange={set('marca')} maxLength={80} />
        <Campo className="sm:col-span-2" rotulo="Modelo" value={f.modelo} onChange={set('modelo')} maxLength={80} />
        <Campo className="sm:col-span-2" rotulo="Número de série" value={f.numero_serie} onChange={set('numero_serie')} maxLength={80} />
        <Campo className="sm:col-span-2" rotulo="Fabricante" value={f.fabricante} onChange={set('fabricante')} maxLength={80} />
        <Campo className="sm:col-span-1" rotulo="Quantidade" type="number" min={1} value={f.quantidade} onChange={set('quantidade')} />
        <Campo className="sm:col-span-3" rotulo="Data de aquisição" type="date" value={f.data_aquisicao} onChange={set('data_aquisicao')} />
        <CampoMoeda className="sm:col-span-2" rotulo="Valor de aquisição" centavos={valor} aoMudar={setValor} />
        <Campo className="sm:col-span-2" rotulo="Nota fiscal" value={f.nota_fiscal} onChange={set('nota_fiscal')} maxLength={60} />
        <div className="sm:col-span-2"><BuscaSelect rotulo="Fornecedor" valor={fornecedor?.id ?? null} rotuloValor={fornecedor?.rotulo} chave={['pat-fornecedores', orgao?.id]}
          aoMudar={(v, o) => setFornecedor(v && o ? { id: v, rotulo: o.rotulo } : null)}
          buscar={async (t) => (await buscarFornecedoresOpcoes(orgao!.id, t)).map((x) => ({ valor: x.id, rotulo: x.razao_social ?? x.nome_fantasia ?? '—' }))} /></div>
        <AreaTexto className="sm:col-span-6" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} rows={2} />

        {!ficha && <>
          <Titulo t="Localização" />
          <div className="sm:col-span-3"><SeletorSetor obrigatorio valor={setor?.id ?? null} rotuloValor={setor?.rotulo} erro={erros.unidade_id}
            ajuda="Diretoria, coordenação, gerência ou setor que utiliza o bem." aoMudar={(v, o) => setSetor(v && o ? { id: v, rotulo: o.rotulo } : null)} /></div>
          <div className="sm:col-span-3"><SeletorLocal obrigatorio valor={local?.id ?? null} rotuloValor={local?.rotulo} erro={erros.local_id}
            aoMudar={(v, o) => setLocal(v && o ? { id: v, rotulo: o.rotulo } : null)} /></div>
          <Selecao className="sm:col-span-2" rotulo="Ambiente" value={f.ambiente} onChange={set('ambiente')}>
            <option value="">—</option>{Object.entries(AMBIENTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          <Campo className="sm:col-span-2" rotulo="Sala / identificação do ambiente" value={f.sala} onChange={set('sala')} maxLength={80} placeholder="Ex.: Sala 12, 2º andar" />
          <Selecao className="sm:col-span-2" rotulo="Situação inicial" value={f.situacao} onChange={set('situacao')}>
            {['EM_USO', 'EM_ESTOQUE', 'DISPONIVEL', 'EM_MANUTENCAO', 'AGUARDANDO_AVALIACAO'].map((k) => <option key={k} value={k}>{SITUACAO[k]}</option>)}
          </Selecao>
          <Titulo t="Responsabilidade" />
          <div className="sm:col-span-4"><SeletorResponsavel valor={resp?.id ?? null} rotuloValor={resp?.rotulo} aoMudar={(v, o) => setResp(v && o ? { id: v, rotulo: o.rotulo } : null)}
            ajuda="Do cadastro de servidores. Pode ficar vazio (bem em estoque, por exemplo)." /></div>
          <Campo className="sm:col-span-2" rotulo="Data de atribuição" type="date" value={f.responsavel_desde} onChange={set('responsavel_desde')} disabled={!resp} />
        </>}
        <AreaTexto className="sm:col-span-6" rotulo="Observações sobre a responsabilidade" value={f.responsavel_obs} onChange={set('responsavel_obs')} maxLength={1000} rows={2} />

        <Titulo t="Estado de conservação" />
        <Selecao className="sm:col-span-2" rotulo="Estado de conservação" value={f.conservacao} onChange={set('conservacao')}>
          {Object.entries(CONSERVACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Selecao>
        <Selecao className="sm:col-span-2" rotulo="Funcionamento" value={f.funcionamento} onChange={set('funcionamento')}>
          {Object.entries(FUNCIONAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Selecao>
        <Campo className="sm:col-span-2" rotulo="Data da última avaliação" type="date" value={f.data_ultima_avaliacao} onChange={set('data_ultima_avaliacao')} />
        <AreaTexto className="sm:col-span-6" rotulo="Observações técnicas" value={f.observacoes_tecnicas} onChange={set('observacoes_tecnicas')} maxLength={2000} rows={2} />
        {erros.geral && <div className="sm:col-span-6"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- ficha

type AbaFicha = 'dados' | 'localizacao' | 'responsavel' | 'conservacao' | 'movimentacoes' | 'historico' | 'documentos' | 'auditoria';

export function FichaPatrimonio({ id, aoFechar }: { id: string | null; aoFechar: () => void }) {
  const { orgao, contexto } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['patrimonio', 'ficha', id], queryFn: () => fichaBem(id!), enabled: !!id });
  const [aba, setAba] = useState<AbaFicha>('dados');
  const [editando, setEditando] = useState(false);
  const [movimentando, setMovimentando] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const podeAlterar = useAutoria();
  useEffect(() => setAba('dados'), [id]);
  if (!id) return null;
  const b = q.data;
  const gerarPdf = async () => {
    setGerando(true);
    try { await pdfHistorico(orgao!.id, b!, contexto?.perfil?.nome || contexto?.perfil?.email || ''); await qc.invalidateQueries({ queryKey: ['patrimonio', 'relatorios'] }); }
    catch (e) { toast.error(mensagemDeErro(e)); } finally { setGerando(false); }
  };
  return (
    <Modal aberto aoFechar={aoFechar} largura="lg" titulo={b ? `Patrimônio ${b.numero}` : 'Patrimônio'} descricao={b?.descricao}
      rodape={b && <>
        <Botao variante="fantasma" icone={<FileDown className="size-4" />} carregando={gerando} onClick={() => void gerarPdf()}>Histórico em PDF</Botao>
        {b.pode_baixar && <Botao variante="fantasma" className="text-red-700" icone={<Trash2 className="size-4" />} onClick={() => setMovimentando('BAIXA')}>Baixa patrimonial</Botao>}
        {b.pode_editar && podeAlterar('patrimonio', b.criado_por) && <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={() => setEditando(true)}>Editar</Botao>}
        {b.pode_movimentar && <Botao icone={<ArrowLeftRight className="size-4" />} onClick={() => setMovimentando('TRANSFERENCIA_COORDENACAO')}>Movimentar</Botao>}
      </>}>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !b ? null : <>
        <div className="mb-3 flex flex-wrap gap-2"><SeloSituacao s={b.situacao} /><SeloConservacao c={b.conservacao} /><Selo>{FUNCIONAMENTO[b.funcionamento]}</Selo>
          {b.movimentacao_pendente && <Selo tom="alerta">Movimentação {b.movimentacao_pendente} em andamento</Selo>}</div>
        <CadastradoPor autor={b.criado_por} recurso="patrimonio" className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" />
        <Abas ativa={aba} aoMudar={setAba} abas={[
          { id: 'dados', rotulo: 'Dados gerais' }, { id: 'localizacao', rotulo: 'Localização' }, { id: 'responsavel', rotulo: 'Responsável' },
          { id: 'conservacao', rotulo: 'Conservação' }, { id: 'movimentacoes', rotulo: `Movimentações (${b.movimentacoes.length})` }, { id: 'historico', rotulo: 'Histórico' },
          { id: 'documentos', rotulo: 'Documentos' }, ...(b.auditoria ? [{ id: 'auditoria' as const, rotulo: 'Auditoria' }] : []),
        ]} />
        {aba === 'dados' && <dl className="grid gap-3 sm:grid-cols-3">
          <Dado rotulo="Número patrimonial"><span className="font-mono font-semibold">{b.numero}</span></Dado>
          <Dado rotulo="Categoria">{b.categoria}{b.subcategoria && ` › ${b.subcategoria}`}</Dado>
          <Dado rotulo="Quantidade">{b.quantidade}</Dado>
          <Dado rotulo="Marca">{b.marca}</Dado><Dado rotulo="Modelo">{b.modelo}</Dado><Dado rotulo="Número de série">{b.numero_serie}</Dado>
          <Dado rotulo="Fabricante">{b.fabricante}</Dado><Dado rotulo="Data de aquisição">{formatarData(b.data_aquisicao)}</Dado>
          <Dado rotulo="Valor de aquisição">{b.valor_aquisicao != null ? brl(b.valor_aquisicao) : null}</Dado>
          <Dado rotulo="Nota fiscal">{b.nota_fiscal}</Dado><Dado rotulo="Fornecedor">{b.fornecedor}</Dado><Dado rotulo="Cadastrado em">{formatarDataHora(b.criado_em)}</Dado>
          {b.observacoes && <Dado className="sm:col-span-3" rotulo="Observações"><span className="whitespace-pre-line">{b.observacoes}</span></Dado>}
        </dl>}
        {aba === 'localizacao' && <dl className="grid gap-3 sm:grid-cols-2">
          <Dado rotulo="Unidade onde se encontra">{b.local?.nome}{b.local?.tipo ? ` (${b.local.tipo})` : ''}</Dado>
          <Dado rotulo="Endereço da unidade">{b.local?.endereco}</Dado>
          <Dado rotulo="Setor responsável">{b.unidade ? `${b.unidade.sigla ? `${b.unidade.sigla} – ` : ''}${b.unidade.nome}` : null}</Dado>
          <Dado rotulo="Diretoria">{b.unidade?.diretoria}</Dado><Dado rotulo="Coordenação">{b.unidade?.coordenacao}</Dado>
          <Dado rotulo="Ambiente / sala">{[b.ambiente ? AMBIENTES[b.ambiente] : null, b.sala].filter(Boolean).join(' · ')}</Dado>
        </dl>}
        {aba === 'responsavel' && (b.responsavel ? <dl className="grid gap-3 sm:grid-cols-2">
          <Dado rotulo="Servidor responsável">{b.responsavel.nome}</Dado><Dado rotulo="Matrícula">{b.responsavel.matricula}</Dado>
          <Dado rotulo="Cargo ou função">{[b.responsavel.cargo, b.responsavel.funcao].filter(Boolean).join(' · ')}</Dado>
          <Dado rotulo="Lotação">{rotuloUnidade(b.responsavel.lotacao)}</Dado>
          <Dado rotulo="Responsável desde">{formatarData(b.responsavel_desde)}</Dado>
          {b.responsavel_obs && <Dado className="sm:col-span-2" rotulo="Observações">{b.responsavel_obs}</Dado>}
        </dl> : <Vazio titulo="Bem sem responsável definido" descricao="Atribua um responsável por movimentação (alteração de responsável)." />)}
        {aba === 'conservacao' && <dl className="grid gap-3 sm:grid-cols-2">
          <Dado rotulo="Estado de conservação"><SeloConservacao c={b.conservacao} /></Dado><Dado rotulo="Situação operacional"><SeloSituacao s={b.situacao} /></Dado>
          <Dado rotulo="Funcionamento">{FUNCIONAMENTO[b.funcionamento]}</Dado><Dado rotulo="Última avaliação">{formatarData(b.data_ultima_avaliacao)}</Dado>
          {b.baixado_em && <Dado rotulo="Baixado em">{formatarDataHora(b.baixado_em)}</Dado>}
          {b.observacoes_tecnicas && <Dado className="sm:col-span-2" rotulo="Observações técnicas"><span className="whitespace-pre-line">{b.observacoes_tecnicas}</span></Dado>}
          {b.inventarios.length > 0 && <Dado className="sm:col-span-2" rotulo="Conferências em inventário">
            <ul className="mt-1 space-y-1">{b.inventarios.map((i, k) => <li key={k}>{i.titulo}: {i.status.replace(/_/g, ' ').toLowerCase()}{i.conservacao_avaliada ? ` · avaliado ${CONSERVACAO[i.conservacao_avaliada]?.toLowerCase()}` : ''}{i.conferido_em ? ` em ${formatarData(i.conferido_em)}` : ''}</li>)}</ul>
          </Dado>}
        </dl>}
        {aba === 'movimentacoes' && (!b.movimentacoes.length ? <Vazio titulo="Nenhuma movimentação" /> : (
          <ol className="relative ml-2 border-l-2 border-slate-200">
            {b.movimentacoes.map((m) => (
              <li key={m.id} className="mb-4 ml-4">
                <span className={cx('absolute -left-[7px] mt-1.5 size-3 rounded-full', m.situacao === 'CONCLUIDA' ? 'bg-emerald-500' : m.situacao === 'REJEITADA' || m.situacao === 'CANCELADA' ? 'bg-slate-400' : 'bg-amber-500')} />
                <p className="text-sm font-medium text-slate-900">{m.codigo} · {TIPOS_MOV[m.tipo] ?? m.tipo} <SeloMov s={m.situacao} /></p>
                <p className="text-xs text-slate-600">{m.origem} → {m.destino}</p>
                {(m.responsavel_anterior || m.novo_responsavel) && <p className="text-xs text-slate-600">Responsável: {m.responsavel_anterior ?? '—'} → {m.novo_responsavel ?? '—'}</p>}
                <p className="text-xs text-slate-500">{formatarDataHora(m.criado_em)} · pedido por {m.solicitante} · {m.justificativa}</p>
                {m.confirmado_em && <p className="text-xs text-emerald-700">Confirmado {m.confirmacao_tipo === 'DIGITAL' ? 'digitalmente' : m.confirmacao_tipo === 'DOCUMENTO_FISICO' ? 'por documento físico' : 'pela administração'} por {m.confirmado_por} em {formatarDataHora(m.confirmado_em)}</p>}
                {m.documentos > 0 && <p className="text-xs text-slate-500">{m.documentos} documento(s) anexado(s)</p>}
              </li>
            ))}
          </ol>
        ))}
        {aba === 'historico' && <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 pr-3">Responsável</th><th className="pr-3">Setor · unidade</th><th className="pr-3">Período</th><th>Motivo</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{b.responsaveis.map((r, k) => (
            <tr key={k}><td className="py-1.5 pr-3">{r.servidor ? `${r.servidor} (${r.matricula})` : <span className="text-slate-400">sem responsável</span>}</td>
              <td className="pr-3">{[r.unidade, r.local].filter(Boolean).join(' · ')}</td>
              <td className="whitespace-nowrap pr-3">{formatarData(r.inicio)} a {r.fim ? formatarData(r.fim) : 'atual'}</td><td className="text-slate-600">{r.motivo}</td></tr>))}</tbody>
        </table></div>}
        {aba === 'documentos' && <div className="flex flex-col gap-5">
          <Anexos recurso="patrimonio" registroId={b.id} unidadeId={b.unidade_id} categoria="FOTO" titulo="Fotografias do bem" vazio="Nenhuma fotografia." />
          <Anexos recurso="patrimonio" registroId={b.id} unidadeId={b.unidade_id} categoria="GERAL" titulo="Documentos (nota fiscal, laudos, termos)" />
        </div>}
        {aba === 'auditoria' && b.auditoria && (
          <ul className="divide-y divide-slate-100 text-sm">{b.auditoria.map((a, k) => (
            <li key={k} className="py-2"><p className="font-medium">{a.acao === 'INSERT' ? 'Cadastro' : a.acao === 'UPDATE' ? 'Alteração' : a.acao} · {formatarDataHora(a.criado_em)} · {a.usuario ?? 'sistema'}</p>
              {a.campos?.length ? <p className="text-xs text-slate-600">{a.campos.filter((c) => !['atualizado_em', 'atualizado_por'].includes(c)).map((c) => `${c}: ${String(a.antes?.[c] ?? '—')} → ${String(a.depois?.[c] ?? '—')}`).join(' · ')}</p> : null}
              {a.justificativa && <p className="text-xs text-slate-500">Justificativa: {a.justificativa}</p>}</li>))}</ul>
        )}
      </>}
      {b && <FormBem aberto={editando} aoFechar={() => setEditando(false)} ficha={b} aoSalvar={() => void q.refetch()} />}
      {b && movimentando && <NovaMovimentacao aberto aoFechar={() => setMovimentando(null)} tipoInicial={movimentando} bemInicial={{ id: b.id, rotulo: `${b.numero} – ${b.descricao}` }}
        aoConcluir={() => void q.refetch()} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- consulta

export function Bens({ cadastro = false }: { cadastro?: boolean }) {
  const { orgao, pode } = useSessao();
  const cats = useCategorias();
  const [params, setParams] = useSearchParams();
  const lista = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [pagina, setPagina] = useState(0);
  const [novo, setNovo] = useState(cadastro || params.get('novo') === '1');
  const [setor, setSetor] = useState<{ id: string; rotulo: string } | null>(null);
  const [local, setLocal] = useState<{ id: string; rotulo: string } | null>(params.get('local') ? { id: params.get('local')!, rotulo: 'Unidade escolhida' } : null);
  const [resp, setResp] = useState<{ id: string; rotulo: string } | null>(params.get('responsavel') ? { id: params.get('responsavel')!, rotulo: 'Responsável escolhido' } : null);
  const [categoria, setCategoria] = useState('');
  const [situacao, setSituacao] = useState(lista('situacao').join(','));
  const [conservacao, setConservacao] = useState(lista('conservacao').join(','));
  const [meus, setMeus] = useState(params.get('meus') === '1');
  const [semResp, setSemResp] = useState(params.get('sem_responsavel') === '1');
  const vendo = params.get('bem');
  const filtros = useMemo<FiltrosBens>(() => ({
    busca: termo || undefined, categoria_id: categoria || null, unidade_id: setor?.id ?? null, local_id: local?.id ?? null, responsavel_id: resp?.id ?? null,
    situacoes: situacao ? situacao.split(',') : [], conservacoes: conservacao ? conservacao.split(',') : [], meus, sem_responsavel: semResp,
    limite: POR_PAGINA, offset: pagina * POR_PAGINA,
  }), [termo, categoria, setor, local, resp, situacao, conservacao, meus, semResp, pagina]);
  useEffect(() => setPagina(0), [termo, categoria, setor, local, resp, situacao, conservacao, meus, semResp]);
  const q = useQuery({ queryKey: ['patrimonio', 'bens', orgao?.id, filtros], queryFn: () => buscarBens(orgao!.id, filtros), enabled: !!orgao, placeholderData: (a) => a });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  const abrir = (id: string | null) => { if (id) params.set('bem', id); else params.delete('bem'); setParams(params, { replace: true }); };
  const temFiltro = !!(busca || categoria || setor || local || resp || situacao || conservacao || meus || semResp);
  const limpar = () => { setBusca(''); setCategoria(''); setSetor(null); setLocal(null); setResp(null); setSituacao(''); setConservacao(''); setMeus(false); setSemResp(false); setParams({}, { replace: true }); };
  return (
    <>
      <CabecalhoPagina titulo={cadastro ? 'Cadastro de patrimônio' : 'Consulta de patrimônio'} descricao="Pesquise por número, descrição, categoria, unidade, coordenação ou responsável. Clique para abrir a ficha completa."
        acoes={pode('patrimonio', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>Cadastrar bem</Botao>} />
      <Cartao>
        <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2"><CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar bens" placeholder="Número patrimonial, descrição, marca, modelo ou série" /></div>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>{(cats.data ?? []).filter((c) => !c.pai_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
            <option value="">Todas as situações (sem baixados)</option>
            {situacao && !SITUACAO[situacao] && <option value={situacao}>{situacao.split(',').map((s) => SITUACAO[s]).join(' / ')}</option>}
            {Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SeletorSetor rotulo="Diretoria / coordenação / setor" valor={setor?.id ?? null} rotuloValor={setor?.rotulo} aoMudar={(v, o) => setSetor(v && o ? { id: v, rotulo: o.rotulo } : null)} />
          <SeletorLocal rotulo="Unidade de saúde" valor={local?.id ?? null} rotuloValor={local?.rotulo} aoMudar={(v, o) => setLocal(v && o ? { id: v, rotulo: o.rotulo } : null)} />
          <SeletorResponsavel rotulo="Responsável" valor={resp?.id ?? null} rotuloValor={resp?.rotulo} aoMudar={(v, o) => setResp(v && o ? { id: v, rotulo: o.rotulo } : null)} />
          <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-marca-700" checked={meus} onChange={(e) => setMeus(e.target.checked)} />Só os bens sob a minha guarda</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-marca-700" checked={semResp} onChange={(e) => setSemResp(e.target.checked)} />Sem responsável definido</label>
            {conservacao && <span className="flex items-center gap-2"><Selo tom="alerta">Conservação: {conservacao.split(',').map((c) => CONSERVACAO[c]).join(', ')}</Selo><button className="text-xs underline" onClick={() => setConservacao('')}>tirar</button></span>}
          </div>
        </div>
        {temFiltro && <Botao pequeno variante="fantasma" className="mb-3" onClick={limpar}>Limpar filtros</Botao>}
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !q.data!.itens.length
          ? <Vazio titulo="Nenhum bem encontrado" descricao={temFiltro ? 'Ajuste os filtros.' : 'Cadastre o primeiro bem patrimonial.'} />
          : <>
            <div className={cx('hidden overflow-x-auto md:block', q.isFetching && 'opacity-70')}>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Nº</th><th className="pr-3">Descrição</th><th className="pr-3">Setor</th><th className="pr-3">Unidade · sala</th><th className="pr-3">Responsável</th><th className="pr-3">Conservação</th><th>Situação</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {q.data!.itens.map((b) => (
                    <tr key={b.id} className="cursor-pointer hover:bg-slate-50" onClick={() => abrir(b.id)}>
                      <td className="py-2 pr-3 font-mono font-semibold">{b.numero}</td>
                      <td className="pr-3"><span className="block font-medium text-slate-900">{b.descricao}</span><span className="text-xs text-slate-500">{b.subcategoria ?? b.categoria}{b.marca ? ` · ${b.marca}` : ''}</span></td>
                      <td className="pr-3 text-xs">{rotuloUnidade(b.unidade)}</td>
                      <td className="pr-3 text-xs">{[b.local, b.sala].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="pr-3 text-xs">{b.responsavel ? <span className="inline-flex items-center gap-1">{b.meu && <UserCheck className="size-3.5 text-emerald-600" />}{b.responsavel}</span> : <span className="text-amber-700">sem responsável</span>}</td>
                      <td className="pr-3"><SeloConservacao c={b.conservacao} /></td>
                      <td><SeloSituacao s={b.situacao} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {q.data!.itens.map((b) => (
                <li key={b.id}><button className="w-full py-3 text-left" onClick={() => abrir(b.id)}>
                  <p className="text-sm font-medium"><span className="font-mono">{b.numero}</span> · {b.descricao}</p>
                  <p className="text-xs text-slate-500">{rotuloUnidade(b.unidade)}{b.local ? ` · ${b.local}` : ''} · {b.responsavel ?? 'sem responsável'}</p>
                  <div className="mt-1 flex gap-1.5"><SeloConservacao c={b.conservacao} /><SeloSituacao s={b.situacao} /></div>
                </button></li>
              ))}
            </ul>
            <Paginacao pagina={pagina} total={q.data!.total} porPagina={POR_PAGINA} aoMudar={setPagina} />
          </>}
      </Cartao>
      <FormBem aberto={novo} aoFechar={() => setNovo(false)} ficha={null} aoSalvar={(id) => abrir(id)} />
      <FichaPatrimonio id={vendo} aoFechar={() => abrir(null)} />
    </>
  );
}

export const CadastroPatrimonio = () => <Bens cadastro />;
