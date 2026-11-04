// Convites de usuários do MEASURE.
//
// POST { acao: 'convidar', email, nome?, tenant_id, unidade_id?, papel, redirect_to? }
//   1. valida a concessão COMO QUEM CHAMA (RPC validar_concessao: escopo, papel, domínio do órgão);
//   2. se a conta não existe, cria e envia o convite por e-mail (chave de serviço);
//   3. concede o vínculo COMO QUEM CHAMA (RPC conceder_vinculo, auditada).
// POST { acao: 'reenviar', user_id, redirect_to? }
//   reenvia o convite (conta ainda não ativada) ou um link para criar nova senha.
//
// A chave de serviço só é usada para criar a conta e enviar e-mail, depois que o banco autorizou.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const URLS_PERMITIDAS = (Deno.env.get('APP_URLS') ??
  'https://tomsilvaconsignado-ai.github.io/measure2.0/,http://localhost:5173/').split(',').map((s) => s.trim());

class ErroHttp extends Error {
  constructor(public status: number, message: string, public campo?: string) { super(message); }
}

const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function destino(redirect?: string) {
  if (redirect && URLS_PERMITIDAS.some((u) => redirect.startsWith(u))) return redirect;
  return URLS_PERMITIDAS[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido.' });
  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const jwt = authorization.replace(/^Bearer\s+/i, '');
    if (!jwt) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.');

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const comoUsuario = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: erroUsuario } = await comoUsuario.auth.getUser(jwt);
    if (erroUsuario || !user) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.');
    const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

    const corpo = await req.json().catch(() => ({}));
    const redirectTo = destino(corpo.redirect_to);

    if (corpo.acao === 'convidar') {
      const email = String(corpo.email ?? '').trim().toLowerCase();
      const params = { p_email: email, p_tenant: corpo.tenant_id, p_unidade: corpo.unidade_id ?? null, p_papel: corpo.papel };
      const { data: validacao, error: e1 } = await comoUsuario.rpc('validar_concessao', params);
      if (e1) throw new ErroHttp(400, e1.message, e1.hint ?? undefined);

      let contaCriada = false;
      let emailEnviado = false;
      if (!validacao.existe_usuario) {
        const nome = String(corpo.nome ?? '').trim().slice(0, 200);
        const { error } = await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo });
        if (error) throw new ErroHttp(502, `Não foi possível enviar o convite: ${error.message}`);
        contaCriada = true;
        emailEnviado = true;
      }
      const { data: vinculoId, error: e2 } = await comoUsuario.rpc('conceder_vinculo', params);
      if (e2) throw new ErroHttp(400, e2.message, e2.hint ?? undefined);
      return responder(200, { vinculo_id: vinculoId, conta_criada: contaCriada, email_enviado: emailEnviado });
    }

    if (corpo.acao === 'reenviar') {
      const { data: pode, error: e1 } = await comoUsuario.rpc('pode_gerir_usuario', { p_user: corpo.user_id });
      if (e1) throw new ErroHttp(400, e1.message);
      if (!pode) throw new ErroHttp(403, 'Você não administra o acesso desta pessoa.');
      const { data: alvo, error: e2 } = await admin.auth.admin.getUserById(corpo.user_id);
      if (e2 || !alvo.user?.email) throw new ErroHttp(404, 'Usuário não encontrado.');
      // Serve aos dois casos: o link de criar senha também confirma o e-mail de quem nunca ativou.
      const ativou = !!alvo.user.last_sign_in_at;
      const { error: e3 } = await admin.auth.resetPasswordForEmail(alvo.user.email, { redirectTo });
      if (e3) throw new ErroHttp(502, `Não foi possível enviar o e-mail: ${e3.message}`);
      return responder(200, { email_enviado: true, tipo: ativou ? 'nova_senha' : 'ativacao' });
    }

    throw new ErroHttp(400, 'Ação inválida.');
  } catch (e) {
    if (e instanceof ErroHttp) return responder(e.status, { erro: e.message, campo: e.campo });
    console.error(e);
    return responder(500, { erro: 'Erro inesperado no servidor. Tente novamente.' });
  }
});
