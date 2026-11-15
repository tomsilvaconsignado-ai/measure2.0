-- MEASURE 2.0 — Aviso por E-MAIL aos responsáveis pelo contrato
--
-- Cada novidade de contrato (nota recebida, atesto, pagamento, aditivo, vigência, designação, documento, OS...)
-- já gera uma notificação interna para gestor, fiscal e suplente designados (notificar_evento). Agora essa mesma
-- notificação também entra numa fila de e-mail. A Edge Function "email" (credenciais do provedor só no servidor)
-- reserva lotes da fila, envia e devolve o resultado. Mesmo desenho do PUSH: envio assíncrono, com tentativas,
-- sem nunca deixar lenta ou derrubar a operação que gerou o aviso.
--
-- Regras:
--  * só notificações do módulo CONTRATOS (os responsáveis pelo contrato);
--  * o órgão pode desligar o e-mail (tenant_configuracoes.email_notificacoes);
--  * a pessoa escolhe por categoria; categoria obrigatória no órgão sempre vai;
--  * o endereço é o do perfil (login), lido só na hora do envio;
--  * itens que não saírem em 24 h são descartados (evita "enxurrada" atrasada de avisos velhos).

alter table public.tenant_configuracoes add column email_notificacoes boolean not null default true;
alter table public.notificacao_preferencias add column email boolean;  -- nulo = padrão (recebe)

create table public.email_fila (
  id bigint generated always as identity primary key,
  notificacao_id uuid not null unique references public.notificacoes(id) on delete cascade,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHA', 'DESCARTADO')),
  tentativas int not null default 0,
  proxima_em timestamptz not null default now(),
  reservado_em timestamptz,
  enviado_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now()
);
create index email_fila_pendentes on public.email_fila (proxima_em) where status in ('PENDENTE', 'ENVIANDO');
alter table public.email_fila enable row level security;
revoke all on public.email_fila from anon, authenticated;   -- só pelas funções

-- A pessoa quer E-MAIL dessa categoria? (obrigatória no órgão: sempre)
create function public.quer_email(p_tenant uuid, p_user uuid, p_categoria text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select email_notificacoes from tenant_configuracoes where tenant_id = p_tenant), true)
     and case
           when coalesce((select obrigatoria from notificacao_config where tenant_id = p_tenant and categoria = p_categoria),
                         (select obrigatoria_padrao from notificacao_categorias where codigo = p_categoria), false) then true
           else coalesce((select email from notificacao_preferencias where user_id = p_user and categoria = p_categoria), true)
         end
$$;

-- Cada notificação nova de contrato entra na fila de e-mail
create function public.enfileirar_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into email_fila (notificacao_id)
  select n.id from novas n
   where n.modulo = 'CONTRATOS'
     and quer_email(n.tenant_id, n.user_id, coalesce(n.categoria, categoria_notificacao(n.modulo, n.tipo)))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform disparar_email(); end if;
  return null;
end $$;

-- Acorda a Edge Function (pg_net, depois do commit). Sem pg_net/segredo configurado: a rotina de 1 em 1 min envia.
create function public.disparar_email() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_segredo text;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  v_url := (select valor #>> '{}' from configuracoes_globais where chave = 'email_funcao_url');
  if v_url is null then return; end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_segredo using 'email_disparo_segredo';
  exception when others then v_segredo := null;
  end;
  if v_segredo is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000)'
    using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-email-segredo', v_segredo);
exception when others then
  null;  -- o envio nunca derruba a operação que gerou a notificação
end $$;
create trigger notificacoes_email after insert on public.notificacoes referencing new table as novas
  for each statement execute function public.enfileirar_email();

-- Reserva um lote para a Edge Function (só service_role)
create function public.email_reservar(p_limite int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  update email_fila set status = 'PENDENTE' where status = 'ENVIANDO' and reservado_em < now() - interval '5 minutes';
  update email_fila set status = 'DESCARTADO', ultimo_erro = 'Não enviado em 24 horas'
   where status = 'PENDENTE' and criado_em < now() - interval '24 hours';
  with alvo as (
    select f.id from email_fila f
     where f.status = 'PENDENTE' and f.proxima_em <= now()
     order by f.proxima_em limit least(greatest(p_limite, 1), 100)
     for update skip locked
  ), marcados as (
    update email_fila f set status = 'ENVIANDO', reservado_em = now(), tentativas = f.tentativas + 1
      from alvo where f.id = alvo.id returning f.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'para', p.email, 'nome', nullif(p.nome, ''),
      'titulo', n.titulo, 'descricao', coalesce(n.descricao, ''), 'link', coalesce(n.link, '/minhas-notificacoes'),
      'contrato', (select c.numero from contratos c where c.id = n.contrato_id),
      'orgao', (select t.nome_curto from tenants t where t.id = n.tenant_id))), '[]')
    into v
    from marcados m join notificacoes n on n.id = m.notificacao_id join perfis p on p.id = n.user_id;
  return v;
end $$;

-- p_resultados: [{id, ok, erro}]
create function public.email_concluir(p_resultados jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_f email_fila; v_n int := 0;
begin
  for r in select * from jsonb_array_elements(p_resultados) loop
    select * into v_f from email_fila where id = (r ->> 'id')::bigint;
    if v_f.id is null then continue; end if;
    if (r ->> 'ok')::boolean then
      update email_fila set status = 'ENVIADO', enviado_em = now(), ultimo_erro = null where id = v_f.id;
    else
      update email_fila set
        status = case when v_f.tentativas >= 5 then 'FALHA' else 'PENDENTE' end,
        proxima_em = now() + (case v_f.tentativas when 1 then 1 when 2 then 5 when 3 then 15 else 60 end) * interval '1 minute',
        ultimo_erro = left(r ->> 'erro', 500)
       where id = v_f.id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- =====================================================================
-- Funções da própria pessoa e da administração
-- =====================================================================
create function public.minhas_preferencias_email(p_tenant uuid)
returns table (categoria text, obrigatoria boolean, email boolean, orgao_ativo boolean)
language sql stable security definer set search_path = public as $$
  select c.codigo, coalesce(nc.obrigatoria, c.obrigatoria_padrao),
         coalesce(nc.obrigatoria, c.obrigatoria_padrao) or coalesce(p.email, true),
         coalesce((select email_notificacoes from tenant_configuracoes where tenant_id = p_tenant), true)
    from notificacao_categorias c
    left join notificacao_config nc on nc.tenant_id = p_tenant and nc.categoria = c.codigo
    left join notificacao_preferencias p on p.user_id = auth.uid() and p.categoria = c.codigo
   where auth.uid() is not null and membro_do_tenant(p_tenant) and c.modulo = 'CONTRATOS'
   order by c.ordem
$$;

create function public.salvar_preferencia_email(p_categoria text, p_email boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login.' using errcode = 'insufficient_privilege'; end if;
  insert into notificacao_preferencias (user_id, categoria, push, email) values (auth.uid(), p_categoria, true, p_email)
  on conflict (user_id, categoria) do update set email = excluded.email, atualizado_em = now();
end $$;

-- Situação do e-mail no órgão (Master do órgão e plataforma)
create function public.email_situacao(p_tenant uuid, p_de timestamptz, p_ate timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Painel de notificações disponível só para o Master do órgão e a plataforma.' using errcode = 'insufficient_privilege';
  end if;
  return (
    with fl as (select f.* from email_fila f join notificacoes n on n.id = f.notificacao_id
                 where n.tenant_id = p_tenant and f.criado_em >= p_de and f.criado_em < p_ate)
    select jsonb_build_object(
      'ativo', coalesce((select email_notificacoes from tenant_configuracoes where tenant_id = p_tenant), true),
      'configurado', exists (select 1 from configuracoes_globais where chave = 'email_funcao_url'),
      'enviados', (select count(*) from fl where status = 'ENVIADO'),
      'pendentes', (select count(*) from fl where status in ('PENDENTE', 'ENVIANDO')),
      'falhas', (select count(*) from fl where status = 'FALHA'),
      'descartados', (select count(*) from fl where status = 'DESCARTADO'),
      'ultimo_erro', (select ultimo_erro from fl where ultimo_erro is not null order by criado_em desc limit 1)));
end $$;

create function public.salvar_email_notificacoes(p_tenant uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Somente o Master do órgão e a plataforma configuram as notificações.' using errcode = 'insufficient_privilege';
  end if;
  update tenant_configuracoes set email_notificacoes = coalesce(p_ativo, true) where tenant_id = p_tenant;
  if not coalesce(p_ativo, true) then
    update email_fila f set status = 'DESCARTADO', ultimo_erro = 'E-mail desligado pelo órgão'
      from notificacoes n where n.id = f.notificacao_id and n.tenant_id = p_tenant and f.status in ('PENDENTE', 'ENVIANDO');
  end if;
end $$;

-- =====================================================================
-- Permissões das funções
-- =====================================================================
revoke execute on function
  public.quer_email(uuid, uuid, text), public.enfileirar_email(), public.disparar_email(),
  public.email_reservar(int), public.email_concluir(jsonb)
from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.email_reservar(int), public.email_concluir(jsonb) to service_role;
  end if;
end $$;
revoke execute on function
  public.minhas_preferencias_email(uuid), public.salvar_preferencia_email(text, boolean),
  public.email_situacao(uuid, timestamptz, timestamptz), public.salvar_email_notificacoes(uuid, boolean)
from public, anon;
grant execute on function
  public.minhas_preferencias_email(uuid), public.salvar_preferencia_email(text, boolean),
  public.email_situacao(uuid, timestamptz, timestamptz), public.salvar_email_notificacoes(uuid, boolean)
to authenticated;

-- Rotina de 1 em 1 minuto para as novas tentativas (só onde pg_cron existe — produção)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('measure-email-fila', '* * * * *',
      $c$select public.disparar_email() where exists (select 1 from public.email_fila where status = 'PENDENTE' and proxima_em <= now())$c$);
  end if;
end $$;

-- Mesma barreira de verificação em duas etapas das demais tabelas
create policy mfa_obrigatorio on public.email_fila as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
