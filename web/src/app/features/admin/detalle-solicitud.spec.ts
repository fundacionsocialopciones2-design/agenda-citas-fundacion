import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { describe, expect, it } from 'vitest';
import { SolicitudAsesoria } from '../../core/models';
import { DetalleSolicitud } from './detalle-solicitud';

const solicitud = (extra: Partial<SolicitudAsesoria> = {}): SolicitudAsesoria => ({
  id: 1,
  creado: '2026-10-29T15:00:00Z',
  servicio_id: 'jur_peticion',
  servicio: 'Derechos de petición',
  categoria: 'Asesoría jurídica',
  nombre_completo: 'Ana Prueba',
  tipo_documento: 'CC',
  numero_documento: '1000000001',
  telefono: '573001112233',
  telefono_contacto: null,
  correo: 'ana@example.com',
  modalidad: 'Presencial',
  direccion: null,
  detalle: 'Necesito pedir\nmi historia laboral',
  preferencia: 'Mañanas',
  estado: 'agendada',
  notas: null,
  autoriza_datos_at: '2026-10-29T15:00:00Z',
  ...extra,
});

function renderizar(s: SolicitudAsesoria): HTMLElement {
  TestBed.configureTestingModule({ providers: [{ provide: MAT_DIALOG_DATA, useValue: s }] });
  const fixture = TestBed.createComponent(DetalleSolicitud);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DetalleSolicitud', () => {
  it('muestra el caso, la preferencia, el estado y los enlaces de contacto', () => {
    const html = renderizar(solicitud());
    expect(html.querySelector('.caso')?.textContent).toBe('Necesito pedir\nmi historia laboral');
    expect(html.textContent).toContain('Mañanas');
    expect(html.querySelector('.chip--agendada')?.textContent).toBe('Agendada');
    expect(html.querySelector('a[href="tel:+573001112233"]')).not.toBeNull();
    expect(html.querySelector('a[href="mailto:ana@example.com"]')).not.toBeNull();
  });

  it('indica los datos que no se registraron en lugar de dejarlos vacíos', () => {
    const html = renderizar(solicitud({ numero_documento: null, tipo_documento: null, correo: null, detalle: null }));
    expect(html.textContent).toContain('No escribió detalles del caso.');
    expect(html.querySelectorAll('.ayuda').length).toBeGreaterThan(0);
    expect(html.textContent).not.toContain('null');
  });
});
