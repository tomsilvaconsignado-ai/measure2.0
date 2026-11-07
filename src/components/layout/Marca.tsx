// Marca oficial da plataforma MEASURE. As versões "clara" trocam o azul-marinho por branco, para fundos escuros.
import logo from '@/assets/marca/logo-measure.png';
import logoClara from '@/assets/marca/logo-measure-clara.png';
import palavra from '@/assets/marca/palavra-measure.png';
import palavraClara from '@/assets/marca/palavra-measure-clara.png';
import simbolo from '@/assets/marca/simbolo-measure.png';
import simboloClaro from '@/assets/marca/simbolo-measure-clara.png';

/** Só o símbolo (o "M" com as barras) */
export function Simbolo({ className = 'h-9 w-auto', clara = false }: { className?: string; clara?: boolean }) {
  return <img src={clara ? simboloClaro : simbolo} alt="MEASURE" className={className} draggable={false} />;
}

/** Logotipo completo, com o símbolo sobre o nome (tela de entrada) */
export function LogoCompleto({ className = 'h-28 w-auto', clara = false }: { className?: string; clara?: boolean }) {
  return <img src={clara ? logoClara : logo} alt="MEASURE" className={className} draggable={false} />;
}

/** Símbolo e nome lado a lado (menu, cabeçalhos e telas de carregamento) */
export function Marca({ clara = false, subtitulo = true }: { clara?: boolean; subtitulo?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Simbolo clara={clara} className="h-10 w-auto" />
      <span className="flex flex-col gap-1 leading-tight">
        <img src={clara ? palavraClara : palavra} alt="" aria-hidden className="h-[15px] w-auto self-start" draggable={false} />
        {subtitulo && <span className={`block text-[10px] font-medium uppercase tracking-wider ${clara ? 'text-marca-200' : 'text-slate-500'}`}>Gestão pública 2.0</span>}
      </span>
    </span>
  );
}
