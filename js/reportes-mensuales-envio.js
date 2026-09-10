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
// El PDF se manda como adjunto directo del correo (en base64, ver
// email-service.js), sin subirlo a ningún sitio: no hay dónde verlo desde
// la app y solo ocuparía espacio de Storage sin necesidad.
//
// Solo se puede enviar el resumen de un mes ya terminado (no el mes en
// curso): ver rmeMesHaTerminado().
//
// Requiere (ya cargados antes): sb, escapeHtml, modalAlert, modalConfirm,
// mostrarCargandoEnvio, actualizarCargandoEnvio, ocultarCargandoEnvio
// (informe-envio.js), enviarEmail, sesionActual, plantillaHtmlResumenMensual,
// rmAnio, rmMes, RM_NOMBRES_MES, rmCargarDatosMes, rmConstruirTodasLasFilas,
// CODIGOS_INFORME, pdfDisponible(), tienePermiso() (permisos.js).
// ---------------------------------------------------------------

// Un mes solo se puede enviar cuando ya ha terminado del todo (nunca el
// mes en curso, aunque estemos a final de mes: podrían faltar días por
// cerrar). anio/mesIndex en el mismo formato que rmAnio/rmMes (mes 0-11).
function rmeMesHaTerminado(anio, mesIndex) {
  const hoy = new Date();
  if (anio < hoy.getFullYear()) return true;
  if (anio > hoy.getFullYear()) return false;
  return mesIndex < hoy.getMonth();
}

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

// Nombre "bonito" del PDF: el que ver\u00e1 el destinatario como adjunto del
// correo (se manda directo, en base64, sin pasar por Storage).
function rmeNombreArchivo(grupoNombre, anio, mesIndex, diaDesde, diaHasta, totalDias) {
  const rango = (diaDesde && diaHasta && totalDias && !(diaDesde === 1 && diaHasta === totalDias))
    ? ` (día ${diaDesde}-${diaHasta})` : '';
  return `${grupoNombre} - ${rmeTituloMes(anio, mesIndex)}${rango}.pdf`;
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
  // Se limita también por arriba (520px): con muchas agencias, que el panel
  // no intente ocupar todo el alto de la ventana — a partir de ahí la lista
  // hace scroll, aunque sobre hueco debajo.
  const espacioAbajo = window.innerHeight - wrapRect.bottom - margen - 16;
  panel.style.maxHeight = Math.min(520, Math.max(280, espacioAbajo)) + 'px';
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
  const mesTerminado = rmeMesHaTerminado(rmAnio, rmMes);
  rmeActualizarToolbar([], true, mesTerminado);

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

    const aviso = mesTerminado ? '' : `
      <div class="rme-aviso-mes-actual">⏳ Podrás enviar el resumen de ${rmeTituloMes(rmAnio, rmMes)} en cuanto termine el mes.</div>`;

    if (!grupos.length) {
      cont.innerHTML = aviso + '<div class="empty"><p>No hay agencias configuradas.</p></div>';
      rmeActualizarToolbar([], false, mesTerminado);
      return;
    }

    cont.innerHTML = aviso + grupos.map(g => rmeHtmlFilaGrupo(g, mesTerminado)).join('');
    rmeActualizarToolbar(grupos, false, mesTerminado);

    if (mesTerminado) {
      cont.querySelectorAll('[data-rme-enviar]').forEach(b => {
        b.addEventListener('click', () => rmeEnviarGrupo(b.dataset.rmeEnviar, rmeGruposActuales, cont));
      });
    }
  } catch (err) {
    console.error('Error cargando el panel de envío del resumen mensual:', err);
    cont.innerHTML = '<div class="empty"><p style="color:var(--grave);">No se pudo cargar la lista de agencias.</p></div>';
    rmeActualizarToolbar([], false, mesTerminado);
  }
}

// Texto/estado del botón "Enviar a todas las pendientes" según lo cargado.
// Mientras el mes que se está viendo no haya terminado, el botón queda
// deshabilitado del todo (nunca se puede enviar el resumen del mes en curso).
function rmeActualizarToolbar(grupos, cargando, mesTerminado) {
  const btn = document.getElementById('btnRmeEnviarTodas');
  const resumen = document.getElementById('rmeResumenTexto');
  if (!btn || !resumen) return;

  if (cargando) {
    resumen.textContent = 'Cargando…';
    btn.disabled = true;
    btn.textContent = '📤 Enviar a todas las pendientes';
    return;
  }

  if (!mesTerminado) {
    resumen.textContent = grupos.length ? `${grupos.length} agencia${grupos.length === 1 ? '' : 's'}` : '—';
    btn.disabled = true;
    btn.textContent = '⏳ Disponible al terminar el mes';
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

function rmeHtmlFilaGrupo(g, mesTerminado) {
  const subAgencias = g.agenciasNombres.length > 1 ? g.agenciasNombres.join(' + ') : null;
  const sinEmails = !g.emails.length;

  let estadoHtml;
  if (!mesTerminado) {
    estadoHtml = g.envio
      ? `<span class="rme-badge-enviado">✅ Enviado</span>`
      : `<button type="button" class="btn rme-btn-enviar" disabled title="Podrás enviarlo cuando termine el mes">Enviar PDF</button>`;
  } else if (g.envio) {
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
  const todasLasFilas = rmConstruirTodasLasFilas(datos.cambiosPorTienda, datos.puntualAgenciaPorTienda, datos.totalDias);
  return { ...datos, todasLasFilas };
}

// Genera el PDF de un grupo, lo sube, envía el correo y registra el envío.
// Lanza un Error legible si algo falla. No pide confirmación (la pide
// quien llama, una vez para uno o para todos).
async function rmeProcesarEnvioGrupo(grupo, datosMes) {
  const { celdas, diasEnviados, totalDias, todasLasFilas, puntualAgenciaPorTienda } = datosMes;
  const segmentosPorTienda = rmSegmentosPorTienda(todasLasFilas);
  const mesTexto = rmeTituloMes(rmAnio, rmMes);

  const filasGrupo = todasLasFilas
    .filter(f => grupo.agenciaIds.includes(f.agenciaId))
    .sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre) || a.tiendaNombre.localeCompare(b.tiendaNombre) || a.diaInicio - b.diaInicio);

  if (!filasGrupo.length) throw new Error('Esta agencia no tiene tiendas asignadas este mes.');

  const doc = rmeConstruirPdf(grupo.nombre, rmAnio, rmMes, filasGrupo, segmentosPorTienda, puntualAgenciaPorTienda, celdas, diasEnviados, totalDias);
  const nombreArchivo = rmeNombreArchivo(grupo.nombre, rmAnio, rmMes);
  const blob = doc.output('blob');

  const subject = `RESUMEN INCIDENCIAS ${grupo.nombre.toUpperCase()} ${mesTexto.toUpperCase()}`;
  const html = plantillaHtmlResumenMensual(rmeMesAnioTexto(rmMes, rmAnio));
  // El PDF se manda pegado al propio correo (base64), sin subirlo a
  // Storage: no hay dónde verlo desde la app y solo ocuparía espacio.
  await enviarEmail({
    to: grupo.emails,
    subject,
    html,
    attachments: [{ filename: nombreArchivo, content: blob, contentType: 'application/pdf' }]
  });

  const { error: eDb } = await sb.from('informes_mensuales_agencia_enviados').upsert({
    grupo: grupo.clave,
    anio: rmAnio,
    mes: rmMes + 1,
    pdf_nombre: nombreArchivo,
    enviado_en: new Date().toISOString(),
    enviado_por: sesionActual?.nombre || sesionActual?.usuario || null
  }, { onConflict: 'grupo,anio,mes' });
  if (eDb) console.error('El correo se envió, pero no se pudo guardar el estado de envío:', eDb);
  if (typeof registrarAccion === 'function') registrarAccion('reportes_mensuales', 'Enviar resumen mensual a agencia', `${grupo.nombre} — ${mesTexto}`);
}

// Envío de una sola agencia/grupo, desde su botón "Enviar PDF"/"Reenviar".
async function rmeEnviarGrupo(clave, grupos, cont) {
  if (rmeEnviando) return;
  const grupo = grupos.find(g => g.clave === clave);
  if (!grupo) return;

  if (!rmeMesHaTerminado(rmAnio, rmMes)) {
    await modalAlert('Todavía no puedes enviar el resumen del mes en curso: espera a que termine.', { titulo: 'Mes sin terminar' });
    return;
  }
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

  if (!rmeMesHaTerminado(rmAnio, rmMes)) {
    await modalAlert('Todavía no puedes enviar el resumen del mes en curso: espera a que termine.', { titulo: 'Mes sin terminar' });
    return;
  }
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
// celdas para jsPDF-autotable en lugar de HTML. diaDesde/diaHasta (por
// defecto todo el mes) recortan qué columnas de días se generan, para
// poder exportar solo un rango de días dentro del mes.
function rmeCeldasDeTramoPdf(f, segmentosTienda, puntualPorDia, celdasTienda, diasEnviados, totalDias, escala, diaDesde, diaHasta) {
  diaDesde = diaDesde || 1;
  diaHasta = diaHasta || totalDias;
  const celdas = [];
  let totalIncidencias = 0;
  const estiloCambio = { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'italic', fontSize: 6 * escala };
  const estiloNaPuntual = { fillColor: [255, 255, 255], textColor: [255, 255, 255] };

  if (f.esPuntual) {
    if (f.diaFin < diaDesde || f.diaInicio > diaHasta) {
      celdas.push({ content: '', colSpan: diaHasta - diaDesde + 1, styles: estiloNaPuntual });
      return { celdas, totalIncidencias: 0 };
    }
    const iniPropio = Math.max(f.diaInicio, diaDesde);
    const finPropio = Math.min(f.diaFin, diaHasta);
    if (iniPropio > diaDesde) celdas.push({ content: '', colSpan: iniPropio - diaDesde, styles: estiloNaPuntual });
    for (let dia = iniPropio; dia <= finPropio; dia++) {
      if (!diasEnviados.has(dia)) { celdas.push({ content: '', styles: {} }); continue; }
      const c = celdasTienda[dia];
      if (!c) { celdas.push({ content: 'OK', styles: { textColor: [0, 0, 0] } }); continue; }
      totalIncidencias++;
      celdas.push({ content: c.codigo, styles: { fillColor: rmeHexToRgb(c.color), textColor: rmeHexToRgb(c.texto), fontStyle: 'bold' } });
    }
    if (finPropio < diaHasta) celdas.push({ content: '', colSpan: diaHasta - finPropio, styles: estiloNaPuntual });
    return { celdas, totalIncidencias };
  }

  segmentosTienda
    .filter(s => !s.esPuntual && s.diaFin < f.diaInicio)
    .forEach(s => {
      const ini = Math.max(s.diaInicio, diaDesde);
      const fin = Math.min(s.diaFin, diaHasta);
      if (ini > fin) return;
      celdas.push({ content: `Antes:\n${s.agenciaNombre}`, colSpan: fin - ini + 1, styles: estiloCambio });
    });

  for (let dia = Math.max(f.diaInicio, diaDesde); dia <= Math.min(f.diaFin, diaHasta); dia++) {
    const pun = puntualPorDia && puntualPorDia[dia];
    if (pun) { celdas.push({ content: pun.agenciaNombre, styles: estiloCambio }); continue; }
    if (!diasEnviados.has(dia)) { celdas.push({ content: '', styles: {} }); continue; }
    const c = celdasTienda[dia];
    if (!c) { celdas.push({ content: 'OK', styles: { textColor: [0, 0, 0] } }); continue; }
    totalIncidencias++;
    celdas.push({ content: c.codigo, styles: { fillColor: rmeHexToRgb(c.color), textColor: rmeHexToRgb(c.texto), fontStyle: 'bold' } });
  }

  segmentosTienda
    .filter(s => !s.esPuntual && s.diaInicio > f.diaFin)
    .forEach(s => {
      const ini = Math.max(s.diaInicio, diaDesde);
      const fin = Math.min(s.diaFin, diaHasta);
      if (ini > fin) return;
      celdas.push({ content: `Cambia a:\n${s.agenciaNombre}`, colSpan: fin - ini + 1, styles: estiloCambio });
    });

  return { celdas, totalIncidencias };
}

// Dibuja título, leyenda y tabla principal sobre un doc ya creado.
// `escala` reduce proporcionalmente los tamaños de letra/relleno de todo
// el contenido (título, leyenda y tabla), sin tocar los anchos de columna
// (que siguen ocupando todo el ancho de la página): así, cuando hay
// muchas tiendas, la página sigue siendo la misma hoja A4 apaisada de
// siempre —nunca más alta que ancha— y lo que se reduce es la letra,
// igual que hace Excel al "ajustar la hoja a una página".
// Devuelve el finalY de la tabla principal, es decir, dónde termina
// realmente el contenido en esa página.
function rmeDibujarContenidoPdf(doc, grupoNombre, anio, mesIndex, filasGrupo, segmentosPorTienda, puntualAgenciaPorTienda, celdas, diasEnviados, totalDias, escala, diaDesde, diaHasta) {
  diaDesde = diaDesde || 1;
  diaHasta = diaHasta || totalDias;
  const esMesCompleto = diaDesde === 1 && diaHasta === totalDias;
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
    styles: { font: 'helvetica', fontSize: 6.5 * escala, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: Math.max(0.15, 0.4 * escala), cellPadding: 2 * escala, valign: 'middle' },
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
    styles: { font: 'helvetica', fontSize: 17 * escala, fontStyle: 'bold', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: Math.max(0.15, 0.75 * escala), cellPadding: 8 * escala, halign: 'center', valign: 'middle', fillColor: [255, 242, 204], minCellHeight: altoLeyenda },
    body: [[`ENTREGAS MERCANCIA ${grupoNombre.toUpperCase()}\n${esMesCompleto ? rmeTituloMes(anio, mesIndex) : `${diaDesde}-${diaHasta} ${rmeTituloMes(anio, mesIndex)}`}`]]
  });
  const finalYTitulo = doc.lastAutoTable.finalY;

  // --- Tabla principal ---
  const cabeceraDias = Array.from({ length: diaHasta - diaDesde + 1 }, (_, i) => String(diaDesde + i));
  const cabecera = ['AGENCIA', 'TIENDA', 'PROVINCIA', ...cabeceraDias, 'TOTAL'];
  // Índice de la columna TOTAL (la última): cambia según cuántos días
  // tenga el rango, por eso se calcula en vez de ser fijo.
  const idxColTotal = 3 + cabeceraDias.length;

  // Ancho de columna fijo e IGUAL para todas las columnas de día: si se
  // deja en automático, jsPDF-autoTable calcula cada columna según lo más
  // ancho que haya escrito en ella (como el autoajuste de Excel), y dos
  // columnas de día pueden salir con un ancho ligeramente distinto según
  // lleven "OK", un código de 1 carácter o de 2. Al fijarlo aquí, todos
  // los "cuadraditos" de día salen exactamente del mismo ancho siempre
  // (ese ancho sí cambia de un informe a otro según cuántos días tenga
  // el rango exportado: un mes de 31 días los deja algo más estrechos
  // que uno de 28).
  const anchoColAgencia = 55, anchoColTienda = 90, anchoColProvincia = 92, anchoColTotal = 32;
  const anchoFijoResto = anchoColAgencia + anchoColTienda + anchoColProvincia + anchoColTotal;
  const anchoColDia = (anchoUtil - anchoFijoResto) / cabeceraDias.length;
  const columnStylesDias = {};
  cabeceraDias.forEach((_, i) => { columnStylesDias[3 + i] = { cellWidth: anchoColDia }; });

  const cuerpo = filasGrupo.map(f => {
    const celdasTienda = celdas[f.tiendaId] || {};
    const segmentosTienda = segmentosPorTienda.get(f.tiendaId) || [f];
    const puntualPorDia = puntualAgenciaPorTienda.get(f.tiendaId);
    const { celdas: celdasDias, totalIncidencias } = rmeCeldasDeTramoPdf(f, segmentosTienda, puntualPorDia, celdasTienda, diasEnviados, totalDias, escala, diaDesde, diaHasta);
    return [
      { content: f.agenciaNombre + (f.esPuntual ? ' (puntual)' : ''), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: f.tiendaNombre, styles: { halign: 'center' } },
      { content: f.tiendaProvincia || '—', styles: { halign: 'center' } },
      ...celdasDias,
      { content: String(totalIncidencias), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
    ];
  });

  doc.autoTable({
    startY: Math.max(finalYTitulo, finalYLeyenda) + 8 * escala,
    margin: { left: margen, right: margen, bottom: margen },
    tableWidth: anchoUtil,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5 * escala, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: Math.max(0.15, 0.35 * escala), cellPadding: 2 * escala, halign: 'center', valign: 'middle', overflow: 'linebreak' },
    head: [cabecera],
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 6.5 * escala },
    columnStyles: {
      0: { cellWidth: anchoColAgencia, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: anchoColTienda, halign: 'center' },
      // Ancho suficiente para que provincias largas como "VIANA DO
      // CASTELO" entren en una sola línea y no dupliquen el alto de la fila.
      2: { cellWidth: anchoColProvincia, halign: 'center' },
      ...columnStylesDias,
      [idxColTotal]: { cellWidth: anchoColTotal }
    },
    body: cuerpo
  });

  return doc.lastAutoTable.finalY;
}

// El PDF siempre es una página A4 apaisada REAL (841.89 x 595.28pt, más
// ancha que alta: por eso sale siempre en horizontal al imprimir, nunca
// "en vertical"). Como con muchas tiendas la tabla no cabe a tamaño
// normal en esa altura, se mide primero cuánto ocuparía a tamaño normal
// en una página de prueba bien alta y, si no cabe, se vuelve a dibujar
// todo (título, leyenda y tabla) más pequeño —una única escala para
// todo—, igual que Excel al "ajustar la hoja a una página": se reduce la
// letra, no la página. Con pocas tiendas (la mayoría de los casos) no
// hace falta reducir nada.
function rmeCrearDocMedida(ancho, alto) {
  const { jsPDF } = window.jspdf;
  // Página de prueba, descartada al final: se crea con un tamaño de
  // partida cualquiera y se fija el ancho/alto reales directamente sobre
  // el documento, porque si se pasaran como formato [ancho, alto], jsPDF
  // los intercambiaría en cuanto el alto de prueba (bien alto a
  // propósito) supere al ancho, dejando la medida mal hecha.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.internal.pageSize.width = ancho;
  doc.internal.pageSize.height = alto;
  return doc;
}

// Máximo de filas (tiendas) de la tabla principal por página. Si el
// listado tiene más, se reparte en tantas páginas como haga falta, cada
// una con el título, la leyenda y la cabecera de columnas repetidos, y
// con el pie "Página X de Y" abajo del todo.
const RME_FILAS_POR_PAGINA = 40;

function rmeConstruirPdf(grupoNombre, anio, mesIndex, filasGrupo, segmentosPorTienda, puntualAgenciaPorTienda, celdas, diasEnviados, totalDias, diaDesde, diaHasta) {
  const margen = 20;
  const anchoPagina = 841.89; // A4 apaisado real, en pt
  const altoPagina = 595.28;
  const altoPie = 18; // hueco reservado abajo del todo para "Página X de Y"

  // Repartimos las filas en bloques de como máximo RME_FILAS_POR_PAGINA:
  // cada bloque es una página completa (con título, leyenda y cabecera
  // de columnas propios). Si no hay filas, dejamos un único bloque vacío
  // para no perder el título/leyenda (aunque en la práctica nunca se
  // llega aquí sin filas, ver comprobaciones antes de llamar a esta función).
  const bloques = [];
  for (let i = 0; i < filasGrupo.length; i += RME_FILAS_POR_PAGINA) {
    bloques.push(filasGrupo.slice(i, i + RME_FILAS_POR_PAGINA));
  }
  if (!bloques.length) bloques.push([]);

  // Pasada de medida a tamaño normal (escala 1), con el bloque más
  // grande (como mucho RME_FILAS_POR_PAGINA filas) en una página de
  // prueba bien alta para que nunca pagine por quedarse corta. Al medir
  // como mucho una página llena (y no el listado entero), la escala sale
  // igual de homogénea tenga el informe 5 filas o 500.
  const filasBloqueMasGrande = bloques.reduce((max, b) => Math.max(max, b.length), 0) || 1;
  const alturaEstimada = 260 + filasBloqueMasGrande * 22 + 200;
  const docMedida = rmeCrearDocMedida(anchoPagina, alturaEstimada);
  const bloqueParaMedir = bloques.reduce((mayor, b) => (b.length > mayor.length ? b : mayor), bloques[0]);
  const finalYMedido = rmeDibujarContenidoPdf(docMedida, grupoNombre, anio, mesIndex, bloqueParaMedir, segmentosPorTienda, puntualAgenciaPorTienda, celdas, diasEnviados, totalDias, 1, diaDesde, diaHasta);

  // Si el contenido de una página llena a tamaño normal no cabe en el
  // alto real de una A4 (contando el hueco del pie de página), se
  // calcula la escala que hace falta para que sí quepa (con un pequeño
  // margen de seguridad); si cabe de sobra, se deja a tamaño normal. La
  // misma escala se usa en todas las páginas del documento.
  const alturaNecesaria = finalYMedido - margen;
  const alturaDisponible = (altoPagina - margen * 2 - altoPie) * 0.985;
  const escala = alturaNecesaria > alturaDisponible ? alturaDisponible / alturaNecesaria : 1;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  bloques.forEach((filasPagina, idx) => {
    if (idx > 0) doc.addPage();
    rmeDibujarContenidoPdf(doc, grupoNombre, anio, mesIndex, filasPagina, segmentosPorTienda, puntualAgenciaPorTienda, celdas, diasEnviados, totalDias, escala, diaDesde, diaHasta);
  });

  rmeAnadirPiePagina(doc, margen);

  return doc;
}

// Añade, abajo del todo y centrado en cada página ya dibujada, el pie
// "Página X de Y". Se hace al final (con el documento ya completo) para
// poder saber el total de páginas de una vez.
function rmeAnadirPiePagina(doc, margen) {
  const totalPaginas = doc.internal.getNumberOfPages();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`Página ${pagina} de ${totalPaginas}`, anchoPagina / 2, altoPagina - margen / 2 - 2, { align: 'center' });
  }
}

// ---------------------------------------------------------------
// Tarea pendiente en Inicio: avisa cuando un mes ya terminado se queda
// sin enviar a alguna agencia, hasta que se envíe. RME_MES_INICIO marca
// el primer mes que cubre esta función: antes de esa fecha no había
// seguimiento de estos envíos (se hacían a mano), así que no tiene
// sentido -ni sería correcto- avisar de meses anteriores sin datos.
// ---------------------------------------------------------------
const RME_MES_INICIO = { anio: 2026, mes: 8 }; // Septiembre de 2026 (mes 0-indexado)

async function rmeComprobarPendienteInicio() {
  const hoy = new Date();
  let anio = hoy.getFullYear();
  let mes = hoy.getMonth() - 1; // último mes ya terminado
  if (mes < 0) { mes = 11; anio -= 1; }

  if (anio < RME_MES_INICIO.anio || (anio === RME_MES_INICIO.anio && mes < RME_MES_INICIO.mes)) {
    return null;
  }

  try {
    const [{ data: agencias, error: e1 }, { data: envios, error: e2 }] = await Promise.all([
      sb.from('agencias').select('id, nombre, orden, emails, grupo_envio').eq('activo', true),
      sb.from('informes_mensuales_agencia_enviados').select('grupo').eq('anio', anio).eq('mes', mes + 1)
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const grupos = rmeConstruirGrupos(agencias || []);
    if (!grupos.length) return null;
    const enviados = new Set((envios || []).map(e => e.grupo));
    const pendientes = grupos.filter(g => !enviados.has(g.clave));
    if (!pendientes.length) return null;

    return {
      icono: '🗓️',
      texto: `Informe mensual de ${rmeMesNombreCapitalizado(mes).toUpperCase()} pendiente de enviar a agencias (${pendientes.length})`,
      vista: 'analisis-reportes-mensuales',
      anio,
      mes
    };
  } catch (err) {
    console.error('Error comprobando el resumen mensual pendiente:', err);
    return null;
  }
}

rmeEngancharPanel();
