// ---------------------------------------------------------------
// Aviso de "sin permiso" al pulsar un botón deshabilitado
// ---------------------------------------------------------------
// Los botones sin permiso se quedan visibles pero atenuados (ver
// styles.css, reglas "pointer-events:none" → ahora solo opacidad
// para los <button> reales; los campos de formulario dentro de esos
// mismos bloques SIGUEN con pointer-events:none, no interesa un
// modal por cada campo). Este archivo intercepta el clic en esos
// botones ANTES de que llegue a su lógica normal y muestra un aviso
// en vez de ejecutar la acción.
//
// Requiere (ya cargados antes): modalAlert (ui-modal.js), tienePermiso
// / esLectura (permisos.js).

function mostrarModalSinPermiso() {
  if (typeof modalAlert !== 'function') return;
  modalAlert('Usuario no cuenta con los permisos necesarios, por favor, contacte con su responsable.', {
    titulo: 'Sin permiso',
    icono: '⛔',
    danger: true
  });
}

// Selector del botón → clave de permiso granular que necesita (mismo
// mapeo que las reglas "body:not(.perm-X) SELECTOR{ opacity... }" de
// styles.css, pero solo la parte de BOTONES, no la de campos).
const BOTONES_CON_PERMISO = [
  ['#btnEditarHistorial', 'editar_informes_pasados'],
  ['#btnGenerarInformeEmpty', 'informe_dia'],
  ['#btnGenerarInformeDesdeIncidencias', 'informe_dia'],
  ['#btnEditarPalets', 'informe_dia'],
  ['#btnUtilidadesInforme', 'informe_dia'],
  ['.btn-borrar-motivos', 'informe_dia'],
  ['#btnNuevoPanelSiniestroManual', 'panel_siniestros'],
  ['#psModalOverlay .btn', 'panel_siniestros'],
  ['#btnEnviarSiniestro', 'siniestros_dia'],
  ['[id^="btnEnviarFacturacion"]', 'enviar_facturacion'],
  ['#btnNuevaTienda', 'config_tiendas'],
  ['#view-config-tiendas .agencia-body .mini-btn', 'config_tiendas'],
  ['#btnNuevaAgencia', 'config_emails'],
  ['#listaEmailsAgencias [data-editar-comercial]', 'config_emails'],
  ['#listaEmailsAgencias [data-editar-grupo]', 'config_emails'],
  ['#listaEmailsAgencias [data-quitar]', 'config_emails'],
  ['#listaEmailsAgencias .email-add-row button', 'config_emails'],
  ['#listaEmailsFacturacion .email-add-row button', 'config_facturacion'],
  ['#listaEmailsFacturacion [data-quitar-facturacion]', 'config_facturacion'],
  ['#listaEmailsCC .email-add-row button', 'config_cc_transporte'],
  ['#listaEmailsCC [data-quitar-cc]', 'config_cc_transporte'],
  ['#btnBorrarPanelSiniestro', 'borrar'],
  ['.agencia-body [data-borrar]', 'borrar'],
  ['.ps-foto-quitar', 'borrar'],
  ['#btnQuitarFactura', 'borrar'],
  ['#btnQuitarAlbaran', 'borrar']
];

// Modo LECTURA: mismo selector de botones de acción que ya usa
// styles.css para atenuarlos (ver regla "body.rol-lectura button...").
const SELECTOR_BOTONES_LECTURA =
  'button:not(.dropdown button):not(.toggle-seg-btn):not(.filtros-modal-close):not(.ps-kpi-detalle-btn):not(#btnRefrescarPanelSiniestros):not([data-view]), .btn, .link-accion, .mini-btn';

document.addEventListener('click', (e) => {
  if (typeof esLectura === 'function' && esLectura()) {
    const elLectura = e.target.closest(SELECTOR_BOTONES_LECTURA);
    if (elLectura) {
      e.preventDefault();
      e.stopImmediatePropagation();
      mostrarModalSinPermiso();
      return;
    }
  }

  for (const [selector, permiso] of BOTONES_CON_PERMISO) {
    const el = e.target.closest(selector);
    if (el && typeof tienePermiso === 'function' && !tienePermiso(permiso)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      mostrarModalSinPermiso();
      return;
    }
  }
}, true);
