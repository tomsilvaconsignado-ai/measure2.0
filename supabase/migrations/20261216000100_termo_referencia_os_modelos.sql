-- Termo de Referência do contrato e Ordens de Serviço por modelo (primeiro modelo: extintores).
--
-- 1. Termo de Referência (TR) do contrato
--    * contrato_tr_itens: serviços do TR (item, descrição, tipo, capacidade/especificação, unidade de medida,
--      quantidade, valor unitário e total). Cadastro e edição manual; "excluir" é inativar com motivo.
--    * contrato_tr_unidades: unidades atendidas pelo contrato, com o endereço do TR.
--    * tr_itens_do_contrato(): itens com a quantidade já pedida em ordens de serviço e o saldo.
-- 2. Ordens de serviço por modelo
--    * ordens_servico.modelo ('GERAL' ou 'EXTINTORES') e empenho da OS;
--    * os_itens: linhas da OS (unidade, quantidade, item do TR, tipo, capacidade, data de solicitação);
--    * emitir_ordem_servico(): documento oficial no papel timbrado (documentos_emitidos, tipo ORDEM_SERVICO),
--      assinado pelo servidor que emite (nome, cargo/função, matrícula).
-- 3. Carga do TR do contrato 001/2026 (GE Extintores), se o contrato existir.

-- =====================================================================
-- 1. Termo de Referência
-- =====================================================================
create table public.contrato_tr_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contrato_id uuid not null references public.contratos(id),
  item int not null check (item > 0),
  descricao text not null check (length(btrim(descricao)) between 3 and 500),
  tipo text check (length(btrim(tipo)) <= 120),
  especificacao text check (length(btrim(especificacao)) <= 200),
  unidade_medida text not null default 'UNIDADE' check (length(btrim(unidade_medida)) between 1 and 40),
  quantidade numeric(14,3) not null check (quantidade > 0),
  valor_unitario numeric(16,2) not null check (valor_unitario >= 0),
  valor_total numeric(16,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index tr_itens_numero on public.contrato_tr_itens (contrato_id, item) where ativo;
create index tr_itens_contrato on public.contrato_tr_itens (contrato_id);

create table public.contrato_tr_unidades (
  contrato_id uuid not null references public.contratos(id),
  unidade_atendida_id uuid not null references public.unidades_atendidas(id),
  tenant_id uuid not null references public.tenants(id),
  endereco text,
  criado_em timestamptz not null default now(), criado_por uuid,
  primary key (contrato_id, unidade_atendida_id)
);

create function public.prepara_tr() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from contratos where id = new.contrato_id;
  if v_tenant is null then raise exception 'Contrato não encontrado.' using errcode = 'foreign_key_violation'; end if;
  new.tenant_id := v_tenant;
  if tg_table_name = 'contrato_tr_unidades'
     and not exists (select 1 from unidades_atendidas where id = (to_jsonb(new) ->> 'unidade_atendida_id')::uuid and tenant_id = v_tenant) then
    raise exception 'Unidade atendida não encontrada neste órgão.' using errcode = 'check_violation', hint = 'unidade_atendida_id';
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) ->> 'contrato_id') <> (to_jsonb(old) ->> 'contrato_id') then
    raise exception 'O item não pode mudar de contrato.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger tr_itens_prepara before insert or update on public.contrato_tr_itens for each row execute function public.prepara_tr();
create trigger tr_itens_criacao before insert on public.contrato_tr_itens for each row execute function public.carimbar_criacao();
create trigger tr_itens_carimbar before update on public.contrato_tr_itens for each row execute function public.carimbar();
create trigger tr_itens_tenant before update on public.contrato_tr_itens for each row execute function public.bloquear_troca_tenant();
create trigger tr_itens_auditar after insert or update or delete on public.contrato_tr_itens for each row execute function public.auditar();
create trigger tr_itens_justificativa before update of ativo on public.contrato_tr_itens for each row execute function public.exige_justificativa_inativacao();
create trigger tr_unidades_prepara before insert on public.contrato_tr_unidades for each row execute function public.prepara_tr();
create trigger tr_unidades_criacao before insert on public.contrato_tr_unidades for each row execute function public.carimbar_criacao();
create trigger tr_unidades_auditar after insert or update or delete on public.contrato_tr_unidades for each row execute function public.auditar();

-- Quem edita o TR: quem edita o contrato, ou a plataforma (desenvolvedor)
create function public.pode_editar_tr(p_contrato uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pode_contrato(p_contrato, 'editar')
      or (eh_admin_plataforma() and exists (select 1 from contratos c where c.id = p_contrato))
$$;

alter table public.contrato_tr_itens enable row level security;
alter table public.contrato_tr_unidades enable row level security;
create policy tr_itens_ler on public.contrato_tr_itens for select to authenticated
  using (pode_contrato(contrato_id, 'ler') or designado(contrato_id) or pode_editar_tr(contrato_id));
create policy tr_itens_criar on public.contrato_tr_itens for insert to authenticated with check (pode_editar_tr(contrato_id));
create policy tr_itens_editar on public.contrato_tr_itens for update to authenticated
  using (pode_editar_tr(contrato_id)) with check (pode_editar_tr(contrato_id));
create policy tr_unidades_ler on public.contrato_tr_unidades for select to authenticated
  using (pode_contrato(contrato_id, 'ler') or designado(contrato_id) or pode_editar_tr(contrato_id));
create policy tr_unidades_incluir on public.contrato_tr_unidades for insert to authenticated with check (pode_editar_tr(contrato_id));
create policy tr_unidades_editar on public.contrato_tr_unidades for update to authenticated
  using (pode_editar_tr(contrato_id)) with check (pode_editar_tr(contrato_id));
create policy tr_unidades_remover on public.contrato_tr_unidades for delete to authenticated using (pode_editar_tr(contrato_id));
revoke all on public.contrato_tr_itens, public.contrato_tr_unidades from anon;
revoke delete on public.contrato_tr_itens from authenticated;

-- =====================================================================
-- 2. Ordens de serviço por modelo
-- =====================================================================
alter table public.ordens_servico
  add column modelo text not null default 'GERAL' check (modelo in ('GERAL', 'EXTINTORES')),
  add column empenho_id uuid references public.empenhos(id);
grant update (modelo, empenho_id) on public.ordens_servico to authenticated;

create table public.os_itens (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id),
  tenant_id uuid not null references public.tenants(id),
  ordem int not null default 1,
  unidade_atendida_id uuid not null references public.unidades_atendidas(id),
  tr_item_id uuid references public.contrato_tr_itens(id),
  quantidade numeric(14,3) not null check (quantidade > 0),
  tipo text,
  especificacao text,
  data_solicitacao date not null default (now() at time zone 'America/Sao_Paulo')::date,
  valor_unitario numeric(16,2),
  criado_em timestamptz not null default now(), criado_por uuid
);
create index os_itens_os on public.os_itens (os_id, ordem);
create index os_itens_tr on public.os_itens (tr_item_id) where tr_item_id is not null;
alter table public.os_itens enable row level security;
create policy os_itens_ler on public.os_itens for select to authenticated using (pode_os(os_id, 'ler'));
revoke all on public.os_itens from anon;
revoke insert, update, delete on public.os_itens from authenticated;  -- só por salvar_os_itens
create trigger os_itens_auditar after insert or update or delete on public.os_itens for each row execute function public.auditar();

-- Itens do TR do contrato (e das renovações dele) com o que já foi pedido em OS e o saldo
create function public.tr_itens_do_contrato(p_contrato uuid)
returns table (id uuid, contrato_id uuid, item int, descricao text, tipo text, especificacao text, unidade_medida text,
               quantidade numeric, valor_unitario numeric, valor_total numeric, observacoes text, ativo boolean, criado_por uuid,
               solicitado numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  select t.id, t.contrato_id, t.item, t.descricao, t.tipo, t.especificacao, t.unidade_medida, t.quantidade, t.valor_unitario, t.valor_total,
         t.observacoes, t.ativo, t.criado_por,
         coalesce(s.qtd, 0), t.quantidade - coalesce(s.qtd, 0)
    from contrato_tr_itens t
    left join lateral (select sum(i.quantidade) qtd from os_itens i join ordens_servico o on o.id = i.os_id
                        where i.tr_item_id = t.id and o.status <> 'CANCELADA') s on true
   where t.contrato_id in (select contratos_da_cadeia(p_contrato))
     and (pode_contrato(p_contrato, 'ler') or designado(p_contrato) or pode_editar_tr(p_contrato)
          or exists (select 1 from ordens_servico o where o.contrato_id = p_contrato and pode(o.tenant_id, o.unidade_id, 'ordens_servico', 'criar')))
   order by t.ativo desc, t.item
$$;

-- Substitui as linhas da OS (validadas): unidade do órgão, item do TR do contrato da OS (ou renovação), quantidade > 0
create function public.salvar_os_itens(p_os uuid, p_itens jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o ordens_servico; x record; t contrato_tr_itens; n int := 0;
begin
  select * into o from ordens_servico where id = p_os;
  if o.id is null or not (pode_os(p_os, 'editar') or pode_os(p_os, 'criar')) then
    raise exception 'Ordem de serviço não encontrada ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if o.status in ('CONCLUIDA', 'CANCELADA') then raise exception 'OS concluída ou cancelada não pode ser alterada.' using errcode = 'check_violation'; end if;
  delete from os_itens where os_id = p_os;
  for x in select * from jsonb_to_recordset(coalesce(p_itens, '[]')) r(unidade_atendida_id uuid, tr_item_id uuid, quantidade numeric,
                                                                        tipo text, especificacao text, data_solicitacao date) loop
    n := n + 1;
    if not exists (select 1 from unidades_atendidas where id = x.unidade_atendida_id and tenant_id = o.tenant_id) then
      raise exception 'Linha %: escolha a unidade atendida.', n using errcode = 'check_violation', hint = 'itens';
    end if;
    if coalesce(x.quantidade, 0) <= 0 then raise exception 'Linha %: informe a quantidade.', n using errcode = 'check_violation', hint = 'itens'; end if;
    t := null;
    if x.tr_item_id is not null then
      select * into t from contrato_tr_itens where id = x.tr_item_id and ativo;
      if t.id is null or o.contrato_id is null or not mesma_cadeia(t.contrato_id, o.contrato_id) then
        raise exception 'Linha %: o serviço escolhido não é do Termo de Referência deste contrato.', n using errcode = 'check_violation', hint = 'itens';
      end if;
    end if;
    insert into os_itens (os_id, tenant_id, ordem, unidade_atendida_id, tr_item_id, quantidade, tipo, especificacao, data_solicitacao, valor_unitario)
    values (p_os, o.tenant_id, n, x.unidade_atendida_id, t.id, x.quantidade,
            coalesce(nullif(btrim(x.tipo), ''), t.tipo, t.descricao), coalesce(nullif(btrim(x.especificacao), ''), t.especificacao),
            coalesce(x.data_solicitacao, hoje()), t.valor_unitario);
  end loop;
end $$;

-- Documento oficial da OS (retrato no momento da emissão)
alter table public.documentos_emitidos drop constraint documentos_emitidos_tipo_check;
alter table public.documentos_emitidos add constraint documentos_emitidos_tipo_check
  check (tipo in ('EXTRATO_CONTRATO', 'EXTRATO_EMPENHO', 'ATESTO', 'CONSOLIDADO_MENSAL', 'CHECKLIST_NOTA',
                  'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO', 'NOTIFICACAO_FORMAL', 'ORDEM_SERVICO'));
drop policy emitidos_ler on public.documentos_emitidos;
create policy emitidos_ler on public.documentos_emitidos for select to authenticated
  using (case
           when tipo in ('EXTRATO_CONTRATO', 'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO')
             then pode(tenant_id, unidade_id, 'contratos', 'ler') or designado(registro_id)
           when tipo = 'EXTRATO_EMPENHO' then pode(tenant_id, unidade_id, 'empenhos', 'ler') or designado((select contrato_id from empenhos where id = registro_id))
           when tipo = 'CONSOLIDADO_MENSAL' then pode(tenant_id, unidade_id, 'servidores', 'ler')
           when tipo = 'NOTIFICACAO_FORMAL' then nf_legivel(registro_id)
           when tipo = 'ORDEM_SERVICO' then pode_os(registro_id, 'ler')
           else nota_legivel(registro_id) end);

create function public.emitir_ordem_servico(p_os uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordens_servico; c contratos; f fornecedores; e empenhos; s servidores; v_id uuid; v_num text;
begin
  select * into o from ordens_servico where id = p_os;
  if o.id is null or not (pode_os(p_os, 'ler')) then raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found'; end if;
  if not (pode_os(p_os, 'editar') or pode_os(p_os, 'criar')) then
    raise exception 'Você não tem permissão para emitir esta ordem de serviço.' using errcode = 'insufficient_privilege';
  end if;
  if o.status = 'CANCELADA' then raise exception 'OS cancelada não gera documento.' using errcode = 'check_violation'; end if;
  if o.contrato_id is null then raise exception 'Escolha o contrato da OS antes de gerar o documento.' using errcode = 'check_violation', hint = 'contrato_id'; end if;
  if not exists (select 1 from os_itens where os_id = p_os) then
    raise exception 'Inclua ao menos uma linha (unidade e quantidade) antes de gerar o documento.' using errcode = 'check_violation', hint = 'itens';
  end if;
  select * into c from contratos where id = o.contrato_id;
  select * into f from fornecedores where id = c.fornecedor_id;
  select * into e from empenhos where id = o.empenho_id;
  select * into s from servidores where tenant_id = o.tenant_id and user_id = auth.uid() order by criado_em limit 1;
  v_num := lpad(o.numero::text, 4, '0') || '/' || o.ano;
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (o.tenant_id, o.unidade_id, 'ORDEM_SERVICO', o.id, 'ORDEM DE SERVIÇO Nº ' || v_num, jsonb_build_object(
    'orgao', cabecalho_orgao(o.tenant_id),
    'modelo', o.modelo, 'numero', v_num, 'titulo', o.titulo, 'data_abertura', o.data_abertura, 'descricao', o.descricao, 'observacoes', o.observacoes,
    'contrato', jsonb_build_object('numero', c.numero, 'objeto', c.objeto, 'inicio', c.data_inicio, 'fim', contrato_fim_atual(c.id)),
    'fornecedor', jsonb_build_object('nome', coalesce(f.razao_social, f.nome_fantasia), 'documento', f.documento, 'tipo', f.tipo_pessoa,
      'endereco', nullif(concat_ws(', ', nullif(concat_ws(', ', f.logradouro, f.numero), ''), f.complemento, f.bairro,
                    nullif(concat_ws('/', f.cidade, f.uf), ''), case when f.cep is not null then 'CEP ' || substr(f.cep, 1, 5) || '-' || substr(f.cep, 6) end), '')),
    'empenho', case when e.id is not null then e.numero || '/' || e.ano end,
    'itens', coalesce((select jsonb_agg(jsonb_build_object('unidade', ua.nome, 'quantidade', i.quantidade, 'tipo', i.tipo, 'especificacao', i.especificacao,
                                      'data_solicitacao', i.data_solicitacao) order by i.ordem)
                         from os_itens i join unidades_atendidas ua on ua.id = i.unidade_atendida_id where i.os_id = o.id), '[]'),
    'assinante', jsonb_build_object('nome', coalesce(s.nome, (select nome from perfis where id = auth.uid())),
                                    'funcao', coalesce(nullif(s.funcao, ''), s.cargo), 'matricula', s.matricula),
    'emitido_por', (select nome from perfis where id = auth.uid())))
  returning id into v_id;
  return v_id;
end $$;

-- verificação em duas etapas obrigatória (mesma regra de todas as tabelas: 20261211000100)
create policy mfa_obrigatorio on public.contrato_tr_itens as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy mfa_obrigatorio on public.contrato_tr_unidades as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy mfa_obrigatorio on public.os_itens as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke execute on function public.prepara_tr(), public.pode_editar_tr(uuid), public.tr_itens_do_contrato(uuid), public.salvar_os_itens(uuid, jsonb),
  public.emitir_ordem_servico(uuid) from public, anon;
revoke execute on function public.prepara_tr() from authenticated;
grant execute on function public.pode_editar_tr(uuid), public.tr_itens_do_contrato(uuid), public.salvar_os_itens(uuid, jsonb),
  public.emitir_ordem_servico(uuid) to authenticated;

-- =====================================================================
-- 3. Carga do TR do contrato 001/2026 (GE Extintores) — Processo 64.806/2025
-- =====================================================================
do $$
declare v_ct uuid; v_tenant uuid; v_unid int := 0; v_sem text[] := '{}'; r record; v_ua uuid;
  norm text := 'translate(lower(%s), ''áàâãäéèêëíìîïóòôõöúùûüç'', ''aaaaaeeeeiiiiooooouuuuc'')';
begin
  select c.id, c.tenant_id into v_ct, v_tenant
    from contratos c join fornecedores f on f.id = c.fornecedor_id
   where lower(btrim(c.numero)) in ('001/2026', '01/2026', '1/2026')
     and (f.razao_social ilike '%extint%' or f.nome_fantasia ilike '%extint%' or c.objeto ilike '%extint%')
   order by c.criado_em limit 1;
  if v_ct is null then raise notice 'Contrato 001/2026 de extintores não encontrado: TR não carregado.'; return; end if;
  if exists (select 1 from contrato_tr_itens where contrato_id = v_ct) then raise notice 'TR já carregado.'; return; end if;
  perform usar_justificativa('Carga do Termo de Referência (Processo 64.806/2025) do contrato 001/2026.', 0);

  insert into contrato_tr_itens (tenant_id, contrato_id, item, descricao, tipo, especificacao, unidade_medida, quantidade, valor_unitario) values
    (v_tenant, v_ct, 1, 'Manutenção e recarga de extintores - ABC 8 kg (4-A/40-B:C)', 'ABC 8 kg', '4-A/40-B:C', 'UNIDADE', 211, 59.83),
    (v_tenant, v_ct, 2, 'Manutenção e recarga de extintores - ABC 6 kg (4-A/40-B:C)', 'ABC 6 kg', '4-A/40-B:C', 'UNIDADE', 267, 71.33),
    (v_tenant, v_ct, 3, 'Manutenção e recarga de extintores - ABC 12 kg (4-A/40-B:C)', 'ABC 12 kg', '4-A/40-B:C', 'UNIDADE', 10, 78.89),
    (v_tenant, v_ct, 4, 'Manutenção e recarga de extintores - Espuma mecânica 10 L (2-A/10-B)', 'Espuma mecânica 10 L', '2-A/10-B', 'UNIDADE', 14, 170.63),
    (v_tenant, v_ct, 5, 'Manutenção e recarga de extintores - BC 8 kg (30-B:C)', 'BC 8 kg', '30-B:C', 'UNIDADE', 6, 58.06),
    (v_tenant, v_ct, 6, 'Manutenção e recarga de extintores - BC 6 kg (30-B:C)', 'BC 6 kg', '30-B:C', 'UNIDADE', 34, 51.20),
    (v_tenant, v_ct, 7, 'Manutenção e recarga de extintores - BC 4 kg (30-B:C)', 'BC 4 kg', '30-B:C', 'UNIDADE', 7, 42.99),
    (v_tenant, v_ct, 8, 'Manutenção e recarga de extintores - CO2 6 kg (5-B:C)', 'CO2 6 kg', '5-B:C', 'UNIDADE', 14, 53.77),
    (v_tenant, v_ct, 9, 'Manutenção e recarga de extintores - CO2 4 kg (5-B:C)', 'CO2 4 kg', '5-B:C', 'UNIDADE', 3, 70.58),
    (v_tenant, v_ct, 10, 'Manutenção e recarga de extintores - Água 10 L (2-A)', 'Água 10 L', '2-A', 'UNIDADE', 26, 48.00),
    (v_tenant, v_ct, 11, 'Manutenção e recarga de extintores - Carreta ABC 50 kg (20-A/80-B:C)', 'Carreta ABC 50 kg', '20-A/80-B:C', 'UNIDADE', 4, 222.44),
    (v_tenant, v_ct, 12, 'Manutenção de teste hidrostático/empatação para mangueira de incêndio (15 metros), conforme ABNT NBR 12779',
      'Mangueira de incêndio 15 m', 'Teste hidrostático / empatação (NBR 12779)', 'UNIDADE', 84, 22.50);

  -- unidades do item 10.1 do TR (procuradas no cadastro de unidades atendidas pelo nome)
  for r in select * from (values
    ('CEREST', 'Ed. Maria Feliciana, 19º andar, Centro', array['%cerest%']),
    ('CAPS Vida', 'Rua Haiti, nº 665, Bairro América', array['%caps%vida%']),
    ('CAPS Jael Patrício', 'Rua C, nº 133, Bairro Cidade Nova', array['%jael%']),
    ('CAPS Liberdade', 'Rua Distrito Federal, nº 1012, Siqueira Campos', array['%caps%liberdade%']),
    ('CAPS AD Primavera', 'Rua Firmino Fontes, nº 196, Coroa do Meio', array['%primavera%']),
    ('CEO', 'Av. Caçula Barreto, S/N, Farolândia', array['%especialidades odonto%', 'ceo']),
    ('CEMAR Siqueira Campos', 'Rua Bahia, S/N, Siqueira Campos', array['%cemar%']),
    ('CEPS', 'Rua Sergipe, S/N, Siqueira Campos', array['%ceps%']),
    ('Galpões da Logística', 'Travessa São João Batista, nº 158, Ponto Novo', array['%logistica%']),
    ('Hospital Zona Sul Des. Fernando Franco', 'Rua Antônio R. de Mendonça, S/N, Farolândia', array['%fernando franco%']),
    ('Administrativo SMS', 'Rua Nely Correia de Andrade, 50, Coroa do Meio', array['sede', 'sede %', '%administrativo%sms%']),
    ('UBS Amélia Leite', 'Rua Ten. Wendel Quaranta, nº 2005, Suissa', array['%amelia leite%']),
    ('UBS José Calumby', 'Rua N. Senhora Aparecida, nº 121, Jardim Centenário', array['%calumby%']),
    ('UBS Dr. Max de Carvalho', 'Rua Filemon, S/N, Ponto Novo', array['%ma_x de carvalho%']),
    ('UBS Manoel Souza Pereira', 'Rua Maria do Carmo A. Costa, S/N, Conj. S. Nascente', array['%manoel%pereira%']),
    ('UBS Renato Mazze Lucas', 'Rua Cap. Manoel Gomes, nº 601, Santos Dumont', array['%renato mazze%']),
    ('UBS Adel Nunes', 'Rua Haiti, nº 71, Bairro América', array['%adel nunes%']),
    ('UBS Anália Pina de Assis', 'Av. Ayrton Senna, S/N, B. A. Tamandaré', array['%analia pina%']),
    ('UBS Antônio Alves', 'Rua Firmino Fontes, nº 200, Atalaia', array['%antonio alves%']),
    ('UBS Augusto César Leite', 'Rua Elenita Nery Gomes, nº 125, Conj. Sta. Tereza', array['%augusto cesar leite%']),
    ('UBS Augusto Franco', 'Rua H 5, S/N, Conj. Augusto Franco', array['usf augusto franco', '%augusto franco']),
    ('UBS Cândida Alves', 'Rua São João, nº 313, Santo Antônio', array['%candida alves%']),
    ('UBS Carlos Fernandes de Melo', 'Av. Euclides Figueiredo, nº 56, Lamarão', array['%carlos fernandes%']),
    ('UBS Carlos Hardman Côrtes', 'Av. Carlos Marques, S/N, Soledade', array['%carlos hardm%']),
    ('UBS Dona Jovem', 'Rua Altamira, S/N, Bairro Industrial', array['%dona jovem%']),
    ('UBS Dona Sinhazinha', 'Av. Hermes Fontes, nº 2101, Grageru', array['%sinhazinha%']),
    ('UBS Edézio Vieira de Melo', 'Rua Paraíba, S/N, Siqueira Campos', array['%edezio%']),
    ('UBS Eunice Barbosa', 'Rua Beira Rio, 92, Coqueiral', array['%eunice barbosa%']),
    ('UBS Francisco Fonseca', 'Av. Álvaro Maciel, S/N, Bairro 18 do Forte', array['%francisco fonseca%']),
    ('UBS Geraldo Magela', 'Rua Central IV, S/N, Conj. Orlando Dantas', array['%geraldo magela%']),
    ('UBS Humberto Mourão', 'Rua A, S/N, São Conrado', array['%humberto mourao%']),
    ('UBS Irmã Caridade', 'Rua Principal, 101, Povoado Aloque', array['%irma caridade%']),
    ('UBS J. Quintiliano da F. Sobral', 'Rua Santa Terezinha, nº 408, Cidade Nova', array['%quintiliano%']),
    ('UBS Joaldo Barbosa', 'Rua Guanabara, S/N, Bairro América', array['%joaldo%']),
    ('UBS João Bezerra', 'Rodovia Chico Mendes, nº 421, Povoado Areia Branca', array['%joao bezerra%']),
    ('UBS João Oliveira Sobral', 'Rua Senhor do Bomfim, S/N, Santos Dumont', array['%joao oliveira sobral%']),
    ('UBS José Augusto Barreto', 'Av. Euclides Figueiredo, nº 49, Japãozinho', array['%augusto barreto%']),
    ('UBS José Machado de Souza', 'Rua Major Aureliano, nº 780, Santos Dumont', array['%machado de souza%']),
    ('UBS Lauro Dantas Hora', 'Rua M, nº 92, Jardim Centenário', array['%lauro dantas%']),
    ('UBS Maria do Céu', 'Rua Maruim, nº 179, Centro', array['%maria do ceu%']),
    ('UBS Ministro Costa Cavalcante', 'Av. Tancredo Neves, nº 1451, Jardim Esperança', array['%costa cavalcante%']),
    ('UBS Niceu Dantas', 'Rodovia dos Náufragos, S/N, Mosqueiro', array['%niceu dantas%']),
    ('UBS Onésimo Pinto', 'Av. Rad. José Silva Lima, S/N, Jd. Centenário', array['%onesimo pinto%']),
    ('UBS Osvaldo Leite', 'Rua Jazidão, S/N, Santa Maria', array['%osvaldo leite%']),
    ('UBS Porto Dantas', 'Rua Antônio dos Santos, nº 468, Porto Dantas', array['%porto dantas%']),
    ('UBS Pref. Celso Augusto Daniel', 'Rua 6, S/N, Conj. Padre Pedro, Santa Maria', array['%celso%daniel%']),
    ('UBS Sta. Terezinha (Robalo)', 'Rod. dos Náufragos, km 5, Robalo', array['%robalo%']),
    ('UBS Walter Cardoso', 'Rua B, nº 408, Veneza', array['%walter cardoso%']),
    ('UBS Hugo Gurgel', 'Rua Renato Fonseca Oliveira, nº 10, Coroa do Meio', array['%hugo gurgel%']),
    ('UBS Ávila Nabuco', 'Rua Dr. Canuto Garcia Moreno, nº 120, Conjunto Médici', array['%avila nabuco%']),
    ('UBS Oswaldo de Souza', 'Trav. Adalto Botelho, S/N, Getúlio Vargas', array['%oswaldo de souza%']),
    ('UBS Madre Teresa de Calcutá', 'Largo da Aparecida, S/N, Jabotiana', array['%madre te%calcuta%']),
    ('UBS Fernando Sampaio', 'Av. São João Batista, 986, Castelo Branco', array['%fernando sampaio%']),
    ('UBS Elizabeth Pitta', 'Rua Auxiliar 02, Santa Maria', array['%elizabeth pit%']),
    ('UBS João Cardoso Jr (CSU)', 'Rua Alagoas, S/N, José Conrado de Araújo', array['%joao cardoso%']),
    ('ZOONOSES', 'Av. Dr. Carlos Rodrigues da Cruz, nº 60', array['%zoonose%']),
    ('Conselho Municipal de Saúde', 'Rua Carlos Correia, 528, Siqueira Campos', array['%conselho%']),
    ('Síndrome gripal', 'Rua Josué de Carvalho Cunha, nº 880, Coroa do Meio', array['%sindrome gripal%']),
    ('Polo Academia da Cidade', 'Av. Beira Mar, S/N, 13 de Julho', array['%academia da cidade%'])
  ) as t(nome, endereco, padroes) loop
    v_ua := null;
    execute format('select ua.id from unidades_atendidas ua
                     where ua.tenant_id = $1 and ua.ativo and not ua.eh_grupo and %s like any ($2)
                     order by length(ua.nome) limit 1', format(norm, 'ua.nome'))
      into v_ua using v_tenant, r.padroes;
    if v_ua is null then v_sem := v_sem || r.nome; continue; end if;
    insert into contrato_tr_unidades (contrato_id, unidade_atendida_id, tenant_id, endereco) values (v_ct, v_ua, v_tenant, r.endereco)
    on conflict (contrato_id, unidade_atendida_id) do nothing;
    v_unid := v_unid + 1;
  end loop;
  raise notice 'TR carregado: 12 itens, % unidades. Não encontradas no cadastro: %', v_unid, coalesce(array_to_string(v_sem, '; '), 'nenhuma');
end $$;
