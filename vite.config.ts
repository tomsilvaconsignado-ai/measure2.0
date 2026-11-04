import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Subcaminho de publicação (GitHub Pages de projeto: "/measure2.0/"); na Vercel fica "/"
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    // Os testes do banco (PGlite) rodam à parte: npm run test:db
    exclude: ['**/node_modules/**', 'supabase/**'],
  },
});
