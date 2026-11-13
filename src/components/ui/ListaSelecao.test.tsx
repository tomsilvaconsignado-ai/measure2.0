import { createElement as h, Fragment } from 'react';
import { describe, expect, it } from 'vitest';
import { lerOpcoes } from './ListaSelecao';

describe('lerOpcoes (opções da seleção no padrão do app)', () => {
  it('lê valor e rótulo das <option>, inclusive texto composto', () => {
    const r = lerOpcoes([
      h('option', { key: 'a', value: '' }, 'Todos os papéis'),
      h('option', { key: 'b', value: 'MASTER' }, 'Master', ' (somente leitura)'),
      h('option', { key: 'c', value: 2026 }, 2026),
    ]);
    expect(r).toEqual([
      { valor: '', rotulo: 'Todos os papéis', desabilitado: false, grupo: undefined },
      { valor: 'MASTER', rotulo: 'Master (somente leitura)', desabilitado: false, grupo: undefined },
      { valor: '2026', rotulo: '2026', desabilitado: false, grupo: undefined },
    ]);
  });

  it('sem value usa o texto; respeita disabled; ignora o que não é opção', () => {
    const r = lerOpcoes([h('option', { key: 'a' }, 'Ativos'), h('option', { key: 'b', value: 'X', disabled: true }, 'Bloqueada'), false, null, 'solto']);
    expect(r.map((i) => [i.valor, i.desabilitado])).toEqual([['Ativos', false], ['X', true]]);
  });

  it('entra em fragmentos, listas e grupos (optgroup)', () => {
    const r = lerOpcoes(h(Fragment, null,
      h('option', { value: '' }, 'Escolha…'),
      [h('option', { key: 1, value: '1' }, 'Um')],
      h('optgroup', { label: 'DVAS' }, h('option', { value: 'REAP' }, 'REAP'), h('option', { value: 'REUE' }, 'REUE')),
    ));
    expect(r.map((i) => `${i.grupo ?? '-'}:${i.valor}`)).toEqual(['-:', '-:1', 'DVAS:REAP', 'DVAS:REUE']);
  });
});
