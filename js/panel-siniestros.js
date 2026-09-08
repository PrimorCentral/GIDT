// ---------------------------------------------------------------
// Panel de siniestros (registro automático — sustituye al Excel)
// ---------------------------------------------------------------
// Requiere que ya estén cargados (por orden de <script> en index.html):
//   sb, escapeHtml, modalAlert, modalConfirm,
//   formatearFechaCorta, fechaLocalISO           (navegacion.js)
//   agenciasCache, tiendasCache, cargarAgenciasYTiendas()   (tiendas.js)
//   sesionActual                                  (auth.js)
// Debe cargarse DESPUÉS de esos ficheros (y después de siniestros.js).
//
// CÓMO SE RELLENA:
// Cada vez que en "Siniestros del día" se pulsa "✉️ Marcar como
// enviado", además de marcar el siniestro como ENVIADO se llama a
// registrarSiniestroEnPanelAutomatico(s, informeHoyCache.fecha)
// (una única línea añadida en js/siniestros.js, ver instrucciones).
// Esa función crea la fila en panel_siniestros con lo que ya se sabe
// (fecha, agencia, tienda, tipo, observaciones, fotos, fecha límite).
// Lo que todavía no se sabe en ese momento (nº albarán, factura,
// valor, si está COBRADO...) se completa después abriendo la fila
// desde esta pantalla.
// ---------------------------------------------------------------

const BUCKET_FOTOS_PANEL = 'siniestros-fotos';
const BUCKET_FACTURAS_PANEL = 'siniestros-facturas';

let panelCache = [];
let panelCargado = false;
let panelFiltros = { texto: '', agenciaId: '', estado: '', tipo: '', origen: '', recogida: '', fechaDesde: '', fechaHasta: '', sinFactura: false, sinAlbaran: false, sinCorreo: false };
let panelActivoId = null;

const PS_ORIGENES = ['', 'ALMACEN', 'WEB', 'RETIRADAS', 'AGENCIA', 'OTRO'];
const PS_TIPO_DESDE_SINIESTRO = { ROTURA: 'ROTURA', FALTA: 'FALTAS', MIXTO: 'FALTAS Y ROTURAS' };
// Inversa de la anterior: del tipo tal cual se guarda en panel_siniestros
// (ROTURA / FALTAS / FALTAS Y ROTURAS) al que espera plantillaSiniestro()
// de email-plantillas.js (ROTURA / FALTA / MIXTO), para poder reutilizar
// esa misma plantilla al enviar el correo a la agencia desde aquí.
const PS_TIPO_A_PLANTILLA = { ROTURA: 'ROTURA', FALTAS: 'FALTA', 'FALTAS Y ROTURAS': 'MIXTO' };

// ---------------- Alta automática (llamada desde siniestros.js) ----------------

// s = fila de siniestrosHoyCache (id, tipo, fotos, fecha_limite, incidencia:{observaciones, tiendas:{...,agencias:{...}}})
// fechaInformeISO = informeHoyCache.fecha (fecha de recepción de la mercancía)
async function registrarSiniestroEnPanelAutomatico(s, fechaInformeISO) {
  try {
    const t = s.incidencia?.tiendas || {};
    const ag = t.agencias || {};

    // Si ya hay una fila del panel para este siniestro (p. ej. se reabrió y
    // se reenvió), no se duplica: solo se refresca que el correo se envió.
    const { data: existente, error: eSel } = await sb
      .from('panel_siniestros')
      .select('id')
      .eq('siniestro_id', s.id)
      .maybeSingle();
    if (eSel) throw eSel;

    if (existente) {
      const { error: eUpd } = await sb.from('panel_siniestros')
        .update({
          correo_enviado: true,
          correo_enviado_en: s.enviado_en || new Date().toISOString(),
          correo_enviado_por: sesionActual?.nombre || sesionActual?.usuario || null,
          fotos: s.fotos || []
        })
        .eq('id', existente.id);
      if (eUpd) throw eUpd;
    } else {
      const { error: eIns } = await sb.from('panel_siniestros').insert({
        siniestro_id: s.id,
        fecha: fechaInformeISO,
        correo_enviado: true,
        correo_enviado_en: s.enviado_en || new Date().toISOString(),
        correo_enviado_por: sesionActual?.nombre || sesionActual?.usuario || null,
        agencia_id: ag.id || null,
        agencia_nombre: ag.nombre || null,
        tienda_id: t.id || null,
        tienda_nombre: t.nombre || null,
        tipo: PS_TIPO_DESDE_SINIESTRO[s.tipo] || 'ROTURA',
        informacion: s.incidencia?.observaciones || null,
        fotos: s.fotos || [],
        estado: 'PDTE COBRO',
        // La recogida solo aplica si hay algo roto físicamente que recoger
        // en tienda (ROTURA o FALTAS Y ROTURAS). Una FALTA pura no tiene
        // mercancía que recoger, así que no se le pone fecha límite.
        recogida_limite: (PS_TIPO_DESDE_SINIESTRO[s.tipo] || 'ROTURA') !== 'FALTAS' ? (s.fecha_limite || null) : null,
        creado_por: sesionActual?.nombre || sesionActual?.usuario || null
      });
      if (eIns) throw eIns;
    }

    // Si el Panel siniestros ya está cargado en esta sesión, lo refrescamos
    if (panelCargado) cargarPanelSiniestros();
  } catch (err) {
    console.error('Error registrando el siniestro en el Panel siniestros:', err);
  }
}

// ---------------- Carga y render de la tabla ----------------

async function cargarPanelSiniestros() {
  const tbody = document.getElementById('panelSiniestrosBody');
  if (!tbody) return;
  try {
    const { data, error } = await sb
      .from('panel_siniestros')
      .select('*')
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    panelCache = data || [];
    panelCargado = true;
    rellenarFiltroAgenciasPanel();
    renderPanelSiniestros();
    renderPanelKpis();
  } catch (err) {
    console.error('Error cargando panel de siniestros:', err);
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:var(--grave);">Error al cargar los siniestros.</td></tr>`;
  }
}

function rellenarFiltroAgenciasPanel() {
  const sel = document.getElementById('psFiltroAgencia');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = `<option value="">Todas las agencias</option>` + agenciasCache.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
  if (actual) sel.value = actual;
}

function siniestrosPanelFiltrados() {
  const f = panelFiltros;
  const texto = f.texto.trim().toUpperCase();
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return panelCache.filter(s => {
    if (f.fechaDesde && (s.fecha || '') < f.fechaDesde) return false;
    if (f.fechaHasta && (s.fecha || '') > f.fechaHasta) return false;
    if (f.tipo && s.tipo !== f.tipo) return false;
    if (f.origen === 'SIN_ORIGEN' && s.origen) return false;
    if (f.origen && f.origen !== 'SIN_ORIGEN' && s.origen !== f.origen) return false;
    if (f.agenciaId && String(s.agencia_id) !== String(f.agenciaId)) return false;
    if (f.estado && s.estado !== f.estado) return false;
    if (f.recogida) {
      if (f.recogida === 'ENVIADO A CENTRAL' || f.recogida === 'RECOGIDO POR AGENCIA') {
        if (s.recogida_estado !== f.recogida) return false;
      } else {
        // PDTE_DENTRO / PDTE_FUERA: solo tiene sentido para lo que aún no
        // se ha gestionado y tiene fecha límite (las FALTAS no tienen).
        if (s.recogida_estado || !s.recogida_limite) return false;
        const limite = new Date(s.recogida_limite + 'T00:00:00');
        const fuera = limite < hoy;
        if (f.recogida === 'PDTE_DENTRO' && fuera) return false;
        if (f.recogida === 'PDTE_FUERA' && !fuera) return false;
      }
    }
    if (f.sinFactura && s.factura_url) return false;
    if (f.sinAlbaran && s.albaran_url) return false;
    if (f.sinCorreo && s.correo_enviado) return false;
    if (texto) {
      const campo = [s.agencia_nombre, s.tienda_nombre, s.informacion, s.num_albaran]
        .filter(Boolean).join(' ').toUpperCase();
      if (!campo.includes(texto)) return false;
    }
    return true;
  });
}

function psPillTipo(tipo) {
  const clase = tipo === 'ROTURA' ? 'moderado' : 'grave';
  return `<span class="pill ${clase}">${escapeHtml(tipo)}</span>`;
}

function psBadgeEstado(estado) {
  const clase = estado === 'COBRADO' ? 'cobrado' : 'pendiente';
  return `<span class="ps-badge-estado ${clase}"><i></i>${escapeHtml(estado)}</span>`;
}

function psFormatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  return formatearFechaCorta(new Date(fechaStr + 'T00:00:00'));
}

// Para timestamps completos (creado_en / actualizado_en), no solo fechas.
function psFormatearFechaHora(isoStr) {
  if (!isoStr) return '—';
  const f = new Date(isoStr);
  const fechaTxt = formatearFechaCorta(f);
  const horaTxt = f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${fechaTxt} a las ${horaTxt}h`;
}

function psFormatearValor(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function renderPanelSiniestros() {
  const tbody = document.getElementById('panelSiniestrosBody');
  if (!tbody) return;
  const filas = siniestrosPanelFiltrados();

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:var(--ink-soft);">
      ${panelCache.length
        ? 'Ningún siniestro coincide con los filtros.'
        : 'Aquí aparecerán solas las filas en cuanto marques un siniestro como "enviado" en Siniestros del día.'}
    </td></tr>`;
    return;
  }

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  tbody.innerHTML = filas.map(s => {
    const numFotos = (s.fotos || []).length;
    const tieneFactura = !!s.factura_url;
    const aplicaRecogida = s.tipo !== 'FALTAS';
    const limite = (aplicaRecogida && s.recogida_limite) ? new Date(s.recogida_limite + 'T00:00:00') : null;
    const vencido = limite && limite < hoy && s.estado !== 'COBRADO' && !s.recogida_estado;
    const recogidaTexto = aplicaRecogida
      ? `${psFormatearFecha(s.recogida_limite)}${s.recogida_estado ? `<br><span class="ps-recogida-mini">${s.recogida_estado === 'ENVIADO A CENTRAL' ? '🏢 A central' : '📦 Recogido'}</span>` : ''}`
      : '—';
    return `
      <tr data-id="${s.id}" class="ps-fila${s.correo_enviado ? '' : ' ps-correo-pendiente'}">
        <td>${psFormatearFecha(s.fecha)}</td>
        <td><b>${escapeHtml(s.agencia_nombre || '—')}</b></td>
        <td>${escapeHtml(s.tienda_nombre || '—')}</td>
        <td>${escapeHtml(s.origen || '—')}</td>
        <td>${psPillTipo(s.tipo)}${s.correo_enviado ? '' : ' <span class="ps-correo-pendiente-icono" title="Sin enviar a agencia">📧</span>'}</td>
        <td class="ps-col-info" title="${escapeHtml(s.informacion || '')}">${escapeHtml(s.informacion || '—')}</td>
        <td>${escapeHtml(s.num_albaran || '—')}${s.albaran_url ? ' 📄' : ''}</td>
        <td>${numFotos ? `📷 ${numFotos}` : '—'}</td>
        <td>${tieneFactura ? '📄' : '—'}</td>
        <td>${psFormatearValor(s.valor)}</td>
        <td>${psBadgeEstado(s.estado)}</td>
        <td class="${vencido ? 'ps-vencido' : ''}">${recogidaTexto}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => abrirModalPanelSiniestro(Number(tr.dataset.id)));
  });
}

// Devuelve true si el siniestro tiene una recogida pendiente de verdad
// (aplica ROTURA/FALTAS Y ROTURAS, tiene fecha límite, y todavía no se ha
// gestionado ni como "enviado a central" ni como "recogido por agencia").
function psRecogidaPendiente(s) {
  return s.tipo !== 'FALTAS' && !!s.recogida_limite && !s.recogida_estado;
}

function renderPanelKpis() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const pend = panelCache.filter(s => s.estado === 'PDTE COBRO');
  const totalPend = pend.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);

  const recogidaPendiente = panelCache.filter(psRecogidaPendiente);
  const recogidaDentro = recogidaPendiente.filter(s => new Date(s.recogida_limite + 'T00:00:00') >= hoy);
  const recogidaFuera = recogidaPendiente.filter(s => new Date(s.recogida_limite + 'T00:00:00') < hoy);

  const elCount = document.getElementById('psKpiPendientesCount');
  const elValor = document.getElementById('psKpiPendientesValor');
  const elRecDentro = document.getElementById('psKpiRecogidaDentro');
  const elRecFuera = document.getElementById('psKpiRecogidaFuera');
  if (elCount) elCount.textContent = pend.length;
  if (elValor) elValor.textContent = psFormatearValor(totalPend);
  if (elRecDentro) elRecDentro.textContent = recogidaDentro.length;
  if (elRecFuera) elRecFuera.textContent = recogidaFuera.length;
}

// Modal genérico de detalle por agencia. filtroFn decide qué filas entran;
// mostrarValor indica si se enseña el € (pendientes de cobro) o solo el
// recuento (recogidas).
function abrirModalDetalle(filtroFn, titulo, mostrarValor) {
  const filas = panelCache.filter(filtroFn);
  const tituloEl = document.querySelector('#psDetalleModalOverlay .modal-title');
  if (tituloEl) tituloEl.textContent = titulo;

  const cont = document.getElementById('psDetalleLista');

  if (!filas.length) {
    cont.innerHTML = `<p class="ps-sin-archivos">No hay ningún siniestro en este grupo.</p>`;
  } else {
    const porAgencia = {};
    filas.forEach(s => {
      const clave = s.agencia_nombre || 'Sin agencia';
      if (!porAgencia[clave]) porAgencia[clave] = { count: 0, valor: 0 };
      porAgencia[clave].count += 1;
      porAgencia[clave].valor += Number(s.valor) || 0;
    });

    const filasHtml = Object.entries(porAgencia)
      .sort((a, b) => mostrarValor ? b[1].valor - a[1].valor : b[1].count - a[1].count)
      .map(([nombre, d]) => `
        <div class="ps-detalle-fila">
          <div>
            <div class="agencia">${escapeHtml(nombre)}</div>
            <div class="count">${d.count} siniestro${d.count === 1 ? '' : 's'}</div>
          </div>
          ${mostrarValor ? `<div class="valor">${psFormatearValor(d.valor)}</div>` : ''}
        </div>`).join('');

    const totalCount = filas.length;
    const totalValor = filas.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);

    cont.innerHTML = filasHtml + `
      <div class="ps-detalle-fila" style="border-top:2px solid var(--border); margin-top:4px; padding-top:12px;">
        <div class="agencia">Total</div>
        <div class="valor">${mostrarValor ? totalCount + ' · ' + psFormatearValor(totalValor) : totalCount}</div>
      </div>`;
  }

  document.getElementById('psDetalleModalOverlay').classList.add('show');
}

document.getElementById('btnDetallePendientesCount')?.addEventListener('click', () => {
  abrirModalDetalle(s => s.estado === 'PDTE COBRO', '💰 Pendiente de cobro por agencia', true);
});
document.getElementById('btnDetallePendientesValor')?.addEventListener('click', () => {
  abrirModalDetalle(s => s.estado === 'PDTE COBRO', '💰 Pendiente de cobro por agencia', true);
});
document.getElementById('btnDetalleRecogidaDentro')?.addEventListener('click', () => {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  abrirModalDetalle(
    s => psRecogidaPendiente(s) && new Date(s.recogida_limite + 'T00:00:00') >= hoy,
    '📦 Recogidas pdte. en límite por agencia', false
  );
});
document.getElementById('btnDetalleRecogidaFuera')?.addEventListener('click', () => {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  abrirModalDetalle(
    s => psRecogidaPendiente(s) && new Date(s.recogida_limite + 'T00:00:00') < hoy,
    '📦 Recogidas pdte. cumplidas por agencia', false
  );
});
document.getElementById('btnCerrarPsDetalle')?.addEventListener('click', () => {
  document.getElementById('psDetalleModalOverlay').classList.remove('show');
});
document.getElementById('psDetalleModalOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'psDetalleModalOverlay') e.currentTarget.classList.remove('show');
});

// ---------------- Filtros ----------------

document.getElementById('psFiltroTexto')?.addEventListener('input', (e) => {
  panelFiltros.texto = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroFechaDesde')?.addEventListener('change', (e) => {
  panelFiltros.fechaDesde = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroFechaHasta')?.addEventListener('change', (e) => {
  panelFiltros.fechaHasta = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroAgencia')?.addEventListener('change', (e) => {
  panelFiltros.agenciaId = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroEstado')?.addEventListener('change', (e) => {
  panelFiltros.estado = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroTipo')?.addEventListener('change', (e) => {
  panelFiltros.tipo = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroOrigen')?.addEventListener('change', (e) => {
  panelFiltros.origen = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroRecogida')?.addEventListener('change', (e) => {
  panelFiltros.recogida = e.target.value;
  renderPanelSiniestros();
});
document.getElementById('psFiltroSinFactura')?.addEventListener('change', (e) => {
  panelFiltros.sinFactura = e.target.checked;
  renderPanelSiniestros();
});
document.getElementById('psFiltroSinAlbaran')?.addEventListener('change', (e) => {
  panelFiltros.sinAlbaran = e.target.checked;
  renderPanelSiniestros();
});
document.getElementById('psFiltroSinCorreo')?.addEventListener('change', (e) => {
  panelFiltros.sinCorreo = e.target.checked;
  renderPanelSiniestros();
});

// ---------------- Alta manual (para lo que no viene del envío automático) ----------------

function rellenarSelectTiendasPsn(agenciaId) {
  const sel = document.getElementById('psnTienda');
  const tds = tiendasCache.filter(t => !agenciaId || String(t.agencia_id) === String(agenciaId));
  sel.innerHTML = `<option value="">— Selecciona tienda —</option>` +
    tds.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
}

async function abrirModalNuevoPanelSiniestro() {
  if (!agenciasCache.length) await cargarAgenciasYTiendas();

  document.getElementById('psnFecha').value = fechaLocalISO(new Date());
  document.getElementById('psnTipo').value = 'ROTURA';
  document.getElementById('psnAgencia').innerHTML = `<option value="">— Selecciona agencia —</option>` +
    agenciasCache.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
  rellenarSelectTiendasPsn(null);
  document.getElementById('psnInformacion').value = '';
  document.getElementById('psnError').style.display = 'none';
  document.getElementById('psnOrigenAgencia').value = 'no';
  document.querySelectorAll('#psnOrigenAgenciaToggle .toggle-seg-btn').forEach(b => b.classList.toggle('activo', b.dataset.valor === 'no'));

  document.getElementById('psNuevoModalOverlay').classList.add('show');
}

document.querySelectorAll('#psnOrigenAgenciaToggle .toggle-seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('psnOrigenAgencia').value = btn.dataset.valor;
    document.querySelectorAll('#psnOrigenAgenciaToggle .toggle-seg-btn').forEach(b => b.classList.toggle('activo', b === btn));
  });
});

function cerrarModalNuevoPanelSiniestro() {
  document.getElementById('psNuevoModalOverlay').classList.remove('show');
}

async function guardarNuevoPanelSiniestro() {
  const errEl = document.getElementById('psnError');
  errEl.style.display = 'none';

  const fecha = document.getElementById('psnFecha').value;
  const tipo = document.getElementById('psnTipo').value;
  const agenciaId = document.getElementById('psnAgencia').value;
  const tiendaId = document.getElementById('psnTienda').value;
  const informacion = document.getElementById('psnInformacion').value.trim();

  if (!fecha || !agenciaId || !tiendaId) {
    errEl.textContent = 'Rellena al menos la fecha, la agencia y la tienda.';
    errEl.style.display = 'block';
    return;
  }

  const agencia = agenciasCache.find(a => String(a.id) === String(agenciaId));
  const tienda = tiendasCache.find(t => String(t.id) === String(tiendaId));

  // Misma regla que el flujo automático: fecha de recepción + 15 días.
  // Una FALTA pura no tiene nada físico que recoger, así que no aplica.
  let recogidaLimite = null;
  if (tipo !== 'FALTAS') {
    const limite = new Date(fecha + 'T00:00:00');
    limite.setDate(limite.getDate() + 15);
    recogidaLimite = fechaLocalISO(limite);
  }

  const btn = document.getElementById('btnGuardarPsNuevo');
  btn.disabled = true;
  try {
    const { data, error } = await sb.from('panel_siniestros').insert({
      fecha,
      tipo,
      agencia_id: Number(agenciaId),
      agencia_nombre: agencia?.nombre || null,
      tienda_id: Number(tiendaId),
      tienda_nombre: tienda?.nombre || null,
      informacion: informacion || null,
      estado: 'PDTE COBRO',
      recogida_limite: recogidaLimite,
      correo_enviado: false,
      origen: document.getElementById('psnOrigenAgencia').value === 'si' ? 'AGENCIA' : null,
      creado_por: sesionActual?.nombre || sesionActual?.usuario || null
    }).select().single();
    if (error) throw error;

    cerrarModalNuevoPanelSiniestro();
    await cargarPanelSiniestros();
    abrirModalPanelSiniestro(data.id); // seguimos rellenando el resto de datos aquí
  } catch (err) {
    console.error('Error creando el siniestro manual:', err);
    errEl.textContent = 'No se pudo crear el siniestro.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btnNuevoPanelSiniestroManual')?.addEventListener('click', abrirModalNuevoPanelSiniestro);
document.getElementById('btnRefrescarPanelSiniestros')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const icono = btn.querySelector('.ps-refresh-icon');
  const inicio = Date.now();
  btn.disabled = true;
  icono?.classList.add('ps-girando');
  try {
    await cargarPanelSiniestros();
  } finally {
    // Al menos una vuelta completa visible, aunque la carga sea instantánea
    const restante = 800 - (Date.now() - inicio);
    if (restante > 0) await new Promise(r => setTimeout(r, restante));
    btn.disabled = false;
    icono?.classList.remove('ps-girando');
  }
});
document.getElementById('btnCerrarPsNuevo')?.addEventListener('click', cerrarModalNuevoPanelSiniestro);
document.getElementById('btnCancelarPsNuevo')?.addEventListener('click', cerrarModalNuevoPanelSiniestro);
document.getElementById('btnGuardarPsNuevo')?.addEventListener('click', guardarNuevoPanelSiniestro);
// Nota: a propósito NO se cierra al pinchar fuera (fuera del overlay), para
// no perder por error los datos del formulario ya rellenados — igual que
// los modales de "Nuevo usuario" / "Editar usuario" (js/usuarios.js), que
// tampoco se cierran así. Solo cierran los botones ✕, Cancelar y Guardar.
document.getElementById('psnAgencia')?.addEventListener('change', (e) => rellenarSelectTiendasPsn(e.target.value));

// ---------------- Modal: completar los datos de una fila ----------------
// (además de crearse solas al enviar un siniestro, o darlas de alta a mano
// con el botón "Añadir siniestro", este modal es donde se completa todo)

function psSiniestroPorId(id) {
  return panelCache.find(s => s.id === id);
}

function rellenarSelectOrigen(valorActual) {
  const sel = document.getElementById('psOrigen');
  sel.innerHTML = PS_ORIGENES.map(o =>
    `<option value="${o}" ${o === (valorActual || '') ? 'selected' : ''}>${o || '— Sin especificar —'}</option>`
  ).join('');
}

async function abrirModalPanelSiniestro(id) {
  const s = psSiniestroPorId(id);
  if (!s) return;
  panelActivoId = id;
  ultimoGuardadoConError = false;
  clearTimeout(guardadoPanelTimer);
  guardadoPanelTimer = null;
  const estadoEl = document.getElementById('psGuardadoEstado');
  if (estadoEl) { estadoEl.textContent = ''; estadoEl.classList.remove('ok', 'error', 'guardando', 'visible'); }

  document.getElementById('psAgenciaTienda').textContent = `${s.agencia_nombre || 'Sin agencia'} · ${s.tienda_nombre || '—'}`;
  document.getElementById('psFechaTexto').textContent = `Fecha de siniestro: ${psFormatearFecha(s.fecha)}`;
  document.getElementById('psTipoPill').innerHTML = psPillTipo(s.tipo);

  document.getElementById('psCreadoTexto').textContent = s.creado_en
    ? `Creado por: ${s.creado_por || '—'} · ${psFormatearFechaHora(s.creado_en)}`
    : '';
  document.getElementById('psActualizadoTexto').textContent = s.actualizado_por
    ? `Actualizado por: ${s.actualizado_por} · ${psFormatearFechaHora(s.actualizado_en)}`
    : 'Actualizado por: —';

  rellenarSelectOrigen(s.origen);
  document.getElementById('psInformacion').value = s.informacion || '';
  aplicarEstadoCampoAlbaran(s);
  aplicarEstadoCampoValor(s);
  document.getElementById('psEstado').value = s.estado || 'PDTE COBRO';
  document.getElementById('psError').style.display = 'none';

  // Solo hay algo que "recoger" en tienda si es ROTURA o FALTAS Y ROTURAS.
  // Una FALTA pura no tiene mercancía física, así que no aplica.
  const aplicaRecogida = s.tipo !== 'FALTAS';
  document.getElementById('psRecogidaBloque').style.display = aplicaRecogida ? '' : 'none';
  document.getElementById('psRecogida').value = aplicaRecogida ? (s.recogida_limite || '') : '';
  document.getElementById('psRecogidaEstado').value = s.recogida_estado || '';
  document.getElementById('psJustificanteBloque').style.display =
    (aplicaRecogida && s.recogida_estado === 'RECOGIDO POR AGENCIA') ? '' : 'none';

  pintarFotosModal(s);
  pintarFacturaModal(s);
  pintarAlbaranModal(s);
  pintarJustificanteModal(s);
  pintarBloqueEnvioAgencia(s);

  document.getElementById('psModalOverlay').classList.add('show');
}

// Botón "Enviar a agencia" (si aún no se ha enviado el correo de
// reclamación a la agencia) o el estado "CORREO ENVIADO" con fecha/hora
// (si ya se envió), en la cabecera del detalle del siniestro.
function pintarBloqueEnvioAgencia(s) {
  const btn = document.getElementById('btnPsEnviarAgencia');
  const estado = document.getElementById('psEnvioAgenciaEstado');
  if (s.correo_enviado) {
    btn.style.display = 'none';
    estado.style.display = '';
    estado.innerHTML = `
      <div class="ps-correo-enviado-card">
        <span class="ps-correo-enviado-titulo">✅ Correo enviado</span>
        ${s.correo_enviado_por ? `<span class="ps-correo-fecha">Usuario envío: ${escapeHtml(s.correo_enviado_por)}</span>` : ''}
        ${s.correo_enviado_en ? `<span class="ps-correo-fecha">Fecha y hora envío: ${psFormatearFechaHora(s.correo_enviado_en)}</span>` : ''}
      </div>`;
  } else {
    btn.style.display = '';
    const sinFotos = !(s.fotos || []).length;
    btn.disabled = sinFotos;
    btn.title = sinFotos ? 'Añade al menos 1 foto para poder enviar' : '';
    btn.textContent = '✉️ Enviar a agencia';
    estado.style.display = 'none';
    estado.innerHTML = '';
  }
}

// Envía el correo de reclamación a la agencia (misma plantilla que usa
// "Siniestros del día") para un siniestro del Panel siniestros, sea cual
// sea el día al que corresponda — a diferencia de "Siniestros del día",
// que solo ve las incidencias de hoy. Marca correo_enviado + fecha/hora +
// usuario en panel_siniestros al terminar.
async function enviarCorreoAgenciaDesdePanel() {
  if (!panelActivoId) return;
  const s = psSiniestroPorId(panelActivoId);
  if (!s) return;

  if (!s.agencia_id) {
    await modalAlert('Este siniestro no tiene agencia asignada.', { titulo: 'Sin agencia' });
    return;
  }
  if (!(s.fotos || []).length) {
    await modalAlert('Añade al menos 1 foto antes de enviar el correo a la agencia.', { titulo: 'Faltan fotos' });
    return;
  }

  const btn = document.getElementById('btnPsEnviarAgencia');
  const textoOriginal = btn.textContent;

  try {
    const { data: ag, error: eAg } = await sb.from('agencias').select('emails').eq('id', s.agencia_id).maybeSingle();
    if (eAg) throw eAg;
    const emails = ag?.emails || [];
    if (!emails.length) {
      await modalAlert('Esta agencia no tiene emails configurados. Añádelos en Configuración → Emails por agencia.', { titulo: 'Sin destinatarios' });
      return;
    }

    const ok = await modalConfirm('¿Enviar el correo de reclamación a la agencia ahora?', { titulo: 'Enviar reclamación' });
    if (!ok) return;

    btn.disabled = true;
    document.getElementById('cargandoEnvioTexto').textContent = 'ENVIANDO CORREO A AGENCIA';
    document.getElementById('cargandoEnvioOverlay').classList.add('show');

    const sParaPlantilla = {
      tipo: PS_TIPO_A_PLANTILLA[s.tipo] || 'ROTURA',
      fecha_limite: s.recogida_limite,
      incidencia: { tiendas: { nombre: s.tienda_nombre } }
    };
    // Si el origen es "AGENCIA" (rotura/falta detectada al reparar un
    // palet en el propio almacén de la agencia, tras avisarnos ellos),
    // se usa la plantilla específica para ese caso, con otro asunto y
    // otro texto — no la de "entrega de mercancía en tienda".
    const { subject, html, text } = s.origen === 'AGENCIA'
      ? plantillaSiniestroAgencia({ ...sParaPlantilla, agenciaNombre: s.agencia_nombre }, s.fecha)
      : plantillaSiniestro(sParaPlantilla, s.fecha);

    await enviarEmail({ to: emails, subject, html, text, attachmentUrls: s.fotos || [] });

    const correoEnviadoEn = new Date().toISOString();
    const correoEnviadoPor = sesionActual?.nombre || sesionActual?.usuario || null;
    const { error } = await sb.from('panel_siniestros').update({
      correo_enviado: true,
      correo_enviado_en: correoEnviadoEn,
      correo_enviado_por: correoEnviadoPor
    }).eq('id', panelActivoId);
    if (error) throw error;

    s.correo_enviado = true;
    s.correo_enviado_en = correoEnviadoEn;
    s.correo_enviado_por = correoEnviadoPor;
    pintarBloqueEnvioAgencia(s);
    renderPanelSiniestros();
  } catch (err) {
    console.error('Error enviando el correo a la agencia desde el Panel siniestros:', err);
    await modalAlert(`No se pudo enviar el correo: ${err.message}`, { titulo: 'Error de envío' });
  } finally {
    document.getElementById('cargandoEnvioOverlay').classList.remove('show');
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}
document.getElementById('btnPsEnviarAgencia')?.addEventListener('click', enviarCorreoAgenciaDesdePanel);

async function cerrarModalPanelSiniestro() {
  if (guardadoPanelTimer) {
    flushAutoguardadoPanel(); // hay un cambio reciente sin lanzar: lo intentamos ya
  } else if (ultimoGuardadoConError) {
    const salir = await modalConfirm(
      'El último cambio no se pudo guardar. ¿Salir igualmente y perderlo?',
      { titulo: 'Cambios sin guardar', danger: true, textoOk: 'Salir sin guardar' }
    );
    if (!salir) return;
  }
  document.getElementById('psModalOverlay').classList.remove('show');
  panelActivoId = null;
  ultimoGuardadoConError = false;
}

// ---------------- Autoguardado de los campos del formulario ----------------
// Cada campo se guarda solo, sin botón: los de texto/número con un pequeño
// debounce (para no lanzar una petición por cada letra), los select/fecha
// al cambiar. El aviso "Guardando… / ✓ Guardado" es solo un indicador
// visual discreto.

let guardadoPanelTimer = null;
let ultimoGuardadoConError = false;

function marcarGuardandoPanel() {
  const el = document.getElementById('psGuardadoEstado');
  if (!el) return;
  clearTimeout(el._fadeTimer);
  el.classList.remove('ok', 'error');
  el.classList.add('guardando', 'visible');
  el.textContent = '💾';
  el.title = 'Guardando…';
}

function marcarGuardadoOkPanel() {
  ultimoGuardadoConError = false;
  const el = document.getElementById('psGuardadoEstado');
  if (!el) return;
  el.classList.remove('error', 'guardando');
  el.classList.add('ok', 'visible');
  el.textContent = '✅';
  el.title = 'Guardado';
  clearTimeout(el._fadeTimer);
  el._fadeTimer = setTimeout(() => { el.classList.remove('visible', 'ok'); }, 1600);
}

function marcarErrorGuardadoPanel() {
  ultimoGuardadoConError = true;
  const el = document.getElementById('psGuardadoEstado');
  if (!el) return;
  clearTimeout(el._fadeTimer);
  el.classList.remove('ok', 'guardando');
  el.classList.add('error', 'visible');
  el.textContent = '⚠️';
  el.title = 'No se pudo guardar · pulsa para reintentar';
}

document.getElementById('psGuardadoEstado')?.addEventListener('click', (e) => {
  if (e.currentTarget.classList.contains('error')) guardarCamposPanelAhora();
});

function programarAutoguardadoPanel() {
  if (!panelActivoId) return;
  marcarGuardandoPanel();
  clearTimeout(guardadoPanelTimer);
  guardadoPanelTimer = setTimeout(guardarCamposPanelAhora, 600);
}

async function guardarCamposPanelAhora() {
  if (!panelActivoId) return;
  guardadoPanelTimer = null;

  const valorTxt = document.getElementById('psValor').value;
  const ahora = new Date().toISOString();
  const usuarioActual = sesionActual?.nombre || sesionActual?.usuario || null;
  const datos = {
    origen: document.getElementById('psOrigen').value || null,
    informacion: document.getElementById('psInformacion').value.trim() || null,
    num_albaran: document.getElementById('psAlbaran').value.trim() || null,
    valor: valorTxt ? Number(valorTxt) : null,
    estado: document.getElementById('psEstado').value,
    recogida_limite: (psSiniestroPorId(panelActivoId)?.tipo !== 'FALTAS')
      ? (document.getElementById('psRecogida').value || null)
      : null,
    recogida_estado: document.getElementById('psRecogidaEstado').value || null,
    actualizado_por: usuarioActual
  };

  try {
    const { error } = await sb.from('panel_siniestros').update(datos).eq('id', panelActivoId);
    if (error) throw error;
    const s = psSiniestroPorId(panelActivoId);
    if (s) {
      Object.assign(s, datos);
      s.actualizado_en = ahora;
      document.getElementById('psActualizadoTexto').textContent = usuarioActual
        ? `Actualizado por: ${usuarioActual} · ${psFormatearFechaHora(ahora)}`
        : '';
    }
    renderPanelSiniestros();
    renderPanelKpis();
    marcarGuardadoOkPanel();
  } catch (err) {
    console.error('Error guardando cambios del panel:', err);
    marcarErrorGuardadoPanel();
  }
}

// Si se cierra el modal con un guardado pendiente (p.ej. recién escrito y
// cerrado enseguida), lo lanzamos ya mismo en vez de perder el cambio.
function flushAutoguardadoPanel() {
  if (guardadoPanelTimer) {
    clearTimeout(guardadoPanelTimer);
    guardarCamposPanelAhora();
  }
}

['psOrigen', 'psEstado', 'psRecogida'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', programarAutoguardadoPanel);
});
['psInformacion', 'psAlbaran', 'psValor'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', programarAutoguardadoPanel);
});

// El campo "Información" siempre se escribe en mayúsculas (igual que se ve
// en el resto de la app: motivos, tiendas, agencias…), tanto en el detalle
// del siniestro como en el alta manual.
['psInformacion', 'psnInformacion'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', (e) => {
    const cursor = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    e.target.setSelectionRange(cursor, cursor);
  });
});

document.getElementById('psRecogidaEstado')?.addEventListener('change', (e) => {
  const s = psSiniestroPorId(panelActivoId);
  const esRecogidoAgencia = e.target.value === 'RECOGIDO POR AGENCIA';
  document.getElementById('psJustificanteBloque').style.display = esRecogidoAgencia ? '' : 'none';
  programarAutoguardadoPanel();
  // Si se acaba de elegir "Recogido por agencia" y todavía no hay
  // justificante, abrimos directamente el selector de archivo.
  if (esRecogidoAgencia && s && !s.justificante_recogida_url) {
    document.getElementById('psJustificanteInput').click();
  }
});

// Borra un archivo del storage detectando el bucket a partir de su propia
// URL pública (…/object/public/{bucket}/{path}). Es un "best effort": si no
// se puede borrar no bloqueamos al usuario, solo queda en el log.
async function borrarDeStoragePorUrlGenerico(url) {
  if (!url) return;
  try {
    const marcador = '/object/public/';
    const idx = url.indexOf(marcador);
    if (idx === -1) return;
    const resto = url.slice(idx + marcador.length); // "{bucket}/{resto-del-path}"
    const barra = resto.indexOf('/');
    if (barra === -1) return;
    const bucket = decodeURIComponent(resto.slice(0, barra));
    const path = decodeURIComponent(resto.slice(barra + 1));
    const { error } = await sb.storage.from(bucket).remove([path]);
    if (error) console.error(`No se pudo borrar del storage (${bucket}/${path}):`, error);
  } catch (err) {
    console.error('Error borrando archivo del storage:', err);
  }
}

function cerrarModalPanelSiniestroForzado() {
  clearTimeout(guardadoPanelTimer);
  guardadoPanelTimer = null;
  ultimoGuardadoConError = false;
  document.getElementById('psModalOverlay').classList.remove('show');
  panelActivoId = null;
}

async function eliminarPanelSiniestro() {
  if (!panelActivoId) return;
  const s = psSiniestroPorId(panelActivoId);

  const ok = await modalConfirm(
    'Se borrará todo lo relacionado con este siniestro: fotos, factura, albarán, el registro original de "Siniestros del día" y la propia incidencia del informe del día en que se creó (aunque no sea hoy). Esta acción no se puede deshacer.',
    { titulo: 'CONFIRMAR BORRAR SINIESTRO', danger: true, textoOk: 'Sí, borrar definitivamente' }
  );
  if (!ok) return;

  try {
    // Reunimos todas las URLs de archivos a borrar del storage: las del
    // panel (fotos, factura, albarán) y, si hay un siniestro original
    // enlazado, también las suyas propias (por si se le añadieron fotos
    // después de haberse creado la fila del panel).
    const urls = [...(s?.fotos || [])];
    if (s?.factura_url) urls.push(s.factura_url);
    if (s?.albaran_url) urls.push(s.albaran_url);
    if (s?.justificante_recogida_url) urls.push(s.justificante_recogida_url);

    if (s?.siniestro_id) {
      const { data: sinOriginal } = await sb.from('siniestros').select('fotos, incidencia_id').eq('id', s.siniestro_id).maybeSingle();
      (sinOriginal?.fotos || []).forEach(u => { if (!urls.includes(u)) urls.push(u); });

      await Promise.all(urls.map(borrarDeStoragePorUrlGenerico));

      // Se borra el siniestro de verdad, y también la incidencia del informe
      // del día en que se creó (esté hoy o en cualquier otro día): borrar
      // desde aquí es la vía "oficial" para quitar un siniestro ya enviado,
      // así que se limpia todo el rastro de una vez.
      const { error: eSin } = await sb.from('siniestros').delete().eq('id', s.siniestro_id);
      if (eSin) console.error('No se pudo borrar el siniestro original:', eSin);

      if (sinOriginal?.incidencia_id) {
        const { error: eInc } = await sb.from('incidencias').delete().eq('id', sinOriginal.incidencia_id);
        if (eInc) console.error('No se pudo borrar la incidencia asociada:', eInc);
      }
    } else {
      await Promise.all(urls.map(borrarDeStoragePorUrlGenerico));
    }

    const { error } = await sb.from('panel_siniestros').delete().eq('id', panelActivoId);
    if (error) throw error;

    cerrarModalPanelSiniestroForzado();
    await cargarPanelSiniestros();
  } catch (err) {
    console.error('Error eliminando siniestro:', err);
    await modalAlert('No se pudo eliminar el siniestro.', { titulo: 'Error' });
  }
}

// ---------------- Fotos (carpeta) ----------------

function pintarFotosModal(s) {
  const grid = document.getElementById('psFotosGrid');
  const fotos = s.fotos || [];
  grid.innerHTML = fotos.map((url, idx) => `
    <div class="ps-foto-thumb">
      <img src="${url}" loading="lazy" data-abrir-foto="${url}" style="cursor:zoom-in;">
      <button type="button" class="ps-foto-quitar" data-idx="${idx}" title="Borrar foto">🗑️</button>
    </div>`).join('') || `<p class="ps-sin-archivos">Sin fotos todavía.</p>`;

  grid.querySelectorAll('[data-abrir-foto]').forEach(img => {
    img.addEventListener('click', () => abrirLightboxPanel(img.dataset.abrirFoto));
  });
  grid.querySelectorAll('.ps-foto-quitar').forEach(btn => {
    btn.addEventListener('click', () => quitarFotoPanel(Number(btn.dataset.idx)));
  });
}

function abrirLightboxPanel(url) {
  document.getElementById('psLightboxImg').src = url;
  document.getElementById('psLightboxOverlay').classList.add('show');
}
function cerrarLightboxPanel() {
  document.getElementById('psLightboxOverlay').classList.remove('show');
  document.getElementById('psLightboxImg').src = '';
}
document.getElementById('btnCerrarPsLightbox')?.addEventListener('click', cerrarLightboxPanel);
document.getElementById('psLightboxOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'psLightboxOverlay') cerrarLightboxPanel();
});

// Si el panel viene de un siniestro automático (tiene siniestro_id), las
// fotos que se añaden/quitan aquí se reflejan también en el siniestro
// original, para que "Siniestros del día" y el "Historial" se vean igual.
async function sincronizarFotosConSiniestroOriginal(s) {
  if (!s?.siniestro_id) return;
  try {
    const { error } = await sb.from('siniestros').update({ fotos: s.fotos || [] }).eq('id', s.siniestro_id);
    if (error) console.error('No se pudo sincronizar las fotos con el siniestro original:', error);
  } catch (err) {
    console.error('Error sincronizando fotos con el siniestro original:', err);
  }
}

document.getElementById('psFotosInput')?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length || !panelActivoId) return;
  const errEl = document.getElementById('psFotosError');
  errEl.style.display = 'none';
  try {
    document.getElementById('cargandoEnvioTexto').textContent = files.length > 1 ? 'Subiendo fotos…' : 'Subiendo foto…';
    document.getElementById('cargandoEnvioOverlay').classList.add('show');

    const s = psSiniestroPorId(panelActivoId);
    const urls = [];
    for (const file of files) {
      const comprimido = await comprimirImagenParaSubida(file);
      const path = `panel/${panelActivoId}/${Date.now()}-${comprimido.name}`;
      const { error: eUp } = await sb.storage.from(BUCKET_FOTOS_PANEL).upload(path, comprimido);
      if (eUp) throw eUp;
      const { data: pub } = sb.storage.from(BUCKET_FOTOS_PANEL).getPublicUrl(path);
      urls.push(pub.publicUrl);
    }
    const fotosActualizadas = [...(s.fotos || []), ...urls];
    const { error: eDb } = await sb.from('panel_siniestros').update({ fotos: fotosActualizadas, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null }).eq('id', panelActivoId);
    if (eDb) throw eDb;
    s.fotos = fotosActualizadas;
    pintarFotosModal(s);
    pintarBloqueEnvioAgencia(s);
    renderPanelSiniestros();
    await sincronizarFotosConSiniestroOriginal(s);
  } catch (err) {
    console.error('Error subiendo fotos:', err);
    errEl.textContent = 'No se pudieron subir las fotos.';
    errEl.style.display = 'block';
  } finally {
    document.getElementById('cargandoEnvioOverlay').classList.remove('show');
    e.target.value = '';
  }
});

// Borra un archivo del storage a partir de su URL pública (…/object/public/{bucket}/{path}).
// Es un "best effort": si no se puede borrar (o la URL no tiene ese formato)
// no bloqueamos al usuario, solo lo dejamos en el log.
async function borrarDeStoragePorUrl(bucket, url) {
  if (!url) return;
  try {
    const marcador = `/object/public/${bucket}/`;
    const idx = url.indexOf(marcador);
    if (idx === -1) return;
    const path = decodeURIComponent(url.slice(idx + marcador.length));
    const { error } = await sb.storage.from(bucket).remove([path]);
    if (error) console.error(`No se pudo borrar del storage (${bucket}/${path}):`, error);
  } catch (err) {
    console.error('Error borrando archivo del storage:', err);
  }
}

async function quitarFotoPanel(idx) {
  const s = psSiniestroPorId(panelActivoId);
  if (!s) return;

  const ok = await modalConfirm('¿Seguro que quieres borrar esta foto del siniestro?', { titulo: 'Borrar foto', danger: true, textoOk: 'Borrar' });
  if (!ok) return;

  const urlAEliminar = (s.fotos || [])[idx];
  const fotosActualizadas = (s.fotos || []).filter((_, i) => i !== idx);
  try {
    const { error } = await sb.from('panel_siniestros').update({ fotos: fotosActualizadas, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null }).eq('id', panelActivoId);
    if (error) throw error;
    s.fotos = fotosActualizadas;
    pintarFotosModal(s);
    pintarBloqueEnvioAgencia(s);
    renderPanelSiniestros();
    await sincronizarFotosConSiniestroOriginal(s);
    await borrarDeStoragePorUrl(BUCKET_FOTOS_PANEL, urlAEliminar);
  } catch (err) {
    console.error('Error quitando foto:', err);
  }
}

// ---------------- Factura ----------------

function pintarFacturaModal(s) {
  const cont = document.getElementById('psFacturaZona');
  if (s.factura_url) {
    cont.innerHTML = `
      <a class="ps-factura-chip" href="${s.factura_url}" target="_blank" rel="noopener">📄 ${escapeHtml(s.factura_nombre || 'Ver factura')}</a>
      <button type="button" class="mini-btn" id="btnQuitarFactura" title="Quitar factura">✕</button>`;
    document.getElementById('btnQuitarFactura').addEventListener('click', quitarFacturaPanel);
  } else {
    cont.innerHTML = `
      <p class="ps-sin-archivos">Todavía no se ha adjuntado la factura.</p>
      <button type="button" class="btn" id="btnAdjuntarFactura" style="cursor:pointer;">📎 Adjuntar factura</button>`;
    document.getElementById('btnAdjuntarFactura').addEventListener('click', () => document.getElementById('psFacturaInput').click());
  }
}

document.getElementById('psFacturaInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file || !panelActivoId) return;
  const errEl = document.getElementById('psFacturaError');
  errEl.style.display = 'none';
  try {
    const comprimido = await comprimirImagenParaSubida(file);
    const path = `panel/${panelActivoId}/${Date.now()}-${comprimido.name}`;
    const { error: eUp } = await sb.storage.from(BUCKET_FACTURAS_PANEL).upload(path, comprimido);
    if (eUp) throw eUp;
    const { data: pub } = sb.storage.from(BUCKET_FACTURAS_PANEL).getPublicUrl(path);

    // Intentamos leer el TOTAL IMPORTE del propio PDF (última página,
    // abajo del todo). Si el campo Valor ya tenía algo escrito a mano,
    // no lo pisamos.
    const campoValor = document.getElementById('psValor');
    let totalDetectado = null;
    if (!campoValor.value.trim()) {
      totalDetectado = await extraerTotalFacturaDePdf(file);
    }

    const cambios = { factura_url: pub.publicUrl, factura_nombre: comprimido.name, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null };
    if (totalDetectado !== null) cambios.valor = totalDetectado;

    const { error: eDb } = await sb.from('panel_siniestros').update(cambios).eq('id', panelActivoId);
    if (eDb) throw eDb;
    const s = psSiniestroPorId(panelActivoId);
    s.factura_url = pub.publicUrl;
    s.factura_nombre = comprimido.name;
    if (totalDetectado !== null) {
      s.valor = totalDetectado;
      campoValor.value = totalDetectado;
      aplicarEstadoCampoValor(s);
    }
    pintarFacturaModal(s);
    renderPanelSiniestros();
    if (totalDetectado !== null) renderPanelKpis();
  } catch (err) {
    console.error('Error subiendo factura:', err);
    errEl.textContent = 'No se pudo subir la factura.';
    errEl.style.display = 'block';
  } finally {
    e.target.value = '';
  }
});

async function quitarFacturaPanel() {
  const ok = await modalConfirm('¿Quitar la factura adjunta?', { titulo: 'Quitar factura', danger: true, textoOk: 'Quitar' });
  if (!ok) return;
  const s = psSiniestroPorId(panelActivoId);
  const urlAEliminar = s?.factura_url;
  try {
    const { error } = await sb.from('panel_siniestros').update({ factura_url: null, factura_nombre: null, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null }).eq('id', panelActivoId);
    if (error) throw error;
    if (s) { s.factura_url = null; s.factura_nombre = null; }
    pintarFacturaModal(s);
    if (s) aplicarEstadoCampoValor(s); // libera el campo Valor para poder editarlo a mano
    renderPanelSiniestros();
    await borrarDeStoragePorUrl(BUCKET_FACTURAS_PANEL, urlAEliminar);
  } catch (err) {
    console.error('Error quitando factura:', err);
  }
}

// ---------------- Albarán (PDF) ----------------

// El campo Nº Albarán empieza BLOQUEADO (no se escribe "a ojo"): solo se
// rellena cuando se detecta el número al subir el PDF del albarán. Solo
// entonces aparece "editar manualmente", por si la lectura automática
// fallase alguna vez — mientras no se haya subido nada, no hay nada que
// editar, así que no se ofrece esa opción.
function aplicarEstadoCampoAlbaran(s) {
  const input = document.getElementById('psAlbaran');
  const hint = document.getElementById('psAlbaranNumHint');
  input.value = s.num_albaran || '';
  input.placeholder = '';

  const detectado = !!(s.albaran_url && s.num_albaran);
  input.disabled = detectado || !s.albaran_url;

  if (detectado) {
    hint.innerHTML = `🔒 Detectado número albarán automáticamente · <button type="button" id="btnEditarNumAlbaran">editar manualmente</button>`;
    hint.style.display = 'block';
    document.getElementById('btnEditarNumAlbaran').addEventListener('click', () => {
      input.disabled = false;
      input.focus();
      hint.style.display = 'none';
    });
  } else if (!s.albaran_url) {
    hint.textContent = '🔒 Se rellena al subir el albarán';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

// Igual que con el Nº Albarán: el campo Valor empieza BLOQUEADO hasta que
// se sube la factura (y se detecta el importe); "editar manualmente" solo
// aparece una vez hay algo detectado que corregir.
function aplicarEstadoCampoValor(s) {
  const input = document.getElementById('psValor');
  const hint = document.getElementById('psValorNumHint');
  const tieneValor = s.valor !== null && s.valor !== undefined && s.valor !== '';
  input.value = tieneValor ? s.valor : '';

  const detectado = !!(s.factura_url && tieneValor);
  input.disabled = detectado || !s.factura_url;

  if (detectado) {
    hint.innerHTML = `🔒 Detectado importe de factura automáticamente · <button type="button" id="btnEditarValor">editar manualmente</button>`;
    hint.style.display = 'block';
    document.getElementById('btnEditarValor').addEventListener('click', () => {
      input.disabled = false;
      input.focus();
      hint.style.display = 'none';
    });
  } else if (!s.factura_url) {
    hint.textContent = '🔒 Se rellena al subir la factura';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

function pintarAlbaranModal(s) {
  const cont = document.getElementById('psAlbaranZona');
  if (!s.albaran_url) {
    cont.innerHTML = `
      <p class="ps-sin-archivos">Todavía no se ha adjuntado el albarán.</p>
      <button type="button" class="btn" id="btnAdjuntarAlbaran" style="cursor:pointer;">📎 Adjuntar albarán</button>`;
    document.getElementById('btnAdjuntarAlbaran').addEventListener('click', () => document.getElementById('psAlbaranInput').click());
    return;
  }
  const estado = s.enviado_facturacion
    ? `<span class="ps-fact-enviado">✅ Enviado a Facturación${s.facturacion_enviado_en ? ' · ' + psFormatearFecha(s.facturacion_enviado_en.slice(0, 10)) : ''}</span>`
    : '';
  const textoBoton = s.enviado_facturacion ? '↻ Reenviar a Facturación' : '✉️ Enviar a Facturación';
  cont.innerHTML = `
    <a class="ps-factura-chip" href="${s.albaran_url}" target="_blank" rel="noopener">📄 ${escapeHtml(s.albaran_nombre || 'Ver albarán')}</a>
    <button type="button" class="mini-btn" id="btnQuitarAlbaran" title="Quitar albarán">✕</button>
    <div style="margin-top:10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      ${estado}
      <button type="button" class="btn" id="btnEnviarFacturacion" style="padding:5px 12px; font-size:12.5px;">${textoBoton}</button>
    </div>`;
  document.getElementById('btnQuitarAlbaran').addEventListener('click', quitarAlbaranPanel);
  document.getElementById('btnEnviarFacturacion').addEventListener('click', () => ofrecerEnvioFacturacion(s));
}

document.getElementById('psAlbaranInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file || !panelActivoId) return;
  const errEl = document.getElementById('psAlbaranError');
  errEl.style.display = 'none';
  try {
    const path = `panel/${panelActivoId}/albaran-${Date.now()}-${file.name}`;
    const { error: eUp } = await sb.storage.from(BUCKET_FACTURAS_PANEL).upload(path, file);
    if (eUp) throw eUp;
    const { data: pub } = sb.storage.from(BUCKET_FACTURAS_PANEL).getPublicUrl(path);

    // Intentamos leer el nº de albarán del propio PDF ("Num.Entrada")
    const numeroDetectado = await extraerNumAlbaranDePdf(file);

    const cambios = { albaran_url: pub.publicUrl, albaran_nombre: file.name, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null };
    if (numeroDetectado) cambios.num_albaran = numeroDetectado;

    const { error: eDb } = await sb.from('panel_siniestros').update(cambios).eq('id', panelActivoId);
    if (eDb) throw eDb;

    const s = psSiniestroPorId(panelActivoId);
    s.albaran_url = pub.publicUrl;
    s.albaran_nombre = file.name;
    if (numeroDetectado) s.num_albaran = numeroDetectado;
    pintarAlbaranModal(s);
    aplicarEstadoCampoAlbaran(s);
    renderPanelSiniestros();
    // Recién adjuntado: preguntamos directamente si se envía a Facturación
    // (ya no hay botón "Guardar" que sirva de punto de corte para preguntar).
    await ofrecerEnvioFacturacion(s);
  } catch (err) {
    console.error('Error subiendo el albarán:', err);
    errEl.textContent = 'No se pudo subir el albarán.';
    errEl.style.display = 'block';
  } finally {
    e.target.value = '';
  }
});

async function quitarAlbaranPanel() {
  const ok = await modalConfirm('¿Quitar el albarán adjunto?', { titulo: 'Quitar albarán', danger: true, textoOk: 'Quitar' });
  if (!ok) return;
  const s = psSiniestroPorId(panelActivoId);
  const urlAEliminar = s?.albaran_url;
  try {
    const { error } = await sb.from('panel_siniestros').update({ albaran_url: null, albaran_nombre: null, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null }).eq('id', panelActivoId);
    if (error) throw error;
    if (s) { s.albaran_url = null; s.albaran_nombre = null; }
    pintarAlbaranModal(s);
    aplicarEstadoCampoAlbaran(s); // libera el campo Nº Albarán para poder editarlo a mano
    await borrarDeStoragePorUrl(BUCKET_FACTURAS_PANEL, urlAEliminar);
  } catch (err) {
    console.error('Error quitando el albarán:', err);
  }
}

// ---------------- Justificante de recogida ----------------
// Solo tiene sentido cuando "Estado de la recogida" = RECOGIDO POR AGENCIA
// (la propia agencia ha venido a recoger la mercancía rota, y traen o
// firman un justificante de la recogida).

function pintarJustificanteModal(s) {
  const cont = document.getElementById('psJustificanteZona');
  if (!cont) return;
  if (s.justificante_recogida_url) {
    cont.innerHTML = `
      <a class="ps-factura-chip" href="${s.justificante_recogida_url}" target="_blank" rel="noopener">📄 ${escapeHtml(s.justificante_recogida_nombre || 'Ver justificante')}</a>
      <button type="button" class="mini-btn" id="btnQuitarJustificante" title="Quitar justificante">✕</button>`;
    document.getElementById('btnQuitarJustificante').addEventListener('click', quitarJustificantePanel);
  } else {
    cont.innerHTML = `
      <p class="ps-sin-archivos">Todavía no se ha adjuntado el justificante.</p>
      <button type="button" class="btn" id="btnAdjuntarJustificante" style="cursor:pointer;">📎 Adjuntar justificante</button>`;
    document.getElementById('btnAdjuntarJustificante').addEventListener('click', () => document.getElementById('psJustificanteInput').click());
  }
}

document.getElementById('psJustificanteInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file || !panelActivoId) return;
  const errEl = document.getElementById('psJustificanteError');
  errEl.style.display = 'none';
  try {
    const comprimido = await comprimirImagenParaSubida(file);
    const path = `panel/${panelActivoId}/justificante-${Date.now()}-${comprimido.name}`;
    const { error: eUp } = await sb.storage.from(BUCKET_FACTURAS_PANEL).upload(path, comprimido);
    if (eUp) throw eUp;
    const { data: pub } = sb.storage.from(BUCKET_FACTURAS_PANEL).getPublicUrl(path);
    const { error: eDb } = await sb.from('panel_siniestros')
      .update({ justificante_recogida_url: pub.publicUrl, justificante_recogida_nombre: comprimido.name, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null })
      .eq('id', panelActivoId);
    if (eDb) throw eDb;
    const s = psSiniestroPorId(panelActivoId);
    s.justificante_recogida_url = pub.publicUrl;
    s.justificante_recogida_nombre = comprimido.name;
    pintarJustificanteModal(s);
  } catch (err) {
    console.error('Error subiendo el justificante:', err);
    errEl.textContent = 'No se pudo subir el justificante.';
    errEl.style.display = 'block';
  } finally {
    e.target.value = '';
  }
});

async function quitarJustificantePanel() {
  const ok = await modalConfirm('¿Quitar el justificante de recogida?', { titulo: 'Quitar justificante', danger: true, textoOk: 'Quitar' });
  if (!ok) return;
  const s = psSiniestroPorId(panelActivoId);
  const urlAEliminar = s?.justificante_recogida_url;
  try {
    const { error } = await sb.from('panel_siniestros').update({ justificante_recogida_url: null, justificante_recogida_nombre: null, actualizado_por: sesionActual?.nombre || sesionActual?.usuario || null }).eq('id', panelActivoId);
    if (error) throw error;
    if (s) { s.justificante_recogida_url = null; s.justificante_recogida_nombre = null; }
    pintarJustificanteModal(s);
    await borrarDeStoragePorUrl(BUCKET_FACTURAS_PANEL, urlAEliminar);
  } catch (err) {
    console.error('Error quitando el justificante:', err);
  }
}

// ---------------- Envío del albarán a Facturación ----------------
// La plantilla del correo (asunto + cuerpo) vive en email-plantillas.js:
// plantillaFacturacionAlbaran(s, nombreComercialAgencia).

async function ofrecerEnvioFacturacion(s) {
  const ok = await modalConfirm(
    s.enviado_facturacion
      ? '¿Reenviar este albarán a Facturación por correo?'
      : '¿Quieres enviar este albarán a Facturación por correo?',
    { titulo: 'Enviar a Facturación', textoOk: 'Enviar' }
  );
  if (!ok) return;

  try {
    const { data: dest, error: eDest } = await sb.from('facturacion_emails').select('email').eq('activo', true);
    if (eDest) throw eDest;
    const destinatarios = (dest || []).map(d => d.email);
    if (!destinatarios.length) {
      await modalAlert('No hay destinatarios de Facturación configurados. Añádelos en Configuración → Emails.', { titulo: 'Sin destinatarios' });
      return;
    }

    let nombreComercial = null;
    if (s.agencia_id) {
      const { data: ag } = await sb.from('agencias').select('nombre_comercial').eq('id', s.agencia_id).maybeSingle();
      nombreComercial = ag?.nombre_comercial || null;
    }

    const { subject, html, text } = plantillaFacturacionAlbaran(s, nombreComercial);
    const adjuntos = [...(s.fotos || []), s.albaran_url].filter(Boolean);

    await enviarEmail({ to: destinatarios, subject, html, text, attachmentUrls: adjuntos });

    const { error: eUpd } = await sb.from('panel_siniestros').update({
      enviado_facturacion: true,
      facturacion_enviado_en: new Date().toISOString(),
      facturacion_enviado_por: sesionActual?.nombre || sesionActual?.usuario || null
    }).eq('id', s.id);
    if (eUpd) throw eUpd;

    s.enviado_facturacion = true;
    s.facturacion_enviado_en = new Date().toISOString();
    pintarAlbaranModal(s);
  } catch (err) {
    console.error('Error enviando el albarán a Facturación:', err);
    await modalAlert(`No se pudo enviar el correo a Facturación: ${err.message}`, { titulo: 'Error de envío' });
  }
}

// ---------------- Enganche de eventos generales ----------------

document.getElementById('btnCerrarPsModal')?.addEventListener('click', cerrarModalPanelSiniestro);
// El modal ya no se cierra al hacer clic fuera (solo con la X o Eliminar),
// para evitar cerrarlo sin querer con cambios a medio escribir.
document.getElementById('btnBorrarPanelSiniestro')?.addEventListener('click', eliminarPanelSiniestro);

// Carga perezosa: solo la primera vez que se entra en la pestaña
document.querySelectorAll('[data-view="panel-siniestros"]').forEach(el => {
  el.addEventListener('click', async () => {
    if (!agenciasCache.length) await cargarAgenciasYTiendas();
    if (!panelCargado) {
      await cargarPanelSiniestros();
    } else {
      rellenarFiltroAgenciasPanel(); // por si el panel ya estaba cargado pero las agencias no
    }
  });
});
