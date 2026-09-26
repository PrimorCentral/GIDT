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
  // Bajas de tiendas (tabla tienda_bajas)
  //
  // Una tienda puede darse de BAJA de forma temporal (p. ej. tiene un
  // problema y no recibe mercancía durante un tiempo) y volver a darse de
  // alta después. Cada fila de tienda_bajas es un periodo:
  //   - tipo 'BAJA'      → temporal. fecha_desde = primer día SIN mercancía;
  //                        fecha_reactivacion = primer día que vuelve a
  //                        recibir (null mientras siga de baja).
  //   - tipo 'ELIMINADA' → la tienda se eliminó (activo = false) en
  //                        fecha_desde. El Reporte mensual la deja en gris
  //                        ese mes y no la dibuja en los meses siguientes.
  //
  // Mientras una tienda está de baja: no sale en el Informe del día (ni en
  // su PDF/correo) y en el Reporte mensual esos días salen como BAJA, sin
  // OK. Todo lo anterior y posterior a la baja queda exactamente igual.
  // ---------------------------------------------------------------
  let bajasCache = []; // filas de tienda_bajas

  async function cargarBajasTiendas() {
    try {
      const { data, error } = await sb.from('tienda_bajas')
        .select('id, tienda_id, tipo, fecha_desde, fecha_reactivacion, motivo, creado_por')
        .order('fecha_desde');
      if (error) throw error;
      bajasCache = data || [];
    } catch (err) {
      // Si la tabla aún no existe (o falla la red) la app sigue funcionando
      // como antes, simplemente sin bajas.
      console.error('No se pudieron cargar las bajas de tiendas:', err);
      bajasCache = [];
    }
  }

  // ¿Está la tienda de baja en esa fecha (AAAA-MM-DD)?
  function tiendaEnBajaEnFecha(tiendaId, fechaISO) {
    return bajasCache.some(b => b.tienda_id === tiendaId
      && b.fecha_desde <= fechaISO
      && (!b.fecha_reactivacion || fechaISO < b.fecha_reactivacion));
  }

  function tiendaEnBajaHoy(tiendaId) {
    return tiendaEnBajaEnFecha(tiendaId, fechaLocalISO(new Date()));
  }

  // Periodo de baja TEMPORAL "vigente" de una tienda: el que sigue abierto
  // (sin fecha de alta) o, si ya tiene fecha de alta pero todavía no ha
  // llegado, el que cubre hoy. null si no tiene ninguno.
  function periodoBajaActualDeTienda(tiendaId) {
    const hoyISO = fechaLocalISO(new Date());
    const propios = bajasCache.filter(b => b.tienda_id === tiendaId && b.tipo === 'BAJA');
    return propios.find(b => !b.fecha_reactivacion)
      || propios.find(b => b.fecha_desde <= hoyISO && hoyISO < b.fecha_reactivacion)
      || null;
  }

  function fechaISOaCorta(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function sumarDiasISO(iso, dias) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return fechaLocalISO(d);
  }

  function badgeBajaHtml(periodo) {
    if (!periodo) return '';
    const hoyISO = fechaLocalISO(new Date());
    let texto;
    if (periodo.fecha_desde > hoyISO) texto = `BAJA programada desde ${fechaISOaCorta(periodo.fecha_desde)}`;
    else if (periodo.fecha_reactivacion) texto = `BAJA · vuelve el ${fechaISOaCorta(periodo.fecha_reactivacion)}`;
    else texto = `BAJA desde ${fechaISOaCorta(periodo.fecha_desde)}`;
    const titulo = periodo.motivo ? `Motivo: ${periodo.motivo}` : 'Sin recepción de mercancía';
    return ` <span class="pill baja" title="${escapeHtml(titulo)}">${escapeHtml(texto)}</span>`;
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

  // Día de recogida semanal (tiendas.recogida_semanal_dia, 1=lunes…7=domingo)
  function nombreDiaRecogida(iso) {
    const d = DIAS_SEMANA_ISO.find(x => x.iso === Number(iso));
    return d ? d.label : '';
  }

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
      || normalizarTextoBusqueda(t.supervisor).includes(qNormalizada)
      || normalizarTextoBusqueda(t.agencia_recogida).includes(qNormalizada)
      || normalizarTextoBusqueda(nombreDiaRecogida(t.recogida_semanal_dia)).includes(qNormalizada);
  }

  async function cargarAgenciasYTiendas() {
    const [{ data: ags, error: e1 }, { data: tds, error: e2 }] = await Promise.all([
      sb.from('agencias').select('id, nombre, orden').order('orden'),
      sb.from('tiendas').select('id, nombre, agencia_id, hora_prevista, horario_semana, marca, provincia, orden, activo, numero_tienda, direccion, limite_palets, limite_hora_entrega, supervisor, recogida_semanal_dia, agencia_recogida, transito_horas, creado_en').order('orden'),
      cargarBajasTiendas()
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
    const activas = tiendasCache.filter(t => t.activo && !tiendaEnBajaHoy(t.id));
    const numBajas = tiendasCache.filter(t => t.activo && tiendaEnBajaHoy(t.id)).length;
    const totales = { HABITUAL: 0, SABADO: 0, PRUEBA: 0, ESPECIAL: 0 };
    activas.forEach(t => { if (totales[t.marca] != null) totales[t.marca]++; });
    cont.innerHTML = `
      <span class="tiendas-contador"><b>${totales.HABITUAL}</b><span>Tiendas</span></span>
      <span class="tiendas-contador sabado"><b>${totales.SABADO}</b><span>Sábados</span></span>
      <span class="tiendas-contador prueba"><b>${totales.PRUEBA}</b><span>Pruebas</span></span>
      <span class="tiendas-contador especial"><b>${totales.ESPECIAL}</b><span>Especiales</span></span>
      ${numBajas ? `<span class="tiendas-contador baja" title="Tiendas de baja ahora mismo (sin recibir mercancía)"><b>${numBajas}</b><span>De baja</span></span>` : ''}
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
      const numDeBaja = tds.filter(t => tiendaEnBajaHoy(t.id)).length;
      const filas = tds.length
        ? tds.map(t => {
          const pBaja = periodoBajaActualDeTienda(t.id);
          const enBajaHoy = tiendaEnBajaHoy(t.id);
          return `
            <tr data-tienda="${t.id}" class="${enBajaHoy ? 'fila-en-baja' : ''}">
              <td class="celda-numero">${t.numero_tienda ? escapeHtml(t.numero_tienda) : '—'}</td>
              <td class="celda-nombre">${escapeHtml(t.nombre)}</td>
              <td class="hora celda-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}${badgeHorarioSemanaHtml(t)}</td>
              <td class="celda-direccion">${t.direccion ? escapeHtml(t.direccion) : '—'}</td>
              <td class="celda-provincia">${t.provincia ? escapeHtml(t.provincia) : '—'}</td>
              <td class="celda-limite-palets">${t.limite_palets != null ? t.limite_palets : '—'}</td>
              <td class="celda-limite-hora">${t.limite_hora_entrega ? t.limite_hora_entrega.slice(0,5) : '—'}</td>
              <td class="celda-supervisor">${t.supervisor ? escapeHtml(t.supervisor) : '—'}</td>
              <td class="celda-recogida-dia">${t.recogida_semanal_dia ? nombreDiaRecogida(t.recogida_semanal_dia) : '—'}</td>
              <td class="celda-agencia-recogida">${t.agencia_recogida ? escapeHtml(t.agencia_recogida) : '—'}</td>
              <td class="celda-transito">${t.transito_horas != null ? t.transito_horas + ' h' : '—'}</td>
              <td class="celda-marca"><span class="pill ${MARCA_CLASE[t.marca] || 'leve'}">${MARCA_LABEL[t.marca] || t.marca}</span>${badgeBajaHtml(pBaja)}</td>
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
                ${pBaja
                  ? `<button class="mini-btn" data-alta title="Dar de alta (vuelve a recibir mercancía)">▶️</button>`
                  : `<button class="mini-btn" data-baja title="Dar de baja (deja de recibir mercancía por un tiempo)">⏸️</button>`}
                <button class="mini-btn" data-borrar title="Eliminar">🗑️</button>
              </td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="13" style="text-align:center; padding:16px; color:var(--ink-soft);">Sin tiendas en esta agencia.</td></tr>`;

      return `
        <div class="agencia-block">
          <div class="agencia-head ${abierta ? 'open' : ''}" data-agencia="${ag.id}">
            <span class="caret">▶</span>
            <b>${escapeHtml(ag.nombre)}</b>
            <span class="count">${tds.length - numDeBaja} tienda${(tds.length - numDeBaja) === 1 ? '' : 's'}${numDeBaja ? ` · ${numDeBaja} de baja` : ''}</span>
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
                    <th class="th-recogida-dia">Recogida semanal</th>
                    <th class="th-agencia-recogida">Agencia recogida</th>
                    <th class="th-transito">Tránsito</th>
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
    cont.querySelectorAll('[data-baja]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        abrirModalBajaTienda(Number(tr.dataset.tienda), 'baja');
      });
    });
    cont.querySelectorAll('[data-alta]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        abrirModalBajaTienda(Number(tr.dataset.tienda), 'alta');
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
    document.getElementById('metRecogidaDia').value = t.recogida_semanal_dia ? String(t.recogida_semanal_dia) : '';
    document.getElementById('metAgenciaRecogida').value = t.agencia_recogida || '';
    document.getElementById('metTransito').value = t.transito_horas != null ? t.transito_horas : '';
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
    const numeroTienda = document.getElementById('metNumero').value.trim().toUpperCase();
    const nombre = document.getElementById('metNombre').value.trim().toUpperCase();
    const hora = document.getElementById('metHora').value;
    const direccion = document.getElementById('metDireccion').value.trim().toUpperCase();
    const provincia = document.getElementById('metProvincia').value.trim().toUpperCase();
    const limitePaletsRaw = document.getElementById('metLimitePalets').value;
    const limiteHora = document.getElementById('metLimiteHora').value;
    const supervisor = document.getElementById('metSupervisor').value.trim().toUpperCase();
    const recogidaDia = document.getElementById('metRecogidaDia').value;
    const agenciaRecogida = document.getElementById('metAgenciaRecogida').value.trim().toUpperCase();
    const transitoRaw = document.getElementById('metTransito').value;
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
        recogida_semanal_dia: recogidaDia ? Number(recogidaDia) : null,
        agencia_recogida: agenciaRecogida || null,
        transito_horas: transitoRaw !== '' ? Number(transitoRaw) : null,
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
      `¿Eliminar "${t.nombre}"?\n\nSe conserva todo su histórico (incidencias, análisis e informes anteriores). Desde hoy dejará de salir en el Informe del día y en el Reporte mensual no llevará más OK: ese mes quedará en gris hasta fin de mes y desaparecerá en los meses siguientes.\n\nSi solo es una parada temporal, usa mejor "Dar de baja" (⏸️), que se puede revertir.`,
      { titulo: 'Eliminar tienda', danger: true, textoOk: 'Eliminar' }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('tiendas').update({ activo: false }).eq('id', id);
      if (error) throw error;

      // Deja constancia de la fecha de eliminación (la usa el Reporte
      // mensual). Si ya tenía una baja abierta, esa baja pasa a ser la
      // eliminación (conserva su fecha de inicio); si no, empieza hoy.
      try {
        const abierta = bajasCache.find(b => b.tienda_id === id && b.tipo === 'BAJA' && !b.fecha_reactivacion);
        if (abierta) {
          const { error: eB } = await sb.from('tienda_bajas').update({ tipo: 'ELIMINADA' }).eq('id', abierta.id);
          if (eB) throw eB;
        } else {
          const { error: eB } = await sb.from('tienda_bajas').insert({
            tienda_id: id,
            tipo: 'ELIMINADA',
            fecha_desde: fechaLocalISO(new Date()),
            creado_por: sesionActual?.nombre || sesionActual?.usuario || null
          });
          if (eB) throw eB;
        }
      } catch (eBaja) {
        console.error('No se pudo registrar la fecha de eliminación de la tienda:', eBaja);
      }

      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Eliminar tienda', t.nombre);
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error eliminando tienda:', err);
      await modalAlert('No se pudo eliminar la tienda.', { titulo: 'Error' });
    }
  }

  // ---------------------------------------------------------------
  // Modal "Dar de baja" / "Dar de alta" (mismo modal, dos modos).
  //  - baja: elige desde qué día NO recibe mercancía (puede ser anterior a
  //          hoy) y, opcionalmente, un motivo.
  //  - alta: elige desde qué día VUELVE a recibir (puede ser futuro). Si
  //          la baja fue un error, "Anular baja" la borra como si nunca
  //          hubiera existido.
  // ---------------------------------------------------------------
  let bajaTiendaId = null;
  let bajaModo = null;        // 'baja' | 'alta'
  let bajaPeriodoId = null;   // periodo que se está dando de alta

  function abrirModalBajaTienda(tiendaId, modo) {
    const t = tiendasCache.find(x => x.id === tiendaId);
    const overlay = document.getElementById('modalBajaTiendaOverlay');
    if (!t || !overlay) return;
    bajaTiendaId = tiendaId;
    bajaModo = modo;
    bajaPeriodoId = null;

    const hoyISO = fechaLocalISO(new Date());
    const titulo = document.getElementById('mbtTitulo');
    const mensaje = document.getElementById('mbtMensaje');
    const fechaLabel = document.getElementById('mbtFechaLabel');
    const fechaInput = document.getElementById('mbtFecha');
    const motivoWrap = document.getElementById('mbtMotivoWrap');
    const nota = document.getElementById('mbtNota');
    const btnGuardar = document.getElementById('mbtBtnGuardar');
    const btnAnular = document.getElementById('mbtBtnAnular');
    document.getElementById('mbtMotivo').value = '';
    const errEl = document.getElementById('mbtError');
    errEl.style.display = 'none';
    errEl.textContent = '';

    if (modo === 'baja') {
      titulo.textContent = 'Dar de baja tienda';
      mensaje.textContent = `"${t.nombre}" dejará de salir en el Informe del día y en el Reporte mensual aparecerá como BAJA (sin OK) hasta que la des de alta.`;
      fechaLabel.textContent = 'Sin recibir mercancía desde el día (inclusive)';
      fechaInput.value = hoyISO;
      motivoWrap.style.display = '';
      nota.textContent = 'Si eliges una fecha anterior a hoy, esos días pasarán de OK a BAJA en el Reporte mensual (también en meses ya enviados a las agencias).';
      btnGuardar.textContent = 'Dar de baja';
      btnAnular.style.display = 'none';
    } else {
      const p = periodoBajaActualDeTienda(tiendaId);
      if (!p) return;
      bajaPeriodoId = p.id;
      titulo.textContent = p.fecha_reactivacion ? 'Cambiar fecha de alta' : 'Dar de alta tienda';
      mensaje.textContent = `"${t.nombre}" está de baja desde el ${fechaISOaCorta(p.fecha_desde)}${p.motivo ? ` (${p.motivo})` : ''}. Volverá a salir en el Informe del día y a llevar OK en el Reporte mensual desde el día que indiques.`;
      fechaLabel.textContent = 'Vuelve a recibir mercancía desde el día (inclusive)';
      const minimo = sumarDiasISO(p.fecha_desde, 1);
      fechaInput.value = p.fecha_reactivacion || (hoyISO >= minimo ? hoyISO : minimo);
      motivoWrap.style.display = 'none';
      nota.textContent = 'Los días de baja seguirán marcados como BAJA en el Reporte mensual. Si la baja fue un error, usa "Anular baja" para borrarla como si nunca hubiera existido.';
      btnGuardar.textContent = 'Dar de alta';
      btnAnular.style.display = '';
    }

    overlay.classList.add('show');
    setTimeout(() => fechaInput.focus(), 30);
  }

  function cerrarModalBajaTienda() {
    document.getElementById('modalBajaTiendaOverlay')?.classList.remove('show');
    bajaTiendaId = null;
    bajaModo = null;
    bajaPeriodoId = null;
  }

  async function guardarModalBajaTienda() {
    if (bajaTiendaId == null) return;
    const t = tiendasCache.find(x => x.id === bajaTiendaId);
    const fecha = document.getElementById('mbtFecha').value;
    const motivo = document.getElementById('mbtMotivo').value.trim();
    const errEl = document.getElementById('mbtError');
    const btn = document.getElementById('mbtBtnGuardar');
    errEl.style.display = 'none';

    const fallo = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
    if (!fecha) { fallo('Elige una fecha.'); return; }

    btn.disabled = true;
    try {
      if (bajaModo === 'baja') {
        // No puede solaparse con una baja anterior de la misma tienda.
        const finPrevio = bajasCache
          .filter(b => b.tienda_id === bajaTiendaId && b.tipo === 'BAJA' && b.fecha_reactivacion)
          .reduce((max, b) => (b.fecha_reactivacion > max ? b.fecha_reactivacion : max), '');
        if (finPrevio && fecha < finPrevio) {
          fallo(`Esta tienda ya estuvo de baja hasta el ${fechaISOaCorta(finPrevio)}. Elige una fecha desde ese día.`);
          return;
        }
        const { error } = await sb.from('tienda_bajas').insert({
          tienda_id: bajaTiendaId,
          tipo: 'BAJA',
          fecha_desde: fecha,
          motivo: motivo || null,
          creado_por: sesionActual?.nombre || sesionActual?.usuario || null
        });
        if (error) throw error;
        if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Dar de baja tienda', `${t?.nombre || ''} desde ${fechaISOaCorta(fecha)}${motivo ? ' · ' + motivo : ''}`);
      } else {
        const p = bajasCache.find(b => b.id === bajaPeriodoId);
        if (!p) throw new Error('Baja no encontrada');
        if (fecha <= p.fecha_desde) {
          fallo(`La fecha de alta debe ser posterior a la de baja (${fechaISOaCorta(p.fecha_desde)}).`);
          return;
        }
        const { error } = await sb.from('tienda_bajas').update({
          fecha_reactivacion: fecha,
          reactivada_por: sesionActual?.nombre || sesionActual?.usuario || null
        }).eq('id', p.id);
        if (error) throw error;
        if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Dar de alta tienda', `${t?.nombre || ''} desde ${fechaISOaCorta(fecha)}`);
      }
      cerrarModalBajaTienda();
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error guardando la baja/alta de la tienda:', err);
      fallo('No se pudo guardar el cambio.');
    } finally {
      btn.disabled = false;
    }
  }

  async function anularBajaTienda() {
    if (bajaTiendaId == null || bajaPeriodoId == null) return;
    const t = tiendasCache.find(x => x.id === bajaTiendaId);
    const p = bajasCache.find(b => b.id === bajaPeriodoId);
    if (!p) return;
    const ok = await modalConfirm(
      `¿Anular la baja de "${t?.nombre || ''}"? Se borra como si nunca hubiera existido: los días desde el ${fechaISOaCorta(p.fecha_desde)} volverán a llevar OK en el Reporte mensual.`,
      { titulo: 'Anular baja', danger: true, textoOk: 'Anular baja' }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('tienda_bajas').delete().eq('id', p.id);
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Anular baja de tienda', `${t?.nombre || ''} (desde ${fechaISOaCorta(p.fecha_desde)})`);
      cerrarModalBajaTienda();
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error anulando la baja:', err);
      await modalAlert('No se pudo anular la baja.', { titulo: 'Error' });
    }
  }

  document.getElementById('mbtBtnCancelar')?.addEventListener('click', cerrarModalBajaTienda);
  document.getElementById('mbtBtnGuardar')?.addEventListener('click', guardarModalBajaTienda);
  document.getElementById('mbtBtnAnular')?.addEventListener('click', anularBajaTienda);
  // Como el resto de modales de esta pantalla, NO se cierra al clicar fuera:
  // solo con Cancelar/Guardar, para no perder cambios por un clic accidental.

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
    document.getElementById('ntRecogidaDia').value = '';
    document.getElementById('ntAgenciaRecogida').value = '';
    document.getElementById('ntTransito').value = '';
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
    const numeroTienda = document.getElementById('ntNumero').value.trim().toUpperCase();
    const nombre = document.getElementById('ntNombre').value.trim().toUpperCase();
    const agenciaId = Number(document.getElementById('ntAgencia').value);
    const hora = document.getElementById('ntHora').value;
    const direccion = document.getElementById('ntDireccion').value.trim().toUpperCase();
    const provincia = document.getElementById('ntProvincia').value.trim().toUpperCase();
    const limitePaletsRaw = document.getElementById('ntLimitePalets').value;
    const limiteHora = document.getElementById('ntLimiteHora').value;
    const supervisor = document.getElementById('ntSupervisor').value.trim().toUpperCase();
    const recogidaDia = document.getElementById('ntRecogidaDia').value;
    const agenciaRecogida = document.getElementById('ntAgenciaRecogida').value.trim().toUpperCase();
    const transitoRaw = document.getElementById('ntTransito').value;
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
        recogida_semanal_dia: recogidaDia ? Number(recogidaDia) : null,
        agencia_recogida: agenciaRecogida || null,
        transito_horas: transitoRaw !== '' ? Number(transitoRaw) : null,
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

  // Modales Nueva/Editar tienda: todos los campos de texto van SIEMPRE en
  // mayúsculas. Se convierte mientras se escribe (conservando la posición
  // del cursor) y, por si acaso, también al guardar (ver .toUpperCase()).
  document.querySelectorAll('#nuevaTiendaModalOverlay input[type="text"], #modalEditarTiendaOverlay input[type="text"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const may = inp.value.toUpperCase();
      if (inp.value === may) return;
      const ini = inp.selectionStart, fin = inp.selectionEnd;
      inp.value = may;
      try { inp.setSelectionRange(ini, fin); } catch (_) {}
    });
  });

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
      if (!t.activo) return; // las eliminadas no se exportan
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

  // ---------------------------------------------------------------
  // Excel resumido: TODAS las tiendas en una sola hoja, al estilo de la
  // hoja "TIENDAS PRIMOR" — un bloque por agencia (nombre + nº tiendas)
  // repartido en 5 columnas de bloques una al lado de otra, y ajustado
  // para imprimirse en una única página A4 apaisada.
  // Columnas: Nº · TIENDA · PROVINCIA · HORA · LÍMITE · R.S · L.P · TR · SUPER
  // (R.S = día de recogida semanal en una letra, L.P = límite palets,
  //  TR = tránsito en horas).
  // ---------------------------------------------------------------
  const LETRA_DIA_RECOGIDA = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };

  async function exportarTiendasResumido() {
    const workbook = new window.ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Tiendas (resumido)', {
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
        horizontalCentered: true,
        margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 }
      }
    });

    const COLS = [
      { t: 'Nº', w: 4.5, al: 'center' },
      { t: 'TIENDA', w: 17, al: 'left' },
      { t: 'PROVINCIA', w: 12, al: 'left' },
      { t: 'HORA', w: 5.5, al: 'center' },
      { t: 'LÍMITE', w: 6, al: 'center' },
      { t: 'R.S', w: 3.6, al: 'center' },
      { t: 'L.P', w: 3.6, al: 'center' },
      { t: 'TR', w: 3.6, al: 'center' },
      { t: 'SUPER', w: 10, al: 'left' }
    ];
    const NUM_BLOQUES = 5;             // columnas de bloques en la hoja
    const ANCHO_BLOQUE = COLS.length + 1; // + 1 columna estrecha de separación
    const FUENTE = 8;

    const valores = (t) => [
      t.numero_tienda || '',
      t.nombre || '',
      t.provincia || '',
      t.hora_prevista ? t.hora_prevista.slice(0, 5) : '',
      t.limite_hora_entrega ? t.limite_hora_entrega.slice(0, 5) : '-',
      LETRA_DIA_RECOGIDA[t.recogida_semanal_dia] || '-',
      t.limite_palets != null ? t.limite_palets : '-',
      t.transito_horas != null ? t.transito_horas : '-',
      t.supervisor || ''
    ];

    // Solo tiendas con marca HABITUAL (sin Sábado, Prueba ni Especial);
    // las agencias que se quedan sin ninguna no salen.
    const grupos = tiendasAgrupadasPorAgencia()
      .map(g => ({ ...g, tiendas: g.tiendas.filter(t => t.marca === 'HABITUAL') }))
      .filter(g => g.tiendas.length);
    const total = grupos.reduce((n, g) => n + g.tiendas.length, 0);

    // Secuencia de filas: cabecera agencia, cabecera columnas, tiendas.
    const filas = [];
    grupos.forEach(g => {
      filas.push({ tipo: 'agencia', g });
      filas.push({ tipo: 'cab' });
      g.tiendas.forEach(t => filas.push({ tipo: 'tienda', v: valores(t) }));
    });

    // Reparte las filas en columnas de bloques de alto máximo maxFilas.
    // No deja una agencia huérfana al pie de una columna y, si un bloque
    // sigue en la columna siguiente, repite las cabeceras con "(cont.)".
    function repartir(maxFilas) {
      const columnas = [[]];
      let actual = columnas[0];
      let grupoActual = null;
      filas.forEach(f => {
        if (f.tipo === 'agencia') grupoActual = f.g;
        const necesita = f.tipo === 'agencia' ? 4 : 1;
        if (actual.length + necesita > maxFilas) {
          actual = [];
          columnas.push(actual);
          if (f.tipo === 'tienda') {
            actual.push({ tipo: 'agencia', g: grupoActual, cont: true });
            actual.push({ tipo: 'cab' });
          }
        }
        actual.push(f);
      });
      return columnas;
    }
    let maxFilas = Math.max(6, Math.ceil(filas.length / NUM_BLOQUES));
    let columnas = repartir(maxFilas);
    while (columnas.length > NUM_BLOQUES) { maxFilas++; columnas = repartir(maxFilas); }

    // Anchos de columna (se repiten por cada bloque)
    const anchos = [];
    for (let b = 0; b < NUM_BLOQUES; b++) {
      COLS.forEach(c => anchos.push({ width: c.w }));
      if (b < NUM_BLOQUES - 1) anchos.push({ width: 1.2 });
    }
    hoja.columns = anchos;
    const ultimaCol = NUM_BLOQUES * ANCHO_BLOQUE - 1;

    const borde = { style: 'thin', color: { argb: 'FF999999' } };
    const celda = (fila, col, valor, opts = {}) => {
      const c = hoja.getRow(fila).getCell(col);
      c.value = valor;
      c.font = { bold: !!opts.bold, italic: !!opts.italic, size: opts.size || FUENTE, color: { argb: opts.color || 'FF000000' } };
      c.alignment = { horizontal: opts.al || 'left', vertical: 'middle', shrinkToFit: true };
      if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
      if (opts.borde !== false) c.border = { top: borde, left: borde, bottom: borde, right: borde };
      return c;
    };

    // Título (fila 1) y subtítulo (fila 2)
    hoja.mergeCells(1, 1, 1, ultimaCol - 3);
    celda(1, 1, `TIENDAS PRIMOR ${new Date().getFullYear()}`, { bold: true, size: 14, al: 'center', borde: false });
    hoja.mergeCells(1, ultimaCol - 2, 1, ultimaCol);
    celda(1, ultimaCol - 2, `TOTAL: ${total}`, { bold: true, size: 12, al: 'right', borde: false });
    hoja.getRow(1).height = 20;
    hoja.mergeCells(2, 1, 2, ultimaCol);
    celda(2, 1, 'TODAS LAS TIENDAS EN HORARIO LOCAL', { size: 6, al: 'center', borde: false, color: 'FF555555' });

    const FILA_INICIO = 4;
    columnas.forEach((col, bi) => {
      const c0 = bi * ANCHO_BLOQUE + 1;
      col.forEach((f, ri) => {
        const r = FILA_INICIO + ri;
        if (f.tipo === 'agencia') {
          hoja.mergeCells(r, c0, r, c0 + COLS.length - 2);
          celda(r, c0, f.g.agencia.nombre.toUpperCase() + (f.cont ? ' (cont.)' : ''), { bold: true, italic: true, size: FUENTE + 2, al: 'center', color: 'FFFFFFFF', fill: 'FF595959' });
          celda(r, c0 + COLS.length - 1, f.g.tiendas.length, { bold: true, italic: true, size: FUENTE + 2, al: 'right', color: 'FFFFFFFF', fill: 'FF595959' });
        } else if (f.tipo === 'cab') {
          COLS.forEach((c, i) => celda(r, c0 + i, c.t, { bold: true, al: 'center', fill: 'FFD9D9D9', size: FUENTE - 0.5 }));
        } else {
          COLS.forEach((c, i) => celda(r, c0 + i, f.v[i], { al: c.al, bold: i === 1 }));
        }
      });
    });
    for (let r = FILA_INICIO; r < FILA_INICIO + maxFilas; r++) hoja.getRow(r).height = 17;
    hoja.pageSetup.printArea = `A1:${hoja.getColumn(ultimaCol).letter}${FILA_INICIO + maxFilas - 1}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    descargarBlob(blob, `tiendas-resumido-${fechaHoyISO || new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportarTiendasDetallado() {
    const workbook = new window.ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Tiendas (detallado)', { views: [{ showGridLines: false }] });
    const COLS = ['AGENCIA', 'Nº', 'TIENDA', 'DIRECCIÓN COMPLETA', 'PROVINCIA', 'HORA', 'LÍMITE HORA', 'LÍM. PALETS', 'SUPERVISOR/A', 'RECOGIDA SEMANAL', 'AGENCIA RECOGIDA', 'TRÁNSITO (H)', 'MARCA'];
    hoja.columns = [{ width: 14 }, { width: 8 }, { width: 24 }, { width: 42 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }];

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
        tiendasExcelCelda(fila, 10, nombreDiaRecogida(t.recogida_semanal_dia), { halign: 'center' });
        tiendasExcelCelda(fila, 11, t.agencia_recogida || '', { halign: 'center' });
        tiendasExcelCelda(fila, 12, t.transito_horas != null ? t.transito_horas : '', { halign: 'center' });
        tiendasExcelCelda(fila, 13, MARCA_LABEL[t.marca] || t.marca || '', { halign: 'center' });
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

  // Se recarga SIEMPRE al entrar, para ver tiendas creadas/editadas por
  // otros compañeros sin tener que cerrar y volver a abrir la app.
  document.querySelectorAll('[data-view="config-tiendas"]').forEach(el => {
    el.addEventListener('click', () => { cargarAgenciasYTiendas(); });
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
