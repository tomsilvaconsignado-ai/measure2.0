-- Correção da estrutura: a COINFRA (Coordenação de Infraestrutura) pertence à DADM (Diretoria
-- Administrativa), não à DIRCLIN. O caminho passa a ser SMS › DADM › COINFRA.
--
-- * A COINFRA muda de diretoria com tudo o que tem abaixo dela (gerências e setores); os gatilhos
--   da tabela recalculam o caminho dela e dos descendentes. Os acessos não mudam: quem está
--   vinculado à COINFRA continua vendo o mesmo.
-- * As lotações já gravadas nas designações ("retrato" do momento) são corrigidas no texto.
--   Durante essa correção ficam desligados só o gatilho que congela o retrato e o que avisa os
--   designados (não é uma alteração de designação); a auditoria continua registrando tudo.
-- * Idempotente: rodar de novo não muda nada.

begin;

update public.unidades_organizacionais u
   set pai_id = d.id
  from public.unidades_organizacionais dir, public.unidades_organizacionais d
 where u.sigla = 'COINFRA'
   and u.pai_id = dir.id and dir.sigla = 'DIRCLIN'
   and d.sigla = 'DADM' and d.tenant_id = u.tenant_id and d.pai_id = dir.pai_id;

alter table public.contrato_designacoes disable trigger designacoes_prepara;
alter table public.contrato_designacoes disable trigger designacoes_notificar;

update public.contrato_designacoes
   set lotacao_descricao = replace(lotacao_descricao, 'SMS › DIRCLIN › COINFRA', 'SMS › DADM › COINFRA')
 where lotacao_descricao like 'SMS › DIRCLIN › COINFRA%';

alter table public.contrato_designacoes enable trigger designacoes_prepara;
alter table public.contrato_designacoes enable trigger designacoes_notificar;

commit;
