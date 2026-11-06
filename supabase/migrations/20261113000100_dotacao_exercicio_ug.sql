-- Dotação orçamentária: exercício financeiro e unidade gestora; empenho só usa dotação do mesmo exercício;
-- dotações do contrato com as classificações e o valor empenhado (seleção no contrato e no empenho).
-- A estrutura do catálogo do ente (classificadores + combinação única) é mantida.

-- =====================================================================
-- Unidade gestora (classificador opcional) e exercício financeiro
-- =====================================================================

insert into public.classificador_tipos (codigo, nome, pai_tipo, pai_obrigatorio, ordem) values
  ('UNIDADE_GESTORA', 'Unidade Gestora', null, false, 25);

alter table public.classificacoes_orcamentarias
  add column unidade_gestora_id uuid references public.classificadores(id),
  add column exercicio int check (exercicio between 2000 and 2100);

-- Exercício vazio = dotação válida para qualquer exercício (as já cadastradas ficam assim, sem quebrar
-- empenhos existentes de anos diferentes; a plataforma pode definir o exercício depois)
comment on column public.classificacoes_orcamentarias.exercicio is
  'Exercício financeiro (LOA) da dotação. Vazio: vale para qualquer exercício. Empenho só usa dotação do mesmo exercício.';

-- A mesma combinação pode existir em exercícios diferentes (uma por LOA)
drop index public.classificacoes_combinacao_unica;
create unique index classificacoes_combinacao_unica on public.classificacoes_orcamentarias (
  ente_id, coalesce(exercicio, 0),
  coalesce(orgao_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(unidade_orcamentaria_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(unidade_gestora_id, '00000000-0000-0000-0000-000000000000'::uuid),
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
create index classificacoes_exercicio on public.classificacoes_orcamentarias (ente_id, exercicio, codigo_completo);

create or replace function public.prepara_classificacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  campos text[] := array['orgao_id:ORGAO', 'unidade_orcamentaria_id:UNIDADE_ORCAMENTARIA', 'unidade_gestora_id:UNIDADE_GESTORA', 'funcao_id:FUNCAO',
    'subfuncao_id:SUBFUNCAO', 'programa_id:PROGRAMA', 'acao_id:ACAO', 'categoria_economica_id:CATEGORIA_ECONOMICA',
    'gnd_id:GND', 'modalidade_id:MODALIDADE', 'elemento_id:ELEMENTO', 'subelemento_id:SUBELEMENTO',
    'fonte_id:FONTE', 'detalhamento_fonte_id:DETALHAMENTO_FONTE', 'subfonte_id:SUBFONTE',
    'codigo_acompanhamento_id:CODIGO_ACOMPANHAMENTO', 'id_uso_id:ID_USO', 'idoc_id:IDOC', 'resultado_primario_id:RESULTADO_PRIMARIO'];
  par text; col text; tipo_esperado text; v_id uuid; c classificadores;
  linha jsonb;
  cod jsonb := '{}'; des text := ''; natureza text;
begin
  -- exercício de dotação já empenhada não muda (o empenho é daquele exercício)
  if tg_op = 'UPDATE' and new.exercicio is distinct from old.exercicio and new.exercicio is not null
     and exists (select 1 from empenhos where classificacao_id = new.id and ano <> new.exercicio) then
    raise exception 'Esta dotação já tem empenhos de outro exercício; ela não pode passar para %. Cadastre uma cópia para o novo exercício.', new.exercicio
      using errcode = 'check_violation', hint = 'exercicio';
  end if;
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
  -- o código completo continua o mesmo de antes (o exercício e a UG aparecem à parte)
  new.codigo_completo := concat_ws(' | ',
    nullif(concat_ws('.', cod ->> 'ORGAO', cod ->> 'UNIDADE_ORCAMENTARIA'), ''),
    nullif(concat_ws('.', cod ->> 'FUNCAO', cod ->> 'SUBFUNCAO', cod ->> 'PROGRAMA', cod ->> 'ACAO'), ''),
    natureza,
    'Fonte ' || concat_ws('.', cod ->> 'FONTE', cod ->> 'DETALHAMENTO_FONTE'));
  new.busca := lower(new.codigo_completo || ' ' || coalesce(natureza, '') || ' ' || coalesce(cod ->> 'UNIDADE_GESTORA', '') || ' '
                     || coalesce(new.exercicio::text, '') || ' ' || des || ' ' || coalesce(new.descricao, ''));
  return new;
end $$;

-- recalcula a busca (passa a incluir o exercício)
update public.classificacoes_orcamentarias set atualizado_em = atualizado_em;

create or replace function public.propaga_classificador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update classificacoes_orcamentarias set atualizado_em = now()
   where new.id in (orgao_id, unidade_orcamentaria_id, unidade_gestora_id, funcao_id, subfuncao_id, programa_id, acao_id,
                    categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id, detalhamento_fonte_id,
                    subfonte_id, codigo_acompanhamento_id, id_uso_id, idoc_id, resultado_primario_id);
  return null;
end $$;

-- Classificação "achatada": mesmas colunas, com a unidade gestora e o exercício no fim
create or replace view public.classificacao_detalhada as
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
       cl.descricao, cl.ativo,
       ug.codigo as ug_codigo, ug.descricao as ug_descricao, cl.unidade_gestora_id, cl.exercicio
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
  left join classificadores rp on rp.id = cl.resultado_primario_id
  left join classificadores ug on ug.id = cl.unidade_gestora_id;
revoke all on public.classificacao_detalhada from anon, authenticated;

-- Dotações disponíveis para o órgão, com filtro opcional de exercício
drop function public.dotacoes_do_orgao(uuid, text, text, int, int);
create function public.dotacoes_do_orgao(p_tenant uuid, p_busca text default null, p_situacao text default 'ATIVOS',
                                         p_limite int default 25, p_offset int default 0, p_exercicio int default null) returns jsonb
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
       -- no exercício pedido também entram as dotações sem exercício definido
       and (p_exercicio is null or cd.exercicio is null or cd.exercicio = p_exercicio)
       and (nullif(btrim(p_busca), '') is null or d.busca like '%' || lower(btrim(p_busca)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'itens', coalesce((select jsonb_agg(to_jsonb(b) order by b.exercicio desc nulls last, b.codigo_completo)
                         from (select * from base order by exercicio desc nulls last, codigo_completo
                               limit least(greatest(p_limite, 1), 100) offset greatest(p_offset, 0)) b), '[]'))
$$;

-- =====================================================================
-- Cadastro pela plataforma: exercício e unidade gestora
--   p: { ente_id, exercicio, descricao, orgaos, campos: { ..., unidade_gestora: { codigo, descricao } } }
-- =====================================================================

create or replace function public.cadastrar_dotacao(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e uuid := (p ->> 'ente_id')::uuid;
  c jsonb := coalesce(p -> 'campos', '{}');
  v_exercicio int;
  nat text; sub text; o text;
  v_orgao uuid; v_uo uuid; v_ug uuid; v_fun uuid; v_sfun uuid; v_prog uuid; v_acao uuid; v_cat uuid; v_gnd uuid; v_mod uuid;
  v_el uuid; v_sub uuid; v_fonte uuid; v_det uuid; v_sfonte uuid; v_co uuid; v_uso uuid; v_idoc uuid; v_rp uuid;
  v_id uuid; v_criada boolean := false;
begin
  if not eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma (desenvolvedor) cadastra dotações orçamentárias.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from entes where id = e and ativo) then
    raise exception 'Ente não encontrado.' using errcode = 'check_violation', hint = 'ente_id';
  end if;
  if nullif(btrim(p ->> 'exercicio'), '') is null then
    v_exercicio := null;  -- sem exercício: vale para qualquer um
  elsif btrim(p ->> 'exercicio') !~ '^\d{4}$' or (p ->> 'exercicio')::int not between 2000 and 2100 then
    raise exception 'Exercício financeiro inválido (use o ano com 4 dígitos, ex.: 2026).' using errcode = 'check_violation', hint = 'exercicio';
  else
    v_exercicio := (p ->> 'exercicio')::int;
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
  v_ug := classificador_garantido(e, 'UNIDADE_GESTORA', c -> 'unidade_gestora' ->> 'codigo', c -> 'unidade_gestora' ->> 'descricao');
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

  -- identificação automática: a mesma combinação no mesmo exercício já cadastrada é reaproveitada
  select id into v_id from classificacoes_orcamentarias
   where ente_id = e and exercicio is not distinct from v_exercicio and orgao_id is not distinct from v_orgao and unidade_orcamentaria_id is not distinct from v_uo
     and unidade_gestora_id is not distinct from v_ug
     and funcao_id is not distinct from v_fun and subfuncao_id is not distinct from v_sfun
     and programa_id is not distinct from v_prog and acao_id = v_acao
     and categoria_economica_id is not distinct from v_cat and gnd_id is not distinct from v_gnd
     and modalidade_id is not distinct from v_mod and elemento_id = v_el and subelemento_id is not distinct from v_sub
     and fonte_id = v_fonte and detalhamento_fonte_id is not distinct from v_det and subfonte_id is not distinct from v_sfonte
     and codigo_acompanhamento_id is not distinct from v_co and id_uso_id is not distinct from v_uso
     and idoc_id is not distinct from v_idoc and resultado_primario_id is not distinct from v_rp;
  if v_id is null then
    insert into classificacoes_orcamentarias (ente_id, exercicio, orgao_id, unidade_orcamentaria_id, unidade_gestora_id, funcao_id, subfuncao_id, programa_id, acao_id,
        categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id, detalhamento_fonte_id,
        subfonte_id, codigo_acompanhamento_id, id_uso_id, idoc_id, resultado_primario_id, descricao)
    values (e, v_exercicio, v_orgao, v_uo, v_ug, v_fun, v_sfun, v_prog, v_acao, v_cat, v_gnd, v_mod, v_el, v_sub, v_fonte, v_det,
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

  return jsonb_build_object('id', v_id, 'criada', v_criada, 'exercicio', v_exercicio,
                            'codigo_completo', (select codigo_completo from classificacoes_orcamentarias where id = v_id));
end $$;

-- Importação: cada linha pode trazer o exercício (coluna "Exercício")
create or replace function public.importar_dotacoes(p_ente uuid, p_linhas jsonb, p_aplicar boolean default false) returns jsonb
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
      r := cadastrar_dotacao(jsonb_build_object('ente_id', p_ente, 'campos', l -> 'campos', 'orgaos', l -> 'orgaos', 'descricao', l ->> 'descricao',
                                                'exercicio', l ->> 'exercicio'));
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

-- =====================================================================
-- Empenho: a dotação tem de ser do mesmo exercício do empenho
-- =====================================================================

create function public.valida_exercicio_empenho() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ex int; v_cod text;
begin
  select exercicio, codigo_completo into v_ex, v_cod from classificacoes_orcamentarias where id = new.classificacao_id;
  if v_ex is not null and v_ex <> new.ano then
    raise exception 'A dotação % é do exercício %, mas o empenho é de %. Escolha uma dotação do exercício %.', v_cod, v_ex, new.ano, new.ano
      using errcode = 'check_violation', hint = 'classificacao_id';
  end if;
  return new;
end $$;
create trigger empenhos_exercicio before insert or update of classificacao_id, ano on public.empenhos
  for each row execute function public.valida_exercicio_empenho();

-- =====================================================================
-- Dotações do contrato: classificações de cada uma e quanto já foi empenhado nela
-- =====================================================================

create or replace view public.v_contrato_dotacoes with (security_invoker = false) as
SELECT cd.contrato_id,
    cl.id,
    cl.codigo_completo,
    cl.descricao,
    cl.ativo,
    d.exercicio,
    d.uo_codigo, d.uo_descricao, d.ug_codigo, d.ug_descricao,
    d.funcao_codigo, d.subfuncao_codigo, d.programa_codigo, d.programa_descricao,
    d.acao_codigo, d.acao_descricao, d.natureza_acao,
    d.categoria_codigo, d.gnd_codigo, d.modalidade_codigo,
    d.elemento_codigo, d.elemento_descricao, d.subelemento_codigo, d.subelemento_descricao,
    d.fonte_codigo, d.fonte_descricao, d.detalhamento_codigo,
    (SELECT count(*)::int FROM empenhos e WHERE e.contrato_id = cd.contrato_id AND e.classificacao_id = cl.id) AS empenhos,
    COALESCE((SELECT sum(e.valor) FROM empenhos e WHERE e.contrato_id = cd.contrato_id AND e.classificacao_id = cl.id), 0::numeric)
      + COALESCE((SELECT sum(r.valor) FROM empenho_reforcos r JOIN empenhos e ON e.id = r.empenho_id
                   WHERE e.contrato_id = cd.contrato_id AND e.classificacao_id = cl.id), 0::numeric) AS empenhado
   FROM contrato_dotacoes cd
     JOIN classificacoes_orcamentarias cl ON cl.id = cd.classificacao_id
     JOIN classificacao_detalhada d ON d.id = cl.id
  WHERE (EXISTS ( SELECT 1 FROM contratos ct WHERE ct.id = cd.contrato_id AND ((ct.tenant_id, ct.unidade_id) IN ( SELECT a.tenant_id, a.unidade_id FROM unidades_acessiveis('contratos'::text, 'ler'::text) a(tenant_id, unidade_id))))) OR cd.contrato_id IN ( SELECT contratos_designados() AS contratos_designados);

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function public.valida_exercicio_empenho(), public.dotacoes_do_orgao(uuid, text, text, int, int, int) from public, anon;
revoke execute on function public.valida_exercicio_empenho() from authenticated;
grant execute on function public.dotacoes_do_orgao(uuid, text, text, int, int, int) to authenticated;
