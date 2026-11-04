# Arquitetura do MEASURE 2.0

Plataforma SaaS multi-tenant de gestão de contratos e despesas públicas. Independente do Base44 e do Gemini: código-fonte, banco e políticas de segurança ficam versionados neste repositório.

## Stack e motivos

| Camada | Escolha | Por quê |
|---|---|---|
| Interface | React 19 + TypeScript (estrito) + Vite | Tipagem forte nas regras de tela, build rápido, ecossistema estável. |
| Estilo | Tailwind CSS 4 + componentes próprios (`src/components/ui`) | Visual institucional consistente, sem dependência de biblioteca de UI pesada. |
| Dados no cliente | TanStack Query | Cache com invalidação após cada alteração (o documento exige que mudanças apareçam sem novo login). |
| Banco | Supabase Postgres | Relacional, com RLS: a autorização vive no banco e vale para qualquer cliente (tela, API, integração). |
| Autenticação | Supabase Auth (e-mail + senha, só por convite) | Cadastro público desligado, senha forte, confirmação de e-mail, avisos de segurança. |
| Arquivos | Supabase Storage, buckets privados | URLs temporárias; a política do storage consulta o banco antes de liberar cada arquivo. |
| Funções de servidor | Supabase Edge Functions (Deno) | Só para o que exige chave de serviço (criar conta e enviar convite). |
| E-mail | SMTP do Gmail (measuresistemas@gmail.com) | Modelos em português com a identidade MEASURE (`supabase/templates`). |
| Hospedagem | GitHub Pages (atual) e Vercel (`vercel.json` pronto) | O documento pede Vercel; enquanto a conta não é conectada, o GitHub Pages publica a cada push na `main`. |
| Testes | PGlite (Postgres em memória) + Vitest + Playwright | As regras de segurança são testadas no Postgres real, sem precisar de servidor. |

## Modelo multi-tenant

```
PLATAFORMA (perfis.is_platform_admin)
└── ÓRGÃO / TENANT (tenants)                    ← isolamento rigoroso
    └── ESTRUTURA (unidades_organizacionais)    ← árvore livre: Organização, Secretaria,
        └── …                                     Diretoria, Coordenação, Gerência, Setor, Unidade
            └── VÍNCULOS (vinculos)              ← pessoa + papel + unidade de escopo
```

- Cada registro de negócio tem `tenant_id` obrigatório, e o gatilho `bloquear_troca_tenant` impede mudá-lo depois.
- A árvore não tem níveis fixos. Cada unidade guarda o `caminho` (ids da raiz até ela, mantido por gatilho). Assim, verificar se a unidade X está dentro do escopo Y é só `Y = any(X.caminho)`, com índice GIN.
- Um vínculo vale para a unidade dele **e toda a subárvore**. Vínculo sem unidade vale para o órgão inteiro.
- A mesma pessoa pode ter vários vínculos, em vários órgãos. Um deles é o padrão (`padrao`).

## Autorização

Toda verificação passa por `public.pode(tenant, unidade, recurso, acao, estrito)`, chamada pelas políticas RLS:

1. **Administrador da plataforma:**
   - Sempre pode usar os recursos marcados `livre_para_plataforma`: estrutura, usuários, configurações e auditoria.
   - Para os demais recursos (os dados operacionais), só com **sessão de suporte** ativa, que tem motivo, prazo e auditoria.
2. **Demais pessoas:** precisam ter um vínculo ativo que cumpra todas as condições abaixo:
   - perfil ativo;
   - órgão ativo;
   - papel com a permissão `recurso:acao` na matriz;
   - unidade do registro dentro do escopo do vínculo.
3. **Registro sem unidade** (cadastro do órgão inteiro, como fornecedores): qualquer escopo do órgão pode usá-lo. A exceção é o modo `estrito`, que exige escopo no órgão inteiro.

Garantias que estão no banco (e não só na tela):
- **Somente leitura:** papéis de consulta (Gestão Municipal, Secretário, Diretoria, Coordenador e Servidor) nunca recebem ação de escrita. O gatilho `valida_permissao_papel` recusa até a tentativa de marcar isso na matriz.
- **Concessão de acesso:** cada papel concede apenas os papéis listados em `papel_concede`, e só dentro do próprio escopo. Ninguém altera os próprios acessos. Só a plataforma cria Master.
- **Escrita em vínculos:** acontece apenas pelas RPCs (`conceder_vinculo`, `definir_status_vinculo`). O INSERT/UPDATE direto foi revogado.
- **Colunas protegidas do perfil:** o próprio usuário altera apenas nome, telefone e foto (privilégio por coluna). Ativação e status de plataforma ficam em RPCs restritas.
- **Atesto:** não faz parte da matriz. Na Fase 3, ele virá da designação de gestor, fiscal ou suplente em cada contrato.

## Auditoria

- A tabela `auditoria` só recebe registros por gatilho ou por função `SECURITY DEFINER`. Ninguém edita nem apaga, nem a plataforma.
- Cada evento registra:
  - órgão, usuário, e-mail e papéis no momento;
  - se a ação foi feita via suporte;
  - entidade, id e ação;
  - os valores antes e depois, com os campos alterados;
  - a justificativa.
- A justificativa vem de duas fontes:
  - RPCs: `usar_justificativa()`;
  - requisições REST comuns: cabeçalho `x-justificativa`, em UTF-8 e base64 (veja `cabecalhoJustificativa` em `src/services/api.ts`).
- Inativar órgão ou unidade, suspender vínculo ou conta e excluir documento **exigem motivo**.
- Os gatilhos aceitam colunas a mascarar (`***`), para dados sensíveis como o tipo sanguíneo previsto na Fase 2.

## Documentos e storage

- Todo arquivo de negócio tem uma linha em `documentos`, com:
  - órgão, unidade, recurso e registro dono;
  - nome, tipo e tamanho;
  - quem enviou.
- O caminho é definido pelo servidor: `<tenant>/<recurso>/<documento_id>`.
- A política do storage só libera a leitura para quem pode ler o registro dono. O envio só é liberado para quem registrou o documento.
- Arquivo enviado não é sobrescrito. Excluir é uma operação lógica, com motivo, e o arquivo continua guardado.
- O limite de tamanho é configurado por órgão (`tenant_configuracoes.anexo_tamanho_max_mb`). Tipos aceitos: PDF, JPG, PNG e WEBP.
- Caminhos com regras próprias:
  - brasão do órgão: `<tenant>/identidade/…`;
  - foto de perfil: bucket `avatares`, pasta `<user_id>/`.

## Convites

O fluxo é: a tela chama a Edge Function `usuarios`, que segue estes passos.
1. Valida a concessão com a sessão de quem chama (`validar_concessao`): escopo, papel e domínio de e-mail do órgão.
2. Se a pessoa ainda não tem conta, cria a conta com a chave de serviço e envia o convite por e-mail.
3. Concede o vínculo com a sessão de quem chama (`conceder_vinculo`, auditado).

A chave de serviço só é usada depois que o banco autorizou a concessão.
