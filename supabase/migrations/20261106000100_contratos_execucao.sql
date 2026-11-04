-- MEASURE 2.0 — Fases 3 e 4: contratos e execução financeira
--
-- Contratos (designações de gestor/fiscal/suplente, dotações N:N, aditivos, renovações),
-- empenhos (classificação específica, reforços, unidades atendidas), notas fiscais
-- (referências mensais, rateio por unidade, atesto por designação, pagamentos) e
-- documentos emitidos com retrato imutável dos dados (snapshot).
--
-- Regras financeiras (docs/DECISOES_PENDENTES.md):
--   * valor atual do contrato = valor global + aditivos aprovados (o original nunca é sobrescrito);
--   * saldo do empenho = valor + reforços ativos − notas fiscais não canceladas;
--   * nota acima do saldo só com justificativa e permissão de aprovar (exceção registrada);
--   * pagamento parcial permitido: PARCIAL até a soma dos pagamentos igualar o valor da nota;
--   * nada é apagado: cancelamentos guardam quem, quando e por quê, e saem dos totais ativos.

-- =====================================================================
-- Catálogo de modalidades (Lei 14.133/2021 e procedimentos usuais)
-- =====================================================================

create table public.modalidades_contratacao (
  codigo text primary key,
  nome text not null,
  descricao text not null,
  ordem int not null default 0
);
insert into public.modalidades_contratacao values
  ('PREGAO_ELETRONICO', 'Pregão eletrônico', 'Aquisição de bens e serviços comuns pelo critério de menor preço ou maior desconto, em sessão pública pela internet.', 10),
  ('PREGAO_PRESENCIAL', 'Pregão presencial', 'Pregão realizado em sessão presencial, admitido excepcionalmente com justificativa.', 20),
  ('CONCORRENCIA', 'Concorrência', 'Bens e serviços especiais e obras e serviços comuns e especiais de engenharia.', 30),
  ('CONCURSO', 'Concurso', 'Escolha de trabalho técnico, científico ou artístico, com prêmio ou remuneração ao vencedor.', 40),
  ('LEILAO', 'Leilão', 'Alienação de bens imóveis ou móveis inservíveis ou legalmente apreendidos.', 50),
  ('DIALOGO_COMPETITIVO', 'Diálogo competitivo', 'Contratação de obras, serviços e compras com diálogos com licitantes previamente selecionados.', 60),
  ('DISPENSA', 'Dispensa de licitação', 'Contratação direta nas hipóteses do art. 75 da Lei 14.133/2021 (valor, emergência e outras).', 70),
  ('INEXIGIBILIDADE', 'Inexigibilidade', 'Contratação direta quando a competição é inviável (art. 74 da Lei 14.133/2021).', 80),
  ('ADESAO_ATA', 'Adesão a ata de registro de preços', 'Utilização de ata de registro de preços de outro órgão ("carona"), nos limites legais.', 90),
  ('CREDENCIAMENTO', 'Credenciamento', 'Procedimento auxiliar em que a Administração credencia todos os interessados que atendem aos requisitos.', 100),
  ('OUTRA', 'Outra', 'Outra forma de contratação prevista em lei; detalhar nas observações.', 999);

-- =====================================================================
-- Contratos
-- =====================================================================

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  -- Coordenação/unidade responsável (define o escopo de acesso)
  unidade_id uuid not null references public.unidades_organizacionais(id),
  numero text not null check (length(btrim(numero)) between 1 and 40),
  modalidade text not null references public.modalidades_contratacao(codigo),
  fornecedor_id uuid not null references public.fornecedores(id),
  processo_administrativo text,
  numero_licitacao text,
  objeto text not null check (length(btrim(objeto)) between 3 and 4000),
  data_inicio date not null,
  data_fim date not null,
  valor_global numeric(16,2) not null check (valor_global > 0),
  observacoes text,
  contrato_origem_id uuid references public.contratos(id),
  numero_renovacao int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (data_fim >= data_inicio)
);
create unique index contratos_numero_unico on public.contratos (tenant_id, lower(btrim(numero)));
create index contratos_fornecedor on public.contratos (fornecedor_id);
create index contratos_unidade on public.contratos (unidade_id);
create index contratos_busca on public.contratos using gin ((lower(numero || ' ' || objeto || ' ' || coalesce(processo_administrativo, ''))) extensions.gin_trgm_ops);

create table public.contrato_designacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contrato_id uuid not null references public.contratos(id),
  servidor_id uuid not null references public.servidores(id),
  papel text not null check (papel in ('GESTOR', 'FISCAL', 'SUPLENTE')),
  inicio date not null default (now() at time zone 'America/Sao_Paulo')::date,
  fim date,
  portaria text,
  motivo_fim text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (fim is null or fim >= inicio)
);
create unique index designacoes_ativa_unica on public.contrato_designacoes (contrato_id, papel, servidor_id) where fim is null;
create index designacoes_servidor on public.contrato_designacoes (servidor_id) where fim is null;

create table public.contrato_dotacoes (
  contrato_id uuid not null references public.contratos(id),
  classificacao_id uuid not null references public.classificacoes_orcamentarias(id),
  tenant_id uuid not null references public.tenants(id),
  criado_em timestamptz not null default now(), criado_por uuid,
  primary key (contrato_id, classificacao_id)
);

create table public.contrato_aditivos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contrato_id uuid not null references public.contratos(id),
  numero text not null,
  tipo text not null check (tipo in ('PRAZO', 'VALOR', 'PRAZO_E_VALOR', 'SUPRESSAO', 'OUTRO')),
  data_assinatura date,
  nova_data_fim date,
  -- acréscimo (positivo) ou supressão (negativo)
  valor numeric(16,2) not null default 0,
  descricao text not null check (length(btrim(descricao)) >= 5),
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'APROVADO', 'REJEITADO')),
  decidido_por uuid, decidido_em timestamptz, motivo_decisao text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (tipo not in ('PRAZO', 'PRAZO_E_VALOR') or nova_data_fim is not null),
  check (tipo not in ('VALOR', 'PRAZO_E_VALOR') or valor <> 0),
  check (tipo <> 'SUPRESSAO' or valor < 0)
);
create unique index aditivos_numero_unico on public.contrato_aditivos (contrato_id, lower(btrim(numero)));

-- =====================================================================
-- Empenhos
-- =====================================================================

create table public.empenhos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contrato_id uuid not null references public.contratos(id),
  unidade_id uuid not null references public.unidades_organizacionais(id),   -- copiada do contrato
  fornecedor_id uuid not null references public.fornecedores(id),            -- copiado do contrato
  numero text not null check (length(btrim(numero)) between 1 and 40),
  ano int not null check (ano between 2000 and 2100),
  tipo text not null default 'ORDINARIO' check (tipo in ('ORDINARIO', 'ESTIMATIVO', 'GLOBAL')),
  data_empenho date not null,
  vigencia_fim date,
  valor numeric(16,2) not null check (valor > 0),
  classificacao_id uuid not null references public.classificacoes_orcamentarias(id),
  processo text,
  sd text,
  licitacao text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index empenhos_numero_unico on public.empenhos (tenant_id, ano, lower(btrim(numero)));
create index empenhos_contrato on public.empenhos (contrato_id);
create index empenhos_classificacao on public.empenhos (classificacao_id);

create table public.empenho_unidades (
  empenho_id uuid not null references public.empenhos(id),
  unidade_atendida_id uuid not null references public.unidades_atendidas(id),
  tenant_id uuid not null references public.tenants(id),
  primary key (empenho_id, unidade_atendida_id)
);

create table public.empenho_reforcos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  empenho_id uuid not null references public.empenhos(id),
  numero text,
  data date not null,
  valor numeric(16,2) not null check (valor > 0),
  motivo text,
  cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create index reforcos_empenho on public.empenho_reforcos (empenho_id);

-- =====================================================================
-- Notas fiscais
-- =====================================================================

create table public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contrato_id uuid not null references public.contratos(id),
  empenho_id uuid not null references public.empenhos(id),
  unidade_id uuid not null references public.unidades_organizacionais(id),   -- do contrato
  fornecedor_id uuid not null references public.fornecedores(id),            -- do contrato
  numero text not null check (length(btrim(numero)) between 1 and 40),
  serie text,
  data_emissao date not null,
  data_inclusao timestamptz not null default now(),
  processo_administrativo text,
  valor numeric(16,2) not null check (valor > 0),
  tipo_servico_id uuid references public.tipos_servico(id),
  periodo_inicio date,
  periodo_fim date,
  observacoes text,
  status_atesto text not null default 'PENDENTE' check (status_atesto in ('PENDENTE', 'ATESTADA')),
  status_pagamento text not null default 'PENDENTE' check (status_pagamento in ('PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADA')),
  excecao_saldo text,
  cancelada_em timestamptz, cancelada_por uuid, motivo_cancelamento text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (periodo_fim is null or periodo_inicio is null or periodo_fim >= periodo_inicio)
);
create unique index notas_numero_unico on public.notas_fiscais (tenant_id, fornecedor_id, lower(btrim(numero)), coalesce(lower(btrim(serie)), ''));
create index notas_empenho on public.notas_fiscais (empenho_id);
create index notas_contrato on public.notas_fiscais (contrato_id);
create index notas_emissao on public.notas_fiscais (tenant_id, data_emissao desc);

create table public.nota_referencias (
  nota_id uuid not null references public.notas_fiscais(id),
  ano int not null check (ano between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  tenant_id uuid not null references public.tenants(id),
  primary key (nota_id, ano, mes)
);

-- Unidades atendidas pela nota; valor preenchido = rateio (a soma tem de fechar com a nota)
create table public.nota_unidades (
  nota_id uuid not null references public.notas_fiscais(id),
  unidade_atendida_id uuid not null references public.unidades_atendidas(id),
  valor numeric(16,2) check (valor is null or valor > 0),
  tenant_id uuid not null references public.tenants(id),
  primary key (nota_id, unidade_atendida_id)
);

create table public.nota_atestos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  nota_id uuid not null references public.notas_fiscais(id),
  servidor_id uuid not null references public.servidores(id),
  user_id uuid not null references public.perfis(id),
  papel text not null check (papel in ('GESTOR', 'FISCAL', 'SUPLENTE')),
  texto text not null,
  atestado_em timestamptz not null default now()
);
create index atestos_nota on public.nota_atestos (nota_id);

create table public.nota_pagamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  nota_id uuid not null references public.notas_fiscais(id),
  data_pagamento date not null,
  valor numeric(16,2) not null check (valor > 0),
  documento text,
  observacao text,
  registrado_por uuid not null default auth.uid(),
  registrado_em timestamptz not null default now(),
  cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text
);
create index pagamentos_nota on public.nota_pagamentos (nota_id);

-- Documentos emitidos: retrato imutável dos dados no momento da emissão
create table public.documentos_emitidos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  unidade_id uuid references public.unidades_organizacionais(id),
  tipo text not null check (tipo in ('EXTRATO_CONTRATO', 'EXTRATO_EMPENHO', 'ATESTO')),
  registro_id uuid not null,
  titulo text not null,
  dados jsonb not null,
  emitido_por uuid not null default auth.uid(),
  emitido_em timestamptz not null default now()
);
create index emitidos_registro on public.documentos_emitidos (registro_id, emitido_em desc);

-- =====================================================================
-- Funções de apoio
-- =====================================================================

-- A pessoa logada está designada (gestor/fiscal/suplente vigente) no contrato?
create function public.designado(p_contrato uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from contrato_designacoes d
      join servidores s on s.id = d.servidor_id
      join perfis p on p.id = s.user_id and p.ativo
      join tenants t on t.id = d.tenant_id and t.ativo
     where d.contrato_id = p_contrato and s.user_id = auth.uid() and d.fim is null and d.inicio <= hoje()
  )
$$;

create function public.contrato_de_nota(p_nota uuid) returns uuid
language sql stable security definer set search_path = public as $$ select contrato_id from notas_fiscais where id = p_nota $$;

-- Valor atual e fim atual do contrato (original + aditivos aprovados)
create function public.contrato_valor_atual(p_contrato uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select c.valor_global + coalesce((select sum(a.valor) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO'), 0)
    from contratos c where c.id = p_contrato
$$;

create function public.contrato_fim_atual(p_contrato uuid) returns date
language sql stable security definer set search_path = public as $$
  select greatest(c.data_fim, coalesce((select max(a.nova_data_fim) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO'), c.data_fim))
    from contratos c where c.id = p_contrato
$$;

create function public.empenho_saldo(p_empenho uuid, p_ignorar_nota uuid default null) returns numeric
language sql stable security definer set search_path = public as $$
  select e.valor
       + coalesce((select sum(r.valor) from empenho_reforcos r where r.empenho_id = e.id and r.cancelado_em is null), 0)
       - coalesce((select sum(n.valor) from notas_fiscais n where n.empenho_id = e.id and n.cancelada_em is null
                    and n.id is distinct from p_ignorar_nota), 0)
    from empenhos e where e.id = p_empenho
$$;

create function public.brl(p numeric) returns text
language sql immutable set search_path = public as $$
  -- ',' e '.' no to_char são separadores fixos (não dependem do idioma do servidor); depois troca para o padrão brasileiro
  select case when coalesce(p, 0) < 0 then '-' else '' end || 'R$ '
      || replace(replace(replace(to_char(abs(coalesce(p, 0)), 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.')
$$;

-- =====================================================================
-- Gatilhos de integridade
-- =====================================================================

create function public.prepara_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
declare f fornecedores; o contratos;
begin
  if not exists (select 1 from unidades_organizacionais where id = new.unidade_id and tenant_id = new.tenant_id) then
    raise exception 'A unidade responsável não pertence a este órgão.' using errcode = 'check_violation', hint = 'unidade_id';
  end if;
  select * into f from fornecedores where id = new.fornecedor_id;
  if f.id is null or f.tenant_id <> new.tenant_id then
    raise exception 'Fornecedor não encontrado neste órgão.' using errcode = 'check_violation', hint = 'fornecedor_id';
  end if;
  if (tg_op = 'INSERT' or new.fornecedor_id <> old.fornecedor_id) and not f.ativo then
    raise exception 'O fornecedor % está inativo.', f.razao_social using errcode = 'check_violation', hint = 'fornecedor_id';
  end if;
  if tg_op = 'UPDATE' and new.fornecedor_id <> old.fornecedor_id
     and exists (select 1 from empenhos where contrato_id = new.id) then
    raise exception 'O fornecedor não pode ser trocado: o contrato já tem empenhos.' using errcode = 'check_violation', hint = 'fornecedor_id';
  end if;
  if new.contrato_origem_id is not null then
    select * into o from contratos where id = new.contrato_origem_id;
    if o.id is null or o.tenant_id <> new.tenant_id or o.id = new.id then
      raise exception 'Contrato de origem inválido.' using errcode = 'check_violation', hint = 'contrato_origem_id';
    end if;
    new.numero_renovacao := o.numero_renovacao + 1;
  else
    new.numero_renovacao := 0;
  end if;
  return new;
end $$;

create function public.prepara_designacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare s servidores;
begin
  select tenant_id into new.tenant_id from contratos where id = new.contrato_id;
  select * into s from servidores where id = new.servidor_id;
  if s.id is null or s.tenant_id <> new.tenant_id then
    raise exception 'O servidor não pertence a este órgão.' using errcode = 'check_violation', hint = 'servidor_id';
  end if;
  if tg_op = 'INSERT' and s.data_exoneracao is not null and s.data_exoneracao <= hoje() then
    raise exception '% está exonerado(a) e não pode ser designado(a).', s.nome using errcode = 'check_violation', hint = 'servidor_id';
  end if;
  if tg_op = 'UPDATE' and (new.contrato_id <> old.contrato_id or new.servidor_id <> old.servidor_id or new.papel <> old.papel) then
    raise exception 'Para trocar o responsável, encerre a designação e crie outra (o histórico é mantido).' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.fim is not null and new.fim is distinct from old.fim then
    raise exception 'Designação já encerrada não pode ser alterada.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create function public.prepara_dotacao_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from empenhos where contrato_id = old.contrato_id and classificacao_id = old.classificacao_id) then
      raise exception 'Esta dotação já é usada por empenho do contrato e não pode ser removida.' using errcode = 'check_violation', hint = 'classificacao_id';
    end if;
    return old;
  end if;
  select tenant_id into new.tenant_id from contratos where id = new.contrato_id;
  if not exists (select 1 from classificacoes_orcamentarias where id = new.classificacao_id and tenant_id = new.tenant_id and ativo) then
    raise exception 'Dotação não encontrada ou inativa neste órgão.' using errcode = 'check_violation', hint = 'classificacao_id';
  end if;
  return new;
end $$;

create function public.prepara_aditivo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select tenant_id into new.tenant_id from contratos where id = new.contrato_id;
  if tg_op = 'UPDATE' then
    if old.status <> 'RASCUNHO' and current_setting('measure.decidindo_aditivo', true) is distinct from 'sim' then
      raise exception 'Aditivo já % não pode ser alterado.', lower(old.status) using errcode = 'check_violation';
    end if;
    if new.status <> old.status and current_setting('measure.decidindo_aditivo', true) is distinct from 'sim' then
      raise exception 'Use Aprovar/Rejeitar para decidir o aditivo.' using errcode = 'check_violation';
    end if;
  elsif new.status <> 'RASCUNHO' then
    raise exception 'O aditivo nasce como rascunho.' using errcode = 'check_violation';
  end if;
  if new.nova_data_fim is not null and new.nova_data_fim <= contrato_fim_atual(new.contrato_id) and new.status = 'RASCUNHO' then
    raise exception 'A nova data final deve ser posterior à vigência atual (%).', to_char(contrato_fim_atual(new.contrato_id), 'DD/MM/YYYY')
      using errcode = 'check_violation', hint = 'nova_data_fim';
  end if;
  return new;
end $$;

create function public.prepara_empenho() returns trigger
language plpgsql security definer set search_path = public as $$
declare c contratos;
begin
  select * into c from contratos where id = new.contrato_id;
  if c.id is null or c.tenant_id <> new.tenant_id then
    raise exception 'Contrato não encontrado neste órgão.' using errcode = 'check_violation', hint = 'contrato_id';
  end if;
  if tg_op = 'UPDATE' and new.contrato_id <> old.contrato_id then
    raise exception 'O contrato do empenho não pode ser trocado.' using errcode = 'check_violation', hint = 'contrato_id';
  end if;
  if tg_op = 'INSERT' and not c.ativo then
    raise exception 'O contrato % está inativo.', c.numero using errcode = 'check_violation', hint = 'contrato_id';
  end if;
  new.unidade_id := c.unidade_id;
  new.fornecedor_id := c.fornecedor_id;
  if not exists (select 1 from contrato_dotacoes where contrato_id = c.id and classificacao_id = new.classificacao_id) then
    raise exception 'A dotação escolhida não está vinculada ao contrato %. Vincule-a na aba Dotação do contrato.', c.numero
      using errcode = 'check_violation', hint = 'classificacao_id';
  end if;
  if tg_op = 'UPDATE' and new.valor < old.valor and empenho_saldo(new.id) - (old.valor - new.valor) < 0 then
    raise exception 'O valor não pode ficar abaixo do já utilizado em notas fiscais.' using errcode = 'check_violation', hint = 'valor';
  end if;
  return new;
end $$;

create function public.herda_empenho() returns trigger
language plpgsql security definer set search_path = public as $$
declare e empenhos;
begin
  select * into e from empenhos where id = new.empenho_id;
  if e.id is null then raise exception 'Empenho não encontrado.' using errcode = 'foreign_key_violation'; end if;
  new.tenant_id := e.tenant_id;
  -- o campo só existe em empenho_unidades: lido via JSON para servir às duas tabelas
  if tg_table_name = 'empenho_unidades' then
    if not exists (select 1 from unidades_atendidas
                    where id = (to_jsonb(new) ->> 'unidade_atendida_id')::uuid and tenant_id = e.tenant_id) then
      raise exception 'Unidade atendida não encontrada neste órgão.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create function public.protege_reforco() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.cancelado_em is not null then
      raise exception 'Reforço cancelado não pode ser alterado.' using errcode = 'check_violation';
    end if;
    if new.cancelado_em is not null and empenho_saldo(new.empenho_id) - old.valor < 0 then
      raise exception 'O reforço não pode ser cancelado: o saldo do empenho ficaria negativo.' using errcode = 'check_violation';
    end if;
    if new.cancelado_em is null and (new.valor <> old.valor and empenho_saldo(new.empenho_id) - old.valor + new.valor < 0) then
      raise exception 'O valor não pode ficar abaixo do já utilizado.' using errcode = 'check_violation', hint = 'valor';
    end if;
  end if;
  return new;
end $$;

-- Notas: só as RPCs criam e mudam status; o app edita apenas campos descritivos
create function public.protege_nota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('measure.nota_rpc', true) = 'sim' then return new; end if;
  if old.cancelada_em is not null then
    raise exception 'Nota fiscal cancelada não pode ser alterada.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create function public.herda_nota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select tenant_id into new.tenant_id from notas_fiscais where id = new.nota_id;
  if new.tenant_id is null then raise exception 'Nota fiscal não encontrada.' using errcode = 'foreign_key_violation'; end if;
  return new;
end $$;

-- =====================================================================
-- Gatilhos padrão
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['contratos', 'contrato_designacoes', 'contrato_aditivos', 'empenhos', 'empenho_reforcos', 'notas_fiscais'] loop
    execute format('create trigger %1$s_criacao before insert on public.%1$s for each row execute function public.carimbar_criacao()', t);
    execute format('create trigger %1$s_carimbar before update on public.%1$s for each row execute function public.carimbar()', t);
    execute format('create trigger %1$s_tenant before update on public.%1$s for each row execute function public.bloquear_troca_tenant()', t);
    execute format('create trigger %1$s_auditar after insert or update or delete on public.%1$s for each row execute function public.auditar()', t);
  end loop;
  foreach t in array array['contrato_dotacoes', 'empenho_unidades', 'nota_referencias', 'nota_unidades', 'nota_atestos', 'nota_pagamentos', 'documentos_emitidos'] loop
    execute format('create trigger %1$s_auditar after insert or update or delete on public.%1$s for each row execute function public.auditar()', t);
  end loop;
end $$;

create trigger contrato_dotacoes_criacao before insert on public.contrato_dotacoes for each row execute function public.carimbar_criacao();
create trigger contratos_justificativa before update of ativo on public.contratos for each row execute function public.exige_justificativa_inativacao();
create trigger empenhos_justificativa before update of ativo on public.empenhos for each row execute function public.exige_justificativa_inativacao();
create trigger contratos_prepara before insert or update on public.contratos for each row execute function public.prepara_contrato();
create trigger designacoes_prepara before insert or update on public.contrato_designacoes for each row execute function public.prepara_designacao();
create trigger contrato_dotacoes_prepara before insert or delete on public.contrato_dotacoes for each row execute function public.prepara_dotacao_contrato();
create trigger aditivos_prepara before insert or update on public.contrato_aditivos for each row execute function public.prepara_aditivo();
create trigger empenhos_prepara before insert or update on public.empenhos for each row execute function public.prepara_empenho();
create trigger empenho_unidades_herda before insert on public.empenho_unidades for each row execute function public.herda_empenho();
create trigger reforcos_herda before insert on public.empenho_reforcos for each row execute function public.herda_empenho();
create trigger reforcos_protege before update on public.empenho_reforcos for each row execute function public.protege_reforco();
create trigger notas_protege before update on public.notas_fiscais for each row execute function public.protege_nota();
create trigger nota_referencias_herda before insert on public.nota_referencias for each row execute function public.herda_nota();
create trigger nota_unidades_herda before insert on public.nota_unidades for each row execute function public.herda_nota();

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.modalidades_contratacao enable row level security;
alter table public.contratos enable row level security;
alter table public.contrato_designacoes enable row level security;
alter table public.contrato_dotacoes enable row level security;
alter table public.contrato_aditivos enable row level security;
alter table public.empenhos enable row level security;
alter table public.empenho_unidades enable row level security;
alter table public.empenho_reforcos enable row level security;
alter table public.notas_fiscais enable row level security;
alter table public.nota_referencias enable row level security;
alter table public.nota_unidades enable row level security;
alter table public.nota_atestos enable row level security;
alter table public.nota_pagamentos enable row level security;
alter table public.documentos_emitidos enable row level security;

create policy modalidades_ler on public.modalidades_contratacao for select to authenticated using (true);
create policy modalidades_plataforma on public.modalidades_contratacao for all to authenticated using (eh_admin_plataforma()) with check (eh_admin_plataforma());

-- Contrato: pela unidade responsável (escopo) ou por designação (gestor/fiscal/suplente)
create policy contratos_ler on public.contratos for select to authenticated
  using (pode(tenant_id, unidade_id, 'contratos', 'ler') or designado(id));
create policy contratos_criar on public.contratos for insert to authenticated with check (pode(tenant_id, unidade_id, 'contratos', 'criar'));
create policy contratos_editar on public.contratos for update to authenticated
  using (pode(tenant_id, unidade_id, 'contratos', 'editar')) with check (pode(tenant_id, unidade_id, 'contratos', 'editar'));

create function public.pode_contrato(p_contrato uuid, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contratos c where c.id = p_contrato and pode(c.tenant_id, c.unidade_id, 'contratos', p_acao))
$$;

create policy designacoes_ler on public.contrato_designacoes for select to authenticated
  using (pode_contrato(contrato_id, 'ler') or designado(contrato_id));
create policy designacoes_criar on public.contrato_designacoes for insert to authenticated with check (pode_contrato(contrato_id, 'editar'));
create policy designacoes_editar on public.contrato_designacoes for update to authenticated
  using (pode_contrato(contrato_id, 'editar')) with check (pode_contrato(contrato_id, 'editar'));

create policy dotacoes_ler on public.contrato_dotacoes for select to authenticated using (pode_contrato(contrato_id, 'ler') or designado(contrato_id));
create policy dotacoes_incluir on public.contrato_dotacoes for insert to authenticated with check (pode_contrato(contrato_id, 'editar'));
create policy dotacoes_remover on public.contrato_dotacoes for delete to authenticated using (pode_contrato(contrato_id, 'editar'));

create policy aditivos_ler on public.contrato_aditivos for select to authenticated using (pode_contrato(contrato_id, 'ler') or designado(contrato_id));
create policy aditivos_criar on public.contrato_aditivos for insert to authenticated with check (pode_contrato(contrato_id, 'editar'));
create policy aditivos_editar on public.contrato_aditivos for update to authenticated
  using (pode_contrato(contrato_id, 'editar')) with check (pode_contrato(contrato_id, 'editar'));

create policy empenhos_ler on public.empenhos for select to authenticated
  using (pode(tenant_id, unidade_id, 'empenhos', 'ler') or designado(contrato_id));
create policy empenhos_criar on public.empenhos for insert to authenticated
  with check (exists (select 1 from contratos c where c.id = contrato_id and pode(c.tenant_id, c.unidade_id, 'empenhos', 'criar')));
create policy empenhos_editar on public.empenhos for update to authenticated
  using (pode(tenant_id, unidade_id, 'empenhos', 'editar')) with check (pode(tenant_id, unidade_id, 'empenhos', 'editar'));

create function public.pode_empenho(p_empenho uuid, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from empenhos e where e.id = p_empenho and pode(e.tenant_id, e.unidade_id, 'empenhos', p_acao))
$$;

create policy empenho_unidades_ler on public.empenho_unidades for select to authenticated
  using (pode_empenho(empenho_id, 'ler') or designado((select contrato_id from empenhos where id = empenho_id)));
create policy empenho_unidades_incluir on public.empenho_unidades for insert to authenticated with check (pode_empenho(empenho_id, 'editar'));
create policy empenho_unidades_remover on public.empenho_unidades for delete to authenticated using (pode_empenho(empenho_id, 'editar'));

create policy reforcos_ler on public.empenho_reforcos for select to authenticated
  using (pode_empenho(empenho_id, 'ler') or designado((select contrato_id from empenhos where id = empenho_id)));
create policy reforcos_criar on public.empenho_reforcos for insert to authenticated with check (pode_empenho(empenho_id, 'editar'));

create policy notas_ler on public.notas_fiscais for select to authenticated
  using (pode(tenant_id, unidade_id, 'notas_fiscais', 'ler') or designado(contrato_id));
-- criação e mudança de status só pelas RPCs; o app edita campos descritivos
create policy notas_editar on public.notas_fiscais for update to authenticated
  using (pode(tenant_id, unidade_id, 'notas_fiscais', 'editar')) with check (pode(tenant_id, unidade_id, 'notas_fiscais', 'editar'));

create function public.nota_legivel(p_nota uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notas_fiscais n where n.id = p_nota
                  and (pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'ler') or designado(n.contrato_id)))
$$;

create policy nota_referencias_ler on public.nota_referencias for select to authenticated using (nota_legivel(nota_id));
create policy nota_unidades_ler on public.nota_unidades for select to authenticated using (nota_legivel(nota_id));
create policy nota_atestos_ler on public.nota_atestos for select to authenticated using (nota_legivel(nota_id));
create policy nota_pagamentos_ler on public.nota_pagamentos for select to authenticated using (nota_legivel(nota_id));

create policy emitidos_ler on public.documentos_emitidos for select to authenticated
  using (case tipo
           when 'EXTRATO_CONTRATO' then pode(tenant_id, unidade_id, 'contratos', 'ler') or designado(registro_id)
           when 'EXTRATO_EMPENHO' then pode(tenant_id, unidade_id, 'empenhos', 'ler') or designado((select contrato_id from empenhos where id = registro_id))
           else nota_legivel(registro_id) end);

-- Privilégios de tabela
revoke all on public.modalidades_contratacao, public.contratos, public.contrato_designacoes, public.contrato_dotacoes,
  public.contrato_aditivos, public.empenhos, public.empenho_unidades, public.empenho_reforcos, public.notas_fiscais,
  public.nota_referencias, public.nota_unidades, public.nota_atestos, public.nota_pagamentos, public.documentos_emitidos from anon;
revoke delete on public.contratos, public.contrato_designacoes, public.contrato_aditivos, public.empenhos, public.empenho_reforcos,
  public.notas_fiscais, public.nota_referencias, public.nota_unidades, public.nota_atestos, public.nota_pagamentos,
  public.documentos_emitidos, public.modalidades_contratacao from authenticated;
revoke insert, update on public.notas_fiscais, public.nota_referencias, public.nota_unidades, public.nota_atestos,
  public.nota_pagamentos, public.documentos_emitidos from authenticated;
grant update (numero, serie, data_emissao, processo_administrativo, tipo_servico_id, periodo_inicio, periodo_fim, observacoes)
  on public.notas_fiscais to authenticated;
-- reforço: só criar; cancelamento pela RPC
revoke update on public.empenho_reforcos from authenticated;
-- aditivo: status/decisão só pela RPC
revoke update on public.contrato_aditivos from authenticated;
grant update (numero, tipo, data_assinatura, nova_data_fim, valor, descricao) on public.contrato_aditivos to authenticated;
-- designação: só encerrar (fim/motivo) e anotar a portaria
revoke update on public.contrato_designacoes from authenticated;
grant update (fim, motivo_fim, portaria) on public.contrato_designacoes to authenticated;

-- =====================================================================
-- Documentos anexos: designados também leem os documentos do contrato e das notas
-- =====================================================================

create or replace function public.documento_legivel(p_tenant uuid, p_unidade uuid, p_recurso text, p_registro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pode(p_tenant, p_unidade, p_recurso, 'ler')
      or (p_recurso = 'contratos' and p_registro is not null and designado(p_registro))
      or (p_recurso = 'notas_fiscais' and p_registro is not null and designado(contrato_de_nota(p_registro)))
$$;

drop policy documentos_ler on public.documentos;
create policy documentos_ler on public.documentos for select to authenticated
  using (documento_legivel(tenant_id, unidade_id, recurso, registro_id));

create or replace function public.arquivo_pode(p_bucket text, p_nome text, p_acao text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_partes text[] := string_to_array(p_nome, '/');
  v_tenant uuid;
begin
  if p_bucket = 'avatares' then
    if coalesce(array_length(v_partes, 1), 0) <> 2 or v_partes[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
    if p_acao = 'ler' then return perfil_visivel(v_partes[1]::uuid); end if;
    return v_partes[1] = auth.uid()::text;
  end if;
  if p_bucket <> 'arquivos' or coalesce(array_length(v_partes, 1), 0) <> 3
     or v_partes[1] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  v_tenant := v_partes[1]::uuid;
  if v_partes[2] = 'identidade' then
    if p_acao = 'ler' then return eh_admin_plataforma() or membro_do_tenant(v_tenant); end if;
    return pode(v_tenant, null, 'configuracoes', 'editar');
  end if;
  if p_acao = 'ler' then
    return exists (select 1 from documentos d where d.storage_path = p_nome and d.excluido_em is null
                    and documento_legivel(d.tenant_id, d.unidade_id, d.recurso, d.registro_id));
  end if;
  if p_acao = 'enviar' then
    return exists (select 1 from documentos d where d.storage_path = p_nome and d.excluido_em is null
                    and d.enviado_por = auth.uid());
  end if;
  return false;
end $$;

-- =====================================================================
-- Visões com cálculos (respeitam o RLS de quem consulta)
-- =====================================================================

create view public.v_contratos with (security_invoker = true) as
select c.*,
       coalesce(f.razao_social, f.nome_fantasia) as fornecedor_nome, f.nome_fantasia as fornecedor_fantasia,
       f.documento as fornecedor_documento, f.tipo_pessoa as fornecedor_tipo,
       u.nome as unidade_nome, u.sigla as unidade_sigla,
       x.aditivos_valor, c.valor_global + x.aditivos_valor as valor_atual,
       x.fim_atual as data_fim_atual,
       coalesce(e.empenhado, 0) as empenhado,
       coalesce(n.notas, 0) as notas_valor,
       coalesce(n.pago, 0) as pago,
       c.valor_global + x.aditivos_valor - coalesce(n.notas, 0) as saldo,
       case when hoje() < c.data_inicio then 'NAO_INICIADO'
            when hoje() > x.fim_atual then 'VENCIDO'
            when x.fim_atual - hoje() <= coalesce((select max(d) from tenant_configuracoes tc, unnest(tc.alerta_vencimento_dias) d where tc.tenant_id = c.tenant_id), 30) then 'A_VENCER'
            else 'VIGENTE' end as situacao,
       x.fim_atual - hoje() as dias_para_vencer,
       (select count(*) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO') as aditivos_aprovados
  from contratos c
  join fornecedores f on f.id = c.fornecedor_id
  join unidades_organizacionais u on u.id = c.unidade_id
  cross join lateral (
    select coalesce((select sum(a.valor) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO'), 0) as aditivos_valor,
           greatest(c.data_fim, coalesce((select max(a.nova_data_fim) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO'), c.data_fim)) as fim_atual
  ) x
  left join lateral (
    select sum(em.valor + coalesce((select sum(r.valor) from empenho_reforcos r where r.empenho_id = em.id and r.cancelado_em is null), 0)) as empenhado
      from empenhos em where em.contrato_id = c.id and em.ativo
  ) e on true
  left join lateral (
    select sum(nf.valor) as notas,
           sum((select coalesce(sum(p.valor), 0) from nota_pagamentos p where p.nota_id = nf.id and p.cancelado_em is null)) as pago
      from notas_fiscais nf where nf.contrato_id = c.id and nf.cancelada_em is null
  ) n on true;

create view public.v_empenhos with (security_invoker = true) as
select e.*,
       c.numero as contrato_numero, c.objeto as contrato_objeto,
       coalesce(f.razao_social, f.nome_fantasia) as fornecedor_nome,
       cl.codigo_completo as classificacao_codigo,
       coalesce(r.reforcos, 0) as reforcos,
       e.valor + coalesce(r.reforcos, 0) as valor_total,
       coalesce(n.utilizado, 0) as utilizado,
       e.valor + coalesce(r.reforcos, 0) - coalesce(n.utilizado, 0) as saldo
  from empenhos e
  join contratos c on c.id = e.contrato_id
  join fornecedores f on f.id = e.fornecedor_id
  join classificacoes_orcamentarias cl on cl.id = e.classificacao_id
  left join lateral (select sum(valor) as reforcos from empenho_reforcos where empenho_id = e.id and cancelado_em is null) r on true
  left join lateral (select sum(valor) as utilizado from notas_fiscais where empenho_id = e.id and cancelada_em is null) n on true;

create view public.v_notas with (security_invoker = true) as
select nf.*,
       c.numero as contrato_numero, c.objeto as contrato_objeto,
       coalesce(f.razao_social, f.nome_fantasia) as fornecedor_nome, f.documento as fornecedor_documento,
       e.numero as empenho_numero, e.ano as empenho_ano,
       ts.nome as tipo_servico_nome,
       coalesce((select sum(p.valor) from nota_pagamentos p where p.nota_id = nf.id and p.cancelado_em is null), 0) as pago,
       (select string_agg(lpad(mes::text, 2, '0') || '/' || ano, ', ' order by ano, mes) from nota_referencias r where r.nota_id = nf.id) as meses_referencia,
       designado(nf.contrato_id) as sou_designado
  from notas_fiscais nf
  join contratos c on c.id = nf.contrato_id
  join fornecedores f on f.id = nf.fornecedor_id
  join empenhos e on e.id = nf.empenho_id
  left join tipos_servico ts on ts.id = nf.tipo_servico_id;

grant select on public.v_contratos, public.v_empenhos, public.v_notas to authenticated;
revoke all on public.v_contratos, public.v_empenhos, public.v_notas from anon;

-- =====================================================================
-- RPCs
-- =====================================================================

-- Aprovar ou rejeitar aditivo (exige "aprovar" em contratos)
create function public.decidir_aditivo(p_aditivo uuid, p_aprovar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a contrato_aditivos;
begin
  select * into a from contrato_aditivos where id = p_aditivo;
  if a.id is null then raise exception 'Aditivo não encontrado.' using errcode = 'no_data_found'; end if;
  if not pode_contrato(a.contrato_id, 'aprovar') then
    raise exception 'Você não tem permissão para aprovar aditivos.' using errcode = 'insufficient_privilege';
  end if;
  if a.status <> 'RASCUNHO' then raise exception 'Este aditivo já foi decidido.' using errcode = 'check_violation'; end if;
  if not p_aprovar then perform usar_justificativa(p_motivo, 5); end if;
  perform set_config('measure.decidindo_aditivo', 'sim', true);
  update contrato_aditivos set status = case when p_aprovar then 'APROVADO' else 'REJEITADO' end,
         decidido_por = auth.uid(), decidido_em = now(), motivo_decisao = nullif(btrim(p_motivo), '')
   where id = p_aditivo;
  perform set_config('measure.decidindo_aditivo', '', true);
  if p_aprovar and contrato_valor_atual(a.contrato_id) <= 0 then
    raise exception 'A supressão deixaria o contrato sem valor.' using errcode = 'check_violation';
  end if;
end $$;

-- Renovação: novo contrato a partir do anterior (que fica como histórico)
create function public.renovar_contrato(p_origem uuid, p_numero text, p_inicio date, p_fim date, p_valor numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare o contratos; v_id uuid;
begin
  select * into o from contratos where id = p_origem;
  if o.id is null then raise exception 'Contrato não encontrado.' using errcode = 'no_data_found'; end if;
  if not pode(o.tenant_id, o.unidade_id, 'contratos', 'criar') then
    raise exception 'Você não tem permissão para criar contratos nesta unidade.' using errcode = 'insufficient_privilege';
  end if;
  insert into contratos (tenant_id, unidade_id, numero, modalidade, fornecedor_id, processo_administrativo, numero_licitacao,
                         objeto, data_inicio, data_fim, valor_global, observacoes, contrato_origem_id)
  values (o.tenant_id, o.unidade_id, btrim(p_numero), o.modalidade, o.fornecedor_id, o.processo_administrativo, o.numero_licitacao,
          o.objeto, p_inicio, p_fim, p_valor, 'Renovação do contrato ' || o.numero, o.id)
  returning id into v_id;
  insert into contrato_dotacoes (contrato_id, classificacao_id, tenant_id)
  select v_id, d.classificacao_id, o.tenant_id from contrato_dotacoes d
    join classificacoes_orcamentarias cl on cl.id = d.classificacao_id and cl.ativo
   where d.contrato_id = o.id;
  insert into contrato_designacoes (contrato_id, servidor_id, papel, inicio, portaria, tenant_id)
  select v_id, d.servidor_id, d.papel, greatest(p_inicio, hoje()), d.portaria, o.tenant_id from contrato_designacoes d
    join servidores s on s.id = d.servidor_id and (s.data_exoneracao is null or s.data_exoneracao > hoje())
   where d.contrato_id = o.id and d.fim is null;
  return v_id;
end $$;

-- Cancelar reforço de empenho (motivo obrigatório)
create function public.cancelar_reforco(p_reforco uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare r empenho_reforcos;
begin
  select * into r from empenho_reforcos where id = p_reforco;
  if r.id is null or not pode_empenho(r.empenho_id, 'editar') then
    raise exception 'Reforço não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_motivo, 5);
  update empenho_reforcos set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo) where id = p_reforco;
end $$;

-- Registrar/editar nota fiscal com referências e unidades (tudo ou nada)
--   p: { id?, empenho_id, numero, serie, data_emissao, processo_administrativo, valor, tipo_servico_id,
--        periodo_inicio, periodo_fim, observacoes, excecao_saldo,
--        referencias: [{ano, mes}], unidades: [{id, valor?}] }
create function public.salvar_nota_fiscal(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  e empenhos; c contratos; atual notas_fiscais;
  v_valor numeric := (p ->> 'valor')::numeric;
  v_saldo numeric; v_fim date; v_bloquear boolean;
  v_soma numeric; v_com_valor int; v_total int;
  u record; ref record;
begin
  select * into e from empenhos where id = (p ->> 'empenho_id')::uuid;
  if e.id is null then raise exception 'Escolha o empenho.' using errcode = 'check_violation', hint = 'empenho_id'; end if;
  select * into c from contratos where id = e.contrato_id;
  if v_id is null then
    if not pode(e.tenant_id, e.unidade_id, 'notas_fiscais', 'criar') then
      raise exception 'Você não tem permissão para lançar notas neste contrato.' using errcode = 'insufficient_privilege';
    end if;
  else
    select * into atual from notas_fiscais where id = v_id;
    if atual.id is null or not pode(atual.tenant_id, atual.unidade_id, 'notas_fiscais', 'editar') then
      raise exception 'Nota não encontrada ou sem permissão para editar.' using errcode = 'insufficient_privilege';
    end if;
    if atual.cancelada_em is not null then raise exception 'Nota cancelada não pode ser alterada.' using errcode = 'check_violation'; end if;
    if atual.empenho_id <> e.id and exists (select 1 from nota_pagamentos where nota_id = v_id and cancelado_em is null) then
      raise exception 'A nota já tem pagamento: o empenho não pode ser trocado.' using errcode = 'check_violation', hint = 'empenho_id';
    end if;
    if atual.valor <> v_valor and exists (select 1 from nota_pagamentos where nota_id = v_id and cancelado_em is null) then
      raise exception 'A nota já tem pagamento: o valor não pode ser alterado.' using errcode = 'check_violation', hint = 'valor';
    end if;
    if atual.status_atesto = 'ATESTADA' and (atual.valor <> v_valor or atual.empenho_id <> e.id) then
      raise exception 'A nota já foi atestada: valor e empenho não podem mudar.' using errcode = 'check_violation', hint = 'valor';
    end if;
  end if;
  if not e.ativo then raise exception 'O empenho % está inativo.', e.numero using errcode = 'check_violation', hint = 'empenho_id'; end if;
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

  -- saldo do empenho (exceção só com justificativa e permissão de aprovar)
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
           excecao_saldo = case when v_valor > v_saldo then btrim(p ->> 'excecao_saldo') end
     where id = v_id;
    delete from nota_referencias where nota_id = v_id;
    delete from nota_unidades where nota_id = v_id;
  end if;
  for ref in select distinct x.ano, x.mes from jsonb_to_recordset(p -> 'referencias') x(ano int, mes int) loop
    insert into nota_referencias (nota_id, ano, mes, tenant_id) values (v_id, ref.ano, ref.mes, e.tenant_id);
  end loop;
  insert into nota_unidades (nota_id, unidade_atendida_id, valor, tenant_id)
  select v_id, x.id, x.valor, e.tenant_id from jsonb_to_recordset(coalesce(p -> 'unidades', '[]')) x(id uuid, valor numeric);
  perform set_config('measure.nota_rpc', '', true);
  return v_id;
end $$;

-- Atesto: só gestor/fiscal/suplente com designação vigente no contrato
create function public.atestar_nota(p_nota uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; d record; v_id uuid;
begin
  select * into n from notas_fiscais where id = p_nota;
  if n.id is null then raise exception 'Nota não encontrada.' using errcode = 'no_data_found'; end if;
  select cd.papel, s.id as servidor_id into d
    from contrato_designacoes cd join servidores s on s.id = cd.servidor_id
   where cd.contrato_id = n.contrato_id and s.user_id = auth.uid() and cd.fim is null and cd.inicio <= hoje()
   order by case cd.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end limit 1;
  if d.papel is null then
    raise exception 'Somente o gestor, o fiscal ou o suplente designado neste contrato pode atestar.' using errcode = 'insufficient_privilege';
  end if;
  if n.cancelada_em is not null then raise exception 'Nota cancelada não pode ser atestada.' using errcode = 'check_violation'; end if;
  if n.status_atesto = 'ATESTADA' then raise exception 'Esta nota já foi atestada.' using errcode = 'check_violation'; end if;
  if coalesce(length(btrim(p_texto)), 0) < 20 then raise exception 'O texto do atesto está vazio.' using errcode = 'check_violation', hint = 'texto'; end if;
  insert into nota_atestos (tenant_id, nota_id, servidor_id, user_id, papel, texto)
  values (n.tenant_id, n.id, d.servidor_id, auth.uid(), d.papel, btrim(p_texto)) returning id into v_id;
  perform set_config('measure.nota_rpc', 'sim', true);
  update notas_fiscais set status_atesto = 'ATESTADA' where id = n.id;
  perform set_config('measure.nota_rpc', '', true);
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (n.tenant_id, n.unidade_id, 'ATESTO', n.id, 'Atesto da NF ' || n.numero,
          jsonb_build_object('texto', btrim(p_texto), 'papel', d.papel,
                             'servidor', (select jsonb_build_object('nome', nome, 'matricula', matricula, 'cargo', cargo) from servidores where id = d.servidor_id)));
  return v_id;
end $$;

create function public.atualizar_status_pagamento(p_nota uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pago numeric; v_valor numeric;
begin
  select valor into v_valor from notas_fiscais where id = p_nota;
  select coalesce(sum(valor), 0) into v_pago from nota_pagamentos where nota_id = p_nota and cancelado_em is null;
  perform set_config('measure.nota_rpc', 'sim', true);
  update notas_fiscais set status_pagamento = case when v_pago = 0 then 'PENDENTE' when v_pago < v_valor then 'PARCIAL' else 'PAGO' end
   where id = p_nota and cancelada_em is null;
  perform set_config('measure.nota_rpc', '', true);
end $$;

create function public.registrar_pagamento(p_nota uuid, p_data date, p_valor numeric, p_documento text default null, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; v_pago numeric; v_id uuid;
begin
  select * into n from notas_fiscais where id = p_nota;
  if n.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'editar') then
    raise exception 'Nota não encontrada ou sem permissão para registrar pagamento.' using errcode = 'insufficient_privilege';
  end if;
  if n.cancelada_em is not null then raise exception 'Nota cancelada não recebe pagamento.' using errcode = 'check_violation'; end if;
  if n.status_atesto <> 'ATESTADA' then
    raise exception 'A nota precisa ser atestada antes do pagamento.' using errcode = 'check_violation';
  end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor pago.' using errcode = 'check_violation', hint = 'valor'; end if;
  if p_data is null then raise exception 'Informe a data do pagamento.' using errcode = 'check_violation', hint = 'data_pagamento'; end if;
  select coalesce(sum(valor), 0) into v_pago from nota_pagamentos where nota_id = p_nota and cancelado_em is null;
  if v_pago + p_valor > n.valor then
    raise exception 'O pagamento ultrapassa o valor da nota: faltam % para quitar.', brl(n.valor - v_pago) using errcode = 'check_violation', hint = 'valor';
  end if;
  insert into nota_pagamentos (tenant_id, nota_id, data_pagamento, valor, documento, observacao)
  values (n.tenant_id, n.id, p_data, p_valor, nullif(btrim(p_documento), ''), nullif(btrim(p_observacao), '')) returning id into v_id;
  perform atualizar_status_pagamento(n.id);
  return v_id;
end $$;

create function public.cancelar_pagamento(p_pagamento uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare pg nota_pagamentos; n notas_fiscais;
begin
  select * into pg from nota_pagamentos where id = p_pagamento and cancelado_em is null;
  select * into n from notas_fiscais where id = pg.nota_id;
  if pg.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'excluir') then
    raise exception 'Pagamento não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_motivo, 5);
  update nota_pagamentos set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo) where id = p_pagamento;
  perform atualizar_status_pagamento(n.id);
end $$;

create function public.cancelar_nota(p_nota uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais;
begin
  select * into n from notas_fiscais where id = p_nota;
  if n.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'excluir') then
    raise exception 'Nota não encontrada ou sem permissão para cancelar.' using errcode = 'insufficient_privilege';
  end if;
  if n.cancelada_em is not null then raise exception 'A nota já está cancelada.' using errcode = 'check_violation'; end if;
  if exists (select 1 from nota_pagamentos where nota_id = p_nota and cancelado_em is null) then
    raise exception 'Cancele os pagamentos da nota antes de cancelá-la.' using errcode = 'check_violation';
  end if;
  perform usar_justificativa(p_motivo, 5);
  perform set_config('measure.nota_rpc', 'sim', true);
  update notas_fiscais set cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = btrim(p_motivo),
         status_pagamento = 'CANCELADA' where id = p_nota;
  perform set_config('measure.nota_rpc', '', true);
end $$;

-- Extratos: retrato dos dados no momento da emissão (não muda depois)
create function public.emitir_extrato_contrato(p_contrato uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; v_id uuid; v_dados jsonb;
begin
  if not (pode_contrato(p_contrato, 'ler') or designado(p_contrato)) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from contratos where id = p_contrato;
  select jsonb_build_object(
    'orgao', (select jsonb_build_object('nome_oficial', t.nome_oficial, 'logo_path', t.logo_path, 'cabecalho', tc.documento_cabecalho, 'rodape', tc.documento_rodape)
                from tenants t join tenant_configuracoes tc on tc.tenant_id = t.id where t.id = c.tenant_id),
    'contrato', (select to_jsonb(v) - 'tenant_id' from (select numero, objeto, data_inicio, data_fim, valor_global, processo_administrativo,
                  numero_licitacao, modalidade, numero_renovacao from contratos where id = c.id) v),
    'modalidade', (select nome from modalidades_contratacao where codigo = c.modalidade),
    'fornecedor', (select jsonb_build_object('nome', coalesce(razao_social, nome_fantasia), 'documento', documento, 'tipo', tipo_pessoa) from fornecedores where id = c.fornecedor_id),
    'unidade', (select jsonb_build_object('nome', nome, 'sigla', sigla) from unidades_organizacionais where id = c.unidade_id),
    'valor_atual', contrato_valor_atual(c.id), 'data_fim_atual', contrato_fim_atual(c.id),
    'responsaveis', coalesce((select jsonb_agg(jsonb_build_object('papel', d.papel, 'nome', s.nome, 'matricula', s.matricula, 'portaria', d.portaria) order by d.papel)
                     from contrato_designacoes d join servidores s on s.id = d.servidor_id where d.contrato_id = c.id and d.fim is null), '[]'),
    'dotacoes', coalesce((select jsonb_agg(cl.codigo_completo order by cl.codigo_completo) from contrato_dotacoes cd
                     join classificacoes_orcamentarias cl on cl.id = cd.classificacao_id where cd.contrato_id = c.id), '[]'),
    'aditivos', coalesce((select jsonb_agg(jsonb_build_object('numero', a.numero, 'tipo', a.tipo, 'valor', a.valor, 'nova_data_fim', a.nova_data_fim,
                     'data_assinatura', a.data_assinatura) order by a.data_assinatura nulls last) from contrato_aditivos a where a.contrato_id = c.id and a.status = 'APROVADO'), '[]'),
    'empenhos', coalesce((select jsonb_agg(jsonb_build_object('numero', e.numero, 'ano', e.ano, 'data', e.data_empenho, 'valor_total', e.valor_total,
                     'utilizado', e.utilizado, 'saldo', e.saldo, 'classificacao', e.classificacao_codigo) order by e.ano, e.numero)
                     from v_empenhos e where e.contrato_id = c.id and e.ativo), '[]'),
    'notas', coalesce((select jsonb_agg(jsonb_build_object('numero', n.numero, 'data', n.data_emissao, 'valor', n.valor, 'empenho', n.empenho_numero || '/' || n.empenho_ano,
                     'meses', n.meses_referencia, 'atesto', n.status_atesto, 'pagamento', n.status_pagamento, 'pago', n.pago) order by n.data_emissao, n.numero)
                     from v_notas n where n.contrato_id = c.id and n.cancelada_em is null), '[]'),
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now()
  ) into v_dados;
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (c.tenant_id, c.unidade_id, 'EXTRATO_CONTRATO', c.id, 'Extrato do contrato ' || c.numero, v_dados) returning id into v_id;
  return v_id;
end $$;

create function public.emitir_extrato_empenho(p_empenho uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e empenhos; v_id uuid; v_dados jsonb;
begin
  select * into e from empenhos where id = p_empenho;
  if e.id is null or not (pode(e.tenant_id, e.unidade_id, 'empenhos', 'ler') or designado(e.contrato_id)) then
    raise exception 'Empenho não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'orgao', (select jsonb_build_object('nome_oficial', t.nome_oficial, 'logo_path', t.logo_path, 'cabecalho', tc.documento_cabecalho, 'rodape', tc.documento_rodape)
                from tenants t join tenant_configuracoes tc on tc.tenant_id = t.id where t.id = e.tenant_id),
    'empenho', (select to_jsonb(v) from (select numero, ano, tipo, data_empenho, valor, valor_total, reforcos, utilizado, saldo,
                  classificacao_codigo, contrato_numero, contrato_objeto, fornecedor_nome, processo, sd from v_empenhos where id = e.id) v),
    'reforcos', coalesce((select jsonb_agg(jsonb_build_object('numero', numero, 'data', data, 'valor', valor, 'motivo', motivo) order by data)
                     from empenho_reforcos where empenho_id = e.id and cancelado_em is null), '[]'),
    'notas', coalesce((select jsonb_agg(jsonb_build_object('numero', n.numero, 'data', n.data_emissao, 'valor', n.valor, 'meses', n.meses_referencia,
                     'atesto', n.status_atesto, 'pagamento', n.status_pagamento) order by n.data_emissao, n.numero)
                     from v_notas n where n.empenho_id = e.id and n.cancelada_em is null), '[]'),
    'unidades', coalesce((select jsonb_agg(ua.nome order by ua.nome) from empenho_unidades eu join unidades_atendidas ua on ua.id = eu.unidade_atendida_id
                     where eu.empenho_id = e.id), '[]'),
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now()
  ) into v_dados;
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (e.tenant_id, e.unidade_id, 'EXTRATO_EMPENHO', e.id, 'Extrato do empenho ' || e.numero || '/' || e.ano, v_dados) returning id into v_id;
  return v_id;
end $$;

-- Texto padrão do atesto (o órgão pode trocar em Configurações > textos.atesto)
insert into public.configuracoes_globais (chave, valor, descricao) values ('texto_atesto_padrao', to_jsonb(
  'Atesto, para os devidos fins, que os serviços/materiais referentes ao objeto "{objeto}", do Contrato nº {contrato}, firmado com {fornecedor}, foram prestados/entregues de forma satisfatória, conforme a Nota Fiscal nº {nota}, no valor de {valor}, referente ao(s) mês(es) de {meses}{periodo}, Processo Administrativo nº {processo}. {decreto}'::text),
  'Modelo do texto de atesto. Variáveis: {objeto} {contrato} {fornecedor} {nota} {valor} {meses} {periodo} {processo} {decreto}')
on conflict (chave) do nothing;

-- =====================================================================
-- Privilégios das funções novas
-- =====================================================================

revoke execute on function
  public.designado(uuid), public.contrato_de_nota(uuid), public.contrato_valor_atual(uuid), public.contrato_fim_atual(uuid),
  public.empenho_saldo(uuid, uuid), public.brl(numeric), public.prepara_contrato(), public.prepara_designacao(),
  public.prepara_dotacao_contrato(), public.prepara_aditivo(), public.prepara_empenho(), public.herda_empenho(), public.protege_reforco(),
  public.protege_nota(), public.herda_nota(), public.pode_contrato(uuid, text), public.pode_empenho(uuid, text),
  public.nota_legivel(uuid), public.documento_legivel(uuid, uuid, text, uuid), public.decidir_aditivo(uuid, boolean, text),
  public.renovar_contrato(uuid, text, date, date, numeric), public.cancelar_reforco(uuid, text), public.salvar_nota_fiscal(jsonb),
  public.atestar_nota(uuid, text), public.atualizar_status_pagamento(uuid), public.registrar_pagamento(uuid, date, numeric, text, text),
  public.cancelar_pagamento(uuid, text), public.cancelar_nota(uuid, text), public.emitir_extrato_contrato(uuid), public.emitir_extrato_empenho(uuid)
from public, anon;

revoke execute on function
  public.prepara_contrato(), public.prepara_designacao(), public.prepara_dotacao_contrato(), public.prepara_aditivo(), public.prepara_empenho(),
  public.herda_empenho(), public.protege_reforco(), public.protege_nota(), public.herda_nota(),
  public.atualizar_status_pagamento(uuid)
from authenticated;

grant execute on function
  public.designado(uuid), public.contrato_de_nota(uuid), public.contrato_valor_atual(uuid), public.contrato_fim_atual(uuid),
  public.empenho_saldo(uuid, uuid), public.brl(numeric), public.pode_contrato(uuid, text), public.pode_empenho(uuid, text),
  public.nota_legivel(uuid), public.documento_legivel(uuid, uuid, text, uuid), public.decidir_aditivo(uuid, boolean, text),
  public.renovar_contrato(uuid, text, date, date, numeric), public.cancelar_reforco(uuid, text), public.salvar_nota_fiscal(jsonb),
  public.atestar_nota(uuid, text), public.registrar_pagamento(uuid, date, numeric, text, text), public.cancelar_pagamento(uuid, text),
  public.cancelar_nota(uuid, text), public.emitir_extrato_contrato(uuid), public.emitir_extrato_empenho(uuid)
to authenticated;
