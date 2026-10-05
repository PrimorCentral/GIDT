// js/historico-agencias.js
// ---------------------------------------------------------------
// Análisis · Histórico de agencias — por qué agencias ha pasado cada
// tienda, desde cuándo hasta cuándo y con cuántas incidencias en cada
// tramo.
//
// Tramos: salen de tienda_agencia_historial (cambios PERMANENTES, con su
// fecha real; los cambios programados escriben ahí con la fecha
// programada). Los cambios que se anulan el mismo día (p. ej. se aplica
// uno programado y alguien lo deshace a mano) dan tramos de 0 días: se
// descartan y los tramos seguidos de la misma agencia se juntan en uno.
// Los cambios PENDIENTES de tienda_cambios_agencia_programados se pintan
// al final como tramo futuro (rayado).
//
// Incidencias: mismo criterio que el Reporte mensual — solo informes ya
// enviados, entrega HABITUAL, marcadas y con código (codigoDeMotivos; los
// motivos "pendientes de revisar" no cuentan). Los días en que la tienda
// recibió por OTRA agencia (cambio puntual del Informe del día o entrega
// de sábado) no cuentan para el tramo: se muestran aparte como "con otra
// agencia", igual que el Reporte mensual las pone en otra fila.
//
// Los datos empiezan el día del primer informe diario (HA_DATOS_DESDE se
// calcula al cargar) o el día de alta de la tienda si es posterior.
// ---------------------------------------------------------------

let haDatos = null;             // { tiendas: [...con tramos], datosDesde, hoy }
let haFiltroTexto = '';
let haFiltroAgencia = '';
let haSoloConCambios = true;
let haCargando = false;

const HA_COLORES = [
  // [barra, fondo pill, texto pill]
  ['#E07A1F', '#FDECD8', '#A2530B'],
  ['#1B6DE0', '#E6F0FE', '#1B6DE0'],
  ['#8A5CC9', '#EEE6FB', '#6B3FA0'],
  ['#E8B400', '#FFF4CC', '#8A6200'],
  ['#1E8E3E', '#E6F4EA', '#1E6E33'],
  ['#D12B0D', '#FDE7E2', '#A82208'],
  ['#0F9AA8', '#DFF5F7', '#0B6F79'],
  ['#C2408A', '#FBE6F1', '#963069'],
  ['#5B6572', '#EEF0F3', '#3F4752']
];

function haColorAgencia(agenciaId) {
  const idx = agenciasCache.findIndex(a => a.id === agenciaId);
  return HA_COLORES[(idx < 0 ? HA_COLORES.length - 1 : idx) % HA_COLORES.length];
}

function haNombreAgencia(id, respaldo) {
  return agenciasCache.find(a => a.id === id)?.nombre || respaldo || '—';
}

function haPillAgencia(id, respaldo) {
  const [, bg, tx] = haColorAgencia(id);
  return `<span class="ha-ag" style="background:${bg}; color:${tx};">${escapeHtml(haNombreAgencia(id, respaldo))}</span>`;
}

function haFechaLarga(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function haFechaCorta(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function haSumarDias(iso, dias) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return fechaLocalISO(d);
}

function haDiasEntre(desde, hasta) { // ambos incluidos
  return Math.round((new Date(hasta + 'T00:00:00') - new Date(desde + 'T00:00:00')) / 86400000) + 1;
}

function haNombreCorto(nombre) {
  if (!nombre) return '—';
  return nombre.split(' ').slice(0, 2).join(' ');
}

// Supabase devuelve como mucho 1000 filas por consulta: se pide por páginas.
async function haCargarTodo(consultaFn) {
  const filas = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consultaFn().range(desde, desde + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return filas;
}

async function haCargarDatos() {
  if (!agenciasCache.length || !tiendasCache.length) await cargarAgenciasYTiendas();
  if (typeof cargarGravedadMotivos === 'function') await cargarGravedadMotivos();

  const hoy = fechaLocalISO(new Date());

  const [informes, historial, programados, incidencias] = await Promise.all([
    haCargarTodo(() => sb.from('informes_diarios').select('id, fecha, informe_enviado, ajustes_puntuales').order('fecha')),
    haCargarTodo(() => sb.from('tienda_agencia_historial')
      .select('id, tienda_id, agencia_anterior_id, agencia_anterior_nombre, agencia_nueva_id, agencia_nueva_nombre, fecha_cambio, creado_por, creado_en')
      .order('fecha_cambio').order('creado_en').order('id')),
    haCargarTodo(() => sb.from('tienda_cambios_agencia_programados')
      .select('id, tienda_id, agencia_nueva_id, agencia_nueva_nombre, fecha_cambio, creado_por')
      .eq('estado', 'PENDIENTE').order('fecha_cambio')),
    haCargarTodo(() => sb.from('incidencias')
      .select('id, informe_id, tienda_id, motivo')
      .eq('marcada', true).eq('entrega', 'HABITUAL').order('id'))
  ]);

  const datosDesde = informes.length ? informes[0].fecha : hoy;

  // Informes enviados → fecha; y días en que una tienda recibió por otra
  // agencia por un cambio puntual (ajustes_puntuales con agencia).
  const fechaInformeEnviado = new Map();
  const puntualPorTienda = new Map(); // tienda_id → Set(fecha)
  informes.forEach(inf => {
    if (inf.informe_enviado) fechaInformeEnviado.set(inf.id, inf.fecha);
    Object.entries(inf.ajustes_puntuales || {}).forEach(([tid, aj]) => {
      if (aj?.agencia_id == null) return;
      const id = Number(tid);
      if (!puntualPorTienda.has(id)) puntualPorTienda.set(id, new Set());
      puntualPorTienda.get(id).add(inf.fecha);
    });
  });

  // Incidencias con código, por tienda → lista de fechas.
  const incPorTienda = new Map();
  incidencias.forEach(inc => {
    const fecha = fechaInformeEnviado.get(inc.informe_id);
    if (!fecha) return;
    if (!codigoDeMotivos(inc.motivo)) return;
    if (!incPorTienda.has(inc.tienda_id)) incPorTienda.set(inc.tienda_id, []);
    incPorTienda.get(inc.tienda_id).push(fecha);
  });

  const histPorTienda = new Map();
  historial.forEach(h => {
    if (!histPorTienda.has(h.tienda_id)) histPorTienda.set(h.tienda_id, []);
    histPorTienda.get(h.tienda_id).push(h);
  });
  const progPorTienda = new Map(programados.map(p => [p.tienda_id, p]));

  const tiendas = tiendasCache
    .filter(t => t.activo)
    .filter(t => !t.marca || t.marca === 'HABITUAL' || t.marca === 'SABADO') // como el Reporte mensual
    .map(t => {
      const alta = t.creado_en ? new Date(t.creado_en).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) : datosDesde;
      const inicio = alta > datosDesde ? alta : datosDesde;
      const tramos = haConstruirTramos(t, histPorTienda.get(t.id) || [], inicio, hoy);

      // Días en que recibió por otra agencia (no cuentan en su tramo).
      const otraAgencia = new Set(puntualPorTienda.get(t.id) || []);
      const sabadoOtra = t.sabado_agencia_id != null && t.sabado_agencia_id !== t.agencia_id;
      (incPorTienda.get(t.id) || []).forEach(fecha => {
        const tramo = tramos.find(tr => fecha >= tr.desde && fecha <= tr.hasta);
        if (!tramo) return;
        const esSabado = new Date(fecha + 'T00:00:00').getDay() === 6;
        if (otraAgencia.has(fecha) || (sabadoOtra && esSabado)) tramo.incOtra++;
        else tramo.inc++;
      });

      return {
        tienda: t,
        tramos,
        programado: progPorTienda.get(t.id) || null,
        numCambios: tramos.length - 1
      };
    });

  return { tiendas, datosDesde, hoy };
}

// Tramos [{agenciaId, agenciaNombre, desde, hasta, cambioPor, inc, incOtra}]
function haConstruirTramos(t, cambios, inicio, hoy) {
  const crudos = [];
  let agId = cambios.length ? cambios[0].agencia_anterior_id : t.agencia_id;
  let agNombre = cambios.length ? cambios[0].agencia_anterior_nombre : null;
  let desde = inicio;
  let cambioPor = null;

  cambios.forEach(c => {
    const fin = haSumarDias(c.fecha_cambio, -1);
    crudos.push({ agenciaId: agId, agenciaNombre: agNombre, desde, hasta: fin, cambioPor });
    agId = c.agencia_nueva_id;
    agNombre = c.agencia_nueva_nombre;
    desde = c.fecha_cambio > inicio ? c.fecha_cambio : inicio;
    cambioPor = c.creado_por;
  });
  // El último tramo llega hasta hoy con la agencia ACTUAL de la tienda.
  crudos.push({ agenciaId: t.agencia_id, agenciaNombre: agNombre, desde, hasta: hoy, cambioPor });

  // Fuera los tramos de 0 días (o anteriores a los datos) y se juntan los
  // tramos seguidos de la misma agencia.
  const tramos = [];
  crudos.forEach(tr => {
    if (tr.hasta < tr.desde) return;
    const previo = tramos[tramos.length - 1];
    if (previo && previo.agenciaId === tr.agenciaId) { previo.hasta = tr.hasta; return; }
    tramos.push({ ...tr, cambioPor: previo ? tr.cambioPor : null, inc: 0, incOtra: 0 });
  });
  if (!tramos.length) tramos.push({ agenciaId: t.agencia_id, agenciaNombre: null, desde: inicio, hasta: hoy, cambioPor: null, inc: 0, incOtra: 0 });
  return tramos;
}

async function renderVistaHistoricoAgencias() {
  const cont = document.getElementById('haLista');
  if (!cont || haCargando) return;
  haCargando = true;
  cont.innerHTML = `<div class="card"><div class="empty"><div class="glyph">⏳</div><h3>Cargando histórico…</h3></div></div>`;
  try {
    haDatos = await haCargarDatos();
    haRellenarSelectAgencias();
    haPintar();
  } catch (err) {
    console.error('Error cargando el histórico de agencias:', err);
    cont.innerHTML = `<div class="card"><div class="empty"><div class="glyph">⚠️</div><h3>NO SE PUDO CARGAR EL HISTÓRICO DE AGENCIAS</h3></div></div>`;
  } finally {
    haCargando = false;
  }
}

function haRellenarSelectAgencias() {
  const sel = document.getElementById('haFiltroAgencia');
  if (!sel) return;
  const previo = sel.value;
  sel.innerHTML = `<option value="">Todas las agencias</option>` +
    agenciasParaFiltro().map(a => `<option value="${a.id}">${escapeHtml(nombreAgenciaFiltro(a))}</option>`).join('');
  sel.value = previo;
}

function haTiendasFiltradas() {
  if (!haDatos) return [];
  const q = normalizarTextoBusqueda(haFiltroTexto);
  const agId = haFiltroAgencia ? Number(haFiltroAgencia) : null;
  return haDatos.tiendas
    .filter(x => !haSoloConCambios || x.numCambios > 0 || x.programado)
    .filter(x => !agId || x.tramos.some(tr => tr.agenciaId === agId) || x.programado?.agencia_nueva_id === agId)
    .filter(x => !q
      || normalizarTextoBusqueda(x.tienda.nombre).includes(q)
      || normalizarTextoBusqueda(x.tienda.numero_tienda).includes(q)
      || normalizarTextoBusqueda(x.tienda.provincia).includes(q))
    .sort((a, b) => {
      // Primero las que tienen algo programado, luego las que más han cambiado.
      const pa = a.programado ? 1 : 0, pb = b.programado ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (a.numCambios !== b.numCambios) return b.numCambios - a.numCambios;
      return a.tienda.nombre.localeCompare(b.tienda.nombre);
    });
}

function haPintar() {
  const cont = document.getElementById('haLista');
  if (!cont || !haDatos) return;

  const conCambios = haDatos.tiendas.filter(x => x.numCambios > 0);
  const totalCambios = conCambios.reduce((s, x) => s + x.numCambios, 0);
  const numProgramados = haDatos.tiendas.filter(x => x.programado).length;
  document.getElementById('haKpiTiendas').textContent = conCambios.length;
  document.getElementById('haKpiCambios').textContent = totalCambios;
  document.getElementById('haKpiProgramados').textContent = numProgramados;
  document.getElementById('haKpiDesde').textContent = haFechaLarga(haDatos.datosDesde);

  const lista = haTiendasFiltradas();
  if (!lista.length) {
    const hayFiltros = haFiltroTexto || haFiltroAgencia;
    cont.innerHTML = `
      <div class="card"><div class="empty">
        <div class="glyph">🔀</div>
        <h3>${hayFiltros ? 'Ninguna tienda coincide con los filtros' : 'Ninguna tienda ha cambiado de agencia todavía'}</h3>
        <p>${haSoloConCambios ? 'Desmarca "Solo tiendas con cambios" para ver todas las tiendas.' : ''}</p>
      </div></div>`;
    return;
  }
  cont.innerHTML = lista.map(haTarjetaHtml).join('');
}

function haTarjetaHtml(x) {
  const t = x.tienda;
  const hoy = haDatos.hoy;
  const ultimo = x.tramos[x.tramos.length - 1];
  const prog = x.programado;

  // Barra de tiempo: tramos reales proporcionales a sus días + el
  // programado (si hay) con un ancho fijo, rayado.
  const diasReales = x.tramos.reduce((s, tr) => s + haDiasEntre(tr.desde, tr.hasta), 0);
  const anchoFut = prog ? Math.max(Math.round(diasReales * 0.12), 1) : 0;
  const total = diasReales + anchoFut;
  let acumulado = 0;
  const marcas = [];
  const barra = x.tramos.map(tr => {
    const dias = haDiasEntre(tr.desde, tr.hasta);
    marcas.push({ pos: acumulado / total * 100, texto: haFechaCorta(tr.desde) });
    acumulado += dias;
    return `<span style="flex:${dias}; background:${haColorAgencia(tr.agenciaId)[0]};" title="${escapeHtml(haNombreAgencia(tr.agenciaId, tr.agenciaNombre))}: ${haFechaLarga(tr.desde)} – ${haFechaLarga(tr.hasta)}"></span>`;
  }).join('');
  const barraFut = prog
    ? `<span class="ha-fut" style="flex:${anchoFut}; --ha-c:${haColorAgencia(prog.agencia_nueva_id)[0]};" title="Programado: ${escapeHtml(haNombreAgencia(prog.agencia_nueva_id, prog.agencia_nueva_nombre))} desde el ${haFechaLarga(prog.fecha_cambio)}"></span>`
    : '';
  if (prog) marcas.push({ pos: diasReales / total * 100, texto: haFechaCorta(prog.fecha_cambio) });
  else marcas.push({ pos: 100, texto: 'Hoy', fin: true });
  // No pintar etiquetas que se pisen (tramos muy cortos).
  const marcasVisibles = [];
  marcas.forEach(m => {
    const previa = marcasVisibles[marcasVisibles.length - 1];
    if (previa && m.pos - previa.pos < 6) return;
    marcasVisibles.push(m);
  });

  const filas = [];
  x.tramos.forEach((tr, i) => {
    const esActual = i === x.tramos.length - 1;
    const dias = haDiasEntre(tr.desde, tr.hasta);
    const color = haColorAgencia(tr.agenciaId)[0];
    if (i > 0) {
      filas.push(`<div class="ha-flecha"><i>↓</i> Pasó a ${escapeHtml(haNombreAgencia(tr.agenciaId, tr.agenciaNombre))} a partir del ${haFechaLarga(tr.desde)}${tr.cambioPor ? ` · por ${escapeHtml(haNombreCorto(tr.cambioPor))}` : ''}</div>`);
    }
    const texto = esActual
      ? (x.tramos.length === 1 && tr.desde === haDatos.datosDesde
          ? `Está en ${haPillAgencia(tr.agenciaId, tr.agenciaNombre)} desde el <b>${haFechaLarga(tr.desde)}</b> (inicio de los datos)`
          : `Está en ${haPillAgencia(tr.agenciaId, tr.agenciaNombre)} desde el <b>${haFechaLarga(tr.desde)}</b>`)
      : `Ha estado en ${haPillAgencia(tr.agenciaId, tr.agenciaNombre)} desde el <b>${haFechaLarga(tr.desde)}</b> hasta el <b>${haFechaLarga(tr.hasta)}</b>`;
    const sub = [
      esActual ? 'Hasta hoy · agencia actual' : null,
      tr.incOtra ? `+${tr.incOtra} incidencia${tr.incOtra === 1 ? '' : 's'} con otra agencia (puntual o sábado), no incluida${tr.incOtra === 1 ? '' : 's'}` : null
    ].filter(Boolean).join(' · ');
    filas.push(`
      <div class="ha-tramo">
        <span class="ha-linea" style="background:${color};"></span>
        <div class="ha-txt">${texto}${sub ? `<small>${sub}</small>` : ''}</div>
        <div class="ha-dato"><b>${dias}</b><span>día${dias === 1 ? '' : 's'}</span></div>
        <div class="ha-dato ${tr.inc ? 'inc' : 'cero'}"><b>${tr.inc}</b><span>incidencia${tr.inc === 1 ? '' : 's'}</span></div>
      </div>`);
  });

  if (prog) {
    filas.push(`<div class="ha-flecha"><i>↓</i> Pasará a ${escapeHtml(haNombreAgencia(prog.agencia_nueva_id, prog.agencia_nueva_nombre))} a partir del ${haFechaLarga(prog.fecha_cambio)}${prog.creado_por ? ` · programado por ${escapeHtml(haNombreCorto(prog.creado_por))}` : ''}</div>`);
    filas.push(`
      <div class="ha-tramo ha-tramo-fut">
        <span class="ha-linea ha-linea-fut" style="--ha-c:${haColorAgencia(prog.agencia_nueva_id)[0]};"></span>
        <div class="ha-txt">Estará en ${haPillAgencia(prog.agencia_nueva_id, prog.agencia_nueva_nombre)} a partir del <b>${haFechaLarga(prog.fecha_cambio)}</b><small>Cambio programado · se aplica solo a las 00:05</small></div>
        <div class="ha-dato"><b>—</b><span>días</span></div>
        <div class="ha-dato"><b>—</b><span>incidencias</span></div>
      </div>`);
  }

  const etiquetaCambios = x.numCambios
    ? `<span class="pill leve">${x.numCambios} cambio${x.numCambios === 1 ? '' : 's'}</span>`
    : `<span class="pill leve">Sin cambios</span>`;

  return `
    <div class="card ha-card">
      <div class="ha-head">
        ${t.numero_tienda ? `<span class="ha-num">${escapeHtml(t.numero_tienda)}</span>` : ''}
        <span class="ha-nombre">${escapeHtml(t.nombre)}</span>
        ${t.provincia ? `<span class="ha-prov">${escapeHtml(t.provincia)}</span>` : ''}
        <div class="ha-head-derecha">
          <span class="ha-ahora">Ahora en</span>${haPillAgencia(ultimo.agenciaId, ultimo.agenciaNombre)}
          ${etiquetaCambios}
          ${prog ? `<span class="pill moderado">📅 1 programado</span>` : ''}
        </div>
      </div>
      <div class="ha-barra">${barra}${barraFut}</div>
      <div class="ha-eje">${marcasVisibles.map(m => `<span style="left:${m.pos}%;" class="${m.fin ? 'fin' : ''}">${m.texto}</span>`).join('')}</div>
      <div class="ha-tramos">${filas.join('')}</div>
    </div>`;
}

async function haExportarExcel() {
  if (!haDatos) return;
  if (typeof window.ExcelJS === 'undefined') {
    await modalAlert('NO SE PUDO CARGAR LA LIBRERÍA DE EXCEL. REVISA LA CONEXIÓN.', { titulo: 'Error' });
    return;
  }
  const lista = haTiendasFiltradas();
  const wb = new window.ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Histórico de agencias');
  hoja.columns = [
    { header: 'Nº', key: 'num', width: 8 },
    { header: 'Tienda', key: 'tienda', width: 26 },
    { header: 'Provincia', key: 'prov', width: 14 },
    { header: 'Agencia', key: 'agencia', width: 18 },
    { header: 'Desde', key: 'desde', width: 12 },
    { header: 'Hasta', key: 'hasta', width: 12 },
    { header: 'Días', key: 'dias', width: 8 },
    { header: 'Incidencias', key: 'inc', width: 12 },
    { header: 'Inc. con otra agencia', key: 'otra', width: 20 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Cambiado / programado por', key: 'por', width: 32 }
  ];
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12181F' } };

  lista.forEach(x => {
    x.tramos.forEach((tr, i) => {
      const esActual = i === x.tramos.length - 1;
      hoja.addRow({
        num: x.tienda.numero_tienda || '', tienda: x.tienda.nombre, prov: x.tienda.provincia || '',
        agencia: haNombreAgencia(tr.agenciaId, tr.agenciaNombre),
        desde: haFechaLarga(tr.desde), hasta: esActual ? 'Hoy' : haFechaLarga(tr.hasta),
        dias: haDiasEntre(tr.desde, tr.hasta), inc: tr.inc, otra: tr.incOtra,
        estado: esActual ? 'Actual' : 'Anterior', por: tr.cambioPor || ''
      });
    });
    if (x.programado) {
      const p = x.programado;
      const fila = hoja.addRow({
        num: x.tienda.numero_tienda || '', tienda: x.tienda.nombre, prov: x.tienda.provincia || '',
        agencia: haNombreAgencia(p.agencia_nueva_id, p.agencia_nueva_nombre),
        desde: haFechaLarga(p.fecha_cambio), hasta: '', dias: '', inc: '', otra: '',
        estado: 'Programado', por: p.creado_por || ''
      });
      fila.font = { italic: true, color: { argb: 'FF1B6DE0' } };
    }
  });
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: 'A1', to: 'K1' };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  descargarBlob(blob, `historico-agencias-${fechaLocalISO(new Date())}.xlsx`);
}

document.getElementById('haBuscador')?.addEventListener('input', (e) => { haFiltroTexto = e.target.value; haPintar(); });
document.getElementById('haFiltroAgencia')?.addEventListener('change', (e) => { haFiltroAgencia = e.target.value; haPintar(); });
document.getElementById('haSoloCambios')?.addEventListener('change', (e) => { haSoloConCambios = e.target.checked; haPintar(); });
document.getElementById('haBtnExportar')?.addEventListener('click', haExportarExcel);
document.getElementById('haBtnRecargar')?.addEventListener('click', (e) => {
  if (typeof recargarConGiro === 'function') recargarConGiro(e.currentTarget, renderVistaHistoricoAgencias);
  else renderVistaHistoricoAgencias();
});
