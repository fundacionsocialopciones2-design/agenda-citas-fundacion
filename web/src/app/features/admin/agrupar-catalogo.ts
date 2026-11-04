/** Lo mínimo que necesita un elemento del catálogo (curso o tipo de asesoría) para agruparse. */
export interface ElementoCatalogo {
  categoria_id: string | null;
  categoria: string;
}

export interface CategoriaCatalogo<T extends ElementoCatalogo> {
  /** Id de la rama del menú del bot; null para «Otros» (elementos retirados del menú o sin vínculo). */
  id: string | null;
  nombre: string;
  total: number;
  elementos: T[];
}

/**
 * Agrupa un catálogo (ya ordenado por la base de datos: categoría, grupo, título) por categoría,
 * conservando ese orden y dejando «Otros» al final. `cantidad` dice cuánto suma cada elemento al total
 * (inscritos o solicitudes). Solo presentación: no filtra ni cuenta registros.
 */
export function agruparPorCategoria<T extends ElementoCatalogo>(items: T[], cantidad: (item: T) => number): CategoriaCatalogo<T>[] {
  const grupos = new Map<string, CategoriaCatalogo<T>>();
  for (const item of items) {
    const clave = item.categoria_id ?? '__otros';
    let g = grupos.get(clave);
    if (!g) {
      g = { id: item.categoria_id, nombre: item.categoria_id ? item.categoria : 'Otros', total: 0, elementos: [] };
      grupos.set(clave, g);
    }
    g.elementos.push(item);
    g.total += cantidad(item);
  }
  return [...grupos.values()].sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : 0));
}
