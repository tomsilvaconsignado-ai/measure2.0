-- Fornecedores por coordenação. Antes o fornecedor era do órgão inteiro: a CSA via os fornecedores da COINFRA.
-- Agora cada fornecedor fica ligado às coordenações que o usam (quem cadastrou e as que têm contrato com ele).
-- Quem atua numa coordenação vê só os fornecedores dela; Diretoria/Secretaria/órgão inteiro veem os das
-- coordenações abaixo (e o filtro de coordenação em foco vale aqui também). O CNPJ continua único no órgão:
-- se outra coordenação já cadastrou a empresa, ela é apenas vinculada à sua (vincular_fornecedor).

create table public.fornecedor_unidades (
  fornecedor_id uuid not null references public.fornecedores(id),
  unidade_id uuid not null references public.unidades_organizacionais(id),
  tenant_id uuid not null references public.tenants(id),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  primary key (fornecedor_id, unidade_id)
);
create index fornecedor_unidades_unidade on public.fornecedor_unidades (unidade_id);
alter table public.fornecedor_unidades enable row level security;
create policy fornecedor_unidades_ler on public.fornecedor_unidades for select
  using (pode(tenant_id, unidade_id, 'fornecedores', 'ler'));
revoke all on public.fornecedor_unidades from anon;
revoke insert, update, delete on public.fornecedor_unidades from authenticated;
create trigger fornecedor_unidades_auditar after insert or update or delete on public.fornecedor_unidades
  for each row execute function public.auditar();

-- Fornecedores que a pessoa alcança para a ação: os ligados às unidades acessíveis (respeita o foco) e,
-- para quem atua no órgão inteiro, também os ainda sem coordenação.
create function public.fornecedores_visiveis(p_acao text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select fu.fornecedor_id
    from fornecedor_unidades fu
   where (fu.tenant_id, fu.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('fornecedores', p_acao) a)
  union
  select f.id
    from fornecedores f
   where not exists (select 1 from fornecedor_unidades x where x.fornecedor_id = f.id)
     and pode(f.tenant_id, null, 'fornecedores', p_acao, true)
$$;

-- Coordenação em que um fornecedor novo entra: a do foco escolhido; senão, a unidade do único vínculo de cadastro.
-- Nula para quem atua no órgão inteiro (ou tem vínculos em várias unidades sem foco).
create function public.unidade_padrao_fornecedor(p_tenant uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_foco uuid; v_unidades uuid[];
begin
  select f.unidade_id into v_foco from foco_unidade f where f.user_id = auth.uid() and f.tenant_id = p_tenant;
  if v_foco is not null then return v_foco; end if;
  select array_agg(distinct v.unidade_id) into v_unidades
    from vinculos v join permissoes_papel pp on pp.papel = v.papel and pp.recurso = 'fornecedores' and pp.acao = 'criar'
   where v.user_id = auth.uid() and v.ativo and v.tenant_id = p_tenant;
  if cardinality(v_unidades) = 1 then return v_unidades[1]; end if;
  return null;
end $$;

-- Liga o fornecedor recém-cadastrado à coordenação de quem cadastrou
create function public.vincular_fornecedor_criado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_unidade uuid := unidade_padrao_fornecedor(new.tenant_id);
begin
  if v_unidade is not null then
    insert into fornecedor_unidades (fornecedor_id, unidade_id, tenant_id) values (new.id, v_unidade, new.tenant_id)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger fornecedores_vincular after insert on public.fornecedores
  for each row execute function public.vincular_fornecedor_criado();

-- Contrato com o fornecedor liga o fornecedor à coordenação do contrato
create function public.vincular_fornecedor_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into fornecedor_unidades (fornecedor_id, unidade_id, tenant_id) values (new.fornecedor_id, new.unidade_id, new.tenant_id)
  on conflict do nothing;
  return null;
end $$;
create trigger contratos_vincular_fornecedor after insert or update of fornecedor_id, unidade_id on public.contratos
  for each row execute function public.vincular_fornecedor_contrato();

-- CNPJ já cadastrado no órgão por outra coordenação: vincula à coordenação de quem pede (sem duplicar a empresa)
create function public.vincular_fornecedor(p_tenant uuid, p_documento text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f fornecedores; v_unidade uuid;
begin
  if not pode(p_tenant, null, 'fornecedores', 'criar') then
    raise exception 'Você não tem permissão para cadastrar fornecedores.' using errcode = 'insufficient_privilege';
  end if;
  select * into f from fornecedores where tenant_id = p_tenant and documento = regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  if f.id is null then raise exception 'Fornecedor não encontrado neste órgão.' using errcode = 'no_data_found', hint = 'documento'; end if;
  v_unidade := unidade_padrao_fornecedor(p_tenant);
  if v_unidade is null then
    raise exception 'Escolha no topo da tela a coordenação que vai usar este fornecedor.' using errcode = 'check_violation', hint = 'documento';
  end if;
  if not pode(p_tenant, v_unidade, 'fornecedores', 'criar') then
    raise exception 'Você não pode cadastrar fornecedores nessa coordenação.' using errcode = 'insufficient_privilege';
  end if;
  insert into fornecedor_unidades (fornecedor_id, unidade_id, tenant_id) values (f.id, v_unidade, p_tenant) on conflict do nothing;
  return jsonb_build_object('id', f.id, 'razao_social', f.razao_social);
end $$;

-- Políticas: ler/editar só o que a pessoa alcança (quem cadastrou sempre vê o que cadastrou)
drop policy fornecedores_ler on public.fornecedores;
create policy fornecedores_ler on public.fornecedores for select
  using (id in (select fornecedores_visiveis('ler'))
         or (criado_por = (select auth.uid()) and pode(tenant_id, null, 'fornecedores', 'ler')));
drop policy fornecedores_editar on public.fornecedores;
create policy fornecedores_editar on public.fornecedores for update
  using (id in (select fornecedores_visiveis('editar'))
         or (criado_por = (select auth.uid()) and pode(tenant_id, null, 'fornecedores', 'editar')))
  with check (pode(tenant_id, null, 'fornecedores', 'editar'));

drop policy fornecedor_contas_ler on public.fornecedor_contas;
create policy fornecedor_contas_ler on public.fornecedor_contas for select
  using (fornecedor_id in (select id from fornecedores));
drop policy fornecedor_contas_criar on public.fornecedor_contas;
create policy fornecedor_contas_criar on public.fornecedor_contas for insert
  with check (exists (select 1 from fornecedores f where f.id = fornecedor_contas.fornecedor_id and pode(f.tenant_id, null, 'fornecedores', 'editar')));
drop policy fornecedor_contas_editar on public.fornecedor_contas;
create policy fornecedor_contas_editar on public.fornecedor_contas for update
  using (fornecedor_id in (select id from fornecedores) and pode(tenant_id, null, 'fornecedores', 'editar'))
  with check (pode(tenant_id, null, 'fornecedores', 'editar'));

-- Dados existentes: cada fornecedor passa a pertencer às coordenações dos seus contratos
insert into public.fornecedor_unidades (fornecedor_id, unidade_id, tenant_id, criado_por)
select distinct c.fornecedor_id, c.unidade_id, c.tenant_id, null::uuid from public.contratos c
on conflict do nothing;

revoke execute on function public.fornecedores_visiveis(text), public.unidade_padrao_fornecedor(uuid),
  public.vincular_fornecedor_criado(), public.vincular_fornecedor_contrato(), public.vincular_fornecedor(uuid, text) from public, anon;
revoke execute on function public.vincular_fornecedor_criado(), public.vincular_fornecedor_contrato() from authenticated;
grant execute on function public.fornecedores_visiveis(text), public.unidade_padrao_fornecedor(uuid), public.vincular_fornecedor(uuid, text) to authenticated;
