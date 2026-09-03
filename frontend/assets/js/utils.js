/**
 * NexoERP — utils.js
 * Utilidades compartidas: formato de moneda/fechas, CSV, helpers UI.
 */

var Utils = (function () {

  var MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function parseFecha(s) {
    // Acepta 'yyyy-MM-dd HH:mm:ss' o 'yyyy-MM-dd' — evita desfases de zona horaria.
    if (!s) return null;
    if (s instanceof Date) return s;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
    if (!m) return new Date(s);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtFecha(s) {
    var d = parseFecha(s);
    if (!d || isNaN(d)) return '—';
    return pad(d.getDate()) + ' ' + MESES_CORTOS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtFechaHora(s) {
    var d = parseFecha(s);
    if (!d || isNaN(d)) return '—';
    return pad(d.getDate()) + ' ' + MESES_CORTOS[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtHora(s) {
    var d = parseFecha(s);
    if (!d || isNaN(d)) return '—';
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fechaISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtNum(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-PE', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec === undefined ? 2 : dec });
  }

  function fmtMoneda(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var simbolo = (window.__nexoerp_cfg && window.__nexoerp_cfg.MONEDA_SIMBOLO) || 'S/';
    return simbolo + ' ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Convierte filas [{col: valor}] a CSV con BOM para Excel. */
  function aCSV(cols, filas) {
    var esc = function (v) {
      var s = (v === null || v === undefined) ? '' : String(v);
      if (/[",;\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    var lineas = [cols.map(function (c) { return esc(c.label); }).join(';')];
    filas.forEach(function (f) {
      lineas.push(cols.map(function (c) { return esc(c.valor !== undefined ? c.valor : f[c.k]); }).join(';'));
    });
    return '\ufeff' + lineas.join('\r\n');
  }

  function descargarCSV(nombreArchivo, cols, filas) {
    var blob = new Blob([aCSV(cols, filas)], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 300);
    };
  }

  function iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
  }

  /** Días entre una fecha (yyyy-MM-dd...) y hoy (negativo = vencido). */
  function diasHasta(s) {
    var d = parseFecha(s);
    if (!d || isNaN(d)) return null;
    var h = new Date();
    var a = new Date(h.getFullYear(), h.getMonth(), h.getDate());
    var b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((b - a) / 86400000);
  }

  /* ---------- Adenda 1.3: envío de comprobantes por WhatsApp ---------- */

  var PREFIJO_WA = function () {
    var cfg = window.__nexoerp_cfg || {};
    return String(cfg.WHATSAPP_PREFIJO || '51').replace(/\D/g, '') || '51';
  };

  /**
   * Construye el mensaje del comprobante (boleta o proforma) para WhatsApp.
   * venta: {boleta|numero, tipoDoc, fecha, clienteNombre, subtotal, igv, total,
   *         descuentoTotal, metodoPago, vuelto, montoRecibido, usuario}
   * detalle: [{cantidad, descripcion, precioUnit, subtotal, esRegalo}]
   * empresa: {razonSocial, ruc, mensajeBoleta, moneda}
   */
  function mensajeWhatsapp(venta, detalle, empresa) {
    var m = (empresa && empresa.moneda) || 'S/';
    var L = [];
    L.push('*' + ((empresa && empresa.razonSocial) || 'NexoERP') + '*');
    if (empresa && empresa.ruc) L.push('RUC: ' + empresa.ruc);
    L.push('----');
    L.push('*' + (venta.tipoDoc || 'BOLETA DE VENTA') + '*: ' + (venta.boleta || venta.numero || ''));
    L.push('Fecha: ' + (venta.fecha || ''));
    if (venta.clienteNombre) L.push('Cliente: ' + venta.clienteNombre);
    if (venta.usuario) L.push('Atendió: ' + venta.usuario);
    L.push('----');
    (detalle || []).forEach(function (d) {
      var esRegalo = String(d.esRegalo || 'No').toUpperCase() === 'SÍ' || String(d.esRegalo || 'No').toUpperCase() === 'SI';
      var desc = d.descripcion + (esRegalo ? ' (REGALO)' : '');
      L.push('· ' + d.cantidad + ' x ' + desc + ' — ' + m + ' ' + Number(d.subtotal || 0).toFixed(2));
    });
    L.push('----');
    if (Number(venta.descuentoTotal) > 0) L.push('Descuentos: -' + m + ' ' + Number(venta.descuentoTotal).toFixed(2));
    L.push('Op. gravadas: ' + m + ' ' + Number(venta.subtotal || 0).toFixed(2));
    L.push('IGV: ' + m + ' ' + Number(venta.igv || 0).toFixed(2));
    L.push('*TOTAL: ' + m + ' ' + Number(venta.total || 0).toFixed(2) + '*');
    if (venta.metodoPago) L.push('Pago: ' + venta.metodoPago);
    if (venta.metodoPago === 'Efectivo' && Number(venta.montoRecibido) > 0) {
      L.push('Recibido: ' + m + ' ' + Number(venta.montoRecibido).toFixed(2) + ' · Vuelto: ' + m + ' ' + Number(venta.vuelto || 0).toFixed(2));
    }
    if (venta.metodoPago === 'Fiado') L.push('_(Venta al fiado — registrada en su cuenta)_');
    L.push('----');
    L.push((empresa && empresa.mensajeBoleta) || '¡Gracias por su compra!');
    return L.filter(function (x) { return x !== undefined; }).join('\n');
  }

  /** Normaliza un teléfono peruano a dígitos con prefijo de país (wa.me). */
  function normalizarTelefono(telefono) {
    var t = String(telefono || '').replace(/\D/g, '');
    if (!t) return '';
    if (t.length === 9) t = PREFIJO_WA() + t;            // 9xx xxx xxx → 51 + número
    else if (t.length === 11 && t.indexOf('51') === 0) { /* ya viene con prefijo */ }
    else if (t.length < 11) t = PREFIJO_WA() + t;
    return t;
  }

  /** URL de WhatsApp lista para abrir en nueva pestaña. */
  function linkWhatsapp(telefono, mensaje) {
    var t = normalizarTelefono(telefono);
    return 'https://wa.me/' + t + '?text=' + encodeURIComponent(mensaje || '');
  }

  return {
    parseFecha: parseFecha, fmtFecha: fmtFecha, fmtFechaHora: fmtFechaHora, fmtHora: fmtHora,
    hoyISO: hoyISO, fechaISO: fechaISO, fmtNum: fmtNum, fmtMoneda: fmtMoneda,
    aCSV: aCSV, descargarCSV: descargarCSV, slug: slug, debounce: debounce,
    iniciales: iniciales, diasHasta: diasHasta,
    mensajeWhatsapp: mensajeWhatsapp, normalizarTelefono: normalizarTelefono, linkWhatsapp: linkWhatsapp
  };
})();
