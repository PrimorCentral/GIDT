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

    try {
      // 1. Informe diario de esa fecha
      const { data: informe, error: eInf } = await sb
        .from('informes_diarios')
        .select('id, fecha')
        .eq('fecha', fecha)
        .maybeSingle();
      if (eInf) throw eInf;

      if (!informe) {
        cont.innerHTML = `
          <div class="card">
            <div class="empty">
              <div class="glyph">🕓</div>
              <h3>Sin informe ese día</h3>
              <p>No se generó ningún informe diario para el ${fecha}, así que no puede haber siniestros.</p>
            </div>
          </div>`;
        return;
      }

      // 2. Incidencias de ese informe cuyo motivo es FALTAS o ROTURA CONFIRMADA
      const { data: incs, error: eInc } = await sb
        .from('incidencias')
        .select(`
          id, motivo, observaciones,
          tiendas ( id, nombre, hora_prevista,
            agencias ( id, nombre )
          )
        `)
        .eq('informe_id', informe.id)
        .overlaps('motivo', Object.keys(MOTIVOS_SINIESTRO));
      if (eInc) throw eInc;

      if (!incs.length) {
        cont.innerHTML = `
          <div class="card">
            <div class="empty">
              <div class="glyph">✅</div>
              <h3>Sin roturas ni faltas ese día</h3>
              <p>No se detectó ninguna tienda con "FALTAS" o "ROTURA CONFIRMADA" el ${fecha}.</p>
            </div>
          </div>`;
        return;
      }

      // 3. Filas de siniestros asociadas a esas incidencias
      const idsIncidencias = incs.map(i => i.id);
      const { data: sins, error: eSin } = await sb
        .from('siniestros')
        .select('id, incidencia_id, tipo, estado, fotos, fecha_limite, enviado_en, enviado_por')
        .in('incidencia_id', idsIncidencias);
      if (eSin) throw eSin;

      const sinPorIncidencia = new Map(sins.map(s => [s.incidencia_id, s]));

      // Combinamos: solo incidencias que ya tienen su fila de siniestro creada
      const combinados = incs
        .filter(i => sinPorIncidencia.has(i.id))
        .map(i => ({ ...sinPorIncidencia.get(i.id), incidencia: i }));

      renderHistorialSiniestros(informe, combinados);
    } catch (err) {
      console.error('Error cargando historial de siniestros:', err);
      cont.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="glyph">⚠️</div>
            <h3>Error al cargar</h3>
            <p>No se pudo consultar los siniestros de ese día.</p>
          </div>
        </div>`;
    }
  }

  function renderHistorialSiniestros(informe, siniestros) {
    const cont = document.getElementById('contenidoHistorialSiniestros');
    const fechaTexto = new Date(informe.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
    });

    if (!siniestros.length) {
      cont.innerHTML = `
        <div class="card" style="margin-bottom:14px; padding:16px 20px;">
          <b style="text-transform:capitalize;">${fechaTexto}</b>
        </div>
        <div class="card">
          <div class="empty">
            <div class="glyph">✅</div>
            <h3>Sin siniestros registrados</h3>
            <p>No hay roturas ni faltas con seguimiento ese día.</p>
          </div>
        </div>`;
      return;
    }

    const pendientes = siniestros.filter(s => s.estado === 'PENDIENTE').length;
    const enviados = siniestros.length - pendientes;

    // Agrupar por agencia
    const porAgencia = {};
    siniestros.forEach(s => {
      const ag = s.incidencia.tiendas?.agencias;
      const agId = ag?.id ?? 'sin-agencia';
      if (!porAgencia[agId]) porAgencia[agId] = { nombre: ag?.nombre || 'Sin agencia', filas: [] };
      porAgencia[agId].filas.push(s);
    });

    const tarjeta = (s) => {
      const t = s.incidencia.tiendas || {};
      const numFotos = (s.fotos || []).length;
      return `
        <div class="siniestro-card" style="cursor:default;">
          <div class="fila-top">
            <b>${escapeHtml(t.nombre || '—')}</b>
            <span class="badge-envio ${s.estado === 'ENVIADO' ? 'enviado' : 'pendiente'}">${s.estado === 'ENVIADO' ? 'Enviado' : 'Pendiente'}</span>
          </div>
          <div class="agencia">
            <span class="pill ${s.tipo === 'ROTURA' ? 'grave' : 'moderado'}">${s.tipo === 'ROTURA' ? 'Rotura' : 'Falta'}</span>
            · ${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}
          </div>
          ${s.incidencia.observaciones ? `<div class="obs">${escapeHtml(s.incidencia.observaciones)}</div>` : ''}
          <div class="fotos-mini">📷 ${numFotos} foto${numFotos===1?'':'s'}</div>
          ${s.estado === 'ENVIADO'
            ? `<div class="fotos-mini">✉️ Enviado ${s.enviado_en ? new Date(s.enviado_en).toLocaleString('es-ES') : ''}${s.enviado_por ? ' · ' + escapeHtml(s.enviado_por) : ''}</div>`
            : `<div class="fotos-mini">Fecha límite: ${s.fecha_limite ? new Date(s.fecha_limite+'T00:00:00').toLocaleDateString('es-ES') : '—'}</div>`}
        </div>`;
    };

    const bloques = Object.values(porAgencia).map(grupo => `
      <div class="agencia-block">
        <div class="agencia-head open" style="cursor:default;">
          <b>${escapeHtml(grupo.nombre)}</b>
          <span class="count">${grupo.filas.length} siniestro${grupo.filas.length===1?'':'s'}</span>
        </div>
        <div class="agencia-body open" style="padding:14px 16px;">
          ${grupo.filas.map(tarjeta).join('')}
        </div>
      </div>`).join('');

    cont.innerHTML = `
      <div class="card" style="margin-bottom:14px; padding:16px 20px;">
        <b style="text-transform:capitalize;">${fechaTexto}</b>
        · <span style="color:var(--grave); font-weight:700;">${pendientes} pendiente${pendientes===1?'':'s'}</span>
        · <span style="color:var(--ok); font-weight:700;">${enviados} enviado${enviados===1?'':'s'}</span>
      </div>
      ${bloques}`;
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
          const motivosActuales = inc?.motivo || [];
          const marcada = motivosActuales.length > 0;
          const tipoCalc = calcularTipo(motivosActuales);
          const tipoEfectivo = marcada ? (tipoCalc || 'PENDIENTE') : null;

          if (filtrosIncidencias.soloConIncidencias && !marcada) return false;
          if (filtrosIncidencias.tipos.size && (!tipoEfectivo || !filtrosIncidencias.tipos.has(tipoEfectivo))) return false;
          if (filtrosIncidencias.motivos.size && !motivosActuales.some(m => filtrosIncidencias.motivos.has(m))) return false;
          return true;
        });
      }

      if (!tds.length) return '';

      const numInc = tds.filter(t => incidenciaDeTienda(t.id)?.marcada).length;

      const filas = tds.map(t => {
        const inc = incidenciaDeTienda(t.id);
        const motivosActuales = inc?.motivo || [];
        const marcada = motivosActuales.length > 0;
        const tipoCalc = calcularTipo(motivosActuales);
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
              <div class="motivo-select">
                <button type="button" class="filtro-select-btn">
                  <span class="motivo-select-valor">${escapeHtml(resumenMotivos(motivosActuales))}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button type="button" class="mini-btn btn-borrar-motivos" title="Quitar todos los motivos" style="${marcada ? '' : 'display:none;'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="filtro-select-dropdown">
                  <div class="filtro-select-search">
                    <input type="text" placeholder="🔎 Buscar motivo…" class="i-buscar-motivo">
                  </div>
                  <div class="filtro-select-lista">${motivosChecklistHtml(motivosActuales)}</div>
                </div>
              </div>
            </td>
            <td class="col-obs"><input type="text" class="form-input i-obs" placeholder="Observaciones…" value="${escapeHtml(inc?.observaciones || '')}" ${marcada ? '' : 'disabled'}></td>
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
      const inputObs = tr.querySelector('.i-obs');

            const guardar = () => guardarIncidencia(tiendaId, tr);
      const btnBorrarMotivos = tr.querySelector('.btn-borrar-motivos');

      tr.querySelectorAll('.i-motivo-check').forEach(cb => cb.addEventListener('change', () => {
        const hayMotivo = tr.querySelectorAll('.i-motivo-check:checked').length > 0;
        inputObs.disabled = !hayMotivo;
        if (btnBorrarMotivos) btnBorrarMotivos.style.display = hayMotivo ? '' : 'none';
        guardar();
      }));

                  if (btnBorrarMotivos) {
        btnBorrarMotivos.addEventListener('click', async (e) => {
          e.stopPropagation();
          const inc = incidenciaDeTienda(tiendaId);
          if (!inc) return; // no había fila en Supabase, nada que borrar

          const ok = await modalConfirm(
            '¿Eliminar por completo esta incidencia? Si tiene un siniestro asociado (rotura/falta), también se eliminará.',
            { titulo: 'Eliminar incidencia', danger: true, textoOk: 'Eliminar' }
          );
          if (!ok) return;

          try {
            // 1. Si tenía siniestro asociado, se borra primero (por la FK incidencia_id)
            const { error: eSin } = await sb.from('siniestros').delete().eq('incidencia_id', inc.id);
            if (eSin) throw eSin;

            // 2. Borramos la incidencia
            const { error: eInc } = await sb.from('incidencias').delete().eq('id', inc.id);
            if (eInc) throw eInc;

                       tr.querySelectorAll('.i-motivo-check:checked').forEach(cb => cb.checked = false);
            inputObs.value = '';
            inputObs.disabled = true;

            await cargarIncidenciasHoy();
            actualizarFilaIncidencia(tiendaId, tr);
            actualizarKpiIncidencias();

            // Si la vista de Siniestros ya se había cargado, refrescamos su caché y KPI
            if (typeof siniestrosHoyCache !== 'undefined') {
              siniestrosHoyCache = siniestrosHoyCache.filter(s => s.incidencia.id !== inc.id);
              if (typeof actualizarKpiSiniestros === 'function') actualizarKpiSiniestros();
              if (document.getElementById('view-siniestros')?.classList.contains('active')) {
                renderKanbanSiniestros();
              }
            }
            // Refresca el KPI de Inicio contra la BD, funcione o no la caché anterior
            if (typeof actualizarKpiSiniestrosDesdeDB === 'function') actualizarKpiSiniestrosDesdeDB();
          } catch (err) {
            console.error('Error eliminando incidencia:', err);
            await modalAlert('No se pudo eliminar la incidencia.', { titulo: 'Error' });
          }
        });
      }
      inputObs.addEventListener('input', () => {
        const pos = inputObs.selectionStart;
        inputObs.value = inputObs.value.toUpperCase();
        inputObs.setSelectionRange(pos, pos);
      });
      inputObs.addEventListener('blur', guardar);

      // Abrir/cerrar el desplegable de motivos de esta fila (sin cerrar al marcar checkboxes)
      const motivoSel = tr.querySelector('.motivo-select');
      if (motivoSel) {
        const btn = motivoSel.querySelector('.filtro-select-btn');
        const dropdown = motivoSel.querySelector('.filtro-select-dropdown');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const yaAbierto = motivoSel.classList.contains('open');
          document.querySelectorAll('.motivo-select.open').forEach(o => { if (o !== motivoSel) o.classList.remove('open'); });
          motivoSel.classList.toggle('open', !yaAbierto);
          if (!yaAbierto) posicionarDropdownMotivo(motivoSel, dropdown);
        });
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        const buscadorMotivo = dropdown.querySelector('.i-buscar-motivo');
        if (buscadorMotivo) {
          buscadorMotivo.addEventListener('click', (e) => e.stopPropagation());
          buscadorMotivo.addEventListener('input', () => {
            const q = buscadorMotivo.value.trim().toUpperCase();
            dropdown.querySelectorAll('.filtro-check').forEach(row => {
              const texto = row.textContent.trim().toUpperCase();
              row.classList.toggle('oculto', q && !texto.includes(q));
            });
          });
        }
      }
    });
  }

  // Calcula la posición del desplegable de motivos con JS y lo pone en
  // position:fixed, para que no lo recorte el overflow:hidden de
  // .agencia-block (esto pasaba con la última fila de cada agencia).
  // Si no cabe hacia abajo, se abre hacia arriba.
  function posicionarDropdownMotivo(motivoSel, dropdown) {
    const rect = motivoSel.getBoundingClientRect();
    const margen = 6;
    const alturaEstim = Math.min(dropdown.scrollHeight || 260, 260);
    const espacioAbajo = window.innerHeight - rect.bottom;
    const abrirArriba = espacioAbajo < alturaEstim && rect.top > espacioAbajo;

    dropdown.style.position = 'fixed';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = rect.width + 'px';
    dropdown.style.right = 'auto';

    if (abrirArriba) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = (window.innerHeight - rect.top + margen) + 'px';
    } else {
      dropdown.style.bottom = 'auto';
      dropdown.style.top = (rect.bottom + margen) + 'px';
    }
  }

  // Cierra cualquier desplegable de motivos abierto al hacer clic fuera,
  // o al hacer scroll (para que no se quede flotando en un sitio erróneo)
  document.addEventListener('click', () => {
    document.querySelectorAll('.motivo-select.open').forEach(o => o.classList.remove('open'));
  });
  document.addEventListener('scroll', (e) => {
    // Si el scroll ocurre dentro del propio desplegable (la lista de motivos
    // tiene su propio scroll interno), no lo cerramos.
    if (e.target && e.target.closest && e.target.closest('.filtro-select-dropdown')) return;
    document.querySelectorAll('.motivo-select.open').forEach(o => o.classList.remove('open'));
  }, true);

  // ---------------------------------------------------------------
