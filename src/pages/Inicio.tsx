import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Banknote, CheckCircle2, FolderTree, Landmark, ScrollText, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { Botao, CabecalhoPagina, Cartao, PontoPendente, Selo } from '@/components/ui/basicos';
import { usePendencias } from '@/components/Pendencias';
import { FluxoTrabalho } from '@/components/FluxoTrabalho';
import { AvisoPreCadastro } from '@/components/PreCadastro';
import { formatarDataHora } from '@/lib/formatacao';
import type { Recurso } from '@/lib/tipos';
import { resumoOrgao } from '@/services/api';
import { AtivarPush } from '@/pages/MinhasNotificacoes';

function Indicador({ rotulo, valor, icone, para }: { rotulo: string; valor: ReactNode; icone: ReactNode; para?: string }) {
  const conteudo = (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 border-l-4 border-l-acento-500 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <span className="flex size-12 items-center justify-center rounded-full bg-marca-900 text-white">{icone}</span>
      <span>
        <span className="numero block text-3xl font-extrabold leading-none text-marca-900">{valor}</span>
        <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{rotulo}</span>
      </span>
    </div>
  );
  return para ? <Link to={para}>{conteudo}</Link> : conteudo;
}

// Aviso de pendência: faixa azul-marinho com o comando na chamada amarela
const AVISO = 'mb-3 flex flex-wrap items-center gap-3 rounded-xl border-l-4 border-chamada-500 bg-marca-900 p-4 text-sm text-marca-50 shadow-md transition-colors hover:bg-marca-800';
const CHAMADA = 'rounded-lg bg-chamada-500 px-3 py-1.5 text-sm font-bold text-marca-950 shadow-sm';

// Atalhos do dia a dia (cada um só aparece para quem pode usar o módulo)
const ATALHOS: Array<{ para: string; rotulo: string; descricao: string; recurso?: Recurso }> = [
  { para: '/notas', rotulo: 'Notas fiscais', descricao: 'Lançar, atestar, pagar e emitir checklist' },
  { para: '/contratos', rotulo: 'Contratos', descricao: 'Vigência, saldo, responsáveis e extratos' },
  { para: '/servidores/consolidado', rotulo: 'Consolidado mensal', descricao: 'Atrasos, faltas e documento do mês', recurso: 'servidores' },
  { para: '/relatorios', rotulo: 'Relatórios', descricao: 'Consumo e notas por classificação, em PDF e Excel' },
  { para: '/painel', rotulo: 'Painel gerencial', descricao: 'Indicadores do ano' },
  { para: '/ajuda', rotulo: 'Ajuda e manual', descricao: 'Passo a passo de cada módulo' },
];

export function Inicio() {
  const { contexto, orgao, vinculosDoOrgao, ehPlataforma, pode } = useSessao();
  const navegar = useNavigate();
  const perfil = contexto!.perfil!;
  const resumo = useQuery({ queryKey: ['resumo', orgao?.id], queryFn: () => resumoOrgao(orgao!.id), enabled: !!orgao && pode('estrutura', 'ler') });
  const primeiroNome = (perfil.nome || perfil.email).split(/\s+/)[0];
  const pendencias = usePendencias();

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${primeiroNome}`}
        descricao={orgao ? orgao.nome_oficial : 'Escolha um órgão para começar.'} />
      {orgao && <AvisoPreCadastro />}
      {orgao && <AtivarPush compacto={false} />}

      {!orgao && (
        <Cartao>
          {ehPlataforma ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-slate-700">Você é administrador da plataforma. Cadastre o primeiro órgão (Prefeitura ou Secretaria) ou escolha um existente para administrar.</p>
              <Botao icone={<Landmark className="size-4" />} onClick={() => navegar('/plataforma/orgaos')}>Ir para Órgãos</Botao>
            </div>
          ) : (
            <p className="text-sm text-slate-700">Sua conta ainda não tem vínculo ativo com nenhum órgão. Peça ao administrador do seu órgão para liberar seu acesso.</p>
          )}
        </Cartao>
      )}

      {!!pendencias.atesto && (
        <Link to="/notas?filtro=ATESTO" className={AVISO}>
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-chamada-500 text-marca-950"><BadgeCheck className="size-5" /><PontoPendente className="absolute -right-1 -top-1" /></span>
          <span className="flex-1"><strong className="text-base">{pendencias.atesto} nota{pendencias.atesto > 1 ? 's' : ''} fisca{pendencias.atesto > 1 ? 'is' : 'l'}</strong> aguardando o seu atesto.</span>
          <span className={CHAMADA}>Atestar agora →</span>
        </Link>
      )}
      {!!pendencias.pagamento && (
        <Link to="/pagamentos" className={AVISO}>
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-chamada-500 text-marca-950"><Banknote className="size-5" /><PontoPendente className="absolute -right-1 -top-1" /></span>
          <span className="flex-1"><strong className="text-base">{pendencias.pagamento} nota{pendencias.pagamento > 1 ? 's' : ''} atestada{pendencias.pagamento > 1 ? 's' : ''}</strong> aguardando a baixa do pagamento.</span>
          <span className={CHAMADA}>Dar baixa →</span>
        </Link>
      )}
      <FluxoTrabalho />
      {orgao && resumo.data && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Indicador rotulo="Unidades ativas na estrutura" valor={resumo.data.unidades} icone={<FolderTree className="size-5" />} para="/estrutura" />
          {pode('usuarios', 'ler') && <Indicador rotulo="Vínculos de acesso ativos" valor={resumo.data.vinculos} icone={<Users className="size-5" />} para="/usuarios" />}
          {pode('auditoria', 'ler') && <Indicador rotulo="Eventos auditados (7 dias)" valor={resumo.data.eventos7dias} icone={<ScrollText className="size-5" />} para="/auditoria" />}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo="Meus acessos neste órgão">
          {vinculosDoOrgao.length === 0 ? (
            <p className="text-sm text-slate-600">{ehPlataforma ? 'Você atua aqui como administrador da plataforma.' : 'Nenhum vínculo ativo neste órgão.'}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {vinculosDoOrgao.map((v) => (
                <li key={v.id} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-acento-600" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{v.papel_nome} {v.somente_leitura && <Selo tom="info">Somente leitura</Selo>}</p>
                    <p className="text-sm text-slate-600">{v.unidade ? `${v.unidade.nome}${v.unidade.sigla ? ` (${v.unidade.sigla})` : ''} e unidades abaixo` : 'Órgão inteiro'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">Último acesso registrado: {formatarDataHora(perfil.ultimo_acesso)}</p>
        </Cartao>

        <Cartao titulo="Acesso rápido">
          <ul className="grid gap-2 sm:grid-cols-2">
            {ATALHOS.filter((a) => (!a.recurso || pode(a.recurso, 'ler')) && (orgao || a.para === '/ajuda')).map((a) => (
              <li key={a.para}>
                <Link to={a.para} className="group flex h-full items-start gap-2.5 rounded-xl border border-slate-200 p-3 transition-all hover:-translate-y-0.5 hover:border-marca-400 hover:shadow-md">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-acento-600" aria-hidden />
                  <span>
                    <span className="block text-sm font-bold text-marca-900 group-hover:text-marca-700">{a.rotulo}</span>
                    <span className="block text-xs text-slate-600">{a.descricao}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}
