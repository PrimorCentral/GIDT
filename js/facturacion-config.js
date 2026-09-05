// ---------------------------------------------------------------
// Configuración: destinatarios de Facturación (usados al enviar un
// albarán desde el Panel siniestros)
// ---------------------------------------------------------------
// Requiere: sb, escapeHtml, modalAlert   (supabase-client.js / ui-modal.js)
// Vive dentro de la misma pestaña "Configuración → Emails", debajo de
// las tarjetas por agencia (donde ya se edita el nombre comercial, en
// js/emails.js).

async function cargarEmailsFacturacion() {
  const cont = document.getElementById('listaEmailsFacturacion');
  if (!cont) return;
  cont.innerHTML = '<div class="card"><div class="empty"><p>Cargando…</p></div></div>';
  try {
    const { data, error } = await sb.from('facturacion_emails').select('id, email').eq('activo', true).order('id');
    if (error) throw error;

    cont.innerHTML = `
      <div class="email-card">
        <div class="email-chips">
          ${data.map(r => `
            <span class="email-chip">${escapeHtml(r.email)}<button data-quitar-facturacion="${r.id}">✕</button></span>
          `).join('') || '<span style="font-size:12.5px; color:var(--ink-soft);">Sin destinatarios configurados</span>'}
        </div>
        <div class="email-add-row">
          <input type="email" class="form-input" id="inputNuevoEmailFacturacion" placeholder="facturacion@ejemplo.com">
          <button class="btn" id="btnAnadirEmailFacturacion">Añadir</button>
        </div>
      </div>`;

    cont.querySelectorAll('[data-quitar-facturacion]').forEach(btn => {
      btn.addEventListener('click', () => quitarEmailFacturacion(Number(btn.dataset.quitarFacturacion)));
    });

    const input = document.getElementById('inputNuevoEmailFacturacion');
    const btnAdd = document.getElementById('btnAnadirEmailFacturacion');
    const anadir = () => { const val = input.value.trim(); if (val) anadirEmailFacturacion(val); };
    btnAdd.addEventListener('click', anadir);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') anadir(); });
  } catch (err) {
    console.error('Error cargando emails de facturación:', err);
    cont.innerHTML = '<div class="card"><div class="empty"><p style="color:var(--grave);">Error al cargar.</p></div></div>';
  }
}

async function anadirEmailFacturacion(email) {
  try {
    const { error } = await sb.from('facturacion_emails').insert({ email });
    if (error) throw error;
    cargarEmailsFacturacion();
  } catch (err) {
    console.error('Error añadiendo email de facturación:', err);
    await modalAlert('No se pudo añadir ese destinatario (puede que ya exista).', { titulo: 'Error' });
  }
}

async function quitarEmailFacturacion(id) {
  try {
    const { error } = await sb.from('facturacion_emails').delete().eq('id', id);
    if (error) throw error;
    cargarEmailsFacturacion();
  } catch (err) {
    console.error('Error quitando email de facturación:', err);
  }
}

let facturacionConfigCargada = false;
document.querySelectorAll('[data-view="config-emails"]').forEach(el => {
  el.addEventListener('click', () => {
    if (!facturacionConfigCargada) {
      facturacionConfigCargada = true;
      cargarEmailsFacturacion();
    }
  });
});
