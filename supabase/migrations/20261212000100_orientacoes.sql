-- MEASURE 2.0 — balões de orientação (tour guiado nas telas)
--
-- A preferência é da pessoa (não do órgão), por isso fica em perfis:
--   * orientacoes_ativas: os balões aparecem a cada acesso, perguntando se a pessoa quer continuar
--     vendo; só param quando ela escolhe "Não mostrar mais".
--   * A própria pessoa liga e desliga em Meu perfil (definir_minhas_orientacoes).
--   * A administração reativa em Usuários e acessos (reativar_orientacoes), para uma pessoa ou para
--     todas do seu escopo, com a mesma regra de quem pode editar usuários naquela unidade.
-- As alterações passam pelo gatilho perfis_auditar (auditoria) e perfis_carimbar.

alter table public.perfis
  add column if not exists orientacoes_ativas boolean not null default true,
  add column if not exists orientacoes_alteradas_em timestamptz;

-- ---------------------------------------------------------------- a própria pessoa

create function public.definir_minhas_orientacoes(p_ativas boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou. Entre de novo.' using errcode = 'insufficient_privilege';
  end if;
  update perfis
     set orientacoes_ativas = coalesce(p_ativas, true), orientacoes_alteradas_em = now()
   where id = auth.uid() and orientacoes_ativas is distinct from coalesce(p_ativas, true);
end $$;

-- ---------------------------------------------------------------- administração

-- p_user preenchido: reativa para essa pessoa (erro se quem chama não pode editar os acessos dela).
-- p_user nulo: reativa para todas as pessoas do órgão cujo vínculo está no escopo de quem chama.
-- Vínculo do órgão inteiro (sem unidade) só é alcançado por quem administra o órgão inteiro (modo estrito).
-- Devolve quantas pessoas voltaram a ver os balões.
create function public.reativar_orientacoes(p_tenant uuid, p_user uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_qtd int;
begin
  if p_tenant is null then
    raise exception 'Escolha o órgão.' using errcode = 'invalid_parameter_value';
  end if;
  if p_user is not null and not exists (
    select 1 from vinculos v
     where v.tenant_id = p_tenant and v.user_id = p_user and v.ativo
       and pode(p_tenant, v.unidade_id, 'usuarios', 'editar', true)
  ) then
    raise exception 'Você não tem permissão para alterar as orientações deste usuário.' using errcode = 'insufficient_privilege';
  end if;
  if p_user is null and not exists (
    select 1 from vinculos v where v.tenant_id = p_tenant and v.ativo and pode(p_tenant, v.unidade_id, 'usuarios', 'editar', true)
  ) then
    raise exception 'Você não tem permissão para alterar as orientações dos usuários deste órgão.' using errcode = 'insufficient_privilege';
  end if;

  update perfis p
     set orientacoes_ativas = true, orientacoes_alteradas_em = now()
   where not p.orientacoes_ativas
     and p.id in (
       select v.user_id from vinculos v
        where v.tenant_id = p_tenant and v.ativo
          and (p_user is null or v.user_id = p_user)
          and pode(p_tenant, v.unidade_id, 'usuarios', 'editar', true));
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- ---------------------------------------------------------------- privilégios

revoke execute on function
  public.definir_minhas_orientacoes(boolean),
  public.reativar_orientacoes(uuid, uuid)
from public, anon;

grant execute on function
  public.definir_minhas_orientacoes(boolean),
  public.reativar_orientacoes(uuid, uuid)
to authenticated;
