// Painel gerencial: números agregados no banco, no escopo de quem consulta.
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, FileText, Receipt, Users, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { CORES, ColunasAgrupadas, ItemSelo, Legenda, LinhaSuave, Progresso, Rosca, percentual } from '@/components/graficos';
import { CabecalhoPagina, CaixaErro, Cartao, Carregando, SemPermissao, Selecao, cx } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl, centavos, formatarCentavos, formatarData } from '@/lib/formatacao';
import { anosComMovimento, painel } from '@/services/relatorios';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Valor curto para selos e dicas: R$ 1,2 mi / R$ 350 mil */
function compacto(c: number) {
  const r = c / 100, a = Math.abs(r);
  if (a >= 1e6) return `R$ ${(r / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e4) return `R$ ${(r / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return formatarCentavos(c);
}

/** Cartão de indicador: número em destaque à esquerda, rosca (ou outro visual) à direita */
function Indicador({ titulo, valor, detalhe, icone, para, alerta, visual }: {
  titulo: string; valor: ReactNode; detalhe?: ReactNode; icone: ReactNode; para?: string; alerta?: boolean; visual?: ReactNode;
}) {
  const corpo = (
    <div className={cx('flex h-full items-center gap-3 rounded-xl border bg-white p-4 transition-colors', alerta ? 'border-amber-300' : 'border-slate-200', para && 'hover:border-marca-300')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-slate-600"><span className="grid size-7 place-items-center rounded-lg bg-marca-50 text-marca-700">{icone}</span>{titulo}</div>
        <p className="numero mt-2 truncate text-2xl font-semibold text-slate-900">{valor}</p>
        {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
      </div>
      {visual}
    </div>
  );
  return para ? <Link to={para} className="block h-full">{corpo}</Link> : corpo;
}

function AlternarTabela({ tabela, alternar }: { tabela: boolean; alternar: () => void }) {
  return <button className="text-xs text-marca-700 hover:underline" onClick={alternar}>{tabela ? 'Ver gráfico' : 'Ver como tabela'}</button>;
}

export function Painel() {
  const { orgao } = useSessao();
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [tabela, setTabela] = useState(false);
  const anos = useQuery({ queryKey: ['anos-movimento', orgao?.id], queryFn: () => anosComMovimento(orgao!.id), enabled: !!orgao });
  const q = useQuery({ queryKey: ['painel', orgao?.id, ano], queryFn: () => painel(orgao!.id, ano), enabled: !!orgao });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  const p = q.data;
  const opcoesAno = [...new Set([...(anos.data ?? []), new Date().getFullYear()])].sort((a, b) => b - a);
  const alternar = () => setTabela((t) => !t);

  const tabelaMensal = p && (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1 font-medium">Mês</th><th className="py-1 text-right font-medium">Notas</th>
        <th className="py-1 text-right font-medium">Emitido</th><th className="py-1 text-right font-medium">Pago</th></tr></thead>
      <tbody>{p.mensal.map((m) => (
        <tr key={m.mes} className="border-b border-slate-100"><td className="py-1">{MESES[m.mes - 1]}</td><td className="numero py-1 text-right">{m.quantidade ?? 0}</td>
          <td className="numero py-1 text-right">{brl(m.notas)}</td><td className="numero py-1 text-right">{brl(m.pago ?? 0)}</td></tr>
      ))}</tbody>
    </table>
  );

  return (
    <>
      <CabecalhoPagina titulo="Painel gerencial" descricao={`${orgao.nome_curto} · valores calculados no banco, conforme o seu escopo de acesso.`}
        acoes={<Selecao rotulo="Exercício" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} className="w-36">
          {opcoesAno.map((a) => <option key={a}>{a}</option>)}</Selecao>} />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> : p && (() => {
        const emp = { total: centavos(p.empenhos.empenhado), usado: centavos(p.empenhos.utilizado), saldo: centavos(p.empenhos.saldo) };
        const nf = { valor: centavos(p.notas.valor), pago: centavos(p.notas.pago) };
        const ct = { valor: centavos(p.contratos.valor_vigentes), saldo: centavos(p.contratos.saldo_vigentes) };
        const pendentes = p.notas.pendentes_atesto + p.notas.pendentes_pagamento;
        const totalAcoes = p.por_acao.reduce((s, a) => s + centavos(a.valor), 0);
        const rotulos = p.mensal.map((m) => MESES[m.mes - 1]!);
        return <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador titulo="Contratos vigentes" valor={p.contratos.vigentes} icone={<FileText className="size-4" />} para="/contratos"
              detalhe={<>{p.contratos.a_vencer} a vencer · {p.contratos.vencidos} vencidos</>} alerta={p.contratos.a_vencer > 0}
              visual={<Rosca parte={ct.saldo} total={ct.valor} rotulo="Saldo dos contratos vigentes" legenda="saldo" />} />
            <Indicador titulo={`Empenhado em ${p.ano}`} valor={compacto(emp.total)} icone={<Wallet className="size-4" />} para="/empenhos"
              detalhe={<>Saldo {brl(p.empenhos.saldo)}{p.empenhos.saldo_baixo ? ` · ${p.empenhos.saldo_baixo} com saldo baixo` : ''}</>} alerta={p.empenhos.saldo_baixo > 0}
              visual={<Rosca parte={emp.usado} total={emp.total} rotulo="Empenho utilizado" legenda="usado" />} />
            <Indicador titulo={`Notas fiscais em ${p.ano}`} valor={compacto(nf.valor)} icone={<Receipt className="size-4" />} para="/notas"
              detalhe={<>Pago {brl(p.notas.pago)} · {p.notas.quantidade} notas</>}
              visual={<Rosca parte={nf.pago} total={nf.valor} cor={CORES.pago} rotulo="Valor das notas já pago" legenda="pago" />} />
            <Indicador titulo="Pendências" valor={pendentes} icone={<AlertTriangle className="size-4" />} para="/notas" alerta={pendentes > 0}
              detalhe={<>{p.notas.pendentes_atesto} de atesto · {p.notas.pendentes_pagamento} de pagamento</>}
              visual={<Rosca parte={p.notas.atestadas} total={p.notas.quantidade} rotulo="Notas atestadas" legenda="atestadas" />} />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Cartao titulo={`Notas fiscais emitidas por mês – ${p.ano}`} acoes={<AlternarTabela tabela={tabela} alternar={alternar} />}>
              {tabela ? tabelaMensal : (
                <LinhaSuave nome="Notas emitidas" rotulos={rotulos} valores={p.mensal.map((m) => Number(m.quantidade ?? 0))}
                  formatar={(v) => `${v} ${v === 1 ? 'nota' : 'notas'}`}
                  ate={p.ano === new Date().getFullYear() ? new Date().getMonth() : undefined} />
              )}
            </Cartao>
            <Cartao titulo={`Execução orçamentária – ${p.ano}`}>
              <div className="mb-5 flex items-center gap-4">
                <Rosca parte={emp.usado} total={emp.total} tamanho={112} espessura={12} rotulo="Empenho utilizado" legenda="utilizado" />
                <div className="min-w-0 text-sm">
                  <p className="text-slate-600">Utilizado</p><p className="numero text-lg font-semibold text-slate-900">{brl(p.empenhos.utilizado)}</p>
                  <p className="mt-1 text-xs text-slate-500">de {brl(p.empenhos.empenhado)} em {p.empenhos.quantidade} empenhos</p>
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                <Progresso rotulo="Saldo dos empenhos" valor={compacto(emp.saldo)} detalhe={`${percentual(emp.saldo, emp.total)}%`} parte={emp.saldo} total={emp.total} />
                <Progresso rotulo="Notas pagas" valor={compacto(nf.pago)} detalhe={`${percentual(nf.pago, nf.valor)}%`} parte={nf.pago} total={nf.valor} cor={CORES.pago} />
                <Progresso rotulo="Saldo dos contratos vigentes" valor={compacto(ct.saldo)} detalhe={`${percentual(ct.saldo, ct.valor)}%`} parte={ct.saldo} total={ct.valor} />
              </div>
            </Cartao>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Cartao titulo={`Valor emitido × pago por mês de emissão – ${p.ano}`} acoes={<AlternarTabela tabela={tabela} alternar={alternar} />}>
              {tabela ? tabelaMensal : <>
                <div className="mb-2"><Legenda series={[{ nome: 'Emitido', cor: CORES.emitido }, { nome: 'Pago', cor: CORES.pago }]} /></div>
                <ColunasAgrupadas rotulo="Valor emitido e pago das notas por mês" rotulos={rotulos} formatar={formatarCentavos}
                  series={[{ nome: 'Emitido', cor: CORES.emitido, valores: p.mensal.map((m) => centavos(m.notas)) },
                    { nome: 'Pago', cor: CORES.pago, valores: p.mensal.map((m) => centavos(m.pago ?? 0)) }]} />
              </>}
            </Cartao>
            <Cartao titulo={`Consumo por ação – ${p.ano}`}>
              {p.por_acao.length ? (
                <div className="flex flex-col gap-3.5">
                  {p.por_acao.map((a) => (
                    <Progresso key={a.codigo} rotulo={<span title={a.descricao}><b>{a.codigo}</b> {a.descricao}</span>} valor={compacto(centavos(a.valor))}
                      detalhe={`${percentual(centavos(a.valor), totalAcoes)}%`} parte={centavos(a.valor)} total={centavos(p.por_acao[0]!.valor)} />
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">Sem notas no exercício.</p>}
            </Cartao>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Cartao titulo={<span className="inline-flex items-center gap-2"><CalendarClock className="size-4" />Contratos perto do vencimento</span>}>
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
              <ul className="divide-y divide-slate-100">
                {([['Servidores ativos', p.cadastros.servidores_ativos, 'marca'], ['Servidores exonerados', p.cadastros.servidores_exonerados, 'neutro'],
                  ['Fornecedores ativos', p.cadastros.fornecedores_ativos, 'marca'], ['Unidades atendidas', p.cadastros.unidades_atendidas, 'marca'],
                  ['Ordens de serviço abertas', p.cadastros.os_abertas, p.cadastros.os_abertas ? 'alerta' : 'neutro'],
                  ['Valor dos contratos vigentes', compacto(ct.valor), 'marca']] as const).map(([r, v, tom]) => (
                  <li key={r}><ItemSelo titulo={<span className="font-normal text-slate-700">{r}</span>} selo={v ?? '—'} tom={tom} /></li>
                ))}
              </ul>
            </Cartao>
          </div>
        </>;
      })()}
    </>
  );
}
