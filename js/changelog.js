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
    version: '1.7.6',
    fecha: '2026-10-06',
    cambios: [
      { tipo: 'nuevo',  texto: 'Ahora se pueden programar cambios de agencia en las tiendas con fecha de inicio, y se aplican automáticamente el día indicado' },
      { tipo: 'nuevo',  texto: 'Los siniestros manuales permiten omitir el envío del correo a la agencia' },
      { tipo: 'nuevo',  texto: 'Nueva página "Histórico de agencias", dentro de Análisis para ver los resultados de cambios de agencias por tiendas' },
      { tipo: 'mejora', texto: 'Tareas pendientes muestra los siniestros manuales que aún no se han enviado a la agencia' }
    ]
  }
];
