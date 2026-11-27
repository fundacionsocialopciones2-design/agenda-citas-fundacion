import { computed, DOCUMENT, effect, inject, Service, signal } from '@angular/core';

export type PreferenciaTema = 'claro' | 'oscuro' | 'sistema';

/** La misma clave la lee el script de index.html antes de que arranque la app. */
export const CLAVE_TEMA = 'agenda-citas:tema';

function leer(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return v === 'oscuro' || v === 'sistema' ? v : 'claro';
  } catch {
    return 'claro'; // almacenamiento bloqueado
  }
}

/**
 * Apariencia elegida por la persona (claro por defecto, oscuro o la del equipo). Es una preferencia de este
 * navegador: no va a la base de datos. Aplica el atributo `data-color-scheme` en <html>, del que dependen los
 * colores de la app (styles.scss) y del calendario.
 */
@Service()
export class TemaService {
  private readonly documento = inject(DOCUMENT);
  private readonly consulta = this.documento.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly sistemaOscuro = signal(this.consulta?.matches ?? false);

  readonly preferencia = signal<PreferenciaTema>(leer());
  readonly oscuro = computed(() => this.preferencia() === 'oscuro' || (this.preferencia() === 'sistema' && this.sistemaOscuro()));

  constructor() {
    this.consulta?.addEventListener('change', (e) => this.sistemaOscuro.set(e.matches));
    effect(() => this.documento.documentElement.setAttribute('data-color-scheme', this.oscuro() ? 'dark' : 'light'));
  }

  elegir(preferencia: PreferenciaTema): void {
    this.preferencia.set(preferencia);
    try {
      localStorage.setItem(CLAVE_TEMA, preferencia);
    } catch {
      // sin almacenamiento: la elección dura solo esta visita
    }
  }
}
