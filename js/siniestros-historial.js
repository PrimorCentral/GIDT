  // Historial de siniestros
  // ---------------------------------------------------------------
  const historialSiniestrosFechaInput = document.getElementById('historialSiniestrosFechaInput');
  historialSiniestrosFechaInput.max = fechaHoyISO;

  function renderVistaHistorialSiniestros() {
    if (!historialSiniestrosFechaInput.value) historialSiniestrosFechaInput.focus();
  }

  document.getElementById('btnBuscarHistorialSiniestros').addEventListener('click', () => {
    cargarHistorialSiniestros(historialSiniestrosFechaInput.value);
  });

  async function cargarHistorialSiniestros(fecha) {
    const cont = document.getElementById('contenidoHistorialSiniestros');
    if (!fecha) {
      await modalAlert('Selecciona primero una fecha.', { titulo: 'Historial' });
      return;
    }
    cont.innerHTML = `<div class="card"><div class="empty"><p>Cargando siniestros del ${fecha}…</p></div></div>`;
    // TODO: conectar con Supabase en cuanto exista la tabla de siniestros.
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="glyph">🚧</div>
          <h3>Consulta pendiente de conectar</h3>
          <p>La búsqueda de siniestros del ${fecha} está lista en la interfaz; falta conectarla con Supabase (todavía no existe el módulo de Siniestros).</p>
        </div>
      </div>`;
  }

  async function renderVistaIncidencias() {
    const cont = document.getElementById('contenidoIncidencias');
    const toolbar = document.getElementById('incidenciasToolbar');

    if (!informeHoyCache) {
      toolbar.style.display = 'none';
      cont.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="glyph">📋</div>
            <h3>Aún no hay informe para hoy</h3>
            <p>Genera el informe diario desde Inicio para empezar a registrar incidencias.</p>
            <button class="btn primary" id="btnGenerarInformeDesdeIncidencias">Generar informe de hoy</button>
          </div>
        </div>`;
      document.getElementById('btnGenerarInformeDesdeIncidencias').addEventListener('click', generarInformeHoy);
      return;
    }

    toolbar.style.display = '';
    await ensureAgenciasYTiendasCargadas();
    await cargarIncidenciasHoy();
    document.getElementById('informeTituloFecha').textContent =
      `${dias[hoy.getDay()]}, ${hoy.toLocaleDateString('es-ES')}`;
    actualizarBadgePaletsPrevistos();

    construirPanelFiltrosIncidencias();
    renderAcordeonIncidencias();
    actualizarKpiIncidencias();
  }

  function actualizarBadgePaletsPrevistos() {
    const badge = document.getElementById('badgePaletsPrevistos');
    const texto = document.getElementById('badgePaletsTexto');
    if (!informeHoyCache) { badge.style.display = 'none'; return; }
    badge.style.display = '';
    texto.textContent = informeHoyCache.total_palets
      ? `${informeHoyCache.total_palets} palets previstos`
      : 'Sin palets previstos';
  }

  document.getElementById('btnEditarPalets').addEventListener('click', async () => {
    if (!informeHoyCache) return;
    const valor = await modalPrompt('¿Cuántos palets se prevé entregar hoy?', {
      titulo: 'Editar palets previstos',
      placeholder: 'Ej. 120',
      tipo: 'number',
      valorInicial: informeHoyCache.total_palets || ''
    });
    if (valor === null) return;
    const nuevoTotal = valor ? Number(valor) || null : null;
    try {
      const { data, error } = await sb.from('informes_diarios')
        .update({ total_palets: nuevoTotal })
        .eq('id', informeHoyCache.id)
        .select().single();
      if (error) throw error;
      informeHoyCache = data;
      actualizarBadgePaletsPrevistos();
      renderCardEstadoInforme();
    } catch (err) {
      console.error('Error actualizando palets previstos:', err);
      await modalAlert('No se pudieron actualizar los palets previstos.', { titulo: 'Error' });
    }
  });

  function incidenciaDeTienda(tiendaId) {
    return incidenciasHoyCache.find(i => i.tienda_id === tiendaId) || null;
  }

  let agenciasAbiertasIncidencias = new Set(); // ids de agencia desplegados en "Incidencias del día"
  let filtrosIncidencias = { agencias: new Set(), tipos: new Set(), motivos: new Set(), soloConIncidencias: false };

  function filtrosActivos() {
    return filtrosIncidencias.agencias.size > 0 || filtrosIncidencias.tipos.size > 0 || filtrosIncidencias.motivos.size > 0 || filtrosIncidencias.soloConIncidencias;
  }

  function renderAcordeonIncidencias(filtroTexto = '') {
    const cont = document.getElementById('contenidoIncidencias');
    const f = filtroTexto.trim().toUpperCase();
    const hayFiltros = filtrosActivos();

    let agenciasAMostrar = agenciasCache;
    if (filtrosIncidencias.agencias.size) {
      agenciasAMostrar = agenciasCache.filter(ag => filtrosIncidencias.agencias.has(ag.id));
    }

    cont.innerHTML = agenciasAMostrar.map(ag => {
      let tds = tiendasCache.filter(t => t.agencia_id === ag.id && t.activo);
      if (f) tds = tds.filter(t => t.nombre.toUpperCase().includes(f));

      if (filtrosIncidencias.tipos.size || filtrosIncidencias.motivos.size || filtrosIncidencias.soloConIncidencias) {
        tds = tds.filter(t => {
          const inc = incidenciaDeTienda(t.id);
          const motivoActual = inc?.motivo || '';
          const marcada = motivoActual !== '';
          const tipoCalc = calcularTipo(motivoActual);
          const tipoEfectivo = marcada ? (tipoCalc || 'PENDIENTE') : null;

          if (filtrosIncidencias.soloConIncidencias && !marcada) return false;
          if (filtrosIncidencias.tipos.size && (!tipoEfectivo || !filtrosIncidencias.tipos.has(tipoEfectivo))) return false;
          if (filtrosIncidencias.motivos.size && !filtrosIncidencias.motivos.has(motivoActual)) return false;
          return true;
        });
      }

      if (!tds.length) return '';

      const numInc = tds.filter(t => incidenciaDeTienda(t.id)?.marcada).length;

      const filas = tds.map(t => {
        const inc = incidenciaDeTienda(t.id);
        const motivoActual = inc?.motivo || '';
        const marcada = motivoActual !== '';
        const tipoCalc = calcularTipo(motivoActual);
        const esPendiente = marcada && !tipoCalc;
        const claseFila = marcada ? (tipoCalc ? tipoCalc.toLowerCase() : 'pendiente') : '';

        const badgeTipo = !marcada
          ? '<span style="color:var(--ink-soft); font-size:12px;">—</span>'
          : esPendiente
            ? '<span class="pill pendiente">Pendiente</span>'
            : `<span class="pill ${tipoCalc.toLowerCase()}">${tipoCalc.charAt(0)+tipoCalc.slice(1).toLowerCase()}</span>`;

        return `
          <tr data-tienda="${t.id}" class="${claseFila ? 'con-incidencia ' + claseFila : ''}">
            <td class="col-estado">${marcada ? '🔴' : '—'}</td>
            <td class="col-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}</td>
            <td class="col-tienda">${badgeMarcaHtml(t.marca)}${escapeHtml(t.nombre)}</td>
            <td class="col-tipo">${badgeTipo}</td>
            <td class="col-motivo">
              <select class="form-input i-motivo">${opcionesMotivoHtml(motivoActual)}</select>
            </td>
            <td class="col-obs"><input type="text" class="form-input i-obs" placeholder="Observaciones…" value="${escapeHtml(inc?.observaciones || '')}"></td>
          </tr>`;
      }).join('');

      return `
        <div class="agencia-block">
          <div class="agencia-head ${(f || hayFiltros || agenciasAbiertasIncidencias.has(ag.id)) ? 'open' : ''}" data-agencia="${ag.id}">
            <span class="caret">▶</span>
            <b>${escapeHtml(ag.nombre)}</b>
            <span class="count">${tds.length} tienda${tds.length===1?'':'s'}</span>
            ${numInc ? `<span class="conteo-inc">${numInc} incidencia${numInc===1?'':'s'}</span>` : ''}
          </div>
          <div class="agencia-body ${(f || hayFiltros || agenciasAbiertasIncidencias.has(ag.id)) ? 'open' : ''}">
            <table class="tabla-incidencias">
              <colgroup>
                <col class="cg-estado"><col class="cg-hora"><col class="cg-tienda">
                <col class="cg-tipo"><col class="cg-motivo"><col class="cg-obs">
              </colgroup>
              <thead><tr><th></th><th>Hora</th><th>Tienda</th><th>Tipo</th><th>Motivo</th><th>Observaciones</th></tr></thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </div>`;
    }).join('') || `<div class="card"><div class="empty"><p>Sin tiendas que coincidan con la búsqueda o los filtros aplicados.</p></div></div>`;

    cont.querySelectorAll('.agencia-head').forEach(head => {
      head.addEventListener('click', () => {
        const id = Number(head.dataset.agencia);
        const abierto = head.classList.toggle('open');
        head.nextElementSibling.classList.toggle('open');
        if (abierto) agenciasAbiertasIncidencias.add(id); else agenciasAbiertasIncidencias.delete(id);
      });
    });

    cont.querySelectorAll('tr[data-tienda]').forEach(tr => {
      const tiendaId = Number(tr.dataset.tienda);
      const selectMotivo = tr.querySelector('.i-motivo');
      const inputObs = tr.querySelector('.i-obs');

      const guardar = () => guardarIncidencia(tiendaId, tr);
      selectMotivo.addEventListener('change', guardar);
      inputObs.addEventListener('input', () => {
        const pos = inputObs.selectionStart;
        inputObs.value = inputObs.value.toUpperCase();
        inputObs.setSelectionRange(pos, pos);
      });
      inputObs.addEventListener('blur', guardar);
    });
  }

  // ---------------------------------------------------------------
