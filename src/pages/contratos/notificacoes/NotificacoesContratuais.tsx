// NOTIFICAÇÕES E OCORRÊNCIAS CONTRATUAIS: painel com indicadores, filtros, lista e relatórios, e a emissão
// de nova notificação (só nos contratos em que a pessoa é gestora, fiscal ou suplente, ou perfil autorizado).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileDown, Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { SeletorUnidadeOrg } from '@/components/CamposEndereco';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, Selecao, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { formatarCnpj } from '@/lib/formatacao';
import { PERIODOS, intervalo, type Periodo } from '@/lib/monitoramentoOrganizacional';
import { PAPEIS, STATUS, type StatusNotificacao } from '@/lib/notificacaoFormal';
import { catalogos, contratosDisponiveis, painel, type FiltroPainel } from '@/services/notificacoesFormais';
import { SeletorContrato, SeletorFornecedor } from '../comum';
import { LinhaPainel, relatorioPdf } from './comum';

function Indicador({ titulo, valor, tom, onClick }: { titulo: string; valor: number; tom?: 'alerta' | 'perigo' | 'sucesso'; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cx('rounded-xl border bg-white p-4 text-left transition-colors hover:border-marca-300',
      tom === 'perigo' && valor ? 'border-red-300' : tom === 'alerta' && valor ? 'border-amber-300' : 'border-slate-200')}>
      <p className="text-xs text-slate-600">{titulo}</p>
      <p className={cx('numero mt-1 text-2xl font-semibold', tom === 'perigo' && valor ? 'text-red-700' : tom === 'sucesso' ? 'text-emerald-700' : 'text-slate-900')}>{valor}</p>
    </button>
  );
}

export function NotificacoesContratuais() {
  const { orgao, pode } = useSessao();
  const [f, setF] = useState<FiltroPainel>({});
  const [periodo, setPeriodo] = useState<Periodo | ''>('');
  const [rotulos, setRotulos] = useState<{ fornecedor?: string; contrato?: string; unidade?: string }>({});
  const [pagina, setPagina] = useState(0);
  const [nova, setNova] = useState(false);
  const [agrupar, setAgrupar] = useState<'fornecedor' | 'contrato' | 'coordenacao' | 'emissor' | 'status'>('fornecedor');
  const por = 30;
  const faixa = periodo && periodo !== 'personalizado' ? intervalo(periodo) : null;
  const filtro: FiltroPainel = { ...f, de: faixa?.de, ate: faixa?.ate };
  const q = useQuery({ queryKey: ['nf-painel', orgao?.id, filtro, pagina], queryFn: () => painel(orgao!.id, { ...filtro, limite: por, offset: pagina * por }),
    enabled: !!orgao, placeholderData: keepPreviousData, refetchInterval: 120_000 });
  const cat = useQuery({ queryKey: ['nf-catalogos', orgao?.id], queryFn: () => catalogos(orgao!.id), enabled: !!orgao, staleTime: 300_000 });
  if (!orgao) return <Vazio titulo="Escolha um órgão" />;
  const mudar = (x: Partial<FiltroPainel>) => { setF((a) => ({ ...a, ...x })); setPagina(0); };
  const ind = q.data?.indicadores;
  return (
    <>
      <CabecalhoPagina titulo="Notificações e ocorrências contratuais"
        descricao="Registro de irregularidades na execução e notificação formal das empresas contratadas. Notificação não é sanção: sanções dependem de processo próprio e decisão da autoridade competente."
        acoes={<div className="flex flex-wrap gap-2">
          {cat.data?.pode_configurar && <Link to="/notificacoes-contratuais/configuracao"><Botao variante="secundario" icone={<Settings2 className="size-4" />}>Configuração</Botao></Link>}
          <Botao icone={<Plus className="size-4" />} onClick={() => setNova(true)}>EMITIR NOVA NOTIFICAÇÃO</Botao>
        </div>} />
      {ind && <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Indicador titulo="Notificações emitidas" valor={ind.emitidas} onClick={() => mudar({ status: undefined })} />
        <Indicador titulo="Aguardando resposta" valor={ind.aguardando_resposta} tom="alerta" onClick={() => mudar({ status: 'EM_PRAZO' })} />
        <Indicador titulo="Prazo vencido" valor={ind.prazo_vencido} tom="perigo" onClick={() => mudar({ status: 'PRAZO_VENCIDO' })} />
        <Indicador titulo="Regularizadas" valor={ind.regularizadas} tom="sucesso" onClick={() => mudar({ status: 'REGULARIZADA' })} />
        <Indicador titulo="Não regularizadas / encaminhadas" valor={ind.nao_regularizadas} tom="perigo" onClick={() => mudar({ status: 'NAO_REGULARIZADA' })} />
        <Indicador titulo="Rascunhos" valor={ind.rascunhos} onClick={() => mudar({ status: 'RASCUNHO' })} />
      </div>}
      {ind && (ind.recorrentes.length > 0 || ind.por_contrato.length > 0) && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <Cartao titulo={<span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" />Empresas com ocorrências recorrentes</span>}>
            {!ind.recorrentes.length ? <p className="text-sm text-slate-500">Nenhuma empresa com mais de uma notificação no filtro.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">{ind.recorrentes.map((r) => (
                <li key={r.fornecedor_id}><button className="flex w-full justify-between gap-2 py-1.5 text-left hover:text-marca-700" onClick={() => { mudar({ fornecedor_id: r.fornecedor_id }); setRotulos((x) => ({ ...x, fornecedor: r.fornecedor_nome })); }}>
                  <span>{r.fornecedor_nome} <span className="text-xs text-slate-500">{formatarCnpj(r.cnpj)}</span></span><span className="numero font-medium">{r.n}</span></button></li>
              ))}</ul>
            )}
            <p className="mt-2 text-xs text-slate-500">Repetição de notificações não caracteriza, por si só, reincidência jurídica: depende da análise dos fatos e da decisão competente.</p>
          </Cartao>
          <Cartao titulo="Notificações por contrato">
            <ul className="divide-y divide-slate-100 text-sm">{ind.por_contrato.map((c) => (
              <li key={c.contrato_id}><button className="flex w-full justify-between gap-2 py-1.5 text-left hover:text-marca-700" onClick={() => { mudar({ contrato_id: c.contrato_id }); setRotulos((x) => ({ ...x, contrato: `Contrato ${c.contrato_numero}` })); }}>
                <span>Contrato nº {c.contrato_numero}</span><span className="numero font-medium">{c.n}</span></button></li>
            ))}</ul>
          </Cartao>
        </div>
      )}
      <Cartao className="p-3 sm:p-4">
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Pesquisar" value={f.busca ?? ''} onChange={(e) => mudar({ busca: e.target.value })} placeholder="Empresa, CNPJ, contrato, nº ou fatos" />
          <SeletorFornecedor valor={f.fornecedor_id ?? null} rotuloValor={rotulos.fornecedor} aoMudar={(v, o) => { mudar({ fornecedor_id: v ?? undefined }); setRotulos((x) => ({ ...x, fornecedor: o?.rotulo })); }} />
          <SeletorContrato valor={f.contrato_id ?? null} rotuloValor={rotulos.contrato} aoMudar={(v, o) => { mudar({ contrato_id: v ?? undefined }); setRotulos((x) => ({ ...x, contrato: o?.rotulo })); }} />
          <SeletorUnidadeOrg rotulo="Secretaria / diretoria / coordenação" valor={f.unidade_id ?? null} rotuloValor={rotulos.unidade} aoMudar={(v, r) => { mudar({ unidade_id: v ?? undefined }); setRotulos((x) => ({ ...x, unidade: r ?? undefined })); }} />
          <Selecao rotulo="Tipo de ocorrência" value={f.tipo_id ?? ''} onChange={(e) => mudar({ tipo_id: e.target.value || undefined })}>
            <option value="">Todos</option>{cat.data?.tipos.map((t) => <option key={t.id} value={t.id}>{t.grupo.slice(0, 2)} {t.nome}</option>)}</Selecao>
          <Selecao rotulo="Situação" value={f.status ?? ''} onChange={(e) => mudar({ status: e.target.value || undefined })}>
            <option value="">Todas</option>{(Object.keys(STATUS) as StatusNotificacao[]).map((s) => <option key={s} value={s}>{STATUS[s].rotulo}</option>)}</Selecao>
          <Selecao rotulo="Emitida por" value={f.emissor_papel ?? ''} onChange={(e) => mudar({ emissor_papel: e.target.value || undefined })}>
            <option value="">Qualquer responsável</option>{Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
          <Campo rotulo="Gestor, fiscal ou suplente do contrato" value={f.responsavel ?? ''} onChange={(e) => mudar({ responsavel: e.target.value || undefined })} placeholder="Nome do servidor" />
          <Selecao rotulo="Período" value={periodo} onChange={(e) => { setPeriodo(e.target.value as Periodo | ''); setPagina(0); }}>
            <option value="">Todo o período</option>{PERIODOS.filter((p) => p.id !== 'personalizado').map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}</Selecao>
          <div className="flex items-end gap-2 lg:col-span-3">
            <Selecao rotulo="Relatório agrupado por" value={agrupar} onChange={(e) => setAgrupar(e.target.value as typeof agrupar)} className="w-56">
              <option value="fornecedor">Empresa</option><option value="contrato">Contrato</option><option value="coordenacao">Secretaria/coordenação</option>
              <option value="emissor">Fiscal ou gestor</option><option value="status">Situação</option></Selecao>
            <Botao variante="secundario" icone={<FileDown className="size-4" />} disabled={!q.data?.total} onClick={async () => {
              const tudo = await painel(orgao.id, { ...filtro, limite: 500, offset: 0, incluir_rascunhos: false });
              await relatorioPdf(tudo.itens, `Notificações contratuais por ${({ fornecedor: 'empresa', contrato: 'contrato', coordenacao: 'secretaria e coordenação', emissor: 'responsável', status: 'situação' })[agrupar]}`, agrupar, orgao.nome_curto);
            }}>Relatório PDF</Botao>
            {pode('notificacoes_contratuais', 'ler') && <Link to="/notificacoes-contratuais/sancoes" className="mb-2 text-sm text-marca-700 hover:underline">Sanções aplicadas</Link>}
          </div>
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />
          : !q.data?.itens.length ? <Vazio titulo="Nenhuma notificação encontrada" descricao="Use “Emitir nova notificação” para registrar uma ocorrência em um contrato sob a sua responsabilidade." />
          : <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">Nº</th><th className="px-2 py-2 font-medium">Empresa</th><th className="px-2 py-2 font-medium">Contrato</th><th className="px-2 py-2 font-medium">Ocorrência</th>
                  <th className="px-2 py-2 font-medium">Emissão</th><th className="px-2 py-2 font-medium">Responsável</th><th className="px-2 py-2 font-medium">Prazo</th><th className="px-2 py-2 font-medium">Situação</th>
                </tr></thead>
                <tbody>{q.data.itens.map((n) => <LinhaPainel key={n.id} n={n} />)}</tbody>
              </table>
            </div>
            <Paginacao pagina={pagina} total={q.data.total} porPagina={por} aoMudar={setPagina} />
          </>}
      </Cartao>
      <EscolherContrato aberto={nova} aoFechar={() => setNova(false)} tenantId={orgao.id} />
    </>
  );
}

function EscolherContrato({ aberto, aoFechar, tenantId }: { aberto: boolean; aoFechar: () => void; tenantId: string }) {
  const navegar = useNavigate();
  const [ct, setCt] = useState<{ id: string; rotulo: string } | null>(null);
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Emitir nova notificação" descricao="Escolha o contrato. Aparecem só os contratos em que você é gestor, fiscal ou suplente (ou que o seu perfil autoriza)."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao disabled={!ct} onClick={() => navegar(`/notificacoes-contratuais/nova?contrato=${ct!.id}`)}>Continuar</Botao></>}>
      <BuscaSelect rotulo="Contrato" obrigatorio valor={ct?.id ?? null} rotuloValor={ct?.rotulo} chave={['nf-contratos', tenantId]} placeholder="Número, empresa ou objeto"
        aoMudar={(v, o) => setCt(v && o ? { id: v, rotulo: o.rotulo } : null)}
        buscar={async (t) => (await contratosDisponiveis(tenantId, t)).map((c) => ({ valor: c.id, rotulo: `${c.numero} · ${c.fornecedor}`, detalhe: `${PAPEIS[c.papel]} · ${c.objeto}` }))} />
    </Modal>
  );
}
