// Imprimir relação de notas: escolhe a situação (não pagas, pagas, faltando atesto ou todas) e o filtro
// (um contrato, uma empresa ou todos os contratos do órgão) e, se quiser, o período (ano e meses, pela data de emissão da nota).
// Emite o documento e abre a página de impressão ("Imprimir / salvar PDF").
import { useMutation } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { Botao, Selecao, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { periodoDe } from '@/lib/relacaoNotas';
import { emitirRelacaoNotas } from '@/services/execucao';
import { SITUACOES_RELACAO, type SituacaoRelacao } from './ImprimirRelacaoNotas';
import { SeletorContrato, SeletorFornecedor } from './comum';

type Escolha = { id: string; rotulo: string } | null;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ANO_ATUAL = Number(new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }).slice(0, 4));
const ANOS = Array.from({ length: 10 }, (_, i) => ANO_ATUAL + 1 - i);

export function RelacaoNotas({ aberto, aoFechar, contratoInicial }: { aberto: boolean; aoFechar: () => void; contratoInicial?: Escolha }) {
  const navegar = useNavigate();
  const { orgao } = useSessao();
  const [situacao, setSituacao] = useState<SituacaoRelacao>('NAO_PAGAS');
  const [por, setPor] = useState<'CONTRATO' | 'EMPRESA' | 'TODOS'>('CONTRATO');
  const [contrato, setContrato] = useState<Escolha>(contratoInicial ?? null);
  const [empresa, setEmpresa] = useState<Escolha>(null);
  const [erro, setErro] = useState<string | null>(null);
  // período: "todos os anos" por padrão (nada some da relação sem querer); escolhendo o ano, os meses aparecem
  const [ano, setAno] = useState<number | null>(null);
  const [mesDe, setMesDe] = useState(1);
  const [mesAte, setMesAte] = useState(12);
  const periodoInvertido = ano !== null && mesDe > mesAte;
  const escolhido = por === 'CONTRATO' ? contrato : por === 'EMPRESA' ? empresa : null;
  const emitir = useMutation({
    mutationFn: () => emitirRelacaoNotas(situacao,
      por === 'CONTRATO' ? { contratoId: contrato!.id } : por === 'EMPRESA' ? { fornecedorId: empresa!.id } : { todosDoOrgao: orgao!.id },
      ano === null ? null : periodoDe(ano, mesDe, mesAte)),
    onSuccess: (id) => navegar(`/imprimir/${id}`),
    onError: (e) => setErro(traduzirErro(e).mensagem),
  });
  const gerar = () => {
    if (por !== 'TODOS' && !escolhido) { setErro(por === 'CONTRATO' ? 'Escolha o contrato.' : 'Escolha a empresa.'); return; }
    if (periodoInvertido) return;
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
        <legend className="mb-1.5 text-sm font-medium text-slate-900">De quais contratos</legend>
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 p-0.5" role="radiogroup" aria-label="Filtrar por">
          {([['CONTRATO', 'Um contrato'], ['EMPRESA', 'Uma empresa'], ['TODOS', 'Todos']] as const).map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={por === v} onClick={() => { setPor(v); setErro(null); }}
              className={cx('rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer', por === v ? 'bg-marca-600 text-white' : 'text-slate-600 hover:text-slate-900')}>{r}</button>
          ))}
        </div>
        {por === 'TODOS' ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <b>Todos os contratos e todas as empresas</b> que você pode consultar neste órgão, agrupados por empresa.
          </p>
        ) : por === 'CONTRATO'
          ? <SeletorContrato valor={contrato?.id ?? null} rotuloValor={contrato?.rotulo} erro={erro && !contrato ? erro : null}
              aoMudar={(v, o) => { setContrato(v && o ? { id: v, rotulo: o.rotulo } : null); setErro(null); }} />
          : <SeletorFornecedor valor={empresa?.id ?? null} rotuloValor={empresa?.rotulo} erro={erro && !empresa ? erro : null}
              aoMudar={(v, o) => { setEmpresa(v && o ? { id: v, rotulo: o.rotulo } : null); setErro(null); }} />}
        {por === 'EMPRESA' && <p className="mt-1.5 text-xs text-slate-500">Junta as notas de todos os contratos dessa empresa que você pode consultar.</p>}
      </fieldset>
      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-medium text-slate-900">Período <span className="font-normal text-slate-500">(pela data de emissão da nota)</span></legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Selecao rotulo="Ano" value={ano ?? ''} onChange={(e) => setAno(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todos os anos</option>
            {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Selecao>
          {ano !== null && <>
            <Selecao rotulo="De" value={mesDe} onChange={(e) => setMesDe(Number(e.target.value))} erro={periodoInvertido ? 'Depois do mês final' : undefined}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Selecao>
            <Selecao rotulo="Até" value={mesAte} onChange={(e) => setMesAte(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Selecao>
          </>}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {ano === null ? 'Sem período: entram notas de qualquer data.'
            : mesDe === mesAte ? `Notas emitidas em ${MESES[mesDe - 1]!.toLowerCase()} de ${ano}.`
              : periodoInvertido ? 'O mês inicial precisa vir antes do mês final.'
                : `Notas emitidas de ${MESES[mesDe - 1]!.toLowerCase()} a ${MESES[mesAte - 1]!.toLowerCase()} de ${ano}.`}
        </p>
      </fieldset>
      {erro && (escolhido || por === 'TODOS') && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
    </Modal>
  );
}
