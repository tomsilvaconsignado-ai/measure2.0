// Servidores numa entrada só do menu: o cadastro e o consolidado mensal ficam em abas dentro do módulo.
import { CalendarCheck, UserCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cx } from '@/components/ui/basicos';

const ABAS = [
  { para: '/servidores', rotulo: 'Cadastro de servidores', icone: <UserCircle className="size-4" /> },
  { para: '/servidores/consolidado', rotulo: 'Consolidado mensal', icone: <CalendarCheck className="size-4" /> },
];

export function ModuloServidores({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="Módulos de servidores" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        {ABAS.map((a) => (
          <NavLink key={a.para} to={a.para} end
            className={({ isActive }) => cx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
              isActive ? 'bg-marca-700 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
            {a.icone}{a.rotulo}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}
