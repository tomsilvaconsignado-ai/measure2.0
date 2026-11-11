// Salvar vários arquivos numa pasta escolhida pela pessoa (File System Access API, Chrome e Edge no computador).
// Sem essa API (Firefox, Safari, celular), os arquivos vão pelo download comum do navegador, com os mesmos nomes.
// Nada é sobrescrito sem confirmação: quem chama recebe a lista dos que já existem e decide.

/* Tipos mínimos da API (nem todo navegador tem; o TypeScript não traz showDirectoryPicker) */
interface ArquivoGravavel { write(dados: Blob): Promise<void>; close(): Promise<void> }
export interface PastaHandle {
  name: string;
  getFileHandle(nome: string, opcoes?: { create?: boolean }): Promise<{ createWritable(): Promise<ArquivoGravavel> }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
type JanelaComPasta = Window & { showDirectoryPicker?: (o?: { mode?: 'readwrite'; id?: string }) => Promise<PastaHandle> };

export type Destino = { tipo: 'pasta'; pasta: PastaHandle } | { tipo: 'download' };
export interface ArquivoParaSalvar { nome: string; conteudo: Blob }

/** O navegador permite escolher a pasta e gravar nela? */
export function suportaPasta(janela: Window = window) {
  return typeof (janela as JanelaComPasta).showDirectoryPicker === 'function' && janela.isSecureContext;
}

/** Nome de arquivo sem caracteres que o Windows/macOS recusam */
export function nomeSeguro(texto: string) {
  return texto.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '').replace(/^\.+/, '') || 'sem-numero';
}

export const nomesExtratos = (numeroNota: string) => [1, 2, 3].map((i) => `extrato_0${i}${nomeSeguro(numeroNota)}.pdf`);
export const nomeChecklist = (numeroNota: string) => `checklist${nomeSeguro(numeroNota)}.pdf`;

/**
 * Pede a pasta (precisa ser chamado direto no clique). null = a pessoa cancelou.
 * Sem suporte do navegador, devolve o download comum.
 */
export async function escolherDestino(janela: Window = window): Promise<Destino | null> {
  if (!suportaPasta(janela)) return { tipo: 'download' };
  try {
    const pasta = await (janela as JanelaComPasta).showDirectoryPicker!({ mode: 'readwrite', id: 'measure-documentos' });
    return { tipo: 'pasta', pasta };
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
}

/** Quais destes nomes já existem na pasta (no download comum não dá para saber) */
export async function jaExistentes(destino: Destino, nomes: string[]) {
  if (destino.tipo !== 'pasta') return [];
  const existem: string[] = [];
  for (const n of nomes) {
    try { await destino.pasta.getFileHandle(n); existem.push(n); }
    catch (e) { if ((e as DOMException)?.name !== 'NotFoundError') throw e; }
  }
  return existem;
}

async function garantirPermissao(pasta: PastaHandle) {
  if (!pasta.queryPermission) return;
  if ((await pasta.queryPermission({ mode: 'readwrite' })) === 'granted') return;
  if ((await pasta.requestPermission?.({ mode: 'readwrite' })) !== 'granted') {
    throw { erro: 'O navegador não liberou a gravação na pasta escolhida.' };
  }
}

function baixar(arquivo: ArquivoParaSalvar) {
  const url = URL.createObjectURL(arquivo.conteudo);
  const a = document.createElement('a');
  a.href = url; a.download = arquivo.nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Grava todos os arquivos no destino (cada um com o seu nome, sem perguntar arquivo por arquivo) */
export async function gravar(destino: Destino, arquivos: ArquivoParaSalvar[]) {
  if (destino.tipo === 'download') {
    for (const a of arquivos) { baixar(a); await new Promise((ok) => setTimeout(ok, 400)); }
    return;
  }
  await garantirPermissao(destino.pasta);
  for (const a of arquivos) {
    const arquivo = await destino.pasta.getFileHandle(a.nome, { create: true });
    const escrita = await arquivo.createWritable();
    await escrita.write(a.conteudo);
    await escrita.close();
  }
}

/**
 * Fluxo completo: pasta já escolhida → gera os arquivos → confere os que existem → confirma a substituição → grava.
 * Devolve 'salvo', 'cancelado' (não substituir) ou lança o erro.
 */
export async function salvarArquivos(destino: Destino, nomes: string[], gerar: () => Promise<Blob[]>,
  confirmarSubstituir: (existentes: string[]) => Promise<boolean>): Promise<'salvo' | 'cancelado'> {
  const conteudos = await gerar();
  if (conteudos.length !== nomes.length || conteudos.some((c) => !c || c.size === 0)) {
    throw { erro: 'Os documentos não foram gerados corretamente. Nada foi salvo.' };
  }
  const existentes = await jaExistentes(destino, nomes);
  if (existentes.length && !(await confirmarSubstituir(existentes))) return 'cancelado';
  await gravar(destino, nomes.map((nome, i) => ({ nome, conteudo: conteudos[i]! })));
  return 'salvo';
}

export const ERRO_SALVAR = 'Não foi possível salvar os arquivos. Verifique as permissões da pasta e tente novamente.';
