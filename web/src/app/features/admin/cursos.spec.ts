import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { Curso, Inscripcion } from '../../core/models';
import { Cursos } from './cursos';
import { DetalleInscripcion } from './detalle-inscripcion';

const curso = (extra: Partial<Curso>): Curso => ({
  curso_id: 'id_ingles',
  titulo: 'Inglés',
  categoria_id: 'idiomas',
  categoria: 'Cursos de idiomas',
  grupo: null,
  activo: true,
  inscritos: 0,
  ...extra,
});

const CATALOGO: Curso[] = [
  curso({ curso_id: 'id_frances', titulo: 'Francés' }),
  curso({ inscritos: 2 }),
  curso({ curso_id: 'seg_drones', titulo: 'Operador de dron', categoria_id: 'seguridad', categoria: 'Cursos de seguridad privada', grupo: 'Cursos de formación', inscritos: 1 }),
];

const inscripcion = (extra: Partial<Inscripcion> = {}): Inscripcion => ({
  id: 1,
  creado: '2026-10-29T15:00:00Z',
  curso_id: 'id_ingles',
  curso: 'Inglés',
  categoria: 'Cursos de idiomas',
  nombre_completo: 'Ana Prueba',
  tipo_documento: 'CC',
  numero_documento: '1000000001',
  telefono: '573001112233',
  telefono_contacto: null,
  correo: 'ana@example.com',
  ciudad: 'Bogotá',
  direccion: null,
  modalidad: 'Virtual',
  estado: 'pendiente',
  autoriza_datos_at: '2026-10-29T15:00:00Z',
  ...extra,
});

async function renderizar(inscritos: Inscripcion[] = [inscripcion()]) {
  const api = { cursos: vi.fn().mockResolvedValue(CATALOGO), inscripciones: vi.fn().mockResolvedValue(inscritos) };
  const dialog = { open: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: AgendaApi, useValue: api }, { provide: MatDialog, useValue: dialog }] });
  const fixture = TestBed.createComponent(Cursos);
  await fixture.whenStable();
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  return { html, api, dialog, fixture };
}

describe('Cursos (administrador)', () => {
  it('muestra el catálogo agrupado por categoría con los inscritos de cada curso', async () => {
    const { html } = await renderizar();
    const categorias = Array.from(html.querySelectorAll('.catalogo-categoria h2')).map((h) => h.textContent!.replace(/\s+/g, ' ').trim());
    expect(categorias).toEqual(['Cursos de idiomas 2', 'Cursos de seguridad privada 1']);
    expect(html.querySelector('.catalogo-item--vacio')?.textContent).toContain('Francés');
    expect(html.textContent).toContain('Cursos de formación');
  });

  it('al entrar trae todas las inscripciones y las muestra en la tabla', async () => {
    const { html, api } = await renderizar();
    expect(api.inscripciones).toHaveBeenCalledWith({ cursoId: '', categoriaId: '', estado: '', busqueda: '' });
    expect(html.querySelector('#t-inscritos')?.textContent).toContain('Todas las personas inscritas');
    expect(html.querySelector('tbody tr')?.textContent).toContain('Ana Prueba');
    expect(html.querySelector('tbody tr')?.textContent).toContain('Pendiente');
  });

  it('al elegir un curso del catálogo filtra por ese curso y su categoría', async () => {
    const { html, api, fixture } = await renderizar();
    const boton = Array.from(html.querySelectorAll<HTMLButtonElement>('button.catalogo-item')).find((b) => b.textContent?.includes('Operador de dron'))!;
    boton.click();
    await vi.waitFor(() => expect(api.inscripciones).toHaveBeenLastCalledWith({ cursoId: 'seg_drones', categoriaId: 'seguridad', estado: '', busqueda: '' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(html.querySelector('#t-inscritos')?.textContent).toContain('Inscritos en Operador de dron');
  });

  it('volver a pulsar el curso elegido quita el filtro', async () => {
    const { html, api } = await renderizar();
    const boton = () => Array.from(html.querySelectorAll<HTMLButtonElement>('button.catalogo-item')).find((b) => b.textContent?.includes('Inglés'))!;
    boton().click();
    await vi.waitFor(() => expect(api.inscripciones).toHaveBeenCalledTimes(2));
    boton().click();
    await vi.waitFor(() => expect(api.inscripciones).toHaveBeenLastCalledWith({ cursoId: '', categoriaId: '', estado: '', busqueda: '' }));
  });

  it('al cambiar de categoría el selector de cursos solo ofrece los de esa categoría', async () => {
    const { html, fixture } = await renderizar();
    const categoria = html.querySelector<HTMLSelectElement>('#f-cat')!;
    categoria.value = 'seguridad';
    categoria.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const opciones = Array.from(html.querySelectorAll<HTMLOptionElement>('#f-curso option')).map((o) => o.value);
    expect(opciones).toEqual(['', 'seg_drones']);
  });

  it('sin resultados muestra un mensaje vacío', async () => {
    const { html } = await renderizar([]);
    expect(html.textContent).toContain('No hay inscritos con estos filtros');
  });

  it('«Ver» abre el detalle con toda la información de la persona', async () => {
    const { html, dialog } = await renderizar();
    Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ver')!.click();
    expect(dialog.open).toHaveBeenCalledWith(DetalleInscripcion, expect.objectContaining({ data: expect.objectContaining({ nombre_completo: 'Ana Prueba' }) }));
  });
});
