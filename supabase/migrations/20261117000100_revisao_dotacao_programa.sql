-- Revisão: ao escolher só a ação, o programa dela (e o órgão da UO) entram na comparação antes de procurar a
-- dotação já formada. Sem isso, a mesma combinação podia ser formada duas vezes (o gatilho completa o programa
-- depois da busca).

create or replace function public.dotacao_por_classificacoes(p_ente uuid, p_exercicio int, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_ativo boolean; v_pai uuid;
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
  -- a ação ligada a um programa leva o programa junto (como o gatilho da dotação faz)
  select pai_id into v_pai from classificadores where id = (ids ->> 'acao_id')::uuid;
  if v_pai is not null then
    if ids ->> 'programa_id' is null then
      ids := ids || jsonb_build_object('programa_id', v_pai);
    elsif (ids ->> 'programa_id')::uuid <> v_pai then
      raise exception 'A ação não pertence ao programa escolhido.' using errcode = 'check_violation', hint = 'acao_id';
    end if;
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

revoke execute on function public.dotacao_por_classificacoes(uuid, int, jsonb) from public, anon, authenticated;
