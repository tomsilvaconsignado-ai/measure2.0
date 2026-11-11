// Service worker do MEASURE: recebe as notificações PUSH (mesmo com o aplicativo fechado ou em segundo
// plano) e, ao tocar, abre o conteúdo no sistema — onde login e permissão são conferidos de novo.
// Não guarda páginas nem dados em cache: o sistema sempre carrega a versão publicada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let d = {};
  try { d = evento.data ? evento.data.json() : {}; } catch { d = { titulo: 'MEASURE', texto: evento.data ? evento.data.text() : '' }; }
  const base = self.registration.scope;
  evento.waitUntil(self.registration.showNotification(d.titulo || 'MEASURE', {
    body: d.texto || 'Você tem uma nova notificação.',
    icon: base + 'marca/icone-192.png',
    badge: base + 'marca/icone-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { link: d.link || '/minhas-notificacoes', notificacao_id: d.notificacao_id || null },
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const link = String((evento.notification.data && evento.notification.data.link) || '/minhas-notificacoes');
  // só caminhos internos do próprio sistema
  const destino = new URL(link.replace(/^\/+/, ''), self.registration.scope);
  if (destino.origin !== self.location.origin) return;
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((j) => j.url.startsWith(self.registration.scope));
    if (aberta) {
      await aberta.focus();
      aberta.postMessage({ tipo: 'abrir', caminho: '/' + link.replace(/^\/+/, '') });
      return;
    }
    await self.clients.openWindow(destino.href);
  })());
});
