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
      // Se usa la tienda "efectiva" de hoy: si tiene un cambio puntual de
      // hora y/o agencia (desde "Utilidades"), el envío respeta ese cambio
      // solo para el informe de hoy.
      const tienda = typeof tiendaEfectivaHoy === 'function' ? tiendaEfectivaHoy(inc.tienda_id) : tiendasCache.find(t => t.id === inc.tienda_id);
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

// Color de FILA COMPLETA según la gravedad dominante de los motivos de esa
// incidencia (como en la tabla antigua): grave = fila roja sólida con texto
// blanco, moderado = fila azul clara, leve = fila blanca normal, y
// "pendiente" (RETRASO PDTE CONFIRMAR / REVISANDO POSIBLE INCIDENCIA, sin
// nivel asignado en Configuración → Gravedad de motivos) = fila rosa/salmón,
// para que también destaque en vez de quedar igual que una fila normal.
const FILA_ESTILO = {
  grave:     { bg: '#D12B0D', texto: '#ffffff', motivo: '#ffffff' },
  moderado:  { bg: '#E6F0FE', texto: '#1e293b', motivo: '#1B6DE0' },
  pendiente: { bg: '#FBE3E4', texto: '#1e293b', motivo: '#B23A28' },
  leve:      { bg: '#ffffff', texto: '#1e293b', motivo: '#1e293b' }
};

// De varios motivos en la misma incidencia, el nivel que manda para el
// color de la fila es el más grave de todos los presentes (mismo criterio
// que ya usa el resto de la app — ver severidad() en codigos-informe.js).
function nivelDominanteFila(motivos) {
  const niveles = motivos.map(m => (typeof nivelDeMotivo === 'function' ? nivelDeMotivo(m) : null));
  if (niveles.includes('grave')) return 'grave';
  if (niveles.includes('moderado')) return 'moderado';
  if (niveles.includes('leve')) return 'leve';
  return 'pendiente'; // sin nivel asignado (motivos "pendientes de revisar")
}

// Si el texto de Observaciones lleva una hora (p. ej. "10:00", "10:00h",
// "10:00H"), calcula los minutos de diferencia contra la hora prevista de
// entrega de la tienda y devuelve el aviso "| ⏳ N MIN RETRASO" para
// añadir detrás del texto. Si no hay hora en el texto, o la hora
// encontrada es igual o anterior a la prevista (no hay retraso), no
// añade nada. `colorTexto` es el color de la fila (para que en las filas
// rojas el aviso se lea en blanco, en vez de rojo sobre rojo).
function avisoRetrasoObservaciones(observaciones, horaPrevista, colorFila) {
  if (!observaciones || !horaPrevista) return '';
  const match = observaciones.match(/(\d{1,2}):(\d{2})\s*h?\b/i);
  if (!match) return '';

  const minObs = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const [hp, mp] = horaPrevista.split(':').map(Number);
  const minPrevista = hp * 60 + mp;
  const diff = minObs - minPrevista;
  if (diff <= 0) return '';

  const color = colorFila === '#ffffff' ? '#ffffff' : '#D12B0D';
  return ` <span style="display:inline-block; white-space:nowrap; font-weight:800; color:${color};">| ⏳ ${diff} MIN RETRASO</span>`;
}

// Construye la tabla HTML (con estilos inline, para que se vea bien en clientes de correo)
// a partir de las filas {tienda, inc} de una agencia.
function tablaHtmlIncidencias(filas) {
  const th = 'text-align:center; padding:5px 12px; background:#f1f5f9; color:#1e293b; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.3px; border:1px solid #cbd5e1; line-height:17px; mso-line-height-rule:exactly;';
  const td = 'text-align:center; padding:0px 12px; border:1px solid #cbd5e1; font-size:13px;';

  const filasHtml = filas.map(({ tienda, inc }) => {
    const hora = tienda.hora_prevista ? tienda.hora_prevista.slice(0, 5) : '—';
    // Solo los motivos "principales" (p. ej. "FALTAS", o los pendientes
    // "REVISANDO POSIBLE INCIDENCIA" / "RETRASO PDTE CONFIRMAR"), nunca la
    // etiqueta de submotivo interna que se guarda junto a él (p. ej.
    // "ROBO/FALTAS DE SELECTIVO") — esa es solo para elegir el código de
    // la leyenda del Reporte mensual, no debe verse en el correo.
    // (Antes se comprobaba contra CODIGOS_INFORME, pero esa lista solo
    // recoge los motivos "cerrados" del Reporte mensual y no incluye los
    // motivos pendientes, así que una incidencia con solo un motivo
    // pendiente salía con el Motivo vacío en el correo, y una con varios
    // motivos perdía el pendiente y solo mostraba el resto.)
    const submotivosInternos = CODIGOS_INFORME.filter(c => c.submotivo).map(c => c.submotivo);
    const motivosPrincipales = (inc.motivo || []).filter(m => !submotivosInternos.includes(m));
    const nivelFila = nivelDominanteFila(motivosPrincipales);
    const estilo = FILA_ESTILO[nivelFila];
    const motivosTexto = motivosPrincipales.map(m => escapeHtml(m)).join('<br>');
    const obsTexto = escapeHtml(inc.observaciones || '');
    const avisoRetraso = avisoRetrasoObservaciones(inc.observaciones, tienda.hora_prevista, estilo.texto);

    return `
      <tr style="background:${estilo.bg};">
        <td align="center" valign="middle" style="${td} white-space:nowrap;"><p style="margin:0; mso-margin-top-alt:0; mso-margin-bottom-alt:0; mso-line-height-rule:exactly; line-height:22px; color:${estilo.texto};">${hora}</p></td>
        <td align="center" valign="middle" style="${td} white-space:nowrap;"><p style="margin:0; mso-margin-top-alt:0; mso-margin-bottom-alt:0; mso-line-height-rule:exactly; line-height:22px; font-weight:700; color:${estilo.texto};">${escapeHtml(tienda.nombre)}</p></td>
        <td align="center" valign="middle" style="${td} white-space:nowrap;"><p style="margin:0; mso-margin-top-alt:0; mso-margin-bottom-alt:0; mso-line-height-rule:exactly; line-height:22px; font-weight:800; text-transform:uppercase; color:${estilo.motivo};">${motivosTexto}</p></td>
        <td align="center" valign="middle" style="${td}"><p style="margin:0; mso-margin-top-alt:0; mso-margin-bottom-alt:0; mso-line-height-rule:exactly; line-height:22px; color:${estilo.texto};">${obsTexto}${avisoRetraso}</p></td>
      </tr>`;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; font-family:Arial, sans-serif; margin:20px 0;">
      <thead>
        <tr>
          <th width="55" align="center" valign="middle" style="${th}">Hora</th>
          <th width="170" align="center" valign="middle" style="${th}">Tienda</th>
          <th width="240" align="center" valign="middle" style="${th}">Motivo</th>
          <th align="center" valign="middle" style="${th}">Observaciones</th>
        </tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

// Franja de resumen ("N incidencias registradas en el reparto de hoy")
// que se muestra justo encima de la tabla.
function resumenHtml(numIncidencias) {
  const texto = `incidencia${numIncidencias === 1 ? '' : 's'} registrada${numIncidencias === 1 ? '' : 's'} en el reparto de hoy`;
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
      <tr>
        <td style="background:#FDE7E2; border-radius:10px; padding:10px 14px;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="width:26px; height:26px; border-radius:50%; background:#D12B0D; color:#ffffff; font-weight:800; font-size:13px; text-align:center; vertical-align:middle; font-family:Arial, sans-serif;">${numIncidencias}</td>
            <td style="padding-left:10px; font-size:13.5px; color:#D12B0D; font-weight:600; font-family:Arial, sans-serif;">${texto}</td>
          </tr></table>
        </td>
      </tr>
    </table>`;
}

// Fecha con el día de la semana delante (p. ej. "Jueves 17/09/2026"), solo
// para el texto del cuerpo del correo — fechaEs() (sin día) se sigue usando
// tal cual para el asunto y el resto de sitios donde ya se usaba.
function fechaEsConDia(fechaISO) {
  if (!fechaISO) return '—';
  const dia = new Date(fechaISO + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' });
  const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${diaCapitalizado} ${fechaEs(fechaISO)}`;
}

// Genera { subject, html } para el correo de una agencia, usando la plantilla acordada.
// fechaISO es la fecha del informe (informeHoyCache.fecha); numIncidencias, el total
// de filas de esa agencia en `tabla` (para la franja de resumen).
function plantillaInformeAgencia(agenciaNombre, fechaISO, tabla, numIncidencias) {
  const nombreAgenciaUpper = escapeHtml(agenciaNombre.toUpperCase());
  const nombreHoja = fechaEs(fechaISO);
  const nombreHojaConDia = fechaEsConDia(fechaISO);

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f5" style="background:#eef1f5; font-family:Arial, sans-serif;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table width="1100" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff; border:1px solid #edf2f7; border-radius:16px;">
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 14px; font-size:14px; color:#1e293b; line-height:1.55;">Buenas,</p>
                <p style="margin:0 0 14px; font-size:14px; color:#1e293b; line-height:1.55;">
                  A continuación, les indicamos las incidencias producidas en el reparto del <b>${nombreHojaConDia}</b> por la agencia <b>${nombreAgenciaUpper}</b>:
                </p>
                ${resumenHtml(numIncidencias)}
                ${tabla}
                <p style="margin:20px 0 14px; font-size:14px; color:#1e293b; line-height:1.55;">
                  Todas las horas de entrega mostradas en este correo corresponden al horario peninsular.
                </p>
                <p style="margin:0 0 14px; font-size:14px; color:#1e293b; line-height:1.55;">
                  Quedamos a su disposición para cualquier aclaración adicional que consideren necesaria.
                </p>
                <p style="margin:0; font-size:14px; color:#1e293b; line-height:1.55;">
                  Atentamente,<br>
                  <b>Departamento de Transporte</b>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0; text-align:center;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" alt="PRIMOR" width="120" style="opacity:.85;">
          </p>
          <p style="margin:8px 0 0; text-align:center; font-size:10.5px; color:#94a3b8; font-style:italic;">
            Informe generado automáticamente por el sistema GIDT.
          </p>
        </td>
      </tr>
    </table>`;

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

// ---------------------------------------------------------------
// Tarea pendiente en Inicio: cuando un informe ya enviado se quedó con
// incidencias "sin revisar" (Retraso Pdte Confirmar / Revisando posible
// incidencia), lo recuerda en "Pendiente de atención" — sea o no el día
// de hoy — hasta que esas incidencias se reclasifiquen con un motivo
// definitivo. Al pulsar el aviso: si es el informe de hoy, lleva a
// "Incidencias" (donde sí se puede editar); si es de un día anterior,
// lleva al Historial de informes con esa fecha ya cargada.
// ---------------------------------------------------------------
async function informeEnvioComprobarPendientesInicio() {
  try {
    const { data: incs, error: eInc } = await sb.from('incidencias')
      .select('informe_id')
      .eq('marcada', true)
      .overlaps('motivo', MOTIVOS_SIN_REVISAR);
    if (eInc) throw eInc;
    if (!incs || !incs.length) return [];

    const conteoPorInforme = {};
    incs.forEach(i => { conteoPorInforme[i.informe_id] = (conteoPorInforme[i.informe_id] || 0) + 1; });

    const { data: informes, error: eInf } = await sb.from('informes_diarios')
      .select('id, fecha, informe_enviado')
      .in('id', Object.keys(conteoPorInforme).map(Number))
      .eq('informe_enviado', true);
    if (eInf) throw eInf;

    return (informes || [])
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(inf => {
        const n = conteoPorInforme[inf.id];
        // El informe de hoy no se edita desde el Historial (ahí el botón
        // "Editar informe" está oculto para la fecha de hoy) — se edita en
        // la propia pestaña "Incidencias". Solo los informes de días
        // anteriores llevan al Historial, con la fecha ya cargada.
        const esHoy = inf.fecha === fechaHoyISO;
        return {
          icono: '🔎',
          texto: `Informe ${formatearFechaCorta(new Date(inf.fecha + 'T00:00:00'))} enviado con ${n} incidencia${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'}`,
          vista: esHoy ? 'incidencias' : 'historial-informes',
          fecha: esHoy ? undefined : inf.fecha
        };
      });
  } catch (err) {
    console.error('Error comprobando informes enviados con incidencias pendientes:', err);
    return [];
  }
}

// Modal de confirmación de envío: lista de agencias/incidencias, agencias
// omitidas por falta de email, aviso de reenvío y aviso de incidencias sin
// revisar. Devuelve una promesa que resuelve a true (enviar) o false (cancelar).
function mostrarModalEnvioInforme({ conEmails, sinEmails, reenvio, sinRevisar }) {
  return new Promise(resolve => {
    const overlay             = document.getElementById('envioInformeModalOverlay');
    const sub                 = document.getElementById('envioModalSub');
    const lista                = document.getElementById('envioListaAgencias');
    const alertaPend          = document.getElementById('envioAlertaPendientes');
    const alertaPendTitulo    = document.getElementById('envioAlertaPendientesTitulo');
    const alertaPendTexto     = document.getElementById('envioAlertaPendientesTexto');
    const alertaPendLista     = document.getElementById('envioAlertaPendientesLista');
    const todoRevisado         = document.getElementById('envioTodoRevisado');
    const alertaReenvio       = document.getElementById('envioAlertaReenvio');
    const alertaOmitidas      = document.getElementById('envioAlertaOmitidas');
    const alertaOmitTexto     = document.getElementById('envioAlertaOmitidasTexto');
    const btnOk                = document.getElementById('envioModalBtnOk');
    const btnCancel            = document.getElementById('envioModalBtnCancel');
    const btnCerrar            = document.getElementById('btnCerrarEnvioModal');

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

    let intervaloCuentaAtras = null;
    const pararCuentaAtras = () => {
      if (intervaloCuentaAtras) { clearInterval(intervaloCuentaAtras); intervaloCuentaAtras = null; }
    };

    if (sinRevisar.length) {
      const n = sinRevisar.length;
      alertaPendTitulo.textContent = `${n} incidencia${n === 1 ? '' : 's'} sin revisar`;
      alertaPendTexto.textContent = `Aún sin motivo confirmado. Se incluirá${n === 1 ? '' : 'n'} tal cual si no la${n === 1 ? '' : 's'} corriges antes de enviar.`;
      alertaPendLista.innerHTML = sinRevisar.map(it => `<li><b>${escapeHtml(it.tienda)}</b> (${escapeHtml(it.agencia)}, ${it.hora})</li>`).join('');
      alertaPend.style.display = '';
      todoRevisado.style.display = 'none';

      // Como se va a enviar con incidencias aún sin revisar, se obliga a
      // esperar 5 segundos antes de poder pulsar el botón — para que no
      // se acabe pulsando por reflejo sin leer el aviso de arriba.
      let segundos = 5;
      btnOk.disabled = true;
      btnOk.textContent = `⚠️ Enviar de todos modos (${segundos})`;
      intervaloCuentaAtras = setInterval(() => {
        segundos--;
        if (segundos > 0) {
          btnOk.textContent = `⚠️ Enviar de todos modos (${segundos})`;
        } else {
          pararCuentaAtras();
          btnOk.disabled = false;
          btnOk.textContent = '⚠️ Enviar de todos modos';
        }
      }, 1000);
    } else {
      alertaPend.style.display = 'none';
      alertaPendLista.innerHTML = '';
      todoRevisado.style.display = '';
      btnOk.disabled = false;
      btnOk.textContent = '✉️ Enviar informe';
    }

    alertaReenvio.style.display = reenvio ? '' : 'none';

    if (sinEmails.length) {
      alertaOmitTexto.textContent = `${sinEmails.map(g => g.agenciaNombre).join(', ')} (sin emails configurados en Configuración → Gestión de agencias).`;
      alertaOmitidas.style.display = '';
    } else {
      alertaOmitidas.style.display = 'none';
    }

    overlay.classList.add('show');

    const cerrar = (resultado) => {
      pararCuentaAtras();
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

// Pinta el estado (badge) de envío del informe de hoy junto al botón, y
// atenúa el propio botón "Enviar informe" cuando ya se ha enviado (sigue
// siendo clicable por si hace falta reenviarlo, pero no debe parecer que
// aún está pendiente de enviar).
function renderBotonEnviarInforme() {
  const badge = document.getElementById('informeEnviadoBadge');
  const btn = document.getElementById('btnEnviarInforme');
  const btnLog = document.getElementById('btnLogCambiosHoy');

  const enviado = !!informeHoyCache?.informe_enviado;
  if (btnLog) btnLog.style.display = enviado ? '' : 'none';

  if (badge) {
    if (enviado) {
      const hora = informeHoyCache.informe_enviado_en
        ? new Date(informeHoyCache.informe_enviado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : '';
      badge.textContent = `✅ Enviado${hora ? ' a las ' + hora : ''}`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  if (btn) btn.classList.toggle('primary', !enviado);
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
    await modalAlert('Ninguna de las agencias con incidencias tiene emails configurados. Añádelos en Configuración → Gestión de agencias.', { titulo: 'Sin destinatarios' });
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
      const { subject, html } = plantillaInformeAgencia(g.agenciaNombre, informeHoyCache.fecha, tabla, g.filas.length);
      try {
        await enviarEmail({ to: g.emails, subject, html, silenciarToast: true });
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

  if (exitosos.length && typeof mostrarToast === 'function') mostrarToast('Correo enviado correctamente');

  if (exitosos.length && typeof registrarAccion === 'function') {
    registrarAccion('informes', 'Enviar informe a agencias', `${nombreHoja || ''} — ${exitosos.length} agencia${exitosos.length === 1 ? '' : 's'}`.trim());
  }

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
