-- O catálogo completo já foi carregado (273 mil códigos). Para não ocupar mais espaço no banco, a atualização semanal
-- automática fica desligada: o que não estiver no catálogo local é pesquisado pelo código direto na fonte oficial.
-- A função catalogo_atualizar_lote continua existindo para uma atualização manual, se for preciso.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from cron.job where jobname = 'measure-catalogo-compras') then
    perform cron.unschedule('measure-catalogo-compras');
  end if;
end $$;
