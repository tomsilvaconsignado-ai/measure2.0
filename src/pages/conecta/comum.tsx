// Identidade visual das categorias do CONECTA e peças pequenas reaproveitadas no mural e na administração.
import {
  AlertTriangle, BellRing, CalendarDays, GraduationCap, HardHat, HeartHandshake, Info, Megaphone, MessageSquare, Newspaper, Users, Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ImagemPrivada } from '@/components/ImagemPrivada';
import { Avatar, cx } from '@/components/ui/basicos';
import type { CategoriaConecta, Lotacao } from '@/services/conecta';

export const ICONES_CATEGORIA: Record<string, { rotulo: string; icone: (c: string) => ReactNode }> = {
  megafone: { rotulo: 'Megafone', icone: (c) => <Megaphone className={c} /> },
  alerta: { rotulo: 'Alerta', icone: (c) => <AlertTriangle className={c} /> },
  info: { rotulo: 'Informação', icone: (c) => <Info className={c} /> },
  calendario: { rotulo: 'Calendário', icone: (c) => <CalendarDays className={c} /> },
  pessoas: { rotulo: 'Pessoas', icone: (c) => <Users className={c} /> },
  capelo: { rotulo: 'Capacitação', icone: (c) => <GraduationCap className={c} /> },
  sino: { rotulo: 'Sino', icone: (c) => <BellRing className={c} /> },
  coracao: { rotulo: 'Campanha', icone: (c) => <HeartHandshake className={c} /> },
  jornal: { rotulo: 'Jornal', icone: (c) => <Newspaper className={c} /> },
  capacete: { rotulo: 'Obras', icone: (c) => <HardHat className={c} /> },
  chave: { rotulo: 'Ferramenta', icone: (c) => <Wrench className={c} /> },
  mensagem: { rotulo: 'Mensagem', icone: (c) => <MessageSquare className={c} /> },
};

export const CORES_CATEGORIA: Record<string, { rotulo: string; selo: string; icone: string }> = {
  marca: { rotulo: 'Institucional', selo: 'bg-marca-50 text-marca-800 ring-marca-200', icone: 'bg-marca-100 text-marca-700' },
  azul: { rotulo: 'Azul', selo: 'bg-sky-50 text-sky-800 ring-sky-200', icone: 'bg-sky-100 text-sky-700' },
  ciano: { rotulo: 'Ciano', selo: 'bg-cyan-50 text-cyan-800 ring-cyan-200', icone: 'bg-cyan-100 text-cyan-700' },
  verde: { rotulo: 'Verde', selo: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icone: 'bg-emerald-100 text-emerald-700' },
  ambar: { rotulo: 'Âmbar', selo: 'bg-amber-50 text-amber-800 ring-amber-200', icone: 'bg-amber-100 text-amber-700' },
  laranja: { rotulo: 'Laranja', selo: 'bg-orange-50 text-orange-800 ring-orange-200', icone: 'bg-orange-100 text-orange-700' },
  vermelho: { rotulo: 'Vermelho', selo: 'bg-red-50 text-red-800 ring-red-200', icone: 'bg-red-100 text-red-700' },
  rosa: { rotulo: 'Rosa', selo: 'bg-rose-50 text-rose-800 ring-rose-200', icone: 'bg-rose-100 text-rose-700' },
  violeta: { rotulo: 'Violeta', selo: 'bg-violet-50 text-violet-800 ring-violet-200', icone: 'bg-violet-100 text-violet-700' },
  cinza: { rotulo: 'Cinza', selo: 'bg-slate-100 text-slate-700 ring-slate-200', icone: 'bg-slate-100 text-slate-600' },
};

export function IconeCategoria({ c, tamanho = 'size-4' }: { c: Pick<CategoriaConecta, 'icone'>; tamanho?: string }) {
  return <>{(ICONES_CATEGORIA[c.icone] ?? ICONES_CATEGORIA.mensagem!).icone(tamanho)}</>;
}

export function SeloCategoria({ c }: { c: Pick<CategoriaConecta, 'icone' | 'cor' | 'nome'> }) {
  const cor = CORES_CATEGORIA[c.cor] ?? CORES_CATEGORIA.marca!;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', cor.selo)}>
      <IconeCategoria c={c} tamanho="size-3.5" />{c.nome}
    </span>
  );
}

/** Foto de perfil (bucket privado de avatares) ou as iniciais */
export function FotoPessoa({ nome, caminho, tamanho = 'md' }: { nome: string; caminho: string | null; tamanho?: 'sm' | 'md' }) {
  const cls = tamanho === 'sm' ? 'size-8' : 'size-10';
  return <ImagemPrivada bucket="avatares" caminho={caminho} alt="" className={cx(cls, 'shrink-0 rounded-full ring-1 ring-slate-200')}
    alternativa={<Avatar nome={nome} tamanho={tamanho === 'sm' ? 'sm' : 'md'} />} />;
}

/** "COINFRA · DIRADM" a partir da lotação */
export function rotuloLotacao(l: Lotacao | null | undefined) {
  if (!l) return '';
  const propria = l.sigla ?? l.nome;
  const acima = [l.coordenacao, l.diretoria].filter((x) => x && x !== propria);
  return [propria, ...acima].join(' · ');
}

export function tempoRelativo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return `há ${d} dia${d > 1 ? 's' : ''}`; }
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric' });
}
