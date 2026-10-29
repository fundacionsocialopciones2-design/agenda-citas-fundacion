// Todas las fechas se muestran en America/Bogota (UTC-5, sin horario de verano) y se guardan en timestamptz.
const ZONA = 'America/Bogota';

const fmtFechaHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' });
const fmtFecha = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtIsoFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });

const fmtFechaLarga = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Ej.: «Sábado 31 de octubre de 2026». */
export const fechaLargaBogota = (iso: string): string => {
  const texto = fmtFechaLarga.format(new Date(iso));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

export const fechaHoraBogota = (iso: string): string => fmtFechaHora.format(new Date(iso));
export const fechaBogota = (iso: string): string => fmtFecha.format(new Date(iso));
export const horaBogota = (iso: string): string => fmtHora.format(new Date(iso));

const fmtHoraDelDia = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', hourCycle: 'h23' });
/** Hora (0–23) de un instante en Bogotá. */
export const horaDelDiaBogota = (d: Date): number => Number(fmtHoraDelDia.format(d)) % 24;

const fmtDiaMes =new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short' });
/** Ej.: «27 oct». */
export const diaMesBogota = (iso: string): string => fmtDiaMes.format(new Date(iso));

/** YYYY-MM-DD de un instante, en hora de Bogotá. */
export const diaBogota = (iso: string | Date): string => fmtIsoFecha.format(typeof iso === 'string' ? new Date(iso) : iso);

export const hoyBogota = (): string => diaBogota(new Date());

/** Convierte fecha (YYYY-MM-DD) y hora (HH:mm) de Bogotá a instante ISO (UTC). */
export const bogotaAIso = (fecha: string, hora: string): string => new Date(`${fecha}T${hora.slice(0, 5)}:00-05:00`).toISOString();

export const sumarDias = (fecha: string, dias: number): string => {
  const d = new Date(`${fecha}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() + dias);
  return diaBogota(d);
};

/** HH:mm de un valor time de Postgres (HH:MM:SS). */
export const horaCorta = (t: string): string => t.slice(0, 5);
