import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Rol } from '../models';

// Los guards solo mejoran la experiencia; no sustituyen la autorización del servidor (RLS y RPC).

export const soloAutenticados: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.autenticado() ? true : router.createUrlTree(['/ingresar']);
};

export const soloInvitados: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.autenticado() ? router.createUrlTree([auth.rutaInicio()]) : true;
};

export const conRol =
  (rol: Rol): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.whenReady();
    if (!auth.autenticado()) return router.createUrlTree(['/ingresar']);
    return auth.rol() === rol ? true : router.createUrlTree([auth.rutaInicio()]);
  };

export const irAlInicio: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return router.createUrlTree([auth.rutaInicio()]);
};
