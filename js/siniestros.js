  // Siniestros del día (roturas confirmadas y faltas)
  // ---------------------------------------------------------------
  const MOTIVOS_SINIESTRO = { 'FALTAS': 'FALTA', 'ROTURA CONFIRMADA': 'ROTURA' };
  let siniestrosHoyCache = []; // [{ id, tipo, estado, fotos, fecha_limite, incidencia:{...,tiendas:{...,agencias:{...}}} }]

  // A partir del array de motivos de una incidencia, decide si genera un siniestro
  // de tipo FALTA, ROTURA o MIXTO (si están presentes ambos motivos a la vez).
  function tipoSiniestroDeMotivos(motivos) {
    const arr = motivos || [];
    const tieneFalta = arr.includes('FALTAS');
    const tieneRotura = arr.includes('ROTURA CONFIRMADA');
    if (tieneFalta && tieneRotura) return 'MIXTO';
    if (tieneFalta) return 'FALTA';
    if (tieneRotura) return 'ROTURA';
    return null;
  }

  // Revisa TODAS las incidencias de hoy con ROTURA CONFIRMADA/FALTAS y crea,
  // actualiza o deja igual su siniestro asociado. No toca el DOM — se puede
  // llamar tanto desde la pestaña Siniestros como en segundo plano al cargar
  // la app, para arrastrar incidencias marcadas antes de abrir esa pestaña.
  // Devuelve { incs, existentesPorIncidencia } para quien quiera pintar con ello.
  async function sincronizarSiniestrosDelDia() {
    if (!informeHoyCache) return { incs: [], existentesPorIncidencia: new Map() };

    // 1. Incidencias de hoy cuyo motivo incluye FALTAS o ROTURA CONFIRMADA
    const { data: incs, error: e1 } = await sb
      .from('incidencias')
      .select(`
        id, motivo, observaciones,
        tiendas ( id, nombre, hora_prevista,
          agencias ( id, nombre, emails )
        )
      `)
      .eq('informe_id', informeHoyCache.id)
      .overlaps('motivo', Object.keys(MOTIVOS_SINIESTRO));
    if (e1) throw e1;

    if (!incs.length) return { incs: [], existentesPorIncidencia: new Map() };

    // 2. Siniestros ya existentes para esas incidencias
    const idsIncidencias = incs.map(i => i.id);
    const { data: existentes, error: e2 } = await sb
      .from('siniestros')
      .select('id, incidencia_id, tipo, estado, fotos, fecha_limite')
      .in('incidencia_id', idsIncidencias);
    if (e2) throw e2;

    const existentesPorIncidencia = new Map(existentes.map(s => [s.incidencia_id, s]));

    // 3. Crear los que falten (incluye las marcadas antes de tener esta sincronización)
    const faltantes = incs.filter(i => !existentesPorIncidencia.has(i.id));
    if (faltantes.length) {
      const fechaLimite = new Date(informeHoyCache.fecha + 'T00:00:00');
      fechaLimite.setDate(fechaLimite.getDate() + 15);
      const fechaLimiteISO = fechaLocalISO(fechaLimite);

      const nuevos = faltantes.map(i => ({
        incidencia_id: i.id,
        tipo: tipoSiniestroDeMotivos(i.motivo),
        estado: 'PENDIENTE',
        fecha_limite: fechaLimiteISO
      }));

      const { data: creados, error: e3 } = await sb.from('siniestros').insert(nuevos).select('id, incidencia_id, tipo, estado, fotos, fecha_limite');
      if (e3) throw e3;
      creados.forEach(s => existentesPorIncidencia.set(s.incidencia_id, s));
    }

    // 3.5. Si los motivos de una incidencia cambiaron después de crear su siniestro
    // (ej: era solo ROTURA y ahora también tiene FALTAS), recalculamos y sincronizamos
    // el tipo — solo mientras esté PENDIENTE, para no tocar uno ya enviado.
    const desincronizados = incs.filter(i => {
      const s = existentesPorIncidencia.get(i.id);
      return s && s.estado === 'PENDIENTE' && s.tipo !== tipoSiniestroDeMotivos(i.motivo);
    });
    if (desincronizados.length) {
      await Promise.all(desincronizados.map(i => {
        const s = existentesPorIncidencia.get(i.id);
        const nuevoTipo = tipoSiniestroDeMotivos(i.motivo);
        s.tipo = nuevoTipo;
        return sb.from('siniestros').update({ tipo: nuevoTipo }).eq('id', s.id);
      }));
    }

    return { incs, existentesPorIncidencia };
  }

  async function renderVistaSiniestros() {
    const cont = document.getElementById('contenidoSiniestros');
    if (!informeHoyCache) {
      cont.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="glyph">📋</div>
            <h3>Aún no hay informe para hoy</h3>
            <p>Genera el informe diario desde Inicio para poder detectar siniestros.</p>
          </div>
        </div>`;
      return;
    }

    cont.innerHTML = `<div class="card"><div class="empty"><p>Buscando roturas y faltas de hoy…</p></div></div>`;

    try {
      const { incs, existentesPorIncidencia } = await sincronizarSiniestrosDelDia();

      if (!incs.length) {
        siniestrosHoyCache = [];
        actualizarKpiSiniestros();
        cont.innerHTML = `
          <div class="card">
            <div class="empty">
              <div class="glyph">✅</div>
              <h3>Sin roturas ni faltas hoy</h3>
              <p>No se ha detectado ninguna tienda con "FALTAS" o "ROTURA CONFIRMADA" en el informe de hoy.</p>
            </div>
          </div>`;
        return;
      }

      // Combinar todo para pintar
      siniestrosHoyCache = incs.map(i => ({
        ...existentesPorIncidencia.get(i.id),
        incidencia: i
      }));

      renderKanbanSiniestros();
      actualizarKpiSiniestros();
    } catch (err) {
      console.error('Error cargando siniestros de hoy:', err);
      cont.innerHTML = `<div class="card"><div class="empty"><p style="color:var(--grave);">Error al cargar los siniestros.</p></div></div>`;
    }
  }

  function renderKanbanSiniestros() {
    const cont = document.getElementById('contenidoSiniestros');
    const roturas = siniestrosHoyCache.filter(s => s.tipo === 'ROTURA');
    const faltas = siniestrosHoyCache.filter(s => s.tipo === 'FALTA');
    const mixtos = siniestrosHoyCache.filter(s => s.tipo === 'MIXTO');

    const tarjeta = (s) => {
      const t = s.incidencia.tiendas || {};
      const ag = t.agencias || {};
      const numFotos = (s.fotos || []).length;
      return `
        <div class="siniestro-card" data-siniestro="${s.id}">
          <div class="fila-top">
            <b>${escapeHtml(t.nombre || '—')}</b>
            <span class="badge-envio ${s.estado === 'ENVIADO' ? 'enviado' : 'pendiente'}">${s.estado === 'ENVIADO' ? 'Enviado' : 'Pendiente'}</span>
          </div>
          <div class="agencia">${escapeHtml(ag.nombre || 'Sin agencia')} · ${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}</div>
          ${s.incidencia.observaciones ? `<div class="obs">${escapeHtml(s.incidencia.observaciones)}</div>` : ''}
          <div class="fotos-mini">📷 ${numFotos} foto${numFotos===1?'':'s'}</div>
        </div>`;
    };

    const dot = `<svg width="9" height="9" viewBox="0 0 9 9" style="flex:0 0 auto;"><circle cx="4.5" cy="4.5" r="4.5" fill="currentColor"/></svg>`;

    cont.innerHTML = `
      <div class="siniestros-kanban">
        <div class="kanban-col roturas">
          <div class="kanban-col-head">${dot} Roturas confirmadas <span class="count">${roturas.length}</span></div>
          ${roturas.length ? roturas.map(tarjeta).join('') : '<div class="card"><div class="empty" style="padding:24px;"><p>Sin roturas hoy.</p></div></div>'}
        </div>
        <div class="kanban-col faltas">
          <div class="kanban-col-head">${dot} Faltas <span class="count">${faltas.length}</span></div>
          ${faltas.length ? faltas.map(tarjeta).join('') : '<div class="card"><div class="empty" style="padding:24px;"><p>Sin faltas hoy.</p></div></div>'}
        </div>
        <div class="kanban-col mixtos">
          <div class="kanban-col-head">${dot} Roturas y Faltas <span class="count">${mixtos.length}</span></div>
          ${mixtos.length ? mixtos.map(tarjeta).join('') : '<div class="card"><div class="empty" style="padding:24px;"><p>Sin casos mixtos hoy.</p></div></div>'}
        </div>
      </div>`;

    cont.querySelectorAll('[data-siniestro]').forEach(card => {
      card.addEventListener('click', () => abrirModalSiniestro(Number(card.dataset.siniestro)));
    });
  }

  function actualizarKpiSiniestros() {
    const pendientes = siniestrosHoyCache.filter(s => s.estado === 'PENDIENTE').length;
    document.getElementById('kpiSiniestrosPend').textContent = pendientes;
    document.getElementById('dotSiniestros').classList.toggle('show', pendientes > 0);
  }

  // Refresca el KPI "Siniestros pendientes de envío" de Inicio y el punto rojo
  // de la pestaña, consultando directamente la base de datos — funciona aunque
  // el usuario nunca haya entrado en la pestaña Siniestros en esta sesión.
  async function actualizarKpiSiniestrosDesdeDB() {
    const kpiEl = document.getElementById('kpiSiniestrosPend');
    const dotEl = document.getElementById('dotSiniestros');
    if (!informeHoyCache) {
      if (kpiEl) kpiEl.textContent = '0';
      if (dotEl) dotEl.classList.remove('show');
      return;
    }
    try {
      // Primero sincroniza (crea/actualiza siniestros que falten, incluidas
      // incidencias marcadas antes de entrar nunca en la pestaña Siniestros),
      // y cuenta directamente sobre el resultado — sin una segunda consulta.
      const { existentesPorIncidencia } = await sincronizarSiniestrosDelDia();
      const pendientes = Array.from(existentesPorIncidencia.values()).filter(s => s.estado === 'PENDIENTE').length;
      if (kpiEl) kpiEl.textContent = pendientes;
      if (dotEl) dotEl.classList.toggle('show', pendientes > 0);
    } catch (err) {
      console.error('Error actualizando KPI de siniestros:', err);
    }
  }

  // Crea, actualiza o elimina la fila de `siniestros` de una incidencia justo
  // al guardarla (sin esperar a que el usuario entre en la pestaña Siniestros),
  // y refresca el KPI de Inicio y el kanban si ya está abierto.
  async function sincronizarSiniestroIncidencia(incidenciaId, motivos) {
    if (!informeHoyCache) return;
    const tipo = tipoSiniestroDeMotivos(motivos);

    try {
      const { data: existente, error: eSel } = await sb
        .from('siniestros')
        .select('id, tipo, estado')
        .eq('incidencia_id', incidenciaId)
        .maybeSingle();
      if (eSel) throw eSel;

      if (!tipo) {
        // Ya no hay ROTURA CONFIRMADA ni FALTAS en esta incidencia:
        // si tenía un siniestro PENDIENTE asociado, lo quitamos.
        if (existente && existente.estado === 'PENDIENTE') {
          const { error: eDel } = await sb.from('siniestros').delete().eq('id', existente.id);
          if (eDel) throw eDel;
        }
      } else if (!existente) {
        const fechaLimite = new Date(informeHoyCache.fecha + 'T00:00:00');
        fechaLimite.setDate(fechaLimite.getDate() + 15);
        const { error: eIns } = await sb.from('siniestros').insert({
          incidencia_id: incidenciaId,
          tipo,
          estado: 'PENDIENTE',
          fecha_limite: fechaLocalISO(fechaLimite)
        });
        if (eIns) throw eIns;
      } else if (existente.estado === 'PENDIENTE' && existente.tipo !== tipo) {
        const { error: eUpd } = await sb.from('siniestros').update({ tipo }).eq('id', existente.id);
        if (eUpd) throw eUpd;
      }
    } catch (err) {
      console.error('Error sincronizando siniestro de la incidencia:', err);
    }

    await actualizarKpiSiniestrosDesdeDB();

    // Si la pestaña Siniestros ya está abierta, refrescamos su kanban también
    // para que se vea el cambio al instante sin tener que volver a entrar.
    if (document.getElementById('view-siniestros')?.classList.contains('active')) {
      renderVistaSiniestros();
    }
  }

  // ---- Modal de detalle de siniestro ----
  let siniestroActivoId = null;

  function siniestroPorId(id) {
    return siniestrosHoyCache.find(s => s.id === id);
  }

  function abrirModalSiniestro(id) {
    siniestroActivoId = id;
    pintarModalSiniestro();
    document.getElementById('siniestroModalOverlay').classList.add('show');
  }

  function cerrarModalSiniestro() {
    document.getElementById('siniestroModalOverlay').classList.remove('show');
    siniestroActivoId = null;
  }

  function pintarModalSiniestro() {
    const s = siniestroPorId(siniestroActivoId);
    if (!s) return;
    const t = s.incidencia.tiendas || {};
    const ag = t.agencias || {};

    document.getElementById('siniestroModalTipo').textContent = s.tipo === 'ROTURA' ? 'Rotura confirmada' : (s.tipo === 'MIXTO' ? 'Rotura y Falta' : 'Falta');
    document.getElementById('siniestroModalTipo').className = 'pill ' + (s.tipo === 'ROTURA' || s.tipo === 'MIXTO' ? 'grave' : 'moderado');
    document.getElementById('siniestroModalTitulo').textContent = t.nombre || '—';
    document.getElementById('siniestroModalInfo').textContent =
      `${ag.nombre || 'Sin agencia'} · Hora prevista ${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}` +
      (s.incidencia.observaciones ? `\n${s.incidencia.observaciones}` : '') +
      (s.fecha_limite ? `\nFecha límite de reclamación: ${new Date(s.fecha_limite+'T00:00:00').toLocaleDateString('es-ES')}` : '');

    const grid = document.getElementById('siniestroFotosGrid');
    grid.innerHTML = (s.fotos || []).map((url, idx) => `
      <div class="foto-item">
        <img src="${url}" loading="lazy">
        <button data-quitar-foto="${idx}" title="Quitar">✕</button>
      </div>`).join('');
    grid.querySelectorAll('[data-quitar-foto]').forEach(btn => {
      btn.addEventListener('click', () => quitarFotoSiniestro(Number(btn.dataset.quitarFoto)));
    });

    document.getElementById('siniestroModalEstado').textContent = s.estado === 'ENVIADO'
      ? `Enviado el ${s.enviado_en ? new Date(s.enviado_en).toLocaleString('es-ES') : ''}`
      : 'Pendiente de envío';
    document.getElementById('btnReabrirSiniestro').style.display = s.estado === 'ENVIADO' ? '' : 'none';
    document.getElementById('btnEnviarSiniestro').style.display = s.estado === 'ENVIADO' ? 'none' : '';
  }

  document.getElementById('btnCerrarSiniestroModal').addEventListener('click', cerrarModalSiniestro);
  document.getElementById('siniestroModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'siniestroModalOverlay') cerrarModalSiniestro();
  });

  document.getElementById('siniestroFotosInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const s = siniestroPorId(siniestroActivoId);
    const errEl = document.getElementById('siniestroFotosError');
    errEl.style.display = 'none';

    try {
      const urls = [];
      for (const file of files) {
        const path = `siniestro-${s.id}/${Date.now()}-${file.name}`;
        const { error: eUp } = await sb.storage.from('siniestros-fotos').upload(path, file);
        if (eUp) throw eUp;
        const { data: pub } = sb.storage.from('siniestros-fotos').getPublicUrl(path);
        urls.push(pub.publicUrl);
      }
      const fotosActualizadas = [...(s.fotos || []), ...urls];
      const { error: eDb } = await sb.from('siniestros').update({ fotos: fotosActualizadas }).eq('id', s.id);
      if (eDb) throw eDb;

      s.fotos = fotosActualizadas;
      pintarModalSiniestro();
      renderKanbanSiniestros();
    } catch (err) {
      console.error('Error subiendo fotos:', err);
      errEl.textContent = 'No se pudieron subir las fotos.';
      errEl.style.display = 'block';
    } finally {
      e.target.value = '';
    }
  });

  async function quitarFotoSiniestro(idx) {
    const s = siniestroPorId(siniestroActivoId);
    const fotosActualizadas = (s.fotos || []).filter((_, i) => i !== idx);
    try {
      const { error } = await sb.from('siniestros').update({ fotos: fotosActualizadas }).eq('id', s.id);
      if (error) throw error;
      s.fotos = fotosActualizadas;
      pintarModalSiniestro();
      renderKanbanSiniestros();
    } catch (err) {
      console.error('Error quitando foto:', err);
    }
  }

  document.getElementById('btnEnviarSiniestro').addEventListener('click', async () => {
    const s = siniestroPorId(siniestroActivoId);
    const t = s.incidencia.tiendas || {};
    const ag = t.agencias || {};
    const emails = ag.emails || [];

    if (!emails.length) {
      await modalAlert('Esta agencia no tiene emails configurados. Añádelos en Configuración → Emails por agencia.', { titulo: 'Sin destinatarios' });
      return;
    }

    const ok = await modalConfirm('¿Enviar el correo de reclamación a la agencia ahora?', { titulo: 'Enviar reclamación' });
    if (!ok) return;

    const btn = document.getElementById('btnEnviarSiniestro');
    const textoOriginalBtn = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    try {
      const { subject, html, text } = plantillaSiniestro(s, informeHoyCache.fecha);

      await enviarEmail({
        to: emails,
        subject,
        html,
        text,
        attachmentUrls: s.fotos || []
      });

      const { error } = await sb.from('siniestros').update({
        estado: 'ENVIADO',
        enviado_en: new Date().toISOString(),
        enviado_por: sesionActual?.nombre || sesionActual?.usuario || null
      }).eq('id', s.id);
      if (error) throw error;

      s.estado = 'ENVIADO';
      s.enviado_en = new Date().toISOString();
      pintarModalSiniestro();
      renderKanbanSiniestros();
      actualizarKpiSiniestros();
    } catch (err) {
      console.error('Error enviando siniestro:', err);
      await modalAlert(`No se pudo enviar el correo: ${err.message}`, { titulo: 'Error de envío' });
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginalBtn;
    }
  });

  document.getElementById('btnReabrirSiniestro').addEventListener('click', async () => {
    const s = siniestroPorId(siniestroActivoId);
    try {
      const { error } = await sb.from('siniestros').update({ estado: 'PENDIENTE', enviado_en: null }).eq('id', s.id);
      if (error) throw error;
      s.estado = 'PENDIENTE';
      s.enviado_en = null;
      pintarModalSiniestro();
      renderKanbanSiniestros();
      actualizarKpiSiniestros();
    } catch (err) {
      console.error('Error reabriendo siniestro:', err);
    }
  });

  let sesionActual = sesionActiva;
  if (sesionActiva) cargarInformeHoy();
