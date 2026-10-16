// ---------------------------------------------------------------
// Registro de auditoría (Configuración → Registro de auditoría)
// ---------------------------------------------------------------
// Guarda y muestra un historial de "quién hizo qué y cuándo" dentro
// de la app, usando la tabla registro_acciones. Aviso importante:
// como el resto de permisos de la app, esto es una AYUDA DE INTERFAZ,
// no una capa de seguridad real (ver aviso en js/permisos.js).
//
// registrarAccion(categoria, accion, detalle) se llama desde los
// puntos de la app donde ocurre algo que merece quedar registrado
// (crear/editar/borrar tiendas y usuarios, envío de informes,
// borrados en siniestros...). Nunca debe romper la acción real del
// usuario si falla, así que solo deja constancia en consola.

const CATEGORIAS_AUDITORIA = {
  tiendas: 'Tiendas y agencias',
  usuarios: 'Usuarios',
  informes: 'Informes',
  reportes_mensuales: 'Reportes mensuales',
  siniestros: 'Siniestros',
  gravedad_motivos: 'Gravedad de motivos'
};

// cambios (opcional): lista [{ campo, antes, despues }] con lo que se
// modificó exactamente. Se muestra al pulsar la lupa en el registro.
// extra (opcional): { tiendaId } — id de la tienda afectada, para poder ver
// su historial completo aunque luego cambie de nombre (botón 🕓 de Editar tienda).
async function registrarAccion(categoria, accion, detalle, cambios, extra) {
  try {
    const usuario = (typeof sesionActual !== 'undefined' && sesionActual) ? (sesionActual.nombre || sesionActual.usuario) : null;
    const fila = {
      usuario: usuario || 'Sistema',
      categoria,
      accion,
      detalle: detalle || null,
      creado_en: new Date().toISOString()
    };
    if (Array.isArray(cambios) && cambios.length) fila.cambios = cambios;
    if (extra && extra.tiendaId != null) fila.tienda_id = extra.tiendaId;
    const { error } = await sb.from('registro_acciones').insert(fila);
    if (error) throw error;
  } catch (err) {
    console.error('Error registrando acción de auditoría:', err);
  }
}

// Compara dos objetos campo a campo y devuelve solo lo que ha cambiado,
// ya en texto legible. campos = [{ clave, etiqueta, formato? }]; formato
// convierte el valor crudo en texto (hora, nombre de agencia, Sí/No…).
function auditoriaCalcularCambios(campos, antes, despues) {
  const texto = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    return String(v);
  };
  const cambios = [];
  campos.forEach(({ clave, etiqueta, formato }) => {
    const fmt = formato || (v => v);
    const a = texto(fmt(antes ? antes[clave] : null));
    const d = texto(fmt(despues ? despues[clave] : null));
    if (a !== d) cambios.push({ campo: etiqueta, antes: a, despues: d });
  });
  return cambios;
}

let auditoriaCache = [];

function rellenarFiltroUsuariosAuditoria() {
  const sel = document.getElementById('audFiltroUsuario');
  if (!sel) return;
  const actual = sel.value;
  const origen = (typeof usuariosCache !== 'undefined' && usuariosCache.length)
    ? usuariosCache.map(u => u.nombre)
    : auditoriaCache.map(a => a.usuario);
  const nombres = Array.from(new Set(origen.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  sel.innerHTML = '<option value="">Todos</option>' + nombres.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (actual && nombres.includes(actual)) sel.value = actual;
}

// Se llama al entrar en la pestaña (SIN consultar registro_acciones):
// solo rellena el filtro de usuarios y, la primera vez, deja la tabla
// a la espera de que se pulse "Consultar". Si ya se había consultado
// antes en esta sesión, no toca la tabla (se dejan los resultados tal
// cual estaban).
let auditoriaAbiertaYa = false;

async function prepararVistaAuditoria() {
  if (typeof usuariosCache !== 'undefined' && !usuariosCache.length && typeof cargarUsuarios === 'function') {
    await cargarUsuarios().catch(() => {});
  }
  rellenarFiltroUsuariosAuditoria();

  if (!auditoriaAbiertaYa) {
    auditoriaAbiertaYa = true;
    const tbody = document.getElementById('tablaAuditoriaBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--ink-soft);">Elige los filtros que quieras (o ninguno) y pulsa "Consultar".</td></tr>';
    }
  }
}

async function cargarAuditoria() {
  const tbody = document.getElementById('tablaAuditoriaBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--ink-soft);">Cargando registro…</td></tr>';

  if (typeof usuariosCache !== 'undefined' && !usuariosCache.length && typeof cargarUsuarios === 'function') {
    await cargarUsuarios().catch(() => {});
  }

  const usuario = document.getElementById('audFiltroUsuario')?.value || '';
  const categoria = document.getElementById('audFiltroCategoria')?.value || '';
  const desde = document.getElementById('audDesde')?.value || '';
  const hasta = document.getElementById('audHasta')?.value || '';

  try {
    mostrarCargandoGlobal();
    let query = sb.from('registro_acciones')
      .select('id, usuario, categoria, accion, detalle, cambios, creado_en')
      .order('creado_en', { ascending: false })
      .limit(300);
    if (usuario) query = query.eq('usuario', usuario);
    if (categoria) query = query.eq('categoria', categoria);
    if (desde) query = query.gte('creado_en', `${desde}T00:00:00`);
    if (hasta) query = query.lte('creado_en', `${hasta}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;

    auditoriaCache = data || [];
    rellenarFiltroUsuariosAuditoria();

    if (!auditoriaCache.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--ink-soft);">No hay acciones registradas con estos filtros.</td></tr>';
      return;
    }

    tbody.innerHTML = auditoriaCache.map(a => `
      <tr>
        <td style="white-space:nowrap;">${formatearFechaHoraCorta(new Date(a.creado_en))}</td>
        <td><b>${escapeHtml(a.usuario || '—')}</b></td>
        <td>${escapeHtml(CATEGORIAS_AUDITORIA[a.categoria] || a.categoria || '—')}</td>
        <td>${escapeHtml(a.accion || '—')}</td>
        <td>${a.detalle ? escapeHtml(a.detalle) : '—'}</td>
        <td class="aud-col-lupa">${Array.isArray(a.cambios) && a.cambios.length
          ? `<button type="button" class="aud-btn-lupa" data-aud-id="${a.id}" title="Ver qué se modificó" aria-label="Ver qué se modificó">&#128269;</button>`
          : ''}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando el registro de auditoría:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--grave);">Error al cargar el registro.</td></tr>';
  } finally {
    ocultarCargandoGlobal();
  }
}

document.getElementById('btnAudConsultar')?.addEventListener('click', cargarAuditoria);
document.getElementById('btnAudLimpiar')?.addEventListener('click', () => {
  document.getElementById('audFiltroUsuario').value = '';
  document.getElementById('audFiltroCategoria').value = '';
  document.getElementById('audDesde').value = '';
  document.getElementById('audHasta').value = '';
  cargarAuditoria();
});

// ---------------------------------------------------------------
// Lupa: ventana con el detalle de lo modificado (Campo / Antes / Después)
// ---------------------------------------------------------------
function asegurarModalDetalleAuditoria() {
  let overlay = document.getElementById('audDetalleOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'audDetalleOverlay';
  overlay.innerHTML = `
    <div class="modal-box aud-detalle-box" role="dialog" aria-modal="true" aria-labelledby="audDetalleTitulo">
      <div class="aud-detalle-cab">
        <h3 class="modal-title" id="audDetalleTitulo"></h3>
        <button type="button" class="aud-detalle-cerrar" id="audDetalleCerrar" aria-label="Cerrar">&times;</button>
      </div>
      <p class="aud-detalle-sub" id="audDetalleSub"></p>
      <div class="aud-detalle-tabla-wrap">
        <table class="aud-detalle-tabla">
          <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
          <tbody id="audDetalleBody"></tbody>
        </table>
      </div>
      <div class="modal-footer"><button class="btn" id="audDetalleBtnCerrar">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const cerrar = () => overlay.classList.remove('show');
  overlay.querySelector('#audDetalleCerrar').addEventListener('click', cerrar);
  overlay.querySelector('#audDetalleBtnCerrar').addEventListener('click', cerrar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) cerrar();
  });
  return overlay;
}

function abrirDetalleAuditoria(id) {
  const a = auditoriaCache.find(x => String(x.id) === String(id));
  if (!a || !Array.isArray(a.cambios) || !a.cambios.length) return;
  const overlay = asegurarModalDetalleAuditoria();
  overlay.querySelector('#audDetalleTitulo').textContent =
    `${a.accion || 'Detalle'}${a.detalle ? ' · ' + a.detalle : ''}`;
  overlay.querySelector('#audDetalleSub').textContent =
    `${a.usuario || '—'} · ${formatearFechaHoraCorta(new Date(a.creado_en))}`;
  overlay.querySelector('#audDetalleBody').innerHTML = a.cambios.map(c => `
    <tr>
      <td>${escapeHtml(c.campo || '—')}</td>
      <td><span class="aud-valor-antes">${escapeHtml(c.antes ?? '—')}</span></td>
      <td><span class="aud-valor-despues">${escapeHtml(c.despues ?? '—')}</span></td>
    </tr>`).join('');
  overlay.classList.add('show');
}

document.getElementById('tablaAuditoriaBody')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.aud-btn-lupa');
  if (btn) abrirDetalleAuditoria(btn.dataset.audId);
});
