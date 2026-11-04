// Aplica as migrações de supabase/migrations (em ordem) num Postgres real em memória (PGlite),
// com stubs mínimos de auth/storage do Supabase, e testa as regras agindo como cada usuário.
//
//   npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'fs';

const dir = new URL('../migrations/', import.meta.url);
const migrations = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
export const db = new PGlite({ extensions: { pg_trgm } });

const stubs = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Padrão do Supabase: o que nasce em public já vem liberado para os papéis da API
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA extensions;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO anon, authenticated;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO authenticated;
`;

let failures = 0;
const ok = (msg) => console.log('  ✔', msg);
const bad = (msg) => { failures++; console.log('  ✘', msg); };

export async function as(uid, sql, params = []) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'SET ROLE authenticated' : 'SET ROLE anon');
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
async function expectFail(label, uid, sql, params, pattern) {
  try {
    const r = await as(uid, sql, params);
    if (r.affectedRows === 0 && /^\s*(update|delete)/i.test(sql)) ok(label + ' (0 linhas afetadas)');
    else bad(label + ' — deveria falhar, mas passou');
  } catch (e) {
    const msg = e.message.split('\n')[0];
    if (pattern && !pattern.test(msg)) bad(`${label} — falhou com mensagem inesperada: ${msg}`);
    else ok(`${label} → ${msg}`);
  }
}
async function expectOk(label, uid, sql, params) {
  try { const r = await as(uid, sql, params); ok(label); return r; }
  catch (e) { bad(label + ' — erro: ' + e.message.split('\n')[0]); return null; }
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const check = (cond, label) => (cond ? ok(label) : bad(label));

await db.exec(stubs);
await db.exec(`SET search_path = public, extensions`);
const migration = (f) => fs.readFileSync(new URL(f, dir), 'utf8')
  .replace(/create extension if not exists "?pgcrypto"?[^;]*;/gi, '');
console.log('Migrações');
for (const f of migrations) {
  try { await db.exec(migration(f)); ok(f); }
  catch (e) { bad(f + ' — ' + e.message); process.exit(1); }
}

const tests = (await import('./cases.mjs')).default;
await tests({ db, as, ok, bad, check, expectOk, expectFail, one });

console.log(failures ? `\n${failures} FALHA(S)` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
