  // ---------------------------------------------------------------
  // Gestión → Organización → Festivos
  // ---------------------------------------------------------------
  // Pestaña Calendario: alta, edición y borrado de festivos (tabla
  // `festivos`). Cada festivo tiene un ámbito:
  //   NACIONAL   → todas las tiendas de España (no Portugal/Italia/Andorra)
  //   AUTONOMICO → las tiendas de una o varias comunidades (o países)
  //   LOCAL      → tiendas concretas (tienda_ids)
  //
  // Pestaña Aperturas: cómo abre cada tienda afectada en cada festivo
  // (tabla `festivo_aperturas`): CIERRA, HABITUAL o ABRE a una hora.
  // Sin fila = "Sin indicar" (sale en naranja hasta que se marque).
  // Solo cuentan las tiendas activas (no las que están en apertura).
  //
  // Buscador: propone los festivos oficiales del año (tabla
  // `festivos_catalogo`, cargada desde el BOE y los calendarios de
  // Portugal, Italia y Andorra) y dice cuáles son nuevos, cuáles ya
  // están, cuáles no coinciden y cuáles no afectan a ninguna tienda.
  //
  // Permiso: org_festivos (Usuarios → Organización → Festivos).
  // Sin él se puede ver todo, pero no cambiar nada (permisos-aviso.js).
  //
  // Requiere (ya cargados antes): sb, escapeHtml (usuarios.js),
  // normalizarTextoBusqueda (tiendas.js), modalAlert / modalConfirm /
  // mostrarToast (ui-modal.js), registrarAccion (auditoria.js),
  // COMUNIDADES_TIENDA (tiendas.js), mostrarCargandoGlobal (carga-global.js).

  const FE_PAISES = ['ANDORRA', 'ITALIA', 'PORTUGAL'];
  const FE_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const FE_DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const FE_AMBITO_TXT = { NACIONAL: 'NACIONAL', AUTONOMICO: 'AUTONÓMICO', LOCAL: 'LOCAL' };
  const FE_AMBITO_CLS = { NACIONAL: 'nac', AUTONOMICO: 'aut', LOCAL: 'loc' };
  const FE_ESTADO_TXT = { CIERRA: 'Cierra', HABITUAL: 'Horario habitual', ABRE: 'Abre a las' };

  let feFestivos = [];            // todos los festivos
  let feTiendas = [];             // todas las tiendas (id, nombre, comunidad…)
  let feAgencias = new Map();     // id → nombre
  let feAperturasMes = new Map(); // festivo_id → Map(tienda_id → {estado, hora})
  let feCargado = false;
  const hoyFe = new Date();
  let feMes = { anio: hoyFe.getFullYear(), mes: hoyFe.getMonth() };
  let feTabActiva = 'cal';

  // ---------------- Utilidades ----------------
  function fePuedeEditar() {
    return typeof tienePermiso === 'function' ? tienePermiso('org_festivos') : true;
  }
  function feUsuario() {
    return (typeof sesionActual !== 'undefined' && sesionActual) ? (sesionActual.nombre || sesionActual.usuario) : null;
  }
  function feEsc(v) { return typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v ?? ''); }
  function feNorm(v) {
    return typeof normalizarTextoBusqueda === 'function'
      ? normalizarTextoBusqueda(v)
      : String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  // 'YYYY-MM-DD' → Date local (sin desfase de zona horaria)
  function feFechaDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  function feIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function feFechaCorta(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  function feDiaSemana(iso) { return FE_DIAS_CORTOS[feFechaDate(iso).getDay()]; }
  function feHora(h) { return h ? String(h).slice(0, 5) : ''; }
  function feComunidades() {
    return (window.COMUNIDADES_TIENDA && window.COMUNIDADES_TIENDA.length) ? window.COMUNIDADES_TIENDA : [];
  }
  // Etiqueta del ámbito: para un festivo de un solo país, el país.
  function feEtiquetaAmbito(f) {
    const cs = f.comunidades || [];
    if (f.ambito === 'AUTONOMICO' && cs.length === 1 && FE_PAISES.includes(cs[0])) return cs[0];
    return FE_AMBITO_TXT[f.ambito] || f.ambito;
  }
  // Orden dentro del mismo día: nacional, autonómicos, países, locales.
  function feRangoAmbito(f) {
    if (f.ambito === 'NACIONAL') return 0;
    if (f.ambito === 'LOCAL') return 3;
    return (f.comunidades || []).every(c => FE_PAISES.includes(c)) ? 2 : 1;
  }
  function feOrdenar(lista) {
    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || feRangoAmbito(a) - feRangoAmbito(b) || a.nombre.localeCompare(b.nombre));
  }
  function feTiendasActivas() { return feTiendas.filter(t => t.activo && !t.en_apertura); }

  // Tiendas activas a las que afecta un festivo (o un borrador del formulario).
  function feTiendasAfectadas(f) {
    const act = feTiendasActivas();
    if (f.ambito === 'NACIONAL') return act.filter(t => !FE_PAISES.includes(t.comunidad));
    if (f.ambito === 'AUTONOMICO') { const set = new Set(f.comunidades || []); return act.filter(t => set.has(t.comunidad)); }
    if (f.ambito === 'LOCAL') { const set = new Set((f.tienda_ids || []).map(Number)); return act.filter(t => set.has(t.id)); }
    return [];
  }
  // Texto corto con el alcance de un festivo.
  function feTextoAlcance(f) {
    if (f.ambito === 'NACIONAL') return 'España';
    if (f.ambito === 'AUTONOMICO') return (f.comunidades || []).join(', ');
    const nombres = (f.tienda_ids || []).map(id => feTiendas.find(t => t.id === Number(id))?.nombre).filter(Boolean);
    return nombres.length > 4 ? `${nombres.slice(0, 4).join(', ')} y ${nombres.length - 4} más` : nombres.join(', ');
  }
  // ¿Comparten tiendas/territorio dos alcances? (para avisar de solapes)
  function feComunidadesDe(f) {
    if (f.ambito === 'NACIONAL') return feComunidades().filter(c => !FE_PAISES.includes(c));
    if (f.ambito === 'AUTONOMICO') return f.comunidades || [];
    return [...new Set(feTiendasAfectadas(f).map(t => t.comunidad).filter(Boolean))];
  }
  function feSeSolapan(a, b) {
    const ca = new Set(feComunidadesDe(a));
    return feComunidadesDe(b).some(c => ca.has(c));
  }
  // Supabase devuelve como mucho 1000 filas por consulta: se pide por tramos.
  async function feTraerTodo(crearConsulta) {
    const filas = []; const tramo = 1000;
    for (let desde = 0; ; desde += tramo) {
      const { data, error } = await crearConsulta().range(desde, desde + tramo - 1);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < tramo) break;
    }
    return filas;
  }
  // Ventana de error siempre por encima de "Cargando…": primero se quita la carga.
  async function feAvisoError(texto) {
    await modalAlert(texto, { titulo: 'Error', icono: '⚠️', danger: true });
  }

  // ---------------- Carga ----------------
  async function feCargarBase() {
    const [rT, rA, rF] = await Promise.all([
      sb.from('tiendas').select('id, numero_tienda, nombre, provincia, comunidad, agencia_id, hora_prevista, activo, en_apertura, orden').order('orden'),
      sb.from('agencias').select('id, nombre'),
      sb.from('festivos').select('id, fecha, nombre, ambito, comunidades, tienda_ids, origen, creado_en, creado_por, actualizado_en, actualizado_por').order('fecha').order('nombre')
    ]);
    if (rT.error) throw rT.error;
    if (rA.error) throw rA.error;
    if (rF.error) throw rF.error;
    feTiendas = (rT.data || []).map(t => ({ ...t, id: Number(t.id) }));
    feAgencias = new Map((rA.data || []).map(a => [Number(a.id), a.nombre]));
    feFestivos = feOrdenar(rF.data || []);
    feCargado = true;
  }

  async function feCargarAperturas(ids) {
    const mapa = new Map();
    if (!ids.length) return mapa;
    const filas = await feTraerTodo(() => sb.from('festivo_aperturas')
      .select('festivo_id, tienda_id, estado, hora, actualizado_en, actualizado_por')
      .in('festivo_id', ids).order('festivo_id').order('tienda_id'));
    ids.forEach(id => mapa.set(Number(id), new Map()));
    filas.forEach(r => mapa.get(Number(r.festivo_id))?.set(Number(r.tienda_id), r));
    return mapa;
  }

  async function cargarFestivos() {
    let error = null;
    if (typeof mostrarCargandoGlobal === 'function') mostrarCargandoGlobal();
    try {
      await feCargarBase();
      if (feTabActiva === 'cal') await feRenderCalendario(true);
      else await feRenderAperturas(true);
    } catch (err) {
      console.error('Error cargando festivos:', err);
      error = err;
    } finally {
      if (typeof ocultarCargandoGlobal === 'function') ocultarCargandoGlobal();
    }
    if (error) await feAvisoError('No se pudieron cargar los festivos.');
  }

  // ---------------- Pestañas ----------------
  function feCambiarTab(tab) {
    feTabActiva = tab;
    document.querySelectorAll('#view-config-festivos [data-fe-tab]').forEach(b => b.classList.toggle('activa', b.dataset.feTab === tab));
    document.getElementById('fePanelCal').style.display = tab === 'cal' ? '' : 'none';
    document.getElementById('fePanelAp').style.display = tab === 'ap' ? '' : 'none';
    cargarFestivos();
  }

  // ---------------- Calendario ----------------
  function feFestivosDelMes(anio, mes) {
    const pref = `${anio}-${String(mes + 1).padStart(2, '0')}-`;
    return feFestivos.filter(f => f.fecha.startsWith(pref));
  }

  async function feRenderCalendario(conAperturas) {
    const { anio, mes } = feMes;
    document.getElementById('feMesTitulo').textContent = `${FE_MESES[mes]} ${anio}`;
    const delMes = feFestivosDelMes(anio, mes);
    if (conAperturas) feAperturasMes = await feCargarAperturas(delMes.map(f => f.id));

    // Rejilla del mes (lunes primero)
    const porDia = new Map();
    delMes.forEach(f => { const d = Number(f.fecha.slice(8, 10)); if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(f); });
    const primero = new Date(anio, mes, 1);
    const desfase = (primero.getDay() + 6) % 7;
    const diasMes = new Date(anio, mes + 1, 0).getDate();
    const hoyIso = feIso(new Date());
    let h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="fe-dow">${d}</div>`).join('');
    for (let i = 0; i < desfase; i++) h += '<div class="fe-dia fe-vacio"></div>';
    for (let d = 1; d <= diasMes; d++) {
      const iso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = (desfase + d - 1) % 7;
      const lista = porDia.get(d) || [];
      const marcas = lista.slice(0, 2).map(f =>
        `<span class="fe-marca ${FE_AMBITO_CLS[f.ambito]}" data-fe-editar="${f.id}" title="${feEsc(f.nombre)} · ${feEsc(feTextoAlcance(f))}">${feEsc(f.nombre)}</span>`).join('');
      const mas = lista.length > 2 ? `<span class="fe-mas">+${lista.length - 2} más</span>` : '';
      h += `<div class="fe-dia ${dow >= 5 ? 'fe-finde' : ''} ${iso === hoyIso ? 'fe-hoy' : ''}" data-fe-dia="${iso}" title="${lista.length ? '' : 'Añadir un festivo este día'}">
        <span class="fe-num">${d}</span>${marcas}${mas}</div>`;
    }
    const cal = document.getElementById('feCalendario');
    cal.innerHTML = h;

    // Lista del mes
    document.getElementById('feListaTitulo').textContent = `Festivos de ${FE_MESES[mes].toLowerCase()} ${anio}`;
    const cont = document.getElementById('feListaMes');
    if (!delMes.length) {
      const hayAlguno = feFestivos.length > 0;
      cont.innerHTML = `<div class="fe-vacio-box">
        <div class="fe-vacio-ico">🗓️</div>
        <h4>${hayAlguno ? 'No hay festivos este mes' : 'Todavía no hay festivos'}</h4>
        <p>${hayAlguno ? 'Pulsa un día del calendario para añadir uno.' : 'Usa «Buscar festivos» para traer los oficiales, o «Nuevo festivo» para dar de alta uno a mano.'}</p>
      </div>`;
    } else {
      cont.innerHTML = delMes.map(f => {
        const afectadas = feTiendasAfectadas(f);
        const ap = feAperturasMes.get(Number(f.id)) || new Map();
        const sinIndicar = afectadas.filter(t => !ap.has(t.id)).length;
        const estado = !afectadas.length
          ? '<div class="fe-estado-ap neutro">No afecta a ninguna tienda activa</div>'
          : sinIndicar
            ? `<div class="fe-estado-ap pend">⏳ Aperturas: ${sinIndicar} de ${afectadas.length} sin indicar</div>`
            : '<div class="fe-estado-ap ok">✅ Aperturas completas</div>';
        return `<div class="fe-item">
          <div class="fe-fecha"><b>${Number(f.fecha.slice(8, 10))}</b><small>${feDiaSemana(f.fecha)}</small></div>
          <div class="fe-item-txt">
            <strong><span class="fe-marca ${FE_AMBITO_CLS[f.ambito]} fe-marca-mini">${feEsc(feEtiquetaAmbito(f))}</span>${feEsc(f.nombre)}</strong>
            <div class="fe-sub">${feEsc(feTextoAlcance(f))} · ${afectadas.length} tienda${afectadas.length === 1 ? '' : 's'} afectada${afectadas.length === 1 ? '' : 's'}</div>
            ${estado}
          </div>
          <div class="fe-item-acc">
            ${afectadas.length ? `<button type="button" class="ps-btn-icon fe-nav" data-fe-ir-ap="${f.id}" title="Ver aperturas">🏪</button>` : ''}
            <button type="button" class="ps-btn-icon fe-nav" data-fe-editar="${f.id}" title="Ver / editar">✏️</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  function feMoverMes(delta) {
    let { anio, mes } = feMes;
    mes += delta;
    if (mes < 0) { mes = 11; anio--; }
    if (mes > 11) { mes = 0; anio++; }
    feMes = { anio, mes };
    feRenderCalendarioConCarga();
  }
  async function feRenderCalendarioConCarga() {
    let error = null;
    if (typeof mostrarCargandoGlobal === 'function') mostrarCargandoGlobal();
    try { await feRenderCalendario(true); } catch (err) { console.error(err); error = err; }
    finally { if (typeof ocultarCargandoGlobal === 'function') ocultarCargandoGlobal(); }
    if (error) await feAvisoError('No se pudieron cargar las aperturas del mes.');
  }

  // ---------------- Modal nuevo / editar festivo ----------------
  let feEditandoId = null;
  let feFormAmbito = null;
  let feFormComunidades = new Set();
  let feFormTiendas = new Set();
  let feFotoForm = '';

  function feLeerForm() {
    return {
      fecha: document.getElementById('feFecha').value,
      nombre: document.getElementById('feNombre').value.trim().replace(/\s+/g, ' ').toUpperCase(),
      ambito: feFormAmbito,
      comunidades: feFormAmbito === 'AUTONOMICO' ? [...feFormComunidades].sort() : [],
      tienda_ids: feFormAmbito === 'LOCAL' ? [...feFormTiendas].sort((a, b) => a - b) : []
    };
  }
  function feHayCambios() { return JSON.stringify(feLeerForm()) !== feFotoForm; }

  function feActualizarForm() {
    document.querySelectorAll('#feAmbito [data-ambito]').forEach(b => b.classList.toggle('on', b.dataset.ambito === feFormAmbito));
    document.getElementById('feBloqueComunidades').style.display = feFormAmbito === 'AUTONOMICO' ? '' : 'none';
    document.getElementById('feBloqueTiendas').style.display = feFormAmbito === 'LOCAL' ? '' : 'none';
    // Comunidades: nº de tiendas activas de cada una al lado
    const cuenta = new Map();
    feTiendasActivas().forEach(t => cuenta.set(t.comunidad, (cuenta.get(t.comunidad) || 0) + 1));
    document.getElementById('feComunidades').innerHTML = feComunidades().map(c => `
      <label class="${FE_PAISES.includes(c) ? 'fe-pais' : ''}">
        <input type="checkbox" value="${feEsc(c)}" ${feFormComunidades.has(c) ? 'checked' : ''}>
        <span>${feEsc(c)}</span><small>${cuenta.get(c) || 0}</small>
      </label>`).join('');
    feRenderTiendasSel();
    feRenderTiendasLista();
    feActualizarAfecta();
  }

  function feRenderTiendasSel() {
    const cont = document.getElementById('feTiendasSel');
    const ids = [...feFormTiendas];
    cont.innerHTML = ids.length
      ? ids.map(id => { const t = feTiendas.find(x => x.id === id); return `<span class="fe-chip-tienda">${feEsc(t ? t.nombre : '#' + id)}<button type="button" class="fe-nav" data-fe-quitar-tienda="${id}" title="Quitar">✕</button></span>`; }).join('')
      : '<span class="fe-tiendas-vacio">Ninguna tienda elegida todavía.</span>';
  }
  function feRenderTiendasLista() {
    const q = feNorm(document.getElementById('feTiendasBuscar').value);
    const lista = feTiendasActivas().filter(t => !q
      || feNorm(t.nombre).includes(q) || feNorm(t.numero_tienda).includes(q) || feNorm(t.provincia).includes(q))
      .slice(0, 60);
    document.getElementById('feTiendasLista').innerHTML = lista.length
      ? lista.map(t => `<label><input type="checkbox" value="${t.id}" ${feFormTiendas.has(t.id) ? 'checked' : ''}>
          <span><b>${feEsc(t.nombre)}</b> <small>Nº ${feEsc(t.numero_tienda || '—')} · ${feEsc(t.provincia || '')}</small></span></label>`).join('')
      : '<div class="fe-tiendas-vacio">No hay tiendas que coincidan.</div>';
  }
  function feActualizarAfecta() {
    const el = document.getElementById('feAfecta');
    if (!feFormAmbito) { el.style.display = 'none'; return; }
    const d = feLeerForm();
    const af = feTiendasAfectadas(d);
    el.style.display = '';
    el.classList.toggle('cero', af.length === 0);
    if (!af.length) { el.textContent = d.ambito === 'NACIONAL' ? 'No afecta a ninguna tienda activa.' : 'Todavía no afecta a ninguna tienda activa.'; }
    else if (d.ambito === 'AUTONOMICO' && d.comunidades.length <= 4) {
      const partes = d.comunidades.map(c => `${af.filter(t => t.comunidad === c).length} de ${c}`);
      el.textContent = `Afecta a ${af.length} tienda${af.length === 1 ? '' : 's'} (${partes.join(', ')})`;
    } else el.textContent = `Afecta a ${af.length} tienda${af.length === 1 ? '' : 's'} activa${af.length === 1 ? '' : 's'}`;
    feActualizarBotonGuardar();
  }
  function feActualizarBotonGuardar() {
    const btn = document.getElementById('btnGuardarFestivo');
    if (!btn || btn.dataset.guardando === '1') return;
    btn.disabled = !fePuedeEditar() || (feEditandoId != null && !feHayCambios());
  }

  async function abrirModalFestivo(id = null, fechaInicial = null) {
    if (!feCargado) await cargarFestivos();
    const f = id != null ? feFestivos.find(x => Number(x.id) === Number(id)) : null;
    if (id != null && !f) return;
    feEditandoId = f ? Number(f.id) : null;
    feFormAmbito = f ? f.ambito : null;
    feFormComunidades = new Set(f ? (f.comunidades || []) : []);
    feFormTiendas = new Set(f ? (f.tienda_ids || []).map(Number) : []);
    document.getElementById('festivoModalTitulo').textContent = f ? '✏️ Editar festivo' : '➕ Nuevo festivo';
    const sub = document.getElementById('festivoModalSub');
    if (f) {
      const quien = f.actualizado_por || f.creado_por;
      const cuando = f.actualizado_en || f.creado_en;
      const fecha = cuando ? new Date(cuando) : null;
      sub.textContent = quien
        ? `Última modificación por ${quien}${fecha ? ` el ${feFechaCorta(feIso(fecha))} a las ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}` : ''}${f.origen === 'BUSCADOR' ? ' · Añadido desde el buscador' : ''}`
        : '';
      sub.style.display = quien ? '' : 'none';
    } else sub.style.display = 'none';
    document.getElementById('btnGuardarFestivo').textContent = f ? '💾 Guardar' : '💾 Crear festivo';
    document.getElementById('btnBorrarFestivo').style.display = f ? '' : 'none';
    document.getElementById('feFecha').value = f ? f.fecha : (fechaInicial || '');
    document.getElementById('feNombre').value = f ? f.nombre : '';
    document.getElementById('feTiendasBuscar').value = '';
    document.getElementById('feError').style.display = 'none';
    feActualizarForm();
    feFotoForm = JSON.stringify(feLeerForm());
    feActualizarBotonGuardar();
    document.getElementById('festivoModalOverlay').classList.add('show');
    setTimeout(() => document.getElementById(f || fechaInicial ? 'feNombre' : 'feFecha').focus(), 30);
  }

  function cerrarModalFestivo() {
    document.getElementById('festivoModalOverlay').classList.remove('show');
    feEditandoId = null;
  }
  async function cancelarModalFestivo() {
    if (fePuedeEditar() && feHayCambios()) {
      const salir = await modalConfirm(
        'Hay cambios sin guardar en este festivo. Si cancelas, se perderán.\n\nPara no perderlos, pulsa Volver y luego Guardar.',
        { titulo: 'Cambios sin guardar', icono: '⚠️', danger: true, textoOk: 'Salir sin guardar', textoCancel: 'Volver' });
      if (!salir) return;
    }
    cerrarModalFestivo();
  }

  const FE_CAMPOS_AUDITORIA = [
    { clave: 'fecha', etiqueta: 'Fecha', formato: v => (v ? feFechaCorta(v) : v) },
    { clave: 'nombre', etiqueta: 'Nombre' },
    { clave: 'ambito', etiqueta: 'Ámbito', formato: v => FE_AMBITO_TXT[v] || v },
    { clave: 'comunidades', etiqueta: 'Comunidades' },
    { clave: 'tiendas', etiqueta: 'Tiendas' }
  ];
  function feParaAuditoria(f) {
    return { ...f, tiendas: (f.tienda_ids || []).map(id => feTiendas.find(t => t.id === Number(id))?.nombre || '#' + id) };
  }

  async function guardarFestivo() {
    if (!fePuedeEditar()) { if (typeof mostrarModalSinPermiso === 'function') mostrarModalSinPermiso(); return; }
    const errEl = document.getElementById('feError');
    const mostrarError = (t) => { errEl.textContent = t; errEl.style.display = 'block'; };
    errEl.style.display = 'none';
    const d = feLeerForm();
    if (!d.fecha) return mostrarError('La fecha es obligatoria.');
    if (!d.nombre) return mostrarError('El nombre es obligatorio.');
    if (!d.ambito) return mostrarError('Elige el ámbito del festivo.');
    if (d.ambito === 'AUTONOMICO' && !d.comunidades.length) return mostrarError('Marca al menos una comunidad.');
    if (d.ambito === 'LOCAL' && !d.tienda_ids.length) return mostrarError('Elige al menos una tienda.');

    const editandoId = feEditandoId;
    const antes = editandoId != null ? feFestivos.find(x => Number(x.id) === editandoId) : null;

    // Aviso si ese día ya hay otro festivo que afecta a las mismas tiendas.
    const solapes = feFestivos.filter(x => Number(x.id) !== editandoId && x.fecha === d.fecha && feSeSolapan(x, d));
    if (solapes.length) {
      const seguir = await modalConfirm(
        `El ${feFechaCorta(d.fecha)} ya hay ${solapes.length === 1 ? 'un festivo' : 'festivos'} que afecta${solapes.length === 1 ? '' : 'n'} a algunas de estas tiendas:\n\n`
        + solapes.map(x => `• ${x.nombre} (${FE_AMBITO_TXT[x.ambito]}: ${feTextoAlcance(x)})`).join('\n')
        + '\n\n¿Guardarlo igualmente?',
        { titulo: 'Festivo repetido', icono: '⚠️', textoOk: 'Guardar igualmente', textoCancel: 'Volver' });
      if (!seguir) return;
    }

    const usuario = feUsuario();
    const fila = { fecha: d.fecha, nombre: d.nombre, ambito: d.ambito, comunidades: d.comunidades, tienda_ids: d.tienda_ids };
    const btn = document.getElementById('btnGuardarFestivo');
    btn.dataset.guardando = '1'; btn.disabled = true;
    try {
      let idGuardado = editandoId;
      if (editandoId != null) {
        const { error } = await sb.from('festivos').update({ ...fila, actualizado_en: new Date().toISOString(), actualizado_por: usuario }).eq('id', editandoId);
        if (error) throw error;
        // Las aperturas de tiendas que ya no entran en el festivo se quitan.
        const siguen = feTiendasAfectadas(fila).map(t => t.id);
        let q = sb.from('festivo_aperturas').delete().eq('festivo_id', editandoId);
        if (siguen.length) q = q.not('tienda_id', 'in', `(${siguen.join(',')})`);
        const { error: e2 } = await q;
        if (e2) throw e2;
      } else {
        const { data, error } = await sb.from('festivos').insert({ ...fila, origen: 'MANUAL', creado_por: usuario }).select('id').single();
        if (error) throw error;
        idGuardado = data?.id;
      }
      if (typeof registrarAccion === 'function') {
        const cambios = antes && typeof auditoriaCalcularCambios === 'function'
          ? auditoriaCalcularCambios(FE_CAMPOS_AUDITORIA, feParaAuditoria(antes), feParaAuditoria(fila)) : null;
        registrarAccion('festivos', antes ? 'Editar festivo' : 'Crear festivo', `${feFechaCorta(d.fecha)} · ${d.nombre}`, cambios);
      }
      cerrarModalFestivo();
      if (typeof mostrarToast === 'function') mostrarToast(`Festivo "${d.nombre}" ${antes ? 'modificado' : 'creado'} correctamente`, { posicion: 'abajo' });
      const fd = feFechaDate(d.fecha);
      feMes = { anio: fd.getFullYear(), mes: fd.getMonth() };
      if (feTabActiva === 'ap' && idGuardado) feApFestivoId = Number(idGuardado);
      await cargarFestivos();
    } catch (err) {
      console.error('Error guardando el festivo:', err);
      mostrarError('No se pudo guardar el festivo.');
    } finally {
      delete btn.dataset.guardando;
      btn.disabled = false;
      feActualizarBotonGuardar();
    }
  }

  async function borrarFestivo() {
    if (!fePuedeEditar()) { if (typeof mostrarModalSinPermiso === 'function') mostrarModalSinPermiso(); return; }
    const f = feFestivos.find(x => Number(x.id) === feEditandoId);
    if (!f) return;
    const ok = await modalConfirm(
      `¿Borrar el festivo "${f.nombre}" del ${feFechaCorta(f.fecha)}?\n\nTambién se borrará la apertura marcada de sus tiendas. Esta acción no se puede deshacer.`,
      { titulo: 'Borrar festivo', icono: '🗑️', danger: true, textoOk: 'Borrar' });
    if (!ok) return;
    try {
      const { error } = await sb.from('festivos').delete().eq('id', f.id);
      if (error) throw error;
      if (typeof registrarAccion === 'function') registrarAccion('festivos', 'Borrar festivo', `${feFechaCorta(f.fecha)} · ${f.nombre}`);
      cerrarModalFestivo();
      if (typeof mostrarToast === 'function') mostrarToast(`Festivo "${f.nombre}" borrado`, { posicion: 'abajo' });
      if (feApFestivoId === Number(f.id)) feApFestivoId = null;
      await cargarFestivos();
    } catch (err) {
      console.error('Error borrando el festivo:', err);
      await feAvisoError('No se pudo borrar el festivo.');
    }
  }

  // ---------------- Aperturas ----------------
  let feApFestivoId = null;
  let feApAperturas = new Map();      // tienda_id → {estado, hora}
  let feApPendienteHora = new Set();  // tiendas con "Abre a las…" pulsado y sin hora todavía
  let feApSeleccion = new Set();
  let feApFiltroEstado = '';          // '' | CIERRA | HABITUAL | ABRE | SIN
  let feApHoraMasiva = '';

  function feApFestivoActual() { return feFestivos.find(f => Number(f.id) === feApFestivoId) || null; }

  function feApElegirFestivoPorDefecto() {
    if (feApFestivoId && feFestivos.some(f => Number(f.id) === feApFestivoId)) return;
    const hoy = feIso(new Date());
    const prox = feFestivos.find(f => f.fecha >= hoy && feTiendasAfectadas(f).length);
    const ultimo = [...feFestivos].reverse().find(f => feTiendasAfectadas(f).length);
    feApFestivoId = prox ? Number(prox.id) : (ultimo ? Number(ultimo.id) : null);
  }

  async function feRenderAperturas(recargar) {
    feApElegirFestivoPorDefecto();
    const sel = document.getElementById('feApFestivo');
    const conTiendas = feFestivos.filter(f => feTiendasAfectadas(f).length);
    sel.innerHTML = conTiendas.length
      ? conTiendas.map(f => `<option value="${f.id}">${feDiaSemana(f.fecha)} ${feFechaCorta(f.fecha)} · ${feEsc(f.nombre)} (${feEsc(feEtiquetaAmbito(f).toLowerCase())})</option>`).join('')
      : '<option value="">— No hay festivos —</option>';
    sel.value = feApFestivoId ? String(feApFestivoId) : '';
    const f = feApFestivoActual();
    if (recargar) {
      feApAperturas = f ? ((await feCargarAperturas([f.id])).get(Number(f.id)) || new Map()) : new Map();
      feApPendienteHora = new Set();
      feApSeleccion = new Set();
    }
    // Filtros de comunidad y agencia, con lo que hay en el festivo
    const afectadas = f ? feTiendasAfectadas(f) : [];
    const selC = document.getElementById('feApComunidad'); const valC = selC.value;
    const comus = [...new Set(afectadas.map(t => t.comunidad).filter(Boolean))].sort();
    selC.innerHTML = '<option value="">Todas</option>' + comus.map(c => `<option>${feEsc(c)}</option>`).join('');
    selC.value = comus.includes(valC) ? valC : '';
    const selA = document.getElementById('feApAgencia'); const valA = selA.value;
    const ags = [...new Set(afectadas.map(t => Number(t.agencia_id)).filter(Boolean))]
      .map(id => [id, feAgencias.get(id) || '—']).sort((a, b) => a[1].localeCompare(b[1]));
    selA.innerHTML = '<option value="">Todas</option>' + ags.map(([id, n]) => `<option value="${id}">${feEsc(n)}</option>`).join('');
    selA.value = ags.some(([id]) => String(id) === valA) ? valA : '';
    feRenderTablaAperturas();
  }

  function feApEstadoDe(id) {
    if (feApPendienteHora.has(id)) return 'ABRE_PEND';
    return feApAperturas.get(id)?.estado || 'SIN';
  }

  function feRenderTablaAperturas() {
    const cont = document.getElementById('feApContenido');
    const scrollAntes = cont.querySelector('.fe-scroll')?.scrollTop || 0;
    const f = feApFestivoActual();
    if (!f) {
      cont.innerHTML = `<div class="fe-vacio-box"><div class="fe-vacio-ico">🏪</div><h4>No hay festivos con tiendas afectadas</h4>
        <p>Da de alta un festivo en la pestaña Calendario y aquí podrás marcar cómo abre cada tienda.</p></div>`;
      return;
    }
    const afectadas = feTiendasAfectadas(f);
    const cuenta = { CIERRA: 0, HABITUAL: 0, ABRE: 0, SIN: 0 };
    afectadas.forEach(t => { const e = feApAperturas.get(t.id)?.estado; cuenta[e || 'SIN']++; });

    const fC = document.getElementById('feApComunidad').value;
    const fA = document.getElementById('feApAgencia').value;
    const q = feNorm(document.getElementById('feApBuscar').value);
    const visibles = afectadas.filter(t => {
      if (fC && t.comunidad !== fC) return false;
      if (fA && String(t.agencia_id) !== fA) return false;
      if (q && !feNorm(t.nombre).includes(q) && !feNorm(t.numero_tienda).includes(q)) return false;
      if (feApFiltroEstado) {
        const e = feApAperturas.get(t.id)?.estado || 'SIN';
        if (e !== feApFiltroEstado) return false;
      }
      return true;
    });
    // La selección solo guarda tiendas visibles
    feApSeleccion = new Set([...feApSeleccion].filter(id => visibles.some(t => t.id === id)));

    const kpi = (clave, n, txt, cls) => `<button type="button" class="rm-kpi fe-kpi ${cls} ${feApFiltroEstado === clave ? 'on' : ''}" data-fe-kpi="${clave}" title="${feApFiltroEstado === clave ? 'Quitar filtro' : 'Ver solo estas'}"><b>${n}</b><small>${txt}</small></button>`;
    const diaTxt = `${feDiaSemana(f.fecha)} ${feFechaCorta(f.fecha).slice(0, 5)}`;
    const seg = (id, e) => `<div class="fe-seg" data-fe-tienda="${id}">
        <button type="button" data-fe-estado="CIERRA" class="${e === 'CIERRA' ? 'on cierra' : ''}">🔒 Cierra</button>
        <button type="button" data-fe-estado="HABITUAL" class="${e === 'HABITUAL' ? 'on hab' : ''}">Horario habitual</button>
        <button type="button" data-fe-estado="ABRE" class="${e === 'ABRE' || e === 'ABRE_PEND' ? 'on abre' : ''}">🕐 Abre a las…</button>
      </div>`;
    const filas = visibles.map(t => {
      const e = feApEstadoDe(t.id);
      const ap = feApAperturas.get(t.id);
      const extra = e === 'ABRE' || e === 'ABRE_PEND'
        ? `<input type="time" class="fe-hora" data-fe-hora="${t.id}" value="${feHora(ap?.hora)}">${e === 'ABRE_PEND' ? '<span class="fe-pend">PON LA HORA</span>' : ''}`
        : (e === 'SIN' ? '<span class="fe-pend">SIN INDICAR</span>' : '');
      const quien = ap?.actualizado_por ? ` title="Marcado por ${feEsc(ap.actualizado_por)}"` : '';
      return `<tr class="${feApSeleccion.has(t.id) ? 'fe-sel' : ''} ${e === 'SIN' ? 'fe-fila-sin' : ''}">
        <td><input type="checkbox" data-fe-sel="${t.id}" ${feApSeleccion.has(t.id) ? 'checked' : ''}></td>
        <td>${feEsc(t.numero_tienda || '—')}</td>
        <td><b>${feEsc(t.nombre)}</b></td>
        <td>${feEsc(t.provincia || '')}</td>
        <td>${feEsc(feAgencias.get(Number(t.agencia_id)) || '—')}</td>
        <td>${feEsc(feHora(t.hora_prevista) || '—')}</td>
        <td${quien}><div class="fe-ap-celda">${seg(t.id, e)}${extra}</div></td>
      </tr>`;
    }).join('');
    const todasSel = visibles.length && visibles.every(t => feApSeleccion.has(t.id));
    const nSel = feApSeleccion.size;

    cont.innerHTML = `
      <div class="fe-ap-kpis">
        ${kpi('', afectadas.length, 'Tiendas afectadas', 'fe-k-total')}
        ${kpi('CIERRA', cuenta.CIERRA, 'Cierran', 'fe-k-cierra')}
        ${kpi('ABRE', cuenta.ABRE, 'Abren con otro horario', 'fe-k-abre')}
        ${kpi('HABITUAL', cuenta.HABITUAL, 'Horario habitual', 'fe-k-hab')}
        ${kpi('SIN', cuenta.SIN, 'Sin indicar', cuenta.SIN ? 'fe-k-sin' : 'fe-k-sin cero')}
      </div>
      <div class="fe-ap-masivo ${nSel ? '' : 'apagado'}">
        <b>${nSel ? `${nSel} seleccionada${nSel === 1 ? '' : 's'}:` : 'Marca tiendas para cambiarlas a la vez'}</b>
        ${nSel ? `marcar como
        <div class="fe-seg fe-seg-masivo">
          <button type="button" data-fe-masivo="CIERRA">🔒 Cierra</button>
          <button type="button" data-fe-masivo="HABITUAL">Horario habitual</button>
          <button type="button" data-fe-masivo="ABRE">🕐 Abre a las</button>
        </div>
        <input type="time" class="fe-hora" id="feHoraMasiva" value="${feEsc(feApHoraMasiva)}" title="Hora para «Abre a las»">
        <button type="button" class="btn fe-nav fe-btn-limpiar" data-fe-masivo="SIN" title="Volver a «Sin indicar»">↺ Sin indicar</button>` : ''}
        <span class="fe-ap-info">Se guarda al momento · ${visibles.length === afectadas.length ? `${afectadas.length} tiendas` : `Mostrando ${visibles.length} de ${afectadas.length} tiendas`}</span>
      </div>
      <div class="fe-scroll">
        <table class="fe-tabla">
          <thead><tr>
            <th style="width:30px;"><input type="checkbox" id="feApSelTodas" ${todasSel ? 'checked' : ''} title="Seleccionar todas las que se ven"></th>
            <th>Nº</th><th>Tienda</th><th>Provincia</th><th>Agencia</th><th>Hora entrega</th><th>Apertura el ${diaTxt}</th>
          </tr></thead>
          <tbody>${filas || '<tr><td colspan="7" class="fe-tabla-vacia">No hay tiendas con estos filtros.</td></tr>'}</tbody>
        </table>
      </div>`;
    const sc = cont.querySelector('.fe-scroll');
    if (sc && scrollAntes) sc.scrollTop = scrollAntes;
  }

  async function feGuardarAperturas(ids, estado, hora) {
    if (!fePuedeEditar()) { if (typeof mostrarModalSinPermiso === 'function') mostrarModalSinPermiso(); return false; }
    const f = feApFestivoActual();
    if (!f || !ids.length) return false;
    const usuario = feUsuario();
    const ahora = new Date().toISOString();
    try {
      if (estado === 'SIN') {
        const { error } = await sb.from('festivo_aperturas').delete().eq('festivo_id', f.id).in('tienda_id', ids);
        if (error) throw error;
        ids.forEach(id => { feApAperturas.delete(id); feApPendienteHora.delete(id); });
      } else {
        const filas = ids.map(id => ({ festivo_id: f.id, tienda_id: id, estado, hora: estado === 'ABRE' ? hora : null, actualizado_en: ahora, actualizado_por: usuario }));
        const { error } = await sb.from('festivo_aperturas').upsert(filas, { onConflict: 'festivo_id,tienda_id' });
        if (error) throw error;
        filas.forEach(r => { feApAperturas.set(r.tienda_id, r); feApPendienteHora.delete(r.tienda_id); });
      }
      if (typeof registrarAccion === 'function') {
        const nombres = ids.map(id => feTiendas.find(t => t.id === id)?.nombre || '#' + id);
        const txtEstado = estado === 'SIN' ? 'Sin indicar' : estado === 'ABRE' ? `Abre a las ${hora}` : FE_ESTADO_TXT[estado];
        registrarAccion('festivos', 'Apertura en festivo',
          `${feFechaCorta(f.fecha)} · ${f.nombre} · ${nombres.length > 3 ? `${nombres.length} tiendas` : nombres.join(', ')}: ${txtEstado}`,
          nombres.length > 3 ? [{ campo: 'Tiendas', antes: '—', despues: nombres.join(', ') }] : null);
      }
      return true;
    } catch (err) {
      console.error('Error guardando la apertura:', err);
      await feAvisoError('No se pudo guardar la apertura. Vuelve a intentarlo.');
      return false;
    }
  }

  async function feClickEstado(tiendaId, estado) {
    const actual = feApEstadoDe(tiendaId);
    // Pulsar otra vez la opción marcada la deja "Sin indicar".
    if (actual === estado || (estado === 'ABRE' && actual === 'ABRE_PEND')) {
      if (actual === 'ABRE_PEND') { feApPendienteHora.delete(tiendaId); feRenderTablaAperturas(); return; }
      if (await feGuardarAperturas([tiendaId], 'SIN')) feRenderTablaAperturas();
      return;
    }
    if (estado === 'ABRE') {
      if (!fePuedeEditar()) { if (typeof mostrarModalSinPermiso === 'function') mostrarModalSinPermiso(); return; }
      feApPendienteHora.add(tiendaId);
      feRenderTablaAperturas();
      setTimeout(() => document.querySelector(`[data-fe-hora="${tiendaId}"]`)?.focus(), 20);
      return;
    }
    if (await feGuardarAperturas([tiendaId], estado)) feRenderTablaAperturas();
  }

  async function feClickMasivo(estado) {
    const ids = [...feApSeleccion];
    if (!ids.length) return;
    let hora = null;
    if (estado === 'ABRE') {
      hora = (document.getElementById('feHoraMasiva')?.value || '').slice(0, 5);
      if (!hora) { await modalAlert('Pon primero la hora en la casilla de al lado de «Abre a las».', { titulo: 'Falta la hora', icono: '🕐' }); document.getElementById('feHoraMasiva')?.focus(); return; }
    }
    if (estado === 'SIN') {
      const ok = await modalConfirm(`¿Dejar las ${ids.length} tiendas seleccionadas como «Sin indicar»?`, { titulo: 'Quitar apertura', icono: '↺', danger: true, textoOk: 'Quitar' });
      if (!ok) return;
    }
    if (await feGuardarAperturas(ids, estado, hora)) {
      feApSeleccion = new Set();
      if (typeof mostrarToast === 'function') mostrarToast(`${ids.length} tienda${ids.length === 1 ? '' : 's'} actualizada${ids.length === 1 ? '' : 's'}`, { posicion: 'abajo' });
      feRenderTablaAperturas();
    }
  }

  // ---------------- Buscador de festivos ----------------
  let feCatalogo = [];
  let feBusAnios = [];
  let feBusItems = [];
  let feBusFiltro = '';

  async function abrirBuscadorFestivos() {
    let error = null;
    if (typeof mostrarCargandoGlobal === 'function') mostrarCargandoGlobal();
    try {
      await feCargarBase();
      const { data, error: e } = await sb.from('festivos_catalogo').select('anio, fecha, nombre, ambito, comunidades, fuente').order('fecha').order('nombre');
      if (e) throw e;
      feCatalogo = data || [];
    } catch (err) { console.error('Error cargando el calendario oficial:', err); error = err; }
    finally { if (typeof ocultarCargandoGlobal === 'function') ocultarCargandoGlobal(); }
    if (error) { await feAvisoError('No se pudo cargar el calendario oficial de festivos.'); return; }

    feBusAnios = [...new Set(feCatalogo.map(c => Number(c.anio)))].sort();
    const sel = document.getElementById('feBusAnio');
    const hoy = new Date();
    // Desde octubre se propone el año siguiente (el BOE lo publica en otoño).
    const preferido = hoy.getMonth() >= 9 ? hoy.getFullYear() + 1 : hoy.getFullYear();
    const anio = feBusAnios.includes(preferido) ? preferido : (feBusAnios[feBusAnios.length - 1] || preferido);
    const anios = [...new Set([...feBusAnios, preferido])].sort();
    sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join('');
    sel.value = String(anio);
    feBusFiltro = '';
    feBusCalcular();
    document.getElementById('buscarFestivosModalOverlay').classList.add('show');
  }

  function feBusCalcular() {
    const anio = Number(document.getElementById('feBusAnio').value);
    feBusItems = feOrdenar(feCatalogo.filter(c => Number(c.anio) === anio).map(c => ({ ...c }))).map(c => {
      const cand = { fecha: c.fecha, ambito: c.ambito, comunidades: c.comunidades || [], tienda_ids: [] };
      const mismoDia = feFestivos.filter(f => f.fecha === c.fecha);
      const igual = mismoDia.find(f => f.ambito === c.ambito
        && (c.ambito === 'NACIONAL' || JSON.stringify([...(f.comunidades || [])].sort()) === JSON.stringify([...cand.comunidades].sort())));
      const solapa = !igual && mismoDia.find(f => feSeSolapan(f, cand));
      const afectadas = feTiendasAfectadas(cand).length;
      const estado = igual ? 'ya' : solapa ? 'dif' : afectadas ? 'nuevo' : 'no';
      return { ...c, cand, afectadas, estado, marcado: estado === 'nuevo', existente: igual || solapa || null };
    });
    feBusRender();
  }

  function feBusRender() {
    const anio = Number(document.getElementById('feBusAnio').value);
    const cuenta = { nuevo: 0, ya: 0, dif: 0, no: 0 };
    feBusItems.forEach(i => cuenta[i.estado]++);
    const chip = (k, txt, n) => `<button type="button" class="fe-bus-chip ${feBusFiltro === k ? 'on' : ''}" data-fe-bus-filtro="${k}">${txt}<b>${n}</b></button>`;
    document.getElementById('feBusChips').innerHTML =
      chip('', 'Todos', feBusItems.length) + chip('nuevo', 'Nuevos', cuenta.nuevo) + chip('ya', 'Ya añadidos', cuenta.ya)
      + chip('dif', 'Distintos', cuenta.dif) + chip('no', 'No afectan', cuenta.no);

    const lista = document.getElementById('feBusLista');
    const scrollAntes = lista.scrollTop;
    if (!feBusItems.length) {
      lista.innerHTML = `<div class="fe-vacio-box"><div class="fe-vacio-ico">📭</div><h4>El calendario oficial de ${anio} todavía no está cargado</h4>
        <p>El BOE publica cada otoño los festivos del año siguiente. Mientras tanto, puedes dar de alta los festivos a mano.</p></div>`;
    } else {
      const visibles = feBusItems.map((it, idx) => ({ it, idx })).filter(({ it }) => !feBusFiltro || it.estado === feBusFiltro);
      let mesActual = -1; let h = '';
      const ESTADO_TXT = { nuevo: 'Nuevo', ya: 'Ya añadido', dif: 'Distinto', no: 'No afecta' };
      visibles.forEach(({ it, idx }) => {
        const m = Number(it.fecha.slice(5, 7)) - 1;
        if (m !== mesActual) { mesActual = m; h += `<div class="fe-bus-mes">${FE_MESES[m]} ${anio}</div>`; }
        const alcance = it.ambito === 'NACIONAL' ? 'España' : it.comunidades.length > 6 ? `${it.comunidades.length} comunidades` : it.comunidades.join(', ');
        const etiqueta = feEtiquetaAmbito(it);
        const nota = it.estado === 'dif' && it.existente
          ? ` · <b class="fe-bus-aviso">Ese día ya está «${feEsc(it.existente.nombre)}» (${feEsc(feEtiquetaAmbito(it.existente).toLowerCase())}: ${feEsc(feTextoAlcance(it.existente))})</b>` : '';
        h += `<label class="fe-bus-fila ${it.estado === 'ya' ? 'ya' : ''}" title="${it.comunidades.length > 6 ? feEsc(it.comunidades.join(', ')) : ''}">
          <input type="checkbox" data-fe-bus-idx="${idx}" ${it.estado === 'ya' ? 'checked disabled' : (it.marcado ? 'checked' : '')}>
          <div class="fe-bus-f">${it.fecha.slice(8, 10)}/${FE_MESES[m].slice(0, 3)}<small>${feDiaSemana(it.fecha)}</small></div>
          <div class="fe-bus-txt"><div class="fe-bus-n"><span class="fe-marca ${it.ambito === 'NACIONAL' ? 'nac' : 'aut'} fe-marca-mini">${etiqueta}</span>${feEsc(it.nombre)}</div>
            <div class="fe-bus-s">${feEsc(alcance)} · ${it.afectadas ? `${it.afectadas} tienda${it.afectadas === 1 ? '' : 's'}` : 'Ninguna tienda'}${nota}</div></div>
          <span class="fe-bus-est ${it.estado}">${ESTADO_TXT[it.estado]}</span>
        </label>`;
      });
      lista.innerHTML = h || '<div class="fe-tabla-vacia">No hay festivos con este filtro.</div>';
      lista.scrollTop = scrollAntes;
    }
    const fuentes = [...new Set(feBusItems.map(i => i.fuente).filter(Boolean))];
    document.getElementById('feBusNota').textContent =
      `Fuente: ${fuentes.length ? fuentes.join(' · ') : 'calendario oficial'}. Calendarios cargados: ${feBusAnios.join(', ') || 'ninguno'}. `
      + 'Los festivos locales e insulares no salen aquí: se siguen dando de alta a mano.';
    const n = feBusItems.filter(i => i.marcado && i.estado !== 'ya').length;
    const btn = document.getElementById('btnAnadirFestivosBuscados');
    btn.textContent = n ? `➕ Añadir ${n} festivo${n === 1 ? '' : 's'}` : '➕ Añadir festivos';
    btn.disabled = !n;
  }

  async function feBusAnadir() {
    if (!fePuedeEditar()) { if (typeof mostrarModalSinPermiso === 'function') mostrarModalSinPermiso(); return; }
    const elegidos = feBusItems.filter(i => i.marcado && i.estado !== 'ya');
    if (!elegidos.length) return;
    const dif = elegidos.filter(i => i.estado === 'dif').length;
    if (dif) {
      const ok = await modalConfirm(
        `Has marcado ${dif} festivo${dif === 1 ? '' : 's'} «Distinto${dif === 1 ? '' : 's'}»: ese día ya hay otro festivo que afecta a algunas de esas tiendas.\n\n¿Añadirlo${dif === 1 ? '' : 's'} igualmente?`,
        { titulo: 'Festivos distintos', icono: '⚠️', textoOk: 'Añadir igualmente', textoCancel: 'Volver' });
      if (!ok) return;
    }
    const usuario = feUsuario();
    const filas = elegidos.map(i => ({
      fecha: i.fecha, nombre: i.nombre.trim().toUpperCase(), ambito: i.ambito,
      comunidades: i.ambito === 'AUTONOMICO' ? [...i.comunidades].sort() : [], tienda_ids: [],
      origen: 'BUSCADOR', creado_por: usuario
    }));
    const btn = document.getElementById('btnAnadirFestivosBuscados');
    btn.disabled = true;
    try {
      const { error } = await sb.from('festivos').insert(filas);
      if (error) throw error;
      if (typeof registrarAccion === 'function') {
        registrarAccion('festivos', 'Añadir festivos desde el buscador', `${document.getElementById('feBusAnio').value} · ${filas.length} festivo${filas.length === 1 ? '' : 's'}`,
          [{ campo: 'Festivos', antes: '—', despues: filas.map(r => `${feFechaCorta(r.fecha)} ${r.nombre}`).join(', ') }]);
      }
      document.getElementById('buscarFestivosModalOverlay').classList.remove('show');
      if (typeof mostrarToast === 'function') mostrarToast(`${filas.length} festivo${filas.length === 1 ? '' : 's'} añadido${filas.length === 1 ? '' : 's'}`, { posicion: 'abajo' });
      const primero = feFechaDate(filas[0].fecha);
      feMes = { anio: primero.getFullYear(), mes: primero.getMonth() };
      await cargarFestivos();
    } catch (err) {
      console.error('Error añadiendo festivos:', err);
      await feAvisoError('No se pudieron añadir los festivos.');
      feBusRender();
    }
  }

  // ---------------- Submenú Organización (menú Gestión) ----------------
  (function () {
    const sub = document.getElementById('ddSubOrganizacion');
    const btn = document.getElementById('btnSubOrganizacion');
    if (!sub || !btn) return;
    // Con ratón se abre al pasar por encima (pulsar no lo cierra); en táctil, pulsar abre/cierra.
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.matchMedia('(hover: hover)').matches) sub.classList.add('open');
      else sub.classList.toggle('open');
    });
    let temporizadorCierre = null;
    sub.addEventListener('mouseenter', () => {
      clearTimeout(temporizadorCierre);
      if (window.matchMedia('(hover: hover)').matches) sub.classList.add('open');
    });
    // Se cierra con un pequeño margen, por si el ratón se sale un momento.
    sub.addEventListener('mouseleave', () => {
      if (!window.matchMedia('(hover: hover)').matches) return;
      clearTimeout(temporizadorCierre);
      temporizadorCierre = setTimeout(() => sub.classList.remove('open'), 350);
    });
    document.addEventListener('click', (e) => { if (!sub.contains(e.target) || e.target.closest('[data-view]')) sub.classList.remove('open'); });
    document.getElementById('btnConfigDropdown')?.addEventListener('click', () => sub.classList.remove('open'));
  })();

  // ---------------- Eventos ----------------
  document.querySelectorAll('[data-view="config-festivos"]').forEach(el => el.addEventListener('click', () => cargarFestivos()));
  document.getElementById('btnRecargarFestivos')?.addEventListener('click', (e) => recargarConGiro(e.currentTarget, cargarFestivos));
  document.querySelectorAll('#view-config-festivos [data-fe-tab]').forEach(b => b.addEventListener('click', () => feCambiarTab(b.dataset.feTab)));
  document.getElementById('btnNuevoFestivo')?.addEventListener('click', () => abrirModalFestivo());
  document.getElementById('btnBuscarFestivos')?.addEventListener('click', abrirBuscadorFestivos);
  document.getElementById('feMesAnterior')?.addEventListener('click', () => feMoverMes(-1));
  document.getElementById('feMesSiguiente')?.addEventListener('click', () => feMoverMes(1));
  document.getElementById('feMesHoy')?.addEventListener('click', () => { const h = new Date(); feMes = { anio: h.getFullYear(), mes: h.getMonth() }; feRenderCalendarioConCarga(); });

  // Calendario: pulsar un festivo lo abre; pulsar un día vacío crea uno ese día.
  document.getElementById('feCalendario')?.addEventListener('click', (e) => {
    const marca = e.target.closest('[data-fe-editar]');
    if (marca) { abrirModalFestivo(Number(marca.dataset.feEditar)); return; }
    const dia = e.target.closest('[data-fe-dia]');
    if (!dia) return;
    const deEseDia = feFestivos.filter(f => f.fecha === dia.dataset.feDia);
    if (deEseDia.length) { abrirModalFestivo(Number(deEseDia[0].id)); return; }
    if (!fePuedeEditar()) { if (typeof mostrarModalSinPermiso === 'function') mostrarModalSinPermiso(); return; }
    abrirModalFestivo(null, dia.dataset.feDia);
  });
  document.getElementById('feListaMes')?.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-fe-editar]');
    if (ed) { abrirModalFestivo(Number(ed.dataset.feEditar)); return; }
    const ap = e.target.closest('[data-fe-ir-ap]');
    if (ap) { feApFestivoId = Number(ap.dataset.feIrAp); feApFiltroEstado = ''; feCambiarTab('ap'); }
  });

  // Modal festivo
  document.getElementById('btnCerrarFestivo')?.addEventListener('click', cancelarModalFestivo);
  document.getElementById('btnCancelarFestivo')?.addEventListener('click', cancelarModalFestivo);
  document.getElementById('btnGuardarFestivo')?.addEventListener('click', guardarFestivo);
  document.getElementById('btnBorrarFestivo')?.addEventListener('click', borrarFestivo);
  document.getElementById('feAmbito')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ambito]');
    if (!b) return;
    feFormAmbito = b.dataset.ambito;
    feActualizarForm();
  });
  document.getElementById('feComunidades')?.addEventListener('change', (e) => {
    const c = e.target.closest('input[type="checkbox"]');
    if (!c) return;
    if (c.checked) feFormComunidades.add(c.value); else feFormComunidades.delete(c.value);
    feActualizarAfecta();
  });
  document.getElementById('feTiendasLista')?.addEventListener('change', (e) => {
    const c = e.target.closest('input[type="checkbox"]');
    if (!c) return;
    const id = Number(c.value);
    if (c.checked) feFormTiendas.add(id); else feFormTiendas.delete(id);
    feRenderTiendasSel(); feActualizarAfecta();
  });
  document.getElementById('feTiendasSel')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fe-quitar-tienda]');
    if (!b) return;
    feFormTiendas.delete(Number(b.dataset.feQuitarTienda));
    feRenderTiendasSel(); feRenderTiendasLista(); feActualizarAfecta();
  });
  document.getElementById('feTiendasBuscar')?.addEventListener('input', feRenderTiendasLista);
  document.getElementById('feNombre')?.addEventListener('input', (e) => {
    const inp = e.target; const may = inp.value.toUpperCase();
    if (inp.value !== may) { const a = inp.selectionStart, b = inp.selectionEnd; inp.value = may; try { inp.setSelectionRange(a, b); } catch (_) {} }
  });
  document.getElementById('festivoModalOverlay')?.addEventListener('input', feActualizarBotonGuardar);
  document.getElementById('festivoModalOverlay')?.addEventListener('change', feActualizarBotonGuardar);
  document.getElementById('festivoModalOverlay')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.id === 'feTiendasBuscar') return;
    e.preventDefault();
    const btn = document.getElementById('btnGuardarFestivo');
    if (btn && !btn.disabled) btn.click();
  });

  // Aperturas
  document.getElementById('feApFestivo')?.addEventListener('change', async (e) => {
    feApFestivoId = Number(e.target.value) || null;
    feApFiltroEstado = '';
    let error = null;
    if (typeof mostrarCargandoGlobal === 'function') mostrarCargandoGlobal();
    try { await feRenderAperturas(true); } catch (err) { console.error(err); error = err; }
    finally { if (typeof ocultarCargandoGlobal === 'function') ocultarCargandoGlobal(); }
    if (error) await feAvisoError('No se pudieron cargar las aperturas de este festivo.');
  });
  ['feApComunidad', 'feApAgencia'].forEach(id => document.getElementById(id)?.addEventListener('change', feRenderTablaAperturas));
  document.getElementById('feApBuscar')?.addEventListener('input', feRenderTablaAperturas);
  const feApCont = document.getElementById('feApContenido');
  feApCont?.addEventListener('click', (e) => {
    const k = e.target.closest('[data-fe-kpi]');
    if (k) { const v = k.dataset.feKpi; feApFiltroEstado = feApFiltroEstado === v ? '' : v; feRenderTablaAperturas(); return; }
    const bEst = e.target.closest('[data-fe-estado]');
    if (bEst) { feClickEstado(Number(bEst.closest('[data-fe-tienda]').dataset.feTienda), bEst.dataset.feEstado); return; }
    const bMas = e.target.closest('[data-fe-masivo]');
    if (bMas) { feClickMasivo(bMas.dataset.feMasivo); return; }
  });
  feApCont?.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-fe-sel]');
    if (sel) { const id = Number(sel.dataset.feSel); if (sel.checked) feApSeleccion.add(id); else feApSeleccion.delete(id); feRenderTablaAperturas(); return; }
    if (e.target.id === 'feApSelTodas') {
      const filas = [...feApCont.querySelectorAll('[data-fe-sel]')].map(x => Number(x.dataset.feSel));
      feApSeleccion = e.target.checked ? new Set(filas) : new Set();
      feRenderTablaAperturas(); return;
    }
    if (e.target.id === 'feHoraMasiva') { feApHoraMasiva = e.target.value; return; }
    const h = e.target.closest('[data-fe-hora]');
    if (h && h.value) {
      if (await feGuardarAperturas([Number(h.dataset.feHora)], 'ABRE', h.value.slice(0, 5))) feRenderTablaAperturas();
    }
  });
  feApCont?.addEventListener('input', (e) => { if (e.target.id === 'feHoraMasiva') feApHoraMasiva = e.target.value; });

  // Buscador
  document.getElementById('feBusAnio')?.addEventListener('change', () => { feBusFiltro = ''; feBusCalcular(); });
  document.getElementById('feBusChips')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fe-bus-filtro]');
    if (!b) return;
    feBusFiltro = b.dataset.feBusFiltro; feBusRender();
  });
  document.getElementById('feBusLista')?.addEventListener('change', (e) => {
    const c = e.target.closest('[data-fe-bus-idx]');
    if (!c) return;
    const it = feBusItems[Number(c.dataset.feBusIdx)];
    if (it) it.marcado = c.checked;
    feBusRender();
  });
  const feCerrarBuscador = () => document.getElementById('buscarFestivosModalOverlay').classList.remove('show');
  document.getElementById('btnCerrarBuscarFestivos')?.addEventListener('click', feCerrarBuscador);
  document.getElementById('btnCancelarBuscarFestivos')?.addEventListener('click', feCerrarBuscador);
  document.getElementById('btnAnadirFestivosBuscados')?.addEventListener('click', feBusAnadir);
