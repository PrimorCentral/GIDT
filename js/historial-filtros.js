// Filtros y buscador de tienda para "Historial de informes diarios"
// ---------------------------------------------------------------
// Se aplican tanto en modo consulta (renderHistorialInforme, informe-hoy.js)
// como en modo edición (renderAcordeonHistorialEditable, historial-editar.js).
// La apertura/cierre de cada .filtro-select individual y su buscador interno
// ya los gestiona de forma genérica filtros-motivos.js para cualquier
// .filtro-select de la página, así que aquí solo construimos las listas y
// gestionamos el panel en sí (abrir/cerrar/limpiar/contador) y el buscador
// de tienda.
//
// Requiere (ya cargados antes): agenciasCache, escapeHtml, MOTIVOS,
// TIPOS_FILTRO, MARCAS_FILTRO, cerrarTodosLosSelects (filtros-motivos.js),
// cerrarTodosLosExportarPaneles (informe-pdf.js), historialInformeActual,
// renderHistorialInforme (informe-hoy.js), historialEditando,
// renderAcordeonHistorialEditable (historial-editar.js).

let filtrosHistorial = { agencias: new Set(), tipos: new Set(), motivos: new Set(), marcas: new Set(), soloConIncidencias: false, soloPendientes: false };

function historialFiltrosActivos() {
  return filtrosHistorial.agencias.size > 0 || filtrosHistorial.tipos.size > 0 || filtrosHistorial.motivos.size > 0 || filtrosHistorial.marcas.size > 0 || filtrosHistorial.soloConIncidencias || filtrosHistorial.soloPendientes;
}

// La casilla "Solo con incidencias" solo tiene sentido en modo edición
// (lista TODAS las tiendas); en modo consulta ya solo se muestran las que
// tuvieron incidencia ese día.
function mostrarFiltroSoloConIncidenciasHistorial(mostrar) {
  const wrap = document.getElementById('historialFiltroSoloConIncidenciasWrap');
  if (wrap) wrap.style.display = mostrar ? '' : 'none';
  if (!mostrar && filtrosHistorial.soloConIncidencias) {
    filtrosHistorial.soloConIncidencias = false;
    const cb = document.getElementById('historialFiltroSoloConIncidencias');
    if (cb) cb.checked = false;
    actualizarBadgeFiltrosHistorial();
  }
}

function rerenderHistorialActual() {
  if (!historialInformeActual) return;
  if (typeof historialEditando !== 'undefined' && historialEditando) renderAcordeonHistorialEditable();
  else renderHistorialInforme();
}

function construirPanelFiltrosHistorial() {
  const listaAg = document.getElementById('historialFiltrosAgenciasLista');
  const listaTipos = document.getElementById('historialFiltrosTiposLista');
  const listaMotivos = document.getElementById('historialFiltrosMotivosLista');
  const listaMarcas = document.getElementById('historialFiltrosMarcasLista');
  if (!listaAg || listaAg.dataset.built) return;

  listaAg.innerHTML = agenciasCache.map(ag => `
    <label class="filtro-check">
      <input type="checkbox" value="${ag.id}" data-filtro="agencia">
      <span>${escapeHtml(ag.nombre)}</span>
    </label>`).join('');
  listaAg.dataset.built = '1';

  listaTipos.innerHTML = TIPOS_FILTRO.map(t => `
    <label class="filtro-check">
      <input type="checkbox" value="${t.v}" data-filtro="tipo">
      <span class="pill ${t.v.toLowerCase()}">${t.label}</span>
    </label>`).join('');
  listaTipos.dataset.built = '1';

  listaMotivos.innerHTML = MOTIVOS.map(m => `
    <label class="filtro-check motivo-${m.clase}">
      <input type="checkbox" value="${escapeHtml(m.v)}" data-filtro="motivo">
      <span>${m.v.charAt(0)}${m.v.slice(1).toLowerCase()}</span>
    </label>`).join('');
  listaMotivos.dataset.built = '1';

  listaMarcas.innerHTML = MARCAS_FILTRO.map(m => `
    <label class="filtro-check">
      <input type="checkbox" value="${m.v}" data-filtro="marca">
      <span>${m.label}</span>
    </label>`).join('');
  listaMarcas.dataset.built = '1';
}

function actualizarValoresSelectsHistorial() {
  document.querySelectorAll('#historialFiltrosPanel .filtro-select').forEach(sel => {
    const grupo = sel.dataset.grupo;
    const set = grupo === 'agencia' ? filtrosHistorial.agencias
              : grupo === 'tipo' ? filtrosHistorial.tipos
              : grupo === 'marca' ? filtrosHistorial.marcas
              : filtrosHistorial.motivos;
    const valor = sel.querySelector('.filtro-select-valor');
    if (set.size === 0) {
      valor.textContent = 'Todos';
      sel.classList.remove('activo');
    } else if (set.size === 1) {
      const cb = sel.querySelector('input[type="checkbox"]:checked');
      valor.textContent = cb ? cb.closest('.filtro-check').textContent.trim() : `${set.size} seleccionados`;
      sel.classList.add('activo');
    } else {
      valor.textContent = `${set.size} seleccionados`;
      sel.classList.add('activo');
    }
  });
}

function actualizarBadgeFiltrosHistorial() {
  const total = filtrosHistorial.agencias.size + filtrosHistorial.tipos.size + filtrosHistorial.motivos.size + filtrosHistorial.marcas.size + (filtrosHistorial.soloConIncidencias ? 1 : 0) + (filtrosHistorial.soloPendientes ? 1 : 0);
  const badge = document.getElementById('historialFiltrosCount');
  const btn = document.getElementById('btnHistorialFiltros');
  if (!badge || !btn) return;
  if (total > 0) {
    badge.textContent = total;
    badge.style.display = '';
    btn.classList.add('activo');
  } else {
    badge.style.display = 'none';
    btn.classList.remove('activo');
  }
}

// Resetea filtros y buscador por completo (al cargar una fecha nueva).
function limpiarFiltrosHistorialCompleto() {
  filtrosHistorial = { agencias: new Set(), tipos: new Set(), motivos: new Set(), marcas: new Set(), soloConIncidencias: false, soloPendientes: false };
  const panel = document.getElementById('historialFiltrosPanel');
  panel?.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  actualizarBadgeFiltrosHistorial();
  actualizarValoresSelectsHistorial();
  const buscador = document.getElementById('buscarTiendaHistorial');
  if (buscador) buscador.value = '';
  mostrarFiltroSoloConIncidenciasHistorial(false);
}

const btnHistorialFiltros = document.getElementById('btnHistorialFiltros');
const historialFiltrosPanel = document.getElementById('historialFiltrosPanel');

function posicionarHistorialFiltrosPanel() {
  if (!btnHistorialFiltros || !historialFiltrosPanel) return;
  const wrap = btnHistorialFiltros.closest('.filtros-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(560, bordeDerechoVisible() - margen * 2);
  historialFiltrosPanel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (bordeDerechoVisible() - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  historialFiltrosPanel.style.left = left + 'px';
}

function abrirHistorialFiltrosPanel() {
  construirPanelFiltrosHistorial();
  if (typeof cerrarTodosLosExportarPaneles === 'function') cerrarTodosLosExportarPaneles();
  posicionarHistorialFiltrosPanel();
  historialFiltrosPanel.classList.add('show');
  btnHistorialFiltros.classList.add('open');
}
function cerrarHistorialFiltrosPanel() {
  if (!historialFiltrosPanel) return;
  historialFiltrosPanel.classList.remove('show');
  btnHistorialFiltros?.classList.remove('open');
  if (typeof cerrarTodosLosSelects === 'function') cerrarTodosLosSelects(null);
}

if (btnHistorialFiltros && historialFiltrosPanel) {
  window.addEventListener('resize', () => {
    if (historialFiltrosPanel.classList.contains('show')) posicionarHistorialFiltrosPanel();
  });

  btnHistorialFiltros.addEventListener('click', (e) => {
    e.stopPropagation();
    if (historialFiltrosPanel.classList.contains('show')) cerrarHistorialFiltrosPanel();
    else abrirHistorialFiltrosPanel();
  });

  historialFiltrosPanel.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', (e) => {
    if (!historialFiltrosPanel.contains(e.target) && !btnHistorialFiltros.contains(e.target)) {
      cerrarHistorialFiltrosPanel();
    }
  });

  document.getElementById('btnHistorialCerrarFiltros')?.addEventListener('click', cerrarHistorialFiltrosPanel);

  document.getElementById('btnHistorialLimpiarFiltros')?.addEventListener('click', () => {
    filtrosHistorial.agencias.clear();
    filtrosHistorial.tipos.clear();
    filtrosHistorial.motivos.clear();
    filtrosHistorial.marcas.clear();
    filtrosHistorial.soloConIncidencias = false;
    filtrosHistorial.soloPendientes = false;
    historialFiltrosPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    actualizarBadgeFiltrosHistorial();
    actualizarValoresSelectsHistorial();
    rerenderHistorialActual();
  });

  historialFiltrosPanel.addEventListener('change', (e) => {
    const cb = e.target;
    if (!cb.matches('input[type="checkbox"]')) return;
    if (cb.id === 'historialFiltroSoloConIncidencias') {
      filtrosHistorial.soloConIncidencias = cb.checked;
      actualizarBadgeFiltrosHistorial();
      rerenderHistorialActual();
      return;
    }
    if (cb.id === 'historialFiltroSoloPendientes') {
      filtrosHistorial.soloPendientes = cb.checked;
      actualizarBadgeFiltrosHistorial();
      rerenderHistorialActual();
      return;
    }
    const grupo = cb.dataset.filtro;
    if (!grupo) return;
    const set = grupo === 'agencia' ? filtrosHistorial.agencias
              : grupo === 'tipo' ? filtrosHistorial.tipos
              : grupo === 'marca' ? filtrosHistorial.marcas
              : filtrosHistorial.motivos;
    const val = grupo === 'agencia' ? Number(cb.value) : cb.value;
    if (cb.checked) set.add(val); else set.delete(val);
    actualizarBadgeFiltrosHistorial();
    actualizarValoresSelectsHistorial();
    rerenderHistorialActual();
  });
}

document.getElementById('buscarTiendaHistorial')?.addEventListener('input', () => {
  rerenderHistorialActual();
});
