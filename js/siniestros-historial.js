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
      mostrarCargandoGlobal();
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

      // 2. Incidencias de ese informe cuyo motivo es FALTAS o ROTURA CONFIRMADA.
      // Usamos el snapshot guardado en la propia incidencia en vez de un join
      // en vivo a tiendas/agencias, para que este histórico no cambie si
      // más adelante se edita la tienda o la agencia.
      const { data: incs, error: eInc } = await sb
        .from('incidencias')
        .select('id, motivo, observaciones, tienda_nombre, tienda_hora_prevista, agencia_id, agencia_nombre')
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
    } finally {
      ocultarCargandoGlobal();
    }
  }

  function renderHistorialSiniestros(informe, siniestros) {
    const cont = document.getElementById('contenidoHistorialSiniestros');
    const fechaInforme = new Date(informe.fecha + 'T00:00:00');
    const fechaTexto = `${dias[fechaInforme.getDay()]}, ${formatearFechaCorta(fechaInforme)}`;

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
    const enviados = siniestros.filter(s => s.estado === 'ENVIADO').length;
    const anulados = siniestros.filter(s => s.estado === 'ANULADO').length;

    // Agrupar por agencia (usando el snapshot guardado en la incidencia)
    const porAgencia = {};
    siniestros.forEach(s => {
      const agId = s.incidencia.agencia_id ?? 'sin-agencia';
      if (!porAgencia[agId]) porAgencia[agId] = { nombre: s.incidencia.agencia_nombre || 'Sin agencia', filas: [] };
      porAgencia[agId].filas.push(s);
    });

    const badgeEstado = (estado) => {
      if (estado === 'ENVIADO') return '<span class="badge-envio enviado">Enviado</span>';
      if (estado === 'ANULADO') return '<span class="badge-envio anulado">Anulado</span>';
      return '<span class="badge-envio pendiente">Pendiente</span>';
    };

    const tarjeta = (s) => {
      const numFotos = (s.fotos || []).length;
      return `
        <div class="siniestro-card ${s.estado === 'ANULADO' ? 'anulado' : ''}" style="cursor:default;">
          <div class="fila-top">
            <b>${escapeHtml(s.incidencia.tienda_nombre || '—')}</b>
            ${badgeEstado(s.estado)}
          </div>
          <div class="agencia">
            <span class="pill ${s.tipo === 'ROTURA' ? 'moderado' : 'grave'}">${s.tipo === 'ROTURA' ? 'Rotura' : 'Falta'}</span>
            · ${s.incidencia.tienda_hora_prevista ? s.incidencia.tienda_hora_prevista.slice(0,5) : '—'}
          </div>
          ${s.incidencia.observaciones ? `<div class="obs">${escapeHtml(s.incidencia.observaciones)}</div>` : ''}
          <div class="fotos-mini">📷 ${numFotos} foto${numFotos===1?'':'s'}</div>
          ${s.estado === 'ENVIADO'
            ? `<div class="fotos-mini">✉️ Enviado ${s.enviado_en ? formatearFechaHoraCorta(new Date(s.enviado_en)) : ''}${s.enviado_por ? ' · ' + escapeHtml(s.enviado_por) : ''}</div>`
            : s.estado === 'ANULADO'
              ? `<div class="fotos-mini">🚫 Anulado desde el Panel siniestros</div>`
              : `<div class="fotos-mini">Fecha límite: ${s.fecha_limite ? formatearFechaCorta(new Date(s.fecha_limite+'T00:00:00')) : '—'}</div>`}
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
        ${anulados ? `· <span style="color:var(--ink-soft); font-weight:700;">${anulados} anulado${anulados===1?'':'s'}</span>` : ''}
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
    // Las bajas/altas de tiendas pueden haberlas cambiado otros compañeros
    // desde que se cargó la lista de tiendas: se refrescan al entrar.
    if (typeof cargarBajasTiendas === 'function') await cargarBajasTiendas();
    await cargarIncidenciasHoy();
    document.getElementById('informeTituloFecha').textContent =
      `${dias[hoy.getDay()]}, ${formatearFechaCorta(hoy)}`;
    actualizarBadgePaletsPrevistos();

    // Si el informe de hoy ya se envió, al entrar en esta vista se activa
    // por defecto el filtro "Solo con incidencias": una vez enviado, lo que
    // interesa ver de un vistazo es lo que se mandó, no todas las tiendas.
    if (informeHoyCache?.informe_enviado) {
      filtrosIncidencias.soloConIncidencias = true;
      const cbSolo = document.getElementById('filtroSoloConIncidencias');
      if (cbSolo) cbSolo.checked = true;
    }

    construirPanelFiltrosIncidencias();
    if (typeof actualizarBadgeFiltros === 'function') actualizarBadgeFiltros();
    if (typeof actualizarBadgeUtilidades === 'function') actualizarBadgeUtilidades();
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

  // Incidencia de hoy de una tienda para una entrega concreta (HABITUAL por
  // defecto; PRUEBA / ESPECIAL son entregas adicionales con su propia fila).
  function incidenciaDeTienda(tiendaId, entrega = 'HABITUAL') {
    return incidenciasHoyCache.find(i => i.tienda_id === tiendaId && (i.entrega || 'HABITUAL') === entrega) || null;
  }

  let agenciasAbiertasIncidencias = new Set(); // ids de agencia desplegados en "Incidencias del día"
  let filtrosIncidencias = { agencias: new Set(), tipos: new Set(), motivos: new Set(), marcas: new Set(), soloConIncidencias: false, soloPendientes: false };

  function filtrosActivos() {
    return filtrosIncidencias.agencias.size > 0 || filtrosIncidencias.tipos.size > 0 || filtrosIncidencias.motivos.size > 0 || filtrosIncidencias.marcas.size > 0 || filtrosIncidencias.soloConIncidencias || filtrosIncidencias.soloPendientes;
  }

  // ¿La fila (tienda + entrega) cumple los filtros de Tipo / Motivo /
  // "Solo con incidencias" / "Solo pendientes"? (los de Agencia y Marca no
  // dependen de los motivos, así que no cambian al editar una fila).
  function filaCumpleFiltrosIncidencias(tiendaId, entrega) {
    const inc = incidenciaDeTienda(tiendaId, entrega);
    const motivosActuales = inc?.motivo || [];
    const marcada = motivosActuales.length > 0;
    const tipoCalc = calcularTipo(motivosActuales);
    const tipoEfectivo = marcada ? (tipoCalc || 'PENDIENTE') : null;

    if (filtrosIncidencias.soloConIncidencias && !marcada) return false;
    if (filtrosIncidencias.soloPendientes && !motivosActuales.some(m => m === 'RETRASO PDTE CONFIRMAR' || m === 'REVISANDO POSIBLE INCIDENCIA')) return false;
    if (filtrosIncidencias.tipos.size && (!tipoEfectivo || !filtrosIncidencias.tipos.has(tipoEfectivo))) return false;
    if (filtrosIncidencias.motivos.size && !motivosActuales.some(m => filtrosIncidencias.motivos.has(m))) return false;
    return true;
  }

  // ---------------------------------------------------------------
  // Cuenta atrás antes de que una fila salga del filtro
  // ---------------------------------------------------------------
  // Si al cambiar los motivos de una fila deja de cumplir los filtros
  // activos (p. ej. pasar de "RETRASO PDTE CONFIRMAR" a "RETRASO LEVE" con
  // "Solo pendientes"), no desaparece al momento: se queda con un aviso
  // "Sale del filtro en N s" para dar tiempo a retocar las observaciones.
  // La cuenta se pausa mientras se escribe en Observaciones o el desplegable
  // de motivos de esa fila está abierto. Al salir de Observaciones, o al
  // acabar la cuenta, se marca "Guardado" y la fila sale de la lista.
  const SEGUNDOS_SALIDA_FILTRO = 8;
  const filasSaliendoFiltro = new Map(); // 'tiendaId|entrega' -> { segundos, pausa, guardada, timer }

  function claveFilaInforme(tiendaId, entrega) {
    return tiendaId + '|' + (entrega || 'HABITUAL');
  }

  function trDeFilaInforme(tiendaId, entrega) {
    return document.querySelector(`#contenidoIncidencias tr[data-tienda="${tiendaId}"][data-entrega="${entrega || 'HABITUAL'}"]`);
  }

  function filaInformeEnEdicion(tr) {
    if (!tr) return false;
    if (tr.querySelector('.motivo-select.open')) return true;
    const activo = document.activeElement;
    return !!(activo && tr.contains(activo) && activo.classList.contains('i-obs'));
  }

  function chipSalidaFiltroHtml(tiendaId, entrega) {
    const s = filasSaliendoFiltro.get(claveFilaInforme(tiendaId, entrega));
    if (!s) return '';
    if (s.guardada) return '<span class="fila-sale-chip guardado">✓ Guardado</span>';
    if (s.pausa) return '<span class="fila-sale-chip pausa">✏️ En pausa mientras escribes</span>';
    return `<span class="fila-sale-chip">⏳ Sale del filtro en <span class="seg">${s.segundos}</span> s</span>`;
  }

  function pintarChipSalidaFiltro(tiendaId, entrega) {
    const tr = trDeFilaInforme(tiendaId, entrega);
    if (!tr) return;
    const s = filasSaliendoFiltro.get(claveFilaInforme(tiendaId, entrega));
    let wrap = tr.querySelector('.fila-sale-wrap');
    if (!s) {
      tr.classList.remove('fila-saliendo', 'fila-saliendo-ok');
      if (wrap) wrap.remove();
      return;
    }
    tr.classList.add('fila-saliendo');
    tr.classList.toggle('fila-saliendo-ok', !!s.guardada);
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'fila-sale-wrap';
      tr.querySelector('.col-tienda')?.appendChild(wrap);
    }
    wrap.innerHTML = chipSalidaFiltroHtml(tiendaId, entrega);
  }

  function iniciarSalidaFiltro(tiendaId, entrega) {
    const clave = claveFilaInforme(tiendaId, entrega);
    if (!filasSaliendoFiltro.has(clave)) {
      const s = { segundos: SEGUNDOS_SALIDA_FILTRO, pausa: false, guardada: false, timer: null };
      filasSaliendoFiltro.set(clave, s);
      s.timer = setInterval(() => {
        const tr = trDeFilaInforme(tiendaId, entrega);
        if (!tr) { cancelarSalidaFiltro(tiendaId, entrega); return; }
        s.pausa = filaInformeEnEdicion(tr);
        if (!s.pausa) {
          s.segundos -= 1;
          if (s.segundos <= 0) { finalizarSalidaFiltro(tiendaId, entrega); return; }
        }
        pintarChipSalidaFiltro(tiendaId, entrega);
      }, 1000);
    }
    const s = filasSaliendoFiltro.get(clave);
    s.pausa = filaInformeEnEdicion(trDeFilaInforme(tiendaId, entrega));
    pintarChipSalidaFiltro(tiendaId, entrega);
  }

  function cancelarSalidaFiltro(tiendaId, entrega) {
    const clave = claveFilaInforme(tiendaId, entrega);
    const s = filasSaliendoFiltro.get(clave);
    if (!s) return;
    clearInterval(s.timer);
    filasSaliendoFiltro.delete(clave);
    pintarChipSalidaFiltro(tiendaId, entrega);
  }

  function finalizarSalidaFiltro(tiendaId, entrega) {
    const clave = claveFilaInforme(tiendaId, entrega);
    const s = filasSaliendoFiltro.get(clave);
    if (!s || s.guardada) return;
    clearInterval(s.timer);
    s.guardada = true;
    pintarChipSalidaFiltro(tiendaId, entrega);

    setTimeout(() => {
      filasSaliendoFiltro.delete(clave);
      const tr = trDeFilaInforme(tiendaId, entrega);
      if (!filtrosActivos() || filaCumpleFiltrosIncidencias(tiendaId, entrega)) {
        // Ya no hay filtro (o vuelve a cumplirlo): se queda, sin aviso.
        pintarChipSalidaFiltro(tiendaId, entrega);
        return;
      }
      // Si se está editando otra fila, no se repinta todo (perdería el foco
      // o cerraría su desplegable): solo se quita esta fila.
      const cont = document.getElementById('contenidoIncidencias');
      const activo = document.activeElement;
      const editando = cont && (cont.querySelector('.motivo-select.open')
        || (activo && cont.contains(activo) && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA')));
      if (editando) {
        if (tr) tr.remove();
      } else {
        renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
      }
    }, 900);
  }

  function renderAcordeonIncidencias(filtroTexto = '') {
    const cont = document.getElementById('contenidoIncidencias');
    const f = filtroTexto.trim().toUpperCase();
    const hayFiltros = filtrosActivos();
    // Las tiendas marca "Sábado" solo reciben entrega ese día, así que no
    // deben aparecer en el informe de hoy el resto de días de la semana
    // (salvo que el usuario las pida explícitamente desde el filtro Marca).
    const hoyEsSabado = hoy.getDay() === 6;

    let agenciasAMostrar = agenciasCache;
    if (filtrosIncidencias.agencias.size) {
      agenciasAMostrar = agenciasCache.filter(ag => filtrosIncidencias.agencias.has(ag.id));
    }

    // Tiendas "efectivas" para hoy: si una tienda tiene un cambio puntual
    // de hora y/o agencia (desde "Utilidades"), se agrupa bajo la agencia
    // nueva y se muestra la hora nueva — solo para el informe de hoy.
    // Las tiendas de baja hoy no salen en el informe (salvo que ya tengan
    // una incidencia marcada hoy, para no esconder algo ya registrado).
    const enBajaHoy = (id) => typeof tiendaEnBajaEnFecha === 'function' && tiendaEnBajaEnFecha(id, fechaHoyISO);
    const tiendasHabituales = tiendasCache
      .filter(t => t.activo)
      .filter(t => !enBajaHoy(t.id) || !!incidenciaDeTienda(t.id)?.marcada)
      .map(t => ({ ...(typeof tiendaEfectivaHoy === 'function' ? tiendaEfectivaHoy(t.id) : t), entrega: 'HABITUAL' }));

    // Entregas ADICIONALES de hoy (prueba / especial): una fila más de la
    // misma tienda bajo la otra agencia, con su propia incidencia.
    const extras = [];
    if (typeof entregasAdicionalesEnFecha === 'function') {
      entregasAdicionalesEnFecha(fechaHoyISO, informeHoyCache).forEach(({ tiendaId, entrega }) => {
        const te = tiendaEfectivaHoyEntrega(tiendaId, entrega);
        if (!te) return;
        if (enBajaHoy(tiendaId) && !incidenciaDeTienda(tiendaId, entrega)?.marcada) return;
        extras.push(te);
      });
    }
    // Si ya hay una incidencia de prueba/especial pero esa entrega se ha
    // quitado después, la fila sigue saliendo (con la agencia guardada)
    // para no esconder algo registrado.
    incidenciasHoyCache
      .filter(i => i.marcada && (i.entrega || 'HABITUAL') !== 'HABITUAL'
        && !extras.some(x => x.id === i.tienda_id && x.entrega === i.entrega))
      .forEach(i => {
        const t = tiendasCache.find(x => x.id === i.tienda_id);
        if (t) extras.push({ ...t, agencia_id: i.agencia_id ?? t.agencia_id, hora_prevista: i.tienda_hora_prevista || t.hora_prevista, entrega: i.entrega });
      });
    const tiendasEfectivas = [...tiendasHabituales, ...extras];

    cont.innerHTML = agenciasAMostrar.map(ag => {
      let tds = tiendasEfectivas.filter(t => t.agencia_id === ag.id);
      if (f) tds = tds.filter(t => t.nombre.toUpperCase().includes(f));

      // Filtro Marca: exclusión automática de "Sábado" fuera de los sábados,
      // más la selección manual del usuario (Habitual/Sábado/Prueba/Especial).
      tds = tds.filter(t => {
        if (!hoyEsSabado && t.marca === 'SABADO' && !filtrosIncidencias.marcas.has('SABADO')) return false;
        if (filtrosIncidencias.marcas.size && !filtrosIncidencias.marcas.has(marcaDeFilaInforme(t))) return false;
        return true;
      });

      if (filtrosIncidencias.tipos.size || filtrosIncidencias.motivos.size || filtrosIncidencias.soloConIncidencias || filtrosIncidencias.soloPendientes) {
        tds = tds.filter(t => {
          // Fila en cuenta atrás para salir del filtro: se sigue mostrando.
          if (filasSaliendoFiltro.has(claveFilaInforme(t.id, t.entrega))) return true;
          return filaCumpleFiltrosIncidencias(t.id, t.entrega);
        });
      }

      if (!tds.length) return '';

      const numInc = tds.filter(t => incidenciaDeTienda(t.id, t.entrega)?.marcada).length;

      const filas = tds.map(t => {
        const inc = incidenciaDeTienda(t.id, t.entrega);
        const motivosActuales = inc?.motivo || [];
        const marcada = motivosActuales.length > 0;
        const tipoCalc = calcularTipo(motivosActuales);
        const esPendiente = marcada && !tipoCalc;
        const claseFila = marcada ? (tipoCalc ? tipoCalc.toLowerCase() : 'pendiente') : '';
        const salida = filasSaliendoFiltro.get(claveFilaInforme(t.id, t.entrega));
        const claseSalida = salida ? (' fila-saliendo' + (salida.guardada ? ' fila-saliendo-ok' : '')) : '';
        const chipSalida = salida ? `<span class="fila-sale-wrap">${chipSalidaFiltroHtml(t.id, t.entrega)}</span>` : '';

        const badgeTipo = !marcada
          ? '<span style="color:var(--ink-soft); font-size:12px;">—</span>'
          : esPendiente
            ? '<span class="pill pendiente">Pendiente</span>'
            : `<span class="pill ${tipoCalc.toLowerCase()}">${tipoCalc.charAt(0)+tipoCalc.slice(1).toLowerCase()}</span>`;

        const ajustePuntual = (t.entrega === 'HABITUAL' && typeof ajustePuntualDeTienda === 'function') ? ajustePuntualDeTienda(t.id) : null;
        const iconoAjuste = ajustePuntual
          ? `<span class="ajuste-puntual-badge" title="Cambio puntual solo hoy${ajustePuntual.hora_prevista ? ' · Hora: ' + escapeHtml(ajustePuntual.hora_prevista.slice(0,5)) : ''}${ajustePuntual.agencia_id != null ? ' · Agencia: ' + escapeHtml(ajustePuntual.agencia_nombre || '') : ''}">🛠️</span>`
          : '';

        return `
          <tr data-tienda="${t.id}" data-entrega="${t.entrega}" class="${(claseFila ? 'con-incidencia ' + claseFila : '') + claseSalida}">
            <td class="col-estado">${marcada ? '🔴' : '—'}</td>
            <td class="col-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}</td>
            <td class="col-tienda">${badgeFilaInformeHtml(t)}${escapeHtml(t.nombre)}${iconoAjuste}${chipSalida}</td>
            <td class="col-tipo">${badgeTipo}</td>
                        <td class="col-motivo">
              <div class="motivo-select">
                <button type="button" class="filtro-select-btn">
                  <span class="motivo-select-valor" title="${escapeHtml(tituloMotivos(motivosActuales))}">${escapeHtml(resumenMotivos(motivosActuales))}</span>
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
      const entrega = tr.dataset.entrega || 'HABITUAL';
      const inputObs = tr.querySelector('.i-obs');

            const guardar = () => guardarIncidencia(tiendaId, tr);
      const btnBorrarMotivos = tr.querySelector('.btn-borrar-motivos');

      tr.querySelectorAll('.i-motivo-check').forEach(cb => cb.addEventListener('change', () => {
        const hayMotivo = tr.querySelectorAll('.i-motivo-check:checked').length > 0;
        inputObs.disabled = !hayMotivo;
        if (btnBorrarMotivos) btnBorrarMotivos.style.display = hayMotivo ? '' : 'none';
        // Si la fila se queda sin ningún motivo con el desplegable aún
        // abierto, NO se borra todavía: puede que se esté cambiando un
        // motivo pendiente (p. ej. "RETRASO PDTE CONFIRMAR") por el real.
        // El borrado se decide al cerrar el desplegable (ver 'motivo-cerrado').
        if (!hayMotivo && tr.querySelector('.motivo-select.open')) return;
        guardar();
      }));

                  if (btnBorrarMotivos) {
        btnBorrarMotivos.addEventListener('click', async (e) => {
          e.stopPropagation();
          const inc = incidenciaDeTienda(tiendaId, entrega);
          if (!inc) return; // no había fila en Supabase, nada que borrar

          // Si el siniestro asociado ya se ha enviado a la agencia, no se
          // puede borrar la incidencia desde aquí (se perdería el rastro de
          // algo ya reclamado): hay que borrarlo desde el Panel siniestros,
          // que es quien se encarga de arrastrar también esta incidencia.
          let haySiniestro = false;
          try {
            const { data: sinExistente } = await sb.from('siniestros')
              .select('id, estado').eq('incidencia_id', inc.id).maybeSingle();
            if (sinExistente?.estado === 'ENVIADO') {
              await modalAlert(
                'Este siniestro ya se ha enviado a la agencia. Para eliminarlo, hazlo desde el Panel siniestros.',
                { titulo: 'No se puede eliminar' }
              );
              return;
            }
            haySiniestro = !!sinExistente;
          } catch (err) {
            console.error('Error comprobando el estado del siniestro:', err);
          }

          // Motivos que tiene ahora mismo (para el log de cambios y para
          // que el usuario vea exactamente qué se va a quitar antes de
          // confirmar).
          const motivosAntes = inc.motivo || [];
          const observacionesAntes = inc.observaciones || '';
          const textoMotivos = typeof resumenMotivos === 'function' ? resumenMotivos(motivosAntes) : motivosAntes.join(', ');

          const ok = await modalConfirm(
            `¿Eliminar por completo esta incidencia? Se ${motivosAntes.length === 1 ? 'quitará' : 'quitarán'} ${motivosAntes.length} motivo${motivosAntes.length === 1 ? '' : 's'}: ${textoMotivos}.` +
            (haySiniestro ? ' Tiene un siniestro asociado (rotura/falta) que también se eliminará.' : ''),
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

            // 3. Si el informe de hoy ya estaba enviado a las agencias, dejamos
            // constancia en el log de cambios (igual que hace guardarIncidencia()
            // al guardar desde el desplegable de motivos).
            if (typeof registrarCambioInformeSiEnviado === 'function') {
              const tienda = (typeof tiendaEfectivaHoyEntrega === 'function' ? tiendaEfectivaHoyEntrega(tiendaId, entrega) : null) || tiendasCache.find(t => t.id === tiendaId);
              const agencia = tienda ? agenciasCache.find(a => a.id === tienda.agencia_id) : null;
              registrarCambioInformeSiEnviado(informeHoyCache, {
                tiendaId,
                tiendaNombre: tienda?.nombre,
                agenciaNombre: agencia?.nombre,
                motivosAntes,
                motivosDespues: [],
                observacionesAntes,
                observacionesDespues: ''
              });
            }

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
      inputObs.addEventListener('blur', async (e) => {
        await guardar();
        // Fila en cuenta atrás para salir del filtro: al terminar de escribir
        // las observaciones sale ya (salvo que se haya pasado a otro control
        // de la misma fila, p. ej. el desplegable de motivos).
        if (filasSaliendoFiltro.has(claveFilaInforme(tiendaId, entrega))
            && !(e.relatedTarget && tr.contains(e.relatedTarget))) {
          finalizarSalidaFiltro(tiendaId, entrega);
        }
      });

      // Abrir/cerrar el desplegable de motivos de esta fila (sin cerrar al marcar checkboxes)
      const motivoSel = tr.querySelector('.motivo-select');
      if (motivoSel) {
        const btn = motivoSel.querySelector('.filtro-select-btn');
        const dropdown = motivoSel.querySelector('.filtro-select-dropdown');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const yaAbierto = motivoSel.classList.contains('open');
          document.querySelectorAll('.motivo-select.open').forEach(o => { if (o !== motivoSel) cerrarMotivoSelect(o); });
          if (yaAbierto) {
            cerrarMotivoSelect(motivoSel);
          } else {
            motivoSel.classList.add('open');
            posicionarDropdownMotivo(motivoSel, dropdown);
          }
        });
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        // Al cerrar el desplegable:
        //  - si se ha quedado sin ningún motivo, ahora sí se borra la
        //    incidencia (con sus observaciones), igual que antes;
        //  - si el cambio hizo que la fila ya no cumpla los filtros, su
        //    cuenta atrás (ver iniciarSalidaFiltro) sigue sola al cerrarse.
        motivoSel.addEventListener('motivo-cerrado', () => {
          const hayMotivo = tr.querySelectorAll('.i-motivo-check:checked').length > 0;
          if (!hayMotivo && incidenciaDeTienda(tiendaId, entrega)) {
            guardar();
          }
        });

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
    const alturaEstim = Math.min(dropdown.scrollHeight || 340, 340);
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
  // Cierra un desplegable de motivos y avisa a su fila ('motivo-cerrado'),
  // que decide entonces si borrar la incidencia o repintar el listado.
  function cerrarMotivoSelect(o) {
    if (!o.classList.contains('open')) return;
    o.classList.remove('open');
    o.dispatchEvent(new CustomEvent('motivo-cerrado'));
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.motivo-select.open').forEach(cerrarMotivoSelect);
  });
  document.addEventListener('scroll', (e) => {
    // Si el scroll ocurre dentro del propio desplegable (la lista de motivos
    // tiene su propio scroll interno), no lo cerramos.
    if (e.target && e.target.closest && e.target.closest('.filtro-select-dropdown')) return;
    document.querySelectorAll('.motivo-select.open').forEach(cerrarMotivoSelect);
  }, true);

  // ---------------------------------------------------------------
