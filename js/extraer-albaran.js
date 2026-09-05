// ---------------------------------------------------------------
// Detección automática del Nº de Albarán a partir del PDF
// ---------------------------------------------------------------
// Lee el texto del PDF (con pdf.js, en el propio navegador) y busca
// la etiqueta "Num.Entrada" / "Núm Entrada" / variantes; el número
// que aparece justo después (en la fila de datos de la tabla) es el
// que se usa como Nº Albarán.
//
// Es un best-effort: si el PDF es una imagen escaneada (sin texto) o
// tiene un formato distinto, simplemente no encuentra nada y el campo
// se queda editable a mano, como hasta ahora.

let pdfWorkerConfigurado = false;
function asegurarPdfWorker() {
  if (pdfWorkerConfigurado || typeof pdfjsLib === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  pdfWorkerConfigurado = true;
}

async function extraerNumAlbaranDePdf(fuente) {
  if (typeof pdfjsLib === 'undefined') return null;
  asegurarPdfWorker();

  try {
    let arrayBuffer;
    if (fuente instanceof File || fuente instanceof Blob) {
      arrayBuffer = await fuente.arrayBuffer();
    } else if (typeof fuente === 'string') {
      const resp = await fetch(fuente);
      arrayBuffer = await resp.arrayBuffer();
    } else {
      return null;
    }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let texto = '';
    const paginas = Math.min(pdf.numPages, 2); // con la primera página suele bastar
    for (let i = 1; i <= paginas; i++) {
      const page = await pdf.getPage(i);
      const contenido = await page.getTextContent();
      texto += ' ' + contenido.items.map(it => it.str).join(' ');
    }

    // "Num.Entrada" (cabecera de la tabla) puede ir seguida de una línea
    // separadora larga y del resto de cabeceras de columna antes de llegar
    // al número real, así que buscamos el ancla y luego el primer número
    // de 5+ cifras seguidas en una ventana amplia después de ella (las
    // fechas tipo 28.08.2026 no cuentan, los puntos rompen la racha).
    const ancla = texto.match(/n[uú°º]?m?\.?\s*\.?\s*entrada/i);
    if (!ancla) return null;
    const desdeAncla = texto.slice(ancla.index + ancla[0].length, ancla.index + ancla[0].length + 1500);
    const numero = desdeAncla.match(/\d{5,}/);
    return numero ? numero[0] : null;
  } catch (err) {
    console.error('Error leyendo el PDF del albarán:', err);
    return null;
  }
}
