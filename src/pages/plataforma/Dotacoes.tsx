// Módulo do desenvolvedor (plataforma): catálogo orçamentário do ente (município), compartilhado pelos órgãos dele.
// A dotação é cadastrada no mesmo formato do quadro "CLASSIFICAÇÃO" da nota de empenho.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Landmark, Pencil, Plus, Power, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { useBuscaAtrasada } from '@/components/ImagemPrivada';
import { Abas, CampoBusca } from '@/components/ui/Abas';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { baixarExcel, lerPlanilha } from '@/lib/planilhas';
import type { Classificador, ClassificadorTipo, ClassificacaoOrcamentaria, Ente, Tenant, TipoClassificador } from '@/lib/tipos';
import { listarOrgaos } from '@/services/api';
import {
  cadastrarDotacao, definirOrgaosDaUo, definirStatusClassificacao, editarDotacao, definirStatusClassificador, importarDotacoes, listarClassificadores,
  listarDotacoesEnte, listarEntes, obterClassificadores, orgaosDasUos, salvarClassificador, salvarEnte, tiposClassificador, vincularOrgaoAoEnte,
  type CampoEmpenho, type CamposEmpenho, type ResultadoImportacaoDotacoes,
} from '@/services/cadastros';
import { NaturezasDespesa } from './NaturezasDespesa';

const POR_PAGINA = 25;
const NATUREZAS = { PROJETO: 'Projeto', ATIVIDADE: 'Atividade', OPERACAO_ESPECIAL: 'Operação especial' } as const;
const digitos = (s: string) => s.replace(/\D/g, '');
const ANO_ATUAL = new Date().getFullYear();
const exercicioValido = (s: string) => /^\d{4}$/.test(s) && Number(s) >= 2000 && Number(s) <= 2100;
// mesma normalização dos títulos de coluna feita por lerPlanilha ("Natureza Despesa" → natureza_despesa)
const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Linhas do quadro "CLASSIFICAÇÃO" da nota de empenho
const LINHAS: Array<{ campo: CampoEmpenho; rotulo: string; tipo: TipoClassificador; exemplo: string; obrigatorio?: boolean; tamanho?: number; coluna: string }> = [
  { campo: 'unidade_orcamentaria', rotulo: 'Unidade Orçamentária', tipo: 'UNIDADE_ORCAMENTARIA', exemplo: '18401', coluna: 'uo' },
  { campo: 'unidade_gestora', rotulo: 'Unidade Gestora', tipo: 'UNIDADE_GESTORA', exemplo: '184010', coluna: 'ug' },
  { campo: 'funcao', rotulo: 'Função', tipo: 'FUNCAO', exemplo: '10', tamanho: 2, coluna: 'funcao' },
  { campo: 'subfuncao', rotulo: 'SubFunção', tipo: 'SUBFUNCAO', exemplo: '301', tamanho: 3, coluna: 'subfuncao' },
  { campo: 'programa', rotulo: 'Programa', tipo: 'PROGRAMA', exemplo: '0085', tamanho: 4, coluna: 'programa' },
  { campo: 'acao', rotulo: 'Ação', tipo: 'ACAO', exemplo: '2090', obrigatorio: true, tamanho: 4, coluna: 'acao' },
  { campo: 'natureza', rotulo: 'Natureza Despesa', tipo: 'ELEMENTO', exemplo: '33903900', obrigatorio: true, coluna: 'natureza' },
  { campo: 'subelemento', rotulo: 'SubElemento', tipo: 'SUBELEMENTO', exemplo: '33903914', coluna: 'subelemento' },
  { campo: 'fonte', rotulo: 'Fonte', tipo: 'FONTE', exemplo: '27490000', obrigatorio: true, coluna: 'fonte' },
  { campo: 'codigo_acompanhamento', rotulo: 'Cód. Acompanhamento - CO', tipo: 'CODIGO_ACOMPANHAMENTO', exemplo: '27490000', coluna: 'co' },
  { campo: 'id_uso', rotulo: 'IdUso', tipo: 'ID_USO', exemplo: '0', coluna: 'iduso' },
  { campo: 'idoc', rotulo: 'IDoc', tipo: 'IDOC', exemplo: '0000', tamanho: 4, coluna: 'idoc' },
  { campo: 'resultado_primario', rotulo: 'Ind. Result. Prim.', tipo: 'RESULTADO_PRIMARIO', exemplo: '2', coluna: 'resultado_primario' },
  { campo: 'subfonte', rotulo: 'SubFonte', tipo: 'SUBFONTE', exemplo: '0', coluna: 'subfonte' },
];
// coluna da dotação → campo do formulário (para "nova a partir desta")
const ID_DO_CAMPO: Record<CampoEmpenho, keyof ClassificacaoOrcamentaria> = {
  unidade_orcamentaria: 'unidade_orcamentaria_id', unidade_gestora: 'unidade_gestora_id', funcao: 'funcao_id', subfuncao: 'subfuncao_id', programa: 'programa_id', acao: 'acao_id',
  natureza: 'elemento_id', subelemento: 'subelemento_id', fonte: 'fonte_id', codigo_acompanhamento: 'codigo_acompanhamento_id', id_uso: 'id_uso_id',
  idoc: 'idoc_id', resultado_primario: 'resultado_primario_id', subfonte: 'subfonte_id',
};

/** Código da natureza no formato da nota de empenho, a partir dos classificadores da dotação */
function naturezaDe(cl: Classificador[], d: ClassificacaoOrcamentaria) {
  const c = (id: string | null) => cl.find((x) => x.id === id)?.codigo ?? '';
  const cat = c(d.categoria_economica_id); const gnd = c(d.gnd_id); const mod = c(d.modalidade_id); const el = c(d.elemento_id);
  return cat && gnd && mod ? `${cat}${gnd}${mod.padStart(2, '0')}${el.padStart(2, '0')}` : el;
}

function useTipos() {
  return useQuery({ queryKey: ['classificador-tipos'], queryFn: tiposClassificador, staleTime: Infinity });
}

// ---------------------------------------------------------------- dotação no formato da nota de empenho

type Valores = Partial<Record<CampoEmpenho, { codigo: string; descricao: string; existente?: boolean }>>;

function FormDotacao({ ente, orgaosDoEnte, inicial, exercicioInicial, aberto, aoFechar }: {
  ente: Ente; orgaosDoEnte: Tenant[]; inicial: Valores | null; exercicioInicial: number | null; aberto: boolean; aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState<Valores>({});
  const [orgaos, setOrgaos] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const [exercicio, setExercicio] = useState(String(ANO_ATUAL));
  const [erro, setErro] = useState<{ campo?: string; mensagem: string } | null>(null);
  useEffect(() => { if (aberto) { setV(inicial ?? {}); setOrgaos([]); setObs(''); setErro(null); setExercicio(String(exercicioInicial ?? ANO_ATUAL)); } }, [aberto, inicial, exercicioInicial]);

  // Ao sair do código, procura o classificador já cadastrado no ente e traz a descrição
  async function procurar(campo: CampoEmpenho) {
    const linha = LINHAS.find((l) => l.campo === campo)!;
    let codigo = (v[campo]?.codigo ?? '').trim();
    if (!codigo) return;
    if (linha.tamanho && /^\d+$/.test(codigo)) codigo = codigo.padStart(linha.tamanho, '0');
    let busca = codigo;
    if (campo === 'natureza') busca = digitos(codigo).slice(4, 6);
    if (campo === 'subelemento') busca = digitos(codigo).length === 8 ? digitos(codigo).slice(6, 8) : digitos(codigo);
    const r = await listarClassificadores({ enteId: ente.id, tipo: linha.tipo, busca, limite: 20 });
    let achado = r.itens.find((c) => c.codigo === busca);
    if (campo === 'subelemento') {
      const el = r.itens.length ? (await listarClassificadores({ enteId: ente.id, tipo: 'ELEMENTO', busca: digitos(v.natureza?.codigo ?? '').slice(4, 6), limite: 5 })).itens[0] : undefined;
      achado = r.itens.find((c) => c.codigo === busca && c.pai_id === el?.id);
    }
    if (campo === 'unidade_orcamentaria' && achado) {
      const m = await orgaosDasUos([achado.id]);
      setOrgaos(m.map((x) => x.tenant_id));
    }
    setV((x) => ({ ...x, [campo]: { codigo, descricao: achado?.descricao ?? x[campo]?.descricao ?? '', existente: !!achado } }));
  }

  const natureza = digitos(v.natureza?.codigo ?? '');
  const sub = digitos(v.subelemento?.codigo ?? '');
  const previa = [
    v.unidade_orcamentaria?.codigo,
    [v.funcao?.codigo, v.subfuncao?.codigo, v.programa?.codigo, v.acao?.codigo].filter(Boolean).join('.'),
    natureza.length === 8 ? (sub ? natureza.slice(0, 6) + (sub.length === 8 ? sub.slice(6) : sub.padStart(2, '0')) : natureza) : '',
    v.fonte?.codigo ? `Fonte ${v.fonte.codigo}` : '',
  ].filter(Boolean).join(' | ');

  const salvar = useMutation({
    mutationFn: () => {
      const campos: CamposEmpenho = {};
      for (const l of LINHAS) {
        const x = v[l.campo];
        if (x?.codigo.trim()) campos[l.campo] = { codigo: x.codigo.trim(), descricao: x.descricao.trim() };
      }
      return cadastrarDotacao({ enteId: ente.id, campos, orgaos: v.unidade_orcamentaria?.codigo.trim() ? orgaos : [], descricao: obs.trim() || null, exercicio: exercicio ? Number(exercicio) : null });
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['dotacoes-ente'] });
      await qc.invalidateQueries({ queryKey: ['classificadores-ente'] });
      const ano = r.exercicio ? ` (exercício ${r.exercicio})` : '';
      toast.success(r.criada ? `Dotação cadastrada: ${r.codigo_completo}${ano}` : `Esta dotação já existia${ano}: ${r.codigo_completo}. Nada foi duplicado.`);
      aoFechar();
    },
    onError: (e) => { const t = traduzirErro(e); setErro({ campo: t.campo ?? undefined, mensagem: t.mensagem }); },
  });
  const faltando = !v.acao?.codigo || natureza.length !== 8 || !v.fonte?.codigo || (!!exercicio && !exercicioValido(exercicio));

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={`Nova dotação · ${ente.nome}`} largura="lg"
      descricao="Preencha como no quadro CLASSIFICAÇÃO da nota de empenho. Códigos já cadastrados são reaproveitados; para código novo, informe a descrição."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvar.isPending} disabled={faltando} onClick={() => salvar.mutate()}>Cadastrar dotação</Botao></>}>
      <div className="flex flex-col gap-2">
        <div className="mb-2 grid gap-2 sm:grid-cols-[11rem_9rem_1fr] sm:items-center">
          <label htmlFor="dot-exercicio" className="text-sm font-medium text-slate-800">Exercício financeiro</label>
          <input id="dot-exercicio" inputMode="numeric" maxLength={4} className={cx('numero h-9 rounded-lg border px-2 text-sm', exercicio && !exercicioValido(exercicio) ? 'border-red-500' : 'border-slate-300', erro?.campo === 'exercicio' && 'border-red-500 bg-red-50')}
            value={exercicio} onChange={(e) => setExercicio(digitos(e.target.value))} />
          <p className="text-xs text-slate-500">Ano da LOA. A mesma combinação pode ser cadastrada de novo para outro exercício. Vazio = vale para qualquer exercício.</p>
        </div>
        <div className="hidden grid-cols-[11rem_9rem_1fr] gap-2 px-1 text-xs font-medium text-slate-500 sm:grid"><span>Campo</span><span>Código</span><span>Descrição</span></div>
        {LINHAS.map((l) => {
          const x = v[l.campo];
          const comErro = erro?.campo && [l.campo, l.tipo.toLowerCase()].includes(erro.campo);
          return (
            <div key={l.campo} className={cx('grid gap-2 rounded-lg px-1 py-1 sm:grid-cols-[11rem_9rem_1fr] sm:items-center', comErro && 'bg-red-50')}>
              <label htmlFor={`cod-${l.campo}`} className="text-sm font-medium text-slate-800">{l.rotulo}{l.obrigatorio && <span className="text-red-600"> *</span>}</label>
              <input id={`cod-${l.campo}`} className="numero h-9 rounded-lg border border-slate-300 px-2 text-sm" placeholder={l.exemplo} maxLength={30}
                value={x?.codigo ?? ''} onChange={(e) => setV((o) => ({ ...o, [l.campo]: { codigo: e.target.value, descricao: o[l.campo]?.descricao ?? '', existente: false } }))}
                onBlur={() => void procurar(l.campo)} />
              <div className="flex items-center gap-2">
                <input aria-label={`Descrição de ${l.rotulo}`} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-700"
                  value={x?.descricao ?? ''} disabled={x?.existente} maxLength={300}
                  placeholder={l.campo === 'natureza' ? 'Ex.: Outros Serviços de Terceiros - Pessoa Jurídica' : ''}
                  onChange={(e) => setV((o) => ({ ...o, [l.campo]: { codigo: o[l.campo]?.codigo ?? '', descricao: e.target.value } }))} />
                {x?.existente && <Selo tom="sucesso">já cadastrado</Selo>}
              </div>
            </div>
          );
        })}
        <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">Código da dotação: </span><span className="numero font-mono font-semibold text-slate-900">{previa || '—'}</span>{exercicio && <span className="text-slate-500"> · exercício {exercicio}</span>}</p>
        <p className="text-xs text-slate-500">A natureza (8 dígitos) é desmembrada em categoria, grupo (GND), modalidade e elemento. O subelemento aceita os 8 dígitos (33903914) ou os 2 finais.</p>
        {v.unidade_orcamentaria?.codigo.trim() && (
          <fieldset className="mt-2 rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-800">Órgãos que usam a unidade orçamentária {v.unidade_orcamentaria.codigo}</legend>
            {!orgaosDoEnte.length ? <p className="text-sm text-slate-600">Nenhum órgão vinculado a este ente (aba "Órgãos do ente").</p> : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {orgaosDoEnte.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-marca-700" checked={orgaos.includes(o.id)}
                      onChange={(e) => setOrgaos((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))} />
                    {o.nome_curto}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">Sem nenhum marcado, a dotação fica disponível para todos os órgãos do ente. Os órgãos marcados são acrescentados aos já indicados.</p>
          </fieldset>
        )}
        <AreaTexto rotulo="Observação" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} rows={2} />
        {erro && <CaixaErro mensagem={erro.mensagem} />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- importação (LOA)

const COLUNAS_PLANILHA = [
  ...LINHAS.flatMap((l) => [[l.coluna, l.rotulo], [`${l.coluna}_descricao`, `${l.rotulo} descrição`]]),
  ['orgaos', 'Órgãos'], ['observacao', 'Observação'], ['exercicio', 'Exercício'],
] as Array<[string, string]>;

async function baixarModelo() {
  const exemplo: Record<string, string> = {
    uo: '18401', uo_descricao: 'FUNDO MUNICIPAL DE SAÚDE', funcao: '10', funcao_descricao: 'Saúde', subfuncao: '301', subfuncao_descricao: 'Atenção Básica',
    programa: '0085', programa_descricao: 'ATENÇÃO A SAUDE', acao: '2090', acao_descricao: 'Fortalecimento da Rede de Atenção Primária a Saúde',
    natureza: '33903900', natureza_descricao: 'Outros Serviços de Terceiros - Pessoa Jurídica', subelemento: '33903914', subelemento_descricao: 'Manutenção e Conservação de Bens Imóveis',
    fonte: '27490000', fonte_descricao: 'Outras vinculações de transferências', co: '27490000', co_descricao: 'Outras vinculações de transferências',
    iduso: '0', iduso_descricao: 'Recursos não destinados à contrapartida', idoc: '0000', idoc_descricao: 'Sem identificação',
    resultado_primario: '2', resultado_primario_descricao: 'Despesa Primária Discricionária', subfonte: '0', subfonte_descricao: 'Sem subFonte',
    orgaos: 'SMS Aracaju', observacao: '', exercicio: String(ANO_ATUAL), ug: '', ug_descricao: '',
  };
  await baixarExcel('modelo-dotacoes.xlsx', [{ nome: 'Dotações', linhas: [exemplo], colunas: COLUNAS_PLANILHA.map(([k, t]) => ({ titulo: t, valor: (l: Record<string, string>) => l[k] ?? '', largura: k.endsWith('descricao') ? 36 : 14 })) }]);
}

function Importacao({ ente, orgaosDoEnte, arquivo, aoFechar }: { ente: Ente; orgaosDoEnte: Tenant[]; arquivo: File | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [linhas, setLinhas] = useState<Parameters<typeof importarDotacoes>[1]>([]);
  const [errosLocais, setErrosLocais] = useState<Array<{ linha: number; mensagem: string }>>([]);
  const [res, setRes] = useState<ResultadoImportacaoDotacoes | null>(null);
  const [lendo, setLendo] = useState(false);
  useEffect(() => {
    if (!arquivo) return;
    setRes(null); setLendo(true);
    (async () => {
      try {
        const brutas = await lerPlanilha(arquivo);
        const locais: Array<{ linha: number; mensagem: string }> = [];
        const convertidas = brutas.map((b, i) => {
          const campos: CamposEmpenho = {};
          for (const l of LINHAS) {
            let codigo = (b[chave(l.rotulo)] ?? b[l.coluna] ?? '').trim();
            if (!codigo) continue;
            // células numéricas perdem os zeros à esquerda (0085 → 85)
            if (l.tamanho && /^\d+$/.test(codigo)) codigo = codigo.padStart(l.tamanho, '0');
            campos[l.campo] = { codigo, descricao: (b[chave(`${l.rotulo} descrição`)] ?? b[`${l.coluna}_descricao`] ?? '').trim() };
          }
          const orgaos: string[] = [];
          for (const nome of (b.orgaos ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
            const o = orgaosDoEnte.find((x) => x.nome_curto.toLowerCase() === nome.toLowerCase() || x.nome_oficial.toLowerCase() === nome.toLowerCase());
            if (o) orgaos.push(o.id); else locais.push({ linha: i + 2, mensagem: `Órgão "${nome}" não está vinculado a este ente.` });
          }
          const exercicio = (b.exercicio ?? '').trim();
          if (exercicio && !exercicioValido(exercicio)) locais.push({ linha: i + 2, mensagem: `Exercício "${exercicio}" inválido (use o ano com 4 dígitos).` });
          return { linha: i + 2, campos, orgaos, descricao: (b.observacao ?? '').trim() || null, exercicio: exercicio || null };
        });
        setLinhas(convertidas); setErrosLocais(locais);
        setRes(await importarDotacoes(ente.id, convertidas, false));
      } catch (e) { toast.error(mensagemDeErro(e)); aoFechar(); } finally { setLendo(false); }
    })();
    // só quando chega um arquivo novo (órgãos e ente vêm do momento da escolha)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivo]);
  const gravar = useMutation({
    mutationFn: () => importarDotacoes(ente.id, linhas, true),
    onSuccess: async (r) => { await qc.invalidateQueries({ queryKey: ['dotacoes-ente'] }); toast.success(`${r.novas} dotação(ões) nova(s) gravada(s); ${r.existentes} já existiam.`); aoFechar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const erros = [...errosLocais, ...(res?.erros ?? [])].sort((a, b) => a.linha - b.linha);
  return (
    <Modal aberto={!!arquivo} aoFechar={aoFechar} titulo="Prévia da importação de dotações" largura="lg" descricao={arquivo?.name}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao disabled={!res || erros.length > 0 || !res.novas} carregando={gravar.isPending} onClick={() => gravar.mutate()}>Gravar {res?.novas ?? 0} dotação(ões)</Botao></>}>
      {lendo || !res ? <Carregando texto="Conferindo a planilha..." /> : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-3"><p className="numero text-xl font-semibold">{res.total}</p><p className="text-xs text-slate-600">linhas</p></div>
            <div className="rounded-lg bg-emerald-50 p-3"><p className="numero text-xl font-semibold text-emerald-800">{res.novas}</p><p className="text-xs text-slate-600">novas</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="numero text-xl font-semibold">{res.existentes}</p><p className="text-xs text-slate-600">já cadastradas (ignoradas)</p></div>
          </div>
          {erros.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="mb-1 font-medium text-red-900">{erros.length} linha(s) com erro. Corrija a planilha e importe de novo — nada é gravado enquanto houver erro.</p>
              <ul className="max-h-60 list-disc overflow-y-auto pl-5 text-red-900">{erros.map((e, i) => <li key={i}>Linha {e.linha}: {e.mensagem}</li>)}</ul>
            </div>
          ) : <p className="text-slate-700">Nenhum erro encontrado. A gravação é feita de uma vez só (tudo ou nada).</p>}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- identificação e exercício de uma dotação

function EditarDotacao({ dotacao, aoFechar }: { dotacao: ClassificacaoOrcamentaria | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [descricao, setDescricao] = useState('');
  const [exercicio, setExercicio] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (dotacao) { setDescricao(dotacao.descricao ?? ''); setExercicio(dotacao.exercicio ? String(dotacao.exercicio) : ''); setErro(null); } }, [dotacao]);
  const salvar = useMutation({
    mutationFn: () => editarDotacao(dotacao!.id, { descricao: descricao.trim() || null, exercicio: exercicio ? Number(exercicio) : null }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['dotacoes-ente'] }); toast.success('Dotação atualizada.'); aoFechar(); },
    onError: (e) => setErro(traduzirErro(e).mensagem),
  });
  return (
    <Modal aberto={!!dotacao} aoFechar={aoFechar} titulo="Editar dotação" descricao={dotacao?.codigo_completo} largura="md"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvar.isPending} disabled={!!exercicio && !exercicioValido(exercicio)} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Exercício financeiro" inputMode="numeric" maxLength={4} value={exercicio} onChange={(e) => setExercicio(digitos(e.target.value))}
          erro={exercicio && !exercicioValido(exercicio) ? 'Use o ano com 4 dígitos.' : null}
          ajuda="Vazio = vale para qualquer exercício. Dotação com empenhos de outro ano não muda de exercício: use “Nova a partir desta”." />
        <AreaTexto rotulo="Descrição / identificação" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={3}
          ajuda="Ex.: Manutenção predial das UBS. Aparece na escolha da dotação no contrato e no empenho." />
        <p className="text-xs text-slate-500">As classificações (ação, natureza, fonte…) não mudam: para outra combinação, cadastre uma nova dotação.</p>
        {erro && <CaixaErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- lista de dotações do ente

function DotacoesDoEnte({ ente, orgaosDoEnte }: { ente: Ente; orgaosDoEnte: Tenant[] }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [situacao, setSituacao] = useState<'ATIVOS' | 'INATIVOS' | 'TODOS'>('ATIVOS');
  const [exercicio, setExercicio] = useState<string>('');
  const [pagina, setPagina] = useState(0);
  const [form, setForm] = useState<{ inicial: Valores | null; exercicio: number | null } | null>(null);
  const [editando, setEditando] = useState<ClassificacaoOrcamentaria | null>(null);
  const [alternando, setAlternando] = useState<ClassificacaoOrcamentaria | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => setPagina(0), [termo, situacao, exercicio, ente.id]);
  const q = useQuery({
    queryKey: ['dotacoes-ente', ente.id, termo, situacao, exercicio, pagina],
    queryFn: () => listarDotacoesEnte({ enteId: ente.id, busca: termo, situacao, exercicio: exercicio === 'SEM' ? 'SEM' : exercicio ? Number(exercicio) : null, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    placeholderData: (a) => a,
  });
  const ids = useMemo(() => [...new Set((q.data?.itens ?? []).flatMap((d) => Object.values(ID_DO_CAMPO).map((k) => d[k] as string | null)
    .concat([d.categoria_economica_id, d.gnd_id, d.modalidade_id])).filter(Boolean))] as string[], [q.data]);
  const nomes = useQuery({ queryKey: ['classificadores-nomes', ids], queryFn: () => obterClassificadores(ids), enabled: ids.length > 0 });
  const uos = useMemo(() => [...new Set((q.data?.itens ?? []).map((d) => d.unidade_orcamentaria_id).filter(Boolean))] as string[], [q.data]);
  const mapa = useQuery({ queryKey: ['uo-orgaos', uos], queryFn: () => orgaosDasUos(uos), enabled: uos.length > 0 });
  const cl = (id: string | null) => (id ? nomes.data?.find((c) => c.id === id) : undefined);

  const copiar = (d: ClassificacaoOrcamentaria) => {
    const lista = nomes.data ?? [];
    const ini: Valores = {};
    for (const l of LINHAS) {
      const c = cl(d[ID_DO_CAMPO[l.campo]] as string | null);
      if (!c) continue;
      const codigo = l.campo === 'natureza' ? `${naturezaDe(lista, d)}00` : l.campo === 'subelemento' ? `${naturezaDe(lista, d)}${c.codigo.padStart(2, '0')}` : c.codigo;
      ini[l.campo] = { codigo, descricao: c.descricao, existente: true };
    }
    // a cópia sugere o exercício seguinte (LOA nova); dá para ajustar no formulário
    setForm({ inicial: ini, exercicio: d.exercicio ? d.exercicio + 1 : ANO_ATUAL });
  };

  return (
    <>
      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_9rem_9rem_auto] lg:items-center">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Código, fonte, ação, elemento, unidade ou descrição" rotulo="Buscar dotação" />
        <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={exercicio} onChange={(e) => setExercicio(e.target.value)} aria-label="Exercício">
          <option value="">Todos os exercícios</option>
          {[ANO_ATUAL + 1, ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2].map((a) => <option key={a} value={a}>Exercício {a}</option>)}
          <option value="SEM">Sem exercício</option>
        </select>
        <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
          <option value="ATIVOS">Ativas</option><option value="INATIVOS">Inativas</option><option value="TODOS">Todas</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" icone={<Download className="size-4" />} onClick={() => void baixarModelo()}>Modelo</Botao>
          <input ref={entrada} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <Botao variante="secundario" icone={<Upload className="size-4" />} onClick={() => entrada.current?.click()}>Importar planilha</Botao>
          <Botao icone={<Plus className="size-4" />} onClick={() => setForm({ inicial: null, exercicio: ANO_ATUAL })}>Nova dotação</Botao>
        </div>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> :
        !q.data!.itens.length ? <Vazio titulo="Nenhuma dotação neste ente" descricao="Cadastre pela nota de empenho (Nova dotação) ou importe a planilha da LOA." /> : (
          <ul className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-70')}>
            {q.data!.itens.map((d) => {
              const usam = (mapa.data ?? []).filter((m) => m.classificador_id === d.unidade_orcamentaria_id)
                .map((m) => orgaosDoEnte.find((o) => o.id === m.tenant_id)?.nome_curto).filter(Boolean);
              return (
                <li key={d.id} className={cx('flex items-start gap-3 py-3', !d.ativo && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <p className="numero flex flex-wrap items-center gap-2 break-words font-mono text-sm font-semibold text-slate-900">{d.codigo_completo}
                      {d.exercicio ? <Selo tom="info">Exercício {d.exercicio}</Selo> : <Selo>Sem exercício</Selo>}{!d.ativo && <Selo tom="perigo">Inativa</Selo>}</p>
                    {d.descricao && <p className="text-sm font-medium text-slate-800">{d.descricao}</p>}
                    <p className="text-sm text-slate-700">
                      {cl(d.unidade_orcamentaria_id) && <>{cl(d.unidade_orcamentaria_id)!.descricao} · </>}
                      {cl(d.acao_id)?.descricao ?? '…'}{cl(d.acao_id)?.natureza_acao && ` (${NATUREZAS[cl(d.acao_id)!.natureza_acao!]})`}
                      {cl(d.unidade_gestora_id) && <> · UG {cl(d.unidade_gestora_id)!.codigo} – {cl(d.unidade_gestora_id)!.descricao}</>}
                    </p>
                    <p className="text-xs text-slate-600">
                      {cl(d.subelemento_id)?.descricao ?? cl(d.elemento_id)?.descricao ?? '…'} · Fonte: {cl(d.fonte_id)?.descricao ?? '…'}
                      {cl(d.codigo_acompanhamento_id) && ` · CO ${cl(d.codigo_acompanhamento_id)!.codigo}`}
                      {cl(d.resultado_primario_id) && ` · RP ${cl(d.resultado_primario_id)!.codigo}`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">Usada por: {d.unidade_orcamentaria_id && usam.length ? usam.join(', ') : 'todos os órgãos do ente'}</p>
                  </div>
                  <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar identificação e exercício" title="Editar identificação e exercício" onClick={() => setEditando(d)} />
                  <Botao pequeno variante="fantasma" icone={<Copy className="size-4" />} aria-label="Nova dotação a partir desta" title="Nova a partir desta (copiar e ajustar)" onClick={() => copiar(d)} />
                  <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={d.ativo ? 'Inativar dotação' : 'Reativar dotação'} onClick={() => setAlternando(d)} />
                </li>
              );
            })}
          </ul>
        )}
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      <FormDotacao ente={ente} orgaosDoEnte={orgaosDoEnte} aberto={!!form} inicial={form?.inicial ?? null} exercicioInicial={form?.exercicio ?? null} aoFechar={() => setForm(null)} />
      <EditarDotacao dotacao={editando} aoFechar={() => setEditando(null)} />
      <Importacao ente={ente} orgaosDoEnte={orgaosDoEnte} arquivo={arquivo} aoFechar={() => setArquivo(null)} />
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? 'Inativar dotação?' : 'Reativar dotação?'}
        descricao="Dotação inativa não aparece para novos contratos e empenhos dos órgãos. Os registros que já a usam continuam com ela."
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusClassificacao(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['dotacoes-ente'] }); toast.success('Situação atualizada.'); }} />
    </>
  );
}

// ---------------------------------------------------------------- classificadores (códigos) do ente

function FormClassificador({ ente, tipo, tipos, item, orgaosDoEnte, aoFechar }: {
  ente: Ente; tipo: ClassificadorTipo; tipos: ClassificadorTipo[]; item: Classificador | null | 'novo'; orgaosDoEnte: Tenant[]; aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [pai, setPai] = useState<{ id: string; rotulo: string } | null>(null);
  const [natureza, setNatureza] = useState('');
  const [orgaos, setOrgaos] = useState<string[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const aberto = item !== null;
  const atual = item === 'novo' ? null : item;
  const tipoPai = tipos.find((t) => t.codigo === tipo.pai_tipo);
  const ehUo = tipo.codigo === 'UNIDADE_ORCAMENTARIA';
  // subelemento: digita os 8 dígitos (33903914); o elemento (39) e o código (14) saem deles
  const ehSub = tipo.codigo === 'SUBELEMENTO';
  const paiAtual = useQuery({ queryKey: ['classificador', atual?.pai_id], queryFn: () => obterClassificadores([atual!.pai_id!]), enabled: !!atual?.pai_id });
  const mapa = useQuery({ queryKey: ['uo-orgaos', [atual?.id]], queryFn: () => orgaosDasUos([atual!.id]), enabled: ehUo && !!atual });
  useEffect(() => {
    if (!aberto) return;
    setErros({}); setCodigo(atual?.codigo ?? ''); setDescricao(atual?.descricao ?? ''); setNatureza(atual?.natureza_acao ?? ''); setPai(null); setOrgaos([]);
  }, [aberto, atual]);
  useEffect(() => { const p = paiAtual.data?.[0]; if (p) setPai({ id: p.id, rotulo: `${p.codigo} – ${p.descricao}` }); }, [paiAtual.data]);
  useEffect(() => { if (mapa.data) setOrgaos(mapa.data.map((m) => m.tenant_id)); }, [mapa.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      let cod = codigo.trim(); let paiId = pai?.id ?? null;
      if (ehSub && !atual) {
        const d = digitos(cod);
        if (d.length !== 8) throw { erro: 'Informe o subelemento com 8 dígitos (ex.: 33903914).', campo: 'codigo' };
        const el = (await listarClassificadores({ enteId: ente.id, tipo: 'ELEMENTO', busca: d.slice(4, 6), limite: 30 })).itens.find((c) => c.codigo === d.slice(4, 6) && !c.pai_id);
        if (!el) throw { erro: `Cadastre antes a natureza ${d.slice(0, 6)}00 (elemento ${d.slice(4, 6)}).`, campo: 'codigo' };
        cod = d.slice(6); paiId = el.id;
      }
      const c = await salvarClassificador(atual?.id ?? null, {
        ente_id: ente.id, tipo: tipo.codigo, codigo: cod, descricao: descricao.trim(), pai_id: paiId,
        natureza_acao: tipo.codigo === 'ACAO' && natureza ? natureza as Classificador['natureza_acao'] : null,
      });
      if (ehUo) await definirOrgaosDaUo(c.id, (mapa.data ?? []).map((m) => m.tenant_id), orgaos);
      return c;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['classificadores-ente'] }); await qc.invalidateQueries({ queryKey: ['uo-orgaos'] }); toast.success(`${tipo.nome} salvo.`); aoFechar(); },
    onError: (e) => {
      if (/classificadores_codigo_unico/.test((e as Error).message ?? '')) setErros({ codigo: `Já existe ${tipo.nome.toLowerCase()} com este código${tipoPai ? ` em ${tipoPai.nome.toLowerCase()}` : ''}.` });
      else { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); }
    },
  });
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={`${atual ? 'Editar' : 'Novo'}: ${tipo.nome}`}
      descricao={atual ? 'Alterar a descrição atualiza todas as dotações que usam este código.' : undefined}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao carregando={salvar.isPending} disabled={!codigo.trim() || descricao.trim().length < 2 || (tipo.pai_obrigatorio && !pai && !ehSub)} onClick={() => salvar.mutate()}>Salvar</Botao></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo={ehSub && !atual ? 'Código (8 dígitos)' : 'Código'} obrigatorio value={codigo} onChange={(e) => setCodigo(e.target.value)} erro={erros.codigo} maxLength={30} disabled={!!atual}
          placeholder={ehSub ? '33903914' : undefined} ajuda={ehSub && !atual ? 'Natureza + subelemento, como na nota de empenho.' : undefined} />
        <Campo className="sm:col-span-2" rotulo="Descrição" obrigatorio value={descricao} onChange={(e) => setDescricao(e.target.value)} erro={erros.descricao} maxLength={300} />
        {tipoPai && !atual && !ehSub && (
          <div className="sm:col-span-3">
            <BuscaSelect rotulo={tipoPai.nome} obrigatorio={tipo.pai_obrigatorio} valor={pai?.id ?? null} rotuloValor={pai?.rotulo} erro={erros.pai_id}
              aoMudar={(v, o) => setPai(v && o ? { id: v, rotulo: o.rotulo } : null)} chave={['classificadores-opcoes', ente.id, tipoPai.codigo]}
              ajuda={tipo.pai_obrigatorio ? undefined : 'Opcional.'}
              buscar={async (t) => (await listarClassificadores({ enteId: ente.id, tipo: tipoPai.codigo, busca: t, somenteAtivos: true, limite: 30 })).itens
                .map((c) => ({ valor: c.id, rotulo: `${c.codigo} – ${c.descricao}` }))} />
          </div>
        )}
        {tipo.codigo === 'ACAO' && (
          <Selecao className="sm:col-span-3" rotulo="Natureza" value={natureza} onChange={(e) => setNatureza(e.target.value)}
            ajuda="Em branco: pelo 1º dígito do código (1 = projeto, 2 = atividade, 0 = operação especial).">
            <option value="">Automática</option>{Object.entries(NATUREZAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
        )}
        {ehUo && (
          <fieldset className="rounded-xl border border-slate-200 p-3 sm:col-span-3">
            <legend className="px-1 text-sm font-medium text-slate-800">Órgãos que usam esta unidade orçamentária</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {orgaosDoEnte.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-marca-700" checked={orgaos.includes(o.id)}
                    onChange={(e) => setOrgaos((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))} />{o.nome_curto}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Nenhum marcado: as dotações desta UO ficam disponíveis para todos os órgãos do ente.</p>
          </fieldset>
        )}
        {erros.geral && <div className="sm:col-span-3"><CaixaErro mensagem={erros.geral} /></div>}
      </div>
    </Modal>
  );
}

// Tipos na ordem do quadro CLASSIFICAÇÃO da nota de empenho; categoria, grupo, modalidade e elemento
// vêm da natureza (8 dígitos) e não aparecem soltos
const OCULTOS: TipoClassificador[] = ['CATEGORIA_ECONOMICA', 'GND', 'MODALIDADE', 'ELEMENTO'];
function menuTipos(tipos: ClassificadorTipo[]): Array<{ codigo: TipoClassificador | 'NATUREZA'; nome: string }> {
  const lista: Array<{ codigo: TipoClassificador | 'NATUREZA'; nome: string }> = [];
  for (const t of tipos) {
    if (OCULTOS.includes(t.codigo)) continue;
    if (t.codigo === 'SUBELEMENTO') lista.push({ codigo: 'NATUREZA', nome: 'Natureza da Despesa' });
    lista.push({ codigo: t.codigo, nome: t.codigo === 'SUBELEMENTO' ? 'SubElemento' : t.nome });
  }
  return lista;
}

function ClassificadoresDoEnte({ ente, orgaosDoEnte }: { ente: Ente; orgaosDoEnte: Tenant[] }) {
  const qc = useQueryClient();
  const tipos = useTipos();
  const [tipo, setTipo] = useState<TipoClassificador | 'NATUREZA'>('UNIDADE_ORCAMENTARIA');
  const [busca, setBusca] = useState('');
  const termo = useBuscaAtrasada(busca);
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Classificador | null | 'novo'>(null);
  const [alternando, setAlternando] = useState<Classificador | null>(null);
  useEffect(() => setPagina(0), [tipo, termo, ente.id]);
  const q = useQuery({
    queryKey: ['classificadores-ente', ente.id, tipo, termo, pagina], enabled: tipo !== 'NATUREZA',
    queryFn: () => listarClassificadores({ enteId: ente.id, tipo: tipo as TipoClassificador, busca: termo, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    placeholderData: (a) => a,
  });
  const paiIds = [...new Set((q.data?.itens ?? []).map((c) => c.pai_id).filter(Boolean))] as string[];
  const pais = useQuery({ queryKey: ['classificadores-pais', paiIds], queryFn: () => obterClassificadores(paiIds), enabled: paiIds.length > 0 });
  const tipoAtual = tipo === 'NATUREZA' ? undefined : tipos.data?.find((t) => t.codigo === tipo);
  if (!tipos.data) return <Carregando />;
  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Tipos de classificador">
        {menuTipos(tipos.data).map((t) => (
          <button key={t.codigo} onClick={() => setTipo(t.codigo)} aria-current={t.codigo === tipo}
            className={cx('whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm', t.codigo === tipo ? 'bg-marca-50 font-medium text-marca-800' : 'text-slate-600 hover:bg-slate-50')}>{t.nome}</button>
        ))}
      </nav>
      {tipo === 'NATUREZA' ? <div className="min-w-0"><NaturezasDespesa ente={ente} /></div> : <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-60 flex-1"><CampoBusca valor={busca} aoMudar={setBusca} placeholder="Código ou descrição" rotulo="Buscar classificador" /></div>
          <Botao icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Novo</Botao>
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> :
          !q.data!.itens.length ? <Vazio titulo={`Nenhum registro em ${tipoAtual?.nome}`} descricao="Cadastre os códigos usados pelo município. Os órgãos escolhem entre eles para formar as dotações dos contratos e empenhos." /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Código</th><th className="py-2 pr-3 font-medium">Descrição</th>
                {tipoAtual?.pai_tipo && <th className="hidden py-2 pr-3 font-medium sm:table-cell">{tipos.data.find((t) => t.codigo === tipoAtual.pai_tipo)?.nome}</th>}
                <th className="py-2" />
              </tr></thead>
              <tbody>
                {q.data!.itens.map((c) => (
                  <tr key={c.id} className={cx('border-b border-slate-100', !c.ativo && 'opacity-60')}>
                    <td className="numero py-2 pr-3 font-medium text-slate-900">{tipo === 'SUBELEMENTO' ? `${pais.data?.find((x) => x.id === c.pai_id)?.codigo ?? '..'}.${c.codigo}` : c.codigo}</td>
                    <td className="py-2 pr-3">{c.descricao} {c.natureza_acao && <Selo>{NATUREZAS[c.natureza_acao]}</Selo>} {!c.ativo && <Selo tom="perigo">Inativo</Selo>}</td>
                    {tipoAtual?.pai_tipo && <td className="hidden py-2 pr-3 text-slate-600 sm:table-cell">{pais.data?.find((x) => x.id === c.pai_id)?.codigo ?? '—'}</td>}
                    <td className="whitespace-nowrap py-2 text-right">
                      <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${c.codigo}`} onClick={() => setEditando(c)} />
                      <Botao pequeno variante="fantasma" icone={<Power className="size-4" />} aria-label={c.ativo ? `Inativar ${c.codigo}` : `Reativar ${c.codigo}`} onClick={() => setAlternando(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </div>}
      {tipoAtual && <FormClassificador ente={ente} tipo={tipoAtual} tipos={tipos.data} item={editando} orgaosDoEnte={orgaosDoEnte} aoFechar={() => setEditando(null)} />}
      <ConfirmarComMotivo aberto={!!alternando} aoFechar={() => setAlternando(null)} perigo={!!alternando?.ativo}
        titulo={alternando?.ativo ? `Inativar ${alternando.codigo}?` : `Reativar ${alternando?.codigo}?`}
        descricao="Inativo não aparece para novas dotações; as dotações e o histórico que já o usam continuam válidos."
        rotuloConfirmar={alternando?.ativo ? 'Inativar' : 'Reativar'} minimo={alternando?.ativo ? 5 : 0}
        aoConfirmar={async (m) => { await definirStatusClassificador(alternando!.id, !alternando!.ativo, m); await qc.invalidateQueries({ queryKey: ['classificadores-ente'] }); toast.success('Situação atualizada.'); }} />
    </div>
  );
}

// ---------------------------------------------------------------- órgãos do ente

function OrgaosDoEnte({ ente, entes, orgaos }: { ente: Ente; entes: Ente[]; orgaos: Tenant[] }) {
  const qc = useQueryClient();
  // marcação aparece na hora; volta atrás se o banco recusar
  const [local, setLocal] = useState<Record<string, string | null>>({});
  const enteDe = (o: Tenant) => (o.id in local ? local[o.id] : o.ente_id ?? null);
  const mudar = useMutation({
    mutationFn: ({ id, entra }: { id: string; entra: boolean }) => vincularOrgaoAoEnte(id, entra ? ente.id : null),
    onMutate: ({ id, entra }) => setLocal((x) => ({ ...x, [id]: entra ? ente.id : null })),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['orgaos'] }); toast.success('Órgãos do ente atualizados.'); },
    onError: (e, { id }) => { setLocal((x) => { const n = { ...x }; delete n[id]; return n; }); toast.error(mensagemDeErro(e)); },
  });
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">Os órgãos marcados usam o catálogo orçamentário de <b>{ente.nome}</b> nos contratos, empenhos e relatórios. Cada órgão pertence a um só ente.</p>
      <ul className="divide-y divide-slate-100">
        {orgaos.map((o) => {
          const atual = enteDe(o);
          const outro = atual && atual !== ente.id ? entes.find((e) => e.id === atual) : null;
          return (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <label className="flex min-w-0 items-center gap-3 text-sm">
                <input type="checkbox" className="size-4 accent-marca-700" checked={atual === ente.id} disabled={mudar.isPending}
                  onChange={(e) => mudar.mutate({ id: o.id, entra: e.target.checked })} aria-label={`${o.nome_curto} pertence a ${ente.nome}`} />
                <span className="min-w-0"><span className="block font-medium text-slate-900">{o.nome_curto}</span><span className="block truncate text-xs text-slate-500">{o.nome_oficial}</span></span>
              </label>
              {outro && <Selo>{outro.nome}</Selo>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- página

function FormEnte({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: (e: Ente) => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(''); const [uf, setUf] = useState(''); const [cnpj, setCnpj] = useState('');
  useEffect(() => { if (aberto) { setNome(''); setUf(''); setCnpj(''); } }, [aberto]);
  const salvar = useMutation({
    mutationFn: () => salvarEnte(null, { nome: nome.trim(), uf: uf.trim().toUpperCase() || null, cnpj: digitos(cnpj) || null }),
    onSuccess: async (e) => { await qc.invalidateQueries({ queryKey: ['entes'] }); toast.success('Ente cadastrado.'); aoCriar(e); aoFechar(); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Novo ente (município)" largura="sm"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao disabled={nome.trim().length < 3} carregando={salvar.isPending} onClick={() => salvar.mutate()}>Cadastrar</Botao></>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome" obrigatorio value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Município de Aracaju" maxLength={200} />
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Campo rotulo="UF" value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} placeholder="SE" />
          <Campo rotulo="CNPJ (opcional)" value={cnpj} onChange={(e) => setCnpj(e.target.value)} maxLength={18} />
        </div>
      </div>
    </Modal>
  );
}

export function Dotacoes() {
  const { ehPlataforma } = useSessao();
  const entes = useQuery({ queryKey: ['entes'], queryFn: listarEntes, enabled: ehPlataforma });
  const orgaos = useQuery({ queryKey: ['orgaos', ''], queryFn: () => listarOrgaos(''), enabled: ehPlataforma });
  const [enteId, setEnteId] = useState<string | null>(null);
  const [novoEnte, setNovoEnte] = useState(false);
  const [aba, setAba] = useState<'dotacoes' | 'classificadores' | 'orgaos'>('classificadores');
  useEffect(() => { if (!enteId && entes.data?.length) setEnteId(entes.data[0]!.id); }, [entes.data, enteId]);
  if (!ehPlataforma) return <SemPermissao />;
  const ente = entes.data?.find((e) => e.id === enteId) ?? null;
  const orgaosDoEnte = (orgaos.data ?? []).filter((o) => o.ente_id === enteId);

  return (
    <>
      <CabecalhoPagina titulo="Classificações orçamentárias"
        descricao="Módulo do desenvolvedor. Cadastre aqui cada classificação do município (UO, função, programa, ação, natureza, subelemento, fonte…). O administrador do órgão forma as dotações nos contratos e empenhos escolhendo entre elas."
        acoes={<Botao variante="secundario" icone={<Landmark className="size-4" />} onClick={() => setNovoEnte(true)}>Novo ente</Botao>} />
      {entes.isLoading || orgaos.isLoading ? <Carregando /> : !entes.data?.length ? (
        <Cartao><Vazio titulo="Nenhum ente cadastrado" descricao="Cadastre o município (ex.: Município de Aracaju) e vincule a ele a Prefeitura, a SMS e os demais órgãos."
          acao={<Botao icone={<Plus className="size-4" />} onClick={() => setNovoEnte(true)}>Novo ente</Botao>} /></Cartao>
      ) : (
        <>
          <Cartao className="mb-6">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,22rem)_1fr] sm:items-end">
              <Selecao rotulo="Ente (município)" value={enteId ?? ''} onChange={(e) => setEnteId(e.target.value)}>
                {entes.data.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.uf ? ` / ${e.uf}` : ''}</option>)}
              </Selecao>
              <p className="text-sm text-slate-600">Órgãos: {orgaosDoEnte.length ? orgaosDoEnte.map((o) => o.nome_curto).join(', ') : <span className="text-amber-700">nenhum vinculado — use a aba “Órgãos do ente”.</span>}</p>
            </div>
          </Cartao>
          {ente && (
            <Cartao>
              <Abas abas={[{ id: 'classificadores', rotulo: 'Classificações orçamentárias' }, { id: 'dotacoes', rotulo: 'Dotações formadas' }, { id: 'orgaos', rotulo: 'Órgãos do ente' }]} ativa={aba} aoMudar={setAba} />
              {aba === 'dotacoes' && <DotacoesDoEnte ente={ente} orgaosDoEnte={orgaosDoEnte} />}
              {aba === 'classificadores' && <ClassificadoresDoEnte ente={ente} orgaosDoEnte={orgaosDoEnte} />}
              {aba === 'orgaos' && <OrgaosDoEnte ente={ente} entes={entes.data} orgaos={orgaos.data ?? []} />}
            </Cartao>
          )}
        </>
      )}
      <FormEnte aberto={novoEnte} aoFechar={() => setNovoEnte(false)} aoCriar={(e) => setEnteId(e.id)} />
    </>
  );
}
