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
let panelFiltros = { texto: '', agenciaId: '', estado: '', anio: '' };
let panelActivoId = null;

const PS_ORIGENES = ['', 'ALMACEN', 'WEB', 'RETIRADAS', 'OTRO'];
const PS_TIPO_DESDE_SINIESTRO = { ROTURA: 'ROTURA', FALTA: 'FALTAS', MIXTO: 'FALTAS Y ROTURAS' };

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
        .update({ correo_enviado: true, fotos: s.fotos || [] })
        .eq('id', existente.id);
      if (eUpd) throw eUpd;
    } else {
      const { error: eIns } = await sb.from('panel_siniestros').insert({
        siniestro_id: s.id,
        fecha: fechaInformeISO,
        correo_enviado: true,
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
    rellenarFiltroAniosPanel();
    rellenarFiltroAgenciasPanel();
    renderPanelSiniestros();
    renderPanelKpis();
  } catch (err) {
    console.error('Error cargando panel de siniestros:', err);
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--grave);">Error al cargar los siniestros.</td></tr>`;
  }
}

function rellenarFiltroAniosPanel() {
  const sel = document.getElementById('psFiltroAnio');
  if (!sel) return;
  const anios = Array.from(new Set(panelCache.map(s => (s.fecha || '').slice(0, 4)).filter(Boolean))).sort().reverse();
  const actual = sel.value;
  sel.innerHTML = `<option value="">Todos los años</option>` + anios.map(a => `<option value="${a}">${a}</option>`).join('');
  if (anios.includes(actual)) sel.value = actual;
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
  return panelCache.filter(s => {
    if (f.anio && !(s.fecha || '').startsWith(f.anio)) return false;
    if (f.agenciaId && String(s.agencia_id) !== String(f.agenciaId)) return false;
    if (f.estado && s.estado !== f.estado) return false;
    if (texto) {
      const campo = [s.agencia_nombre, s.tienda_nombre, s.informacion, s.num_albaran, s.campo_i]
        .filter(Boolean).join(' ').toUpperCase();
      if (!campo.includes(texto)) return false;
    }
    return true;
  });
}

function psPillTipo(tipo) {
  const clase = tipo === 'ROTURA' ? 'grave' : tipo === 'FALTAS' ? 'moderado' : 'mixto';
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

function psFormatearValor(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function renderPanelSiniestros() {
  const tbody = document.getElementById('panelSiniestrosBody');
  if (!tbody) return;
  const filas = siniestrosPanelFiltrados();

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--ink-soft);">
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
    const vencido = limite && limite < hoy && s.estado !== 'COBRADO';
    return `
      <tr data-id="${s.id}" class="ps-fila">
        <td>${psFormatearFecha(s.fecha)}</td>
        <td><b>${escapeHtml(s.agencia_nombre || '—')}</b></td>
        <td>${escapeHtml(s.tienda_nombre || '—')}</td>
        <td>${psPillTipo(s.tipo)}</td>
        <td class="ps-col-info" title="${escapeHtml(s.informacion || '')}">${escapeHtml(s.informacion || '—')}</td>
        <td>${escapeHtml(s.num_albaran || '—')}${s.albaran_url ? ' 📄' : ''}</td>
        <td style="text-align:center;">${numFotos ? `📷 ${numFotos}` : '—'}</td>
        <td style="text-align:center;">${tieneFactura ? '📄' : '—'}</td>
        <td style="text-align:right;">${psFormatearValor(s.valor)}</td>
        <td>${psBadgeEstado(s.estado)}</td>
        <td class="${vencido ? 'ps-vencido' : ''}">${aplicaRecogida ? psFormatearFecha(s.recogida_limite) : '—'}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => abrirModalPanelSiniestro(Number(tr.dataset.id)));
  });
}

function renderPanelKpis() {
  const pend = panelCache.filter(s => s.estado === 'PDTE COBRO');
  const totalPend = pend.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
  const elCount = document.getElementById('psKpiPendientesCount');
  const elValor = document.getElementById('psKpiPendientesValor');
  if (elCount) elCount.textContent = pend.length;
  if (elValor) elValor.textContent = psFormatearValor(totalPend);
}

// ---------------- Filtros ----------------

document.getElementById('psFiltroTexto')?.addEventListener('input', (e) => {
  panelFiltros.texto = e.target.value;
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
document.getElementById('psFiltroAnio')?.addEventListener('change', (e) => {
  panelFiltros.anio = e.target.value;
  renderPanelSiniestros();
});

// ---------------- Modal: completar los datos de una fila ----------------
// (la fila ya existe siempre — este modal solo EDITA, nunca da de alta)

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

  document.getElementById('psAgenciaTienda').textContent = `${s.agencia_nombre || 'Sin agencia'} · ${s.tienda_nombre || '—'}`;
  document.getElementById('psFechaTexto').textContent = `Recepción: ${psFormatearFecha(s.fecha)}`;
  document.getElementById('psTipoPill').innerHTML = psPillTipo(s.tipo);

  rellenarSelectOrigen(s.origen);
  document.getElementById('psInformacion').value = s.informacion || '';
  aplicarEstadoCampoAlbaran(s);
  document.getElementById('psValor').value = s.valor ?? '';
  document.getElementById('psEstado').value = s.estado || 'PDTE COBRO';
  document.getElementById('psCampoI').value = s.campo_i || '';
  document.getElementById('psError').style.display = 'none';

  // Solo hay algo que "recoger" en tienda si es ROTURA o FALTAS Y ROTURAS.
  // Una FALTA pura no tiene mercancía física, así que no aplica.
  const aplicaRecogida = s.tipo !== 'FALTAS';
  document.getElementById('psRecogidaBloque').style.display = aplicaRecogida ? '' : 'none';
  document.getElementById('psRecogida').value = aplicaRecogida ? (s.recogida_limite || '') : '';

  pintarFotosModal(s);
  pintarFacturaModal(s);
  pintarAlbaranModal(s);

  document.getElementById('psModalOverlay').classList.add('show');
}

function cerrarModalPanelSiniestro() {
  document.getElementById('psModalOverlay').classList.remove('show');
  panelActivoId = null;
}

async function guardarPanelSiniestro() {
  if (!panelActivoId) return;
  const errEl = document.getElementById('psError');
  errEl.style.display = 'none';

  const s = psSiniestroPorId(panelActivoId);

  // Si hay un albarán adjunto que aún no se ha mandado a Facturación,
  // se pregunta aquí, como parte de guardar (no al subir el archivo).
  if (s && s.albaran_url && !s.enviado_facturacion) {
    await ofrecerEnvioFacturacion(s);
  }

  const valorTxt = document.getElementById('psValor').value;
  const datos = {
    origen: document.getElementById('psOrigen').value || null,
    informacion: document.getElementById('psInformacion').value.trim() || null,
    num_albaran: document.getElementById('psAlbaran').value.trim() || null,
    valor: valorTxt ? Number(valorTxt) : null,
    estado: document.getElementById('psEstado').value,
    recogida_limite: (psSiniestroPorId(panelActivoId)?.tipo !== 'FALTAS')
      ? (document.getElementById('psRecogida').value || null)
      : null,
    campo_i: document.getElementById('psCampoI').value.trim() || null
  };

  const btn = document.getElementById('btnGuardarPanelSiniestro');
  btn.disabled = true;
  try {
    const { error } = await sb.from('panel_siniestros').update(datos).eq('id', panelActivoId);
    if (error) throw error;
    await cargarPanelSiniestros();
    cerrarModalPanelSiniestro();
  } catch (err) {
    console.error('Error guardando siniestro:', err);
    errEl.textContent = 'No se pudo guardar el cambio.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

async function eliminarPanelSiniestro() {
  if (!panelActivoId) return;
  const ok = await modalConfirm('¿Eliminar esta fila del panel? El siniestro original de "Siniestros del día" no se verá afectado.', {
    titulo: 'Eliminar fila', danger: true, textoOk: 'Eliminar'
  });
  if (!ok) return;
  try {
    const { error } = await sb.from('panel_siniestros').delete().eq('id', panelActivoId);
    if (error) throw error;
    cerrarModalPanelSiniestro();
    await cargarPanelSiniestros();
  } catch (err) {
    console.error('Error eliminando fila del panel:', err);
    await modalAlert('No se pudo eliminar la fila.', { titulo: 'Error' });
  }
}

// ---------------- Fotos (carpeta) ----------------

function pintarFotosModal(s) {
  const grid = document.getElementById('psFotosGrid');
  const fotos = s.fotos || [];
  grid.innerHTML = fotos.map((url, idx) => `
    <div class="ps-foto-thumb">
      <a href="${url}" target="_blank" rel="noopener"><img src="${url}" loading="lazy"></a>
      <button type="button" class="ps-foto-quitar" data-idx="${idx}" title="Quitar foto">✕</button>
    </div>`).join('') || `<p class="ps-sin-archivos">Sin fotos todavía.</p>`;

  grid.querySelectorAll('.ps-foto-quitar').forEach(btn => {
    btn.addEventListener('click', () => quitarFotoPanel(Number(btn.dataset.idx)));
  });
}

document.getElementById('psFotosInput')?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length || !panelActivoId) return;
  const errEl = document.getElementById('psFotosError');
  errEl.style.display = 'none';
  try {
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
    const { error: eDb } = await sb.from('panel_siniestros').update({ fotos: fotosActualizadas }).eq('id', panelActivoId);
    if (eDb) throw eDb;
    s.fotos = fotosActualizadas;
    pintarFotosModal(s);
    renderPanelSiniestros();
  } catch (err) {
    console.error('Error subiendo fotos:', err);
    errEl.textContent = 'No se pudieron subir las fotos.';
    errEl.style.display = 'block';
  } finally {
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
  const urlAEliminar = (s.fotos || [])[idx];
  const fotosActualizadas = (s.fotos || []).filter((_, i) => i !== idx);
  try {
    const { error } = await sb.from('panel_siniestros').update({ fotos: fotosActualizadas }).eq('id', panelActivoId);
    if (error) throw error;
    s.fotos = fotosActualizadas;
    pintarFotosModal(s);
    renderPanelSiniestros();
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
    const { error: eDb } = await sb.from('panel_siniestros')
      .update({ factura_url: pub.publicUrl, factura_nombre: comprimido.name })
      .eq('id', panelActivoId);
    if (eDb) throw eDb;
    const s = psSiniestroPorId(panelActivoId);
    s.factura_url = pub.publicUrl;
    s.factura_nombre = comprimido.name;
    pintarFacturaModal(s);
    renderPanelSiniestros();
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
    const { error } = await sb.from('panel_siniestros').update({ factura_url: null, factura_nombre: null }).eq('id', panelActivoId);
    if (error) throw error;
    if (s) { s.factura_url = null; s.factura_nombre = null; }
    pintarFacturaModal(s);
    renderPanelSiniestros();
    await borrarDeStoragePorUrl(BUCKET_FACTURAS_PANEL, urlAEliminar);
  } catch (err) {
    console.error('Error quitando factura:', err);
  }
}

// ---------------- Albarán (PDF) ----------------

// Muestra el nº de albarán en el campo y lo bloquea cuando se ha detectado
// automáticamente del PDF (con un enlace pequeño para corregirlo a mano
// por si la lectura del PDF se equivocase alguna vez).
function aplicarEstadoCampoAlbaran(s) {
  const input = document.getElementById('psAlbaran');
  const hint = document.getElementById('psAlbaranNumHint');
  const bloqueado = !!(s.albaran_url && s.num_albaran);

  input.value = s.num_albaran || '';
  input.disabled = bloqueado;
  input.placeholder = bloqueado ? '' : 'Cuando se conozca…';

  if (bloqueado) {
    hint.innerHTML = `🔒 Detectado automáticamente del PDF · <button type="button" id="btnEditarNumAlbaran">editar manualmente</button>`;
    hint.style.display = 'block';
    document.getElementById('btnEditarNumAlbaran').addEventListener('click', () => {
      input.disabled = false;
      input.focus();
      hint.style.display = 'none';
    });
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

    const cambios = { albaran_url: pub.publicUrl, albaran_nombre: file.name };
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
    // Ya no preguntamos aquí: se pregunta al pulsar "Guardar" (ver guardarPanelSiniestro)
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
    const { error } = await sb.from('panel_siniestros').update({ albaran_url: null, albaran_nombre: null }).eq('id', panelActivoId);
    if (error) throw error;
    if (s) { s.albaran_url = null; s.albaran_nombre = null; }
    pintarAlbaranModal(s);
    aplicarEstadoCampoAlbaran(s); // libera el campo Nº Albarán para poder editarlo a mano
    await borrarDeStoragePorUrl(BUCKET_FACTURAS_PANEL, urlAEliminar);
  } catch (err) {
    console.error('Error quitando el albarán:', err);
  }
}

// ---------------- Envío del albarán a Facturación ----------------

const PS_TIPO_ASUNTO_FACTURACION = { ROTURA: 'ROTURAS', FALTAS: 'FALTAS', 'FALTAS Y ROTURAS': 'FALTAS Y ROTURAS' };
const PS_TIPO_CUERPO_FACTURACION = {
  ROTURA: (tienda) => `todas las fotos de la rotura en la tienda de ${tienda}`,
  FALTAS: (tienda) => `todas las fotos y productos que han faltado en la tienda de ${tienda}`,
  'FALTAS Y ROTURAS': (tienda) => `todas las fotos y productos afectados (roturas y faltas) en la tienda de ${tienda}`
};

// Construye el correo tal cual lo redactáis a mano hoy: asunto con el nombre
// comercial de la agencia, cuerpo sencillo en texto plano, fotos + PDF adjuntos.
function plantillaFacturacionAlbaran(s, nombreComercialAgencia) {
  const fecha = fechaEs(s.fecha);
  const tienda = s.tienda_nombre || '';
  const tipoAsunto = PS_TIPO_ASUNTO_FACTURACION[s.tipo] || s.tipo;
  const agenciaAsunto = nombreComercialAgencia || s.agencia_nombre || '';

  const subject = `${tipoAsunto} EN EL ENVIO DE ${tienda.toUpperCase()} - ${fecha} ${agenciaAsunto}`.trim();

  const linea = (PS_TIPO_CUERPO_FACTURACION[s.tipo] || ((t) => `toda la documentación de la incidencia en la tienda de ${t}`))(tienda);
  const infoHtml = s.informacion ? `<p style="margin:0 0 14px;">${escapeHtml(s.informacion)}</p>` : '';
  const infoTxt = s.informacion ? `\n${s.informacion}\n` : '';

  const html = `
    <div style="font-family:Arial, sans-serif; font-size:14px; color:#1e293b; line-height:1.5;">
      <p style="margin:0 0 14px;">Buenas, aquí adjuntamos ${linea}</p>
      ${infoHtml}
      <p style="margin:0 0 14px;">De la agencia ${escapeHtml(s.agencia_nombre || '')}, el día: ${fecha}</p>
      <p style="margin:0;">Gracias, un saludo.</p>
    </div>`;

  const text = `Buenas, aquí adjuntamos ${linea}\n${infoTxt}\nDe la agencia ${s.agencia_nombre || ''}, el día: ${fecha}\n\nGracias, un saludo.`;

  return { subject, html, text };
}

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
document.getElementById('psModalOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'psModalOverlay') cerrarModalPanelSiniestro();
});
document.getElementById('btnGuardarPanelSiniestro')?.addEventListener('click', guardarPanelSiniestro);
document.getElementById('btnBorrarPanelSiniestro')?.addEventListener('click', eliminarPanelSiniestro);

// Carga perezosa: solo la primera vez que se entra en la pestaña
document.querySelectorAll('[data-view="panel-siniestros"]').forEach(el => {
  el.addEventListener('click', () => {
    if (!agenciasCache.length) cargarAgenciasYTiendas();
    if (!panelCargado) cargarPanelSiniestros();
  });
});
