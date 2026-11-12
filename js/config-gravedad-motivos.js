// ---------------------------------------------------------------
// Configuración: Gravedad de motivos
// ---------------------------------------------------------------
// Permite reclasificar cada motivo de incidencia en Leve/Moderado/Grave
// y reordenarlo dentro de su nivel. Esto sustituye la clasificación que
// antes estaba fija en el código (regex en filtros-motivos.js y
// codigos-informe.js) por una tabla editable: `config_gravedad_motivos`.
//
// Usado por:
//   - calcularTipo() en filtros-motivos.js → nivel de cada incidencia
//     (tipo LEVE/MODERADO/GRAVE, que se guarda al vuelo en cada
//     incidencia; cambiar el orden aquí NO recalcula las ya guardadas,
//     es una foto histórica, igual que el resto de datos de la app).
//   - severidad()/codigoDeMotivos() en codigos-informe.js → qué motivo
//     "gana" en el código del reporte mensual cuando hay varios
//     marcados el mismo día; el orden dentro del nivel decide el
//     desempate entre dos motivos del mismo nivel.
//
// Caché en memoria: se carga en cuanto hay sesión (igual que cargarKPIs
// en navegacion.js) para que esté lista de forma síncrona cuando el
// usuario interactúa con los checkboxes de motivos. Si por lo que sea
// no ha cargado a tiempo (fallo de red, primera carga muy rápida), se
// usa como respaldo la misma clasificación que había hardcodeada antes,
// así el comportamiento nunca cambia solo porque la caché no llegó.
//
// Requiere: sb, escapeHtml, modalAlert, modalConfirm (supabase-client.js
// / ui-modal.js), tienePermiso (permisos.js).

// Respaldo: clasificación y orden que había hardcodeada antes de esta
// pantalla. Se usa solo si la tabla no ha cargado todavía o falla.
const GRAVEDAD_MOTIVOS_RESPALDO = [
  { motivo: 'ROTURA SIN INCIDENCIA',  nivel: 'leve',     orden: 1 },
  { motivo: 'ROTURA ALMACEN',         nivel: 'leve',     orden: 2 },
  { motivo: 'RETRASO LEVE',           nivel: 'leve',     orden: 3 },
  { motivo: 'PALETS NO RETIRADOS',    nivel: 'leve',     orden: 4 },
  { motivo: 'DESCARGA MANUAL',        nivel: 'leve',     orden: 5 },
  { motivo: 'ROTURA CONFIRMADA',      nivel: 'moderado', orden: 1 },
  { motivo: 'PALETS SIN VIGILANCIA',  nivel: 'moderado', orden: 2 },
  { motivo: 'MEZCLAN FECHAS',         nivel: 'moderado', orden: 3 },
  { motivo: 'RETRASO IMPORTANTE',     nivel: 'moderado', orden: 4 },
  { motivo: 'ADELANTAN ENTREGA',      nivel: 'moderado', orden: 5 },
  { motivo: 'INCOMPLETO',             nivel: 'moderado', orden: 6 },
  { motivo: 'PALET REMONTADO',        nivel: 'moderado', orden: 7 },
  { motivo: 'FALTAS',                 nivel: 'grave',    orden: 1 },
  { motivo: 'NO ENTREGAN',            nivel: 'grave',    orden: 2 },
  { motivo: 'PALET PERDIDO',          nivel: 'grave',    orden: 3 },
  { motivo: 'PALET MANIPULADO',       nivel: 'grave',    orden: 4 }
];

const NIVELES_GRAVEDAD = ['leve', 'moderado', 'grave'];
const ETIQUETA_NIVEL = { leve: 'Leve', moderado: 'Moderado', grave: 'Grave' };

let gravedadMotivosCache = null; // null = aún no cargada; luego: [{motivo,nivel,orden}, ...]

function mapaGravedadMotivos() {
  const fuente = gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO;
  const mapa = {};
  fuente.forEach(f => { mapa[f.motivo] = f; });
  return mapa;
}

// Nivel ('leve'/'moderado'/'grave') de un motivo, o null si no tiene
// gravedad asignada (p.ej. los motivos "pendientes de confirmar").
function nivelDeMotivo(motivo) {
  return mapaGravedadMotivos()[motivo]?.nivel || null;
}

// Posición dentro de su nivel (menor = más prioritario en el desempate).
function ordenDeMotivo(motivo) {
  return mapaGravedadMotivos()[motivo]?.orden ?? 999;
}

async function cargarGravedadMotivos() {
  try {
    const { data, error } = await sb.from('config_gravedad_motivos').select('motivo, nivel, orden').order('nivel').order('orden');
    if (error) throw error;
    if (data && data.length) gravedadMotivosCache = data;
  } catch (err) {
    console.error('Error cargando la gravedad de motivos (se usa el respaldo):', err);
  }
  // Códigos del Reporte mensual (número, texto de la leyenda y color):
  // desde 2026-11 están en la tabla `config_codigos_informe`, editables
  // aquí. Si no cargan, se queda la lista fija de codigos-informe.js.
  try {
    const { data, error } = await sb.from('config_codigos_informe').select('*').order('orden');
    if (error) throw error;
    aplicarCodigosInforme(data);
  } catch (err) {
    console.error('Error cargando los códigos del reporte (se usa el respaldo):', err);
  }
  sincronizarMotivosDinamicos();
}

// ---------------------------------------------------------------
// Motivos nuevos y colores de los códigos (desde 2026-11)
// ---------------------------------------------------------------
// Los motivos que se añaden desde esta pantalla viven solo en las tablas
// (config_gravedad_motivos + config_codigos_informe). Al cargar, se meten
// en la lista MOTIVOS de filtros-motivos.js (al final de su nivel) y sus
// códigos en CODIGOS_INFORME (codigos-informe.js), así salen en todos los
// sitios igual que los de siempre: desplegable del informe, filtros,
// Reporte mensual, leyenda del PDF y Análisis.

// Reemplaza el contenido de CODIGOS_INFORME (mismo array, para que el
// resto de archivos que lo usan vean los cambios).
function aplicarCodigosInforme(filas) {
  const arr = window.CODIGOS_INFORME;
  if (!arr || !filas || !filas.length) return;
  arr.length = 0;
  filas.slice().sort((a, b) => a.orden - b.orden).forEach(f => {
    const c = { codigo: f.codigo, label: f.label, color: f.color, texto: f.texto, motivo: f.motivo };
    if (f.submotivo) c.submotivo = f.submotivo;
    arr.push(c);
  });
}

function sincronizarMotivosDinamicos() {
  if (typeof MOTIVOS === 'undefined') return;
  const fuente = (gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO).slice()
    .sort((a, b) => NIVELES_GRAVEDAD.indexOf(a.nivel) - NIVELES_GRAVEDAD.indexOf(b.nivel) || a.orden - b.orden);
  let anadidos = false;
  fuente.forEach(f => {
    if (MOTIVOS.some(m => m.v === f.motivo)) return;
    // Al final de los de su mismo nivel (o, si no hay ninguno, tras los
    // de los niveles anteriores).
    const nivelesHasta = NIVELES_GRAVEDAD.slice(0, NIVELES_GRAVEDAD.indexOf(f.nivel) + 1);
    let pos = -1;
    MOTIVOS.forEach((m, i) => { if (m.clase === 'pendiente' || nivelesHasta.includes(m.clase)) pos = i; });
    MOTIVOS.splice(pos + 1, 0, { v: f.motivo, clase: f.nivel });
    anadidos = true;
  });
  // Las listas de los filtros se construyen una sola vez: si ha entrado un
  // motivo nuevo, se marcan para que se vuelvan a construir.
  if (anadidos) {
    ['filtrosMotivosLista', 'analisisFiltrosMotivosLista', 'rmFiltrosMotivosLista'].forEach(id => {
      const el = document.getElementById(id);
      if (el) delete el.dataset.built;
    });
  }
}

// Texto del código en blanco o negro según lo oscuro que sea el fondo.
function textoParaFondo(hex) {
  const h = String(hex || '#FFFFFF').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#12181F' : '#FFFFFF';
}

const PALETA_CODIGOS = [
  '#E6E1D8', '#FFF200', '#FF0000', '#00B050', '#00B0F0', '#7030A0', '#FFA500', '#A6A6A6',
  '#92D050', '#C00000', '#BDD7EE', '#8EA9DB', '#F4B183', '#ED7D31', '#000000', '#808080',
  '#C71585', '#008080', '#1B6DE0', '#FFD966', '#C6E0B4', '#BFBFBF', '#5B2C6F', '#2E7D32'
];

// Copia de trabajo de los códigos mientras se cambian colores (se guarda
// con el mismo botón 💾 Guardar que la gravedad).
let codigosEdicion = null;

function codigosBase() {
  return (window.CODIGOS_INFORME || []).map(c => ({ ...c }));
}

function hayCambiosColoresCodigos() {
  if (!codigosEdicion) return false;
  const base = {};
  codigosBase().forEach(c => { base[c.codigo] = c; });
  return codigosEdicion.some(c => !base[c.codigo] || base[c.codigo].color !== c.color);
}

function cerrarPaletaCodigo() {
  document.querySelector('.gm-pop')?.remove();
  document.querySelectorAll('.gm-chip.sel').forEach(el => el.classList.remove('sel'));
}

function abrirPaletaCodigo(chip) {
  if (!tienePermiso('config_gravedad_motivos')) { mostrarModalSinPermiso(); return; }
  const yaAbierta = chip.classList.contains('sel');
  cerrarPaletaCodigo();
  if (yaAbierta) return;
  const c = codigosEdicion.find(x => x.codigo === chip.dataset.codigo);
  if (!c) return;
  chip.classList.add('sel');

  const pop = document.createElement('div');
  pop.className = 'gm-pop';
  const nombre = c.label.charAt(0) + c.label.slice(1).toLowerCase();
  pop.innerHTML = `
    <h4>Color del código ${escapeHtml(c.codigo)} · ${escapeHtml(nombre)}</h4>
    <div class="gm-pal">${PALETA_CODIGOS.map(col => `<button type="button" class="gm-color${col.toUpperCase() === c.color.toUpperCase() ? ' sel' : ''}" data-color="${col}" style="background:${col}" title="${col}"></button>`).join('')}</div>
    <label class="gm-otro"><input type="color" value="${escapeHtml(c.color)}"> Otro color…</label>`;
  document.body.appendChild(pop);
  const r = chip.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left + window.scrollX)) + 'px';
  pop.style.top = (r.bottom + window.scrollY + 6) + 'px';

  const aplicar = (col) => {
    c.color = col.toUpperCase();
    c.texto = textoParaFondo(c.color);
    pintarGravedadMotivos();
  };
  pop.querySelectorAll('.gm-color').forEach(b => b.addEventListener('click', () => aplicar(b.dataset.color)));
  pop.querySelector('input[type="color"]').addEventListener('change', (e) => aplicar(e.target.value));
  pop.addEventListener('click', (e) => e.stopPropagation());
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.gm-pop') && !e.target.closest('.gm-chip')) cerrarPaletaCodigo();
});

// ---------------------------------------------------------------
// Pantalla: Configuración → Gravedad de motivos
// ---------------------------------------------------------------

// Copia de trabajo mientras se edita en pantalla (no se guarda hasta
// pulsar "Guardar").
let gravedadMotivosEdicion = null;

async function renderVistaGravedadMotivos() {
  const cont = document.getElementById('contenidoGravedadMotivos');
  if (!cont) return;
  cont.innerHTML = '<div class="card"><div class="empty"><p>Cargando…</p></div></div>';

  if (!gravedadMotivosCache) await cargarGravedadMotivos();
  gravedadMotivosEdicion = (gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO).map(f => ({ ...f }));
  codigosEdicion = codigosBase();

  pintarGravedadMotivos();
}

// ¿Hay algo movido/reclasificado en pantalla que todavía no se ha
// guardado? Compara la copia de trabajo contra la última versión
// guardada (gravedadMotivosCache); si se deshace un cambio a mano
// (se vuelve a dejar como estaba) no cuenta como pendiente.
function hayCambiosSinGuardarGravedadMotivos() {
  if (!gravedadMotivosEdicion) return false;
  if (hayCambiosColoresCodigos()) return true;
  const base = gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO;
  if (gravedadMotivosEdicion.length !== base.length) return true;
  const baseMapa = {};
  base.forEach(f => { baseMapa[f.motivo] = f; });
  return gravedadMotivosEdicion.some(f => {
    const b = baseMapa[f.motivo];
    return !b || b.nivel !== f.nivel || b.orden !== f.orden;
  });
}

// Mismo patrón que confirmarDescartarEdicionHistorial() (historial-editar.js):
// si hay cambios sin guardar, pregunta antes de dejar la pantalla. Devuelve
// true si se puede continuar (no había cambios, o se confirmó descartarlos).
async function confirmarDescartarEdicionGravedadMotivos() {
  if (!hayCambiosSinGuardarGravedadMotivos()) return true;
  const ok = await modalConfirm('Tienes cambios sin guardar en Tipos incidencias. ¿Descartarlos?', { titulo: 'Descartar cambios', danger: true, textoOk: 'Descartar' });
  if (!ok) return false;
  // Descarta de verdad el borrador: si no, la próxima vez se seguiría
  // detectando el mismo cambio como pendiente y volvería a preguntar.
  gravedadMotivosEdicion = (gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO).map(f => ({ ...f }));
  codigosEdicion = codigosBase();
  return true;
}

window.addEventListener('beforeunload', (e) => {
  if (window.RECARGA_POR_ACTUALIZACION_) return; // recarga al actualizar (actualizaciones.js)
  if (hayCambiosSinGuardarGravedadMotivos()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function pintarGravedadMotivos() {
  const cont = document.getElementById('contenidoGravedadMotivos');
  if (!cont) return;
  cerrarPaletaCodigo();

  cont.innerHTML = `
    <div class="gravedad-columnas">
      ${NIVELES_GRAVEDAD.map(nivel => `
        <div class="gravedad-col gravedad-col-${nivel}">
          <h3>${ETIQUETA_NIVEL[nivel]}</h3>
          <div class="gravedad-lista" data-nivel="${nivel}">
            ${gravedadMotivosEdicion
              .filter(f => f.nivel === nivel)
              .sort((a, b) => a.orden - b.orden)
              .map((f, idx, arr) => `
                <div class="gravedad-fila" data-motivo="${escapeHtml(f.motivo)}">
                  <span class="gravedad-fila-nombre gm-nombre"><span class="gm-chips">${(codigosEdicion || []).filter(c => c.motivo === f.motivo).map(c => `<button type="button" class="rm-celda-codigo gm-chip" data-codigo="${escapeHtml(c.codigo)}" title="${escapeHtml(c.label)} · pulsa para cambiar el color" style="background:${escapeHtml(c.color)}; color:${escapeHtml(c.texto)};">${escapeHtml(c.codigo)}</button>`).join('')}</span>${escapeHtml(f.motivo.charAt(0) + f.motivo.slice(1).toLowerCase())}</span>
                  <div class="gravedad-fila-acciones">
                    <button type="button" class="gravedad-btn" data-mover="arriba" title="Subir" ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button type="button" class="gravedad-btn" data-mover="abajo" title="Bajar" ${idx === arr.length - 1 ? 'disabled' : ''}>▼</button>
                    <button type="button" class="mini-btn" data-cambiar-nivel title="Cambiar de nivel">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8h13M17 8l-4-4M17 8l-4 4M20 16H7M7 16l4-4M7 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </div>
                </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;

  cont.querySelectorAll('[data-mover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fila = btn.closest('.gravedad-fila');
      moverMotivo(fila.dataset.motivo, btn.dataset.mover);
    });
  });

  cont.querySelectorAll('.gm-chip').forEach(chip => {
    chip.addEventListener('click', (e) => { e.stopPropagation(); abrirPaletaCodigo(chip); });
  });

  cont.querySelectorAll('[data-cambiar-nivel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fila = btn.closest('.gravedad-fila');
      abrirCambiarNivelMotivo(fila.dataset.motivo);
    });
  });
}

async function abrirCambiarNivelMotivo(motivo) {
  const item = gravedadMotivosEdicion.find(f => f.motivo === motivo);
  if (!item) return;
  const opciones = NIVELES_GRAVEDAD.map(n => ({ id: n, nombre: ETIQUETA_NIVEL[n] }));
  const nuevoNivel = await modalSeleccionar(
    `Nivel de gravedad de "${motivo.charAt(0) + motivo.slice(1).toLowerCase()}":`,
    opciones,
    { titulo: 'Cambiar de nivel', textoOk: 'Cambiar', valorInicial: item.nivel }
  );
  if (!nuevoNivel || nuevoNivel === item.nivel) return;
  cambiarNivelMotivo(motivo, nuevoNivel);
}

function moverMotivo(motivo, direccion) {
  const item = gravedadMotivosEdicion.find(f => f.motivo === motivo);
  if (!item) return;
  const delMismoNivel = gravedadMotivosEdicion
    .filter(f => f.nivel === item.nivel)
    .sort((a, b) => a.orden - b.orden);
  const pos = delMismoNivel.findIndex(f => f.motivo === motivo);
  const posDestino = direccion === 'arriba' ? pos - 1 : pos + 1;
  if (posDestino < 0 || posDestino >= delMismoNivel.length) return;

  // Intercambia el orden entre la fila movida y la de destino.
  const vecino = delMismoNivel[posDestino];
  const ordenOriginal = item.orden;
  item.orden = vecino.orden;
  vecino.orden = ordenOriginal;

  pintarGravedadMotivos();
}

function cambiarNivelMotivo(motivo, nuevoNivel) {
  const item = gravedadMotivosEdicion.find(f => f.motivo === motivo);
  if (!item) return;
  item.nivel = nuevoNivel;
  // Al cambiar de nivel, pasa al final del nuevo nivel.
  const maxOrden = Math.max(0, ...gravedadMotivosEdicion.filter(f => f.nivel === nuevoNivel && f.motivo !== motivo).map(f => f.orden));
  item.orden = maxOrden + 1;
  pintarGravedadMotivos();
}

// Resumen legible de lo que cambió, para el detalle del Registro de
// auditoría: reclasificaciones de nivel (motivo, de dónde a dónde) y,
// si solo cambió el orden dentro de un nivel, en qué niveles.
function resumenCambiosGravedadMotivos(antes, despues) {
  const mapaAntes = {};
  antes.forEach(f => { mapaAntes[f.motivo] = f; });
  const cambiosNivel = [];
  const nivelesConOrdenCambiado = new Set();
  despues.forEach(f => {
    const a = mapaAntes[f.motivo];
    if (!a) return;
    if (a.nivel !== f.nivel) {
      const nombre = f.motivo.charAt(0) + f.motivo.slice(1).toLowerCase();
      cambiosNivel.push(`${nombre}: ${ETIQUETA_NIVEL[a.nivel]} → ${ETIQUETA_NIVEL[f.nivel]}`);
    } else if (a.orden !== f.orden) {
      nivelesConOrdenCambiado.add(f.nivel);
    }
  });
  const partes = [...cambiosNivel];
  if (nivelesConOrdenCambiado.size) {
    partes.push(`Orden cambiado dentro de: ${[...nivelesConOrdenCambiado].map(n => ETIQUETA_NIVEL[n]).join(', ')}`);
  }
  return partes.join(' · ') || null;
}

async function guardarGravedadMotivos() {
  if (!tienePermiso('config_gravedad_motivos')) { mostrarModalSinPermiso(); return; }
  const btn = document.getElementById('btnGuardarGravedadMotivos');
  btn.disabled = true;
  try {
    // Renumera cada nivel de forma consecutiva (1,2,3…) antes de guardar,
    // por si algún intercambio dejó huecos.
    NIVELES_GRAVEDAD.forEach(nivel => {
      gravedadMotivosEdicion
        .filter(f => f.nivel === nivel)
        .sort((a, b) => a.orden - b.orden)
        .forEach((f, idx) => { f.orden = idx + 1; });
    });

    const antesDeGuardar = gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO;

    const { error } = await sb.from('config_gravedad_motivos')
      .upsert(gravedadMotivosEdicion.map(f => ({ motivo: f.motivo, nivel: f.nivel, orden: f.orden })), { onConflict: 'motivo' });
    if (error) throw error;

    // Colores de los códigos que se hayan cambiado.
    const baseCodigos = {};
    codigosBase().forEach(c => { baseCodigos[c.codigo] = c; });
    const coloresCambiados = (codigosEdicion || []).filter(c => baseCodigos[c.codigo] && baseCodigos[c.codigo].color !== c.color);
    for (const c of coloresCambiados) {
      const { error: eCol } = await sb.from('config_codigos_informe').update({ color: c.color, texto: c.texto }).eq('codigo', c.codigo);
      if (eCol) throw eCol;
    }
    coloresCambiados.forEach(c => {
      const enUso = (window.CODIGOS_INFORME || []).find(x => x.codigo === c.codigo);
      if (enUso) { enUso.color = c.color; enUso.texto = c.texto; }
    });

    const resumenGravedad = resumenCambiosGravedadMotivos(antesDeGuardar, gravedadMotivosEdicion);
    const resumenColores = coloresCambiados.length ? `Color cambiado: ${coloresCambiados.map(c => `código ${c.codigo}`).join(', ')}` : '';
    if (typeof registrarAccion === 'function' && (resumenGravedad || resumenColores)) {
      registrarAccion('gravedad_motivos', 'Cambiar gravedad de motivos', [resumenGravedad, resumenColores].filter(Boolean).join(' · '));
    }

    gravedadMotivosCache = gravedadMotivosEdicion.map(f => ({ ...f }));
    codigosEdicion = codigosBase();
    pintarGravedadMotivos();
    const ok = document.getElementById('gravedadGuardadoOk');
    if (ok) {
      ok.style.display = 'inline';
      setTimeout(() => { ok.style.display = 'none'; }, 2500);
    }
  } catch (err) {
    console.error('Error guardando la gravedad de motivos:', err);
    await modalAlert('No se pudo guardar. Inténtalo de nuevo.', { titulo: 'Error' });
  } finally {
    const btnActual = document.getElementById('btnGuardarGravedadMotivos');
    if (btnActual) btnActual.disabled = false;
  }
}

// Carga la caché en cuanto hay sesión, para que calcularTipo()/
// severidad() la tengan lista antes de que el usuario interactúe.
if (typeof sesionActiva !== 'undefined' && sesionActiva) cargarGravedadMotivos();

document.querySelectorAll('[data-view="config-gravedad-motivos"]').forEach(el => {
  el.addEventListener('click', () => renderVistaGravedadMotivos());
});

const btnGuardarGravedadMotivosEl = document.getElementById('btnGuardarGravedadMotivos');
if (btnGuardarGravedadMotivosEl) btnGuardarGravedadMotivosEl.addEventListener('click', guardarGravedadMotivos);


// ---------------- ➕ Nuevo motivo ----------------
// Se guarda al momento (no espera al botón 💾 Guardar): crea la fila de
// gravedad (al final de su nivel) y su código del Reporte mensual. No se
// pueden quitar motivos desde aquí: hay incidencias guardadas con ellos.

// Sin nada elegido al abrir: el botón "Añadir motivo" no se enciende
// hasta tener nombre, texto de la leyenda, gravedad y color.
let nmNivel = null;
let nmColor = null;

function siguienteCodigoLibre() {
  const nums = (window.CODIGOS_INFORME || []).map(c => parseInt(c.codigo, 10)).filter(n => !isNaN(n));
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

function pintarVistaPreviaNuevoMotivo() {
  const cod = document.getElementById('nmCodigo').value.trim() || '?';
  const nombre = document.getElementById('nmNombre').value.trim();
  const leyenda = document.getElementById('nmLabel').value.trim();
  const chip = document.getElementById('nmPreviewCodigo');
  chip.textContent = cod;
  chip.style.background = nmColor || '#E1E4E8';
  chip.style.color = nmColor ? textoParaFondo(nmColor) : '#5A6473';
  document.getElementById('nmPreviewLabel').textContent = (leyenda || 'Texto en los informes').toUpperCase();
  document.getElementById('nmPreviewLabel').style.opacity = leyenda ? '' : '.45';
  document.querySelectorAll('#nmPaleta .gm-color').forEach(b => b.classList.toggle('sel', !!nmColor && b.dataset.color.toUpperCase() === nmColor.toUpperCase()));
  document.querySelector('#nmColorOtro')?.closest('.gm-otro')?.classList.toggle('sel', !!nmColor && !PALETA_CODIGOS.some(c => c.toUpperCase() === nmColor.toUpperCase()));
  document.querySelectorAll('#nmNivelToggle .toggle-seg-btn').forEach(b => b.classList.toggle('activo', b.dataset.nivel === nmNivel));
  document.getElementById('btnGuardarNuevoMotivo').disabled = !(nombre && leyenda && nmNivel && nmColor);
}

function abrirModalNuevoMotivo() {
  if (!tienePermiso('config_gravedad_motivos')) { mostrarModalSinPermiso(); return; }
  nmNivel = null;
  nmColor = null;
  document.getElementById('nmNombre').value = '';
  document.getElementById('nmLabel').value = '';
  document.getElementById('nmCodigo').value = siguienteCodigoLibre();
  document.getElementById('nmColorOtro').value = '#808080';
  document.getElementById('nmError').style.display = 'none';
  document.getElementById('nmPaleta').innerHTML = PALETA_CODIGOS.map(col =>
    `<button type="button" class="gm-color" data-color="${col}" style="background:${col}" title="${col}"></button>`).join('');
  document.querySelectorAll('#nmPaleta .gm-color').forEach(b => b.addEventListener('click', () => {
    nmColor = b.dataset.color; document.getElementById('nmColorOtro').value = nmColor; pintarVistaPreviaNuevoMotivo();
  }));
  pintarVistaPreviaNuevoMotivo();
  document.getElementById('nuevoMotivoModalOverlay').classList.add('show');
  setTimeout(() => document.getElementById('nmNombre').focus(), 50);
}

function cerrarModalNuevoMotivo() {
  document.getElementById('nuevoMotivoModalOverlay').classList.remove('show');
}

async function guardarNuevoMotivo() {
  const nombre = document.getElementById('nmNombre').value.trim().toUpperCase().replace(/\s+/g, ' ');
  const label = document.getElementById('nmLabel').value.trim().toUpperCase().replace(/\s+/g, ' ');
  // El código no se escribe: lo pone la app (siguiente número libre).
  const codigo = siguienteCodigoLibre();
  const errEl = document.getElementById('nmError');
  const fallo = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
  errEl.style.display = 'none';

  if (!nombre) return fallo('Escribe el nombre del motivo.');
  if (!label) return fallo('Escribe el texto en los informes.');
  if (!nmNivel) return fallo('Elige la gravedad.');
  if (!nmColor) return fallo('Elige el color del código.');
  const todosLosSubmotivos = window.SUBMOTIVOS_POR_MOTIVO ? Object.values(window.SUBMOTIVOS_POR_MOTIVO).flat() : [];
  const existe = (typeof MOTIVOS !== 'undefined' && MOTIVOS.some(m => m.v === nombre))
    || (gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO).some(f => f.motivo === nombre)
    || todosLosSubmotivos.includes(nombre);
  if (existe) return fallo('Ya existe un motivo con ese nombre.');
  if ((window.CODIGOS_INFORME || []).some(c => String(c.codigo).toUpperCase() === codigo)) return fallo(`El código ${codigo} ya lo usa otro motivo.`);

  const btn = document.getElementById('btnGuardarNuevoMotivo');
  btn.disabled = true;
  try {
    // Gravedad: al final de su nivel (según lo guardado).
    const guardados = gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO;
    const orden = Math.max(0, ...guardados.filter(f => f.nivel === nmNivel).map(f => f.orden)) + 1;
    const { error: eG } = await sb.from('config_gravedad_motivos').insert({ motivo: nombre, nivel: nmNivel, orden });
    if (eG) throw eG;

    const ordenCodigo = (window.CODIGOS_INFORME || []).length + 1;
    const filaCodigo = { codigo, label, color: nmColor.toUpperCase(), texto: textoParaFondo(nmColor), motivo: nombre, submotivo: null, orden: ordenCodigo };
    const { error: eC } = await sb.from('config_codigos_informe').insert(filaCodigo);
    if (eC) {
      // Sin código no vale: se deshace la fila de gravedad.
      await sb.from('config_gravedad_motivos').delete().eq('motivo', nombre);
      throw eC;
    }

    if (typeof registrarAccion === 'function') {
      registrarAccion('gravedad_motivos', 'Añadir motivo', `${nombre} (${ETIQUETA_NIVEL[nmNivel]}, código ${codigo})`);
    }

    // Al día en esta sesión, sin perder lo que hubiera sin guardar en pantalla.
    const nuevaGravedad = { motivo: nombre, nivel: nmNivel, orden };
    gravedadMotivosCache = [...(gravedadMotivosCache || GRAVEDAD_MOTIVOS_RESPALDO.map(f => ({ ...f }))), nuevaGravedad];
    if (gravedadMotivosEdicion) gravedadMotivosEdicion.push({ ...nuevaGravedad });
    const c = { codigo, label, color: filaCodigo.color, texto: filaCodigo.texto, motivo: nombre };
    (window.CODIGOS_INFORME || []).push(c);
    if (codigosEdicion) codigosEdicion.push({ ...c });
    sincronizarMotivosDinamicos();

    cerrarModalNuevoMotivo();
    pintarGravedadMotivos();
    if (typeof mostrarToast === 'function') mostrarToast(`Motivo "${nombre}" añadido`);
  } catch (err) {
    console.error('Error añadiendo el motivo:', err);
    fallo(err.message || 'No se pudo añadir el motivo.');
  } finally {
    pintarVistaPreviaNuevoMotivo();
  }
}

document.getElementById('btnNuevoMotivo')?.addEventListener('click', abrirModalNuevoMotivo);
document.getElementById('btnCerrarNuevoMotivo')?.addEventListener('click', cerrarModalNuevoMotivo);
document.getElementById('btnCancelarNuevoMotivo')?.addEventListener('click', cerrarModalNuevoMotivo);
document.getElementById('btnGuardarNuevoMotivo')?.addEventListener('click', guardarNuevoMotivo);
['nmNombre', 'nmLabel'].forEach(id => document.getElementById(id)?.addEventListener('input', pintarVistaPreviaNuevoMotivo));
document.getElementById('nmColorOtro')?.addEventListener('input', (e) => { nmColor = e.target.value; pintarVistaPreviaNuevoMotivo(); });
document.querySelectorAll('#nmNivelToggle .toggle-seg-btn').forEach(b => b.addEventListener('click', () => { nmNivel = b.dataset.nivel; pintarVistaPreviaNuevoMotivo(); }));
