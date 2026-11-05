-- Fases 6 e 8: frequência mensal e consolidado de servidores, checklist da nota fiscal,
-- cópia de segurança (JSON) do órgão e registro de erros do aplicativo.

-- =====================================================================
-- Frequência mensal (atrasos, faltas e observações do consolidado)
-- Registro do mês: não altera o cadastro permanente do servidor.
-- =====================================================================

create table public.frequencias_mensais (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  servidor_id uuid not null references public.servidores(id),
  -- lotação do servidor quando o mês foi lançado (escopo de acesso)
  unidade_id uuid not null references public.unidades_organizacionais(id),
  ano int not null check (ano between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  atrasos int check (atrasos between 0 and 999),
  faltas int check (faltas between 0 and 31),
  justificativa_anexada boolean not null default false,
  -- texto ajustado à mão; nulo = observação automática
  observacao text check (length(observacao) <= 500),
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  unique (servidor_id, ano, mes)
);
create index frequencias_mes on public.frequencias_mensais (tenant_id, ano, mes);

create trigger frequencias_mensais_criacao before insert on public.frequencias_mensais for each row execute function public.carimbar_criacao();
create trigger frequencias_mensais_carimbar before update on public.frequencias_mensais for each row execute function public.carimbar();
create trigger frequencias_mensais_tenant before update on public.frequencias_mensais for each row execute function public.bloquear_troca_tenant();
create trigger frequencias_mensais_auditar after insert or update or delete on public.frequencias_mensais for each row execute function public.auditar();

alter table public.frequencias_mensais enable row level security;
create policy frequencias_ler on public.frequencias_mensais for select to authenticated
  using (pode(tenant_id, unidade_id, 'servidores', 'ler'));
revoke all on public.frequencias_mensais from anon;
-- escrita só pela função salvar_frequencias (valida escopo e servidor)
revoke insert, update, delete on public.frequencias_mensais from authenticated;

-- Observação automática do consolidado (regras da especificação, item 7.3/7.4)
create function public.observacao_frequencia(
  p_nomeacao date, p_exoneracao date, p_ano int, p_mes int,
  p_atrasos int, p_faltas int, p_justificativa boolean, p_manual text
) returns text
language sql immutable set search_path = public as $$
  select case
    when nullif(btrim(p_manual), '') is not null then btrim(p_manual)
    else coalesce(nullif(concat_ws(' ',
           case when date_trunc('month', p_nomeacao) = make_date(p_ano, p_mes, 1) then 'Nomeação em ' || to_char(p_nomeacao, 'DD/MM/YYYY') || '.' end,
           case when date_trunc('month', p_exoneracao) = make_date(p_ano, p_mes, 1) then 'Exoneração em ' || to_char(p_exoneracao, 'DD/MM/YYYY') || '.' end,
           case when p_justificativa then 'Justificativa anexada.' end), ''),
         case when coalesce(p_atrasos, 0) = 0 and coalesce(p_faltas, 0) = 0 then 'Frequência integral.' else '' end)
  end
$$;

-- Servidores do consolidado: ativos em algum dia do mês, lotados na unidade escolhida ou abaixo dela
-- (selecionar a Coordenação inclui todas as Gerências e setores subordinados). Sem duplicar servidor.
create function public.consolidado_mensal(p_tenant uuid, p_unidade uuid, p_ano int, p_mes int)
returns table (
  servidor_id uuid, matricula text, nome text, cargo text, funcao text, unidade_sigla text, unidade_nome text,
  data_nomeacao date, data_exoneracao date, atrasos int, faltas int, justificativa_anexada boolean,
  observacao_manual text, observacao text, pode_editar boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_ini date; v_fim date;
begin
  if p_mes not between 1 and 12 or p_ano not between 2000 and 2100 then
    raise exception 'Mês ou ano de referência inválido.' using hint = 'mes';
  end if;
  if not pode(p_tenant, p_unidade, 'servidores', 'ler') then
    raise exception 'Você não tem acesso aos servidores desta unidade.' using errcode = 'insufficient_privilege';
  end if;
  if p_unidade is not null and not exists (select 1 from unidades_organizacionais where id = p_unidade and tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using hint = 'unidade';
  end if;
  v_ini := make_date(p_ano, p_mes, 1);
  v_fim := (v_ini + interval '1 month - 1 day')::date;
  return query
    select s.id, s.matricula, s.nome, s.cargo, s.funcao, u.sigla, u.nome,
           s.data_nomeacao, s.data_exoneracao, f.atrasos, f.faltas, coalesce(f.justificativa_anexada, false),
           f.observacao,
           observacao_frequencia(s.data_nomeacao, s.data_exoneracao, p_ano, p_mes, f.atrasos, f.faltas, coalesce(f.justificativa_anexada, false), f.observacao),
           pode(s.tenant_id, s.unidade_id, 'servidores', 'editar')
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
      left join frequencias_mensais f on f.servidor_id = s.id and f.ano = p_ano and f.mes = p_mes
     where s.tenant_id = p_tenant
       and (p_unidade is null or p_unidade = any(u.caminho))
       and pode(s.tenant_id, s.unidade_id, 'servidores', 'ler')
       and (s.data_nomeacao is null or s.data_nomeacao <= v_fim)
       and (s.data_exoneracao is null or s.data_exoneracao >= v_ini)
     order by lower(s.nome), s.matricula;
end $$;

-- Grava os lançamentos do mês (lista de {servidor_id, atrasos, faltas, justificativa_anexada, observacao})
create function public.salvar_frequencias(p_tenant uuid, p_ano int, p_mes int, p_linhas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare l jsonb; s servidores; v_n int := 0;
begin
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'Lista de lançamentos inválida.'; end if;
  if p_mes not between 1 and 12 or p_ano not between 2000 and 2100 then
    raise exception 'Mês ou ano de referência inválido.' using hint = 'mes';
  end if;
  for l in select * from jsonb_array_elements(p_linhas) loop
    select * into s from servidores where id = (l ->> 'servidor_id')::uuid and tenant_id = p_tenant;
    if s.id is null or not pode(s.tenant_id, s.unidade_id, 'servidores', 'editar') then
      raise exception 'Você não pode lançar a frequência deste servidor.' using errcode = 'insufficient_privilege';
    end if;
    insert into frequencias_mensais (tenant_id, servidor_id, unidade_id, ano, mes, atrasos, faltas, justificativa_anexada, observacao)
    values (p_tenant, s.id, s.unidade_id, p_ano, p_mes, nullif(l ->> 'atrasos', '')::int, nullif(l ->> 'faltas', '')::int,
            coalesce((l ->> 'justificativa_anexada')::boolean, false), nullif(btrim(l ->> 'observacao'), ''))
    on conflict (servidor_id, ano, mes) do update
      set atrasos = excluded.atrasos, faltas = excluded.faltas, justificativa_anexada = excluded.justificativa_anexada,
          observacao = excluded.observacao, unidade_id = excluded.unidade_id
      where (frequencias_mensais.atrasos, frequencias_mensais.faltas, frequencias_mensais.justificativa_anexada, frequencias_mensais.observacao)
            is distinct from (excluded.atrasos, excluded.faltas, excluded.justificativa_anexada, excluded.observacao);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- =====================================================================
-- Documentos emitidos: consolidado mensal e checklist da nota
-- =====================================================================

alter table public.documentos_emitidos drop constraint documentos_emitidos_tipo_check;
alter table public.documentos_emitidos add constraint documentos_emitidos_tipo_check
  check (tipo in ('EXTRATO_CONTRATO', 'EXTRATO_EMPENHO', 'ATESTO', 'CONSOLIDADO_MENSAL', 'CHECKLIST_NOTA'));
-- referência do consolidado (ano*100 + mês), para listar o histórico por período
alter table public.documentos_emitidos add column referencia int;
create index emitidos_consolidado on public.documentos_emitidos (tenant_id, tipo, referencia desc) where tipo = 'CONSOLIDADO_MENSAL';

drop policy emitidos_ler on public.documentos_emitidos;
create policy emitidos_ler on public.documentos_emitidos for select to authenticated
  using (case tipo
           when 'EXTRATO_CONTRATO' then pode(tenant_id, unidade_id, 'contratos', 'ler') or designado(registro_id)
           when 'EXTRATO_EMPENHO' then pode(tenant_id, unidade_id, 'empenhos', 'ler') or designado((select contrato_id from empenhos where id = registro_id))
           when 'CONSOLIDADO_MENSAL' then pode(tenant_id, unidade_id, 'servidores', 'ler')
           else nota_legivel(registro_id) end);

create function public.cabecalho_orgao(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nome_oficial', t.nome_oficial, 'logo_path', t.logo_path, 'cabecalho', tc.documento_cabecalho,
           'rodape', tc.documento_rodape,
           'endereco', concat_ws(' · ', t.endereco, nullif(concat_ws('/', t.cidade, t.uf), ''),
                                 case when t.cep is not null then 'CEP ' || substr(t.cep, 1, 5) || '-' || substr(t.cep, 6) end, t.telefone, t.email_contato))
    from tenants t join tenant_configuracoes tc on tc.tenant_id = t.id where t.id = p_tenant
$$;

create function public.emitir_consolidado(p_tenant uuid, p_unidade uuid, p_ano int, p_mes int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dados jsonb; v_textos jsonb; v_unid record; v_secretaria text; v_linhas jsonb;
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
  v_dados := jsonb_build_object(
    'orgao', cabecalho_orgao(p_tenant),
    'titulo', coalesce(nullif(btrim(v_textos ->> 'consolidado_titulo'), ''), 'CONSOLIDADO MENSAL DE FREQUÊNCIA'),
    'secretaria', v_secretaria,
    'unidade', jsonb_build_object('nome', v_unid.nome, 'sigla', v_unid.sigla, 'tipo', v_unid.tipo),
    'ano', p_ano, 'mes', p_mes,
    'assinaturas', coalesce(v_textos -> 'consolidado_assinaturas', '["Chefe Imediato", "Coordenador(a)"]'),
    'linhas', v_linhas,
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now());
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados, referencia)
  values (p_tenant, p_unidade, 'CONSOLIDADO_MENSAL', p_unidade,
          'Consolidado ' || lpad(p_mes::text, 2, '0') || '/' || p_ano || ' · ' || coalesce(v_unid.sigla, v_unid.nome), v_dados, p_ano * 100 + p_mes)
  returning id into v_id;
  return v_id;
end $$;

-- Checklist da nota fiscal: conferências automáticas + itens do órgão para marcação manual
create function public.emitir_checklist_nota(p_nota uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare n record; v_id uuid; v_dados jsonb; v_textos jsonb; v_inicio date; v_fim date; v_dotacao_ok boolean;
begin
  if not nota_legivel(p_nota) then raise exception 'Nota fiscal não encontrada.' using errcode = 'insufficient_privilege'; end if;
  select * into n from v_notas where id = p_nota;
  select coalesce(textos, '{}') into v_textos from tenant_configuracoes where tenant_id = n.tenant_id;
  select data_inicio, contrato_fim_atual(id) into v_inicio, v_fim from contratos where id = n.contrato_id;
  select exists (select 1 from empenhos e join contrato_dotacoes cd on cd.contrato_id = e.contrato_id and cd.classificacao_id = e.classificacao_id
                  where e.id = n.empenho_id) into v_dotacao_ok;
  v_dados := jsonb_build_object(
    'orgao', cabecalho_orgao(n.tenant_id),
    'titulo', coalesce(nullif(btrim(v_textos ->> 'checklist_titulo'), ''), 'CHECKLIST DE NOTA FISCAL'),
    'nota', jsonb_build_object('numero', n.numero, 'serie', n.serie, 'data_emissao', n.data_emissao, 'valor', n.valor,
              'meses', n.meses_referencia, 'periodo_inicio', n.periodo_inicio, 'periodo_fim', n.periodo_fim,
              'processo', n.processo_administrativo, 'status_atesto', n.status_atesto, 'status_pagamento', n.status_pagamento, 'pago', n.pago),
    'contrato', (select jsonb_build_object('numero', c.numero, 'objeto', c.objeto, 'inicio', v_inicio, 'fim', v_fim) from contratos c where c.id = n.contrato_id),
    'fornecedor', (select jsonb_build_object('nome', coalesce(f.razao_social, f.nome_fantasia), 'documento', f.documento, 'tipo', f.tipo_pessoa)
                     from contratos c join fornecedores f on f.id = c.fornecedor_id where c.id = n.contrato_id),
    'empenho', (select jsonb_build_object('numero', e.numero, 'ano', e.ano, 'classificacao', e.classificacao_codigo, 'saldo', e.saldo) from v_empenhos e where e.id = n.empenho_id),
    'unidades', coalesce((select jsonb_agg(ua.nome order by ua.nome) from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = p_nota), '[]'),
    'responsaveis', coalesce((select jsonb_agg(jsonb_build_object('papel', d.papel, 'nome', s.nome, 'matricula', s.matricula) order by d.papel)
                     from contrato_designacoes d join servidores s on s.id = d.servidor_id where d.contrato_id = n.contrato_id and d.fim is null), '[]'),
    'atesto', (select jsonb_build_object('nome', a.servidor_nome, 'papel', a.papel, 'em', a.atestado_em) from nota_atestos a where a.nota_id = p_nota order by a.atestado_em desc limit 1),
    'verificacoes', jsonb_build_array(
      jsonb_build_object('item', 'Nota emitida dentro da vigência do contrato', 'ok', n.data_emissao between v_inicio and v_fim),
      jsonb_build_object('item', 'Empenho do mesmo contrato, com dotação vinculada ao contrato', 'ok', v_dotacao_ok),
      jsonb_build_object('item', 'Saldo do empenho suficiente no registro', 'ok', n.excecao_saldo is null,
                         'detalhe', case when n.excecao_saldo is not null then 'Exceção justificada: ' || n.excecao_saldo end),
      jsonb_build_object('item', 'Mês(es) de referência informado(s)', 'ok', coalesce(n.meses_referencia, '') <> ''),
      jsonb_build_object('item', 'Atesto pelo gestor/fiscal designado', 'ok', n.status_atesto = 'ATESTADA'),
      jsonb_build_object('item', 'Pagamento registrado', 'ok', n.status_pagamento = 'PAGO',
                         'detalhe', case n.status_pagamento when 'PARCIAL' then 'Pagamento parcial' end)),
    'itens_manuais', coalesce(v_textos -> 'checklist_itens', jsonb_build_array(
      'Nota fiscal emitida com os dados do órgão contratante',
      'Certidões de regularidade fiscal e trabalhista válidas',
      'Relatório, medição ou comprovação do serviço/fornecimento anexada',
      'Valores conferidos com o contrato e o empenho')),
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now());
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (n.tenant_id, n.unidade_id, 'CHECKLIST_NOTA', p_nota, 'Checklist da NF ' || n.numero, v_dados)
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- Cópia de segurança do órgão (JSON). Não substitui o backup automático do banco.
-- Só quem administra as configurações do órgão; nada de segredos, senhas ou tokens.
-- =====================================================================

create function public.exportar_backup_orgao(p_tenant uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb := '{}'; t text;
  tabelas text[] := array['unidades_organizacionais', 'tenant_configuracoes', 'fornecedores', 'fornecedor_contas', 'servidores',
    'servidores_dados_pessoais', 'unidades_atendidas', 'unidades_grupo_membros', 'classificadores', 'classificacoes_orcamentarias',
    'tipos_servico', 'contratos', 'contrato_designacoes', 'contrato_dotacoes', 'contrato_aditivos', 'documentos', 'empenhos',
    'empenho_reforcos', 'empenho_unidades', 'notas_fiscais', 'nota_referencias', 'nota_unidades', 'nota_atestos', 'nota_pagamentos',
    'ordens_servico', 'os_unidades', 'frequencias_mensais', 'documentos_emitidos', 'vinculos'];
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
    'tabelas', v);
end $$;

-- =====================================================================
-- Monitoramento: erros do aplicativo (navegador), para a equipe da plataforma
-- =====================================================================

create table public.erros_aplicativo (
  id bigint generated always as identity primary key,
  ocorrido_em timestamptz not null default now(),
  user_id uuid default auth.uid(),
  tenant_id uuid,
  mensagem text not null check (length(mensagem) <= 1000),
  pilha text check (length(pilha) <= 4000),
  pagina text check (length(pagina) <= 300),
  navegador text check (length(navegador) <= 300),
  versao text check (length(versao) <= 40)
);
create index erros_aplicativo_data on public.erros_aplicativo (ocorrido_em desc);
alter table public.erros_aplicativo enable row level security;
create policy erros_ler on public.erros_aplicativo for select to authenticated using (eh_admin_plataforma());
revoke all on public.erros_aplicativo from anon, authenticated;
grant select on public.erros_aplicativo to authenticated;

-- Registro limitado: no máximo 30 erros por pessoa a cada 10 minutos (evita inundação)
create function public.registrar_erro_aplicativo(p_mensagem text, p_pilha text, p_pagina text, p_navegador text, p_versao text, p_tenant uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from erros_aplicativo where user_id = auth.uid() and ocorrido_em > now() - interval '10 minutes') >= 30 then return; end if;
  insert into erros_aplicativo (tenant_id, mensagem, pilha, pagina, navegador, versao)
  values (case when exists (select 1 from vinculos where user_id = auth.uid() and tenant_id = p_tenant) then p_tenant end,
          left(coalesce(p_mensagem, 'Erro sem mensagem'), 1000), left(p_pilha, 4000), left(p_pagina, 300), left(p_navegador, 300), left(p_versao, 40));
end $$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function
  public.observacao_frequencia(date, date, int, int, int, int, boolean, text),
  public.consolidado_mensal(uuid, uuid, int, int), public.salvar_frequencias(uuid, int, int, jsonb),
  public.cabecalho_orgao(uuid), public.emitir_consolidado(uuid, uuid, int, int), public.emitir_checklist_nota(uuid),
  public.exportar_backup_orgao(uuid),
  public.registrar_erro_aplicativo(text, text, text, text, text, uuid)
from public, anon;
grant execute on function
  public.consolidado_mensal(uuid, uuid, int, int), public.salvar_frequencias(uuid, int, int, jsonb),
  public.emitir_consolidado(uuid, uuid, int, int), public.emitir_checklist_nota(uuid),
  public.exportar_backup_orgao(uuid), public.registrar_erro_aplicativo(text, text, text, text, text, uuid)
to authenticated;
