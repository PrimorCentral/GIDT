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

// ---------------------------------------------------------------
// Detección automática del importe total de la factura
// ---------------------------------------------------------------
// El "TOTAL IMPORTE" de una factura siempre va al final de la última
// página (aunque tenga varias). En vez de buscar cerca de la etiqueta
// (en muchas facturas la etiqueta está arriba, como cabecera de una
// tabla, y el valor real queda mucho más abajo), cogemos directamente
// el ÚLTIMO importe con formato de dinero español (1.234,56 / 2,05)
// que aparece en el texto de esa última página: es el que está más
// abajo del todo, que es justamente el total.

async function extraerTotalFacturaDePdf(fuente) {
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
    const page = await pdf.getPage(pdf.numPages); // siempre la última página
    const contenido = await page.getTextContent();
    const texto = contenido.items.map(it => it.str).join(' ');

    // Formato "1.234,56" o "2,05": dígitos + opcional miles con puntos +
    // coma + EXACTAMENTE 2 decimales (así no confundimos con cantidades
    // tipo "1,000" que llevan 3 decimales).
    const importes = texto.match(/\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g);
    if (!importes || !importes.length) return null;

    const ultimo = importes[importes.length - 1];
    const numero = Number(ultimo.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numero) ? numero : null;
  } catch (err) {
    console.error('Error leyendo el total de la factura:', err);
    return null;
  }
}

// ---------------------------------------------------------------
// Detección automática del Nº de Factura a partir del PDF
// ---------------------------------------------------------------
// En la cabecera de la factura hay una tabla "Número | Fecha | Cliente"
// y justo debajo, en la fila de datos, el número real (p.ej. "9H 7741").
// Buscamos la etiqueta "Número" y, en el texto que viene justo después,
// el primer código con forma de nº de factura: unas pocas cifras+letra
// seguidas de más cifras (a veces con espacio, a veces pegado). Igual
// que con el albarán, es best-effort: si no encaja el formato, el campo
// se queda editable a mano.

// ---------------------------------------------------------------
// Detección automática del Nº de Factura a partir del PDF
// ---------------------------------------------------------------
// El nº de factura (p.ej. "9H 7741") se imprime en la misma línea que
// el código de cliente ("430/00/0036") y la fecha ("9.09.26"). El texto
// que extrae pdf.js NO sigue siempre el orden visual de lectura (las
// etiquetas de cabecera como "Número" pueden quedar muy lejos, en otro
// bloque, del valor real), así que buscar el primer código después de
// la etiqueta "Número" es poco fiable y puede confundirse con un código
// de producto de la tabla (p.ej. "6XS02461").
//
// En vez de eso, buscamos directamente el TRÍO tal y como se imprime
// junto en esa línea: serie+número de factura, seguido del código de
// cliente (con barras) y de la fecha (con puntos). Es un patrón mucho
// más específico que no se confunde con nada de la tabla de artículos.

async function extraerNumFacturaDePdf(fuente) {
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
    const page = await pdf.getPage(1); // el número de factura va en la cabecera de la 1ª página
    const contenido = await page.getTextContent();
    const texto = contenido.items.map(it => it.str).join(' ');

    // Serie+número ("9H 7741") seguido, pegado en la misma línea, de la
    // fecha ("9.09.26") o del código de cliente ("430/00/0036") — el
    // orden entre estos dos últimos varía según la factura, así que
    // aceptamos cualquiera de los dos justo después del número.
    const trio = texto.match(/\b(\d{1,4}[A-Z]{1,3})\s+(\d{2,7})\s+(?:\d{1,2}\.\d{2}\.\d{2,4}|\d{1,4}\/\d{1,3}\/\d{2,6})\b/);
    if (trio) return `${trio[1]} ${trio[2]}`;

    // Fallback best-effort: primer código con forma de nº de factura que
    // aparezca cerca de la etiqueta "Número" (por si el formato de la
    // factura no trae el trío completo pegado).
    const ancla = texto.match(/n[uú]mero/i);
    if (!ancla) return null;
    const desdeAncla = texto.slice(ancla.index + ancla[0].length, ancla.index + ancla[0].length + 200);
    const numero = desdeAncla.match(/\b\d{1,4}[A-Z]{1,3}\s?\d{2,8}\b/);
    return numero ? numero[0].replace(/\s+/g, ' ').trim() : null;
  } catch (err) {
    console.error('Error leyendo el nº de factura:', err);
    return null;
  }
}
