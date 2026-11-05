// Exportar a lista para Excel e importar planilha (.xlsx/.csv) com prévia, duplicados e gravação tudo-ou-nada.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { mensagemDeErro } from '@/lib/erros';
import { formatarCnpj, formatarCpf, formatarCep, formatarTelefone } from '@/lib/formatacao';
import { baixarExcel, dataIso, lerPlanilha } from '@/lib/planilhas';
import type { Recurso } from '@/lib/tipos';
import { listarFornecedores, listarServidores, listarUnidadesAtendidas } from '@/services/cadastros';
import { importar, registrarExportacao, type ResultadoImportacao } from '@/services/relatorios';
import { Botao, CaixaErro, Interruptor } from './ui/basicos';
import { Modal } from './ui/Modal';

type Tipo = 'fornecedores' | 'servidores' | 'unidades_atendidas';
const RECURSO: Record<Tipo, Recurso> = { fornecedores: 'fornecedores', servidores: 'servidores', unidades_atendidas: 'unidades' };
const NOME: Record<Tipo, string> = { fornecedores: 'fornecedores', servidores: 'servidores', unidades_atendidas: 'unidades atendidas' };

// coluna da planilha (cabeçalho normalizado) → campo da importação
const CAMPOS: Record<Tipo, Array<[string, string[], string]>> = {
  fornecedores: [
    ['documento', ['cnpj_cpf', 'cnpj', 'cpf', 'documento'], 'CNPJ ou CPF'], ['razao_social', ['razao_social', 'razao', 'nome'], 'Razão social / nome'],
    ['nome_fantasia', ['nome_fantasia', 'fantasia'], 'Nome fantasia'], ['email', ['email', 'e_mail'], 'E-mail'], ['telefone', ['telefone', 'fone'], 'Telefone'],
    ['cep', ['cep'], 'CEP'], ['logradouro', ['logradouro', 'endereco', 'rua'], 'Logradouro'], ['numero', ['numero', 'n'], 'Número'],
    ['bairro', ['bairro'], 'Bairro'], ['cidade', ['cidade', 'municipio'], 'Cidade'], ['uf', ['uf', 'estado'], 'UF'], ['nome_contato', ['contato', 'nome_contato'], 'Contato'],
  ],
  servidores: [
    ['nome', ['nome', 'nome_completo'], 'Nome'], ['matricula', ['matricula', 'mat'], 'Matrícula'], ['unidade', ['unidade', 'lotacao', 'sigla', 'setor'], 'Unidade (sigla da Estrutura)'],
    ['cargo', ['cargo'], 'Cargo'], ['funcao', ['funcao'], 'Função'], ['email', ['email', 'email_institucional', 'e_mail'], 'E-mail institucional'],
    ['telefone', ['telefone', 'fone'], 'Telefone'], ['data_nomeacao', ['data_nomeacao', 'nomeacao'], 'Data de nomeação'],
    ['cpf', ['cpf'], 'CPF'], ['data_nascimento', ['data_nascimento', 'nascimento'], 'Data de nascimento'],
  ],
  unidades_atendidas: [
    ['nome', ['nome', 'unidade'], 'Nome'], ['sigla', ['sigla'], 'Sigla'], ['tipo', ['tipo'], 'Tipo (UBS, USF, CAPS…)'], ['codigo', ['codigo', 'cnes'], 'Código / CNES'],
    ['bairro', ['bairro'], 'Bairro'], ['endereco', ['endereco', 'logradouro'], 'Endereço'], ['cidade', ['cidade'], 'Cidade'], ['uf', ['uf'], 'UF'],
    ['telefone', ['telefone'], 'Telefone'], ['email', ['email', 'e_mail'], 'E-mail'],
  ],
};

function mapear(tipo: Tipo, linhas: Array<Record<string, string>>) {
  return linhas.map((l, i) => {
    const r: Record<string, unknown> = { linha: i + 2 };
    for (const [campo, apelidos] of CAMPOS[tipo]) {
      const chave = apelidos.find((a) => a in l);
      let v = chave ? l[chave] ?? '' : '';
      if (campo.startsWith('data_')) v = dataIso(v);
      if (v !== '') r[campo] = v;
    }
    return r;
  });
}

async function buscarTudo<T>(pagina: (offset: number) => Promise<{ itens: T[]; total: number }>, tamanho = 500) {
  const todos: T[] = [];
  for (let o = 0; o < 20000; o += tamanho) {
    const { itens } = await pagina(o);
    todos.push(...itens);
    if (itens.length < tamanho) break;
  }
  return todos;
}

async function exportar(tipo: Tipo, tenantId: string) {
  const data = new Date().toISOString().slice(0, 10);
  if (tipo === 'fornecedores') {
    const linhas = await buscarTudo((o) => listarFornecedores({ tenantId, situacao: 'TODOS', limite: 500, offset: o }));
    await baixarExcel(`fornecedores-${data}`, [{ nome: 'Fornecedores', linhas, colunas: [
      { titulo: 'Razão social / nome', valor: (f) => f.razao_social, largura: 40 }, { titulo: 'Nome fantasia', valor: (f) => f.nome_fantasia, largura: 28 },
      { titulo: 'CNPJ/CPF', valor: (f) => (f.tipo_pessoa === 'PF' ? formatarCpf(f.documento) : formatarCnpj(f.documento)), largura: 20 },
      { titulo: 'E-mail', valor: (f) => f.email, largura: 28 }, { titulo: 'Telefone', valor: (f) => formatarTelefone(f.telefone), largura: 16 },
      { titulo: 'CEP', valor: (f) => formatarCep(f.cep), largura: 11 }, { titulo: 'Logradouro', valor: (f) => f.logradouro, largura: 30 },
      { titulo: 'Número', valor: (f) => f.numero, largura: 8 }, { titulo: 'Bairro', valor: (f) => f.bairro, largura: 20 },
      { titulo: 'Cidade', valor: (f) => f.cidade, largura: 18 }, { titulo: 'UF', valor: (f) => f.uf, largura: 5 }, { titulo: 'Contato', valor: (f) => f.nome_contato, largura: 20 },
      { titulo: 'Situação', valor: (f) => (f.ativo ? 'Ativo' : 'Inativo'), largura: 10 },
    ] }]);
    return linhas.length;
  }
  if (tipo === 'servidores') {
    const ativos = await buscarTudo((o) => listarServidores({ tenantId, situacao: 'TODOS', limite: 100, offset: o }), 100);
    await baixarExcel(`servidores-${data}`, [{ nome: 'Servidores', linhas: ativos, colunas: [
      { titulo: 'Nome', valor: (s) => s.nome, largura: 36 }, { titulo: 'Matrícula', valor: (s) => s.matricula, largura: 12 },
      { titulo: 'Cargo', valor: (s) => s.cargo, largura: 20 }, { titulo: 'Função', valor: (s) => s.funcao, largura: 24 },
      { titulo: 'Unidade', valor: (s) => s.unidade_sigla ?? s.unidade_nome, largura: 18 }, { titulo: 'E-mail institucional', valor: (s) => s.email_institucional, largura: 30 },
      { titulo: 'Nomeação', valor: (s) => s.data_nomeacao, tipo: 'data' }, { titulo: 'Exoneração', valor: (s) => s.data_exoneracao, tipo: 'data' },
      { titulo: 'Situação', valor: (s) => (s.exonerado ? 'Exonerado' : 'Ativo'), largura: 11 },
      // CPF só sai para quem pode ver dados pessoais (o banco já devolve vazio para os demais)
      { titulo: 'CPF', valor: (s) => (s.cpf ? formatarCpf(s.cpf) : ''), largura: 16 },
    ] }]);
    return ativos.length;
  }
  const linhas = await buscarTudo((o) => listarUnidadesAtendidas({ tenantId, situacao: 'TODOS', limite: 500, offset: o }));
  await baixarExcel(`unidades-atendidas-${data}`, [{ nome: 'Unidades atendidas', linhas, colunas: [
    { titulo: 'Nome', valor: (u) => u.nome, largura: 36 }, { titulo: 'Sigla', valor: (u) => u.sigla, largura: 10 }, { titulo: 'Tipo', valor: (u) => u.tipo, largura: 12 },
    { titulo: 'Código', valor: (u) => u.codigo, largura: 12 }, { titulo: 'Bairro', valor: (u) => u.bairro, largura: 22 }, { titulo: 'Endereço', valor: (u) => u.logradouro, largura: 40 },
    { titulo: 'Cidade', valor: (u) => u.cidade, largura: 14 }, { titulo: 'UF', valor: (u) => u.uf, largura: 5 }, { titulo: 'Grupo de rateio', valor: (u) => (u.eh_grupo ? 'Sim' : 'Não'), largura: 10 },
    { titulo: 'Situação', valor: (u) => (u.ativo ? 'Ativa' : 'Inativa'), largura: 10 },
  ] }]);
  return linhas.length;
}

export function BotoesPlanilha({ tipo }: { tipo: Tipo }) {
  const { orgao, pode } = useSessao();
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<Array<Record<string, unknown>> | null>(null);
  const [previa, setPrevia] = useState<ResultadoImportacao | null>(null);
  const [ignorar, setIgnorar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const recurso = RECURSO[tipo];

  const exp = useMutation({
    mutationFn: async () => { const n = await exportar(tipo, orgao!.id); await registrarExportacao(orgao!.id, recurso, `Excel: ${NOME[tipo]}`, n); return n; },
    onSuccess: (n) => toast.success(`${n} registro(s) exportado(s).`), onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const ler = useMutation({
    mutationFn: async (arquivo: File) => {
      const lidas = mapear(tipo, await lerPlanilha(arquivo));
      if (!lidas.length) throw { erro: 'A planilha não tem linhas com dados (a 1ª linha deve ser o cabeçalho).' };
      setLinhas(lidas);
      return importar(tipo, orgao!.id, lidas, false, false);
    },
    onSuccess: (r) => { setErro(null); setPrevia(r); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const aplicar = useMutation({
    mutationFn: () => importar(tipo, orgao!.id, linhas!, true, ignorar),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: [tipo === 'unidades_atendidas' ? 'unidades-atendidas' : tipo] });
      toast.success(`${r.validos} registro(s) importado(s).${r.duplicados.length ? ` ${r.duplicados.length} duplicado(s) ignorado(s).` : ''}`);
      setPrevia(null); setLinhas(null);
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const modelo = () => baixarExcel(`modelo-importacao-${tipo}`, [{ nome: 'Importação', linhas: [], colunas: CAMPOS[tipo].map(([, apelidos, titulo]) => ({ titulo: apelidos[0]!, valor: () => '', largura: Math.max(14, titulo.length + 2) })) }]);
  if (!orgao) return null;

  return (
    <>
      {pode(recurso, 'exportar') && <Botao variante="secundario" icone={<FileSpreadsheet className="size-4" />} carregando={exp.isPending} onClick={() => exp.mutate()}>Excel</Botao>}
      {pode(recurso, 'criar') && <>
        <input ref={entrada} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const a = e.target.files?.[0]; if (a) ler.mutate(a); e.target.value = ''; }} />
        <Botao variante="secundario" icone={<Upload className="size-4" />} carregando={ler.isPending} onClick={() => entrada.current?.click()}>Importar</Botao>
        <Botao variante="fantasma" icone={<Download className="size-4" />} onClick={() => void modelo()} title="Planilha modelo para importação">Modelo</Botao>
      </>}
      <Modal aberto={!!previa} aoFechar={() => { setPrevia(null); setLinhas(null); }} titulo={`Importar ${NOME[tipo]}: prévia`} largura="lg"
        descricao="Nada foi gravado ainda. Confira o resumo e confirme."
        rodape={<>
          <Botao variante="fantasma" icone={<Download className="size-4" />} onClick={() => void modelo()}>Baixar modelo</Botao>
          <Botao variante="secundario" onClick={() => { setPrevia(null); setLinhas(null); }}>Cancelar</Botao>
          <Botao carregando={aplicar.isPending} disabled={!previa || previa.erros.length > 0 || previa.validos === 0 || (previa.duplicados.length > 0 && !ignorar)}
            onClick={() => aplicar.mutate()}>Importar {previa?.validos ?? 0} registro(s)</Botao>
        </>}>
        {previa && <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Linhas', previa.total, 'neutro'], ['Prontas para importar', previa.validos, 'ok'], ['Duplicadas', previa.duplicados.length, previa.duplicados.length ? 'aviso' : 'neutro'], ['Com erro', previa.erros.length, previa.erros.length ? 'erro' : 'neutro']].map(([r, v, t]) => (
              <div key={r as string} className={`rounded-lg p-3 ${t === 'ok' ? 'bg-emerald-50' : t === 'aviso' ? 'bg-amber-50' : t === 'erro' ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className="text-xs text-slate-600">{r}</p><p className="numero text-xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          {previa.erros.length > 0 && <div>
            <p className="mb-1 text-sm font-semibold text-red-800">Corrija estas linhas na planilha e envie de novo (nada é importado enquanto houver erro):</p>
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-red-200 text-sm">{previa.erros.slice(0, 100).map((e, i) => <li key={i} className="border-b border-red-100 px-3 py-1.5">Linha {e.linha}: {e.mensagem}</li>)}</ul>
          </div>}
          {previa.duplicados.length > 0 && <div>
            <p className="mb-1 text-sm font-semibold text-amber-900">Duplicados (não serão criados de novo):</p>
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 text-sm">{previa.duplicados.slice(0, 100).map((d, i) => <li key={i} className="border-b border-amber-100 px-3 py-1.5">Linha {d.linha} ({d.documento}): {d.motivo}</li>)}</ul>
            <div className="mt-2"><Interruptor rotulo="Importar as demais linhas e ignorar os duplicados" marcado={ignorar} aoMudar={setIgnorar} /></div>
          </div>}
          <p className="text-xs text-slate-500">Colunas reconhecidas: {CAMPOS[tipo].map(([, a, t]) => `${a[0]} (${t})`).join(', ')}. Datas em dd/mm/aaaa ou aaaa-mm-dd.</p>
          {erro && <CaixaErro mensagem={erro} />}
        </div>}
      </Modal>
    </>
  );
}
