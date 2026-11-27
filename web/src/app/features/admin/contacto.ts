/** Enlaces para contactar a quien reportó una solicitud por WhatsApp. */
export interface DatosContacto {
  /** Número del WhatsApp que escribió al bot (con indicativo, solo dígitos). */
  telefono: string;
  /** Teléfono que la persona indicó para llamarla (puede no tener indicativo). */
  telefono_contacto: string | null;
}

const digitos = (v: string): string => v.replace(/\D/g, '');

/** Teléfono preferido para llamar: el de contacto y, si no dio uno, el de WhatsApp. */
export function telefonoParaLlamar(d: DatosContacto): string {
  const contacto = d.telefono_contacto?.trim();
  if (!contacto) return `+${digitos(d.telefono)}`;
  return contacto.startsWith('+') ? `+${digitos(contacto)}` : digitos(contacto);
}

export const enlaceLlamada = (d: DatosContacto): string => `tel:${telefonoParaLlamar(d)}`;

/** El chat de WhatsApp se abre con el número que escribió al bot (ya trae el indicativo del país). */
export const enlaceWhatsApp = (d: DatosContacto): string => `https://wa.me/${digitos(d.telefono)}`;
