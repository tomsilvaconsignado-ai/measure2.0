// Bloco de endereço com preenchimento pelo CEP (se a consulta falhar, segue manual).
import { Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { formatarCep, somenteDigitos } from '@/lib/formatacao';
import { mensagemDeErro } from '@/lib/erros';
import { consultarCep } from '@/services/consultasPublicas';
import { BuscaSelect } from './ui/BuscaSelect';
import { Campo, Selecao } from './ui/basicos';
import { useSessao } from '@/auth/Sessao';
import { buscarUnidades } from '@/services/api';
import { TIPOS_UNIDADE } from '@/lib/tipos';

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export interface Endereco { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string }
export const enderecoVazio: Endereco = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };

export function enderecoDe(r: Partial<Record<keyof Endereco, string | null>> | null | undefined): Endereco {
  return {
    cep: formatarCep(r?.cep), logradouro: r?.logradouro ?? '', numero: r?.numero ?? '', complemento: r?.complemento ?? '',
    bairro: r?.bairro ?? '', cidade: r?.cidade ?? '', uf: r?.uf ?? '',
  };
}

/** Converte para gravar: vazio vira null, CEP só dígitos */
export function enderecoParaGravar(e: Endereco) {
  const n = (s: string) => s.trim() || null;
  return { cep: somenteDigitos(e.cep) || null, logradouro: n(e.logradouro), numero: n(e.numero), complemento: n(e.complemento), bairro: n(e.bairro), cidade: n(e.cidade), uf: e.uf || null };
}

export function CamposEndereco({ valor, aoMudar, erroCep, desabilitado }: { valor: Endereco; aoMudar: (e: Endereco) => void; erroCep?: string | null; desabilitado?: boolean }) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof Endereco) => (e: { target: { value: string } }) => aoMudar({ ...valor, [k]: e.target.value });

  const buscar = async (cep = valor.cep) => {
    if (somenteDigitos(cep).length !== 8) return;
    setBuscando(true); setErro(null);
    try {
      const r = await consultarCep(cep);
      aoMudar({ ...valor, cep: formatarCep(r.cep), logradouro: r.logradouro || valor.logradouro, bairro: r.bairro || valor.bairro, cidade: r.cidade || valor.cidade, uf: r.uf || valor.uf });
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setBuscando(false); }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <div className="relative sm:col-span-2">
        <Campo rotulo="CEP" value={valor.cep} inputMode="numeric" disabled={desabilitado} erro={erroCep ?? erro}
          ajuda="Digite o CEP para preencher o endereço."
          onChange={(e) => { const cep = formatarCep(e.target.value); aoMudar({ ...valor, cep }); if (somenteDigitos(cep).length === 8) void buscar(cep); }} />
        <button type="button" className="absolute right-2 top-[30px] rounded p-1 text-slate-500 hover:bg-slate-100" disabled={desabilitado}
          onClick={() => void buscar()} aria-label="Buscar endereço pelo CEP">
          {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </button>
      </div>
      <Campo className="sm:col-span-4" rotulo="Logradouro" value={valor.logradouro} onChange={set('logradouro')} disabled={desabilitado} maxLength={200} />
      <Campo className="sm:col-span-2" rotulo="Número" value={valor.numero} onChange={set('numero')} disabled={desabilitado} maxLength={20} />
      <Campo className="sm:col-span-4" rotulo="Complemento" value={valor.complemento} onChange={set('complemento')} disabled={desabilitado} maxLength={120} />
      <Campo className="sm:col-span-2" rotulo="Bairro" value={valor.bairro} onChange={set('bairro')} disabled={desabilitado} maxLength={120} />
      <Campo className="sm:col-span-3" rotulo="Cidade" value={valor.cidade} onChange={set('cidade')} disabled={desabilitado} maxLength={120} />
      <Selecao className="sm:col-span-1" rotulo="UF" value={valor.uf} onChange={set('uf')} disabled={desabilitado}>
        <option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}
      </Selecao>
    </div>
  );
}

/** Seletor de unidade da estrutura organizacional (busca no servidor) */
export function SeletorUnidadeOrg({ rotulo, valor, rotuloValor, aoMudar, erro, obrigatorio, ajuda }: {
  rotulo: string; valor: string | null; rotuloValor?: string | null; aoMudar: (id: string | null, rotulo: string | null) => void;
  erro?: string | null; obrigatorio?: boolean; ajuda?: string;
}) {
  const { orgao } = useSessao();
  return (
    <BuscaSelect rotulo={rotulo} valor={valor} rotuloValor={rotuloValor} erro={erro} obrigatorio={obrigatorio} ajuda={ajuda}
      aoMudar={(v, o) => aoMudar(v, o?.rotulo ?? null)} chave={['unidades-busca', orgao?.id]}
      buscar={async (t) => (await buscarUnidades(orgao!.id, t)).map((u) => ({ valor: u.id, rotulo: `${u.nome}${u.sigla ? ` (${u.sigla})` : ''}`, detalhe: TIPOS_UNIDADE[u.tipo] }))} />
  );
}
