// Manual do usuário dentro do sistema: passo a passo por módulo, com busca.
import { ChevronDown, GraduationCap } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CampoBusca } from '@/components/ui/Abas';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';

interface Topico { id: string; titulo: string; grupo: string; link?: string; passos: string[]; dicas?: string[] }

const TOPICOS: Topico[] = [
  { id: 'fluxo', grupo: 'Primeiros passos', titulo: 'Fluxo de trabalho: do contrato ao pagamento', link: '/', passos: [
    '1. Contrato: em Contratos → Novo contrato, escolha o fornecedor e informe vigência e valor. A ficha do contrato abre com as "Etapas do contrato" mostrando o que falta.',
    '2. Responsáveis e dotação: na ficha, designe gestor, fiscal e suplente e, na aba Dotação, clique em "Adicionar dotação" e escolha as classificações (o contrato pode ter várias).',
    '3. Empenho: o botão "Lançar empenho" da etapa já abre o empenho com o contrato escolhido; preencha como na nota de empenho.',
    '4. Nota fiscal: depois de salvar o empenho, use "Lançar nota fiscal": contrato e empenho já vêm escolhidos.',
    '5. Atesto: o gestor, o fiscal ou o suplente (ou quem lançou, se o órgão permitir) vê a nota em destaque e atesta.',
    '6. Pagamento: a nota atestada entra na fila de Pagamentos; dê baixa com as retenções e a data.',
    '7. Documentos: emita o checklist da nota, os extratos e os relatórios quando precisar.',
  ], dicas: ['O Início mostra este fluxo com as pendências de cada passo. Os botões e menus em amarelo indicam o que depende de você.'] },
  { id: 'acesso', grupo: 'Primeiros passos', titulo: 'Entrar, trocar de órgão e editar o perfil', passos: [
    'Entre com o e-mail institucional e a senha. No primeiro acesso, use o link do convite recebido por e-mail para definir a senha.',
    'Esqueceu a senha? Na tela de entrada, clique em "Esqueci minha senha" e siga o link enviado.',
    'Se você tem acesso a mais de um órgão, troque pelo seletor no topo da tela.',
    'Em "Meu perfil" (canto superior direito) você troca a foto e a senha e, se for servidor, atualiza telefone, e-mail pessoal e endereço.',
  ], dicas: ['A senha precisa ter pelo menos 10 caracteres, com letras maiúsculas, minúsculas e números.'] },
  { id: 'papeis', grupo: 'Primeiros passos', titulo: 'O que cada papel pode fazer', link: '/usuarios', passos: [
    'Master: administra todo o órgão (estrutura, usuários, configurações, aprovações).',
    'Gestão Municipal, Secretário, Diretor e Coordenador: consultam e exportam tudo da sua unidade e das que ficam abaixo dela.',
    'Administrativo: cadastra e mantém fornecedores, servidores, contratos, empenhos, notas e ordens de serviço da sua unidade.',
    'Gestor, fiscal e suplente: veem os contratos em que estão designados e atestam as notas fiscais deles.',
    'Servidor: consulta os próprios dados e atualiza os campos pessoais permitidos.',
  ], dicas: ['O acesso vale para a unidade do vínculo e para todas as unidades abaixo dela na estrutura organizacional.'] },
  { id: 'usuarios', grupo: 'Administração', titulo: 'Convidar usuários e dar acesso', link: '/usuarios', passos: [
    'Abra "Usuários e acessos" e clique em "Convidar usuário".',
    'Informe o e-mail institucional, a unidade e o papel. A pessoa recebe o convite por e-mail.',
    'Para retirar um acesso, desative o vínculo informando o motivo. Nada é apagado: o histórico fica na auditoria.',
  ] },
  { id: 'fornecedores', grupo: 'Cadastros', titulo: 'Fornecedores', link: '/fornecedores', passos: [
    'Clique em "Novo fornecedor" e digite o CNPJ: razão social e endereço são preenchidos automaticamente.',
    'Cadastre as contas bancárias na própria ficha do fornecedor.',
    'Para cadastrar muitos de uma vez, use "Modelo" para baixar a planilha, preencha e clique em "Importar". O sistema mostra a prévia com erros e duplicados antes de gravar.',
  ] },
  { id: 'servidores', grupo: 'Cadastros', titulo: 'Servidores, exonerados e aniversariantes', link: '/servidores', passos: [
    'Clique em "Novo servidor", escolha a lotação (Coordenação, Gerência ou setor) e preencha os dados funcionais.',
    'O e-mail institucional liga o cadastro à conta de acesso da pessoa.',
    'Ao informar a data de exoneração, o servidor passa para a aba "Servidores exonerados" sem perder histórico nem documentos.',
    'Dados pessoais (CPF, nascimento, tipo sanguíneo, endereço) só aparecem para quem tem a permissão específica.',
    'Na aba "Dados curriculares" do servidor, registre (opcionalmente) escolaridade, formação acadêmica, especializações, cursos, capacitações, certificações e experiências, e anexe os comprovantes.',
    'Na aba "Histórico de férias", registre cada período: aquisitivo, gozo e observações. A situação (pendente, programada, em gozo ou gozada) é calculada pelas datas. Nada é apagado: para desfazer, cancele com motivo.',
  ] },
  { id: 'consolidado', grupo: 'Servidores', titulo: 'Consolidado mensal de frequência', link: '/servidores/consolidado', passos: [
    'Abra "Consolidado mensal", escolha a Coordenação (todas as Gerências e setores abaixo dela entram automaticamente), uma Gerência ou um setor, e o mês.',
    'Lance atrasos e faltas de cada servidor e marque "Justif." quando houver justificativa ou documento anexado. Clique em "Salvar lançamentos".',
    'A observação é automática: "Nomeação em…" ou "Exoneração em…" no mês, "Justificativa anexada." ou "Frequência integral.". Digite no campo para substituí-la.',
    'Clique em "Emitir consolidado" para gerar o documento em A4 paisagem e imprimir ou salvar em PDF.',
    'Quem esteve de férias no mês aparece com a marca "Férias" e no quadro "Servidores em férias", que também entra no documento emitido (nome, período, dias e situação). Os dados vêm do histórico de férias do servidor.',
  ], dicas: ['O documento emitido fica guardado como foi gerado. Mudanças posteriores no cadastro não o alteram. Para corrigir, emita de novo.',
    'O título do documento é configurado em Configurações do órgão, conforme o modelo oficial.'] },
  { id: 'unidades', grupo: 'Cadastros', titulo: 'Unidades atendidas e grupos de rateio', link: '/unidades-atendidas', passos: [
    'Cadastre as unidades que recebem os serviços (unidades de saúde, escolas…).',
    'Para dividir uma nota entre várias unidades, crie um grupo e indique as unidades componentes.',
  ] },
  { id: 'classificacao', grupo: 'Cadastros', titulo: 'Classificação orçamentária (consulta)', link: '/classificacao', passos: [
    'As classificações (UO, função, programa, ação, natureza, subelemento, fonte…) são cadastradas pela equipe da plataforma, uma a uma, no módulo Desenvolvedor.',
    'A dotação é formada pelo próprio órgão: na aba Dotação do contrato ("Adicionar dotação") e no cadastro do empenho, escolhendo cada classificação.',
    'Esta tela mostra as dotações já formadas que o órgão pode usar: busque por UO (18401), ação (2090), natureza (33903914), fonte ou descrição e clique para ver todos os campos.',
    'Falta algum código (por exemplo, uma fonte nova)? Peça à equipe da plataforma, de preferência com a nota de empenho.',
  ] },
  { id: 'dotacoes-plataforma', grupo: 'Plataforma (desenvolvedor)', titulo: 'Cadastrar as classificações orçamentárias do município', link: '/plataforma/dotacoes', passos: [
    'Em Plataforma → Classificações orçamentárias, escolha o ente (município) ou cadastre um novo, e vincule os órgãos dele na aba "Órgãos do ente".',
    'Na aba "Classificações orçamentárias", cadastre cada código separadamente, na ordem da nota de empenho: Unidade Orçamentária, Unidade Gestora, Função, SubFunção, Programa, Ação, Natureza da Despesa (8 dígitos, ex.: 33903900), SubElemento (8 dígitos, ex.: 33903914), Fonte, CO, IdUso, IDoc, Resultado primário e SubFonte.',
    'Na natureza da despesa, a categoria, o grupo, a modalidade e o elemento saem dos dígitos. O subelemento só pode ser cadastrado depois da natureza dele.',
    'Na Unidade Orçamentária, marque os órgãos que a usam (ex.: 18401 → SMS). Sem marcação, ela vale para todos os órgãos do ente.',
    'A dotação não é cadastrada aqui: o administrador do órgão a forma no contrato e no empenho, escolhendo estas classificações. A aba "Dotações formadas" mostra as combinações já usadas; ali também dá para importar a LOA por planilha, o que cadastra todos os códigos de uma vez.',
  ] },
  { id: 'contratos', grupo: 'Contratos e execução', titulo: 'Contratos, responsáveis, dotação e aditivos', link: '/contratos', passos: [
    'Clique em "Novo contrato", escolha o fornecedor e a modalidade e informe vigência e valor global.',
    'Na aba "Responsáveis", designe gestor, fiscal e suplente. Eles passam a ver o contrato e a atestar as notas.',
    'Na aba "Dotação", clique em "Adicionar dotação" e escolha cada classificação (UO, função, subfunção, programa, ação, natureza, subelemento, fonte…) entre as cadastradas pelo Desenvolvedor. Use "Salvar e adicionar outra" para incluir várias: o contrato pode ter dotações de ações, fontes, naturezas e exercícios diferentes.',
    'A tabela mostra exercício, ação, natureza, fonte e quanto já foi empenhado em cada dotação. Dotação já usada por empenho não pode ser retirada do contrato.',
    'Aditivos nascem como rascunho e são aprovados pelo Master. Aprovados, ajustam vigência e valor sem apagar o original.',
    'A renovação cria um contrato novo, ligado ao anterior.',
    'Em "Documentos e extratos", emita o extrato do contrato para impressão.',
  ] },
  { id: 'empenhos', grupo: 'Contratos e execução', titulo: 'Empenhos e reforços', link: '/empenhos', passos: [
    'Clique em "Novo empenho" e preencha como na nota de empenho: contrato, nº, tipo, data e exercício. O fornecedor vem do contrato.',
    'No quadro CLASSIFICAÇÃO, escolha cada campo um a um (Unidade Orçamentária, Função, SubFunção, Programa, Ação, Natureza Despesa, SubElemento, Fonte, CO, IdUso, IDoc, Ind. Result. Prim. e SubFonte) entre os códigos cadastrados no módulo Desenvolvedor. Ação, natureza e fonte são obrigatórias.',
    'Atalho: "Preencher com uma dotação do contrato" completa todos os campos de uma vez; depois dá para trocar qualquer um.',
    'Ao salvar, o sistema reaproveita a dotação com essa classificação no exercício do empenho ou a monta com os códigos escolhidos (nenhum código novo é criado) e a inclui nas dotações do contrato.',
    'Para aumentar o valor, registre um reforço. Cancelamentos exigem motivo e ficam no histórico.',
    'A barra mostra o quanto do empenho já foi usado em notas fiscais.',
  ] },
  { id: 'notas', grupo: 'Contratos e execução', titulo: 'Notas fiscais, atesto, pagamento e checklist', link: '/notas', passos: [
    'Clique em "Nova nota fiscal" e siga as abas: contrato e empenho, dados da nota, meses de referência e unidades, texto de atesto.',
    'Se o valor passar do saldo do empenho, o sistema avisa. A exceção exige justificativa e permissão.',
    'O gestor, fiscal ou suplente designado abre a nota (selo "Aguardando o seu atesto") e clica em "Atestar nota" na aba Atesto.',
    'Depois do atesto, a administração dá baixa em Pagamentos: valor bruto, retenções (ISS, IRRF, INSS, PIS/COFINS/CSLL, outras), data e OB. O líquido é calculado na hora. A fila segue a ordem cronológica por fonte de recurso; pagar fora da ordem exige justificativa. Pagamento menor que o valor deixa a nota como "Parcial".',
    'Na aba Documentos, clique em "Emitir checklist": o formulário de análise dos documentos da nota (modelo da SMS) já vem com contrato, unidade, contratada, contato, serviço, período, nota, valor e mês de referência. Confira os itens SIM/NÃO (já marcados como no modelo), a declaração de nota pendente e quem assina (fiscal por padrão; troque para gestor ou suplente se precisar). Depois imprima ou salve em PDF e anexe os comprovantes.',
    'Texto do decreto em renovação: aparece ao lançar a nota (passo 4) e no topo da aba Atesto, antes do atesto do fiscal. Escolha o decreto do órgão e copie: o número do processo do contrato já vem preenchido. Depois do atesto, a aba Atesto também oferece "Copiar texto do atesto" para encaminhar ao financeiro.',
  ] },
  { id: 'os', grupo: 'Contratos e execução', titulo: 'Ordens de serviço', link: '/ordens-servico', passos: [
    'Clique em "Nova ordem de serviço". O número (NNNN/ANO) é gerado automaticamente.',
    'Escolha uma ou várias unidades atendidas e, se houver, o contrato.',
    'Acompanhe o status (aberta, em andamento, concluída). O cancelamento exige motivo.',
  ] },
  { id: 'relatorios', grupo: 'Gestão', titulo: 'Consulta e relatórios', link: '/relatorios', passos: [
    'Escolha o relatório completo (notas por classificação) ou o resumo de consumo.',
    'Combine filtros: vários anos, contratos, fornecedores, ações, elementos, subelementos e fontes. Entre campos vale "E"; dentro do mesmo campo vale "OU".',
    'Exporte em Excel ou gere o PDF com o cabeçalho do órgão. Toda exportação fica registrada na auditoria.',
  ] },
  { id: 'painel', grupo: 'Gestão', titulo: 'Painel gerencial e notificações', link: '/painel', passos: [
    'O painel mostra, por ano, contratos a vencer, empenhado, consumido e pago, pendências e consumo por mês.',
    'O sino no topo avisa sobre notas aguardando o seu atesto, contratos vencendo, pagamentos pendentes e empenhos com pouco saldo.',
  ] },
  { id: 'configuracoes', grupo: 'Administração', titulo: 'Configurações do órgão e cópia de segurança', link: '/configuracoes', passos: [
    'Envie o brasão e preencha o cabeçalho e o rodapé dos documentos.',
    'Ajuste os textos de atesto e do decreto, os títulos do consolidado e do checklist e os itens de conferência.',
    'Em "Cópia de segurança", o Master baixa todos os dados do órgão em JSON. Guarde o arquivo em local protegido.',
  ] },
  { id: 'auditoria', grupo: 'Administração', titulo: 'Auditoria', link: '/auditoria', passos: [
    'Toda criação, alteração, inativação, atesto, pagamento, exportação e emissão de documento fica registrada com usuário, data e valores antes/depois.',
    'Filtre por período, entidade ou usuário. Ninguém consegue editar a auditoria.',
  ] },
  { id: 'lgpd', grupo: 'Privacidade', titulo: 'Proteção de dados pessoais (LGPD)', passos: [
    'Acesse e exporte apenas o necessário para o seu trabalho. Exportações e cópias ficam registradas.',
    'Dados pessoais de servidores têm permissão própria e aparecem mascarados na auditoria.',
    'Encontrou um dado errado? O próprio servidor corrige os campos pessoais em "Meu perfil"; os demais, a administração.',
    'Suspeita de acesso indevido ou vazamento: comunique imediatamente a administração do órgão.',
  ] },
];

function Item({ t, aberto, alternar }: { t: Topico; aberto: boolean; alternar: () => void }): ReactNode {
  return (
    <li className="border-b border-slate-100 last:border-0">
      <button className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={alternar} aria-expanded={aberto}>
        <span className="text-sm font-medium text-slate-900">{t.titulo}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="pb-4 text-sm text-slate-700">
          <ol className="ml-5 list-decimal space-y-1.5">{t.passos.map((p) => <li key={p}>{p}</li>)}</ol>
          {t.dicas && <ul className="mt-3 space-y-1 rounded-lg bg-marca-50 p-3 text-marca-900">{t.dicas.map((d) => <li key={d}>{d}</li>)}</ul>}
          {t.link && <Link to={t.link} className="mt-3 inline-block font-medium text-marca-700 hover:underline">Abrir o módulo →</Link>}
        </div>
      )}
    </li>
  );
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Ajuda() {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const grupos = useMemo(() => {
    const termo = sem(busca.trim());
    const achados = TOPICOS.filter((t) => !termo || sem([t.titulo, t.grupo, ...t.passos, ...(t.dicas ?? [])].join(' ')).includes(termo));
    return [...new Set(achados.map((t) => t.grupo))].map((g) => ({ grupo: g, topicos: achados.filter((t) => t.grupo === g) }));
  }, [busca]);
  return (
    <>
      <CabecalhoPagina titulo="Ajuda e manual do usuário" descricao="Passo a passo de cada módulo. Você vê no menu apenas o que o seu papel permite." />
      <Link to="/ajuda/capacitacao" className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-marca-300 bg-marca-50 p-4 hover:bg-marca-100">
        <GraduationCap className="size-8 shrink-0 text-marca-700" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-marca-950">Capacitação de gestores, fiscais e suplentes de contrato</span>
          <span className="block text-sm text-marca-900">Trilha em linguagem simples, gráficos, consulta rápida à Lei 14.133/2021 e à LINDB, riscos e responsabilidades, teste de conhecimentos e normas de Aracaju.</span>
        </span>
        <span className="text-sm font-medium text-marca-700">Começar →</span>
      </Link>
      <div className="mb-6 max-w-md"><CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar na ajuda" placeholder="Ex.: atesto, consolidado, importar" /></div>
      {!grupos.length ? <Cartao><Vazio titulo="Nada encontrado" descricao="Tente outra palavra." /></Cartao> : (
        <div className="grid gap-6 lg:grid-cols-2">
          {grupos.map((g) => (
            <Cartao key={g.grupo} titulo={g.grupo}>
              <ul>{g.topicos.map((t) => <Item key={t.id} t={t} aberto={aberto === t.id || !!busca.trim()} alternar={() => setAberto(aberto === t.id ? null : t.id)} />)}</ul>
            </Cartao>
          ))}
        </div>
      )}
    </>
  );
}
