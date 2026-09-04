// ---------------------------------------------------------------
  // Exportar informes (PDF / Excel)
  // ---------------------------------------------------------------
  // Modal "Exportar informe" (igual de estilo que el panel de Filtros),
  // disponible tanto en "Informe del día" como en "Historial de informes".
  // Permite exportar todo, o elegir tipo de incidencia y/o agencias.
  // El PDF y el Excel usan el mismo formato que la antigua hoja de Google
  // Sheets: cabecera con título/fecha/palets, bloques por agencia (banda
  // gris) y filas coloreadas por tipo de incidencia (LEVE sin color,
  // MODERADO en azul, GRAVE en rojo con texto blanco).
  // ---------------------------------------------------------------

  const PDF_COLOR_HEADER   = [0, 0, 0];       // cabecera de columnas
  const PDF_COLOR_GRUPO    = [217, 217, 217]; // banda del nombre de agencia
  const PDF_COLOR_MODERADO = [188, 220, 255];
  const PDF_COLOR_GRAVE    = [255, 7, 31];
  const PDF_COLUMNAS = 5; // HORA · TIENDA · TIPO · MOTIVO INCIDENCIA · OBSERVACIONES

  // Mismos colores que arriba, en ARGB (para ExcelJS).
  const XLS_COLOR_HEADER   = 'FF000000';
  const XLS_COLOR_GRUPO    = 'FFD9D9D9';
  const XLS_COLOR_MODERADO = 'FFBCDCFF';
  const XLS_COLOR_GRAVE    = 'FFFF071F';
  const XLS_COLOR_BLANCO   = 'FFFFFFFF';
  const XLS_COLOR_NEGRO    = 'FF000000';

  function pdfDisponible() {
    return typeof window.jspdf !== 'undefined' && typeof window.jspdf.jsPDF === 'function';
  }
  function excelDisponible() {
    return typeof window.ExcelJS !== 'undefined' && typeof window.ExcelJS.Workbook === 'function';
  }

  // Agrupa una lista plana de filas { agenciaId, agenciaNombre, agenciaOrden, ... }
  // por agencia, respetando el orden de aparición (o el de agenciasCache si se conoce).
  function agruparFilasPorAgenciaPdf(filas) {
    const porAgencia = new Map();
    filas.forEach(f => {
      const key = f.agenciaId ?? 'sin-agencia';
      if (!porAgencia.has(key)) {
        porAgencia.set(key, { nombre: f.agenciaNombre || 'Sin agencia', orden: f.agenciaOrden ?? 999999, filas: [] });
      }
      porAgencia.get(key).filas.push(f);
    });
    return Array.from(porAgencia.values()).sort((a, b) => a.orden - b.orden);
  }

  // ---------------------------------------------------------------
  // Construcción del PDF
  // ---------------------------------------------------------------
  function construirPdfInforme(fechaTexto, totalPalets, grupos) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const margen = 24;
    const anchoUtil = doc.internal.pageSize.getWidth() - margen * 2;

    // --- Cabecera: título / día / total de palets ---
    doc.autoTable({
      startY: margen,
      margin: { left: margen, right: margen },
      tableWidth: anchoUtil,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 11, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.75, cellPadding: 7, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: anchoUtil * 0.29, halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: anchoUtil * 0.25, halign: 'center', fontStyle: 'bold' },
        2: { halign: 'center', fontStyle: 'bold' }
      },
      body: [[
        'INFORME INCIDENCIAS TRANSPORTE',
        fechaTexto,
        totalPalets ? `TOTAL PALETS A ENTREGAR: ${totalPalets}` : 'TOTAL PALETS A ENTREGAR: —'
      ]]
    });

    // --- Cuerpo: bandas de agencia + filas de incidencias ---
    const filasCuerpo = [];
    if (!grupos.length) {
      filasCuerpo.push([{ content: 'Sin incidencias que coincidan con la selección.', colSpan: PDF_COLUMNAS, styles: { halign: 'center', textColor: [107, 118, 132] } }]);
    } else {
      grupos.forEach(g => {
        filasCuerpo.push([{
          content: `${(g.nombre || 'SIN AGENCIA').toUpperCase()} (${g.filas.length})`,
          colSpan: PDF_COLUMNAS,
          styles: { fillColor: PDF_COLOR_GRUPO, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' }
        }]);
        g.filas.forEach(f => {
          const tipo = f.tipo || null;
          const esGrave = tipo === 'GRAVE';
          const esModerado = tipo === 'MODERADO';
          const estilo = esGrave
            ? { fillColor: PDF_COLOR_GRAVE, textColor: [255, 255, 255], fontStyle: 'bold' }
            : esModerado
              ? { fillColor: PDF_COLOR_MODERADO, textColor: [0, 0, 0], fontStyle: 'bold' }
              : { textColor: [0, 0, 0] };

          filasCuerpo.push([
            { content: f.hora || '—', styles: { halign: 'center', textColor: [0, 0, 0] } },
            { content: f.tienda || '—', styles: { halign: 'center', fontStyle: 'bold', textColor: [0, 0, 0] } },
            { content: tipo ? (tipo.charAt(0) + tipo.slice(1).toLowerCase()) : 'Pendiente', styles: { halign: 'center', ...estilo } },
            { content: (f.motivo || []).join('\n'), styles: { halign: 'center', ...estilo } },
            { content: f.observaciones || '', styles: { halign: 'center', fontStyle: 'italic', textColor: [0, 0, 0] } }
          ]);
        });
      });
    }

    doc.autoTable({
      startY: doc.lastAutoTable.finalY,
      margin: { left: margen, right: margen },
      tableWidth: anchoUtil,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, lineColor: [0, 0, 0], lineWidth: 0.5, cellPadding: 5, valign: 'middle', overflow: 'linebreak' },
      head: [['HORA', 'TIENDA', 'TIPO', 'MOTIVO INCIDENCIA', 'OBSERVACIONES']],
      headStyles: { fillColor: PDF_COLOR_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 9.5 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 130 },
        2: { cellWidth: 60 },
        3: { cellWidth: 210 }
        // OBSERVACIONES (col. 4): ancho automático con el resto del sitio.
      },
      body: filasCuerpo
    });

    return doc;
  }

  // ---------------------------------------------------------------
  // Construcción del Excel (misma estructura y colores que el PDF)
  // ---------------------------------------------------------------
  async function construirExcelInforme(fechaTexto, totalPalets, grupos) {
    const workbook = new window.ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Informe', { views: [{ showGridLines: false }] });

    hoja.columns = [
      { width: 10 },  // HORA
      { width: 22 },  // TIENDA
      { width: 14 },  // TIPO
      { width: 34 },  // MOTIVO INCIDENCIA
      { width: 55 }   // OBSERVACIONES
    ];

    const bordeFino = { style: 'thin', color: { argb: 'FF000000' } };
    const bordeCompleto = { top: bordeFino, left: bordeFino, bottom: bordeFino, right: bordeFino };

    function celda(fila, colIdx, valor, opts = {}) {
      const c = fila.getCell(colIdx);
      c.value = valor;
      c.font = { bold: !!opts.bold, italic: !!opts.italic, color: { argb: opts.color || XLS_COLOR_NEGRO }, size: opts.size || 10.5 };
      c.alignment = { horizontal: opts.halign || 'center', vertical: 'middle', wrapText: opts.wrap !== false };
      c.border = bordeCompleto;
      if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
      return c;
    }

    // --- Cabecera: título / día / total de palets ---
    const filaTitulo = hoja.addRow([]);
    filaTitulo.height = 22;
    hoja.mergeCells(filaTitulo.number, 1, filaTitulo.number, 2);
    celda(filaTitulo, 1, 'INFORME INCIDENCIAS TRANSPORTE', { bold: true, halign: 'left', size: 12 });
    celda(filaTitulo, 3, fechaTexto, { bold: true, size: 12 });
    hoja.mergeCells(filaTitulo.number, 4, filaTitulo.number, 5);
    celda(filaTitulo, 4, totalPalets ? `TOTAL PALETS A ENTREGAR: ${totalPalets}` : 'TOTAL PALETS A ENTREGAR: —', { bold: true, size: 12 });

    // --- Cabecera de columnas ---
    const filaCabecera = hoja.addRow(['HORA', 'TIENDA', 'TIPO', 'MOTIVO INCIDENCIA', 'OBSERVACIONES']);
    filaCabecera.height = 20;
    for (let col = 1; col <= 5; col++) {
      celda(filaCabecera, col, filaCabecera.getCell(col).value, { bold: true, color: XLS_COLOR_BLANCO, fill: XLS_COLOR_HEADER });
    }

    // --- Cuerpo: bandas de agencia + filas de incidencias ---
    if (!grupos.length) {
      const filaVacia = hoja.addRow([]);
      hoja.mergeCells(filaVacia.number, 1, filaVacia.number, 5);
      celda(filaVacia, 1, 'Sin incidencias que coincidan con la selección.', { color: 'FF6B7684' });
    } else {
      grupos.forEach(g => {
        const filaGrupo = hoja.addRow([]);
        hoja.mergeCells(filaGrupo.number, 1, filaGrupo.number, 5);
        celda(filaGrupo, 1, `${(g.nombre || 'SIN AGENCIA').toUpperCase()} (${g.filas.length})`, { bold: true, fill: XLS_COLOR_GRUPO });

        g.filas.forEach(f => {
          const tipo = f.tipo || null;
          const esGrave = tipo === 'GRAVE';
          const esModerado = tipo === 'MODERADO';
          const fillTipo = esGrave ? XLS_COLOR_GRAVE : esModerado ? XLS_COLOR_MODERADO : null;
          const colorTipo = esGrave ? XLS_COLOR_BLANCO : XLS_COLOR_NEGRO;
          const negritaTipo = esGrave || esModerado;

          const motivoTexto = (f.motivo || []).join('\n');
          const fila = hoja.addRow([]);
          if ((f.motivo || []).length > 1) fila.height = 14 * f.motivo.length;

          celda(fila, 1, f.hora || '—');
          celda(fila, 2, f.tienda || '—', { bold: true });
          celda(fila, 3, tipo ? (tipo.charAt(0) + tipo.slice(1).toLowerCase()) : 'Pendiente', { bold: negritaTipo, color: colorTipo, fill: fillTipo });
          celda(fila, 4, motivoTexto, { bold: negritaTipo, color: colorTipo, fill: fillTipo, halign: 'center' });
          celda(fila, 5, f.observaciones || '', { italic: true });
        });
      });
    }

    return workbook;
  }

  function descargarBlob(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------------------------------------------------------
  // Recopilación de datos (sin filtrar) por contexto
  // ---------------------------------------------------------------
  function recopilarFilasHoy() {
    return incidenciasHoyCache
      .filter(i => i.marcada)
      .map(i => {
        const tienda = tiendasCache.find(t => t.id === i.tienda_id);
        const agencia = tienda ? agenciasCache.find(a => a.id === tienda.agencia_id) : null;
        return {
          hora: tienda?.hora_prevista ? tienda.hora_prevista.slice(0, 5) : '',
          tienda: tienda?.nombre || '—',
          tipo: i.tipo,
          motivo: i.motivo,
          observaciones: i.observaciones,
          agenciaId: agencia?.id,
          agenciaNombre: agencia?.nombre,
          agenciaOrden: agencia ? agenciasCache.findIndex(a => a.id === agencia.id) : 999999
        };
      });
  }

  function recopilarFilasHistorial() {
    return (historialIncidenciasActual || []).map(i => ({
      hora: i.tienda_hora_prevista ? i.tienda_hora_prevista.slice(0, 5) : '',
      tienda: i.tienda_nombre || '—',
      tipo: i.tipo,
      motivo: i.motivo,
      observaciones: i.observaciones,
      agenciaId: i.agencia_id,
      agenciaNombre: i.agencia_nombre,
      agenciaOrden: i.agencia_id != null ? agenciasCache.findIndex(a => a.id === i.agencia_id) : 999999
    }));
  }

  function filtrarFilasExport(filas, tiposSet, agenciasSet) {
    if (!tiposSet.size && !agenciasSet.size) return filas;
    return filas.filter(f => {
      const tipoEfectivo = f.tipo || 'PENDIENTE';
      if (tiposSet.size && !tiposSet.has(tipoEfectivo)) return false;
      if (agenciasSet.size && !agenciasSet.has(f.agenciaId)) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------
  // Modal "Exportar informe" — estado y wiring, uno por contexto
  // ('hoy' = Informe del día, 'historial' = Historial de informes)
  // ---------------------------------------------------------------
  const exportarEstado = {
    hoy: { formato: 'pdf', tipos: new Set(), agencias: new Set() },
    historial: { formato: 'pdf', tipos: new Set(), agencias: new Set() }
  };

  function sufijoContexto(contexto) {
    return contexto === 'hoy' ? 'Hoy' : 'Historial';
  }

  function elsExportar(contexto) {
    const suf = sufijoContexto(contexto);
    return {
      btnAbrir: document.getElementById(contexto === 'hoy' ? 'btnExportarInforme' : 'btnExportarHistorial'),
      wrap: document.getElementById('exportarWrap' + suf),
      panel: document.getElementById('exportarPanel' + suf),
      btnCerrar: document.getElementById('btnCerrarExportar' + suf),
      btnLimpiar: document.getElementById('btnLimpiarExportar' + suf),
      btnCompleto: document.getElementById('btnExportarCompleto' + suf),
      btnSeleccion: document.getElementById('btnExportarSeleccion' + suf),
      formatoWrap: document.getElementById('exportarFormato' + suf),
      tiposWrap: document.getElementById('exportarTipos' + suf),
      agenciaSelect: document.getElementById('exportarAgenciaSelect' + suf),
      agenciasLista: document.getElementById('exportarAgenciasLista' + suf)
    };
  }

  function cerrarTodosLosExportarPaneles(exceptoContexto) {
    ['hoy', 'historial'].forEach(ctx => {
      if (ctx === exceptoContexto) return;
      const els = elsExportar(ctx);
      if (!els.panel) return;
      els.panel.classList.remove('show');
      els.btnAbrir?.classList.remove('open');
      els.agenciaSelect?.classList.remove('open');
    });
  }

  function posicionarExportarPanel(wrap, panel) {
    const wrapRect = wrap.getBoundingClientRect();
    const margen = 12;
    const ancho = Math.min(560, window.innerWidth - margen * 2);
    panel.style.width = ancho + 'px';
    let left = 0;
    const desbordeDerecha = (wrapRect.left + left + ancho) - (window.innerWidth - margen);
    if (desbordeDerecha > 0) left -= desbordeDerecha;
    if (wrapRect.left + left < margen) left = margen - wrapRect.left;
    panel.style.left = left + 'px';
  }

  function actualizarValorAgenciaExport(contexto) {
    const els = elsExportar(contexto);
    const set = exportarEstado[contexto].agencias;
    const valorEl = els.agenciaSelect.querySelector('.filtro-select-valor');
    if (set.size === 0) {
      valorEl.textContent = 'Todas';
      els.agenciaSelect.classList.remove('activo');
    } else if (set.size === 1) {
      const ag = agenciasCache.find(a => a.id === Array.from(set)[0]);
      valorEl.textContent = ag ? ag.nombre : '1 seleccionada';
      els.agenciaSelect.classList.add('activo');
    } else {
      valorEl.textContent = `${set.size} seleccionadas`;
      els.agenciaSelect.classList.add('activo');
    }
  }

  function construirListaAgenciasExport(contexto) {
    const els = elsExportar(contexto);
    const set = exportarEstado[contexto].agencias;
    els.agenciasLista.innerHTML = agenciasCache.map(ag => `
      <label class="filtro-check">
        <input type="checkbox" value="${ag.id}" ${set.has(ag.id) ? 'checked' : ''}>
        <span>${escapeHtml(ag.nombre)}</span>
      </label>`).join('');
  }

  function construirTiposExport(contexto) {
    const els = elsExportar(contexto);
    const set = exportarEstado[contexto].tipos;
    els.tiposWrap.innerHTML = TIPOS_FILTRO.map(t => `
      <label class="filtro-check">
        <input type="checkbox" value="${t.v}" ${set.has(t.v) ? 'checked' : ''}>
        <span class="pill ${t.v.toLowerCase()}">${t.label}</span>
      </label>`).join('');
  }

  function limpiarSeleccionExport(contexto) {
    exportarEstado[contexto].tipos.clear();
    exportarEstado[contexto].agencias.clear();
    construirTiposExport(contexto);
    construirListaAgenciasExport(contexto);
    actualizarValorAgenciaExport(contexto);
  }

  async function abrirExportarPanel(contexto) {
    const els = elsExportar(contexto);
    if (!els.panel) return;
    cerrarTodosLosExportarPaneles(contexto);

    await ensureAgenciasYTiendasCargadas();
    construirTiposExport(contexto);
    construirListaAgenciasExport(contexto);
    actualizarValorAgenciaExport(contexto);

    posicionarExportarPanel(els.wrap, els.panel);
    els.panel.classList.add('show');
    els.btnAbrir.classList.add('open');
  }

  function cerrarExportarPanel(contexto) {
    const els = elsExportar(contexto);
    if (!els.panel) return;
    els.panel.classList.remove('show');
    els.btnAbrir?.classList.remove('open');
    els.agenciaSelect?.classList.remove('open');
  }

  async function ejecutarExportacion(contexto, { completo }) {
    const estado = exportarEstado[contexto];
    if (completo) {
      exportarEstado[contexto].tipos.clear();
      exportarEstado[contexto].agencias.clear();
    }

    const formato = estado.formato;
    if (formato === 'pdf' && !pdfDisponible()) {
      await modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
      return;
    }
    if (formato === 'excel' && !excelDisponible()) {
      await modalAlert('No se pudo cargar el generador de Excel. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'Excel no disponible' });
      return;
    }

    let filasBrutas, fechaTexto, totalPalets, nombreBase;
    if (contexto === 'hoy') {
      if (!informeHoyCache) {
        await modalAlert('Aún no hay informe abierto para hoy.', { titulo: 'Sin informe' });
        return;
      }
      filasBrutas = recopilarFilasHoy();
      fechaTexto = `${dias[hoy.getDay()]}, ${formatearFechaCorta(hoy)}`;
      totalPalets = informeHoyCache.total_palets;
      nombreBase = `informe-incidencias-${fechaHoyISO}`;
    } else {
      if (!historialInformeActual) {
        await modalAlert('Consulta primero un informe para poder exportarlo.', { titulo: 'Nada que exportar' });
        return;
      }
      filasBrutas = recopilarFilasHistorial();
      const fechaInforme = new Date(historialInformeActual.fecha + 'T00:00:00');
      fechaTexto = `${dias[fechaInforme.getDay()]}, ${formatearFechaCorta(fechaInforme)}`;
      totalPalets = historialInformeActual.total_palets;
      nombreBase = `informe-incidencias-${historialInformeActual.fecha}`;
    }

    if (!filasBrutas.length) {
      await modalAlert('No hay incidencias registradas en este informe para exportar.', { titulo: 'Nada que exportar' });
      return;
    }

    const filas = filtrarFilasExport(filasBrutas, estado.tipos, estado.agencias);
    if (!filas.length) {
      await modalAlert('No hay incidencias que coincidan con la selección de tipo/agencia.', { titulo: 'Nada que exportar' });
      return;
    }

    const grupos = agruparFilasPorAgenciaPdf(filas);

    if (formato === 'pdf') {
      const doc = construirPdfInforme(fechaTexto, totalPalets, grupos);
      doc.save(`${nombreBase}.pdf`);
    } else {
      const workbook = await construirExcelInforme(fechaTexto, totalPalets, grupos);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      descargarBlob(blob, `${nombreBase}.xlsx`);
    }

    cerrarExportarPanel(contexto);
  }

  function initExportador(contexto) {
    const els = elsExportar(contexto);
    if (!els.btnAbrir || !els.panel) return; // el bloque de "historial" puede no existir en alguna vista

    els.btnAbrir.addEventListener('click', (e) => {
      e.stopPropagation();
      if (els.panel.classList.contains('show')) cerrarExportarPanel(contexto);
      else abrirExportarPanel(contexto);
    });

    els.panel.addEventListener('click', (e) => {
      e.stopPropagation();
      // Cualquier clic dentro del panel que no sea sobre el desplegable de
      // agencias lo cierra, para que no se quede abierto tapando el resto
      // de opciones o los botones de exportar.
      if (!els.agenciaSelect.contains(e.target)) els.agenciaSelect.classList.remove('open');
    });
    els.btnCerrar.addEventListener('click', () => cerrarExportarPanel(contexto));
    els.btnLimpiar.addEventListener('click', () => limpiarSeleccionExport(contexto));

    // Formato (PDF / Excel)
    els.formatoWrap.querySelectorAll('.export-formato-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        exportarEstado[contexto].formato = btn.dataset.formato;
        els.formatoWrap.querySelectorAll('.export-formato-btn').forEach(b => b.classList.toggle('activo', b === btn));
      });
    });

    // Tipo de incidencia (checkboxes)
    els.tiposWrap.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"]')) return;
      if (cb.checked) exportarEstado[contexto].tipos.add(cb.value);
      else exportarEstado[contexto].tipos.delete(cb.value);
    });

    // Agencias (desplegable multi-selección propio, independiente del de Filtros)
    const btnSelectAgencia = els.agenciaSelect.querySelector('.filtro-select-btn');
    btnSelectAgencia.addEventListener('click', (e) => {
      e.stopPropagation();
      els.agenciaSelect.classList.toggle('open');
    });
    els.agenciaSelect.addEventListener('click', (e) => e.stopPropagation());
    const buscadorAgencia = els.agenciaSelect.querySelector('.filtro-select-search input');
    buscadorAgencia.addEventListener('input', () => {
      const q = buscadorAgencia.value.trim().toUpperCase();
      els.agenciasLista.querySelectorAll('.filtro-check').forEach(row => {
        row.classList.toggle('oculto', q && !row.textContent.trim().toUpperCase().includes(q));
      });
    });
    els.agenciasLista.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"]')) return;
      const id = Number(cb.value);
      if (cb.checked) exportarEstado[contexto].agencias.add(id);
      else exportarEstado[contexto].agencias.delete(id);
      actualizarValorAgenciaExport(contexto);
    });

    els.btnCompleto.addEventListener('click', () => ejecutarExportacion(contexto, { completo: true }));
    els.btnSeleccion.addEventListener('click', () => ejecutarExportacion(contexto, { completo: false }));
  }

  initExportador('hoy');
  initExportador('historial');

  document.addEventListener('click', () => {
    cerrarExportarPanel('hoy');
    cerrarExportarPanel('historial');
  });

  window.addEventListener('resize', () => {
    ['hoy', 'historial'].forEach(ctx => {
      const els = elsExportar(ctx);
      if (els.panel && els.panel.classList.contains('show')) posicionarExportarPanel(els.wrap, els.panel);
    });
  });

  // ---------------------------------------------------------------
