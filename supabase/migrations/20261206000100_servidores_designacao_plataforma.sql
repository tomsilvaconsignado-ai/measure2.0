-- Servidores e designações antes da conta de acesso; desenvolvedor (plataforma) cadastra e designa.
--
-- 1. Ligação automática do servidor à conta. O servidor é ligado à conta pelo e-mail institucional, mas só
--    quando o cadastro era salvo e a pessoa JÁ tinha vínculo no órgão. Quem era cadastrado e designado antes
--    de ser convidado nunca era ligado e, ao entrar, não via os contratos em que estava designado. Agora a
--    ligação também acontece quando a pessoa recebe (ou volta a ter) vínculo no órgão e quando o e-mail da
--    conta muda. As contas já existentes nessa situação são ligadas aqui.
-- 2. A plataforma (desenvolvedor) cadastra e edita servidores de qualquer unidade sem sessão de suporte
--    (os dados pessoais sensíveis continuam exigindo a sessão de suporte).
-- 3. A plataforma designa, encerra e substitui gestor, fiscal e suplente em qualquer contrato. A designação
--    pode ser de servidor de qualquer unidade do órgão, e o designado vê tudo do contrato (regra já existente).

-- ------------------------------------------------------------------ 1. ligação servidor ↔ conta
-- prepara_servidor() já calcula user_id pelo e-mail institucional + vínculo no órgão; basta "tocar" o cadastro
create function public.ligar_servidores_da_conta(p_user uuid, p_tenant uuid default null) returns void
language sql security definer set search_path = public as $$
  update servidores s
     set email_institucional = s.email_institucional
    from perfis p
   where p.id = p_user
     and s.email_institucional = p.email
     and (p_tenant is null or s.tenant_id = p_tenant)
     and s.user_id is distinct from p_user
$$;

create function public.vinculo_liga_servidor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ativo then perform ligar_servidores_da_conta(new.user_id, new.tenant_id); end if;
  return null;
end $$;
create trigger vinculos_liga_servidor after insert or update of ativo on public.vinculos
  for each row execute function public.vinculo_liga_servidor();

create function public.perfil_liga_servidor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform ligar_servidores_da_conta(new.id);
  return null;
end $$;
create trigger perfis_liga_servidor after update of email on public.perfis
  for each row when (new.email is distinct from old.email) execute function public.perfil_liga_servidor();

-- contas que já existem e não foram ligadas (servidor cadastrado antes do convite)
update public.servidores s
   set email_institucional = s.email_institucional
 where s.user_id is null and s.email_institucional is not null
   and exists (select 1 from public.perfis p join public.vinculos v on v.user_id = p.id and v.tenant_id = s.tenant_id and v.ativo
                where p.email = s.email_institucional);

-- ------------------------------------------------------------------ 2. servidores: livre para a plataforma
update public.recursos set livre_para_plataforma = true where codigo = 'servidores';

-- ------------------------------------------------------------------ 3. designações pela plataforma
create function public.pode_designar(p_contrato uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pode_contrato(p_contrato, 'editar')
      or (eh_admin_plataforma() and exists (select 1 from contratos c where c.id = p_contrato))
$$;

alter policy designacoes_ler on public.contrato_designacoes
  using (pode_contrato(contrato_id, 'ler') or designado(contrato_id) or pode_designar(contrato_id));
alter policy designacoes_criar on public.contrato_designacoes with check (pode_designar(contrato_id));
alter policy designacoes_editar on public.contrato_designacoes
  using (pode_designar(contrato_id)) with check (pode_designar(contrato_id));

-- autoria: a plataforma também encerra/substitui designação registrada por outra pessoa.
-- (a permissão de escrever continua nas políticas de cada tabela; isto só deixa de barrar pelo autor)
create or replace function public.pode_alterar_registro(p_tenant uuid, p_unidade uuid, p_recurso text, p_autor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_autor is null or p_autor = auth.uid() or eh_admin_plataforma() or pode(p_tenant, p_unidade, p_recurso, 'aprovar')
$$;

-- busca de responsáveis: a plataforma também pesquisa (servidores de qualquer unidade do órgão)
create or replace function public.buscar_servidores_designacao(p_tenant uuid, p_busca text default null, p_limite int default 50)
returns table (id uuid, nome text, matricula text, cargo text, unidade_nome text, unidade_sigla text, tem_acesso boolean,
               secretaria text, diretoria text, coordenacao text, setor text, situacao text)
language plpgsql stable security definer set search_path = public as $$
declare v_like text;
begin
  if not (pode(p_tenant, null, 'contratos', 'editar') or pode(p_tenant, null, 'contratos', 'criar') or eh_admin_plataforma()) then
    raise exception 'Você não tem permissão para designar responsáveis em contratos.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_busca), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select s.id, s.nome, s.matricula, s.cargo, u.nome, u.sigla, s.user_id is not null,
           n.secretaria, n.diretoria, n.coordenacao, n.setor,
           case when s.user_id is null then 'ATIVO_SEM_ACESSO' else 'ATIVO' end
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
      cross join lateral unidade_niveis(s.unidade_id) n
     where s.tenant_id = p_tenant
       and (s.data_exoneracao is null or s.data_exoneracao > hoje())
       and (v_like is null or lower(concat_ws(' ', s.nome, s.matricula, s.cargo, u.nome,
              (select string_agg(x.nome || ' ' || coalesce(x.sigla, ''), ' ') from unidades_organizacionais x where x.id = any(u.caminho)))) like v_like)
     order by lower(s.nome), s.matricula
     limit least(greatest(p_limite, 1), 200);
end $$;

-- responsáveis do contrato (com histórico): quem designa também consulta
create or replace function public.designacoes_do_contrato(p_contrato uuid, p_historico boolean default false)
returns table (
  id uuid, contrato_id uuid, servidor_id uuid, papel text, inicio date, fim date, portaria text, motivo_fim text,
  servidor_nome text, servidor_matricula text, servidor_cargo text, unidade_sigla text, unidade_nome text, tem_acesso boolean,
  lotacao_descricao text, designado_em timestamptz, designado_por text, encerrado_por text,
  substitui_nome text, substituido_por_nome text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (pode_contrato(p_contrato, 'ler') or designado(p_contrato) or pode_designar(p_contrato)) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select d.id, d.contrato_id, d.servidor_id, d.papel, d.inicio, d.fim, d.portaria, d.motivo_fim,
           s.nome, coalesce(d.servidor_matricula, s.matricula), coalesce(d.servidor_cargo, s.cargo), u.sigla, u.nome, s.user_id is not null,
           d.lotacao_descricao, d.criado_em,
           (select nullif(p.nome, '') from perfis p where p.id = d.criado_por),
           case when d.fim is not null then (select nullif(p.nome, '') from perfis p where p.id = d.atualizado_por) end,
           (select sa.nome from contrato_designacoes da join servidores sa on sa.id = da.servidor_id where da.id = d.substitui_id),
           (select sn.nome from contrato_designacoes dn join servidores sn on sn.id = dn.servidor_id where dn.substitui_id = d.id order by dn.criado_em desc limit 1)
      from contrato_designacoes d
      join servidores s on s.id = d.servidor_id
      join unidades_organizacionais u on u.id = s.unidade_id
     where d.contrato_id = p_contrato and (p_historico or d.fim is null)
     order by d.fim is not null, case d.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end, d.inicio desc;
end $$;

revoke execute on function public.ligar_servidores_da_conta(uuid, uuid), public.vinculo_liga_servidor(), public.perfil_liga_servidor(),
  public.pode_designar(uuid) from public, anon;
revoke execute on function public.ligar_servidores_da_conta(uuid, uuid), public.vinculo_liga_servidor(), public.perfil_liga_servidor() from authenticated;
-- usada nas políticas de contrato_designacoes
grant execute on function public.pode_designar(uuid) to authenticated;
