// Conteúdo da capacitação de fiscais, gestores e suplentes.
// Os textos de lei são trechos literais da Lei nº 14.133/2021 e da LINDB (Decreto-Lei nº 4.657/1942,
// arts. 20 a 30 incluídos pela Lei nº 13.655/2018). As explicações "em palavras simples" são orientação,
// não substituem a lei, o regulamento municipal nem o parecer jurídico.

export interface Artigo {
  id: string;
  lei: 'Lei 14.133/2021' | 'LINDB' | 'Código Penal (incluído pela Lei 14.133/2021)';
  ref: string;
  titulo: string;
  simples: string;
  texto: string;
  temas: string[];
}

export const ARTIGOS: Artigo[] = [
  {
    id: 'a6-lvii', lei: 'Lei 14.133/2021', ref: 'Art. 6º, LVII', titulo: 'O que é superfaturamento',
    simples: 'Pagar por mais do que foi entregue, aceitar serviço malfeito ou aceitar mudanças que só favorecem a empresa causa dano ao dinheiro público. Quem fiscaliza é quem impede isso.',
    texto: 'LVII - superfaturamento: dano provocado ao patrimônio da Administração, caracterizado, entre outras situações, por: a) medição de quantidades superiores às efetivamente executadas ou fornecidas; b) deficiência na execução de obras e de serviços de engenharia que resulte em diminuição da sua qualidade, vida útil ou segurança; c) alterações no orçamento de obras e de serviços de engenharia que causem desequilíbrio econômico-financeiro do contrato em favor do contratado; d) outras alterações de cláusulas financeiras que gerem recebimentos contratuais antecipados, distorção do cronograma físico-financeiro, prorrogação injustificada do prazo contratual com custos adicionais para a Administração ou reajuste irregular de preços;',
    temas: ['fiscalização', 'pagamento', 'risco'],
  },
  {
    id: 'a7', lei: 'Lei 14.133/2021', ref: 'Art. 7º', titulo: 'Quem pode ser designado',
    simples: 'Quem fiscaliza deve ser, de preferência, servidor efetivo, ter preparo para a função e não pode ter vínculo com a empresa contratada (parente, sócio, amigo de negócio).',
    texto: 'Art. 7º Caberá à autoridade máxima do órgão ou da entidade, ou a quem as normas de organização administrativa indicarem, promover gestão por competências e designar agentes públicos para o desempenho das funções essenciais à execução desta Lei que preencham os seguintes requisitos: I - sejam, preferencialmente, servidor efetivo ou empregado público dos quadros permanentes da Administração Pública; II - tenham atribuições relacionadas a licitações e contratos ou possuam formação compatível ou qualificação atestada por certificação profissional emitida por escola de governo criada e mantida pelo poder público; e III - não sejam cônjuge ou companheiro de licitantes ou contratados habituais da Administração nem tenham com eles vínculo de parentesco, colateral ou por afinidade, até o terceiro grau, ou de natureza técnica, comercial, econômica, financeira, trabalhista e civil.',
    temas: ['designação', 'impedimento'],
  },
  {
    id: 'a7-p1', lei: 'Lei 14.133/2021', ref: 'Art. 7º, § 1º', titulo: 'Segregação de funções',
    simples: 'A mesma pessoa não deve fazer tudo sozinha (pedir, contratar, fiscalizar e pagar). Dividir as tarefas evita que um erro ou uma fraude passe sem ninguém ver.',
    texto: '§ 1º A autoridade referida no caput deste artigo deverá observar o princípio da segregação de funções, vedada a designação do mesmo agente público para atuação simultânea em funções mais suscetíveis a riscos, de modo a reduzir a possibilidade de ocultação de erros e de ocorrência de fraudes na respectiva contratação.',
    temas: ['designação', 'risco'],
  },
  {
    id: 'a9-p1', lei: 'Lei 14.133/2021', ref: 'Art. 9º, § 1º', titulo: 'Conflito de interesses',
    simples: 'Se você tem qualquer interesse pessoal no contrato, não pode participar da sua execução. Na dúvida, avise a chefia por escrito.',
    texto: '§ 1º Não poderá participar, direta ou indiretamente, da licitação ou da execução do contrato agente público de órgão ou entidade licitante ou contratante, devendo ser observadas as situações que possam configurar conflito de interesses no exercício ou após o exercício do cargo ou emprego, nos termos da legislação que disciplina a matéria.',
    temas: ['impedimento', 'risco'],
  },
  {
    id: 'a10', lei: 'Lei 14.133/2021', ref: 'Art. 10', titulo: 'Defesa do servidor que seguiu o parecer jurídico',
    simples: 'Se você agiu seguindo o parecer jurídico do processo e for questionado, a advocacia pública pode defender você. Isso não vale se houver prova de ato ilícito doloso.',
    texto: 'Art. 10. Se as autoridades competentes e os servidores públicos que tiverem participado dos procedimentos relacionados às licitações e aos contratos de que trata esta Lei precisarem defender-se nas esferas administrativa, controladora ou judicial em razão de ato praticado com estrita observância de orientação constante em parecer jurídico elaborado na forma do § 1º do art. 53 desta Lei, a advocacia pública promoverá, a critério do agente público, sua representação judicial ou extrajudicial. § 1º Não se aplica o disposto no caput deste artigo quando: I - (VETADO); II - provas da prática de atos ilícitos dolosos constarem nos autos do processo administrativo ou judicial.',
    temas: ['responsabilidade', 'proteção'],
  },
  {
    id: 'a12-vii', lei: 'Lei 14.133/2021', ref: 'Art. 12, VII', titulo: 'DFD e plano de contratações',
    simples: 'Tudo começa no Documento de Formalização de Demanda (DFD): é o pedido formal que explica o que a unidade precisa. Com os DFDs, o município monta o plano anual de contratações.',
    texto: 'VII - a partir de documentos de formalização de demandas, os órgãos responsáveis pelo planejamento de cada ente federativo poderão, na forma de regulamento, elaborar plano de contratações anual, com o objetivo de racionalizar as contratações dos órgãos e entidades sob sua competência, garantir o alinhamento com o seu planejamento estratégico e subsidiar a elaboração das respectivas leis orçamentárias.',
    temas: ['planejamento', 'DFD'],
  },
  {
    id: 'a17', lei: 'Lei 14.133/2021', ref: 'Art. 17', titulo: 'Fases da licitação',
    simples: 'A licitação segue uma ordem: preparação, publicação do edital, propostas e lances, julgamento, habilitação, recursos e homologação.',
    texto: 'Art. 17. O processo de licitação observará as seguintes fases, em sequência: I - preparatória; II - de divulgação do edital de licitação; III - de apresentação de propostas e lances, quando for o caso; IV - de julgamento; V - de habilitação; VI - recursal; VII - de homologação.',
    temas: ['planejamento', 'licitação'],
  },
  {
    id: 'a28', lei: 'Lei 14.133/2021', ref: 'Art. 28', titulo: 'Modalidades de licitação',
    simples: 'Só existem cinco modalidades: pregão, concorrência, concurso, leilão e diálogo competitivo. Tomada de preços e convite não existem mais.',
    texto: 'Art. 28. São modalidades de licitação: I - pregão; II - concorrência; III - concurso; IV - leilão; V - diálogo competitivo. § 1º Além das modalidades referidas no caput deste artigo, a Administração pode servir-se dos procedimentos auxiliares previstos no art. 78 desta Lei. § 2º É vedada a criação de outras modalidades de licitação ou, ainda, a combinação daquelas referidas no caput deste artigo.',
    temas: ['licitação'],
  },
  {
    id: 'a50', lei: 'Lei 14.133/2021', ref: 'Art. 50', titulo: 'Documentos trabalhistas (mão de obra exclusiva)',
    simples: 'Em contratos com funcionários da empresa trabalhando só para o órgão (limpeza, vigilância, recepção…), o fiscal deve pedir e conferir os comprovantes de que a empresa paga salários, FGTS, férias e benefícios.',
    texto: 'Art. 50. Nas contratações de serviços com regime de dedicação exclusiva de mão de obra, o contratado deverá apresentar, quando solicitado pela Administração, sob pena de multa, comprovação do cumprimento das obrigações trabalhistas e com o Fundo de Garantia do Tempo de Serviço (FGTS) em relação aos empregados diretamente envolvidos na execução do contrato, em especial quanto ao: I - registro de ponto; II - recibo de pagamento de salários, adicionais, horas extras, repouso semanal remunerado e décimo terceiro salário; III - comprovante de depósito do FGTS; IV - recibo de concessão e pagamento de férias e do respectivo adicional; V - recibo de quitação de obrigações trabalhistas e previdenciárias dos empregados dispensados até a data da extinção do contrato; VI - recibo de pagamento de vale-transporte e vale-alimentação, na forma prevista em norma coletiva.',
    temas: ['fiscalização', 'trabalhista'],
  },
  {
    id: 'a73', lei: 'Lei 14.133/2021', ref: 'Art. 73', titulo: 'Contratação direta indevida',
    simples: 'Contratar sem licitação fora dos casos permitidos, com má-fé ou erro grosseiro, faz o servidor responder junto com a empresa pelo prejuízo.',
    texto: 'Art. 73. Na hipótese de contratação direta indevida ocorrida com dolo, fraude ou erro grosseiro, o contratado e o agente público responsável responderão solidariamente pelo dano causado ao erário, sem prejuízo de outras sanções legais cabíveis.',
    temas: ['responsabilidade', 'risco'],
  },
  {
    id: 'a75', lei: 'Lei 14.133/2021', ref: 'Art. 75, I e II', titulo: 'Dispensa por valor',
    simples: 'Contratações pequenas podem dispensar licitação até certos limites. Os valores são atualizados todo 1º de janeiro (art. 182). Dividir uma compra em várias pequenas para fugir da licitação é proibido: soma-se tudo o que a unidade gasta no ano com o mesmo tipo de objeto.',
    texto: 'Art. 75. É dispensável a licitação: I - para contratação que envolva valores inferiores a R$ 100.000,00 (cem mil reais), no caso de obras e serviços de engenharia ou de serviços de manutenção de veículos automotores; II - para contratação que envolva valores inferiores a R$ 50.000,00 (cinquenta mil reais), no caso de outros serviços e compras; […] § 1º Para fins de aferição dos valores que atendam aos limites referidos nos incisos I e II do caput deste artigo, deverão ser observados: I - o somatório do que for despendido no exercício financeiro pela respectiva unidade gestora; II - o somatório da despesa realizada com objetos de mesma natureza, entendidos como tais aqueles relativos a contratações no mesmo ramo de atividade.',
    temas: ['licitação', 'risco'],
  },
  {
    id: 'a92-viii', lei: 'Lei 14.133/2021', ref: 'Art. 92, VIII', titulo: 'Dotação orçamentária no contrato',
    simples: 'Todo contrato precisa dizer de qual "caixinha" do orçamento sai o dinheiro (a dotação). No MEASURE, é a aba Dotação do contrato.',
    texto: 'Art. 92. São necessárias em todo contrato cláusulas que estabeleçam: […] VIII - o crédito pelo qual correrá a despesa, com a indicação da classificação funcional programática e da categoria econômica;',
    temas: ['orçamento', 'contrato'],
  },
  {
    id: 'a95-p2', lei: 'Lei 14.133/2021', ref: 'Art. 95, § 2º', titulo: 'Contrato verbal é nulo',
    simples: 'Combinar "de boca" com a empresa não vale. Só se admite para pequenas compras de pronto pagamento até R$ 10 mil.',
    texto: '§ 2º É nulo e de nenhum efeito o contrato verbal com a Administração, salvo o de pequenas compras ou o de prestação de serviços de pronto pagamento, assim entendidos aqueles de valor não superior a R$ 10.000,00 (dez mil reais).',
    temas: ['alteração', 'risco'],
  },
  {
    id: 'a107', lei: 'Lei 14.133/2021', ref: 'Art. 107', titulo: 'Prorrogação de serviços contínuos',
    simples: 'Serviços contínuos podem ser prorrogados até somar 10 anos, se o edital previu e a autoridade atestar que continua vantajoso.',
    texto: 'Art. 107. Os contratos de serviços e fornecimentos contínuos poderão ser prorrogados sucessivamente, respeitada a vigência máxima decenal, desde que haja previsão em edital e que a autoridade competente ateste que as condições e os preços permanecem vantajosos para a Administração, permitida a negociação com o contratado ou a extinção contratual sem ônus para qualquer das partes.',
    temas: ['gestão', 'prazo'],
  },
  {
    id: 'a115-p1', lei: 'Lei 14.133/2021', ref: 'Art. 115, § 1º', titulo: 'Não atrasar sem motivo',
    simples: 'A Administração não pode segurar a execução de uma obra ou serviço sem motivo.',
    texto: '§ 1º É proibido à Administração retardar imotivadamente a execução de obra ou serviço, ou de suas parcelas, inclusive na hipótese de posse do respectivo chefe do Poder Executivo ou de novo titular no órgão ou entidade contratante.',
    temas: ['gestão', 'prazo'],
  },
  {
    id: 'a117', lei: 'Lei 14.133/2021', ref: 'Art. 117', titulo: 'O papel do fiscal',
    simples: 'O fiscal acompanha a execução, anota tudo o que acontece, manda corrigir o que está errado, avisa a chefia quando o problema é maior que ele e pode pedir ajuda ao jurídico e ao controle interno.',
    texto: 'Art. 117. A execução do contrato deverá ser acompanhada e fiscalizada por 1 (um) ou mais fiscais do contrato, representantes da Administração especialmente designados conforme requisitos estabelecidos no art. 7º desta Lei, ou pelos respectivos substitutos, permitida a contratação de terceiros para assisti-los e subsidiá-los com informações pertinentes a essa atribuição. § 1º O fiscal do contrato anotará em registro próprio todas as ocorrências relacionadas à execução do contrato, determinando o que for necessário para a regularização das faltas ou dos defeitos observados. § 2º O fiscal do contrato informará a seus superiores, em tempo hábil para a adoção das medidas convenientes, a situação que demandar decisão ou providência que ultrapasse sua competência. § 3º O fiscal do contrato será auxiliado pelos órgãos de assessoramento jurídico e de controle interno da Administração, que deverão dirimir dúvidas e subsidiá-lo com informações relevantes para prevenir riscos na execução contratual.',
    temas: ['fiscalização'],
  },
  {
    id: 'a117-p4', lei: 'Lei 14.133/2021', ref: 'Art. 117, § 4º, II', titulo: 'Ajuda de terceiros não tira a responsabilidade',
    simples: 'Mesmo que uma empresa de apoio ajude na fiscalização, a responsabilidade continua sendo do fiscal designado.',
    texto: 'II - a contratação de terceiros não eximirá de responsabilidade o fiscal do contrato, nos limites das informações recebidas do terceiro contratado.',
    temas: ['fiscalização', 'responsabilidade'],
  },
  {
    id: 'a118', lei: 'Lei 14.133/2021', ref: 'Art. 118', titulo: 'Preposto da empresa',
    simples: 'A empresa precisa ter um representante (preposto) aceito pela Administração. É com ele que o fiscal trata os problemas.',
    texto: 'Art. 118. O contratado deverá manter preposto aceito pela Administração no local da obra ou do serviço para representá-lo na execução do contrato.',
    temas: ['fiscalização'],
  },
  {
    id: 'a119-120', lei: 'Lei 14.133/2021', ref: 'Arts. 119 e 120', titulo: 'A empresa corrige e responde pelos danos',
    simples: 'Se algo foi entregue com defeito, a empresa refaz por conta dela. A fiscalização não tira da empresa a culpa pelos danos que ela causar.',
    texto: 'Art. 119. O contratado será obrigado a reparar, corrigir, remover, reconstruir ou substituir, a suas expensas, no total ou em parte, o objeto do contrato em que se verificarem vícios, defeitos ou incorreções resultantes de sua execução ou de materiais nela empregados. Art. 120. O contratado será responsável pelos danos causados diretamente à Administração ou a terceiros em razão da execução do contrato, e não excluirá nem reduzirá essa responsabilidade a fiscalização ou o acompanhamento pelo contratante.',
    temas: ['fiscalização'],
  },
  {
    id: 'a121', lei: 'Lei 14.133/2021', ref: 'Art. 121, § 2º', titulo: 'Falha na fiscalização: o município paga a conta',
    simples: 'Nos contratos com mão de obra exclusiva, se a empresa não pagar os empregados e ficar provado que a fiscalização falhou, o município pode ter de pagar os encargos previdenciários e trabalhistas.',
    texto: '§ 2º Exclusivamente nas contratações de serviços contínuos com regime de dedicação exclusiva de mão de obra, a Administração responderá solidariamente pelos encargos previdenciários e subsidiariamente pelos encargos trabalhistas se comprovada falha na fiscalização do cumprimento das obrigações do contratado.',
    temas: ['trabalhista', 'risco', 'responsabilidade'],
  },
  {
    id: 'a123', lei: 'Lei 14.133/2021', ref: 'Art. 123', titulo: 'Responder aos pedidos da empresa',
    simples: 'Todo pedido ou reclamação da empresa sobre o contrato precisa de resposta formal, em regra em até 1 mês depois de instruído.',
    texto: 'Art. 123. A Administração terá o dever de explicitamente emitir decisão sobre todas as solicitações e reclamações relacionadas à execução dos contratos regidos por esta Lei, ressalvados os requerimentos manifestamente impertinentes, meramente protelatórios ou de nenhum interesse para a boa execução do contrato. Parágrafo único. Salvo disposição legal ou cláusula contratual que estabeleça prazo específico, concluída a instrução do requerimento, a Administração terá o prazo de 1 (um) mês para decidir, admitida a prorrogação motivada por igual período.',
    temas: ['gestão', 'prazo'],
  },
  {
    id: 'a124', lei: 'Lei 14.133/2021', ref: 'Art. 124', titulo: 'Quando o contrato pode mudar',
    simples: 'O contrato só muda com justificativa: por decisão da Administração (ajuste técnico ou de quantidade) ou por acordo (garantia, forma de execução, forma de pagamento, reequilíbrio).',
    texto: 'Art. 124. Os contratos regidos por esta Lei poderão ser alterados, com as devidas justificativas, nos seguintes casos: I - unilateralmente pela Administração: a) quando houver modificação do projeto ou das especificações, para melhor adequação técnica a seus objetivos; b) quando for necessária a modificação do valor contratual em decorrência de acréscimo ou diminuição quantitativa de seu objeto, nos limites permitidos por esta Lei; II - por acordo entre as partes: […]',
    temas: ['alteração'],
  },
  {
    id: 'a125', lei: 'Lei 14.133/2021', ref: 'Art. 125', titulo: 'Limites de acréscimo e supressão',
    simples: 'A empresa é obrigada a aceitar aumentos ou reduções de até 25% do valor inicial atualizado. Em reforma de prédio ou de equipamento, o aumento pode chegar a 50%.',
    texto: 'Art. 125. Nas alterações unilaterais a que se refere o inciso I do caput do art. 124 desta Lei, o contratado será obrigado a aceitar, nas mesmas condições contratuais, acréscimos ou supressões de até 25% (vinte e cinco por cento) do valor inicial atualizado do contrato que se fizerem nas obras, nos serviços ou nas compras, e, no caso de reforma de edifício ou de equipamento, o limite para os acréscimos será de 50% (cinquenta por cento).',
    temas: ['alteração'],
  },
  {
    id: 'a126', lei: 'Lei 14.133/2021', ref: 'Art. 126', titulo: 'Não transformar o objeto',
    simples: 'Uma alteração não pode transformar o contrato em outra coisa (ex.: contrato de limpeza virar obra).',
    texto: 'Art. 126. As alterações unilaterais a que se refere o inciso I do caput do art. 124 desta Lei não poderão transfigurar o objeto da contratação.',
    temas: ['alteração', 'risco'],
  },
  {
    id: 'a132', lei: 'Lei 14.133/2021', ref: 'Art. 132', titulo: 'Primeiro o aditivo, depois a execução',
    simples: 'A empresa só deve executar o que mudou depois que o termo aditivo for assinado. Se for urgente e justificado, o aditivo precisa ser formalizado em até 1 mês.',
    texto: 'Art. 132. A formalização do termo aditivo é condição para a execução, pelo contratado, das prestações determinadas pela Administração no curso da execução do contrato, salvo nos casos de justificada necessidade de antecipação de seus efeitos, hipótese em que a formalização deverá ocorrer no prazo máximo de 1 (um) mês.',
    temas: ['alteração', 'prazo', 'risco'],
  },
  {
    id: 'a136', lei: 'Lei 14.133/2021', ref: 'Art. 136', titulo: 'Apostila (sem aditivo)',
    simples: 'Algumas atualizações não mudam o contrato e são feitas por simples apostila: reajuste previsto, mudança de nome da empresa, empenho de dotações.',
    texto: 'Art. 136. Registros que não caracterizam alteração do contrato podem ser realizados por simples apostila, dispensada a celebração de termo aditivo, como nas seguintes situações: I - variação do valor contratual para fazer face ao reajuste ou à repactuação de preços previstos no próprio contrato; II - atualizações, compensações ou penalizações financeiras decorrentes das condições de pagamento previstas no contrato; III - alterações na razão ou na denominação social do contratado; IV - empenho de dotações orçamentárias.',
    temas: ['alteração', 'orçamento'],
  },
  {
    id: 'a137', lei: 'Lei 14.133/2021', ref: 'Art. 137, I e II', titulo: 'Motivos para encerrar o contrato',
    simples: 'Descumprir o contrato ou desobedecer às ordens do fiscal pode levar ao fim do contrato — sempre com processo, direito de defesa e motivação.',
    texto: 'Art. 137. Constituirão motivos para extinção do contrato, a qual deverá ser formalmente motivada nos autos do processo, assegurados o contraditório e a ampla defesa, as seguintes situações: I - não cumprimento ou cumprimento irregular de normas editalícias ou de cláusulas contratuais, de especificações, de projetos ou de prazos; II - desatendimento das determinações regulares emitidas pela autoridade designada para acompanhar e fiscalizar sua execução ou por autoridade superior;',
    temas: ['sanção', 'fiscalização'],
  },
  {
    id: 'a140', lei: 'Lei 14.133/2021', ref: 'Art. 140', titulo: 'Recebimento provisório e definitivo',
    simples: 'Primeiro o fiscal recebe provisoriamente, com um termo detalhado. Depois, um servidor ou comissão designada recebe definitivamente. Receber não livra a empresa de responder por defeitos.',
    texto: 'Art. 140. O objeto do contrato será recebido: I - em se tratando de obras e serviços: a) provisoriamente, pelo responsável por seu acompanhamento e fiscalização, mediante termo detalhado, quando verificado o cumprimento das exigências de caráter técnico; b) definitivamente, por servidor ou comissão designada pela autoridade competente, mediante termo detalhado que comprove o atendimento das exigências contratuais; II - em se tratando de compras: a) provisoriamente, de forma sumária, pelo responsável por seu acompanhamento e fiscalização, com verificação posterior da conformidade do material com as exigências contratuais; b) definitivamente, por servidor ou comissão designada pela autoridade competente, mediante termo detalhado que comprove o atendimento das exigências contratuais. § 1º O objeto do contrato poderá ser rejeitado, no todo ou em parte, quando estiver em desacordo com o contrato.',
    temas: ['fiscalização', 'recebimento'],
  },
  {
    id: 'a141', lei: 'Lei 14.133/2021', ref: 'Art. 141', titulo: 'Ordem cronológica de pagamentos',
    simples: 'Os pagamentos seguem uma fila por ordem de chegada, separada por fonte de recurso e tipo de contrato. Furar a fila só com justificativa nos casos da lei; sem motivo, gera apuração de responsabilidade.',
    texto: 'Art. 141. No dever de pagamento pela Administração, será observada a ordem cronológica para cada fonte diferenciada de recursos, subdividida nas seguintes categorias de contratos: I - fornecimento de bens; II - locações; III - prestação de serviços; IV - realização de obras. […] § 2º A inobservância imotivada da ordem cronológica referida no caput deste artigo ensejará a apuração de responsabilidade do agente responsável, cabendo aos órgãos de controle a sua fiscalização. § 3º O órgão ou entidade deverá disponibilizar, mensalmente, em seção específica de acesso à informação em seu sítio na internet, a ordem cronológica de seus pagamentos, bem como as justificativas que fundamentarem a eventual alteração dessa ordem.',
    temas: ['pagamento', 'risco'],
  },
  {
    id: 'a143', lei: 'Lei 14.133/2021', ref: 'Art. 143', titulo: 'Parte sem discussão é paga no prazo',
    simples: 'Se há discussão só sobre parte do serviço, a parte que está certa deve ser paga no prazo normal.',
    texto: 'Art. 143. No caso de controvérsia sobre a execução do objeto, quanto a dimensão, qualidade e quantidade, a parcela incontroversa deverá ser liberada no prazo previsto para pagamento.',
    temas: ['pagamento'],
  },
  {
    id: 'a145', lei: 'Lei 14.133/2021', ref: 'Art. 145', titulo: 'Pagamento antecipado é proibido',
    simples: 'Não se paga antes de receber o serviço ou o bem. A exceção precisa estar justificada e prevista no edital ou no instrumento da contratação direta.',
    texto: 'Art. 145. Não será permitido pagamento antecipado, parcial ou total, relativo a parcelas contratuais vinculadas ao fornecimento de bens, à execução de obras ou à prestação de serviços. § 1º A antecipação de pagamento somente será permitida se propiciar sensível economia de recursos ou se representar condição indispensável para a obtenção do bem ou para a prestação do serviço, hipótese que deverá ser previamente justificada no processo licitatório e expressamente prevista no edital de licitação ou instrumento formal de contratação direta.',
    temas: ['pagamento', 'risco'],
  },
  {
    id: 'a150', lei: 'Lei 14.133/2021', ref: 'Art. 150', titulo: 'Sem orçamento, a contratação é nula',
    simples: 'Nenhum contrato pode ser feito sem dizer de onde vem o dinheiro para pagá-lo naquele ano. Sem isso, o ato é nulo e quem deu causa responde.',
    texto: 'Art. 150. Nenhuma contratação será feita sem a caracterização adequada de seu objeto e sem a indicação dos créditos orçamentários para pagamento das parcelas contratuais vincendas no exercício em que for realizada a contratação, sob pena de nulidade do ato e de responsabilização de quem lhe tiver dado causa.',
    temas: ['orçamento', 'risco', 'responsabilidade'],
  },
  {
    id: 'a155', lei: 'Lei 14.133/2021', ref: 'Art. 155', titulo: 'Infrações da empresa',
    simples: 'A empresa pode ser punida, por exemplo, por não cumprir o contrato (no todo ou em parte), atrasar sem motivo, apresentar documento falso ou fraudar.',
    texto: 'Art. 155. O licitante ou o contratado será responsabilizado administrativamente pelas seguintes infrações: I - dar causa à inexecução parcial do contrato; II - dar causa à inexecução parcial do contrato que cause grave dano à Administração, ao funcionamento dos serviços públicos ou ao interesse coletivo; III - dar causa à inexecução total do contrato; […] VII - ensejar o retardamento da execução ou da entrega do objeto da licitação sem motivo justificado; VIII - apresentar declaração ou documentação falsa exigida para o certame ou prestar declaração falsa durante a licitação ou a execução do contrato; IX - fraudar a licitação ou praticar ato fraudulento na execução do contrato; […]',
    temas: ['sanção'],
  },
  {
    id: 'a156', lei: 'Lei 14.133/2021', ref: 'Art. 156', titulo: 'Sanções à empresa',
    simples: 'Advertência, multa (0,5% a 30% do valor do contrato), impedimento de contratar com o município por até 3 anos ou inidoneidade (3 a 6 anos, em todo o país). As anotações do fiscal são a prova.',
    texto: 'Art. 156. Serão aplicadas ao responsável pelas infrações administrativas previstas nesta Lei as seguintes sanções: I - advertência; II - multa; III - impedimento de licitar e contratar; IV - declaração de inidoneidade para licitar ou contratar. […] § 3º A sanção prevista no inciso II do caput deste artigo, calculada na forma do edital ou do contrato, não poderá ser inferior a 0,5% (cinco décimos por cento) nem superior a 30% (trinta por cento) do valor do contrato licitado ou celebrado com contratação direta […] § 4º […] impedirá o responsável de licitar ou contratar no âmbito da Administração Pública direta e indireta do ente federativo que tiver aplicado a sanção, pelo prazo máximo de 3 (três) anos. § 5º […] impedirá o responsável de licitar ou contratar no âmbito da Administração Pública direta e indireta de todos os entes federativos, pelo prazo mínimo de 3 (três) anos e máximo de 6 (seis) anos.',
    temas: ['sanção'],
  },
  {
    id: 'a157-158', lei: 'Lei 14.133/2021', ref: 'Arts. 157 e 158', titulo: 'Direito de defesa da empresa',
    simples: 'Antes de punir, a empresa tem 15 dias úteis para se defender. Impedimento e inidoneidade exigem processo conduzido por comissão de 2 ou mais servidores estáveis.',
    texto: 'Art. 157. Na aplicação da sanção prevista no inciso II do caput do art. 156 desta Lei, será facultada a defesa do interessado no prazo de 15 (quinze) dias úteis, contado da data de sua intimação. Art. 158. A aplicação das sanções previstas nos incisos III e IV do caput do art. 156 desta Lei requererá a instauração de processo de responsabilização, a ser conduzido por comissão composta de 2 (dois) ou mais servidores estáveis, que avaliará fatos e circunstâncias conhecidos e intimará o licitante ou o contratado para, no prazo de 15 (quinze) dias úteis, contado da data de intimação, apresentar defesa escrita e especificar as provas que pretenda produzir.',
    temas: ['sanção', 'prazo'],
  },
  {
    id: 'a162', lei: 'Lei 14.133/2021', ref: 'Art. 162', titulo: 'Multa de mora',
    simples: 'Atraso sem justificativa gera multa de mora, conforme o edital ou o contrato.',
    texto: 'Art. 162. O atraso injustificado na execução do contrato sujeitará o contratado a multa de mora, na forma prevista em edital ou em contrato.',
    temas: ['sanção', 'prazo'],
  },
  {
    id: 'a169', lei: 'Lei 14.133/2021', ref: 'Art. 169', titulo: 'As três linhas de defesa',
    simples: 'O controle das contratações tem três camadas. Fiscais, gestores e autoridades são a primeira — a mais importante, porque estão perto da execução.',
    texto: 'Art. 169. As contratações públicas deverão submeter-se a práticas contínuas e permanentes de gestão de riscos e de controle preventivo, inclusive mediante adoção de recursos de tecnologia da informação, e, além de estar subordinadas ao controle social, sujeitar-se-ão às seguintes linhas de defesa: I - primeira linha de defesa, integrada por servidores e empregados públicos, agentes de licitação e autoridades que atuam na estrutura de governança do órgão ou entidade; II - segunda linha de defesa, integrada pelas unidades de assessoramento jurídico e de controle interno do próprio órgão ou entidade; III - terceira linha de defesa, integrada pelo órgão central de controle interno da Administração e pelo tribunal de contas.',
    temas: ['controle', 'responsabilidade'],
  },
  {
    id: 'a169-p3', lei: 'Lei 14.133/2021', ref: 'Art. 169, § 3º', titulo: 'Erro formal × dano',
    simples: 'Erro só de forma se corrige e vira aprendizado. Irregularidade que causa dano é apurada, com responsabilização individual e envio ao Ministério Público quando for caso de crime.',
    texto: '§ 3º Os integrantes das linhas de defesa a que se referem os incisos I, II e III do caput deste artigo observarão o seguinte: I - quando constatarem simples impropriedade formal, adotarão medidas para o seu saneamento e para a mitigação de riscos de sua nova ocorrência, preferencialmente com o aperfeiçoamento dos controles preventivos e com a capacitação dos agentes públicos responsáveis; II - quando constatarem irregularidade que configure dano à Administração, sem prejuízo das medidas previstas no inciso I deste § 3º, adotarão as providências necessárias para a apuração das infrações administrativas, observadas a segregação de funções e a necessidade de individualização das condutas, bem como remeterão ao Ministério Público competente cópias dos documentos cabíveis para a apuração dos ilícitos de sua competência.',
    temas: ['controle', 'responsabilidade', 'risco'],
  },
  {
    id: 'cp337e', lei: 'Código Penal (incluído pela Lei 14.133/2021)', ref: 'Art. 337-E', titulo: 'Crime: contratação direta ilegal',
    simples: 'Contratar sem licitação fora dos casos da lei é crime.',
    texto: 'Art. 337-E. Admitir, possibilitar ou dar causa à contratação direta fora das hipóteses previstas em lei: Pena - reclusão, de 4 (quatro) a 8 (oito) anos, e multa.',
    temas: ['crime', 'risco'],
  },
  {
    id: 'cp337h', lei: 'Código Penal (incluído pela Lei 14.133/2021)', ref: 'Art. 337-H', titulo: 'Crime: mudança ou pagamento irregular',
    simples: 'Dar vantagem à empresa sem previsão (inclusive prorrogação) ou pagar fora da ordem cronológica é crime.',
    texto: 'Art. 337-H. Admitir, possibilitar ou dar causa a qualquer modificação ou vantagem, inclusive prorrogação contratual, em favor do contratado, durante a execução dos contratos celebrados com a Administração Pública, sem autorização em lei, no edital da licitação ou nos respectivos instrumentos contratuais, ou, ainda, pagar fatura com preterição da ordem cronológica de sua exigibilidade: Pena - reclusão, de 4 (quatro) anos a 8 (oito) anos, e multa.',
    temas: ['crime', 'pagamento', 'alteração', 'risco'],
  },
  {
    id: 'cp337l', lei: 'Código Penal (incluído pela Lei 14.133/2021)', ref: 'Art. 337-L', titulo: 'Crime: fraude em licitação ou contrato',
    simples: 'Entregar menos, entregar pior, trocar mercadoria ou encarecer o contrato por fraude é crime.',
    texto: 'Art. 337-L. Fraudar, em prejuízo da Administração Pública, licitação ou contrato dela decorrente, mediante: I - entrega de mercadoria ou prestação de serviços com qualidade ou em quantidade diversas das previstas no edital ou nos instrumentos contratuais; II - fornecimento, como verdadeira ou perfeita, de mercadoria falsificada, deteriorada, inservível para consumo ou com prazo de validade vencido; III - entrega de uma mercadoria por outra; IV - alteração da substância, qualidade ou quantidade da mercadoria ou do serviço fornecido; V - qualquer meio fraudulento que torne injustamente mais onerosa para a Administração Pública a proposta ou a execução do contrato: Pena - reclusão, de 4 (quatro) anos a 8 (oito) anos, e multa.',
    temas: ['crime', 'fiscalização', 'risco'],
  },
  {
    id: 'cp337m', lei: 'Código Penal (incluído pela Lei 14.133/2021)', ref: 'Art. 337-M', titulo: 'Crime: contratar empresa inidônea',
    simples: 'Admitir na licitação ou assinar contrato com empresa declarada inidônea é crime.',
    texto: 'Art. 337-M. Admitir à licitação empresa ou profissional declarado inidôneo: Pena - reclusão, de 1 (um) ano a 3 (três) anos, e multa. § 1º Celebrar contrato com empresa ou profissional declarado inidôneo: Pena - reclusão, de 3 (três) anos a 6 (seis) anos, e multa.',
    temas: ['crime', 'risco'],
  },
  {
    id: 'cp337p', lei: 'Código Penal (incluído pela Lei 14.133/2021)', ref: 'Art. 337-P', titulo: 'Multa nos crimes de licitação',
    simples: 'A multa penal desses crimes nunca é menor que 2% do valor do contrato.',
    texto: 'Art. 337-P. A pena de multa cominada aos crimes previstos neste Capítulo seguirá a metodologia de cálculo prevista neste Código e não poderá ser inferior a 2% (dois por cento) do valor do contrato licitado ou celebrado com contratação direta.',
    temas: ['crime'],
  },
  {
    id: 'l20', lei: 'LINDB', ref: 'Art. 20', titulo: 'Olhar as consequências práticas',
    simples: 'Quem decide (gestor, auditor, juiz) não pode decidir só com base em ideias abstratas: precisa considerar o efeito real da decisão.',
    texto: 'Art. 20: o julgador ou gestor não pode invalidar um ato administrativo ou proferir decisão baseando-se apenas em valores jurídicos abstratos; deve considerar os efeitos práticos e concretos da sua decisão. (resumo do material de referência — Lei nº 13.655/2018)',
    temas: ['responsabilidade', 'segurança jurídica'],
  },
  {
    id: 'l21', lei: 'LINDB', ref: 'Art. 21', titulo: 'Ao anular, dizer como regularizar',
    simples: 'Quem anula um ato ou contrato precisa apontar as consequências e o caminho para regularizar com o menor dano possível.',
    texto: 'Art. 21: ao anular um ato, contrato, ajuste ou processo administrativo, a decisão deve indicar expressamente as consequências e estabelecer as condições para que a regularização ocorra de forma proporcional e com o menor dano possível. (resumo do material de referência — Lei nº 13.655/2018)',
    temas: ['segurança jurídica'],
  },
  {
    id: 'l23', lei: 'LINDB', ref: 'Art. 23', titulo: 'Regra nova precisa de transição',
    simples: 'Quando muda o entendimento sobre uma norma, deve haver um tempo razoável para todos se adaptarem.',
    texto: 'Art. 23: quando houver mudança na interpretação de uma norma (nova orientação geral), a decisão deve prever regime de transição razoável, vedada a aplicação retroativa surpresa. (resumo do material de referência — Lei nº 13.655/2018)',
    temas: ['segurança jurídica'],
  },
  {
    id: 'l28', lei: 'LINDB', ref: 'Art. 28', titulo: 'Responsabilidade pessoal: dolo ou erro grosseiro',
    simples: 'Você responde pessoalmente se agir de má-fé (dolo) ou com erro grosseiro — aquele descuido grave que qualquer pessoa cuidadosa na função evitaria. Por isso: registre, pergunte e siga o procedimento.',
    texto: 'Art. 28. O agente público responderá pessoalmente por suas decisões ou opiniões técnicas em caso de dolo ou erro grosseiro.',
    temas: ['responsabilidade', 'segurança jurídica', 'risco'],
  },
  {
    id: 'l30', lei: 'LINDB', ref: 'Art. 30', titulo: 'Consultas dão segurança',
    simples: 'As respostas formais a consultas orientam a própria Administração. Na dúvida, consulte formalmente e guarde a resposta no processo.',
    texto: 'Art. 30: as respostas a consultas por órgãos públicos passam a ter caráter vinculante para a própria administração em relação ao consulente, garantindo previsibilidade. (resumo do material de referência — Lei nº 13.655/2018)',
    temas: ['segurança jurídica', 'proteção'],
  },
];

export const artigo = (id: string) => ARTIGOS.find((a) => a.id === id)!;

export const GLOSSARIO: Array<[string, string]> = [
  ['Aditivo (termo aditivo)', 'Documento que altera o contrato (prazo, valor, quantidade). Precisa ser assinado antes de a empresa executar a mudança (art. 132).'],
  ['Apostila', 'Anotação simples no contrato para registros que não o alteram: reajuste previsto, mudança de nome da empresa, empenho (art. 136).'],
  ['Ata de registro de preços (ARP)', 'Documento em que ficam registrados preços e fornecedores para contratações futuras; não obriga a contratar (arts. 6º, XLVI, e 83).'],
  ['Atesto', 'Declaração do gestor ou fiscal de que o serviço/bem da nota fiscal foi realmente entregue conforme o contrato. Atestar o que não foi entregue é gravíssimo.'],
  ['Contratação direta', 'Contratar sem licitação, apenas nos casos de dispensa ou inexigibilidade previstos em lei (arts. 72 a 75).'],
  ['DFD', 'Documento de Formalização de Demanda: o pedido formal da unidade, que dá início ao processo (art. 12, VII).'],
  ['Dolo', 'Intenção consciente de fazer algo errado ou de causar o resultado.'],
  ['Dotação orçamentária', 'A "caixinha" do orçamento de onde sai o dinheiro: unidade orçamentária, ação, natureza da despesa e fonte. Obrigatória no contrato (art. 92, VIII).'],
  ['Empenho', 'Reserva do dinheiro da dotação para um pagamento futuro ao fornecedor. É o primeiro estágio da despesa.'],
  ['Erro grosseiro', 'Erro evidente, por negligência, imprudência ou imperícia graves — o que um profissional minimamente cuidadoso não cometeria (LINDB, art. 28).'],
  ['ETP', 'Estudo Técnico Preliminar: analisa a necessidade e a melhor solução antes de contratar (art. 6º, XX, e art. 18, § 1º).'],
  ['Fiscal do contrato', 'Servidor designado para acompanhar a execução, registrar ocorrências e exigir correções (art. 117).'],
  ['Gestor do contrato', 'Servidor designado para a gestão administrativa do contrato (vigência, saldo, aditivos, prorrogações, pedidos da empresa), conforme portaria e regulamento.'],
  ['Liquidação', 'Etapa em que se confirma que o credor tem direito ao pagamento, com base no que foi entregue e atestado.'],
  ['Ordem cronológica', 'Fila de pagamentos por ordem de exigibilidade, por fonte de recurso e categoria de contrato (art. 141).'],
  ['PNCP', 'Portal Nacional de Contratações Públicas, onde editais, contratos e aditivos devem ser divulgados (art. 174).'],
  ['Preposto', 'Representante da empresa aceito pela Administração, com quem o fiscal trata a execução (art. 118).'],
  ['Recebimento provisório / definitivo', 'O fiscal recebe primeiro (provisório); servidor ou comissão designada confirma depois (definitivo) (art. 140).'],
  ['Reajuste / repactuação', 'Atualização do preço prevista no contrato: por índice (reajuste) ou pela variação de custos de mão de obra (repactuação) (arts. 6º, LVIII e LIX).'],
  ['Segregação de funções', 'Dividir as etapas entre pessoas diferentes para evitar erros e fraudes (art. 7º, § 1º).'],
  ['Sobrepreço', 'Preço orçado ou contratado muito acima do mercado (art. 6º, LVI).'],
  ['Superfaturamento', 'Dano ao dinheiro público na execução: pagar por mais do que foi entregue, aceitar serviço pior, etc. (art. 6º, LVII).'],
  ['Suplente', 'Substituto do fiscal nas ausências; enquanto atua, tem as mesmas responsabilidades (art. 117: "ou pelos respectivos substitutos").'],
  ['Termo de Referência (TR)', 'Documento que descreve o que será contratado e como será executado, medido, fiscalizado e pago (art. 6º, XXIII).'],
];

export interface Pergunta { pergunta: string; opcoes: string[]; certa: number; explicacao: string; ref: string }

export const QUIZ: Pergunta[] = [
  { pergunta: 'A empresa entregou 80 das 100 cadeiras contratadas e a nota fiscal veio com 100. O que você faz?',
    opcoes: ['Atesto a nota inteira para não atrasar o pagamento', 'Atesto só o que foi entregue, registro a ocorrência e comunico a falta', 'Peço para a empresa entregar o resto depois e atesto agora'],
    certa: 1, explicacao: 'Atestar quantidade maior do que a entregue é exemplo de superfaturamento e pode configurar crime. Registre a ocorrência e cobre a entrega.', ref: 'Art. 6º, LVII, a; art. 117, § 1º; art. 337-L' },
  { pergunta: 'O responsável pela unidade pediu "de boca" para a empresa fazer um serviço extra que não está no contrato. Isso é válido?',
    opcoes: ['Sim, se for urgente', 'Não: contrato verbal é nulo e a mudança exige termo aditivo antes da execução', 'Sim, desde que a empresa concorde'],
    certa: 1, explicacao: 'Alteração precisa de justificativa e termo aditivo assinado antes da execução (ou, em urgência justificada, formalizado em até 1 mês).', ref: 'Arts. 95, § 2º; 124; 132' },
  { pergunta: 'Até quanto a Administração pode acrescer, por decisão própria, um contrato de serviço comum?',
    opcoes: ['10%', '25% do valor inicial atualizado', '50% em qualquer caso'],
    certa: 1, explicacao: 'O limite é 25%. Os 50% valem só para acréscimos em reforma de edifício ou de equipamento.', ref: 'Art. 125' },
  { pergunta: 'Em contrato de limpeza com mão de obra exclusiva, a empresa atrasou o FGTS dos empregados e o fiscal nunca conferiu. Qual o risco?',
    opcoes: ['Nenhum: a dívida é só da empresa', 'O município pode ter de pagar os encargos, porque houve falha na fiscalização', 'Só a empresa leva multa'],
    certa: 1, explicacao: 'Comprovada a falha na fiscalização, a Administração responde solidariamente pelos encargos previdenciários e subsidiariamente pelos trabalhistas.', ref: 'Arts. 50 e 121, § 2º' },
  { pergunta: 'Uma nota chegou depois de outras da mesma fonte e categoria, mas o fornecedor pede para ser pago primeiro. O que diz a lei?',
    opcoes: ['Pode, se o valor for pequeno', 'Só com justificativa prévia nas hipóteses da lei; furar a fila sem motivo gera apuração e pode ser crime', 'Pode, se o gestor autorizar verbalmente'],
    certa: 1, explicacao: 'A ordem cronológica só muda nas situações do § 1º, com justificativa prévia e comunicação ao controle interno e ao tribunal de contas.', ref: 'Art. 141; art. 337-H' },
  { pergunta: 'Quando o servidor responde pessoalmente por uma decisão técnica, segundo a LINDB?',
    opcoes: ['Sempre que houver qualquer erro', 'Em caso de dolo ou erro grosseiro', 'Nunca, a responsabilidade é só do órgão'],
    certa: 1, explicacao: 'A responsabilidade pessoal exige dolo ou erro grosseiro. Por isso registrar, consultar e seguir o procedimento protege você.', ref: 'LINDB, art. 28' },
  { pergunta: 'O que o fiscal deve fazer quando o problema é maior do que ele pode resolver?',
    opcoes: ['Aguardar o fim do contrato', 'Informar os superiores em tempo hábil', 'Resolver diretamente com a empresa, sem registro'],
    certa: 1, explicacao: 'O fiscal informa a chefia a tempo de serem adotadas as medidas, e pode pedir apoio ao jurídico e ao controle interno.', ref: 'Art. 117, §§ 2º e 3º' },
  { pergunta: 'Quem faz o recebimento provisório de um serviço?',
    opcoes: ['A empresa contratada', 'O responsável pelo acompanhamento e fiscalização, com termo detalhado', 'O setor financeiro'],
    certa: 1, explicacao: 'O provisório é do fiscal; o definitivo, de servidor ou comissão designada.', ref: 'Art. 140' },
  { pergunta: 'Existe "tomada de preços" na Lei 14.133/2021?',
    opcoes: ['Sim', 'Não: as modalidades são pregão, concorrência, concurso, leilão e diálogo competitivo', 'Só para obras'],
    certa: 1, explicacao: 'A lei listou cinco modalidades e proibiu criar outras ou combiná-las.', ref: 'Art. 28' },
  { pergunta: 'A empresa pediu reequilíbrio do contrato. Em quanto tempo a Administração deve decidir, em regra?',
    opcoes: ['Não há prazo', '1 mês após concluída a instrução, prorrogável uma vez por igual período', '1 ano'],
    certa: 1, explicacao: 'Todo pedido relacionado à execução exige decisão expressa, em regra em 1 mês.', ref: 'Art. 123' },
  { pergunta: 'Pode-se pagar a empresa antes de ela entregar, para "garantir o preço"?',
    opcoes: ['Sim, sempre', 'Não, salvo exceção justificada e prevista no edital ou no instrumento da contratação direta', 'Sim, se a empresa der recibo'],
    certa: 1, explicacao: 'Pagamento antecipado é proibido como regra.', ref: 'Art. 145' },
  { pergunta: 'Na SMS Aracaju, quem lança o DFD de execução quando o processo licitatório já está concluído (ata ou contrato vigente)?',
    opcoes: ['Cada diretoria', 'O setor de planejamento, na caixa SMS-DF-CP-DFD', 'A empresa contratada'],
    certa: 1, explicacao: 'Para iniciar processo licitatório, cada diretoria lança. Com ata ou contrato vigente, o planejamento (SMS-DF-CP-DFD).', ref: 'Memorando 51.800/2026 (SMS)' },
];

// Material municipal de Aracaju informado pelo órgão
export const NORMAS_ARACAJU = {
  instrucoes: [
    { titulo: 'Instrução Normativa Conjunta nº 03/2026', resumo: 'Altera a Instrução Normativa Conjunta nº 01, de 11/07/2023 (DOM de 14/07/2023): arts. 6º e 8º; anexo único com a informação do orçamento sigiloso, inclusão do item 2.6 e alteração do item 2.4 com observação.' },
    { titulo: 'Instrução Normativa Conjunta nº 04/2026', resumo: 'Altera a Instrução Normativa Conjunta nº 02, de 11/07/2023 (DOM de 14/07/2023): arts. 8º, 9º, 34, 51 e 88; altera os anexos II, IV, V, VI, VII, VIII, IX, X, XI, XII, XIII, XIV, XV, XIX e XXII; inclui os anexos XXX a XXXIV.' },
  ],
  publicacao: 'Instruções Normativas Conjuntas nº 03 e 04, de 20 de maio de 2026, da Procuradoria-Geral do Município, Controladoria-Geral do Município e Secretaria Municipal do Planejamento, Orçamento e Gestão, publicadas no Diário Oficial do Município de Aracaju em 26/05/2026. A CCL/SEPLOG aplica o conteúdo a contar de 29/05/2026.',
  linkModelos: 'https://aracajucompras.se.gov.br/i2gov/GED.aspx?link=PCQDcftphtSnYRExIHe1V%2bU0Xo%2bMrwZvogWIEMjAU0BxiV2cViaO5SGV3uW2HE0f',
  comissao: [
    ['Alysson Reinan de Oliveira Sales', 'Central de Compras e Licitações (SEPLOG)', '4009-7837'],
    ['Ana Virgínia Ramos Conceição', 'Procuradoria-Geral do Município', '3179-1175'],
    ['Felipe dos Santos Cruz', 'Central de Compras e Licitações (SEPLOG)', ''],
    ['Gleyse Lilian Silva de Andrade', 'Central de Compras e Licitações (SEPLOG)', '4009-7942'],
    ['Isabela Dantas Seabra', 'Central de Compras e Licitações (SEPLOG)', '4009-7835'],
    ['Luciana Oliveira da Paixão', 'Central de Compras e Licitações (SEPLOG)', '4009-7835'],
    ['Sônia Regina de Oliveira', 'Central de Compras e Licitações (SEPLOG)', '4009-7837'],
    ['Valéria Carla Vaz Correia da Fonseca', 'Procuradoria-Geral do Município', '3179-1175'],
  ] as Array<[string, string, string]>,
  dfd: {
    memorando: 'Memorando 51.800/2026 (1Doc), de 05/05/2026 — Assessoria de Planejamento (SMS-DF-CP-DFD)',
    responsaveis: [
      ['DVAS', 'Anne Karoline Cruz Santos', 'SMS-DVAS-AT'],
      ['DRMAAC', 'Lidiane Maria Barbosa Calado Lisboa', 'SMS-DRMAAC'],
      ['DADM', 'Ana Carolayne Lima de Jesus Santos', 'SMS-DADM-CSA-GA'],
      ['Almoxarifado', 'Alisson de Melo Cardoso, Fabio de Mendonça Mota e Joéliton da Silva Junior', 'SMS-DADM-CAP-GA-SA'],
      ['GS, NUJUR, CI e DF', 'Lycia Gabriella Menezes Silva', 'SMS-DF-CP-DFD'],
    ] as Array<[string, string, string]>,
  },
};
