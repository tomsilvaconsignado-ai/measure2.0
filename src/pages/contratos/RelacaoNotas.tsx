// Imprimir relação de notas: escolhe a situação (não pagas, pagas, faltando atesto ou todas) e o filtro
// (um contrato ou uma empresa). Emite o documento e abre a página de impressão ("Imprimir / salvar PDF").
import { useMutation } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botao, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { emitirRelacaoNotas } from '@/services/execucao';
import { SITUACOES_RELACAO, type SituacaoRelacao } from './ImprimirRelacaoNotas';
import { SeletorContrato, SeletorFornecedor } from './comum';

type Escolha = { id: string; rotulo: string } | null;

export function RelacaoNotas({ aberto, aoFechar, contratoInicial }: { aberto: boolean; aoFechar: () => void; contratoInicial?: Escolha }) {
  const navegar = useNavigate();
  const [situacao, setSituacao] = useState<SituacaoRelacao>('NAO_PAGAS');
  const [por, setPor] = useState<'CONTRATO' | 'EMPRESA'>('CONTRATO');
  const [contrato, setContrato] = useState<Escolha>(contratoInicial ?? null);
  const [empresa, setEmpresa] = useState<Escolha>(null);
  const [erro, setErro] = useState<string | null>(null);
  const escolhido = por === 'CONTRATO' ? contrato : empresa;
  const emitir = useMutation({
    mutationFn: () => emitirRelacaoNotas(situacao, por === 'CONTRATO' ? { contratoId: contrato!.id } : { fornecedorId: empresa!.id }),
    onSuccess: (id) => navegar(`/imprimir/${id}`),
    onError: (e) => setErro(traduzirErro(e).mensagem),
  });
  const gerar = () => {
    if (!escolhido) { setErro(por === 'CONTRATO' ? 'Escolha o contrato.' : 'Escolha a empresa.'); return; }
    setErro(null);
    emitir.mutate();
  };
  const opcao = (ativo: boolean) => cx('rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer',
    ativo ? 'border-marca-600 bg-marca-50 text-marca-900 ring-1 ring-marca-600' : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50');

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Imprimir relação de notas"
      descricao="Lista simples para responder ao fornecedor: nota, processo, valor, fornecedor, contrato, valor pago e data do pagamento."
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao icone={<Printer className="size-4" />} carregando={emitir.isPending} onClick={gerar}>Gerar relação</Botao>
      </>}>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-medium text-slate-900">Quais notas</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Situação das notas">
          {(Object.keys(SITUACOES_RELACAO) as SituacaoRelacao[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={situacao === s} className={opcao(situacao === s)} onClick={() => setSituacao(s)}>
              <span className="block font-medium">{SITUACOES_RELACAO[s].rotulo}</span>
              <span className="block text-xs text-slate-500">{SITUACOES_RELACAO[s].explicacao}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-900">De qual contrato ou empresa</legend>
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 p-0.5" role="radiogroup" aria-label="Filtrar por">
          {([['CONTRATO', 'Por contrato'], ['EMPRESA', 'Por empresa']] as const).map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={por === v} onClick={() => { setPor(v); setErro(null); }}
              className={cx('rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer', por === v ? 'bg-marca-600 text-white' : 'text-slate-600 hover:text-slate-900')}>{r}</button>
          ))}
        </div>
        {por === 'CONTRATO'
          ? <SeletorContrato valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} erro={erro && !contrato ? erro : null}
              aoMudar={(v, o) => { setContrato(v && o ? { id: v, rotulo: o.rotulo } : null); setErro(null); }} />
          : <SeletorFornecedor valor={empresa?.id ?? null} rotuloValor={empresa?.rotulo} erro={erro && !empresa ? erro : null}
              aoMudar={(v, o) => { setEmpresa(v && o ? { id: v, rotulo: o.rotulo } : null); setErro(null); }} />}
        {por === 'EMPRESA' && <p className="mt-1.5 text-xs text-slate-500">Junta as notas de todos os contratos dessa empresa que você pode consultar.</p>}
      </fieldset>
      {erro && escolhido && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
    </Modal>
  );
}
