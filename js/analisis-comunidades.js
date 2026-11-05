// js/analisis-comunidades.js
// ---------------------------------------------------------------
// Análisis → "Incidencias por comunidad": total anual por comunidad y
// por tienda, mes a mes, con el mismo criterio que el Reporte mensual
// (informes enviados, entrega HABITUAL, motivos con código, una
// incidencia por tienda y día).
//
// Junta dos fuentes:
//  - Lo que calcula GIDT a partir de los informes diarios enviados.
//  - Los Excel manuales de antes de GIDT, importados en la tabla
//    `incidencias_importadas` (una fila por año, tienda y agencia, con el
//    total de cada mes en `meses[1..12]`). P. ej. 2025 completo y 2026
//    de enero al 6 de septiembre.
//
// También genera el Excel anual (hojas COMUNIDADES, TIENDAS y DATOS),
// que se descarga desde esta pantalla y desde el botón "Informe anual"
// del Reporte mensual.
// ---------------------------------------------------------------

const AC_MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const AC_MESES_LARGOS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const AC_SIN_COMUNIDAD = 'SIN COMUNIDAD';

let acAnio = new Date().getFullYear();
let acDatos = null;          // resultado de acCargarDatos() del año en pantalla
let acComunidadSel = null;   // comunidad pulsada (lista de tiendas de la derecha)
let acInicializado = false;
let acPeticion = 0;          // descarta respuestas de años anteriores si se cambia rápido

// Comunidades "de fuera de España": las que van detrás de 'ANDORRA' en la
// lista fija de Gestión de tiendas (ANDORRA, ITALIA, PORTUGAL…).
function acEsExtranjero(comunidad) {
  const lista = window.COMUNIDADES_TIENDA || [];
  const iAnd = lista.indexOf('ANDORRA');
  const i = lista.indexOf(comunidad);
  return iAnd >= 0 && i >= iAnd;
}

// Trae todas las filas de una consulta paginando de 1000 en 1000 (límite
// de Supabase por petición). `crear` devuelve la consulta sin .range().
async function acTraerTodo(crear) {
  const res = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await crear().range(desde, desde + 999);
    if (error) throw error;
    res.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return res;
}

// ---------------------------------------------------------------
// Datos del año: filas base { clave, tiendaId, nombre, provincia,
// comunidad, agencia, meses[12], origen: 'GIDT' | 'EXCEL' } y, a partir
// de ellas, los totales por tienda y por comunidad.
// ---------------------------------------------------------------
async function acCargarDatos(anio) {
  const tiendaPorId = new Map((tiendasCache || []).map(t => [t.id, t]));
  const nombreAgencia = id => (agenciasCache || []).find(a => a.id === id)?.nombre || (id ? `#${id}` : '—');

  // 1) Excel importados.
  const { data: imp, error: eImp } = await sb
    .from('incidencias_importadas')
    .select('tienda_id, tienda_nombre, provincia, comunidad, agencia_nombre, meses')
    .eq('anio', anio);
  if (eImp) throw eImp;

  // 2) GIDT: informes enviados del año e incidencias marcadas de entrega habitual.
  const informes = await acTraerTodo(() => sb
    .from('informes_diarios')
    .select('id, fecha')
    .eq('informe_enviado', true)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`)
    .order('fecha'));
  const fechaPorInforme = new Map(informes.map(i => [i.id, i.fecha]));
  const mesesConGidt = new Set(informes.map(i => Number(i.fecha.slice(5, 7)) - 1));

  const incs = [];
  for (let i = 0; i < informes.length; i += 40) {
    const ids = informes.slice(i, i + 40).map(x => x.id);
    incs.push(...await acTraerTodo(() => sb
      .from('incidencias')
      .select('informe_id, tienda_id, agencia_id, motivo')
      .in('informe_id', ids)
      .eq('marcada', true)
      .eq('entrega', 'HABITUAL')
      .order('id')));
  }

  const filas = new Map(); // clave tienda|agencia → fila base
  const filaDe = (clave, base) => {
    if (!filas.has(clave)) filas.set(clave, { ...base, meses: new Array(12).fill(0) });
    return filas.get(clave);
  };
  // Para tiendas importadas que ya no existen en GIDT y no traen comunidad:
  // la comunidad de las tiendas actuales de esa misma provincia.
  const comunidadPorProvincia = new Map();
  (tiendasCache || []).forEach(t => {
    if (t.provincia && t.comunidad) comunidadPorProvincia.set(t.provincia.trim().toUpperCase(), t.comunidad.trim().toUpperCase());
  });
  const datosTienda = (tiendaId, nombre, provincia, comunidad) => {
    const t = tiendaId != null ? tiendaPorId.get(tiendaId) : null;
    const prov = (t?.provincia || provincia || '').trim().toUpperCase();
    return {
      tiendaId: tiendaId ?? null,
      nombre: t?.nombre || nombre || '—',
      provincia: prov,
      comunidad: (t?.comunidad || comunidad || comunidadPorProvincia.get(prov) || AC_SIN_COMUNIDAD).toUpperCase()
    };
  };

  (imp || []).forEach(r => {
    const tk = r.tienda_id != null ? `T${r.tienda_id}` : `N${r.tienda_nombre}`;
    const agencia = (r.agencia_nombre || '—').trim().toUpperCase();
    const f = filaDe(`E|${tk}|${agencia}`, { ...datosTienda(r.tienda_id, r.tienda_nombre, r.provincia, r.comunidad), tk, agencia, origen: 'EXCEL' });
    (r.meses || []).forEach((n, i) => { if (i < 12) f.meses[i] += Number(n) || 0; });
  });

  // Una incidencia por tienda y día (como el Reporte mensual): la agencia
  // que cuenta es la de la primera incidencia con código de ese día.
  const vistos = new Set();
  incs.forEach(inc => {
    if (typeof codigoDeMotivos === 'function' && !codigoDeMotivos(inc.motivo)) return;
    const fecha = fechaPorInforme.get(inc.informe_id);
    if (!fecha) return;
    const k = `${inc.tienda_id}|${fecha}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    const agencia = nombreAgencia(inc.agencia_id).toUpperCase();
    const f = filaDe(`G|T${inc.tienda_id}|${agencia}`, { ...datosTienda(inc.tienda_id), tk: `T${inc.tienda_id}`, agencia, origen: 'GIDT' });
    f.meses[Number(fecha.slice(5, 7)) - 1]++;
  });

  // Tiendas que ya están en GIDT y entran en el reporte: salen aunque no
  // hayan tenido ninguna incidencia en el año (cuentan en "Nº tiendas").
  if (mesesConGidt.size) {
    (tiendasCache || []).filter(t => t.activo !== false && (typeof rmMarcaEntraEnReporte !== 'function' || rmMarcaEntraEnReporte(t))).forEach(t => {
      const agencia = nombreAgencia(t.agencia_id).toUpperCase();
      const tk = `T${t.id}`;
      const yaEsta = [...filas.values()].some(f => f.tk === tk);
      if (!yaEsta) filaDe(`G|${tk}|${agencia}`, { ...datosTienda(t.id), tk, agencia, origen: 'GIDT' });
    });
  }

  // Meses con datos de cada fuente (para marcar las columnas importadas).
  const mesesConExcel = new Set();
  [...filas.values()].filter(f => f.origen === 'EXCEL').forEach(f => f.meses.forEach((n, i) => { if (n) mesesConExcel.add(i); }));
  const hayExcel = (imp || []).length > 0;

  // Por tienda.
  const tiendas = new Map();
  filas.forEach(f => {
    if (!tiendas.has(f.tk)) tiendas.set(f.tk, { tk: f.tk, tiendaId: f.tiendaId, nombre: f.nombre, provincia: f.provincia, comunidad: f.comunidad, agencias: new Set(), meses: new Array(12).fill(0), total: 0 });
    const t = tiendas.get(f.tk);
    const totalFila = f.meses.reduce((a, b) => a + b, 0);
    if (totalFila || !t.agencias.size) t.agencias.add(f.agencia);
    f.meses.forEach((n, i) => { t.meses[i] += n; t.total += n; });
  });

  // Por comunidad.
  const comunidades = new Map();
  tiendas.forEach(t => {
    if (!comunidades.has(t.comunidad)) comunidades.set(t.comunidad, { comunidad: t.comunidad, tiendas: [], meses: new Array(12).fill(0), total: 0 });
    const c = comunidades.get(t.comunidad);
    c.tiendas.push(t);
    t.meses.forEach((n, i) => { c.meses[i] += n; c.total += n; });
  });
  comunidades.forEach(c => c.tiendas.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es')));

  const suma = lista => {
    const meses = new Array(12).fill(0);
    let total = 0, nTiendas = 0;
    lista.forEach(c => { c.meses.forEach((n, i) => { meses[i] += n; }); total += c.total; nTiendas += c.tiendas.length; });
    return { meses, total, nTiendas };
  };
  const ordenar = lista => lista.sort((a, b) => b.total - a.total || a.comunidad.localeCompare(b.comunidad, 'es'));
  const espana = ordenar([...comunidades.values()].filter(c => !acEsExtranjero(c.comunidad)));
  const extranjero = ordenar([...comunidades.values()].filter(c => acEsExtranjero(c.comunidad)));
  const totEspana = suma(espana), totExtranjero = suma(extranjero), totGeneral = suma([...espana, ...extranjero]);

  return {
    anio, filas: [...filas.values()], tiendas, comunidades, espana, extranjero,
    totEspana, totExtranjero, totGeneral,
    mesesConGidt, mesesConExcel, hayExcel
  };
}

// ---------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------
function acFmt(n, dec = 0) {
  return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

// 'excel' (solo Excel manual), 'mixto' (parte Excel y parte GIDT) o ''.
function acOrigenMes(d, i) {
  const excel = d.mesesConExcel.has(i);
  const gidt = d.mesesConGidt.has(i);
  if (excel && gidt) return 'mixto';
  return excel ? 'excel' : '';
}

function acPintar() {
  const cont = document.getElementById('acTabla');
  const lateral = document.getElementById('acLateral');
  const d = acDatos;
  if (!cont || !lateral || !d) return;
  document.getElementById('acAnioTexto').textContent = d.anio;

  if (!d.tiendas.size) {
    cont.innerHTML = `<div class="card"><div class="empty"><div class="glyph">🗺️</div><h3>No hay datos de ${d.anio}</h3><p>Ni informes enviados en GIDT ni Excel importados para ese año.</p></div></div>`;
    lateral.innerHTML = '';
    return;
  }

  const origenes = AC_MESES_CORTOS.map((_, i) => acOrigenMes(d, i));
  const thMes = (m, i) => {
    const o = origenes[i];
    const title = o === 'excel' ? 'Importado del Excel manual' : o === 'mixto' ? 'Parte del Excel manual y parte de GIDT' : '';
    return `<th class="${o ? 'ac-' + o : ''}"${title ? ` title="${title}"` : ''}>${m}</th>`;
  };
  const tdMeses = meses => meses.map((n, i) => `<td class="${origenes[i] === 'excel' ? 'ac-importado' : ''}">${acFmt(n)}</td>`).join('');
  const total = d.totGeneral.total;
  // La barra de cada comunidad se escala respecto a la comunidad con más
  // incidencias (si no, casi todas saldrían vacías); las de los totales,
  // respecto al total general.
  const maxCom = Math.max(1, ...[...d.espana, ...d.extranjero].map(c => c.total));
  const celdaPct = (n, esTotal) => {
    const pct = total ? (n / total) * 100 : 0;
    const ancho = esTotal ? pct : (n / maxCom) * 100;
    return `<td class="ac-pct"><span class="ac-barra"><i style="width:${Math.min(100, ancho)}%"></i></span>${acFmt(pct, 1)}%</td>`;
  };
  const filaComunidad = c => `
    <tr class="ac-fila-com${c.comunidad === acComunidadSel ? ' ac-fila-sel' : ''}" data-ac-com="${escapeHtml(c.comunidad)}">
      <td>${escapeHtml(c.comunidad)}</td><td>${c.tiendas.length}</td>${tdMeses(c.meses)}
      <td><b>${acFmt(c.total)}</b></td>${celdaPct(c.total)}<td>${acFmt(c.tiendas.length ? c.total / c.tiendas.length : 0, 1)}</td>
    </tr>`;
  const filaTotal = (titulo, t, extra = '') => `
    <tr class="ac-fila-total ${extra}">
      <td>${titulo}</td><td>${t.nTiendas}</td>${tdMeses(t.meses)}
      <td>${acFmt(t.total)}</td>${celdaPct(t.total, true)}<td>${acFmt(t.nTiendas ? t.total / t.nTiendas : 0, 1)}</td>
    </tr>`;

  const filasHtml = [
    ...d.espana.map(filaComunidad),
    filaTotal('TOTAL ESPAÑA', d.totEspana),
    ...(d.extranjero.length ? [...d.extranjero.map(filaComunidad), filaTotal('TOTAL EXTRANJERO', d.totExtranjero)] : []),
    filaTotal('TOTAL GENERAL', d.totGeneral, 'ac-fila-general')
  ].join('');

  const hayImportados = origenes.some(o => o);
  cont.innerHTML = `
    <div class="card ac-card-tabla">
      <table class="tabla-reporte-mensual ac-tabla">
        <thead><tr><th>Comunidad</th><th>Nº tiendas</th>${AC_MESES_CORTOS.map(thMes).join('')}<th>Total</th><th>% s/total</th><th>Media/tienda</th></tr></thead>
        <tbody>${filasHtml}</tbody>
      </table>
    </div>
    <p class="ac-nota">${hayImportados ? '<span class="ac-chip"></span>Meses importados de los Excel manuales (antes de usar GIDT). ' : ''}Pulsa una comunidad para ver sus tiendas.</p>`;

  cont.querySelectorAll('tr[data-ac-com]').forEach(tr => tr.addEventListener('click', () => {
    acComunidadSel = acComunidadSel === tr.dataset.acCom ? null : tr.dataset.acCom;
    acPintar();
  }));

  acPintarLateral();
}

function acPintarLateral() {
  const lateral = document.getElementById('acLateral');
  const d = acDatos;
  if (!lateral || !d) return;
  const total = d.totGeneral.total;
  const pctEsp = total ? Math.round((d.totEspana.total / total) * 100) : 0;
  const media = d.totGeneral.nTiendas ? d.totGeneral.total / d.totGeneral.nTiendas : 0;

  const c = acComunidadSel ? d.comunidades.get(acComunidadSel) : null;
  const lista = c ? c.tiendas : [...d.tiendas.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
  const titulo = c ? `Tiendas · ${escapeHtml(c.comunidad)}` : 'Tiendas · todas';
  const sub = c ? `${c.tiendas.length} tiendas · ${acFmt(c.total)} inc.` : `${d.tiendas.size} tiendas`;

  lateral.innerHTML = `
    <div class="rm-sidebar-card">
      <div class="rm-side-cab"><span class="rm-side-tit">Año ${d.anio}</span><span class="rm-side-sub">todas las comunidades</span></div>
      <div class="rm-kpis">
        <div class="rm-kpi"><b>${acFmt(total)}</b><small>incidencias</small></div>
        <div class="rm-kpi"><b>${pctEsp}%</b><small>España</small></div>
        <div class="rm-kpi"><b>${acFmt(media, 1)}</b><small>media/tienda</small></div>
      </div>
    </div>
    <div class="rm-sidebar-card ac-lista-card">
      <div class="rm-side-cab"><span class="rm-side-tit">${titulo}</span><span class="rm-side-sub">${sub}</span></div>
      <div class="ac-lista">
        ${lista.map((t, i) => `
          <div class="ac-tienda">
            <span class="ac-pos">${i + 1}</span>
            <span class="ac-tn"><b>${escapeHtml(t.nombre)}</b><small>${escapeHtml([...t.agencias].join(' · ') || '—')}${c ? '' : ' · ' + escapeHtml(t.comunidad)}</small></span>
            <span class="ac-num">${acFmt(t.total)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

async function acCargarYPintar() {
  const cont = document.getElementById('acTabla');
  if (!cont) return;
  const peticion = ++acPeticion;
  document.getElementById('acAnioTexto').textContent = acAnio;
  cont.innerHTML = `<div class="card"><div class="empty"><div class="glyph">⏳</div><h3>Cargando ${acAnio}…</h3></div></div>`;
  document.getElementById('acLateral').innerHTML = '';
  try {
    const datos = await acCargarDatos(acAnio);
    if (peticion !== acPeticion) return;
    acDatos = datos;
    if (acComunidadSel && !datos.comunidades.has(acComunidadSel)) acComunidadSel = null;
    acPintar();
  } catch (err) {
    if (peticion !== acPeticion) return;
    console.error('Error cargando las incidencias por comunidad:', err);
    cont.innerHTML = `<div class="card"><div class="empty"><div class="glyph">⚠️</div><h3>NO SE PUDIERON CARGAR LOS DATOS</h3></div></div>`;
  }
}

function renderVistaAnalisisComunidades() {
  if (!acInicializado) {
    acInicializado = true;
    document.getElementById('acBtnAnterior')?.addEventListener('click', () => { acAnio--; acCargarYPintar(); });
    document.getElementById('acBtnSiguiente')?.addEventListener('click', () => { acAnio++; acCargarYPintar(); });
    document.getElementById('acBtnActual')?.addEventListener('click', () => { acAnio = new Date().getFullYear(); acCargarYPintar(); });
    document.getElementById('acBtnRecargar')?.addEventListener('click', (e) => {
      if (typeof recargarConGiro === 'function') recargarConGiro(e.currentTarget, acCargarYPintar);
      else acCargarYPintar();
    });
    document.getElementById('acBtnExcel')?.addEventListener('click', (e) => acDescargarExcel(acAnio, e.currentTarget));
  }
  acCargarYPintar();
}

// ---------------------------------------------------------------
// Excel anual (hojas COMUNIDADES, TIENDAS y DATOS), con el mismo
// formato que el Excel manual de auditoría.
// ---------------------------------------------------------------
async function acDescargarExcel(anio, btn) {
  if (typeof window.ExcelJS === 'undefined') {
    await modalAlert('NO SE PUDO CARGAR LA LIBRERÍA DE EXCEL. REVISA LA CONEXIÓN.', { titulo: 'Error' });
    return;
  }
  const textoOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando Excel…'; }
  try {
    const d = (acDatos && acDatos.anio === anio) ? acDatos : await acCargarDatos(anio);
    if (!d.tiendas.size) {
      await modalAlert(`No hay datos de ${anio}: ni informes enviados en GIDT ni Excel importados para ese año.`, { titulo: 'Sin datos' });
      return;
    }
    const wb = new window.ExcelJS.Workbook();
    const AZUL = 'FF1F3864', GRIS = 'FFE7EBF0', NARANJA = 'FFFFEEDF', BLANCO = 'FFFFFFFF';
    const borde = { top: { style: 'thin', color: { argb: 'FFC9CFD8' } }, left: { style: 'thin', color: { argb: 'FFC9CFD8' } }, bottom: { style: 'thin', color: { argb: 'FFC9CFD8' } }, right: { style: 'thin', color: { argb: 'FFC9CFD8' } } };
    const relleno = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const estiloFila = (fila, { bold = false, fill = null, color = null } = {}) => {
      fila.eachCell({ includeEmpty: true }, c => {
        c.border = borde;
        c.font = { ...(c.font || {}), bold, ...(color ? { color: { argb: color } } : {}) };
        if (fill) c.fill = relleno(fill);
      });
    };
    const titulo = (hoja, texto, hastaCol) => {
      hoja.mergeCells(1, 1, 2, hastaCol);
      const c = hoja.getCell(1, 1);
      c.value = texto;
      c.font = { bold: true, size: 14, color: { argb: BLANCO } };
      c.fill = relleno(AZUL);
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    };
    const cabecera = (fila) => {
      fila.eachCell(c => {
        c.font = { bold: true, color: { argb: BLANCO } };
        c.fill = relleno(AZUL);
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        c.border = borde;
      });
      fila.height = 20;
    };
    const paginaApaisada = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 } };

    // --- COMUNIDADES ---
    const hc = wb.addWorksheet('COMUNIDADES', { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: paginaApaisada });
    hc.columns = [{ width: 28 }, { width: 11 }, ...AC_MESES_CORTOS.map(() => ({ width: 7 })), { width: 9 }, { width: 11 }, { width: 9 }];
    titulo(hc, `AUDITORÍA DE INCIDENCIAS ${anio} — TOTAL POR COMUNIDAD`, 17);
    cabecera(hc.addRow(['COMUNIDAD', 'Nº TIENDAS', ...AC_MESES_CORTOS, 'TOTAL', '% S/TOTAL', 'MEDIA']));
    hc.pageSetup.printTitlesRow = '3:3';
    const totalGeneral = d.totGeneral.total;
    const filaCom = (nombre, nTiendas, meses, total, opts) => {
      const f = hc.addRow([nombre, nTiendas, ...meses, total, totalGeneral ? total / totalGeneral : 0, nTiendas ? total / nTiendas : 0]);
      f.getCell(16).numFmt = '0.0%';
      f.getCell(17).numFmt = '0.0';
      for (let i = 2; i <= 17; i++) f.getCell(i).alignment = { horizontal: 'center' };
      estiloFila(f, opts);
      return f;
    };
    d.espana.forEach(c => filaCom(c.comunidad, c.tiendas.length, c.meses, c.total));
    filaCom('TOTAL ESPAÑA', d.totEspana.nTiendas, d.totEspana.meses, d.totEspana.total, { bold: true, fill: GRIS });
    if (d.extranjero.length) {
      d.extranjero.forEach(c => filaCom(c.comunidad, c.tiendas.length, c.meses, c.total));
      filaCom('TOTAL EXTRANJERO', d.totExtranjero.nTiendas, d.totExtranjero.meses, d.totExtranjero.total, { bold: true, fill: GRIS });
    }
    filaCom('TOTAL GENERAL', d.totGeneral.nTiendas, d.totGeneral.meses, d.totGeneral.total, { bold: true, fill: NARANJA });
    const origenes = AC_MESES_CORTOS.map((_, i) => acOrigenMes(d, i));
    if (origenes.some(o => o)) {
      hc.addRow([]);
      const nota = hc.addRow([`Meses importados de los Excel manuales: ${AC_MESES_CORTOS.filter((_, i) => origenes[i] === 'excel').join(', ') || '—'}` +
        (origenes.includes('mixto') ? ` · Parte Excel y parte GIDT: ${AC_MESES_CORTOS.filter((_, i) => origenes[i] === 'mixto').join(', ')}` : '')]);
      nota.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF5A6473' } };
    }

    // --- TIENDAS ---
    const ht = wb.addWorksheet('TIENDAS', { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: paginaApaisada });
    ht.columns = [{ width: 26 }, { width: 16 }, { width: 28 }, ...AC_MESES_CORTOS.map(() => ({ width: 6 })), { width: 8 }];
    titulo(ht, `AUDITORÍA DE INCIDENCIAS ${anio} — TOTAL POR TIENDA`, 16);
    ht.getRow(2).height = 4;
    const sub = ht.getRow(3);
    sub.getCell(1).value = 'Ordenado por comunidad y, dentro de cada una, de más a menos incidencias. Mismo criterio que el Reporte mensual.';
    sub.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF5A6473' } };
    cabecera(ht.addRow(['TIENDA', 'PROVINCIA', 'AGENCIA(S)', ...AC_MESES_CORTOS, 'TOTAL']));
    ht.pageSetup.printTitlesRow = '4:4';
    [...d.espana, ...d.extranjero].forEach(c => {
      const fc = ht.addRow([c.comunidad]);
      ht.mergeCells(fc.number, 1, fc.number, 16);
      fc.getCell(1).font = { bold: true, color: { argb: AZUL } };
      fc.getCell(1).fill = relleno('FFDCE3EF');
      c.tiendas.forEach(t => {
        const f = ht.addRow([t.nombre, t.provincia, [...t.agencias].join(' · '), ...t.meses, t.total]);
        for (let i = 4; i <= 16; i++) f.getCell(i).alignment = { horizontal: 'center' };
        estiloFila(f);
        f.getCell(16).font = { bold: true };
      });
      const ft = ht.addRow([`TOTAL ${c.comunidad}`, '', `${c.tiendas.length} tiendas`, ...c.meses, c.total]);
      for (let i = 4; i <= 16; i++) ft.getCell(i).alignment = { horizontal: 'center' };
      estiloFila(ft, { bold: true, fill: GRIS });
    });

    // --- DATOS ---
    const hd = wb.addWorksheet('DATOS', { views: [{ state: 'frozen', ySplit: 1 }] });
    hd.columns = [
      { header: 'MES', key: 'mes', width: 12 }, { header: 'AGENCIA', key: 'agencia', width: 26 },
      { header: 'TIENDA', key: 'tienda', width: 26 }, { header: 'PROVINCIA', key: 'prov', width: 16 },
      { header: 'COMUNIDAD', key: 'com', width: 22 }, { header: 'INCIDENCIAS', key: 'inc', width: 12 },
      { header: 'ORIGEN', key: 'origen', width: 12 }
    ];
    cabecera(hd.getRow(1));
    hd.pageSetup.printTitlesRow = '1:1';
    const datos = [];
    d.filas.forEach(f => f.meses.forEach((n, i) => {
      if (!n) return;
      datos.push({ i, mes: AC_MESES_LARGOS[i], agencia: f.agencia, tienda: f.nombre, prov: f.provincia, com: f.comunidad, inc: n, origen: f.origen === 'EXCEL' ? 'Excel' : 'GIDT' });
    }));
    datos.sort((a, b) => a.i - b.i || a.agencia.localeCompare(b.agencia, 'es') || a.tienda.localeCompare(b.tienda, 'es'));
    datos.forEach(x => { const { i, ...fila } = x; hd.addRow(fila); });
    hd.autoFilter = { from: 'A1', to: 'G1' };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    descargarBlob(blob, `AUDITORIA_INCIDENCIAS_${anio}.xlsx`);
  } catch (err) {
    console.error('Error generando el Excel anual por comunidades:', err);
    await modalAlert('NO SE PUDO GENERAR EL EXCEL ANUAL.', { titulo: 'Error al exportar' });
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
}

// Botón "Informe anual" del Reporte mensual: Excel del año que se está viendo.
document.getElementById('btnRmInformeAnual')?.addEventListener('click', (e) => {
  const anio = typeof rmAnio === 'number' ? rmAnio : new Date().getFullYear();
  acDescargarExcel(anio, e.currentTarget);
});
