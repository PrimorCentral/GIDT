// ---------------------------------------------------------------
// Editar un informe de un día pasado (Historial de informes diarios)
// ---------------------------------------------------------------
// A diferencia del informe de HOY, esto nunca envía nada a las
// agencias — solo corrige/completa lo que se registró ese día. Si al
// editar aparece una incidencia de tipo ROTURA/FALTAS/MIXTO, se pide
// una foto y se da de alta directamente en el Panel siniestros (sin
// pasar por "Siniestros del día", que es solo para el día en curso).
//
// Requiere (ya cargados antes): sb, escapeHtml, modalAlert, modalConfirm,
// agenciasCache, tiendasCache, cargarAgenciasYTiendas, badgeMarcaHtml,
// motivosChecklistHtml, resumenMotivos, calcularTipo, tipoSiniestroDeMotivos,
// posicionarDropdownMotivo, comprimirImagenParaSubida, sesionActual,
// dias, formatearFechaCorta, fechaLocalISO.

const PS_TIPO_DESDE_SINIESTRO_HIST = { ROTURA: 'ROTURA', FALTA: 'FALTAS', MIXTO: 'FALTAS Y ROTURAS' };

let historialEditando = false;
let historialTodasIncidencias = []; // TODAS las incidencias de ese informe (marcadas o no)

function incidenciaDeTiendaHistorial(tiendaId) {
  return historialTodasIncidencias.find(i => i.tienda_id === tiendaId) || null;
}

async function activarEdicionHistorial() {
  if (!historialInformeActual) return;
  if (!agenciasCache.length) await cargarAgenciasYTiendas();

  const { data, error } = await sb.from('incidencias')
    .select('id, tienda_id, marcada, tipo, motivo, observaciones')
    .eq('informe_id', historialInformeActual.id);
  if (error) {
    console.error('Error cargando incidencias para editar:', error);
    await modalAlert('No se pudieron cargar las incidencias de ese día.', { titulo: 'Error' });
    return;
  }
  historialTodasIncidencias = data || [];
  historialEditando = true;
  renderAcordeonHistorialEditable();
}

function desactivarEdicionHistorial() {
  historialEditando = false;
  if (!historialInformeActual) return;
  // historialTodasIncidencias sí está al día con lo editado (cada línea se
  // guarda al momento); historialIncidenciasActual era la lista que se
  // cargó al pulsar "Consultar" y se había quedado desactualizada.
  historialIncidenciasActual = historialTodasIncidencias.filter(i => i.marcada);
  renderHistorialInforme(historialInformeActual, historialIncidenciasActual);
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

function renderAcordeonHistorialEditable() {
  const cont = document.getElementById('contenidoHistorial');
  const informe = historialInformeActual;
  const fechaInforme = new Date(informe.fecha + 'T00:00:00');
  const fechaTexto = `${dias[fechaInforme.getDay()]}, ${formatearFechaCorta(fechaInforme)}`;
  const estadoTexto = informe.informe_enviado ? 'ENVIADO' : informe.estado;

  const bloques = agenciasCache.map(ag => {
    const tds = tiendasCache.filter(t => t.agencia_id === ag.id && t.activo);
    if (!tds.length) return '';
    const numInc = tds.filter(t => incidenciaDeTiendaHistorial(t.id)?.marcada).length;

    const filas = tds.map(t => {
      const inc = incidenciaDeTiendaHistorial(t.id);
      const motivosActuales = inc?.motivo || [];
      const marcada = motivosActuales.length > 0;
      const tipoCalc = calcularTipo(motivosActuales);
      const esPendiente = marcada && !tipoCalc;
      const claseFila = marcada ? (tipoCalc ? tipoCalc.toLowerCase() : 'pendiente') : '';
      const badgeTipo = !marcada
        ? '<span style="color:var(--ink-soft); font-size:12px;">—</span>'
        : esPendiente
          ? '<span class="pill pendiente">Pendiente</span>'
          : `<span class="pill ${tipoCalc.toLowerCase()}">${tipoCalc.charAt(0)+tipoCalc.slice(1).toLowerCase()}</span>`;

      return `
        <tr data-tienda="${t.id}" class="${claseFila ? 'con-incidencia ' + claseFila : ''}">
          <td class="col-estado">${marcada ? '🔴' : '—'}</td>
          <td class="col-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}</td>
          <td class="col-tienda">${badgeMarcaHtml(t.marca)}${escapeHtml(t.nombre)}</td>
          <td class="col-tipo">${badgeTipo}</td>
          <td class="col-motivo">
            <div class="motivo-select">
              <button type="button" class="filtro-select-btn">
                <span class="motivo-select-valor">${escapeHtml(resumenMotivos(motivosActuales))}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button type="button" class="mini-btn btn-borrar-motivos-hist" title="Eliminar esta incidencia" style="${marcada ? '' : 'display:none;'}">
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
          <td class="col-obs"><input type="text" class="form-input i-obs" placeholder="Observaciones…" value="${escapeHtml(inc?.observaciones || '')}" ${marcada ? '' : 'disabled'}></td>
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

  cont.innerHTML = `
    <div class="card" style="margin-bottom:14px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <div>
        <b style="text-transform:capitalize;">${fechaTexto}</b>
        ${informe.total_palets ? ` · ${informe.total_palets} palets previstos` : ''} · Estado: ${estadoTexto}
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:12px; color:var(--ink-soft); font-weight:700;">✏️ Editando — no se envía nada a las agencias</span>
        <button class="btn" id="btnSalirEdicionHistorial">Salir</button>
        <button class="btn primary" id="btnTerminarEdicionHistorial">Terminar de editar</button>
      </div>
    </div>
    ${bloques}`;

  document.getElementById('btnTerminarEdicionHistorial').addEventListener('click', desactivarEdicionHistorial);
  document.getElementById('btnSalirEdicionHistorial').addEventListener('click', desactivarEdicionHistorial);

  cont.querySelectorAll('.agencia-head').forEach(head => {
    head.addEventListener('click', () => {
      head.classList.toggle('open');
      head.nextElementSibling.classList.toggle('open');
    });
  });

  cont.querySelectorAll('tr[data-tienda]').forEach(tr => {
    const tiendaId = Number(tr.dataset.tienda);
    const inputObs = tr.querySelector('.i-obs');
    const guardar = () => guardarIncidenciaHistorial(tiendaId, tr);
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
        const inc = incidenciaDeTiendaHistorial(tiendaId);
        if (!inc) return;

        // El siniestro puede estar en el Panel por dos vías: dado de alta
        // directamente desde este mismo histórico, o por el flujo normal
        // del día en que se creó. Hay que comprobar las dos.
        const panelId = await panelSiniestroDeIncidencia(inc.id);
        if (panelId) {
          await modalAlert('Este siniestro ya está en el Panel siniestros. Para eliminarlo, hazlo desde ahí.', { titulo: 'No se puede eliminar' });
          return;
        }

        const ok = await modalConfirm('¿Eliminar por completo esta incidencia?', { titulo: 'Eliminar incidencia', danger: true, textoOk: 'Eliminar' });
        if (!ok) return;

        try {
          const { error } = await sb.from('incidencias').delete().eq('id', inc.id);
          if (error) throw error;
          historialTodasIncidencias = historialTodasIncidencias.filter(i => i.id !== inc.id);
          renderAcordeonHistorialEditable();
        } catch (err) {
          console.error('Error eliminando la incidencia:', err);
          await modalAlert('No se pudo eliminar la incidencia.', { titulo: 'Error' });
        }
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

async function guardarIncidenciaHistorial(tiendaId, tr) {
  const motivos = Array.from(tr.querySelectorAll('.i-motivo-check:checked')).map(cb => cb.value);
  const observaciones = tr.querySelector('.i-obs').value.trim().toUpperCase();
  const marcada = motivos.length > 0;
  const tipo = calcularTipo(motivos);
  const informe = historialInformeActual;
  const tipoSiniestroNuevo = tipoSiniestroDeMotivos(motivos);
  const existente = incidenciaDeTiendaHistorial(tiendaId);

  // Si esta incidencia ya tiene un siniestro dado de alta en el Panel y el
  // cambio la dejaría sin motivo de siniestro (p. ej. desmarcar la casilla
  // de "Rotura confirmada" a mano, sin pasar por la papelera), no se
  // permite: hay que gestionarlo desde el Panel siniestros.
  if (existente && !tipoSiniestroNuevo) {
    const panelId = await panelSiniestroDeIncidencia(existente.id);
    if (panelId) {
      await modalAlert('Este siniestro ya está en el Panel siniestros. Para eliminarlo, hazlo desde ahí.', { titulo: 'No se puede modificar' });
      // Revertimos las casillas al estado guardado, para que la pantalla
      // no muestre algo que en realidad no se ha guardado.
      const motivosPrevios = existente.motivo || [];
      tr.querySelectorAll('.i-motivo-check').forEach(cb => { cb.checked = motivosPrevios.includes(cb.value); });
      const hayMotivo = motivosPrevios.length > 0;
      tr.querySelector('.i-obs').disabled = !hayMotivo;
      const btnBorrar = tr.querySelector('.btn-borrar-motivos-hist');
      if (btnBorrar) btnBorrar.style.display = hayMotivo ? '' : 'none';
      const valorEl = tr.querySelector('.motivo-select-valor');
      if (valorEl) valorEl.textContent = resumenMotivos(motivosPrevios);
      return;
    }
  }

  try {
    const tienda = tiendasCache.find(t => t.id === tiendaId);
    const agencia = tienda ? agenciasCache.find(a => a.id === tienda.agencia_id) : null;

    const { data: guardada, error } = await sb.from('incidencias').upsert({
      informe_id: informe.id,
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

    // Si el motivo indica ROTURA/FALTAS/MIXTO, se da de alta directamente en
    // el Panel siniestros (nunca por "Siniestros del día", que es solo para
    // el día en curso, ni se manda nada a la agencia). Antes comprobamos que
    // no exista ya por ninguna de las dos vías posibles.
    const tipoSiniestro = tipoSiniestroDeMotivos(motivos);
    if (tipoSiniestro) {
      const panelExistenteId = await panelSiniestroDeIncidencia(guardada.id);

      if (!panelExistenteId) {
        await procesarNuevoSiniestroHistorial(guardada, tienda, agencia, informe, tipoSiniestro);
      } else {
        // Ya existía: solo mantenemos su información al día (tipo/observaciones)
        await sb.from('panel_siniestros').update({
          tipo: PS_TIPO_DESDE_SINIESTRO_HIST[tipoSiniestro] || 'ROTURA',
          informacion: observaciones || null
        }).eq('id', panelExistenteId);
      }
    }
  } catch (err) {
    console.error('Error guardando incidencia del histórico:', err);
    await modalAlert('No se pudo guardar el cambio.', { titulo: 'Error' });
  }
}

// ---------------- Alta directa en el Panel siniestros (con fotos) ----------------

let historialFotosPendiente = null; // { incidencia, tienda, agencia, informe, tipoSiniestro, fotos: [] }

async function procesarNuevoSiniestroHistorial(incidencia, tienda, agencia, informe, tipoSiniestro) {
  historialFotosPendiente = { incidencia, tienda, agencia, informe, tipoSiniestro, fotos: [] };

  document.getElementById('historialFotosTitulo').textContent = '📷 Añadir fotos al siniestro';
  document.getElementById('historialFotosSub').textContent =
    `${tienda?.nombre || ''} · ${agencia?.nombre || 'Sin agencia'} · ${formatearFechaCorta(new Date(informe.fecha + 'T00:00:00'))}. Se añade al Panel siniestros; no se envía nada a la agencia.`;
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
      historialFotosPendiente.fotos.splice(Number(btn.dataset.idx), 1);
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
      const path = `panel/historial-${historialFotosPendiente.incidencia.id}/${Date.now()}-${comprimido.name}`;
      const { error: eUp } = await sb.storage.from('siniestros-fotos').upload(path, comprimido);
      if (eUp) throw eUp;
      const { data: pub } = sb.storage.from('siniestros-fotos').getPublicUrl(path);
      historialFotosPendiente.fotos.push(pub.publicUrl);
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

async function crearSiniestroPanelDesdeHistorial() {
  const p = historialFotosPendiente;
  if (!p) return;

  const recogidaLimite = (() => {
    if (p.tipoSiniestro === 'FALTA') return null;
    const limite = new Date(p.informe.fecha + 'T00:00:00');
    limite.setDate(limite.getDate() + 15);
    return fechaLocalISO(limite);
  })();

  try {
    const { error } = await sb.from('panel_siniestros').insert({
      fecha: p.informe.fecha,
      tipo: PS_TIPO_DESDE_SINIESTRO_HIST[p.tipoSiniestro] || 'ROTURA',
      agencia_id: p.agencia?.id || null,
      agencia_nombre: p.agencia?.nombre || null,
      tienda_id: p.tienda?.id || null,
      tienda_nombre: p.tienda?.nombre || null,
      informacion: p.incidencia.observaciones || null,
      fotos: p.fotos,
      estado: 'PDTE COBRO',
      recogida_limite: recogidaLimite,
      incidencia_id: p.incidencia.id,
      creado_por: sesionActual?.nombre || sesionActual?.usuario || null
    });
    if (error) throw error;
  } catch (err) {
    console.error('Error dando de alta el siniestro en el Panel:', err);
    await modalAlert('No se pudo añadir el siniestro al Panel siniestros.', { titulo: 'Error' });
  } finally {
    historialFotosPendiente = null;
    document.getElementById('historialFotosModalOverlay').classList.remove('show');
  }
}

document.getElementById('btnHistorialFotosListo')?.addEventListener('click', crearSiniestroPanelDesdeHistorial);
document.getElementById('btnHistorialFotosOmitir')?.addEventListener('click', crearSiniestroPanelDesdeHistorial);

// ---------------- Enganche del botón "Editar informe" ----------------

document.getElementById('btnEditarHistorial')?.addEventListener('click', () => {
  if (historialEditando) desactivarEdicionHistorial();
  else activarEdicionHistorial();
});
