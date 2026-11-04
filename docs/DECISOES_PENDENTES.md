# Decisões pendentes e propostas

O documento-base (item 25) lista regras que dependem do órgão. Para nenhuma delas o MEASURE inventa uma regra definitiva. Cada item abaixo traz uma proposta e a fase em que a resposta passa a ser necessária.

| # | Decisão | Proposta | Necessária na |
|---|---|---|---|
| 1 | O que conta como **"consumo"** no relatório resumido: nota emitida, liquidado ou pago? | Implantado nas Fases 3 e 4: **consumido = notas fiscais registradas e não canceladas**, separado de empenhado e de pago (que nunca se somam). No relatório da Fase 5 a métrica poderá ser escolhida. | ✔ provisório (confirmar) |
| 2 | **Pagamento parcial** é permitido? | Implantado: sim. A nota fica `PARCIAL` até a soma dos pagamentos igualar o valor e só então vira `PAGO`. O pagamento só é liberado depois do atesto. | ✔ Fase 4 (confirmar) |
| 3 | **Aditivo** aprovado vira **novo contrato**? Quem aprova? | Implantado: o aditivo nasce em rascunho e quem tem "aprovar contratos" (Master) aprova ou rejeita. Aprovado, ele ajusta vigência e valor atuais sem sobrescrever o original. A **renovação** é uma ação à parte, que cria um contrato novo ligado ao anterior. | ✔ Fase 3 (confirmar) |
| 4 | **Modelos oficiais** de checklist, atesto, consolidado mensal e extratos | Aguardando os PDFs do órgão. O layout será reproduzido com fidelidade. | Fases 4 e 6 |
| 5 | **Texto do atesto** e número/conteúdo do **decreto** | Texto configurável por órgão em Configurações (`tenant_configuracoes.textos`). | Fase 4 |
| 6 | **Limite de anexos** | Já é configurável por órgão (padrão de 10 MB, máximo de 50 MB). | ✔ Fase 1 |
| 7 | **Domínios de e-mail** por órgão | Já é configurável pela plataforma (ex.: `aracaju.se.gov.br`). | ✔ Fase 1 |
| 8 | **Tipo sanguíneo** no cadastro de servidor | Implantado como opcional, na tabela de dados pessoais (permissão própria) e mascarado na auditoria. Se o órgão não precisar, basta não preencher. | ✔ Fase 2 (confirmar) |
| 9 | Campos que o **servidor** edita no próprio cadastro | Implantado: telefone, e-mail pessoal e endereço. Os demais campos são da administração. | ✔ Fase 2 (confirmar) |
| 10 | **Classificação orçamentária** por órgão ou global? | Implantado: por órgão. A importação de modelo da plataforma fica para a Fase 7. | ✔ Fase 2 |
| 11 | Provedores de **CNPJ/CEP** | Implantado: BrasilAPI, com ViaCEP de reserva para CEP. Se falharem, o preenchimento é manual. | ✔ Fase 2 |
| 16 | Nomes completos das diretorias **DITEC, DRMAAC e DVAS** da SMS Aracaju | Informados pelo usuário e aplicados: Diretoria Técnica; Diretoria de Regulação, Monitoramento, Avaliação de Contratos, Auditoria e Parcerias; Diretoria de Vigilância e Atenção à Saúde. | ✔ |
| 12 | **Retenção** de dados e documentos | Nada é apagado fisicamente pelo app. A política formal de retenção e descarte fica a cargo do órgão. | Fase 8 |
| 13 | **Patrimônio** e **Comunidade** | Escopo não detalhado. Não serão implementados sem levantamento. | Fase 7 |
| 14 | **Hospedagem na Vercel** | `vercel.json` pronto, com cabeçalhos de segurança e CSP. Falta conectar a conta da Vercel ao repositório. | Quando decidir |
| 15 | **Logotipo oficial** do MEASURE | Hoje é usado um símbolo provisório (barras com linha de tendência). Basta enviar o oficial para substituir. | Quando enviar |
