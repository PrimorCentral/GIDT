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
//     modal ya existente (modalSeleccionar) y se guarda como un checkbox
//     OCULTO más dentro de la misma fila <tr>, con class="i-motivo-check"
//     — por eso guardarIncidencia() / actualizarBorradorIncidencia() lo
//     incluyen solas al hacer
//     Array.from(tr.querySelectorAll('.i-motivo-check:checked'))...
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

async function preguntarSubmotivo(motivoPrincipal, opciones) {
  const idx = await modalSeleccionar(
    `¿Cuál es el motivo exacto de "${motivoPrincipal.charAt(0)}${motivoPrincipal.slice(1).toLowerCase()}"?`,
    opciones.map((o, i) => ({ id: i, nombre: o.charAt(0) + o.slice(1).toLowerCase() })),
    { titulo: 'Precisar motivo', textoOk: 'Confirmar' }
  );
  if (idx === null || Number.isNaN(idx) || !opciones[idx]) return null;
  return opciones[idx];
}

// ---- 1 y 2: preguntar/limpiar submotivo al (des)marcar el motivo principal ----
document.addEventListener('change', async (e) => {
  const cb = e.target;
  if (!(cb instanceof HTMLInputElement) || cb.type !== 'checkbox') return;
  if (!cb.classList.contains('i-motivo-check') || cb.classList.contains('i-motivo-check-submotivo')) return;

  const SUBMOTIVOS_POR_MOTIVO = window.SUBMOTIVOS_POR_MOTIVO || {};
  const opciones = SUBMOTIVOS_POR_MOTIVO[cb.value];
  if (!opciones) return; // este motivo no tiene submotivos

  const tr = cb.closest('tr');
  if (!tr) return;

  if (!cb.checked) { quitarSubmotivosDe(tr, cb.value); return; }

  // Evita volver a preguntar cuando re-disparamos el 'change' nosotros
  // mismos más abajo, para que el guardado propio de la vista recoja ya
  // el submotivo elegido.
  if (cb.dataset.submotivoPendiente === '1') { delete cb.dataset.submotivoPendiente; return; }

  const elegido = await preguntarSubmotivo(cb.value, opciones);

  if (!elegido) {
    // Canceló el modal: no dejamos el motivo principal a medias.
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  crearCheckboxOcultoSubmotivo(tr, elegido, cb.value);
  cb.dataset.submotivoPendiente = '1';
  cb.dispatchEvent(new Event('change', { bubbles: true }));
});

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
