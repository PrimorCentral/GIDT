// ---------------------------------------------------------------
  // Autenticación (usuario + PIN, sesión real de Supabase Auth +
  // sesión propia en sessionStorage)
  // ---------------------------------------------------------------
  // Desde la migración a Supabase Auth: el PIN ya no se compara nunca
  // en el navegador contra el hash guardado en `usuarios.pin_hash`.
  // En vez de eso, cada usuario tiene (o se le crea al vuelo la
  // primera vez que entra) una cuenta de Supabase Auth con un correo
  // sintético (`<usuario>@gidt.local`) y una contraseña derivada del
  // PIN. El PIN de siempre sigue siendo el que escribe cada uno; lo
  // único que cambia es cómo se valida por debajo, y ahora las
  // políticas RLS de todas las tablas exigen una sesión de Supabase
  // Auth real en vez de estar abiertas a cualquiera con la clave anon.
  //
  // Ver Edge Function `gidt-login`: es la que comprueba el PIN contra
  // el hash de siempre (server-side, con la service_role key) y
  // crea/actualiza esa cuenta de Auth cuando hace falta.
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

  // Correo/contraseña sintéticos para la cuenta de Supabase Auth de
  // cada usuario. Deben coincidir EXACTAMENTE con las mismas funciones
  // en la Edge Function `gidt-login`.
  function authEmailDesdeUsuario(usuario) {
    return `${String(usuario).trim().toLowerCase()}@gidt.local`;
  }
  function authPasswordDesdePin(pin) {
    return 'gidt_' + pin;
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
      const authEmail = authEmailDesdeUsuario(usuarioInput);
      const authPassword = authPasswordDesdePin(pinInput);

      let { error: errorAuth } = await sb.auth.signInWithPassword({ email: authEmail, password: authPassword });

      if (errorAuth) {
        // No ha funcionado a la primera: puede ser la primera vez que
        // este usuario entra desde la migración a Supabase Auth, o que
        // le hayan reseteado el PIN hace poco. La Edge Function
        // comprueba el PIN contra el hash de siempre y, si es
        // correcto, prepara/actualiza su cuenta de Auth al vuelo.
        const { data: migData, error: migError } = await sb.functions.invoke('gidt-login', {
          body: { usuario: usuarioInput, pin: pinInput }
        });

        if (migError || !migData?.ok) {
          let detalle = 'Usuario o PIN incorrecto.';
          try {
            const cuerpo = await migError?.context?.json?.();
            if (cuerpo?.error) detalle = cuerpo.error;
          } catch { /* noop */ }
          mostrarErrorLogin(detalle);
          return;
        }

        ({ error: errorAuth } = await sb.auth.signInWithPassword({ email: authEmail, password: authPassword }));
        if (errorAuth) {
          mostrarErrorLogin('Error de conexión. Inténtalo de nuevo.');
          return;
        }
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
