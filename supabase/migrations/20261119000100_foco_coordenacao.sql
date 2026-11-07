-- Filtro "uma coordenação por vez" para quem enxerga várias (ex.: consulta da Secretaria inteira).
-- A pessoa escolhe a coordenação em foco; enquanto o foco existir, os vínculos dela no órgão valem só
-- para essa coordenação (e o que está abaixo dela). O foco só RESTRINGE: nunca dá acesso a mais nada.
-- Os acessos da plataforma (estrutura, usuários, configurações, auditoria, decretos, sessão de suporte)
-- não passam pelo foco.

create table public.foco_unidade (
  user_id uuid not null references public.perfis(id),
  tenant_id uuid not null references public.tenants(id),
  unidade_id uuid not null references public.unidades_organizacionais(id),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
alter table public.foco_unidade enable row level security;
create policy foco_ler_proprio on public.foco_unidade for select using (user_id = (select auth.uid()));
-- escrita só pela função definir_foco
revoke all on public.foco_unidade from anon;
revoke insert, update, delete on public.foco_unidade from authenticated;

-- A unidade p_unidade está fora do foco que a pessoa escolheu neste órgão?
create function public.fora_do_foco(p_tenant uuid, p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from foco_unidade f
     where f.user_id = auth.uid() and f.tenant_id = p_tenant and p_unidade is not null
       and not exists (select 1 from unidades_organizacionais u where u.id = p_unidade and f.unidade_id = any(u.caminho))
  )
$$;

-- pode(): igual ao anterior; no ramo dos vínculos, a unidade precisa estar dentro do foco (se houver).
-- Registros do órgão sem unidade (fornecedores, classificações) continuam visíveis: o foco é de unidade.
create or replace function public.pode(p_tenant uuid, p_unidade uuid, p_recurso text, p_acao text, p_estrito boolean default false)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    (eh_admin_plataforma()
      and exists (select 1 from tenants where id = p_tenant)
      and exists (select 1 from recursos r where r.codigo = p_recurso
                   and (r.livre_para_plataforma or suporte_ativo(p_tenant))))
    or (exists (
      select 1
        from vinculos v
        join perfis p on p.id = v.user_id and p.ativo
        join tenants t on t.id = v.tenant_id and t.ativo
        join permissoes_papel pp on pp.papel = v.papel and pp.recurso = p_recurso and pp.acao = p_acao
       where v.user_id = auth.uid() and v.ativo and v.tenant_id = p_tenant
         and (v.unidade_id is null
              or (p_unidade is null and not p_estrito)
              or exists (select 1 from unidades_organizacionais u
                          where u.id = p_unidade and u.tenant_id = p_tenant and v.unidade_id = any(u.caminho)))
    ) and not fora_do_foco(p_tenant, p_unidade))
$$;

-- unidades_acessiveis(): igual ao anterior; no ramo dos vínculos, só as unidades dentro do foco (se houver)
create or replace function public.unidades_acessiveis(p_recurso text, p_acao text)
returns table(tenant_id uuid, unidade_id uuid)
language sql stable security definer set search_path = public as $$
  select u.tenant_id, u.id
    from unidades_organizacionais u
   where (select eh_admin_plataforma())
     and exists (select 1 from recursos r where r.codigo = p_recurso and (r.livre_para_plataforma or suporte_ativo(u.tenant_id)))
  union
  select u.tenant_id, u.id
    from vinculos v
    join perfis p on p.id = v.user_id and p.ativo
    join tenants t on t.id = v.tenant_id and t.ativo
    join permissoes_papel pp on pp.papel = v.papel and pp.recurso = p_recurso and pp.acao = p_acao
    join unidades_organizacionais u on u.tenant_id = v.tenant_id and (v.unidade_id is null or v.unidade_id = any(u.caminho))
    left join foco_unidade f on f.user_id = v.user_id and f.tenant_id = v.tenant_id
   where v.user_id = auth.uid() and v.ativo
     and (f.unidade_id is null or f.unidade_id = any(u.caminho))
$$;

-- Coordenações que a pessoa pode pôr em foco no órgão: as que os vínculos dela alcançam (sem considerar o foco atual)
create function public.coordenacoes_para_foco(p_tenant uuid)
returns table(id uuid, nome text, sigla text, diretoria text)
language sql stable security definer set search_path = public as $$
  select distinct u.id, u.nome, u.sigla, d.sigla
    from vinculos v
    join perfis p on p.id = v.user_id and p.ativo
    join unidades_organizacionais u on u.tenant_id = v.tenant_id and u.tipo = 'COORDENACAO' and u.ativo
                                   and (v.unidade_id is null or v.unidade_id = any(u.caminho))
    left join unidades_organizacionais d on d.id = u.pai_id
   where v.user_id = auth.uid() and v.ativo and v.tenant_id = p_tenant
   order by d.sigla nulls last, u.sigla, u.nome
$$;

-- Escolhe (ou limpa, com p_unidade nulo) a coordenação em foco no órgão
create function public.definir_foco(p_tenant uuid, p_unidade uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessão expirada.' using errcode = 'insufficient_privilege'; end if;
  if p_unidade is null then
    delete from foco_unidade where user_id = auth.uid() and tenant_id = p_tenant;
    return;
  end if;
  if not exists (select 1 from coordenacoes_para_foco(p_tenant) c where c.id = p_unidade) then
    raise exception 'Coordenação fora do seu acesso neste órgão.' using errcode = 'insufficient_privilege', hint = 'unidade_id';
  end if;
  insert into foco_unidade (user_id, tenant_id, unidade_id) values (auth.uid(), p_tenant, p_unidade)
  on conflict (user_id, tenant_id) do update set unidade_id = excluded.unidade_id, atualizado_em = now();
end $$;

-- meu_contexto(): o mesmo de antes, mais o foco escolhido em cada órgão
create or replace function public.meu_contexto() returns jsonb
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
       where s.admin_id = auth.uid() and s.encerrada_em is null and s.expira_em > now()), '[]'),
    'focos', coalesce((
      select jsonb_agg(jsonb_build_object('tenant_id', f.tenant_id, 'unidade_id', f.unidade_id, 'nome', u.nome, 'sigla', u.sigla))
        from foco_unidade f join unidades_organizacionais u on u.id = f.unidade_id
       where f.user_id = auth.uid()), '[]')
  )
$$;

revoke execute on function public.fora_do_foco(uuid, uuid), public.coordenacoes_para_foco(uuid), public.definir_foco(uuid, uuid) from public, anon;
grant execute on function public.fora_do_foco(uuid, uuid), public.coordenacoes_para_foco(uuid), public.definir_foco(uuid, uuid) to authenticated;
