// Sino de notificações: pendências calculadas no banco para quem está logado (atualiza a cada 2 min).
import { useQuery } from '@tanstack/react-query';
import { Bell, BadgeCheck, CalendarClock, Wallet, Receipt } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { cx } from '../ui/basicos';
import { minhasNotificacoes, type Notificacao } from '@/services/relatorios';

const ICONES: Record<Notificacao['tipo'], React.ReactNode> = {
  ATESTO: <BadgeCheck className="size-4 text-marca-700" />, VENCIMENTO: <CalendarClock className="size-4 text-amber-700" />,
  PAGAMENTO: <Receipt className="size-4 text-slate-600" />, SALDO: <Wallet className="size-4 text-amber-700" />,
};

export function Notificacoes() {
  const { orgao } = useSessao();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['notificacoes', orgao?.id], queryFn: () => minhasNotificacoes(orgao!.id), enabled: !!orgao, refetchInterval: 120_000 });
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  if (!orgao) return null;
  const itens = q.data ?? [];
  const altas = itens.filter((i) => i.severidade === 'alta').length;
  return (
    <div className="relative" ref={caixa}>
      <button className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        aria-label={itens.length ? `${itens.length} notificações` : 'Notificações'}>
        <Bell className="size-5" />
        {itens.length > 0 && <span className={cx('numero absolute -right-0.5 -top-0.5 min-w-5 rounded-full px-1 text-center text-[10px] font-semibold leading-5 text-white', altas ? 'bg-red-600' : 'bg-marca-600')}>{itens.length > 9 ? '9+' : itens.length}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-1 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
          <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Pendências</p>
          {!itens.length ? <p className="px-4 py-6 text-center text-sm text-slate-500">Nada pendente por aqui.</p> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {itens.map((n, i) => (
                <li key={i}><Link to={n.link} onClick={() => setAberto(false)} className="flex gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="mt-0.5">{ICONES[n.tipo]}</span>
                  <span className="min-w-0"><span className="block text-sm font-medium text-slate-900">{n.titulo}</span><span className="block truncate text-xs text-slate-500">{n.descricao}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
