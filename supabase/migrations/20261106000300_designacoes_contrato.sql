-- MEASURE 2.0 — responsáveis do contrato visíveis para quem vê o contrato
--
-- O responsável pode ser de outra coordenação: quem administra ou consulta o contrato não lê
-- a ficha dele em Servidores, mas precisa ver nome, matrícula e lotação na aba Responsáveis.

create function public.designacoes_do_contrato(p_contrato uuid, p_historico boolean default false)
returns table (
  id uuid, contrato_id uuid, servidor_id uuid, papel text, inicio date, fim date, portaria text, motivo_fim text,
  servidor_nome text, servidor_matricula text, servidor_cargo text, unidade_sigla text, unidade_nome text, tem_acesso boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (pode_contrato(p_contrato, 'ler') or designado(p_contrato)) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select d.id, d.contrato_id, d.servidor_id, d.papel, d.inicio, d.fim, d.portaria, d.motivo_fim,
           s.nome, s.matricula, s.cargo, u.sigla, u.nome, s.user_id is not null
      from contrato_designacoes d
      join servidores s on s.id = d.servidor_id
      join unidades_organizacionais u on u.id = s.unidade_id
     where d.contrato_id = p_contrato and (p_historico or d.fim is null)
     order by case d.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end, d.inicio desc;
end $$;

revoke execute on function public.designacoes_do_contrato(uuid, boolean) from public, anon;
grant execute on function public.designacoes_do_contrato(uuid, boolean) to authenticated;

-- Atesto guarda o nome e a matrícula de quem atestou (retrato da época, legível por quem vê a nota)
alter table public.nota_atestos add column servidor_nome text, add column servidor_matricula text;
update public.nota_atestos a set servidor_nome = s.nome, servidor_matricula = s.matricula
  from public.servidores s where s.id = a.servidor_id and a.servidor_nome is null;

create or replace function public.atestar_nota(p_nota uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; d record; v_id uuid;
begin
  select * into n from notas_fiscais where id = p_nota;
  if n.id is null then raise exception 'Nota não encontrada.' using errcode = 'no_data_found'; end if;
  select cd.papel, s.id as servidor_id, s.nome, s.matricula, s.cargo into d
    from contrato_designacoes cd join servidores s on s.id = cd.servidor_id
   where cd.contrato_id = n.contrato_id and s.user_id = auth.uid() and cd.fim is null and cd.inicio <= hoje()
   order by case cd.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end limit 1;
  if d.papel is null then
    raise exception 'Somente o gestor, o fiscal ou o suplente designado neste contrato pode atestar.' using errcode = 'insufficient_privilege';
  end if;
  if n.cancelada_em is not null then raise exception 'Nota cancelada não pode ser atestada.' using errcode = 'check_violation'; end if;
  if n.status_atesto = 'ATESTADA' then raise exception 'Esta nota já foi atestada.' using errcode = 'check_violation'; end if;
  if coalesce(length(btrim(p_texto)), 0) < 20 then raise exception 'O texto do atesto está vazio.' using errcode = 'check_violation', hint = 'texto'; end if;
  insert into nota_atestos (tenant_id, nota_id, servidor_id, user_id, papel, texto, servidor_nome, servidor_matricula)
  values (n.tenant_id, n.id, d.servidor_id, auth.uid(), d.papel, btrim(p_texto), d.nome, d.matricula) returning id into v_id;
  perform set_config('measure.nota_rpc', 'sim', true);
  update notas_fiscais set status_atesto = 'ATESTADA' where id = n.id;
  perform set_config('measure.nota_rpc', '', true);
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (n.tenant_id, n.unidade_id, 'ATESTO', n.id, 'Atesto da NF ' || n.numero,
          jsonb_build_object('texto', btrim(p_texto), 'papel', d.papel,
                             'servidor', jsonb_build_object('nome', d.nome, 'matricula', d.matricula, 'cargo', d.cargo)));
  return v_id;
end $$;

revoke execute on function public.atestar_nota(uuid, text) from public, anon;
grant execute on function public.atestar_nota(uuid, text) to authenticated;
