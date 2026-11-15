// Balões de orientação (tour guiado).
// A cada acesso (sessão do navegador), quem está com os balões ligados vê a pergunta "Quer ver os balões?".
//   * "Sim, mostrar": apresentação geral uma vez e depois as dicas de cada tela aberta neste acesso.
//   * "Agora não": nada neste acesso; no próximo, pergunta de novo.
//   * "Não mostrar mais": desliga no perfil (banco). Reativa em Meu perfil ou pela administração.
// O botão de orientações no cabeçalho mostra as dicas da tela atual a qualquer momento.
import { ArrowLeft, ArrowRight, Check, Compass, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { cx } from '../ui/basicos';
import { GERAL, roteiroDaTela, roteiroGenerico, type ContextoOrientacao, type Passo, type Roteiro } from './roteiros';

const DECISAO = 'measure.orientacao.decisao';
const VISTOS = 'measure.orientacao.vistos';
export const EVENTO_ORIENTACAO = 'measure:orientacao';

const lerSessao = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const gravarSessao = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const vistos = (): string[] => { try { return JSON.parse(lerSessao(VISTOS) || '[]') as string[]; } catch { return []; } };
const marcarVisto = (chave: string) => gravarSessao(VISTOS, JSON.stringify([...new Set([...vistos(), chave])]));
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Primeiro elemento visível entre os seletores (espera a tela carregar por até ~1,5 s) */
async function acharAlvo(alvo: Passo['alvo']): Promise<HTMLElement | null> {
  if (!alvo) return null;
  const lista = Array.isArray(alvo) ? alvo : [alvo];
  for (let t = 0; t < 10; t++) {
    for (const s of lista) {
      const el = [...document.querySelectorAll<HTMLElement>(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (el) return el;
    }
    await esperar(150);
  }
  return null;
}

interface Posicao { top: number; left: number; seta: 'cima' | 'baixo' | 'esquerda' | null; setaPos: number }
const LARGURA = 360;

function posicionar(r: DOMRect | null, larg: number, alt: number): Posicao {
  const W = window.innerWidth, H = window.innerHeight, m = 12;
  if (!r) return { top: Math.max(m, (H - alt) / 2), left: Math.max(m, (W - larg) / 2), seta: null, setaPos: 0 };
  // alvo alto e estreito (menu lateral): balão ao lado
  if (r.height > H * 0.55 && W - r.right > larg + 2 * m) {
    const top = Math.min(Math.max(m, r.top + 90), H - alt - m);
    return { top, left: r.right + 14, seta: 'esquerda', setaPos: 28 };
  }
  const left = Math.min(Math.max(m, r.left + r.width / 2 - larg / 2), W - larg - m);
  const setaPos = Math.min(Math.max(22, r.left + r.width / 2 - left), larg - 22);
  if (r.bottom + 14 + alt <= H - m) return { top: r.bottom + 14, left, seta: 'cima', setaPos };
  if (r.top - 14 - alt >= m) return { top: r.top - 14 - alt, left, seta: 'baixo', setaPos };
  return { top: H - alt - m, left, seta: null, setaPos };
}

interface Ativo { roteiros: Roteiro[]; r: number; passos: Passo[]; i: number; manual: boolean }

export function Orientacao() {
  const { contexto, pode, vinculosDoOrgao, ehPlataforma, orgao, recarregar } = useSessao();
  const local = useLocation();
  const perfil = contexto?.perfil;
  const ligadas = perfil?.orientacoes_ativas !== false;
  const [perguntar, setPerguntar] = useState(false);
  const [ativo, setAtivo] = useState<Ativo | null>(null);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<Posicao | null>(null);
  const balaoRef = useRef<HTMLDivElement>(null);
  const proximoRef = useRef<HTMLButtonElement>(null);
  const celular = typeof window !== 'undefined' && window.innerWidth < 640;

  const ctx = useMemo<ContextoOrientacao>(() => ({
    pode, ehPlataforma, temOrgao: !!orgao, papeis: vinculosDoOrgao.map((v) => v.papel),
  }), [pode, ehPlataforma, orgao, vinculosDoOrgao]);

  const filtrar = useCallback((r: Roteiro) => r.passos.filter((p) => !p.quando || p.quando(ctx)), [ctx]);

  /** Roteiro da tela atual (próprio ou o genérico do título) */
  const roteiroAtual = useCallback(() => {
    const proprio = roteiroDaTela(local.pathname);
    if (proprio) return proprio;
    const h1 = document.querySelector('[data-orientacao="pagina-titulo"] h1')?.textContent?.trim() || null;
    return roteiroGenerico(local.pathname, h1);
  }, [local.pathname]);

  const iniciar = useCallback((roteiros: Roteiro[], manual = false) => {
    const lista = roteiros.filter((r) => filtrar(r).length > 0);
    if (!lista.length) return false;
    lista.forEach((r) => marcarVisto(r.chave));
    setAtivo({ roteiros: lista, r: 0, passos: filtrar(lista[0]), i: 0, manual });
    return true;
  }, [filtrar]);

  // a cada acesso: pergunta uma vez (se os balões estão ligados)
  useEffect(() => {
    if (!perfil || !ligadas || lerSessao(DECISAO)) return;
    const t = setTimeout(() => setPerguntar(true), 1200);
    return () => clearTimeout(t);
  }, [perfil, ligadas]);

  // aceitou neste acesso: mostra a apresentação geral e as dicas de cada tela nova
  useEffect(() => {
    setAtivo(null);
    if (!ligadas || lerSessao(DECISAO) !== 'sim') return;
    const t = setTimeout(() => {
      const fila: Roteiro[] = [];
      if (!vistos().includes(GERAL.chave)) fila.push(GERAL);
      const tela = roteiroAtual();
      if (tela && !vistos().includes(tela.chave)) fila.push(tela);
      if (fila.length) iniciar(fila);
    }, 800);
    return () => clearTimeout(t);
  }, [local.pathname, ligadas, roteiroAtual, iniciar]);

  // botão "orientações desta tela" no cabeçalho
  useEffect(() => {
    const abrir = () => { setPerguntar(false); const tela = roteiroAtual(); iniciar(tela ? [tela] : [GERAL], true); };
    window.addEventListener(EVENTO_ORIENTACAO, abrir);
    return () => window.removeEventListener(EVENTO_ORIENTACAO, abrir);
  }, [roteiroAtual, iniciar]);

  const passo = ativo ? ativo.passos[ativo.i] : null;

  // encontra o alvo do passo (pula o passo se o elemento não existe nesta tela)
  useEffect(() => {
    if (!ativo || !passo) { setAlvo(null); return; }
    let vivo = true;
    setPos(null);
    void acharAlvo(passo.alvo).then((el) => {
      if (!vivo) return;
      if (passo.alvo && !el) { avancar(); return; }
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      setAlvo(el);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo?.r, ativo?.i, ativo?.roteiros]);

  // acompanha o alvo (rolagem, redimensionamento, animações)
  useEffect(() => {
    if (!ativo) return;
    let quadro = 0;
    const medir = () => {
      const r = alvo?.getBoundingClientRect() ?? null;
      setRect((ant) => (ant && r && ant.top === r.top && ant.left === r.left && ant.width === r.width && ant.height === r.height) ? ant : r);
      quadro = requestAnimationFrame(medir);
    };
    medir();
    return () => cancelAnimationFrame(quadro);
  }, [alvo, ativo]);

  useLayoutEffect(() => {
    if (!ativo || !balaoRef.current) return;
    if (celular) { setPos(null); return; }
    const b = balaoRef.current.getBoundingClientRect();
    setPos(posicionar(rect, Math.min(LARGURA, window.innerWidth - 24), b.height));
  }, [rect, ativo, celular]);

  useEffect(() => { proximoRef.current?.focus({ preventScroll: true }); }, [ativo?.i, ativo?.r]);

  const fechar = useCallback(() => { setAtivo(null); setAlvo(null); }, []);

  function avancar() {
    setAtivo((a) => {
      if (!a) return a;
      if (a.i + 1 < a.passos.length) return { ...a, i: a.i + 1 };
      const r = a.r + 1;
      if (r < a.roteiros.length) return { ...a, r, i: 0, passos: filtrar(a.roteiros[r]) };
      return null;
    });
  }
  const voltar = () => setAtivo((a) => (a && a.i > 0 ? { ...a, i: a.i - 1 } : a));

  useEffect(() => {
    if (!ativo) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowRight') avancar();
      if (e.key === 'ArrowLeft') voltar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, fechar]);

  const decidir = (d: 'sim' | 'agora-nao') => {
    gravarSessao(DECISAO, d);
    setPerguntar(false);
    if (d === 'sim') {
      const tela = roteiroAtual();
      iniciar([GERAL, ...(tela ? [tela] : [])].filter((r) => !vistos().includes(r.chave)));
    }
  };

  const naoMostrarMais = async () => {
    setPerguntar(false); fechar();
    gravarSessao(DECISAO, 'agora-nao');
    try {
      const { error } = await supabase.rpc('definir_minhas_orientacoes', { p_ativas: false });
      if (error) throw error;
      await recarregar();
      toast.success('Pronto, os balões de ajuda não vão mais aparecer. Se quiser de volta, é só ir em Meu perfil.');
    } catch (e) { toast.error(mensagemDeErro(e)); }
  };

  const primeiraVez = !perfil?.orientacoes_alteradas_em && !vistos().length;
  const nome = (perfil?.nome || '').split(' ')[0];

  return (
    <>
      {perguntar && !ativo && (
        <div role="dialog" aria-labelledby="orientacao-pergunta" className="orientacao-pergunta fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-marca-700 via-acento-500 to-chamada-400" aria-hidden />
            <div className="flex gap-3 p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-700"><Compass className="size-6" aria-hidden /></span>
              <div className="min-w-0">
                <p id="orientacao-pergunta" className="font-semibold text-slate-900">
                  {primeiraVez ? `Boas-vindas ao MEASURE${nome ? `, ${nome}` : ''}!` : 'Quer ver os balões de ajuda de novo?'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {primeiraVez
                    ? 'Quer que a gente mostre, com balõezinhos, para que serve cada coisa nas telas?'
                    : 'Eles explicam, de um jeito simples, cada tela que você abrir.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="rounded-lg bg-marca-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-marca-800" onClick={() => decidir('sim')}>Sim, mostrar</button>
                  <button className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => decidir('agora-nao')}>Agora não</button>
                </div>
                <button className="mt-2 text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline" onClick={() => void naoMostrarMais()}>
                  Não mostrar mais
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ativo && passo && (
        <div className="fixed inset-0 z-[60]" aria-live="polite">
          {/* fundo escurecido com "recorte" iluminado sobre o elemento */}
          {alvo && rect ? (
            <div className="orientacao-foco pointer-events-none fixed rounded-xl"
              style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden />
          ) : <div className="fixed inset-0 bg-marca-950/55" aria-hidden />}

          <div ref={balaoRef} role="dialog" aria-modal="true" aria-labelledby="orientacao-titulo"
            className={cx('orientacao-balao fixed', celular ? 'inset-x-3 bottom-3' : '')}
            style={celular ? undefined : { top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(LARGURA, window.innerWidth - 24), visibility: pos ? 'visible' : 'hidden' }}>
            {!celular && pos?.seta && (
              <span className={cx('orientacao-seta', `seta-${pos.seta}`)} style={pos.seta === 'esquerda' ? { top: pos.setaPos } : { left: pos.setaPos }} aria-hidden />
            )}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="h-1 bg-gradient-to-r from-marca-700 via-acento-500 to-chamada-400" aria-hidden />
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-sm font-bold text-marca-700">{ativo.i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-acento-600">
                      {ativo.roteiros[ativo.r].chave === 'geral' ? 'Conhecendo o sistema' : 'Dica desta tela'} · {ativo.i + 1} de {ativo.passos.length}
                    </p>
                    <p id="orientacao-titulo" className="mt-0.5 font-semibold text-slate-900">{passo.titulo}</p>
                  </div>
                  <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={fechar} aria-label="Fechar a ajuda desta tela"><X className="size-4" /></button>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{typeof passo.texto === 'function' ? passo.texto(ctx) : passo.texto}</p>
                <div className="mt-3 flex items-center gap-1" aria-hidden>
                  {ativo.passos.map((_, k) => <span key={k} className={cx('h-1.5 rounded-full transition-all', k === ativo.i ? 'w-5 bg-marca-600' : 'w-1.5 bg-slate-200')} />)}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {!ativo.manual && (
                    <button className="mr-auto text-xs text-slate-500 hover:text-slate-800 hover:underline" onClick={() => void naoMostrarMais()}>Não mostrar mais</button>
                  )}
                  {ativo.manual && <span className="mr-auto" />}
                  {ativo.i > 0 && (
                    <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50" onClick={voltar}>
                      <ArrowLeft className="size-4" aria-hidden />Anterior
                    </button>
                  )}
                  <button ref={proximoRef} className="inline-flex items-center gap-1 rounded-lg bg-marca-700 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-marca-800" onClick={avancar}>
                    {ativo.i + 1 < ativo.passos.length || ativo.r + 1 < ativo.roteiros.length
                      ? <>Próximo<ArrowRight className="size-4" aria-hidden /></>
                      : <>Entendi<Check className="size-4" aria-hidden /></>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Abre as orientações da tela atual (botão do cabeçalho) */
export const abrirOrientacoes = () => window.dispatchEvent(new Event(EVENTO_ORIENTACAO));
