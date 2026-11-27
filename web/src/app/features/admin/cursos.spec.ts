import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { Curso, Inscripcion } from '../../core/models';
import { Cursos } from './cursos';

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
  TestBed.configureTestingModule({ providers: [{ provide: AgendaApi, useValue: api }] });
  const fixture = TestBed.createComponent(Cursos);
  await fixture.whenStable();
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  return { html, api, fixture };
}

describe('Cursos (administrador)', () => {
  it('no muestra tarjetas de catálogo: solo filtros y lista', async () => {
    const { html } = await renderizar();
    expect(html.querySelector('.catalogo')).toBeNull();
    expect(html.querySelector('form')).not.toBeNull();
    expect(html.querySelector('app-lista-detalle')).not.toBeNull();
  });

  it('al entrar trae todas las inscripciones y las muestra en la tabla', async () => {
    const { html, api } = await renderizar();
    expect(api.inscripciones).toHaveBeenCalledWith({ cursoId: '', categoriaId: '', estado: '', busqueda: '' });
    expect(html.querySelector('#t-inscritos')?.textContent).toContain('Todas las personas inscritas');
    expect(html.querySelector('.fila-lista')?.textContent).toContain('Ana Prueba');
    expect(html.querySelector('.fila-lista')?.textContent).toContain('Pendiente');
  });

  it('al elegir en el filtro y buscar, filtra por esa opción', async () => {
    const { html, api, fixture } = await renderizar();
    const select = html.querySelector<HTMLSelectElement>('#f-curso')!;
    select.value = 'seg_drones';
    select.dispatchEvent(new Event('change'));
    html.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(api.inscripciones).toHaveBeenLastCalledWith({ cursoId: 'seg_drones', categoriaId: '', estado: '', busqueda: '' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html.querySelector('#t-inscritos')?.textContent).toContain('Inscritos en Operador de dron');
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

  it('muestra al lado el detalle de la primera, sin tablas ni ventanas', async () => {
    const { html } = await renderizar();
    expect(html.querySelector('table')).toBeNull();
    expect(html.querySelector('.fila-lista')?.getAttribute('aria-current')).toBe('true');
    expect(html.querySelector('app-detalle-inscripcion h2')?.textContent).toContain('Ana Prueba');
  });

});
