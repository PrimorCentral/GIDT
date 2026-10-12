// ---------------------------------------------------------------
// Enlaces temporales para los archivos de Storage (fotos, facturas,
// albaranes y justificantes de siniestros)
// ---------------------------------------------------------------
// En la base de datos se siguen guardando las URLs de siempre
// (…/storage/v1/object/public/{bucket}/{path}). Pero en cuanto los
// buckets pasan a ser privados, esas URLs dejan de abrirse fuera de
// GIDT. Por eso, antes de mostrar un archivo, la app le pide a Supabase
// un enlace temporal ("firmado") que solo se concede con la sesión
// iniciada y que caduca pasado un rato.
//
// Funciona igual con los buckets públicos que con los privados, así que
// este código se puede subir antes de cambiar los buckets sin que nada
// cambie para nadie.
//
// Cualquier URL que no sea de estos buckets (por ejemplo, el blob del
// PDF de resumen generado al vuelo) se devuelve tal cual.

const ARCHIVOS_BUCKETS_PRIVADOS = ['siniestros-fotos', 'siniestros-facturas'];
const ARCHIVOS_SEGUNDOS_VALIDEZ = 60 * 60;      // 1 hora
const ARCHIVOS_MARGEN_RENOVAR_MS = 5 * 60 * 1000; // se renueva si le quedan < 5 min

// urlGuardada -> { url: enlaceTemporal, caduca: timestampMs }
const archivosCacheEnlaces = new Map();

// Extrae { bucket, path } de una URL de Storage de los buckets de
// siniestros. Devuelve null para cualquier otra URL.
function archivoDesdeUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
  if (!m) return null;
  try {
    const bucket = decodeURIComponent(m[1]);
    if (!ARCHIVOS_BUCKETS_PRIVADOS.includes(bucket)) return null;
    return { bucket, path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

// Devuelve, para cada URL guardada, un enlace que se pueda abrir ahora
// mismo (mismo orden que la entrada). Si algo falla con alguna, se
// devuelve la URL original para no dejar el hueco vacío.
async function firmarUrlsArchivos(urls) {
  const lista = Array.isArray(urls) ? urls : [];
  const resultado = lista.slice();
  const ahora = Date.now();
  const pendientesPorBucket = new Map(); // bucket -> [{ idx, url, path }]

  lista.forEach((url, idx) => {
    const archivo = archivoDesdeUrl(url);
    if (!archivo) return;
    const enCache = archivosCacheEnlaces.get(url);
    if (enCache && enCache.caduca - ahora > ARCHIVOS_MARGEN_RENOVAR_MS) {
      resultado[idx] = enCache.url;
      return;
    }
    if (!pendientesPorBucket.has(archivo.bucket)) pendientesPorBucket.set(archivo.bucket, []);
    pendientesPorBucket.get(archivo.bucket).push({ idx, url, path: archivo.path });
  });

  await Promise.all(Array.from(pendientesPorBucket.entries()).map(async ([bucket, items]) => {
    try {
      const { data, error } = await sb.storage
        .from(bucket)
        .createSignedUrls(items.map(i => i.path), ARCHIVOS_SEGUNDOS_VALIDEZ);
      if (error) throw error;
      const caduca = Date.now() + ARCHIVOS_SEGUNDOS_VALIDEZ * 1000;
      items.forEach((item, n) => {
        const firmado = data?.[n]?.signedUrl;
        if (firmado && !data[n].error) {
          resultado[item.idx] = firmado;
          archivosCacheEnlaces.set(item.url, { url: firmado, caduca });
        } else {
          console.error(`No se pudo generar enlace temporal (${bucket}/${item.path}):`, data?.[n]?.error);
        }
      });
    } catch (err) {
      console.error(`Error generando enlaces temporales en ${bucket}:`, err);
    }
  }));

  return resultado;
}

async function firmarUrlArchivo(url) {
  if (!url) return url;
  const [firmada] = await firmarUrlsArchivos([url]);
  return firmada;
}

// Rellena el src de todas las <img data-src-archivo="…"> de un
// contenedor con su enlace temporal, pidiéndolos todos de una vez.
async function firmarImagenesEn(contenedor) {
  if (!contenedor) return;
  const imgs = Array.from(contenedor.querySelectorAll('img[data-src-archivo]'));
  if (!imgs.length) return;
  const firmadas = await firmarUrlsArchivos(imgs.map(img => img.dataset.srcArchivo));
  imgs.forEach((img, i) => {
    // Si mientras tanto se ha vuelto a pintar el contenedor, esta <img>
    // ya no está en la página: no pasa nada por asignarle el src.
    if (firmadas[i]) img.src = firmadas[i];
  });
}
