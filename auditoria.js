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
  siniestros: 'Siniestros'
};

async function registrarAccion(categoria, accion, detalle) {
  try {
    const usuario = (typeof sesionActual !== 'undefined' && sesionActual) ? (sesionActual.nombre || sesionActual.usuario) : null;
    const { error } = await sb.from('registro_acciones').insert({
      usuario: usuario || 'Sistema',
      categoria,
      accion,
      detalle: detalle || null,
      creado_en: new Date().toISOString()
    });
    if (error) throw error;
  } catch (err) {
    console.error('Error registrando acción de auditoría:', err);
  }
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

async function cargarAuditoria() {
  const tbody = document.getElementById('tablaAuditoriaBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--ink-soft);">Cargando registro…</td></tr>';

  if (typeof usuariosCache !== 'undefined' && !usuariosCache.length && typeof cargarUsuarios === 'function') {
    await cargarUsuarios().catch(() => {});
  }

  const usuario = document.getElementById('audFiltroUsuario')?.value || '';
  const categoria = document.getElementById('audFiltroCategoria')?.value || '';
  const desde = document.getElementById('audDesde')?.value || '';
  const hasta = document.getElementById('audHasta')?.value || '';

  try {
    let query = sb.from('registro_acciones')
      .select('id, usuario, categoria, accion, detalle, creado_en')
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
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--ink-soft);">No hay acciones registradas con estos filtros.</td></tr>';
      return;
    }

    tbody.innerHTML = auditoriaCache.map(a => `
      <tr>
        <td style="white-space:nowrap;">${formatearFechaHoraCorta(new Date(a.creado_en))}</td>
        <td><b>${escapeHtml(a.usuario || '—')}</b></td>
        <td>${escapeHtml(CATEGORIAS_AUDITORIA[a.categoria] || a.categoria || '—')}</td>
        <td>${escapeHtml(a.accion || '—')}</td>
        <td>${a.detalle ? escapeHtml(a.detalle) : '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando el registro de auditoría:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--grave);">Error al cargar el registro.</td></tr>';
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
