import { Routes } from '@angular/router';
import { conRol, irAlInicio, soloInvitados } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [irAlInicio], children: [] },
  {
    path: 'ingresar',
    title: 'Iniciar sesión · Agenda de citas',
    canActivate: [soloInvitados],
    loadComponent: () => import('./features/acceso/ingresar').then((m) => m.Ingresar),
  },
  {
    path: 'recuperar',
    title: 'Recuperar contraseña · Agenda de citas',
    loadComponent: () => import('./features/acceso/recuperar').then((m) => m.Recuperar),
  },
  {
    path: 'restablecer',
    title: 'Crear contraseña · Agenda de citas',
    loadComponent: () => import('./features/acceso/restablecer').then((m) => m.Restablecer),
  },
  {
    path: 'admin',
    canActivate: [conRol('admin')],
    loadComponent: () => import('./shared/marco').then((m) => m.Marco),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'agenda' },
      { path: 'agenda', title: 'Agenda · Agenda de citas', loadComponent: () => import('./features/admin/agenda').then((m) => m.AgendaAdmin) },
      { path: 'especialistas', title: 'Especialistas · Agenda de citas', loadComponent: () => import('./features/admin/especialistas').then((m) => m.Especialistas) },
      { path: 'horarios', title: 'Horarios · Agenda de citas', loadComponent: () => import('./features/admin/horarios').then((m) => m.Horarios) },
    ],
  },
  {
    path: 'mi-agenda',
    canActivate: [conRol('especialista')],
    loadComponent: () => import('./shared/marco').then((m) => m.Marco),
    children: [{ path: '', title: 'Mi agenda · Agenda de citas', loadComponent: () => import('./features/especialista/mi-agenda').then((m) => m.MiAgenda) }],
  },
  { path: '**', redirectTo: '' },
];
