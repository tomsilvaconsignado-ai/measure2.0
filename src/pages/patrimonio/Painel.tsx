// Painel geral do patrimônio: indicadores em tempo real, distribuição por categoria, unidade, diretoria,
// coordenação e responsável, sempre dentro do que a pessoa pode ver.
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Inbox, Package } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { CabecalhoPagina, CaixaErro, Cartao, Carregando, SemPermissao, cx } from '@/components/ui/basicos';
import { traduzirErro } from '@/lib/erros';
import { brl } from '@/lib/formatacao';
import { painelPatrimonio, SITUACAO, CONSERVACAO } from '@/services/patrimonio';
import { SeletorSetor } from './comum';

function Indicador({ rotulo, valor, para, destaque }: { rotulo: string; valor: number | string; para?: string; destaque?: boolean }) {
  const corpo = (
    <div className={cx('h-full rounded-xl border bg-white p-4 transition-colors', destaque ? 'border-amber-300 bg-amber-50' : 'border-slate-200', para && 'hover:border-marca-300')}>
      <p className="text-xs font-medium text-slate-500">{rotulo}</p>
      <p className="numero mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
    </div>
  );
  return para ? <Link to={para}>{corpo}</Link> : corpo;
}

export function Barras({ titulo, dados, link }: { titulo: string; dados: Array<{ nome: string; total: number; id?: string | null }>; link?: (d: { nome: string; id?: string | null }) => string | null }) {
  const max = Math.max(1, ...dados.map((d) => d.total));
  return (
    <Cartao titulo={titulo}>
      {!dados.length ? <p className="text-sm text-slate-500">Sem bens neste recorte.</p> : (
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {dados.map((d) => {
            const destino = link?.(d);
            const conteudo = <>
              <div className="flex justify-between gap-2"><span className="truncate">{d.nome}</span><span className="numero shrink-0 text-slate-500">{d.total}</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-marca-600" style={{ width: `${(d.total / max) * 100}%` }} /></div>
            </>;
            return <li key={`${d.nome}-${d.id ?? ''}`} className="text-sm">{destino ? <Link to={destino} className="block rounded hover:bg-slate-50">{conteudo}</Link> : conteudo}</li>;
          })}
        </ul>
      )}
    </Cartao>
  );
}

export function PainelPatrimonio() {
  const { orgao } = useSessao();
  const [unidade, setUnidade] = useState<{ id: string; rotulo: string } | null>(null);
  const q = useQuery({ queryKey: ['patrimonio', 'painel', orgao?.id, unidade?.id], queryFn: () => painelPatrimonio(orgao!.id, unidade?.id ?? null), enabled: !!orgao });
  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  const d = q.data;
  const sit = d?.por_situacao ?? {};
  return (
    <>
      <CabecalhoPagina titulo="Gestão patrimonial" descricao="Controle dos bens institucionais: onde estão, quem responde por eles e o histórico de cada movimentação."
        acoes={<div className="w-72"><SeletorSetor rotulo="Recorte por setor" valor={unidade?.id ?? null} rotuloValor={unidade?.rotulo} aoMudar={(v, o) => setUnidade(v && o ? { id: v, rotulo: o.rotulo } : null)} /></div>} />
      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} /> : !d ? null : <div className="flex flex-col gap-5">
        {(d.aguardando_mim > 0 || d.pendencias > 0) && (
          <Link to="/patrimonio/pendencias" className="flex items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 hover:bg-amber-100">
            <AlertTriangle className="size-5" />
            <span className="flex-1 text-sm">{d.aguardando_mim > 0 ? <><strong>{d.aguardando_mim}</strong> movimentação(ões) aguardam a sua confirmação de recebimento. </> : null}
              {d.pendencias > 0 && <>{d.pendencias} movimentação(ões) em andamento no seu escopo.</>}</span>
            <span className="inline-flex items-center gap-1 text-sm font-medium">Ver pendências <ArrowRight className="size-4" /></span>
          </Link>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Indicador rotulo="Bens cadastrados (ativos)" valor={d.total} para="/patrimonio/bens" />
          <Indicador rotulo="Em uso" valor={sit.EM_USO ?? 0} para="/patrimonio/bens?situacao=EM_USO" />
          <Indicador rotulo="Disponíveis / em estoque" valor={(sit.DISPONIVEL ?? 0) + (sit.EM_ESTOQUE ?? 0)} para="/patrimonio/bens?situacao=DISPONIVEL,EM_ESTOQUE" />
          <Indicador rotulo="Em manutenção" valor={sit.EM_MANUTENCAO ?? 0} para="/patrimonio/bens?situacao=EM_MANUTENCAO" />
          <Indicador rotulo="Em transferência" valor={sit.EM_TRANSFERENCIA ?? 0} para="/patrimonio/pendencias" destaque={(sit.EM_TRANSFERENCIA ?? 0) > 0} />
          <Indicador rotulo="Baixados" valor={sit.BAIXADO ?? 0} para="/patrimonio/bens?situacao=BAIXADO" />
          <Indicador rotulo="Danificados ou ruins" valor={d.danificados} para="/patrimonio/bens?conservacao=DANIFICADO,RUIM,PESSIMO,IRRECUPERAVEL,NECESSITA_MANUTENCAO" destaque={d.danificados > 0} />
          <Indicador rotulo="Sem responsável" valor={d.sem_responsavel} para="/patrimonio/bens?sem_responsavel=1" destaque={d.sem_responsavel > 0} />
          <Indicador rotulo="Valor de aquisição" valor={brl(d.valor_total)} />
          <Indicador rotulo="Extraviados / em apuração" valor={(sit.EXTRAVIADO ?? 0) + (sit.EM_APURACAO ?? 0)} para="/patrimonio/bens?situacao=EXTRAVIADO,EM_APURACAO" />
        </div>
        {d.total === 0 && (
          <Cartao><div className="flex flex-col items-center gap-2 py-6 text-center"><Package className="size-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">Nenhum bem cadastrado neste recorte</p>
            <Link to="/patrimonio/cadastro" className="text-sm font-medium text-marca-700 hover:underline">Cadastrar o primeiro bem</Link></div></Cartao>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Barras titulo="Bens por categoria" dados={d.por_categoria} />
          <Barras titulo="Bens por unidade de saúde" dados={d.por_local} link={(x) => x.id ? `/patrimonio/bens?local=${x.id}` : null} />
          <Barras titulo="Bens por diretoria" dados={d.por_diretoria} />
          <Barras titulo="Bens por coordenação" dados={d.por_coordenacao} />
          <Barras titulo="Bens por responsável (15 maiores)" dados={d.por_responsavel.map((r) => ({ id: r.id, nome: `${r.nome} (mat. ${r.matricula})`, total: r.total }))}
            link={(x) => x.id ? `/patrimonio/bens?responsavel=${x.id}` : null} />
          <Cartao titulo="Estado de conservação">
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(CONSERVACAO).map(([k, v]) => (
                <li key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5"><span>{v}</span><span className="numero font-medium">{d.por_conservacao[k] ?? 0}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">O estado de conservação (físico) é independente da situação operacional ({Object.values(SITUACAO).slice(0, 3).join(', ')}...).</p>
          </Cartao>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Inbox className="size-3.5" />Os números consideram só os bens do seu escopo de acesso (e os que estão sob a sua guarda).</p>
      </div>}
    </>
  );
}
