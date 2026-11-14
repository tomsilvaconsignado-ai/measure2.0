// Sino de notificações: pendências calculadas no banco (atesto, vencimentos...) e as mensagens internas do
// CONECTA e do Patrimônio (comunicados, comentários, transferências a confirmar). Atualiza a cada 1-2 min.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BadgeCheck, CalendarClock, FileText, Wallet, Receipt, MessagesSquare, Package } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { cx } from '../ui/basicos';
import { minhasNotificacoes, type Notificacao } from '@/services/relatorios';
import { marcarMensagensLidas, minhasMensagens, type Mensagem } from '@/services/notificacoes';
import { formatarDataHora } from '@/lib/formatacao';

const ICONES: Record<Notificacao['tipo'], React.ReactNode> = {
  ATESTO: <BadgeCheck className="size-4 text-marca-700" />, VENCIMENTO: <CalendarClock className="size-4 text-amber-700" />,
  PAGAMENTO: <Receipt className="size-4 text-slate-600" />, SALDO: <Wallet className="size-4 text-amber-700" />,
};

export function Notificacoes() {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['notificacoes', orgao?.id], queryFn: () => minhasNotificacoes(orgao!.id), enabled: !!orgao, refetchInterval: 120_000 });
  const m = useQuery({ queryKey: ['mensagens', orgao?.id, null], queryFn: () => minhasMensagens(orgao!.id, null, 20), enabled: !!orgao, refetchInterval: 60_000 });
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  if (!orgao) return null;
  const itens = q.data ?? [];
  const mensagens = m.data?.itens ?? [];
  const naoLidas = m.data?.nao_lidas ?? 0;
  const altas = itens.filter((i) => i.severidade === 'alta').length;
  const total = itens.length + naoLidas;
  const abrirMensagem = async (msg: Mensagem) => {
    setAberto(false);
    if (!msg.lida_em) {
      await marcarMensagensLidas(orgao.id, [msg.id]).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ['mensagens'] });
    }
    if (msg.link) navegar(msg.link);
  };
  const lerTodas = async () => {
    await marcarMensagensLidas(orgao.id, null).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['mensagens'] });
  };
  return (
    <div className="relative" ref={caixa}>
      <button className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        aria-label={total ? `${total} notificações` : 'Notificações'}>
        <Bell className="size-5" />
        {total > 0 && <span className={cx('numero absolute -right-0.5 -top-0.5 min-w-5 rounded-full px-1 text-center text-[10px] font-semibold leading-5 text-white', altas ? 'bg-red-600' : 'bg-marca-600')}>{total > 9 ? '9+' : total}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-1 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="max-h-[70vh] overflow-y-auto">
            {mensagens.length > 0 && <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-800">Mensagens{naoLidas > 0 && <span className="ml-1.5 text-xs font-normal text-slate-500">({naoLidas} não lida{naoLidas > 1 ? 's' : ''})</span>}</p>
                {naoLidas > 0 && <button className="text-xs font-medium text-marca-700 hover:underline" onClick={() => void lerTodas()}>Marcar todas como lidas</button>}
              </div>
              <ul className="divide-y divide-slate-100">
                {mensagens.map((n) => (
                  <li key={n.id}><button onClick={() => void abrirMensagem(n)} className={cx('flex w-full gap-3 px-4 py-2.5 text-left hover:bg-slate-50', !n.lida_em && 'bg-marca-50/60')}>
                    <span className="mt-0.5">{n.modulo === 'CONECTA' ? <MessagesSquare className="size-4 text-marca-700" /> : n.modulo === 'CONTRATOS' ? <FileText className="size-4 text-marca-700" /> : <Package className="size-4 text-amber-700" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-sm text-slate-900', !n.lida_em && 'font-semibold')}>{n.titulo}</span>
                      {n.descricao && <span className="block truncate text-xs text-slate-500">{n.descricao}</span>}
                      <span className="block text-xs text-slate-500">{formatarDataHora(n.criado_em)}</span>
                    </span>
                    {!n.lida_em && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-marca-600" aria-label="não lida" />}
                  </button></li>
                ))}
              </ul>
            </>}
            <p className="border-y border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Pendências</p>
            {!itens.length ? <p className="px-4 py-6 text-center text-sm text-slate-500">Nada pendente por aqui.</p> : (
              <ul className="divide-y divide-slate-100">
                {itens.map((n, i) => (
                  <li key={i}><Link to={n.link} onClick={() => setAberto(false)} className="flex gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="mt-0.5">{ICONES[n.tipo]}</span>
                    <span className="min-w-0"><span className="block text-sm font-medium text-slate-900">{n.titulo}</span><span className="block truncate text-xs text-slate-500">{n.descricao}</span></span>
                  </Link></li>
                ))}
              </ul>
            )}
          </div>
          <Link to="/minhas-notificacoes" onClick={() => setAberto(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-marca-700 hover:bg-slate-50">Ver todas, filtrar e configurar o PUSH</Link>
        </div>
      )}
    </div>
  );
}
