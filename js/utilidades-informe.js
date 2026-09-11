// ---------------------------------------------------------------
// "Utilidades" del Informe del día: cambios puntuales de HORA y/o
// AGENCIA de entrega de una tienda, que solo afectan al informe de
// HOY (no tocan la ficha de la tienda ni el resto de informes).
// ---------------------------------------------------------------
// Requiere que ya estén cargados/definidos (por orden de <script> en index.html):
//   - sb, escapeHtml, modalAlert                      (supabase-client.js / ui-modal.js)
//   - informeHoyCache                                  (informe-hoy.js)
//   - agenciasCache, tiendasCache                       (tiendas.js)
//   - renderAcordeonIncidencias, cerrarFiltrosPanel      (siniestros-historial.js / filtros-motivos.js)
//   - cerrarTodosLosExportarPaneles                      (informe-pdf.js)

// ---------------------------------------------------------------
// Helpers de lectura: valores "efectivos" de una tienda para el
// informe de hoy, teniendo en cuenta (por este orden):
//   1) el horario semanal especial de la tienda (tiendas.horario_semana,
//      configurado en Gestión de tiendas) para el día de la semana de
//      la fecha del informe — p. ej. Martes y Viernes con otra hora;
//   2) por encima de lo anterior, un ajuste puntual de "Utilidades"
//      (solo para el informe de hoy), que sigue teniendo la última
//      palabra si existe.
// ---------------------------------------------------------------
function ajustePuntualDeTienda(tiendaId) {
  const mapa = informeHoyCache?.ajustes_puntuales;
  if (!mapa) return null;
  return mapa[String(tiendaId)] || null;
}

// Día ISO de una fecha: 1=lunes … 7=domingo (Date.getDay() da 0=domingo).
// Acepta un objeto Date o una fecha 'YYYY-MM-DD'.
function diaIsoDeFecha(fecha) {
  const d = (fecha instanceof Date) ? fecha : new Date(fecha + 'T00:00:00');
  const jsDay = d.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// Hora del horario semanal especial de la tienda para esa fecha, o null
// si ese día no tiene horario especial configurado (usa hora_prevista).
function horaSemanalDeTienda(t, fecha) {
  if (!t?.horario_semana) return null;
  const iso = diaIsoDeFecha(fecha);
  return t.horario_semana[String(iso)] || null;
}

// Tienda "base" para una fecha dada: la de tiendasCache, con hora_prevista
// sustituida por la del horario semanal especial si ese día lo tiene.
// No aplica ningún ajuste puntual (eso es solo para "hoy", ver abajo).
function tiendaConHorarioDia(tiendaId, fecha) {
  const t = tiendasCache.find(x => x.id === tiendaId);
  if (!t) return null;
  const horaSemanal = horaSemanalDeTienda(t, fecha);
  return horaSemanal ? { ...t, hora_prevista: horaSemanal } : t;
}

function tiendaEfectivaHoy(tiendaId) {
  const base = tiendaConHorarioDia(tiendaId, hoy);
  if (!base) return null;
  const aj = ajustePuntualDeTienda(tiendaId);
  if (!aj) return base;
  return {
    ...base,
    hora_prevista: aj.hora_prevista || base.hora_prevista,
    agencia_id: (aj.agencia_id != null) ? aj.agencia_id : base.agencia_id
  };
}

// ---------------------------------------------------------------
// Guardado / borrado en BD (todo vive en informes_diarios.ajustes_puntuales)
// ---------------------------------------------------------------
async function guardarAjustesPuntualesHoy(nuevoMapa) {
  const { data, error } = await sb.from('informes_diarios')
    .update({ ajustes_puntuales: nuevoMapa })
    .eq('id', informeHoyCache.id)
    .select().single();
  if (error) throw error;
  informeHoyCache = data;
}

async function aplicarAjustePuntual(tiendaId, { hora_prevista, agenciaId }) {
  const mapa = { ...(informeHoyCache?.ajustes_puntuales || {}) };
  const entrada = {};
  if (hora_prevista) entrada.hora_prevista = hora_prevista;
  if (agenciaId != null) {
    const ag = agenciasCache.find(a => a.id === agenciaId);
    entrada.agencia_id = agenciaId;
    entrada.agencia_nombre = ag?.nombre || null;
  }
  if (!Object.keys(entrada).length) {
    delete mapa[String(tiendaId)];
  } else {
    mapa[String(tiendaId)] = entrada;
  }
  await guardarAjustesPuntualesHoy(mapa);
}

async function quitarAjustePuntual(tiendaId) {
  const mapa = { ...(informeHoyCache?.ajustes_puntuales || {}) };
  delete mapa[String(tiendaId)];
  await guardarAjustesPuntualesHoy(mapa);
}

// ---------------------------------------------------------------
// Panel "Utilidades"
// ---------------------------------------------------------------
const btnUtilidadesInforme = document.getElementById('btnUtilidadesInforme');
const utilidadesWrap = btnUtilidadesInforme ? btnUtilidadesInforme.closest('.filtros-wrap') : null;
const utilidadesPanel = document.getElementById('utilidadesPanel');

let utilTiendaSeleccionada = null; // id de la tienda elegida en el desplegable

function posicionarUtilidadesPanel() {
  const wrapRect = utilidadesWrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(480, document.documentElement.clientWidth - margen * 2);
  utilidadesPanel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (document.documentElement.clientWidth - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  utilidadesPanel.style.left = left + 'px';
}

function cerrarUtilidadesPanel() {
  if (!utilidadesPanel) return;
  utilidadesPanel.classList.remove('show');
  btnUtilidadesInforme?.classList.remove('open');
  document.getElementById('utilTiendaSelect')?.classList.remove('open');
}

async function abrirUtilidadesPanel() {
  if (!utilidadesPanel || !informeHoyCache) return;
  if (typeof cerrarFiltrosPanel === 'function') cerrarFiltrosPanel();
  if (typeof cerrarTodosLosExportarPaneles === 'function') cerrarTodosLosExportarPaneles();

  await ensureAgenciasYTiendasCargadas();
  construirListaTiendasUtilidades();
  construirSelectAgenciaUtilidades();
  renderListaAjustesPuntuales();
  seleccionarTiendaUtilidades(null);

  posicionarUtilidadesPanel();
  utilidadesPanel.classList.add('show');
  btnUtilidadesInforme.classList.add('open');
}

function construirPanelUtilidadesInforme() {
  if (!btnUtilidadesInforme || !utilidadesPanel) return;

  btnUtilidadesInforme.addEventListener('click', (e) => {
    e.stopPropagation();
    if (utilidadesPanel.classList.contains('show')) cerrarUtilidadesPanel();
    else abrirUtilidadesPanel();
  });

  document.getElementById('btnCerrarUtilidades')?.addEventListener('click', cerrarUtilidadesPanel);
  utilidadesPanel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', (e) => {
    if (!utilidadesPanel.contains(e.target) && !btnUtilidadesInforme.contains(e.target)) {
      cerrarUtilidadesPanel();
    }
  });
  window.addEventListener('resize', () => {
    if (utilidadesPanel.classList.contains('show')) posicionarUtilidadesPanel();
  });

  // Desplegable de selección de tienda (elección única)
  const tiendaSelect = document.getElementById('utilTiendaSelect');
  const tiendaBtn = tiendaSelect.querySelector('.filtro-select-btn');
  tiendaBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    tiendaSelect.classList.toggle('open');
  });
  const buscadorTienda = document.getElementById('utilBuscarTienda');
  buscadorTienda.addEventListener('click', (e) => e.stopPropagation());
  buscadorTienda.addEventListener('input', () => {
    const q = buscadorTienda.value.trim().toUpperCase();
    document.querySelectorAll('#utilTiendaLista .util-tienda-opcion').forEach(row => {
      row.classList.toggle('oculto', q && !row.textContent.trim().toUpperCase().includes(q));
    });
  });

  document.getElementById('utilBtnGuardarAjuste')?.addEventListener('click', async () => {
    if (utilTiendaSeleccionada == null) return;
    const horaInput = document.getElementById('utilNuevaHora').value;
    const agenciaSel = document.getElementById('utilNuevaAgencia').value;
    const agenciaId = agenciaSel ? Number(agenciaSel) : null;

    if (!horaInput && agenciaId == null) {
      await modalAlert('Indica una nueva hora y/o una nueva agencia de entrega para aplicar el cambio puntual.', { titulo: 'Utilidades' });
      return;
    }

    try {
      await aplicarAjustePuntual(utilTiendaSeleccionada, { hora_prevista: horaInput || null, agenciaId });
      renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
      renderListaAjustesPuntuales();
      seleccionarTiendaUtilidades(utilTiendaSeleccionada);
    } catch (err) {
      console.error('Error guardando el cambio puntual:', err);
      await modalAlert('No se pudo guardar el cambio puntual.', { titulo: 'Error' });
    }
  });

  document.getElementById('utilBtnQuitarAjuste')?.addEventListener('click', async () => {
    if (utilTiendaSeleccionada == null) return;
    try {
      await quitarAjustePuntual(utilTiendaSeleccionada);
      renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
      renderListaAjustesPuntuales();
      seleccionarTiendaUtilidades(utilTiendaSeleccionada);
    } catch (err) {
      console.error('Error quitando el cambio puntual:', err);
      await modalAlert('No se pudo quitar el cambio puntual.', { titulo: 'Error' });
    }
  });
}

function construirListaTiendasUtilidades() {
  const lista = document.getElementById('utilTiendaLista');
  const tds = tiendasCache.filter(t => t.activo).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  lista.innerHTML = tds.map(t => {
    const ag = agenciasCache.find(a => a.id === t.agencia_id);
    return `
      <div class="filtro-check util-tienda-opcion" data-id="${t.id}">
        <span>${escapeHtml(t.nombre)}</span>
        <span style="margin-left:auto; font-size:11px; color:var(--ink-soft);">${escapeHtml(ag?.nombre || 'Sin agencia')}</span>
      </div>`;
  }).join('');
  lista.querySelectorAll('.util-tienda-opcion').forEach(row => {
    row.addEventListener('click', () => {
      seleccionarTiendaUtilidades(Number(row.dataset.id));
      document.getElementById('utilTiendaSelect').classList.remove('open');
    });
  });
}

function construirSelectAgenciaUtilidades() {
  const sel = document.getElementById('utilNuevaAgencia');
  sel.innerHTML = '<option value="">— Sin cambio —</option>' +
    agenciasCache.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
}

function seleccionarTiendaUtilidades(tiendaId) {
  utilTiendaSeleccionada = tiendaId;
  const form = document.getElementById('utilFormAjuste');
  const valorBtn = document.querySelector('#utilTiendaSelect .filtro-select-valor');

  if (tiendaId == null) {
    form.style.display = 'none';
    valorBtn.textContent = 'Selecciona una tienda…';
    return;
  }

  const t = tiendasCache.find(x => x.id === tiendaId);
  if (!t) { form.style.display = 'none'; return; }

  const ag = agenciasCache.find(a => a.id === t.agencia_id);
  const aj = ajustePuntualDeTienda(tiendaId);
  // Hora "de hoy" antes de un posible ajuste puntual: la del horario
  // semanal especial de hoy si la tienda tiene uno (p. ej. Martes o
  // Viernes), o si no la hora prevista general.
  const horaSemanalHoy = horaSemanalDeTienda(t, hoy);

  valorBtn.textContent = t.nombre;
  form.style.display = '';

  const horaInput = document.getElementById('utilNuevaHora');
  const horaOriginal = document.getElementById('utilHoraOriginal');
  horaInput.value = aj?.hora_prevista || '';
  const horaBaseTexto = horaSemanalHoy
    ? `${horaSemanalHoy.slice(0, 5)} (horario especial de los ${dias[hoy.getDay()].toLowerCase()}s)`
    : (t.hora_prevista ? t.hora_prevista.slice(0, 5) : '—');
  horaOriginal.textContent = aj?.hora_prevista
    ? `Hora habitual: ${horaBaseTexto} (cambiada solo hoy)`
    : `Hora habitual: ${horaBaseTexto}`;

  const agenciaSel = document.getElementById('utilNuevaAgencia');
  const agenciaOriginal = document.getElementById('utilAgenciaOriginal');
  agenciaSel.value = aj?.agencia_id != null ? String(aj.agencia_id) : '';
  agenciaOriginal.textContent = aj?.agencia_id != null
    ? `Agencia habitual: ${ag?.nombre || '—'} (cambiada solo hoy)`
    : `Agencia habitual: ${ag?.nombre || '—'}`;

  document.getElementById('utilBtnQuitarAjuste').style.display = aj ? '' : 'none';
}

// Refleja en el botón "Utilidades" el número de cambios puntuales
// configurados hoy, igual que el botón "Filtros" con su contador.
function actualizarBadgeUtilidades() {
  const badge = document.getElementById('utilidadesCount');
  if (!badge || !btnUtilidadesInforme) return;
  const total = Object.keys(informeHoyCache?.ajustes_puntuales || {}).length;
  if (total > 0) {
    badge.textContent = total;
    badge.style.display = '';
    btnUtilidadesInforme.classList.add('activo');
  } else {
    badge.style.display = 'none';
    btnUtilidadesInforme.classList.remove('activo');
  }
}

function renderListaAjustesPuntuales() {
  const cont = document.getElementById('utilListaAjustes');
  actualizarBadgeUtilidades();
  if (!cont) return;
  const mapa = informeHoyCache?.ajustes_puntuales || {};
  const ids = Object.keys(mapa);

  if (!ids.length) {
    cont.innerHTML = '<p style="margin:0; font-size:12.5px; color:var(--ink-soft);">Hoy no hay ningún cambio puntual aplicado.</p>';
    return;
  }

  cont.innerHTML = `
    <p style="margin:0 0 8px; font-size:12px; font-weight:700; color:var(--ink);">Cambios puntuales de hoy</p>
    ${ids.map(id => {
      const t = tiendasCache.find(x => x.id === Number(id));
      const aj = mapa[id];
      const partes = [];
      if (aj.hora_prevista) partes.push(`Hora → ${aj.hora_prevista.slice(0, 5)}`);
      if (aj.agencia_id != null) partes.push(`Agencia → ${escapeHtml(aj.agencia_nombre || '—')}`);
      return `
        <div class="util-ajuste-item" data-id="${id}">
          <div>
            <b>${escapeHtml(t?.nombre || `Tienda #${id}`)}</b>
            <div style="font-size:11.5px; color:var(--ink-soft);">${partes.join(' · ')}</div>
          </div>
          <button type="button" class="link-accion util-btn-quitar" data-id="${id}">Quitar</button>
        </div>`;
    }).join('')}`;

  cont.querySelectorAll('.util-btn-quitar').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await quitarAjustePuntual(Number(btn.dataset.id));
        renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
        renderListaAjustesPuntuales();
        if (utilTiendaSeleccionada === Number(btn.dataset.id)) seleccionarTiendaUtilidades(utilTiendaSeleccionada);
      } catch (err) {
        console.error('Error quitando el cambio puntual:', err);
        await modalAlert('No se pudo quitar el cambio puntual.', { titulo: 'Error' });
      }
    });
  });
}

construirPanelUtilidadesInforme();
