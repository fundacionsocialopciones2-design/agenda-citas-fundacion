# Frontend (`web/`)

Dashboard de administración y calendario de especialistas de la Fundación Social Opciones. Es un cliente delgado: las reglas de agenda viven en Postgres (`../supabase/`).

## Comandos
Todos se ejecutan dentro de `web/` y exigen **Node 24.22** (`nvm use 24.22.0`; Node 20 también está instalado y rompe Angular 22). `ng` desde la raíz del repo falla ("outside a workspace").
- Dev: `npm start` (`ng serve`, puerto 4200)
- Build: `npm run build` (producción por defecto). Desarrollo: `npx ng build --configuration development`
- Build en observación: `npm run watch`
- Test: `npx ng test --watch=false` (`npm test` queda en modo observación)
- Test de un archivo: `npx ng test --watch=false --include=src/app/core/proximas-citas.spec.ts` (opción documentada; no verificada en este repo)
- Sin lint ni formateo configurados (`prettier` está instalado, sin script).
- El MCP de Angular CLI (`.mcp.json`) es la vía preferida para compilar y probar (`run_target`); el usuario espera que se consulten `get_best_practices` y `search_documentation` antes de escribir código Angular. A veces agota el tiempo al conectar: usar `npx ng` como alternativa.

## Stack
- Runtime/herramientas: Node 24.22 LTS, npm 11, TypeScript ~6.0 (modo estricto: `strict: true` declarado explícitamente; TS 6 ya lo activa por defecto)
- Framework: Angular 22.2 — componentes standalone, zoneless, OnPush por defecto, señales; builder `@angular/build:application` (esbuild)
- UI: Angular Material + CDK 22 (tema Material 3 en SCSS, colores de la fundación) y estilos globales en `src/styles.scss`; fuentes Nunito Sans y Material Symbols desde Google Fonts
- Calendario: FullCalendar 7.1 (`@fullcalendar/angular`, MIT) + `temporal-polyfill`
- Backend: Supabase (`@supabase/supabase-js` 2.x) — Auth, PostgREST (RPC y tablas con RLS) y Edge Functions
- Formularios: Signal Forms (`@angular/forms/signals`) en las pantallas de acceso; señales + inputs nativos en los diálogos
- Estado: señales; sin NgRx. RxJS solo aparece a través de `MatDialog.afterClosed()`
- Tests: Vitest 5 + jsdom (`@angular/build:unit-test`)
- Idioma y zona horaria: solo español (`LOCALE_ID es-CO`); fechas en America/Bogota

## Arquitectura
- **Capas obligatorias**: componente (`features/*`) → servicio de acceso (`core/`: `AgendaApi` para datos, `AuthService` para sesión) → Supabase (RPC/RLS) → Postgres. NUNCA saltar capas: ningún componente importa `@supabase/supabase-js` ni `SupabaseService`. Hoy solo tres archivos tocan Supabase (`agenda.api.ts`, `auth/auth.service.ts`, `supabase.service.ts`); mantenerlo así.
- **Sin lógica de negocio en el cliente**: disponibilidad, reservas, conflictos y permisos los decide la base de datos. Las validaciones de Angular son comodidad; los guards son solo UX (la autorización real es RLS y `is_admin()`).
- **Sin ORM ni tipos generados**: acceso por RPC/queries con tipos propios en `core/models.ts` (los casts viven en `AgendaApi`).
- **Errores**: `AgendaApi` convierte los errores de Postgres/Edge Function en `ErrorApi` / `ErrorConflicto` (`AG409`, citas futuras en conflicto); las pantallas los capturan y los muestran. Detalle en `src/app/core/CLAUDE.md`.
- **Estado**: servicios globales con señales (`AuthService`, `InactividadService`) y estado local en cada componente con `signal`/`computed`. Los datos se piden al entrar a la pantalla (sin caché).
- **Arranque**: `main.ts` → `app.config.ts` (proveedores: router con `withComponentInputBinding`, locale, Material) → `App`, que instancia `InactividadService` y redirige a `/ingresar` si la sesión se pierde. Rutas perezosas en `app.routes.ts` protegidas con `conRol('admin' | 'especialista')`.
- **Presupuesto de bundle**: el build de producción emite una advertencia (inicial 735 kB frente al aviso de 500 kB; el límite de error es 1 MB). El presupuesto de estilos por componente se subió a aviso 8 kB / error 12 kB porque el CSS del Dashboard (`panel.ts`) pesa ~5,8 kB. El calendario va en un chunk perezoso aparte.

## Estructura del proyecto
```
web/
├── angular.json            — estilos globales (FullCalendar + styles.scss), presupuestos, test = unit-test
├── public/                 — activos estáticos (logo de la fundación)
└── src/
    ├── main.ts             — bootstrap
    ├── index.html          — lang="es", fuentes
    ├── styles.scss         — tema Material + clases globales (.pagina, .tarjeta, .campo, .tabla, .chip--*, .estado, .aviso)
    ├── environments/       — URL y clave *publishable* de Supabase + parámetros de inactividad
    └── app/
        ├── app.ts · app.config.ts · app.routes.ts
        ├── core/           — servicios transversales por tema
        │   ├── agenda.api.ts · supabase.service.ts · errores.ts · models.ts · tiempo.ts · proximas-citas.ts
        │   ├── auth/       — AuthService (sesión/perfil/rol) y guards
        │   └── inactividad/— cierre de sesión por inactividad y su aviso
        ├── features/       — una carpeta por área funcional
        │   ├── acceso/     — ingresar, recuperar y restablecer contraseña
        │   ├── admin/      — agenda, especialistas, horarios/bloqueos, cursos e inscritos, asesorías y solicitudes (ambas de solo lectura) y sus diálogos
        │   └── especialista/ — dashboard (inicio), calendario (FullCalendar), lista de próximas citas, detalle
        ├── layout/         — marco.ts: barra superior y menú lateral según rol (mat-sidenav: fijo y contraíble en pantallas anchas, superpuesto con ☰ por debajo de 840 px; el contenido hace scroll dentro de mat-sidenav-content)
        └── shared/         — solo piezas realmente transversales: confirmar, estado, eventos-formulario
```
Cada carpeta con reglas propias tiene su `CLAUDE.md` (`core/`, `core/auth/`, `core/inactividad/`, `features/admin/`, `features/especialista/`).

## Convenciones
- Guía de estilo de Angular: organizar por funcionalidad, un concepto por archivo, nombre de archivo = clase en kebab-case, sin sufijo `.component`, sin `utils.ts` genérico, pruebas junto al código.
- Reglas Angular 22 de la guía del MCP: sin `standalone: true`, sin `OnPush` explícito, `@Service()` + `inject()`, señales, `input()`/`output()`, control de flujo nativo (`@if`/`@for`), sin `ngClass`/`ngStyle`/`@HostBinding`, Signal Forms en formularios nuevos. Los miembros usados solo en la plantilla son `protected`; los que inicializa Angular son `readonly`.
- Diálogos: señales + inputs nativos; los ayudantes `valorDe`/`marcadoDe` están en `shared/eventos-formulario.ts`.
- Estilos: reutilizar las clases globales de `styles.scss` antes de escribir CSS por componente; `.tabla` se apila como tarjetas por debajo de 720 px.
- Profundidad visual (toda la app): los tokens `--app-sombra`, `--app-sombra-alta`, `--app-borde-suave` y `--app-radio` (16 px) viven en `styles.scss`; `.tarjeta`, `.tabla`, `.estado` y el calendario ya los usan, así que una pantalla nueva solo debe usar esas clases. `.tarjeta--accion` añade elevación al pasar el mouse o con foco (solo para tarjetas con botones; se desactiva con «reducir movimiento»). No usar biseles ni perspectiva 3D literal: baja el contraste.
- Accesibilidad: etiquetas en todos los campos, `role="alert"`/`status`, objetivos táctiles de 44 px, foco visible.
- Pruebas: los componentes mockean `AgendaApi`/`MatDialog` con `useValue`; las que dependen del tiempo usan `vi.useFakeTimers()` y `TestBed.tick()` para ejecutar los `effect`.
