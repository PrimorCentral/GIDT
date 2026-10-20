// ---------------------------------------------------------------
  // Autenticación (usuario + PIN, sesión real de Supabase Auth +
  // sesión propia en sessionStorage)
  // ---------------------------------------------------------------
  // Desde la migración a Supabase Auth: el PIN ya no se compara nunca
  // en el navegador contra el hash guardado en `usuarios.pin_hash`.
  // En vez de eso, cada usuario tiene una cuenta de Supabase Auth con un
  // correo sintético (`<usuario>@gidt.local`) y una contraseña aleatoria
  // que solo maneja el servidor. El PIN de siempre sigue siendo el que
  // escribe cada uno; las políticas RLS de todas las tablas exigen una
  // sesión de Supabase Auth real.
  //
  // Ver Edge Function `gidt-login`: comprueba IP del centro, intentos y
  // PIN, y devuelve la sesión ya abierta (ver intentarLogin).
  const SESSION_KEY = 'gidt_sesion_v2'; // v2: fuerza a volver a iniciar sesión tras la migración a Supabase Auth

  // Se declara aquí (muy pronto, antes que permisos.js/ui-modal.js/navegacion.js
  // la necesiten al arrancar la app) y se rellena de verdad más abajo, en
  // intentarLogin(), o al final de siniestros.js si ya había sesión guardada.
  let sesionActual = null;

  // Se usa al crear/editar usuarios (usuarios.js sigue guardando
  // `pin_hash` con este mismo hash, tal cual se hacía antes).
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
    if (window.RECARGA_POR_ACTUALIZACION_) return; // recarga al actualizar (actualizaciones.js)
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
    if (pinField) {
      if (pinField.dataset.modoTipo === '1') pinField.type = 'password';
      else pinField.classList.remove('mostrar');
    }
    // Vuelven a solo lectura para que el navegador no los rellene solo.
    ['loginUsuario', 'loginPin'].forEach(id => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) el.setAttribute('readonly', '');
    });
    if (btnTogglePin) {
      btnTogglePin.classList.remove('is-visible');
      btnTogglePin.setAttribute('aria-label', 'Mostrar contraseña');
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
      // Desde 2026-10-13 el login va SIEMPRE por la Edge Function
      // `gidt-login` (modo "sesion"): ella comprueba la IP del centro de
      // trabajo (salvo "Usuario externo"), el bloqueo por intentos y el
      // PIN, y si todo es correcto devuelve la sesión de Supabase Auth ya
      // abierta. La contraseña de Auth es aleatoria y nadie la conoce, así
      // que no se puede entrar llamando a Supabase directamente.
      const { data: loginData, error: loginError } = await sb.functions.invoke('gidt-login', {
        body: { usuario: usuarioInput, pin: pinInput, modo: 'sesion' }
      });

      if (loginError || !loginData?.ok || !loginData?.session) {
        let detalle = 'Usuario o contraseña incorrectos.';
        try {
          const cuerpo = await loginError?.context?.json?.();
          if (cuerpo?.error) detalle = cuerpo.error;
        } catch { /* noop */ }
        mostrarErrorLogin(detalle);
        return;
      }

      const { error: errorSesion } = await sb.auth.setSession({
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token
      });
      if (errorSesion) {
        mostrarErrorLogin('Error de conexión. Inténtalo de nuevo.');
        return;
      }

      const { data, error } = await sb
        .from('usuarios')
        .select('id, nombre, usuario, rol, activo, permisos')
        .eq('usuario', usuarioInput)
        .eq('activo', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        await sb.auth.signOut();
        mostrarErrorLogin('Usuario incorrecto.');
        return;
      }

      const sesion = { id: data.id, nombre: data.nombre, usuario: data.usuario, rol: data.rol, permisos: data.permisos || {} };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
      sesionActual = sesion;

      // Actualiza última conexión (no bloqueante)
      sb.from('usuarios').update({ ultima_conexion: new Date().toISOString() }).eq('id', data.id).then(() => {});

      mostrarApp(sesion);
      // Gravedad de motivos (Configuración): al cargar la página solo se
      // pide si ya había sesión; tras un login nuevo hay que pedirla aquí,
      // si no se usaría la clasificación de respaldo hardcodeada.
      if (typeof cargarGravedadMotivos === 'function') cargarGravedadMotivos();
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

  /* Campos del login sin autorrelleno ni aviso de "contraseña no segura"
     (igual que SALIDAS):
     - Los dos campos empiezan en solo lectura y se desbloquean al entrar en
       ellos: así el navegador no los rellena solo al cargar la página.
     - El PIN es un campo de texto que se ve con puntos por CSS. Si el
       navegador no admite esos puntos (muy raro), vuelve a type="password"
       para que nunca se vea en claro. */
  ['loginUsuario', 'loginPin'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const desbloquear = () => el.removeAttribute('readonly');
    el.addEventListener('focus', desbloquear);
    el.addEventListener('pointerdown', desbloquear);
    if (document.activeElement === el) desbloquear();
  });
  const pinLogin = document.getElementById('loginPin');
  const admitePuntos = window.CSS && CSS.supports &&
    (CSS.supports('-webkit-text-security', 'disc') || CSS.supports('text-security', 'disc'));
  if (pinLogin && !admitePuntos) { pinLogin.type = 'password'; pinLogin.dataset.modoTipo = '1'; }

  // Polvo flotando sobre la foto del login (solo decoración, igual que SALIDAS).
  const polvoLogin = document.getElementById('loginPolvo');
  if (polvoLogin) {
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('span');
      const tam = 2 + Math.random() * 4;
      s.style.width = s.style.height = tam + 'px';
      s.style.left = (Math.random() * 70) + '%';
      s.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      s.style.animationDuration = (14 + Math.random() * 16) + 's';
      s.style.animationDelay = (-Math.random() * 25) + 's';
      s.style.opacity = (0.3 + Math.random() * 0.6).toFixed(2);
      polvoLogin.appendChild(s);
    }
  }

  document.getElementById('btnLogin').addEventListener('click', intentarLogin);
  document.getElementById('loginPin').addEventListener('keydown', e => { if (e.key === 'Enter') intentarLogin(); });
  document.getElementById('loginUsuario').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPin').focus(); });

  const btnTogglePin = document.getElementById('btnTogglePin');
  if (btnTogglePin) {
    btnTogglePin.addEventListener('click', () => {
      const pinField = document.getElementById('loginPin');
      let mostrando;
      if (pinField.dataset.modoTipo === '1') {
        // Navegador sin puntos por CSS: se cambia el tipo como siempre.
        mostrando = pinField.type === 'text';
        pinField.type = mostrando ? 'password' : 'text';
      } else {
        mostrando = pinField.classList.contains('mostrar');
        pinField.classList.toggle('mostrar', !mostrando);
      }
      btnTogglePin.classList.toggle('is-visible', !mostrando);
      btnTogglePin.setAttribute('aria-label', mostrando ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });
  }
