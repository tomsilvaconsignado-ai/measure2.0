import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, LifeBuoy, Pencil, Plus, Power, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, SemPermissao, Selecao, Selo, Vazio } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { consultarCnpj } from '@/services/consultasPublicas';
import { cnpjValido, formatarCep, formatarCnpj, formatarDataHora, formatarTelefone, somenteDigitos } from '@/lib/formatacao';
import type { Tenant } from '@/lib/tipos';
import { definirStatusOrgao, iniciarSuporte, listarOrgaos, salvarOrgao, type DadosOrgao } from '@/services/api';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

type Form = Record<keyof DadosOrgao, string>;
const vazio: Form = { nome_oficial: '', nome_curto: '', cnpj: '', endereco: '', cep: '', cidade: '', uf: '', telefone: '', email_contato: '', site: '', dominios_email: '' };

export function FormOrgao({ orgao, aberto, aoFechar }: { orgao: Tenant | null; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const { ehPlataforma } = useSessao();
  const [f, setF] = useState<Form>(vazio);
  const [erros, setErros] = useState<Partial<Record<keyof Form | 'geral', string>>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF(orgao ? {
      nome_oficial: orgao.nome_oficial, nome_curto: orgao.nome_curto, cnpj: formatarCnpj(orgao.cnpj), endereco: orgao.endereco ?? '',
      cep: formatarCep(orgao.cep), cidade: orgao.cidade ?? '', uf: orgao.uf ?? '', telefone: formatarTelefone(orgao.telefone),
      email_contato: orgao.email_contato ?? '', site: orgao.site ?? '', dominios_email: orgao.dominios_email.join(', '),
    } : vazio);
  }, [aberto, orgao]);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (aberto) setAviso(null); }, [aberto]);

  // Preenche com os dados da Receita; na edição só completa o que estiver vazio
  const preencherPeloCnpj = async (cnpj: string) => {
    setConsultando(true); setAviso(null);
    try {
      const d = await consultarCnpj(cnpj);
      const usar = (atual: string, novo: string | undefined) => (orgao && atual.trim() ? atual : novo || atual);
      setF((x) => ({
        ...x,
        nome_oficial: usar(x.nome_oficial, d.razao_social),
        nome_curto: usar(x.nome_curto, (d.nome_fantasia || d.razao_social).slice(0, 60)),
        endereco: usar(x.endereco, [d.logradouro, d.numero, d.complemento, d.bairro].filter(Boolean).join(', ')),
        cep: usar(x.cep, d.cep ? formatarCep(d.cep) : ''),
        cidade: usar(x.cidade, d.cidade), uf: usar(x.uf, d.uf),
        telefone: usar(x.telefone, d.telefone ? formatarTelefone(d.telefone) : ''),
        email_contato: usar(x.email_contato, d.email),
      }));
      setAviso(`Dados preenchidos pela Receita Federal${d.situacao ? ` (situação: ${d.situacao})` : ''}. Revise antes de salvar.`);
    } catch (e) {
      setAviso(mensagemDeErro(e));
    } finally { setConsultando(false); }
  };

  const salvar = useMutation({
    mutationFn: () => {
      const dados: Partial<DadosOrgao> = {
        nome_oficial: f.nome_oficial.trim(), nome_curto: f.nome_curto.trim(),
        endereco: f.endereco.trim() || null, cep: somenteDigitos(f.cep) || null, cidade: f.cidade.trim() || null,
        uf: f.uf || null, telefone: somenteDigitos(f.telefone) || null, email_contato: f.email_contato.trim() || null, site: f.site.trim() || null,
      };
      if (ehPlataforma) {
        dados.cnpj = somenteDigitos(f.cnpj) || null;
        dados.dominios_email = f.dominios_email.split(/[,\s;]+/).map((d) => d.replace(/^@/, '').trim()).filter(Boolean);
      }
      return salvarOrgao(orgao?.id ?? null, dados);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['orgaos'] });
      await qc.invalidateQueries({ queryKey: ['meu_contexto'] });
      toast.success(orgao ? 'Órgão atualizado.' : 'Órgão cadastrado. Agora monte a estrutura organizacional e convide o Master.');
      aoFechar();
    },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const novos: typeof erros = {};
    if (f.nome_oficial.trim().length < 3) novos.nome_oficial = 'Informe o nome oficial completo.';
    if (f.nome_curto.trim().length < 2) novos.nome_curto = 'Informe um nome curto (ex.: PMA – SMS).';
    if (f.cnpj && !cnpjValido(f.cnpj)) novos.cnpj = 'CNPJ inválido: confira os dígitos.';
    if (f.cep && somenteDigitos(f.cep).length !== 8) novos.cep = 'CEP deve ter 8 dígitos.';
    setErros(novos);
    if (Object.keys(novos).length === 0) salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={orgao ? 'Editar órgão' : 'Novo órgão'} largura="lg"
      descricao="Órgão hospedeiro (Prefeitura, Secretaria ou entidade) com dados e usuários isolados dos demais."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-orgao" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-orgao" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Campo className="sm:col-span-2" rotulo="Nome oficial" obrigatorio value={f.nome_oficial} onChange={set('nome_oficial')} erro={erros.nome_oficial} maxLength={200}
          placeholder="Prefeitura Municipal de Aracaju" />
        <Campo rotulo="Nome curto" obrigatorio value={f.nome_curto} onChange={set('nome_curto')} erro={erros.nome_curto} maxLength={60}
          ajuda="Aparece no menu e nas listas." />
        <Campo rotulo="CNPJ" value={f.cnpj} erro={erros.cnpj} inputMode="numeric" disabled={!ehPlataforma}
          ajuda={!ehPlataforma ? 'Alterado só pela plataforma.' : consultando ? 'Consultando a Receita Federal…' : aviso ?? 'Ao completar o CNPJ, os dados são buscados na Receita.'}
          onChange={(e) => {
            const cnpj = formatarCnpj(e.target.value);
            setF((x) => ({ ...x, cnpj }));
            if (somenteDigitos(cnpj).length === 14 && cnpjValido(cnpj)) void preencherPeloCnpj(cnpj);
          }} />
        <Campo className="sm:col-span-2" rotulo="Endereço" value={f.endereco} onChange={set('endereco')} maxLength={300} />
        <Campo rotulo="CEP" value={f.cep} onChange={(e) => setF((x) => ({ ...x, cep: formatarCep(e.target.value) }))} erro={erros.cep} inputMode="numeric" />
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Campo rotulo="Cidade" value={f.cidade} onChange={set('cidade')} maxLength={120} />
          <Selecao rotulo="UF" value={f.uf} onChange={set('uf')} erro={erros.uf}>
            <option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}
          </Selecao>
        </div>
        <Campo rotulo="Telefone" value={f.telefone} onChange={(e) => setF((x) => ({ ...x, telefone: formatarTelefone(e.target.value) }))} inputMode="tel" />
        <Campo rotulo="E-mail de contato" type="email" value={f.email_contato} onChange={set('email_contato')} />
        <Campo className="sm:col-span-2" rotulo="Site" value={f.site} onChange={set('site')} placeholder="https://" />
        {ehPlataforma && (
          <AreaTexto className="sm:col-span-2" rotulo="Domínios de e-mail permitidos" value={f.dominios_email} onChange={set('dominios_email')}
            ajuda="Separe por vírgula (ex.: aracaju.se.gov.br). Convites para outros domínios serão recusados. Vazio = qualquer domínio." />
        )}
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

function AbrirSuporte({ orgao, aoFechar }: { orgao: Tenant | null; aoFechar: () => void }) {
  const { recarregar, escolherOrgao } = useSessao();
  const navegar = useNavigate();
  const [motivo, setMotivo] = useState('');
  const [minutos, setMinutos] = useState('60');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { setMotivo(''); setErro(null); }, [orgao]);
  const abrir = useMutation({
    mutationFn: () => iniciarSuporte(orgao!.id, motivo.trim(), Number(minutos)),
    onSuccess: async () => {
      await recarregar();
      escolherOrgao({ id: orgao!.id, nome_curto: orgao!.nome_curto, nome_oficial: orgao!.nome_oficial, logo_path: orgao!.logo_path });
      toast.success('Sessão de suporte aberta. Tudo o que você fizer fica auditado.');
      aoFechar(); navegar('/');
    },
    onError: (e) => setErro(traduzirErro(e).mensagem),
  });
  return (
    <Modal aberto={!!orgao} aoFechar={aoFechar} titulo="Abrir sessão de suporte" largura="sm"
      descricao={orgao ? `Libera temporariamente os dados operacionais de ${orgao.nome_curto}.` : undefined}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao carregando={abrir.isPending} disabled={motivo.trim().length < 10} onClick={() => abrir.mutate()}>Abrir sessão</Botao></>}>
      <div className="flex flex-col gap-3">
        <AreaTexto rotulo="Motivo do suporte" obrigatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500}
          ajuda="Ex.: chamado nº, pedido do órgão. Mínimo de 10 caracteres. Fica visível para o Master do órgão na auditoria." />
        <Selecao rotulo="Duração" value={minutos} onChange={(e) => setMinutos(e.target.value)}>
          <option value="30">30 minutos</option><option value="60">1 hora</option><option value="120">2 horas</option><option value="240">4 horas</option>
        </Selecao>
        {erro && <CaixaErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

export function Orgaos() {
  const { ehPlataforma, escolherOrgao, orgao: atual } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Tenant | null | 'novo'>(null);
  const [alternando, setAlternando] = useState<Tenant | null>(null);
  const [suporte, setSuporte] = useState<Tenant | null>(null);
  const q = useQuery({ queryKey: ['orgaos', busca], queryFn: () => listarOrgaos(busca), enabled: ehPlataforma });
  if (!ehPlataforma) return <SemPermissao texto="Área exclusiva do administrador da plataforma." />;

  return (
    <>
      <CabecalhoPagina titulo="Órgãos" descricao="Prefeituras, Secretarias e entidades que usam a plataforma. Os dados de cada órgão ficam isolados."
        acoes={<Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo órgão</Botao>} />
      <Cartao>
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" placeholder="Buscar por nome" value={busca}
            onChange={(e) => setBusca(e.target.value)} aria-label="Buscar órgão" />
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          q.data!.length === 0 ? <Vazio titulo="Nenhum órgão cadastrado" descricao="Cadastre o primeiro órgão para montar a estrutura e convidar o Master." /> : (
            <ul className="divide-y divide-slate-100">
              {q.data!.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      {t.nome_curto}
                      {t.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo tom="perigo">Suspenso</Selo>}
                      {t.id === atual?.id && <Selo tom="marca">Em uso</Selo>}
                    </p>
                    <p className="truncate text-sm text-slate-600">{t.nome_oficial}{t.cnpj ? ` · CNPJ ${formatarCnpj(t.cnpj)}` : ''}</p>
                    <p className="text-xs text-slate-500">
                      {t.dominios_email.length ? `E-mails: ${t.dominios_email.map((d) => '@' + d).join(', ')}` : 'Qualquer domínio de e-mail'} · criado em {formatarDataHora(t.criado_em)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Botao pequeno variante="secundario" icone={<ArrowRightLeft className="size-4" />}
                      onClick={() => { escolherOrgao({ id: t.id, nome_curto: t.nome_curto, nome_oficial: t.nome_oficial, logo_path: t.logo_path }); navegar('/estrutura'); }}>
                      Administrar
                    </Botao>
                    <Botao pequeno variante="secundario" icone={<LifeBuoy className="size-4" />} onClick={() => setSuporte(t)}>Suporte</Botao>
                    <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} onClick={() => setEditando(t)} aria-label={`Editar ${t.nome_curto}`} />
                    <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} onClick={() => setAlternando(t)}
                      aria-label={t.ativo ? `Suspender ${t.nome_curto}` : `Reativar ${t.nome_curto}`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Cartao>

      <FormOrgao aberto={editando !== null} orgao={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />
      <AbrirSuporte orgao={suporte} aoFechar={() => setSuporte(null)} />
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Suspender ${alternando.nome_curto}?` : `Reativar ${alternando?.nome_curto}?`}
        descricao={alternando?.ativo
          ? 'Todos os usuários do órgão perdem o acesso imediatamente. Nenhum dado é apagado e o órgão pode ser reativado depois.'
          : 'Os usuários com vínculos ativos voltam a acessar o órgão.'}
        rotuloConfirmar={alternando?.ativo ? 'Suspender' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (motivo) => {
          await definirStatusOrgao(alternando!.id, !alternando!.ativo, motivo);
          await qc.invalidateQueries({ queryKey: ['orgaos'] });
          toast.success(alternando!.ativo ? 'Órgão suspenso.' : 'Órgão reativado.');
        }} />
    </>
  );
}
