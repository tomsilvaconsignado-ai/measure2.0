import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Landmark, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessao } from '@/auth/Sessao';
import { AreaTexto, Botao, CabecalhoPagina, CaixaErro, Campo, Cartao, Carregando, Interruptor, SemPermissao } from '@/components/ui/basicos';
import { mensagemDeErro, traduzirErro } from '@/lib/erros';
import { formatarCep, formatarCnpj, formatarTelefone } from '@/lib/formatacao';
import { enviarLogoOrgao, obterConfiguracoes, obterOrgao, salvarConfiguracoes, urlArquivo } from '@/services/api';
import { FormOrgao } from './plataforma/Orgaos';

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
  const [textoAtesto, setTextoAtesto] = useState('');
  const [decreto, setDecreto] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!cfg.data) return;
    setCabecalho(cfg.data.documento_cabecalho.join('\n'));
    setRodape(cfg.data.documento_rodape ?? '');
    setAlertas(cfg.data.alerta_vencimento_dias.join(', '));
    setAnexoMb(String(cfg.data.anexo_tamanho_max_mb));
    setBloquear(cfg.data.bloquear_nota_contrato_vencido);
    setTextoAtesto(cfg.data.textos?.atesto ?? '');
    setDecreto(cfg.data.textos?.decreto ?? '');
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
        textos: { ...(cfg.data?.textos ?? {}), atesto: textoAtesto.trim(), decreto: decreto.trim() },
      });
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['configuracoes', orgao!.id] }); toast.success('Configurações salvas.'); },
    onError: (e) => { const t = traduzirErro(e); if (!t.campo) setErros((x) => ({ ...x, geral: t.mensagem })); },
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
            <AreaTexto rotulo="Modelo do texto de atesto" value={textoAtesto} onChange={(e) => setTextoAtesto(e.target.value)} disabled={!podeEditar} rows={5}
              placeholder="Vazio = modelo padrão do MEASURE"
              ajuda="Variáveis: {objeto} {contrato} {fornecedor} {nota} {valor} {meses} {periodo} {processo} {decreto}" />
            <AreaTexto rotulo="Decreto / observação legal do atesto" value={decreto} onChange={(e) => setDecreto(e.target.value)} disabled={!podeEditar} rows={2}
              ajuda="Entra no lugar de {decreto} (ex.: número e artigo do decreto municipal aplicável)." />
            {erros.geral && <CaixaErro mensagem={erros.geral} />}
            {podeEditar && <div><Botao type="submit" carregando={salvar.isPending}>Salvar configurações</Botao></div>}
          </form>
        </Cartao>
      </div>
      <FormOrgao aberto={editandoOrgao} orgao={t} aoFechar={() => { setEditandoOrgao(false); void qc.invalidateQueries({ queryKey: ['orgao', orgao.id] }); }} />
    </>
  );
}
