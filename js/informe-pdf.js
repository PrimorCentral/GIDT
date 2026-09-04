// ---------------------------------------------------------------
  // Exportar informes a PDF
  // ---------------------------------------------------------------
  // Genera un PDF con el mismo formato que la antigua hoja de Google
  // Sheets: cabecera con título/fecha/palets, bloques por agencia (banda
  // gris) y filas coloreadas por tipo de incidencia (LEVE sin color,
  // MODERADO en azul, GRAVE en rojo con texto blanco).
  // ---------------------------------------------------------------

  const PDF_COLOR_HEADER   = [0, 0, 0];       // cabecera de columnas
  const PDF_COLOR_GRUPO    = [217, 217, 217]; // banda del nombre de agencia
  const PDF_COLOR_MODERADO = [188, 220, 255];
  const PDF_COLOR_GRAVE    = [255, 7, 31];
  const PDF_COLUMNAS = 5; // HORA · TIENDA · TIPO · MOTIVO INCIDENCIA · OBSERVACIONES

  function pdfDisponible() {
    return typeof window.jspdf !== 'undefined' && typeof window.jspdf.jsPDF === 'function';
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

  // Construye el documento jsPDF (sin guardarlo) a partir de la fecha/palets
  // del informe y los grupos por agencia ya calculados.
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
      filasCuerpo.push([{ content: 'Sin incidencias registradas.', colSpan: PDF_COLUMNAS, styles: { halign: 'center', textColor: [107, 118, 132] } }]);
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
  // Informe del día (vista "Informe del día", con datos en vivo)
  // ---------------------------------------------------------------
  function exportarPdfInformeHoy() {
    if (!pdfDisponible()) {
      modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
      return;
    }
    if (!informeHoyCache) {
      modalAlert('Aún no hay informe abierto para hoy.', { titulo: 'Sin informe' });
      return;
    }

    const filas = incidenciasHoyCache
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

    if (!filas.length) {
      modalAlert('No hay incidencias registradas hoy para exportar.', { titulo: 'Nada que exportar' });
      return;
    }

    const grupos = agruparFilasPorAgenciaPdf(filas);
    const fechaTexto = `${dias[hoy.getDay()]}, ${formatearFechaCorta(hoy)}`;
    const doc = construirPdfInforme(fechaTexto, informeHoyCache.total_palets, grupos);
    doc.save(`informe-incidencias-${fechaHoyISO}.pdf`);
  }

  document.getElementById('btnPdfInforme').addEventListener('click', exportarPdfInformeHoy);

  // ---------------------------------------------------------------
  // Historial de informes diarios (el informe que se esté consultando)
  // ---------------------------------------------------------------
  function exportarPdfHistorial() {
    if (!pdfDisponible()) {
      modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
      return;
    }
    if (!historialInformeActual) {
      modalAlert('Consulta primero un informe para poder exportarlo.', { titulo: 'Nada que exportar' });
      return;
    }

    const filas = (historialIncidenciasActual || []).map(i => ({
      hora: i.tienda_hora_prevista ? i.tienda_hora_prevista.slice(0, 5) : '',
      tienda: i.tienda_nombre || '—',
      tipo: i.tipo,
      motivo: i.motivo,
      observaciones: i.observaciones,
      agenciaId: i.agencia_id,
      agenciaNombre: i.agencia_nombre,
      agenciaOrden: i.agencia_id != null ? agenciasCache.findIndex(a => a.id === i.agencia_id) : 999999
    }));

    const grupos = agruparFilasPorAgenciaPdf(filas);
    const fechaInforme = new Date(historialInformeActual.fecha + 'T00:00:00');
    const fechaTexto = `${dias[fechaInforme.getDay()]}, ${formatearFechaCorta(fechaInforme)}`;
    const doc = construirPdfInforme(fechaTexto, historialInformeActual.total_palets, grupos);
    doc.save(`informe-incidencias-${historialInformeActual.fecha}.pdf`);
  }

  document.getElementById('btnPdfHistorial').addEventListener('click', exportarPdfHistorial);

  // ---------------------------------------------------------------
