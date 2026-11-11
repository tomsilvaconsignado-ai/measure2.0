// Montagem dos PDFs do patrimônio. Relatórios, históricos e inventários são numerados e guardados no
// armazenamento (RELATORIO DE PATRIMONIO - ANO 2026[ - 001].pdf); termos de transferência e de
// responsabilidade são baixados para impressão e assinatura.
import { toast } from 'sonner';
import { assinaturas, baixar, garantirEspaco, novoDocumento, paragrafo, t, tabela, TOPO_CONTEUDO } from '@/lib/pdfPatrimonio';
import { brl, formatarData, formatarDataHora } from '@/lib/formatacao';
import { supabase } from '@/lib/supabase';
import {
  AMBIENTES, CONSERVACAO, DECLARACAO, DESTINO_SUBSTITUIDO, registrarRelatorio, SITUACAO, SITUACAO_MOV, STATUS_INVENTARIO, timbrePatrimonio, TIPOS_MOV,
  type BemListado, type FichaBem, type Inventario, type MovListada, type Movimentacao,
} from '@/services/patrimonio';
import type { Lotacao } from '@/services/conecta';

const un = (u: Lotacao | null | undefined) => (u ? `${u.sigla ? `${u.sigla} - ` : ''}${u.nome}` : '');

/** Gera, numera, guarda e abre o PDF (o nome do arquivo segue o padrão anual do órgão) */
async function guardarEAbrir(tenantId: string, tipo: string, titulo: string, filtros: Record<string, unknown>, blob: Blob) {
  const r = await registrarRelatorio(tenantId, tipo, titulo, filtros, blob);
  baixar(blob, r.nome_arquivo);
  toast.success(`${r.nome_arquivo} gerado e guardado nos relatórios emitidos.`);
  return r;
}

export async function abrirRelatorioGuardado(storagePath: string, nome: string, baixarArquivo: boolean) {
  const { data, error } = await supabase.storage.from('arquivos').createSignedUrl(storagePath, 600, baixarArquivo ? { download: nome } : undefined);
  if (error || !data) throw error ?? { erro: 'Arquivo indisponível.' };
  window.open(data.signedUrl, '_blank', 'noopener');
}

// ---------------------------------------------------------------- relatório de bens

export type Agrupamento = 'nenhum' | 'local' | 'diretoria' | 'coordenacao' | 'categoria' | 'responsavel' | 'localizacao';

const chaveGrupo = (b: BemListado, g: Agrupamento) => {
  switch (g) {
    case 'local': return b.local ?? 'Sem unidade informada';
    case 'diretoria': return b.unidade?.diretoria ?? 'Fora de diretoria';
    case 'coordenacao': return b.unidade?.coordenacao ?? 'Fora de coordenação';
    case 'categoria': return b.categoria;
    case 'responsavel': return b.responsavel ? `${b.responsavel} (mat. ${b.responsavel_matricula})` : 'Sem responsável definido';
    case 'localizacao': return `${b.local ?? 'Sem unidade'}${b.sala ? ` · ${b.sala}` : ''}`;
    default: return '';
  }
};

export async function pdfBens(p: { tenantId: string; emitidoPor: string; tipo: string; titulo: string; filtrosTexto: string; filtros: Record<string, unknown>; bens: BemListado[]; agrupar: Agrupamento }) {
  const timbre = await timbrePatrimonio(p.tenantId);
  const { doc, finalizar } = await novoDocumento(timbre, { titulo: p.titulo.toUpperCase(), subtitulo: p.filtrosTexto, emitidoPor: p.emitidoPor, paisagem: true });
  let y = TOPO_CONTEUDO;
  const total = p.bens.reduce((s, b) => s + Number(b.valor_aquisicao ?? 0), 0);
  y = paragrafo(doc, y, `Total de bens: ${p.bens.length}${total ? ` · Valor de aquisição somado: ${brl(total)}` : ''}`, { negrito: true });
  const head = ['Nº patrimônio', 'Descrição', 'Categoria', 'Setor', 'Unidade / sala', 'Responsável', 'Conservação', 'Situação', 'Valor'];
  const linha = (b: BemListado) => [b.numero, `${b.descricao}${b.marca ? ` (${[b.marca, b.modelo].filter(Boolean).join(' ')})` : ''}`, b.subcategoria ?? b.categoria,
    b.unidade ? [b.unidade.sigla ?? b.unidade.nome, b.unidade.coordenacao, b.unidade.diretoria].filter((x, i, a) => x && a.indexOf(x) === i).join(' / ') : '',
    [b.local, b.sala].filter(Boolean).join(' / '), b.responsavel ? `${b.responsavel} (${b.responsavel_matricula})` : 'Sem responsável',
    CONSERVACAO[b.conservacao] ?? b.conservacao, SITUACAO[b.situacao] ?? b.situacao, b.valor_aquisicao != null ? brl(b.valor_aquisicao) : ''];
  const colunas = { 0: { cellWidth: 22 }, 8: { halign: 'right' as const, cellWidth: 22 } };
  if (p.agrupar === 'nenhum') {
    tabela(doc, y, head, p.bens.map(linha), { colunas });
  } else {
    const grupos = new Map<string, BemListado[]>();
    for (const b of p.bens) { const k = chaveGrupo(b, p.agrupar); grupos.set(k, [...(grupos.get(k) ?? []), b]); }
    for (const [k, bens] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
      y = garantirEspaco(doc, y, 20);
      y = paragrafo(doc, y + 2, `${k} — ${bens.length} bem(ns)`, { negrito: true, tamanho: 9.5 });
      y = tabela(doc, y, head, bens.map(linha), { colunas }) + 4;
    }
  }
  return guardarEAbrir(p.tenantId, p.tipo, p.titulo, p.filtros, finalizar());
}

// ---------------------------------------------------------------- relatório de movimentações

export async function pdfMovimentacoes(p: { tenantId: string; emitidoPor: string; tipo: string; titulo: string; filtrosTexto: string; filtros: Record<string, unknown>; movs: MovListada[] }) {
  const timbre = await timbrePatrimonio(p.tenantId);
  const { doc, finalizar } = await novoDocumento(timbre, { titulo: p.titulo.toUpperCase(), subtitulo: p.filtrosTexto, emitidoPor: p.emitidoPor, paisagem: true });
  let y = paragrafo(doc, TOPO_CONTEUDO, `Total de movimentações: ${p.movs.length}`, { negrito: true });
  y = tabela(doc, y, ['Nº', 'Data', 'Tipo', 'Bem(ns)', 'Origem', 'Destino', 'Responsável anterior → novo', 'Situação', 'Solicitante', 'Justificativa'],
    p.movs.map((m) => [m.codigo, formatarData(m.criado_em), TIPOS_MOV[m.tipo] ?? m.tipo,
      m.bens.map((b) => `${b.numero} ${b.descricao}${b.papel !== 'PRINCIPAL' ? ` (${b.papel.toLowerCase()})` : ''}`).join('\n'),
      [un(m.origem), ...m.bens.map((b) => b.origem_local).filter(Boolean)].filter((x, i, a) => x && a.indexOf(x) === i).join(' / '),
      [un(m.destino), ...m.bens.map((b) => b.destino_local).filter(Boolean)].filter((x, i, a) => x && a.indexOf(x) === i).join(' / '),
      m.bens.map((b) => `${b.origem_responsavel ?? '-'} → ${b.destino_responsavel ?? '-'}`).join('\n'),
      `${SITUACAO_MOV[m.situacao]?.[0] ?? m.situacao}${m.retificada ? ' (retificada)' : ''}`, m.solicitante, m.justificativa]), { fonte: 7, colunas: { 0: { cellWidth: 16 }, 1: { cellWidth: 17 } } });
  void y;
  return guardarEAbrir(p.tenantId, p.tipo, p.titulo, p.filtros, finalizar());
}

// ---------------------------------------------------------------- histórico individual

export async function pdfHistorico(tenantId: string, b: FichaBem, emitidoPor: string) {
  const timbre = await timbrePatrimonio(tenantId);
  const { doc, finalizar } = await novoDocumento(timbre, { titulo: 'HISTÓRICO INDIVIDUAL DE PATRIMÔNIO', subtitulo: `Patrimônio nº ${b.numero}`, emitidoPor });
  let y = tabela(doc, TOPO_CONTEUDO, ['Campo', 'Informação'], [
    ['Número patrimonial', b.numero], ['Descrição', b.descricao], ['Categoria', `${b.categoria}${b.subcategoria ? ` / ${b.subcategoria}` : ''}`],
    ['Marca / modelo', [b.marca, b.modelo].filter(Boolean).join(' / ')], ['Número de série', b.numero_serie], ['Data de cadastro', formatarDataHora(b.criado_em)],
    ['Aquisição', [b.data_aquisicao && formatarData(b.data_aquisicao), b.valor_aquisicao != null && brl(b.valor_aquisicao), b.nota_fiscal && `NF ${b.nota_fiscal}`, b.fornecedor].filter(Boolean).join(' · ')],
    ['Localização atual', [un(b.unidade), b.local?.nome, b.ambiente && AMBIENTES[b.ambiente], b.sala].filter(Boolean).join(' · ')],
    ['Responsável atual', b.responsavel ? `${b.responsavel.nome} (matrícula ${b.responsavel.matricula})` : 'Sem responsável'],
    ['Estado de conservação', CONSERVACAO[b.conservacao]], ['Situação operacional', SITUACAO[b.situacao]],
  ], { fonte: 8.5, colunas: { 0: { cellWidth: 45 } } }) + 6;
  y = paragrafo(doc, y, 'Movimentações realizadas', { negrito: true, tamanho: 10 });
  y = tabela(doc, y, ['Nº', 'Data', 'Tipo', 'Origem → destino', 'Responsável', 'Justificativa', 'Situação / confirmação'],
    [...b.movimentacoes].reverse().map((m) => [m.codigo, formatarData(m.criado_em), TIPOS_MOV[m.tipo] ?? m.tipo, `${m.origem} → ${m.destino}`,
      `${m.responsavel_anterior ?? '-'} → ${m.novo_responsavel ?? '-'}`, m.justificativa,
      `${SITUACAO_MOV[m.situacao]?.[0] ?? m.situacao}${m.confirmado_em ? `; confirmado ${m.confirmacao_tipo === 'DIGITAL' ? 'digitalmente' : m.confirmacao_tipo === 'DOCUMENTO_FISICO' ? 'por termo físico' : 'pela administração'} por ${m.confirmado_por} em ${formatarDataHora(m.confirmado_em)}` : ''}${m.documentos ? `; ${m.documentos} documento(s)` : ''}`]),
    { fonte: 7 }) + 6;
  y = paragrafo(doc, y, 'Responsáveis e localizações anteriores', { negrito: true, tamanho: 10 });
  tabela(doc, y, ['Responsável', 'Setor', 'Unidade', 'Início', 'Fim', 'Motivo'],
    [...b.responsaveis].reverse().map((r) => [r.servidor ? `${r.servidor} (${r.matricula})` : 'Sem responsável', r.unidade, r.local, formatarData(r.inicio), r.fim ? formatarData(r.fim) : 'atual', r.motivo]), { fonte: 7.5 });
  return guardarEAbrir(tenantId, 'HISTORICO', `Histórico do patrimônio ${b.numero}`, { bem_id: b.id, numero: b.numero }, finalizar());
}

// ---------------------------------------------------------------- termo de transferência / troca

export async function pdfTermo(tenantId: string, m: Movimentacao, emitidoPor: string) {
  const timbre = await timbrePatrimonio(tenantId);
  const troca = m.tipo === 'TROCA';
  const { doc, finalizar } = await novoDocumento(timbre, {
    titulo: troca ? 'TERMO DE TROCA DE PATRIMÔNIO' : 'TERMO DE TRANSFERÊNCIA DE PATRIMÔNIO', subtitulo: `Movimentação nº ${m.codigo} · ${TIPOS_MOV[m.tipo] ?? m.tipo}`, emitidoPor, numero: m.codigo,
  });
  let y = paragrafo(doc, TOPO_CONTEUDO, `Número da movimentação: ${m.codigo}    Data de emissão: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}    Solicitada em: ${formatarDataHora(m.criado_em)} por ${m.solicitante}`);
  for (const i of m.itens) {
    y = garantirEspaco(doc, y, 50);
    y = paragrafo(doc, y + 1, `${i.papel === 'ENTREGUE' ? 'Bem entregue' : i.papel === 'RECEBIDO' ? 'Bem recebido' : i.papel === 'SUBSTITUIDO' ? 'Bem substituído' : i.papel === 'SUBSTITUTO' ? 'Bem substituto' : 'Bem patrimonial'}: nº ${i.numero} - ${i.descricao}`, { negrito: true });
    y = tabela(doc, y, ['', 'Origem', 'Destino'], [
      ['Categoria', i.categoria, ''], ['Estado de conservação', CONSERVACAO[i.conservacao] ?? i.conservacao, ''],
      ['Unidade', i.origem.local, i.destino.local], ['Diretoria', i.origem.unidade?.diretoria, i.destino.unidade?.diretoria],
      ['Coordenação / setor', [i.origem.unidade?.coordenacao, i.origem.unidade?.sigla ?? i.origem.unidade?.nome].filter((x, k, a) => x && a.indexOf(x) === k).join(' / '),
        [i.destino.unidade?.coordenacao, i.destino.unidade?.sigla ?? i.destino.unidade?.nome].filter((x, k, a) => x && a.indexOf(x) === k).join(' / ')],
      ['Sala / ambiente', [i.origem.ambiente && AMBIENTES[i.origem.ambiente], i.origem.sala].filter(Boolean).join(' '), [i.destino.ambiente && AMBIENTES[i.destino.ambiente], i.destino.sala].filter(Boolean).join(' ')],
      ['Responsável', i.origem.responsavel ? `${i.origem.responsavel.nome} - matrícula ${i.origem.responsavel.matricula}` : 'Sem responsável',
        i.destino.responsavel ? `${i.destino.responsavel.nome} - matrícula ${i.destino.responsavel.matricula}` : 'Sem responsável'],
    ], { fonte: 8, colunas: { 0: { cellWidth: 42 } } }) + 3;
  }
  y = paragrafo(doc, y + 1, `Justificativa: ${m.justificativa}`);
  if (m.destino_substituido) y = paragrafo(doc, y, `Destino do bem substituído: ${DESTINO_SUBSTITUIDO[m.destino_substituido]}`);
  y = paragrafo(doc, y, `Observações: ${m.observacoes ?? '_______________________________________________________________________________'}`);
  y = paragrafo(doc, y + 2, `"${DECLARACAO}"`, { negrito: true });
  const entrega = m.itens.find((i) => i.papel !== 'RECEBIDO')?.origem.responsavel;
  const recebe = m.itens.find((i) => i.papel !== 'RECEBIDO')?.destino.responsavel;
  const quem = troca
    ? [{ papel: 'Responsável que entrega', nome: entrega?.nome, matricula: entrega?.matricula }, { papel: 'Responsável que recebe', nome: recebe?.nome, matricula: recebe?.matricula },
       { papel: 'Gestor / autoridade competente' }]
    : [{ papel: 'Responsável que entrega', nome: entrega?.nome, matricula: entrega?.matricula }, { papel: 'Responsável que recebe', nome: recebe?.nome, matricula: recebe?.matricula },
       { papel: 'Gestor / autoridade competente' }];
  assinaturas(doc, y + 2, quem);
  const blob = finalizar();
  baixar(blob, t(`TERMO DE ${troca ? 'TROCA' : 'TRANSFERENCIA'} DE PATRIMONIO - ${m.codigo.replace('/', '-')}.pdf`));
  toast.success('Termo gerado. Imprima, colha as assinaturas e anexe a cópia digitalizada na movimentação.');
}

// ---------------------------------------------------------------- termo de responsabilidade

export async function pdfTermoResponsabilidade(tenantId: string, emitidoPor: string, d: { titulo: string; quem: string; responsavel?: { nome: string; matricula: string; cargo: string | null } | null; bens: BemListado[] }) {
  const timbre = await timbrePatrimonio(tenantId);
  const { doc, finalizar } = await novoDocumento(timbre, { titulo: 'TERMO DE RESPONSABILIDADE PATRIMONIAL', subtitulo: d.quem, emitidoPor });
  let y = paragrafo(doc, TOPO_CONTEUDO, d.responsavel
    ? `Eu, ${d.responsavel.nome}, matrícula ${d.responsavel.matricula}${d.responsavel.cargo ? `, ${d.responsavel.cargo}` : ''}, declaro estar sob a minha guarda e responsabilidade os bens patrimoniais relacionados abaixo, comprometendo-me a zelar por sua conservação e a comunicar qualquer dano, extravio ou movimentação, conforme as normas institucionais aplicáveis.`
    : `Relação dos bens patrimoniais sob responsabilidade de ${d.quem}, para conferência e assinatura dos responsáveis.`);
  y = tabela(doc, y + 2, ['Nº patrimônio', 'Descrição', 'Unidade / sala', 'Responsável', 'Conservação', 'Situação'],
    d.bens.map((b) => [b.numero, b.descricao, [b.local, b.sala].filter(Boolean).join(' / '), b.responsavel ?? '-', CONSERVACAO[b.conservacao], SITUACAO[b.situacao]]), { fonte: 7.5 }) + 4;
  y = paragrafo(doc, y, `Total: ${d.bens.length} bem(ns).`, { negrito: true });
  assinaturas(doc, y, d.responsavel ? [{ papel: 'Servidor responsável', nome: d.responsavel.nome, matricula: d.responsavel.matricula }, { papel: 'Setor de patrimônio' }]
    : [{ papel: 'Gestor da unidade' }, { papel: 'Setor de patrimônio' }]);
  return guardarEAbrir(tenantId, 'TERMO_RESPONSABILIDADE', d.titulo, { quem: d.quem }, finalizar());
}

// ---------------------------------------------------------------- inventário

export async function pdfInventario(tenantId: string, inv: Inventario, emitidoPor: string) {
  const timbre = await timbrePatrimonio(tenantId);
  const { doc, finalizar } = await novoDocumento(timbre, { titulo: 'RELATÓRIO DE INVENTÁRIO PATRIMONIAL', subtitulo: inv.titulo, emitidoPor, paisagem: true });
  const resumo = Object.entries(inv.resumo ?? {}).map(([k, n]) => `${STATUS_INVENTARIO[k]?.[0] ?? k}: ${n}`).join(' · ');
  let y = paragrafo(doc, TOPO_CONTEUDO, `Unidade: ${un(inv.unidade)}${inv.local ? ` · ${inv.local}` : ''} · Responsável pela conferência: ${inv.responsavel} · Início: ${formatarDataHora(inv.iniciado_em)}${inv.concluido_em ? ` · Encerrado: ${formatarDataHora(inv.concluido_em)}` : ' · Em andamento'}`);
  y = paragrafo(doc, y, resumo, { negrito: true });
  tabela(doc, y, ['Nº patrimônio', 'Descrição', 'Setor', 'Unidade / sala', 'Responsável', 'Conferência', 'Conservação avaliada', 'Observação', 'Conferido por'],
    inv.itens.map((i) => [i.bem?.numero ?? i.numero_encontrado ?? '(sem número)', i.bem?.descricao ?? i.descricao_encontrada, i.bem?.unidade, [i.bem?.local, i.bem?.sala].filter(Boolean).join(' / '),
      i.bem?.responsavel, STATUS_INVENTARIO[i.status]?.[0] ?? i.status, i.conservacao_avaliada ? CONSERVACAO[i.conservacao_avaliada] : '', i.observacao,
      i.conferido_por ? `${i.conferido_por} em ${formatarData(i.conferido_em)}` : '']), { fonte: 7 });
  return guardarEAbrir(tenantId, 'INVENTARIO', `Inventário: ${inv.titulo}`, { inventario_id: inv.id }, finalizar());
}
