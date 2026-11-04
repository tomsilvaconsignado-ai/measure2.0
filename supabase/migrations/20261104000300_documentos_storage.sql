-- MEASURE 2.0 — Fase 1: documentos e armazenamento
--
-- Todo arquivo de negócio tem uma linha em public.documentos (órgão, unidade, recurso, registro
-- dono, quem enviou). O caminho no storage é <tenant>/<recurso>/<documento_id> e as políticas do
-- storage consultam essa linha: quem não pode ler o registro não baixa o arquivo, mesmo sabendo o caminho.
-- Excluir é lógico (motivo + auditoria); o arquivo continua guardado.
--
-- Exceções com caminho próprio:
--   <tenant>/identidade/<arquivo>  brasão/logomarca do órgão (membros leem; configurações:editar grava)
--   avatares/<user_id>/<arquivo>    foto de perfil (o próprio usuário grava)

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  unidade_id uuid references public.unidades_organizacionais(id),
  recurso text not null references public.recursos(codigo),
  registro_id uuid,
  categoria text not null default 'GERAL' check (categoria ~ '^[A-Z0-9_]{2,40}$'),
  nome_arquivo text not null check (length(btrim(nome_arquivo)) between 1 and 255),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  tamanho bigint not null check (tamanho > 0),
  storage_path text not null unique,
  enviado_por uuid not null default auth.uid() references public.perfis(id),
  enviado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references public.perfis(id),
  motivo_exclusao text
);
create index documentos_registro on public.documentos (tenant_id, recurso, registro_id) where excluido_em is null;

create function public.documento_preparar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int;
begin
  if tg_op = 'INSERT' then
    new.storage_path := new.tenant_id || '/' || new.recurso || '/' || new.id;
    new.enviado_por := coalesce(auth.uid(), new.enviado_por);
    new.enviado_em := now();
    new.excluido_em := null; new.excluido_por := null; new.motivo_exclusao := null;
    select anexo_tamanho_max_mb into v_max from tenant_configuracoes where tenant_id = new.tenant_id;
    if new.tamanho > coalesce(v_max, 10) * 1024 * 1024 then
      raise exception 'O arquivo tem % MB; o limite deste órgão é % MB.',
        round(new.tamanho / 1048576.0, 1), coalesce(v_max, 10)
        using errcode = 'check_violation', hint = 'arquivo';
    end if;
    if new.unidade_id is not null and not exists (
      select 1 from unidades_organizacionais where id = new.unidade_id and tenant_id = new.tenant_id) then
      raise exception 'A unidade não pertence a este órgão.' using errcode = 'check_violation';
    end if;
  else
    -- só a exclusão lógica muda a linha (feita pela RPC excluir_documento)
    if (to_jsonb(new) - 'excluido_em' - 'excluido_por' - 'motivo_exclusao')
       <> (to_jsonb(old) - 'excluido_em' - 'excluido_por' - 'motivo_exclusao') then
      raise exception 'Os dados de um documento enviado não podem ser alterados.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger documentos_preparar before insert or update on public.documentos
  for each row execute function public.documento_preparar();
create trigger documentos_auditar after insert or update on public.documentos
  for each row execute function public.auditar();

alter table public.documentos enable row level security;

create policy documentos_ler on public.documentos for select to authenticated
  using (pode(tenant_id, unidade_id, recurso, 'ler'));
create policy documentos_enviar on public.documentos for insert to authenticated
  with check (pode(tenant_id, unidade_id, recurso, 'criar') or pode(tenant_id, unidade_id, recurso, 'editar'));

revoke update, delete on public.documentos from authenticated;
revoke all on public.documentos from anon;

create function public.excluir_documento(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id and excluido_em is null;
  if not found then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;
  if not pode(d.tenant_id, d.unidade_id, d.recurso, 'excluir') then
    raise exception 'Você não tem permissão para excluir este documento.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_motivo, 5);
  update documentos set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = btrim(p_motivo)
   where id = p_id;
end $$;

-- Registro de visualização/download (chamado pelo app antes de gerar a URL temporária)
create function public.registrar_acesso_documento(p_id uuid, p_acao text default 'DOWNLOAD') returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  if p_acao not in ('DOWNLOAD', 'VISUALIZACAO') then
    raise exception 'Ação inválida.' using errcode = 'check_violation';
  end if;
  select * into d from documentos where id = p_id;
  if not found or not pode(d.tenant_id, d.unidade_id, d.recurso, 'ler') then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;
  perform registrar_auditoria(d.tenant_id, 'documentos', p_id::text, p_acao, null,
    jsonb_build_object('nome_arquivo', d.nome_arquivo, 'recurso', d.recurso, 'registro_id', d.registro_id));
end $$;

-- Autorização de objetos do storage
create function public.arquivo_pode(p_bucket text, p_nome text, p_acao text) returns boolean
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
                    and pode(d.tenant_id, d.unidade_id, d.recurso, 'ler'));
  end if;
  if p_acao = 'enviar' then
    -- só quem registrou o documento envia o arquivo dele
    return exists (select 1 from documentos d where d.storage_path = p_nome and d.excluido_em is null
                    and d.enviado_por = auth.uid());
  end if;
  return false;  -- documentos não são sobrescritos nem apagados pelo app
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('arquivos', 'arquivos', false, 52428800,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('avatares', 'avatares', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy measure_ler on storage.objects for select to authenticated
  using (bucket_id in ('arquivos', 'avatares') and public.arquivo_pode(bucket_id, name, 'ler'));
create policy measure_enviar on storage.objects for insert to authenticated
  with check (bucket_id in ('arquivos', 'avatares') and public.arquivo_pode(bucket_id, name,
    case when bucket_id = 'avatares' or name like '%/identidade/%' then 'gravar' else 'enviar' end));
create policy measure_substituir on storage.objects for update to authenticated
  using (bucket_id in ('arquivos', 'avatares') and (bucket_id = 'avatares' or name like '%/identidade/%')
         and public.arquivo_pode(bucket_id, name, 'gravar'))
  with check (bucket_id in ('arquivos', 'avatares') and (bucket_id = 'avatares' or name like '%/identidade/%')
              and public.arquivo_pode(bucket_id, name, 'gravar'));
create policy measure_apagar on storage.objects for delete to authenticated
  using (bucket_id in ('arquivos', 'avatares') and (bucket_id = 'avatares' or name like '%/identidade/%')
         and public.arquivo_pode(bucket_id, name, 'gravar'));
