-- MEASURE 2.0 — busca de servidores para designação em contrato
--
-- Gestor, fiscal e suplente podem ser de outra coordenação (documento-base, item 2.7). Quem
-- administra contratos precisa encontrá-los mesmo fora do próprio escopo: esta busca devolve
-- só o mínimo (nome, matrícula, cargo, lotação, se tem acesso) — nenhum dado pessoal.

create function public.buscar_servidores_designacao(p_tenant uuid, p_busca text default null, p_limite int default 20)
returns table (id uuid, nome text, matricula text, cargo text, unidade_nome text, unidade_sigla text, tem_acesso boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_like text;
begin
  if not (pode(p_tenant, null, 'contratos', 'editar') or pode(p_tenant, null, 'contratos', 'criar')) then
    raise exception 'Você não tem permissão para designar responsáveis em contratos.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_busca), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select s.id, s.nome, s.matricula, s.cargo, u.nome, u.sigla, s.user_id is not null
      from servidores s join unidades_organizacionais u on u.id = s.unidade_id
     where s.tenant_id = p_tenant
       and (s.data_exoneracao is null or s.data_exoneracao > hoje())
       and (v_like is null or lower(s.nome || ' ' || s.matricula || ' ' || coalesce(u.sigla, '')) like v_like)
     order by lower(s.nome), s.matricula
     limit least(greatest(p_limite, 1), 50);
end $$;

revoke execute on function public.buscar_servidores_designacao(uuid, text, int) from public, anon;
grant execute on function public.buscar_servidores_designacao(uuid, text, int) to authenticated;
