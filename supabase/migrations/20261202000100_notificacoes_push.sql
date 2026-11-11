-- MEASURE 2.0 — Central de notificações com PUSH real (Web Push / VAPID)
--
-- Fluxo: evento (gatilhos dos módulos ou rotina diária) → destinatários (designação ativa no contrato,
-- público do CONECTA...) → notificação interna (histórico, sempre gravado) → fila de envio por
-- dispositivo autorizado → Edge Function "push" (chave VAPID privada só no servidor) → resultado.
-- O envio é assíncrono (pg_net depois do commit) e a fila tem tentativas: falha no PUSH nunca perde a
-- notificação interna nem deixa lentos os módulos. Um evento tem chave única: repetir não duplica.
-- Na tela bloqueada só vai um resumo seguro (o conteúdo completo exige login e permissão no destino).

-- =====================================================================
-- Catálogo de categorias e configuração por órgão
-- =====================================================================
create table public.notificacao_categorias (
  codigo text primary key,
  modulo text not null,
  nome text not null,
  descricao text not null,
  obrigatoria_padrao boolean not null default false,
  ordem int not null default 0
);
insert into public.notificacao_categorias (codigo, modulo, nome, descricao, obrigatoria_padrao, ordem) values
  ('CONTRATO_NOTAS', 'CONTRATOS', 'Notas fiscais', 'Nota recebida, atestada, paga, alterada, cancelada ou excluída nos contratos em que você é responsável.', false, 10),
  ('CONTRATO_ATESTO', 'CONTRATOS', 'Prazos de atesto', 'Lembrete de nota fiscal aguardando o seu atesto.', true, 20),
  ('CONTRATO_VIGENCIA', 'CONTRATOS', 'Vigência contratual', 'Contrato próximo do vencimento, vencido, prorrogado ou encerrado.', true, 30),
  ('CONTRATO_ATUALIZACOES', 'CONTRATOS', 'Atualizações do contrato', 'Aditivos, alteração de valor, objeto ou vigência e ordens de serviço.', false, 40),
  ('CONTRATO_RESPONSAVEIS', 'CONTRATOS', 'Gestor, fiscal e suplente', 'Sua designação e a troca de responsáveis do contrato.', true, 50),
  ('CONTRATO_DOCUMENTOS', 'CONTRATOS', 'Documentos anexados', 'Documento anexado ao contrato ou a uma nota fiscal dele.', false, 60),
  ('CONECTA_COMUNICADOS', 'CONECTA', 'Comunicados do CONECTA', 'Publicações direcionadas a você, à sua unidade ou a todos.', false, 70),
  ('CONECTA_INTERACOES', 'CONECTA', 'Menções e respostas', 'Quando mencionam você ou comentam/respondem o que você publicou.', false, 80),
  ('CONECTA_MODERACAO', 'CONECTA', 'Moderação do CONECTA', 'Decisões da moderação sobre as suas publicações e denúncias.', true, 90),
  ('PATRIMONIO', 'PATRIMONIO', 'Gestão patrimonial', 'Transferências a confirmar e bens atribuídos a você.', false, 100),
  ('OUTROS', 'OUTROS', 'Outros avisos', 'Avisos de módulos novos.', false, 200);
alter table public.notificacao_categorias enable row level security;
create policy categorias_ler on public.notificacao_categorias for select to authenticated using (true);
revoke insert, update, delete on public.notificacao_categorias from authenticated;
revoke all on public.notificacao_categorias from anon;

-- Por órgão: a categoria gera notificação? É obrigatória (a pessoa não desliga o PUSH)?
create table public.notificacao_config (
  tenant_id uuid not null references public.tenants(id),
  categoria text not null references public.notificacao_categorias(codigo),
  ativa boolean not null default true,
  obrigatoria boolean not null default false,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  primary key (tenant_id, categoria)
);
alter table public.notificacao_config enable row level security;
create policy notif_config_ler on public.notificacao_config for select to authenticated using (membro_do_tenant(tenant_id) or eh_admin_plataforma());
revoke insert, update, delete on public.notificacao_config from authenticated;
revoke all on public.notificacao_config from anon;
create trigger notificacao_config_auditar after insert or update or delete on public.notificacao_config for each row execute function public.auditar();

-- Antecedências do alerta de vencimento e lembrete de atesto
alter table public.tenant_configuracoes
  add column push_vencimento_dias int[] not null default '{120,90,60,30,15,7,0}',
  add column lembrete_atesto_dias int not null default 5 check (lembrete_atesto_dias between 1 and 90);

create function public.categoria_notificacao(p_modulo text, p_tipo text) returns text
language sql immutable as $$
  select case
    when p_modulo = 'CONTRATOS' and p_tipo in ('NOTA_LEMBRETE_ATESTO') then 'CONTRATO_ATESTO'
    when p_modulo = 'CONTRATOS' and p_tipo like 'NOTA\_%' or p_tipo = 'PAGAMENTO_REALIZADO' then 'CONTRATO_NOTAS'
    when p_modulo = 'CONTRATOS' and p_tipo in ('CONTRATO_VENCENDO', 'CONTRATO_VENCE_HOJE', 'CONTRATO_PRORROGADO', 'CONTRATO_ENCERRADO', 'CONTRATO_REATIVADO') then 'CONTRATO_VIGENCIA'
    when p_modulo = 'CONTRATOS' and p_tipo like 'DESIGNACAO\_%' or p_tipo = 'RESPONSAVEL_ALTERADO' then 'CONTRATO_RESPONSAVEIS'
    when p_modulo = 'CONTRATOS' and p_tipo = 'DOCUMENTO_ANEXADO' then 'CONTRATO_DOCUMENTOS'
    when p_modulo = 'CONTRATOS' then 'CONTRATO_ATUALIZACOES'
    when p_modulo = 'CONECTA' and p_tipo in ('MENCAO', 'COMENTARIO', 'RESPOSTA') then 'CONECTA_INTERACOES'
    when p_modulo = 'CONECTA' and p_tipo in ('MODERACAO', 'DENUNCIA') then 'CONECTA_MODERACAO'
    when p_modulo = 'CONECTA' then 'CONECTA_COMUNICADOS'
    when p_modulo = 'PATRIMONIO' then 'PATRIMONIO'
    else 'OUTROS'
  end
$$;

-- Resumo seguro para a tela bloqueada (sem conteúdo do CONECTA nem dados pessoais)
create function public.push_resumo(p_modulo text, p_tipo text, p_titulo text) returns jsonb
language sql immutable as $$
  select case
    when p_modulo = 'CONECTA' and p_tipo = 'MENCAO' then jsonb_build_object('t', 'Você foi mencionado no CONECTA', 'c', 'Um servidor mencionou você. Toque para ver.')
    when p_modulo = 'CONECTA' and p_tipo in ('COMENTARIO', 'RESPOSTA') then jsonb_build_object('t', 'Nova resposta no CONECTA', 'c', 'Há um novo comentário em uma publicação que você acompanha.')
    when p_modulo = 'CONECTA' and p_tipo in ('MODERACAO', 'DENUNCIA') then jsonb_build_object('t', 'Aviso da moderação do CONECTA', 'c', 'Acesse o sistema para ver os detalhes.')
    when p_modulo = 'CONECTA' then jsonb_build_object('t', 'Nova comunicação no CONECTA', 'c', 'Você recebeu uma nova comunicação institucional. Acesse para visualizar.')
    when p_modulo = 'PATRIMONIO' then jsonb_build_object('t', 'Gestão patrimonial', 'c', 'Há uma movimentação patrimonial para você. Acesse para ver.')
    else jsonb_build_object('t', left(p_titulo, 120), 'c', 'Acesse o MEASURE para ver os detalhes.')
  end
$$;
revoke execute on function public.categoria_notificacao(text, text) from public, anon, authenticated;
revoke execute on function public.push_resumo(text, text, text) from public, anon, authenticated;

-- =====================================================================
-- Eventos, notificações, preferências, dispositivos e fila
-- =====================================================================
create table public.notificacao_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  chave text unique,               -- impede o mesmo evento duas vezes
  modulo text not null,
  tipo text not null,
  autor_id uuid,
  contrato_id uuid,
  referencia_id uuid,
  destinatarios int not null default 0,
  criado_em timestamptz not null default now()
);
create index notif_eventos_tenant on public.notificacao_eventos (tenant_id, criado_em desc);
create index notif_eventos_contrato on public.notificacao_eventos (contrato_id) where contrato_id is not null;
alter table public.notificacao_eventos enable row level security;
revoke all on public.notificacao_eventos from anon, authenticated;

alter table public.notificacoes drop constraint notificacoes_modulo_check;
alter table public.notificacoes add constraint notificacoes_modulo_check check (modulo ~ '^[A-Z_]{3,30}$');
alter table public.notificacoes
  add column evento_id uuid references public.notificacao_eventos(id),
  add column categoria text,
  add column contrato_id uuid,
  add column push_titulo text,
  add column push_texto text;
update public.notificacoes set categoria = public.categoria_notificacao(modulo, tipo) where categoria is null;
create index notificacoes_contrato on public.notificacoes (contrato_id) where contrato_id is not null;
create index notificacoes_evento on public.notificacoes (evento_id) where evento_id is not null;

create table public.notificacao_preferencias (
  user_id uuid not null references public.perfis(id) on delete cascade,
  categoria text not null references public.notificacao_categorias(codigo),
  push boolean not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, categoria)
);
alter table public.notificacao_preferencias enable row level security;
create policy preferencias_ler on public.notificacao_preferencias for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.notificacao_preferencias from authenticated;
revoke all on public.notificacao_preferencias from anon;

create table public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.perfis(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  dispositivo text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz,
  ativo boolean not null default true,
  revogado_em timestamptz,
  motivo_revogacao text
);
create index push_inscricoes_pessoa on public.push_inscricoes (user_id) where ativo;
alter table public.push_inscricoes enable row level security;
revoke all on public.push_inscricoes from anon, authenticated;   -- só pelas funções (chaves nunca saem para a tela)

create table public.push_fila (
  id bigint generated always as identity primary key,
  notificacao_id uuid not null references public.notificacoes(id) on delete cascade,
  inscricao_id uuid not null references public.push_inscricoes(id) on delete cascade,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHA', 'DESCARTADO')),
  tentativas int not null default 0,
  proxima_em timestamptz not null default now(),
  reservado_em timestamptz,
  enviado_em timestamptz,
  status_http int,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  unique (notificacao_id, inscricao_id)
);
create index push_fila_pendentes on public.push_fila (proxima_em) where status in ('PENDENTE', 'ENVIANDO');
alter table public.push_fila enable row level security;
revoke all on public.push_fila from anon, authenticated;

-- =====================================================================
-- Geração
-- =====================================================================
-- A pessoa quer PUSH dessa categoria? (obrigatória no órgão: sempre)
create function public.quer_push(p_tenant uuid, p_user uuid, p_categoria text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select obrigatoria from notificacao_config where tenant_id = p_tenant and categoria = p_categoria),
                  (select obrigatoria_padrao from notificacao_categorias where codigo = p_categoria), false) then true
    else coalesce((select push from notificacao_preferencias where user_id = p_user and categoria = p_categoria), true)
  end
$$;

create function public.categoria_ativa(p_tenant uuid, p_categoria text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativa from notificacao_config where tenant_id = p_tenant and categoria = p_categoria), true)
$$;

-- Evento → notificações (uma por pessoa, sem duplicar; quem fez a ação não é avisado)
create function public.notificar_evento(p_tenant uuid, p_chave text, p_modulo text, p_tipo text, p_users uuid[],
                                        p_titulo text, p_descricao text, p_link text, p_referencia uuid, p_contrato uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_evento uuid; v_cat text := categoria_notificacao(p_modulo, p_tipo); v_resumo jsonb := push_resumo(p_modulo, p_tipo, p_titulo); v_n int;
begin
  if p_tenant is null or not categoria_ativa(p_tenant, v_cat) then return 0; end if;
  insert into notificacao_eventos (tenant_id, chave, modulo, tipo, autor_id, contrato_id, referencia_id)
  values (p_tenant, p_chave, p_modulo, p_tipo, auth.uid(), p_contrato, p_referencia)
  on conflict (chave) do nothing
  returning id into v_evento;
  if v_evento is null then return 0; end if;  -- evento já registrado
  insert into notificacoes (tenant_id, user_id, modulo, tipo, titulo, descricao, link, referencia_id, evento_id, categoria, contrato_id, push_titulo, push_texto)
  select p_tenant, x.u, p_modulo, p_tipo, left(p_titulo, 300), left(p_descricao, 500), p_link, p_referencia, v_evento, v_cat, p_contrato,
         v_resumo ->> 't', v_resumo ->> 'c'
    from (select distinct unnest(p_users) u) x
   where x.u is not null and x.u is distinct from auth.uid() and membro_ativo(p_tenant, x.u);
  get diagnostics v_n = row_count;
  update notificacao_eventos set destinatarios = v_n where id = v_evento;
  return v_n;
end $$;

-- A função antiga (CONECTA e Patrimônio) passa a registrar evento, categoria e resumo seguro
create or replace function public.notificar(p_tenant uuid, p_users uuid[], p_modulo text, p_tipo text, p_titulo text,
                                            p_descricao text, p_link text, p_referencia uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  return notificar_evento(p_tenant, null, p_modulo, p_tipo, p_users, p_titulo, p_descricao, p_link, p_referencia, null);
end $$;

-- Cada notificação nova entra na fila de cada dispositivo ativo da pessoa (se ela quer PUSH dessa categoria)
create function public.enfileirar_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into push_fila (notificacao_id, inscricao_id)
  select n.id, i.id
    from novas n join push_inscricoes i on i.user_id = n.user_id and i.ativo
   where quer_push(n.tenant_id, n.user_id, coalesce(n.categoria, categoria_notificacao(n.modulo, n.tipo)))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform disparar_push(); end if;
  return null;
end $$;

-- Acorda a Edge Function (pg_net, depois do commit). Sem pg_net/segredo configurado: a rotina de 1 em 1 min envia.
create function public.disparar_push() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_segredo text;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  v_url := (select valor #>> '{}' from configuracoes_globais where chave = 'push_funcao_url');
  if v_url is null then return; end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_segredo using 'push_disparo_segredo';
  exception when others then v_segredo := null;
  end;
  if v_segredo is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000)'
    using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-push-segredo', v_segredo);
exception when others then
  null;  -- o envio nunca derruba a operação que gerou a notificação
end $$;
create trigger notificacoes_push after insert on public.notificacoes referencing new table as novas
  for each statement execute function public.enfileirar_push();

-- =====================================================================
-- Eventos dos contratos (destinatários = designação ativa, nunca a lotação)
-- =====================================================================
create function public.designados_usuarios(p_contrato uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct s.user_id), '{}')
    from contrato_designacoes d join servidores s on s.id = d.servidor_id
   where d.contrato_id = p_contrato and d.fim is null and d.inicio <= hoje() and s.user_id is not null
$$;

create function public.contrato_rotulo(p_contrato uuid) returns text
language sql stable security definer set search_path = public as $$ select 'Contrato nº ' || numero from contratos where id = p_contrato $$;

create function public.evento_nota() returns trigger
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais := coalesce(new, old); v_ct text := contrato_rotulo(n.contrato_id); v_link text := '/notas?ver=' || n.id;
        v_dest uuid[] := designados_usuarios(n.contrato_id);
begin
  if tg_op = 'INSERT' then
    perform notificar_evento(n.tenant_id, 'nota:' || n.id || ':recebida', 'CONTRATOS',
      case when n.status_atesto = 'PENDENTE' then 'NOTA_AGUARDANDO_ATESTO' else 'NOTA_RECEBIDA' end, v_dest,
      case when n.status_atesto = 'PENDENTE' then 'Nova nota fiscal aguardando atesto' else 'Nova nota fiscal recebida' end,
      'Nota fiscal nº ' || n.numero || ' recebida no ' || v_ct || '. Verifique os documentos e providencie as medidas necessárias.',
      v_link || '&aba=atesto', n.id, n.contrato_id);
  elsif tg_op = 'DELETE' then
    perform notificar_evento(n.tenant_id, 'nota:' || n.id || ':excluida', 'CONTRATOS', 'NOTA_EXCLUIDA', v_dest,
      'Nota fiscal excluída', 'A nota fiscal nº ' || n.numero || ' foi excluída do ' || v_ct || '.', '/contratos/' || n.contrato_id || '?aba=notas', n.id, n.contrato_id);
  else
    if new.cancelada_em is not null and old.cancelada_em is null then
      perform notificar_evento(n.tenant_id, 'nota:' || n.id || ':cancelada', 'CONTRATOS', 'NOTA_CANCELADA', v_dest,
        'Nota fiscal cancelada', 'A nota fiscal nº ' || n.numero || ' do ' || v_ct || ' foi cancelada.', v_link, n.id, n.contrato_id);
    elsif new.status_pagamento = 'PAGO' and old.status_pagamento <> 'PAGO' then
      perform notificar_evento(n.tenant_id, 'nota:' || n.id || ':paga', 'CONTRATOS', 'NOTA_LIQUIDADA', v_dest,
        'Nota fiscal paga', 'A nota fiscal nº ' || n.numero || ' do ' || v_ct || ' foi paga integralmente.', v_link || '&aba=pagamentos', n.id, n.contrato_id);
    elsif (new.numero, new.valor, new.data_emissao, new.empenho_id) is distinct from (old.numero, old.valor, old.data_emissao, old.empenho_id) then
      -- edições seguidas da mesma nota na mesma hora geram um aviso só
      perform notificar_evento(n.tenant_id, 'nota:' || n.id || ':alterada:' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'), 'CONTRATOS', 'NOTA_ALTERADA', v_dest,
        'Nota fiscal alterada', 'Os dados da nota fiscal nº ' || n.numero || ' do ' || v_ct || ' foram corrigidos.', v_link, n.id, n.contrato_id);
    end if;
  end if;
  return null;
end $$;
create trigger notas_notificar after insert or update or delete on public.notas_fiscais for each row execute function public.evento_nota();

create function public.evento_atesto() returns trigger
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais;
begin
  select * into n from notas_fiscais where id = new.nota_id;
  perform notificar_evento(n.tenant_id, 'nota:' || n.id || ':atestada:' || new.id, 'CONTRATOS', 'NOTA_ATESTADA', designados_usuarios(n.contrato_id),
    'Nota fiscal atestada', 'A nota fiscal nº ' || n.numero || ' do ' || contrato_rotulo(n.contrato_id) || ' foi atestada e segue para pagamento.',
    '/notas?ver=' || n.id || '&aba=atesto', n.id, n.contrato_id);
  return null;
end $$;
create trigger atestos_notificar after insert on public.nota_atestos for each row execute function public.evento_atesto();

create function public.evento_pagamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais;
begin
  select * into n from notas_fiscais where id = new.nota_id;
  perform notificar_evento(n.tenant_id, 'pagamento:' || new.id, 'CONTRATOS', 'PAGAMENTO_REALIZADO', designados_usuarios(n.contrato_id),
    'Pagamento realizado', 'Foi registrado um pagamento da nota fiscal nº ' || n.numero || ' do ' || contrato_rotulo(n.contrato_id) || '.',
    '/notas?ver=' || n.id || '&aba=pagamentos', n.id, n.contrato_id);
  return null;
end $$;
create trigger pagamentos_notificar after insert on public.nota_pagamentos for each row execute function public.evento_pagamento();

create function public.evento_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mud text[] := '{}'; v_ct text := 'Contrato nº ' || new.numero; v_dest uuid[] := designados_usuarios(new.id);
begin
  if new.ativo is distinct from old.ativo then
    perform notificar_evento(new.tenant_id, 'contrato:' || new.id || ':' || case when new.ativo then 'reativado' else 'encerrado' end || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
      'CONTRATOS', case when new.ativo then 'CONTRATO_REATIVADO' else 'CONTRATO_ENCERRADO' end, v_dest,
      case when new.ativo then 'Contrato reativado' else 'Contrato encerrado' end,
      'O ' || v_ct || case when new.ativo then ' voltou a ficar ativo.' else ' foi encerrado/inativado.' end, '/contratos/' || new.id, new.id, new.id);
    return null;
  end if;
  if new.data_fim is distinct from old.data_fim or new.data_inicio is distinct from old.data_inicio then v_mud := v_mud || 'vigência'::text; end if;
  if new.valor_global is distinct from old.valor_global then v_mud := v_mud || 'valor'::text; end if;
  if new.objeto is distinct from old.objeto then v_mud := v_mud || 'objeto'::text; end if;
  if cardinality(v_mud) > 0 then
    perform notificar_evento(new.tenant_id, 'contrato:' || new.id || ':alterado:' || array_to_string(v_mud, ',') || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'),
      'CONTRATOS', 'CONTRATO_ALTERADO', v_dest, 'Contrato atualizado',
      'O ' || v_ct || ' teve alteração de ' || array_to_string(v_mud, ', ') || '.', '/contratos/' || new.id, new.id, new.id);
  end if;
  return null;
end $$;
create trigger contratos_notificar after update on public.contratos for each row execute function public.evento_contrato();

create function public.evento_aditivo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ct text := contrato_rotulo(new.contrato_id); v_tenant uuid := (select tenant_id from contratos where id = new.contrato_id);
begin
  if tg_op = 'INSERT' then
    perform notificar_evento(v_tenant, 'aditivo:' || new.id || ':incluido', 'CONTRATOS', 'ADITIVO_INCLUIDO', designados_usuarios(new.contrato_id),
      'Aditivo incluído', 'Foi incluído o aditivo nº ' || new.numero || ' no ' || v_ct || '.', '/contratos/' || new.contrato_id || '?aba=aditivos', new.id, new.contrato_id);
  elsif new.status = 'APROVADO' and old.status <> 'APROVADO' then
    perform notificar_evento(v_tenant, 'aditivo:' || new.id || ':aprovado', 'CONTRATOS',
      case when new.tipo in ('PRAZO', 'PRAZO_E_VALOR') then 'CONTRATO_PRORROGADO' else 'ADITIVO_APROVADO' end, designados_usuarios(new.contrato_id),
      case when new.tipo in ('PRAZO', 'PRAZO_E_VALOR') then 'Vigência contratual prorrogada' else 'Aditivo aprovado' end,
      'O aditivo nº ' || new.numero || ' do ' || v_ct || ' foi aprovado' ||
        case when new.nova_data_fim is not null then '; nova vigência até ' || to_char(new.nova_data_fim, 'DD/MM/YYYY') else '' end ||
        case when new.valor <> 0 then '; alteração de valor' else '' end || '.',
      '/contratos/' || new.contrato_id || '?aba=aditivos', new.id, new.contrato_id);
  end if;
  return null;
end $$;
create trigger aditivos_notificar after insert or update on public.contrato_aditivos for each row execute function public.evento_aditivo();

create function public.evento_designacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ct text := contrato_rotulo(new.contrato_id); v_user uuid := (select user_id from servidores where id = new.servidor_id);
        v_papel text := case new.papel when 'GESTOR' then 'gestor(a)' when 'FISCAL' then 'fiscal' else 'suplente' end;
        v_nome text := (select nome from servidores where id = new.servidor_id);
begin
  if tg_op = 'INSERT' then
    perform notificar_evento(new.tenant_id, 'designacao:' || new.id || ':recebida', 'CONTRATOS', 'DESIGNACAO_RECEBIDA', array[v_user],
      'Você foi designado(a) ' || v_papel || ' de contrato', 'Você foi designado(a) ' || v_papel || ' do ' || v_ct || '.',
      '/contratos/' || new.contrato_id, new.id, new.contrato_id);
    perform notificar_evento(new.tenant_id, 'designacao:' || new.id || ':equipe', 'CONTRATOS', 'RESPONSAVEL_ALTERADO',
      array(select x from unnest(designados_usuarios(new.contrato_id)) x where x is distinct from v_user),
      'Responsáveis do contrato alterados', v_nome || ' passou a ser ' || v_papel || ' do ' || v_ct || '.',
      '/contratos/' || new.contrato_id || '?aba=responsaveis', new.id, new.contrato_id);
  elsif new.fim is not null and old.fim is null then
    perform notificar_evento(new.tenant_id, 'designacao:' || new.id || ':encerrada', 'CONTRATOS', 'DESIGNACAO_ENCERRADA', array[v_user],
      'Sua designação foi encerrada', 'Você deixou de ser ' || v_papel || ' do ' || v_ct || '.', '/meus-contratos', new.id, new.contrato_id);
  end if;
  return null;
end $$;
create trigger designacoes_notificar after insert or update on public.contrato_designacoes for each row execute function public.evento_designacao();

create function public.evento_documento() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_contrato uuid; v_link text;
begin
  if new.recurso = 'contratos' then
    v_contrato := new.registro_id; v_link := '/contratos/' || v_contrato || '?aba=documentos';
  elsif new.recurso = 'notas_fiscais' then
    v_contrato := (select contrato_id from notas_fiscais where id = new.registro_id); v_link := '/notas?ver=' || new.registro_id || '&aba=documentos';
  end if;
  if v_contrato is null or not exists (select 1 from contratos where id = v_contrato) then return null; end if;
  perform notificar_evento(new.tenant_id, 'documento:' || new.id, 'CONTRATOS', 'DOCUMENTO_ANEXADO', designados_usuarios(v_contrato),
    'Documento anexado', 'Foi anexado um documento ' || case when new.recurso = 'notas_fiscais' then 'a uma nota fiscal do ' else 'ao ' end || contrato_rotulo(v_contrato) || '.',
    v_link, new.id, v_contrato);
  return null;
end $$;
create trigger documentos_notificar after insert on public.documentos for each row execute function public.evento_documento();

create function public.evento_os() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contrato_id is null then return null; end if;
  perform notificar_evento(new.tenant_id, 'os:' || new.id, 'CONTRATOS', 'OS_REGISTRADA', designados_usuarios(new.contrato_id),
    'Nova ordem de serviço', 'Foi registrada uma ordem de serviço no ' || contrato_rotulo(new.contrato_id) || '.', '/ordens-servico', new.id, new.contrato_id);
  return null;
end $$;
create trigger os_notificar after insert on public.ordens_servico for each row execute function public.evento_os();

-- Rotina diária: vencimento (nas antecedências do órgão) e lembrete de atesto. A chave do evento
-- garante um aviso por contrato/antecedência e por nota.
create function public.notificacoes_diarias() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_total int := 0;
begin
  for r in
    select c.id, c.tenant_id, c.numero, x.fim data_fim_atual, (x.fim - hoje()) dias
      from contratos c cross join lateral (select contrato_fim_atual(c.id) fim) x
      join tenant_configuracoes tc on tc.tenant_id = c.tenant_id
      join tenants t on t.id = c.tenant_id and t.ativo
     where c.ativo and c.data_inicio <= hoje() and (x.fim - hoje()) = any(tc.push_vencimento_dias)
  loop
    v_total := v_total + notificar_evento(r.tenant_id, 'vencimento:' || r.id || ':' || r.data_fim_atual || ':' || r.dias, 'CONTRATOS',
      case when r.dias = 0 then 'CONTRATO_VENCE_HOJE' else 'CONTRATO_VENCENDO' end, designados_usuarios(r.id),
      case when r.dias = 0 then 'Atenção: contrato vence hoje' else 'Atenção: contrato próximo do vencimento' end,
      'O Contrato nº ' || r.numero || case when r.dias = 0 then ' termina hoje' else ' termina em ' || r.dias || ' dias (' || to_char(r.data_fim_atual, 'DD/MM/YYYY') || ')' end
        || '. Verifique a situação e as providências necessárias.', '/contratos/' || r.id, r.id, r.id);
  end loop;
  for r in
    select n.id, n.tenant_id, n.numero, n.contrato_id
      from notas_fiscais n join tenant_configuracoes tc on tc.tenant_id = n.tenant_id
     where n.status_atesto = 'PENDENTE' and n.cancelada_em is null
       and n.criado_em <= now() - make_interval(days => tc.lembrete_atesto_dias)
  loop
    v_total := v_total + notificar_evento(r.tenant_id, 'nota:' || r.id || ':lembrete-atesto', 'CONTRATOS', 'NOTA_LEMBRETE_ATESTO',
      designados_usuarios(r.contrato_id), 'Nota fiscal aguardando atesto',
      'A nota fiscal nº ' || r.numero || ' do ' || contrato_rotulo(r.contrato_id) || ' ainda aguarda análise e atesto.',
      '/notas?ver=' || r.id || '&aba=atesto', r.id, r.contrato_id);
  end loop;
  return v_total;
end $$;

-- =====================================================================
-- Fila de envio (usada só pela Edge Function, com a chave de serviço)
-- =====================================================================
create function public.push_reservar(p_limite int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  -- itens presos em "enviando" há mais de 5 min voltam para a fila
  update push_fila set status = 'PENDENTE' where status = 'ENVIANDO' and reservado_em < now() - interval '5 minutes';
  with alvo as (
    select f.id from push_fila f
     where f.status = 'PENDENTE' and f.proxima_em <= now()
     order by f.proxima_em limit least(greatest(p_limite, 1), 200)
     for update skip locked
  ), marcados as (
    update push_fila f set status = 'ENVIANDO', reservado_em = now(), tentativas = f.tentativas + 1
      from alvo where f.id = alvo.id returning f.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth,
      'payload', jsonb_build_object('titulo', coalesce(n.push_titulo, n.titulo), 'texto', coalesce(n.push_texto, ''), 'link', coalesce(n.link, '/minhas-notificacoes'),
                                    'tag', n.id, 'notificacao_id', n.id))), '[]')
    into v
    from marcados m join push_inscricoes i on i.id = m.inscricao_id join notificacoes n on n.id = m.notificacao_id;
  return v;
end $$;

-- p_resultados: [{id, ok, status, erro}]
create function public.push_concluir(p_resultados jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_f push_fila; v_n int := 0;
begin
  for r in select * from jsonb_array_elements(p_resultados) loop
    select * into v_f from push_fila where id = (r ->> 'id')::bigint;
    if v_f.id is null then continue; end if;
    if (r ->> 'ok')::boolean then
      update push_fila set status = 'ENVIADO', enviado_em = now(), status_http = (r ->> 'status')::int, ultimo_erro = null where id = v_f.id;
      update push_inscricoes set ultimo_envio = now() where id = v_f.inscricao_id;
    elsif (r ->> 'status')::int in (404, 410) then
      -- inscrição expirada ou revogada no aparelho: desativa e não tenta de novo
      update push_fila set status = 'DESCARTADO', status_http = (r ->> 'status')::int, ultimo_erro = left(r ->> 'erro', 500) where id = v_f.id;
      update push_inscricoes set ativo = false, revogado_em = now(), motivo_revogacao = 'Expirada no serviço de push' where id = v_f.inscricao_id and ativo;
    else
      update push_fila set
        status = case when v_f.tentativas >= 5 then 'FALHA' else 'PENDENTE' end,
        proxima_em = now() + (case v_f.tentativas when 1 then 1 when 2 then 5 when 3 then 15 else 60 end) * interval '1 minute',
        status_http = nullif(r ->> 'status', '')::int, ultimo_erro = left(r ->> 'erro', 500)
       where id = v_f.id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- =====================================================================
-- Funções da própria pessoa
-- =====================================================================
create function public.registrar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login.' using errcode = 'insufficient_privilege'; end if;
  insert into push_inscricoes (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 120))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    dispositivo = excluded.dispositivo, ativo = true, revogado_em = null, motivo_revogacao = null
  returning id into v_id;
  return v_id;
end $$;

create function public.minhas_inscricoes_push() returns table (id uuid, dispositivo text, criado_em timestamptz, ultimo_envio timestamptz, ativo boolean, endpoint_final text)
language sql stable security definer set search_path = public as $$
  select i.id, i.dispositivo, i.criado_em, i.ultimo_envio, i.ativo, right(i.endpoint, 12)
    from push_inscricoes i where i.user_id = auth.uid() and (i.ativo or i.revogado_em > now() - interval '30 days')
   order by i.ativo desc, i.criado_em desc
$$;

create function public.revogar_inscricao_push(p_id uuid default null, p_endpoint text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update push_inscricoes set ativo = false, revogado_em = now(), motivo_revogacao = 'Revogada pelo usuário'
   where user_id = auth.uid() and ativo and (id = p_id or endpoint = p_endpoint);
  get diagnostics v_n = row_count;
  update push_fila set status = 'DESCARTADO', ultimo_erro = 'Dispositivo revogado'
   where status in ('PENDENTE', 'ENVIANDO') and inscricao_id in (select id from push_inscricoes where user_id = auth.uid() and not ativo);
  return v_n;
end $$;

create function public.minhas_preferencias_notificacao(p_tenant uuid)
returns table (categoria text, modulo text, nome text, descricao text, obrigatoria boolean, ativa boolean, push boolean)
language sql stable security definer set search_path = public as $$
  select c.codigo, c.modulo, c.nome, c.descricao,
         coalesce(nc.obrigatoria, c.obrigatoria_padrao), coalesce(nc.ativa, true),
         coalesce(nc.obrigatoria, c.obrigatoria_padrao) or coalesce(p.push, true)
    from notificacao_categorias c
    left join notificacao_config nc on nc.tenant_id = p_tenant and nc.categoria = c.codigo
    left join notificacao_preferencias p on p.user_id = auth.uid() and p.categoria = c.codigo
   where auth.uid() is not null and membro_do_tenant(p_tenant)
   order by c.ordem
$$;

create function public.salvar_preferencia_notificacao(p_categoria text, p_push boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login.' using errcode = 'insufficient_privilege'; end if;
  insert into notificacao_preferencias (user_id, categoria, push) values (auth.uid(), p_categoria, p_push)
  on conflict (user_id, categoria) do update set push = excluded.push, atualizado_em = now();
end $$;

-- Histórico da própria pessoa, com filtros e paginação
create function public.minhas_notificacoes_historico(p_tenant uuid, p_modulo text default null, p_de timestamptz default null, p_ate timestamptz default null,
                                                     p_nao_lidas boolean default false, p_limite int default 30, p_offset int default 0)
returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select n.* from notificacoes n
     where n.user_id = auth.uid() and n.tenant_id = p_tenant
       and (p_modulo is null or n.modulo = p_modulo) and (p_de is null or n.criado_em >= p_de) and (p_ate is null or n.criado_em < p_ate)
       and (not p_nao_lidas or n.lida_em is null)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'nao_lidas', (select count(*) from notificacoes n where n.user_id = auth.uid() and n.tenant_id = p_tenant and n.lida_em is null),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'modulo', x.modulo, 'tipo', x.tipo, 'categoria', x.categoria, 'titulo', x.titulo,
        'descricao', x.descricao, 'link', x.link, 'criado_em', x.criado_em, 'lida_em', x.lida_em,
        'contrato', (select numero from contratos c where c.id = x.contrato_id)) order by x.criado_em desc)
      from (select * from base order by criado_em desc limit least(greatest(p_limite, 1), 100) offset greatest(p_offset, 0)) x), '[]'))
$$;

-- =====================================================================
-- Painel administrativo (Master do órgão e plataforma)
-- =====================================================================
create function public.notificacoes_painel(p_tenant uuid, p_de timestamptz, p_ate timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Painel de notificações disponível só para o Master do órgão e a plataforma.' using errcode = 'insufficient_privilege';
  end if;
  with nt as (select * from notificacoes where tenant_id = p_tenant and criado_em >= p_de and criado_em < p_ate),
       fl as (select f.* from push_fila f join nt on nt.id = f.notificacao_id),
       membros as (select distinct v.user_id from vinculos v where v.tenant_id = p_tenant and v.ativo)
  select jsonb_build_object(
    'geradas', (select count(*) from nt),
    'eventos', (select count(*) from notificacao_eventos e where e.tenant_id = p_tenant and e.criado_em >= p_de and e.criado_em < p_ate),
    'lidas', (select count(*) from nt where lida_em is not null),
    'push_enviados', (select count(*) from fl where status = 'ENVIADO'),
    'push_pendentes', (select count(*) from fl where status in ('PENDENTE', 'ENVIANDO')),
    'push_falhas', (select count(*) from fl where status = 'FALHA'),
    'push_descartados', (select count(*) from fl where status = 'DESCARTADO'),
    'usuarios_com_push', (select count(distinct i.user_id) from push_inscricoes i join membros m on m.user_id = i.user_id where i.ativo),
    'dispositivos', (select count(*) from push_inscricoes i join membros m on m.user_id = i.user_id where i.ativo),
    'por_modulo', coalesce((select jsonb_object_agg(modulo, n) from (select modulo, count(*) n from nt group by 1) x), '{}'),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('modulo', modulo, 'tipo', tipo, 'n', n) order by n desc) from (select modulo, tipo, count(*) n from nt group by 1, 2) x), '[]'),
    'config', jsonb_build_object(
       'push_vencimento_dias', (select push_vencimento_dias from tenant_configuracoes where tenant_id = p_tenant),
       'lembrete_atesto_dias', (select lembrete_atesto_dias from tenant_configuracoes where tenant_id = p_tenant),
       'categorias', (select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'modulo', c.modulo, 'nome', c.nome, 'descricao', c.descricao,
                        'ativa', coalesce(nc.ativa, true), 'obrigatoria', coalesce(nc.obrigatoria, c.obrigatoria_padrao)) order by c.ordem)
                      from notificacao_categorias c left join notificacao_config nc on nc.tenant_id = p_tenant and nc.categoria = c.codigo)),
    'push_configurado', exists (select 1 from configuracoes_globais where chave = 'push_vapid_publica')
  ) into v;
  return v;
end $$;

create function public.notificacoes_historico_admin(p_tenant uuid, p_de timestamptz, p_ate timestamptz, p_busca text default null,
                                                    p_contrato uuid default null, p_status text default null, p_limite int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_like text; v jsonb;
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Painel de notificações disponível só para o Master do órgão e a plataforma.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_busca), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with base as (
    select n.id, n.criado_em, n.modulo, n.tipo, n.titulo, n.lida_em, n.contrato_id, coalesce(nullif(p.nome, ''), p.email) pessoa,
           (select numero from contratos c where c.id = n.contrato_id) contrato,
           (select jsonb_build_object('enviados', count(*) filter (where f.status = 'ENVIADO'), 'falhas', count(*) filter (where f.status = 'FALHA'),
                                      'pendentes', count(*) filter (where f.status in ('PENDENTE', 'ENVIANDO')), 'erro', max(f.ultimo_erro))
              from push_fila f where f.notificacao_id = n.id) push
      from notificacoes n join perfis p on p.id = n.user_id
     where n.tenant_id = p_tenant and n.criado_em >= p_de and n.criado_em < p_ate
       and (p_contrato is null or n.contrato_id = p_contrato)
       and (v_like is null or lower(concat_ws(' ', p.nome, p.email, n.titulo, (select numero from contratos c where c.id = n.contrato_id))) like v_like)
  ), filtrado as (
    select * from base b
     where p_status is null
        or (p_status = 'FALHA' and (b.push ->> 'falhas')::int > 0)
        or (p_status = 'ENVIADO' and (b.push ->> 'enviados')::int > 0)
        or (p_status = 'SEM_PUSH' and (b.push ->> 'enviados')::int + (b.push ->> 'falhas')::int + (b.push ->> 'pendentes')::int = 0)
        or (p_status = 'NAO_LIDA' and b.lida_em is null)
  )
  select jsonb_build_object('total', (select count(*) from filtrado),
    'itens', coalesce((select jsonb_agg(to_jsonb(x) order by x.criado_em desc) from (select * from filtrado order by criado_em desc
       limit least(greatest(p_limite, 1), 200) offset greatest(p_offset, 0)) x), '[]')) into v;
  return v;
end $$;

create function public.push_reprocessar(p_tenant uuid, p_notificacoes uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Somente o Master do órgão e a plataforma reprocessam envios.' using errcode = 'insufficient_privilege';
  end if;
  update push_fila f set status = 'PENDENTE', proxima_em = now(), tentativas = 0
    from notificacoes n, push_inscricoes i
   where n.id = f.notificacao_id and i.id = f.inscricao_id and i.ativo and n.tenant_id = p_tenant and f.status = 'FALHA'
     and (p_notificacoes is null or n.id = any(p_notificacoes));
  get diagnostics v_n = row_count;
  perform registrar_auditoria(p_tenant, 'push_fila', null, 'REPROCESSAMENTO', null, jsonb_build_object('itens', v_n));
  if v_n > 0 then perform disparar_push(); end if;
  return v_n;
end $$;

create function public.salvar_config_notificacoes(p_tenant uuid, p_categorias jsonb, p_vencimento_dias int[], p_lembrete_atesto int) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Somente o Master do órgão e a plataforma configuram as notificações.' using errcode = 'insufficient_privilege';
  end if;
  if p_vencimento_dias is null or cardinality(p_vencimento_dias) = 0 or exists (select 1 from unnest(p_vencimento_dias) d where d < 0 or d > 365) then
    raise exception 'Informe antecedências entre 0 e 365 dias.' using errcode = 'check_violation', hint = 'vencimento';
  end if;
  update tenant_configuracoes set push_vencimento_dias = (select array_agg(distinct d order by d desc) from unnest(p_vencimento_dias) d),
         lembrete_atesto_dias = p_lembrete_atesto where tenant_id = p_tenant;
  for r in select * from jsonb_array_elements(coalesce(p_categorias, '[]')) loop
    insert into notificacao_config (tenant_id, categoria, ativa, obrigatoria, atualizado_por)
    values (p_tenant, r ->> 'codigo', coalesce((r ->> 'ativa')::boolean, true), coalesce((r ->> 'obrigatoria')::boolean, false), auth.uid())
    on conflict (tenant_id, categoria) do update set ativa = excluded.ativa, obrigatoria = excluded.obrigatoria, atualizado_em = now(), atualizado_por = auth.uid();
  end loop;
end $$;

-- =====================================================================
-- Permissões das funções
-- =====================================================================
revoke execute on function
  public.quer_push(uuid, uuid, text), public.categoria_ativa(uuid, text),
  public.notificar_evento(uuid, text, text, text, uuid[], text, text, text, uuid, uuid),
  public.enfileirar_push(), public.disparar_push(), public.designados_usuarios(uuid), public.contrato_rotulo(uuid),
  public.evento_nota(), public.evento_atesto(), public.evento_pagamento(), public.evento_contrato(), public.evento_aditivo(),
  public.evento_designacao(), public.evento_documento(), public.evento_os(), public.notificacoes_diarias(),
  public.push_reservar(int), public.push_concluir(jsonb)
from public, anon, authenticated;
revoke execute on function public.notificar(uuid, uuid[], text, text, text, text, text, uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_reservar(int), public.push_concluir(jsonb), public.notificacoes_diarias() to service_role;
  end if;
end $$;
revoke execute on function
  public.registrar_inscricao_push(text, text, text, text), public.minhas_inscricoes_push(), public.revogar_inscricao_push(uuid, text),
  public.minhas_preferencias_notificacao(uuid), public.salvar_preferencia_notificacao(text, boolean),
  public.minhas_notificacoes_historico(uuid, text, timestamptz, timestamptz, boolean, int, int),
  public.notificacoes_painel(uuid, timestamptz, timestamptz),
  public.notificacoes_historico_admin(uuid, timestamptz, timestamptz, text, uuid, text, int, int),
  public.push_reprocessar(uuid, uuid[]), public.salvar_config_notificacoes(uuid, jsonb, int[], int)
from public, anon;
grant execute on function
  public.registrar_inscricao_push(text, text, text, text), public.minhas_inscricoes_push(), public.revogar_inscricao_push(uuid, text),
  public.minhas_preferencias_notificacao(uuid), public.salvar_preferencia_notificacao(text, boolean),
  public.minhas_notificacoes_historico(uuid, text, timestamptz, timestamptz, boolean, int, int),
  public.notificacoes_painel(uuid, timestamptz, timestamptz),
  public.notificacoes_historico_admin(uuid, timestamptz, timestamptz, text, uuid, text, int, int),
  public.push_reprocessar(uuid, uuid[]), public.salvar_config_notificacoes(uuid, jsonb, int[], int)
to authenticated;

-- =====================================================================
-- Rotinas agendadas (só onde pg_cron existe — produção; os testes locais chamam as funções direto)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('measure-notificacoes-diarias', '0 11 * * *', 'select public.notificacoes_diarias()');  -- 08:00 em Brasília
    perform cron.schedule('measure-push-fila', '* * * * *',
      $c$select public.disparar_push() where exists (select 1 from public.push_fila where status = 'PENDENTE' and proxima_em <= now())$c$);
  end if;
end $$;
