// ---------------------------------------------------------------
  // Autenticación (usuario + PIN, hash SHA-256, sesión en sessionStorage)
  // ---------------------------------------------------------------
  const SESSION_KEY = 'gidt_sesion';

  // Se declara aquí (muy pronto, antes que permisos.js/ui-modal.js/navegacion.js
  // la necesiten al arrancar la app) y se rellena de verdad más abajo, en
  // intentarLogin(), o al final de siniestros.js si ya había sesión guardada.
  let sesionActual = null;

  async function sha256(texto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getSesion() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  // Aviso al cerrar la pestaña/ventana (la "X") mientras hay sesión iniciada,
  // para que no se salga de la app "en frío" sin pasar por la confirmación
  // de "Cerrar sesión". Por seguridad, los navegadores no permiten sustituir
  // este aviso por nuestro modal propio: solo dejan disparar su propio
  // cuadro genérico ("¿Salir del sitio?"), que aparece igual pulsando la X,
  // recargando o cerrando la pestaña.
  window.addEventListener('beforeunload', (evento) => {
    if (!getSesion()) return;
    evento.preventDefault();
    evento.returnValue = '';
  });

  function mostrarApp(usuario) {
    sesionActual = usuario;
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('userChipName').textContent = usuario.nombre || usuario.usuario;
    if (typeof aplicarPermisosPorRol === 'function') aplicarPermisosPorRol(usuario.rol);
  }

  function mostrarLogin() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginUsuario').value = '';
    document.getElementById('loginPin').value = '';
    document.getElementById('loginErr').classList.remove('show');
    document.querySelector('.login-card').classList.remove('shake');

    const pinField = document.getElementById('loginPin');
    const btnTogglePin = document.getElementById('btnTogglePin');
    if (pinField) pinField.type = 'password';
    if (btnTogglePin) {
      btnTogglePin.classList.remove('is-visible');
      btnTogglePin.setAttribute('aria-label', 'Mostrar PIN');
    }
  }

  async function intentarLogin() {
    const usuarioInput = document.getElementById('loginUsuario').value.trim();
    const pinInput = document.getElementById('loginPin').value.trim();
    const btn = document.getElementById('btnLogin');
    const btnLabel = btn.querySelector('.btn-label');
    const err = document.getElementById('loginErr');
    const errText = err.querySelector('.err-text');
    const card = document.querySelector('.login-card');
    err.classList.remove('show');

    function mostrarErrorLogin(mensaje) {
      errText.textContent = mensaje;
      err.classList.add('show');
      card.classList.remove('shake');
      void card.offsetWidth; // fuerza reflow para reiniciar la animación
      card.classList.add('shake');
    }

    if (!usuarioInput || !pinInput) return;

    btn.disabled = true;
    btn.classList.add('loading');
    btnLabel.textContent = 'Comprobando…';

    try {
      const pinHash = await sha256(pinInput);

      const { data, error } = await sb
        .from('usuarios')
        .select('id, nombre, usuario, rol, activo, pin_hash, permisos')
        .eq('usuario', usuarioInput)
        .eq('activo', true)
        .maybeSingle();

      if (error) throw error;

      if (!data || data.pin_hash !== pinHash) {
        mostrarErrorLogin('Usuario incorrecto.');
        return;
      }

      const sesion = { id: data.id, nombre: data.nombre, usuario: data.usuario, rol: data.rol, permisos: data.permisos || {} };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
      sesionActual = sesion;

      // Actualiza última conexión (no bloqueante)
      sb.from('usuarios').update({ ultima_conexion: new Date().toISOString() }).eq('id', data.id).then(() => {});
      if (typeof registrarAccion === 'function') registrarAccion('sesion', 'Inicio de sesión', sesion.nombre || sesion.usuario);

      mostrarApp(sesion);
      cargarKPIs();
      cargarInformeHoy();
    } catch (e) {
      console.error('Error de login:', e);
      mostrarErrorLogin('Error de conexión. Inténtalo de nuevo.');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      btnLabel.textContent = 'Entrar';
    }
  }

  document.getElementById('btnLogin').addEventListener('click', intentarLogin);
  document.getElementById('loginPin').addEventListener('keydown', e => { if (e.key === 'Enter') intentarLogin(); });
  document.getElementById('loginUsuario').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPin').focus(); });

  const btnTogglePin = document.getElementById('btnTogglePin');
  if (btnTogglePin) {
    btnTogglePin.addEventListener('click', () => {
      const pinField = document.getElementById('loginPin');
      const mostrando = pinField.type === 'text';
      pinField.type = mostrando ? 'password' : 'text';
      btnTogglePin.classList.toggle('is-visible', !mostrando);
      btnTogglePin.setAttribute('aria-label', mostrando ? 'Mostrar PIN' : 'Ocultar PIN');
    });
  }
