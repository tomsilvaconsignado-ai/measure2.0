import { CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Botao, CaixaErro, Campo } from '@/components/ui/basicos';
import { LogoCompleto } from '@/components/layout/Marca';
import { mensagemDeErro } from '@/lib/erros';
import { erroDoLink, senhaDefinida, supabase, urlDoApp } from '@/lib/supabase';

function Moldura({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-marca-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-marca-800/60" aria-hidden />
        <div className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-marca-950/60" aria-hidden />
        <div className="relative"><LogoCompleto clara className="h-36 w-auto" /></div>
        <div className="relative max-w-lg">
          <h2 className="text-3xl font-semibold leading-tight text-white">Gestão de contratos e despesas públicas com rastreabilidade de ponta a ponta.</h2>
          <p className="mt-4 text-marca-200">Contratos, empenhos, notas fiscais, atesto e relatórios orçamentários em um só lugar, com dados isolados por órgão e auditoria de cada operação.</p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-marca-300"><ShieldCheck className="size-4" /> Acesso restrito a usuários cadastrados pelo órgão.</p>
      </aside>
      <main className="flex items-center justify-center bg-white px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden"><LogoCompleto className="h-28 w-auto" /></div>
          <h1 className="text-2xl font-semibold text-slate-900">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-slate-600">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

function CampoSenha(props: { rotulo: string; valor: string; aoMudar: (v: string) => void; autoComplete: string; erro?: string | null; ajuda?: string }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Campo rotulo={props.rotulo} type={ver ? 'text' : 'password'} value={props.valor} onChange={(e) => props.aoMudar(e.target.value)}
        autoComplete={props.autoComplete} obrigatorio erro={props.erro} ajuda={props.ajuda} className="[&_input]:pr-10" />
      <button type="button" onClick={() => setVer((v) => !v)} className="absolute right-2 top-[30px] rounded p-1 text-slate-500 hover:bg-slate-100"
        aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}>{ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
    </div>
  );
}

export function Entrar() {
  const { sessao } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(erroDoLink ? `O link usado não é mais válido (${erroDoLink}). Peça um novo.` : null);
  if (sessao) return <Navigate to="/" replace />;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
    setEnviando(false);
    if (error) setErro(mensagemDeErro(error));
  };

  return (
    <Moldura titulo="Entrar" subtitulo="Use seu e-mail institucional e sua senha.">
      <form onSubmit={entrar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" obrigatorio inputMode="email" />
        <CampoSenha rotulo="Senha" valor={senha} aoMudar={setSenha} autoComplete="current-password" />
        {erro && <CaixaErro mensagem={erro} />}
        <Botao type="submit" carregando={enviando} disabled={!email || !senha} className="w-full">Entrar</Botao>
        <Link to="/esqueci-senha" className="text-center text-sm text-marca-700 hover:underline">Esqueci minha senha</Link>
      </form>
      <p className="mt-8 text-xs text-slate-500">Não tem acesso? Peça ao administrador do seu órgão para cadastrar você. Não há cadastro público.</p>
    </Moldura>
  );
}

export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setErro(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: urlDoApp() });
    setEnviando(false);
    // Por segurança, a mesma resposta para e-mail cadastrado ou não (só erros de limite aparecem)
    if (error && /rate|seconds|too many/i.test(error.message)) setErro(mensagemDeErro(error));
    else setEnviado(true);
  };

  return (
    <Moldura titulo="Recuperar acesso" subtitulo="Enviaremos um link para você criar uma nova senha.">
      {enviado ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="size-5 shrink-0" />
            <p>Se <strong>{email}</strong> estiver cadastrado, você receberá o link em instantes. Ele vale por 1 hora. Confira também a caixa de spam.</p>
          </div>
          <Link to="/entrar" className="text-center text-sm text-marca-700 hover:underline">Voltar para o login</Link>
        </div>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
          <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" obrigatorio />
          {erro && <CaixaErro mensagem={erro} />}
          <Botao type="submit" carregando={enviando} disabled={!/.+@.+\..+/.test(email)} className="w-full">Enviar link</Botao>
          <Link to="/entrar" className="text-center text-sm text-marca-700 hover:underline">Voltar para o login</Link>
        </form>
      )}
    </Moldura>
  );
}

export const regraSenha = (s: string) => {
  if (s.length < 10) return 'Use pelo menos 10 caracteres.';
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s)) return 'Use letras maiúsculas, minúsculas e números.';
  return null;
};

export function DefinirSenha({ tipo }: { tipo: string }) {
  const { contexto, recarregar } = useSessao();
  const navegar = useNavigate();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const problema = senha ? regraSenha(senha) : null;
  const diferente = confirmacao && confirmacao !== senha ? 'As senhas não conferem.' : null;
  const convite = tipo === 'invite';

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (problema || diferente) return;
    setEnviando(true); setErro(null);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) { setErro(mensagemDeErro(error)); return; }
    senhaDefinida();
    await recarregar();
    toast.success(convite ? 'Acesso ativado. Bem-vindo ao MEASURE!' : 'Senha alterada.');
    navegar('/', { replace: true });
  };

  return (
    <Moldura titulo={convite ? 'Ative seu acesso' : 'Crie uma nova senha'}
      subtitulo={contexto?.perfil ? <>Conta: <strong>{contexto.perfil.email}</strong></> : undefined}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <CampoSenha rotulo="Nova senha" valor={senha} aoMudar={setSenha} autoComplete="new-password" erro={problema}
          ajuda="Mínimo de 10 caracteres, com letras maiúsculas, minúsculas e números." />
        <CampoSenha rotulo="Repita a nova senha" valor={confirmacao} aoMudar={setConfirmacao} autoComplete="new-password" erro={diferente} />
        {erro && <CaixaErro mensagem={erro} />}
        <Botao type="submit" carregando={enviando} disabled={!senha || !!problema || confirmacao !== senha} className="w-full">
          {convite ? 'Ativar acesso' : 'Salvar nova senha'}
        </Botao>
      </form>
    </Moldura>
  );
}
