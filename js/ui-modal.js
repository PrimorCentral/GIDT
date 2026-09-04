  // ---------------------------------------------------------------
  // Modal genérico (sustituye alert / confirm / prompt nativos)
  // ---------------------------------------------------------------
  const modalOverlay   = document.getElementById('modalOverlay');
  const modalIconEl    = document.getElementById('modalIcon');
  const modalTitleEl   = document.getElementById('modalTitle');
  const modalMessageEl = document.getElementById('modalMessage');
  const modalInputEl   = document.getElementById('modalInput');
  const modalBtnOk     = document.getElementById('modalBtnOk');
  const modalBtnCancel = document.getElementById('modalBtnCancel');

  function _abrirModal() { modalOverlay.classList.add('show'); }
  function _cerrarModal() { modalOverlay.classList.remove('show'); }

  function modalAlert(mensaje, { titulo = 'Aviso', icono = '' } = {}) {
    return new Promise(resolve => {
      modalIconEl.style.display = icono ? '' : 'none';
      modalIconEl.textContent = icono;
      modalTitleEl.textContent = titulo;
      modalMessageEl.textContent = mensaje;
      modalInputEl.style.display = 'none';
      modalBtnCancel.style.display = 'none';
      modalBtnOk.textContent = 'Aceptar';
      modalBtnOk.className = 'btn primary';
      _abrirModal();

      const onOk = () => { limpiar(); resolve(); };
      function limpiar() {
        _cerrarModal();
        modalBtnOk.removeEventListener('click', onOk);
      }
      modalBtnOk.addEventListener('click', onOk);
    });
  }

  function modalConfirm(mensaje, { titulo = 'Confirmar', danger = false, textoOk = 'Aceptar', textoCancel = 'Cancelar', icono = '' } = {}) {
    return new Promise(resolve => {
      modalIconEl.style.display = icono ? '' : 'none';
      modalIconEl.textContent = icono;
      modalTitleEl.textContent = titulo;
      modalMessageEl.textContent = mensaje;
      modalInputEl.style.display = 'none';
      modalBtnCancel.style.display = '';
      modalBtnCancel.textContent = textoCancel;
      modalBtnOk.textContent = textoOk;
      modalBtnOk.className = danger ? 'btn danger' : 'btn primary';
      _abrirModal();

      const onOk = () => { limpiar(); resolve(true); };
      const onCancel = () => { limpiar(); resolve(false); };
      function limpiar() {
        _cerrarModal();
        modalBtnOk.removeEventListener('click', onOk);
        modalBtnCancel.removeEventListener('click', onCancel);
      }
      modalBtnOk.addEventListener('click', onOk);
      modalBtnCancel.addEventListener('click', onCancel);
    });
  }

  function modalPrompt(mensaje, { titulo = 'Introduce un valor', placeholder = '', valorInicial = '', tipo = 'text' } = {}) {
    return new Promise(resolve => {
      modalIconEl.style.display = 'none';
      modalTitleEl.textContent = titulo;
      modalMessageEl.textContent = mensaje;
      modalInputEl.style.display = '';
      modalInputEl.type = tipo;
      modalInputEl.placeholder = placeholder;
      modalInputEl.value = valorInicial;
      modalBtnCancel.style.display = '';
      modalBtnCancel.textContent = 'Cancelar';
      modalBtnOk.textContent = 'Aceptar';
      modalBtnOk.className = 'btn primary';
      _abrirModal();
      setTimeout(() => modalInputEl.focus(), 30);

      const onOk = () => { const v = modalInputEl.value; limpiar(); resolve(v); };
      const onCancel = () => { limpiar(); resolve(null); };
      const onKey = (e) => {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      };
      function limpiar() {
        _cerrarModal();
        modalBtnOk.removeEventListener('click', onOk);
        modalBtnCancel.removeEventListener('click', onCancel);
        modalInputEl.removeEventListener('keydown', onKey);
      }
      modalBtnOk.addEventListener('click', onOk);
      modalBtnCancel.addEventListener('click', onCancel);
      modalInputEl.addEventListener('keydown', onKey);
    });
  }

  function modalSeleccionar(mensaje, opciones, { titulo = 'Seleccionar', textoOk = 'Aceptar', valorInicial = null } = {}) {
    return new Promise(resolve => {
      const modalSelectEl = document.getElementById('modalSelect');
      modalIconEl.style.display = 'none';
      modalTitleEl.textContent = titulo;
      modalMessageEl.textContent = mensaje;
      modalInputEl.style.display = 'none';
      modalSelectEl.innerHTML = opciones.map(o =>
        `<option value="${o.id}" ${valorInicial === o.id ? 'selected' : ''}>${o.nombre}</option>`
      ).join('');
      modalSelectEl.style.display = '';
      modalBtnCancel.style.display = '';
      modalBtnCancel.textContent = 'Cancelar';
      modalBtnOk.textContent = textoOk;
      modalBtnOk.className = 'btn primary';
      _abrirModal();

      const onOk = () => { const v = Number(modalSelectEl.value); limpiar(); resolve(v); };
      const onCancel = () => { limpiar(); resolve(null); };
      function limpiar() {
        _cerrarModal();
        modalSelectEl.style.display = 'none';
        modalBtnOk.removeEventListener('click', onOk);
        modalBtnCancel.removeEventListener('click', onCancel);
      }
      modalBtnOk.addEventListener('click', onOk);
      modalBtnCancel.addEventListener('click', onCancel);
    });
  }

  // Cerrar al pulsar fuera del cuadro (equivale a cancelar)
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      if (modalBtnCancel.style.display !== 'none') modalBtnCancel.click();
      else modalBtnOk.click();
    }
  });

  document.getElementById('userChip').addEventListener('click', async () => {
    if (!(await modalConfirm('¿Cerrar sesión?', { titulo: 'Cerrar sesión' }))) return;
    sessionStorage.removeItem(SESSION_KEY);
    mostrarLogin();
  });

  // Comprobación de sesión al cargar
  const sesionActiva = getSesion();
  if (sesionActiva) {
    mostrarApp(sesionActiva);
  } else {
    mostrarLogin();
  }

