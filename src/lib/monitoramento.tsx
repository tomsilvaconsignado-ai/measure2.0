// Monitoramento de erros no navegador: registra no banco (erros_aplicativo, lido só pela plataforma)
// e evita a tela branca quando um módulo falha.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { supabase } from './supabase';

let orgaoAtual: string | null = null;
const enviados = new Set<string>();
const versao = new URL(import.meta.url).pathname.split('/').pop()?.slice(0, 40) ?? 'dev';

export function definirOrgaoMonitorado(id: string | null) { orgaoAtual = id; }

export function registrarErro(erro: unknown, pilhaExtra?: string) {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') return;
  const e = erro instanceof Error ? erro : new Error(typeof erro === 'string' ? erro : JSON.stringify(erro));
  const chave = e.message + location.pathname;
  if (enviados.has(chave) || enviados.size > 50) return;  // não repete o mesmo erro na sessão
  enviados.add(chave);
  void supabase.rpc('registrar_erro_aplicativo', {
    p_mensagem: e.message.slice(0, 1000), p_pilha: ((e.stack ?? '') + (pilhaExtra ? '\n' + pilhaExtra : '')).slice(0, 4000),
    p_pagina: location.pathname.slice(0, 300), p_navegador: navigator.userAgent.slice(0, 300), p_versao: versao, p_tenant: orgaoAtual,
  }).then(() => undefined, () => undefined);
}

export function instalarMonitoramento() {
  window.addEventListener('error', (ev) => registrarErro(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => registrarErro(ev.reason));
}

export class LimiteDeErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  componentDidCatch(erro: Error, info: ErrorInfo) { registrarErro(erro, info.componentStack ?? undefined); }
  render() {
    if (!this.state.erro) return this.props.children;
    // Depois de publicar uma versão nova, o navegador pode pedir um módulo que não existe mais: recarregar resolve
    const versaoAntiga = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(this.state.erro.message);
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">{versaoAntiga ? 'O sistema foi atualizado' : 'Algo deu errado nesta tela'}</h1>
        <p className="mb-6 text-sm text-slate-600">
          {versaoAntiga ? 'Recarregue a página para usar a versão nova.' : 'O erro foi registrado para a equipe técnica. Recarregue a página e tente de novo.'}
        </p>
        <button className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-800" onClick={() => location.reload()}>Recarregar a página</button>
      </div>
    );
  }
}
