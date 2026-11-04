import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { urlArquivo } from '@/services/api';
import { cx } from './ui/basicos';

/** Imagem de bucket privado, por URL temporária; mostra `alternativa` enquanto não há foto */
export function ImagemPrivada({ caminho, alt, className, alternativa, bucket = 'arquivos' }: {
  caminho: string | null | undefined; alt: string; className?: string; alternativa: ReactNode; bucket?: 'arquivos' | 'avatares';
}) {
  const q = useQuery({ queryKey: ['url', bucket, caminho], queryFn: () => urlArquivo(bucket, caminho), enabled: !!caminho, staleTime: 45 * 60_000 });
  if (!caminho || !q.data) return <>{alternativa}</>;
  return <img src={q.data} alt={alt} className={cx('object-cover', className)} loading="lazy" />;
}

/** Valor com espera entre teclas (busca no servidor sem uma requisição por letra) */
export function useBuscaAtrasada(valor: string, ms = 300) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setAtrasado(valor.trim()), ms); return () => clearTimeout(t); }, [valor, ms]);
  return atrasado;
}
