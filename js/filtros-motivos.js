  // Selects desplegables (Agencia / Tipo / Motivo) dentro del panel
  // ---------------------------------------------------------------
  const NOMBRES_FILTRO_GRUPO = { agencia: 'agencia', tipo: 'tipo', motivo: 'motivo' };

  function actualizarValoresSelects() {
    document.querySelectorAll('.filtro-select').forEach(sel => {
      const grupo = sel.dataset.grupo;
      const set = grupo === 'agencia' ? filtrosIncidencias.agencias
                : grupo === 'tipo' ? filtrosIncidencias.tipos
                : filtrosIncidencias.motivos;
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

  function cerrarTodosLosSelects(excepto) {
    document.querySelectorAll('.filtro-select.open').forEach(sel => {
      if (sel !== excepto) sel.classList.remove('open');
    });
  }

  document.querySelectorAll('.filtro-select').forEach(sel => {
    const btn = sel.querySelector('.filtro-select-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const yaAbierto = sel.classList.contains('open');
      cerrarTodosLosSelects(sel);
      sel.classList.toggle('open', !yaAbierto);
    });
    const buscador = sel.querySelector('.filtro-select-search input');
    if (buscador) {
      buscador.addEventListener('click', (e) => e.stopPropagation());
      buscador.addEventListener('input', () => {
        const q = buscador.value.trim().toUpperCase();
        sel.querySelectorAll('.filtro-check').forEach(row => {
          const texto = row.textContent.trim().toUpperCase();
          row.classList.toggle('oculto', q && !texto.includes(q));
        });
      });
    }
  });

  document.addEventListener('click', () => cerrarTodosLosSelects(null));

  const TIPOS_FILTRO = [
    { v: 'GRAVE', label: 'Grave' },
    { v: 'MODERADO', label: 'Moderado' },
    { v: 'LEVE', label: 'Leve' },
    { v: 'PENDIENTE', label: 'Pendiente' }
  ];

  function construirPanelFiltrosIncidencias() {
    const listaAg = document.getElementById('filtrosAgenciasLista');
    const listaTipos = document.getElementById('filtrosTiposLista');
    const listaMotivos = document.getElementById('filtrosMotivosLista');

    if (!listaAg.dataset.built) {
      listaAg.innerHTML = agenciasCache.map(ag => `
        <label class="filtro-check">
          <input type="checkbox" value="${ag.id}" data-filtro="agencia">
          <span>${escapeHtml(ag.nombre)}</span>
        </label>`).join('');
      listaAg.dataset.built = '1';
    }

    if (!listaTipos.dataset.built) {
      listaTipos.innerHTML = TIPOS_FILTRO.map(t => `
        <label class="filtro-check">
          <input type="checkbox" value="${t.v}" data-filtro="tipo">
          <span class="pill ${t.v.toLowerCase()}">${t.label}</span>
        </label>`).join('');
      listaTipos.dataset.built = '1';
    }

    if (!listaMotivos.dataset.built) {
      listaMotivos.innerHTML = MOTIVOS.map(m => `
        <label class="filtro-check">
          <input type="checkbox" value="${escapeHtml(m.v)}" data-filtro="motivo">
          <span>${m.v.charAt(0)}${m.v.slice(1).toLowerCase()}</span>
        </label>`).join('');
      listaMotivos.dataset.built = '1';
    }

    const panel = document.getElementById('filtrosPanel');
    if (!panel.dataset.wired) {
      panel.addEventListener('change', (e) => {
        const cb = e.target;
        if (!cb.matches('input[type="checkbox"]')) return;
        if (cb.id === 'filtroSoloConIncidencias') {
          filtrosIncidencias.soloConIncidencias = cb.checked;
          actualizarBadgeFiltros();
          renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
          return;
        }
        const grupo = cb.dataset.filtro;
        const set = grupo === 'agencia' ? filtrosIncidencias.agencias
                  : grupo === 'tipo' ? filtrosIncidencias.tipos
                  : filtrosIncidencias.motivos;
        const val = grupo === 'agencia' ? Number(cb.value) : cb.value;
        if (cb.checked) set.add(val); else set.delete(val);
        actualizarBadgeFiltros();
        actualizarValoresSelects();
        renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
      });
      panel.dataset.wired = '1';
    }
  }

  function actualizarBadgeFiltros() {
    const total = filtrosIncidencias.agencias.size + filtrosIncidencias.tipos.size + filtrosIncidencias.motivos.size + (filtrosIncidencias.soloConIncidencias ? 1 : 0);
    const badge = document.getElementById('filtrosCount');
    const btn = document.getElementById('btnFiltrosIncidencias');
    if (total > 0) {
      badge.textContent = total;
      badge.style.display = '';
      btn.classList.add('activo');
    } else {
      badge.style.display = 'none';
      btn.classList.remove('activo');
    }
  }

  const btnFiltrosIncidencias = document.getElementById('btnFiltrosIncidencias');
  const filtrosPanel = document.getElementById('filtrosPanel');

  function posicionarFiltrosPanel() {
    const wrap = btnFiltrosIncidencias.closest('.filtros-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const margen = 12;
    const ancho = Math.min(560, window.innerWidth - margen * 2);
    filtrosPanel.style.width = ancho + 'px';
    let left = 0;
    const desbordeDerecha = (wrapRect.left + left + ancho) - (window.innerWidth - margen);
    if (desbordeDerecha > 0) left -= desbordeDerecha;
    if (wrapRect.left + left < margen) left = margen - wrapRect.left;
    filtrosPanel.style.left = left + 'px';
  }

  function abrirFiltrosPanel() {
    posicionarFiltrosPanel();
    filtrosPanel.classList.add('show');
    btnFiltrosIncidencias.classList.add('open');
  }
  function cerrarFiltrosPanel() {
    filtrosPanel.classList.remove('show');
    btnFiltrosIncidencias.classList.remove('open');
    cerrarTodosLosSelects(null);
  }

  window.addEventListener('resize', () => {
    if (filtrosPanel.classList.contains('show')) posicionarFiltrosPanel();
  });

  btnFiltrosIncidencias.addEventListener('click', (e) => {
    e.stopPropagation();
    if (filtrosPanel.classList.contains('show')) cerrarFiltrosPanel();
    else abrirFiltrosPanel();
  });

  filtrosPanel.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', (e) => {
    if (!filtrosPanel.contains(e.target) && !btnFiltrosIncidencias.contains(e.target)) {
      cerrarFiltrosPanel();
    }
  });

  document.getElementById('btnCerrarFiltros').addEventListener('click', cerrarFiltrosPanel);

  document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
    filtrosIncidencias.agencias.clear();
    filtrosIncidencias.tipos.clear();
    filtrosIncidencias.motivos.clear();
    filtrosIncidencias.soloConIncidencias = false;
    document.querySelectorAll('#filtrosPanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    actualizarBadgeFiltros();
    actualizarValoresSelects();
    renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
  });

  async function guardarIncidencia(tiendaId, tr) {
    const motivos = Array.from(tr.querySelectorAll('.i-motivo-check:checked')).map(cb => cb.value);
    const observaciones = tr.querySelector('.i-obs').value.trim().toUpperCase();
    const marcada = motivos.length > 0;
    const tipo = calcularTipo(motivos);

    try {
      const { error } = await sb.from('incidencias').upsert({
        informe_id: informeHoyCache.id,
        tienda_id: tiendaId,
        marcada, tipo, motivo: motivos, observaciones,
        usuario: sesionActual?.nombre || sesionActual?.usuario || null,
        actualizado_en: new Date().toISOString()
      }, { onConflict: 'informe_id,tienda_id' });
      if (error) throw error;

      await cargarIncidenciasHoy();
      if (filtrosActivos()) {
        // Con filtros activos, la fila podría dejar de cumplirlos: recalculamos el listado
        // (el estado de agencias desplegadas ya se conserva, así que no se cierra nada).
        renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias').value);
      } else {
        actualizarFilaIncidencia(tiendaId, tr);
      }
      actualizarKpiIncidencias();
    } catch (err) {
      console.error('Error guardando incidencia:', err);
      await modalAlert('No se pudo guardar el cambio.', { titulo: 'Error' });
    }
  }

  // Actualiza solo la fila afectada (y el contador de su agencia) sin
  // reconstruir el acordeón entero, para no perder el desplegado/scroll.
  function actualizarFilaIncidencia(tiendaId, tr) {
    const inc = incidenciaDeTienda(tiendaId);
    const motivosActuales = inc?.motivo || [];
    const marcada = motivosActuales.length > 0;
    const tipoCalc = calcularTipo(motivosActuales);
    const esPendiente = marcada && !tipoCalc;
    const claseFila = marcada ? (tipoCalc ? tipoCalc.toLowerCase() : 'pendiente') : '';

    tr.className = claseFila ? 'con-incidencia ' + claseFila : '';
    tr.querySelector('.col-estado').textContent = marcada ? '🔴' : '—';

    const badgeTipo = !marcada
      ? '<span style="color:var(--ink-soft); font-size:12px;">—</span>'
      : esPendiente
        ? '<span class="pill pendiente">Pendiente</span>'
        : `<span class="pill ${tipoCalc.toLowerCase()}">${tipoCalc.charAt(0)+tipoCalc.slice(1).toLowerCase()}</span>`;
    tr.querySelector('.col-tipo').innerHTML = badgeTipo;

    // Etiqueta del desplegable de motivos (el desplegable en sí se deja abierto
    // si el usuario lo tenía abierto, para poder seguir marcando varios motivos seguidos).
    const valorEl = tr.querySelector('.motivo-select-valor');
    if (valorEl) valorEl.textContent = resumenMotivos(motivosActuales);

    const bloque = tr.closest('.agencia-block');
    if (bloque) {
      const numInc = bloque.querySelectorAll('tr.con-incidencia').length;
      const head = bloque.querySelector('.agencia-head');
      let contEl = head.querySelector('.conteo-inc');
      if (numInc > 0) {
        if (!contEl) {
          contEl = document.createElement('span');
          contEl.className = 'conteo-inc';
          head.appendChild(contEl);
        }
        contEl.textContent = `${numInc} incidencia${numInc === 1 ? '' : 's'}`;
      } else if (contEl) {
        contEl.remove();
      }
    }
  }

  document.getElementById('buscarTiendaIncidencias').addEventListener('input', (e) => {
    renderAcordeonIncidencias(e.target.value);
  });

  async function ensureAgenciasYTiendasCargadas() {
    if (!agenciasCache.length) await cargarAgenciasYTiendas();
  }

  // (la apertura de "Informe del día" ahora se gestiona en el desplegable "Informes diarios")

  // Arranque: comprobar informe de hoy en cuanto hay sesión
  // ---------------------------------------------------------------
  // Motivos de incidencia (lista cerrada) y cálculo automático de TIPO
  // ---------------------------------------------------------------
  const MOTIVOS = [
    { v: 'RETRASO PDTE CONFIRMAR',      clase: 'pendiente' },
    { v: 'REVISANDO POSIBLE INCIDENCIA', clase: 'pendiente' },
    { v: 'ROTURA SIN INCIDENCIA',        clase: 'leve' },
    { v: 'ROTURA ALMACEN',               clase: 'leve' },
    { v: 'RETRASO LEVE',                 clase: 'leve' },
    { v: 'PALETS NO RETIRADOS',          clase: 'leve' },
    { v: 'DESCARGA MANUAL',              clase: 'leve' },
    { v: 'ROTURA CONFIRMADA',            clase: 'moderado' },
    { v: 'PALETS SIN VIGILANCIA',        clase: 'moderado' },
    { v: 'MEZCLAN FECHAS',               clase: 'moderado' },
    { v: 'RETRASO IMPORTANTE',           clase: 'moderado' },
    { v: 'ADELANTAN ENTREGA',            clase: 'moderado' },
    { v: 'INCOMPLETO',                   clase: 'moderado' },
    { v: 'FALTAS',                       clase: 'grave' },
    { v: 'NO ENTREGAN',                  clase: 'grave' },
    { v: 'PALET PERDIDO',                clase: 'grave' },
    { v: 'PALET MANIPULADO',             clase: 'grave' }
  ];

  const RE_GRAVE = /faltas|no entregan|palet perdido|palet manipulado/i;
  const RE_MODERADO = /rotura confirmada|palets sin vigilancia|mezclan fechas|retraso importante|adelantan entrega|incompleto/i;
  const RE_LEVE = /rotura sin incidencia|rotura almacen|retraso leve|descarga manual|palets no retirados/i;

  // Calcula el tipo (GRAVE/MODERADO/LEVE/null) a partir de uno o varios motivos.
  // Si hay varios motivos seleccionados, se queda con el más grave de todos.
  function calcularTipo(motivos) {
    const arr = Array.isArray(motivos) ? motivos : (motivos ? [motivos] : []);
    if (!arr.length) return null;
    if (arr.some(m => RE_GRAVE.test(m))) return 'GRAVE';
    if (arr.some(m => RE_MODERADO.test(m))) return 'MODERADO';
    if (arr.some(m => RE_LEVE.test(m))) return 'LEVE';
    return null; // motivos "pendientes" (RETRASO PDTE CONFIRMAR / REVISANDO POSIBLE INCIDENCIA)
  }

  // Texto corto que se muestra en el botón del desplegable de motivos de cada fila.
  function resumenMotivos(motivos) {
  const arr = motivos || [];
  if (!arr.length) return '— Sin incidencia —';
  return arr.map(m => m.charAt(0) + m.slice(1).toLowerCase()).join(', ');
}

  // Lista de checkboxes (uno por motivo posible) para el desplegable de cada fila.
  function motivosChecklistHtml(seleccionados) {
    const sel = seleccionados || [];
    return MOTIVOS.map(m => `
      <label class="filtro-check">
        <input type="checkbox" class="i-motivo-check" value="${escapeHtml(m.v)}" ${sel.includes(m.v) ? 'checked' : ''}>
        <span>${m.v.charAt(0)}${m.v.slice(1).toLowerCase()}</span>
      </label>`).join('');
  }

  // ---------------------------------------------------------------
