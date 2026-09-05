// ---------------------------------------------------------------
  // Análisis · Ranking de tiendas y agencias
  // ---------------------------------------------------------------
  // Cuenta incidencias (activas, marcada=true) y siniestros generados en un
  // rango de fechas, agrupados por tienda o por agencia, usando el snapshot
  // que ya guarda cada incidencia (tienda_nombre/agencia_nombre) — igual que
  // hace el historial de informes, para no depender de tiendas/agencias que
  // puedan haber cambiado desde entonces.
  let analisisEntidad = 'tiendas';    // 'tiendas' | 'agencias'
  let analisisOrden = 'incidencias';  // 'incidencias' | 'siniestros'
  let analisisDatos = null;           // { incidencias:[...], siniestros:[...] } del último rango consultado
  let analisisInicializado = false;

  // Filtros del panel "Filtrar ranking" (agencia/tienda/tipo/motivo/tipo de
  // siniestro + "solo con siniestros"). Independientes de los filtros del
  // Informe del día, aunque reutilizan el mismo componente visual.
  const filtrosAnalisis = {
    agencias: new Set(),
    tiendas: new Set(),
    tipos: new Set(),
    motivos: new Set(),
    siniestroTipos: new Set(),
    soloConSiniestros: false
  };
  const TIPOS_SINIESTRO_FILTRO = [
    { v: 'ROTURA', label: 'Rotura' },
    { v: 'FALTA', label: 'Falta' },
    { v: 'MIXTO', label: 'Mixto' }
  ];

  // ¿Esta incidencia pasa los filtros de agencia/tienda/tipo/motivo?
  function pasaFiltrosIncidencia(i) {
    if (filtrosAnalisis.agencias.size && !filtrosAnalisis.agencias.has(i.agencia_id)) return false;
    if (filtrosAnalisis.tiendas.size && !filtrosAnalisis.tiendas.has(i.tienda_id)) return false;
    if (filtrosAnalisis.tipos.size && !filtrosAnalisis.tipos.has(i.tipo || 'PENDIENTE')) return false;
    if (filtrosAnalisis.motivos.size) {
      const motivos = i.motivo || [];
      if (!motivos.some(m => filtrosAnalisis.motivos.has(m))) return false;
    }
    return true;
  }

  function incidenciasFiltradas() {
    return (analisisDatos?.incidencias || []).filter(pasaFiltrosIncidencia);
  }

  // Siniestros cuya incidencia asociada pasa los filtros de arriba, y que
  // además cumplen el filtro de "Tipo de siniestro" si hay alguno marcado.
  function siniestrosFiltrados(idsIncidenciasFiltradas) {
    return (analisisDatos?.siniestros || []).filter(s =>
      idsIncidenciasFiltradas.has(s.incidencia_id) &&
      (!filtrosAnalisis.siniestroTipos.size || filtrosAnalisis.siniestroTipos.has(s.tipo))
    );
  }

  const analisisDesdeInput = document.getElementById('analisisDesde');
  const analisisHastaInput = document.getElementById('analisisHasta');

  function primerDiaMesActualISO() {
    const d = new Date();
    return fechaLocalISO(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  function aplicarRangoRapido(rango) {
    if (rango === 'mes') {
      analisisDesdeInput.value = primerDiaMesActualISO();
      analisisHastaInput.value = fechaHoyISO;
    } else if (rango === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      analisisDesdeInput.value = fechaLocalISO(d);
      analisisHastaInput.value = fechaHoyISO;
    } else if (rango === 'todo') {
      analisisDesdeInput.value = '';
      analisisHastaInput.value = fechaHoyISO;
    }
    document.querySelectorAll('#analisisRangoRapido [data-rango]')
      .forEach(b => b.classList.toggle('activo', b.dataset.rango === rango));
    cargarAnalisisRanking();
  }

  document.querySelectorAll('#analisisRangoRapido [data-rango]').forEach(btn => {
    btn.addEventListener('click', () => aplicarRangoRapido(btn.dataset.rango));
  });

  document.getElementById('btnAnalisisConsultar').addEventListener('click', () => {
    document.querySelectorAll('#analisisRangoRapido [data-rango]').forEach(b => b.classList.remove('activo'));
    cargarAnalisisRanking();
  });

  document.querySelectorAll('#analisisEntidadToggle [data-entidad]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('activo')) return;
      analisisEntidad = btn.dataset.entidad;
      document.querySelectorAll('#analisisEntidadToggle [data-entidad]').forEach(b => b.classList.toggle('activo', b === btn));
      renderAnalisisRanking();
    });
  });

  document.querySelectorAll('#analisisOrdenToggle [data-orden]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('activo')) return;
      analisisOrden = btn.dataset.orden;
      document.querySelectorAll('#analisisOrdenToggle [data-orden]').forEach(b => b.classList.toggle('activo', b === btn));
      renderAnalisisRanking();
    });
  });

  // Al entrar por primera vez en la pestaña, consulta el mes en curso.
  // En visitas siguientes se respeta el último rango/filtro que eligió el usuario.
  function renderVistaAnalisisRanking() {
    if (analisisInicializado) return;
    analisisInicializado = true;
    aplicarRangoRapido('mes');
  }

  async function cargarAnalisisRanking() {
    const cont = document.getElementById('contenidoAnalisisRanking');
    const desde = analisisDesdeInput.value || null;
    const hasta = analisisHastaInput.value || fechaHoyISO;

    if (desde && desde > hasta) {
      await modalAlert('La fecha "Desde" no puede ser posterior a "Hasta".', { titulo: 'Rango de fechas' });
      return;
    }

    cont.innerHTML = `<div class="card"><div class="empty"><p>Calculando ranking…</p></div></div>`;
    pintarKpisAnalisis(null);

    try {
      let q = sb.from('informes_diarios').select('id, fecha').lte('fecha', hasta);
      if (desde) q = q.gte('fecha', desde);
      const { data: informes, error: eInf } = await q;
      if (eInf) throw eInf;

      if (!informes || !informes.length) {
        analisisDatos = { incidencias: [], siniestros: [] };
        pintarKpisAnalisis(analisisDatos);
        cont.innerHTML = `
          <div class="card">
            <div class="empty">
              <div class="glyph">📭</div>
              <h3>Sin informes en ese periodo</h3>
              <p>No se generó ningún informe diario entre esas fechas.</p>
            </div>
          </div>`;
        return;
      }

      const idsInformes = informes.map(i => i.id);

      const { data: incs, error: eInc } = await sb
        .from('incidencias')
        .select('id, tipo, motivo, tienda_id, tienda_nombre, agencia_id, agencia_nombre')
        .in('informe_id', idsInformes)
        .eq('marcada', true);
      if (eInc) throw eInc;

      const idsIncidencias = (incs || []).map(i => i.id);
      let sins = [];
      if (idsIncidencias.length) {
        const { data: sinsData, error: eSin } = await sb
          .from('siniestros')
          .select('id, incidencia_id, tipo, estado')
          .in('incidencia_id', idsIncidencias);
        if (eSin) throw eSin;
        sins = sinsData || [];
      }

      analisisDatos = { incidencias: incs || [], siniestros: sins };
      renderAnalisisRanking();
    } catch (err) {
      console.error('Error cargando ranking de análisis:', err);
      cont.innerHTML = `<div class="card"><div class="empty"><p style="color:var(--grave);">Error al calcular el ranking.</p></div></div>`;
    }
  }

  function pintarKpisAnalisis(datos) {
    if (!datos) {
      document.getElementById('akIncidencias').textContent = '—';
      document.getElementById('akGraves').textContent = '—';
      document.getElementById('akSiniestros').textContent = '—';
      document.getElementById('akSiniestrosPend').textContent = '—';
      return;
    }
    // Los KPI respetan los filtros de agencia/tienda/tipo/motivo/tipo de
    // siniestro (así no muestran un total distinto al de la tabla de abajo).
    const incs = incidenciasFiltradas();
    const sins = siniestrosFiltrados(new Set(incs.map(i => i.id)));
    document.getElementById('akIncidencias').textContent = incs.length;
    document.getElementById('akGraves').textContent = incs.filter(i => i.tipo === 'GRAVE').length;
    document.getElementById('akSiniestros').textContent = sins.length;
    document.getElementById('akSiniestrosPend').textContent = sins.filter(s => s.estado === 'PENDIENTE').length;
  }

  // Agrupa incidencias + siniestros por tienda o por agencia, ya filtradas.
  function agregarAnalisis(entidad) {
    const incs = incidenciasFiltradas();
    const sins = siniestrosFiltrados(new Set(incs.map(i => i.id)));
    const porIncidencia = new Map(incs.map(i => [i.id, i]));
    const mapa = new Map();

    incs.forEach(i => {
      const clave = entidad === 'tiendas' ? i.tienda_id : i.agencia_id;
      if (clave == null) return;
      if (!mapa.has(clave)) {
        mapa.set(clave, {
          nombre: entidad === 'tiendas' ? (i.tienda_nombre || '—') : (i.agencia_nombre || 'Sin agencia'),
          agenciaNombre: entidad === 'tiendas' ? (i.agencia_nombre || null) : null,
          leve: 0, moderado: 0, grave: 0, pendiente: 0, incidencias: 0,
          sinFalta: 0, sinRotura: 0, sinMixto: 0, siniestros: 0
        });
      }
      const e = mapa.get(clave);
      e.incidencias++;
      // Una incidencia "marcada" puede no tener tipo todavía (motivo aún sin
      // confirmar, ej. "RETRASO PDTE CONFIRMAR"/"REVISANDO POSIBLE INCIDENCIA").
      // Se cuenta como "pendiente" para que el desglose siempre sume el total.
      if (i.tipo === 'LEVE') e.leve++;
      else if (i.tipo === 'MODERADO') e.moderado++;
      else if (i.tipo === 'GRAVE') e.grave++;
      else e.pendiente++;
    });

    sins.forEach(s => {
      const inc = porIncidencia.get(s.incidencia_id);
      if (!inc) return;
      const clave = entidad === 'tiendas' ? inc.tienda_id : inc.agencia_id;
      if (clave == null || !mapa.has(clave)) return;
      const e = mapa.get(clave);
      e.siniestros++;
      if (s.tipo === 'FALTA') e.sinFalta++;
      else if (s.tipo === 'ROTURA') e.sinRotura++;
      else if (s.tipo === 'MIXTO') e.sinMixto++;
    });

    return Array.from(mapa.values());
  }

  function renderAnalisisRanking() {
    const cont = document.getElementById('contenidoAnalisisRanking');
    if (!analisisDatos) return;
    pintarKpisAnalisis(analisisDatos);

    let filas = agregarAnalisis(analisisEntidad);
    if (filtrosAnalisis.soloConSiniestros) filas = filas.filter(f => f.siniestros > 0);

    if (!filas.length) {
      cont.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="glyph">✅</div>
            <h3>Sin resultados</h3>
            <p>No hay ${analisisEntidad === 'tiendas' ? 'tiendas' : 'agencias'} que coincidan con el periodo y los filtros elegidos.</p>
          </div>
        </div>`;
      return;
    }

    const metrica = analisisOrden === 'siniestros' ? 'siniestros' : 'incidencias';
    filas.sort((a, b) => b[metrica] - a[metrica] || b.incidencias - a.incidencias || a.nombre.localeCompare(b.nombre));

    const top = filas.slice(0, 10);
    const max = Math.max(1, ...top.map(f => f[metrica]));
    const etiquetaEntidad = analisisEntidad === 'tiendas' ? 'tiendas' : 'agencias';
    const etiquetaMetrica = metrica === 'siniestros' ? 'siniestros' : 'incidencias';

    const chart = `
      <div class="card ranking-chart-card">
        <h3 class="ranking-chart-title">Top ${top.length} ${etiquetaEntidad} por ${etiquetaMetrica}</h3>
        <div class="ranking-chart">
          ${top.map((f, idx) => `
            <div class="ranking-bar-row">
              <span class="ranking-bar-label" title="${escapeHtml(f.nombre)}">${idx + 1}. ${escapeHtml(f.nombre)}</span>
              <div class="ranking-bar-track"><div class="ranking-bar-fill" style="width:${(f[metrica] / max * 100).toFixed(1)}%"></div></div>
              <span class="ranking-bar-value">${f[metrica]}</span>
            </div>`).join('')}
        </div>
      </div>`;

    const filasTabla = filas.map((f, idx) => `
      <tr>
        <td class="col-pos">${idx + 1}</td>
        <td>
          <b>${escapeHtml(f.nombre)}</b>
          ${f.agenciaNombre ? `<div style="font-size:11.5px; color:var(--ink-soft);">${escapeHtml(f.agenciaNombre)}</div>` : ''}
        </td>
        <td class="col-num">${f.incidencias}</td>
        <td class="col-desglose">
          ${f.grave ? `<span class="pill grave">${f.grave} grave${f.grave === 1 ? '' : 's'}</span>` : ''}
          ${f.moderado ? `<span class="pill moderado">${f.moderado} moderada${f.moderado === 1 ? '' : 's'}</span>` : ''}
          ${f.leve ? `<span class="pill leve">${f.leve} leve${f.leve === 1 ? '' : 's'}</span>` : ''}
          ${f.pendiente ? `<span class="pill pendiente">${f.pendiente} pdte. confirmar</span>` : ''}
          ${!f.grave && !f.moderado && !f.leve && !f.pendiente ? '—' : ''}
        </td>
        <td class="col-num">${f.siniestros}</td>
        <td class="col-desglose">
          ${f.sinRotura ? `<span class="pill grave">${f.sinRotura} rotura${f.sinRotura === 1 ? '' : 's'}</span>` : ''}
          ${f.sinFalta ? `<span class="pill moderado">${f.sinFalta} falta${f.sinFalta === 1 ? '' : 's'}</span>` : ''}
          ${f.sinMixto ? `<span class="pill grave">${f.sinMixto} mixto${f.sinMixto === 1 ? '' : 's'}</span>` : ''}
          ${!f.sinRotura && !f.sinFalta && !f.sinMixto ? '—' : ''}
        </td>
      </tr>`).join('');

    const tabla = `
      <div class="card" style="overflow-x:auto;">
        <table class="tabla-ranking">
          <colgroup>
            <col class="cg-pos"><col class="cg-nombre">
            <col class="cg-num"><col class="cg-desglose">
            <col class="cg-num"><col class="cg-desglose">
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>${analisisEntidad === 'tiendas' ? 'Tienda' : 'Agencia'}</th>
              <th class="col-num">Incidencias</th>
              <th>Desglose incidencias</th>
              <th class="col-num">Siniestros</th>
              <th>Tipo de siniestro</th>
            </tr>
          </thead>
          <tbody>${filasTabla}</tbody>
        </table>
      </div>`;

    cont.innerHTML = chart + tabla;
  }

  // ---------------------------------------------------------------
  // Panel "Filtrar ranking" (mismo componente visual que el de Informe del
  // día: botón + panel flotante con selects de checkboxes buscables).
  // ---------------------------------------------------------------
  async function construirPanelFiltrosAnalisis() {
    await ensureAgenciasYTiendasCargadas();

    const listaAg = document.getElementById('analisisFiltrosAgenciasLista');
    const listaTd = document.getElementById('analisisFiltrosTiendasLista');
    const listaTipos = document.getElementById('analisisFiltrosTiposLista');
    const listaMotivos = document.getElementById('analisisFiltrosMotivosLista');
    const listaSin = document.getElementById('analisisFiltrosSiniestroTiposLista');

    if (!listaAg.dataset.built) {
      listaAg.innerHTML = agenciasCache.map(ag => `
        <label class="filtro-check">
          <input type="checkbox" value="${ag.id}" data-filtro="agencia">
          <span>${escapeHtml(ag.nombre)}</span>
        </label>`).join('');
      listaAg.dataset.built = '1';
    }
    if (!listaTd.dataset.built) {
      listaTd.innerHTML = tiendasCache.filter(t => t.activo).map(t => `
        <label class="filtro-check">
          <input type="checkbox" value="${t.id}" data-filtro="tienda">
          <span>${escapeHtml(t.nombre)}</span>
        </label>`).join('');
      listaTd.dataset.built = '1';
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
    if (!listaSin.dataset.built) {
      listaSin.innerHTML = TIPOS_SINIESTRO_FILTRO.map(t => `
        <label class="filtro-check">
          <input type="checkbox" value="${t.v}" data-filtro="siniestro">
          <span class="pill ${t.v === 'FALTA' ? 'moderado' : 'grave'}">${t.label}</span>
        </label>`).join('');
      listaSin.dataset.built = '1';
    }

    const panel = document.getElementById('analisisFiltrosPanel');
    if (!panel.dataset.wired) {
      panel.addEventListener('change', (e) => {
        const cb = e.target;
        if (!cb.matches('input[type="checkbox"]')) return;
        if (cb.id === 'analisisFiltroSoloConSiniestros') {
          filtrosAnalisis.soloConSiniestros = cb.checked;
          actualizarBadgeFiltrosAnalisis();
          renderAnalisisRanking();
          return;
        }
        const grupo = cb.dataset.filtro;
        const set = grupo === 'agencia' ? filtrosAnalisis.agencias
                  : grupo === 'tienda' ? filtrosAnalisis.tiendas
                  : grupo === 'tipo' ? filtrosAnalisis.tipos
                  : grupo === 'siniestro' ? filtrosAnalisis.siniestroTipos
                  : filtrosAnalisis.motivos;
        const val = (grupo === 'agencia' || grupo === 'tienda') ? Number(cb.value) : cb.value;
        if (cb.checked) set.add(val); else set.delete(val);
        actualizarBadgeFiltrosAnalisis();
        actualizarValoresSelectsAnalisis();
        renderAnalisisRanking();
      });
      panel.dataset.wired = '1';
    }
  }

  function actualizarValoresSelectsAnalisis() {
    document.querySelectorAll('#analisisFiltrosPanel .filtro-select').forEach(sel => {
      const grupo = sel.dataset.grupo;
      const set = grupo === 'agencia' ? filtrosAnalisis.agencias
                : grupo === 'tienda' ? filtrosAnalisis.tiendas
                : grupo === 'tipo' ? filtrosAnalisis.tipos
                : grupo === 'siniestro' ? filtrosAnalisis.siniestroTipos
                : filtrosAnalisis.motivos;
      const valor = sel.querySelector('.filtro-select-valor');
      if (set.size === 0) {
        valor.textContent = grupo === 'agencia' || grupo === 'tienda' ? 'Todas' : 'Todos';
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

  function actualizarBadgeFiltrosAnalisis() {
    const total = filtrosAnalisis.agencias.size + filtrosAnalisis.tiendas.size + filtrosAnalisis.tipos.size
      + filtrosAnalisis.motivos.size + filtrosAnalisis.siniestroTipos.size + (filtrosAnalisis.soloConSiniestros ? 1 : 0);
    const badge = document.getElementById('analisisFiltrosCount');
    const btn = document.getElementById('btnAnalisisFiltros');
    if (total > 0) {
      badge.textContent = total;
      badge.style.display = '';
      btn.classList.add('activo');
    } else {
      badge.style.display = 'none';
      btn.classList.remove('activo');
    }
  }

  const btnAnalisisFiltros = document.getElementById('btnAnalisisFiltros');
  const analisisFiltrosPanel = document.getElementById('analisisFiltrosPanel');

  function posicionarAnalisisFiltrosPanel() {
    const wrap = btnAnalisisFiltros.closest('.filtros-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const margen = 12;
    const ancho = Math.min(560, window.innerWidth - margen * 2);
    analisisFiltrosPanel.style.width = ancho + 'px';
    let left = 0;
    const desbordeDerecha = (wrapRect.left + left + ancho) - (window.innerWidth - margen);
    if (desbordeDerecha > 0) left -= desbordeDerecha;
    if (wrapRect.left + left < margen) left = margen - wrapRect.left;
    analisisFiltrosPanel.style.left = left + 'px';
  }

  async function abrirAnalisisFiltrosPanel() {
    await construirPanelFiltrosAnalisis();
    posicionarAnalisisFiltrosPanel();
    analisisFiltrosPanel.classList.add('show');
    btnAnalisisFiltros.classList.add('open');
  }
  function cerrarAnalisisFiltrosPanel() {
    analisisFiltrosPanel.classList.remove('show');
    btnAnalisisFiltros.classList.remove('open');
  }

  window.addEventListener('resize', () => {
    if (analisisFiltrosPanel.classList.contains('show')) posicionarAnalisisFiltrosPanel();
  });

  btnAnalisisFiltros.addEventListener('click', (e) => {
    e.stopPropagation();
    if (analisisFiltrosPanel.classList.contains('show')) cerrarAnalisisFiltrosPanel();
    else abrirAnalisisFiltrosPanel();
  });

  analisisFiltrosPanel.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', (e) => {
    if (!analisisFiltrosPanel.contains(e.target) && !btnAnalisisFiltros.contains(e.target)) {
      cerrarAnalisisFiltrosPanel();
    }
  });

  document.getElementById('btnAnalisisCerrarFiltros').addEventListener('click', cerrarAnalisisFiltrosPanel);

  document.getElementById('btnAnalisisLimpiarFiltros').addEventListener('click', () => {
    filtrosAnalisis.agencias.clear();
    filtrosAnalisis.tiendas.clear();
    filtrosAnalisis.tipos.clear();
    filtrosAnalisis.motivos.clear();
    filtrosAnalisis.siniestroTipos.clear();
    filtrosAnalisis.soloConSiniestros = false;
    document.querySelectorAll('#analisisFiltrosPanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    actualizarBadgeFiltrosAnalisis();
    actualizarValoresSelectsAnalisis();
    renderAnalisisRanking();
  });
