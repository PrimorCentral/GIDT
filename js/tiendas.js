// Gestión de tiendas (acordeón por agencia)
  // ---------------------------------------------------------------
  let agenciasCache = [];

  // Agencias dadas de baja (Configuración → Gestión de agencias): se
  // quedan en agenciasCache para que los datos antiguos (reportes,
  // historial, siniestros) sigan resolviendo su nombre, pero NO se
  // ofrecen para asignar nada nuevo (tiendas, cambios de agencia...).
  // En los filtros de consulta sí salen, al final y marcadas "(de baja)",
  // para poder seguir buscando sus datos antiguos.
  function agenciasActivas() {
    return agenciasCache.filter(a => a.activo !== false);
  }
  function agenciasParaFiltro() {
    return [...agenciasActivas(), ...agenciasCache.filter(a => a.activo === false)];
  }
  function nombreAgenciaFiltro(a) {
    return a.activo === false ? `${a.nombre} (de baja)` : a.nombre;
  }
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
    // Primero aplica los cambios de agencia programados que ya tocan (por
    // si el cron de las 00:05 no se hubiera ejecutado), y luego carga.
    await aplicarCambiosProgramadosVencidos();
    const [{ data: ags, error: e1 }, { data: tds, error: e2 }] = await Promise.all([
      sb.from('agencias').select('id, nombre, orden, activo, baja_desde').order('orden'),
      sb.from('tiendas').select('id, nombre, agencia_id, hora_prevista, horario_semana, marca, provincia, orden, activo, numero_tienda, direccion, limite_palets, limite_hora_entrega, supervisor, recogida_semanal_dia, agencia_recogida, transito_horas, sabado_agencia_id, sabado_hora, prueba_agencia_id, prueba_hora, prueba_fechas, creado_en').order('orden'),
      cargarBajasTiendas(),
      cargarCambiosProgramados()
    ]);
    if (e1 || e2) { console.error(e1 || e2); return; }
    agenciasCache = ags || [];
    tiendasCache = tds || [];

    // rellenar el <select> de agencia del formulario de alta
    const sel = document.getElementById('ntAgencia');
    // Sin agencia preseleccionada: hay que elegirla al crear la tienda.
    const valorPrevioAgencia = sel.value;
    sel.innerHTML = `<option value="">— Elige agencia —</option>`
      + agenciasActivas().map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
    sel.value = valorPrevioAgencia;
    ['ntSabadoAgencia', 'metSabadoAgencia', 'ntPruebaAgencia', 'metPruebaAgencia'].forEach(id => {
      const s = document.getElementById(id);
      if (!s) return;
      const previo = s.value;
      s.innerHTML = `<option value="">— Elige agencia —</option>`
        + agenciasActivas().map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
      s.value = previo;
    });

    renderAcordeonTiendas();
  }

  function renderTiendasContadores() {
    const cont = document.getElementById('tiendasContadores');
    if (!cont) return;
    const activas = tiendasCache.filter(t => t.activo && !tiendaEnBajaHoy(t.id));
    const numBajas = tiendasCache.filter(t => t.activo && tiendaEnBajaHoy(t.id)).length;
    const conSabado = activas.filter(t => t.marca === 'SABADO' || tiendaTieneEntregaSabado(t)).length;
    const enPrueba = activas.filter(t => fechasPruebaPendientes(t).length > 0).length;
    cont.innerHTML = `
      <span class="tiendas-contador"><b>${activas.length}</b><span>Tiendas</span></span>
      <button type="button" class="tiendas-contador sabado pulsable" data-lista="sabado" title="Ver las tiendas que los sábados reciben por otra agencia"><b>${conSabado}</b><span>Con sábado</span></button>
      <button type="button" class="tiendas-contador prueba pulsable" data-lista="prueba" title="Ver las tiendas con fechas de prueba pendientes"><b>${enPrueba}</b><span>En prueba</span></button>
      ${numBajas ? `<button type="button" class="tiendas-contador baja pulsable" data-lista="baja" title="Ver las tiendas de baja ahora mismo"><b>${numBajas}</b><span>De baja</span></button>` : ''}
      ${programadosCache.length ? `<button type="button" class="tiendas-contador programado pulsable" data-lista="programados" title="Ver los cambios de agencia programados"><b>${programadosCache.length}</b><span>Cambios programados</span></button>` : ''}
    `;
    cont.querySelectorAll('[data-lista]').forEach(btn => btn.addEventListener('click', () => abrirListaContador(btn.dataset.lista)));
  }

  // ---------------------------------------------------------------
  // Ventana con la lista de tiendas de un contador (Con sábado / En prueba
  // / De baja). Pulsar una tienda abre su ficha (Editar tienda).
  // ---------------------------------------------------------------
  function abrirListaContador(tipo) {
    const overlay = document.getElementById('modalListaContadorOverlay');
    if (!overlay) return;
    const nomAg = (id) => agenciasCache.find(a => a.id === id)?.nombre || '—';
    const hora = (h) => h ? h.slice(0, 5) : '';
    const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const orden = (a, b) => nomAg(a.agencia_id).localeCompare(nomAg(b.agencia_id)) || a.nombre.localeCompare(b.nombre);
    let titulo = '', sub = '', cabecera = [], filas = [];

    if (tipo === 'sabado') {
      const tds = tiendasCache.filter(t => t.activo && !tiendaEnBajaHoy(t.id) && (t.marca === 'SABADO' || tiendaTieneEntregaSabado(t))).sort(orden);
      titulo = `🟡 Con sábado (${tds.length})`;
      sub = 'Tiendas que los sábados reciben por otra agencia.';
      cabecera = ['Nº', 'Tienda', 'Agencia habitual', 'Agencia sábado', 'Hora sábado'];
      filas = tds.map(t => ({ id: t.id, celdas: [
        [t.numero_tienda || '—', 'suave'], [t.nombre, 'nombre'], [nomAg(t.agencia_id)],
        [t.marca === 'SABADO' ? `${nomAg(t.agencia_id)} (solo sábados)` : nomAg(t.sabado_agencia_id)],
        [hora(t.sabado_hora) || `${hora(t.hora_prevista) || '—'} (habitual)`, 'suave']
      ] }));
    } else if (tipo === 'prueba') {
      const tds = tiendasCache.filter(t => t.activo && !tiendaEnBajaHoy(t.id) && fechasPruebaPendientes(t).length > 0).sort(orden);
      titulo = `🟢 En prueba (${tds.length})`;
      sub = 'Tiendas con fechas de prueba pendientes: esos días reciben además por la agencia de prueba.';
      cabecera = ['Nº', 'Tienda', 'Agencia habitual', 'Agencia prueba', 'Hora', 'Próximas fechas'];
      filas = tds.map(t => ({ id: t.id, celdas: [
        [t.numero_tienda || '—', 'suave'], [t.nombre, 'nombre'], [nomAg(t.agencia_id)], [nomAg(t.prueba_agencia_id)],
        [hora(t.prueba_hora) || `${hora(t.hora_prevista) || '—'} (habitual)`, 'suave'],
        [fechasPruebaPendientes(t).map(fechaCorta).join(', '), 'suave']
      ] }));
    } else if (tipo === 'baja') {
      const tds = tiendasCache.filter(t => t.activo && tiendaEnBajaHoy(t.id)).sort(orden);
      titulo = `⏸️ De baja (${tds.length})`;
      sub = 'Tiendas que ahora mismo no reciben mercancía.';
      cabecera = ['Nº', 'Tienda', 'Agencia', 'Desde', 'Vuelve', 'Motivo'];
      filas = tds.map(t => {
        const p = periodoBajaActualDeTienda(t.id);
        return { id: t.id, celdas: [
          [t.numero_tienda || '—', 'suave'], [t.nombre, 'nombre'], [nomAg(t.agencia_id)],
          [p?.fecha_desde ? fechaISOaCorta(p.fecha_desde) : '—'],
          [p?.fecha_reactivacion ? fechaISOaCorta(p.fecha_reactivacion) : 'Sin fecha', 'suave'],
          [p?.motivo || '—', 'suave']
        ] };
      });
    } else if (tipo === 'programados') {
      document.getElementById('listaContadorTitulo').textContent = `📅 Cambios de agencia programados (${programadosCache.length})`;
      document.getElementById('listaContadorSub').textContent = 'Se aplican solos el día indicado. Puedes cancelarlos antes.';
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const cuerpo = document.getElementById('listaContadorCuerpo');
      cuerpo.innerHTML = programadosCache.length
        ? `<div class="prog-lista">${programadosCache.map(c => {
            const t = tiendasCache.find(x => x.id === c.tienda_id);
            const creado = c.creado_en ? fechaISOaCorta(fechaLocalISO(new Date(c.creado_en))) : '';
            return `
              <div class="prog-fila" data-tienda="${c.tienda_id}" title="Abrir la ficha de la tienda">
                <div class="prog-fecha"><b>${c.fecha_cambio.slice(8, 10)}</b><span>${meses[Number(c.fecha_cambio.slice(5, 7)) - 1]}</span></div>
                <div class="prog-txt">
                  <b>${escapeHtml(t?.nombre || '—')}${t?.numero_tienda ? ` <span class="prog-num">· nº ${escapeHtml(t.numero_tienda)}</span>` : ''}</b>
                  <span class="prog-ag-de">${escapeHtml(c.agencia_anterior_nombre || '—')}</span> → <span class="prog-ag-a">${escapeHtml(c.agencia_nueva_nombre)}</span>
                  <small>Programado por ${escapeHtml(c.creado_por || '—')}${creado ? ` · ${creado}` : ''}</small>
                </div>
                <button type="button" class="btn prog-cancelar" data-cancelar-programado="${c.id}">Cancelar</button>
              </div>`;
          }).join('')}</div>`
        : '<div class="lista-contador-vacia">No hay ningún cambio de agencia programado.</div>';
      cuerpo.querySelectorAll('[data-cancelar-programado]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelarCambioProgramado(Number(b.dataset.cancelarProgramado));
      }));
      cuerpo.querySelectorAll('.prog-fila[data-tienda]').forEach(f => f.addEventListener('click', () => {
        cerrarListaContador();
        abrirModalEditarTienda(Number(f.dataset.tienda));
      }));
      overlay.classList.add('show');
      return;
    } else return;

    document.getElementById('listaContadorTitulo').textContent = titulo;
    document.getElementById('listaContadorSub').textContent = sub;
    const cuerpo = document.getElementById('listaContadorCuerpo');
    cuerpo.innerHTML = filas.length
      ? `<table class="tabla-lista-contador">
          <thead><tr>${cabecera.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${filas.map(f => `<tr data-tienda="${f.id}" title="Abrir la ficha de la tienda">${f.celdas.map(([v, cls]) => `<td class="${cls || ''}">${escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`
      : '<div class="lista-contador-vacia">No hay ninguna tienda.</div>';
    cuerpo.querySelectorAll('tr[data-tienda]').forEach(tr => tr.addEventListener('click', () => {
      cerrarListaContador();
      abrirModalEditarTienda(Number(tr.dataset.tienda));
    }));
    overlay.classList.add('show');
  }
  function cerrarListaContador() {
    document.getElementById('modalListaContadorOverlay')?.classList.remove('show');
  }
  document.getElementById('btnCerrarListaContador')?.addEventListener('click', cerrarListaContador);
  // Es solo de consulta: se puede cerrar también pulsando fuera o con Escape.
  document.getElementById('modalListaContadorOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modalListaContadorOverlay') cerrarListaContador();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('modalListaContadorOverlay')?.classList.contains('show')) cerrarListaContador();
  });



  function renderAcordeonTiendas() {
    renderTiendasContadores();
    const cont = document.getElementById('acordeonAgencias');
    const qNormalizada = normalizarTextoBusqueda(filtroTiendasTexto);
    const buscando = !!qNormalizada;

    const bloques = agenciasActivas().map(ag => {
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
              <td class="celda-extra">${chipsEntregasHtml(t) || (pBaja || cambioProgramadoDeTienda(t.id) ? '' : '<span style="color:var(--ink-soft);">—</span>')}${badgeBajaHtml(pBaja)}${badgeProgramadoHtml(cambioProgramadoDeTienda(t.id))}</td>
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
            <div class="tabla-tiendas-scroll" data-scroll-agencia="${ag.id}">
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
                    <th class="th-extra">Entregas de otra agencia</th>
                    <th class="th-acciones"></th>
                  </tr>
                </thead>
                <tbody>${filas}</tbody>
              </table>
            </div>
          </div>
        </div>`;
    });

    // Conserva la posición de scroll al redibujar (p. ej. tras editar una
    // tienda): la de cada tabla de agencia (que tiene su propio scroll) y la
    // de los contenedores que envuelven el acordeón (<main>, página...).
    const scrollTablas = {};
    cont.querySelectorAll('[data-scroll-agencia]').forEach(el => {
      scrollTablas[el.dataset.scrollAgencia] = { top: el.scrollTop, left: el.scrollLeft };
    });
    const scrollPadres = [];
    for (let el = cont.parentElement; el; el = el.parentElement) {
      if (el.scrollTop || el.scrollLeft) scrollPadres.push({ el, top: el.scrollTop, left: el.scrollLeft });
    }
    const scrollVentana = { x: window.scrollX, y: window.scrollY };
    // Fija la altura mientras se sustituye el contenido para que el navegador
    // no recorte el scroll al quedarse el contenedor vacío un instante.
    const altoPrevio = cont.offsetHeight;
    if (altoPrevio) cont.style.minHeight = altoPrevio + 'px';

    cont.innerHTML = buscando && bloques.every(b => !b)
      ? `<div class="card" style="text-align:center; padding:30px; color:var(--ink-soft);">Ninguna tienda coincide con "${escapeHtml(filtroTiendasTexto)}".</div>`
      : bloques.join('');

    cont.querySelectorAll('[data-scroll-agencia]').forEach(el => {
      const s = scrollTablas[el.dataset.scrollAgencia];
      if (s) { el.scrollTop = s.top; el.scrollLeft = s.left; }
    });
    scrollPadres.forEach(s => { s.el.scrollTop = s.top; s.el.scrollLeft = s.left; });
    if (scrollVentana.x || scrollVentana.y) window.scrollTo(scrollVentana.x, scrollVentana.y);
    cont.style.minHeight = '';

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
    // Agencia habitual: solo informativa (no editable desde este modal).
    const metAgInfo = document.getElementById('metAgenciaInfo');
    if (metAgInfo) metAgInfo.value = agenciasCache.find(a => a.id === t.agencia_id)?.nombre || '—';
    document.getElementById('metRecogidaDia').value = t.recogida_semanal_dia ? String(t.recogida_semanal_dia) : '';
    document.getElementById('metAgenciaRecogida').value = t.agencia_recogida || '';
    // Tránsito es un desplegable (24 h … 144 h). Si la tienda tiene un valor
    // antiguo que no está en la lista (p. ej. 12 h), se añade como opción
    // para no perderlo al guardar.
    const selTransito = document.getElementById('metTransito');
    selTransito.querySelectorAll('option[data-extra]').forEach(o => o.remove());
    if (t.transito_horas != null && !selTransito.querySelector(`option[value="${t.transito_horas}"]`)) {
      const o = document.createElement('option');
      o.value = t.transito_horas;
      o.textContent = `${t.transito_horas} h`;
      o.dataset.extra = '1';
      selTransito.appendChild(o);
    }
    selTransito.value = t.transito_horas != null ? String(t.transito_horas) : '';
    // (con ?. por si el index.html publicado aún no tiene la sección: así
    // el modal se abre igualmente)
    rellenarTarjetasEntregas('met', t);
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

  // Nº de tienda único: no puede haber dos tiendas ACTIVAS con el mismo
  // número (las eliminadas —activo=false— no cuentan, para poder reutilizar
  // el número de una tienda cerrada). Se compara sin espacios, en
  // mayúsculas y sin ceros a la izquierda ("021" = "21").
  // (Si una tienda entrega los sábados con otra agencia, NO se crea otra
  // ficha: se indica en la sección "Entrega de sábado" de la misma tienda.)
  function normalizarNumeroTienda(n) {
    return String(n ?? '').trim().toUpperCase().replace(/^0+(?=.)/, '');
  }

  // ---------------------------------------------------------------
  // Entrega de sábado por otra agencia (tiendas.sabado_agencia_id /
  // tiendas.sabado_hora). Una sola ficha de tienda: de lunes a viernes
  // entrega su agencia habitual y los sábados la agencia de sábado, a la
  // hora de sábado si la tiene (si no, a la habitual). Lo aplica
  // tiendaConHorarioDia() en utilidades-informe.js (Informe del día,
  // Historial, snapshot de incidencias) y el Reporte mensual.
  // ---------------------------------------------------------------
  function tiendaTieneEntregaSabado(t) {
    return !!t && t.sabado_agencia_id != null && t.sabado_agencia_id !== t.agencia_id;
  }

  // ---------------------------------------------------------------
  // Prueba con otra agencia (tiendas.prueba_agencia_id / prueba_hora /
  // prueba_fechas): en las fechas marcadas la tienda recibe ADEMÁS por la
  // agencia de prueba (una fila más en el Informe del día). Cuando pasa la
  // última fecha deja de salir sola: no hay nada que borrar.
  // ---------------------------------------------------------------
  function fechasPruebaPendientes(t) {
    if (!t || t.prueba_agencia_id == null) return [];
    const hoyISO = fechaLocalISO(new Date());
    return (t.prueba_fechas || []).filter(f => f >= hoyISO).sort();
  }

  // Etiquetas de la columna "Entregas de otra agencia" (Gestión de tiendas).
  function chipsEntregasHtml(t) {
    const partes = [];
    if (tiendaTieneEntregaSabado(t)) {
      const ag = agenciasCache.find(a => a.id === t.sabado_agencia_id);
      const hora = t.sabado_hora ? t.sabado_hora.slice(0, 5) : '';
      partes.push(`<span class="xchip s" title="Los sábados entrega ${escapeHtml(ag?.nombre || '—')}${hora ? ' a las ' + hora : ' a la hora habitual'}">${badgeMarcaHtml('SABADO')}${escapeHtml(ag?.nombre || '—')}${hora ? ' ' + hora : ''}</span>`);
    }
    const pendientes = fechasPruebaPendientes(t);
    if (pendientes.length) {
      const ag = agenciasCache.find(a => a.id === t.prueba_agencia_id);
      const lista = pendientes.map(f => f.slice(8, 10) + '/' + f.slice(5, 7)).join(', ');
      partes.push(`<span class="xchip p" title="Prueba con ${escapeHtml(ag?.nombre || '—')}: ${lista}">${badgeMarcaHtml('PRUEBA')}${escapeHtml(ag?.nombre || '—')} · ${pendientes.length} fecha${pendientes.length === 1 ? '' : 's'}</span>`);
    }
    return partes.join('');
  }

  // Estado del calendario de cada modal: fechas elegidas y mes visible.
  const calPrueba = {
    nt: { fechas: new Set(), mes: null },
    met: { fechas: new Set(), mes: null }
  };
  const MESES_CAL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function renderCalendarioPrueba(prefijo) {
    const cont = document.getElementById(prefijo + 'PruebaCal');
    const chips = document.getElementById(prefijo + 'PruebaChips');
    if (!cont) return;
    const est = calPrueba[prefijo];
    if (!est.mes) { const d = new Date(); est.mes = new Date(d.getFullYear(), d.getMonth(), 1); }
    const anio = est.mes.getFullYear(), mes = est.mes.getMonth();
    const hoyISO = fechaLocalISO(new Date());
    const primerDiaSemana = (new Date(anio, mes, 1).getDay() + 6) % 7; // 0 = lunes
    const diasMes = new Date(anio, mes + 1, 0).getDate();
    let celdas = 'LMXJVSD'.split('').map(d => `<span class="ea-cal-dw">${d}</span>`).join('');
    for (let i = 0; i < primerDiaSemana; i++) celdas += '<span></span>';
    for (let d = 1; d <= diasMes; d++) {
      const iso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const clases = ['ea-cal-d'];
      if (est.fechas.has(iso)) clases.push('on');
      if (iso < hoyISO) clases.push('pasada');
      if (iso === hoyISO) clases.push('hoy');
      if (new Date(anio, mes, d).getDay() === 0) clases.push('domingo');
      celdas += `<button type="button" class="${clases.join(' ')}" data-fecha="${iso}">${d}</button>`;
    }
    cont.innerHTML = `
      <div class="ea-cal-head">
        <button type="button" class="ea-cal-nav" data-mover="-1" title="Mes anterior">◀</button>
        <span>${MESES_CAL[mes]} ${anio}</span>
        <button type="button" class="ea-cal-nav" data-mover="1" title="Mes siguiente">▶</button>
      </div>
      <div class="ea-cal-grid">${celdas}</div>`;
    cont.querySelectorAll('.ea-cal-nav').forEach(btn => btn.addEventListener('click', () => {
      est.mes = new Date(anio, mes + Number(btn.dataset.mover), 1);
      renderCalendarioPrueba(prefijo);
    }));
    cont.querySelectorAll('.ea-cal-d').forEach(btn => btn.addEventListener('click', () => {
      const f = btn.dataset.fecha;
      if (est.fechas.has(f)) est.fechas.delete(f); else est.fechas.add(f);
      renderCalendarioPrueba(prefijo);
      actualizarResumenesTarjetas(prefijo);
    }));
    if (chips) {
      const ordenadas = [...est.fechas].sort();
      const pendientes = ordenadas.filter(f => f >= hoyISO);
      const pasadas = ordenadas.length - pendientes.length;
      chips.innerHTML = pendientes.map(f => `<span class="ea-fchip">${f.slice(8, 10)}/${f.slice(5, 7)}</span>`).join('')
        + (pasadas ? `<span class="ea-fchip pasada" title="Fechas de prueba ya pasadas">${pasadas} ya pasada${pasadas === 1 ? '' : 's'}</span>` : '')
        + (!ordenadas.length ? '<span class="ea-hint" style="margin:0;">Pulsa los días del calendario para marcarlos.</span>' : '');
    }
  }

  // Resumen de la cabecera de cada tarjeta + borde de color si está activa.
  function actualizarResumenesTarjetas(prefijo) {
    const nombreAg = (id) => agenciasCache.find(a => a.id === Number(id))?.nombre || '';
    const chkS = document.getElementById(prefijo + 'SabadoOtra');
    const cardS = document.getElementById(prefijo + 'CardSabado');
    const resS = document.getElementById(prefijo + 'SabadoResumen');
    if (chkS && cardS && resS) {
      cardS.classList.toggle('on', chkS.checked);
      const ag = nombreAg(document.getElementById(prefijo + 'SabadoAgencia').value);
      const hora = document.getElementById(prefijo + 'SabadoHora').value;
      resS.textContent = chkS.checked ? ([ag || 'Elige agencia', hora].filter(Boolean).join(' · ')) : 'Desactivado';
    }
    const chkP = document.getElementById(prefijo + 'PruebaOtra');
    const cardP = document.getElementById(prefijo + 'CardPrueba');
    const resP = document.getElementById(prefijo + 'PruebaResumen');
    if (chkP && cardP && resP) {
      cardP.classList.toggle('on', chkP.checked);
      const ag = nombreAg(document.getElementById(prefijo + 'PruebaAgencia').value);
      const hoyISO = fechaLocalISO(new Date());
      const pend = [...calPrueba[prefijo].fechas].filter(f => f >= hoyISO).length;
      resP.textContent = chkP.checked ? `${ag || 'Elige agencia'} · ${pend} fecha${pend === 1 ? '' : 's'}` : 'Desactivado';
    }
  }

  // Muestra/oculta el cuerpo de cada tarjeta según su interruptor.
  function sincronizarCamposSabado(prefijo) {
    [['Sabado'], ['Prueba']].forEach(([tipo]) => {
      const chk = document.getElementById(prefijo + tipo + 'Otra');
      const campos = document.getElementById(prefijo + tipo + 'Campos');
      if (chk && campos) campos.style.display = chk.checked ? '' : 'none';
    });
    renderCalendarioPrueba(prefijo);
    actualizarResumenesTarjetas(prefijo);
  }
  ['nt', 'met'].forEach(prefijo => {
    ['Sabado', 'Prueba'].forEach(tipo => {
      document.getElementById(prefijo + tipo + 'Otra')?.addEventListener('change', () => {
        sincronizarCamposSabado(prefijo);
        if (document.getElementById(prefijo + tipo + 'Otra').checked) {
          setTimeout(() => document.getElementById(prefijo + tipo + 'Agencia')?.focus(), 30);
        }
      });
      ['Agencia', 'Hora'].forEach(campo => {
        const el = document.getElementById(prefijo + tipo + campo);
        el?.addEventListener('change', () => actualizarResumenesTarjetas(prefijo));
        el?.addEventListener('input', () => actualizarResumenesTarjetas(prefijo));
      });
    });
  });

  // Rellena las tarjetas de un modal con los datos de la tienda (o vacías).
  function rellenarTarjetasEntregas(prefijo, t) {
    const set = (id, v) => { const el = document.getElementById(prefijo + id); if (el) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? ''; } };
    const tieneSabado = tiendaTieneEntregaSabado(t);
    set('SabadoOtra', tieneSabado);
    set('SabadoAgencia', tieneSabado ? String(t.sabado_agencia_id) : '');
    set('SabadoHora', tieneSabado && t.sabado_hora ? t.sabado_hora.slice(0, 5) : '');
    const tienePrueba = !!t && t.prueba_agencia_id != null;
    set('PruebaOtra', tienePrueba && fechasPruebaPendientes(t).length > 0);
    set('PruebaAgencia', tienePrueba ? String(t.prueba_agencia_id) : '');
    set('PruebaHora', tienePrueba && t.prueba_hora ? t.prueba_hora.slice(0, 5) : '');
    calPrueba[prefijo].fechas = new Set(tienePrueba ? (t.prueba_fechas || []) : []);
    // El calendario se abre en el mes de la próxima fecha pendiente (o en el actual).
    const prox = tienePrueba ? fechasPruebaPendientes(t)[0] : null;
    const base = prox ? new Date(prox + 'T00:00:00') : new Date();
    calPrueba[prefijo].mes = new Date(base.getFullYear(), base.getMonth(), 1);
    sincronizarCamposSabado(prefijo);
  }

  // Lee y valida la tarjeta de sábado. Devuelve { error } o { sabado_agencia_id, sabado_hora }.
  function leerCamposSabado(prefijo, agenciaHabitualId) {
    const chk = document.getElementById(prefijo + 'SabadoOtra');
    // Sin la sección en pantalla (index.html antiguo): no se toca lo guardado.
    if (!chk) {
      const actual = prefijo === 'met' ? tiendasCache.find(x => x.id === editarTiendaId) : null;
      return { sabado_agencia_id: actual?.sabado_agencia_id ?? null, sabado_hora: actual?.sabado_hora ?? null };
    }
    if (!chk.checked) return { sabado_agencia_id: null, sabado_hora: null };
    const agId = Number(document.getElementById(prefijo + 'SabadoAgencia').value) || null;
    const hora = document.getElementById(prefijo + 'SabadoHora').value || null;
    if (!agId) return { error: 'Sábados: elige la agencia que entrega los sábados.' };
    if (agenciaHabitualId && agId === agenciaHabitualId) return { error: 'Sábados: la agencia es la misma que la habitual. Desactívalo o elige otra agencia.' };
    return { sabado_agencia_id: agId, sabado_hora: hora };
  }

  // Lee y valida la tarjeta de prueba. Devuelve { error } o { prueba_agencia_id, prueba_hora, prueba_fechas }.
  function leerCamposPrueba(prefijo, agenciaHabitualId) {
    const chk = document.getElementById(prefijo + 'PruebaOtra');
    if (!chk) {
      const actual = prefijo === 'met' ? tiendasCache.find(x => x.id === editarTiendaId) : null;
      return { prueba_agencia_id: actual?.prueba_agencia_id ?? null, prueba_hora: actual?.prueba_hora ?? null, prueba_fechas: actual?.prueba_fechas ?? null };
    }
    const fechas = [...calPrueba[prefijo].fechas].sort();
    if (!chk.checked) {
      // Apagada: se quitan las fechas pendientes, pero se conservan las ya
      // pasadas (y su agencia) para que el Historial de esos días no cambie.
      const actual = prefijo === 'met' ? tiendasCache.find(x => x.id === editarTiendaId) : null;
      const hoyISO = fechaLocalISO(new Date());
      const pasadas = (actual?.prueba_fechas || []).filter(f => f < hoyISO).sort();
      return pasadas.length && actual?.prueba_agencia_id != null
        ? { prueba_agencia_id: actual.prueba_agencia_id, prueba_hora: actual.prueba_hora ?? null, prueba_fechas: pasadas }
        : { prueba_agencia_id: null, prueba_hora: null, prueba_fechas: null };
    }
    const agId = Number(document.getElementById(prefijo + 'PruebaAgencia').value) || null;
    const hora = document.getElementById(prefijo + 'PruebaHora').value || null;
    if (!agId) return { error: 'Prueba: elige la agencia de prueba.' };
    if (agenciaHabitualId && agId === agenciaHabitualId) return { error: 'Prueba: la agencia de prueba es la misma que la habitual. Elige otra.' };
    if (!fechas.length) return { error: 'Prueba: marca en el calendario al menos una fecha de entrega.' };
    return { prueba_agencia_id: agId, prueba_hora: hora, prueba_fechas: fechas };
  }

  // Botón "Guardar"/"Crear tienda" mientras se guarda: se desactiva al
  // momento y, si tarda más de un instante, muestra un spinner "Guardando…".
  function botonGuardando(btn, activo) {
    if (!btn) return;
    if (activo) {
      if (btn.dataset.textoOriginal == null) btn.dataset.textoOriginal = btn.innerHTML;
      btn.disabled = true;
      clearTimeout(btn._spinnerTimer);
      btn._spinnerTimer = setTimeout(() => {
        btn.classList.add('btn-guardando');
        btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>Guardando…';
      }, 250);
    } else {
      clearTimeout(btn._spinnerTimer);
      btn.classList.remove('btn-guardando');
      if (btn.dataset.textoOriginal != null) { btn.innerHTML = btn.dataset.textoOriginal; delete btn.dataset.textoOriginal; }
      btn.disabled = false;
    }
  }

  // La base de datos tampoco deja dos tiendas activas con el mismo Nº
  // (índice único tiendas_numero_unico_activas): si otra persona la acaba de
  // crear justo a la vez, se avisa y se refresca la lista para que aparezca.
  function esNumeroDuplicadoBD(err) {
    return err && (err.code === '23505' || /tiendas_numero_unico_activas/.test(err.message || ''));
  }
  // Aviso en rojo en mitad de la pantalla (el texto de abajo del modal se
  // podía pasar por alto). En Nueva tienda, al pulsar "Cancelar" se cierra
  // también el modal de alta; en Editar tienda se queda abierto para poder
  // cambiar el número.
  async function avisarNumeroRepetido(numeroTienda, nombreExistente, { desdeNueva }) {
    if (desdeNueva) cargarAgenciasYTiendas(); // por si la acaba de crear otra persona
    // Con nombre: la encontró la comprobación de la app. Sin nombre: la
    // rechazó la base de datos porque otra persona la acaba de crear a la vez.
    const primeraLinea = nombreExistente
      ? `Ya existe una tienda con el Nº ${numeroTienda}: "${nombreExistente}".`
      : `Otra persona acaba de dar de alta el Nº ${numeroTienda}.`;
    await modalAlert(
      primeraLinea + '\n' +
      (desdeNueva ? 'No se ha creado la tienda.' : 'Cambia el número para poder guardar.'),
      { titulo: 'Nº de tienda repetido', icono: '⚠️', danger: true, textoOk: desdeNueva ? 'Cancelar' : 'Aceptar' }
    );
    if (desdeNueva) cerrarModalNuevaTienda();
    else document.getElementById('metNumero')?.focus();
  }

  async function tiendaConMismoNumero(numeroTienda, excluirId) {
    const buscado = normalizarNumeroTienda(numeroTienda);
    if (!buscado) return null;
    // Se consulta la BD (no solo la caché) por si otra persona creó una
    // tienda mientras esta pantalla estaba abierta.
    let lista = tiendasCache;
    try {
      const { data, error } = await sb.from('tiendas')
        .select('id, nombre, numero_tienda, activo')
        .eq('activo', true)
        .not('numero_tienda', 'is', null);
      if (!error && data) lista = data;
    } catch (_) { /* si falla, se usa la caché */ }
    return lista.find(t =>
      t.activo &&
      t.id !== excluirId &&
      normalizarNumeroTienda(t.numero_tienda) === buscado
    ) || null;
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
    const errEl = document.getElementById('metError');
    errEl.style.display = 'none';

    // Mismos campos obligatorios que al crear una tienda.
    const faltan = [];
    if (!numeroTienda) faltan.push('Nº tienda');
    if (!nombre) faltan.push('Nombre tienda');
    if (!supervisor) faltan.push('Supervisor/a');
    if (!provincia) faltan.push('Provincia');
    if (!hora) faltan.push('Hora prevista');
    if (limitePaletsRaw === '') faltan.push('Límite palets');
    if (faltan.length) {
      errEl.textContent = `Faltan campos obligatorios: ${faltan.join(', ')}.`;
      errEl.style.display = 'block';
      return;
    }

    const tEditada = tiendasCache.find(x => x.id === editarTiendaId);
    const sabado = leerCamposSabado('met', tEditada?.agencia_id);
    const prueba = sabado.error ? {} : leerCamposPrueba('met', tEditada?.agencia_id);
    if (sabado.error || prueba.error) {
      errEl.textContent = sabado.error || prueba.error;
      errEl.style.display = 'block';
      return;
    }

    const btnGuardar = document.getElementById('modalEditarTiendaBtnGuardar');
    botonGuardando(btnGuardar, true);
    try {
      const repetidaEditar = await tiendaConMismoNumero(numeroTienda, editarTiendaId);
      if (repetidaEditar) {
        botonGuardando(btnGuardar, false);
        await avisarNumeroRepetido(numeroTienda, repetidaEditar.nombre, { desdeNueva: false });
        return;
      }

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
        sabado_agencia_id: sabado.sabado_agencia_id,
        sabado_hora: sabado.sabado_hora,
        prueba_agencia_id: prueba.prueba_agencia_id,
        prueba_hora: prueba.prueba_hora,
        prueba_fechas: prueba.prueba_fechas
      }).eq('id', editarTiendaId);
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Editar tienda', nombre);
      cerrarModalEditarTienda();
      if (typeof mostrarToast === 'function') mostrarToast(`Tienda "${nombre}" modificada correctamente`, { posicion: 'abajo' });
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error editando tienda:', err);
      if (esNumeroDuplicadoBD(err)) { botonGuardando(btnGuardar, false); await avisarNumeroRepetido(numeroTienda, null, { desdeNueva: false }); return; }
      errEl.textContent = 'No se pudo guardar el cambio.';
      errEl.style.display = 'block';
    } finally {
      botonGuardando(btnGuardar, false);
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

  // ---------------------------------------------------------------
  // Mover tienda de agencia: AHORA MISMO o PROGRAMADO para una fecha.
  //
  // Programado → se guarda en tienda_cambios_agencia_programados (estado
  // PENDIENTE) y lo aplica la base de datos sola ese día a las 00:05 hora
  // de Madrid (pg_cron → aplicar_cambios_agencia_programados()). Hasta
  // entonces la tienda sigue en su agencia actual, así que el Informe del
  // día y el Reporte mensual siguen bien. Al aplicarse escribe en
  // tienda_agencia_historial con la fecha programada (no la de hoy), que
  // es la que usa el Reporte mensual para partir la fila.
  // La app también llama a esa función al cargar (por si el cron fallara);
  // es idempotente, así que no pasa nada si se llama varias veces.
  // ---------------------------------------------------------------
  let programadosCache = []; // cambios PENDIENTES, ordenados por fecha
  let moverAgenciaTiendaId = null;
  let moverAgenciaCuando = 'ahora';

  async function aplicarCambiosProgramadosVencidos() {
    try {
      const { error } = await sb.rpc('aplicar_cambios_agencia_programados');
      if (error) throw error;
    } catch (err) {
      console.error('No se pudieron aplicar los cambios de agencia programados:', err);
    }
  }

  async function cargarCambiosProgramados() {
    try {
      const { data, error } = await sb.from('tienda_cambios_agencia_programados')
        .select('id, tienda_id, agencia_anterior_id, agencia_anterior_nombre, agencia_nueva_id, agencia_nueva_nombre, fecha_cambio, creado_por, creado_en')
        .eq('estado', 'PENDIENTE')
        .order('fecha_cambio');
      if (error) throw error;
      programadosCache = data || [];
    } catch (err) {
      console.error('Error cargando cambios de agencia programados:', err);
      programadosCache = [];
    }
  }

  function cambioProgramadoDeTienda(tiendaId) {
    return programadosCache.find(c => c.tienda_id === tiendaId) || null;
  }

  function badgeProgramadoHtml(c) {
    if (!c) return '';
    return ` <span class="pill programado" title="Cambio de agencia programado por ${escapeHtml(c.creado_por || '—')}">📅 Pasa a ${escapeHtml(c.agencia_nueva_nombre)} el ${fechaISOaCorta(c.fecha_cambio)}</span>`;
  }

  async function cambiarAgenciaTienda(id) {
    const t = tiendasCache.find(x => x.id === id);
    if (!t) return;

    const prog = cambioProgramadoDeTienda(id);
    if (prog) {
      const ver = await modalConfirm(
        `"${t.nombre}" ya tiene programado el cambio a ${prog.agencia_nueva_nombre} el ${fechaISOaCorta(prog.fecha_cambio)}.\n\nPara moverla de otra forma, cancela antes ese cambio.`,
        { titulo: 'Cambio ya programado', icono: '📅', textoOk: 'Ver cambios programados', textoCancel: 'Cerrar' }
      );
      if (ver) abrirListaContador('programados');
      return;
    }

    moverAgenciaTiendaId = id;
    document.getElementById('mmaMensaje').textContent = `Selecciona la agencia a la que quieres mover\n"${t.nombre}":`;
    const sel = document.getElementById('mmaAgencia');
    sel.innerHTML = agenciasActivas().map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
    sel.value = String(t.agencia_id);
    const fecha = document.getElementById('mmaFecha');
    fecha.min = sumarDiasISO(fechaLocalISO(new Date()), 1);
    fecha.value = '';
    document.getElementById('mmaError').style.display = 'none';
    elegirCuandoMoverAgencia('ahora');
    document.getElementById('modalMoverAgenciaOverlay').classList.add('show');
  }

  function cerrarModalMoverAgencia() {
    document.getElementById('modalMoverAgenciaOverlay')?.classList.remove('show');
    moverAgenciaTiendaId = null;
  }

  function elegirCuandoMoverAgencia(cuando) {
    moverAgenciaCuando = cuando;
    document.querySelectorAll('#mmaCuando [data-cuando]').forEach(b => b.classList.toggle('activo', b.dataset.cuando === cuando));
    document.getElementById('mmaFechaWrap').style.display = cuando === 'programar' ? '' : 'none';
    document.getElementById('mmaBtnGuardar').textContent = cuando === 'programar' ? 'Programar cambio' : 'Mover';
    actualizarNotaMoverAgencia();
  }

  function actualizarNotaMoverAgencia() {
    const nota = document.getElementById('mmaNota');
    const t = tiendasCache.find(x => x.id === moverAgenciaTiendaId);
    const fecha = document.getElementById('mmaFecha').value;
    const destinoId = Number(document.getElementById('mmaAgencia').value);
    const destino = agenciasCache.find(a => a.id === destinoId);
    const actual = agenciasCache.find(a => a.id === t?.agencia_id);
    if (moverAgenciaCuando !== 'programar' || !fecha || !t || !destino || destinoId === t.agencia_id) {
      nota.style.display = 'none';
      return;
    }
    nota.innerHTML = `Hasta el <b>${fechaISOaCorta(fecha)}</b> la tienda sigue en <b>${escapeHtml(actual?.nombre || '—')}</b>. Ese día pasará sola a <b>${escapeHtml(destino.nombre)}</b>.`;
    nota.style.display = '';
  }

  async function guardarModalMoverAgencia() {
    const id = moverAgenciaTiendaId;
    const t = tiendasCache.find(x => x.id === id);
    if (!t) return;
    const destinoId = Number(document.getElementById('mmaAgencia').value);
    const fecha = document.getElementById('mmaFecha').value;
    const errEl = document.getElementById('mmaError');
    const btn = document.getElementById('mmaBtnGuardar');
    const fallo = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
    errEl.style.display = 'none';

    if (!destinoId || destinoId === t.agencia_id) { fallo('Elige una agencia distinta de la actual.'); return; }

    if (moverAgenciaCuando === 'ahora') {
      cerrarModalMoverAgencia();
      await moverTiendaDeAgenciaAhora(t, destinoId);
      return;
    }

    const manana = sumarDiasISO(fechaLocalISO(new Date()), 1);
    if (!fecha) { fallo('Elige la fecha del cambio.'); return; }
    if (fecha < manana) { fallo('La fecha tiene que ser a partir de mañana. Para hoy, usa "Ahora mismo".'); return; }

    const agenciaAnterior = agenciasCache.find(a => a.id === t.agencia_id);
    const agenciaNueva = agenciasCache.find(a => a.id === destinoId);
    btn.disabled = true;
    try {
      const { error } = await sb.from('tienda_cambios_agencia_programados').insert({
        tienda_id: id,
        agencia_anterior_id: t.agencia_id,
        agencia_anterior_nombre: agenciaAnterior?.nombre || null,
        agencia_nueva_id: destinoId,
        agencia_nueva_nombre: agenciaNueva?.nombre || '—',
        fecha_cambio: fecha,
        creado_por: sesionActual?.nombre || sesionActual?.usuario || null
      });
      if (error) {
        // Índice único: solo un cambio pendiente por tienda (p. ej. lo ha
        // programado otro compañero mientras tenías el modal abierto).
        if (error.code === '23505') { fallo('Esta tienda ya tiene un cambio de agencia programado.'); return; }
        throw error;
      }
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Programar cambio de agencia', `${t.nombre}: ${agenciaAnterior?.nombre || '—'} → ${agenciaNueva?.nombre || '—'} el ${fechaISOaCorta(fecha)}`);
      cerrarModalMoverAgencia();
      await cargarAgenciasYTiendas();
      if (typeof cargarPendienteAtencion === 'function') cargarPendienteAtencion();
    } catch (err) {
      console.error('Error programando el cambio de agencia:', err);
      fallo('No se pudo programar el cambio de agencia.');
    } finally {
      btn.disabled = false;
    }
  }

  async function cancelarCambioProgramado(progId) {
    const c = programadosCache.find(x => x.id === progId);
    if (!c) return;
    const t = tiendasCache.find(x => x.id === c.tienda_id);
    const ok = await modalConfirm(
      `¿Cancelar el cambio de "${t?.nombre || '—'}" de ${c.agencia_anterior_nombre || '—'} a ${c.agencia_nueva_nombre} del ${fechaISOaCorta(c.fecha_cambio)}?\n\nLa tienda seguirá en ${c.agencia_anterior_nombre || '—'}.`,
      { titulo: 'Cancelar cambio programado', danger: true, textoOk: 'Sí, cancelar', textoCancel: 'No' }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('tienda_cambios_agencia_programados').update({
        estado: 'CANCELADO',
        resuelto_por: sesionActual?.nombre || sesionActual?.usuario || null,
        resuelto_en: new Date().toISOString()
      }).eq('id', progId).eq('estado', 'PENDIENTE');
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Cancelar cambio de agencia programado', `${t?.nombre || '—'}: ${c.agencia_anterior_nombre || '—'} → ${c.agencia_nueva_nombre} el ${fechaISOaCorta(c.fecha_cambio)}`);
      await cargarAgenciasYTiendas();
      if (typeof cargarPendienteAtencion === 'function') cargarPendienteAtencion();
      if (programadosCache.length) abrirListaContador('programados');
      else cerrarListaContador();
    } catch (err) {
      console.error('Error cancelando el cambio programado:', err);
      await modalAlert('No se pudo cancelar el cambio programado.', { titulo: 'Error' });
    }
  }

  document.querySelectorAll('#mmaCuando [data-cuando]').forEach(b =>
    b.addEventListener('click', () => elegirCuandoMoverAgencia(b.dataset.cuando)));
  document.getElementById('mmaFecha')?.addEventListener('input', actualizarNotaMoverAgencia);
  document.getElementById('mmaAgencia')?.addEventListener('change', actualizarNotaMoverAgencia);
  document.getElementById('mmaBtnCancelar')?.addEventListener('click', cerrarModalMoverAgencia);
  document.getElementById('mmaBtnGuardar')?.addEventListener('click', guardarModalMoverAgencia);

  // Movimiento inmediato (lo que hacía siempre el botón ⇄).
  async function moverTiendaDeAgenciaAhora(t, destinoId) {
    const id = t.id;
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
    document.getElementById('ntAgencia').value = '';
    rellenarTarjetasEntregas('nt', null);
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
    const marca = 'HABITUAL'; // la marca ya no se elige: las entregas de otra agencia van en las tarjetas
    const errEl = document.getElementById('ntError');
    errEl.style.display = 'none';

    // Campos obligatorios al crear una tienda.
    const faltan = [];
    if (!numeroTienda) faltan.push('Nº tienda');
    if (!nombre) faltan.push('Nombre tienda');
    if (!agenciaId) faltan.push('Agencia');
    if (!supervisor) faltan.push('Supervisor/a');
    if (!provincia) faltan.push('Provincia');
    if (!hora) faltan.push('Hora prevista');
    if (limitePaletsRaw === '') faltan.push('Límite palets');
    if (faltan.length) {
      errEl.textContent = `Faltan campos obligatorios: ${faltan.join(', ')}.`;
      errEl.style.display = 'block';
      return;
    }

    const sabado = leerCamposSabado('nt', agenciaId);
    const prueba = sabado.error ? {} : leerCamposPrueba('nt', agenciaId);
    if (sabado.error || prueba.error) {
      errEl.textContent = sabado.error || prueba.error;
      errEl.style.display = 'block';
      return;
    }

    const maxOrden = Math.max(0, ...tiendasCache.filter(t => t.agencia_id === agenciaId).map(t => t.orden));

    const btn = document.getElementById('btnGuardarTienda');
    botonGuardando(btn, true);
    try {
      const repetida = await tiendaConMismoNumero(numeroTienda, null);
      if (repetida) {
        botonGuardando(btn, false);
        await avisarNumeroRepetido(numeroTienda, repetida.nombre, { desdeNueva: true });
        return;
      }

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
        sabado_agencia_id: sabado.sabado_agencia_id,
        sabado_hora: sabado.sabado_hora,
        prueba_agencia_id: prueba.prueba_agencia_id,
        prueba_hora: prueba.prueba_hora,
        prueba_fechas: prueba.prueba_fechas,
        orden: maxOrden + 1
      });
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Crear tienda', nombre);
      cerrarModalNuevaTienda();
      if (typeof mostrarToast === 'function') mostrarToast(`Tienda "${nombre}" creada correctamente`, { posicion: 'abajo' });
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error creando tienda:', err);
      if (esNumeroDuplicadoBD(err)) { botonGuardando(btn, false); await avisarNumeroRepetido(numeroTienda, null, { desdeNueva: true }); return; }
      errEl.textContent = 'No se pudo crear la tienda.';
      errEl.style.display = 'block';
    } finally {
      botonGuardando(btn, false);
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

  // "SÁB: SEYLOTRANS 08:30 · PRUEBA: CBL (3 fechas)" para el Excel detallado.
  function textoEntregasExcel(t) {
    const partes = [];
    if (tiendaTieneEntregaSabado(t)) {
      const ag = agenciasCache.find(a => a.id === t.sabado_agencia_id);
      partes.push(`SÁB: ${ag?.nombre || '—'}${t.sabado_hora ? ' ' + t.sabado_hora.slice(0, 5) : ''}`);
    }
    const pend = fechasPruebaPendientes(t);
    if (pend.length) {
      const ag = agenciasCache.find(a => a.id === t.prueba_agencia_id);
      partes.push(`PRUEBA: ${ag?.nombre || '—'} (${pend.length} fecha${pend.length === 1 ? '' : 's'})`);
    }
    return partes.join(' · ');
  }

  async function exportarTiendasDetallado() {
    const workbook = new window.ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Tiendas (detallado)', { views: [{ showGridLines: false }] });
    const COLS = ['AGENCIA', 'Nº', 'TIENDA', 'DIRECCIÓN COMPLETA', 'PROVINCIA', 'HORA', 'LÍMITE HORA', 'LÍM. PALETS', 'SUPERVISOR/A', 'RECOGIDA SEMANAL', 'AGENCIA RECOGIDA', 'TRÁNSITO (H)', 'ENTREGAS OTRA AGENCIA'];
    hoja.columns = [{ width: 14 }, { width: 8 }, { width: 24 }, { width: 42 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 34 }];

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
        tiendasExcelCelda(fila, 13, textoEntregasExcel(t), { halign: 'center' });
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
  document.getElementById('btnRecargarTiendas')?.addEventListener('click', (e) =>
    recargarConGiro(e.currentTarget, cargarAgenciasYTiendas));

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
