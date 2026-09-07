// js/reportes-mensuales.js
// ---------------------------------------------------------------
// Análisis · Reportes mensuales — el mismo cuadro que llevabais a mano en
// Excel (ENTREGAS MERCANCIA AGENCIA), pero calculado automáticamente a
// partir de las incidencias ya registradas en la app.
//
// Criterio de "OK": una tienda solo se pinta OK un día si ESE DÍA el
// informe diario llegó a enviarse (informes_diarios.informe_enviado =
// true) y no tuvo incidencia. Si el informe de ese día no existe o
// todavía no se ha enviado, la celda se deja en blanco (pendiente),
// nunca en OK.
//
// Filtros: mismo diseño y comportamiento que el panel de "Filtrar
// incidencias" del Informe del día (misma estructura HTML/CSS, ver
// filtros-motivos.js) — Agencia, Tienda y "solo con incidencias este mes".
//
// Requiere (ya cargados antes): sb, escapeHtml, agenciasCache, tiendasCache,
// cargarAgenciasYTiendas, codigoDeMotivos, CODIGOS_INFORME (codigos-informe.js).
// Los .filtro-select (abrir/cerrar dropdown, buscador) ya quedan enganchados
// de forma genérica por filtros-motivos.js (document.querySelectorAll('.filtro-select')),
// así que no hace falta repetir esa parte aquí.
// ---------------------------------------------------------------

let rmAnio = new Date().getFullYear();
let rmMes = new Date().getMonth(); // 0 = enero
let rmInicializado = false;
let rmLeyendaPintada = false;

const rmFiltros = { agencias: new Set(), tiendas: new Set(), soloConIncidencias: false };

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
    .select('id, fecha, informe_enviado')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (e1) throw e1;

  const fechaPorInforme = new Map((informes || []).map(i => [i.id, i.fecha]));

  // Solo cuentan como "día resuelto" (con derecho a OK) los informes que
  // realmente se enviaron. El resto se queda en blanco, esté o no generado.
  const diasEnviados = new Set();
  (informes || []).forEach(i => {
    if (i.informe_enviado) diasEnviados.add(Number(i.fecha.slice(8, 10)));
  });

  const idsInformesEnviados = (informes || []).filter(i => i.informe_enviado).map(i => i.id);

  let incidencias = [];
  if (idsInformesEnviados.length) {
    const { data, error: e2 } = await sb
      .from('incidencias')
      .select('informe_id, tienda_id, motivo')
      .in('informe_id', idsInformesEnviados)
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

  return { celdas, diasEnviados, totalDias };
}

// Todas las filas posibles (tienda x agencia), con su código visual tipo
// "A01" calculado sobre el listado COMPLETO (sin filtrar), para que el
// código de cada tienda no cambie según qué filtros haya activos.
function rmConstruirTodasLasFilas() {
  const todas = [];
  agenciasCache.forEach((ag, idxAg) => {
    const letra = String.fromCharCode(65 + (idxAg % 26));
    const tds = tiendasCache.filter(t => t.agencia_id === ag.id);
    tds.forEach((t, idxT) => {
      todas.push({
        codigoFila: `${letra}${String(idxT + 1).padStart(2, '0')}`,
        agenciaId: ag.id,
        agenciaNombre: ag.nombre,
        tiendaId: t.id,
        tiendaNombre: t.nombre
      });
    });
  });
  return todas;
}

function rmFilasSegunFiltros() {
  return rmConstruirTodasLasFilas().filter(f =>
    (!rmFiltros.agencias.size || rmFiltros.agencias.has(f.agenciaId)) &&
    (!rmFiltros.tiendas.size || rmFiltros.tiendas.has(f.tiendaId))
  );
}

// Se pinta UNA sola vez (la leyenda es fija) en la barra superior.
function rmPintarLeyendaCompacta() {
  if (rmLeyendaPintada) return;
  const cont = document.getElementById('rmLeyendaCompacta');
  if (!cont) return;
  cont.innerHTML = CODIGOS_INFORME.map(c => `
    <span class="rm-leyenda-item">
      <span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};">${escapeHtml(c.codigo)}</span>
      <span>${escapeHtml(c.label)}</span>
    </span>`).join('');
  rmLeyendaPintada = true;
}

// ---------------------------------------------------------------
// Panel de filtros (mismo diseño que "Filtrar incidencias" del
// Informe del día): Agencia, Tienda y "solo con incidencias este mes".
// ---------------------------------------------------------------
function rmConstruirPanelFiltros() {
  const listaAg = document.getElementById('rmFiltrosAgenciasLista');
  const listaTd = document.getElementById('rmFiltrosTiendasLista');
  if (!listaAg || !listaTd) return;

  if (!listaAg.dataset.built) {
    listaAg.innerHTML = agenciasCache.map(ag => `
      <label class="filtro-check">
        <input type="checkbox" value="${ag.id}" data-filtro="agencia">
        <span>${escapeHtml(ag.nombre)}</span>
      </label>`).join('');
    listaAg.dataset.built = '1';
  }
  if (!listaTd.dataset.built) {
    listaTd.innerHTML = tiendasCache.map(t => `
      <label class="filtro-check">
        <input type="checkbox" value="${t.id}" data-filtro="tienda">
        <span>${escapeHtml(t.nombre)}</span>
      </label>`).join('');
    listaTd.dataset.built = '1';
  }

  const panel = document.getElementById('rmFiltrosPanel');
  if (!panel.dataset.wired) {
    panel.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"]')) return;
      if (cb.id === 'rmFiltroSoloConIncidencias') {
        rmFiltros.soloConIncidencias = cb.checked;
        rmActualizarBadgeFiltros();
        rmRender();
        return;
      }
      const grupo = cb.dataset.filtro;
      const set = grupo === 'agencia' ? rmFiltros.agencias : rmFiltros.tiendas;
      const val = Number(cb.value);
      if (cb.checked) set.add(val); else set.delete(val);
      rmActualizarBadgeFiltros();
      rmActualizarValoresSelects();
      rmRender();
    });
    panel.dataset.wired = '1';
  }
}

function rmActualizarValoresSelects() {
  document.querySelectorAll('#rmFiltrosPanel .filtro-select').forEach(sel => {
    const grupo = sel.dataset.grupo;
    const set = grupo === 'agencia' ? rmFiltros.agencias : rmFiltros.tiendas;
    const valor = sel.querySelector('.filtro-select-valor');
    if (set.size === 0) {
      valor.textContent = 'Todas';
      sel.classList.remove('activo');
    } else if (set.size === 1) {
      const cb = sel.querySelector('input[type="checkbox"]:checked');
      valor.textContent = cb ? cb.closest('.filtro-check').textContent.trim() : '1 seleccionada';
      sel.classList.add('activo');
    } else {
      valor.textContent = `${set.size} seleccionadas`;
      sel.classList.add('activo');
    }
  });
}

function rmActualizarBadgeFiltros() {
  const total = rmFiltros.agencias.size + rmFiltros.tiendas.size + (rmFiltros.soloConIncidencias ? 1 : 0);
  const badge = document.getElementById('rmFiltrosCount');
  const btn = document.getElementById('btnRmFiltros');
  if (total > 0) {
    badge.textContent = total;
    badge.style.display = '';
    btn.classList.add('activo');
  } else {
    badge.style.display = 'none';
    btn.classList.remove('activo');
  }
}

function rmPosicionarFiltrosPanel() {
  const btn = document.getElementById('btnRmFiltros');
  const panel = document.getElementById('rmFiltrosPanel');
  const wrap = btn.closest('.filtros-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const margen = 12;
  const ancho = Math.min(560, window.innerWidth - margen * 2);
  panel.style.width = ancho + 'px';
  let left = 0;
  const desbordeDerecha = (wrapRect.left + left + ancho) - (window.innerWidth - margen);
  if (desbordeDerecha > 0) left -= desbordeDerecha;
  if (wrapRect.left + left < margen) left = margen - wrapRect.left;
  panel.style.left = left + 'px';
}

function rmAbrirFiltrosPanel() {
  rmPosicionarFiltrosPanel();
  document.getElementById('rmFiltrosPanel').classList.add('show');
  document.getElementById('btnRmFiltros').classList.add('open');
}
function rmCerrarFiltrosPanel() {
  document.getElementById('rmFiltrosPanel').classList.remove('show');
  document.getElementById('btnRmFiltros').classList.remove('open');
  if (typeof cerrarTodosLosSelects === 'function') cerrarTodosLosSelects(null);
}

function rmEngancharFiltros() {
  const btn = document.getElementById('btnRmFiltros');
  const panel = document.getElementById('rmFiltrosPanel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.classList.contains('show')) rmCerrarFiltrosPanel();
    else rmAbrirFiltrosPanel();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) rmCerrarFiltrosPanel();
  });
  window.addEventListener('resize', () => {
    if (panel.classList.contains('show')) rmPosicionarFiltrosPanel();
  });

  document.getElementById('btnRmCerrarFiltros').addEventListener('click', rmCerrarFiltrosPanel);
  document.getElementById('btnRmLimpiarFiltros').addEventListener('click', () => {
    rmFiltros.agencias.clear();
    rmFiltros.tiendas.clear();
    rmFiltros.soloConIncidencias = false;
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    rmActualizarBadgeFiltros();
    rmActualizarValoresSelects();
    rmRender();
  });
}

// ---------------------------------------------------------------
// Render de la tabla
// ---------------------------------------------------------------
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

  rmConstruirPanelFiltros();

  const filas = rmFilasSegunFiltros();
  const { celdas, diasEnviados, totalDias } = datos;
  const cabeceraDias = Array.from({ length: totalDias }, (_, i) => `<th>${i + 1}</th>`).join('');

  const filasConDatos = filas.map(f => {
    const celdasTienda = celdas[f.tiendaId] || {};
    let totalIncidencias = 0;
    const tds = Array.from({ length: totalDias }, (_, i) => {
      const dia = i + 1;
      if (!diasEnviados.has(dia)) return `<td class="rm-td-pendiente" title="Informe no enviado ese día">–</td>`;
      const c = celdasTienda[dia];
      if (!c) return `<td class="rm-td-ok">OK</td>`;
      totalIncidencias++;
      return `<td><span class="rm-celda-codigo" style="background:${c.color}; color:${c.texto};" title="${escapeHtml(c.label)}">${escapeHtml(c.codigo)}</span></td>`;
    }).join('');
    return { f, tds, totalIncidencias };
  });

  const filasVisibles = rmFiltros.soloConIncidencias
    ? filasConDatos.filter(x => x.totalIncidencias > 0)
    : filasConDatos;

  const filasHtml = filasVisibles.map(({ f, tds, totalIncidencias }) => `
    <tr>
      <td class="rm-col-fija">${escapeHtml(f.codigoFila)}</td>
      <td class="rm-col-fija">${escapeHtml(f.agenciaNombre)}</td>
      <td class="rm-col-fija">${escapeHtml(f.tiendaNombre)}</td>
      ${tds}
      <td class="rm-col-total"><b>${totalIncidencias}</b></td>
    </tr>`).join('');

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
        <tbody>${filasHtml || `<tr><td colspan="${totalDias + 4}" style="text-align:center; padding:30px;">Sin tiendas para estos filtros.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function rmActualizarCabecera() {
  document.getElementById('rmMesTexto').textContent = `${RM_NOMBRES_MES[rmMes]} ${rmAnio}`;
}

// Se llama desde el dropdown de Análisis (ver navegacion.js) cada vez que
// se entra en la vista; solo engancha los botones la primera vez.
function renderVistaReportesMensuales() {
  rmPintarLeyendaCompacta();

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

  rmEngancharFiltros();

  rmActualizarCabecera();
  rmRender();
}
