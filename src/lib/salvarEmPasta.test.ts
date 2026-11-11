import { describe, expect, it } from 'vitest';
import { calcularCortes } from './pdfDaImpressao';
import { escolherDestino, jaExistentes, nomeChecklist, nomeSeguro, nomesExtratos, salvarArquivos, suportaPasta, type Destino, type PastaHandle } from './salvarEmPasta';

/** Pasta de mentira: guarda o que foi gravado e começa com os arquivos informados */
function pastaFalsa(inicial: string[] = []) {
  const arquivos = new Map<string, string>(inicial.map((n) => [n, 'antigo']));
  const pasta: PastaHandle = {
    name: 'Notas',
    async getFileHandle(nome, opcoes) {
      if (!arquivos.has(nome) && !opcoes?.create) throw new DOMException('não existe', 'NotFoundError');
      return { createWritable: async () => ({ write: async (b: Blob) => { arquivos.set(nome, await b.text()); }, close: async () => undefined }) };
    },
    queryPermission: async () => 'granted',
  };
  return { pasta, arquivos };
}
const blob = (t: string) => new Blob([t], { type: 'application/pdf' });

describe('nomes padronizados', () => {
  it('três extratos e o checklist da nota 1258', () => {
    expect(nomesExtratos('1258')).toEqual(['extrato_011258.pdf', 'extrato_021258.pdf', 'extrato_031258.pdf']);
    expect(nomeChecklist('1258')).toBe('checklist1258.pdf');
  });
  it('caracteres que o sistema de arquivos recusa viram hífen', () => {
    expect(nomeSeguro(' 12/58 ')).toBe('12-58');
    expect(nomeChecklist('A:1')).toBe('checklistA-1.pdf');
  });
});

describe('escolha da pasta', () => {
  it('navegador sem a API: download comum', async () => {
    const janela = { isSecureContext: true } as unknown as Window;
    expect(suportaPasta(janela)).toBe(false);
    expect(await escolherDestino(janela)).toEqual({ tipo: 'download' });
  });
  it('cancelar a escolha não inicia nada', async () => {
    const janela = { isSecureContext: true, showDirectoryPicker: async () => { throw new DOMException('cancelou', 'AbortError'); } } as unknown as Window;
    expect(await escolherDestino(janela)).toBeNull();
  });
  it('com a API: devolve a pasta escolhida', async () => {
    const { pasta } = pastaFalsa();
    const janela = { isSecureContext: true, showDirectoryPicker: async () => pasta } as unknown as Window;
    const d = await escolherDestino(janela);
    expect(d?.tipo).toBe('pasta');
  });
});

describe('gravação na pasta', () => {
  it('salva os três extratos na mesma pasta, sem perguntar arquivo por arquivo', async () => {
    const { pasta, arquivos } = pastaFalsa();
    const destino: Destino = { tipo: 'pasta', pasta };
    let perguntou = false;
    const r = await salvarArquivos(destino, nomesExtratos('1258'), async () => [blob('e1'), blob('e2'), blob('e3')], async () => { perguntou = true; return true; });
    expect(r).toBe('salvo');
    expect(perguntou).toBe(false);
    expect([...arquivos.entries()]).toEqual([['extrato_011258.pdf', 'e1'], ['extrato_021258.pdf', 'e2'], ['extrato_031258.pdf', 'e3']]);
  });
  it('arquivo já existente: pergunta e, se cancelar, não grava nenhum', async () => {
    const { pasta, arquivos } = pastaFalsa(['extrato_021258.pdf']);
    const destino: Destino = { tipo: 'pasta', pasta };
    expect(await jaExistentes(destino, nomesExtratos('1258'))).toEqual(['extrato_021258.pdf']);
    let lista: string[] = [];
    const r = await salvarArquivos(destino, nomesExtratos('1258'), async () => [blob('e1'), blob('e2'), blob('e3')], async (n) => { lista = n; return false; });
    expect(r).toBe('cancelado');
    expect(lista).toEqual(['extrato_021258.pdf']);
    expect(arquivos.get('extrato_021258.pdf')).toBe('antigo');
    expect(arquivos.size).toBe(1);
  });
  it('confirmando a substituição, grava a nova versão', async () => {
    const { pasta, arquivos } = pastaFalsa(['checklist1258.pdf']);
    const r = await salvarArquivos({ tipo: 'pasta', pasta }, [nomeChecklist('1258')], async () => [blob('novo')], async () => true);
    expect(r).toBe('salvo');
    expect(arquivos.get('checklist1258.pdf')).toBe('novo');
  });
  it('documento que não foi gerado não salva nada', async () => {
    const { pasta, arquivos } = pastaFalsa();
    await expect(salvarArquivos({ tipo: 'pasta', pasta }, nomesExtratos('1'), async () => [blob('e1'), blob('')], async () => true)).rejects.toMatchObject({ erro: expect.stringMatching(/não foram gerados/) });
    expect(arquivos.size).toBe(0);
  });
});

describe('corte das páginas do PDF', () => {
  it('corta entre linhas, nunca no meio de uma', () => {
    const linhas = Array.from({ length: 40 }, (_, i) => 30 + i * 25); // bordas inferiores das linhas
    const cortes = calcularCortes(linhas, 1030, () => 400);
    expect(cortes[0]![0]).toBe(0);
    expect(cortes.at(-1)![1]).toBe(1030);
    for (const [, fim] of cortes.slice(0, -1)) expect(linhas).toContain(fim);
    for (const [ini, fim] of cortes) expect(fim - ini).toBeLessThanOrEqual(400);
  });
  it('documento que cabe numa página sai inteiro', () => {
    expect(calcularCortes([100, 200], 300, () => 1000)).toEqual([[0, 300]]);
  });
});
