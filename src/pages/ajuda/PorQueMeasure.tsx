// "Por que usar o MEASURE": apresentação do sistema dentro de Ajuda e manual
// e também aberta ao público, sem login, em /por-que-usar (link na tela de entrada).
// Explica, em linguagem simples, o que o sistema faz e o que muda no dia a dia de cada perfil.
// Os prints são de um órgão de EXEMPLO, com dados fictícios (nenhum dado real de pessoas ou empresas).
import {
  ArrowRight, BarChart3, Banknote, Bell, BookOpen, CalendarCheck2, Database, Search, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileCheck2, FileSpreadsheet,
  FileText, Gavel, GraduationCap, History, Home, KeyRound, Lock, LogIn, Mail, MessagesSquare, Package, Receipt, ShieldCheck, Smartphone, Sparkles, Users, Wallet, Wand2,
  X, XCircle, ZoomIn,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '@/components/ui/basicos';
import { LogoCompleto } from '@/components/layout/Marca';

const img = (nome: string) => `${import.meta.env.BASE_URL}ajuda/apresentacao/${nome}.webp`;

interface Print { arquivo: string; legenda: string }

function Imagem({ print, abrir, destaque, escuro }: { print: Print; abrir: (p: Print) => void; destaque?: boolean; escuro?: boolean }) {
  return (
    <figure className="group">
      <button type="button" onClick={() => abrir(print)} aria-label={`Ampliar: ${print.legenda}`}
        className={cx('relative block w-full overflow-hidden rounded-2xl bg-slate-100 text-left ring-1 ring-slate-900/10 transition',
          'shadow-[0_20px_50px_-20px_rgba(15,42,74,0.45)] hover:-translate-y-1 hover:shadow-[0_28px_60px_-20px_rgba(15,42,74,0.55)]', destaque && 'ring-2 ring-acento-400/60')}>
        {/* "janela" do navegador */}
        <span className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2" aria-hidden>
          <span className="size-2.5 rounded-full bg-red-300" /><span className="size-2.5 rounded-full bg-amber-300" /><span className="size-2.5 rounded-full bg-emerald-300" />
          <span className="ml-3 h-4 flex-1 rounded-full bg-slate-100" />
        </span>
        <img src={img(print.arquivo)} alt={print.legenda} loading="lazy" decoding="async" className="block w-full" />
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-marca-950/80 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100">
          <ZoomIn className="size-3.5" aria-hidden />Ampliar
        </span>
      </button>
      <figcaption className={cx('mt-2.5 text-center text-xs', escuro ? 'text-marca-100' : 'text-slate-500')}>{print.legenda}</figcaption>
    </figure>
  );
}

function Bloco({ id, icone, sobre, titulo, texto, itens, prints, abrir, invertido, cor = 'marca' }: {
  id?: string; icone: ReactNode; sobre: string; titulo: string; texto: ReactNode; itens: string[]; prints: Print[];
  abrir: (p: Print) => void; invertido?: boolean; cor?: 'marca' | 'acento' | 'chamada';
}) {
  const tons = { marca: 'bg-marca-50 text-marca-700 ring-marca-200', acento: 'bg-acento-50 text-acento-700 ring-acento-100', chamada: 'bg-amber-50 text-amber-700 ring-amber-200' };
  return (
    <section id={id} className="grid scroll-mt-24 items-center gap-8 py-10 lg:grid-cols-[5fr_7fr] lg:gap-12">
      <div className={cx(invertido && 'lg:order-2')}>
        <span className={cx('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ring-1', tons[cor])}>{icone}{sobre}</span>
        <h3 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[28px]">{titulo}</h3>
        <div className="mt-3 text-[15px] leading-relaxed text-slate-600">{texto}</div>
        <ul className="mt-5 flex flex-col gap-2.5">
          {itens.map((t) => (
            <li key={t} className="flex gap-2.5 text-[15px] text-slate-700">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-acento-600" aria-hidden /><span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cx('flex flex-col gap-6', invertido && 'lg:order-1')}>
        {prints.map((p, i) => <Imagem key={p.arquivo} print={p} abrir={abrir} destaque={i === 0} />)}
      </div>
    </section>
  );
}

// Slides do "papel pronto": o sistema monta o atesto e o checklist com os dados que já tem
const SLIDES: Array<Print & { passo: string; titulo: string; texto: string }> = [
  { arquivo: 'slide-atesto', legenda: 'Texto de atesto gerado automaticamente', passo: '1', titulo: 'O texto de atesto já vem escrito',
    texto: 'Número e valor da nota (também por extenso), contrato, empresa, vigência, objeto, local do serviço e mês de referência: o MEASURE preenche tudo no modelo do órgão. É só conferir, copiar e atestar.' },
  { arquivo: 'slide-checklist', legenda: 'Checklist da nota com os dados preenchidos', passo: '2', titulo: 'O checklist vem montado',
    texto: 'Os dados da nota e do contrato aparecem sozinhos e os itens já vêm marcados como no modelo. Você só confere o que mudou e escolhe quem assina.' },
  { arquivo: 'slide-checklist-doc', legenda: 'Checklist emitido, pronto para imprimir ou salvar em PDF', passo: '3', titulo: 'Documento pronto para assinar',
    texto: 'Um clique gera o formulário de análise dos documentos no padrão do órgão, com cabeçalho, itens, responsável e matrícula. Imprima ou salve em PDF.' },
];

function Slides({ abrir }: { abrir: (p: Print) => void }) {
  const [i, setI] = useState(0);
  const toque = useRef<number | null>(null);
  const ir = (n: number) => setI((n + SLIDES.length) % SLIDES.length);
  const s = SLIDES[i]!;
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-28px_rgba(15,42,74,0.55)] ring-1 ring-slate-200"
      onKeyDown={(e) => { if (e.key === 'ArrowRight') ir(i + 1); if (e.key === 'ArrowLeft') ir(i - 1); }}>
      {/* passos */}
      <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50" role="tablist" aria-label="Etapas">
        {SLIDES.map((x, k) => (
          <button key={x.arquivo} role="tab" aria-selected={k === i} onClick={() => setI(k)}
            className={cx('relative flex items-center justify-center gap-2 px-2 py-3 text-xs font-semibold transition sm:text-sm',
              k === i ? 'bg-white text-marca-800' : 'text-slate-500 hover:text-slate-800')}>
            <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full text-xs', k === i ? 'bg-marca-700 text-white' : 'bg-slate-200 text-slate-600')}>{x.passo}</span>
            <span className="hidden sm:inline">{['Atesto', 'Checklist', 'Documento'][k]}</span>
            {k === i && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-acento-400 to-chamada-400" aria-hidden />}
          </button>
        ))}
      </div>
      <div className="grid items-center gap-6 p-5 sm:p-8 lg:grid-cols-[5fr_7fr] lg:gap-10">
        <div key={s.arquivo} className="orientacao-conteudo">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-acento-600">Passo {s.passo} de {SLIDES.length}</p>
          <h3 className="mt-2 text-2xl font-extrabold leading-tight text-slate-900">{s.titulo}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{s.texto}</p>
          <div className="mt-6 flex items-center gap-2">
            <button onClick={() => ir(i - 1)} aria-label="Slide anterior" className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"><ChevronLeft className="size-5" /></button>
            <button onClick={() => ir(i + 1)} aria-label="Próximo slide" className="flex size-10 items-center justify-center rounded-full bg-marca-700 text-white hover:bg-marca-800"><ChevronRight className="size-5" /></button>
            <span className="ml-2 flex gap-1.5" aria-hidden>
              {SLIDES.map((x, k) => <span key={x.arquivo} className={cx('h-2 rounded-full transition-all', k === i ? 'w-6 bg-marca-700' : 'w-2 bg-slate-300')} />)}
            </span>
          </div>
        </div>
        <div onTouchStart={(e) => { toque.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => { const x0 = toque.current; const x1 = e.changedTouches[0]?.clientX; if (x0 != null && x1 != null && Math.abs(x1 - x0) > 40) ir(i + (x1 < x0 ? 1 : -1)); toque.current = null; }}>
          <div className="mx-auto max-w-xl"><Imagem key={s.arquivo} print={s} abrir={abrir} destaque /></div>
        </div>
      </div>
    </div>
  );
}

const ANTES_DEPOIS: Array<[string, string]> = [
  ['Contratos espalhados em planilhas e pastas', 'Todos os contratos num lugar só, com saldo calculado sozinho'],
  ['Descobrir o saldo fazendo conta na calculadora', 'Valor usado, empenhado, pago e o que sobra, sempre atualizados'],
  ['Contrato vence e ninguém percebe a tempo', 'Aviso no sistema, no celular e por e-mail antes de vencer'],
  ['Responsável só fica sabendo da nota quando perguntam', 'Gestor, fiscal e suplente recebem por e-mail cada novidade do contrato'],
  ['Atesto escrito à mão, cada um de um jeito', 'Texto de atesto gerado automaticamente, no modelo do órgão'],
  ['Checklist da nota montado do zero toda vez', 'Checklist gerado automaticamente, com os dados da nota já preenchidos'],
  ['Pagamento sem ordem clara', 'Fila de pagamento na ordem da lei, separada por fonte de recurso'],
  ['Frequência dos servidores em papel', 'Consolidado mensal com atrasos, faltas e justificativas, pronto para imprimir'],
  ['Não dá para saber quem mudou o quê', 'Tudo registrado: quem fez, quando e por quê'],
  ['Pesquisa de preço garimpando sites e planilhas', 'Consulta guiada aos preços que outros órgãos pagaram, nos dados abertos do Compras.gov.br'],
];

const PERFIS = [
  {
    icone: <FileText className="size-6" aria-hidden />, titulo: 'Administrativo', subtitulo: 'Quem cadastra e movimenta',
    itens: ['Cadastra contrato, empenho e nota seguindo as etapas na tela', 'Vê na hora o saldo de cada contrato e de cada empenho', 'Dá baixa nos pagamentos com as retenções e o líquido calculados', 'Gera checklist, extratos e relatórios em PDF e Excel', 'Monta o consolidado mensal dos servidores sem papelada'],
  },
  {
    icone: <ClipboardCheck className="size-6" aria-hidden />, titulo: 'Gestor e fiscal', subtitulo: 'Quem acompanha o contrato',
    itens: ['Vê só os contratos em que foi designado, em "Meus contratos"', 'Recebe por e-mail e no celular cada novidade do contrato', 'Atesta com o texto gerado pelo sistema, no modelo do órgão', 'Registra notificações e ocorrências com a empresa', 'Tem um curso curtinho sobre a função de fiscal', 'Compara o preço cobrado com o que outros órgãos pagaram (Compras.gov.br)'],
  },
  {
    icone: <BarChart3 className="size-6" aria-hidden />, titulo: 'Chefias', subtitulo: 'Secretário, diretor, coordenador e gestão',
    itens: ['Painel com os números do setor em tempo real', 'Contratos perto do vencimento em destaque', 'Quanto foi empenhado, usado e pago no ano', 'Relatórios por classificação, fornecedor e período', 'Vê o próprio setor e todos os que ficam abaixo dele'],
  },
];

const MAIS: Array<{ icone: ReactNode; titulo: string; texto: string; destaque?: boolean }> = [
  { icone: <Database className="size-5" aria-hidden />, titulo: 'Dados abertos do Compras.gov.br', destaque: true, texto: 'Preços praticados, atas de registro de preços e situação de fornecedores, consultados na fonte oficial e mostrados no próprio sistema.' },
  { icone: <MessagesSquare className="size-5" aria-hidden />, titulo: 'CONECTA', texto: 'Mural de comunicação interna, com avisos para setores ou pessoas, comentários e anexos.' },
  { icone: <Package className="size-5" aria-hidden />, titulo: 'Gestão patrimonial', texto: 'Bens, responsáveis, transferências, inventário e relatórios do patrimônio.' },
  { icone: <Gavel className="size-5" aria-hidden />, titulo: 'Notificações à empresa', texto: 'Notificação formal, resposta da empresa e sanções, com o histórico completo.' },
  { icone: <ClipboardCheck className="size-5" aria-hidden />, titulo: 'Ordens de serviço', texto: 'Pedidos de serviço ligados ao contrato, com prioridade e acompanhamento.' },
  { icone: <FileSpreadsheet className="size-5" aria-hidden />, titulo: 'Relatórios', texto: 'Consumo e notas por classificação, fornecedor e período, em PDF e Excel.' },
  { icone: <GraduationCap className="size-5" aria-hidden />, titulo: 'Capacitação de fiscais', texto: 'Curso com lições curtas, gráficos e teste, explicando o papel do fiscal.' },
];

// Destaque: pesquisa de preços nos dados abertos oficiais do Compras.gov.br
function ComprasGov({ abrir, publico }: { abrir: (p: Print) => void; publico: boolean }) {
  const pontos = [
    { icone: <BarChart3 className="size-5" aria-hidden />, titulo: 'Preços praticados', texto: 'Quanto outros órgãos pagaram pelo mesmo item, com menor preço, mediana, média e maior preço calculados na hora.' },
    { icone: <FileText className="size-5" aria-hidden />, titulo: 'Atas de registro de preços', texto: 'Atas vigentes com valor unitário, quantidade registrada, fornecedor e órgão gerenciador.' },
    { icone: <ShieldCheck className="size-5" aria-hidden />, titulo: 'Situação do fornecedor', texto: 'Digite o CNPJ e veja se a empresa está ativa e habilitada a licitar, com porte e atividade.' },
  ];
  return (
    <section id="compras-gov" className="relative mt-12 scroll-mt-24 overflow-hidden rounded-3xl bg-gradient-to-br from-marca-950 via-marca-900 to-marca-800 px-5 py-10 text-white shadow-2xl ring-2 ring-chamada-400/70 sm:px-10 sm:py-14">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-chamada-400/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-acento-400/15 blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-chamada-400 px-3 py-1 text-xs font-bold uppercase tracking-wider text-marca-950">
          <Database className="size-3.5" aria-hidden />Dados abertos do Compras.gov.br
        </span>
        <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          O preço está certo? <span className="bg-gradient-to-r from-chamada-300 to-acento-300 bg-clip-text text-transparent">Compare com o que o governo já pagou.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-marca-100 sm:text-base">
          Preços praticados, atas de registro de preços e situação de fornecedores, consultados na <b className="text-white">fonte oficial</b> e mostrados no próprio sistema.
          Digite o nome do item, escolha na lista e pronto: sem garimpar sites, sem montar planilha.
        </p>
      </div>
      <div className="relative mt-8 grid gap-4 md:grid-cols-3">
        {pontos.map((p) => (
          <div key={p.titulo} className="rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/15 backdrop-blur">
            <span className="flex size-10 items-center justify-center rounded-xl bg-chamada-400/20 text-chamada-300">{p.icone}</span>
            <b className="mt-3 block">{p.titulo}</b>
            <span className="mt-1 block text-sm leading-relaxed text-marca-200">{p.texto}</span>
          </div>
        ))}
      </div>
      <div className="relative mt-10">
        <Imagem print={{ arquivo: 'precos-resultado', legenda: 'Preços praticados: menor preço, mediana, média e maior preço, com cada compra e o órgão comprador' }} abrir={abrir} destaque escuro />
      </div>
      <div className="relative mt-6 grid gap-6 md:grid-cols-2">
        <Imagem print={{ arquivo: 'precos-sugestoes', legenda: 'Busca pelo nome do item no catálogo oficial (CATMAT/CATSER)' }} abrir={abrir} escuro />
        <Imagem print={{ arquivo: 'precos-atas', legenda: 'Atas de registro de preços vigentes para o mesmo item' }} abrir={abrir} escuro />
      </div>
      <p className="relative mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-marca-200">
        <ShieldCheck className="size-3.5 text-acento-300" aria-hidden />Apoio à pesquisa de preços prevista no art. 23 da Lei nº 14.133/2021. Nas telas, empresas e órgãos são fictícios.
      </p>
      {!publico && (
        <div className="relative mt-6 flex justify-center">
          <Link to="/pesquisa-precos" className="inline-flex items-center gap-2 rounded-xl bg-chamada-400 px-5 py-3 text-sm font-bold text-marca-950 shadow-lg hover:bg-chamada-300"><Search className="size-4" aria-hidden />Pesquisar preços agora</Link>
        </div>
      )}
    </section>
  );
}

const SEGURANCA = [
  { icone: <KeyRound className="size-5" aria-hidden />, titulo: 'Cada um vê só o que pode', texto: 'Permissões por função e por setor. Quem só consulta não consegue alterar nada.' },
  { icone: <History className="size-5" aria-hidden />, titulo: 'Tudo fica registrado', texto: 'Cada mudança guarda quem fez, quando e o motivo. Nada é apagado de verdade.' },
  { icone: <Lock className="size-5" aria-hidden />, titulo: 'Dados pessoais protegidos', texto: 'CPF, endereço e outros dados só para quem tem autorização, como manda a LGPD.' },
  { icone: <ShieldCheck className="size-5" aria-hidden />, titulo: 'Acesso com dupla proteção', texto: 'Senha forte e confirmação em duas etapas para quem administra o órgão.' },
];

export function PorQueMeasure({ publico = false }: { publico?: boolean }) {
  const [aberta, setAberta] = useState<Print | null>(null);
  useEffect(() => {
    if (!aberta) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && setAberta(null);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberta]);
  const abrir = (p: Print) => setAberta(p);

  return (
    <div className="-mt-1">
      {/* ------------------------------------------------ abertura */}
      <section data-orientacao="pagina-titulo" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-marca-950 via-marca-900 to-marca-700 px-6 py-10 text-white shadow-xl sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-acento-400/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-chamada-400/15 blur-3xl" aria-hidden />
        <div className="relative grid items-center gap-10 lg:grid-cols-[6fr_6fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider ring-1 ring-white/20">
              <Sparkles className="size-3.5" aria-hidden />Por que usar o MEASURE
            </span>
            <h1 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-[44px]">
              Contrato, dinheiro e pessoas <span className="bg-gradient-to-r from-acento-300 to-chamada-300 bg-clip-text text-transparent">no mesmo lugar.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-marca-100 sm:text-lg">
              O MEASURE acompanha cada contrato do começo ao fim: do cadastro ao pagamento, com o saldo sempre certo, os avisos na hora e os documentos prontos.
              Menos planilha, menos papel, menos retrabalho. Mais controle e mais segurança para quem assina.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#funcionalidades" className="inline-flex items-center gap-2 rounded-xl bg-chamada-400 px-5 py-3 text-sm font-bold text-marca-950 shadow-lg shadow-chamada-500/30 hover:bg-chamada-300">
                Ver o que ele faz<ArrowRight className="size-4" aria-hidden />
              </a>
              {publico ? (
                <Link to="/entrar" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/15">
                  <LogIn className="size-4" aria-hidden />Entrar no sistema
                </Link>
              ) : (
                <Link to="/ajuda" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/15">
                  <BookOpen className="size-4" aria-hidden />Passo a passo do manual
                </Link>
              )}
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="rotate-[1.5deg] transition hover:rotate-0">
              <Imagem print={{ arquivo: 'painel', legenda: 'Painel gerencial' }} abrir={abrir} />
            </div>
          </div>
        </div>
        <div className="relative mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [<Wallet key="w" className="size-5" />, 'Saldo sempre certo', 'Calculado sozinho a cada nota'],
            [<Bell key="b" className="size-5" />, 'Avisos na hora', 'No sistema, no celular e por e-mail'],
            [<FileCheck2 key="f" className="size-5" />, 'Documentos prontos', 'Atesto e checklist gerados sozinhos'],
            [<ShieldCheck key="s" className="size-5" />, 'Seguro e registrado', 'Cada passo fica guardado'],
          ].map(([icone, titulo, sub]) => (
            <div key={String(titulo)} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/15 backdrop-blur">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-acento-400/20 text-acento-300">{icone}</span>
              <span><b className="block text-sm">{titulo}</b><span className="text-xs text-marca-200">{sub}</span></span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ antes e depois */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-acento-600">O que muda no dia a dia</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Do jeito antigo para o jeito MEASURE</h2>
        </div>
        <div className="mt-8 overflow-hidden rounded-3xl ring-1 ring-slate-200">
          <div className="grid grid-cols-2 bg-slate-50 text-xs font-bold uppercase tracking-wider">
            <div className="flex items-center gap-2 px-4 py-3 text-slate-500 sm:px-6"><XCircle className="size-4 text-red-400" aria-hidden />Antes</div>
            <div className="flex items-center gap-2 bg-acento-50 px-4 py-3 text-acento-700 sm:px-6"><CheckCircle2 className="size-4" aria-hidden />Com o MEASURE</div>
          </div>
          {ANTES_DEPOIS.map(([antes, depois]) => (
            <div key={antes} className="grid grid-cols-2 border-t border-slate-100 text-sm">
              <div className="px-4 py-3.5 text-slate-500 sm:px-6">{antes}</div>
              <div className="bg-acento-50/40 px-4 py-3.5 font-medium text-slate-800 sm:px-6">{depois}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ perfis */}
      <section className="rounded-3xl bg-gradient-to-b from-marca-50 to-white px-4 py-12 ring-1 ring-marca-100 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-acento-600">Feito para cada função</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Cada pessoa vê o que precisa para trabalhar</h2>
          <p className="mt-3 text-[15px] text-slate-600">O menu e as telas mudam conforme a função de cada um. Ninguém se perde com o que não usa.</p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {PERFIS.map((p) => (
            <article key={p.titulo} className="flex flex-col rounded-3xl bg-white p-6 shadow-[0_18px_40px_-24px_rgba(15,42,74,0.5)] ring-1 ring-slate-200">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-marca-700 to-marca-500 text-white shadow-md">{p.icone}</span>
              <h3 className="mt-4 text-xl font-extrabold text-slate-900">{p.titulo}</h3>
              <p className="text-sm text-slate-500">{p.subtitulo}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {p.itens.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-acento-600" aria-hidden />{t}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ funcionalidades */}
      <div id="funcionalidades" className="scroll-mt-24 pt-14 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-acento-600">Funcionalidades</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Veja o MEASURE funcionando</h2>
        <p className="mx-auto mt-3 max-w-2xl text-[15px] text-slate-600">As telas abaixo são de um órgão de exemplo, com nomes e valores inventados. Toque em qualquer imagem para ampliar.</p>
      </div>
      <div className="divide-y divide-slate-200">
        <Bloco icone={<Home className="size-3.5" />} sobre="Página inicial" titulo="Você abre o sistema e já sabe o que fazer"
          texto="A página inicial mostra o caminho do trabalho, do contrato ao pagamento, e coloca em destaque o que está esperando por você: notas para conferir, pagamentos para dar baixa, prazos chegando."
          itens={['Passo a passo do contrato ao pagamento, sempre à vista', 'O que depende de você aparece em amarelo, com o botão para resolver', 'Atalhos para as tarefas mais usadas']}
          prints={[{ arquivo: 'inicio', legenda: 'Página inicial com as pendências e o fluxo de trabalho' }]} abrir={abrir} />
        <Bloco invertido icone={<Wallet className="size-3.5" />} sobre="Contratos e saldo" cor="acento" titulo="O saldo de cada contrato, sem fazer conta"
          texto={<>Cada contrato mostra o <b>valor global</b> (com os aditivos), o <b>valor usado</b> pelas notas e o <b>saldo que sobra</b>, com uma barra de uso. As etapas que faltam aparecem no topo da ficha.</>}
          itens={['Valor global, empenhado, usado, pago e saldo atualizados a cada nota', 'Aditivos de valor e de prazo já entram na conta', 'Gestor, fiscal e suplente designados com portaria', 'Contratos perto do vencimento destacados na lista']}
          prints={[{ arquivo: 'contrato', legenda: 'Ficha do contrato: etapas, saldo e execução financeira' }, { arquivo: 'contratos', legenda: 'Lista de contratos com o saldo de cada um' }]} abrir={abrir} />
        <Bloco icone={<Receipt className="size-3.5" />} sobre="Notas e atesto" cor="chamada" titulo="Nota lançada, conferida e atestada em poucos cliques"
          texto="A nota é lançada ligada ao contrato e ao empenho. Na mesma hora, gestor, fiscal e suplente recebem o aviso por e-mail. Quem confere encontra o texto de atesto já escrito pelo sistema, no modelo do órgão, e o atesto fica registrado com o nome e a data."
          itens={['Notas esperando o seu atesto em destaque', 'Texto de atesto gerado automaticamente, pronto para copiar no processo', 'Checklist da nota gerado automaticamente, com os dados já preenchidos', 'Aviso de responsabilidade antes de atestar']}
          prints={[{ arquivo: 'atesto', legenda: 'Atesto da nota com o texto pronto no modelo do órgão' }, { arquivo: 'notas', legenda: 'Notas com a situação de atesto e de pagamento' }]} abrir={abrir} />
        <section className="py-10">
          <div className="mx-auto mb-6 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-acento-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-acento-700 ring-1 ring-acento-100">
              <Wand2 className="size-3.5" aria-hidden />Papel pronto, sem digitar
            </span>
            <h3 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[28px]">O sistema escreve o atesto e monta o checklist para você</h3>
            <p className="mt-2 text-[15px] text-slate-600">Veja, passo a passo, o que o MEASURE gera sozinho a partir dos dados que já estão cadastrados.</p>
          </div>
          <Slides abrir={abrir} />
        </section>
        <Bloco invertido icone={<Banknote className="size-3.5" />} sobre="Pagamentos" titulo="Fila de pagamento na ordem certa"
          texto="As notas atestadas entram numa fila, separada por fonte de recurso, na ordem do atesto, como pede a Lei 14.133/2021 (art. 141). É só dar baixa de cima para baixo, com as retenções e a data."
          itens={['Fila separada por fonte de recurso, com a posição de cada nota', 'Quantos dias cada nota está esperando', 'Pagamento parcial e retenções calculados', 'Total a pagar sempre à vista']}
          prints={[{ arquivo: 'pagamentos', legenda: 'Fila de pagamentos por fonte de recurso' }]} abrir={abrir} />
        <Bloco icone={<CalendarCheck2 className="size-3.5" />} sobre="Consolidado mensal" cor="acento" titulo="Frequência dos servidores pronta para imprimir"
          texto="Escolha o setor e o mês: a lista de servidores aparece em ordem alfabética. Lance atrasos e faltas, marque as justificativas e emita o consolidado em PDF, já no formato do órgão."
          itens={['Lista montada sozinha com quem estava ativo no mês', 'Observações automáticas (nomeação, exoneração, férias, justificativa)', 'Documento em A4 paisagem, pronto para assinar', 'Histórico dos consolidados já emitidos']}
          prints={[{ arquivo: 'consolidado', legenda: 'Consolidado mensal com atrasos, faltas e justificativas' }]} abrir={abrir} />
        <Bloco invertido icone={<BarChart3 className="size-3.5" />} sobre="Painel gerencial" titulo="Os números do setor num lugar só"
          texto="Para quem decide: contratos vigentes e a vencer, quanto foi empenhado, usado e pago no ano, notas emitidas por mês e o consumo por ação do orçamento. Tudo calculado na hora."
          itens={['Gráficos de execução orçamentária e de notas por mês', 'Contratos perto do vencimento com o saldo de cada um', 'Pendências de atesto e de pagamento em destaque', 'Cada chefia vê o próprio setor e os que ficam abaixo dele']}
          prints={[{ arquivo: 'painel', legenda: 'Painel gerencial com indicadores e gráficos' }]} abrir={abrir} />
        <Bloco icone={<Mail className="size-3.5" />} sobre="E-mail aos responsáveis" cor="chamada" titulo="Cada novidade do contrato chega no e-mail de quem é responsável"
          texto={<>Toda informação nova incluída no contrato (nota recebida, atesto, pagamento, aditivo, mudança de vigência, troca de responsável, documento anexado) gera na hora um <b>e-mail</b> para o gestor, o fiscal e o suplente designados. Ninguém precisa ficar perguntando: o aviso vai até a pessoa.</>}
          itens={['E-mail automático para gestor, fiscal e suplente do contrato', 'Mostra o que aconteceu, o número do contrato e um botão para abrir direto no sistema', 'Cada pessoa escolhe quais avisos quer receber; os importantes sempre chegam', 'A administração acompanha os envios e pode ligar ou desligar o e-mail do órgão']}
          prints={[{ arquivo: 'slide-email', legenda: 'E-mail que o responsável recebe quando chega uma nota nova' }]} abrir={abrir} />
        <Bloco invertido icone={<Bell className="size-3.5" />} sobre="Avisos" titulo="O sistema avisa antes de virar problema"
          texto="Nota para conferir, contrato perto de vencer, empenho com pouco saldo: o aviso aparece no sininho, chega no celular mesmo com o sistema fechado e vai por e-mail para os responsáveis."
          itens={['Avisos de atesto, vencimento, pagamento e saldo baixo', 'Notificação no celular, no computador e por e-mail', 'Um toque no aviso leva direto para a tela certa']}
          prints={[{ arquivo: 'avisos', legenda: 'Avisos no sininho do sistema' }, { arquivo: 'meus-contratos', legenda: '"Meus contratos": o que o gestor e o fiscal acompanham' }]} abrir={abrir} />
      </div>

      {/* ------------------------------------------------ destaque: dados abertos do Compras.gov.br */}
      <ComprasGov abrir={abrir} publico={publico} />

      {/* ------------------------------------------------ e mais */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-acento-600">E tem mais</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Outros módulos que ajudam a gestão</h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MAIS.map((m) => m.destaque ? (
            <a key={m.titulo} href="#compras-gov" className="flex gap-4 rounded-2xl bg-gradient-to-br from-marca-950 to-marca-800 p-5 text-white shadow-lg ring-2 ring-chamada-400 transition hover:-translate-y-0.5 hover:shadow-xl">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-chamada-400 text-marca-950">{m.icone}</span>
              <span>
                <span className="mb-1 inline-block rounded-full bg-chamada-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-marca-950">Destaque</span>
                <b className="block">{m.titulo}</b><span className="text-sm text-marca-100">{m.texto}</span>
                <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-chamada-300">Ver as telas<ArrowRight className="size-3.5" aria-hidden /></span>
              </span>
            </a>
          ) : (
            <div key={m.titulo} className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-700 ring-1 ring-marca-100">{m.icone}</span>
              <span><b className="block text-slate-900">{m.titulo}</b><span className="text-sm text-slate-600">{m.texto}</span></span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ segurança e celular */}
      <section className="grid gap-5 lg:grid-cols-[7fr_5fr]">
        <div className="rounded-3xl bg-marca-950 p-7 text-white sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider ring-1 ring-white/20"><ShieldCheck className="size-3.5" aria-hidden />Segurança</span>
          <h2 className="mt-3 text-2xl font-extrabold">Mais segurança para quem assina</h2>
          <p className="mt-2 text-sm leading-relaxed text-marca-200">Cada passo fica registrado. Se alguém perguntar quem atestou, quem pagou ou quem mudou um valor, a resposta está no sistema.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {SEGURANCA.map((s) => (
              <div key={s.titulo} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                <span className="flex size-9 items-center justify-center rounded-lg bg-acento-400/20 text-acento-300">{s.icone}</span>
                <b className="mt-3 block text-sm">{s.titulo}</b>
                <span className="text-xs leading-relaxed text-marca-200">{s.texto}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-3xl bg-gradient-to-br from-acento-50 to-white p-7 ring-1 ring-acento-100 sm:p-9">
          <div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-acento-600 text-white shadow-md"><Smartphone className="size-6" aria-hidden /></span>
            <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Funciona no celular</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
              Dá para conferir uma nota, ver o saldo de um contrato ou receber um aviso de qualquer lugar. As telas se ajustam ao celular e os avisos chegam mesmo com o sistema fechado.
            </p>
          </div>
          <ul className="mt-5 flex flex-col gap-2 text-sm text-slate-700">
            {['Telas que se ajustam ao celular', 'Avisos no celular com um toque', 'Balões de ajuda em cada tela'].map((t) => (
              <li key={t} className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-acento-600" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------ convite final */}
      <section className="relative mt-12 overflow-hidden rounded-3xl bg-gradient-to-r from-marca-800 via-marca-700 to-marca-600 px-6 py-10 text-center text-white sm:px-10">
        <div className="pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-acento-400/20 blur-3xl" aria-hidden />
        <h2 className="relative text-2xl font-extrabold sm:text-3xl">Pronto para começar?</h2>
        {publico ? (
          <>
            <p className="relative mx-auto mt-2 max-w-xl text-marca-100">Já tem acesso? Entre com o e-mail institucional e a senha cadastrados pelo seu órgão.</p>
            <div className="relative mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/entrar" className="inline-flex items-center gap-2 rounded-xl bg-chamada-400 px-5 py-3 text-sm font-bold text-marca-950 shadow-lg hover:bg-chamada-300"><LogIn className="size-4" aria-hidden />Entrar no sistema</Link>
            </div>
          </>
        ) : (<>
        <p className="relative mx-auto mt-2 max-w-xl text-marca-100">Comece pela página inicial: ela mostra o que está esperando por você. Se ficar com dúvida, toque na bússola no topo para ver os balões de ajuda.</p>
        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-chamada-400 px-5 py-3 text-sm font-bold text-marca-950 shadow-lg hover:bg-chamada-300"><Home className="size-4" aria-hidden />Ir para o início</Link>
          <Link to="/ajuda" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/15"><BookOpen className="size-4" aria-hidden />Manual passo a passo</Link>
          <Link to="/ajuda/capacitacao" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/15"><GraduationCap className="size-4" aria-hidden />Capacitação de fiscais</Link>
        </div>
        </>)}
      </section>
      <p className="mt-4 text-center text-xs text-slate-400">As telas desta página usam um órgão de exemplo com dados fictícios. <Users className="inline size-3" aria-hidden /> Nenhum dado real de servidores ou empresas foi usado.</p>

      {/* ------------------------------------------------ imagem ampliada */}
      {aberta && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-marca-950/85 p-3 backdrop-blur-sm sm:p-8" onClick={() => setAberta(null)} role="dialog" aria-modal="true" aria-label={aberta.legenda}>
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white ring-1 ring-white/20 hover:bg-white/20" aria-label="Fechar"><X className="size-5" /></button>
          <figure className="max-h-full max-w-6xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img src={img(aberta.arquivo)} alt={aberta.legenda} className="mx-auto rounded-xl shadow-2xl" />
            <figcaption className="mt-3 text-center text-sm text-marca-100">{aberta.legenda}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

/** Versão aberta ao público (sem login): mesma apresentação, com um topo simples e o botão de entrar */
export function PorQueMeasurePublico() {
  useEffect(() => { const t = document.title; document.title = 'Por que usar o MEASURE'; return () => { document.title = t; }; }, []);
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/entrar" aria-label="MEASURE: ir para a tela de entrada"><LogoCompleto className="h-10 w-auto" /></Link>
          <Link to="/entrar" className="inline-flex items-center gap-2 rounded-xl bg-marca-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-marca-800">
            <LogIn className="size-4" aria-hidden />Entrar
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"><PorQueMeasure publico /></main>
      <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
        Desenvolvido por <a href="https://measuresistemas.com.br/" target="_blank" rel="noopener" className="font-semibold text-marca-700 underline-offset-2 hover:underline">MEASURE Sistemas</a>
      </footer>
    </div>
  );
}
