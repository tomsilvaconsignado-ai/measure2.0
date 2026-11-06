-- Decretos por órgão (cadastrados pela plataforma, usados nos textos da nota fiscal), dados curriculares
-- e histórico de férias do servidor, e férias do mês no consolidado mensal.

-- =====================================================================
-- Decretos do órgão
-- =====================================================================

insert into public.recursos (codigo, nome, grupo, ordem, livre_para_plataforma) values
  ('decretos', 'Decretos do órgão (consulta e PDF)', 'Contratos e execução', 225, true);
-- leitura para todos os papéis que trabalham com notas (o cadastro é só da plataforma)
insert into public.permissoes_papel (papel, recurso, acao)
select p.codigo, 'decretos', 'ler' from public.papeis p where p.codigo <> 'SERVIDOR';

create table public.decretos_orgao (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  numero text not null check (length(btrim(numero)) between 1 and 60),
  descricao text not null check (length(btrim(descricao)) between 3 and 500),
  data_publicacao date check (data_publicacao between '1900-01-01' and '2100-12-31'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index decretos_orgao_numero_unico on public.decretos_orgao (tenant_id, lower(btrim(numero)));

create trigger decretos_orgao_criacao before insert on public.decretos_orgao for each row execute function public.carimbar_criacao();
create trigger decretos_orgao_carimbar before update on public.decretos_orgao for each row execute function public.carimbar();
create trigger decretos_orgao_tenant before update on public.decretos_orgao for each row execute function public.bloquear_troca_tenant();
create trigger decretos_orgao_auditar after insert or update or delete on public.decretos_orgao for each row execute function public.auditar();

alter table public.decretos_orgao enable row level security;
create policy decretos_ler on public.decretos_orgao for select to authenticated
  using ((select eh_admin_plataforma()) or membro_do_tenant(tenant_id));
create policy decretos_criar on public.decretos_orgao for insert to authenticated with check ((select eh_admin_plataforma()));
create policy decretos_editar on public.decretos_orgao for update to authenticated
  using ((select eh_admin_plataforma())) with check ((select eh_admin_plataforma()));
revoke all on public.decretos_orgao from anon;
revoke delete on public.decretos_orgao from authenticated;

-- =====================================================================
-- Dados curriculares do servidor (todos opcionais)
-- =====================================================================

alter table public.servidores
  add column escolaridade text check (escolaridade in ('FUNDAMENTAL_INCOMPLETO', 'FUNDAMENTAL', 'MEDIO_INCOMPLETO', 'MEDIO', 'TECNICO',
    'SUPERIOR_INCOMPLETO', 'SUPERIOR', 'ESPECIALIZACAO', 'MESTRADO', 'DOUTORADO', 'POS_DOUTORADO')),
  add column curriculo_observacoes text check (length(curriculo_observacoes) <= 4000);
grant update (escolaridade, curriculo_observacoes) on public.servidores to authenticated;

-- Formações, cursos, capacitações, especializações, certificações e experiências (vários por servidor)
create table public.servidor_curriculo_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  servidor_id uuid not null references public.servidores(id),
  tipo text not null check (tipo in ('FORMACAO', 'CURSO', 'CAPACITACAO', 'ESPECIALIZACAO', 'CERTIFICACAO', 'EXPERIENCIA')),
  titulo text not null check (length(btrim(titulo)) between 2 and 300),
  instituicao text check (length(instituicao) <= 300),
  ano_conclusao int check (ano_conclusao between 1940 and 2100),
  carga_horaria int check (carga_horaria between 1 and 20000),
  inicio date check (inicio between '1940-01-01' and '2100-12-31'),
  fim date check (fim between '1940-01-01' and '2100-12-31'),
  observacoes text check (length(observacoes) <= 2000),
  excluido_em timestamptz, excluido_por uuid,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (fim is null or inicio is null or fim >= inicio)
);
create index servidor_curriculo_servidor on public.servidor_curriculo_itens (servidor_id) where excluido_em is null;

create trigger servidor_curriculo_herda before insert or update on public.servidor_curriculo_itens for each row execute function public.herda_tenant_servidor();
create trigger servidor_curriculo_criacao before insert on public.servidor_curriculo_itens for each row execute function public.carimbar_criacao();
create trigger servidor_curriculo_carimbar before update on public.servidor_curriculo_itens for each row execute function public.carimbar();
create trigger servidor_curriculo_auditar after insert or update or delete on public.servidor_curriculo_itens for each row execute function public.auditar();

alter table public.servidor_curriculo_itens enable row level security;
create policy curriculo_ler on public.servidor_curriculo_itens for select to authenticated
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'ler')
         or exists (select 1 from servidores s where s.id = servidor_id and s.user_id = auth.uid()));
create policy curriculo_criar on public.servidor_curriculo_itens for insert to authenticated
  with check (exists (select 1 from servidores s where s.id = servidor_id and pode(s.tenant_id, s.unidade_id, 'servidores', 'editar')));
create policy curriculo_editar on public.servidor_curriculo_itens for update to authenticated
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'editar'))
  with check (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'editar'));
revoke all on public.servidor_curriculo_itens from anon;
-- remover é marcar excluido_em (o registro continua na auditoria)
revoke delete on public.servidor_curriculo_itens from authenticated;

-- =====================================================================
-- Histórico de férias do servidor
--   situação: CANCELADA (cancelada_em), PENDENTE (sem período de gozo), PROGRAMADA (gozo no futuro),
--             EM_GOZO (hoje dentro do gozo) ou GOZADA (gozo terminado) — calculada, nunca digitada
-- =====================================================================

create table public.servidor_ferias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  servidor_id uuid not null references public.servidores(id),
  aquisitivo_inicio date not null check (aquisitivo_inicio between '1940-01-01' and '2100-12-31'),
  aquisitivo_fim date not null check (aquisitivo_fim between '1940-01-01' and '2100-12-31'),
  gozo_inicio date check (gozo_inicio between '1940-01-01' and '2100-12-31'),
  gozo_fim date check (gozo_fim between '1940-01-01' and '2100-12-31'),
  dias int generated always as (gozo_fim - gozo_inicio + 1) stored,
  observacoes text check (length(observacoes) <= 1000),
  cancelada_em timestamptz, cancelada_por uuid,
  motivo_cancelamento text check (length(motivo_cancelamento) <= 500),
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (aquisitivo_fim > aquisitivo_inicio),
  check ((gozo_inicio is null) = (gozo_fim is null)),
  check (gozo_fim is null or gozo_fim >= gozo_inicio),
  check (gozo_fim is null or gozo_fim - gozo_inicio + 1 <= 60),
  check ((cancelada_em is null) = (motivo_cancelamento is null))
);
create index servidor_ferias_servidor on public.servidor_ferias (servidor_id, aquisitivo_inicio);
create index servidor_ferias_gozo on public.servidor_ferias (tenant_id, gozo_inicio, gozo_fim) where cancelada_em is null;

create function public.situacao_ferias(p_gozo_inicio date, p_gozo_fim date, p_cancelada timestamptz) returns text
language sql stable set search_path = public as $$
  select case
    when p_cancelada is not null then 'CANCELADA'
    when p_gozo_inicio is null then 'PENDENTE'
    when p_gozo_fim < hoje() then 'GOZADA'
    when p_gozo_inicio > hoje() then 'PROGRAMADA'
    else 'EM_GOZO' end
$$;

-- Evita duplicidade: gozo sobreposto, o mesmo período aquisitivo pendente duas vezes
-- e mais de 60 dias de gozo no mesmo período aquisitivo; registro cancelado não volta a ser editado
create function public.valida_ferias() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_conflito record; v_total int; v_motivo text;
begin
  if tg_op = 'UPDATE' and old.cancelada_em is not null then
    raise exception 'Férias canceladas não podem ser alteradas. Registre um novo período.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.cancelada_em is not null then
    v_motivo := btrim(new.motivo_cancelamento);
    if coalesce(length(v_motivo), 0) < 5 then
      raise exception 'Informe o motivo do cancelamento (mínimo de 5 caracteres).' using errcode = 'check_violation', hint = 'motivo_cancelamento';
    end if;
    -- cancelar não altera mais nada do registro
    new := old;
    new.cancelada_em := now(); new.cancelada_por := auth.uid(); new.motivo_cancelamento := v_motivo;
    new.atualizado_em := now(); new.atualizado_por := auth.uid();
    return new;
  end if;
  if new.cancelada_em is not null then
    raise exception 'Para cancelar, use a opção Cancelar do registro.' using errcode = 'check_violation';
  end if;
  if new.gozo_inicio is not null then
    select f.gozo_inicio, f.gozo_fim into v_conflito from servidor_ferias f
     where f.servidor_id = new.servidor_id and f.id <> new.id and f.cancelada_em is null and f.gozo_inicio is not null
       and daterange(f.gozo_inicio, f.gozo_fim, '[]') && daterange(new.gozo_inicio, new.gozo_fim, '[]') limit 1;
    if found then
      raise exception 'Já há férias registradas de % a % que coincidem com este período de gozo.',
        to_char(v_conflito.gozo_inicio, 'DD/MM/YYYY'), to_char(v_conflito.gozo_fim, 'DD/MM/YYYY')
        using errcode = 'unique_violation', hint = 'gozo_inicio';
    end if;
    -- new.dias (coluna gerada) ainda não foi calculada no gatilho BEFORE
    select coalesce(sum(f.dias), 0) + (new.gozo_fim - new.gozo_inicio + 1) into v_total from servidor_ferias f
     where f.servidor_id = new.servidor_id and f.id <> new.id and f.cancelada_em is null
       and f.aquisitivo_inicio = new.aquisitivo_inicio and f.aquisitivo_fim = new.aquisitivo_fim;
    if v_total > 60 then
      raise exception 'O período aquisitivo de % a % passaria a ter % dias de gozo (máximo de 60).',
        to_char(new.aquisitivo_inicio, 'DD/MM/YYYY'), to_char(new.aquisitivo_fim, 'DD/MM/YYYY'), v_total
        using errcode = 'check_violation', hint = 'gozo_fim';
    end if;
  elsif exists (select 1 from servidor_ferias f where f.servidor_id = new.servidor_id and f.id <> new.id and f.cancelada_em is null
                   and f.gozo_inicio is null and f.aquisitivo_inicio = new.aquisitivo_inicio and f.aquisitivo_fim = new.aquisitivo_fim) then
    raise exception 'Este período aquisitivo já está registrado como pendente. Edite o registro existente para informar o gozo.'
      using errcode = 'unique_violation', hint = 'aquisitivo_inicio';
  end if;
  new.observacoes := nullif(btrim(new.observacoes), '');
  return new;
end $$;

create trigger servidor_ferias_herda before insert or update on public.servidor_ferias for each row execute function public.herda_tenant_servidor();
create trigger servidor_ferias_valida before insert or update on public.servidor_ferias for each row execute function public.valida_ferias();
create trigger servidor_ferias_criacao before insert on public.servidor_ferias for each row execute function public.carimbar_criacao();
create trigger servidor_ferias_carimbar before update on public.servidor_ferias for each row execute function public.carimbar();
create trigger servidor_ferias_auditar after insert or update or delete on public.servidor_ferias for each row execute function public.auditar();

alter table public.servidor_ferias enable row level security;
create policy ferias_ler on public.servidor_ferias for select to authenticated
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'ler')
         or exists (select 1 from servidores s where s.id = servidor_id and s.user_id = auth.uid()));
create policy ferias_criar on public.servidor_ferias for insert to authenticated
  with check (exists (select 1 from servidores s where s.id = servidor_id and pode(s.tenant_id, s.unidade_id, 'servidores', 'editar')));
create policy ferias_editar on public.servidor_ferias for update to authenticated
  using (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'editar'))
  with check (pode(tenant_id, servidor_unidade(servidor_id), 'servidores', 'editar'));
revoke all on public.servidor_ferias from anon;
-- histórico completo: nada é apagado, só cancelado com motivo
revoke delete on public.servidor_ferias from authenticated;

-- Histórico com situação e responsável pelo lançamento (mesmo filtro de acesso da tabela)
create view public.v_servidor_ferias with (security_invoker = false) as
select f.*, situacao_ferias(f.gozo_inicio, f.gozo_fim, f.cancelada_em) as situacao,
       coalesce(pc.nome, pc.email) as registrado_por_nome, coalesce(px.nome, px.email) as cancelada_por_nome
  from servidor_ferias f
  left join perfis pc on pc.id = f.criado_por
  left join perfis px on px.id = f.cancelada_por
 where pode(f.tenant_id, servidor_unidade(f.servidor_id), 'servidores', 'ler')
    or exists (select 1 from servidores s where s.id = f.servidor_id and s.user_id = auth.uid());
revoke all on public.v_servidor_ferias from anon;
grant select on public.v_servidor_ferias to authenticated;

-- =====================================================================
-- Consolidado mensal: servidores do consolidado com férias no mês
-- =====================================================================

create function public.ferias_do_consolidado(p_tenant uuid, p_unidade uuid, p_ano int, p_mes int)
returns table (servidor_id uuid, matricula text, nome text, gozo_inicio date, gozo_fim date, dias int, dias_no_mes int, situacao text)
language sql stable security definer set search_path = public as $$
  -- consolidado_mensal já confere o acesso e o escopo da unidade
  with c as (select * from consolidado_mensal(p_tenant, p_unidade, p_ano, p_mes)),
       mes as (select make_date(p_ano, p_mes, 1) as ini, (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date as fim)
  select c.servidor_id, c.matricula, c.nome, f.gozo_inicio, f.gozo_fim, f.dias,
         (least(f.gozo_fim, mes.fim) - greatest(f.gozo_inicio, mes.ini) + 1)::int,
         situacao_ferias(f.gozo_inicio, f.gozo_fim, f.cancelada_em)
    from c join servidor_ferias f on f.servidor_id = c.servidor_id, mes
   where f.cancelada_em is null and f.gozo_inicio is not null
     and f.gozo_inicio <= mes.fim and f.gozo_fim >= mes.ini
   order by lower(c.nome), f.gozo_inicio
$$;

create or replace function public.emitir_consolidado(p_tenant uuid, p_unidade uuid, p_ano int, p_mes int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dados jsonb; v_textos jsonb; v_unid record; v_secretaria text; v_linhas jsonb; v_ferias jsonb;
begin
  if p_unidade is null then raise exception 'Escolha a unidade do consolidado.' using hint = 'unidade'; end if;
  if not pode(p_tenant, p_unidade, 'servidores', 'exportar') then
    raise exception 'Você não tem permissão para emitir o consolidado desta unidade.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_unid from unidades_organizacionais where id = p_unidade and tenant_id = p_tenant;
  if v_unid.id is null then raise exception 'Unidade não encontrada.' using hint = 'unidade'; end if;
  select coalesce(textos, '{}') into v_textos from tenant_configuracoes where tenant_id = p_tenant;
  select u.nome into v_secretaria from unidades_organizacionais u
   where u.id = any(v_unid.caminho) and u.tipo = 'SECRETARIA' order by array_length(u.caminho, 1) desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('matricula', c.matricula, 'nome', c.nome, 'cargo', c.cargo, 'funcao', c.funcao,
           'unidade', c.unidade_sigla, 'atrasos', c.atrasos, 'faltas', c.faltas, 'observacao', c.observacao)), '[]')
    into v_linhas from consolidado_mensal(p_tenant, p_unidade, p_ano, p_mes) c;
  select coalesce(jsonb_agg(jsonb_build_object('matricula', f.matricula, 'nome', f.nome, 'inicio', f.gozo_inicio, 'fim', f.gozo_fim,
           'dias', f.dias, 'dias_no_mes', f.dias_no_mes, 'situacao', f.situacao)), '[]')
    into v_ferias from ferias_do_consolidado(p_tenant, p_unidade, p_ano, p_mes) f;
  v_dados := jsonb_build_object(
    'orgao', cabecalho_orgao(p_tenant),
    'titulo', coalesce(nullif(btrim(v_textos ->> 'consolidado_titulo'), ''), 'CONSOLIDADO MENSAL DE FREQUÊNCIA'),
    'secretaria', v_secretaria,
    'unidade', jsonb_build_object('nome', v_unid.nome, 'sigla', v_unid.sigla, 'tipo', v_unid.tipo),
    'ano', p_ano, 'mes', p_mes,
    'assinaturas', coalesce(v_textos -> 'consolidado_assinaturas', '["Chefe Imediato", "Coordenador(a)"]'),
    'linhas', v_linhas,
    'ferias', v_ferias,
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now());
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados, referencia)
  values (p_tenant, p_unidade, 'CONSOLIDADO_MENSAL', p_unidade,
          'Consolidado ' || lpad(p_mes::text, 2, '0') || '/' || p_ano || ' · ' || coalesce(v_unid.sigla, v_unid.nome), v_dados, p_ano * 100 + p_mes)
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- Cópia de segurança do órgão: inclui decretos, currículo e férias
-- =====================================================================

create or replace function public.exportar_backup_orgao(p_tenant uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb := '{}'; t text;
  tabelas text[] := array['unidades_organizacionais', 'tenant_configuracoes', 'fornecedores', 'fornecedor_contas', 'servidores',
    'servidores_dados_pessoais', 'unidades_atendidas', 'unidades_grupo_membros',
    'tipos_servico', 'contratos', 'contrato_designacoes', 'contrato_dotacoes', 'contrato_aditivos', 'documentos', 'empenhos',
    'empenho_reforcos', 'empenho_unidades', 'notas_fiscais', 'nota_referencias', 'nota_unidades', 'nota_atestos', 'nota_pagamentos',
    'ordens_servico', 'os_unidades', 'frequencias_mensais', 'documentos_emitidos', 'vinculos',
    'decretos_orgao', 'servidor_curriculo_itens', 'servidor_ferias'];
  dados jsonb; v_total int := 0;
begin
  if not pode(p_tenant, null, 'configuracoes', 'exportar', true) then
    raise exception 'Só a administração do órgão pode gerar a cópia de segurança.' using errcode = 'insufficient_privilege';
  end if;
  foreach t in array tabelas loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where x.tenant_id = $1', t) into dados using p_tenant;
    v := v || jsonb_build_object(t, dados);
    v_total := v_total + jsonb_array_length(dados);
  end loop;
  perform registrar_auditoria(p_tenant, 'tenants', p_tenant::text, 'EXPORTACAO', null,
    jsonb_build_object('tipo', 'Cópia de segurança (JSON)', 'registros', v_total));
  return jsonb_build_object(
    'formato', 'measure-backup', 'versao', 1, 'gerado_em', now(),
    'orgao', (select to_jsonb(x) from tenants x where x.id = p_tenant),
    'tabelas', v,
    -- catálogo orçamentário do ente (compartilhado com os demais órgãos do município)
    'catalogo_orcamentario', jsonb_build_object(
      'ente', (select to_jsonb(x) from entes x where x.id = (select ente_id from tenants where id = p_tenant)),
      'classificadores', coalesce((select jsonb_agg(to_jsonb(c)) from classificadores c where c.ente_id = (select ente_id from tenants where id = p_tenant)), '[]'),
      'dotacoes', coalesce((select jsonb_agg(to_jsonb(d)) from classificacoes_orcamentarias d where d.ente_id = (select ente_id from tenants where id = p_tenant)), '[]'),
      'unidades_orcamentarias_do_orgao', coalesce((select jsonb_agg(to_jsonb(m)) from unidade_orcamentaria_orgaos m where m.tenant_id = p_tenant), '[]')));
end $$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function public.situacao_ferias(date, date, timestamptz), public.valida_ferias(),
  public.ferias_do_consolidado(uuid, uuid, int, int) from public, anon;
revoke execute on function public.valida_ferias() from authenticated;
grant execute on function public.situacao_ferias(date, date, timestamptz), public.ferias_do_consolidado(uuid, uuid, int, int) to authenticated;
