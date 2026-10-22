import { CitaEspecialista } from './models';

/**
 * Citas que aún importan al especialista: confirmadas y que todavía no terminaron (incluye la que está en curso),
 * ordenadas de la más cercana a la más lejana.
 */
export function proximasCitas(citas: readonly CitaEspecialista[], ahora: Date): CitaEspecialista[] {
  const limite = ahora.getTime();
  return citas
    .filter((c) => c.status === 'confirmada' && Date.parse(c.ends_at) > limite)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** «Hoy» o «Mañana» si corresponde (días en formato YYYY-MM-DD, hora de Bogotá); si no, null. */
export function marcaRelativa(dia: string, hoy: string, manana: string): 'Hoy' | 'Mañana' | null {
  if (dia === hoy) return 'Hoy';
  if (dia === manana) return 'Mañana';
  return null;
}
