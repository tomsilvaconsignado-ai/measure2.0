// Diagramas e gráficos da capacitação. Série única na cor da marca (#2f66bd, já validada);
// estados de risco sempre com ícone + rótulo, nunca só cor; todo gráfico tem versão em tabela.
import { AlertTriangle, ArrowDown, ArrowRight, Ban, CheckCircle2, ClipboardCheck, Eye, Gavel, Scale, ShieldAlert, ShieldCheck, UserCog, UserRound, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/basicos';

const COR = '#2f66bd';

function Quadro({ titulo, children, tabela }: { titulo: string; children: ReactNode; tabela?: ReactNode }) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <figure className="my-5 rounded-xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{titulo}</span>
        {tabela && <button className="text-xs text-marca-700 hover:underline" onClick={() => setVerTabela((v) => !v)}>{verTabela ? 'Ver gráfico' : 'Ver como tabela'}</button>}
      </figcaption>
      {verTabela && tabela ? tabela : children}
    </figure>
  );
}

const TabelaSimples = ({ cab, linhas }: { cab: string[]; linhas: ReactNode[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left text-xs text-slate-500">{cab.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{c}</th>)}</tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i} className="border-b border-slate-100">{l.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top">{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------- fluxos

export function Fluxo({ titulo, etapas }: { titulo: string; etapas: Array<{ titulo: string; detalhe?: string; voce?: boolean }> }) {
  return (
    <Quadro titulo={titulo}>
      <ol className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-stretch">
        {etapas.map((e, i) => (
          <li key={e.titulo} className="flex flex-col items-center gap-2 md:flex-row">
            <div className={cx('w-full rounded-lg border px-3 py-2 md:w-40', e.voce ? 'border-marca-500 bg-marca-50' : 'border-slate-200 bg-slate-50')}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><span className="numero">{i + 1}</span>{e.voce && <span className="rounded bg-marca-700 px-1.5 text-[10px] font-semibold text-white">VOCÊ</span>}</p>
              <p className="text-sm font-medium text-slate-900">{e.titulo}</p>
              {e.detalhe && <p className="text-xs text-slate-600">{e.detalhe}</p>}
            </div>
            {i < etapas.length - 1 && <><ArrowDown className="size-4 shrink-0 text-slate-400 md:hidden" aria-hidden /><ArrowRight className="hidden size-4 shrink-0 text-slate-400 md:block" aria-hidden /></>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-500">Etapas marcadas com <b>VOCÊ</b> são aquelas em que gestor, fiscal ou suplente atuam diretamente.</p>
    </Quadro>
  );
}

export function FluxoDFD() {
  return (
    <Quadro titulo="Quem lança o DFD de execução na SMS (Memorando 51.800/2026)">
      <div className="flex flex-col items-center gap-2 text-sm">
        <div className="rounded-lg border border-marca-300 bg-marca-50 px-4 py-2 text-center font-medium text-marca-900">Existe necessidade de contratar?</div>
        <ArrowDown className="size-4 text-slate-400" aria-hidden />
        <div className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-center font-medium">O processo licitatório já está concluído<br /><span className="text-xs font-normal text-slate-600">(Ata de Registro de Preços ou contrato vigente)?</span></div>
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">NÃO — vai iniciar processo</span>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="mb-1 font-semibold text-slate-900">Cada diretoria lança o DFD:</p>
              <ul className="space-y-0.5 text-slate-700">
                <li><b>DVAS</b> — caixa SMS-DVAS-AT</li><li><b>DRMAAC</b> — caixa SMS-DRMAAC</li><li><b>DADM</b> — caixa SMS-DADM-CSA-GA</li>
                <li><b>Almoxarifado</b> — caixa SMS-DADM-CAP-GA-SA</li><li><b>GS, NUJUR, CI e DF</b> — caixa SMS-DF-CP-DFD</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">SIM — já há ata ou contrato</span>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-900">Setor de planejamento lança o DFD</p>
              <p className="text-slate-700">Caixa SMS-DF-CP-DFD (Assessoria de Planejamento), também quando houver nova necessidade da demanda.</p>
            </div>
          </div>
        </div>
      </div>
    </Quadro>
  );
}

// ---------------------------------------------------------------- papéis

export function Papeis() {
  const papeis = [
    { icone: <UserCog className="size-5" />, nome: 'Gestor', foco: 'Cuida do contrato como um todo (lado administrativo)',
      itens: ['Vigência e prazos (vencimento, prorrogação)', 'Saldo do contrato e dos empenhos', 'Aditivos, apostilas e reajustes', 'Pedidos e reclamações da empresa (resposta em até 1 mês)', 'Encaminhar sanções quando a empresa falha'] },
    { icone: <Eye className="size-5" />, nome: 'Fiscal', foco: 'É os olhos da Administração na execução (dia a dia)',
      itens: ['Confere se o que foi contratado foi entregue', 'Anota todas as ocorrências', 'Manda corrigir faltas e defeitos', 'Avisa a chefia quando o problema é maior', 'Recebe provisoriamente e atesta a nota'] },
    { icone: <UserRound className="size-5" />, nome: 'Suplente', foco: 'Substitui o fiscal nas ausências',
      itens: ['Assume férias, licenças e afastamentos', 'Enquanto atua, tem as mesmas responsabilidades do fiscal', 'Deve conhecer o contrato antes de precisar assumir', 'Registra o que fez no período'] },
  ];
  return (
    <Quadro titulo="Quem é quem no contrato" tabela={<TabelaSimples cab={['Papel', 'Foco', 'Principais tarefas']} linhas={papeis.map((p) => [p.nome, p.foco, p.itens.join('; ')])} />}>
      <div className="grid gap-3 md:grid-cols-3">
        {papeis.map((p) => (
          <div key={p.nome} className="rounded-xl border border-slate-200 p-3">
            <p className="mb-1 flex items-center gap-2 font-semibold text-marca-800">{p.icone}{p.nome}</p>
            <p className="mb-2 text-xs text-slate-600">{p.foco}</p>
            <ul className="space-y-1 text-sm text-slate-800">{p.itens.map((i) => <li key={i} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-marca-600" aria-hidden />{i}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">As atribuições exatas estão na portaria de designação e no regulamento municipal. Fiscal e suplente: art. 117 da Lei 14.133/2021.</p>
    </Quadro>
  );
}

// ---------------------------------------------------------------- linhas de defesa (art. 169)

export function LinhasDefesa() {
  const linhas = [
    { n: '1ª linha', quem: 'Servidores, fiscais, gestores, agentes de contratação e autoridades do órgão', papel: 'Estão perto da execução: evitam o erro antes que aconteça', largura: '100%', voce: true },
    { n: '2ª linha', quem: 'Assessoria jurídica (NUJUR/PGM) e controle interno do órgão', papel: 'Orientam e conferem; apoiam o fiscal (art. 117, § 3º)', largura: '82%' },
    { n: '3ª linha', quem: 'Controladoria-Geral do Município e Tribunal de Contas', papel: 'Auditam depois; apuram responsabilidades', largura: '64%' },
  ];
  return (
    <Quadro titulo="As três linhas de defesa das contratações (art. 169)" tabela={<TabelaSimples cab={['Linha', 'Quem', 'Papel']} linhas={linhas.map((l) => [l.n, l.quem, l.papel])} />}>
      <div className="flex flex-col items-center gap-2">
        {linhas.map((l) => (
          <div key={l.n} className={cx('rounded-xl border px-4 py-3 text-center', l.voce ? 'border-marca-500 bg-marca-50' : 'border-slate-200 bg-slate-50')} style={{ width: l.largura }}>
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck className="size-4 text-marca-700" aria-hidden />{l.n}{l.voce && <span className="rounded bg-marca-700 px-1.5 text-[10px] text-white">VOCÊ</span>}</p>
            <p className="text-xs text-slate-700">{l.quem}</p>
            <p className="text-xs text-slate-500">{l.papel}</p>
          </div>
        ))}
      </div>
    </Quadro>
  );
}

// ---------------------------------------------------------------- fila de pagamentos (art. 141)

export function FilaPagamentos() {
  const notas = ['NF 101 · 02/03', 'NF 205 · 05/03', 'NF 318 · 09/03', 'NF 422 · 12/03'];
  return (
    <Quadro titulo="A fila de pagamentos (ordem cronológica — art. 141)">
      <p className="mb-3 text-xs text-slate-600">Uma fila separada para cada fonte de recurso e cada tipo de contrato (bens, locações, serviços, obras).</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-semibold text-white">CAIXA</span>
        {notas.map((n, i) => (
          <span key={n} className="flex items-center gap-2">
            <ArrowRight className="size-3.5 rotate-180 text-slate-400" aria-hidden />
            <span className={cx('rounded-lg border px-2 py-1 text-xs', i === 0 ? 'border-marca-500 bg-marca-50 font-semibold text-marca-900' : 'border-slate-200 bg-white text-slate-700')}>{i + 1}º {n}</span>
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p><b>Proibido furar a fila sem justificativa.</b> A NF 422 não pode ser paga antes da NF 101 por pedido da empresa ou de alguém. Fora das exceções do § 1º, gera apuração de responsabilidade (art. 141, § 2º) e pode ser crime (art. 337-H: 4 a 8 anos de reclusão).</p>
      </div>
    </Quadro>
  );
}

// ---------------------------------------------------------------- limites de alteração (art. 125)

export function LimitesAlteracao() {
  const max = 150;
  const barras = [
    { rotulo: 'Valor inicial atualizado', valor: 100, detalhe: 'base' },
    { rotulo: 'Obras, serviços e compras', valor: 125, detalhe: 'até +25% (ou −25%)' },
    { rotulo: 'Reforma de edifício ou equipamento', valor: 150, detalhe: 'acréscimo até +50%' },
  ];
  return (
    <Quadro titulo="Até onde o contrato pode crescer por decisão da Administração (art. 125)"
      tabela={<TabelaSimples cab={['Situação', 'Limite']} linhas={barras.map((b) => [b.rotulo, b.detalhe])} />}>
      <div className="flex flex-col gap-3">
        {barras.map((b) => (
          <div key={b.rotulo} title={`${b.rotulo}: ${b.detalhe}`}>
            <div className="mb-1 flex justify-between text-xs"><span className="text-slate-700">{b.rotulo}</span><span className="numero font-medium text-slate-900">{b.valor === 100 ? '100%' : b.detalhe}</span></div>
            <div className="relative h-5 rounded bg-slate-100">
              <div className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${(Math.min(b.valor, 100) / max) * 100}%`, background: COR, opacity: 0.35 }} />
              {b.valor > 100 && <div className="absolute inset-y-0 rounded-r" style={{ left: `${(100 / max) * 100}%`, width: `calc(${((b.valor - 100) / max) * 100}% - 2px)`, marginLeft: 2, background: COR }} />}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Parte clara: valor original. Parte escura: o máximo que a empresa é obrigada a aceitar. Passou disso, não pode por alteração unilateral — e nenhuma alteração pode transformar o objeto (art. 126).</p>
    </Quadro>
  );
}

// ---------------------------------------------------------------- sanções (art. 156)

export function EscadaSancoes() {
  const degraus = [
    { nome: 'Advertência', detalhe: 'Só para inexecução parcial, quando não couber pena mais grave', alcance: '—' },
    { nome: 'Multa', detalhe: 'De 0,5% a 30% do valor do contrato (pode somar com as outras)', alcance: 'Valor' },
    { nome: 'Impedimento', detalhe: 'Não licita nem contrata com o município', alcance: 'Até 3 anos' },
    { nome: 'Inidoneidade', detalhe: 'Não licita nem contrata com nenhum ente do país', alcance: '3 a 6 anos' },
  ];
  return (
    <Quadro titulo="Escada de sanções à empresa (art. 156) — da mais leve à mais grave"
      tabela={<TabelaSimples cab={['Sanção', 'O que significa', 'Duração/alcance']} linhas={degraus.map((d) => [d.nome, d.detalhe, d.alcance])} />}>
      <div className="flex items-end gap-1.5 sm:gap-3">
        {degraus.map((d, i) => (
          <div key={d.nome} className="flex flex-1 flex-col items-center" title={`${d.nome}: ${d.detalhe}`}>
            <p className="mb-1 text-center text-[11px] font-medium text-slate-700 sm:text-xs">{d.alcance}</p>
            <div className="w-full rounded-t" style={{ height: 30 + i * 30, background: COR, opacity: 0.45 + i * 0.18 }} />
            <p className="mt-1 text-center text-xs font-semibold text-slate-900">{d.nome}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Toda sanção exige processo com direito de defesa (arts. 157 e 158). Sem os registros do fiscal, não há prova — e a empresa fica sem punição.</p>
    </Quadro>
  );
}

// ---------------------------------------------------------------- penas dos crimes (Código Penal, arts. 337-E a 337-M)

export function GraficoPenas() {
  const crimes = [
    { art: '337-E', nome: 'Contratação direta ilegal', min: 4, max: 8, tipo: 'reclusão' },
    { art: '337-F', nome: 'Frustrar o caráter competitivo', min: 4, max: 8, tipo: 'reclusão' },
    { art: '337-H', nome: 'Modificação ou pagamento irregular (inclui furar a fila)', min: 4, max: 8, tipo: 'reclusão' },
    { art: '337-L', nome: 'Fraude em licitação ou contrato', min: 4, max: 8, tipo: 'reclusão' },
    { art: '337-M, § 1º', nome: 'Contratar empresa inidônea', min: 3, max: 6, tipo: 'reclusão' },
    { art: '337-G', nome: 'Patrocínio de contratação indevida', min: 0.5, max: 3, tipo: 'reclusão' },
    { art: '337-I', nome: 'Perturbação de processo licitatório', min: 0.5, max: 3, tipo: 'detenção' },
  ];
  const escala = 8;
  const anos = (v: number) => (v < 1 ? '6 meses' : `${v} anos`);
  return (
    <Quadro titulo="Crimes em licitações e contratos: penas de prisão (anos)"
      tabela={<TabelaSimples cab={['Artigo', 'Crime', 'Pena']} linhas={crimes.map((c) => [c.art, c.nome, `${c.tipo}, de ${anos(c.min)} a ${anos(c.max)}, e multa`])} />}>
      <div className="flex flex-col gap-2.5">
        {crimes.map((c) => (
          <div key={c.art} className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[15rem_1fr] sm:items-center sm:gap-3" title={`Art. ${c.art} — ${c.nome}: ${c.tipo} de ${anos(c.min)} a ${anos(c.max)}`}>
            <p className="text-xs text-slate-700"><b className="numero">Art. {c.art}</b> · {c.nome}</p>
            <div className="flex items-center gap-2">
              <div className="relative h-3.5 flex-1 rounded bg-slate-100">
                <div className="absolute inset-y-0 rounded" style={{ left: `${(c.min / escala) * 100}%`, width: `${((c.max - c.min) / escala) * 100}%`, background: COR }} />
              </div>
              <span className="numero w-24 shrink-0 text-right text-xs text-slate-700">{c.min < 1 ? '6m' : c.min}–{c.max} anos</span>
            </div>
          </div>
        ))}
        <div className="hidden grid-cols-[15rem_1fr] gap-3 sm:grid">
          <span />
          <div className="mr-26 flex justify-between text-[10px] text-slate-500">{[0, 2, 4, 6, 8].map((n) => <span key={n} className="numero">{n}</span>)}</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Além da prisão, há multa de no mínimo 2% do valor do contrato (art. 337-P). Esses crimes estão no Código Penal (inseridos pela Lei 14.133/2021, art. 178).</p>
    </Quadro>
  );
}

// ---------------------------------------------------------------- termômetro de responsabilidade (LINDB, art. 28)

export function TermometroResponsabilidade() {
  const niveis = [
    { icone: <ClipboardCheck className="size-5" />, nome: 'Erro formal ou de boa-fé', exemplo: 'Esqueceu um campo, digitou uma data errada, corrigiu ao perceber.', resultado: 'Corrige-se e vira capacitação (art. 169, § 3º, I).', tom: 'border-slate-200 bg-slate-50', rotulo: 'Corrigir' },
    { icone: <AlertTriangle className="size-5" />, nome: 'Erro grosseiro', exemplo: 'Atestou sem conferir, ignorou alertas repetidos, deixou de cobrar documentos obrigatórios.', resultado: 'Responde pessoalmente (LINDB, art. 28) e pode ressarcir o dano.', tom: 'border-amber-300 bg-amber-50', rotulo: 'Responsabilidade pessoal' },
    { icone: <Gavel className="size-5" />, nome: 'Dolo (má-fé)', exemplo: 'Atestou sabendo que não foi entregue, favoreceu a empresa, recebeu vantagem.', resultado: 'Responde pessoalmente, ressarce, perde a proteção do art. 10 e pode responder por crime.', tom: 'border-red-300 bg-red-50', rotulo: 'Grave' },
  ];
  return (
    <Quadro titulo="Termômetro da responsabilidade do servidor"
      tabela={<TabelaSimples cab={['Situação', 'Exemplo', 'Consequência']} linhas={niveis.map((n) => [n.nome, n.exemplo, n.resultado])} />}>
      <div className="grid gap-3 md:grid-cols-3">
        {niveis.map((n, i) => (
          <div key={n.nome} className={cx('rounded-xl border p-3', n.tom)}>
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">{n.icone}{n.nome}</p>
            <p className="mb-2 inline-block rounded bg-white/70 px-1.5 text-[11px] font-semibold text-slate-700">Nível {i + 1} · {n.rotulo}</p>
            <p className="text-xs text-slate-700"><b>Exemplo:</b> {n.exemplo}</p>
            <p className="mt-1 text-xs text-slate-900"><b>Consequência:</b> {n.resultado}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600"><Scale className="mt-0.5 size-3.5 shrink-0" aria-hidden />O que protege você: registrar tudo, consultar formalmente o jurídico e o controle interno, seguir o parecer e o procedimento (arts. 10 e 117, § 3º; LINDB, art. 30).</p>
    </Quadro>
  );
}

// ---------------------------------------------------------------- risco trabalhista (arts. 50 e 121)

export function CadeiaTrabalhista() {
  const passos = [
    { icone: <Users className="size-4" />, texto: 'Empresa de limpeza/vigilância deixa de pagar salário, FGTS ou INSS dos empregados' },
    { icone: <Eye className="size-4" />, texto: 'Fiscal não pediu nem conferiu ponto, contracheques e guias (art. 50)' },
    { icone: <ShieldAlert className="size-4" />, texto: 'Empregados cobram na Justiça; fica comprovada a falha na fiscalização' },
    { icone: <Ban className="size-4" />, texto: 'Município responde pelos encargos previdenciários (solidária) e trabalhistas (subsidiária) — art. 121, § 2º' },
  ];
  return (
    <Quadro titulo="Como uma falha na fiscalização vira prejuízo para o município">
      <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
        {passos.map((p, i) => (
          <li key={i} className="flex flex-col items-center gap-2 md:flex-1 md:flex-row">
            <div className={cx('flex h-full w-full items-start gap-2 rounded-lg border p-3 text-sm', i === passos.length - 1 ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50 text-slate-800')}>
              <span className="mt-0.5 shrink-0">{p.icone}</span>{p.texto}
            </div>
            {i < passos.length - 1 && <><ArrowDown className="size-4 shrink-0 text-slate-400 md:hidden" aria-hidden /><ArrowRight className="hidden size-4 shrink-0 text-slate-400 md:block" aria-hidden /></>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-600"><b>Como evitar:</b> todo mês, peça e confira os documentos do art. 50; o contrato pode prever conta vinculada, pagamento condicionado à quitação e outras garantias (art. 121, § 3º).</p>
    </Quadro>
  );
}

// ---------------------------------------------------------------- prazos importantes

export function LinhaPrazos() {
  const prazos = [
    { prazo: 'Em tempo hábil', o: 'Fiscal avisa a chefia quando o problema passa da sua competência', ref: 'Art. 117, § 2º' },
    { prazo: 'Até 1 mês', o: 'Formalizar o aditivo quando a execução foi antecipada por urgência justificada', ref: 'Art. 132' },
    { prazo: '1 mês (+1)', o: 'Decidir pedidos e reclamações da empresa após a instrução', ref: 'Art. 123' },
    { prazo: '15 dias úteis', o: 'Defesa da empresa antes de multa; defesa no processo de impedimento/inidoneidade', ref: 'Arts. 157 e 158' },
    { prazo: '15 dias úteis', o: 'Recurso da empresa contra advertência, multa ou impedimento', ref: 'Art. 166' },
    { prazo: 'Mensal', o: 'Publicar a ordem cronológica de pagamentos e as justificativas de alteração', ref: 'Art. 141, § 3º' },
    { prazo: '20 / 10 dias úteis', o: 'Divulgar contrato e aditivos no PNCP (licitação / contratação direta) — condição de eficácia', ref: 'Art. 94' },
  ];
  return (
    <Quadro titulo="Prazos que gestor e fiscal precisam conhecer" tabela={<TabelaSimples cab={['Prazo', 'O quê', 'Lei 14.133']} linhas={prazos.map((p) => [p.prazo, p.o, p.ref])} />}>
      <ol className="relative ml-2 border-l-2 border-marca-200 pl-5">
        {prazos.map((p) => (
          <li key={p.o} className="relative mb-3 last:mb-0">
            <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white" style={{ background: COR }} aria-hidden />
            <p className="text-sm"><b className="numero text-marca-800">{p.prazo}</b> — {p.o}</p>
            <p className="text-xs text-slate-500">{p.ref}</p>
          </li>
        ))}
      </ol>
    </Quadro>
  );
}
