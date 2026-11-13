-- Pré-cadastro do servidor pelo próprio usuário convidado.
--
-- Ao ativar o acesso, a pessoa completa o essencial (matrícula, cargo, telefone): o sistema cria a ficha de
-- servidor dela, ligada à conta, com nome e e-mail institucional da conta e lotação na unidade do vínculo.
-- A ficha nasce marcada como PRÉ-CADASTRO até o administrador conferir. Se já existe ficha com o e-mail
-- institucional da pessoa, ela é só ligada (sem duplicar).
-- Depois, a própria pessoa mantém os dados dela (contato, cargo/função, escolaridade, dados pessoais).
-- Continuam com o administrador: lotação, data de nomeação/exoneração e a matrícula depois de conferida.

alter table public.servidores add column pre_cadastro boolean not null default false;

-- Lotação sugerida para o pré-cadastro: a unidade do vínculo (padrão primeiro); sem unidade, a raiz do órgão
create function public.lotacao_do_usuario(p_tenant uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select v.unidade_id from vinculos v where v.user_id = auth.uid() and v.tenant_id = p_tenant and v.ativo and v.unidade_id is not null
      order by v.padrao desc, v.criado_em limit 1),
    (select u.id from unidades_organizacionais u where u.tenant_id = p_tenant and u.pai_id is null and u.ativo order by u.criado_em limit 1))
$$;

-- Ficha de servidor de quem está logado, no órgão (com os dados pessoais) e o que falta
create function public.meu_servidor(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s servidores; v_lot uuid;
begin
  if auth.uid() is null then raise exception 'Sessão expirada.' using errcode = 'insufficient_privilege'; end if;
  select * into s from servidores where tenant_id = p_tenant and user_id = auth.uid() order by criado_em limit 1;
  v_lot := coalesce(s.unidade_id, lotacao_do_usuario(p_tenant));
  return jsonb_build_object(
    'servidor', case when s.id is not null then to_jsonb(s) - 'atualizado_por' - 'criado_por' end,
    'pessoais', (select to_jsonb(d) - 'atualizado_por' from servidores_dados_pessoais d where d.servidor_id = s.id),
    'lotacao', (select jsonb_build_object('id', u.id, 'nome', u.nome, 'sigla', u.sigla, 'descricao', (select n.descricao from unidade_niveis(u.id) n))
                  from unidades_organizacionais u where u.id = v_lot),
    'pode_completar', s.id is null and exists (select 1 from vinculos v where v.user_id = auth.uid() and v.tenant_id = p_tenant and v.ativo)
  );
end $$;

-- Pré-cadastro: cria (ou liga) a ficha de servidor de quem está logado
create function public.completar_pre_cadastro(p_tenant uuid, p_matricula text, p_cargo text default null, p_telefone text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p perfis; v_id uuid; v_mat text := btrim(coalesce(p_matricula, '')); outro servidores;
begin
  select * into p from perfis where id = auth.uid() and ativo;
  if p.id is null then raise exception 'Sessão expirada.' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from vinculos v where v.user_id = p.id and v.tenant_id = p_tenant and v.ativo) then
    raise exception 'Você não tem vínculo ativo neste órgão.' using errcode = 'insufficient_privilege';
  end if;
  -- já tem ficha ligada: nada a criar
  select id into v_id from servidores where tenant_id = p_tenant and user_id = p.id limit 1;
  if v_id is not null then return v_id; end if;
  -- ficha já cadastrada pelo administrador com o e-mail institucional da pessoa: só liga
  select id into v_id from servidores where tenant_id = p_tenant and email_institucional = p.email order by criado_em limit 1;
  if v_id is not null then
    update servidores set email_institucional = email_institucional where id = v_id;  -- prepara_servidor liga a conta
    return v_id;
  end if;
  if length(v_mat) = 0 then raise exception 'Informe sua matrícula.' using errcode = 'check_violation', hint = 'matricula'; end if;
  if length(v_mat) > 30 then raise exception 'Matrícula muito longa.' using errcode = 'check_violation', hint = 'matricula'; end if;
  select * into outro from servidores where tenant_id = p_tenant and lower(btrim(matricula)) = lower(v_mat);
  if outro.id is not null then
    raise exception 'Já existe servidor com a matrícula % (%). Se for você, peça ao administrador para corrigir o e-mail institucional do seu cadastro.', v_mat, outro.nome
      using errcode = 'unique_violation', hint = 'matricula';
  end if;
  perform usar_justificativa('Pré-cadastro feito pelo próprio servidor ao ativar o acesso.', 0);
  insert into servidores (tenant_id, unidade_id, nome, matricula, cargo, email_institucional, telefone, pre_cadastro)
  values (p_tenant, lotacao_do_usuario(p_tenant), coalesce(nullif(btrim(p.nome), ''), split_part(p.email, '@', 1)), v_mat,
          nullif(btrim(p_cargo), ''), p.email, nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''), true)
  returning id into v_id;
  return v_id;
end $$;

-- O próprio servidor atualiza os dados dele (só os campos liberados)
create function public.atualizar_meu_cadastro(p_tenant uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s servidores; v_mat text; outro uuid;
begin
  select * into s from servidores where tenant_id = p_tenant and user_id = auth.uid() limit 1;
  if s.id is null then raise exception 'Você ainda não tem cadastro de servidor neste órgão.' using errcode = 'no_data_found'; end if;
  v_mat := nullif(btrim(p ->> 'matricula'), '');
  if v_mat is not null and v_mat <> s.matricula then
    if not s.pre_cadastro then
      raise exception 'A matrícula já foi conferida pelo administrador e não pode ser alterada por aqui.' using errcode = 'insufficient_privilege', hint = 'matricula';
    end if;
    select id into outro from servidores where tenant_id = p_tenant and lower(btrim(matricula)) = lower(v_mat) and id <> s.id;
    if outro is not null then raise exception 'Já existe servidor com a matrícula %.', v_mat using errcode = 'unique_violation', hint = 'matricula'; end if;
  end if;
  perform usar_justificativa('Dados atualizados pelo próprio servidor.', 0);
  update servidores set
    matricula = coalesce(case when s.pre_cadastro then v_mat end, matricula),
    cargo = case when p ? 'cargo' then nullif(btrim(p ->> 'cargo'), '') else cargo end,
    funcao = case when p ? 'funcao' then nullif(btrim(p ->> 'funcao'), '') else funcao end,
    telefone = case when p ? 'telefone' then nullif(regexp_replace(coalesce(p ->> 'telefone', ''), '\D', '', 'g'), '') else telefone end,
    escolaridade = case when p ? 'escolaridade' then nullif(p ->> 'escolaridade', '') else escolaridade end,
    curriculo_observacoes = case when p ? 'curriculo_observacoes' then nullif(btrim(p ->> 'curriculo_observacoes'), '') else curriculo_observacoes end
  where id = s.id;
  if p ? 'pessoais' then
    insert into servidores_dados_pessoais (servidor_id, tenant_id, cpf, data_nascimento, nome_mae, naturalidade, tipo_sanguineo, email_pessoal,
                                           cep, logradouro, numero, complemento, bairro, cidade, uf)
    select s.id, s.tenant_id, nullif(regexp_replace(coalesce(x.cpf, ''), '\D', '', 'g'), ''), x.data_nascimento, nullif(btrim(x.nome_mae), ''),
           nullif(btrim(x.naturalidade), ''), nullif(x.tipo_sanguineo, ''), nullif(lower(btrim(x.email_pessoal)), ''),
           nullif(regexp_replace(coalesce(x.cep, ''), '\D', '', 'g'), ''), nullif(btrim(x.logradouro), ''), nullif(btrim(x.numero), ''),
           nullif(btrim(x.complemento), ''), nullif(btrim(x.bairro), ''), nullif(btrim(x.cidade), ''), nullif(upper(btrim(x.uf)), '')
      from jsonb_to_record(p -> 'pessoais') x(cpf text, data_nascimento date, nome_mae text, naturalidade text, tipo_sanguineo text, email_pessoal text,
                                              cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf text)
    on conflict (servidor_id) do update set
      cpf = excluded.cpf, data_nascimento = excluded.data_nascimento, nome_mae = excluded.nome_mae, naturalidade = excluded.naturalidade,
      tipo_sanguineo = excluded.tipo_sanguineo, email_pessoal = excluded.email_pessoal, cep = excluded.cep, logradouro = excluded.logradouro,
      numero = excluded.numero, complemento = excluded.complemento, bairro = excluded.bairro, cidade = excluded.cidade, uf = excluded.uf;
  end if;
end $$;

-- Administrador confere o pré-cadastro (a matrícula passa a ser mantida só por ele)
create function public.confirmar_pre_cadastro(p_servidor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s servidores;
begin
  select * into s from servidores where id = p_servidor;
  if s.id is null or not pode(s.tenant_id, s.unidade_id, 'servidores', 'editar') then
    raise exception 'Servidor não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa('Pré-cadastro conferido pelo administrador.', 0);
  update servidores set pre_cadastro = false where id = s.id and pre_cadastro;
end $$;

-- Lista de servidores: mesma de antes, com a marca de pré-cadastro
create or replace function public.buscar_servidores(
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
           (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores_sensiveis', 'ler') a) as ve_sensivel,
           (s.data_exoneracao is not null and s.data_exoneracao <= hoje()) as exonerado
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
     where s.tenant_id = p_tenant
       and ((s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'ler') a) or s.user_id = auth.uid())
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
        'tem_acesso', f.user_id is not null, 'pre_cadastro', f.pre_cadastro,
        'cpf', case when f.ve_sensivel then f.cpf_sensivel end) order by lower(f.nome), f.matricula)
      from (select * from filtrados order by lower(nome), matricula
            limit least(greatest(p_limite, 1), 100) offset greatest(p_offset, 0)) f), '[]'))
  into v_res;
  return v_res;
end $$;

revoke execute on function public.lotacao_do_usuario(uuid), public.meu_servidor(uuid), public.completar_pre_cadastro(uuid, text, text, text),
  public.atualizar_meu_cadastro(uuid, jsonb), public.confirmar_pre_cadastro(uuid) from public, anon;
revoke execute on function public.lotacao_do_usuario(uuid) from authenticated;
grant execute on function public.meu_servidor(uuid), public.completar_pre_cadastro(uuid, text, text, text),
  public.atualizar_meu_cadastro(uuid, jsonb), public.confirmar_pre_cadastro(uuid) to authenticated;
