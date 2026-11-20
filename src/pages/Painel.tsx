// Painel gerencial no formato de dashboard financeiro: faixa de atalhos por grupo, segmentações
// (exercício, meses e coordenação) e gráficos calculados no banco, no escopo de quem consulta.
// Os filtros ficam no endereço da página (?ano=&meses=&coord=), então o painel pode ser compartilhado já filtrado.
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, BookOpen, Building2, CalendarClock, ClipboardList, FileSpreadsheet, FileText, FilterX,
  GraduationCap, Hourglass, Network, Receipt, Truck, UserCircle, Users, Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { CORES, ColunasAgrupadas, ItemSelo, Legenda, LinhaSuave, Progresso, Rosca, percentual } from '@/components/graficos';
import { CabecalhoPagina, CaixaErro, Cartao, Carregando, Indicador, SemPermissao, cx } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl, centavos, formatarCentavos, formatarData } from '@/lib/formatacao';
import type { Acao, Recurso } from '@/lib/tipos';
import { anosComMovimento, painel, painelGerencial } from '@/services/relatorios';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Valor curto para selos e dicas: R$ 1,2 mi / R$ 350 mil */
function compacto(c: number) {
  const r = c / 100, a = Math.abs(r);
  if (a >= 1e6) return `R$ ${(r / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e4) return `R$ ${(r / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return formatarCentavos(c);
}

// ---------------------------------------------------------------- faixa de atalhos (como a faixa de opções de uma planilha)

type Atalho = { para: string; rotulo: string; icone: ReactNode; cor: string; recurso?: Recurso; acao?: Acao };
const GRUPOS: Array<{ titulo: string; itens: Atalho[] }> = [
  { titulo: 'Cadastros', itens: [
    { para: '/fornecedores', rotulo: 'Fornecedores', icone: <Truck />, cor: 'bg-sky-100 text-sky-700', recurso: 'fornecedores' },
    { para: '/servidores', rotulo: 'Servidores', icone: <UserCircle />, cor: 'bg-indigo-100 text-indigo-700', recurso: 'servidores' },
    { para: '/unidades-atendidas', rotulo: 'Unidades atendidas', icone: <Building2 />, cor: 'bg-teal-100 text-teal-700', recurso: 'unidades' },
    { para: '/classificacao', rotulo: 'Classificação', icone: <Network />, cor: 'bg-violet-100 text-violet-700', recurso: 'classificacoes' },
  ] },
  { titulo: 'Lançamentos', itens: [
    { para: '/contratos', rotulo: 'Contratos', icone: <FileText />, cor: 'bg-blue-100 text-blue-700' },
    { para: '/empenhos', rotulo: 'Empenhos', icone: <Wallet />, cor: 'bg-amber-100 text-amber-700' },
    { para: '/notas', rotulo: 'Notas fiscais', icone: <Receipt />, cor: 'bg-emerald-100 text-emerald-700' },
    { para: '/pagamentos', rotulo: 'Pagamentos', icone: <Banknote />, cor: 'bg-green-100 text-green-700', recurso: 'notas_fiscais', acao: 'editar' },
  ] },
  { titulo: 'Relatórios', itens: [
    { para: '/relatorios', rotulo: 'Consulta e relatórios', icone: <FileSpreadsheet />, cor: 'bg-cyan-100 text-cyan-700' },
    { para: '/servidores/consolidado', rotulo: 'Consolidado mensal', icone: <CalendarClock />, cor: 'bg-rose-100 text-rose-700', recurso: 'servidores' },
    { para: '/ordens-servico', rotulo: 'Ordens de serviço', icone: <ClipboardList />, cor: 'bg-orange-100 text-orange-700', recurso: 'ordens_servico' },
  ] },
  { titulo: 'Suporte', itens: [
    { para: '/ajuda', rotulo: 'Ajuda e manual', icone: <BookOpen />, cor: 'bg-slate-100 text-slate-700' },
    { para: '/ajuda/capacitacao', rotulo: 'Capacitação', icone: <GraduationCap />, cor: 'bg-fuchsia-100 text-fuchsia-700' },
  ] },
];

function FaixaAtalhos() {
  const { pode } = useSessao();
  const grupos = GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((a) => !a.recurso || pode(a.recurso, a.acao ?? 'ler')) })).filter((g) => g.itens.length);
  return (
    <nav aria-label="Atalhos do painel" className="mb-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-w-max divide-x divide-slate-200">
        {grupos.map((g) => (
          <div key={g.titulo} className="flex flex-col px-2 pt-2">
            <ul className="flex gap-1">
              {g.itens.map((a) => (
                <li key={a.para}>
                  <Link to={a.para} className="group flex w-[86px] flex-col items-center gap-1.5 rounded-lg px-1 py-1.5 text-center text-[11.5px] leading-tight text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-marca-600">
                    <span className={cx('grid size-9 place-items-center rounded-lg transition-transform group-hover:-translate-y-0.5 [&>svg]:size-5', a.cor)} aria-hidden>{a.icone}</span>
                    {a.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1 border-t border-slate-100 py-1 text-center text-[10.5px] font-medium uppercase tracking-wide text-slate-500">{g.titulo}</p>
          </div>
        ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- segmentações (filtros em botões)

function Segmento({ ativo, aoClicar, children, titulo }: { ativo: boolean; aoClicar: () => void; children: ReactNode; titulo?: string }) {
  return (
    <button type="button" aria-pressed={ativo} title={titulo} onClick={aoClicar}
      className={cx('h-8 truncate rounded-md px-2 text-left text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marca-600',
        ativo ? 'bg-marca-800 text-white shadow-sm' : 'bg-marca-50 text-marca-900 hover:bg-marca-100')}>
      {children}
    </button>
  );
}

function GrupoFiltro({ titulo, limpar, children }: { titulo: string; limpar?: () => void; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-semibold text-marca-900">
        {titulo}
        {limpar && <button type="button" onClick={limpar} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Limpar filtro de ${titulo.toLowerCase()}`} title="Limpar filtro"><FilterX className="size-4" /></button>}
      </legend>
      {children}
    </fieldset>
  );
}

// ---------------------------------------------------------------- cartões

function AlternarTabela({ tabela, alternar }: { tabela: boolean; alternar: () => void }) {
  return <button className="text-xs text-white/85 hover:text-white hover:underline" onClick={alternar}>{tabela ? 'Ver gráfico' : 'Ver como tabela'}</button>;
}

function TabelaSimples({ colunas, linhas }: { colunas: string[]; linhas: Array<Array<ReactNode>> }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-slate-200 text-xs text-slate-500">{colunas.map((c, i) => <th key={c} className={cx('py-1 font-medium', i ? 'text-right' : 'text-left')}>{c}</th>)}</tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i} className="border-b border-slate-100">{l.map((c, j) => <td key={j} className={cx('py-1', j > 0 && 'numero text-right')}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

export function Painel() {
  const { orgao } = useSessao();
  const [params, setParams] = useSearchParams();
  const anoAtual = new Date().getFullYear();
  const ano = Number(params.get('ano')) || anoAtual;
  const meses = (params.get('meses') ?? '').split(',').map(Number).filter((m) => m >= 1 && m <= 12);
  const coord = params.get('coord');
  const [tabela, setTabela] = useState<{ mensal: boolean; espera: boolean }>({ mensal: false, espera: false });

  const anos = useQuery({ queryKey: ['anos-movimento', orgao?.id], queryFn: () => anosComMovimento(orgao!.id), enabled: !!orgao });
  const q = useQuery({ queryKey: ['painel-gerencial', orgao?.id, ano, meses.join(','), coord], queryFn: () => painelGerencial(orgao!.id, ano, meses, coord), enabled: !!orgao });
  const cad = useQuery({ queryKey: ['painel', orgao?.id, ano], queryFn: () => painel(orgao!.id, ano), enabled: !!orgao });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;

  const definir = (mudar: (n: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); mudar(n); return n; }, { replace: true });
  const alternarMes = (m: number) => definir((n) => {
    const novo = meses.includes(m) ? meses.filter((x) => x !== m) : [...meses, m].sort((a, b) => a - b);
    if (novo.length) n.set('meses', novo.join(',')); else n.delete('meses');
  });
  const opcoesAno = [...new Set([...(anos.data ?? []), anoAtual])].sort((a, b) => b - a);
  const p = q.data;
  const unidade = p?.unidades.find((u) => u.id === coord);
  const periodo = `${meses.length ? meses.map((m) => MESES_EXTENSO[m - 1]).join(', ') + ' de ' : ''}${ano}`;

  const filtros = (
    <aside className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-20" aria-label="Filtros do painel">
      <GrupoFiltro titulo="Exercício">
        <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-2">
          {opcoesAno.map((a) => <Segmento key={a} ativo={a === ano} aoClicar={() => definir((n) => { if (a === anoAtual) n.delete('ano'); else n.set('ano', String(a)); })}>{a}</Segmento>)}
        </div>
      </GrupoFiltro>
      <GrupoFiltro titulo="Mês" limpar={meses.length ? () => definir((n) => n.delete('meses')) : undefined}>
        <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-3">
          {MESES.map((m, i) => <Segmento key={m} ativo={meses.includes(i + 1)} aoClicar={() => alternarMes(i + 1)} titulo={MESES_EXTENSO[i]}>{m}</Segmento>)}
        </div>
      </GrupoFiltro>
      {p && p.unidades.length > 1 && (
        <GrupoFiltro titulo="Coordenação" limpar={coord ? () => definir((n) => n.delete('coord')) : undefined}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
            {p.unidades.map((u) => <Segmento key={u.id} ativo={u.id === coord} titulo={u.nome}
              aoClicar={() => definir((n) => { if (u.id === coord) n.delete('coord'); else n.set('coord', u.id); })}>{u.sigla ?? u.nome}</Segmento>)}
          </div>
        </GrupoFiltro>
      )}
      <p className="text-[11px] leading-snug text-slate-500">Os meses filtram notas e pagamentos pela data. Notas a pagar e o saldo dos empenhos mostram a situação de hoje.</p>
    </aside>
  );

  return (
    <>
      <CabecalhoPagina titulo="Painel gerencial"
        descricao={`${unidade ? `${unidade.sigla ?? unidade.nome} · ` : `${orgao.nome_curto} · `}${periodo} · valores calculados no banco, conforme o seu escopo de acesso.`} />
      <FaixaAtalhos />
      <div className="grid items-start gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {filtros}
        <div className="min-w-0">
          {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> : p && (() => {
            const i = p.indicadores;
            const v = { notas: centavos(i.notas_valor), pago: centavos(i.pago_bruto), liquido: centavos(i.pago_liquido), aPagar: centavos(i.a_pagar),
              empenhado: centavos(i.empenhado), saldo: centavos(i.saldo_empenhos), contratos: centavos(i.valor_vigentes) };
            const pendentes = i.pendentes_atesto + i.pendentes_pagamento;
            const rotulos = p.mensal.map((m) => MESES[m.mes - 1]!);
            const destacar = meses.length ? (k: number) => meses.includes(k + 1) : undefined;
            const totalFornecedores = p.top_fornecedores.reduce((s, f) => s + centavos(f.valor), 0);
            const totalAcoes = p.top_acoes.reduce((s, a) => s + centavos(a.valor), 0);
            const esperaVazia = p.espera.every((f) => !centavos(f.atestadas) && !centavos(f.sem_atesto));
            return <>
              <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Indicador rotulo="Notas lançadas" valor={compacto(v.notas)} icone={<Receipt className="size-4" />} para="/notas"
                  detalhe={<>{i.notas_quantidade} notas em {periodo}</>} />
                <Indicador rotulo="Pago" valor={compacto(v.pago)} icone={<Banknote className="size-4" />} para="/pagamentos"
                  detalhe={<>Líquido {brl(i.pago_liquido)} · retido {formatarCentavos(v.pago - v.liquido)}</>}
                  visual={<Rosca parte={v.pago} total={v.notas} cor={CORES.pago} rotulo="Pago sobre o lançado" legenda="pago" />} />
                <Indicador rotulo="A pagar hoje" valor={compacto(v.aPagar)} icone={<Hourglass className="size-4" />} para="/pagamentos" tom={pendentes > 0 ? 'alerta' : undefined}
                  detalhe={<>{i.pendentes_atesto} aguardando atesto · {i.pendentes_pagamento} aguardando baixa</>} />
                <Indicador rotulo={`Saldo dos empenhos ${p.ano}`} valor={compacto(v.saldo)} icone={<Wallet className="size-4" />} para="/empenhos" tom={i.empenhos_saldo_baixo > 0 ? 'alerta' : undefined}
                  detalhe={<>Empenhado {compacto(v.empenhado)}{i.empenhos_saldo_baixo ? ` · ${i.empenhos_saldo_baixo} com saldo baixo` : ''}</>}
                  visual={<Rosca parte={v.saldo} total={v.empenhado} rotulo="Saldo sobre o empenhado" legenda="saldo" />} />
              </div>

              <div className="mb-5 grid gap-5 xl:grid-cols-3">
                <Cartao titulo={`Lançado × pago – ${p.ano}`} className="xl:col-span-2" acoes={<AlternarTabela tabela={tabela.mensal} alternar={() => setTabela((t) => ({ ...t, mensal: !t.mensal }))} />}>
                  {tabela.mensal ? <TabelaSimples colunas={['Mês', 'Lançado', 'Pago', 'A pagar']}
                    linhas={p.mensal.map((m) => [MESES[m.mes - 1], brl(m.lancado), brl(m.pago), brl(m.a_pagar)])} /> : <>
                    <div className="mb-2"><Legenda series={[{ nome: 'Lançado', cor: CORES.emitido }, { nome: 'Pago', cor: CORES.pago }, { nome: 'A pagar no fim do mês', cor: CORES.aPagar }]} /></div>
                    <ColunasAgrupadas rotulo="Valor lançado e pago por mês, com o estoque a pagar no fim de cada mês" rotulos={rotulos} formatar={formatarCentavos} destacar={destacar}
                      series={[{ nome: 'Lançado', cor: CORES.emitido, valores: p.mensal.map((m) => centavos(m.lancado)) },
                        { nome: 'Pago', cor: CORES.pago, valores: p.mensal.map((m) => centavos(m.pago)) }]}
                      linha={{ nome: 'A pagar', cor: CORES.aPagar, valores: p.mensal.slice(0, p.ano === anoAtual ? new Date().getMonth() + 1 : 12).map((m) => centavos(m.a_pagar)) }} />
                  </>}
                </Cartao>
                <Cartao titulo="Maiores fornecedores">
                  {p.top_fornecedores.length ? (
                    <div className="flex flex-col gap-3">
                      {p.top_fornecedores.map((f) => (
                        <Progresso key={f.nome} rotulo={<span title={f.nome}>{f.nome}</span>} valor={compacto(centavos(f.valor))} cor={CORES.pago}
                          detalhe={`${percentual(centavos(f.valor), totalFornecedores)}%`} parte={centavos(f.valor)} total={centavos(p.top_fornecedores[0]!.valor)} />
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-500">Sem notas no período.</p>}
                </Cartao>
              </div>

              <div className="mb-5 grid gap-5 xl:grid-cols-3">
                <Cartao titulo="A pagar por tempo de espera" acoes={<AlternarTabela tabela={tabela.espera} alternar={() => setTabela((t) => ({ ...t, espera: !t.espera }))} />}>
                  {esperaVazia ? <p className="text-sm text-slate-500">Nenhuma nota a pagar.</p> : tabela.espera ? <TabelaSimples colunas={['Dias desde a emissão', 'Atestadas', 'Sem atesto']}
                    linhas={p.espera.map((f) => [f.faixa, brl(f.atestadas), brl(f.sem_atesto)])} /> : <>
                    <div className="mb-2"><Legenda series={[{ nome: 'Atestadas (aguardando baixa)', cor: CORES.aPagar }, { nome: 'Aguardando atesto', cor: CORES.emitido }]} /></div>
                    <ColunasAgrupadas rotulo="Valor das notas a pagar por dias desde a emissão" rotulos={p.espera.map((f) => `${f.faixa} d`)} formatar={formatarCentavos} largura={380}
                      series={[{ nome: 'Atestadas', cor: CORES.aPagar, valores: p.espera.map((f) => centavos(f.atestadas)) },
                        { nome: 'Aguardando atesto', cor: CORES.emitido, valores: p.espera.map((f) => centavos(f.sem_atesto)) }]} />
                  </>}
                </Cartao>
                <Cartao titulo={`Saldo dos empenhos ao longo de ${p.ano}`} className="xl:col-span-2">
                  {v.empenhado > 0
                    ? <LinhaSuave rotulos={rotulos} valores={p.execucao.map((e) => centavos(e.saldo))} formatar={compacto} nome="Saldo dos empenhos"
                        ate={p.ano === anoAtual ? new Date().getMonth() : undefined} />
                    : <p className="text-sm text-slate-500">Nenhum empenho no exercício.</p>}
                </Cartao>
              </div>

              <div className="grid gap-5 xl:grid-cols-3">
                <Cartao titulo={`Consumo por ação – ${periodo}`}>
                  {p.top_acoes.length ? (
                    <div className="flex flex-col gap-3">
                      {p.top_acoes.map((a) => (
                        <Progresso key={a.codigo} rotulo={<span title={a.descricao}><b>{a.codigo}</b> {a.descricao}</span>} valor={compacto(centavos(a.valor))}
                          detalhe={`${percentual(centavos(a.valor), totalAcoes)}%`} parte={centavos(a.valor)} total={centavos(p.top_acoes[0]!.valor)} />
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-500">Sem notas com empenho no período.</p>}
                </Cartao>
                <Cartao titulo={<span className="inline-flex items-center gap-2"><CalendarClock className="size-4" />Contratos perto do vencimento</span>}>
                  <p className="mb-1 text-xs text-slate-500">{i.contratos_vigentes} vigentes ({compacto(v.contratos)}) · {i.contratos_a_vencer} a vencer · {i.contratos_vencidos} vencidos</p>
                  {!p.vencendo.length ? <p className="text-sm text-slate-500">Nenhum contrato dentro do prazo de alerta.</p> : (
                    <ul className="divide-y divide-slate-100">
                      {p.vencendo.map((c) => (
                        <li key={c.id}><Link to={`/contratos/${c.id}`} className="block hover:bg-slate-50">
                          <ItemSelo titulo={<>{c.numero} <span className="font-normal text-slate-600">· {c.fornecedor_nome}</span></>}
                            detalhe={<>vence {formatarData(c.data_fim_atual)} · saldo {brl(c.saldo)}</>}
                            selo={`${c.dias_para_vencer} ${c.dias_para_vencer === 1 ? 'dia' : 'dias'}`} tom="alerta" />
                        </Link></li>
                      ))}
                    </ul>
                  )}
                </Cartao>
                <Cartao titulo={<span className="inline-flex items-center gap-2"><Users className="size-4" />Cadastros</span>}>
                  {cad.data ? (
                    <ul className="divide-y divide-slate-100">
                      {([['Servidores ativos', cad.data.cadastros.servidores_ativos, 'marca'], ['Fornecedores ativos', cad.data.cadastros.fornecedores_ativos, 'marca'],
                        ['Unidades atendidas', cad.data.cadastros.unidades_atendidas, 'marca'],
                        ['Ordens de serviço abertas', cad.data.cadastros.os_abertas, cad.data.cadastros.os_abertas ? 'alerta' : 'neutro'],
                        ['Pendências de atesto e baixa', pendentes, pendentes ? 'alerta' : 'neutro']] as const).map(([r, val, tom]) => (
                        <li key={r}><ItemSelo titulo={<span className="font-normal text-slate-700">{r}</span>} selo={val ?? '—'} tom={tom} /></li>
                      ))}
                    </ul>
                  ) : <Carregando />}
                  {pendentes > 0 && <Link to="/notas" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:underline"><AlertTriangle className="size-3.5" />Ver notas pendentes</Link>}
                </Cartao>
              </div>
            </>;
          })()}
        </div>
      </div>
    </>
  );
}
