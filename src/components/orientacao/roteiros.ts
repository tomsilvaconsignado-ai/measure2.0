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
      texto: 'Aqui estão todas as partes do sistema que você pode usar. Quando aparecer um número amarelo do lado, é porque tem coisa esperando por você.' },
    { alvo: a('orgao'), titulo: 'Órgão e papel', quando: (c) => c.temOrgao,
      texto: 'Aqui aparece o órgão em que você está trabalhando e a sua função. Se você trabalha em mais de um órgão, é só tocar aqui para trocar.' },
    { alvo: a('notificacoes'), titulo: 'Notificações',
      texto: 'Os avisos chegam neste sininho: prazo vencendo, nota para conferir, pagamento feito. Dá para receber no celular também.' },
    { alvo: a('perfil'), titulo: 'Meu perfil',
      texto: 'Aqui você troca sua foto e sua senha. É aqui também que você liga ou desliga estes balões de ajuda.' },
    { alvo: a('botao-orientacoes'), titulo: 'Ver a ajuda de novo',
      texto: 'Ficou com dúvida em alguma tela? Toque nesta bússola e as dicas daquela tela aparecem de novo.' },
  ],
};

export const ROTEIROS: Roteiro[] = [
  {
    chave: 'inicio', rota: exato('/'),
    passos: [
      { alvo: TITULO, titulo: 'Sua tela inicial', texto: 'Aqui você vê, de um jeito resumido, o que está esperando por você.' },
      { titulo: 'O passo a passo do trabalho', quando: (c) => c.pode('contratos', 'criar'),
        texto: 'O caminho é sempre este: cadastrar o contrato, escolher quem vai acompanhar, separar o dinheiro (empenho), lançar a nota, conferir (atestar) e pagar. O que estiver em amarelo é o que falta você fazer.' },
      { titulo: 'Acompanhar o seu setor', quando: soLeitura,
        texto: 'Sua função é acompanhar. No menu, use "Painel gerencial" para ver os números e "Consulta e relatórios" para tirar relatórios do seu setor.' },
      { titulo: 'Conferir notas', quando: (c) => !c.pode('contratos', 'criar'),
        texto: 'Se você foi escolhido para acompanhar algum contrato (gestor, fiscal ou suplente), as notas que você precisa conferir aparecem aqui e em "Meus contratos".' },
    ],
  },
  {
    chave: 'contratos', rota: exato('/contratos'),
    passos: [
      { alvo: TITULO, titulo: 'Contratos', texto: 'Aqui estão todos os contratos do seu setor.' },
      { alvo: BUSCA, titulo: 'Procurar um contrato', texto: 'Digite o número do contrato, o nome da empresa ou o que foi contratado.' },
      { alvo: ACOES, titulo: 'Novo contrato', quando: (c) => c.pode('contratos', 'criar'),
        texto: 'Toque aqui para cadastrar um contrato novo. Informe a empresa, as datas e o valor. Depois o sistema mostra o que ainda falta fazer.' },
      { titulo: 'Dentro do contrato', quando: (c) => c.pode('contratos', 'editar'),
        texto: 'Toque num contrato para abrir. Lá dentro você escolhe quem vai acompanhar, diz de onde sai o dinheiro e lança empenhos e notas, seguindo as etapas que aparecem.' },
      { titulo: 'Ver um contrato', quando: (c) => !c.pode('contratos', 'editar'),
        texto: 'Toque num contrato para ver tudo dele: quem acompanha, quanto foi separado, as notas e os pagamentos.' },
    ],
  },
  {
    chave: 'meus-contratos', rota: exato('/meus-contratos'),
    passos: [
      { alvo: TITULO, titulo: 'Meus contratos', texto: 'Aqui aparecem só os contratos que você foi escolhido para acompanhar.' },
      { titulo: 'Conferir as notas',
        texto: 'Quando chegar uma nota para você conferir, ela aparece em destaque. Antes de confirmar, veja se o serviço foi feito mesmo. Sua confirmação fica guardada com seu nome e a data.' },
      { alvo: a('menu:/ajuda/capacitacao'), titulo: 'Curso para fiscais',
        texto: 'Ficou com dúvida sobre o que o fiscal faz? Aqui tem um curso curtinho, explicado de um jeito fácil.' },
    ],
  },
  {
    chave: 'empenhos', rota: exato('/empenhos'),
    passos: [
      { alvo: TITULO, titulo: 'Empenhos', texto: 'Empenho é o dinheiro separado para pagar um contrato. Aqui você vê quanto foi separado e quanto ainda sobra.' },
      { alvo: BUSCA, titulo: 'Procurar', texto: 'Digite o número do empenho, do contrato ou o nome da empresa.' },
      { alvo: ACOES, titulo: 'Lançar empenho', quando: (c) => c.pode('empenhos', 'criar'),
        texto: 'Toque aqui para lançar um empenho novo. Copie os dados da nota de empenho. Dica: começando pelo contrato, metade já vem preenchida.' },
      { titulo: 'Precisa de mais dinheiro?', quando: (c) => c.pode('empenhos', 'editar'),
        texto: 'Se o valor separado não deu, abra o empenho e use o "reforço" para aumentar.' },
    ],
  },
  {
    chave: 'notas', rota: exato('/notas'),
    passos: [
      { alvo: TITULO, titulo: 'Notas fiscais', texto: 'Aqui ficam todas as notas: das que acabaram de chegar até as que já foram pagas.' },
      { alvo: a('menu:/notas'), titulo: 'Notas esperando você',
        texto: 'O número amarelo aqui no menu mostra quantas notas estão esperando você conferir.' },
      { alvo: ACOES, titulo: 'Lançar nota fiscal', quando: (c) => c.pode('notas_fiscais', 'criar'),
        texto: 'Toque aqui para lançar uma nota que chegou. Escolha o contrato e o empenho. Depois de conferida, ela vai sozinha para a fila de pagamento.' },
      { titulo: 'Lista de conferência', quando: (c) => c.pode('notas_fiscais', 'editar'),
        texto: 'Depois que a nota for conferida, gere a lista de conferência (checklist). Ela fica guardada como comprovante.' },
    ],
  },
  {
    chave: 'pagamentos', rota: exato('/pagamentos'),
    passos: [
      { alvo: TITULO, titulo: 'Fila de pagamento', texto: 'As notas já conferidas esperam aqui para serem pagas, na ordem em que chegaram.' },
      { titulo: 'Registrar o pagamento', texto: 'Depois de pagar, informe a data e os descontos (retenções). O sistema faz a conta e tira a nota da fila.' },
    ],
  },
  {
    chave: 'fornecedores', rota: exato('/fornecedores'),
    passos: [
      { alvo: TITULO, titulo: 'Fornecedores', texto: 'Aqui estão as empresas e pessoas que prestam serviço ou vendem para o órgão.' },
      { alvo: ACOES, titulo: 'Novo fornecedor', quando: (c) => c.pode('fornecedores', 'criar'),
        texto: 'Toque aqui para cadastrar. É só digitar o CNPJ que o nome e o endereço da empresa aparecem sozinhos.' },
      { alvo: BUSCA, titulo: 'Procurar', texto: 'Digite o nome da empresa ou o CNPJ.' },
    ],
  },
  {
    chave: 'servidores', rota: (c) => c.startsWith('/servidores'),
    passos: [
      { alvo: TITULO, titulo: 'Servidores', texto: 'Aqui ficam os dados das pessoas que trabalham no órgão: onde trabalham, frequência, férias e aniversários.' },
      { alvo: BUSCA, titulo: 'Procurar', texto: 'Digite o nome ou a matrícula da pessoa.' },
      { titulo: 'Dados protegidos',
        texto: 'CPF, endereço e outros dados pessoais só aparecem para quem tem autorização. É a lei de proteção de dados (LGPD).' },
    ],
  },
  {
    chave: 'relatorios', rota: exato('/relatorios'),
    passos: [
      { alvo: TITULO, titulo: 'Relatórios', texto: 'Aqui você tira relatórios e baixa em PDF ou em planilha.' },
      { titulo: 'Escolha o que quer ver', texto: 'Escolha o período, o setor, a empresa e o que mais precisar. Só aparece o que você tem autorização para ver.' },
    ],
  },
  {
    chave: 'painel', rota: exato('/painel'),
    passos: [
      { alvo: TITULO, titulo: 'Painel gerencial', texto: 'Os principais números do seu setor num lugar só: quanto foi gasto, o que vai vencer e o que está atrasado.' },
    ],
  },
  {
    chave: 'ordens-servico', rota: exato('/ordens-servico'),
    passos: [
      { alvo: TITULO, titulo: 'Ordens de serviço', texto: 'Aqui você registra e acompanha os pedidos de serviço feitos para as empresas contratadas.' },
      { alvo: ACOES, titulo: 'Nova ordem', quando: (c) => c.pode('ordens_servico', 'criar'), texto: 'Toque aqui para criar um pedido de serviço. Escolha o contrato e o tipo de serviço.' },
    ],
  },
  {
    chave: 'notificacoes-contratuais', rota: (c) => c.startsWith('/notificacoes-contratuais'),
    passos: [
      { alvo: TITULO, titulo: 'Notificações e ocorrências', texto: 'Quando uma empresa não cumpre o combinado, você avisa por aqui. Fica tudo guardado: o aviso, a resposta e a punição, se tiver.' },
    ],
  },
  {
    chave: 'usuarios', rota: exato('/usuarios'),
    passos: [
      { alvo: TITULO, titulo: 'Usuários', texto: 'Aqui estão as pessoas que usam o sistema, com a função e o setor de cada uma.' },
      { alvo: ACOES, titulo: 'Chamar alguém', quando: (c) => c.pode('usuarios', 'criar'),
        texto: 'Toque aqui para convidar uma pessoa. Coloque o e-mail, o setor e a função. Ela recebe um e-mail para criar a senha.' },
      { alvo: BUSCA, titulo: 'Procurar', texto: 'Digite o nome ou o e-mail da pessoa.' },
      { titulo: 'Mais opções', quando: (c) => c.pode('usuarios', 'editar'),
        texto: 'No botão "⋯" ao lado de cada pessoa você reenvia o convite, bloqueia o acesso ou liga de novo estes balões de ajuda para ela.' },
    ],
  },
  {
    chave: 'meu-perfil', rota: exato('/meu-perfil'),
    passos: [
      { alvo: TITULO, titulo: 'Meu perfil', texto: 'Aqui ficam os seus dados. A sua função e o seu setor quem define é a administração do órgão.' },
      { alvo: a('perfil-orientacoes'), titulo: 'Balões de ajuda', texto: 'Aqui você liga ou desliga estes balões quando quiser.' },
    ],
  },
  {
    chave: 'minhas-notificacoes', rota: exato('/minhas-notificacoes'),
    passos: [
      { alvo: TITULO, titulo: 'Meus avisos', texto: 'Aqui ficam todos os avisos que você recebeu. Ative no celular para receber na hora.' },
    ],
  },
  {
    chave: 'ajuda', rota: exato('/ajuda'),
    passos: [
      { alvo: TITULO, titulo: 'Ajuda', texto: 'Aqui tem o passo a passo de cada parte do sistema.' },
      { alvo: BUSCA, titulo: 'Procurar na ajuda', texto: 'Escreva o que você quer saber, por exemplo "como lançar nota".' },
    ],
  },
  {
    chave: 'configuracoes', rota: exato('/configuracoes'),
    passos: [
      { alvo: TITULO, titulo: 'Configurações', texto: 'Aqui ficam a logo, as regras do órgão e a cópia de segurança dos dados.' },
    ],
  },
  {
    chave: 'auditoria', rota: exato('/auditoria'),
    passos: [
      { alvo: TITULO, titulo: 'Histórico de mudanças', texto: 'Tudo o que foi feito no sistema fica registrado aqui: quem fez, quando e por quê.' },
    ],
  },
  {
    chave: 'estrutura', rota: exato('/estrutura'),
    passos: [
      { alvo: TITULO, titulo: 'Setores do órgão', texto: 'Aqui ficam as secretarias, diretorias e coordenações. Cada pessoa vê o próprio setor e os setores que ficam abaixo dele.' },
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
      texto: 'Os botões para fazer as coisas ficam aqui em cima. Logo abaixo aparece a lista com o que você pode ver.' }],
  };
}

export function roteiroDaTela(caminho: string): Roteiro | undefined {
  return ROTEIROS.find((r) => r.rota(caminho));
}
