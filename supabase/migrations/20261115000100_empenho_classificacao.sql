-- Empenho no formato da nota de empenho: a classificação é escolhida campo a campo (UO, função, subfunção,
-- programa, ação, natureza, subelemento, fonte, CO, IdUso, IDoc, resultado primário, subfonte) entre os
-- classificadores já cadastrados pela plataforma. O sistema acha a dotação com essa combinação ou a monta
-- (sem criar código novo) e a vincula ao contrato.

-- Naturezas da despesa (8 dígitos: categoria, grupo, modalidade e elemento) já usadas no catálogo do ente
create function public.naturezas_do_orgao(p_tenant uuid, p_busca text default null)
returns table (categoria_id uuid, gnd_id uuid, modalidade_id uuid, elemento_id uuid, codigo text, descricao text)
language sql stable security definer set search_path = public as $$
  select distinct d.categoria_economica_id, d.gnd_id, d.modalidade_id, d.elemento_id,
         ce.codigo || gn.codigo || lpad(mo.codigo, 2, '0') || lpad(el.codigo, 2, '0') || '00', el.descricao
    from classificacoes_orcamentarias d
    join tenants t on t.id = p_tenant and t.ente_id = d.ente_id
    join classificadores ce on ce.id = d.categoria_economica_id
    join classificadores gn on gn.id = d.gnd_id
    join classificadores mo on mo.id = d.modalidade_id
    join classificadores el on el.id = d.elemento_id
   where ((select eh_admin_plataforma()) or membro_do_tenant(p_tenant))
     and (nullif(btrim(p_busca), '') is null
          or ce.codigo || gn.codigo || lpad(mo.codigo, 2, '0') || lpad(el.codigo, 2, '0') like regexp_replace(btrim(p_busca), '\D', '', 'g') || '%'
          or el.descricao ilike '%' || btrim(p_busca) || '%')
   order by 5
   limit 50
$$;

-- p: { contrato_id, exercicio, unidade_orcamentaria_id, funcao_id, subfuncao_id, programa_id, acao_id,
--      categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id,
--      codigo_acompanhamento_id, id_uso_id, idoc_id, resultado_primario_id, subfonte_id }
create function public.dotacao_do_empenho(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c contratos; v_ente uuid; v_id uuid; v_ativo boolean; v_ex int := nullif(p ->> 'exercicio', '')::int;
  campos text[] := array['unidade_orcamentaria_id:UNIDADE_ORCAMENTARIA:Unidade orçamentária', 'funcao_id:FUNCAO:Função',
    'subfuncao_id:SUBFUNCAO:Subfunção', 'programa_id:PROGRAMA:Programa', 'acao_id:ACAO:Ação',
    'categoria_economica_id:CATEGORIA_ECONOMICA:Categoria econômica', 'gnd_id:GND:Grupo de despesa', 'modalidade_id:MODALIDADE:Modalidade',
    'elemento_id:ELEMENTO:Natureza da despesa', 'subelemento_id:SUBELEMENTO:Subelemento', 'fonte_id:FONTE:Fonte',
    'codigo_acompanhamento_id:CODIGO_ACOMPANHAMENTO:Código de acompanhamento', 'id_uso_id:ID_USO:IdUso', 'idoc_id:IDOC:IDoc',
    'resultado_primario_id:RESULTADO_PRIMARIO:Indicador de resultado primário', 'subfonte_id:SUBFONTE:Subfonte'];
  par text; v uuid; k classificadores;
  ids jsonb := '{}';
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

  -- cada classificação tem de ser um código já cadastrado no catálogo do ente, do tipo certo e ativo
  foreach par in array campos loop
    v := nullif(p ->> split_part(par, ':', 1), '')::uuid;
    if v is not null then
      select * into k from classificadores where id = v;
      if k.id is null or k.ente_id <> v_ente or k.tipo <> split_part(par, ':', 2) then
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

  -- a mesma combinação já cadastrada (do exercício do empenho ou sem exercício) é reaproveitada
  select d.id, d.ativo into v_id, v_ativo from classificacoes_orcamentarias d
   where d.ente_id = v_ente and (d.exercicio = v_ex or d.exercicio is null)
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
    raise exception 'Esta classificação está inativa no catálogo orçamentário. Peça à equipe da plataforma para reativá-la.' using errcode = 'check_violation', hint = 'acao_id';
  end if;
  if v_id is null then
    insert into classificacoes_orcamentarias (ente_id, exercicio, unidade_orcamentaria_id, funcao_id, subfuncao_id, programa_id, acao_id,
        categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id,
        codigo_acompanhamento_id, id_uso_id, idoc_id, resultado_primario_id, subfonte_id, descricao)
    values (v_ente, v_ex, (ids ->> 'unidade_orcamentaria_id')::uuid, (ids ->> 'funcao_id')::uuid, (ids ->> 'subfuncao_id')::uuid,
        (ids ->> 'programa_id')::uuid, (ids ->> 'acao_id')::uuid, (ids ->> 'categoria_economica_id')::uuid, (ids ->> 'gnd_id')::uuid,
        (ids ->> 'modalidade_id')::uuid, (ids ->> 'elemento_id')::uuid, (ids ->> 'subelemento_id')::uuid, (ids ->> 'fonte_id')::uuid,
        (ids ->> 'codigo_acompanhamento_id')::uuid, (ids ->> 'id_uso_id')::uuid, (ids ->> 'idoc_id')::uuid,
        (ids ->> 'resultado_primario_id')::uuid, (ids ->> 'subfonte_id')::uuid, 'Montada no cadastro de empenho')
    returning id into v_id;
  end if;

  -- a dotação passa a fazer parte do contrato (o gatilho confere se ela está disponível para o órgão)
  insert into contrato_dotacoes (contrato_id, classificacao_id) values (c.id, v_id) on conflict do nothing;
  return v_id;
end $$;

revoke execute on function public.naturezas_do_orgao(uuid, text), public.dotacao_do_empenho(jsonb) from public, anon;
grant execute on function public.naturezas_do_orgao(uuid, text), public.dotacao_do_empenho(jsonb) to authenticated;
