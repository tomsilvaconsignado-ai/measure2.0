// Itens do checklist da nota (modelo de serviços continuados da SMS) e a marcação inicial de cada um.
// Nas Configurações do órgão, cada item é uma linha; "[X] " no começo = já vem marcado SIM.

export type Marca = 'SIM' | 'NAO' | null;
export interface ItemChecklist { descricao: string; marca: Marca }

export function itensDeLinhas(linhas: string[]): ItemChecklist[] {
  return linhas.map((l) => l.trim()).filter(Boolean).map((l): ItemChecklist => {
    const m = l.match(/^\[(x|X|\s?)\]\s*/);
    return { descricao: l.replace(/^\[(x|X|\s?)\]\s*/, '').trim(), marca: m && /x/i.test(m[1] ?? '') ? 'SIM' : null };
  }).filter((i) => i.descricao.length >= 2);
}

export const linhasDeItens = (itens: ItemChecklist[]) => itens.map((i) => `${i.marca === 'SIM' ? '[X] ' : ''}${i.descricao}`);

