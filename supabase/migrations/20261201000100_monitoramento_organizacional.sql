-- MEASURE 2.0 — Monitoramento organizacional (área da plataforma / desenvolvedor)
--
-- Mostra quais diretorias, coordenações, gerências e setores já têm servidores e quais estão de fato
-- usando o sistema. A atividade vem da auditoria (todas as gravações dos módulos): a cada evento
-- relevante, um registro enxuto guarda quem fez, a lotação dele NO MOMENTO, o módulo e o tipo da
-- operação — nunca o conteúdo. Login, ações de suporte da plataforma e linhas técnicas (itens filhos
-- de uma mesma operação) ficam de fora. Módulos novos entram sozinhos (como "Outros" até ganharem nome).
-- Acesso: administrador da plataforma (desenvolvedor) ou Master do órgão.

-- ------------------------------------------------------------------ módulo e rótulo de cada evento
create function public.modulo_da_entidade(p_entidade text) returns text
language sql immutable as $$
  select case
    -- itens filhos de uma mesma operação e dados de plataforma: não contam como atividade da estrutura
    when p_entidade in ('nota_unidades', 'nota_referencias', 'empenho_unidades', 'os_unidades', 'conecta_destinatarios',
                        'patrimonio_mov_itens', 'patrimonio_responsabilidades', 'servidores_dados_pessoais', 'fornecedor_unidades',
                        'fornecedor_contas', 'permissoes_papel', 'papel_concede', 'configuracoes_globais') then null
    when p_entidade like 'conecta\_%' then 'CONECTA'
    when p_entidade like 'patrimonio\_%' then 'PATRIMONIO'
    when p_entidade in ('contratos', 'contrato_designacoes', 'contrato_dotacoes', 'contrato_aditivos', 'empenhos', 'empenho_reforcos',
                        'notas_fiscais', 'nota_atestos', 'nota_pagamentos', 'documentos_emitidos') then 'CONTRATOS'
    when p_entidade in ('servidores', 'servidor_ferias', 'servidor_curriculo_itens', 'frequencias_mensais', 'decretos_orgao') then 'SERVIDORES'
    when p_entidade in ('ordens_servico') then 'ORDENS_SERVICO'
    when p_entidade in ('fornecedores', 'unidades_atendidas', 'tipos_servico', 'classificacoes_orcamentarias', 'classificadores',
                        'naturezas_despesa', 'entes', 'unidade_orcamentaria_orgaos') then 'CADASTROS'
    when p_entidade in ('documentos') then 'DOCUMENTOS'
    when p_entidade in ('relatorios') then 'RELATORIOS'
    when p_entidade in ('unidades_organizacionais', 'vinculos', 'tenant_configuracoes', 'perfis', 'tenants') then 'ADMINISTRACAO'
    else 'OUTROS'
  end
$$;

create function public.rotulo_atividade(p_entidade text, p_acao text) returns text
language sql immutable as $$
  select case p_acao when 'INSERT' then 'Cadastro' when 'UPDATE' then 'Alteração' when 'DELETE' then 'Exclusão'
                     when 'EXPORTACAO' then 'Exportação' when 'ACESSO' then 'Consulta' else initcap(lower(p_acao)) end
    || ' — ' || coalesce(case p_entidade
      when 'conecta_publicacoes' then 'publicação no CONECTA' when 'conecta_comentarios' then 'comentário no CONECTA'
      when 'conecta_anexos' then 'anexo no CONECTA' when 'conecta_denuncias' then 'denúncia no CONECTA' when 'conecta_categorias' then 'categoria do CONECTA'
      when 'patrimonio_bens' then 'bem patrimonial' when 'patrimonio_movimentacoes' then 'movimentação patrimonial'
      when 'patrimonio_inventarios' then 'inventário patrimonial' when 'patrimonio_relatorios' then 'relatório do patrimônio'
      when 'patrimonio_categorias' then 'categoria de bens'
      when 'contratos' then 'contrato' when 'contrato_designacoes' then 'designação de responsável' when 'contrato_dotacoes' then 'dotação do contrato'
      when 'contrato_aditivos' then 'aditivo' when 'empenhos' then 'empenho' when 'empenho_reforcos' then 'reforço de empenho'
      when 'notas_fiscais' then 'nota fiscal' when 'nota_atestos' then 'atesto de nota' when 'nota_pagamentos' then 'pagamento de nota'
      when 'documentos_emitidos' then 'documento emitido (extrato/checklist)'
      when 'servidores' then 'servidor' when 'servidor_ferias' then 'férias de servidor' when 'servidor_curriculo_itens' then 'currículo de servidor'
      when 'frequencias_mensais' then 'consolidado mensal' when 'decretos_orgao' then 'decreto'
      when 'ordens_servico' then 'ordem de serviço' when 'fornecedores' then 'fornecedor' when 'unidades_atendidas' then 'unidade atendida'
      when 'tipos_servico' then 'tipo de serviço' when 'classificacoes_orcamentarias' then 'classificação orçamentária'
      when 'classificadores' then 'classificador orçamentário' when 'naturezas_despesa' then 'natureza de despesa'
      when 'documentos' then 'documento anexado' when 'relatorios' then 'relatório'
      when 'unidades_organizacionais' then 'estrutura organizacional' when 'vinculos' then 'acesso de usuário'
      when 'tenant_configuracoes' then 'configurações do órgão' when 'perfis' then 'perfil de usuário'
    end, replace(p_entidade, '_', ' '))
$$;

revoke execute on function public.modulo_da_entidade(text) from public, anon, authenticated;
revoke execute on function public.rotulo_atividade(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ registro de atividades
create table public.atividades_estrutura (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null,
  tenant_id uuid not null references public.tenants(id),
  usuario_id uuid not null,
  servidor_id uuid references public.servidores(id),
  -- lotação no momento da operação (servidor; sem cadastro de servidor, a unidade do acesso)
  unidade_id uuid references public.unidades_organizacionais(id),
  caminho uuid[] not null default '{}',
  modulo text not null,
  entidade text not null,
  acao text not null,
  tipo text not null,
  auditoria_id bigint
);
create index atividades_tenant_data on public.atividades_estrutura (tenant_id, criado_em desc);
create index atividades_caminho on public.atividades_estrutura using gin (caminho);
create index atividades_usuario on public.atividades_estrutura (usuario_id, criado_em desc);
alter table public.atividades_estrutura enable row level security;  -- só pelas funções abaixo
revoke all on public.atividades_estrutura from public, anon, authenticated;

create function public.registrar_atividade() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mod text; v_serv uuid; v_unid uuid;
begin
  if new.usuario_id is null or new.tenant_id is null or new.via_suporte or new.acao = 'LOGIN' then return null; end if;
  v_mod := modulo_da_entidade(new.entidade);
  if v_mod is null then return null; end if;
  select s.id, s.unidade_id into v_serv, v_unid from servidores s
   where s.tenant_id = new.tenant_id and s.user_id = new.usuario_id
   order by (s.data_exoneracao is null or s.data_exoneracao > hoje()) desc, s.criado_em desc limit 1;
  if v_unid is null then
    select v.unidade_id into v_unid from vinculos v where v.user_id = new.usuario_id and v.tenant_id = new.tenant_id and v.ativo
     order by v.padrao desc, v.criado_em limit 1;
  end if;
  insert into atividades_estrutura (criado_em, tenant_id, usuario_id, servidor_id, unidade_id, caminho, modulo, entidade, acao, tipo, auditoria_id)
  values (new.criado_em, new.tenant_id, new.usuario_id, v_serv, v_unid,
          coalesce((select caminho from unidades_organizacionais where id = v_unid), '{}'),
          v_mod, new.entidade, new.acao, rotulo_atividade(new.entidade, new.acao), new.id);
  return null;
end $$;
revoke execute on function public.registrar_atividade() from public, anon, authenticated;
create trigger auditoria_atividade after insert on public.auditoria for each row execute function public.registrar_atividade();

-- histórico anterior a este registro: atribuído à lotação atual (não havia retrato da época)
insert into public.atividades_estrutura (criado_em, tenant_id, usuario_id, servidor_id, unidade_id, caminho, modulo, entidade, acao, tipo, auditoria_id)
select a.criado_em, a.tenant_id, a.usuario_id, sv.id, coalesce(sv.unidade_id, vv.unidade_id),
       coalesce((select caminho from public.unidades_organizacionais where id = coalesce(sv.unidade_id, vv.unidade_id)), '{}'),
       public.modulo_da_entidade(a.entidade), a.entidade, a.acao, public.rotulo_atividade(a.entidade, a.acao), a.id
  from public.auditoria a
  left join lateral (select s.id, s.unidade_id from public.servidores s where s.tenant_id = a.tenant_id and s.user_id = a.usuario_id
                      order by (s.data_exoneracao is null) desc, s.criado_em desc limit 1) sv on true
  left join lateral (select v.unidade_id from public.vinculos v where v.user_id = a.usuario_id and v.tenant_id = a.tenant_id
                      order by v.ativo desc, v.padrao desc, v.criado_em limit 1) vv on true
 where a.usuario_id is not null and a.tenant_id is not null and not a.via_suporte and a.acao <> 'LOGIN'
   and public.modulo_da_entidade(a.entidade) is not null
 order by a.id;

-- ------------------------------------------------------------------ quem pode monitorar
create function public.pode_monitorar(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin_plataforma()
      or exists (select 1 from vinculos v join perfis p on p.id = v.user_id and p.ativo
                  where v.user_id = auth.uid() and v.tenant_id = p_tenant and v.ativo and v.papel = 'MASTER')
$$;
revoke execute on function public.pode_monitorar(uuid) from public, anon;
grant execute on function public.pode_monitorar(uuid) to authenticated;

insert into public.configuracoes_globais (chave, valor, descricao)
values ('monitoramento_faixas', '{"recente": 7, "moderada": 30}',
        'Monitoramento organizacional: até "recente" dias = atividade recente (verde); até "moderada" dias = moderada (azul); acima = sem atividade recente (amarelo).')
on conflict (chave) do nothing;

-- ------------------------------------------------------------------ visão geral da estrutura
-- Uma linha por unidade, com os números da própria unidade e de tudo abaixo dela (subárvore).
create function public.monitoramento_estrutura(p_tenant uuid, p_de timestamptz, p_ate timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Monitoramento disponível só para o Master do órgão e a plataforma.' using errcode = 'insufficient_privilege';
  end if;
  with u as (select * from unidades_organizacionais where tenant_id = p_tenant),
  serv as (
    select s.unidade_id, s.cargo, s.email_institucional, s.user_id
      from servidores s where s.tenant_id = p_tenant and (s.data_exoneracao is null or s.data_exoneracao > hoje())
  ),
  serv_arvore as (
    select x.uid, count(*) total, count(*) filter (where s.user_id is not null) com_acesso,
           count(*) filter (where nullif(btrim(s.cargo), '') is null) sem_cargo,
           count(*) filter (where nullif(btrim(s.email_institucional), '') is null) sem_email
      from serv s join u on u.id = s.unidade_id cross join lateral unnest(u.caminho) x(uid) group by x.uid
  ),
  serv_direto as (select unidade_id uid, count(*) n from serv group by 1),
  -- acessos sem cadastro de servidor no órgão (inconsistência de cadastro)
  acesso_sem_cad as (
    select x.uid, count(distinct v.user_id) n
      from vinculos v join u on u.id = v.unidade_id cross join lateral unnest(u.caminho) x(uid)
     where v.tenant_id = p_tenant and v.ativo and v.papel <> 'MASTER'
       and not exists (select 1 from servidores s where s.tenant_id = p_tenant and s.user_id = v.user_id)
     group by x.uid
  ),
  ativ_total as (
    select x.uid, max(a.criado_em) ultima, count(*) total
      from atividades_estrutura a cross join lateral unnest(a.caminho) x(uid) where a.tenant_id = p_tenant group by x.uid
  ),
  ativ_mod as (
    select x.uid, a.modulo, count(*) n
      from atividades_estrutura a cross join lateral unnest(a.caminho) x(uid)
     where a.tenant_id = p_tenant and a.criado_em >= p_de and a.criado_em < p_ate
     group by x.uid, a.modulo
  ),
  ativ_per as (
    select x.uid, count(*) qtd, count(distinct a.usuario_id) usuarios, max(a.criado_em) ultima
      from atividades_estrutura a cross join lateral unnest(a.caminho) x(uid)
     where a.tenant_id = p_tenant and a.criado_em >= p_de and a.criado_em < p_ate
     group by x.uid
  )
  select jsonb_build_object(
    'faixas', coalesce((select valor from configuracoes_globais where chave = 'monitoramento_faixas'), '{"recente": 7, "moderada": 30}'),
    'gerado_em', now(),
    'sem_lotacao', jsonb_build_object(
       'periodo', (select count(*) from atividades_estrutura a where a.tenant_id = p_tenant and a.unidade_id is null and a.criado_em >= p_de and a.criado_em < p_ate),
       'total', (select count(*) from atividades_estrutura a where a.tenant_id = p_tenant and a.unidade_id is null)),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'pai_id', u.pai_id, 'tipo', u.tipo, 'nome', u.nome, 'sigla', u.sigla, 'ativo', u.ativo, 'nivel', cardinality(u.caminho),
        'servidores', coalesce(sa.total, 0), 'servidores_diretos', coalesce(sd.n, 0), 'com_acesso', coalesce(sa.com_acesso, 0),
        'sem_cargo', coalesce(sa.sem_cargo, 0), 'sem_email', coalesce(sa.sem_email, 0), 'acesso_sem_cadastro', coalesce(ac.n, 0),
        'atividades_total', coalesce(at.total, 0), 'ultima_atividade', at.ultima,
        'atividades_periodo', coalesce(ap.qtd, 0), 'usuarios_periodo', coalesce(ap.usuarios, 0), 'ultima_no_periodo', ap.ultima,
        'modulos', coalesce((select jsonb_object_agg(m.modulo, m.n) from ativ_mod m where m.uid = u.id), '{}'))
        order by u.caminho)
      from u
      left join serv_arvore sa on sa.uid = u.id
      left join serv_direto sd on sd.uid = u.id
      left join acesso_sem_cad ac on ac.uid = u.id
      left join ativ_total at on at.uid = u.id
      left join ativ_per ap on ap.uid = u.id), '[]')
  ) into v;
  return v;
end $$;
revoke execute on function public.monitoramento_estrutura(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.monitoramento_estrutura(uuid, timestamptz, timestamptz) to authenticated;

-- ------------------------------------------------------------------ histórico (paginado)
create function public.monitoramento_historico(p_tenant uuid, p_unidade uuid, p_de timestamptz, p_ate timestamptz,
                                               p_busca text default null, p_modulo text default null, p_limite int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_like text; v jsonb;
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Monitoramento disponível só para o Master do órgão e a plataforma.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_busca), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with base as (
    select a.*, coalesce(s.nome, nullif(p.nome, ''), p.email) as pessoa, s.matricula
      from atividades_estrutura a
      left join servidores s on s.id = a.servidor_id
      left join perfis p on p.id = a.usuario_id
     where a.tenant_id = p_tenant and a.criado_em >= p_de and a.criado_em < p_ate
       and (p_unidade is null or p_unidade = any(a.caminho))
       and (p_modulo is null or a.modulo = p_modulo)
  ), filtrado as (
    select b.*, n.secretaria, n.diretoria, n.coordenacao, n.setor
      from base b left join lateral unidade_niveis(b.unidade_id) n on true
     where v_like is null or lower(concat_ws(' ', b.pessoa, b.matricula, b.tipo, n.descricao,
             (select string_agg(x.nome, ' ') from unidades_organizacionais x where x.id = any(b.caminho)))) like v_like
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrado),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'criado_em', f.criado_em, 'servidor', f.pessoa, 'matricula', f.matricula,
               'secretaria', f.secretaria, 'diretoria', f.diretoria, 'coordenacao', f.coordenacao, 'setor', f.setor,
               'modulo', f.modulo, 'tipo', f.tipo) order by f.criado_em desc, f.id desc)
        from (select * from filtrado order by criado_em desc, id desc limit least(greatest(p_limite, 1), 200) offset greatest(p_offset, 0)) f), '[]')
  ) into v;
  return v;
end $$;
revoke execute on function public.monitoramento_historico(uuid, uuid, timestamptz, timestamptz, text, text, int, int) from public, anon;
grant execute on function public.monitoramento_historico(uuid, uuid, timestamptz, timestamptz, text, text, int, int) to authenticated;

-- ------------------------------------------------------------------ servidores de uma estrutura e o uso de cada um
create function public.monitoramento_servidores(p_tenant uuid, p_unidade uuid, p_de timestamptz, p_ate timestamptz)
returns table (servidor_id uuid, nome text, matricula text, cargo text, lotacao text, tem_acesso boolean,
               atividades_periodo bigint, atividades_total bigint, ultima_atividade timestamptz, modulos text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode_monitorar(p_tenant) then
    raise exception 'Monitoramento disponível só para o Master do órgão e a plataforma.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select s.id, s.nome, s.matricula, s.cargo, (select n.descricao from unidade_niveis(s.unidade_id) n), s.user_id is not null,
           count(a.id) filter (where a.criado_em >= p_de and a.criado_em < p_ate), count(a.id), max(a.criado_em),
           coalesce(array_agg(distinct a.modulo order by a.modulo) filter (where a.criado_em >= p_de and a.criado_em < p_ate), '{}')
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
      left join atividades_estrutura a on a.tenant_id = p_tenant and a.usuario_id = s.user_id and s.user_id is not null
     where s.tenant_id = p_tenant and (s.data_exoneracao is null or s.data_exoneracao > hoje()) and p_unidade = any(u.caminho)
     group by s.id
     order by count(a.id) filter (where a.criado_em >= p_de and a.criado_em < p_ate) desc, lower(s.nome);
end $$;
revoke execute on function public.monitoramento_servidores(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.monitoramento_servidores(uuid, uuid, timestamptz, timestamptz) to authenticated;
