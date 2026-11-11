import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({ urlArquivo: async () => null }));
const { assinaturas, novoDocumento, paragrafo, t, tabela, TOPO_CONTEUDO } = await import('./pdfPatrimonio');

const timbre = {
  nome_oficial: 'Secretaria Municipal da Saúde de Aracaju', nome_curto: 'SMS', cnpj: null, endereco: 'Rua Teste, 100', cidade: 'Aracaju', uf: 'SE', cep: '49000000',
  telefone: null, email: null, site: null, logo_path: null, cabecalho: ['PREFEITURA MUNICIPAL DE ARACAJU', 'SECRETARIA MUNICIPAL DA SAÚDE'], rodape: null,
  secretaria: null, orgao_fundo: 'Fundo Municipal de Saúde', setor: 'Coordenação de Patrimônio', contato: null,
};

describe('PDF do patrimônio', () => {
  it('troca caracteres fora do Latin-1 e mantém os acentos', () => {
    expect(t('Ação – “teste” … ✓ São João')).toBe('Ação - "teste" ...  São João');
  });
  it('gera documento com timbre, tabela longa (várias páginas), assinaturas e paginação', async () => {
    const { doc, finalizar } = await novoDocumento(timbre, { titulo: 'RELATÓRIO GERAL DE PATRIMÔNIO', emitidoPor: 'Maria Teste', paisagem: true });
    let y = paragrafo(doc, TOPO_CONTEUDO, 'Total de bens: 120', { negrito: true });
    y = tabela(doc, y, ['Nº', 'Descrição', 'Situação'], Array.from({ length: 120 }, (_, i) => [String(10000 + i), `Computador ${i} – sala técnica`, 'Em uso']));
    assinaturas(doc, y, [{ papel: 'Responsável que entrega', nome: 'João', matricula: '123' }, { papel: 'Responsável que recebe', nome: 'Ana', matricula: '456' }]);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const blob = finalizar();
    expect(blob.type).toBe('application/pdf');
    const texto = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect(texto).toContain('Página 1 de');
    expect(texto).toContain('SECRETARIA MUNICIPAL DA SAÚDE');
  });
});
