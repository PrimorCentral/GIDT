// js/buscador-clear.js
// ---------------------------------------------------------------
// Botón "×" para vaciar cualquier buscador de la app con un clic.
// ---------------------------------------------------------------
// Todos los buscadores de GIDT (Informe del día, Historial, Panel
// siniestros, desplegables de filtro de agencia/motivo…) siguen la
// misma convención de placeholder: "🔎 Buscar tienda…", "Buscar
// motivo…", etc. Por eso basta con localizarlos por ese placeholder
// para engancharles el botón, sin tener que tocar cada vista una por
// una ni depender de que tengan id.
//
// Muchos de estos buscadores están dentro de filas que se regeneran
// continuamente (una fila de motivos por tienda, un desplegable que se
// reconstruye…), así que se usa el mismo patrón de MutationObserver que
// ya usa js/submotivos-informe.js para engancharlos también a los que
// se van creando después de la carga inicial.
//
// No depende de nada más cargado antes: solo del DOM.
// ---------------------------------------------------------------

function bcEnvolverBuscador(input) {
  if (input.closest('.buscador-clear-wrap')) return; // ya envuelto

  const wrap = document.createElement('span');
  wrap.className = 'buscador-clear-wrap';

  // El ancho/flex que tuviera puesto el input por estilo inline (los hay
  // con max-width, width o flex fijados a mano en el HTML) se traslada al
  // envoltorio, para que el sitio donde estaba encajado no cambie.
  if (input.style.width) { wrap.style.width = input.style.width; input.style.width = ''; }
  if (input.style.maxWidth) { wrap.style.maxWidth = input.style.maxWidth; input.style.maxWidth = ''; }
  if (input.style.minWidth) { wrap.style.minWidth = input.style.minWidth; input.style.minWidth = ''; }
  if (input.style.flex) { wrap.style.flex = input.style.flex; input.style.flex = ''; }

  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'buscador-clear-btn';
  btn.setAttribute('aria-label', 'Borrar búsqueda');
  btn.innerHTML = '&times;';
  wrap.appendChild(btn);

  const actualizarVisibilidad = () => btn.classList.toggle('visible', !!input.value);
  actualizarVisibilidad();

  input.addEventListener('input', actualizarVisibilidad);

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.value = '';
    // Dispara 'input' para que el propio buscador reaccione igual que si
    // se hubiera borrado el texto a mano (filtra de nuevo, oculta filas…).
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    actualizarVisibilidad();
  });
}

function bcEnvolverTodosDentroDe(raiz) {
  if (raiz.matches && raiz.matches('input[type="text"][placeholder*="Buscar"]')) bcEnvolverBuscador(raiz);
  if (raiz.querySelectorAll) raiz.querySelectorAll('input[type="text"][placeholder*="Buscar"]').forEach(bcEnvolverBuscador);
}

function bcInicializar() {
  bcEnvolverTodosDentroDe(document);

  const observer = new MutationObserver((mutaciones) => {
    mutaciones.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        bcEnvolverTodosDentroDe(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bcInicializar);
} else {
  bcInicializar();
}
