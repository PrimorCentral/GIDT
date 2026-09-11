// js/reportes-mensuales-exportar.js
// ---------------------------------------------------------------
// Análisis · Reportes mensuales → botón "Exportar".
//
// Descarga en PDF, para el mes que se esté viendo en Reportes mensuales
// (rmAnio / rmMes de reportes-mensuales.js), el mismo PDF "ENTREGAS
// MERCANCIA AGENCIA" que se envía por correo a las agencias (mismo
// título, misma leyenda de códigos, misma tabla Agencia/Tienda/
// Provincia/días/Total) — pero como descarga directa al dispositivo, sin
// enviar ningún correo ni tocar la tabla informes_mensuales_agencia_enviados.
//
// El panel deja elegir:
//   - Agencia: una agencia/grupo de envío concreto, o "Todas las
//     agencias" para un único PDF con todas las filas del mes.
//   - Rango de días: por defecto, todo el mes que se está viendo; se
//     puede acotar a un rango de fechas DENTRO de ese mismo mes (no
//     cruza a otro mes — los selectores de fecha quedan limitados a los
//     días del mes en pantalla).
//
// A diferencia del envío por correo (reportes-mensuales-envio.js), aquí
// SÍ se puede exportar el mes en curso (no solo meses ya terminados): es
// una descarga local para consultar/imprimir, no una comunicación oficial
// a la agencia.
//
// Reutiliza de reportes-mensuales-envio.js: rmeConstruirGrupos(),
// rmeObtenerDatosMes(), rmeConstruirPdf(), rmeNombreArchivo(),
// rmeTituloMes(). Requiere también (ya cargados antes): sb, escapeHtml,
// modalAlert, pdfDisponible() (informe-pdf.js), rmAnio, rmMes,
// rmDiasDelMes(), rmSegmentosPorTienda() (reportes-mensuales.js).
// ---------------------------------------------------------------

let rmxEnganchado = false;
let rmxDescargando = false; // evita doble clic mientras se genera un PDF
let rmxGruposActuales = []; // último listado de agencias/grupos cargado

const RMX_VALOR_TODAS = '__todas__';

function rmxPosicionarPanel() {
  const btn = document.getElementById('btnRmExportar');
  const panel = document.getElementById('rmExportarPanel');
  const wrap = btn.closest('.filtros-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(420, bordeDerechoVisible() - margen * 2);
  panel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (bordeDerechoVisible() - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  panel.style.left = left + 'px';
}

function rmxAbrirPanel() {
  if (typeof rmCerrarFiltrosPanel === 'function') rmCerrarFiltrosPanel();
  if (typeof rmeCerrarPanel === 'function') rmeCerrarPanel();
  rmxPosicionarPanel();
  document.getElementById('rmExportarPanel').classList.add('show');
  document.getElementById('btnRmExportar').classList.add('open');
  // Si hay algún filtro activo en la pantalla, se propone usarlo de entrada
  // (se puede desmarcar y elegir agencia a mano igualmente).
  document.getElementById('rmxUsarFiltroActivo').checked = rmxHayFiltroActivo();
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
  document.getElementById('rmxBtnDescargar').addEventListener('click', rmxDescargar);
  document.getElementById('rmxUsarFiltroActivo').addEventListener('change', rmxActualizarUsoFiltro);
}

// Primer/último día del mes en pantalla, en formato YYYY-MM-DD (para los
// <input type="date">, que quedan limitados a ese rango con min/max).
function rmxFechaISO(anio, mesIndex, dia) {
  return `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// ---------------------------------------------------------------
// Exportar con el filtro activo de la pantalla (rmFiltros, de
// reportes-mensuales.js): agencias/tiendas elegidas y "solo con
// incidencias". Si no hay ningún filtro puesto, se oculta esta opción y
// se exporta eligiendo agencia como siempre.
// ---------------------------------------------------------------
function rmxHayFiltroActivo() {
  return !!(rmFiltros.agencias.size || rmFiltros.tiendas.size || rmFiltros.soloConIncidencias);
}

function rmxResumenFiltroActivo() {
  const partes = [];
  if (rmFiltros.agencias.size) partes.push(`${rmFiltros.agencias.size} agencia${rmFiltros.agencias.size === 1 ? '' : 's'}`);
  if (rmFiltros.tiendas.size) partes.push(`${rmFiltros.tiendas.size} tienda${rmFiltros.tiendas.size === 1 ? '' : 's'}`);
  if (rmFiltros.soloConIncidencias) partes.push('solo con incidencias');
  return partes.join(', ') || 'sin filtros';
}

function rmxActualizarUsoFiltro() {
  const wrap = document.getElementById('rmxUsarFiltroWrap');
  const check = document.getElementById('rmxUsarFiltroActivo');
  const campoAgencia = document.getElementById('rmxAgenciaCampo');
  const selectAgencia = document.getElementById('rmxAgenciaSelect');
  if (!wrap || !check) return;

  const hayFiltro = rmxHayFiltroActivo();
  wrap.style.display = hayFiltro ? 'flex' : 'none';
  document.getElementById('rmxFiltroResumen').textContent = rmxResumenFiltroActivo();
  if (!hayFiltro) check.checked = false;

  const usar = hayFiltro && check.checked;
  campoAgencia.style.opacity = usar ? '.45' : '';
  campoAgencia.style.pointerEvents = usar ? 'none' : '';
  selectAgencia.disabled = usar || !selectAgencia.options.length;
}

// Carga agencias frescas (con grupo_envio, para agrupar igual que al
// enviar por correo) y rellena el desplegable de agencia + los selectores
// de fecha (limitados al mes que se está viendo).
async function rmxCargarYRenderPanel() {
  const selectAgencia = document.getElementById('rmxAgenciaSelect');
  const inputDesde = document.getElementById('rmxFechaDesde');
  const inputHasta = document.getElementById('rmxFechaHasta');
  selectAgencia.innerHTML = '<option value="">Cargando…</option>';
  selectAgencia.disabled = true;
  document.getElementById('rmxBtnDescargar').disabled = true;

  const totalDias = rmDiasDelMes(rmAnio, rmMes);
  const minFecha = rmxFechaISO(rmAnio, rmMes, 1);
  const maxFecha = rmxFechaISO(rmAnio, rmMes, totalDias);
  inputDesde.min = inputHasta.min = minFecha;
  inputDesde.max = inputHasta.max = maxFecha;
  inputDesde.value = minFecha;
  inputHasta.value = maxFecha;

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
      selectAgencia.innerHTML = '<option value="">No hay agencias configuradas</option>';
      return;
    }

    selectAgencia.innerHTML =
      `<option value="${RMX_VALOR_TODAS}">Todas las agencias (un solo PDF)</option>` +
      grupos.map(g => `<option value="${escapeHtml(g.clave)}">${escapeHtml(g.nombre)}</option>`).join('');
    document.getElementById('rmxBtnDescargar').disabled = false;
  } catch (err) {
    console.error('Error cargando el panel de exportación del reporte mensual:', err);
    selectAgencia.innerHTML = '<option value="">Error al cargar agencias</option>';
  } finally {
    rmxActualizarUsoFiltro();
  }
}

// Genera el PDF (mismo formato que el envío por correo) para la agencia
// elegida —o todas juntas— y el rango de días elegido, y lo descarga
// directamente, sin enviar nada ni registrar ningún envío en la BD.
async function rmxDescargar() {
  if (rmxDescargando) return;

  const usarFiltro = rmxHayFiltroActivo() && document.getElementById('rmxUsarFiltroActivo').checked;
  const selectAgencia = document.getElementById('rmxAgenciaSelect');
  const clave = selectAgencia.value;
  const fechaDesde = document.getElementById('rmxFechaDesde').value;
  const fechaHasta = document.getElementById('rmxFechaHasta').value;

  if (!usarFiltro && !clave) return;
  if (!fechaDesde || !fechaHasta) {
    await modalAlert('Elige una fecha de inicio y una de fin.', { titulo: 'Faltan fechas' });
    return;
  }
  const diaDesde = Number(fechaDesde.slice(8, 10));
  const diaHasta = Number(fechaHasta.slice(8, 10));
  if (diaDesde > diaHasta) {
    await modalAlert('La fecha "Desde" no puede ser posterior a la fecha "Hasta".', { titulo: 'Rango de fechas no válido' });
    return;
  }

  if (!pdfDisponible()) {
    await modalAlert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.', { titulo: 'PDF no disponible' });
    return;
  }

  const btn = document.getElementById('rmxBtnDescargar');
  const textoOriginal = btn.textContent;
  rmxDescargando = true;
  btn.disabled = true;
  btn.textContent = 'Generando PDF…';

  try {
    const { celdas, diasEnviados, totalDias, todasLasFilas, puntualAgenciaPorTienda } = await rmeObtenerDatosMes();
    const segmentosPorTienda = rmSegmentosPorTienda(todasLasFilas);

    let nombreGrupo, filasGrupo;

    if (usarFiltro) {
      // Mismo filtro (agencias/tiendas/solo con incidencias) que se ve
      // aplicado ahora mismo en la pantalla de Reportes mensuales.
      nombreGrupo = rmFiltros.agencias.size === 1 && !rmFiltros.tiendas.size
        ? (agenciasCache.find(a => a.id === [...rmFiltros.agencias][0])?.nombre || 'Filtro activo')
        : 'Filtro activo';
      filasGrupo = rmFilasSegunFiltros(todasLasFilas);
      if (rmFiltros.soloConIncidencias) {
        filasGrupo = filasGrupo.filter(f => {
          const segmentosTienda = segmentosPorTienda.get(f.tiendaId) || [f];
          const puntualPorDia = puntualAgenciaPorTienda.get(f.tiendaId);
          const celdasTienda = celdas[f.tiendaId] || {};
          const { totalIncidencias } = rmCeldasDeTramo(f, segmentosTienda, puntualPorDia, celdasTienda, diasEnviados, totalDias);
          return totalIncidencias > 0;
        });
      }
    } else {
      const esTodas = clave === RMX_VALOR_TODAS;
      const grupoElegido = rmxGruposActuales.find(g => g.clave === clave);
      nombreGrupo = esTodas ? 'Todas las agencias' : (grupoElegido?.nombre || clave);
      filasGrupo = esTodas
        ? todasLasFilas.slice()
        : todasLasFilas.filter(f => grupoElegido && grupoElegido.agenciaIds.includes(f.agenciaId));
    }

    // Solo las filas que tengan algún día dentro del rango elegido.
    filasGrupo = filasGrupo
      .filter(f => f.diaFin >= diaDesde && f.diaInicio <= diaHasta)
      .sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre) || a.tiendaNombre.localeCompare(b.tiendaNombre) || a.diaInicio - b.diaInicio);

    if (!filasGrupo.length) {
      throw new Error(usarFiltro
        ? 'No hay tiendas que cumplan el filtro activo en ese rango de fechas.'
        : 'No hay tiendas con datos en ese rango de fechas.');
    }

    const doc = rmeConstruirPdf(nombreGrupo, rmAnio, rmMes, filasGrupo, segmentosPorTienda, puntualAgenciaPorTienda, celdas, diasEnviados, totalDias, diaDesde, diaHasta);
    doc.save(rmeNombreArchivo(nombreGrupo, rmAnio, rmMes, diaDesde, diaHasta, totalDias));
  } catch (err) {
    console.error('Error exportando el reporte mensual:', err);
    await modalAlert(err.message || 'No se pudo generar el PDF.', { titulo: 'Error al exportar' });
  } finally {
    rmxDescargando = false;
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

rmxEngancharPanel();
