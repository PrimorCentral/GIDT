// =====================================================================
// Importar cobros (Panel siniestros)
// ---------------------------------------------------------------------
// Lee el Excel de cargos que pasa contabilidad («0.- NUEVO- CARGOS
// INCIDENCIAS TRANSPORTE.xlsx»), lo compara con los siniestros que en
// GIDT siguen en PDTE COBRO y propone cuáles marcar como COBRADO o
// ANULADO. No cambia nada hasta que el usuario confirma.
//
// · El Excel se lee en el navegador (SheetJS, que se carga solo la primera
//   vez que se usa); no se sube ni se guarda en ningún sitio.
// · Se recorren las pestañas de agencias: las que tienen en la primera
//   fila las columnas CARGO y ESTADO (EMAILS y los resúmenes por año no
//   las tienen, así que se saltan solas).
// · Cruce: Nº factura de GIDT ↔ columna CARGO (p. ej. «9H 7749»),
//   Nº albarán de GIDT ↔ columna ENTRADA (p. ej. «05-4586230» es el
//   albarán 054586230; «27-234600» es el 234600).
// · En el Excel, COBRADO / ABONADO cuentan como cobrado; ANULADO como
//   anulado. Cualquier otro estado (PTE COBRO, PROFO…) se ignora.
// · «Cuadran» = coinciden factura, albarán e importe → van marcados.
//   Si solo coincide uno de los dos números, el importe es distinto o la
//   factura está repetida, va a «A revisar» desmarcado, con el motivo.
// =====================================================================
(function () {
  const overlay = document.getElementById('importarCobrosOverlay');
  const box = document.getElementById('importarCobrosBox');
  const btnAbrir = document.getElementById('btnImportarCobros');
  if (!overlay || !box || !btnAbrir) return;

  const ESTADOS_COBRADO = ['COBRADO', 'ABONADO', 'ABONDO'];
  const ESTADOS_ANULADO = ['ANULADO'];

  let estado = null; // { archivo, leidoEn, filasExcel, pendientes, ok, rev, anu, sel }
  let ocupado = false;

  // ---------------- Utilidades ----------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const [e, d] = Number(n).toFixed(2).split('.');
    return e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d + ' €';
  };
  const fechaCorta = (iso) => {
    if (!iso) return '—';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  };
  const usuarioActual = () => sesionActual?.nombre || sesionActual?.usuario || null;
  const pausa = () => new Promise(r => setTimeout(r, 0));

  // Valor "plano" de una celda de ExcelJS (fórmulas, texto enriquecido…).
  function valorCelda(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if ('result' in v) return valorCelda(v.result);
      if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
      if ('text' in v) return v.text;
      if ('error' in v) return null;
    }
    return v;
  }
  const texto = (v) => { const x = valorCelda(v); return x === null ? '' : String(x).trim(); };
  function numero(v) {
    const x = valorCelda(v);
    if (x === null || x === '') return null;
    if (typeof x === 'number') return x;
    const n = parseFloat(String(x).replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Todos los nº de factura/cargo que aparecen en un texto: «9H 7749»,
  // «P9-5650», «9R12975», «AH 6984», «9H396--la correcta 9R 12623»…
  // Se devuelven normalizados: serie + número sin ceros delante («9H7749»).
  function facturasEnTexto(s) {
    const out = [];
    const re = /(?:^|[^0-9A-Z])([0-9A-Z]{2})\s*-?\s*(\d{3,6})(?=\D|$)/gi;
    let m;
    const t = String(s || '').toUpperCase();
    while ((m = re.exec(t))) {
      const serie = m[1];
      if (/^\d\d$/.test(serie)) continue; // «05-…» / «27-…» son entradas, no cargos
      out.push(serie + String(parseInt(m[2], 10)));
    }
    return out;
  }
  const normFactura = (s) => facturasEnTexto(s)[0] || null;
  const textoFactura = (n) => n ? n.replace(/^([0-9A-Z]{2})(\d+)$/, '$1 $2') : '';

  // Albarán: «054586230» → «54586230». De la columna ENTRADA se sacan las
  // dos lecturas posibles: todo seguido («05-4586230» → «54586230») y lo
  // que va detrás del guion («27-234600» → «234600»).
  const sinCeros = (d) => d.replace(/^0+/, '');
  function normAlbaran(s) {
    const d = String(s ?? '').replace(/\D/g, '');
    return d.length >= 5 ? sinCeros(d) : null;
  }
  function albaranesEntrada(s) {
    const t = String(s ?? '').trim();
    const set = new Set();
    const todo = t.replace(/\D/g, '');
    if (todo.length >= 5) set.add(sinCeros(todo));
    const tras = t.split('-').slice(1).join('').replace(/\D/g, '');
    if (tras.length >= 5) set.add(sinCeros(tras));
    return [...set];
  }
  const mismoImporte = (a, b) => a !== null && b !== null && Math.abs(Number(a) - Number(b)) < 0.005;

  // ---------------- Lectura del Excel ----------------
  // Se usa SheetJS (solo para leer), que se carga la primera vez que hace
  // falta: es más tolerante que ExcelJS con Excel "reales" (imágenes,
  // formatos raros…), que a ExcelJS a veces le hacen fallar al abrirlos.
  const URL_SHEETJS = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  let cargaSheetJs = null;
  function cargarSheetJs() {
    if (window.XLSX) return Promise.resolve();
    if (!cargaSheetJs) {
      cargaSheetJs = new Promise((ok, ko) => {
        const sc = document.createElement('script');
        sc.src = URL_SHEETJS;
        sc.onload = () => ok();
        sc.onerror = () => { cargaSheetJs = null; ko(new Error('SIN_LIBRERIA')); };
        document.head.appendChild(sc);
      });
    }
    return cargaSheetJs;
  }

  async function leerExcel(archivo, progreso) {
    await cargarSheetJs();
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
    const filas = [];
    const nombres = wb.SheetNames;
    for (let h = 0; h < nombres.length; h++) {
      const nombreHoja = nombres[h];
      progreso?.(h, nombres.length, nombreHoja);
      const datos = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: true, defval: null, blankrows: false });
      if (!datos.length) continue;
      // Cabecera: primera fila. Se toma la primera columna con cada nombre.
      const cab = {};
      (datos[0] || []).forEach((v, col) => {
        const k = texto(v).toUpperCase();
        if (k && !(k in cab)) cab[k] = col;
      });
      if (cab.CARGO === undefined || cab.ESTADO === undefined) continue;
      const celda = (r, k) => (cab[k] === undefined ? null : r[cab[k]]);
      for (let n = 1; n < datos.length; n++) {
        const r = datos[n] || [];
        const est = texto(celda(r, 'ESTADO')).toUpperCase();
        const cargo = texto(celda(r, 'CARGO'));
        const entrada = texto(celda(r, 'ENTRADA'));
        if (!cargo && !entrada) continue;
        filas.push({
          hoja: nombreHoja,
          fila: n + 1,
          tienda: texto(celda(r, 'TIENDA')),
          importe: numero(celda(r, 'IMPORTE')),
          cargoTexto: cargo,
          facturas: facturasEnTexto(cargo),
          albaranes: albaranesEntrada(entrada),
          estado: ESTADOS_COBRADO.includes(est) ? 'COBRADO' : ESTADOS_ANULADO.includes(est) ? 'ANULADO' : null,
          estadoTexto: est
        });
      }
      await pausa();
    }
    return filas;
  }

  // ---------------- Cruce con GIDT ----------------
  function cruzar(filasExcel, pendientes) {
    // Índices del Excel (solo filas con estado útil: cobrado/anulado).
    const porFactura = new Map(), porAlbaran = new Map();
    filasExcel.forEach(f => {
      if (!f.estado) return;
      f.facturas.forEach(k => { if (!porFactura.has(k)) porFactura.set(k, []); porFactura.get(k).push(f); });
      f.albaranes.forEach(k => { if (!porAlbaran.has(k)) porAlbaran.set(k, []); porAlbaran.get(k).push(f); });
    });
    // Facturas repetidas dentro de GIDT (dos siniestros con el mismo nº).
    const facturasGidt = new Map();
    pendientes.forEach(s => { const k = normFactura(s.num_factura); if (k) facturasGidt.set(k, (facturasGidt.get(k) || 0) + 1); });
    // Facturas repetidas en el Excel (la misma en filas de distinto albarán).
    const facturaRepetidaExcel = (k) => {
      const fs = porFactura.get(k) || [];
      return new Set(fs.map(f => f.albaranes.join('|'))).size > 1;
    };

    const ok = [], rev = [], anu = [];
    pendientes.forEach(s => {
      const kF = normFactura(s.num_factura);
      const kA = normAlbaran(s.num_albaran);
      if (!kF && !kA) return;
      const porF = kF ? (porFactura.get(kF) || []) : [];
      const porA = kA ? (porAlbaran.get(kA) || []) : [];
      if (!porF.length && !porA.length) return;

      const ambos = porF.filter(f => porA.includes(f));
      const fila = ambos[0] || porA[0] || porF[0];
      const motivos = [];
      let facturaExcel = null;

      if (!ambos.length) {
        if (porA.length) {
          const fe = fila.facturas[0];
          if (fe && fe !== kF) facturaExcel = textoFactura(fe);
          motivos.push(kF
            ? `Solo coincide el albarán. En el Excel la factura es ${facturaExcel || (fila.cargoTexto || 'otra')}`
            : 'Solo coincide el albarán (el siniestro no tiene Nº factura en GIDT)');
          if (kF && porF.length && !porF.includes(fila)) {
            const otra = porF[0];
            motivos.push(`La factura ${textoFactura(kF)} está en el Excel en otro siniestro (${otra.tienda || otra.hoja})`);
          }
        } else {
          motivos.push(kA
            ? `Solo coincide la factura. En el Excel el albarán es otro (${fila.tienda || fila.hoja})`
            : 'Solo coincide la factura (el siniestro no tiene Nº albarán en GIDT)');
        }
      }
      // Factura repetida en GIDT: solo importa si el cruce se apoya únicamente
      // en la factura (si coinciden factura y albarán, la fila es de este).
      if (kF && !porA.length && facturasGidt.get(kF) > 1) motivos.push(`La factura ${textoFactura(kF)} está en más de un siniestro de GIDT`);
      if (kF && ambos.length && facturaRepetidaExcel(kF)) motivos.push(`La factura ${textoFactura(kF)} sale repetida en el Excel con otro albarán`);
      if (s.valor === null || s.valor === undefined) motivos.push('El siniestro no tiene importe en GIDT para comparar');
      else if (fila.importe !== null && !mismoImporte(s.valor, fila.importe)) motivos.push(`Importe distinto: GIDT ${eur(s.valor)} · Excel ${eur(fila.importe)}`);
      else if (fila.importe === null) motivos.push('La fila del Excel no tiene importe para comparar');

      // Se busca preferentemente una fila con el estado decidido; si en
      // el Excel hay varias filas de ese siniestro, gana la que cuadra.
      const item = {
        s, fila, motivos, facturaExcel,
        estadoNuevo: fila.estado,
        key: `${fila.estado}-${s.id}`
      };
      if (fila.estado === 'ANULADO') anu.push(item);
      else if (motivos.length) rev.push(item);
      else ok.push(item);
    });

    const orden = (a, b) => (a.s.fecha || '').localeCompare(b.s.fecha || '') || a.s.id - b.s.id;
    ok.sort(orden); rev.sort(orden); anu.sort(orden);
    const sel = {};
    ok.forEach(i => { sel[i.key] = true; });
    rev.forEach(i => { sel[i.key] = false; });
    anu.forEach(i => { sel[i.key] = !i.motivos.length; });
    return { ok, rev, anu, sel };
  }

  // ---------------- Vistas ----------------
  function cabecera(sub) {
    return `<div class="ic-head">
      <div><h3 class="modal-title" style="margin:0;">📥 Importar cobros de contabilidad</h3><div class="ic-sub">${sub}</div></div>
      <button class="filtros-modal-close" data-ic-cerrar aria-label="Cerrar">✕</button>
    </div>`;
  }
  const chipArchivo = () => estado?.archivo ? `<span class="ic-file-chip">📄 ${esc(estado.archivo.name)}</span>` : '';

  function vistaSubir(error) {
    box.className = 'modal-box ic-box ic-box-subir';
    box.innerHTML = cabecera('Sube el Excel de cargos que pasa contabilidad') + `
      <label class="ic-drop" id="icDrop">
        <input type="file" id="icFile" accept=".xlsx,.xlsm" hidden>
        <div class="ic-drop-ico">📊</div>
        <b>Arrastra aquí el Excel o pulsa para elegirlo</b>
        <span>.xlsx · por ejemplo «0.- NUEVO- CARGOS INCIDENCIAS TRANSPORTE.xlsx»</span>
      </label>
      ${error ? `<p class="ic-error">${esc(error)}</p>` : ''}
      <p class="ic-nota">Se leen todas las pestañas de agencias (se ignoran EMAILS y los resúmenes por año). El Excel no se guarda en ningún sitio: se lee en el navegador y solo se usa para comparar.<br>
      Se buscan los siniestros en <b>PDTE COBRO</b> por <b>Nº factura</b> (columna CARGO) y <b>Nº albarán</b> (columna ENTRADA). Nada cambia hasta que confirmes.</p>`;
    const drop = box.querySelector('#icDrop');
    const input = box.querySelector('#icFile');
    input.addEventListener('change', () => { if (input.files[0]) procesar(input.files[0]); });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f) procesar(f); });
  }

  const PASOS = ['Leyendo Excel', 'Extrayendo cargos de las agencias', 'Buscando siniestros pendientes de cobro', 'Comprobando importes'];
  function vistaCargando() {
    box.className = 'modal-box ic-box ic-box-subir';
    box.innerHTML = cabecera(chipArchivo()) + `
      <div class="ic-loading">
        <div class="ic-spinner"></div>
        <b id="icLdTxt">Leyendo Excel…</b>
        <div class="ic-progress"><i id="icLdBar"></i></div>
        <ul class="ic-steps" id="icLdSteps">${PASOS.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>`;
  }
  function pasoCargando(i, extra) {
    const lis = box.querySelectorAll('#icLdSteps li');
    lis.forEach((li, j) => {
      li.className = j < i ? 'done' : j === i ? 'now' : '';
      li.textContent = (j < i ? '✓ ' : '') + PASOS[j] + (j === i && extra ? ` ${extra}` : (li.dataset.fin && j < i ? ` ${li.dataset.fin}` : ''));
    });
    const txt = box.querySelector('#icLdTxt');
    if (txt && PASOS[i]) txt.textContent = PASOS[i] + '…';
  }
  function finPaso(i, fin) { const li = box.querySelectorAll('#icLdSteps li')[i]; if (li) li.dataset.fin = fin; }
  function barra(p) { const b = box.querySelector('#icLdBar'); if (b) b.style.width = Math.round(p * 100) + '%'; }

  const pillTipo = (t) => {
    const cls = t === 'ROTURA' ? 'moderado' : t ? 'grave' : 'leve';
    return t ? `<span class="pill ${cls}">${esc(t)}</span>` : '';
  };
  const pillEstadoExcel = (e) => e === 'ANULADO'
    ? '<span class="ic-pill ic-pill-anu">ANULADO</span>'
    : '<span class="ic-pill ic-pill-cob">COBRADO</span>';

  function filaHtml(it, conMotivo) {
    const s = it.s, f = it.fila, on = !!estado.sel[it.key];
    const difImp = s.valor !== null && f.importe !== null && !mismoImporte(s.valor, f.importe);
    const est = f.estadoTexto === 'ABONADO' || f.estadoTexto === 'ABONDO'
      ? '<span class="ic-pill ic-pill-cob">ABONADO</span>' : pillEstadoExcel(it.estadoNuevo);
    return `<tr class="${on ? '' : 'ic-off'}">
      <td><input type="checkbox" data-ic-sel="${it.key}" ${on ? 'checked' : ''}></td>
      <td class="ic-mono">${fechaCorta(s.fecha)}</td>
      <td><b>${esc(s.agencia_nombre || '—')}</b><br><span class="ic-soft">${esc(s.tienda_nombre || '—')}</span>
        ${conMotivo && it.motivos.length ? it.motivos.map(m => `<span class="ic-motivo">⚠️ ${esc(m)}</span>`).join('') : ''}</td>
      <td class="ic-hide-m">${pillTipo(s.tipo)}</td>
      <td class="ic-mono">${esc(s.num_factura || '—')}${it.facturaExcel ? `<br><span class="ic-warn-txt">Excel: ${esc(it.facturaExcel)}</span>` : ''}</td>
      <td class="ic-mono ic-hide-m">${esc(s.num_albaran || '—')}</td>
      <td class="ic-num">${eur(s.valor)}</td>
      <td class="ic-num ${difImp ? 'ic-diff' : ''}">${eur(f.importe)}</td>
      <td>${est}</td>
      <td class="ic-hide-m"><button type="button" class="ic-ver" data-ic-ver="${s.id}" title="Abrir el siniestro">Ver</button></td>
    </tr>`;
  }

  function seccionHtml(cls, titulo, sub, lista, grupo, conMotivo) {
    if (!lista.length) return '';
    const todos = lista.every(it => estado.sel[it.key]);
    return `<div class="ic-sec ${cls}">
      <div class="ic-sec-head" data-ic-toggle>
        <input type="checkbox" data-ic-all="${grupo}" ${todos ? 'checked' : ''} title="Marcar / desmarcar todos">
        <b>${titulo}</b><span class="ic-cnt">${sub}</span><span class="ic-chev">▾</span>
      </div>
      <div class="ic-tabla-wrap"><table class="ic-tabla">
        <thead><tr><th style="width:30px"></th><th>Fecha</th><th>Agencia / tienda</th><th class="ic-hide-m">Tipo</th><th>Nº factura</th><th class="ic-hide-m">Nº albarán</th><th class="ic-num">Importe GIDT</th><th class="ic-num">Importe Excel</th><th>En Excel</th><th class="ic-hide-m"></th></tr></thead>
        <tbody>${lista.map(it => filaHtml(it, conMotivo)).join('')}</tbody>
      </table></div>
    </div>`;
  }

  function contar() {
    const marcados = [...estado.ok, ...estado.rev, ...estado.anu].filter(it => estado.sel[it.key]);
    const cob = marcados.filter(it => it.estadoNuevo === 'COBRADO');
    const anu = marcados.filter(it => it.estadoNuevo === 'ANULADO');
    return { marcados, cob, anu, totalCob: cob.reduce((t, it) => t + (Number(it.s.valor) || 0), 0) };
  }

  function vistaResultado() {
    box.className = 'modal-box ic-box';
    const { ok, rev, anu, pendientes } = estado;
    const encontrados = ok.length + rev.length + anu.length;
    const siguen = pendientes.length - encontrados;
    const totalOk = ok.reduce((t, it) => t + (Number(it.s.valor) || 0), 0);
    const hora = estado.leidoEn.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    let cuerpo;
    if (!encontrados) {
      cuerpo = `<div class="ic-vacio"><div style="font-size:34px;">🔍</div>
        <b>No hay cambios que hacer</b>
        <span>Ninguno de los ${pendientes.length} siniestros pendientes de cobro aparece como COBRADO, ABONADO o ANULADO en este Excel.</span></div>`;
    } else {
      cuerpo =
        seccionHtml('ic-sec-warn', '⚠️ A revisar', `${rev.length} ${rev.length === 1 ? 'siniestro' : 'siniestros'} · desmarcados: revísalos y marca los que estén bien`, rev, 'rev', true) +
        seccionHtml('ic-sec-ok', '✅ Cobrados · cuadran factura, albarán e importe', `${ok.length} ${ok.length === 1 ? 'siniestro' : 'siniestros'} · marcados por defecto`, ok, 'ok', false) +
        seccionHtml('ic-sec-anu', '🚫 Anulados en contabilidad', `${anu.length} ${anu.length === 1 ? 'siniestro' : 'siniestros'} · pasarán a ANULADO en GIDT`, anu, 'anu', true);
    }

    box.innerHTML = cabecera(`${chipArchivo()} <span class="ic-soft">· leído a las ${hora}</span>`) + `
      <div class="ic-kpis">
        <div class="ic-kpi ok"><b>${ok.length}</b><span>Cobrados que cuadran · ${eur(totalOk)}</span></div>
        <div class="ic-kpi warn"><b>${rev.length}</b><span>A revisar</span></div>
        <div class="ic-kpi anu"><b>${anu.length}</b><span>Anulados en contabilidad</span></div>
        <div class="ic-kpi"><b>${siguen}</b><span>Siguen pendientes de cobro</span></div>
      </div>
      <div class="ic-body">${cuerpo}</div>
      <div class="ic-foot">
        <div class="ic-resumen" id="icResumen"></div>
        <div class="ic-foot-btns">
          <button class="btn" data-ic-otro>Subir otro Excel</button>
          <button class="btn" data-ic-cerrar>Cancelar</button>
          <button class="btn primary" id="icBtnConfirmar">✔ Confirmar</button>
        </div>
      </div>`;
    pintarResumen();
  }

  function pintarResumen() {
    const { marcados, cob, anu, totalCob } = contar();
    const r = box.querySelector('#icResumen');
    if (r) {
      r.innerHTML = marcados.length
        ? `Se marcarán <b>${cob.length}</b> como <span class="ic-pill ic-pill-cob">COBRADO</span> (${eur(totalCob)})${anu.length ? ` y <b>${anu.length}</b> como <span class="ic-pill ic-pill-anu">ANULADO</span>` : ''}`
        : '<span class="ic-soft">No hay ningún siniestro marcado.</span>';
    }
    const b = box.querySelector('#icBtnConfirmar');
    if (b) { b.disabled = !marcados.length; b.textContent = `✔ Confirmar${marcados.length ? ' ' + marcados.length : ''}`; }
  }

  // ---------------- Flujo ----------------
  async function procesar(archivo) {
    if (ocupado) return;
    if (!/\.xls[xm]$/i.test(archivo.name)) { vistaSubir('El archivo tiene que ser un Excel (.xlsx).'); return; }
    ocupado = true;
    estado = { archivo };
    vistaCargando();
    try {
      pasoCargando(0);
      barra(0.05);
      const filas = await leerExcel(archivo, (h, total, nombre) => {
        if (h === 0) { finPaso(0, `(${total} pestañas)`); pasoCargando(1); }
        barra(0.1 + 0.55 * (h / total));
        const li = box.querySelectorAll('#icLdSteps li')[1];
        if (li) li.textContent = `${PASOS[1]} · ${nombre}`;
      });
      if (!filas.length) throw new Error('SIN_HOJAS');
      finPaso(1, `(${filas.length.toLocaleString('es-ES')} filas)`);
      pasoCargando(2);
      barra(0.7);
      const { data, error } = await sb.from('panel_siniestros')
        .select('id, fecha, agencia_nombre, tienda_nombre, tipo, num_albaran, num_factura, valor, estado')
        .eq('estado', 'PDTE COBRO');
      if (error) throw error;
      finPaso(2, `(${(data || []).length})`);
      pasoCargando(3);
      barra(0.9);
      await pausa();
      const res = cruzar(filas, data || []);
      Object.assign(estado, res, { filasExcel: filas, pendientes: data || [], leidoEn: new Date() });
      barra(1);
      pasoCargando(4);
      await new Promise(r => setTimeout(r, 350));
      vistaResultado();
    } catch (err) {
      console.error('Importar cobros:', err);
      vistaSubir(err?.message === 'SIN_LIBRERIA'
        ? 'No se pudo cargar el lector de Excel. Comprueba la conexión a internet y vuelve a intentarlo.'
        : err?.message === 'SIN_HOJAS'
        ? 'No se ha encontrado ninguna pestaña con las columnas CARGO y ESTADO. ¿Es el Excel de cargos de contabilidad?'
        : 'No se pudo leer el Excel. Comprueba que es el archivo correcto y vuelve a intentarlo.');
    } finally {
      ocupado = false;
    }
  }

  async function confirmar() {
    if (ocupado) return;
    const { marcados, cob, anu } = contar();
    if (!marcados.length) return;
    const ok = await modalConfirm(
      `Se van a marcar ${cob.length} ${cob.length === 1 ? 'siniestro' : 'siniestros'} como COBRADO${anu.length ? ` y ${anu.length} como ANULADO` : ''}.\n\n¿Continuar?`,
      { titulo: 'Confirmar cobros', icono: '📥', textoOk: 'Confirmar' }
    );
    if (!ok) return;
    ocupado = true;
    const btn = box.querySelector('#icBtnConfirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    const ahora = new Date().toISOString();
    const usuario = usuarioActual();
    const hechos = { COBRADO: [], ANULADO: [] };
    try {
      for (const [nuevo, lista] of [['COBRADO', cob], ['ANULADO', anu]]) {
        if (!lista.length) continue;
        const datos = nuevo === 'COBRADO'
          ? { estado: 'COBRADO', cobrado_en: ahora, cobrado_por: usuario, anulado_en: null, anulado_por: null, actualizado_por: usuario }
          : { estado: 'ANULADO', anulado_en: ahora, anulado_por: usuario, cobrado_en: null, cobrado_por: null, actualizado_por: usuario };
        // Solo los que siguen en PDTE COBRO: si otro usuario lo ha cambiado
        // mientras tanto, no se pisa.
        const { data, error } = await sb.from('panel_siniestros')
          .update(datos)
          .in('id', lista.map(it => it.s.id))
          .eq('estado', 'PDTE COBRO')
          .select('id');
        if (error) throw error;
        const ids = new Set((data || []).map(r => r.id));
        lista.forEach(it => { if (ids.has(it.s.id)) hechos[nuevo].push(it); });
      }

      const total = hechos.COBRADO.length + hechos.ANULADO.length;
      const saltados = marcados.length - total;
      if (typeof registrarAccion === 'function' && total) {
        const cambios = [...hechos.COBRADO, ...hechos.ANULADO].map(it => ({
          campo: `Nº ${it.s.id} · ${it.s.tienda_nombre || it.s.agencia_nombre || '—'}`,
          antes: 'PDTE COBRO',
          despues: it.estadoNuevo
        }));
        registrarAccion('siniestros', 'Importar cobros',
          `${hechos.COBRADO.length} marcados como COBRADO${hechos.ANULADO.length ? ` y ${hechos.ANULADO.length} como ANULADO` : ''} desde «${estado.archivo.name}»`,
          cambios);
      }
      cerrar(true);
      if (typeof cargarPanelSiniestros === 'function') cargarPanelSiniestros();
      if (saltados > 0) {
        await modalAlert(`Se han marcado ${total} siniestros.\n\n${saltados} no se han cambiado porque otro usuario los modificó mientras tanto (ya no estaban en PDTE COBRO).`, { titulo: 'Cobros importados', icono: '⚠️' });
      } else if (typeof mostrarToast === 'function') {
        mostrarToast(`${hechos.COBRADO.length} siniestros marcados como COBRADO${hechos.ANULADO.length ? ` y ${hechos.ANULADO.length} como ANULADO` : ''}`, { posicion: 'abajo', duracionMs: 4000 });
      }
    } catch (err) {
      console.error('Importar cobros (guardar):', err);
      await modalAlert('No se pudieron guardar los cambios. Inténtalo de nuevo.', { titulo: 'Error al guardar', danger: true });
      if (typeof cargarPanelSiniestros === 'function') cargarPanelSiniestros();
      if (btn) pintarResumen();
    } finally {
      ocupado = false;
    }
  }

  function abrir() {
    if (typeof tienePermiso === 'function' && !tienePermiso('panel_siniestros')) return;
    estado = null;
    vistaSubir();
    overlay.classList.add('show');
  }
  async function cerrar(forzar) {
    if (ocupado && !forzar) return;
    if (!forzar && estado?.ok && contar().marcados.length) {
      const seguro = await modalConfirm('Si cierras ahora no se marcará ningún siniestro.\n\n¿Cerrar sin confirmar?', { titulo: 'Cerrar sin confirmar', textoOk: 'Cerrar', textoCancel: 'Volver' });
      if (!seguro) return;
    }
    overlay.classList.remove('show');
    estado = null;
  }

  // ---------------- Eventos ----------------
  btnAbrir.addEventListener('click', abrir);

  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-ic-cerrar]')) { cerrar(); return; }
    if (e.target.closest('[data-ic-otro]')) { estado = null; vistaSubir(); return; }
    if (e.target.closest('#icBtnConfirmar')) { confirmar(); return; }
    const ver = e.target.closest('[data-ic-ver]');
    if (ver) { if (typeof abrirModalPanelSiniestro === 'function') abrirModalPanelSiniestro(Number(ver.dataset.icVer)); return; }
    const head = e.target.closest('[data-ic-toggle]');
    if (head && !e.target.closest('input')) head.parentNode.classList.toggle('cerrada');
  });

  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ic-sel]')) {
      estado.sel[t.dataset.icSel] = t.checked;
      t.closest('tr')?.classList.toggle('ic-off', !t.checked);
      const sec = t.closest('.ic-sec');
      const all = sec?.querySelector('[data-ic-all]');
      if (all) all.checked = [...sec.querySelectorAll('[data-ic-sel]')].every(c => c.checked);
      pintarResumen();
    } else if (t.matches('[data-ic-all]')) {
      const lista = estado[t.dataset.icAll] || [];
      lista.forEach(it => { estado.sel[it.key] = t.checked; });
      t.closest('.ic-sec')?.querySelectorAll('[data-ic-sel]').forEach(c => { c.checked = t.checked; c.closest('tr')?.classList.toggle('ic-off', !t.checked); });
      pintarResumen();
    }
  });

  // Pinchar fuera de la ventana no hace nada: solo se cierra con ✕, Cancelar o Esc.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show') && !document.getElementById('psModalOverlay')?.classList.contains('show') && !document.getElementById('modalOverlay')?.classList.contains('show')) cerrar();
  });
})();
