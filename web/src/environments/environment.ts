// Valores PÚBLICOS: la clave "publishable" está pensada para el navegador y está protegida por RLS.
// Nunca pongas aquí la clave secret / service_role.
export const environment = {
  supabaseUrl: 'https://mibnstzninkpzmlrvlro.supabase.co',
  supabaseKey: 'sb_publishable_Xz-Wuq6rgygc3Ix-xPMnjw_eSHREWkp',
  // Cierre de sesión por inactividad: a los 15 min sin actividad, con aviso 60 s antes.
  inactividad: { limiteMinutos: 15, avisoSegundos: 60 },
};
