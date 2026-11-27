import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { FilaLista, ListaDetalle } from './lista-detalle';

const fila = (id: number): FilaLista => ({ id, titulo: `Persona ${id}`, fecha: 'hoy', resumen: 'algo' });

@Component({
  imports: [ListaDetalle],
  template: `
    <app-lista-detalle etiqueta="Prueba" [filas]="filas()" [(seleccion)]="seleccion">
      <ng-template let-id><h2 tabindex="-1">Detalle {{ id }}</h2></ng-template>
    </app-lista-detalle>
  `,
})
class Anfitrion {
  readonly filas = signal([fila(1), fila(2)]);
  readonly seleccion = signal<number | null>(null);
}

async function renderizar(angosto = false) {
  TestBed.configureTestingModule({
    providers: [{ provide: BreakpointObserver, useValue: { observe: () => of({ matches: angosto, breakpoints: {} }) } }],
  });
  const fixture = TestBed.createComponent(Anfitrion);
  const estabilizar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await estabilizar();
  const html = fixture.nativeElement as HTMLElement;
  const filas = () => Array.from(html.querySelectorAll<HTMLButtonElement>('.fila-lista'));
  const titulo = () => html.querySelector('h2')?.textContent?.trim();
  return { html, anfitrion: fixture.componentInstance, estabilizar, filas, titulo };
}

describe('ListaDetalle', () => {
  it('en pantalla ancha elige la primera y, si deja de estar, pasa a la que quede', async () => {
    const { anfitrion, filas, titulo, estabilizar } = await renderizar();
    expect(titulo()).toBe('Detalle 1');
    filas()[1].click();
    await estabilizar();
    expect(titulo()).toBe('Detalle 2');
    anfitrion.filas.set([fila(1)]);
    await estabilizar();
    expect(titulo()).toBe('Detalle 1');
  });

  const veinte = Array.from({ length: 20 }, (_, i) => fila(i + 1));
  const pagina = (html: HTMLElement, nombre: 'anterior' | 'siguiente') => html.querySelector<HTMLButtonElement>(`[aria-label="Página ${nombre}"]`)!;
  const rango = (html: HTMLElement) => html.querySelector('.paginas p')?.textContent?.replace(/\s+/g, ' ').trim();

  it('sin pasar de 8 no muestra controles de página', async () => {
    const { html } = await renderizar();
    expect(html.querySelector('.paginas')).toBeNull();
  });

  it('muestra de 8 en 8 y al cambiar de página elige la primera de ella', async () => {
    const { html, anfitrion, filas, titulo, estabilizar } = await renderizar();
    anfitrion.filas.set(veinte);
    await estabilizar();
    expect(filas()).toHaveLength(8);
    expect(rango(html)).toBe('1–8 de 20 · Página 1 de 3');
    expect(pagina(html, 'anterior').getAttribute('aria-disabled')).toBe('true');

    pagina(html, 'siguiente').click();
    await estabilizar();
    expect(titulo()).toBe('Detalle 9');
    pagina(html, 'siguiente').click();
    await estabilizar();
    expect(filas()).toHaveLength(4);
    expect(rango(html)).toBe('17–20 de 20 · Página 3 de 3');
    pagina(html, 'siguiente').click(); // ya es la última
    await estabilizar();
    expect(titulo()).toBe('Detalle 17');
  });

  it('si la elegida desaparece se queda en la misma página, y si la página sobra pasa a la anterior', async () => {
    const { html, anfitrion, titulo, estabilizar } = await renderizar();
    anfitrion.filas.set(veinte);
    await estabilizar();
    pagina(html, 'siguiente').click();
    await estabilizar();
    anfitrion.filas.set(veinte.filter((f) => f.id !== 9));
    await estabilizar();
    expect(titulo()).toBe('Detalle 10');
    expect(rango(html)).toContain('Página 2 de 3');
    anfitrion.filas.set(veinte.slice(0, 5));
    await estabilizar();
    expect(titulo()).toBe('Detalle 1');
    expect(html.querySelector('.paginas')).toBeNull();
  });

  it('una recarga muestra la página donde quedó la elegida', async () => {
    const { html, anfitrion, filas, titulo, estabilizar } = await renderizar();
    anfitrion.filas.set(veinte);
    await estabilizar();
    filas()[7].click();
    await estabilizar();
    anfitrion.filas.set([fila(99), ...veinte]);
    await estabilizar();
    expect(titulo()).toBe('Detalle 8');
    expect(rango(html)).toContain('Página 2 de 3');
  });

  it('en pantalla angosta conserva la página al volver del detalle', async () => {
    const { html, anfitrion, filas, estabilizar } = await renderizar(true);
    anfitrion.filas.set(veinte);
    await estabilizar();
    pagina(html, 'siguiente').click();
    await estabilizar();
    filas()[0].click();
    await estabilizar();
    html.querySelector<HTMLButtonElement>('.volver')!.click();
    await estabilizar();
    expect(rango(html)).toContain('Página 2 de 3');
  });

  it('en pantalla angosta muestra una cosa a la vez', async () => {
    const { html, filas, titulo, estabilizar } = await renderizar(true);
    expect(titulo()).toBeUndefined();
    filas()[1].click();
    await estabilizar();
    expect(filas()).toHaveLength(0);
    expect(titulo()).toBe('Detalle 2');
    html.querySelector<HTMLButtonElement>('.volver')!.click();
    await estabilizar();
    expect(filas()).toHaveLength(2);
    expect(titulo()).toBeUndefined();
  });
});
