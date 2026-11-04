// Consultas públicas de CNPJ e CEP (BrasilAPI, com ViaCEP de reserva para CEP).
// Nunca bloqueiam o cadastro: se falharem, a pessoa preenche à mão.
import { somenteDigitos } from '@/lib/formatacao';

async function buscarJson(url: string, ms = 8000): Promise<unknown> {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), ms);
  try {
    const r = await fetch(url, { signal: controle.signal, headers: { Accept: 'application/json' } });
    if (r.status === 404) throw new Error('nao_encontrado');
    if (!r.ok) throw new Error(`http_${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export interface Endereco { cep: string; logradouro: string; bairro: string; cidade: string; uf: string; complemento?: string; numero?: string }

export async function consultarCep(cep: string): Promise<Endereco> {
  const d = somenteDigitos(cep);
  if (d.length !== 8) throw { erro: 'CEP deve ter 8 dígitos.', campo: 'cep' };
  try {
    const r = await buscarJson(`https://brasilapi.com.br/api/cep/v1/${d}`) as Record<string, string>;
    return { cep: d, logradouro: r.street ?? '', bairro: r.neighborhood ?? '', cidade: r.city ?? '', uf: r.state ?? '' };
  } catch (e) {
    if ((e as Error).message === 'nao_encontrado') throw { erro: 'CEP não encontrado. Confira ou preencha o endereço manualmente.', campo: 'cep' };
    try {
      const r = await buscarJson(`https://viacep.com.br/ws/${d}/json/`) as Record<string, string | boolean>;
      if (r.erro) throw { erro: 'CEP não encontrado. Confira ou preencha o endereço manualmente.', campo: 'cep' };
      return { cep: d, logradouro: String(r.logradouro ?? ''), bairro: String(r.bairro ?? ''), cidade: String(r.localidade ?? ''), uf: String(r.uf ?? '') };
    } catch (e2) {
      if ((e2 as { erro?: string }).erro) throw e2;
      throw { erro: 'O serviço de CEP não respondeu. Preencha o endereço manualmente.', campo: 'cep' };
    }
  }
}

export interface DadosCnpj extends Partial<Endereco> {
  razao_social: string; nome_fantasia: string; telefone: string; email: string; situacao: string;
}

export async function consultarCnpj(cnpj: string): Promise<DadosCnpj> {
  const d = somenteDigitos(cnpj);
  try {
    const r = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${d}`, 10000) as Record<string, unknown>;
    const s = (k: string) => (r[k] == null ? '' : String(r[k])).trim();
    return {
      razao_social: s('razao_social'), nome_fantasia: s('nome_fantasia'),
      cep: somenteDigitos(s('cep')), logradouro: [s('descricao_tipo_de_logradouro'), s('logradouro')].filter(Boolean).join(' '),
      numero: s('numero'), complemento: s('complemento'), bairro: s('bairro'), cidade: s('municipio'), uf: s('uf'),
      telefone: somenteDigitos(s('ddd_telefone_1')), email: s('email').toLowerCase(),
      situacao: s('descricao_situacao_cadastral'),
    };
  } catch (e) {
    if ((e as Error).message === 'nao_encontrado') throw { erro: 'CNPJ não encontrado na Receita. Confira o número ou preencha manualmente.', campo: 'documento' };
    throw { erro: 'A consulta pública de CNPJ não respondeu. Preencha os dados manualmente.', campo: 'documento' };
  }
}
