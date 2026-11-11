import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { SessaoProvider } from './auth/Sessao';
import { instalarMonitoramento, LimiteDeErro } from './lib/monitoramento';
import { registrarServiceWorker } from './lib/push';
import './index.css';

// Contra clickjacking: o MEASURE não funciona dentro de outro site (moldura/iframe).
// O GitHub Pages não envia o cabeçalho frame-ancestors, então a recusa fica aqui.
const dentroDeOutroSite = (() => { try { return window.top !== window.self; } catch { return true; } })();
if (dentroDeOutroSite) {
  document.body.textContent = '';
  const aviso = document.createElement('a');
  aviso.href = window.location.href;
  aviso.target = '_top';
  aviso.rel = 'noopener';
  aviso.textContent = 'Por segurança, o MEASURE só funciona aberto diretamente. Clique para abrir.';
  aviso.style.cssText = 'display:block;padding:24px;font:16px sans-serif;color:#0f2a4a';
  document.body.appendChild(aviso);
  throw new Error('MEASURE aberto dentro de outro site: carregamento interrompido.');
}

instalarMonitoramento();
void registrarServiceWorker();

const consultas = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <SessaoProvider>
          <LimiteDeErro><App /></LimiteDeErro>
          <Toaster richColors position="top-right" closeButton />
        </SessaoProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
