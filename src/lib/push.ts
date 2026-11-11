// Notificações PUSH no navegador: registro do service worker, autorização da pessoa e inscrição do aparelho.
// Abrir o sistema NÃO autoriza nada: a pessoa precisa tocar em "Ativar" e aceitar o pedido do navegador.
import { supabase } from '@/lib/supabase';

export type SituacaoPush =
  | 'sem_suporte'          // navegador sem Service Worker / Push
  | 'ios_instalar'         // iPhone/iPad: precisa adicionar à tela de início (iOS 16.4+)
  | 'inseguro'             // fora de HTTPS
  | 'bloqueado'            // a pessoa negou nas configurações do navegador
  | 'desativado'           // pode ativar
  | 'ativo';               // este aparelho recebe

const BASE = import.meta.env.BASE_URL;

export const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function descreverAparelho() {
  const ua = navigator.userAgent;
  const so = /Android/.test(ua) ? 'Android' : ehIOS() ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Outro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${so} · ${nav}${instalado() ? ' (aplicativo)' : ''}`;
}

export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }); } catch { return null; }
}

export async function situacaoPush(): Promise<SituacaoPush> {
  if (!window.isSecureContext) return 'inseguro';
  if (ehIOS() && !instalado()) return 'ios_instalar';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'sem_suporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.getRegistration(BASE);
  const inscricao = await reg?.pushManager.getSubscription();
  return inscricao && Notification.permission === 'granted' ? 'ativo' : 'desativado';
}

function chaveBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function chavePublica() {
  const { data, error } = await supabase.from('configuracoes_globais').select('valor').eq('chave', 'push_vapid_publica').maybeSingle();
  if (error) throw error;
  const v = data?.valor as unknown;
  if (typeof v !== 'string' || !v) throw new Error('O envio de notificações ainda não foi configurado no servidor.');
  return v;
}

/** Pede a autorização (precisa ser chamado num clique) e cadastra este aparelho */
export async function ativarPush() {
  const s = await situacaoPush();
  if (s === 'ios_instalar') throw new Error('No iPhone/iPad, primeiro adicione o MEASURE à Tela de Início e abra por lá.');
  if (s === 'sem_suporte' || s === 'inseguro') throw new Error('Este navegador não recebe notificações PUSH.');
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('As notificações não foram autorizadas. Libere nas configurações do navegador para este site.');
  const reg = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const chave = await chavePublica();
  let inscricao = await reg.pushManager.getSubscription();
  // inscrição criada com outra chave (troca de VAPID): refaz
  const atual = inscricao?.options.applicationServerKey;
  if (inscricao && atual && btoa(String.fromCharCode(...new Uint8Array(atual))).replace(/=+$/, '') !== btoa(String.fromCharCode(...chaveBytes(chave))).replace(/=+$/, '')) {
    await inscricao.unsubscribe(); inscricao = null;
  }
  inscricao ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) });
  const j = inscricao.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc('registrar_inscricao_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_dispositivo: descreverAparelho() });
  if (error) throw error;
}

/** Para de receber neste aparelho (cancela a inscrição no navegador e no servidor) */
export async function desativarPushNesteAparelho() {
  const reg = await navigator.serviceWorker?.getRegistration(BASE);
  const inscricao = await reg?.pushManager.getSubscription();
  if (!inscricao) return;
  await supabase.rpc('revogar_inscricao_push', { p_id: null, p_endpoint: inscricao.endpoint });
  await inscricao.unsubscribe();
}

/** Endpoint deste aparelho (para marcar "este aparelho" na lista) */
export async function endpointAtual() {
  const reg = await navigator.serviceWorker?.getRegistration(BASE);
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}
