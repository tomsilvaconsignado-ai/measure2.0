-- MEASURE 2.0 — designação de gestor, fiscal e suplente entre secretarias, diretorias e coordenações
--
-- A designação já alcança qualquer servidor ativo do órgão e o acesso ao contrato já nasce dela
-- (designado(), políticas e visões). Aqui:
--  * busca de responsáveis com a lotação completa (secretaria, diretoria, coordenação, gerência/setor),
--    situação cadastral e pesquisa também por cargo e pela estrutura;
--  * retrato da designação: matrícula, cargo e lotação do servidor no momento (a lotação dele não muda);
--  * substituição em um passo, ligando o responsável anterior ao novo, sem apagar o histórico;
--  * "Meus contratos": os contratos em que a pessoa logada está designada, em qualquer órgão/estrutura.

-- ------------------------------------------------------------------ níveis da estrutura de uma unidade
create function public.unidade_niveis(p_unidade uuid)
returns table (secretaria text, diretoria text, coordenacao text, setor text, descricao text)
language sql stable security definer set search_path = public as $$
  with c as (
    select a.ord, x.tipo, x.nome, x.sigla
      from unidades_organizacionais u, unnest(u.caminho) with ordinality a(uid, ord)
      join unidades_organizacionais x on x.id = a.uid
     where u.id = p_unidade
  )
  select
    (select coalesce(sigla, nome) from c where tipo = 'SECRETARIA' order by ord desc limit 1),
    (select coalesce(sigla, nome) from c where tipo = 'DIRETORIA' order by ord desc limit 1),
    (select coalesce(sigla, nome) from c where tipo = 'COORDENACAO' order by ord desc limit 1),
    (select coalesce(sigla, nome) from c where tipo in ('GERENCIA', 'DEPARTAMENTO', 'SETOR', 'UNIDADE') order by ord desc limit 1),
    (select string_agg(coalesce(sigla, nome), ' › ' order by ord) from c where tipo <> 'ORGANIZACAO')
$$;
revoke execute on function public.unidade_niveis(uuid) from public, anon;
grant execute on function public.unidade_niveis(uuid) to authenticated;

-- ------------------------------------------------------------------ retrato e substituição
alter table public.contrato_designacoes
  add column servidor_matricula text,
  add column servidor_cargo text,
  add column lotacao_unidade_id uuid references public.unidades_organizacionais(id),
  add column lotacao_descricao text,
  add column substitui_id uuid references public.contrato_designacoes(id);
create index designacoes_substitui on public.contrato_designacoes (substitui_id) where substitui_id is not null;

-- designações já existentes: retrato com os dados atuais do cadastro
update public.contrato_designacoes d
   set servidor_matricula = s.matricula, servidor_cargo = s.cargo, lotacao_unidade_id = s.unidade_id,
       lotacao_descricao = (select n.descricao from unidade_niveis(s.unidade_id) n)
  from public.servidores s
 where s.id = d.servidor_id and d.servidor_matricula is null;

create or replace function public.prepara_designacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare s servidores; a contrato_designacoes;
begin
  select tenant_id into new.tenant_id from contratos where id = new.contrato_id;
  select * into s from servidores where id = new.servidor_id;
  if s.id is null or s.tenant_id <> new.tenant_id then
    raise exception 'O servidor não pertence a este órgão.' using errcode = 'check_violation', hint = 'servidor_id';
  end if;
  if tg_op = 'INSERT' then
    if s.data_exoneracao is not null and s.data_exoneracao <= hoje() then
      raise exception '% está exonerado(a) e não pode ser designado(a).', s.nome using errcode = 'check_violation', hint = 'servidor_id';
    end if;
    -- retrato do momento da designação (a lotação do servidor não é alterada)
    new.servidor_matricula := s.matricula;
    new.servidor_cargo := s.cargo;
    new.lotacao_unidade_id := s.unidade_id;
    new.lotacao_descricao := (select n.descricao from unidade_niveis(s.unidade_id) n);
    if new.substitui_id is not null then
      select * into a from contrato_designacoes where id = new.substitui_id;
      if a.id is null or a.contrato_id <> new.contrato_id or a.papel <> new.papel then
        raise exception 'A substituição precisa ser do mesmo contrato e do mesmo papel.' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.contrato_id <> old.contrato_id or new.servidor_id <> old.servidor_id or new.papel <> old.papel then
      raise exception 'Para trocar o responsável, encerre a designação e crie outra (o histórico é mantido).' using errcode = 'check_violation';
    end if;
    if old.fim is not null and new.fim is distinct from old.fim then
      raise exception 'Designação já encerrada não pode ser alterada.' using errcode = 'check_violation';
    end if;
    -- o retrato não muda depois de registrado
    new.servidor_matricula := old.servidor_matricula;
    new.servidor_cargo := old.servidor_cargo;
    new.lotacao_unidade_id := old.lotacao_unidade_id;
    new.lotacao_descricao := old.lotacao_descricao;
    new.substitui_id := old.substitui_id;
  end if;
  return new;
end $$;

-- Substituir: encerra a designação atual e cria a do novo responsável, ligadas (roda com as permissões
-- de quem chama: RLS, autoria e auditoria valem como nos passos separados)
create function public.substituir_designacao(p_designacao uuid, p_servidor uuid, p_inicio date, p_portaria text, p_motivo text)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare a contrato_designacoes; v_id uuid;
begin
  select * into a from contrato_designacoes where id = p_designacao;
  if a.id is null then raise exception 'Designação não encontrada.' using errcode = 'no_data_found'; end if;
  if a.fim is not null then raise exception 'Esta designação já foi encerrada.' using errcode = 'check_violation'; end if;
  if a.servidor_id = p_servidor then raise exception 'Escolha outro servidor para substituir.' using errcode = 'check_violation', hint = 'servidor_id'; end if;
  if coalesce(length(btrim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo da substituição.' using errcode = 'check_violation', hint = 'motivo'; end if;
  update contrato_designacoes set fim = greatest(a.inicio, coalesce(p_inicio, hoje())), motivo_fim = btrim(p_motivo) where id = a.id;
  if not found then raise exception 'Você não pode alterar esta designação.' using errcode = 'insufficient_privilege'; end if;
  insert into contrato_designacoes (contrato_id, servidor_id, papel, inicio, portaria, substitui_id)
  values (a.contrato_id, p_servidor, a.papel, coalesce(p_inicio, hoje()), nullif(btrim(p_portaria), ''), a.id)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.substituir_designacao(uuid, uuid, date, text, text) from public, anon;
grant execute on function public.substituir_designacao(uuid, uuid, date, text, text) to authenticated;

-- ------------------------------------------------------------------ busca com a lotação completa
drop function public.buscar_servidores_designacao(uuid, text, int);
create function public.buscar_servidores_designacao(p_tenant uuid, p_busca text default null, p_limite int default 50)
returns table (id uuid, nome text, matricula text, cargo text, unidade_nome text, unidade_sigla text, tem_acesso boolean,
               secretaria text, diretoria text, coordenacao text, setor text, situacao text)
language plpgsql stable security definer set search_path = public as $$
declare v_like text;
begin
  if not (pode(p_tenant, null, 'contratos', 'editar') or pode(p_tenant, null, 'contratos', 'criar')) then
    raise exception 'Você não tem permissão para designar responsáveis em contratos.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_busca), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select s.id, s.nome, s.matricula, s.cargo, u.nome, u.sigla, s.user_id is not null,
           n.secretaria, n.diretoria, n.coordenacao, n.setor,
           case when s.user_id is null then 'ATIVO_SEM_ACESSO' else 'ATIVO' end
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
      cross join lateral unidade_niveis(s.unidade_id) n
     where s.tenant_id = p_tenant
       and (s.data_exoneracao is null or s.data_exoneracao > hoje())
       and (v_like is null or lower(concat_ws(' ', s.nome, s.matricula, s.cargo, u.nome,
              (select string_agg(x.nome || ' ' || coalesce(x.sigla, ''), ' ') from unidades_organizacionais x where x.id = any(u.caminho)))) like v_like)
     order by lower(s.nome), s.matricula
     limit least(greatest(p_limite, 1), 200);
end $$;
revoke execute on function public.buscar_servidores_designacao(uuid, text, int) from public, anon;
grant execute on function public.buscar_servidores_designacao(uuid, text, int) to authenticated;

-- ------------------------------------------------------------------ responsáveis do contrato (com histórico)
drop function public.designacoes_do_contrato(uuid, boolean);
create function public.designacoes_do_contrato(p_contrato uuid, p_historico boolean default false)
returns table (
  id uuid, contrato_id uuid, servidor_id uuid, papel text, inicio date, fim date, portaria text, motivo_fim text,
  servidor_nome text, servidor_matricula text, servidor_cargo text, unidade_sigla text, unidade_nome text, tem_acesso boolean,
  lotacao_descricao text, designado_em timestamptz, designado_por text, encerrado_por text,
  substitui_nome text, substituido_por_nome text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (pode_contrato(p_contrato, 'ler') or designado(p_contrato)) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select d.id, d.contrato_id, d.servidor_id, d.papel, d.inicio, d.fim, d.portaria, d.motivo_fim,
           s.nome, coalesce(d.servidor_matricula, s.matricula), coalesce(d.servidor_cargo, s.cargo), u.sigla, u.nome, s.user_id is not null,
           d.lotacao_descricao, d.criado_em,
           (select nullif(p.nome, '') from perfis p where p.id = d.criado_por),
           case when d.fim is not null then (select nullif(p.nome, '') from perfis p where p.id = d.atualizado_por) end,
           (select sa.nome from contrato_designacoes da join servidores sa on sa.id = da.servidor_id where da.id = d.substitui_id),
           (select sn.nome from contrato_designacoes dn join servidores sn on sn.id = dn.servidor_id where dn.substitui_id = d.id order by dn.criado_em desc limit 1)
      from contrato_designacoes d
      join servidores s on s.id = d.servidor_id
      join unidades_organizacionais u on u.id = s.unidade_id
     where d.contrato_id = p_contrato and (p_historico or d.fim is null)
     order by d.fim is not null, case d.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end, d.inicio desc;
end $$;
revoke execute on function public.designacoes_do_contrato(uuid, boolean) from public, anon;
grant execute on function public.designacoes_do_contrato(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ Meus contratos
create function public.meus_contratos_designados()
returns table (contrato_id uuid, tenant_id uuid, orgao text, numero text, fornecedor_nome text, objeto text,
               secretaria text, diretoria text, coordenacao text, unidade_sigla text,
               papeis text[], designado_desde date, data_inicio date, data_fim_atual date, situacao text, saldo numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.tenant_id, t.nome_curto, c.numero, c.fornecedor_nome, c.objeto,
         n.secretaria, n.diretoria, n.coordenacao, c.unidade_sigla,
         array_agg(distinct d.papel order by d.papel), min(d.inicio), c.data_inicio, c.data_fim_atual, c.situacao, c.saldo
    from contrato_designacoes d
    join servidores s on s.id = d.servidor_id and s.user_id = auth.uid()
    join v_contratos c on c.id = d.contrato_id and c.ativo
    join tenants t on t.id = c.tenant_id and t.ativo
    cross join lateral unidade_niveis(c.unidade_id) n
   where d.fim is null and d.inicio <= hoje() and auth.uid() is not null
   group by c.id, c.tenant_id, t.nome_curto, c.numero, c.fornecedor_nome, c.objeto, n.secretaria, n.diretoria, n.coordenacao,
            c.unidade_sigla, c.data_inicio, c.data_fim_atual, c.situacao, c.saldo
   order by c.data_fim_atual, c.numero
$$;
revoke execute on function public.meus_contratos_designados() from public, anon;
grant execute on function public.meus_contratos_designados() to authenticated;
