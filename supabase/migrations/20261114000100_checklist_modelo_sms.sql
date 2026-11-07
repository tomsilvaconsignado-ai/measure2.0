-- Checklist da nota fiscal no modelo da SMS Aracaju: "Formulário para análise dos documentos que devem
-- acompanhar nota fiscal de prestação de serviços continuados". Dados da nota/contrato preenchidos pelo
-- sistema; itens SIM/NÃO marcados na emissão (padrão do modelo); fiscal por padrão, ou gestor/suplente.

-- Itens do modelo e a marcação inicial (SIM = já vem marcado)
create function public.checklist_itens_padrao() returns jsonb
language sql immutable set search_path = public as $$
  select '[
    {"descricao": "SOLICITAÇÃO DE PAGAMENTO", "marca": "SIM"},
    {"descricao": "NOTA DE EMPENHO", "marca": null},
    {"descricao": "NOTA FISCAL", "marca": "SIM"},
    {"descricao": "DECLARAÇÃO DA EMPRESA SE OPTANTE DO SIMPLES (SE COUBER)", "marca": null},
    {"descricao": "GPS - GUIA DA PREVIDÊNCIA SOCIAL (INSS)", "marca": "SIM"},
    {"descricao": "GRF - GUIA DE RECOLHIMENTO DO FGTS", "marca": "SIM"},
    {"descricao": "PLANILHA MENSAL (Nomes completos dos empregados, funções exercidas (nº de terceirizados por função deve coincidir com o previsto no contrato)", "marca": null},
    {"descricao": "PROTOCOLO DE ENVIO DE ARQUIVOS – CONECTIVIDADE SOCIAL (GFIP)", "marca": null},
    {"descricao": "RELAÇÃO DOS TRABALHADORES CONSTANTES NO ARQUIVO SEFIP", "marca": null},
    {"descricao": "LISTAGEM ANALÍTICA DA FOLHA DE PAGAMENTO", "marca": null},
    {"descricao": "CÓPIA DO COMPROVANTE DE PAGAMENTO DOS EMPREGADOS (DEPÓSITO BANCÁRIO);", "marca": null},
    {"descricao": "FOLHA DE PONTO", "marca": null},
    {"descricao": "VALE TRANSPORTE", "marca": null},
    {"descricao": "AUXÍLIO ALIMENTAÇÃO", "marca": null},
    {"descricao": "CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS", "marca": "SIM"},
    {"descricao": "CERTIDÃO NEGATIVA DE DÉBITOS FEDERAL", "marca": "SIM"},
    {"descricao": "CERTIDÃO NEGATIVA DE DÉBITOS FGTS/CRF", "marca": "SIM"},
    {"descricao": "CERTIDÃO NEGATIVA DE DÉBITOS MUNICIPAL", "marca": "SIM"},
    {"descricao": "CERTIDÃO NEGATIVA DE DÉBITOS ESTADUAL", "marca": "SIM"},
    {"descricao": "REGISTRO AUXILIAR PARA NOTA FISCAL DE SERVIÇOS - RANFS", "marca": "SIM"}
  ]'::jsonb
$$;

-- p_opcoes: { itens: [{descricao, marca: 'SIM'|'NAO'|null}], funcionarios, nota_pendente (bool), designacao_id }
create or replace function public.emitir_checklist_nota(p_nota uuid, p_opcoes jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  n notas_fiscais; c contratos; f fornecedores; v_id uuid; v_textos jsonb; v_itens jsonb := '[]'; it jsonb;
  v_unidades text; v_qtd int; v_siglas int; v_sigla text; v_ini date; v_fim date; v_meses text; v_resp record; v_titulo text;
  v_desig uuid := nullif(p_opcoes ->> 'designacao_id', '')::uuid;
begin
  if not nota_legivel(p_nota) then raise exception 'Nota fiscal não encontrada.' using errcode = 'insufficient_privilege'; end if;
  select * into n from notas_fiscais where id = p_nota;
  if n.cancelada_em is not null then raise exception 'Nota cancelada não recebe checklist.' using errcode = 'check_violation'; end if;
  select * into c from contratos where id = n.contrato_id;
  select * into f from fornecedores where id = n.fornecedor_id;
  select coalesce(textos, '{}') into v_textos from tenant_configuracoes where tenant_id = n.tenant_id;

  -- itens: os marcados na emissão; sem itens, o modelo do órgão ou o padrão
  if jsonb_typeof(p_opcoes -> 'itens') = 'array' and jsonb_array_length(p_opcoes -> 'itens') > 0 then
    if jsonb_array_length(p_opcoes -> 'itens') > 40 then raise exception 'No máximo 40 itens no checklist.' using errcode = 'check_violation'; end if;
    for it in select * from jsonb_array_elements(p_opcoes -> 'itens') loop
      if coalesce(length(btrim(it ->> 'descricao')), 0) not between 2 and 300 then
        raise exception 'Item do checklist sem descrição.' using errcode = 'check_violation', hint = 'itens';
      end if;
      if (it ->> 'marca') is not null and (it ->> 'marca') not in ('SIM', 'NAO') then
        raise exception 'Marcação inválida no item "%".', it ->> 'descricao' using errcode = 'check_violation', hint = 'itens';
      end if;
      v_itens := v_itens || jsonb_build_object('descricao', btrim(it ->> 'descricao'), 'marca', it ->> 'marca');
    end loop;
  else
    v_itens := checklist_itens_padrao();
  end if;

  -- unidade: várias com a mesma sigla → só a sigla; senão sigla (ou nome) de cada uma
  select count(*), count(distinct upper(btrim(ua.sigla))) filter (where nullif(btrim(ua.sigla), '') is not null),
         min(upper(btrim(ua.sigla))), string_agg(coalesce(nullif(btrim(ua.sigla), ''), ua.nome), ', ' order by ua.nome)
    into v_qtd, v_siglas, v_sigla, v_unidades
    from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = p_nota;
  if v_qtd = 1 then
    select ua.nome into v_unidades from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id where nu.nota_id = p_nota;
  elsif v_qtd > 1 and v_siglas = 1 and (select count(*) from nota_unidades nu join unidades_atendidas ua on ua.id = nu.unidade_atendida_id
                                         where nu.nota_id = p_nota and nullif(btrim(ua.sigla), '') is null) = 0 then
    v_unidades := v_sigla;
  end if;

  -- período de execução: o da nota ou, sem ele, do 1º ao último dia dos meses de referência
  select min(make_date(r.ano, r.mes, 1)), max((make_date(r.ano, r.mes, 1) + interval '1 month - 1 day')::date),
         string_agg(lpad(r.mes::text, 2, '0') || '/' || r.ano, ', ' order by r.ano, r.mes)
    into v_ini, v_fim, v_meses from nota_referencias r where r.nota_id = p_nota;
  v_ini := coalesce(n.periodo_inicio, v_ini); v_fim := coalesce(n.periodo_fim, v_fim);

  -- quem assina: a designação escolhida (vigente no contrato) ou, por padrão, o fiscal
  select d.papel, s.nome, s.matricula into v_resp
    from contrato_designacoes d join servidores s on s.id = d.servidor_id
   where d.contrato_id = c.id and d.fim is null and (v_desig is null or d.id = v_desig)
   order by case d.papel when 'FISCAL' then 1 when 'GESTOR' then 2 else 3 end, d.inicio desc limit 1;
  if v_desig is not null and v_resp.papel is null then
    raise exception 'O responsável escolhido não está designado neste contrato.' using errcode = 'check_violation', hint = 'designacao_id';
  end if;

  v_titulo := nullif(btrim(v_textos ->> 'checklist_titulo'), '');
  if v_titulo is null or upper(v_titulo) = 'CHECKLIST DE NOTA FISCAL' then
    v_titulo := 'FORMULÁRIO PARA ANÁLISE DOS DOCUMENTOS QUE DEVEM ACOMPANHAR NOTA FISCAL DE PRESTAÇÃO DE SERVIÇOS CONTINUADOS';
  end if;

  insert into documentos_emitidos (tenant_id, unidade_id, tipo, registro_id, titulo, dados)
  values (n.tenant_id, n.unidade_id, 'CHECKLIST_NOTA', p_nota, 'Checklist da NF ' || n.numero, jsonb_build_object(
    'modelo', 'SERVICOS_CONTINUADOS',
    'orgao', cabecalho_orgao(n.tenant_id),
    'titulo', v_titulo,
    'contrato', jsonb_build_object('numero', c.numero, 'objeto', c.objeto),
    'fornecedor', jsonb_build_object('nome', coalesce(f.razao_social, f.nome_fantasia), 'documento', f.documento, 'tipo', f.tipo_pessoa,
                                     'contato', f.nome_contato, 'telefone', f.telefone, 'email', f.email),
    'unidade', v_unidades,
    'funcionarios', nullif(btrim(p_opcoes ->> 'funcionarios'), ''),
    'periodo_inicio', v_ini, 'periodo_fim', v_fim,
    'nota', jsonb_build_object('numero', n.numero, 'serie', n.serie, 'valor', n.valor,
                               'apresentacao', (n.data_inclusao at time zone 'America/Sao_Paulo')::date),
    'meses', v_meses,
    'itens', v_itens,
    'nota_pendente', coalesce((p_opcoes ->> 'nota_pendente')::boolean, false),
    'responsavel', case when v_resp.papel is not null then jsonb_build_object('papel', v_resp.papel, 'nome', v_resp.nome, 'matricula', v_resp.matricula) end,
    'emitido_por', (select nome from perfis where id = auth.uid()),
    'emitido_em', now()))
  returning id into v_id;
  return v_id;
end $$;

-- A chamada antiga (sem opções) passa a emitir o modelo novo com as marcações padrão
create or replace function public.emitir_checklist_nota(p_nota uuid) returns uuid
language sql security definer set search_path = public as $$
  select emitir_checklist_nota(p_nota, '{}'::jsonb)
$$;

revoke execute on function public.checklist_itens_padrao(), public.emitir_checklist_nota(uuid, jsonb) from public, anon;
grant execute on function public.checklist_itens_padrao(), public.emitir_checklist_nota(uuid, jsonb) to authenticated;
