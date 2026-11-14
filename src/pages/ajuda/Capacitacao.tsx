// Capacitação e consulta para gestores, fiscais e suplentes de contrato: trilha de lições em linguagem
// simples, gráficos, verificação por lição, consulta rápida à lei, glossário, teste e normas de Aracaju.
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ExternalLink, GraduationCap, Info, Lightbulb, ListChecks, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { Botao, CabecalhoPagina, Cartao, Vazio, cx } from '@/components/ui/basicos';
import { ARTIGOS, artigo, GLOSSARIO, NORMAS_ARACAJU, QUIZ, type Pergunta } from './conteudo';
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

// ---------------------------------------------------------------- perguntas (usadas na lição e no teste)

function CartaoPergunta({ q, n, resposta, aoResponder }: { q: Pergunta; n: number; resposta: number | undefined; aoResponder: (j: number) => void }) {
  const respondeu = resposta !== undefined;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 font-medium text-slate-900"><span className="numero mr-1 text-marca-700">{n}.</span>{q.pergunta}</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Pergunta ${n}`}>
        {q.opcoes.map((o, j) => {
          const certa = j === q.certa;
          const escolhida = resposta === j;
          return (
            <button key={o} role="radio" aria-checked={escolhida} disabled={respondeu} onClick={() => aoResponder(j)}
              className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                !respondeu && 'border-slate-300 hover:border-marca-400 hover:bg-marca-50',
                respondeu && certa && 'border-emerald-400 bg-emerald-50 text-emerald-950',
                respondeu && escolhida && !certa && 'border-red-400 bg-red-50 text-red-950',
                respondeu && !certa && !escolhida && 'border-slate-200 text-slate-500')}>
              <span className="numero mt-px shrink-0 font-semibold">{String.fromCharCode(65 + j)})</span>
              <span className="flex-1">{o}</span>
              {respondeu && certa && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-label="Resposta certa" />}
              {respondeu && escolhida && !certa && <XCircle className="mt-0.5 size-4 shrink-0" aria-label="Sua resposta" />}
            </button>
          );
        })}
      </div>
      {respondeu && (
        <div className={cx('mt-3 rounded-lg p-3 text-sm', resposta === q.certa ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950')}>
          <p className="font-semibold">{resposta === q.certa ? 'Correto!' : `Não é bem assim — a resposta certa é a letra ${String.fromCharCode(65 + q.certa)}.`}</p>
          <p>{q.explicacao}</p>
          <p className="mt-1 text-xs opacity-80">Base: {q.ref}</p>
        </div>
      )}
    </div>
  );
}

function Verificacao({ licao }: { licao: string }) {
  const perguntas = QUIZ.filter((q) => q.licao === licao);
  const [r, setR] = useState<Record<number, number>>({});
  if (!perguntas.length) return null;
  return (
    <section className="mt-8 rounded-2xl border border-marca-200 bg-marca-50/40 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><ListChecks className="size-5 text-marca-700" aria-hidden />Verifique o que aprendeu</h3>
      <div className="flex flex-col gap-3">
        {perguntas.map((q, i) => <CartaoPergunta key={q.pergunta} q={q} n={i + 1} resposta={r[i]} aoResponder={(j) => setR((x) => ({ ...x, [i]: j }))} />)}
      </div>
    </section>
  );
}

function ParaLembrar({ pontos }: { pontos: string[] }) {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><BookOpen className="size-5 text-marca-700" aria-hidden />Para lembrar</h3>
      <ol className="space-y-1.5 text-sm text-slate-800">
        {pontos.map((p, i) => <li key={p} className="flex gap-2"><span className="numero flex size-5 shrink-0 items-center justify-center rounded-full bg-marca-100 text-xs font-semibold text-marca-800">{i + 1}</span>{p}</li>)}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- lições

type Papel = 'Gestor' | 'Fiscal' | 'Suplente';
interface Licao { id: string; titulo: string; resumo: string; minutos: number; publico: Papel[]; pontos: string[]; conteudo: ReactNode }
const TODOS: Papel[] = ['Gestor', 'Fiscal', 'Suplente'];

const LICOES: Licao[] = [
  {
    id: 'porque', titulo: 'Por que fiscalizar importa', minutos: 5, resumo: 'O dinheiro é público e você é os olhos da Administração.', publico: TODOS,
    pontos: ['O contrato é uma promessa paga com dinheiro público.', 'Conferir antes de pagar é o que impede o superfaturamento.', 'Atestar só o que foi realmente entregue.'],
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
      <P>A lei chama de <b>superfaturamento</b> o dano ao dinheiro público durante a execução. Vários exemplos acontecem exatamente onde gestor e fiscal atuam:</P>
      <Lei id="a6-lvii" />
      <Risco titulo="pagar pelo que não foi entregue">Pagar quantidade maior do que a entregue é o exemplo da letra "a" do superfaturamento. Quem atesta sabendo que não houve entrega responde pessoalmente (LINDB, art. 28) e, se agir em conluio com a empresa, pode responder como participante do crime de fraude em contrato (Código Penal, art. 337-L: 4 a 8 anos de reclusão).</Risco>
      <NoMeasure>Atesta a nota o gestor, o fiscal ou o suplente designado no contrato. Se o órgão permitir (em Configurações), quem lançou a nota também pode atestar. O sistema registra quem atestou, em qual papel, quando e o texto do atesto, e esse registro fica na auditoria. Quem atesta responde pelo que atestou, seja qual for o papel.</NoMeasure>
    </>,
  },
  {
    id: 'papeis', titulo: 'Quem é quem: gestor, fiscal e suplente', minutos: 7, resumo: 'O que cada um faz, quem pode ser designado e quando você está impedido.', publico: TODOS,
    pontos: ['Gestor cuida do contrato; fiscal confere a execução; suplente substitui o fiscal.', 'Vínculo com a empresa (parentesco até o 3º grau, sociedade, negócios) impede a designação.', 'Na dúvida, pergunte por escrito ao jurídico e ao controle interno.'],
    conteudo: <>
      <Simples>Pense no contrato como uma reforma numa casa. O <b>gestor</b> cuida do "papel": prazos, dinheiro disponível, mudanças no combinado. O <b>fiscal</b> vai ao local ver se o serviço está sendo feito direito. O <b>suplente</b> é o fiscal reserva: entra quando o titular está de férias ou afastado — e, enquanto estiver no lugar, responde como fiscal.</Simples>
      <Papeis />
      <Lei id="a8-p3" />
      <H>Quem pode ser designado</H>
      <Lei id="a7" />
      <Lei id="a7-p1" />
      <Atencao>A lei não permite designar quem é cônjuge, companheiro ou parente até o 3º grau (inclusive por afinidade, como o cunhado) de licitantes ou contratados habituais, ou tem com eles vínculo técnico, comercial, econômico, financeiro, trabalhista ou civil (art. 7º, III). Se você tem um desses vínculos com a empresa ou com seus sócios, <b>comunique a chefia por escrito</b> assim que souber, para que outro servidor seja designado.</Atencao>
      <Lei id="a9-p1" />
      <H>O fiscal não está sozinho</H>
      <P>Você pode e deve pedir ajuda: a assessoria jurídica (na SMS, o NUJUR) e o controle interno têm o dever de tirar suas dúvidas e apoiar a fiscalização (art. 117, § 3º). Perguntar por escrito é sinal de cuidado, não de fraqueza.</P>
      <NoMeasure>A designação é feita na aba <b>Responsáveis</b> do contrato. O designado passa a ver o contrato, recebe o aviso "Aguardando o seu atesto" e o nome dele aparece nos extratos e no checklist.</NoMeasure>
    </>,
  },
  {
    id: 'caminho', titulo: 'O caminho de uma contratação', minutos: 8, resumo: 'Do pedido (DFD) ao pagamento — e onde você entra.', publico: ['Gestor', 'Fiscal'],
    pontos: ['O processo começa com o DFD e passa por estudo, termo de referência, orçamento e parecer jurídico.', 'Só existem 5 modalidades de licitação.', 'Contratar sem licitação fora dos casos da lei é crime.'],
    conteudo: <>
      <Simples>Antes de existir um contrato, alguém precisou pedir (DFD), estudar a melhor solução (ETP), descrever o que quer (Termo de Referência), estimar o preço, passar pelo jurídico e escolher a empresa. Depois do contrato assinado começa a parte em que você atua: acompanhar, receber, atestar e acompanhar o pagamento.</Simples>
      <Fluxo titulo="Do pedido ao pagamento" etapas={[
        { titulo: 'DFD', detalhe: 'Pedido formal da unidade' },
        { titulo: 'Estudo Técnico Preliminar', detalhe: 'Melhor solução' },
        { titulo: 'Termo de Referência', detalhe: 'O que, como medir e pagar' },
        { titulo: 'Orçamento estimado', detalhe: 'Pesquisa de preços (art. 23)' },
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
      <Lei id="a17" />
      <Lei id="a28" />
      <H>Quando se pode contratar sem licitação</H>
      <Lei id="a75" />
      <Risco titulo="contratação direta fora da lei">Contratar sem licitação fora dos casos permitidos é crime (Código Penal, art. 337-E: 4 a 8 anos de reclusão) e, havendo dolo, fraude ou erro grosseiro, o servidor responde junto com a empresa pelo prejuízo (art. 73). O limite de valor considera a soma do ano para objetos do mesmo ramo (art. 75, § 1º).</Risco>
    </>,
  },
  {
    id: 'dia', titulo: 'O dia a dia do fiscal', minutos: 10, resumo: 'Acompanhar, registrar, cobrar correção, receber e atestar.', publico: ['Fiscal', 'Suplente'],
    pontos: ['Anote todas as ocorrências: elas são a prova.', 'Avise a chefia a tempo quando o problema passar da sua competência.', 'Em mão de obra exclusiva, confira os documentos trabalhistas com regularidade.', 'Receba e ateste apenas o que foi efetivamente entregue.'],
    conteudo: <>
      <Simples>Fiscalizar é como conferir uma compra no supermercado antes de pagar: você olha a quantidade, a qualidade e se é mesmo o produto que pediu. A diferença é que, no contrato, você precisa <b>anotar tudo</b>, porque essas anotações viram prova — para cobrar a empresa e para proteger você.</Simples>
      <Fluxo titulo="O ciclo de cada período de medição" etapas={[
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
      <P>Aqui está um dos maiores riscos para o município: se a empresa não pagar os empregados e a falha na fiscalização ficar comprovada, <b>a conta pode cair no município</b>.</P>
      <CadeiaTrabalhista />
      <Lei id="a50" />
      <Lei id="a121" />
      <FazNaoFaz
        faz={['Ir ao local e conferir com os próprios olhos', 'Anotar data, fato e providência de cada ocorrência', 'Cobrar a empresa por escrito, pelo preposto', 'Pedir ajuda ao jurídico e ao controle interno quando tiver dúvida', 'Atestar apenas o que foi efetivamente entregue', 'Conferir com regularidade os documentos trabalhistas (art. 50)']}
        naoFaz={['Atestar "para não atrasar o pagamento"', 'Assinar medição feita pela empresa sem conferir', 'Combinar coisas com a empresa só por conversa', 'Deixar a empresa executar serviço fora do contrato', 'Esperar o fim do contrato para relatar problemas', 'Fiscalizar contrato de empresa com quem você tem vínculo']} />
      <NoMeasure>Na nota fiscal, a aba <b>Atesto</b> traz o texto gerado pelo modelo do órgão; a aba <b>Documentos</b> permite anexar comprovantes e emitir o <b>checklist</b>, que confere vigência, empenho, saldo, referência, atesto e pagamento.</NoMeasure>
    </>,
  },
  {
    id: 'pagamento', titulo: 'Pagamento: sem antecipar e sem furar a fila', minutos: 6, resumo: 'Ordem cronológica, parcela incontroversa e pagamento antecipado.', publico: ['Gestor', 'Fiscal'],
    pontos: ['Há uma fila por fonte de recurso e tipo de contrato.', 'A ordem só muda nas 5 situações da lei, com justificativa.', 'A parte sem discussão é paga no prazo.', 'Não se paga antes de receber, salvo exceção prevista e justificada.'],
    conteudo: <>
      <Simples>O pagamento funciona como a fila de um banco: quem chegou primeiro é atendido primeiro, e há uma fila para cada tipo de contrato e cada fonte de recurso. Ninguém passa na frente "porque pediu" ou "porque é amigo". E, como regra, não se paga antes de receber.</Simples>
      <FilaPagamentos />
      <Lei id="a141" />
      <Lei id="a143" />
      <Lei id="a145" />
      <Risco titulo="pagamento irregular">Pagar fatura preterindo a ordem cronológica, ou dar vantagem à empresa sem previsão em lei, no edital ou no contrato, é crime (Código Penal, art. 337-H: 4 a 8 anos de reclusão).</Risco>
      <Lei id="cp337h" />
      <NoMeasure>O pagamento só é liberado depois do atesto. A administração dá baixa no menu <b>Pagamentos</b>, que mostra a fila na ordem cronológica de cada fonte de recurso, com as retenções e o valor líquido. Pagar fora da ordem exige justificativa, que fica registrada. Pagamento menor que o valor da nota deixa a situação como <b>Parcial</b>, e cada pagamento fica registrado com data, documento e responsável.</NoMeasure>
    </>,
  },
  {
    id: 'alteracoes', titulo: 'Mudanças no contrato: aditivo, apostila e dotação', minutos: 9, resumo: 'O que pode mudar, até quanto e como formalizar.', publico: ['Gestor', 'Fiscal'],
    pontos: ['Toda alteração precisa de justificativa e de termo aditivo antes da execução.', 'Limite obrigatório para a empresa: 25% (50% para acréscimo em reforma).', 'Reajuste previsto, nome da empresa e empenho: apostila.', 'Sem dotação orçamentária, a contratação é nula.'],
    conteudo: <>
      <Simples>Mudar o contrato é como mudar o combinado de uma reforma: precisa ser por escrito, com motivo, dentro de limites e <b>antes</b> de o serviço novo ser feito. Algumas atualizações simples (reajuste já previsto, nome da empresa, empenho) não mudam o contrato e são feitas por apostila.</Simples>
      <Lei id="a124" />
      <LimitesAlteracao />
      <Lei id="a125" />
      <Lei id="a126" />
      <Lei id="a132" />
      <Lei id="a136" />
      <Lei id="a95-p2" />
      <Atencao>Pedido "de boca" para a empresa fazer algo a mais <b>não vale</b>: o contrato verbal é nulo. Mesmo assim, o município pode ter de indenizar o que foi executado, e quem deu causa é responsabilizado (art. 149).</Atencao>
      <Lei id="a149" />
      <H>Prazo, prorrogação e publicidade</H>
      <Lei id="a107" />
      <Lei id="a115-p1" />
      <Lei id="a94" />
      <H>O dinheiro precisa existir antes</H>
      <Lei id="a92-viii" />
      <Lei id="a150" />
      <NoMeasure>Aditivos nascem como rascunho e são aprovados pelo Master; o valor e a vigência originais nunca são apagados. A dotação vem do catálogo orçamentário do município, cadastrado pela equipe da plataforma no formato da nota de empenho.</NoMeasure>
    </>,
  },
  {
    id: 'falhas', titulo: 'Quando a empresa não cumpre', minutos: 8, resumo: 'Infrações, sanções e por que seus registros são a prova.', publico: TODOS,
    pontos: ['Sanções: advertência, multa (0,5% a 30%), impedimento (até 3 anos) e inidoneidade (3 a 6 anos).', 'Antes de punir, a empresa tem prazo de defesa.', 'Sem registros do fiscal, não há prova.', 'Todo pedido da empresa precisa de decisão expressa.'],
    conteudo: <>
      <Simples>Se a empresa atrasa, entrega menos ou entrega mal, ela pode ser punida — mas só depois de um processo em que se defende. A prova principal são as <b>anotações do fiscal</b>. Sem registro, a empresa sai sem punição e o prejuízo fica com o município.</Simples>
      <Lei id="a155" />
      <EscadaSancoes />
      <Lei id="a156" />
      <Lei id="a157-158" />
      <Lei id="a166-167" />
      <Lei id="a162" />
      <Lei id="a137" />
      <Lei id="a123" />
      <LinhaPrazos />
    </>,
  },
  {
    id: 'responsabilidade', titulo: 'Sua responsabilidade e como se proteger', minutos: 12, resumo: 'Dolo, erro grosseiro, linhas de defesa e crimes.', publico: TODOS,
    pontos: ['Responsabilidade pessoal exige dolo ou erro grosseiro.', 'Erro simples de forma é corrigido e vira capacitação.', 'Você está na primeira linha de defesa.', 'Registrar, consultar por escrito e seguir o parecer protegem você.'],
    conteudo: <>
      <Simples>Pela LINDB, o servidor só responde pessoalmente por suas decisões ou opiniões técnicas quando age de <b>má-fé (dolo)</b> ou comete <b>erro grosseiro</b> — o erro evidente, com culpa grave, como atestar sem conferir. Já o erro simples, só de forma, deve ser corrigido e virar aprendizado. A melhor proteção é simples: <b>conferir, registrar, perguntar por escrito e seguir o procedimento</b>.</Simples>
      <TermometroResponsabilidade />
      <Lei id="l28" />
      <Lei id="d9830" />
      <Lei id="l22" />
      <Lei id="l20" />
      <Lei id="l21" />
      <Lei id="l23" />
      <Lei id="l30" />
      <H>Você está na primeira linha de defesa</H>
      <LinhasDefesa />
      <Lei id="a169" />
      <Lei id="a169-p3" />
      <H>O que pode recair sobre o servidor e sobre o município</H>
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
        faz={['Registrar cada ocorrência com data e providência', 'Consultar por escrito o jurídico e o controle interno', 'Guardar no processo as respostas das consultas', 'Registrar as dificuldades reais que limitaram sua ação (LINDB, art. 22)', 'Avisar a chefia a tempo (art. 117, § 2º)', 'Declarar impedimento quando houver vínculo com a empresa']}
        naoFaz={['Assinar o que não conferiu', 'Aceitar vantagem, presente ou favor da empresa', 'Ignorar alertas repetidos do sistema ou da equipe', 'Deixar documentos obrigatórios sem cobrar', 'Apagar ou "ajeitar" registros depois']} />
      <Atencao>Este material é orientação. Em caso concreto, consulte o NUJUR/PGM e o controle interno: a resposta formal a uma consulta vincula o órgão a que se destina até ser revista (LINDB, art. 30).</Atencao>
    </>,
  },
  {
    id: 'aracaju', titulo: 'Normas e fluxos de Aracaju', minutos: 5, resumo: 'Instruções Normativas Conjuntas 03 e 04/2026 e o fluxo do DFD na SMS.', publico: TODOS,
    pontos: ['Desde 29/05/2026 a CCL/SEPLOG aplica as IN Conjuntas 03 e 04/2026.', 'Use sempre os modelos atualizados do Aracaju Compras.', 'DFD para iniciar licitação: cada diretoria; com ata ou contrato vigente: SMS-DF-CP-DFD.'],
    conteudo: <>
      <Simples>Além da lei federal, o município tem regras próprias e modelos padronizados de documentos. Desde <b>29/05/2026</b>, a Central de Compras (CCL/SEPLOG) aplica as Instruções Normativas Conjuntas nº 03 e 04/2026, que alteraram as INC 01 e 02/2023 e atualizaram os modelos usados nas contratações. Use sempre a versão atual.</Simples>
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
  const [papel, setPapel] = useState<Papel | ''>('');
  const marcar = (id: string) => setConcluidas((c) => { const n = c.includes(id) ? c : [...c, id]; gravarConcluidas(n); return n; });
  const abrir = (i: number) => { setAberta(i); window.scrollTo({ top: 0 }); };
  const pct = Math.round((concluidas.filter((id) => LICOES.some((l) => l.id === id)).length / LICOES.length) * 100);

  if (aberta !== null) {
    const l = LICOES[aberta]!;
    return (
      <article>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Botao variante="fantasma" icone={<ArrowLeft className="size-4" />} onClick={() => setAberta(null)}>Todas as lições</Botao>
          <span className="text-xs text-slate-500">Lição {aberta + 1} de {LICOES.length} · cerca de {l.minutos} min</span>
        </div>
        <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Lições da trilha">
          {LICOES.map((x, i) => (
            <button key={x.id} onClick={() => abrir(i)} title={x.titulo} aria-label={`Lição ${i + 1}: ${x.titulo}`} aria-current={i === aberta ? 'step' : undefined}
              className={cx('numero flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                i === aberta ? 'bg-marca-700 text-white' : concluidas.includes(x.id) ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {concluidas.includes(x.id) && i !== aberta ? <CheckCircle2 className="size-4" aria-hidden /> : i + 1}
            </button>
          ))}
        </nav>
        <h2 className="text-xl font-semibold text-slate-900">{l.titulo}</h2>
        <p className="text-sm text-slate-600">{l.resumo}</p>
        <p className="mt-1 flex flex-wrap gap-1">{l.publico.map((p) => <span key={p} className="rounded-full bg-marca-100 px-2 py-0.5 text-xs font-medium text-marca-800">{p}</span>)}</p>
        <div className="mx-auto max-w-4xl">
          {l.conteudo}
          <ParaLembrar pontos={l.pontos} />
          <Verificacao key={l.id} licao={l.id} />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <Botao variante="secundario" icone={<ArrowLeft className="size-4" />} disabled={aberta === 0} onClick={() => abrir(aberta - 1)}>Anterior</Botao>
          <Botao icone={<CheckCircle2 className="size-4" />} onClick={() => { marcar(l.id); if (aberta < LICOES.length - 1) abrir(aberta + 1); else setAberta(null); }}>
            {aberta < LICOES.length - 1 ? 'Concluir e ir para a próxima' : 'Concluir a trilha'}
          </Botao>
        </div>
      </article>
    );
  }

  const visiveis = LICOES.map((l, i) => ({ l, i })).filter(({ l }) => !papel || l.publico.includes(papel));
  return (
    <>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-slate-900">Seu progresso</span><span className="numero text-slate-700">{pct}%</span></div>
          <div className="h-2.5 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da trilha">
            <div className="h-full rounded-full bg-marca-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">O progresso fica salvo apenas neste navegador.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mostrar a trilha para">
          <span className="text-xs text-slate-600">Quero ver a trilha de:</span>
          {(['', ...TODOS] as Array<Papel | ''>).map((p) => (
            <button key={p || 'todos'} onClick={() => setPapel(p)} aria-pressed={papel === p}
              className={cx('rounded-full border px-3 py-1 text-xs font-medium', papel === p ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>{p || 'Todos'}</button>
          ))}
        </div>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {visiveis.map(({ l, i }) => {
          const feita = concluidas.includes(l.id);
          return (
            <li key={l.id}>
              <button onClick={() => abrir(i)}
                className="flex h-full w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-marca-300 hover:bg-marca-50">
                <span className={cx('numero flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold', feita ? 'bg-emerald-600 text-white' : 'bg-marca-100 text-marca-800')}>
                  {feita ? <CheckCircle2 className="size-4" aria-label="Concluída" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{l.titulo}</span>
                  <span className="block text-sm text-slate-600">{l.resumo}</span>
                  <span className="mt-1 block text-xs text-slate-500">cerca de {l.minutos} min · para {l.publico.join(', ').toLowerCase()}{feita ? ' · concluída' : ''}</span>
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
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tema">
        {['', ...TEMAS].map((t) => (
          <button key={t || 'todos'} onClick={() => setTema(t)} aria-pressed={tema === t}
            className={cx('rounded-full border px-2.5 py-1 text-xs', tema === t ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>{t || 'todos'}</button>
        ))}
      </div>
      <p className="mb-2 text-xs text-slate-500" aria-live="polite">{achados.length} {achados.length === 1 ? 'dispositivo encontrado' : 'dispositivos encontrados'}</p>
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
  const [soErradas, setSoErradas] = useState<number[] | null>(null);
  const indices = soErradas ?? QUIZ.map((_, i) => i);
  const respondidas = indices.filter((i) => respostas[i] !== undefined).length;
  const acertos = indices.filter((i) => respostas[i] === QUIZ[i]!.certa).length;
  const pct = Math.round((respondidas / indices.length) * 100);
  const erradas = QUIZ.map((_, i) => i).filter((i) => respostas[i] !== undefined && respostas[i] !== QUIZ[i]!.certa);
  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-700">{soErradas ? 'Refazendo as questões que você errou.' : 'Situações do dia a dia: cada resposta mostra a explicação e o artigo da lei.'}</span>
          <span className="numero font-semibold text-slate-900">{acertos} de {indices.length} acertos · {respondidas} respondidas</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Questões respondidas">
          <div className="h-full rounded-full bg-marca-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="flex flex-col gap-4">
        {indices.map((i, k) => <li key={i}><CartaoPergunta q={QUIZ[i]!} n={k + 1} resposta={respostas[i]} aoResponder={(j) => setRespostas((x) => ({ ...x, [i]: j }))} /></li>)}
      </ol>
      {respondidas === indices.length && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marca-300 bg-marca-50 p-4">
          <p className="text-sm text-marca-950"><b>Resultado: {acertos} de {indices.length}.</b> {acertos === indices.length ? 'Excelente — você domina o essencial.' : 'Revise as lições das questões que errou e tente de novo.'}</p>
          <div className="flex flex-wrap gap-2">
            {erradas.length > 0 && <Botao variante="secundario" icone={<RotateCcw className="size-4" />} onClick={() => { setRespostas((x) => { const n = { ...x }; erradas.forEach((i) => delete n[i]); return n; }); setSoErradas(erradas); window.scrollTo({ top: 0 }); }}>Refazer só as que errei ({erradas.length})</Botao>}
            <Botao variante="secundario" icone={<RotateCcw className="size-4" />} onClick={() => { setRespostas({}); setSoErradas(null); window.scrollTo({ top: 0 }); }}>Refazer o teste todo</Botao>
          </div>
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
        <p>Base: Lei nº 14.133/2021 (Licitações e Contratos) e Código Penal, arts. 337-E a 337-P (inseridos por ela); LINDB (Decreto-Lei nº 4.657/1942, arts. 20 a 30, incluídos pela Lei nº 13.655/2018); Decreto federal nº 9.830/2019 (referência); Instruções Normativas Conjuntas nº 03 e 04/2026 de Aracaju e Memorando SMS 51.800/2026. Os trechos de lei são literais; as explicações são orientação e não substituem a lei, o regulamento municipal, a portaria de designação nem o parecer do jurídico.</p>
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
