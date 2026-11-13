import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, KeyRound } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Avatar, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Selo } from '@/components/ui/basicos';
import { mensagemDeErro } from '@/lib/erros';
import { formatarDataHora, formatarTelefone, somenteDigitos } from '@/lib/formatacao';
import { supabase } from '@/lib/supabase';
import { atualizarMeuPerfil, definirVinculoPadrao, enviarMinhaFoto, urlArquivo } from '@/services/api';
import { MeuCadastroServidor } from '@/components/PreCadastro';
import { regraSenha } from './Acesso';

export function MeuPerfil() {
  const { contexto, recarregar } = useSessao();
  const perfil = contexto!.perfil!;
  const arquivo = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(perfil.nome);
  const [telefone, setTelefone] = useState(formatarTelefone(perfil.telefone));
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const foto = useQuery({ queryKey: ['url', 'avatares', perfil.avatar_path], queryFn: () => urlArquivo('avatares', perfil.avatar_path), enabled: !!perfil.avatar_path });

  const salvar = useMutation({
    mutationFn: () => atualizarMeuPerfil(perfil.id, { nome: nome.trim(), telefone: somenteDigitos(telefone) || null }),
    onSuccess: async () => { await recarregar(); toast.success('Perfil atualizado.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const enviarFoto = useMutation({
    mutationFn: (f: File) => enviarMinhaFoto(perfil.id, f),
    onSuccess: async () => { await recarregar(); toast.success('Foto atualizada.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const trocarSenha = useMutation({
    mutationFn: async () => { const { error } = await supabase.auth.updateUser({ password: senha }); if (error) throw error; },
    onSuccess: () => { setSenha(''); setConfirmacao(''); toast.success('Senha alterada. Você recebeu um aviso por e-mail.'); },
    onError: (e) => setErroSenha(mensagemDeErro(e)),
  });
  const padrao = useMutation({
    mutationFn: (id: string) => definirVinculoPadrao(id),
    onSuccess: async () => { await recarregar(); toast.success('Órgão padrão definido.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const enviarSenha = (e: FormEvent) => {
    e.preventDefault();
    const p = regraSenha(senha) ?? (senha !== confirmacao ? 'As senhas não conferem.' : null);
    setErroSenha(p);
    if (!p) trocarSenha.mutate();
  };

  return (
    <>
      <CabecalhoPagina titulo="Meu perfil" descricao="Seus dados pessoais e de acesso. Papéis e unidades são definidos pelo administrador do órgão." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo="Dados pessoais">
          <div className="mb-5 flex items-center gap-4">
            <Avatar nome={perfil.nome || perfil.email} url={foto.data} tamanho="lg" />
            <div>
              <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto.mutate(f); e.target.value = ''; }} />
              <Botao pequeno variante="secundario" icone={<Camera className="size-4" />} carregando={enviarFoto.isPending} onClick={() => arquivo.current?.click()}>Trocar foto</Botao>
              <p className="mt-1 text-xs text-slate-500">PNG, JPG ou WEBP até 2 MB.</p>
            </div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} noValidate>
            <Campo rotulo="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} obrigatorio />
            <Campo rotulo="E-mail" value={perfil.email} disabled ajuda="O e-mail de acesso é alterado pelo administrador." />
            <Campo rotulo="Telefone" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} inputMode="tel" />
            <div><Botao type="submit" carregando={salvar.isPending} disabled={nome.trim().length < 2}>Salvar</Botao></div>
          </form>
        </Cartao>

        <div className="flex flex-col gap-6">
          <Cartao titulo="Meus vínculos">
            {contexto!.vinculos.length === 0 ? <p className="text-sm text-slate-600">Nenhum vínculo ativo.</p> : (
              <ul className="flex flex-col gap-3">
                {contexto!.vinculos.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{v.tenant.nome_curto}</span> · {v.papel_nome}
                      <span className="block text-slate-600">{v.unidade ? `${v.unidade.nome}${v.unidade.sigla ? ` (${v.unidade.sigla})` : ''}` : 'Órgão inteiro'}</span>
                    </span>
                    {v.padrao ? <Selo tom="marca">Padrão</Selo> : <Botao pequeno variante="fantasma" onClick={() => padrao.mutate(v.id)}>Tornar padrão</Botao>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-slate-500">Conta criada em {formatarDataHora(perfil.criado_em)}.</p>
          </Cartao>

          <Cartao titulo={<span className="inline-flex items-center gap-2"><KeyRound className="size-4" />Trocar senha</span>}>
            <form className="flex flex-col gap-4" onSubmit={enviarSenha} noValidate>
              <Campo rotulo="Nova senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password"
                ajuda="Mínimo de 10 caracteres, com letras maiúsculas, minúsculas e números." />
              <Campo rotulo="Repita a nova senha" type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" />
              {erroSenha && <CaixaErro mensagem={erroSenha} />}
              <div><Botao type="submit" carregando={trocarSenha.isPending} disabled={!senha}>Alterar senha</Botao></div>
            </form>
          </Cartao>
        </div>
      </div>
      <div className="mt-6"><MeuCadastroServidor /></div>
    </>
  );
}
