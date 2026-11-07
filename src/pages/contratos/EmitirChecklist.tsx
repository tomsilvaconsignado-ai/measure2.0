// Emissão do checklist da nota no modelo da SMS: os dados da nota e do contrato vêm do sistema; aqui a pessoa
// confere os itens SIM/NÃO (já vêm como no modelo), a declaração, o nº de funcionários e quem assina.
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Botao, CaixaErro, Campo, Carregando, Selecao, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import type { ItemChecklist, Marca } from '@/lib/checklist';
import { mensagemDeErro } from '@/lib/erros';
import { brl, formatarData } from '@/lib/formatacao';
import type { NotaResumo } from '@/lib/tipos';
import { emitirChecklist, itensChecklist } from '@/services/consolidado';
import { listarDesignacoes } from '@/services/execucao';

const PAPEL = { FISCAL: 'Fiscal do contrato', GESTOR: 'Gestor do contrato', SUPLENTE: 'Suplente de fiscal' } as const;
const ORDEM = { FISCAL: 1, GESTOR: 2, SUPLENTE: 3 } as const;

function BotaoMarca({ ativo, rotulo, aoClicar }: { ativo: boolean; rotulo: string; aoClicar: () => void }) {
  return (
    <button type="button" onClick={aoClicar} aria-pressed={ativo} aria-label={rotulo}
      className={cx('flex size-8 items-center justify-center rounded-md border text-sm font-bold transition-colors',
        ativo ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-300 bg-white text-slate-400 hover:bg-slate-50')}>
      {ativo ? 'X' : '-'}
    </button>
  );
}

export function EmitirChecklist({ nota, aberto, aoFechar, aoEmitir }: { nota: NotaResumo; aberto: boolean; aoFechar: () => void; aoEmitir: () => Promise<void> }) {
  const navegar = useNavigate();
  const modelo = useQuery({ queryKey: ['checklist-itens', nota.tenant_id], queryFn: () => itensChecklist(nota.tenant_id), enabled: aberto });
  const desig = useQuery({ queryKey: ['designacoes', nota.contrato_id], queryFn: () => listarDesignacoes(nota.contrato_id), enabled: aberto });
  const [itens, setItens] = useState<ItemChecklist[]>([]);
  const [funcionarios, setFuncionarios] = useState('');
  const [pendente, setPendente] = useState(false);
  const [designacao, setDesignacao] = useState('');

  useEffect(() => { if (aberto && modelo.data) setItens(modelo.data.itens.map((i) => ({ ...i }))); }, [aberto, modelo.data]);
  useEffect(() => { if (aberto) { setFuncionarios(''); setPendente(false); } }, [aberto]);
  const vigentes = [...(desig.data ?? [])].filter((d) => !d.fim).sort((a, b) => ORDEM[a.papel] - ORDEM[b.papel]);
  // padrão: o fiscal do contrato (se não houver, o gestor e depois o suplente)
  useEffect(() => { if (aberto && desig.data) setDesignacao(vigentes[0]?.id ?? ''); }, [aberto, desig.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const marcar = (k: number, marca: Marca) => setItens((l) => l.map((i, j) => (j === k ? { ...i, marca: i.marca === marca ? null : marca } : i)));
  const emitir = useMutation({
    mutationFn: () => emitirChecklist(nota.id, { itens, funcionarios: funcionarios.trim() || null, nota_pendente: pendente, designacao_id: designacao || null }),
    onSuccess: async (id) => { await aoEmitir(); aoFechar(); navegar(`/imprimir/${id}`); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const escolhido = vigentes.find((d) => d.id === designacao);

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Emitir checklist da nota fiscal" largura="lg"
      descricao="Os dados da nota e do contrato são preenchidos pelo sistema. Confira os itens e quem assina."
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao icone={<ClipboardCheck className="size-4" />} carregando={emitir.isPending} disabled={!itens.length} onClick={() => emitir.mutate()}>Emitir e imprimir</Botao></>}>
      {modelo.isLoading || desig.isLoading ? <Carregando /> : modelo.isError ? <CaixaErro mensagem={mensagemDeErro(modelo.error)} /> : (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Contrato / contratada</dt><dd>{nota.contrato_numero} · {nota.fornecedor_nome}</dd></div>
            <div><dt className="text-xs text-slate-500">Nota fiscal / valor bruto</dt><dd>Nº {nota.numero}{nota.serie ? `-${nota.serie}` : ''} · {brl(nota.valor)}</dd></div>
            <div><dt className="text-xs text-slate-500">Mês de referência</dt><dd>{nota.meses_referencia || '—'}</dd></div>
            <div><dt className="text-xs text-slate-500">Apresentação da NF</dt><dd>{new Date(nota.data_inclusao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Período de execução</dt>
              <dd>{nota.periodo_inicio ? `${formatarData(nota.periodo_inicio)} a ${formatarData(nota.periodo_fim)}` : 'do 1º ao último dia do(s) mês(es) de referência'}</dd></div>
          </dl>

          <Campo rotulo="Funcionários nº" inputMode="numeric" value={funcionarios} onChange={(e) => setFuncionarios(e.target.value)} maxLength={10}
            ajuda="Opcional: quantidade de empregados terceirizados no serviço." className="max-w-xs" />

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
                <th className="w-10 px-2 py-2 font-medium">Ord.</th><th className="px-2 py-2 font-medium">Itens</th>
                <th className="w-12 px-1 py-2 text-center font-medium">Sim</th><th className="w-12 px-1 py-2 text-center font-medium">Não</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((i, k) => (
                  <tr key={k}>
                    <td className="px-2 py-1.5 text-center text-slate-500">{k + 1}</td>
                    <td className="px-2 py-1.5">{i.descricao}</td>
                    <td className="px-1 py-1.5"><div className="flex justify-center"><BotaoMarca ativo={i.marca === 'SIM'} rotulo={`Sim: ${i.descricao}`} aoClicar={() => marcar(k, 'SIM')} /></div></td>
                    <td className="px-1 py-1.5"><div className="flex justify-center"><BotaoMarca ativo={i.marca === 'NAO'} rotulo={`Não: ${i.descricao}`} aoClicar={() => marcar(k, 'NAO')} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="-mt-2 text-xs text-slate-500">Os itens já vêm marcados como no modelo do órgão. Clique para marcar ou desmarcar; item sem marcação sai com "-".</p>

          <fieldset className="rounded-lg border border-slate-200 p-3 text-sm">
            <legend className="px-1 font-medium text-slate-800">Observações</legend>
            <p className="mb-2 text-slate-700">Declaro que existe nota fiscal posterior pendente de faturamento ou entrega relacionada ao mês de referência?</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="radio" name="pendente" className="size-4 accent-marca-700" checked={!pendente} onChange={() => setPendente(false)} />( X ) não existe</label>
              <label className="flex items-center gap-2"><input type="radio" name="pendente" className="size-4 accent-marca-700" checked={pendente} onChange={() => setPendente(true)} />( X ) existe</label>
            </div>
          </fieldset>

          <div>
            <Selecao rotulo="Quem assina" value={designacao} onChange={(e) => setDesignacao(e.target.value)} disabled={!vigentes.length}
              ajuda={!vigentes.length ? 'O contrato não tem gestor, fiscal ou suplente designado: o campo sai em branco para preencher à mão.' : 'Padrão: o fiscal do contrato. Troque para o gestor ou o suplente quando necessário.'}>
              {!vigentes.length && <option value="">Ninguém designado</option>}
              {vigentes.map((d) => <option key={d.id} value={d.id}>{PAPEL[d.papel]}: {d.servidor_nome} (mat. {d.servidor_matricula})</option>)}
            </Selecao>
            {escolhido && <p className="mt-1 text-xs text-slate-500">No formulário: "{PAPEL[escolhido.papel].toUpperCase()}: {escolhido.servidor_nome}" · matrícula {escolhido.servidor_matricula}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
