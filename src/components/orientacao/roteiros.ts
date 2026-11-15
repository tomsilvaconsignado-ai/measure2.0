// Roteiros dos balões de orientação: o que mostrar em cada tela, de acordo com o papel e as permissões.
// "alvo" aponta para elementos marcados com data-orientacao="..." (sem alvo, o balão aparece no centro).
// Passo cujo alvo não existe na tela (ex.: botão que o papel não vê) é pulado.
import type { Acao, Papel, Recurso } from '@/lib/tipos';

export interface ContextoOrientacao {
  pode: (recurso: Recurso, acao: Acao) => boolean;
  papeis: Papel[];
  ehPlataforma: boolean;
  temOrgao: boolean;
}

export interface Passo {
  /** seletores CSS; vale o primeiro visível (ex.: menu lateral no computador, botão do menu no celular) */
  alvo?: string | string[];
  titulo: string;
  texto: string | ((c: ContextoOrientacao) => string);
  quando?: (c: ContextoOrientacao) => boolean;
}

export interface Roteiro {
  chave: string;
  rota: (caminho: string) => boolean;
  passos: Passo[];
}

const a = (nome: string) => `[data-orientacao="${nome}"]`;
const TITULO = a('pagina-titulo');
const ACOES = a('pagina-acoes');
const BUSCA = a('busca');
const exato = (r: string) => (c: string) => c === r;
const soLeitura = (c: ContextoOrientacao) =>
  c.papeis.length > 0 && c.papeis.every((p) => ['GESTAO_MUNICIPAL', 'SECRETARIO', 'DIRETOR', 'COORDENADOR'].includes(p));

/** Apresentação geral: mostrada uma vez por acesso, antes da primeira tela */
export const GERAL: Roteiro = {
  chave: 'geral',
  rota: () => true,
  passos: [
    { alvo: [a('menu'), a('menu-celular')], titulo: 'Menu principal',
      texto: 'Aqui ficam os módulos que o seu papel permite usar. Um número amarelo ao lado do item indica pendências esperando por você.' },
    { alvo: a('orgao'), titulo: 'Órgão e papel', quando: (c) => c.temOrgao,
      texto: 'Mostra o órgão em uso e o seu papel. Se você tem acesso a mais de um órgão, troque por aqui.' },
    { alvo: a('notificacoes'), titulo: 'Notificações',
      texto: 'Avisos de prazos, atestos e pagamentos chegam neste sino. No celular, você também pode receber na hora.' },
    { alvo: a('perfil'), titulo: 'Meu perfil',
      texto: 'Foto, senha e verificação em duas etapas. Também é aqui que você liga ou desliga estes balões.' },
    { alvo: a('botao-orientacoes'), titulo: 'Rever as orientações',
      texto: 'Quando quiser rever as dicas da tela em que está, toque neste botão.' },
  ],
};

export const ROTEIROS: Roteiro[] = [
  {
    chave: 'inicio', rota: exato('/'),
    passos: [
      { alvo: TITULO, titulo: 'Sua página inicial', texto: 'Resume o que está pendente para você, do contrato ao pagamento.' },
      { titulo: 'O caminho do trabalho', quando: (c) => c.pode('contratos', 'criar'),
        texto: 'Contrato → responsáveis e dotação → empenho → nota fiscal → atesto → pagamento. Os botões em amarelo mostram o que depende de você agora.' },
      { titulo: 'Acompanhar a sua unidade', quando: soLeitura,
        texto: 'Seu papel acompanha e exporta. Use "Painel gerencial" e "Consulta e relatórios" no menu para ver a sua unidade e as que ficam abaixo dela.' },
      { titulo: 'Atestos', quando: (c) => !c.pode('contratos', 'criar'),
        texto: 'Se você for gestor, fiscal ou suplente de algum contrato, as notas para atestar aparecem em destaque aqui e em "Meus contratos".' },
    ],
  },
  {
    chave: 'contratos', rota: exato('/contratos'),
    passos: [
      { alvo: TITULO, titulo: 'Contratos', texto: 'Lista os contratos da sua unidade e das unidades abaixo dela.' },
      { alvo: BUSCA, titulo: 'Encontrar um contrato', texto: 'Busque pelo número, pelo objeto ou pelo fornecedor.' },
      { alvo: ACOES, titulo: 'Novo contrato', quando: (c) => c.pode('contratos', 'criar'),
        texto: 'Cadastre o contrato com fornecedor, vigência e valor. A ficha abre mostrando as etapas que faltam.' },
      { titulo: 'Ficha do contrato', quando: (c) => c.pode('contratos', 'editar'),
        texto: 'Toque num contrato para abrir a ficha: lá você designa gestor, fiscal e suplente, adiciona a dotação e lança empenhos e notas pelas "Etapas do contrato".' },
      { titulo: 'Consulta', quando: (c) => !c.pode('contratos', 'editar'),
        texto: 'Toque num contrato para ver a ficha completa: responsáveis, empenhos, notas e pagamentos.' },
    ],
  },
  {
    chave: 'meus-contratos', rota: exato('/meus-contratos'),
    passos: [
      { alvo: TITULO, titulo: 'Meus contratos', texto: 'Aqui aparecem só os contratos em que você foi designado como gestor, fiscal ou suplente.' },
      { titulo: 'Atestar notas',
        texto: 'Quando houver nota fiscal para atestar, ela aparece em destaque. Confira a execução antes: o atesto fica registrado com o seu nome e a data.' },
      { alvo: a('menu:/ajuda/capacitacao'), titulo: 'Capacitação de fiscais',
        texto: 'Dúvidas sobre o papel de gestor ou fiscal? A capacitação explica em linguagem simples, com a lei ao lado.' },
    ],
  },
  {
    chave: 'empenhos', rota: exato('/empenhos'),
    passos: [
      { alvo: TITULO, titulo: 'Empenhos', texto: 'Os empenhos dos contratos da sua unidade, com saldo e reforços.' },
      { alvo: BUSCA, titulo: 'Busca', texto: 'Encontre pelo número do empenho, pelo contrato ou pelo fornecedor.' },
      { alvo: ACOES, titulo: 'Lançar empenho', quando: (c) => c.pode('empenhos', 'criar'),
        texto: 'Preencha como na nota de empenho. Dica: pela ficha do contrato, o botão da etapa já abre o empenho com o contrato escolhido.' },
      { titulo: 'Reforço', quando: (c) => c.pode('empenhos', 'editar'),
        texto: 'Para aumentar o valor de um empenho, use o reforço na própria ficha dele.' },
    ],
  },
  {
    chave: 'notas', rota: exato('/notas'),
    passos: [
      { alvo: TITULO, titulo: 'Notas fiscais e execução', texto: 'Todas as notas, do lançamento ao pagamento.' },
      { alvo: a('menu:/notas'), titulo: 'Notas para atestar',
        texto: 'O número amarelo no menu mostra quantas notas esperam o seu atesto. Elas aparecem em destaque na lista.' },
      { alvo: ACOES, titulo: 'Lançar nota fiscal', quando: (c) => c.pode('notas_fiscais', 'criar'),
        texto: 'Lance a nota escolhendo contrato e empenho. Depois do atesto, ela segue para a fila de pagamentos.' },
      { titulo: 'Checklist', quando: (c) => c.pode('notas_fiscais', 'editar'),
        texto: 'Depois do atesto, emita o checklist da nota: ele reúne as conferências e vira um documento histórico.' },
    ],
  },
  {
    chave: 'pagamentos', rota: exato('/pagamentos'),
    passos: [
      { alvo: TITULO, titulo: 'Fila de pagamentos', texto: 'As notas atestadas entram aqui, na ordem cronológica de exigibilidade.' },
      { titulo: 'Dar baixa', texto: 'Informe a data, as retenções e o valor pago. O líquido é calculado e a nota sai da fila.' },
    ],
  },
  {
    chave: 'fornecedores', rota: exato('/fornecedores'),
    passos: [
      { alvo: TITULO, titulo: 'Fornecedores', texto: 'Empresas e pessoas contratadas pelo órgão.' },
      { alvo: ACOES, titulo: 'Novo fornecedor', quando: (c) => c.pode('fornecedores', 'criar'),
        texto: 'Digite o CNPJ: razão social e endereço são preenchidos sozinhos. As contas bancárias ficam na ficha.' },
      { alvo: BUSCA, titulo: 'Busca', texto: 'Encontre pelo nome, pelo nome fantasia ou pelo CNPJ.' },
    ],
  },
  {
    chave: 'servidores', rota: (c) => c.startsWith('/servidores'),
    passos: [
      { alvo: TITULO, titulo: 'Servidores', texto: 'Cadastro dos servidores, com lotação, frequência, férias e aniversariantes.' },
      { alvo: BUSCA, titulo: 'Busca', texto: 'Encontre pelo nome ou pela matrícula.' },
      { titulo: 'Dados pessoais protegidos',
        texto: 'CPF, endereço e outros dados sensíveis só aparecem para quem tem permissão, como manda a LGPD.' },
    ],
  },
  {
    chave: 'relatorios', rota: exato('/relatorios'),
    passos: [
      { alvo: TITULO, titulo: 'Consulta e relatórios', texto: 'Monte consultas com filtros e exporte em PDF ou planilha.' },
      { titulo: 'Filtros', texto: 'Combine período, unidade, fornecedor e situação. O resultado respeita o seu escopo de acesso.' },
    ],
  },
  {
    chave: 'painel', rota: exato('/painel'),
    passos: [
      { alvo: TITULO, titulo: 'Painel gerencial', texto: 'Indicadores da sua unidade: execução, vencimentos e pendências, num só lugar.' },
    ],
  },
  {
    chave: 'ordens-servico', rota: exato('/ordens-servico'),
    passos: [
      { alvo: TITULO, titulo: 'Ordens de serviço', texto: 'Registre e acompanhe as ordens de serviço emitidas para os contratos.' },
      { alvo: ACOES, titulo: 'Nova ordem', quando: (c) => c.pode('ordens_servico', 'criar'), texto: 'Crie a ordem ligada ao contrato e ao tipo de serviço.' },
    ],
  },
  {
    chave: 'notificacoes-contratuais', rota: (c) => c.startsWith('/notificacoes-contratuais'),
    passos: [
      { alvo: TITULO, titulo: 'Notificações e ocorrências', texto: 'Notificações formais às empresas, respostas e sanções, com a trilha completa de cada uma.' },
    ],
  },
  {
    chave: 'usuarios', rota: exato('/usuarios'),
    passos: [
      { alvo: TITULO, titulo: 'Usuários e acessos', texto: 'Quem acessa o órgão, com o papel e a unidade de cada pessoa.' },
      { alvo: ACOES, titulo: 'Convidar', quando: (c) => c.pode('usuarios', 'criar'),
        texto: 'Informe e-mail, unidade e papel. A pessoa recebe o convite por e-mail para criar a senha.' },
      { alvo: BUSCA, titulo: 'Busca', texto: 'Encontre pelo nome ou pelo e-mail.' },
      { titulo: 'Ações por pessoa', quando: (c) => c.pode('usuarios', 'editar'),
        texto: 'No botão "⋯" de cada pessoa: reenviar o convite, suspender o acesso (com motivo) e reativar os balões de orientação.' },
    ],
  },
  {
    chave: 'meu-perfil', rota: exato('/meu-perfil'),
    passos: [
      { alvo: TITULO, titulo: 'Meu perfil', texto: 'Seus dados e o seu acesso. Papéis e unidades são definidos pela administração do órgão.' },
      { alvo: a('perfil-orientacoes'), titulo: 'Balões de orientação', texto: 'Ligue ou desligue estes balões quando quiser.' },
    ],
  },
  {
    chave: 'minhas-notificacoes', rota: exato('/minhas-notificacoes'),
    passos: [
      { alvo: TITULO, titulo: 'Minhas notificações', texto: 'O histórico dos avisos enviados para você. Ative as notificações no celular para recebê-los na hora.' },
    ],
  },
  {
    chave: 'ajuda', rota: exato('/ajuda'),
    passos: [
      { alvo: TITULO, titulo: 'Ajuda e manual', texto: 'O passo a passo de cada módulo.' },
      { alvo: BUSCA, titulo: 'Busca no manual', texto: 'Digite o que procura, por exemplo "atesto" ou "empenho".' },
    ],
  },
  {
    chave: 'configuracoes', rota: exato('/configuracoes'),
    passos: [
      { alvo: TITULO, titulo: 'Configurações do órgão', texto: 'Identidade visual, regras do órgão e cópia de segurança dos dados.' },
    ],
  },
  {
    chave: 'auditoria', rota: exato('/auditoria'),
    passos: [
      { alvo: TITULO, titulo: 'Auditoria', texto: 'Tudo o que foi criado, alterado ou suspenso, com quem fez, quando e o motivo.' },
    ],
  },
  {
    chave: 'estrutura', rota: exato('/estrutura'),
    passos: [
      { alvo: TITULO, titulo: 'Estrutura organizacional', texto: 'Secretarias, diretorias e coordenações. O acesso de cada pessoa vale para a unidade dela e as que ficam abaixo.' },
    ],
  },
];

/** Telas sem roteiro próprio: um balão sobre o título explicando o básico */
export function roteiroGenerico(caminho: string, tituloDaTela: string | null): Roteiro | null {
  if (!tituloDaTela) return null;
  return {
    chave: 'tela:' + caminho,
    rota: () => true,
    passos: [{ alvo: TITULO, titulo: tituloDaTela,
      texto: 'Os botões das ações principais ficam neste cabeçalho, e a lista abaixo mostra os registros que o seu acesso permite ver.' }],
  };
}

export function roteiroDaTela(caminho: string): Roteiro | undefined {
  return ROTEIROS.find((r) => r.rota(caminho));
}
