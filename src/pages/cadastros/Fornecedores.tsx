import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ImageUp, Landmark, Pencil, Plus, Power, Search, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Anexos } from '@/components/Anexos';
import { HistoricoFornecedor } from '@/pages/contratos/notificacoes/comum';
import { BotoesPlanilha } from '@/components/Planilhas';
import { CamposEndereco, enderecoDe, enderecoParaGravar, enderecoVazio, type Endereco } from '@/components/CamposEndereco';
import { ImagemPrivada, useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Interruptor, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { cnpjValido, cpfValido, formatarCep, formatarCnpj, formatarCpf, formatarDataHora, formatarTelefone, somenteDigitos } from '@/lib/formatacao';
import type { ContaBancaria, Fornecedor } from '@/lib/tipos';
import {
  definirStatusFornecedor, enviarLogoFornecedor, vincularFornecedor, listarContas, listarFornecedores, removerConta, salvarConta, salvarFornecedor,
} from '@/services/cadastros';
import { consultarCnpj } from '@/services/consultasPublicas';
import { ListaSelecao } from '@/components/ui/ListaSelecao';

const POR_PAGINA = 20;
export const formatarDocumento = (f: Pick<Fornecedor, 'tipo_pessoa' | 'documento'>) => f.tipo_pessoa === 'PJ' ? formatarCnpj(f.documento) : formatarCpf(f.documento);
export const nomeFornecedor = (f: Pick<Fornecedor, 'razao_social' | 'nome_fantasia'>) => f.razao_social || f.nome_fantasia || '';

function Logo({ f, tamanho = 'size-11' }: { f: Fornecedor; tamanho?: string }) {
  return (
    <ImagemPrivada caminho={f.logo_path} alt="" className={cx(tamanho, 'shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-200')}
      alternativa={<span className={cx(tamanho, 'flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400')}><Building2 className="size-5" /></span>} />
  );
}

interface FormF { tipo_pessoa: 'PJ' | 'PF'; documento: string; razao_social: string; nome_fantasia: string; inscricao_estadual: string; inscricao_municipal: string;
  telefone: string; telefone_secundario: string; email: string; site: string; nome_contato: string; observacoes: string }
const formVazio: FormF = { tipo_pessoa: 'PJ', documento: '', razao_social: '', nome_fantasia: '', inscricao_estadual: '', inscricao_municipal: '',
  telefone: '', telefone_secundario: '', email: '', site: '', nome_contato: '', observacoes: '' };

function FormFornecedor({ aberto, aoFechar, fornecedor, aoSalvar }: { aberto: boolean; aoFechar: () => void; fornecedor: Fornecedor | null; aoSalvar: (f: Fornecedor) => void }) {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [f, setF] = useState<FormF>(formVazio);
  const [end, setEnd] = useState<Endereco>(enderecoVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!aberto) return;
    setErros({}); setAviso(null);
    setF(fornecedor ? {
      tipo_pessoa: fornecedor.tipo_pessoa, documento: formatarDocumento(fornecedor), razao_social: fornecedor.razao_social,
      nome_fantasia: fornecedor.nome_fantasia ?? '', inscricao_estadual: fornecedor.inscricao_estadual ?? '', inscricao_municipal: fornecedor.inscricao_municipal ?? '',
      telefone: formatarTelefone(fornecedor.telefone), telefone_secundario: formatarTelefone(fornecedor.telefone_secundario), email: fornecedor.email ?? '',
      site: fornecedor.site ?? '', nome_contato: fornecedor.nome_contato ?? '', observacoes: fornecedor.observacoes ?? '',
    } : formVazio);
    setEnd(enderecoDe(fornecedor));
  }, [aberto, fornecedor]);
  const set = (k: keyof FormF) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const consultar = async (documento = f.documento) => {
    if (!cnpjValido(documento)) { setErros({ documento: 'Informe um CNPJ válido para consultar.' }); return; }
    setConsultando(true); setErros({}); setAviso(null);
    try {
      const d = await consultarCnpj(documento);
      setF((x) => ({ ...x, razao_social: d.razao_social || x.razao_social, nome_fantasia: d.nome_fantasia || x.nome_fantasia,
        telefone: d.telefone ? formatarTelefone(d.telefone) : x.telefone, email: d.email || x.email }));
      setEnd((x) => ({ cep: d.cep ? formatarCep(d.cep) : x.cep, logradouro: d.logradouro || x.logradouro, numero: d.numero || x.numero,
        complemento: d.complemento || x.complemento, bairro: d.bairro || x.bairro, cidade: d.cidade || x.cidade, uf: d.uf || x.uf }));
      setAviso(`Dados preenchidos pela Receita Federal${d.situacao ? ` (situação: ${d.situacao})` : ''}. Revise antes de salvar.`);
    } catch (e) { setErros({ documento: mensagemDeErro(e) }); } finally { setConsultando(false); }
  };

  const salvar = useMutation({
    mutationFn: () => salvarFornecedor(fornecedor?.id ?? null, {
      tenant_id: orgao!.id, tipo_pessoa: f.tipo_pessoa, documento: somenteDigitos(f.documento), razao_social: f.razao_social.trim(),
      nome_fantasia: f.nome_fantasia.trim() || null, inscricao_estadual: f.inscricao_estadual.trim() || null, inscricao_municipal: f.inscricao_municipal.trim() || null,
      telefone: somenteDigitos(f.telefone) || null, telefone_secundario: somenteDigitos(f.telefone_secundario) || null,
      email: f.email.trim().toLowerCase() || null, site: f.site.trim() || null, nome_contato: f.nome_contato.trim() || null,
      observacoes: f.observacoes.trim() || null, ...enderecoParaGravar(end),
    }),
    onSuccess: async (salvo) => {
      await qc.invalidateQueries({ queryKey: ['fornecedores'] });
      toast.success(fornecedor ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      aoSalvar(salvo); aoFechar();
    },
    onError: (e) => {
      const t = traduzirErro(e);
      if (/fornecedores_documento_unico/.test((e as Error).message ?? '')) {
        setErros({ documento: `Este ${f.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} já está cadastrado no órgão.` });
        setJaCadastrado(true);
      } else setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem });
    },
  });
  // a empresa já foi cadastrada por outra coordenação: vincula à sua, sem duplicar o cadastro
  const [jaCadastrado, setJaCadastrado] = useState(false);
  useEffect(() => { setJaCadastrado(false); }, [f.documento, aberto]);
  const vincular = useMutation({
    mutationFn: () => vincularFornecedor(orgao!.id, somenteDigitos(f.documento)),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['fornecedores'] });
      toast.success(`${r.razao_social} vinculado à sua coordenação.`);
      aoFechar();
    },
    onError: (e) => setErros({ geral: traduzirErro(e).mensagem }),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (f.tipo_pessoa === 'PJ' ? !cnpjValido(f.documento) : !cpfValido(f.documento)) n.documento = f.tipo_pessoa === 'PJ' ? 'CNPJ inválido: confira os dígitos.' : 'CPF inválido: confira os dígitos.';
    if (f.razao_social.trim().length < 2) n.razao_social = f.tipo_pessoa === 'PJ' ? 'Informe a razão social.' : 'Informe o nome completo.';
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) n.email = 'E-mail inválido.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'} largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-fornecedor" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-fornecedor" onSubmit={enviar} className="flex flex-col gap-5" noValidate>
        <fieldset className="grid gap-4 sm:grid-cols-6">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Identificação</legend>
          <Selecao className="sm:col-span-2" rotulo="Tipo" value={f.tipo_pessoa} disabled={!!fornecedor}
            onChange={(e) => setF((x) => ({ ...x, tipo_pessoa: e.target.value as 'PJ' | 'PF', documento: '' }))}>
            <option value="PJ">Pessoa jurídica</option><option value="PF">Pessoa física</option>
          </Selecao>
          <div className="sm:col-span-4">
            <div className="flex items-start gap-2">
              <Campo className="flex-1" rotulo={f.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} obrigatorio inputMode="numeric" value={f.documento} erro={erros.documento}
                onChange={(e) => {
                  const documento = f.tipo_pessoa === 'PJ' ? formatarCnpj(e.target.value) : formatarCpf(e.target.value);
                  setF((x) => ({ ...x, documento }));
                  // cadastro novo: ao completar um CNPJ válido, busca na Receita automaticamente
                  if (!fornecedor && f.tipo_pessoa === 'PJ' && somenteDigitos(documento).length === 14 && cnpjValido(documento)) void consultar(documento);
                }} />
              {f.tipo_pessoa === 'PJ' && <Botao variante="secundario" className="mt-6" icone={<Search className="size-4" />} carregando={consultando} onClick={() => void consultar()}>Consultar</Botao>}
            </div>
          </div>
          {jaCadastrado && !fornecedor && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 sm:col-span-6" role="status">
              <span className="flex-1">A empresa já existe no cadastro do órgão (outra coordenação). Se ela não aparece na sua lista, vincule-a à sua coordenação: os dados da empresa são os mesmos, sem duplicar.</span>
              <Botao pequeno carregando={vincular.isPending} onClick={() => vincular.mutate()}>Vincular à minha coordenação</Botao>
            </div>
          )}
          {aviso && <p className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900 sm:col-span-6">{aviso}</p>}
          <Campo className="sm:col-span-6" rotulo={f.tipo_pessoa === 'PJ' ? 'Razão social' : 'Nome completo'} obrigatorio value={f.razao_social} onChange={set('razao_social')} erro={erros.razao_social} maxLength={250} />
          {f.tipo_pessoa === 'PJ' && <Campo className="sm:col-span-6" rotulo="Nome fantasia" value={f.nome_fantasia} onChange={set('nome_fantasia')} maxLength={250} />}
          <Campo className="sm:col-span-3" rotulo="Inscrição estadual" value={f.inscricao_estadual} onChange={set('inscricao_estadual')} maxLength={30} />
          <Campo className="sm:col-span-3" rotulo="Inscrição municipal" value={f.inscricao_municipal} onChange={set('inscricao_municipal')} maxLength={30} />
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-800">Endereço</legend>
          <CamposEndereco valor={end} aoMudar={setEnd} erroCep={erros.cep} />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Contato</legend>
          <Campo rotulo="Nome do contato" value={f.nome_contato} onChange={set('nome_contato')} maxLength={150} />
          <Campo rotulo="E-mail" type="email" value={f.email} onChange={set('email')} erro={erros.email} />
          <Campo rotulo="Telefone" inputMode="tel" value={f.telefone} onChange={(e) => setF((x) => ({ ...x, telefone: formatarTelefone(e.target.value) }))} />
          <Campo rotulo="Telefone secundário" inputMode="tel" value={f.telefone_secundario} onChange={(e) => setF((x) => ({ ...x, telefone_secundario: formatarTelefone(e.target.value) }))} />
          <Campo className="sm:col-span-2" rotulo="Site" value={f.site} onChange={set('site')} placeholder="https://" />
          <AreaTexto className="sm:col-span-2" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} />
        </fieldset>
        {erros.geral && <CaixaErro mensagem={erros.geral} />}
      </form>
    </Modal>
  );
}

const BANCOS: Array<[string, string]> = [['001', 'Banco do Brasil'], ['104', 'Caixa Econômica Federal'], ['237', 'Bradesco'], ['341', 'Itaú Unibanco'],
  ['033', 'Santander'], ['077', 'Banco Inter'], ['260', 'Nu Pagamentos'], ['756', 'Sicoob'], ['748', 'Sicredi'], ['070', 'BRB'], ['037', 'Banpará'], ['047', 'Banese']];

function ContasBancarias({ fornecedor }: { fornecedor: Fornecedor }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const chave = ['contas', fornecedor.id];
  const q = useQuery({ queryKey: chave, queryFn: () => listarContas(fornecedor.id) });
  const [form, setForm] = useState<Partial<ContaBancaria> | null>(null);
  const [removendo, setRemovendo] = useState<ContaBancaria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const podeEditar = pode('fornecedores', 'editar');
  const salvar = useMutation({
    mutationFn: () => salvarConta(form!.id ?? null, {
      fornecedor_id: fornecedor.id, banco_codigo: form!.banco_codigo || null, banco_nome: (form!.banco_nome ?? '').trim(),
      agencia: (form!.agencia ?? '').trim(), conta: (form!.conta ?? '').trim(), tipo_conta: form!.tipo_conta ?? 'CORRENTE',
      pix_tipo: form!.pix_tipo || null, pix_chave: form!.pix_chave?.trim() || null, principal: !!form!.principal,
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: chave }); setForm(null); toast.success('Conta bancária salva.'); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const set = (k: keyof ContaBancaria) => (e: { target: { value: string } }) => setForm((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Contas bancárias</h3>
        {podeEditar && <Botao pequeno variante="secundario" icone={<Plus className="size-4" />} onClick={() => { setErro(null); setForm({ tipo_conta: 'CORRENTE', principal: !q.data?.length }); }}>Adicionar conta</Botao>}
      </div>
      {q.isLoading ? <Carregando /> : !q.data?.length ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nenhuma conta bancária cadastrada.</p> : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {q.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <Landmark className="size-4 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{c.banco_codigo ? `${c.banco_codigo} – ` : ''}{c.banco_nome} {c.principal && <Selo tom="marca" icone={<Star className="size-3" />}>Principal</Selo>}</p>
                <p className="text-slate-600">Ag. {c.agencia} · Conta {c.tipo_conta === 'POUPANCA' ? 'poupança' : c.tipo_conta === 'PAGAMENTO' ? 'pagamento' : 'corrente'} {c.conta}{c.pix_chave ? ` · Pix (${c.pix_tipo?.toLowerCase()}): ${c.pix_chave}` : ''}</p>
              </div>
              {podeEditar && <>
                <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar conta" onClick={() => { setErro(null); setForm(c); }} />
                <Botao pequeno variante="fantasma" icone={<Trash2 className="size-4 text-red-600" />} aria-label="Remover conta" onClick={() => setRemovendo(c)} />
              </>}
            </li>
          ))}
        </ul>
      )}
      <Modal aberto={!!form} aoFechar={() => setForm(null)} titulo={form?.id ? 'Editar conta bancária' : 'Nova conta bancária'}
        rodape={<><Botao variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao>
          <Botao carregando={salvar.isPending} disabled={!form?.banco_nome?.trim() || !form?.agencia?.trim() || !form?.conta?.trim()} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Selecao className="sm:col-span-2" rotulo="Banco" value={form.banco_codigo ?? ''} onChange={(e) => {
            const b = BANCOS.find(([c]) => c === e.target.value);
            setForm((x) => ({ ...x, banco_codigo: e.target.value || null, banco_nome: b ? b[1] : x!.banco_nome }));
          }}>
            <option value="">Outro (digite o nome abaixo)</option>
            {BANCOS.map(([c, n]) => <option key={c} value={c}>{c} – {n}</option>)}
          </Selecao>
          {!form.banco_codigo && <Campo className="sm:col-span-2" rotulo="Nome do banco" obrigatorio value={form.banco_nome ?? ''} onChange={set('banco_nome')} />}
          <Campo rotulo="Agência" obrigatorio value={form.agencia ?? ''} onChange={set('agencia')} maxLength={10} />
          <Campo rotulo="Conta (com dígito)" obrigatorio value={form.conta ?? ''} onChange={set('conta')} maxLength={20} />
          <Selecao rotulo="Tipo de conta" value={form.tipo_conta ?? 'CORRENTE'} onChange={set('tipo_conta')}>
            <option value="CORRENTE">Corrente</option><option value="POUPANCA">Poupança</option><option value="PAGAMENTO">Pagamento</option>
          </Selecao>
          <Selecao rotulo="Tipo de chave Pix" value={form.pix_tipo ?? ''} onChange={set('pix_tipo')}>
            <option value="">Sem Pix</option><option value="CNPJ">CNPJ</option><option value="CPF">CPF</option><option value="EMAIL">E-mail</option><option value="TELEFONE">Telefone</option><option value="ALEATORIA">Aleatória</option>
          </Selecao>
          {form.pix_tipo && <Campo className="sm:col-span-2" rotulo="Chave Pix" value={form.pix_chave ?? ''} onChange={set('pix_chave')} maxLength={100} />}
          <div className="sm:col-span-2"><Interruptor rotulo="Conta principal para pagamento" marcado={!!form.principal} aoMudar={(v) => setForm((x) => ({ ...x, principal: v }))} /></div>
          {erro && <div className="sm:col-span-2"><CaixaErro mensagem={erro} /></div>}
        </div>}
      </Modal>
      <ConfirmarComMotivo aberto={!!removendo} aoFechar={() => setRemovendo(null)} titulo="Remover conta bancária?"
        descricao="A conta deixa de ser oferecida para pagamentos. O registro fica no histórico." rotuloConfirmar="Remover"
        aoConfirmar={async (m) => { await removerConta(removendo!.id, m); await qc.invalidateQueries({ queryKey: chave }); toast.success('Conta removida.'); }} />
    </div>
  );
}

function DetalheFornecedor({ fornecedor, aoFechar, aoEditar }: { fornecedor: Fornecedor | null; aoFechar: () => void; aoEditar: (f: Fornecedor) => void }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const [aba, setAba] = useState<'dados' | 'contas' | 'documentos' | 'ocorrencias'>('dados');
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => { setAba('dados'); }, [fornecedor?.id]);
  const logo = useMutation({
    mutationFn: (a: File) => enviarLogoFornecedor(fornecedor!, a),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['fornecedores'] }); toast.success('Logomarca atualizada.'); aoFechar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  if (!fornecedor) return null;
  const f = fornecedor;
  const linha = (r: string, v: string | null | undefined) => <div><dt className="text-xs text-slate-500">{r}</dt><dd className="text-sm text-slate-900">{v || '—'}</dd></div>;
  return (
    <Modal aberto aoFechar={aoFechar} titulo={nomeFornecedor(f)} descricao={`${f.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} ${formatarDocumento(f)}`} largura="lg"
      rodape={pode('fornecedores', 'editar') && <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={() => aoEditar(f)}>Editar dados</Botao>}>
      <div className="mb-4 flex items-center gap-4">
        <Logo f={f} tamanho="size-16" />
        <div className="min-w-0 flex-1">
          {f.nome_fantasia && f.razao_social && <p className="text-sm text-slate-600">{f.nome_fantasia}</p>}
          {!f.ativo && <Selo tom="perigo">Inativo</Selo>}
        </div>
        {pode('fornecedores', 'editar') && <>
          <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const a = e.target.files?.[0]; if (a) logo.mutate(a); e.target.value = ''; }} />
          <Botao pequeno variante="secundario" icone={<ImageUp className="size-4" />} carregando={logo.isPending} onClick={() => entrada.current?.click()}>{f.logo_path ? 'Trocar logo' : 'Enviar logo'}</Botao>
        </>}
      </div>
      <Abas abas={[{ id: 'dados', rotulo: 'Dados' }, { id: 'contas', rotulo: 'Contas bancárias' }, { id: 'documentos', rotulo: 'Documentos' }, { id: 'ocorrencias', rotulo: 'Histórico de ocorrências e notificações' }]} ativa={aba} aoMudar={setAba} />
      {aba === 'dados' && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {linha('Inscrição estadual', f.inscricao_estadual)}{linha('Inscrição municipal', f.inscricao_municipal)}
          {linha('Endereço', [f.logradouro, f.numero, f.complemento].filter(Boolean).join(', '))}
          {linha('Bairro / Cidade', [f.bairro, f.cidade && `${f.cidade}/${f.uf ?? ''}`].filter(Boolean).join(' · '))}
          {linha('CEP', formatarCep(f.cep))}{linha('Contato', f.nome_contato)}
          {linha('Telefones', [formatarTelefone(f.telefone), formatarTelefone(f.telefone_secundario)].filter(Boolean).join(' · '))}
          {linha('E-mail', f.email)}{linha('Site', f.site)}{linha('Atualizado em', formatarDataHora(f.atualizado_em))}
          <div className="sm:col-span-2">{linha('Observações', f.observacoes)}</div>
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 sm:col-span-2">Contratos e notas fiscais deste fornecedor aparecerão aqui quando os módulos de Contratos (Fase 3) e Execução (Fase 4) forem liberados.</p>
        </dl>
      )}
      {aba === 'contas' && <ContasBancarias fornecedor={f} />}
      {aba === 'documentos' && <Anexos recurso="fornecedores" registroId={f.id} />}
      {aba === 'ocorrencias' && <HistoricoFornecedor fornecedorId={f.id} nome={nomeFornecedor(f)} documento={f.documento} />}
    </Modal>
  );
}

export function Fornecedores() {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [situacao, setSituacao] = useState<'ATIVOS' | 'INATIVOS' | 'TODOS'>('ATIVOS');
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Fornecedor | null | 'novo'>(null);
  const [vendo, setVendo] = useState<Fornecedor | null>(null);
  const [alternando, setAlternando] = useState<Fornecedor | null>(null);
  useEffect(() => setPagina(0), [termo, situacao]);
  const q = useQuery({
    queryKey: ['fornecedores', orgao?.id, termo, situacao, pagina],
    queryFn: () => listarFornecedores({ tenantId: orgao!.id, busca: termo, situacao, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao && pode('fornecedores', 'ler'), placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('fornecedores', 'ler')) return <SemPermissao />;

  return (
    <>
      <CabecalhoPagina titulo="Fornecedores" descricao="Cadastro central do órgão, usado em contratos, empenhos e notas fiscais. Ordem alfabética pela razão social."
        acoes={<><BotoesPlanilha tipo="fornecedores" />{pode('fornecedores', 'criar') && <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo fornecedor</Botao>}</>} />
      <Cartao>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-center">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Razão social, nome fantasia ou CNPJ/CPF" rotulo="Buscar fornecedor" />
          <ListaSelecao className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
            <option value="ATIVOS">Ativos</option><option value="INATIVOS">Inativos</option><option value="TODOS">Todos</option>
          </ListaSelecao>
          {(busca || situacao !== 'ATIVOS') && <Botao variante="fantasma" onClick={() => { setBusca(''); setSituacao('ATIVOS'); }}>Limpar filtros</Botao>}
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          !q.data!.itens.length ? <Vazio titulo="Nenhum fornecedor encontrado" descricao={busca ? 'Tente outro termo.' : 'Cadastre o primeiro fornecedor. Com o CNPJ, os dados são buscados na Receita.'} /> : (
            <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
              {q.data!.itens.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setVendo(f)}>
                    <Logo f={f} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">{nomeFornecedor(f)}{!f.ativo && <Selo tom="perigo">Inativo</Selo>}</span>
                      <span className="block truncate text-sm text-slate-600">{f.nome_fantasia && f.razao_social ? `${f.nome_fantasia} · ` : ''}{formatarDocumento(f)}</span>
                      <span className="block truncate text-xs text-slate-500">{[f.cidade && `${f.cidade}/${f.uf ?? ''}`, formatarTelefone(f.telefone), f.email].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                  {pode('fornecedores', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${nomeFornecedor(f)}`} onClick={() => setEditando(f)} />}
                  {pode('fornecedores', 'excluir') && <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={f.ativo ? `Inativar ${nomeFornecedor(f)}` : `Reativar ${nomeFornecedor(f)}`} onClick={() => setAlternando(f)} />}
                </li>
              ))}
            </ul>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
      <FormFornecedor aberto={editando !== null} aoFechar={() => setEditando(null)} fornecedor={editando === 'novo' ? null : editando}
        aoSalvar={(f) => { if (editando === 'novo') setVendo(f); }} />
      <DetalheFornecedor fornecedor={vendo} aoFechar={() => setVendo(null)} aoEditar={(f) => { setVendo(null); setEditando(f); }} />
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Inativar ${nomeFornecedor(alternando)}?` : `Reativar ${alternando ? nomeFornecedor(alternando) : ''}?`}
        descricao={alternando?.ativo ? 'O fornecedor deixa de aparecer para novos contratos e empenhos. Histórico, documentos e vínculos são preservados.' : 'O fornecedor volta a ficar disponível.'}
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusFornecedor(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['fornecedores'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}
