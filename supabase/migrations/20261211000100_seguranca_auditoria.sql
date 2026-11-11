-- Correções da auditoria de segurança (11/11/2026).
--
-- 1. PUSH
--    * O endereço do aparelho só pode ser de um serviço de push conhecido (Google, Mozilla, Apple,
--      Microsoft). Antes qualquer https:// era aceito e a função de envio fazia requisições a ele
--      (SSRF: o servidor podia ser usado para disparar chamadas contra sites de terceiros).
--    * No máximo 10 aparelhos ativos por pessoa (os mais antigos são desativados).
--    * Uma inscrição de outra pessoa só muda de dono quando quem registra apresenta as mesmas chaves
--      do aparelho (mesmo navegador, outra conta). Só conhecer o endereço não basta.
--
-- 2. VERIFICAÇÃO EM DUAS ETAPAS (MFA)
--    * Obrigatória para administradores: administrador da plataforma e papel MASTER em algum órgão.
--    * Quem ativou por conta própria também passa a precisar dela em toda sessão.
--    * O banco recusa qualquer chamada da API (tabelas e funções) dessas contas enquanto a sessão
--      não estiver confirmada com o código (aal2): função de pré-requisição do PostgREST.
--      Política restritiva em todas as tabelas e nos arquivos cobre o que não passa por ela
--      (Storage e Realtime).

-- =====================================================================
-- 1. PUSH
-- =====================================================================
create function public.endpoint_push_valido(p_endpoint text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^\s]{8,}$', false)
     and length(p_endpoint) <= 1000
$$;

-- vale para inscrições novas e alteradas; as antigas são tratadas logo abaixo
alter table public.push_inscricoes add constraint push_inscricoes_servico_conhecido
  check (endpoint_push_valido(endpoint)) not valid;

update public.push_inscricoes set ativo = false, revogado_em = now(),
       motivo_revogacao = 'Endereço fora dos serviços de push conhecidos (auditoria de segurança)'
 where ativo and not endpoint_push_valido(endpoint);

create or replace function public.registrar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_atual push_inscricoes;
begin
  if auth.uid() is null then raise exception 'Faça login.' using errcode = 'insufficient_privilege'; end if;
  if not endpoint_push_valido(p_endpoint) then
    raise exception 'Endereço de notificação inválido.' using errcode = 'check_violation', hint = 'endpoint';
  end if;
  select * into v_atual from push_inscricoes where endpoint = p_endpoint;
  if v_atual.id is not null and v_atual.user_id <> auth.uid()
     and (v_atual.p256dh is distinct from p_p256dh or v_atual.auth is distinct from p_auth) then
    raise exception 'Este aparelho está vinculado a outra conta.' using errcode = 'insufficient_privilege';
  end if;
  insert into push_inscricoes (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 120))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    dispositivo = excluded.dispositivo, ativo = true, revogado_em = null, motivo_revogacao = null
  returning id into v_id;
  -- no máximo 10 aparelhos ativos por pessoa: desativa os mais antigos
  update push_inscricoes set ativo = false, revogado_em = now(), motivo_revogacao = 'Limite de aparelhos (os 10 mais recentes ficam ativos)'
   where user_id = auth.uid() and ativo
     and id not in (select id from push_inscricoes where user_id = auth.uid() and ativo order by criado_em desc limit 10)
     and id <> v_id;
  return v_id;
end $$;

-- =====================================================================
-- 2. MFA
-- =====================================================================
-- sessão confirmada com o segundo fator? (aal2 no token)
create function public.sessao_verificada() returns boolean
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
                  'aal1') = 'aal2'
$$;

-- a pessoa tem autenticador confirmado?
create function public.tem_fator_mfa() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status::text = 'verified')
$$;

-- a conta é de administrador (MFA obrigatório)?
create function public.exige_mfa() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis p where p.id = auth.uid() and p.is_platform_admin and p.ativo)
      or exists (select 1 from vinculos v where v.user_id = auth.uid() and v.ativo and v.papel = 'MASTER')
$$;

-- a sessão pode usar o sistema? (sem login, sessão confirmada, ou conta que não precisa do segundo fator)
create function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null or sessao_verificada() or not (exige_mfa() or tem_fator_mfa())
$$;

-- Pré-requisição do PostgREST: roda antes de toda chamada à API
create function public.verificar_mfa() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not mfa_ok() then
    raise exception 'Confirme o código da verificação em duas etapas para continuar.'
      using errcode = 'insufficient_privilege', hint = 'mfa_obrigatorio';
  end if;
end $$;

revoke execute on function public.endpoint_push_valido(text), public.sessao_verificada(), public.tem_fator_mfa(),
  public.exige_mfa(), public.mfa_ok(), public.verificar_mfa() from public, anon, authenticated;
-- só o necessário: mfa_ok nas políticas e verificar_mfa na pré-requisição (as demais rodam dentro delas).
-- Sem login (anon) não há execução: nenhuma chamada anônima à API é permitida no MEASURE.
grant execute on function public.mfa_ok(), public.verificar_mfa() to authenticated;

-- Política restritiva em todas as tabelas com RLS (soma-se às regras existentes: só restringe)
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t.relname);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t.relname);
  end loop;
end $$;
drop policy if exists mfa_obrigatorio on storage.objects;
create policy mfa_obrigatorio on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Liga a pré-requisição no PostgREST (só existe no Supabase; nos testes locais é ignorado)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.verificar_mfa''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end $$;
