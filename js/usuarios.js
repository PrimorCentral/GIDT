  // Gestión de usuarios
  // ---------------------------------------------------------------
  let usuariosCache = [];

  async function cargarUsuarios() {
    const tbody = document.getElementById('tablaUsuariosBody');
    try {
      const { data, error } = await sb
        .from('usuarios')
        .select('id, nombre, usuario, rol, activo, ultima_conexion')
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
          <td style="text-align:right;">
            <button class="link-accion ${u.activo ? 'danger' : ''}" data-toggle="${u.id}" data-activo="${u.activo}">
              ${u.activo ? 'Desactivar' : 'Activar'}
            </button>
          </td>
        </tr>
      `).join('');

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

  const formNuevoUsuario = document.getElementById('formNuevoUsuario');

  document.getElementById('btnNuevoUsuario').addEventListener('click', () => {
    formNuevoUsuario.style.display = formNuevoUsuario.style.display === 'none' ? 'block' : 'none';
    document.getElementById('nuError').style.display = 'none';
  });

  document.getElementById('btnCancelarUsuario').addEventListener('click', () => {
    formNuevoUsuario.style.display = 'none';
    ['nuNombre','nuUsuario','nuPin'].forEach(id => document.getElementById(id).value = '');
  });

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
      const { error } = await sb.from('usuarios').insert({
        nombre, usuario, pin_hash: pinHash, rol
      });
      if (error) {
        if (error.code === '23505') throw new Error('Ese nombre de usuario ya existe.');
        throw error;
      }

      formNuevoUsuario.style.display = 'none';
      ['nuNombre','nuUsuario','nuPin'].forEach(id => document.getElementById(id).value = '');
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

  // Cargar la tabla la primera vez que se entra en la pestaña Usuarios
  let usuariosCargadosYa = false;
  document.querySelectorAll('[data-view="config-usuarios"]').forEach(el => {
    el.addEventListener('click', () => {
      if (!usuariosCargadosYa) { usuariosCargadosYa = true; cargarUsuarios(); }
    });
  });

  // ---------------------------------------------------------------
