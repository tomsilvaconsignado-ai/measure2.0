// Seleção múltipla com busca no servidor: cada item escolhido vira uma etiqueta removível.
import { X } from 'lucide-react';
import { BuscaSelect, type Opcao } from './BuscaSelect';

export interface Item { id: string; rotulo: string }

export function MultiBusca({ rotulo, itens, aoMudar, buscar, chave, placeholder }: {
  rotulo: string; itens: Item[]; aoMudar: (itens: Item[]) => void; buscar: (termo: string) => Promise<Opcao[]>; chave: unknown[]; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <BuscaSelect rotulo={rotulo} valor={null} placeholder={placeholder ?? (itens.length ? 'Adicionar outro…' : 'Digite para buscar…')}
        chave={[...chave, itens.length]}
        aoMudar={(v, o) => { if (v && o && !itens.some((i) => i.id === v)) aoMudar([...itens, { id: v, rotulo: o.rotulo }]); }}
        buscar={async (t) => (await buscar(t)).filter((o) => !itens.some((i) => i.id === o.valor))} />
      {itens.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${rotulo} selecionados`}>
          {itens.map((i) => (
            <li key={i.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-marca-50 px-2 py-0.5 text-xs text-marca-900 ring-1 ring-marca-200">
              <span className="truncate">{i.rotulo}</span>
              <button type="button" className="rounded p-0.5 hover:bg-marca-100" aria-label={`Remover ${i.rotulo}`} onClick={() => aoMudar(itens.filter((x) => x.id !== i.id))}><X className="size-3" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
