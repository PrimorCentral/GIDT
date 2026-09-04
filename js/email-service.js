  // Servicio de envío de correo (vía Edge Function Supabase "send-email")
  // ---------------------------------------------------------------
  // Uso:
  //   await enviarEmail({
  //     to: ['agencia@ejemplo.com'],
  //     subject: 'RECLAMACIÓN ROTURA – NERVION – 2026-09-04',
  //     html: '<p>...</p>',
  //     attachmentUrls: ['https://.../foto1.jpg']
  //   });
  //
  // Lanza un Error con mensaje legible si algo falla, para poder
  // capturarlo con try/catch y mostrar un modalAlert().

  // Debe coincidir EXACTAMENTE con el secret "FUNCTION_SECRET" configurado
  // en Supabase → Edge Functions → Secrets para este proyecto.
  const EMAIL_FUNCTION_SECRET = '1d970db242f11f82ee869c5d0070438902fc4b2ee8dd4dcf74c1349e65699bba';

  async function enviarEmail({ to, cc, subject, html, text, attachmentUrls } = {}) {
    if (!to || !subject || !html) {
      throw new Error('Faltan datos para enviar el correo (to, subject, html).');
    }

    const { data, error } = await sb.functions.invoke('send-email', {
      body: { to, cc, subject, html, text, attachmentUrls },
      headers: { 'x-function-secret': EMAIL_FUNCTION_SECRET }
    });

    if (error) {
      // sb.functions.invoke mete el cuerpo de error de la function en error.context si está disponible
      let detalle = error.message || 'Error desconocido enviando el correo.';
      try {
        const cuerpo = await error.context?.json?.();
        if (cuerpo?.error) detalle = cuerpo.error;
      } catch { /* noop */ }
      throw new Error(detalle);
    }

    if (!data?.ok) {
      throw new Error('El servicio de correo no confirmó el envío.');
    }

    return data; // { ok: true, adjuntos: N }
  }

  // ---------------------------------------------------------------
