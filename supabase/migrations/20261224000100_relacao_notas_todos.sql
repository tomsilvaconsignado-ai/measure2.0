-- Relação de notas: opção "Todos" (todos os contratos, de todas as empresas, que a pessoa pode consultar no órgão).
-- A tela manda p_tenant (órgão em uso) sem contrato nem empresa. Mantém período e situação.
-- Proteção: acima de 5.000 notas pede para estreitar (período ou contrato/empresa), para não gerar milhares de páginas.
-- Na relação "Todos" as notas vêm agrupadas por empresa e contrato.

drop function public.emitir_relacao_notas(text, uuid, uuid, date, date);

create function public.emitir_relacao_notas(p_situacao text, p_contrato uuid default null, p_fornecedor uuid default null,
                                            p_inicio date default null, p_fim date default null,
                                            p_tenant uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c contratos; f fornecedores; v_tenant uuid; v_unidade uuid; v_registro uuid; v_id uuid; v_dados jsonb; v_rotulo text;
  v_contratos uuid[];  -- contratos que entram na relação (calculado uma vez: nada de pode()/designado() por nota)
  v_periodo text;
  v_todos boolean := p_contrato is null and p_fornecedor is null and p_tenant is not null;
  v_qtd int;
  meses constant text[] := array['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
begin
  if p_situacao not in ('NAO_PAGAS', 'PAGAS', 'FALTANDO_ATESTO', 'TODAS') then
    raise exception 'Situação inválida para a relação de notas.' using errcode = 'check_violation', hint = 'situacao';
  end if;
  if not v_todos and (p_contrato is null) = (p_fornecedor is null) then
    raise exception 'Escolha um contrato ou uma empresa.' using errcode = 'check_violation', hint = 'filtro';
  end if;
  if (p_inicio is null) <> (p_fim is null) then
    raise exception 'Informe o início e o fim do período.' using errcode = 'check_violation', hint = 'periodo';
  end if;
  if p_inicio > p_fim then
    raise exception 'O mês inicial não pode ser depois do mês final.' using errcode = 'check_violation', hint = 'periodo';
  end if;

  if v_todos then
    -- todos os contratos (de todas as empresas) que a pessoa pode ler no órgão escolhido, ou em que está designada
    select coalesce(array_agg(x.id), '{}') into v_contratos
      from contratos x
     where x.tenant_id = p_tenant
       and ((x.tenant_id, x.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('contratos', 'ler') a)
            or x.id in (select contratos_designados()));
    if cardinality(v_contratos) = 0 then
      raise exception 'Nenhum contrato que você possa consultar neste órgão.' using errcode = 'insufficient_privilege', hint = 'filtro';
    end if;
    v_tenant := p_tenant; v_unidade := null; v_registro := p_tenant;
  elsif p_contrato is not null then
    if not (pode_contrato(p_contrato, 'ler') or designado(p_contrato)) then
      raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege', hint = 'contrato';
    end if;
    select * into c from contratos where id = p_contrato;
    select * into f from fornecedores where id = c.fornecedor_id;
    v_tenant := c.tenant_id; v_unidade := c.unidade_id; v_registro := c.id;
    v_contratos := array[c.id];
  else
    select * into f from fornecedores where id = p_fornecedor;
    -- contratos dessa empresa que a pessoa pode ler (unidades acessíveis) ou em que está designada
    select coalesce(array_agg(x.id), '{}') into v_contratos
      from contratos x
     where x.fornecedor_id = p_fornecedor
       and ((x.tenant_id, x.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('contratos', 'ler') a)
            or x.id in (select contratos_designados()));
    -- a empresa só "existe" para quem enxerga ao menos um contrato dela (não revela cadastro de outro órgão)
    if f.id is null or cardinality(v_contratos) = 0 then
      raise exception 'Empresa não encontrada nos contratos que você pode consultar.' using errcode = 'insufficient_privilege', hint = 'fornecedor';
    end if;
    v_tenant := f.tenant_id; v_unidade := null; v_registro := f.id;
  end if;

  -- proteção: relação gigante (milhares de páginas) trava o navegador; pede para estreitar
  select count(*) into v_qtd from notas_fiscais n
   where n.cancelada_em is null and n.contrato_id = any(v_contratos)
     and (v_todos or p_contrato is not null or n.fornecedor_id = f.id)
     and (p_inicio is null or n.data_emissao between p_inicio and p_fim)
     and (case p_situacao when 'NAO_PAGAS' then n.status_pagamento in ('PENDENTE', 'PARCIAL') when 'PAGAS' then n.status_pagamento = 'PAGO'
                          when 'FALTANDO_ATESTO' then n.status_atesto = 'PENDENTE' else true end);
  if v_qtd > 5000 then
    raise exception 'A relação teria % notas (o limite é 5.000). Escolha um período ou um contrato/empresa.', v_qtd using errcode = 'check_violation', hint = 'periodo';
  end if;

  v_rotulo := case p_situacao when 'NAO_PAGAS' then 'NÃO PAGAS' when 'PAGAS' then 'PAGAS'
                              when 'FALTANDO_ATESTO' then 'FALTANDO ATESTO' else 'TODAS' end;
  -- "MAIO/2026", "MAIO A JUNHO/2026" ou, atravessando o ano, "DEZEMBRO/2025 A JANEIRO/2026"
  if p_inicio is not null then
    v_periodo := case
      when date_trunc('month', p_inicio) = date_trunc('month', p_fim) then meses[extract(month from p_inicio)::int] || '/' || extract(year from p_inicio)
      when extract(year from p_inicio) = extract(year from p_fim) then meses[extract(month from p_inicio)::int] || ' A ' || meses[extract(month from p_fim)::int] || '/' || extract(year from p_fim)
      else meses[extract(month from p_inicio)::int] || '/' || extract(year from p_inicio) || ' A ' || meses[extract(month from p_fim)::int] || '/' || extract(year from p_fim) end;
  end if;

  select jsonb_build_object(
    'titulo', 'RELAÇÃO DE NOTAS FISCAIS - ' || v_rotulo || coalesce(' - ' || v_periodo, ''),
    'situacao', p_situacao,
    'filtro', case when v_todos then 'TODOS' when p_contrato is not null then 'CONTRATO' else 'EMPRESA' end,
    'periodo', case when p_inicio is not null then jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'rotulo', v_periodo) end,
    'orgao', cabecalho_orgao(v_tenant),
    'orgao_curto', (select nome_curto from tenants where id = v_tenant),
    'unidade', (select jsonb_build_object('nome', nome, 'sigla', sigla) from unidades_organizacionais where id = v_unidade),
    'contrato', case when p_contrato is not null then jsonb_build_object('numero', c.numero, 'objeto', c.objeto) end,
    'fornecedor', case when v_todos then null else jsonb_build_object('nome', coalesce(f.razao_social, f.nome_fantasia), 'documento', f.documento, 'tipo_pessoa', f.tipo_pessoa) end,
    'notas', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', n.numero || coalesce('-' || n.serie, ''), 'data', n.data_emissao,
        'processo', n.processo_administrativo, 'valor', n.valor,
        'fornecedor', (select coalesce(razao_social, nome_fantasia) from fornecedores where id = n.fornecedor_id),
        'contrato', ct.numero,
        'atesto', n.status_atesto, 'pagamento', n.status_pagamento,
        'pago', pg.bruto, 'liquido', pg.liquido,
        'pagamentos', pg.lista)
        -- todos: agrupado por empresa e contrato
        order by case when v_todos then (select coalesce(razao_social, nome_fantasia) from fornecedores where id = n.fornecedor_id) end, ct.numero, n.data_emissao, n.criado_em, n.numero)
      from notas_fiscais n
      join contratos ct on ct.id = n.contrato_id
      cross join lateral (
        select coalesce(sum(p.valor), 0) bruto, coalesce(sum(p.valor_liquido), 0) liquido,
               coalesce(jsonb_agg(jsonb_build_object('data', p.data_pagamento, 'valor', p.valor, 'liquido', p.valor_liquido)
                                  order by p.data_pagamento, p.registrado_em) filter (where p.id is not null), '[]') lista
          from nota_pagamentos p where p.nota_id = n.id and p.cancelado_em is null) pg
      where n.cancelada_em is null
        and n.contrato_id = any(v_contratos)
        and (v_todos or p_contrato is not null or n.fornecedor_id = f.id)
        and (p_inicio is null or n.data_emissao between p_inicio and p_fim)
        and (case p_situacao
               when 'NAO_PAGAS' then n.status_pagamento in ('PENDENTE', 'PARCIAL')
               when 'PAGAS' then n.status_pagamento = 'PAGO'
               when 'FALTANDO_ATESTO' then n.status_atesto = 'PENDENTE'
               else true end)), '[]'),
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now()
  ) into v_dados;

  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (v_tenant, v_unidade, 'RELACAO_NOTAS', v_registro,
          'Relação de notas · ' || lower(v_rotulo) || coalesce(' · ' || lower(v_periodo), '') || ' · ' ||
            case when v_todos then 'todos os contratos' when p_contrato is not null then 'contrato ' || c.numero else coalesce(f.razao_social, f.nome_fantasia) end,
          v_dados) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.emitir_relacao_notas(text, uuid, uuid, date, date, uuid) from public, anon;
grant execute on function public.emitir_relacao_notas(text, uuid, uuid, date, date, uuid) to authenticated;
