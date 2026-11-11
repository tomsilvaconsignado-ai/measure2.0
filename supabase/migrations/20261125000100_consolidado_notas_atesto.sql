-- Ajustes solicitados em 08/11/2026:
--   1. Servidores: "Entra nos consolidados?" (padrão SIM). Quem está com NÃO continua cadastrado, mas fica fora
--      do consolidado mensal (lista, férias do mês e documento emitido, que usam consolidado_mensal).
--   2. Notas fiscais: editar (inclusive nota migrada sem empenho) e excluir sem cancelar. A exclusão é física,
--      exceção autorizada pelo usuário, e só vale para nota "limpa": sem atesto, sem pagamento (nem cancelado),
--      sem documento emitido e não cancelada. A auditoria guarda a cópia completa da nota e o motivo.
--   3. Atesto: a visão das unidades da nota passa a trazer a sigla (o texto usa sigla, ou o tipo, sem repetir).

-- =====================================================================
-- 1. Servidores: entra nos consolidados?
-- =====================================================================

alter table public.servidores add column entra_consolidado boolean not null default true;
grant update (entra_consolidado) on public.servidores to authenticated;

CREATE OR REPLACE FUNCTION public.consolidado_mensal(p_tenant uuid, p_unidade uuid, p_ano integer, p_mes integer)
 RETURNS TABLE(servidor_id uuid, matricula text, nome text, cargo text, funcao text, unidade_sigla text, unidade_nome text, data_nomeacao date, data_exoneracao date, atrasos integer, faltas integer, justificativa_anexada boolean, observacao_manual text, observacao text, pode_editar boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ini date; v_fim date;
begin
  if p_mes not between 1 and 12 or p_ano not between 2000 and 2100 then
    raise exception 'Mês ou ano de referência inválido.' using hint = 'mes';
  end if;
  if not pode(p_tenant, p_unidade, 'servidores', 'ler') then
    raise exception 'Você não tem acesso aos servidores desta unidade.' using errcode = 'insufficient_privilege';
  end if;
  if p_unidade is not null and not exists (select 1 from unidades_organizacionais where id = p_unidade and tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using hint = 'unidade';
  end if;
  v_ini := make_date(p_ano, p_mes, 1);
  v_fim := (v_ini + interval '1 month - 1 day')::date;
  return query
    select s.id, s.matricula, s.nome, s.cargo, s.funcao, u.sigla, u.nome,
           s.data_nomeacao, s.data_exoneracao, f.atrasos, f.faltas, coalesce(f.justificativa_anexada, false),
           f.observacao,
           observacao_frequencia(s.data_nomeacao, s.data_exoneracao, p_ano, p_mes, f.atrasos, f.faltas, coalesce(f.justificativa_anexada, false), f.observacao),
           (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'editar') a)
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
      left join frequencias_mensais f on f.servidor_id = s.id and f.ano = p_ano and f.mes = p_mes
     where s.tenant_id = p_tenant
       and (p_unidade is null or p_unidade = any(u.caminho))
       and (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'ler') a)
       -- só quem está marcado para entrar nos consolidados
       and s.entra_consolidado
       -- só quem tem data de nomeação no cadastro, nomeado até o fim do mês
       and s.data_nomeacao is not null and s.data_nomeacao <= v_fim
       and (s.data_exoneracao is null or s.data_exoneracao >= v_ini)
     order by lower(s.nome), s.matricula;
end $function$;

-- =====================================================================
-- 2a. Notas fiscais: edição (a nota migrada sem empenho também pode ser corrigida)
-- =====================================================================

create or replace function public.salvar_nota_fiscal(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_empenho uuid := nullif(p ->> 'empenho_id', '')::uuid;
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
  end if;

  if v_empenho is not null then
    select * into e from empenhos where id = v_empenho;
    if e.id is null then raise exception 'Escolha o empenho.' using errcode = 'check_violation', hint = 'empenho_id'; end if;
    select * into c from contratos where id = e.contrato_id;
  elsif v_id is not null and atual.empenho_id is null then
    -- nota migrada sem empenho: corrige os dados e continua sem empenho (o vínculo é feito em vincular_empenho_nota)
    select * into c from contratos where id = atual.contrato_id;
  else
    raise exception 'Escolha o empenho.' using errcode = 'check_violation', hint = 'empenho_id';
  end if;

  if v_id is null then
    if not pode(e.tenant_id, e.unidade_id, 'notas_fiscais', 'criar') then
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
    values (e.tenant_id, c.id, e.id, c.unidade_id, c.fornecedor_id, btrim(p ->> 'numero'), nullif(btrim(p ->> 'serie'), ''),
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

-- =====================================================================
-- 2b. Notas fiscais: exclusão (distinta do cancelamento)
-- =====================================================================

-- Por que a nota não pode ser excluída (null = pode). Usada pela tela e pela exclusão.
create function public.impedimento_exclusao_nota(p_nota uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when n.id is null or not nota_legivel(n.id) then 'Nota não encontrada.'
    when n.cancelada_em is not null then 'Nota cancelada fica no histórico e não pode ser excluída.'
    when exists (select 1 from nota_atestos a where a.nota_id = n.id) then 'A nota já foi atestada. Use o cancelamento.'
    when exists (select 1 from nota_pagamentos pg where pg.nota_id = n.id) then 'A nota tem pagamento registrado (mesmo que cancelado). Use o cancelamento.'
    when exists (select 1 from documentos_emitidos d where d.registro_id = n.id) then 'A nota tem documento emitido (atesto ou checklist). Use o cancelamento.'
  end
  from (select 1) x left join notas_fiscais n on n.id = p_nota
$$;

create function public.excluir_nota(p_nota uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; v_impedimento text;
begin
  select * into n from notas_fiscais where id = p_nota for update;
  if n.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'excluir') then
    raise exception 'Nota não encontrada ou sem permissão para excluir.' using errcode = 'insufficient_privilege';
  end if;
  v_impedimento := impedimento_exclusao_nota(p_nota);
  if v_impedimento is not null then
    raise exception '%', v_impedimento using errcode = 'check_violation';
  end if;
  perform usar_justificativa(p_motivo, 5);
  -- anexos: exclusão lógica (o arquivo continua guardado)
  update documentos set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = 'Nota excluída: ' || btrim(p_motivo)
   where recurso = 'notas_fiscais' and registro_id = p_nota and excluido_em is null;
  -- a auditoria (gatilho) guarda o retrato completo de cada linha removida, com o motivo
  delete from nota_referencias where nota_id = p_nota;
  delete from nota_unidades where nota_id = p_nota;
  delete from notas_fiscais where id = p_nota;
end $$;

-- =====================================================================
-- 3. Atesto: sigla das unidades da nota
-- =====================================================================

create or replace view public.v_nota_unidades with (security_invoker = false) as
select nu.nota_id, nu.valor, ua.id as unidade_id, ua.nome, ua.tipo, ua.eh_grupo, nullif(btrim(ua.sigla), '') as sigla
  from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id
 where nota_legivel(nu.nota_id);

grant select on public.v_nota_unidades to authenticated;
revoke all on public.v_nota_unidades from anon;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function public.impedimento_exclusao_nota(uuid), public.excluir_nota(uuid, text) from public, anon;
grant execute on function public.impedimento_exclusao_nota(uuid), public.excluir_nota(uuid, text) to authenticated;
