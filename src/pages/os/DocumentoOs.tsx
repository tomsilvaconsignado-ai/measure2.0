// Corpo do documento da ordem de serviço (papel timbrado: cabeçalho e rodapé vêm de FolhaImpressao).
// Modelo EXTINTORES conforme o modelo usado pela SMS: bloco CONTRATO, bloco ORDEM DE SERVIÇOS com a tabela
// (unidade, quantidade, tipo de extintor, capacidade extintora, data de solicitação) e a assinatura de quem emite.
import { formatarCnpj, formatarCpf, formatarData } from '@/lib/formatacao';

interface DadosOs {
  modelo: string; numero: string; titulo: string; data_abertura: string; descricao: string | null; observacoes: string | null;
  contrato: { numero: string; objeto: string; inicio: string; fim: string };
  fornecedor: { nome: string; documento: string; tipo: string; endereco: string | null };
  empenho: string | null;
  itens: Array<{ unidade: string; quantidade: number; tipo: string | null; especificacao: string | null; data_solicitacao: string }>;
  assinante: { nome: string | null; funcao: string | null; matricula: string | null };
}

const faixa = 'border border-slate-500 bg-slate-300 px-2 py-0.5 text-center text-[11px] font-bold uppercase';
const rotulo = 'block text-[9.5px] font-bold uppercase';
const celula = 'border border-slate-500 px-2 py-1 align-top text-[11px]';

export function DocumentoOs({ d }: { d: DadosOs }) {
  const doc = d.fornecedor.tipo === 'PF' ? formatarCpf(d.fornecedor.documento) : formatarCnpj(d.fornecedor.documento);
  const extintores = d.modelo === 'EXTINTORES';
  return (
    <div className="text-slate-900">
      <table className="w-full border-collapse">
        <tbody>
          <tr><td colSpan={2} className={faixa}>Contrato</td></tr>
          <tr>
            <td className={`${celula} w-1/2`}><span className={rotulo}>Nº contrato</span>{d.contrato.numero}</td>
            <td className={celula}><span className={rotulo}>Vigência</span>{formatarData(d.contrato.inicio)} a {formatarData(d.contrato.fim)}</td>
          </tr>
          <tr>
            <td className={`${celula} font-bold`}>{d.fornecedor.nome}</td>
            <td className={celula}><span className={rotulo}>{d.fornecedor.tipo === 'PF' ? 'CPF' : 'CNPJ'}</span>{doc}</td>
          </tr>
          <tr><td colSpan={2} className={celula}><span className={rotulo}>Endereço</span>{d.fornecedor.endereco ?? '—'}</td></tr>
          <tr><td colSpan={2} className={`${celula} h-20`}><span className={rotulo}>Objeto</span><span className="whitespace-pre-line">{d.contrato.objeto}</span></td></tr>
          <tr><td colSpan={2} className={faixa}>Ordem de serviços</td></tr>
          <tr>
            <td className={celula}><span className={rotulo}>Ordem de serviço nº</span><span className="text-[13px] font-bold">{d.numero}</span></td>
            <td className={celula}><span className={rotulo}>Nota de empenho nº</span><span className="text-[13px] font-bold">{d.empenho ?? '—'}</span></td>
          </tr>
        </tbody>
      </table>
      <table className="w-full border-collapse border-t-0">
        <thead>
          <tr className="bg-slate-100">
            <th className={`${celula} w-[34%] text-center font-bold`}>UNIDADE</th>
            <th className={`${celula} w-[12%] text-center font-bold`}>QUANTIDADE</th>
            <th className={`${celula} text-center font-bold`}>{extintores ? 'TIPO DE EXTINTOR' : 'SERVIÇO'}</th>
            <th className={`${celula} text-center font-bold`}>{extintores ? 'CAPACIDADE EXTINTORA' : 'ESPECIFICAÇÃO'}</th>
            <th className={`${celula} w-[14%] text-center font-bold`}>DATA DE SOLICITAÇÃO</th>
          </tr>
        </thead>
        <tbody>
          {d.itens.map((i, k) => (
            <tr key={k} className="break-inside-avoid">
              <td className={`${celula} text-center`}>{i.unidade}</td>
              <td className={`${celula} text-center`}>{Number(i.quantidade).toLocaleString('pt-BR')}</td>
              <td className={`${celula} text-center`}>{i.tipo ?? '—'}</td>
              <td className={`${celula} text-center`}>{i.especificacao ?? '—'}</td>
              <td className={`${celula} text-center`}>{formatarData(i.data_solicitacao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.observacoes && <p className="mt-3 text-[11px]"><strong>Observações:</strong> {d.observacoes}</p>}

      <div className="mx-auto mt-20 w-80 break-inside-avoid text-center text-[12px]">
        <div className="border-t border-slate-800 pt-1 font-semibold">{d.assinante.nome ?? '—'}</div>
        {d.assinante.funcao && <div>{d.assinante.funcao}</div>}
        {d.assinante.matricula && <div>Matrícula: {d.assinante.matricula}</div>}
      </div>
    </div>
  );
}
