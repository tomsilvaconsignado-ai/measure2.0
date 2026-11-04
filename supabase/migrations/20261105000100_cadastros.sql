-- MEASURE 2.0 — Fase 2: cadastros básicos
--
-- Fornecedores (+ contas bancárias), servidores (+ dados pessoais restritos), unidades atendidas
-- (+ grupos de rateio), classificação orçamentária (classificadores + dotações) e tipos de serviço.
--
-- Convenções da Fase 1: tenant_id obrigatório e imutável, RLS por pode(), auditoria, carimbos,
-- nada de exclusão física (inativação com motivo e permissão de "excluir").

create extension if not exists pg_trgm with schema extensions;

-- =====================================================================
-- Matriz: dados pessoais sensíveis de servidores ficam num recurso próprio
-- =====================================================================

insert into public.recursos (codigo, nome, grupo, ordem) values
  ('servidores_sensiveis', 'Servidores: dados pessoais (CPF, nascimento, mãe, tipo sanguíneo, endereço)', 'Cadastros', 115)
on conflict (codigo) do nothing;

insert into public.permissoes_papel (papel, recurso, acao) values
  ('MASTER', 'servidores_sensiveis', 'ler'), ('MASTER', 'servidores_sensiveis', 'criar'),
  ('MASTER', 'servidores_sensiveis', 'editar'), ('MASTER', 'servidores_sensiveis', 'exportar'),
  ('ADMINISTRATIVO', 'servidores_sensiveis', 'ler'), ('ADMINISTRATIVO', 'servidores_sensiveis', 'criar'),
  ('ADMINISTRATIVO', 'servidores_sensiveis', 'editar')
on conflict do nothing;

-- =====================================================================
-- Funções de apoio
-- =====================================================================

create function public.cnpj_valido(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
        pesos1 int[] := '{5,4,3,2,9,8,7,6,5,4,3,2}'; pesos2 int[] := '{6,5,4,3,2,9,8,7,6,5,4,3,2}';
begin
  if length(d) <> 14 or d ~ '^(\d)\1+$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * pesos1[i]; end loop;
  r := s % 11; if (case when r < 2 then 0 else 11 - r end) <> substr(d, 13, 1)::int then return false; end if;
  s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * pesos2[i]; end loop;
  r := s % 11; return (case when r < 2 then 0 else 11 - r end) = substr(d, 14, 1)::int;
end $$;

create function public.cpf_valido(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1+$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- Data de hoje no horário de Brasília (vigência, exoneração, aniversários)
create function public.hoje() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Inativar registro do órgão exige a permissão "excluir" do recurso (argumento do gatilho)
create function public.exige_permissao_inativar() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.ativo and not new.ativo and auth.uid() is not null
     and not pode(new.tenant_id, null, tg_argv[0], 'excluir') then
    raise exception 'Você não tem permissão para inativar este registro.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- =====================================================================
-- Fornecedores
-- =====================================================================

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  tipo_pessoa text not null default 'PJ' check (tipo_pessoa in ('PJ', 'PF')),
  documento text not null,
  razao_social text not null check (length(btrim(razao_social)) between 2 and 250),
  nome_fantasia text check (length(btrim(nome_fantasia)) <= 250),
  inscricao_estadual text,
  inscricao_municipal text,
  cep text check (cep ~ '^[0-9]{8}$'),
  logradouro text, numero text, complemento text, bairro text, cidade text,
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  telefone text, telefone_secundario text,
  email text, site text,
  nome_contato text,
  observacoes text,
  logo_path text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  constraint fornecedores_documento_valido check (
    (tipo_pessoa = 'PJ' and documento ~ '^[0-9]{14}$' and public.cnpj_valido(documento))
    or (tipo_pessoa = 'PF' and documento ~ '^[0-9]{11}$' and public.cpf_valido(documento)))
);
create unique index fornecedores_documento_unico on public.fornecedores (tenant_id, documento);
create index fornecedores_ordem on public.fornecedores (tenant_id, lower(coalesce(nullif(razao_social, ''), nome_fantasia)));
create index fornecedores_busca on public.fornecedores using gin
  ((lower(razao_social || ' ' || coalesce(nome_fantasia, '') || ' ' || documento)) extensions.gin_trgm_ops);

create table public.fornecedor_contas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  banco_codigo text check (banco_codigo ~ '^[0-9]{3}$'),
  banco_nome text not null check (length(btrim(banco_nome)) >= 2),
  agencia text not null,
  conta text not null,
  tipo_conta text not null default 'CORRENTE' check (tipo_conta in ('CORRENTE', 'POUPANCA', 'PAGAMENTO')),
  pix_tipo text check (pix_tipo in ('CNPJ', 'CPF', 'EMAIL', 'TELEFONE', 'ALEATORIA')),
  pix_chave text,
  principal boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create index fornecedor_contas_fornecedor on public.fornecedor_contas (fornecedor_id);
create unique index fornecedor_contas_uma_principal on public.fornecedor_contas (fornecedor_id) where principal and ativo;

-- Filha herda o órgão da mãe (o app não escolhe o tenant_id da conta bancária)
create function public.herda_tenant_fornecedor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select tenant_id into new.tenant_id from fornecedores where id = new.fornecedor_id;
  if new.tenant_id is null then
    raise exception 'Fornecedor não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

-- =====================================================================
-- Servidores
-- =====================================================================

create table public.servidores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  -- lotação: unidade da estrutura (Diretoria, Coordenação, Gerência, Setor...)
  unidade_id uuid not null references public.unidades_organizacionais(id),
  nome text not null check (length(btrim(nome)) between 3 and 200),
  matricula text not null check (length(btrim(matricula)) between 1 and 30),
  cargo text,
  funcao text,
  email_institucional text,
  telefone text,
  data_nomeacao date,
  data_exoneracao date,
  jornada text,
  numero_comunicado text,
  atribuicoes text,
  observacoes text,
  foto_path text,
  -- conta de acesso da própria pessoa (ligada pelo e-mail institucional)
  user_id uuid references public.perfis(id),
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (data_exoneracao is null or data_nomeacao is null or data_exoneracao >= data_nomeacao)
);
create unique index servidores_matricula_unica on public.servidores (tenant_id, lower(btrim(matricula)));
create index servidores_unidade on public.servidores (unidade_id);
create index servidores_ordem on public.servidores (tenant_id, lower(nome));
create index servidores_busca on public.servidores using gin
  ((lower(nome || ' ' || matricula || ' ' || coalesce(cargo, '') || ' ' || coalesce(funcao, ''))) extensions.gin_trgm_ops);
create index servidores_usuario on public.servidores (user_id) where user_id is not null;

-- Dados pessoais sensíveis (LGPD): tabela separada, leitura só com permissão própria ou pela própria pessoa
create table public.servidores_dados_pessoais (
  servidor_id uuid primary key references public.servidores(id),
  tenant_id uuid not null references public.tenants(id),
  cpf text check (cpf is null or (cpf ~ '^[0-9]{11}$' and public.cpf_valido(cpf))),
  data_nascimento date check (data_nascimento between '1900-01-01' and '2100-01-01'),
  nome_mae text,
  naturalidade text,
  tipo_sanguineo text check (tipo_sanguineo in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  email_pessoal text,
  cep text check (cep ~ '^[0-9]{8}$'),
  logradouro text, numero text, complemento text, bairro text, cidade text,
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index servidores_cpf_unico on public.servidores_dados_pessoais (tenant_id, cpf) where cpf is not null;
create index servidores_aniversario on public.servidores_dados_pessoais
  (tenant_id, extract(month from data_nascimento), extract(day from data_nascimento));

create function public.prepara_servidor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from unidades_organizacionais where id = new.unidade_id and tenant_id = new.tenant_id) then
    raise exception 'A unidade de lotação não pertence a este órgão.' using errcode = 'check_violation', hint = 'unidade_id';
  end if;
  new.email_institucional := nullif(lower(btrim(new.email_institucional)), '');
  -- liga a conta de acesso pelo e-mail institucional (se a pessoa tiver vínculo no órgão)
  if new.email_institucional is not null then
    select p.id into new.user_id from perfis p
     where p.email = new.email_institucional
       and exists (select 1 from vinculos v where v.user_id = p.id and v.tenant_id = new.tenant_id);
  else
    new.user_id := null;
  end if;
  return new;
end $$;

create function public.herda_tenant_servidor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select tenant_id into new.tenant_id from servidores where id = new.servidor_id;
  if new.tenant_id is null then
    raise exception 'Servidor não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create function public.servidor_unidade(p_servidor uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select unidade_id from servidores where id = p_servidor
$$;

-- =====================================================================
-- Unidades atendidas e grupos de rateio
-- =====================================================================

create table public.unidades_atendidas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  nome text not null check (length(btrim(nome)) between 2 and 200),
  sigla text,
  tipo text not null default 'UNIDADE' check (length(btrim(tipo)) between 2 and 60),
  codigo text,  -- ex.: CNES
  cep text check (cep ~ '^[0-9]{8}$'),
  logradouro text, numero text, complemento text, bairro text, cidade text,
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  telefone text, email text,
  responsavel_id uuid references public.servidores(id),
  unidade_org_id uuid references public.unidades_organizacionais(id),
  -- grupo agrupador (ex.: "UBS/USF", "CAPS") cujos componentes recebem rateio
  eh_grupo boolean not null default false,
  regra_rateio text not null default 'NAO_APLICAVEL' check (regra_rateio in ('OBRIGATORIO', 'OPCIONAL', 'NAO_APLICAVEL')),
  participa_rateio boolean not null default true,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (eh_grupo or regra_rateio = 'NAO_APLICAVEL')
);
create unique index unidades_atendidas_nome_unico on public.unidades_atendidas (tenant_id, lower(btrim(nome)));
create index unidades_atendidas_busca on public.unidades_atendidas using gin
  ((lower(nome || ' ' || coalesce(sigla, '') || ' ' || tipo || ' ' || coalesce(bairro, ''))) extensions.gin_trgm_ops);

create table public.unidades_grupo_membros (
  grupo_id uuid not null references public.unidades_atendidas(id),
  membro_id uuid not null references public.unidades_atendidas(id),
  tenant_id uuid not null references public.tenants(id),
  criado_em timestamptz not null default now(), criado_por uuid,
  primary key (grupo_id, membro_id),
  check (grupo_id <> membro_id)
);
create index unidades_grupo_membros_membro on public.unidades_grupo_membros (membro_id);

create function public.valida_membro_grupo() returns trigger
language plpgsql security definer set search_path = public as $$
declare g unidades_atendidas; m unidades_atendidas;
begin
  select * into g from unidades_atendidas where id = new.grupo_id;
  select * into m from unidades_atendidas where id = new.membro_id;
  if g.id is null or m.id is null then raise exception 'Unidade não encontrada.' using errcode = 'foreign_key_violation'; end if;
  if g.tenant_id <> m.tenant_id then raise exception 'As unidades pertencem a órgãos diferentes.' using errcode = 'check_violation'; end if;
  if not g.eh_grupo then raise exception '"%" não é um grupo de rateio.', g.nome using errcode = 'check_violation'; end if;
  if m.eh_grupo then raise exception 'Um grupo não pode conter outro grupo ("%").', m.nome using errcode = 'check_violation'; end if;
  new.tenant_id := g.tenant_id;
  return new;
end $$;

create function public.valida_unidade_atendida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.responsavel_id is not null and not exists (select 1 from servidores where id = new.responsavel_id and tenant_id = new.tenant_id) then
    raise exception 'O responsável não é servidor deste órgão.' using errcode = 'check_violation', hint = 'responsavel_id';
  end if;
  if new.unidade_org_id is not null and not exists (select 1 from unidades_organizacionais where id = new.unidade_org_id and tenant_id = new.tenant_id) then
    raise exception 'A unidade da estrutura não pertence a este órgão.' using errcode = 'check_violation', hint = 'unidade_org_id';
  end if;
  if tg_op = 'UPDATE' and old.eh_grupo and not new.eh_grupo
     and exists (select 1 from unidades_grupo_membros where grupo_id = new.id) then
    raise exception 'Remova as unidades do grupo antes de desmarcá-lo como grupo.' using errcode = 'check_violation', hint = 'eh_grupo';
  end if;
  if tg_op = 'UPDATE' and not old.eh_grupo and new.eh_grupo
     and exists (select 1 from unidades_grupo_membros where membro_id = new.id) then
    raise exception 'Esta unidade pertence a um grupo e não pode virar grupo.' using errcode = 'check_violation', hint = 'eh_grupo';
  end if;
  return new;
end $$;

-- =====================================================================
-- Classificação orçamentária
-- =====================================================================

create table public.classificador_tipos (
  codigo text primary key,
  nome text not null,
  pai_tipo text references public.classificador_tipos(codigo),
  pai_obrigatorio boolean not null default false,
  ordem int not null
);
insert into public.classificador_tipos (codigo, nome, pai_tipo, pai_obrigatorio, ordem) values
  ('ORGAO', 'Órgão', null, false, 10),
  ('UNIDADE_ORCAMENTARIA', 'Unidade Orçamentária', 'ORGAO', false, 20),
  ('FUNCAO', 'Função', null, false, 30),
  ('SUBFUNCAO', 'Subfunção', null, false, 40),
  ('PROGRAMA', 'Programa', null, false, 50),
  ('ACAO', 'Ação (Projeto/Atividade/Op. Especial)', 'PROGRAMA', false, 60),
  ('CATEGORIA_ECONOMICA', 'Categoria Econômica', null, false, 70),
  ('GND', 'Grupo de Natureza da Despesa (GND)', null, false, 80),
  ('MODALIDADE', 'Modalidade de Aplicação', null, false, 90),
  ('ELEMENTO', 'Elemento de Despesa', null, false, 100),
  ('SUBELEMENTO', 'Subelemento', 'ELEMENTO', true, 110),
  ('FONTE', 'Fonte de Recurso', null, false, 120),
  ('DETALHAMENTO_FONTE', 'Detalhamento da Fonte', 'FONTE', true, 130);

create table public.classificadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  tipo text not null references public.classificador_tipos(codigo),
  codigo text not null check (codigo ~ '^[0-9A-Za-z.\-/]{1,30}$'),
  descricao text not null check (length(btrim(descricao)) between 2 and 300),
  pai_id uuid references public.classificadores(id),
  natureza_acao text check (natureza_acao in ('PROJETO', 'ATIVIDADE', 'OPERACAO_ESPECIAL')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (natureza_acao is null or tipo = 'ACAO')
);
create unique index classificadores_codigo_unico on public.classificadores
  (tenant_id, tipo, coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);
create index classificadores_tipo on public.classificadores (tenant_id, tipo, codigo);

create function public.valida_classificador() returns trigger
language plpgsql security definer set search_path = public as $$
declare t classificador_tipos; p classificadores;
begin
  select * into t from classificador_tipos where codigo = new.tipo;
  if new.pai_id is null and t.pai_obrigatorio then
    raise exception '% exige o vínculo com %.', t.nome, (select nome from classificador_tipos where codigo = t.pai_tipo)
      using errcode = 'check_violation', hint = 'pai_id';
  end if;
  if new.pai_id is not null then
    select * into p from classificadores where id = new.pai_id;
    if p.id is null or p.tenant_id <> new.tenant_id then
      raise exception 'Classificador superior não encontrado neste órgão.' using errcode = 'check_violation', hint = 'pai_id';
    end if;
    if t.pai_tipo is distinct from p.tipo then
      raise exception '% só pode ficar abaixo de %.', t.nome, coalesce((select nome from classificador_tipos where codigo = t.pai_tipo), 'nenhum classificador')
        using errcode = 'check_violation', hint = 'pai_id';
    end if;
  end if;
  -- natureza da ação pelo 1º dígito (padrão da contabilidade pública), se não informada
  if new.tipo = 'ACAO' and new.natureza_acao is null then
    new.natureza_acao := case left(new.codigo, 1) when '1' then 'PROJETO' when '2' then 'ATIVIDADE'
                                                  when '0' then 'OPERACAO_ESPECIAL' end;
  end if;
  if tg_op = 'UPDATE' and new.tipo <> old.tipo then
    raise exception 'O tipo de um classificador não pode ser alterado.' using errcode = 'check_violation', hint = 'tipo';
  end if;
  return new;
end $$;

-- Dotação: combinação de classificadores usada por contratos, empenhos e notas
create table public.classificacoes_orcamentarias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  orgao_id uuid references public.classificadores(id),
  unidade_orcamentaria_id uuid references public.classificadores(id),
  funcao_id uuid references public.classificadores(id),
  subfuncao_id uuid references public.classificadores(id),
  programa_id uuid references public.classificadores(id),
  acao_id uuid not null references public.classificadores(id),
  categoria_economica_id uuid references public.classificadores(id),
  gnd_id uuid references public.classificadores(id),
  modalidade_id uuid references public.classificadores(id),
  elemento_id uuid not null references public.classificadores(id),
  subelemento_id uuid references public.classificadores(id),
  fonte_id uuid not null references public.classificadores(id),
  detalhamento_fonte_id uuid references public.classificadores(id),
  descricao text,
  -- mantidos por gatilho para exibição e busca
  codigo_completo text not null default '',
  busca text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index classificacoes_combinacao_unica on public.classificacoes_orcamentarias (
  tenant_id,
  coalesce(orgao_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(unidade_orcamentaria_id, '00000000-0000-0000-0000-000000000000'::uuid),
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
  coalesce(detalhamento_fonte_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index classificacoes_busca on public.classificacoes_orcamentarias using gin (busca extensions.gin_trgm_ops);
create index classificacoes_acao on public.classificacoes_orcamentarias (acao_id);
create index classificacoes_elemento on public.classificacoes_orcamentarias (elemento_id);
create index classificacoes_fonte on public.classificacoes_orcamentarias (fonte_id);

create function public.prepara_classificacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  campos text[] := array['orgao_id:ORGAO', 'unidade_orcamentaria_id:UNIDADE_ORCAMENTARIA', 'funcao_id:FUNCAO',
    'subfuncao_id:SUBFUNCAO', 'programa_id:PROGRAMA', 'acao_id:ACAO', 'categoria_economica_id:CATEGORIA_ECONOMICA',
    'gnd_id:GND', 'modalidade_id:MODALIDADE', 'elemento_id:ELEMENTO', 'subelemento_id:SUBELEMENTO',
    'fonte_id:FONTE', 'detalhamento_fonte_id:DETALHAMENTO_FONTE'];
  par text; col text; tipo_esperado text; v_id uuid; c classificadores;
  linha jsonb;
  cod jsonb := '{}'; des text := '';
begin
  linha := to_jsonb(new);
  foreach par in array campos loop
    col := split_part(par, ':', 1); tipo_esperado := split_part(par, ':', 2);
    v_id := (linha ->> col)::uuid;
    if v_id is not null then
      select * into c from classificadores where id = v_id;
      if c.id is null or c.tenant_id <> new.tenant_id then
        raise exception 'Classificador não encontrado neste órgão.' using errcode = 'check_violation', hint = col;
      end if;
      if c.tipo <> tipo_esperado then
        raise exception 'O campo % recebeu um classificador do tipo errado.', col using errcode = 'check_violation', hint = col;
      end if;
      cod := cod || jsonb_build_object(tipo_esperado, c.codigo);
      des := des || ' ' || c.descricao;
    end if;
  end loop;
  -- dependências: subelemento do elemento, detalhamento da fonte, ação do programa, UO do órgão
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
  new.codigo_completo := concat_ws(' | ',
    nullif(concat_ws('.', cod ->> 'ORGAO', cod ->> 'UNIDADE_ORCAMENTARIA'), ''),
    nullif(concat_ws('.', cod ->> 'FUNCAO', cod ->> 'SUBFUNCAO', cod ->> 'PROGRAMA', cod ->> 'ACAO'), ''),
    nullif(concat_ws('.', cod ->> 'CATEGORIA_ECONOMICA', cod ->> 'GND', cod ->> 'MODALIDADE', cod ->> 'ELEMENTO', cod ->> 'SUBELEMENTO'), ''),
    'Fonte ' || concat_ws('.', cod ->> 'FONTE', cod ->> 'DETALHAMENTO_FONTE'));
  new.busca := lower(new.codigo_completo || ' ' || des || ' ' || coalesce(new.descricao, ''));
  return new;
end $$;

-- Ao mudar código/descrição de um classificador, as dotações que o usam se atualizam
create function public.propaga_classificador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update classificacoes_orcamentarias set atualizado_em = now()
   where new.id in (orgao_id, unidade_orcamentaria_id, funcao_id, subfuncao_id, programa_id, acao_id,
                    categoria_economica_id, gnd_id, modalidade_id, elemento_id, subelemento_id, fonte_id, detalhamento_fonte_id);
  return null;
end $$;

-- =====================================================================
-- Tipos de serviço
-- =====================================================================

create table public.tipos_servico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  nome text not null check (length(btrim(nome)) between 2 and 100),
  descricao text,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index tipos_servico_nome_unico on public.tipos_servico (tenant_id, lower(btrim(nome)));

create function public.criar_tipos_servico_padrao(p_tenant uuid) returns void
language sql security definer set search_path = public as $$
  insert into tipos_servico (tenant_id, nome, ordem)
  select p_tenant, nome, ordem from (values
    ('Manutenção preventiva', 10), ('Manutenção corretiva', 20), ('Material de consumo', 30), ('Construção', 40),
    ('Plotagem', 50), ('Limpeza', 60), ('Material de expediente', 70), ('Água', 80), ('Combustível', 90), ('Outros', 999)
  ) v(nome, ordem)
  on conflict do nothing
$$;

create function public.tenant_tipos_servico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform criar_tipos_servico_padrao(new.id);
  return null;
end $$;
create trigger tenants_tipos_servico after insert on public.tenants
  for each row execute function public.tenant_tipos_servico();

select public.criar_tipos_servico_padrao(id) from public.tenants;

-- =====================================================================
-- Gatilhos padrão (carimbos, tenant imutável, auditoria, inativação)
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['fornecedores', 'fornecedor_contas', 'servidores', 'unidades_atendidas', 'classificadores',
                           'classificacoes_orcamentarias', 'tipos_servico'] loop
    execute format('create trigger %1$s_criacao before insert on public.%1$s for each row execute function public.carimbar_criacao()', t);
    execute format('create trigger %1$s_carimbar before update on public.%1$s for each row execute function public.carimbar()', t);
    execute format('create trigger %1$s_tenant before update on public.%1$s for each row execute function public.bloquear_troca_tenant()', t);
    execute format('create trigger %1$s_auditar after insert or update or delete on public.%1$s for each row execute function public.auditar()', t);
  end loop;
  foreach t in array array['fornecedores', 'unidades_atendidas', 'classificadores', 'classificacoes_orcamentarias', 'tipos_servico'] loop
    execute format('create trigger %1$s_justificativa before update of ativo on public.%1$s for each row execute function public.exige_justificativa_inativacao()', t);
  end loop;
end $$;

create trigger servidores_dados_carimbar before update on public.servidores_dados_pessoais for each row execute function public.carimbar();
create trigger servidores_dados_herda before insert or update on public.servidores_dados_pessoais for each row execute function public.herda_tenant_servidor();
-- tipo sanguíneo, CPF, nascimento e nome da mãe não ficam legíveis na auditoria
create trigger servidores_dados_auditar after insert or update or delete on public.servidores_dados_pessoais
  for each row execute function public.auditar('tipo_sanguineo', 'cpf', 'data_nascimento', 'nome_mae');
create trigger fornecedor_contas_herda before insert or update of fornecedor_id on public.fornecedor_contas
  for each row execute function public.herda_tenant_fornecedor();
create trigger servidores_prepara before insert or update on public.servidores for each row execute function public.prepara_servidor();
create trigger unidades_atendidas_valida before insert or update on public.unidades_atendidas for each row execute function public.valida_unidade_atendida();
create trigger unidades_grupo_membros_valida before insert on public.unidades_grupo_membros for each row execute function public.valida_membro_grupo();
create trigger unidades_grupo_membros_criacao before insert on public.unidades_grupo_membros for each row execute function public.carimbar_criacao();
create trigger unidades_grupo_membros_auditar after insert or delete on public.unidades_grupo_membros
  for each row execute function public.auditar();
create trigger classificadores_valida before insert or update on public.classificadores for each row execute function public.valida_classificador();
create trigger classificadores_propaga after update of codigo, descricao on public.classificadores for each row execute function public.propaga_classificador();
create trigger classificacoes_prepara before insert or update on public.classificacoes_orcamentarias for each row execute function public.prepara_classificacao();

create trigger fornecedores_inativar before update of ativo on public.fornecedores for each row execute function public.exige_permissao_inativar('fornecedores');
create trigger unidades_atendidas_inativar before update of ativo on public.unidades_atendidas for each row execute function public.exige_permissao_inativar('unidades');
create trigger classificadores_inativar before update of ativo on public.classificadores for each row execute function public.exige_permissao_inativar('classificacoes');
create trigger classificacoes_inativar before update of ativo on public.classificacoes_orcamentarias for each row execute function public.exige_permissao_inativar('classificacoes');
create trigger tipos_servico_inativar before update of ativo on public.tipos_servico for each row execute function public.exige_permissao_inativar('tipos_servico');

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.fornecedores enable row level security;
alter table public.fornecedor_contas enable row level security;
alter table public.servidores enable row level security;
alter table public.servidores_dados_pessoais enable row level security;
alter table public.unidades_atendidas enable row level security;
alter table public.unidades_grupo_membros enable row level security;
alter table public.classificador_tipos enable row level security;
alter table public.classificadores enable row level security;
alter table public.classificacoes_orcamentarias enable row level security;
alter table public.tipos_servico enable row level security;

-- Cadastros do órgão inteiro (sem unidade): qualquer escopo do órgão lê; escrita conforme a matriz
create policy fornecedores_ler on public.fornecedores for select to authenticated using (pode(tenant_id, null, 'fornecedores', 'ler'));
create policy fornecedores_criar on public.fornecedores for insert to authenticated with check (pode(tenant_id, null, 'fornecedores', 'criar'));
create policy fornecedores_editar on public.fornecedores for update to authenticated
  using (pode(tenant_id, null, 'fornecedores', 'editar')) with check (pode(tenant_id, null, 'fornecedores', 'editar'));

create policy fornecedor_contas_ler on public.fornecedor_contas for select to authenticated using (pode(tenant_id, null, 'fornecedores', 'ler'));
create policy fornecedor_contas_criar on public.fornecedor_contas for insert to authenticated
  with check (exists (select 1 from fornecedores f where f.id = fornecedor_id and pode(f.tenant_id, null, 'fornecedores', 'editar')));
create policy fornecedor_contas_editar on public.fornecedor_contas for update to authenticated
  using (pode(tenant_id, null, 'fornecedores', 'editar')) with check (pode(tenant_id, null, 'fornecedores', 'editar'));

-- Servidores: pela unidade de lotação (subárvore do vínculo); a própria pessoa vê o seu cadastro
create policy servidores_ler on public.servidores for select to authenticated
  using (pode(tenant_id, unidade_id, 'servidores', 'ler') or user_id = auth.uid());
create policy servidores_criar on public.servidores for insert to authenticated with check (pode(tenant_id, unidade_id, 'servidores', 'criar'));
create policy servidores_editar on public.servidores for update to authenticated
  using (pode(tenant_id, unidade_id, 'servidores', 'editar')) with check (pode(tenant_id, unidade_id, 'servidores', 'editar'));

create policy servidores_dados_ler on public.servidores_dados_pessoais for select to authenticated
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores_sensiveis', 'ler')
         or exists (select 1 from servidores s where s.id = servidor_id and s.user_id = auth.uid()));
create policy servidores_dados_criar on public.servidores_dados_pessoais for insert to authenticated
  with check (exists (select 1 from servidores s where s.id = servidor_id
                       and (pode(s.tenant_id, s.unidade_id, 'servidores_sensiveis', 'criar') or pode(s.tenant_id, s.unidade_id, 'servidores_sensiveis', 'editar'))));
create policy servidores_dados_editar on public.servidores_dados_pessoais for update to authenticated
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores_sensiveis', 'editar'))
  with check (pode(tenant_id, servidor_unidade(servidor_id), 'servidores_sensiveis', 'editar'));

create policy unidades_atendidas_ler on public.unidades_atendidas for select to authenticated using (pode(tenant_id, null, 'unidades', 'ler'));
create policy unidades_atendidas_criar on public.unidades_atendidas for insert to authenticated with check (pode(tenant_id, null, 'unidades', 'criar'));
create policy unidades_atendidas_editar on public.unidades_atendidas for update to authenticated
  using (pode(tenant_id, null, 'unidades', 'editar')) with check (pode(tenant_id, null, 'unidades', 'editar'));

create policy unidades_grupo_ler on public.unidades_grupo_membros for select to authenticated using (pode(tenant_id, null, 'unidades', 'ler'));
create policy unidades_grupo_incluir on public.unidades_grupo_membros for insert to authenticated
  with check (exists (select 1 from unidades_atendidas g where g.id = grupo_id and pode(g.tenant_id, null, 'unidades', 'editar')));
create policy unidades_grupo_remover on public.unidades_grupo_membros for delete to authenticated using (pode(tenant_id, null, 'unidades', 'editar'));

create policy classificador_tipos_ler on public.classificador_tipos for select to authenticated using (true);

create policy classificadores_ler on public.classificadores for select to authenticated using (pode(tenant_id, null, 'classificacoes', 'ler'));
create policy classificadores_criar on public.classificadores for insert to authenticated with check (pode(tenant_id, null, 'classificacoes', 'criar'));
create policy classificadores_editar on public.classificadores for update to authenticated
  using (pode(tenant_id, null, 'classificacoes', 'editar')) with check (pode(tenant_id, null, 'classificacoes', 'editar'));

create policy classificacoes_ler on public.classificacoes_orcamentarias for select to authenticated using (pode(tenant_id, null, 'classificacoes', 'ler'));
create policy classificacoes_criar on public.classificacoes_orcamentarias for insert to authenticated with check (pode(tenant_id, null, 'classificacoes', 'criar'));
create policy classificacoes_editar on public.classificacoes_orcamentarias for update to authenticated
  using (pode(tenant_id, null, 'classificacoes', 'editar')) with check (pode(tenant_id, null, 'classificacoes', 'editar'));

create policy tipos_servico_ler on public.tipos_servico for select to authenticated using (pode(tenant_id, null, 'tipos_servico', 'ler'));
create policy tipos_servico_criar on public.tipos_servico for insert to authenticated with check (pode(tenant_id, null, 'tipos_servico', 'criar'));
create policy tipos_servico_editar on public.tipos_servico for update to authenticated
  using (pode(tenant_id, null, 'tipos_servico', 'editar')) with check (pode(tenant_id, null, 'tipos_servico', 'editar'));

-- Nada é apagado pela API (exceto tirar uma unidade de um grupo de rateio)
revoke all on public.fornecedores, public.fornecedor_contas, public.servidores, public.servidores_dados_pessoais,
  public.unidades_atendidas, public.unidades_grupo_membros, public.classificador_tipos, public.classificadores,
  public.classificacoes_orcamentarias, public.tipos_servico from anon;
revoke delete on public.fornecedores, public.fornecedor_contas, public.servidores, public.servidores_dados_pessoais,
  public.unidades_atendidas, public.classificador_tipos, public.classificadores, public.classificacoes_orcamentarias,
  public.tipos_servico from authenticated;
revoke insert, update on public.classificador_tipos from authenticated;
revoke update on public.unidades_grupo_membros from authenticated;
-- a ligação com a conta de acesso é feita pelo gatilho (e-mail institucional), não pelo app:
-- o UPDATE é concedido coluna a coluna, sem user_id
revoke update on public.servidores from authenticated;
grant update (unidade_id, nome, matricula, cargo, funcao, email_institucional, telefone, data_nomeacao, data_exoneracao,
              jornada, numero_comunicado, atribuicoes, observacoes, foto_path) on public.servidores to authenticated;

-- =====================================================================
-- RPCs
-- =====================================================================

-- Busca paginada de servidores. CPF só entra na busca/resultado para quem pode ver dados pessoais.
create function public.buscar_servidores(
  p_tenant uuid, p_busca text default null, p_situacao text default 'ATIVOS', p_unidade uuid default null,
  p_limite int default 25, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_like text;
  v_digitos text := nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '');
  v_res jsonb;
begin
  if p_situacao not in ('ATIVOS', 'EXONERADOS', 'TODOS') then
    raise exception 'Situação inválida.' using errcode = 'check_violation';
  end if;
  if nullif(btrim(p_busca), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with base as (
    select s.*, u.nome as unidade_nome, u.sigla as unidade_sigla,
           pode(s.tenant_id, s.unidade_id, 'servidores_sensiveis', 'ler') as ve_sensivel,
           (s.data_exoneracao is not null and s.data_exoneracao <= hoje()) as exonerado
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
     where s.tenant_id = p_tenant
       and (pode(s.tenant_id, s.unidade_id, 'servidores', 'ler') or s.user_id = auth.uid())
       and (p_unidade is null or p_unidade = any(u.caminho))
  ),
  filtrados as (
    select b.*, d.cpf as cpf_sensivel from base b
      left join servidores_dados_pessoais d on d.servidor_id = b.id
     where (p_situacao = 'TODOS' or (p_situacao = 'ATIVOS' and not b.exonerado) or (p_situacao = 'EXONERADOS' and b.exonerado))
       and (v_like is null
            or lower(b.nome || ' ' || b.matricula || ' ' || coalesce(b.cargo, '') || ' ' || coalesce(b.funcao, '')
                     || ' ' || b.unidade_nome || ' ' || coalesce(b.unidade_sigla, '')) like v_like
            or (b.ve_sensivel and v_digitos is not null and length(v_digitos) >= 3 and d.cpf like '%' || v_digitos || '%'))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.nome, 'matricula', f.matricula, 'cargo', f.cargo, 'funcao', f.funcao,
        'unidade_id', f.unidade_id, 'unidade_nome', f.unidade_nome, 'unidade_sigla', f.unidade_sigla,
        'email_institucional', f.email_institucional, 'telefone', f.telefone, 'foto_path', f.foto_path,
        'data_nomeacao', f.data_nomeacao, 'data_exoneracao', f.data_exoneracao, 'exonerado', f.exonerado,
        'tem_acesso', f.user_id is not null,
        'cpf', case when f.ve_sensivel then f.cpf_sensivel end) order by lower(f.nome), f.matricula)
      from (select * from filtrados order by lower(nome), matricula
            limit least(greatest(p_limite, 1), 100) offset greatest(p_offset, 0)) f), '[]'))
  into v_res;
  return v_res;
end $$;

-- Aniversariantes do mês: só dia e mês (nunca o ano), respeitando o escopo de leitura de servidores
create function public.aniversariantes(p_tenant uuid, p_mes int default null) returns table (
  servidor_id uuid, nome text, dia int, mes int, unidade_sigla text, unidade_nome text, foto_path text, hoje boolean
)
language sql stable security definer set search_path = public as $$
  select s.id, s.nome, extract(day from d.data_nascimento)::int, extract(month from d.data_nascimento)::int,
         u.sigla, u.nome, s.foto_path,
         extract(day from d.data_nascimento) = extract(day from hoje()) and extract(month from d.data_nascimento) = extract(month from hoje())
    from servidores s
    join servidores_dados_pessoais d on d.servidor_id = s.id
    join unidades_organizacionais u on u.id = s.unidade_id
   where s.tenant_id = p_tenant
     and d.data_nascimento is not null
     and (s.data_exoneracao is null or s.data_exoneracao > hoje())
     and extract(month from d.data_nascimento) = coalesce(p_mes, extract(month from hoje())::int)
     and pode(s.tenant_id, s.unidade_id, 'servidores', 'ler')
   order by 3, lower(s.nome)
$$;

-- O próprio servidor atualiza contato e endereço (dados funcionais continuam protegidos)
create function public.atualizar_meus_dados_servidor(p_servidor uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_permitidos text[] := array['email_pessoal', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
        k text;
begin
  if not exists (select 1 from servidores where id = p_servidor and user_id = auth.uid()) then
    raise exception 'Você só pode alterar o seu próprio cadastro.' using errcode = 'insufficient_privilege';
  end if;
  for k in select jsonb_object_keys(p_dados) loop
    if k <> 'telefone' and not k = any(v_permitidos) then
      raise exception 'O campo "%" só pode ser alterado pela administração. Peça a correção ao setor responsável.', k
        using errcode = 'insufficient_privilege', hint = k;
    end if;
  end loop;
  if p_dados ? 'telefone' then
    update servidores set telefone = nullif(btrim(p_dados ->> 'telefone'), '') where id = p_servidor;
  end if;
  insert into servidores_dados_pessoais (servidor_id, tenant_id) select id, tenant_id from servidores where id = p_servidor
  on conflict (servidor_id) do nothing;
  update servidores_dados_pessoais set
    email_pessoal = case when p_dados ? 'email_pessoal' then nullif(lower(btrim(p_dados ->> 'email_pessoal')), '') else email_pessoal end,
    cep = case when p_dados ? 'cep' then nullif(regexp_replace(p_dados ->> 'cep', '\D', '', 'g'), '') else cep end,
    logradouro = case when p_dados ? 'logradouro' then nullif(btrim(p_dados ->> 'logradouro'), '') else logradouro end,
    numero = case when p_dados ? 'numero' then nullif(btrim(p_dados ->> 'numero'), '') else numero end,
    complemento = case when p_dados ? 'complemento' then nullif(btrim(p_dados ->> 'complemento'), '') else complemento end,
    bairro = case when p_dados ? 'bairro' then nullif(btrim(p_dados ->> 'bairro'), '') else bairro end,
    cidade = case when p_dados ? 'cidade' then nullif(btrim(p_dados ->> 'cidade'), '') else cidade end,
    uf = case when p_dados ? 'uf' then nullif(upper(btrim(p_dados ->> 'uf')), '') else uf end
  where servidor_id = p_servidor;
end $$;

-- =====================================================================
-- Privilégios das funções novas
-- =====================================================================

revoke execute on function
  public.cnpj_valido(text), public.cpf_valido(text), public.hoje(), public.exige_permissao_inativar(),
  public.herda_tenant_fornecedor(), public.prepara_servidor(), public.herda_tenant_servidor(), public.servidor_unidade(uuid),
  public.valida_membro_grupo(), public.valida_unidade_atendida(), public.valida_classificador(), public.prepara_classificacao(),
  public.propaga_classificador(), public.criar_tipos_servico_padrao(uuid), public.tenant_tipos_servico(),
  public.buscar_servidores(uuid, text, text, uuid, int, int), public.aniversariantes(uuid, int),
  public.atualizar_meus_dados_servidor(uuid, jsonb)
from public, anon;

revoke execute on function
  public.exige_permissao_inativar(), public.herda_tenant_fornecedor(), public.prepara_servidor(), public.herda_tenant_servidor(),
  public.valida_membro_grupo(), public.valida_unidade_atendida(), public.valida_classificador(), public.prepara_classificacao(),
  public.propaga_classificador(), public.criar_tipos_servico_padrao(uuid), public.tenant_tipos_servico()
from authenticated;

grant execute on function
  public.cnpj_valido(text), public.cpf_valido(text), public.hoje(), public.servidor_unidade(uuid),
  public.buscar_servidores(uuid, text, text, uuid, int, int), public.aniversariantes(uuid, int),
  public.atualizar_meus_dados_servidor(uuid, jsonb)
to authenticated;
