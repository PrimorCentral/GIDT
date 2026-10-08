// ---------------------------------------------------------------
// GIDT · js/changelog.js — Historial de versiones (pestaña "Novedades"
// de la ventana "Acerca de", js/acerca-de.js).
//
// Con cada versión nueva: añadir una entrada ARRIBA del todo (la más
// reciente primero) y subir version.json al mismo número.
// tipo: 'nuevo' | 'mejora' | 'correccion'
// fecha: 'AAAA-MM-DD'
// Redacción en impersonal (la lee todo el equipo).
// ---------------------------------------------------------------
const CHANGELOG_GIDT = [
  {
    version: '1.7.8',
    fecha: '2026-10-08',
    cambios: [
      { tipo: 'correccion', texto: 'En el Informe del día, al cambiar un motivo pendiente (como "RETRASO PDTE CONFIRMAR") por el definitivo, ya no se borran las observaciones ni desaparece la tienda de la lista filtrada; la incidencia solo se elimina si se cierra el desplegable sin ningún motivo marcado' }
    ]
  },
  {
    version: '1.7.7',
    fecha: '2026-10-07',
    cambios: [
      { tipo: 'nuevo',  texto: 'Nueva pantalla de Inicio: todo cabe en una sola pantalla, con tarjetas de resumen (incidencias de hoy, siniestros sin enviar, pendiente de cobro y siniestros del mes), gráfica de incidencias por día, incidencias del mes por agencia y actividad reciente del equipo' },
      { tipo: 'nuevo',  texto: 'Fecha y hora en vivo en la barra superior' },
      { tipo: 'nuevo',  texto: 'Aviso fijo en rojo, en todas las pantallas, cuando un informe ya enviado tiene incidencias sin revisar; desaparece al reclasificarlas' },
      { tipo: 'mejora', texto: 'Al adjuntar un albarán se puede pulsar "Omitir envío", y el seguimiento del siniestro muestra quién adjuntó el albarán y quién omitió el envío a Facturación' },
      { tipo: 'mejora', texto: 'Tareas pendientes muestra cuántas hay y cuánto tiempo lleva cada una, con las urgentes siempre arriba' },
      { tipo: 'mejora', texto: 'Al pulsar una tarea pendiente o una tarjeta de Inicio, el Panel de siniestros se abre con el filtro correspondiente ya marcado (sin enviar a agencia, sin albarán, sin factura…)' },
      { tipo: 'mejora', texto: '"Siniestros sin enviar a la agencia" suma los del día y los del Panel, indicando cuántos hay de cada' }
    ]
  },
  {
    version: '1.7.6',
    fecha: '2026-10-06',
    cambios: [
      { tipo: 'nuevo',  texto: 'Ahora se pueden programar cambios de agencia en las tiendas con fecha de inicio, y se aplican automáticamente el día indicado' },
      { tipo: 'nuevo',  texto: 'Los siniestros manuales permiten omitir el envío del correo a la agencia' },
      { tipo: 'nuevo',  texto: 'Nueva página "Histórico de agencias", dentro de Análisis para ver los resultados de cambios de agencias por tiendas' },
      { tipo: 'mejora', texto: 'Tareas pendientes muestra los siniestros manuales que aún no se han enviado a la agencia' },
      { tipo: 'mejora', texto: 'Nuevo menú para editar tiendas y para añadir nueva tienda, tambien para programar pruebas o repartos en Sábados' },
      { tipo: 'correccion',  texto: 'Añadido en "Reporte mensual", el color de fondo gris al numero "0"' }
    ]
  }
];
