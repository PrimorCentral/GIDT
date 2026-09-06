  // Gestión de usuarios
  // ---------------------------------------------------------------
  let usuariosCache = [];

  const CLAVES_PERMISOS = [
    'panel_siniestros', 'siniestros_dia', 'enviar_facturacion',
    'config_tiendas', 'config_emails', 'config_facturacion',
    'gestion_usuarios', 'borrar', 'ver_analisis'
  ];

  async function cargarUsuarios() {
    const tbody = document.getElementById('tablaUsuariosBody');
    try {
      const { data, error } = await sb
        .from('usuarios')
        .select('id, nombre, usuario, rol, activo, ultima_conexion, permisos')
        .order('nombre', { ascending: true });
      if (error) throw error;

      usuariosCache = data || [];

      if (!usuariosCache.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--ink-soft);">No hay usuarios todavía.</td></tr>';
        return;
      }

      tbody.innerHTML = usuariosCache.map(u => `
        <tr>
          <td><b>${escapeHtml(u.nombre)}</b></td>
          <td>${escapeHtml(u.usuario)}</td>
          <td><span class="badge-rol ${u.rol}">${u.rol}</span></td>
          <td>${u.ultima_conexion ? formatearFechaHoraCorta(new Date(u.ultima_conexion)) : '—'}</td>
          <td>
            <span class="badge-estado ${u.activo ? 'activo' : 'inactivo'}">
              <i></i>${u.activo ? 'Activo' : 'Desactivado'}
            </span>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="link-accion" data-editar="${u.id}">Editar</button>
            <button class="link-accion ${u.activo ? 'danger' : ''}" data-toggle="${u.id}" data-activo="${u.activo}">
              ${u.activo ? 'Desactivar' : 'Activar'}
            </button>
            <button class="link-accion danger" data-borrar="${u.id}">Borrar</button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-editar]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalEditarUsuario(btn.dataset.editar));
      });
      tbody.querySelectorAll('[data-borrar]').forEach(btn => {
        btn.addEventListener('click', () => borrarUsuario(btn.dataset.borrar));
      });
      tbody.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => toggleUsuario(btn.dataset.toggle, btn.dataset.activo === 'true'));
      });
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--grave);">Error al cargar usuarios.</td></tr>';
    }
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function toggleUsuario(id, activoActual) {
    const nuevoEstado = !activoActual;
    const ok = await modalConfirm(
      nuevoEstado ? '¿Activar este usuario?' : '¿Desactivar este usuario? No podrá iniciar sesión.',
      { titulo: nuevoEstado ? 'Activar usuario' : 'Desactivar usuario', danger: !nuevoEstado }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('usuarios').update({ activo: nuevoEstado }).eq('id', id);
      if (error) throw error;
      cargarUsuarios();
    } catch (err) {
      console.error('Error cambiando estado de usuario:', err);
      await modalAlert('No se pudo actualizar el usuario.', { titulo: 'Error' });
    }
  }

  // ---------------- Selector de rol (botones) + panel de permisos ----------------

  // prefijo: 'nu' (nuevo) o 'eu' (editar)
  function engancharSelectorRol(prefijo) {
    const toggle = document.getElementById(`${prefijo}RolToggle`);
    const hidden = document.getElementById(`${prefijo}Rol`);
    const panel = document.getElementById(`${prefijo}PermisosPanel`);
    if (!toggle) return;

    toggle.querySelectorAll('.toggle-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggle.querySelectorAll('.toggle-seg-btn').forEach(b => b.classList.remove('activo'));
        btn.classList.add('activo');
        hidden.value = btn.dataset.rol;
        panel.style.display = btn.dataset.rol === 'operador' ? '' : 'none';
      });
    });
  }
  engancharSelectorRol('nu');
  engancharSelectorRol('eu');

  function fijarRolEnFormulario(prefijo, rol) {
    const toggle = document.getElementById(`${prefijo}RolToggle`);
    const hidden = document.getElementById(`${prefijo}Rol`);
    const panel = document.getElementById(`${prefijo}PermisosPanel`);
    hidden.value = rol || 'operador';
    toggle.querySelectorAll('.toggle-seg-btn').forEach(b => b.classList.toggle('activo', b.dataset.rol === hidden.value));
    panel.style.display = hidden.value === 'operador' ? '' : 'none';
  }

  function leerPermisosDeFormulario(prefijo) {
    const permisos = {};
    CLAVES_PERMISOS.forEach(clave => {
      const el = document.getElementById(`${prefijo}Perm_${clave}`);
      if (el) permisos[clave] = el.checked;
    });
    return permisos;
  }

  function fijarPermisosEnFormulario(prefijo, permisos) {
    CLAVES_PERMISOS.forEach(clave => {
      const el = document.getElementById(`${prefijo}Perm_${clave}`);
      if (el) el.checked = !!(permisos && permisos[clave]);
    });
  }

  // ---------------- Nuevo usuario ----------------

  function abrirModalNuevoUsuario() {
    document.getElementById('nuNombre').value = '';
    document.getElementById('nuUsuario').value = '';
    document.getElementById('nuPin').value = '';
    fijarRolEnFormulario('nu', 'operador');
    fijarPermisosEnFormulario('nu', {});
    document.getElementById('nuError').style.display = 'none';
    document.getElementById('nuevoUsuarioModalOverlay').classList.add('show');
  }

  function cerrarModalNuevoUsuario() {
    document.getElementById('nuevoUsuarioModalOverlay').classList.remove('show');
  }

  document.getElementById('btnNuevoUsuario').addEventListener('click', abrirModalNuevoUsuario);
  document.getElementById('btnCerrarNuevoUsuario').addEventListener('click', cerrarModalNuevoUsuario);
  document.getElementById('btnCancelarUsuario').addEventListener('click', cerrarModalNuevoUsuario);

  document.getElementById('btnGuardarUsuario').addEventListener('click', async () => {
    const nombre = document.getElementById('nuNombre').value.trim();
    const usuario = document.getElementById('nuUsuario').value.trim();
    const pin = document.getElementById('nuPin').value.trim();
    const rol = document.getElementById('nuRol').value;
    const errEl = document.getElementById('nuError');
    const btn = document.getElementById('btnGuardarUsuario');
    errEl.style.display = 'none';

    if (!nombre || !usuario || !pin) {
      errEl.textContent = 'Rellena nombre, usuario y PIN.';
      errEl.style.display = 'block';
      return;
    }
    if (pin.length < 4) {
      errEl.textContent = 'El PIN debe tener al menos 4 dígitos.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const pinHash = await sha256(pin);
      const permisos = rol === 'operador' ? leerPermisosDeFormulario('nu') : {};
      const { error } = await sb.from('usuarios').insert({
        nombre, usuario, pin_hash: pinHash, rol, permisos
      });
      if (error) {
        if (error.code === '23505') throw new Error('Ese nombre de usuario ya existe.');
        throw error;
      }

      cerrarModalNuevoUsuario();
      cargarUsuarios();
    } catch (err) {
      console.error('Error creando usuario:', err);
      errEl.textContent = err.message || 'No se pudo crear el usuario.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar usuario';
    }
  });

  // ---------------- Editar usuario ----------------

  let usuarioEditandoId = null;

  function abrirModalEditarUsuario(id) {
    const u = usuariosCache.find(x => String(x.id) === String(id));
    if (!u) return;
    usuarioEditandoId = id;

    document.getElementById('euNombre').value = u.nombre || '';
    document.getElementById('euUsuario').value = u.usuario || '';
    document.getElementById('euPin').value = '';
    document.getElementById('euActivo').checked = !!u.activo;
    fijarRolEnFormulario('eu', u.rol || 'operador');
    fijarPermisosEnFormulario('eu', u.permisos || {});
    document.getElementById('euError').style.display = 'none';

    document.getElementById('editarUsuarioModalOverlay').classList.add('show');
  }

  function cerrarModalEditarUsuario() {
    document.getElementById('editarUsuarioModalOverlay').classList.remove('show');
    usuarioEditandoId = null;
  }

  async function guardarEdicionUsuario() {
    if (!usuarioEditandoId) return;
    const nombre = document.getElementById('euNombre').value.trim();
    const usuario = document.getElementById('euUsuario').value.trim();
    const rol = document.getElementById('euRol').value;
    const activo = document.getElementById('euActivo').checked;
    const pin = document.getElementById('euPin').value.trim();
    const errEl = document.getElementById('euError');
    errEl.style.display = 'none';

    if (!nombre || !usuario) {
      errEl.textContent = 'Rellena al menos el nombre y el usuario.';
      errEl.style.display = 'block';
      return;
    }
    if (pin && pin.length < 4) {
      errEl.textContent = 'El PIN debe tener al menos 4 dígitos.';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btnGuardarEditarUsuario');
    btn.disabled = true;
    try {
      const cambios = {
        nombre, usuario, rol, activo,
        permisos: rol === 'operador' ? leerPermisosDeFormulario('eu') : {}
      };
      if (pin) cambios.pin_hash = await sha256(pin);

      const { error } = await sb.from('usuarios').update(cambios).eq('id', usuarioEditandoId);
      if (error) {
        if (error.code === '23505') throw new Error('Ese nombre de usuario ya existe.');
        throw error;
      }

      cerrarModalEditarUsuario();
      cargarUsuarios();
    } catch (err) {
      console.error('Error editando usuario:', err);
      errEl.textContent = err.message || 'No se pudo guardar el usuario.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById('btnCerrarEditarUsuario')?.addEventListener('click', cerrarModalEditarUsuario);
  document.getElementById('btnCancelarEditarUsuario')?.addEventListener('click', cerrarModalEditarUsuario);
  document.getElementById('btnGuardarEditarUsuario')?.addEventListener('click', guardarEdicionUsuario);

  // ---------------- Borrar usuario ----------------

  async function borrarUsuario(id) {
    const u = usuariosCache.find(x => String(x.id) === String(id));
    const ok = await modalConfirm(
      `¿Borrar definitivamente a ${u ? u.nombre : 'este usuario'}? Esta acción no se puede deshacer.`,
      { titulo: 'Borrar usuario', danger: true, textoOk: 'Borrar' }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('usuarios').delete().eq('id', id);
      if (error) throw error;
      cargarUsuarios();
    } catch (err) {
      console.error('Error borrando usuario:', err);
      await modalAlert('No se pudo borrar el usuario.', { titulo: 'Error' });
    }
  }

  // Cargar la tabla la primera vez que se entra en la pestaña Usuarios
  let usuariosCargadosYa = false;
  document.querySelectorAll('[data-view="config-usuarios"]').forEach(el => {
    el.addEventListener('click', () => {
      if (!usuariosCargadosYa) { usuariosCargadosYa = true; cargarUsuarios(); }
    });
  });

  // ---------------------------------------------------------------
