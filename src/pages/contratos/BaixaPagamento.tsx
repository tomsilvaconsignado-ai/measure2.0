// Baixa do pagamento de uma nota atestada: valor bruto, retenções (ISS, IRRF, INSS, PIS/COFINS/CSLL, outras),
// líquido calculado na hora, data, documento e, se a nota furar a fila da ordem cronológica, a justificativa (art. 141).
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CampoMoeda } from '@/components/ui/CampoMoeda';
import { AreaTexto, Botao, CaixaErro, Campo } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { decimalDeCentavos, formatarCentavos } from '@/lib/formatacao';
import { baixarPagamento } from '@/services/execucao';

const hoje = () => new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });

const RETENCOES = [
  { id: 'iss', rotulo: 'ISS', ajuda: 'Imposto municipal sobre serviços' },
  { id: 'irrf', rotulo: 'IRRF', ajuda: 'Imposto de renda retido na fonte' },
  { id: 'inss', rotulo: 'INSS', ajuda: 'Retenção previdenciária (cessão de mão de obra)' },
  { id: 'federais', rotulo: 'PIS/COFINS/CSLL', ajuda: 'Contribuições federais retidas' },
  { id: 'outras', rotulo: 'Outras retenções', ajuda: 'Multa, glosa ou outro desconto' },
] as const;
type IdRetencao = typeof RETENCOES[number]['id'];

export interface NotaParaBaixa {
  id: string; rotulo: string; fornecedor: string; restanteCentavos: number;
  /** posição na fila da fonte de recurso (1 = a próxima a pagar) */
  posicao?: number | null;
}

export function BaixaPagamento({ nota, aoFechar, aoConcluir }: { nota: NotaParaBaixa | null; aoFechar: () => void; aoConcluir: () => void | Promise<void> }) {
  const [data, setData] = useState(hoje());
  const [bruto, setBruto] = useState<number | null>(null);
  const [ret, setRet] = useState<Record<IdRetencao, number | null>>({ iss: null, irrf: null, inss: null, federais: null, outras: null });
  const [outrasDescricao, setOutrasDescricao] = useState('');
  const [documento, setDocumento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [pedirJustificativa, setPedirJustificativa] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; campo?: string } | null>(null);

  useEffect(() => {
    if (!nota) return;
    setData(hoje()); setBruto(nota.restanteCentavos); setRet({ iss: null, irrf: null, inss: null, federais: null, outras: null });
    setOutrasDescricao(''); setDocumento(''); setObservacao(''); setJustificativa(''); setErro(null);
    setPedirJustificativa((nota.posicao ?? 1) > 1);
  }, [nota]);

  const retido = RETENCOES.reduce((s, r) => s + (ret[r.id] ?? 0), 0);
  const liquido = (bruto ?? 0) - retido;
  const excedeRestante = !!nota && (bruto ?? 0) > nota.restanteCentavos;
  const retencaoMaior = retido > (bruto ?? 0);

  const baixar = useMutation({
    mutationFn: () => baixarPagamento({
      nota_id: nota!.id, data_pagamento: data, valor: decimalDeCentavos(bruto!),
      documento: documento.trim() || null, observacao: observacao.trim() || null,
      justificativa_ordem: pedirJustificativa ? justificativa.trim() || null : null,
      retencoes: {
        iss: decimalDeCentavos(ret.iss ?? 0), irrf: decimalDeCentavos(ret.irrf ?? 0), inss: decimalDeCentavos(ret.inss ?? 0),
        federais: decimalDeCentavos(ret.federais ?? 0), outras: decimalDeCentavos(ret.outras ?? 0),
        outras_descricao: ret.outras ? outrasDescricao.trim() || null : null,
      },
    }),
    onSuccess: async () => { toast.success(`Baixa registrada: líquido de ${formatarCentavos(liquido)}.`); await aoConcluir(); aoFechar(); },
    onError: (e) => {
      const t = traduzirErro(e);
      if (t.campo === 'justificativa_ordem') setPedirJustificativa(true);
      setErro(t);
    },
  });

  const erroDe = (campo: string) => (erro?.campo === campo ? erro.mensagem : null);
  const pronto = !!bruto && bruto > 0 && !!data && !excedeRestante && !retencaoMaior
    && (!ret.outras || outrasDescricao.trim().length > 0) && (!pedirJustificativa || justificativa.trim().length >= 15);

  return (
    <Modal aberto={!!nota} aoFechar={aoFechar} titulo="Dar baixa no pagamento" descricao={nota ? `Nota ${nota.rotulo} · ${nota.fornecedor}` : undefined} largura="md"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={baixar.isPending} disabled={!pronto} onClick={() => { setErro(null); baixar.mutate(); }}>Registrar baixa</Botao></>}>
      {nota && <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoMoeda rotulo="Valor bruto pago" obrigatorio centavos={bruto} aoMudar={setBruto}
            erro={excedeRestante ? `Maior que o restante da nota (${formatarCentavos(nota.restanteCentavos)}).` : erroDe('valor')}
            ajuda={`Restante da nota: ${formatarCentavos(nota.restanteCentavos)}. Valor menor = pagamento parcial.`} />
          <Campo rotulo="Data do pagamento" obrigatorio type="date" max={hoje()} value={data} onChange={(e) => setData(e.target.value)} erro={erroDe('data_pagamento')} />
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Retenções (deduções na fonte)</legend>
          <p className="mb-3 text-xs text-slate-500">Informe os valores descontados na ordem bancária. A nota é quitada pelo valor bruto: o retido é pago ao fisco em nome da empresa.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {RETENCOES.map((r) => (
              <CampoMoeda key={r.id} rotulo={r.rotulo} centavos={ret[r.id]} aoMudar={(v) => setRet({ ...ret, [r.id]: v })} ajuda={r.ajuda} />
            ))}
            {!!ret.outras && <Campo rotulo="Descrição das outras retenções" obrigatorio value={outrasDescricao} maxLength={200}
              onChange={(e) => setOutrasDescricao(e.target.value)} erro={erroDe('outras_descricao')} />}
          </div>
          {erroDe('retencoes') && <p className="mt-2 text-xs text-red-700" role="alert">{erroDe('retencoes')}</p>}
        </fieldset>

        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-sm" aria-live="polite">
          <div><dt className="text-xs text-slate-500">Bruto</dt><dd className="numero font-medium">{formatarCentavos(bruto ?? 0)}</dd></div>
          <div><dt className="text-xs text-slate-500">Retido</dt><dd className="numero font-medium">− {formatarCentavos(retido)}</dd></div>
          <div><dt className="text-xs text-slate-500">Líquido à empresa</dt><dd className={retencaoMaior ? 'numero font-semibold text-red-700' : 'numero font-semibold text-emerald-800'}>{formatarCentavos(liquido)}</dd></div>
        </dl>
        {retencaoMaior && <p className="-mt-2 text-xs text-red-700" role="alert">As retenções passam do valor bruto.</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Documento (OB, comprovante)" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={60} />
          <AreaTexto rotulo="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} rows={2} />
        </div>

        {pedirJustificativa && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-xs text-amber-950">
            {(nota.posicao ?? 0) > 1 ? `Esta nota é a ${nota.posicao}ª da fila da sua fonte de recurso. ` : 'Há notas atestadas antes desta, na mesma fonte de recurso, ainda sem pagamento. '}
            Pagar fora da ordem cronológica só é permitido nas hipóteses da lei, com justificativa prévia da autoridade competente, comunicada ao controle interno e ao tribunal de contas e divulgada mensalmente no site do órgão (Lei 14.133/2021, art. 141, §§ 1º e 3º).
          </p>
          <AreaTexto rotulo="Justificativa da quebra da ordem cronológica" obrigatorio value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
            maxLength={1000} rows={3} erro={erroDe('justificativa_ordem')} ajuda="Mínimo de 15 caracteres. Hipóteses do § 1º: grave perturbação da ordem, emergência ou calamidade; microempresa/EPP/MEI/cooperativa com risco de descontinuidade; sistemas estruturantes; falência ou recuperação judicial da contratada; objeto imprescindível ao patrimônio ou à atividade-fim." />
        </div>}

        {erro && !['valor', 'data_pagamento', 'retencoes', 'outras_descricao', 'justificativa_ordem'].includes(erro.campo ?? '') && <CaixaErro mensagem={erro.mensagem} />}
      </div>}
    </Modal>
  );
}
