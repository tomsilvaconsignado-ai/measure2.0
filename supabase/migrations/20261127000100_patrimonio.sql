-- GESTÃO PATRIMONIAL – controle de bens institucionais.
--
-- Usa os cadastros existentes: estrutura organizacional (setor responsável pelo bem), unidades atendidas
-- (unidade de saúde onde o bem está), servidores (responsável pela guarda) e fornecedores.
--
-- Regras principais (no banco):
--   * Número patrimonial único no órgão. Bem nunca é apagado: baixa é uma movimentação.
--   * Localização, responsável e situação só mudam por movimentação, que guarda origem, destino, quem pediu,
--     justificativa e confirmações. Movimentação concluída não é alterada: corrige-se por retificação.
--   * Quem pede precisa de competência sobre a origem (patrimonio:criar na unidade do bem) ou ser o responsável
--     atual pelo bem. O bem só muda depois da confirmação de quem recebe (conta autenticada), do documento físico
--     assinado conferido pela administração, ou da própria administração quando não há novo responsável.
--   * Um bem só pode estar numa movimentação em andamento por vez.
--   * Perfis: Master e o novo papel "Administrador patrimonial" (tudo), Administrativo (cadastra e solicita na
--     sua área), papéis de consulta (veem e exportam), servidor responsável (vê os bens sob sua guarda e confirma).

-- =====================================================================
-- Recurso, papel e matriz
-- =====================================================================

insert into public.recursos (codigo, nome, grupo, ordem) values ('patrimonio', 'Gestão patrimonial', 'Patrimônio', 500);

insert into public.papeis (codigo, nome, descricao, somente_leitura, exige_unidade, ordem) values
  ('PATRIMONIAL', 'Administrador patrimonial', 'Controle centralizado dos bens: cadastro, movimentações, inventários e relatórios do patrimônio.', false, false, 65);

insert into public.permissoes_papel (papel, recurso, acao)
select p, 'patrimonio', a from unnest(array['MASTER', 'PATRIMONIAL']) p, unnest(array['ler', 'criar', 'editar', 'excluir', 'aprovar', 'exportar']) a
union all
select 'ADMINISTRATIVO', 'patrimonio', a from unnest(array['ler', 'criar', 'editar', 'exportar']) a
union all
select p, 'patrimonio', a from unnest(array['GESTAO_MUNICIPAL', 'SECRETARIO', 'DIRETOR', 'COORDENADOR']) p, unnest(array['ler', 'exportar']) a
union all
select 'PATRIMONIAL', r, 'ler' from unnest(array['estrutura', 'servidores', 'unidades', 'fornecedores']) r;

insert into public.papel_concede (concedente, concedido) values ('MASTER', 'PATRIMONIAL');

-- =====================================================================
-- Categorias e subcategorias (administráveis por órgão)
-- =====================================================================

create table public.patrimonio_categorias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  pai_id uuid references public.patrimonio_categorias(id),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  ordem int not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index patrimonio_categorias_nome on public.patrimonio_categorias
  (tenant_id, coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nome)));

create function public.patrimonio_valida_categoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pai patrimonio_categorias;
begin
  if new.pai_id is not null then
    select * into v_pai from patrimonio_categorias where id = new.pai_id;
    if v_pai.id is null or v_pai.tenant_id <> new.tenant_id then
      raise exception 'Categoria superior não encontrada neste órgão.' using errcode = 'check_violation', hint = 'pai_id';
    end if;
    if v_pai.pai_id is not null then
      raise exception 'Subcategoria não pode ter subcategorias (só dois níveis).' using errcode = 'check_violation', hint = 'pai_id';
    end if;
    if new.id = v_pai.id then raise exception 'Categoria não pode ficar dentro dela mesma.' using errcode = 'check_violation'; end if;
  end if;
  if tg_op = 'UPDATE' and new.pai_id is null and old.pai_id is not null
     and exists (select 1 from patrimonio_categorias where pai_id = new.id) then
    raise exception 'Categoria com subcategorias não pode virar subcategoria.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create function public.patrimonio_semear_categorias(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record; v_id uuid; s text; i int;
begin
  if exists (select 1 from patrimonio_categorias where tenant_id = p_tenant) then return; end if;
  for c in select * from (values
    (10, 'Mobiliário e móveis', array['Mesas', 'Mesas de escritório', 'Mesas de reunião', 'Cadeiras', 'Cadeiras giratórias', 'Cadeiras fixas', 'Longarinas',
      'Armários', 'Armários de aço', 'Arquivos', 'Gaveteiros', 'Estantes', 'Prateleiras', 'Balcões', 'Bancadas', 'Sofás', 'Poltronas', 'Divisórias', 'Painéis', 'Mesas de atendimento']),
    (20, 'Informática e tecnologia', array['Computadores', 'Notebooks', 'Monitores', 'Impressoras', 'Scanners', 'Nobreaks', 'Servidores', 'Roteadores', 'Switches',
      'Access points', 'Projetores', 'Tablets', 'Aparelhos de telefonia', 'Telefones IP', 'Equipamentos de videoconferência', 'HDs externos',
      'Equipamentos de armazenamento', 'Periféricos de informática']),
    (30, 'Equipamentos eletrônicos', array['Televisores', 'Aparelhos de som', 'Caixas de som', 'Microfones', 'Câmeras', 'Equipamentos de gravação',
      'Aparelhos de ar-condicionado', 'Ventiladores', 'Bebedouros', 'Purificadores de água', 'Frigobares', 'Geladeiras', 'Freezers', 'Fornos elétricos', 'Micro-ondas']),
    (40, 'Ferramentas e equipamentos de manutenção', array['Furadeiras', 'Parafusadeiras', 'Esmerilhadeiras', 'Serras elétricas', 'Marteletes', 'Compressores',
      'Máquinas de solda', 'Escadas', 'Carrinhos de transporte', 'Caixas de ferramentas', 'Jogos de chaves', 'Alicates', 'Martelos', 'Equipamentos de medição',
      'Equipamentos de pintura', 'Bombas hidráulicas', 'Equipamentos de jardinagem', 'Roçadeiras', 'Cortadores de grama', 'Lavadoras de alta pressão']),
    (50, 'Equipamentos elétricos', array['Quadros elétricos', 'Transformadores', 'Estabilizadores', 'Geradores', 'Motores elétricos', 'Extensões industriais',
      'Equipamentos de iluminação', 'Refletores', 'Ferramentas elétricas', 'Equipamentos de teste elétrico']),
    (60, 'Equipamentos hidráulicos', array['Bombas d''água', 'Motobombas', 'Pressurizadores', 'Equipamentos de bombeamento', 'Equipamentos de inspeção hidráulica', 'Ferramentas hidráulicas']),
    (70, 'Equipamentos médicos e hospitalares', array['Macas', 'Camas hospitalares', 'Cadeiras de rodas', 'Biombos', 'Autoclaves', 'Focos clínicos', 'Balanças',
      'Oxímetros', 'Monitores multiparamétricos', 'Eletrocardiógrafos', 'Nebulizadores', 'Aspiradores', 'Equipamentos odontológicos',
      'Equipamentos de esterilização', 'Equipamentos laboratoriais', 'Outros equipamentos assistenciais']),
    (80, 'Equipamentos de segurança', array['Extintores', 'Câmeras de segurança', 'DVRs', 'NVRs', 'Alarmes', 'Detectores', 'Equipamentos de controle de acesso',
      'Rádios comunicadores', 'Equipamentos de proteção coletiva']),
    (90, 'Equipamentos de transporte e logística', array['Carrinhos de carga', 'Carrinhos de transporte', 'Paleteiras', 'Equipamentos de movimentação', 'Reboques', 'Outros equipamentos logísticos']),
    (100, 'Outros bens', array['Materiais permanentes diversos', 'Equipamentos administrativos', 'Equipamentos operacionais', 'Instrumentos técnicos',
      'Equipamentos de comunicação', 'Bens não classificados nas categorias anteriores'])
  ) v(ordem, nome, subs) loop
    insert into patrimonio_categorias (tenant_id, nome, ordem) values (p_tenant, c.nome, c.ordem) returning id into v_id;
    i := 0;
    foreach s in array c.subs loop
      i := i + 1;
      insert into patrimonio_categorias (tenant_id, pai_id, nome, ordem) values (p_tenant, v_id, s, i * 10);
    end loop;
  end loop;
end $$;

-- =====================================================================
-- Bens
-- =====================================================================

create table public.patrimonio_bens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  -- identificação
  numero text not null check (length(btrim(numero)) between 1 and 40),
  descricao text not null check (length(btrim(descricao)) between 3 and 500),
  categoria_id uuid not null references public.patrimonio_categorias(id),
  subcategoria_id uuid references public.patrimonio_categorias(id),
  marca text, modelo text, numero_serie text, fabricante text,
  quantidade int not null default 1 check (quantidade between 1 and 100000),
  data_aquisicao date,
  valor_aquisicao numeric(16,2) check (valor_aquisicao is null or valor_aquisicao >= 0),
  nota_fiscal text,
  fornecedor_id uuid references public.fornecedores(id),
  observacoes text,
  -- localização: setor responsável (estrutura) e unidade de saúde onde está (unidades atendidas)
  unidade_id uuid not null references public.unidades_organizacionais(id),
  local_id uuid references public.unidades_atendidas(id),
  ambiente text check (ambiente in ('SALA', 'COORDENACAO', 'GERENCIA', 'DEPARTAMENTO', 'RECEPCAO', 'ALMOXARIFADO', 'CONSULTORIO', 'OFICINA', 'DEPOSITO', 'OUTRO')),
  sala text,
  -- responsabilidade
  responsavel_id uuid references public.servidores(id),
  responsavel_desde date,
  responsavel_obs text,
  -- estado de conservação (físico) e situação operacional são independentes
  conservacao text not null default 'BOM' check (conservacao in ('NOVO', 'EXCELENTE', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO', 'DANIFICADO',
                                                                 'NECESSITA_MANUTENCAO', 'EM_MANUTENCAO', 'IRRECUPERAVEL')),
  funcionamento text not null default 'FUNCIONANDO' check (funcionamento in ('FUNCIONANDO', 'FUNCIONANDO_PARCIAL', 'NAO_FUNCIONA', 'NAO_SE_APLICA')),
  situacao text not null default 'EM_USO' check (situacao in ('EM_USO', 'EM_ESTOQUE', 'DISPONIVEL', 'EM_MANUTENCAO', 'AGUARDANDO_AVALIACAO', 'EMPRESTADO',
                                                              'EM_TRANSFERENCIA', 'SUBSTITUIDO', 'BAIXADO', 'EXTRAVIADO', 'EM_APURACAO')),
  data_ultima_avaliacao date,
  observacoes_tecnicas text,
  -- trava: movimentação em andamento (só uma por vez) e a situação a restaurar se ela não for concluída
  movimentacao_pendente_id uuid,
  situacao_antes_mov text,
  baixado_em timestamptz,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index patrimonio_numero_unico on public.patrimonio_bens (tenant_id, lower(btrim(numero)));
create index patrimonio_bens_unidade on public.patrimonio_bens (unidade_id);
create index patrimonio_bens_local on public.patrimonio_bens (local_id);
create index patrimonio_bens_responsavel on public.patrimonio_bens (responsavel_id);
create index patrimonio_bens_busca on public.patrimonio_bens using gin
  ((lower(numero || ' ' || descricao || ' ' || coalesce(marca, '') || ' ' || coalesce(modelo, '') || ' ' || coalesce(numero_serie, ''))) extensions.gin_trgm_ops);

create function public.patrimonio_prepara_bem() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat patrimonio_categorias; v_sub patrimonio_categorias;
begin
  new.numero := btrim(new.numero);
  new.descricao := btrim(new.descricao);
  select * into v_cat from patrimonio_categorias where id = new.categoria_id;
  if v_cat.id is null or v_cat.tenant_id <> new.tenant_id or v_cat.pai_id is not null then
    raise exception 'Escolha a categoria do bem.' using errcode = 'check_violation', hint = 'categoria_id';
  end if;
  if new.subcategoria_id is not null then
    select * into v_sub from patrimonio_categorias where id = new.subcategoria_id;
    if v_sub.id is null or v_sub.pai_id is distinct from new.categoria_id then
      raise exception 'A subcategoria não pertence à categoria escolhida.' using errcode = 'check_violation', hint = 'subcategoria_id';
    end if;
  end if;
  if not exists (select 1 from unidades_organizacionais where id = new.unidade_id and tenant_id = new.tenant_id) then
    raise exception 'O setor responsável não pertence a este órgão.' using errcode = 'check_violation', hint = 'unidade_id';
  end if;
  if new.local_id is not null and not exists (select 1 from unidades_atendidas where id = new.local_id and tenant_id = new.tenant_id) then
    raise exception 'A unidade de localização não pertence a este órgão.' using errcode = 'check_violation', hint = 'local_id';
  end if;
  if new.responsavel_id is not null and not exists (select 1 from servidores where id = new.responsavel_id and tenant_id = new.tenant_id) then
    raise exception 'O responsável não é servidor deste órgão.' using errcode = 'check_violation', hint = 'responsavel_id';
  end if;
  if new.fornecedor_id is not null and not exists (select 1 from fornecedores where id = new.fornecedor_id) then
    raise exception 'Fornecedor não encontrado.' using errcode = 'check_violation', hint = 'fornecedor_id';
  end if;
  if tg_op = 'INSERT' then
    if new.situacao in ('BAIXADO', 'EM_TRANSFERENCIA') then
      raise exception 'O bem é cadastrado em uso, em estoque ou disponível; baixa e transferência são movimentações.' using errcode = 'check_violation', hint = 'situacao';
    end if;
    new.movimentacao_pendente_id := null; new.situacao_antes_mov := null; new.baixado_em := null;
    if new.responsavel_id is not null then new.responsavel_desde := coalesce(new.responsavel_desde, hoje()); end if;
  end if;
  return new;
end $$;

-- Histórico de responsabilidade e de localização (cada período de guarda)
create table public.patrimonio_responsabilidades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  servidor_id uuid references public.servidores(id),
  unidade_id uuid not null references public.unidades_organizacionais(id),
  local_id uuid references public.unidades_atendidas(id),
  inicio timestamptz not null default now(),
  fim timestamptz,
  motivo text,
  movimentacao_id uuid,
  registrado_por uuid
);
create index patrimonio_resp_bem on public.patrimonio_responsabilidades (bem_id, inicio);
create index patrimonio_resp_servidor on public.patrimonio_responsabilidades (servidor_id) where fim is null;

create function public.patrimonio_bem_cadastrado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into patrimonio_responsabilidades (tenant_id, bem_id, servidor_id, unidade_id, local_id, motivo, registrado_por)
  values (new.tenant_id, new.id, new.responsavel_id, new.unidade_id, new.local_id, 'Cadastro do bem', auth.uid());
  return null;
end $$;

-- =====================================================================
-- Movimentações
-- =====================================================================

create table public.patrimonio_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  numero int not null,
  ano int not null,
  tipo text not null check (tipo in ('TRANSFERENCIA_SALA', 'TRANSFERENCIA_SETOR', 'TRANSFERENCIA_COORDENACAO', 'TRANSFERENCIA_DIRETORIA',
    'TRANSFERENCIA_UNIDADE', 'ALMOXARIFADO', 'MANUTENCAO', 'SUBSTITUICAO', 'TROCA', 'DEVOLUCAO', 'EMPRESTIMO', 'RECOLHIMENTO', 'BAIXA',
    'RESPONSABILIDADE', 'RETIFICACAO')),
  situacao text not null check (situacao in ('RASCUNHO', 'SOLICITADA', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADA_DESTINO', 'REJEITADA', 'CANCELADA',
    'CONCLUIDA', 'PENDENTE_REGULARIZACAO')),
  -- origem e destino (do primeiro item) para escopo e listagens
  unidade_id uuid not null references public.unidades_organizacionais(id),
  unidade_destino_id uuid references public.unidades_organizacionais(id),
  justificativa text not null check (length(btrim(justificativa)) >= 5),
  observacoes text,
  destino_substituido text check (destino_substituido in ('ALMOXARIFADO', 'OUTRA_COORDENACAO', 'MANUTENCAO', 'RESERVA', 'AVALIACAO_BAIXA')),
  devolucao_prevista date,
  solicitante_id uuid not null references public.perfis(id),
  solicitante_servidor_id uuid references public.servidores(id),
  termo_emitido_em timestamptz, termo_emitido_por uuid,
  conferido_em timestamptz, conferido_por uuid,
  rejeitada_em timestamptz, rejeitada_por uuid, motivo_rejeicao text,
  cancelada_em timestamptz, cancelada_por uuid, motivo_cancelamento text,
  concluida_em timestamptz,
  retifica_id uuid references public.patrimonio_movimentacoes(id),
  retificada_por_id uuid references public.patrimonio_movimentacoes(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index patrimonio_mov_numero on public.patrimonio_movimentacoes (tenant_id, ano, numero);
create index patrimonio_mov_situacao on public.patrimonio_movimentacoes (tenant_id, situacao, criado_em desc);

create table public.patrimonio_mov_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  movimentacao_id uuid not null references public.patrimonio_movimentacoes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  papel text not null default 'PRINCIPAL' check (papel in ('PRINCIPAL', 'ENTREGUE', 'RECEBIDO', 'SUBSTITUIDO', 'SUBSTITUTO')),
  origem_unidade_id uuid not null references public.unidades_organizacionais(id),
  origem_local_id uuid references public.unidades_atendidas(id),
  origem_ambiente text, origem_sala text,
  origem_responsavel_id uuid references public.servidores(id),
  origem_situacao text not null, origem_conservacao text not null,
  destino_unidade_id uuid not null references public.unidades_organizacionais(id),
  destino_local_id uuid references public.unidades_atendidas(id),
  destino_ambiente text, destino_sala text,
  destino_responsavel_id uuid references public.servidores(id),
  destino_situacao text not null,
  confirmacao text not null default 'PENDENTE' check (confirmacao in ('PENDENTE', 'CONFIRMADO', 'REJEITADO')),
  confirmacao_tipo text check (confirmacao_tipo in ('DIGITAL', 'DOCUMENTO_FISICO', 'ADMINISTRATIVA', 'AUTOMATICA')),
  confirmado_em timestamptz, confirmado_por uuid references public.perfis(id),
  confirmado_servidor_id uuid references public.servidores(id),
  declaracao text,
  unique (movimentacao_id, bem_id)
);
create index patrimonio_itens_bem on public.patrimonio_mov_itens (bem_id);

-- =====================================================================
-- Inventário
-- =====================================================================

create table public.patrimonio_inventarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  titulo text not null check (length(btrim(titulo)) between 3 and 200),
  unidade_id uuid not null references public.unidades_organizacionais(id),
  local_id uuid references public.unidades_atendidas(id),
  situacao text not null default 'ABERTO' check (situacao in ('ABERTO', 'CONCLUIDO', 'CANCELADO')),
  responsavel_id uuid not null references public.perfis(id),
  observacoes text,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);

create table public.patrimonio_inventario_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  inventario_id uuid not null references public.patrimonio_inventarios(id),
  bem_id uuid references public.patrimonio_bens(id),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'LOCALIZADO', 'NAO_LOCALIZADO', 'SEM_CADASTRO', 'DIVERGENCIA', 'NECESSITA_AVALIACAO')),
  conservacao_avaliada text,
  numero_encontrado text,
  descricao_encontrada text,
  observacao text,
  conferido_por uuid references public.perfis(id),
  conferido_em timestamptz,
  check (bem_id is not null or status = 'SEM_CADASTRO')
);
create index patrimonio_inv_itens on public.patrimonio_inventario_itens (inventario_id);
create unique index patrimonio_inv_bem on public.patrimonio_inventario_itens (inventario_id, bem_id) where bem_id is not null;

-- =====================================================================
-- Relatórios emitidos (PDF guardado em documentos, com numeração anual)
-- =====================================================================

create table public.patrimonio_relatorios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  ano int not null,
  sequencia int not null,
  tipo text not null check (length(btrim(tipo)) between 2 and 60),
  titulo text not null,
  nome_arquivo text not null,
  filtros jsonb not null default '{}',
  documento_id uuid references public.documentos(id),
  gerado_por uuid not null references public.perfis(id),
  gerado_em timestamptz not null default now(),
  unique (tenant_id, ano, sequencia)
);

-- =====================================================================
-- Gatilhos padrão
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['patrimonio_categorias', 'patrimonio_bens', 'patrimonio_inventarios'] loop
    execute format('create trigger %1$s_criacao before insert on public.%1$s for each row execute function public.carimbar_criacao()', t);
  end loop;
  foreach t in array array['patrimonio_categorias', 'patrimonio_bens', 'patrimonio_movimentacoes', 'patrimonio_inventarios'] loop
    execute format('create trigger %1$s_carimbar before update on public.%1$s for each row execute function public.carimbar()', t);
  end loop;
  foreach t in array array['patrimonio_categorias', 'patrimonio_bens', 'patrimonio_responsabilidades', 'patrimonio_movimentacoes', 'patrimonio_mov_itens',
                           'patrimonio_inventarios', 'patrimonio_inventario_itens', 'patrimonio_relatorios'] loop
    execute format('create trigger %1$s_tenant before update on public.%1$s for each row execute function public.bloquear_troca_tenant()', t);
    execute format('create trigger %1$s_auditar after insert or update or delete on public.%1$s for each row execute function public.auditar()', t);
  end loop;
end $$;

create trigger patrimonio_categorias_valida before insert or update on public.patrimonio_categorias
  for each row execute function public.patrimonio_valida_categoria();
create trigger patrimonio_categorias_justificativa before update of ativo on public.patrimonio_categorias
  for each row execute function public.exige_justificativa_inativacao();
create trigger patrimonio_bens_prepara before insert or update on public.patrimonio_bens
  for each row execute function public.patrimonio_prepara_bem();
create trigger patrimonio_bens_cadastrado after insert on public.patrimonio_bens
  for each row execute function public.patrimonio_bem_cadastrado();

select public.patrimonio_semear_categorias(id) from public.tenants;

create function public.patrimonio_categorias_novo_orgao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform patrimonio_semear_categorias(new.id);
  return null;
end $$;
create trigger tenants_patrimonio_categorias after insert on public.tenants
  for each row execute function public.patrimonio_categorias_novo_orgao();

-- =====================================================================
-- Autorização
-- =====================================================================

-- O servidor (cadastro) cuja conta é a de quem chama
create function public.patrimonio_eu_servidor(p_servidor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_servidor is not null and exists (select 1 from servidores where id = p_servidor and user_id = auth.uid())
$$;

create function public.patrimonio_bem_legivel(p_bem uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patrimonio_bens b
     where b.id = p_bem
       and (pode(b.tenant_id, b.unidade_id, 'patrimonio', 'ler')
            or (patrimonio_eu_servidor(b.responsavel_id) and membro_do_tenant(b.tenant_id))
            or (b.movimentacao_pendente_id is not null and exists (
                  select 1 from patrimonio_mov_itens i where i.movimentacao_id = b.movimentacao_pendente_id
                     and patrimonio_eu_servidor(i.destino_responsavel_id)))))
$$;

create function public.patrimonio_mov_legivel(p_mov uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patrimonio_movimentacoes m
     where m.id = p_mov
       and (pode(m.tenant_id, m.unidade_id, 'patrimonio', 'ler')
            or (m.unidade_destino_id is not null and pode(m.tenant_id, m.unidade_destino_id, 'patrimonio', 'ler'))
            or m.solicitante_id = auth.uid()
            or exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = m.id
                        and (patrimonio_eu_servidor(i.origem_responsavel_id) or patrimonio_eu_servidor(i.destino_responsavel_id)))))
$$;

-- Documentos do patrimônio seguem o registro dono (bem, movimentação, inventário ou relatório)
create function public.patrimonio_documento_legivel(p_tenant uuid, p_unidade uuid, p_registro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_registro is null then pode(p_tenant, p_unidade, 'patrimonio', 'ler')
    when exists (select 1 from patrimonio_bens where id = p_registro) then patrimonio_bem_legivel(p_registro)
    when exists (select 1 from patrimonio_movimentacoes where id = p_registro) then patrimonio_mov_legivel(p_registro)
    when exists (select 1 from patrimonio_relatorios where id = p_registro) then
      exists (select 1 from patrimonio_relatorios r where r.id = p_registro
               and (r.gerado_por = auth.uid() or pode(r.tenant_id, null, 'patrimonio', 'aprovar')))
    when exists (select 1 from patrimonio_inventarios where id = p_registro) then
      exists (select 1 from patrimonio_inventarios v where v.id = p_registro and pode(v.tenant_id, v.unidade_id, 'patrimonio', 'ler'))
    else pode(p_tenant, p_unidade, 'patrimonio', 'ler') end
$$;

create or replace function public.documento_legivel(p_tenant uuid, p_unidade uuid, p_recurso text, p_registro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_recurso = 'patrimonio' then patrimonio_documento_legivel(p_tenant, p_unidade, p_registro)
  else pode(p_tenant, p_unidade, p_recurso, 'ler')
      or (p_recurso = 'contratos' and p_registro is not null and designado(p_registro))
      or (p_recurso = 'notas_fiscais' and p_registro is not null and designado(contrato_de_nota(p_registro))) end
$$;

-- Registro de visualização/download: agora pela mesma regra de leitura dos documentos
create or replace function public.registrar_acesso_documento(p_id uuid, p_acao text default 'DOWNLOAD') returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  if p_acao not in ('DOWNLOAD', 'VISUALIZACAO') then
    raise exception 'Ação inválida.' using errcode = 'check_violation';
  end if;
  select * into d from documentos where id = p_id;
  if not found or not documento_legivel(d.tenant_id, d.unidade_id, d.recurso, d.registro_id) then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;
  perform registrar_auditoria(d.tenant_id, 'documentos', p_id::text, p_acao, null,
    jsonb_build_object('nome_arquivo', d.nome_arquivo, 'recurso', d.recurso, 'registro_id', d.registro_id));
end $$;

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.patrimonio_categorias enable row level security;
alter table public.patrimonio_bens enable row level security;
alter table public.patrimonio_responsabilidades enable row level security;
alter table public.patrimonio_movimentacoes enable row level security;
alter table public.patrimonio_mov_itens enable row level security;
alter table public.patrimonio_inventarios enable row level security;
alter table public.patrimonio_inventario_itens enable row level security;
alter table public.patrimonio_relatorios enable row level security;

create policy patrimonio_categorias_ler on public.patrimonio_categorias for select to authenticated using (membro_do_tenant(tenant_id) or pode(tenant_id, null, 'patrimonio', 'ler'));
create policy patrimonio_categorias_criar on public.patrimonio_categorias for insert to authenticated with check (pode(tenant_id, null, 'patrimonio', 'aprovar'));
create policy patrimonio_categorias_editar on public.patrimonio_categorias for update to authenticated
  using (pode(tenant_id, null, 'patrimonio', 'aprovar')) with check (pode(tenant_id, null, 'patrimonio', 'aprovar'));

-- usa as colunas da própria linha (vale também para o RETURNING do cadastro)
create function public.patrimonio_destino_pendente(p_mov uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = p_mov and patrimonio_eu_servidor(i.destino_responsavel_id))
$$;
create policy patrimonio_bens_ler on public.patrimonio_bens for select to authenticated
  using (pode(tenant_id, unidade_id, 'patrimonio', 'ler')
         or (patrimonio_eu_servidor(responsavel_id) and membro_do_tenant(tenant_id))
         or (movimentacao_pendente_id is not null and patrimonio_destino_pendente(movimentacao_pendente_id)));
create policy patrimonio_bens_criar on public.patrimonio_bens for insert to authenticated with check (pode(tenant_id, unidade_id, 'patrimonio', 'criar'));
create policy patrimonio_bens_editar on public.patrimonio_bens for update to authenticated
  using (pode(tenant_id, unidade_id, 'patrimonio', 'editar')) with check (pode(tenant_id, unidade_id, 'patrimonio', 'editar'));

create policy patrimonio_resp_ler on public.patrimonio_responsabilidades for select to authenticated using (patrimonio_bem_legivel(bem_id));
create policy patrimonio_mov_ler on public.patrimonio_movimentacoes for select to authenticated using (patrimonio_mov_legivel(id));
create policy patrimonio_itens_ler on public.patrimonio_mov_itens for select to authenticated using (patrimonio_mov_legivel(movimentacao_id));
create policy patrimonio_inv_ler on public.patrimonio_inventarios for select to authenticated using (pode(tenant_id, unidade_id, 'patrimonio', 'ler'));
create policy patrimonio_inv_itens_ler on public.patrimonio_inventario_itens for select to authenticated
  using (exists (select 1 from patrimonio_inventarios v where v.id = inventario_id and pode(v.tenant_id, v.unidade_id, 'patrimonio', 'ler')));
create policy patrimonio_relatorios_ler on public.patrimonio_relatorios for select to authenticated
  using (gerado_por = (select auth.uid()) or pode(tenant_id, null, 'patrimonio', 'aprovar'));

revoke all on public.patrimonio_categorias, public.patrimonio_bens, public.patrimonio_responsabilidades, public.patrimonio_movimentacoes,
  public.patrimonio_mov_itens, public.patrimonio_inventarios, public.patrimonio_inventario_itens, public.patrimonio_relatorios from anon;
revoke insert, update, delete on public.patrimonio_responsabilidades, public.patrimonio_movimentacoes, public.patrimonio_mov_itens,
  public.patrimonio_inventarios, public.patrimonio_inventario_itens, public.patrimonio_relatorios from authenticated;
revoke delete on public.patrimonio_categorias, public.patrimonio_bens from authenticated;
-- bem: só os dados descritivos e a avaliação mudam direto; localização, responsável e situação, só por movimentação
revoke update on public.patrimonio_bens from authenticated;
grant update (numero, descricao, categoria_id, subcategoria_id, marca, modelo, numero_serie, fabricante, quantidade, data_aquisicao,
  valor_aquisicao, nota_fiscal, fornecedor_id, observacoes, responsavel_obs, conservacao, funcionamento, data_ultima_avaliacao,
  observacoes_tecnicas) on public.patrimonio_bens to authenticated;
revoke insert on public.patrimonio_bens from authenticated;
grant insert (tenant_id, numero, descricao, categoria_id, subcategoria_id, marca, modelo, numero_serie, fabricante, quantidade, data_aquisicao,
  valor_aquisicao, nota_fiscal, fornecedor_id, observacoes, unidade_id, local_id, ambiente, sala, responsavel_id, responsavel_desde, responsavel_obs,
  conservacao, funcionamento, situacao, data_ultima_avaliacao, observacoes_tecnicas) on public.patrimonio_bens to authenticated;

-- =====================================================================
-- Movimentar
-- =====================================================================

create function public.patrimonio_situacao_destino(p_tipo text, p_papel text, p_destino_substituido text, p_tem_responsavel boolean, p_atual text)
returns text language sql immutable as $$
  select case
    when p_tipo = 'BAIXA' then 'BAIXADO'
    when p_tipo in ('ALMOXARIFADO', 'RECOLHIMENTO') then 'EM_ESTOQUE'
    when p_tipo = 'MANUTENCAO' then 'EM_MANUTENCAO'
    when p_tipo = 'EMPRESTIMO' then 'EMPRESTADO'
    when p_tipo in ('RESPONSABILIDADE', 'TRANSFERENCIA_SALA') then p_atual
    when p_tipo = 'SUBSTITUICAO' and p_papel = 'SUBSTITUIDO' then case p_destino_substituido
      when 'ALMOXARIFADO' then 'EM_ESTOQUE' when 'MANUTENCAO' then 'EM_MANUTENCAO' when 'RESERVA' then 'DISPONIVEL'
      when 'AVALIACAO_BAIXA' then 'AGUARDANDO_AVALIACAO' else 'EM_USO' end
    when p_tem_responsavel then 'EM_USO'
    else 'DISPONIVEL' end
$$;

-- Aplica a movimentação (uso interno): atualiza localização, responsável e situação dos bens e o histórico
create function public.patrimonio_aplicar(p_mov uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m patrimonio_movimentacoes; i patrimonio_mov_itens; b patrimonio_bens; v_novos uuid[] := '{}';
begin
  select * into m from patrimonio_movimentacoes where id = p_mov for update;
  if m.situacao in ('CONCLUIDA', 'CANCELADA', 'REJEITADA') then return; end if;
  for i in select * from patrimonio_mov_itens where movimentacao_id = p_mov order by papel loop
    select * into b from patrimonio_bens where id = i.bem_id for update;
    if b.responsavel_id is distinct from i.destino_responsavel_id or b.unidade_id <> i.destino_unidade_id or b.local_id is distinct from i.destino_local_id then
      update patrimonio_responsabilidades set fim = now() where bem_id = b.id and fim is null;
      insert into patrimonio_responsabilidades (tenant_id, bem_id, servidor_id, unidade_id, local_id, motivo, movimentacao_id, registrado_por)
      values (b.tenant_id, b.id, i.destino_responsavel_id, i.destino_unidade_id, i.destino_local_id,
              m.justificativa, m.id, auth.uid());
    end if;
    if i.destino_responsavel_id is not null and i.destino_responsavel_id is distinct from b.responsavel_id then
      v_novos := v_novos || (select user_id from servidores where id = i.destino_responsavel_id);
    end if;
    update patrimonio_bens
       set unidade_id = i.destino_unidade_id, local_id = i.destino_local_id, ambiente = i.destino_ambiente, sala = i.destino_sala,
           responsavel_desde = case when responsavel_id is distinct from i.destino_responsavel_id then
                                 case when i.destino_responsavel_id is null then null else hoje() end else responsavel_desde end,
           responsavel_id = i.destino_responsavel_id,
           situacao = i.destino_situacao,
           baixado_em = case when i.destino_situacao = 'BAIXADO' then now() else null end,
           movimentacao_pendente_id = null, situacao_antes_mov = null
     where id = b.id;
  end loop;
  update patrimonio_movimentacoes set situacao = 'CONCLUIDA', concluida_em = now() where id = p_mov;
  perform notificar(m.tenant_id, array[m.solicitante_id], 'PATRIMONIO', 'MOVIMENTACAO_CONCLUIDA',
    'Movimentação ' || lpad(m.numero::text, 4, '0') || '/' || m.ano || ' concluída', m.justificativa, '/patrimonio/movimentacoes?m=' || m.id, m.id);
  perform notificar(m.tenant_id, v_novos, 'PATRIMONIO', 'BEM_ATRIBUIDO',
    'Bem patrimonial atribuído a você', 'Movimentação ' || lpad(m.numero::text, 4, '0') || '/' || m.ano || ' concluída.', '/patrimonio/bens?meus=1', m.id);
end $$;

-- Libera os bens de uma movimentação que não foi concluída (restaura a situação anterior)
create function public.patrimonio_liberar(p_mov uuid) returns void
language sql security definer set search_path = public as $$
  update patrimonio_bens set situacao = coalesce(situacao_antes_mov, situacao), situacao_antes_mov = null, movimentacao_pendente_id = null
   where movimentacao_pendente_id = p_mov
$$;

-- Conclui se todos os itens estiverem confirmados
create function public.patrimonio_tentar_concluir(p_mov uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from patrimonio_mov_itens where movimentacao_id = p_mov and confirmacao <> 'CONFIRMADO') then return false; end if;
  perform patrimonio_aplicar(p_mov);
  return true;
end $$;

-- Cria a movimentação. p: tipo, justificativa, observacoes, destino_substituido, devolucao_prevista,
-- itens: [{bem_id, papel, destino_unidade_id, destino_local_id, destino_ambiente, destino_sala, destino_responsavel_id, destino_situacao}]
-- (campo de destino ausente = mantém o da origem; destino_responsavel_id: null explícito = sem responsável)
create function public.patrimonio_movimentar(p_tenant uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text := p ->> 'tipo';
  v_id uuid := gen_random_uuid();
  v_ano int := extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
  v_num int; v_item jsonb; b patrimonio_bens; v_itens jsonb := coalesce(p -> 'itens', '[]');
  v_papel text; v_dest_un uuid; v_dest_local uuid; v_dest_amb text; v_dest_sala text; v_dest_resp uuid; v_dest_sit text;
  v_confirmacao text; v_conf_tipo text; v_pendentes uuid[] := '{}'; v_user uuid; v_primeiro boolean := true;
  v_outro patrimonio_bens; v_papeis text[]; v_origem_un uuid; v_destino_un uuid;
begin
  if auth.uid() is null or not membro_ativo(p_tenant, auth.uid()) then
    raise exception 'Você precisa de acesso ativo neste órgão.' using errcode = 'insufficient_privilege';
  end if;
  if v_tipo is null or v_tipo = 'RETIFICACAO' or v_tipo not in ('TRANSFERENCIA_SALA', 'TRANSFERENCIA_SETOR', 'TRANSFERENCIA_COORDENACAO', 'TRANSFERENCIA_DIRETORIA',
       'TRANSFERENCIA_UNIDADE', 'ALMOXARIFADO', 'MANUTENCAO', 'SUBSTITUICAO', 'TROCA', 'DEVOLUCAO', 'EMPRESTIMO', 'RECOLHIMENTO', 'BAIXA', 'RESPONSABILIDADE') then
    raise exception 'Escolha o tipo de movimentação.' using errcode = 'check_violation', hint = 'tipo';
  end if;
  if length(btrim(coalesce(p ->> 'justificativa', ''))) < 5 then
    raise exception 'Informe a justificativa (mínimo de 5 caracteres).' using errcode = 'check_violation', hint = 'justificativa';
  end if;
  if jsonb_array_length(v_itens) = 0 then raise exception 'Escolha o bem patrimonial.' using errcode = 'check_violation', hint = 'itens'; end if;
  v_papeis := array(select coalesce(x ->> 'papel', 'PRINCIPAL') from jsonb_array_elements(v_itens) x order by 1);
  if v_tipo = 'TROCA' and v_papeis <> array['ENTREGUE', 'RECEBIDO'] then
    raise exception 'Na troca, informe o bem entregue e o bem recebido.' using errcode = 'check_violation', hint = 'itens';
  end if;
  if v_tipo = 'SUBSTITUICAO' and v_papeis <> array['SUBSTITUIDO', 'SUBSTITUTO'] then
    raise exception 'Na substituição, informe o bem substituído e o bem substituto.' using errcode = 'check_violation', hint = 'itens';
  end if;
  if v_tipo = 'SUBSTITUICAO' and (p ->> 'destino_substituido') is null then
    raise exception 'Informe o destino do bem substituído.' using errcode = 'check_violation', hint = 'destino_substituido';
  end if;
  if v_tipo not in ('TROCA', 'SUBSTITUICAO') and exists (select 1 from unnest(v_papeis) x where x <> 'PRINCIPAL') then
    raise exception 'Papel de item inválido para este tipo.' using errcode = 'check_violation', hint = 'itens';
  end if;
  if (select count(distinct (x ->> 'bem_id')) from jsonb_array_elements(v_itens) x) <> jsonb_array_length(v_itens) then
    raise exception 'O mesmo bem aparece duas vezes.' using errcode = 'check_violation', hint = 'itens';
  end if;
  if v_tipo = 'EMPRESTIMO' and (p ->> 'devolucao_prevista') is null then
    raise exception 'Informe a data prevista de devolução do empréstimo.' using errcode = 'check_violation', hint = 'devolucao_prevista';
  end if;

  perform pg_advisory_xact_lock(hashtext('patrimonio_mov:' || p_tenant || ':' || v_ano));
  select coalesce(max(numero), 0) + 1 into v_num from patrimonio_movimentacoes where tenant_id = p_tenant and ano = v_ano;

  for v_item in select x from jsonb_array_elements(v_itens) x order by x ->> 'papel' loop
    select * into b from patrimonio_bens where id = (v_item ->> 'bem_id')::uuid and tenant_id = p_tenant for update;
    if b.id is null then raise exception 'Bem patrimonial não encontrado neste órgão.' using errcode = 'no_data_found', hint = 'itens'; end if;
    v_papel := coalesce(v_item ->> 'papel', 'PRINCIPAL');
    if b.situacao = 'BAIXADO' then
      raise exception 'O bem % está baixado e não pode ser movimentado.', b.numero using errcode = 'check_violation', hint = 'itens';
    end if;
    if b.movimentacao_pendente_id is not null then
      raise exception 'O bem % já está numa movimentação em andamento (nº %). Conclua ou cancele aquela antes.', b.numero,
        (select lpad(numero::text, 4, '0') || '/' || ano from patrimonio_movimentacoes where id = b.movimentacao_pendente_id)
        using errcode = 'check_violation', hint = 'itens';
    end if;
    -- competência sobre a origem: o bem recebido na troca é confirmado pelo outro lado, que não precisa de pedido
    if v_tipo = 'BAIXA' then
      if not pode(p_tenant, b.unidade_id, 'patrimonio', 'aprovar') then
        raise exception 'Somente a administração patrimonial registra baixa.' using errcode = 'insufficient_privilege';
      end if;
    elsif v_papel <> 'RECEBIDO' and not (pode(p_tenant, b.unidade_id, 'patrimonio', 'criar') or patrimonio_eu_servidor(b.responsavel_id)) then
      raise exception 'Você não tem competência para movimentar o bem % (ele é de outro setor).', b.numero using errcode = 'insufficient_privilege', hint = 'itens';
    end if;

    -- destino: o informado, ou o mesmo da origem
    if v_tipo = 'TROCA' then
      select * into v_outro from patrimonio_bens
       where id = (select (x ->> 'bem_id')::uuid from jsonb_array_elements(v_itens) x where x ->> 'papel' <> v_papel);
      v_dest_un := v_outro.unidade_id; v_dest_local := v_outro.local_id; v_dest_amb := v_outro.ambiente; v_dest_sala := v_outro.sala;
      v_dest_resp := v_outro.responsavel_id;
    elsif v_tipo = 'SUBSTITUICAO' and v_papel = 'SUBSTITUTO' then
      select * into v_outro from patrimonio_bens
       where id = (select (x ->> 'bem_id')::uuid from jsonb_array_elements(v_itens) x where x ->> 'papel' = 'SUBSTITUIDO');
      v_dest_un := v_outro.unidade_id; v_dest_local := v_outro.local_id; v_dest_amb := v_outro.ambiente; v_dest_sala := v_outro.sala;
      v_dest_resp := case when v_item ? 'destino_responsavel_id' then nullif(v_item ->> 'destino_responsavel_id', '')::uuid else v_outro.responsavel_id end;
    else
      v_dest_un := coalesce(nullif(v_item ->> 'destino_unidade_id', '')::uuid, b.unidade_id);
      v_dest_local := case when v_item ? 'destino_local_id' then nullif(v_item ->> 'destino_local_id', '')::uuid else b.local_id end;
      v_dest_amb := case when v_item ? 'destino_ambiente' then nullif(v_item ->> 'destino_ambiente', '') else b.ambiente end;
      v_dest_sala := case when v_item ? 'destino_sala' then nullif(btrim(v_item ->> 'destino_sala'), '') else b.sala end;
      v_dest_resp := case when v_tipo = 'BAIXA' then null
                          when v_item ? 'destino_responsavel_id' then nullif(v_item ->> 'destino_responsavel_id', '')::uuid else b.responsavel_id end;
    end if;
    if not exists (select 1 from unidades_organizacionais where id = v_dest_un and tenant_id = p_tenant and ativo) then
      raise exception 'Setor de destino não encontrado ou inativo.' using errcode = 'check_violation', hint = 'destino_unidade_id';
    end if;
    if v_dest_local is not null and not exists (select 1 from unidades_atendidas where id = v_dest_local and tenant_id = p_tenant) then
      raise exception 'Unidade de destino não encontrada neste órgão.' using errcode = 'check_violation', hint = 'destino_local_id';
    end if;
    if v_dest_resp is not null and not exists (select 1 from servidores where id = v_dest_resp and tenant_id = p_tenant
                                                 and (data_exoneracao is null or data_exoneracao > hoje())) then
      raise exception 'O novo responsável precisa ser servidor ativo deste órgão.' using errcode = 'check_violation', hint = 'destino_responsavel_id';
    end if;
    if v_dest_amb is not null and v_dest_amb not in ('SALA', 'COORDENACAO', 'GERENCIA', 'DEPARTAMENTO', 'RECEPCAO', 'ALMOXARIFADO', 'CONSULTORIO', 'OFICINA', 'DEPOSITO', 'OUTRO') then
      raise exception 'Ambiente inválido.' using errcode = 'check_violation', hint = 'destino_ambiente';
    end if;
    v_dest_sit := coalesce(nullif(v_item ->> 'destino_situacao', ''),
      patrimonio_situacao_destino(v_tipo, v_papel, p ->> 'destino_substituido', v_dest_resp is not null, b.situacao));
    if v_dest_sit not in ('EM_USO', 'EM_ESTOQUE', 'DISPONIVEL', 'EM_MANUTENCAO', 'AGUARDANDO_AVALIACAO', 'EMPRESTADO', 'SUBSTITUIDO', 'BAIXADO', 'EXTRAVIADO', 'EM_APURACAO')
       or (v_dest_sit = 'BAIXADO' and v_tipo <> 'BAIXA') then
      raise exception 'Situação de destino inválida.' using errcode = 'check_violation', hint = 'destino_situacao';
    end if;
    if v_tipo = 'TRANSFERENCIA_SALA' and v_dest_un <> b.unidade_id then
      raise exception 'Transferência entre salas mantém o setor; para mudar de setor use outro tipo.' using errcode = 'check_violation', hint = 'destino_unidade_id';
    end if;

    -- quem confirma: o novo responsável (pela conta dele); sem novo responsável, a administração do destino
    v_confirmacao := 'PENDENTE'; v_conf_tipo := null;
    if v_dest_resp is not null and v_dest_resp is distinct from b.responsavel_id then
      if patrimonio_eu_servidor(v_dest_resp) then v_confirmacao := 'CONFIRMADO'; v_conf_tipo := 'DIGITAL';
      else
        v_user := (select user_id from servidores where id = v_dest_resp);
        if v_user is not null then v_pendentes := v_pendentes || v_user; end if;
      end if;
    elsif pode(p_tenant, v_dest_un, 'patrimonio', case when v_tipo = 'BAIXA' then 'aprovar' else 'editar' end) then
      v_confirmacao := 'CONFIRMADO'; v_conf_tipo := 'AUTOMATICA';
    end if;

    if v_primeiro then
      v_origem_un := b.unidade_id; v_destino_un := v_dest_un;
      insert into patrimonio_movimentacoes (id, tenant_id, numero, ano, tipo, situacao, unidade_id, unidade_destino_id, justificativa, observacoes,
                                            destino_substituido, devolucao_prevista, solicitante_id, solicitante_servidor_id)
      values (v_id, p_tenant, v_num, v_ano, v_tipo, 'AGUARDANDO_CONFIRMACAO', v_origem_un, v_destino_un, btrim(p ->> 'justificativa'),
              nullif(btrim(p ->> 'observacoes'), ''), nullif(p ->> 'destino_substituido', ''), nullif(p ->> 'devolucao_prevista', '')::date,
              auth.uid(), (select id from servidores where user_id = auth.uid() and tenant_id = p_tenant limit 1));
      v_primeiro := false;
    end if;
    insert into patrimonio_mov_itens (tenant_id, movimentacao_id, bem_id, papel,
      origem_unidade_id, origem_local_id, origem_ambiente, origem_sala, origem_responsavel_id, origem_situacao, origem_conservacao,
      destino_unidade_id, destino_local_id, destino_ambiente, destino_sala, destino_responsavel_id, destino_situacao,
      confirmacao, confirmacao_tipo, confirmado_em, confirmado_por, confirmado_servidor_id, declaracao)
    values (p_tenant, v_id, b.id, v_papel, b.unidade_id, b.local_id, b.ambiente, b.sala, b.responsavel_id, b.situacao, b.conservacao,
      v_dest_un, v_dest_local, v_dest_amb, v_dest_sala, v_dest_resp, v_dest_sit,
      v_confirmacao, v_conf_tipo, case when v_confirmacao = 'CONFIRMADO' then now() end, case when v_confirmacao = 'CONFIRMADO' then auth.uid() end,
      case when v_conf_tipo = 'DIGITAL' then v_dest_resp end,
      case when v_conf_tipo = 'DIGITAL' then 'Declaro que recebi o bem patrimonial descrito, responsabilizando-me por sua guarda e conservação, conforme as normas institucionais aplicáveis.' end);
  end loop;

  if not patrimonio_tentar_concluir(v_id) then
    -- trava os bens até a conclusão
    update patrimonio_bens set movimentacao_pendente_id = v_id, situacao_antes_mov = situacao, situacao = 'EM_TRANSFERENCIA'
     where id in (select bem_id from patrimonio_mov_itens where movimentacao_id = v_id);
    perform notificar(p_tenant, v_pendentes, 'PATRIMONIO', 'CONFIRMAR_RECEBIMENTO',
      'Confirme o recebimento: movimentação ' || lpad(v_num::text, 4, '0') || '/' || v_ano,
      btrim(p ->> 'justificativa'), '/patrimonio/pendencias?m=' || v_id, v_id);
  end if;
  return v_id;
end $$;

-- Resposta de quem recebe (conta autenticada): aceitar confirma os itens destinados a ele; rejeitar encerra
create function public.patrimonio_responder(p_mov uuid, p_aceitar boolean, p_texto text default null) returns text
language plpgsql security definer set search_path = public as $$
declare m patrimonio_movimentacoes; v_meus int;
begin
  select * into m from patrimonio_movimentacoes where id = p_mov for update;
  if m.id is null or m.situacao not in ('AGUARDANDO_CONFIRMACAO', 'PENDENTE_REGULARIZACAO', 'CONFIRMADA_DESTINO') then
    raise exception 'Movimentação não encontrada ou já encerrada.' using errcode = 'check_violation';
  end if;
  select count(*) into v_meus from patrimonio_mov_itens i
   where i.movimentacao_id = p_mov and i.confirmacao = 'PENDENTE' and patrimonio_eu_servidor(i.destino_responsavel_id);
  if v_meus = 0 then
    raise exception 'Não há item desta movimentação aguardando a sua confirmação.' using errcode = 'insufficient_privilege';
  end if;
  if p_aceitar then
    update patrimonio_mov_itens i
       set confirmacao = 'CONFIRMADO', confirmacao_tipo = 'DIGITAL', confirmado_em = now(), confirmado_por = auth.uid(),
           confirmado_servidor_id = i.destino_responsavel_id,
           declaracao = coalesce(nullif(btrim(p_texto), ''), 'Declaro que recebi o bem patrimonial descrito, responsabilizando-me por sua guarda e conservação, conforme as normas institucionais aplicáveis.')
     where i.movimentacao_id = p_mov and i.confirmacao = 'PENDENTE' and patrimonio_eu_servidor(i.destino_responsavel_id);
    if patrimonio_tentar_concluir(p_mov) then return 'CONCLUIDA'; end if;
    update patrimonio_movimentacoes set situacao = 'CONFIRMADA_DESTINO' where id = p_mov and situacao = 'AGUARDANDO_CONFIRMACAO';
    return 'PARCIAL';
  end if;
  if length(btrim(coalesce(p_texto, ''))) < 5 then
    raise exception 'Informe o motivo da rejeição (mínimo de 5 caracteres).' using errcode = 'check_violation', hint = 'motivo';
  end if;
  perform usar_justificativa(p_texto, 5);
  update patrimonio_mov_itens i set confirmacao = 'REJEITADO', confirmado_em = now(), confirmado_por = auth.uid(), declaracao = btrim(p_texto)
   where i.movimentacao_id = p_mov and i.confirmacao = 'PENDENTE' and patrimonio_eu_servidor(i.destino_responsavel_id);
  update patrimonio_movimentacoes set situacao = 'REJEITADA', rejeitada_em = now(), rejeitada_por = auth.uid(), motivo_rejeicao = btrim(p_texto) where id = p_mov;
  perform patrimonio_liberar(p_mov);
  perform notificar(m.tenant_id, array[m.solicitante_id], 'PATRIMONIO', 'MOVIMENTACAO_REJEITADA',
    'Movimentação ' || lpad(m.numero::text, 4, '0') || '/' || m.ano || ' rejeitada', btrim(p_texto), '/patrimonio/movimentacoes?m=' || m.id, m.id);
  return 'REJEITADA';
end $$;

-- Confirmação pela administração patrimonial do destino: com documento físico assinado (quando há novo
-- responsável que não confirmou digitalmente) ou administrativa (quando não há novo responsável)
create function public.patrimonio_confirmar_administrativo(p_mov uuid, p_documento uuid default null, p_observacao text default null) returns text
language plpgsql security definer set search_path = public as $$
declare m patrimonio_movimentacoes; i patrimonio_mov_itens; v_doc boolean;
begin
  select * into m from patrimonio_movimentacoes where id = p_mov for update;
  if m.id is null or m.situacao not in ('AGUARDANDO_CONFIRMACAO', 'PENDENTE_REGULARIZACAO', 'CONFIRMADA_DESTINO') then
    raise exception 'Movimentação não encontrada ou já encerrada.' using errcode = 'check_violation';
  end if;
  v_doc := p_documento is not null and exists (select 1 from documentos d where d.id = p_documento and d.recurso = 'patrimonio'
              and d.registro_id = p_mov and d.excluido_em is null and d.categoria = 'TERMO_ASSINADO');
  if p_documento is not null and not v_doc then
    raise exception 'Anexe à movimentação o termo assinado (digitalizado) antes de confirmar.' using errcode = 'check_violation', hint = 'documento';
  end if;
  for i in select * from patrimonio_mov_itens where movimentacao_id = p_mov and confirmacao = 'PENDENTE' loop
    if not pode(m.tenant_id, i.destino_unidade_id, 'patrimonio', 'aprovar') then
      raise exception 'Somente a administração patrimonial do destino confirma pela administração.' using errcode = 'insufficient_privilege';
    end if;
    if i.destino_responsavel_id is not null and i.destino_responsavel_id is distinct from i.origem_responsavel_id and not v_doc then
      raise exception 'Este item tem novo responsável: confirme pelo aceite dele no sistema ou anexe o termo físico assinado.'
        using errcode = 'check_violation', hint = 'documento';
    end if;
    update patrimonio_mov_itens set confirmacao = 'CONFIRMADO', confirmado_em = now(), confirmado_por = auth.uid(),
           confirmacao_tipo = case when v_doc then 'DOCUMENTO_FISICO' else 'ADMINISTRATIVA' end,
           confirmado_servidor_id = case when v_doc then i.destino_responsavel_id end,
           declaracao = nullif(btrim(coalesce(p_observacao, '')), '')
     where id = i.id;
  end loop;
  if v_doc then update patrimonio_movimentacoes set conferido_em = now(), conferido_por = auth.uid() where id = p_mov; end if;
  if patrimonio_tentar_concluir(p_mov) then return 'CONCLUIDA'; end if;
  return 'PARCIAL';
end $$;

create function public.patrimonio_cancelar(p_mov uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare m patrimonio_movimentacoes;
begin
  select * into m from patrimonio_movimentacoes where id = p_mov for update;
  if m.id is null or m.situacao in ('CONCLUIDA', 'CANCELADA', 'REJEITADA') then
    raise exception 'Movimentação não encontrada ou já encerrada.' using errcode = 'check_violation';
  end if;
  if m.solicitante_id <> auth.uid() and not pode(m.tenant_id, m.unidade_id, 'patrimonio', 'aprovar') then
    raise exception 'Só quem solicitou ou a administração patrimonial cancela.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_motivo, 5);
  update patrimonio_movimentacoes set situacao = 'CANCELADA', cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = btrim(p_motivo) where id = p_mov;
  perform patrimonio_liberar(p_mov);
end $$;

-- Retificação: movimentação nova que desfaz uma concluída (a original é preservada e fica marcada)
create function public.patrimonio_retificar(p_mov uuid, p_justificativa text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m patrimonio_movimentacoes; v_it patrimonio_mov_itens; b patrimonio_bens; v_id uuid := gen_random_uuid(); v_num int; v_ano int;
begin
  select * into m from patrimonio_movimentacoes where id = p_mov for update;
  if m.id is null or m.situacao <> 'CONCLUIDA' or m.retificada_por_id is not null then
    raise exception 'Só uma movimentação concluída e ainda não retificada pode ser retificada.' using errcode = 'check_violation';
  end if;
  if not pode(m.tenant_id, m.unidade_id, 'patrimonio', 'aprovar') then
    raise exception 'Somente a administração patrimonial retifica movimentações.' using errcode = 'insufficient_privilege';
  end if;
  perform usar_justificativa(p_justificativa, 10);
  for v_it in select * from patrimonio_mov_itens where movimentacao_id = p_mov loop
    select * into b from patrimonio_bens where id = v_it.bem_id for update;
    if b.movimentacao_pendente_id is not null or b.unidade_id <> v_it.destino_unidade_id or b.responsavel_id is distinct from v_it.destino_responsavel_id
       or b.situacao <> v_it.destino_situacao then
      raise exception 'O bem % já mudou depois desta movimentação; registre uma nova movimentação em vez de retificar.', b.numero using errcode = 'check_violation';
    end if;
  end loop;
  v_ano := extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
  perform pg_advisory_xact_lock(hashtext('patrimonio_mov:' || m.tenant_id || ':' || v_ano));
  select coalesce(max(numero), 0) + 1 into v_num from patrimonio_movimentacoes where tenant_id = m.tenant_id and ano = v_ano;
  insert into patrimonio_movimentacoes (id, tenant_id, numero, ano, tipo, situacao, unidade_id, unidade_destino_id, justificativa, solicitante_id, retifica_id)
  values (v_id, m.tenant_id, v_num, v_ano, 'RETIFICACAO', 'AGUARDANDO_CONFIRMACAO', m.unidade_destino_id, m.unidade_id, btrim(p_justificativa), auth.uid(), m.id);
  insert into patrimonio_mov_itens (tenant_id, movimentacao_id, bem_id, papel,
    origem_unidade_id, origem_local_id, origem_ambiente, origem_sala, origem_responsavel_id, origem_situacao, origem_conservacao,
    destino_unidade_id, destino_local_id, destino_ambiente, destino_sala, destino_responsavel_id, destino_situacao,
    confirmacao, confirmacao_tipo, confirmado_em, confirmado_por)
  select i.tenant_id, v_id, i.bem_id, i.papel, i.destino_unidade_id, i.destino_local_id, i.destino_ambiente, i.destino_sala, i.destino_responsavel_id,
         i.destino_situacao, b2.conservacao, i.origem_unidade_id, i.origem_local_id, i.origem_ambiente, i.origem_sala, i.origem_responsavel_id,
         i.origem_situacao, 'CONFIRMADO', 'ADMINISTRATIVA', now(), auth.uid()
    from patrimonio_mov_itens i join patrimonio_bens b2 on b2.id = i.bem_id where i.movimentacao_id = p_mov;
  perform patrimonio_aplicar(v_id);
  update patrimonio_movimentacoes set retificada_por_id = v_id where id = p_mov;
  return v_id;
end $$;

-- Movimentação concluída, rejeitada ou cancelada não muda mais (só a marca de retificação e o termo)
create function public.patrimonio_protege_mov() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.situacao in ('CONCLUIDA', 'CANCELADA', 'REJEITADA')
     and (to_jsonb(new) - 'retificada_por_id' - 'termo_emitido_em' - 'termo_emitido_por' - 'atualizado_em' - 'atualizado_por')
      <> (to_jsonb(old) - 'retificada_por_id' - 'termo_emitido_em' - 'termo_emitido_por' - 'atualizado_em' - 'atualizado_por') then
    raise exception 'Movimentação encerrada não pode ser alterada; use a retificação.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger patrimonio_mov_protege before update on public.patrimonio_movimentacoes for each row execute function public.patrimonio_protege_mov();

-- Termo físico: devolve os dados do documento (o PDF é montado no navegador) e marca a emissão
create function public.patrimonio_termo(p_mov uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m patrimonio_movimentacoes;
begin
  select * into m from patrimonio_movimentacoes where id = p_mov;
  if m.id is null or not patrimonio_mov_legivel(p_mov) then raise exception 'Movimentação não encontrada.' using errcode = 'no_data_found'; end if;
  update patrimonio_movimentacoes set termo_emitido_em = now(), termo_emitido_por = auth.uid(),
         situacao = case when situacao = 'AGUARDANDO_CONFIRMACAO' then 'PENDENTE_REGULARIZACAO' else situacao end
   where id = p_mov;
  perform registrar_auditoria(m.tenant_id, 'patrimonio_movimentacoes', p_mov::text, 'EXPORTACAO', null, jsonb_build_object('documento', 'TERMO'));
  return patrimonio_movimentacao(p_mov);
end $$;

-- =====================================================================
-- Responsabilidade (alteração direta pelo setor) — atalho da movimentação RESPONSABILIDADE
-- =====================================================================

-- =====================================================================
-- Inventário
-- =====================================================================

create function public.patrimonio_abrir_inventario(p_tenant uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_un uuid := nullif(p ->> 'unidade_id', '')::uuid; v_local uuid := nullif(p ->> 'local_id', '')::uuid;
begin
  if v_un is null or not exists (select 1 from unidades_organizacionais where id = v_un and tenant_id = p_tenant) then
    raise exception 'Escolha a unidade (diretoria, coordenação ou setor) do inventário.' using errcode = 'check_violation', hint = 'unidade_id';
  end if;
  if not pode(p_tenant, v_un, 'patrimonio', 'editar') then
    raise exception 'Você não tem permissão para inventariar esta unidade.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p ->> 'titulo', ''))) < 3 then raise exception 'Informe o título do inventário.' using errcode = 'check_violation', hint = 'titulo'; end if;
  insert into patrimonio_inventarios (tenant_id, titulo, unidade_id, local_id, responsavel_id, observacoes)
  values (p_tenant, btrim(p ->> 'titulo'), v_un, v_local, auth.uid(), nullif(btrim(p ->> 'observacoes'), '')) returning id into v_id;
  insert into patrimonio_inventario_itens (tenant_id, inventario_id, bem_id)
  select p_tenant, v_id, b.id from patrimonio_bens b join unidades_organizacionais u on u.id = b.unidade_id
   where b.tenant_id = p_tenant and v_un = any(u.caminho) and b.situacao <> 'BAIXADO' and (v_local is null or b.local_id = v_local);
  return v_id;
end $$;

create function public.patrimonio_conferir(p_item uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it patrimonio_inventario_itens; v patrimonio_inventarios; v_status text := p ->> 'status'; v_cons text := nullif(p ->> 'conservacao', '');
begin
  select * into it from patrimonio_inventario_itens where id = p_item;
  select * into v from patrimonio_inventarios where id = it.inventario_id;
  if v.id is null or not pode(v.tenant_id, v.unidade_id, 'patrimonio', 'editar') then
    raise exception 'Item de inventário não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if v.situacao <> 'ABERTO' then raise exception 'Inventário encerrado não pode ser alterado.' using errcode = 'check_violation'; end if;
  if v_status not in ('PENDENTE', 'LOCALIZADO', 'NAO_LOCALIZADO', 'DIVERGENCIA', 'NECESSITA_AVALIACAO') or (it.bem_id is null and v_status <> 'SEM_CADASTRO' and false) then
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
  -- avaliação feita no inventário atualiza o estado de conservação do bem
  if v_cons is not null then
    update patrimonio_bens set conservacao = v_cons, data_ultima_avaliacao = hoje() where id = it.bem_id;
  end if;
end $$;

create function public.patrimonio_bem_sem_cadastro(p_inventario uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v patrimonio_inventarios; v_id uuid;
begin
  select * into v from patrimonio_inventarios where id = p_inventario;
  if v.id is null or not pode(v.tenant_id, v.unidade_id, 'patrimonio', 'editar') then
    raise exception 'Inventário não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if v.situacao <> 'ABERTO' then raise exception 'Inventário encerrado não pode ser alterado.' using errcode = 'check_violation'; end if;
  if length(btrim(coalesce(p ->> 'descricao', ''))) < 3 then raise exception 'Descreva o bem encontrado.' using errcode = 'check_violation', hint = 'descricao'; end if;
  insert into patrimonio_inventario_itens (tenant_id, inventario_id, status, numero_encontrado, descricao_encontrada, observacao, conferido_por, conferido_em)
  values (v.tenant_id, v.id, 'SEM_CADASTRO', nullif(btrim(p ->> 'numero'), ''), btrim(p ->> 'descricao'), nullif(btrim(p ->> 'observacao'), ''), auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;

create function public.patrimonio_encerrar_inventario(p_inventario uuid, p_cancelar boolean default false, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v patrimonio_inventarios;
begin
  select * into v from patrimonio_inventarios where id = p_inventario for update;
  if v.id is null or not pode(v.tenant_id, v.unidade_id, 'patrimonio', 'editar') then
    raise exception 'Inventário não encontrado ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if v.situacao <> 'ABERTO' then raise exception 'O inventário já foi encerrado.' using errcode = 'check_violation'; end if;
  if p_cancelar then perform usar_justificativa(p_motivo, 5); end if;
  update patrimonio_inventarios set situacao = case when p_cancelar then 'CANCELADO' else 'CONCLUIDO' end, concluido_em = now(),
         observacoes = case when p_cancelar then concat_ws(E'\n', observacoes, 'Cancelado: ' || btrim(p_motivo)) else observacoes end
   where id = p_inventario;
end $$;

create function public.patrimonio_inventario(p_inventario uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v patrimonio_inventarios;
begin
  select * into v from patrimonio_inventarios where id = p_inventario;
  if v.id is null or not pode(v.tenant_id, v.unidade_id, 'patrimonio', 'ler') then raise exception 'Inventário não encontrado.' using errcode = 'no_data_found'; end if;
  return to_jsonb(v) || jsonb_build_object(
    'unidade', conecta_hierarquia(v.unidade_id), 'local', (select nome from unidades_atendidas where id = v.local_id),
    'responsavel', (select nome from perfis where id = v.responsavel_id),
    'pode_editar', v.situacao = 'ABERTO' and pode(v.tenant_id, v.unidade_id, 'patrimonio', 'editar'),
    'resumo', (select jsonb_object_agg(status, n) from (select status, count(*) n from patrimonio_inventario_itens where inventario_id = v.id group by 1) s),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'conservacao_avaliada', i.conservacao_avaliada,
        'observacao', i.observacao, 'numero_encontrado', i.numero_encontrado, 'descricao_encontrada', i.descricao_encontrada,
        'conferido_em', i.conferido_em, 'conferido_por', (select nome from perfis where id = i.conferido_por),
        'bem', case when b.id is not null then jsonb_build_object('id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'conservacao', b.conservacao,
                 'sala', b.sala, 'local', (select nome from unidades_atendidas where id = b.local_id), 'unidade', (select coalesce(sigla, nome) from unidades_organizacionais where id = b.unidade_id),
                 'responsavel', (select nome from servidores where id = b.responsavel_id)) end)
        order by b.numero nulls last, i.descricao_encontrada)
      from patrimonio_inventario_itens i left join patrimonio_bens b on b.id = i.bem_id where i.inventario_id = v.id), '[]'));
end $$;

-- =====================================================================
-- Consultas
-- =====================================================================

-- Bens que quem chama pode ver no órgão: escopo da matriz ou bens sob a sua guarda
create function public.patrimonio_bens_visiveis(p_tenant uuid) returns setof public.patrimonio_bens
language sql stable security definer set search_path = public as $$
  select b.* from patrimonio_bens b
   where b.tenant_id = p_tenant
     and ((b.tenant_id, b.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('patrimonio', 'ler') a)
          or (b.responsavel_id in (select s.id from servidores s where s.user_id = auth.uid() and s.tenant_id = p_tenant) and membro_do_tenant(p_tenant)))
$$;

-- Busca de bens com filtros combináveis; p: busca, categoria_id, subcategoria_id, unidade_id (inclui abaixo), local_id,
-- responsavel_id, situacoes[], conservacoes[], meus, sem_responsavel, incluir_baixados, numero, limite, offset
create function public.patrimonio_buscar(p_tenant uuid, p jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_like text; v_res jsonb; v_lim int := least(greatest(coalesce((p ->> 'limite')::int, 25), 1), 5000); v_off int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
begin
  if nullif(btrim(p ->> 'busca'), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(p ->> 'busca')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with f as (
    select b.* from patrimonio_bens_visiveis(p_tenant) b
      join unidades_organizacionais u on u.id = b.unidade_id
     where (v_like is null or lower(b.numero || ' ' || b.descricao || ' ' || coalesce(b.marca, '') || ' ' || coalesce(b.modelo, '') || ' ' || coalesce(b.numero_serie, '')) like v_like)
       and (nullif(p ->> 'numero', '') is null or lower(b.numero) = lower(btrim(p ->> 'numero')))
       and (nullif(p ->> 'categoria_id', '') is null or b.categoria_id = (p ->> 'categoria_id')::uuid)
       and (nullif(p ->> 'subcategoria_id', '') is null or b.subcategoria_id = (p ->> 'subcategoria_id')::uuid)
       and (nullif(p ->> 'unidade_id', '') is null or (p ->> 'unidade_id')::uuid = any(u.caminho))
       and (nullif(p ->> 'local_id', '') is null or b.local_id = (p ->> 'local_id')::uuid)
       and (nullif(p ->> 'responsavel_id', '') is null or b.responsavel_id = (p ->> 'responsavel_id')::uuid)
       and (jsonb_array_length(coalesce(p -> 'situacoes', '[]')) = 0 or b.situacao in (select jsonb_array_elements_text(p -> 'situacoes')))
       and (jsonb_array_length(coalesce(p -> 'conservacoes', '[]')) = 0 or b.conservacao in (select jsonb_array_elements_text(p -> 'conservacoes')))
       and (not coalesce((p ->> 'meus')::boolean, false) or b.responsavel_id in (select id from servidores where user_id = auth.uid()))
       and (not coalesce((p ->> 'sem_responsavel')::boolean, false) or b.responsavel_id is null)
       and (coalesce((p ->> 'incluir_baixados')::boolean, false) or b.situacao <> 'BAIXADO'
            or jsonb_array_length(coalesce(p -> 'situacoes', '[]')) > 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'marca', b.marca, 'modelo', b.modelo, 'numero_serie', b.numero_serie,
        'quantidade', b.quantidade, 'valor_aquisicao', b.valor_aquisicao, 'data_aquisicao', b.data_aquisicao,
        'categoria', c.nome, 'subcategoria', sc.nome, 'categoria_id', b.categoria_id,
        'unidade_id', b.unidade_id, 'unidade', conecta_hierarquia(b.unidade_id),
        'local_id', b.local_id, 'local', ua.nome, 'ambiente', b.ambiente, 'sala', b.sala,
        'responsavel_id', b.responsavel_id, 'responsavel', s.nome, 'responsavel_matricula', s.matricula,
        'conservacao', b.conservacao, 'situacao', b.situacao, 'funcionamento', b.funcionamento,
        'pendente', b.movimentacao_pendente_id is not null, 'criado_em', b.criado_em,
        'meu', b.responsavel_id is not null and s.user_id = auth.uid())
        order by lower(b.numero))
      from (select * from f order by lower(numero) limit v_lim offset v_off) b
      join patrimonio_categorias c on c.id = b.categoria_id
      left join patrimonio_categorias sc on sc.id = b.subcategoria_id
      left join unidades_atendidas ua on ua.id = b.local_id
      left join servidores s on s.id = b.responsavel_id), '[]'))
  into v_res;
  return v_res;
end $$;

create function public.patrimonio_movimentacao(p_mov uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m patrimonio_movimentacoes;
begin
  select * into m from patrimonio_movimentacoes where id = p_mov;
  if m.id is null or not patrimonio_mov_legivel(p_mov) then raise exception 'Movimentação não encontrada.' using errcode = 'no_data_found'; end if;
  return to_jsonb(m) || jsonb_build_object(
    'codigo', lpad(m.numero::text, 4, '0') || '/' || m.ano,
    'solicitante', (select nome from perfis where id = m.solicitante_id),
    'solicitante_matricula', (select matricula from servidores where id = m.solicitante_servidor_id),
    'termo_emitido_por_nome', (select nome from perfis where id = m.termo_emitido_por),
    'conferido_por_nome', (select nome from perfis where id = m.conferido_por),
    'rejeitada_por_nome', (select nome from perfis where id = m.rejeitada_por),
    'retifica_codigo', (select lpad(numero::text, 4, '0') || '/' || ano from patrimonio_movimentacoes where id = m.retifica_id),
    'retificada_por_codigo', (select lpad(numero::text, 4, '0') || '/' || ano from patrimonio_movimentacoes where id = m.retificada_por_id),
    'aguarda_minha_confirmacao', exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = m.id and i.confirmacao = 'PENDENTE' and patrimonio_eu_servidor(i.destino_responsavel_id)),
    'posso_confirmar_adm', m.situacao in ('AGUARDANDO_CONFIRMACAO', 'PENDENTE_REGULARIZACAO', 'CONFIRMADA_DESTINO')
                           and exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = m.id and i.confirmacao = 'PENDENTE')
                           and not exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = m.id and i.confirmacao = 'PENDENTE'
                                            and not pode(m.tenant_id, i.destino_unidade_id, 'patrimonio', 'aprovar')),
    'posso_cancelar', m.situacao not in ('CONCLUIDA', 'CANCELADA', 'REJEITADA') and (m.solicitante_id = auth.uid() or pode(m.tenant_id, m.unidade_id, 'patrimonio', 'aprovar')),
    'posso_retificar', m.situacao = 'CONCLUIDA' and m.retificada_por_id is null and m.tipo <> 'RETIFICACAO' and pode(m.tenant_id, m.unidade_id, 'patrimonio', 'aprovar'),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'papel', i.papel, 'bem_id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'categoria', c.nome, 'conservacao', i.origem_conservacao,
        'origem', jsonb_build_object('unidade', conecta_hierarquia(i.origem_unidade_id), 'local', (select nome from unidades_atendidas where id = i.origem_local_id),
                                     'ambiente', i.origem_ambiente, 'sala', i.origem_sala, 'situacao', i.origem_situacao,
                                     'responsavel', (select jsonb_build_object('nome', nome, 'matricula', matricula, 'cargo', cargo) from servidores where id = i.origem_responsavel_id)),
        'destino', jsonb_build_object('unidade', conecta_hierarquia(i.destino_unidade_id), 'local', (select nome from unidades_atendidas where id = i.destino_local_id),
                                      'ambiente', i.destino_ambiente, 'sala', i.destino_sala, 'situacao', i.destino_situacao,
                                      'responsavel', (select jsonb_build_object('nome', nome, 'matricula', matricula, 'cargo', cargo) from servidores where id = i.destino_responsavel_id)),
        'confirmacao', i.confirmacao, 'confirmacao_tipo', i.confirmacao_tipo, 'confirmado_em', i.confirmado_em,
        'confirmado_por', (select nome from perfis where id = i.confirmado_por),
        'confirmado_matricula', (select matricula from servidores where id = i.confirmado_servidor_id), 'declaracao', i.declaracao)
        order by i.papel)
      from patrimonio_mov_itens i join patrimonio_bens b on b.id = i.bem_id join patrimonio_categorias c on c.id = b.categoria_id
      where i.movimentacao_id = m.id), '[]'));
end $$;

-- Lista de movimentações; p: tipos[], situacoes[], de, ate, bem_id, unidade_id, para_mim, pendentes, limite, offset
create function public.patrimonio_movimentacoes_lista(p_tenant uuid, p jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb; v_lim int := least(greatest(coalesce((p ->> 'limite')::int, 25), 1), 5000); v_off int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
begin
  with f as (
    select m.* from patrimonio_movimentacoes m
     where m.tenant_id = p_tenant and patrimonio_mov_legivel(m.id)
       and (jsonb_array_length(coalesce(p -> 'tipos', '[]')) = 0 or m.tipo in (select jsonb_array_elements_text(p -> 'tipos')))
       and (jsonb_array_length(coalesce(p -> 'situacoes', '[]')) = 0 or m.situacao in (select jsonb_array_elements_text(p -> 'situacoes')))
       and (nullif(p ->> 'de', '') is null or (m.criado_em at time zone 'America/Sao_Paulo')::date >= (p ->> 'de')::date)
       and (nullif(p ->> 'ate', '') is null or (m.criado_em at time zone 'America/Sao_Paulo')::date <= (p ->> 'ate')::date)
       and (nullif(p ->> 'bem_id', '') is null or exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = m.id and i.bem_id = (p ->> 'bem_id')::uuid))
       and (nullif(p ->> 'unidade_id', '') is null or exists (select 1 from unidades_organizacionais u where u.id in (m.unidade_id, m.unidade_destino_id) and (p ->> 'unidade_id')::uuid = any(u.caminho)))
       and (not coalesce((p ->> 'para_mim')::boolean, false) or exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = m.id and i.confirmacao = 'PENDENTE' and patrimonio_eu_servidor(i.destino_responsavel_id)))
       and (not coalesce((p ->> 'pendentes')::boolean, false) or m.situacao in ('AGUARDANDO_CONFIRMACAO', 'PENDENTE_REGULARIZACAO', 'CONFIRMADA_DESTINO'))
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'codigo', lpad(m.numero::text, 4, '0') || '/' || m.ano, 'tipo', m.tipo, 'situacao', m.situacao, 'criado_em', m.criado_em,
        'concluida_em', m.concluida_em, 'justificativa', m.justificativa, 'solicitante', (select nome from perfis where id = m.solicitante_id),
        'origem', conecta_hierarquia(m.unidade_id), 'destino', conecta_hierarquia(m.unidade_destino_id),
        'termo_emitido', m.termo_emitido_em is not null, 'retificada', m.retificada_por_id is not null,
        'bens', (select jsonb_agg(jsonb_build_object('numero', b.numero, 'descricao', b.descricao, 'papel', i.papel, 'confirmacao', i.confirmacao,
                   'origem_responsavel', (select nome from servidores where id = i.origem_responsavel_id),
                   'destino_responsavel', (select nome from servidores where id = i.destino_responsavel_id),
                   'origem_local', (select nome from unidades_atendidas where id = i.origem_local_id),
                   'destino_local', (select nome from unidades_atendidas where id = i.destino_local_id)) order by i.papel)
                 from patrimonio_mov_itens i join patrimonio_bens b on b.id = i.bem_id where i.movimentacao_id = m.id),
        'aguarda_minha_confirmacao', exists (select 1 from patrimonio_mov_itens i where i.movimentacao_id = m.id and i.confirmacao = 'PENDENTE' and patrimonio_eu_servidor(i.destino_responsavel_id)))
        order by m.criado_em desc)
      from (select * from f order by criado_em desc limit v_lim offset v_off) m), '[]'))
  into v_res;
  return v_res;
end $$;

-- Ficha completa do bem: dados, histórico de movimentações e de responsáveis, inventários e auditoria
create function public.patrimonio_ficha(p_bem uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b patrimonio_bens;
begin
  select * into b from patrimonio_bens where id = p_bem;
  if b.id is null or not patrimonio_bem_legivel(p_bem) then raise exception 'Bem patrimonial não encontrado.' using errcode = 'no_data_found'; end if;
  return to_jsonb(b) || jsonb_build_object(
    'categoria', (select nome from patrimonio_categorias where id = b.categoria_id),
    'subcategoria', (select nome from patrimonio_categorias where id = b.subcategoria_id),
    'fornecedor', (select coalesce(razao_social, nome_fantasia) from fornecedores where id = b.fornecedor_id),
    'unidade', conecta_hierarquia(b.unidade_id),
    'local', (select jsonb_build_object('nome', nome, 'tipo', tipo, 'endereco', nullif(concat_ws(', ', logradouro, numero, bairro, cidade), '')) from unidades_atendidas where id = b.local_id),
    'responsavel', (select jsonb_build_object('id', s.id, 'nome', s.nome, 'matricula', s.matricula, 'cargo', s.cargo, 'funcao', s.funcao, 'lotacao', conecta_hierarquia(s.unidade_id))
                      from servidores s where s.id = b.responsavel_id),
    'pode_editar', pode(b.tenant_id, b.unidade_id, 'patrimonio', 'editar'),
    'pode_movimentar', b.situacao <> 'BAIXADO' and b.movimentacao_pendente_id is null
                       and (pode(b.tenant_id, b.unidade_id, 'patrimonio', 'criar') or patrimonio_eu_servidor(b.responsavel_id)),
    'pode_baixar', b.situacao <> 'BAIXADO' and b.movimentacao_pendente_id is null and pode(b.tenant_id, b.unidade_id, 'patrimonio', 'aprovar'),
    'movimentacao_pendente', (select lpad(numero::text, 4, '0') || '/' || ano from patrimonio_movimentacoes where id = b.movimentacao_pendente_id),
    'movimentacoes', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'codigo', lpad(m.numero::text, 4, '0') || '/' || m.ano, 'tipo', m.tipo,
        'situacao', m.situacao, 'criado_em', m.criado_em, 'concluida_em', m.concluida_em, 'justificativa', m.justificativa, 'papel', i.papel,
        'solicitante', (select nome from perfis where id = m.solicitante_id),
        'origem', coalesce((select coalesce(sigla, nome) from unidades_organizacionais where id = i.origem_unidade_id), '') ||
                  coalesce(' · ' || (select nome from unidades_atendidas where id = i.origem_local_id), '') || coalesce(' · ' || i.origem_sala, ''),
        'destino', coalesce((select coalesce(sigla, nome) from unidades_organizacionais where id = i.destino_unidade_id), '') ||
                  coalesce(' · ' || (select nome from unidades_atendidas where id = i.destino_local_id), '') || coalesce(' · ' || i.destino_sala, ''),
        'responsavel_anterior', (select nome from servidores where id = i.origem_responsavel_id),
        'novo_responsavel', (select nome from servidores where id = i.destino_responsavel_id),
        'confirmacao', i.confirmacao, 'confirmacao_tipo', i.confirmacao_tipo, 'confirmado_em', i.confirmado_em,
        'confirmado_por', (select nome from perfis where id = i.confirmado_por),
        'documentos', (select count(*) from documentos d where d.recurso = 'patrimonio' and d.registro_id = m.id and d.excluido_em is null))
        order by m.criado_em desc)
      from patrimonio_mov_itens i join patrimonio_movimentacoes m on m.id = i.movimentacao_id where i.bem_id = b.id), '[]'),
    'responsaveis', coalesce((select jsonb_agg(jsonb_build_object('servidor', s.nome, 'matricula', s.matricula,
        'unidade', (select coalesce(sigla, nome) from unidades_organizacionais where id = r.unidade_id),
        'local', (select nome from unidades_atendidas where id = r.local_id), 'inicio', r.inicio, 'fim', r.fim, 'motivo', r.motivo,
        'registrado_por', (select nome from perfis where id = r.registrado_por)) order by r.inicio desc)
      from patrimonio_responsabilidades r left join servidores s on s.id = r.servidor_id where r.bem_id = b.id), '[]'),
    'inventarios', coalesce((select jsonb_agg(jsonb_build_object('titulo', v.titulo, 'status', i.status, 'conferido_em', i.conferido_em,
        'conservacao_avaliada', i.conservacao_avaliada, 'observacao', i.observacao) order by v.iniciado_em desc)
      from patrimonio_inventario_itens i join patrimonio_inventarios v on v.id = i.inventario_id where i.bem_id = b.id), '[]'),
    'auditoria', case when pode(b.tenant_id, b.unidade_id, 'patrimonio', 'aprovar') or pode(b.tenant_id, null, 'auditoria', 'ler') then
      coalesce((select jsonb_agg(jsonb_build_object('criado_em', a.criado_em, 'acao', a.acao, 'usuario', a.usuario_email,
          'campos', a.campos_alterados, 'antes', a.antes, 'depois', a.depois, 'justificativa', a.justificativa) order by a.id desc)
        from auditoria a where a.entidade = 'patrimonio_bens' and a.registro_id = b.id::text), '[]') end);
end $$;

-- Painel: totais por situação, conservação, categoria, unidade de saúde, diretoria, coordenação e responsável
create function public.patrimonio_painel(p_tenant uuid, p_unidade uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (
    select v.*, u.caminho from patrimonio_bens_visiveis(p_tenant) v join unidades_organizacionais u on u.id = v.unidade_id
     where p_unidade is null or p_unidade = any(u.caminho)),
  dir as (select b.id, (select coalesce(a.sigla, a.nome) from unidades_organizacionais a where a.id = any(b.caminho) and a.tipo = 'DIRETORIA' limit 1) nome from b),
  coord as (select b.id, (select coalesce(a.sigla, a.nome) from unidades_organizacionais a where a.id = any(b.caminho) and a.tipo = 'COORDENACAO' limit 1) nome from b)
  select jsonb_build_object(
    'total', (select count(*) from b where situacao <> 'BAIXADO'),
    'valor_total', (select coalesce(sum(valor_aquisicao), 0) from b where situacao <> 'BAIXADO'),
    'por_situacao', coalesce((select jsonb_object_agg(situacao, n) from (select situacao, count(*) n from b group by 1) x), '{}'),
    'por_conservacao', coalesce((select jsonb_object_agg(conservacao, n) from (select conservacao, count(*) n from b where situacao <> 'BAIXADO' group by 1) x), '{}'),
    'danificados', (select count(*) from b where situacao <> 'BAIXADO' and conservacao in ('DANIFICADO', 'RUIM', 'PESSIMO', 'IRRECUPERAVEL', 'NECESSITA_MANUTENCAO')),
    'sem_responsavel', (select count(*) from b where situacao not in ('BAIXADO') and responsavel_id is null),
    'por_categoria', coalesce((select jsonb_agg(jsonb_build_object('nome', c.nome, 'total', x.n) order by x.n desc)
       from (select categoria_id, count(*) n from b where situacao <> 'BAIXADO' group by 1) x join patrimonio_categorias c on c.id = x.categoria_id), '[]'),
    'por_local', coalesce((select jsonb_agg(jsonb_build_object('id', x.local_id, 'nome', coalesce(ua.nome, 'Sem unidade informada'), 'total', x.n) order by x.n desc)
       from (select local_id, count(*) n from b where situacao <> 'BAIXADO' group by 1) x left join unidades_atendidas ua on ua.id = x.local_id), '[]'),
    'por_diretoria', coalesce((select jsonb_agg(jsonb_build_object('nome', coalesce(x.nome, 'Fora de diretoria'), 'total', x.n) order by x.n desc)
       from (select d.nome, count(*) n from b join dir d on d.id = b.id where b.situacao <> 'BAIXADO' group by 1) x), '[]'),
    'por_coordenacao', coalesce((select jsonb_agg(jsonb_build_object('nome', coalesce(x.nome, 'Fora de coordenação'), 'total', x.n) order by x.n desc)
       from (select c.nome, count(*) n from b join coord c on c.id = b.id where b.situacao <> 'BAIXADO' group by 1) x), '[]'),
    'por_responsavel', coalesce((select jsonb_agg(jsonb_build_object('id', x.responsavel_id, 'nome', s.nome, 'matricula', s.matricula, 'total', x.n) order by x.n desc)
       from (select responsavel_id, count(*) n from b where situacao <> 'BAIXADO' and responsavel_id is not null group by 1 order by 2 desc limit 15) x
       join servidores s on s.id = x.responsavel_id), '[]'),
    'pendencias', (select count(*) from patrimonio_movimentacoes m where m.tenant_id = p_tenant
                     and m.situacao in ('AGUARDANDO_CONFIRMACAO', 'PENDENTE_REGULARIZACAO', 'CONFIRMADA_DESTINO') and patrimonio_mov_legivel(m.id)),
    'aguardando_mim', (select count(distinct i.movimentacao_id) from patrimonio_mov_itens i join patrimonio_movimentacoes m on m.id = i.movimentacao_id
                        where m.tenant_id = p_tenant and i.confirmacao = 'PENDENTE' and patrimonio_eu_servidor(i.destino_responsavel_id)))
$$;

-- Relatório emitido: número anual, nome do arquivo e linha em documentos (o PDF é enviado em seguida)
create function public.patrimonio_registrar_relatorio(p_tenant uuid, p_tipo text, p_titulo text, p_filtros jsonb, p_tamanho bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ano int := extract(year from (now() at time zone 'America/Sao_Paulo'))::int; v_seq int; v_nome text; v_id uuid := gen_random_uuid(); v_doc documentos;
begin
  if not pode(p_tenant, null, 'patrimonio', 'exportar') then
    raise exception 'Você não tem permissão para emitir relatórios de patrimônio.' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('patrimonio_rel:' || p_tenant || ':' || v_ano));
  select coalesce(max(sequencia), 0) + 1 into v_seq from patrimonio_relatorios where tenant_id = p_tenant and ano = v_ano;
  v_nome := 'RELATORIO DE PATRIMONIO - ANO ' || v_ano || case when v_seq = 1 then '' else ' - ' || lpad((v_seq - 1)::text, 3, '0') end || '.pdf';
  insert into documentos (tenant_id, unidade_id, recurso, registro_id, categoria, nome_arquivo, mime, tamanho)
  values (p_tenant, null, 'patrimonio', v_id, 'RELATORIO', v_nome, 'application/pdf', p_tamanho) returning * into v_doc;
  insert into patrimonio_relatorios (id, tenant_id, ano, sequencia, tipo, titulo, nome_arquivo, filtros, documento_id, gerado_por)
  values (v_id, p_tenant, v_ano, v_seq, left(btrim(p_tipo), 60), left(btrim(coalesce(p_titulo, p_tipo)), 200), v_nome, coalesce(p_filtros, '{}'), v_doc.id, auth.uid());
  perform registrar_auditoria(p_tenant, 'patrimonio_relatorios', v_id::text, 'EXPORTACAO', null, jsonb_build_object('tipo', p_tipo, 'arquivo', v_nome, 'filtros', p_filtros));
  return jsonb_build_object('id', v_id, 'nome_arquivo', v_nome, 'ano', v_ano, 'sequencia', v_seq, 'documento_id', v_doc.id, 'storage_path', v_doc.storage_path);
end $$;

create function public.patrimonio_relatorios_emitidos(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'tipo', r.tipo, 'titulo', r.titulo, 'nome_arquivo', r.nome_arquivo, 'filtros', r.filtros,
           'gerado_em', r.gerado_em, 'gerado_por', (select nome from perfis where id = r.gerado_por),
           'documento', (select jsonb_build_object('id', d.id, 'storage_path', d.storage_path, 'nome_arquivo', d.nome_arquivo) from documentos d where d.id = r.documento_id and d.excluido_em is null))
         order by r.gerado_em desc), '[]')
    from (select * from patrimonio_relatorios where tenant_id = p_tenant and (gerado_por = auth.uid() or pode(tenant_id, null, 'patrimonio', 'aprovar'))
          order by gerado_em desc limit 200) r
$$;

-- Servidores para responsável (qualquer quem movimenta escolhe, inclusive de outro setor)
create function public.patrimonio_buscar_servidores(p_tenant uuid, p_termo text) returns table (id uuid, nome text, matricula text, cargo text, lotacao jsonb, tem_acesso boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.nome, s.matricula, nullif(concat_ws(' · ', s.cargo, s.funcao), ''), conecta_hierarquia(s.unidade_id), s.user_id is not null
    from servidores s
   where s.tenant_id = p_tenant and (s.data_exoneracao is null or s.data_exoneracao > hoje())
     and (pode(p_tenant, null, 'patrimonio', 'ler') or membro_do_tenant(p_tenant) and exists (select 1 from servidores x where x.user_id = auth.uid() and x.tenant_id = p_tenant))
     and (nullif(btrim(p_termo), '') is null or lower(s.nome || ' ' || s.matricula) like '%' || lower(btrim(p_termo)) || '%')
   order by s.nome limit 20
$$;

-- Termo de responsabilidade por servidor, coordenação ou unidade de saúde (dados para o PDF)
create function public.patrimonio_termo_responsabilidade(p_tenant uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode(p_tenant, null, 'patrimonio', 'exportar') and not (nullif(p ->> 'responsavel_id', '') is not null and patrimonio_eu_servidor((p ->> 'responsavel_id')::uuid)) then
    raise exception 'Você não tem permissão para emitir termos de responsabilidade.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'responsavel', (select jsonb_build_object('nome', s.nome, 'matricula', s.matricula, 'cargo', s.cargo, 'lotacao', conecta_hierarquia(s.unidade_id))
                      from servidores s where s.id = nullif(p ->> 'responsavel_id', '')::uuid and s.tenant_id = p_tenant),
    'unidade', conecta_hierarquia(nullif(p ->> 'unidade_id', '')::uuid),
    'local', (select nome from unidades_atendidas where id = nullif(p ->> 'local_id', '')::uuid),
    'bens', patrimonio_buscar(p_tenant, p || jsonb_build_object('limite', 5000)) -> 'itens');
end $$;

-- Localiza um bem pelo número exato (para a troca: o bem recebido é de outro setor e não aparece na consulta).
-- Só para quem pode solicitar movimentações; devolve apenas identificação, setor e responsável.
create function public.patrimonio_localizar(p_tenant uuid, p_numero text) returns jsonb
language sql stable security definer set search_path = public as $q$
  select jsonb_build_object('id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'situacao', b.situacao,
           'pendente', b.movimentacao_pendente_id is not null, 'unidade', conecta_hierarquia(b.unidade_id),
           'local', (select nome from unidades_atendidas where id = b.local_id),
           'responsavel', (select nome from servidores where id = b.responsavel_id))
    from patrimonio_bens b
   where b.tenant_id = p_tenant and lower(b.numero) = lower(btrim(p_numero))
     and (pode(p_tenant, null, 'patrimonio', 'criar') or exists (select 1 from servidores s where s.user_id = auth.uid() and s.tenant_id = p_tenant))
$q$;

-- Configuração do timbre dos documentos do patrimônio (dados do órgão + textos próprios)
create function public.patrimonio_timbre(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nome_oficial', t.nome_oficial, 'nome_curto', t.nome_curto, 'cnpj', t.cnpj, 'endereco', t.endereco, 'cidade', t.cidade, 'uf', t.uf,
           'cep', t.cep, 'telefone', t.telefone, 'email', t.email_contato, 'site', t.site, 'logo_path', t.logo_path,
           'cabecalho', tc.documento_cabecalho, 'rodape', tc.documento_rodape,
           'secretaria', tc.textos ->> 'patrimonio_secretaria', 'orgao_fundo', tc.textos ->> 'patrimonio_orgao_fundo',
           'setor', tc.textos ->> 'patrimonio_setor', 'contato', tc.textos ->> 'patrimonio_contato')
    from tenants t left join tenant_configuracoes tc on tc.tenant_id = t.id
   where t.id = p_tenant and (membro_do_tenant(p_tenant) or eh_admin_plataforma())
$$;

-- =====================================================================
-- Privilégios
-- =====================================================================

revoke execute on function
  public.patrimonio_valida_categoria(), public.patrimonio_semear_categorias(uuid), public.patrimonio_prepara_bem(), public.patrimonio_bem_cadastrado(),
  public.patrimonio_categorias_novo_orgao(), public.patrimonio_eu_servidor(uuid), public.patrimonio_bem_legivel(uuid), public.patrimonio_mov_legivel(uuid), public.patrimonio_destino_pendente(uuid),
  public.patrimonio_documento_legivel(uuid, uuid, uuid), public.patrimonio_situacao_destino(text, text, text, boolean, text),
  public.patrimonio_aplicar(uuid), public.patrimonio_liberar(uuid), public.patrimonio_tentar_concluir(uuid),
  public.patrimonio_movimentar(uuid, jsonb), public.patrimonio_responder(uuid, boolean, text), public.patrimonio_confirmar_administrativo(uuid, uuid, text),
  public.patrimonio_cancelar(uuid, text), public.patrimonio_retificar(uuid, text), public.patrimonio_protege_mov(), public.patrimonio_termo(uuid),
  public.patrimonio_abrir_inventario(uuid, jsonb), public.patrimonio_conferir(uuid, jsonb), public.patrimonio_bem_sem_cadastro(uuid, jsonb),
  public.patrimonio_encerrar_inventario(uuid, boolean, text), public.patrimonio_inventario(uuid), public.patrimonio_bens_visiveis(uuid),
  public.patrimonio_buscar(uuid, jsonb), public.patrimonio_movimentacao(uuid), public.patrimonio_movimentacoes_lista(uuid, jsonb), public.patrimonio_ficha(uuid),
  public.patrimonio_painel(uuid, uuid), public.patrimonio_registrar_relatorio(uuid, text, text, jsonb, bigint), public.patrimonio_relatorios_emitidos(uuid),
  public.patrimonio_buscar_servidores(uuid, text), public.patrimonio_termo_responsabilidade(uuid, jsonb), public.patrimonio_timbre(uuid),
  public.patrimonio_localizar(uuid, text)
from public, anon;

revoke execute on function
  public.patrimonio_valida_categoria(), public.patrimonio_semear_categorias(uuid), public.patrimonio_prepara_bem(), public.patrimonio_bem_cadastrado(),
  public.patrimonio_categorias_novo_orgao(), public.patrimonio_documento_legivel(uuid, uuid, uuid), public.patrimonio_situacao_destino(text, text, text, boolean, text),
  public.patrimonio_aplicar(uuid), public.patrimonio_liberar(uuid), public.patrimonio_tentar_concluir(uuid), public.patrimonio_protege_mov(),
  public.patrimonio_bens_visiveis(uuid)
from authenticated;

grant execute on function
  -- usadas nas políticas RLS
  public.patrimonio_eu_servidor(uuid), public.patrimonio_bem_legivel(uuid), public.patrimonio_mov_legivel(uuid), public.patrimonio_destino_pendente(uuid),
  -- RPCs
  public.patrimonio_movimentar(uuid, jsonb), public.patrimonio_responder(uuid, boolean, text), public.patrimonio_confirmar_administrativo(uuid, uuid, text),
  public.patrimonio_cancelar(uuid, text), public.patrimonio_retificar(uuid, text), public.patrimonio_termo(uuid),
  public.patrimonio_abrir_inventario(uuid, jsonb), public.patrimonio_conferir(uuid, jsonb), public.patrimonio_bem_sem_cadastro(uuid, jsonb),
  public.patrimonio_encerrar_inventario(uuid, boolean, text), public.patrimonio_inventario(uuid),
  public.patrimonio_buscar(uuid, jsonb), public.patrimonio_movimentacao(uuid), public.patrimonio_movimentacoes_lista(uuid, jsonb), public.patrimonio_ficha(uuid),
  public.patrimonio_painel(uuid, uuid), public.patrimonio_registrar_relatorio(uuid, text, text, jsonb, bigint), public.patrimonio_relatorios_emitidos(uuid),
  public.patrimonio_buscar_servidores(uuid, text), public.patrimonio_termo_responsabilidade(uuid, jsonb), public.patrimonio_timbre(uuid),
  public.patrimonio_localizar(uuid, text)
to authenticated;
