  // ---------------------------------------------------------------
  // Auto-actualización silenciosa del "Informe del día"
  // ---------------------------------------------------------------
  // Como varias personas pueden estar trabajando a la vez desde
  // distintos ordenadores sobre el informe de hoy, esta vista vuelve a
  // consultar Supabase cada 20 segundos mientras esté abierta, para
  // que los cambios de un compañero (marcar/quitar una incidencia,
  // cambiar los palets previstos...) aparezcan solos, sin que nadie
  // tenga que recargar la página.
  //
  // El refresco es totalmente silencioso: no se muestra ningún
  // spinner ni mensaje de carga. Si en el momento del refresco el
  // operario está escribiendo unas observaciones o tiene abierto el
  // desplegable de motivos de una fila, ese ciclo se salta para no
  // interrumpirle (se reintenta 20 segundos después).
  //
  // Junto al punto verde de estado del servidor se muestra un
  // pequeño reloj de arena con la cuenta atrás hasta el siguiente
  // refresco, visible solo mientras se está en "Informe del día".
  // ---------------------------------------------------------------
  (function () {
    const INTERVALO_SEGUNDOS = 20;

    const indicador = document.getElementById('autoRefreshIndicator');
    const hourglassEl = document.getElementById('autoRefreshHourglass');
    const countdownEl = document.getElementById('autoRefreshCountdown');

    let segundosRestantes = INTERVALO_SEGUNDOS;
    let volteado = false;

    function vistaIncidenciasActiva() {
      return !!(typeof getSesion === 'function' && getSesion() &&
        document.getElementById('view-incidencias')?.classList.contains('active'));
    }

    // Detecta si el operario tiene "algo en marcha" dentro del informe
    // que no debemos interrumpir con un re-render: unas observaciones a
    // medio escribir, o el desplegable de motivos de una fila abierto.
    function haySomethingEnEdicionIncidencias() {
      const cont = document.getElementById('contenidoIncidencias');
      if (!cont) return false;
      const activo = document.activeElement;
      if (activo && cont.contains(activo) && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA')) return true;
      if (cont.querySelector('.motivo-select.open')) return true;
      return false;
    }

    async function refrescarInformeDiaSilencioso() {
      if (!informeHoyCache) return;
      if (haySomethingEnEdicionIncidencias()) return; // se reintenta en el siguiente ciclo

      try {
        const { data: informe, error } = await sb
          .from('informes_diarios')
          .select('id, fecha, total_palets, estado, informe_enviado, informe_enviado_en, informe_enviado_por')
          .eq('id', informeHoyCache.id)
          .maybeSingle();
        if (!error && informe) informeHoyCache = informe;

        await cargarIncidenciasHoy();

        // Puede que, entre el primer chequeo y ahora, el operario haya
        // empezado a editar algo: comprobamos de nuevo antes de tocar el DOM.
        if (haySomethingEnEdicionIncidencias()) return;

        renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias')?.value || '');
        if (typeof actualizarBadgePaletsPrevistos === 'function') actualizarBadgePaletsPrevistos();
        if (typeof actualizarKpiIncidencias === 'function') actualizarKpiIncidencias();
        if (typeof renderBotonEnviarInforme === 'function') renderBotonEnviarInforme();
      } catch (err) {
        console.error('Error en la auto-actualización del informe del día:', err);
      }
    }

    function actualizarIndicadorVisual() {
      if (!indicador) return;
      if (!vistaIncidenciasActiva()) {
        indicador.classList.remove('show');
        segundosRestantes = INTERVALO_SEGUNDOS;
        return;
      }
      indicador.classList.add('show');
      if (countdownEl) countdownEl.textContent = segundosRestantes;
    }

    setInterval(async () => {
      if (!vistaIncidenciasActiva()) {
        actualizarIndicadorVisual();
        return;
      }

      segundosRestantes -= 1;
      if (segundosRestantes <= 0) {
        segundosRestantes = INTERVALO_SEGUNDOS;
        volteado = !volteado;
        if (hourglassEl) hourglassEl.style.transform = volteado ? 'rotate(180deg)' : 'rotate(0deg)';
        await refrescarInformeDiaSilencioso();
      }
      actualizarIndicadorVisual();
    }, 1000);
  })();

  // ---------------------------------------------------------------
