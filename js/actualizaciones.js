  // ---------------------------------------------------------------
  // Comprobación de versión y aviso de actualización de la PWA
  // ---------------------------------------------------------------
  (function () {
    const VERSION_URL = 'version.json';
    const INTERVALO_MS = 3 * 60 * 1000; // comprobar cada 3 minutos
    let versionActual = null;
    let modalMostrado = false;

    async function obtenerVersionRemota() {
      try {
        const resp = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.version || null;
      } catch {
        return null;
      }
    }

    async function comprobarVersionInicial() {
      versionActual = await obtenerVersionRemota();
      const tag = document.getElementById('appVersionTag');
      if (tag && versionActual) tag.textContent = 'v' + versionActual;
    }

    async function comprobarActualizacion() {
      if (modalMostrado || !versionActual) return;
      const remota = await obtenerVersionRemota();
      if (!remota) return;
      if (remota !== versionActual) {
        modalMostrado = true;
        mostrarAvisoActualizacion();
      }
    }

    async function mostrarAvisoActualizacion() {
      await modalAlert(
        'Hay una nueva versión de GIDT disponible. La aplicación se va a actualizar ahora.',
        { titulo: 'Actualización disponible', icono: '🔄' }
      );
      forzarActualizacion();
    }

    async function forzarActualizacion() {
      try {
        if ('serviceWorker' in navigator) {
          const registros = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registros.map((r) => r.unregister()));
        }
        if (window.caches) {
          const claves = await caches.keys();
          await Promise.all(claves.map((k) => caches.delete(k)));
        }
      } catch (err) {
        console.error('Error limpiando caché al actualizar:', err);
      } finally {
        location.reload();
      }
    }

    // Comprobar al volver a la app (tras minimizar, cambiar de pestaña, etc.)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') comprobarActualizacion();
    });
    window.addEventListener('focus', comprobarActualizacion);

    // Arranque: guardamos la versión con la que se cargó la app y
    // empezamos a comprobar periódicamente si ha cambiado en el servidor.
    comprobarVersionInicial().then(() => {
      setInterval(comprobarActualizacion, INTERVALO_MS);
    });

    // Registro del Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
          console.error('Error registrando Service Worker:', err);
        });
      });
    }
  })();

  // ---------------------------------------------------------------
