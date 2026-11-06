-- Modelo de atesto definido pela SMS Aracaju, com variáveis preenchidas automaticamente pelo sistema
-- (nota, valor e valor por extenso, contrato, empresa, vigência, objeto, unidades atendidas e mês de referência).

update public.configuracoes_globais
   set valor = to_jsonb(E'Estimado Gerente,\nApós análise da documentação encaminhada para atesto, nota fiscal nº {NUMERO_NOTA}, {VALOR_NOTA} ({VALOR_POR_EXTENSO}), do contrato nº {NUMERO_CONTRATO} da {NOME_EMPRESA}. Vigência de {DATA_INICIO} a {DATA_FIM}. Referente ao serviço de {OBJETO_CONTRATO} na {LOCAL_SERVICO}. Referente a {MES_REFERENCIA}.'::text),
       descricao = 'Modelo do texto de atesto. Variáveis: {NUMERO_NOTA} {VALOR_NOTA} {VALOR_POR_EXTENSO} {NUMERO_CONTRATO} {NOME_EMPRESA} {DATA_INICIO} {DATA_FIM} {OBJETO_CONTRATO} {LOCAL_SERVICO} {MES_REFERENCIA} {PROCESSO} {DECRETO}',
       atualizado_em = now()
 where chave = 'texto_atesto_padrao';

-- Texto já salvo pela SMS: corrige só a digitação ("pata", crase antes de data), se ainda estiver como foi salvo
update public.tenant_configuracoes
   set textos = jsonb_set(textos, '{atesto}', to_jsonb(E'Estimado Gerente,\nApós análise da documentação encaminhada para atesto, nota fiscal nº {NUMERO_NOTA}, {VALOR_NOTA} ({VALOR_POR_EXTENSO}), do contrato nº {NUMERO_CONTRATO} da {NOME EMPRESA}. Vigência de {DATA_INICIO} a {DATA_FIM}. Referente ao serviço de {OBJETO_CONTRATO} na {LOCAL_SERVIÇO}. Referente a {MES_REFERENCIA}.'::text))
 where textos ->> 'atesto' like 'Estimado Gerente%encaminhada pata atesto%Vigência {DATA_INICIO} à {DATA_FIM}%';
