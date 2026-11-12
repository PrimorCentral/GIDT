  // ---------------------------------------------------------------
  // Gestión → Supervisores
  // ---------------------------------------------------------------
  // Alta, edición y borrado de los supervisores/as de tienda (tabla
  // `supervisores`): nombre abreviado, nombre completo, correo y teléfono.
  // El nombre abreviado es el que se elige en la ficha de la tienda
  // (lista Supervisor/a) y el que se guarda en tiendas.supervisor.
  //
  // En la base de datos, tiendas.supervisor está enlazado con
  // supervisores.nombre_abreviado: al cambiar el nombre abreviado de un
  // supervisor sus tiendas se actualizan solas, y no deja borrar uno que
  // tenga tiendas asignadas (aquí se avisa antes).
  //
  // Permiso: el mismo que Tiendas (config_tiendas). Ver permisos-aviso.js.
  //
  // Requiere (ya cargados antes): sb, supervisoresCache /
  // cargarSupervisoresCache / cargarAgenciasYTiendas (tiendas.js),
  // modalAlert / modalConfirm / mostrarToast (ui-modal.js), escapeHtml y
  // USR_ICO (usuarios.js), registrarAccion (auditoria.js).

  // Nº de tiendas por nombre abreviado de supervisor (todas las fichas:
  // activas, de baja y en apertura).
  let tiendasPorSupervisor = new Map();

  const CAMPOS_AUDITORIA_SUPERVISOR = [
    { clave: 'nombre_abreviado', etiqueta: 'Nombre abreviado' },
    { clave: 'nombre_completo', etiqueta: 'Nombre completo' },
    { clave: 'email', etiqueta: 'Correo electrónico' },
    { clave: 'telefono', etiqueta: 'Teléfono' }
  ];

  async function contarTiendasPorSupervisor() {
    const { data, error } = await sb.from('tiendas').select('supervisor').not('supervisor', 'is', null);
    if (error) throw error;
    const mapa = new Map();
    (data || []).forEach(t => { if (t.supervisor) mapa.set(t.supervisor, (mapa.get(t.supervisor) || 0) + 1); });
    return mapa;
  }

  async function cargarSupervisores() {
    const tbody = document.getElementById('tablaSupervisoresBody');
    if (!tbody) return;
    const filaMensaje = (texto, color) =>
      `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(${color});">${texto}</td></tr>`;
    if (typeof mostrarCargandoGlobal === 'function') mostrarCargandoGlobal();
    try {
      const { data, error } = await sb.from('supervisores')
        .select('id, nombre_abreviado, nombre_completo, email, telefono')
        .order('nombre_abreviado');
      if (error) throw error;
      supervisoresCache = data || [];
      tiendasPorSupervisor = await contarTiendasPorSupervisor();

      if (!supervisoresCache.length) {
        tbody.innerHTML = filaMensaje('No hay supervisores todavía.', '--ink-soft');
        return;
      }

      const dato = v => (v ? escapeHtml(v) : '—');
      tbody.innerHTML = supervisoresCache.map(s => `
        <tr>
          <td><b>${escapeHtml(s.nombre_abreviado)}</b></td>
          <td>${dato(s.nombre_completo)}</td>
          <td>${dato(s.email)}</td>
          <td>${dato(s.telefono)}</td>
          <td style="text-align:center;">${tiendasPorSupervisor.get(s.nombre_abreviado) || 0}</td>
          <td style="text-align:right; white-space:nowrap;">
            <div class="usr-acciones">
              <button type="button" class="usr-ico editar" data-editar-supervisor="${s.id}" title="Editar" aria-label="Editar">${USR_ICO.editar}</button>
              <button type="button" class="usr-ico borrar" data-borrar-supervisor="${s.id}" title="Borrar" aria-label="Borrar">${USR_ICO.borrar}</button>
            </div>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-editar-supervisor]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalSupervisor(Number(btn.dataset.editarSupervisor)));
      });
      tbody.querySelectorAll('[data-borrar-supervisor]').forEach(btn => {
        btn.addEventListener('click', () => borrarSupervisor(Number(btn.dataset.borrarSupervisor)));
      });
    } catch (err) {
      console.error('Error cargando supervisores:', err);
      tbody.innerHTML = filaMensaje('Error al cargar supervisores.', '--grave');
    } finally {
      if (typeof ocultarCargandoGlobal === 'function') ocultarCargandoGlobal();
    }
  }

  // ---------------- Modal: nuevo / editar ----------------
  let supervisorEditandoId = null;   // null = alta
  let fotoFormSupervisor = '';       // cómo estaba el formulario al abrirlo

  function leerFormSupervisor() {
    return {
      nombre_abreviado: document.getElementById('supAbreviado').value.trim().replace(/\s+/g, ' ').toUpperCase(),
      nombre_completo: document.getElementById('supNombreCompleto').value.trim().replace(/\s+/g, ' ').toUpperCase(),
      email: document.getElementById('supEmail').value.trim().toLowerCase(),
      telefono: document.getElementById('supTelefono').value.trim().replace(/\s+/g, ' ')
    };
  }

  function hayCambiosSupervisor() {
    return JSON.stringify(leerFormSupervisor()) !== fotoFormSupervisor;
  }

  // Al editar, Guardar queda apagado hasta que se cambia algo.
  function actualizarBotonGuardarSupervisor() {
    const btn = document.getElementById('btnGuardarSupervisor');
    if (!btn || btn.dataset.guardando === '1') return;
    btn.disabled = supervisorEditandoId != null && !hayCambiosSupervisor();
  }

  function abrirModalSupervisor(id = null) {
    const s = id != null ? supervisoresCache.find(x => x.id === id) : null;
    if (id != null && !s) return;
    supervisorEditandoId = s ? s.id : null;
    document.getElementById('supervisorModalTitulo').textContent = s ? '✏️ Editar supervisor' : '➕ Nuevo supervisor';
    document.getElementById('btnGuardarSupervisor').textContent = s ? '💾 Guardar' : '💾 Crear supervisor';
    document.getElementById('supAbreviado').value = s?.nombre_abreviado || '';
    document.getElementById('supNombreCompleto').value = s?.nombre_completo || '';
    document.getElementById('supEmail').value = s?.email || '';
    document.getElementById('supTelefono').value = s?.telefono || '';
    document.getElementById('supError').style.display = 'none';
    fotoFormSupervisor = JSON.stringify(leerFormSupervisor());
    actualizarBotonGuardarSupervisor();
    document.getElementById('supervisorModalOverlay').classList.add('show');
    setTimeout(() => document.getElementById(s ? 'supNombreCompleto' : 'supAbreviado').focus(), 30);
  }

  function cerrarModalSupervisor() {
    document.getElementById('supervisorModalOverlay').classList.remove('show');
    supervisorEditandoId = null;
  }

  // Cancelar / ✕ con cambios sin guardar: se avisa antes de perderlos.
  async function cancelarModalSupervisor() {
    if (hayCambiosSupervisor()) {
      const salir = await modalConfirm(
        'Hay cambios sin guardar en este supervisor. Si cancelas, se perderán.\n\nPara no perderlos, pulsa Volver y luego Guardar.',
        { titulo: 'Cambios sin guardar', icono: '⚠️', danger: true, textoOk: 'Salir sin guardar', textoCancel: 'Volver' }
      );
      if (!salir) return;
    }
    cerrarModalSupervisor();
  }

  async function guardarSupervisor() {
    const errEl = document.getElementById('supError');
    const mostrarError = (texto) => { errEl.textContent = texto; errEl.style.display = 'block'; };
    errEl.style.display = 'none';

    const d = leerFormSupervisor();
    if (!d.nombre_abreviado) return mostrarError('El nombre abreviado es obligatorio.');
    if (!d.nombre_completo) return mostrarError('El nombre completo es obligatorio.');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return mostrarError('El correo electrónico no es válido.');

    const editandoId = supervisorEditandoId;
    const enCache = editandoId != null ? supervisoresCache.find(x => x.id === editandoId) : null;
    const antes = enCache ? { ...enCache } : null;
    const repetido = supervisoresCache.find(x => x.id !== editandoId && x.nombre_abreviado === d.nombre_abreviado);
    if (repetido) return mostrarError(`Ya existe un supervisor con el nombre abreviado "${d.nombre_abreviado}".`);

    const fila = {
      nombre_abreviado: d.nombre_abreviado,
      nombre_completo: d.nombre_completo,
      email: d.email || null,
      telefono: d.telefono || null
    };

    const btn = document.getElementById('btnGuardarSupervisor');
    btn.dataset.guardando = '1';
    btn.disabled = true;
    try {
      if (editandoId != null) {
        const { error } = await sb.from('supervisores').update(fila).eq('id', editandoId);
        if (error) throw error;
      } else {
        const { error } = await sb.from('supervisores').insert(fila);
        if (error) throw error;
      }

      if (typeof registrarAccion === 'function') {
        const cambios = antes && typeof auditoriaCalcularCambios === 'function'
          ? auditoriaCalcularCambios(CAMPOS_AUDITORIA_SUPERVISOR, antes, fila) : null;
        registrarAccion('supervisores', antes ? 'Editar supervisor' : 'Crear supervisor', d.nombre_abreviado, cambios);
      }
      cerrarModalSupervisor();
      if (typeof mostrarToast === 'function') {
        mostrarToast(`Supervisor "${d.nombre_abreviado}" ${antes ? 'modificado' : 'creado'} correctamente`, { posicion: 'abajo' });
      }
      await cargarSupervisores();
      // Las listas de Supervisor/a de las tiendas (y, si se ha cambiado el
      // nombre abreviado, las propias tiendas) se ponen al día.
      if (typeof cargarAgenciasYTiendas === 'function') cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error guardando el supervisor:', err);
      mostrarError(err && err.code === '23505'
        ? `Ya existe un supervisor con el nombre abreviado "${d.nombre_abreviado}".`
        : 'No se pudo guardar el supervisor.');
    } finally {
      delete btn.dataset.guardando;
      btn.disabled = false;
      if (supervisorEditandoId != null) actualizarBotonGuardarSupervisor();
    }
  }

  // ---------------- Borrar ----------------
  // No se puede borrar un supervisor con tiendas asignadas: antes hay que
  // asignarles otro en la ficha de cada tienda.
  async function borrarSupervisor(id) {
    const s = supervisoresCache.find(x => x.id === id);
    if (!s) return;

    const avisarConTiendas = (n) => modalAlert(
      `${s.nombre_abreviado} tiene ${n} tienda${n === 1 ? '' : 's'} asignada${n === 1 ? '' : 's'}. `
      + `Asígnale${n === 1 ? '' : 's'} otro supervisor/a en Gestión → Tiendas antes de borrarlo.`,
      { titulo: 'No se puede borrar', icono: '⛔', danger: true });

    try {
      // Se cuenta en el momento, por si otra persona acaba de asignarle una tienda.
      const { count, error } = await sb.from('tiendas')
        .select('id', { count: 'exact', head: true })
        .eq('supervisor', s.nombre_abreviado);
      if (error) throw error;
      if (count > 0) { await avisarConTiendas(count); return; }
    } catch (err) {
      console.error('Error comprobando las tiendas del supervisor:', err);
      await modalAlert('No se pudo comprobar si el supervisor tiene tiendas asignadas.', { titulo: 'Error', icono: '⚠️', danger: true });
      return;
    }

    const ok = await modalConfirm(
      `¿Borrar el supervisor "${s.nombre_abreviado}"? Esta acción no se puede deshacer.`,
      { titulo: 'Borrar supervisor', icono: '🗑️', danger: true, textoOk: 'Borrar' });
    if (!ok) return;

    try {
      const { error } = await sb.from('supervisores').delete().eq('id', id);
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('supervisores', 'Borrar supervisor', s.nombre_abreviado);
      if (typeof mostrarToast === 'function') mostrarToast(`Supervisor "${s.nombre_abreviado}" borrado`, { posicion: 'abajo' });
      await cargarSupervisores();
      if (typeof cargarAgenciasYTiendas === 'function') cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error borrando el supervisor:', err);
      // 23503: la base de datos no deja borrarlo porque aún tiene tiendas.
      if (err && err.code === '23503') {
        const n = tiendasPorSupervisor.get(s.nombre_abreviado) || 1;
        await avisarConTiendas(n);
        cargarSupervisores();
        return;
      }
      await modalAlert('No se pudo borrar el supervisor.', { titulo: 'Error', icono: '⚠️', danger: true });
    }
  }

  // ---------------- Eventos ----------------
  document.getElementById('btnNuevoSupervisor')?.addEventListener('click', () => abrirModalSupervisor());
  document.getElementById('btnCerrarSupervisor')?.addEventListener('click', cancelarModalSupervisor);
  document.getElementById('btnCancelarSupervisor')?.addEventListener('click', cancelarModalSupervisor);
  document.getElementById('btnGuardarSupervisor')?.addEventListener('click', guardarSupervisor);

  // Nombre abreviado y nombre completo, siempre en mayúsculas mientras se
  // escribe (igual que los textos de la ficha de tienda).
  ['supAbreviado', 'supNombreCompleto'].forEach(id => {
    const inp = document.getElementById(id);
    inp?.addEventListener('input', () => {
      const may = inp.value.toUpperCase();
      if (inp.value === may) return;
      const ini = inp.selectionStart, fin = inp.selectionEnd;
      inp.value = may;
      try { inp.setSelectionRange(ini, fin); } catch (_) {}
    });
  });
  document.getElementById('supervisorModalOverlay')?.addEventListener('input', actualizarBotonGuardarSupervisor);
  // Enter en cualquier campo = Guardar (si se puede).
  document.getElementById('supervisorModalOverlay')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const btn = document.getElementById('btnGuardarSupervisor');
    if (btn && !btn.disabled) btn.click();
  });

  // Se recarga SIEMPRE al entrar, para ver cambios de otros compañeros.
  document.querySelectorAll('[data-view="config-supervisores"]').forEach(el => {
    el.addEventListener('click', () => { cargarSupervisores(); });
  });
  document.getElementById('btnRecargarSupervisores')?.addEventListener('click', (e) =>
    recargarConGiro(e.currentTarget, cargarSupervisores));
