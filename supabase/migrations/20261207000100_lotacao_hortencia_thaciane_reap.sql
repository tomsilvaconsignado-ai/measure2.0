-- Correção de cadastro: Hortência de Gois (439.948) e Thaciane de Almeida Menezes (440.218) foram cadastradas
-- com lotação na COINFRA porque são fiscais de contratos da COINFRA, mas pertencem à REAP
-- (SMS › DVAS › REAP). Só a lotação muda; as designações nos contratos continuam as mesmas.
-- Idempotente.

do $$
declare v_reap uuid; v_qtd int;
begin
  select u.id into v_reap
    from public.unidades_organizacionais u
    join public.unidades_organizacionais d on d.id = u.pai_id and d.sigla = 'DVAS'
   where u.sigla = 'REAP' and u.tipo = 'COORDENACAO' and u.ativo;
  if v_reap is null then
    raise notice 'Coordenação REAP (DVAS) não encontrada; nada a fazer.';
    return;
  end if;
  perform usar_justificativa('Correção de lotação: servidora pertence à REAP (DVAS); designações nos contratos da COINFRA mantidas.', 0);
  update public.servidores s
     set unidade_id = v_reap
   where s.tenant_id = (select tenant_id from public.unidades_organizacionais where id = v_reap)
     and s.matricula in ('439.948', '440.218')
     and s.email_institucional in ('hortencia.santos@aracaju.se.gov.br', 'thaciane.menezes@aracaju.se.gov.br')
     and s.unidade_id <> v_reap;
  get diagnostics v_qtd = row_count;
  raise notice 'Servidoras transferidas para a REAP: %', v_qtd;
end $$;
