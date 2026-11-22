// GitHub Pages: cada rota fixa da SPA ganha uma cópia do index.html (dist/<rota>.html), para que links
// diretos (convite, recuperação de senha, favoritos, recarregar a página) respondam 200 em vez de 404.
// Rotas com parâmetro (contratos/:id, imprimir/:id) continuam pelo 404.html, que também é o próprio app.
import fs from 'fs';
import path from 'path';

const raiz = path.resolve(import.meta.dirname, '..');
const dist = path.join(raiz, 'dist');
const app = fs.readFileSync(path.join(raiz, 'src', 'App.tsx'), 'utf8');
const indice = fs.readFileSync(path.join(dist, 'index.html'));
const rotas = [...new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1].replace(/^\//, '')))]
  .filter((r) => r && r !== '*' && !r.includes(':'));
// <rota>.html: o Pages serve /rota direto (200), sem o redirecionamento 301 para /rota/ que a pasta causaria
for (const r of rotas) {
  fs.mkdirSync(path.dirname(path.join(dist, r)), { recursive: true });
  fs.writeFileSync(path.join(dist, `${r}.html`), indice);
}
fs.writeFileSync(path.join(dist, '404.html'), indice);
console.log(`${rotas.length} rotas com página própria; demais caminhos pelo 404.html`);

// Google: só a entrada e a página pública "Por que usar o MEASURE" aparecem na busca. As demais rotas
// (telas internas) e o 404.html continuam com noindex, herdado do index.html.
const SITE = 'https://measuregcp.com.br';
const DESCRICAO = 'Sistema de gestão de contratos públicos: empenhos, notas fiscais, fiscalização, pesquisa de preços com dados do Compras.gov.br e controle de despesas.';
const PUBLICAS = [
  { arquivo: 'index.html', url: `${SITE}/`, titulo: 'MEASURE 2.0 | Gestão de contratos públicos' },
  { arquivo: 'por-que-usar.html', url: `${SITE}/por-que-usar`, titulo: 'Por que usar o MEASURE | Gestão de contratos públicos' },
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
for (const p of PUBLICAS) {
  const alvo = path.join(dist, p.arquivo);
  if (!fs.existsSync(alvo)) throw new Error(`página pública ausente: ${p.arquivo}`);
  const extra = [
    `<link rel="canonical" href="${p.url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:site_name" content="MEASURE 2.0" />`,
    `<meta property="og:title" content="${esc(p.titulo)}" />`,
    `<meta property="og:description" content="${esc(DESCRICAO)}" />`,
    `<meta property="og:url" content="${p.url}" />`,
    `<meta property="og:image" content="${SITE}/marca/icone-512.png" />`,
  ].join('\n    ');
  const html = indice.toString()
    .replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="index, follow" />')
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.titulo)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(DESCRICAO)}" />\n    ${extra}`);
  if (!html.includes('index, follow')) throw new Error('não foi possível liberar a indexação de ' + p.arquivo);
  fs.writeFileSync(alvo, html);
}
console.log(`indexáveis: ${PUBLICAS.map((p) => p.arquivo).join(', ')}`);
