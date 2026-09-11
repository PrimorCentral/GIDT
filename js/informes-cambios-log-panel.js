// ---------------------------------------------------------------
// Panel "Log de cambios" (botón general de Informe del día / Historial)
// ---------------------------------------------------------------
// Lee la tabla informes_cambios_log (rellenada desde
// js/informes-cambios-log.js al editar tras el envío) y la muestra
// en un modal, agrupada cronológicamente, con una frase por cambio:
// "Usuario ha añadido/quitado/cambiado esto".
//
// Requiere (ya cargados antes): sb, escapeHtml, formatearFechaHoraCorta
// (navegacion.js), informeHoyCache, historialInformeActual
// (informe-hoy.js), modalAlert (ui-modal.js).

function iclogCap(motivo) {
  return motivo ? motivo.charAt(0) + motivo.slice(1).toLowerCase() : motivo;
}

const ICLOG_ETIQUETA_TIPO = { ALTA: 'Añadida', BAJA: 'Quitada', MODIFICACION: 'Modificada' };

function iclogDescripcion(row) {
  const antes = row.motivos_antes || [];
  const despues = row.motivos_despues || [];

  if (row.tipo_cambio === 'ALTA') {
    let txt = `Añadió la incidencia: ${despues.map(iclogCap).join(', ') || '—'}`;
    if (row.observaciones_despues) txt += ` (${row.observaciones_despues})`;
    return txt;
  }
  if (row.tipo_cambio === 'BAJA') {
    let txt = `Quitó la incidencia: ${antes.map(iclogCap).join(', ') || '—'}`;
    if (row.observaciones_antes) txt += ` (${row.observaciones_antes})`;
    return txt;
  }

  // MODIFICACION
  const añadidos = despues.filter(m => !antes.includes(m));
  const quitados = antes.filter(m => !despues.includes(m));
  const partes = [];
  if (añadidos.length) partes.push(`añadió ${añadidos.map(iclogCap).join(', ')}`);
  if (quitados.length) partes.push(`quitó ${quitados.map(iclogCap).join(', ')}`);

  const obsAntes = row.observaciones_antes || '';
  const obsDespues = row.observaciones_despues || '';
  if (obsAntes !== obsDespues) {
    if (!obsAntes) partes.push(`añadió la observación "${obsDespues}"`);
    else if (!obsDespues) partes.push(`quitó la observación "${obsAntes}"`);
    else partes.push(`cambió la observación de "${obsAntes}" a "${obsDespues}"`);
  }
  return partes.length ? partes.join(' · ') : 'Modificó la incidencia.';
}

const iclogOverlay = document.getElementById('iclogOverlay');
const iclogLista = document.getElementById('iclogLista');
const iclogFecha = document.getElementById('iclogFecha');

function cerrarLogCambios() {
  iclogOverlay?.classList.remove('show');
}

async function abrirLogCambios(contexto) {
  if (!iclogOverlay) return;
  const informe = contexto === 'hoy' ? informeHoyCache : historialInformeActual;
  if (!informe) return;

  const fechaInforme = new Date(informe.fecha + 'T00:00:00');
  iclogFecha.textContent = formatearFechaCorta(fechaInforme);
  iclogLista.innerHTML = '<div class="empty"><p>Cargando…</p></div>';
  iclogOverlay.classList.add('show');

  try {
    const { data, error } = await sb
      .from('informes_cambios_log')
      .select('id, tienda_nombre, agencia_nombre, tipo_cambio, motivos_antes, motivos_despues, observaciones_antes, observaciones_despues, usuario, creado_en')
      .eq('informe_id', informe.id)
      .order('creado_en', { ascending: false })
      .limit(300);
    if (error) throw error;

    if (!data || !data.length) {
      iclogLista.innerHTML = `
        <div class="empty">
          <div class="glyph">🕓</div>
          <h3>Sin cambios registrados</h3>
          <p>No se ha modificado nada en este informe desde que se envió a las agencias.</p>
        </div>`;
      return;
    }

    iclogLista.innerHTML = data.map(row => `
      <div class="iclog-fila">
        <div class="iclog-fila-cabecera">
          <span class="iclog-tipo ${row.tipo_cambio.toLowerCase()}">${ICLOG_ETIQUETA_TIPO[row.tipo_cambio] || row.tipo_cambio}</span>
          <b>${escapeHtml(row.tienda_nombre || '—')}</b>
          ${row.agencia_nombre ? `<span class="iclog-agencia">${escapeHtml(row.agencia_nombre)}</span>` : ''}
          <span class="iclog-meta">${escapeHtml(row.usuario || '—')} · ${formatearFechaHoraCorta(new Date(row.creado_en))}</span>
        </div>
        <div class="iclog-fila-detalle">${escapeHtml(iclogDescripcion(row))}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error cargando el log de cambios:', err);
    iclogLista.innerHTML = `
      <div class="empty">
        <div class="glyph">⚠️</div>
        <h3>Error al cargar</h3>
        <p>No se pudo consultar el log de cambios de este informe.</p>
      </div>`;
  }
}

document.getElementById('btnLogCambiosHoy')?.addEventListener('click', () => abrirLogCambios('hoy'));
document.getElementById('btnLogCambiosHistorial')?.addEventListener('click', () => abrirLogCambios('historial'));
document.getElementById('btnCerrarLogCambios')?.addEventListener('click', cerrarLogCambios);
iclogOverlay?.addEventListener('click', (e) => { if (e.target === iclogOverlay) cerrarLogCambios(); });
