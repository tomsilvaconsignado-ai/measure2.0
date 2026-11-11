// Gestão patrimonial numa aba só: o menu lateral tem uma entrada, e os módulos ficam nesta barra de abas.
import {
  ArrowLeftRight, BellRing, Boxes, ClipboardCheck, FileDown, History, MapPin, Package, PackagePlus, PackageSearch, Repeat, Replace,
  SlidersHorizontal, Truck, UserCheck,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { cx } from '@/components/ui/basicos';

interface Modulo { para: string; rotulo: string; icone: ReactNode; acao?: 'ler' | 'editar'; livre?: boolean }

export const MODULOS_PATRIMONIO: Modulo[] = [
  { para: '/patrimonio', rotulo: 'Dashboard', icone: <Package className="size-4" />, livre: true },
  { para: '/patrimonio/cadastro', rotulo: 'Cadastro', icone: <PackagePlus className="size-4" />, acao: 'editar' },
  { para: '/patrimonio/bens', rotulo: 'Consulta', icone: <PackageSearch className="size-4" />, livre: true },
  { para: '/patrimonio/por-coordenacao', rotulo: 'Por coordenação', icone: <Boxes className="size-4" /> },
  { para: '/patrimonio/por-unidade', rotulo: 'Por unidade', icone: <MapPin className="size-4" /> },
  { para: '/patrimonio/responsaveis', rotulo: 'Responsáveis', icone: <UserCheck className="size-4" /> },
  { para: '/patrimonio/movimentacoes', rotulo: 'Movimentações', icone: <ArrowLeftRight className="size-4" /> },
  { para: '/patrimonio/transferencias', rotulo: 'Transferências', icone: <Truck className="size-4" /> },
  { para: '/patrimonio/trocas', rotulo: 'Trocas', icone: <Repeat className="size-4" /> },
  { para: '/patrimonio/substituicoes', rotulo: 'Substituições', icone: <Replace className="size-4" /> },
  { para: '/patrimonio/inventario', rotulo: 'Inventário', icone: <ClipboardCheck className="size-4" /> },
  { para: '/patrimonio/pendencias', rotulo: 'Pendências', icone: <BellRing className="size-4" />, livre: true },
  { para: '/patrimonio/relatorios', rotulo: 'Relatórios', icone: <FileDown className="size-4" /> },
  { para: '/patrimonio/historico', rotulo: 'Histórico', icone: <History className="size-4" /> },
  { para: '/patrimonio/configuracoes', rotulo: 'Configurações', icone: <SlidersHorizontal className="size-4" /> },
];

export function ModuloPatrimonio({ children }: { children: ReactNode }) {
  const { pode } = useSessao();
  const local = useLocation();
  const barra = useRef<HTMLElement>(null);
  const modulos = pode('patrimonio', 'ler')
    ? MODULOS_PATRIMONIO.filter((m) => pode('patrimonio', m.acao ?? 'ler'))
    : MODULOS_PATRIMONIO.filter((m) => m.livre).map((m) => (m.para === '/patrimonio/bens' ? { ...m, para: '/patrimonio/bens?meus=1', rotulo: 'Meus bens' } : m));
  // a aba ativa fica sempre visível na barra (no celular ela rola na horizontal)
  useEffect(() => {
    barra.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [local.pathname]);
  return (
    <>
      <div className="mb-5 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <Package className="size-5 text-marca-700" />
          <h1 className="text-sm font-semibold uppercase tracking-wide text-marca-900">Gestão patrimonial</h1>
        </div>
        <nav ref={barra} aria-label="Módulos da gestão patrimonial" className="flex gap-1 overflow-x-auto px-2 py-2">
          {modulos.map((m) => (
            <NavLink key={m.para} to={m.para} end={m.para === '/patrimonio'}
              className={({ isActive }) => cx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                isActive ? 'bg-marca-700 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
              {m.icone}{m.rotulo}
            </NavLink>
          ))}
        </nav>
      </div>
      {children}
    </>
  );
}
