// Salvar documentos numa pasta do computador: pede a pasta no clique, gera os arquivos, confere os que já
// existem (pergunta antes de substituir) e grava todos com os nomes padronizados.
import { AlertTriangle } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { ERRO_SALVAR, escolherDestino, salvarArquivos, suportaPasta } from '@/lib/salvarEmPasta';
import { Botao } from './ui/basicos';
import { Modal } from './ui/Modal';

export function useSalvarEmPasta() {
  const [ocupado, setOcupado] = useState(false);
  const [existentes, setExistentes] = useState<string[] | null>(null);
  const resposta = useRef<((v: boolean) => void) | null>(null);

  const confirmar = (nomes: string[]) => new Promise<boolean>((ok) => { resposta.current = ok; setExistentes(nomes); });
  const responder = (v: boolean) => { resposta.current?.(v); resposta.current = null; setExistentes(null); };

  /** Chamar direto no clique (o navegador só abre a escolha de pasta em resposta a um clique) */
  const salvar = useCallback(async (nomes: string[], gerar: () => Promise<Blob[]>, sucesso: { pasta: string; download: string }): Promise<'salvo' | 'cancelado' | null> => {
    let destino;
    try { destino = await escolherDestino(); }
    catch (e) { toast.error(`${ERRO_SALVAR} (${mensagemDeErro(e)})`); return null; }
    if (!destino) { toast.info('Escolha de pasta cancelada. Nada foi salvo.'); return null; }
    setOcupado(true);
    const aviso = toast.loading(destino.tipo === 'pasta' ? `Gerando e salvando em "${destino.pasta.name}"...` : 'Gerando os arquivos...');
    try {
      const r = await salvarArquivos(destino, nomes, gerar, confirmar);
      if (r === 'cancelado') toast.info('Nada foi substituído nem salvo.', { id: aviso });
      else if (destino.tipo === 'pasta') toast.success(sucesso.pasta, { id: aviso, description: nomes.join(', ') });
      else toast.success(sucesso.download, {
        id: aviso, duration: 9000,
        description: `Este navegador não permite escolher a pasta: os arquivos (${nomes.join(', ')}) foram para a pasta de downloads. No Chrome ou no Edge do computador, dá para escolher a pasta.`,
      });
      return r;
    } catch (e) {
      const m = mensagemDeErro(e);
      toast.error(/gerad|montado/i.test(m) ? m : ERRO_SALVAR, { id: aviso, description: /gerad|montado/i.test(m) ? undefined : m });
      return null;
    } finally { setOcupado(false); }
  }, []);

  const dialogo = (
    <Modal aberto={!!existentes} aoFechar={() => responder(false)} titulo="Arquivos já existem na pasta" largura="sm"
      rodape={<><Botao variante="secundario" onClick={() => responder(false)}>Cancelar</Botao><Botao variante="perigo" onClick={() => responder(true)}>Substituir</Botao></>}>
      <p className="flex items-start gap-2 text-sm text-slate-700"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        A pasta escolhida já tem {existentes?.length === 1 ? 'um arquivo' : 'arquivos'} com o mesmo nome. Substituir apaga a versão anterior; Cancelar não salva nada.</p>
      <ul className="mt-3 list-disc pl-6 text-sm font-medium">{existentes?.map((n) => <li key={n}>{n}</li>)}</ul>
    </Modal>
  );
  return { salvar, ocupado, dialogo, pastaDisponivel: suportaPasta() };
}
