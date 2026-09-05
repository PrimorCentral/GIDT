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
            <b>${escapeHtml(ag.nombre)}</b>
            <span style="font-size:12px; color:var(--ink-soft);">${(ag.emails||[]).length} destinatario${(ag.emails||[]).length===1?'':'s'}</span>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:.3px; margin-bottom:4px;">Nombre comercial</label>
            <input type="text" class="form-input" data-nombre-comercial
                   value="${escapeHtml(ag.nombre_comercial || '')}"
                   placeholder="Ej: DHL PARCEL IBERIA, S.L.U">
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

        const inputComercial = card.querySelector('[data-nombre-comercial]');
        let timerComercial;
        const guardarComercial = () => guardarNombreComercialAgencia(agenciaId, inputComercial.value.trim());
        inputComercial.addEventListener('input', () => { clearTimeout(timerComercial); timerComercial = setTimeout(guardarComercial, 700); });
        inputComercial.addEventListener('blur', () => { clearTimeout(timerComercial); guardarComercial(); });

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

  async function guardarNombreComercialAgencia(agenciaId, valor) {
    try {
      const { error } = await sb.from('agencias').update({ nombre_comercial: valor || null }).eq('id', agenciaId);
      if (error) throw error;
    } catch (err) {
      console.error('Error guardando nombre comercial:', err);
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

  let emailsCargadosYa = false;
  document.querySelectorAll('[data-view="config-emails"]').forEach(el => {
    el.addEventListener('click', () => {
      if (!emailsCargadosYa) { emailsCargadosYa = true; cargarEmailsAgencias(); }
    });
  });

  // ---------------------------------------------------------------
