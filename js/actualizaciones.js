/* SALIDAS · js/actualizaciones.js — PWA: versión (version.json), aviso de actualización y service worker */

/* ---------------- PWA: versión + aviso de actualización ----------------
 * La ÚNICA fuente del número de versión es version.json. Al arrancar, la app
 * lo lee (queda en APP_VERSION_ACTUAL, que se pinta en el login y en "Inicio")
 * y después lo vuelve a consultar cada 5 minutos y cada vez que se vuelve a
 * la app. Si el número ha cambiado en el servidor, sale un modal obligatorio
 * de "Actualización disponible" (no se recarga sola, para no interrumpir a
 * nadie mientras rellena un conteo). Al pulsar "Actualizar ahora" se
 * desregistra el service worker, se vacían las cachés, se refresca la caché
 * HTTP de los archivos propios y se recarga.
 *
 * PARA PUBLICAR UNA ACTUALIZACIÓN: sube los archivos que cambien (todos en el
 * mismo commit) y cambia SOLO el número de version.json. No hay que tocar
 * nada más (ni config.js ni service-worker.js).
 */
let actualizacionYaAvisada = false;
const VERSION_INTERVALO_MS_ = 5 * 60 * 1000;

/** Lee el número de versión actual del servidor (siempre fresco, sin caché). */
function obtenerVersionRemota_() {
  return fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (resp) { return resp.ok ? resp.json() : null; })
    .then(function (data) { return (data && data.version) ? String(data.version) : null; })
    .catch(function () { return null; }); // sin conexión o version.json no disponible: no es crítico
}

/** Pinta el número de versión en el login y en "Inicio" (todos los .version-badge). */
function aplicarVersionEnPantalla_() {
  if (!APP_VERSION_ACTUAL) return;
  document.querySelectorAll('.version-badge').forEach(function (el) {
    el.textContent = 'v' + APP_VERSION_ACTUAL;
  });
}

/** Arranque: guarda con qué versión se ha cargado la app. */
function comprobarVersionInicial_() {
  return obtenerVersionRemota_().then(function (version) {
    if (version && !APP_VERSION_ACTUAL) {
      APP_VERSION_ACTUAL = version;
      aplicarVersionEnPantalla_();
    }
  });
}

/** Compara la versión del servidor con la de esta pestaña y avisa si ha cambiado. */
function comprobarActualizacion_() {
  if (actualizacionYaAvisada) return;
  if (!APP_VERSION_ACTUAL) { comprobarVersionInicial_(); return; } // no se pudo leer al arrancar: se reintenta
  obtenerVersionRemota_().then(function (remota) {
    if (remota && remota !== APP_VERSION_ACTUAL) mostrarModalActualizacion(remota);
  });
}

/** versionNueva es opcional: si no se conoce, se omite el número en el chip
 *  "nueva versión" y se deja un texto genérico. */
function mostrarModalActualizacion(versionNueva) {
  // Si ya hay otro modal abierto (p.ej. alguien confirmando un cierre de
  // tienda), no se lo quitamos de encima: se reintenta en el próximo
  // sondeo/evento en vez de interrumpir lo que está haciendo.
  if (actualizacionYaAvisada) return;
  if (document.getElementById('modal-overlay').style.display === 'flex') {
    setTimeout(function () { mostrarModalActualizacion(versionNueva); }, 15000);
    return;
  }
  actualizacionYaAvisada = true;

  const overlay = document.getElementById('modal-overlay');
  const cajaModal = document.getElementById('modal-box');
  cajaModal.classList.remove('ancho', 'medio', 'peligro', 'gestor-obs');
  cajaModal.classList.add('actualizacion');
  overlay.classList.add('overlay-actualizacion');

  document.getElementById('modal-title').style.display = 'none';
  document.getElementById('modal-text').style.display = 'none';
  document.getElementById('modal-textarea').style.display = 'none';
  document.getElementById('modal-actions').innerHTML = '';

  const chipNueva = versionNueva
    ? '<span class="actualizacion-version-chip nueva">v' + escapeHtml(versionNueva) + '</span>'
    : '<span class="actualizacion-version-chip nueva">Nueva versión</span>';

  const custom = document.getElementById('modal-custom');
  custom.style.display = 'block';
  custom.innerHTML =
    '<div class="actualizacion-cabecera">' +
      '<div class="actualizacion-icono">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.05-6.75"/><path d="M21 4v5h-5"/></svg>' +
      '</div>' +
      '<h3>Actualización disponible</h3>' +
      '<p>Hay una nueva versión de Gestión Salidas lista para instalar.</p>' +
      '<div class="actualizacion-versiones">' +
        '<span class="actualizacion-version-chip actual">v' + escapeHtml(APP_VERSION_ACTUAL || '') + '</span>' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        chipNueva +
      '</div>' +
    '</div>' +
    '<div class="actualizacion-cuerpo">' +
      '<div class="actualizacion-motivo">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>' +
        '<span>Es necesario actualizar para seguir usando la app: así se evitan fallos y datos desincronizados con el resto del equipo.</span>' +
      '</div>' +
      '<button type="button" class="btn-actualizar-obligatorio" id="btn-actualizar-obligatorio">' +
        '<span class="spinner" id="btn-actualizar-spinner"></span>' +
        '<span id="btn-actualizar-texto">Actualizar ahora</span>' +
      '</button>' +
      '<p class="actualizacion-nota-obligatoria">La actualización es obligatoria; la app no se puede seguir usando en la versión anterior.</p>' +
    '</div>';

  overlay.style.display = 'flex';
  document.getElementById('btn-actualizar-obligatorio').onclick = aplicarActualizacion;
}

/** Botón "Actualizar ahora": deja la app limpia y recarga. */
function aplicarActualizacion() {
  const btn = document.getElementById('btn-actualizar-obligatorio');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('cargando');
    document.getElementById('btn-actualizar-texto').textContent = 'Actualizando…';
  }
  forzarActualizacion_();
}

/** Desregistra el service worker, vacía las cachés y refresca la caché HTTP
 *  del navegador para cada archivo propio de la página (si no, el navegador
 *  podría servir el HTML/CSS/JS viejo guardado en su caché normal al
 *  recargar). Después recarga. */
function forzarActualizacion_() {
  let recargado = false;
  const recargar = function () {
    if (recargado) return;
    recargado = true;
    // Evita el aviso del navegador "¿Quieres volver a cargar la aplicación?"
    // (lo lanza el beforeunload de sesion.js): esta recarga es intencionada.
    window.RECARGA_POR_ACTUALIZACION_ = true;
    window.location.reload();
  };
  // Salvaguarda: si algo se queda colgado (red lenta...), se recarga igualmente.
  setTimeout(recargar, 8000);

  const desregistrar = ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations)
    ? navigator.serviceWorker.getRegistrations().then(function (registros) {
        return Promise.all(registros.map(function (r) { return r.unregister(); }));
      })
    : Promise.resolve();

  desregistrar
    .then(function () {
      if (!window.caches) return;
      return caches.keys().then(function (claves) {
        return Promise.all(claves.map(function (k) { return caches.delete(k); }));
      });
    })
    .then(function () {
      const urls = Array.prototype.map.call(document.querySelectorAll('link[href], script[src]'), function (el) {
        return el.href || el.src;
      }).filter(function (u) { return u && u.indexOf(location.origin) === 0; });
      urls.push(location.origin + location.pathname);
      return Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); }));
    })
    .catch(function (err) { console.warn('Error limpiando la caché al actualizar:', err); })
    .then(recargar);
}

// Comprobar al volver a la app (tras minimizar, cambiar de pestaña, etc.).
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') comprobarActualizacion_();
});
window.addEventListener('focus', comprobarActualizacion_);

// Arranque: se guarda la versión con la que se ha cargado la app y se
// comprueba periódicamente si ha cambiado en el servidor.
comprobarVersionInicial_();
setInterval(comprobarActualizacion_, VERSION_INTERVALO_MS_);

// Service worker (solo sirve para que la PWA sea instalable y tenga una copia
// de respaldo sin conexión; las actualizaciones NO dependen de él).
if ('serviceWorker' in navigator) {
  // El service worker ya no cambia en cada versión. Si aun así llegara uno
  // nuevo que se quede "en espera" (es decir, mientras otro sigue activo),
  // se activa enseguida: sirve los archivos exactamente igual que el anterior.
  const activarSiEspera_ = function (worker) {
    if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
  };
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').then(function (registration) {
      activarSiEspera_(registration.waiting);
      registration.addEventListener('updatefound', function () {
        const nuevo = registration.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', function () {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) activarSiEspera_(nuevo);
        });
      });
    }).catch(function (err) {
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}
