  // Plantillas de correo
  // ---------------------------------------------------------------
  // Plantillas reales de "Aviso de roturas" y "Aviso de faltas".
  // Ampliable en el futuro con más funciones (informe diario, resúmenes...).

  // Formatea una fecha ISO (YYYY-MM-DD) al formato es-ES (DD/MM/AAAA)
  function fechaEs(fechaISO) {
    if (!fechaISO) return '—';
    return formatearFechaCorta(new Date(fechaISO + 'T00:00:00'));
  }

  function plantillaHtmlRotura(tienda, fechaInformeStr, fechaLimite) {
    return `
<div style="font-family: Arial, sans-serif; background-color: #f4f7fa; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7fa">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #edf2f7; border-radius: 24px;">
          <tr>
            <td align="center" style="padding: 32px 40px; border-bottom: 1px solid #f1f5f9;">
              <h2 style="margin: 0; color: #1e293b; font-family: Arial, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                AVISO DE ROTURAS<br> EN LA ENTREGA DE MERCANCIA
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="20" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#fef2f2" style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ef4444; text-transform: uppercase; white-space: nowrap;">
                          Tienda: ${tienda.toUpperCase()}
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; white-space: nowrap;">
                          Recepción: ${fechaInformeStr}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">Buenas,</p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Se han detectado varias incidencias en la mercancía recibida en nuestra tienda de <b style="color: #000000;">${tienda.toUpperCase()}</b> (ver fecha de recepción arriba), presentando algunos bultos rotos y golpeados.
              </p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Tras haber revisado la mercancia en nuestra tienda, os podemos confirmar que se han producido algunas <b style="color: #000000;">ROTURAS</b>.<br><br> 
                Mis compañeros en los próximos días os pasará el cargo correspondiente.
              </p>
              <p style="margin-top: 16px; color: #1e293b; font-size: 15px; line-height: 1.6; font-weight: 600;">
                Es vital que tengáis especial cuidado con nuestra mercancía puesto que es muy frágil y costosa. <br><br>El hecho de que se produzcan estas incidencias nos afecta en las ventas y en el normal funcionamiento de la tienda.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 20px;">
                      <tr>
                        <td align="center" style="padding: 30px 20px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding-bottom: 15px; color: #b45309; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                                ⚠️ ACCIÓN REQUERIDA (SEGURO/RECOGIDA)
                              </td>
                            </tr>
                          </table>
                          <table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #fde68a; border-radius: 12px; width: 280px;">
                            <tr>
                              <td align="center" style="padding: 20px;">
                                <div style="font-family: Arial, sans-serif; font-size: 11px; color: #b45309; font-weight: bold; text-transform: uppercase;">
                                  FECHA LÍMITE DE RECOGIDA:
                                </div>
                                <div style="font-family: Arial, sans-serif; font-size: 28px; font-weight: 800; color: #d97706; margin-top: 5px;">
                                  ${fechaLimite}
                                </div>
                              </td>
                            </tr>
                          </table>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr><td height="35" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                          </table>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px;">
                            <tr>
                              <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; color: #92400e; font-style: italic; line-height: 18px;">
                                * En caso de necesitar la mercancía averiada para el seguro se deberá recoger en nuestra tienda en los próximos 15 días.
                              </td>
                            </tr>
                            <tr><td height="15" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                            <tr>
                              <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; color: #92400e; font-style: italic; line-height: 18px;">
                                Transcurrido la fecha limite más arriba indicada, procederemos a su destrucción y no podrá reclamarnos dicha mercancía.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px; border-top: 0px solid #f1f5f9; padding-top: 0px;">
              <tr>
              <td align="center"> <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0; text-align: center;"> Atentamente,<br>
              <b style="color: #1e293b;">Departamento de Transporte</b>
              </p>
             <p style="margin-top: 16px; margin-bottom: 0; text-align: center;">
             <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" 
             alt="PRIMOR" 
             width="150" 
             style="display: inline-block; border:0; margin: 0 auto;"> </p>
            </td>
            </tr>
          </table>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="padding: 20px; border-top: 1px solid #f1f5f9;">
              <span style="font-family: Arial, sans-serif; font-size: 9px; color: #cbd5e1; font-weight: 400; text-transform: uppercase; letter-spacing: 2px;">
              CORREO GENERADO AUTOMATICAMENTE POR EL SISTEMA GIDT
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
  }

  function plantillaHtmlFalta(tienda, fechaInformeStr) {
    return `
<div style="font-family: Arial, sans-serif; background-color: #f4f7fa; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7fa">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #edf2f7; border-radius: 24px;">
          <tr>
            <td align="center" style="padding: 32px 40px; border-bottom: 1px solid #f1f5f9;">
              <h2 style="margin: 0; color: #1e293b; font-family: Arial, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
              AVISO DE <span style="color: #ff0000;">FALTAS</span><br> EN LA ENTREGA DE MERCANCIA
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="20" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#fef2f2" style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 50px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ef4444; text-transform: uppercase; white-space: nowrap;">
                          Tienda: ${tienda.toUpperCase()}
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 50px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; white-space: nowrap;">
                          Recepción: ${fechaInformeStr}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">Buenas,</p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Se han detectado varias incidencias en la mercancía recibida en nuestra tienda de <b style="color: #000000;">${tienda.toUpperCase()}</b> (ver fecha de recepción arriba), con bultos/mercancia faltantes.
              </p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Tras haber revisado la mercancia en nuestra tienda, os podemos confirmar que se han producido algunas <b style="color: #ef4444;">FALTAS</b>.<br><br> 
                Mis compañeros en los próximos días os pasará el cargo correspondiente.
              </p>
              <p style="margin-top: 16px; color: #1e293b; font-size: 15px; line-height: 1.6; font-weight: 600;">
                Es vital que tengáis especial cuidado con nuestra mercancía puesto que es muy frágil y costosa. <br><br>El hecho de que se produzcan estas incidencias nos afecta en las ventas y en el normal funcionamiento de la tienda.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 40px;">
              <tr>
              <td align="center" style="text-align: center;">
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0;">
              Atentamente,<br>
             <b style="color: #1e293b;">Departamento de Transporte</b>
             </p>
             <p style="margin-top: 15px; margin-bottom: 0;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" 
             alt="PRIMOR" 
             width="150" 
             style="display: inline-block; border:0;">
            </p>
           </td>
           </tr>
         </table>
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="padding: 20px; border-top: 1px solid #f1f5f9; border-radius: 0 0 24px 24px;">
              <span style="font-family: Arial, sans-serif; font-size: 9px; color: #cbd5e1; font-weight: 400; text-transform: uppercase; letter-spacing: 2px;">
              CORREO GENERADO AUTOMATICAMENTE POR EL SISTEMA GIDT
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
  }

  function plantillaHtmlMixto(tienda, fechaInformeStr, fechaLimite) {
    return `
<div style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f7fa; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7fa">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #edf2f7; border-radius: 24px;">
          <tr>
            <td align="center" style="padding: 32px 40px; border-bottom: 1px solid #f1f5f9;">
              <h2 style="margin: 0; color: #1e293b; font-family: Arial, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
              AVISO DE ROTURAS Y <span style="color: #ff0000;">FALTAS</span><br> EN LA ENTREGA DE MERCANCIA
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="20" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#fef2f2" style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 50px;">
                      <tr><td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ef4444; text-transform: uppercase;">Tienda: ${tienda.toUpperCase()}</td></tr>
                    </table>
                  </td>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 50px;">
                      <tr><td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase;">Recepción: ${fechaInformeStr}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 10px 40px; background-color: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family: Arial, sans-serif; font-size: 15px; color: #475569; line-height: 1.6;">
                    Buenas,<br><br>
                    Se han detectado varias incidencias en la mercancía recibida en nuestra tienda de <b style="color: #000000;">${tienda.toUpperCase()}</b> (ver fecha de recepción arriba), presentando bultos faltantes y bultos rotos y golpeados. <br><br><br><br>
                    Tras haber revisado la mercancia en nuestra tienda, os podemos confirmar que se han producido algunas <b style="color: #000000;">ROTURAS</b> y <b style="color: #ef4444;">FALTAS</b>.<br><br>
                    Mis compañeros en los próximos días os pasará el cargo correspondiente.<br><br>
                    <strong>Es vital que tengáis especial cuidado con nuestra mercancía puesto que es muy frágil y costosa.</strong><br><br>
                    <strong>El hecho de que se produzcan estas incidencias nos afecta en las ventas y en el normal funcionamiento de la tienda.</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td height="30" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
          <tr>
            <td style="padding: 0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffbeb" style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 20px;">
                <tr>
                  <td align="center" style="padding: 24px 24px 30px 24px;">
                    <div style="margin-bottom: 15px; color: #b45309; font-family: Arial, sans-serif; font-size: 12px; font-weight: 800; text-transform: uppercase;">
                      ⚠️ ACCIÓN REQUERIDA (SEGURO/RECOGIDA)
                    </div>
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color: #ffffff; border: 1px solid #fde68a; border-radius: 12px;">
                      <tr>
                        <td align="center" style="padding: 16px 30px;">
                          <div style="font-family: Arial, sans-serif; font-size: 11px; color: #b45309; font-weight: 700;">FECHA LÍMITE DE RECOGIDA:</div>
                          <div style="font-family: Arial, sans-serif; font-size: 26px; font-weight: 800; color: #d97706;">${fechaLimite}</div>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td height="40" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                    </table>
                    <div style="font-family: Arial, sans-serif; font-size: 12px; color: #92400e; font-style: italic; line-height: 1.5;">
                      * En caso de necesitar la mercancía averiada para el seguro se deberá recoger en nuestra tienda en los próximos 15 días.<br><br>
                      Transcurrido la fecha limite más arriba indicada, procederemos a su destrucción y no podrá reclamarnos dicha mercancía.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td height="30" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px;">
              <tr>
              <td align="center" style="text-align: center;">
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0;">
              Atentamente,<br>
             <b style="color: #1e293b;">Departamento de Transporte</b>
             </p>
             <p style="margin-top: 15px; margin-bottom: 0;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" 
             alt="PRIMOR" 
             width="150" 
             style="display: inline-block; border:0;">
            </p>
           </td>
           </tr>
         </table>
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="padding: 20px; border-top: 1px solid #f1f5f9; border-radius: 0 0 24px 24px;">
              <span style="font-family: Arial, sans-serif; font-size: 9px; color: #cbd5e1; font-weight: 400; text-transform: uppercase; letter-spacing: 2px;">
              CORREO GENERADO AUTOMATICAMENTE POR EL SISTEMA GIDT
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
  }

  // Correo de "Resumen mensual" a una agencia (Análisis → Reportes
  // mensuales → Enviar a agencias), con el PDF adjunto (ver
  // js/reportes-mensuales-envio.js). Mismo texto que se mandaba a mano:
  // "Buenos días, adjuntamos resumen de las entregas en el pasado mes de
  // X con las incidencias que hayan tenido lugar. Gracias, un saludo".
  function plantillaHtmlResumenMensual(nombreMesConAnio) {
    return `
<div style="font-family: Arial, sans-serif; background-color: #f4f7fa; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7fa">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #edf2f7; border-radius: 24px;">
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">Buenos días,</p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Adjuntamos resumen de las entregas de <b style="color: #000000;">${escapeHtml(nombreMesConAnio)}</b> con las incidencias que hayan tenido lugar.
              </p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Gracias, un saludo.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
                <tr>
                  <td align="center" style="text-align: center;">
                    <p style="margin-top: 15px; margin-bottom: 0;">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png"
                       alt="PRIMOR"
                       width="150"
                       style="display: inline-block; border:0;">
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="padding: 20px; border-top: 1px solid #f1f5f9; border-radius: 0 0 24px 24px;">
              <span style="font-family: Arial, sans-serif; font-size: 9px; color: #cbd5e1; font-weight: 400; text-transform: uppercase; letter-spacing: 2px;">
              CORREO GENERADO AUTOMATICAMENTE POR EL SISTEMA GIDT
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
  }

  // Genera { subject, html, text } para el siniestro dado (ROTURA, FALTA o MIXTO),
  // usando la plantilla correspondiente.
  function plantillaSiniestro(s, fechaInformeISO) {
    const t = s.incidencia.tiendas || {};
    const tienda = t.nombre || '—';
    const fechaInformeStr = fechaEs(fechaInformeISO);
    const fechaLimite = fechaEs(s.fecha_limite);

    let html, subject, text;

    if (s.tipo === 'ROTURA') {
      html = plantillaHtmlRotura(tienda, fechaInformeStr, fechaLimite);
      subject = `INCIDENCIA POR ROTURAS EN EL ENVIO – ${tienda.toUpperCase()} – ${fechaInformeStr}`;
      text = `Se han detectado roturas en la mercancía recibida en la tienda ${tienda} (recepción ${fechaInformeStr}). Fecha límite de recogida para reclamación al seguro: ${fechaLimite}.`;
    } else if (s.tipo === 'MIXTO') {
      html = plantillaHtmlMixto(tienda, fechaInformeStr, fechaLimite);
      subject = `FALTAS E INCIDENCIAS EN EL ENVIO – ${tienda.toUpperCase()} – ${fechaInformeStr}`;
      text = `Se han detectado roturas y faltas en la mercancía recibida en la tienda ${tienda} (recepción ${fechaInformeStr}). Fecha límite de recogida para reclamación al seguro: ${fechaLimite}.`;
    } else {
      html = plantillaHtmlFalta(tienda, fechaInformeStr);
      subject = `FALTAS EN EL ENVIO – ${tienda.toUpperCase()} – ${fechaInformeStr}`;
      text = `Se han detectado faltas en la mercancía recibida en la tienda ${tienda} (recepción ${fechaInformeStr}).`;
    }

    return { subject, html, text };
  }

  // ---------------------------------------------------------------
  // Plantillas "en almacén de la agencia" (origen mercancía = AGENCIA):
  // cuando la agencia llama para que un operario se desplace a SU
  // almacén a arreglar un palet, y allí se detectan roturas y/o faltas.
  // Mismo pie de página que las de arriba; el cuerpo cambia porque la
  // reparación ocurre en las instalaciones de la agencia, no en tienda.
  // ---------------------------------------------------------------

  function plantillaHtmlRoturaAgencia(tienda, fechaInformeStr, fechaLimite) {
    return `
<div style="font-family: Arial, sans-serif; background-color: #f4f7fa; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7fa">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #edf2f7; border-radius: 24px;">
          <tr>
            <td align="center" style="padding: 32px 40px; border-bottom: 1px solid #f1f5f9;">
              <h2 style="margin: 0; color: #1e293b; font-family: Arial, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                AVISO DE ROTURAS<br> EN NUESTRO PALET DE TIENDA
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="20" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#fef2f2" style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ef4444; text-transform: uppercase; white-space: nowrap;">
                          Tienda: ${tienda.toUpperCase()}
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; white-space: nowrap;">
                          FECHA: ${fechaInformeStr}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">Buenas,</p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Nuestros operarios se desplazaron a vuestras instalaciones para arreglar un palet de nuestra tienda <b style="color: #000000;">${tienda.toUpperCase()}</b>, presentando algunos bultos rotos y golpeados.
              </p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Tras haber revisado la mercancia en vuestras instalaciones, os podemos confirmar que se han producido algunas <b style="color: #000000;">ROTURAS</b>.<br><br> 
                Mis compañeros en los próximos días os pasará el cargo correspondiente.
              </p>
              <p style="margin-top: 16px; color: #1e293b; font-size: 15px; line-height: 1.6; font-weight: 600;">
                Es vital que tengáis especial cuidado con nuestra mercancía puesto que es muy frágil y costosa. <br><br>El hecho de que se produzcan estas incidencias nos afecta en las ventas y en el normal funcionamiento de la tienda.><br><br>La mercancia dañada la podreis recoger en nuestro almacen de Calle Escritora Carmen Martin Gaite Nº10, preguntando por Jose Luis Franco.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 20px;">
                      <tr>
                        <td align="center" style="padding: 30px 20px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding-bottom: 15px; color: #b45309; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                                ⚠️ ACCIÓN REQUERIDA (SEGURO/RECOGIDA)
                              </td>
                            </tr>
                          </table>
                          <table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #fde68a; border-radius: 12px; width: 280px;">
                            <tr>
                              <td align="center" style="padding: 20px;">
                                <div style="font-family: Arial, sans-serif; font-size: 11px; color: #b45309; font-weight: bold; text-transform: uppercase;">
                                  FECHA LÍMITE DE RECOGIDA:
                                </div>
                                <div style="font-family: Arial, sans-serif; font-size: 28px; font-weight: 800; color: #d97706; margin-top: 5px;">
                                  ${fechaLimite}
                                </div>
                              </td>
                            </tr>
                          </table>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr><td height="35" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                          </table>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px;">
                            <tr>
                              <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; color: #92400e; font-style: italic; line-height: 18px;">
                                * En caso de necesitar la mercancía averiada para el seguro se deberá recoger en nuestro almacen arriba indicado en los próximos 15 días.
                              </td>
                            </tr>
                            <tr><td height="15" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                            <tr>
                              <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; color: #92400e; font-style: italic; line-height: 18px;">
                                Transcurrido la fecha limite más arriba indicada, procederemos a su destrucción y no podrá reclamarnos dicha mercancía.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px; border-top: 0px solid #f1f5f9; padding-top: 0px;">
              <tr>
              <td align="center"> <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0; text-align: center;"> Atentamente,<br>
              <b style="color: #1e293b;">Departamento de Transporte</b>
              </p>
             <p style="margin-top: 16px; margin-bottom: 0; text-align: center;">
             <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" 
             alt="PRIMOR" 
             width="150" 
             style="display: inline-block; border:0; margin: 0 auto;"> </p>
            </td>
            </tr>
          </table>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="padding: 20px; border-top: 1px solid #f1f5f9;">
              <span style="font-family: Arial, sans-serif; font-size: 9px; color: #cbd5e1; font-weight: 400; text-transform: uppercase; letter-spacing: 2px;">
              CORREO GENERADO AUTOMATICAMENTE POR EL SISTEMA GIDT
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
  }

  // Igual que la de ROTURA en almacén de agencia, pero sin la frase de
  // "la mercancía dañada la podréis recoger…" ni el aviso de fecha límite
  // de recogida (una FALTA no tiene nada físico que recoger).
  function plantillaHtmlFaltaAgencia(tienda, fechaInformeStr) {
    return `
<div style="font-family: Arial, sans-serif; background-color: #f4f7fa; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7fa">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #edf2f7; border-radius: 24px;">
          <tr>
            <td align="center" style="padding: 32px 40px; border-bottom: 1px solid #f1f5f9;">
              <h2 style="margin: 0; color: #1e293b; font-family: Arial, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                AVISO DE <span style="color: #ff0000;">FALTAS</span><br> EN NUESTRO PALET DE TIENDA
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="20" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#fef2f2" style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ef4444; text-transform: uppercase; white-space: nowrap;">
                          Tienda: ${tienda.toUpperCase()}
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; white-space: nowrap;">
                          FECHA: ${fechaInformeStr}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">Buenas,</p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Nuestros operarios se desplazaron a vuestras instalaciones para arreglar un palet de nuestra tienda <b style="color: #000000;">${tienda.toUpperCase()}</b>, presentando bultos/mercancia faltantes.
              </p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Tras haber revisado la mercancia en vuestras instalaciones, os podemos confirmar que se han producido algunas <b style="color: #ef4444;">FALTAS</b>.<br><br> 
                Mis compañeros en los próximos días os pasará el cargo correspondiente.
              </p>
              <p style="margin-top: 16px; color: #1e293b; font-size: 15px; line-height: 1.6; font-weight: 600;">
                Es vital que tengáis especial cuidado con nuestra mercancía puesto que es muy frágil y costosa. <br><br>El hecho de que se produzcan estas incidencias nos afecta en las ventas y en el normal funcionamiento de la tienda.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px;">
              <tr>
              <td align="center"> <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0; text-align: center;"> Atentamente,<br>
              <b style="color: #1e293b;">Departamento de Transporte</b>
              </p>
             <p style="margin-top: 16px; margin-bottom: 0; text-align: center;">
             <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" 
             alt="PRIMOR" 
             width="150" 
             style="display: inline-block; border:0; margin: 0 auto;"> </p>
            </td>
            </tr>
          </table>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="padding: 20px; border-top: 1px solid #f1f5f9;">
              <span style="font-family: Arial, sans-serif; font-size: 9px; color: #cbd5e1; font-weight: 400; text-transform: uppercase; letter-spacing: 2px;">
              CORREO GENERADO AUTOMATICAMENTE POR EL SISTEMA GIDT
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
  }

  // Igual que la de ROTURA en almacén de agencia (con la frase de recogida
  // y el aviso de fecha límite), pero mencionando roturas Y faltas.
  function plantillaHtmlMixtoAgencia(tienda, fechaInformeStr, fechaLimite) {
    return `
<div style="font-family: Arial, sans-serif; background-color: #f4f7fa; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7fa">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #edf2f7; border-radius: 24px;">
          <tr>
            <td align="center" style="padding: 32px 40px; border-bottom: 1px solid #f1f5f9;">
              <h2 style="margin: 0; color: #1e293b; font-family: Arial, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                AVISO DE ROTURAS Y <span style="color: #ff0000;">FALTAS</span><br> EN NUESTRO PALET DE TIENDA
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="20" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#fef2f2" style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ef4444; text-transform: uppercase; white-space: nowrap;">
                          Tienda: ${tienda.toUpperCase()}
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding: 4px;">
                    <table cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px;">
                      <tr>
                        <td style="padding: 6px 16px; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; white-space: nowrap;">
                          FECHA: ${fechaInformeStr}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">Buenas,</p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Nuestros operarios se desplazaron a vuestras instalaciones para arreglar un palet de nuestra tienda <b style="color: #000000;">${tienda.toUpperCase()}</b>, presentando bultos faltantes y bultos rotos y golpeados.
              </p>
              <p style="margin-top: 16px; color: #475569; font-size: 15px; line-height: 1.6;">
                Tras haber revisado la mercancia en vuestras instalaciones, os podemos confirmar que se han producido algunas <b style="color: #000000;">ROTURAS</b> y <b style="color: #ef4444;">FALTAS</b>.<br><br> 
                Mis compañeros en los próximos días os pasará el cargo correspondiente.
              </p>
              <p style="margin-top: 16px; color: #1e293b; font-size: 15px; line-height: 1.6; font-weight: 600;">
                Es vital que tengáis especial cuidado con nuestra mercancía puesto que es muy frágil y costosa. <br><br>El hecho de que se produzcan estas incidencias nos afecta en las ventas y en el normal funcionamiento de la tienda.><br><br>La mercancia dañada la podreis recoger en nuestro almacen de Calle Escritora Carmen Martin Gaite Nº10, preguntando por Jose Luis Franco.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 20px;">
                      <tr>
                        <td align="center" style="padding: 30px 20px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding-bottom: 15px; color: #b45309; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                                ⚠️ ACCIÓN REQUERIDA (SEGURO/RECOGIDA)
                              </td>
                            </tr>
                          </table>
                          <table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border: 1px solid #fde68a; border-radius: 12px; width: 280px;">
                            <tr>
                              <td align="center" style="padding: 20px;">
                                <div style="font-family: Arial, sans-serif; font-size: 11px; color: #b45309; font-weight: bold; text-transform: uppercase;">
                                  FECHA LÍMITE DE RECOGIDA:
                                </div>
                                <div style="font-family: Arial, sans-serif; font-size: 28px; font-weight: 800; color: #d97706; margin-top: 5px;">
                                  ${fechaLimite}
                                </div>
                              </td>
                            </tr>
                          </table>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr><td height="35" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                          </table>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px;">
                            <tr>
                              <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; color: #92400e; font-style: italic; line-height: 18px;">
                                * En caso de necesitar la mercancía averiada para el seguro se deberá recoger en nuestro almacen arriba indicado en los próximos 15 días.
                              </td>
                            </tr>
                            <tr><td height="15" style="font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                            <tr>
                              <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; color: #92400e; font-style: italic; line-height: 18px;">
                                Transcurrido la fecha limite más arriba indicada, procederemos a su destrucción y no podrá reclamarnos dicha mercancía.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px; border-top: 0px solid #f1f5f9; padding-top: 0px;">
              <tr>
              <td align="center"> <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0; text-align: center;"> Atentamente,<br>
              <b style="color: #1e293b;">Departamento de Transporte</b>
              </p>
             <p style="margin-top: 16px; margin-bottom: 0; text-align: center;">
             <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Primor_Logo.png/960px-Primor_Logo.png" 
             alt="PRIMOR" 
             width="150" 
             style="display: inline-block; border:0; margin: 0 auto;"> </p>
            </td>
            </tr>
          </table>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="padding: 20px; border-top: 1px solid #f1f5f9;">
              <span style="font-family: Arial, sans-serif; font-size: 9px; color: #cbd5e1; font-weight: 400; text-transform: uppercase; letter-spacing: 2px;">
              CORREO GENERADO AUTOMATICAMENTE POR EL SISTEMA GIDT
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
  }

  // Genera { subject, html, text } para un siniestro con origen mercancía
  // = AGENCIA (rotura/falta detectada al reparar un palet en el propio
  // almacén de la agencia, no en la entrega a tienda). s debe traer
  // también agenciaNombre.
  function plantillaSiniestroAgencia(s, fechaInformeISO) {
    const t = s.incidencia.tiendas || {};
    const tienda = t.nombre || '—';
    const agenciaNombre = s.agenciaNombre || '—';
    const fechaInformeStr = fechaEs(fechaInformeISO);
    const fechaLimite = fechaEs(s.fecha_limite);

    let html, subject, text;

    if (s.tipo === 'ROTURA') {
      html = plantillaHtmlRoturaAgencia(tienda, fechaInformeStr, fechaLimite);
      subject = `ROTURA EN ALMACEN ${agenciaNombre.toUpperCase()} - ${tienda.toUpperCase()} - ${fechaInformeStr}`;
      text = `Rotura detectada en el almacén de ${agenciaNombre} al reparar un palet de la tienda ${tienda} (fecha ${fechaInformeStr}). Fecha límite de recogida: ${fechaLimite}.`;
    } else if (s.tipo === 'MIXTO') {
      html = plantillaHtmlMixtoAgencia(tienda, fechaInformeStr, fechaLimite);
      subject = `ROTURA Y FALTA EN ALMACEN ${agenciaNombre.toUpperCase()} - ${tienda.toUpperCase()} - ${fechaInformeStr}`;
      text = `Rotura y falta detectadas en el almacén de ${agenciaNombre} al reparar un palet de la tienda ${tienda} (fecha ${fechaInformeStr}). Fecha límite de recogida: ${fechaLimite}.`;
    } else {
      html = plantillaHtmlFaltaAgencia(tienda, fechaInformeStr);
      subject = `FALTA EN ALMACEN ${agenciaNombre.toUpperCase()} - ${tienda.toUpperCase()} - ${fechaInformeStr}`;
      text = `Falta detectada en el almacén de ${agenciaNombre} al reparar un palet de la tienda ${tienda} (fecha ${fechaInformeStr}).`;
    }

    return { subject, html, text };
  }

  // ---------------------------------------------------------------

  // ---------------------------------------------------------------
  // Correo a Facturación (envío del albarán + fotos de un siniestro del
  // Panel siniestros). Antes vivía en panel-siniestros.js — movida aquí
  // porque este archivo es el sitio de todas las plantillas de correo.
  // ---------------------------------------------------------------

  const PS_TIPO_CUERPO_FACTURACION = {
    ROTURA: (tienda) => `todas las fotos de la rotura en la tienda de ${tienda}`,
    FALTAS: (tienda) => `todas las fotos y productos que han faltado en la tienda de ${tienda}`,
    'FALTAS Y ROTURAS': (tienda) => `todas las fotos y productos afectados (roturas y faltas) en la tienda de ${tienda}`
  };

  // Asunto por tipo de siniestro: tienda, agencia (si se pasa), fecha del
  // siniestro y nombre comercial de la agencia (si se pasa).
  function psAsuntoFacturacion(tipo, tienda, fecha, agenciaNombre, nombreComercial) {
    const t = tienda.toUpperCase();
    const partes = [t];
    if (agenciaNombre) partes.push(agenciaNombre.toUpperCase());
    partes.push(fecha);
    if (nombreComercial) partes.push(nombreComercial.toUpperCase());
    const base = partes.join(' - ');
    if (tipo === 'ROTURA') return `INCIDENCIA POR ROTURAS EN ${base}`;
    // FALTAS y FALTAS Y ROTURAS comparten el mismo asunto.
    return `FALTAS EN EL ENVIO E INCIDENCIA POR ROTURAS EN ${base}`;
  }

  // Construye el correo tal cual lo redactáis a mano hoy: asunto según el
  // tipo de siniestro (tienda, agencia, fecha y nombre comercial de la
  // agencia), cuerpo sencillo en texto plano, fotos + PDF adjuntos.
  function plantillaFacturacionAlbaran(s, nombreComercialAgencia) {
    const fecha = fechaEs(s.fecha);
    const tienda = s.tienda_nombre || '';
    const subject = psAsuntoFacturacion(s.tipo, tienda, fecha, s.agencia_nombre, nombreComercialAgencia);

    const linea = (PS_TIPO_CUERPO_FACTURACION[s.tipo] || ((t) => `toda la documentación de la incidencia en la tienda de ${t}`))(tienda);

    const html = `
      <div style="font-family:Arial, sans-serif; font-size:14px; color:#1e293b; line-height:1.5;">
        <p style="margin:0 0 14px;">Buenas, aquí adjuntamos ${linea}</p>
        <p style="margin:0 0 14px;">De la agencia ${escapeHtml(s.agencia_nombre || '')}, el día: ${fecha}</p>
        <p style="margin:0;">Gracias, un saludo.</p>
      </div>`;

    const text = `Buenas, aquí adjuntamos ${linea}\nDe la agencia ${s.agencia_nombre || ''}, el día: ${fecha}\n\nGracias, un saludo.`;

    return { subject, html, text };
  }
