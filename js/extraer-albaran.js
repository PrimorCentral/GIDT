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

    // "Num.Entrada" / "Núm. Entrada" / "Nº Entrada"... seguido, a poca
    // distancia, del primer número de 5 o más cifras seguidas (las fechas
    // tipo 28.08.2026 no llegan a 5 dígitos corridos por los puntos).
    const match = texto.match(/n[uú°º]?m?\.?\s*\.?\s*entrada[^0-9]{0,60}(\d{5,})/i);
    return match ? match[1] : null;
  } catch (err) {
    console.error('Error leyendo el PDF del albarán:', err);
    return null;
  }
}
