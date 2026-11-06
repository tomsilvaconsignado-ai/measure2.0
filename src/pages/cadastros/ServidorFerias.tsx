// Histórico de férias do servidor: vários registros ao longo da vida funcional, situação calculada
// (pendente, programada, em gozo, gozada), sem apagar nada — o cancelamento fica registrado com motivo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AreaTexto, Botao, CaixaErro, Campo, Carregando, Selo, cx } from '@/components/ui/basicos';
import { ConfirmarComMotivo, Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarData, formatarDataHora } from '@/lib/formatacao';
import type { FeriasServidor, SituacaoFerias } from '@/lib/tipos';
import { cancelarFerias, listarFerias, salvarFerias } from '@/services/cadastros';

export const SITUACAO_FERIAS: Record<SituacaoFerias, { rotulo: string; tom: 'neutro' | 'sucesso' | 'alerta' | 'info' | 'marca' }> = {
  PENDENTE: { rotulo: 'Pendente', tom: 'alerta' },
  PROGRAMADA: { rotulo: 'Programada', tom: 'info' },
  EM_GOZO: { rotulo: 'Em gozo', tom: 'marca' },
  GOZADA: { rotulo: 'Gozada', tom: 'sucesso' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'neutro' },
};

const diasEntre = (ini: string, fim: string) => Math.round((Date.parse(fim) - Date.parse(ini)) / 86_400_000) + 1;
/** Fim do período aquisitivo sugerido: um ano depois do início, menos um dia */
const umAnoDepois = (ini: string) => {
  const d = new Date(`${ini}T12:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

interface Form { aquisitivo_inicio: string; aquisitivo_fim: string; gozo_inicio: string; gozo_fim: string; observacoes: string }
const vazio: Form = { aquisitivo_inicio: '', aquisitivo_fim: '', gozo_inicio: '', gozo_fim: '', observacoes: '' };

function FormFerias({ servidorId, registro, aberto, aoFechar }: { servidorId: string; registro: FeriasServidor | null; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF(registro ? { aquisitivo_inicio: registro.aquisitivo_inicio, aquisitivo_fim: registro.aquisitivo_fim, gozo_inicio: registro.gozo_inicio ?? '',
      gozo_fim: registro.gozo_fim ?? '', observacoes: registro.observacoes ?? '' } : vazio);
  }, [aberto, registro]);
  const dias = f.gozo_inicio && f.gozo_fim && f.gozo_fim >= f.gozo_inicio ? diasEntre(f.gozo_inicio, f.gozo_fim) : null;
  const salvar = useMutation({
    mutationFn: () => salvarFerias(registro?.id ?? null, {
      servidor_id: servidorId, aquisitivo_inicio: f.aquisitivo_inicio, aquisitivo_fim: f.aquisitivo_fim,
      gozo_inicio: f.gozo_inicio || null, gozo_fim: f.gozo_fim || null, observacoes: f.observacoes.trim() || null,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ferias', servidorId] }); await qc.invalidateQueries({ queryKey: ['consolidado'] });
      toast.success(registro ? 'Férias atualizadas.' : 'Férias registradas.'); aoFechar();
    },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.aquisitivo_inicio) n.aquisitivo_inicio = 'Informe o início do período aquisitivo.';
    if (!f.aquisitivo_fim) n.aquisitivo_fim = 'Informe o fim do período aquisitivo.';
    else if (f.aquisitivo_inicio && f.aquisitivo_fim <= f.aquisitivo_inicio) n.aquisitivo_fim = 'O fim precisa ser depois do início.';
    if (!!f.gozo_inicio !== !!f.gozo_fim) n[f.gozo_inicio ? 'gozo_fim' : 'gozo_inicio'] = 'Informe o início e o fim do gozo (ou deixe os dois vazios se ainda estiver pendente).';
    else if (f.gozo_inicio && f.gozo_fim < f.gozo_inicio) n.gozo_fim = 'O fim do gozo não pode ser antes do início.';
    else if (dias && dias > 60) n.gozo_fim = `Período de ${dias} dias: o máximo por registro é 60.`;
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={registro ? 'Editar férias' : 'Registrar férias'} largura="md"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-ferias" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-ferias" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <p className="text-sm font-medium text-slate-800 sm:col-span-2">Período aquisitivo</p>
        <Campo rotulo="Início" obrigatorio type="date" value={f.aquisitivo_inicio} erro={erros.aquisitivo_inicio}
          onChange={(e) => { const v = e.target.value; setF((x) => ({ ...x, aquisitivo_inicio: v, aquisitivo_fim: x.aquisitivo_fim || (v ? umAnoDepois(v) : '') })); }} />
        <Campo rotulo="Fim" obrigatorio type="date" value={f.aquisitivo_fim} erro={erros.aquisitivo_fim} onChange={(e) => setF({ ...f, aquisitivo_fim: e.target.value })} />
        <p className="text-sm font-medium text-slate-800 sm:col-span-2">Período de gozo <span className="font-normal text-slate-500">(vazio = férias pendentes)</span></p>
        <Campo rotulo="Início do gozo" type="date" value={f.gozo_inicio} erro={erros.gozo_inicio} onChange={(e) => setF({ ...f, gozo_inicio: e.target.value })} />
        <Campo rotulo="Fim do gozo" type="date" value={f.gozo_fim} erro={erros.gozo_fim} onChange={(e) => setF({ ...f, gozo_fim: e.target.value })}
          ajuda={dias ? `${dias} dia(s) de férias.` : 'Para férias em parcelas, registre cada parcela separadamente.'} />
        <AreaTexto className="sm:col-span-2" rotulo="Observações" value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} maxLength={1000} rows={2} />
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

export function ServidorFerias({ servidorId, podeEditar }: { servidorId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ferias', servidorId], queryFn: () => listarFerias(servidorId) });
  const [editando, setEditando] = useState<FeriasServidor | null | 'novo'>(null);
  const [cancelando, setCancelando] = useState<FeriasServidor | null>(null);
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} />;
  const lista = q.data!;
  const conta = (s: SituacaoFerias) => lista.filter((f) => f.situacao === s).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['GOZADA', 'EM_GOZO', 'PROGRAMADA', 'PENDENTE'] as const).map((s) => (
            <Selo key={s} tom={SITUACAO_FERIAS[s].tom}>{SITUACAO_FERIAS[s].rotulo}: {conta(s)}</Selo>
          ))}
        </div>
        {podeEditar && <Botao pequeno icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>Registrar férias</Botao>}
      </div>
      {!lista.length ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nenhuma férias registrada.</p> : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {lista.map((f) => (
            <li key={f.id} className={cx('flex flex-wrap items-start gap-2 px-3 py-2.5 text-sm', f.situacao === 'CANCELADA' && 'bg-slate-50 text-slate-500')}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                  {f.gozo_inicio ? `${formatarData(f.gozo_inicio)} a ${formatarData(f.gozo_fim)}` : 'Gozo não programado'}
                  {f.dias ? <span className="font-normal text-slate-600">· {f.dias} dia(s)</span> : null}
                  <Selo tom={SITUACAO_FERIAS[f.situacao].tom}>{SITUACAO_FERIAS[f.situacao].rotulo}</Selo>
                </p>
                <p className="text-xs text-slate-500">Aquisitivo {formatarData(f.aquisitivo_inicio)} a {formatarData(f.aquisitivo_fim)} · registrado em {formatarDataHora(f.criado_em)}{f.registrado_por_nome ? ` por ${f.registrado_por_nome}` : ''}</p>
                {f.observacoes && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">{f.observacoes}</p>}
                {f.cancelada_em && <p className="mt-0.5 text-xs text-slate-600">Cancelada em {formatarDataHora(f.cancelada_em)}{f.cancelada_por_nome ? ` por ${f.cancelada_por_nome}` : ''}: {f.motivo_cancelamento}</p>}
              </div>
              {podeEditar && f.situacao !== 'CANCELADA' && <>
                <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar férias" onClick={() => setEditando(f)} />
                <Botao pequeno variante="fantasma" icone={<Ban className="size-4 text-red-600" />} aria-label="Cancelar férias" onClick={() => setCancelando(f)} />
              </>}
            </li>
          ))}
        </ul>
      )}
      <FormFerias servidorId={servidorId} registro={editando === 'novo' ? null : editando} aberto={editando !== null} aoFechar={() => setEditando(null)} />
      <ConfirmarComMotivo aberto={!!cancelando} aoFechar={() => setCancelando(null)} titulo="Cancelar estas férias?"
        descricao="O registro continua no histórico, marcado como cancelado, com o motivo e quem cancelou. As datas ficam livres para uma nova programação."
        rotuloConfirmar="Cancelar férias"
        aoConfirmar={async (m) => { await cancelarFerias(cancelando!.id, m); await qc.invalidateQueries({ queryKey: ['ferias', servidorId] }); await qc.invalidateQueries({ queryKey: ['consolidado'] }); toast.success('Férias canceladas.'); }} />
    </div>
  );
}
