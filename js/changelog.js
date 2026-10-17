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
    version: '1.8.4',
    fecha: '2026-10-17',
    cambios: [
      { tipo: 'nuevo',  texto: 'Informe del día: cuando no hay ninguna incidencia, el botón pasa a "✅ Cerrar sin incidencias". El informe queda como CERRADO SIN INCIDENCIAS, no se envía ningún correo a las agencias y el Reporte mensual cuenta ese día como OK' },
      { tipo: 'mejora', texto: 'Si después de cerrar el informe sin incidencias se registra alguna, vuelve el botón "Enviar informe" y se avisa en Tareas pendientes' },
      { tipo: 'nuevo',  texto: 'Gestión de tiendas, lista Aperturas: botón 🚚 junto a Activar para volcar o quitar la tienda de los conteos de SALIDAS, con confirmación; se puede usar sin el permiso de editar tiendas' },
      { tipo: 'mejora', texto: 'Las confirmaciones de eliminar, quitar o anular se muestran en el cuadro rojo' },
      { tipo: 'correccion', texto: 'Desde las listas de los contadores de Gestión de tiendas ya no se puede abrir Editar tienda sin el permiso correspondiente' },
      { tipo: 'correccion', texto: 'Detalle del siniestro: los botones Cerrar y PDF se pueden usar sin permiso de Panel siniestros, ya que solo sirven para ver o imprimir' },
      { tipo: 'correccion', texto: 'Utilidades del informe del día: las entregas especiales también respetan el permiso de editar el informe' }
    ]
  },
  {
    version: '1.8.3',
    fecha: '2026-10-16',
    cambios: [
      { tipo: 'mejora', texto: 'Detalle del siniestro: nueva barra de título arriba, como en Editar tienda, con el Nº del siniestro, la última modificación (quién y cuándo) y los botones Eliminar, PDF, Cerrar y Guardar' },
      { tipo: 'mejora', texto: 'Detalle del siniestro: los campos ya no se guardan solos; se guardan con el botón Guardar, que está apagado mientras no hay cambios y se pone en naranja en cuanto se cambia algo. Fotos, factura, albarán y justificante se siguen guardando al momento al subirlos' },
      { tipo: 'mejora', texto: 'Detalle del siniestro: al cerrar con cambios sin guardar se avisa antes de perderlos' },
      { tipo: 'mejora', texto: 'Editar tienda: el botón Guardar está apagado mientras no hay cambios, y al pulsar Cancelar con cambios sin guardar se avisa antes de perderlos' }
    ]
  },
  {
    version: '1.8.2',
    fecha: '2026-10-16',
    cambios: [
      { tipo: 'nuevo',  texto: 'Las tiendas de GIDT se sincronizan solas con SALIDAS: al crear una tienda o cambiar su número, nombre, límite de palets o tránsito, el cambio llega a SALIDAS automáticamente, y al quitarla sale de sus rutas' },
      { tipo: 'nuevo',  texto: 'En Editar tienda, la tarjeta de estado indica si la tienda está en SALIDAS y en cuántas rutas, con la opción "volver a comprobar"' },
      { tipo: 'nuevo',  texto: 'Botón "📤 Volcar a SALIDAS" para mandar a SALIDAS una tienda en apertura sin activarla todavía en GIDT; "✕ Quitar de SALIDAS" solo aparece con la tienda en apertura o de baja' },
      { tipo: 'mejora', texto: '"Horario por días" y "Cambiar agencia" pasan de la lista de tiendas al modal Editar tienda (en la sección Entrega y junto al campo Agencia); si hay cambios sin guardar, se avisa antes de abrirlos' },
      { tipo: 'mejora', texto: 'En la lista de Gestión de tiendas solo quedan los botones de subir, bajar y editar; para dejar de servir una tienda se usa la baja temporal' },
      { tipo: 'mejora', texto: 'El Nº de tienda no se puede modificar una vez grabado, porque es lo que enlaza la tienda con SALIDAS' },
      { tipo: 'mejora', texto: 'Al crear una tienda nueva, la opción "En apertura" viene marcada por defecto' },
      { tipo: 'mejora', texto: 'En Editar tienda y Nueva tienda, los botones de la cabecera llevan el icono arriba y el texto debajo' },
      { tipo: 'mejora', texto: 'Los contadores de Gestión de tiendas pasan a llamarse "Tiendas activas" y "Reparto sábados"' }
    ]
  },
  {
    version: '1.8.1',
    fecha: '2026-10-16',
    cambios: [
      { tipo: 'nuevo',      texto: 'Tiendas en apertura: en Gestión de tiendas se puede dar de alta una tienda que aún no ha abierto (tarjeta "En apertura", con fecha prevista opcional), para tener sus datos; no sale en el Informe del día, el Historial, el Reporte mensual ni el Panel siniestros hasta que se activa' },
      { tipo: 'nuevo',      texto: 'Botón "Activar tienda" en la ficha de la tienda y en la lista de Aperturas: pide la fecha de apertura real y desde ese día la tienda empieza a contar como activa; para activarla la ficha tiene que estar completa' },
      { tipo: 'nuevo',      texto: 'Nuevo contador "Aperturas" en Gestión de tiendas, con la lista de las tiendas que aún no han abierto' },
      { tipo: 'nuevo',      texto: 'Nuevo botón "Filtros" en Gestión de tiendas para filtrar por agencias, tránsito y tiendas; con el filtro activo se indica cuántas tiendas se muestran de cuántas' },
      { tipo: 'mejora',     texto: 'Al exportar el Excel detallado con un filtro activo, se pregunta si exportar solo las tiendas filtradas o todas; las tiendas en apertura salen en el detallado con fondo gris y no salen en el resumido' },
      { tipo: 'nuevo',      texto: 'Botón 🕓 en Editar tienda con el historial de cambios de esa tienda (quién la creó, ediciones con el detalle de antes y después, bajas, cambios de agencia…), visible para todos sin necesidad del permiso de Auditoría' },
      { tipo: 'mejora',     texto: 'Los cambios de cada tienda quedan registrados con la propia tienda, así que su historial se mantiene completo aunque cambie de nombre' },
      { tipo: 'mejora',     texto: 'La cabecera de Gestión de tiendas cabe en una sola línea, con los contadores centrados' }
    ]
  },
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
