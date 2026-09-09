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
      || normalizarTextoBusqueda(t.provincia).includes(qNormalizada);
  }

  async function cargarAgenciasYTiendas() {
    const [{ data: ags, error: e1 }, { data: tds, error: e2 }] = await Promise.all([
      sb.from('agencias').select('id, nombre, orden').order('orden'),
      sb.from('tiendas').select('id, nombre, agencia_id, hora_prevista, horario_semana, marca, provincia, orden, activo').order('orden')
    ]);
    if (e1 || e2) { console.error(e1 || e2); return; }
    agenciasCache = ags || [];
    tiendasCache = tds || [];

    // rellenar el <select> de agencia del formulario de alta
    const sel = document.getElementById('ntAgencia');
    sel.innerHTML = agenciasCache.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');

    renderAcordeonTiendas();
  }

  function renderAcordeonTiendas() {
    const cont = document.getElementById('acordeonAgencias');
    const qNormalizada = normalizarTextoBusqueda(filtroTiendasTexto);
    const buscando = !!qNormalizada;

    const bloques = agenciasCache.map(ag => {
      const tds = tiendasCache.filter(t => t.agencia_id === ag.id && t.activo && tiendaCoincideBusqueda(t, qNormalizada));
      if (buscando && tds.length === 0) return ''; // oculta agencias sin coincidencias mientras se busca
      const abierta = buscando ? true : agenciasTiendasAbiertas.has(ag.id);
      const filas = tds.length
        ? tds.map(t => `
            <tr data-tienda="${t.id}">
              <td class="celda-nombre">${escapeHtml(t.nombre)}</td>
              <td class="hora celda-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}${badgeHorarioSemanaHtml(t)}</td>
              <td class="celda-provincia">${t.provincia ? escapeHtml(t.provincia) : '—'}</td>
              <td class="celda-marca"><span class="pill ${MARCA_CLASE[t.marca] || 'leve'}">${MARCA_LABEL[t.marca] || t.marca}</span></td>
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
                <button class="mini-btn" data-borrar title="Eliminar">🗑️</button>
              </td>
            </tr>`).join('')
        : `<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--ink-soft);">Sin tiendas en esta agencia.</td></tr>`;

      return `
        <div class="agencia-block">
          <div class="agencia-head ${abierta ? 'open' : ''}" data-agencia="${ag.id}">
            <span class="caret">▶</span>
            <b>${escapeHtml(ag.nombre)}</b>
            <span class="count">${tds.length} tienda${tds.length === 1 ? '' : 's'}</span>
          </div>
          <div class="agencia-body ${abierta ? 'open' : ''}">
            <div class="tabla-tiendas-scroll">
              <table class="tabla-tiendas">
                <thead>
                  <tr>
                    <th class="th-nombre">Tienda</th>
                    <th class="th-hora">Hora</th>
                    <th class="th-provincia">Provincia</th>
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

    document.getElementById('metNombre').value = t.nombre || '';
    document.getElementById('metHora').value = t.hora_prevista ? t.hora_prevista.slice(0, 5) : '';
    document.getElementById('metProvincia').value = t.provincia || '';
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
    const nombre = document.getElementById('metNombre').value.trim();
    const hora = document.getElementById('metHora').value;
    const provincia = document.getElementById('metProvincia').value.trim();
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
        nombre, hora_prevista: hora || null, provincia: provincia || null, marca
      }).eq('id', editarTiendaId);
      if (error) throw error;
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
  document.getElementById('modalEditarTiendaOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modalEditarTiendaOverlay') cerrarModalEditarTienda();
  });

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
      { titulo: 'Mover tienda de agencia', textoOk: 'Mover', valorInicial: t.agencia_id }
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
      `¿Eliminar "${t.nombre}"?`,
      { titulo: 'Eliminar tienda', danger: true, textoOk: 'Eliminar' }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('tiendas').update({ activo: false }).eq('id', id);
      if (error) throw error;
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error eliminando tienda:', err);
      await modalAlert('No se pudo eliminar la tienda.', { titulo: 'Error' });
    }
  }

  const formNuevaTienda = document.getElementById('formNuevaTienda');
  document.getElementById('btnNuevaTienda').addEventListener('click', () => {
    formNuevaTienda.style.display = formNuevaTienda.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btnCancelarTienda').addEventListener('click', () => {
    formNuevaTienda.style.display = 'none';
    document.getElementById('ntNombre').value = '';
    document.getElementById('ntHora').value = '';
    document.getElementById('ntProvincia').value = '';
  });
  document.getElementById('btnGuardarTienda').addEventListener('click', async () => {
    const nombre = document.getElementById('ntNombre').value.trim();
    const agenciaId = Number(document.getElementById('ntAgencia').value);
    const hora = document.getElementById('ntHora').value;
    const provincia = document.getElementById('ntProvincia').value.trim();
    const marca = document.getElementById('ntMarca').value;
    const errEl = document.getElementById('ntError');
    errEl.style.display = 'none';

    if (!nombre || !agenciaId) {
      errEl.textContent = 'Rellena al menos el nombre y la agencia.';
      errEl.style.display = 'block';
      return;
    }

    const maxOrden = Math.max(0, ...tiendasCache.filter(t => t.agencia_id === agenciaId).map(t => t.orden));

    try {
      const { error } = await sb.from('tiendas').insert({
        nombre, agencia_id: agenciaId, hora_prevista: hora || null, provincia: provincia || null, marca, orden: maxOrden + 1
      });
      if (error) throw error;
      formNuevaTienda.style.display = 'none';
      document.getElementById('ntNombre').value = '';
      document.getElementById('ntHora').value = '';
      document.getElementById('ntProvincia').value = '';
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error creando tienda:', err);
      errEl.textContent = 'No se pudo crear la tienda.';
      errEl.style.display = 'block';
    }
  });

  let tiendasCargadasYa = false;
  document.querySelectorAll('[data-view="config-tiendas"]').forEach(el => {
    el.addEventListener('click', () => {
      if (!tiendasCargadasYa) { tiendasCargadasYa = true; cargarAgenciasYTiendas(); }
    });
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
    const mapa = {};
    document.querySelectorAll('#modalHorarioDias .mh-hora').forEach(input => {
      if (input.value) mapa[input.dataset.dia] = input.value;
    });
    try {
      const { error } = await sb.from('tiendas')
        .update({ horario_semana: Object.keys(mapa).length ? mapa : null })
        .eq('id', horarioSemanaTiendaId);
      if (error) throw error;
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
  document.getElementById('modalHorarioOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modalHorarioOverlay') cerrarModalHorarioSemana();
  });

  // ---------------------------------------------------------------
