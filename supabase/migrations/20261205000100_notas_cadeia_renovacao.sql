-- Empenho e renovações do contrato.
--
-- O empenho é anual e a renovação do contrato costuma cair no meio do ano: o mesmo empenho paga notas do
-- contrato que venceu e da renovação dele. Até aqui a nota ficava sempre no contrato do empenho, e as notas
-- migradas do sistema anterior foram parar todas no contrato mais novo (saldo negativo na renovação e
-- contrato vencido sem nenhuma nota).
--
-- Regra nova: a nota fica no contrato da vigência dela; o empenho pode ser de qualquer contrato da mesma
-- cadeia de renovação (mesmo órgão, mesmo fornecedor e mesmo número-base: "027/2023" e "027/2023 (02)").
-- O saldo do contrato já é calculado pelas notas do próprio contrato (v_contratos) e o saldo do empenho
-- pelas notas do empenho, então nada mais muda.

-- Número-base do contrato: sem o sufixo de renovação " (NN)"
create function public.contrato_numero_base(p_numero text) returns text
language sql immutable set search_path = public as $$
  select lower(btrim(regexp_replace(coalesce(p_numero, ''), '\s*\(\d+\)\s*$', '')))
$$;

-- Contratos da mesma cadeia de renovação (inclui o próprio)
create function public.contratos_da_cadeia(p_contrato uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select c2.id
    from contratos c
    join contratos c2 on c2.tenant_id = c.tenant_id and c2.fornecedor_id = c.fornecedor_id
                     and contrato_numero_base(c2.numero) = contrato_numero_base(c.numero)
   where c.id = p_contrato
$$;

create function public.mesma_cadeia(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_a = p_b or exists (select 1 from contratos_da_cadeia(p_a) x where x = p_b)
$$;

-- Lançar/editar nota: a nota pode ficar num contrato da cadeia do empenho.
--   * p.contrato_id (opcional): contrato escolhido na tela; o empenho tem de ser dele ou de uma renovação dele.
--   * edição sem p.contrato_id: a nota continua no contrato em que está, se o empenho for da mesma cadeia.
--   * sem nada disso: o contrato do empenho (como antes).
create or replace function public.salvar_nota_fiscal(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_empenho uuid := nullif(p ->> 'empenho_id', '')::uuid;
  v_contrato uuid := nullif(p ->> 'contrato_id', '')::uuid;
  e empenhos; c contratos; atual notas_fiscais;
  v_valor numeric := (p ->> 'valor')::numeric;
  v_saldo numeric; v_fim date; v_bloquear boolean;
  v_soma numeric; v_com_valor int; v_total int;
  u record; ref record;
begin
  if v_id is not null then
    select * into atual from notas_fiscais where id = v_id;
    if atual.id is null or not pode(atual.tenant_id, atual.unidade_id, 'notas_fiscais', 'editar') then
      raise exception 'Nota não encontrada ou sem permissão para editar.' using errcode = 'insufficient_privilege';
    end if;
    if atual.cancelada_em is not null then raise exception 'Nota cancelada não pode ser alterada.' using errcode = 'check_violation'; end if;
    -- o contrato de uma nota já lançada não muda pela edição
    if v_contrato is not null and v_contrato <> atual.contrato_id then
      raise exception 'O contrato de uma nota já lançada não muda.' using errcode = 'check_violation', hint = 'contrato_id';
    end if;
  end if;

  if v_empenho is not null then
    select * into e from empenhos where id = v_empenho;
    if e.id is null then raise exception 'Escolha o empenho.' using errcode = 'check_violation', hint = 'empenho_id'; end if;
    v_contrato := coalesce(v_contrato, atual.contrato_id, e.contrato_id);
    if not mesma_cadeia(v_contrato, e.contrato_id) then
      raise exception 'O empenho escolhido não é deste contrato nem de uma renovação dele.' using errcode = 'check_violation', hint = 'empenho_id';
    end if;
    select * into c from contratos where id = v_contrato;
  elsif v_id is not null and atual.empenho_id is null then
    -- nota migrada sem empenho: corrige os dados e continua sem empenho (o vínculo é feito em vincular_empenho_nota)
    select * into c from contratos where id = atual.contrato_id;
  else
    raise exception 'Escolha o empenho.' using errcode = 'check_violation', hint = 'empenho_id';
  end if;

  if v_id is null then
    if not pode(c.tenant_id, c.unidade_id, 'notas_fiscais', 'criar') then
      raise exception 'Você não tem permissão para lançar notas neste contrato.' using errcode = 'insufficient_privilege';
    end if;
  else
    if atual.empenho_id is distinct from e.id and exists (select 1 from nota_pagamentos where nota_id = v_id and cancelado_em is null) then
      raise exception 'A nota já tem pagamento: o empenho não pode ser trocado.' using errcode = 'check_violation', hint = 'empenho_id';
    end if;
    if atual.valor <> v_valor and exists (select 1 from nota_pagamentos where nota_id = v_id and cancelado_em is null) then
      raise exception 'A nota já tem pagamento: o valor não pode ser alterado.' using errcode = 'check_violation', hint = 'valor';
    end if;
    if atual.status_atesto = 'ATESTADA' and (atual.valor <> v_valor or atual.empenho_id is distinct from e.id) then
      raise exception 'A nota já foi atestada: valor e empenho não podem mudar.' using errcode = 'check_violation', hint = 'valor';
    end if;
  end if;
  if e.id is not null and not e.ativo then raise exception 'O empenho % está inativo.', e.numero using errcode = 'check_violation', hint = 'empenho_id'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor da nota.' using errcode = 'check_violation', hint = 'valor'; end if;
  if nullif(btrim(p ->> 'numero'), '') is null then raise exception 'Informe o número da nota.' using errcode = 'check_violation', hint = 'numero'; end if;
  if (p ->> 'data_emissao') is null then raise exception 'Informe a data da nota.' using errcode = 'check_violation', hint = 'data_emissao'; end if;

  -- contrato vencido: alerta na tela; bloqueio só se o órgão configurou
  v_fim := contrato_fim_atual(c.id);
  select bloquear_nota_contrato_vencido into v_bloquear from tenant_configuracoes where tenant_id = c.tenant_id;
  if coalesce(v_bloquear, false) and hoje() > v_fim and v_id is null then
    raise exception 'O contrato % venceu em %. O órgão bloqueia lançamentos em contratos vencidos.', c.numero, to_char(v_fim, 'DD/MM/YYYY')
      using errcode = 'check_violation', hint = 'contrato_id';
  end if;

  -- saldo do empenho (exceção só com justificativa e permissão de aprovar); nota sem empenho não consome saldo
  if e.id is not null then
    v_saldo := empenho_saldo(e.id, v_id);
    if v_valor > v_saldo then
      if nullif(btrim(p ->> 'excecao_saldo'), '') is null then
        raise exception 'Saldo insuficiente no empenho %: disponível %, nota de %.', e.numero || '/' || e.ano, brl(v_saldo), brl(v_valor)
          using errcode = 'check_violation', hint = 'valor';
      end if;
      if not pode(e.tenant_id, e.unidade_id, 'notas_fiscais', 'aprovar') then
        raise exception 'A nota ultrapassa o saldo do empenho (disponível %). Só quem pode aprovar exceções registra esta nota.', brl(v_saldo)
          using errcode = 'insufficient_privilege', hint = 'valor';
      end if;
    end if;
  end if;

  if jsonb_array_length(coalesce(p -> 'referencias', '[]')) = 0 then
    raise exception 'Informe ao menos um mês de referência.' using errcode = 'check_violation', hint = 'referencias';
  end if;

  -- unidades: grupo com rateio obrigatório exige escolher as componentes; rateio tem de fechar com o valor
  select count(*), count(x.valor), coalesce(sum(x.valor), 0) into v_total, v_com_valor, v_soma
    from jsonb_to_recordset(coalesce(p -> 'unidades', '[]')) x(id uuid, valor numeric);
  if v_com_valor > 0 and (v_com_valor <> v_total or v_soma <> v_valor) then
    raise exception 'O rateio precisa distribuir exatamente o valor da nota (% distribuído de %).', brl(v_soma), brl(v_valor)
      using errcode = 'check_violation', hint = 'unidades';
  end if;
  for u in select x.id, ua.nome, ua.eh_grupo, ua.regra_rateio, ua.tenant_id
             from jsonb_to_recordset(coalesce(p -> 'unidades', '[]')) x(id uuid, valor numeric)
             left join unidades_atendidas ua on ua.id = x.id loop
    if u.nome is null or u.tenant_id <> c.tenant_id then
      raise exception 'Unidade atendida não encontrada neste órgão.' using errcode = 'check_violation', hint = 'unidades';
    end if;
    if u.eh_grupo and u.regra_rateio = 'OBRIGATORIO' then
      raise exception 'O grupo "%" exige rateio: escolha as unidades que fazem parte dele, com o valor de cada uma.', u.nome
        using errcode = 'check_violation', hint = 'unidades';
    end if;
  end loop;

  perform set_config('measure.nota_rpc', 'sim', true);
  if v_id is null then
    insert into notas_fiscais (tenant_id, contrato_id, empenho_id, unidade_id, fornecedor_id, numero, serie, data_emissao,
                               processo_administrativo, valor, tipo_servico_id, periodo_inicio, periodo_fim, observacoes, excecao_saldo)
    values (c.tenant_id, c.id, e.id, c.unidade_id, c.fornecedor_id, btrim(p ->> 'numero'), nullif(btrim(p ->> 'serie'), ''),
            (p ->> 'data_emissao')::date, nullif(btrim(p ->> 'processo_administrativo'), ''), v_valor,
            nullif(p ->> 'tipo_servico_id', '')::uuid, nullif(p ->> 'periodo_inicio', '')::date, nullif(p ->> 'periodo_fim', '')::date,
            nullif(btrim(p ->> 'observacoes'), ''), case when v_valor > v_saldo then btrim(p ->> 'excecao_saldo') end)
    returning id into v_id;
  else
    update notas_fiscais set empenho_id = e.id, contrato_id = c.id, numero = btrim(p ->> 'numero'), serie = nullif(btrim(p ->> 'serie'), ''),
           data_emissao = (p ->> 'data_emissao')::date, processo_administrativo = nullif(btrim(p ->> 'processo_administrativo'), ''),
           valor = v_valor, tipo_servico_id = nullif(p ->> 'tipo_servico_id', '')::uuid,
           periodo_inicio = nullif(p ->> 'periodo_inicio', '')::date, periodo_fim = nullif(p ->> 'periodo_fim', '')::date,
           observacoes = nullif(btrim(p ->> 'observacoes'), ''),
           excecao_saldo = case when e.id is null then atual.excecao_saldo
                                when v_valor > v_saldo then btrim(p ->> 'excecao_saldo') end
     where id = v_id;
    delete from nota_referencias where nota_id = v_id;
    delete from nota_unidades where nota_id = v_id;
  end if;
  for ref in select distinct x.ano, x.mes from jsonb_to_recordset(p -> 'referencias') x(ano int, mes int) loop
    insert into nota_referencias (nota_id, ano, mes, tenant_id) values (v_id, ref.ano, ref.mes, c.tenant_id);
  end loop;
  insert into nota_unidades (nota_id, unidade_atendida_id, valor, tenant_id)
  select v_id, x.id, x.valor, c.tenant_id from jsonb_to_recordset(coalesce(p -> 'unidades', '[]')) x(id uuid, valor numeric);
  perform set_config('measure.nota_rpc', '', true);
  return v_id;
end $$;

-- Completar o empenho de nota migrada: vale empenho do contrato da nota ou de uma renovação dele
create or replace function public.vincular_empenho_nota(p_nota uuid, p_empenho uuid, p_justificativa text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; e empenhos; v_saldo numeric;
begin
  select * into n from notas_fiscais where id = p_nota;
  if n.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'editar') then
    raise exception 'Nota não encontrada ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if n.empenho_id is not null then
    raise exception 'Esta nota já tem empenho.' using errcode = 'check_violation', hint = 'empenho_id';
  end if;
  select * into e from empenhos where id = p_empenho;
  if e.id is null or not mesma_cadeia(n.contrato_id, e.contrato_id) then
    raise exception 'Escolha um empenho do contrato da nota (ou de uma renovação dele).' using errcode = 'check_violation', hint = 'empenho_id';
  end if;
  if not e.ativo then raise exception 'O empenho % está inativo.', e.numero using errcode = 'check_violation', hint = 'empenho_id'; end if;
  v_saldo := empenho_saldo(e.id);
  if n.cancelada_em is null and n.valor > v_saldo then
    if coalesce(length(btrim(p_justificativa)), 0) < 5 then
      raise exception 'Saldo insuficiente no empenho %: disponível %, nota de %. Informe a justificativa da exceção.', e.numero || '/' || e.ano, brl(v_saldo), brl(n.valor)
        using errcode = 'check_violation', hint = 'justificativa';
    end if;
    if not pode(e.tenant_id, e.unidade_id, 'notas_fiscais', 'aprovar') then
      raise exception 'A nota ultrapassa o saldo do empenho (disponível %). Só quem pode aprovar exceções faz este vínculo.', brl(v_saldo)
        using errcode = 'insufficient_privilege', hint = 'justificativa';
    end if;
  end if;
  perform set_config('measure.nota_rpc', 'sim', true);
  update notas_fiscais
     set empenho_id = e.id,
         excecao_saldo = case when n.cancelada_em is null and n.valor > v_saldo then btrim(p_justificativa) else excecao_saldo end
   where id = n.id;
end $$;

revoke execute on function public.contrato_numero_base(text), public.contratos_da_cadeia(uuid), public.mesma_cadeia(uuid, uuid) from public, anon;
-- só a lista da cadeia é usada pela tela (empenhos que podem pagar notas do contrato); as outras são internas
revoke execute on function public.contrato_numero_base(text), public.mesma_cadeia(uuid, uuid) from authenticated;
grant execute on function public.contratos_da_cadeia(uuid) to authenticated;
