import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !chave) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).');
}

// Links de convite e de nova senha chegam com #...&type=invite|recovery. O cliente consome o
// fragmento ao abrir a sessão, então o tipo é guardado antes para o app levar à tela de senha.
const fragmento = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const tipoLink = fragmento.get('type');
if (tipoLink === 'invite' || tipoLink === 'recovery') {
  sessionStorage.setItem('measure.definir_senha', tipoLink);
}
export const erroDoLink = fragmento.get('error_description');

export const supabase = createClient(url, chave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const precisaDefinirSenha = () => sessionStorage.getItem('measure.definir_senha');
export const senhaDefinida = () => sessionStorage.removeItem('measure.definir_senha');

/** URL pública do app (para links de e-mail) */
export const urlDoApp = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
