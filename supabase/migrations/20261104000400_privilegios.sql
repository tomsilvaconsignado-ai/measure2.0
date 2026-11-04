-- MEASURE 2.0 — privilégios de funções
--
-- O Supabase libera EXECUTE de toda função nova para anon e authenticated. Aqui fechamos:
--   * anon não executa nada do app;
--   * funções internas (auditoria, gatilhos) não são chamáveis pela API;
--   * authenticated executa só as RPCs e os ajudantes usados pelas políticas RLS.
-- Toda migração que criar função deve repetir este bloco para as novas.

revoke execute on all functions in schema public from public, anon;

revoke execute on function
  public.registrar_auditoria(uuid, text, text, text, jsonb, jsonb, text, jsonb),
  public.usar_justificativa(text, int),
  public.auditar(), public.auditar_matriz(), public.carimbar(), public.carimbar_criacao(),
  public.bloquear_troca_tenant(), public.criar_perfil(), public.sincronizar_email_perfil(),
  public.criar_configuracoes_tenant(), public.unidade_caminho(), public.unidade_caminho_descendentes(),
  public.valida_vinculo(), public.valida_permissao_papel(), public.protege_tenant(),
  public.protege_movimento_unidade(), public.exige_justificativa_inativacao(), public.documento_preparar()
from authenticated;

grant execute on function
  -- ajudantes de autorização (usados nas políticas; só revelam as permissões de quem chama)
  public.eh_admin_plataforma(), public.suporte_ativo(uuid), public.membro_do_tenant(uuid),
  public.pode(uuid, uuid, text, text, boolean), public.unidade_visivel(uuid), public.perfil_visivel(uuid),
  public.pode_gerir_vinculo(uuid, uuid, text, text), public.arquivo_pode(text, text, text),
  public.justificativa_atual(),
  -- RPCs
  public.validar_concessao(text, uuid, uuid, text), public.conceder_vinculo(text, uuid, uuid, text),
  public.definir_status_vinculo(uuid, boolean, text), public.definir_vinculo_padrao(uuid),
  public.definir_status_usuario(uuid, boolean, text), public.definir_admin_plataforma(uuid, boolean, text),
  public.iniciar_suporte(uuid, text, int), public.encerrar_suporte(uuid),
  public.meu_contexto(), public.registrar_acesso(),
  public.listar_usuarios(uuid, text, text, uuid, text, int, int),
  public.excluir_documento(uuid, text), public.registrar_acesso_documento(uuid, text)
to authenticated;
