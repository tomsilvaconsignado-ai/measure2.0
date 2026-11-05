-- MEASURE 2.0 — Fases 5 e 7: relatórios, painel, notificações, ordens de serviço, importação/exportação
--
-- Relatórios rodam no servidor, com filtros combinados:
--   * E entre campos diferentes; OU dentro de um mesmo campo (vários anos, contratos, fornecedores...);
--   * a nota aparece uma vez só, mesmo com várias unidades (unidades vêm agregadas em texto);
--   * o consumo fica na classificação ESPECÍFICA do empenho da nota (nunca em todas as do contrato).
-- Visibilidade: "relatorios:ler" no escopo da unidade do contrato, ou designação no contrato.

-- =====================================================================
-- Apoio aos filtros
-- =====================================================================

-- Lista de uuids de um filtro jsonb (null = filtro ausente)
create function public.filtro_ids(p jsonb, p_chave text) returns uuid[]
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p -> p_chave) = 'array' and jsonb_array_length(p -> p_chave) > 0
              then array(select jsonb_array_elements_text(p -> p_chave)::uuid) end
$$;

create function public.filtro_ints(p jsonb, p_chave text) returns int[]
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p -> p_chave) = 'array' and jsonb_array_length(p -> p_chave) > 0
              then array(select jsonb_array_elements_text(p -> p_chave)::int) end
$$;

-- Classificação "achatada": um registro por dotação com código e descrição de cada classificador
-- Interna (sem acesso pela API): as funções de relatório filtram a visibilidade
create view public.classificacao_detalhada as
select cl.id, cl.tenant_id, cl.codigo_completo,
       o.codigo as orgao_codigo, o.descricao as orgao_descricao,
       uo.codigo as uo_codigo, uo.descricao as uo_descricao,
       fu.codigo as funcao_codigo, fu.descricao as funcao_descricao,
       sf.codigo as subfuncao_codigo, sf.descricao as subfuncao_descricao,
       pr.codigo as programa_codigo, pr.descricao as programa_descricao,
       ac.codigo as acao_codigo, ac.descricao as acao_descricao, ac.natureza_acao,
       ce.codigo as categoria_codigo, ce.descricao as categoria_descricao,
       gn.codigo as gnd_codigo, gn.descricao as gnd_descricao,
       mo.codigo as modalidade_codigo, mo.descricao as modalidade_descricao,
       el.codigo as elemento_codigo, el.descricao as elemento_descricao,
       se.codigo as subelemento_codigo, se.descricao as subelemento_descricao,
       fo.codigo as fonte_codigo, fo.descricao as fonte_descricao,
       df.codigo as detalhamento_codigo, df.descricao as detalhamento_descricao,
       cl.orgao_id, cl.unidade_orcamentaria_id, cl.funcao_id, cl.subfuncao_id, cl.programa_id, cl.acao_id,
       cl.categoria_economica_id, cl.gnd_id, cl.modalidade_id, cl.elemento_id, cl.subelemento_id, cl.fonte_id, cl.detalhamento_fonte_id
  from classificacoes_orcamentarias cl
  left join classificadores o on o.id = cl.orgao_id
  left join classificadores uo on uo.id = cl.unidade_orcamentaria_id
  left join classificadores fu on fu.id = cl.funcao_id
  left join classificadores sf on sf.id = cl.subfuncao_id
  left join classificadores pr on pr.id = cl.programa_id
  join classificadores ac on ac.id = cl.acao_id
  left join classificadores ce on ce.id = cl.categoria_economica_id
  left join classificadores gn on gn.id = cl.gnd_id
  left join classificadores mo on mo.id = cl.modalidade_id
  join classificadores el on el.id = cl.elemento_id
  left join classificadores se on se.id = cl.subelemento_id
  join classificadores fo on fo.id = cl.fonte_id
  left join classificadores df on df.id = cl.detalhamento_fonte_id;

-- A classificação atende aos filtros de classificador? (cada campo: OU entre os itens; entre campos: E)
create function public.classificacao_casa(c classificacao_detalhada, p jsonb) returns boolean
language sql stable set search_path = public as $$
  select (filtro_ids(p, 'orgaos') is null or c.orgao_id = any(filtro_ids(p, 'orgaos')))
     and (filtro_ids(p, 'unidades_orcamentarias') is null or c.unidade_orcamentaria_id = any(filtro_ids(p, 'unidades_orcamentarias')))
     and (filtro_ids(p, 'funcoes') is null or c.funcao_id = any(filtro_ids(p, 'funcoes')))
     and (filtro_ids(p, 'subfuncoes') is null or c.subfuncao_id = any(filtro_ids(p, 'subfuncoes')))
     and (filtro_ids(p, 'programas') is null or c.programa_id = any(filtro_ids(p, 'programas')))
     and (filtro_ids(p, 'acoes') is null or c.acao_id = any(filtro_ids(p, 'acoes')))
     and (filtro_ids(p, 'categorias') is null or c.categoria_economica_id = any(filtro_ids(p, 'categorias')))
     and (filtro_ids(p, 'gnds') is null or c.gnd_id = any(filtro_ids(p, 'gnds')))
     and (filtro_ids(p, 'modalidades') is null or c.modalidade_id = any(filtro_ids(p, 'modalidades')))
     and (filtro_ids(p, 'elementos') is null or c.elemento_id = any(filtro_ids(p, 'elementos')))
     and (filtro_ids(p, 'subelementos') is null or c.subelemento_id = any(filtro_ids(p, 'subelementos')))
     and (filtro_ids(p, 'fontes') is null or c.fonte_id = any(filtro_ids(p, 'fontes')))
     and (filtro_ids(p, 'detalhamentos') is null or c.detalhamento_fonte_id = any(filtro_ids(p, 'detalhamentos')))
$$;

-- =====================================================================
-- Relatório completo: notas fiscais por classificação orçamentária
--   p: { tenant_id, ano_base: 'EMPENHO'|'EMISSAO', anos[], contratos[], fornecedores[], unidades[],
--        <classificadores>[], status_atesto, status_pagamento, incluir_canceladas }
-- =====================================================================

create function public.relatorio_notas(p jsonb) returns table (
  ano int, nota_id uuid, numero text, serie text, data_emissao date,
  fornecedor_nome text, fornecedor_documento text, fornecedor_tipo text,
  contrato_id uuid, contrato_numero text, contrato_objeto text, empenho text, processo text,
  codigo_completo text,
  orgao text, unidade_orcamentaria text, funcao text, subfuncao text, programa text,
  acao_codigo text, acao_descricao text, natureza_acao text,
  categoria text, gnd text, modalidade text,
  elemento_codigo text, elemento_descricao text, subelemento_codigo text, subelemento_descricao text,
  fonte_codigo text, fonte_descricao text, detalhamento text,
  unidades text, meses_referencia text, valor numeric, pago numeric,
  status_atesto text, status_pagamento text, cancelada boolean
)
language sql stable security definer set search_path = public as $$
  with base as (
    select nf.*, e.ano as empenho_ano, e.numero as empenho_numero, e.classificacao_id
      from notas_fiscais nf join empenhos e on e.id = nf.empenho_id
     where nf.tenant_id = (p ->> 'tenant_id')::uuid
       and (pode(nf.tenant_id, nf.unidade_id, 'relatorios', 'ler') or designado(nf.contrato_id))
       and (coalesce((p ->> 'incluir_canceladas')::boolean, false) or nf.cancelada_em is null)
       and (filtro_ids(p, 'contratos') is null or nf.contrato_id = any(filtro_ids(p, 'contratos')))
       and (filtro_ids(p, 'fornecedores') is null or nf.fornecedor_id = any(filtro_ids(p, 'fornecedores')))
       and (filtro_ids(p, 'unidades') is null or exists (select 1 from nota_unidades nu where nu.nota_id = nf.id and nu.unidade_atendida_id = any(filtro_ids(p, 'unidades'))))
       and (nullif(p ->> 'status_atesto', '') is null or nf.status_atesto = p ->> 'status_atesto')
       and (nullif(p ->> 'status_pagamento', '') is null or nf.status_pagamento = p ->> 'status_pagamento')
  )
  select x.ano, b.id, b.numero, b.serie, b.data_emissao,
         coalesce(f.razao_social, f.nome_fantasia), f.documento, f.tipo_pessoa,
         c.id, c.numero, c.objeto, b.empenho_numero || '/' || b.empenho_ano, b.processo_administrativo,
         cd.codigo_completo,
         nullif(concat_ws(' – ', cd.orgao_codigo, cd.orgao_descricao), ''), nullif(concat_ws(' – ', cd.uo_codigo, cd.uo_descricao), ''),
         nullif(concat_ws(' – ', cd.funcao_codigo, cd.funcao_descricao), ''), nullif(concat_ws(' – ', cd.subfuncao_codigo, cd.subfuncao_descricao), ''),
         nullif(concat_ws(' – ', cd.programa_codigo, cd.programa_descricao), ''),
         cd.acao_codigo, cd.acao_descricao, cd.natureza_acao,
         nullif(concat_ws(' – ', cd.categoria_codigo, cd.categoria_descricao), ''), nullif(concat_ws(' – ', cd.gnd_codigo, cd.gnd_descricao), ''),
         nullif(concat_ws(' – ', cd.modalidade_codigo, cd.modalidade_descricao), ''),
         cd.elemento_codigo, cd.elemento_descricao, cd.subelemento_codigo, cd.subelemento_descricao,
         cd.fonte_codigo, cd.fonte_descricao, nullif(concat_ws(' – ', cd.detalhamento_codigo, cd.detalhamento_descricao), ''),
         (select string_agg(ua.nome || coalesce(' (' || brl(nu.valor) || ')', ''), '; ' order by ua.nome)
            from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = b.id),
         (select string_agg(lpad(r.mes::text, 2, '0') || '/' || r.ano, ', ' order by r.ano, r.mes) from nota_referencias r where r.nota_id = b.id),
         b.valor,
         coalesce((select sum(pg.valor) from nota_pagamentos pg where pg.nota_id = b.id and pg.cancelado_em is null), 0),
         b.status_atesto, b.status_pagamento, b.cancelada_em is not null
    from base b
    join contratos c on c.id = b.contrato_id
    join fornecedores f on f.id = b.fornecedor_id
    join classificacao_detalhada cd on cd.id = b.classificacao_id
    cross join lateral (select case when p ->> 'ano_base' = 'EMISSAO' then extract(year from b.data_emissao)::int else b.empenho_ano end as ano) x
   where (filtro_ints(p, 'anos') is null or x.ano = any(filtro_ints(p, 'anos')))
     and classificacao_casa(cd, p)
   order by x.ano, coalesce(f.razao_social, f.nome_fantasia), c.numero, b.data_emissao, b.numero
$$;

-- Totais do relatório completo: por ano e geral (as notas não se repetem)
create function public.relatorio_notas_totais(p jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'por_ano', coalesce((select jsonb_agg(jsonb_build_object('ano', ano, 'quantidade', qtd, 'valor', valor, 'pago', pago) order by ano)
                from (select ano, count(*) qtd, sum(valor) valor, sum(pago) pago from relatorio_notas(p) where not cancelada group by ano) t), '[]'),
    'quantidade', (select count(*) from relatorio_notas(p) where not cancelada),
    'valor', coalesce((select sum(valor) from relatorio_notas(p) where not cancelada), 0),
    'pago', coalesce((select sum(pago) from relatorio_notas(p) where not cancelada), 0)
  )
$$;

-- =====================================================================
-- Relatório resumido de consumo por contrato e classificação
--   p: mesmos filtros + metrica: 'NOTAS' (padrão) | 'PAGO' | 'EMPENHADO'; detalhar: ['SUBELEMENTO','FONTE']
-- =====================================================================

create function public.relatorio_consumo(p jsonb) returns table (
  ano int, fornecedor_nome text, contrato_id uuid, contrato_numero text, contrato_objeto text,
  acao_codigo text, acao_descricao text, elemento_codigo text, elemento_descricao text,
  subelemento text, fonte text, valor numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_metrica text := coalesce(nullif(p ->> 'metrica', ''), 'NOTAS');
  v_sub boolean := coalesce(p -> 'detalhar' ? 'SUBELEMENTO', false);
  v_fonte boolean := coalesce(p -> 'detalhar' ? 'FONTE', false);
begin
  if v_metrica not in ('NOTAS', 'PAGO', 'EMPENHADO') then
    raise exception 'Métrica inválida.' using errcode = 'check_violation';
  end if;
  if v_metrica = 'EMPENHADO' then
    return query
      select e.ano, coalesce(f.razao_social, f.nome_fantasia), c.id, c.numero, c.objeto,
             cd.acao_codigo, cd.acao_descricao, cd.elemento_codigo, cd.elemento_descricao,
             case when v_sub then nullif(concat_ws(' – ', cd.subelemento_codigo, cd.subelemento_descricao), '') end,
             case when v_fonte then concat_ws(' – ', cd.fonte_codigo, cd.fonte_descricao) end,
             sum(e.valor + coalesce((select sum(r.valor) from empenho_reforcos r where r.empenho_id = e.id and r.cancelado_em is null), 0))
        from empenhos e
        join contratos c on c.id = e.contrato_id
        join fornecedores f on f.id = e.fornecedor_id
        join classificacao_detalhada cd on cd.id = e.classificacao_id
       where e.tenant_id = (p ->> 'tenant_id')::uuid and e.ativo
         and (pode(e.tenant_id, e.unidade_id, 'relatorios', 'ler') or designado(e.contrato_id))
         and (filtro_ints(p, 'anos') is null or e.ano = any(filtro_ints(p, 'anos')))
         and (filtro_ids(p, 'contratos') is null or e.contrato_id = any(filtro_ids(p, 'contratos')))
         and (filtro_ids(p, 'fornecedores') is null or e.fornecedor_id = any(filtro_ids(p, 'fornecedores')))
         and classificacao_casa(cd, p)
       group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
       order by 1, 2, 4, 6, 8;
  else
    return query
      select r.ano, r.fornecedor_nome, r.contrato_id, r.contrato_numero, r.contrato_objeto,
             r.acao_codigo, r.acao_descricao, r.elemento_codigo, r.elemento_descricao,
             case when v_sub then nullif(concat_ws(' – ', r.subelemento_codigo, r.subelemento_descricao), '') end,
             case when v_fonte then concat_ws(' – ', r.fonte_codigo, r.fonte_descricao) end,
             sum(case when v_metrica = 'PAGO' then r.pago else r.valor end)
        from relatorio_notas(p - 'incluir_canceladas') r
       where not r.cancelada
       group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
       order by 1, 2, 4, 6, 8;
  end if;
end $$;

-- Anos com movimento (para o filtro de anos)
create function public.anos_com_movimento(p_tenant uuid) returns int[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct a order by a desc), '{}') from (
    select ano as a from empenhos where tenant_id = p_tenant
    union select extract(year from data_emissao)::int from notas_fiscais where tenant_id = p_tenant
  ) x
$$;

-- =====================================================================
-- Ordens de serviço (número NNNN/ANO por órgão)
-- =====================================================================

create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  unidade_id uuid not null references public.unidades_organizacionais(id),
  numero int not null,
  ano int not null,
  data_abertura date not null default (now() at time zone 'America/Sao_Paulo')::date,
  titulo text not null check (length(btrim(titulo)) between 3 and 200),
  descricao text,
  contrato_id uuid references public.contratos(id),
  tipo_servico_id uuid references public.tipos_servico(id),
  responsavel_id uuid references public.servidores(id),
  prioridade text not null default 'MEDIA' check (prioridade in ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
  status text not null default 'ABERTA' check (status in ('ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
  previsao date,
  data_conclusao date,
  observacoes text,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  unique (tenant_id, ano, numero)
);
create index os_tenant_status on public.ordens_servico (tenant_id, status, ano desc, numero desc);

create table public.os_unidades (
  os_id uuid not null references public.ordens_servico(id),
  unidade_atendida_id uuid not null references public.unidades_atendidas(id),
  tenant_id uuid not null references public.tenants(id),
  primary key (os_id, unidade_atendida_id)
);

create function public.prepara_os() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from unidades_organizacionais where id = new.unidade_id and tenant_id = new.tenant_id) then
    raise exception 'A unidade responsável não pertence a este órgão.' using errcode = 'check_violation', hint = 'unidade_id';
  end if;
  if new.contrato_id is not null and not exists (select 1 from contratos where id = new.contrato_id and tenant_id = new.tenant_id) then
    raise exception 'Contrato não encontrado neste órgão.' using errcode = 'check_violation', hint = 'contrato_id';
  end if;
  if new.responsavel_id is not null and not exists (select 1 from servidores where id = new.responsavel_id and tenant_id = new.tenant_id) then
    raise exception 'O responsável não é servidor deste órgão.' using errcode = 'check_violation', hint = 'responsavel_id';
  end if;
  if tg_op = 'INSERT' then
    new.ano := extract(year from new.data_abertura)::int;
    -- numeração sequencial por órgão e ano, sem colisão entre lançamentos simultâneos
    perform pg_advisory_xact_lock(hashtext('os:' || new.tenant_id || ':' || new.ano));
    select coalesce(max(numero), 0) + 1 into new.numero from ordens_servico where tenant_id = new.tenant_id and ano = new.ano;
    new.status := 'ABERTA';
  else
    if new.numero <> old.numero or new.ano <> old.ano then
      raise exception 'O número da OS não pode ser alterado.' using errcode = 'check_violation';
    end if;
    if old.status in ('CONCLUIDA', 'CANCELADA') and new.status <> old.status then
      raise exception 'OS % não pode mudar de situação.', lower(old.status) using errcode = 'check_violation';
    end if;
    if new.status = 'CANCELADA' and old.status <> 'CANCELADA' then
      if coalesce(length(btrim(coalesce(new.motivo_cancelamento, justificativa_atual()))), 0) < 5 then
        raise exception 'Informe o motivo do cancelamento (mínimo de 5 caracteres).' using errcode = 'check_violation', hint = 'justificativa';
      end if;
      new.motivo_cancelamento := coalesce(new.motivo_cancelamento, justificativa_atual());
    end if;
    if new.status = 'CONCLUIDA' and old.status <> 'CONCLUIDA' then
      new.data_conclusao := coalesce(new.data_conclusao, hoje());
    end if;
  end if;
  return new;
end $$;

create function public.herda_os() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select tenant_id into new.tenant_id from ordens_servico where id = new.os_id;
  if not exists (select 1 from unidades_atendidas where id = new.unidade_atendida_id and tenant_id = new.tenant_id) then
    raise exception 'Unidade atendida não encontrada neste órgão.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger os_prepara before insert or update on public.ordens_servico for each row execute function public.prepara_os();
create trigger os_criacao before insert on public.ordens_servico for each row execute function public.carimbar_criacao();
create trigger os_carimbar before update on public.ordens_servico for each row execute function public.carimbar();
create trigger os_tenant before update on public.ordens_servico for each row execute function public.bloquear_troca_tenant();
create trigger os_auditar after insert or update or delete on public.ordens_servico for each row execute function public.auditar();
create trigger os_unidades_herda before insert on public.os_unidades for each row execute function public.herda_os();
create trigger os_unidades_auditar after insert or delete on public.os_unidades for each row execute function public.auditar();

alter table public.ordens_servico enable row level security;
alter table public.os_unidades enable row level security;
create policy os_ler on public.ordens_servico for select to authenticated using (pode(tenant_id, unidade_id, 'ordens_servico', 'ler'));
create policy os_criar on public.ordens_servico for insert to authenticated with check (pode(tenant_id, unidade_id, 'ordens_servico', 'criar'));
create policy os_editar on public.ordens_servico for update to authenticated
  using (pode(tenant_id, unidade_id, 'ordens_servico', 'editar')) with check (pode(tenant_id, unidade_id, 'ordens_servico', 'editar'));

create function public.pode_os(p_os uuid, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ordens_servico o where o.id = p_os and pode(o.tenant_id, o.unidade_id, 'ordens_servico', p_acao))
$$;
create policy os_unidades_ler on public.os_unidades for select to authenticated using (pode_os(os_id, 'ler'));
create policy os_unidades_incluir on public.os_unidades for insert to authenticated with check (pode_os(os_id, 'editar') or pode_os(os_id, 'criar'));
create policy os_unidades_remover on public.os_unidades for delete to authenticated using (pode_os(os_id, 'editar'));

revoke all on public.ordens_servico, public.os_unidades from anon;
revoke delete on public.ordens_servico from authenticated;
revoke update on public.ordens_servico from authenticated;
grant update (data_abertura, titulo, descricao, contrato_id, tipo_servico_id, responsavel_id, prioridade, status, previsao, data_conclusao, observacoes, motivo_cancelamento, unidade_id)
  on public.ordens_servico to authenticated;

-- =====================================================================
-- Painel gerencial (agregações no banco, respeitando o escopo de quem consulta)
-- =====================================================================

create function public.painel(p_tenant uuid, p_ano int default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with ct as (select * from v_contratos where tenant_id = p_tenant and ativo),
       em as (select * from v_empenhos where tenant_id = p_tenant and ativo and (p_ano is null or ano = p_ano)),
       nf as (select * from v_notas where tenant_id = p_tenant and cancelada_em is null
                and (p_ano is null or empenho_ano = p_ano))
  select jsonb_build_object(
    'contratos', jsonb_build_object(
      'vigentes', (select count(*) from ct where situacao in ('VIGENTE', 'A_VENCER')),
      'a_vencer', (select count(*) from ct where situacao = 'A_VENCER'),
      'vencidos', (select count(*) from ct where situacao = 'VENCIDO'),
      'nao_iniciados', (select count(*) from ct where situacao = 'NAO_INICIADO'),
      'valor_vigentes', coalesce((select sum(valor_atual) from ct where situacao in ('VIGENTE', 'A_VENCER')), 0),
      'saldo_vigentes', coalesce((select sum(saldo) from ct where situacao in ('VIGENTE', 'A_VENCER')), 0)),
    'empenhos', jsonb_build_object(
      'quantidade', (select count(*) from em),
      'empenhado', coalesce((select sum(valor_total) from em), 0),
      'utilizado', coalesce((select sum(utilizado) from em), 0),
      'saldo', coalesce((select sum(saldo) from em), 0),
      'saldo_baixo', (select count(*) from em where valor_total > 0 and saldo / valor_total < 0.10)),
    'notas', jsonb_build_object(
      'quantidade', (select count(*) from nf),
      'valor', coalesce((select sum(valor) from nf), 0),
      'pago', coalesce((select sum(pago) from nf), 0),
      'pendentes_atesto', (select count(*) from nf where status_atesto = 'PENDENTE'),
      'pendentes_pagamento', (select count(*) from nf where status_atesto = 'ATESTADA' and status_pagamento in ('PENDENTE', 'PARCIAL')),
      'atestadas', (select count(*) from nf where status_atesto = 'ATESTADA')),
    'cadastros', jsonb_build_object(
      'fornecedores_ativos', case when pode(p_tenant, null, 'fornecedores', 'ler') then (select count(*) from fornecedores where tenant_id = p_tenant and ativo) end,
      'servidores_ativos', (select count(*) from servidores s where s.tenant_id = p_tenant and pode(s.tenant_id, s.unidade_id, 'servidores', 'ler')
                              and (s.data_exoneracao is null or s.data_exoneracao > hoje())),
      'servidores_exonerados', (select count(*) from servidores s where s.tenant_id = p_tenant and pode(s.tenant_id, s.unidade_id, 'servidores', 'ler')
                              and s.data_exoneracao <= hoje()),
      'unidades_atendidas', case when pode(p_tenant, null, 'unidades', 'ler') then (select count(*) from unidades_atendidas where tenant_id = p_tenant and ativo) end,
      'os_abertas', (select count(*) from ordens_servico o where o.tenant_id = p_tenant and o.status in ('ABERTA', 'EM_ANDAMENTO')
                       and pode(o.tenant_id, o.unidade_id, 'ordens_servico', 'ler'))),
    'mensal', coalesce((select jsonb_agg(jsonb_build_object('mes', m, 'notas', coalesce(v, 0)) order by m)
                 from generate_series(1, 12) m
                 left join (select extract(month from data_emissao)::int mes, sum(valor) v from nf
                             where extract(year from data_emissao) = coalesce(p_ano, extract(year from hoje())) group by 1) t on t.mes = m), '[]'),
    'por_acao', coalesce((select jsonb_agg(x order by x.valor desc) from (
                 select cd.acao_codigo as codigo, cd.acao_descricao as descricao, sum(n.valor) as valor
                   from nf n join empenhos e on e.id = n.empenho_id join classificacao_detalhada cd on cd.id = e.classificacao_id
                  group by 1, 2 order by 3 desc limit 8) x), '[]'),
    'vencendo', coalesce((select jsonb_agg(x order by x.data_fim_atual) from (
                 select id, numero, fornecedor_nome, data_fim_atual, dias_para_vencer, saldo from ct
                  where situacao = 'A_VENCER' order by data_fim_atual limit 6) x), '[]'),
    'ano', coalesce(p_ano, extract(year from hoje())::int)
  )
$$;

-- =====================================================================
-- Notificações (calculadas na hora, sempre no escopo de quem pede)
-- =====================================================================

create function public.minhas_notificacoes(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.ordem, x.titulo), '[]') from (
    select 1 as ordem, 'ATESTO' as tipo, 'alta' as severidade,
           'NF ' || n.numero || ' aguarda o seu atesto' as titulo,
           n.fornecedor_nome || ' · Contrato ' || n.contrato_numero || ' · ' || brl(n.valor) as descricao,
           '/notas?ver=' || n.id as link
      from v_notas n where n.tenant_id = p_tenant and n.sou_designado and n.status_atesto = 'PENDENTE' and n.cancelada_em is null
    union all
    select 2, 'VENCIMENTO', case when c.dias_para_vencer <= 15 then 'alta' else 'media' end,
           'Contrato ' || c.numero || ' vence em ' || c.dias_para_vencer || ' dia(s)',
           c.fornecedor_nome || ' · até ' || to_char(c.data_fim_atual, 'DD/MM/YYYY'), '/contratos/' || c.id
      from v_contratos c where c.tenant_id = p_tenant and c.ativo and c.situacao = 'A_VENCER'
    union all
    select 3, 'PAGAMENTO', 'media', 'NF ' || n.numero || ' atestada aguardando pagamento',
           n.fornecedor_nome || ' · falta ' || brl(n.valor - n.pago), '/notas?ver=' || n.id
      from v_notas n where n.tenant_id = p_tenant and n.status_atesto = 'ATESTADA' and n.status_pagamento in ('PENDENTE', 'PARCIAL')
       and pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'editar')
    union all
    select 4, 'SALDO', 'media', 'Empenho ' || e.numero || '/' || e.ano || ' com saldo baixo',
           'Saldo ' || brl(e.saldo) || ' de ' || brl(e.valor_total) || ' · Contrato ' || e.contrato_numero, '/empenhos?ver=' || e.id
      from v_empenhos e where e.tenant_id = p_tenant and e.ativo and e.valor_total > 0 and e.saldo / e.valor_total < 0.10
       and pode(e.tenant_id, e.unidade_id, 'empenhos', 'editar')
    limit 50
  ) x
$$;

-- =====================================================================
-- Importação (prévia + gravação tudo ou nada) e registro de exportação
--   p_linhas: [{linha, ...campos}]; p_aplicar=false só valida; true grava (exige zero erros)
-- =====================================================================

create function public.importar_fornecedores(p_tenant uuid, p_linhas jsonb, p_aplicar boolean default false, p_ignorar_duplicados boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l jsonb; v_doc text; v_tipo text; erros jsonb := '[]'; dups jsonb := '[]'; validos jsonb := '[]';
  vistos text[] := '{}'; v_n int;
begin
  if not pode(p_tenant, null, 'fornecedores', 'criar') then
    raise exception 'Você não tem permissão para importar fornecedores.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Importe no máximo 5.000 linhas por vez.' using errcode = 'check_violation'; end if;
  for l in select * from jsonb_array_elements(p_linhas) loop
    v_doc := regexp_replace(coalesce(l ->> 'documento', ''), '\D', '', 'g');
    v_tipo := case when length(v_doc) = 11 then 'PF' else 'PJ' end;
    if (v_tipo = 'PJ' and not cnpj_valido(v_doc)) or (v_tipo = 'PF' and not cpf_valido(v_doc)) then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'documento', 'mensagem', 'CNPJ/CPF inválido: ' || coalesce(l ->> 'documento', '(vazio)'));
    elsif coalesce(length(btrim(l ->> 'razao_social')), 0) < 2 then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'razao_social', 'mensagem', 'Razão social/nome vazio.');
    elsif v_doc = any(vistos) then
      dups := dups || jsonb_build_object('linha', l -> 'linha', 'documento', v_doc, 'motivo', 'Repetido no próprio arquivo');
    elsif exists (select 1 from fornecedores where tenant_id = p_tenant and documento = v_doc) then
      dups := dups || jsonb_build_object('linha', l -> 'linha', 'documento', v_doc, 'motivo', 'Já cadastrado: ' || (select razao_social from fornecedores where tenant_id = p_tenant and documento = v_doc));
    else
      validos := validos || (l || jsonb_build_object('documento', v_doc, 'tipo_pessoa', v_tipo));
    end if;
    vistos := vistos || v_doc;
  end loop;
  if p_aplicar then
    if jsonb_array_length(erros) > 0 then raise exception 'Corrija as % linha(s) com erro antes de importar.', jsonb_array_length(erros) using errcode = 'check_violation'; end if;
    if jsonb_array_length(dups) > 0 and not p_ignorar_duplicados then
      raise exception 'Há % duplicado(s). Confirme para ignorá-los.', jsonb_array_length(dups) using errcode = 'check_violation';
    end if;
    insert into fornecedores (tenant_id, tipo_pessoa, documento, razao_social, nome_fantasia, email, telefone, cep, logradouro, numero, bairro, cidade, uf, nome_contato)
    select p_tenant, x ->> 'tipo_pessoa', x ->> 'documento', btrim(x ->> 'razao_social'), nullif(btrim(x ->> 'nome_fantasia'), ''),
           nullif(lower(btrim(x ->> 'email')), ''), nullif(regexp_replace(coalesce(x ->> 'telefone', ''), '\D', '', 'g'), ''),
           nullif(regexp_replace(coalesce(x ->> 'cep', ''), '\D', '', 'g'), ''), nullif(btrim(x ->> 'logradouro'), ''), nullif(btrim(x ->> 'numero'), ''),
           nullif(btrim(x ->> 'bairro'), ''), nullif(btrim(x ->> 'cidade'), ''), nullif(upper(btrim(x ->> 'uf')), ''), nullif(btrim(x ->> 'nome_contato'), '')
      from jsonb_array_elements(validos) x;
    get diagnostics v_n = row_count;
    perform registrar_auditoria(p_tenant, 'fornecedores', null, 'IMPORTACAO', null,
      jsonb_build_object('inseridos', v_n, 'duplicados_ignorados', jsonb_array_length(dups)));
  end if;
  return jsonb_build_object('total', jsonb_array_length(p_linhas), 'validos', jsonb_array_length(validos), 'duplicados', dups, 'erros', erros, 'aplicado', p_aplicar);
end $$;

create function public.importar_unidades_atendidas(p_tenant uuid, p_linhas jsonb, p_aplicar boolean default false, p_ignorar_duplicados boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jsonb; erros jsonb := '[]'; dups jsonb := '[]'; validos jsonb := '[]'; vistos text[] := '{}'; v_nome text; v_n int;
begin
  if not pode(p_tenant, null, 'unidades', 'criar') then
    raise exception 'Você não tem permissão para importar unidades.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Importe no máximo 5.000 linhas por vez.' using errcode = 'check_violation'; end if;
  for l in select * from jsonb_array_elements(p_linhas) loop
    v_nome := btrim(coalesce(l ->> 'nome', ''));
    if length(v_nome) < 2 then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'nome', 'mensagem', 'Nome vazio.');
    elsif lower(v_nome) = any(vistos) then
      dups := dups || jsonb_build_object('linha', l -> 'linha', 'documento', v_nome, 'motivo', 'Repetida no próprio arquivo');
    elsif exists (select 1 from unidades_atendidas where tenant_id = p_tenant and lower(btrim(nome)) = lower(v_nome)) then
      dups := dups || jsonb_build_object('linha', l -> 'linha', 'documento', v_nome, 'motivo', 'Já cadastrada');
    else
      validos := validos || l;
    end if;
    vistos := vistos || lower(v_nome);
  end loop;
  if p_aplicar then
    if jsonb_array_length(erros) > 0 then raise exception 'Corrija as % linha(s) com erro antes de importar.', jsonb_array_length(erros) using errcode = 'check_violation'; end if;
    if jsonb_array_length(dups) > 0 and not p_ignorar_duplicados then
      raise exception 'Há % duplicado(s). Confirme para ignorá-los.', jsonb_array_length(dups) using errcode = 'check_violation';
    end if;
    insert into unidades_atendidas (tenant_id, nome, sigla, tipo, codigo, bairro, logradouro, cidade, uf, telefone, email)
    select p_tenant, btrim(x ->> 'nome'), nullif(btrim(x ->> 'sigla'), ''), coalesce(nullif(btrim(x ->> 'tipo'), ''), 'UNIDADE'),
           nullif(btrim(x ->> 'codigo'), ''), nullif(btrim(x ->> 'bairro'), ''), nullif(btrim(x ->> 'endereco'), ''),
           nullif(btrim(x ->> 'cidade'), ''), nullif(upper(btrim(x ->> 'uf')), ''),
           nullif(regexp_replace(coalesce(x ->> 'telefone', ''), '\D', '', 'g'), ''), nullif(lower(btrim(x ->> 'email')), '')
      from jsonb_array_elements(validos) x;
    get diagnostics v_n = row_count;
    perform registrar_auditoria(p_tenant, 'unidades_atendidas', null, 'IMPORTACAO', null,
      jsonb_build_object('inseridos', v_n, 'duplicados_ignorados', jsonb_array_length(dups)));
  end if;
  return jsonb_build_object('total', jsonb_array_length(p_linhas), 'validos', jsonb_array_length(validos), 'duplicados', dups, 'erros', erros, 'aplicado', p_aplicar);
end $$;

-- Servidores: a lotação vem pela sigla ou nome da unidade; respeita o escopo de quem importa
create function public.importar_servidores(p_tenant uuid, p_linhas jsonb, p_aplicar boolean default false, p_ignorar_duplicados boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jsonb; erros jsonb := '[]'; dups jsonb := '[]'; validos jsonb := '[]'; vistos text[] := '{}';
        v_mat text; v_unid uuid; v_n int := 0; v_cpf text; v_sens boolean; x jsonb; v_id uuid;
begin
  if not pode(p_tenant, null, 'servidores', 'criar') then
    raise exception 'Você não tem permissão para importar servidores.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Importe no máximo 5.000 linhas por vez.' using errcode = 'check_violation'; end if;
  for l in select * from jsonb_array_elements(p_linhas) loop
    v_mat := btrim(coalesce(l ->> 'matricula', ''));
    v_cpf := nullif(regexp_replace(coalesce(l ->> 'cpf', ''), '\D', '', 'g'), '');
    select u.id into v_unid from unidades_organizacionais u
     where u.tenant_id = p_tenant and u.ativo
       and (lower(u.sigla) = lower(btrim(l ->> 'unidade')) or lower(u.nome) = lower(btrim(l ->> 'unidade')))
     order by (lower(u.sigla) = lower(btrim(l ->> 'unidade'))) desc nulls last limit 1;
    if coalesce(length(btrim(l ->> 'nome')), 0) < 3 then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'nome', 'mensagem', 'Nome vazio ou curto.');
    elsif v_mat = '' then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'matricula', 'mensagem', 'Matrícula vazia.');
    elsif v_unid is null then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'unidade', 'mensagem', 'Unidade não encontrada: ' || coalesce(l ->> 'unidade', '(vazio)') || ' (use a sigla da Estrutura).');
    elsif not pode(p_tenant, v_unid, 'servidores', 'criar') then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'unidade', 'mensagem', 'Unidade fora do seu escopo: ' || (l ->> 'unidade'));
    elsif v_cpf is not null and not cpf_valido(v_cpf) then
      erros := erros || jsonb_build_object('linha', l -> 'linha', 'campo', 'cpf', 'mensagem', 'CPF inválido.');
    elsif lower(v_mat) = any(vistos) then
      dups := dups || jsonb_build_object('linha', l -> 'linha', 'documento', v_mat, 'motivo', 'Matrícula repetida no próprio arquivo');
    elsif exists (select 1 from servidores where tenant_id = p_tenant and lower(btrim(matricula)) = lower(v_mat)) then
      dups := dups || jsonb_build_object('linha', l -> 'linha', 'documento', v_mat, 'motivo', 'Matrícula já cadastrada');
    else
      validos := validos || (l || jsonb_build_object('unidade_id', v_unid, 'cpf', v_cpf));
    end if;
    vistos := vistos || lower(v_mat);
  end loop;
  if p_aplicar then
    if jsonb_array_length(erros) > 0 then raise exception 'Corrija as % linha(s) com erro antes de importar.', jsonb_array_length(erros) using errcode = 'check_violation'; end if;
    if jsonb_array_length(dups) > 0 and not p_ignorar_duplicados then
      raise exception 'Há % duplicado(s). Confirme para ignorá-los.', jsonb_array_length(dups) using errcode = 'check_violation';
    end if;
    for x in select * from jsonb_array_elements(validos) loop
      insert into servidores (tenant_id, unidade_id, nome, matricula, cargo, funcao, email_institucional, telefone, data_nomeacao)
      values (p_tenant, (x ->> 'unidade_id')::uuid, btrim(x ->> 'nome'), btrim(x ->> 'matricula'), nullif(btrim(x ->> 'cargo'), ''),
              nullif(btrim(x ->> 'funcao'), ''), nullif(lower(btrim(x ->> 'email')), ''), nullif(regexp_replace(coalesce(x ->> 'telefone', ''), '\D', '', 'g'), ''),
              nullif(x ->> 'data_nomeacao', '')::date)
      returning id into v_id;
      v_sens := pode(p_tenant, (x ->> 'unidade_id')::uuid, 'servidores_sensiveis', 'criar');
      if v_sens and (x ->> 'cpf' is not null or nullif(x ->> 'data_nascimento', '') is not null) then
        insert into servidores_dados_pessoais (servidor_id, tenant_id, cpf, data_nascimento)
        values (v_id, p_tenant, x ->> 'cpf', nullif(x ->> 'data_nascimento', '')::date);
      end if;
      v_n := v_n + 1;
    end loop;
    perform registrar_auditoria(p_tenant, 'servidores', null, 'IMPORTACAO', null,
      jsonb_build_object('inseridos', v_n, 'duplicados_ignorados', jsonb_array_length(dups)));
  end if;
  return jsonb_build_object('total', jsonb_array_length(p_linhas), 'validos', jsonb_array_length(validos), 'duplicados', dups, 'erros', erros, 'aplicado', p_aplicar);
end $$;

create function public.registrar_exportacao(p_tenant uuid, p_recurso text, p_descricao text, p_quantidade int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (pode(p_tenant, null, p_recurso, 'exportar') or pode(p_tenant, null, 'relatorios', 'exportar')) then
    raise exception 'Você não tem permissão para exportar estes dados.' using errcode = 'insufficient_privilege';
  end if;
  perform registrar_auditoria(p_tenant, p_recurso, null, 'EXPORTACAO', null,
    jsonb_build_object('descricao', left(p_descricao, 300), 'quantidade', p_quantidade));
end $$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke all on public.classificacao_detalhada from anon, authenticated;

revoke execute on function
  public.filtro_ids(jsonb, text), public.filtro_ints(jsonb, text), public.classificacao_casa(classificacao_detalhada, jsonb),
  public.relatorio_notas(jsonb), public.relatorio_notas_totais(jsonb), public.relatorio_consumo(jsonb), public.anos_com_movimento(uuid),
  public.painel(uuid, int), public.minhas_notificacoes(uuid), public.prepara_os(), public.herda_os(), public.pode_os(uuid, text),
  public.importar_fornecedores(uuid, jsonb, boolean, boolean), public.importar_unidades_atendidas(uuid, jsonb, boolean, boolean),
  public.importar_servidores(uuid, jsonb, boolean, boolean), public.registrar_exportacao(uuid, text, text, int)
from public, anon;
revoke execute on function public.prepara_os(), public.herda_os() from authenticated;
grant execute on function
  public.filtro_ids(jsonb, text), public.filtro_ints(jsonb, text), public.classificacao_casa(classificacao_detalhada, jsonb),
  public.relatorio_notas(jsonb), public.relatorio_notas_totais(jsonb), public.relatorio_consumo(jsonb), public.anos_com_movimento(uuid),
  public.painel(uuid, int), public.minhas_notificacoes(uuid), public.pode_os(uuid, text),
  public.importar_fornecedores(uuid, jsonb, boolean, boolean), public.importar_unidades_atendidas(uuid, jsonb, boolean, boolean),
  public.importar_servidores(uuid, jsonb, boolean, boolean), public.registrar_exportacao(uuid, text, text, int)
to authenticated;
