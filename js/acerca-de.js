// ---------------------------------------------------------------
// GIDT · js/acerca-de.js — Ventana "Acerca de" al pulsar el logo
// (pantalla de login y cabecera de la app). Misma ventana que en SALIDAS.
// ---------------------------------------------------------------

/* Datos que se muestran en la ventana. Para cambiar el titular de la
 * licencia o el número de activación, basta con tocarlos aquí.
 * La versión NO se pone aquí: sale siempre de version.json (la misma que
 * usa js/actualizaciones.js), así que se actualiza sola con cada versión. */
const ACERCA_DE_GIDT = {
  autor: 'JOSE LUIS FRANCO FERNANDEZ',
  licenciatario: 'PRIMOR',
  activacion: 'GD4TM-X7R2P-9KQWN-B3H8V-LC6ZE',
  anio: '2026',
  titularDerechos: 'Jose Luis Franco Fernandez'
};

(function () {
  function escaparHtmlAcerca(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // La versión ya la pinta actualizaciones.js en la cabecera ("v1.6.10") y
  // en el login ("Versión 1.6.10"); se reaprovecha de ahí. Si aún no está
  // (p. ej. sin conexión al arrancar), se intenta leer version.json ahora.
  function versionYaPintada() {
    const tag = document.getElementById('appVersionTag');
    const txt = tag && tag.textContent.trim();
    if (txt) return txt.replace(/^v/i, '');
    const loginTag = document.getElementById('loginVersionTag');
    const txtLogin = loginTag && loginTag.textContent.trim();
    if (txtLogin) return txtLogin.replace(/^Versión\s*/i, '');
    return null;
  }

  async function leerVersionJson() {
    try {
      const resp = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.version || null;
    } catch {
      return null;
    }
  }

  function pintarContenido() {
    const d = ACERCA_DE_GIDT;
    const e = escaparHtmlAcerca;
    document.getElementById('acercaDeAutor').textContent = d.autor;
    document.getElementById('acercaDeLicenciatario').textContent = d.licenciatario;
    document.getElementById('acercaDeActivacion').textContent = d.activacion;
    document.getElementById('acercaDeCopy').innerHTML =
      '© ' + e(d.anio) + ' ' + e(d.titularDerechos) + '<span>Todos los derechos reservados.</span>';
  }

  // Pestaña "Novedades": historial de versiones de js/changelog.js.
  const TIPOS_CAMBIO = { nuevo: 'Nuevo', mejora: 'Mejora', correccion: 'Corrección' };

  function fechaChangelog(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? p[2].padStart(2, '0') + '/' + p[1].padStart(2, '0') + '/' + p[0] : '';
  }

  function pintarNovedades() {
    const cont = document.getElementById('acercaDeNovedades');
    if (!cont) return;
    const e = escaparHtmlAcerca;
    const lista = (typeof CHANGELOG_GIDT !== 'undefined' && Array.isArray(CHANGELOG_GIDT)) ? CHANGELOG_GIDT : [];
    if (!lista.length) {
      cont.innerHTML = '<p class="acerca-novedades-vacio">Aún no hay novedades registradas.</p>';
      return;
    }
    // La versión actual sale desplegada; las anteriores, plegadas (solo la
    // cabecera con un resumen de cuántos cambios de cada tipo tienen).
    cont.innerHTML = lista.map(function (v, i) {
      const conteo = { nuevo: 0, mejora: 0, correccion: 0 };
      const cambios = (v.cambios || []).map(function (c) {
        const tipo = TIPOS_CAMBIO[c.tipo] ? c.tipo : 'mejora';
        conteo[tipo] += 1;
        return '<li><span class="acerca-tag ' + tipo + '">' + TIPOS_CAMBIO[tipo] + '</span><span>' + e(c.texto) + '</span></li>';
      }).join('');
      const resumen = Object.keys(conteo).filter(function (t) { return conteo[t] > 0; }).map(function (t) {
        return '<span class="acerca-resumen-tag ' + t + '">' + conteo[t] + ' ' + TIPOS_CAMBIO[t] + '</span>';
      }).join('');
      const abierta = i === 0;
      return '<div class="acerca-version-item' + (abierta ? ' abierta' : '') + '">' +
        '<button type="button" class="acerca-version-cab" aria-expanded="' + abierta + '">' +
          '<span class="acerca-version-num">v' + e(v.version) + '</span>' +
          (i === 0 ? '<span class="acerca-version-actual">Actual</span>' : '') +
          '<span class="acerca-version-resumen">' + resumen + '</span>' +
          '<span class="acerca-version-fecha">' + e(fechaChangelog(v.fecha)) + '</span>' +
          '<svg class="acerca-version-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="acerca-version-detalle"><div><ul class="acerca-cambios">' + cambios + '</ul></div></div></div>';
    }).join('');

    cont.querySelectorAll('.acerca-version-cab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const item = btn.closest('.acerca-version-item');
        const abrir = !item.classList.contains('abierta');
        item.classList.toggle('abierta', abrir);
        btn.setAttribute('aria-expanded', String(abrir));
      });
    });
  }

  function mostrarPestana(cual) {
    const esNov = cual === 'novedades';
    const tabL = document.getElementById('acercaTabLicencia');
    const tabN = document.getElementById('acercaTabNovedades');
    tabL.classList.toggle('activa', !esNov);
    tabN.classList.toggle('activa', esNov);
    tabL.setAttribute('aria-selected', String(!esNov));
    tabN.setAttribute('aria-selected', String(esNov));
    document.getElementById('acercaPanelLicencia').hidden = esNov;
    document.getElementById('acercaPanelNovedades').hidden = !esNov;
  }

  function abrir() {
    const overlay = document.getElementById('acercaDeModalOverlay');
    if (!overlay) return;
    // Si el aviso de actualización está abierto, no se le pisa.
    const act = document.getElementById('actualizacionModalOverlay');
    if (act && act.classList.contains('show')) return;

    pintarContenido();
    pintarNovedades();
    mostrarPestana('licencia');
    const elVersion = document.getElementById('acercaDeVersion');
    const v = versionYaPintada();
    elVersion.textContent = v ? 'Versión ' + v : '';
    if (!v) {
      leerVersionJson().then(function (vr) {
        if (vr) elVersion.textContent = 'Versión ' + vr;
      });
    }

    overlay.classList.add('show');
    document.getElementById('btnAcercaDeCerrar').focus();
  }

  function cerrar() {
    const overlay = document.getElementById('acercaDeModalOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  function init() {
    const overlay = document.getElementById('acercaDeModalOverlay');
    if (!overlay) return;

    document.getElementById('btnAcercaDeCerrar').addEventListener('click', cerrar);
    document.getElementById('acercaTabLicencia').addEventListener('click', function () { mostrarPestana('licencia'); });
    document.getElementById('acercaTabNovedades').addEventListener('click', function () { mostrarPestana('novedades'); });
    // Un clic fuera de la ventana NO la cierra (solo la ✕ o Escape): la
    // ventana da un pequeño "toque" para indicar que hay que usar la ✕.
    overlay.addEventListener('click', function (ev) {
      if (ev.target !== overlay) return;
      const box = overlay.querySelector('.acerca-de-box');
      if (box && box.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        box.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && overlay.classList.contains('show')) cerrar();
    });

    // El logo del login y el logo + nombre de la cabecera abren la ventana.
    ['#loginScreen .login-card .mark', 'header.top .mark', 'header.top .app-name'].forEach(function (selector) {
      const el = document.querySelector(selector);
      if (!el) return;
      el.classList.add('abre-acerca-de');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('title', 'Acerca de');
      el.addEventListener('click', abrir);
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); }
      });
    });
  }

  window.mostrarModalAcercaDe = abrir;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
