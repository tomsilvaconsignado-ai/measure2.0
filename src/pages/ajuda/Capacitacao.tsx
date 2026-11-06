// Capacitação e consulta para gestores, fiscais e suplentes de contrato: trilha de lições em linguagem
// simples, gráficos, consulta rápida à lei, glossário, teste de conhecimentos e normas de Aracaju.
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ExternalLink, GraduationCap, Info, Lightbulb, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, Cartao, Vazio, cx } from '@/components/ui/basicos';
import { ARTIGOS, artigo, GLOSSARIO, NORMAS_ARACAJU, QUIZ } from './conteudo';
import { CadeiaTrabalhista, EscadaSancoes, FilaPagamentos, Fluxo, FluxoDFD, GraficoPenas, LimitesAlteracao, LinhaPrazos, LinhasDefesa, Papeis, TermometroResponsabilidade } from './graficos';

// ---------------------------------------------------------------- blocos de texto

const Simples = ({ children }: { children: ReactNode }) => (
  <div className="my-4 rounded-xl border border-marca-200 bg-marca-50 p-4 text-[15px] leading-relaxed text-marca-950">
    <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-marca-700"><Lightbulb className="size-4" aria-hidden />Em palavras simples</p>
    {children}
  </div>
);

const Risco = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div className="my-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
    <p className="mb-1 flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" aria-hidden />Risco: {titulo}</p>
    {children}
  </div>
);

const Atencao = ({ children }: { children: ReactNode }) => (
  <div className="my-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /><div><b>Atenção: </b>{children}</div>
  </div>
);

const NoMeasure = ({ children }: { children: ReactNode }) => (
  <div className="my-4 flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
    <Info className="mt-0.5 size-4 shrink-0 text-marca-700" aria-hidden /><div><b>No MEASURE: </b>{children}</div>
  </div>
);

function Lei({ id }: { id: string }) {
  const a = artigo(id);
  const [aberto, setAberto] = useState(false);
  return (
    <blockquote className="my-3 rounded-xl border-l-4 border-marca-500 bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold text-marca-700">{a.lei} · {a.ref} — {a.titulo}</p>
      <p className="mt-1 text-sm text-slate-800">{a.simples}</p>
      <button className="mt-2 flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <ChevronDown className={cx('size-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden />{aberto ? 'Ocultar o texto da lei' : 'Ler o texto da lei'}
      </button>
      {aberto && <p className="mt-2 border-t border-slate-100 pt-2 text-[13px] italic leading-relaxed text-slate-700">{a.texto}</p>}
    </blockquote>
  );
}

function FazNaoFaz({ faz, naoFaz }: { faz: string[]; naoFaz: string[] }) {
  return (
    <div className="my-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 className="size-4" aria-hidden />Faça</p>
        <ul className="space-y-1.5 text-sm text-emerald-950">{faz.map((f) => <li key={f}>• {f}</li>)}</ul>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900"><XCircle className="size-4" aria-hidden />Não faça</p>
        <ul className="space-y-1.5 text-sm text-red-950">{naoFaz.map((f) => <li key={f}>• {f}</li>)}</ul>
      </div>
    </div>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="my-3 text-[15px] leading-relaxed text-slate-800">{children}</p>;
const H = ({ children }: { children: ReactNode }) => <h3 className="mb-1 mt-6 text-base font-semibold text-slate-900">{children}</h3>;

// ---------------------------------------------------------------- lições

interface Licao { id: string; titulo: string; resumo: string; minutos: number; conteudo: ReactNode }

const LICOES: Licao[] = [
  {
    id: 'porque', titulo: 'Por que fiscalizar importa', minutos: 5, resumo: 'O dinheiro é público e você é os olhos da Administração.',
    conteudo: <>
      <Simples>Quando o município contrata uma empresa, ele paga com o dinheiro dos impostos da população. O contrato é uma promessa: a empresa promete entregar algo e o município promete pagar. <b>Quem confere se a promessa foi cumprida é você</b> — gestor, fiscal ou suplente. Se ninguém confere, o município pode pagar por algo que não recebeu, e a população fica sem o serviço.</Simples>
      <Fluxo titulo="O caminho do dinheiro público" etapas={[
        { titulo: 'Impostos da população', detalhe: 'Receita do município' },
        { titulo: 'Orçamento (LOA)', detalhe: 'Dotações de cada órgão' },
        { titulo: 'Contrato', detalhe: 'Empresa promete entregar' },
        { titulo: 'Execução fiscalizada', detalhe: 'Conferir antes de pagar', voce: true },
        { titulo: 'Pagamento', detalhe: 'Só do que foi entregue' },
        { titulo: 'Serviço à população', detalhe: 'UBS limpa, equipamento funcionando…' },
      ]} />
      <H>O que pode dar errado sem fiscalização</H>
      <P>A lei chama de <b>superfaturamento</b> o dano ao dinheiro público na execução. Os exemplos mais comuns acontecem exatamente onde o fiscal atua:</P>
      <Lei id="a6-lvii" />
      <Risco titulo="pagar pelo que não foi entregue">Atestar uma nota com quantidade maior do que a entregue é o exemplo da letra "a" do superfaturamento e pode configurar crime de fraude (Código Penal, art. 337-L: 4 a 8 anos de reclusão).</Risco>
      <NoMeasure>Só gestor, fiscal ou suplente designado no contrato consegue atestar uma nota. O sistema registra quem atestou, quando e o texto do atesto — e isso não pode ser apagado.</NoMeasure>
    </>,
  },
  {
    id: 'papeis', titulo: 'Quem é quem: gestor, fiscal e suplente', minutos: 7, resumo: 'O que cada um faz, quem pode ser designado e quando você está impedido.',
    conteudo: <>
      <Simples>Pense no contrato como uma obra numa casa. O <b>gestor</b> é quem cuida do "papel": prazos, dinheiro disponível, mudanças no combinado. O <b>fiscal</b> é quem vai ao local ver se o serviço está sendo feito direito. O <b>suplente</b> é o fiscal reserva: entra quando o titular está de férias ou afastado — e, enquanto estiver no lugar, responde como fiscal.</Simples>
      <Papeis />
      <H>Quem pode ser designado</H>
      <Lei id="a7" />
      <Lei id="a7-p1" />
      <Atencao>Se você tem parente, sócio, amigo de negócios ou qualquer vínculo com a empresa, <b>não pode fiscalizar esse contrato</b>. Avise a chefia por escrito assim que souber.</Atencao>
      <Lei id="a9-p1" />
      <H>O fiscal não está sozinho</H>
      <P>Você pode e deve pedir ajuda: o jurídico (NUJUR/PGM) e o controle interno têm o dever de tirar suas dúvidas. Perguntar por escrito é sinal de cuidado, não de fraqueza.</P>
      <NoMeasure>A designação é feita na aba <b>Responsáveis</b> do contrato. O designado passa a ver o contrato, recebe o aviso "Aguardando o seu atesto" e o nome dele aparece nos extratos e no checklist.</NoMeasure>
    </>,
  },
  {
    id: 'caminho', titulo: 'O caminho de uma contratação', minutos: 8, resumo: 'Do pedido (DFD) ao pagamento — e onde você entra.',
    conteudo: <>
      <Simples>Antes de existir um contrato, alguém precisou pedir (DFD), estudar a melhor solução (ETP), descrever o que quer (Termo de Referência), pesquisar preços, passar pelo jurídico e fazer a licitação. Depois do contrato assinado começa a parte em que você atua: acompanhar, receber, atestar e acompanhar o pagamento.</Simples>
      <Fluxo titulo="Do pedido ao encerramento" etapas={[
        { titulo: 'DFD', detalhe: 'Pedido formal da unidade' },
        { titulo: 'Estudo Técnico Preliminar', detalhe: 'Melhor solução' },
        { titulo: 'Termo de Referência', detalhe: 'O que, como medir e pagar' },
        { titulo: 'Parecer jurídico', detalhe: 'Controle de legalidade (art. 53)' },
        { titulo: 'Licitação ou contratação direta', detalhe: 'Escolha da empresa' },
        { titulo: 'Contrato + dotação', detalhe: 'De onde vem o dinheiro' },
        { titulo: 'Designação', detalhe: 'Gestor, fiscal, suplente', voce: true },
        { titulo: 'Execução e fiscalização', detalhe: 'Acompanhar e registrar', voce: true },
        { titulo: 'Recebimento e atesto', detalhe: 'Conferir antes de pagar', voce: true },
        { titulo: 'Pagamento', detalhe: 'Ordem cronológica' },
      ]} />
      <Lei id="a12-vii" />
      <FluxoDFD />
      <H>As modalidades de licitação</H>
      <Lei id="a28" />
      <H>Quando se pode contratar sem licitação</H>
      <Lei id="a75" />
      <Risco titulo="contratação direta fora da lei">Contratar sem licitação fora dos casos permitidos é crime (Código Penal, art. 337-E: 4 a 8 anos) e, havendo dolo, fraude ou erro grosseiro, o servidor responde junto com a empresa pelo prejuízo (art. 73). "Fatiar" uma compra para ficar abaixo do limite também é proibido.</Risco>
    </>,
  },
  {
    id: 'dia', titulo: 'O dia a dia do fiscal', minutos: 10, resumo: 'Acompanhar, registrar, cobrar correção, receber e atestar.',
    conteudo: <>
      <Simples>Fiscalizar é como conferir uma compra no supermercado antes de pagar: você olha a quantidade, a qualidade e se é mesmo o produto que pediu. A diferença é que, no contrato, você precisa <b>anotar tudo</b>, porque essas anotações viram prova — para cobrar a empresa e para proteger você.</Simples>
      <Fluxo titulo="O ciclo de cada mês" etapas={[
        { titulo: 'Acompanhar', detalhe: 'Ir ao local, conferir', voce: true },
        { titulo: 'Registrar', detalhe: 'Anotar ocorrências', voce: true },
        { titulo: 'Cobrar correção', detalhe: 'Pelo preposto, por escrito', voce: true },
        { titulo: 'Conferir medição', detalhe: 'Quantidade e qualidade', voce: true },
        { titulo: 'Receber provisoriamente', detalhe: 'Termo detalhado', voce: true },
        { titulo: 'Atestar a nota', detalhe: 'Só o que foi entregue', voce: true },
      ]} />
      <Lei id="a117" />
      <Lei id="a118" />
      <Lei id="a119-120" />
      <Lei id="a140" />
      <Lei id="a117-p4" />
      <H>Contratos com mão de obra exclusiva (limpeza, vigilância, recepção…)</H>
      <P>Aqui está um dos maiores riscos para o município: se a empresa não pagar os empregados e a fiscalização tiver falhado, <b>a conta pode cair no município</b>.</P>
      <CadeiaTrabalhista />
      <Lei id="a50" />
      <Lei id="a121" />
      <FazNaoFaz
        faz={['Ir ao local e conferir com os próprios olhos', 'Anotar data, fato e providência de cada ocorrência', 'Cobrar a empresa por escrito, pelo preposto', 'Pedir ajuda ao jurídico e ao controle interno quando tiver dúvida', 'Atestar apenas o que foi efetivamente entregue', 'Conferir todo mês os documentos trabalhistas (art. 50)']}
        naoFaz={['Atestar "para não atrasar o pagamento"', 'Assinar medição feita pela empresa sem conferir', 'Combinar coisas com a empresa só por conversa', 'Deixar a empresa executar serviço fora do contrato', 'Esperar o fim do contrato para relatar problemas', 'Fiscalizar contrato de empresa com quem você tem vínculo']} />
      <NoMeasure>Na nota fiscal, a aba <b>Atesto</b> traz o texto gerado pelo modelo do órgão; a aba <b>Documentos</b> permite anexar comprovantes e emitir o <b>checklist</b>, que confere vigência, empenho, saldo, referência, atesto e pagamento.</NoMeasure>
    </>,
  },
  {
    id: 'pagamento', titulo: 'Pagamento: sem antecipar e sem furar a fila', minutos: 6, resumo: 'Ordem cronológica, parcela incontroversa e pagamento antecipado.',
    conteudo: <>
      <Simples>O pagamento funciona como a fila de um banco: quem chegou primeiro é atendido primeiro, e há uma fila para cada tipo de contrato e cada fonte de recurso. Ninguém pode passar na frente "porque pediu" ou "porque é amigo". E não se paga antes de receber.</Simples>
      <FilaPagamentos />
      <Lei id="a141" />
      <Lei id="a143" />
      <Lei id="a145" />
      <Risco titulo="pagamento irregular">Pagar fora da ordem cronológica ou dar vantagem à empresa sem previsão é crime (Código Penal, art. 337-H: 4 a 8 anos de reclusão).</Risco>
      <Lei id="cp337h" />
      <NoMeasure>O pagamento só é liberado depois do atesto. Pagamento menor que o valor da nota deixa a situação como <b>Parcial</b>, e cada pagamento fica registrado com data, documento e responsável.</NoMeasure>
    </>,
  },
  {
    id: 'alteracoes', titulo: 'Mudanças no contrato: aditivo, apostila e dotação', minutos: 8, resumo: 'O que pode mudar, até quanto e como formalizar.',
    conteudo: <>
      <Simples>Mudar o contrato é como mudar o combinado de uma reforma: precisa ser por escrito, com motivo, dentro de limites e <b>antes</b> de o serviço novo ser feito. Algumas atualizações simples (reajuste já previsto, nome da empresa, empenho) não mudam o contrato e são feitas por apostila.</Simples>
      <Lei id="a124" />
      <LimitesAlteracao />
      <Lei id="a125" />
      <Lei id="a126" />
      <Lei id="a132" />
      <Lei id="a136" />
      <Lei id="a95-p2" />
      <Atencao>Pedido "de boca" para a empresa fazer algo a mais <b>não vale</b>: o contrato verbal é nulo, a empresa pode cobrar depois e quem pediu pode responder pelo prejuízo.</Atencao>
      <H>Prazo e prorrogação</H>
      <Lei id="a107" />
      <Lei id="a115-p1" />
      <H>O dinheiro precisa existir antes</H>
      <Lei id="a92-viii" />
      <Lei id="a150" />
      <NoMeasure>Aditivos nascem como rascunho e são aprovados pelo Master; o valor e a vigência originais nunca são apagados. A dotação vem do catálogo orçamentário do município, cadastrado pela equipe da plataforma no formato da nota de empenho.</NoMeasure>
    </>,
  },
  {
    id: 'falhas', titulo: 'Quando a empresa não cumpre', minutos: 7, resumo: 'Infrações, sanções e por que seus registros são a prova.',
    conteudo: <>
      <Simples>Se a empresa atrasa, entrega menos ou entrega mal, ela pode ser punida — mas só depois de um processo em que se defende. A prova principal são as <b>anotações do fiscal</b>. Sem registro, a empresa sai sem punição e o prejuízo fica com o município.</Simples>
      <Lei id="a155" />
      <EscadaSancoes />
      <Lei id="a156" />
      <Lei id="a157-158" />
      <Lei id="a162" />
      <Lei id="a137" />
      <Lei id="a123" />
      <LinhaPrazos />
    </>,
  },
  {
    id: 'responsabilidade', titulo: 'Sua responsabilidade e como se proteger', minutos: 10, resumo: 'Dolo, erro grosseiro, linhas de defesa e crimes.',
    conteudo: <>
      <Simples>Ninguém é punido por um erro honesto e pequeno, corrigido a tempo. O servidor responde pessoalmente quando age de <b>má-fé (dolo)</b> ou comete <b>erro grosseiro</b> — aquele descuido grave que qualquer pessoa cuidadosa na função evitaria, como atestar sem conferir. A melhor proteção é simples: <b>conferir, registrar, perguntar por escrito e seguir o procedimento</b>.</Simples>
      <TermometroResponsabilidade />
      <Lei id="l28" />
      <Lei id="l20" />
      <Lei id="l21" />
      <Lei id="l23" />
      <Lei id="l30" />
      <H>Você é a primeira linha de defesa</H>
      <LinhasDefesa />
      <Lei id="a169" />
      <Lei id="a169-p3" />
      <H>O que pode recair sobre o servidor</H>
      <Lei id="a73" />
      <Lei id="a121" />
      <Lei id="a141" />
      <GraficoPenas />
      <Lei id="cp337e" />
      <Lei id="cp337l" />
      <Lei id="cp337m" />
      <Lei id="cp337p" />
      <H>O que protege você</H>
      <Lei id="a10" />
      <FazNaoFaz
        faz={['Registrar cada ocorrência com data e providência', 'Consultar por escrito o jurídico e o controle interno', 'Guardar no processo as respostas das consultas', 'Avisar a chefia a tempo (art. 117, § 2º)', 'Declarar impedimento quando houver vínculo com a empresa']}
        naoFaz={['Assinar o que não conferiu', 'Aceitar vantagem, presente ou favor da empresa', 'Ignorar alertas repetidos do sistema ou da equipe', 'Deixar documentos obrigatórios sem cobrar', 'Apagar ou "ajeitar" registros depois']} />
      <Atencao>Este material é orientação. Em caso concreto, consulte o NUJUR/PGM e o controle interno: a resposta formal a uma consulta dá segurança ao seu ato (LINDB, art. 30).</Atencao>
    </>,
  },
  {
    id: 'aracaju', titulo: 'Normas e fluxos de Aracaju', minutos: 5, resumo: 'Instruções Normativas Conjuntas 03 e 04/2026 e o fluxo do DFD na SMS.',
    conteudo: <>
      <Simples>Além da lei federal, o município tem regras próprias e modelos padronizados de documentos. Desde <b>29/05/2026</b>, a Central de Compras (CCL/SEPLOG) aplica as Instruções Normativas Conjuntas nº 03 e 04/2026, que atualizaram os modelos usados nas contratações. Use sempre a versão atual dos modelos.</Simples>
      <NormasAracaju />
      <FluxoDFD />
    </>,
  },
];

// ---------------------------------------------------------------- normas de Aracaju

function NormasAracaju() {
  const n = NORMAS_ARACAJU;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {n.instrucoes.map((i) => (
          <div key={i.titulo} className="rounded-xl border border-slate-200 p-4">
            <p className="mb-1 font-semibold text-slate-900">{i.titulo}</p>
            <p className="text-sm text-slate-700">{i.resumo}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-700">{n.publicacao}</p>
      <a href={n.linkModelos} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-2 rounded-lg border border-marca-300 bg-marca-50 px-3 py-2 text-sm font-medium text-marca-800 hover:bg-marca-100">
        <ExternalLink className="size-4" aria-hidden />Modelos editáveis — Docs Padronizados (Aracaju Compras)
      </a>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Comissão para dúvidas sobre as Instruções Normativas</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1.5 pr-3 font-medium">Nome</th><th className="py-1.5 pr-3 font-medium">Órgão</th><th className="py-1.5 font-medium">Contato</th></tr></thead>
            <tbody>{n.comissao.map(([nome, orgao, tel]) => <tr key={nome} className="border-b border-slate-100"><td className="py-1.5 pr-3">{nome}</td><td className="py-1.5 pr-3 text-slate-600">{orgao}</td><td className="numero py-1.5">{tel || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Responsáveis pelo DFD de execução na SMS</p>
        <p className="mb-2 text-xs text-slate-500">{n.dfd.memorando}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1.5 pr-3 font-medium">Área</th><th className="py-1.5 pr-3 font-medium">Responsável</th><th className="py-1.5 font-medium">Caixa (1Doc)</th></tr></thead>
            <tbody>{n.dfd.responsaveis.map(([area, nome, caixa]) => <tr key={area} className="border-b border-slate-100"><td className="py-1.5 pr-3 font-medium">{area}</td><td className="py-1.5 pr-3">{nome}</td><td className="py-1.5 text-slate-600">{caixa}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- progresso (só neste navegador)

const CHAVE = 'measure.capacitacao.concluidas';
function lerConcluidas(): string[] {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as string[]; } catch { return []; }
}
function gravarConcluidas(ids: string[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(ids)); } catch { /* navegador sem armazenamento: o progresso só não fica salvo */ }
}

function Trilha() {
  const [concluidas, setConcluidas] = useState<string[]>(lerConcluidas);
  const [aberta, setAberta] = useState<number | null>(null);
  const marcar = (id: string) => setConcluidas((c) => { const n = c.includes(id) ? c : [...c, id]; gravarConcluidas(n); return n; });
  const pct = Math.round((concluidas.filter((id) => LICOES.some((l) => l.id === id)).length / LICOES.length) * 100);

  if (aberta !== null) {
    const l = LICOES[aberta]!;
    return (
      <article>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Botao variante="fantasma" icone={<ArrowLeft className="size-4" />} onClick={() => setAberta(null)}>Todas as lições</Botao>
          <span className="text-xs text-slate-500">Lição {aberta + 1} de {LICOES.length} · cerca de {l.minutos} min</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-900">{l.titulo}</h2>
        <p className="text-sm text-slate-600">{l.resumo}</p>
        <div className="mx-auto max-w-4xl">{l.conteudo}</div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} disabled={aberta === 0} onClick={() => { setAberta(aberta - 1); window.scrollTo({ top: 0 }); }}>Anterior</Botao>
          <Botao icone={<CheckCircle2 className="size-4" />} onClick={() => { marcar(l.id); if (aberta < LICOES.length - 1) { setAberta(aberta + 1); window.scrollTo({ top: 0 }); } else setAberta(null); }}>
            {aberta < LICOES.length - 1 ? 'Concluir e ir para a próxima' : 'Concluir a trilha'}
          </Botao>
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="mb-5 rounded-xl border border-slate-200 p-4">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-slate-900">Seu progresso</span><span className="numero text-slate-700">{pct}%</span></div>
        <div className="h-2.5 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da trilha">
          <div className="h-full rounded-full bg-marca-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">O progresso fica salvo apenas neste navegador.</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {LICOES.map((l, i) => {
          const feita = concluidas.includes(l.id);
          return (
            <li key={l.id}>
              <button onClick={() => { setAberta(i); window.scrollTo({ top: 0 }); }}
                className="flex h-full w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-marca-300 hover:bg-marca-50">
                <span className={cx('numero flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold', feita ? 'bg-emerald-600 text-white' : 'bg-marca-100 text-marca-800')}>
                  {feita ? <CheckCircle2 className="size-4" aria-label="Concluída" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{l.titulo}</span>
                  <span className="block text-sm text-slate-600">{l.resumo}</span>
                  <span className="mt-1 block text-xs text-slate-500">cerca de {l.minutos} min{feita ? ' · concluída' : ''}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------- consulta rápida e glossário

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TEMAS = [...new Set(ARTIGOS.flatMap((a) => a.temas))].sort();

function Consulta() {
  const [busca, setBusca] = useState('');
  const [tema, setTema] = useState('');
  const achados = useMemo(() => {
    const t = sem(busca.trim());
    return ARTIGOS.filter((a) => (!tema || a.temas.includes(tema)) && (!t || sem(`${a.ref} ${a.titulo} ${a.simples} ${a.texto} ${a.temas.join(' ')}`).includes(t)));
  }, [busca, tema]);
  return (
    <>
      <div className="mb-3 max-w-md"><CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar na lei" placeholder="Ex.: atesto, aditivo, 25%, ordem cronológica, 117" /></div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tema">
        {['', ...TEMAS].map((t) => (
          <button key={t || 'todos'} onClick={() => setTema(t)} aria-pressed={tema === t}
            className={cx('rounded-full border px-2.5 py-1 text-xs', tema === t ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>{t || 'todos'}</button>
        ))}
      </div>
      {!achados.length ? <Vazio titulo="Nada encontrado" descricao="Tente outra palavra ou tema." /> : achados.map((a) => <Lei key={a.id} id={a.id} />)}
    </>
  );
}

function Glossario() {
  const [busca, setBusca] = useState('');
  const itens = GLOSSARIO.filter(([t, d]) => !busca.trim() || sem(`${t} ${d}`).includes(sem(busca.trim())));
  return (
    <>
      <div className="mb-4 max-w-md"><CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar termo" placeholder="Ex.: apostila, empenho, preposto" /></div>
      <dl className="grid gap-3 md:grid-cols-2">
        {itens.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-slate-200 p-3"><dt className="font-semibold text-slate-900">{t}</dt><dd className="mt-0.5 text-sm text-slate-700">{d}</dd></div>
        ))}
      </dl>
    </>
  );
}

// ---------------------------------------------------------------- teste de conhecimentos

function Teste() {
  const [respostas, setRespostas] = useState<Record<number, number>>({});
  const respondidas = Object.keys(respostas).length;
  const acertos = QUIZ.filter((q, i) => respostas[i] === q.certa).length;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-700">Responda às situações do dia a dia. Cada resposta mostra a explicação e o artigo da lei.</p>
        <p className="numero text-sm font-semibold text-slate-900">{acertos} de {QUIZ.length} acertos · {respondidas} respondidas</p>
      </div>
      <ol className="flex flex-col gap-4">
        {QUIZ.map((q, i) => {
          const r = respostas[i];
          const respondeu = r !== undefined;
          return (
            <li key={i} className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 font-medium text-slate-900"><span className="numero mr-1 text-marca-700">{i + 1}.</span>{q.pergunta}</p>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Pergunta ${i + 1}`}>
                {q.opcoes.map((o, j) => {
                  const certa = j === q.certa;
                  const escolhida = r === j;
                  return (
                    <button key={o} role="radio" aria-checked={escolhida} disabled={respondeu} onClick={() => setRespostas((x) => ({ ...x, [i]: j }))}
                      className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                        !respondeu && 'border-slate-300 hover:border-marca-400 hover:bg-marca-50',
                        respondeu && certa && 'border-emerald-400 bg-emerald-50 text-emerald-950',
                        respondeu && escolhida && !certa && 'border-red-400 bg-red-50 text-red-950',
                        respondeu && !certa && !escolhida && 'border-slate-200 text-slate-500')}>
                      {respondeu && certa && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-label="Resposta certa" />}
                      {respondeu && escolhida && !certa && <XCircle className="mt-0.5 size-4 shrink-0" aria-label="Sua resposta" />}
                      {o}
                    </button>
                  );
                })}
              </div>
              {respondeu && (
                <div className={cx('mt-3 rounded-lg p-3 text-sm', r === q.certa ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950')}>
                  <p className="font-semibold">{r === q.certa ? 'Correto!' : 'Não é bem assim.'}</p>
                  <p>{q.explicacao}</p>
                  <p className="mt-1 text-xs opacity-80">Base: {q.ref}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {respondidas === QUIZ.length && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marca-300 bg-marca-50 p-4">
          <p className="text-sm text-marca-950"><b>Resultado: {acertos} de {QUIZ.length}.</b> {acertos === QUIZ.length ? 'Excelente — você domina o básico.' : 'Revise as lições das questões que errou.'}</p>
          <Botao variante="secundario" icone={<RotateCcw className="size-4" />} onClick={() => { setRespostas({}); window.scrollTo({ top: 0 }); }}>Refazer o teste</Botao>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- página

type Aba = 'trilha' | 'consulta' | 'glossario' | 'teste' | 'aracaju';

export function Capacitacao() {
  const [aba, setAba] = useState<Aba>('trilha');
  return (
    <>
      <CabecalhoPagina titulo="Capacitação de gestores, fiscais e suplentes"
        descricao="Aprenda em linguagem simples o que a lei exige de quem acompanha contratos, quais são os riscos e como se proteger."
        acoes={<Link to="/ajuda" className="text-sm font-medium text-marca-700 hover:underline">← Ajuda e manual</Link>} />
      <div className="mb-5 flex gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <BookOpen className="size-4 shrink-0 text-marca-700" aria-hidden />
        <p>Base: Lei nº 14.133/2021 (Licitações e Contratos), LINDB (Decreto-Lei nº 4.657/1942, arts. 20 a 30, incluídos pela Lei nº 13.655/2018), Instruções Normativas Conjuntas nº 03 e 04/2026 de Aracaju e Memorando SMS 51.800/2026. Material de orientação: não substitui a lei, o regulamento municipal, a portaria de designação nem o parecer do jurídico.</p>
      </div>
      <Cartao>
        <Abas<Aba> abas={[
          { id: 'trilha', rotulo: <span className="flex items-center gap-1.5"><GraduationCap className="size-4" aria-hidden />Trilha de aprendizagem</span> },
          { id: 'consulta', rotulo: 'Consulta rápida da lei' },
          { id: 'glossario', rotulo: 'Glossário' },
          { id: 'teste', rotulo: 'Teste seus conhecimentos' },
          { id: 'aracaju', rotulo: 'Normas de Aracaju' },
        ]} ativa={aba} aoMudar={setAba} />
        {aba === 'trilha' && <Trilha />}
        {aba === 'consulta' && <Consulta />}
        {aba === 'glossario' && <Glossario />}
        {aba === 'teste' && <Teste />}
        {aba === 'aracaju' && <><NormasAracaju /><FluxoDFD /></>}
      </Cartao>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><ArrowRight className="size-3.5" aria-hidden />Dúvida em um caso concreto? Consulte por escrito o NUJUR/PGM e o controle interno e anexe a resposta ao processo.</p>
    </>
  );
}
