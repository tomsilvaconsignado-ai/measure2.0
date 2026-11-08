-- Consolidado mensal: só entram servidores com data de nomeação no cadastro (nomeados até o fim do mês).
-- Quem está sem a data fica fora da lista, da emissão do documento e das férias do mês (que usam esta função).
CREATE OR REPLACE FUNCTION public.consolidado_mensal(p_tenant uuid, p_unidade uuid, p_ano integer, p_mes integer)
 RETURNS TABLE(servidor_id uuid, matricula text, nome text, cargo text, funcao text, unidade_sigla text, unidade_nome text, data_nomeacao date, data_exoneracao date, atrasos integer, faltas integer, justificativa_anexada boolean, observacao_manual text, observacao text, pode_editar boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'editar') a)
      from servidores s
      join unidades_organizacionais u on u.id = s.unidade_id
      left join frequencias_mensais f on f.servidor_id = s.id and f.ano = p_ano and f.mes = p_mes
     where s.tenant_id = p_tenant
       and (p_unidade is null or p_unidade = any(u.caminho))
       and (s.tenant_id, s.unidade_id) in (select a.tenant_id, a.unidade_id from unidades_acessiveis('servidores', 'ler') a)
       -- só quem tem data de nomeação no cadastro, nomeado até o fim do mês
       and s.data_nomeacao is not null and s.data_nomeacao <= v_fim
       and (s.data_exoneracao is null or s.data_exoneracao >= v_ini)
     order by lower(s.nome), s.matricula;
end $function$;
