// ---------------------------------------------------------------
// Editar un informe de un día pasado (Historial de informes diarios)
// ---------------------------------------------------------------
// A diferencia del informe de HOY, esto nunca envía nada a las
// agencias — solo corrige/completa lo que se registró ese día. Si al
// editar aparece una incidencia de tipo ROTURA/FALTAS/MIXTO, se pide
// una foto (se sube al momento, para no perderla) pero el siniestro
// solo se da de alta en el Panel siniestros al pulsar "Terminar de
// editar": mientras tanto todo vive en un BORRADOR local en memoria.
// Si se pulsa "Salir", se descarta el borrador (y se borran del
// Storage las fotos que se hubieran subido para siniestros nuevos).
//
// Requiere (ya cargados antes): sb, escapeHtml, modalAlert, modalConfirm,
// agenciasCache, tiendasCache, cargarAgenciasYTiendas, badgeMarcaHtml,
// motivosChecklistHtml, resumenMotivos, calcularTipo, tipoSiniestroDeMotivos,
// posicionarDropdownMotivo, comprimirImagenParaSubida, sesionActual,
// dias, formatearFechaCorta, fechaLocalISO, tiendaConHorarioDia (utilidades-informe.js),
// filtrosHistorial / historialFiltrosActivos / mostrarFiltroSoloConIncidenciasHistorial
// (historial-filtros.js), renderHistorialInforme (informe-hoy.js).

const PS_TIPO_DESDE_SINIESTRO_HIST = { ROTURA: 'ROTURA', FALTA: 'FALTAS', MIXTO: 'FALTAS Y ROTURAS' };

let historialEditando = false;
let historialTodasIncidencias = []; // TODAS las incidencias ya guardadas en BD para ese informe (marcadas o no)

// Borrador en memoria mientras se edita: cambios que aún no se han
// guardado en la base de datos. Se confirman al pulsar "Terminar de
// editar" y se descartan al pulsar "Salir".
let historialBorrador = new Map();        // tiendaId -> { motivos: [...], observaciones: '' }
let historialSiniestrosDraft = new Map(); // tiendaId -> { tipoSiniestro, fotos: [...], fotosPaths: [...], tienda, agencia }

function incidenciaDeTiendaHistorial(tiendaId) {
  return historialTodasIncidencias.find(i => i.tienda_id === tiendaId) || null;
}

// Estado "efectivo" de una tienda mientras se edita: lo que hay en el
// borrador si se ha tocado, o si no lo que hay guardado en BD.
function estadoEfectivoHistorial(tiendaId) {
  if (historialBorrador.has(tiendaId)) return historialBorrador.get(tiendaId);
  const inc = incidenciaDeTiendaHistorial(tiendaId);
  return { motivos: inc?.motivo || [], observaciones: inc?.observaciones || '' };
}

function hayCambiosSinGuardarHistorial() {
  return historialBorrador.size > 0 || historialSiniestrosDraft.size > 0;
}

window.addEventListener('beforeunload', (e) => {
  if (historialEditando && hayCambiosSinGuardarHistorial()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function activarEdicionHistorial() {
  if (!historialInformeActual) return;
  if (!agenciasCache.length) await cargarAgenciasYTiendas();

  const { data, error } = await sb.from('incidencias')
    .select('id, tienda_id, marcada, tipo, motivo, observaciones, tienda_nombre, tienda_hora_prevista, tienda_marca, agencia_id, agencia_nombre')
    .eq('informe_id', historialInformeActual.id);
  if (error) {
    console.error('Error cargando incidencias para editar:', error);
    await modalAlert('No se pudieron cargar las incidencias de ese día.', { titulo: 'Error' });
    return;
  }
  historialTodasIncidencias = data || [];
  historialBorrador = new Map();
  historialSiniestrosDraft = new Map();
  historialEditando = true;
  if (typeof mostrarFiltroSoloConIncidenciasHistorial === 'function') mostrarFiltroSoloConIncidenciasHistorial(true);
  renderAcordeonHistorialEditable();
}

async function borrarFotosStorage(paths) {
  if (!paths || !paths.length) return;
  try {
    await sb.storage.from('siniestros-fotos').remove(paths);
  } catch (err) {
    console.error('Error borrando fotos:', err);
  }
}

// Borra del Storage las fotos subidas para siniestros del borrador (al
// descartar cambios), incluidas las del modal de fotos si estuviera abierto.
async function borrarFotosBorradorStorage() {
  const paths = [];
  historialSiniestrosDraft.forEach(d => paths.push(...(d.fotosPaths || [])));
  if (historialFotosPendiente?.fotosPaths?.length) paths.push(...historialFotosPendiente.fotosPaths);
  await borrarFotosStorage(paths);
}

// El siniestro puede estar ya en el Panel por dos vías: dado de alta
// directamente desde este mismo histórico (enlazado por incidencia_id), o
// por el flujo normal del día en que se creó (una fila en "siniestros"
// enlazada por incidencia_id, y esa fila enlazada al Panel por
// siniestro_id). Devuelve el id de la fila del Panel si existe por
// cualquiera de las dos, o null si no está en ninguna.
async function panelSiniestroDeIncidencia(incidenciaId) {
  const { data: panelDirecto } = await sb.from('panel_siniestros').select('id').eq('incidencia_id', incidenciaId).maybeSingle();
  if (panelDirecto) return panelDirecto.id;

  const { data: sinLigado } = await sb.from('siniestros').select('id').eq('incidencia_id', incidenciaId).maybeSingle();
  if (sinLigado) {
    const { data: panelPorSiniestro } = await sb.from('panel_siniestros').select('id').eq('siniestro_id', sinLigado.id).maybeSingle();
    if (panelPorSiniestro) return panelPorSiniestro.id;
  }
  return null;
}

// ---------------- "Terminar de editar": vuelca el borrador a BD ----------------

async function finalizarEdicionHistorial() {
  if (!hayCambiosSinGuardarHistorial()) {
    salirDeEdicionHistorial();
    return;
  }

  try {
    // 1) Guardar en BD cada incidencia tocada en el borrador.
    for (const [tiendaId, borrador] of historialBorrador) {
      const motivos = borrador.motivos;
      const observaciones = borrador.observaciones;
      const marcada = motivos.length > 0;
      const tipo = calcularTipo(motivos);
      const existente = incidenciaDeTiendaHistorial(tiendaId);

      if (!marcada) {
        if (existente) {
          const { error } = await sb.from('incidencias').delete().eq('id', existente.id);
          if (error) throw error;
          historialTodasIncidencias = historialTodasIncidencias.filter(i => i.id !== existente.id);
        }
        continue;
      }

      const tienda = typeof tiendaConHorarioDia === 'function'
        ? tiendaConHorarioDia(tiendaId, historialInformeActual.fecha)
        : tiendasCache.find(t => t.id === tiendaId);
      const agencia = tienda ? agenciasCache.find(a => a.id === tienda.agencia_id) : null;

      const { data: guardada, error } = await sb.from('incidencias').upsert({
        informe_id: historialInformeActual.id,
        tienda_id: tiendaId,
        marcada, tipo, motivo: motivos, observaciones,
        usuario: sesionActual?.nombre || sesionActual?.usuario || null,
        actualizado_en: new Date().toISOString(),
        tienda_nombre: tienda?.nombre || null,
        tienda_hora_prevista: tienda?.hora_prevista || null,
        tienda_marca: tienda?.marca || null,
        agencia_id: tienda?.agencia_id || null,
        agencia_nombre: agencia?.nombre || null
      }, { onConflict: 'informe_id,tienda_id' }).select().single();
      if (error) throw error;

      if (existente) Object.assign(existente, guardada);
      else historialTodasIncidencias.push(guardada);
    }

    // 2) Dar de alta en el Panel siniestros los siniestros nuevos del borrador.
    for (const [tiendaId, draftSin] of historialSiniestrosDraft) {
      const inc = incidenciaDeTiendaHistorial(tiendaId);
      if (!inc) continue; // se debió quitar el motivo justo antes de terminar
      const panelExistenteId = await panelSiniestroDeIncidencia(inc.id);
      if (panelExistenteId) continue; // ya está de alta (por si acaso)
      await crearSiniestroPanelDesdeBorrador(inc, draftSin, historialInformeActual);
    }

    historialBorrador = new Map();
    historialSiniestrosDraft = new Map();
    salirDeEdicionHistorial();
  } catch (err) {
    console.error('Error guardando los cambios del histórico:', err);
    await modalAlert('No se pudieron guardar todos los cambios. Los que sí se aplicaron se han mantenido: revisa e inténtalo de nuevo.', { titulo: 'Error' });
    renderAcordeonHistorialEditable();
  }
}

async function crearSiniestroPanelDesdeBorrador(incidencia, draftSin, informe) {
  const recogidaLimite = (() => {
    if (draftSin.tipoSiniestro === 'FALTA') return null;
    const limite = new Date(informe.fecha + 'T00:00:00');
    limite.setDate(limite.getDate() + 15);
    return fechaLocalISO(limite);
  })();

  const { error } = await sb.from('panel_siniestros').insert({
    fecha: informe.fecha,
    tipo: PS_TIPO_DESDE_SINIESTRO_HIST[draftSin.tipoSiniestro] || 'ROTURA',
    agencia_id: draftSin.agencia?.id || null,
    agencia_nombre: draftSin.agencia?.nombre || null,
    tienda_id: draftSin.tienda?.id || null,
    tienda_nombre: draftSin.tienda?.nombre || null,
    informacion: incidencia.observaciones || null,
    fotos: draftSin.fotos,
    estado: 'PDTE COBRO',
    recogida_limite: recogidaLimite,
    incidencia_id: incidencia.id,
    creado_por: sesionActual?.nombre || sesionActual?.usuario || null
  });
  if (error) throw error;
}

// ---------------- "Salir": descarta el borrador ----------------

async function cancelarEdicionHistorial() {
  await confirmarDescartarEdicionHistorial();
}

// Comprueba si hay cambios sin guardar en la edición del histórico y, si
// los hay, pregunta antes de continuar (mismo modal que el botón "Salir").
// Si se confirma, descarta el borrador (incluidas las fotos ya subidas a
// Storage) y sale del modo edición. Pensada para usarse como guarda antes
// de cualquier navegación fuera de esta pantalla (cambiar de pestaña,
// cerrar sesión, ir a "Informe de hoy"…).
// Devuelve true si se puede continuar (no había cambios, o se confirmó
// descartarlos), false si hay que quedarse donde se está.
async function confirmarDescartarEdicionHistorial() {
  if (!historialEditando) return true;
  if (hayCambiosSinGuardarHistorial()) {
    const ok = await modalConfirm('Tienes cambios sin guardar en este informe. ¿Descartarlos?', { titulo: 'Descartar cambios', danger: true, textoOk: 'Descartar' });
    if (!ok) return false;
    await borrarFotosBorradorStorage();
  }
  historialBorrador = new Map();
  historialSiniestrosDraft = new Map();
  salirDeEdicionHistorial();
  return true;
}

function salirDeEdicionHistorial() {
  historialEditando = false;
  if (typeof mostrarFiltroSoloConIncidenciasHistorial === 'function') mostrarFiltroSoloConIncidenciasHistorial(false);
  if (!historialInformeActual) return;
  historialIncidenciasActual = historialTodasIncidencias.filter(i => i.marcada);
  renderHistorialInforme();
}

// ---------------- Render del acordeón editable (con borrador + filtros) ----------------

function renderAcordeonHistorialEditable() {
  const cont = document.getElementById('contenidoHistorial');
  const informe = historialInformeActual;
  const fechaInforme = new Date(informe.fecha + 'T00:00:00');
  const fechaTexto = `${dias[fechaInforme.getDay()]}, ${formatearFechaCorta(fechaInforme)}`;
  const estadoTexto = informe.informe_enviado ? 'ENVIADO' : informe.estado;

  const f = (document.getElementById('buscarTiendaHistorial')?.value || '').trim().toUpperCase();

  let agenciasAMostrar = agenciasCache;
  if (typeof filtrosHistorial !== 'undefined' && filtrosHistorial.agencias.size) {
    agenciasAMostrar = agenciasCache.filter(ag => filtrosHistorial.agencias.has(ag.id));
  }

  const bloques = agenciasAMostrar.map(ag => {
    let tds = tiendasCache.filter(t => t.agencia_id === ag.id && t.activo);
    if (f) tds = tds.filter(t => t.nombre.toUpperCase().includes(f));

    if (typeof filtrosHistorial !== 'undefined') {
      if (filtrosHistorial.marcas.size) tds = tds.filter(t => filtrosHistorial.marcas.has(t.marca));
      if (filtrosHistorial.tipos.size || filtrosHistorial.motivos.size || filtrosHistorial.soloConIncidencias || filtrosHistorial.soloPendientes) {
        tds = tds.filter(t => {
          const estado = estadoEfectivoHistorial(t.id);
          const motivosActuales = estado.motivos;
          const marcada = motivosActuales.length > 0;
          const tipoCalc = calcularTipo(motivosActuales);
          const tipoEfectivo = marcada ? (tipoCalc || 'PENDIENTE') : null;
          if (filtrosHistorial.soloConIncidencias && !marcada) return false;
          if (filtrosHistorial.soloPendientes && !motivosActuales.some(m => m === 'RETRASO PDTE CONFIRMAR' || m === 'REVISANDO POSIBLE INCIDENCIA')) return false;
          if (filtrosHistorial.tipos.size && (!tipoEfectivo || !filtrosHistorial.tipos.has(tipoEfectivo))) return false;
          if (filtrosHistorial.motivos.size && !motivosActuales.some(m => filtrosHistorial.motivos.has(m))) return false;
          return true;
        });
      }
    }

    if (!tds.length) return '';
    const numInc = tds.filter(t => estadoEfectivoHistorial(t.id).motivos.length > 0).length;

    const filas = tds.map(t => {
      const estado = estadoEfectivoHistorial(t.id);
      const motivosActuales = estado.motivos;
      const marcada = motivosActuales.length > 0;
      const tipoCalc = calcularTipo(motivosActuales);
      const esPendiente = marcada && !tipoCalc;
      const claseFila = marcada ? (tipoCalc ? tipoCalc.toLowerCase() : 'pendiente') : '';
      const badgeTipo = !marcada
        ? '<span style="color:var(--ink-soft); font-size:12px;">—</span>'
        : esPendiente
          ? '<span class="pill pendiente">Pendiente</span>'
          : `<span class="pill ${tipoCalc.toLowerCase()}">${tipoCalc.charAt(0)+tipoCalc.slice(1).toLowerCase()}</span>`;
      // Hora de ESE día: si la tienda tenía un horario semanal especial
      // para el día de la semana de esta fecha (p. ej. era Martes), se
      // usa esa hora en vez de la hora general actual de la tienda.
      const horaDelDia = typeof tiendaConHorarioDia === 'function'
        ? (tiendaConHorarioDia(t.id, informe.fecha)?.hora_prevista || t.hora_prevista)
        : t.hora_prevista;
      const tieneCambioSinGuardar = historialBorrador.has(t.id) || historialSiniestrosDraft.has(t.id);

      return `
        <tr data-tienda="${t.id}" class="${claseFila ? 'con-incidencia ' + claseFila : ''}">
          <td class="col-estado">${marcada ? '🔴' : '—'}</td>
          <td class="col-hora">${horaDelDia ? horaDelDia.slice(0,5) : '—'}</td>
          <td class="col-tienda">${badgeMarcaHtml(t.marca)}${escapeHtml(t.nombre)}${tieneCambioSinGuardar ? ' <span title="Cambio sin guardar todavía" style="opacity:.6;">✏️</span>' : ''}</td>
          <td class="col-tipo">${badgeTipo}</td>
          <td class="col-motivo">
            <div class="motivo-select">
              <button type="button" class="filtro-select-btn">
                <span class="motivo-select-valor">${escapeHtml(resumenMotivos(motivosActuales))}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button type="button" class="mini-btn btn-borrar-motivos-hist" title="Quitar todos los motivos" style="${marcada ? '' : 'display:none;'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="filtro-select-dropdown">
                <div class="filtro-select-search">
                  <input type="text" placeholder="🔎 Buscar motivo…" class="i-buscar-motivo">
                </div>
                <div class="filtro-select-lista">${motivosChecklistHtml(motivosActuales)}</div>
              </div>
            </div>
          </td>
          <td class="col-obs"><input type="text" class="form-input i-obs" placeholder="Observaciones…" value="${escapeHtml(estado.observaciones || '')}" ${marcada ? '' : 'disabled'}></td>
        </tr>`;
    }).join('');

    return `
      <div class="agencia-block">
        <div class="agencia-head open" data-agencia="${ag.id}">
          <span class="caret">▶</span>
          <b>${escapeHtml(ag.nombre)}</b>
          <span class="count">${tds.length} tienda${tds.length===1?'':'s'}</span>
          ${numInc ? `<span class="conteo-inc">${numInc} incidencia${numInc===1?'':'s'}</span>` : ''}
        </div>
        <div class="agencia-body open">
          <table class="tabla-incidencias">
            <colgroup>
              <col class="cg-estado"><col class="cg-hora"><col class="cg-tienda">
              <col class="cg-tipo"><col class="cg-motivo"><col class="cg-obs">
            </colgroup>
            <thead><tr><th></th><th>Hora</th><th>Tienda</th><th>Tipo</th><th>Motivo</th><th>Observaciones</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  const avisoBorrador = hayCambiosSinGuardarHistorial()
    ? `<span style="font-size:12px; color:var(--moderado); font-weight:700;">● Cambios sin guardar</span>`
    : '';

  cont.innerHTML = `
    <div class="card" style="margin-bottom:14px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <div>
        <b style="text-transform:capitalize;">${fechaTexto}</b>
        ${informe.total_palets ? ` · ${informe.total_palets} palets previstos` : ''} · Estado: ${estadoTexto}
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:12px; color:var(--ink-soft); font-weight:700;">✏️ Editando — no se envía nada a las agencias</span>
        ${avisoBorrador}
        <button class="btn" id="btnSalirEdicionHistorial">Salir</button>
        <button class="btn primary" id="btnTerminarEdicionHistorial">Terminar de editar</button>
      </div>
    </div>
    ${bloques}`;

  document.getElementById('btnTerminarEdicionHistorial').addEventListener('click', finalizarEdicionHistorial);
  document.getElementById('btnSalirEdicionHistorial').addEventListener('click', cancelarEdicionHistorial);

  cont.querySelectorAll('.agencia-head').forEach(head => {
    head.addEventListener('click', () => {
      head.classList.toggle('open');
      head.nextElementSibling.classList.toggle('open');
    });
  });

  cont.querySelectorAll('tr[data-tienda]').forEach(tr => {
    const tiendaId = Number(tr.dataset.tienda);
    const inputObs = tr.querySelector('.i-obs');
    const guardar = () => actualizarBorradorIncidencia(tiendaId, tr);
    const btnBorrarMotivos = tr.querySelector('.btn-borrar-motivos-hist');

    tr.querySelectorAll('.i-motivo-check').forEach(cb => cb.addEventListener('change', () => {
      const hayMotivo = tr.querySelectorAll('.i-motivo-check:checked').length > 0;
      inputObs.disabled = !hayMotivo;
      if (btnBorrarMotivos) btnBorrarMotivos.style.display = hayMotivo ? '' : 'none';
      guardar();
    }));

    if (btnBorrarMotivos) {
      btnBorrarMotivos.addEventListener('click', async (e) => {
        e.stopPropagation();
        const estado = estadoEfectivoHistorial(tiendaId);
        if (!estado.motivos.length) return;

        const existente = incidenciaDeTiendaHistorial(tiendaId);
        if (existente) {
          const panelId = await panelSiniestroDeIncidencia(existente.id);
          if (panelId) {
            await modalAlert('Este siniestro ya está en el Panel siniestros. Para eliminarlo, hazlo desde ahí.', { titulo: 'No se puede eliminar' });
            return;
          }
        }

        const ok = await modalConfirm('¿Quitar todos los motivos de esta incidencia?', { titulo: 'Quitar incidencia', danger: true, textoOk: 'Quitar' });
        if (!ok) return;

        if (historialSiniestrosDraft.has(tiendaId)) {
          await borrarFotosStorage(historialSiniestrosDraft.get(tiendaId).fotosPaths);
          historialSiniestrosDraft.delete(tiendaId);
        }

        historialBorrador.set(tiendaId, { motivos: [], observaciones: '' });
        renderAcordeonHistorialEditable();
      });
    }

    inputObs.addEventListener('input', () => {
      const pos = inputObs.selectionStart;
      inputObs.value = inputObs.value.toUpperCase();
      inputObs.setSelectionRange(pos, pos);
    });
    inputObs.addEventListener('blur', guardar);

    const motivoSel = tr.querySelector('.motivo-select');
    if (motivoSel) {
      const btn = motivoSel.querySelector('.filtro-select-btn');
      const dropdown = motivoSel.querySelector('.filtro-select-dropdown');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const yaAbierto = motivoSel.classList.contains('open');
        document.querySelectorAll('.motivo-select.open').forEach(o => { if (o !== motivoSel) o.classList.remove('open'); });
        motivoSel.classList.toggle('open', !yaAbierto);
        if (!yaAbierto) posicionarDropdownMotivo(motivoSel, dropdown);
      });
      dropdown.addEventListener('click', (e) => e.stopPropagation());
      const buscadorMotivo = dropdown.querySelector('.i-buscar-motivo');
      if (buscadorMotivo) {
        buscadorMotivo.addEventListener('click', (e) => e.stopPropagation());
        buscadorMotivo.addEventListener('input', () => {
          const q = buscadorMotivo.value.trim().toUpperCase();
          dropdown.querySelectorAll('.filtro-check').forEach(row => {
            row.classList.toggle('oculto', q && !row.textContent.trim().toUpperCase().includes(q));
          });
        });
      }
    }
  });
}

// Actualiza solo la fila afectada, sin reconstruir el acordeón entero,
// salvo que haya filtros o búsqueda activos: en ese caso, la fila podría
// dejar de cumplirlos, así que se recalcula el listado completo.
function actualizarFilaHistorial(tiendaId, tr) {
  const hayFiltrosOBusqueda = (typeof historialFiltrosActivos === 'function' && historialFiltrosActivos()) ||
    (document.getElementById('buscarTiendaHistorial')?.value || '').trim();
  if (hayFiltrosOBusqueda) {
    renderAcordeonHistorialEditable();
    return;
  }

  const estado = estadoEfectivoHistorial(tiendaId);
  const motivosActuales = estado.motivos;
  const marcada = motivosActuales.length > 0;
  const tipoCalc = calcularTipo(motivosActuales);
  const esPendiente = marcada && !tipoCalc;
  const claseFila = marcada ? (tipoCalc ? tipoCalc.toLowerCase() : 'pendiente') : '';

  tr.className = claseFila ? 'con-incidencia ' + claseFila : '';
  tr.querySelector('.col-estado').textContent = marcada ? '🔴' : '—';
  const btnBorrarMotivos = tr.querySelector('.btn-borrar-motivos-hist');
  if (btnBorrarMotivos) btnBorrarMotivos.style.display = marcada ? '' : 'none';

  const badgeTipo = !marcada
    ? '<span style="color:var(--ink-soft); font-size:12px;">—</span>'
    : esPendiente
      ? '<span class="pill pendiente">Pendiente</span>'
      : `<span class="pill ${tipoCalc.toLowerCase()}">${tipoCalc.charAt(0)+tipoCalc.slice(1).toLowerCase()}</span>`;
  tr.querySelector('.col-tipo').innerHTML = badgeTipo;

  const valorEl = tr.querySelector('.motivo-select-valor');
  if (valorEl) valorEl.textContent = resumenMotivos(motivosActuales);

  const bloque = tr.closest('.agencia-block');
  if (bloque) {
    const numInc = bloque.querySelectorAll('tr.con-incidencia').length;
    const head = bloque.querySelector('.agencia-head');
    let contEl = head.querySelector('.conteo-inc');
    if (numInc > 0) {
      if (!contEl) {
        contEl = document.createElement('span');
        contEl.className = 'conteo-inc';
        head.appendChild(contEl);
      }
      contEl.textContent = `${numInc} incidencia${numInc === 1 ? '' : 's'}`;
    } else if (contEl) {
      contEl.remove();
    }
  }
}

// ---------------- Guardar en el borrador (no en BD) al tocar una fila ----------------

async function actualizarBorradorIncidencia(tiendaId, tr) {
  const motivos = Array.from(tr.querySelectorAll('.i-motivo-check:checked')).map(cb => cb.value);
  const observaciones = tr.querySelector('.i-obs').value.trim().toUpperCase();
  const tipoSiniestroNuevo = tipoSiniestroDeMotivos(motivos);
  const existente = incidenciaDeTiendaHistorial(tiendaId);

  // Si esta incidencia ya tiene un siniestro dado de alta en el Panel (de
  // una edición/día anterior) y el cambio la dejaría sin motivo de
  // siniestro, no se permite: hay que gestionarlo desde el Panel siniestros.
  if (existente && !tipoSiniestroNuevo) {
    const panelId = await panelSiniestroDeIncidencia(existente.id);
    if (panelId) {
      await modalAlert('Este siniestro ya está en el Panel siniestros. Para eliminarlo, hazlo desde ahí.', { titulo: 'No se puede modificar' });
      const estadoPrevio = estadoEfectivoHistorial(tiendaId);
      tr.querySelectorAll('.i-motivo-check').forEach(cb => { cb.checked = estadoPrevio.motivos.includes(cb.value); });
      const hayMotivo = estadoPrevio.motivos.length > 0;
      tr.querySelector('.i-obs').disabled = !hayMotivo;
      const btnBorrar = tr.querySelector('.btn-borrar-motivos-hist');
      if (btnBorrar) btnBorrar.style.display = hayMotivo ? '' : 'none';
      const valorEl = tr.querySelector('.motivo-select-valor');
      if (valorEl) valorEl.textContent = resumenMotivos(estadoPrevio.motivos);
      return;
    }
  }

  historialBorrador.set(tiendaId, { motivos, observaciones });

  if (tipoSiniestroNuevo) {
    const panelExistenteId = existente ? await panelSiniestroDeIncidencia(existente.id) : null;
    if (!panelExistenteId) {
      if (historialSiniestrosDraft.has(tiendaId)) {
        historialSiniestrosDraft.get(tiendaId).tipoSiniestro = tipoSiniestroNuevo;
      } else {
        const tienda = typeof tiendaConHorarioDia === 'function'
          ? tiendaConHorarioDia(tiendaId, historialInformeActual.fecha)
          : tiendasCache.find(t => t.id === tiendaId);
        const agencia = tienda ? agenciasCache.find(a => a.id === tienda.agencia_id) : null;
        await abrirModalFotosBorrador(tiendaId, tienda, agencia, tipoSiniestroNuevo);
      }
    }
  } else if (historialSiniestrosDraft.has(tiendaId)) {
    await borrarFotosStorage(historialSiniestrosDraft.get(tiendaId).fotosPaths);
    historialSiniestrosDraft.delete(tiendaId);
  }

  actualizarFilaHistorial(tiendaId, tr);
}

// ---------------- Fotos del siniestro en borrador (se suben al momento; el alta en el Panel se difiere) ----------------

let historialFotosPendiente = null; // { tiendaId, tienda, agencia, tipoSiniestro, fotos: [], fotosPaths: [] }

async function abrirModalFotosBorrador(tiendaId, tienda, agencia, tipoSiniestro) {
  historialFotosPendiente = { tiendaId, tienda, agencia, tipoSiniestro, fotos: [], fotosPaths: [] };

  document.getElementById('historialFotosTitulo').textContent = '📷 Añadir fotos al siniestro';
  document.getElementById('historialFotosSub').textContent =
    `${tienda?.nombre || ''} · ${agencia?.nombre || 'Sin agencia'} · ${formatearFechaCorta(new Date(historialInformeActual.fecha + 'T00:00:00'))}. Se añadirá al Panel siniestros al terminar de editar; no se envía nada a la agencia.`;
  document.getElementById('historialFotosGrid').innerHTML = '';
  document.getElementById('historialFotosError').style.display = 'none';
  document.getElementById('historialFotosModalOverlay').classList.add('show');
}

function pintarFotosPendientesHistorial() {
  const grid = document.getElementById('historialFotosGrid');
  grid.innerHTML = (historialFotosPendiente?.fotos || []).map((url, idx) => `
    <div class="ps-foto-thumb">
      <img src="${url}" loading="lazy">
      <button type="button" class="ps-foto-quitar" data-idx="${idx}" title="Quitar">✕</button>
    </div>`).join('') || `<p class="ps-sin-archivos">Sin fotos todavía.</p>`;
  grid.querySelectorAll('.ps-foto-quitar').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const [path] = historialFotosPendiente.fotosPaths.splice(idx, 1);
      historialFotosPendiente.fotos.splice(idx, 1);
      if (path) borrarFotosStorage([path]);
      pintarFotosPendientesHistorial();
    });
  });
}

document.getElementById('historialFotosInput')?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length || !historialFotosPendiente) return;
  const errEl = document.getElementById('historialFotosError');
  errEl.style.display = 'none';
  try {
    for (const file of files) {
      const comprimido = await comprimirImagenParaSubida(file);
      const path = `panel/historial-borrador-${historialFotosPendiente.tiendaId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}/${comprimido.name}`;
      const { error: eUp } = await sb.storage.from('siniestros-fotos').upload(path, comprimido);
      if (eUp) throw eUp;
      const { data: pub } = sb.storage.from('siniestros-fotos').getPublicUrl(path);
      historialFotosPendiente.fotos.push(pub.publicUrl);
      historialFotosPendiente.fotosPaths.push(path);
    }
    pintarFotosPendientesHistorial();
  } catch (err) {
    console.error('Error subiendo fotos:', err);
    errEl.textContent = 'No se pudieron subir las fotos.';
    errEl.style.display = 'block';
  } finally {
    e.target.value = '';
  }
});

// Guarda el siniestro (con o sin fotos) en el borrador, no en la BD.
function guardarBorradorSiniestroDesdeModal() {
  const p = historialFotosPendiente;
  if (!p) return;
  historialSiniestrosDraft.set(p.tiendaId, {
    tipoSiniestro: p.tipoSiniestro,
    fotos: p.fotos,
    fotosPaths: p.fotosPaths,
    tienda: p.tienda,
    agencia: p.agencia
  });
  historialFotosPendiente = null;
  document.getElementById('historialFotosModalOverlay').classList.remove('show');
  renderAcordeonHistorialEditable();
}

document.getElementById('btnHistorialFotosListo')?.addEventListener('click', guardarBorradorSiniestroDesdeModal);
document.getElementById('btnHistorialFotosOmitir')?.addEventListener('click', guardarBorradorSiniestroDesdeModal);

// ---------------- Enganche del botón "Editar informe" ----------------

document.getElementById('btnEditarHistorial')?.addEventListener('click', () => {
  if (historialEditando) cancelarEdicionHistorial();
  else activarEdicionHistorial();
});
