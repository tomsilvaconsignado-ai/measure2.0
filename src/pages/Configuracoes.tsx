import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, ImageUp, Landmark, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Interruptor, SemPermissao } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarCep, formatarCnpj, formatarTelefone } from '@/lib/formatacao';
import { enviarLogoOrgao, obterConfiguracoes, obterOrgao, salvarConfiguracoes, urlArquivo } from '@/services/api';
import { VARIAVEIS_ATESTO } from '@/lib/atesto';
import { exportarBackup, itensChecklist } from '@/services/consolidado';
import { linhasDeItens } from '@/lib/checklist';
import { FormOrgao } from './plataforma/Orgaos';

const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('\n') : '');
const linhas = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

export function Configuracoes() {
  const { orgao, pode, recarregar, escolherOrgao } = useSessao();
  const qc = useQueryClient();
  const arquivo = useRef<HTMLInputElement>(null);
  const [editandoOrgao, setEditandoOrgao] = useState(false);
  const ativo = !!orgao && pode('configuracoes', 'ler');
  const dados = useQuery({ queryKey: ['orgao', orgao?.id], queryFn: () => obterOrgao(orgao!.id), enabled: ativo });
  const cfg = useQuery({ queryKey: ['configuracoes', orgao?.id], queryFn: () => obterConfiguracoes(orgao!.id), enabled: ativo });
  const logo = useQuery({ queryKey: ['url', 'arquivos', dados.data?.logo_path], queryFn: () => urlArquivo('arquivos', dados.data?.logo_path), enabled: !!dados.data?.logo_path });

  const [cabecalho, setCabecalho] = useState('');
  const [rodape, setRodape] = useState('');
  const [alertas, setAlertas] = useState('');
  const [anexoMb, setAnexoMb] = useState('10');
  const [bloquear, setBloquear] = useState(false);
  const [atestoLancador, setAtestoLancador] = useState(true);
  const [textoAtesto, setTextoAtesto] = useState('');
  const [decreto, setDecreto] = useState('');
  const [consolidadoTitulo, setConsolidadoTitulo] = useState('');
  const [assinaturas, setAssinaturas] = useState('');
  const [checklistTitulo, setChecklistTitulo] = useState('');
  const [checklistItens, setChecklistItens] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!cfg.data) return;
    setCabecalho(cfg.data.documento_cabecalho.join('\n'));
    setRodape(cfg.data.documento_rodape ?? '');
    setAlertas(cfg.data.alerta_vencimento_dias.join(', '));
    setAnexoMb(String(cfg.data.anexo_tamanho_max_mb));
    setBloquear(cfg.data.bloquear_nota_contrato_vencido);
    setAtestoLancador(cfg.data.permitir_atesto_lancador);
    setTextoAtesto(texto(cfg.data.textos?.atesto));
    setDecreto(texto(cfg.data.textos?.decreto));
    setConsolidadoTitulo(texto(cfg.data.textos?.consolidado_titulo));
    setAssinaturas(lista(cfg.data.textos?.consolidado_assinaturas));
    setChecklistTitulo(texto(cfg.data.textos?.checklist_titulo));
    setChecklistItens(lista(cfg.data.textos?.checklist_modelo_itens));
  }, [cfg.data]);

  const enviarLogo = useMutation({
    mutationFn: (f: File) => enviarLogoOrgao(orgao!.id, f),
    onSuccess: async (caminho) => {
      await qc.invalidateQueries({ queryKey: ['orgao', orgao!.id] });
      await recarregar();
      escolherOrgao({ ...orgao!, logo_path: caminho });
      toast.success('Brasão atualizado. Ele aparece nos documentos e no cabeçalho do sistema.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const salvar = useMutation({
    mutationFn: () => {
      const dias = alertas.split(/[,\s;]+/).filter(Boolean).map(Number);
      const mb = Number(anexoMb);
      const n: Record<string, string> = {};
      if (dias.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) n.alertas = 'Use números inteiros de 1 a 365, separados por vírgula.';
      if (!Number.isInteger(mb) || mb < 1 || mb > 50) n.anexo = 'Informe um valor inteiro de 1 a 50 MB.';
      setErros(n);
      if (Object.keys(n).length) throw { erro: 'Corrija os campos destacados.' };
      return salvarConfiguracoes(orgao!.id, {
        documento_cabecalho: cabecalho.split('\n').map((l) => l.trim()).filter(Boolean),
        documento_rodape: rodape.trim() || null,
        alerta_vencimento_dias: [...new Set(dias)].sort((a, b) => b - a),
        anexo_tamanho_max_mb: mb,
        bloquear_nota_contrato_vencido: bloquear,
        permitir_atesto_lancador: atestoLancador,
        textos: Object.fromEntries(Object.entries({
          ...(cfg.data?.textos ?? {}), atesto: textoAtesto.trim(), decreto: decreto.trim(),
          consolidado_titulo: consolidadoTitulo.trim(), checklist_titulo: checklistTitulo.trim(),
          // listas vazias voltam ao padrão do sistema
          consolidado_assinaturas: linhas(assinaturas).length ? linhas(assinaturas) : '', checklist_modelo_itens: linhas(checklistItens).length ? linhas(checklistItens) : '',
        }).filter(([, v]) => v !== '')),
      });
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['configuracoes', orgao!.id] }); toast.success('Configurações salvas.'); },
    onError: (e) => { const t = traduzirErro(e); if (!t.campo) setErros((x) => ({ ...x, geral: t.mensagem })); },
  });

  const backup = useMutation({
    mutationFn: () => exportarBackup(orgao!.id),
    onSuccess: (dadosBackup) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(dadosBackup, null, 1)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `measure-backup-${orgao!.nome_curto.replace(/[^A-Za-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Cópia de segurança gerada. Guarde o arquivo em local protegido: ele contém dados pessoais.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  if (!orgao) return <SemPermissao texto="Escolha um órgão." />;
  if (!pode('configuracoes', 'ler')) return <SemPermissao />;
  if (dados.isLoading || cfg.isLoading) return <Carregando />;
  if (dados.isError || cfg.isError) return <CaixaErro mensagem={traduzirErro(dados.error ?? cfg.error).mensagem} />;
  const podeEditar = pode('configuracoes', 'editar');
  const t = dados.data!;

  return (
    <>
      <CabecalhoPagina titulo="Configurações do órgão" descricao="Identidade institucional, padrões dos documentos e parâmetros de funcionamento." />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Cartao titulo="Identidade institucional" acoes={podeEditar && <Botao pequeno variante="secundario" icone={<Pencil className="size-4" />} onClick={() => setEditandoOrgao(true)}>Editar dados</Botao>}>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
              {logo.data ? <img src={logo.data} alt={`Brasão de ${t.nome_curto}`} className="max-h-full max-w-full object-contain" /> : <Landmark className="size-10 text-slate-300" />}
            </div>
            {podeEditar && <>
              <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarLogo.mutate(f); e.target.value = ''; }} />
              <Botao pequeno variante="secundario" icone={<ImageUp className="size-4" />} carregando={enviarLogo.isPending} onClick={() => arquivo.current?.click()}>
                {t.logo_path ? 'Trocar brasão' : 'Enviar brasão/logomarca'}
              </Botao>
              <p className="text-xs text-slate-500">PNG, JPG ou WEBP até 5 MB. Preferência: fundo transparente. A imagem não é distorcida.</p>
            </>}
          </div>
          <dl className="mt-5 grid gap-2 text-sm">
            {[['Nome oficial', t.nome_oficial], ['CNPJ', formatarCnpj(t.cnpj) || '—'], ['Endereço', [t.endereco, formatarCep(t.cep), t.cidade && `${t.cidade}/${t.uf ?? ''}`].filter(Boolean).join(' · ') || '—'],
              ['Telefone', formatarTelefone(t.telefone) || '—'], ['E-mail', t.email_contato ?? '—'],
              ['Domínios de e-mail', t.dominios_email.length ? t.dominios_email.map((d) => '@' + d).join(', ') : 'Qualquer domínio']].map(([r, v]) => (
              <div key={r}><dt className="text-xs text-slate-500">{r}</dt><dd className="text-slate-900">{v}</dd></div>
            ))}
          </dl>
        </Cartao>

        <Cartao titulo="Documentos e parâmetros">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} noValidate>
            <AreaTexto rotulo="Cabeçalho dos documentos" value={cabecalho} onChange={(e) => setCabecalho(e.target.value)} disabled={!podeEditar} rows={4}
              ajuda="Uma linha por vez, abaixo do brasão (ex.: PREFEITURA MUNICIPAL DE ARACAJU / SECRETARIA MUNICIPAL DA SAÚDE / COORDENAÇÃO...)." />
            <AreaTexto rotulo="Rodapé dos documentos" value={rodape} onChange={(e) => setRodape(e.target.value)} disabled={!podeEditar} rows={2}
              ajuda="Endereço e contatos que aparecem no rodapé dos PDFs." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Alertas de vencimento de contrato (dias)" value={alertas} onChange={(e) => setAlertas(e.target.value)} disabled={!podeEditar}
                erro={erros.alertas} ajuda="Ex.: 30, 15 — o contrato continua vigente até a data final." />
              <Campo rotulo="Tamanho máximo de anexo (MB)" type="number" min={1} max={50} value={anexoMb} onChange={(e) => setAnexoMb(e.target.value)}
                disabled={!podeEditar} erro={erros.anexo} />
            </div>
            <Interruptor rotulo="Bloquear lançamento de nota fiscal em contrato vencido" marcado={bloquear} aoMudar={setBloquear} desabilitado={!podeEditar}
              descricao="Desligado: o sistema só alerta. Ligado: impede o lançamento (exceções devem ser tratadas pelo administrador)." />
            <Interruptor rotulo="Quem lançou a nota também pode atestá-la" marcado={atestoLancador} aoMudar={setAtestoLancador} desabilitado={!podeEditar}
              descricao="Ligado: além do gestor, do fiscal e do suplente designados, o servidor que digitou a nota pode atestar (o atesto registra quem foi). Desligado: só os designados atestam, o que reforça a segregação de funções (Lei 14.133/2021, art. 7º, § 1º)." />
            <AreaTexto rotulo="Modelo do texto de atesto" value={textoAtesto} onChange={(e) => setTextoAtesto(e.target.value)} disabled={!podeEditar} rows={5}
              placeholder="Vazio = modelo padrão do MEASURE"
              ajuda={`Variáveis preenchidas automaticamente: ${VARIAVEIS_ATESTO.map(([v, d]) => `${v} = ${d}`).join(' · ')}`} />
            <AreaTexto rotulo="Decreto / observação legal do atesto" value={decreto} onChange={(e) => setDecreto(e.target.value)} disabled={!podeEditar} rows={2}
              ajuda="Entra no lugar de {decreto} (ex.: número e artigo do decreto municipal aplicável)." />
            <p className="border-t border-slate-200 pt-4 text-sm font-medium text-slate-900">Modelos de documentos</p>
            <Campo rotulo="Título do consolidado mensal de servidores" value={consolidadoTitulo} onChange={(e) => setConsolidadoTitulo(e.target.value)} disabled={!podeEditar}
              maxLength={150} placeholder="CONSOLIDADO MENSAL DE FREQUÊNCIA" ajuda="Use o título exato do modelo oficial do órgão. Os filtros (Coordenação, Gerência) não entram no título." />
            <AreaTexto rotulo="Assinaturas do consolidado" value={assinaturas} onChange={(e) => setAssinaturas(e.target.value)} disabled={!podeEditar} rows={2}
              placeholder={'Chefe Imediato\nCoordenador(a)'} ajuda="Uma assinatura por linha." />
            <Campo rotulo="Título do checklist da nota fiscal" value={checklistTitulo} onChange={(e) => setChecklistTitulo(e.target.value)} disabled={!podeEditar}
              maxLength={150} placeholder="FORMULÁRIO PARA ANÁLISE DOS DOCUMENTOS QUE DEVEM ACOMPANHAR NOTA FISCAL DE PRESTAÇÃO DE SERVIÇOS CONTINUADOS"
              ajuda="Vazio = título do modelo da SMS (formulário de serviços continuados)." />
            <div>
              <AreaTexto rotulo="Itens do checklist da nota fiscal" value={checklistItens} onChange={(e) => setChecklistItens(e.target.value)} disabled={!podeEditar} rows={8}
                placeholder="Vazio = os 20 itens do modelo da SMS (solicitação de pagamento, nota fiscal, GPS, GRF, certidões, RANFS…)"
                ajuda='Um item por linha, na ordem do formulário. Comece a linha com "[X] " para o item já vir marcado SIM; na emissão dá para mudar.' />
              {podeEditar && <Botao pequeno variante="secundario" className="mt-1" onClick={() => void itensChecklist(orgao!.id).then((r) => setChecklistItens(linhasDeItens(r.itens).join('\n')))}>
                Carregar os itens atuais para editar</Botao>}
            </div>
            {erros.geral && <CaixaErro mensagem={erros.geral} />}
            {podeEditar && <div><Botao type="submit" carregando={salvar.isPending}>Salvar configurações</Botao></div>}
          </form>
        </Cartao>
      </div>
      {pode('configuracoes', 'exportar') && (
        <Cartao className="mt-6" titulo="Cópia de segurança">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-slate-600">Baixa todos os dados do órgão em um arquivo JSON (cadastros, contratos, execução, frequências e documentos emitidos). Não inclui senhas nem chaves de acesso. Complementa o backup automático diário do banco de dados. A geração fica registrada na auditoria.</p>
            <Botao variante="secundario" icone={<DatabaseBackup className="size-4" />} carregando={backup.isPending} onClick={() => backup.mutate()}>Baixar cópia (JSON)</Botao>
          </div>
        </Cartao>
      )}
      <FormOrgao aberto={editandoOrgao} orgao={t} aoFechar={() => { setEditandoOrgao(false); void qc.invalidateQueries({ queryKey: ['orgao', orgao.id] }); }} />
    </>
  );
}
