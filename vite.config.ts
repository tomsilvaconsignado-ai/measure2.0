import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Política de segurança de conteúdo (CSP) no HTML publicado: só scripts do próprio site, conexões só com o
// Supabase do projeto e as consultas públicas de CEP/CNPJ, sem plugins nem formulários para fora.
// O GitHub Pages não permite cabeçalhos HTTP próprios, então a política vai numa <meta>.
// Só no build: o servidor de desenvolvimento do Vite injeta scripts próprios.
function politicaDeSeguranca(): Plugin {
  return {
    name: 'measure-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const env = fs.existsSync('.env.production') ? fs.readFileSync('.env.production', 'utf8') : '';
      const supabase = (process.env.VITE_SUPABASE_URL ?? env.match(/^VITE_SUPABASE_URL=(\S+)/m)?.[1] ?? '').replace(/\/$/, '');
      if (!/^https:\/\//.test(supabase)) throw new Error('CSP: VITE_SUPABASE_URL ausente ou sem https');
      const ws = supabase.replace(/^https:/, 'wss:');
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${supabase}`,
        "font-src 'self' data:",
        `connect-src 'self' ${supabase} ${ws} https://brasilapi.com.br https://viacep.com.br`,
        `media-src 'self' blob: ${supabase}`,
        `frame-src 'self' blob: ${supabase}`,
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
      ].join('; ');
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig({
  // Subcaminho de publicação: "/" no domínio próprio (measuregcp.com.br); "/<repo>/" se voltar ao endereço github.io
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss(), politicaDeSeguranca()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    rolldownOptions: {
      output: {
        // bibliotecas estáveis em arquivos próprios: entre uma publicação e outra o navegador reaproveita do cache
        // (só o código do sistema muda). A planilha (exceljs) continua carregando só quando é usada.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\/]/, priority: 30 },
            { name: 'supabase', test: /node_modules[\/](@supabase|tslib)[\/]/, priority: 20 },
            { name: 'bibliotecas', test: /node_modules[\/](@tanstack|sonner)[\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    // Os testes do banco (PGlite) rodam à parte: npm run test:db
    exclude: ['**/node_modules/**', 'supabase/**'],
  },
});
