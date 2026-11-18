-- Chamada à API do Compras.gov.br: o tempo de conexão padrão da extensão http é de 1 segundo, curto para o servidor do
-- governo em horários de pico ("Connection timed out after 1001 milliseconds" interrompeu a carga do catálogo).
-- Agora: 10 s para conectar, 45 s no total e uma nova tentativa em falha passageira de rede.
create or replace function public.compras_gov_get(p_caminho text, p_parametros jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_query text;
  v_url text;
  v_status int;
  v_conteudo text;
  v_tentativa int := 0;
begin
  if p_caminho !~ '^/modulo-[a-z-]+/[0-9]_[A-Za-z_]+$' then
    raise exception 'Consulta não permitida.' using errcode = 'insufficient_privilege';
  end if;
  if to_regprocedure('extensions.http_get(character varying)') is null then
    raise exception 'A consulta aos dados abertos do Compras.gov.br não está disponível neste ambiente.' using errcode = 'feature_not_supported';
  end if;
  select string_agg(k || '=' || v, '&' order by k) into v_query
    from jsonb_each_text(p_parametros) as e(k, v)
   where v is not null and v <> '';
  v_url := 'https://dadosabertos.compras.gov.br' || p_caminho || '?' || coalesce(v_query, '');
  begin
    execute 'select extensions.http_set_curlopt(''CURLOPT_CONNECTTIMEOUT_MS'', ''10000'')';
    execute 'select extensions.http_set_curlopt(''CURLOPT_TIMEOUT_MS'', ''45000'')';
  exception when others then null;  -- versões antigas da extensão: usa o tempo padrão
  end;
  loop
    v_tentativa := v_tentativa + 1;
    begin
      execute 'select status, content from extensions.http_get($1)' into v_status, v_conteudo using v_url;
      exit when v_status < 500 or v_tentativa >= 2;  -- 5xx do governo: tenta de novo uma vez
    exception when others then
      if v_tentativa >= 2 then
        raise exception 'Não foi possível falar com o Compras.gov.br agora (%). Tente de novo em alguns minutos.', left(sqlerrm, 120)
          using errcode = 'external_routine_exception';
      end if;
    end;
    perform pg_sleep(1);
  end loop;
  if v_status = 404 then
    return jsonb_build_object('resultado', '[]'::jsonb, 'totalRegistros', 0, 'totalPaginas', 0, 'paginasRestantes', 0);
  end if;
  if v_status <> 200 then
    raise exception 'O Compras.gov.br não respondeu à consulta (código %). Tente de novo em alguns minutos.', v_status using errcode = 'external_routine_exception';
  end if;
  begin
    return v_conteudo::jsonb;
  exception when others then
    raise exception 'O Compras.gov.br devolveu uma resposta inválida. Tente de novo em alguns minutos.' using errcode = 'external_routine_exception';
  end;
end $$;

revoke execute on function public.compras_gov_get(text, jsonb) from public, anon, authenticated;
