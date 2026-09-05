/**
 * ================================================================
 * NexoERP — 16_Comprobantes.gs  (Adenda 1.6)
 * Facturación electrónica SUNAT (Perú) + comprobantes internos.
 * ================================================================
 * Tres modos configurables en Ajustes → "Facturación SUNAT":
 *
 *   desactivado → solo boleta interna (BV-xxxx), como siempre.
 *   manual      → el sistema lleva serie/correlativo oficiales (B001/F001),
 *                 genera el JSON exacto que consume el API de facturación
 *                 (github.com/yorchavez9/Api-de-facturacion-electronica-
 *                 sunat-Peru) y registra el estado que el usuario carga
 *                 tras enviarlo (ACEPTADO/RECHAZADO + código CDR).
 *   api         → el backend envía SOLO al API externa (Laravel/Greenter):
 *                 login token, creación del documento, envío a SUNAT y
 *                 captura del CDR. Requiere desplegar ese API en un
 *                 hosting (compartido, Render, Railway, Docker...).
 *
 * Tipos de comprobante SUNAT: 01 Factura · 03 Boleta · 07 N. Crédito ·
 * 08 N. Débito. La Nota de Crédito con "devolución" re-ingresa stock y
 * (si corresponde) descuenta el saldo del fiado.
 */

var TIPOS_COMPROBANTE = {
  '01': { nombre: 'Factura',     serieCfg: 'SERIE_FACTURA', numeracion: 'FACTURA',       api: 'invoices' },
  '03': { nombre: 'Boleta',      serieCfg: 'SERIE_BOLETA',  numeracion: 'BOLETA',        api: 'boletas'  },
  '07': { nombre: 'Nota de Crédito', serieCfg: 'SERIE_NC', numeracion: 'NOTA_CREDITO',  api: ''         },
  '08': { nombre: 'Nota de Débito',  serieCfg: 'SERIE_ND', numeracion: 'NOTA_DEBITO',   api: ''         }
};

/* ==================== Serie / correlativo ==================== */

/** Garantiza que exista el correlativo del tipo (auto-migración). */
function asegurarNumeracion_(tipo, prefijo) {
  var filas = dbLeer_(APP.SHEETS.NUMERACION);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].tipo).toUpperCase() === tipo.toUpperCase()) return;
  }
  dbInsertar_(APP.SHEETS.NUMERACION, { tipo: tipo, prefijo: prefijo, correlativo: 0 });
}

/** Serie oficial de un tipo de comprobante según Config. */
function serieDeTipo_(cfg, tipo) {
  var def = TIPOS_COMPROBANTE[tipo];
  if (!def) throw new ApiError_('Tipo de comprobante no válido: ' + tipo, 'VALIDATION');
  return String(cfg[def.serieCfg] || '').trim() || def.numeracion.substring(0, 1) + '001';
}

/**
 * Decide el tipo de comprobante de una venta: cliente con RUC (11 dígitos)
 * → Factura (01); resto → Boleta (03). Configurable con COMPROBANTE_AUTO.
 */
function tipoComprobanteParaVenta_(cfg, cliente) {
  if (String(cfg.COMPROBANTE_AUTO || 'Sí') === 'No') return '03';
  var doc = String(cliente.docNumero || '').trim();
  var esRuc = cliente.docTipo === 'RUC' || (/^\d{11}$/.test(doc));
  return esRuc ? '01' : '03';
}

/* ==================== Payload para el API externa ==================== */

/** Unidad de medida SUNAT a partir de la unidad del producto. */
function unidadSunat_(unidad) {
  var u = String(unidad || '').toUpperCase();
  var map = { KG: 'KGM', KILO: 'KGM', KILOS: 'KGM', GRAMO: 'GRM', LT: 'LTR', LITRO: 'LTR', LITROS: 'LTR', ML: 'MLT', M: 'MTR', CAJA: 'BX', PACK: 'PK', BLISTER: 'BL' };
  return map[u] || 'NIU';
}

/**
 * Construye el payload EXACTO que espera el API de facturación
 * (StoreBoletaRequest / StoreInvoiceRequest). Los precios de NexoERP
 * traen el impuesto incluido (IGV_INCLUIDO = Sí), así que el valor
 * unitario gravado se obtiene dividiendo entre (1 + tasa).
 */
function comprobantePayload_(cfg, tipo, serie, correlativo, venta, detalle, empresa) {
  var tasa = numero_(cfg.IGV_TASA, 18) / 100;
  var incluido = boolStr_(cfg.IGV_INCLUIDO);
  var detalles = detalle.map(function (d) {
    var precioCon = numero_(d.precioUnit);
    var valorUnit = incluido ? redondear_(precioCon / (1 + tasa), 2) : redondear_(precioCon, 2);
    return {
      codigo: String(d.sku || ''),
      descripcion: String(d.descripcion || ''),
      unidad: unidadSunat_(d.unidadVenta || d.unidad),
      cantidad: numero_(d.cantidad),
      mto_valor_unitario: valorUnit,
      porcentaje_igv: numero_(cfg.IGV_TASA, 18),
      tip_afe_igv: '10',
      codigo_producto_sunat: ''
    };
  });
  var esRuc = String(venta.clienteDocTipo) === 'RUC' || /^\d{11}$/.test(String(venta.clienteDocNumero || ''));
  var tipoDocCliente = esRuc ? '6' : ( /^\d{8}$/.test(String(venta.clienteDocNumero || '')) ? '1' : '0' );
  return {
    company_id: entero_(cfg.SUNAT_COMPANY_ID, 1) || 1,
    branch_id: entero_(cfg.SUNAT_BRANCH_ID, 1) || 1,
    serie: serie,
    fecha_emision: String(venta.fecha).substring(0, 10),
    moneda: cfg.MONEDA_CODIGO || 'PEN',
    tipo_operacion: String(cfg.SUNAT_TIPO_OPERACION || '0101'),
    metodo_envio: String(cfg.SUNAT_METODO_ENVIO || 'resumen_diario'),
    forma_pago_tipo: String(venta.estadoPago) === 'CREDITO' ? 'Credito' : 'Contado',
    client: {
      tipo_documento: tipoDocCliente,
      numero_documento: String(venta.clienteDocNumero || ''),
      razon_social: String(venta.clienteNombre || ''),
      direccion: String(venta.clienteDireccion || ''),
      telefono: String(venta.clienteTelefono || ''),
      email: ''
    },
    detalles: detalles,
    usuario_creacion: String(venta.usuario || 'nexoerp')
  };
}

/* ==================== Cliente del API externa ==================== */

function sunatApiBase_(cfg) {
  var base = String(cfg.SUNAT_API_URL || '').trim().replace(/\/+$/, '');
  return base;
}

/** Login al API (Sanctum). Devuelve el token de acceso. */
function sunatApiLogin_(cfg) {
  var base = sunatApiBase_(cfg);
  if (!base) throw new ApiError_('SUNAT_API_URL no configurada (Ajustes → Facturación SUNAT).', 'VALIDATION');
  var resp = UrlFetchApp.fetch(base + '/api/auth/login', {
    method: 'post', muteHttpExceptions: true,
    contentType: 'application/json',
    payload: JSON.stringify({ email: String(cfg.SUNAT_API_USUARIO || ''), password: String(cfg.SUNAT_API_PASSWORD || '') })
  });
  var json = JSON.parse(resp.getContentText());
  var token = json && json.data && (json.data.token || json.data.access_token) || json.token || '';
  if (!token) throw new ApiError_('El API de facturación no devolvió token. Verifique usuario/contraseña del API.', 'SUNAT_API');
  return { base: base, token: token };
}

/** POST autenticado al API. Devuelve el JSON de respuesta. */
function sunatApiPost_(cfg, ruta, cuerpo) {
  var ses = sunatApiLogin_(cfg);
  var resp = UrlFetchApp.fetch(ses.base + ruta, {
    method: 'post', muteHttpExceptions: true,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ses.token },
    payload: JSON.stringify(cuerpo || {})
  });
  var texto = resp.getContentText();
  var json;
  try { json = JSON.parse(texto); }
  catch (e) { throw new ApiError_('Respuesta no válida del API de facturación (HTTP ' + resp.getResponseCode() + ').', 'SUNAT_API'); }
  if (resp.getResponseCode() >= 400 || json.ok === false) {
    var msg = (json && (json.message || (json.errors && JSON.stringify(json.errors)))) || ('HTTP ' + resp.getResponseCode());
    throw new ApiError_('El API de facturación rechazó la operación: ' + msg, 'SUNAT_API');
  }
  return json;
}

/**
 * Envía un comprobante ya creado al SUNAT por el API.
 * POST {base}/api/v1/{boletas|invoices}/{id}/send-sunat
 */
function comprobanteEnviarSunat_(cfg, comp) {
  var tipoDef = TIPOS_COMPROBANTE[comp.tipo] || TIPOS_COMPROBANTE['03'];
  if (!tipoDef.api) throw new ApiError_('Este tipo de comprobante se emite por el portal (modo interno).', 'VALIDATION');
  if (!comp.apiDocId) throw new ApiError_('El comprobante aún no fue creado en el API (falta apiDocId). Reenvíe primero el documento.', 'VALIDATION');
  var json = sunatApiPost_(cfg, '/api/v1/' + tipoDef.api + '/' + comp.apiDocId + '/send-sunat', {});
  var data = json.data || json;
  var cdr = data.cdr || data.respuesta || {};
  var codigo = String(cdr.codigo || cdr.codigoRespuesta || (data.success !== undefined ? (data.success ? '0' : '98') : ''));
  var desc = String(cdr.descripcion || cdr.motivoRespuesta || data.message || '');
  var estado = 'ENVIADO';
  if (codigo === '0') estado = 'ACEPTADO';
  else if (codigo !== '' && codigo !== '98' && codigo !== '99') estado = 'RECHAZADO';
  dbActualizar_(APP.SHEETS.COMPROBANTES, comp.id, {
    estado: estado, cdrCodigo: codigo, cdrDescripcion: desc,
    respuesta: JSON.stringify(json).substring(0, 900)
  });
  return { estado: estado, cdrCodigo: codigo, cdrDescripcion: desc };
}

/* ==================== Hook post-venta ==================== */

/**
 * Se invoca tras insertar la venta (dentro del lock). Si el país es PER
 * y SUNAT_MODO != 'desactivado', registra el comprobante oficial y —
 * en modo api — intenta crearlo y enviarlo al SUNAT en línea.
 */
function comprobanteRegistrarDespuesDeVenta_(ses, cfg, venta, detalle) {
  if (String(cfg.PAIS || 'PER') !== 'PER') return null;
  if (String(cfg.SUNAT_MODO || 'desactivado') === 'desactivado') return null;
  var tipo = tipoComprobanteParaVenta_(cfg, { docTipo: venta.clienteDocTipo, docNumero: venta.clienteDocNumero });
  var def = TIPOS_COMPROBANTE[tipo];
  asegurarNumeracion_(def.numeracion, 'B001');
  var cfg2 = configLeer_();
  var serie = serieDeTipo_(cfg2, tipo);
  var cor = siguienteCorrelativo_(def.numeracion);
  var numero = serie + '-' + rellenar_(cor.numero, 8);

  var fila = {
    id: dbSiguienteId_(APP.SHEETS.COMPROBANTES, 'CMP-', 6),
    ventaId: venta.id, tipo: tipo, serie: serie, correlativo: cor.numero, numero: numero,
    fecha: venta.fecha,
    clienteDocTipo: venta.clienteDocTipo, clienteDocNumero: venta.clienteDocNumero, clienteNombre: venta.clienteNombre,
    moneda: cfg2.MONEDA_CODIGO || 'PEN',
    subtotal: venta.subtotal, igv: venta.igv, total: venta.total,
    modoEnvio: String(cfg2.SUNAT_METODO_ENVIO || ''),
    estado: 'PENDIENTE', sunatId: '', cdrCodigo: '', cdrDescripcion: '',
    apiDocId: '', respuesta: '',
    payload: JSON.stringify(comprobantePayload_(cfg2, tipo, serie, cor.numero, venta, detalle)),
    observaciones: '', usuario: ses.usuario, creado: fechaNow_()
  };
  dbInsertar_(APP.SHEETS.COMPROBANTES, fila);

  if (String(cfg2.SUNAT_MODO) === 'api' && TIPOS_COMPROBANTE[tipo].api) {
    try {
      var json = sunatApiPost_(cfg2, '/api/v1/' + TIPOS_COMPROBANTE[tipo].api, JSON.parse(fila.payload));
      var data = json.data || json;
      dbActualizar_(APP.SHEETS.COMPROBANTES, fila.id, { apiDocId: String(data.id || '') });
      fila.apiDocId = String(data.id || '');
      var envio = comprobanteEnviarSunat_(cfg2, fila);
      fila.estado = envio.estado;
      return { numero: numero, estado: envio.estado, cdr: envio.cdrDescripcion, tipo: TIPOS_COMPROBANTE[tipo].nombre };
    } catch (err) {
      dbActualizar_(APP.SHEETS.COMPROBANTES, fila.id, { estado: 'ERROR', respuesta: String(err.message || err).substring(0, 900) });
      return { numero: numero, estado: 'ERROR', cdr: String(err.message || err), tipo: TIPOS_COMPROBANTE[tipo].nombre };
    }
  }
  return { numero: numero, estado: 'PENDIENTE', cdr: '', tipo: TIPOS_COMPROBANTE[tipo].nombre };
}

/* ==================== Listado y acciones ==================== */

function serializarComprobante_(f) {
  return {
    id: f.id, ventaId: f.ventaId, tipo: f.tipo, tipoNombre: (TIPOS_COMPROBANTE[f.tipo] || {}).nombre || f.tipo,
    serie: f.serie, correlativo: f.correlativo, numero: f.numero, fecha: fechaStr_(f.fecha),
    clienteDocTipo: f.clienteDocTipo, clienteDocNumero: f.clienteDocNumero, clienteNombre: f.clienteNombre,
    moneda: f.moneda, subtotal: numero_(f.subtotal), igv: numero_(f.igv), total: numero_(f.total),
    modoEnvio: f.modoEnvio, estado: f.estado, sunatId: f.sunatId || '',
    cdrCodigo: f.cdrCodigo || '', cdrDescripcion: f.cdrDescripcion || '', apiDocId: f.apiDocId || '',
    observaciones: f.observaciones || '', usuario: f.usuario,
    tienePayload: String(f.payload || '').length > 2
  };
}

function comprobantesList_(c) {
  requiereSesion_(c);
  var estado = String(c.estado || '').toUpperCase();
  var tipo = String(c.tipo || '');
  var q = String(c.q || '').toLowerCase();
  var filas = dbLeer_(APP.SHEETS.COMPROBANTES).reverse().filter(function (f) {
    if (estado && String(f.estado).toUpperCase() !== estado) return false;
    if (tipo && String(f.tipo) !== tipo) return false;
    if (q && (String(f.numero).toLowerCase().indexOf(q) === -1 && String(f.clienteNombre).toLowerCase().indexOf(q) === -1 && String(f.clienteDocNumero).indexOf(q) === -1)) return false;
    return true;
  }).slice(0, entero_(c.limit, 200) || 200);
  return appOk_(filas.map(serializarComprobante_));
}

/** JSON del payload para el modo manual (copiar al API/Postman). */
function comprobantesJson_(c) {
  requiereSesion_(c);
  var comp = dbPorId_(APP.SHEETS.COMPROBANTES, c.id);
  if (!comp) throw new ApiError_('Comprobante no encontrado: ' + c.id, 'NOT_FOUND');
  var payload = {};
  try { payload = JSON.parse(comp.payload || '{}'); } catch (e) {}
  return appOk_({ numero: comp.numero, payload: payload });
}

/** Crea el documento en el API externa (modo manual → luego enviar). */
function comprobantesCrearApi_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'comprobantes:manage');
  var cfg = configLeer_();
  var comp = dbPorId_(APP.SHEETS.COMPROBANTES, c.id);
  if (!comp) throw new ApiError_('Comprobante no encontrado.', 'NOT_FOUND');
  if (!TIPOS_COMPROBANTE[comp.tipo] || !TIPOS_COMPROBANTE[comp.tipo].api) throw new ApiError_('Las notas se emiten por el portal de modo interno.', 'VALIDATION');
  var json = sunatApiPost_(cfg, '/api/v1/' + TIPOS_COMPROBANTE[comp.tipo].api, JSON.parse(comp.payload || '{}'));
  var data = json.data || json;
  dbActualizar_(APP.SHEETS.COMPROBANTES, comp.id, { apiDocId: String(data.id || ''), estado: 'CREADO_API' });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPROBANTE', 'Creó en API ' + comp.numero);
  return appOk_({ apiDocId: String(data.id || '') });
}

/** Envía a SUNAT por el API. */
function comprobantesEnviar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'comprobantes:manage');
  var cfg = configLeer_();
  var comp = dbPorId_(APP.SHEETS.COMPROBANTES, c.id);
  if (!comp) throw new ApiError_('Comprobante no encontrado.', 'NOT_FOUND');
  var res = comprobanteEnviarSunat_(cfg, comp);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPROBANTE', 'Envió a SUNAT ' + comp.numero + ' → ' + res.estado);
  return appOk_(res);
}

/** Modo manual: el usuario carga el resultado del portal/API. */
function comprobantesActualizarEstado_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'comprobantes:manage');
  var estado = String(c.estado || '').toUpperCase();
  if (['ACEPTADO', 'RECHAZADO', 'ENVIADO', 'PENDIENTE'].indexOf(estado) === -1) {
    throw new ApiError_('Estado no válido. Use ACEPTADO, RECHAZADO, ENVIADO o PENDIENTE.', 'VALIDATION');
  }
  dbActualizar_(APP.SHEETS.COMPROBANTES, c.id, {
    estado: estado,
    cdrCodigo: String(c.cdrCodigo || ''),
    cdrDescripcion: String(c.cdrDescripcion || ''),
    observaciones: String(c.observaciones || '')
  });
  var comp = dbPorId_(APP.SHEETS.COMPROBANTES, c.id);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPROBANTE', 'Actualizó ' + comp.numero + ' → ' + estado);
  return appOk_(serializarComprobante_(comp));
}

/* ==================== Notas de crédito / débito ==================== */

/**
 * Emite una Nota de Crédito (07) o Débito (08) sobre una venta.
 *   - NC con devolverStock = Sí: re-ingresa el stock (movimiento
 *     DEVOLUCIÓN) y descuenta el saldo fiado si la venta era FIADO.
 *   - anularVenta = Sí: la venta queda ANULADA (motivo: nota).
 */
function comprobantesNotaCrear_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'comprobantes:manage');
  var tipo = String(c.tipo || '07');
  if (!TIPOS_COMPROBANTE[tipo] || TIPOS_COMPROBANTE[tipo].api) throw new ApiError_('Tipo de nota no válido (07 o 08).', 'VALIDATION');
  var venta = dbPorId_(APP.SHEETS.VENTAS, c.ventaId);
  if (!venta) throw new ApiError_('Venta no encontrada: ' + c.ventaId, 'NOT_FOUND');
  if (String(venta.estado).toUpperCase() !== 'EMITIDA') throw new ApiError_('Solo se puede emitir notas sobre ventas EMITIDAS.', 'VALIDATION');
  var detalle = dbLeer_(APP.SHEETS.VENTA_DETALLE).filter(function (d) { return String(d.ventaId) === String(venta.id); });
  if (!detalle.length) throw new ApiError_('La venta no tiene detalle.', 'VALIDATION');
  var motivo = String(c.motivo || '').trim() || 'ANULACIÓN DE LA OPERACIÓN';

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cfg = configLeer_();
    var def = TIPOS_COMPROBANTE[tipo];
    asegurarNumeracion_(def.numeracion, 'FC01');
    var serie = serieDeTipo_(configLeer_(), tipo);
    var cor = siguienteCorrelativo_(def.numeracion);
    var numero = serie + '-' + rellenar_(cor.numero, 8);
    var devolverStock = boolStr_(c.devolverStock) && tipo === '07';
    var anularVenta = boolStr_(c.anularVenta) && tipo === '07';

    var compId = dbSiguienteId_(APP.SHEETS.COMPROBANTES, 'CMP-', 6);
    dbInsertar_(APP.SHEETS.COMPROBANTES, {
      id: compId, ventaId: venta.id, tipo: tipo, serie: serie, correlativo: cor.numero, numero: numero,
      fecha: fechaNow_(),
      clienteDocTipo: venta.clienteDocTipo, clienteDocNumero: venta.clienteDocNumero, clienteNombre: venta.clienteNombre,
      moneda: cfg.MONEDA_CODIGO || 'PEN',
      subtotal: numero_(venta.subtotal), igv: numero_(venta.igv), total: numero_(venta.total),
      modoEnvio: 'individual', estado: 'ACEPTADO', sunatId: '', cdrCodigo: '', cdrDescripcion: '',
      apiDocId: '', respuesta: '', payload: '', observaciones: 'Ref: ' + venta.boleta + ' · ' + motivo,
      usuario: ses.usuario, creado: fechaNow_()
    });

    var avisos = [];
    if (devolverStock) {
      var permitirNegativo = false;
      detalle.forEach(function (d) {
        var prod = dbPorId_(APP.SHEETS.PRODUCTOS, d.productoId);
        if (!prod) return;
        try {
          ejecutarMovimiento_({
            tipo: 'DEVOLUCION', productoId: d.productoId, producto: prod,
            cantidad: numero_(d.cantidad), costoUnitario: numero_(d.costoUnit) || null,
            lote: '', numeroSerie: '', fechaVencimiento: '',
            almacenOrigenId: '', almacenDestinoId: String(venta.almacenId || cfg.ALMACEN_VENTA || ''),
            documentoRef: numero, observaciones: 'NC ' + numero + ' — ' + motivo, motivo: '', requiereLote: false,
            permitirNegativo: permitirNegativo
          }, ses);
        } catch (e) { avisos.push('No se pudo devolver "' + prod.nombre + '": ' + e.message); }
      });
      if (String(venta.estadoPago).toUpperCase() === 'FIADO' && venta.clienteId) {
        var cli = dbPorId_(APP.SHEETS.CLIENTES, venta.clienteId);
        if (cli) {
          var nuevoSaldo = Math.max(0, redondear_(numero_(cli.saldoFiado) - numero_(venta.total)));
          dbActualizar_(APP.SHEETS.CLIENTES, cli.id, { saldoFiado: nuevoSaldo });
        }
      }
    }
    if (anularVenta) {
      dbActualizar_(APP.SHEETS.VENTAS, venta.id, { estado: 'ANULADA', anuladoMotivo: 'NC ' + numero + ' — ' + motivo });
    }

    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPROBANTE',
      'Emitió ' + (TIPOS_COMPROBANTE[tipo].nombre) + ' ' + numero + ' sobre ' + venta.boleta + (devolverStock ? ' (devolución de stock)' : ''));
    return appOk_({ numero: numero, tipo: TIPOS_COMPROBANTE[tipo].nombre, devolvioStock: devolverStock, anuloVenta: anularVenta, avisos: avisos });
  } finally {
    lock.releaseLock();
  }
}

/* ==================== Guía de remisión ==================== */

/** Registra el número de guía de remisión de una venta (impreso al portería). */
function comprobantesGuia_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'comprobantes:manage');
  var venta = dbPorId_(APP.SHEETS.VENTAS, c.ventaId);
  if (!venta) throw new ApiError_('Venta no encontrada.', 'NOT_FOUND');
  var numero = String(c.numero || '').trim();
  dbActualizar_(APP.SHEETS.VENTAS, venta.id, { guiaRemision: numero });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPROBANTE', 'Guía de remisión ' + numero + ' → ' + venta.boleta);
  return appOk_({ ventaId: venta.id, guiaRemision: numero });
}

/* ==================== Libro de ventas ==================== */

/**
 * Libro de Ventas del mes. Formatos:
 *   'PLE'  → TXT separado por "|" (estructura Registro de Ventas 8.1 de
 *            SUNAT: periodo, cartera, fecha, tipo, serie, número, doc
 *            cliente, bases, exonerado, IGV, total...) — el contador
 *            puede importarlo o copiarlo al PLE.
 *   'CSV'  → genérico legible (todos los países).
 */
function comprobantesLibroVentas_(c) {
  requiereSesion_(c);
  var mes = String(c.mes || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ApiError_('Indique el mes en formato YYYY-MM.', 'VALIDATION');
  var cfg = configLeer_();
  var formato = String(c.formato || 'CSV').toUpperCase();

  var ventas = dbLeer_(APP.SHEETS.VENTAS).filter(function (v) {
    return String(v.fecha).substring(0, 7) === mes && String(v.estado).toUpperCase() === 'EMITIDA';
  });
  var comps = {};
  dbLeer_(APP.SHEETS.COMPROBANTES).forEach(function (f) {
    if (String(f.ventaId)) comps[String(f.ventaId)] = f;
  });

  if (formato === 'PLE') {
    var period = mes.replace('-', '') + '00';
    var lineas = [];
    ventas.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    ventas.forEach(function (v) {
      var comp = comps[String(v.id)];
      var tipo = comp ? comp.tipo : '03';
      var serie = comp ? comp.serie : String(cfg.SERIE_BOLETA || 'B001');
      var numero = comp ? comp.correlativo : String(v.boleta || '').replace(/\D/g, '') || '0';
      var docTipo = String(v.clienteDocTipo) === 'RUC' ? '6' : '1';
      var docNum = String(v.clienteDocNumero || '0');
      var nombre = String(v.clienteNombre || '').replace(/\|/g, ' ');
      var export_ = 0, base = numero_(v.subtotal), exonerado = 0, inafecto = 0, igv = numero_(v.igv), total = numero_(v.total);
      var tc = (cfg.MONEDA_CODIGO === 'PEN') ? '0.000' : String(numero_(cfg.TC_USD, 0) || '0.000');
      lineas.push([period, '0', '1', String(v.fecha).substring(0, 10).replace(/-/g, ''), tipo,
        serie, numero, docTipo, docNum, nombre, '', redondear_(export_).toFixed(2), redondear_(base).toFixed(2),
        redondear_(exonerado).toFixed(2), redondear_(inafecto).toFixed(2), '0.00', redondear_(igv).toFixed(2),
        '0.00', redondear_(total).toFixed(2), tc, '01', '', '', '', '0.00', '0.00', '1', '0'].join('|'));
    });
    return appOk_({ mes: mes, formato: 'PLE', filas: lineas.length, contenido: lineas.join('\n'), nombreArchivo: 'LE' + (cfg.RUC || '') + mes.replace('-', '') + '140100001111.txt' });
  }

  var filas = [['Fecha', 'Tipo', 'Número', 'Cliente', 'Documento', 'Base', cfg.IMPUESTO_NOMBRE || 'IGV', 'Total', 'Método de pago', 'Estado', 'Usuario']];
  ventas.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  ventas.forEach(function (v) {
    var comp = comps[String(v.id)];
    filas.push([String(v.fecha).substring(0, 10), comp ? (TIPOS_COMPROBANTE[comp.tipo] || {}).nombre || comp.tipo : 'Boleta',
      comp ? comp.numero : v.boleta, v.clienteNombre, v.clienteDocNumero, numero_(v.subtotal), numero_(v.igv),
      numero_(v.total), v.metodoPago, String(v.estadoPago || ''), v.usuario]);
  });
  return appOk_({ mes: mes, formato: 'CSV', filas: filas.length - 1, contenido: filas.map(function (f) { return f.join(','); }).join('\n') });
}

/* ==================== Resumen diario de boletas ==================== */

/**
 * Genera el Resumen Diario (RDD) de las boletas de un día vía el API.
 * Si el API desplegada no expone el endpoint, sugiere usar
 * SUNAT_METODO_ENVIO = 'individual' para envíos uno a uno.
 */
function comprobantesResumenDiario_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'comprobantes:manage');
  var dia = String(c.fecha || '').trim() || fechaDiaStr_(fechaNow_());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ApiError_('Fecha inválida (YYYY-MM-DD).', 'VALIDATION');
  var cfg = configLeer_();
  var pendientes = dbLeer_(APP.SHEETS.COMPROBANTES).filter(function (f) {
    return f.tipo === '03' && String(f.fecha).substring(0, 10) === dia && ['PENDIENTE', 'CREADO_API'].indexOf(String(f.estado).toUpperCase()) !== -1;
  });
  if (!pendientes.length) throw new ApiError_('No hay boletas pendientes de envío para el ' + dia + '.', 'VALIDATION');
  var ids = [];
  pendientes.forEach(function (f) { if (f.apiDocId) ids.push(f.apiDocId); });
  var json = sunatApiPost_(cfg, '/api/v1/boletas/resumen-diario', { fecha: dia, company_id: entero_(cfg.SUNAT_COMPANY_ID, 1) || 1, branch_id: entero_(cfg.SUNAT_BRANCH_ID, 1) || 1, boleta_ids: ids });
  dbActualizar_(APP.SHEETS.COMPROBANTES, pendientes[0].id, { observaciones: 'RDD ' + dia });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPROBANTE', 'Generó resumen diario de ' + pendientes.length + ' boletas del ' + dia);
  return appOk_({ fecha: dia, boletas: pendientes.length, respuesta: json.data || json });
}

/** Utilidad del router: lista series disponibles para Ajustes. */
function comprobantesSeries_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  var out = [];
  Object.keys(TIPOS_COMPROBANTE).forEach(function (t) {
    out.push({ tipo: t, nombre: TIPOS_COMPROBANTE[t].nombre, serie: serieDeTipo_(cfg, t) });
  });
  return appOk_(out);
}
