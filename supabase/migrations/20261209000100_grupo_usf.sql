-- Grupo USF: todas as unidades atendidas cujo nome (ou sigla) começa com "USF" fazem parte do mesmo conjunto,
-- o grupo "USF – Unidades de Saúde da Família" (sigla USF).
--
-- * Na migração, 10 USFs (de "USF Adel Nunes" a "USF Carlos Hardman Côrtes") vieram marcadas como grupo, sem
--   nenhum membro. São unidades de saúde comuns: deixam de ser grupo (um grupo não pode conter outro).
-- * O grupo é criado em cada órgão que tem USF e recebe todas elas.
-- * Daqui em diante, unidade nova (ou renomeada) que comece com "USF" entra sozinha no grupo; se deixar de
--   começar com "USF", sai. Inclusões e saídas ficam na auditoria.
-- Idempotente.

-- unidade (não grupo) que pertence ao conjunto USF?
create function public.eh_unidade_usf(p_nome text, p_sigla text) returns boolean
language sql immutable set search_path = public as $$
  select btrim(coalesce(p_nome, '')) ~* '^USF(\s|$|[-–.])' or btrim(coalesce(p_sigla, '')) ~* '^USF'
$$;

create function public.grupo_usf_do_orgao(p_tenant uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from unidades_atendidas where tenant_id = p_tenant and eh_grupo and upper(btrim(sigla)) = 'USF' order by criado_em limit 1
$$;

create function public.unidade_no_grupo_usf() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_grupo uuid := grupo_usf_do_orgao(new.tenant_id);
begin
  if v_grupo is null or new.id = v_grupo then return null; end if;
  if not new.eh_grupo and eh_unidade_usf(new.nome, new.sigla) then
    insert into unidades_grupo_membros (grupo_id, membro_id, tenant_id) values (v_grupo, new.id, new.tenant_id)
    on conflict (grupo_id, membro_id) do nothing;
  elsif tg_op = 'UPDATE' then
    delete from unidades_grupo_membros where grupo_id = v_grupo and membro_id = new.id;
  end if;
  return null;
end $$;
create trigger unidades_atendidas_grupo_usf after insert or update of nome, sigla, eh_grupo on public.unidades_atendidas
  for each row execute function public.unidade_no_grupo_usf();

revoke execute on function public.eh_unidade_usf(text, text), public.grupo_usf_do_orgao(uuid), public.unidade_no_grupo_usf() from public, anon, authenticated;

do $$
declare t record;
begin
  perform usar_justificativa('Grupo USF: unidades que começam com "USF" passam a formar o grupo USF; USFs marcadas como grupo por engano na migração voltam a ser unidades.', 0);

  -- 1. o grupo USF em cada órgão que tem unidade USF
  for t in select distinct u.tenant_id from public.unidades_atendidas u loop
    if grupo_usf_do_orgao(t.tenant_id) is null
       and exists (select 1 from public.unidades_atendidas u where u.tenant_id = t.tenant_id and eh_unidade_usf(u.nome, u.sigla)) then
      insert into public.unidades_atendidas (tenant_id, nome, sigla, tipo, eh_grupo, regra_rateio, observacoes)
      values (t.tenant_id, 'USF – Unidades de Saúde da Família', 'USF', 'USF', true, 'OPCIONAL',
              'Conjunto de todas as Unidades de Saúde da Família (unidades cujo nome começa com "USF"). Unidade nova com "USF" no início do nome entra sozinha.');
    end if;
  end loop;

  -- 2. USFs que vieram como "grupo" sem membros voltam a ser unidades (o gatilho as põe no grupo USF)
  update public.unidades_atendidas u
     set eh_grupo = false, regra_rateio = 'NAO_APLICAVEL'
   where u.eh_grupo and eh_unidade_usf(u.nome, null) and upper(btrim(coalesce(u.sigla, ''))) <> 'USF'
     and not exists (select 1 from public.unidades_grupo_membros m where m.grupo_id = u.id);

  -- 3. todas as USFs no grupo
  insert into public.unidades_grupo_membros (grupo_id, membro_id, tenant_id)
  select grupo_usf_do_orgao(u.tenant_id), u.id, u.tenant_id
    from public.unidades_atendidas u
   where not u.eh_grupo and eh_unidade_usf(u.nome, u.sigla) and grupo_usf_do_orgao(u.tenant_id) is not null
  on conflict (grupo_id, membro_id) do nothing;
end $$;
