-- MEASURE 2.0 — correção: o gatilho de auditoria lia new.id, que não existe em tabelas cuja
-- chave é outra (ex.: tenant_configuracoes, chave tenant_id). Agora tudo vem do JSON da linha.

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_linha jsonb;
  v_tenant uuid;
  v_col text;
begin
  foreach v_col in array coalesce(tg_argv, '{}'::text[]) loop
    if v_antes ? v_col then v_antes := jsonb_set(v_antes, array[v_col], '"***"'); end if;
    if v_depois ? v_col then v_depois := jsonb_set(v_depois, array[v_col], '"***"'); end if;
  end loop;
  if tg_op = 'UPDATE'
     and (v_antes - 'atualizado_em' - 'atualizado_por' - 'ultimo_acesso')
       = (v_depois - 'atualizado_em' - 'atualizado_por' - 'ultimo_acesso') then
    return null;  -- nada relevante mudou
  end if;
  v_linha := coalesce(v_depois, v_antes);
  v_tenant := (case when tg_table_name = 'tenants' then v_linha ->> 'id' else v_linha ->> 'tenant_id' end)::uuid;
  perform registrar_auditoria(v_tenant, tg_table_name, coalesce(v_linha ->> 'id', v_linha ->> 'tenant_id'),
                              tg_op, v_antes, v_depois);
  return null;
end $$;

revoke execute on function public.auditar() from public, anon, authenticated;
