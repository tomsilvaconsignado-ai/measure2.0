-- MEASURE 2.0 — apoio à função de convites (supabase/functions/usuarios)

-- Quem chama administra algum vínculo desta pessoa? (reenvio de convite/acesso)
create function public.pode_gerir_usuario(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin_plataforma() or exists (
    select 1 from vinculos v
     where v.user_id = p_user and v.user_id <> auth.uid()
       and pode_gerir_vinculo(v.tenant_id, v.unidade_id, v.papel, 'criar')
  )
$$;

revoke execute on function public.pode_gerir_usuario(uuid) from public, anon;
grant execute on function public.pode_gerir_usuario(uuid) to authenticated;
