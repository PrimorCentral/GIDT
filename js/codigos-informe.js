// js/codigos-informe.js
// ---------------------------------------------------------------
// Tabla de códigos del "Reporte mensual" (equivalente a la leyenda del
// Excel ENTREGAS MERCANCIA AGENCIA) + lógica para calcular, a partir del
// array `motivo` que ya guarda cada incidencia, qué código corresponde.
//
// No sustituye nada de filtros-motivos.js: se apoya en los MISMOS motivos
// que ya existen ahí (RETRASO LEVE, FALTAS, NO ENTREGAN, etc.). Los
// "submotivos" (p.ej. qué tipo de FALTAS) se guardan como una etiqueta
// EXTRA dentro del mismo array `motivo`, así no hace falta tocar el
// esquema de la tabla `incidencias` ni las funciones calcularTipo() /
// tipoSiniestroDeMotivos() que ya existen.
// ---------------------------------------------------------------

(function () {
  'use strict';

  // codigo, etiqueta de la leyenda, color de fondo/texto de la celda,
  // motivo "principal" (uno de los MOTIVOS de filtros-motivos.js) y,
  // cuando ese motivo tiene varios códigos posibles, el submotivo exacto.
  const CODIGOS_INFORME = [
    { codigo: '0',  label: 'RETRASO LEVE',                   color: '#FFFFFF', texto: '#12181F', motivo: 'RETRASO LEVE' },
    { codigo: '1',  label: 'RETRASO GRAVE / TIENDA ABIERTA', color: '#FFF200', texto: '#12181F', motivo: 'RETRASO IMPORTANTE' },
    { codigo: '2',  label: 'NO ENTREGAN',                    color: '#FF0000', texto: '#FFFFFF', motivo: 'NO ENTREGAN', submotivo: 'NO ENTREGAN SIN MOTIVO' },
    { codigo: '3',  label: 'ROTURA SIN INCIDENCIA',          color: '#00B050', texto: '#FFFFFF', motivo: 'ROTURA SIN INCIDENCIA' },
    { codigo: '4',  label: 'INCOMPLETO',                     color: '#00B0F0', texto: '#12181F', motivo: 'INCOMPLETO' },
    { codigo: '5',  label: 'ADELANTO',                       color: '#7030A0', texto: '#FFFFFF', motivo: 'ADELANTAN ENTREGA' },
    { codigo: '6',  label: 'ROBO/ FALTAS DE SELECTIVO',      color: '#FFFF00', texto: '#12181F', motivo: 'FALTAS', submotivo: 'ROBO/FALTAS DE SELECTIVO' },
    { codigo: '7',  label: 'ROTURA CON INCIDENCIA',          color: '#FFA500', texto: '#12181F', motivo: 'ROTURA CONFIRMADA' },
    { codigo: '8',  label: 'ADUANAS',                        color: '#A6A6A6', texto: '#12181F', motivo: 'NO ENTREGAN', submotivo: 'ADUANAS' },
    { codigo: '9',  label: 'SIN VIGILANCIA',                 color: '#92D050', texto: '#12181F', motivo: 'PALETS SIN VIGILANCIA' },
    { codigo: 'F',  label: 'FESTIVO',                        color: '#C6E0B4', texto: '#12181F', motivo: 'NO ENTREGAN', submotivo: 'FESTIVO' },
    { codigo: '10', label: 'ROBO/FALTAS DE CONSUMO',         color: '#FFD966', texto: '#12181F', motivo: 'FALTAS', submotivo: 'ROBO/FALTAS DE CONSUMO' },
    { codigo: '11', label: 'ROBO DE CAJAS',                  color: '#C00000', texto: '#FFFFFF', motivo: 'FALTAS', submotivo: 'ROBO DE CAJAS' },
    { codigo: '12', label: 'DESCARGA MANUAL',                color: '#BDD7EE', texto: '#12181F', motivo: 'DESCARGA MANUAL' },
    { codigo: '13', label: 'ROTURA DE ALMACÉN',              color: '#8EA9DB', texto: '#12181F', motivo: 'ROTURA ALMACEN' },
    { codigo: '14', label: 'PALETS PENDIENTES POR HUELGA',   color: '#F4B183', texto: '#12181F', motivo: 'NO ENTREGAN', submotivo: 'PALETS PENDIENTES POR HUELGA' },
    { codigo: '15', label: 'TEMPORAL NO ENTREGA',            color: '#ED7D31', texto: '#FFFFFF', motivo: 'NO ENTREGAN', submotivo: 'TEMPORAL NO ENTREGA' },
    { codigo: '16', label: 'MEZCLAN FECHAS DE PALETS',       color: '#BFBFBF', texto: '#12181F', motivo: 'MEZCLAN FECHAS' },
    { codigo: '17', label: 'PALET MANIPULADO',               color: '#000000', texto: '#FFFFFF', motivo: 'PALET MANIPULADO' },
    { codigo: '18', label: 'PALETS NO RECOGIDOS',            color: '#808080', texto: '#FFFFFF', motivo: 'PALETS NO RETIRADOS' },
    { codigo: '19', label: 'PALET PERDIDO',                  color: '#C71585', texto: '#FFFFFF', motivo: 'PALET PERDIDO' }
  ];

  // Motivos "principales" que tienen más de un código posible: al marcarlos
  // hay que preguntar cuál de estas opciones es.
  const SUBMOTIVOS_POR_MOTIVO = {
    'FALTAS':      ['ROBO/FALTAS DE SELECTIVO', 'ROBO/FALTAS DE CONSUMO', 'ROBO DE CAJAS'],
    'NO ENTREGAN': ['ADUANAS', 'FESTIVO', 'PALETS PENDIENTES POR HUELGA', 'TEMPORAL NO ENTREGA', 'NO ENTREGAN SIN MOTIVO']
  };

  // Motivos "provisionales" que en el informe mensual se ven como OK
  // (todavía no son una incidencia cerrada).
  const MOTIVOS_PENDIENTES_INFORME = ['RETRASO PDTE CONFIRMAR', 'REVISANDO POSIBLE INCIDENCIA'];

  // Mismo criterio de gravedad que calcularTipo() en filtros-motivos.js:
  // viene de la tabla `config_gravedad_motivos` (Configuración → Gravedad
  // de motivos, ver js/config-gravedad-motivos.js), no de regex fijas.
  function severidad(motivo) {
    const nivel = (typeof nivelDeMotivo === 'function') ? nivelDeMotivo(motivo) : null;
    if (nivel === 'grave') return 3;
    if (nivel === 'moderado') return 2;
    if (nivel === 'leve') return 1;
    return 0;
  }

  /**
   * A partir del array `motivo` de una incidencia (tal cual se guarda en
   * Supabase, incluyendo la etiqueta de submotivo si la hay), devuelve el
   * código de leyenda para ese día: { codigo, label, color, texto }.
   * Devuelve null si ese día debe verse como "OK" (sin motivo, o solo
   * motivos pendientes de revisar).
   */
  function codigoDeMotivos(motivos) {
    const arr = (motivos || []).filter(m => !MOTIVOS_PENDIENTES_INFORME.includes(m));
    if (!arr.length) return null;

    // Motivos "principales" presentes (excluye las etiquetas de submotivo).
    const principales = arr.filter(m => CODIGOS_INFORME.some(c => c.motivo === m));
    if (!principales.length) return null;

    // El más grave gana; en empate de gravedad, decide el orden configurado
    // en Configuración → Gravedad de motivos (menor número = más prioritario).
    let ganador = principales[0];
    let mejor = severidad(ganador);
    for (let i = 1; i < principales.length; i++) {
      const s = severidad(principales[i]);
      if (s > mejor || (s === mejor && typeof ordenDeMotivo === 'function' && ordenDeMotivo(principales[i]) < ordenDeMotivo(ganador))) {
        ganador = principales[i];
        mejor = s;
      }
    }

    const candidatos = CODIGOS_INFORME.filter(c => c.motivo === ganador);
    if (candidatos.length === 1) return candidatos[0];

    // Motivo con varios códigos posibles (FALTAS / NO ENTREGAN): decide el
    // submotivo guardado. Si no hay ninguno (dato antiguo, anterior a este
    // cambio), se usa el primero como valor por defecto.
    const conSubmotivo = candidatos.find(c => arr.includes(c.submotivo));
    return conSubmotivo || candidatos[0];
  }

  window.CODIGOS_INFORME = CODIGOS_INFORME;
  window.SUBMOTIVOS_POR_MOTIVO = SUBMOTIVOS_POR_MOTIVO;
  window.codigoDeMotivos = codigoDeMotivos;
})();
