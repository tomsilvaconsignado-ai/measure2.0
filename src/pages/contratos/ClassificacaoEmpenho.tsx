// Quadro "CLASSIFICAÇÃO" do empenho, igual à nota de empenho: cada campo é escolhido um a um entre os códigos
// já cadastrados no módulo Desenvolvedor. Ao salvar, o banco acha a dotação com essa combinação (ou a monta).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSessao } from '@/auth/Sessao';
import { BuscaSelect } from '@/components/ui/BuscaSelect';
import { Selecao } from '@/components/ui/basicos';
import type { DotacaoDoContrato, TipoClassificador } from '@/lib/tipos';
import { buscarClassificadoresOrgao, classificacaoDaDotacao, naturezasDoOrgao, type NaturezaDoCatalogo } from '@/services/cadastros';

export type CampoClassificacao = 'unidade_orcamentaria_id' | 'funcao_id' | 'subfuncao_id' | 'programa_id' | 'acao_id' | 'subelemento_id' | 'fonte_id'
  | 'codigo_acompanhamento_id' | 'id_uso_id' | 'idoc_id' | 'resultado_primario_id' | 'subfonte_id';
export type Natureza = NaturezaDoCatalogo;
const chaveNatureza = (n: Natureza) => `${n.categoria_id}.${n.gnd_id}.${n.modalidade_id}.${n.elemento_id}`;
export interface ValorClassificacao {
  campos: Partial<Record<CampoClassificacao, { id: string; rotulo: string }>>;
  natureza: Natureza | null;
}
export const classificacaoVazia: ValorClassificacao = { campos: {}, natureza: null };

// ordem e nomes do quadro CLASSIFICAÇÃO da nota de empenho
const LINHAS: Array<{ campo: CampoClassificacao | 'natureza'; rotulo: string; tipo?: TipoClassificador; obrigatorio?: boolean }> = [
  { campo: 'unidade_orcamentaria_id', rotulo: 'Unidade Orçamentária', tipo: 'UNIDADE_ORCAMENTARIA' },
  { campo: 'funcao_id', rotulo: 'Função', tipo: 'FUNCAO' },
  { campo: 'subfuncao_id', rotulo: 'SubFunção', tipo: 'SUBFUNCAO' },
  { campo: 'programa_id', rotulo: 'Programa', tipo: 'PROGRAMA' },
  { campo: 'acao_id', rotulo: 'Ação', tipo: 'ACAO', obrigatorio: true },
  { campo: 'natureza', rotulo: 'Natureza Despesa', obrigatorio: true },
  { campo: 'subelemento_id', rotulo: 'SubElemento', tipo: 'SUBELEMENTO' },
  { campo: 'fonte_id', rotulo: 'Fonte', tipo: 'FONTE', obrigatorio: true },
  { campo: 'codigo_acompanhamento_id', rotulo: 'Cód. Acompanhamento - CO', tipo: 'CODIGO_ACOMPANHAMENTO' },
  { campo: 'id_uso_id', rotulo: 'IdUso', tipo: 'ID_USO' },
  { campo: 'idoc_id', rotulo: 'IDoc', tipo: 'IDOC' },
  { campo: 'resultado_primario_id', rotulo: 'Ind. Result. Prim.', tipo: 'RESULTADO_PRIMARIO' },
  { campo: 'subfonte_id', rotulo: 'SubFonte', tipo: 'SUBFONTE' },
];

/** Códigos escolhidos no formato esperado pela função dotacao_do_empenho */
export function idsDaClassificacao(v: ValorClassificacao) {
  const ids: Record<string, string | null> = {};
  for (const l of LINHAS) if (l.campo !== 'natureza') ids[l.campo] = v.campos[l.campo]?.id ?? null;
  ids.categoria_economica_id = v.natureza?.categoria_id ?? null; ids.gnd_id = v.natureza?.gnd_id ?? null;
  ids.modalidade_id = v.natureza?.modalidade_id ?? null; ids.elemento_id = v.natureza?.elemento_id ?? null;
  return ids;
}

export function faltandoNaClassificacao(v: ValorClassificacao) {
  return [!v.campos.acao_id && 'ação', !v.natureza && 'natureza da despesa', !v.campos.fonte_id && 'fonte'].filter(Boolean) as string[];
}

export function ClassificacaoEmpenho({ valor, aoMudar, dotacaoInicial, dotacoesContrato, erro, desabilitado }: {
  valor: ValorClassificacao; aoMudar: (v: ValorClassificacao) => void;
  /** dotação já gravada (edição do empenho): preenche os campos */
  dotacaoInicial?: string | null;
  dotacoesContrato?: DotacaoDoContrato[]; erro?: string | null; desabilitado?: boolean;
}) {
  const { orgao } = useSessao();
  const [modelo, setModelo] = useState<string | null>(dotacaoInicial ?? null);
  useEffect(() => setModelo(dotacaoInicial ?? null), [dotacaoInicial]);
  const naturezas = useRef(new Map<string, Natureza>());
  const carregada = useQuery({
    queryKey: ['classificacao-dotacao', modelo], enabled: !!modelo,
    queryFn: async (): Promise<ValorClassificacao> => {
      const { dotacao: d, classificadores } = await classificacaoDaDotacao(modelo!);
      const cl = (id: string | null) => classificadores.find((x) => x.id === id);
      const cod = (id: string | null) => cl(id)?.codigo ?? '';
      const nat6 = `${cod(d.categoria_economica_id)}${cod(d.gnd_id)}${cod(d.modalidade_id).padStart(2, '0')}${cod(d.elemento_id).padStart(2, '0')}`;
      const campos: ValorClassificacao['campos'] = {};
      for (const l of LINHAS) {
        if (l.campo === 'natureza') continue;
        const c = cl(d[l.campo as keyof typeof d] as string | null);
        if (c) campos[l.campo] = { id: c.id, rotulo: `${l.campo === 'subelemento_id' ? nat6 + c.codigo.padStart(2, '0') : c.codigo} ${c.descricao}` };
      }
      const natureza = d.categoria_economica_id && d.gnd_id && d.modalidade_id ? { categoria_id: d.categoria_economica_id, gnd_id: d.gnd_id, modalidade_id: d.modalidade_id,
        elemento_id: d.elemento_id, codigo: `${nat6}00`, descricao: cl(d.elemento_id)?.descricao ?? '' } : null;
      return { campos, natureza };
    },
  });
  useEffect(() => { if (carregada.data) aoMudar(carregada.data); }, [carregada.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const muda = (campo: CampoClassificacao, item: { id: string; rotulo: string } | null) => {
    const campos = { ...valor.campos, [campo]: item ?? undefined };
    if (!item) delete campos[campo];
    aoMudar({ ...valor, campos });
  };
  const nat6 = valor.natureza?.codigo.slice(0, 6) ?? '';

  return (
    <fieldset className="rounded-xl border border-slate-300 p-3" disabled={desabilitado}>
      <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-800">Classificação</legend>
      {!!dotacoesContrato?.length && (
        <Selecao className="mb-3" rotulo="Preencher com uma dotação do contrato (opcional)" value={modelo ?? ''} onChange={(e) => setModelo(e.target.value || null)}
          ajuda="Preenche todos os campos de uma vez; depois dá para trocar campo por campo.">
          <option value="">Escolher campo a campo</option>
          {dotacoesContrato.map((d) => <option key={d.id} value={d.id}>{d.exercicio ? `[${d.exercicio}] ` : ''}{d.codigo_completo} · {d.acao_descricao}</option>)}
        </Selecao>
      )}
      <div className="flex flex-col gap-2">
        {LINHAS.map((l) => l.campo === 'natureza' ? (
          <BuscaSelect key={l.campo} rotulo={l.rotulo} obrigatorio valor={valor.natureza ? chaveNatureza(valor.natureza) : null}
            rotuloValor={valor.natureza ? `${valor.natureza.codigo} ${valor.natureza.descricao}` : null} chave={['naturezas', orgao?.id]}
            placeholder="Ex.: 33903900 ou Outros Serviços de Terceiros"
            aoMudar={(v) => {
              const n = v ? naturezas.current.get(v) ?? null : null;
              // trocar a natureza limpa o subelemento (ele pertence ao elemento)
              const campos = { ...valor.campos }; delete campos.subelemento_id;
              aoMudar({ campos, natureza: n });
            }}
            buscar={async (t) => (await naturezasDoOrgao(orgao!.id, t)).map((n) => { naturezas.current.set(chaveNatureza(n), n); return { valor: chaveNatureza(n), rotulo: `${n.codigo} ${n.descricao}` }; })} />
        ) : (
          <BuscaSelect key={l.campo} rotulo={l.rotulo} obrigatorio={l.obrigatorio} valor={valor.campos[l.campo]?.id ?? null} rotuloValor={valor.campos[l.campo]?.rotulo ?? null}
            chave={['classificadores-opcoes', orgao?.id, l.tipo, l.campo === 'subelemento_id' ? valor.natureza?.elemento_id : null]}
            desabilitado={l.campo === 'subelemento_id' && !valor.natureza}
            placeholder={l.campo === 'subelemento_id' && !valor.natureza ? 'Escolha antes a natureza da despesa' : 'Código ou descrição'}
            aoMudar={(v, o) => muda(l.campo as CampoClassificacao, v && o ? { id: v, rotulo: o.rotulo } : null)}
            buscar={async (t) => (await buscarClassificadoresOrgao(orgao!.id, l.tipo!, t, l.campo === 'subelemento_id' ? valor.natureza?.elemento_id : null))
              .map((c) => ({ valor: c.id, rotulo: `${l.campo === 'subelemento_id' ? `${nat6}${c.codigo.padStart(2, '0')}` : c.codigo} ${c.descricao}` }))} />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Os códigos vêm do catálogo cadastrado no módulo Desenvolvedor. Faltou algum código? Peça à equipe da plataforma.</p>
      {erro && <p className="mt-1 text-xs text-red-700" role="alert">{erro}</p>}
    </fieldset>
  );
}
