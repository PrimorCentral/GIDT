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
  // También admite adjuntos "inline" (contenido generado al vuelo, como un
  // PDF, sin subirlo antes a Storage): attachments: [{ filename, content:
  // <Blob|base64 string>, contentType? }]. Si `content` es un Blob se
  // convierte a base64 automáticamente antes de mandarlo a la Edge Function.
  //
  // Lanza un Error con mensaje legible si algo falla, para poder
  // capturarlo con try/catch y mostrar un modalAlert().

  // Blob -> base64 (sin el prefijo "data:...;base64,").
  function blobABase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(',').pop());
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // La Edge Function ya no se protege con un secreto fijo (que por
  // fuerza tenía que viajar en este mismo archivo, visible para
  // cualquiera): ahora comprueba que quien llama tiene una sesión de
  // Supabase Auth real (ver js/auth.js), algo que no se puede copiar
  // del código. `sb.functions.invoke` manda automáticamente el token
  // de la sesión iniciada, así que no hace falta añadir ninguna
  // cabecera aquí.

  // ---------------------------------------------------------------
  // CC global: direcciones que van SIEMPRE en copia en todos los
  // correos que envía la app (roturas, facturación, informes...),
  // sin tener que tocar cada sitio que llama a enviarEmail().
  // Se editan en Configuración → Emails (tabla cc_global_emails),
  // detrás del permiso "config_cc_transporte" (ver permisos.js).
  // ---------------------------------------------------------------
  async function obtenerCCGlobal() {
    try {
      const { data, error } = await sb.from('cc_global_emails').select('email').eq('activo', true);
      if (error) throw error;
      return (data || []).map(r => r.email);
    } catch (err) {
      console.error('Error obteniendo el CC global:', err);
      return []; // si falla, se envía igualmente el correo (sin bloquear al usuario)
    }
  }

  async function enviarEmail({ to, cc, subject, html, text, attachmentUrls, attachments } = {}) {
    if (!to || !subject || !html) {
      throw new Error('Faltan datos para enviar el correo (to, subject, html).');
    }

    const ccPropio = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const ccGlobal = await obtenerCCGlobal();
    const ccFinal = Array.from(new Set([...ccPropio, ...ccGlobal].filter(Boolean)));

    let attachmentsFinal;
    if (attachments && attachments.length) {
      attachmentsFinal = await Promise.all(attachments.map(async a => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content instanceof Blob ? await blobABase64(a.content) : a.content
      })));
    }

    const { data, error } = await sb.functions.invoke('send-email', {
      body: { to, cc: ccFinal.length ? ccFinal : undefined, subject, html, text, attachmentUrls, attachments: attachmentsFinal }
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

    if (typeof mostrarToast === 'function') mostrarToast('Correo enviado correctamente');

    return data; // { ok: true, adjuntos: N }
  }

  // ---------------------------------------------------------------
