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

## Fase 3: Contratos ✔
- [x] Cadastro com fornecedor do cadastro central e modalidade (com explicação de cada tipo)
- [x] Situação calculada pelas datas e aditivos: vigente, a vencer (pelos dias de alerta do órgão), vencido e não iniciado
- [x] Abas Vigentes e Vencidos, em ordem A–Z pelo fornecedor e depois pelo número
- [x] Gestor, fiscal e suplente vindos de Servidores, inclusive de outra coordenação:
  - a designação dá acesso só àquele contrato;
  - encerrar a designação mantém o histórico.
- [x] Portarias de gestor, fiscal e suplente, com vários PDFs em cada área
- [x] Dotação com várias classificações (N:N); a classificação usada por empenho não pode ser removida
- [x] Aditivos de prazo, valor, prazo e valor, supressão e outros:
  - nascem em rascunho e passam por aprovação ou rejeição;
  - o valor original do contrato não é sobrescrito.
- [x] Renovação como contrato novo, ligado ao anterior; o anterior fica como histórico.
- [x] Resumo financeiro: valor original, aditivos, valor atual, empenhado, consumido (notas), pago e saldo, com barras de uso.

## Fase 4: Execução financeira ✔
- [x] Empenhos ligados à dotação efetivamente usada, que precisa estar vinculada ao contrato
  - Também: reforços (com cancelamento auditado), unidades atendidas e barra de saldo.
- [x] Nota fiscal em 4 abas: contrato, dados, referência e texto de atesto
  - Aviso de contrato vencido; o bloqueio é configurável.
  - Saldo do empenho conferido no banco; a exceção exige justificativa e permissão de aprovar.
  - Meses de referência e período.
  - Rateio entre unidades, sem duplicar o valor. Grupo com rateio obrigatório entra com as unidades componentes.
- [x] Atesto só pelo gestor, fiscal ou suplente designado, com o texto gerado pelo modelo do órgão (copiável). Nome e matrícula de quem atestou ficam guardados.
- [x] Pagamento depois do atesto: parcial (PARCIAL) até a quitação (PAGO); cancelamentos com motivo.
- [x] Extratos do contrato e do empenho com retrato imutável dos dados, para impressão em A4 ou PDF.
- [ ] Checklist da nota fiscal no modelo oficial: aguardando o PDF de referência do órgão.

## Fase 5: Consulta e relatórios ✔
- [x] Relatório completo de notas por classificação: vários anos, contratos, fornecedores, unidades, dotações e status
  - Filtros combinados: E entre campos, OU dentro do mesmo campo.
  - Ano pelo empenho (padrão) ou pela emissão. Paginação no banco, com totais por ano e total geral.
- [x] Relatório resumido de consumo: métrica notas, pago ou empenhado (decisão 1), detalhado por subelemento ou fonte.
- [x] PDF com o cabeçalho do órgão (impressão A4) e Excel com uma coluna por campo; toda exportação fica na auditoria.

## Fase 6: Servidores e consolidado mensal ✔
- [x] Lançamento mensal de atrasos, faltas e justificativa, sem alterar o cadastro permanente do servidor.
- [x] Observações automáticas, com texto ajustável à mão:
  - "Nomeação em DD/MM/AAAA." e "Exoneração em DD/MM/AAAA." no mês;
  - "Justificativa anexada.";
  - "Frequência integral.".
- [x] Filtro por Coordenação (inclui as Gerências e setores subordinados), Gerência ou setor.
  - Servidores ativos no mês, em ordem alfabética, sem duplicar.
- [x] Consolidado em A4 paisagem, com prévia e emissão. A versão emitida é histórica e imutável.
  - Cabeçalho da tabela repetido a cada página, rodapé com endereço e Secretaria, assinaturas configuráveis.
- [x] Título configurável em Configurações; o nome do filtro não entra no título.
- [ ] Ajuste fino do layout quando o órgão enviar o PDF oficial (decisão 4).
- [x] Checklist da nota fiscal (Fase 4): conferências automáticas do sistema e itens documentais configuráveis, emitido como documento histórico.

## Fase 7: Painel e demais módulos ✔
- [x] Painel por ano, com números agregados no banco e restritos ao escopo de cada pessoa
  - Contratos a vencer, empenhado × consumido × pago, notas pendentes de atesto e de pagamento, consumo por mês e por fornecedor.
- [x] Notificações no sino: atesto pendente, contrato vencendo, pagamento pendente e saldo de empenho abaixo de 10%.
- [x] Ordens de serviço com número NNNN/ANO gerado no banco, unidades atendidas e cancelamento com motivo.
- [x] Importação de fornecedores, servidores e unidades atendidas por planilha (xlsx/csv)
  - Prévia com erros e duplicados, gravação tudo-ou-nada.
- [x] Exportação em Excel desses cadastros, com modelo de planilha para download.
- [ ] Patrimônio e Comunidade: aguardando levantamento (decisão 13).

## Fase 8: Homologação e produção
- [x] Testes de segurança automatizados (`npm run test:db`). Verificam que:
  - toda tabela tem RLS;
  - nenhuma função ou tabela fica acessível sem login;
  - as funções de gatilho não são expostas;
  - toda função security definer fixa o search_path.
  - Auxiliares internos tiveram o acesso pela API retirado. Ver [SEGURANCA_LGPD.md](SEGURANCA_LGPD.md).
- [x] Teste de carga com 30 mil notas, 2 mil empenhos, 400 contratos e 3 mil servidores. Todas as consultas ficam abaixo de 1,3 s pela API.
  - A checagem de permissão linha a linha foi trocada por conjuntos calculados uma vez por consulta.
- [x] Testes de ponta a ponta das Fases 1 a 8 (navegador real contra o Supabase de produção, em órgão de homologação).
- [x] Revisão LGPD: inventário de dados pessoais, acessos, retenção e incidentes. Ver [SEGURANCA_LGPD.md](SEGURANCA_LGPD.md).
- [x] Backup e restauração: cópia de segurança JSON por órgão (Master) e procedimento de restauração. Ver [OPERACAO.md](OPERACAO.md).
- [x] Monitoramento de erros no navegador, com tela "Erros do sistema" para a plataforma e tela amigável em caso de falha.
- [x] Manual do usuário dentro do sistema (menu "Ajuda e manual"), com busca.
- [ ] Migração dos dados do sistema antigo: depende da exportação do sistema atual. As importações por planilha já aceitam fornecedores, servidores e unidades.
- [ ] Treinamento com os usuários do órgão.
