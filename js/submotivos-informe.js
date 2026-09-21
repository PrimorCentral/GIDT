// js/submotivos-informe.js
// ---------------------------------------------------------------
// Precisar el motivo exacto de FALTAS / NO ENTREGAN (ver
// SUBMOTIVOS_POR_MOTIVO en codigos-informe.js) SIN modificar ninguna vista
// existente (Informe del día, Historial de informes, Historial de
// siniestros…): todo funciona por delegación de eventos sobre `document`,
// así que sigue funcionando aunque el HTML de esas vistas cambie.
//
// Cómo funciona:
//  1. Al marcar FALTAS o NO ENTREGAN, se pregunta el submotivo con el
//     modal ya existente (modalSeleccionar) ANTES de que la vista guarde
//     nada (listener en fase de captura), y se guarda como un checkbox
//     OCULTO más dentro de la misma fila <tr>, con class="i-motivo-check"
//     — por eso guardarIncidencia() / actualizarBorradorIncidencia() lo
//     incluyen solas al hacer
//     Array.from(tr.querySelectorAll('.i-motivo-check:checked'))...
//     Además, esas dos funciones llaman a completarSubmotivos() como red de
//     seguridad: nunca se guarda un NO ENTREGAN / FALTAS sin submotivo.
//  2. Al desmarcar FALTAS/NO ENTREGAN, o al pulsar "Quitar todos los
//     motivos" (.btn-borrar-motivos / .btn-borrar-motivos-hist), se limpia
//     el submotivo oculto correspondiente.
//  3. Al pintar una fila que ya tenía un submotivo guardado, se reconstruye
//     leyendo el atributo data-submotivo-guardado que motivosChecklistHtml()
//     (js/filtros-motivos.js) ya deja en el checkbox del motivo principal
//     — así no depende del texto visible (que ahora solo muestra el
//     motivo principal, sin el submotivo) ni de tocar el render de cada tabla.
//
// Requiere (ya cargados antes): SUBMOTIVOS_POR_MOTIVO (codigos-informe.js),
// modalSeleccionar (ui-modal.js), motivosChecklistHtml con el atributo
// data-submotivo-guardado (filtros-motivos.js).
//
// Nota sobre modalSeleccionar: internamente hace Number(valorSeleccionado),
// porque está pensado para IDs numéricos (agencias, tiendas…). Por eso aquí
// le pasamos el ÍNDICE de cada opción como "id", no el texto del submotivo.
// ---------------------------------------------------------------

function crearCheckboxOcultoSubmotivo(tr, valor, motivoPrincipal) {
  let hidden = tr.querySelector(`.i-motivo-check-submotivo[data-submotivo="${valor}"]`);
  if (!hidden) {
    hidden = document.createElement('input');
    hidden.type = 'checkbox';
    hidden.className = 'i-motivo-check i-motivo-check-submotivo';
    hidden.style.display = 'none';
    hidden.value = valor;
    hidden.dataset.submotivo = valor;
    if (motivoPrincipal) hidden.dataset.motivoPrincipal = motivoPrincipal;
    tr.appendChild(hidden);
  }
  hidden.checked = true;
  return hidden;
}

function quitarSubmotivosDe(tr, motivoPrincipal) {
  const opciones = (window.SUBMOTIVOS_POR_MOTIVO && window.SUBMOTIVOS_POR_MOTIVO[motivoPrincipal]) || [];
  tr.querySelectorAll('.i-motivo-check-submotivo').forEach(el => {
    if (opciones.includes(el.value)) el.remove();
  });
}

// Reconstruye los checkboxes ocultos de submotivo a partir del atributo
// data-submotivo-guardado que motivosChecklistHtml() deja en el checkbox
// del motivo principal (FALTAS / NO ENTREGAN) cuando la incidencia ya
// traía un submotivo guardado.
function restaurarSubmotivosDesdeAtributos(tr) {
  tr.querySelectorAll('.i-motivo-check[data-submotivo-guardado]').forEach(cb => {
    crearCheckboxOcultoSubmotivo(tr, cb.dataset.submotivoGuardado, cb.value);
  });
}

// Nº de modales "Precisar motivo" abiertos ahora mismo. Lo consulta la
// auto-actualización del Informe del día (informe-autorefresh.js) para no
// repintar las filas mientras el operario está eligiendo el submotivo.
window.submotivoModalAbiertos = 0;

function esCheckboxMotivoPrincipal(cb) {
  return cb instanceof HTMLInputElement && cb.type === 'checkbox' &&
    cb.classList.contains('i-motivo-check') &&
    !cb.classList.contains('i-motivo-check-submotivo');
}

// Devuelve los motivos principales (FALTAS / NO ENTREGAN) que aparecen en
// `motivos` SIN ninguno de sus submotivos. Si devuelve algo, esa lista de
// motivos NO se puede guardar todavía.
function motivosSinSubmotivo(motivos) {
  const mapa = window.SUBMOTIVOS_POR_MOTIVO || {};
  const arr = motivos || [];
  return Object.keys(mapa).filter(p => arr.includes(p) && !mapa[p].some(o => arr.includes(o)));
}

async function preguntarSubmotivo(motivoPrincipal, opciones) {
  window.submotivoModalAbiertos += 1;
  try {
    const idx = await modalSeleccionar(
      `¿Cuál es el motivo exacto de "${motivoPrincipal.charAt(0)}${motivoPrincipal.slice(1).toLowerCase()}"?`,
      opciones.map((o, i) => ({ id: i, nombre: o.charAt(0) + o.slice(1).toLowerCase() })),
      { titulo: 'Precisar motivo', textoOk: 'Confirmar', bloquearClicFuera: true }
    );
    if (idx === null || Number.isNaN(idx) || !opciones[idx]) return null;
    return opciones[idx];
  } finally {
    window.submotivoModalAbiertos -= 1;
  }
}

// ---------------------------------------------------------------
// RED DE SEGURIDAD que llaman guardarIncidencia() (Informe del día) y
// actualizarBorradorIncidencia() (edición del Historial) justo antes de
// guardar: garantiza que NUNCA se guarda NO ENTREGAN / FALTAS sin su
// submotivo.
//
// Devuelve el array de motivos ya completo, o null si el usuario canceló
// (en ese caso el motivo principal queda desmarcado y ya se ha vuelto a
// disparar el guardado de la vista con el estado limpio: quien llama
// simplemente debe salir).
//
//   1. Si a la fila le falta el submotivo pero la incidencia ya lo tenía
//      guardado (p. ej. la fila se repintó y perdió el checkbox oculto), se
//      recupera el que había, sin preguntar.
//   2. Si no había ninguno, se pregunta con el modal (obligatorio).
// ---------------------------------------------------------------
async function completarSubmotivos(tr, motivos, motivosPrevios) {
  const mapa = window.SUBMOTIVOS_POR_MOTIVO || {};
  const resultado = (motivos || []).slice();

  for (const principal of motivosSinSubmotivo(resultado)) {
    const opciones = mapa[principal];

    const previo = (motivosPrevios || []).find(o => opciones.includes(o));
    if (previo) {
      resultado.push(previo);
      if (tr) crearCheckboxOcultoSubmotivo(tr, previo, principal);
      continue;
    }

    const elegido = await preguntarSubmotivo(principal, opciones);
    if (!elegido) {
      const cb = tr && Array.from(tr.querySelectorAll('.i-motivo-check'))
        .find(c => esCheckboxMotivoPrincipal(c) && c.value === principal);
      if (cb) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return null;
    }
    resultado.push(elegido);
    if (tr) crearCheckboxOcultoSubmotivo(tr, elegido, principal);
  }
  return resultado;
}

// ---- 1 y 2: preguntar/limpiar submotivo al (des)marcar el motivo principal ----
//
// Este listener va en FASE DE CAPTURA sobre `document`, es decir, se ejecuta
// ANTES que el listener 'change' que cada vista tiene puesto directamente en
// el checkbox (y que es el que guarda en Supabase).
//
//  · Al MARCAR NO ENTREGAN / FALTAS: se corta el evento (stopPropagation), así
//    la vista NO llega a guardar todavía; se pregunta el submotivo y, solo
//    cuando ya está elegido, se vuelve a lanzar el 'change' para que la vista
//    guarde UNA sola vez, con el motivo y el submotivo juntos. Antes la vista
//    guardaba primero solo "NO ENTREGAN" y el submotivo llegaba en un segundo
//    guardado: si ese segundo guardado se perdía o se pisaba, la incidencia
//    se quedaba sin submotivo.
//  · Al DESMARCAR: se quita el submotivo oculto ANTES de que la vista guarde,
//    así ya no hace falta el doble disparo que había antes.
document.addEventListener('change', (e) => {
  const cb = e.target;
  if (!esCheckboxMotivoPrincipal(cb)) return;

  const opciones = (window.SUBMOTIVOS_POR_MOTIVO || {})[cb.value];
  if (!opciones) return; // este motivo no tiene submotivos

  const tr = cb.closest('tr');
  if (!tr) return;

  // Re-disparo propio (ya con el submotivo elegido): dejamos pasar el evento.
  if (cb.dataset.submotivoListo === '1') { delete cb.dataset.submotivoListo; return; }

  if (!cb.checked) {
    quitarSubmotivosDe(tr, cb.value);
    return; // sigue hacia la vista, que guarda ya sin el submotivo
  }

  // Marcado, pero la fila ya lleva un submotivo de este motivo (p. ej. se ha
  // restaurado desde lo guardado): no hay nada que preguntar.
  const yaTiene = Array.from(tr.querySelectorAll('.i-motivo-check-submotivo'))
    .some(el => el.checked && opciones.includes(el.value));
  if (yaTiene) return;

  // Marcado y sin submotivo: paramos el evento y preguntamos.
  e.stopPropagation();
  preguntarYContinuar(cb, tr, opciones);
}, true);

async function preguntarYContinuar(cb, tr, opciones) {
  const elegido = await preguntarSubmotivo(cb.value, opciones);

  if (!elegido) {
    // Canceló el modal: no dejamos el motivo principal a medias.
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  crearCheckboxOcultoSubmotivo(tr, elegido, cb.value);
  cb.dataset.submotivoListo = '1';
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---- "Quitar todos los motivos": limpia también los submotivos, en fase
// de captura (antes de que se procese el propio clic del botón). ----
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-borrar-motivos, .btn-borrar-motivos-hist');
  if (!btn) return;
  const tr = btn.closest('tr');
  if (tr) tr.querySelectorAll('.i-motivo-check-submotivo').forEach(el => el.remove());
}, true);

// ---- 3: restaurar submotivos ya guardados en cuanto aparece la fila ----
const _submotivosObserverFilas = new MutationObserver((mutaciones) => {
  mutaciones.forEach(m => {
    m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches('tr[data-tienda]')) restaurarSubmotivosDesdeAtributos(node);
      if (node.querySelectorAll) node.querySelectorAll('tr[data-tienda]').forEach(restaurarSubmotivosDesdeAtributos);
    });
  });
});
_submotivosObserverFilas.observe(document.body, { childList: true, subtree: true });
