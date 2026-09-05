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

    // Modal dedicado (no el genérico de modalAlert/modalConfirm): a propósito
    // no se puede cerrar haciendo click fuera ni con Escape, porque la
    // actualización no es opcional — solo se sale de aquí actualizando.
    function mostrarAvisoActualizacion() {
      const overlay = document.getElementById('actualizacionModalOverlay');
      const btn = document.getElementById('btnActualizarAhora');
      overlay.classList.add('show');
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Actualizando…';
        forzarActualizacion();
      }, { once: true });
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
        // Lo anterior limpia el Service Worker y su caché interna, pero el
        // propio navegador puede seguir teniendo el HTML/CSS/JS de la app
        // guardados en su caché HTTP normal (independiente del Service
        // Worker) y servirlos tal cual en el recargado siguiente — por eso
        // antes se veía la versión antigua hasta cerrar y reabrir la app.
        // Se refresca explícitamente esa caché para cada archivo propio de
        // la página (mismo origen) antes de recargar.
        const urlsPropias = Array.from(document.querySelectorAll('link[href], script[src]'))
          .map(el => el.href || el.src)
          .filter(url => url && url.startsWith(location.origin));
        urlsPropias.push(location.origin + location.pathname);
        await Promise.all(urlsPropias.map(url => fetch(url, { cache: 'reload' }).catch(() => {})));
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
