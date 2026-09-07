// js/reportes-mensuales-exportar.js
// ---------------------------------------------------------------
// Análisis · Reportes mensuales → botón "Exportar".
//
// Descarga en PDF, para el mes que se esté viendo en Reportes mensuales
// (rmAnio / rmMes de reportes-mensuales.js), el mismo PDF "ENTREGAS
// MERCANCIA AGENCIA" que se envía por correo a las agencias (mismo
// título, misma leyenda de códigos, misma tabla Agencia/Tienda/
// Provincia/días/Total) — pero para UNA agencia elegida, y como descarga
// directa al dispositivo, sin enviar ningún correo ni tocar la tabla
// informes_mensuales_agencia_enviados.
//
// A diferencia del envío por correo (reportes-mensuales-envio.js), aquí
// SÍ se puede exportar el mes en curso (no solo meses ya terminados): es
// una descarga local para consultar/imprimir, no una comunicación oficial
// a la agencia.
//
// Reutiliza de reportes-mensuales-envio.js: rmeConstruirGrupos(),
// rmeObtenerDatosMes(), rmeConstruirPdf(), rmeNombreArchivo(),
// rmeTituloMes(). Requiere también (ya cargados antes): sb, escapeHtml,
// modalAlert, pdfDisponible() (informe-pdf.js), rmAnio, rmMes
// (reportes-mensuales.js).
// ---------------------------------------------------------------

let rmxEnganchado = false;
let rmxDescargando = false; // evita doble clic mientras se genera un PDF
let rmxGruposActuales = [];

function rmxPosicionarPanel() {
  const btn = document.getElementById('btnRmExportar');
  const panel = document.getElementById('rmExportarPanel');
  const wrap = btn.closest('.filtros-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(560, window.innerWidth - margen * 2);
  panel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (window.innerWidth - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  panel.style.left = left + 'px';

  // Igual que en el panel de envío: alto máximo según el hueco disponible
  // bajo el botón, para que nunca se salga de la pantalla por abajo (la
  // lista hace scroll interno).
  const espacioAbajo = window.innerHeight - wrapRect.bottom - margen - 16;
  panel.style.maxHeight = Math.max(280, espacioAbajo) + 'px';
}

function rmxAbrirPanel() {
  if (typeof rmCerrarFiltrosPanel === 'function') rmCerrarFiltrosPanel();
  if (typeof rmeCerrarPanel === 'function') rmeCerrarPanel();
  rmxPosicionarPanel();
  document.getElementById('rmExportarPanel').classList.add('show');
  document.getElementById('btnRmExportar').classList.add('open');
  document.getElementById('rmExportarMesTexto').textContent = rmeTituloMes(rmAnio, rmMes);
  rmxCargarYRenderPanel();
}
function rmxCerrarPanel() {
  document.getElementById('rmExportarPanel').classList.remove('show');
  document.getElementById('btnRmExportar').classList.remove('open');
}

function rmxEngancharPanel() {
  if (rmxEnganchado) return;
  rmxEnganchado = true;

  const btn = document.getElementById('btnRmExportar');
  const panel = document.getElementById('rmExportarPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.classList.contains('show')) rmxCerrarPanel();
    else rmxAbrirPanel();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) rmxCerrarPanel();
  });
  window.addEventListener('resize', () => {
    if (panel.classList.contains('show')) rmxPosicionarPanel();
  });

  document.getElementById('btnRmCerrarExportar').addEventListener('click', rmxCerrarPanel);
}

// Carga agencias frescas (con grupo_envio, para agrupar igual que al
// enviar por correo) y pinta la lista de agencias/grupos para elegir.
async function rmxCargarYRenderPanel() {
  const cont = document.getElementById('rmExportarLista');
  cont.innerHTML = '<div class="empty"><p>Cargando…</p></div>';
  document.getElementById('rmExportarMesTexto').textContent = rmeTituloMes(rmAnio, rmMes);

  try {
    const { data: agencias, error } = await sb
      .from('agencias')
      .select('id, nombre, orden, emails, grupo_envio')
      .eq('activo', true)
      .order('orden');
    if (error) throw error;

    const grupos = rmeConstruirGrupos(agencias || []);
    rmxGruposActuales = grupos;

    if (!grupos.length) {
      cont.innerHTML = '<div class="empty"><p>No hay agencias configuradas.</p></div>';
      return;
    }

    cont.innerHTML = grupos.map(rmxHtmlFilaGrupo).join('');
    cont.querySelectorAll('[data-rmx-descargar]').forEach(b => {
      b.addEventListener('click', () => rmxDescargarGrupo(b.dataset.rmxDescargar, rmxGruposActuales, cont));
    });
  } catch (err) {
    console.error('Error cargando el panel de exportación del reporte mensual:', err);
    cont.innerHTML = '<div class="empty"><p style="color:var(--grave);">No se pudo cargar la lista de agencias.</p></div>';
  }
}

function rmxHtmlFilaGrupo(g) {
  const subAgencias = g.agenciasNombres.length > 1 ? g.agenciasNombres.join(' + ') : null;
  return `
    <div class="rme-grupo-row" data-rmx-fila="${escapeHtml(g.clave)}">
      <div class="rme-grupo-info">
        <b>${escapeHtml(g.nombre)}</b>
        ${subAgencias ? `<span class="rme-sub">Incluye: ${escapeHtml(subAgencias)}</span>` : ''}
      </div>
      <div class="rme-grupo-estado">
        <button type="button" class="btn primary rme-btn-enviar" data-rmx-descargar="${escapeHtml(g.clave)}">📄 Descargar PDF</button>
      </div>
    </div>`;
}

// Genera el PDF de la agencia/grupo elegido (mismo formato que el envío
// por correo) y lo descarga directamente, sin enviar nada ni registrar
// ningún envío en la base de datos.
async function rmxDescargarGrupo(clave, grupos, cont) {
  if (rmxDescargando) return;
  const grupo = grupos.find(g => g.clave === clave);
  if (!grupo) return;

  if (!pdfDisponible()) {
    await modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
    return;
  }

  rmxDescargando = true;
  const estadoEl = cont.querySelector(`[data-rmx-fila="${CSS.escape(clave)}"] .rme-grupo-estado`);
  const estadoOriginal = estadoEl ? estadoEl.innerHTML : '';
  if (estadoEl) estadoEl.innerHTML = '<span class="rme-sub">Generando PDF…</span>';

  try {
    const { celdas, diasEnviados, totalDias, todasLasFilas } = await rmeObtenerDatosMes();

    const filasGrupo = todasLasFilas
      .filter(f => grupo.agenciaIds.includes(f.agenciaId))
      .sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre) || a.tiendaNombre.localeCompare(b.tiendaNombre) || a.diaInicio - b.diaInicio);

    if (!filasGrupo.length) throw new Error('Esta agencia no tiene tiendas asignadas este mes.');

    const doc = rmeConstruirPdf(grupo.nombre, rmAnio, rmMes, filasGrupo, celdas, diasEnviados, totalDias);
    doc.save(rmeNombreArchivo(grupo.nombre, rmAnio, rmMes));
  } catch (err) {
    console.error(`Error exportando el reporte mensual de ${grupo.nombre}:`, err);
    await modalAlert(err.message || 'No se pudo generar el PDF.', { titulo: 'Error al exportar' });
  } finally {
    rmxDescargando = false;
    if (estadoEl) estadoEl.innerHTML = estadoOriginal;
  }
}

rmxEngancharPanel();
