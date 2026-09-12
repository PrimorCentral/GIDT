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

  function actualizarFechaHoyTexto() {
    document.getElementById('fechaHoyTexto').textContent =
      dias[hoy.getDay()] + ", " + formatearFechaCorta(hoy);
  }
  actualizarFechaHoyTexto();

  // ---------------------------------------------------------------
  // Carga inicial: KPIs desde Supabase (smoke test de conexión)
  // ---------------------------------------------------------------
  async function cargarKPIs() {
    const statusEl = document.getElementById('statusText');
    const saludoEl = document.getElementById('inicioSaludo');
    if (saludoEl) {
      const nombreCorto = (sesionActual?.nombre || sesionActual?.usuario || '').split(' ')[0];
      saludoEl.textContent = nombreCorto ? `Hola, ${nombreCorto}` : 'Inicio';
    }
    try {
      const [{ count: numAgencias, error: e1 }, { count: numTiendas, error: e2 }] = await Promise.all([
        sb.from('agencias').select('*', { count: 'exact', head: true }).eq('activo', true),
        sb.from('tiendas').select('*', { count: 'exact', head: true }).eq('activo', true).eq('marca', 'HABITUAL')
      ]);
      if (e1 || e2) throw (e1 || e2);

      document.getElementById('kpiAgencias').textContent = numAgencias ?? '—';
      document.getElementById('kpiTiendas').textContent = numTiendas ?? '—';
      document.getElementById('kpiIncidenciasHoy').textContent = '0';
      document.getElementById('kpiSiniestrosPend').textContent = '0';

      statusEl.textContent = 'Conectado a Supabase';
      document.getElementById('statusWrap').title = 'Conectado a Supabase';
    } catch (err) {
      console.error('Error cargando KPIs:', err);
      statusEl.textContent = 'Error de conexión';
      document.getElementById('statusWrap').title = 'Error de conexión';
    }
    cargarPendienteAtencion();
  }

  // ---------------------------------------------------------------
  // "Pendiente de atención" (pantalla de Inicio): reúne, de varias
  // fuentes, lo que necesita algo de ti ahora mismo, con acceso
  // directo a la pantalla correspondiente.
  // ---------------------------------------------------------------
  async function cargarPendienteAtencion() {
    const cont = document.getElementById('cardPendienteAtencion');
    if (!cont) return;
    cont.innerHTML = `<div class="empty" style="padding:20px;"><p>Comprobando…</p></div>`;

    const items = [];

    // 1 y 2. Informe de hoy: incidencias sin enviar, y siniestros de esas
    // incidencias pendientes de enviar a la agencia. Consulta directa (no
    // depende de que informeHoyCache/incidenciasHoyCache ya estén cargadas).
    try {
      const { data: informe } = await sb.from('informes_diarios')
        .select('id, informe_enviado')
        .eq('fecha', fechaHoyISO)
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

    // 3. Panel siniestros: pendiente de cobro (más de 15 días), sin
    // albarán, sin factura, y recogidas con la fecha cumplida
    try {
      const { data, error } = await sb.from('panel_siniestros')
        .select('estado, tipo, recogida_estado, recogida_limite, valor, fecha, albaran_url, factura_url, origen');
      if (!error && data) {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

        // Solo avisa si lleva más de 15 días pendiente de cobro (a partir
        // de la fecha del siniestro), no en cuanto entra en ese estado.
        const pdteCobro = data.filter(s => {
          if (s.estado !== 'PDTE COBRO' || !s.fecha) return false;
          const dias = Math.floor((hoy - new Date(s.fecha + 'T00:00:00')) / 86400000);
          return dias > 15;
        });
        if (pdteCobro.length) {
          const totalPdte = pdteCobro.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
          const totalTxt = totalPdte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          items.push({
            icono: '💰',
            texto: `${pdteCobro.length} siniestro${pdteCobro.length === 1 ? '' : 's'} pendiente${pdteCobro.length === 1 ? '' : 's'} de cobro desde hace más de 15 días (${totalTxt} €)`,
            vista: 'panel-siniestros'
          });
        }

        const sinAlbaran = data.filter(s => s.estado === 'PDTE COBRO' && !s.albaran_url);
        if (sinAlbaran.length) {
          items.push({
            icono: '📄',
            texto: `${sinAlbaran.length} siniestro${sinAlbaran.length === 1 ? '' : 's'} sin albarán`,
            vista: 'panel-siniestros'
          });
        }

        const sinFactura = data.filter(s => s.estado === 'PDTE COBRO' && !s.factura_url);
        if (sinFactura.length) {
          items.push({
            icono: '🧾',
            texto: `${sinFactura.length} siniestro${sinFactura.length === 1 ? '' : 's'} sin factura`,
            vista: 'panel-siniestros'
          });
        }

        const sinOrigen = data.filter(s => s.estado === 'PDTE COBRO' && !s.origen);
        if (sinOrigen.length) {
          items.push({
            icono: '🏷️',
            texto: `${sinOrigen.length} siniestro${sinOrigen.length === 1 ? '' : 's'} sin origen de mercancía`,
            vista: 'panel-siniestros'
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
            vista: 'panel-siniestros'
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
      <button type="button" class="inicio-pendiente-item" data-ir="${it.vista}"${it.anio !== undefined ? ` data-ir-anio="${it.anio}" data-ir-mes="${it.mes}"` : ''}>
        <span class="icono">${it.icono}</span>
        <span class="texto">${it.texto}</span>
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
        if (vista === 'panel-siniestros' && typeof cargarPanelSiniestros === 'function') cargarPanelSiniestros();
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
