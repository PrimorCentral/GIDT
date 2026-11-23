// ---------------------------------------------------------------
// Actualización del informe diario a las agencias
// ---------------------------------------------------------------
// Cuando un informe ya enviado se modifica (se añade, cambia o quita una
// incidencia), cada cambio queda en informes_cambios_log (ver
// js/informes-cambios-log.js). Los que aún no se han comunicado tienen
// comunicado_en = null. Desde aquí:
//   - se calcula el cambio NETO por tienda (cómo estaba la última vez que
//     se comunicó → cómo está ahora): NUEVA, MODIFICADA o ANULADA. Si se
//     añadió y se quitó, o solo cambió un submotivo interno, no hay nada
//     que comunicar;
//   - se abre la ventana "¿Enviar las actualizaciones a las agencias?"
//     (al terminar de editar el informe de hoy o uno del Historial, o con
//     el botón "Enviar actualización");
//   - se manda a cada agencia marcada un correo SOLO con sus tiendas
//     cambiadas, y se marcan esos cambios como comunicados.
// Comunicar es opcional: no sale en Tareas pendientes.
//
// Valores de informes_cambios_log.comunicado_accion:
//   ACTUALIZACION     → se mandó el correo de actualización
//   NO_COMUNICAR      → se decidió no avisar a la agencia
//   INFORME_COMPLETO  → se volvió a enviar el informe entero (lo incluye)
//   SIN_CAMBIO        → el cambio neto era nulo (añadido y quitado, etc.)
//   ANTERIOR          → cambios de antes de existir esta función
//
// Requiere (ya cargados antes): sb, escapeHtml, modalAlert, modalConfirm,
// mostrarToast (ui-modal.js); enviarEmail (email-service.js); fechaEs
// (email-plantillas.js); FILA_ESTILO, nivelDominanteFila, celdaCentrada,
// avisoRetrasoObservaciones, fechaEsConDia, mostrarCargandoEnvio,
// actualizarCargandoEnvio, ocultarCargandoEnvio (informe-envio.js);
// informeHoyCache, informeCerradoSinIncidencias (informe-hoy.js);
// tiendasCache, agenciasCache (tiendas.js); CODIGOS_INFORME
// (codigos-informe.js); sesionActual.

// Nº de cambios netos sin comunicar del informe de hoy (lo pinta
// renderBotonEnviarInforme en informe-envio.js) y del informe abierto en
// el Historial.
let iaPendientesHoyN = 0;
let iaPendientesHistorialN = 0;

function iaUsuarioActual() {
  return (typeof sesionActual !== 'undefined' && sesionActual) ? (sesionActual.nombre || sesionActual.usuario) : null;
}

// Submotivos internos (p. ej. "ROBO/FALTAS DE SELECTIVO", "NO ENTREGAN SIN
// MOTIVO"): no se ven en los correos, así que tampoco cuentan como cambio.
function iaMotivosPrincipales(motivos) {
  const internos = new Set();
  if (typeof CODIGOS_INFORME !== 'undefined') CODIGOS_INFORME.filter(c => c.submotivo).forEach(c => internos.add(c.submotivo));
  if (window.SUBMOTIVOS_POR_MOTIVO) Object.values(window.SUBMOTIVOS_POR_MOTIVO).flat().forEach(s => internos.add(s));
  return (motivos || []).filter(m => !internos.has(m));
}

function iaMismaLista(a, b) {
  const x = a.slice().sort();
  const y = b.slice().sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// Un informe admite actualización si se envió de verdad a las agencias (no
// si se cerró sin incidencias: ahí no se mandó ningún correo).
function iaInformeAdmiteActualizacion(informe) {
  return !!informe?.informe_enviado && !informeCerradoSinIncidencias(informe);
}

// Calcula los cambios netos sin comunicar de un informe, agrupados por
// agencia. Devuelve { grupos, idsSinCambio, total }, donde cada grupo es
// { clave, agenciaId, agenciaNombre, emails, cambios: [...], ids: [...] }.
async function iaCalcularPendientes(informe) {
  const vacio = { grupos: [], idsSinCambio: [], total: 0 };
  if (!iaInformeAdmiteActualizacion(informe)) return vacio;

  const { data: filas, error } = await sb.from('informes_cambios_log')
    .select('id, tienda_id, tienda_nombre, agencia_nombre, motivos_antes, motivos_despues, observaciones_antes, observaciones_despues, usuario, creado_en')
    .eq('informe_id', informe.id)
    .is('comunicado_en', null)
    .order('creado_en', { ascending: true });
  if (error) throw error;
  if (!filas || !filas.length) return vacio;

  // Estado actual de las incidencias del informe (hora y agencia guardadas
  // en la propia incidencia, igual que el resto del histórico).
  const [{ data: incs, error: eInc }, { data: agencias, error: eAg }] = await Promise.all([
    sb.from('incidencias').select('tienda_id, entrega, tienda_hora_prevista, agencia_id, agencia_nombre, marcada')
      .eq('informe_id', informe.id),
    sb.from('agencias').select('id, nombre, emails')
  ]);
  if (eInc) throw eInc;
  if (eAg) throw eAg;

  // Se agrupa por tienda + agencia (una entrega de prueba con otra agencia
  // es una fila distinta del informe y va a otra agencia).
  const porTienda = new Map();
  filas.forEach(f => {
    const clave = `${f.tienda_id}|${f.agencia_nombre || ''}`;
    if (!porTienda.has(clave)) porTienda.set(clave, []);
    porTienda.get(clave).push(f);
  });

  const grupos = new Map();
  const idsSinCambio = [];
  let total = 0;

  porTienda.forEach(lista => {
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    const ids = lista.map(f => f.id);
    const motAntes = iaMotivosPrincipales(primero.motivos_antes);
    const motDespues = iaMotivosPrincipales(ultimo.motivos_despues);
    const obsAntes = (primero.observaciones_antes || '').trim();
    const obsDespues = (ultimo.observaciones_despues || '').trim();

    let tipo;
    if (!motAntes.length && motDespues.length) tipo = 'NUEVA';
    else if (motAntes.length && !motDespues.length) tipo = 'ANULADA';
    else if (motAntes.length && motDespues.length && (!iaMismaLista(motAntes, motDespues) || obsAntes !== obsDespues)) tipo = 'MODIFICADA';
    else { idsSinCambio.push(...ids); return; }

    const agNombre = ultimo.agencia_nombre || primero.agencia_nombre || '';
    const inc = (incs || []).find(i => i.tienda_id === primero.tienda_id && (i.agencia_nombre || '') === agNombre)
      || (incs || []).find(i => i.tienda_id === primero.tienda_id && (i.entrega || 'HABITUAL') === 'HABITUAL');
    const agencia = (agencias || []).find(a => a.nombre === agNombre)
      || (inc ? (agencias || []).find(a => a.id === inc.agencia_id) : null);
    const tiendaCache = (typeof tiendasCache !== 'undefined' ? tiendasCache : []).find(t => t.id === primero.tienda_id);
    const hora = inc?.tienda_hora_prevista || tiendaCache?.hora_prevista || null;

    const claveAg = agencia ? `id:${agencia.id}` : `nom:${agNombre}`;
    if (!grupos.has(claveAg)) {
      grupos.set(claveAg, {
        clave: claveAg,
        agenciaId: agencia?.id ?? null,
        agenciaNombre: agencia?.nombre || agNombre || 'Sin agencia',
        emails: agencia?.emails || [],
        cambios: [],
        ids: []
      });
    }
    const g = grupos.get(claveAg);
    g.cambios.push({
      tipo,
      tiendaId: primero.tienda_id,
      tiendaNombre: ultimo.tienda_nombre || primero.tienda_nombre || tiendaCache?.nombre || '—',
      hora,
      motivosAntes: motAntes,
      motivosDespues: motDespues,
      obsAntes,
      obsDespues,
      usuario: ultimo.usuario,
      en: ultimo.creado_en
    });
    g.ids.push(...ids);
    total++;
  });

  const listaGrupos = Array.from(grupos.values()).sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre));
  listaGrupos.forEach(g => g.cambios.sort((a, b) => (a.hora || '').localeCompare(b.hora || '')));
  return { grupos: listaGrupos, idsSinCambio, total };
}

async function iaMarcarComunicados(ids, accion) {
  if (!ids || !ids.length) return;
  const { error } = await sb.from('informes_cambios_log').update({
    comunicado_en: new Date().toISOString(),
    comunicado_por: iaUsuarioActual(),
    comunicado_accion: accion
  }).in('id', ids).is('comunicado_en', null);
  if (error) throw error;
}

// Al volver a enviar el informe entero, ya va todo dentro: se dan por
// comunicados todos los cambios pendientes de ese informe.
async function iaMarcarTodoComunicado(informeId, accion) {
  const { error } = await sb.from('informes_cambios_log').update({
    comunicado_en: new Date().toISOString(),
    comunicado_por: iaUsuarioActual(),
    comunicado_accion: accion
  }).eq('informe_id', informeId).is('comunicado_en', null);
  if (error) throw error;
}

// ---------------- Correo de actualización ----------------

const IA_CHIP = {
  NUEVA:      { texto: 'NUEVA',      color: '#1F8A4C', borde: '#BFE5CC' },
  MODIFICADA: { texto: 'MODIFICADA', color: '#1B6DE0', borde: '#BFD6FA' },
  ANULADA:    { texto: 'ANULADA',    color: '#B23A28', borde: '#F2C4BE' }
};

function iaTablaCambiosHtml(cambios) {
  const th = 'text-align:center; padding:5px 12px; background:#f1f5f9; color:#1e293b; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.3px; border:1px solid #cbd5e1; line-height:17px; mso-line-height-rule:exactly;';
  const td = 'text-align:center; vertical-align:middle; padding:0px 12px; border:1px solid #cbd5e1; font-size:13px;';

  const filasHtml = cambios.map(c => {
    const hora = c.hora ? c.hora.slice(0, 5) : '—';
    const chipDef = IA_CHIP[c.tipo];
    // Pastilla como mini-tabla (no <span>): Outlook ignora padding, fondo y
    // bordes redondeados de un <span> y lo pintaba como un enlace recuadrado.
    const chip = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate; mso-table-lspace:0pt; mso-table-rspace:0pt; margin:0 auto;"><tr><td align="center" valign="middle" bgcolor="#ffffff" style="background:#ffffff; border:1px solid ${chipDef.borde}; border-radius:99px; padding:4px 10px; font-family:Arial, sans-serif; font-size:11px; font-weight:800; letter-spacing:.3px; line-height:14px; mso-line-height-rule:exactly; color:${chipDef.color}; text-decoration:none; white-space:nowrap;">${chipDef.texto}</td></tr></table>`;

    if (c.tipo === 'ANULADA') {
      const gris = '#94a3b8';
      return `
        <tr style="background:#ffffff;">
          <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(chip, gris)}</td>
          <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(hora, gris)}</td>
          <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(`<s>${escapeHtml(c.tiendaNombre)}</s>`, gris, 'font-weight:700;')}</td>
          <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(`<s>${c.motivosAntes.map(m => escapeHtml(m)).join('<br>')}</s>`, gris, 'font-weight:800; text-transform:uppercase;')}</td>
          <td align="center" valign="middle" style="${td}">${celdaCentrada('Incidencia retirada del informe', '#64748b')}</td>
        </tr>`;
    }

    const estilo = FILA_ESTILO[nivelDominanteFila(c.motivosDespues)];
    const colorAntes = estilo.texto === '#ffffff' ? 'rgba(255,255,255,.85)' : '#64748b';
    const lineaAntes = (txt) => `<div style="font-size:11px; font-weight:600; text-transform:none; color:${colorAntes}; margin-top:4px; line-height:15px;">Antes: ${escapeHtml(txt)}</div>`;

    let motivosHtml = c.motivosDespues.map(m => escapeHtml(m)).join('<br>');
    if (c.tipo === 'MODIFICADA' && !iaMismaLista(c.motivosAntes, c.motivosDespues)) {
      motivosHtml += lineaAntes(c.motivosAntes.join(', '));
    }
    let obsHtml = escapeHtml(c.obsDespues) + avisoRetrasoObservaciones(c.obsDespues, c.hora, estilo.texto);
    if (c.tipo === 'MODIFICADA' && c.obsAntes !== c.obsDespues) {
      obsHtml += lineaAntes(c.obsAntes || '(sin observaciones)');
    }

    return `
      <tr style="background:${estilo.bg};">
        <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(chip, estilo.texto)}</td>
        <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(hora, estilo.texto)}</td>
        <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(escapeHtml(c.tiendaNombre), estilo.texto, 'font-weight:700;')}</td>
        <td align="center" valign="middle" style="${td} white-space:nowrap;">${celdaCentrada(motivosHtml, estilo.motivo, 'font-weight:800; text-transform:uppercase;')}</td>
        <td align="center" valign="middle" style="${td}">${celdaCentrada(obsHtml, estilo.texto)}</td>
      </tr>`;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; font-family:Arial, sans-serif; margin:0 0 20px;">
      <thead>
        <tr>
          <th width="110" align="center" valign="middle" style="${th}">Cambio</th>
          <th width="55" align="center" valign="middle" style="${th}">Hora</th>
          <th width="170" align="center" valign="middle" style="${th}">Tienda</th>
          <th width="240" align="center" valign="middle" style="${th}">Motivo</th>
          <th align="center" valign="middle" style="${th}">Observaciones</th>
        </tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

function plantillaActualizacionInforme(agenciaNombre, informe, cambios) {
  const nombreAgenciaUpper = escapeHtml((agenciaNombre || '').toUpperCase());
  const horaEnvio = informe.informe_enviado_en
    ? new Date(informe.informe_enviado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '';
  const n = cambios.length;
  const p = 'font-size:14px; color:#1e293b; line-height:1.55;';

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f5" style="background:#eef1f5; font-family:Arial, sans-serif;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table width="1100" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff; border:1px solid #edf2f7; border-radius:16px;">
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 14px;"><span style="display:inline-block; background:#FFEEDF; color:#B45309; font-weight:800; font-size:12px; letter-spacing:.4px; padding:5px 12px; border-radius:99px;">🔄 ACTUALIZACIÓN DEL INFORME</span></p>
                <p style="margin:0 0 14px; ${p}">Buenas,</p>
                <p style="margin:0 0 14px; ${p}">
                  Les enviamos una <b>actualización</b> del informe de incidencias del reparto del <b>${fechaEsConDia(informe.fecha)}</b> por la agencia <b>${nombreAgenciaUpper}</b>${horaEnvio ? `, que les remitimos a las ${horaEnvio}` : ''}. A continuación, les indicamos los cambios:
                </p>
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding-bottom:18px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td style="background:#FFEEDF; border-radius:10px; padding:10px 14px;">
                            <table cellpadding="0" cellspacing="0" border="0"><tr>
                              <td valign="middle" style="width:26px; height:26px; border-radius:50%; background:#B45309; color:#ffffff; font-weight:800; font-size:13px; text-align:center; vertical-align:middle; font-family:Arial, sans-serif;">${n}</td>
                              <td style="padding-left:10px; font-size:13.5px; color:#B45309; font-weight:600; font-family:Arial, sans-serif;">cambio${n === 1 ? '' : 's'} respecto al informe enviado</td>
                            </tr></table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                ${iaTablaCambiosHtml(cambios)}
                <p style="margin:0 0 14px; ${p}">El resto de incidencias del informe se mantienen sin cambios.</p>
                <p style="margin:0 0 14px; ${p}">Todas las horas de entrega mostradas en este correo corresponden al horario peninsular.</p>
                <p style="margin:0 0 14px; ${p}">Quedamos a su disposición para cualquier aclaración adicional que consideren necesaria.</p>
                <p style="margin:0; ${p}">
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

  const subject = `ACTUALIZACIÓN – INCIDENCIAS EN EL REPARTO DE ${(agenciaNombre || '').toUpperCase()} – ${fechaEs(informe.fecha)}`;
  return { subject, html };
}

// ---------------- Ventana "¿Enviar las actualizaciones…?" ----------------

function iaHora(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
}

function iaCuandoCambio(iso, informe) {
  if (!iso) return '';
  const d = new Date(iso);
  const mismoDia = typeof fechaLocalISO === 'function' && fechaLocalISO(d) === informe.fecha;
  if (mismoDia) return iaHora(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${iaHora(iso)}`;
}

function iaFilaCambioHtml(c, informe) {
  const chipClase = { NUEVA: 'nueva', MODIFICADA: 'mod', ANULADA: 'anul' }[c.tipo];
  const chipTxt = { NUEVA: 'Nueva', MODIFICADA: 'Modificada', ANULADA: 'Anulada' }[c.tipo];
  let linea;
  if (c.tipo === 'ANULADA') {
    linea = `<b><s>${escapeHtml(c.tiendaNombre)}</s></b> · <s>${escapeHtml(c.motivosAntes.join(', '))}</s>`;
  } else if (c.tipo === 'NUEVA') {
    linea = `<b>${escapeHtml(c.tiendaNombre)}</b> · ${escapeHtml(c.motivosDespues.join(', '))}`;
  } else {
    // Motivos nuevos en negrita, para ver de un vistazo qué ha cambiado.
    const motivos = c.motivosDespues.map(m => c.motivosAntes.includes(m) ? escapeHtml(m) : `<b>${escapeHtml(m)}</b>`).join(', ');
    linea = `<b>${escapeHtml(c.tiendaNombre)}</b> · ${motivos}`;
  }
  const detalles = [];
  if (c.tipo === 'MODIFICADA' && !iaMismaLista(c.motivosAntes, c.motivosDespues)) detalles.push(`Antes: ${escapeHtml(c.motivosAntes.join(', '))}`);
  if (c.tipo !== 'ANULADA' && c.obsDespues && (c.tipo === 'NUEVA' || c.obsAntes !== c.obsDespues)) detalles.push(`«${escapeHtml(c.obsDespues)}»`);
  if (c.tipo === 'MODIFICADA' && c.obsAntes !== c.obsDespues && c.obsAntes) detalles.push(`Antes: «${escapeHtml(c.obsAntes)}»`);
  detalles.push([escapeHtml(c.usuario || ''), iaCuandoCambio(c.en, informe)].filter(Boolean).join(', '));
  return `
    <div class="iact-fila">
      <span class="iact-chip ${chipClase}">${chipTxt}</span>
      <div class="iact-fila-txt">${linea}<span class="iact-fila-det">${detalles.filter(Boolean).join(' · ')}</span></div>
    </div>`;
}

// Abre la ventana con los cambios pendientes del informe. Si no hay
// ninguno, no abre nada. Devuelve 'ENVIADO', 'NO_COMUNICAR', 'AHORA_NO' o
// 'NADA'.
async function abrirVentanaActualizacionInforme(informe) {
  if (!iaInformeAdmiteActualizacion(informe)) return 'NADA';
  // Sin permiso de "Enviar informe a agencias" no se pregunta: los cambios
  // quedan pendientes para quien sí lo tenga.
  if (typeof tienePermiso === 'function' && !tienePermiso('enviar_informe')) return 'NADA';

  let pend;
  try {
    pend = await conCargaGlobal(() => iaCalcularPendientes(informe));
  } catch (err) {
    console.error('Error calculando los cambios sin comunicar:', err);
    await modalAlert('No se pudieron comprobar los cambios pendientes de comunicar a las agencias.', { titulo: 'Error', danger: true });
    return 'NADA';
  }

  // Cambios que al final se quedan igual (añadido y quitado…): se cierran
  // sin preguntar.
  if (pend.idsSinCambio.length) {
    try { await iaMarcarComunicados(pend.idsSinCambio, 'SIN_CAMBIO'); } catch (err) { console.error(err); }
  }
  if (!pend.total) {
    await iaRefrescarAvisos();
    return 'NADA';
  }

  const decision = await iaMostrarModal(informe, pend);
  if (decision.accion === 'AHORA_NO') return 'AHORA_NO';

  const marcados = pend.grupos.filter(g => decision.claves.has(g.clave));
  if (decision.accion === 'NO_COMUNICAR') {
    try {
      await iaMarcarComunicados(marcados.flatMap(g => g.ids), 'NO_COMUNICAR');
      if (typeof registrarAccion === 'function') {
        registrarAccion('informes', 'No comunicar actualización del informe', `${fechaEs(informe.fecha)} — ${marcados.map(g => g.agenciaNombre).join(', ')}`);
      }
      if (typeof mostrarToast === 'function') mostrarToast('Cambios marcados como no comunicados');
    } catch (err) {
      console.error('Error marcando cambios como no comunicados:', err);
      await modalAlert(`No se pudo guardar la decisión: ${err.message || 'error desconocido'}`, { titulo: 'Error', danger: true });
    }
    await iaRefrescarAvisos();
    return 'NO_COMUNICAR';
  }

  // ENVIAR
  const resultados = [];
  mostrarCargandoEnvio('Enviando actualización…');
  try {
    let i = 0;
    for (const g of marcados) {
      i++;
      actualizarCargandoEnvio(`Enviando actualización a ${g.agenciaNombre}… (${i}/${marcados.length})`);
      const { subject, html } = plantillaActualizacionInforme(g.agenciaNombre, informe, g.cambios);
      try {
        await enviarEmail({ to: g.emails, subject, html, silenciarToast: true });
        try {
          await iaMarcarComunicados(g.ids, 'ACTUALIZACION');
          resultados.push({ agencia: g.agenciaNombre, ok: true });
        } catch (errMarca) {
          console.error('Correo enviado pero no se pudo marcar como comunicado:', errMarca);
          resultados.push({ agencia: g.agenciaNombre, ok: true, avisoMarca: errMarca.message || 'error desconocido' });
        }
      } catch (err) {
        console.error(`Error enviando la actualización a ${g.agenciaNombre}:`, err);
        resultados.push({ agencia: g.agenciaNombre, ok: false, error: err.message });
      }
    }
  } finally {
    ocultarCargandoEnvio();
  }

  const ok = resultados.filter(r => r.ok);
  const ko = resultados.filter(r => !r.ok);
  const sinMarca = ok.filter(r => r.avisoMarca);
  if (ok.length && typeof registrarAccion === 'function') {
    registrarAccion('informes', 'Enviar actualización del informe', `${fechaEs(informe.fecha)} — ${ok.map(r => r.agencia).join(', ')}`);
  }
  await iaRefrescarAvisos();

  if (!ko.length && !sinMarca.length) {
    if (typeof mostrarToast === 'function') mostrarToast(`Actualización enviada a ${ok.length} agencia${ok.length === 1 ? '' : 's'}`);
    return 'ENVIADO';
  }
  let msg = ok.length ? `Actualización enviada a ${ok.length} agencia${ok.length === 1 ? '' : 's'}.` : 'No se pudo enviar la actualización.';
  if (ko.length) msg += `\n\nFallos (siguen pendientes):\n` + ko.map(f => `• ${f.agencia}: ${f.error}`).join('\n');
  if (sinMarca.length) msg += `\n\n⚠️ El correo a ${sinMarca.map(r => r.agencia).join(', ')} se envió, pero no se pudo marcar como comunicado: seguirá saliendo como pendiente.`;
  await modalAlert(msg, { titulo: 'Envío con errores', danger: !ok.length });
  return ok.length ? 'ENVIADO' : 'AHORA_NO';
}

// Pinta el modal y espera la decisión: { accion, claves (agencias marcadas) }.
function iaMostrarModal(informe, pend) {
  return new Promise(resolve => {
    const overlay = document.getElementById('iactModalOverlay');
    const sub = document.getElementById('iactSub');
    const lista = document.getElementById('iactLista');
    const btnEnviar = document.getElementById('iactBtnEnviar');
    const btnNo = document.getElementById('iactBtnNoComunicar');
    const btnAhoraNo = document.getElementById('iactBtnAhoraNo');
    const btnCerrar = document.getElementById('iactBtnCerrar');

    const fechaTxt = fechaEsConDia(informe.fecha);
    const horaEnvio = iaHora(informe.informe_enviado_en);
    const nAg = pend.grupos.length;
    sub.textContent = `Informe del ${fechaTxt}${horaEnvio ? ` · enviado a las ${horaEnvio}` : ''}. `
      + `${pend.total} cambio${pend.total === 1 ? '' : 's'} sin comunicar en ${nAg} agencia${nAg === 1 ? '' : 's'}.`;

    lista.innerHTML = pend.grupos.map(g => {
      const sinEmail = !g.emails.length;
      return `
        <div class="iact-grupo${sinEmail ? ' sin-email' : ''}">
          <label class="iact-grupo-head">
            <input type="checkbox" class="iact-check" value="${escapeHtml(g.clave)}" ${sinEmail ? 'disabled' : 'checked'}>
            <b>${escapeHtml(g.agenciaNombre)}</b>
            ${sinEmail ? '<span class="iact-sin-email">Sin emails configurados en Gestión → Agencias</span>' : ''}
            <small>${g.cambios.length} cambio${g.cambios.length === 1 ? '' : 's'}</small>
          </label>
          ${g.cambios.map(c => iaFilaCambioHtml(c, informe)).join('')}
        </div>`;
    }).join('');

    const marcadas = () => new Set(Array.from(lista.querySelectorAll('.iact-check:checked')).map(cb => cb.value));
    const pintarBotones = () => {
      const n = marcadas().size;
      btnEnviar.disabled = n === 0;
      btnNo.disabled = n === 0;
      btnEnviar.textContent = `✉️ Enviar a ${n} agencia${n === 1 ? '' : 's'}`;
    };
    lista.addEventListener('change', pintarBotones);
    pintarBotones();

    overlay.classList.add('show');

    const cerrar = (accion) => {
      overlay.classList.remove('show');
      lista.removeEventListener('change', pintarBotones);
      btnEnviar.removeEventListener('click', onEnviar);
      btnNo.removeEventListener('click', onNo);
      btnAhoraNo.removeEventListener('click', onAhoraNo);
      btnCerrar.removeEventListener('click', onAhoraNo);
      overlay.removeEventListener('click', onOverlay);
      resolve({ accion, claves: marcadas() });
    };
    const onEnviar = () => cerrar('ENVIAR');
    const onNo = async () => {
      const n = marcadas().size;
      const okNo = await modalConfirm(
        `Los cambios de ${n === 1 ? 'esta agencia' : `estas ${n} agencias`} se darán por cerrados sin mandarles ningún correo. Las agencias que hayas desmarcado seguirán pendientes.`,
        { titulo: '¿No comunicar los cambios?', icono: '🚫', textoOk: 'No comunicar' }
      );
      if (okNo) cerrar('NO_COMUNICAR');
    };
    const onAhoraNo = () => cerrar('AHORA_NO');
    const onOverlay = (e) => { if (e.target === overlay) onAhoraNo(); };

    btnEnviar.addEventListener('click', onEnviar);
    btnNo.addEventListener('click', onNo);
    btnAhoraNo.addEventListener('click', onAhoraNo);
    btnCerrar.addEventListener('click', onAhoraNo);
    overlay.addEventListener('click', onOverlay);
  });
}

// ---------------- Contadores / avisos ----------------

async function iaContarPendientes(informe) {
  if (!iaInformeAdmiteActualizacion(informe)) return 0;
  try {
    const pend = await iaCalcularPendientes(informe);
    return pend.total;
  } catch (err) {
    console.error('Error contando cambios sin comunicar:', err);
    return 0;
  }
}

async function iaActualizarPendientesHoy() {
  iaPendientesHoyN = await iaContarPendientes(typeof informeHoyCache !== 'undefined' ? informeHoyCache : null);
  if (typeof renderBotonEnviarInforme === 'function') renderBotonEnviarInforme();
}

async function iaActualizarPendientesHistorial() {
  const btn = document.getElementById('btnActualizacionHistorial');
  const informe = typeof historialInformeActual !== 'undefined' ? historialInformeActual : null;
  const editando = typeof historialEditando !== 'undefined' && historialEditando;
  iaPendientesHistorialN = (informe && informe.fecha !== fechaHoyISO) ? await iaContarPendientes(informe) : 0;
  if (!btn) return;
  btn.style.display = (iaPendientesHistorialN && !editando) ? '' : 'none';
  btn.textContent = `🔄 Enviar actualización (${iaPendientesHistorialN})`;
  btn.title = `${iaPendientesHistorialN} cambio${iaPendientesHistorialN === 1 ? '' : 's'} sin comunicar a las agencias`;
}

async function iaRefrescarAvisos() {
  await Promise.all([iaActualizarPendientesHoy(), iaActualizarPendientesHistorial()]);
}

// ---------------- Informe del día: bloqueo tras enviar + edición ----------------
// Una vez enviado, el informe de hoy queda bloqueado (no se puede tocar
// por error). "✏️ Editar informe" lo desbloquea; "✅ Terminar de editar"
// lo vuelve a bloquear y abre la ventana de actualización si hay cambios.

let informeHoyEditando = false;
let iaFiltroSoloIncAntesDeEditar = null;

function informeHoyBloqueado() {
  return iaInformeAdmiteActualizacion(typeof informeHoyCache !== 'undefined' ? informeHoyCache : null) && !informeHoyEditando;
}

function iaAplicarBloqueoHoy() {
  document.getElementById('view-incidencias')?.classList.toggle('informe-bloqueado', informeHoyBloqueado());
}

function iaAvisoBloqueado() {
  if (typeof mostrarToast === 'function') mostrarToast('El informe ya se envió. Pulsa «✏️ Editar» para modificarlo.', { icono: '🔒' });
}

// Se intercepta en fase de captura, antes de que llegue a los controles de
// la fila (desplegable de motivos, papelera, observaciones).
(function engancharBloqueoInformeHoy() {
  const cont = document.getElementById('contenidoIncidencias');
  if (!cont) return;
  const SEL = 'td.col-motivo .motivo-select, td.col-motivo .btn-borrar-motivos, .i-obs';
  cont.addEventListener('click', (e) => {
    if (!informeHoyBloqueado() || !e.target.closest(SEL)) return;
    e.preventDefault();
    e.stopPropagation();
    iaAvisoBloqueado();
  }, true);
  cont.addEventListener('focusin', (e) => {
    if (informeHoyBloqueado() && e.target.matches?.('.i-obs')) e.target.blur();
  }, true);
  ['keydown', 'beforeinput', 'paste', 'drop'].forEach(tipo => cont.addEventListener(tipo, (e) => {
    if (!informeHoyBloqueado() || !e.target.matches?.('.i-obs')) return;
    if (tipo === 'keydown' && e.key === 'Tab') return;
    e.preventDefault();
  }, true));
})();

function iaPonerFiltroSoloConIncidencias(valor) {
  if (typeof filtrosIncidencias === 'undefined') return;
  filtrosIncidencias.soloConIncidencias = valor;
  const cb = document.getElementById('filtroSoloConIncidencias');
  if (cb) cb.checked = valor;
  if (typeof actualizarBadgeFiltros === 'function') actualizarBadgeFiltros();
  if (typeof renderAcordeonIncidencias === 'function') {
    renderAcordeonIncidencias(document.getElementById('buscarTiendaIncidencias')?.value || '');
  }
}

function activarEdicionInformeHoy() {
  if (!iaInformeAdmiteActualizacion(informeHoyCache)) return;
  informeHoyEditando = true;
  // Para poder añadir una tienda que se pasó, se quita el filtro "Solo con
  // incidencias" que se pone solo al estar enviado (se repone al terminar).
  iaFiltroSoloIncAntesDeEditar = !!(typeof filtrosIncidencias !== 'undefined' && filtrosIncidencias.soloConIncidencias);
  if (iaFiltroSoloIncAntesDeEditar) iaPonerFiltroSoloConIncidencias(false);
  iaAplicarBloqueoHoy();
  renderBotonEnviarInforme();
}

// Espera a que terminen los guardados en curso (observación que se está
// escribiendo, desplegable abierto) antes de calcular los cambios.
async function iaEsperarGuardadosHoy() {
  if (document.activeElement && document.activeElement.matches?.('.i-obs')) document.activeElement.blur();
  if (typeof cerrarMotivoSelect === 'function') document.querySelectorAll('#contenidoIncidencias .motivo-select.open').forEach(cerrarMotivoSelect);
  await new Promise(r => setTimeout(r, 150));
  const inicio = Date.now();
  while ((window.guardandoIncidencias || 0) > 0 && Date.now() - inicio < 15000) {
    await new Promise(r => setTimeout(r, 150));
  }
  if (typeof esperarRegistrosCambioInforme === 'function') await esperarRegistrosCambioInforme();
}

async function terminarEdicionInformeHoy() {
  const btn = document.getElementById('btnTerminarEdicionHoy');
  if (btn) btn.disabled = true;
  try {
    await iaEsperarGuardadosHoy();
  } finally {
    if (btn) btn.disabled = false;
  }
  informeHoyEditando = false;
  if (iaFiltroSoloIncAntesDeEditar) iaPonerFiltroSoloConIncidencias(true);
  iaFiltroSoloIncAntesDeEditar = null;
  iaAplicarBloqueoHoy();
  renderBotonEnviarInforme();
  await abrirVentanaActualizacionInforme(informeHoyCache);
  await iaActualizarPendientesHoy();
}

document.getElementById('btnEditarInformeHoy')?.addEventListener('click', activarEdicionInformeHoy);
document.getElementById('btnTerminarEdicionHoy')?.addEventListener('click', terminarEdicionInformeHoy);
document.getElementById('btnActualizacionHistorial')?.addEventListener('click', async () => {
  if (typeof historialInformeActual === 'undefined' || !historialInformeActual) return;
  await abrirVentanaActualizacionInforme(historialInformeActual);
  await iaActualizarPendientesHistorial();
});

// Los cambios también pueden llegar desde otras pantallas (Panel
// siniestros) o de otros compañeros: se recuentan cada 2 minutos.
setInterval(() => {
  if (document.visibilityState === 'visible' && typeof sesionActual !== 'undefined' && sesionActual) iaActualizarPendientesHoy();
}, 120000);
window.addEventListener('load', () => { if (typeof sesionActual !== 'undefined' && sesionActual) iaActualizarPendientesHoy(); });
