import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, MoreHorizontal, Plus, Search, ShieldAlert, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Avatar, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import { TIPOS_UNIDADE, type Papel, type UsuarioListado } from '@/lib/tipos';
import {
  buscarUnidades, catalogoPermissoes, convidarUsuario, definirAdminPlataforma, definirStatusUsuario, definirStatusVinculo,
  listarUsuarios, reenviarAcesso,
} from '@/services/api';

const POR_PAGINA = 20;

/** Papéis que quem está logado pode conceder neste órgão (a regra de verdade está no banco) */
function usePapeisConcedíveis() {
  const { ehPlataforma, vinculosDoOrgao } = useSessao();
  const cat = useQuery({ queryKey: ['catalogo-permissoes'], queryFn: catalogoPermissoes, staleTime: 5 * 60_000 });
  return useMemo(() => {
    if (!cat.data) return [];
    const meus = new Set(vinculosDoOrgao.filter((v) => v.permissoes.includes('usuarios:criar')).map((v) => v.papel));
    const permitidos = new Set(cat.data.concede.filter((c) => meus.has(c.concedente)).map((c) => c.concedido));
    return cat.data.papeis.filter((p) => ehPlataforma || permitidos.has(p.codigo));
  }, [cat.data, ehPlataforma, vinculosDoOrgao]);
}

function FormAcesso({ aberto, aoFechar, emailInicial }: { aberto: boolean; aoFechar: () => void; emailInicial?: string }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const papeis = usePapeisConcedíveis();
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<Papel | ''>('');
  const [unidade, setUnidade] = useState<{ id: string; rotulo: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => { if (aberto) { setEmail(emailInicial ?? ''); setNome(''); setPapel(''); setUnidade(null); setErros({}); } }, [aberto, emailInicial]);
  const infoPapel = papeis.find((p) => p.codigo === papel);

  const enviar = useMutation({
    mutationFn: () => convidarUsuario({ email: email.trim().toLowerCase(), nome: nome.trim(), tenant_id: orgao!.id, unidade_id: unidade?.id ?? null, papel: papel as Papel }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success(r.conta_criada ? `Convite enviado para ${email}. O link vale por 1 hora.` : 'Acesso concedido. A pessoa já pode usar o novo papel.');
      aoFechar();
    },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo && ['email', 'papel', 'unidade_id'].includes(t.campo) ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) n.email = 'Informe um e-mail válido.';
    if (!papel) n.papel = 'Escolha o papel.';
    if (infoPapel?.exige_unidade && !unidade) n.unidade_id = 'Este papel exige escolher a unidade de atuação.';
    setErros(n);
    if (!Object.keys(n).length) enviar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={emailInicial ? 'Conceder novo acesso' : 'Convidar usuário'}
      descricao="Se a pessoa ainda não tem conta, ela recebe um e-mail para ativar o acesso e criar a senha."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-acesso" carregando={enviar.isPending}>{emailInicial ? 'Conceder' : 'Enviar convite'}</Botao></>}>
      <form id="form-acesso" onSubmit={submeter} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="E-mail institucional" type="email" obrigatorio value={email} onChange={(e) => setEmail(e.target.value)} erro={erros.email} disabled={!!emailInicial} />
        {!emailInicial && <Campo rotulo="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} ajuda="A pessoa pode ajustar depois no perfil." />}
        <Selecao rotulo="Papel" obrigatorio value={papel} onChange={(e) => setPapel(e.target.value as Papel)} erro={erros.papel}
          ajuda={infoPapel?.descricao}>
          <option value="">Escolha…</option>
          {papeis.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}{p.somente_leitura ? ' (somente leitura)' : ''}</option>)}
        </Selecao>
        <BuscaSelect rotulo={infoPapel && !infoPapel.exige_unidade ? 'Unidade de atuação (vazio = órgão inteiro)' : 'Unidade de atuação'}
          obrigatorio={!!infoPapel?.exige_unidade} valor={unidade?.id ?? null} rotuloValor={unidade?.rotulo}
          aoMudar={(v, o) => setUnidade(v && o ? { id: v, rotulo: o.rotulo } : null)} erro={erros.unidade_id}
          chave={['unidades-busca', orgao?.id]} ajuda="O acesso vale para esta unidade e todas as que estão abaixo dela."
          buscar={async (t) => (await buscarUnidades(orgao!.id, t)).map((u) => ({ valor: u.id, rotulo: `${u.nome}${u.sigla ? ` (${u.sigla})` : ''}`, detalhe: TIPOS_UNIDADE[u.tipo] }))} />
        {erros.geral && <CaixaErro mensagem={erros.geral} />}
      </form>
    </Modal>
  );
}

type Acao = { tipo: 'vinculo'; usuario: UsuarioListado; vinculoId: string; ativo: boolean; rotulo: string }
  | { tipo: 'conta'; usuario: UsuarioListado } | { tipo: 'plataforma'; usuario: UsuarioListado };

export function Usuarios() {
  const { orgao, pode, ehPlataforma, contexto } = useSessao();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [buscaAtrasada, setBuscaAtrasada] = useState('');
  const [papel, setPapel] = useState<Papel | ''>('');
  const [situacao, setSituacao] = useState<'ATIVOS' | 'INATIVOS' | 'TODOS'>('ATIVOS');
  const [pagina, setPagina] = useState(0);
  const [convidando, setConvidando] = useState<{ email?: string } | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const cat = useQuery({ queryKey: ['catalogo-permissoes'], queryFn: catalogoPermissoes, staleTime: 5 * 60_000 });
  useEffect(() => { const t = setTimeout(() => { setBuscaAtrasada(busca); setPagina(0); }, 300); return () => clearTimeout(t); }, [busca]);

  const q = useQuery({
    queryKey: ['usuarios', orgao?.id, buscaAtrasada, papel, situacao, pagina],
    queryFn: () => listarUsuarios({ tenantId: orgao!.id, busca: buscaAtrasada, papel: papel || null, situacao, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao && pode('usuarios', 'ler'),
    placeholderData: (anterior) => anterior,
  });
  const reenviar = useMutation({
    mutationFn: (id: string) => reenviarAcesso(id),
    onSuccess: (r) => toast.success(r.tipo === 'ativacao' ? 'Link de ativação reenviado por e-mail.' : 'Link para criar nova senha enviado por e-mail.'),
    onError: (e) => toast.error(traduzirErro(e).mensagem),
  });

  if (!orgao) return <SemPermissao texto="Escolha um órgão para ver os usuários." />;
  if (!pode('usuarios', 'ler')) return <SemPermissao />;
  const podeCriar = pode('usuarios', 'criar');
  const filtrosAtivos = !!(busca || papel || situacao !== 'ATIVOS');

  return (
    <>
      <CabecalhoPagina titulo="Usuários e acessos" descricao={`Pessoas com vínculo em ${orgao.nome_curto}, conforme o seu escopo.`}
        acoes={podeCriar && <Botao icone={<UserPlus className="size-4" />} onClick={() => setConvidando({})}>Convidar usuário</Botao>} />
      <Cartao>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" placeholder="Buscar por nome ou e-mail"
              value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuário" />
          </div>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={papel} aria-label="Filtrar por papel"
            onChange={(e) => { setPapel(e.target.value as Papel); setPagina(0); }}>
            <option value="">Todos os papéis</option>
            {cat.data?.papeis.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={situacao} aria-label="Situação"
            onChange={(e) => { setSituacao(e.target.value as typeof situacao); setPagina(0); }}>
            <option value="ATIVOS">Ativos</option><option value="INATIVOS">Suspensos</option><option value="TODOS">Todos</option>
          </select>
          {filtrosAtivos && <Botao variante="fantasma" onClick={() => { setBusca(''); setPapel(''); setSituacao('ATIVOS'); setPagina(0); }}>Limpar filtros</Botao>}
        </div>

        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          q.data!.itens.length === 0 ? <Vazio titulo="Nenhum usuário encontrado" descricao={filtrosAtivos ? 'Ajuste os filtros.' : 'Convide as pessoas do órgão para começar.'} /> : (
            <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
              {q.data!.itens.map((u) => {
                const ehEu = u.id === contexto?.perfil?.id;
                return (
                  <li key={u.id} className="flex flex-wrap items-start gap-3 py-3">
                    <Avatar nome={u.nome || u.email} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                        {u.nome || '(sem nome)'}
                        {ehEu && <Selo tom="marca">Você</Selo>}
                        {!u.ativo && <Selo tom="perigo">Conta suspensa</Selo>}
                        {u.is_platform_admin && <Selo tom="alerta" icone={<ShieldCheck className="size-3" />}>Plataforma</Selo>}
                        {!u.ultimo_acesso && <Selo tom="info">Ainda não acessou</Selo>}
                      </p>
                      <p className="truncate text-sm text-slate-600">{u.email}</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {u.vinculos.map((v) => (
                          <li key={v.id}>
                            <button disabled={ehEu || !podeCriar} title={ehEu ? 'Você não altera os próprios acessos' : v.ativo ? 'Suspender este acesso' : 'Reativar este acesso'}
                              onClick={() => setAcao({ tipo: 'vinculo', usuario: u, vinculoId: v.id, ativo: v.ativo, rotulo: `${v.papel_nome}${v.unidade_sigla || v.unidade_nome ? ` · ${v.unidade_sigla ?? v.unidade_nome}` : ''}` })}
                              className={cx('rounded-md px-2 py-0.5 text-xs ring-1 ring-inset enabled:hover:ring-marca-400',
                                v.ativo ? 'bg-marca-50 text-marca-800 ring-marca-200' : 'bg-slate-50 text-slate-500 line-through ring-slate-200')}>
                              {v.papel_nome}{v.unidade_sigla || v.unidade_nome ? ` · ${v.unidade_sigla ?? v.unidade_nome}` : ' · órgão inteiro'}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-slate-500">Último acesso: {formatarDataHora(u.ultimo_acesso)}</p>
                    </div>
                    {!ehEu && (podeCriar || ehPlataforma) && (
                      <div className="relative">
                        <Botao pequeno variante="fantasma" icone={<MoreHorizontal className="size-4" />} aria-label={`Ações para ${u.email}`}
                          onClick={() => setMenu(menu === u.id ? null : u.id)} />
                        {menu === u.id && (
                          <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg" onMouseLeave={() => setMenu(null)}>
                            {podeCriar && <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setConvidando({ email: u.email }); setMenu(null); }}><Plus className="size-4" />Conceder outro acesso</button>}
                            {podeCriar && <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => { reenviar.mutate(u.id); setMenu(null); }}><MailPlus className="size-4" />{u.ultimo_acesso ? 'Enviar link de nova senha' : 'Reenviar convite'}</button>}
                            {ehPlataforma && <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setAcao({ tipo: 'conta', usuario: u }); setMenu(null); }}><ShieldAlert className="size-4" />{u.ativo ? 'Suspender a conta inteira' : 'Reativar a conta'}</button>}
                            {ehPlataforma && <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setAcao({ tipo: 'plataforma', usuario: u }); setMenu(null); }}><ShieldCheck className="size-4" />{u.is_platform_admin ? 'Remover admin. da plataforma' : 'Tornar admin. da plataforma'}</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>

      <FormAcesso aberto={!!convidando} aoFechar={() => setConvidando(null)} emailInicial={convidando?.email} />
      <ConfirmarComMotivo aberto={!!acao} aoFechar={() => setAcao(null)}
        perigo={acao?.tipo === 'vinculo' ? acao.ativo : acao?.tipo === 'conta' ? acao.usuario.ativo : !acao?.usuario.is_platform_admin}
        minimo={acao?.tipo === 'plataforma' ? 10 : (acao?.tipo === 'vinculo' ? acao.ativo : acao?.usuario.ativo) ? 5 : 0}
        titulo={!acao ? '' : acao.tipo === 'vinculo' ? `${acao.ativo ? 'Suspender' : 'Reativar'} o acesso "${acao.rotulo}"?`
          : acao.tipo === 'conta' ? `${acao.usuario.ativo ? 'Suspender' : 'Reativar'} a conta de ${acao.usuario.email}?`
            : `${acao.usuario.is_platform_admin ? 'Remover' : 'Conceder'} administração da plataforma?`}
        descricao={!acao ? '' : acao.tipo === 'vinculo' ? (acao.ativo ? 'A pessoa perde este acesso imediatamente. O histórico é preservado e o acesso pode ser reativado.' : 'O acesso volta a valer.')
          : acao.tipo === 'conta' ? (acao.usuario.ativo ? 'A pessoa perde o acesso a todos os órgãos imediatamente.' : 'A conta volta a funcionar com os vínculos ativos.')
            : (acao.usuario.is_platform_admin ? 'A pessoa deixa de administrar a plataforma.' : 'A pessoa poderá administrar todos os órgãos, usuários e a matriz de permissões. Use só para a equipe responsável pelo sistema.')}
        rotuloConfirmar="Confirmar"
        aoConfirmar={async (motivo) => {
          if (!acao) return;
          if (acao.tipo === 'vinculo') await definirStatusVinculo(acao.vinculoId, !acao.ativo, motivo);
          else if (acao.tipo === 'conta') await definirStatusUsuario(acao.usuario.id, !acao.usuario.ativo, motivo);
          else await definirAdminPlataforma(acao.usuario.id, !acao.usuario.is_platform_admin, motivo);
          await qc.invalidateQueries({ queryKey: ['usuarios'] });
          toast.success('Alteração registrada.');
        }} />
    </>
  );
}
