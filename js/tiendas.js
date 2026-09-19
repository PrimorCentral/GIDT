// Gestión de tiendas (acordeón por agencia)
  // ---------------------------------------------------------------
  let agenciasCache = [];
  let tiendasCache = [];
  let agenciasTiendasAbiertas = new Set(); // ids de agencia desplegados en "Gestión de tiendas"
  let filtroTiendasTexto = '';
  const MARCA_LABEL = { HABITUAL: 'Habitual', SABADO: 'Sábado', PRUEBA: 'Prueba', ESPECIAL: 'Especial' };
  const MARCA_CLASE = { HABITUAL: 'leve', SABADO: 'sabado', PRUEBA: 'prueba', ESPECIAL: 'especial' };
  const MARCA_BADGE_LETRA = { SABADO: 'S', ESPECIAL: 'E', PRUEBA: 'P' };
  function badgeMarcaHtml(marca) {
    const letra = MARCA_BADGE_LETRA[marca];
    if (!letra) return ''; // HABITUAL: sin badge
    return `<span class="marca-badge ${MARCA_CLASE[marca]}" title="${MARCA_LABEL[marca]}">${letra}</span>`;
  }

  // ---------------------------------------------------------------
  // Horario semanal especial (por día de la semana) de una tienda.
  // Vive en tiendas.horario_semana: { "<día ISO 1-7>": "HH:MM" }
  // (1=lunes…7=domingo). Los días que no aparecen usan hora_prevista.
  // Lo resuelve tiendaEfectivaHoy()/tiendaConHorarioDia() en
  // utilidades-informe.js a la hora de generar cada informe diario,
  // así que el cambio aquí ya se refleja solo en los informes.
  // ---------------------------------------------------------------
  const DIAS_SEMANA_ISO = [
    { iso: 1, label: 'Lunes' },
    { iso: 2, label: 'Martes' },
    { iso: 3, label: 'Miércoles' },
    { iso: 4, label: 'Jueves' },
    { iso: 5, label: 'Viernes' },
    { iso: 6, label: 'Sábado' },
    { iso: 7, label: 'Domingo' }
  ];

  // Pequeño badge "🗓️N" junto a la hora, con el detalle en el title, si la
  // tienda tiene algún día de la semana con horario distinto configurado.
  function badgeHorarioSemanaHtml(t) {
    const mapa = t.horario_semana || {};
    const clavesDias = Object.keys(mapa);
    if (!clavesDias.length) return '';
    const detalle = clavesDias
      .map(iso => DIAS_SEMANA_ISO.find(d => String(d.iso) === iso))
      .filter(Boolean)
      .map(d => `${d.label} ${mapa[String(d.iso)].slice(0, 5)}`)
      .join(', ');
    return ` <span title="Horario especial — ${escapeHtml(detalle)}" style="display:inline-block; margin-left:4px; font-size:10px; padding:1px 5px; border-radius:8px; background:var(--panel-muted); color:var(--accent-ink); vertical-align:middle;">🗓️${clavesDias.length}</span>`;
  }

  // Normaliza texto para comparar sin distinguir mayúsculas/minúsculas ni acentos
  function normalizarTextoBusqueda(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function tiendaCoincideBusqueda(t, qNormalizada) {
    if (!qNormalizada) return true;
    return normalizarTextoBusqueda(t.nombre).includes(qNormalizada)
      || normalizarTextoBusqueda(t.provincia).includes(qNormalizada)
      || normalizarTextoBusqueda(t.numero_tienda).includes(qNormalizada)
      || normalizarTextoBusqueda(t.direccion).includes(qNormalizada)
      || normalizarTextoBusqueda(t.supervisor).includes(qNormalizada);
  }

  async function cargarAgenciasYTiendas() {
    const [{ data: ags, error: e1 }, { data: tds, error: e2 }] = await Promise.all([
      sb.from('agencias').select('id, nombre, orden').order('orden'),
      sb.from('tiendas').select('id, nombre, agencia_id, hora_prevista, horario_semana, marca, provincia, orden, activo, numero_tienda, direccion, limite_palets, limite_hora_entrega, supervisor, creado_en').order('orden')
    ]);
    if (e1 || e2) { console.error(e1 || e2); return; }
    agenciasCache = ags || [];
    tiendasCache = tds || [];

    // rellenar el <select> de agencia del formulario de alta
    const sel = document.getElementById('ntAgencia');
    sel.innerHTML = agenciasCache.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');

    renderAcordeonTiendas();
  }

  function renderTiendasContadores() {
    const cont = document.getElementById('tiendasContadores');
    if (!cont) return;
    const activas = tiendasCache.filter(t => t.activo);
    const totales = { HABITUAL: 0, SABADO: 0, PRUEBA: 0, ESPECIAL: 0 };
    activas.forEach(t => { if (totales[t.marca] != null) totales[t.marca]++; });
    cont.innerHTML = `
      <span class="tiendas-contador"><b>${totales.HABITUAL}</b><span>Tiendas</span></span>
      <span class="tiendas-contador sabado"><b>${totales.SABADO}</b><span>Sábados</span></span>
      <span class="tiendas-contador prueba"><b>${totales.PRUEBA}</b><span>Pruebas</span></span>
      <span class="tiendas-contador especial"><b>${totales.ESPECIAL}</b><span>Especiales</span></span>
    `;
  }

  function renderAcordeonTiendas() {
    renderTiendasContadores();
    const cont = document.getElementById('acordeonAgencias');
    const qNormalizada = normalizarTextoBusqueda(filtroTiendasTexto);
    const buscando = !!qNormalizada;

    const bloques = agenciasCache.map(ag => {
      const tds = tiendasCache.filter(t => t.agencia_id === ag.id && t.activo && tiendaCoincideBusqueda(t, qNormalizada));
      if (buscando && tds.length === 0) return ''; // oculta agencias sin coincidencias mientras se busca
      const abierta = buscando ? true : agenciasTiendasAbiertas.has(ag.id);
      const filas = tds.length
        ? tds.map(t => `
            <tr data-tienda="${t.id}">
              <td class="celda-numero">${t.numero_tienda ? escapeHtml(t.numero_tienda) : '—'}</td>
              <td class="celda-nombre">${escapeHtml(t.nombre)}</td>
              <td class="hora celda-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}${badgeHorarioSemanaHtml(t)}</td>
              <td class="celda-direccion">${t.direccion ? escapeHtml(t.direccion) : '—'}</td>
              <td class="celda-provincia">${t.provincia ? escapeHtml(t.provincia) : '—'}</td>
              <td class="celda-limite-palets">${t.limite_palets != null ? t.limite_palets : '—'}</td>
              <td class="celda-limite-hora">${t.limite_hora_entrega ? t.limite_hora_entrega.slice(0,5) : '—'}</td>
              <td class="celda-supervisor">${t.supervisor ? escapeHtml(t.supervisor) : '—'}</td>
              <td class="celda-marca"><span class="pill ${MARCA_CLASE[t.marca] || 'leve'}">${MARCA_LABEL[t.marca] || t.marca}</span></td>
              <td class="acciones">
                <button class="mini-btn" data-mover="up" title="Subir">▲</button>
                <button class="mini-btn" data-mover="down" title="Bajar">▼</button>
                <span class="acciones-separador"></span>
                <button class="mini-btn" data-editar title="Editar">✏️</button>
                <button class="mini-btn" data-horario-semana title="Horario por días de la semana">🗓️</button>
                <span class="acciones-separador"></span>
                <button class="mini-btn" data-cambiar-agencia title="Mover a otra agencia">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8h13M17 8l-4-4M17 8l-4 4M20 16H7M7 16l4-4M7 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="mini-btn" data-borrar title="Eliminar">🗑️</button>
              </td>
            </tr>`).join('')
        : `<tr><td colspan="10" style="text-align:center; padding:16px; color:var(--ink-soft);">Sin tiendas en esta agencia.</td></tr>`;

      return `
        <div class="agencia-block">
          <div class="agencia-head ${abierta ? 'open' : ''}" data-agencia="${ag.id}">
            <span class="caret">▶</span>
            <b>${escapeHtml(ag.nombre)}</b>
            <span class="count">${tds.length} tienda${tds.length === 1 ? '' : 's'}</span>
          </div>
          <div class="agencia-body ${abierta ? 'open' : ''}">
            <div class="tabla-tiendas-scroll">
              <table class="tabla-tiendas">
                <thead>
                  <tr>
                    <th class="th-numero">Nº Tienda</th>
                    <th class="th-nombre">Nombre tienda</th>
                    <th class="th-hora">Hora entrega</th>
                    <th class="th-direccion">Dirección completa</th>
                    <th class="th-provincia">Provincia</th>
                    <th class="th-limite-palets">Límite palets</th>
                    <th class="th-limite-hora">Límite hora entrega</th>
                    <th class="th-supervisor">Supervisor/a</th>
                    <th class="th-marca">Marca</th>
                    <th class="th-acciones"></th>
                  </tr>
                </thead>
                <tbody>${filas}</tbody>
              </table>
            </div>
          </div>
        </div>`;
    });

    cont.innerHTML = buscando && bloques.every(b => !b)
      ? `<div class="card" style="text-align:center; padding:30px; color:var(--ink-soft);">Ninguna tienda coincide con "${escapeHtml(filtroTiendasTexto)}".</div>`
      : bloques.join('');

    cont.querySelectorAll('.agencia-head').forEach(head => {
      head.addEventListener('click', () => {
        const id = Number(head.dataset.agencia);
        const abierto = head.classList.toggle('open');
        head.nextElementSibling.classList.toggle('open');
        if (abierto) agenciasTiendasAbiertas.add(id); else agenciasTiendasAbiertas.delete(id);
      });
    });

    cont.querySelectorAll('[data-mover]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        moverTienda(Number(tr.dataset.tienda), btn.dataset.mover);
      });
    });
    cont.querySelectorAll('[data-editar]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        abrirModalEditarTienda(Number(tr.dataset.tienda));
      });
    });
    cont.querySelectorAll('[data-horario-semana]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        abrirModalHorarioSemana(Number(tr.dataset.tienda));
      });
    });
    cont.querySelectorAll('[data-cambiar-agencia]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        cambiarAgenciaTienda(Number(tr.dataset.tienda));
      });
    });
    cont.querySelectorAll('[data-borrar]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        borrarTienda(Number(tr.dataset.tienda));
      });
    });
  }

  // ---------------------------------------------------------------
  // Modal "Editar tienda": nombre, hora prevista, provincia y marca.
  // Sustituye a la antigua edición en línea dentro de la propia fila.
  // ---------------------------------------------------------------
  let editarTiendaId = null;

  function abrirModalEditarTienda(tiendaId) {
    const t = tiendasCache.find(x => x.id === tiendaId);
    const overlay = document.getElementById('modalEditarTiendaOverlay');
    if (!t || !overlay) return;
    editarTiendaId = tiendaId;

    document.getElementById('metNumero').value = t.numero_tienda || '';
    document.getElementById('metNombre').value = t.nombre || '';
    document.getElementById('metHora').value = t.hora_prevista ? t.hora_prevista.slice(0, 5) : '';
    document.getElementById('metDireccion').value = t.direccion || '';
    document.getElementById('metProvincia').value = t.provincia || '';
    document.getElementById('metLimitePalets').value = t.limite_palets != null ? t.limite_palets : '';
    document.getElementById('metLimiteHora').value = t.limite_hora_entrega ? t.limite_hora_entrega.slice(0, 5) : '';
    document.getElementById('metSupervisor').value = t.supervisor || '';
    document.getElementById('metMarca').value = t.marca || 'HABITUAL';
    const errEl = document.getElementById('metError');
    errEl.style.display = 'none';
    errEl.textContent = '';

    overlay.classList.add('show');
    setTimeout(() => document.getElementById('metNombre').focus(), 30);
  }

  function cerrarModalEditarTienda() {
    document.getElementById('modalEditarTiendaOverlay')?.classList.remove('show');
    editarTiendaId = null;
  }

  async function guardarModalEditarTienda() {
    if (editarTiendaId == null) return;
    const numeroTienda = document.getElementById('metNumero').value.trim();
    const nombre = document.getElementById('metNombre').value.trim();
    const hora = document.getElementById('metHora').value;
    const direccion = document.getElementById('metDireccion').value.trim();
    const provincia = document.getElementById('metProvincia').value.trim();
    const limitePaletsRaw = document.getElementById('metLimitePalets').value;
    const limiteHora = document.getElementById('metLimiteHora').value;
    const supervisor = document.getElementById('metSupervisor').value.trim();
    const marca = document.getElementById('metMarca').value;
    const errEl = document.getElementById('metError');
    errEl.style.display = 'none';

    if (!nombre) {
      errEl.textContent = 'Ponle un nombre a la tienda.';
      errEl.style.display = 'block';
      return;
    }

    try {
      const { error } = await sb.from('tiendas').update({
        numero_tienda: numeroTienda || null,
        nombre,
        hora_prevista: hora || null,
        direccion: direccion || null,
        provincia: provincia || null,
        limite_palets: limitePaletsRaw !== '' ? Number(limitePaletsRaw) : null,
        limite_hora_entrega: limiteHora || null,
        supervisor: supervisor || null,
        marca
      }).eq('id', editarTiendaId);
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Editar tienda', nombre);
      cerrarModalEditarTienda();
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error editando tienda:', err);
      errEl.textContent = 'No se pudo guardar el cambio.';
      errEl.style.display = 'block';
    }
  }

  document.getElementById('modalEditarTiendaBtnCancelar')?.addEventListener('click', cerrarModalEditarTienda);
  document.getElementById('modalEditarTiendaBtnGuardar')?.addEventListener('click', guardarModalEditarTienda);
  // Nota (2026-09-17): a petición de Jose, este modal ya NO se cierra al
  // clicar fuera — solo con Cancelar/Guardar, para no perder cambios por
  // un clic accidental.

  async function moverTienda(id, direccion) {
    const t = tiendasCache.find(x => x.id === id);
    if (!t) return;
    const hermanas = tiendasCache.filter(x => x.agencia_id === t.agencia_id && x.activo).sort((a,b) => a.orden - b.orden);
    const idx = hermanas.findIndex(x => x.id === id);
    const idxDestino = direccion === 'up' ? idx - 1 : idx + 1;
    if (idxDestino < 0 || idxDestino >= hermanas.length) return;

    const otra = hermanas[idxDestino];
    try {
      await Promise.all([
        sb.from('tiendas').update({ orden: otra.orden }).eq('id', t.id),
        sb.from('tiendas').update({ orden: t.orden }).eq('id', otra.id)
      ]);
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error moviendo tienda:', err);
    }
  }

  async function cambiarAgenciaTienda(id) {
    const t = tiendasCache.find(x => x.id === id);
    if (!t) return;

    const opciones = agenciasCache.map(a => ({ id: a.id, nombre: a.nombre }));
    const destinoId = await modalSeleccionar(
      `Selecciona la agencia a la que quieres mover "${t.nombre}":`,
      opciones,
      { titulo: 'Mover tienda de agencia', textoOk: 'Mover', valorInicial: t.agencia_id, bloquearClicFuera: true }
    );
    if (!destinoId || destinoId === t.agencia_id) return;

    try {
      const hermanasDestino = tiendasCache.filter(x => x.agencia_id === destinoId && x.activo);
      const nuevoOrden = hermanasDestino.length
        ? Math.max(...hermanasDestino.map(x => x.orden)) + 1
        : 1;

      // Snapshot de la agencia antigua ANTES de sobrescribirla: deja
      // constancia del cambio (tienda_agencia_historial), que usa el
      // Reporte mensual (Análisis) para partir la fila de esta tienda ese
      // mes entre la agencia antigua y la nueva.
      const agenciaAnterior = agenciasCache.find(a => a.id === t.agencia_id);
      const agenciaNueva = agenciasCache.find(a => a.id === destinoId);

      const { error } = await sb.from('tiendas')
        .update({ agencia_id: destinoId, orden: nuevoOrden })
        .eq('id', id);
      if (error) throw error;

      const { error: eHist } = await sb.from('tienda_agencia_historial').insert({
        tienda_id: id,
        agencia_anterior_id: t.agencia_id,
        agencia_anterior_nombre: agenciaAnterior?.nombre || null,
        agencia_nueva_id: destinoId,
        agencia_nueva_nombre: agenciaNueva?.nombre || '—',
        fecha_cambio: fechaLocalISO(new Date()),
        creado_por: sesionActual?.nombre || sesionActual?.usuario || null
      });
      if (eHist) console.error('No se pudo registrar el historial de cambio de agencia:', eHist);
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Mover tienda de agencia', `${t.nombre}: ${agenciaAnterior?.nombre || '—'} → ${agenciaNueva?.nombre || '—'}`);

      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error moviendo tienda de agencia:', err);
      await modalAlert('No se pudo mover la tienda a la otra agencia.', { titulo: 'Error' });
    }
  }

  async function borrarTienda(id) {
    const t = tiendasCache.find(x => x.id === id);
    if (!t) return;
    const ok = await modalConfirm(
      `¿Eliminar "${t.nombre}"?`,
      { titulo: 'Eliminar tienda', danger: true, textoOk: 'Eliminar' }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('tiendas').update({ activo: false }).eq('id', id);
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Eliminar tienda', t.nombre);
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error eliminando tienda:', err);
      await modalAlert('No se pudo eliminar la tienda.', { titulo: 'Error' });
    }
  }

  // ---------------------------------------------------------------
  // Modal "Nueva tienda" (mismo patrón que el modal "Nueva agencia").
  // ---------------------------------------------------------------
  function limpiarFormNuevaTienda() {
    document.getElementById('ntNumero').value = '';
    document.getElementById('ntNombre').value = '';
    document.getElementById('ntHora').value = '';
    document.getElementById('ntDireccion').value = '';
    document.getElementById('ntProvincia').value = '';
    document.getElementById('ntLimitePalets').value = '';
    document.getElementById('ntLimiteHora').value = '';
    document.getElementById('ntSupervisor').value = '';
    document.getElementById('ntMarca').value = 'HABITUAL';
    document.getElementById('ntError').style.display = 'none';
  }

  function abrirModalNuevaTienda() {
    limpiarFormNuevaTienda();
    document.getElementById('nuevaTiendaModalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('ntNumero').focus(), 30);
  }

  function cerrarModalNuevaTienda() {
    document.getElementById('nuevaTiendaModalOverlay').classList.remove('show');
  }

  async function guardarNuevaTienda() {
    const numeroTienda = document.getElementById('ntNumero').value.trim();
    const nombre = document.getElementById('ntNombre').value.trim();
    const agenciaId = Number(document.getElementById('ntAgencia').value);
    const hora = document.getElementById('ntHora').value;
    const direccion = document.getElementById('ntDireccion').value.trim();
    const provincia = document.getElementById('ntProvincia').value.trim();
    const limitePaletsRaw = document.getElementById('ntLimitePalets').value;
    const limiteHora = document.getElementById('ntLimiteHora').value;
    const supervisor = document.getElementById('ntSupervisor').value.trim();
    const marca = document.getElementById('ntMarca').value;
    const errEl = document.getElementById('ntError');
    errEl.style.display = 'none';

    if (!nombre || !agenciaId) {
      errEl.textContent = 'Rellena al menos el nombre y la agencia.';
      errEl.style.display = 'block';
      return;
    }

    const maxOrden = Math.max(0, ...tiendasCache.filter(t => t.agencia_id === agenciaId).map(t => t.orden));

    const btn = document.getElementById('btnGuardarTienda');
    btn.disabled = true;
    try {
      const { error } = await sb.from('tiendas').insert({
        numero_tienda: numeroTienda || null,
        nombre,
        agencia_id: agenciaId,
        hora_prevista: hora || null,
        direccion: direccion || null,
        provincia: provincia || null,
        limite_palets: limitePaletsRaw !== '' ? Number(limitePaletsRaw) : null,
        limite_hora_entrega: limiteHora || null,
        supervisor: supervisor || null,
        marca,
        orden: maxOrden + 1
      });
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Crear tienda', nombre);
      cerrarModalNuevaTienda();
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error creando tienda:', err);
      errEl.textContent = 'No se pudo crear la tienda.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById('btnNuevaTienda').addEventListener('click', abrirModalNuevaTienda);
  document.getElementById('btnCerrarNuevaTienda')?.addEventListener('click', cerrarModalNuevaTienda);
  document.getElementById('btnCancelarTienda').addEventListener('click', cerrarModalNuevaTienda);
  document.getElementById('btnGuardarTienda').addEventListener('click', guardarNuevaTienda);
  // Nota (2026-09-17): a petición de Jose, este modal ya NO se cierra al
  // clicar fuera — solo con ✕/Cancelar/Crear, para no perder cambios por
  // un clic accidental.

  // ---------------------------------------------------------------
  // Exportar listado de tiendas a Excel (mismo estilo ExcelJS que el
  // exportador de informes en js/informe-pdf.js). Dos modos:
  //  - "resumido": una hoja con bandas por agencia (nombre + total) y
  //    columnas básicas, como la pestaña GENERAL del Excel de Primor.
  //  - "detallado": una fila por tienda con todos los datos, como la
  //    pestaña DIRECCIONES del Excel de Primor.
  // ---------------------------------------------------------------
  function tiendasExcelDisponible() {
    return typeof window.ExcelJS !== 'undefined' && typeof window.ExcelJS.Workbook === 'function';
  }

  function tiendasAgrupadasPorAgencia() {
    const porAgencia = new Map();
    tiendasCache.forEach(t => {
      if (!porAgencia.has(t.agencia_id)) porAgencia.set(t.agencia_id, []);
      porAgencia.get(t.agencia_id).push(t);
    });
    return agenciasCache
      .map(a => ({ agencia: a, tiendas: (porAgencia.get(a.id) || []).slice().sort((x, y) => x.orden - y.orden) }))
      .filter(g => g.tiendas.length);
  }

  function tiendasExcelCelda(fila, colIdx, valor, opts = {}) {
    const c = fila.getCell(colIdx);
    c.value = valor;
    c.font = { bold: !!opts.bold, color: { argb: opts.color || 'FF000000' }, size: opts.size || 10.5 };
    c.alignment = { horizontal: opts.halign || 'left', vertical: 'middle', wrapText: opts.wrap !== false };
    c.border = { top: { style: 'thin', color: { argb: 'FFDDDDDD' } }, left: { style: 'thin', color: { argb: 'FFDDDDDD' } }, bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }, right: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
    if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    return c;
  }

  async function exportarTiendasResumido() {
    const workbook = new window.ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Tiendas (resumido)', { views: [{ showGridLines: false }] });
    const COLS = ['Nº', 'TIENDA', 'PROVINCIA', 'HORA', 'LÍMITE HORA', 'LÍM. PALETS', 'SUPERVISOR/A'];
    hoja.columns = [{ width: 8 }, { width: 24 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 16 }];

    tiendasAgrupadasPorAgencia().forEach(g => {
      const filaAgencia = hoja.addRow([]);
      hoja.mergeCells(filaAgencia.number, 1, filaAgencia.number, COLS.length);
      tiendasExcelCelda(filaAgencia, 1, `${g.agencia.nombre.toUpperCase()} (${g.tiendas.length})`, { bold: true, halign: 'center', color: 'FFFFFFFF', fill: 'FF000000' });

      const filaCab = hoja.addRow(COLS);
      COLS.forEach((_, i) => tiendasExcelCelda(filaCab, i + 1, COLS[i], { bold: true, halign: 'center', fill: 'FFD9D9D9' }));

      g.tiendas.forEach(t => {
        const fila = hoja.addRow([]);
        tiendasExcelCelda(fila, 1, t.numero_tienda || '', { halign: 'center' });
        tiendasExcelCelda(fila, 2, t.nombre || '', { bold: true });
        tiendasExcelCelda(fila, 3, t.provincia || '', { halign: 'center' });
        tiendasExcelCelda(fila, 4, t.hora_prevista ? t.hora_prevista.slice(0, 5) : '', { halign: 'center' });
        tiendasExcelCelda(fila, 5, t.limite_hora_entrega ? t.limite_hora_entrega.slice(0, 5) : '', { halign: 'center' });
        tiendasExcelCelda(fila, 6, t.limite_palets != null ? t.limite_palets : '', { halign: 'center' });
        tiendasExcelCelda(fila, 7, t.supervisor || '', { halign: 'center' });
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    descargarBlob(blob, `tiendas-resumido-${fechaHoyISO || new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportarTiendasDetallado() {
    const workbook = new window.ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Tiendas (detallado)', { views: [{ showGridLines: false }] });
    const COLS = ['AGENCIA', 'Nº', 'TIENDA', 'DIRECCIÓN COMPLETA', 'PROVINCIA', 'HORA', 'LÍMITE HORA', 'LÍM. PALETS', 'SUPERVISOR/A', 'MARCA'];
    hoja.columns = [{ width: 14 }, { width: 8 }, { width: 24 }, { width: 42 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 12 }];

    const filaCab = hoja.addRow(COLS);
    COLS.forEach((_, i) => tiendasExcelCelda(filaCab, i + 1, COLS[i], { bold: true, halign: 'center', color: 'FFFFFFFF', fill: 'FF000000' }));

    tiendasAgrupadasPorAgencia().forEach(g => {
      g.tiendas.forEach(t => {
        const fila = hoja.addRow([]);
        tiendasExcelCelda(fila, 1, g.agencia.nombre);
        tiendasExcelCelda(fila, 2, t.numero_tienda || '', { halign: 'center' });
        tiendasExcelCelda(fila, 3, t.nombre || '', { bold: true });
        tiendasExcelCelda(fila, 4, t.direccion || '');
        tiendasExcelCelda(fila, 5, t.provincia || '', { halign: 'center' });
        tiendasExcelCelda(fila, 6, t.hora_prevista ? t.hora_prevista.slice(0, 5) : '', { halign: 'center' });
        tiendasExcelCelda(fila, 7, t.limite_hora_entrega ? t.limite_hora_entrega.slice(0, 5) : '', { halign: 'center' });
        tiendasExcelCelda(fila, 8, t.limite_palets != null ? t.limite_palets : '', { halign: 'center' });
        tiendasExcelCelda(fila, 9, t.supervisor || '', { halign: 'center' });
        tiendasExcelCelda(fila, 10, MARCA_LABEL[t.marca] || t.marca || '', { halign: 'center' });
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    descargarBlob(blob, `tiendas-detallado-${fechaHoyISO || new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const exportTiendasWrap = document.getElementById('exportTiendasWrap');
  document.getElementById('btnExportarTiendas')?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportTiendasWrap?.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (exportTiendasWrap && !exportTiendasWrap.contains(e.target)) exportTiendasWrap.classList.remove('open');
  });
  document.getElementById('exportTiendasMenu')?.querySelectorAll('button[data-modo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      exportTiendasWrap?.classList.remove('open');
      if (!tiendasExcelDisponible()) {
        await modalAlert('No se pudo cargar el generador de Excel. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'Excel no disponible' });
        return;
      }
      if (btn.dataset.modo === 'resumido') exportarTiendasResumido();
      else exportarTiendasDetallado();
    });
  });

  let tiendasCargadasYa = false;
  document.querySelectorAll('[data-view="config-tiendas"]').forEach(el => {
    el.addEventListener('click', () => {
      if (!tiendasCargadasYa) { tiendasCargadasYa = true; cargarAgenciasYTiendas(); }
    });
  });

  const buscadorTiendas = document.getElementById('buscadorTiendas');
  if (buscadorTiendas) {
    buscadorTiendas.addEventListener('input', () => {
      filtroTiendasTexto = buscadorTiendas.value;
      renderAcordeonTiendas();
    });
  }

  // ---------------------------------------------------------------
  // Modal "Horario semanal": permite poner, por tienda, una hora
  // distinta para días concretos de la semana (p. ej. Martes y
  // Viernes). Se guarda en tiendas.horario_semana y a partir de ahí
  // lo usa tiendaEfectivaHoy() (utilidades-informe.js) para que el
  // informe de cada día salga con la hora correcta automáticamente.
  // ---------------------------------------------------------------
  let horarioSemanaTiendaId = null;

  function abrirModalHorarioSemana(tiendaId) {
    const t = tiendasCache.find(x => x.id === tiendaId);
    const overlay = document.getElementById('modalHorarioOverlay');
    if (!t || !overlay) return;
    horarioSemanaTiendaId = tiendaId;

    document.getElementById('modalHorarioTitulo').textContent = `Horario semanal — ${t.nombre}`;
    const mapa = t.horario_semana || {};
    const cont = document.getElementById('modalHorarioDias');
    cont.innerHTML = DIAS_SEMANA_ISO.map(d => `
      <div style="display:flex; align-items:center; gap:10px;">
        <label style="width:90px; margin:0; font-size:13px;">${d.label}</label>
        <input type="time" class="form-input mh-hora" data-dia="${d.iso}" style="flex:1;" value="${mapa[String(d.iso)] ? mapa[String(d.iso)].slice(0, 5) : ''}">
      </div>`).join('');

    document.getElementById('modalHorarioNota').textContent =
      `Hora general de la tienda: ${t.hora_prevista ? t.hora_prevista.slice(0, 5) : '—'}. Deja en blanco los días que usen esa hora general.`;

    overlay.classList.add('show');
  }

  function cerrarModalHorarioSemana() {
    document.getElementById('modalHorarioOverlay')?.classList.remove('show');
    horarioSemanaTiendaId = null;
  }

  async function guardarModalHorarioSemana() {
    if (horarioSemanaTiendaId == null) return;
    const t = tiendasCache.find(x => x.id === horarioSemanaTiendaId);
    const mapa = {};
    document.querySelectorAll('#modalHorarioDias .mh-hora').forEach(input => {
      if (input.value) mapa[input.dataset.dia] = input.value;
    });
    try {
      const { error } = await sb.from('tiendas')
        .update({ horario_semana: Object.keys(mapa).length ? mapa : null })
        .eq('id', horarioSemanaTiendaId);
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Configurar horario semanal', t?.nombre || '');
      cerrarModalHorarioSemana();
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error guardando el horario semanal:', err);
      await modalAlert('No se pudo guardar el horario semanal.', { titulo: 'Error' });
    }
  }

  document.getElementById('modalHorarioBtnCancelar')?.addEventListener('click', cerrarModalHorarioSemana);
  document.getElementById('modalHorarioBtnGuardar')?.addEventListener('click', guardarModalHorarioSemana);
  document.getElementById('modalHorarioBtnLimpiar')?.addEventListener('click', () => {
    document.querySelectorAll('#modalHorarioDias .mh-hora').forEach(input => { input.value = ''; });
  });
  // Nota (2026-09-17): a petición de Jose, este modal ya NO se cierra al
  // clicar fuera — solo con Cancelar/Guardar, para no perder cambios por
  // un clic accidental.

  // ---------------------------------------------------------------
