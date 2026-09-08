// js/reportes-mensuales.js
// ---------------------------------------------------------------
// Análisis · Reportes mensuales — el mismo cuadro que llevabais a mano en
// Excel (ENTREGAS MERCANCIA AGENCIA), pero calculado automáticamente a
// partir de las incidencias ya registradas en la app.
//
// Criterio de "OK": una tienda solo se pinta OK un día si ESE DÍA el
// informe diario llegó a enviarse (informes_diarios.informe_enviado =
// true) y no tuvo incidencia. Si el informe de ese día no existe o
// todavía no se ha enviado, la celda se deja en blanco (pendiente),
// nunca en OK.
//
// Cambios de agencia a mitad de mes: si una tienda cambió de agencia
// dentro del mes mostrado (tabla tienda_agencia_historial, rellenada por
// cambiarAgenciaTienda en tiendas.js), su fila se parte en dos: una bajo
// la agencia antigua con los días previos al cambio + una celda fusionada
// "Cambia a: X" en el resto del mes, y otra bajo la agencia nueva con una
// celda fusionada "Antes: Y" en los días previos + los días reales desde
// el cambio. Si hay más de un cambio en el mismo mes, se generan tantos
// tramos como haga falta.
//
// Cambios PUNTUALES de agencia (un solo día, desde "Utilidades" en el
// Informe del día — informes_diarios.ajustes_puntuales): se tratan igual
// que un cambio permanente pero de un solo día, así que la fila se parte
// también ese día concreto en un tramo de 1 día bajo la agencia puntual
// (con "Antes: X" / "Cambia a: X" a los lados), en vez de contar la
// incidencia en la fila de la agencia habitual. El resto del mes de esa
// tienda sigue con su agencia de siempre.
//
// Filtros: mismo diseño y comportamiento que el panel de "Filtrar
// incidencias" del Informe del día (misma estructura HTML/CSS, ver
// filtros-motivos.js) — Agencia, Tienda y "solo con incidencias este mes".
//
// Requiere (ya cargados antes): sb, escapeHtml, agenciasCache, tiendasCache,
// cargarAgenciasYTiendas, codigoDeMotivos, CODIGOS_INFORME (codigos-informe.js).
// Los .filtro-select (abrir/cerrar dropdown, buscador) ya quedan enganchados
// de forma genérica por filtros-motivos.js (document.querySelectorAll('.filtro-select')),
// así que no hace falta repetir esa parte aquí.
// ---------------------------------------------------------------

let rmAnio = new Date().getFullYear();
let rmMes = new Date().getMonth(); // 0 = enero
let rmInicializado = false;
let rmLeyendaPintada = false;

const rmFiltros = { agencias: new Set(), tiendas: new Set(), soloConIncidencias: false };

const RM_NOMBRES_MES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

function rmDiasDelMes(anio, mesIndex) {
  return new Date(anio, mesIndex + 1, 0).getDate();
}

async function rmCargarDatosMes(anio, mesIndex) {
  if (!agenciasCache.length) await cargarAgenciasYTiendas();

  const totalDias = rmDiasDelMes(anio, mesIndex);
  const desde = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-01`;
  const hasta = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${String(totalDias).padStart(2, '0')}`;

  const { data: informes, error: e1 } = await sb
    .from('informes_diarios')
    .select('id, fecha, informe_enviado, ajustes_puntuales')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (e1) throw e1;

  const fechaPorInforme = new Map((informes || []).map(i => [i.id, i.fecha]));

  // Cambios PUNTUALES de agencia (un solo día) registrados en
  // informes_diarios.ajustes_puntuales, agrupados por tienda: para cada
  // tienda, un mapa {dia -> {agenciaId, agenciaNombre}}.
  const puntualAgenciaPorTienda = new Map();
  (informes || []).forEach(inf => {
    const ajustes = inf.ajustes_puntuales;
    if (!ajustes || !Object.keys(ajustes).length) return;
    const dia = Number(inf.fecha.slice(8, 10));
    Object.entries(ajustes).forEach(([tiendaIdStr, aj]) => {
      if (aj.agencia_id == null) return; // este ajuste puntual solo cambió la hora, no la agencia
      const tiendaId = Number(tiendaIdStr);
      if (!puntualAgenciaPorTienda.has(tiendaId)) puntualAgenciaPorTienda.set(tiendaId, {});
      puntualAgenciaPorTienda.get(tiendaId)[dia] = { agenciaId: aj.agencia_id, agenciaNombre: aj.agencia_nombre || '—' };
    });
  });

  // Solo cuentan como "día resuelto" (con derecho a OK) los informes que
  // realmente se enviaron. El resto se queda en blanco, esté o no generado.
  const diasEnviados = new Set();
  (informes || []).forEach(i => {
    if (i.informe_enviado) diasEnviados.add(Number(i.fecha.slice(8, 10)));
  });

  const idsInformesEnviados = (informes || []).filter(i => i.informe_enviado).map(i => i.id);

  let incidencias = [];
  if (idsInformesEnviados.length) {
    const { data, error: e2 } = await sb
      .from('incidencias')
      .select('informe_id, tienda_id, motivo')
      .in('informe_id', idsInformesEnviados)
      .eq('marcada', true);
    if (e2) throw e2;
    incidencias = data || [];
  }

  // celdas[tienda_id][diaDelMes] = { codigo, label, color, texto }
  const celdas = {};
  incidencias.forEach(inc => {
    const fecha = fechaPorInforme.get(inc.informe_id);
    if (!fecha) return;
    const dia = Number(fecha.slice(8, 10));
    const codigo = codigoDeMotivos(inc.motivo);
    if (!codigo) return; // solo motivos pendientes de revisar: se queda en OK
    if (!celdas[inc.tienda_id]) celdas[inc.tienda_id] = {};
    celdas[inc.tienda_id][dia] = codigo;
  });

  // Cambios de agencia ocurridos DENTRO de este mes, agrupados por tienda
  // y ordenados por fecha, para poder partir su fila en tramos.
  const { data: cambios, error: e3 } = await sb
    .from('tienda_agencia_historial')
    .select('tienda_id, agencia_anterior_id, agencia_anterior_nombre, agencia_nueva_id, agencia_nueva_nombre, fecha_cambio')
    .gte('fecha_cambio', desde)
    .lte('fecha_cambio', hasta)
    .order('fecha_cambio', { ascending: true });
  if (e3) throw e3;

  const cambiosPorTienda = new Map();
  (cambios || []).forEach(c => {
    const dia = Number(c.fecha_cambio.slice(8, 10));
    if (!cambiosPorTienda.has(c.tienda_id)) cambiosPorTienda.set(c.tienda_id, []);
    cambiosPorTienda.get(c.tienda_id).push({
      dia,
      agenciaAnteriorId: c.agencia_anterior_id,
      agenciaAnteriorNombre: c.agencia_anterior_nombre || '—',
      agenciaNuevaId: c.agencia_nueva_id,
      agenciaNuevaNombre: c.agencia_nueva_nombre
    });
  });

  return { celdas, diasEnviados, totalDias, cambiosPorTienda, puntualAgenciaPorTienda };
}

// Agencia "habitual" de una tienda, día a día del mes (sin contar los
// cambios puntuales de un solo día), aplicando los cambios PERMANENTES
// de tienda_agencia_historial que haya dentro del mes.
function rmAgenciaHabitualPorDia(tienda, cambiosPermanentes, totalDias) {
  const agenciaActual = agenciasCache.find(a => a.id === tienda.agencia_id);
  const nombreActual = agenciaActual ? agenciaActual.nombre : '—';
  const porDia = new Array(totalDias + 1); // índice 1..totalDias

  if (!cambiosPermanentes || !cambiosPermanentes.length) {
    for (let d = 1; d <= totalDias; d++) porDia[d] = { agenciaId: tienda.agencia_id, agenciaNombre: nombreActual };
    return porDia;
  }

  let dia = 1;
  let agId = cambiosPermanentes[0].agenciaAnteriorId;
  let agNombre = cambiosPermanentes[0].agenciaAnteriorNombre;
  cambiosPermanentes.forEach(c => {
    for (; dia < c.dia; dia++) porDia[dia] = { agenciaId: agId, agenciaNombre: agNombre };
    agId = c.agenciaNuevaId;
    agNombre = c.agenciaNuevaNombre;
  });
  for (; dia <= totalDias; dia++) porDia[dia] = { agenciaId: tienda.agencia_id, agenciaNombre: nombreActual };
  return porDia;
}

// Para una tienda, calcula los tramos en los que se parte su fila,
// combinando los cambios PERMANENTES de agencia (tienda_agencia_historial)
// con los cambios PUNTUALES de un solo día (Utilidades → informes_diarios.
// ajustes_puntuales): un cambio puntual de agencia ese día "gana" a la
// agencia habitual y genera su propio tramo de 1 día, exactamente igual
// que si fuera un cambio permanente de ida y vuelta en un solo día.
function rmSegmentosDeTienda(tienda, cambiosPermanentes, puntualPorDia, totalDias) {
  const habitual = rmAgenciaHabitualPorDia(tienda, cambiosPermanentes, totalDias);

  // Agencia EFECTIVA día a día: la puntual si hay una ese día, si no la habitual.
  const efectivo = new Array(totalDias + 1);
  for (let d = 1; d <= totalDias; d++) {
    const pun = puntualPorDia && puntualPorDia[d];
    efectivo[d] = pun ? { agenciaId: pun.agenciaId, agenciaNombre: pun.agenciaNombre } : habitual[d];
  }

  // Compactamos días consecutivos con la misma agencia efectiva en tramos.
  const segmentos = [];
  let diaInicio = 1;
  for (let d = 2; d <= totalDias + 1; d++) {
    const finDelMes = d > totalDias;
    if (finDelMes || efectivo[d].agenciaId !== efectivo[diaInicio].agenciaId) {
      segmentos.push({
        agenciaId: efectivo[diaInicio].agenciaId,
        agenciaNombre: efectivo[diaInicio].agenciaNombre,
        diaInicio,
        diaFin: d - 1
      });
      diaInicio = d;
    }
  }

  return segmentos;
}

// Agrupa TODAS las filas/tramos (sin filtrar) por tienda. Se usa para
// etiquetar los bloques "Antes:"/"Cambia a:" de cada tramo con el resto
// de tramos REALES de esa misma tienda (aunque alguno pertenezca a una
// agencia que ahora mismo esté filtrada, o a otro grupo en el envío por
// agencias), y así el rango de días de cada bloque sea siempre exacto —
// nunca "Cambia a: X" para unos días en los que en realidad ya se había
// vuelto a Y (caso típico de un cambio puntual de un solo día).
function rmSegmentosPorTienda(todasLasFilas) {
  const mapa = new Map();
  todasLasFilas.forEach(f => {
    if (!mapa.has(f.tiendaId)) mapa.set(f.tiendaId, []);
    mapa.get(f.tiendaId).push(f);
  });
  // todasLasFilas viene ordenado por nombre de AGENCIA (para el orden de
  // las filas visibles en la tabla/PDF), así que si una misma tienda tiene
  // tramos en varias agencias distintas (p. ej. RHENUS → TXT puntual →
  // RHENUS), ese orden NO es cronológico. Aquí se reordena cada tienda por
  // diaInicio, para que los bloques "Antes:"/"Cambia a:" salgan siempre en
  // el orden real en que ocurrieron.
  mapa.forEach(segmentos => segmentos.sort((a, b) => a.diaInicio - b.diaInicio));
  return mapa;
}

// Todas las filas posibles (una por tramo de tienda), sobre el listado
// COMPLETO (sin filtrar), para no depender de qué filtros haya activos.
function rmConstruirTodasLasFilas(cambiosPorTienda, puntualAgenciaPorTienda, totalDias) {
  const todas = [];
  tiendasCache.forEach(t => {
    const cambios = cambiosPorTienda.get(t.id);
    const puntualPorDia = puntualAgenciaPorTienda.get(t.id);
    const segmentos = rmSegmentosDeTienda(t, cambios, puntualPorDia, totalDias);
    segmentos.forEach(seg => {
      todas.push({
        agenciaId: seg.agenciaId,
        agenciaNombre: seg.agenciaNombre,
        tiendaId: t.id,
        tiendaNombre: t.nombre,
        tiendaProvincia: t.provincia || null,
        diaInicio: seg.diaInicio,
        diaFin: seg.diaFin,
        nombreAnterior: seg.nombreAnterior,
        nombreSiguiente: seg.nombreSiguiente
      });
    });
  });
  todas.sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre) || a.tiendaNombre.localeCompare(b.tiendaNombre) || a.diaInicio - b.diaInicio);
  return todas;
}

function rmFilasSegunFiltros(todasLasFilas) {
  return todasLasFilas.filter(f =>
    (!rmFiltros.agencias.size || rmFiltros.agencias.has(f.agenciaId)) &&
    (!rmFiltros.tiendas.size || rmFiltros.tiendas.has(f.tiendaId))
  );
}

// Se pinta UNA sola vez (la leyenda es fija) en la barra superior.
function rmPintarLeyendaCompacta() {
  if (rmLeyendaPintada) return;
  const cont = document.getElementById('rmLeyendaCompacta');
  if (!cont) return;
  cont.innerHTML = CODIGOS_INFORME.map(c => `
    <span class="rm-leyenda-item">
      <span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};">${escapeHtml(c.codigo)}</span>
      <span>${escapeHtml(c.label)}</span>
    </span>`).join('');
  rmLeyendaPintada = true;
}

// ---------------------------------------------------------------
// Panel de filtros (mismo diseño que "Filtrar incidencias" del
// Informe del día): Agencia, Tienda y "solo con incidencias este mes".
// ---------------------------------------------------------------
function rmConstruirPanelFiltros() {
  const listaAg = document.getElementById('rmFiltrosAgenciasLista');
  const listaTd = document.getElementById('rmFiltrosTiendasLista');
  if (!listaAg || !listaTd) return;

  if (!listaAg.dataset.built) {
    listaAg.innerHTML = agenciasCache.map(ag => `
      <label class="filtro-check">
        <input type="checkbox" value="${ag.id}" data-filtro="agencia">
        <span>${escapeHtml(ag.nombre)}</span>
      </label>`).join('');
    listaAg.dataset.built = '1';
  }
  if (!listaTd.dataset.built) {
    listaTd.innerHTML = tiendasCache.map(t => `
      <label class="filtro-check">
        <input type="checkbox" value="${t.id}" data-filtro="tienda">
        <span>${escapeHtml(t.nombre)}</span>
      </label>`).join('');
    listaTd.dataset.built = '1';
  }

  const panel = document.getElementById('rmFiltrosPanel');
  if (!panel.dataset.wired) {
    panel.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"]')) return;
      if (cb.id === 'rmFiltroSoloConIncidencias') {
        rmFiltros.soloConIncidencias = cb.checked;
        rmActualizarBadgeFiltros();
        rmRender();
        return;
      }
      const grupo = cb.dataset.filtro;
      const set = grupo === 'agencia' ? rmFiltros.agencias : rmFiltros.tiendas;
      const val = Number(cb.value);
      if (cb.checked) set.add(val); else set.delete(val);
      rmActualizarBadgeFiltros();
      rmActualizarValoresSelects();
      rmRender();
    });
    panel.dataset.wired = '1';
  }
}

function rmActualizarValoresSelects() {
  document.querySelectorAll('#rmFiltrosPanel .filtro-select').forEach(sel => {
    const grupo = sel.dataset.grupo;
    const set = grupo === 'agencia' ? rmFiltros.agencias : rmFiltros.tiendas;
    const valor = sel.querySelector('.filtro-select-valor');
    if (set.size === 0) {
      valor.textContent = 'Todas';
      sel.classList.remove('activo');
    } else if (set.size === 1) {
      const cb = sel.querySelector('input[type="checkbox"]:checked');
      valor.textContent = cb ? cb.closest('.filtro-check').textContent.trim() : '1 seleccionada';
      sel.classList.add('activo');
    } else {
      valor.textContent = `${set.size} seleccionadas`;
      sel.classList.add('activo');
    }
  });
}

function rmActualizarBadgeFiltros() {
  const total = rmFiltros.agencias.size + rmFiltros.tiendas.size + (rmFiltros.soloConIncidencias ? 1 : 0);
  const badge = document.getElementById('rmFiltrosCount');
  const btn = document.getElementById('btnRmFiltros');
  if (total > 0) {
    badge.textContent = total;
    badge.style.display = '';
    btn.classList.add('activo');
  } else {
    badge.style.display = 'none';
    btn.classList.remove('activo');
  }
}

function rmPosicionarFiltrosPanel() {
  const btn = document.getElementById('btnRmFiltros');
  const panel = document.getElementById('rmFiltrosPanel');
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
}

function rmAbrirFiltrosPanel() {
  rmPosicionarFiltrosPanel();
  document.getElementById('rmFiltrosPanel').classList.add('show');
  document.getElementById('btnRmFiltros').classList.add('open');
}
function rmCerrarFiltrosPanel() {
  document.getElementById('rmFiltrosPanel').classList.remove('show');
  document.getElementById('btnRmFiltros').classList.remove('open');
  if (typeof cerrarTodosLosSelects === 'function') cerrarTodosLosSelects(null);
}

function rmEngancharFiltros() {
  const btn = document.getElementById('btnRmFiltros');
  const panel = document.getElementById('rmFiltrosPanel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.classList.contains('show')) rmCerrarFiltrosPanel();
    else rmAbrirFiltrosPanel();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) rmCerrarFiltrosPanel();
  });
  window.addEventListener('resize', () => {
    if (panel.classList.contains('show')) rmPosicionarFiltrosPanel();
  });

  document.getElementById('btnRmCerrarFiltros').addEventListener('click', rmCerrarFiltrosPanel);
  document.getElementById('btnRmLimpiarFiltros').addEventListener('click', () => {
    rmFiltros.agencias.clear();
    rmFiltros.tiendas.clear();
    rmFiltros.soloConIncidencias = false;
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    rmActualizarBadgeFiltros();
    rmActualizarValoresSelects();
    rmRender();
  });
}

// Construye las celdas de un tramo: un bloque fusionado "Antes: X" por
// cada tramo real anterior de esta misma tienda (puede haber varios: p.
// ej. un cambio permanente y luego un cambio puntual de otro día), las
// celdas normales entre diaInicio y diaFin, y un bloque "Cambia a: Y" por
// cada tramo real posterior. Cada bloque usa el rango de días exacto de
// SU tramo, así que un cambio puntual que se revierte al día siguiente
// nunca deja un bloque "Cambia a" mal etiquetado para el resto del mes.
function rmCeldasDeTramo(f, segmentosTienda, celdasTienda, diasEnviados, totalDias) {
  const partes = [];
  let totalIncidencias = 0;

  segmentosTienda
    .filter(s => s.diaFin < f.diaInicio)
    .forEach(s => {
      const dias = s.diaFin - s.diaInicio + 1;
      partes.push(`<td colspan="${dias}" class="rm-td-cambio">Antes: ${escapeHtml(s.agenciaNombre)}</td>`);
    });

  for (let dia = f.diaInicio; dia <= f.diaFin; dia++) {
    if (!diasEnviados.has(dia)) { partes.push(`<td class="rm-td-pendiente" title="Informe no enviado ese día">–</td>`); continue; }
    const c = celdasTienda[dia];
    if (!c) { partes.push(`<td class="rm-td-ok">OK</td>`); continue; }
    totalIncidencias++;
    partes.push(`<td><span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};" title="${escapeHtml(c.label)}">${escapeHtml(c.codigo)}</span></td>`);
  }

  segmentosTienda
    .filter(s => s.diaInicio > f.diaFin)
    .forEach(s => {
      const dias = s.diaFin - s.diaInicio + 1;
      partes.push(`<td colspan="${dias}" class="rm-td-cambio">Cambia a: ${escapeHtml(s.agenciaNombre)}</td>`);
    });

  return { html: partes.join(''), totalIncidencias };
}

// ---------------------------------------------------------------
// Render de la tabla
// ---------------------------------------------------------------
async function rmRender() {
  const cont = document.getElementById('contenidoReportesMensuales');
  cont.innerHTML = `<div class="card"><div class="empty"><p>Cargando…</p></div></div>`;

  let datos;
  try {
    datos = await rmCargarDatosMes(rmAnio, rmMes);
  } catch (err) {
    console.error('Error cargando el reporte mensual:', err);
    cont.innerHTML = `<div class="card"><div class="empty"><p>No se pudo cargar el reporte de este mes.</p></div></div>`;
    return;
  }

  rmConstruirPanelFiltros();

  const { celdas, diasEnviados, totalDias, cambiosPorTienda, puntualAgenciaPorTienda } = datos;
  const todasLasFilas = rmConstruirTodasLasFilas(cambiosPorTienda, puntualAgenciaPorTienda, totalDias);
  const segmentosPorTienda = rmSegmentosPorTienda(todasLasFilas);
  const filas = rmFilasSegunFiltros(todasLasFilas);
  const cabeceraDias = Array.from({ length: totalDias }, (_, i) => `<th>${i + 1}</th>`).join('');

  const filasConDatos = filas.map(f => {
    const celdasTienda = celdas[f.tiendaId] || {};
    const segmentosTienda = segmentosPorTienda.get(f.tiendaId) || [f];
    const { html, totalIncidencias } = rmCeldasDeTramo(f, segmentosTienda, celdasTienda, diasEnviados, totalDias);
    return { f, html, totalIncidencias };
  });

  const filasVisibles = rmFiltros.soloConIncidencias
    ? filasConDatos.filter(x => x.totalIncidencias > 0)
    : filasConDatos;

  const filasHtml = filasVisibles.map(({ f, html, totalIncidencias }) => `
    <tr>
      <td class="rm-col-fija">${escapeHtml(f.agenciaNombre)}</td>
      <td class="rm-col-fija">${escapeHtml(f.tiendaNombre)}</td>
      <td class="rm-col-fija">${f.tiendaProvincia ? escapeHtml(f.tiendaProvincia) : '—'}</td>
      ${html}
      <td class="rm-col-total"><b>${totalIncidencias}</b></td>
    </tr>`).join('');

  cont.innerHTML = `
    <div class="card" style="padding:0; overflow-x:auto;">
      <table class="tabla-reporte-mensual">
        <thead>
          <tr>
            <th>Agencia</th><th>Tienda</th><th>Provincia</th>
            ${cabeceraDias}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${filasHtml || `<tr><td colspan="${totalDias + 4}" style="text-align:center; padding:30px;">Sin tiendas para estos filtros.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function rmActualizarCabecera() {
  document.getElementById('rmMesTexto').textContent = `${RM_NOMBRES_MES[rmMes]} ${rmAnio}`;
}

// Se llama desde el dropdown de Análisis (ver navegacion.js) cada vez que
// se entra en la vista; solo engancha los botones la primera vez.
function renderVistaReportesMensuales() {
  rmPintarLeyendaCompacta();

  if (rmInicializado) return;
  rmInicializado = true;

  document.getElementById('rmBtnMesAnterior').addEventListener('click', () => {
    rmMes--; if (rmMes < 0) { rmMes = 11; rmAnio--; }
    rmActualizarCabecera();
    rmRender();
  });
  document.getElementById('rmBtnMesSiguiente').addEventListener('click', () => {
    rmMes++; if (rmMes > 11) { rmMes = 0; rmAnio++; }
    rmActualizarCabecera();
    rmRender();
  });
  document.getElementById('rmBtnMesActual').addEventListener('click', () => {
    const hoy = new Date();
    rmAnio = hoy.getFullYear(); rmMes = hoy.getMonth();
    rmActualizarCabecera();
    rmRender();
  });

  rmEngancharFiltros();

  rmActualizarCabecera();
  rmRender();
}
