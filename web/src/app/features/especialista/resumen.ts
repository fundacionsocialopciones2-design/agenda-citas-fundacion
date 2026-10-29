// Presentación de las cifras del dashboard del especialista. Las cifras las calcula la base de datos (my_dashboard);
// aquí solo se convierten en texto.

export interface Comparacion {
  /** Frase completa, para lectores de pantalla. */
  texto: string;
  /** Versión corta para la pastilla visible: «+3 vs. ayer». */
  corto: string;
  icono: 'arrow_upward' | 'arrow_downward' | 'drag_handle';
}

/**
 * «3 más que ayer», «2 menos que el mes anterior», «Igual que la semana anterior».
 * `abreviada` es la referencia en la pastilla corta (p. ej. «sem. anterior»); por defecto, la misma.
 * No valora el cambio (más citas o más canceladas no es «bueno» o «malo» por sí solo): solo lo describe.
 */
export function comparar(actual: number, anterior: number, referencia: string, abreviada: string = referencia): Comparacion {
  const dif = actual - anterior;
  if (dif === 0) return { texto: `Igual que ${referencia}`, corto: `Igual que ${abreviada}`, icono: 'drag_handle' };
  return dif > 0
    ? { texto: `${dif} más que ${referencia}`, corto: `+${dif} vs. ${abreviada}`, icono: 'arrow_upward' }
    : { texto: `${-dif} menos que ${referencia}`, corto: `−${-dif} vs. ${abreviada}`, icono: 'arrow_downward' };
}

/** Saludo según la hora local de Bogotá (0–23). */
export function saludoDe(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

const fmtPorcentaje = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 1 });

/** Fracción 0–1 → «33,3 %»; null → «—». */
export const porcentaje = (fraccion: number | null): string => (fraccion === null ? '—' : fmtPorcentaje.format(fraccion));

const fmtDiaSemana = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'short' });
const fmtDiaSemanaLargo = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

/** YYYY-MM-DD → «lun.» (la fecha es un día calendario, no un instante). */
export const diaSemanaCorto = (fecha: string): string => {
  const t = fmtDiaSemana.format(new Date(`${fecha}T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** YYYY-MM-DD → «lunes, 26 de octubre». */
export const diaSemanaLargo = (fecha: string): string => fmtDiaSemanaLargo.format(new Date(`${fecha}T12:00:00Z`));

/** Cuánto falta para una cita: «En curso», «En 45 min», «En 3 h» o null si es otro día lejano (>= 24 h). */
export function cuantoFalta(inicioIso: string, ahora: Date): string | null {
  const minutos = Math.round((Date.parse(inicioIso) - ahora.getTime()) / 60000);
  if (minutos <= 0) return 'En curso';
  if (minutos < 60) return `En ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return horas < 24 ? `En ${horas} h` : null;
}
