-- Pesquisa de preços: catálogo completo (todas as áreas) e busca rápida.
--  * Coluna "busca" já normalizada (minúsculas, sem acento, com o código) e índice de trigramas nela: cada palavra
--    digitada vira um LIKE que usa o índice (antes a busca percorria a tabela inteira).
--  * As categorias do órgão deixam de limitar a busca: passam a dar prioridade (itens do ramo da secretaria primeiro).
--  * Sincronização do catálogo inteiro em lotes por uma rotina agendada (pg_cron, só em produção), que recomeça a
--    cada 7 dias para manter os códigos atualizados.

-- 1. Busca normalizada -------------------------------------------------------------------------------
alter table public.catalogo_compras add column busca text generated always as (sem_acento_catalogo(descricao) || ' ' || codigo::text) stored;
drop index if exists public.catalogo_compras_busca;
create index catalogo_compras_busca on public.catalogo_compras using gin (busca extensions.gin_trgm_ops);

create or replace function public.catalogo_buscar(p_tenant uuid, p_tipo text, p_texto text, p_limite int default 30)
returns table (tipo text, codigo bigint, descricao text, codigo_grupo int, nome_grupo text, codigo_classe int, nome_classe text, categoria text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_filtro text := '';
  w text;
begin
  if not (membro_do_tenant(p_tenant) or eh_admin_plataforma()) then
    raise exception 'Sem acesso a este órgão.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('MATERIAL', 'SERVICO') then raise exception 'Tipo inválido.' using errcode = 'invalid_parameter_value'; end if;
  if v_texto ~ '^[0-9]+$' then
    v_filtro := format(' and k.codigo::text like %L', v_texto || '%');
  else
    for w in select regexp_replace(x, '[^a-z0-9]', '', 'g') from unnest(regexp_split_to_array(sem_acento_catalogo(v_texto), '\s+')) x loop
      if length(w) >= 2 then v_filtro := v_filtro || format(' and k.busca like %L', '%' || w || '%'); end if;
    end loop;
  end if;
  if v_filtro = '' then return; end if;
  return query execute format($q$
    select k.tipo, k.codigo, k.descricao, k.codigo_grupo, k.nome_grupo, k.codigo_classe, k.nome_classe, c.nome
      from catalogo_compras k
      left join catalogo_categorias_orgao c on c.tenant_id = %L and c.tipo = k.tipo and c.ativo
             and c.codigo = case when k.tipo = 'MATERIAL' then k.codigo_classe else k.codigo_grupo end
     where k.tipo = %L and k.ativo %s
     order by (c.id is not null) desc, (k.codigo::text = %L) desc, length(k.descricao), k.codigo
     limit %s$q$, p_tenant, p_tipo, v_filtro, v_texto, greatest(1, least(coalesce(p_limite, 30), 100)));
end $$;

-- 2. Gravação de uma página do catálogo (interna, sem checagem de permissão) ----------------------
create function public.catalogo_gravar_pagina(p_tipo text, p_codigo int, p_pagina int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resp jsonb;
  v_par jsonb := jsonb_build_object('pagina', p_pagina::text, 'tamanhoPagina', '500');
  v_n int;
begin
  if p_tipo = 'MATERIAL' then
    if p_codigo > 0 then v_par := v_par || jsonb_build_object('codigoClasse', p_codigo::text); else v_par := v_par || '{"statusItem": "true"}'; end if;
    v_resp := compras_gov_get('/modulo-material/4_consultarItemMaterial', v_par);
    insert into catalogo_compras (tipo, codigo, descricao, codigo_grupo, nome_grupo, codigo_classe, nome_classe, nome_pdm, ativo, sincronizado_em)
    select distinct on ((r ->> 'codigoItem')::bigint) 'MATERIAL', (r ->> 'codigoItem')::bigint, left(btrim(r ->> 'descricaoItem'), 400),
           (r ->> 'codigoGrupo')::int, r ->> 'nomeGrupo', (r ->> 'codigoClasse')::int, r ->> 'nomeClasse', r ->> 'nomePdm',
           coalesce((r ->> 'statusItem')::boolean, true), now()
      from jsonb_array_elements(coalesce(v_resp -> 'resultado', '[]')) r
     where r ->> 'codigoItem' is not null and coalesce(btrim(r ->> 'descricaoItem'), '') <> ''
    on conflict (tipo, codigo) do update set descricao = excluded.descricao, codigo_grupo = excluded.codigo_grupo, nome_grupo = excluded.nome_grupo,
      codigo_classe = excluded.codigo_classe, nome_classe = excluded.nome_classe, nome_pdm = excluded.nome_pdm, ativo = excluded.ativo,
      sincronizado_em = excluded.sincronizado_em;
  else
    if p_codigo > 0 then v_par := v_par || jsonb_build_object('codigoGrupo', p_codigo::text); else v_par := v_par || '{"statusServico": "true"}'; end if;
    v_resp := compras_gov_get('/modulo-servico/6_consultarItemServico', v_par);
    insert into catalogo_compras (tipo, codigo, descricao, codigo_grupo, nome_grupo, codigo_classe, nome_classe, ativo, sincronizado_em)
    select distinct on ((r ->> 'codigoServico')::bigint) 'SERVICO', (r ->> 'codigoServico')::bigint, left(btrim(r ->> 'nomeServico'), 400),
           (r ->> 'codigoGrupo')::int, r ->> 'nomeGrupo', (r ->> 'codigoClasse')::int, r ->> 'nomeClasse',
           coalesce((r ->> 'statusServico')::boolean, true), now()
      from jsonb_array_elements(coalesce(v_resp -> 'resultado', '[]')) r
     where r ->> 'codigoServico' is not null and coalesce(btrim(r ->> 'nomeServico'), '') <> ''
    on conflict (tipo, codigo) do update set descricao = excluded.descricao, codigo_grupo = excluded.codigo_grupo, nome_grupo = excluded.nome_grupo,
      codigo_classe = excluded.codigo_classe, nome_classe = excluded.nome_classe, ativo = excluded.ativo, sincronizado_em = excluded.sincronizado_em;
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('gravados', v_n, 'restantes', coalesce((v_resp ->> 'paginasRestantes')::int, 0), 'total_paginas', coalesce((v_resp ->> 'totalPaginas')::int, 0));
end $$;

-- A função chamada pela tela continua com a mesma regra de permissão; código 0 = catálogo inteiro (só a plataforma)
create or replace function public.catalogo_sincronizar(p_tipo text, p_codigo int, p_pagina int default 1, p_max_paginas int default 4)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pag int := greatest(1, coalesce(p_pagina, 1));
  v_fim int := v_pag + greatest(1, least(coalesce(p_max_paginas, 4), 10)) - 1;
  v_r jsonb;
  v_gravados int := 0;
begin
  if p_tipo not in ('MATERIAL', 'SERVICO') then raise exception 'Tipo inválido.' using errcode = 'invalid_parameter_value'; end if;
  if not (eh_admin_plataforma() or (p_codigo > 0 and exists (
      select 1 from catalogo_categorias_orgao c where c.tipo = p_tipo and c.codigo = p_codigo and c.ativo and pode_editar_catalogo(c.tenant_id)))) then
    raise exception 'Sem permissão para atualizar esta categoria do catálogo.' using errcode = 'insufficient_privilege';
  end if;
  loop
    v_r := catalogo_gravar_pagina(p_tipo, coalesce(p_codigo, 0), v_pag);
    v_gravados := v_gravados + (v_r ->> 'gravados')::int;
    exit when (v_r ->> 'restantes')::int <= 0 or v_pag >= v_fim;
    v_pag := v_pag + 1;
  end loop;
  return jsonb_build_object('gravados', v_gravados, 'proxima_pagina', case when (v_r ->> 'restantes')::int > 0 then v_pag + 1 end,
    'total_paginas', (v_r ->> 'total_paginas')::int);
end $$;

-- 3. Atualização automática do catálogo inteiro ----------------------------------------------------
create table public.catalogo_sincronizacao (
  tipo text primary key check (tipo in ('MATERIAL', 'SERVICO')),
  proxima_pagina int not null default 1,
  total_paginas int,
  ciclo_iniciado_em timestamptz,
  ciclo_concluido_em timestamptz,
  ultimo_erro text,
  atualizado_em timestamptz not null default now()
);
insert into public.catalogo_sincronizacao (tipo) values ('SERVICO'), ('MATERIAL');
alter table public.catalogo_sincronizacao enable row level security;
create policy catalogo_sinc_ler on public.catalogo_sincronizacao for select to authenticated using (true);
create policy mfa_obrigatorio on public.catalogo_sincronizacao as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.catalogo_sincronizacao from anon;
revoke insert, update, delete on public.catalogo_sincronizacao from authenticated;

-- Processa até p_paginas páginas do tipo em andamento (serviços primeiro). Ciclo novo a cada 7 dias.
create function public.catalogo_atualizar_lote(p_paginas int default 10) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_r jsonb;
  v_feitas int := 0;
  v_gravados int := 0;
begin
  for s in select * from catalogo_sincronizacao order by tipo desc for update loop  -- SERVICO antes de MATERIAL
    if s.ciclo_concluido_em is not null and s.ciclo_concluido_em > now() - interval '7 days' then continue; end if;
    if s.ciclo_concluido_em is not null then  -- recomeça o ciclo
      update catalogo_sincronizacao set proxima_pagina = 1, ciclo_iniciado_em = now(), ciclo_concluido_em = null, atualizado_em = now() where tipo = s.tipo;
      s.proxima_pagina := 1;
    elsif s.ciclo_iniciado_em is null then
      update catalogo_sincronizacao set ciclo_iniciado_em = now() where tipo = s.tipo;
    end if;
    while v_feitas < greatest(1, least(coalesce(p_paginas, 10), 40)) loop
      begin
        v_r := catalogo_gravar_pagina(s.tipo, 0, s.proxima_pagina);
      exception when others then
        update catalogo_sincronizacao set ultimo_erro = left(sqlerrm, 300), atualizado_em = now() where tipo = s.tipo;
        return jsonb_build_object('erro', sqlerrm, 'paginas', v_feitas, 'gravados', v_gravados);
      end;
      v_feitas := v_feitas + 1;
      v_gravados := v_gravados + (v_r ->> 'gravados')::int;
      if (v_r ->> 'restantes')::int <= 0 then
        update catalogo_sincronizacao set ciclo_concluido_em = now(), total_paginas = (v_r ->> 'total_paginas')::int, ultimo_erro = null, atualizado_em = now() where tipo = s.tipo;
        exit;
      end if;
      s.proxima_pagina := s.proxima_pagina + 1;
      update catalogo_sincronizacao set proxima_pagina = s.proxima_pagina, total_paginas = (v_r ->> 'total_paginas')::int, ultimo_erro = null, atualizado_em = now() where tipo = s.tipo;
    end loop;
    exit when v_feitas >= greatest(1, least(coalesce(p_paginas, 10), 40));
  end loop;
  return jsonb_build_object('paginas', v_feitas, 'gravados', v_gravados);
end $$;

revoke execute on function public.catalogo_gravar_pagina(text, int, int), public.catalogo_atualizar_lote(int) from public, anon, authenticated;
revoke execute on function public.catalogo_buscar(uuid, text, text, int), public.catalogo_sincronizar(text, int, int, int) from public, anon;
grant execute on function public.catalogo_buscar(uuid, text, text, int), public.catalogo_sincronizar(text, int, int, int) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('measure-catalogo-compras', '*/10 * * * *', 'select public.catalogo_atualizar_lote(12)');
  end if;
end $$;
