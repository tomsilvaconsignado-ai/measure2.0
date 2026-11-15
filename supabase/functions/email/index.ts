// Envio dos avisos de contrato por E-MAIL aos responsáveis (gestor, fiscal e suplente).
//
// Chamada pelo próprio banco (pg_net, logo depois de gerar notificações, e pg_cron a cada minuto para as
// novas tentativas), com o cabeçalho x-email-segredo. Reserva lotes da fila (email_reservar), envia cada
// um e devolve o resultado (email_concluir): sucesso ou falha temporária (nova tentativa mais tarde).
//
// Segredos (Supabase > Edge Functions > Secrets), nunca no repositório:
//   EMAIL_SEGREDO      mesmo valor do segredo "email_disparo_segredo" do Vault (quem chama precisa dele)
//   EMAIL_REMETENTE    ex.: "MEASURE <avisos@measuregcp.com.br>"
//   EMAIL_APP_URL      endereço do sistema para os links (padrão https://measuregcp.com.br)
//   Provedor (um dos dois):
//     RESEND_API_KEY                                  envio pela API da Resend
//     SMTP_HOST, SMTP_PORTA, SMTP_USUARIO, SMTP_SENHA  envio por SMTP com TLS (ex.: Gmail, porta 465)
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

interface Item { id: number; para: string; nome: string | null; titulo: string; descricao: string; link: string; contrato: string | null; orgao: string | null }

const LIMITE_MS = 25_000;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function montar(i: Item, appUrl: string) {
  // só links internos do sistema (o banco grava caminhos começando com "/")
  const caminho = i.link.startsWith('/') && !i.link.startsWith('//') ? i.link : '/minhas-notificacoes';
  const url = appUrl + caminho;
  const assunto = `[MEASURE] ${i.titulo}${i.contrato ? ` · Contrato nº ${i.contrato}` : ''}`.slice(0, 180);
  const ola = i.nome ? `Olá, ${esc(i.nome.split(' ')[0])}!` : 'Olá!';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(assunto)}</title></head><body style="margin:0;background:#eef2f8;font-family:Segoe UI,Arial,sans-serif;color:#0f2a4a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0f2a4a;background-image:linear-gradient(135deg,#0b1f38,#2f66bd);padding:22px 28px;color:#ffffff">
<div style="font-size:20px;font-weight:800;letter-spacing:.5px">MEASURE</div>
<div style="font-size:12px;opacity:.8">Gestão pública 2.0${i.orgao ? ` · ${esc(i.orgao)}` : ''}</div></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 6px;font-size:15px;color:#475569">${ola}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f2a4a">${esc(i.titulo)}</h1>
${i.contrato ? `<p style="margin:0 0 12px"><span style="display:inline-block;background:#ecfbf6;color:#0a6e54;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700">Contrato nº ${esc(i.contrato)}</span></p>` : ''}
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#334155">${esc(i.descricao)}</p>
<a href="${esc(url)}" style="display:inline-block;background:#f5b70a;color:#0b1f38;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:12px">Abrir no MEASURE</a>
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">Você recebeu este aviso porque é responsável (gestor, fiscal ou suplente) por este contrato. Para escolher quais avisos chegam por e-mail, acesse <a href="${esc(appUrl)}/minhas-notificacoes" style="color:#2f66bd">Minhas notificações</a>.</p>
</td></tr></table></td></tr></table></body></html>`;
  const texto = `${i.nome ? `Olá, ${i.nome.split(' ')[0]}!` : 'Olá!'}\n\n${i.titulo}\n${i.contrato ? `Contrato nº ${i.contrato}\n` : ''}\n${i.descricao}\n\nAbrir no MEASURE: ${url}\n\nPara escolher quais avisos chegam por e-mail: ${appUrl}/minhas-notificacoes`;
  return { assunto, html, texto };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });
  const segredo = Deno.env.get('EMAIL_SEGREDO');
  if (!segredo || req.headers.get('x-email-segredo') !== segredo) return new Response('Não autorizado', { status: 401 });

  const remetente = Deno.env.get('EMAIL_REMETENTE');
  const appUrl = (Deno.env.get('EMAIL_APP_URL') ?? 'https://measuregcp.com.br').replace(/\/$/, '');
  const resend = Deno.env.get('RESEND_API_KEY');
  const smtpHost = Deno.env.get('SMTP_HOST');
  if (!remetente || (!resend && !smtpHost)) return new Response('Provedor de e-mail não configurado', { status: 500 });

  const porta = Number(Deno.env.get('SMTP_PORTA') ?? '465');
  const smtp = !resend && smtpHost ? nodemailer.createTransport({
    host: smtpHost, port: porta, secure: porta === 465,
    auth: { user: Deno.env.get('SMTP_USUARIO'), pass: Deno.env.get('SMTP_SENHA') },
  }) : null;

  async function enviar(i: Item) {
    const m = montar(i, appUrl);
    if (resend) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: remetente, to: [i.para], subject: m.assunto, html: m.html, text: m.texto }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    } else {
      await smtp!.sendMail({ from: remetente, to: i.para, subject: m.assunto, html: m.html, text: m.texto });
    }
  }

  const banco = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const inicio = Date.now();
  let enviados = 0, falhas = 0;
  while (Date.now() - inicio < LIMITE_MS) {
    const { data, error } = await banco.rpc('email_reservar', { p_limite: 20 });
    if (error) return Response.json({ erro: error.message }, { status: 500 });
    const lote = (data ?? []) as Item[];
    if (!lote.length) break;
    const resultados = [];
    for (const i of lote) {  // um por vez: respeita o limite de envio do provedor
      try { await enviar(i); enviados++; resultados.push({ id: i.id, ok: true }); }
      catch (e) { falhas++; resultados.push({ id: i.id, ok: false, erro: String((e as Error)?.message ?? e).slice(0, 400) }); }
    }
    const { error: e2 } = await banco.rpc('email_concluir', { p_resultados: resultados });
    if (e2) return Response.json({ erro: e2.message }, { status: 500 });
  }
  smtp?.close();
  return Response.json({ enviados, falhas });
});
