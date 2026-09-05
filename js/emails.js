  // Emails por agencia
  // ---------------------------------------------------------------
  async function cargarEmailsAgencias() {
    const cont = document.getElementById('listaEmailsAgencias');
    cont.innerHTML = '<div class="card"><div class="empty"><p>Cargando…</p></div></div>';
    try {
      const { data, error } = await sb.from('agencias').select('id, nombre, nombre_comercial, emails, orden').order('orden');
      if (error) throw error;

      cont.innerHTML = data.map(ag => `
        <div class="email-card" data-agencia-email="${ag.id}">
          <div class="cabecera">
            <div class="email-card-titulos">
              <b>${escapeHtml(ag.nombre)}</b>
              <div class="email-comercial-linea" data-comercial-linea>
                ${ag.nombre_comercial
                  ? `<span class="email-comercial-texto">Nombre comercial: ${escapeHtml(ag.nombre_comercial)}</span><button type="button" class="mini-btn" data-editar-comercial title="Editar nombre comercial">✏️</button>`
                  : `<button type="button" class="email-comercial-anadir" data-editar-comercial>+ Añadir nombre comercial</button>`
                }
              </div>
            </div>
            <span style="font-size:12px; color:var(--ink-soft); white-space:nowrap;">${(ag.emails||[]).length} destinatario${(ag.emails||[]).length===1?'':'s'}</span>
          </div>
          <div class="email-chips">
            ${(ag.emails||[]).map(em => `
              <span class="email-chip">${escapeHtml(em)}<button data-quitar="${escapeHtml(em)}">✕</button></span>
            `).join('') || '<span style="font-size:12.5px; color:var(--ink-soft);">Sin emails configurados</span>'}
          </div>
          <div class="email-add-row">
            <input type="email" class="form-input" placeholder="nuevo@email.com" data-input-email>
            <button class="btn" data-anadir>Añadir</button>
          </div>
        </div>
      `).join('');

      cont.querySelectorAll('[data-agencia-email]').forEach(card => {
        const agenciaId = Number(card.dataset.agenciaEmail);
        const nombreAgencia = card.querySelector('b').textContent;

        card.querySelector('[data-editar-comercial]').addEventListener('click', () => editarNombreComercialAgencia(agenciaId, nombreAgencia));

        card.querySelectorAll('[data-quitar]').forEach(btn => {
          btn.addEventListener('click', () => actualizarEmailsAgencia(agenciaId, card, 'quitar', btn.dataset.quitar));
        });

        const input = card.querySelector('[data-input-email]');
        const btnAdd = card.querySelector('[data-anadir]');
        const anadir = () => {
          const val = input.value.trim();
          if (!val) return;
          actualizarEmailsAgencia(agenciaId, card, 'anadir', val);
        };
        btnAdd.addEventListener('click', anadir);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') anadir(); });
      });
    } catch (err) {
      console.error('Error cargando emails de agencias:', err);
      cont.innerHTML = '<div class="card"><div class="empty"><p style="color:var(--grave);">Error al cargar.</p></div></div>';
    }
  }

  async function editarNombreComercialAgencia(agenciaId, nombreAgencia) {
    const { data } = await sb.from('agencias').select('nombre_comercial').eq('id', agenciaId).maybeSingle();
    const valorActual = data?.nombre_comercial || '';

    const nuevo = await modalPrompt('', {
      titulo: `Nombre comercial para ${nombreAgencia}`,
      placeholder: 'Ej: DHL PARCEL IBERIA, S.L.U',
      valorInicial: valorActual
    });
    if (nuevo === null) return; // cancelado

    try {
      const { error } = await sb.from('agencias').update({ nombre_comercial: nuevo.trim() || null }).eq('id', agenciaId);
      if (error) throw error;
      cargarEmailsAgencias();
    } catch (err) {
      console.error('Error guardando nombre comercial:', err);
      await modalAlert('No se pudo guardar el nombre comercial.', { titulo: 'Error' });
    }
  }

  async function actualizarEmailsAgencia(agenciaId, cardEl, accion, email) {
    try {
      const { data, error } = await sb.from('agencias').select('emails').eq('id', agenciaId).single();
      if (error) throw error;

      let emails = data.emails || [];
      if (accion === 'anadir') {
        if (!emails.includes(email)) emails = [...emails, email];
      } else {
        emails = emails.filter(e => e !== email);
      }

      const { error: e2 } = await sb.from('agencias').update({ emails }).eq('id', agenciaId);
      if (e2) throw e2;

      cargarEmailsAgencias();
    } catch (err) {
      console.error('Error actualizando emails:', err);
      await modalAlert('No se pudo actualizar el email.', { titulo: 'Error' });
    }
  }

  // ---------------- Nueva agencia ----------------

  function parsearEmailsTexto(texto) {
    return Array.from(new Set(
      (texto || '')
        .split(/[\n,;]+/)
        .map(e => e.trim())
        .filter(Boolean)
    ));
  }

  function abrirModalNuevaAgencia() {
    document.getElementById('naNombre').value = '';
    document.getElementById('naNombreComercial').value = '';
    document.getElementById('naEmails').value = '';
    document.getElementById('naError').style.display = 'none';
    document.getElementById('nuevaAgenciaModalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('naNombre').focus(), 30);
  }

  function cerrarModalNuevaAgencia() {
    document.getElementById('nuevaAgenciaModalOverlay').classList.remove('show');
  }

  async function guardarNuevaAgencia() {
    const nombre = document.getElementById('naNombre').value.trim();
    const nombreComercial = document.getElementById('naNombreComercial').value.trim();
    const emails = parsearEmailsTexto(document.getElementById('naEmails').value);
    const errEl = document.getElementById('naError');
    errEl.style.display = 'none';

    if (!nombre) {
      errEl.textContent = 'El nombre de la agencia es obligatorio.';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('btnGuardarNuevaAgencia');
    btn.disabled = true;
    try {
      const { data: maxOrden } = await sb.from('agencias').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
      const siguienteOrden = (maxOrden?.orden || 0) + 1;

      const { error } = await sb.from('agencias').insert({
        nombre,
        nombre_comercial: nombreComercial || null,
        emails,
        orden: siguienteOrden,
        activo: true
      });
      if (error) throw error;

      cerrarModalNuevaAgencia();
      cargarEmailsAgencias();
      if (typeof cargarAgenciasYTiendas === 'function') cargarAgenciasYTiendas();
    } catch (err) {
      console.error('Error creando la agencia:', err);
      errEl.textContent = 'No se pudo crear la agencia. ¿Puede que ya exista una con ese nombre?';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById('btnNuevaAgencia')?.addEventListener('click', abrirModalNuevaAgencia);
  document.getElementById('btnCerrarNuevaAgencia')?.addEventListener('click', cerrarModalNuevaAgencia);
  document.getElementById('btnCancelarNuevaAgencia')?.addEventListener('click', cerrarModalNuevaAgencia);
  document.getElementById('btnGuardarNuevaAgencia')?.addEventListener('click', guardarNuevaAgencia);
  document.getElementById('nuevaAgenciaModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'nuevaAgenciaModalOverlay') cerrarModalNuevaAgencia();
  });

  let emailsCargadosYa = false;
  document.querySelectorAll('[data-view="config-emails"]').forEach(el => {
    el.addEventListener('click', () => {
      if (!emailsCargadosYa) { emailsCargadosYa = true; cargarEmailsAgencias(); }
    });
  });

  // ---------------------------------------------------------------
