// Tradução de erros do Supabase/Postgres para mensagens que dizem o campo, a causa e o que fazer.

export interface ErroApp {
  mensagem: string;
  /** campo do formulário relacionado, quando o servidor informa (hint) */
  campo?: string;
}

interface ErroBruto {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
  status?: number;
  erro?: string;
  campo?: string;
}

// Restrições de unicidade conhecidas → mensagem e campo
const UNICOS: Record<string, ErroApp> = {
  unidades_nome_unico: { mensagem: 'Já existe uma unidade com esse nome no mesmo nível da estrutura.', campo: 'nome' },
  tenants_cnpj_key: { mensagem: 'Já existe um órgão cadastrado com esse CNPJ.', campo: 'cnpj' },
  vinculos_unico: { mensagem: 'Esta pessoa já tem esse papel nessa unidade.', campo: 'papel' },
};

const CHECAGENS: Record<string, ErroApp> = {
  tenants_cnpj_check: { mensagem: 'CNPJ inválido: informe os 14 dígitos.', campo: 'cnpj' },
  tenants_cep_check: { mensagem: 'CEP inválido: informe os 8 dígitos.', campo: 'cep' },
  tenants_uf_check: { mensagem: 'UF inválida: use a sigla com 2 letras (ex.: SE).', campo: 'uf' },
  tenants_nome_oficial_check: { mensagem: 'Informe o nome oficial (3 a 200 caracteres).', campo: 'nome_oficial' },
  tenants_nome_curto_check: { mensagem: 'Informe o nome curto (2 a 60 caracteres).', campo: 'nome_curto' },
  unidades_organizacionais_nome_check: { mensagem: 'Informe o nome da unidade (2 a 200 caracteres).', campo: 'nome' },
  unidades_organizacionais_sigla_check: { mensagem: 'A sigla deve ter de 1 a 30 caracteres.', campo: 'sigla' },
  documentos_mime_check: { mensagem: 'Tipo de arquivo não aceito. Envie PDF, JPG, PNG ou WEBP.', campo: 'arquivo' },
};

const AUTH: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Seu e-mail ainda não foi confirmado. Use o link enviado por e-mail.'],
  [/password should be at least|password.*(characters|length)/i, 'A senha precisa ter pelo menos 10 caracteres, com letra maiúscula, minúscula e número.'],
  [/should be different from the old password/i, 'A nova senha precisa ser diferente da anterior.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'],
  [/jwt expired|invalid jwt|session.*(expired|missing)/i, 'Sua sessão expirou. Entre novamente.'],
  [/failed to fetch|networkerror|load failed/i, 'Sem conexão com o servidor. Verifique a internet e tente de novo.'],
  [/signups not allowed|signup.*disabled/i, 'O cadastro é feito apenas por convite do administrador do seu órgão.'],
];

export function traduzirErro(e: unknown): ErroApp {
  if (!e) return { mensagem: 'Erro desconhecido.' };
  if (typeof e === 'string') return { mensagem: e };
  const err = e as ErroBruto;
  if (err.erro) return { mensagem: err.erro, campo: err.campo };
  const msg = err.message ?? String(e);

  const restricao = msg.match(/constraint "([^"]+)"/)?.[1];
  if (err.code === '23505' || /duplicate key/.test(msg)) {
    return (restricao && UNICOS[restricao]) || { mensagem: 'Este registro já existe (dado duplicado).' };
  }
  if (err.code === '23514' && restricao && CHECAGENS[restricao]) return CHECAGENS[restricao];
  if (err.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    // mensagens escritas pelas nossas funções já são claras; as do Postgres não
    if (/row-level security|permission denied/i.test(msg)) {
      return { mensagem: 'Você não tem permissão para esta operação neste órgão ou unidade.' };
    }
  }
  for (const [re, texto] of AUTH) if (re.test(msg)) return { mensagem: texto };
  // Mensagens das funções do banco já vêm em português, com o campo no hint
  return { mensagem: msg, campo: err.hint ?? undefined };
}

export const mensagemDeErro = (e: unknown) => traduzirErro(e).mensagem;
