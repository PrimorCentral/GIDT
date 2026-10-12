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
    version: '1.8.0',
    fecha: '2026-10-12',
    cambios: [
      { tipo: 'mejora', texto: 'Seguridad mejorada: el almacenamiento de archivos de siniestros (fotos, facturas, albaranes y justificantes de recogida) pasa a ser privado; solo se puede consultar, subir o eliminar con una sesión autenticada en GIDT, y los enlaces directos ya no son accesibles desde fuera de la aplicación' },
      { tipo: 'mejora', texto: 'Acceso a documentos mediante enlaces firmados temporales: cada vez que se abre una foto o un documento se genera un enlace de acceso con una validez de una hora' },
      { tipo: 'mejora', texto: 'Los adjuntos de los correos a agencias y a facturación se obtienen de forma segura desde el servidor, sin depender de enlaces públicos' },
      { tipo: 'nuevo',  texto: 'Nueva ventana de actualización animada, que muestra la versión instalada y la nueva junto con el progreso de la actualización' }
    ]
  },
  {
    version: '1.7.9',
    fecha: '2026-10-12',
    cambios: [
      { tipo: 'nuevo',      texto: 'Los siniestros de días anteriores que se quedaron sin enviar a la agencia aparecen en Tareas pendientes como tarea urgente, siempre la primera, con los botones "Enviar ahora" y "Ver en historial"; al enviarlos se usa la fecha del informe original y se dan de alta en el Panel siniestros' },
      { tipo: 'mejora',     texto: 'La tarjeta "Siniestros sin enviar a la agencia" de Inicio cuenta también los de días anteriores, y al pulsarla abre el Historial de siniestros en el día correspondiente' },
      { tipo: 'mejora',     texto: 'Una vez enviado el informe del día, el botón pasa a "Volver a enviar el informe"; al reenviarlo, la ventana indica a qué hora se envió la primera vez y el botón espera 10 segundos antes de poder pulsarse' },
      { tipo: 'correccion', texto: 'Las incidencias con un motivo pendiente de confirmar junto a otro motivo mantienen su color de "pendiente" en todas las pantallas' },
      { tipo: 'correccion', texto: 'Al quitar el albarán de un siniestro, el paso "Albarán enviado a facturación" del seguimiento vuelve a quedar pendiente' },
      { tipo: 'correccion', texto: 'Al añadir o quitar Faltas o Rotura desde el Historial de informes diarios en una incidencia que ya tenía siniestro, el Panel siniestros actualiza su tipo' },
      { tipo: 'nuevo',      texto: 'Nuevo filtro "Motivo" en Reportes mensuales, con cada código y su color: solo se muestran las tiendas con esos motivos y el total cuenta solo esos; también se aplica al exportar con el filtro activo (no al enviar a las agencias)' },
      { tipo: 'correccion', texto: 'En el PDF del Reporte mensual, los avisos "Cambia a:" y "Antes:" de un cambio de agencia van en una sola línea y ya no hacen la fila de la tienda el doble de alta' }
    ]
  },
  {
    version: '1.7.8',
    fecha: '2026-10-08',
    cambios: [
      { tipo: 'correccion', texto: 'En el Informe del día, al cambiar un motivo pendiente (como "RETRASO PDTE CONFIRMAR") por el definitivo, ya no se borran las observaciones ni desaparece la tienda de la lista filtrada; la incidencia solo se elimina si se cierra el desplegable sin ningún motivo marcado' },
      { tipo: 'mejora',     texto: 'Con filtros activos en el Informe del día, si una tienda deja de cumplirlos al cambiar su motivo, se queda unos segundos en la lista con una cuenta atrás para poder retocar las observaciones; la cuenta se pausa mientras se escribe' },
      { tipo: 'mejora',     texto: 'Nueva ventana "Acerca de": más grande y animada, con la licencia en dos columnas y las novedades de versiones anteriores plegadas; solo se cierra con la ✕ (o la tecla Escape)' }
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
