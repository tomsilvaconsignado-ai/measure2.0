-- Varredura de segurança (Fase 8): o Supabase concede EXECUTE a authenticated por padrão em funções novas.
-- Funções auxiliares usadas só dentro de outras funções security definer não precisam ficar expostas na API.
revoke execute on function
  public.cabecalho_orgao(uuid), public.contrato_valor_atual(uuid), public.contrato_de_nota(uuid), public.suporte_ativo(uuid)
from authenticated;
