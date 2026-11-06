-- Dotação orçamentária do ENTE (município), cadastrada pela plataforma (módulo do desenvolvedor).
--
-- Antes: cada órgão (tenant) tinha a sua própria classificação, cadastrada pelo Master do órgão.
-- Agora: a classificação pertence ao ente (ex.: Município de Aracaju) e é compartilhada pelos órgãos
-- dele (Prefeitura, SMS e demais). Só a plataforma grava. Cada Unidade Orçamentária indica quais
-- órgãos a usam (ex.: 18401 Fundo Municipal de Saúde → SMS); sem indicação, vale para todos do ente.
-- Campos conforme a nota de empenho do órgão: UO, função, subfunção, programa, ação, natureza da
-- despesa (8 dígitos), subelemento, fonte, código de acompanhamento (CO), IdUso, IDoc,
-- indicador de resultado primário e subfonte.

-- =====================================================================
-- Ente (município) e vínculo dos órgãos
-- =====================================================================

create table public.entes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 3 and 200),
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  cnpj text check (cnpj ~ '^[0-9]{14}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index entes_nome_unico on public.entes (lower(btrim(nome)));
create trigger entes_criacao before insert on public.entes for each row execute function public.carimbar_criacao();
create trigger entes_carimbar before update on public.entes for each row execute function public.carimbar();
create trigger entes_auditar after insert or update or delete on public.entes for each row execute function public.auditar();

alter table public.tenants add column ente_id uuid references public.entes(id);
create index tenants_ente on public.tenants (ente_id);

-- Só a plataforma liga ou troca o ente de um órgão (o Master edita os dados do órgão, mas não isto)
create function public.protege_ente_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ente_id is distinct from (case when tg_op = 'UPDATE' then old.ente_id end)
     and auth.uid() is not null and not eh_admin_plataforma() then
    raise exception 'Só a plataforma pode vincular o órgão a um ente.' using errcode = 'insufficient_privilege', hint = 'ente_id';
  end if;
  return new;
end $$;
create trigger tenants_ente before insert or update of ente_id on public.tenants for each row execute function public.protege_ente_tenant();

alter table public.entes enable row level security;
create policy entes_ler on public.entes for select to authenticated
  using ((select eh_admin_plataforma()) or id in (select t.ente_id from tenants t join vinculos v on v.tenant_id = t.id where v.user_id = auth.uid() and v.ativo));
create policy entes_criar on public.entes for insert to authenticated with check ((select eh_admin_plataforma()));
create policy entes_editar on public.entes for update to authenticated using ((select eh_admin_plataforma())) with check ((select eh_admin_plataforma()));
revoke all on public.entes from anon;
revoke delete on public.entes from authenticated;

-- Entes cujo catálogo orçamentário a pessoa consulta: o orçamento é informação pública,
-- então qualquer membro de um órgão do ente lê (a escrita é só da plataforma)
create function public.entes_do_usuario() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct t.ente_id from vinculos v join tenants t on t.id = v.tenant_id and t.ativo
   where v.user_id = auth.uid() and v.ativo and t.ente_id is not null
$$;

-- =====================================================================
-- Novos campos da classificação (conforme a nota de empenho)
-- =====================================================================

insert into public.classificador_tipos (codigo, nome, pai_tipo, pai_obrigatorio, ordem) values
  ('SUBFONTE', 'Subfonte', null, false, 135),
  ('CODIGO_ACOMPANHAMENTO', 'Código de Acompanhamento (CO)', null, false, 140),
  ('ID_USO', 'Identificador de Uso (IdUso)', null, false, 150),
  ('IDOC', 'Identificador de Doação e Operação de Crédito (IDoc)', null, false, 160),
  ('RESULTADO_PRIMARIO', 'Indicador de Resultado Primário', null, false, 170);
update public.classificador_tipos set nome = 'Natureza da Despesa / Elemento' where codigo = 'ELEMENTO';

-- =====================================================================
-- Catálogo passa do órgão para o ente
-- =====================================================================

-- dependências da coluna tenant_id (recriadas abaixo)
drop function public.classificacao_casa(public.classificacao_detalhada, jsonb);
drop view public.classificacao_detalhada;
drop policy classificadores_ler on public.classificadores;
drop policy classificadores_criar on public.classificadores;
drop policy classificadores_editar on public.classificadores;
drop policy classificacoes_ler on public.classificacoes_orcamentarias;
drop policy classificacoes_criar on public.classificacoes_orcamentarias;
drop policy classificacoes_editar on public.classificacoes_orcamentarias;
drop trigger classificadores_tenant on public.classificadores;
drop trigger classificacoes_orcamentarias_tenant on public.classificacoes_orcamentarias;
drop trigger classificadores_inativar on public.classificadores;
drop trigger classificacoes_inativar on public.classificacoes_orcamentarias;
drop index public.classificadores_codigo_unico;
drop index public.classificadores_tipo;
drop index public.classificacoes_combinacao_unica;

alter table public.classificadores add column ente_id uuid references public.entes(id);
alter table public.classificacoes_orcamentarias add column ente_id uuid references public.entes(id),
  add column subfonte_id uuid references public.classificadores(id),
  add column codigo_acompanhamento_id uuid references public.classificadores(id),
  add column id_uso_id uuid references public.classificadores(id),
  add column idoc_id uuid references public.classificadores(id),
  add column resultado_primario_id uuid references public.classificadores(id);

-- Catálogo já existente em algum órgão: o órgão ganha (ou usa) um ente e o catálogo vai para ele
do $$
declare t record; e uuid;
begin
  for t in select x.tenant_id from (select tenant_id from classificadores union select tenant_id from classificacoes_orcamentarias) x loop
    select ente_id into e from tenants where id = t.tenant_id;
    if e is null then
      insert into entes (nome) select 'Ente de ' || nome_oficial from tenants where id = t.tenant_id returning id into e;
      update tenants set ente_id = e where id = t.tenant_id;
    end if;
    update classificadores set ente_id = e where tenant_id = t.tenant_id;
  end loop;
end $$;
alter table public.classificacoes_orcamentarias disable trigger user;
update public.classificacoes_orcamentarias d set ente_id = (select ente_id from tenants where id = d.tenant_id);
alter table public.classificacoes_orcamentarias enable trigger user;

alter table public.classificadores alter column ente_id set not null, drop column tenant_id;
alter table public.classificacoes_orcamentarias alter column ente_id set not null, drop column tenant_id;

create unique index classificadores_codigo_unico on public.classificadores
  (ente_id, tipo, coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);
create index classificadores_tipo on public.classificadores (ente_id, tipo, codigo);
create unique index classificacoes_combinacao_unica on public.classificacoes_orcamentarias (
  ente_id,
  coalesce(orgao_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(unidade_orcamentaria_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(funcao_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(subfuncao_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(programa_id, '00000000-0000-0000-0000-000000000000'::uuid),
  acao_id,
  coalesce(categoria_economica_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(gnd_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(modalidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
  elemento_id,
  coalesce(subelemento_id, '00000000-0000-0000-0000-000000000000'::uuid),
  fonte_id,
  coalesce(detalhamento_fonte_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(subfonte_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(codigo_acompanhamento_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(id_uso_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(idoc_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(resultado_primario_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index classificacoes_ente on public.classificacoes_orcamentarias (ente_id, codigo_completo);
create index classificacoes_uo on public.classificacoes_orcamentarias (unidade_orcamentaria_id);

-- Ente nunca muda depois de criado
create function public.bloquear_troca_ente() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ente_id is distinct from old.ente_id then
    raise exception 'O ente de um registro do catálogo orçamentário não pode ser alterado.' using errcode = 'check_violation', hint = 'ente_id';
  end if;
  return new;
end $$;
create trigger classificadores_ente before update on public.classificadores for each row execute function public.bloquear_troca_ente();
create trigger classificacoes_ente before update on public.classificacoes_orcamentarias for each row execute function public.bloquear_troca_ente();

create or replace function public.valida_classificador() returns trigger
language plpgsql security definer set search_path = public as $$
declare t classificador_tipos; p classificadores;
begin
  select * into t from classificador_tipos where codigo = new.tipo;
  if new.pai_id is null and t.pai_obrigatorio then
    raise exception '% exige o vínculo com %.', t.nome, (select nome from classificador_tipos where codigo = t.pai_tipo)
      using errcode = 'check_violation', hint = 'pai_id';
  end if;
  if new.pai_id is not null then
    select * into p from classificadores where id = new.pai_id;
    if p.id is null or p.ente_id <> new.ente_id then
      raise exception 'Classificador superior não encontrado neste ente.' using errcode = 'check_violation', hint = 'pai_id';
    end if;
    if t.pai_tipo is distinct from p.tipo then
      raise exception '% só pode ficar abaixo de %.', t.nome, coalesce((select nome from classificador_tipos where codigo = t.pai_tipo), 'nenhum classificador')
        using errcode = 'check_violation', hint = 'pai_id';
    end if;
  end if;
  if new.tipo = 'ACAO' and new.natureza_acao is null then
    new.natureza_acao := case left(new.codigo, 1) when '1' then 'PROJETO' when '2' then 'ATIVIDADE'
                                                  when '0' then 'OPERACAO_ESPECIAL' end;
  end if;
  if tg_op = 'UPDATE' and new.tipo <> old.tipo then
    raise exception 'O tipo de um classificador não pode ser alterado.' using errcode = 'check_violation', hint = 'tipo';
  end if;
  return new;
end $$;

create or replace function public.prepara_classificacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  campos text[] := array['orgao_id:ORGAO', 'unidade_orcamentaria_id:UNIDADE_ORCAMENTARIA', 'funcao_id:FUNCAO',
    'subfuncao_id:SUBFUNCAO', 'programa_id:PROGRAMA', 'acao_id:ACAO', 'categoria_economica_id:CATEGORIA_ECONOMICA',
    'gnd_id:GND', 'modalidade_id:MODALIDADE', 'elemento_id:ELEMENTO', 'subelemento_id:SUBELEMENTO',
    'fonte_id:FONTE', 'detalhamento_fonte_id:DETALHAMENTO_FONTE', 'subfonte_id:SUBFONTE',
    'codigo_acompanhamento_id:CODIGO_ACOMPANHAMENTO', 'id_uso_id:ID_USO', 'idoc_id:IDOC', 'resultado_primario_id:RESULTADO_PRIMARIO'];
  par text; col text; tipo_esperado text; v_id uuid; c classificadores;
  linha jsonb;
  cod jsonb := '{}'; des text := ''; natureza text;
begin
  linha := to_jsonb(new);
  foreach par in array campos loop
    col := split_part(par, ':', 1); tipo_esperado := split_part(par, ':', 2);
    v_id := (linha ->> col)::uuid;
    if v_id is not null then
      select * into c from classificadores where id = v_id;
      if c.id is null or c.ente_id <> new.ente_id then
        raise exception 'Classificador não encontrado neste ente.' using errcode = 'check_violation', hint = col;
      end if;
      if c.tipo <> tipo_esperado then
        raise exception 'O campo % recebeu um classificador do tipo errado.', col using errcode = 'check_violation', hint = col;
      end if;
      cod := cod || jsonb_build_object(tipo_esperado, c.codigo);
      des := des || ' ' || c.descricao;
    end if;
  end loop;
  if new.subelemento_id is not null and (select pai_id from classificadores where id = new.subelemento_id) <> new.elemento_id then
    raise exception 'O subelemento escolhido não pertence ao elemento de despesa.' using errcode = 'check_violation', hint = 'subelemento_id';
  end if;
  if new.detalhamento_fonte_id is not null and (select pai_id from classificadores where id = new.detalhamento_fonte_id) <> new.fonte_id then
    raise exception 'O detalhamento não pertence à fonte de recurso escolhida.' using errcode = 'check_violation', hint = 'detalhamento_fonte_id';
  end if;
  if (select pai_id from classificadores where id = new.acao_id) is not null then
    if new.programa_id is null then
      new.programa_id := (select pai_id from classificadores where id = new.acao_id);
      cod := cod || jsonb_build_object('PROGRAMA', (select codigo from classificadores where id = new.programa_id));
    elsif new.programa_id <> (select pai_id from classificadores where id = new.acao_id) then
      raise exception 'A ação não pertence ao programa escolhido.' using errcode = 'check_violation', hint = 'acao_id';
    end if;
  end if;
  if new.unidade_orcamentaria_id is not null and (select pai_id from classificadores where id = new.unidade_orcamentaria_id) is not null then
    if new.orgao_id is null then
      new.orgao_id := (select pai_id from classificadores where id = new.unidade_orcamentaria_id);
      cod := cod || jsonb_build_object('ORGAO', (select codigo from classificadores where id = new.orgao_id));
    elsif new.orgao_id <> (select pai_id from classificadores where id = new.unidade_orcamentaria_id) then
      raise exception 'A unidade orçamentária não pertence ao órgão escolhido.' using errcode = 'check_violation', hint = 'unidade_orcamentaria_id';
    end if;
  end if;
  -- natureza no formato da nota de empenho (33903914) quando categoria, GND e modalidade estão completos
  if cod ? 'CATEGORIA_ECONOMICA' and cod ? 'GND' and cod ? 'MODALIDADE'
     and (cod ->> 'CATEGORIA_ECONOMICA') ~ '^\d$' and (cod ->> 'GND') ~ '^\d$' and (cod ->> 'MODALIDADE') ~ '^\d{1,2}$'
     and (cod ->> 'ELEMENTO') ~ '^\d{1,2}$' and coalesce(cod ->> 'SUBELEMENTO', '0') ~ '^\d{1,2}$' then
    natureza := (cod ->> 'CATEGORIA_ECONOMICA') || (cod ->> 'GND') || lpad(cod ->> 'MODALIDADE', 2, '0')
             || lpad(cod ->> 'ELEMENTO', 2, '0') || lpad(coalesce(cod ->> 'SUBELEMENTO', '0'), 2, '0');
  else
    natureza := nullif(concat_ws('.', cod ->> 'CATEGORIA_ECONOMICA', cod ->> 'GND', cod ->> 'MODALIDADE', cod ->> 'ELEMENTO', cod ->> 'SUBELEMENTO'), '');
  end if;
  new.codigo_completo := concat_ws(' | ',
    nullif(concat_ws('.', cod ->> 'ORGAO', cod ->> 'UNIDADE_ORCAMENTARIA'), ''),
    nullif(concat_ws('.', cod ->> 'FUNCAO', cod ->> 'SUBFUNCAO', cod ->> 'PROGRAMA', cod ->> 'ACAO'), ''),
    natureza,
    'Fonte ' || concat_ws('.', cod ->> 'FONTE', cod ->> 'DETALHAMENTO_FONTE'));
  new.busca := lower(new.codigo_completo || ' ' || coalesce(natureza, '') || ' ' || des || ' ' || coalesce(new.descricao, ''));
  return new;
end $$;

create or replace function public.propaga_classificador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update classificacoes_orcamentarias set atualizado_em = now()
   where new.id in (orgao_id, unidade_orcamentaria_id, funcao_id, subfuncao_id, programa_id, acao_id,
                    categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id, detalhamento_fonte_id,
                    subfonte_id, codigo_acompanhamento_id, id_uso_id, idoc_id, resultado_primario_id);
  return null;
end $$;

-- Leitura: plataforma ou membro de um órgão do ente. Escrita: só a plataforma.
create policy classificadores_ler on public.classificadores for select to authenticated
  using ((select eh_admin_plataforma()) or ente_id in (select entes_do_usuario()));
create policy classificadores_criar on public.classificadores for insert to authenticated with check ((select eh_admin_plataforma()));
create policy classificadores_editar on public.classificadores for update to authenticated
  using ((select eh_admin_plataforma())) with check ((select eh_admin_plataforma()));
create policy classificacoes_ler on public.classificacoes_orcamentarias for select to authenticated
  using ((select eh_admin_plataforma()) or ente_id in (select entes_do_usuario()));
create policy classificacoes_criar on public.classificacoes_orcamentarias for insert to authenticated with check ((select eh_admin_plataforma()));
create policy classificacoes_editar on public.classificacoes_orcamentarias for update to authenticated
  using ((select eh_admin_plataforma())) with check ((select eh_admin_plataforma()));

-- A matriz deixa de dar escrita da classificação aos papéis do órgão (o banco já exige a plataforma)
delete from public.permissoes_papel where recurso = 'classificacoes' and acao not in ('ler', 'exportar');

-- =====================================================================
-- Unidade orçamentária → órgãos que a usam
-- =====================================================================

create table public.unidade_orcamentaria_orgaos (
  classificador_id uuid not null references public.classificadores(id),
  tenant_id uuid not null references public.tenants(id),
  criado_em timestamptz not null default now(), criado_por uuid,
  primary key (classificador_id, tenant_id)
);
create index uo_orgaos_tenant on public.unidade_orcamentaria_orgaos (tenant_id);

create function public.valida_uo_orgao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from classificadores c join tenants t on t.id = new.tenant_id and t.ente_id = c.ente_id
                  where c.id = new.classificador_id and c.tipo = 'UNIDADE_ORCAMENTARIA') then
    raise exception 'A unidade orçamentária e o órgão precisam ser do mesmo ente.' using errcode = 'check_violation', hint = 'tenant_id';
  end if;
  return new;
end $$;
create trigger uo_orgaos_valida before insert on public.unidade_orcamentaria_orgaos for each row execute function public.valida_uo_orgao();
create trigger uo_orgaos_criacao before insert on public.unidade_orcamentaria_orgaos for each row execute function public.carimbar_criacao();
create trigger uo_orgaos_auditar after insert or delete on public.unidade_orcamentaria_orgaos for each row execute function public.auditar();

alter table public.unidade_orcamentaria_orgaos enable row level security;
create policy uo_orgaos_ler on public.unidade_orcamentaria_orgaos for select to authenticated
  using ((select eh_admin_plataforma()) or tenant_id in (select v.tenant_id from vinculos v where v.user_id = auth.uid() and v.ativo));
create policy uo_orgaos_criar on public.unidade_orcamentaria_orgaos for insert to authenticated with check ((select eh_admin_plataforma()));
create policy uo_orgaos_excluir on public.unidade_orcamentaria_orgaos for delete to authenticated using ((select eh_admin_plataforma()));
revoke all on public.unidade_orcamentaria_orgaos from anon;
revoke update on public.unidade_orcamentaria_orgaos from authenticated;

-- A dotação pode ser usada pelo órgão? Mesmo ente e (sem UO, UO sem indicação ou UO indicada para o órgão)
create function public.dotacao_disponivel(p_dotacao uuid, p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from classificacoes_orcamentarias d join tenants t on t.id = p_tenant and t.ente_id = d.ente_id
     where d.id = p_dotacao
       and (d.unidade_orcamentaria_id is null
            or not exists (select 1 from unidade_orcamentaria_orgaos m where m.classificador_id = d.unidade_orcamentaria_id)
            or exists (select 1 from unidade_orcamentaria_orgaos m where m.classificador_id = d.unidade_orcamentaria_id and m.tenant_id = p_tenant)))
$$;

-- Contrato só recebe dotação ativa e disponível para o órgão dele
create or replace function public.prepara_dotacao_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from empenhos where contrato_id = old.contrato_id and classificacao_id = old.classificacao_id) then
      raise exception 'Esta dotação já é usada por empenho do contrato e não pode ser removida.' using errcode = 'check_violation', hint = 'classificacao_id';
    end if;
    return old;
  end if;
  select tenant_id into new.tenant_id from contratos where id = new.contrato_id;
  if not exists (select 1 from classificacoes_orcamentarias where id = new.classificacao_id and ativo)
     or not dotacao_disponivel(new.classificacao_id, new.tenant_id) then
    raise exception 'Dotação não encontrada, inativa ou não disponível para este órgão.' using errcode = 'check_violation', hint = 'classificacao_id';
  end if;
  return new;
end $$;

-- =====================================================================
-- Classificação "achatada" (interna, para relatórios)
-- =====================================================================

create view public.classificacao_detalhada as
select cl.id, cl.ente_id, cl.codigo_completo,
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
       cl.categoria_economica_id, cl.gnd_id, cl.modalidade_id, cl.elemento_id, cl.subelemento_id, cl.fonte_id, cl.detalhamento_fonte_id,
       sfo.codigo as subfonte_codigo, sfo.descricao as subfonte_descricao,
       co.codigo as co_codigo, co.descricao as co_descricao,
       iu.codigo as iduso_codigo, iu.descricao as iduso_descricao,
       idc.codigo as idoc_codigo, idc.descricao as idoc_descricao,
       rp.codigo as resultado_primario_codigo, rp.descricao as resultado_primario_descricao,
       cl.subfonte_id, cl.codigo_acompanhamento_id, cl.id_uso_id, cl.idoc_id, cl.resultado_primario_id,
       cl.descricao, cl.ativo
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
  left join classificadores df on df.id = cl.detalhamento_fonte_id
  left join classificadores sfo on sfo.id = cl.subfonte_id
  left join classificadores co on co.id = cl.codigo_acompanhamento_id
  left join classificadores iu on iu.id = cl.id_uso_id
  left join classificadores idc on idc.id = cl.idoc_id
  left join classificadores rp on rp.id = cl.resultado_primario_id;
revoke all on public.classificacao_detalhada from anon, authenticated;

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
     and (filtro_ids(p, 'subfontes') is null or c.subfonte_id = any(filtro_ids(p, 'subfontes')))
     and (filtro_ids(p, 'codigos_acompanhamento') is null or c.codigo_acompanhamento_id = any(filtro_ids(p, 'codigos_acompanhamento')))
$$;

-- =====================================================================
-- Consulta pelos órgãos: dotações disponíveis e classificadores do ente
-- =====================================================================

create function public.dotacoes_do_orgao(p_tenant uuid, p_busca text default null, p_situacao text default 'ATIVOS',
                                         p_limite int default 25, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select cd.*
      from classificacao_detalhada cd
      join classificacoes_orcamentarias d on d.id = cd.id
      join tenants t on t.id = p_tenant and t.ente_id = cd.ente_id
     where ((select eh_admin_plataforma()) or membro_do_tenant(p_tenant))
       and (cd.unidade_orcamentaria_id is null
            or not exists (select 1 from unidade_orcamentaria_orgaos m where m.classificador_id = cd.unidade_orcamentaria_id)
            or exists (select 1 from unidade_orcamentaria_orgaos m where m.classificador_id = cd.unidade_orcamentaria_id and m.tenant_id = p_tenant))
       and (p_situacao = 'TODOS' or cd.ativo = (p_situacao = 'ATIVOS'))
       and (nullif(btrim(p_busca), '') is null or d.busca like '%' || lower(btrim(p_busca)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'itens', coalesce((select jsonb_agg(to_jsonb(b) order by b.codigo_completo)
                         from (select * from base order by codigo_completo
                               limit least(greatest(p_limite, 1), 100) offset greatest(p_offset, 0)) b), '[]'))
$$;

create function public.buscar_classificadores(p_tenant uuid, p_tipo text, p_busca text default null, p_pai uuid default null, p_limite int default 30)
returns setof public.classificadores
language sql stable security definer set search_path = public as $$
  select c.* from classificadores c join tenants t on t.id = p_tenant and t.ente_id = c.ente_id
   where ((select eh_admin_plataforma()) or membro_do_tenant(p_tenant))
     and c.tipo = p_tipo and c.ativo
     and (p_pai is null or c.pai_id = p_pai)
     and (nullif(btrim(p_busca), '') is null or c.codigo ilike btrim(p_busca) || '%' or c.descricao ilike '%' || btrim(p_busca) || '%')
   order by c.codigo
   limit least(greatest(p_limite, 1), 100)
$$;

-- =====================================================================
-- Cadastro pela plataforma, no formato da nota de empenho
--   p: { ente_id, descricao, orgaos: [tenant_id...], campos: {
--        unidade_orcamentaria, orgao, funcao, subfuncao, programa, acao, natureza (8 dígitos), subelemento,
--        fonte, detalhamento_fonte, subfonte, codigo_acompanhamento, id_uso, idoc, resultado_primario
--        (cada um { codigo, descricao }) } }
-- Classificadores já existentes são reaproveitados pelo código; os novos exigem descrição.
-- =====================================================================

create function public.classificador_garantido(p_ente uuid, p_tipo text, p_codigo text, p_descricao text, p_pai uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; c text := nullif(btrim(p_codigo), '');
begin
  if c is null then return null; end if;
  select id into v from classificadores
   where ente_id = p_ente and tipo = p_tipo and codigo = c and pai_id is not distinct from p_pai;
  if v is null then
    if nullif(btrim(p_descricao), '') is null then
      raise exception 'Informe a descrição de % %.', (select lower(nome) from classificador_tipos where codigo = p_tipo), c
        using errcode = 'check_violation', hint = lower(p_tipo);
    end if;
    insert into classificadores (ente_id, tipo, codigo, descricao, pai_id) values (p_ente, p_tipo, c, btrim(p_descricao), p_pai) returning id into v;
  end if;
  return v;
end $$;

create function public.cadastrar_dotacao(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e uuid := (p ->> 'ente_id')::uuid;
  c jsonb := coalesce(p -> 'campos', '{}');
  nat text; sub text; o text;
  v_orgao uuid; v_uo uuid; v_fun uuid; v_sfun uuid; v_prog uuid; v_acao uuid; v_cat uuid; v_gnd uuid; v_mod uuid;
  v_el uuid; v_sub uuid; v_fonte uuid; v_det uuid; v_sfonte uuid; v_co uuid; v_uso uuid; v_idoc uuid; v_rp uuid;
  v_id uuid; v_criada boolean := false;
  cod_ text; des_ text;
begin
  if not eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma (desenvolvedor) cadastra dotações orçamentárias.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from entes where id = e and ativo) then
    raise exception 'Ente não encontrado.' using errcode = 'check_violation', hint = 'ente_id';
  end if;

  nat := regexp_replace(coalesce(c -> 'natureza' ->> 'codigo', ''), '\D', '', 'g');
  if length(nat) <> 8 then
    raise exception 'A natureza da despesa deve ter 8 dígitos (ex.: 33903900).' using errcode = 'check_violation', hint = 'natureza';
  end if;
  if nullif(btrim(c -> 'acao' ->> 'codigo'), '') is null then
    raise exception 'Informe a ação.' using errcode = 'check_violation', hint = 'acao';
  end if;
  if nullif(btrim(c -> 'fonte' ->> 'codigo'), '') is null then
    raise exception 'Informe a fonte de recurso.' using errcode = 'check_violation', hint = 'fonte';
  end if;

  v_orgao := classificador_garantido(e, 'ORGAO', c -> 'orgao' ->> 'codigo', c -> 'orgao' ->> 'descricao');
  v_uo := classificador_garantido(e, 'UNIDADE_ORCAMENTARIA', c -> 'unidade_orcamentaria' ->> 'codigo', c -> 'unidade_orcamentaria' ->> 'descricao', v_orgao);
  v_fun := classificador_garantido(e, 'FUNCAO', c -> 'funcao' ->> 'codigo', c -> 'funcao' ->> 'descricao');
  v_sfun := classificador_garantido(e, 'SUBFUNCAO', c -> 'subfuncao' ->> 'codigo', c -> 'subfuncao' ->> 'descricao');
  v_prog := classificador_garantido(e, 'PROGRAMA', c -> 'programa' ->> 'codigo', c -> 'programa' ->> 'descricao');
  v_acao := classificador_garantido(e, 'ACAO', c -> 'acao' ->> 'codigo', c -> 'acao' ->> 'descricao', v_prog);

  -- natureza 3.3.90.39.xx: categoria, GND, modalidade e elemento saem dos dígitos
  v_cat := classificador_garantido(e, 'CATEGORIA_ECONOMICA', substr(nat, 1, 1),
    case substr(nat, 1, 1) when '3' then 'Despesas Correntes' when '4' then 'Despesas de Capital' when '9' then 'Reserva de Contingência' end);
  v_gnd := classificador_garantido(e, 'GND', substr(nat, 2, 1),
    case substr(nat, 2, 1) when '1' then 'Pessoal e Encargos Sociais' when '2' then 'Juros e Encargos da Dívida'
      when '3' then 'Outras Despesas Correntes' when '4' then 'Investimentos' when '5' then 'Inversões Financeiras'
      when '6' then 'Amortização da Dívida' when '9' then 'Reserva de Contingência' end);
  v_mod := classificador_garantido(e, 'MODALIDADE', substr(nat, 3, 2),
    case substr(nat, 3, 2) when '20' then 'Transferências à União' when '30' then 'Transferências a Estados e ao Distrito Federal'
      when '31' then 'Transferências a Estados e ao Distrito Federal - Fundo a Fundo' when '40' then 'Transferências a Municípios'
      when '41' then 'Transferências a Municípios - Fundo a Fundo' when '50' then 'Transferências a Instituições Privadas sem Fins Lucrativos'
      when '60' then 'Transferências a Instituições Privadas com Fins Lucrativos' when '67' then 'Execução de Contrato de Parceria Público-Privada - PPP'
      when '70' then 'Transferências a Instituições Multigovernamentais' when '71' then 'Transferências a Consórcios Públicos mediante contrato de rateio'
      when '72' then 'Execução Orçamentária Delegada a Consórcios Públicos' when '80' then 'Transferências ao Exterior'
      when '90' then 'Aplicações Diretas'
      when '91' then 'Aplicação Direta Decorrente de Operação entre Órgãos, Fundos e Entidades Integrantes dos Orçamentos Fiscal e da Seguridade Social'
      when '99' then 'A Definir' else 'Modalidade ' || substr(nat, 3, 2) end);
  v_el := classificador_garantido(e, 'ELEMENTO', substr(nat, 5, 2), c -> 'natureza' ->> 'descricao');

  sub := regexp_replace(coalesce(c -> 'subelemento' ->> 'codigo', ''), '\D', '', 'g');
  if length(sub) = 8 then
    if left(sub, 6) <> left(nat, 6) then
      raise exception 'O subelemento % não pertence à natureza da despesa %.', sub, nat using errcode = 'check_violation', hint = 'subelemento';
    end if;
    sub := right(sub, 2);
  elsif length(sub) > 2 then
    raise exception 'Subelemento: informe os 8 dígitos (ex.: 33903914) ou só os 2 finais.' using errcode = 'check_violation', hint = 'subelemento';
  elsif sub = '' and substr(nat, 7, 2) <> '00' then
    sub := substr(nat, 7, 2);
  end if;
  if sub <> '' and sub <> '00' then
    v_sub := classificador_garantido(e, 'SUBELEMENTO', lpad(sub, 2, '0'), c -> 'subelemento' ->> 'descricao', v_el);
  end if;

  v_fonte := classificador_garantido(e, 'FONTE', c -> 'fonte' ->> 'codigo', c -> 'fonte' ->> 'descricao');
  v_det := classificador_garantido(e, 'DETALHAMENTO_FONTE', c -> 'detalhamento_fonte' ->> 'codigo', c -> 'detalhamento_fonte' ->> 'descricao', v_fonte);
  v_sfonte := classificador_garantido(e, 'SUBFONTE', c -> 'subfonte' ->> 'codigo', c -> 'subfonte' ->> 'descricao');
  v_co := classificador_garantido(e, 'CODIGO_ACOMPANHAMENTO', c -> 'codigo_acompanhamento' ->> 'codigo', c -> 'codigo_acompanhamento' ->> 'descricao');
  v_uso := classificador_garantido(e, 'ID_USO', c -> 'id_uso' ->> 'codigo', c -> 'id_uso' ->> 'descricao');
  v_idoc := classificador_garantido(e, 'IDOC', c -> 'idoc' ->> 'codigo', c -> 'idoc' ->> 'descricao');
  v_rp := classificador_garantido(e, 'RESULTADO_PRIMARIO', c -> 'resultado_primario' ->> 'codigo', c -> 'resultado_primario' ->> 'descricao');

  select id into v_id from classificacoes_orcamentarias
   where ente_id = e and orgao_id is not distinct from v_orgao and unidade_orcamentaria_id is not distinct from v_uo
     and funcao_id is not distinct from v_fun and subfuncao_id is not distinct from v_sfun
     and programa_id is not distinct from v_prog and acao_id = v_acao
     and categoria_economica_id is not distinct from v_cat and gnd_id is not distinct from v_gnd
     and modalidade_id is not distinct from v_mod and elemento_id = v_el and subelemento_id is not distinct from v_sub
     and fonte_id = v_fonte and detalhamento_fonte_id is not distinct from v_det and subfonte_id is not distinct from v_sfonte
     and codigo_acompanhamento_id is not distinct from v_co and id_uso_id is not distinct from v_uso
     and idoc_id is not distinct from v_idoc and resultado_primario_id is not distinct from v_rp;
  if v_id is null then
    insert into classificacoes_orcamentarias (ente_id, orgao_id, unidade_orcamentaria_id, funcao_id, subfuncao_id, programa_id, acao_id,
        categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id, detalhamento_fonte_id,
        subfonte_id, codigo_acompanhamento_id, id_uso_id, idoc_id, resultado_primario_id, descricao)
    values (e, v_orgao, v_uo, v_fun, v_sfun, v_prog, v_acao, v_cat, v_gnd, v_mod, v_el, v_sub, v_fonte, v_det,
            v_sfonte, v_co, v_uso, v_idoc, v_rp, nullif(btrim(p ->> 'descricao'), ''))
    returning id into v_id;
    v_criada := true;
  end if;

  -- órgãos que usam a unidade orçamentária (acrescenta; não remove os já indicados)
  if jsonb_typeof(p -> 'orgaos') = 'array' and jsonb_array_length(p -> 'orgaos') > 0 then
    if v_uo is null then
      raise exception 'Para indicar os órgãos que usam a dotação, informe a unidade orçamentária.' using errcode = 'check_violation', hint = 'unidade_orcamentaria';
    end if;
    for o in select jsonb_array_elements_text(p -> 'orgaos') loop
      insert into unidade_orcamentaria_orgaos (classificador_id, tenant_id) values (v_uo, o::uuid) on conflict do nothing;
    end loop;
  end if;

  return jsonb_build_object('id', v_id, 'criada', v_criada,
                            'codigo_completo', (select codigo_completo from classificacoes_orcamentarias where id = v_id));
end $$;

-- Importação em lote (LOA): mesma estrutura de cadastrar_dotacao por linha.
-- Prévia (p_aplicar = false) não grava nada; gravação é tudo ou nada.
create function public.importar_dotacoes(p_ente uuid, p_linhas jsonb, p_aplicar boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i int; l jsonb; r jsonb; erros jsonb := '[]'; novas int := 0; existentes int := 0;
begin
  if not eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma (desenvolvedor) importa dotações orçamentárias.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'Planilha inválida.'; end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'No máximo 5.000 linhas por importação.'; end if;
  for i in 0 .. jsonb_array_length(p_linhas) - 1 loop
    l := p_linhas -> i;
    begin
      r := cadastrar_dotacao(jsonb_build_object('ente_id', p_ente, 'campos', l -> 'campos', 'orgaos', l -> 'orgaos', 'descricao', l ->> 'descricao'));
      if (r ->> 'criada')::boolean then novas := novas + 1; else existentes := existentes + 1; end if;
      if not p_aplicar then raise exception using errcode = 'MS001', message = 'previa'; end if;
    exception
      when sqlstate 'MS001' then null;  -- prévia: desfaz a linha
      when others then erros := erros || jsonb_build_object('linha', coalesce((l ->> 'linha')::int, i + 2), 'mensagem', sqlerrm);
    end;
  end loop;
  if p_aplicar and jsonb_array_length(erros) > 0 then
    raise exception 'A planilha tem % linha(s) com erro. Nada foi gravado.', jsonb_array_length(erros) using errcode = 'check_violation';
  end if;
  if p_aplicar then
    perform registrar_auditoria(null, 'classificacoes_orcamentarias', null, 'IMPORTACAO', null,
      jsonb_build_object('ente_id', p_ente, 'novas', novas, 'ja_existentes', existentes));
  end if;
  return jsonb_build_object('total', jsonb_array_length(p_linhas), 'novas', novas, 'existentes', existentes, 'erros', erros, 'aplicado', p_aplicar);
end $$;

-- Relatório e cópia de segurança passam a usar o catálogo do ente

create or replace function public.relatorio_notas(p jsonb) returns table (
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
-- com milhares de notas, o planejador subestima as linhas e escolhe laços aninhados (30 mil buscas); junção hash é ~4x mais rápida
language sql stable security definer set search_path = public set enable_nestloop = off as $$
  with prm as materialized (
    select (p ->> 'tenant_id')::uuid as tenant, filtro_ids(p, 'contratos') as contratos, filtro_ids(p, 'fornecedores') as fornecedores,
           filtro_ids(p, 'unidades') as unidades, filtro_ints(p, 'anos') as anos, p ->> 'ano_base' = 'EMISSAO' as por_emissao
  ),
  classif as materialized (
    select cd.id from classificacao_detalhada cd, prm where cd.ente_id = (select t.ente_id from tenants t where t.id = prm.tenant) and classificacao_casa(cd, p)
  ),
  base as (
    select nf.*, e.ano as empenho_ano, e.numero as empenho_numero, e.classificacao_id
      from notas_fiscais nf join empenhos e on e.id = nf.empenho_id, prm
     where nf.tenant_id = prm.tenant
       and e.classificacao_id in (select id from classif)
       and ((nf.tenant_id, nf.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('relatorios', 'ler') a) or nf.contrato_id in (select contratos_designados()))
       and (coalesce((p ->> 'incluir_canceladas')::boolean, false) or nf.cancelada_em is null)
       and (prm.contratos is null or nf.contrato_id = any(prm.contratos))
       and (prm.fornecedores is null or nf.fornecedor_id = any(prm.fornecedores))
       and (prm.unidades is null or exists (select 1 from nota_unidades nu where nu.nota_id = nf.id and nu.unidade_atendida_id = any(prm.unidades)))
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
    cross join prm
    cross join lateral (select case when prm.por_emissao then extract(year from b.data_emissao)::int else b.empenho_ano end as ano) x
   where (prm.anos is null or x.ano = any(prm.anos))
   order by x.ano, coalesce(f.razao_social, f.nome_fantasia), c.numero, b.data_emissao, b.numero
$$;

create or replace function public.exportar_backup_orgao(p_tenant uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb := '{}'; t text;
  tabelas text[] := array['unidades_organizacionais', 'tenant_configuracoes', 'fornecedores', 'fornecedor_contas', 'servidores',
    'servidores_dados_pessoais', 'unidades_atendidas', 'unidades_grupo_membros',
    'tipos_servico', 'contratos', 'contrato_designacoes', 'contrato_dotacoes', 'contrato_aditivos', 'documentos', 'empenhos',
    'empenho_reforcos', 'empenho_unidades', 'notas_fiscais', 'nota_referencias', 'nota_unidades', 'nota_atestos', 'nota_pagamentos',
    'ordens_servico', 'os_unidades', 'frequencias_mensais', 'documentos_emitidos', 'vinculos'];
  dados jsonb; v_total int := 0;
begin
  if not pode(p_tenant, null, 'configuracoes', 'exportar', true) then
    raise exception 'Só a administração do órgão pode gerar a cópia de segurança.' using errcode = 'insufficient_privilege';
  end if;
  foreach t in array tabelas loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where x.tenant_id = $1', t) into dados using p_tenant;
    v := v || jsonb_build_object(t, dados);
    v_total := v_total + jsonb_array_length(dados);
  end loop;
  perform registrar_auditoria(p_tenant, 'tenants', p_tenant::text, 'EXPORTACAO', null,
    jsonb_build_object('tipo', 'Cópia de segurança (JSON)', 'registros', v_total));
  return jsonb_build_object(
    'formato', 'measure-backup', 'versao', 1, 'gerado_em', now(),
    'orgao', (select to_jsonb(x) from tenants x where x.id = p_tenant),
    'tabelas', v,
    -- catálogo orçamentário do ente (compartilhado com os demais órgãos do município)
    'catalogo_orcamentario', jsonb_build_object(
      'ente', (select to_jsonb(x) from entes x where x.id = (select ente_id from tenants where id = p_tenant)),
      'classificadores', coalesce((select jsonb_agg(to_jsonb(c)) from classificadores c where c.ente_id = (select ente_id from tenants where id = p_tenant)), '[]'),
      'dotacoes', coalesce((select jsonb_agg(to_jsonb(d)) from classificacoes_orcamentarias d where d.ente_id = (select ente_id from tenants where id = p_tenant)), '[]'),
      'unidades_orcamentarias_do_orgao', coalesce((select jsonb_agg(to_jsonb(m)) from unidade_orcamentaria_orgaos m where m.tenant_id = p_tenant), '[]')));
end $$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function
  public.protege_ente_tenant(), public.entes_do_usuario(), public.bloquear_troca_ente(), public.valida_uo_orgao(),
  public.dotacao_disponivel(uuid, uuid), public.classificacao_casa(public.classificacao_detalhada, jsonb),
  public.dotacoes_do_orgao(uuid, text, text, int, int), public.buscar_classificadores(uuid, text, text, uuid, int),
  public.classificador_garantido(uuid, text, text, text, uuid), public.cadastrar_dotacao(jsonb), public.importar_dotacoes(uuid, jsonb, boolean)
from public, anon;
revoke execute on function public.protege_ente_tenant(), public.bloquear_troca_ente(), public.valida_uo_orgao(),
  public.classificador_garantido(uuid, text, text, text, uuid) from authenticated;
grant execute on function
  public.entes_do_usuario(), public.dotacao_disponivel(uuid, uuid), public.classificacao_casa(public.classificacao_detalhada, jsonb),
  public.dotacoes_do_orgao(uuid, text, text, int, int), public.buscar_classificadores(uuid, text, text, uuid, int),
  public.cadastrar_dotacao(jsonb), public.importar_dotacoes(uuid, jsonb, boolean)
to authenticated;
