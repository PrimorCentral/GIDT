// ---------------------------------------------------------------
// Permisos por rol (admin / operador / lectura)
// ---------------------------------------------------------------
// Aviso importante: esto es una AYUDA DE INTERFAZ, no una capa de
// seguridad real — la app ya funciona con una clave "anon" abierta
// (como el resto de tablas de Supabase de este proyecto), así que
// cualquiera con acceso a esa clave podría saltarse esto igualmente.
// Lo que hace es ocultar/deshabilitar botones según el rol para que
// cada usuario solo vea lo que le corresponde en el día a día.
//
// Roles:
//   admin    → acceso completo, incluida la gestión de Usuarios y
//              todo lo que se pueda borrar.
//   operador → puede gestionar Tiendas, Emails y Facturación, enviar
//              correos de siniestros, pero no entra en Usuarios ni
//              puede borrar nada.
//   lectura  → puede ver y navegar por toda la app (incluidos los
//              filtros y buscadores), pero no puede crear, editar,
//              enviar, adjuntar ni borrar nada.

function esAdmin() { return sesionActual?.rol === 'admin'; }
function esOperador() { return sesionActual?.rol === 'operador'; }
function esLectura() { return sesionActual?.rol === 'lectura'; }
function puedeEscribir() { return !esLectura(); }
function puedeBorrar() { return esAdmin(); }

function aplicarPermisosPorRol(rol) {
  document.body.classList.remove('rol-admin', 'rol-operador', 'rol-lectura');
  document.body.classList.add(`rol-${rol || 'operador'}`);
}
