/**
 * ================================================================
 * NexoERP — 13_Cotizaciones.gs  (ADENDA 1.3: proformas convertibles)
 * Cotizaciones / proformas con vigencia y conversión a venta real
 * en un clic (descuenta stock, emite boleta correlativa).
 * ================================================================
 * Flujo:
 *   cotizaciones_registrar  → COT-0001 con ítems y precios congelados.
 *   cotizaciones_list/get   → consulta y detalle (sin afectar stock).
 *   cotizaciones_convertir  → reutiliza registrarVentaCore_ (mismo motor
 *     del POS: valida stock, política de precios, FIADO, correlativos)
 *     y marca la cotización como CONVERTIDA con la boleta generada.
 *   cotizaciones_anular     → invalida la proforma sin tocar stock.
 * Estados: VIGENTE | CONVERTIDA | ANULADA (VENCIDA se calcula en el UI
 * comparando validezHasta con la fecha del día).
 */

var ESTADOS_COTIZACION = ['VIGENTE', 'CONVERTIDA', 'ANULADA'];

/* ---------------------- Registrar cotización ---------------------- */

function cotizacionesRegistrar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'cotizaciones:manage');

  var items = c.items || [];
  if (!items.length) throw new ApiError_('Agregue al menos un producto a la cotización.', 'VALIDATION');
  var validezDias = entero_(c.validezDias, 15);
  if (validezDias <= 0 || validezDias > 365) validezDias = 15;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cfg = configLeer_();

    /* Cliente (puede ser Público General). */
    var cliente = clienteDeVenta_(c.clienteId, c.clienteNombre);

    /* Ítems: valida productos y congela precios. NO valida stock —
     * la disponibilidad se evalúa al momento de convertir. */
    var lineas = [];
    var bruto = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var prod = dbPorId_(APP.SHEETS.PRODUCTOS, it.productoId);
      if (!prod) throw new ApiError_('Producto no encontrado: ' + it.productoId, 'NOT_FOUND');
      if (String(prod.estado).toUpperCase() !== 'ACTIVO') throw new ApiError_('El producto "' + prod.nombre + '" está inactivo.', 'VALIDATION');
      var cant = numero_(it.cantidad, 0);
      if (cant <= 0) throw new ApiError_('Cantidad inválida para "' + prod.nombre + '".', 'VALIDATION');
      var esRegalo = boolStr_(it.esRegalo);
      var precio = esRegalo ? 0 : ((it.precio === '' || it.precio === undefined || it.precio === null) ? numero_(prod.precioVenta) : numero_(it.precio));
      if (precio < 0) throw new ApiError_('Precio inválido para "' + prod.nombre + '".', 'VALIDATION');
      var importe = redondear_(cant * precio);
      bruto += importe;
      lineas.push({
        productoId: prod.id, sku: prod.sku, descripcion: prod.nombre,
        cantidad: cant, precioUnit: precio, esRegalo: esRegalo ? 'Sí' : 'No', subtotal: importe
      });
    }

    var totales = calcularTotalesVenta_(cfg, bruto);
    var corC = siguienteCorrelativo_('COTIZACION');
    var fecha = fechaNow_();
    var validez = new Date(fecha.getTime() + validezDias * 86400000);

    var cot = {
      id: 'CT-' + corC.texto,
      numero: corC.texto,
      fecha: fecha,
      clienteId: cliente.id, clienteDocTipo: cliente.docTipo, clienteDocNumero: cliente.docNumero,
      clienteNombre: cliente.nombre, clienteTelefono: cliente.telefono,
      subtotal: totales.subtotal, igv: totales.igv, total: totales.total,
      validezHasta: validez, validezDias: validezDias,
      estado: 'VIGENTE', usuario: ses.usuario, convertidoA: '',
      nota: String(c.nota || '')
    };
    dbInsertar_(APP.SHEETS.COTIZACIONES, cot);
    lineas.forEach(function (l) {
      l.id = dbSiguienteId_(APP.SHEETS.COTIZACION_DETALLE, 'CD-', 6);
      l.cotizacionId = cot.id;
      dbInsertar_(APP.SHEETS.COTIZACION_DETALLE, l);
    });

    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COTIZACION',
      'Creó ' + cot.numero + ' por ' + cfg.MONEDA_SIMBOLO + ' ' + totales.total + ' — ' + cliente.nombre + ' (validez ' + validezDias + ' días)');

    return appOk_({ cotizacion: serializarCotizacion_(cot), detalle: lineas });
  } finally {
    lock.releaseLock();
  }
}

function serializarCotizacion_(v) {
  var validez = v.validezHasta ? fechaDiaStr_(v.validezHasta) : '';
  var hoy = fechaDiaStr_(fechaNow_());
  return {
    id: v.id, numero: v.numero, fecha: fechaStr_(v.fecha),
    clienteId: v.clienteId, clienteDocTipo: v.clienteDocTipo, clienteDocNumero: v.clienteDocNumero,
    clienteNombre: v.clienteNombre, clienteTelefono: String(v.clienteTelefono || ''),
    subtotal: numero_(v.subtotal), igv: numero_(v.igv), total: numero_(v.total),
    validezHasta: validez, validezDias: entero_(v.validezDias, 15),
    estado: String(v.estado || 'VIGENTE').toUpperCase(),
    vencida: !!validez && validez < hoy,
    usuario: v.usuario, convertidoA: v.convertidoA || '', nota: v.nota || ''
  };
}

/* ---------------------- Consultas ---------------------- */

function cotizacionesList_(c) {
  requiereSesion_(c);
  var estado = String(c.estado || '').toUpperCase();
  var q = String(c.q || '').toLowerCase();
  var limite = entero_(c.limit, 200) || 200;

  return appOk_(dbLeer_(APP.SHEETS.COTIZACIONES)
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); })
    .map(serializarCotizacion_)
    .filter(function (v) {
      if (estado && v.estado !== estado) return false;
      if (q && (v.numero + ' ' + v.clienteNombre).toLowerCase().indexOf(q) === -1) return false;
      return true;
    })
    .slice(0, limite));
}

function cotizacionesGet_(c) {
  requiereSesion_(c);
  var cot = dbPorId_(APP.SHEETS.COTIZACIONES, c.id);
  if (!cot) throw new ApiError_('Cotización no encontrada: ' + c.id, 'NOT_FOUND');
  var detalle = dbLeer_(APP.SHEETS.COTIZACION_DETALLE)
    .filter(function (d) { return String(d.cotizacionId) === String(cot.id); })
    .map(function (d) {
      return {
        id: d.id, cotizacionId: d.cotizacionId, productoId: d.productoId, sku: d.sku,
        descripcion: d.descripcion, cantidad: numero_(d.cantidad),
        precioUnit: numero_(d.precioUnit), esRegalo: String(d.esRegalo || 'No'), subtotal: numero_(d.subtotal)
      };
    });
  var cfg = configLeer_();
  return appOk_({ cotizacion: serializarCotizacion_(cot), detalle: detalle, empresa: empresaSnapshot_(cfg) });
}

/* ---------------------- Convertir a venta ---------------------- */

/**
 * Convierte una cotización VIGENTE (o vencida) en una venta real usando
 * el MISMO motor del POS: descuenta stock, emite boleta correlativa y
 * respeta la política de descuentos/fiado. Los precios quedan congelados
 * con los valores de la proforma.
 */
function cotizacionesConvertir_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'cotizaciones:manage');

  var cot = dbPorId_(APP.SHEETS.COTIZACIONES, c.id);
  if (!cot) throw new ApiError_('Cotización no encontrada: ' + c.id, 'NOT_FOUND');
  var estado = String(cot.estado || 'VIGENTE').toUpperCase();
  if (estado === 'CONVERTIDA') throw new ApiError_('La cotización ' + cot.numero + ' ya fue convertida en la boleta ' + cot.convertidoA + '.', 'VALIDATION');
  if (estado === 'ANULADA') throw new ApiError_('La cotización ' + cot.numero + ' está anulada.', 'VALIDATION');

  var detalle = dbLeer_(APP.SHEETS.COTIZACION_DETALLE)
    .filter(function (d) { return String(d.cotizacionId) === String(cot.id); });
  if (!detalle.length) throw new ApiError_('La cotización no tiene ítems.', 'VALIDATION');

  var items = detalle.map(function (d) {
    return { productoId: d.productoId, cantidad: numero_(d.cantidad), precio: numero_(d.precioUnit), esRegalo: String(d.esRegalo || 'No') };
  });

  var res = registrarVentaCore_(ses, {
    items: items,
    clienteId: cot.clienteId,
    metodoPago: String(c.metodoPago || 'Efectivo'),
    montoRecibido: c.montoRecibido,
    autorizacion: c.autorizacion,
    esCotizacion: true,
    cotizacionNumero: cot.numero
  });
  if (!res || !res.ok) return res;

  dbActualizar_(APP.SHEETS.COTIZACIONES, cot.id, { estado: 'CONVERTIDA', convertidoA: res.data.venta.id });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COTIZACION',
    'Convirtió ' + cot.numero + ' en la boleta ' + res.data.venta.boleta + ' (' + res.data.venta.metodoPago + ')');

  var cotActualizada = dbPorId_(APP.SHEETS.COTIZACIONES, cot.id);
  return appOk_({
    venta: res.data.venta,
    detalle: res.data.detalle,
    empresa: res.data.empresa,
    cotizacion: serializarCotizacion_(cotActualizada)
  });
}

/* ---------------------- Anular ---------------------- */

function cotizacionesAnular_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'cotizaciones:manage');
  var cot = dbPorId_(APP.SHEETS.COTIZACIONES, c.id);
  if (!cot) throw new ApiError_('Cotización no encontrada: ' + c.id, 'NOT_FOUND');
  if (String(cot.estado).toUpperCase() === 'CONVERTIDA') throw new ApiError_('No se puede anular: la cotización ya fue convertida en la boleta ' + cot.convertidoA + '.', 'VALIDATION');
  if (String(cot.estado).toUpperCase() === 'ANULADA') throw new ApiError_('La cotización ya está anulada.', 'VALIDATION');

  var motivo = String(c.motivo || '').trim();
  dbActualizar_(APP.SHEETS.COTIZACIONES, cot.id, { estado: 'ANULADA', nota: String(cot.nota || '') + (motivo ? (cot.nota ? ' · ' : '') + 'Anulada: ' + motivo : '') });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COTIZACION', 'Anuló ' + cot.numero + (motivo ? '. Motivo: ' + motivo : ''));
  return appOk_({ id: cot.id, numero: cot.numero, estado: 'ANULADA' });
}
