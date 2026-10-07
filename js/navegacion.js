// ---------------------------------------------------------------
// Navegación por pestañas + submenú desplegable de Configuración
// ---------------------------------------------------------------

// Borde derecho REALMENTE visible del área de contenido, en coordenadas
// de viewport. Usado por los paneles de filtros/exportar/utilidades para
// no salirse por la derecha (y provocar scroll lateral de toda la
// página). No se puede usar document.documentElement.clientWidth para
// esto: el scroll vertical de la app no lo lleva <html>, lo lleva
// <main> (ver CSS "main{ overflow-y:auto }"), así que cuando <main>
// tiene muchas filas y saca su propia barra de scroll, el ancho de
// <html> no la descuenta y esos paneles calculaban de más.
function bordeDerechoVisible() {
  const main = document.querySelector('main');
  if (!main) return document.documentElement.clientWidth;
  const rect = main.getBoundingClientRect();
  return rect.left + main.clientWidth;
}

// Botón 🔄 "Recargar" de las páginas de Configuración: gira el icono
// mientras carga (mínimo una vuelta visible) y bloquea el doble clic.
async function recargarConGiro(btn, ...cargas) {
  if (!btn || btn.disabled) return;
  const icono = btn.querySelector('.ps-refresh-icon');
  const inicio = Date.now();
  btn.disabled = true;
  icono?.classList.add('ps-girando');
  try {
    await Promise.all(cargas.map(fn => typeof fn === 'function' ? fn() : null));
  } finally {
    const restante = 800 - (Date.now() - inicio);
    if (restante > 0) await new Promise(r => setTimeout(r, restante));
    btn.disabled = false;
    icono?.classList.remove('ps-girando');
  }
}

  function activarVista(nombreVista) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + nombreVista).classList.add('active');

    if (nombreVista.startsWith('config-')) {
      document.getElementById('btnConfigDropdown').classList.add('active');
    } else if (nombreVista.startsWith('analisis-')) {
      document.getElementById('btnAnalisisDropdown').classList.add('active');
    } else if (nombreVista === 'incidencias' || nombreVista === 'historial-informes') {
      document.getElementById('btnInformesDropdown').classList.add('active');
    } else if (nombreVista === 'siniestros' || nombreVista === 'historial-siniestros') {
      document.getElementById('btnSiniestrosDropdown').classList.add('active');
    } else {
      document.querySelector('.tab-btn[data-view="' + nombreVista + '"]')?.classList.add('active');
    }

    // Al cambiar de pestaña se vuelve a comprobar el banner de informes
    // enviados con incidencias sin revisar (p. ej. tras reclasificarlas).
    if (typeof actualizarAvisoInformesSinRevisar === 'function') actualizarAvisoInformesSinRevisar();
  }

  document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (typeof confirmarDescartarEdicionHistorial === 'function' && !(await confirmarDescartarEdicionHistorial())) return;
      if (typeof confirmarDescartarEdicionGravedadMotivos === 'function' && !(await confirmarDescartarEdicionGravedadMotivos())) return;
      activarVista(btn.dataset.view);
      if (btn.dataset.view === 'inicio') {
        if (typeof cargarKPIs === 'function') cargarKPIs();
        if (typeof cargarInformeHoy === 'function') cargarInformeHoy();
      }
    });
  });

  // ---------------------------------------------------------------
  // Dropdowns de la barra de navegación (Informes / Siniestros / Configuración)
  // Sistema genérico: al abrir uno se cierran los demás.
  // ---------------------------------------------------------------
  const dropdownsNav = [
    { btn: document.getElementById('btnInformesDropdown'),  panel: document.getElementById('informesDropdown') },
    { btn: document.getElementById('btnSiniestrosDropdown'), panel: document.getElementById('siniestrosDropdown') },
    { btn: document.getElementById('btnConfigDropdown'),     panel: document.getElementById('configDropdown') },
    { btn: document.getElementById('btnAnalisisDropdown'),   panel: document.getElementById('analisisDropdown') }
  ];

  function cerrarTodosLosDropdowns(excepto = null) {
    dropdownsNav.forEach(d => {
      if (d.panel === excepto) return;
      d.panel.classList.remove('open');
      d.btn.classList.remove('open');
    });
  }

  dropdownsNav.forEach(({ btn, panel }) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const yaAbierto = panel.classList.contains('open');
      cerrarTodosLosDropdowns();
      if (!yaAbierto) {
        panel.classList.add('open');
        btn.classList.add('open');
        const rectBtn = btn.getBoundingClientRect();
        const rectNav = document.querySelector('nav.tabs').getBoundingClientRect();
        panel.style.left = (rectBtn.left - rectNav.left) + 'px';
      }
    });

    panel.querySelectorAll('button[data-view]').forEach(item => {
      item.addEventListener('click', async () => {
        if (typeof confirmarDescartarEdicionHistorial === 'function' && !(await confirmarDescartarEdicionHistorial())) return;
        if (typeof confirmarDescartarEdicionGravedadMotivos === 'function' && !(await confirmarDescartarEdicionGravedadMotivos())) return;
        activarVista(item.dataset.view);
        cerrarTodosLosDropdowns();
        if (item.dataset.view === 'incidencias' && informeHoyCache !== undefined) renderVistaIncidencias();
        if (item.dataset.view === 'historial-informes') renderVistaHistorialInformes();
        if (item.dataset.view === 'historial-siniestros') renderVistaHistorialSiniestros();
        if (item.dataset.view === 'siniestros') renderVistaSiniestros();
        if (item.dataset.view === 'analisis-ranking') renderVistaAnalisisRanking();
        if (item.dataset.view === 'analisis-reportes-mensuales') renderVistaReportesMensuales();
        if (item.dataset.view === 'analisis-historico-agencias' && typeof renderVistaHistoricoAgencias === 'function') renderVistaHistoricoAgencias();
        if (item.dataset.view === 'config-auditoria' && typeof prepararVistaAuditoria === 'function') prepararVistaAuditoria();
      });
    });
  });

  document.addEventListener('click', (e) => {
    const dentroDeAlguno = dropdownsNav.some(d => d.panel.contains(e.target) || d.btn === e.target || d.btn.contains(e.target));
    if (!dentroDeAlguno) cerrarTodosLosDropdowns();
  });

  // ---------------------------------------------------------------
  // Fecha de hoy (cabecera Inicio)
  // ---------------------------------------------------------------
   const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  let hoy = new Date();
  // Devuelve YYYY-MM-DD según la fecha LOCAL del dispositivo, no UTC.
  // (toISOString() convierte a UTC, lo que da la fecha equivocada de
  // madrugada en horario de verano/invierno español).
  function fechaLocalISO(fecha) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Formatea una fecha (objeto Date) como DD/MM/AAAA, siempre con ceros delante
  function formatearFechaCorta(fecha) {
    const d = String(fecha.getDate()).padStart(2, '0');
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const y = fecha.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Igual, pero con hora HH:MM
  function formatearFechaHoraCorta(fecha) {
    const h = String(fecha.getHours()).padStart(2, '0');
    const min = String(fecha.getMinutes()).padStart(2, '0');
    return `${formatearFechaCorta(fecha)} ${h}:${min}`;
  }

  // (Inicio ya no tiene saludo ni fecha: la fecha y la hora van ahora en
  // el reloj de la cabecera. Se deja por si vuelve a existir el elemento.)
  function actualizarFechaHoyTexto() {
    const el = document.getElementById('fechaHoyTexto');
    if (el) el.textContent = dias[hoy.getDay()] + ", " + formatearFechaCorta(hoy);
  }
  actualizarFechaHoyTexto();

  // ---------------------------------------------------------------
  // Carga inicial: KPIs desde Supabase (smoke test de conexión)
  // ---------------------------------------------------------------
  async function cargarKPIs() {
    const statusEl = document.getElementById('statusText');
    // Inicio ya no muestra "Agencias activas" / "Tiendas activas" (las
    // tarjetas nuevas las pinta inicio-panel.js); aquí solo queda la
    // comprobación de conexión con Supabase (punto verde de la cabecera).
    try {
      const { error: eConexion } = await sb.from('agencias').select('*', { count: 'exact', head: true }).eq('activo', true);
      if (eConexion) throw eConexion;

      // Estos KPIs los pintan actualizarKpiIncidencias() y
      // actualizarKpiSiniestrosDesdeDB() (las llama cargarInformeHoy, que se
      // ejecuta a la vez que esta función). Aquí solo se pone un "0" si
      // todavía no hay ningún valor: si esta función acaba DESPUÉS de
      // cargarInformeHoy, no debe pisar el número real con un 0.
      ['kpiIncidenciasHoy', 'kpiSiniestrosPend'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.textContent.trim() === '—') el.textContent = '0';
      });

      statusEl.textContent = 'Conectado a Supabase';
      document.getElementById('statusWrap').title = 'Conectado a Supabase';
    } catch (err) {
      console.error('Error cargando KPIs:', err);
      statusEl.textContent = 'Error de conexión';
      document.getElementById('statusWrap').title = 'Error de conexión';
    }
    cargarPendienteAtencion();
    if (typeof actualizarAvisoInformesSinRevisar === 'function') actualizarAvisoInformesSinRevisar();
    // Tarjetas, gráficas y actividad de Inicio (js/inicio-panel.js)
    if (typeof inicioRefrescar === 'function') inicioRefrescar();
  }

  // ---------------------------------------------------------------
  // "Pendiente de atención" (pantalla de Inicio): reúne, de varias
  // fuentes, lo que necesita algo de ti ahora mismo, con acceso
  // directo a la pantalla correspondiente.
  // ---------------------------------------------------------------
  // Antigüedad de una tarea pendiente a partir de la fecha más antigua del
  // grupo (YYYY-MM-DD o timestamp): "desde hoy", "hace 3 días"… Con más de
  // un elemento dice "el más antiguo hace…", para que se vea qué urge.
  function edadTareaPendiente(lista, campo, { prefijo = '' } = {}) {
    const fechas = lista.map(s => s[campo]).filter(Boolean).map(v => String(v).length === 10 ? new Date(v + 'T00:00:00') : new Date(v)).filter(d => !isNaN(d));
    if (!fechas.length) return '';
    const masAntigua = new Date(Math.min(...fechas.map(d => d.getTime())));
    const ini = new Date(masAntigua.getFullYear(), masAntigua.getMonth(), masAntigua.getDate());
    const hoyD = new Date(); hoyD.setHours(0, 0, 0, 0);
    const dias = Math.max(0, Math.round((hoyD - ini) / 86400000));
    const cuando = dias === 0 ? 'desde hoy' : (dias === 1 ? 'hace 1 día' : `hace ${dias} días`);
    if (prefijo) return `${prefijo} ${cuando}`;
    return lista.length > 1 && dias > 0 ? `el más antiguo ${cuando}` : cuando;
  }

  async function cargarPendienteAtencion() {
    const cont = document.getElementById('cardPendienteAtencion');
    if (!cont) return;
    // Solo la primera vez: al refrescar se deja lo que había hasta tener lo nuevo.
    if (!cont.querySelector(".inicio-pendiente-item, .empty")) cont.innerHTML = `<p class="inicio-vacio">Comprobando…</p>`;

    const items = [];

    // 1 y 2. Informe de hoy: incidencias sin enviar, y siniestros de esas
    // incidencias pendientes de enviar a la agencia. Consulta directa (no
    // depende de que informeHoyCache/incidenciasHoyCache ya estén cargadas).
    try {
      // Se calcula aquí la fecha de hoy: al abrir la app esta función puede
      // ejecutarse antes de que informe-hoy.js haya definido fechaHoyISO.
      const { data: informe } = await sb.from('informes_diarios')
        .select('id, informe_enviado')
        .eq('fecha', fechaLocalISO(new Date()))
        .maybeSingle();

      if (informe) {
        const { data: incs } = await sb.from('incidencias')
          .select('id, marcada')
          .eq('informe_id', informe.id);
        const marcadas = (incs || []).filter(i => i.marcada);

        if (!informe.informe_enviado && marcadas.length > 0) {
          items.push({
            icono: '📨',
            texto: `El informe de hoy tiene ${marcadas.length} incidencia${marcadas.length === 1 ? '' : 's'} sin enviar a las agencias`,
            vista: 'incidencias'
          });
        }

        if (marcadas.length > 0) {
          const { data: sins } = await sb.from('siniestros')
            .select('id, estado')
            .in('incidencia_id', marcadas.map(i => i.id))
            .eq('estado', 'PENDIENTE');
          const numPend = (sins || []).length;
          if (numPend > 0) {
            items.push({
              icono: '📦',
              texto: `${numPend} siniestro${numPend === 1 ? '' : 's'} del día pendiente${numPend === 1 ? '' : 's'} de enviar a la agencia`,
              vista: 'siniestros'
            });
          }
        }
      }
    } catch (err) {
      console.error('Error comprobando el informe de hoy:', err);
    }

    // 3. Panel siniestros: pendiente de cobro (más de 30 días), sin
    // albarán, sin factura, y recogidas con la fecha cumplida
    try {
      const { data, error } = await sb.from('panel_siniestros')
        .select('estado, tipo, recogida_estado, recogida_limite, recogida_estado_en, valor, fecha, creado_en, albaran_url, factura_url, origen, correo_enviado, envio_omitido_en');
      if (!error && data) {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

        // Siniestros del Panel que todavía no se han enviado a la agencia
        // ni se ha omitido el envío (mismo criterio que las filas resaltadas
        // en naranja en la tabla).
        // Va el primero y en rojo (clase "urgente"). Los anulados no cuentan.
        const sinEnviarAgencia = data.filter(s => !s.correo_enviado && !s.envio_omitido_en && s.estado !== 'ANULADO');
        if (sinEnviarAgencia.length) {
          const n = sinEnviarAgencia.length;
          items.unshift({
            icono: '📧',
            texto: `${n} siniestro${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} de enviar a la agencia`,
            vista: 'panel-siniestros',
            filtro: { sinCorreo: true },
            urgente: true,
            edad: edadTareaPendiente(sinEnviarAgencia, 'creado_en')
          });
        }

        // Solo avisa si lleva más de 30 días pendiente de cobro (a partir
        // de la fecha del siniestro), no en cuanto entra en ese estado.
        const pdteCobro = data.filter(s => {
          if (s.estado !== 'PDTE COBRO' || !s.fecha) return false;
          const dias = Math.floor((hoy - new Date(s.fecha + 'T00:00:00')) / 86400000);
          return dias > 30;
        });
        if (pdteCobro.length) {
          const totalPdte = pdteCobro.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
          const totalTxt = totalPdte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          items.push({
            icono: '💰',
            texto: `${pdteCobro.length} siniestro${pdteCobro.length === 1 ? '' : 's'} pendiente${pdteCobro.length === 1 ? '' : 's'} de cobro desde hace más de 30 días (${totalTxt} €)`,
            vista: 'panel-siniestros',
            // "Hasta" = hace 31 días: solo los que llevan más de 30 días
            filtro: { estado: 'PDTE COBRO', fechaHasta: fechaLocalISO(new Date(hoy.getTime() - 31 * 86400000)) },
            edad: edadTareaPendiente(pdteCobro, 'fecha')
          });
        }

        const sinAlbaran = data.filter(s => s.estado === 'PDTE COBRO' && !s.albaran_url);
        if (sinAlbaran.length) {
          items.push({
            icono: '📄',
            texto: `${sinAlbaran.length} siniestro${sinAlbaran.length === 1 ? '' : 's'} sin albarán`,
            vista: 'panel-siniestros',
            filtro: { estado: 'PDTE COBRO', sinAlbaran: true },
            edad: edadTareaPendiente(sinAlbaran, 'fecha')
          });
        }

        const sinFactura = data.filter(s => s.estado === 'PDTE COBRO' && !s.factura_url);
        if (sinFactura.length) {
          items.push({
            icono: '🧾',
            texto: `${sinFactura.length} siniestro${sinFactura.length === 1 ? '' : 's'} sin factura`,
            vista: 'panel-siniestros',
            filtro: { estado: 'PDTE COBRO', sinFactura: true },
            edad: edadTareaPendiente(sinFactura, 'fecha')
          });
        }

        const sinOrigen = data.filter(s => s.estado === 'PDTE COBRO' && !s.origen);
        if (sinOrigen.length) {
          items.push({
            icono: '🏷️',
            texto: `${sinOrigen.length} siniestro${sinOrigen.length === 1 ? '' : 's'} sin origen de mercancía`,
            vista: 'panel-siniestros',
            edad: edadTareaPendiente(sinOrigen, 'fecha')
          });
        }

        const vencidas = data.filter(s =>
          s.tipo !== 'FALTAS' && s.recogida_limite && !s.recogida_estado &&
          new Date(s.recogida_limite + 'T00:00:00') < hoy
        );
        if (vencidas.length) {
          items.push({
            icono: '⏰',
            texto: `${vencidas.length} recogida${vencidas.length === 1 ? '' : 's'} con la fecha límite ya cumplida`,
            vista: 'panel-siniestros',
            filtro: { recogida: 'PDTE_FUERA' },
            edad: edadTareaPendiente(vencidas, 'recogida_limite', { prefijo: 'vencida' })
          });
        }

        // Recogidas marcadas como "en espera de tienda": no cuentan como
        // vencidas sin gestionar (ya hay alguien detrás), pero conviene un
        // recordatorio aparte para hacer seguimiento de la respuesta.
        const enEsperaTienda = data.filter(s => s.recogida_estado === 'EN ESPERA DE TIENDA');
        if (enEsperaTienda.length) {
          items.push({
            icono: '🏬',
            texto: `${enEsperaTienda.length} siniestro${enEsperaTienda.length === 1 ? '' : 's'} en espera de respuesta por parte de tienda`,
            vista: 'panel-siniestros',
            filtro: { recogida: 'EN ESPERA DE TIENDA' },
            edad: edadTareaPendiente(enEsperaTienda, 'recogida_estado_en', { prefijo: 'esperando' })
          });
        }
      }
    } catch (err) {
      console.error('Error cargando pendientes del Panel siniestros:', err);
    }

    // 4. Resumen mensual a agencias: meses ya terminados que se queden sin
    // enviar a alguna agencia (nunca avisa de meses anteriores a que
    // existiera este seguimiento — ver RME_MES_INICIO).
    try {
      if (typeof tienePermiso === 'function' && tienePermiso('enviar_reporte_mensual') && typeof rmeComprobarPendienteInicio === 'function') {
        const item = await rmeComprobarPendienteInicio();
        if (item) items.push(item);
      }
    } catch (err) {
      console.error('Error comprobando el resumen mensual pendiente:', err);
    }

    // 5. Informes ya enviados con incidencias "sin revisar": ya no salen
    // aquí, sino en el banner rojo bajo la barra superior (ver
    // actualizarAvisoInformesSinRevisar en informe-envio.js).

    // 6. Cambios de agencia programados: avisan desde 3 días antes del
    // cambio. Antes se aplican los que ya tocan (por si el cron de las
    // 00:05 no se hubiera ejecutado), para no avisar de algo ya pasado.
    try {
      if (typeof aplicarCambiosProgramadosVencidos === 'function') await aplicarCambiosProgramadosVencidos();
      const hoyISO = fechaLocalISO(new Date());
      const limite = new Date(); limite.setDate(limite.getDate() + 3);
      const { data: progs, error: eProg } = await sb.from('tienda_cambios_agencia_programados')
        .select('fecha_cambio, agencia_anterior_nombre, agencia_nueva_nombre, tiendas(nombre)')
        .eq('estado', 'PENDIENTE')
        .gte('fecha_cambio', hoyISO)
        .lte('fecha_cambio', fechaLocalISO(limite))
        .order('fecha_cambio');
      if (eProg) throw eProg;
      (progs || []).forEach(c => {
        const [y, m, d] = c.fecha_cambio.split('-');
        items.push({
          icono: '🔀',
          texto: `La tienda ${escapeHtml(c.tiendas?.nombre || '—')} cambiará de agencia ${escapeHtml(c.agencia_anterior_nombre || '—')} a ${escapeHtml(c.agencia_nueva_nombre)} el ${d}/${m}/${y}`,
          vista: 'config-tiendas'
        });
      });
    } catch (err) {
      console.error('Error comprobando cambios de agencia programados:', err);
    }

    // Los avisos urgentes (en rojo) van siempre arriba del todo, manteniendo
    // entre ellos y entre el resto el orden en que se han ido añadiendo.
    items.sort((x, y) => (y.urgente ? 1 : 0) - (x.urgente ? 1 : 0));

    // Contador junto al título "Tareas pendientes"
    const numEl = document.getElementById('tareasNum');
    if (numEl) { numEl.textContent = items.length; numEl.hidden = !items.length; }

    if (!items.length) {
      cont.innerHTML = `
        <div class="empty" style="padding:20px;">
          <div class="glyph">✅</div>
          <h3>Todo al día</h3>
          <p>No hay nada pendiente de atención ahora mismo.</p>
        </div>`;
      return;
    }

    cont.innerHTML = items.map(it => `
      <button type="button" class="inicio-pendiente-item${it.urgente ? ' urgente' : ''}" data-ir="${it.vista}"${it.anio !== undefined ? ` data-ir-anio="${it.anio}" data-ir-mes="${it.mes}"` : ''}${it.fecha !== undefined ? ` data-ir-fecha="${it.fecha}"` : ''}${it.filtro ? ` data-ir-filtro='${escapeHtml(JSON.stringify(it.filtro))}'` : ''}>
        <span class="icono">${it.icono}</span>
        <span class="texto">${it.texto}</span>
        ${it.edad ? `<span class="edad">${escapeHtml(it.edad)}</span>` : ''}
        <span class="flecha">→</span>
      </button>`).join('');

    cont.querySelectorAll('[data-ir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (typeof confirmarDescartarEdicionHistorial === 'function' && !(await confirmarDescartarEdicionHistorial())) return;
        if (typeof confirmarDescartarEdicionGravedadMotivos === 'function' && !(await confirmarDescartarEdicionGravedadMotivos())) return;
        const vista = btn.dataset.ir;
        activarVista(vista);
        if (vista === 'incidencias' && typeof renderVistaIncidencias === 'function') renderVistaIncidencias();
        if (vista === 'siniestros' && typeof renderVistaSiniestros === 'function') renderVistaSiniestros();
        // Panel siniestros: además de ir, deja puesto el filtro de esa tarea
        // (p. ej. "Sin enviar a agencia" marcado), o los filtros limpios si
        // la tarea no tiene uno propio.
        if (vista === 'panel-siniestros' && typeof psAplicarFiltros === 'function') {
          let filtro = {};
          try { filtro = btn.dataset.irFiltro ? JSON.parse(btn.dataset.irFiltro) : {}; } catch { filtro = {}; }
          psAplicarFiltros(filtro);
        }
        if (vista === 'panel-siniestros' && typeof cargarPanelSiniestros === 'function') cargarPanelSiniestros();
        if (vista === 'config-tiendas' && typeof cargarAgenciasYTiendas === 'function') {
          await cargarAgenciasYTiendas();
          if (typeof abrirListaContador === 'function') abrirListaContador('programados');
        }
        if (vista === 'historial-informes' && btn.dataset.irFecha && typeof cargarInformeHistorial === 'function') {
          historialFechaInput.value = btn.dataset.irFecha;
          cargarInformeHistorial(btn.dataset.irFecha);
        }
        if (vista === 'analisis-reportes-mensuales' && typeof renderVistaReportesMensuales === 'function') {
          if (btn.dataset.irAnio !== undefined) {
            rmAnio = Number(btn.dataset.irAnio);
            rmMes = Number(btn.dataset.irMes);
          }
          renderVistaReportesMensuales();
          if (typeof rmeAbrirPanel === 'function') rmeAbrirPanel();
        }
      });
    });
  }

  if (sesionActiva) cargarKPIs();

  // ---------------------------------------------------------------
