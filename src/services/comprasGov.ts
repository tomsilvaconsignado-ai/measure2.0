// Dados abertos do Compras.gov.br: catálogo CATMAT/CATSER do órgão e consultas feitas pelo servidor do MEASURE.
import { supabase } from '@/lib/supabase';

function falhou<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export type TipoCatalogo = 'MATERIAL' | 'SERVICO';
export interface ItemCatalogo { tipo: TipoCatalogo; codigo: number; descricao: string; codigo_grupo: number | null; nome_grupo: string | null; codigo_classe: number | null; nome_classe: string | null; categoria: string | null }
export interface CategoriaCatalogo { id: string; tipo: TipoCatalogo; codigo: number; nome: string; ativo: boolean; itens: number; sincronizado_em: string | null }

export async function buscarCatalogo(tenantId: string, tipo: TipoCatalogo, texto: string, limite = 30): Promise<ItemCatalogo[]> {
  if (texto.trim().length < 2) return [];
  return falhou(await supabase.rpc('catalogo_buscar', { p_tenant: tenantId, p_tipo: tipo, p_texto: texto, p_limite: limite })) as ItemCatalogo[];
}

export async function listarCategoriasCatalogo(tenantId: string): Promise<CategoriaCatalogo[]> {
  return falhou(await supabase.rpc('catalogo_categorias_resumo', { p_tenant: tenantId })) as CategoriaCatalogo[];
}

export async function salvarCategoriaCatalogo(tenantId: string, c: { id?: string; tipo: TipoCatalogo; codigo: number; nome: string; ativo?: boolean }) {
  if (c.id) {
    falhou(await supabase.from('catalogo_categorias_orgao').update({ nome: c.nome, ativo: c.ativo ?? true }).eq('id', c.id));
  } else {
    falhou(await supabase.from('catalogo_categorias_orgao').insert({ tenant_id: tenantId, tipo: c.tipo, codigo: c.codigo, nome: c.nome }));
  }
}

/** Baixa do governo os itens da categoria, em lotes de páginas, até terminar. */
export async function sincronizarCategoria(tipo: TipoCatalogo, codigo: number, aoProgredir?: (paginas: number, total: number) => void) {
  let pagina: number | null = 1;
  let gravados = 0;
  while (pagina) {
    const r = falhou(await supabase.rpc('catalogo_sincronizar', { p_tipo: tipo, p_codigo: codigo, p_pagina: pagina, p_max_paginas: 3 })) as
      { gravados: number; proxima_pagina: number | null; total_paginas: number };
    gravados += r.gravados;
    aoProgredir?.(r.proxima_pagina ? r.proxima_pagina - 1 : r.total_paginas, r.total_paginas);
    pagina = r.proxima_pagina;
  }
  return gravados;
}

export type ConsultaComprasGov = 'preco_material' | 'preco_servico' | 'arp_item' | 'fornecedor';
export interface RespostaComprasGov<T = Record<string, unknown>> {
  resultado: T[]; totalRegistros: number; totalPaginas: number; paginasRestantes: number; consultado_em: string; pagina: number;
}

export async function consultarComprasGov<T = Record<string, unknown>>(consulta: ConsultaComprasGov, parametros: Record<string, string>, pagina = 1) {
  return falhou(await supabase.rpc('consultar_compras_gov', { p_consulta: consulta, p_parametros: parametros, p_pagina: pagina })) as RespostaComprasGov<T>;
}
