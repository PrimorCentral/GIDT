  // Informe diario de hoy
  // ---------------------------------------------------------------
        let fechaHoyISO = fechaLocalISO(hoy); // YYYY-MM-DD, en hora LOCAL

  let informeHoyCache = null; // null = aún no comprobado / no existe
  let incidenciasHoyCache = []; // filas de la tabla `incidencias` del informe de hoy

  async function cargarInformeHoy() {
    try {
      const { data, error } = await sb
        .from('informes_diarios')
        .select('id, fecha, total_palets, estado, informe_enviado, informe_enviado_en, informe_enviado_por')
        .eq('fecha', fechaHoyISO)
        .maybeSingle();
      if (error) throw error;
      informeHoyCache = data || null;
    } catch (err) {
      console.error('Error cargando informe de hoy:', err);
      informeHoyCache = null;
    }
    renderCardEstadoInforme();
    if (informeHoyCache) await cargarIncidenciasHoy();
    actualizarKpiIncidencias();
    if (typeof actualizarKpiSiniestrosDesdeDB === 'function') actualizarKpiSiniestrosDesdeDB();
    if (typeof renderBotonEnviarInforme === 'function') renderBotonEnviarInforme();
  }

  function renderCardEstadoInforme() {
    const card = document.getElementById('cardEstadoInforme');
    if (!informeHoyCache) {
      card.innerHTML = `
        <div class="empty">
          <div class="glyph">📋</div>
          <h3>Sin informe abierto para hoy</h3>
          <p>Genera el informe diario para empezar a registrar incidencias por agencia.</p>
          <button class="btn primary" id="btnGenerarInformeEmpty">Generar informe de hoy</button>
        </div>`;
      document.getElementById('btnGenerarInformeEmpty').addEventListener('click', generarInformeHoy);
    } else {
      card.innerHTML = `
        <div class="empty">
          <div class="glyph">✅</div>
          <h3>Informe de hoy abierto</h3>
          <p>${informeHoyCache.total_palets ? informeHoyCache.total_palets + ' palets previstos · ' : ''}Estado: ${informeHoyCache.estado}</p>
          <button class="btn primary" data-view="incidencias">Ir a Incidencias</button>
        </div>`;
      card.querySelector('[data-view="incidencias"]').addEventListener('click', () => {
        activarVista('incidencias');
        renderVistaIncidencias();
      });
    }
  }

  async function generarInformeHoy() {
    const palets = await modalPrompt('¿Cuántos palets se prevé entregar hoy? (opcional)', {
      titulo: 'Generar informe de hoy',
      placeholder: 'Ej. 120',
      tipo: 'number'
    });
    // Igual que antes: si se cancela o se deja vacío, se genera el informe sin palets.
    try {
      const { data, error } = await sb.from('informes_diarios').insert({
        fecha: fechaHoyISO,
        total_palets: palets ? Number(palets) || null : null,
        creado_por: sesionActual?.nombre || sesionActual?.usuario || null
      }).select().single();
      if (error) throw error;
      informeHoyCache = data;
      renderCardEstadoInforme();
      cargarKPIs();
      if (typeof renderBotonEnviarInforme === 'function') renderBotonEnviarInforme();
      renderVistaIncidencias();
    } catch (err) {
      console.error('Error generando informe:', err);
      await modalAlert('No se pudo generar el informe de hoy.', { titulo: 'Error' });
    }
  }

  document.getElementById('btnNuevoInforme').addEventListener('click', () => {
    if (informeHoyCache) { activarVista('incidencias'); renderVistaIncidencias(); return; }
    generarInformeHoy();
  });

  async function actualizarKpiIncidencias() {
    document.getElementById('kpiIncidenciasHoy').textContent = informeHoyCache
      ? incidenciasHoyCache.filter(i => i.marcada).length
      : '0';
  }

  // ---------------------------------------------------------------
  // Incidencias del día
  // ---------------------------------------------------------------
  async function cargarIncidenciasHoy() {
    if (!informeHoyCache) { incidenciasHoyCache = []; return; }
    try {
      const { data, error } = await sb
        .from('incidencias')
        .select('id, tienda_id, marcada, tipo, motivo, observaciones')
        .eq('informe_id', informeHoyCache.id);
      if (error) throw error;
      incidenciasHoyCache = data || [];
    } catch (err) {
      console.error('Error cargando incidencias de hoy:', err);
      incidenciasHoyCache = [];
    }
  }

  // ---------------------------------------------------------------
  // Comprobación de cambio de día (por si el dispositivo/pestaña se
  // queda abierto de un día para otro sin recargar la página)
  // ---------------------------------------------------------------
  function comprobarCambioDeDia() {
    const ahora = new Date();
    const fechaActualISO = fechaLocalISO(ahora);
    if (fechaActualISO === fechaHoyISO) return; // sigue siendo el mismo día

    hoy = ahora;
    fechaHoyISO = fechaActualISO;
    actualizarFechaHoyTexto();
    historialFechaInput.max = fechaHoyISO;
    historialSiniestrosFechaInput.max = fechaHoyISO;

    if (!getSesion()) return; // en la pantalla de login, no hay nada que refrescar

    cargarInformeHoy();
    cargarKPIs();

    if (document.getElementById('view-incidencias')?.classList.contains('active')) {
      renderVistaIncidencias();
    }
    if (document.getElementById('view-siniestros')?.classList.contains('active')) {
      renderVistaSiniestros();
    }
  }

  setInterval(comprobarCambioDeDia, 60 * 1000); // revisa cada minuto
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') comprobarCambioDeDia();
  });

  // ---------------------------------------------------------------
  // Historial de informes diarios
  // ---------------------------------------------------------------
  const historialFechaInput = document.getElementById('historialFechaInput');
  historialFechaInput.max = fechaHoyISO;

  function renderVistaHistorialInformes() {
    if (!historialFechaInput.value) historialFechaInput.focus();
  }

  document.getElementById('btnBuscarHistorial').addEventListener('click', () => {
    cargarInformeHistorial(historialFechaInput.value);
  });

  async function cargarInformeHistorial(fecha) {
    const cont = document.getElementById('contenidoHistorial');
    if (!fecha) {
      await modalAlert('Selecciona primero una fecha.', { titulo: 'Historial' });
      return;
    }
    cont.innerHTML = `<div class="card"><div class="empty"><p>Cargando informe del ${fecha}…</p></div></div>`;

    try {
      const { data: informe, error: eInf } = await sb
        .from('informes_diarios')
        .select('id, fecha, total_palets, estado, informe_enviado, informe_enviado_en')
        .eq('fecha', fecha)
        .maybeSingle();
      if (eInf) throw eInf;

      if (!informe) {
        cont.innerHTML = `
          <div class="card">
            <div class="empty">
              <div class="glyph">🕓</div>
              <h3>Sin informe ese día</h3>
              <p>No se generó ningún informe diario para el ${fecha}.</p>
            </div>
          </div>`;
        return;
      }

      // Solo incidencias activas (marcada = true) de ese informe
      const { data: incs, error: eInc } = await sb
        .from('incidencias')
        .select(`
          id, tipo, motivo, observaciones, actualizado_en, usuario,
          tiendas ( id, nombre, hora_prevista, marca,
            agencias ( id, nombre )
          )
        `)
        .eq('informe_id', informe.id)
        .eq('marcada', true);
      if (eInc) throw eInc;

      renderHistorialInforme(informe, incs || []);
    } catch (err) {
      console.error('Error cargando historial de informe:', err);
      cont.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="glyph">⚠️</div>
            <h3>Error al cargar</h3>
            <p>No se pudo consultar el informe de ese día.</p>
          </div>
        </div>`;
    }
  }

  function renderHistorialInforme(informe, incidenciasActivas) {
    const cont = document.getElementById('contenidoHistorial');
    const fechaInforme = new Date(informe.fecha + 'T00:00:00');
    const fechaTexto = `${dias[fechaInforme.getDay()]}, ${formatearFechaCorta(fechaInforme)}`;
    const estadoTexto = informe.informe_enviado ? 'ENVIADO' : informe.estado;

    if (!incidenciasActivas.length) {
      cont.innerHTML = `
        <div class="card" style="margin-bottom:14px; padding:16px 20px;">
          <b style="text-transform:capitalize;">${fechaTexto}</b>
          ${informe.total_palets ? ` · ${informe.total_palets} palets previstos` : ''} · Estado: ${estadoTexto}
        </div>
        <div class="card">
          <div class="empty">
            <div class="glyph">✅</div>
            <h3>Sin incidencias ese día</h3>
            <p>No hubo ninguna incidencia activa registrada el ${fechaTexto}.</p>
          </div>
        </div>`;
      return;
    }

    // Agrupar por agencia
    const porAgencia = {};
    incidenciasActivas.forEach(inc => {
      const ag = inc.tiendas?.agencias;
      const agId = ag?.id ?? 'sin-agencia';
      if (!porAgencia[agId]) porAgencia[agId] = { nombre: ag?.nombre || 'Sin agencia', filas: [] };
      porAgencia[agId].filas.push(inc);
    });

    const bloques = Object.values(porAgencia).map(grupo => {
      const filas = grupo.filas.map(inc => {
        const t = inc.tiendas || {};
        const tipo = inc.tipo;
        const claseFila = tipo ? tipo.toLowerCase() : 'pendiente';
        const badgeTipo = tipo
          ? `<span class="pill ${tipo.toLowerCase()}">${tipo.charAt(0)+tipo.slice(1).toLowerCase()}</span>`
          : `<span class="pill pendiente">Pendiente</span>`;
        return `
          <tr class="con-incidencia ${claseFila}">
            <td class="col-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}</td>
            <td class="col-tienda">${escapeHtml(t.nombre || '—')}</td>
            <td class="col-tipo">${badgeTipo}</td>
            <td class="col-motivo">${escapeHtml((inc.motivo || []).join(', '))}</td>
            <td class="col-obs">${escapeHtml(inc.observaciones || '')}</td>
          </tr>`;
      }).join('');

      return `
        <div class="agencia-block">
          <div class="agencia-head open" style="cursor:default;">
            <b>${escapeHtml(grupo.nombre)}</b>
            <span class="conteo-inc">${grupo.filas.length} incidencia${grupo.filas.length===1?'':'s'}</span>
          </div>
          <div class="agencia-body open">
            <table class="tabla-incidencias">
              <colgroup>
                <col class="cg-hora"><col class="cg-tienda">
                <col class="cg-tipo"><col class="cg-motivo"><col class="cg-obs">
              </colgroup>
              <thead><tr><th>Hora</th><th>Tienda</th><th>Tipo</th><th>Motivo</th><th>Observaciones</th></tr></thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    cont.innerHTML = `
      <div class="card" style="margin-bottom:14px; padding:16px 20px;">
        <b style="text-transform:capitalize;">${fechaTexto}</b>
        ${informe.total_palets ? ` · ${informe.total_palets} palets previstos` : ''} · Estado: ${estadoTexto}
        · <span style="color:var(--grave); font-weight:700;">${incidenciasActivas.length} incidencia${incidenciasActivas.length===1?'':'s'} activa${incidenciasActivas.length===1?'':'s'}</span>
      </div>
      ${bloques}`;
  }

  // ---------------------------------------------------------------
