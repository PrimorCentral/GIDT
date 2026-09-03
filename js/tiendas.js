  // Gestión de tiendas (acordeón por agencia)
  // ---------------------------------------------------------------
  let agenciasCache = [];
  let tiendasCache = [];
  let agenciasTiendasAbiertas = new Set(); // ids de agencia desplegados en "Gestión de tiendas"
  const MARCA_LABEL = { HABITUAL: 'Habitual', SABADO: 'Sábado', PRUEBA: 'Prueba', ESPECIAL: 'Especial' };
  const MARCA_CLASE = { HABITUAL: 'leve', SABADO: 'sabado', PRUEBA: 'prueba', ESPECIAL: 'especial' };
  const MARCA_BADGE_LETRA = { SABADO: 'S', ESPECIAL: 'E', PRUEBA: 'P' };
  function badgeMarcaHtml(marca) {
    const letra = MARCA_BADGE_LETRA[marca];
    if (!letra) return ''; // HABITUAL: sin badge
    return `<span class="marca-badge ${MARCA_CLASE[marca]}" title="${MARCA_LABEL[marca]}">${letra}</span>`;
  }

  async function cargarAgenciasYTiendas() {
    const [{ data: ags, error: e1 }, { data: tds, error: e2 }] = await Promise.all([
      sb.from('agencias').select('id, nombre, orden').order('orden'),
      sb.from('tiendas').select('id, nombre, agencia_id, hora_prevista, marca, orden, activo').order('orden')
    ]);
    if (e1 || e2) { console.error(e1 || e2); return; }
    agenciasCache = ags || [];
    tiendasCache = tds || [];

    // rellenar el <select> de agencia del formulario de alta
    const sel = document.getElementById('ntAgencia');
    sel.innerHTML = agenciasCache.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');

    renderAcordeonTiendas();
  }

  function renderAcordeonTiendas() {
    const cont = document.getElementById('acordeonAgencias');
    cont.innerHTML = agenciasCache.map(ag => {
      const tds = tiendasCache.filter(t => t.agencia_id === ag.id && t.activo);
      const filas = tds.length
        ? tds.map(t => `
            <tr data-tienda="${t.id}">
              <td class="celda-nombre">
                <span class="v-nombre">${escapeHtml(t.nombre)}</span>
                <input class="form-input e-nombre" style="display:none;" value="${escapeHtml(t.nombre)}">
              </td>
              <td class="hora celda-hora">
                <span class="v-hora">${t.hora_prevista ? t.hora_prevista.slice(0,5) : '—'}</span>
                <input type="time" class="form-input e-hora" style="display:none;" value="${t.hora_prevista ? t.hora_prevista.slice(0,5) : ''}">
              </td>
              <td class="celda-marca">
                <span class="v-marca"><span class="pill ${MARCA_CLASE[t.marca] || 'leve'}">${MARCA_LABEL[t.marca] || t.marca}</span></span>
                <select class="form-input e-marca" style="display:none;">
                  ${Object.entries(MARCA_LABEL).map(([k,v]) => `<option value="${k}" ${k===t.marca?'selected':''}>${v}</option>`).join('')}
                </select>
              </td>
              <td class="acciones">
                <span class="v-acciones">
                  <button class="mini-btn" data-mover="up" title="Subir">▲</button>
                  <button class="mini-btn" data-mover="down" title="Bajar">▼</button>
                  <button class="mini-btn" data-editar title="Editar">✏️</button>
                  <button class="mini-btn" data-borrar title="Eliminar">🗑️</button>
                </span>
                <span class="e-acciones" style="display:none;">
                  <button class="mini-btn" data-guardar title="Guardar">✅</button>
                  <button class="mini-btn" data-cancelar title="Cancelar">✖️</button>
                </span>
              </td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--ink-soft);">Sin tiendas en esta agencia.</td></tr>`;

      return `
        <div class="agencia-block">
          <div class="agencia-head ${agenciasTiendasAbiertas.has(ag.id) ? 'open' : ''}" data-agencia="${ag.id}">
            <span class="caret">▶</span>
            <b>${escapeHtml(ag.nombre)}</b>
            <span class="count">${tds.length} tienda${tds.length === 1 ? '' : 's'}</span>
          </div>
          <div class="agencia-body ${agenciasTiendasAbiertas.has(ag.id) ? 'open' : ''}">
            <table class="tabla-tiendas"><tbody>${filas}</tbody></table>
          </div>
        </div>`;
    }).join('');

    cont.querySelectorAll('.agencia-head').forEach(head => {
      head.addEventListener('click', () => {
        const id = Number(head.dataset.agencia);
        const abierto = head.classList.toggle('open');
        head.nextElementSibling.classList.toggle('open');
        if (abierto) agenciasTiendasAbiertas.add(id); else agenciasTiendasAbiertas.delete(id);
      });
    });

    cont.querySelectorAll('[data-mover]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        moverTienda(Number(tr.dataset.tienda), btn.dataset.mover);
      });
    });
    cont.querySelectorAll('[data-editar]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        entrarModoEdicion(btn.closest('tr'));
      });
    });
    cont.querySelectorAll('[data-cancelar]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        salirModoEdicion(btn.closest('tr'));
      });
    });
    cont.querySelectorAll('[data-guardar]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        guardarEdicionTienda(btn.closest('tr'));
      });
    });
    cont.querySelectorAll('[data-borrar]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        borrarTienda(Number(tr.dataset.tienda));
      });
    });
  }

  function entrarModoEdicion(tr) {
    tr.querySelectorAll('.v-nombre,.v-hora,.v-marca,.v-acciones').forEach(el => el.style.display = 'none');
    tr.querySelectorAll('.e-nombre,.e-hora,.e-marca,.e-acciones').forEach(el => el.style.display = '');
  }
  function salirModoEdicion(tr) {
    tr.querySelectorAll('.v-nombre,.v-hora,.v-marca,.v-acciones').forEach(el => el.style.display = '');
    tr.querySelectorAll('.e-nombre,.e-hora,.e-marca,.e-acciones').forEach(el => el.style.display = 'none');
  }

  async function guardarEdicionTienda(tr) {
    const id = Number(tr.dataset.tienda);
    const nombre = tr.querySelector('.e-nombre').value.trim();
    const hora = tr.querySelector('.e-hora').value;
    const marca = tr.querySelector('.e-marca').value;
    if (!nombre) return;

    try {
      const { error } = await sb.from('tiendas').update({
        nombre, hora_prevista: hora || null, marca
      }).eq('id', id);
      if (error) throw error;
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error editando tienda:', err);
      await modalAlert('No se pudo guardar el cambio.', { titulo: 'Error' });
    }
  }

  async function moverTienda(id, direccion) {
    const t = tiendasCache.find(x => x.id === id);
    if (!t) return;
    const hermanas = tiendasCache.filter(x => x.agencia_id === t.agencia_id && x.activo).sort((a,b) => a.orden - b.orden);
    const idx = hermanas.findIndex(x => x.id === id);
    const idxDestino = direccion === 'up' ? idx - 1 : idx + 1;
    if (idxDestino < 0 || idxDestino >= hermanas.length) return;

    const otra = hermanas[idxDestino];
    try {
      await Promise.all([
        sb.from('tiendas').update({ orden: otra.orden }).eq('id', t.id),
        sb.from('tiendas').update({ orden: t.orden }).eq('id', otra.id)
      ]);
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error moviendo tienda:', err);
    }
  }

  async function borrarTienda(id) {
    const t = tiendasCache.find(x => x.id === id);
    if (!t) return;
    const ok = await modalConfirm(
      `¿Eliminar "${t.nombre}"? Esta acción se puede deshacer reactivándola por SQL si hace falta.`,
      { titulo: 'Eliminar tienda', danger: true, textoOk: 'Eliminar' }
    );
    if (!ok) return;
    try {
      const { error } = await sb.from('tiendas').update({ activo: false }).eq('id', id);
      if (error) throw error;
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error eliminando tienda:', err);
      await modalAlert('No se pudo eliminar la tienda.', { titulo: 'Error' });
    }
  }

  const formNuevaTienda = document.getElementById('formNuevaTienda');
  document.getElementById('btnNuevaTienda').addEventListener('click', () => {
    formNuevaTienda.style.display = formNuevaTienda.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btnCancelarTienda').addEventListener('click', () => {
    formNuevaTienda.style.display = 'none';
    document.getElementById('ntNombre').value = '';
    document.getElementById('ntHora').value = '';
  });
  document.getElementById('btnGuardarTienda').addEventListener('click', async () => {
    const nombre = document.getElementById('ntNombre').value.trim();
    const agenciaId = Number(document.getElementById('ntAgencia').value);
    const hora = document.getElementById('ntHora').value;
    const marca = document.getElementById('ntMarca').value;
    const errEl = document.getElementById('ntError');
    errEl.style.display = 'none';

    if (!nombre || !agenciaId) {
      errEl.textContent = 'Rellena al menos el nombre y la agencia.';
      errEl.style.display = 'block';
      return;
    }

    const maxOrden = Math.max(0, ...tiendasCache.filter(t => t.agencia_id === agenciaId).map(t => t.orden));

    try {
      const { error } = await sb.from('tiendas').insert({
        nombre, agencia_id: agenciaId, hora_prevista: hora || null, marca, orden: maxOrden + 1
      });
      if (error) throw error;
      formNuevaTienda.style.display = 'none';
      document.getElementById('ntNombre').value = '';
      document.getElementById('ntHora').value = '';
      cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error creando tienda:', err);
      errEl.textContent = 'No se pudo crear la tienda.';
      errEl.style.display = 'block';
    }
  });

  let tiendasCargadasYa = false;
  document.querySelectorAll('[data-view="config-tiendas"]').forEach(el => {
    el.addEventListener('click', () => {
      if (!tiendasCargadasYa) { tiendasCargadasYa = true; cargarAgenciasYTiendas(); }
    });
  });

  // ---------------------------------------------------------------
