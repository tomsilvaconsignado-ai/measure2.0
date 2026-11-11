-- CONECTA – Comunicação Institucional: fórum privado de comunicados, com destinatários tirados dos
-- cadastros existentes (estrutura organizacional, servidores, contas), comentários, curtidas, anexos,
-- denúncias e moderação. Também cria a central de notificações internas, usada pelo CONECTA e pelo Patrimônio.
--
-- Regras de acesso (no banco, não só na tela):
--   * Publicar, comentar e curtir é participação pessoal, como editar o próprio perfil: vale para qualquer
--     pessoa com vínculo ativo no órgão (perfil e órgão ativos), inclusive papéis de consulta. Não passa pela
--     matriz, que continua sem dar escrita a papéis somente leitura.
--   * Moderar (ocultar, fixar, resolver denúncias) exige conecta:aprovar; gerenciar categorias, conecta:editar.
--   * Uma publicação é vista pelo autor, pelos moderadores e pelos destinatários: todos do órgão, ou quem tem
--     lotação (cadastro de servidor) ou vínculo numa unidade escolhida ou abaixo dela, ou a pessoa escolhida.
--   * Comentários, curtidas e anexos seguem a visibilidade da publicação (RLS e storage).
--   * Escrita só pelas funções conecta_*; as tabelas não aceitam INSERT/UPDATE/DELETE direto (exceto categorias).

-- =====================================================================
-- Recurso e matriz
-- =====================================================================

insert into public.recursos (codigo, nome, grupo, ordem) values
  ('conecta', 'CONECTA – moderação e categorias', 'Comunicação', 400);

insert into public.permissoes_papel (papel, recurso, acao)
select 'MASTER', 'conecta', a from unnest(array['ler', 'criar', 'editar', 'excluir', 'aprovar', 'exportar']) a;

-- =====================================================================
-- Central de notificações (interna, por pessoa e órgão)
-- =====================================================================

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null references public.perfis(id),
  modulo text not null check (modulo in ('CONECTA', 'PATRIMONIO')),
  tipo text not null check (tipo ~ '^[A-Z_]{3,40}$'),
  titulo text not null check (length(btrim(titulo)) between 1 and 300),
  descricao text,
  link text,
  referencia_id uuid,
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);
create index notificacoes_pessoa on public.notificacoes (user_id, tenant_id, criado_em desc);
create index notificacoes_nao_lidas on public.notificacoes (user_id, tenant_id) where lida_em is null;

alter table public.notificacoes enable row level security;
create policy notificacoes_ler on public.notificacoes for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.notificacoes from anon;
revoke insert, update, delete on public.notificacoes from authenticated;

-- A pessoa tem vínculo ativo no órgão (perfil e órgão ativos)? Versão para qualquer pessoa, não só quem chama.
create function public.membro_ativo(p_tenant uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vinculos v
      join perfis p on p.id = v.user_id and p.ativo
      join tenants t on t.id = v.tenant_id and t.ativo
     where v.user_id = p_user and v.tenant_id = p_tenant and v.ativo)
$$;

-- Gera notificações (uso interno). Ignora quem chama e quem não é mais membro do órgão.
create function public.notificar(p_tenant uuid, p_users uuid[], p_modulo text, p_tipo text, p_titulo text,
                                 p_descricao text, p_link text, p_referencia uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into notificacoes (tenant_id, user_id, modulo, tipo, titulo, descricao, link, referencia_id)
  select p_tenant, x.u, p_modulo, p_tipo, left(p_titulo, 300), left(p_descricao, 500), p_link, p_referencia
    from (select distinct unnest(p_users) u) x
   where x.u is not null and x.u is distinct from auth.uid() and membro_ativo(p_tenant, x.u);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function public.minhas_mensagens(p_tenant uuid, p_modulo text default null, p_limite int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nao_lidas', (select count(*) from notificacoes n where n.user_id = auth.uid() and n.tenant_id = p_tenant
                    and n.lida_em is null and (p_modulo is null or n.modulo = p_modulo)),
    'itens', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' - 'tenant_id' order by x.criado_em desc) from (
        select * from notificacoes n where n.user_id = auth.uid() and n.tenant_id = p_tenant
           and (p_modulo is null or n.modulo = p_modulo)
         order by n.criado_em desc limit least(greatest(p_limite, 1), 100)) x), '[]'))
$$;

-- Marca como lidas: as indicadas, ou todas do módulo (ou do órgão) quando p_ids é nulo
create function public.marcar_mensagens_lidas(p_tenant uuid, p_ids uuid[] default null, p_modulo text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update notificacoes set lida_em = now()
   where user_id = auth.uid() and tenant_id = p_tenant and lida_em is null
     and (p_ids is null or id = any(p_ids)) and (p_modulo is null or modulo = p_modulo);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- =====================================================================
-- Tabelas do CONECTA
-- =====================================================================

create table public.conecta_categorias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  codigo text check (codigo ~ '^[A-Z_]{2,30}$'),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  icone text not null default 'mensagem' check (icone ~ '^[a-z_]{2,30}$'),
  cor text not null default 'marca' check (cor in ('marca', 'azul', 'ciano', 'verde', 'ambar', 'laranja', 'vermelho', 'rosa', 'violeta', 'cinza')),
  ordem int not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index conecta_categorias_nome on public.conecta_categorias (tenant_id, lower(btrim(nome)));

create table public.conecta_publicacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  autor_id uuid not null references public.perfis(id),
  -- retrato de quem publicou, tirado dos cadastros no momento da publicação
  autor_servidor_id uuid references public.servidores(id),
  autor_unidade_id uuid references public.unidades_organizacionais(id),
  autor_cargo text,
  categoria_id uuid not null references public.conecta_categorias(id),
  titulo text not null check (length(btrim(titulo)) between 3 and 200),
  texto text not null check (length(btrim(texto)) between 1 and 20000),
  para_todos boolean not null default false,
  fixada_em timestamptz, fixada_ate timestamptz, fixada_por uuid,
  oculta_em timestamptz, oculta_por uuid, motivo_ocultacao text,
  excluida_em timestamptz, excluida_por uuid, motivo_exclusao text,
  editada_em timestamptz,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create index conecta_publicacoes_feed on public.conecta_publicacoes (tenant_id, criado_em desc) where excluida_em is null;
create index conecta_publicacoes_autor on public.conecta_publicacoes (autor_id);

create table public.conecta_destinatarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  publicacao_id uuid not null references public.conecta_publicacoes(id),
  tipo text not null check (tipo in ('SECRETARIA', 'DIRETORIA', 'COORDENACAO', 'SETOR', 'UNIDADE_SAUDE', 'PESSOA')),
  unidade_id uuid references public.unidades_organizacionais(id),
  user_id uuid references public.perfis(id),
  check ((tipo = 'PESSOA') = (user_id is not null) and (unidade_id is null) = (user_id is not null))
);
create unique index conecta_destinatarios_unidade on public.conecta_destinatarios (publicacao_id, unidade_id) where unidade_id is not null;
create unique index conecta_destinatarios_pessoa on public.conecta_destinatarios (publicacao_id, user_id) where user_id is not null;
create index conecta_destinatarios_alvo on public.conecta_destinatarios (unidade_id);
create index conecta_destinatarios_usuario on public.conecta_destinatarios (user_id);

-- Versões anteriores do título e do texto (histórico das edições)
create table public.conecta_versoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  publicacao_id uuid not null references public.conecta_publicacoes(id),
  titulo text not null,
  texto text not null,
  categoria_id uuid,
  editado_por uuid,
  editado_em timestamptz not null default now()
);
create index conecta_versoes_pub on public.conecta_versoes (publicacao_id, editado_em);

create table public.conecta_comentarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  publicacao_id uuid not null references public.conecta_publicacoes(id),
  pai_id uuid references public.conecta_comentarios(id),
  autor_id uuid not null references public.perfis(id),
  autor_unidade_id uuid references public.unidades_organizacionais(id),
  texto text not null check (length(btrim(texto)) between 1 and 5000),
  editado_em timestamptz,
  oculto_em timestamptz, oculto_por uuid,
  excluido_em timestamptz, excluido_por uuid, motivo_exclusao text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create index conecta_comentarios_pub on public.conecta_comentarios (publicacao_id, criado_em);

create table public.conecta_curtidas (
  publicacao_id uuid not null references public.conecta_publicacoes(id),
  user_id uuid not null references public.perfis(id),
  tenant_id uuid not null references public.tenants(id),
  criado_em timestamptz not null default now(),
  primary key (publicacao_id, user_id)
);

create table public.conecta_anexos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  publicacao_id uuid not null references public.conecta_publicacoes(id),
  nome_arquivo text not null check (length(btrim(nome_arquivo)) between 1 and 255),
  mime text not null,
  tamanho bigint not null check (tamanho > 0),
  tipo text not null check (tipo in ('IMAGEM', 'DOCUMENTO')),
  ordem int not null default 0,
  storage_path text not null unique,
  enviado_por uuid not null references public.perfis(id),
  enviado_em timestamptz not null default now(),
  excluido_em timestamptz, excluido_por uuid
);
create index conecta_anexos_pub on public.conecta_anexos (publicacao_id) where excluido_em is null;

create table public.conecta_denuncias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  publicacao_id uuid not null references public.conecta_publicacoes(id),
  comentario_id uuid references public.conecta_comentarios(id),
  denunciante_id uuid not null references public.perfis(id),
  motivo text not null check (length(btrim(motivo)) between 5 and 1000),
  situacao text not null default 'ABERTA' check (situacao in ('ABERTA', 'PROCEDENTE', 'IMPROCEDENTE')),
  resolvida_em timestamptz, resolvida_por uuid, resolucao text,
  criado_em timestamptz not null default now()
);
create index conecta_denuncias_abertas on public.conecta_denuncias (tenant_id) where situacao = 'ABERTA';

-- Gatilhos padrão
do $$
declare t text;
begin
  foreach t in array array['conecta_categorias', 'conecta_publicacoes', 'conecta_comentarios'] loop
    execute format('create trigger %1$s_criacao before insert on public.%1$s for each row execute function public.carimbar_criacao()', t);
    execute format('create trigger %1$s_carimbar before update on public.%1$s for each row execute function public.carimbar()', t);
  end loop;
  foreach t in array array['conecta_categorias', 'conecta_publicacoes', 'conecta_destinatarios', 'conecta_versoes', 'conecta_comentarios',
                           'conecta_curtidas', 'conecta_anexos', 'conecta_denuncias'] loop
    execute format('create trigger %1$s_tenant before update on public.%1$s for each row execute function public.bloquear_troca_tenant()', t);
  end loop;
  foreach t in array array['conecta_categorias', 'conecta_publicacoes', 'conecta_destinatarios', 'conecta_comentarios', 'conecta_anexos', 'conecta_denuncias'] loop
    execute format('create trigger %1$s_auditar after insert or update or delete on public.%1$s for each row execute function public.auditar()', t);
  end loop;
end $$;

-- Categorias iniciais de cada órgão (administráveis depois)
create function public.conecta_semear_categorias(p_tenant uuid) returns void
language sql security definer set search_path = public as $$
  insert into conecta_categorias (tenant_id, codigo, nome, icone, cor, ordem)
  select p_tenant, c, n, i, k, o from (values
    ('COMUNICADO', 'Comunicado', 'megafone', 'marca', 10), ('AVISO', 'Aviso', 'alerta', 'ambar', 20),
    ('INFORMACAO', 'Informação', 'info', 'azul', 30), ('EVENTO', 'Evento', 'calendario', 'violeta', 40),
    ('REUNIAO', 'Reunião', 'pessoas', 'ciano', 50), ('CAPACITACAO', 'Capacitação', 'capelo', 'verde', 60),
    ('CONVOCACAO', 'Convocação', 'sino', 'vermelho', 70), ('CAMPANHA', 'Campanha', 'coracao', 'rosa', 80),
    ('NOTICIA', 'Notícia institucional', 'jornal', 'azul', 90), ('OBRAS', 'Obras e serviços', 'capacete', 'laranja', 100),
    ('MANUTENCAO', 'Manutenção', 'chave', 'cinza', 110), ('OUTROS', 'Outros', 'mensagem', 'cinza', 120)
  ) v(c, n, i, k, o)
  where not exists (select 1 from conecta_categorias x where x.tenant_id = p_tenant)
$$;
select public.conecta_semear_categorias(id) from public.tenants;

create function public.conecta_categorias_novo_orgao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform conecta_semear_categorias(new.id);
  return null;
end $$;
create trigger tenants_conecta_categorias after insert on public.tenants
  for each row execute function public.conecta_categorias_novo_orgao();

-- =====================================================================
-- Quem é quem: lotação, alcance e visibilidade
-- =====================================================================

-- Unidades onde a pessoa está: lotação no cadastro de servidores (ativo) e unidades dos vínculos ativos
create function public.conecta_lotacoes(p_tenant uuid, p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.unidade_id from servidores s
   where s.tenant_id = p_tenant and s.user_id = p_user and (s.data_exoneracao is null or s.data_exoneracao > hoje())
  union
  select v.unidade_id from vinculos v
   where v.tenant_id = p_tenant and v.user_id = p_user and v.ativo and v.unidade_id is not null
$$;

-- Unidades que "alcançam" a pessoa: as da lotação e todas as superiores (publicação para uma Diretoria
-- chega a quem está nela ou em qualquer unidade abaixo dela)
create function public.conecta_alcance(p_tenant uuid, p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct a from unidades_organizacionais u, unnest(u.caminho) a
   where u.id in (select conecta_lotacoes(p_tenant, p_user))
$$;

create function public.conecta_moderador(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pode(p_tenant, null, 'conecta', 'aprovar')
$$;

-- A publicação chega a p_user como destinatário? (sem considerar autor nem moderação)
create function public.conecta_destinada_a(p_pub uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conecta_publicacoes p
     where p.id = p_pub and p.excluida_em is null and membro_ativo(p.tenant_id, p_user)
       and (p.para_todos or exists (
             select 1 from conecta_destinatarios d
              where d.publicacao_id = p.id
                and (d.user_id = p_user or d.unidade_id in (select conecta_alcance(p.tenant_id, p_user))))))
$$;

-- Quem chama pode ver a publicação? (autor, moderador ou destinatário de publicação não oculta)
create function public.conecta_pode_ver(p_pub uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conecta_publicacoes p
     where p.id = p_pub and p.excluida_em is null
       and ((p.autor_id = auth.uid() and membro_ativo(p.tenant_id, auth.uid()))
            or conecta_moderador(p.tenant_id)
            or (p.oculta_em is null and conecta_destinada_a(p.id, auth.uid()))))
$$;

-- Publicações visíveis para quem chama no órgão (base do mural e do painel lateral)
create function public.conecta_visiveis(p_tenant uuid) returns setof public.conecta_publicacoes
language sql stable security definer set search_path = public as $$
  select p.* from conecta_publicacoes p
   where p.tenant_id = p_tenant and p.excluida_em is null
     and ((p.autor_id = auth.uid() and membro_ativo(p_tenant, auth.uid()))
          or conecta_moderador(p_tenant)
          or (p.oculta_em is null and membro_ativo(p_tenant, auth.uid())
              and (p.para_todos or exists (
                     select 1 from conecta_destinatarios d
                      where d.publicacao_id = p.id
                        and (d.user_id = auth.uid() or d.unidade_id in (select conecta_alcance(p_tenant, auth.uid())))))))
$$;

-- Pessoas que recebem a publicação (para as notificações)
create function public.conecta_publico_alvo(p_pub uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with p as (select * from conecta_publicacoes where id = p_pub),
  alvo as (
    select d.user_id u from conecta_destinatarios d where d.publicacao_id = p_pub and d.user_id is not null
    union
    select s.user_id from conecta_destinatarios d
      join unidades_organizacionais un on d.unidade_id = any(un.caminho)
      join servidores s on s.unidade_id = un.id and s.user_id is not null and (s.data_exoneracao is null or s.data_exoneracao > hoje())
     where d.publicacao_id = p_pub
    union
    select v.user_id from conecta_destinatarios d
      join unidades_organizacionais un on d.unidade_id = any(un.caminho)
      join vinculos v on v.unidade_id = un.id and v.ativo
     where d.publicacao_id = p_pub)
  select a.u from alvo a, p where membro_ativo(p.tenant_id, a.u)
$$;

-- Unidade com Secretaria, Diretoria e Coordenação acima dela (para identificar autores e destinos)
create function public.conecta_hierarquia(p_unidade uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when u.id is null then null else jsonb_build_object(
    'id', u.id, 'nome', u.nome, 'sigla', u.sigla, 'tipo', u.tipo,
    'secretaria', (select coalesce(a.sigla, a.nome) from unidades_organizacionais a where a.id = any(u.caminho) and a.tipo = 'SECRETARIA' limit 1),
    'diretoria', (select coalesce(a.sigla, a.nome) from unidades_organizacionais a where a.id = any(u.caminho) and a.tipo = 'DIRETORIA' limit 1),
    'coordenacao', (select coalesce(a.sigla, a.nome) from unidades_organizacionais a where a.id = any(u.caminho) and a.tipo = 'COORDENACAO' limit 1)) end
  from (select 1) x left join unidades_organizacionais u on u.id = p_unidade
$$;

-- Lotação principal e cargo da pessoa no órgão (cadastro de servidor; sem ele, o vínculo padrão)
create function public.conecta_quem(p_tenant uuid, p_user uuid) returns table (servidor_id uuid, unidade_id uuid, cargo text)
language sql stable security definer set search_path = public as $$
  select x.servidor_id, x.unidade_id, x.cargo from (
    select s.id servidor_id, s.unidade_id, nullif(concat_ws(' · ', nullif(btrim(s.cargo), ''), nullif(btrim(s.funcao), '')), '') cargo, 1 ordem, s.nome
      from servidores s
     where s.tenant_id = p_tenant and s.user_id = p_user and (s.data_exoneracao is null or s.data_exoneracao > hoje())
    union all
    select null, v.unidade_id, null, case when v.padrao then 2 else 3 end, ''
      from vinculos v where v.tenant_id = p_tenant and v.user_id = p_user and v.ativo and v.unidade_id is not null
  ) x order by x.ordem, x.nome limit 1
$$;

-- =====================================================================
-- RLS (leitura); a escrita é pelas funções
-- =====================================================================

alter table public.conecta_categorias enable row level security;
alter table public.conecta_publicacoes enable row level security;
alter table public.conecta_destinatarios enable row level security;
alter table public.conecta_versoes enable row level security;
alter table public.conecta_comentarios enable row level security;
alter table public.conecta_curtidas enable row level security;
alter table public.conecta_anexos enable row level security;
alter table public.conecta_denuncias enable row level security;

create policy conecta_categorias_ler on public.conecta_categorias for select to authenticated
  using (membro_do_tenant(tenant_id) or pode(tenant_id, null, 'conecta', 'ler'));
create policy conecta_categorias_criar on public.conecta_categorias for insert to authenticated
  with check (pode(tenant_id, null, 'conecta', 'editar'));
create policy conecta_categorias_editar on public.conecta_categorias for update to authenticated
  using (pode(tenant_id, null, 'conecta', 'editar')) with check (pode(tenant_id, null, 'conecta', 'editar'));
create policy conecta_publicacoes_ler on public.conecta_publicacoes for select to authenticated using (conecta_pode_ver(id));
create policy conecta_destinatarios_ler on public.conecta_destinatarios for select to authenticated using (conecta_pode_ver(publicacao_id));
create policy conecta_versoes_ler on public.conecta_versoes for select to authenticated using (conecta_pode_ver(publicacao_id));
create policy conecta_comentarios_ler on public.conecta_comentarios for select to authenticated using (conecta_pode_ver(publicacao_id));
create policy conecta_curtidas_ler on public.conecta_curtidas for select to authenticated using (conecta_pode_ver(publicacao_id));
create policy conecta_anexos_ler on public.conecta_anexos for select to authenticated using (excluido_em is null and conecta_pode_ver(publicacao_id));
create policy conecta_denuncias_ler on public.conecta_denuncias for select to authenticated
  using (denunciante_id = (select auth.uid()) or conecta_moderador(tenant_id));

revoke all on public.conecta_categorias, public.conecta_publicacoes, public.conecta_destinatarios, public.conecta_versoes,
  public.conecta_comentarios, public.conecta_curtidas, public.conecta_anexos, public.conecta_denuncias from anon;
revoke insert, update, delete on public.conecta_publicacoes, public.conecta_destinatarios, public.conecta_versoes,
  public.conecta_comentarios, public.conecta_curtidas, public.conecta_anexos, public.conecta_denuncias from authenticated;
revoke delete on public.conecta_categorias from authenticated;
create trigger conecta_categorias_justificativa before update of ativo on public.conecta_categorias
  for each row execute function public.exige_justificativa_inativacao();

-- =====================================================================
-- Publicações
-- =====================================================================

create function public.conecta_exige_membro(p_tenant uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not membro_ativo(p_tenant, auth.uid()) then
    raise exception 'Você precisa de um acesso ativo neste órgão para participar do CONECTA.' using errcode = 'insufficient_privilege';
  end if;
end $$;

create function public.conecta_publicar(p_tenant uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_cat conecta_categorias; v_quem record; v_todos boolean := coalesce((p ->> 'para_todos')::boolean, false);
  v_unidade uuid; v_tipo text; v_unid record; v_pessoa uuid; v_n int := 0; v_alvo uuid[];
begin
  perform conecta_exige_membro(p_tenant);
  if length(btrim(coalesce(p ->> 'titulo', ''))) < 3 then
    raise exception 'Informe o título (mínimo de 3 caracteres).' using errcode = 'check_violation', hint = 'titulo';
  end if;
  if length(btrim(coalesce(p ->> 'texto', ''))) = 0 then
    raise exception 'Escreva o texto da publicação.' using errcode = 'check_violation', hint = 'texto';
  end if;
  select * into v_cat from conecta_categorias where id = nullif(p ->> 'categoria_id', '')::uuid and tenant_id = p_tenant and ativo;
  if v_cat.id is null then raise exception 'Escolha a categoria.' using errcode = 'check_violation', hint = 'categoria_id'; end if;
  if not v_todos and jsonb_array_length(coalesce(p -> 'unidades', '[]')) = 0 and jsonb_array_length(coalesce(p -> 'pessoas', '[]')) = 0 then
    raise exception 'Escolha os destinatários: todos, uma ou mais unidades ou pessoas.' using errcode = 'check_violation', hint = 'destinatarios';
  end if;

  select * into v_quem from conecta_quem(p_tenant, auth.uid());
  insert into conecta_publicacoes (tenant_id, autor_id, autor_servidor_id, autor_unidade_id, autor_cargo, categoria_id, titulo, texto, para_todos)
  values (p_tenant, auth.uid(), v_quem.servidor_id, v_quem.unidade_id, v_quem.cargo, v_cat.id, btrim(p ->> 'titulo'), btrim(p ->> 'texto'), v_todos)
  returning id into v_id;

  if not v_todos then
    for v_unidade in select distinct (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'unidades', '[]')) x loop
      select * into v_unid from unidades_organizacionais where id = v_unidade and tenant_id = p_tenant and ativo;
      if v_unid.id is null then raise exception 'Unidade de destino não encontrada neste órgão.' using errcode = 'check_violation', hint = 'destinatarios'; end if;
      v_tipo := case v_unid.tipo when 'SECRETARIA' then 'SECRETARIA' when 'DIRETORIA' then 'DIRETORIA' when 'COORDENACAO' then 'COORDENACAO'
                                 when 'UNIDADE' then 'UNIDADE_SAUDE' when 'ORGANIZACAO' then null else 'SETOR' end;
      if v_tipo is null then raise exception 'Para o órgão inteiro, use a opção "Todos".' using errcode = 'check_violation', hint = 'destinatarios'; end if;
      insert into conecta_destinatarios (tenant_id, publicacao_id, tipo, unidade_id) values (p_tenant, v_id, v_tipo, v_unidade);
    end loop;
    for v_pessoa in select distinct (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'pessoas', '[]')) x loop
      if not membro_ativo(p_tenant, v_pessoa) then
        raise exception 'Uma das pessoas escolhidas não tem acesso ativo neste órgão.' using errcode = 'check_violation', hint = 'destinatarios';
      end if;
      insert into conecta_destinatarios (tenant_id, publicacao_id, tipo, user_id) values (p_tenant, v_id, 'PESSOA', v_pessoa);
    end loop;
    -- quem recebe é avisado (o servidor que está em mais de um grupo recebe um aviso só)
    v_alvo := array(select conecta_publico_alvo(v_id));
    perform notificar(p_tenant, v_alvo, 'CONECTA', 'PUBLICACAO', v_cat.nome || ': ' || btrim(p ->> 'titulo'),
      'Publicado por ' || coalesce((select nome from perfis where id = auth.uid()), 'um colega') || ' e direcionado a você ou ao seu setor.',
      '/conecta?p=' || v_id, v_id);
  end if;
  return v_id;
end $$;

create function public.conecta_editar_publicacao(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes; v_cat uuid;
begin
  select * into v from conecta_publicacoes where id = p_id and excluida_em is null for update;
  if v.id is null or v.autor_id <> auth.uid() then
    raise exception 'Só o autor edita a publicação.' using errcode = 'insufficient_privilege';
  end if;
  perform conecta_exige_membro(v.tenant_id);
  if length(btrim(coalesce(p ->> 'titulo', ''))) < 3 then
    raise exception 'Informe o título (mínimo de 3 caracteres).' using errcode = 'check_violation', hint = 'titulo';
  end if;
  if length(btrim(coalesce(p ->> 'texto', ''))) = 0 then
    raise exception 'Escreva o texto da publicação.' using errcode = 'check_violation', hint = 'texto';
  end if;
  select id into v_cat from conecta_categorias where id = coalesce(nullif(p ->> 'categoria_id', '')::uuid, v.categoria_id) and tenant_id = v.tenant_id;
  if v_cat is null then raise exception 'Escolha a categoria.' using errcode = 'check_violation', hint = 'categoria_id'; end if;
  if v.titulo = btrim(p ->> 'titulo') and v.texto = btrim(p ->> 'texto') and v.categoria_id = v_cat then return; end if;
  insert into conecta_versoes (tenant_id, publicacao_id, titulo, texto, categoria_id, editado_por)
  values (v.tenant_id, v.id, v.titulo, v.texto, v.categoria_id, auth.uid());
  update conecta_publicacoes set titulo = btrim(p ->> 'titulo'), texto = btrim(p ->> 'texto'), categoria_id = v_cat, editada_em = now()
   where id = p_id;
end $$;

-- Exclusão lógica: o autor exclui a sua; o moderador, qualquer uma (com motivo)
create function public.conecta_excluir_publicacao(p_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes; v_mod boolean;
begin
  select * into v from conecta_publicacoes where id = p_id and excluida_em is null;
  if v.id is null then raise exception 'Publicação não encontrada.' using errcode = 'no_data_found'; end if;
  v_mod := conecta_moderador(v.tenant_id);
  if v.autor_id <> auth.uid() and not v_mod then
    raise exception 'Você só pode excluir as suas publicações.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_motivo, case when v.autor_id = auth.uid() then 0 else 5 end);
  update conecta_publicacoes set excluida_em = now(), excluida_por = auth.uid(), motivo_exclusao = nullif(btrim(p_motivo), '') where id = p_id;
  if v.autor_id <> auth.uid() then
    perform notificar(v.tenant_id, array[v.autor_id], 'CONECTA', 'MODERACAO', 'Sua publicação foi excluída pela moderação: ' || v.titulo,
      'Motivo: ' || btrim(p_motivo), '/conecta', v.id);
  end if;
end $$;

-- Moderação: ocultar (só autor e moderadores continuam vendo) ou restaurar
create function public.conecta_moderar_publicacao(p_id uuid, p_ocultar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes;
begin
  select * into v from conecta_publicacoes where id = p_id and excluida_em is null;
  if v.id is null or not conecta_moderador(v.tenant_id) then
    raise exception 'Publicação não encontrada ou sem permissão de moderação.' using errcode = 'insufficient_privilege';
  end if;
  if p_ocultar then
    perform usar_justificativa(p_motivo, 5);
    update conecta_publicacoes set oculta_em = now(), oculta_por = auth.uid(), motivo_ocultacao = btrim(p_motivo) where id = p_id;
    perform notificar(v.tenant_id, array[v.autor_id], 'CONECTA', 'MODERACAO', 'Sua publicação foi ocultada pela moderação: ' || v.titulo,
      'Motivo: ' || btrim(p_motivo), '/conecta?p=' || v.id, v.id);
  else
    perform usar_justificativa(p_motivo, 0);
    update conecta_publicacoes set oculta_em = null, oculta_por = null, motivo_ocultacao = null where id = p_id;
  end if;
end $$;

-- Destaque: fixa no topo do mural (até a data, ou sem prazo) ou retira o destaque
create function public.conecta_fixar(p_id uuid, p_fixar boolean, p_ate timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes;
begin
  select * into v from conecta_publicacoes where id = p_id and excluida_em is null;
  if v.id is null or not conecta_moderador(v.tenant_id) then
    raise exception 'Publicação não encontrada ou sem permissão para destacar.' using errcode = 'insufficient_privilege';
  end if;
  if p_fixar and p_ate is not null and p_ate <= now() then
    raise exception 'O prazo do destaque precisa ser uma data futura.' using errcode = 'check_violation', hint = 'fixada_ate';
  end if;
  update conecta_publicacoes
     set fixada_em = case when p_fixar then now() end, fixada_ate = case when p_fixar then p_ate end,
         fixada_por = case when p_fixar then auth.uid() end
   where id = p_id;
end $$;

-- =====================================================================
-- Comentários, curtidas e denúncias
-- =====================================================================

create function public.conecta_comentar(p_pub uuid, p_texto text, p_pai uuid default null, p_mencoes uuid[] default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes; v_pai conecta_comentarios; v_id uuid; v_quem record; v_nome text; v_mencionados uuid[];
begin
  select * into v from conecta_publicacoes where id = p_pub;
  if v.id is null or not conecta_pode_ver(p_pub) then raise exception 'Publicação não encontrada.' using errcode = 'no_data_found'; end if;
  perform conecta_exige_membro(v.tenant_id);
  if v.oculta_em is not null then raise exception 'Publicação ocultada pela moderação não recebe comentários.' using errcode = 'check_violation'; end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then raise exception 'Escreva o comentário.' using errcode = 'check_violation', hint = 'texto'; end if;
  if p_pai is not null then
    select * into v_pai from conecta_comentarios where id = p_pai and publicacao_id = p_pub and excluido_em is null;
    if v_pai.id is null then raise exception 'Comentário respondido não encontrado.' using errcode = 'no_data_found'; end if;
    -- respostas ficam num nível só, ligadas ao comentário principal
    if v_pai.pai_id is not null then select * into v_pai from conecta_comentarios where id = v_pai.pai_id; end if;
  end if;
  select * into v_quem from conecta_quem(v.tenant_id, auth.uid());
  insert into conecta_comentarios (tenant_id, publicacao_id, pai_id, autor_id, autor_unidade_id, texto)
  values (v.tenant_id, p_pub, v_pai.id, auth.uid(), v_quem.unidade_id, btrim(p_texto)) returning id into v_id;

  v_nome := coalesce((select nome from perfis where id = auth.uid()), 'Um colega');
  perform notificar(v.tenant_id, array[v.autor_id], 'CONECTA', 'COMENTARIO', v_nome || ' comentou: ' || v.titulo,
    left(btrim(p_texto), 160), '/conecta?p=' || p_pub, p_pub);
  if p_pai is not null then
    perform notificar(v.tenant_id, array(select distinct x from unnest(array[(select autor_id from conecta_comentarios where id = p_pai), v_pai.autor_id]) x
                                         where x is distinct from v.autor_id),
      'CONECTA', 'RESPOSTA', v_nome || ' respondeu ao seu comentário em: ' || v.titulo, left(btrim(p_texto), 160), '/conecta?p=' || p_pub, p_pub);
  end if;
  -- menções: só avisa quem também pode ver a publicação
  v_mencionados := array(select distinct m from unnest(coalesce(p_mencoes, '{}')) m
                          where (m = v.autor_id or conecta_destinada_a(p_pub, m)) and m is distinct from v.autor_id);
  perform notificar(v.tenant_id, v_mencionados, 'CONECTA', 'MENCAO', v_nome || ' mencionou você em: ' || v.titulo,
    left(btrim(p_texto), 160), '/conecta?p=' || p_pub, p_pub);
  return v_id;
end $$;

create function public.conecta_editar_comentario(p_id uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare c conecta_comentarios;
begin
  select * into c from conecta_comentarios where id = p_id and excluido_em is null;
  if c.id is null or c.autor_id <> auth.uid() then raise exception 'Só o autor edita o comentário.' using errcode = 'insufficient_privilege'; end if;
  if not conecta_pode_ver(c.publicacao_id) then raise exception 'Publicação não encontrada.' using errcode = 'no_data_found'; end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then raise exception 'Escreva o comentário.' using errcode = 'check_violation', hint = 'texto'; end if;
  update conecta_comentarios set texto = btrim(p_texto), editado_em = now() where id = p_id;
end $$;

create function public.conecta_excluir_comentario(p_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c conecta_comentarios;
begin
  select * into c from conecta_comentarios where id = p_id and excluido_em is null;
  if c.id is null then raise exception 'Comentário não encontrado.' using errcode = 'no_data_found'; end if;
  if c.autor_id <> auth.uid() and not conecta_moderador(c.tenant_id) then
    raise exception 'Você só pode excluir os seus comentários.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_motivo, case when c.autor_id = auth.uid() then 0 else 5 end);
  update conecta_comentarios set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = nullif(btrim(p_motivo), '') where id = p_id;
end $$;

create function public.conecta_curtir(p_pub uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes;
begin
  select * into v from conecta_publicacoes where id = p_pub;
  if v.id is null or not conecta_pode_ver(p_pub) then raise exception 'Publicação não encontrada.' using errcode = 'no_data_found'; end if;
  perform conecta_exige_membro(v.tenant_id);
  delete from conecta_curtidas where publicacao_id = p_pub and user_id = auth.uid();
  if found then return false; end if;
  insert into conecta_curtidas (publicacao_id, user_id, tenant_id) values (p_pub, auth.uid(), v.tenant_id);
  return true;
end $$;

create function public.conecta_denunciar(p_pub uuid, p_motivo text, p_comentario uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes; v_id uuid;
begin
  select * into v from conecta_publicacoes where id = p_pub;
  if v.id is null or not conecta_pode_ver(p_pub) then raise exception 'Publicação não encontrada.' using errcode = 'no_data_found'; end if;
  perform conecta_exige_membro(v.tenant_id);
  if p_comentario is not null and not exists (select 1 from conecta_comentarios where id = p_comentario and publicacao_id = p_pub) then
    raise exception 'Comentário não encontrado.' using errcode = 'no_data_found';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explique o motivo da denúncia (mínimo de 5 caracteres).' using errcode = 'check_violation', hint = 'motivo';
  end if;
  if exists (select 1 from conecta_denuncias where publicacao_id = p_pub and comentario_id is not distinct from p_comentario
              and denunciante_id = auth.uid() and situacao = 'ABERTA') then
    raise exception 'Você já denunciou este conteúdo; a moderação vai analisar.' using errcode = 'check_violation';
  end if;
  insert into conecta_denuncias (tenant_id, publicacao_id, comentario_id, denunciante_id, motivo)
  values (v.tenant_id, p_pub, p_comentario, auth.uid(), btrim(p_motivo)) returning id into v_id;
  return v_id;
end $$;

create function public.conecta_resolver_denuncia(p_id uuid, p_procedente boolean, p_resolucao text) returns void
language plpgsql security definer set search_path = public as $$
declare d conecta_denuncias;
begin
  select * into d from conecta_denuncias where id = p_id and situacao = 'ABERTA';
  if d.id is null or not conecta_moderador(d.tenant_id) then
    raise exception 'Denúncia não encontrada ou sem permissão de moderação.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_resolucao, 5);
  update conecta_denuncias set situacao = case when p_procedente then 'PROCEDENTE' else 'IMPROCEDENTE' end,
         resolvida_em = now(), resolvida_por = auth.uid(), resolucao = btrim(p_resolucao) where id = p_id;
  if p_procedente then
    if d.comentario_id is not null then
      update conecta_comentarios set oculto_em = now(), oculto_por = auth.uid() where id = d.comentario_id and oculto_em is null;
    else
      update conecta_publicacoes set oculta_em = now(), oculta_por = auth.uid(), motivo_ocultacao = btrim(p_resolucao)
       where id = d.publicacao_id and oculta_em is null;
    end if;
  end if;
  perform notificar(d.tenant_id, array[d.denunciante_id], 'CONECTA', 'DENUNCIA',
    'Sua denúncia foi analisada: ' || case when p_procedente then 'procedente' else 'improcedente' end,
    btrim(p_resolucao), '/conecta?p=' || d.publicacao_id, d.publicacao_id);
end $$;

-- =====================================================================
-- Anexos (fotos e documentos); arquivo em <tenant>/conecta/<anexo_id>
-- =====================================================================

-- Tipos aceitos: imagens e PDF sempre; documentos de escritório só se a administração autorizar
-- (tenant_configuracoes.textos -> 'conecta_tipos_extras').
create function public.conecta_tipos_aceitos(p_tenant uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      || coalesce(array(select x from jsonb_array_elements_text(tc.textos -> 'conecta_tipos_extras') x
                         where x in ('application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                                     'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet')), '{}')
    from tenants t left join tenant_configuracoes tc on tc.tenant_id = t.id where t.id = p_tenant
$$;

create function public.conecta_registrar_anexo(p_pub uuid, p_nome text, p_mime text, p_tamanho bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v conecta_publicacoes; v_id uuid := gen_random_uuid(); v_max int; v_path text;
begin
  select * into v from conecta_publicacoes where id = p_pub and excluida_em is null;
  if v.id is null or v.autor_id <> auth.uid() then raise exception 'Só o autor anexa arquivos à publicação.' using errcode = 'insufficient_privilege'; end if;
  perform conecta_exige_membro(v.tenant_id);
  if not p_mime = any(conecta_tipos_aceitos(v.tenant_id)) then
    raise exception 'Tipo de arquivo não autorizado. Envie JPG, PNG, WEBP ou PDF (outros documentos só se a administração liberar).'
      using errcode = 'check_violation', hint = 'arquivo';
  end if;
  select anexo_tamanho_max_mb into v_max from tenant_configuracoes where tenant_id = v.tenant_id;
  if p_tamanho is null or p_tamanho <= 0 or p_tamanho > coalesce(v_max, 10) * 1024 * 1024 then
    raise exception 'O arquivo passa do limite de % MB deste órgão.', coalesce(v_max, 10) using errcode = 'check_violation', hint = 'arquivo';
  end if;
  if (select count(*) from conecta_anexos where publicacao_id = p_pub and excluido_em is null) >= 20 then
    raise exception 'Cada publicação aceita até 20 arquivos.' using errcode = 'check_violation', hint = 'arquivo';
  end if;
  v_path := v.tenant_id || '/conecta/' || v_id;
  insert into conecta_anexos (id, tenant_id, publicacao_id, nome_arquivo, mime, tamanho, tipo, ordem, storage_path, enviado_por)
  values (v_id, v.tenant_id, p_pub, left(btrim(p_nome), 255), p_mime, p_tamanho,
          case when p_mime like 'image/%' then 'IMAGEM' else 'DOCUMENTO' end,
          (select coalesce(max(ordem), 0) + 1 from conecta_anexos where publicacao_id = p_pub), v_path, auth.uid());
  return jsonb_build_object('id', v_id, 'storage_path', v_path);
end $$;

create function public.conecta_remover_anexo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a conecta_anexos;
begin
  select * into a from conecta_anexos where id = p_id and excluido_em is null;
  if a.id is null or (a.enviado_por <> auth.uid() and not conecta_moderador(a.tenant_id)) then
    raise exception 'Anexo não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  update conecta_anexos set excluido_em = now(), excluido_por = auth.uid() where id = p_id;
end $$;

-- Storage: arquivos do CONECTA seguem a visibilidade da publicação; foto de perfil passa a ser vista
-- pelos colegas de órgão (para identificar quem publicou e comentou)
create or replace function public.arquivo_pode(p_bucket text, p_nome text, p_acao text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_partes text[] := string_to_array(p_nome, '/');
  v_tenant uuid;
begin
  if p_bucket = 'avatares' then
    if coalesce(array_length(v_partes, 1), 0) <> 2 or v_partes[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
    if p_acao = 'ler' then
      return perfil_visivel(v_partes[1]::uuid) or exists (
        select 1 from vinculos a join vinculos b on b.tenant_id = a.tenant_id and b.ativo
         where a.user_id = auth.uid() and a.ativo and b.user_id = v_partes[1]::uuid);
    end if;
    return v_partes[1] = auth.uid()::text;
  end if;
  if p_bucket <> 'arquivos' or coalesce(array_length(v_partes, 1), 0) <> 3
     or v_partes[1] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  v_tenant := v_partes[1]::uuid;
  if v_partes[2] = 'identidade' then
    if p_acao = 'ler' then return eh_admin_plataforma() or membro_do_tenant(v_tenant); end if;
    return pode(v_tenant, null, 'configuracoes', 'editar');
  end if;
  if v_partes[2] = 'conecta' then
    if p_acao = 'ler' then
      return exists (select 1 from conecta_anexos a where a.storage_path = p_nome and a.excluido_em is null and conecta_pode_ver(a.publicacao_id));
    end if;
    if p_acao = 'enviar' then
      return exists (select 1 from conecta_anexos a where a.storage_path = p_nome and a.excluido_em is null and a.enviado_por = auth.uid());
    end if;
    return false;
  end if;
  if p_acao = 'ler' then
    return exists (select 1 from documentos d where d.storage_path = p_nome and d.excluido_em is null
                    and documento_legivel(d.tenant_id, d.unidade_id, d.recurso, d.registro_id));
  end if;
  if p_acao = 'enviar' then
    return exists (select 1 from documentos d where d.storage_path = p_nome and d.excluido_em is null
                    and d.enviado_por = auth.uid());
  end if;
  return false;
end $$;

-- documentos de escritório (só os autorizados pela administração chegam aqui)
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet']
 where id = 'arquivos';

-- =====================================================================
-- Consultas do mural
-- =====================================================================

-- Mural: publicações visíveis, destacadas primeiro, com autor, destinos, contagens e anexos.
-- p: filtro (TODAS, MINHAS, PARA_MIM, MINHA_DIRETORIA, MINHA_COORDENACAO), categoria_id, busca, autor,
--    unidade_id (diretoria/coordenação: autor ou destino nela ou abaixo), de, ate (datas), id, limite, offset
create function public.conecta_feed(p_tenant uuid, p jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_mod boolean := conecta_moderador(p_tenant);
  v_alc uuid[];
  v_dir uuid; v_coord uuid;
  v_filtro text := coalesce(nullif(p ->> 'filtro', ''), 'TODAS');
  v_like text; v_autor text; v_un uuid := nullif(p ->> 'unidade_id', '')::uuid;
  v_lim int := least(greatest(coalesce((p ->> 'limite')::int, 15), 1), 50);
  v_off int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_res jsonb;
begin
  if not (membro_ativo(p_tenant, v_uid) or v_mod) then
    raise exception 'Você não tem acesso ao CONECTA deste órgão.' using errcode = 'insufficient_privilege';
  end if;
  v_alc := array(select conecta_alcance(p_tenant, v_uid));
  select id into v_dir from unidades_organizacionais where id = any(v_alc) and tipo = 'DIRETORIA' order by array_length(caminho, 1) limit 1;
  select id into v_coord from unidades_organizacionais where id = any(v_alc) and tipo = 'COORDENACAO' order by array_length(caminho, 1) limit 1;
  if nullif(btrim(p ->> 'busca'), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p ->> 'busca')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  if nullif(btrim(p ->> 'autor'), '') is not null then
    v_autor := '%' || replace(replace(replace(lower(btrim(p ->> 'autor')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with vis as (select * from conecta_visiveis(p_tenant)),
  base as (
    select v.*, pf.nome autor_nome, pf.avatar_path autor_avatar, c.nome categoria_nome, c.codigo categoria_codigo, c.icone categoria_icone, c.cor categoria_cor,
           (v.fixada_em is not null and (v.fixada_ate is null or v.fixada_ate > now())) fixada_ativa,
           (exists (select 1 from conecta_destinatarios d where d.publicacao_id = v.id and (d.user_id = v_uid or d.unidade_id = any(v_alc)))) para_mim
      from vis v
      join perfis pf on pf.id = v.autor_id
      join conecta_categorias c on c.id = v.categoria_id
     where (nullif(p ->> 'id', '') is null or v.id = (p ->> 'id')::uuid)
       and (nullif(p ->> 'categoria_id', '') is null or v.categoria_id = (p ->> 'categoria_id')::uuid)
       and (v_like is null or lower(v.titulo || ' ' || v.texto || ' ' || pf.nome || ' ' || c.nome) like v_like)
       and (v_autor is null or lower(pf.nome) like v_autor)
       and (nullif(p ->> 'de', '') is null or (v.criado_em at time zone 'America/Sao_Paulo')::date >= (p ->> 'de')::date)
       and (nullif(p ->> 'ate', '') is null or (v.criado_em at time zone 'America/Sao_Paulo')::date <= (p ->> 'ate')::date)
       and (v_un is null
            or exists (select 1 from unidades_organizacionais u where u.id = v.autor_unidade_id and v_un = any(u.caminho))
            or exists (select 1 from conecta_destinatarios d join unidades_organizacionais u on u.id = d.unidade_id
                        where d.publicacao_id = v.id and v_un = any(u.caminho)))
  ),
  filtrada as (
    select * from base b
     where case v_filtro
             when 'MINHAS' then b.autor_id = v_uid
             when 'PARA_MIM' then not b.para_todos and b.para_mim
             when 'MINHA_DIRETORIA' then v_dir is not null and (
                  exists (select 1 from unidades_organizacionais u where u.id = b.autor_unidade_id and v_dir = any(u.caminho))
                  or exists (select 1 from conecta_destinatarios d join unidades_organizacionais u on u.id = d.unidade_id
                              where d.publicacao_id = b.id and v_dir = any(u.caminho)))
             when 'MINHA_COORDENACAO' then v_coord is not null and (
                  exists (select 1 from unidades_organizacionais u where u.id = b.autor_unidade_id and v_coord = any(u.caminho))
                  or exists (select 1 from conecta_destinatarios d join unidades_organizacionais u on u.id = d.unidade_id
                              where d.publicacao_id = b.id and v_coord = any(u.caminho)))
             else true end
  ),
  pagina as (select * from filtrada order by fixada_ativa desc, criado_em desc limit v_lim offset v_off)
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'pode_moderar', v_mod,
    'minha_diretoria', v_dir is not null, 'minha_coordenacao', v_coord is not null,
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'titulo', x.titulo, 'texto', x.texto, 'criado_em', x.criado_em, 'editada_em', x.editada_em,
        'para_todos', x.para_todos, 'fixada', x.fixada_ativa, 'fixada_ate', case when x.fixada_ativa then x.fixada_ate end,
        'oculta', x.oculta_em is not null, 'motivo_ocultacao', x.motivo_ocultacao,
        'sou_autor', x.autor_id = v_uid,
        'autor', jsonb_build_object('id', x.autor_id, 'nome', x.autor_nome, 'avatar_path', x.autor_avatar, 'cargo', x.autor_cargo,
                                    'lotacao', conecta_hierarquia(x.autor_unidade_id)),
        'categoria', jsonb_build_object('id', x.categoria_id, 'nome', x.categoria_nome, 'codigo', x.categoria_codigo, 'icone', x.categoria_icone, 'cor', x.categoria_cor),
        'destinatarios', coalesce((select jsonb_agg(jsonb_build_object('tipo', d.tipo,
              'rotulo', case when d.user_id is not null then (select nome from perfis where id = d.user_id)
                             else (select coalesce(u.sigla || ' – ', '') || u.nome from unidades_organizacionais u where u.id = d.unidade_id) end)
              order by d.tipo, d.id)
            from conecta_destinatarios d where d.publicacao_id = x.id), '[]'),
        'curtidas', (select count(*) from conecta_curtidas k where k.publicacao_id = x.id),
        'eu_curti', exists (select 1 from conecta_curtidas k where k.publicacao_id = x.id and k.user_id = v_uid),
        'comentarios', (select count(*) from conecta_comentarios m where m.publicacao_id = x.id and m.excluido_em is null and m.oculto_em is null),
        'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome_arquivo', a.nome_arquivo, 'mime', a.mime, 'tamanho', a.tamanho,
                                                                  'tipo', a.tipo, 'storage_path', a.storage_path) order by a.ordem)
                             from conecta_anexos a where a.publicacao_id = x.id and a.excluido_em is null), '[]'))
        order by x.fixada_ativa desc, x.criado_em desc) from pagina x), '[]'))
  into v_res;
  return v_res;
end $$;

create function public.conecta_comentarios_de(p_pub uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_mod boolean;
begin
  if not conecta_pode_ver(p_pub) then raise exception 'Publicação não encontrada.' using errcode = 'no_data_found'; end if;
  v_mod := conecta_moderador((select tenant_id from conecta_publicacoes where id = p_pub));
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'pai_id', c.pai_id, 'criado_em', c.criado_em, 'editado_em', c.editado_em,
      'removido', c.excluido_em is not null or (c.oculto_em is not null and not v_mod and c.autor_id <> auth.uid()),
      'oculto', c.oculto_em is not null,
      'texto', case when c.excluido_em is not null or (c.oculto_em is not null and not v_mod and c.autor_id <> auth.uid()) then null else c.texto end,
      'sou_autor', c.autor_id = auth.uid(),
      'autor', jsonb_build_object('id', c.autor_id, 'nome', pf.nome, 'avatar_path', pf.avatar_path, 'lotacao', conecta_hierarquia(c.autor_unidade_id)))
      order by c.criado_em)
    from conecta_comentarios c join perfis pf on pf.id = c.autor_id where c.publicacao_id = p_pub), '[]');
end $$;

-- Painel lateral: destaques, recentes e categorias (com o total visível para quem consulta)
create function public.conecta_lateral(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with vis as (select * from conecta_visiveis(p_tenant) where oculta_em is null)
  select jsonb_build_object(
    'destaques', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'titulo', v.titulo, 'criado_em', v.criado_em, 'fixada_ate', v.fixada_ate) order by v.fixada_em desc)
                            from vis v where v.fixada_em is not null and (v.fixada_ate is null or v.fixada_ate > now())), '[]'),
    'recentes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'titulo', r.titulo, 'criado_em', r.criado_em) order by r.criado_em desc)
                           from (select * from vis order by criado_em desc limit 6) r), '[]'),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'icone', c.icone, 'cor', c.cor,
                                                                 'total', (select count(*) from vis v where v.categoria_id = c.id)) order by c.ordem, c.nome)
                             from conecta_categorias c where c.tenant_id = p_tenant and c.ativo), '[]'))
  where membro_ativo(p_tenant, auth.uid()) or conecta_moderador(p_tenant)
$$;

-- Destinos: unidades da estrutura por tipo (qualquer membro escolhe, mesmo fora do próprio ramo)
create function public.conecta_buscar_unidades(p_tenant uuid, p_grupo text, p_termo text default null)
returns table (id uuid, nome text, sigla text, tipo text, detalhe text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome, u.sigla, u.tipo,
         nullif(concat_ws(' · ', (select coalesce(a.sigla, a.nome) from unidades_organizacionais a where a.id = any(u.caminho) and a.tipo = 'DIRETORIA' and a.id <> u.id limit 1),
                                 (select coalesce(a.sigla, a.nome) from unidades_organizacionais a where a.id = any(u.caminho) and a.tipo = 'COORDENACAO' and a.id <> u.id limit 1)), '')
    from unidades_organizacionais u
   where u.tenant_id = p_tenant and u.ativo
     and (membro_ativo(p_tenant, auth.uid()) or conecta_moderador(p_tenant))
     and u.tipo = any(case p_grupo when 'SECRETARIA' then array['SECRETARIA'] when 'DIRETORIA' then array['DIRETORIA']
                                   when 'COORDENACAO' then array['COORDENACAO'] when 'UNIDADE_SAUDE' then array['UNIDADE']
                                   else array['GERENCIA', 'DEPARTAMENTO', 'SETOR'] end)
     and (nullif(btrim(p_termo), '') is null or lower(u.nome || ' ' || coalesce(u.sigla, '')) like '%' || lower(btrim(p_termo)) || '%')
   order by u.nome
   limit 30
$$;

-- Destinos: pessoas com acesso ativo no órgão, com cargo e lotação dos cadastros
create function public.conecta_buscar_pessoas(p_tenant uuid, p_termo text)
returns table (user_id uuid, nome text, cargo text, avatar_path text, lotacao jsonb)
language sql stable security definer set search_path = public as $$
  select pf.id, pf.nome, q.cargo, pf.avatar_path, conecta_hierarquia(q.unidade_id)
    from perfis pf
    left join lateral (select * from conecta_quem(p_tenant, pf.id)) q on true
   where (membro_ativo(p_tenant, auth.uid()) or conecta_moderador(p_tenant))
     and membro_ativo(p_tenant, pf.id)
     and length(btrim(coalesce(p_termo, ''))) >= 2
     and lower(pf.nome || ' ' || pf.email) like '%' || lower(btrim(p_termo)) || '%'
   order by pf.nome
   limit 20
$$;

-- Painel administrativo: estatísticas, denúncias e publicações ocultas
create function public.conecta_admin(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not conecta_moderador(p_tenant) then
    raise exception 'Somente a moderação do CONECTA acessa o painel administrativo.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'publicacoes', (select count(*) from conecta_publicacoes where tenant_id = p_tenant and excluida_em is null),
    'publicacoes_30d', (select count(*) from conecta_publicacoes where tenant_id = p_tenant and excluida_em is null and criado_em > now() - interval '30 days'),
    'comentarios', (select count(*) from conecta_comentarios where tenant_id = p_tenant and excluido_em is null),
    'curtidas', (select count(*) from conecta_curtidas where tenant_id = p_tenant),
    'autores', (select count(distinct autor_id) from conecta_publicacoes where tenant_id = p_tenant and excluida_em is null),
    'ocultas', (select count(*) from conecta_publicacoes where tenant_id = p_tenant and excluida_em is null and oculta_em is not null),
    'por_categoria', coalesce((select jsonb_agg(jsonb_build_object('nome', c.nome, 'total', x.n) order by x.n desc)
       from (select categoria_id, count(*) n from conecta_publicacoes where tenant_id = p_tenant and excluida_em is null group by 1) x
       join conecta_categorias c on c.id = x.categoria_id), '[]'),
    'mais_ativos', coalesce((select jsonb_agg(jsonb_build_object('nome', pf.nome, 'total', x.n) order by x.n desc)
       from (select autor_id, count(*) n from conecta_publicacoes where tenant_id = p_tenant and excluida_em is null group by 1 order by 2 desc limit 5) x
       join perfis pf on pf.id = x.autor_id), '[]'),
    'denuncias', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'motivo', d.motivo, 'criado_em', d.criado_em, 'situacao', d.situacao,
         'resolucao', d.resolucao, 'publicacao_id', d.publicacao_id, 'titulo', p.titulo, 'comentario', cm.texto,
         'denunciante', (select nome from perfis where id = d.denunciante_id)) order by d.situacao = 'ABERTA' desc, d.criado_em desc)
       from (select * from conecta_denuncias where tenant_id = p_tenant order by criado_em desc limit 100) d
       join conecta_publicacoes p on p.id = d.publicacao_id
       left join conecta_comentarios cm on cm.id = d.comentario_id), '[]'),
    'ocultas_lista', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'titulo', p.titulo, 'motivo', p.motivo_ocultacao, 'oculta_em', p.oculta_em,
         'autor', (select nome from perfis where id = p.autor_id)) order by p.oculta_em desc)
       from conecta_publicacoes p where p.tenant_id = p_tenant and p.excluida_em is null and p.oculta_em is not null), '[]'));
end $$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function
  public.membro_ativo(uuid, uuid), public.notificar(uuid, uuid[], text, text, text, text, text, uuid),
  public.minhas_mensagens(uuid, text, int), public.marcar_mensagens_lidas(uuid, uuid[], text),
  public.conecta_semear_categorias(uuid), public.conecta_categorias_novo_orgao(),
  public.conecta_lotacoes(uuid, uuid), public.conecta_alcance(uuid, uuid), public.conecta_moderador(uuid),
  public.conecta_destinada_a(uuid, uuid), public.conecta_pode_ver(uuid), public.conecta_visiveis(uuid),
  public.conecta_publico_alvo(uuid), public.conecta_hierarquia(uuid), public.conecta_quem(uuid, uuid),
  public.conecta_exige_membro(uuid), public.conecta_publicar(uuid, jsonb), public.conecta_editar_publicacao(uuid, jsonb),
  public.conecta_excluir_publicacao(uuid, text), public.conecta_moderar_publicacao(uuid, boolean, text),
  public.conecta_fixar(uuid, boolean, timestamptz), public.conecta_comentar(uuid, text, uuid, uuid[]),
  public.conecta_editar_comentario(uuid, text), public.conecta_excluir_comentario(uuid, text), public.conecta_curtir(uuid),
  public.conecta_denunciar(uuid, text, uuid), public.conecta_resolver_denuncia(uuid, boolean, text),
  public.conecta_tipos_aceitos(uuid), public.conecta_registrar_anexo(uuid, text, text, bigint), public.conecta_remover_anexo(uuid),
  public.conecta_feed(uuid, jsonb), public.conecta_comentarios_de(uuid), public.conecta_lateral(uuid),
  public.conecta_buscar_unidades(uuid, text, text), public.conecta_buscar_pessoas(uuid, text), public.conecta_admin(uuid)
from public, anon;

-- internas: só usadas dentro de outras funções
revoke execute on function
  public.membro_ativo(uuid, uuid), public.notificar(uuid, uuid[], text, text, text, text, text, uuid),
  public.conecta_semear_categorias(uuid), public.conecta_categorias_novo_orgao(),
  public.conecta_lotacoes(uuid, uuid), public.conecta_alcance(uuid, uuid), public.conecta_destinada_a(uuid, uuid),
  public.conecta_visiveis(uuid), public.conecta_publico_alvo(uuid), public.conecta_hierarquia(uuid), public.conecta_quem(uuid, uuid),
  public.conecta_exige_membro(uuid)
from authenticated;

grant execute on function
  -- usadas nas políticas RLS
  public.conecta_pode_ver(uuid), public.conecta_moderador(uuid),
  -- RPCs
  public.minhas_mensagens(uuid, text, int), public.marcar_mensagens_lidas(uuid, uuid[], text),
  public.conecta_publicar(uuid, jsonb), public.conecta_editar_publicacao(uuid, jsonb),
  public.conecta_excluir_publicacao(uuid, text), public.conecta_moderar_publicacao(uuid, boolean, text),
  public.conecta_fixar(uuid, boolean, timestamptz), public.conecta_comentar(uuid, text, uuid, uuid[]),
  public.conecta_editar_comentario(uuid, text), public.conecta_excluir_comentario(uuid, text), public.conecta_curtir(uuid),
  public.conecta_denunciar(uuid, text, uuid), public.conecta_resolver_denuncia(uuid, boolean, text),
  public.conecta_tipos_aceitos(uuid), public.conecta_registrar_anexo(uuid, text, text, bigint), public.conecta_remover_anexo(uuid),
  public.conecta_feed(uuid, jsonb), public.conecta_comentarios_de(uuid), public.conecta_lateral(uuid),
  public.conecta_buscar_unidades(uuid, text, text), public.conecta_buscar_pessoas(uuid, text), public.conecta_admin(uuid)
to authenticated;
