// ---------------------------------------------------------------
// Spinner de carga global: se muestra centrado en pantalla mientras
// se están cargando datos (ranking, informes, historiales, paneles...).
// Usa un contador en vez de un simple show/hide para que, si hay dos
// cargas solapadas, el spinner no desaparezca hasta que terminen todas.
// ---------------------------------------------------------------
let cargaGlobalContador = 0;

function mostrarCargandoGlobal() {
  cargaGlobalContador++;
  document.getElementById('cargaGlobalOverlay')?.classList.add('show');
}

function ocultarCargandoGlobal() {
  cargaGlobalContador = Math.max(0, cargaGlobalContador - 1);
  if (cargaGlobalContador === 0) {
    document.getElementById('cargaGlobalOverlay')?.classList.remove('show');
  }
}
