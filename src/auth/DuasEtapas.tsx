// Verificação em duas etapas (MFA por aplicativo autenticador: Google Authenticator, Microsoft
// Authenticator, Authy etc.). Obrigatória para administradores; opcional para os demais.
// A obrigação é garantida no banco (migração 20261211000100): sem o código confirmado (sessão aal2),
// a API recusa as chamadas dessas contas. Aqui ficam só as telas.
import { useQuery } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Botao, CaixaErro, Campo, Cartao, Selo } from '@/components/ui/basicos';
import { supabase } from '@/lib/supabase';

/** Nível da sessão atual e se a pessoa já tem autenticador confirmado */
export async function lerNivelMfa() {
  const [{ data: nivel }, { data: fatores }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  const confirmados = (fatores?.totp ?? []).filter((f) => f.status === 'verified');
  return { atual: nivel?.currentLevel ?? 'aal1', temFator: confirmados.length > 0, fatores: confirmados };
}

const traduzir = (msg: string) =>
  /invalid|expired|incorrect/i.test(msg) ? 'Código incorreto ou expirado. Confira o horário do celular e tente o código atual.'
    : /rate|too many/i.test(msg) ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
      : 'Não foi possível concluir. Tente novamente.';

function CampoCodigo({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <Campo rotulo="Código de 6 dígitos" value={valor} onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.4em]" />
  );
}

/** Pede o código do aplicativo e eleva a sessão para aal2 */
export function ConfirmarCodigo({ aoConcluir }: { aoConcluir: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setErro(null);
    const { fatores } = await lerNivelMfa();
    const fator = fatores[0];
    if (!fator) { setEnviando(false); setErro('Nenhum autenticador encontrado.'); return; }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    setEnviando(false);
    if (error) { setErro(traduzir(error.message)); setCodigo(''); return; }
    aoConcluir();
  };
  return (
    <form onSubmit={enviar} className="flex w-full max-w-sm flex-col gap-4 text-left" noValidate>
      <div className="flex items-center gap-2 text-slate-900"><ShieldCheck className="size-5 text-marca-700" /><h1 className="text-lg font-semibold">Verificação em duas etapas</h1></div>
      <p className="text-sm text-slate-600">Abra o aplicativo autenticador no celular e digite o código do MEASURE.</p>
      <CampoCodigo valor={codigo} aoMudar={setCodigo} />
      {erro && <CaixaErro mensagem={erro} />}
      <Botao type="submit" carregando={enviando} disabled={codigo.length !== 6}>Confirmar</Botao>
    </form>
  );
}

/** Cadastro do autenticador: QR code (ou chave), confirmação com o primeiro código */
export function CadastrarAutenticador({ aoConcluir, obrigatorio }: { aoConcluir: () => void; obrigatorio?: boolean }) {
  const [dados, setDados] = useState<{ id: string; qr: string; chave: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      // cadastros abandonados (não confirmados) são descartados antes de começar outro
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: novo, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `MEASURE ${new Date().toLocaleDateString('pt-BR')} ${Date.now() % 10000}` });
      if (!ativo) return;
      if (error || !novo) { setErro('Não foi possível iniciar o cadastro. Atualize a página e tente de novo.'); return; }
      setDados({ id: novo.id, qr: novo.totp.qr_code, chave: novo.totp.secret });
    })();
    return () => { ativo = false; };
  }, []);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!dados) return;
    setEnviando(true); setErro(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: dados.id, code: codigo });
    setEnviando(false);
    if (error) { setErro(traduzir(error.message)); setCodigo(''); return; }
    toast.success('Verificação em duas etapas ativada.');
    aoConcluir();
  };

  return (
    <form onSubmit={enviar} className="flex w-full max-w-md flex-col gap-4 text-left" noValidate>
      <div className="flex items-center gap-2 text-slate-900"><Smartphone className="size-5 text-marca-700" /><h1 className="text-lg font-semibold">Ative a verificação em duas etapas</h1></div>
      {obrigatorio && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Sua conta tem acesso de administrador. Por segurança, o MEASURE exige um código do celular além da senha.
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Instale um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou Authy).</li>
        <li>No aplicativo, toque em adicionar e leia o QR code abaixo.</li>
        <li>Digite o código de 6 dígitos que aparecer.</li>
      </ol>
      {dados ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <img src={dados.qr} alt="QR code para o aplicativo autenticador" className="size-44" />
          <p className="text-xs text-slate-500">Sem câmera? Digite esta chave no aplicativo:</p>
          <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs text-slate-800 select-all">{dados.chave}</code>
        </div>
      ) : !erro && <p className="text-sm text-slate-500">Preparando…</p>}
      <CampoCodigo valor={codigo} aoMudar={setCodigo} />
      {erro && <CaixaErro mensagem={erro} />}
      <Botao type="submit" carregando={enviando} disabled={!dados || codigo.length !== 6}>Ativar</Botao>
    </form>
  );
}

/** Cartão em "Meu perfil": ativar, ver e remover o autenticador */
export function CartaoDuasEtapas({ obrigatorio }: { obrigatorio: boolean }) {
  const q = useQuery({ queryKey: ['mfa'], queryFn: lerNivelMfa });
  const [cadastrando, setCadastrando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const ativo = !!q.data?.temFator;

  const remover = async () => {
    const fator = q.data?.fatores[0];
    if (!fator) return;
    if (!window.confirm('Remover a verificação em duas etapas? Sua conta ficará protegida só pela senha.')) return;
    setRemovendo(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fator.id });
    setRemovendo(false);
    if (error) { toast.error('Para remover, entre de novo confirmando o código do aplicativo.'); return; }
    toast.success('Verificação em duas etapas removida.');
    await supabase.auth.refreshSession();
    void q.refetch();
  };

  return (
    <Cartao titulo={<span className="inline-flex items-center gap-2"><KeyRound className="size-4" />Verificação em duas etapas</span>}>
      {cadastrando ? (
        <CadastrarAutenticador aoConcluir={() => { setCadastrando(false); void q.refetch(); }} />
      ) : (
        <div className="flex flex-col gap-3">
          <div>{ativo ? <Selo tom="sucesso">Ativada</Selo> : <Selo tom="alerta">Desativada</Selo>}</div>
          <p className="text-sm text-slate-600">
            {ativo ? 'Ao entrar, além da senha, o MEASURE pede o código do aplicativo autenticador do seu celular.'
              : 'Proteja sua conta: além da senha, o MEASURE pedirá um código do seu celular ao entrar.'}
            {obrigatorio && ' Obrigatória para quem administra o sistema.'}
          </p>
          <div>
            {!ativo && <Botao onClick={() => setCadastrando(true)} icone={<Smartphone className="size-4" />}>Ativar</Botao>}
            {ativo && !obrigatorio && <Botao variante="secundario" carregando={removendo} onClick={() => void remover()}>Remover</Botao>}
          </div>
        </div>
      )}
    </Cartao>
  );
}
