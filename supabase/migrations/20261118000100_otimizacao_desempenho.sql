-- Otimização de desempenho, sem mudar regras de acesso nem dados.
-- 1) RLS: auth.uid() e eh_admin_plataforma() avaliados uma vez por consulta, não uma vez por linha
--    (recomendação "auth_rls_initplan" do Supabase). A lógica de cada política é a mesma.
-- 2) Índices nas chaves estrangeiras das tabelas que crescem com o uso (junções e filtros dos relatórios).

-- =====================================================================
-- 1) Políticas: mesmas condições, com subconsulta escalar (initplan)
-- =====================================================================

alter policy entes_ler on public.entes
  using ((select eh_admin_plataforma()) or id in (select t.ente_id from tenants t join vinculos v on v.tenant_id = t.id
                                                   where v.user_id = (select auth.uid()) and v.ativo));

alter policy perfis_editar_proprio on public.perfis
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy curriculo_ler on public.servidor_curriculo_itens
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'ler')
         or exists (select 1 from servidores s where s.id = servidor_curriculo_itens.servidor_id and s.user_id = (select auth.uid())));

alter policy ferias_ler on public.servidor_ferias
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'ler')
         or exists (select 1 from servidores s where s.id = servidor_ferias.servidor_id and s.user_id = (select auth.uid())));

alter policy servidores_ler on public.servidores
  using (pode(tenant_id, unidade_id, 'servidores', 'ler') or user_id = (select auth.uid()));

alter policy servidores_dados_ler on public.servidores_dados_pessoais
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores_sensiveis', 'ler')
         or exists (select 1 from servidores s where s.id = servidores_dados_pessoais.servidor_id and s.user_id = (select auth.uid())));

alter policy tenants_ler on public.tenants
  using ((select eh_admin_plataforma())
         or exists (select 1 from vinculos v where v.tenant_id = tenants.id and v.user_id = (select auth.uid()) and v.ativo));

alter policy uo_orgaos_ler on public.unidade_orcamentaria_orgaos
  using ((select eh_admin_plataforma()) or tenant_id in (select v.tenant_id from vinculos v where v.user_id = (select auth.uid()) and v.ativo));

alter policy vinculos_ler on public.vinculos
  using (user_id = (select auth.uid()) or pode(tenant_id, unidade_id, 'usuarios', 'ler'));

-- =====================================================================
-- 2) Índices em chaves estrangeiras usadas em junções e filtros
-- =====================================================================

create index if not exists notas_fiscais_fornecedor on public.notas_fiscais (fornecedor_id);
create index if not exists notas_fiscais_unidade on public.notas_fiscais (tenant_id, unidade_id);
create index if not exists empenhos_fornecedor on public.empenhos (fornecedor_id);
create index if not exists empenhos_unidade on public.empenhos (tenant_id, unidade_id);
create index if not exists contrato_dotacoes_classificacao on public.contrato_dotacoes (classificacao_id);
create index if not exists contratos_origem on public.contratos (contrato_origem_id) where contrato_origem_id is not null;
create index if not exists nota_unidades_unidade on public.nota_unidades (unidade_atendida_id);
create index if not exists empenho_unidades_unidade on public.empenho_unidades (unidade_atendida_id);
create index if not exists os_unidades_unidade on public.os_unidades (unidade_atendida_id);
create index if not exists ordens_servico_contrato on public.ordens_servico (contrato_id);
create index if not exists nota_atestos_servidor on public.nota_atestos (servidor_id) where servidor_id is not null;
create index if not exists unidades_organizacionais_pai on public.unidades_organizacionais (pai_id);
create index if not exists unidades_atendidas_unidade_org on public.unidades_atendidas (unidade_org_id) where unidade_org_id is not null;
create index if not exists documentos_emitidos_unidade on public.documentos_emitidos (unidade_id);
create index if not exists frequencias_unidade on public.frequencias_mensais (unidade_id);
