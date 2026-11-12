// Passo a passo do contrato, na ordem do fluxo de trabalho: responsáveis → dotação → empenho → nota fiscal.
// Cada etapa mostra se já foi feita; a próxima pendente fica em destaque com o botão que leva direto à ação.
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { Botao, cx } from '@/components/ui/basicos';
import { centavos } from '@/lib/formatacao';
import type { ContratoResumo } from '@/lib/tipos';
import { listarDesignacoes, listarDotacoesContrato } from '@/services/execucao';

export function EtapasContrato({ c, abaAtual, irParaAba }: { c: ContratoResumo; abaAtual: string; irParaAba: (aba: 'responsaveis' | 'dotacao') => void }) {
  const { pode, ehPlataforma } = useSessao();
  const navegar = useNavigate();
  const desig = useQuery({ queryKey: ['designacoes', c.id], queryFn: () => listarDesignacoes(c.id) });
  const dots = useQuery({ queryKey: ['contrato-dotacoes', c.id], queryFn: () => listarDotacoesContrato(c.id) });
  if (!desig.data || !dots.data || !c.ativo) return null;
  const temFiscal = desig.data.some((d) => !d.fim && d.papel === 'FISCAL');
  const etapas = [
    { titulo: 'Responsáveis', feito: temFiscal, detalhe: temFiscal ? 'Fiscal designado' : 'Designe gestor, fiscal e suplente',
      acao: (pode('contratos', 'editar') || ehPlataforma) && abaAtual !== 'responsaveis' ? { rotulo: 'Designar responsáveis', fazer: () => irParaAba('responsaveis') } : null },
    { titulo: 'Dotação', feito: dots.data.length > 0, detalhe: dots.data.length ? `${dots.data.length} dotação(ões)` : 'Escolha as classificações orçamentárias',
      acao: pode('contratos', 'editar') && abaAtual !== 'dotacao' ? { rotulo: 'Ir para a dotação', fazer: () => irParaAba('dotacao') } : null },
    { titulo: 'Empenho', feito: centavos(c.empenhado) > 0, detalhe: centavos(c.empenhado) > 0 ? 'Empenhado' : 'Lance a nota de empenho',
      acao: pode('empenhos', 'criar') ? { rotulo: 'Lançar empenho', fazer: () => navegar(`/empenhos?novo=1&contrato=${c.id}`) } : null },
    { titulo: 'Nota fiscal', feito: centavos(c.notas_valor) > 0, detalhe: centavos(c.notas_valor) > 0 ? 'Notas lançadas' : 'Lance a nota fiscal do mês',
      acao: pode('notas_fiscais', 'criar') ? { rotulo: centavos(c.notas_valor) > 0 ? 'Nova nota' : 'Lançar nota fiscal', fazer: () => navegar(`/notas?nova=1&contrato=${c.id}`) } : null },
  ];
  const proxima = etapas.findIndex((e) => !e.feito);
  return (
    <nav aria-label="Etapas do contrato" className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Etapas do contrato</p>
      <ol className="grid gap-2 sm:grid-cols-4">
        {etapas.map((e, i) => {
          const atual = i === proxima;
          return (
            <li key={e.titulo} aria-current={atual ? 'step' : undefined}
              className={cx('flex items-start gap-2.5 rounded-lg border p-2.5', e.feito ? 'border-emerald-200 bg-emerald-50/60' : atual ? 'border-amber-300 bg-amber-50' : 'border-slate-200')}>
              <span className={cx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                e.feito ? 'bg-emerald-600 text-white' : atual ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600')}>
                {e.feito ? <Check className="size-3.5" aria-label="feito" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{e.titulo}</span>
                <span className="block text-xs text-slate-600">{e.detalhe}</span>
                {e.acao && (atual || (i === 3 && e.feito)) && (
                  <Botao pequeno destaque={atual} variante={atual ? 'primario' : 'secundario'} className="mt-1.5" onClick={e.acao.fazer}>{e.acao.rotulo}</Botao>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
