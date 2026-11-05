# Segurança, desempenho e LGPD

## Testes de segurança

Os testes de banco (`npm run test:db`) rodam todas as migrações num Postgres em memória e conferem mais de 400 itens. Entre eles:
- **Isolamento:** um órgão não lê nem grava dados de outro, mesmo passando o id.
- **Escopo:** uma coordenação não altera a vizinha. A diretoria lê a sua subárvore. O fiscal designado vê só o contrato da designação e perde o acesso quando a designação termina.
- **Papéis somente leitura:** não escrevem pela API.
- **Varredura automática:**
  - toda tabela pública tem RLS;
  - nenhuma função ou tabela fica acessível sem login (papel `anon`);
  - nenhuma função de gatilho fica executável pela API;
  - toda função `security definer` fixa o `search_path`.
- **Documentos emitidos e auditoria:** não aceitam edição.

No Supabase de produção, a mesma varredura não encontrou problemas. Sobre o relatório **Security Advisor**:
- **Visões `security definer` (`v_contratos`, `v_empenhos`, `v_notas`, `v_contrato_dotacoes`, `v_nota_unidades`).** São intencionais. O fiscal com papel Servidor precisa ver o nome do fornecedor e da unidade do contrato onde está designado, sem ter acesso a esses cadastros. Cada visão filtra explicitamente por escopo **ou** designação, e os testes cobrem os dois caminhos.
- **"Função security definer executável por usuário logado".** São as funções de negócio chamadas pelo app. Cada uma valida permissão no início. Auxiliares internos que não precisam da API tiveram o acesso retirado (migração `20261108000200`).
- **Proteção contra senhas vazadas.** Só existe no plano Pro. Hoje a senha exige 10 ou mais caracteres, com maiúscula, minúscula e número.

## Teste de carga (Fase 8)

Massa no órgão de homologação: 3.000 servidores em 20 gerências, 200 fornecedores, 400 contratos, 2.000 empenhos, 30.000 notas fiscais e 66 mil registros de auditoria. Os tempos foram medidos pela API (PostgREST), logado como Administrativo da Coordenação, com RLS ativo.

| Consulta | Antes da otimização | Depois |
|---|---|---|
| Relatório completo de notas (página + total) | estourava o limite de 8 s | 1,2 s |
| Totais do relatório | estourava | 1,0 s |
| Resumo de consumo | estourava | 0,8 s |
| Painel do ano | estourava | 0,6 s |
| Lista de notas (página de 25 + total) | 6,3 s | 0,18 s |
| Busca de servidores | 2,0 s | 0,18 s |
| Consolidado da Coordenação (3.000 servidores) | 2,4 s | 0,34 s |
| Auditoria (contagem de 66 mil registros, Master) | — | 0,09 s |

O que mudou (migração `20261108000300_desempenho.sql`):
- **Conjuntos calculados uma vez.** A permissão (`pode()`) era verificada linha a linha. Agora o conjunto de unidades acessíveis, de órgãos permitidos e de contratos designados é calculado uma vez por consulta e aplicado por junção hash. As regras de acesso são as mesmas, e todos os testes de isolamento e escopo passam.
- **Filtros lidos uma vez.** O relatório lê os filtros uma única vez e resolve a classificação orçamentária sobre a tabela de classificações, não sobre cada nota.
- **Totais.** O relatório roda uma só vez para os totais; antes rodava quatro.
- **Paginação do consolidado.** A tela busca o consolidado em páginas de 1.000, que é o limite da API.

## LGPD

### Inventário de dados pessoais

| Dado | Onde | Quem acessa | Finalidade |
|---|---|---|---|
| Nome, matrícula, cargo, função, lotação, nomeação/exoneração | `servidores` | Quem tem "servidores: ler" no escopo; o próprio servidor | Gestão funcional, designação em contratos, consolidado |
| CPF, nascimento, nome da mãe, naturalidade, tipo sanguíneo, e-mail pessoal, endereço | `servidores_dados_pessoais` (tabela separada) | Só com a permissão "servidores_sensiveis" e o próprio servidor; mascarados na auditoria | Cadastro funcional exigido pelo órgão. O tipo sanguíneo é opcional (decisão 8) |
| Frequência mensal (atrasos, faltas, justificativa) | `frequencias_mensais` | Mesmo escopo de servidores | Consolidado mensal |
| E-mail, nome, foto e último acesso de usuários | `perfis` / Auth | O próprio usuário e a administração do órgão | Acesso ao sistema |
| CPF/CNPJ e dados bancários de fornecedores | `fornecedores`, `fornecedor_contas` | Escopo de fornecedores | Execução contratual e pagamento |
| Registros de auditoria | `auditoria` | Master/auditoria do órgão; a plataforma | Rastreabilidade (art. 37 da LGPD) |
| Erros do navegador (página, navegador, usuário) | `erros_aplicativo` | Só a plataforma | Manutenção do sistema |

### Medidas aplicadas

- **Minimização.** Os dados sensíveis ficam numa tabela separada, com permissão própria. As listas mostram só o necessário.
- **Controle de acesso no banco.** RLS em todas as tabelas, por órgão, unidade e papel. A tela só esconde botões; quem decide é o banco.
- **Rastreabilidade.** A auditoria guarda valores antes/depois, com os campos sensíveis mascarados. Exportações, cópias de segurança e emissões ficam registradas.
- **Correção pelo titular.** O servidor atualiza telefone, e-mail pessoal e endereço em "Meu perfil"; os demais dados, pela administração.
- **Armazenamento.** Os arquivos ficam em storage privado por órgão, acessados com URLs temporárias.
- **Proteção em trânsito e em repouso.** Tudo trafega por HTTPS, e o Supabase cifra disco e backups.
- **Cópia de segurança.** Só o Master gera, e o aviso na tela lembra que o arquivo contém dados pessoais.

### Retenção e descarte

O sistema **não apaga** registros fisicamente: usa inativação com motivo e documentos históricos imutáveis. A política formal de retenção e descarte, conforme a tabela de temporalidade do órgão, fica **a cargo do órgão** (decisão 12). Quando ela for definida, o descarte será feito por rotina auditada, executada pela plataforma.

### Incidentes

O procedimento está em [OPERACAO.md](OPERACAO.md#incidentes-resumo).
