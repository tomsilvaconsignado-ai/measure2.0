// Gera os modelos de e-mail do login (Supabase Auth) com a identidade MEASURE e publica
// junto com as regras de autenticação do projeto.
//
//   node supabase/templates/build.mjs                  → grava os .html nesta pasta
//   SUPABASE_ACCESS_TOKEN=sbp_... node supabase/templates/build.mjs --publicar
//                                                       → envia modelos + regras ao projeto
//   ... --publicar com SMTP_PASS=<senha de app do Gmail> → também configura o SMTP
//
// A senha do SMTP nunca é gravada em arquivo: só vem da variável de ambiente.
// Variáveis {{ .X }} são do Supabase e ficam como estão.
import fs from 'fs';

const PROJECT_REF = 'cazsjehsqqyfawofefpe';
const SITE = 'https://measuregcp.com.br/';
// endereço anterior: continua aceito no login durante a transição
const SITE_ANTERIOR = 'https://tomsilvaconsignado-ai.github.io/measure2.0/';
const REMETENTE = 'measuresistemas@gmail.com';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Layout institucional: faixa azul com a marca, cartão branco, botão azul e rodapé discreto. */
function layout({ preheader, title, intro, button, url = '{{ .ConfirmationURL }}', after = '', code = '' }) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe3ee">
  <tr><td style="background:#0f2a4a;padding:22px 28px">
    <span style="font-size:22px;font-weight:800;letter-spacing:4px;color:#ffffff">MEASURE</span>
    <span style="font-size:11px;letter-spacing:1px;color:#93c5fd;padding-left:8px">Gestão de contratos e despesas públicas</span>
  </td></tr>
  <tr><td style="height:4px;background:#2563eb"></td></tr>
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${esc(title)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">${intro}</p>
    ${button ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0 20px">
      <a href="${url}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:8px">${esc(button)}</a>
    </td></tr></table>` : ''}
    ${code ? `<p style="margin:0 0 20px"><span style="display:inline-block;font-size:28px;letter-spacing:8px;font-weight:800;color:#0f172a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 18px">${code}</span></p>` : ''}
    ${after}
    ${button ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#64748b">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${url}" style="color:#1d4ed8;word-break:break-all">${url}</a></p>` : ''}
  </td></tr>
  <tr><td style="padding:14px 28px 26px">
    <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8">Não reconhece esta mensagem? Ignore-a: nada muda na sua conta. Nunca pedimos sua senha por e-mail.</p>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;font-size:12px;color:#64748b">
    <strong style="color:#0f2a4a">MEASURE 2.0</strong> · Mensagem automática, não responda.<br>
    <a href="${SITE}" style="color:#1d4ed8;text-decoration:none">Acessar o sistema</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

// Links de convite e de nova senha abrem uma página do próprio MEASURE (?token_hash=...), que só ativa no
// clique do botão. O {{ .ConfirmationURL }} direto do Supabase é de uso único e os filtros de segurança do
// e-mail institucional o abriam antes da pessoa, deixando o link "já usado".
const linkPagina = (tipo) => `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=${tipo}`;

const nota = (texto) => `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#334155;background:#f1f5f9;border-left:4px solid #2563eb;padding:10px 12px;border-radius:6px">${texto}</p>`;

// Avisos de segurança (sem botão)
const aviso = (title, text) => layout({
  preheader: title, title, intro: text, button: '',
  after: nota(`Se não foi você, troque sua senha em <a href="${SITE}esqueci-senha" style="color:#1d4ed8">Esqueci minha senha</a> e avise o administrador do sistema no seu órgão.`),
});

export const EMAILS = {
  invite: {
    subject: 'Seu acesso ao MEASURE foi criado',
    html: layout({
      preheader: 'Ative seu acesso e crie sua senha.',
      title: 'Você recebeu acesso ao MEASURE',
      intro: 'O administrador do seu órgão cadastrou você no <strong>MEASURE</strong>, o sistema de gestão de contratos e despesas. Clique no botão para abrir a página de ativação; lá, clique em <strong>Ativar meu acesso</strong> e crie sua senha.',
      button: 'Ativar meu acesso',
      url: linkPagina('invite'),
      after: nota('O link vale por 24 horas e só pode ser usado uma vez. Se expirar, peça ao administrador para reenviar o convite.'),
    }),
  },
  recovery: {
    subject: 'Redefinição de senha · MEASURE',
    html: layout({
      preheader: 'Crie uma nova senha de acesso.',
      title: 'Redefinir sua senha',
      intro: 'Recebemos um pedido para redefinir a senha da conta <strong>{{ .Email }}</strong>. Clique no botão para abrir a página e escolher uma nova senha.',
      button: 'Criar nova senha',
      url: linkPagina('recovery'),
      after: nota('O link vale por 24 horas e só pode ser usado uma vez.'),
    }),
  },
  confirmation: {
    subject: 'Confirme seu e-mail · MEASURE',
    html: layout({
      preheader: 'Confirme o seu e-mail para ativar o acesso.',
      title: 'Confirme seu e-mail',
      intro: 'Clique no botão para confirmar o e-mail <strong>{{ .Email }}</strong> e ativar o seu acesso ao MEASURE.',
      button: 'Confirmar e-mail',
      after: nota('O link vale por 1 hora.'),
    }),
  },
  magic_link: {
    subject: 'Seu link de acesso · MEASURE',
    html: layout({
      preheader: 'Entre no sistema com um clique.',
      title: 'Seu link de acesso',
      intro: 'Clique no botão para entrar no MEASURE com a conta <strong>{{ .Email }}</strong>.',
      button: 'Entrar no sistema',
      after: nota('O link vale por 1 hora e só pode ser usado uma vez.'),
    }),
  },
  email_change: {
    subject: 'Confirme a troca de e-mail · MEASURE',
    html: layout({
      preheader: 'Confirme o novo e-mail da sua conta.',
      title: 'Confirme o novo e-mail',
      intro: 'Recebemos um pedido para trocar o e-mail da sua conta de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>. Clique no botão para confirmar.',
      button: 'Confirmar novo e-mail',
    }),
  },
  reauthentication: {
    subject: '{{ .Token }} é o seu código de verificação · MEASURE',
    html: layout({
      preheader: 'Seu código de verificação.',
      title: 'Código de verificação',
      intro: 'Use o código abaixo para confirmar a operação no MEASURE:',
      button: '',
      code: '{{ .Token }}',
    }),
  },
  password_changed_notification: {
    subject: 'Sua senha foi alterada · MEASURE',
    html: aviso('Sua senha foi alterada', 'A senha da conta <strong>{{ .Email }}</strong> acabou de ser alterada.'),
  },
  email_changed_notification: {
    subject: 'O e-mail da sua conta foi alterado · MEASURE',
    html: aviso('O e-mail da sua conta foi alterado', 'O e-mail da sua conta foi trocado de <strong>{{ .OldEmail }}</strong> para <strong>{{ .Email }}</strong>.'),
  },
  phone_changed_notification: {
    subject: 'O telefone da sua conta foi alterado · MEASURE',
    html: aviso('O telefone da sua conta foi alterado', 'O telefone da conta <strong>{{ .Email }}</strong> foi alterado.'),
  },
  identity_linked_notification: {
    subject: 'Nova forma de acesso na sua conta · MEASURE',
    html: aviso('Nova forma de acesso', 'Uma nova forma de login foi ligada à conta <strong>{{ .Email }}</strong>.'),
  },
  identity_unlinked_notification: {
    subject: 'Forma de acesso removida · MEASURE',
    html: aviso('Forma de acesso removida', 'Uma forma de login foi removida da conta <strong>{{ .Email }}</strong>.'),
  },
  mfa_factor_enrolled_notification: {
    subject: 'Verificação em duas etapas ativada · MEASURE',
    html: aviso('Verificação em duas etapas ativada', 'Um novo método de verificação foi adicionado à conta <strong>{{ .Email }}</strong>.'),
  },
  mfa_factor_unenrolled_notification: {
    subject: 'Verificação em duas etapas removida · MEASURE',
    html: aviso('Verificação em duas etapas removida', 'Um método de verificação foi removido da conta <strong>{{ .Email }}</strong>.'),
  },
};

// Regras de autenticação: sem cadastro público, senha forte, e-mail confirmado, avisos de segurança
const REGRAS = {
  site_url: SITE,
  // produção: só os endereços oficiais (localhost não fica liberado no projeto publicado)
  uri_allow_list: `${SITE}**,https://www.measuregcp.com.br/**,${SITE_ANTERIOR}**`,
  disable_signup: true,
  mailer_autoconfirm: false,
  password_min_length: 10,
  password_required_characters: 'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
  // 24 horas: servidores abrem o e-mail institucional no dia seguinte com frequência
  mailer_otp_exp: 86400,
  mailer_secure_email_change_enabled: true,
  mailer_notifications_password_changed_enabled: true,
  mailer_notifications_email_changed_enabled: true,
  rate_limit_email_sent: 30,
  // verificação em duas etapas por aplicativo autenticador (obrigatória para administradores, ver migração 20261211000100)
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  mfa_max_enrolled_factors: 10,
};

const dir = new URL('./', import.meta.url);
const payload = { ...REGRAS };
for (const [name, { subject, html }] of Object.entries(EMAILS)) {
  fs.writeFileSync(new URL(`${name}.html`, dir), html);
  payload[`mailer_subjects_${name}`] = subject;
  payload[`mailer_templates_${name}_content`] = html;
}
console.log(`${Object.keys(EMAILS).length} modelos gerados.`);

if (process.argv.includes('--publicar')) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Defina SUPABASE_ACCESS_TOKEN (token pessoal sbp_...).');
  if (process.env.SMTP_PASS) {
    Object.assign(payload, {
      smtp_host: 'smtp.gmail.com', smtp_port: '465', smtp_user: REMETENTE,
      smtp_pass: process.env.SMTP_PASS.replace(/\s+/g, ''),
      smtp_admin_email: REMETENTE, smtp_sender_name: 'MEASURE',
    });
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log('Publicação:', res.status, res.ok ? 'ok' : (await res.text()).slice(0, 400));
  if (!res.ok) process.exit(1);
}
