// GitHub Pages: cada rota fixa da SPA ganha uma cópia do index.html (dist/<rota>/index.html), para que links
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
for (const r of rotas) {
  const pasta = path.join(dist, r);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'index.html'), indice);
}
fs.writeFileSync(path.join(dist, '404.html'), indice);
console.log(`${rotas.length} rotas com página própria; demais caminhos pelo 404.html`);
