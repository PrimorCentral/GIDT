// ---------------------------------------------------------------
  // Navegación por pestañas + submenú desplegable de Configuración
  // ---------------------------------------------------------------
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
    btn.addEventListener('click', () => activarVista(btn.dataset.view));
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
      item.addEventListener('click', () => {
        activarVista(item.dataset.view);
        cerrarTodosLosDropdowns();
        if (item.dataset.view === 'incidencias' && informeHoyCache !== undefined) renderVistaIncidencias();
        if (item.dataset.view === 'historial-informes') renderVistaHistorialInformes();
        if (item.dataset.view === 'historial-siniestros') renderVistaHistorialSiniestros();
        if (item.dataset.view === 'siniestros') renderVistaSiniestros();
        if (item.dataset.view === 'analisis-ranking') renderVistaAnalisisRanking();
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

    const items = [];

    // 1. Informe de hoy con incidencias sin enviar
    if (informeHoyCache && !informeHoyCache.informe_enviado) {
      const numInc = (incidenciasHoyCache || []).filter(i => i.marcada).length;
      if (numInc > 0) {
        items.push({
          icono: '📨',
          texto: `El informe de hoy tiene ${numInc} incidencia${numInc === 1 ? '' : 's'} sin enviar a las agencias`,
          vista: 'incidencias'
        });
      }
    }

    // 2. Siniestros del día pendientes de enviar
    const numPendEnvio = Number(document.getElementById('kpiSiniestrosPend')?.textContent) || 0;
    if (numPendEnvio > 0) {
      items.push({
        icono: '📦',
        texto: `${numPendEnvio} siniestro${numPendEnvio === 1 ? '' : 's'} del día pendiente${numPendEnvio === 1 ? '' : 's'} de enviar a la agencia`,
        vista: 'siniestros'
      });
    }

    // 3. Panel siniestros: pendiente de cobro y recogidas con la fecha cumplida
    // (consulta directa a Supabase, no depende de haber entrado antes al Panel)
    try {
      const { data, error } = await sb.from('panel_siniestros')
        .select('estado, tipo, recogida_estado, recogida_limite, valor');
      if (!error && data) {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

        const pdteCobro = data.filter(s => s.estado === 'PDTE COBRO');
        if (pdteCobro.length) {
          const totalPdte = pdteCobro.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
          const totalTxt = totalPdte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          items.push({
            icono: '💰',
            texto: `${pdteCobro.length} siniestro${pdteCobro.length === 1 ? '' : 's'} pendiente${pdteCobro.length === 1 ? '' : 's'} de cobro (${totalTxt} €)`,
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
      <button type="button" class="inicio-pendiente-item" data-ir="${it.vista}">
        <span class="icono">${it.icono}</span>
        <span class="texto">${it.texto}</span>
        <span class="flecha">→</span>
      </button>`).join('');

    cont.querySelectorAll('[data-ir]').forEach(btn => {
      btn.addEventListener('click', () => {
        const vista = btn.dataset.ir;
        activarVista(vista);
        if (vista === 'incidencias' && typeof renderVistaIncidencias === 'function') renderVistaIncidencias();
        if (vista === 'siniestros' && typeof renderVistaSiniestros === 'function') renderVistaSiniestros();
        if (vista === 'panel-siniestros' && typeof cargarPanelSiniestros === 'function') cargarPanelSiniestros();
      });
    });
  }

  if (sesionActiva) cargarKPIs();

  // ---------------------------------------------------------------
