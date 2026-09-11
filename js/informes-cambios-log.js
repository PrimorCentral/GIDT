// ---------------------------------------------------------------
// Log de cambios de un informe diario TRAS su envío a las agencias
// ---------------------------------------------------------------
// Registra en la tabla informes_cambios_log cada alta, baja o
// modificación de una incidencia hecha DESPUÉS de que el informe de
// ese día ya estuviera marcado como enviado (informes_diarios.
// informe_enviado = true). Antes de enviar, los cambios son edición
// normal y no interesa dejar rastro.
//
// Se llama desde:
//   - js/filtros-motivos.js → guardarIncidencia() (Informe del día,
//     que se puede seguir tocando después de enviarlo)
//   - js/historial-editar.js → finalizarEdicionHistorial() (edición
//     de un día pasado desde el Historial)
//
// El botón "Log de cambios" (informe-hoy.js / historial, ver
// js/informes-cambios-log-panel.js) lee esta tabla para mostrar el
// detalle "Usuario ha añadido/quitado/cambiado esto" agrupado por
// informe.
//
// Requiere (ya cargados antes): sb, sesionActual.

function icLogArraysIguales(a, b) {
  const x = (a || []).slice().sort();
  const y = (b || []).slice().sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// datos: { tiendaId, tiendaNombre, agenciaNombre, motivosAntes,
//          motivosDespues, observacionesAntes, observacionesDespues }
async function registrarCambioInforme(informeId, fecha, datos) {
  const motivosAntes = datos.motivosAntes || [];
  const motivosDespues = datos.motivosDespues || [];
  const obsAntes = datos.observacionesAntes || '';
  const obsDespues = datos.observacionesDespues || '';

  const habiaAntes = motivosAntes.length > 0;
  const hayDespues = motivosDespues.length > 0;
  const motivosCambiaron = !icLogArraysIguales(motivosAntes, motivosDespues);
  const obsCambiaron = obsAntes !== obsDespues;

  let tipoCambio;
  if (!habiaAntes && hayDespues) tipoCambio = 'ALTA';
  else if (habiaAntes && !hayDespues) tipoCambio = 'BAJA';
  else if (habiaAntes && hayDespues && (motivosCambiaron || obsCambiaron)) tipoCambio = 'MODIFICACION';
  else return; // sin cambio real que merezca quedar registrado

  try {
    const { error } = await sb.from('informes_cambios_log').insert({
      informe_id: informeId,
      fecha,
      tienda_id: datos.tiendaId,
      tienda_nombre: datos.tiendaNombre || null,
      agencia_nombre: datos.agenciaNombre || null,
      tipo_cambio: tipoCambio,
      motivos_antes: motivosAntes,
      motivos_despues: motivosDespues,
      observaciones_antes: obsAntes || null,
      observaciones_despues: obsDespues || null,
      usuario: (typeof sesionActual !== 'undefined' && sesionActual) ? (sesionActual.nombre || sesionActual.usuario) : null
    });
    if (error) throw error;
  } catch (err) {
    console.error('Error registrando cambio de informe:', err);
  }
}

// Punto de entrada usado desde los sitios donde se guarda una
// incidencia: solo registra si el informe de ese día YA estaba
// enviado a las agencias en el momento del cambio. Nunca debe romper
// el guardado real si falla, así que no se espera (fire-and-forget)
// desde las llamadas.
function registrarCambioInformeSiEnviado(informe, datos) {
  if (!informe || !informe.informe_enviado) return;
  registrarCambioInforme(informe.id, informe.fecha, datos);
}
