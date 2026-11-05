import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Building2, FolderTree, Landmark, ScrollText, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessao } from '@/auth/Sessao';
import { Botao, CabecalhoPagina, Cartao, Selo } from '@/components/ui/basicos';
import { formatarDataHora } from '@/lib/formatacao';
import { resumoOrgao } from '@/services/api';

function Indicador({ rotulo, valor, icone, para }: { rotulo: string; valor: ReactNode; icone: ReactNode; para?: string }) {
  const conteudo = (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-marca-200">
      <span className="flex size-11 items-center justify-center rounded-lg bg-marca-50 text-marca-700">{icone}</span>
      <span>
        <span className="numero block text-2xl font-semibold text-slate-900">{valor}</span>
        <span className="block text-sm text-slate-600">{rotulo}</span>
      </span>
    </div>
  );
  return para ? <Link to={para}>{conteudo}</Link> : conteudo;
}

const FASES: Array<[string, string, boolean]> = [
  ['1', 'Fundação: órgãos, estrutura, usuários, permissões, auditoria e identidade', true],
  ['2', 'Cadastros: fornecedores, servidores, unidades atendidas, classificação orçamentária', true],
  ['3', 'Contratos: responsáveis, portarias, dotação, aditivos e renovações', true],
  ['4', 'Execução: empenhos, reforços, notas fiscais, atesto, pagamento e rateio', true],
  ['5', 'Consulta e relatórios em PDF e Excel', true],
  ['6', 'Consolidado mensal de servidores (aguarda o modelo em PDF do órgão)', false],
  ['7', 'Painel gerencial, notificações, ordens de serviço e importação', true],
];

export function Inicio() {
  const { contexto, orgao, vinculosDoOrgao, ehPlataforma, pode } = useSessao();
  const navegar = useNavigate();
  const perfil = contexto!.perfil!;
  const resumo = useQuery({ queryKey: ['resumo', orgao?.id], queryFn: () => resumoOrgao(orgao!.id), enabled: !!orgao && pode('estrutura', 'ler') });
  const primeiroNome = (perfil.nome || perfil.email).split(/\s+/)[0];
  const aguardando = useQuery({
    queryKey: ['notas', orgao?.id, 'meu-atesto'], enabled: !!orgao,
    queryFn: async () => (await supabase.from('v_notas').select('id', { count: 'exact', head: true }).eq('tenant_id', orgao!.id)
      .eq('sou_designado', true).eq('status_atesto', 'PENDENTE').is('cancelada_em', null)).count ?? 0,
  });

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${primeiroNome}`}
        descricao={orgao ? orgao.nome_oficial : 'Escolha um órgão para começar.'} />

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

      {!!aguardando.data && (
        <Link to="/notas" className="mb-6 flex items-center gap-3 rounded-xl border border-marca-200 bg-marca-50 p-4 text-sm text-marca-900 hover:bg-marca-100">
          <BadgeCheck className="size-5 shrink-0" />
          <span className="flex-1"><strong>{aguardando.data} nota{aguardando.data > 1 ? 's' : ''} fiscal{aguardando.data > 1 ? 'is' : ''}</strong> aguardando o seu atesto como gestor/fiscal designado.</span>
          <span className="font-medium">Ver notas →</span>
        </Link>
      )}
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
                  <Building2 className="mt-0.5 size-4 shrink-0 text-slate-400" />
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

        <Cartao titulo="Implantação do MEASURE 2.0">
          <ol className="flex flex-col gap-2.5">
            {FASES.map(([n, texto, pronta]) => (
              <li key={n} className="flex items-start gap-3 text-sm">
                <span className={`numero flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${pronta ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
                <span className={pronta ? 'text-slate-900' : 'text-slate-500'}>{texto}{pronta && <> <Selo tom="sucesso">Disponível</Selo></>}</span>
              </li>
            ))}
          </ol>
        </Cartao>
      </div>
    </>
  );
}
