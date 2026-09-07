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
// accidentales. El botón "Enviar a todas las pendientes" solo manda a
// las agencias que todavía no tengan ese registro este mes.
//
// Requiere (ya cargados antes): sb, escapeHtml, modalAlert, modalConfirm,
// mostrarCargandoEnvio, actualizarCargandoEnvio, ocultarCargandoEnvio
// (informe-envio.js), enviarEmail, sesionActual, plantillaHtmlResumenMensual,
// rmAnio, rmMes, RM_NOMBRES_MES, rmCargarDatosMes, rmConstruirTodasLasFilas,
// CODIGOS_INFORME, pdfDisponible().
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

function rmeMesAnioTexto(mesIndex, anio) {
  return `${rmeMesNombreCapitalizado(mesIndex)} de ${anio}`;
}

// Nombre "bonito" del PDF: el que ver\u00e1 el destinatario como adjunto
// (la Edge Function de correo usa el \u00faltimo tramo de la URL de Storage
// como nombre de archivo, as\u00ed que este mismo texto es tambi\u00e9n la ruta
// donde se sube \u2014 ver rmeRutaStorage).
function rmeNombreArchivo(grupoNombre, anio, mesIndex) {
  return `${grupoNombre} - ${rmeTituloMes(anio, mesIndex)}.pdf`;
}

// Ruta en Storage: una carpeta por a\u00f1o/mes y, dentro, el nombre "bonito"
// de arriba (con los caracteres no v\u00e1lidos en una ruta reemplazados).
function rmeRutaStorage(grupoNombre, anio, mesIndex) {
  const nombre = rmeNombreArchivo(grupoNombre, anio, mesIndex).replace(/[\\/?#]/g, '-');
  return `${anio}/${mesIndex + 1}/${nombre}`;
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
    .map(g => ({ ...g, emails: Array.from(g.emails), envio: null }))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

// ---------------------------------------------------------------
// Panel "Enviar a agencias"
// ---------------------------------------------------------------
let rmeEnganchado = false;
let rmeEnviando = false; // evita doble clic mientras se genera/envía algo
let rmeGruposActuales = []; // último listado cargado (para el botón "enviar a todas")

function rmePosicionarPanel() {
  const btn = document.getElementById('btnRmEnviarAgencias');
  const panel = document.getElementById('rmEnviarPanel');
  const wrap = btn.closest('.filtros-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(640, window.innerWidth - margen * 2);
  panel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (window.innerWidth - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  panel.style.left = left + 'px';

  // Alto máximo según el hueco disponible bajo el botón, para que el panel
  // nunca se salga de la pantalla por abajo (la lista hace scroll interno).
  const espacioAbajo = window.innerHeight - wrapRect.bottom - margen - 16;
  panel.style.maxHeight = Math.max(280, espacioAbajo) + 'px';
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
  document.getElementById('btnRmeEnviarTodas').addEventListener('click', () => rmeEnviarTodosPendientes(rmeGruposActuales));
}

// Carga agencias frescas (con emails/grupo_envio) + los envíos ya
// registrados para el mes actual, y pinta la lista de grupos.
async function rmeCargarYRenderPanel() {
  const cont = document.getElementById('rmEnviarLista');
  cont.innerHTML = '<div class="empty"><p>Cargando…</p></div>';
  document.getElementById('rmEnviarMesTexto').textContent = rmeTituloMes(rmAnio, rmMes);
  rmeActualizarToolbar([], true);

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
    grupos.forEach(g => { g.envio = enviosPorGrupo.get(g.clave) || null; });
    rmeGruposActuales = grupos;

    if (!grupos.length) {
      cont.innerHTML = '<div class="empty"><p>No hay agencias configuradas.</p></div>';
      rmeActualizarToolbar([], false);
      return;
    }

    cont.innerHTML = grupos.map(g => rmeHtmlFilaGrupo(g)).join('');
    rmeActualizarToolbar(grupos, false);

    cont.querySelectorAll('[data-rme-enviar]').forEach(b => {
      b.addEventListener('click', () => rmeEnviarGrupo(b.dataset.rmeEnviar, rmeGruposActuales, cont));
    });
  } catch (err) {
    console.error('Error cargando el panel de envío del resumen mensual:', err);
    cont.innerHTML = '<div class="empty"><p style="color:var(--grave);">No se pudo cargar la lista de agencias.</p></div>';
    rmeActualizarToolbar([], false);
  }
}

// Texto/estado del botón "Enviar a todas las pendientes" según lo cargado.
function rmeActualizarToolbar(grupos, cargando) {
  const btn = document.getElementById('btnRmeEnviarTodas');
  const resumen = document.getElementById('rmeResumenTexto');
  if (!btn || !resumen) return;

  if (cargando) {
    resumen.textContent = 'Cargando…';
    btn.disabled = true;
    btn.textContent = '📤 Enviar a todas las pendientes';
    return;
  }

  const pendientes = grupos.filter(g => !g.envio);
  resumen.textContent = grupos.length
    ? `${grupos.length} agencia${grupos.length === 1 ? '' : 's'} · ${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'} de enviar`
    : '—';
  btn.disabled = rmeEnviando || !pendientes.length;
  btn.textContent = pendientes.length
    ? `📤 Enviar a todas las pendientes (${pendientes.length})`
    : '✅ Todas enviadas';
}

function rmeHtmlFilaGrupo(g) {
  const subAgencias = g.agenciasNombres.length > 1 ? g.agenciasNombres.join(' + ') : null;
  const sinEmails = !g.emails.length;

  let estadoHtml;
  if (g.envio) {
    const fecha = new Date(g.envio.enviado_en).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    estadoHtml = `
      <span class="rme-badge-enviado" title="${g.envio.enviado_por ? 'Enviado por ' + escapeHtml(g.envio.enviado_por) : ''}">✅ ${fecha}</span>
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
          ? `<span class="rme-sub rme-warn">Sin emails configurados</span>`
          : `<span class="rme-sub">${g.emails.length} destinatario${g.emails.length === 1 ? '' : 's'}</span>`}
      </div>
      <div class="rme-grupo-estado">${estadoHtml}</div>
    </div>`;
}

// ---------------------------------------------------------------
// Envío: datos del mes (una sola vez, reutilizados tanto si se envía a
// una agencia como si se envía a todas) + generación/subida/correo de un
// grupo concreto.
// ---------------------------------------------------------------
async function rmeObtenerDatosMes() {
  const datos = await rmCargarDatosMes(rmAnio, rmMes);
  const todasLasFilas = rmConstruirTodasLasFilas(datos.cambiosPorTienda, datos.totalDias);
  return { ...datos, todasLasFilas };
}

// Genera el PDF de un grupo, lo sube, envía el correo y registra el envío.
// Lanza un Error legible si algo falla. No pide confirmación (la pide
// quien llama, una vez para uno o para todos).
async function rmeProcesarEnvioGrupo(grupo, datosMes) {
  const { celdas, diasEnviados, totalDias, todasLasFilas } = datosMes;
  const mesTexto = rmeTituloMes(rmAnio, rmMes);

  const filasGrupo = todasLasFilas
    .filter(f => grupo.agenciaIds.includes(f.agenciaId))
    .sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre) || a.tiendaNombre.localeCompare(b.tiendaNombre) || a.diaInicio - b.diaInicio);

  if (!filasGrupo.length) throw new Error('Esta agencia no tiene tiendas asignadas este mes.');

  const doc = rmeConstruirPdf(grupo.nombre, rmAnio, rmMes, filasGrupo, celdas, diasEnviados, totalDias);
  const nombreArchivo = rmeNombreArchivo(grupo.nombre, rmAnio, rmMes);
  const blob = doc.output('blob');

  // Importante: el nombre del adjunto que verá la agencia es el último
  // tramo de esta ruta (lo decide la Edge Function de correo a partir de
  // la URL), así que tiene que ser ya el nombre "bonito" con mes y año.
  const rutaStorage = rmeRutaStorage(grupo.nombre, rmAnio, rmMes);
  const { error: eUp } = await sb.storage.from(RME_BUCKET).upload(rutaStorage, blob, {
    contentType: 'application/pdf',
    upsert: true
  });
  if (eUp) throw new Error(`No se pudo subir el PDF: ${eUp.message}`);

  const { data: pub } = sb.storage.from(RME_BUCKET).getPublicUrl(rutaStorage);
  const urlPdf = pub?.publicUrl;

  const subject = `RESUMEN INCIDENCIAS ${grupo.nombre.toUpperCase()} ${mesTexto.toUpperCase()}`;
  const html = plantillaHtmlResumenMensual(rmeMesAnioTexto(rmMes, rmAnio));
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
}

// Envío de una sola agencia/grupo, desde su botón "Enviar PDF"/"Reenviar".
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
  mostrarCargandoEnvio(`Generando el PDF de ${grupo.nombre}…`);

  try {
    const datosMes = await rmeObtenerDatosMes();
    actualizarCargandoEnvio(`Enviando correo a ${grupo.nombre}, espera…`);
    await rmeProcesarEnvioGrupo(grupo, datosMes);
    ocultarCargandoEnvio();
    await modalAlert(`Correo enviado correctamente a: ${grupo.emails.join(', ')}`, { titulo: '✅ Resumen mensual enviado' });
  } catch (err) {
    console.error(`Error enviando el resumen mensual de ${grupo.nombre}:`, err);
    ocultarCargandoEnvio();
    await modalAlert(err.message || 'No se pudo enviar el resumen mensual.', { titulo: 'Error al enviar' });
  } finally {
    rmeEnviando = false;
    await rmeCargarYRenderPanel();
  }
}

// Envío masivo: todas las agencias/grupos que todavía no tengan el
// resumen de este mes registrado como enviado.
async function rmeEnviarTodosPendientes(grupos) {
  if (rmeEnviando) return;

  const pendientes = grupos.filter(g => !g.envio);
  if (!pendientes.length) {
    await modalAlert('Todas las agencias ya tienen el resumen de este mes enviado.', { titulo: 'Nada pendiente' });
    return;
  }
  const conEmails = pendientes.filter(g => g.emails.length);
  const sinEmails = pendientes.filter(g => !g.emails.length);
  if (!conEmails.length) {
    await modalAlert('Las agencias pendientes no tienen emails configurados. Añádelos en Configuración → Emails por agencia.', { titulo: 'Sin destinatarios' });
    return;
  }
  if (!pdfDisponible()) {
    await modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
    return;
  }

  const mesTexto = rmeTituloMes(rmAnio, rmMes);
  let mensaje = `Se generará y enviará el PDF del resumen de ${mesTexto} a ${conEmails.length} agencia${conEmails.length === 1 ? '' : 's'}: ${conEmails.map(g => g.nombre).join(', ')}.`;
  if (sinEmails.length) mensaje += `\n\nSe omiten (sin emails configurados): ${sinEmails.map(g => g.nombre).join(', ')}.`;
  const ok = await modalConfirm(mensaje, { titulo: '📤 Enviar a todas las pendientes', textoOk: `Enviar a ${conEmails.length}` });
  if (!ok) return;

  rmeEnviando = true;
  rmeActualizarToolbar(grupos, false);
  mostrarCargandoEnvio(`Preparando envío… (0/${conEmails.length})`);

  const resultados = [];
  try {
    const datosMes = await rmeObtenerDatosMes();
    let i = 0;
    for (const grupo of conEmails) {
      i++;
      actualizarCargandoEnvio(`Enviando a ${grupo.nombre}… (${i}/${conEmails.length})`);
      try {
        await rmeProcesarEnvioGrupo(grupo, datosMes);
        resultados.push({ nombre: grupo.nombre, ok: true });
      } catch (err) {
        console.error(`Error enviando el resumen mensual de ${grupo.nombre}:`, err);
        resultados.push({ nombre: grupo.nombre, ok: false, error: err.message || 'Error desconocido' });
      }
    }
  } finally {
    ocultarCargandoEnvio();
    rmeEnviando = false;
    await rmeCargarYRenderPanel();
  }

  const exitosos = resultados.filter(r => r.ok);
  const fallidos = resultados.filter(r => !r.ok);
  let resumen = `Enviado correctamente a ${exitosos.length} de ${resultados.length} agencia${resultados.length === 1 ? '' : 's'}.`;
  if (fallidos.length) resumen += `\n\nFallos:\n` + fallidos.map(f => `• ${f.nombre}: ${f.error}`).join('\n');
  await modalAlert(resumen, { titulo: fallidos.length ? 'Envío con errores' : '✅ Resumen mensual enviado' });
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

// Dibuja título, leyenda y tabla principal sobre un doc ya creado (con el
// alto de página que sea). Devuelve el finalY de la tabla principal, es
// decir, dónde termina realmente el contenido en esa página.
function rmeDibujarContenidoPdf(doc, grupoNombre, anio, mesIndex, filasGrupo, celdas, diasEnviados, totalDias) {
  const margen = 20;
  const anchoPagina = doc.internal.pageSize.getWidth();
  const anchoUtil = anchoPagina - margen * 2;

  // --- Título (izquierda) y leyenda de códigos (derecha), lado a lado ---
  // La leyenda se dibuja primero para saber su altura real, y así el
  // recuadro del título se estira para ocupar esa misma altura (como en
  // el informe manual), en vez de quedar un recuadro pequeño con un
  // hueco vacío debajo hasta que empieza la tabla principal.
  const anchoTitulo = Math.round(anchoUtil * 0.32);
  const separacion = 10;
  const anchoLeyenda = anchoUtil - anchoTitulo - separacion;

  // Leyenda en 3 columnas de código+descripción (como en el informe
  // manual), no 2: así queda más ancha y menos alta, y el recuadro del
  // título (que se estira a su misma altura) no sale desproporcionado.
  const tercio = Math.ceil(CODIGOS_INFORME.length / 3);
  const filasLeyenda = [];
  for (let i = 0; i < tercio; i++) {
    const fila = [];
    for (let col = 0; col < 3; col++) {
      const c = CODIGOS_INFORME[i + col * tercio];
      fila.push(
        c ? { content: c.codigo, styles: { fillColor: rmeHexToRgb(c.color), textColor: rmeHexToRgb(c.texto), fontStyle: 'bold', halign: 'center' } } : '',
        c ? { content: c.label, styles: { halign: 'left' } } : ''
      );
    }
    filasLeyenda.push(fila);
  }
  const anchoCodigo = 20;
  const anchoLabel = anchoLeyenda / 3 - anchoCodigo;
  doc.autoTable({
    startY: margen,
    margin: { left: margen + anchoTitulo + separacion, right: margen, bottom: margen },
    tableWidth: anchoLeyenda,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, lineColor: [0, 0, 0], lineWidth: 0.4, cellPadding: 2, valign: 'middle' },
    head: [[{ content: 'LEYENDA', colSpan: 6, styles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], halign: 'center', fontStyle: 'bold' } }]],
    columnStyles: {
      0: { cellWidth: anchoCodigo }, 1: { cellWidth: anchoLabel },
      2: { cellWidth: anchoCodigo }, 3: { cellWidth: anchoLabel },
      4: { cellWidth: anchoCodigo }, 5: { cellWidth: anchoLabel }
    },
    body: filasLeyenda
  });
  const finalYLeyenda = doc.lastAutoTable.finalY;
  const altoLeyenda = finalYLeyenda - margen;

  doc.autoTable({
    startY: margen,
    margin: { left: margen, right: margen + anchoLeyenda + separacion, bottom: margen },
    tableWidth: anchoTitulo,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 15, fontStyle: 'bold', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.75, cellPadding: 8, halign: 'left', valign: 'middle', fillColor: [255, 242, 204], minCellHeight: altoLeyenda },
    body: [[`ENTREGAS MERCANCIA ${grupoNombre.toUpperCase()}\n${rmeTituloMes(anio, mesIndex)}`]]
  });
  const finalYTitulo = doc.lastAutoTable.finalY;

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
    startY: Math.max(finalYTitulo, finalYLeyenda) + 8,
    margin: { left: margen, right: margen, bottom: margen },
    tableWidth: anchoUtil,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, lineColor: [0, 0, 0], lineWidth: 0.35, cellPadding: 2, halign: 'center', valign: 'middle', overflow: 'linebreak' },
    head: [cabecera],
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 55, halign: 'left', fontStyle: 'bold' },
      1: { cellWidth: 90, halign: 'left' },
      2: { cellWidth: 40, halign: 'left' }
    },
    body: cuerpo
  });

  return doc.lastAutoTable.finalY;
}

// El PDF siempre se genera apaisado (landscape) y en una sola página,
// como el informe que se enviaba desde el Excel (todas las tiendas caben
// en una página, aunque la letra de la tabla salga pequeña). jsPDF fija
// la posición de cada elemento usando el alto de página que tenga en ESE
// momento, así que no se puede dibujar y luego encoger la página (el
// contenido dibujado antes se queda anclado a coordenadas de la página
// grande y desaparece). Por eso se hace en dos pasadas: una primera de
// "medida" sobre una página bien alta, y una segunda, definitiva, ya con
// el alto exacto del contenido medido.
function rmeCrearDocPagina(ancho, alto) {
  const { jsPDF } = window.jspdf;
  // Se crea con un tamaño de partida cualquiera y se fija el ancho/alto
  // reales directamente sobre el documento: si se pasaran como formato
  // [ancho, alto], jsPDF los intercambiaría en cuanto el alto (con muchas
  // tiendas) supere el ancho fijo, para mantener la proporción de
  // landscape, dejando la página con el ancho equivocado.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.internal.pageSize.width = ancho;
  doc.internal.pageSize.height = alto;
  return doc;
}

function rmeConstruirPdf(grupoNombre, anio, mesIndex, filasGrupo, celdas, diasEnviados, totalDias) {
  const margen = 20;
  const anchoPagina = 841.89; // ancho A4 apaisado, en pt

  // Estimación generosa de partida (~22pt por fila más cabecera/leyenda),
  // solo para la pasada de medida: nunca debe paginar por quedarse corta.
  const alturaEstimada = 260 + filasGrupo.length * 22 + 200;

  const docMedida = rmeCrearDocPagina(anchoPagina, alturaEstimada);
  const finalYMedido = rmeDibujarContenidoPdf(docMedida, grupoNombre, anio, mesIndex, filasGrupo, celdas, diasEnviados, totalDias);

  // +6pt de margen de seguridad: al reproducir el mismo contenido en una
  // página de alto justo, un ajuste al límite puede hacer que autoTable
  // empuje la última fila a una segunda página por un redondeo mínimo.
  const alturaFinal = finalYMedido + margen + 6;
  const doc = rmeCrearDocPagina(anchoPagina, alturaFinal);
  rmeDibujarContenidoPdf(doc, grupoNombre, anio, mesIndex, filasGrupo, celdas, diasEnviados, totalDias);

  return doc;
}

rmeEngancharPanel();
