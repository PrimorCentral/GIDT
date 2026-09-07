// js/reportes-mensuales.js
// ---------------------------------------------------------------
// Análisis · Reportes mensuales — el mismo cuadro que llevabais a mano en
// Excel (ENTREGAS MERCANCIA AGENCIA), pero calculado automáticamente a
// partir de las incidencias ya registradas en la app.
//
// Requiere (ya cargados antes): sb, escapeHtml, agenciasCache, tiendasCache,
// cargarAgenciasYTiendas, codigoDeMotivos, CODIGOS_INFORME (codigos-informe.js).
// ---------------------------------------------------------------

let rmAnio = new Date().getFullYear();
let rmMes = new Date().getMonth(); // 0 = enero
let rmInicializado = false;

const RM_NOMBRES_MES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

function rmDiasDelMes(anio, mesIndex) {
  return new Date(anio, mesIndex + 1, 0).getDate();
}

async function rmCargarDatosMes(anio, mesIndex) {
  if (!agenciasCache.length) await cargarAgenciasYTiendas();

  const totalDias = rmDiasDelMes(anio, mesIndex);
  const desde = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-01`;
  const hasta = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${String(totalDias).padStart(2, '0')}`;

  const { data: informes, error: e1 } = await sb
    .from('informes_diarios')
    .select('id, fecha')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (e1) throw e1;

  const fechaPorInforme = new Map((informes || []).map(i => [i.id, i.fecha]));
  const idsInformes = (informes || []).map(i => i.id);

  let incidencias = [];
  if (idsInformes.length) {
    const { data, error: e2 } = await sb
      .from('incidencias')
      .select('informe_id, tienda_id, motivo')
      .in('informe_id', idsInformes)
      .eq('marcada', true);
    if (e2) throw e2;
    incidencias = data || [];
  }

  // celdas[tienda_id][diaDelMes] = { codigo, label, color, texto }
  const celdas = {};
  incidencias.forEach(inc => {
    const fecha = fechaPorInforme.get(inc.informe_id);
    if (!fecha) return;
    const dia = Number(fecha.slice(8, 10));
    const codigo = codigoDeMotivos(inc.motivo);
    if (!codigo) return; // solo motivos pendientes de revisar: se queda en OK
    if (!celdas[inc.tienda_id]) celdas[inc.tienda_id] = {};
    celdas[inc.tienda_id][dia] = codigo;
  });

  return { celdas, totalDias };
}

// Agrupa las tiendas activas por agencia y les da un código visual tipo
// "A01" (letra de agencia + nº de tienda), igual que en el Excel. Es solo
// para mostrar — no se guarda en ningún sitio ni depende de ningún campo nuevo.
function rmConstruirFilas() {
  const filas = [];
  agenciasCache.forEach((ag, idxAg) => {
    const letra = String.fromCharCode(65 + (idxAg % 26));
    const tds = tiendasCache.filter(t => t.agencia_id === ag.id);
    tds.forEach((t, idxT) => {
      filas.push({
        codigoFila: `${letra}${String(idxT + 1).padStart(2, '0')}`,
        agenciaNombre: ag.nombre,
        tiendaId: t.id,
        tiendaNombre: t.nombre
      });
    });
  });
  return filas;
}

function rmRenderLeyenda() {
  return `
    <div class="rm-leyenda">
      <b class="rm-leyenda-titulo">Leyenda</b>
      <div class="rm-leyenda-grid">
        ${CODIGOS_INFORME.map(c => `
          <div class="rm-leyenda-item">
            <span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};">${escapeHtml(c.codigo)}</span>
            <span>${escapeHtml(c.label)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

async function rmRender() {
  const cont = document.getElementById('contenidoReportesMensuales');
  cont.innerHTML = `<div class="card"><div class="empty"><p>Cargando…</p></div></div>`;

  let datos;
  try {
    datos = await rmCargarDatosMes(rmAnio, rmMes);
  } catch (err) {
    console.error('Error cargando el reporte mensual:', err);
    cont.innerHTML = `<div class="card"><div class="empty"><p>No se pudo cargar el reporte de este mes.</p></div></div>`;
    return;
  }

  const filas = rmConstruirFilas();
  const { celdas, totalDias } = datos;
  const cabeceraDias = Array.from({ length: totalDias }, (_, i) => `<th>${i + 1}</th>`).join('');

  const filasHtml = filas.map(f => {
    const celdasTienda = celdas[f.tiendaId] || {};
    let totalIncidencias = 0;
    const tds = Array.from({ length: totalDias }, (_, i) => {
      const dia = i + 1;
      const c = celdasTienda[dia];
      if (!c) return `<td class="rm-td-ok">OK</td>`;
      totalIncidencias++;
      return `<td><span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};" title="${escapeHtml(c.label)}">${escapeHtml(c.codigo)}</span></td>`;
    }).join('');
    return `
      <tr>
        <td class="rm-col-fija">${escapeHtml(f.codigoFila)}</td>
        <td class="rm-col-fija">${escapeHtml(f.agenciaNombre)}</td>
        <td class="rm-col-fija">${escapeHtml(f.tiendaNombre)}</td>
        ${tds}
        <td class="rm-col-total"><b>${totalIncidencias}</b></td>
      </tr>`;
  }).join('');

  cont.innerHTML = `
    <div class="card" style="padding:0; overflow-x:auto;">
      <table class="tabla-reporte-mensual">
        <thead>
          <tr>
            <th>Nº</th><th>Agencia</th><th>Tienda</th>
            ${cabeceraDias}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${filasHtml || `<tr><td colspan="${totalDias + 4}" style="text-align:center; padding:30px;">Sin tiendas activas.</td></tr>`}</tbody>
      </table>
    </div>
    ${rmRenderLeyenda()}`;
}

function rmActualizarCabecera() {
  document.getElementById('rmMesTexto').textContent = `${RM_NOMBRES_MES[rmMes]} ${rmAnio}`;
}

// Se llama desde el dropdown de Análisis (ver navegacion.js) cada vez que
// se entra en la vista; solo engancha los botones la primera vez.
function renderVistaReportesMensuales() {
  if (rmInicializado) return;
  rmInicializado = true;

  document.getElementById('rmBtnMesAnterior').addEventListener('click', () => {
    rmMes--; if (rmMes < 0) { rmMes = 11; rmAnio--; }
    rmActualizarCabecera();
    rmRender();
  });
  document.getElementById('rmBtnMesSiguiente').addEventListener('click', () => {
    rmMes++; if (rmMes > 11) { rmMes = 0; rmAnio++; }
    rmActualizarCabecera();
    rmRender();
  });
  document.getElementById('rmBtnMesActual').addEventListener('click', () => {
    const hoy = new Date();
    rmAnio = hoy.getFullYear(); rmMes = hoy.getMonth();
    rmActualizarCabecera();
    rmRender();
  });

  rmActualizarCabecera();
  rmRender();
}
