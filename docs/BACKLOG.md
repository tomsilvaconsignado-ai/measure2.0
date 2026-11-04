# Backlog por fase

Cada fase é entregue integrada às anteriores, com testes de banco, unitários e de ponta a ponta.

## Fase 1: Fundação ✔
- [x] Órgãos (tenants), com identidade, brasão, domínios de e-mail, ativação e suspensão com motivo
- [x] Estrutura organizacional em árvore livre, com mover, inativar e filtrar
- [x] Perfis, vínculos com vários papéis e órgãos, órgão padrão
- [x] Papéis, recursos, ações, a matriz editável e quem concede o quê
- [x] RLS em todas as tabelas, com autorização por papel e escopo (subárvore)
- [x] Sessão de suporte da plataforma, com motivo, prazo e auditoria
- [x] Auditoria imutável, com antes e depois, campos alterados e justificativa
- [x] Storage privado com metadados (`documentos`), exclusão lógica e limite por órgão
- [x] Convites por e-mail (Edge Function) e reenvio de acesso
- [x] E-mails de autenticação em português, enviados pelo Gmail do sistema
- [x] Telas: login, recuperação de senha, ativação, início, órgãos, estrutura, usuários, matriz, auditoria, configurações e perfil
- [x] Componentes: busca digitável no servidor, máscaras BRL/CNPJ/CPF/CEP/telefone, erros por campo, confirmação com motivo
- [x] Testes: 125 verificações de banco, 11 unitários e 33 de ponta a ponta contra o Supabase real

## Fase 2: Cadastros ✔
- [x] Fornecedores:
  - PJ/PF com CNPJ e CPF validados no banco;
  - CNPJ completo busca os dados na Receita (BrasilAPI) e o CEP preenche o endereço;
  - logomarca, contas bancárias com Pix, documentos;
  - ordem A–Z e inativação com motivo.
- [x] Servidores:
  - ativos e exonerados no mesmo cadastro (a situação vem da data de exoneração), aniversariantes do mês;
  - foto, documentos funcionais e busca por nome, matrícula, cargo, unidade ou CPF.
- [x] Dados pessoais dos servidores (LGPD):
  - ficam em tabela separada, com permissão própria (`servidores_sensiveis`) e mascarados na auditoria;
  - o próprio servidor vê os seus dados e atualiza contato e endereço.
- [x] Unidades atendidas, com grupos de rateio (obrigatório ou opcional) e unidades componentes.
- [x] Classificação orçamentária:
  - 13 tipos de classificador, com dependências (subelemento → elemento, detalhamento → fonte, ação → programa);
  - dotações combinando os classificadores, com código completo montado pelo banco e sem duplicar combinações.
- [x] Tipos de serviço administráveis; cada órgão começa com os 10 padrão.
- [x] Consulta de CNPJ também no cadastro de órgão.
- [x] Estrutura da SMS Aracaju carregada: 33 unidades.
- [ ] Antes de inativar um fornecedor, avisar sobre contratos, empenhos e notas: entra junto com a Fase 3.

## Fase 3: Contratos
- Cadastro com fornecedor do cadastro central, vigentes e vencidos calculados por data, alertas de vencimento
- Gestor, fiscal e suplente vindos de Servidores (designações dão acesso só àquele contrato)
- Portarias com vários PDFs por área
- Dotação ligada a várias classificações (tabela associativa)
- Pregão, aditivos e renovações (ver decisão 3)

## Fase 4: Execução financeira
- Empenhos ligados à classificação efetivamente usada, reforços, saldo e extrato
- Notas fiscais em 4 abas, meses de referência, rateio sem duplicar valor
- Atesto por designação, pagamento (decisão 2), cancelamento com histórico
- Checklist e extratos em PDF com retrato fiel dos dados (snapshot)

## Fase 5: Consulta e relatórios
- Relatório completo por classificação: vários anos, contratos e fornecedores; filtros combinados (E entre campos, OU dentro do campo)
- Relatório resumido de consumo (decisão 1)
- PDF com cabeçalho do órgão e Excel com uma coluna por campo, totais por ano e total geral

## Fase 6: Servidores e consolidado mensal
- Atrasos e faltas por mês, observações automáticas de nomeação e exoneração
- Consolidado em PDF paisagem, fiel ao modelo do órgão, com versão histórica imutável

## Fase 7: Painel e demais módulos
- Painel por papel com contagens agregadas no banco
- Notificações, ordens de serviço (NNNN/ANO), importação e exportação com prévia e detecção de duplicados

## Fase 8: Homologação e produção
- Testes de segurança e de carga, revisão da LGPD, migração dos dados do sistema antigo, backup e restauração, manual e treinamento
