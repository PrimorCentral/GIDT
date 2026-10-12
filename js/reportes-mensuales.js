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
// BAJAS de tiendas (tabla tienda_bajas, ver tiendas.js): los días en que
// una tienda estuvo de baja (no recibía mercancía) se pintan como celda
// gris "BAJA" — sin OK y sin contar en el Total. Si ese día había una
// incidencia registrada, se muestra la incidencia igualmente. Una tienda
// ELIMINADA se pinta igual desde su fecha de eliminación hasta fin de ese
// mes, y ya no aparece en los meses siguientes; los meses anteriores a
// la eliminación quedan exactamente como estaban.
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
// Informe enviado de cada día del mes en pantalla: dia → { id, fecha, enviadoEn }.
// Lo usa el panel "Detalle" de la barra lateral al pulsar una celda.
let rmInformesPorDia = new Map();

// motivos = códigos del reporte (CODIGOS_INFORME[].codigo, p. ej. '7', 'F').
const rmFiltros = { agencias: new Set(), tiendas: new Set(), motivos: new Set(), soloConIncidencias: false };

// Filtro de Motivo: devuelve una copia de `celdas` en la que los días con
// un código que NO está entre los elegidos quedan marcados como
// ocultoPorMotivo (se pintan vacíos y no cuentan en el TOTAL). Sin
// motivos elegidos devuelve `celdas` tal cual. Lo usan la pantalla y
// Exportar (con "usar filtro activo"); el envío a agencias, nunca.
function rmCeldasSegunMotivo(celdas) {
  if (!rmFiltros.motivos.size) return celdas;
  const res = {};
  Object.keys(celdas || {}).forEach(tiendaId => {
    const porDia = celdas[tiendaId] || {};
    const copia = {};
    Object.keys(porDia).forEach(dia => {
      const c = porDia[dia];
      copia[dia] = (c && !rmFiltros.motivos.has(String(c.codigo))) ? { ...c, ocultoPorMotivo: true } : c;
    });
    res[tiendaId] = copia;
  });
  return res;
}

const RM_NOMBRES_MES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

function rmDiasDelMes(anio, mesIndex) {
  return new Date(anio, mesIndex + 1, 0).getDate();
}

// Domingos: no suele haber entrega/informe ese día salvo que sea puntual
// (esos casos sí llevan diasEnviados.has(dia) y se pintan con su código o
// "OK" normalmente). Se usa tanto en la tabla en pantalla como en el PDF
// para distinguir "domingo sin entrega habitual" de un informe realmente
// pendiente entre semana.
function rmEsDomingo(anio, mesIndex, dia) {
  return new Date(anio, mesIndex, dia).getDay() === 0;
}

// Tiendas de marca SÁBADO (solo reciben los sábados): el resto de días la
// fila se pinta en gris como un domingo, sin OK y sin contar en el Total.
// Devuelve el motivo (texto para el tooltip) o null si ese día sí entrega.
function rmMotivoSinEntregaTienda(tiendaId, anio, mesIndex, dia) {
  const t = tiendasCache.find(x => x.id === tiendaId);
  if (!t || t.marca !== 'SABADO') return null;
  return new Date(anio, mesIndex, dia).getDay() === 6 ? null : 'Tienda de sábado — solo entrega los sábados';
}

// "Entrega de sábado" (tiendas.sabado_agencia_id / sabado_hora): una sola
// ficha de tienda que los sábados entrega otra agencia. En el reporte se
// trata como un cambio puntual de agencia que se repite cada sábado: sus
// sábados van a una fila propia bajo la agencia de sábado (con el
// redondel "S", f.esSabado) y en la fila habitual esos días llevan las 3 primeras letras de esa agencia (p.ej. SEY).
function rmTieneEntregaSabado(t) {
  return !!t && t.sabado_agencia_id != null && t.sabado_agencia_id !== t.agencia_id;
}

// Solo las tiendas de marca HABITUAL y SÁBADO entran en el Reporte mensual
// (pantalla, PDF y envío a agencias). Las de marca PRUEBA y ESPECIAL no
// salen: ni fila, ni OK, ni incidencias. Las tiendas sin marca se tratan
// como habituales.
function rmMarcaEntraEnReporte(t) {
  return !t.marca || t.marca === 'HABITUAL' || t.marca === 'SABADO';
}

// ¿La fila lleva el redondel "S" delante de la agencia? Sí en las tiendas
// de marca Sábado y en las filas de "Entrega de sábado".
function rmFilaEsDeSabado(f) {
  if (f.esSabado) return true;
  const t = tiendasCache.find(x => x.id === f.tiendaId);
  return !!t && t.marca === 'SABADO';
}
// Redondel "S" (el mismo de marca Sábado del Informe del día).
function rmBadgeSabadoHtml(f) {
  if (!rmFilaEsDeSabado(f) || typeof badgeMarcaHtml !== 'function') return '';
  return badgeMarcaHtml('SABADO');
}

// Primer día del mes en que cada tienda "existe" (según tiendas.creado_en,
// en hora de Madrid): tiendaId → nº de día. 1 = existía ya todo el mes;
// totalDias + 1 = todavía no existía en este mes. Lo rellena
// rmCargarDatosMes() y lo leen la tabla en pantalla y el PDF, para no
// pintar "OK" en los días anteriores a que se diera de alta la tienda.
let rmPrimerDiaPorTienda = new Map();
function rmPrimerDiaTienda(tiendaId) {
  return rmPrimerDiaPorTienda.get(tiendaId) || 1;
}

// Días del mes (nº de día) en los que cada tienda está de baja:
// tiendaId → Set<dia>. Lo rellena rmCargarDatosMes() y lo leen la tabla en
// pantalla y el PDF (igual que rmPrimerDiaPorTienda).
let rmDiasBajaPorTienda = new Map();
function rmDiaEnBaja(tiendaId, dia) {
  const dias = rmDiasBajaPorTienda.get(tiendaId);
  return !!dias && dias.has(dia);
}
// Tiendas eliminadas ANTES de este mes: no se dibujan.
let rmTiendasOcultasMes = new Set();

async function rmCargarDatosMes(anio, mesIndex) {
  if (!agenciasCache.length) await cargarAgenciasYTiendas();

  // El código de cada celda depende de la gravedad/orden configurados en
  // Configuración → Gravedad de motivos (codigoDeMotivos → severidad).
  // Se recarga siempre antes de calcular, para no depender de si la caché
  // llegó a cargarse en esta sesión (tras un login nuevo no se cargaba y
  // se usaba el respaldo hardcodeado → distinto código según el PC) ni
  // quedarse con una versión antigua si alguien la cambió después.
  if (typeof cargarGravedadMotivos === 'function') await cargarGravedadMotivos();

  const totalDias = rmDiasDelMes(anio, mesIndex);
  const desde = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-01`;
  const hasta = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${String(totalDias).padStart(2, '0')}`;

  const { data: informes, error: e1 } = await sb
    .from('informes_diarios')
    .select('id, fecha, informe_enviado, informe_enviado_en, ajustes_puntuales')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (e1) throw e1;

  const fechaPorInforme = new Map((informes || []).map(i => [i.id, i.fecha]));

  // Fecha de alta de cada tienda → primer día del mes que le corresponde.
  const { data: altasTiendas, error: eAlta } = await sb.from('tiendas').select('id, creado_en');
  if (eAlta) throw eAlta;
  rmPrimerDiaPorTienda = new Map();
  (altasTiendas || []).forEach(t => {
    if (!t.creado_en) return;
    const alta = new Date(t.creado_en).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // AAAA-MM-DD
    let primerDia = 1;
    if (alta > hasta) primerDia = totalDias + 1;
    else if (alta >= desde) primerDia = Number(alta.slice(8, 10));
    rmPrimerDiaPorTienda.set(t.id, primerDia);
  });

  // Bajas de tiendas (tienda_bajas). Si la consulta falla (p. ej. la tabla
  // aún no existe) el reporte sigue funcionando como antes, sin bajas.
  rmDiasBajaPorTienda = new Map();
  rmTiendasOcultasMes = new Set();
  const { data: bajas, error: eBajas } = await sb
    .from('tienda_bajas')
    .select('tienda_id, tipo, fecha_desde, fecha_reactivacion');
  if (eBajas) console.error('No se pudieron cargar las bajas de tiendas:', eBajas);

  const marcarDiasBaja = (tiendaId, ini, fin) => {
    if (!rmDiasBajaPorTienda.has(tiendaId)) rmDiasBajaPorTienda.set(tiendaId, new Set());
    const set = rmDiasBajaPorTienda.get(tiendaId);
    for (let d = ini; d <= fin; d++) set.add(d);
  };

  (bajas || []).forEach(b => {
    // Eliminada antes de que empiece este mes: la fila ya no se dibuja.
    if (b.tipo === 'ELIMINADA' && b.fecha_desde < desde) { rmTiendasOcultasMes.add(b.tienda_id); return; }
    if (b.fecha_desde > hasta) return; // empieza después de este mes
    if (b.fecha_reactivacion && b.fecha_reactivacion <= desde) return; // ya había vuelto antes de este mes
    const ini = b.fecha_desde > desde ? Number(b.fecha_desde.slice(8, 10)) : 1;
    const fin = (b.fecha_reactivacion && b.fecha_reactivacion <= hasta)
      ? Number(b.fecha_reactivacion.slice(8, 10)) - 1 // el día de alta ya cuenta como activa
      : totalDias;
    marcarDiasBaja(b.tienda_id, ini, fin);
  });

  // Tiendas eliminadas antes de existir tienda_bajas (sin fecha de
  // eliminación conocida): todo el mes en gris, sin OK.
  const conFilaEliminada = new Set((bajas || []).filter(b => b.tipo === 'ELIMINADA').map(b => b.tienda_id));
  tiendasCache.filter(t => !t.activo && !conFilaEliminada.has(t.id)).forEach(t => marcarDiasBaja(t.id, 1, totalDias));

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

  // "Entrega de sábado": cada sábado del mes cuenta como un cambio puntual
  // a la agencia de sábado (marcado esSabado). No se añade si ese sábado ya
  // tiene un cambio puntual real, si la tienda estaba de baja o si aún no
  // estaba dada de alta (esos días se pintan como siempre en su fila).
  tiendasCache.forEach(t => {
    if (!rmTieneEntregaSabado(t)) return;
    const ag = agenciasCache.find(a => a.id === t.sabado_agencia_id);
    for (let dia = 1; dia <= totalDias; dia++) {
      if (new Date(anio, mesIndex, dia).getDay() !== 6) continue;
      if (rmDiaEnBaja(t.id, dia) || dia < rmPrimerDiaTienda(t.id)) continue;
      if (!puntualAgenciaPorTienda.has(t.id)) puntualAgenciaPorTienda.set(t.id, {});
      const mapa = puntualAgenciaPorTienda.get(t.id);
      if (mapa[dia]) continue;
      mapa[dia] = { agenciaId: t.sabado_agencia_id, agenciaNombre: ag ? ag.nombre : '—', esSabado: true };
    }
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
      .eq('marcada', true)
      // Las entregas de prueba y especiales no cuentan en el reporte mensual.
      .eq('entrega', 'HABITUAL');
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

  // Informe ENVIADO de cada día (para el panel de detalle de la barra lateral).
  const informesPorDia = new Map();
  (informes || []).forEach(i => {
    if (i.informe_enviado) informesPorDia.set(Number(i.fecha.slice(8, 10)), { id: i.id, fecha: i.fecha, enviadoEn: i.informe_enviado_en });
  });

  return { celdas, diasEnviados, totalDias, cambiosPorTienda, puntualAgenciaPorTienda, informesPorDia };
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

// Para una tienda, calcula los tramos "normales" en los que se parte su
// fila SOLO por cambios PERMANENTES de agencia (tienda_agencia_historial).
// Los cambios puntuales de un solo día NO parten esta fila — se tratan
// aparte (ver rmFilasPuntualesDeTienda), así que la agencia habitual
// siempre queda en una única fila por tramo permanente.
function rmSegmentosDeTienda(tienda, cambiosPermanentes, totalDias) {
  const habitual = rmAgenciaHabitualPorDia(tienda, cambiosPermanentes, totalDias);

  const segmentos = [];
  let diaInicio = 1;
  for (let d = 2; d <= totalDias + 1; d++) {
    const finDelMes = d > totalDias;
    if (finDelMes || habitual[d].agenciaId !== habitual[diaInicio].agenciaId) {
      segmentos.push({
        agenciaId: habitual[diaInicio].agenciaId,
        agenciaNombre: habitual[diaInicio].agenciaNombre,
        diaInicio,
        diaFin: d - 1
      });
      diaInicio = d;
    }
  }
  return segmentos;
}

// Filas EXTRA de cambios puntuales de agencia: UNA sola fila por cada
// agencia puntual distinta de la tienda en el mes, con TODOS sus días
// (consecutivos o no — p. ej. HOZ con SEYLOTRANS el 19 y el 26 sale en
// una única fila "SEYLOTRANS puntual"). esPuntual:true — no forma parte
// del tramo habitual de la tienda. diasPuntuales guarda los días propios;
// diaInicio/diaFin son el primero y el último (para ordenar/filtrar).
function rmFilasPuntualesDeTienda(puntualPorDia) {
  if (!puntualPorDia) return [];
  const dias = Object.keys(puntualPorDia).map(Number).sort((a, b) => a - b);
  const porAgencia = new Map();
  dias.forEach(dia => {
    const pun = puntualPorDia[dia];
    // Los sábados de "Entrega de sábado" van en su propia fila (esSabado),
    // separada de los cambios puntuales reales a esa misma agencia.
    const clave = `${pun.agenciaId}|${pun.esSabado ? 'S' : 'P'}`;
    let fila = porAgencia.get(clave);
    if (!fila) {
      fila = { agenciaId: pun.agenciaId, agenciaNombre: pun.agenciaNombre, diaInicio: dia, diaFin: dia, diasPuntuales: [], esPuntual: true, esSabado: !!pun.esSabado };
      porAgencia.set(clave, fila);
    }
    fila.diasPuntuales.push(dia);
    fila.diaFin = dia;
  });
  return [...porAgencia.values()];
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

// Todas las filas posibles (tramos permanentes + filas puntuales), sobre
// el listado COMPLETO (sin filtrar), para no depender de qué filtros haya
// activos.
function rmConstruirTodasLasFilas(cambiosPorTienda, puntualAgenciaPorTienda, totalDias) {
  const todas = [];
  tiendasCache.forEach(t => {
    if (rmTiendasOcultasMes.has(t.id)) return; // eliminada antes de este mes
    if (!rmMarcaEntraEnReporte(t)) return; // marca Prueba / Especial: no salen en el reporte
    const cambios = cambiosPorTienda.get(t.id);
    const puntualPorDia = puntualAgenciaPorTienda.get(t.id);
    const segmentosPermanentes = rmSegmentosDeTienda(t, cambios, totalDias);
    const filasPuntuales = rmFilasPuntualesDeTienda(puntualPorDia);

    [...segmentosPermanentes, ...filasPuntuales].forEach(seg => {
      todas.push({
        agenciaId: seg.agenciaId,
        agenciaNombre: seg.agenciaNombre,
        tiendaId: t.id,
        tiendaNombre: t.nombre,
        tiendaProvincia: t.provincia || null,
        diaInicio: seg.diaInicio,
        diaFin: seg.diaFin,
        esPuntual: !!seg.esPuntual,
        esSabado: !!seg.esSabado,
        diasPuntuales: seg.diasPuntuales ? new Set(seg.diasPuntuales) : null
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

// Leyenda de la barra lateral. Con `conteo` (código → nº de veces que
// sale en la tabla tal como se ve, con los filtros aplicados) cada chip
// muestra su recuento y los códigos que no salen este mes se atenúan.
// Sin `conteo` (mientras carga) se pinta sin números.
function rmPintarLeyendaCompacta(conteo) {
  const cont = document.getElementById('rmLeyendaCompacta');
  if (!cont) return;
  const conNumeros = !!conteo;
  cont.innerHTML = CODIGOS_INFORME.map(c => {
    const n = conNumeros ? (conteo[c.codigo] || 0) : 0;
    return `
    <span class="rm-leyenda-item${conNumeros && !n ? ' rm-leyenda-cero' : ''}">
      <span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};">${escapeHtml(c.codigo)}</span>
      <span>${escapeHtml(c.label)}</span>${conNumeros ? `<span class="rm-leyenda-num">${n}</span>` : ''}
    </span>`;
  }).join('') + `
    <span class="rm-leyenda-item">
      <span class="rm-celda-codigo" style="background:#E1E4E8; color:#5A6473;">BAJA</span>
      <span>Tienda de baja (sin recepción de mercancía)</span>
    </span>`;
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
    listaAg.innerHTML = agenciasParaFiltro().map(ag => `
      <label class="filtro-check">
        <input type="checkbox" value="${ag.id}" data-filtro="agencia">
        <span>${escapeHtml(nombreAgenciaFiltro(ag))}</span>
      </label>`).join('');
    listaAg.dataset.built = '1';
  }
  if (!listaTd.dataset.built) {
    listaTd.innerHTML = tiendasCache.filter(rmMarcaEntraEnReporte).map(t => `
      <label class="filtro-check">
        <input type="checkbox" value="${t.id}" data-filtro="tienda">
        <span>${escapeHtml(t.nombre)}</span>
      </label>`).join('');
    listaTd.dataset.built = '1';
  }

  const listaMo = document.getElementById('rmFiltrosMotivosLista');
  if (listaMo && !listaMo.dataset.built && typeof CODIGOS_INFORME !== 'undefined') {
    listaMo.innerHTML = CODIGOS_INFORME.map(c => `
      <label class="filtro-check">
        <input type="checkbox" value="${escapeHtml(c.codigo)}" data-filtro="motivo">
        <span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto}; text-align:center; min-width:24px; font-size:11.5px;">${escapeHtml(c.codigo)}</span>
        <span>${escapeHtml(c.label)}</span>
      </label>`).join('');
    listaMo.dataset.built = '1';
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
      const set = rmSetDeGrupoFiltro(grupo);
      if (!set) return;
      const val = grupo === 'motivo' ? cb.value : Number(cb.value);
      if (cb.checked) set.add(val); else set.delete(val);
      rmActualizarBadgeFiltros();
      rmActualizarValoresSelects();
      rmRender();
    });
    panel.dataset.wired = '1';
  }
}

function rmSetDeGrupoFiltro(grupo) {
  if (grupo === 'agencia') return rmFiltros.agencias;
  if (grupo === 'tienda') return rmFiltros.tiendas;
  if (grupo === 'motivo') return rmFiltros.motivos;
  return null;
}

function rmActualizarValoresSelects() {
  document.querySelectorAll('#rmFiltrosPanel .filtro-select').forEach(sel => {
    const grupo = sel.dataset.grupo;
    const set = rmSetDeGrupoFiltro(grupo);
    if (!set) return;
    const valor = sel.querySelector('.filtro-select-valor');
    if (grupo === 'motivo') {
      // Motivo: "Todos", o los códigos elegidos con su color (hasta 3);
      // con más, "N motivos".
      if (!set.size) {
        valor.textContent = 'Todos';
        sel.classList.remove('activo');
      } else if (set.size <= 3 && typeof CODIGOS_INFORME !== 'undefined') {
        valor.innerHTML = CODIGOS_INFORME.filter(c => set.has(String(c.codigo))).map(c =>
          `<span style="display:inline-flex; align-items:center; gap:5px; margin-right:10px;"><span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto}; font-size:11px; text-align:center;">${escapeHtml(c.codigo)}</span>${escapeHtml(c.label)}</span>`
        ).join('');
        sel.classList.add('activo');
      } else {
        valor.textContent = `${set.size} motivos`;
        sel.classList.add('activo');
      }
      return;
    }
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
  const total = rmFiltros.agencias.size + rmFiltros.tiendas.size + rmFiltros.motivos.size + (rmFiltros.soloConIncidencias ? 1 : 0);
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
  const ancho = Math.min(560, bordeDerechoVisible() - margen * 2);
  panel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (bordeDerechoVisible() - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  panel.style.left = left + 'px';
}

function rmAbrirFiltrosPanel() {
  // Solo un desplegable abierto a la vez: Filtros, Exportar o Enviar.
  if (typeof rmxCerrarPanel === 'function') rmxCerrarPanel();
  if (typeof rmeCerrarPanel === 'function') rmeCerrarPanel();
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
    rmFiltros.motivos.clear();
    rmFiltros.soloConIncidencias = false;
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    rmActualizarBadgeFiltros();
    rmActualizarValoresSelects();
    rmRender();
  });
}

// Construye las celdas de una fila:
//  - Fila PUNTUAL (f.esPuntual): solo se rellenan sus propios días (con el
//    código real si hubo incidencia); el resto del mes se dibuja en blanco
//    ("–", sin contar ni colorear), porque esta fila es solo el recorte de
//    ese cambio puntual, no un tramo real de la tienda.
//  - Fila normal (agencia habitual): un bloque "Antes: X" / "Cambia a: Y"
//    por cada tramo PERMANENTE real anterior/posterior de la misma tienda
//    (los cambios puntuales no cuentan aquí). Dentro de su propio rango de
//    días, cualquier día con un cambio puntual se pinta como "→ Agencia"
//    y no se cuenta (esa incidencia ya se cuenta en su fila puntual).
function rmCeldasDeTramo(f, segmentosTienda, puntualPorDia, celdasTienda, diasEnviados, totalDias) {
  const partes = [];
  let totalIncidencias = 0;
  let totalOk = 0;
  const codigos = []; // códigos pintados en esta fila (para la leyenda con recuento)
  // Celda con código: se puede pulsar para ver el detalle en la barra lateral.
  const tdCodigo = (dia, c) => `<td class="rm-td-codigo" data-rm-tienda="${f.tiendaId}" data-rm-dia="${dia}" data-rm-agencia="${escapeHtml(f.agenciaNombre || '')}" title="${escapeHtml(c.label)} — pulsa para ver el detalle"><span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};">${escapeHtml(c.codigo)}</span></td>`;

  if (f.esPuntual) {
    // Recorre el mes: los días propios de esta fila puntual se rellenan;
    // cada hueco de días ajenos se agrupa en una sola celda "–".
    let hueco = 0;
    const cerrarHueco = () => { if (hueco) { partes.push(`<td colspan="${hueco}" class="rm-td-napuntual">–</td>`); hueco = 0; } };
    for (let dia = 1; dia <= totalDias; dia++) {
      // Fila de "Entrega de sábado": los días que esa agencia no entrega se
      // pintan día a día como un domingo (gris rayado), no como hueco en blanco.
      if (f.esSabado && (!f.diasPuntuales || !f.diasPuntuales.has(dia))) {
        cerrarHueco();
        partes.push(`<td class="rm-td-domingo" title="Sin entrega: ${escapeHtml(f.agenciaNombre || 'esta agencia')} solo entrega los sábados"></td>`);
        continue;
      }
      if (!f.diasPuntuales || !f.diasPuntuales.has(dia)) { hueco++; continue; }
      cerrarHueco();
      if (!diasEnviados.has(dia)) {
        if (rmEsDomingo(rmAnio, rmMes, dia)) { partes.push(`<td class="rm-td-domingo" title="Domingo — sin entrega habitual"></td>`); continue; }
        partes.push(`<td class="rm-td-pendiente" title="Informe no enviado ese día">–</td>`); continue;
      }
      const c = celdasTienda[dia];
      if (!c) { totalOk++; partes.push(`<td class="rm-td-ok">OK</td>`); continue; }
      if (c.ocultoPorMotivo) { partes.push(`<td title="Otro motivo (oculto por el filtro de Motivo)"></td>`); continue; }
      totalIncidencias++;
      codigos.push(String(c.codigo));
      partes.push(tdCodigo(dia, c));
    }
    cerrarHueco();
    return { html: partes.join(''), totalIncidencias, totalOk, codigos };
  }

  segmentosTienda
    .filter(s => !s.esPuntual && s.diaFin < f.diaInicio)
    .forEach(s => {
      const dias = s.diaFin - s.diaInicio + 1;
      partes.push(`<td colspan="${dias}" class="rm-td-cambio">Antes: ${escapeHtml(s.agenciaNombre)}</td>`);
    });

  // Días consecutivos de baja (sin incidencia registrada) se agrupan en una
  // sola celda gris: "BAJA" si ocupa 2 o más cuadraditos, y solo "BAJ" (las
  // 3 primeras letras, como con las agencias en los cambios puntuales) si
  // es un único día, para que no ensanche la columna.
  let diasBajaSeguidos = 0;
  const cerrarBloqueBaja = () => {
    if (!diasBajaSeguidos) return;
    partes.push(`<td colspan="${diasBajaSeguidos}" class="rm-td-baja" title="Tienda de baja (sin recepción de mercancía)">${diasBajaSeguidos >= 2 ? 'BAJA' : 'BAJ'}</td>`);
    diasBajaSeguidos = 0;
  };

  for (let dia = f.diaInicio; dia <= f.diaFin; dia++) {
    const pun = puntualPorDia && puntualPorDia[dia];
    if (pun && pun.esSabado) {
      cerrarBloqueBaja();
      // Las 3 primeras letras de la agencia de sábado (p.ej. SEY), como en los cambios puntuales
      const abreviaturaSab = String(pun.agenciaNombre || '').trim().slice(0, 3).toUpperCase() || 'S';
      partes.push(`<td class="rm-td-cambio" title="Los sábados entrega ${escapeHtml(pun.agenciaNombre)} (entrega de sábado)">${escapeHtml(abreviaturaSab)}</td>`);
      continue;
    }
    if (pun) {
      cerrarBloqueBaja();
      // Solo las 3 primeras letras (p.ej. SEYLOTRANS → SEY): el nombre
      // completo ensanchaba la columna de ese día. El nombre entero sigue
      // saliendo en el tooltip (title) y en la fila "puntual" de esa agencia.
      const abreviaturaPun = String(pun.agenciaNombre || '').trim().slice(0, 3).toUpperCase();
      partes.push(`<td class="rm-td-cambio" title="Ese día se entregó por ${escapeHtml(pun.agenciaNombre)} (cambio puntual)">${escapeHtml(abreviaturaPun)}</td>`);
      continue;
    }
    // Tienda de baja ese día: gris, sin OK y sin contar (salvo que ya
    // hubiera una incidencia registrada, que se muestra como siempre).
    if (rmDiaEnBaja(f.tiendaId, dia) && !(diasEnviados.has(dia) && celdasTienda[dia])) { diasBajaSeguidos++; continue; }
    cerrarBloqueBaja();
    // Tienda de marca Sábado fuera del sábado: gris como un domingo (salvo
    // que ya hubiera una incidencia registrada).
    const sinEntrega = rmMotivoSinEntregaTienda(f.tiendaId, rmAnio, rmMes, dia);
    if (sinEntrega && !(diasEnviados.has(dia) && celdasTienda[dia])) { partes.push(`<td class="rm-td-domingo" title="${escapeHtml(sinEntrega)}"></td>`); continue; }
    if (!diasEnviados.has(dia)) {
      if (rmEsDomingo(rmAnio, rmMes, dia)) { partes.push(`<td class="rm-td-domingo" title="Domingo — sin entrega habitual"></td>`); continue; }
      partes.push(`<td class="rm-td-pendiente" title="Informe no enviado ese día">–</td>`); continue;
    }
    const c = celdasTienda[dia];
    if (!c) {
      // Día anterior al alta de la tienda: no hay nada que revisar → "–", no "OK".
      if (dia < rmPrimerDiaTienda(f.tiendaId)) { partes.push(`<td class="rm-td-pendiente" title="La tienda aún no estaba dada de alta">–</td>`); continue; }
      totalOk++;
      partes.push(`<td class="rm-td-ok">OK</td>`); continue;
    }
    if (c.ocultoPorMotivo) { partes.push(`<td title="Otro motivo (oculto por el filtro de Motivo)"></td>`); continue; }
    totalIncidencias++;
    codigos.push(String(c.codigo));
    partes.push(tdCodigo(dia, c));
  }
  cerrarBloqueBaja();

  segmentosTienda
    .filter(s => !s.esPuntual && s.diaInicio > f.diaFin)
    .forEach(s => {
      const dias = s.diaFin - s.diaInicio + 1;
      partes.push(`<td colspan="${dias}" class="rm-td-cambio">Cambia a: ${escapeHtml(s.agenciaNombre)}</td>`);
    });

  return { html: partes.join(''), totalIncidencias, totalOk, codigos };
}

// ---------------------------------------------------------------
// Render de la tabla
// ---------------------------------------------------------------
async function rmRender() {
  const cont = document.getElementById('contenidoReportesMensuales');
  cont.innerHTML = `<div class="card"><div class="empty"><p>Cargando…</p></div></div>`;

  let datos;
  mostrarCargandoGlobal();
  try {
    datos = await rmCargarDatosMes(rmAnio, rmMes);
  } catch (err) {
    console.error('Error cargando el reporte mensual:', err);
    cont.innerHTML = `<div class="card"><div class="empty"><p>No se pudo cargar el reporte de este mes.</p></div></div>`;
    return;
  } finally {
    ocultarCargandoGlobal();
  }

  rmConstruirPanelFiltros();

  const { diasEnviados, totalDias, cambiosPorTienda, puntualAgenciaPorTienda } = datos;
  rmInformesPorDia = datos.informesPorDia || new Map();
  const celdas = rmCeldasSegunMotivo(datos.celdas);
  const todasLasFilas = rmConstruirTodasLasFilas(cambiosPorTienda, puntualAgenciaPorTienda, totalDias);
  const segmentosPorTienda = rmSegmentosPorTienda(todasLasFilas);
  const filas = rmFilasSegunFiltros(todasLasFilas);
  const cabeceraDias = Array.from({ length: totalDias }, (_, i) => `<th>${i + 1}</th>`).join('');

  const filasConDatos = filas.map(f => {
    const celdasTienda = celdas[f.tiendaId] || {};
    const segmentosTienda = segmentosPorTienda.get(f.tiendaId) || [f];
    const puntualPorDia = puntualAgenciaPorTienda.get(f.tiendaId);
    const { html, totalIncidencias, totalOk, codigos } = rmCeldasDeTramo(f, segmentosTienda, puntualPorDia, celdasTienda, diasEnviados, totalDias);
    return { f, html, totalIncidencias, totalOk, codigos };
  });

  // Con "solo con incidencias" o con algún Motivo elegido, solo se quedan
  // las filas que tengan al menos una incidencia (de esos motivos).
  const filasVisibles = (rmFiltros.soloConIncidencias || rmFiltros.motivos.size)
    ? filasConDatos.filter(x => x.totalIncidencias > 0)
    : filasConDatos;

  const filasHtml = filasVisibles.map(({ f, html, totalIncidencias }) => `
    <tr class="${f.esPuntual && !f.esSabado ? 'rm-fila-puntual' : ''}">
      <td class="rm-col-fija">${rmBadgeSabadoHtml(f)}${escapeHtml(f.agenciaNombre)}${f.esPuntual && !f.esSabado ? ' <span class="rm-badge-puntual" title="Fila de los cambios puntuales de agencia de esta tienda en el mes">puntual</span>' : ''}</td>
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

  // Barra lateral: leyenda con recuento, resumen del mes y detalle vacío.
  // Se cuenta sobre lo que se ve en la tabla (con los filtros aplicados),
  // igual que la columna TOTAL.
  const conteo = {};
  let totalInc = 0, totalOk = 0;
  filasVisibles.forEach(x => {
    totalInc += x.totalIncidencias;
    totalOk += x.totalOk;
    x.codigos.forEach(cod => { conteo[cod] = (conteo[cod] || 0) + 1; });
  });
  rmPintarLeyendaCompacta(conteo);
  rmPintarResumenMes({ totalInc, totalOk, diasEnviados, totalDias });
  rmPintarDetalleVacio();
}

// ---------------------------------------------------------------
// Barra lateral: resumen del mes
// ---------------------------------------------------------------
// Días que deberían tener informe: los del mes en pantalla sin domingos,
// hasta hoy si es el mes actual. Hoy solo cuenta si ya se envió, para que
// por la mañana no salga como que falta el informe del día.
function rmDiasEsperados(diasEnviados, totalDias) {
  const hoy = new Date();
  const anioHoy = hoy.getFullYear(), mesHoy = hoy.getMonth();
  if (rmAnio > anioHoy || (rmAnio === anioHoy && rmMes > mesHoy)) return 0; // mes futuro
  const esMesActual = rmAnio === anioHoy && rmMes === mesHoy;
  const ultimo = esMesActual ? hoy.getDate() : totalDias;
  let n = 0;
  for (let d = 1; d <= ultimo; d++) {
    if (rmEsDomingo(rmAnio, rmMes, d)) continue;
    if (esMesActual && d === ultimo && !diasEnviados.has(d)) continue;
    n++;
  }
  return n;
}

function rmPintarResumenMes({ totalInc, totalOk, diasEnviados, totalDias }) {
  const cont = document.getElementById('rmResumenMes');
  if (!cont) return;
  const esperados = rmDiasEsperados(diasEnviados, totalDias);
  const enviadosLaborables = [...diasEnviados].filter(d => !rmEsDomingo(rmAnio, rmMes, d)).length;
  const faltan = Math.max(0, esperados - enviadosLaborables);
  const ultimoEnviado = diasEnviados.size ? Math.max(...diasEnviados) : 0;
  const revisadas = totalOk + totalInc;
  const pctOk = revisadas ? Math.round((totalOk / revisadas) * 100) : null;
  const hayFiltros = rmFiltros.agencias.size || rmFiltros.tiendas.size || rmFiltros.motivos.size || rmFiltros.soloConIncidencias;

  cont.innerHTML = `
    <div class="rm-side-cab">
      <span class="rm-side-tit">${RM_NOMBRES_MES[rmMes]} ${rmAnio}</span>
      <span class="rm-side-sub">${ultimoEnviado ? `hasta el día ${ultimoEnviado}` : 'sin informes enviados'}${hayFiltros ? ' · con filtros' : ''}</span>
    </div>
    <div class="rm-kpis">
      <div class="rm-kpi"><b>${totalInc}</b><small>incidencias</small></div>
      <div class="rm-kpi" title="Días con OK frente al total de días revisados (OK + incidencias)"><b>${pctOk === null ? '—' : pctOk + '%'}</b><small>entregas OK</small></div>
      <div class="rm-kpi${faltan ? ' rm-kpi-aviso' : ''}" title="Informes enviados frente a días con entrega habitual (sin domingos)">
        <b>${enviadosLaborables}/${Math.max(esperados, enviadosLaborables)}</b>
        <small>${faltan ? `falta${faltan === 1 ? '' : 'n'} ${faltan}` : 'informes al día'}</small>
      </div>
    </div>`;
}

// ---------------------------------------------------------------
// Barra lateral: detalle de la celda pulsada
// ---------------------------------------------------------------
function rmPintarDetalleVacio() {
  const cont = document.getElementById('rmDetalleCelda');
  if (!cont) return;
  rmDetallePeticion++; // descarta cualquier carga de detalle en curso
  cont.innerHTML = `<div class="rm-detalle-vacio"><span>👆</span>Pulsa una celda con código para ver el detalle de la incidencia.</div>`;
}

let rmDetallePeticion = 0; // para ignorar respuestas de clics anteriores

async function rmMostrarDetalleCelda(td) {
  const cont = document.getElementById('rmDetalleCelda');
  if (!cont) return;
  document.querySelectorAll('#contenidoReportesMensuales .rm-td-sel').forEach(x => x.classList.remove('rm-td-sel'));
  td.classList.add('rm-td-sel');

  const tiendaId = Number(td.dataset.rmTienda);
  const dia = Number(td.dataset.rmDia);
  const agenciaFila = td.dataset.rmAgencia || '';
  const tienda = tiendasCache.find(t => t.id === tiendaId);
  const informe = rmInformesPorDia.get(dia);
  const codigoTxt = td.querySelector('.rm-celda-codigo')?.textContent || '';
  const cod = CODIGOS_INFORME.find(c => String(c.codigo) === codigoTxt);
  const fechaTxt = new Date(rmAnio, rmMes, dia).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fechaISO = `${rmAnio}-${String(rmMes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const lugar = [tienda && tienda.nombre, tienda && tienda.provincia, agenciaFila].filter(Boolean).map(escapeHtml).join(' · ');

  const filaEnvio = informe && informe.enviadoEn
    ? `<dt>Informe</dt><dd>Enviado ${new Date(informe.enviadoEn).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</dd>`
    : '';

  cont.innerHTML = `
    <div class="rm-side-cab"><span class="rm-side-tit">Detalle</span><span class="rm-side-sub">celda seleccionada</span></div>
    <div class="rm-detalle-cab">
      <span class="rm-celda-codigo" style="background:${cod ? cod.color : '#E1E4E8'}; color:${cod ? cod.texto : '#12181F'};">${escapeHtml(codigoTxt)}</span>
      <div><b>${escapeHtml(cod ? cod.label : 'Incidencia')}</b><small>${lugar || '—'}</small></div>
    </div>
    <dl class="rm-detalle-filas">
      <dt>Fecha</dt><dd>${escapeHtml(fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1))}</dd>
      ${filaEnvio}
    </dl>
    <div class="rm-detalle-obs rm-detalle-cargando">Cargando observaciones…</div>`;

  if (!informe) return;
  const peticion = ++rmDetallePeticion;
  const { data, error } = await sb
    .from('incidencias')
    .select('motivo, observaciones, usuario')
    .eq('informe_id', informe.id)
    .eq('tienda_id', tiendaId)
    .eq('marcada', true)
    .eq('entrega', 'HABITUAL');
  if (peticion !== rmDetallePeticion) return; // ya se pulsó otra celda (o se recargó la tabla)

  const obsEl = cont.querySelector('.rm-detalle-obs');
  if (!obsEl) return;
  obsEl.classList.remove('rm-detalle-cargando');
  if (error) {
    console.error('Error cargando el detalle de la incidencia:', error);
    obsEl.textContent = 'No se pudieron cargar las observaciones.';
    return;
  }
  const filas = data || [];
  const motivos = [...new Set(filas.map(r => r.motivo).filter(Boolean))].join(', ');
  const usuarios = [...new Set(filas.map(r => r.usuario).filter(Boolean))].join(', ');
  const obs = filas.map(r => (r.observaciones || '').trim()).filter(Boolean);

  const dl = cont.querySelector('.rm-detalle-filas');
  if (motivos) dl.insertAdjacentHTML('beforeend', `<dt>Motivo</dt><dd>${escapeHtml(motivos)}</dd>`);
  if (usuarios) dl.insertAdjacentHTML('beforeend', `<dt>Registrado por</dt><dd>${escapeHtml(usuarios)}</dd>`);

  if (obs.length) obsEl.innerHTML = obs.map(o => escapeHtml(o)).join('<br>');
  else { obsEl.classList.add('rm-detalle-sin-obs'); obsEl.textContent = 'Sin observaciones.'; }

  cont.insertAdjacentHTML('beforeend', `<button type="button" class="rm-detalle-link" data-rm-ir-informe="${fechaISO}">Abrir informe del día →</button>`);
}

// Lleva al Historial de informes en la fecha de la celda (mismo camino que
// los avisos de Inicio, ver navegacion.js).
function rmIrAInformeDelDia(fecha) {
  if (typeof activarVista !== 'function' || typeof cargarInformeHistorial !== 'function') return;
  activarVista('historial-informes');
  const inp = document.getElementById('historialFechaInput');
  if (inp) inp.value = fecha;
  cargarInformeHistorial(fecha);
}

// Se engancha una sola vez (delegación): la tabla se repinta en cada render.
function rmEngancharBarraLateral() {
  const tabla = document.getElementById('contenidoReportesMensuales');
  if (tabla) tabla.addEventListener('click', e => {
    const td = e.target.closest('td.rm-td-codigo');
    if (td) rmMostrarDetalleCelda(td);
  });
  const detalle = document.getElementById('rmDetalleCelda');
  if (detalle) detalle.addEventListener('click', e => {
    const btn = e.target.closest('[data-rm-ir-informe]');
    if (btn) rmIrAInformeDelDia(btn.dataset.rmIrInforme);
  });
}

function rmActualizarCabecera() {
  document.getElementById('rmMesTexto').textContent = `${RM_NOMBRES_MES[rmMes]} ${rmAnio}`;
}

// Se llama desde el dropdown de Análisis (ver navegacion.js) cada vez que
// se entra en la vista; solo engancha los botones la primera vez.
function renderVistaReportesMensuales() {
  rmPintarLeyendaCompacta();

  // Aunque los botones ya estén enganchados de una entrada anterior a esta
  // vista, los datos (incidencias, informes enviados...) pueden haber
  // cambiado desde entonces, así que siempre recalculamos el cuadro al
  // entrar de nuevo — solo el enganche de los botones se hace una vez.
  if (rmInicializado) {
    rmActualizarCabecera();
    rmRender();
    return;
  }
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
  rmEngancharBarraLateral();

  rmActualizarCabecera();
  rmRender();
}
