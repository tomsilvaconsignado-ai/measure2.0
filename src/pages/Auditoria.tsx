import { useQuery } from '@tanstack/react-query';
import { Eye, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { useSessao } from '@/auth/Sessao';
import { Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Paginacao, SemPermissao, Selecao, Selo, Vazio, cx } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { traduzirErro } from '@/lib/erros';
import { formatarDataHora } from '@/lib/formatacao';
import type { RegistroAuditoria } from '@/lib/tipos';
import { listarAuditoria } from '@/services/api';

const POR_PAGINA = 30;
const ENTIDADES: Record<string, string> = {
  tenants: 'Órgão', unidades_organizacionais: 'Unidade', perfis: 'Perfil', vinculos: 'Vínculo de acesso',
  tenant_configuracoes: 'Configurações', documentos: 'Documento', sessoes_suporte: 'Suporte', permissoes_papel: 'Matriz de permissões',
};
const ACOES: Record<string, { rotulo: string; tom: 'sucesso' | 'info' | 'perigo' | 'alerta' | 'neutro' }> = {
  INSERT: { rotulo: 'Criação', tom: 'sucesso' }, UPDATE: { rotulo: 'Alteração', tom: 'info' }, DELETE: { rotulo: 'Exclusão', tom: 'perigo' },
  LOGIN: { rotulo: 'Login', tom: 'neutro' }, SUPORTE_INICIADO: { rotulo: 'Suporte iniciado', tom: 'alerta' }, SUPORTE_ENCERRADO: { rotulo: 'Suporte encerrado', tom: 'neutro' },
  DOWNLOAD: { rotulo: 'Download', tom: 'neutro' }, VISUALIZACAO: { rotulo: 'Visualização', tom: 'neutro' },
};

function valor(v: unknown) {
  if (v === null || v === undefined) return <span className="text-slate-400">vazio</span>;
  if (typeof v === 'object') return <code className="break-all text-xs">{JSON.stringify(v)}</code>;
  return <span className="break-all">{String(v)}</span>;
}

function Detalhe({ r, aoFechar }: { r: RegistroAuditoria | null; aoFechar: () => void }) {
  if (!r) return null;
  const campos = r.campos_alterados?.length ? r.campos_alterados
    : Object.keys(r.depois ?? r.antes ?? {});
  const ignorar = new Set(['atualizado_em', 'atualizado_por', 'caminho']);
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`${ACOES[r.acao]?.rotulo ?? r.acao} · ${ENTIDADES[r.entidade] ?? r.entidade}`} largura="lg"
      descricao={`${formatarDataHora(r.criado_em)} · ${r.usuario_email ?? 'sistema'}${r.papeis ? ` (${r.papeis})` : ''}`}>
      {r.via_suporte && <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900"><LifeBuoy className="size-4" />Feito pelo administrador da plataforma, sem vínculo no órgão.</p>}
      {r.justificativa && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Motivo:</strong> {r.justificativa}</p>}
      {campos.filter((c) => !ignorar.has(c)).length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2 pr-3">Campo</th>{r.antes && <th className="py-2 pr-3">Antes</th>}{r.depois && <th className="py-2">Depois</th>}</tr></thead>
            <tbody>
              {campos.filter((c) => !ignorar.has(c)).map((c) => (
                <tr key={c} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 font-medium text-slate-700">{c}</td>
                  {r.antes && <td className="py-2 pr-3 text-slate-600">{valor(r.antes[c])}</td>}
                  {r.depois && <td className="py-2 text-slate-900">{valor(r.depois[c])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-slate-600">Sem dados de campos para este evento.</p>}
      <p className="mt-3 text-xs text-slate-500">Registro nº {r.id} · ID do item: {r.registro_id ?? '—'}</p>
    </Modal>
  );
}

export function Auditoria() {
  const { orgao, pode } = useSessao();
  const [entidade, setEntidade] = useState('');
  const [acao, setAcao] = useState('');
  const [usuario, setUsuario] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<RegistroAuditoria | null>(null);
  const q = useQuery({
    queryKey: ['auditoria', orgao?.id, entidade, acao, usuario, de, ate, pagina],
    queryFn: () => listarAuditoria({ tenantId: orgao!.id, entidade, acao, usuario, de, ate, limite: POR_PAGINA, offset: pagina * POR_PAGINA }),
    enabled: !!orgao && pode('auditoria', 'ler'),
    placeholderData: (a) => a,
  });
  if (!orgao) return <SemPermissao texto="Escolha um órgão para ver a auditoria." />;
  if (!pode('auditoria', 'ler')) return <SemPermissao />;
  const filtros = !!(entidade || acao || usuario || de || ate);
  const mudar = (f: (v: string) => void) => (e: { target: { value: string } }) => { f(e.target.value); setPagina(0); };

  return (
    <>
      <CabecalhoPagina titulo="Auditoria" descricao="Registro imutável de quem fez o quê, quando e por quê. Ninguém edita ou apaga estes registros." />
      <Cartao>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
          <Selecao rotulo="Item" value={entidade} onChange={mudar(setEntidade)}>
            <option value="">Todos</option>{Object.entries(ENTIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          <Selecao rotulo="Ação" value={acao} onChange={mudar(setAcao)}>
            <option value="">Todas</option>{Object.entries(ACOES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </Selecao>
          <Campo rotulo="Usuário (e-mail)" value={usuario} onChange={mudar(setUsuario)} />
          <Campo rotulo="De" type="date" value={de} onChange={mudar(setDe)} />
          <Campo rotulo="Até" type="date" value={ate} onChange={mudar(setAte)} />
          {filtros && <Botao variante="fantasma" onClick={() => { setEntidade(''); setAcao(''); setUsuario(''); setDe(''); setAte(''); setPagina(0); }}>Limpar</Botao>}
        </div>
        {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={traduzirErro(q.error).mensagem} tentarDeNovo={() => q.refetch()} /> :
          q.data!.itens.length === 0 ? <Vazio titulo="Nenhum evento encontrado" /> : (
            <div className={cx('overflow-x-auto', q.isFetching && 'opacity-70')}>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Data e hora</th><th className="py-2 pr-3 font-medium">Usuário</th>
                    <th className="py-2 pr-3 font-medium">Ação</th><th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium">Motivo</th><th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {q.data!.itens.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="numero whitespace-nowrap py-2 pr-3 text-slate-600">{formatarDataHora(r.criado_em)}</td>
                      <td className="max-w-56 truncate py-2 pr-3">{r.usuario_email ?? 'sistema'}{r.via_suporte && <> <Selo tom="alerta">suporte</Selo></>}</td>
                      <td className="py-2 pr-3"><Selo tom={ACOES[r.acao]?.tom ?? 'neutro'}>{ACOES[r.acao]?.rotulo ?? r.acao}</Selo></td>
                      <td className="py-2 pr-3">{ENTIDADES[r.entidade] ?? r.entidade}
                        {r.campos_alterados?.length ? <span className="block text-xs text-slate-500">{r.campos_alterados.filter((c) => !['atualizado_em', 'atualizado_por'].includes(c)).join(', ')}</span> : null}</td>
                      <td className="max-w-64 truncate py-2 pr-3 text-slate-600">{r.justificativa ?? '—'}</td>
                      <td className="py-2"><Botao pequeno variante="fantasma" icone={<Eye className="size-4" />} onClick={() => setAberto(r)} aria-label="Ver detalhes" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={POR_PAGINA} aoMudar={setPagina} />}
      </Cartao>
      <Detalhe r={aberto} aoFechar={() => setAberto(null)} />
    </>
  );
}
