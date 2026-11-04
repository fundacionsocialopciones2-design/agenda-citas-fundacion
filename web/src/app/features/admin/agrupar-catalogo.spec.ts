import { describe, expect, it } from 'vitest';
import { agruparPorCategoria } from './agrupar-catalogo';

const item = (id: string, categoria_id: string | null, categoria: string, n = 0) => ({ id, categoria_id, categoria, n });

describe('agruparPorCategoria', () => {
  it('agrupa conservando el orden recibido, suma la cantidad y deja «Otros» al final', () => {
    const r = agruparPorCategoria(
      [
        item('__sin_curso', null, 'Otros', 1),
        item('id_frances', 'idiomas', 'Cursos de idiomas', 0),
        item('id_ingles', 'idiomas', 'Cursos de idiomas', 3),
        item('tec_sst', 'tecnicos', 'Técnicos laborales', 1),
      ],
      (x) => x.n,
    );
    expect(r.map((g) => g.nombre)).toEqual(['Cursos de idiomas', 'Técnicos laborales', 'Otros']);
    expect(r[0].elementos.map((x) => x.id)).toEqual(['id_frances', 'id_ingles']);
    expect(r[0].total).toBe(3);
    expect(r[2].id).toBeNull();
  });

  it('un catálogo vacío da una lista vacía', () => {
    expect(agruparPorCategoria([], () => 0)).toEqual([]);
  });
});
