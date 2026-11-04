// Marca provisória da plataforma MEASURE (substituir pelo logotipo oficial quando enviado).
export function Simbolo({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="MEASURE">
      <rect width="48" height="48" rx="11" fill="#0f2a4a" />
      <rect x="10" y="26" width="6" height="12" rx="1.5" fill="#5687cf" />
      <rect x="19" y="18" width="6" height="20" rx="1.5" fill="#8ab0e1" />
      <rect x="28" y="12" width="6" height="26" rx="1.5" fill="#dbe7f6" />
      <path d="M9 21 L21 12 L28 16 L39 9" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="39" cy="9" r="2.6" fill="#ffffff" />
    </svg>
  );
}

export function Marca({ clara = false, subtitulo = true }: { clara?: boolean; subtitulo?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Simbolo />
      <span className="leading-tight">
        <span className={`block text-lg font-bold tracking-[0.22em] ${clara ? 'text-white' : 'text-marca-900'}`}>MEASURE</span>
        {subtitulo && <span className={`block text-[10px] font-medium uppercase tracking-wider ${clara ? 'text-marca-200' : 'text-slate-500'}`}>Gestão pública 2.0</span>}
      </span>
    </span>
  );
}
