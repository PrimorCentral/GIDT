// js/panel-siniestros-exportar.js
// ---------------------------------------------------------------
// Panel siniestros → botón "Exportar".
//
// Descarga en PDF un listado de siniestros del Panel de siniestros, con
// el mismo lenguaje visual que el informe mensual (caja de título en
// negro, tabla con cabecera negra y pie "Página X de Y · Generado
// el..."), pero en formato listado (una fila por siniestro) en vez de
// rejilla de días por tienda, porque aquí no aplica esa estructura.
//
// El panel deja elegir:
//   - Rango de fechas (obligatorio; por defecto, todo lo que hay cargado
//     en el Panel de siniestros).
//   - Qué exportar: o bien el filtro que ya esté activo en la pantalla
//     (buscador, fechas, agencia, estado, tipo, origen, recogida, sin
//     factura/albarán/correo) tal cual se está viendo, o bien elegir
//     agencia/estado/tipo/origen/recogida a mano dentro del propio panel
//     ("todo" si se deja todo en blanco).
//
// Requiere (ya cargados antes): sb (no se usa, reutiliza panelCache ya
// cargado), escapeHtml, modalAlert, pdfDisponible() (informe-pdf.js),
// bordeDerechoVisible() (navegacion.js), formatearFechaCorta,
// formatearFechaHoraCorta (navegacion.js), agenciasCache (tiendas.js),
// panelCache, panelFiltros, psFormatearFecha, psFormatearValor
// (panel-siniestros.js).
// ---------------------------------------------------------------

let psxEnganchado = false;
let psxDescargando = false; // evita doble clic mientras se genera un PDF

const PSX_COLOR_HEADER    = [0, 0, 0];
const PSX_COLOR_INK       = [18, 24, 31];
const PSX_COLOR_INK_SOFT  = [91, 101, 114];
const PSX_COLOR_FILA_ALT  = [245, 247, 249];
const PSX_COLOR_COBRADO   = [22, 130, 82];
const PSX_COLOR_PDTE      = [176, 76, 12];
const PSX_COLOR_ANULADO   = [91, 101, 114];

function psxPosicionarPanel() {
  const btn = document.getElementById('btnPsExportar');
  const panel = document.getElementById('psxPanel');
  const wrap = btn.closest('.filtros-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(560, bordeDerechoVisible() - margen * 2);
  panel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (bordeDerechoVisible() - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  panel.style.left = left + 'px';

  // El panel tiene bastante contenido (fechas + filtro activo + filtros
  // manuales); si no cupiera entero bajo el botón, que haga scroll
  // interno en el cuerpo en vez de salirse por abajo de la pantalla.
  const espacioAbajo = window.innerHeight - wrapRect.bottom - margen - 16;
  panel.style.maxHeight = Math.min(560, Math.max(280, espacioAbajo)) + 'px';
}

function psxAbrirPanel() {
  if (typeof cerrarModalPanelSiniestro === 'function') { /* no-op: solo por si algún día hay un modal abierto detrás */ }
  psxPosicionarPanel();
  document.getElementById('psxPanel').classList.add('show');
  document.getElementById('btnPsExportar').classList.add('open');
  document.getElementById('psxUsarFiltroActivo').checked = psxHayFiltroActivo();
  psxRellenarPanel();
}
function psxCerrarPanel() {
  document.getElementById('psxPanel').classList.remove('show');
  document.getElementById('btnPsExportar').classList.remove('open');
}

function psxEngancharPanel() {
  if (psxEnganchado) return;
  psxEnganchado = true;

  const btn = document.getElementById('btnPsExportar');
  const panel = document.getElementById('psxPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.classList.contains('show')) psxCerrarPanel();
    else psxAbrirPanel();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) psxCerrarPanel();
  });
  window.addEventListener('resize', () => {
    if (panel.classList.contains('show')) psxPosicionarPanel();
  });

  document.getElementById('btnPsxCerrar').addEventListener('click', psxCerrarPanel);
  document.getElementById('psxBtnDescargar').addEventListener('click', psxDescargar);
  document.getElementById('psxUsarFiltroActivo').addEventListener('change', psxActualizarUsoFiltro);
}

// ---------------------------------------------------------------
// "Usar el filtro activo de la pantalla": igual patrón que en Reportes
// mensuales → Exportar. Solo cuenta lo que ya esté puesto en la barra
// de filtros del Panel de siniestros (panelFiltros), sin contar las
// fechas: esas se eligen siempre en este propio panel.
// ---------------------------------------------------------------
function psxHayFiltroActivo() {
  const f = panelFiltros;
  return !!(f.texto.trim() || f.agenciaId || f.estado || f.tipo || f.origen || f.recogida || f.sinFactura || f.sinAlbaran || f.sinCorreo);
}

const PSX_ETIQUETA_ORIGEN = { ALMACEN: 'Almacén', WEB: 'Web', RETIRADAS: 'Retiradas', AGENCIA: 'Agencia', OTRO: 'Otro', SIN_ORIGEN: 'Sin origen' };
const PSX_ETIQUETA_RECOGIDA = {
  'EN ESPERA DE TIENDA': 'En espera de tienda', 'ENVIADO A CENTRAL': 'Enviado a central', 'RECOGIDO POR AGENCIA': 'Recogido por agencia',
  PDTE_DENTRO: 'Pdte. dentro de límite', PDTE_FUERA: 'Pdte. fuera de límite'
};

function psxResumenFiltroActivo() {
  const f = panelFiltros;
  const partes = [];
  if (f.texto.trim()) partes.push(`texto "${f.texto.trim()}"`);
  if (f.agenciaId) partes.push(agenciasCache.find(a => String(a.id) === String(f.agenciaId))?.nombre || 'una agencia');
  if (f.estado) partes.push(f.estado);
  if (f.tipo) partes.push(f.tipo);
  if (f.origen) partes.push(PSX_ETIQUETA_ORIGEN[f.origen] || f.origen);
  if (f.recogida) partes.push(PSX_ETIQUETA_RECOGIDA[f.recogida] || f.recogida);
  if (f.sinFactura) partes.push('sin factura');
  if (f.sinAlbaran) partes.push('sin albarán');
  if (f.sinCorreo) partes.push('sin enviar a agencia');
  return partes.join(', ') || 'sin filtros';
}

function psxActualizarUsoFiltro() {
  const wrap = document.getElementById('psxUsarFiltroWrap');
  const check = document.getElementById('psxUsarFiltroActivo');
  const camposManual = document.getElementById('psxCamposManual');
  if (!wrap || !check) return;

  const hayFiltro = psxHayFiltroActivo();
  wrap.style.display = hayFiltro ? 'flex' : 'none';
  document.getElementById('psxFiltroResumen').textContent = psxResumenFiltroActivo();
  if (!hayFiltro) check.checked = false;

  const usar = hayFiltro && check.checked;
  camposManual.style.opacity = usar ? '.45' : '';
  camposManual.style.pointerEvents = usar ? 'none' : '';
  camposManual.querySelectorAll('select, input').forEach(el => { el.disabled = usar; });
}

// Rellena el desplegable de Agencia y coloca fechas por defecto (el
// rango real de datos que hay en el Panel de siniestros ahora mismo).
function psxRellenarPanel() {
  const selectAgencia = document.getElementById('psxAgencia');
  selectAgencia.innerHTML = '<option value="">Todas las agencias</option>' +
    agenciasCache.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');

  const inputDesde = document.getElementById('psxFechaDesde');
  const inputHasta = document.getElementById('psxFechaHasta');
  if (!inputDesde.value || !inputHasta.value) {
    const fechas = panelCache.map(s => s.fecha).filter(Boolean).sort();
    inputDesde.value = panelFiltros.fechaDesde || fechas[0] || '';
    inputHasta.value = panelFiltros.fechaHasta || fechas[fechas.length - 1] || '';
  }

  psxActualizarUsoFiltro();
}

// ---------------------------------------------------------------
// Filtrado de filas a exportar (aparte del rango de fechas, que se
// aplica siempre): o bien el mismo criterio que panelFiltros (menos
// fechas), o bien lo elegido a mano en este panel.
// ---------------------------------------------------------------
function psxFilasAExportar(fechaDesde, fechaHasta, usarFiltroActivo) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const criterio = usarFiltroActivo
    ? { ...panelFiltros, fechaDesde: '', fechaHasta: '' }
    : {
        texto: '',
        agenciaId: document.getElementById('psxAgencia').value,
        estado: document.getElementById('psxEstado').value,
        tipo: document.getElementById('psxTipo').value,
        origen: document.getElementById('psxOrigen').value,
        recogida: document.getElementById('psxRecogida').value,
        sinFactura: document.getElementById('psxSinFactura').checked,
        sinAlbaran: document.getElementById('psxSinAlbaran').checked,
        sinCorreo: document.getElementById('psxSinCorreo').checked,
        fechaDesde: '', fechaHasta: ''
      };

  return panelCache.filter(s => {
    if (fechaDesde && (s.fecha || '') < fechaDesde) return false;
    if (fechaHasta && (s.fecha || '') > fechaHasta) return false;
    if (criterio.tipo && s.tipo !== criterio.tipo) return false;
    if (criterio.origen === 'SIN_ORIGEN' && s.origen) return false;
    if (criterio.origen && criterio.origen !== 'SIN_ORIGEN' && s.origen !== criterio.origen) return false;
    if (criterio.agenciaId && String(s.agencia_id) !== String(criterio.agenciaId)) return false;
    if (criterio.estado && s.estado !== criterio.estado) return false;
    if (criterio.recogida) {
      if (criterio.recogida === 'ENVIADO A CENTRAL' || criterio.recogida === 'RECOGIDO POR AGENCIA' || criterio.recogida === 'EN ESPERA DE TIENDA') {
        if (s.recogida_estado !== criterio.recogida) return false;
      } else {
        if (s.recogida_estado || !s.recogida_limite) return false;
        const limite = new Date(s.recogida_limite + 'T00:00:00');
        const fuera = limite < hoy;
        if (criterio.recogida === 'PDTE_DENTRO' && fuera) return false;
        if (criterio.recogida === 'PDTE_FUERA' && !fuera) return false;
      }
    }
    if (criterio.sinFactura && s.factura_url) return false;
    if (criterio.sinAlbaran && s.albaran_url) return false;
    if (criterio.sinCorreo && s.correo_enviado) return false;
    if (criterio.texto) {
      const texto = criterio.texto.trim().toUpperCase();
      const campo = [s.agencia_nombre, s.tienda_nombre, s.informacion, s.num_albaran, s.num_factura].filter(Boolean).join(' ').toUpperCase();
      if (texto && !campo.includes(texto)) return false;
    }
    return true;
  }).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.agencia_nombre || '').localeCompare(b.agencia_nombre || ''));
}

// ---------------------------------------------------------------
// Construcción del PDF (mismo lenguaje visual que el informe mensual y
// el ranking de incidencias: caja de título en negro, tabla con
// cabecera negra, pie "Página X de Y · Generado el...").
// ---------------------------------------------------------------
function psxRecogidaTexto(s) {
  if (s.tipo === 'FALTAS') return 'NO APLICA';
  if (s.recogida_estado) {
    return s.recogida_estado === 'ENVIADO A CENTRAL' ? 'A central'
      : s.recogida_estado === 'RECOGIDO POR AGENCIA' ? 'Recogido'
      : 'Espera tienda';
  }
  return psFormatearFecha(s.recogida_limite);
}

function psxDibujarKpis(doc, margen, anchoUtil, y, kpis) {
  const gap = 8;
  const anchoTarjeta = (anchoUtil - gap * (kpis.length - 1)) / kpis.length;
  const altoTarjeta = 34;
  kpis.forEach((k, i) => {
    const x = margen + i * (anchoTarjeta + gap);
    doc.setDrawColor(227, 231, 236);
    doc.setFillColor(...PSX_COLOR_FILA_ALT);
    doc.roundedRect(x, y, anchoTarjeta, altoTarjeta, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...PSX_COLOR_INK);
    doc.text(k.valor, x + anchoTarjeta / 2, y + 15, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PSX_COLOR_INK_SOFT);
    doc.text(k.label, x + anchoTarjeta / 2, y + 27, { align: 'center' });
  });
  return y + altoTarjeta + 14;
}

function psxAnadirPiePagina(doc, margen) {
  const totalPaginas = doc.internal.getNumberOfPages();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const generadoTexto = `Generado el ${formatearFechaHoraCorta(new Date())}`;
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PSX_COLOR_INK_SOFT);
    doc.text('GIDT · Panel de siniestros', margen, altoPagina - margen / 2 - 2);
    doc.text(`Página ${pagina} de ${totalPaginas}`, anchoPagina / 2, altoPagina - margen / 2 - 2, { align: 'center' });
    doc.text(generadoTexto, anchoPagina - margen, altoPagina - margen / 2 - 2, { align: 'right' });
  }
}

function psxConstruirPdf(filas, fechaDesde, fechaHasta, filtroTexto) {
  const { jsPDF } = window.jspdf;
  const margen = 28;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const anchoUtil = doc.internal.pageSize.getWidth() - margen * 2;

  const periodoTexto = `${formatearFechaCorta(new Date(fechaDesde + 'T00:00:00'))} – ${formatearFechaCorta(new Date(fechaHasta + 'T00:00:00'))}`;

  // --- Cabecera: caja de título en negro (igual que informe mensual/ranking) ---
  doc.autoTable({
    startY: margen,
    margin: { left: margen, right: margen },
    tableWidth: anchoUtil,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 11, textColor: [255, 255, 255], lineColor: PSX_COLOR_HEADER, lineWidth: 0.75, cellPadding: 9, valign: 'middle', fillColor: PSX_COLOR_HEADER },
    columnStyles: {
      0: { cellWidth: anchoUtil * 0.42, halign: 'left', fontStyle: 'bold', fontSize: 13 },
      1: { halign: 'center', fontStyle: 'bold' },
      2: { halign: 'right', fontStyle: 'normal', fontSize: 9 }
    },
    body: [['PANEL DE SINIESTROS', `Periodo: ${periodoTexto}`, `${filas.length} siniestro${filas.length === 1 ? '' : 's'}`]]
  });
  let y = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PSX_COLOR_INK_SOFT);
  doc.text(filtroTexto, margen, y);
  y += 10;

  // --- Franja de KPIs ---
  const totalImporte = filas.reduce((acc, f) => acc + (Number(f.valor) || 0), 0);
  const pendientes = filas.filter(f => f.estado === 'PDTE COBRO');
  const totalPendiente = pendientes.reduce((acc, f) => acc + (Number(f.valor) || 0), 0);
  const sinFactura = filas.filter(f => !f.num_factura).length;
  const recogidaPendiente = filas.filter(f => f.tipo !== 'FALTAS' && f.recogida_limite && !f.recogida_estado).length;
  const kpis = [
    { label: 'Siniestros', valor: String(filas.length) },
    { label: 'Importe total', valor: psFormatearValor(totalImporte) },
    { label: 'Pdte. de cobro', valor: `${pendientes.length}  (${psFormatearValor(totalPendiente)})` },
    { label: 'Sin factura', valor: String(sinFactura) },
    { label: 'Recogida pendiente', valor: String(recogidaPendiente) }
  ];
  y = psxDibujarKpis(doc, margen, anchoUtil, y, kpis);

  // --- Tabla principal (listado) ---
  const cabecera = ['Fecha', 'Agencia', 'Tienda', 'Origen', 'Tipo', 'Información', 'Nº Alb.', 'Nº Factura', 'Importe', 'Estado', 'Recogida límite'];
  const cuerpo = filas.map(f => ([
    { content: psFormatearFecha(f.fecha) },
    { content: f.agencia_nombre || '—', styles: { fontStyle: 'bold' } },
    { content: f.tienda_nombre || '—' },
    { content: f.origen || '—' },
    { content: f.tipo || '—', styles: { fontStyle: 'bold' } },
    { content: f.informacion || '—' },
    { content: f.num_albaran || '—' },
    { content: f.num_factura || '—' },
    { content: psFormatearValor(f.valor), styles: { halign: 'right' } },
    { content: f.estado || '—', styles: { fontStyle: 'bold', textColor: f.estado === 'COBRADO' ? PSX_COLOR_COBRADO : f.estado === 'ANULADO' ? PSX_COLOR_ANULADO : PSX_COLOR_PDTE } },
    { content: psxRecogidaTexto(f) }
  ]));

  doc.autoTable({
    startY: y,
    margin: { left: margen, right: margen, bottom: 40 },
    tableWidth: anchoUtil,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.8, lineColor: [227, 231, 236], lineWidth: 0.5, cellPadding: 5, valign: 'middle', textColor: PSX_COLOR_INK, overflow: 'linebreak' },
    head: [cabecera],
    headStyles: { fillColor: PSX_COLOR_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
    alternateRowStyles: { fillColor: PSX_COLOR_FILA_ALT },
    columnStyles: {
      0: { cellWidth: 56, halign: 'center' },
      1: { cellWidth: 78, halign: 'center' },
      2: { cellWidth: 82, halign: 'center' },
      3: { cellWidth: 58, halign: 'center' },
      4: { cellWidth: 68, halign: 'center' },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 56, halign: 'center' },
      7: { cellWidth: 58, halign: 'center' },
      8: { cellWidth: 56 },
      9: { cellWidth: 58, halign: 'center' },
      10: { cellWidth: 68, halign: 'center' }
    },
    body: cuerpo.length ? cuerpo : [[{ content: 'No hay siniestros que cumplan los filtros elegidos.', colSpan: 11, styles: { halign: 'center', textColor: PSX_COLOR_INK_SOFT } }]]
  });

  psxAnadirPiePagina(doc, margen);
  return doc;
}

function psxNombreArchivo(fechaDesde, fechaHasta) {
  return `Panel de siniestros - ${fechaDesde} a ${fechaHasta}.pdf`;
}

async function psxDescargar() {
  if (psxDescargando) return;

  const fechaDesde = document.getElementById('psxFechaDesde').value;
  const fechaHasta = document.getElementById('psxFechaHasta').value;
  if (!fechaDesde || !fechaHasta) {
    await modalAlert('Elige una fecha de inicio y una de fin.', { titulo: 'Faltan fechas' });
    return;
  }
  if (fechaDesde > fechaHasta) {
    await modalAlert('La fecha "Desde" no puede ser posterior a la fecha "Hasta".', { titulo: 'Rango de fechas no válido' });
    return;
  }
  if (!pdfDisponible()) {
    await modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
    return;
  }

  const usarFiltroActivo = psxHayFiltroActivo() && document.getElementById('psxUsarFiltroActivo').checked;
  const filas = psxFilasAExportar(fechaDesde, fechaHasta, usarFiltroActivo);

  const btn = document.getElementById('psxBtnDescargar');
  const textoOriginal = btn.textContent;
  psxDescargando = true;
  btn.disabled = true;
  btn.textContent = 'Generando PDF…';

  try {
    const filtroTexto = usarFiltroActivo ? `Filtro activo: ${psxResumenFiltroActivo()}` : `Filtro: ${psxResumenManual()}`;
    const doc = psxConstruirPdf(filas, fechaDesde, fechaHasta, filtroTexto);
    doc.save(psxNombreArchivo(fechaDesde, fechaHasta));
    psxCerrarPanel();
  } catch (err) {
    console.error('Error exportando el panel de siniestros:', err);
    await modalAlert(err.message || 'No se pudo generar el PDF.', { titulo: 'Error al exportar' });
  } finally {
    psxDescargando = false;
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// Igual que psxResumenFiltroActivo(), pero leyendo los selectores propios
// del panel (cuando NO se usa el filtro activo de la pantalla).
function psxResumenManual() {
  const partes = [];
  const agenciaId = document.getElementById('psxAgencia').value;
  const estado = document.getElementById('psxEstado').value;
  const tipo = document.getElementById('psxTipo').value;
  const origen = document.getElementById('psxOrigen').value;
  const recogida = document.getElementById('psxRecogida').value;
  if (agenciaId) partes.push(agenciasCache.find(a => String(a.id) === String(agenciaId))?.nombre || 'una agencia');
  if (estado) partes.push(estado);
  if (tipo) partes.push(tipo);
  if (origen) partes.push(PSX_ETIQUETA_ORIGEN[origen] || origen);
  if (recogida) partes.push(PSX_ETIQUETA_RECOGIDA[recogida] || recogida);
  if (document.getElementById('psxSinFactura').checked) partes.push('sin factura');
  if (document.getElementById('psxSinAlbaran').checked) partes.push('sin albarán');
  if (document.getElementById('psxSinCorreo').checked) partes.push('sin enviar a agencia');
  return partes.join(', ') || 'todos los siniestros del rango de fechas';
}

psxEngancharPanel();
