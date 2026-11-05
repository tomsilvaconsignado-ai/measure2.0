# MEASURE 2.0

Plataforma de gestão administrativa, contratual, orçamentária e de execução de despesas para órgãos públicos (Prefeituras, Secretarias, Diretorias e Coordenações). É multi-tenant, auditável e acessível pelo celular.

- **Produção:** https://tomsilvaconsignado-ai.github.io/measure2.0/
- **Supabase:** projeto `cazsjehsqqyfawofefpe`
- **Situação:** Fases 1 a 8 entregues. Pendentes: modelos oficiais em PDF, migração do sistema antigo e treinamento. Veja [docs/BACKLOG.md](docs/BACKLOG.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | stack, multi-tenant, autorização, auditoria, storage, convites |
| [docs/PERMISSOES.md](docs/PERMISSOES.md) | matriz de permissões, escopos, quem concede o quê |
| [docs/MODELO_DADOS.md](docs/MODELO_DADOS.md) | tabelas e relacionamentos |
| [docs/DECISOES_PENDENTES.md](docs/DECISOES_PENDENTES.md) | regras que dependem do órgão, com propostas |
| [docs/BACKLOG.md](docs/BACKLOG.md) | entregas por fase |
| [docs/OPERACAO.md](docs/OPERACAO.md) | publicação, backup e restauração, monitoramento, incidentes |
| [docs/SEGURANCA_LGPD.md](docs/SEGURANCA_LGPD.md) | testes de segurança e de carga, inventário LGPD, retenção |

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # URL do Supabase + chave publicável
npm run dev                  # http://localhost:5173
```

## Testes

```bash
npm run lint      # TypeScript estrito
npm test          # unitários (formatação BRL/CNPJ/CPF, tradução de erros)
npm run test:db   # migrações + RLS + regras num Postgres em memória (PGlite)
npm run build
```

## Banco de dados

- Toda mudança é uma **nova** migração em `supabase/migrations/AAAAMMDDHHMMSS_descricao.sql`. Nunca edite uma migração já aplicada.
- Aplique as migrações no projeto **antes** de publicar o código que depende delas.
- Toda tabela nova precisa ter:
  - `tenant_id`;
  - RLS com `pode()`;
  - gatilhos `auditar`, `carimbar` e `bloquear_troca_tenant`;
  - REVOKE/GRANT das funções novas (veja `20261104000400_privilegios.sql`).
- O teste `toda tabela pública tem RLS` falha se o RLS for esquecido.

## E-mails

Os modelos ficam em `supabase/templates/build.mjs`. Para publicar os modelos e as regras de autenticação:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node supabase/templates/build.mjs --publicar
```

A senha do SMTP do Gmail só entra pela variável `SMTP_PASS` e nunca fica em arquivo.

## Funções

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npx supabase functions deploy usuarios --remote=cazsjehsqqyfawofefpe --no-verify-jwt --use-api
```

A opção `--no-verify-jwt` não deixa a função aberta: ela mesma valida a sessão.

## Publicação

O push na `main` roda a CI (lint, testes e build) e publica no GitHub Pages. Para usar a Vercel, importe o repositório lá: o `vercel.json` já traz a reescrita da SPA e os cabeçalhos de segurança.

## Segurança

- Segredos (chave secreta do Supabase, senha do SMTP, tokens) nunca vão para o repositório.
- O `.env.production` tem apenas valores públicos: a URL e a chave publicável. A proteção dos dados vem do RLS.
