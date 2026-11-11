-- Autoria e responsabilidade pelos registros (solicitação de 08/11/2026, item 4).
--
-- Cada registro administrativo pertence a quem o cadastrou (id do usuário, gravado pelo banco na criação e
-- imutável). Outros administradores do mesmo escopo continuam vendo, mas não alteram nem excluem.
--
-- Decisões do usuário:
--   * registros antigos sem autor (vindos da migração) continuam como antes: qualquer administrador do escopo;
--   * quem tem a permissão "aprovar" do recurso (Master; no patrimônio, também o Administrador patrimonial)
--     continua podendo alterar registros de todos;
--   * lançar registros NOVOS ligados ao de outro administrador (nota num contrato, pagamento numa nota,
--     aditivo, reforço, movimentação de patrimônio) continua permitido: o novo registro é de quem o lançou.
--
-- Atualizações derivadas de operações de terceiros (situação do atesto e do pagamento da nota, localização do
-- bem por movimentação confirmada) não contam como alteração do registro.
-- Cadastros compartilhados (servidores, fornecedores, unidades atendidas) não entram nesta regra.

-- =====================================================================
-- Autoria gravada pelo banco e imutável
-- =====================================================================

-- Argumento: a coluna de autoria (criado_por, registrado_por...)
create function public.fixa_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_col text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    -- quem está logado é sempre o autor (não dá para registrar em nome de outra pessoa)
    if auth.uid() is not null then
      new := jsonb_populate_record(new, jsonb_build_object(v_col, auth.uid()));
    end if;
  elsif (to_jsonb(new) ->> v_col) is distinct from (to_jsonb(old) ->> v_col) then
    raise exception 'A autoria de um registro não pode ser alterada.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- =====================================================================
-- Só o autor (ou quem tem "aprovar") altera ou exclui
-- =====================================================================

-- O registro pode ser alterado por quem chama? (usado também pela tela)
create function public.pode_alterar_registro(p_tenant uuid, p_unidade uuid, p_recurso text, p_autor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_autor is null or p_autor = auth.uid() or pode(p_tenant, p_unidade, p_recurso, 'aprovar')
$$;

-- Argumentos: recurso ('*' = coluna recurso da linha), coluna de autoria, colunas que terceiros podem mudar
create function public.protege_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := to_jsonb(old);
  v_depois jsonb;
  v_autor uuid := (to_jsonb(old) ->> tg_argv[1])::uuid;
  v_recurso text;
  v_col text;
begin
  -- operação interna (migração, chave de serviço) ou função que já conferiu a regra
  if auth.uid() is null or coalesce(current_setting('measure.autoria_livre', true), '') = 'sim' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_recurso := case when tg_argv[0] = '*' then v_antes ->> 'recurso' else tg_argv[0] end;
  if pode_alterar_registro((v_antes ->> 'tenant_id')::uuid, (v_antes ->> 'unidade_id')::uuid, v_recurso, v_autor) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' then
    v_depois := to_jsonb(new);
    foreach v_col in array array['atualizado_em', 'atualizado_por'] || coalesce(tg_argv[2:], '{}'::text[]) loop
      v_antes := v_antes - v_col; v_depois := v_depois - v_col;
    end loop;
    if v_antes = v_depois then return new; end if;
  end if;
  raise exception 'Este registro foi cadastrado por outro administrador (%). Você pode consultá-lo, mas só quem o cadastrou pode alterá-lo ou excluí-lo.',
    coalesce((select nome from perfis where id = v_autor), 'autor')
    using errcode = 'insufficient_privilege';
end $$;

-- Itens que fazem parte de um registro (unidades do empenho, unidades da OS): seguem o autor do registro pai.
-- Argumentos: tabela pai, coluna que aponta para o pai, recurso.
create function public.protege_autoria_pai() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pai record; v_id uuid := (to_jsonb(coalesce(new, old)) ->> tg_argv[1])::uuid;
begin
  if auth.uid() is null or coalesce(current_setting('measure.autoria_livre', true), '') = 'sim' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  execute format('select tenant_id, unidade_id, criado_por from public.%I where id = $1', tg_argv[0]) into v_pai using v_id;
  if v_pai.tenant_id is not null and not pode_alterar_registro(v_pai.tenant_id, v_pai.unidade_id, tg_argv[2], v_pai.criado_por) then
    raise exception 'Este registro foi cadastrado por outro administrador (%). Você pode consultá-lo, mas só quem o cadastrou pode alterá-lo.',
      coalesce((select nome from perfis where id = v_pai.criado_por), 'autor') using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- "zz_" para rodar depois dos gatilhos de carimbo
create trigger zz_autoria_fixa before insert or update on public.contratos for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.contratos for each row execute function public.protege_autoria('contratos', 'criado_por');

create trigger zz_autoria_fixa before insert or update on public.contrato_aditivos for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.contrato_aditivos for each row execute function public.protege_autoria('contratos', 'criado_por');

create trigger zz_autoria_fixa before insert or update on public.contrato_designacoes for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.contrato_designacoes for each row execute function public.protege_autoria('contratos', 'criado_por');

create trigger zz_autoria_fixa before insert or update on public.contrato_dotacoes for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.contrato_dotacoes for each row execute function public.protege_autoria('contratos', 'criado_por');

create trigger zz_autoria_fixa before insert or update on public.empenhos for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.empenhos for each row execute function public.protege_autoria('empenhos', 'criado_por');

create trigger zz_autoria_fixa before insert or update on public.empenho_reforcos for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.empenho_reforcos for each row execute function public.protege_autoria('empenhos', 'criado_por');

create trigger zz_autoria before insert or delete on public.empenho_unidades for each row execute function public.protege_autoria_pai('empenhos', 'empenho_id', 'empenhos');

-- nota: o atesto (por quem está designado) e os pagamentos (de qualquer administrador) atualizam a situação
create trigger zz_autoria_fixa before insert or update on public.notas_fiscais for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.notas_fiscais for each row
  execute function public.protege_autoria('notas_fiscais', 'criado_por', 'status_atesto', 'status_pagamento');

create trigger zz_autoria_fixa before insert or update on public.nota_pagamentos for each row execute function public.fixa_autoria('registrado_por');
create trigger zz_autoria before update or delete on public.nota_pagamentos for each row execute function public.protege_autoria('notas_fiscais', 'registrado_por');

create trigger zz_autoria_fixa before insert or update on public.ordens_servico for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.ordens_servico for each row execute function public.protege_autoria('ordens_servico', 'criado_por');
create trigger zz_autoria before insert or delete on public.os_unidades for each row execute function public.protege_autoria_pai('ordens_servico', 'os_id', 'ordens_servico');

-- documentos anexados: só quem enviou exclui (a autoria já é gravada por documento_preparar)
create trigger zz_autoria before update or delete on public.documentos for each row execute function public.protege_autoria('*', 'enviado_por');

-- patrimônio: a movimentação confirmada muda localização, responsável e situação (não é edição do cadastro)
create trigger zz_autoria_fixa before insert or update on public.patrimonio_bens for each row execute function public.fixa_autoria('criado_por');
create trigger zz_autoria before update or delete on public.patrimonio_bens for each row
  execute function public.protege_autoria('patrimonio', 'criado_por', 'unidade_id', 'local_id', 'ambiente', 'sala', 'responsavel_id', 'responsavel_desde',
    'situacao', 'baixado_em', 'movimentacao_pendente_id', 'situacao_antes_mov');

-- =====================================================================
-- Funções que já conferem a própria regra e mexem em registros de terceiros
-- =====================================================================

-- Exclusão de nota (só pelo autor, conferido pelo gatilho da nota): os anexos dela saem junto,
-- mesmo os enviados por outra pessoa
create or replace function public.excluir_nota(p_nota uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; v_impedimento text;
begin
  select * into n from notas_fiscais where id = p_nota for update;
  if n.id is null or not pode(n.tenant_id, n.unidade_id, 'notas_fiscais', 'excluir') then
    raise exception 'Nota não encontrada ou sem permissão para excluir.' using errcode = 'insufficient_privilege';
  end if;
  if not pode_alterar_registro(n.tenant_id, n.unidade_id, 'notas_fiscais', n.criado_por) then
    raise exception 'Esta nota foi cadastrada por outro administrador (%). Só quem a cadastrou pode excluí-la.',
      coalesce((select nome from perfis where id = n.criado_por), 'autor') using errcode = 'insufficient_privilege';
  end if;
  v_impedimento := impedimento_exclusao_nota(p_nota);
  if v_impedimento is not null then
    raise exception '%', v_impedimento using errcode = 'check_violation';
  end if;
  perform usar_justificativa(p_motivo, 5);
  perform set_config('measure.autoria_livre', 'sim', true);
  update documentos set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = 'Nota excluída: ' || btrim(p_motivo)
   where recurso = 'notas_fiscais' and registro_id = p_nota and excluido_em is null;
  perform set_config('measure.autoria_livre', '', true);
  delete from nota_referencias where nota_id = p_nota;
  delete from nota_unidades where nota_id = p_nota;
  delete from notas_fiscais where id = p_nota;
end $$;

-- Conferência de inventário: a avaliação feita pela equipe do inventário atualiza a conservação do bem
create or replace function public.patrimonio_conferir(p_item uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it patrimonio_inventario_itens; v patrimonio_inventarios; v_status text := p ->> 'status'; v_cons text := nullif(p ->> 'conservacao', '');
begin
  select * into it from patrimonio_inventario_itens where id = p_item;
  select * into v from patrimonio_inventarios where id = it.inventario_id;
  if v.id is null or not pode(v.tenant_id, v.unidade_id, 'patrimonio', 'editar') then
    raise exception 'Item de inventário não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if v.situacao <> 'ABERTO' then raise exception 'Inventário encerrado não pode ser alterado.' using errcode = 'check_violation'; end if;
  if v_status is null or v_status not in ('PENDENTE', 'LOCALIZADO', 'NAO_LOCALIZADO', 'DIVERGENCIA', 'NECESSITA_AVALIACAO') then
    raise exception 'Situação de conferência inválida.' using errcode = 'check_violation', hint = 'status';
  end if;
  if it.bem_id is null then raise exception 'Item sem cadastro: edite pela inclusão de bem encontrado.' using errcode = 'check_violation'; end if;
  if v_cons is not null and v_cons not in ('NOVO', 'EXCELENTE', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO', 'DANIFICADO', 'NECESSITA_MANUTENCAO', 'EM_MANUTENCAO', 'IRRECUPERAVEL') then
    raise exception 'Estado de conservação inválido.' using errcode = 'check_violation', hint = 'conservacao';
  end if;
  if v_status = 'DIVERGENCIA' and length(btrim(coalesce(p ->> 'observacao', ''))) < 3 then
    raise exception 'Descreva a divergência encontrada.' using errcode = 'check_violation', hint = 'observacao';
  end if;
  update patrimonio_inventario_itens set status = v_status, conservacao_avaliada = v_cons, observacao = nullif(btrim(p ->> 'observacao'), ''),
         conferido_por = case when v_status = 'PENDENTE' then null else auth.uid() end, conferido_em = case when v_status = 'PENDENTE' then null else now() end
   where id = p_item;
  if v_cons is not null then
    perform set_config('measure.autoria_livre', 'sim', true);
    update patrimonio_bens set conservacao = v_cons, data_ultima_avaliacao = hoje() where id = it.bem_id;
    perform set_config('measure.autoria_livre', '', true);
  end if;
end $$;

-- Nomes dos autores para a tela ("Cadastrado por"): só pessoas com vínculo no mesmo órgão
create function public.autores_do_orgao(p_tenant uuid, p_ids uuid[]) returns table (id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nome, ''), p.email) from perfis p
   where p.id = any(p_ids) and (membro_do_tenant(p_tenant) or eh_admin_plataforma())
     and exists (select 1 from vinculos v where v.user_id = p.id and v.tenant_id = p_tenant)
$$;

revoke execute on function public.fixa_autoria(), public.protege_autoria(), public.protege_autoria_pai(),
  public.pode_alterar_registro(uuid, uuid, text, uuid), public.autores_do_orgao(uuid, uuid[]) from public, anon;
revoke execute on function public.fixa_autoria(), public.protege_autoria(), public.protege_autoria_pai() from authenticated;
grant execute on function public.pode_alterar_registro(uuid, uuid, text, uuid), public.autores_do_orgao(uuid, uuid[]) to authenticated;
