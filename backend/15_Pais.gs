/**
 * ================================================================
 * NexoERP — 15_Pais.gs  (Adenda 1.6)
 * Localización multi-país para MYPEs de Perú y Sudamérica.
 * ================================================================
 * El usuario elige el país en Ajustes → "País e Impuestos". Al cambiar
 * el país el sistema autocompleta moneda, símbolo, impuesto (nombre,
 * tasa e inclusión en precios) y el prefijo de WhatsApp; TODO queda
 * editable después (nada está clavado: la selección solo sugiere).
 *
 * Perú (PER) es el default y el único país con módulo SUNAT activo;
 * el resto de países usan comprobantes internos (serie/correlativo y
 * libro de ventas genérico) listos para adaptarse fiscalmente.
 */

var CATALOGO_PAISES = [
  { codigo: 'PER', nombre: 'Perú',            moneda: 'PEN', simbolo: 'S/',   impuesto: 'IGV', tasa: '18',   incluido: 'Sí', prefijoWA: '51', decimales: 2 },
  { codigo: 'BOL', nombre: 'Bolivia',         moneda: 'BOB', simbolo: 'Bs',   impuesto: 'IVA', tasa: '14.94', incluido: 'Sí', prefijoWA: '591', decimales: 2 },
  { codigo: 'ECU', nombre: 'Ecuador',         moneda: 'USD', simbolo: '$',    impuesto: 'IVA', tasa: '15',   incluido: 'Sí', prefijoWA: '593', decimales: 2 },
  { codigo: 'COL', nombre: 'Colombia',        moneda: 'COP', simbolo: '$',    impuesto: 'IVA', tasa: '19',   incluido: 'Sí', prefijoWA: '57', decimales: 2 },
  { codigo: 'CHL', nombre: 'Chile',           moneda: 'CLP', simbolo: '$',    impuesto: 'IVA', tasa: '19',   incluido: 'Sí', prefijoWA: '56', decimales: 2 },
  { codigo: 'ARG', nombre: 'Argentina',       moneda: 'ARS', simbolo: '$',    impuesto: 'IVA', tasa: '21',   incluido: 'Sí', prefijoWA: '54', decimales: 2 },
  { codigo: 'PRY', nombre: 'Paraguay',        moneda: 'PYG', simbolo: '₲',    impuesto: 'IVA', tasa: '10',   incluido: 'Sí', prefijoWA: '595', decimales: 0 },
  { codigo: 'URY', nombre: 'Uruguay',         moneda: 'UYU', simbolo: '$U',   impuesto: 'IVA', tasa: '22',   incluido: 'Sí', prefijoWA: '598', decimales: 2 }
];

/** Devuelve los defaults derivados de un país (o null si no existe). */
function paisDefaults_(codigo) {
  var c = String(codigo || '').toUpperCase();
  for (var i = 0; i < CATALOGO_PAISES.length; i++) {
    if (CATALOGO_PAISES[i].codigo === c) {
      return {
        PAIS: CATALOGO_PAISES[i].codigo,
        MONEDA_CODIGO: CATALOGO_PAISES[i].moneda,
        MONEDA_SIMBOLO: CATALOGO_PAISES[i].simbolo,
        IMPUESTO_NOMBRE: CATALOGO_PAISES[i].impuesto,
        IGV_TASA: CATALOGO_PAISES[i].tasa,
        IGV_INCLUIDO: CATALOGO_PAISES[i].incluido,
        WHATSAPP_PREFIJO: CATALOGO_PAISES[i].prefijoWA
      };
    }
  }
  return null;
}

/** Catálogo de países para el selector de Ajustes. */
function paisesList_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  return appOk_({
    paises: CATALOGO_PAISES,
    actual: {
      pais: cfg.PAIS || 'PER',
      moneda: cfg.MONEDA_CODIGO, simbolo: cfg.MONEDA_SIMBOLO,
      impuesto: cfg.IMPUESTO_NOMBRE, tasa: cfg.IGV_TASA, incluido: cfg.IGV_INCLUIDO,
      prefijoWA: cfg.WHATSAPP_PREFIJO
    }
  });
}

/**
 * Acción "pais_aplicar": aplica los defaults derivados del país elegido.
 * Si "soloVacios" = Sí, no sobreescribe claves que el usuario ya editó.
 */
function paisAplicar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'config:write');
  var def = paisDefaults_(c.pais);
  if (!def) throw new ApiError_('País no soportado: ' + c.pais, 'VALIDATION');
  var claves = ['MONEDA_CODIGO', 'MONEDA_SIMBOLO', 'IMPUESTO_NOMBRE', 'IGV_TASA', 'IGV_INCLUIDO', 'WHATSAPP_PREFIJO'];
  var actuales = configLeer_();
  var aplicados = [];
  claves.forEach(function (k) {
    var yaPersonalizado = false;
    if (String(c.soloVacios) === 'Sí') {
      /* Respeta ediciones manuales: compara contra el default de OTRO país. */
      var propio = k === 'WHATSAPP_PREFIJO' ? def.WHATSAPP_PREFIJO : null;
      if (propio !== null && String(actuales[k]) !== '') yaPersonalizado = String(actuales[k]) !== String(CONFIG_CLAVES[k]) && k !== 'IGV_TASA' && k !== 'MONEDA_SIMBOLO';
    }
    if (!yaPersonalizado) {
      configGuardar_(k, def[k]);
      aplicados.push(k + '=' + def[k]);
    }
  });
  configGuardar_('PAIS', def.PAIS);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CONFIG', 'Cambió país a ' + def.PAIS + ' (' + aplicados.join(', ') + ')');
  return appOk_({ pais: def.PAIS, aplicados: aplicados });
}

/* ---------------------- Tipo de cambio (SUNAT / regional) ---------------------- */

/**
 * Consulta el tipo de cambio USD del día desde una API pública gratuita
 * (apis.net.pe, referencia SUNAT) y lo cachea en Config (TC_USD/TC_FECHA).
 * Si falla la red, conserva el último valor conocido o el manual.
 */
function tcActualizar_(cfg) {
  cfg = cfg || configLeer_();
  var hoy = fechaDiaStr_(fechaNow_());
  if (String(cfg.TC_FECHA) === hoy && numero_(cfg.TC_USD) > 0) {
    return { actualizado: false, valor: numero_(cfg.TC_USD), fecha: hoy, fuente: 'cache' };
  }
  try {
    var url = String(cfg.TC_API_URL || 'https://api.apis.net.pe/v1/tipo-cambio-sunat') + '?fecha=' + hoy;
    var resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: true });
    var json = JSON.parse(resp.getContentText());
    var venta = numero_(json.venta !== undefined ? json.venta : json.rate, 0);
    if (venta > 0) {
      configGuardar_('TC_USD', String(venta));
      configGuardar_('TC_FECHA', hoy);
      return { actualizado: true, valor: venta, fecha: hoy, fuente: 'api' };
    }
  } catch (err) {
    console.error('tcActualizar_ falló: ' + err);
  }
  return { actualizado: false, valor: numero_(cfg.TC_USD), fecha: String(cfg.TC_FECHA || ''), fuente: 'manual' };
}

function tcConsultar_(c) {
  requiereSesion_(c);
  return appOk_(tcActualizar_(configLeer_()));
}
