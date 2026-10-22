import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { InactividadService } from './core/inactividad.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    inject(InactividadService); // arranca la vigilancia de inactividad (solo actúa con una sesión iniciada)

    // Si la sesión se pierde sin que esta pestaña lo pida (otra pestaña cerró sesión, expiró), se vuelve al ingreso.
    effect(() => {
      if (this.auth.sesionPerdida() > 0) void this.router.navigate(['/ingresar'], { queryParams: { motivo: 'sesion' } });
    });
  }
}
