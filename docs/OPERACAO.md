# Operação do MEASURE 2.0

## Publicação

1. Rode `npm run lint`, `npm test`, `npm run test:db` e `npm run build`.
2. Aplique a migração nova no Supabase (`cazsjehsqqyfawofefpe`) **antes** do push.
3. Faça o push na `main`. A CI publica sozinha no GitHub Pages: https://tomsilvaconsignado-ai.github.io/measure2.0/.
4. Depois de publicar, abra o sistema e confira a tela **Plataforma → Erros do sistema**.

Quem estiver com o sistema aberto durante uma publicação pode ver a tela "O sistema foi atualizado". Basta recarregar a página.

## Backup e restauração

| Camada | O que é | Quem faz |
|---|---|---|
| Backup automático do banco | Cópia diária feita pelo Supabase. A retenção depende do plano: 7 dias no Pro; no gratuito, sem garantia. Com o add-on PITR, restaura a qualquer momento. | Supabase |
| Cópia de segurança do órgão (JSON) | Configurações do órgão → "Baixar cópia (JSON)". Traz todas as tabelas do órgão, sem senhas nem chaves. Fica registrada na auditoria. | Master do órgão |
| Arquivos (brasões, anexos, fotos) | Ficam no Storage privado do Supabase. Para cópia avulsa, baixe pelo painel do Supabase. | Plataforma |

Recomendação: contratar o **plano Pro** do Supabase antes da operação real, por causa do backup diário garantido. O Master deve baixar a cópia JSON uma vez por mês e guardá-la em local com acesso restrito, porque ela contém dados pessoais.

### Restaurar

- **Banco inteiro:** painel do Supabase → Database → Backups → escolher o ponto e restaurar. Isso substitui o banco atual; antes, avise os usuários.
- **Registros de um órgão a partir do JSON:** o arquivo traz, por tabela, as linhas com todos os campos (`tabelas.<nome>`). A restauração seletiva é feita pela plataforma, via SQL, nesta ordem:
  - unidades;
  - cadastros;
  - contratos;
  - empenhos;
  - notas;
  - documentos.
  Os gatilhos de auditoria registram tudo. Para fornecedores, servidores e unidades atendidas, também dá para converter em planilha e usar as importações da tela, que já detectam duplicados.

## Monitoramento

- **Erros do navegador:** registrados automaticamente na tabela `erros_aplicativo`, com até 30 por pessoa a cada 10 minutos. A plataforma os vê em **Plataforma → Erros do sistema**, com página, versão (o nome do pacote publicado) e a pilha do erro.
- **Banco e API:** o painel do Supabase mostra os logs (API, Auth, Postgres) e o relatório de desempenho.
- **Segurança:** Supabase → Advisors → Security. Os alertas aceitos estão justificados em [SEGURANCA_LGPD.md](SEGURANCA_LGPD.md).

## Incidentes (resumo)

1. **Contenção.** Desative o acesso suspeito em Usuários e acessos. O vínculo é desativado com motivo, e nada é apagado.
2. **Apuração.** Use a **Auditoria**, com os filtros de usuário, período e entidade. Toda exportação, cópia, emissão e alteração está lá.
3. **Credenciais.** Se uma chave ou token vazar, revogue no painel do Supabase (API keys / Access tokens) e gere outro. Para SMTP, gere nova senha de app no Google.
4. **Comunicação.** Em incidente com dados pessoais, o órgão segue a LGPD (art. 48): comunicar a ANPD e os titulares quando houver risco relevante.

## Contas e segredos

- O token de acesso ao Supabase e a senha do SMTP **nunca** vão para o repositório.
- O `.env.production` só tem a URL e a chave publicável, que é segura por causa do RLS.
- O token e a senha de app do Gmail usados na implantação foram expostos em conversa e **devem ser trocados**.
