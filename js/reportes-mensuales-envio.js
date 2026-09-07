// js/reportes-mensuales-envio.js
// ---------------------------------------------------------------
// Análisis · Reportes mensuales → botón "Enviar a agencias".
//
// Genera, para el mes que se esté viendo en Reportes mensuales (rmAnio /
// rmMes de reportes-mensuales.js), el mismo PDF "ENTREGAS MERCANCIA
// AGENCIA" que antes se mandaba a mano (mismo título, misma leyenda de
// códigos, misma tabla Agencia/Tienda/Provincia/días/Total), y lo envía
// por correo a los emails configurados de cada agencia (Configuración →
// Emails por agencia), con el PDF adjunto.
//
// Agrupación: varias filas de "agencias" pueden ser en realidad la misma
// empresa cliente (p.ej. "CBL EXTERNO" y "CBL MLG" son ambas CBL). Para
// que se envíen juntas en un único PDF/correo, se les asigna el mismo
// "grupo_envio" desde Configuración → Emails por agencia. Sin grupo, cada
// agencia se envía sola (su grupo es su propio nombre).
//
// "Ya enviado": se guarda una fila por (grupo, año, mes) en la tabla
// informes_mensuales_agencia_enviados (ver supabase/2026-09_reportes_
// mensuales_envio.sql) para poder mostrar el estado y evitar reenvíos
// accidentales.
//
// Requiere (ya cargados antes): sb, escapeHtml, modalAlert, modalConfirm,
// enviarEmail, sesionActual, plantillaHtmlResumenMensual,
// rmAnio, rmMes, RM_NOMBRES_MES, rmDiasDelMes, rmCargarDatosMes,
// rmConstruirTodasLasFilas, CODIGOS_INFORME, pdfDisponible().
// ---------------------------------------------------------------

const RME_BUCKET = 'reportes-mensuales';

function rmeMesNombreCapitalizado(mesIndex) {
  const n = RM_NOMBRES_MES[mesIndex] || '';
  return n.charAt(0) + n.slice(1).toLowerCase();
}

function rmeTituloMes(anio, mesIndex) {
  return `${RM_NOMBRES_MES[mesIndex]} ${anio}`;
}

// Clave de agrupación de una agencia: su grupo_envio si lo tiene, si no
// su propio nombre (así, sin configurar nada, cada agencia se envía sola).
function rmeClaveGrupo(agencia) {
  return (agencia.grupo_envio && agencia.grupo_envio.trim()) || agencia.nombre;
}

function rmeSlug(texto) {
  return (texto || 'agencia')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase() || 'AGENCIA';
}

// A partir del listado fresco de agencias (con emails y grupo_envio),
// construye los grupos de envío: { clave, nombre, agenciaIds[], agenciasNombres[], emails[], orden }
function rmeConstruirGrupos(agenciasFrescas) {
  const porClave = new Map();
  agenciasFrescas.forEach(ag => {
    const clave = rmeClaveGrupo(ag);
    if (!porClave.has(clave)) {
      porClave.set(clave, { clave, nombre: clave, agenciaIds: [], agenciasNombres: [], emails: new Set(), orden: ag.orden ?? 999999 });
    }
    const g = porClave.get(clave);
    g.agenciaIds.push(ag.id);
    g.agenciasNombres.push(ag.nombre);
    (ag.emails || []).forEach(e => g.emails.add(e));
    g.orden = Math.min(g.orden, ag.orden ?? 999999);
  });
  return Array.from(porClave.values())
    .map(g => ({ ...g, emails: Array.from(g.emails) }))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

// ---------------------------------------------------------------
// Panel "Enviar a agencias"
// ---------------------------------------------------------------
let rmeEnganchado = false;
let rmeEnviando = false; // evita doble clic mientras se genera/envía un PDF

function rmePosicionarPanel() {
  const btn = document.getElementById('btnRmEnviarAgencias');
  const panel = document.getElementById('rmEnviarPanel');
  const wrap = btn.closest('.filtros-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(620, window.innerWidth - margen * 2);
  panel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (window.innerWidth - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  panel.style.left = left + 'px';
}

function rmeAbrirPanel() {
  if (typeof rmCerrarFiltrosPanel === 'function') rmCerrarFiltrosPanel();
  rmePosicionarPanel();
  document.getElementById('rmEnviarPanel').classList.add('show');
  document.getElementById('btnRmEnviarAgencias').classList.add('open');
  document.getElementById('rmEnviarMesTexto').textContent = rmeTituloMes(rmAnio, rmMes);
  rmeCargarYRenderPanel();
}
function rmeCerrarPanel() {
  document.getElementById('rmEnviarPanel').classList.remove('show');
  document.getElementById('btnRmEnviarAgencias').classList.remove('open');
}

function rmeEngancharPanel() {
  if (rmeEnganchado) return;
  rmeEnganchado = true;

  const btn = document.getElementById('btnRmEnviarAgencias');
  const panel = document.getElementById('rmEnviarPanel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.classList.contains('show')) rmeCerrarPanel();
    else rmeAbrirPanel();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) rmeCerrarPanel();
  });
  window.addEventListener('resize', () => {
    if (panel.classList.contains('show')) rmePosicionarPanel();
  });

  document.getElementById('btnRmCerrarEnviar').addEventListener('click', rmeCerrarPanel);
}

// Carga agencias frescas (con emails/grupo_envio) + los envíos ya
// registrados para el mes actual, y pinta la lista de grupos.
async function rmeCargarYRenderPanel() {
  const cont = document.getElementById('rmEnviarLista');
  cont.innerHTML = '<div class="empty"><p>Cargando…</p></div>';
  document.getElementById('rmEnviarMesTexto').textContent = rmeTituloMes(rmAnio, rmMes);

  try {
    const [{ data: agencias, error: e1 }, { data: envios, error: e2 }] = await Promise.all([
      sb.from('agencias').select('id, nombre, orden, emails, grupo_envio').eq('activo', true).order('orden'),
      sb.from('informes_mensuales_agencia_enviados').select('grupo, enviado_en, enviado_por')
        .eq('anio', rmAnio).eq('mes', rmMes + 1)
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const grupos = rmeConstruirGrupos(agencias || []);
    const enviosPorGrupo = new Map((envios || []).map(e => [e.grupo, e]));

    if (!grupos.length) {
      cont.innerHTML = '<div class="empty"><p>No hay agencias configuradas.</p></div>';
      return;
    }

    cont.innerHTML = grupos.map(g => rmeHtmlFilaGrupo(g, enviosPorGrupo.get(g.clave))).join('');

    cont.querySelectorAll('[data-rme-enviar]').forEach(b => {
      b.addEventListener('click', () => rmeEnviarGrupo(b.dataset.rmeEnviar, grupos, cont));
    });
  } catch (err) {
    console.error('Error cargando el panel de envío del resumen mensual:', err);
    cont.innerHTML = '<div class="empty"><p style="color:var(--grave);">No se pudo cargar la lista de agencias.</p></div>';
  }
}

function rmeHtmlFilaGrupo(g, envio) {
  const subAgencias = g.agenciasNombres.length > 1 ? g.agenciasNombres.join(' + ') : null;
  const sinEmails = !g.emails.length;

  let estadoHtml;
  if (envio) {
    const fecha = new Date(envio.enviado_en).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    estadoHtml = `
      <span class="rme-badge-enviado" title="${envio.enviado_por ? 'Enviado por ' + escapeHtml(envio.enviado_por) : ''}">✅ Ya enviado (${fecha})</span>
      <button type="button" class="rme-btn-reenviar rme-btn-enviar" data-rme-enviar="${escapeHtml(g.clave)}">Reenviar</button>`;
  } else {
    estadoHtml = `<button type="button" class="btn primary rme-btn-enviar" data-rme-enviar="${escapeHtml(g.clave)}" ${sinEmails ? 'disabled' : ''}>Enviar PDF</button>`;
  }

  return `
    <div class="rme-grupo-row" data-rme-fila="${escapeHtml(g.clave)}">
      <div class="rme-grupo-info">
        <b>${escapeHtml(g.nombre)}</b>
        ${subAgencias ? `<span class="rme-sub">Incluye: ${escapeHtml(subAgencias)}</span>` : ''}
        ${sinEmails
          ? `<span class="rme-sub rme-warn">Sin emails configurados (Configuración → Emails por agencia)</span>`
          : `<span class="rme-sub">${g.emails.length} destinatario${g.emails.length === 1 ? '' : 's'}</span>`}
      </div>
      <div class="rme-grupo-estado">${estadoHtml}</div>
    </div>`;
}

// ---------------------------------------------------------------
// Envío de un grupo: genera el PDF, lo sube, envía el correo y marca
// "ya enviado" en la base de datos.
// ---------------------------------------------------------------
async function rmeEnviarGrupo(clave, grupos, cont) {
  if (rmeEnviando) return;
  const grupo = grupos.find(g => g.clave === clave);
  if (!grupo) return;

  if (!grupo.emails.length) {
    await modalAlert('Esta agencia (o grupo) no tiene emails configurados. Añádelos en Configuración → Emails por agencia.', { titulo: 'Sin destinatarios' });
    return;
  }
  if (!pdfDisponible()) {
    await modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
    return;
  }

  const mesTexto = rmeTituloMes(rmAnio, rmMes);
  const ok = await modalConfirm(
    `Se generará el PDF del resumen de ${mesTexto} para "${grupo.nombre}" y se enviará a: ${grupo.emails.join(', ')}.`,
    { titulo: '📤 Enviar resumen mensual', textoOk: 'Enviar' }
  );
  if (!ok) return;

  rmeEnviando = true;
  const filaEl = cont.querySelector(`[data-rme-fila="${CSS.escape(clave)}"] .rme-grupo-estado`);
  if (filaEl) filaEl.innerHTML = '<span class="rme-sub">Generando y enviando…</span>';

  try {
    const datos = await rmCargarDatosMes(rmAnio, rmMes);
    const { celdas, diasEnviados, totalDias, cambiosPorTienda } = datos;
    const todasLasFilas = rmConstruirTodasLasFilas(cambiosPorTienda, totalDias);
    const filasGrupo = todasLasFilas
      .filter(f => grupo.agenciaIds.includes(f.agenciaId))
      .sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre) || a.tiendaNombre.localeCompare(b.tiendaNombre) || a.diaInicio - b.diaInicio);

    if (!filasGrupo.length) {
      await modalAlert('Esta agencia no tiene tiendas asignadas este mes.', { titulo: 'Nada que enviar' });
      return;
    }

    const doc = rmeConstruirPdf(grupo.nombre, rmAnio, rmMes, filasGrupo, celdas, diasEnviados, totalDias);
    const nombreArchivo = `${grupo.nombre} - ${mesTexto}.pdf`;
    const blob = doc.output('blob');

    const rutaStorage = `${rmAnio}/${rmMes + 1}/${rmeSlug(grupo.nombre)}.pdf`;
    const { error: eUp } = await sb.storage.from(RME_BUCKET).upload(rutaStorage, blob, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (eUp) throw new Error(`No se pudo subir el PDF: ${eUp.message}`);

    const { data: pub } = sb.storage.from(RME_BUCKET).getPublicUrl(rutaStorage);
    const urlPdf = pub?.publicUrl;

    const subject = `RESUMEN INCIDENCIAS ${grupo.nombre.toUpperCase()} ${mesTexto.toUpperCase()}`;
    const html = plantillaHtmlResumenMensual(rmeMesNombreCapitalizado(rmMes));
    await enviarEmail({ to: grupo.emails, subject, html, attachmentUrls: urlPdf ? [urlPdf] : [] });

    const { error: eDb } = await sb.from('informes_mensuales_agencia_enviados').upsert({
      grupo: grupo.clave,
      anio: rmAnio,
      mes: rmMes + 1,
      pdf_nombre: nombreArchivo,
      pdf_url: urlPdf,
      enviado_en: new Date().toISOString(),
      enviado_por: sesionActual?.nombre || sesionActual?.usuario || null
    }, { onConflict: 'grupo,anio,mes' });
    if (eDb) console.error('El correo se envió, pero no se pudo guardar el estado de envío:', eDb);

    await rmeCargarYRenderPanel();
  } catch (err) {
    console.error(`Error enviando el resumen mensual de ${grupo.nombre}:`, err);
    await modalAlert(err.message || 'No se pudo enviar el resumen mensual.', { titulo: 'Error al enviar' });
    await rmeCargarYRenderPanel();
  } finally {
    rmeEnviando = false;
  }
}

// ---------------------------------------------------------------
// Construcción del PDF (mismo formato que el Excel manual: título,
// leyenda de códigos y tabla Agencia/Tienda/Provincia/días/Total).
// ---------------------------------------------------------------
function rmeHexToRgb(hex) {
  const h = (hex || '#FFFFFF').replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

// Igual que rmCeldasDeTramo() de reportes-mensuales.js, pero devolviendo
// celdas para jsPDF-autotable en lugar de HTML.
function rmeCeldasDeTramoPdf(f, celdasTienda, diasEnviados, totalDias) {
  const celdas = [];
  let totalIncidencias = 0;
  const estiloCambio = { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'italic', fontSize: 6 };

  if (f.diaInicio > 1) {
    celdas.push({ content: `Antes:\n${f.nombreAnterior || '—'}`, colSpan: f.diaInicio - 1, styles: estiloCambio });
  }

  for (let dia = f.diaInicio; dia <= f.diaFin; dia++) {
    if (!diasEnviados.has(dia)) { celdas.push({ content: '', styles: {} }); continue; }
    const c = celdasTienda[dia];
    if (!c) { celdas.push({ content: 'OK', styles: { textColor: [110, 110, 110] } }); continue; }
    totalIncidencias++;
    celdas.push({ content: c.codigo, styles: { fillColor: rmeHexToRgb(c.color), textColor: rmeHexToRgb(c.texto), fontStyle: 'bold' } });
  }

  if (f.diaFin < totalDias) {
    celdas.push({ content: `Cambia a:\n${f.nombreSiguiente || '—'}`, colSpan: totalDias - f.diaFin, styles: estiloCambio });
  }

  return { celdas, totalIncidencias };
}

function rmeConstruirPdf(grupoNombre, anio, mesIndex, filasGrupo, celdas, diasEnviados, totalDias) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margen = 20;
  const anchoUtil = doc.internal.pageSize.getWidth() - margen * 2;

  // --- Título ---
  doc.autoTable({
    startY: margen,
    margin: { left: margen, right: margen },
    tableWidth: anchoUtil,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 15, fontStyle: 'bold', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.75, cellPadding: 8, halign: 'left', valign: 'middle' },
    body: [[`ENTREGAS MERCANCIA ${grupoNombre.toUpperCase()}\n${rmeTituloMes(anio, mesIndex)}`]]
  });

  // --- Leyenda de códigos (2 columnas) ---
  const mitad = Math.ceil(CODIGOS_INFORME.length / 2);
  const filasLeyenda = [];
  for (let i = 0; i < mitad; i++) {
    const a = CODIGOS_INFORME[i];
    const b = CODIGOS_INFORME[i + mitad];
    filasLeyenda.push([
      { content: a.codigo, styles: { fillColor: rmeHexToRgb(a.color), textColor: rmeHexToRgb(a.texto), fontStyle: 'bold', halign: 'center' } },
      { content: a.label, styles: { halign: 'left' } },
      b ? { content: b.codigo, styles: { fillColor: rmeHexToRgb(b.color), textColor: rmeHexToRgb(b.texto), fontStyle: 'bold', halign: 'center' } } : '',
      b ? { content: b.label, styles: { halign: 'left' } } : ''
    ]);
  }
  doc.autoTable({
    startY: doc.lastAutoTable.finalY,
    margin: { left: margen, right: margen },
    tableWidth: anchoUtil,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, lineColor: [0, 0, 0], lineWidth: 0.4, cellPadding: 3, valign: 'middle' },
    head: [[{ content: 'LEYENDA', colSpan: 4, styles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], halign: 'center', fontStyle: 'bold' } }]],
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: anchoUtil * 0.5 - 24 }, 2: { cellWidth: 24 }, 3: { cellWidth: anchoUtil * 0.5 - 24 } },
    body: filasLeyenda
  });

  // --- Tabla principal ---
  const cabeceraDias = Array.from({ length: totalDias }, (_, i) => String(i + 1));
  const cabecera = ['AGENCIA', 'TIENDA', 'PROVINCIA', ...cabeceraDias, 'TOTAL'];

  const cuerpo = filasGrupo.map(f => {
    const celdasTienda = celdas[f.tiendaId] || {};
    const { celdas: celdasDias, totalIncidencias } = rmeCeldasDeTramoPdf(f, celdasTienda, diasEnviados, totalDias);
    return [
      { content: f.agenciaNombre, styles: { halign: 'left', fontStyle: 'bold' } },
      { content: f.tiendaNombre, styles: { halign: 'left' } },
      { content: f.tiendaProvincia || '—', styles: { halign: 'left' } },
      ...celdasDias,
      { content: String(totalIncidencias), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
    ];
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY,
    margin: { left: margen, right: margen },
    tableWidth: anchoUtil,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, lineColor: [0, 0, 0], lineWidth: 0.35, cellPadding: 2, halign: 'center', valign: 'middle', overflow: 'linebreak' },
    head: [cabecera],
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 62, halign: 'left', fontStyle: 'bold' },
      1: { cellWidth: 70, halign: 'left' },
      2: { cellWidth: 55, halign: 'left' }
    },
    body: cuerpo
  });

  return doc;
}

rmeEngancharPanel();
