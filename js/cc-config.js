// ---------------------------------------------------------------
// Configuración: CC Transporte (direcciones que van siempre en copia
// en TODOS los correos que envía la app: roturas, facturación,
// informes diarios a agencias, reportes mensuales, etc.)
// ---------------------------------------------------------------
// Requiere: sb, escapeHtml, modalAlert   (supabase-client.js / ui-modal.js)
// Vive dentro de la misma pestaña "Configuración → Emails", debajo de
// las tarjetas de Facturación (js/facturacion-config.js).
//
// El envío en sí se hace en js/email-service.js (enviarEmail), que
// añade estas direcciones como CC en cada correo sin que cada sitio
// que llama a enviarEmail() tenga que preocuparse de ello.

async function cargarEmailsCC() {
  const cont = document.getElementById('listaEmailsCC');
  if (!cont) return;
  cont.innerHTML = '<div class="card"><div class="empty"><p>Cargando…</p></div></div>';
  try {
    const { data, error } = await sb.from('cc_global_emails').select('id, email').eq('activo', true).order('id');
    if (error) throw error;

    cont.innerHTML = `
      <div class="email-card">
        <div class="email-chips">
          ${data.map(r => `
            <span class="email-chip">${escapeHtml(r.email)}<button data-quitar-cc="${r.id}">✕</button></span>
          `).join('') || '<span style="font-size:12.5px; color:var(--ink-soft);">Sin direcciones configuradas</span>'}
        </div>
        <div class="email-add-row">
          <input type="email" class="form-input" id="inputNuevoEmailCC" placeholder="transporte@primor.eu">
          <button class="btn" id="btnAnadirEmailCC">Añadir</button>
        </div>
      </div>`;

    cont.querySelectorAll('[data-quitar-cc]').forEach(btn => {
      btn.addEventListener('click', () => quitarEmailCC(Number(btn.dataset.quitarCc)));
    });

    const input = document.getElementById('inputNuevoEmailCC');
    const btnAdd = document.getElementById('btnAnadirEmailCC');
    const anadir = () => { const val = input.value.trim(); if (val) anadirEmailCC(val); };
    btnAdd.addEventListener('click', anadir);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') anadir(); });
  } catch (err) {
    console.error('Error cargando el CC global:', err);
    cont.innerHTML = '<div class="card"><div class="empty"><p style="color:var(--grave);">Error al cargar.</p></div></div>';
  }
}

async function anadirEmailCC(email) {
  try {
    const { error } = await sb.from('cc_global_emails').insert({ email });
    if (error) throw error;
    cargarEmailsCC();
  } catch (err) {
    console.error('Error añadiendo email al CC global:', err);
    await modalAlert('No se pudo añadir esa dirección (puede que ya exista).', { titulo: 'Error' });
  }
}

async function quitarEmailCC(id) {
  try {
    const { error } = await sb.from('cc_global_emails').delete().eq('id', id);
    if (error) throw error;
    cargarEmailsCC();
  } catch (err) {
    console.error('Error quitando email del CC global:', err);
  }
}

let ccConfigCargada = false;
document.querySelectorAll('[data-view="config-emails"]').forEach(el => {
  el.addEventListener('click', () => {
    if (!ccConfigCargada) {
      ccConfigCargada = true;
      cargarEmailsCC();
    }
  });
});
