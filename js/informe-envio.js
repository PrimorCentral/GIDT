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
  const th = 'text-align:left; padding:4px 12px; background:#f8fafc; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.3px; border-bottom:1px solid #e2e8f0;';
  const td = 'padding:2px 12px; border-bottom:1px solid #f1f5f9; font-size:12px; color:#475569; line-height:1.15;';

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

// Motivos que indican que una incidencia aún está pendiente de revisar/confirmar
// (no son un tipo de incidencia en sí, sino un estado provisional).
const MOTIVOS_SIN_REVISAR = ['RETRASO PDTE CONFIRMAR', 'REVISANDO POSIBLE INCIDENCIA'];

// Recorre las filas {tienda, inc} de los grupos que se van a enviar y devuelve
// las que tienen algún motivo aún "sin revisar".
function listarIncidenciasSinRevisar(grupos) {
  const items = [];
  grupos.forEach(g => {
    g.filas.forEach(({ tienda, inc }) => {
      if ((inc.motivo || []).some(m => MOTIVOS_SIN_REVISAR.includes(m))) {
        items.push({ agencia: g.agenciaNombre, tienda: tienda.nombre, hora: tienda.hora_prevista ? tienda.hora_prevista.slice(0, 5) : '—' });
      }
    });
  });
  return items;
}

// Modal de confirmación de envío: lista de agencias/incidencias, agencias
// omitidas por falta de email, aviso de reenvío y aviso de incidencias sin
// revisar. Devuelve una promesa que resuelve a true (enviar) o false (cancelar).
function mostrarModalEnvioInforme({ conEmails, sinEmails, reenvio, sinRevisar }) {
  return new Promise(resolve => {
    const overlay        = document.getElementById('envioInformeModalOverlay');
    const sub             = document.getElementById('envioModalSub');
    const lista           = document.getElementById('envioListaAgencias');
    const alertaPend      = document.getElementById('envioAlertaPendientes');
    const alertaPendTexto = document.getElementById('envioAlertaPendientesTexto');
    const alertaPendLista = document.getElementById('envioAlertaPendientesLista');
    const alertaReenvio   = document.getElementById('envioAlertaReenvio');
    const alertaOmitidas  = document.getElementById('envioAlertaOmitidas');
    const alertaOmitTexto = document.getElementById('envioAlertaOmitidasTexto');
    const btnOk           = document.getElementById('envioModalBtnOk');
    const btnCancel       = document.getElementById('envioModalBtnCancel');
    const btnCerrar       = document.getElementById('btnCerrarEnvioModal');

    const totalInc = conEmails.reduce((s, g) => s + g.filas.length, 0);
    sub.textContent = `${totalInc} incidencia${totalInc === 1 ? '' : 's'} en ${conEmails.length} agencia${conEmails.length === 1 ? '' : 's'}.`;

    lista.innerHTML = conEmails.map(g => {
      const pendientesAg = g.filas.filter(({ inc }) => (inc.motivo || []).some(m => MOTIVOS_SIN_REVISAR.includes(m))).length;
      return `
        <div class="envio-agencia-row">
          <b>${escapeHtml(g.agenciaNombre)}</b>
          <span class="envio-agencia-count${pendientesAg ? ' tiene-pendientes' : ''}">
            ${g.filas.length} incidencia${g.filas.length === 1 ? '' : 's'}${pendientesAg ? ` · ${pendientesAg} sin revisar` : ''}
          </span>
        </div>`;
    }).join('');

    if (sinRevisar.length) {
      alertaPendTexto.textContent = `${sinRevisar.length} incidencia${sinRevisar.length === 1 ? '' : 's'} ${sinRevisar.length === 1 ? 'tiene' : 'tienen'} el motivo "Retraso Pdte Confirmar" o "Revisando posible incidencia". Si envías ahora, se incluirán tal cual en el informe.`;
      alertaPendLista.innerHTML = sinRevisar.map(it => `<li><b>${escapeHtml(it.tienda)}</b> (${escapeHtml(it.agencia)}, ${it.hora})</li>`).join('');
      alertaPend.style.display = '';
      btnOk.textContent = '⚠️ Enviar de todos modos';
    } else {
      alertaPend.style.display = 'none';
      alertaPendLista.innerHTML = '';
      btnOk.textContent = '✉️ Enviar informe';
    }

    alertaReenvio.style.display = reenvio ? '' : 'none';

    if (sinEmails.length) {
      alertaOmitTexto.textContent = `${sinEmails.map(g => g.agenciaNombre).join(', ')} (sin emails configurados en Configuración → Emails por agencia).`;
      alertaOmitidas.style.display = '';
    } else {
      alertaOmitidas.style.display = 'none';
    }

    overlay.classList.add('show');

    const cerrar = (resultado) => {
      overlay.classList.remove('show');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      btnCerrar.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      resolve(resultado);
    };
    const onOk = () => cerrar(true);
    const onCancel = () => cerrar(false);
    const onOverlay = (e) => { if (e.target === overlay) onCancel(); };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    btnCerrar.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
  });
}

// Modal de carga (spinner) que se muestra mientras se están enviando los
// correos, para que quede claro que el envío está en curso.
function mostrarCargandoEnvio(texto) {
  const overlay = document.getElementById('cargandoEnvioOverlay');
  actualizarCargandoEnvio(texto);
  overlay?.classList.add('show');
}
function actualizarCargandoEnvio(texto) {
  const textoEl = document.getElementById('cargandoEnvioTexto');
  if (textoEl) textoEl.textContent = texto || 'Enviando informe…';
}
function ocultarCargandoEnvio() {
  document.getElementById('cargandoEnvioOverlay')?.classList.remove('show');
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

  const ok = await mostrarModalEnvioInforme({
    conEmails,
    sinEmails,
    reenvio: !!informeHoyCache.informe_enviado,
    sinRevisar: listarIncidenciasSinRevisar(conEmails)
  });
  if (!ok) return;

  const nombreHoja = fechaEs(informeHoyCache.fecha);
  const resultados = [];
  let errorGuardandoEstado = null;

  mostrarCargandoEnvio('Enviando informe…');
  try {
    let i = 0;
    for (const g of conEmails) {
      i++;
      actualizarCargandoEnvio(`Enviando a ${g.agenciaNombre}… (${i}/${conEmails.length})`);
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

    if (resultados.some(r => r.ok)) {
      actualizarCargandoEnvio('Actualizando estado del informe…');
      try {
        const { data, error } = await sb.from('informes_diarios').update({
          estado: 'EMITIDO',
          informe_enviado: true,
          informe_enviado_en: new Date().toISOString(),
          informe_enviado_por: sesionActual?.nombre || sesionActual?.usuario || null
        }).eq('id', informeHoyCache.id).select().single();
        if (error) throw error;
        informeHoyCache = data;
      } catch (err) {
        console.error('Error marcando informe como enviado:', err);
        errorGuardandoEstado = err.message || 'Error desconocido';
      }
    }
  } finally {
    ocultarCargandoEnvio();
  }

  const exitosos = resultados.filter(r => r.ok);
  const fallidos = resultados.filter(r => !r.ok);

  renderBotonEnviarInforme();

  let mensajeFinal = `Enviado correctamente a ${exitosos.length} agencia${exitosos.length === 1 ? '' : 's'}.`;
  if (fallidos.length) {
    mensajeFinal += `\n\nFallos:\n` + fallidos.map(f => `• ${f.agencia}: ${f.error}`).join('\n');
  }
  if (errorGuardandoEstado) {
    mensajeFinal += `\n\n⚠️ Los correos se enviaron, pero no se pudo actualizar el estado del informe en la base de datos: ${errorGuardandoEstado}`;
  }
  await modalAlert(mensajeFinal, { titulo: (fallidos.length || errorGuardandoEstado) ? 'Envío con errores' : '✅ Informe enviado' });
}

document.getElementById('btnEnviarInforme')?.addEventListener('click', enviarInformeDelDia);
