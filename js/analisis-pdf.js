// ---------------------------------------------------------------
// Exportar a PDF · Ranking de incidencias
// ---------------------------------------------------------------
// Genera un PDF "ejecutivo" con el resumen completo del ranking tal y
// como se está viendo en pantalla: mismo periodo, mismos filtros, misma
// vista (tiendas/agencias) y mismo orden — pensado para llevar a una
// reunión (KPIs + Top N + donut por agencia + tabla completa de
// desglose). Usa jsPDF + autoTable (ya cargados para el resto de PDFs
// de la app) y reutiliza los datos/funciones de analisis.js, por lo que
// este script debe cargarse después de él.
// ---------------------------------------------------------------

const RPDF_COLOR_INK      = [18, 24, 31];
const RPDF_COLOR_INK_SOFT = [91, 101, 114];
const RPDF_COLOR_BORDE    = [227, 231, 236];
const RPDF_COLOR_MUTED    = [244, 246, 248];
const RPDF_COLOR_ACCENT   = [255, 122, 26];
const RPDF_COLOR_GRAVE    = [209, 43, 13];
const RPDF_COLOR_HEADER   = [18, 24, 31];

function rpdfDisponible() {
  return typeof pdfDisponible === 'function' && pdfDisponible();
}

// Texto de una sola línea, recortado con "…" si no cabe en maxWidth (con
// el font/size ya establecidos en el doc antes de llamar a esta función).
function rpdfTruncar(doc, texto, maxWidth) {
  const t = String(texto == null ? '' : texto);
  if (doc.getTextWidth(t) <= maxWidth) return t;
  let recorte = t;
  while (recorte.length > 1 && doc.getTextWidth(recorte + '…') > maxWidth) {
    recorte = recorte.slice(0, -1);
  }
  return recorte + '…';
}

// Convierte el SVG del donut (misma función que usa la pantalla) en un
// PNG en memoria, a suficiente resolución para imprimir nítido.
function rpdfDonutAPng(svgMarkup, anchoViewBox, altoViewBox, factor = 3) {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = anchoViewBox * factor;
        canvas.height = altoViewBox * factor;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    } catch (e) {
      reject(e);
    }
  });
}

// Mismas filas que pinta la tabla en pantalla: agregadas por la entidad
// activa (tiendas/agencias), con el filtro "solo con siniestros" y el
// orden actuales ya aplicados.
function rpdfFilasActuales() {
  let filas = agregarAnalisis(analisisEntidad);
  if (filtrosAnalisis.soloConSiniestros) filas = filas.filter(f => f.siniestros > 0);
  const metrica = analisisOrden === 'siniestros' ? 'siniestros' : 'incidencias';
  filas.sort((a, b) => b[metrica] - a[metrica] || b.incidencias - a.incidencias || a.nombre.localeCompare(b.nombre));
  return filas;
}

// Texto (singular/plural) de cada motivo cerrado del catálogo, para poder
// escribir "3 retrasos importantes" en vez de solo agrupar por gravedad.
const RPDF_MOTIVO_TEXTO = {
  'RETRASO PDTE CONFIRMAR':       { s: 'retraso pdte. confirmar',      p: 'retrasos pdte. confirmar' },
  'REVISANDO POSIBLE INCIDENCIA': { s: 'revisando posible incidencia', p: 'revisando posible incidencia' },
  'ROTURA SIN INCIDENCIA':        { s: 'rotura sin incidencia',        p: 'roturas sin incidencia' },
  'ROTURA ALMACEN':               { s: 'rotura de almacén',            p: 'roturas de almacén' },
  'RETRASO LEVE':                 { s: 'retraso leve',                 p: 'retrasos leves' },
  'PALETS NO RETIRADOS':          { s: 'palet no retirado',            p: 'palets no retirados' },
  'DESCARGA MANUAL':              { s: 'descarga manual',              p: 'descargas manuales' },
  'ROTURA CONFIRMADA':            { s: 'rotura confirmada',            p: 'roturas confirmadas' },
  'PALETS SIN VIGILANCIA':        { s: 'palet sin vigilancia',         p: 'palets sin vigilancia' },
  'MEZCLAN FECHAS':               { s: 'mezcla de fechas',             p: 'mezclas de fechas' },
  'RETRASO IMPORTANTE':           { s: 'retraso importante',           p: 'retrasos importantes' },
  'ADELANTAN ENTREGA':            { s: 'entrega adelantada',           p: 'entregas adelantadas' },
  'INCOMPLETO':                   { s: 'incompleto',                   p: 'incompletos' },
  'FALTAS':                       { s: 'falta',                        p: 'faltas' },
  'NO ENTREGAN':                  { s: 'no entrega',                   p: 'no entregas' },
  'PALET PERDIDO':                { s: 'palet perdido',                p: 'palets perdidos' },
  'PALET MANIPULADO':             { s: 'palet manipulado',             p: 'palets manipulados' }
};

function rpdfTextoMotivo(motivo, cantidad) {
  const par = RPDF_MOTIVO_TEXTO[motivo];
  if (!par) return motivo.charAt(0) + motivo.slice(1).toLowerCase();
  return cantidad === 1 ? par.s : par.p;
}

// De los motivos marcados en una incidencia (puede haber varios a la
// vez), se queda con UNO solo: el que determina su gravedad real, con
// el mismo criterio que ya usa calcularTipo (nivelDeMotivo, según la
// gravedad configurada en Configuración → Gravedad de motivos) para
// decidir si la incidencia es grave/moderada/leve. Así, en el desglose
// por motivo, cada incidencia cuenta una sola vez — la suma siempre
// coincide con "Incidencias", igual que ya pasa con el desglose por
// gravedad.
function rpdfMotivoPrincipal(incidencia) {
  const submotivos = window.SUBMOTIVOS_POR_MOTIVO ? Object.values(window.SUBMOTIVOS_POR_MOTIVO).flat() : [];
  const principales = (incidencia.motivo || []).filter(m => !submotivos.includes(m));
  if (!principales.length) return null;
  if (principales.length === 1) return principales[0];
  const nivel = m => (typeof nivelDeMotivo === 'function' ? nivelDeMotivo(m) : null);
  return principales.find(m => nivel(m) === 'grave')
    || principales.find(m => nivel(m) === 'moderado')
    || principales.find(m => nivel(m) === 'leve')
    || principales[0];
}

// Cuenta, por tienda o agencia (según la vista activa), el motivo
// principal de cada incidencia ya filtrada — igual que se hace con
// incidencias/siniestros en agregarAnalisis, pero por motivo.
function rpdfDesgloseMotivosPorClave() {
  const mapa = new Map();
  incidenciasFiltradas().forEach(i => {
    const clave = analisisEntidad === 'tiendas' ? i.tienda_id : i.agencia_id;
    if (clave == null) return;
    if (!mapa.has(clave)) mapa.set(clave, new Map());
    const porMotivo = mapa.get(clave);
    const motivo = rpdfMotivoPrincipal(i) || '__SIN_MOTIVO__';
    porMotivo.set(motivo, (porMotivo.get(motivo) || 0) + 1);
  });
  return mapa;
}

function rpdfResumenMotivos(mapaMotivo) {
  if (!mapaMotivo || !mapaMotivo.size) return '—';
  return Array.from(mapaMotivo.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([motivo, cantidad]) => motivo === '__SIN_MOTIVO__'
      ? `${cantidad} sin motivo registrado`
      : `${cantidad} ${rpdfTextoMotivo(motivo, cantidad)}`)
    .join(', ');
}

function rpdfResumenSiniestros(f) {
  const partes = [];
  if (f.sinRotura) partes.push(`${f.sinRotura} rotura${f.sinRotura === 1 ? '' : 's'}`);
  if (f.sinFalta) partes.push(`${f.sinFalta} falta${f.sinFalta === 1 ? '' : 's'}`);
  if (f.sinMixto) partes.push(`${f.sinMixto} mixto${f.sinMixto === 1 ? '' : 's'}`);
  return partes.length ? partes.join(', ') : '—';
}

// Línea "Vista: … · Orden: … · <filtros aplicados>", igual que lo que
// hay activo en el panel "Filtrar ranking" en este momento.
function rpdfResumenContexto() {
  const entidadLabel = analisisEntidad === 'tiendas' ? 'Tiendas' : 'Agencias';
  const ordenLabel = analisisOrden === 'siniestros' ? 'Siniestros' : 'Incidencias';
  const partesFiltro = [];

  if (filtrosAnalisis.agencias.size) {
    const nombres = agenciasCache.filter(a => filtrosAnalisis.agencias.has(a.id)).map(a => a.nombre);
    if (nombres.length) partesFiltro.push(`Agencia: ${nombres.join(', ')}`);
  }
  if (filtrosAnalisis.tiendas.size) {
    const nombres = tiendasCache.filter(t => filtrosAnalisis.tiendas.has(t.id)).map(t => t.nombre);
    if (nombres.length) partesFiltro.push(`Tienda: ${nombres.join(', ')}`);
  }
  if (filtrosAnalisis.tipos.size) {
    partesFiltro.push(`Tipo de incidencia: ${Array.from(filtrosAnalisis.tipos).join(', ')}`);
  }
  if (filtrosAnalisis.motivos.size) {
    partesFiltro.push(`Motivo: ${Array.from(filtrosAnalisis.motivos).join(', ')}`);
  }
  if (filtrosAnalisis.siniestroTipos.size) {
    partesFiltro.push(`Tipo de siniestro: ${Array.from(filtrosAnalisis.siniestroTipos).join(', ')}`);
  }
  if (filtrosAnalisis.soloConSiniestros) partesFiltro.push('Solo con siniestros');

  const filtrosTexto = partesFiltro.length ? partesFiltro.join(' · ') : 'Sin filtros adicionales';
  return `Vista: ${entidadLabel} · Orden: por ${ordenLabel} · ${filtrosTexto}`;
}

// Dibuja las 4 tarjetas de KPI (mismos datos que los ".kpi" de la
// pantalla) y devuelve el Y donde termina.
function rpdfDibujarKpis(doc, x, y, width, kpis) {
  const alto = 46, gap = 10;
  const boxW = (width - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((k, i) => {
    const bx = x + i * (boxW + gap);
    doc.setDrawColor(...RPDF_COLOR_BORDE);
    doc.setLineWidth(0.75);
    doc.roundedRect(bx, y, boxW, alto, 5, 5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...(k.color || RPDF_COLOR_INK));
    doc.text(String(k.valor), bx + 12, y + 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...RPDF_COLOR_INK_SOFT);
    doc.text(k.label, bx + 12, y + 38);
  });
  return y + alto;
}

// Dibuja el bloque de barras horizontales (mismo Top N que "TOP N
// TIENDAS/AGENCIAS POR …" en pantalla) y devuelve el Y donde termina.
function rpdfDibujarBarras(doc, x, y, width, titulo, filas, metrica) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...RPDF_COLOR_INK_SOFT);
  doc.text(titulo.toUpperCase(), x, y);

  const inicioFilas = y + 16;
  const rowH = 15.5;
  const valW = 24;
  const labelW = Math.min(150, width * 0.36);
  const trackX = x + labelW + 8;
  const trackW = width - labelW - 8 - valW - 6;
  const maxVal = Math.max(1, ...filas.map(f => f[metrica]));

  filas.forEach((f, i) => {
    const ry = inicioFilas + i * rowH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...RPDF_COLOR_INK);
    const etiqueta = rpdfTruncar(doc, `${i + 1}. ${f.nombre}`, labelW);
    doc.text(etiqueta, x, ry + 5.5);

    doc.setFillColor(...RPDF_COLOR_MUTED);
    doc.roundedRect(trackX, ry, trackW, 7, 3.5, 3.5, 'F');
    const frac = f[metrica] / maxVal;
    const anchoBarra = Math.max(frac > 0 ? 7 : 0, trackW * frac);
    if (anchoBarra > 0) {
      doc.setFillColor(...RPDF_COLOR_ACCENT);
      doc.roundedRect(trackX, ry, anchoBarra, 7, 3.5, 3.5, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...RPDF_COLOR_INK);
    doc.text(String(f[metrica]), x + width, ry + 5.5, { align: 'right' });
  });

  return inicioFilas + filas.length * rowH;
}

// Dibuja la leyenda del donut (nombre + % + nº) y devuelve el Y final.
function rpdfDibujarLeyendaDonut(doc, x, y, width, arcos) {
  const rowH = 13.5;
  arcos.forEach((s, i) => {
    const ry = y + i * rowH;
    const rgb = rpdfHexARgb(s.color.top);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(x + 3, ry + 2.2, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...RPDF_COLOR_INK);
    const anchoNombre = width - 70;
    doc.text(rpdfTruncar(doc, s.nombre, anchoNombre), x + 10, ry + 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...RPDF_COLOR_INK_SOFT);
    doc.text(`${s.pct.toFixed(0)}%`, x + width - 26, ry + 5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RPDF_COLOR_INK);
    doc.text(String(s.valor), x + width, ry + 5, { align: 'right' });
  });
  return y + arcos.length * rowH;
}

function rpdfHexARgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF];
}

// Añade, en cada página ya dibujada, el pie "GIDT · Ranking de
// incidencias" a la izquierda y "Página X de Y" centrado.
function rpdfAnadirPiePagina(doc, margen, generadoTexto) {
  const totalPaginas = doc.internal.getNumberOfPages();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...RPDF_COLOR_INK_SOFT);
    doc.text('GIDT · Ranking de incidencias', margen, altoPagina - margen / 2 - 2);
    doc.text(`Página ${pagina} de ${totalPaginas}`, anchoPagina / 2, altoPagina - margen / 2 - 2, { align: 'center' });
    doc.text(generadoTexto, anchoPagina - margen, altoPagina - margen / 2 - 2, { align: 'right' });
  }
}

async function exportarRankingPdf() {
  if (!rpdfDisponible()) {
    await modalAlert('No se ha podido cargar el generador de PDF. Recarga la página e inténtalo de nuevo.', { titulo: 'Exportar a PDF' });
    return;
  }
  if (!analisisDatos) {
    await modalAlert('Elige un periodo y pulsa "Consultar" antes de exportar.', { titulo: 'Exportar a PDF' });
    return;
  }

  mostrarCargandoGlobal();
  try {
    const desde = analisisDesdeInput.value || null;
    const hasta = analisisHastaInput.value || fechaHoyISO;
    const periodoTexto = desde
      ? `${formatearFechaCorta(new Date(desde + 'T00:00:00'))} – ${formatearFechaCorta(new Date(hasta + 'T00:00:00'))}`
      : `Todo el histórico (hasta ${formatearFechaCorta(new Date(hasta + 'T00:00:00'))})`;
    const generadoTexto = `Generado el ${formatearFechaHoraCorta(new Date())}`;

    const filas = rpdfFilasActuales();
    const metrica = analisisOrden === 'siniestros' ? 'siniestros' : 'incidencias';
    const top = filas.slice(0, 15);
    const entidadLabel = analisisEntidad === 'tiendas' ? 'tiendas' : 'agencias';
    const metricaLabel = metrica === 'siniestros' ? 'siniestros' : 'incidencias';

    const incsFiltradas = incidenciasFiltradas();
    const sinsFiltrados = siniestrosFiltrados(new Set(incsFiltradas.map(i => i.id)));
    const kpis = [
      { label: 'Incidencias en el periodo', valor: incsFiltradas.length },
      { label: 'Incidencias graves', valor: incsFiltradas.filter(i => i.tipo === 'GRAVE').length, color: RPDF_COLOR_GRAVE },
      { label: 'Siniestros generados', valor: sinsFiltrados.length },
      { label: 'Siniestros pendientes', valor: sinsFiltrados.filter(s => s.estado === 'PENDIENTE').length }
    ];

    const segmentosDonut = construirSegmentosDonutAgencias();
    const totalDonut = segmentosDonut.reduce((s, x) => s + x.valor, 0);
    const arcosDonut = totalDonut ? calcularArcosDonut(segmentosDonut) : [];
    let donutPng = null;
    if (arcosDonut.length) {
      const svgDonut = renderDonutSvgAgencias(arcosDonut);
      donutPng = await rpdfDonutAPng(svgDonut, DONUT_VIEWBOX.w, DONUT_VIEWBOX.h + DONUT_VIEWBOX.depth);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const margen = 28;
    const anchoUtil = doc.internal.pageSize.getWidth() - margen * 2;

    // --- Cabecera ---
    doc.autoTable({
      startY: margen,
      margin: { left: margen, right: margen },
      tableWidth: anchoUtil,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 11, textColor: [255, 255, 255], lineColor: RPDF_COLOR_HEADER, lineWidth: 0.75, cellPadding: 8, valign: 'middle', fillColor: RPDF_COLOR_HEADER },
      columnStyles: {
        0: { cellWidth: anchoUtil * 0.4, halign: 'left', fontStyle: 'bold', fontSize: 13 },
        1: { halign: 'center', fontStyle: 'bold' },
        2: { halign: 'right', fontStyle: 'normal', fontSize: 9 }
      },
      body: [['RANKING DE INCIDENCIAS', `Periodo: ${periodoTexto}`, generadoTexto]]
    });

    let y = doc.lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...RPDF_COLOR_INK_SOFT);
    doc.text(rpdfTruncar(doc, rpdfResumenContexto(), anchoUtil), margen, y);

    // --- KPIs ---
    y += 14;
    y = rpdfDibujarKpis(doc, margen, y, anchoUtil, kpis);

    // --- Top N (barras) + donut por agencia, lado a lado ---
    y += 24;
    const colGap = 20;
    const colIzqW = anchoUtil * 0.6;
    const colDerX = margen + colIzqW + colGap;
    const colDerW = anchoUtil - colIzqW - colGap;

    const finBarras = top.length
      ? rpdfDibujarBarras(doc, margen, y, colIzqW, `Top ${top.length} ${entidadLabel} por ${metricaLabel}`, top, metrica)
      : y;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...RPDF_COLOR_INK_SOFT);
    doc.text('INCIDENCIAS POR AGENCIA', colDerX, y);
    let yDer = y + 12;
    if (donutPng) {
      const imgW = Math.min(150, colDerW * 0.62);
      const imgH = imgW * ((DONUT_VIEWBOX.h + DONUT_VIEWBOX.depth) / DONUT_VIEWBOX.w);
      const imgX = colDerX + (colDerW - imgW) / 2;
      doc.addImage(donutPng, 'PNG', imgX, yDer, imgW, imgH);
      yDer += imgH + 10;
      yDer = rpdfDibujarLeyendaDonut(doc, colDerX, yDer, colDerW, arcosDonut);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...RPDF_COLOR_INK_SOFT);
      doc.text('Sin datos de agencia para este periodo.', colDerX, yDer + 10);
    }

    // --- Tabla completa de desglose (en página aparte, como anexo) ---
    doc.addPage();
    const cabeceraCol = analisisEntidad === 'tiendas' ? 'Tienda' : 'Agencia';
    const desgloseMotivos = rpdfDesgloseMotivosPorClave();
    const cuerpoTabla = filas.map((f, idx) => [
      String(idx + 1),
      f.agenciaNombre
        ? `${f.nombre}\n${f.variasAgencias ? 'Varias agencias en el periodo' : f.agenciaNombre}`
        : f.nombre,
      String(f.incidencias),
      rpdfResumenMotivos(desgloseMotivos.get(f.clave)),
      String(f.siniestros),
      rpdfResumenSiniestros(f)
    ]);

    doc.autoTable({
      startY: margen,
      margin: { left: margen, right: margen, top: margen, bottom: 40 },
      tableWidth: anchoUtil,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, lineColor: RPDF_COLOR_BORDE, lineWidth: 0.5, cellPadding: 6, valign: 'middle', textColor: RPDF_COLOR_INK },
      head: [['#', cabeceraCol, 'Incid.', 'Motivos de la incidencia', 'Sin.', 'Tipo siniestro']],
      headStyles: { fillColor: RPDF_COLOR_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 150, fontStyle: 'bold' },
        2: { cellWidth: 48, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: anchoUtil - (26 + 150 + 48 + 42 + 90) },
        4: { cellWidth: 42, halign: 'center', fontStyle: 'bold' },
        // Tipo de siniestro: solo puede ser "rotura", "falta" o "mixto"
        // (o combinaciones cortas de esos tres), no necesita más ancho.
        5: { cellWidth: 90 }
      },
      body: cuerpoTabla.length ? cuerpoTabla : [[{ content: 'Sin resultados para este periodo y filtros.', colSpan: 6, styles: { halign: 'center', textColor: RPDF_COLOR_INK_SOFT } }]]
    });

    rpdfAnadirPiePagina(doc, margen, generadoTexto);

    const nombreArchivo = `Ranking_incidencias_${desde || 'inicio'}_${hasta}.pdf`;
    doc.save(nombreArchivo);
  } catch (err) {
    console.error('Error exportando el ranking a PDF:', err);
    await modalAlert('No se ha podido generar el PDF. Inténtalo de nuevo.', { titulo: 'Exportar a PDF' });
  } finally {
    ocultarCargandoGlobal();
  }
}

document.getElementById('btnAnalisisExportarPdf').addEventListener('click', exportarRankingPdf);
