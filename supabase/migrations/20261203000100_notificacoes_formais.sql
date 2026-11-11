-- MEASURE 2.0 — Notificações formais de empresas contratadas (ocorrências contratuais)
--
-- Gestor, fiscal ou suplente com designação ativa (ou perfil autorizado na matriz) registra a ocorrência,
-- revisa a fundamentação sugerida e emite a notificação. A emissão gera o documento oficial pelo mesmo
-- mecanismo e papel timbrado dos documentos emitidos (retrato preservado). Depois: assinatura (documento
-- assinado anexado), envio, recebimento/ciência (o prazo conta da ciência), resposta da contratada,
-- análise, encaminhamento e encerramento — cada passo com autor, data e justificativa, sem exclusão.
-- Notificação NÃO é sanção: sanções efetivamente aplicadas são registradas à parte, com processo e decisão.

-- =====================================================================
-- Permissão (matriz) e campos novos do contrato
-- =====================================================================
insert into public.recursos (codigo, nome, grupo, ordem, livre_para_plataforma)
values ('notificacoes_contratuais', 'Notificações e ocorrências contratuais', 'Contratos e execução', 235, false);
insert into public.permissoes_papel (papel, recurso, acao)
select papel, 'notificacoes_contratuais', acao from public.permissoes_papel where recurso = 'contratos'
on conflict do nothing;
insert into public.permissoes_papel (papel, recurso, acao) values ('MASTER', 'notificacoes_contratuais', 'aprovar') on conflict do nothing;

alter table public.contratos
  add column regime_juridico text check (regime_juridico in ('LEI_14133', 'LEI_8666', 'OUTRO')),
  add column data_assinatura date;
comment on column public.contratos.regime_juridico is 'Regime legal indicado no processo de contratação (não deduzido pela data).';

-- =====================================================================
-- Catálogos: fundamentos legais, tipos de ocorrência e modelos de texto
-- =====================================================================
create table public.nf_fundamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),        -- nulo: catálogo geral
  codigo text not null check (codigo ~ '^[A-Z0-9_]{3,40}$'),
  regime text not null check (regime in ('LEI_14133', 'LEI_8666', 'MUNICIPAL', 'GERAL')),
  norma text not null,
  artigo text,
  inciso text,
  texto text not null,
  vigencia_inicio date,
  vigencia_fim date,
  observacoes text,
  revisao_pendente boolean not null default false,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index nf_fundamentos_codigo on public.nf_fundamentos (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

insert into public.nf_fundamentos (codigo, regime, norma, artigo, inciso, texto, observacoes, revisao_pendente, ordem) values
  ('L14133_ART104', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 104', 'III e IV', 'Prerrogativas da Administração de fiscalizar a execução do contrato e de aplicar sanções motivadas pela inexecução total ou parcial do ajuste.', null, false, 10),
  ('L14133_ART115', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 115', null, 'O contrato deverá ser executado fielmente pelas partes, de acordo com as cláusulas avençadas e as normas legais, e cada parte responderá pelas consequências de sua inexecução total ou parcial.', null, false, 20),
  ('L14133_ART92_XVI', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 92', 'XVI', 'Obrigação do contratado de manter, durante toda a execução do contrato, todas as condições exigidas para a habilitação na licitação ou para a qualificação na contratação direta.', null, false, 25),
  ('L14133_ART117', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 117', '§ 1º', 'O fiscal do contrato anotará em registro próprio todas as ocorrências relacionadas à execução do contrato, determinando o que for necessário para a regularização das faltas ou dos defeitos observados.', null, false, 30),
  ('L14133_ART118', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 118', null, 'O contratado deverá manter preposto aceito pela Administração no local da obra ou do serviço para representá-lo na execução do contrato.', null, false, 35),
  ('L14133_ART119', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 119', null, 'O contratado será obrigado a reparar, corrigir, remover, reconstruir ou substituir, a suas expensas, no total ou em parte, o objeto do contrato em que se verificarem vícios, defeitos ou incorreções resultantes de sua execução ou de materiais nela empregados.', null, false, 40),
  ('L14133_ART120', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 120', null, 'O contratado será responsável pelos danos causados diretamente à Administração ou a terceiros em razão da execução do contrato, e a fiscalização ou o acompanhamento pelo contratante não excluirá nem reduzirá essa responsabilidade.', null, false, 45),
  ('L14133_ART121', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 121', null, 'Somente o contratado será responsável pelos encargos trabalhistas, previdenciários, fiscais e comerciais resultantes da execução do contrato.', null, false, 50),
  ('L14133_ART137', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 137', 'I e II', 'Constituem motivos para extinção do contrato, assegurados o contraditório e a ampla defesa, o não cumprimento ou o cumprimento irregular de cláusulas contratuais, especificações, projetos ou prazos, e o desatendimento das determinações regulares da autoridade designada para acompanhar e fiscalizar a execução.', null, false, 60),
  ('L14133_ART155_I', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 155', 'I', 'Infração administrativa: dar causa à inexecução parcial do contrato.', null, false, 70),
  ('L14133_ART155_II', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 155', 'II', 'Infração administrativa: dar causa à inexecução parcial do contrato que cause grave dano à Administração, ao funcionamento dos serviços públicos ou ao interesse coletivo.', null, false, 71),
  ('L14133_ART155_III', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 155', 'III', 'Infração administrativa: dar causa à inexecução total do contrato.', null, false, 72),
  ('L14133_ART155_VII', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 155', 'VII', 'Infração administrativa: ensejar o retardamento da execução ou da entrega do objeto sem motivo justificado.', null, false, 73),
  ('L14133_ART155_VIII', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 155', 'VIII', 'Infração administrativa: apresentar declaração ou documentação falsa, ou prestar declaração falsa durante a licitação ou a execução do contrato.', null, false, 74),
  ('L14133_ART156', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 156', 'I a IV e § 1º', 'Sanções aplicáveis às infrações do art. 155: I – advertência; II – multa; III – impedimento de licitar e contratar; IV – declaração de inidoneidade para licitar ou contratar. Na aplicação serão considerados a natureza e a gravidade da infração, as peculiaridades do caso, as circunstâncias agravantes ou atenuantes, os danos para a Administração e a implantação ou o aperfeiçoamento de programa de integridade (§ 1º).', null, false, 80),
  ('L14133_ART157', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 157', null, 'Na aplicação da sanção de multa, será facultada a defesa do interessado no prazo de 15 (quinze) dias úteis, contado da data de sua intimação.', 'Prazo de defesa em procedimento sancionador; não é prazo de regularização.', false, 85),
  ('L14133_ART158', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 158', null, 'A aplicação das sanções de impedimento de licitar e contratar e de declaração de inidoneidade requer processo de responsabilização conduzido por comissão, com intimação do licitante ou contratado para apresentar defesa escrita e especificar provas no prazo de 15 (quinze) dias úteis.', 'Prazo de defesa em procedimento sancionador; não é prazo de regularização.', false, 86),
  ('L14133_ART162', 'LEI_14133', 'Lei Federal nº 14.133/2021', 'art. 162', null, 'O atraso injustificado na execução do contrato sujeitará o contratado a multa de mora, na forma prevista em edital ou em contrato.', null, false, 90),
  ('L8666_ART66', 'LEI_8666', 'Lei Federal nº 8.666/1993', 'art. 66', null, 'O contrato deverá ser executado fielmente pelas partes, de acordo com as cláusulas avençadas e as normas legais, respondendo cada uma pelas consequências de sua inexecução total ou parcial.', 'Contratos regidos pelo regime anterior, conforme o processo de contratação e as regras de transição.', false, 110),
  ('L8666_ART67', 'LEI_8666', 'Lei Federal nº 8.666/1993', 'art. 67', '§ 1º', 'O representante da Administração anotará em registro próprio todas as ocorrências relacionadas com a execução do contrato, determinando o que for necessário à regularização das faltas ou defeitos observados.', null, false, 120),
  ('L8666_ART69', 'LEI_8666', 'Lei Federal nº 8.666/1993', 'art. 69', null, 'O contratado é obrigado a reparar, corrigir, remover, reconstruir ou substituir, às suas expensas, no total ou em parte, o objeto do contrato em que se verificarem vícios, defeitos ou incorreções resultantes da execução ou de materiais empregados.', null, false, 130),
  ('L8666_ART78', 'LEI_8666', 'Lei Federal nº 8.666/1993', 'art. 78', 'I e II', 'Constituem motivo para rescisão do contrato o não cumprimento ou o cumprimento irregular de cláusulas contratuais, especificações, projetos ou prazos.', null, false, 140),
  ('L8666_ART86', 'LEI_8666', 'Lei Federal nº 8.666/1993', 'art. 86', null, 'O atraso injustificado na execução do contrato sujeitará o contratado à multa de mora, na forma prevista no instrumento convocatório ou no contrato.', null, false, 150),
  ('L8666_ART87', 'LEI_8666', 'Lei Federal nº 8.666/1993', 'art. 87', 'I a IV e § 2º', 'Pela inexecução total ou parcial do contrato a Administração poderá, garantida a prévia defesa, aplicar: I – advertência; II – multa; III – suspensão temporária de participação em licitação e impedimento de contratar, por prazo não superior a 2 anos; IV – declaração de inidoneidade. Defesa prévia no prazo de 5 dias úteis (§ 2º).', 'Prazo de defesa em procedimento sancionador; não é prazo de regularização.', false, 160),
  ('MUN_DEC_7178_2023', 'MUNICIPAL', 'Decreto Municipal nº 7.178/2023, alterado pelo Decreto nº 7.457/2023', null, null, 'Regulamentação municipal das contratações regidas pela Lei nº 14.133/2021.', 'Indicar os artigos específicos somente após validação pela assessoria jurídica (PGM).', true, 200),
  ('MUN_DEC_7177_2023', 'MUNICIPAL', 'Decreto Municipal nº 7.177/2023', null, null, 'Regulamentação municipal das contratações diretas por ele abrangidas.', 'Aplicar apenas às contratações diretas abrangidas pelo decreto; indicar artigos após validação jurídica.', true, 210),
  ('MUN_IN_002_2023', 'MUNICIPAL', 'Instrução Normativa Conjunta PGM/CGM/SEPLOG nº 002/2023 e alterações', null, null, 'Orientações municipais conjuntas aplicáveis à gestão e fiscalização dos contratos.', 'Conferir a redação vigente e as alterações posteriores antes de citar dispositivos específicos.', true, 220);

create table public.nf_tipos_ocorrencia (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  grupo text not null,
  nome text not null check (length(btrim(nome)) between 3 and 200),
  descricao text,
  fundamentos text[] not null default '{}',          -- códigos sugeridos (os dois regimes; a tela filtra pelo regime)
  prazo_padrao_dias int check (prazo_padrao_dias between 1 and 365),
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
insert into public.nf_tipos_ocorrencia (grupo, nome, fundamentos, ordem)
select g, n, f, o from (values
  ('A. Descumprimento da execução contratual', 'Não execução de ordem de serviço', array['L14133_ART115','L14133_ART117','L14133_ART155_I','L14133_ART156','L8666_ART66','L8666_ART67','L8666_ART87'], 10),
  ('A. Descumprimento da execução contratual', 'Execução parcial do serviço', array['L14133_ART115','L14133_ART119','L14133_ART155_I','L14133_ART156','L8666_ART66','L8666_ART69','L8666_ART87'], 11),
  ('A. Descumprimento da execução contratual', 'Não cumprimento do cronograma', array['L14133_ART115','L14133_ART155_VII','L14133_ART156','L14133_ART162','L8666_ART66','L8666_ART86','L8666_ART87'], 12),
  ('A. Descumprimento da execução contratual', 'Atraso injustificado', array['L14133_ART155_VII','L14133_ART156','L14133_ART162','L8666_ART86','L8666_ART87'], 13),
  ('A. Descumprimento da execução contratual', 'Interrupção indevida dos serviços', array['L14133_ART115','L14133_ART137','L14133_ART155_I','L14133_ART156','L8666_ART66','L8666_ART78','L8666_ART87'], 14),
  ('A. Descumprimento da execução contratual', 'Descumprimento de especificações técnicas', array['L14133_ART115','L14133_ART119','L14133_ART155_I','L14133_ART156','L8666_ART66','L8666_ART69','L8666_ART87'], 15),
  ('B. Qualidade dos serviços', 'Serviço executado em desacordo com as especificações', array['L14133_ART119','L14133_ART155_I','L14133_ART156','L8666_ART69','L8666_ART87'], 20),
  ('B. Qualidade dos serviços', 'Serviço realizado de maneira inadequada', array['L14133_ART115','L14133_ART119','L14133_ART156','L8666_ART66','L8666_ART69','L8666_ART87'], 21),
  ('B. Qualidade dos serviços', 'Reincidência de falhas', array['L14133_ART119','L14133_ART137','L14133_ART156','L8666_ART69','L8666_ART78','L8666_ART87'], 22),
  ('B. Qualidade dos serviços', 'Necessidade de refazer serviços', array['L14133_ART119','L8666_ART69'], 23),
  ('B. Qualidade dos serviços', 'Material utilizado em desacordo com o contratado', array['L14133_ART119','L14133_ART155_I','L14133_ART156','L8666_ART69','L8666_ART87'], 24),
  ('C. Obrigações administrativas', 'Não apresentação de documentação exigida', array['L14133_ART115','L14133_ART117','L14133_ART156','L8666_ART66','L8666_ART67','L8666_ART87'], 30),
  ('C. Obrigações administrativas', 'Certidões vencidas ou irregulares', array['L14133_ART92_XVI','L14133_ART115','L8666_ART66'], 31),
  ('C. Obrigações administrativas', 'Não atendimento às solicitações da fiscalização', array['L14133_ART117','L14133_ART137','L14133_ART156','L8666_ART67','L8666_ART78','L8666_ART87'], 32),
  ('C. Obrigações administrativas', 'Ausência de representante ou preposto', array['L14133_ART118','L14133_ART115','L8666_ART66'], 33),
  ('C. Obrigações administrativas', 'Não cumprimento de obrigações previstas no contrato', array['L14133_ART115','L14133_ART155_I','L14133_ART156','L8666_ART66','L8666_ART87'], 34),
  ('D. Pessoal e atendimento', 'Ausência de profissionais necessários', array['L14133_ART115','L14133_ART155_I','L14133_ART156','L8666_ART66','L8666_ART87'], 40),
  ('D. Pessoal e atendimento', 'Falta de substituição de profissionais', array['L14133_ART115','L14133_ART156','L8666_ART66','L8666_ART87'], 41),
  ('D. Pessoal e atendimento', 'Descumprimento de obrigações trabalhistas (comprovado e pertinente)', array['L14133_ART121','L14133_ART115','L8666_ART66'], 42),
  ('D. Pessoal e atendimento', 'Atendimento inadequado', array['L14133_ART115','L8666_ART66'], 43),
  ('D. Pessoal e atendimento', 'Ausência de equipe para execução dos serviços', array['L14133_ART115','L14133_ART155_I','L14133_ART156','L8666_ART66','L8666_ART87'], 44),
  ('E. Obras e manutenção', 'Serviço executado fora das especificações', array['L14133_ART119','L14133_ART155_I','L14133_ART156','L8666_ART69','L8666_ART87'], 50),
  ('E. Obras e manutenção', 'Não cumprimento de prazo', array['L14133_ART155_VII','L14133_ART156','L14133_ART162','L8666_ART86','L8666_ART87'], 51),
  ('E. Obras e manutenção', 'Abandono de serviço', array['L14133_ART137','L14133_ART155_III','L14133_ART156','L8666_ART78','L8666_ART87'], 52),
  ('E. Obras e manutenção', 'Falha na execução', array['L14133_ART119','L14133_ART155_I','L8666_ART69','L8666_ART87'], 53),
  ('E. Obras e manutenção', 'Reincidência de problemas', array['L14133_ART119','L14133_ART137','L8666_ART69','L8666_ART78'], 54),
  ('E. Obras e manutenção', 'Não correção de defeitos apontados', array['L14133_ART117','L14133_ART119','L14133_ART156','L8666_ART67','L8666_ART69','L8666_ART87'], 55),
  ('F. Outras ocorrências', 'Outra ocorrência (descrever)', array['L14133_ART115','L8666_ART66'], 90)
) x(g, n, f, o);

create table public.nf_modelos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  tipo text not null check (tipo in ('CONSEQUENCIAS', 'MANIFESTACAO')),
  regime text not null check (regime in ('LEI_14133', 'LEI_8666', 'OUTRO')),
  nome text not null,
  texto text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
insert into public.nf_modelos (tipo, regime, nome, texto) values
  ('CONSEQUENCIAS', 'LEI_14133', 'Padrão – Lei 14.133/2021',
   'Fica a empresa NOTIFICADA para que adote as providências necessárias à regularização da ocorrência descrita neste documento, observando as obrigações estabelecidas no {contrato}{clausula_texto}, no prazo de {prazo}, contado conforme a forma de comunicação e as disposições aplicáveis.' || chr(10) || chr(10) ||
   'O não atendimento injustificado às obrigações contratuais poderá ensejar a adoção das medidas administrativas cabíveis, entre elas: {medidas}. Quando configurada infração e observados os requisitos legais e contratuais, poderão ser aplicadas, mediante procedimento próprio, as sanções previstas nos arts. 155 e 156 da Lei Federal nº 14.133/2021, sem prejuízo das demais providências previstas no instrumento contratual.' || chr(10) || chr(10) ||
   'Esta notificação não constitui aplicação de penalidade.'),
  ('CONSEQUENCIAS', 'LEI_8666', 'Padrão – Lei 8.666/1993',
   'Fica a empresa NOTIFICADA para que adote as providências necessárias à regularização da ocorrência descrita neste documento, observando as obrigações estabelecidas no {contrato}{clausula_texto}, no prazo de {prazo}, contado conforme a forma de comunicação e as disposições aplicáveis.' || chr(10) || chr(10) ||
   'O não atendimento injustificado às obrigações contratuais poderá ensejar a adoção das medidas administrativas cabíveis, entre elas: {medidas}. Quando configurada a inexecução e garantida a prévia defesa, poderão ser aplicadas as sanções previstas nos arts. 86 e 87 da Lei Federal nº 8.666/1993, sem prejuízo das demais providências previstas no instrumento contratual.' || chr(10) || chr(10) ||
   'Esta notificação não constitui aplicação de penalidade.'),
  ('CONSEQUENCIAS', 'OUTRO', 'Padrão – regime a confirmar',
   'Fica a empresa NOTIFICADA para que adote as providências necessárias à regularização da ocorrência descrita neste documento, observando as obrigações estabelecidas no {contrato}{clausula_texto}, no prazo de {prazo}.' || chr(10) || chr(10) ||
   'O não atendimento injustificado poderá ensejar a adoção das medidas administrativas e contratuais cabíveis, observados a legislação aplicável ao contrato e o devido processo legal. Esta notificação não constitui aplicação de penalidade.'),
  ('MANIFESTACAO', 'LEI_14133', 'Padrão – Lei 14.133/2021',
   'Fica assegurado à contratada o direito de apresentar esclarecimentos, justificativas e documentos {prazo_resposta}, sem prejuízo do direito de defesa em eventual procedimento administrativo sancionador, nos termos dos arts. 157 e 158 da Lei Federal nº 14.133/2021.'),
  ('MANIFESTACAO', 'LEI_8666', 'Padrão – Lei 8.666/1993',
   'Fica assegurado à contratada o direito de apresentar esclarecimentos, justificativas e documentos {prazo_resposta}, sem prejuízo da defesa prévia em eventual procedimento sancionador (art. 87, § 2º, da Lei Federal nº 8.666/1993).'),
  ('MANIFESTACAO', 'OUTRO', 'Padrão – regime a confirmar',
   'Fica assegurado à contratada o direito de apresentar esclarecimentos, justificativas e documentos {prazo_resposta}, sem prejuízo do direito de defesa em eventual procedimento próprio.');

-- =====================================================================
-- Notificações, tramitação, respostas e sanções
-- =====================================================================
create table public.notificacoes_formais (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contrato_id uuid not null references public.contratos(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  unidade_id uuid not null references public.unidades_organizacionais(id),   -- do contrato (escopo)
  numero int,
  ano int,
  versao int not null default 1,
  versao_de uuid references public.notificacoes_formais(id),
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'AGUARDANDO_ASSINATURA', 'EMITIDA', 'ENVIADA', 'RECEBIDA', 'EM_PRAZO',
    'PRAZO_VENCIDO', 'RESPONDIDA', 'EM_ANALISE', 'REGULARIZADA', 'NAO_REGULARIZADA', 'ENCAMINHADA', 'ENCERRADA', 'CANCELADA', 'RETIFICADA')),
  regime_juridico text not null check (regime_juridico in ('LEI_14133', 'LEI_8666', 'OUTRO')),
  regime_confirmado boolean not null default false,
  tipo_id uuid references public.nf_tipos_ocorrencia(id),
  gravidade text not null default 'MEDIA' check (gravidade in ('LEVE', 'MEDIA', 'GRAVE')),
  data_ocorrencia date,
  local_ocorrencia text,
  unidade_atendida_id uuid references public.unidades_atendidas(id),
  fatos text not null default '',
  obrigacoes text not null default '',
  clausula text,
  fundamentos text[] not null default '{}',
  fundamentacao text not null default '',
  providencias text not null default '',
  prazo_dias int check (prazo_dias between 1 and 365),
  prazo_tipo text not null default 'CORRIDOS' check (prazo_tipo in ('CORRIDOS', 'UTEIS')),
  prazo_resposta_dias int check (prazo_resposta_dias between 1 and 365),
  prazo_texto text not null default '',
  consequencias text not null default '',
  manifestacao text not null default '',
  observacoes text,
  revisao_juridica boolean not null default false,     -- o sistema recomendou revisão (regime/cláusula/fundamento incerto)
  revisao_confirmada boolean not null default false,   -- quem emite declarou ter revisado
  emissor_id uuid,
  emissor_servidor_id uuid references public.servidores(id),
  emissor_papel text check (emissor_papel in ('GESTOR', 'FISCAL', 'SUPLENTE', 'ADMINISTRADOR')),
  documento_emitido_id uuid references public.documentos_emitidos(id),
  emitida_em timestamptz,
  data_ciencia date,
  data_limite date,
  data_limite_resposta date,
  cancelada_motivo text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create unique index nf_numero_unico on public.notificacoes_formais (tenant_id, ano, numero, versao) where numero is not null;
create index nf_contrato on public.notificacoes_formais (contrato_id);
create index nf_fornecedor on public.notificacoes_formais (fornecedor_id);
create index nf_status on public.notificacoes_formais (tenant_id, status);

create table public.nf_tramites (
  id bigint generated always as identity primary key,
  notificacao_id uuid not null references public.notificacoes_formais(id),
  tenant_id uuid not null references public.tenants(id),
  tipo text not null,
  status_anterior text,
  status_novo text,
  dados jsonb not null default '{}',
  justificativa text,
  autor_id uuid,
  autor_nome text,
  criado_em timestamptz not null default now()
);
create index nf_tramites_notificacao on public.nf_tramites (notificacao_id, criado_em);

create table public.nf_respostas (
  id uuid primary key default gen_random_uuid(),
  notificacao_id uuid not null references public.notificacoes_formais(id),
  tenant_id uuid not null references public.tenants(id),
  data_resposta date not null,
  recebida_por text,
  justificativa text not null check (length(btrim(justificativa)) >= 5),
  providencias_adotadas text,
  analise text check (analise in ('ACEITA', 'PARCIALMENTE_ACEITA', 'NAO_ACEITA')),
  analise_justificativa text,
  analisado_por uuid, analisado_em timestamptz,
  criado_em timestamptz not null default now(), criado_por uuid
);

create table public.fornecedor_sancoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  contrato_id uuid references public.contratos(id),
  notificacao_id uuid references public.notificacoes_formais(id),
  tipo text not null check (tipo in ('ADVERTENCIA', 'MULTA', 'IMPEDIMENTO', 'INIDONEIDADE', 'SUSPENSAO')),
  processo text not null check (length(btrim(processo)) >= 3),
  autoridade text not null check (length(btrim(autoridade)) >= 3),
  fundamento text not null,
  decisao text not null,
  data_decisao date not null,
  vigencia_inicio date,
  vigencia_fim date,
  valor numeric(16,2),
  situacao text not null default 'VIGENTE' check (situacao in ('VIGENTE', 'CUMPRIDA', 'SUSPENSA', 'ANULADA', 'ENCERRADA')),
  situacao_justificativa text,
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
create index fornecedor_sancoes_fornecedor on public.fornecedor_sancoes (fornecedor_id);

-- carimbo, troca de órgão e auditoria (padrão do sistema)
do $$ declare t text;
begin
  foreach t in array array['nf_fundamentos', 'nf_tipos_ocorrencia', 'nf_modelos', 'notificacoes_formais', 'fornecedor_sancoes'] loop
    execute format('create trigger %1$s_criacao before insert on public.%1$s for each row execute function public.carimbar_criacao()', t);
    execute format('create trigger %1$s_carimbar before update on public.%1$s for each row execute function public.carimbar()', t);
  end loop;
  foreach t in array array['notificacoes_formais', 'fornecedor_sancoes', 'nf_respostas', 'nf_tramites'] loop
    execute format('create trigger %1$s_tenant before update on public.%1$s for each row execute function public.bloquear_troca_tenant()', t);
  end loop;
  foreach t in array array['nf_fundamentos', 'nf_tipos_ocorrencia', 'nf_modelos', 'notificacoes_formais', 'nf_respostas', 'nf_tramites', 'fornecedor_sancoes'] loop
    execute format('create trigger %1$s_auditar after insert or update or delete on public.%1$s for each row execute function public.auditar()', t);
  end loop;
end $$;

-- conteúdo preservado depois de emitida (retificação gera nova versão); tramitação é só acréscimo
create function public.nf_protege() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'RASCUNHO' then raise exception 'Notificação emitida não pode ser excluída; use o cancelamento com justificativa.' using errcode = 'check_violation'; end if;
    return old;
  end if;
  if old.status <> 'RASCUNHO' and (to_jsonb(new) - array['status', 'data_ciencia', 'data_limite', 'data_limite_resposta', 'cancelada_motivo', 'atualizado_em', 'atualizado_por', 'documento_emitido_id', 'emitida_em', 'numero', 'ano'])
       <> (to_jsonb(old) - array['status', 'data_ciencia', 'data_limite', 'data_limite_resposta', 'cancelada_motivo', 'atualizado_em', 'atualizado_por', 'documento_emitido_id', 'emitida_em', 'numero', 'ano']) then
    raise exception 'O conteúdo de uma notificação emitida não pode ser alterado. Use a retificação (nova versão).' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger notificacoes_formais_protege before update or delete on public.notificacoes_formais for each row execute function public.nf_protege();

create function public.nf_somente_acrescimo() returns trigger
language plpgsql as $$
begin
  -- único caso permitido: excluir um rascunho (nada foi emitido; a exclusão fica na auditoria)
  if tg_op = 'DELETE' and exists (select 1 from public.notificacoes_formais n where n.id = old.notificacao_id and n.status = 'RASCUNHO') then
    return old;
  end if;
  raise exception 'O histórico da notificação não pode ser alterado nem apagado.' using errcode = 'check_violation';
end $$;
create trigger nf_tramites_imutavel before update or delete on public.nf_tramites for each row execute function public.nf_somente_acrescimo();

-- =====================================================================
-- Acesso
-- =====================================================================
create function public.nf_papel_designado(p_contrato uuid) returns text
language sql stable security definer set search_path = public as $$
  select d.papel from contrato_designacoes d join servidores s on s.id = d.servidor_id
   where d.contrato_id = p_contrato and s.user_id = auth.uid() and d.fim is null and d.inicio <= hoje()
   order by case d.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end limit 1
$$;

-- Pode registrar e conduzir notificações do contrato: designado ativo ou perfil autorizado na matriz
create function public.nf_pode_atuar(p_contrato uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select nf_papel_designado(p_contrato) is not null
      or exists (select 1 from contratos c where c.id = p_contrato and (pode(c.tenant_id, c.unidade_id, 'notificacoes_contratuais', 'criar')
                                                                        or pode(c.tenant_id, c.unidade_id, 'notificacoes_contratuais', 'editar')))
$$;

create function public.nf_legivel(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notificacoes_formais n where n.id = p_id
                   and (pode(n.tenant_id, n.unidade_id, 'notificacoes_contratuais', 'ler') or designado(n.contrato_id)))
$$;

alter table public.nf_fundamentos enable row level security;
alter table public.nf_tipos_ocorrencia enable row level security;
alter table public.nf_modelos enable row level security;
alter table public.notificacoes_formais enable row level security;
alter table public.nf_tramites enable row level security;
alter table public.nf_respostas enable row level security;
alter table public.fornecedor_sancoes enable row level security;
create policy nf_fund_ler on public.nf_fundamentos for select to authenticated using (tenant_id is null or membro_do_tenant(tenant_id));
create policy nf_tipos_ler on public.nf_tipos_ocorrencia for select to authenticated using (tenant_id is null or membro_do_tenant(tenant_id));
create policy nf_modelos_ler on public.nf_modelos for select to authenticated using (tenant_id is null or membro_do_tenant(tenant_id));
create policy nf_ler on public.notificacoes_formais for select to authenticated using (nf_legivel(id));
create policy nf_tramites_ler on public.nf_tramites for select to authenticated using (nf_legivel(notificacao_id));
create policy nf_respostas_ler on public.nf_respostas for select to authenticated using (nf_legivel(notificacao_id));
create policy sancoes_ler on public.fornecedor_sancoes for select to authenticated using (pode(tenant_id, null, 'notificacoes_contratuais', 'ler') or pode(tenant_id, null, 'fornecedores', 'ler'));
-- toda gravação passa pelas funções abaixo (validação, autoria e tramitação)
revoke insert, update, delete on public.nf_fundamentos, public.nf_tipos_ocorrencia, public.nf_modelos, public.notificacoes_formais,
  public.nf_tramites, public.nf_respostas, public.fornecedor_sancoes from authenticated;
revoke all on public.nf_fundamentos, public.nf_tipos_ocorrencia, public.nf_modelos, public.notificacoes_formais,
  public.nf_tramites, public.nf_respostas, public.fornecedor_sancoes from anon;

-- Anexos (evidências, documento assinado, comprovantes, resposta): quem atua na notificação anexa; quem a vê, lê
create or replace function public.documento_legivel(p_tenant uuid, p_unidade uuid, p_recurso text, p_registro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_recurso = 'patrimonio' then patrimonio_documento_legivel(p_tenant, p_unidade, p_registro)
              when p_recurso = 'notificacoes_contratuais' then p_registro is not null and nf_legivel(p_registro)
  else pode(p_tenant, p_unidade, p_recurso, 'ler')
      or (p_recurso = 'contratos' and p_registro is not null and designado(p_registro))
      or (p_recurso = 'notas_fiscais' and p_registro is not null and designado(contrato_de_nota(p_registro))) end
$$;
create function public.nf_anexo_permitido(p_registro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notificacoes_formais n where n.id = p_registro
                   and n.status not in ('CANCELADA', 'ENCERRADA', 'RETIFICADA') and nf_pode_atuar(n.contrato_id))
$$;
create policy documentos_notificacao_enviar on public.documentos for insert to authenticated
  with check (recurso = 'notificacoes_contratuais' and registro_id is not null and nf_anexo_permitido(registro_id));

-- Documento oficial: novo tipo nos documentos emitidos (mesmo papel timbrado e PDF)
alter table public.documentos_emitidos drop constraint documentos_emitidos_tipo_check;
alter table public.documentos_emitidos add constraint documentos_emitidos_tipo_check
  check (tipo in ('EXTRATO_CONTRATO', 'EXTRATO_EMPENHO', 'ATESTO', 'CONSOLIDADO_MENSAL', 'CHECKLIST_NOTA',
                  'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO', 'NOTIFICACAO_FORMAL'));
drop policy emitidos_ler on public.documentos_emitidos;
create policy emitidos_ler on public.documentos_emitidos for select to authenticated
  using (case
           when tipo in ('EXTRATO_CONTRATO', 'EXTRATO_NOTAS', 'EXTRATO_UNIDADES', 'EXTRATO_RATEIO')
             then pode(tenant_id, unidade_id, 'contratos', 'ler') or designado(registro_id)
           when tipo = 'EXTRATO_EMPENHO' then pode(tenant_id, unidade_id, 'empenhos', 'ler') or designado((select contrato_id from empenhos where id = registro_id))
           when tipo = 'CONSOLIDADO_MENSAL' then pode(tenant_id, unidade_id, 'servidores', 'ler')
           when tipo = 'NOTIFICACAO_FORMAL' then nf_legivel(registro_id)
           else nota_legivel(registro_id) end);

-- =====================================================================
-- Funções de apoio
-- =====================================================================
create function public.somar_dias_uteis(p_inicio date, p_dias int) returns date
language plpgsql immutable as $$
declare d date := p_inicio; n int := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

create function public.nf_rotulo(n notificacoes_formais) returns text
language sql immutable as $$
  select 'Notificação nº ' || coalesce(n.numero::text, '(rascunho)') || coalesce('/' || n.ano, '') || case when n.versao > 1 then ' (' || n.versao || 'ª versão)' else '' end
$$;

create function public.nf_rotulo(p_numero int, p_ano int, p_versao int) returns text
language sql immutable as $$
  select 'Notificação nº ' || coalesce(p_numero::text, '(rascunho)') || coalesce('/' || p_ano, '') || case when p_versao > 1 then ' (' || p_versao || 'ª versão)' else '' end
$$;

create function public.nf_tramitar_registro(n notificacoes_formais, p_tipo text, p_status_novo text, p_dados jsonb, p_justificativa text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into nf_tramites (notificacao_id, tenant_id, tipo, status_anterior, status_novo, dados, justificativa, autor_id, autor_nome)
  values (n.id, n.tenant_id, p_tipo, n.status, p_status_novo, coalesce(p_dados, '{}'), nullif(btrim(p_justificativa), ''), auth.uid(),
          (select coalesce(nullif(nome, ''), email) from perfis where id = auth.uid()));
end $$;

-- aviso aos responsáveis do contrato (central de notificações e PUSH)
create function public.nf_avisar(n notificacoes_formais, p_tipo text, p_titulo text, p_descricao text, p_chave text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform notificar_evento(n.tenant_id, p_chave, 'CONTRATOS', p_tipo, designados_usuarios(n.contrato_id), p_titulo, p_descricao,
    '/notificacoes-contratuais/' || n.id, n.id, n.contrato_id);
end $$;

-- Contexto para o formulário: dados do órgão, contrato, fornecedor, responsáveis, emissor e alerta de recorrência
create function public.nf_contexto(p_contrato uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c contratos; f fornecedores; v jsonb;
begin
  if not nf_pode_atuar(p_contrato) then
    raise exception 'Só o gestor, o fiscal ou o suplente designado (ou perfil autorizado) registra ocorrências neste contrato.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from contratos where id = p_contrato;
  select * into f from fornecedores where id = c.fornecedor_id;
  select jsonb_build_object(
    'orgao', cabecalho_orgao(c.tenant_id),
    'estrutura', (select to_jsonb(x) from unidade_niveis(c.unidade_id) x),
    'unidade', (select jsonb_build_object('nome', nome, 'sigla', sigla) from unidades_organizacionais where id = c.unidade_id),
    'contrato', jsonb_build_object('id', c.id, 'numero', c.numero, 'processo_administrativo', c.processo_administrativo, 'numero_licitacao', c.numero_licitacao,
       'modalidade', (select nome from modalidades_contratacao where codigo = c.modalidade), 'modalidade_codigo', c.modalidade,
       'objeto', c.objeto, 'data_assinatura', c.data_assinatura, 'data_inicio', c.data_inicio, 'data_fim', contrato_fim_atual(c.id),
       'valor_global', c.valor_global, 'valor_atual', contrato_valor_atual(c.id), 'regime_juridico', c.regime_juridico),
    'fornecedor', jsonb_build_object('id', f.id, 'razao_social', f.razao_social, 'nome_fantasia', f.nome_fantasia, 'documento', f.documento, 'tipo_pessoa', f.tipo_pessoa,
       'endereco', concat_ws(', ', f.logradouro, f.numero, f.complemento, f.bairro, nullif(concat_ws('/', f.cidade, f.uf), ''), case when f.cep is not null then 'CEP ' || f.cep end),
       'representante', f.nome_contato, 'email', f.email, 'telefone', f.telefone),
    'responsaveis', coalesce((select jsonb_agg(jsonb_build_object('papel', d.papel, 'nome', s.nome, 'matricula', s.matricula, 'cargo', s.cargo)
                                order by case d.papel when 'GESTOR' then 1 when 'FISCAL' then 2 else 3 end)
                               from contrato_designacoes d join servidores s on s.id = d.servidor_id where d.contrato_id = c.id and d.fim is null), '[]'),
    'emissor', (select jsonb_build_object('nome', coalesce(s.nome, nullif(p.nome, ''), p.email), 'matricula', s.matricula, 'cargo', coalesce(s.cargo, s.funcao),
                                          'papel', coalesce(nf_papel_designado(c.id), 'ADMINISTRADOR'),
                                          'lotacao', (select descricao from unidade_niveis(s.unidade_id)))
                  from perfis p left join lateral (select * from servidores sv where sv.user_id = p.id and sv.tenant_id = c.tenant_id
                                                     order by (sv.data_exoneracao is null) desc limit 1) s on true where p.id = auth.uid()),
    'recorrencia', jsonb_build_object(
       'total', (select count(*) from notificacoes_formais n where n.fornecedor_id = f.id and n.status not in ('RASCUNHO', 'CANCELADA', 'RETIFICADA')),
       'neste_contrato', (select count(*) from notificacoes_formais n where n.contrato_id = c.id and n.status not in ('RASCUNHO', 'CANCELADA', 'RETIFICADA')),
       'sancoes_vigentes', (select count(*) from fornecedor_sancoes s where s.fornecedor_id = f.id and s.situacao = 'VIGENTE'))
  ) into v;
  return v;
end $$;

-- =====================================================================
-- Rascunho: criar, editar, excluir
-- =====================================================================
create function public.nf_salvar(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; n notificacoes_formais; c contratos; v_regime text;
begin
  if v_id is null then
    select * into c from contratos where id = (p ->> 'contrato_id')::uuid;
    if c.id is null then raise exception 'Contrato não encontrado.' using errcode = 'no_data_found'; end if;
    if not nf_pode_atuar(c.id) then
      raise exception 'Só o gestor, o fiscal ou o suplente designado (ou perfil autorizado) registra ocorrências neste contrato.' using errcode = 'insufficient_privilege';
    end if;
    v_regime := coalesce(nullif(p ->> 'regime_juridico', ''), c.regime_juridico, 'OUTRO');
    insert into notificacoes_formais (tenant_id, contrato_id, fornecedor_id, unidade_id, regime_juridico, emissor_id, emissor_papel, emissor_servidor_id)
    values (c.tenant_id, c.id, c.fornecedor_id, c.unidade_id, v_regime, auth.uid(), coalesce(nf_papel_designado(c.id), 'ADMINISTRADOR'),
            (select id from servidores where user_id = auth.uid() and tenant_id = c.tenant_id order by (data_exoneracao is null) desc limit 1))
    returning id into v_id;
  end if;
  select * into n from notificacoes_formais where id = v_id for update;
  if n.status <> 'RASCUNHO' then raise exception 'Notificação já emitida: o conteúdo só muda por retificação (nova versão).' using errcode = 'check_violation'; end if;
  if n.criado_por is distinct from auth.uid() and not pode(n.tenant_id, n.unidade_id, 'notificacoes_contratuais', 'aprovar') then
    raise exception 'Este rascunho é de outro responsável.' using errcode = 'insufficient_privilege';
  end if;
  update notificacoes_formais set
    regime_juridico = coalesce(nullif(p ->> 'regime_juridico', ''), regime_juridico),
    regime_confirmado = coalesce((p ->> 'regime_confirmado')::boolean, regime_confirmado),
    tipo_id = nullif(p ->> 'tipo_id', '')::uuid,
    gravidade = coalesce(nullif(p ->> 'gravidade', ''), gravidade),
    data_ocorrencia = nullif(p ->> 'data_ocorrencia', '')::date,
    local_ocorrencia = nullif(btrim(p ->> 'local_ocorrencia'), ''),
    unidade_atendida_id = nullif(p ->> 'unidade_atendida_id', '')::uuid,
    fatos = coalesce(p ->> 'fatos', ''), obrigacoes = coalesce(p ->> 'obrigacoes', ''), clausula = nullif(btrim(p ->> 'clausula'), ''),
    fundamentos = coalesce(array(select jsonb_array_elements_text(p -> 'fundamentos')), '{}'),
    fundamentacao = coalesce(p ->> 'fundamentacao', ''), providencias = coalesce(p ->> 'providencias', ''),
    prazo_dias = nullif(p ->> 'prazo_dias', '')::int, prazo_tipo = coalesce(nullif(p ->> 'prazo_tipo', ''), 'CORRIDOS'),
    prazo_resposta_dias = nullif(p ->> 'prazo_resposta_dias', '')::int,
    prazo_texto = coalesce(p ->> 'prazo_texto', ''), consequencias = coalesce(p ->> 'consequencias', ''), manifestacao = coalesce(p ->> 'manifestacao', ''),
    observacoes = nullif(btrim(p ->> 'observacoes'), ''),
    revisao_juridica = coalesce((p ->> 'revisao_juridica')::boolean, false),
    revisao_confirmada = coalesce((p ->> 'revisao_confirmada')::boolean, false)
  where id = v_id;
  if not exists (select 1 from nf_tramites where notificacao_id = v_id) then
    perform nf_tramitar_registro(n, 'CRIADA', 'RASCUNHO', '{}', null);
  end if;
  return v_id;
end $$;

create function public.nf_excluir_rascunho(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n notificacoes_formais;
begin
  select * into n from notificacoes_formais where id = p_id;
  if n.id is null or not nf_legivel(p_id) then raise exception 'Notificação não encontrada.' using errcode = 'no_data_found'; end if;
  if n.status <> 'RASCUNHO' then raise exception 'Notificação emitida não pode ser excluída; use o cancelamento com justificativa.' using errcode = 'check_violation'; end if;
  if n.criado_por is distinct from auth.uid() and not pode(n.tenant_id, n.unidade_id, 'notificacoes_contratuais', 'aprovar') then
    raise exception 'Este rascunho é de outro responsável.' using errcode = 'insufficient_privilege';
  end if;
  delete from nf_tramites where notificacao_id = p_id;
  delete from notificacoes_formais where id = p_id;
end $$;

-- =====================================================================
-- Emissão: valida, numera, gera o documento oficial (retrato) e trava o conteúdo
-- =====================================================================
create function public.nf_emitir(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare n notificacoes_formais; v_ctx jsonb; v_doc uuid; v_num int; v_tipo text; v_ant notificacoes_formais;
begin
  select * into n from notificacoes_formais where id = p_id for update;
  if n.id is null or not nf_legivel(p_id) then raise exception 'Notificação não encontrada.' using errcode = 'no_data_found'; end if;
  if n.status <> 'RASCUNHO' then raise exception 'Esta notificação já foi emitida.' using errcode = 'check_violation'; end if;
  if not nf_pode_atuar(n.contrato_id) then raise exception 'Você não tem designação ativa nem autorização neste contrato.' using errcode = 'insufficient_privilege'; end if;
  if n.criado_por is distinct from auth.uid() and not pode(n.tenant_id, n.unidade_id, 'notificacoes_contratuais', 'aprovar') then
    raise exception 'Somente quem elaborou o rascunho emite a notificação.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(n.fatos)) < 80 then raise exception 'Descreva os fatos de forma objetiva e detalhada (mínimo de 80 caracteres): o que ocorreu, quando, onde e como foi constatado.' using errcode = 'check_violation', hint = 'fatos'; end if;
  if n.data_ocorrencia is null then raise exception 'Informe a data da ocorrência.' using errcode = 'check_violation', hint = 'data_ocorrencia'; end if;
  if length(btrim(n.providencias)) < 20 then raise exception 'Descreva as providências exigidas da empresa.' using errcode = 'check_violation', hint = 'providencias'; end if;
  if length(btrim(n.obrigacoes)) < 10 then raise exception 'Indique a obrigação contratual possivelmente descumprida.' using errcode = 'check_violation', hint = 'obrigacoes'; end if;
  if n.prazo_dias is null then raise exception 'Defina o prazo para regularização.' using errcode = 'check_violation', hint = 'prazo_dias'; end if;
  if length(btrim(n.fundamentacao)) < 20 or length(btrim(n.consequencias)) < 20 then
    raise exception 'Revise a fundamentação e as consequências antes de emitir.' using errcode = 'check_violation', hint = 'fundamentacao';
  end if;
  if not n.regime_confirmado then raise exception 'Confirme o regime jurídico aplicável ao contrato (conforme o processo de contratação).' using errcode = 'check_violation', hint = 'regime'; end if;
  if n.revisao_juridica and not n.revisao_confirmada then
    raise exception 'O sistema não identificou com segurança a cláusula ou o fundamento aplicável: revise o texto (se necessário, com a assessoria jurídica) e confirme a revisão.' using errcode = 'check_violation', hint = 'revisao';
  end if;
  if n.consequencias ~* '(fica|está|esta) (a empresa )?(penalizad|multad|declarad[ao] inid|impedid)' then
    raise exception 'A notificação não pode declarar a empresa já penalizada: indique apenas as consequências possíveis.' using errcode = 'check_violation', hint = 'consequencias';
  end if;

  perform pg_advisory_xact_lock(hashtext('nf_numero:' || n.tenant_id));
  if n.versao_de is not null then
    select * into v_ant from notificacoes_formais where id = n.versao_de;
    v_num := v_ant.numero; n.ano := v_ant.ano;
  else
    n.ano := extract(year from hoje())::int;
    select coalesce(max(numero), 0) + 1 into v_num from notificacoes_formais where tenant_id = n.tenant_id and ano = n.ano;
  end if;
  v_ctx := nf_contexto(n.contrato_id);
  v_tipo := (select grupo || ' – ' || nome from nf_tipos_ocorrencia where id = n.tipo_id);
  n.numero := v_num;
  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (n.tenant_id, n.unidade_id, 'NOTIFICACAO_FORMAL', n.id, 'NOTIFICAÇÃO FORMAL Nº ' || v_num || '/' || n.ano || case when n.versao > 1 then ' (' || n.versao || 'ª versão)' else '' end,
    v_ctx || jsonb_build_object(
      'titulo', 'NOTIFICAÇÃO FORMAL Nº ' || v_num || '/' || n.ano || case when n.versao > 1 then ' – ' || n.versao || 'ª VERSÃO' else '' end,
      'numero', v_num, 'ano', n.ano, 'versao', n.versao,
      'retifica', case when n.versao_de is not null then nf_rotulo(v_ant) end,
      'tipo_ocorrencia', v_tipo, 'gravidade', n.gravidade, 'regime_juridico', n.regime_juridico,
      'data_ocorrencia', n.data_ocorrencia, 'local', n.local_ocorrencia,
      'unidade_atendida', (select nome from unidades_atendidas where id = n.unidade_atendida_id),
      'fatos', n.fatos, 'obrigacoes', n.obrigacoes, 'clausula', n.clausula, 'fundamentacao', n.fundamentacao,
      'providencias', n.providencias, 'prazo_texto', n.prazo_texto, 'consequencias', n.consequencias, 'manifestacao', n.manifestacao,
      'observacoes', n.observacoes, 'emitido_por', v_ctx #>> '{emissor,nome}',
      'anexos', coalesce((select jsonb_agg(d.nome_arquivo order by d.enviado_em) from documentos d
                            where d.recurso = 'notificacoes_contratuais' and d.registro_id = n.id and d.excluido_em is null and d.categoria = 'EVIDENCIA'), '[]')))
  returning id into v_doc;
  update notificacoes_formais set numero = v_num, ano = n.ano, status = 'AGUARDANDO_ASSINATURA', documento_emitido_id = v_doc, emitida_em = now()
   where id = n.id;
  perform nf_tramitar_registro(n, 'EMITIDA', 'AGUARDANDO_ASSINATURA', jsonb_build_object('documento_emitido_id', v_doc, 'numero', v_num, 'ano', n.ano), null);
  if n.versao_de is not null then
    update notificacoes_formais set status = 'RETIFICADA' where id = n.versao_de and status <> 'RETIFICADA';
    perform nf_tramitar_registro(v_ant, 'RETIFICADA', 'RETIFICADA', jsonb_build_object('nova_versao', n.id, 'versao', n.versao), 'Substituída pela ' || n.versao || 'ª versão');
  end if;
  select * into n from notificacoes_formais where id = n.id;
  perform nf_avisar(n, 'NOTIF_FORMAL_EMITIDA', 'Notificação formal emitida', nf_rotulo(n) || ' emitida à empresa do ' || contrato_rotulo(n.contrato_id) || '.', 'nf:' || n.id || ':emitida');
  return v_doc;
end $$;

-- Retificação: nova versão em rascunho, com o mesmo conteúdo; a anterior fica preservada
create function public.nf_retificar(p_id uuid, p_justificativa text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n notificacoes_formais; v_id uuid;
begin
  select * into n from notificacoes_formais where id = p_id;
  if n.id is null or not nf_legivel(p_id) then raise exception 'Notificação não encontrada.' using errcode = 'no_data_found'; end if;
  if n.status in ('RASCUNHO', 'CANCELADA', 'RETIFICADA', 'ENCERRADA') then raise exception 'Esta notificação não pode ser retificada.' using errcode = 'check_violation'; end if;
  if not nf_pode_atuar(n.contrato_id) then raise exception 'Você não tem designação ativa nem autorização neste contrato.' using errcode = 'insufficient_privilege'; end if;
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then raise exception 'Justifique a retificação.' using errcode = 'check_violation', hint = 'justificativa'; end if;
  if exists (select 1 from notificacoes_formais where versao_de = p_id and status = 'RASCUNHO') then
    raise exception 'Já existe uma retificação em elaboração para esta notificação.' using errcode = 'check_violation';
  end if;
  insert into notificacoes_formais (tenant_id, contrato_id, fornecedor_id, unidade_id, versao, versao_de, regime_juridico, regime_confirmado, tipo_id, gravidade,
     data_ocorrencia, local_ocorrencia, unidade_atendida_id, fatos, obrigacoes, clausula, fundamentos, fundamentacao, providencias, prazo_dias, prazo_tipo,
     prazo_resposta_dias, prazo_texto, consequencias, manifestacao, observacoes, revisao_juridica, emissor_id, emissor_servidor_id, emissor_papel)
  select tenant_id, contrato_id, fornecedor_id, unidade_id, versao + 1, id, regime_juridico, regime_confirmado, tipo_id, gravidade,
     data_ocorrencia, local_ocorrencia, unidade_atendida_id, fatos, obrigacoes, clausula, fundamentos, fundamentacao, providencias, prazo_dias, prazo_tipo,
     prazo_resposta_dias, prazo_texto, consequencias, manifestacao, observacoes, revisao_juridica, auth.uid(),
     (select id from servidores where user_id = auth.uid() and tenant_id = n.tenant_id order by (data_exoneracao is null) desc limit 1),
     coalesce(nf_papel_designado(contrato_id), 'ADMINISTRADOR')
    from notificacoes_formais where id = p_id
  returning id into v_id;
  perform nf_tramitar_registro((select x from notificacoes_formais x where x.id = v_id), 'CRIADA', 'RASCUNHO', jsonb_build_object('retifica', p_id), p_justificativa);
  perform nf_tramitar_registro(n, 'RETIFICACAO_INICIADA', n.status, jsonb_build_object('nova_versao', v_id), p_justificativa);
  return v_id;
end $$;

-- =====================================================================
-- Tramitação: assinatura, envio, recebimento, ciência, análise, encaminhamento, encerramento, cancelamento
-- =====================================================================
create function public.nf_tramitar(p_id uuid, p_acao text, p_dados jsonb default '{}', p_justificativa text default null) returns text
language plpgsql security definer set search_path = public as $$
declare n notificacoes_formais; v_novo text; v_doc uuid := nullif(p_dados ->> 'documento_id', '')::uuid; v_data date; v_lim date; v_lim_resp date;
        v_permitidos text[]; v_just text := nullif(btrim(p_justificativa), '');
begin
  select * into n from notificacoes_formais where id = p_id for update;
  if n.id is null or not nf_legivel(p_id) then raise exception 'Notificação não encontrada.' using errcode = 'no_data_found'; end if;
  if not nf_pode_atuar(n.contrato_id) then
    raise exception 'Só o gestor, o fiscal ou o suplente designado (ou perfil autorizado) conduz esta notificação.' using errcode = 'insufficient_privilege';
  end if;
  if v_doc is not null and not exists (select 1 from documentos where id = v_doc and recurso = 'notificacoes_contratuais' and registro_id = n.id and excluido_em is null) then
    raise exception 'O documento indicado não está anexado a esta notificação.' using errcode = 'check_violation', hint = 'documento';
  end if;
  v_permitidos := case p_acao
    when 'ASSINATURA' then array['AGUARDANDO_ASSINATURA']
    when 'ENVIO' then array['EMITIDA', 'ENVIADA']
    when 'RECUSA' then array['ENVIADA']
    when 'RECEBIMENTO' then array['ENVIADA']
    when 'CIENCIA' then array['ENVIADA', 'RECEBIDA']
    when 'INICIAR_ANALISE' then array['RESPONDIDA']
    when 'ANALISE' then array['RESPONDIDA', 'EM_ANALISE', 'EM_PRAZO', 'PRAZO_VENCIDO']
    when 'ENCAMINHAMENTO' then array['NAO_REGULARIZADA', 'PRAZO_VENCIDO', 'EM_ANALISE', 'RESPONDIDA']
    when 'ENCERRAMENTO' then array['REGULARIZADA', 'NAO_REGULARIZADA', 'ENCAMINHADA']
    when 'CANCELAMENTO' then array['AGUARDANDO_ASSINATURA', 'EMITIDA', 'ENVIADA', 'RECEBIDA', 'EM_PRAZO', 'PRAZO_VENCIDO', 'RESPONDIDA', 'EM_ANALISE']
    else null end;
  if v_permitidos is null then raise exception 'Ação desconhecida.' using errcode = 'check_violation'; end if;
  if not n.status = any(v_permitidos) then
    raise exception 'Esta ação não é possível na situação atual da notificação.' using errcode = 'check_violation';
  end if;

  case p_acao
    when 'ASSINATURA' then
      if v_doc is null then raise exception 'Anexe o documento assinado (assinatura manual digitalizada ou assinatura eletrônica do sistema oficial).' using errcode = 'check_violation', hint = 'documento'; end if;
      if coalesce(length(btrim(p_dados ->> 'assinado_por')), 0) < 3 then raise exception 'Informe quem assinou.' using errcode = 'check_violation', hint = 'assinado_por'; end if;
      v_novo := 'EMITIDA';
    when 'ENVIO' then
      if coalesce(p_dados ->> 'forma', '') not in ('EMAIL', 'PROTOCOLO', 'SISTEMA_OFICIAL', 'CORREIOS', 'PESSOALMENTE') then raise exception 'Informe a forma de envio.' using errcode = 'check_violation', hint = 'forma'; end if;
      if p_dados ->> 'forma' = 'EMAIL' and coalesce(p_dados ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe o e-mail utilizado no envio.' using errcode = 'check_violation', hint = 'email'; end if;
      if nullif(p_dados ->> 'data_hora', '') is null then raise exception 'Informe a data e a hora do envio.' using errcode = 'check_violation', hint = 'data_hora'; end if;
      v_novo := 'ENVIADA';
    when 'RECUSA' then
      if v_just is null then raise exception 'Descreva a recusa ou a impossibilidade de entrega.' using errcode = 'check_violation', hint = 'justificativa'; end if;
      v_novo := 'ENVIADA';
    when 'RECEBIMENTO' then
      if nullif(p_dados ->> 'data', '') is null then raise exception 'Informe a data do recebimento.' using errcode = 'check_violation', hint = 'data'; end if;
      v_novo := 'RECEBIDA';
    when 'CIENCIA' then
      v_data := nullif(p_dados ->> 'data_ciencia', '')::date;
      if v_data is null then raise exception 'Informe a data da ciência.' using errcode = 'check_violation', hint = 'data_ciencia'; end if;
      if v_data > hoje() then raise exception 'A data da ciência não pode ser futura.' using errcode = 'check_violation', hint = 'data_ciencia'; end if;
      if v_doc is null and coalesce(length(btrim(p_dados ->> 'meio')), 0) < 5 then
        raise exception 'Anexe o comprovante da ciência ou descreva como ela foi comprovada (ex.: assinatura do representante, confirmação de leitura no sistema oficial).' using errcode = 'check_violation', hint = 'meio';
      end if;
      v_lim := case when n.prazo_tipo = 'UTEIS' then somar_dias_uteis(v_data, n.prazo_dias) else v_data + n.prazo_dias end;
      v_lim_resp := case when n.prazo_resposta_dias is null then null when n.prazo_tipo = 'UTEIS' then somar_dias_uteis(v_data, n.prazo_resposta_dias) else v_data + n.prazo_resposta_dias end;
      update notificacoes_formais set data_ciencia = v_data, data_limite = v_lim, data_limite_resposta = v_lim_resp where id = n.id;
      v_novo := case when v_lim < hoje() then 'PRAZO_VENCIDO' else 'EM_PRAZO' end;
    when 'INICIAR_ANALISE' then v_novo := 'EM_ANALISE';
    when 'ANALISE' then
      if coalesce(p_dados ->> 'resultado', '') not in ('REGULARIZADA', 'NAO_REGULARIZADA') then raise exception 'Informe se a irregularidade foi corrigida.' using errcode = 'check_violation', hint = 'resultado'; end if;
      if coalesce(length(v_just), 0) < 20 then raise exception 'Fundamente a análise (mínimo de 20 caracteres).' using errcode = 'check_violation', hint = 'justificativa'; end if;
      v_novo := p_dados ->> 'resultado';
      if p_dados ->> 'resposta_id' is not null then
        if coalesce(p_dados ->> 'analise_resposta', '') not in ('ACEITA', 'PARCIALMENTE_ACEITA', 'NAO_ACEITA') then raise exception 'Informe o resultado da análise da resposta.' using errcode = 'check_violation', hint = 'analise_resposta'; end if;
        update nf_respostas set analise = p_dados ->> 'analise_resposta', analise_justificativa = v_just, analisado_por = auth.uid(), analisado_em = now()
         where id = (p_dados ->> 'resposta_id')::uuid and notificacao_id = n.id;
      end if;
    when 'ENCAMINHAMENTO' then
      if coalesce(length(btrim(p_dados ->> 'autoridade')), 0) < 3 or coalesce(length(v_just), 0) < 20 then
        raise exception 'Informe a autoridade competente e a justificativa do encaminhamento.' using errcode = 'check_violation', hint = 'autoridade';
      end if;
      v_novo := 'ENCAMINHADA';
    when 'ENCERRAMENTO' then
      if coalesce(length(v_just), 0) < 10 then raise exception 'Justifique o encerramento.' using errcode = 'check_violation', hint = 'justificativa'; end if;
      v_novo := 'ENCERRADA';
    when 'CANCELAMENTO' then
      if coalesce(length(v_just), 0) < 15 then raise exception 'Justifique o cancelamento (mínimo de 15 caracteres).' using errcode = 'check_violation', hint = 'justificativa'; end if;
      update notificacoes_formais set cancelada_motivo = v_just where id = n.id;
      v_novo := 'CANCELADA';
  end case;

  update notificacoes_formais set status = v_novo where id = n.id;
  perform nf_tramitar_registro(n, p_acao, v_novo, p_dados || case when p_acao = 'CIENCIA' then jsonb_build_object('data_limite', v_lim, 'data_limite_resposta', v_lim_resp) else '{}'::jsonb end, v_just);
  select * into n from notificacoes_formais where id = n.id;
  if p_acao = 'CIENCIA' then
    perform nf_avisar(n, 'NOTIF_FORMAL_RECEBIDA', 'Empresa ciente da notificação', 'A empresa tomou ciência da ' || nf_rotulo(n) || '. Prazo de regularização até ' || to_char(n.data_limite, 'DD/MM/YYYY') || '.', 'nf:' || n.id || ':ciencia');
  elsif p_acao = 'ANALISE' and v_novo = 'REGULARIZADA' then
    perform nf_avisar(n, 'NOTIF_FORMAL_REGULARIZADA', 'Ocorrência regularizada', 'A ocorrência da ' || nf_rotulo(n) || ' foi considerada regularizada.', 'nf:' || n.id || ':regularizada');
  elsif p_acao = 'ANALISE' then
    perform nf_avisar(n, 'NOTIF_FORMAL_NAO_REGULARIZADA', 'Ocorrência não regularizada', 'A ocorrência da ' || nf_rotulo(n) || ' não foi solucionada. Avalie o encaminhamento à autoridade competente.', 'nf:' || n.id || ':nao-regularizada');
  elsif p_acao = 'ENCAMINHAMENTO' then
    perform nf_avisar(n, 'NOTIF_FORMAL_ENCAMINHADA', 'Notificação encaminhada para apuração', nf_rotulo(n) || ' encaminhada à autoridade competente.', 'nf:' || n.id || ':encaminhada');
  end if;
  return v_novo;
end $$;

-- Resposta da contratada (registrada pelo responsável; a empresa não acessa o sistema interno)
create function public.nf_registrar_resposta(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare n notificacoes_formais; v_id uuid;
begin
  select * into n from notificacoes_formais where id = p_id for update;
  if n.id is null or not nf_legivel(p_id) then raise exception 'Notificação não encontrada.' using errcode = 'no_data_found'; end if;
  if not nf_pode_atuar(n.contrato_id) then raise exception 'Você não tem designação ativa nem autorização neste contrato.' using errcode = 'insufficient_privilege'; end if;
  if n.status not in ('ENVIADA', 'RECEBIDA', 'EM_PRAZO', 'PRAZO_VENCIDO', 'RESPONDIDA', 'EM_ANALISE') then
    raise exception 'A notificação precisa ter sido enviada à empresa para registrar a resposta.' using errcode = 'check_violation';
  end if;
  if nullif(p ->> 'data_resposta', '') is null then raise exception 'Informe a data da resposta.' using errcode = 'check_violation', hint = 'data_resposta'; end if;
  if coalesce(length(btrim(p ->> 'justificativa')), 0) < 5 then raise exception 'Registre o conteúdo da manifestação da empresa.' using errcode = 'check_violation', hint = 'justificativa'; end if;
  insert into nf_respostas (notificacao_id, tenant_id, data_resposta, recebida_por, justificativa, providencias_adotadas, criado_por)
  values (n.id, n.tenant_id, (p ->> 'data_resposta')::date, nullif(btrim(p ->> 'recebida_por'), ''), btrim(p ->> 'justificativa'), nullif(btrim(p ->> 'providencias_adotadas'), ''), auth.uid())
  returning id into v_id;
  update notificacoes_formais set status = 'RESPONDIDA' where id = n.id and status <> 'EM_ANALISE';
  perform nf_tramitar_registro(n, 'RESPOSTA', case when n.status = 'EM_ANALISE' then 'EM_ANALISE' else 'RESPONDIDA' end, jsonb_build_object('resposta_id', v_id, 'data_resposta', p ->> 'data_resposta'), null);
  perform nf_avisar(n, 'NOTIF_FORMAL_RESPOSTA', 'Empresa respondeu à notificação', 'A empresa apresentou resposta à ' || nf_rotulo(n) || '. Analise e registre o resultado.', 'nf:' || n.id || ':resposta:' || v_id);
  return v_id;
end $$;

-- Sanção efetivamente aplicada (decisão da autoridade competente, em processo próprio) — não é automática
create function public.nf_registrar_sancao(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_forn fornecedores; v_ct uuid := nullif(p ->> 'contrato_id', '')::uuid; v_nf notificacoes_formais;
begin
  select * into v_forn from fornecedores where id = (p ->> 'fornecedor_id')::uuid;
  if v_forn.id is null then raise exception 'Fornecedor não encontrado.' using errcode = 'no_data_found'; end if;
  if not pode(v_forn.tenant_id, (select unidade_id from contratos where id = v_ct), 'notificacoes_contratuais', 'aprovar') then
    raise exception 'O registro de sanção aplicada é restrito a perfis autorizados (decisão da autoridade competente).' using errcode = 'insufficient_privilege';
  end if;
  insert into fornecedor_sancoes (tenant_id, fornecedor_id, contrato_id, notificacao_id, tipo, processo, autoridade, fundamento, decisao, data_decisao, vigencia_inicio, vigencia_fim, valor)
  values (v_forn.tenant_id, v_forn.id, v_ct, nullif(p ->> 'notificacao_id', '')::uuid, p ->> 'tipo', btrim(p ->> 'processo'), btrim(p ->> 'autoridade'),
          btrim(p ->> 'fundamento'), btrim(p ->> 'decisao'), (p ->> 'data_decisao')::date, nullif(p ->> 'vigencia_inicio', '')::date, nullif(p ->> 'vigencia_fim', '')::date,
          nullif(p ->> 'valor', '')::numeric)
  returning id into v_id;
  if nullif(p ->> 'notificacao_id', '') is not null then
    select * into v_nf from notificacoes_formais where id = (p ->> 'notificacao_id')::uuid;
    if v_nf.id is not null then perform nf_tramitar_registro(v_nf, 'SANCAO_REGISTRADA', v_nf.status, jsonb_build_object('sancao_id', v_id, 'tipo', p ->> 'tipo', 'processo', p ->> 'processo'), null); end if;
  end if;
  return v_id;
end $$;

create function public.nf_situacao_sancao(p_id uuid, p_situacao text, p_justificativa text) returns void
language plpgsql security definer set search_path = public as $$
declare s fornecedor_sancoes;
begin
  select * into s from fornecedor_sancoes where id = p_id;
  if s.id is null then raise exception 'Sanção não encontrada.' using errcode = 'no_data_found'; end if;
  if not pode(s.tenant_id, (select unidade_id from contratos where id = s.contrato_id), 'notificacoes_contratuais', 'aprovar') then
    raise exception 'Restrito a perfis autorizados.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then raise exception 'Justifique a alteração da situação.' using errcode = 'check_violation', hint = 'justificativa'; end if;
  update fornecedor_sancoes set situacao = p_situacao, situacao_justificativa = btrim(p_justificativa) where id = p_id;
end $$;

-- =====================================================================
-- Consultas
-- =====================================================================
create function public.nf_obter(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n notificacoes_formais;
begin
  select * into n from notificacoes_formais where id = p_id;
  if n.id is null or not nf_legivel(p_id) then raise exception 'Notificação não encontrada.' using errcode = 'no_data_found'; end if;
  return to_jsonb(n) || jsonb_build_object(
    'rotulo', nf_rotulo(n),
    'contrato_numero', (select numero from contratos where id = n.contrato_id),
    'fornecedor_nome', (select coalesce(razao_social, nome_fantasia) from fornecedores where id = n.fornecedor_id),
    'fornecedor_documento', (select documento from fornecedores where id = n.fornecedor_id),
    'tipo_nome', (select grupo || ' – ' || nome from nf_tipos_ocorrencia where id = n.tipo_id),
    'emissor_nome', (select coalesce(nullif(nome, ''), email) from perfis where id = n.emissor_id),
    'pode_atuar', nf_pode_atuar(n.contrato_id),
    'pode_editar', n.status = 'RASCUNHO' and (n.criado_por = auth.uid() or pode(n.tenant_id, n.unidade_id, 'notificacoes_contratuais', 'aprovar')),
    'pode_sancionar', pode(n.tenant_id, n.unidade_id, 'notificacoes_contratuais', 'aprovar'),
    'versao_nova', (select id from notificacoes_formais where versao_de = n.id order by versao desc limit 1),
    'tramites', coalesce((select jsonb_agg(to_jsonb(t) - 'tenant_id' order by t.criado_em, t.id) from nf_tramites t where t.notificacao_id = n.id), '[]'),
    'respostas', coalesce((select jsonb_agg(to_jsonb(r) - 'tenant_id' order by r.criado_em) from nf_respostas r where r.notificacao_id = n.id), '[]'),
    'sancoes', coalesce((select jsonb_agg(to_jsonb(s) order by s.data_decisao) from fornecedor_sancoes s where s.notificacao_id = n.id), '[]'),
    'recorrencia', (select count(*) from notificacoes_formais x where x.fornecedor_id = n.fornecedor_id and x.id <> n.id and x.status not in ('RASCUNHO', 'CANCELADA', 'RETIFICADA')));
end $$;

-- Painel: lista com filtros e indicadores (só o que a pessoa pode ver)
create function public.nf_painel(p_tenant uuid, f jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_like text; v jsonb;
begin
  if nullif(btrim(f ->> 'busca'), '') is not null then
    v_like := '%' || replace(replace(replace(lower(btrim(f ->> 'busca')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with base as (
    select n.*, c.numero contrato_numero, fo.razao_social fornecedor_nome, fo.documento cnpj, t.grupo tipo_grupo, t.nome tipo_nome,
           coalesce(nullif(pf.nome, ''), pf.email) emissor_nome, un.secretaria, un.diretoria, un.coordenacao,
           (select count(*) from nf_respostas r where r.notificacao_id = n.id) respostas
      from notificacoes_formais n
      join contratos c on c.id = n.contrato_id
      join fornecedores fo on fo.id = n.fornecedor_id
      left join nf_tipos_ocorrencia t on t.id = n.tipo_id
      left join perfis pf on pf.id = n.emissor_id
      left join lateral unidade_niveis(n.unidade_id) un on true
     where n.tenant_id = p_tenant and nf_legivel(n.id)
       and (coalesce((f ->> 'incluir_rascunhos')::boolean, true) or n.status <> 'RASCUNHO')
       and (nullif(f ->> 'fornecedor_id', '') is null or n.fornecedor_id = (f ->> 'fornecedor_id')::uuid)
       and (nullif(f ->> 'contrato_id', '') is null or n.contrato_id = (f ->> 'contrato_id')::uuid)
       and (nullif(f ->> 'unidade_id', '') is null or exists (select 1 from unidades_organizacionais uo where uo.id = n.unidade_id and (f ->> 'unidade_id')::uuid = any(uo.caminho)))
       and (nullif(f ->> 'tipo_id', '') is null or n.tipo_id = (f ->> 'tipo_id')::uuid)
       and (nullif(f ->> 'status', '') is null or n.status = f ->> 'status')
       and (nullif(f ->> 'emissor_papel', '') is null or n.emissor_papel = f ->> 'emissor_papel')
       and (nullif(f ->> 'de', '') is null or coalesce(n.emitida_em, n.criado_em) >= (f ->> 'de')::timestamptz)
       and (nullif(f ->> 'ate', '') is null or coalesce(n.emitida_em, n.criado_em) < (f ->> 'ate')::timestamptz)
       and (nullif(f ->> 'responsavel', '') is null or exists (select 1 from contrato_designacoes d join servidores s on s.id = d.servidor_id
              where d.contrato_id = n.contrato_id and lower(s.nome) like '%' || lower(f ->> 'responsavel') || '%'))
       and (v_like is null or lower(concat_ws(' ', fo.razao_social, fo.nome_fantasia, fo.documento, c.numero, n.numero::text, t.nome, n.fatos)) like v_like)
  )
  select jsonb_build_object(
    'indicadores', jsonb_build_object(
      'emitidas', (select count(*) from base where status not in ('RASCUNHO', 'CANCELADA', 'RETIFICADA')),
      'rascunhos', (select count(*) from base where status = 'RASCUNHO'),
      'aguardando_resposta', (select count(*) from base where status in ('ENVIADA', 'RECEBIDA', 'EM_PRAZO')),
      'prazo_vencido', (select count(*) from base where status = 'PRAZO_VENCIDO'),
      'regularizadas', (select count(*) from base where status = 'REGULARIZADA' or (status = 'ENCERRADA' and exists (select 1 from nf_tramites t where t.notificacao_id = base.id and t.status_novo = 'REGULARIZADA'))),
      'nao_regularizadas', (select count(*) from base where status in ('NAO_REGULARIZADA', 'ENCAMINHADA')),
      'recorrentes', coalesce((select jsonb_agg(x order by x.n desc) from (select fornecedor_id, fornecedor_nome, cnpj, count(*) n from base
                                 where status not in ('RASCUNHO', 'CANCELADA', 'RETIFICADA') group by 1, 2, 3 having count(*) >= 2 order by 4 desc limit 10) x), '[]'),
      'por_contrato', coalesce((select jsonb_agg(x order by x.n desc) from (select contrato_id, contrato_numero, count(*) n from base
                                 where status not in ('RASCUNHO', 'CANCELADA', 'RETIFICADA') group by 1, 2 order by 3 desc limit 10) x), '[]')),
    'total', (select count(*) from base),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'rotulo', nf_rotulo(b.numero, b.ano, b.versao), 'numero', b.numero, 'ano', b.ano, 'versao', b.versao,
          'status', b.status, 'contrato_id', b.contrato_id, 'contrato_numero', b.contrato_numero, 'fornecedor_id', b.fornecedor_id, 'fornecedor_nome', b.fornecedor_nome,
          'cnpj', b.cnpj, 'tipo', b.tipo_nome, 'tipo_grupo', b.tipo_grupo, 'gravidade', b.gravidade, 'emitida_em', b.emitida_em, 'criado_em', b.criado_em,
          'data_ocorrencia', b.data_ocorrencia, 'emissor', b.emissor_nome, 'emissor_papel', b.emissor_papel, 'data_limite', b.data_limite, 'respostas', b.respostas,
          'secretaria', b.secretaria, 'diretoria', b.diretoria, 'coordenacao', b.coordenacao) order by coalesce(b.emitida_em, b.criado_em) desc)
        from (select * from base order by coalesce(emitida_em, criado_em) desc limit least(greatest(coalesce((f ->> 'limite')::int, 50), 1), 500)
                offset greatest(coalesce((f ->> 'offset')::int, 0), 0)) b), '[]')
  ) into v;
  return v;
end $$;

-- Histórico permanente do fornecedor: tudo o que a pessoa pode ver, e quanto existe fora do seu acesso (sem detalhes)
create function public.fornecedor_historico_ocorrencias(p_fornecedor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_forn fornecedores;
begin
  select * into v_forn from fornecedores where id = p_fornecedor;
  if v_forn.id is null or not (pode(v_forn.tenant_id, null, 'fornecedores', 'ler') or pode(v_forn.tenant_id, null, 'notificacoes_contratuais', 'ler')
                               or exists (select 1 from contratos c where c.fornecedor_id = v_forn.id and designado(c.id))) then
    raise exception 'Fornecedor não encontrado.' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object(
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'rotulo', nf_rotulo(n), 'status', n.status, 'contrato_numero', c.numero, 'objeto', c.objeto,
          'orgao', (select nome_curto from tenants where id = n.tenant_id), 'data_ocorrencia', n.data_ocorrencia, 'emitida_em', n.emitida_em,
          'resumo', left(n.fatos, 220), 'tipo', (select nome from nf_tipos_ocorrencia where id = n.tipo_id),
          'emissor', (select coalesce(nullif(nome, ''), email) from perfis where id = n.emissor_id), 'emissor_papel', n.emissor_papel,
          'prazo_dias', n.prazo_dias, 'prazo_tipo', n.prazo_tipo, 'data_limite', n.data_limite,
          'respostas', (select count(*) from nf_respostas r where r.notificacao_id = n.id),
          'analise', (select r.analise from nf_respostas r where r.notificacao_id = n.id and r.analise is not null order by r.analisado_em desc limit 1),
          'encaminhada', exists (select 1 from nf_tramites t where t.notificacao_id = n.id and t.tipo = 'ENCAMINHAMENTO'))
          order by coalesce(n.emitida_em, n.criado_em) desc)
        from notificacoes_formais n join contratos c on c.id = n.contrato_id
       where n.fornecedor_id = p_fornecedor and n.status not in ('RASCUNHO') and nf_legivel(n.id)), '[]'),
    'fora_do_acesso', (select count(*) from notificacoes_formais n where n.fornecedor_id = p_fornecedor and n.status not in ('RASCUNHO', 'CANCELADA', 'RETIFICADA') and not nf_legivel(n.id)),
    'sancoes', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('contrato_numero', (select numero from contratos where id = s.contrato_id)) order by s.data_decisao desc)
                          from fornecedor_sancoes s where s.fornecedor_id = p_fornecedor), '[]'),
    'pode_sancionar', pode(v_forn.tenant_id, null, 'notificacoes_contratuais', 'aprovar'));
end $$;

-- Contratos em que a pessoa pode registrar ocorrência (para o "+ Emitir nova notificação")
create function public.nf_contratos_disponiveis(p_tenant uuid, p_busca text default null) returns table (id uuid, numero text, fornecedor text, objeto text, papel text)
language sql stable security definer set search_path = public as $$
  select c.id, c.numero, coalesce(f.razao_social, f.nome_fantasia), left(c.objeto, 140), coalesce(nf_papel_designado(c.id), 'ADMINISTRADOR')
    from contratos c join fornecedores f on f.id = c.fornecedor_id
   where c.tenant_id = p_tenant and c.ativo and nf_pode_atuar(c.id)
     and (nullif(btrim(p_busca), '') is null or lower(c.numero || ' ' || f.razao_social || ' ' || coalesce(f.nome_fantasia, '') || ' ' || c.objeto) like '%' || lower(btrim(p_busca)) || '%')
   order by nf_papel_designado(c.id) is null, c.numero limit 30
$$;

-- =====================================================================
-- Catálogos: manutenção pelo Master/perfil com "aprovar"
-- =====================================================================
create function public.nf_catalogo_salvar(p_tenant uuid, p_tabela text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; v_dono uuid;
begin
  if not pode(p_tenant, null, 'notificacoes_contratuais', 'aprovar') then
    raise exception 'Somente o Master ou perfil autorizado mantém os catálogos das notificações.' using errcode = 'insufficient_privilege';
  end if;
  if p_tabela = 'tipos' then
    if v_id is not null then
      select tenant_id into v_dono from nf_tipos_ocorrencia where id = v_id;
      if v_dono is null then  -- item do catálogo geral: só ativa/desativa por cópia do órgão
        insert into nf_tipos_ocorrencia (tenant_id, grupo, nome, descricao, fundamentos, prazo_padrao_dias, ativo, ordem)
        select p_tenant, grupo, nome, descricao, fundamentos, prazo_padrao_dias, ativo, ordem from nf_tipos_ocorrencia where id = v_id returning id into v_id;
      elsif v_dono <> p_tenant then raise exception 'Registro de outro órgão.' using errcode = 'insufficient_privilege';
      end if;
      update nf_tipos_ocorrencia set grupo = p ->> 'grupo', nome = p ->> 'nome', descricao = nullif(p ->> 'descricao', ''),
             fundamentos = coalesce(array(select jsonb_array_elements_text(p -> 'fundamentos')), '{}'),
             prazo_padrao_dias = nullif(p ->> 'prazo_padrao_dias', '')::int, ativo = coalesce((p ->> 'ativo')::boolean, true) where id = v_id;
    else
      insert into nf_tipos_ocorrencia (tenant_id, grupo, nome, descricao, fundamentos, prazo_padrao_dias, ordem)
      values (p_tenant, p ->> 'grupo', p ->> 'nome', nullif(p ->> 'descricao', ''), coalesce(array(select jsonb_array_elements_text(p -> 'fundamentos')), '{}'),
              nullif(p ->> 'prazo_padrao_dias', '')::int, 500) returning id into v_id;
    end if;
  elsif p_tabela = 'fundamentos' then
    if v_id is not null then
      select tenant_id into v_dono from nf_fundamentos where id = v_id;
      if v_dono is null or v_dono <> p_tenant then raise exception 'O catálogo geral é mantido pela plataforma; cadastre um fundamento do órgão.' using errcode = 'insufficient_privilege'; end if;
      update nf_fundamentos set regime = p ->> 'regime', norma = p ->> 'norma', artigo = nullif(p ->> 'artigo', ''), inciso = nullif(p ->> 'inciso', ''), texto = p ->> 'texto',
             vigencia_inicio = nullif(p ->> 'vigencia_inicio', '')::date, vigencia_fim = nullif(p ->> 'vigencia_fim', '')::date, observacoes = nullif(p ->> 'observacoes', ''),
             revisao_pendente = coalesce((p ->> 'revisao_pendente')::boolean, false), ativo = coalesce((p ->> 'ativo')::boolean, true) where id = v_id;
    else
      insert into nf_fundamentos (tenant_id, codigo, regime, norma, artigo, inciso, texto, vigencia_inicio, vigencia_fim, observacoes, revisao_pendente, ordem)
      values (p_tenant, upper(p ->> 'codigo'), p ->> 'regime', p ->> 'norma', nullif(p ->> 'artigo', ''), nullif(p ->> 'inciso', ''), p ->> 'texto',
              nullif(p ->> 'vigencia_inicio', '')::date, nullif(p ->> 'vigencia_fim', '')::date, nullif(p ->> 'observacoes', ''), coalesce((p ->> 'revisao_pendente')::boolean, false), 500)
      returning id into v_id;
    end if;
  elsif p_tabela = 'modelos' then
    if v_id is not null then
      select tenant_id into v_dono from nf_modelos where id = v_id;
      if v_dono is null then
        insert into nf_modelos (tenant_id, tipo, regime, nome, texto) select p_tenant, tipo, regime, nome, texto from nf_modelos where id = v_id returning id into v_id;
      elsif v_dono <> p_tenant then raise exception 'Registro de outro órgão.' using errcode = 'insufficient_privilege';
      end if;
      update nf_modelos set nome = p ->> 'nome', texto = p ->> 'texto', ativo = coalesce((p ->> 'ativo')::boolean, true) where id = v_id;
    else
      insert into nf_modelos (tenant_id, tipo, regime, nome, texto) values (p_tenant, p ->> 'tipo', p ->> 'regime', p ->> 'nome', p ->> 'texto') returning id into v_id;
    end if;
  else
    raise exception 'Catálogo desconhecido.' using errcode = 'check_violation';
  end if;
  return v_id;
end $$;

-- Catálogos efetivos do órgão: o que o órgão personalizou substitui o item geral de mesmo nome/código
create function public.nf_catalogos(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tipos', coalesce((select jsonb_agg(to_jsonb(t) order by t.grupo, t.ordem, t.nome) from nf_tipos_ocorrencia t
                        where (t.tenant_id = p_tenant or (t.tenant_id is null and not exists (select 1 from nf_tipos_ocorrencia o where o.tenant_id = p_tenant and o.nome = t.nome and o.grupo = t.grupo)))), '[]'),
    'fundamentos', coalesce((select jsonb_agg(to_jsonb(x) order by x.ordem, x.codigo) from nf_fundamentos x
                              where (x.tenant_id = p_tenant or x.tenant_id is null) and x.ativo and (x.vigencia_fim is null or x.vigencia_fim >= hoje())), '[]'),
    'modelos', coalesce((select jsonb_agg(to_jsonb(m) order by m.tipo, m.regime) from nf_modelos m
                          where m.ativo and (m.tenant_id = p_tenant or (m.tenant_id is null and not exists (select 1 from nf_modelos o where o.tenant_id = p_tenant and o.tipo = m.tipo and o.regime = m.regime and o.ativo)))), '[]'),
    'pode_configurar', pode(p_tenant, null, 'notificacoes_contratuais', 'aprovar'))
  where membro_do_tenant(p_tenant) or eh_admin_plataforma()
$$;

-- =====================================================================
-- Prazos (rotina diária) e categoria das notificações
-- =====================================================================
create function public.nf_prazos_diarios() returns int
language plpgsql security definer set search_path = public as $$
declare n notificacoes_formais; v_total int := 0;
begin
  for n in select * from notificacoes_formais where status = 'EM_PRAZO' and data_limite < hoje() loop
    update notificacoes_formais set status = 'PRAZO_VENCIDO' where id = n.id;
    insert into nf_tramites (notificacao_id, tenant_id, tipo, status_anterior, status_novo, dados, autor_nome)
    values (n.id, n.tenant_id, 'PRAZO_VENCIDO', n.status, 'PRAZO_VENCIDO', jsonb_build_object('data_limite', n.data_limite), 'Sistema (rotina diária)');
    perform nf_avisar(n, 'NOTIF_FORMAL_PRAZO_VENCIDO', 'Prazo de regularização vencido', 'Venceu em ' || to_char(n.data_limite, 'DD/MM/YYYY') || ' o prazo da ' || nf_rotulo(n) || ' sem registro de regularização. Verifique a situação e avalie o encaminhamento.', 'nf:' || n.id || ':vencido');
    v_total := v_total + 1;
  end loop;
  for n in select * from notificacoes_formais where status = 'EM_PRAZO' and data_limite - hoje() in (0, 2) loop
    perform nf_avisar(n, 'NOTIF_FORMAL_PRAZO_PROXIMO', 'Prazo de notificação próximo do fim', 'O prazo da ' || nf_rotulo(n) || ' termina em ' || to_char(n.data_limite, 'DD/MM/YYYY') || '.', 'nf:' || n.id || ':proximo:' || n.data_limite || ':' || (n.data_limite - hoje()));
  end loop;
  for n in select * from notificacoes_formais where status = 'ENVIADA' and exists (
             select 1 from nf_tramites t where t.notificacao_id = notificacoes_formais.id and t.tipo = 'ENVIO' and t.criado_em < now() - interval '5 days') loop
    perform nf_avisar(n, 'NOTIF_FORMAL_AGUARDANDO_CIENCIA', 'Notificação aguardando ciência', 'A ' || nf_rotulo(n) || ' foi enviada há mais de 5 dias e ainda não tem ciência registrada.', 'nf:' || n.id || ':aguardando-ciencia');
  end loop;
  return v_total;
end $$;

create or replace function public.notificacoes_diarias() returns int
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
  v_total := v_total + nf_prazos_diarios();
  return v_total;
end $$;

insert into public.notificacao_categorias (codigo, modulo, nome, descricao, obrigatoria_padrao, ordem)
values ('CONTRATO_NOTIFICACOES_FORMAIS', 'CONTRATOS', 'Notificações formais às empresas', 'Emissão, ciência, resposta, prazos e resultado das notificações formais dos seus contratos.', true, 65);

create or replace function public.categoria_notificacao(p_modulo text, p_tipo text) returns text
language sql immutable as $$
  select case
    when p_modulo = 'CONTRATOS' and p_tipo like 'NOTIF\_FORMAL\_%' then 'CONTRATO_NOTIFICACOES_FORMAIS'
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
revoke execute on function public.categoria_notificacao(text, text) from public, anon, authenticated;

-- documento anexado a uma notificação não dispara o aviso genérico de "documento anexado ao contrato"
-- (os avisos da notificação já cobrem o fluxo)

-- =====================================================================
-- Permissões das funções
-- =====================================================================
revoke execute on function
  public.nf_protege(), public.nf_somente_acrescimo(), public.nf_tramitar_registro(notificacoes_formais, text, text, jsonb, text),
  public.nf_avisar(notificacoes_formais, text, text, text, text), public.nf_prazos_diarios(), public.notificacoes_diarias(),
  public.somar_dias_uteis(date, int), public.nf_rotulo(notificacoes_formais), public.nf_rotulo(int, int, int)
from public, anon, authenticated;
revoke execute on function
  public.nf_papel_designado(uuid), public.nf_pode_atuar(uuid), public.nf_legivel(uuid), public.nf_anexo_permitido(uuid),
  public.nf_contexto(uuid), public.nf_salvar(jsonb), public.nf_excluir_rascunho(uuid), public.nf_emitir(uuid), public.nf_retificar(uuid, text),
  public.nf_tramitar(uuid, text, jsonb, text), public.nf_registrar_resposta(uuid, jsonb), public.nf_registrar_sancao(jsonb),
  public.nf_situacao_sancao(uuid, text, text), public.nf_obter(uuid), public.nf_painel(uuid, jsonb), public.fornecedor_historico_ocorrencias(uuid),
  public.nf_contratos_disponiveis(uuid, text), public.nf_catalogo_salvar(uuid, text, jsonb), public.nf_catalogos(uuid)
from public, anon;
grant execute on function
  public.nf_papel_designado(uuid), public.nf_pode_atuar(uuid), public.nf_legivel(uuid), public.nf_anexo_permitido(uuid),
  public.nf_contexto(uuid), public.nf_salvar(jsonb), public.nf_excluir_rascunho(uuid), public.nf_emitir(uuid), public.nf_retificar(uuid, text),
  public.nf_tramitar(uuid, text, jsonb, text), public.nf_registrar_resposta(uuid, jsonb), public.nf_registrar_sancao(jsonb),
  public.nf_situacao_sancao(uuid, text, text), public.nf_obter(uuid), public.nf_painel(uuid, jsonb), public.fornecedor_historico_ocorrencias(uuid),
  public.nf_contratos_disponiveis(uuid, text), public.nf_catalogo_salvar(uuid, text, jsonb), public.nf_catalogos(uuid)
to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notificacoes_diarias(), public.nf_prazos_diarios() to service_role;
  end if;
end $$;
