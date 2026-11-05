// Painel gerencial: números agregados no banco, no escopo de quem consulta.
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, FileText, Receipt, Users, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { CabecalhoPagina, CaixaErro, Cartao, Carregando, SemPermissao, Selecao, cx } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl, centavos, formatarCentavos, formatarData } from '@/lib/formatacao';
import { anosComMovimento, painel } from '@/services/relatorios';

const COR = '#2f66bd'; // série única (validada: contraste e faixa de luminosidade)
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function Indicador({ titulo, valor, detalhe, icone, para, alerta }: { titulo: string; valor: ReactNode; detalhe?: ReactNode; icone: ReactNode; para?: string; alerta?: boolean }) {
  const corpo = (
    <div className={cx('h-full rounded-xl border bg-white p-4 transition-colors', alerta ? 'border-amber-300' : 'border-slate-200', para && 'hover:border-marca-300')}>
      <div className="flex items-center gap-2 text-sm text-slate-600">{icone}{titulo}</div>
      <p className="numero mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
  return para ? <Link to={para} className="block h-full">{corpo}</Link> : corpo;
}

/** Colunas verticais (uma série): barras finas, ponta arredondada, dica ao passar o mouse */
function Colunas({ dados, rotulo }: { dados: Array<{ rotulo: string; valor: number }>; rotulo: string }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const imax = dados.findIndex((d) => d.valor === max && max > 1);
  const L = 640, A = 200, base = 176, topo = 20, faixa = L / dados.length, larg = Math.min(24, faixa * 0.6);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label={rotulo}>
        {[0.25, 0.5, 0.75, 1].map((p) => <line key={p} x1={0} x2={L} y1={base - (base - topo) * p} y2={base - (base - topo) * p} stroke="#e2e8f0" strokeWidth={1} />)}
        <line x1={0} x2={L} y1={base} y2={base} stroke="#94a3b8" strokeWidth={1} />
        {dados.map((d, i) => {
          const h = d.valor > 0 ? Math.max(2, ((base - topo) * d.valor) / max) : 0;
          const x = i * faixa + (faixa - larg) / 2;
          const r = Math.min(4, h);
          return (
            <g key={i} onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)} tabIndex={0}
              aria-label={`${d.rotulo}: ${formatarCentavos(d.valor)}`}>
              <rect x={i * faixa} y={topo - 10} width={faixa} height={base - topo + 30} fill="transparent" />
              {h > 0 && <path d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + larg - r} Q${x + larg},${base - h} ${x + larg},${base - h + r} V${base} Z`}
                fill={COR} opacity={ativo === null || ativo === i ? 1 : 0.55} />}
              <text x={i * faixa + faixa / 2} y={base + 16} textAnchor="middle" fontSize={11} fill="#64748b">{d.rotulo}</text>
              {i === imax && <text x={x + larg / 2} y={base - h - 6} textAnchor="middle" fontSize={10.5} fill="#334155">{formatarCentavos(d.valor).replace('R$ ', '')}</text>}
            </g>
          );
        })}
      </svg>
      {ativo !== null && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${Math.min(80, (ativo / dados.length) * 100)}%` }}>
          <p className="font-medium text-slate-900">{dados[ativo]!.rotulo}</p><p className="numero text-slate-700">{formatarCentavos(dados[ativo]!.valor)}</p>
        </div>
      )}
    </div>
  );
}

/** Barras horizontais de ranking (uma série) com rótulo de valor ao lado */
function Ranking({ dados }: { dados: Array<{ rotulo: string; detalhe: string; valor: number }> }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <ul className="flex flex-col gap-2.5">
      {dados.map((d) => (
        <li key={d.rotulo} title={`${d.rotulo} – ${d.detalhe}: ${formatarCentavos(d.valor)}`}>
          <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate text-slate-700"><b>{d.rotulo}</b> {d.detalhe}</span><span className="numero shrink-0 text-slate-900">{formatarCentavos(d.valor)}</span></div>
          <div className="h-3 rounded-r bg-slate-100"><div className="h-3 rounded-r" style={{ width: `${(d.valor / max) * 100}%`, background: COR }} /></div>
        </li>
      ))}
    </ul>
  );
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

  return (
    <>
      <CabecalhoPagina titulo="Painel gerencial" descricao={`${orgao.nome_curto} · valores calculados no banco, conforme o seu escopo de acesso.`}
        acoes={<Selecao rotulo="Exercício" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} className="w-36">
          {opcoesAno.map((a) => <option key={a}>{a}</option>)}</Selecao>} />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> : p && <>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador titulo="Contratos vigentes" valor={p.contratos.vigentes} icone={<FileText className="size-4" />} para="/contratos"
            detalhe={<>{p.contratos.a_vencer} a vencer · {p.contratos.vencidos} vencidos</>} alerta={p.contratos.a_vencer > 0} />
          <Indicador titulo={`Empenhado em ${p.ano}`} valor={brl(p.empenhos.empenhado)} icone={<Wallet className="size-4" />} para="/empenhos"
            detalhe={<>Saldo {brl(p.empenhos.saldo)}{p.empenhos.saldo_baixo ? ` · ${p.empenhos.saldo_baixo} com saldo baixo` : ''}</>} alerta={p.empenhos.saldo_baixo > 0} />
          <Indicador titulo={`Notas fiscais em ${p.ano}`} valor={brl(p.notas.valor)} icone={<Receipt className="size-4" />} para="/notas"
            detalhe={<>Pago {brl(p.notas.pago)} · {p.notas.quantidade} notas</>} />
          <Indicador titulo="Pendências" valor={p.notas.pendentes_atesto + p.notas.pendentes_pagamento} icone={<AlertTriangle className="size-4" />} para="/notas"
            detalhe={<>{p.notas.pendentes_atesto} de atesto · {p.notas.pendentes_pagamento} de pagamento</>} alerta={p.notas.pendentes_atesto + p.notas.pendentes_pagamento > 0} />
        </div>
        <div className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Cartao titulo={`Notas fiscais por mês de emissão – ${p.ano}`} acoes={<button className="text-xs text-marca-700 hover:underline" onClick={() => setTabela((t) => !t)}>{tabela ? 'Ver gráfico' : 'Ver como tabela'}</button>}>
            {tabela ? (
              <table className="w-full text-sm"><tbody>{p.mensal.map((m) => <tr key={m.mes} className="border-b border-slate-100"><td className="py-1">{MESES[m.mes - 1]}</td><td className="numero py-1 text-right">{brl(m.notas)}</td></tr>)}</tbody></table>
            ) : <Colunas rotulo="Valor das notas fiscais por mês" dados={p.mensal.map((m) => ({ rotulo: MESES[m.mes - 1]!, valor: centavos(m.notas) }))} />}
          </Cartao>
          <Cartao titulo={`Consumo por ação – ${p.ano}`}>
            {p.por_acao.length ? <Ranking dados={p.por_acao.map((a) => ({ rotulo: a.codigo, detalhe: a.descricao, valor: centavos(a.valor) }))} />
              : <p className="text-sm text-slate-500">Sem notas no exercício.</p>}
          </Cartao>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Cartao titulo={<span className="inline-flex items-center gap-2"><CalendarClock className="size-4" />Contratos perto do vencimento</span>}>
            {!p.vencendo.length ? <p className="text-sm text-slate-500">Nenhum contrato dentro do prazo de alerta.</p> : (
              <ul className="divide-y divide-slate-100">
                {p.vencendo.map((c) => (
                  <li key={c.id}><Link to={`/contratos/${c.id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm hover:text-marca-700">
                    <span className="font-medium">{c.numero}</span><span className="flex-1 truncate text-slate-600">{c.fornecedor_nome}</span>
                    <span className="text-amber-800">vence {formatarData(c.data_fim_atual)} ({c.dias_para_vencer} d)</span><span className="numero text-slate-500">saldo {brl(c.saldo)}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao titulo={<span className="inline-flex items-center gap-2"><Users className="size-4" />Cadastros</span>}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[['Servidores ativos', p.cadastros.servidores_ativos], ['Servidores exonerados', p.cadastros.servidores_exonerados],
                ['Fornecedores ativos', p.cadastros.fornecedores_ativos], ['Unidades atendidas', p.cadastros.unidades_atendidas],
                ['Ordens de serviço abertas', p.cadastros.os_abertas], ['Valor dos contratos vigentes', brl(p.contratos.valor_vigentes)]].map(([r, v]) => (
                <div key={r as string}><dt className="text-xs text-slate-500">{r}</dt><dd className="numero font-semibold text-slate-900">{v ?? '—'}</dd></div>
              ))}
            </dl>
          </Cartao>
        </div>
      </>}
    </>
  );
}
