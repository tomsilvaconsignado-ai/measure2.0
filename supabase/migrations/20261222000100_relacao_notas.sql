-- Relação de notas fiscais para responder ao fornecedor ("as notas foram pagas? quando?"):
-- lista simples por CONTRATO ou por EMPRESA, filtrando a situação:
--   NAO_PAGAS        pendentes ou pagas em parte (inclui as que ainda aguardam atesto)
--   PAGAS            pagas por inteiro
--   FALTANDO_ATESTO  ainda não atestadas
--   TODAS            todas as não canceladas
-- Colunas: nota, processo, valor, fornecedor, contrato, valor pago e data do pagamento (quando pago).
-- Nota cancelada nunca entra. Segue o padrão dos documentos: retrato guardado em documentos_emitidos
-- e impressão em A4 paisagem no modelo dos extratos.
-- Permissão: só entram notas de contratos que a pessoa pode ler (ou em que está designada). Por empresa,
-- a relação junta os contratos dessa empresa que ela enxerga.

alter table public.documentos_emitidos drop constraint documentos_emitidos_tipo_check;
alter table public.documentos_emitidos add constraint documentos_emitidos_tipo_check
  check (tipo in ('EXTRATO_CONTRATO', 'EXTRATO_EMPENHO', 'ATESTO', 'CONSOLIDADO_MENSAL', 'CHECKLIST_NOTA',
                  'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO', 'NOTIFICACAO_FORMAL', 'ORDEM_SERVICO',
                  'RELACAO_NOTAS'));

-- Relação de notas: lê quem emitiu; se for por contrato, também quem pode ler o contrato.
drop policy emitidos_ler on public.documentos_emitidos;
create policy emitidos_ler on public.documentos_emitidos for select to authenticated
  using (case
           when tipo in ('EXTRATO_CONTRATO', 'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO')
             then pode(tenant_id, unidade_id, 'contratos', 'ler') or designado(registro_id)
           when tipo = 'EXTRATO_EMPENHO' then pode(tenant_id, unidade_id, 'empenhos', 'ler') or designado((select contrato_id from empenhos where id = registro_id))
           when tipo = 'CONSOLIDADO_MENSAL' then pode(tenant_id, unidade_id, 'servidores', 'ler')
           when tipo = 'NOTIFICACAO_FORMAL' then nf_legivel(registro_id)
           when tipo = 'ORDEM_SERVICO' then pode_os(registro_id, 'ler')
           when tipo = 'RELACAO_NOTAS' then emitido_por = auth.uid()
             or (dados->>'filtro' = 'CONTRATO' and (pode_contrato(registro_id, 'ler') or designado(registro_id)))
           else nota_legivel(registro_id) end);

create function public.emitir_relacao_notas(p_situacao text, p_contrato uuid default null, p_fornecedor uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c contratos; f fornecedores; v_tenant uuid; v_unidade uuid; v_registro uuid; v_id uuid; v_dados jsonb; v_rotulo text;
  v_contratos uuid[];  -- contratos que entram na relação (calculado uma vez: nada de pode()/designado() por nota)
begin
  if p_situacao not in ('NAO_PAGAS', 'PAGAS', 'FALTANDO_ATESTO', 'TODAS') then
    raise exception 'Situação inválida para a relação de notas.' using errcode = 'check_violation', hint = 'situacao';
  end if;
  if (p_contrato is null) = (p_fornecedor is null) then
    raise exception 'Escolha um contrato ou uma empresa.' using errcode = 'check_violation', hint = 'filtro';
  end if;

  if p_contrato is not null then
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

  v_rotulo := case p_situacao when 'NAO_PAGAS' then 'NÃO PAGAS' when 'PAGAS' then 'PAGAS'
                              when 'FALTANDO_ATESTO' then 'FALTANDO ATESTO' else 'TODAS' end;

  select jsonb_build_object(
    'titulo', 'RELAÇÃO DE NOTAS FISCAIS - ' || v_rotulo,
    'situacao', p_situacao,
    'filtro', case when p_contrato is not null then 'CONTRATO' else 'EMPRESA' end,
    'orgao', cabecalho_orgao(v_tenant),
    'orgao_curto', (select nome_curto from tenants where id = v_tenant),
    'unidade', (select jsonb_build_object('nome', nome, 'sigla', sigla) from unidades_organizacionais where id = v_unidade),
    'contrato', case when p_contrato is not null then jsonb_build_object('numero', c.numero, 'objeto', c.objeto) end,
    'fornecedor', jsonb_build_object('nome', coalesce(f.razao_social, f.nome_fantasia), 'documento', f.documento, 'tipo_pessoa', f.tipo_pessoa),
    'notas', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', n.numero || coalesce('-' || n.serie, ''), 'data', n.data_emissao,
        'processo', n.processo_administrativo, 'valor', n.valor,
        'fornecedor', (select coalesce(razao_social, nome_fantasia) from fornecedores where id = n.fornecedor_id),
        'contrato', ct.numero,
        'atesto', n.status_atesto, 'pagamento', n.status_pagamento,
        'pago', pg.bruto, 'liquido', pg.liquido,
        'pagamentos', pg.lista)
        order by ct.numero, n.data_emissao, n.criado_em, n.numero)
      from notas_fiscais n
      join contratos ct on ct.id = n.contrato_id
      cross join lateral (
        select coalesce(sum(p.valor), 0) bruto, coalesce(sum(p.valor_liquido), 0) liquido,
               coalesce(jsonb_agg(jsonb_build_object('data', p.data_pagamento, 'valor', p.valor, 'liquido', p.valor_liquido)
                                  order by p.data_pagamento, p.registrado_em) filter (where p.id is not null), '[]') lista
          from nota_pagamentos p where p.nota_id = n.id and p.cancelado_em is null) pg
      where n.cancelada_em is null
        and n.contrato_id = any(v_contratos)
        and (p_contrato is not null or n.fornecedor_id = f.id)
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
          'Relação de notas · ' || lower(v_rotulo) || ' · ' ||
            case when p_contrato is not null then 'contrato ' || c.numero else coalesce(f.razao_social, f.nome_fantasia) end,
          v_dados) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.emitir_relacao_notas(text, uuid, uuid) from public, anon;
grant execute on function public.emitir_relacao_notas(text, uuid, uuid) to authenticated;
