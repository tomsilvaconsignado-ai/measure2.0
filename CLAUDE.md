# MEASURE 2.0: instruções para o Claude Code

Gestão de contratos e despesas públicas, multi-tenant. Contém dados pessoais sujeitos à LGPD. Todo código, comentário, mensagem e documento deve estar em **português do Brasil**, com acentuação correta.

A especificação completa está nos documentos do usuário. O resumo vivo fica em `docs/` (ARQUITETURA, PERMISSOES, MODELO_DADOS, DECISOES_PENDENTES, BACKLOG).

## Regras que não podem ser quebradas
1. **Segurança fica no banco.**
   - Toda tabela tem RLS usando `public.pode(tenant, unidade, recurso, acao[, estrito])`.
   - `useSessao().pode()` na tela serve só para mostrar ou esconder elementos.
2. **Toda tabela de negócio tem:**
   - `tenant_id not null`;
   - gatilho `bloquear_troca_tenant`;
   - gatilho `auditar` (passando como argumento as colunas sensíveis a mascarar);
   - `carimbar` e `carimbar_criacao`.
   Não há exclusão física: usa-se inativação com motivo (`exige_justificativa_inativacao`).
3. **Migrações:**
   - Toda mudança é uma nova migração. Nunca edite uma já aplicada.
   - Funções novas exigem `revoke execute ... from public, anon` e `grant` só do que a API precisa.
   - Funções internas de gatilho ou auditoria nunca ficam executáveis por `authenticated`.
4. **Papéis somente leitura** nunca escrevem. O gatilho da matriz garante isso; não contorne.
5. **Valores monetários:**
   - `numeric(16,2)` no banco e centavos inteiros no app (`src/lib/formatacao.ts`).
   - Exibição sempre como `R$ 1.234,56`.
6. **Cadastros extensos** usam `BuscaSelect`, com busca no servidor. Nunca carregue milhares de opções no navegador.
7. **Erros:** use `traduzirErro()`. As funções do banco usam `raise ... using hint = '<campo>'` para que o erro apareça junto ao campo certo.
8. **Segredos** nunca vão para o repositório. O `.env.production` só tem valores públicos.
9. **Ordem de publicação:** aplique a migração no Supabase antes do push na `main`, que publica sozinho.
10. **Commits:** `git -c user.name=tomsilva -c user.email=tomsilvaconsignado@gmail.com commit ...`

## Comandos
- `npm run dev`, `npm run lint`, `npm test`, `npm run test:db`, `npm run build`
- Novos casos de banco: `supabase/tests/cases.mjs`. Cobrir sempre o isolamento entre órgãos, o escopo e os papéis somente leitura.
