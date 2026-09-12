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
}

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

  pintarGravedadMotivos();
}

function pintarGravedadMotivos() {
  const cont = document.getElementById('contenidoGravedadMotivos');
  if (!cont) return;

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
                  <span class="gravedad-fila-nombre">${escapeHtml(f.motivo.charAt(0) + f.motivo.slice(1).toLowerCase())}</span>
                  <div class="gravedad-fila-acciones">
                    <button type="button" class="gravedad-btn" data-mover="arriba" title="Subir" ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button type="button" class="gravedad-btn" data-mover="abajo" title="Bajar" ${idx === arr.length - 1 ? 'disabled' : ''}>▼</button>
                    <select class="gravedad-select" data-cambiar-nivel>
                      ${NIVELES_GRAVEDAD.map(n => `<option value="${n}" ${n === nivel ? 'selected' : ''}>${ETIQUETA_NIVEL[n]}</option>`).join('')}
                    </select>
                  </div>
                </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>
    <div class="gravedad-guardar-row">
      <button type="button" class="btn primary" id="btnGuardarGravedadMotivos">💾 Guardar</button>
      <span id="gravedadGuardadoOk" class="gravedad-guardado-ok" style="display:none;">Guardado ✓</span>
    </div>`;

  cont.querySelectorAll('[data-mover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fila = btn.closest('.gravedad-fila');
      moverMotivo(fila.dataset.motivo, btn.dataset.mover);
    });
  });

  cont.querySelectorAll('[data-cambiar-nivel]').forEach(sel => {
    sel.addEventListener('change', () => {
      const fila = sel.closest('.gravedad-fila');
      cambiarNivelMotivo(fila.dataset.motivo, sel.value);
    });
  });

  document.getElementById('btnGuardarGravedadMotivos').addEventListener('click', guardarGravedadMotivos);
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

    const { error } = await sb.from('config_gravedad_motivos')
      .upsert(gravedadMotivosEdicion.map(f => ({ motivo: f.motivo, nivel: f.nivel, orden: f.orden })), { onConflict: 'motivo' });
    if (error) throw error;

    gravedadMotivosCache = gravedadMotivosEdicion.map(f => ({ ...f }));
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
