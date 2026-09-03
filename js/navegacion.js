  // ---------------------------------------------------------------
  // Navegación por pestañas + submenú desplegable de Configuración
  // ---------------------------------------------------------------
  function activarVista(nombreVista) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + nombreVista).classList.add('active');

    if (nombreVista.startsWith('config-')) {
      document.getElementById('btnConfigDropdown').classList.add('active');
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
    { btn: document.getElementById('btnConfigDropdown'),     panel: document.getElementById('configDropdown') }
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
  const hoy = new Date();
  document.getElementById('fechaHoyTexto').textContent =
    dias[hoy.getDay()] + ", " + hoy.toLocaleDateString('es-ES');

  // ---------------------------------------------------------------
  // Carga inicial: KPIs desde Supabase (smoke test de conexión)
  // ---------------------------------------------------------------
  async function cargarKPIs() {
    const statusEl = document.getElementById('statusText');
    try {
      const [{ count: numAgencias, error: e1 }, { count: numTiendas, error: e2 }] = await Promise.all([
        sb.from('agencias').select('*', { count: 'exact', head: true }).eq('activo', true),
        sb.from('tiendas').select('*', { count: 'exact', head: true }).eq('activo', true)
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
  }

  if (sesionActiva) cargarKPIs();

  // ---------------------------------------------------------------
