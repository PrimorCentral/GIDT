// ---------------------------------------------------------------
// Ventana de carga global: tarjeta "Cargando…" centrada, con el fondo
// difuminado, mientras se cargan datos (informes, siniestros, tiendas,
// análisis, paneles...).
//
// - Usa un contador en vez de un simple show/hide para que, si hay dos
//   cargas solapadas, no desaparezca hasta que terminen todas.
// - Solo aparece si la carga tarda más de un momento (CARGA_RETARDO_MS),
//   para que las cargas rápidas no hagan parpadear la pantalla.
// - Si pasan CARGA_LENTA_MS y sigue cargando, añade "Está tardando más de
//   lo normal" y el botón "Cancelar consulta", que corta las consultas a
//   Supabase en marcha (ver fetchCancelable, usado en supabase-client.js)
//   y cierra la ventana dejando la pantalla como estaba.
// ---------------------------------------------------------------
const CARGA_RETARDO_MS = 250;
const CARGA_LENTA_MS = 10000;

let cargaGlobalContador = 0;
let cargaGlobalTimerMostrar = null;
let cargaGlobalTimerLenta = null;

// Momento en que se canceló la última consulta: durante unos segundos se
// ignoran los avisos de error que lleguen por esa cancelación (ver
// modalAlert en ui-modal.js).
let consultaCanceladaEn = 0;
function consultaRecienCancelada() {
  return Date.now() - consultaCanceladaEn < 5000;
}

// Controlador con el que se cortan todas las consultas en marcha al pulsar
// "Cancelar consulta". Se renueva tras cada cancelación, así las consultas
// nuevas no nacen ya canceladas.
let cargaAbortController = new AbortController();

// fetch que usa el cliente de Supabase: igual que el normal, pero se corta
// si se pulsa "Cancelar consulta" mientras está en marcha.
function fetchCancelable(url, opciones = {}) {
  const senalCancelar = cargaAbortController.signal;
  let signal = senalCancelar;
  if (opciones.signal) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      signal = AbortSignal.any([opciones.signal, senalCancelar]);
    } else {
      // Navegadores sin AbortSignal.any: se encadenan a mano.
      const ctrl = new AbortController();
      const cortar = () => ctrl.abort();
      if (opciones.signal.aborted || senalCancelar.aborted) ctrl.abort();
      opciones.signal.addEventListener('abort', cortar, { once: true });
      senalCancelar.addEventListener('abort', cortar, { once: true });
      signal = ctrl.signal;
    }
  }
  return fetch(url, { ...opciones, signal });
}

function cargaGlobalElementos() {
  return {
    overlay: document.getElementById('cargaGlobalOverlay'),
    box: document.getElementById('cargaGlobalBox')
  };
}

function cargaGlobalPintar() {
  const { overlay, box } = cargaGlobalElementos();
  if (!overlay) return;
  box?.classList.remove('lento');
  overlay.classList.add('show');
  clearTimeout(cargaGlobalTimerLenta);
  cargaGlobalTimerLenta = setTimeout(() => {
    if (cargaGlobalContador > 0) box?.classList.add('lento');
  }, CARGA_LENTA_MS - CARGA_RETARDO_MS);
}

function cargaGlobalQuitar() {
  clearTimeout(cargaGlobalTimerMostrar);
  clearTimeout(cargaGlobalTimerLenta);
  cargaGlobalTimerMostrar = null;
  cargaGlobalTimerLenta = null;
  const { overlay, box } = cargaGlobalElementos();
  overlay?.classList.remove('show');
  box?.classList.remove('lento');
}

function mostrarCargandoGlobal() {
  cargaGlobalContador++;
  if (cargaGlobalContador === 1 && !cargaGlobalTimerMostrar) {
    cargaGlobalTimerMostrar = setTimeout(() => {
      cargaGlobalTimerMostrar = null;
      if (cargaGlobalContador > 0) cargaGlobalPintar();
    }, CARGA_RETARDO_MS);
  }
}

function ocultarCargandoGlobal() {
  cargaGlobalContador = Math.max(0, cargaGlobalContador - 1);
  if (cargaGlobalContador === 0) cargaGlobalQuitar();
}

// Envuelve una carga (función que devuelve una promesa, o la promesa en sí)
// con la ventana de carga.
async function conCargaGlobal(carga) {
  mostrarCargandoGlobal();
  try {
    return await (typeof carga === 'function' ? carga() : carga);
  } finally {
    ocultarCargandoGlobal();
  }
}

// "Cancelar consulta": corta lo que esté en marcha, cierra la ventana y
// avisa con un toast. Los errores que provoque el corte no se muestran.
function cancelarConsultaGlobal() {
  consultaCanceladaEn = Date.now();
  const anterior = cargaAbortController;
  cargaAbortController = new AbortController();
  anterior.abort();
  cargaGlobalContador = 0;
  cargaGlobalQuitar();
  if (typeof mostrarToast === 'function') mostrarToast('Consulta cancelada', { icono: '✕', posicion: 'abajo' });
}

document.getElementById('btnCancelarConsulta')?.addEventListener('click', cancelarConsultaGlobal);

// ---------------------------------------------------------------
// Seguro anti-bloqueo de la ventana "Enviando…" (#cargandoEnvioOverlay):
// si lleva abierta más de ENVIO_ATASCADO_MS, se añade un botón para
// cerrarla, para que la app nunca se quede bloqueada sin salida.
// ---------------------------------------------------------------
const ENVIO_ATASCADO_MS = 60000;
(function vigilarVentanaEnvio() {
  const overlay = document.getElementById('cargandoEnvioOverlay');
  const box = overlay?.querySelector('.cargando-modal-box');
  if (!overlay || !box) return;
  let timer = null;
  const comprobar = () => {
    if (overlay.classList.contains('show')) {
      if (!timer) timer = setTimeout(() => box.classList.add('atascado'), ENVIO_ATASCADO_MS);
    } else {
      clearTimeout(timer);
      timer = null;
      box.classList.remove('atascado');
    }
  };
  new MutationObserver(comprobar).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  document.getElementById('btnCerrarCargandoEnvio')?.addEventListener('click', () => overlay.classList.remove('show'));
})();
