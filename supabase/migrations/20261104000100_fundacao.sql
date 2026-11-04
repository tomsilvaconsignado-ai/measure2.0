-- MEASURE 2.0 — Fase 1: fundação multi-tenant
--
-- Órgãos (tenants), estrutura organizacional hierárquica, perfis, vínculos (memberships),
-- matriz de permissões (papel × recurso × ação), autorização por escopo, sessões de suporte
-- do administrador da plataforma, auditoria centralizada e configurações.
--
-- Princípios:
--   * Toda tabela tem RLS. A interface nunca é a barreira de segurança.
--   * Autorização = papel + órgão + escopo (subárvore da unidade do vínculo) + ação.
--   * Papéis de consulta são somente leitura (garantido por gatilho na matriz).
--   * O administrador da plataforma administra órgãos, estrutura e usuários; dados
--     operacionais de um órgão só com sessão de suporte justificada e auditada.
--   * Nada de exclusão física de registros com histórico: inativação.

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- Catálogos globais: papéis, recursos, ações e matriz de permissões
-- =====================================================================

create table public.papeis (
  codigo text primary key,
  nome text not null,
  descricao text not null default '',
  somente_leitura boolean not null default false,
  exige_unidade boolean not null default true,
  ordem int not null default 0
);

insert into public.papeis (codigo, nome, descricao, somente_leitura, exige_unidade, ordem) values
  ('MASTER', 'Master', 'Administrador do órgão: usuários, estrutura organizacional e configurações. Pode ter o escopo limitado a uma Secretaria.', false, false, 10),
  ('GESTAO_MUNICIPAL', 'Gestão Municipal', 'Consulta gerencial das Secretarias autorizadas. Somente leitura.', true, false, 20),
  ('SECRETARIO', 'Secretário(a)', 'Consulta das Diretorias da Secretaria. Somente leitura.', true, true, 30),
  ('DIRETOR', 'Diretoria', 'Consulta das Coordenações da Diretoria. Somente leitura.', true, true, 40),
  ('COORDENADOR', 'Coordenador(a)', 'Consulta da própria Coordenação. Somente leitura.', true, true, 50),
  ('ADMINISTRATIVO', 'Administrativo / Operacional', 'Cadastra e mantém os dados operacionais da sua área.', false, true, 60),
  ('SERVIDOR', 'Servidor', 'Acessa o próprio perfil.', true, true, 70);

create table public.recursos (
  codigo text primary key,
  nome text not null,
  grupo text not null,
  ordem int not null default 0,
  -- true: o administrador da plataforma usa sem sessão de suporte (administração do órgão)
  livre_para_plataforma boolean not null default false
);

insert into public.recursos (codigo, nome, grupo, ordem, livre_para_plataforma) values
  ('estrutura', 'Estrutura organizacional', 'Administração', 10, true),
  ('usuarios', 'Usuários e vínculos', 'Administração', 20, true),
  ('configuracoes', 'Configurações e identidade', 'Administração', 30, true),
  ('auditoria', 'Auditoria', 'Administração', 40, true),
  ('fornecedores', 'Fornecedores', 'Cadastros', 100, false),
  ('servidores', 'Servidores', 'Cadastros', 110, false),
  ('unidades', 'Unidades atendidas', 'Cadastros', 120, false),
  ('classificacoes', 'Classificação orçamentária', 'Cadastros', 130, false),
  ('tipos_servico', 'Tipos de serviço', 'Cadastros', 140, false),
  ('contratos', 'Contratos', 'Contratos e execução', 200, false),
  ('empenhos', 'Empenhos', 'Contratos e execução', 210, false),
  ('notas_fiscais', 'Notas fiscais e execução', 'Contratos e execução', 220, false),
  ('ordens_servico', 'Ordens de serviço', 'Contratos e execução', 230, false),
  ('relatorios', 'Consulta e relatórios', 'Consulta', 300, false);

create table public.acoes (
  codigo text primary key,
  nome text not null,
  ordem int not null default 0,
  -- ações que não alteram dados (as únicas permitidas aos papéis somente leitura)
  leitura boolean not null default false
);

insert into public.acoes (codigo, nome, ordem, leitura) values
  ('ler', 'Ler', 10, true),
  ('criar', 'Criar', 20, false),
  ('editar', 'Editar', 30, false),
  ('excluir', 'Excluir / inativar', 40, false),
  ('aprovar', 'Aprovar', 50, false),
  ('atestar', 'Atestar', 60, false),
  ('exportar', 'Exportar / imprimir', 70, true);

create table public.permissoes_papel (
  papel text not null references public.papeis(codigo) on delete cascade,
  recurso text not null references public.recursos(codigo) on delete cascade,
  acao text not null references public.acoes(codigo) on delete cascade,
  primary key (papel, recurso, acao)
);

-- Papel somente leitura nunca recebe ação de escrita, nem por engano na matriz
create function public.valida_permissao_papel() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select somente_leitura from papeis where codigo = new.papel)
     and not (select leitura from acoes where codigo = new.acao) then
    raise exception 'O papel % é somente leitura e não pode receber a ação "%".', new.papel, new.acao
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger permissoes_papel_valida before insert or update on public.permissoes_papel
  for each row execute function public.valida_permissao_papel();

-- Matriz inicial (administrável depois pela plataforma)
insert into public.permissoes_papel (papel, recurso, acao)
select 'MASTER', r.codigo, a.codigo
from public.recursos r cross join public.acoes a
where a.codigo <> 'atestar';  -- atesto é só por designação no contrato

insert into public.permissoes_papel (papel, recurso, acao)
select p.papel, r.codigo, a.acao
from (values ('GESTAO_MUNICIPAL'), ('SECRETARIO'), ('DIRETOR'), ('COORDENADOR')) p(papel)
cross join public.recursos r
cross join (values ('ler'), ('exportar')) a(acao)
where r.codigo not in ('auditoria', 'configuracoes');

insert into public.permissoes_papel (papel, recurso, acao)
select 'ADMINISTRATIVO', r.recurso, a.acao
from (values ('fornecedores'), ('servidores'), ('unidades'), ('contratos'), ('empenhos'),
             ('notas_fiscais'), ('ordens_servico')) r(recurso)
cross join (values ('ler'), ('criar'), ('editar'), ('excluir'), ('exportar')) a(acao)
union all
select 'ADMINISTRATIVO', r, a from (values
  ('estrutura', 'ler'),
  ('usuarios', 'ler'), ('usuarios', 'criar'), ('usuarios', 'editar'), ('usuarios', 'excluir'),
  ('classificacoes', 'ler'), ('classificacoes', 'exportar'),
  ('tipos_servico', 'ler'), ('tipos_servico', 'criar'), ('tipos_servico', 'editar'),
  ('relatorios', 'ler'), ('relatorios', 'exportar')
) x(r, a);

insert into public.permissoes_papel (papel, recurso, acao) values ('SERVIDOR', 'estrutura', 'ler');

-- Quais papéis cada papel pode conceder (dentro do próprio escopo)
create table public.papel_concede (
  concedente text not null references public.papeis(codigo) on delete cascade,
  concedido text not null references public.papeis(codigo) on delete cascade,
  primary key (concedente, concedido),
  check (concedido <> 'MASTER')  -- só a plataforma cria Master
);

insert into public.papel_concede (concedente, concedido)
select 'MASTER', codigo from public.papeis where codigo <> 'MASTER'
union all
select 'ADMINISTRATIVO', x from (values ('ADMINISTRATIVO'), ('SERVIDOR')) v(x);

-- =====================================================================
-- Órgãos (tenants) e estrutura organizacional
-- =====================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  nome_oficial text not null check (length(btrim(nome_oficial)) between 3 and 200),
  nome_curto text not null check (length(btrim(nome_curto)) between 2 and 60),
  cnpj text unique check (cnpj ~ '^[0-9]{14}$'),
  endereco text,
  cep text check (cep ~ '^[0-9]{8}$'),
  cidade text,
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  telefone text,
  email_contato text,
  site text,
  logo_path text,
  -- domínios de e-mail aceitos nos convites (vazio = qualquer domínio)
  dominios_email text[] not null default '{}',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table public.unidades_organizacionais (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  pai_id uuid references public.unidades_organizacionais(id),
  tipo text not null check (tipo in ('ORGANIZACAO', 'SECRETARIA', 'DIRETORIA', 'COORDENACAO',
                                     'GERENCIA', 'DEPARTAMENTO', 'SETOR', 'UNIDADE')),
  nome text not null check (length(btrim(nome)) between 2 and 200),
  sigla text check (length(btrim(sigla)) between 1 and 30),
  descricao text,
  endereco text,
  telefone text,
  email text,
  -- ancestrais + a própria unidade, da raiz para baixo (mantido por gatilho)
  caminho uuid[] not null default '{}',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create unique index unidades_nome_unico on public.unidades_organizacionais
  (tenant_id, coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nome)));
create index unidades_tenant on public.unidades_organizacionais (tenant_id);
create index unidades_caminho on public.unidades_organizacionais using gin (caminho);

create function public.unidade_caminho() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pai record;
begin
  if tg_op = 'INSERT' or new.pai_id is distinct from old.pai_id then
    if new.pai_id is null then
      new.caminho := array[new.id];
    else
      select tenant_id, caminho into v_pai from unidades_organizacionais where id = new.pai_id;
      if not found then
        raise exception 'Unidade superior não encontrada.' using errcode = 'foreign_key_violation';
      end if;
      if v_pai.tenant_id <> new.tenant_id then
        raise exception 'A unidade superior pertence a outro órgão.' using errcode = 'check_violation';
      end if;
      if new.id = any(v_pai.caminho) then
        raise exception 'Uma unidade não pode ficar subordinada a ela mesma nem a uma unidade abaixo dela.'
          using errcode = 'check_violation';
      end if;
      new.caminho := v_pai.caminho || new.id;
    end if;
  end if;
  return new;
end $$;

create trigger unidades_caminho before insert or update on public.unidades_organizacionais
  for each row execute function public.unidade_caminho();

-- Ao mover uma unidade, o caminho de toda a subárvore acompanha
create function public.unidade_caminho_descendentes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update unidades_organizacionais d
     set caminho = new.caminho || d.caminho[array_position(d.caminho, new.id) + 1:]
   where new.id = any(d.caminho) and d.id <> new.id;
  return null;
end $$;

create trigger unidades_caminho_descendentes after update of pai_id on public.unidades_organizacionais
  for each row when (new.pai_id is distinct from old.pai_id)
  execute function public.unidade_caminho_descendentes();

-- =====================================================================
-- Perfis e vínculos
-- =====================================================================

create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nome text not null default '',
  telefone text,
  avatar_path text,
  is_platform_admin boolean not null default false,
  ativo boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, email, nome)
  values (new.id, lower(new.email),
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger auth_criar_perfil after insert on auth.users
  for each row execute function public.criar_perfil();

create function public.sincronizar_email_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update perfis set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger auth_sincronizar_email after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.sincronizar_email_perfil();

create table public.vinculos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.perfis(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  -- escopo: a unidade e toda a sua subárvore (null = órgão inteiro)
  unidade_id uuid references public.unidades_organizacionais(id),
  papel text not null references public.papeis(codigo),
  ativo boolean not null default true,
  padrao boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create unique index vinculos_unico on public.vinculos
  (user_id, tenant_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), papel);
create unique index vinculos_um_padrao on public.vinculos (user_id) where padrao;
create index vinculos_tenant on public.vinculos (tenant_id);
create index vinculos_usuario on public.vinculos (user_id) where ativo;

create function public.valida_vinculo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unidade_id is not null and not exists (
    select 1 from unidades_organizacionais where id = new.unidade_id and tenant_id = new.tenant_id
  ) then
    raise exception 'A unidade do vínculo não pertence a este órgão.' using errcode = 'check_violation';
  end if;
  if new.unidade_id is null and (select exige_unidade from papeis where codigo = new.papel) then
    raise exception 'O papel % exige uma unidade (Secretaria, Diretoria, Coordenação...).', new.papel
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger vinculos_valida before insert or update on public.vinculos
  for each row execute function public.valida_vinculo();

-- =====================================================================
-- Sessões de suporte do administrador da plataforma
-- =====================================================================

create table public.sessoes_suporte (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.perfis(id),
  tenant_id uuid not null references public.tenants(id),
  justificativa text not null check (length(btrim(justificativa)) >= 10),
  iniciada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  encerrada_em timestamptz,
  check (expira_em > iniciada_em)
);
create index sessoes_suporte_ativas on public.sessoes_suporte (admin_id, tenant_id) where encerrada_em is null;

-- =====================================================================
-- Configurações
-- =====================================================================

create table public.tenant_configuracoes (
  tenant_id uuid primary key references public.tenants(id),
  -- linhas do cabeçalho institucional dos documentos (abaixo do brasão)
  documento_cabecalho text[] not null default '{}',
  documento_rodape text,
  alerta_vencimento_dias int[] not null default '{30,15}',
  anexo_tamanho_max_mb int not null default 10 check (anexo_tamanho_max_mb between 1 and 50),
  bloquear_nota_contrato_vencido boolean not null default false,
  -- textos configuráveis (atesto, decreto, observações padrão...)
  textos jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table public.configuracoes_globais (
  chave text primary key,
  valor jsonb not null,
  descricao text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create function public.criar_configuracoes_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into tenant_configuracoes (tenant_id, documento_cabecalho)
  values (new.id, array[upper(new.nome_oficial)]) on conflict do nothing;
  return null;
end $$;

create trigger tenants_configuracoes after insert on public.tenants
  for each row execute function public.criar_configuracoes_tenant();

-- =====================================================================
-- Auditoria
-- =====================================================================

create table public.auditoria (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  tenant_id uuid references public.tenants(id),
  usuario_id uuid,
  usuario_email text,
  papeis text,
  via_suporte boolean not null default false,
  entidade text not null,
  registro_id text,
  acao text not null,
  antes jsonb,
  depois jsonb,
  campos_alterados text[],
  justificativa text,
  contexto jsonb
);
create index auditoria_tenant_data on public.auditoria (tenant_id, criado_em desc);
create index auditoria_registro on public.auditoria (entidade, registro_id);
create index auditoria_usuario on public.auditoria (usuario_id, criado_em desc);

-- Justificativa da operação: definida por RPC (measure.justificativa) ou enviada pelo app no
-- cabeçalho x-justificativa (texto UTF-8 em base64) da própria requisição REST.
create function public.justificativa_atual() returns text
language plpgsql stable set search_path = public as $$
declare v text := nullif(current_setting('measure.justificativa', true), '');
        h text;
begin
  if v is not null then return v; end if;
  h := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-justificativa';
  if h is null then return null; end if;
  return nullif(btrim(convert_from(decode(h, 'base64'), 'UTF8')), '');
exception when others then
  return null;
end $$;

create function public.registrar_auditoria(
  p_tenant uuid, p_entidade text, p_registro text, p_acao text,
  p_antes jsonb default null, p_depois jsonb default null,
  p_justificativa text default null, p_contexto jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_papeis text;
  v_campos text[];
begin
  select email into v_email from perfis where id = v_uid;
  if p_tenant is not null then
    select string_agg(distinct papel, ',' order by papel) into v_papeis
      from vinculos where user_id = v_uid and tenant_id = p_tenant and ativo;
  end if;
  if p_antes is not null and p_depois is not null then
    select array_agg(k order by k) into v_campos
      from (select key as k from jsonb_each(p_depois)
            except select key from jsonb_each(p_antes) a where p_depois -> a.key = a.value) x;
  end if;
  insert into auditoria (tenant_id, usuario_id, usuario_email, papeis, via_suporte, entidade, registro_id,
                         acao, antes, depois, campos_alterados, justificativa, contexto)
  values (p_tenant, v_uid, v_email, v_papeis,
          coalesce((select is_platform_admin from perfis where id = v_uid), false)
            and p_tenant is not null
            and not exists (select 1 from vinculos where user_id = v_uid and tenant_id = p_tenant and ativo),
          p_entidade, p_registro, p_acao, p_antes, p_depois, v_campos,
          coalesce(p_justificativa, justificativa_atual()), p_contexto);
end $$;

-- Gatilho genérico. Argumentos opcionais: colunas a mascarar no registro (dados sensíveis).
create function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
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
  v_tenant := case when tg_table_name = 'tenants' then coalesce(new.id, old.id)
                   else (coalesce(v_depois, v_antes) ->> 'tenant_id')::uuid end;
  perform registrar_auditoria(v_tenant, tg_table_name, coalesce(v_depois, v_antes) ->> 'id',
                              tg_op, v_antes, v_depois);
  return null;
end $$;

-- =====================================================================
-- Carimbos de data/usuário e proteção do tenant_id
-- =====================================================================

create function public.carimbar() returns trigger
language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

create function public.carimbar_criacao() returns trigger
language plpgsql set search_path = public as $$
begin
  new.criado_por := coalesce(new.criado_por, auth.uid());
  return new;
end $$;

create function public.bloquear_troca_tenant() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'Não é permitido transferir um registro para outro órgão.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger tenants_carimbar before update on public.tenants for each row execute function public.carimbar();
create trigger tenants_criacao before insert on public.tenants for each row execute function public.carimbar_criacao();
create trigger unidades_carimbar before update on public.unidades_organizacionais for each row execute function public.carimbar();
create trigger unidades_criacao before insert on public.unidades_organizacionais for each row execute function public.carimbar_criacao();
create trigger unidades_tenant before update on public.unidades_organizacionais for each row execute function public.bloquear_troca_tenant();
create trigger perfis_carimbar before update on public.perfis for each row execute function public.carimbar();
create trigger vinculos_carimbar before update on public.vinculos for each row execute function public.carimbar();
create trigger vinculos_criacao before insert on public.vinculos for each row execute function public.carimbar_criacao();
create trigger vinculos_tenant before update on public.vinculos for each row execute function public.bloquear_troca_tenant();
create trigger tenant_configuracoes_carimbar before update on public.tenant_configuracoes for each row execute function public.carimbar();
create trigger configuracoes_globais_carimbar before update on public.configuracoes_globais for each row execute function public.carimbar();

create trigger tenants_auditar after insert or update or delete on public.tenants for each row execute function public.auditar();
create trigger unidades_auditar after insert or update or delete on public.unidades_organizacionais for each row execute function public.auditar();
create trigger perfis_auditar after update or delete on public.perfis for each row execute function public.auditar();
create trigger vinculos_auditar after insert or update or delete on public.vinculos for each row execute function public.auditar();
create trigger tenant_configuracoes_auditar after update on public.tenant_configuracoes for each row execute function public.auditar();
create trigger configuracoes_globais_auditar after insert or update or delete on public.configuracoes_globais for each row execute function public.auditar();

create function public.auditar_matriz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform registrar_auditoria(null, tg_table_name,
    coalesce(to_jsonb(new), to_jsonb(old)) ->> case when tg_table_name = 'papel_concede' then 'concedido' else 'papel' end,
    tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
create trigger permissoes_papel_auditar after insert or update or delete on public.permissoes_papel for each row execute function public.auditar_matriz();
create trigger papel_concede_auditar after insert or update or delete on public.papel_concede for each row execute function public.auditar_matriz();

-- =====================================================================
-- Funções de autorização (base de todas as políticas RLS)
-- =====================================================================

create function public.eh_admin_plataforma() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and is_platform_admin and ativo)
$$;

create function public.suporte_ativo(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessoes_suporte
     where admin_id = auth.uid() and tenant_id = p_tenant and encerrada_em is null and expira_em > now()
  )
$$;

-- Usuário com vínculo ativo no órgão (perfil e órgão ativos)
create function public.membro_do_tenant(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vinculos v
      join perfis p on p.id = v.user_id and p.ativo
      join tenants t on t.id = v.tenant_id and t.ativo
     where v.user_id = auth.uid() and v.tenant_id = p_tenant and v.ativo
  )
$$;

-- Autorização central.
--   p_unidade: unidade do registro. null = registro do órgão inteiro.
--   p_estrito: com p_unidade null, exige vínculo com escopo no órgão inteiro (ex.: criar unidade raiz).
create function public.pode(p_tenant uuid, p_unidade uuid, p_recurso text, p_acao text, p_estrito boolean default false)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    (eh_admin_plataforma()
      and exists (select 1 from tenants where id = p_tenant)
      and exists (select 1 from recursos r where r.codigo = p_recurso
                   and (r.livre_para_plataforma or suporte_ativo(p_tenant))))
    or exists (
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
    )
$$;

-- A unidade aparece para quem tem vínculo que a alcança (subárvore) ou que está abaixo dela (caminho até a raiz)
create function public.unidade_visivel(p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin_plataforma() or exists (
    select 1
      from unidades_organizacionais u
      join vinculos v on v.tenant_id = u.tenant_id and v.user_id = auth.uid() and v.ativo
      join perfis p on p.id = v.user_id and p.ativo
      join tenants t on t.id = v.tenant_id and t.ativo
     where u.id = p_unidade
       and (v.unidade_id is null
            or v.unidade_id = any(u.caminho)
            or exists (select 1 from unidades_organizacionais x
                        where x.id = v.unidade_id and u.id = any(x.caminho)))
  )
$$;

-- Perfil visível: o próprio, a plataforma ou quem pode ler usuários de algum vínculo da pessoa
create function public.perfil_visivel(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or eh_admin_plataforma() or exists (
    select 1 from vinculos v where v.user_id = p_user and pode(v.tenant_id, v.unidade_id, 'usuarios', 'ler')
  )
$$;

-- =====================================================================
-- Proteções de colunas
-- =====================================================================

-- Fora da plataforma, ninguém altera status, domínios ou CNPJ do órgão
create function public.protege_tenant() returns trigger
language plpgsql set search_path = public as $$
begin
  -- auth.uid() nulo = operação interna (migração, função de servidor com chave de serviço)
  if tg_op = 'UPDATE' and auth.uid() is not null and not eh_admin_plataforma() and (
       new.ativo is distinct from old.ativo
    or new.dominios_email is distinct from old.dominios_email
    or new.cnpj is distinct from old.cnpj) then
    raise exception 'Somente o administrador da plataforma altera status, CNPJ e domínios de e-mail do órgão.'
      using errcode = 'insufficient_privilege';
  end if;
  new.dominios_email := (select coalesce(array_agg(distinct lower(btrim(d, ' @'))) filter (where btrim(d, ' @') <> ''), '{}')
                           from unnest(new.dominios_email) d);
  return new;
end $$;
create trigger tenants_protege before insert or update on public.tenants for each row execute function public.protege_tenant();

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.papeis enable row level security;
alter table public.recursos enable row level security;
alter table public.acoes enable row level security;
alter table public.permissoes_papel enable row level security;
alter table public.papel_concede enable row level security;
alter table public.tenants enable row level security;
alter table public.unidades_organizacionais enable row level security;
alter table public.perfis enable row level security;
alter table public.vinculos enable row level security;
alter table public.sessoes_suporte enable row level security;
alter table public.tenant_configuracoes enable row level security;
alter table public.configuracoes_globais enable row level security;
alter table public.auditoria enable row level security;

-- Catálogos: leitura para usuários autenticados; escrita só da plataforma
create policy papeis_ler on public.papeis for select to authenticated using (true);
create policy papeis_plataforma on public.papeis for all to authenticated using (eh_admin_plataforma()) with check (eh_admin_plataforma());
create policy recursos_ler on public.recursos for select to authenticated using (true);
create policy recursos_plataforma on public.recursos for all to authenticated using (eh_admin_plataforma()) with check (eh_admin_plataforma());
create policy acoes_ler on public.acoes for select to authenticated using (true);
create policy permissoes_ler on public.permissoes_papel for select to authenticated using (true);
create policy permissoes_plataforma on public.permissoes_papel for all to authenticated using (eh_admin_plataforma()) with check (eh_admin_plataforma());
create policy papel_concede_ler on public.papel_concede for select to authenticated using (true);
create policy papel_concede_plataforma on public.papel_concede for all to authenticated using (eh_admin_plataforma()) with check (eh_admin_plataforma());

-- Órgãos
create policy tenants_ler on public.tenants for select to authenticated
  using (eh_admin_plataforma() or exists (select 1 from vinculos v where v.tenant_id = tenants.id and v.user_id = auth.uid() and v.ativo));
create policy tenants_criar on public.tenants for insert to authenticated with check (eh_admin_plataforma());
create policy tenants_editar on public.tenants for update to authenticated
  using (pode(id, null, 'configuracoes', 'editar')) with check (pode(id, null, 'configuracoes', 'editar'));

-- Estrutura organizacional
create policy unidades_ler on public.unidades_organizacionais for select to authenticated
  using (unidade_visivel(id));
create policy unidades_criar on public.unidades_organizacionais for insert to authenticated
  with check (pode(tenant_id, pai_id, 'estrutura', 'criar', true));
create policy unidades_editar on public.unidades_organizacionais for update to authenticated
  using (pode(tenant_id, id, 'estrutura', 'editar', true))
  with check (pode(tenant_id, id, 'estrutura', 'editar', true));

-- Mover uma unidade exige poder criar no novo lugar
create function public.protege_movimento_unidade() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.pai_id is distinct from old.pai_id and auth.uid() is not null
     and not pode(new.tenant_id, new.pai_id, 'estrutura', 'criar', true) then
    raise exception 'Você não tem permissão para mover a unidade para esse local.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger unidades_protege_movimento before update of pai_id on public.unidades_organizacionais
  for each row execute function public.protege_movimento_unidade();

-- Perfis: cada um edita só nome, telefone e foto (privilégio por coluna); o resto é por RPC
create policy perfis_ler on public.perfis for select to authenticated using (perfil_visivel(id));
create policy perfis_editar_proprio on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Vínculos: leitura conforme escopo; escrita só pelas RPCs
create policy vinculos_ler on public.vinculos for select to authenticated
  using (user_id = auth.uid() or pode(tenant_id, unidade_id, 'usuarios', 'ler'));

-- Sessões de suporte: a plataforma vê todas; membros com auditoria veem as do seu órgão
create policy sessoes_suporte_ler on public.sessoes_suporte for select to authenticated
  using (eh_admin_plataforma() or pode(tenant_id, null, 'auditoria', 'ler'));

-- Configurações
create policy tenant_config_ler on public.tenant_configuracoes for select to authenticated
  using (eh_admin_plataforma() or membro_do_tenant(tenant_id));
create policy tenant_config_editar on public.tenant_configuracoes for update to authenticated
  using (pode(tenant_id, null, 'configuracoes', 'editar')) with check (pode(tenant_id, null, 'configuracoes', 'editar'));
create policy config_globais_ler on public.configuracoes_globais for select to authenticated using (true);
create policy config_globais_plataforma on public.configuracoes_globais for all to authenticated
  using (eh_admin_plataforma()) with check (eh_admin_plataforma());

-- Auditoria: só leitura, e só registros do escopo; ninguém grava direto
create policy auditoria_ler on public.auditoria for select to authenticated
  using (eh_admin_plataforma() or (tenant_id is not null and pode(tenant_id, null, 'auditoria', 'ler')));

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.auditoria from authenticated;
revoke insert, update, delete on public.sessoes_suporte from authenticated;
revoke insert, update, delete on public.vinculos from authenticated;
revoke insert, delete on public.perfis from authenticated;
revoke update on public.perfis from authenticated;
grant update (nome, telefone, avatar_path) on public.perfis to authenticated;
revoke delete on public.tenants, public.unidades_organizacionais, public.tenant_configuracoes from authenticated;
