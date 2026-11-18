-- Dados abertos do Compras.gov.br dentro do MEASURE.
--  1. Catálogo CATMAT/CATSER guardado no banco (busca por nome instantânea; a API do governo só acha descrição exata).
--  2. Categorias de códigos por órgão: cada secretaria libera as classes (material) e os grupos (serviço) do seu ramo.
--     A SMS começa com as classes de saúde e as de apoio (limpeza, gases, combate a incêndio, manutenção...).
--  3. Consulta aos dados abertos feita pelo servidor (a API recusa chamadas do navegador de outros sites), com cache
--     de 12 horas e lista fechada de consultas e parâmetros (nada de endereço livre: sem SSRF).
-- A extensão http (pgsql-http) só existe em produção; nos testes locais as funções avisam que a consulta está indisponível.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'http') then
    create extension if not exists http with schema extensions;
  end if;
end $$;

-- =====================================================================
-- 1. Catálogo (comum a todos os órgãos: é o catálogo do governo federal)
-- =====================================================================
create table public.catalogo_compras (
  tipo text not null check (tipo in ('MATERIAL', 'SERVICO')),
  codigo bigint not null check (codigo > 0),
  descricao text not null,
  codigo_grupo int, nome_grupo text,
  codigo_classe int, nome_classe text,
  nome_pdm text,
  ativo boolean not null default true,
  sincronizado_em timestamptz not null default now(),
  primary key (tipo, codigo)
);
create index catalogo_compras_busca on public.catalogo_compras using gin ((lower(descricao)) extensions.gin_trgm_ops);
create index catalogo_compras_classe on public.catalogo_compras (tipo, codigo_classe);
create index catalogo_compras_grupo on public.catalogo_compras (tipo, codigo_grupo);
alter table public.catalogo_compras enable row level security;
create policy catalogo_ler on public.catalogo_compras for select to authenticated using (true);
create policy mfa_obrigatorio on public.catalogo_compras as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.catalogo_compras from anon;
revoke insert, update, delete on public.catalogo_compras from authenticated;  -- só pela sincronização

-- =====================================================================
-- 2. Categorias de códigos de cada órgão
--    MATERIAL: código da classe CATMAT (4 dígitos). SERVICO: código do grupo CATSER (3 dígitos).
-- =====================================================================
create table public.catalogo_categorias_orgao (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  tipo text not null check (tipo in ('MATERIAL', 'SERVICO')),
  codigo int not null check (codigo > 0),
  nome text not null check (length(btrim(nome)) between 2 and 200),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  unique (tenant_id, tipo, codigo)
);
create trigger catalogo_cat_criacao before insert on public.catalogo_categorias_orgao for each row execute function public.carimbar_criacao();
create trigger catalogo_cat_carimbar before update on public.catalogo_categorias_orgao for each row execute function public.carimbar();
create trigger catalogo_cat_tenant before update on public.catalogo_categorias_orgao for each row execute function public.bloquear_troca_tenant();
create trigger catalogo_cat_auditar after insert or update or delete on public.catalogo_categorias_orgao for each row execute function public.auditar();

-- Quem define as categorias: quem edita as configurações do órgão, ou a plataforma (desenvolvedor)
create function public.pode_editar_catalogo(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pode(p_tenant, null, 'configuracoes', 'editar') or eh_admin_plataforma()
$$;

alter table public.catalogo_categorias_orgao enable row level security;
create policy catalogo_cat_ler on public.catalogo_categorias_orgao for select to authenticated
  using (membro_do_tenant(tenant_id) or eh_admin_plataforma());
create policy catalogo_cat_criar on public.catalogo_categorias_orgao for insert to authenticated with check (pode_editar_catalogo(tenant_id));
create policy catalogo_cat_editar on public.catalogo_categorias_orgao for update to authenticated
  using (pode_editar_catalogo(tenant_id)) with check (pode_editar_catalogo(tenant_id));
create policy mfa_obrigatorio on public.catalogo_categorias_orgao as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.catalogo_categorias_orgao from anon;
revoke delete on public.catalogo_categorias_orgao from authenticated;  -- desativa (ativo = false), não apaga

-- =====================================================================
-- 3. Chamada à API do governo (interna)
-- =====================================================================
create table public.compras_gov_cache (
  chave text primary key,
  resposta jsonb not null,
  consultado_em timestamptz not null default now()
);
alter table public.compras_gov_cache enable row level security;
create policy mfa_obrigatorio on public.compras_gov_cache as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.compras_gov_cache from anon, authenticated;

-- GET em https://dadosabertos.compras.gov.br + caminho fixo + parâmetros já validados. Nunca recebe endereço livre.
create function public.compras_gov_get(p_caminho text, p_parametros jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_query text;
  v_status int;
  v_conteudo text;
begin
  if p_caminho !~ '^/modulo-[a-z-]+/[0-9]_[A-Za-z_]+$' then
    raise exception 'Consulta não permitida.' using errcode = 'insufficient_privilege';
  end if;
  if to_regprocedure('extensions.http_get(character varying)') is null then
    raise exception 'A consulta aos dados abertos do Compras.gov.br não está disponível neste ambiente.' using errcode = 'feature_not_supported';
  end if;
  select string_agg(k || '=' || v, '&' order by k) into v_query
    from jsonb_each_text(p_parametros) as e(k, v)
   where v is not null and v <> '';
  begin
    execute 'select extensions.http_set_curlopt(''CURLOPT_TIMEOUT_MS'', ''45000'')';
  exception when others then null;  -- versões antigas da extensão: usa o tempo padrão
  end;
  execute 'select status, content from extensions.http_get($1)' into v_status, v_conteudo
    using 'https://dadosabertos.compras.gov.br' || p_caminho || '?' || coalesce(v_query, '');
  if v_status = 404 then
    return jsonb_build_object('resultado', '[]'::jsonb, 'totalRegistros', 0, 'totalPaginas', 0, 'paginasRestantes', 0);
  end if;
  if v_status <> 200 then
    raise exception 'O Compras.gov.br não respondeu à consulta (código %). Tente de novo em alguns minutos.', v_status using errcode = 'external_routine_exception';
  end if;
  return v_conteudo::jsonb;
exception
  when invalid_text_representation then
    raise exception 'O Compras.gov.br devolveu uma resposta inválida. Tente de novo em alguns minutos.' using errcode = 'external_routine_exception';
end $$;

-- =====================================================================
-- 4. Consulta pública para a tela (lista fechada de consultas e parâmetros)
-- =====================================================================
create function public.consultar_compras_gov(p_consulta text, p_parametros jsonb default '{}', p_pagina int default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_caminho text;
  v_permitidos text[];
  v_obrigatorios text[];
  v_fixos jsonb := '{}';
  v_par jsonb := '{}';
  k text; v text;
  v_chave text;
  v_resp jsonb;
  v_em timestamptz;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para consultar.' using errcode = 'insufficient_privilege'; end if;
  case p_consulta
    when 'preco_material' then
      v_caminho := '/modulo-pesquisa-preco/1_consultarMaterial';
      v_permitidos := array['codigo', 'estado', 'dataCompraInicio', 'dataCompraFim']; v_obrigatorios := array['codigo'];
      v_fixos := '{"tipo": "codigoItemCatalogo"}';
    when 'preco_servico' then
      v_caminho := '/modulo-pesquisa-preco/3_consultarServico';
      v_permitidos := array['codigoItemCatalogo', 'estado', 'dataCompraInicio', 'dataCompraFim']; v_obrigatorios := array['codigoItemCatalogo'];
    when 'arp_item' then
      v_caminho := '/modulo-arp/2_consultarARPItem';
      v_permitidos := array['codigoItem', 'dataVigenciaInicialMin', 'dataVigenciaInicialMax'];
      v_obrigatorios := array['codigoItem', 'dataVigenciaInicialMin', 'dataVigenciaInicialMax'];
    when 'fornecedor' then
      v_caminho := '/modulo-fornecedor/1_consultarFornecedor';
      v_permitidos := array['cnpj']; v_obrigatorios := array['cnpj']; v_fixos := '{"ativo": "true"}';
    else
      raise exception 'Consulta desconhecida.' using errcode = 'invalid_parameter_value';
  end case;

  for k, v in select * from jsonb_each_text(coalesce(p_parametros, '{}')) loop
    if not k = any(v_permitidos) or v is null or btrim(v) = '' then continue; end if;
    v := btrim(v);
    if k in ('codigo', 'codigoItemCatalogo', 'codigoItem') then
      v := regexp_replace(v, '\D', '', 'g');
      if v !~ '^[0-9]{1,9}$' then raise exception 'Informe o código do item só com números.' using errcode = 'check_violation', hint = k; end if;
    elsif k = 'cnpj' then
      v := regexp_replace(v, '\D', '', 'g');
      if v !~ '^[0-9]{14}$' then raise exception 'Informe o CNPJ com 14 números.' using errcode = 'check_violation', hint = k; end if;
    elsif k = 'estado' then
      v := upper(v);
      if v !~ '^[A-Z]{2}$' then raise exception 'UF inválida.' using errcode = 'check_violation', hint = k; end if;
    elsif v !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Data inválida.' using errcode = 'check_violation', hint = k;
    end if;
    v_par := v_par || jsonb_build_object(k, v);
  end loop;
  foreach k in array v_obrigatorios loop
    if not v_par ? k then raise exception 'Preencha o campo obrigatório da consulta.' using errcode = 'check_violation', hint = k; end if;
  end loop;
  v_par := v_par || v_fixos || jsonb_build_object('pagina', greatest(1, least(coalesce(p_pagina, 1), 1000))::text, 'tamanhoPagina', '100');

  v_chave := p_consulta || ':' || v_par::text;
  select resposta, consultado_em into v_resp, v_em from compras_gov_cache where chave = v_chave and consultado_em > now() - interval '12 hours';
  if v_resp is null then
    v_resp := compras_gov_get(v_caminho, v_par);
    v_em := now();
    insert into compras_gov_cache (chave, resposta, consultado_em) values (v_chave, v_resp, v_em)
      on conflict (chave) do update set resposta = excluded.resposta, consultado_em = excluded.consultado_em;
    delete from compras_gov_cache where consultado_em < now() - interval '2 days';
  end if;
  return v_resp || jsonb_build_object('consultado_em', v_em, 'pagina', (v_par ->> 'pagina')::int);
end $$;

-- =====================================================================
-- 5. Sincronização do catálogo (em lotes de páginas, para caber no tempo de uma chamada)
--    Material: por classe CATMAT. Serviço: por grupo CATSER.
-- =====================================================================
create function public.catalogo_sincronizar(p_tipo text, p_codigo int, p_pagina int default 1, p_max_paginas int default 4)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pag int := greatest(1, coalesce(p_pagina, 1));
  v_fim int := v_pag + greatest(1, least(coalesce(p_max_paginas, 4), 10)) - 1;
  v_resp jsonb;
  v_gravados int := 0;
  v_n int;
  v_restantes int := 0;
begin
  if not (eh_admin_plataforma() or exists (
      select 1 from catalogo_categorias_orgao c where c.tipo = p_tipo and c.codigo = p_codigo and c.ativo and pode_editar_catalogo(c.tenant_id))) then
    raise exception 'Sem permissão para atualizar esta categoria do catálogo.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('MATERIAL', 'SERVICO') then raise exception 'Tipo inválido.' using errcode = 'invalid_parameter_value'; end if;

  while v_pag <= v_fim loop
    if p_tipo = 'MATERIAL' then
      v_resp := compras_gov_get('/modulo-material/4_consultarItemMaterial',
        jsonb_build_object('pagina', v_pag::text, 'tamanhoPagina', '500', 'codigoClasse', p_codigo::text));
      insert into catalogo_compras (tipo, codigo, descricao, codigo_grupo, nome_grupo, codigo_classe, nome_classe, nome_pdm, ativo, sincronizado_em)
      select 'MATERIAL', (r ->> 'codigoItem')::bigint, left(btrim(r ->> 'descricaoItem'), 600),
             (r ->> 'codigoGrupo')::int, r ->> 'nomeGrupo', (r ->> 'codigoClasse')::int, r ->> 'nomeClasse', r ->> 'nomePdm',
             coalesce((r ->> 'statusItem')::boolean, true), now()
        from jsonb_array_elements(coalesce(v_resp -> 'resultado', '[]')) r
       where r ->> 'codigoItem' is not null and coalesce(btrim(r ->> 'descricaoItem'), '') <> ''
      on conflict (tipo, codigo) do update set descricao = excluded.descricao, codigo_grupo = excluded.codigo_grupo, nome_grupo = excluded.nome_grupo,
        codigo_classe = excluded.codigo_classe, nome_classe = excluded.nome_classe, nome_pdm = excluded.nome_pdm, ativo = excluded.ativo,
        sincronizado_em = excluded.sincronizado_em;
    else
      v_resp := compras_gov_get('/modulo-servico/6_consultarItemServico',
        jsonb_build_object('pagina', v_pag::text, 'tamanhoPagina', '500', 'codigoGrupo', p_codigo::text));
      insert into catalogo_compras (tipo, codigo, descricao, codigo_grupo, nome_grupo, codigo_classe, nome_classe, ativo, sincronizado_em)
      select 'SERVICO', (r ->> 'codigoServico')::bigint, left(btrim(r ->> 'nomeServico'), 600),
             (r ->> 'codigoGrupo')::int, r ->> 'nomeGrupo', (r ->> 'codigoClasse')::int, r ->> 'nomeClasse',
             coalesce((r ->> 'statusServico')::boolean, true), now()
        from jsonb_array_elements(coalesce(v_resp -> 'resultado', '[]')) r
       where r ->> 'codigoServico' is not null and coalesce(btrim(r ->> 'nomeServico'), '') <> ''
      on conflict (tipo, codigo) do update set descricao = excluded.descricao, codigo_grupo = excluded.codigo_grupo, nome_grupo = excluded.nome_grupo,
        codigo_classe = excluded.codigo_classe, nome_classe = excluded.nome_classe, ativo = excluded.ativo, sincronizado_em = excluded.sincronizado_em;
    end if;
    get diagnostics v_n = row_count;
    v_gravados := v_gravados + v_n;
    v_restantes := coalesce((v_resp ->> 'paginasRestantes')::int, 0);
    exit when v_restantes <= 0;
    v_pag := v_pag + 1;
  end loop;
  return jsonb_build_object('gravados', v_gravados, 'proxima_pagina', case when v_restantes > 0 then v_pag + 1 end,
    'total_paginas', coalesce((v_resp ->> 'totalPaginas')::int, 0));
end $$;

-- =====================================================================
-- 6. Busca no catálogo, limitada às categorias do órgão (se o órgão não definiu nenhuma, busca em todo o catálogo)
-- =====================================================================
create function public.sem_acento_catalogo(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

create function public.catalogo_buscar(p_tenant uuid, p_tipo text, p_texto text, p_limite int default 30)
returns table (tipo text, codigo bigint, descricao text, codigo_grupo int, nome_grupo text, codigo_classe int, nome_classe text, categoria text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_palavras text[];
  v_restrito boolean;
begin
  if not (membro_do_tenant(p_tenant) or eh_admin_plataforma()) then
    raise exception 'Sem acesso a este órgão.' using errcode = 'insufficient_privilege';
  end if;
  v_restrito := exists (select 1 from catalogo_categorias_orgao c where c.tenant_id = p_tenant and c.tipo = p_tipo and c.ativo);
  v_palavras := array(select w from unnest(regexp_split_to_array(sem_acento_catalogo(btrim(coalesce(p_texto, ''))), '\s+')) w where length(w) >= 2);
  return query
    select k.tipo, k.codigo, k.descricao, k.codigo_grupo, k.nome_grupo, k.codigo_classe, k.nome_classe, c.nome
      from catalogo_compras k
      left join catalogo_categorias_orgao c on c.tenant_id = p_tenant and c.tipo = k.tipo and c.ativo
             and c.codigo = case when k.tipo = 'MATERIAL' then k.codigo_classe else k.codigo_grupo end
     where k.tipo = p_tipo and k.ativo
       and (not v_restrito or c.id is not null)
       and (
         (btrim(coalesce(p_texto, '')) ~ '^[0-9]+$' and k.codigo::text like btrim(p_texto) || '%')
         or (cardinality(v_palavras) > 0 and not exists (
               select 1 from unnest(v_palavras) w where position(w in sem_acento_catalogo(k.descricao)) = 0))
       )
     order by (btrim(coalesce(p_texto, '')) = k.codigo::text) desc, length(k.descricao), k.codigo
     limit greatest(1, least(coalesce(p_limite, 30), 100));
end $$;

-- Resumo das categorias do órgão com quantos itens já estão no catálogo
create function public.catalogo_categorias_resumo(p_tenant uuid)
returns table (id uuid, tipo text, codigo int, nome text, ativo boolean, itens bigint, sincronizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.tipo, c.codigo, c.nome, c.ativo,
         (select count(*) from catalogo_compras k where k.tipo = c.tipo
            and (case when c.tipo = 'MATERIAL' then k.codigo_classe else k.codigo_grupo end) = c.codigo),
         (select max(k.sincronizado_em) from catalogo_compras k where k.tipo = c.tipo
            and (case when c.tipo = 'MATERIAL' then k.codigo_classe else k.codigo_grupo end) = c.codigo)
    from catalogo_categorias_orgao c
   where c.tenant_id = p_tenant and (membro_do_tenant(p_tenant) or eh_admin_plataforma())
   order by c.tipo, c.codigo
$$;

revoke execute on function public.pode_editar_catalogo(uuid), public.compras_gov_get(text, jsonb), public.consultar_compras_gov(text, jsonb, int),
  public.catalogo_sincronizar(text, int, int, int), public.sem_acento_catalogo(text), public.catalogo_buscar(uuid, text, text, int),
  public.catalogo_categorias_resumo(uuid) from public, anon;
revoke execute on function public.compras_gov_get(text, jsonb) from authenticated;
grant execute on function public.pode_editar_catalogo(uuid), public.consultar_compras_gov(text, jsonb, int), public.catalogo_sincronizar(text, int, int, int),
  public.sem_acento_catalogo(text), public.catalogo_buscar(uuid, text, text, int), public.catalogo_categorias_resumo(uuid) to authenticated;

-- =====================================================================
-- 7. Categorias de saúde para a Secretaria Municipal da Saúde
-- =====================================================================
do $$
declare
  t record;
begin
  for t in select id from tenants where nome_oficial ilike '%sa_de%' or nome_curto ilike 'SMS%' loop
    insert into catalogo_categorias_orgao (tenant_id, tipo, codigo, nome)
    select t.id, x.tipo, x.codigo, x.nome
      from (values
        ('MATERIAL', 6505, 'Drogas e medicamentos'),
        ('MATERIAL', 6508, 'Cosméticos e artigos de toucador de natureza medicinal'),
        ('MATERIAL', 6510, 'Materiais cirúrgicos para curativos'),
        ('MATERIAL', 6515, 'Instrumentos, equipamentos e suprimentos médicos e cirúrgicos'),
        ('MATERIAL', 6520, 'Instrumentos, equipamentos e suprimentos dentários'),
        ('MATERIAL', 6525, 'Equipamentos e suprimentos de raios X'),
        ('MATERIAL', 6530, 'Mobiliário, equipamentos e suprimentos hospitalares'),
        ('MATERIAL', 6532, 'Vestuário hospitalar e cirúrgico'),
        ('MATERIAL', 6540, 'Equipamentos e suprimentos oftalmológicos'),
        ('MATERIAL', 6545, 'Jogos e conjuntos médicos'),
        ('MATERIAL', 6550, 'Diagnóstico in vitro e reagentes'),
        ('MATERIAL', 6555, 'Jogos e conjuntos médicos (outros)'),
        ('MATERIAL', 6640, 'Equipamentos e artigos de laboratório'),
        ('MATERIAL', 6830, 'Gases comprimidos e liquefeitos (oxigênio medicinal)'),
        ('MATERIAL', 6840, 'Pesticidas e desinfetantes'),
        ('MATERIAL', 4210, 'Equipamentos para combate a incêndio'),
        ('MATERIAL', 4235, 'Recipientes para coleta de materiais perigosos'),
        ('MATERIAL', 7930, 'Compostos e preparados para limpeza'),
        ('MATERIAL', 8530, 'Artigos para higiene pessoal'),
        ('MATERIAL', 8540, 'Artigos de papel para higiene'),
        ('SERVICO', 931, 'Serviços de saúde humana'),
        ('SERVICO', 853, 'Limpeza e conservação'),
        ('SERVICO', 871, 'Manutenção e reparo de máquinas e equipamentos'),
        ('SERVICO', 872, 'Reparo de outros produtos'),
        ('SERVICO', 873, 'Instalação de equipamentos (inclusive médicos)'),
        ('SERVICO', 852, 'Vigilância e segurança'),
        ('SERVICO', 851, 'Prestação de serviços de pessoal'),
        ('SERVICO', 859, 'Outros serviços de suporte'),
        ('SERVICO', 942, 'Coleta e tratamento de resíduos'),
        ('SERVICO', 643, 'Transporte rodoviário'),
        ('SERVICO', 731, 'Locação de veículos'),
        ('SERVICO', 732, 'Locação de outros bens e equipamentos'),
        ('SERVICO', 835, 'Serviços técnicos, ensaios e análises'),
        ('SERVICO', 632, 'Fornecimento de alimentação')
      ) as x(tipo, codigo, nome)
    on conflict (tenant_id, tipo, codigo) do nothing;
  end loop;
end $$;
