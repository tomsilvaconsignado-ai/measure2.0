import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Subcaminho de publicação: "/" no domínio próprio (measuregcp.com.br); "/<repo>/" se voltar ao endereço github.io
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
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
