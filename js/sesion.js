/* SALIDAS · js/sesion.js — llamarApi_, volver al login, cerrar sesión y réplica de google.script.run */

function llamarApi_(accion, args) {
  if (Object.prototype.hasOwnProperty.call(SUPABASE_ACCIONES_, accion)) {
    return Promise.resolve().then(function () { return SUPABASE_ACCIONES_[accion](args || []); });
  }
  return Promise.reject(new Error('"' + accion + '" no configurado aún con Supabase'));
}

function volverALogin_() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  SESSION_TOKEN = null;
  SESSION_ROL = null;
  SESSION_NOMBRE = null;
  SESSION_PERMISOS = {};
  SESSION_NAVE = null;
  if (typeof pararAvisosVerificacion_ === 'function') pararAvisosVerificacion_();
  document.body.classList.remove('es-admin', 'tiene-menu-diseno', 'tiene-menu-administracion', 'vista-inicio-activa');
  CLAVES_PERMISOS_UI_.forEach(function (clave) { document.body.classList.remove('perm-' + clave); });
  mostrarToast('Sesión caducada, vuelve a entrar', true);
}

/** Cierre de sesión manual (botón "Salir" de la cabecera): a diferencia de
 *  volverALogin_ (que salta cuando el token caduca solo), este es un logout
 *  voluntario, así que no muestra el aviso de "sesión caducada". Pide
 *  confirmación antes de salir, para evitar cierres accidentales. */
function cerrarSesion() {
  if (!window.confirm('¿Seguro que quieres salir?')) return;
  SESSION_TOKEN = null;
  SESSION_ROL = null;
  SESSION_NOMBRE = null;
  SESSION_PERMISOS = {};
  SESSION_NAVE = null;
  if (typeof pararAvisosVerificacion_ === 'function') pararAvisosVerificacion_();
  document.body.classList.remove('es-admin', 'tiene-menu-diseno', 'tiene-menu-administracion', 'vista-inicio-activa');
  CLAVES_PERMISOS_UI_.forEach(function (clave) { document.body.classList.remove('perm-' + clave); });
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  const campoUsuario = document.getElementById('login-usuario');
  const campoPass = document.getElementById('login-pass');
  campoUsuario.value = '';
  campoPass.value = '';
  document.getElementById('login-error').style.display = 'none';
  campoUsuario.focus();
}

/** Aviso de confirmación al cerrar la pestaña/navegador (la X) o recargar
 *  la página, para evitar salir sin querer en medio de un conteo. Solo se
 *  activa si ha entrado sesión (no molesta en la pantalla de login). Los
 *  navegadores modernos ignoran el texto y muestran su propio mensaje
 *  genérico ("¿Salir del sitio? Los cambios podrían no guardarse"); por
 *  eso basta con e.preventDefault() + returnValue, no hace falta (ni
 *  sirve) intentar personalizar el texto. */
window.addEventListener('beforeunload', function (e) {
  if (!SESSION_TOKEN) return;
  // Recarga provocada por la propia app al actualizar de versión
  // (ver forzarActualizacion_ en actualizaciones.js): no preguntar.
  if (window.RECARGA_POR_ACTUALIZACION_) return;
  e.preventDefault();
  e.returnValue = '';
});

const google = {
  script: {
    run: {
      withSuccessHandler: function (onSuccess) {
        return {
          withFailureHandler: function (onFailure) {
            const runner = {};
            Object.keys(METODOS_REMOTOS_).forEach(function (nombreLocal) {
              runner[nombreLocal] = function () {
                const args = Array.prototype.slice.call(arguments);
                const accion = METODOS_REMOTOS_[nombreLocal];
                llamarApi_(accion, args)
                  .then(onSuccess)
                  .catch(onFailure);
              };
            });
            return runner;
          }
        };
      }
    }
  }
};
