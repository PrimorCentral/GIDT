  // ---------------------------------------------------------------
  // Modal obligatorio: exige tener GIDT instalada como app (PWA) antes
  // de poder usarla, tanto en ordenador (Chrome/Edge) como en móvil.
  // No se puede cerrar haciendo click fuera ni con Escape: el HTML lo
  // muestra por defecto (class "show") y este script solo lo oculta si
  // detecta que la app ya se está ejecutando instalada.
  // ---------------------------------------------------------------
  (function () {
    const overlay        = document.getElementById('instalarAppModalOverlay');
    const btnInstalar     = document.getElementById('btnInstalarApp');
    const btnInstalarTexto = document.getElementById('btnInstalarAppTexto');
    const btnYaInstalada  = document.getElementById('btnYaInstalada');
    const textoAyuda      = document.getElementById('instalarAppAyuda');

    if (!overlay || !btnInstalar || !btnYaInstalada) return;

    // El navegador (Chrome/Edge, escritorio o Android) dispara este evento
    // cuando la app cumple los requisitos para poder instalarse. Hay que
    // capturarlo pronto y guardarlo, porque solo se puede "disparar" una
    // vez y a partir de una interacción del usuario (el click del botón).
    let promptDiferido = null;

    function estaInstalada() {
      // Chrome/Edge/Android: la propia ventana informa que se abrió en
      // modo standalone (icono propio, sin barra de navegador).
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      // Alguna variante de Windows (WebView2 / Edge) usa "window-controls-overlay".
      if (window.matchMedia && window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
      // Safari en iOS/iPadOS/macOS no dispara beforeinstallprompt ni el
      // display-mode anterior; expone esta propiedad en su lugar.
      if (window.navigator.standalone === true) return true;
      return false;
    }

    function ocultarModal() {
      overlay.classList.remove('show');
    }

    function mostrarModal() {
      overlay.classList.add('show');
    }

    function comprobarEstado() {
      if (estaInstalada()) ocultarModal();
      else mostrarModal();
    }

    window.addEventListener('beforeinstallprompt', (evento) => {
      evento.preventDefault();
      promptDiferido = evento;
      if (textoAyuda) textoAyuda.style.display = 'none';
    });

    // Se dispara en cuanto el usuario completa la instalación (desde
    // nuestro botón o desde el icono nativo del navegador).
    window.addEventListener('appinstalled', () => {
      promptDiferido = null;
      ocultarModal();
    });

    btnInstalar.addEventListener('click', async () => {
      if (promptDiferido) {
        btnInstalar.disabled = true;
        if (btnInstalarTexto) btnInstalarTexto.textContent = 'Instalando…';
        try {
          promptDiferido.prompt();
          await promptDiferido.userChoice;
        } catch (err) {
          console.error('Error al lanzar la instalación:', err);
        }
        promptDiferido = null;
        btnInstalar.disabled = false;
        if (btnInstalarTexto) btnInstalarTexto.textContent = '⬇️ Instalar App';
        // Si se instaló, el evento "appinstalled" ya habrá cerrado el modal;
        // por si el navegador no lo dispara a tiempo, se comprueba también aquí.
        comprobarEstado();
      } else {
        // El navegador no ha ofrecido el evento nativo: no es compatible
        // (Safari, Firefox de escritorio) o ya se descartó antes en esta
        // sesión. Se muestran instrucciones manuales.
        if (textoAyuda) textoAyuda.style.display = '';
      }
    });

    btnYaInstalada.addEventListener('click', () => {
      location.reload();
    });

    // Comprobación inicial y cada vez que la pestaña vuelve a primer plano
    // (por si se instaló desde otra pestaña, otro navegador, o el usuario
    // reabre la app ya instalada tras haber estado en la versión web).
    comprobarEstado();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') comprobarEstado();
    });
    window.addEventListener('focus', comprobarEstado);
  })();
