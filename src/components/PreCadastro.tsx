// Pré-cadastro do servidor pelo próprio usuário e "Meu cadastro de servidor".
// Ao ativar o acesso, a pessoa informa a matrícula (e, se quiser, cargo e telefone): a ficha de servidor dela é
// criada já ligada à conta, marcada como pré-cadastro até o administrador conferir. Depois, ela mesma mantém
// os dados de contato, cargo/função, escolaridade e dados pessoais. Lotação e nomeação ficam com o administrador.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, IdCard } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Botao, CaixaErro, Campo, Cartao, Carregando, Selecao, Selo } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { formatarData, formatarTelefone, somenteDigitos } from '@/lib/formatacao';
import type { MeuServidor } from '@/lib/tipos';
import { ESCOLARIDADES } from '@/pages/cadastros/ServidorCurriculo';
import { atualizarMeuCadastro, completarPreCadastro, meuServidor } from '@/services/cadastros';

export function useMeuServidor() {
  const { orgao } = useSessao();
  return useQuery({ queryKey: ['meu-servidor', orgao?.id], queryFn: () => meuServidor(orgao!.id), enabled: !!orgao, staleTime: 60_000 });
}

/** Formulário curto do pré-cadastro (matrícula obrigatória; cargo e telefone opcionais) */
export function CompletarPreCadastro({ dados, destaque = false }: { dados: MeuServidor; destaque?: boolean }) {
  const { orgao, contexto } = useSessao();
  const qc = useQueryClient();
  const [matricula, setMatricula] = useState('');
  const [cargo, setCargo] = useState('');
  const [telefone, setTelefone] = useState(formatarTelefone(contexto?.perfil?.telefone ?? ''));
  const [erros, setErros] = useState<Record<string, string>>({});
  const salvar = useMutation({
    mutationFn: () => completarPreCadastro(orgao!.id, { matricula: matricula.trim(), cargo: cargo.trim() || null, telefone: somenteDigitos(telefone) || null }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['meu-servidor'] });
      toast.success('Cadastro de servidor criado. O administrador vai conferir; os demais dados você completa em Meu perfil.');
    },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!matricula.trim()) { setErros({ matricula: 'Informe sua matrícula.' }); return; }
    setErros({}); salvar.mutate();
  };
  return (
    <section className={destaque ? 'mb-6 overflow-hidden rounded-xl border-2 border-chamada-500 bg-white shadow-md' : ''} aria-label="Complete seu cadastro de servidor">
      {destaque && (
        <div className="flex items-center gap-3 bg-marca-900 px-4 py-3 text-white">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-chamada-500 text-marca-950"><IdCard className="size-5" aria-hidden /></span>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">Complete seu cadastro de servidor</h2>
            <p className="text-xs text-marca-100">Leva menos de um minuto. Assim você já aparece como servidor e pode ser designado nos contratos.</p>
          </div>
        </div>
      )}
      <form onSubmit={enviar} className={destaque ? 'grid gap-4 p-4 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-3'} noValidate>
        <Campo rotulo="Matrícula" obrigatorio value={matricula} onChange={(e) => setMatricula(e.target.value)} erro={erros.matricula} maxLength={30} placeholder="Ex.: 440.218" />
        <Campo rotulo="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} placeholder="Ex.: Assistente administrativo" />
        <Campo rotulo="Telefone" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} inputMode="tel" />
        <dl className="grid gap-1 text-sm sm:col-span-3 sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Nome</dt><dd className="font-medium text-slate-900">{contexto?.perfil?.nome}</dd></div>
          <div><dt className="text-xs text-slate-500">E-mail institucional</dt><dd className="truncate text-slate-900">{contexto?.perfil?.email}</dd></div>
          <div><dt className="text-xs text-slate-500">Lotação (do seu acesso)</dt><dd className="text-slate-900">{dados.lotacao?.descricao ?? dados.lotacao?.nome ?? '—'}</dd></div>
        </dl>
        {erros.geral && <div className="sm:col-span-3"><CaixaErro mensagem={erros.geral} /></div>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <Botao type="submit" variante="chamada" carregando={salvar.isPending}>Concluir meu cadastro</Botao>
          <p className="text-xs text-slate-500">Nome, e-mail e lotação vêm do seu acesso. Se a lotação estiver errada, avise o administrador.</p>
        </div>
      </form>
    </section>
  );
}

/** Aviso no Início: aparece enquanto a pessoa não tem ficha de servidor no órgão */
export function AvisoPreCadastro() {
  const { ehPlataforma } = useSessao();
  const q = useMeuServidor();
  if (ehPlataforma || !q.data?.pode_completar) return null;
  return <CompletarPreCadastro dados={q.data} destaque />;
}

/** Meu perfil › Meu cadastro de servidor */
export function MeuCadastroServidor() {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const q = useMeuServidor();
  const s = q.data?.servidor ?? null;
  const p = q.data?.pessoais ?? null;
  const [f, setF] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!s) return;
    setF({
      matricula: s.matricula, cargo: s.cargo ?? '', funcao: s.funcao ?? '', telefone: formatarTelefone(s.telefone ?? ''), escolaridade: s.escolaridade ?? '',
      cpf: p?.cpf ?? '', data_nascimento: p?.data_nascimento ?? '', nome_mae: p?.nome_mae ?? '', naturalidade: p?.naturalidade ?? '',
      email_pessoal: p?.email_pessoal ?? '', cep: p?.cep ?? '', logradouro: p?.logradouro ?? '', numero: p?.numero ?? '', complemento: p?.complemento ?? '',
      bairro: p?.bairro ?? '', cidade: p?.cidade ?? '', uf: p?.uf ?? '',
    });
  }, [s, p]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const salvar = useMutation({
    mutationFn: () => atualizarMeuCadastro(orgao!.id, {
      ...(s?.pre_cadastro ? { matricula: f.matricula } : {}),
      cargo: f.cargo, funcao: f.funcao, telefone: somenteDigitos(f.telefone ?? ''), escolaridade: f.escolaridade,
      pessoais: {
        cpf: somenteDigitos(f.cpf ?? ''), data_nascimento: f.data_nascimento || null, nome_mae: f.nome_mae, naturalidade: f.naturalidade,
        email_pessoal: f.email_pessoal, cep: somenteDigitos(f.cep ?? ''), logradouro: f.logradouro, numero: f.numero, complemento: f.complemento,
        bairro: f.bairro, cidade: f.cidade, uf: f.uf,
      },
    }),
    onSuccess: async () => { setErros({}); await qc.invalidateQueries({ queryKey: ['meu-servidor'] }); toast.success('Seu cadastro de servidor foi atualizado.'); },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });

  if (!orgao) return null;
  return (
    <Cartao titulo={<span className="inline-flex items-center gap-2"><IdCard className="size-4" />Meu cadastro de servidor</span>}>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} />
        : !s ? (q.data?.pode_completar ? <CompletarPreCadastro dados={q.data} /> : <p className="text-sm text-slate-600">Você não tem cadastro de servidor neste órgão.</p>) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} noValidate>
            <div className="flex flex-wrap items-center gap-2">
              {s.pre_cadastro
                ? <Selo tom="alerta">Pré-cadastro: aguardando conferência do administrador</Selo>
                : <Selo tom="sucesso" icone={<BadgeCheck className="size-3" />}>Cadastro conferido</Selo>}
            </div>
            <dl className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Lotação</dt><dd className="text-slate-900">{q.data?.lotacao?.descricao ?? q.data?.lotacao?.nome ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Data de nomeação</dt><dd className="text-slate-900">{s.data_nomeacao ? formatarData(s.data_nomeacao) : '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">E-mail institucional</dt><dd className="truncate text-slate-900">{s.email_institucional ?? '—'}</dd></div>
              <p className="text-xs text-slate-500 sm:col-span-3">Lotação, nomeação e e-mail institucional são mantidos pelo administrador do órgão.</p>
            </dl>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Matrícula" value={f.matricula ?? ''} onChange={set('matricula')} erro={erros.matricula} disabled={!s.pre_cadastro} maxLength={30}
                ajuda={s.pre_cadastro ? 'Pode corrigir até o administrador conferir.' : 'Conferida pelo administrador.'} />
              <Campo rotulo="Telefone" value={f.telefone ?? ''} onChange={(e) => setF((x) => ({ ...x, telefone: formatarTelefone(e.target.value) }))} inputMode="tel" />
              <Campo rotulo="Cargo" value={f.cargo ?? ''} onChange={set('cargo')} maxLength={120} />
              <Campo rotulo="Função" value={f.funcao ?? ''} onChange={set('funcao')} maxLength={120} />
              <Selecao rotulo="Escolaridade" value={f.escolaridade ?? ''} onChange={set('escolaridade')}>
                <option value="">Não informada</option>{ESCOLARIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </Selecao>
            </div>
            <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-marca-900">Dados pessoais (protegidos — LGPD)</legend>
              <Campo rotulo="CPF" value={f.cpf ?? ''} onChange={set('cpf')} erro={erros.cpf} inputMode="numeric" maxLength={14} />
              <Campo rotulo="Data de nascimento" type="date" value={f.data_nascimento ?? ''} onChange={set('data_nascimento')} />
              <Campo rotulo="Nome da mãe" value={f.nome_mae ?? ''} onChange={set('nome_mae')} maxLength={200} />
              <Campo rotulo="Naturalidade" value={f.naturalidade ?? ''} onChange={set('naturalidade')} maxLength={120} />
              <Campo rotulo="E-mail pessoal" type="email" value={f.email_pessoal ?? ''} onChange={set('email_pessoal')} maxLength={200} />
              <Campo rotulo="CEP" value={f.cep ?? ''} onChange={set('cep')} inputMode="numeric" maxLength={9} />
              <Campo rotulo="Endereço" value={f.logradouro ?? ''} onChange={set('logradouro')} maxLength={200} />
              <Campo rotulo="Número" value={f.numero ?? ''} onChange={set('numero')} maxLength={20} />
              <Campo rotulo="Complemento" value={f.complemento ?? ''} onChange={set('complemento')} maxLength={120} />
              <Campo rotulo="Bairro" value={f.bairro ?? ''} onChange={set('bairro')} maxLength={120} />
              <Campo rotulo="Cidade" value={f.cidade ?? ''} onChange={set('cidade')} maxLength={120} />
              <Campo rotulo="UF" value={f.uf ?? ''} onChange={(e) => setF((x) => ({ ...x, uf: e.target.value.toUpperCase() }))} maxLength={2} />
              <p className="text-xs text-slate-500 sm:col-span-2">Seus dados pessoais só são vistos por quem tem permissão no órgão e cada consulta fica registrada.</p>
            </fieldset>
            {erros.geral && <CaixaErro mensagem={erros.geral} />}
            <div><Botao type="submit" carregando={salvar.isPending}>Salvar meu cadastro</Botao></div>
          </form>
        )}
    </Cartao>
  );
}
