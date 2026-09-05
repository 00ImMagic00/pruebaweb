/**
 * ================================================================
 * NexoERP — 18_Compras.gs  (Adenda 1.6)
 * Órdenes de compra (OC), comparador de proveedores, recepción con
 * ingreso real al kardex y cuentas por pagar (CxP).
 * ================================================================
 * Flujo: BORRADOR → ENVIADA → (recepciones parciales → PARCIAL) →
 * RECIBIDA → CERRADA. Cada recepción genera ENTRADAS con costo real
 * (kardex valorizado). Si la condición es a CRÉDITO se crea una CxP;
 * al pagarla se registra el egreso como gasto "Pagos a proveedores".
 */

function serializarOc_(o, items) {
  return {
    id: o.id, numero: o.numero, proveedorId: o.proveedorId, proveedorNombre: o.proveedorNombre,
    fecha: fechaStr_(o.fecha), fechaEsperada: o.fechaEsperada ? fechaDiaStr_(o.fechaEsperada) : '',
    estado: o.estado, condicionPago: o.condicionPago || 'CONTADO', diasCredito: entero_(o.diasCredito),
    moneda: o.moneda || '', subtotal: numero_(o.subtotal), igv: numero_(o.igv), total: numero_(o.total),
    observaciones: o.observaciones || '', usuario: o.usuario, items: items || []
  };
}

function ocItemsDe_(ocId) {
  return dbLeer_(APP.SHEETS.OC_ITEMS).filter(function (i) { return String(i.ocId) === String(ocId); })
    .map(function (i) {
      return { id: i.id, productoId: i.productoId, sku: i.sku, descripcion: i.descripcion, unidad: i.unidad,
        cantidadPedida: numero_(i.cantidadPedida), cantidadRecibida: numero_(i.cantidadRecibida),
        costoUnit: numero_(i.costoUnit), subtotal: redondear_(numero_(i.cantidadPedida) * numero_(i.costoUnit)) };
    });
}

function ocCalcular_(items, cfg) {
  var bruto = 0;
  items.forEach(function (i) { bruto += numero_(i.cantidadPedida) * numero_(i.costoUnit); });
  var tasa = numero_(cfg.IGV_TASA, 18) / 100;
  var subtotal = redondear_(bruto);
  var igv = redondear_(subtotal * tasa);
  return { subtotal: subtotal, igv: igv, total: redondear_(subtotal + igv) };
}

function ocList_(c) {
  requiereSesion_(c);
  var estado = String(c.estado || '').toUpperCase();
  var filas = dbLeer_(APP.SHEETS.ORDENES).reverse().filter(function (o) {
    return !estado || String(o.estado).toUpperCase() === estado;
  }).slice(0, entero_(c.limit, 150) || 150);
  return appOk_(filas.map(function (o) { return serializarOc_(o, null); }));
}

function ocGet_(c) {
  requiereSesion_(c);
  var o = dbPorId_(APP.SHEETS.ORDENES, c.id);
  if (!o) throw new ApiError_('Orden de compra no encontrada.', 'NOT_FOUND');
  var res = serializarOc_(o, ocItemsDe_(o.id));
  res.ofertas = dbLeer_(APP.SHEETS.OC_OFERTAS).filter(function (f) { return String(f.ocId) === String(o.id); })
    .map(function (f) { return { id: f.id, proveedorNombre: f.proveedorNombre, costoTotal: numero_(f.costoTotal), plazoDias: entero_(f.plazoDias), comentario: f.comentario || '', elegida: boolStr_(f.elegida) }; });
  return appOk_(res);
}

function ocSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'compras:manage');
  var it = c.item || {};
  var items = it.items || [];
  if (!items.length) throw new ApiError_('Agregue al menos un producto a la orden.', 'VALIDATION');
  var prov = dbPorId_(APP.SHEETS.PROVEEDORES, it.proveedorId);
  if (!prov) throw new ApiError_('Seleccione un proveedor válido.', 'VALIDATION');
  var cfg = configLeer_();

  var limpios = [];
  items.forEach(function (i) {
    var prod = dbPorId_(APP.SHEETS.PRODUCTOS, i.productoId);
    if (!prod) throw new ApiError_('Producto no encontrado: ' + i.productoId, 'NOT_FOUND');
    var cant = numero_(i.cantidad, 0);
    if (cant <= 0) throw new ApiError_('Cantidad inválida para "' + prod.nombre + '".', 'VALIDATION');
    limpios.push({ productoId: prod.id, sku: prod.sku, descripcion: prod.nombre, unidad: prod.unidad,
      cantidadPedida: cant, cantidadRecibida: 0, costoUnit: numero_(i.costoUnit, 0) });
  });
  var tot = ocCalcular_(limpios, cfg);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (it.id) {
      var existente = dbPorId_(APP.SHEETS.ORDENES, it.id);
      if (!existente) throw new ApiError_('Orden no encontrada.', 'NOT_FOUND');
      if (['RECIBIDA', 'CERRADA', 'ANULADA'].indexOf(String(existente.estado).toUpperCase()) !== -1) {
        throw new ApiError_('La orden ya fue ' + existente.estado + ' y no se puede editar.', 'VALIDATION');
      }
      dbActualizar_(APP.SHEETS.ORDENES, it.id, {
        proveedorId: prov.id, proveedorNombre: prov.razonSocial, fechaEsperada: it.fechaEsperada ? new Date(it.fechaEsperada + 'T12:00:00') : '',
        condicionPago: String(it.condicionPago || 'CONTADO').toUpperCase(), diasCredito: entero_(it.diasCredito),
        subtotal: tot.subtotal, igv: tot.igv, total: tot.total, observaciones: String(it.observaciones || '')
      });
      /* Reemplaza items */
      var viejos = dbLeer_(APP.SHEETS.OC_ITEMS).filter(function (old) {
        return String(old.ocId) === String(it.id);
      });
      for (var k = viejos.length - 1; k >= 0; k--) {
        dbEliminarFila_(APP.SHEETS.OC_ITEMS, viejos[k]._fila);
      }
      limpios.forEach(function (l) { dbInsertar_(APP.SHEETS.OC_ITEMS, Object.assign({ id: dbSiguienteId_(APP.SHEETS.OC_ITEMS, 'OCI-', 6), ocId: it.id }, l)); });
      registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPRA', 'Editó OC ' + existente.numero);
      return appOk_({ id: it.id, actualizado: true, total: tot.total });
    }
    var cor = siguienteCorrelativo_('ORDEN_COMPRA');
    var id = dbSiguienteId_(APP.SHEETS.ORDENES, 'OC-', 5);
    var fila = {
      id: id, numero: cor.texto, proveedorId: prov.id, proveedorNombre: prov.razonSocial,
      fecha: fechaNow_(), fechaEsperada: it.fechaEsperada ? new Date(it.fechaEsperada + 'T12:00:00') : '',
      estado: 'BORRADOR', condicionPago: String(it.condicionPago || 'CONTADO').toUpperCase(), diasCredito: entero_(it.diasCredito),
      moneda: cfg.MONEDA_CODIGO || 'PEN', subtotal: tot.subtotal, igv: tot.igv, total: tot.total,
      observaciones: String(it.observaciones || ''), usuario: ses.usuario, creado: fechaNow_()
    };
    dbInsertar_(APP.SHEETS.ORDENES, fila);
    limpios.forEach(function (l) { dbInsertar_(APP.SHEETS.OC_ITEMS, Object.assign({ id: dbSiguienteId_(APP.SHEETS.OC_ITEMS, 'OCI-', 6), ocId: id }, l)); });
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPRA', 'Creó OC ' + fila.numero + ' → ' + prov.razonSocial + ' por ' + tot.total);
    return appOk_(serializarOc_(fila, limpios.map(function (l) { return Object.assign({ id: '' }, l); })));
  } finally {
    lock.releaseLock();
  }
}

function ocEstado_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'compras:manage');
  var estado = String(c.estado || '').toUpperCase();
  if (['BORRADOR', 'ENVIADA', 'CERRADA', 'ANULADA'].indexOf(estado) === -1) {
    throw new ApiError_('Estado no válido: use BORRADOR, ENVIADA, CERRADA o ANULADA.', 'VALIDATION');
  }
  var o = dbPorId_(APP.SHEETS.ORDENES, c.id);
  if (!o) throw new ApiError_('Orden no encontrada.', 'NOT_FOUND');
  if (estado === 'ENVIADA') {
    var items = ocItemsDe_(o.id);
    items.forEach(function (i) { if (numero_(i.costoUnit) <= 0) throw new ApiError_('La orden tiene productos sin costo unitario. Edítela antes de enviarla al proveedor.', 'VALIDATION'); });
  }
  dbActualizar_(APP.SHEETS.ORDENES, o.id, { estado: estado });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPRA', 'OC ' + o.numero + ' → ' + estado);
  return appOk_({ id: o.id, estado: estado });
}

/* -------------- Comparador de cotizaciones de proveedores -------------- */

function ocOfertaAgregar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'compras:manage');
  var o = dbPorId_(APP.SHEETS.ORDENES, c.ocId);
  if (!o) throw new ApiError_('Orden no encontrada.', 'NOT_FOUND');
  var id = dbSiguienteId_(APP.SHEETS.OC_OFERTAS, 'OFX-', 5);
  dbInsertar_(APP.SHEETS.OC_OFERTAS, {
    id: id, ocId: o.id, proveedorNombre: String(c.proveedorNombre || '').trim(),
    costoTotal: redondear_(numero_(c.costoTotal)), plazoDias: entero_(c.plazoDias),
    comentario: String(c.comentario || ''), elegida: 'No'
  });
  return appOk_({ id: id, creado: true });
}

/** Elige una oferta y (opcional) copia su costo total prorrateado a los items. */
function ocOfertaElegir_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'compras:manage');
  var ofertas = dbLeer_(APP.SHEETS.OC_OFERTAS).filter(function (f) { return String(f.ocId) === String(c.ocId); });
  var elegida = null;
  ofertas.forEach(function (f) {
    var es = String(f.id) === String(c.ofertaId);
    dbActualizar_(APP.SHEETS.OC_OFERTAS, f.id, { elegida: es ? 'Sí' : 'No' });
    if (es) elegida = f;
  });
  if (!elegida) throw new ApiError_('Oferta no encontrada.', 'NOT_FOUND');
  var o = dbPorId_(APP.SHEETS.ORDENES, c.ocId);
  if (o && boolStr_(c.ajustarCostos)) {
    var items = ocItemsDe_(o.id);
    var suma = 0;
    items.forEach(function (i) { suma += numero_(i.cantidadPedida); });
    if (suma > 0) {
      var costoPorUnidad = redondear_(numero_(elegida.costoTotal) / suma, 4);
      items.forEach(function (i) {
        dbActualizar_(APP.SHEETS.OC_ITEMS, i.id, { costoUnit: costoPorUnidad });
      });
      var cfg = configLeer_();
      var tot = ocCalcular_(items, cfg);
      dbActualizar_(APP.SHEETS.ORDENES, o.id, { subtotal: tot.subtotal, igv: tot.igv, total: tot.total, proveedorNombre: elegida.proveedorNombre });
    }
  }
  return appOk_({ elegida: elegida.proveedorNombre });
}

/* -------------- Recepción de mercadería -------------- */

/**
 * Registra la recepción (parcial o total) de una OC. Cada línea recibida
 * genera una ENTRADA real (kardex valorizado con costo de la OC) en el
 * almacén indicado. Permite lote y vencimiento si el producto lo exige.
 */
function ocRecepcionar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'compras:manage');
  var lineas = c.items || [];
  if (!lineas.length) throw new ApiError_('Indique las cantidades recibidas.', 'VALIDATION');
  var cfg = configLeer_();
  var almacenId = String(c.almacenId || cfg.ALMACEN_RECEPCION || 'ALM-0001');
  var almacen = dbPorId_(APP.SHEETS.ALMACENES, almacenId);
  if (!almacen) throw new ApiError_('Almacén de recepción no válido.', 'VALIDATION');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var o = dbPorId_(APP.SHEETS.ORDENES, c.ocId);
    if (!o) throw new ApiError_('Orden no encontrada.', 'NOT_FOUND');
    if (['CERRADA', 'ANULADA'].indexOf(String(o.estado).toUpperCase()) !== -1) {
      throw new ApiError_('La orden está ' + o.estado + '; no admite recepciones.', 'VALIDATION');
    }
    var items = ocItemsDe_(o.id);
    var recibioAlgo = false, aviso = [];
    lineas.forEach(function (l) {
      var item = null;
      items.forEach(function (i) { if (String(i.id) === String(l.itemId)) item = i; });
      if (!item) return;
      var cant = numero_(l.cantidad, 0);
      if (cant <= 0) return;
      var pendiente = item.cantidadPedida - item.cantidadRecibida;
      if (cant > pendiente + 0.0001) throw new ApiError_('La cantidad recibida de "' + item.descripcion + '" excede lo pendiente (' + pendiente + ').', 'VALIDATION');
      var prod = dbPorId_(APP.SHEETS.PRODUCTOS, item.productoId);
      if (!prod) return;
      var costoUnit = numero_(l.costoUnit, item.costoUnit) || item.costoUnit;
      var res = ejecutarMovimiento_({
        tipo: 'ENTRADA', productoId: prod.id, producto: prod, cantidad: cant,
        costoUnitario: costoUnit, lote: String(l.lote || ''), numeroSerie: String(l.numeroSerie || ''),
        fechaVencimiento: String(l.fechaVencimiento || ''),
        almacenOrigenId: '', almacenDestinoId: almacenId,
        documentoRef: o.numero, observaciones: 'Recepción OC ' + o.numero + ' (' + o.proveedorNombre + ')',
        motivo: '', requiereLote: boolStr_(prod.requiereLote), permitirNegativo: true
      }, ses);
      dbActualizar_(APP.SHEETS.OC_ITEMS, item.id, {
        cantidadRecibida: redondear_(item.cantidadRecibida + cant),
        costoUnit: costoUnit
      });
      item.cantidadRecibida = redondear_(item.cantidadRecibida + cant);
      recibioAlgo = true;
    });
    if (!recibioAlgo) throw new ApiError_('No se registró ninguna cantidad recibida.', 'VALIDATION');

    /* ¿Queda pendiente? */
    var pendienteTotal = 0;
    ocItemsDe_(o.id).forEach(function (i) { pendienteTotal += Math.max(0, i.cantidadPedida - i.cantidadRecibida); });
    var nuevoEstado = pendienteTotal <= 0.0001 ? 'RECIBIDA' : 'PARCIAL';
    dbActualizar_(APP.SHEETS.ORDENES, o.id, { estado: nuevoEstado });

    /* CxP al completar la recepción si es a crédito */
    if (nuevoEstado === 'RECIBIDA' && String(o.condicionPago) === 'CREDITO') {
      var existeCxP = dbLeer_(APP.SHEETS.CUENTAS_PAGAR).some(function (x) { return String(x.ocId) === String(o.id) && String(x.estado).toUpperCase() === 'PENDIENTE'; });
      if (!existeCxP) {
        var venc = new Date();
        venc.setDate(venc.getDate() + (entero_(o.diasCredito, 30) || 30));
        dbInsertar_(APP.SHEETS.CUENTAS_PAGAR, {
          id: dbSiguienteId_(APP.SHEETS.CUENTAS_PAGAR, 'CXP-', 5), ocId: o.id, numero: o.numero,
          proveedorId: o.proveedorId, proveedorNombre: o.proveedorNombre,
          fecha: fechaNow_(), fechaVenc: venc, monto: numero_(o.total), saldo: numero_(o.total),
          estado: 'PENDIENTE', pagadoAt: '', metodoPago: '', usuario: ses.usuario
        });
      }
    }
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPRA', 'Recepción OC ' + o.numero + ' → ' + nuevoEstado + ' en ' + almacen.nombre);
    return appOk_({ id: o.id, numero: o.numero, estado: nuevoEstado, aviso: aviso });
  } finally {
    lock.releaseLock();
  }
}

/* -------------- Cuentas por pagar -------------- */

function cxpList_(c) {
  requiereSesion_(c);
  var estado = String(c.estado || '').toUpperCase();
  return appOk_(dbLeer_(APP.SHEETS.CUENTAS_PAGAR).reverse().filter(function (x) {
    return !estado || String(x.estado).toUpperCase() === estado;
  }).map(function (x) {
    return { id: x.id, ocId: x.ocId, numero: x.numero, proveedorNombre: x.proveedorNombre,
      fecha: fechaStr_(x.fecha), fechaVenc: fechaDiaStr_(x.fechaVenc), monto: numero_(x.monto),
      saldo: numero_(x.saldo), estado: x.estado, diasVencido: Math.floor((Date.now() - new Date(fechaDiaStr_(x.fechaVenc) + 'T23:59:59').getTime()) / 86400000) };
  }));
}

/** Paga (total o parcial) una CxP y registra el egreso como gasto. */
function cxpPago_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'compras:manage');
  var monto = numero_(c.monto, 0);
  if (monto <= 0) throw new ApiError_('Monto inválido.', 'VALIDATION');
  var metodo = String(c.metodoPago || 'Efectivo');
  if (APP.METODOS_PAGO.indexOf(metodo) === -1) throw new ApiError_('Método de pago no válido.', 'VALIDATION');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cxp = dbPorId_(APP.SHEETS.CUENTAS_PAGAR, c.id);
    if (!cxp) throw new ApiError_('Cuenta por pagar no encontrada.', 'NOT_FOUND');
    if (String(cxp.estado).toUpperCase() !== 'PENDIENTE') throw new ApiError_('La cuenta ya está ' + cxp.estado + '.', 'VALIDATION');
    if (monto > numero_(cxp.saldo) + 0.009) throw new ApiError_('El pago excede el saldo (' + cxp.saldo + ').', 'VALIDATION');
    var nuevoSaldo = redondear_(numero_(cxp.saldo) - monto);
    dbActualizar_(APP.SHEETS.CUENTAS_PAGAR, cxp.id, {
      saldo: nuevoSaldo, estado: nuevoSaldo <= 0.009 ? 'PAGADA' : 'PENDIENTE',
      pagadoAt: nuevoSaldo <= 0.009 ? fechaNow_() : '', metodoPago: metodo
    });
    /* Egreso a la caja/flujo como gasto categorizado */
    dbInsertar_(APP.SHEETS.GASTOS, {
      id: dbSiguienteId_(APP.SHEETS.GASTOS, 'GAS-', 6), fecha: fechaNow_(),
      categoria: 'Pagos a proveedores', descripcion: 'Pago CxP ' + cxp.numero + ' — ' + cxp.proveedorNombre,
      monto: redondear_(monto), metodoPago: metodo, numeroDoc: cxp.numero, usuario: ses.usuario, estado: 'ACTIVO', creado: fechaNow_()
    });
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COMPRA', 'Pagó CxP ' + cxp.numero + ' ' + monto + ' (' + metodo + ')');
    return appOk_({ id: cxp.id, saldo: nuevoSaldo, estado: nuevoSaldo <= 0.009 ? 'PAGADA' : 'PENDIENTE' });
  } finally {
    lock.releaseLock();
  }
}

/** Sugerencias de compra: productos bajo el mínimo. */
function ocSugeridas_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  var prods = dbLeer_(APP.SHEETS.PRODUCTOS).filter(function (p) { return String(p.estado).toUpperCase() === 'ACTIVO'; });
  var stock = dbLeer_(APP.SHEETS.STOCK);
  var totalPorProd = {};
  stock.forEach(function (s) { totalPorProd[String(s.productoId)] = (totalPorProd[String(s.productoId)] || 0) + numero_(s.cantidad); });
  var sugeridas = [];
  prods.forEach(function (p) {
    var total = totalPorProd[String(p.id)] || 0;
    if (numero_(p.stockMin) > 0 && total <= numero_(p.stockMin)) {
      var objetivo = numero_(p.stockMax) > numero_(p.stockMin) ? numero_(p.stockMax) : numero_(p.stockMin) * 2;
      sugeridas.push({
        productoId: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad,
        stock: total, stockMin: numero_(p.stockMin), sugerido: redondear_(Math.max(1, objetivo - total), 2),
        costoStd: numero_(p.costoStd)
      });
    }
  });
  return appOk_(sugeridas);
}
