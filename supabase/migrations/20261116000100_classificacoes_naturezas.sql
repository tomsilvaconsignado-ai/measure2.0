-- O módulo Desenvolvedor cadastra as CLASSIFICAÇÕES orçamentárias (cada código separado). A DOTAÇÃO é formada
-- pelo administrador do órgão no contrato (várias) e no empenho, escolhendo essas classificações.
-- Natureza da despesa (8 dígitos) passa a ser cadastrada sozinha, sem depender de uma dotação.

-- =====================================================================
-- Naturezas da despesa do ente (33903900 = categoria 3, grupo 3, modalidade 90, elemento 39)
-- =====================================================================

create table public.naturezas_despesa (
  id uuid primary key default gen_random_uuid(),
  ente_id uuid not null references public.entes(id),
  codigo text not null check (codigo ~ '^\d{6}00$'),
  descricao text not null check (length(btrim(descricao)) between 2 and 300),
  categoria_id uuid not null references public.classificadores(id),
  gnd_id uuid not null references public.classificadores(id),
  modalidade_id uuid not null references public.classificadores(id),
  elemento_id uuid not null references public.classificadores(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  unique (ente_id, codigo)
);
create trigger naturezas_despesa_criacao before insert on public.naturezas_despesa for each row execute function public.carimbar_criacao();
create trigger naturezas_despesa_carimbar before update on public.naturezas_despesa for each row execute function public.carimbar();
create trigger naturezas_despesa_ente before update on public.naturezas_despesa for each row execute function public.bloquear_troca_ente();
create trigger naturezas_despesa_auditar after insert or update or delete on public.naturezas_despesa for each row execute function public.auditar();

alter table public.naturezas_despesa enable row level security;
create policy naturezas_ler on public.naturezas_despesa for select to authenticated
  using ((select eh_admin_plataforma()) or ente_id in (select entes_do_usuario()));
create policy naturezas_editar on public.naturezas_despesa for update to authenticated
  using ((select eh_admin_plataforma())) with check ((select eh_admin_plataforma()));
revoke all on public.naturezas_despesa from anon;
-- inclusão pela função cadastrar_natureza (desmembra os dígitos); nada é apagado
revoke insert, delete on public.naturezas_despesa from authenticated;

-- Naturezas que já existem nas dotações cadastradas
insert into public.naturezas_despesa (ente_id, codigo, descricao, categoria_id, gnd_id, modalidade_id, elemento_id)
select distinct on (d.ente_id, ce.codigo || gn.codigo || lpad(mo.codigo, 2, '0') || lpad(el.codigo, 2, '0'))
       d.ente_id, ce.codigo || gn.codigo || lpad(mo.codigo, 2, '0') || lpad(el.codigo, 2, '0') || '00', el.descricao,
       d.categoria_economica_id, d.gnd_id, d.modalidade_id, d.elemento_id
  from classificacoes_orcamentarias d
  join classificadores ce on ce.id = d.categoria_economica_id
  join classificadores gn on gn.id = d.gnd_id
  join classificadores mo on mo.id = d.modalidade_id
  join classificadores el on el.id = d.elemento_id
 where ce.codigo ~ '^\d$' and gn.codigo ~ '^\d$' and mo.codigo ~ '^\d{1,2}$' and el.codigo ~ '^\d{1,2}$'
on conflict do nothing;

-- Toda dotação nova registra a sua natureza (importação, cadastro da plataforma, contrato e empenho)
create function public.registra_natureza_da_dotacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cod text;
begin
  select ce.codigo || gn.codigo || lpad(mo.codigo, 2, '0') || lpad(el.codigo, 2, '0') || '00' into v_cod
    from classificadores ce, classificadores gn, classificadores mo, classificadores el
   where ce.id = new.categoria_economica_id and gn.id = new.gnd_id and mo.id = new.modalidade_id and el.id = new.elemento_id;
  if v_cod ~ '^\d{6}00$' then
    insert into naturezas_despesa (ente_id, codigo, descricao, categoria_id, gnd_id, modalidade_id, elemento_id)
    values (new.ente_id, v_cod, (select descricao from classificadores where id = new.elemento_id),
            new.categoria_economica_id, new.gnd_id, new.modalidade_id, new.elemento_id)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger classificacoes_registra_natureza after insert on public.classificacoes_orcamentarias
  for each row execute function public.registra_natureza_da_dotacao();

-- Plataforma: cadastra (ou corrige a descrição de) uma natureza de 8 dígitos
create function public.cadastrar_natureza(p_ente uuid, p_codigo text, p_descricao text) returns uuid
language plpgsql security definer set search_path = public as $$
declare nat text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'); v_cat uuid; v_gnd uuid; v_mod uuid; v_el uuid; v_id uuid;
begin
  if not eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma (desenvolvedor) cadastra classificações orçamentárias.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from entes where id = p_ente) then raise exception 'Ente não encontrado.' using errcode = 'check_violation'; end if;
  if length(nat) <> 8 or right(nat, 2) <> '00' then
    raise exception 'A natureza da despesa tem 8 dígitos e termina em 00 (ex.: 33903900). O subelemento (33903914) é cadastrado à parte.'
      using errcode = 'check_violation', hint = 'codigo';
  end if;
  if coalesce(length(btrim(p_descricao)), 0) < 2 then raise exception 'Informe a descrição.' using errcode = 'check_violation', hint = 'descricao'; end if;
  v_cat := classificador_garantido(p_ente, 'CATEGORIA_ECONOMICA', substr(nat, 1, 1),
    case substr(nat, 1, 1) when '3' then 'Despesas Correntes' when '4' then 'Despesas de Capital' when '9' then 'Reserva de Contingência' else 'Categoria ' || substr(nat, 1, 1) end);
  v_gnd := classificador_garantido(p_ente, 'GND', substr(nat, 2, 1),
    case substr(nat, 2, 1) when '1' then 'Pessoal e Encargos Sociais' when '2' then 'Juros e Encargos da Dívida'
      when '3' then 'Outras Despesas Correntes' when '4' then 'Investimentos' when '5' then 'Inversões Financeiras'
      when '6' then 'Amortização da Dívida' when '9' then 'Reserva de Contingência' else 'Grupo ' || substr(nat, 2, 1) end);
  v_mod := classificador_garantido(p_ente, 'MODALIDADE', substr(nat, 3, 2),
    case substr(nat, 3, 2) when '20' then 'Transferências à União' when '30' then 'Transferências a Estados e ao Distrito Federal'
      when '31' then 'Transferências a Estados e ao Distrito Federal - Fundo a Fundo' when '40' then 'Transferências a Municípios'
      when '41' then 'Transferências a Municípios - Fundo a Fundo' when '50' then 'Transferências a Instituições Privadas sem Fins Lucrativos'
      when '60' then 'Transferências a Instituições Privadas com Fins Lucrativos' when '67' then 'Execução de Contrato de Parceria Público-Privada - PPP'
      when '70' then 'Transferências a Instituições Multigovernamentais' when '71' then 'Transferências a Consórcios Públicos mediante contrato de rateio'
      when '72' then 'Execução Orçamentária Delegada a Consórcios Públicos' when '80' then 'Transferências ao Exterior'
      when '90' then 'Aplicações Diretas'
      when '91' then 'Aplicação Direta Decorrente de Operação entre Órgãos, Fundos e Entidades Integrantes dos Orçamentos Fiscal e da Seguridade Social'
      when '99' then 'A Definir' else 'Modalidade ' || substr(nat, 3, 2) end);
  v_el := classificador_garantido(p_ente, 'ELEMENTO', substr(nat, 5, 2), btrim(p_descricao));
  insert into naturezas_despesa (ente_id, codigo, descricao, categoria_id, gnd_id, modalidade_id, elemento_id)
  values (p_ente, nat, btrim(p_descricao), v_cat, v_gnd, v_mod, v_el)
  on conflict (ente_id, codigo) do update set descricao = excluded.descricao, ativo = true
  returning id into v_id;
  return v_id;
end $$;

-- A lista de naturezas para escolher no contrato/empenho vem do cadastro (ativas)
create or replace function public.naturezas_do_orgao(p_tenant uuid, p_busca text default null)
returns table (categoria_id uuid, gnd_id uuid, modalidade_id uuid, elemento_id uuid, codigo text, descricao text)
language sql stable security definer set search_path = public as $$
  select n.categoria_id, n.gnd_id, n.modalidade_id, n.elemento_id, n.codigo, n.descricao
    from naturezas_despesa n join tenants t on t.id = p_tenant and t.ente_id = n.ente_id
   where ((select eh_admin_plataforma()) or membro_do_tenant(p_tenant)) and n.ativo
     and (nullif(btrim(p_busca), '') is null
          or n.codigo like regexp_replace(btrim(p_busca), '\D', '', 'g') || '%' and regexp_replace(btrim(p_busca), '\D', '', 'g') <> ''
          or n.descricao ilike '%' || btrim(p_busca) || '%')
   order by n.codigo
   limit 50
$$;

-- =====================================================================
-- Dotação formada pelas classificações escolhidas (comum ao contrato e ao empenho)
-- =====================================================================

create function public.dotacao_por_classificacoes(p_ente uuid, p_exercicio int, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_ativo boolean;
  campos text[] := array['unidade_orcamentaria_id:UNIDADE_ORCAMENTARIA:Unidade orçamentária', 'funcao_id:FUNCAO:Função',
    'subfuncao_id:SUBFUNCAO:Subfunção', 'programa_id:PROGRAMA:Programa', 'acao_id:ACAO:Ação',
    'categoria_economica_id:CATEGORIA_ECONOMICA:Categoria econômica', 'gnd_id:GND:Grupo de despesa', 'modalidade_id:MODALIDADE:Modalidade',
    'elemento_id:ELEMENTO:Natureza da despesa', 'subelemento_id:SUBELEMENTO:Subelemento', 'fonte_id:FONTE:Fonte',
    'codigo_acompanhamento_id:CODIGO_ACOMPANHAMENTO:Código de acompanhamento', 'id_uso_id:ID_USO:IdUso', 'idoc_id:IDOC:IDoc',
    'resultado_primario_id:RESULTADO_PRIMARIO:Indicador de resultado primário', 'subfonte_id:SUBFONTE:Subfonte'];
  par text; v uuid; k classificadores; ids jsonb := '{}';
begin
  if p_exercicio is not null and p_exercicio not between 2000 and 2100 then
    raise exception 'Exercício inválido.' using errcode = 'check_violation', hint = 'exercicio';
  end if;
  -- cada classificação tem de ser um código já cadastrado no catálogo do ente, do tipo certo e ativo
  foreach par in array campos loop
    v := nullif(p ->> split_part(par, ':', 1), '')::uuid;
    if v is not null then
      select * into k from classificadores where id = v;
      if k.id is null or k.ente_id <> p_ente or k.tipo <> split_part(par, ':', 2) then
        raise exception '%: código não encontrado no catálogo do município.', split_part(par, ':', 3) using errcode = 'check_violation', hint = split_part(par, ':', 1);
      end if;
      if not k.ativo then
        raise exception '%: o código % está inativo no catálogo.', split_part(par, ':', 3), k.codigo using errcode = 'check_violation', hint = split_part(par, ':', 1);
      end if;
    end if;
    ids := ids || jsonb_build_object(split_part(par, ':', 1), v);
  end loop;
  if ids ->> 'acao_id' is null then raise exception 'Escolha a ação.' using errcode = 'check_violation', hint = 'acao_id'; end if;
  if ids ->> 'elemento_id' is null or ids ->> 'categoria_economica_id' is null or ids ->> 'gnd_id' is null or ids ->> 'modalidade_id' is null then
    raise exception 'Escolha a natureza da despesa.' using errcode = 'check_violation', hint = 'elemento_id';
  end if;
  if ids ->> 'fonte_id' is null then raise exception 'Escolha a fonte de recurso.' using errcode = 'check_violation', hint = 'fonte_id'; end if;
  if ids ->> 'subelemento_id' is not null and (select pai_id from classificadores where id = (ids ->> 'subelemento_id')::uuid) <> (ids ->> 'elemento_id')::uuid then
    raise exception 'O subelemento não pertence à natureza da despesa escolhida.' using errcode = 'check_violation', hint = 'subelemento_id';
  end if;

  -- a mesma combinação já formada é reaproveitada: do exercício pedido ou sem exercício
  select d.id, d.ativo into v_id, v_ativo from classificacoes_orcamentarias d
   where d.ente_id = p_ente
     and (case when p_exercicio is null then d.exercicio is null else d.exercicio = p_exercicio or d.exercicio is null end)
     and d.unidade_orcamentaria_id is not distinct from (ids ->> 'unidade_orcamentaria_id')::uuid
     and d.funcao_id is not distinct from (ids ->> 'funcao_id')::uuid
     and d.subfuncao_id is not distinct from (ids ->> 'subfuncao_id')::uuid
     and d.programa_id is not distinct from (ids ->> 'programa_id')::uuid
     and d.acao_id = (ids ->> 'acao_id')::uuid
     and d.categoria_economica_id is not distinct from (ids ->> 'categoria_economica_id')::uuid
     and d.gnd_id is not distinct from (ids ->> 'gnd_id')::uuid
     and d.modalidade_id is not distinct from (ids ->> 'modalidade_id')::uuid
     and d.elemento_id = (ids ->> 'elemento_id')::uuid
     and d.subelemento_id is not distinct from (ids ->> 'subelemento_id')::uuid
     and d.fonte_id = (ids ->> 'fonte_id')::uuid
     and d.codigo_acompanhamento_id is not distinct from (ids ->> 'codigo_acompanhamento_id')::uuid
     and d.id_uso_id is not distinct from (ids ->> 'id_uso_id')::uuid
     and d.idoc_id is not distinct from (ids ->> 'idoc_id')::uuid
     and d.resultado_primario_id is not distinct from (ids ->> 'resultado_primario_id')::uuid
     and d.subfonte_id is not distinct from (ids ->> 'subfonte_id')::uuid
   order by d.exercicio nulls last, d.ativo desc
   limit 1;
  if v_id is not null and not v_ativo then
    raise exception 'Esta combinação de classificações foi inativada pela equipe da plataforma.' using errcode = 'check_violation', hint = 'acao_id';
  end if;
  if v_id is null then
    insert into classificacoes_orcamentarias (ente_id, exercicio, unidade_orcamentaria_id, funcao_id, subfuncao_id, programa_id, acao_id,
        categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id,
        codigo_acompanhamento_id, id_uso_id, idoc_id, resultado_primario_id, subfonte_id)
    values (p_ente, p_exercicio, (ids ->> 'unidade_orcamentaria_id')::uuid, (ids ->> 'funcao_id')::uuid, (ids ->> 'subfuncao_id')::uuid,
        (ids ->> 'programa_id')::uuid, (ids ->> 'acao_id')::uuid, (ids ->> 'categoria_economica_id')::uuid, (ids ->> 'gnd_id')::uuid,
        (ids ->> 'modalidade_id')::uuid, (ids ->> 'elemento_id')::uuid, (ids ->> 'subelemento_id')::uuid, (ids ->> 'fonte_id')::uuid,
        (ids ->> 'codigo_acompanhamento_id')::uuid, (ids ->> 'id_uso_id')::uuid, (ids ->> 'idoc_id')::uuid,
        (ids ->> 'resultado_primario_id')::uuid, (ids ->> 'subfonte_id')::uuid)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Empenho: mesma regra, agora pela função comum
create or replace function public.dotacao_do_empenho(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare c contratos; v_ente uuid; v_id uuid; v_ex int := nullif(p ->> 'exercicio', '')::int;
begin
  select * into c from contratos where id = (p ->> 'contrato_id')::uuid;
  if c.id is null or not (pode(c.tenant_id, c.unidade_id, 'empenhos', 'criar') or pode(c.tenant_id, c.unidade_id, 'empenhos', 'editar')) then
    raise exception 'Contrato não encontrado ou sem permissão para empenhar.' using errcode = 'insufficient_privilege', hint = 'contrato_id';
  end if;
  if v_ex is null or v_ex not between 2000 and 2100 then
    raise exception 'Informe o ano (exercício) do empenho.' using errcode = 'check_violation', hint = 'ano';
  end if;
  select ente_id into v_ente from tenants where id = c.tenant_id;
  if v_ente is null then
    raise exception 'O órgão ainda não está ligado ao catálogo orçamentário do município. Peça à equipe da plataforma.' using errcode = 'check_violation';
  end if;
  v_id := dotacao_por_classificacoes(v_ente, v_ex, p);
  insert into contrato_dotacoes (contrato_id, classificacao_id) values (c.id, v_id) on conflict do nothing;
  return v_id;
end $$;

-- Contrato: o administrador forma cada dotação escolhendo as classificações (quantas o contrato precisar)
--   p: { contrato_id, exercicio (opcional: vazio = todos os exercícios), ...ids das classificações }
create function public.adicionar_dotacao_contrato(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare c contratos; v_ente uuid; v_id uuid; v_ex int := nullif(p ->> 'exercicio', '')::int;
begin
  select * into c from contratos where id = (p ->> 'contrato_id')::uuid;
  if c.id is null or not pode(c.tenant_id, c.unidade_id, 'contratos', 'editar') then
    raise exception 'Contrato não encontrado ou sem permissão para alterar as dotações.' using errcode = 'insufficient_privilege', hint = 'contrato_id';
  end if;
  select ente_id into v_ente from tenants where id = c.tenant_id;
  if v_ente is null then
    raise exception 'O órgão ainda não está ligado ao catálogo orçamentário do município. Peça à equipe da plataforma.' using errcode = 'check_violation';
  end if;
  v_id := dotacao_por_classificacoes(v_ente, v_ex, p);
  if exists (select 1 from contrato_dotacoes where contrato_id = c.id and classificacao_id = v_id) then
    raise exception 'Esta dotação já está no contrato.' using errcode = 'unique_violation', hint = 'acao_id';
  end if;
  insert into contrato_dotacoes (contrato_id, classificacao_id) values (c.id, v_id);
  return v_id;
end $$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function public.registra_natureza_da_dotacao(), public.cadastrar_natureza(uuid, text, text),
  public.dotacao_por_classificacoes(uuid, int, jsonb), public.adicionar_dotacao_contrato(jsonb) from public, anon;
revoke execute on function public.registra_natureza_da_dotacao(), public.dotacao_por_classificacoes(uuid, int, jsonb) from authenticated;
grant execute on function public.cadastrar_natureza(uuid, text, text), public.adicionar_dotacao_contrato(jsonb) to authenticated;
