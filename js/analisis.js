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
      pintarKpisAnalisis(analisisDatos);
      renderAnalisisRanking();
    } catch (err) {
      console.error('Error cargando ranking de análisis:', err);
      cont.innerHTML = `<div class="card"><div class="empty"><p style="color:var(--grave);">Error al calcular el ranking.</p></div></div>`;
    }
  }

  function pintarKpisAnalisis(datos) {
    const incs = datos?.incidencias || [];
    const sins = datos?.siniestros || [];
    document.getElementById('akIncidencias').textContent = datos ? incs.length : '—';
    document.getElementById('akGraves').textContent = datos ? incs.filter(i => i.tipo === 'GRAVE').length : '—';
    document.getElementById('akSiniestros').textContent = datos ? sins.length : '—';
    document.getElementById('akSiniestrosPend').textContent = datos ? sins.filter(s => s.estado === 'PENDIENTE').length : '—';
  }

  // Agrupa incidencias + siniestros por tienda o por agencia.
  function agregarAnalisis(entidad) {
    const incs = analisisDatos?.incidencias || [];
    const sins = analisisDatos?.siniestros || [];
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
          sinPend: 0, sinEnv: 0, siniestros: 0
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
      if (s.estado === 'PENDIENTE') e.sinPend++; else e.sinEnv++;
    });

    return Array.from(mapa.values());
  }

  function renderAnalisisRanking() {
    const cont = document.getElementById('contenidoAnalisisRanking');
    if (!analisisDatos) return;

    const filas = agregarAnalisis(analisisEntidad);
    if (!filas.length) {
      cont.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="glyph">✅</div>
            <h3>Sin incidencias en ese periodo</h3>
            <p>No hay datos de ${analisisEntidad === 'tiendas' ? 'tiendas' : 'agencias'} que mostrar.</p>
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
          ${f.sinPend ? `<span class="badge-envio pendiente">${f.sinPend} pdte.</span>` : ''}
          ${f.sinEnv ? `<span class="badge-envio enviado">${f.sinEnv} enviado${f.sinEnv === 1 ? '' : 's'}</span>` : ''}
          ${!f.sinPend && !f.sinEnv ? '—' : ''}
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
              <th>Estado siniestros</th>
            </tr>
          </thead>
          <tbody>${filasTabla}</tbody>
        </table>
      </div>`;

    cont.innerHTML = chart + tabla;
  }
