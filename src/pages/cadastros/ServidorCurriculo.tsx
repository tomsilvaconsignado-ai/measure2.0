// Dados curriculares do servidor (todos opcionais): escolaridade, observações, formações, cursos,
// capacitações, especializações, certificações e experiências, com comprovantes anexados.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Anexos } from '@/components/Anexos';
import { AreaTexto, Botao, CaixaErro, Campo, Carregando, Selecao } from '@/components/ui/basicos';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarData } from '@/lib/formatacao';
import type { Escolaridade, ItemCurriculo, Servidor, TipoItemCurriculo } from '@/lib/tipos';
import { listarCurriculo, removerItemCurriculo, salvarCurriculoServidor, salvarItemCurriculo } from '@/services/cadastros';

export const ESCOLARIDADES: Array<[Escolaridade, string]> = [
  ['FUNDAMENTAL_INCOMPLETO', 'Ensino fundamental incompleto'], ['FUNDAMENTAL', 'Ensino fundamental completo'],
  ['MEDIO_INCOMPLETO', 'Ensino médio incompleto'], ['MEDIO', 'Ensino médio completo'], ['TECNICO', 'Ensino técnico'],
  ['SUPERIOR_INCOMPLETO', 'Ensino superior incompleto'], ['SUPERIOR', 'Ensino superior completo'], ['ESPECIALIZACAO', 'Pós-graduação (especialização)'],
  ['MESTRADO', 'Mestrado'], ['DOUTORADO', 'Doutorado'], ['POS_DOUTORADO', 'Pós-doutorado'],
];
export const rotuloEscolaridade = (e: Escolaridade | null) => ESCOLARIDADES.find(([v]) => v === e)?.[1] ?? null;

const TIPOS: Array<[TipoItemCurriculo, string, string]> = [
  ['FORMACAO', 'Formação acadêmica', 'Graduação, curso técnico…'],
  ['ESPECIALIZACAO', 'Especializações', 'Pós-graduação, MBA, residência…'],
  ['CURSO', 'Cursos realizados', 'Cursos livres e de extensão'],
  ['CAPACITACAO', 'Capacitações', 'Treinamentos do órgão ou externos'],
  ['CERTIFICACAO', 'Certificações', 'Certificações profissionais'],
  ['EXPERIENCIA', 'Experiências profissionais', 'Cargos e funções anteriores'],
];
const nomeTipo = (t: TipoItemCurriculo) => TIPOS.find(([v]) => v === t)![1];

interface FormItem { tipo: TipoItemCurriculo; titulo: string; instituicao: string; ano_conclusao: string; carga_horaria: string; inicio: string; fim: string; observacoes: string }
const vazio: FormItem = { tipo: 'FORMACAO', titulo: '', instituicao: '', ano_conclusao: '', carga_horaria: '', inicio: '', fim: '', observacoes: '' };

function FormItemCurriculo({ servidorId, item, tipoInicial, aberto, aoFechar }: { servidorId: string; item: ItemCurriculo | null; tipoInicial: TipoItemCurriculo; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<FormItem>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF(item ? { tipo: item.tipo, titulo: item.titulo, instituicao: item.instituicao ?? '', ano_conclusao: item.ano_conclusao ? String(item.ano_conclusao) : '',
      carga_horaria: item.carga_horaria ? String(item.carga_horaria) : '', inicio: item.inicio ?? '', fim: item.fim ?? '', observacoes: item.observacoes ?? '' }
      : { ...vazio, tipo: tipoInicial });
  }, [aberto, item, tipoInicial]);
  const set = (k: keyof FormItem) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const experiencia = f.tipo === 'EXPERIENCIA';
  const salvar = useMutation({
    mutationFn: () => salvarItemCurriculo(item?.id ?? null, {
      servidor_id: servidorId, tipo: f.tipo, titulo: f.titulo.trim(), instituicao: f.instituicao.trim() || null,
      ano_conclusao: !experiencia && f.ano_conclusao ? Number(f.ano_conclusao) : null, carga_horaria: !experiencia && f.carga_horaria ? Number(f.carga_horaria) : null,
      inicio: experiencia ? f.inicio || null : null, fim: experiencia ? f.fim || null : null, observacoes: f.observacoes.trim() || null,
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['curriculo', servidorId] }); toast.success(item ? 'Item atualizado.' : 'Item incluído no currículo.'); aoFechar(); },
    onError: (e) => { const t = traduzirErro(e); setErros(t.campo ? { [t.campo]: t.mensagem } : { geral: t.mensagem }); },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    const ano = Number(f.ano_conclusao);
    if (f.titulo.trim().length < 2) n.titulo = experiencia ? 'Informe o cargo ou a função.' : 'Informe o nome do curso ou da formação.';
    if (f.ano_conclusao && (!Number.isInteger(ano) || ano < 1940 || ano > 2100)) n.ano_conclusao = 'Ano entre 1940 e 2100.';
    if (f.carga_horaria && (!Number.isInteger(Number(f.carga_horaria)) || Number(f.carga_horaria) < 1)) n.carga_horaria = 'Informe horas inteiras.';
    if (experiencia && f.inicio && f.fim && f.fim < f.inicio) n.fim = 'O fim não pode ser antes do início.';
    setErros(n);
    if (!Object.keys(n).length) salvar.mutate();
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={item ? 'Editar item do currículo' : 'Incluir no currículo'} largura="md"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-curriculo" carregando={salvar.isPending}>Salvar</Botao></>}>
      <form id="form-curriculo" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Selecao className="sm:col-span-2" rotulo="Tipo" value={f.tipo} onChange={set('tipo')}>
          {TIPOS.map(([v, r, d]) => <option key={v} value={v}>{r} — {d}</option>)}
        </Selecao>
        <Campo className="sm:col-span-2" rotulo={experiencia ? 'Cargo / função' : 'Curso / formação'} obrigatorio value={f.titulo} onChange={set('titulo')} erro={erros.titulo} maxLength={300} />
        <Campo className="sm:col-span-2" rotulo={experiencia ? 'Empresa / órgão' : 'Instituição de ensino'} value={f.instituicao} onChange={set('instituicao')} maxLength={300} />
        {experiencia ? <>
          <Campo rotulo="Início" type="date" value={f.inicio} onChange={set('inicio')} />
          <Campo rotulo="Fim" type="date" value={f.fim} onChange={set('fim')} erro={erros.fim} ajuda="Vazio = experiência atual." />
        </> : <>
          <Campo rotulo="Ano de conclusão" inputMode="numeric" value={f.ano_conclusao} onChange={set('ano_conclusao')} erro={erros.ano_conclusao} maxLength={4} />
          <Campo rotulo="Carga horária (horas)" inputMode="numeric" value={f.carga_horaria} onChange={set('carga_horaria')} erro={erros.carga_horaria} maxLength={5} />
        </>}
        <AreaTexto className="sm:col-span-2" rotulo="Observações" value={f.observacoes} onChange={set('observacoes')} maxLength={2000} rows={2} />
        {erros.geral && <div className="sm:col-span-2"><CaixaErro mensagem={erros.geral} /></div>}
      </form>
    </Modal>
  );
}

export function ServidorCurriculo({ servidor, podeEditar }: { servidor: Servidor; podeEditar: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['curriculo', servidor.id], queryFn: () => listarCurriculo(servidor.id) });
  const [escolaridade, setEscolaridade] = useState(servidor.escolaridade ?? '');
  const [obs, setObs] = useState(servidor.curriculo_observacoes ?? '');
  useEffect(() => { setEscolaridade(servidor.escolaridade ?? ''); setObs(servidor.curriculo_observacoes ?? ''); }, [servidor]);
  const [editando, setEditando] = useState<{ item: ItemCurriculo | null; tipo: TipoItemCurriculo } | null>(null);
  const [removendo, setRemovendo] = useState<ItemCurriculo | null>(null);
  const alterado = escolaridade !== (servidor.escolaridade ?? '') || obs.trim() !== (servidor.curriculo_observacoes ?? '');
  const salvarGerais = useMutation({
    mutationFn: () => salvarCurriculoServidor(servidor.id, { escolaridade: (escolaridade || null) as Escolaridade | null, curriculo_observacoes: obs.trim() || null }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['servidor', servidor.id] }); toast.success('Dados curriculares salvos.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const remover = useMutation({
    mutationFn: (i: ItemCurriculo) => removerItemCurriculo(i.id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['curriculo', servidor.id] }); setRemovendo(null); toast.success('Item removido do currículo.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">Preenchimento opcional. Nenhum campo é obrigatório para o cadastro do servidor.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao rotulo="Escolaridade" value={escolaridade} onChange={(e) => setEscolaridade(e.target.value)} disabled={!podeEditar}>
          <option value="">Não informada</option>{ESCOLARIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </Selecao>
        <AreaTexto rotulo="Observações do currículo" value={obs} onChange={(e) => setObs(e.target.value)} disabled={!podeEditar} maxLength={4000} rows={2} />
      </div>
      {podeEditar && alterado && <Botao pequeno className="self-start" carregando={salvarGerais.isPending} onClick={() => salvarGerais.mutate()}>Salvar escolaridade e observações</Botao>}

      {q.isLoading ? <Carregando /> : q.isError ? <CaixaErro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => void q.refetch()} /> : TIPOS.map(([tipo, rotulo]) => {
        const itens = q.data!.filter((i) => i.tipo === tipo);
        if (!itens.length && !podeEditar) return null;
        return (
          <section key={tipo}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-800">{rotulo}</h4>
              {podeEditar && <Botao pequeno variante="fantasma" icone={<Plus className="size-4" />} onClick={() => setEditando({ item: null, tipo })}>Incluir</Botao>}
            </div>
            {!itens.length ? <p className="text-xs text-slate-400">Nenhum registro.</p> : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {itens.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{i.titulo}</p>
                      <p className="text-xs text-slate-500">{[i.instituicao,
                        i.tipo === 'EXPERIENCIA' ? (i.inicio ? `${formatarData(i.inicio)} a ${i.fim ? formatarData(i.fim) : 'atual'}` : null) : (i.ano_conclusao ? `concluído em ${i.ano_conclusao}` : null),
                        i.carga_horaria ? `${i.carga_horaria} h` : null].filter(Boolean).join(' · ') || '—'}</p>
                      {i.observacoes && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">{i.observacoes}</p>}
                    </div>
                    {podeEditar && <>
                      <Botao pequeno variante="fantasma" icone={<Pencil className="size-4" />} aria-label={`Editar ${i.titulo}`} onClick={() => setEditando({ item: i, tipo: i.tipo })} />
                      <Botao pequeno variante="fantasma" icone={<Trash2 className="size-4 text-red-600" />} aria-label={`Remover ${i.titulo}`}
                        onClick={() => setRemovendo(i)} />
                    </>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <Anexos recurso="servidores" registroId={servidor.id} unidadeId={servidor.unidade_id} categoria="CURRICULO" titulo="Comprovantes (diplomas, certificados)"
        vazio="Nenhum comprovante anexado." />
      <Modal aberto={!!removendo} aoFechar={() => setRemovendo(null)} titulo="Remover do currículo?" largura="sm"
        rodape={<><Botao variante="secundario" onClick={() => setRemovendo(null)}>Cancelar</Botao><Botao variante="perigo" carregando={remover.isPending} onClick={() => remover.mutate(removendo!)}>Remover</Botao></>}>
        {removendo && <p className="text-sm text-slate-700">"{removendo.titulo}" sai de {nomeTipo(removendo.tipo).toLowerCase()}. O registro continua na auditoria.</p>}
      </Modal>
      <FormItemCurriculo servidorId={servidor.id} item={editando?.item ?? null} tipoInicial={editando?.tipo ?? 'FORMACAO'} aberto={!!editando} aoFechar={() => setEditando(null)} />
    </div>
  );
}
