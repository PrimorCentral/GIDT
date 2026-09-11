// ---------------------------------------------------------------
// Permisos: por rol (admin / operador / lectura) y, dentro de
// "operador", por permiso granular (marcado por casillas al crear
// o editar el usuario en Configuración → Usuarios).
// ---------------------------------------------------------------
// Aviso importante: esto es una AYUDA DE INTERFAZ, no una capa de
// seguridad real — la app ya funciona con una clave "anon" abierta
// (como el resto de tablas de Supabase de este proyecto), así que
// cualquiera con acceso a esa clave podría saltarse esto igualmente.
// Lo que hace es ocultar/deshabilitar botones según lo que tenga
// marcado cada usuario, para que cada uno solo vea lo que le toca.
//
//   admin    → acceso completo a todo, incluidos permisos y borrar.
//   operador → solo lo que tenga marcado en su ficha de usuario.
//   lectura  → puede ver y navegar por toda la app (filtros y
//              buscadores incluidos), pero no puede escribir nada.

const CLAVES_PERMISOS_APP = [
  'informe_dia', 'enviar_informe', 'editar_informes_pasados',
  'panel_siniestros', 'siniestros_dia', 'enviar_facturacion',
  'config_tiendas', 'config_emails', 'config_facturacion', 'config_cc_transporte',
  'gestion_usuarios', 'borrar', 'enviar_reporte_mensual', 'ver_auditoria',
  'ver_log_cambios_informes'
];

function esAdmin() { return sesionActual?.rol === 'admin'; }
function esOperador() { return sesionActual?.rol === 'operador'; }
function esLectura() { return sesionActual?.rol === 'lectura'; }
function puedeEscribir() { return !esLectura(); }
function puedeBorrar() { return esAdmin() || !!sesionActual?.permisos?.borrar; }

// tienePermiso('config_tiendas') → true para admin siempre,
// para operador solo si lo tiene marcado, false para lectura siempre.
function tienePermiso(clave) {
  if (esAdmin()) return true;
  if (esLectura()) return false;
  return !!sesionActual?.permisos?.[clave];
}

function aplicarPermisosPorRol(rol) {
  document.body.classList.remove('rol-admin', 'rol-operador', 'rol-lectura');
  document.body.classList.add(`rol-${rol || 'operador'}`);

  CLAVES_PERMISOS_APP.forEach(clave => {
    document.body.classList.toggle(`perm-${clave}`, tienePermiso(clave));
  });
}
