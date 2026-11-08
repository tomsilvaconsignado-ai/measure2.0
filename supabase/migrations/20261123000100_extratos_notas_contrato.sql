-- Extratos de notas do contrato (modelo aprovado pelo Controle Interno, vindo do sistema anterior):
--   EXTRATO_NOTAS     1 - histórico de notas fiscais do contrato (pago, retido e pendência por nota)
--   EXTRATO_UNIDADES  2 - histórico por unidade de saúde (com resumo por unidade)
--   EXTRATO_RATEIO    3 - rateio por unidade (uma linha por unidade de cada nota, com resumo)
-- Os três usam o mesmo retrato; o modelo só muda a apresentação.
-- Diferença em relação ao sistema anterior: nota cancelada aparece na lista, mas não entra no
-- "total utilizado" nem no saldo (no antigo ela era somada).

alter table public.documentos_emitidos drop constraint documentos_emitidos_tipo_check;
alter table public.documentos_emitidos add constraint documentos_emitidos_tipo_check
  check (tipo in ('EXTRATO_CONTRATO', 'EXTRATO_EMPENHO', 'ATESTO', 'CONSOLIDADO_MENSAL', 'CHECKLIST_NOTA',
                  'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO'));

drop policy emitidos_ler on public.documentos_emitidos;
create policy emitidos_ler on public.documentos_emitidos for select to authenticated
  using (case
           when tipo in ('EXTRATO_CONTRATO', 'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO')
             then pode(tenant_id, unidade_id, 'contratos', 'ler') or designado(registro_id)
           when tipo = 'EXTRATO_EMPENHO' then pode(tenant_id, unidade_id, 'empenhos', 'ler') or designado((select contrato_id from empenhos where id = registro_id))
           when tipo = 'CONSOLIDADO_MENSAL' then pode(tenant_id, unidade_id, 'servidores', 'ler')
           else nota_legivel(registro_id) end);

-- Unidade da nota para os extratos:
--   uma unidade atendida        -> o nome dela
--   várias do mesmo tipo        -> o tipo (ex.: USF, CAPS)
--   várias de tipos diferentes  -> "Diversas"
--   nenhuma (nota migrada)      -> o local registrado no sistema anterior, se houver
create function public.unidade_da_nota(p_nota uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when count(*) = 1 then min(ua.nome)
                 when count(distinct ua.tipo) = 1 then min(ua.tipo)
                 when count(*) > 1 then 'Diversas' end
       from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = p_nota),
    (select nullif(btrim(substring(observacoes from 'Local no sistema anterior: ([^\n]+)')), '') from notas_fiscais where id = p_nota),
    'Não informada')
$$;

create function public.emitir_extrato_notas(p_contrato uuid, p_modelo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c contratos; v_id uuid; v_dados jsonb; v_titulo text;
  meses constant text[] := array['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
begin
  if p_modelo not in ('EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO') then
    raise exception 'Modelo de extrato inválido.' using errcode = 'check_violation';
  end if;
  if not (pode_contrato(p_contrato, 'ler') or designado(p_contrato)) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from contratos where id = p_contrato;
  v_titulo := case p_modelo when 'EXTRATO_NOTAS' then 'EXTRATO 1 - HISTÓRICO DE NOTAS FISCAIS DO CONTRATO'
                            when 'EXTRATO_UNIDADES' then 'EXTRATO 2 - HISTÓRICO POR UNIDADE DE SAÚDE'
                            else 'EXTRATO 3 - RATEIO POR UNIDADE' end;
  select jsonb_build_object(
    'modelo', p_modelo,
    'titulo', v_titulo,
    'orgao', cabecalho_orgao(c.tenant_id),
    'orgao_curto', (select nome_curto from tenants where id = c.tenant_id),
    'unidade', (select jsonb_build_object('nome', nome, 'sigla', sigla) from unidades_organizacionais where id = c.unidade_id),
    'contrato', jsonb_build_object('numero', c.numero, 'objeto', c.objeto, 'data_inicio', c.data_inicio, 'data_fim', contrato_fim_atual(c.id),
                                   'valor_global', c.valor_global, 'valor_atual', contrato_valor_atual(c.id)),
    'fornecedor', (select coalesce(razao_social, nome_fantasia) from fornecedores where id = c.fornecedor_id),
    'notas', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', n.numero || coalesce('-' || n.serie, ''), 'data', n.data_emissao, 'valor', n.valor,
        'fornecedor', (select coalesce(razao_social, nome_fantasia) from fornecedores where id = n.fornecedor_id),
        'cancelada', n.cancelada_em is not null, 'pagamento', n.status_pagamento,
        'pago', pg.bruto, 'liquido', pg.liquido, 'retido', pg.bruto - pg.liquido,
        'unidade', unidade_da_nota(n.id),
        'referencia', (select string_agg(meses[r.mes] || '/' || r.ano, ', ' order by r.ano, r.mes) from nota_referencias r where r.nota_id = n.id),
        'rateio', coalesce((select jsonb_agg(jsonb_build_object('unidade', ua.nome, 'valor', nu.valor) order by ua.nome)
                   from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = n.id), '[]'))
        order by n.data_emissao, n.criado_em, n.numero)
      from notas_fiscais n
      cross join lateral (select coalesce(sum(p.valor), 0) bruto, coalesce(sum(p.valor_liquido), 0) liquido
                            from nota_pagamentos p where p.nota_id = n.id and p.cancelado_em is null) pg
      where n.contrato_id = c.id), '[]'),
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now()
  ) into v_dados;
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (c.tenant_id, c.unidade_id, p_modelo, c.id,
          case p_modelo when 'EXTRATO_NOTAS' then 'Extrato 1 · Histórico de notas' when 'EXTRATO_UNIDADES' then 'Extrato 2 · Histórico por unidade'
                        else 'Extrato 3 · Rateio por unidade' end || ' · contrato ' || c.numero, v_dados) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.unidade_da_nota(uuid), public.emitir_extrato_notas(uuid, text) from public, anon;
revoke execute on function public.unidade_da_nota(uuid) from authenticated;
grant execute on function public.emitir_extrato_notas(uuid, text) to authenticated;
