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
