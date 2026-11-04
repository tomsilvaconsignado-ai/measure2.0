-- MEASURE 2.0 — Fase 1: operações de acesso (RPCs)
--
-- Vínculos só mudam por estas funções: elas validam quem concede o quê, em qual escopo,
-- o domínio de e-mail do órgão e registram a justificativa na auditoria.

-- Define a justificativa da transação corrente (lida pelo gatilho de auditoria)
create function public.usar_justificativa(p_texto text, p_minimo int default 5) returns void
language plpgsql set search_path = public as $$
begin
  if p_minimo > 0 and coalesce(length(btrim(p_texto)), 0) < p_minimo then
    raise exception 'Informe o motivo (mínimo de % caracteres).', p_minimo
      using errcode = 'check_violation', hint = 'justificativa';
  end if;
  perform set_config('measure.justificativa', coalesce(btrim(p_texto), ''), true);
end $$;

-- Inativar órgão ou unidade exige motivo (enviado pelo app no cabeçalho x-justificativa)
create function public.exige_justificativa_inativacao() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.ativo and not new.ativo and auth.uid() is not null
     and coalesce(length(justificativa_atual()), 0) < 5 then
    raise exception 'Informe o motivo da inativação (mínimo de 5 caracteres).'
      using errcode = 'check_violation', hint = 'justificativa';
  end if;
  return new;
end $$;
create trigger tenants_justificativa before update of ativo on public.tenants
  for each row execute function public.exige_justificativa_inativacao();
create trigger unidades_justificativa before update of ativo on public.unidades_organizacionais
  for each row execute function public.exige_justificativa_inativacao();

-- Quem chama pode conceder/alterar o papel p_papel na unidade p_unidade do órgão p_tenant?
create function public.pode_gerir_vinculo(p_tenant uuid, p_unidade uuid, p_papel text, p_acao text)
returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin_plataforma() or exists (
    select 1
      from vinculos v
      join perfis p on p.id = v.user_id and p.ativo
      join tenants t on t.id = v.tenant_id and t.ativo
      join permissoes_papel pp on pp.papel = v.papel and pp.recurso = 'usuarios' and pp.acao = p_acao
      join papel_concede pc on pc.concedente = v.papel and pc.concedido = p_papel
     where v.user_id = auth.uid() and v.ativo and v.tenant_id = p_tenant
       and (v.unidade_id is null
            or (p_unidade is not null and exists (
                  select 1 from unidades_organizacionais u
                   where u.id = p_unidade and v.unidade_id = any(u.caminho))))
  )
$$;

-- Valida uma concessão sem gravar nada. Usada pela função de convite antes de criar a conta.
create function public.validar_concessao(p_email text, p_tenant uuid, p_unidade uuid, p_papel text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_tenant tenants;
  v_papel papeis;
  v_user uuid;
begin
  if auth.uid() is null or not exists (select 1 from perfis where id = auth.uid() and ativo) then
    raise exception 'Sessão inválida.' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido: %.', p_email using errcode = 'check_violation', hint = 'email';
  end if;
  select * into v_tenant from tenants where id = p_tenant;
  if not found then
    raise exception 'Órgão não encontrado.' using errcode = 'no_data_found', hint = 'tenant_id';
  end if;
  if not v_tenant.ativo then
    raise exception 'O órgão % está inativo.', v_tenant.nome_curto using errcode = 'check_violation', hint = 'tenant_id';
  end if;
  select * into v_papel from papeis where codigo = p_papel;
  if not found then
    raise exception 'Papel inválido.' using errcode = 'check_violation', hint = 'papel';
  end if;
  if p_unidade is not null and not exists (
    select 1 from unidades_organizacionais where id = p_unidade and tenant_id = p_tenant and ativo
  ) then
    raise exception 'A unidade escolhida não pertence a este órgão ou está inativa.'
      using errcode = 'check_violation', hint = 'unidade_id';
  end if;
  if p_unidade is null and v_papel.exige_unidade then
    raise exception 'O papel "%" exige escolher a unidade de atuação.', v_papel.nome
      using errcode = 'check_violation', hint = 'unidade_id';
  end if;
  if not pode_gerir_vinculo(p_tenant, p_unidade, p_papel, 'criar') then
    raise exception 'Você não pode conceder o papel "%" nessa unidade.', v_papel.nome
      using errcode = 'insufficient_privilege', hint = 'papel';
  end if;
  if cardinality(v_tenant.dominios_email) > 0
     and not split_part(v_email, '@', 2) = any(v_tenant.dominios_email) then
    raise exception 'O órgão só aceita e-mails institucionais (%).',
      array_to_string(array(select '@' || d from unnest(v_tenant.dominios_email) d), ', ')
      using errcode = 'check_violation', hint = 'email';
  end if;
  select id into v_user from perfis where email = v_email;
  if v_user = auth.uid() and not eh_admin_plataforma() then
    raise exception 'Você não pode alterar os próprios acessos.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object('existe_usuario', v_user is not null, 'user_id', v_user);
end $$;

create function public.conceder_vinculo(p_email text, p_tenant uuid, p_unidade uuid, p_papel text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_existente vinculos;
  v_id uuid;
begin
  perform validar_concessao(p_email, p_tenant, p_unidade, p_papel);
  select id into v_user from perfis where email = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Não há conta com o e-mail %. Envie um convite.', p_email
      using errcode = 'no_data_found', hint = 'email';
  end if;
  select * into v_existente from vinculos
   where user_id = v_user and tenant_id = p_tenant and unidade_id is not distinct from p_unidade and papel = p_papel;
  if found then
    if v_existente.ativo then
      raise exception 'Esta pessoa já tem esse papel nessa unidade.' using errcode = 'unique_violation', hint = 'papel';
    end if;
    update vinculos set ativo = true where id = v_existente.id;
    return v_existente.id;
  end if;
  insert into vinculos (user_id, tenant_id, unidade_id, papel, padrao)
  values (v_user, p_tenant, p_unidade, p_papel,
          not exists (select 1 from vinculos where user_id = v_user and padrao))
  returning id into v_id;
  return v_id;
end $$;

-- Suspende ou reativa um vínculo
create function public.definir_status_vinculo(p_id uuid, p_ativo boolean, p_justificativa text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v vinculos;
begin
  select * into v from vinculos where id = p_id;
  if not found then
    raise exception 'Vínculo não encontrado.' using errcode = 'no_data_found';
  end if;
  if v.user_id = auth.uid() and not eh_admin_plataforma() then
    raise exception 'Você não pode alterar os próprios acessos.' using errcode = 'insufficient_privilege';
  end if;
  if not pode_gerir_vinculo(v.tenant_id, v.unidade_id, v.papel, case when p_ativo then 'editar' else 'excluir' end) then
    raise exception 'Você não tem permissão para alterar este vínculo.' using errcode = 'insufficient_privilege';
  end if;
  if v.ativo = p_ativo then return; end if;
  perform usar_justificativa(p_justificativa, case when p_ativo then 0 else 5 end);
  if not p_ativo and v.padrao then
    update vinculos set padrao = false where id = p_id;
    update vinculos set padrao = true
     where id = (select id from vinculos where user_id = v.user_id and ativo and id <> p_id order by criado_em limit 1);
  end if;
  update vinculos set ativo = p_ativo where id = p_id;
end $$;

create function public.definir_vinculo_padrao(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vinculos where id = p_id and user_id = auth.uid() and ativo) then
    raise exception 'Vínculo não encontrado.' using errcode = 'no_data_found';
  end if;
  update vinculos set padrao = false where user_id = auth.uid() and padrao and id <> p_id;
  update vinculos set padrao = true where id = p_id;
end $$;

-- Suspende/reativa a conta inteira (somente plataforma)
create function public.definir_status_usuario(p_user uuid, p_ativo boolean, p_justificativa text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin_plataforma() then
    raise exception 'Somente o administrador da plataforma suspende contas.' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode suspender a própria conta.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_justificativa, case when p_ativo then 0 else 5 end);
  update perfis set ativo = p_ativo where id = p_user;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'no_data_found';
  end if;
end $$;

create function public.definir_admin_plataforma(p_user uuid, p_valor boolean, p_justificativa text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin_plataforma() then
    raise exception 'Somente o administrador da plataforma concede esse acesso.' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() and not p_valor then
    raise exception 'Você não pode remover o próprio acesso de plataforma.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_justificativa, 10);
  update perfis set is_platform_admin = p_valor where id = p_user;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'no_data_found';
  end if;
end $$;

-- Sessão de suporte: libera ao administrador da plataforma os dados operacionais de um órgão
create function public.iniciar_suporte(p_tenant uuid, p_justificativa text, p_minutos int default 60)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not eh_admin_plataforma() then
    raise exception 'Somente o administrador da plataforma abre sessão de suporte.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from tenants where id = p_tenant) then
    raise exception 'Órgão não encontrado.' using errcode = 'no_data_found';
  end if;
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'Descreva o motivo do suporte (mínimo de 10 caracteres).'
      using errcode = 'check_violation', hint = 'justificativa';
  end if;
  if p_minutos not between 5 and 480 then
    raise exception 'A duração deve ficar entre 5 minutos e 8 horas.' using errcode = 'check_violation', hint = 'minutos';
  end if;
  update sessoes_suporte set encerrada_em = now()
   where admin_id = auth.uid() and tenant_id = p_tenant and encerrada_em is null;
  insert into sessoes_suporte (admin_id, tenant_id, justificativa, expira_em)
  values (auth.uid(), p_tenant, btrim(p_justificativa), now() + make_interval(mins => p_minutos))
  returning id into v_id;
  perform registrar_auditoria(p_tenant, 'sessoes_suporte', v_id::text, 'SUPORTE_INICIADO', null,
    jsonb_build_object('minutos', p_minutos), btrim(p_justificativa));
  return v_id;
end $$;

create function public.encerrar_suporte(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  update sessoes_suporte set encerrada_em = now()
   where id = p_id and admin_id = auth.uid() and encerrada_em is null
  returning tenant_id into v_tenant;
  if v_tenant is not null then
    perform registrar_auditoria(v_tenant, 'sessoes_suporte', p_id::text, 'SUPORTE_ENCERRADO');
  end if;
end $$;

-- Tudo o que a interface precisa saber sobre o usuário logado
create function public.meu_contexto() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'perfil', (select to_jsonb(p) - 'atualizado_por' from perfis p where p.id = auth.uid()),
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'papel', v.papel, 'papel_nome', pa.nome, 'somente_leitura', pa.somente_leitura,
        'padrao', v.padrao,
        'tenant', jsonb_build_object('id', t.id, 'nome_curto', t.nome_curto, 'nome_oficial', t.nome_oficial,
                                     'logo_path', t.logo_path, 'ativo', t.ativo),
        'unidade', case when u.id is not null then
                     jsonb_build_object('id', u.id, 'nome', u.nome, 'sigla', u.sigla, 'tipo', u.tipo) end,
        'permissoes', (select coalesce(jsonb_agg(pp.recurso || ':' || pp.acao order by pp.recurso, pp.acao), '[]')
                         from permissoes_papel pp where pp.papel = v.papel)
      ) order by v.padrao desc, t.nome_curto, pa.ordem)
      from vinculos v
      join tenants t on t.id = v.tenant_id
      join papeis pa on pa.codigo = v.papel
      left join unidades_organizacionais u on u.id = v.unidade_id
      where v.user_id = auth.uid() and v.ativo), '[]'),
    'suportes', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'tenant_id', s.tenant_id, 'expira_em', s.expira_em))
        from sessoes_suporte s
       where s.admin_id = auth.uid() and s.encerrada_em is null and s.expira_em > now()), '[]')
  )
$$;

-- Marca o acesso (último acesso + auditoria de login)
create function public.registrar_acesso() returns void
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if auth.uid() is null then return; end if;
  update perfis set ultimo_acesso = now() where id = auth.uid();
  select tenant_id into v_tenant from vinculos where user_id = auth.uid() and ativo order by padrao desc limit 1;
  perform registrar_auditoria(v_tenant, 'perfis', auth.uid()::text, 'LOGIN');
end $$;

-- Usuários visíveis, paginados no servidor, com os vínculos de cada um
create function public.listar_usuarios(
  p_tenant uuid default null, p_busca text default null, p_papel text default null,
  p_unidade uuid default null, p_situacao text default 'ATIVOS',
  p_limite int default 25, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_busca text := nullif(btrim(p_busca), '');
  v_like text;
  v_resultado jsonb;
begin
  if p_situacao not in ('ATIVOS', 'INATIVOS', 'TODOS') then
    raise exception 'Situação inválida.' using errcode = 'check_violation';
  end if;
  if v_busca is not null then
    v_like := '%' || replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with vis as (
    select v.* from vinculos v
     where (p_tenant is null or v.tenant_id = p_tenant)
       and pode(v.tenant_id, v.unidade_id, 'usuarios', 'ler')
       and (p_papel is null or v.papel = p_papel)
       and (p_unidade is null or exists (
             select 1 from unidades_organizacionais u where u.id = v.unidade_id and p_unidade = any(u.caminho)))
  ),
  alvo as (
    select p.* from perfis p
     where (exists (select 1 from vis where vis.user_id = p.id)
            or (p_tenant is null and p_papel is null and p_unidade is null and eh_admin_plataforma()))
       and (v_like is null or p.nome ilike v_like or p.email ilike v_like)
       and (p_situacao = 'TODOS'
            or (p_situacao = 'ATIVOS' and p.ativo and (p_tenant is null or exists (select 1 from vis where vis.user_id = p.id and vis.ativo)))
            or (p_situacao = 'INATIVOS' and (not p.ativo or not exists (select 1 from vis where vis.user_id = p.id and vis.ativo))))
  ),
  pagina as (
    select * from alvo order by lower(nome), email
    limit least(greatest(p_limite, 1), 100) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from alvo),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pg.id, 'email', pg.email, 'nome', pg.nome, 'telefone', pg.telefone, 'avatar_path', pg.avatar_path,
        'ativo', pg.ativo, 'is_platform_admin', pg.is_platform_admin, 'ultimo_acesso', pg.ultimo_acesso,
        'criado_em', pg.criado_em,
        'vinculos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', vis.id, 'papel', vis.papel, 'papel_nome', pa.nome, 'ativo', vis.ativo,
            'tenant_id', vis.tenant_id, 'tenant_nome', t.nome_curto,
            'unidade_id', vis.unidade_id, 'unidade_nome', u.nome, 'unidade_sigla', u.sigla
          ) order by vis.ativo desc, t.nome_curto, pa.ordem)
          from vis
          join papeis pa on pa.codigo = vis.papel
          join tenants t on t.id = vis.tenant_id
          left join unidades_organizacionais u on u.id = vis.unidade_id
          where vis.user_id = pg.id), '[]')
      ) order by lower(pg.nome), pg.email)
      from pagina pg), '[]')
  ) into v_resultado;
  return v_resultado;
end $$;
