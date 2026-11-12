-- Correção de cadastro: Lucas Barbosa Nascimento (440.037) foi cadastrado com lotação na COINFRA, mas pertence
-- à REUE (SMS › DVAS › REUE). Só a lotação muda; ele pode ser designado em contratos da COINFRA normalmente.
-- Idempotente.

do $$
declare v_reue uuid; v_qtd int;
begin
  select u.id into v_reue
    from public.unidades_organizacionais u
    join public.unidades_organizacionais d on d.id = u.pai_id and d.sigla = 'DVAS'
   where u.sigla = 'REUE' and u.tipo = 'COORDENACAO' and u.ativo;
  if v_reue is null then
    raise notice 'Coordenação REUE (DVAS) não encontrada; nada a fazer.';
    return;
  end if;
  perform usar_justificativa('Correção de lotação: servidor pertence à REUE (DVAS); pode ser designado em contratos da COINFRA.', 0);
  update public.servidores s
     set unidade_id = v_reue
   where s.tenant_id = (select tenant_id from public.unidades_organizacionais where id = v_reue)
     and s.matricula = '440.037' and s.nome = 'Lucas Barbosa Nascimento'
     and s.unidade_id <> v_reue;
  get diagnostics v_qtd = row_count;
  raise notice 'Servidor transferido para a REUE: %', v_qtd;

  -- o e-mail institucional estava como "reue@gmail.com": corrigido para o da conta dele, o que liga o cadastro
  -- à conta (prepara_servidor) e dá acesso aos contratos em que for designado
  perform usar_justificativa('Correção do e-mail institucional do cadastro (estava reue@gmail.com) para ligar à conta do servidor.', 0);
  update public.servidores s
     set email_institucional = 'lucas.nascimento@aracaju.se.gov.br'
   where s.tenant_id = (select tenant_id from public.unidades_organizacionais where id = v_reue)
     and s.matricula = '440.037' and s.nome = 'Lucas Barbosa Nascimento'
     and s.email_institucional is distinct from 'lucas.nascimento@aracaju.se.gov.br';
end $$;
