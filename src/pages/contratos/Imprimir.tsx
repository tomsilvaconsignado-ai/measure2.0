// Impressão de documentos emitidos (A4). Mostra o retrato salvo na emissão: alterações
// posteriores nos cadastros não mudam o documento.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DocumentoEmitido } from '@/lib/tipos';
import { useNavigate, useParams } from 'react-router-dom';
import { ImagemPrivada } from '@/components/ImagemPrivada';
import { Botao, CaixaErro, Carregando } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl, formatarCnpj, formatarCpf, formatarData, formatarDataHora, formatarTelefone } from '@/lib/formatacao';
import { obterEmitido } from '@/services/execucao';
import { ImprimirExtratoNotas } from './ImprimirExtratoNotas';

/* eslint-disable @typescript-eslint/no-explicit-any */
type D = Record<string, any>;

const PAPEIS: Record<string, string> = { GESTOR: 'Gestor', FISCAL: 'Fiscal', SUPLENTE: 'Suplente', LANCADOR: 'Quem lançou a nota' };
const SIT_PAG: Record<string, string> = { PENDENTE: 'Pendente', PARCIAL: 'Parcial', PAGO: 'Paga', CANCELADA: 'Cancelada' };
const TIPO_ADITIVO: Record<string, string> = { PRAZO: 'Prazo', VALOR: 'Valor', PRAZO_E_VALOR: 'Prazo e valor', SUPRESSAO: 'Supressão', OUTRO: 'Outro' };
const TIPO_EMPENHO: Record<string, string> = { ORDINARIO: 'Ordinário', ESTIMATIVO: 'Estimativo', GLOBAL: 'Global' };

function Tabela({ colunas, linhas, total }: { colunas: Array<[string, string?]>; linhas: ReactNode[][]; total?: ReactNode[] }) {
  return (
    <table className="mb-4 w-full border-collapse text-[10.5px]">
      <thead className="table-header-group"><tr>{colunas.map(([c, al]) => <th key={c} className={`border border-slate-400 bg-slate-100 px-1.5 py-1 font-semibold ${al === 'r' ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
      <tbody>
        {linhas.length === 0 && <tr><td colSpan={colunas.length} className="border border-slate-400 px-1.5 py-1 text-center text-slate-500">Nenhum registro.</td></tr>}
        {linhas.map((l, i) => <tr key={i} className="break-inside-avoid">{l.map((c, j) => <td key={j} className={`border border-slate-400 px-1.5 py-1 align-top break-words ${colunas[j]?.[1] === 'r' ? 'numero text-right whitespace-nowrap' : ''}`}>{c}</td>)}</tr>)}
        {total && <tr className="font-semibold">{total.map((c, j) => <td key={j} className={`border border-slate-400 bg-slate-50 px-1.5 py-1 ${colunas[j]?.[1] === 'r' ? 'numero text-right' : ''}`}>{c}</td>)}</tr>}
      </tbody>
    </table>
  );
}

const Secao = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section className="mb-3"><h2 className="mb-1.5 border-b border-slate-300 pb-0.5 text-[11.5px] font-bold uppercase tracking-wide">{titulo}</h2>{children}</section>
);

function ExtratoContrato({ d }: { d: D }) {
  const c = d.contrato;
  const somaNotas = (d.notas as D[]).reduce((s, n) => s + Number(n.valor), 0);
  return <>
    <Secao titulo="Dados do contrato">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <p><b>Fornecedor:</b> {d.fornecedor.nome} ({d.fornecedor.tipo === 'PF' ? formatarCpf(d.fornecedor.documento) : formatarCnpj(d.fornecedor.documento)})</p>
        <p><b>Modalidade:</b> {d.modalidade}</p>
        <p><b>Processo:</b> {c.processo_administrativo ?? '—'}</p><p><b>Licitação:</b> {c.numero_licitacao ?? '—'}</p>
        <p><b>Vigência:</b> {formatarData(c.data_inicio)} a {formatarData(d.data_fim_atual)}</p><p><b>Unidade responsável:</b> {d.unidade.nome}</p>
        <p><b>Valor global:</b> {brl(c.valor_global)}</p><p><b>Valor atual (com aditivos):</b> {brl(d.valor_atual)}</p>
        <p className="col-span-2"><b>Objeto:</b> {c.objeto}</p>
      </div>
    </Secao>
    <Secao titulo="Responsáveis">
      <Tabela colunas={[['Função'], ['Servidor'], ['Matrícula'], ['Portaria']]} linhas={(d.responsaveis as D[]).map((r) => [PAPEIS[r.papel], r.nome, r.matricula, r.portaria ?? '—'])} />
    </Secao>
    <Secao titulo="Dotação orçamentária"><p className="text-[11px]">{(d.dotacoes as string[]).join(' · ') || '—'}</p></Secao>
    {(d.aditivos as D[]).length > 0 && <Secao titulo="Aditivos aprovados">
      <Tabela colunas={[['Aditivo'], ['Tipo'], ['Assinatura'], ['Nova vigência'], ['Valor', 'r']]}
        linhas={(d.aditivos as D[]).map((a) => [a.numero, TIPO_ADITIVO[a.tipo] ?? a.tipo, formatarData(a.data_assinatura), formatarData(a.nova_data_fim), brl(a.valor)])} />
    </Secao>}
    <Secao titulo="Empenhos">
      <Tabela colunas={[['Empenho'], ['Data'], ['Dotação'], ['Valor + reforços', 'r'], ['Utilizado', 'r'], ['Saldo', 'r']]}
        linhas={(d.empenhos as D[]).map((e) => [`${e.numero}/${e.ano}`, formatarData(e.data), e.classificacao, brl(e.valor_total), brl(e.utilizado), brl(e.saldo)])} />
    </Secao>
    <Secao titulo="Notas fiscais">
      <Tabela colunas={[['Nota'], ['Data'], ['Empenho'], ['Referência'], ['Atesto'], ['Pagamento'], ['Valor', 'r']]}
        linhas={(d.notas as D[]).map((n) => [n.numero, formatarData(n.data), n.empenho, n.meses, n.atesto === 'ATESTADA' ? 'Atestada' : 'Pendente', SIT_PAG[n.pagamento], brl(n.valor)])}
        total={['Total', '', '', '', '', '', brl(somaNotas)]} />
      <p className="text-[11px]"><b>Saldo do contrato:</b> {brl(Number(d.valor_atual) - somaNotas)}</p>
    </Secao>
  </>;
}

function ExtratoEmpenho({ d }: { d: D }) {
  const e = d.empenho;
  return <>
    <Secao titulo="Dados do empenho">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <p><b>Fornecedor:</b> {e.fornecedor_nome}</p><p><b>Contrato:</b> {e.contrato_numero}</p>
        <p><b>Data:</b> {formatarData(e.data_empenho)}</p><p><b>Tipo:</b> {TIPO_EMPENHO[e.tipo] ?? e.tipo}</p>
        <p><b>Processo:</b> {e.processo ?? '—'}</p><p><b>SD:</b> {e.sd ?? '—'}</p>
        <p className="col-span-2"><b>Dotação:</b> {e.classificacao_codigo}</p>
        <p className="col-span-2"><b>Unidades atendidas:</b> {(d.unidades as string[]).join(', ') || '—'}</p>
        <p className="col-span-2"><b>Objeto:</b> {e.contrato_objeto}</p>
      </div>
    </Secao>
    <Secao titulo="Resumo financeiro">
      <Tabela colunas={[['Valor empenhado', 'r'], ['Reforços', 'r'], ['Total', 'r'], ['Utilizado em notas', 'r'], ['Saldo', 'r']]}
        linhas={[[brl(e.valor), brl(e.reforcos), brl(e.valor_total), brl(e.utilizado), brl(e.saldo)]]} />
    </Secao>
    <Secao titulo="Reforços">
      <Tabela colunas={[['Data'], ['Número'], ['Motivo'], ['Valor', 'r']]} linhas={(d.reforcos as D[]).map((r) => [formatarData(r.data), r.numero ?? '—', r.motivo ?? '—', brl(r.valor)])} />
    </Secao>
    <Secao titulo="Notas fiscais">
      <Tabela colunas={[['Nota'], ['Data'], ['Referência'], ['Atesto'], ['Pagamento'], ['Valor', 'r']]}
        linhas={(d.notas as D[]).map((n) => [n.numero, formatarData(n.data), n.meses, n.atesto === 'ATESTADA' ? 'Atestada' : 'Pendente', SIT_PAG[n.pagamento], brl(n.valor)])} />
    </Secao>
  </>;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Consolidado mensal (A4 paisagem): título fixo do modelo; o filtro aparece só nos critérios.
// O cabeçalho da tabela repete em cada página; o rodapé da tabela leva endereço e Secretaria.
function ConsolidadoMensal({ d }: { d: D }) {
  const linhas = d.linhas as D[];
  const cel = 'border border-slate-500 px-1.5 py-1 align-top break-words';
  return <>
    <p className="mb-3 text-center text-[12px] font-semibold">Mês de referência: {MESES[(d.mes as number) - 1]} de {d.ano}</p>
    <p className="mb-2 text-[10.5px]"><b>Unidade:</b> {d.unidade.sigla ? `${d.unidade.sigla} · ` : ''}{d.unidade.nome}{d.secretaria ? ` · ${d.secretaria}` : ''}</p>
    <table className="w-full table-fixed border-collapse text-[10px] leading-snug">
      <colgroup><col style={{ width: '9%' }} /><col style={{ width: '25%' }} /><col style={{ width: '8%' }} /><col style={{ width: '17%' }} />
        <col style={{ width: '6.5%' }} /><col style={{ width: '6.5%' }} /><col style={{ width: '28%' }} /></colgroup>
      <thead className="table-header-group">
        <tr className="bg-slate-100">{['Matrícula', 'Nome do servidor', 'Cargo', 'Função', 'Atrasos', 'Faltas', 'Observações'].map((c) =>
          <th key={c} className={`${cel} font-semibold ${c === 'Atrasos' || c === 'Faltas' ? 'text-center' : 'text-left'}`}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.length === 0 && <tr><td colSpan={7} className={`${cel} text-center`}>Nenhum servidor ativo no mês.</td></tr>}
        {linhas.map((l, i) => (
          <tr key={i} className="break-inside-avoid">
            <td className={cel}>{l.matricula}</td><td className={cel}>{l.nome}</td><td className={cel}>{l.cargo ?? ''}</td><td className={cel}>{l.funcao ?? ''}</td>
            <td className={`${cel} text-center`}>{l.atrasos || ''}</td><td className={`${cel} text-center`}>{l.faltas || ''}</td><td className={cel}>{l.observacao}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="table-footer-group">
        <tr><td colSpan={7} className="pt-2 text-center text-[8.5px] text-slate-600">{[d.secretaria, d.orgao?.endereco].filter(Boolean).join(' · ')}</td></tr>
      </tfoot>
    </table>
    {!!(d.ferias as D[] | undefined)?.length && <>
      <p className="mb-1 mt-4 text-[11px] font-semibold">Servidores em férias no mês de referência</p>
      <table className="w-full table-fixed border-collapse text-[10px] leading-snug">
        <colgroup><col style={{ width: '9%' }} /><col style={{ width: '37%' }} /><col style={{ width: '24%' }} /><col style={{ width: '14%' }} /><col style={{ width: '16%' }} /></colgroup>
        <thead className="table-header-group">
          <tr className="bg-slate-100">{['Matrícula', 'Nome do servidor', 'Período de férias', 'Dias', 'Situação'].map((c) => <th key={c} className={`${cel} text-left font-semibold`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {(d.ferias as D[]).map((f, i) => (
            <tr key={i} className="break-inside-avoid">
              <td className={cel}>{f.matricula}</td><td className={cel}>{f.nome}</td>
              <td className={cel}>{formatarData(f.inicio)} a {formatarData(f.fim)}</td>
              <td className={cel}>{f.dias}{f.dias_no_mes !== f.dias ? ` (${f.dias_no_mes} no mês)` : ''}</td>
              <td className={cel}>{SITUACAO_FERIAS_DOC[f.situacao as string] ?? f.situacao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>}
    <Assinaturas nomes={d.assinaturas as string[]} />
  </>;
}

const SITUACAO_FERIAS_DOC: Record<string, string> = { PENDENTE: 'Pendente', PROGRAMADA: 'Programada', EM_GOZO: 'Em gozo', GOZADA: 'Gozada' };

function Assinaturas({ nomes }: { nomes: string[] }) {
  return (
    <div className="mt-14 grid break-inside-avoid gap-10 text-center text-[10.5px]" style={{ gridTemplateColumns: `repeat(${Math.max(1, nomes.length)}, minmax(0, 1fr))` }}>
      {nomes.map((n) => <div key={n}><div className="mx-auto mb-1 w-4/5 border-t border-slate-700" />{n}</div>)}
    </div>
  );
}

// Checklist da nota fiscal: conferências do sistema (no momento da emissão) e itens para marcação manual
// Formulário de análise dos documentos da nota (modelo da SMS: serviços continuados)
function ChecklistServicos({ d }: { d: D }) {
  const n = d.nota; const f = d.fornecedor; const r = d.responsavel;
  const c = 'border border-slate-700 px-1.5 py-1 align-top';
  const cab = `${c} bg-sky-100`;
  const contato = [f.contato, f.telefone ? formatarTelefone(f.telefone) : null, f.email].filter(Boolean).join(' · ');
  const marca = (m: string | null, v: string) => (m === v ? 'X' : '-');
  const periodo = d.periodo_inicio ? `${formatarData(d.periodo_inicio)} A ${formatarData(d.periodo_fim)}` : '';
  return <>
    <table className="w-full table-fixed border-collapse text-[10.5px] leading-snug">
      <colgroup><col style={{ width: '22%' }} /><col style={{ width: '28%' }} /><col style={{ width: '22%' }} /><col style={{ width: '28%' }} /></colgroup>
      <tbody>
        <tr><td colSpan={4} className={`${c} bg-[#1f3864] py-1.5 text-center text-[11.5px] font-bold uppercase text-white`}>{d.titulo}</td></tr>
        <tr><td colSpan={2} className={cab}><b>CONTRATO Nº:</b> {d.contrato.numero}</td><td colSpan={2} className={cab}><b>UNIDADE:</b> {d.unidade ?? ''}</td></tr>
        <tr><td colSpan={2} className={c}><b>CONTRATADA:</b> {f.nome}</td><td colSpan={2} className={c}><b>CONTATO:</b> {contato}</td></tr>
        <tr><td colSpan={4} className={c}><b>SERVIÇOS:</b> {d.contrato.objeto}</td></tr>
        <tr><td colSpan={2} className={c}><b>FUNCIONÁRIOS Nº:</b> {d.funcionarios ?? ''}</td><td colSpan={2} className={c}><b>PERÍODO DE EXECUÇÃO DO SERVIÇO:</b> {periodo}</td></tr>
        <tr>
          <td className={c}><b>NOTA FISCAL Nº:</b> {n.numero}{n.serie ? `-${n.serie}` : ''}</td>
          <td className={c}><b>DATA DA APRESENTAÇÃO DA NF:</b> {formatarData(n.apresentacao)}</td>
          <td colSpan={2} className={c}><b>VALOR BRUTO DEVIDO:</b> {brl(n.valor)}</td>
        </tr>
        <tr><td colSpan={2} className={c}><b>MÊS DE REFERÊNCIA:</b> {d.meses ?? ''}</td><td colSpan={2} className={c}><b>VALOR BRUTO FATURADO:</b> {brl(n.valor)}</td></tr>
      </tbody>
    </table>
    <table className="w-full table-fixed border-collapse text-[10.5px] leading-snug">
      <colgroup><col style={{ width: '7%' }} /><col style={{ width: '79%' }} /><col style={{ width: '7%' }} /><col style={{ width: '7%' }} /></colgroup>
      <thead className="table-header-group"><tr className="bg-sky-100 font-bold">
        <th className={`${c} text-center`}>ORD.</th><th className={`${c} text-center`}>ITENS</th><th className={`${c} text-center`}>SIM</th><th className={`${c} text-center`}>NÃO</th>
      </tr></thead>
      <tbody>
        {(d.itens as D[]).map((i, k) => (
          <tr key={k} className="break-inside-avoid">
            <td className={`${c} text-center`}>{k + 1}</td><td className={c}>{i.descricao}</td>
            <td className={`${c} text-center font-bold`}>{marca(i.marca, 'SIM')}</td><td className={`${c} text-center font-bold`}>{marca(i.marca, 'NAO')}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <table className="mt-4 w-full table-fixed break-inside-avoid border-collapse text-[10.5px] leading-snug">
      <colgroup><col style={{ width: '60%' }} /><col style={{ width: '40%' }} /></colgroup>
      <tbody>
        <tr><td colSpan={2} className={c}><b>OBSERVAÇÕES: Declaro que ({d.nota_pendente ? ' ' : 'X'}) não existe ({d.nota_pendente ? 'X' : ' '}) existe posterior nota fiscal pendente de faturamento ou entrega relacionada ao mês de referência.</b></td></tr>
        <tr>
          <td className={c}><b>{(PAPEL_CHECKLIST[r?.papel] ?? 'FISCAL DO CONTRATO')}:</b> {r?.nome ?? ''}</td>
          <td className={c}><b>MATRÍCULA:</b> {r?.matricula ?? ''}</td>
        </tr>
        <tr><td className={`${c} h-10`}><b>ASSINATURA {r?.papel === 'GESTOR' ? 'DO GESTOR' : r?.papel === 'SUPLENTE' ? 'DO SUPLENTE' : 'DO FISCAL'}:</b></td><td className={c}><b>DATA:</b></td></tr>
      </tbody>
    </table>
  </>;
}

const PAPEL_CHECKLIST: Record<string, string> = { FISCAL: 'FISCAL DO CONTRATO', GESTOR: 'GESTOR DO CONTRATO', SUPLENTE: 'SUPLENTE DE FISCAL DO CONTRATO' };

function ChecklistNota({ d }: { d: D }) {
  const n = d.nota; const f = d.fornecedor;
  return <>
    <Secao titulo="Dados da nota fiscal">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <p><b>Nota fiscal:</b> {n.numero}{n.serie ? `-${n.serie}` : ''}</p><p><b>Emissão:</b> {formatarData(n.data_emissao)}</p>
        <p><b>Valor:</b> {brl(n.valor)}</p><p><b>Referência:</b> {n.meses || '—'}{n.periodo_inicio ? ` (${formatarData(n.periodo_inicio)} a ${formatarData(n.periodo_fim)})` : ''}</p>
        <p className="col-span-2"><b>Fornecedor:</b> {f.nome} ({f.tipo === 'PF' ? formatarCpf(f.documento) : formatarCnpj(f.documento)})</p>
        <p><b>Contrato:</b> {d.contrato.numero} · vigência {formatarData(d.contrato.inicio)} a {formatarData(d.contrato.fim)}</p>
        <p><b>Empenho:</b> {d.empenho.numero}/{d.empenho.ano}</p>
        <p className="col-span-2"><b>Dotação:</b> {d.empenho.classificacao}</p>
        <p><b>Processo:</b> {n.processo ?? '—'}</p><p><b>Unidades atendidas:</b> {(d.unidades as string[]).join(', ') || '—'}</p>
        <p className="col-span-2"><b>Objeto:</b> {d.contrato.objeto}</p>
      </div>
    </Secao>
    <Secao titulo="Conferências do sistema">
      <Tabela colunas={[['Item'], ['Situação']]} linhas={(d.verificacoes as D[]).map((v) => [v.item,
        <span className={v.ok ? 'font-semibold text-emerald-800' : 'font-semibold text-red-800'}>{v.ok ? '✔ Conforme' : '✘ Pendente'}{v.detalhe ? <span className="block font-normal text-slate-700">{v.detalhe}</span> : null}</span>])} />
    </Secao>
    <Secao titulo="Conferência documental">
      <Tabela colunas={[['Item'], ['Sim'], ['Não'], ['Observação']]} linhas={(d.itens_manuais as string[]).map((i) => [i, '( )', '( )', ''])} />
    </Secao>
    <Secao titulo="Responsáveis">
      <Tabela colunas={[['Função'], ['Servidor'], ['Matrícula']]} linhas={(d.responsaveis as D[]).map((r) => [PAPEIS[r.papel], r.nome, r.matricula])} />
      <p className="text-[11px]"><b>Atesto:</b> {d.atesto ? `${d.atesto.nome} (${PAPEIS[d.atesto.papel] ?? d.atesto.papel}) em ${formatarDataHora(d.atesto.em)}` : 'pendente'}</p>
    </Secao>
    <Assinaturas nomes={['Responsável pela conferência', 'Gestor/Fiscal do contrato']} />
  </>;
}

const PAPEL_NF: Record<string, string> = { GESTOR: 'Gestor(a) do contrato', FISCAL: 'Fiscal do contrato', SUPLENTE: 'Suplente (atuando em substituição)', ADMINISTRADOR: 'Administrador(a) autorizado(a)' };

/** Notificação formal à empresa contratada (estrutura oficial, com campos de assinatura e de ciência) */
function NotificacaoFormal({ d }: { d: D }) {
  const f = d.fornecedor as D, c = d.contrato as D, e = d.emissor as D;
  const bloco = (n: number, titulo: string, texto: ReactNode) => (
    <section className="mb-3"><h2 className="mb-1 text-[11.5px] font-bold uppercase">{n}. {titulo}</h2><div className="whitespace-pre-line text-justify text-[11.5px] leading-relaxed">{texto}</div></section>
  );
  const anexos = (d.anexos as string[] | undefined) ?? [];
  return <>
    {d.retifica && <p className="mb-2 text-center text-[10.5px] italic">Esta versão retifica e substitui a {String(d.retifica)}.</p>}
    <div className="mb-4 grid gap-0.5 text-[11.5px]">
      <p><b>À EMPRESA:</b> {f.razao_social}{f.nome_fantasia ? ` (${f.nome_fantasia})` : ''}</p>
      <p><b>{f.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'}:</b> {f.tipo_pessoa === 'PF' ? formatarCpf(f.documento) : formatarCnpj(f.documento)}</p>
      {f.endereco && <p><b>ENDEREÇO:</b> {f.endereco}</p>}
      {(f.representante || f.email) && <p><b>CONTATO:</b> {[f.representante, f.email, f.telefone ? formatarTelefone(f.telefone) : null].filter(Boolean).join(' · ')}</p>}
      <p><b>ASSUNTO:</b> Notificação referente ao Contrato nº {c.numero}.</p>
      <p><b>PROCESSO ADMINISTRATIVO:</b> {c.processo_administrativo ?? 'não informado'}{c.numero_licitacao ? ` · ${c.modalidade} ${c.numero_licitacao}` : ''}</p>
      <p><b>OBJETO CONTRATUAL:</b> {c.objeto}</p>
      <p><b>VIGÊNCIA:</b> {formatarData(c.data_inicio)} a {formatarData(c.data_fim)} · <b>VALOR:</b> {brl(c.valor_atual)}{d.estrutura?.descricao ? <> · <b>UNIDADE RESPONSÁVEL:</b> {d.estrutura.descricao}</> : null}</p>
    </div>
    {bloco(1, 'Dos fatos', <>
      {d.data_ocorrencia && <>Em {formatarData(d.data_ocorrencia)}{d.local ? `, em ${d.local}` : ''}{d.unidade_atendida && d.unidade_atendida !== d.local ? ` (${d.unidade_atendida})` : ''}: </>}{d.fatos}
      {d.tipo_ocorrencia && <><br /><i>Classificação da ocorrência: {d.tipo_ocorrencia}.</i></>}
      {anexos.length > 0 && <><br /><i>Evidências registradas: {anexos.join('; ')}.</i></>}
    </>)}
    {bloco(2, 'Das obrigações contratuais', <>{d.obrigacoes}{d.clausula ? <><br />{d.clausula}.</> : null}</>)}
    {bloco(3, 'Da fundamentação legal', d.fundamentacao)}
    {bloco(4, 'Das providências exigidas', d.providencias)}
    {bloco(5, 'Do prazo', d.prazo_texto)}
    {bloco(6, 'Das consequências do não atendimento', d.consequencias)}
    {bloco(7, 'Da manifestação da contratada', d.manifestacao)}
    {d.observacoes && <p className="mb-3 text-[11px]"><b>Observações:</b> {d.observacoes}</p>}
    <section className="break-inside-avoid mt-6">
      <h2 className="mb-2 text-[11.5px] font-bold uppercase">8. Assinatura</h2>
      <div className="grid grid-cols-2 gap-8 text-[11px]">
        <div className="pt-12"><div className="border-t border-slate-800 pt-1 text-center">
          <p className="font-semibold">{e.nome}</p><p>{e.cargo ?? 'Cargo/função'}{e.matricula ? ` · Matrícula ${e.matricula}` : ''}</p><p>{PAPEL_NF[e.papel] ?? e.papel}</p><p className="mt-1">Data: ____/____/________</p>
        </div></div>
        <div className="pt-12"><div className="border-t border-slate-800 pt-1 text-center">
          <p className="font-semibold">Ciência da contratada</p><p>Representante: ____________________________</p><p>Documento: ______________ Data: ____/____/______</p>
        </div></div>
      </div>
    </section>
  </>;
}

/** O documento como sai no papel (usado na página de impressão e na geração do PDF) */
export function FolhaImpressao({ doc }: { doc: DocumentoEmitido }) {
  const d = doc.dados as D;
  if (doc.tipo === 'EXTRATO_NOTAS' || doc.tipo === 'EXTRATO_UNIDADES' || doc.tipo === 'EXTRATO_RATEIO') return <ImprimirExtratoNotas doc={doc} />;
  const paisagem = doc.tipo === 'CONSOLIDADO_MENSAL';
  const titulo = doc.tipo === 'CONSOLIDADO_MENSAL' || doc.tipo === 'CHECKLIST_NOTA' ? String(d.titulo) : doc.tipo === 'EXTRATO_CONTRATO' ? `EXTRATO DO CONTRATO Nº ${d.contrato.numero}` : doc.tipo === 'EXTRATO_EMPENHO' ? `EXTRATO DO EMPENHO Nº ${d.empenho.numero}/${d.empenho.ano}` : doc.titulo.toUpperCase();
  return (
      <article className="folha mx-auto bg-white px-[14mm] py-[12mm] text-slate-900 shadow-lg print:shadow-none" style={paisagem ? { width: '297mm', minHeight: '210mm' } : { width: '210mm', minHeight: '297mm' }}>
        <header className="mb-4 flex items-center gap-4 border-b-2 border-slate-800 pb-3">
          <ImagemPrivada caminho={d.orgao?.logo_path} alt="Brasão" className="h-16 w-16 object-contain" alternativa={<span className="h-16 w-16" />} />
          <div className="flex-1 text-center">
            {((d.orgao?.cabecalho as string[]) ?? [d.orgao?.nome_oficial]).map((l, i) => <p key={i} className={i === 0 ? 'text-[13px] font-bold' : 'text-[11px] font-semibold'}>{l}</p>)}
          </div>
          <span className="h-16 w-16" />
        </header>
        {d.modelo !== 'SERVICOS_CONTINUADOS' && <h1 className="mb-4 text-center text-[14px] font-bold tracking-wide">{titulo}</h1>}
        {doc.tipo === 'EXTRATO_CONTRATO' && <ExtratoContrato d={d} />}
        {doc.tipo === 'EXTRATO_EMPENHO' && <ExtratoEmpenho d={d} />}
        {doc.tipo === 'CONSOLIDADO_MENSAL' && <ConsolidadoMensal d={d} />}
        {doc.tipo === 'CHECKLIST_NOTA' && (d.modelo === 'SERVICOS_CONTINUADOS' ? <ChecklistServicos d={d} /> : <ChecklistNota d={d} />)}
        {doc.tipo === 'ATESTO' && <p className="whitespace-pre-line text-[12px] leading-relaxed">{d.texto}</p>}
        {doc.tipo === 'NOTIFICACAO_FORMAL' && <NotificacaoFormal d={d} />}
        <footer className="mt-6 border-t border-slate-300 pt-2 text-[9.5px] text-slate-600">
          {d.orgao?.rodape && <p>{d.orgao.rodape}</p>}
          {!paisagem && d.orgao?.endereco && <p>{d.orgao.endereco}</p>}
          <p>Emitido por {d.emitido_por ?? '—'} em {formatarDataHora(doc.emitido_em)} · MEASURE · Documento nº {doc.id.slice(0, 8).toUpperCase()}</p>
        </footer>
      </article>
  );
}

export function Imprimir() {
  const { id } = useParams();
  const navegar = useNavigate();
  const q = useQuery({ queryKey: ['emitido', id], queryFn: () => obterEmitido(id!), enabled: !!id });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <div className="p-6"><CaixaErro mensagem={traduzirErro(q.error).mensagem} /></div>;
  const doc = q.data!;
  const barra = (largura: string) => (
    <div className={`nao-imprimir mx-auto mb-4 flex ${largura} flex-wrap items-center justify-between gap-2 px-4`}>
      <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} onClick={() => navegar(-1)}>Voltar</Botao>
      <p className="text-xs text-slate-600">Documento emitido em {formatarDataHora(doc.emitido_em)}: os dados são os daquele momento.</p>
      <Botao icone={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / salvar PDF</Botao>
    </div>
  );
  if (doc.tipo === 'EXTRATO_NOTAS' || doc.tipo === 'EXTRATO_UNIDADES' || doc.tipo === 'EXTRATO_RATEIO') {
    return <div className="min-h-dvh bg-slate-200 py-6 print:bg-white print:py-0">{barra('max-w-[297mm]')}<FolhaImpressao doc={doc} /></div>;
  }
  const paisagem = doc.tipo === 'CONSOLIDADO_MENSAL';
  return (
    <div className="min-h-dvh bg-slate-200 py-6 print:bg-white print:py-0">
      {paisagem && <style>{'@page { size: A4 landscape; margin: 10mm 10mm 12mm; } @media print { .folha { padding: 0 !important; } }'}</style>}
      {barra(paisagem ? 'max-w-[297mm]' : 'max-w-[210mm]')}
      <FolhaImpressao doc={doc} />
    </div>
  );
}
