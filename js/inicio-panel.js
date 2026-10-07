// ---------------------------------------------------------------
// Pantalla de Inicio: tarjetas de arriba, gráficas, actividad reciente
// y reloj de la cabecera.
// ---------------------------------------------------------------
// Requiere (ya cargados antes): sb, escapeHtml, activarVista,
// fechaLocalISO (navegacion.js), informeHoyCache (informe-hoy.js),
// cargarPanelSiniestros / abrirModalPanelSiniestro (panel-siniestros.js).
//
// Lo que ya pintan otros archivos y aquí solo se complementa:
//   - #kpiIncidenciasHoy   → informe-hoy.js (actualizarKpiIncidencias)
//   - #kpiSiniestrosPend   → siniestros.js (siniestros DEL DÍA pendientes;
//                            está oculto y aquí se suma a los del Panel)
//   - #cardEstadoInforme   → informe-hoy.js (renderCardEstadoInforme)
//   - #cardPendienteAtencion → navegacion.js (cargarPendienteAtencion)
// ---------------------------------------------------------------

const INICIO_COLORES_AGENCIAS = ['#FF7A1A', '#1B6DE0', '#22A04B', '#8B5CF6', '#E5A400', '#0EA5A4'];
const INICIO_COLOR_OTRAS = '#A0A9B5';
const INICIO_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const INICIO_DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Acciones del Registro de auditoría que sí salen en "Actividad reciente"
// (trabajo del día a día). Lo de usuarios, permisos, borrados y
// configuración NO sale aquí: solo en el Registro de auditoría completo.
const INICIO_ACCIONES_ACTIVIDAD = [
  'Enviar informe a agencias',
  'Enviar resumen mensual a agencia',
  'Cambio de agencia programado aplicado',
  'Programar cambio de agencia',
  'Mover tienda de agencia'
];

let inicioDatos = {
  dias: [],          // [{ fecha, n }] últimos 7 informes, del más antiguo al más reciente
  panel: [],         // filas de panel_siniestros
  donut: [],         // [{ nombre, n, color }]
  acciones: []       // filas de registro_acciones (filtradas)
};
let inicioCargando = false;
let inicioCargadoUnaVez = false;

// ---------------- Utilidades ----------------

function inicioFmtEuros(n) {
  return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function inicioFechaISO(d) {
  return (typeof fechaLocalISO === 'function') ? fechaLocalISO(d) : d.toISOString().slice(0, 10);
}

function inicioCapitalizar(nombre) {
  return String(nombre || '').toLowerCase().replace(/(^|[\s\-'])([a-záéíóúñü])/g, (m, sep, l) => sep + l.toUpperCase());
}

function inicioIniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
}

// "hace 5 min", "hoy 10:38", "ayer 12:56", "05/10 08:07"
function inicioCuando(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const ahora = new Date();
  const min = Math.floor((ahora - d) / 60000);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (min < 0) return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hora}`;
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const hoyIni = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const diaIni = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dias = Math.round((hoyIni - diaIni) / 86400000);
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hora}`;
}

// Supabase devuelve como mucho 1000 filas por consulta: se pide por páginas.
async function inicioTodasLasFilas(construirConsulta) {
  const filas = [];
  const PAGINA = 1000;
  for (let desde = 0; desde < 20000; desde += PAGINA) {
    const { data, error } = await construirConsulta().range(desde, desde + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return filas;
}

// Minigráfica de fondo de las tarjetas (línea + relleno suave)
function inicioSparkline(valores, color) {
  const vals = (valores || []).map(v => Number(v) || 0);
  if (vals.length < 2) return '';
  const max = Math.max(...vals), min = Math.min(...vals);
  const rango = (max - min) || 1;
  const pts = vals.map((v, i) => [i * 100 / (vals.length - 1), 30 - ((v - min) / rango) * 24]);
  const linea = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const area = `0,32 ${linea} 100,32`;
  return `<svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="${area}" fill="${color}" opacity=".10"/>
    <polyline points="${linea}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

// ---------------- Reloj de la cabecera ----------------

function inicioTickReloj() {
  const fechaEl = document.getElementById('relojFecha');
  const horaEl = document.getElementById('relojHora');
  if (!fechaEl || !horaEl) return;
  const d = new Date();
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  fechaEl.textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  horaEl.textContent = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
inicioTickReloj();
setInterval(inicioTickReloj, 1000);

// ---------------- Carga de datos ----------------

async function inicioCargarDias() {
  const { data: informes, error } = await sb.from('informes_diarios')
    .select('id, fecha')
    .lte('fecha', inicioFechaISO(new Date()))
    .order('fecha', { ascending: false })
    .limit(7);
  if (error) throw error;
  const ids = (informes || []).map(i => i.id);
  const conteo = {};
  if (ids.length) {
    const incs = await inicioTodasLasFilas(() => sb.from('incidencias').select('informe_id').eq('marcada', true).in('informe_id', ids));
    incs.forEach(i => { conteo[i.informe_id] = (conteo[i.informe_id] || 0) + 1; });
  }
  inicioDatos.dias = (informes || []).slice().reverse().map(i => ({ fecha: i.fecha, n: conteo[i.id] || 0 }));
}

async function inicioCargarPanel() {
  inicioDatos.panel = await inicioTodasLasFilas(() => sb.from('panel_siniestros').select(
    'id, fecha, estado, tipo, valor, agencia_nombre, tienda_nombre, creado_en, creado_por, ' +
    'correo_enviado, correo_enviado_en, correo_enviado_por, envio_omitido_en, envio_omitido_por, ' +
    'albaran_adjuntado_en, albaran_adjuntado_por, facturacion_enviado_en, facturacion_enviado_por, ' +
    'facturacion_omitida_en, facturacion_omitida_por, factura_adjuntada_en, factura_adjuntada_por, ' +
    'recogida_estado, recogida_estado_en, recogida_estado_por, cobrado_en, cobrado_por, anulado_en, anulado_por'
  ).order('id'));
}

async function inicioCargarDonut() {
  const hoy = new Date();
  const primero = inicioFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const { data: informes, error } = await sb.from('informes_diarios')
    .select('id')
    .gte('fecha', primero)
    .lte('fecha', inicioFechaISO(hoy));
  if (error) throw error;
  const ids = (informes || []).map(i => i.id);
  const porAgencia = {};
  if (ids.length) {
    const incs = await inicioTodasLasFilas(() => sb.from('incidencias').select('agencia_nombre').eq('marcada', true).in('informe_id', ids));
    incs.forEach(i => {
      const nombre = i.agencia_nombre || 'Sin agencia';
      porAgencia[nombre] = (porAgencia[nombre] || 0) + 1;
    });
  }
  const orden = Object.entries(porAgencia).sort((a, b) => b[1] - a[1]);
  const principales = orden.slice(0, INICIO_COLORES_AGENCIAS.length).map(([nombre, n], k) => ({ nombre, n, color: INICIO_COLORES_AGENCIAS[k] }));
  const resto = orden.slice(INICIO_COLORES_AGENCIAS.length).reduce((acc, [, n]) => acc + n, 0);
  if (resto) principales.push({ nombre: 'Otras', n: resto, color: INICIO_COLOR_OTRAS });
  inicioDatos.donut = principales;
}

async function inicioCargarAcciones() {
  const desde = new Date(); desde.setDate(desde.getDate() - 14);
  const { data, error } = await sb.from('registro_acciones')
    .select('usuario, accion, detalle, creado_en')
    .in('accion', INICIO_ACCIONES_ACTIVIDAD)
    .gte('creado_en', desde.toISOString())
    .order('creado_en', { ascending: false })
    .limit(40);
  if (error) throw error;
  inicioDatos.acciones = data || [];
}

// Punto de entrada: lo llama cargarKPIs() (navegacion.js) cada vez que se
// entra en Inicio, al iniciar sesión, y aquí mismo al cargar la página.
async function inicioRefrescar() {
  if (inicioCargando) return;
  if (typeof sesionActual !== 'undefined' && !sesionActual) return;
  inicioCargando = true;
  try {
    const resultados = await Promise.allSettled([inicioCargarDias(), inicioCargarPanel(), inicioCargarDonut(), inicioCargarAcciones()]);
    resultados.forEach(r => { if (r.status === 'rejected') console.error('Inicio: error cargando datos', r.reason); });
    inicioCargadoUnaVez = true;
    inicioPintarTodo();
  } finally {
    inicioCargando = false;
  }
}

function inicioPintarTodo() {
  inicioActualizarKpiIncidencias();
  inicioActualizarKpiSiniestros();
  inicioPintarKpiCobro();
  inicioPintarKpiMes();
  inicioPintarGraficaDias();
  inicioPintarDonut();
  inicioPintarActividad();
}

// ---------------- Tarjetas de arriba ----------------

// Incidencias de hoy: comparación con el informe anterior + minigráfica
function inicioActualizarKpiIncidencias() {
  const subEl = document.getElementById('kpiIncidenciasSub');
  const sparkEl = document.getElementById('kpiIncidenciasSpark');
  if (!subEl || !inicioCargadoUnaVez) return;
  const hoyISO = inicioFechaISO(new Date());
  const nHoy = Number(document.getElementById('kpiIncidenciasHoy')?.textContent) || 0;
  const dias = inicioDatos.dias.map(d => d.fecha === hoyISO ? { ...d, n: nHoy } : d);
  const anterior = dias.filter(d => d.fecha < hoyISO).pop();
  if (anterior) {
    const [, m, dd] = anterior.fecha.split('-');
    let variacion = '';
    if (anterior.n > 0) {
      const pct = Math.round((nHoy - anterior.n) / anterior.n * 100);
      variacion = ` · <span class="${pct > 0 ? 'sube' : (pct < 0 ? 'baja' : '')}">${pct > 0 ? '+' : (pct < 0 ? '−' : '')}${Math.abs(pct)}%</span>`;
    }
    subEl.innerHTML = `Informe anterior (${dd}/${m}): ${anterior.n}${variacion}`;
  } else {
    subEl.innerHTML = '&nbsp;';
  }
  if (sparkEl) sparkEl.innerHTML = inicioSparkline(dias.map(d => d.n), '#D12B0D');
}

// Siniestros sin enviar a la agencia: los del día (siniestros.js) + los
// del Panel sin enviar ni omitir (mismo criterio que la tarea en rojo).
function inicioActualizarKpiSiniestros() {
  const card = document.getElementById('kpiCardSiniestros');
  const totalEl = document.getElementById('kpiSiniestrosTotal');
  const subEl = document.getElementById('kpiSiniestrosSub');
  if (!card || !totalEl) return;
  const delDia = Number(document.getElementById('kpiSiniestrosPend')?.textContent) || 0;
  const delPanel = inicioDatos.panel.filter(s => !s.correo_enviado && !s.envio_omitido_en && s.estado !== 'ANULADO').length;
  if (!inicioCargadoUnaVez) return;
  const total = delDia + delPanel;
  totalEl.textContent = total;
  subEl.innerHTML = `<span class="inicio-chip${delPanel ? ' on' : ''}">${delPanel} del Panel</span><span class="inicio-chip${delDia ? ' on' : ''}">${delDia} del día</span>`;
  card.classList.toggle('kpi-rojo', total > 0);
  card.classList.toggle('kpi-gris', total === 0);
  card.classList.toggle('alerta', total > 0);
  // Al pulsar va a donde están: al Panel si hay alguno ahí; si no, a los del día.
  card.dataset.view = delPanel ? 'panel-siniestros' : (delDia ? 'siniestros' : 'panel-siniestros');
}

// Pendiente de cobro: total y nº de siniestros "PDTE COBRO", con la
// evolución de las últimas 2 semanas (reconstruida con fecha y cobrado_en).
function inicioPintarKpiCobro() {
  const totalEl = document.getElementById('kpiCobroTotal');
  if (!totalEl) return;
  const pdte = inicioDatos.panel.filter(s => s.estado === 'PDTE COBRO');
  const total = pdte.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
  totalEl.textContent = inicioFmtEuros(total);
  document.getElementById('kpiCobroSub').textContent = `${pdte.length} siniestro${pdte.length === 1 ? '' : 's'}`;

  const serie = [];
  for (let k = 13; k >= 0; k--) {
    const d = new Date(); d.setDate(d.getDate() - k);
    const dISO = inicioFechaISO(d);
    const valor = inicioDatos.panel.reduce((acc, s) => {
      if (!s.fecha || s.fecha > dISO || s.estado === 'ANULADO') return acc;
      const cobradoDespues = s.estado === 'COBRADO' && s.cobrado_en && inicioFechaISO(new Date(s.cobrado_en)) > dISO;
      return (s.estado === 'PDTE COBRO' || cobradoDespues) ? acc + (Number(s.valor) || 0) : acc;
    }, 0);
    serie.push(valor);
  }
  document.getElementById('kpiCobroSpark').innerHTML = inicioSparkline(serie, '#1E8E3E');
}

// Siniestros del mes (sin anulados), comparados con el mes anterior a la
// misma altura, y minigráfica acumulada día a día.
function inicioPintarKpiMes() {
  const totalEl = document.getElementById('kpiMesTotal');
  if (!totalEl) return;
  const hoy = new Date();
  const dia = hoy.getDate();
  const iniMes = inicioFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const hoyISO = inicioFechaISO(hoy);
  const iniAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const ultimoAnt = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate();
  const finAntISO = inicioFechaISO(new Date(iniAnt.getFullYear(), iniAnt.getMonth(), Math.min(dia, ultimoAnt)));
  const validos = inicioDatos.panel.filter(s => s.fecha && s.estado !== 'ANULADO');
  const delMes = validos.filter(s => s.fecha >= iniMes && s.fecha <= hoyISO);
  const antAltura = validos.filter(s => s.fecha >= inicioFechaISO(iniAnt) && s.fecha <= finAntISO).length;

  document.getElementById('kpiMesLabel').textContent = `Siniestros en ${INICIO_MESES[hoy.getMonth()]}`;
  totalEl.textContent = delMes.length;
  const nombreAnt = INICIO_MESES[iniAnt.getMonth()];
  document.getElementById('kpiMesSub').textContent = `${nombreAnt.charAt(0).toUpperCase() + nombreAnt.slice(1)} a estas alturas: ${antAltura}`;

  const acumulado = [];
  let suma = 0;
  for (let d = 1; d <= dia; d++) {
    const dISO = inicioFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), d));
    suma += delMes.filter(s => s.fecha === dISO).length;
    acumulado.push(suma);
  }
  if (acumulado.length === 1) acumulado.unshift(0);
  document.getElementById('kpiMesSpark').innerHTML = inicioSparkline(acumulado, '#1B6DE0');
}

// ---------------- Gráfica "Incidencias por día" ----------------

function inicioPintarGraficaDias() {
  const el = document.getElementById('inicioGraficaDias');
  if (!el) return;
  const hoyISO = inicioFechaISO(new Date());
  const nHoy = Number(document.getElementById('kpiIncidenciasHoy')?.textContent);
  const dias = inicioDatos.dias.map(d => (d.fecha === hoyISO && !isNaN(nHoy)) ? { ...d, n: nHoy } : d);
  if (!dias.length) { el.innerHTML = '<p class="inicio-vacio">Todavía no hay informes.</p>'; return; }

  const W = Math.max(260, el.clientWidth || 520);
  const H = Math.max(150, el.clientHeight || 220);
  const padX = 26, padTop = 26, padBottom = 26;
  const max = Math.max(...dias.map(d => d.n), 1);
  const alto = H - padTop - padBottom;
  const x = i => dias.length === 1 ? W / 2 : padX + i * (W - padX * 2) / (dias.length - 1);
  const y = v => padTop + alto - (v / max) * alto;
  const base = padTop + alto;
  const pts = dias.map((d, i) => [x(i), y(d.n)]);
  const linea = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  const area = `M${pts[0][0].toFixed(1)},${base} L${linea} L${pts[pts.length - 1][0].toFixed(1)},${base} Z`;

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Incidencias de los últimos informes">
    <defs><linearGradient id="inicioGradDias" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#FF7A1A" stop-opacity=".38"/><stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/>
    </linearGradient></defs>`;
  for (let k = 0; k <= 3; k++) {
    const gy = padTop + alto * k / 3;
    svg += `<line x1="${padX}" x2="${W - padX}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="#EEF0F3"/>`;
  }
  svg += `<path d="${area}" fill="url(#inicioGradDias)"/>
    <path d="M${linea}" fill="none" stroke="#FF7A1A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  dias.forEach((d, i) => {
    const esHoy = d.fecha === hoyISO;
    const fd = new Date(d.fecha + 'T00:00:00');
    const etiqueta = esHoy ? 'Hoy' : `${INICIO_DIAS_CORTOS[fd.getDay()]} ${fd.getDate()}`;
    svg += `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${esHoy ? 6 : 4}" fill="#fff" stroke="#FF7A1A" stroke-width="${esHoy ? 3 : 2}"><title>${etiqueta}: ${d.n} incidencias</title></circle>
      <text x="${pts[i][0].toFixed(1)}" y="${(pts[i][1] - 11).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#12181F">${d.n}</text>
      <text x="${pts[i][0].toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11.5" fill="${esHoy ? '#7A3400' : '#5B6572'}" font-weight="${esHoy ? 700 : 400}">${etiqueta}</text>`;
  });
  svg += '</svg>';
  el.innerHTML = svg;
}

// Se vuelve a dibujar al cambiar el tamaño de la ventana (el SVG se
// construye con el ancho/alto real del hueco para que no se deforme).
if (typeof ResizeObserver === 'function') {
  let inicioResizeTimer = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(inicioResizeTimer);
    inicioResizeTimer = setTimeout(() => { if (inicioCargadoUnaVez) inicioPintarGraficaDias(); }, 120);
  });
  const elGrafica = document.getElementById('inicioGraficaDias');
  if (elGrafica) ro.observe(elGrafica);
}

// ---------------- Donut "Incidencias del mes por agencia" ----------------

function inicioPintarDonut() {
  const el = document.getElementById('inicioDonut');
  if (!el) return;
  const hoy = new Date();
  const titulo = document.getElementById('inicioDonutTitulo');
  if (titulo) titulo.textContent = `🚚 Incidencias de ${INICIO_MESES[hoy.getMonth()]} por agencia`;
  const datos = inicioDatos.donut;
  const total = datos.reduce((acc, d) => acc + d.n, 0);
  if (!total) { el.innerHTML = '<p class="inicio-vacio">Sin incidencias este mes todavía.</p>'; return; }

  const R = 62, C = 2 * Math.PI * R;
  let desplaz = 0;
  let arcos = '';
  datos.forEach((d, k) => {
    const largo = d.n / total * C;
    const hueco = datos.length > 1 ? Math.min(2, largo / 3) : 0;
    arcos += `<circle class="inicio-donut-arco" data-k="${k}" cx="80" cy="80" r="${R}" fill="none" stroke="${d.color}" stroke-width="24"
      stroke-dasharray="${Math.max(0, largo - hueco).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-desplaz).toFixed(2)}"></circle>`;
    desplaz += largo;
  });
  const pct = d => Math.round(d.n / total * 100);
  const leyenda = datos.map((d, k) => `
    <li data-k="${k}"><i style="background:${d.color}"></i><span class="nombre">${escapeHtml(d.nombre)}</span><b>${d.n}</b><span class="pct">${pct(d)}%</span></li>`).join('');
  el.innerHTML = `
    <svg viewBox="0 0 160 160" class="inicio-donut-svg" role="img" aria-label="Incidencias del mes por agencia">
      <g transform="rotate(-90 80 80)">${arcos}</g>
      <text class="inicio-donut-num" x="80" y="80" text-anchor="middle" font-size="28" font-weight="800" fill="#12181F">${total}</text>
      <text class="inicio-donut-txt" x="80" y="99" text-anchor="middle" font-size="11" fill="#5B6572">incidencias</text>
    </svg>
    <ul class="inicio-leyenda">${leyenda}</ul>
    <div class="inicio-donut-tip" hidden></div>`;

  // Al pasar el ratón por un color (o por su fila de la leyenda): se
  // resalta ese trozo, el centro muestra sus incidencias y sale una
  // etiqueta con el nombre de la agencia junto al cursor.
  const numEl = el.querySelector('.inicio-donut-num');
  const txtEl = el.querySelector('.inicio-donut-txt');
  const tip = el.querySelector('.inicio-donut-tip');
  const marcar = (k) => {
    el.classList.toggle('resaltando', k !== null);
    el.querySelectorAll('[data-k]').forEach(n => n.classList.toggle('activo', k !== null && Number(n.dataset.k) === k));
    if (k === null) {
      numEl.textContent = total; txtEl.textContent = 'incidencias';
      tip.hidden = true;
      return;
    }
    const d = datos[k];
    numEl.textContent = d.n;
    txtEl.textContent = d.nombre.length > 16 ? d.nombre.slice(0, 15) + '…' : d.nombre;
    tip.innerHTML = `<i style="background:${d.color}"></i><b>${escapeHtml(d.nombre)}</b> · ${d.n} incidencia${d.n === 1 ? '' : 's'} (${pct(d)}%)`;
  };
  const moverTip = (ev) => {
    const caja = el.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = (ev.clientX - caja.left + 14) + 'px';
    tip.style.top = (ev.clientY - caja.top + 14) + 'px';
  };
  el.querySelectorAll('.inicio-donut-arco').forEach(arco => {
    arco.addEventListener('mouseenter', () => marcar(Number(arco.dataset.k)));
    arco.addEventListener('mousemove', moverTip);
    arco.addEventListener('mouseleave', () => marcar(null));
  });
  el.querySelectorAll('.inicio-leyenda li').forEach(li => {
    li.addEventListener('mouseenter', () => { marcar(Number(li.dataset.k)); tip.hidden = true; });
    li.addEventListener('mouseleave', () => marcar(null));
  });
}

// ---------------- Actividad reciente ----------------

// Los pasos de cada siniestro ya guardan quién y cuándo (creado_por/en,
// correo_enviado_por/en, factura_adjuntada_por/en…), así que la actividad
// se arma con eso, más algunas acciones del Registro de auditoría.
function inicioEventosActividad() {
  const limite = Date.now() - 14 * 86400000;
  const eventos = [];
  const add = (en, por, icono, texto, siniestroId) => {
    if (!en) return;
    const t = new Date(en).getTime();
    if (isNaN(t) || t < limite) return;
    eventos.push({ t, en, por: por || '—', icono, texto, siniestroId });
  };
  inicioDatos.panel.forEach(s => {
    const ref = `Nº ${s.id} · ${s.agencia_nombre || 'Sin agencia'}${s.tienda_nombre ? ' · ' + s.tienda_nombre : ''}`;
    add(s.creado_en, s.creado_por, '🆕', `Creó el siniestro ${ref}`, s.id);
    add(s.correo_enviado_en, s.correo_enviado_por, '📧', `Envió a la agencia el siniestro ${ref}`, s.id);
    add(s.envio_omitido_en, s.envio_omitido_por, '🚫', `Omitió el envío a agencia del siniestro ${ref}`, s.id);
    add(s.albaran_adjuntado_en, s.albaran_adjuntado_por, '📄', `Adjuntó el albarán del siniestro ${ref}`, s.id);
    add(s.facturacion_enviado_en, s.facturacion_enviado_por, '📤', `Envió a Facturación el albarán del siniestro ${ref}`, s.id);
    add(s.facturacion_omitida_en, s.facturacion_omitida_por, '🚫', `Omitió el envío a Facturación del siniestro ${ref}`, s.id);
    add(s.factura_adjuntada_en, s.factura_adjuntada_por, '🧾', `Adjuntó la factura del siniestro ${ref}`, s.id);
    if (s.recogida_estado) add(s.recogida_estado_en, s.recogida_estado_por, '🚚', `Recogida «${inicioCapitalizar(s.recogida_estado)}» · siniestro ${ref}`, s.id);
    add(s.cobrado_en, s.cobrado_por, '💶', `Marcó como cobrado el siniestro ${ref}`, s.id);
    add(s.anulado_en, s.anulado_por, '✖️', `Anuló el siniestro ${ref}`, s.id);
  });
  inicioDatos.acciones.forEach(a => {
    let icono = '📌', texto = a.accion;
    if (a.accion === 'Enviar informe a agencias') {
      icono = '📨';
      const [fecha, agencias] = String(a.detalle || '').split(' — ');
      texto = `Envió el informe del ${fecha ? fecha.slice(0, 5) : 'día'}${agencias ? ' a ' + agencias : ' a las agencias'}`;
    } else if (a.accion === 'Enviar resumen mensual a agencia') {
      icono = '📊'; texto = `Envió el resumen mensual${a.detalle ? ' · ' + a.detalle : ''}`;
    } else if (a.accion === 'Cambio de agencia programado aplicado') {
      icono = '🔀'; texto = `Cambio de agencia aplicado · ${String(a.detalle || '').replace(/\s*\(programado por.*\)$/, '')}`;
    } else if (a.accion === 'Programar cambio de agencia') {
      icono = '🗓️'; texto = `Programó un cambio de agencia · ${a.detalle || ''}`;
    } else if (a.accion === 'Mover tienda de agencia') {
      icono = '🔀'; texto = `Cambió de agencia una tienda · ${a.detalle || ''}`;
    }
    add(a.creado_en, a.usuario, icono, texto, null);
  });
  // Solo las 6 últimas (para ver más, "Ver todo →" abre el Registro de auditoría)
  return eventos.sort((a, b) => b.t - a.t).slice(0, 6);
}

function inicioPintarActividad() {
  const el = document.getElementById('inicioActividad');
  if (!el) return;
  const eventos = inicioEventosActividad();
  if (!eventos.length) { el.innerHTML = '<p class="inicio-vacio">Sin actividad en los últimos 14 días.</p>'; return; }
  el.innerHTML = eventos.map(e => {
    const automatico = /^(AUTOM[ÁA]TICO|SISTEMA)$/i.test(e.por);
    const nombre = automatico ? 'Automático' : inicioCapitalizar(e.por);
    return `
      <div class="inicio-act${e.siniestroId ? ' clicable' : ''}"${e.siniestroId ? ` data-siniestro="${e.siniestroId}" role="button" tabindex="0" title="Abrir el siniestro Nº ${e.siniestroId}"` : ''}>
        <span class="inicio-act-avatar${automatico ? ' auto' : ''}">${automatico ? '⚙' : escapeHtml(inicioIniciales(e.por))}</span>
        <div class="inicio-act-txt"><b>${escapeHtml(e.texto)}</b><span>${escapeHtml(nombre)} · ${escapeHtml(inicioCuando(e.en))}</span></div>
        <span class="inicio-act-icono">${e.icono}</span>
      </div>`;
  }).join('');
  el.querySelectorAll('[data-siniestro]').forEach(fila => {
    const abrir = () => inicioAbrirSiniestro(Number(fila.dataset.siniestro));
    fila.addEventListener('click', abrir);
    fila.addEventListener('keydown', ev => { if (ev.key === 'Enter') abrir(); });
  });
}

async function inicioPuedeSalir() {
  if (typeof confirmarDescartarEdicionHistorial === 'function' && !(await confirmarDescartarEdicionHistorial())) return false;
  if (typeof confirmarDescartarEdicionGravedadMotivos === 'function' && !(await confirmarDescartarEdicionGravedadMotivos())) return false;
  return true;
}

async function inicioAbrirSiniestro(id) {
  if (!(await inicioPuedeSalir())) return;
  activarVista('panel-siniestros');
  if (typeof cargarPanelSiniestros === 'function') await cargarPanelSiniestros();
  if (typeof abrirModalPanelSiniestro === 'function') abrirModalPanelSiniestro(id);
}

async function inicioIrA(vista) {
  if (!(await inicioPuedeSalir())) return;
  activarVista(vista);
  if (vista === 'incidencias' && typeof renderVistaIncidencias === 'function') renderVistaIncidencias();
  if (vista === 'siniestros' && typeof renderVistaSiniestros === 'function') renderVistaSiniestros();
  if (vista === 'panel-siniestros' && typeof cargarPanelSiniestros === 'function') cargarPanelSiniestros();
  if (vista === 'config-auditoria' && typeof prepararVistaAuditoria === 'function') prepararVistaAuditoria();
}

// Tarjetas de arriba: cada una lleva a su pantalla (data-view; con
// data-view, permisos-aviso.js no las trata como botones de acción para
// los usuarios de solo lectura).
document.querySelectorAll('.inicio-kpi[data-view]').forEach(card => {
  card.addEventListener('click', () => inicioIrA(card.dataset.view));
});

// "Ver todo →" de Actividad reciente: abre el Registro de auditoría. Sin
// el permiso "ver_auditoria", permisos-aviso.js intercepta el clic antes
// (por el data-view="config-auditoria") y sale el aviso "Sin permiso".
document.getElementById('btnActividadVerTodo')?.addEventListener('click', () => inicioIrA('config-auditoria'));

// Primera carga con la sesión ya guardada: cuando navegacion.js lanza
// cargarKPIs() al abrir la página, este archivo aún no se había cargado.
window.addEventListener('load', () => inicioRefrescar());
