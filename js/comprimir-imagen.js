// ---------------------------------------------------------------
// Compresión de imágenes en el navegador antes de subirlas
// ---------------------------------------------------------------
// Redimensiona y recomprime cualquier foto (venga de móvil, cámara
// réflex o captura de pantalla) a un JPEG ligero antes de subirla a
// Supabase Storage. Con esto una foto de 3-6 MB se queda normalmente
// en 150-400 KB, así el 1 GB del plan gratuito rinde muchísimas veces
// más sin cambiar de proveedor de almacenamiento.
//
// Uso: const archivoListo = await comprimirImagenParaSubida(file);
//      // archivoListo es un File más pequeño, listo para .upload()
//
// Si el archivo no es una imagen (p.ej. un PDF de factura), o si por
// lo que sea la "compresión" saliera más pesada que el original (raro,
// pasa con imágenes ya muy pequeñas), se devuelve el archivo tal cual.
// ---------------------------------------------------------------

function comprimirImagenParaSubida(file, opciones = {}) {
  const {
    maxAncho = 1600,
    maxAlto = 1600,
    calidad = 0.75
  } = opciones;

  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif') {
      resolve(file); // no tocamos PDFs, GIFs (animaciones) ni archivos no-imagen
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const escala = Math.min(1, maxAncho / img.width, maxAlto / img.height);
      const ancho = Math.round(img.width * escala);
      const alto = Math.round(img.height * escala);

      const canvas = document.createElement('canvas');
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, ancho, alto);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob || blob.size >= file.size) {
          resolve(file); // el original ya era más pequeño: nos lo quedamos
          return;
        }
        const nombreJpg = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        resolve(new File([blob], nombreJpg, { type: 'image/jpeg' }));
      }, 'image/jpeg', calidad);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // si algo falla al leer la imagen, subimos el original
    };

    img.src = url;
  });
}
