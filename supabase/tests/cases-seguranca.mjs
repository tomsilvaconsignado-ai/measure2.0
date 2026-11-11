// Auditoria de segurança (11/11/2026): MFA obrigatório para administradores e proteção do PUSH.
// Cada falha encontrada tem o teste negativo (bloqueia) e o positivo (o uso legítimo continua).
export default async function ({ db, as, ok, bad, check, expectOk, expectFail, one, u, A }) {
  await db.exec('RESET ROLE');
  console.log('Auditoria de segurança: verificação em duas etapas (MFA)');
  const tenta = async (uid, sql, params, aal) => { try { return { r: await as(uid, sql, params, aal) }; } catch (e) { return { e }; } };

  // pré-requisição da API (roda antes de toda chamada no Supabase)
  let x = await tenta(u.masterA, `SELECT public.verificar_mfa()`, [], 'aal1');
  check(x.e && /duas etapas/.test(x.e.message), 'MASTER sem o código confirmado é barrado na entrada da API');
  x = await tenta(u.plat, `SELECT public.verificar_mfa()`, [], 'aal1');
  check(!!x.e, 'administrador da plataforma sem o código confirmado é barrado');
  x = await tenta(u.masterA, `SELECT public.verificar_mfa()`, [], 'aal2');
  check(!x.e, 'MASTER com o código confirmado (aal2) passa');
  x = await tenta(u.adminCoinfra, `SELECT public.verificar_mfa()`, [], 'aal1');
  check(!x.e, 'usuário operacional sem MFA ativado continua entrando normalmente');
  x = await tenta(null, `SELECT count(*) FROM tenants`, [], 'aal1');
  check(!!x.e, 'sem login continua sem acesso a nada');

  // política restritiva: nem leitura nem escrita direta nas tabelas
  x = await tenta(u.masterA, `SELECT count(*)::int n FROM tenants`, [], 'aal1');
  check(x.r?.rows[0].n === 0, 'MASTER sem o código não lê nenhuma tabela (política restritiva)');
  x = await tenta(u.masterA, `SELECT count(*)::int n FROM tenants`, [], 'aal2');
  check(x.r?.rows[0].n >= 1, 'MASTER com o código confirmado lê normalmente');
  x = await tenta(u.masterA, `UPDATE tenants SET nome_curto = nome_curto WHERE id = $1`, [A], 'aal1');
  check(!x.e && x.r.affectedRows === 0, 'MASTER sem o código não altera registros');
  x = await tenta(u.plat, `SELECT count(*)::int n FROM perfis`, [], 'aal1');
  check(x.r?.rows[0].n === 0, 'plataforma sem o código não lê perfis');

  // quem ativou o MFA por conta própria também fica protegido
  await db.query(`INSERT INTO auth.mfa_factors (user_id, status) VALUES ($1, 'verified')`, [u.adminCoinfra]);
  x = await tenta(u.adminCoinfra, `SELECT public.verificar_mfa()`, [], 'aal1');
  check(!!x.e, 'quem ativou o MFA precisa do código em toda sessão');
  x = await tenta(u.adminCoinfra, `SELECT count(*)::int n FROM tenants`, [], 'aal2');
  check(x.r?.rows[0].n >= 1, 'e com o código confirmado usa normalmente');
  await db.query(`DELETE FROM auth.mfa_factors WHERE user_id = $1`, [u.adminCoinfra]);
  await db.query(`INSERT INTO auth.mfa_factors (user_id, status) VALUES ($1, 'unverified')`, [u.adminCoinfra]);
  x = await tenta(u.adminCoinfra, `SELECT public.verificar_mfa()`, [], 'aal1');
  check(!x.e, 'autenticador cadastrado mas não confirmado não bloqueia a conta');
  await db.query(`DELETE FROM auth.mfa_factors WHERE user_id = $1`, [u.adminCoinfra]);

  const semPolitica = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'mfa_obrigatorio')`);
  check(semPolitica.rows.length === 0, 'toda tabela com RLS tem a política restritiva de MFA ' + (semPolitica.rows.length ? JSON.stringify(semPolitica.rows) : ''));
  x = await tenta(u.adminCoinfra, `SELECT public.exige_mfa()`, [], 'aal2');
  check(!!x.e, 'funções internas do MFA não são chamáveis pela API');

  console.log('Auditoria de segurança: PUSH (SSRF, limite de aparelhos e tomada de inscrição)');
  const chaves = ['B' + 'x'.repeat(86), 'y'.repeat(22)];
  const outras = ['C' + 'z'.repeat(86), 'w'.repeat(22)];
  await expectFail('endereço fora dos serviços de push é recusado (SSRF)', u.adminCoinfra,
    `SELECT registrar_inscricao_push('https://atacante.exemplo.com/coletor', $1, $2, 'x')`, chaves, /inválido/);
  await expectFail('endereço interno disfarçado é recusado', u.adminCoinfra,
    `SELECT registrar_inscricao_push('https://fcm.googleapis.com.atacante.com/x12345678', $1, $2, 'x')`, chaves, /inválido/);
  await expectFail('gravar endereço inválido direto na tabela também é barrado', null,
    `INSERT INTO push_inscricoes (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://atacante.exemplo.com/x', $2, $3)`, [u.adminCoinfra, ...chaves]);
  for (const ep of ['https://fcm.googleapis.com/fcm/send/aud-ok-1', 'https://updates.push.services.mozilla.com/wpush/v2/aud-ok-2',
    'https://web.push.apple.com/QaudOk3abcdef', 'https://wns2-bl2p.notify.windows.com/w/?token=audok4']) {
    await expectOk('serviço de push legítimo aceito: ' + ep.split('/')[2], u.adminCoinfra, `SELECT registrar_inscricao_push($1, $2, $3, 'x')`, [ep, ...chaves]);
  }
  await expectFail('outra conta não toma a inscrição só por conhecer o endereço', u.masterA,
    `SELECT registrar_inscricao_push('https://fcm.googleapis.com/fcm/send/aud-ok-1', $1, $2, 'x')`, outras, /outra conta/);
  await expectOk('mesmo navegador (mesmas chaves) troca de conta normalmente', u.masterA,
    `SELECT registrar_inscricao_push('https://fcm.googleapis.com/fcm/send/aud-ok-1', $1, $2, 'x')`, chaves);
  check((await one(`SELECT user_id FROM push_inscricoes WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/aud-ok-1'`)).user_id === u.masterA,
    'a inscrição passou para a conta que entrou no aparelho');
  for (let i = 0; i < 12; i++) {
    await as(u.adminCoinfra, `SELECT registrar_inscricao_push($1, $2, $3, 'x')`, [`https://fcm.googleapis.com/fcm/send/limite-${i}`, ...chaves]);
  }
  const ativos = (await one(`SELECT count(*)::int n FROM push_inscricoes WHERE user_id = $1 AND ativo`, [u.adminCoinfra])).n;
  check(ativos === 10, `no máximo 10 aparelhos ativos por pessoa (ativos: ${ativos})`);
  check((await one(`SELECT ativo FROM push_inscricoes WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/limite-11'`)).ativo === true,
    'o aparelho mais recente fica ativo');
  await db.query(`DELETE FROM push_inscricoes WHERE endpoint LIKE '%aud-ok%' OR endpoint LIKE '%audok%' OR endpoint LIKE '%limite-%' OR endpoint LIKE '%QaudOk%'`);
}
