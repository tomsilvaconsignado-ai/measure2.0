// API de Dados Abertos do Compras.gov.br (manual do usuário, versão 2.0, fev/2026) explicada para gestores e fiscais:
// para que serve no dia a dia, consultas prontas (o sistema monta o endereço e abre em nova aba) e cuidados de uso.
// A consulta é feita direto no site do governo: nada é enviado ao MEASURE e nenhum dado do órgão sai daqui.
import { AlertTriangle, BadgeDollarSign, BookMarked, Building2, Database, ExternalLink, FileSearch, FileText, Info, Lightbulb, ScrollText, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Botao, Campo, Selecao, cx } from '@/components/ui/basicos';

const BASE = 'https://dadosabertos.compras.gov.br';
export const SWAGGER_COMPRAS = `${BASE}/swagger-ui/index.html`;
export const CATALOGO_COMPRAS = 'https://catalogo.compras.gov.br/cnbs-web/busca';

/** Faixa de destaque: chama para a seção de dados abertos (usada no topo da capacitação e na ajuda). */
export function DestaqueDadosAbertos({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <section className="mb-5 flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border-l-4 border-chamada-500 bg-gradient-to-r from-marca-950 via-marca-900 to-marca-800 p-5 text-white shadow-lg">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/25"><Database className="size-6" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">Dados abertos do Compras.gov.br</h2>
        <p className="text-sm text-marca-100">Consulte preços que outros órgãos pagaram, contratos, atas de registro de preços e a situação de fornecedores. Serve para conferir se o valor cobrado está compatível com o mercado.</p>
      </div>
      <Botao variante="chamada" icone={<Search className="size-4" />} onClick={aoAbrir}>Consultar preços e contratos</Botao>
    </section>
  );
}

// ---------------------------------------------------------------- para que serve

const USOS: Array<{ icone: ReactNode; titulo: string; texto: string; quem: string }> = [
  { icone: <BadgeDollarSign className="size-5" aria-hidden />, titulo: 'Pesquisa de preço', quem: 'Gestor e fiscal',
    texto: 'Mostra quanto outros órgãos pagaram pelo mesmo material ou serviço, com data, quantidade, fornecedor e local. Ajuda a perceber preço fora da realidade antes de um aditivo, repactuação ou nova contratação.' },
  { icone: <FileText className="size-5" aria-hidden />, titulo: 'Contratos e itens', quem: 'Gestor',
    texto: 'Contratos publicados por órgão, com vigência, valor global e itens. Essa consulta pede o código do órgão no sistema federal: use a documentação da API (link no fim da página).' },
  { icone: <ScrollText className="size-5" aria-hidden />, titulo: 'Atas de registro de preços', quem: 'Gestor',
    texto: 'Atas vigentes, itens, saldo para empenho e adesões ("caronas"). Antes de abrir uma licitação, vale ver se já existe ata com o item.' },
  { icone: <Building2 className="size-5" aria-hidden />, titulo: 'Situação do fornecedor', quem: 'Gestor e fiscal',
    texto: 'Confirma se o CNPJ está ativo no cadastro do governo, com porte da empresa, natureza jurídica e município.' },
  { icone: <BookMarked className="size-5" aria-hidden />, titulo: 'Catálogo de materiais e serviços', quem: 'Todos',
    texto: 'Encontra o código CATMAT (material) ou CATSER (serviço) do item. Esse código é a chave para as outras consultas, principalmente a de preço.' },
  { icone: <FileSearch className="size-5" aria-hidden />, titulo: 'Plano de contratações (PCA)', quem: 'Chefias',
    texto: 'Mostra o que os órgãos planejaram comprar no ano, com quantidades e valores estimados.' },
];

// ---------------------------------------------------------------- monte a consulta

interface CampoConsulta { nome: string; rotulo: string; ajuda?: string; obrigatorio?: boolean; tipo?: 'texto' | 'data' | 'uf'; padrao?: string }
interface Consulta { id: string; titulo: string; caminho: string; link?: string; explicacao: string; campos: CampoConsulta[]; fixos?: Record<string, string> }

const hojeIso = () => new Date().toISOString().slice(0, 10);
const umAnoAtras = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };

const CONSULTAS: Consulta[] = [
  { id: 'catalogo', titulo: '1. Achar o código do item (catálogo)', caminho: '', link: CATALOGO_COMPRAS,
    explicacao: 'Toda consulta de preço usa o código do item no catálogo do governo: CATMAT para material e CATSER para serviço. Busque pelo nome (ex.: "extintor") no site do catálogo e anote o código.',
    campos: [] },
  { id: 'preco-material', titulo: '2. Preços praticados de um material', caminho: '/modulo-pesquisa-preco/1_consultarMaterial',
    explicacao: 'Mostra o preço unitário pago por outros órgãos para o código CATMAT, com quantidade, fornecedor, órgão e data da compra.',
    campos: [{ nome: 'codigo', rotulo: 'Código CATMAT do material', obrigatorio: true }, { nome: 'estado', rotulo: 'UF (opcional)', tipo: 'uf', ajuda: 'Deixe em branco para o Brasil todo' },
      { nome: 'dataCompraInicio', rotulo: 'Compras a partir de (opcional)', tipo: 'data' }], fixos: { tipo: 'codigoItemCatalogo' } },
  { id: 'preco-servico', titulo: '3. Preços praticados de um serviço', caminho: '/modulo-pesquisa-preco/3_consultarServico',
    explicacao: 'O mesmo da pesquisa de material, para serviços (código CATSER).',
    campos: [{ nome: 'codigoItemCatalogo', rotulo: 'Código CATSER do serviço', obrigatorio: true }, { nome: 'estado', rotulo: 'UF (opcional)', tipo: 'uf' },
      { nome: 'dataCompraInicio', rotulo: 'Compras a partir de (opcional)', tipo: 'data' }] },
  { id: 'arp', titulo: '4. Atas de registro de preços com o item', caminho: '/modulo-arp/2_consultarARPItem',
    explicacao: 'Itens de atas com vigência iniciada no período, com valor unitário, fornecedor, quantidade e saldo.',
    campos: [{ nome: 'codigoItem', rotulo: 'Código CATMAT/CATSER do item', obrigatorio: true },
      { nome: 'dataVigenciaInicialMin', rotulo: 'Vigência a partir de', tipo: 'data', obrigatorio: true, padrao: 'umAno' },
      { nome: 'dataVigenciaInicialMax', rotulo: 'Vigência até', tipo: 'data', obrigatorio: true, padrao: 'hoje' }] },
  { id: 'fornecedor', titulo: '5. Situação do fornecedor', caminho: '/modulo-fornecedor/1_consultarFornecedor',
    explicacao: 'Confirma se o CNPJ está ativo e habilitado a licitar, com atividade (CNAE), porte, natureza jurídica e município.',
    campos: [{ nome: 'cnpj', rotulo: 'CNPJ (só números)', obrigatorio: true }], fixos: { ativo: 'true' } },
  { id: 'item-material', titulo: '6. Conferir um material pelo código', caminho: '/modulo-material/4_consultarItemMaterial',
    explicacao: 'Mostra a descrição completa, o grupo, a classe e o NCM do código CATMAT, para confirmar que é o item certo.',
    campos: [{ nome: 'codigoItem', rotulo: 'Código CATMAT', obrigatorio: true }] },
];

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const valoresIniciais = (c: Consulta) => Object.fromEntries(c.campos.map((f) => [f.nome, f.padrao === 'hoje' ? hojeIso() : f.padrao === 'umAno' ? umAnoAtras() : '']));

function MonteConsulta() {
  const [id, setId] = useState(CONSULTAS[0]!.id);
  const consulta = CONSULTAS.find((c) => c.id === id)!;
  const [valores, setValores] = useState<Record<string, string>>(() => valoresIniciais(consulta));
  const trocar = (novo: string) => { setId(novo); setValores(valoresIniciais(CONSULTAS.find((c) => c.id === novo)!)); };
  const limpo = (nome: string, v: string) => (/cnpj|niFornecedor|codigo/i.test(nome) ? v.replace(/\D/g, '') : v.trim());
  const faltando = consulta.campos.filter((f) => f.obrigatorio && !limpo(f.nome, valores[f.nome] ?? ''));
  const params = new URLSearchParams({ pagina: '1', tamanhoPagina: '50', ...consulta.fixos });
  consulta.campos.forEach((f) => { const v = limpo(f.nome, valores[f.nome] ?? ''); if (v) params.set(f.nome, v); });
  // a consulta 1 só abre o catálogo do governo; as demais montam o endereço da API
  const url = consulta.link ?? `${BASE}${consulta.caminho}?${params.toString()}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Tipo de consulta">
        {CONSULTAS.map((c) => (
          <li key={c.id}>
            <button type="button" role="radio" aria-checked={c.id === id} onClick={() => trocar(c.id)}
              className={cx('w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors',
                c.id === id ? 'border-marca-900 bg-marca-900 text-white' : 'border-slate-200 text-marca-900 hover:border-marca-300 hover:bg-marca-50')}>
              {c.titulo}
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-4 text-sm text-slate-700">{consulta.explicacao}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {consulta.campos.map((f) => f.tipo === 'uf' ? (
            <Selecao key={f.nome} rotulo={f.rotulo} ajuda={f.ajuda} value={valores[f.nome] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [f.nome]: e.target.value }))}>
              <option value="">Brasil todo</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Selecao>
          ) : (
            <Campo key={f.nome} rotulo={f.rotulo} ajuda={f.ajuda} obrigatorio={f.obrigatorio} type={f.tipo === 'data' ? 'date' : 'text'}
              value={valores[f.nome] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [f.nome]: e.target.value }))} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={faltando.length ? undefined : url} target="_blank" rel="noopener noreferrer" aria-disabled={!!faltando.length}
            className={cx('inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold shadow-sm',
              faltando.length ? 'pointer-events-none bg-chamada-300 text-marca-950/50' : 'bg-chamada-500 text-marca-950 hover:bg-chamada-400')}>
            <ExternalLink className="size-4" aria-hidden />{consulta.link ? 'Abrir o catálogo do governo' : 'Abrir consulta no Compras.gov.br'}
          </a>
        </div>
        {faltando.length > 0 && <p className="mt-2 text-xs text-slate-600">Preencha: {faltando.map((f) => f.rotulo).join(', ')}.</p>}
        <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600" aria-label="Endereço da consulta">{url}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- página da seção

export function DadosAbertosCompras() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-marca-200 bg-marca-50 p-4 text-[15px] leading-relaxed text-marca-950">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-marca-700"><Lightbulb className="size-4" aria-hidden />Em palavras simples</p>
        O governo federal publica, de graça e sem cadastro, os dados das compras feitas pelo <b>Compras.gov.br</b>: preços pagos, contratos, atas, fornecedores e
        planos de contratação. Usam o sistema os órgãos federais e também estados e municípios que aderiram. Para o gestor e o fiscal, a utilidade principal é
        <b> comparar</b>: o preço que a empresa cobra está parecido com o que outros órgãos pagaram pelo mesmo item?
      </div>

      <section>
        <h3 className="mb-3 text-base font-bold text-marca-900">Para que serve no seu trabalho</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USOS.map((u) => (
            <li key={u.titulo} className="flex gap-3 rounded-xl border border-slate-200 border-l-4 border-l-acento-500 bg-white p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-marca-900 text-white">{u.icone}</span>
              <span>
                <b className="block text-marca-900">{u.titulo}</b>
                <span className="block text-sm text-slate-700">{u.texto}</span>
                <span className="mt-1 block text-xs font-semibold text-acento-700">{u.quem}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-base font-bold text-marca-900">Monte sua consulta</h3>
        <p className="mb-3 text-sm text-slate-600">Comece pelo catálogo para achar o código do item. Depois escolha a consulta e preencha os campos. O resultado abre numa nova aba, direto no site do governo, em formato de dados (JSON). No Chrome e no Edge, marque "Estilo de formatação" para ler melhor.</p>
        <MonteConsulta />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-marca-900"><Info className="size-4" aria-hidden />Como fazer uma pesquisa de preço</h3>
          <ol className="ml-5 list-decimal space-y-1.5 text-sm text-slate-800">
            <li>Ache o código do item no catálogo do governo (consulta 1). Se quiser, confirme a descrição com a consulta 6.</li>
            <li>Consulte os preços praticados com esse código (consulta 2 ou 3). Filtre pela UF para comparar com a região.</li>
            <li>Compare o <b>precoUnitario</b> considerando a <b>quantidade</b>, a <b>data</b> da compra e a <b>unidade de fornecimento</b>: caixa com 100 não é o mesmo que unidade.</li>
            <li>Despreze valores muito acima ou muito abaixo dos demais e registre de onde veio cada preço (o endereço da consulta e a data em que você consultou).</li>
            <li>Guarde o resultado no processo. Se o preço do contrato estiver muito diferente, comunique o gestor por escrito.</li>
          </ol>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h3 className="mb-2 flex items-center gap-2 text-base font-bold"><AlertTriangle className="size-4" aria-hidden />Cuidados</h3>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>A consulta é um apoio. A pesquisa de preço formal segue o art. 23 da Lei nº 14.133/2021 e as normas e modelos do município (INC 03 e 04/2026).</li>
            <li>Os dados são das compras feitas pelo Compras.gov.br. Contratações de Aracaju feitas por outro sistema podem não aparecer.</li>
            <li>Preços antigos precisam ser atualizados antes de comparar; preço de outra região pode ter frete diferente.</li>
            <li>Os dados são públicos, mas use só o necessário para o seu trabalho.</li>
          </ul>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <span className="min-w-0 flex-1">Para consultas avançadas (todos os módulos e parâmetros), use a documentação técnica oficial. Fonte: Manual do Usuário da API de Dados Abertos do Compras.gov.br, versão 2.0, fev/2026 (MGI/Seges).</span>
        <a href={SWAGGER_COMPRAS} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-marca-800 px-4 text-sm font-medium text-white hover:bg-marca-900">
          <ExternalLink className="size-4" aria-hidden />Documentação da API
        </a>
      </div>
    </div>
  );
}
