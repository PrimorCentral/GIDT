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
  // tiendasGestionCache: TODAS las fichas (también las tiendas en apertura),
  // solo para esta pantalla. tiendasCache: las que ya existen de verdad (sin
  // las de apertura); es la que usa el resto de la app (Informe del día,
  // Historial, Reporte mensual, Panel siniestros...), así una tienda en
  // apertura no sale en ningún sitio hasta que se activa.
  let tiendasGestionCache = [];
  let agenciasTiendasAbiertas = new Set(); // ids de agencia desplegados en "Gestión de tiendas"
  let filtroTiendasTexto = '';
  // Filtro (botón "Filtros"): agencias (ids), tránsitos ('24'…'144' o 'SIN') y tiendas (ids).
  const filtroTiendas = { agencias: new Set(), transitos: new Set(), tiendas: new Set() };
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

  // ---------------------------------------------------------------
  // Tiendas en APERTURA (tiendas.en_apertura / apertura_prevista /
  // fecha_apertura): se dan de alta antes de abrir para tener sus datos,
  // pero no salen en el Informe del día, Historial, Reporte mensual ni
  // Panel siniestros hasta que se activan con su fecha de apertura real.
  // Al activarla, creado_en pasa a ser ese día: el resto de la app ya usa
  // creado_en como "primer día en que existe la tienda". Si la fecha de
  // apertura es futura, sigue contando como apertura hasta ese día.
  // ---------------------------------------------------------------
  function tiendaEnApertura(t) {
    if (!t) return false;
    if (t.en_apertura) return true;
    return !!t.fecha_apertura && t.fecha_apertura > fechaLocalISO(new Date());
  }

  function badgeAperturaHtml(t) {
    if (!tiendaEnApertura(t)) return '';
    let texto;
    if (!t.en_apertura) texto = `🚧 ABRE EL ${fechaISOaCorta(t.fecha_apertura).slice(0, 5)}`;
    else if (t.apertura_prevista) texto = `🚧 APERTURA · prevista ${fechaISOaCorta(t.apertura_prevista).slice(0, 5)}`;
    else texto = '🚧 APERTURA';
    const titulo = t.en_apertura
      ? 'Tienda en apertura: aún no sale en el Informe del día ni en el Reporte mensual'
      : `Activada: empieza a contar el ${fechaISOaCorta(t.fecha_apertura)}`;
    return `<span class="pill apertura" title="${escapeHtml(titulo)}">${escapeHtml(texto)}</span>`;
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
      || normalizarTextoBusqueda(t.codigo_postal).includes(qNormalizada)
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
      sb.from('tiendas').select('id, nombre, agencia_id, hora_prevista, horario_semana, marca, provincia, codigo_postal, orden, activo, numero_tienda, direccion, limite_palets, limite_hora_entrega, supervisor, recogida_semanal_dia, agencia_recogida, transito_horas, sabado_agencia_id, sabado_hora, prueba_agencia_id, prueba_hora, prueba_fechas, creado_en, en_apertura, apertura_prevista, fecha_apertura, volcar_salidas, excluir_salidas').order('orden'),
      cargarBajasTiendas(),
      cargarCambiosProgramados()
    ]);
    if (e1 || e2) { console.error(e1 || e2); return; }
    agenciasCache = ags || [];
    tiendasGestionCache = tds || [];
    tiendasCache = tiendasGestionCache.filter(t => !tiendaEnApertura(t));

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
    // Si se movió la tienda o se cambió su horario por días con el modal
    // Editar tienda abierto detrás, este se actualiza solo.
    if (editarTiendaId != null) refrescarAccionesModalEditar();
  }

  function renderTiendasContadores() {
    const cont = document.getElementById('tiendasContadores');
    if (!cont) return;
    // Las tiendas en apertura no cuentan como tiendas: van en su propio contador.
    const activas = tiendasGestionCache.filter(t => t.activo && !tiendaEnApertura(t) && !tiendaEnBajaHoy(t.id));
    const numBajas = tiendasGestionCache.filter(t => t.activo && !tiendaEnApertura(t) && tiendaEnBajaHoy(t.id)).length;
    const numAperturas = tiendasGestionCache.filter(t => t.activo && tiendaEnApertura(t)).length;
    const conSabado = activas.filter(t => t.marca === 'SABADO' || tiendaTieneEntregaSabado(t)).length;
    const enPrueba = activas.filter(t => fechasPruebaPendientes(t).length > 0).length;
    cont.innerHTML = `
      <span class="tiendas-contador"><b>${activas.length}</b><span>Tiendas</span></span>
      <button type="button" class="tiendas-contador sabado pulsable" data-lista="sabado" title="Ver las tiendas que los sábados reciben por otra agencia"><b>${conSabado}</b><span>Con sábado</span></button>
      <button type="button" class="tiendas-contador prueba pulsable" data-lista="prueba" title="Ver las tiendas con fechas de prueba pendientes"><b>${enPrueba}</b><span>En prueba</span></button>
      <button type="button" class="tiendas-contador apertura pulsable" data-lista="aperturas" title="Ver las tiendas en apertura (aún no abiertas)"><b>${numAperturas}</b><span>Aperturas</span></button>
      ${numBajas ? `<button type="button" class="tiendas-contador baja pulsable" data-lista="baja" title="Ver las tiendas de baja ahora mismo"><b>${numBajas}</b><span>De baja</span></button>` : ''}
      <button type="button" class="tiendas-contador programado pulsable" data-lista="programados" title="Ver los cambios de agencia programados"><b>${programadosCache.length}</b><span>Cambios programados</span></button>
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
      const tds = tiendasGestionCache.filter(t => t.activo && !tiendaEnApertura(t) && !tiendaEnBajaHoy(t.id) && (t.marca === 'SABADO' || tiendaTieneEntregaSabado(t))).sort(orden);
      titulo = `🟡 Con sábado (${tds.length})`;
      sub = 'Tiendas que los sábados reciben por otra agencia.';
      cabecera = ['Nº', 'Tienda', 'Agencia habitual', 'Agencia sábado', 'Hora sábado'];
      filas = tds.map(t => ({ id: t.id, celdas: [
        [t.numero_tienda || '—', 'suave'], [t.nombre, 'nombre'], [nomAg(t.agencia_id)],
        [t.marca === 'SABADO' ? `${nomAg(t.agencia_id)} (solo sábados)` : nomAg(t.sabado_agencia_id)],
        [hora(t.sabado_hora) || `${hora(t.hora_prevista) || '—'} (habitual)`, 'suave']
      ] }));
    } else if (tipo === 'prueba') {
      const tds = tiendasGestionCache.filter(t => t.activo && !tiendaEnApertura(t) && !tiendaEnBajaHoy(t.id) && fechasPruebaPendientes(t).length > 0).sort(orden);
      titulo = `🟢 En prueba (${tds.length})`;
      sub = 'Tiendas con fechas de prueba pendientes: esos días reciben además por la agencia de prueba.';
      cabecera = ['Nº', 'Tienda', 'Agencia habitual', 'Agencia prueba', 'Hora', 'Próximas fechas'];
      filas = tds.map(t => ({ id: t.id, celdas: [
        [t.numero_tienda || '—', 'suave'], [t.nombre, 'nombre'], [nomAg(t.agencia_id)], [nomAg(t.prueba_agencia_id)],
        [hora(t.prueba_hora) || `${hora(t.hora_prevista) || '—'} (habitual)`, 'suave'],
        [fechasPruebaPendientes(t).map(fechaCorta).join(', '), 'suave']
      ] }));
    } else if (tipo === 'baja') {
      const tds = tiendasGestionCache.filter(t => t.activo && !tiendaEnApertura(t) && tiendaEnBajaHoy(t.id)).sort(orden);
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
    } else if (tipo === 'aperturas') {
      const tds = tiendasGestionCache.filter(t => t.activo && tiendaEnApertura(t)).sort(orden);
      document.getElementById('listaContadorTitulo').textContent = `🚧 Aperturas (${tds.length})`;
      document.getElementById('listaContadorSub').textContent = 'Tiendas dadas de alta que aún no han abierto. No salen en el Informe del día ni en el Reporte mensual.';
      const cuerpo = document.getElementById('listaContadorCuerpo');
      cuerpo.innerHTML = tds.length
        ? `<table class="tabla-lista-contador">
            <thead><tr><th>Nº</th><th>Tienda</th><th>Agencia</th><th>Provincia</th><th>Apertura</th><th></th></tr></thead>
            <tbody>${tds.map(t => {
              const fecha = t.en_apertura
                ? (t.apertura_prevista ? `${fechaISOaCorta(t.apertura_prevista)} (prevista)` : 'Sin fecha')
                : `${fechaISOaCorta(t.fecha_apertura)} (activada)`;
              return `<tr data-tienda="${t.id}" title="Abrir la ficha de la tienda">
                <td class="suave">${escapeHtml(t.numero_tienda || '—')}</td>
                <td class="nombre">${escapeHtml(t.nombre)}</td>
                <td>${escapeHtml(nomAg(t.agencia_id))}</td>
                <td class="suave">${escapeHtml(t.provincia || '—')}</td>
                <td class="${t.en_apertura && !t.apertura_prevista ? 'suave' : ''}">${escapeHtml(fecha)}</td>
                <td style="text-align:right;">${t.en_apertura ? `<button type="button" class="mini-btn btn-activar" data-activar-tienda="${t.id}">🚀 Activar</button>` : ''}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>`
        : '<div class="lista-contador-vacia">No hay ninguna tienda en apertura.</div>';
      cuerpo.querySelectorAll('[data-activar-tienda]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        cerrarListaContador();
        abrirModalActivarTienda(Number(b.dataset.activarTienda));
      }));
      cuerpo.querySelectorAll('tr[data-tienda]').forEach(tr => tr.addEventListener('click', () => {
        cerrarListaContador();
        abrirModalEditarTienda(Number(tr.dataset.tienda));
      }));
      overlay.classList.add('show');
      return;
    } else if (tipo === 'programados') {
      document.getElementById('listaContadorTitulo').textContent = `📅 Cambios de agencia programados (${programadosCache.length})`;
      document.getElementById('listaContadorSub').textContent = 'Se aplican solos el día indicado. Puedes cancelarlos antes.';
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const cuerpo = document.getElementById('listaContadorCuerpo');
      cuerpo.innerHTML = programadosCache.length
        ? `<div class="prog-lista">${programadosCache.map(c => {
            const t = tiendasGestionCache.find(x => x.id === c.tienda_id);
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
    const filtrando = hayFiltroTiendas();
    renderBarraFiltroTiendas();

    const bloques = agenciasActivas().map(ag => {
      if (filtrando && filtroTiendas.agencias.size && !filtroTiendas.agencias.has(ag.id)) return '';
      const tds = tiendasGestionCache.filter(t => t.agencia_id === ag.id && t.activo && tiendaCoincideBusqueda(t, qNormalizada) && tiendaPasaFiltro(t));
      if ((buscando || filtrando) && tds.length === 0) return ''; // oculta agencias sin coincidencias mientras se busca/filtra
      const abierta = (buscando || filtrando) ? true : agenciasTiendasAbiertas.has(ag.id);
      const numApertura = tds.filter(t => tiendaEnApertura(t)).length;
      const numDeBaja = tds.filter(t => !tiendaEnApertura(t) && tiendaEnBajaHoy(t.id)).length;
      const filas = tds.length
        ? tds.map(t => {
          const enApertura = tiendaEnApertura(t);
          const pBaja = enApertura ? null : periodoBajaActualDeTienda(t.id);
          const enBajaHoy = !enApertura && tiendaEnBajaHoy(t.id);
          return `
            <tr data-tienda="${t.id}" class="${enApertura ? 'fila-apertura' : (enBajaHoy ? 'fila-en-baja' : '')}">
              <td class="celda-numero">${t.numero_tienda ? escapeHtml(t.numero_tienda) : '—'}</td>
              <td class="celda-nombre">${escapeHtml(t.nombre)}</td>
              <td class="hora celda-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}${badgeHorarioSemanaHtml(t)}</td>
              <td class="celda-direccion">${t.direccion ? escapeHtml(t.direccion) : '—'}</td>
              <td class="celda-provincia">${t.provincia ? escapeHtml(t.provincia) : '—'}</td>
              <td class="celda-cp">${t.codigo_postal ? escapeHtml(t.codigo_postal) : '—'}</td>
              <td class="celda-limite-palets">${t.limite_palets != null ? t.limite_palets : '—'}</td>
              <td class="celda-limite-hora">${t.limite_hora_entrega ? t.limite_hora_entrega.slice(0,5) : '—'}</td>
              <td class="celda-supervisor">${t.supervisor ? escapeHtml(t.supervisor) : '—'}</td>
              <td class="celda-recogida-dia">${t.recogida_semanal_dia ? nombreDiaRecogida(t.recogida_semanal_dia) : '—'}</td>
              <td class="celda-agencia-recogida">${t.agencia_recogida ? escapeHtml(t.agencia_recogida) : '—'}</td>
              <td class="celda-transito">${t.transito_horas != null ? t.transito_horas + ' h' : '—'}</td>
              <td class="celda-extra">${badgeAperturaHtml(t)}${chipsEntregasHtml(t) || (enApertura || pBaja || cambioProgramadoDeTienda(t.id) ? '' : '<span style="color:var(--ink-soft);">—</span>')}${badgeBajaHtml(pBaja)}${badgeProgramadoHtml(cambioProgramadoDeTienda(t.id))}</td>
              <td class="acciones">
                <button class="mini-btn" data-mover="up" title="Subir">▲</button>
                <button class="mini-btn" data-mover="down" title="Bajar">▼</button>
                <span class="acciones-separador"></span>
                <button class="mini-btn" data-editar title="Editar">✏️</button>
                ${'' /* Horario por días, mover a otra agencia y baja/alta temporal: ahora dentro del modal Editar tienda. Eliminar tienda se quitó: para sacar una tienda se usa la baja temporal. */}
              </td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="14" style="text-align:center; padding:16px; color:var(--ink-soft);">Sin tiendas en esta agencia.</td></tr>`;

      return `
        <div class="agencia-block">
          <div class="agencia-head ${abierta ? 'open' : ''}" data-agencia="${ag.id}">
            <span class="caret">▶</span>
            <b>${escapeHtml(ag.nombre)}</b>
            <span class="count">${tds.length - numDeBaja - numApertura} tienda${(tds.length - numDeBaja - numApertura) === 1 ? '' : 's'}${numDeBaja ? ` · ${numDeBaja} de baja` : ''}${numApertura ? ` · ${numApertura} en apertura` : ''}</span>
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
                    <th class="th-cp">Código postal</th>
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

    cont.innerHTML = (buscando || filtrando) && bloques.every(b => !b)
      ? `<div class="card" style="text-align:center; padding:30px; color:var(--ink-soft);">${buscando ? `Ninguna tienda coincide con "${escapeHtml(filtroTiendasTexto)}"${filtrando ? ' con el filtro activo' : ''}.` : 'Ninguna tienda coincide con el filtro activo.'}</div>`
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
  }

  // ---------------------------------------------------------------
  // Modal "Editar tienda": nombre, hora prevista, provincia y marca.
  // Sustituye a la antigua edición en línea dentro de la propia fila.
  // ---------------------------------------------------------------
  // Campos que se comparan al editar una tienda para guardar en el
  // registro de auditoría exactamente qué cambió (lupa → Antes / Después).
  const audHora = v => (v ? String(v).slice(0, 5) : null);
  const audAgencia = id => (id == null || id === '' ? null : (agenciasCache.find(a => String(a.id) === String(id))?.nombre || `#${id}`));
  const audDia = n => (n ? (DIAS_SEMANA_ISO.find(d => d.iso === Number(n))?.label || String(n)) : null);
  const CAMPOS_AUDITORIA_TIENDA = [
    { clave: 'numero_tienda', etiqueta: 'Nº tienda' },
    { clave: 'nombre', etiqueta: 'Nombre' },
    { clave: 'hora_prevista', etiqueta: 'Hora prevista', formato: audHora },
    { clave: 'direccion', etiqueta: 'Dirección' },
    { clave: 'provincia', etiqueta: 'Provincia' },
    { clave: 'codigo_postal', etiqueta: 'Código postal' },
    { clave: 'limite_palets', etiqueta: 'Límite palets' },
    { clave: 'limite_hora_entrega', etiqueta: 'Límite hora entrega', formato: audHora },
    { clave: 'supervisor', etiqueta: 'Supervisor/a' },
    { clave: 'recogida_semanal_dia', etiqueta: 'Día de recogida', formato: audDia },
    { clave: 'agencia_recogida', etiqueta: 'Agencia de recogida' },
    { clave: 'transito_horas', etiqueta: 'Tránsito', formato: v => (v == null || v === '' ? null : `${v} h`) },
    { clave: 'sabado_agencia_id', etiqueta: 'Agencia sábados', formato: audAgencia },
    { clave: 'sabado_hora', etiqueta: 'Hora sábados', formato: audHora },
    { clave: 'prueba_agencia_id', etiqueta: 'Agencia de prueba', formato: audAgencia },
    { clave: 'prueba_hora', etiqueta: 'Hora de prueba', formato: audHora },
    { clave: 'prueba_fechas', etiqueta: 'Fechas de prueba', formato: f => (Array.isArray(f) && f.length ? [...f].sort().map(fechaISOaCorta) : null) },
    { clave: 'agencia_id', etiqueta: 'Agencia', formato: audAgencia },
    { clave: 'apertura_prevista', etiqueta: 'Apertura prevista', formato: f => (f ? fechaISOaCorta(f) : null) }
  ];

  let editarTiendaId = null;

  // Código postal: España (5 cifras, ej. 41010) o Portugal (4 cifras,
  // opcionalmente con guion y 3 más, ej. 1000-001).
  function codigoPostalValido(cp) {
    return /^\d{5}$/.test(cp) || /^\d{4}(-\d{3})?$/.test(cp);
  }

  // Campos obligatorios de una ficha de tienda. Una tienda en apertura solo
  // necesita Nº, nombre y agencia; el resto se exige al activarla.
  function camposObligatoriosQueFaltan(d, enApertura) {
    const faltan = [];
    if (!d.numero_tienda) faltan.push('Nº tienda');
    if (!d.nombre) faltan.push('Nombre tienda');
    if (!d.agencia_id) faltan.push('Agencia');
    if (enApertura) return faltan;
    if (!d.supervisor) faltan.push('Supervisor/a');
    if (!d.provincia) faltan.push('Provincia');
    if (!d.codigo_postal) faltan.push('Código postal');
    if (!d.hora_prevista) faltan.push('Hora prevista');
    if (d.limite_palets === '' || d.limite_palets == null) faltan.push('Límite palets');
    return faltan;
  }

  function abrirModalEditarTienda(tiendaId) {
    const t = tiendasGestionCache.find(x => x.id === tiendaId);
    const overlay = document.getElementById('modalEditarTiendaOverlay');
    if (!t || !overlay) return;
    editarTiendaId = tiendaId;

    document.getElementById('metNumero').value = t.numero_tienda || '';
    document.getElementById('metNombre').value = t.nombre || '';
    document.getElementById('metHora').value = t.hora_prevista ? t.hora_prevista.slice(0, 5) : '';
    document.getElementById('metDireccion').value = t.direccion || '';
    document.getElementById('metProvincia').value = t.provincia || '';
    document.getElementById('metCodigoPostal').value = t.codigo_postal || '';
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
    // Tienda en apertura: tarjeta con la fecha prevista y botón Activar, y
    // la agencia se puede cambiar aquí mismo (aún no ha abierto).
    const cardApe = document.getElementById('metCardApertura');
    const cabApe = document.getElementById('metAperturaCabecera');
    // (también si ya se activó con una fecha futura: ahí el botón sirve
    // para cambiar esa fecha mientras no llegue)
    const enAperturaAhora = tiendaEnApertura(t);
    if (cardApe) cardApe.style.display = enAperturaAhora ? '' : 'none';
    // La cabecera "Estado de la tienda" sale siempre: en apertura con su
    // tarjeta de siempre; si ya está abierta, con la tarjeta Activa / De baja.
    if (cabApe) cabApe.style.display = '';
    const cardAct = document.getElementById('metCardActiva');
    if (cardAct) cardAct.style.display = enAperturaAhora ? 'none' : '';
    pintarTarjetaActiva(t, enAperturaAhora);
    // El bloque SALIDAS va dentro de la tarjeta que se ve.
    const bloqueSal = document.getElementById('metSalidasBloque');
    const destinoSal = document.getElementById(enAperturaAhora ? 'metAperturaCampos' : 'metActivaCuerpo');
    if (bloqueSal && destinoSal) destinoSal.appendChild(bloqueSal);
    const fApe = document.getElementById('metAperturaPrevista');
    if (fApe) fApe.value = t.apertura_prevista || '';
    const wrapPrev = document.getElementById('metAperturaPrevistaWrap');
    if (wrapPrev) wrapPrev.style.display = t.en_apertura ? '' : 'none';
    const btnAct = document.getElementById('metBtnActivar');
    if (btnAct) btnAct.textContent = t.en_apertura ? '🚀 Activar tienda' : '📅 Cambiar fecha de apertura';
    sincronizarTarjetaApertura('met');
    comprobarEstadoSalidas(t);
    const resApe = document.getElementById('metAperturaResumen');
    if (resApe && enAperturaAhora && !t.en_apertura) resApe.textContent = `Abre el ${fechaISOaCorta(t.fecha_apertura)}`;
    const selAgApe = document.getElementById('metAgenciaApertura');
    if (selAgApe && metAgInfo) {
      selAgApe.innerHTML = agenciasActivas().map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
      selAgApe.value = String(t.agencia_id);
      selAgApe.style.display = t.en_apertura ? '' : 'none';
      metAgInfo.style.display = t.en_apertura ? 'none' : '';
    }
    document.querySelectorAll('#modalEditarTiendaOverlay .tf-req-apertura').forEach(el => { el.style.visibility = t.en_apertura ? 'hidden' : ''; });
    const errEl = document.getElementById('metError');
    errEl.style.display = 'none';
    errEl.textContent = '';

    refrescarAccionesModalEditar();
    // Foto de los campos recién cargados: sirve para saber si hay cambios
    // sin guardar antes de abrir Cambiar agencia u Horario por días.
    fotoFormEditarTienda = estadoFormEditarTienda();

    overlay.classList.add('show');
    setTimeout(() => document.getElementById('metNombre').focus(), 30);
  }

  function cerrarModalEditarTienda() {
    document.getElementById('modalEditarTiendaOverlay')?.classList.remove('show');
    editarTiendaId = null;
    fotoFormEditarTienda = null;
  }

  // ---------------------------------------------------------------
  // Cambiar agencia y Horario por días, dentro del modal Editar tienda
  // (antes eran ⇄ y 🗓️ en la fila de la lista).
  // ---------------------------------------------------------------
  let fotoFormEditarTienda = null;

  // Valores de todos los campos editables del modal (incluidas las
  // entregas de otra agencia y las fechas de prueba del calendario).
  // Los campos de solo lectura y el bloque SALIDAS no cuentan.
  function estadoFormEditarTienda() {
    const overlay = document.getElementById('modalEditarTiendaOverlay');
    if (!overlay) return '';
    const valores = [];
    overlay.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.readOnly || el.closest('#metSalidasBloque')) return;
      if (el.type === 'button' || el.type === 'submit') return;
      const clave = el.id || el.name || '';
      valores.push(clave + '=' + ((el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.value));
    });
    valores.push('pruebaFechas=' + [...calPrueba.met.fechas].sort().join(','));
    return valores.join('|');
  }

  function hayCambiosSinGuardarEditarTienda() {
    return fotoFormEditarTienda != null && estadoFormEditarTienda() !== fotoFormEditarTienda;
  }

  // Resumen corto del horario por días: "L 08:30 · X 08:30" o "sin horas especiales".
  const LETRA_DIA_ISO = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };
  function resumenHorarioSemana(t) {
    const mapa = t?.horario_semana || {};
    const dias = Object.keys(mapa).map(Number).filter(d => LETRA_DIA_ISO[d]).sort((a, b) => a - b);
    if (!dias.length) return 'sin horas especiales';
    return dias.map(d => `${LETRA_DIA_ISO[d]} ${String(mapa[String(d)]).slice(0, 5)}`).join(' · ');
  }

  // Pinta lo que cambian estas dos acciones (agencia y horario por días)
  // sin tocar los campos editables, para no pisar lo que se esté escribiendo.
  function refrescarAccionesModalEditar() {
    if (editarTiendaId == null) return;
    const t = tiendasGestionCache.find(x => x.id === editarTiendaId);
    if (!t) return;
    const metAgInfo = document.getElementById('metAgenciaInfo');
    if (metAgInfo) metAgInfo.value = agenciasCache.find(a => a.id === t.agencia_id)?.nombre || '—';
    // En apertura la agencia se cambia con el desplegable del propio modal.
    const btnAg = document.getElementById('metBtnCambiarAgencia');
    if (btnAg) btnAg.style.display = t.en_apertura ? 'none' : '';
    const filaAg = btnAg?.closest('.tf-agencia-fila');
    if (filaAg) filaAg.style.display = t.en_apertura ? 'none' : '';
    const notaProg = document.getElementById('metAgenciaProgramado');
    const prog = cambioProgramadoDeTienda(t.id);
    if (notaProg) {
      notaProg.style.display = prog && !t.en_apertura ? '' : 'none';
      notaProg.textContent = prog ? `📅 Pasa a ${prog.agencia_nueva_nombre} el ${fechaISOaCorta(prog.fecha_cambio)}` : '';
    }
    const resumen = document.getElementById('metHorarioResumen');
    if (resumen) resumen.textContent = '· ' + resumenHorarioSemana(t);
    document.getElementById('metBtnHorarioSemana')?.classList.toggle('con-horario', !!Object.keys(t.horario_semana || {}).length);
  }

  // Antes de abrir otro modal desde Editar tienda: si hay cambios sin
  // guardar, avisa. Si se sigue, esos cambios se descartan (la ficha
  // vuelve a como está guardada) y luego se abre la acción.
  async function accionDesdeEditarTienda(abrirAccion) {
    if (editarTiendaId == null) return;
    const id = editarTiendaId;
    if (hayCambiosSinGuardarEditarTienda()) {
      const seguir = await modalConfirm(
        'Has cambiado datos de esta tienda que aún no están guardados. Si sigues, esos cambios se pierden.\n\nPara no perderlos, pulsa Volver y luego Guardar.',
        { titulo: 'Cambios sin guardar', icono: '⚠️', textoOk: 'Seguir sin guardar', textoCancel: 'Volver' }
      );
      if (!seguir || editarTiendaId !== id) return;
      abrirModalEditarTienda(id);
    }
    abrirAccion(id);
  }

  document.getElementById('metBtnCambiarAgencia')?.addEventListener('click', () => accionDesdeEditarTienda(cambiarAgenciaTienda));
  document.getElementById('metBtnHorarioSemana')?.addEventListener('click', () => accionDesdeEditarTienda(abrirModalHorarioSemana));

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
      const actual = prefijo === 'met' ? tiendasGestionCache.find(x => x.id === editarTiendaId) : null;
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
      const actual = prefijo === 'met' ? tiendasGestionCache.find(x => x.id === editarTiendaId) : null;
      return { prueba_agencia_id: actual?.prueba_agencia_id ?? null, prueba_hora: actual?.prueba_hora ?? null, prueba_fechas: actual?.prueba_fechas ?? null };
    }
    const fechas = [...calPrueba[prefijo].fechas].sort();
    if (!chk.checked) {
      // Apagada: se quitan las fechas pendientes, pero se conservan las ya
      // pasadas (y su agencia) para que el Historial de esos días no cambie.
      const actual = prefijo === 'met' ? tiendasGestionCache.find(x => x.id === editarTiendaId) : null;
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
    let lista = tiendasGestionCache;
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
    const codigoPostal = document.getElementById('metCodigoPostal').value.replace(/\s+/g, '').toUpperCase();
    const limitePaletsRaw = document.getElementById('metLimitePalets').value;
    const limiteHora = document.getElementById('metLimiteHora').value;
    const supervisor = document.getElementById('metSupervisor').value.trim().toUpperCase();
    const recogidaDia = document.getElementById('metRecogidaDia').value;
    const agenciaRecogida = document.getElementById('metAgenciaRecogida').value.trim().toUpperCase();
    const transitoRaw = document.getElementById('metTransito').value;
    const errEl = document.getElementById('metError');
    errEl.style.display = 'none';

    // Mismos campos obligatorios que al crear una tienda (en apertura, solo
    // Nº y nombre: el resto se exige al activarla).
    const tAntes = tiendasGestionCache.find(x => x.id === editarTiendaId);
    const editandoApertura = !!tAntes?.en_apertura;
    const faltan = camposObligatoriosQueFaltan({
      numero_tienda: numeroTienda, nombre, agencia_id: tAntes?.agencia_id, supervisor, provincia,
      codigo_postal: codigoPostal, hora_prevista: hora, limite_palets: limitePaletsRaw
    }, editandoApertura);
    if (faltan.length) {
      errEl.textContent = `Faltan campos obligatorios: ${faltan.join(', ')}.`;
      errEl.style.display = 'block';
      return;
    }
    if (codigoPostal && !codigoPostalValido(codigoPostal)) {
      errEl.textContent = 'El código postal no es válido. Usa 5 cifras (España, ej. 41010) o el formato de Portugal (ej. 1000-001).';
      errEl.style.display = 'block';
      return;
    }

    const tEditada = tiendasGestionCache.find(x => x.id === editarTiendaId);
    // En apertura la agencia se puede cambiar desde aquí (aún no hay
    // historial que guardar: la tienda todavía no existe para los informes).
    const agenciaApertura = editandoApertura ? (Number(document.getElementById('metAgenciaApertura')?.value) || tEditada?.agencia_id) : null;
    const agenciaParaValidar = editandoApertura ? agenciaApertura : tEditada?.agencia_id;
    const sabado = leerCamposSabado('met', agenciaParaValidar);
    const prueba = sabado.error ? {} : leerCamposPrueba('met', agenciaParaValidar);
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

      const datosNuevos = {
        numero_tienda: numeroTienda || null,
        nombre,
        hora_prevista: hora || null,
        direccion: direccion || null,
        provincia: provincia || null,
        codigo_postal: codigoPostal || null,
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
      };
      if (editandoApertura) {
        datosNuevos.apertura_prevista = document.getElementById('metAperturaPrevista')?.value || null;
        if (agenciaApertura && agenciaApertura !== tEditada?.agencia_id) {
          datosNuevos.agencia_id = agenciaApertura;
          datosNuevos.orden = Math.max(0, ...tiendasGestionCache.filter(x => x.agencia_id === agenciaApertura).map(x => x.orden)) + 1;
        }
      }
      const { error } = await sb.from('tiendas').update(datosNuevos).eq('id', editarTiendaId);
      if (error) throw error;
      if (typeof registrarAccion === 'function') {
        const cambios = typeof auditoriaCalcularCambios === 'function'
          ? auditoriaCalcularCambios(
            // Solo los campos que se guardan en esta edición: la agencia y la
            // apertura prevista solo van cuando se tocan (tienda en apertura),
            // y si no, se compararían con "vacío" como si se hubieran borrado.
            CAMPOS_AUDITORIA_TIENDA.filter(c => Object.prototype.hasOwnProperty.call(datosNuevos, c.clave)),
            tEditada, datosNuevos) : null;
        registrarAccion('tiendas', 'Editar tienda', nombre, cambios, { tiendaId: editarTiendaId });
      }
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
    const t = tiendasGestionCache.find(x => x.id === id);
    if (!t) return;
    const hermanas = tiendasGestionCache.filter(x => x.agencia_id === t.agencia_id && x.activo).sort((a,b) => a.orden - b.orden);
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
    const t = tiendasGestionCache.find(x => x.id === id);
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
    // Vacío por defecto y sin la agencia actual (no tiene sentido moverla a
    // la misma), para que haya que elegir la nueva a propósito.
    sel.innerHTML = `<option value="">— Selecciona la nueva agencia —</option>`
      + agenciasActivas().filter(a => a.id !== t.agencia_id)
        .map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
    sel.value = '';
    // Tienda en apertura: solo "Ahora mismo" (aún no ha abierto, no hace
    // falta programar nada ni dejar historial de cambio de agencia).
    const segCuando = document.getElementById('mmaCuando');
    if (segCuando?.parentElement) segCuando.parentElement.style.display = tiendaEnApertura(t) ? 'none' : '';
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
    const t = tiendasGestionCache.find(x => x.id === moverAgenciaTiendaId);
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
    const t = tiendasGestionCache.find(x => x.id === id);
    if (!t) return;
    const destinoId = Number(document.getElementById('mmaAgencia').value);
    const fecha = document.getElementById('mmaFecha').value;
    const errEl = document.getElementById('mmaError');
    const btn = document.getElementById('mmaBtnGuardar');
    const fallo = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
    errEl.style.display = 'none';

    if (!destinoId || destinoId === t.agencia_id) { fallo('Selecciona la nueva agencia.'); return; }

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
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Programar cambio de agencia', `${t.nombre}: ${agenciaAnterior?.nombre || '—'} → ${agenciaNueva?.nombre || '—'} el ${fechaISOaCorta(fecha)}`, null, { tiendaId: t.id });
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
    const t = tiendasGestionCache.find(x => x.id === c.tienda_id);
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
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Cancelar cambio de agencia programado', `${t?.nombre || '—'}: ${c.agencia_anterior_nombre || '—'} → ${c.agencia_nueva_nombre} el ${fechaISOaCorta(c.fecha_cambio)}`, null, { tiendaId: c.tienda_id });
      await cargarAgenciasYTiendas();
      if (typeof cargarPendienteAtencion === 'function') cargarPendienteAtencion();
      abrirListaContador('programados');
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
      const hermanasDestino = tiendasGestionCache.filter(x => x.agencia_id === destinoId && x.activo);
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

      // Tienda en apertura: aún no existe para informes/reportes, así que
      // no se deja historial de cambio de agencia (solo se cambia la ficha).
      const { error: eHist } = tiendaEnApertura(t) ? { error: null } : await sb.from('tienda_agencia_historial').insert({
        tienda_id: id,
        agencia_anterior_id: t.agencia_id,
        agencia_anterior_nombre: agenciaAnterior?.nombre || null,
        agencia_nueva_id: destinoId,
        agencia_nueva_nombre: agenciaNueva?.nombre || '—',
        fecha_cambio: fechaLocalISO(new Date()),
        creado_por: sesionActual?.nombre || sesionActual?.usuario || null
      });
      if (eHist) console.error('No se pudo registrar el historial de cambio de agencia:', eHist);
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Mover tienda de agencia', `${t.nombre}: ${agenciaAnterior?.nombre || '—'} → ${agenciaNueva?.nombre || '—'}`, null, { tiendaId: id });

      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error moviendo tienda de agencia:', err);
      await modalAlert('No se pudo mover la tienda a la otra agencia.', { titulo: 'Error' });
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
    const t = tiendasGestionCache.find(x => x.id === tiendaId);
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
    const t = tiendasGestionCache.find(x => x.id === bajaTiendaId);
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
        if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Dar de baja tienda', `${t?.nombre || ''} desde ${fechaISOaCorta(fecha)}${motivo ? ' · ' + motivo : ''}`, null, { tiendaId: bajaTiendaId });
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
        if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Dar de alta tienda', `${t?.nombre || ''} desde ${fechaISOaCorta(fecha)}`, null, { tiendaId: bajaTiendaId });
      }
      cerrarModalBajaTienda();
      await cargarAgenciasYTiendas();
      refrescarEstadoModalEditar();
    } catch (err) {
      console.error('Error guardando la baja/alta de la tienda:', err);
      fallo('No se pudo guardar el cambio.');
    } finally {
      btn.disabled = false;
    }
  }

  async function anularBajaTienda() {
    if (bajaTiendaId == null || bajaPeriodoId == null) return;
    const t = tiendasGestionCache.find(x => x.id === bajaTiendaId);
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
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', 'Anular baja de tienda', `${t?.nombre || ''} (desde ${fechaISOaCorta(p.fecha_desde)})`, null, { tiendaId: bajaTiendaId });
      cerrarModalBajaTienda();
      await cargarAgenciasYTiendas();
      refrescarEstadoModalEditar();
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
    document.getElementById('ntCodigoPostal').value = '';
    document.getElementById('ntLimitePalets').value = '';
    document.getElementById('ntLimiteHora').value = '';
    document.getElementById('ntSupervisor').value = '';
    document.getElementById('ntRecogidaDia').value = '';
    document.getElementById('ntAgenciaRecogida').value = '';
    document.getElementById('ntTransito').value = '';
    document.getElementById('ntAgencia').value = '';
    rellenarTarjetasEntregas('nt', null);
    const chkApe = document.getElementById('ntApertura');
    if (chkApe) chkApe.checked = false;
    const fApe = document.getElementById('ntAperturaPrevista');
    if (fApe) fApe.value = '';
    sincronizarTarjetaApertura('nt');
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
    const codigoPostal = document.getElementById('ntCodigoPostal').value.replace(/\s+/g, '').toUpperCase();
    const limitePaletsRaw = document.getElementById('ntLimitePalets').value;
    const limiteHora = document.getElementById('ntLimiteHora').value;
    const supervisor = document.getElementById('ntSupervisor').value.trim().toUpperCase();
    const recogidaDia = document.getElementById('ntRecogidaDia').value;
    const agenciaRecogida = document.getElementById('ntAgenciaRecogida').value.trim().toUpperCase();
    const transitoRaw = document.getElementById('ntTransito').value;
    const marca = 'HABITUAL'; // la marca ya no se elige: las entregas de otra agencia van en las tarjetas
    // Tienda en apertura (aún no abierta): solo se guardan sus datos.
    const enApertura = !!document.getElementById('ntApertura')?.checked;
    const aperturaPrevista = enApertura ? (document.getElementById('ntAperturaPrevista')?.value || null) : null;
    const errEl = document.getElementById('ntError');
    errEl.style.display = 'none';

    // Campos obligatorios al crear una tienda. En apertura solo Nº, nombre
    // y agencia: el resto se puede completar antes de activarla.
    const faltan = camposObligatoriosQueFaltan({
      numero_tienda: numeroTienda, nombre, agencia_id: agenciaId, supervisor, provincia,
      codigo_postal: codigoPostal, hora_prevista: hora, limite_palets: limitePaletsRaw
    }, enApertura);
    if (faltan.length) {
      errEl.textContent = `Faltan campos obligatorios: ${faltan.join(', ')}.`;
      errEl.style.display = 'block';
      return;
    }
    if (codigoPostal && !codigoPostalValido(codigoPostal)) {
      errEl.textContent = 'El código postal no es válido. Usa 5 cifras (España, ej. 41010) o el formato de Portugal (ej. 1000-001).';
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

    const maxOrden = Math.max(0, ...tiendasGestionCache.filter(t => t.agencia_id === agenciaId).map(t => t.orden));

    const btn = document.getElementById('btnGuardarTienda');
    botonGuardando(btn, true);
    try {
      const repetida = await tiendaConMismoNumero(numeroTienda, null);
      if (repetida) {
        botonGuardando(btn, false);
        await avisarNumeroRepetido(numeroTienda, repetida.nombre, { desdeNueva: true });
        return;
      }

      const { data: creada, error } = await sb.from('tiendas').insert({
        numero_tienda: numeroTienda || null,
        nombre,
        agencia_id: agenciaId,
        hora_prevista: hora || null,
        direccion: direccion || null,
        provincia: provincia || null,
        codigo_postal: codigoPostal || null,
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
        en_apertura: enApertura,
        apertura_prevista: aperturaPrevista,
        orden: maxOrden + 1
      }).select('id').single();
      if (error) throw error;
      const nuevaId = creada?.id ?? null;
      if (typeof registrarAccion === 'function') registrarAccion('tiendas', enApertura ? 'Crear tienda en apertura' : 'Crear tienda', nombre + (aperturaPrevista ? ` · prevista ${fechaISOaCorta(aperturaPrevista)}` : ''), null, { tiendaId: nuevaId });
      cerrarModalNuevaTienda();
      if (typeof mostrarToast === 'function') mostrarToast(enApertura ? `Tienda "${nombre}" creada en apertura` : `Tienda "${nombre}" creada correctamente`, { posicion: 'abajo' });
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

  // lista: tiendas a exportar (por defecto, todas las de la pantalla).
  function tiendasAgrupadasPorAgencia(lista = tiendasGestionCache) {
    const porAgencia = new Map();
    lista.forEach(t => {
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
      // (las tiendas en apertura tampoco: aún no han abierto)
      .map(g => ({ ...g, tiendas: g.tiendas.filter(t => t.marca === 'HABITUAL' && !tiendaEnApertura(t)) }))
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

  // lista: tiendas a exportar (todas o solo las del filtro activo).
  // Las tiendas en apertura salen con fondo gris y su estado en la última columna.
  async function exportarTiendasDetallado(lista = tiendasGestionCache) {
    const workbook = new window.ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Tiendas (detallado)', { views: [{ showGridLines: false }] });
    const COLS = ['AGENCIA', 'Nº', 'TIENDA', 'DIRECCIÓN COMPLETA', 'PROVINCIA', 'C. POSTAL', 'HORA', 'LÍMITE HORA', 'LÍM. PALETS', 'SUPERVISOR/A', 'RECOGIDA SEMANAL', 'AGENCIA RECOGIDA', 'TRÁNSITO (H)', 'ENTREGAS OTRA AGENCIA'];
    hoja.columns = [{ width: 14 }, { width: 8 }, { width: 24 }, { width: 42 }, { width: 16 }, { width: 11 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 34 }];

    const filaCab = hoja.addRow(COLS);
    COLS.forEach((_, i) => tiendasExcelCelda(filaCab, i + 1, COLS[i], { bold: true, halign: 'center', color: 'FFFFFFFF', fill: 'FF000000' }));

    tiendasAgrupadasPorAgencia(lista).forEach(g => {
      g.tiendas.forEach(t => {
        const fila = hoja.addRow([]);
        const ape = tiendaEnApertura(t);
        const fill = ape ? 'FFE4E4E4' : undefined;
        let entregas = textoEntregasExcel(t);
        if (ape) {
          const estado = t.en_apertura
            ? `EN APERTURA${t.apertura_prevista ? ' (prevista ' + fechaISOaCorta(t.apertura_prevista) + ')' : ''}`
            : `ABRE EL ${fechaISOaCorta(t.fecha_apertura)}`;
          entregas = entregas ? `${estado} · ${entregas}` : estado;
        }
        tiendasExcelCelda(fila, 1, g.agencia.nombre, { fill });
        tiendasExcelCelda(fila, 2, t.numero_tienda || '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 3, t.nombre || '', { bold: true, fill });
        tiendasExcelCelda(fila, 4, t.direccion || '', { fill });
        tiendasExcelCelda(fila, 5, t.provincia || '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 6, t.codigo_postal || '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 7, t.hora_prevista ? t.hora_prevista.slice(0, 5) : '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 8, t.limite_hora_entrega ? t.limite_hora_entrega.slice(0, 5) : '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 9, t.limite_palets != null ? t.limite_palets : '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 10, t.supervisor || '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 11, nombreDiaRecogida(t.recogida_semanal_dia), { halign: 'center', fill });
        tiendasExcelCelda(fila, 12, t.agencia_recogida || '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 13, t.transito_horas != null ? t.transito_horas : '', { halign: 'center', fill });
        tiendasExcelCelda(fila, 14, entregas, { halign: 'center', fill });
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
      else if (hayFiltroTiendas()) abrirPreguntaExportarFiltro();
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

  // Detallado con filtro activo: pregunta si exportar solo lo filtrado o todo.
  function abrirPreguntaExportarFiltro() {
    const overlay = document.getElementById('modalExportFiltroOverlay');
    if (!overlay) { exportarTiendasDetallado(); return; }
    const idsAgencias = new Set(agenciasActivas().map(a => a.id));
    const todas = tiendasGestionCache.filter(t => t.activo && idsAgencias.has(t.agencia_id));
    const filtradas = tiendasVisiblesConFiltro();
    document.getElementById('mefResumen').innerHTML = textosFiltroTiendas().map(txt => `<span class="fchip">${escapeHtml(txt)}</span>`).join('')
      + (filtroTiendasTexto.trim() ? `<span class="fchip">Búsqueda: "${escapeHtml(filtroTiendasTexto.trim())}"</span>` : '');
    document.getElementById('mefNumFiltro').textContent = filtradas.length;
    document.getElementById('mefNumTodas').textContent = todas.length;
    overlay.classList.add('show');
  }
  function cerrarPreguntaExportarFiltro() {
    document.getElementById('modalExportFiltroOverlay')?.classList.remove('show');
  }
  document.getElementById('mefBtnFiltro')?.addEventListener('click', () => {
    cerrarPreguntaExportarFiltro();
    exportarTiendasDetallado(tiendasVisiblesConFiltro());
  });
  document.getElementById('mefBtnTodas')?.addEventListener('click', () => {
    cerrarPreguntaExportarFiltro();
    exportarTiendasDetallado();
  });
  document.getElementById('mefBtnCancelar')?.addEventListener('click', cerrarPreguntaExportarFiltro);

  const buscadorTiendas = document.getElementById('buscadorTiendas');
  if (buscadorTiendas) {
    buscadorTiendas.addEventListener('input', () => {
      filtroTiendasTexto = buscadorTiendas.value;
      renderAcordeonTiendas();
    });
  }

  // ---------------------------------------------------------------
  // Filtro de Gestión de tiendas (botón "Filtros"): Agencias, Tránsito y
  // Tiendas. Se combina con el buscador. Si está activo, al exportar el
  // Detallado se pregunta si exportar con el filtro o todas las tiendas.
  // ---------------------------------------------------------------
  const TRANSITOS_FILTRO = [
    { v: '24', label: '24 h (1 día)' }, { v: '48', label: '48 h (2 días)' }, { v: '72', label: '72 h (3 días)' },
    { v: '96', label: '96 h (4 días)' }, { v: '120', label: '120 h (5 días)' }, { v: '144', label: '144 h (6 días)' }
  ];

  function hayFiltroTiendas() {
    return filtroTiendas.agencias.size > 0 || filtroTiendas.transitos.size > 0 || filtroTiendas.tiendas.size > 0;
  }

  function claveTransito(t) {
    return t.transito_horas == null ? 'SIN' : String(t.transito_horas);
  }

  function tiendaPasaFiltro(t) {
    if (filtroTiendas.agencias.size && !filtroTiendas.agencias.has(t.agencia_id)) return false;
    if (filtroTiendas.transitos.size && !filtroTiendas.transitos.has(claveTransito(t))) return false;
    if (filtroTiendas.tiendas.size && !filtroTiendas.tiendas.has(t.id)) return false;
    return true;
  }

  function etiquetaTransito(v) {
    if (v === 'SIN') return 'Sin indicar';
    return `${v} h`;
  }

  // Textos de los filtros puestos ("Agencias: SEYLOTRANS, DHL"…), para la
  // franja de filtro activo y para la pregunta al exportar.
  function textosFiltroTiendas() {
    const partes = [];
    const nombresLista = (nombres) => nombres.length <= 3 ? nombres.join(', ') : `${nombres.length} seleccionadas`;
    if (filtroTiendas.agencias.size) {
      const nombres = agenciasCache.filter(a => filtroTiendas.agencias.has(a.id)).map(a => a.nombre);
      partes.push(`Agencias: ${nombresLista(nombres)}`);
    }
    if (filtroTiendas.transitos.size) {
      const orden = [...TRANSITOS_FILTRO.map(o => o.v)];
      const vals = [...filtroTiendas.transitos].sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99));
      partes.push(`Tránsito: ${vals.map(etiquetaTransito).join(', ')}`);
    }
    if (filtroTiendas.tiendas.size) {
      const nombres = tiendasGestionCache.filter(t => filtroTiendas.tiendas.has(t.id)).map(t => t.nombre);
      partes.push(`Tiendas: ${nombresLista(nombres)}`);
    }
    return partes;
  }

  // Tiendas que se ven ahora en pantalla (filtro + buscador) y total.
  function tiendasVisiblesConFiltro() {
    const q = normalizarTextoBusqueda(filtroTiendasTexto);
    const idsAgencias = new Set(agenciasActivas().map(a => a.id));
    return tiendasGestionCache.filter(t => t.activo && idsAgencias.has(t.agencia_id) && tiendaCoincideBusqueda(t, q) && tiendaPasaFiltro(t));
  }

  function renderBarraFiltroTiendas() {
    const barra = document.getElementById('barraFiltroTiendas');
    const badge = document.getElementById('filtrosTiendasCount');
    const btn = document.getElementById('btnFiltrosTiendas');
    const numGrupos = [filtroTiendas.agencias, filtroTiendas.transitos, filtroTiendas.tiendas].filter(s => s.size).length;
    if (badge) { badge.textContent = numGrupos; badge.style.display = numGrupos ? '' : 'none'; }
    btn?.classList.toggle('activo', numGrupos > 0);
    if (!barra) return;
    if (!numGrupos) { barra.hidden = true; barra.innerHTML = ''; return; }
    const idsAgencias = new Set(agenciasActivas().map(a => a.id));
    const total = tiendasGestionCache.filter(t => t.activo && idsAgencias.has(t.agencia_id)).length;
    const visibles = tiendasVisiblesConFiltro().length;
    barra.innerHTML = `
      <span>Filtro activo · mostrando <b>${visibles}</b> de ${total} tiendas:</span>
      ${textosFiltroTiendas().map(txt => `<span class="fchip">${escapeHtml(txt)}</span>`).join('')}
      <button type="button" class="link-accion" id="btnQuitarFiltroTiendas">Quitar filtro</button>`;
    barra.hidden = false;
    document.getElementById('btnQuitarFiltroTiendas')?.addEventListener('click', limpiarFiltroTiendas);
  }

  // Rótulo de cada desplegable del panel (Todas / nombre / N seleccionadas).
  function actualizarValoresFiltroTiendas() {
    document.querySelectorAll('#filtrosTiendasPanel .filtro-select').forEach(sel => {
      const grupo = sel.dataset.grupo;
      const set = filtroTiendas[grupo];
      const valor = sel.querySelector('.filtro-select-valor');
      if (!set || !valor) return;
      if (!set.size) {
        valor.textContent = grupo === 'transitos' ? 'Todos' : 'Todas';
        sel.classList.remove('activo');
      } else if (set.size === 1) {
        const cb = sel.querySelector('input[type="checkbox"]:checked');
        valor.textContent = cb ? cb.closest('.filtro-check').textContent.trim() : '1 seleccionada';
        sel.classList.add('activo');
      } else {
        const nombres = [...sel.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.closest('.filtro-check').textContent.trim());
        valor.textContent = nombres.length <= 3 && grupo !== 'tiendas' ? nombres.join(', ') : `${set.size} seleccionad${grupo === 'transitos' ? 'os' : 'as'}`;
        sel.classList.add('activo');
      }
    });
  }

  // Rellena las listas de opciones del panel (se hace al abrirlo, para que
  // salgan las agencias y tiendas al día).
  function rellenarListasFiltroTiendas() {
    const fila = (grupo, valor, texto) => {
      const marcado = filtroTiendas[grupo].has(grupo === 'transitos' ? valor : Number(valor));
      return `<label class="filtro-check"><input type="checkbox" data-grupo="${grupo}" value="${escapeHtml(String(valor))}" ${marcado ? 'checked' : ''}><span>${escapeHtml(texto)}</span></label>`;
    };
    const lAg = document.getElementById('filtroTiendasAgenciasLista');
    if (lAg) lAg.innerHTML = agenciasActivas().map(a => fila('agencias', a.id, a.nombre)).join('');

    const lTr = document.getElementById('filtroTiendasTransitoLista');
    if (lTr) {
      // Además de las opciones fijas, cualquier valor raro que tenga alguna tienda (p. ej. 12 h).
      const extra = [...new Set(tiendasGestionCache.filter(t => t.activo && t.transito_horas != null).map(t => String(t.transito_horas)))]
        .filter(v => !TRANSITOS_FILTRO.some(o => o.v === v))
        .sort((a, b) => Number(a) - Number(b));
      lTr.innerHTML = [...TRANSITOS_FILTRO, ...extra.map(v => ({ v, label: `${v} h` })), { v: 'SIN', label: 'Sin indicar' }]
        .map(o => fila('transitos', o.v, o.label)).join('');
    }

    const lTd = document.getElementById('filtroTiendasTiendasLista');
    if (lTd) {
      const tds = tiendasGestionCache.filter(t => t.activo)
        .slice()
        .sort((a, b) => (Number(normalizarNumeroTienda(a.numero_tienda)) || 1e9) - (Number(normalizarNumeroTienda(b.numero_tienda)) || 1e9) || a.nombre.localeCompare(b.nombre));
      lTd.innerHTML = tds.map(t => fila('tiendas', t.id, `${t.numero_tienda ? t.numero_tienda + ' · ' : ''}${t.nombre}`)).join('');
    }

    document.querySelectorAll('#filtrosTiendasPanel .filtro-select-search input').forEach(inp => { inp.value = ''; });
    document.querySelectorAll('#filtrosTiendasPanel .filtro-select-lista input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const set = filtroTiendas[cb.dataset.grupo];
        const v = cb.dataset.grupo === 'transitos' ? cb.value : Number(cb.value);
        if (cb.checked) set.add(v); else set.delete(v);
        actualizarValoresFiltroTiendas();
        renderAcordeonTiendas();
      });
    });
    actualizarValoresFiltroTiendas();
  }

  function limpiarFiltroTiendas() {
    filtroTiendas.agencias.clear();
    filtroTiendas.transitos.clear();
    filtroTiendas.tiendas.clear();
    document.querySelectorAll('#filtrosTiendasPanel .filtro-select-lista input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    actualizarValoresFiltroTiendas();
    renderAcordeonTiendas();
  }

  const btnFiltrosTiendas = document.getElementById('btnFiltrosTiendas');
  const filtrosTiendasPanel = document.getElementById('filtrosTiendasPanel');
  function cerrarFiltrosTiendasPanel() {
    filtrosTiendasPanel?.classList.remove('show');
    btnFiltrosTiendas?.classList.remove('open');
    filtrosTiendasPanel?.querySelectorAll('.filtro-select.open').forEach(s => s.classList.remove('open'));
  }
  if (btnFiltrosTiendas && filtrosTiendasPanel) {
    btnFiltrosTiendas.addEventListener('click', (e) => {
      e.stopPropagation();
      if (filtrosTiendasPanel.classList.contains('show')) { cerrarFiltrosTiendasPanel(); return; }
      exportTiendasWrap?.classList.remove('open');
      rellenarListasFiltroTiendas();
      filtrosTiendasPanel.classList.add('show');
      btnFiltrosTiendas.classList.add('open');
    });
    filtrosTiendasPanel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', (e) => {
      if (!filtrosTiendasPanel.contains(e.target) && !btnFiltrosTiendas.contains(e.target)) cerrarFiltrosTiendasPanel();
    });
    document.getElementById('btnCerrarFiltrosTiendas')?.addEventListener('click', cerrarFiltrosTiendasPanel);
    document.getElementById('btnLimpiarFiltrosTiendas')?.addEventListener('click', limpiarFiltroTiendas);
  }

  // ---------------------------------------------------------------
  // Activar una tienda en apertura: pide la fecha de apertura real. Desde
  // ese día sale en el Informe del día y cuenta en el Reporte mensual
  // (creado_en pasa a ser ese día, que es lo que mira el resto de la app).
  // También sirve para cambiar la fecha si se activó con una fecha futura.
  // ---------------------------------------------------------------
  let activarTiendaId = null;

  // desdeEditar: se pulsó Activar dentro de Editar tienda (esa ventana sigue abierta debajo).
  async function abrirModalActivarTienda(tiendaId, { desdeEditar = false } = {}) {
    const t = tiendasGestionCache.find(x => x.id === tiendaId);
    const overlay = document.getElementById('modalActivarTiendaOverlay');
    if (!t || !overlay) return;
    // Para activarla tiene que tener la ficha completa (hora, palets…), igual
    // que cualquier tienda normal: si falta algo, se abre la ficha.
    const faltan = t.en_apertura ? camposObligatoriosQueFaltan({
      ...t, limite_palets: t.limite_palets != null ? String(t.limite_palets) : ''
    }, false) : [];
    if (faltan.length) {
      // Aviso en rojo por encima (como el de "Sin permiso"), sin cerrar la
      // ficha, para poder completarla directamente.
      await modalAlert(`Antes de activar "${t.nombre}" hay que completar su ficha.\nFalta: ${faltan.join(', ')}.`, { titulo: 'Ficha incompleta', icono: '⛔', danger: true });
      if (!desdeEditar) abrirModalEditarTienda(tiendaId);
      return;
    }
    if (desdeEditar) cerrarModalEditarTienda();
    activarTiendaId = tiendaId;
    const hoyISO = fechaLocalISO(new Date());
    const prevista = t.en_apertura ? t.apertura_prevista : t.fecha_apertura;
    document.getElementById('matTitulo').textContent = t.en_apertura ? '🚀 Activar tienda' : '📅 Cambiar fecha de apertura';
    document.getElementById('matMensaje').textContent = t.en_apertura
      ? `"${t.nombre}" está en apertura${t.apertura_prevista ? ` (prevista el ${fechaISOaCorta(t.apertura_prevista)})` : ''}. Indica el día que abre: desde esa fecha saldrá en el Informe del día y empezará a contar en el Reporte mensual.`
      : `"${t.nombre}" se activó para abrir el ${fechaISOaCorta(t.fecha_apertura)}. Puedes cambiar ese día mientras no haya llegado.`;
    document.getElementById('matFecha').value = prevista || hoyISO;
    document.getElementById('matBtnGuardar').textContent = t.en_apertura ? '🚀 Activar tienda' : 'Guardar fecha';
    const err = document.getElementById('matError');
    err.style.display = 'none';
    err.textContent = '';
    overlay.classList.add('show');
  }

  function cerrarModalActivarTienda() {
    document.getElementById('modalActivarTiendaOverlay')?.classList.remove('show');
    activarTiendaId = null;
  }

  async function guardarModalActivarTienda() {
    if (activarTiendaId == null) return;
    const t = tiendasGestionCache.find(x => x.id === activarTiendaId);
    const fecha = document.getElementById('matFecha').value;
    const err = document.getElementById('matError');
    if (!fecha) {
      err.textContent = 'Indica la fecha de apertura.';
      err.style.display = 'block';
      return;
    }
    const eraApertura = !!t?.en_apertura;
    const btn = document.getElementById('matBtnGuardar');
    botonGuardando(btn, true);
    try {
      // creado_en a mediodía UTC de ese día: en hora de Madrid siempre cae
      // en el mismo día (sea horario de verano o de invierno).
      const { error } = await sb.from('tiendas').update({
        en_apertura: false,
        fecha_apertura: fecha,
        creado_en: `${fecha}T12:00:00Z`
      }).eq('id', activarTiendaId);
      if (error) throw error;
      if (typeof registrarAccion === 'function') {
        registrarAccion('tiendas', eraApertura ? 'Activar tienda (apertura)' : 'Cambiar fecha de apertura', `${t?.nombre || ''} · abre el ${fechaISOaCorta(fecha)}`, null, { tiendaId: activarTiendaId });
      }
      cerrarModalActivarTienda();
      if (typeof mostrarToast === 'function') mostrarToast(`Tienda "${t?.nombre || ''}" activada desde el ${fechaISOaCorta(fecha)}`, { posicion: 'abajo' });
      cargarAgenciasYTiendas();
    } catch (e) {
      console.error('Error activando la tienda:', e);
      err.textContent = 'No se pudo activar la tienda.';
      err.style.display = 'block';
    } finally {
      botonGuardando(btn, false);
    }
  }

  // ---------------------------------------------------------------
  // Historial de cambios de una tienda (botón 🕓 de Editar tienda): las
  // acciones de Auditoría (categoría "tiendas") de esa tienda, con la misma
  // lupa Antes/Después. Visible para todos, sin el permiso de Auditoría.
  // Se buscan por registro_acciones.tienda_id (desde octubre de 2026 cada
  // acción de tiendas guarda el id; las antiguas se rellenaron a partir del
  // nombre y de los renombrados). Lo que pudiera quedar sin id se busca por
  // el nombre actual al principio del detalle ("NOMBRE", "NOMBRE: A → B"…).
  // ---------------------------------------------------------------
  let historialTiendaCache = [];

  function detalleEsDeTienda(detalle, nombre) {
    if (!detalle || !nombre) return false;
    const d = detalle.toUpperCase(), n = nombre.toUpperCase();
    if (d === n) return true;
    if (!d.startsWith(n)) return false;
    return /^(:| ·| desde | \(| en | abre )/i.test(d.slice(n.length));
  }

  async function abrirHistorialTienda(tiendaId) {
    const t = tiendasGestionCache.find(x => x.id === tiendaId);
    const overlay = document.getElementById('modalHistorialTiendaOverlay');
    if (!t || !overlay) return;
    const cuerpo = document.getElementById('htCuerpo');
    document.getElementById('htTitulo').textContent = `🕓 Historial de cambios · ${t.nombre}`;
    document.getElementById('htSub').textContent = 'Altas, ediciones, bajas y cambios de agencia de esta tienda, de más reciente a más antiguo.';
    cuerpo.innerHTML = '<div class="lista-contador-vacia">Cargando…</div>';
    overlay.classList.add('show');
    try {
      // 1) Todo lo registrado con el id de la tienda (aunque luego cambiara
      //    de nombre). 2) Por si queda algún registro antiguo sin id, los de
      //    su nombre actual sin id. % _ y * son comodines en ilike: se cambian
      //    por "_" y luego detalleEsDeTienda() compara el nombre exacto.
      const nombreSeguro = t.nombre.replace(/[%_*]/g, '_');
      const campos = 'id, usuario, categoria, accion, detalle, cambios, creado_en';
      const [porId, porNombre] = await Promise.all([
        sb.from('registro_acciones').select(campos)
          .eq('categoria', 'tiendas').eq('tienda_id', t.id)
          .order('creado_en', { ascending: false }).limit(500),
        sb.from('registro_acciones').select(campos)
          .eq('categoria', 'tiendas').is('tienda_id', null).ilike('detalle', `${nombreSeguro}%`)
          .order('creado_en', { ascending: false }).limit(300)
      ]);
      if (porId.error) throw porId.error;
      if (porNombre.error) throw porNombre.error;
      const vistos = new Set();
      historialTiendaCache = [...(porId.data || []), ...(porNombre.data || []).filter(a => detalleEsDeTienda(a.detalle, t.nombre))]
        .filter(a => !vistos.has(a.id) && vistos.add(a.id))
        .sort((x, y) => (x.creado_en < y.creado_en ? 1 : -1));
      const fecha = (iso) => typeof formatearFechaHoraCorta === 'function'
        ? formatearFechaHoraCorta(new Date(iso)) : new Date(iso).toLocaleString('es-ES');
      cuerpo.innerHTML = historialTiendaCache.length
        ? `<table class="tabla-lista-contador tabla-historial-tienda">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th></th></tr></thead>
            <tbody>${historialTiendaCache.map(a => `
              <tr>
                <td class="suave" style="white-space:nowrap;">${escapeHtml(fecha(a.creado_en))}</td>
                <td class="nombre">${escapeHtml(a.usuario || '—')}</td>
                <td>${escapeHtml(a.accion || '—')}</td>
                <td class="suave">${escapeHtml(a.detalle || '—')}</td>
                <td style="text-align:right;">${Array.isArray(a.cambios) && a.cambios.length
                  ? `<button type="button" class="aud-btn-lupa" data-ht-id="${a.id}" title="Ver qué se modificó" aria-label="Ver qué se modificó">&#128269;</button>` : ''}</td>
              </tr>`).join('')}</tbody>
          </table>`
        : '<div class="lista-contador-vacia">No hay cambios registrados para esta tienda.</div>';
    } catch (err) {
      console.error('Error cargando el historial de la tienda:', err);
      cuerpo.innerHTML = '<div class="lista-contador-vacia" style="color:var(--grave);">No se pudo cargar el historial.</div>';
    }
  }

  // Lupa: misma ventana Campo / Antes / Después que Auditoría.
  function abrirDetalleHistorialTienda(id) {
    const a = historialTiendaCache.find(x => String(x.id) === String(id));
    if (!a || typeof asegurarModalDetalleAuditoria !== 'function') return;
    const overlay = asegurarModalDetalleAuditoria();
    // Que quede por encima de la ventana de historial.
    document.body.appendChild(overlay);
    overlay.querySelector('#audDetalleTitulo').textContent = `${a.accion || 'Detalle'}${a.detalle ? ' · ' + a.detalle : ''}`;
    overlay.querySelector('#audDetalleSub').textContent =
      `${a.usuario || '—'} · ${typeof formatearFechaHoraCorta === 'function' ? formatearFechaHoraCorta(new Date(a.creado_en)) : a.creado_en}`;
    overlay.querySelector('#audDetalleBody').innerHTML = a.cambios.map(c => `
      <tr>
        <td>${escapeHtml(c.campo || '—')}</td>
        <td><span class="aud-valor-antes">${escapeHtml(c.antes ?? '—')}</span></td>
        <td><span class="aud-valor-despues">${escapeHtml(c.despues ?? '—')}</span></td>
      </tr>`).join('');
    overlay.classList.add('show');
  }

  document.getElementById('metBtnHistorial')?.addEventListener('click', () => {
    if (editarTiendaId != null) abrirHistorialTienda(editarTiendaId);
  });
  document.getElementById('btnCerrarHistorialTienda')?.addEventListener('click', () =>
    document.getElementById('modalHistorialTiendaOverlay')?.classList.remove('show'));
  document.getElementById('htCuerpo')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ht-id]');
    if (btn) abrirDetalleHistorialTienda(btn.dataset.htId);
  });

  document.getElementById('matBtnCancelar')?.addEventListener('click', cerrarModalActivarTienda);
  document.getElementById('matBtnGuardar')?.addEventListener('click', guardarModalActivarTienda);
  document.getElementById('metBtnActivar')?.addEventListener('click', () => {
    if (editarTiendaId != null) abrirModalActivarTienda(editarTiendaId, { desdeEditar: true });
  });

  // ---------------------------------------------------------------
  // Tarjeta "Estado de la tienda" (tienda ya abierta): Activa / De baja,
  // con el botón de baja/alta temporal (antes ⏸️/▶️ en la fila de la lista).
  function pintarTarjetaActiva(t, enAperturaAhora) {
    const titulo = document.getElementById('metEstadoTitulo');
    const sub = document.getElementById('metEstadoSub');
    if (enAperturaAhora) {
      if (titulo) titulo.textContent = '🚧 Estado de la tienda';
      if (sub) sub.textContent = 'Aún no ha abierto.';
      return;
    }
    const card = document.getElementById('metCardActiva');
    const badge = document.getElementById('metActivaBadge');
    const tit = document.getElementById('metActivaTitulo');
    const res = document.getElementById('metActivaResumen');
    const info = document.getElementById('metBajaInfo');
    const btn = document.getElementById('metBtnBaja');
    const hint = document.getElementById('metBajaHint');
    if (!card) return;
    const p = periodoBajaActualDeTienda(t.id);
    if (titulo) titulo.textContent = p ? '⏸️ Estado de la tienda' : '🏬 Estado de la tienda';
    if (p) {
      const hoyISO = fechaLocalISO(new Date());
      card.className = 'ea-card bj on';
      badge.textContent = '⏸';
      badge.className = 'marca-badge marca-baja';
      tit.textContent = p.fecha_desde > hoyISO ? 'Baja programada' : 'De baja';
      res.textContent = p.fecha_reactivacion ? `Vuelve el ${fechaISOaCorta(p.fecha_reactivacion)}` : `Desde ${fechaISOaCorta(p.fecha_desde)}`;
      if (sub) sub.textContent = 'De baja temporal: no recibe mercancía.';
      info.style.display = '';
      info.textContent = `Sin recibir mercancía desde el ${fechaISOaCorta(p.fecha_desde)}${p.fecha_reactivacion ? ` hasta el ${fechaISOaCorta(p.fecha_reactivacion)}` : ''}${p.motivo ? ` · Motivo: ${p.motivo}` : ''}.`;
      btn.className = 'btn btn-alta-tienda';
      btn.textContent = p.fecha_reactivacion ? '📅 Cambiar fecha de alta' : '▶️ Dar de alta';
      btn.dataset.modo = 'alta';
      hint.textContent = 'Desde el día que indiques vuelve a recibir mercancía. Si la baja fue un error, ahí mismo puedes anularla.';
    } else {
      card.className = 'ea-card act on';
      badge.textContent = '✓';
      badge.className = 'marca-badge marca-activa';
      tit.textContent = 'Activa';
      res.textContent = t.fecha_apertura ? `Abrió el ${fechaISOaCorta(t.fecha_apertura)}` : '';
      if (sub) sub.textContent = 'Abierta y recibiendo mercancía.';
      info.style.display = 'none';
      btn.className = 'btn btn-baja-tienda';
      btn.textContent = '⏸️ Dar de baja temporal';
      btn.dataset.modo = 'baja';
      hint.textContent = 'Deja de recibir mercancía por un tiempo (obras, cierre temporal…).';
    }
  }
  document.getElementById('metBtnBaja')?.addEventListener('click', (e) => {
    if (editarTiendaId == null) return;
    abrirModalBajaTienda(editarTiendaId, e.currentTarget.dataset.modo === 'alta' ? 'alta' : 'baja');
  });

  // Tras dar de baja / alta con el modal de Editar tienda abierto detrás.
  function refrescarEstadoModalEditar() {
    if (editarTiendaId == null) return;
    const t = tiendasGestionCache.find(x => x.id === editarTiendaId);
    if (t) {
      pintarTarjetaActiva(t, tiendaEnApertura(t));
      comprobarEstadoSalidas(t); // al pasar a baja/alta cambia si se puede quitar de SALIDAS
    }
  }

  // ---------------------------------------------------------------
  // SALIDAS: dentro de la tarjeta de estado. La línea de estado pregunta DE
  // VERDAD a SALIDAS (RPC salidas_tienda_cargada, solo lectura) si tiene la
  // tienda; el botón la vuelca o la quita:
  //   · en apertura -> tiendas.volcar_salidas (true = mandarla ya)
  //   · abierta     -> tiendas.excluir_salidas (true = quitarla de SALIDAS)
  // La base de datos de GIDT avisa a SALIDAS sola al cambiar esos campos
  // (_salidas_trg_tiendas); además se pide un reenvío (salidas_reenviar_tienda)
  // por si ya tenía ese valor y no había cambio que avisar.
  const SALIDAS_API_URL = 'https://plqcnqjlxfxjvxyktqbx.supabase.co/rest/v1/rpc/salidas_tienda_cargada';
  const SALIDAS_API_KEY = 'sb_publishable_O7FxndlZ08NVAbZeGx6jYw_HKdqLqFr';
  let comprobacionSalidasId = 0;
  let salidasCargadaActual = null; // true / false / null (sin comprobar o error)

  function pintarBloqueSalidas(estado, texto) {
    const linea = document.getElementById('metSalidasEstado');
    const btn = document.getElementById('metBtnVolcarSalidas');
    if (!linea || !btn) return;
    linea.className = 'ea-hint salidas-estado ' + estado;
    linea.innerHTML = texto + (estado === 'comprobando' ? '' : ' · <a href="#" id="metSalidasRecomprobar">volver a comprobar</a>');
    document.getElementById('metSalidasRecomprobar')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const t = tiendasGestionCache.find(x => x.id === editarTiendaId);
      if (t) comprobarEstadoSalidas(t);
    });
    // "Quitar de SALIDAS" solo en apertura o de baja; con la tienda activa
    // no se ofrece. "Volcar" sí sale siempre que no esté (para no dejar una
    // tienda abierta fuera de SALIDAS sin forma de volver a mandarla).
    const t = tiendasGestionCache.find(x => x.id === editarTiendaId);
    const puedeQuitar = !!t && (tiendaEnApertura(t) || !!periodoBajaActualDeTienda(t.id));
    const mostrar = estado === 'no' || (estado === 'ok' && puedeQuitar);
    btn.style.display = mostrar ? '' : 'none';
    btn.className = 'btn btn-volcar-salidas' + (estado === 'ok' ? ' quitar' : '');
    btn.textContent = estado === 'ok' ? '✕ Quitar de SALIDAS' : '📤 Volcar a SALIDAS';
  }

  async function comprobarEstadoSalidas(t) {
    if (!t) return;
    const miId = ++comprobacionSalidasId;
    salidasCargadaActual = null;
    if (!t.numero_tienda || !String(t.numero_tienda).trim()) {
      salidasCargadaActual = false;
      pintarBloqueSalidas('no', '✗ No está en SALIDAS (la tienda no tiene número)');
      return;
    }
    pintarBloqueSalidas('comprobando', 'Comprobando SALIDAS…');
    try {
      const resp = await fetch(SALIDAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SALIDAS_API_KEY },
        body: JSON.stringify({ p_numero: String(t.numero_tienda) })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const r = await resp.json();
      if (miId !== comprobacionSalidasId) return;
      salidasCargadaActual = !!(r && r.cargada);
      if (salidasCargadaActual) {
        pintarBloqueSalidas('ok', r.rutas > 0
          ? `✓ Está en SALIDAS · en ${r.rutas} ruta${r.rutas === 1 ? '' : 's'}`
          : '✓ Está en SALIDAS · todavía en ninguna ruta');
      } else {
        pintarBloqueSalidas('no', '✗ No está en SALIDAS');
      }
    } catch (e) {
      if (miId !== comprobacionSalidasId) return;
      console.error('No se pudo comprobar SALIDAS:', e);
      pintarBloqueSalidas('err', '⚠ No se ha podido comprobar SALIDAS');
    }
  }

  document.getElementById('metBtnVolcarSalidas')?.addEventListener('click', async () => {
    if (editarTiendaId == null || salidasCargadaActual == null) return;
    const t = tiendasGestionCache.find(x => x.id === editarTiendaId);
    if (!t) return;
    const quitar = salidasCargadaActual === true;
    const enApertura = !!t.en_apertura;
    if (!quitar && (!t.numero_tienda || !String(t.numero_tienda).trim())) {
      const err = document.getElementById('metError');
      if (err) { err.textContent = 'Para volcarla a SALIDAS la tienda necesita número de tienda (guárdalo antes).'; err.style.display = 'block'; }
      return;
    }
    if (quitar) {
      const ok = await modalConfirm(
        `¿Quitar "${t.nombre}" de SALIDAS? Saldrá de todas sus rutas y de Configuración tiendas de SALIDAS (los conteos ya hechos no se pierden). Si más adelante la vuelcas otra vez, habrá que volver a añadirla a sus rutas en SALIDAS.`,
        { titulo: 'Quitar de SALIDAS', danger: true, textoOk: 'Quitar de SALIDAS' }
      );
      if (!ok) return;
    }
    const cambios = enApertura ? { volcar_salidas: !quitar } : { excluir_salidas: quitar };
    const btn = document.getElementById('metBtnVolcarSalidas');
    btn.disabled = true;
    try {
      const { error } = await sb.from('tiendas').update(cambios).eq('id', t.id);
      if (error) throw error;
      Object.assign(t, cambios);
      // Reenvío por si el campo ya tenía ese valor (no habría "cambio" que avisar).
      try { await sb.rpc('salidas_reenviar_tienda', { p_id: t.id }); } catch (e2) { console.warn('Reenvío a SALIDAS:', e2); }
      pintarBloqueSalidas('comprobando', quitar ? 'Quitando de SALIDAS…' : 'Volcando a SALIDAS…');
      setTimeout(() => comprobarEstadoSalidas(t), 2500); // da tiempo a que llegue a SALIDAS
      if (typeof registrarAccion === 'function') {
        registrarAccion('tiendas', quitar ? 'Quitar tienda de SALIDAS' : 'Volcar tienda a SALIDAS', t.nombre, null, { tiendaId: t.id });
      }
      if (typeof mostrarToast === 'function') {
        mostrarToast(quitar ? `"${t.nombre}" quitada de SALIDAS` : `"${t.nombre}" volcada a SALIDAS`, { posicion: 'abajo' });
      }
    } catch (e) {
      console.error('Error al volcar/quitar la tienda en SALIDAS:', e);
      const err = document.getElementById('metError');
      if (err) { err.textContent = 'No se pudo cambiar la tienda en SALIDAS.'; err.style.display = 'block'; }
    } finally {
      btn.disabled = false;
    }
  });

  // Tarjeta "En apertura" de Nueva tienda: interruptor + fecha prevista.
  function sincronizarTarjetaApertura(prefijo) {
    const chk = document.getElementById(prefijo + 'Apertura');
    const card = document.getElementById(prefijo + 'CardApertura');
    const campos = document.getElementById(prefijo + 'AperturaCampos');
    const res = document.getElementById(prefijo + 'AperturaResumen');
    const fecha = document.getElementById(prefijo + 'AperturaPrevista')?.value;
    if (!card) return;
    const on = chk ? chk.checked : true;
    card.classList.toggle('on', on);
    if (campos) campos.style.display = on ? '' : 'none';
    if (res) res.textContent = on ? (fecha ? `Prevista ${fechaISOaCorta(fecha)}` : 'Sin fecha prevista') : 'Desactivado';
    if (prefijo === 'nt') {
      const btn = document.getElementById('btnGuardarTienda');
      if (btn && !btn.disabled) btn.innerHTML = on ? '💾 Crear tienda en apertura' : '💾 Crear tienda';
      document.querySelectorAll('#nuevaTiendaModalOverlay .tf-req-apertura').forEach(el => { el.style.visibility = on ? 'hidden' : ''; });
    }
  }
  document.getElementById('ntApertura')?.addEventListener('change', () => sincronizarTarjetaApertura('nt'));
  ['ntAperturaPrevista', 'metAperturaPrevista'].forEach(id => {
    const el = document.getElementById(id);
    const prefijo = id.slice(0, id.indexOf('Apertura'));
    el?.addEventListener('change', () => sincronizarTarjetaApertura(prefijo));
    el?.addEventListener('input', () => sincronizarTarjetaApertura(prefijo));
  });

  // ---------------------------------------------------------------
  // Modal "Horario semanal": permite poner, por tienda, una hora
  // distinta para días concretos de la semana (p. ej. Martes y
  // Viernes). Se guarda en tiendas.horario_semana y a partir de ahí
  // lo usa tiendaEfectivaHoy() (utilidades-informe.js) para que el
  // informe de cada día salga con la hora correcta automáticamente.
  // ---------------------------------------------------------------
  let horarioSemanaTiendaId = null;

  function abrirModalHorarioSemana(tiendaId) {
    const t = tiendasGestionCache.find(x => x.id === tiendaId);
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
    const t = tiendasGestionCache.find(x => x.id === horarioSemanaTiendaId);
    const mapa = {};
    document.querySelectorAll('#modalHorarioDias .mh-hora').forEach(input => {
      if (input.value) mapa[input.dataset.dia] = input.value;
    });
    try {
      const { error } = await sb.from('tiendas')
        .update({ horario_semana: Object.keys(mapa).length ? mapa : null })
        .eq('id', horarioSemanaTiendaId);
      if (error) throw error;
      if (typeof registrarAccion === 'function') {
        const mapaAntes = t?.horario_semana || {};
        const campos = DIAS_SEMANA_ISO.map(d => ({ clave: String(d.iso), etiqueta: d.label, formato: audHora }));
        const cambios = typeof auditoriaCalcularCambios === 'function'
          ? auditoriaCalcularCambios(campos, mapaAntes, mapa) : null;
        registrarAccion('tiendas', 'Configurar horario semanal', t?.nombre || '', cambios, { tiendaId: horarioSemanaTiendaId });
      }
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
