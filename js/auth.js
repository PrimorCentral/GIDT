  // ---------------------------------------------------------------
  // Autenticación (usuario + PIN, hash SHA-256, sesión en sessionStorage)
  // ---------------------------------------------------------------
  const SESSION_KEY = 'gidt_sesion';

  async function sha256(texto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getSesion() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function mostrarApp(usuario) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('userChipName').textContent = usuario.nombre || usuario.usuario;
  }

  function mostrarLogin() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginUsuario').value = '';
    document.getElementById('loginPin').value = '';
    document.getElementById('loginErr').classList.remove('show');
  }

  async function intentarLogin() {
    const usuarioInput = document.getElementById('loginUsuario').value.trim();
    const pinInput = document.getElementById('loginPin').value.trim();
    const btn = document.getElementById('btnLogin');
    const err = document.getElementById('loginErr');
    err.classList.remove('show');

    if (!usuarioInput || !pinInput) return;

    btn.disabled = true;
    btn.textContent = 'Comprobando…';

    try {
      const pinHash = await sha256(pinInput);

      const { data, error } = await sb
        .from('usuarios')
        .select('id, nombre, usuario, rol, activo, pin_hash')
        .eq('usuario', usuarioInput)
        .eq('activo', true)
        .maybeSingle();

      if (error) throw error;

      if (!data || data.pin_hash !== pinHash) {
        err.textContent = 'Usuario incorrecto.';
        err.classList.add('show');
        return;
      }

      const sesion = { id: data.id, nombre: data.nombre, usuario: data.usuario, rol: data.rol };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
      sesionActual = sesion;

      // Actualiza última conexión (no bloqueante)
      sb.from('usuarios').update({ ultima_conexion: new Date().toISOString() }).eq('id', data.id).then(() => {});

      mostrarApp(sesion);
      cargarKPIs();
      cargarInformeHoy();
    } catch (e) {
      console.error('Error de login:', e);
      err.textContent = 'Error de conexión. Inténtalo de nuevo.';
      err.classList.add('show');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  }

  document.getElementById('btnLogin').addEventListener('click', intentarLogin);
  document.getElementById('loginPin').addEventListener('keydown', e => { if (e.key === 'Enter') intentarLogin(); });
  document.getElementById('loginUsuario').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPin').focus(); });

