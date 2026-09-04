// ---------------------------------------------------------------
// Envío del informe diario de incidencias a las agencias
// ---------------------------------------------------------------
// Requiere que ya estén cargados/definidos (por orden de <script> en index.html):
//   - sb, escapeHtml, modalAlert, modalConfirm      (supabase-client.js / ui-modal.js)
//   - enviarEmail()                                  (email-service.js)
//   - fechaEs()                                       (email-plantillas.js)
//   - informeHoyCache, incidenciasHoyCache            (informe-hoy.js)
//   - agenciasCache, tiendasCache                     (tiendas.js)
//   - sesionActual                                    (siniestros.js / auth.js)

// Agrupa las incidencias marcadas de hoy por agencia, usando tiendasCache
// para saber a qué agencia pertenece cada tienda.
function construirGruposInformeHoy() {
  const grupos = {}; // agencia_id -> { agenciaId, agenciaNombre, filas: [{tienda, inc}] }

  incidenciasHoyCache
    .filter(inc => inc.marcada)
    .forEach(inc => {
      const tienda = tiendasCache.find(t => t.id === inc.tienda_id);
      if (!tienda) return;

      const agId = tienda.agencia_id;
      if (!grupos[agId]) {
        const agenciaInfo = agenciasCache.find(a => a.id === agId);
        grupos[agId] = { agenciaId: agId, agenciaNombre: agenciaInfo?.nombre || 'Sin agencia', filas: [] };
      }
      grupos[agId].filas.push({ tienda, inc });
    });

  const lista = Object.values(grupos);
  lista.forEach(g => g.filas.sort((a, b) => (a.tienda.hora_prevista || '').localeCompare(b.tienda.hora_prevista || '')));
  return lista;
}

// Construye la tabla HTML (con estilos inline, para que se vea bien en clientes de correo)
// a partir de las filas {tienda, inc} de una agencia.
function tablaHtmlIncidencias(filas) {
  const th = 'text-align:left; padding:6px 12px; background:#f8fafc; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.3px; border-bottom:1px solid #e2e8f0;';
  const td = 'padding:4px 12px; border-bottom:1px solid #f1f5f9; font-size:13px; color:#475569; line-height:1.35;';

  const filasHtml = filas.map(({ tienda, inc }, idx) => {
    const hora = tienda.hora_prevista ? tienda.hora_prevista.slice(0, 5) : '—';
    const motivos = (inc.motivo || []).map(m => escapeHtml(m)).join('<br>');
    const fondoFila = idx % 2 === 1 ? 'background:#f4f6f8;' : '';

    return `
      <tr style="${fondoFila}">
        <td style="${td} white-space:nowrap; vertical-align:top;">${hora}</td>
        <td style="${td} color:#1e293b; font-weight:600; vertical-align:top;">${escapeHtml(tienda.nombre)}</td>
        <td style="${td} vertical-align:top;">${motivos}</td>
        <td style="${td} vertical-align:top;">${escapeHtml(inc.observaciones || '')}</td>
      </tr>`;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; font-family:Arial, sans-serif; margin:20px 0;">
      <thead>
        <tr>
          <th style="${th}">Hora</th>
          <th style="${th}">Tienda</th>
          <th style="${th}">Motivo</th>
          <th style="${th}">Observaciones</th>
        </tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

// Genera { subject, html } para el correo de una agencia, usando la plantilla acordada.
function plantillaInformeAgencia(agenciaNombre, nombreHoja, tabla) {
  const nombreAgenciaUpper = escapeHtml(agenciaNombre.toUpperCase());

  const html = `
    <p>Buenas,</p>
    <p>
      A continuación, les indicamos las incidencias producidas en el reparto del <b>${nombreHoja}</b> por la agencia <b>${nombreAgenciaUpper}</b>:
    </p>
    ${tabla}
    <p>
      Todas las horas de entrega mostradas en este correo corresponden al horario peninsular.
    </p>
    <p>
      Quedamos a su disposición para cualquier aclaración adicional que consideren necesaria.
    </p>
    <p style="font-size: 11px; color: #9ca3af; font-style: italic; margin-bottom: 20px;">
      Informe generado automáticamente por el sistema GIDT.
    </p>
    <p>
      Atentamente,<br>
      <b>Departamento de Transporte</b>
    </p>
    <p>
      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" alt="PRIMOR" width="150">
    </p>`;

  const subject = `INCIDENCIAS EN EL REPARTO DE ${agenciaNombre.toUpperCase()} – ${nombreHoja}`;

  return { subject, html };
}

// Pinta el estado (badge) de envío del informe de hoy junto al botón.
function renderBotonEnviarInforme() {
  const badge = document.getElementById('informeEnviadoBadge');
  if (!badge) return;

  if (informeHoyCache?.informe_enviado) {
    const hora = informeHoyCache.informe_enviado_en
      ? new Date(informeHoyCache.informe_enviado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '';
    badge.textContent = `✅ Enviado${hora ? ' a las ' + hora : ''}`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// Handler principal: agrupa, confirma y envía el informe de hoy a todas las agencias con incidencias.
async function enviarInformeDelDia() {
  if (!informeHoyCache) {
    await modalAlert('No hay informe abierto para hoy.', { titulo: 'Sin informe' });
    return;
  }

  const grupos = construirGruposInformeHoy();
  if (!grupos.length) {
    await modalAlert('No hay incidencias registradas hoy que enviar.', { titulo: 'Nada que enviar' });
    return;
  }

  // Emails actualizados de las agencias (frescos, por si se han editado hace poco)
  let agenciasEmails = [];
  try {
    const { data, error } = await sb.from('agencias').select('id, nombre, emails');
    if (error) throw error;
    agenciasEmails = data || [];
  } catch (err) {
    console.error('Error cargando emails de agencias:', err);
    await modalAlert('No se pudieron cargar los emails de las agencias.', { titulo: 'Error' });
    return;
  }

  const conEmails = [];
  const sinEmails = [];
  grupos.forEach(g => {
    const ag = agenciasEmails.find(a => a.id === g.agenciaId);
    const emails = ag?.emails || [];
    if (emails.length) conEmails.push({ ...g, emails });
    else sinEmails.push(g);
  });

  if (!conEmails.length) {
    await modalAlert('Ninguna de las agencias con incidencias tiene emails configurados. Añádelos en Configuración → Emails por agencia.', { titulo: 'Sin destinatarios' });
    return;
  }

  const resumen = conEmails.map(g => `• ${g.agenciaNombre} (${g.filas.length} incidencia${g.filas.length === 1 ? '' : 's'})`).join('\n');
  const avisoOmitidas = sinEmails.length
    ? `\n\nNo se enviará a (sin emails configurados): ${sinEmails.map(g => g.agenciaNombre).join(', ')}.`
    : '';
  const avisoReenvio = informeHoyCache.informe_enviado
    ? '\n\n⚠️ El informe de hoy ya se había enviado antes. Esto lo volverá a enviar.'
    : '';

  const ok = await modalConfirm(
    `Se enviará el informe de incidencias a:\n\n${resumen}${avisoOmitidas}${avisoReenvio}`,
    { titulo: 'Enviar informe del día', textoOk: 'Enviar' }
  );
  if (!ok) return;

  const nombreHoja = fechaEs(informeHoyCache.fecha);
  const resultados = [];

  for (const g of conEmails) {
    const tabla = tablaHtmlIncidencias(g.filas);
    const { subject, html } = plantillaInformeAgencia(g.agenciaNombre, nombreHoja, tabla);
    try {
      await enviarEmail({ to: g.emails, subject, html });
      resultados.push({ agencia: g.agenciaNombre, ok: true });
    } catch (err) {
      console.error(`Error enviando informe a ${g.agenciaNombre}:`, err);
      resultados.push({ agencia: g.agenciaNombre, ok: false, error: err.message });
    }
  }

  const exitosos = resultados.filter(r => r.ok);
  const fallidos = resultados.filter(r => !r.ok);

  if (exitosos.length) {
    try {
      const { data, error } = await sb.from('informes_diarios').update({
        informe_enviado: true,
        informe_enviado_en: new Date().toISOString(),
        informe_enviado_por: sesionActual?.nombre || sesionActual?.usuario || null
      }).eq('id', informeHoyCache.id).select().single();
      if (!error) informeHoyCache = data;
    } catch (err) {
      console.error('Error marcando informe como enviado:', err);
    }
  }

  renderBotonEnviarInforme();

  let mensajeFinal = `Enviado correctamente a ${exitosos.length} agencia${exitosos.length === 1 ? '' : 's'}.`;
  if (fallidos.length) {
    mensajeFinal += `\n\nFallos:\n` + fallidos.map(f => `• ${f.agencia}: ${f.error}`).join('\n');
  }
  await modalAlert(mensajeFinal, { titulo: fallidos.length ? 'Envío con errores' : 'Informe enviado' });
}

document.getElementById('btnEnviarInforme')?.addEventListener('click', enviarInformeDelDia);
