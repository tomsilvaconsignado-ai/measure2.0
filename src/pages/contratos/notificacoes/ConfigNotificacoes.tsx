// Configuração das notificações formais (Master ou perfil com "aprovar"): tipos de ocorrência, fundamentos
// legais (com referência, artigo, inciso, vigência e marcação de revisão) e modelos de texto por regime.
// Itens do catálogo geral podem ser personalizados pelo órgão (vira uma cópia do órgão; o geral fica intacto).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { Abas } from '@/components/ui/Abas';
import { AreaTexto, Botao, CabecalhoPagina, Campo, Cartao, Carregando, Selecao, SemPermissao, Selo } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro } from '@/lib/erros';
import { formatarData } from '@/lib/formatacao';
import { REGIMES, citacao } from '@/lib/notificacaoFormal';
import { catalogos, salvarCatalogo, type Catalogos } from '@/services/notificacoesFormais';

type Aba = 'tipos' | 'fundamentos' | 'modelos';
type Edicao = { tabela: Aba; dados: Record<string, unknown> } | null;

export function ConfigNotificacoes() {
  const { orgao } = useSessao();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('tipos');
  const [edicao, setEdicao] = useState<Edicao>(null);
  const q = useQuery({ queryKey: ['nf-catalogos', orgao?.id], queryFn: () => catalogos(orgao!.id), enabled: !!orgao });
  if (!orgao) return null;
  if (q.isLoading) return <Carregando />;
  if (!q.data?.pode_configurar) return <SemPermissao texto="A configuração das notificações é restrita ao Master do órgão ou a perfil autorizado." />;
  const c = q.data;
  return (
    <>
      <CabecalhoPagina titulo="Configuração das notificações formais" descricao="Revise os fundamentos e modelos sempre que houver alteração legislativa ou orientação da assessoria jurídica."
        acoes={<Link to="/notificacoes-contratuais"><Botao variante="secundario" icone={<ArrowLeft className="size-4" />}>Voltar</Botao></Link>} />
      <Abas<Aba> ativa={aba} aoMudar={setAba} abas={[{ id: 'tipos', rotulo: 'Tipos de ocorrência' }, { id: 'fundamentos', rotulo: 'Fundamentos legais' }, { id: 'modelos', rotulo: 'Modelos de texto' }]} />
      {aba === 'tipos' && <Tipos c={c} editar={(d) => setEdicao({ tabela: 'tipos', dados: d })} />}
      {aba === 'fundamentos' && <Fundamentos c={c} editar={(d) => setEdicao({ tabela: 'fundamentos', dados: d })} />}
      {aba === 'modelos' && <Modelos c={c} editar={(d) => setEdicao({ tabela: 'modelos', dados: d })} />}
      {edicao && <Editor edicao={edicao} c={c} aoFechar={() => setEdicao(null)} aoSalvar={async (d) => {
        try { await salvarCatalogo(orgao.id, edicao.tabela, d); await qc.invalidateQueries({ queryKey: ['nf-catalogos'] }); toast.success('Salvo.'); setEdicao(null); }
        catch (e) { toast.error(mensagemDeErro(e)); }
      }} />}
    </>
  );
}

function Tipos({ c, editar }: { c: Catalogos; editar: (d: Record<string, unknown>) => void }) {
  const grupos = [...new Set(c.tipos.map((t) => t.grupo))];
  return (
    <Cartao acoes={<Botao pequeno icone={<Plus className="size-4" />} onClick={() => editar({ grupo: 'F. Outras ocorrências', nome: '', fundamentos: [], ativo: true })}>Novo tipo</Botao>} titulo="Tipos de ocorrência">
      {grupos.map((g) => (
        <div key={g} className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h3>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {c.tipos.filter((t) => t.grupo === g).map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">{t.nome} {!t.ativo && <Selo>inativo</Selo>} {t.tenant_id && <Selo tom="info">do órgão</Selo>}
                  <span className="block text-xs text-slate-500">{t.fundamentos.length} fundamento(s) sugerido(s){t.prazo_padrao_dias ? ` · prazo padrão ${t.prazo_padrao_dias} dias` : ''}</span></span>
                <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar" onClick={() => editar({ ...t })} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Cartao>
  );
}

function Fundamentos({ c, editar }: { c: Catalogos; editar: (d: Record<string, unknown>) => void }) {
  return (
    <Cartao titulo="Fundamentos legais" acoes={<Botao pequeno icone={<Plus className="size-4" />} onClick={() => editar({ codigo: '', regime: 'MUNICIPAL', norma: '', texto: '', revisao_pendente: true, ativo: true })}>Novo fundamento do órgão</Botao>}>
      <p className="mb-3 text-xs text-slate-500">O catálogo geral é mantido pela plataforma. Fundamentos marcados "revisão jurídica" são citados de forma geral até a validação dos dispositivos específicos.</p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {c.fundamentos.map((f) => (
          <li key={f.id} className="flex items-start gap-2 px-3 py-2 text-sm">
            <span className="flex-1"><b>{citacao(f)}</b> <Selo>{f.regime === 'MUNICIPAL' ? 'Municipal' : REGIMES[f.regime as keyof typeof REGIMES] ?? f.regime}</Selo>
              {f.revisao_pendente && <Selo tom="alerta">revisão jurídica</Selo>} {f.tenant_id && <Selo tom="info">do órgão</Selo>}
              <span className="block text-xs text-slate-600">{f.texto}</span>
              {(f.observacoes || f.vigencia_inicio || f.vigencia_fim) && <span className="block text-[11px] text-slate-500">{f.observacoes}{f.vigencia_inicio ? ` · vigente desde ${formatarData(f.vigencia_inicio)}` : ''}{f.vigencia_fim ? ` até ${formatarData(f.vigencia_fim)}` : ''}</span>}</span>
            {f.tenant_id && <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar" onClick={() => editar({ ...f })} />}
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

function Modelos({ c, editar }: { c: Catalogos; editar: (d: Record<string, unknown>) => void }) {
  return (
    <Cartao titulo="Modelos de texto">
      <p className="mb-3 text-xs text-slate-500">Marcadores: {'{contrato}'}, {'{clausula_texto}'}, {'{prazo}'}, {'{prazo_resposta}'} e {'{medidas}'} (medidas possíveis conforme o caso). O texto final é sempre revisado por quem emite.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {c.modelos.map((m) => (
          <div key={m.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-1 flex items-center gap-2"><b className="flex-1 text-sm">{m.tipo === 'CONSEQUENCIAS' ? 'Consequências' : 'Manifestação'} · {REGIMES[m.regime]}</b>
              {m.tenant_id && <Selo tom="info">do órgão</Selo>}<Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label="Editar" onClick={() => editar({ ...m })} /></div>
            <p className="whitespace-pre-line text-xs text-slate-700">{m.texto}</p>
          </div>
        ))}
      </div>
    </Cartao>
  );
}

function Editor({ edicao, c, aoFechar, aoSalvar }: { edicao: NonNullable<Edicao>; c: Catalogos; aoFechar: () => void; aoSalvar: (d: Record<string, unknown>) => Promise<void> }) {
  const [d, setD] = useState<Record<string, unknown>>(edicao.dados);
  const [ocupado, setOcupado] = useState(false);
  const s = (k: string) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const txt = (k: string) => String(d[k] ?? '');
  return (
    <Modal aberto aoFechar={aoFechar} largura="lg" titulo={edicao.tabela === 'tipos' ? 'Tipo de ocorrência' : edicao.tabela === 'fundamentos' ? 'Fundamento legal do órgão' : 'Modelo de texto'}
      descricao={!d.tenant_id && d.id ? 'Item do catálogo geral: ao salvar, o órgão passa a usar a sua versão personalizada.' : undefined}
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={ocupado} onClick={async () => { setOcupado(true); await aoSalvar(d); setOcupado(false); }}>Salvar</Botao></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {edicao.tabela === 'tipos' && <>
          <Campo rotulo="Grupo" value={txt('grupo')} onChange={s('grupo')} placeholder="A. Descumprimento da execução contratual" />
          <Campo rotulo="Nome" value={txt('nome')} onChange={s('nome')} />
          <Campo rotulo="Prazo padrão (dias, opcional)" type="number" value={txt('prazo_padrao_dias')} onChange={s('prazo_padrao_dias')} />
          <Selecao rotulo="Situação" value={d.ativo === false ? 'n' : 's'} onChange={(e) => setD((x) => ({ ...x, ativo: e.target.value === 's' }))}><option value="s">Ativo</option><option value="n">Inativo</option></Selecao>
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs font-medium text-slate-600">Fundamentos sugeridos</p>
            <ul className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">{c.fundamentos.map((f) => {
              const lista = (d.fundamentos as string[]) ?? [];
              return <li key={f.codigo} className="px-2 py-1 text-xs"><label className="flex gap-2"><input type="checkbox" className="accent-marca-700" checked={lista.includes(f.codigo)}
                onChange={(e) => setD((x) => ({ ...x, fundamentos: e.target.checked ? [...lista, f.codigo] : lista.filter((y) => y !== f.codigo) }))} />{citacao(f)}</label></li>;
            })}</ul>
          </div>
        </>}
        {edicao.tabela === 'fundamentos' && <>
          <Campo rotulo="Código" value={txt('codigo')} onChange={s('codigo')} disabled={!!d.id} placeholder="MUN_DEC_7178_ART10" />
          <Selecao rotulo="Regime" value={txt('regime')} onChange={s('regime')}><option value="MUNICIPAL">Municipal</option><option value="LEI_14133">Lei 14.133/2021</option><option value="LEI_8666">Lei 8.666/1993</option><option value="GERAL">Geral</option></Selecao>
          <Campo className="sm:col-span-2" rotulo="Norma" value={txt('norma')} onChange={s('norma')} placeholder="Decreto Municipal nº 7.178/2023" />
          <Campo rotulo="Artigo" value={txt('artigo')} onChange={s('artigo')} placeholder="art. 10" />
          <Campo rotulo="Inciso / parágrafo" value={txt('inciso')} onChange={s('inciso')} />
          <AreaTexto className="sm:col-span-2" rotulo="Texto (resumo fiel do dispositivo)" rows={3} value={txt('texto')} onChange={s('texto')} />
          <Campo rotulo="Vigência – início" type="date" value={txt('vigencia_inicio')} onChange={s('vigencia_inicio')} />
          <Campo rotulo="Vigência – fim" type="date" value={txt('vigencia_fim')} onChange={s('vigencia_fim')} />
          <AreaTexto className="sm:col-span-2" rotulo="Observações" rows={2} value={txt('observacoes')} onChange={s('observacoes')} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-marca-700" checked={d.revisao_pendente === true} onChange={(e) => setD((x) => ({ ...x, revisao_pendente: e.target.checked }))} />Aguardando validação jurídica</label>
        </>}
        {edicao.tabela === 'modelos' && <>
          <Campo className="sm:col-span-2" rotulo="Nome" value={txt('nome')} onChange={s('nome')} />
          <AreaTexto className="sm:col-span-2" rotulo="Texto" rows={10} value={txt('texto')} onChange={s('texto')} />
        </>}
      </div>
    </Modal>
  );
}
