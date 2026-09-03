/**
 * ================================================================
 * NexoERP — 05_Movimientos.gs
 * Motor de movimientos: entradas, salidas, transferencias,
 * devoluciones y ajustes. Actualiza Stock, Lotes, Movimientos y
 * Kardex físico-valorizado (Promedio Ponderado) de forma atómica
 * mediante LockService para evitar condiciones de carrera.
 * ================================================================
 */

function movimientosRegistrar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'movimientos:registrar');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var datos = validarMovimiento_(c);
    var res = ejecutarMovimiento_(datos, ses);
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'MOVIMIENTO',
      datos.tipo + ' ' + res.id + ' — ' + datos.productoId + ' x ' + datos.cantidad);
    return appOk_(res);
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------- VALIDACIÓN ------------------------- */

function validarMovimiento_(c) {
  var tipo = String(c.tipo || '').trim().toUpperCase();
  if (APP.TIPOS_MOVIMIENTO.indexOf(tipo) === -1) {
    throw new ApiError_('Tipo de movimiento no válido: ' + tipo, 'VALIDATION');
  }
  var d = {
    tipo: tipo,
    fechaOverride: c.fechaOverride ? new Date(c.fechaOverride) : null,
    productoId: String(c.productoId || ''),
    cantidad: numero_(c.cantidad, 0),
    costoUnitario: (c.costoUnitario === '' || c.costoUnitario === undefined || c.costoUnitario === null) ? null : numero_(c.costoUnitario),
    lote: String(c.lote || '').trim(),
    numeroSerie: String(c.numeroSerie || '').trim(),
    fechaVencimiento: c.fechaVencimiento || '',
    almacenOrigenId: String(c.almacenOrigenId || ''),
    almacenDestinoId: String(c.almacenDestinoId || ''),
    documentoRef: String(c.documentoRef || '').trim(),
    observaciones: String(c.observaciones || '').trim(),
    motivo: String(c.motivo || '').trim()
  };

  if (d.cantidad <= 0) throw new ApiError_('La cantidad debe ser mayor que cero.', 'VALIDATION');

  var prod = dbPorId_(APP.SHEETS.PRODUCTOS, d.productoId);
  if (!prod) throw new ApiError_('Producto no encontrado: ' + d.productoId, 'NOT_FOUND');
  if (String(prod.estado).toUpperCase() !== 'ACTIVO') throw new ApiError_('El producto está inactivo.', 'VALIDATION');
  d.producto = prod;

  // Semántica de almacenes según tipo:
  //   ENTRADA / DEVOLUCION / AJUSTE_POSITIVO  -> requiere almacenDestinoId
  //   SALIDA / AJUSTE_NEGATIVO                -> requiere almacenOrigenId
  //   TRANSFERENCIA                           -> requiere ambos (distintos)
  var esEntrada = (tipo === 'ENTRADA' || tipo === 'DEVOLUCION' || tipo === 'AJUSTE_POSITIVO');
  var esSalida  = (tipo === 'SALIDA' || tipo === 'AJUSTE_NEGATIVO');
  var esTransf  = (tipo === 'TRANSFERENCIA');

  if (esEntrada && !d.almacenDestinoId) throw new ApiError_('Seleccione el almacén de destino.', 'VALIDATION');
  if (esSalida && !d.almacenOrigenId) throw new ApiError_('Seleccione el almacén de origen.', 'VALIDATION');
  if (esTransf) {
    if (!d.almacenOrigenId || !d.almacenDestinoId) throw new ApiError_('La transferencia requiere almacén de origen y destino.', 'VALIDATION');
    if (d.almacenOrigenId === d.almacenDestinoId) throw new ApiError_('El almacén de origen y destino deben ser distintos.', 'VALIDATION');
  }

  var verificarAlmacen = function (id, etiqueta) {
    var a = dbPorId_(APP.SHEETS.ALMACENES, id);
    if (!a) throw new ApiError_(etiqueta + ' no encontrado: ' + id, 'NOT_FOUND');
    if (String(a.estado).toUpperCase() !== 'ACTIVO') throw new ApiError_(etiqueta + ' está inactivo.', 'VALIDATION');
  };
  if (d.almacenOrigenId) verificarAlmacen(d.almacenOrigenId, 'El almacén de origen');
  if (d.almacenDestinoId) verificarAlmacen(d.almacenDestinoId, 'El almacén de destino');

  if (esSalida && tipo === 'AJUSTE_NEGATIVO' && !d.motivo) {
    throw new ApiError_('Los ajustes requieren un motivo (merma, conteo físico, etc.).', 'VALIDATION');
  }

  // Reglas de lote / serie según configuración del producto.
  d.requiereLote = boolStr_(prod.requiereLote);
  d.requiereSerie = boolStr_(prod.requiereSerie);
  if (d.requiereLote && esEntrada && !d.lote) {
    throw new ApiError_('El producto "' + prod.nombre + '" exige número de lote en las entradas.', 'VALIDATION');
  }
  if (d.requiereSerie && esEntrada && !d.numeroSerie) {
    throw new ApiError_('El producto "' + prod.nombre + '" exige número de serie en las entradas.', 'VALIDATION');
  }

  // Stock suficiente en salidas (si la configuración no lo permite negativo).
  var cfg = configLeer_();
  d.permitirNegativo = String(cfg.PERMITIR_STOCK_NEGATIVO).toUpperCase() === 'SI' || String(cfg.PERMITIR_STOCK_NEGATIVO).toUpperCase() === 'YES';
  if ((esSalida || esTransf) && !d.permitirNegativo) {
    var disponible = stockCantidad_(d.productoId, d.almacenOrigenId);
    if (d.cantidad > disponible) {
      throw new ApiError_('Stock insuficiente en el almacén de origen. Disponible: ' + disponible + ' ' + prod.unidad + '.', 'VALIDATION');
    }
  }

  // Cobertura de lote en salidas cuando el producto maneja lotes.
  if (d.requiereLote && (esSalida || esTransf)) {
    var disponibleLote = d.lote
      ? loteCantidad_(d.productoId, d.almacenOrigenId, d.lote)
      : stockCantidad_(d.productoId, d.almacenOrigenId); // FEFO consumirá varios lotes
    if (d.cantidad > disponibleLote && !d.permitirNegativo) {
      throw new ApiError_('Stock insuficiente' + (d.lote ? ' en el lote ' + d.lote : '') + '. Disponible: ' + disponibleLote + '.', 'VALIDATION');
    }
  }
  return d;
}

/* ------------------------- EJECUCIÓN ------------------------- */

/**
 * Núcleo transaccional. También lo usa la semilla de datos (setupSystem)
 * pasando una sesión sintética. Devuelve el movimiento registrado.
 */
function ejecutarMovimiento_(d, ses) {
  var id = dbSiguienteId_(APP.SHEETS.MOVIMIENTOS, 'MOV-', 6);
  var fecha = d.fechaOverride || fechaNow_();
  var esEntradaTipo = (d.tipo === 'ENTRADA' || d.tipo === 'DEVOLUCION' || d.tipo === 'AJUSTE_POSITIVO');
  var esSalidaTipo  = (d.tipo === 'SALIDA' || d.tipo === 'AJUSTE_NEGATIVO');
  var esTransf      = (d.tipo === 'TRANSFERENCIA');

  if (!d.producto && d.productoId) {
    d.producto = dbPorId_(APP.SHEETS.PRODUCTOS, d.productoId);
  }
  if (!d.producto) {
    throw new ApiError_('Producto no encontrado para el movimiento: ' + d.productoId, 'NOT_FOUND');
  }
  if (d.requiereLote === undefined) {
    d.requiereLote = boolStr_(d.producto.requiereLote);
  }
  if (d.requiereSerie === undefined) {
    d.requiereSerie = boolStr_(d.producto.requiereSerie);
  }
  if (d.permitirNegativo === undefined) {
    d.permitirNegativo = true;
  }

  var costoStd = numero_(d.producto.costoStd);
  var loteConsumos = [];

  /* --- 1) Salida de origen (SALIDA, AJUSTE_NEGATIVO o tramo origen de TRANSFERENCIA) --- */
  var costoSalida = null;
  if (esSalidaTipo || esTransf) {
    var saldoOr = kardexSaldo_(d.productoId, d.almacenOrigenId);
    costoSalida = saldoOr.costoPromedio > 0 ? saldoOr.costoPromedio : costoStd;

    if (d.requiereLote) {
      loteConsumos = d.lote
        ? [{ lote: d.lote, cantidad: d.cantidad }]
        : consumirLotesFEFO_(d.productoId, d.almacenOrigenId, d.cantidad);
    }
    restarStock_(d.productoId, d.almacenOrigenId, d.cantidad);

    kardexInsertar_({
      fecha: fecha, productoId: d.productoId, almacenId: d.almacenOrigenId, movimientoId: id,
      tipo: d.tipo, salidaCantidad: d.cantidad, salidaValor: d.cantidad * costoSalida,
      documentoRef: d.documentoRef, usuario: ses.usuario
    });
  }

  /* --- 2) Entrada a destino (ENTRADA, DEVOLUCION, AJUSTE_POSITIVO o tramo destino de TRANSFERENCIA) --- */
  var costoEntrada = d.costoUnitario;
  if (esEntradaTipo) {
    if (costoEntrada === null || costoEntrada === undefined) costoEntrada = costoStd;
    if (d.requiereLote) {
      upsertLote_(d.productoId, d.almacenDestinoId, d.lote, d.numeroSerie, d.fechaVencimiento, d.cantidad);
    }
    sumarStock_(d.productoId, d.almacenDestinoId, d.cantidad);

    kardexInsertar_({
      fecha: fecha, productoId: d.productoId, almacenId: d.almacenDestinoId, movimientoId: id,
      tipo: d.tipo, entradaCantidad: d.cantidad, entradaValor: d.cantidad * costoEntrada,
      documentoRef: d.documentoRef, usuario: ses.usuario
    });
  }
  if (esTransf) {
    // La entrada en destino se valora al costo promedio de salida (traspaso de valor).
    costoEntrada = costoSalida;
    if (d.requiereLote && loteConsumos.length) {
      loteConsumos.forEach(function (lc) {
        var venc = loteFechaVenc_(d.productoId, d.almacenOrigenId, lc.lote);
        upsertLote_(d.productoId, d.almacenDestinoId, lc.lote, '', venc, lc.cantidad);
      });
    }
    sumarStock_(d.productoId, d.almacenDestinoId, d.cantidad);
    kardexInsertar_({
      fecha: fecha, productoId: d.productoId, almacenId: d.almacenDestinoId, movimientoId: id,
      tipo: 'TRANSFERENCIA', entradaCantidad: d.cantidad, entradaValor: d.cantidad * costoSalida,
      documentoRef: d.documentoRef, usuario: ses.usuario
    });
  }

  /* --- 3) Registro del movimiento --- */
  var mov = {
    id: id, fecha: fecha, tipo: d.tipo, productoId: d.productoId,
    almacenOrigenId: d.almacenOrigenId, almacenDestinoId: d.almacenDestinoId,
    cantidad: d.cantidad,
    costoUnitario: redondear4_(esEntradaTipo ? costoEntrada : costoSalida),
    lote: d.lote || (loteConsumos.length ? loteConsumos.map(function (l) { return l.lote; }).join(' + ') : ''),
    numeroSerie: d.numeroSerie,
    fechaVencimiento: d.fechaVencimiento ? new Date(d.fechaVencimiento) : '',
    documentoRef: d.documentoRef, motivo: d.motivo, observaciones: d.observaciones,
    usuario: ses.usuario, estado: 'ACTIVO', anuladoMotivo: ''
  };
  dbInsertar_(APP.SHEETS.MOVIMIENTOS, mov);

  return {
    id: id, fecha: fechaStr_(fecha), tipo: d.tipo, productoId: d.productoId,
    productoNombre: d.producto.nombre, cantidad: d.cantidad,
    costoUnitario: redondear_(mov.costoUnitario),
    almacenOrigenId: d.almacenOrigenId, almacenDestinoId: d.almacenDestinoId,
    lotesConsumidos: loteConsumos
  };
}

/* ------------------------- STOCK ------------------------- */

function stockCantidad_(productoId, almacenId) {
  var filas = dbLeer_(APP.SHEETS.STOCK);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].productoId) === String(productoId) && String(filas[i].almacenId) === String(almacenId)) {
      return numero_(filas[i].cantidad);
    }
  }
  return 0;
}

function sumarStock_(productoId, almacenId, cantidad) { moverStock_(productoId, almacenId, cantidad); }
function restarStock_(productoId, almacenId, cantidad) { moverStock_(productoId, almacenId, -cantidad); }

function moverStock_(productoId, almacenId, delta) {
  var hoja = dbHoja_(APP.SHEETS.STOCK);
  var filas = dbLeer_(APP.SHEETS.STOCK);
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (String(f.productoId) === String(productoId) && String(f.almacenId) === String(almacenId)) {
      var nuevo = numero_(f.cantidad) + delta;
      hoja.getRange(f._fila, 3).setValue(redondear_(nuevo, 4));
      return nuevo;
    }
  }
  dbInsertar_(APP.SHEETS.STOCK, { productoId: productoId, almacenId: almacenId, cantidad: redondear_(delta, 4) });
  return delta;
}

/* ------------------------- LOTES ------------------------- */

function loteCantidad_(productoId, almacenId, lote) {
  var filas = dbLeer_(APP.SHEETS.LOTES);
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (String(f.productoId) === String(productoId) && String(f.almacenId) === String(almacenId) && String(f.lote) === String(lote)) {
      return numero_(f.cantidad);
    }
  }
  return 0;
}

function loteFechaVenc_(productoId, almacenId, lote) {
  var filas = dbLeer_(APP.SHEETS.LOTES);
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (String(f.productoId) === String(productoId) && String(f.almacenId) === String(almacenId) && String(f.lote) === String(lote)) {
      return f.fechaVencimiento || '';
    }
  }
  return '';
}

function upsertLote_(productoId, almacenId, lote, numeroSerie, fechaVencimiento, cantidad) {
  var filas = dbLeer_(APP.SHEETS.LOTES);
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (String(f.productoId) === String(productoId) && String(f.almacenId) === String(almacenId) && String(f.lote) === String(lote)) {
      dbHoja_(APP.SHEETS.LOTES).getRange(f._fila, 7).setValue(redondear_(numero_(f.cantidad) + cantidad, 4));
      if (numeroSerie) dbHoja_(APP.SHEETS.LOTES).getRange(f._fila, 5).setValue(numeroSerie);
      return;
    }
  }
  dbInsertar_(APP.SHEETS.LOTES, {
    id: dbSiguienteId_(APP.SHEETS.LOTES, 'LOT-', 6),
    productoId: productoId, almacenId: almacenId, lote: lote,
    numeroSerie: numeroSerie || '',
    fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : '',
    cantidad: redondear_(cantidad, 4), estado: 'DISPONIBLE'
  });
}

function restarLote_(productoId, almacenId, lote, cantidad) {
  var filas = dbLeer_(APP.SHEETS.LOTES);
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (String(f.productoId) === String(productoId) && String(f.almacenId) === String(almacenId) && String(f.lote) === String(lote)) {
      dbHoja_(APP.SHEETS.LOTES).getRange(f._fila, 7).setValue(redondear_(numero_(f.cantidad) - cantidad, 4));
      return;
    }
  }
}

/**
 * FEFO — First Expired, First Out. Consume cantidad repartiendo entre
 * los lotes disponibles del almacén ordenados por vencimiento ascendente.
 */
function consumirLotesFEFO_(productoId, almacenId, cantidad) {
  var lotes = dbLeer_(APP.SHEETS.LOTES)
    .filter(function (f) {
      return String(f.productoId) === String(productoId) && String(f.almacenId) === String(almacenId) && numero_(f.cantidad) > 0;
    })
    .sort(function (a, b) {
      var va = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity;
      var vb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity;
      return va - vb;
    });

  var porConsumir = cantidad;
  var consumos = [];
  for (var i = 0; i < lotes.length && porConsumir > 0; i++) {
    var disp = numero_(lotes[i].cantidad);
    var tomar = Math.min(disp, porConsumir);
    if (tomar > 0) {
      restarLote_(productoId, almacenId, lotes[i].lote, tomar);
      consumos.push({ lote: lotes[i].lote, cantidad: redondear_(tomar, 4) });
      porConsumir -= tomar;
    }
  }
  if (porConsumir > 0.0001) {
    throw new ApiError_('No hay cobertura suficiente en lotes disponibles (faltan ' + redondear_(porConsumir, 2) + ').', 'VALIDATION');
  }
  return consumos;
}

/* ------------------------- KARDEX (promedio ponderado) ------------------------- */

/** Último saldo del kardex para (producto, almacén). */
function kardexSaldo_(productoId, almacenId) {
  var filas = dbLeer_(APP.SHEETS.KARDEX);
  var saldo = { cantidad: 0, valor: 0, costoPromedio: 0 };
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (String(f.productoId) === String(productoId) && String(f.almacenId) === String(almacenId)) {
      saldo.cantidad = numero_(f.saldoCantidad);
      saldo.valor = numero_(f.saldoValor);
      saldo.costoPromedio = numero_(f.costoPromedio);
    }
  }
  return saldo;
}

/** Inserta una fila de kardex recalculando saldo y costo promedio ponderado. */
function kardexInsertar_(o) {
  var prev = kardexSaldo_(o.productoId, o.almacenId);
  var entC = numero_(o.entradaCantidad), entV = numero_(o.entradaValor);
  var salC = numero_(o.salidaCantidad), salV = numero_(o.salidaValor);

  var saldoCant = redondear_(prev.cantidad + entC - salC, 4);
  var saldoValor = redondear_(prev.valor + entV - salV, 2);
  if (saldoCant < 0.0001 && saldoCant > -0.0001) { saldoCant = 0; saldoValor = 0; } // limpia residuos de redondeo
  var costoProm = saldoCant > 0 ? redondear_(saldoValor / saldoCant, 4) : 0;

  dbInsertar_(APP.SHEETS.KARDEX, {
    id: dbSiguienteId_(APP.SHEETS.KARDEX, 'KDX-', 6),
    fecha: o.fecha, productoId: o.productoId, almacenId: o.almacenId,
    movimientoId: o.movimientoId, tipo: o.tipo,
    entradaCantidad: entC || '', entradaValor: entV ? redondear_(entV) : '',
    salidaCantidad: salC || '', salidaValor: salV ? redondear_(salV) : '',
    saldoCantidad: saldoCant, saldoValor: saldoValor, costoPromedio: costoProm,
    documentoRef: o.documentoRef || '', usuario: o.usuario || ''
  });
}

/* ------------------------- ANULACIÓN ------------------------- */

function movimientosAnular_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'movimientos:anular');
  var motivo = String(c.motivo || '').trim();
  if (!motivo) throw new ApiError_('Debe indicar el motivo de la anulación.', 'VALIDATION');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var mov = dbPorId_(APP.SHEETS.MOVIMIENTOS, c.id);
    if (!mov) throw new ApiError_('Movimiento no encontrado: ' + c.id, 'NOT_FOUND');
    if (String(mov.estado).toUpperCase() === 'ANULADO') throw new ApiError_('El movimiento ya está anulado.', 'VALIDATION');

    var prod = dbPorId_(APP.SHEETS.PRODUCTOS, mov.productoId);
    var requiereLote = prod ? boolStr_(prod.requiereLote) : false;
    var cantidad = numero_(mov.cantidad);
    var costo = numero_(mov.costoUnitario);
    var fecha = fechaNow_();
    var afectados = [];

    // 1) Inversión de stock y kardex según la naturaleza del movimiento original.
    if (mov.tipo === 'ENTRADA' || mov.tipo === 'DEVOLUCION' || mov.tipo === 'AJUSTE_POSITIVO') {
      restarStock_(mov.productoId, mov.almacenDestinoId, cantidad);
      if (requiereLote && mov.lote) restarLote_(mov.productoId, mov.almacenDestinoId, mov.lote, cantidad);
      kardexInsertar_({
        fecha: fecha, productoId: mov.productoId, almacenId: mov.almacenDestinoId,
        movimientoId: mov.id, tipo: 'ANULACION', salidaCantidad: cantidad, salidaValor: cantidad * costo,
        documentoRef: mov.id + '-A', usuario: ses.usuario
      });
      afectados.push(mov.almacenDestinoId);
    } else if (mov.tipo === 'SALIDA' || mov.tipo === 'AJUSTE_NEGATIVO') {
      sumarStock_(mov.productoId, mov.almacenOrigenId, cantidad);
      if (requiereLote && mov.lote) upsertLote_(mov.productoId, mov.almacenOrigenId, mov.lote, '', mov.fechaVencimiento, cantidad);
      kardexInsertar_({
        fecha: fecha, productoId: mov.productoId, almacenId: mov.almacenOrigenId,
        movimientoId: mov.id, tipo: 'ANULACION', entradaCantidad: cantidad, entradaValor: cantidad * costo,
        documentoRef: mov.id + '-A', usuario: ses.usuario
      });
      afectados.push(mov.almacenOrigenId);
    } else if (mov.tipo === 'TRANSFERENCIA') {
      sumarStock_(mov.productoId, mov.almacenOrigenId, cantidad);
      restarStock_(mov.productoId, mov.almacenDestinoId, cantidad);
      if (requiereLote && mov.lote) {
        var partesLote = String(mov.lote).split(' + ');
        partesLote.forEach(function (lt) {
          upsertLote_(mov.productoId, mov.almacenOrigenId, lt, '', mov.fechaVencimiento, cantidad / partesLote.length);
          restarLote_(mov.productoId, mov.almacenDestinoId, lt, cantidad / partesLote.length);
        });
      }
      kardexInsertar_({
        fecha: fecha, productoId: mov.productoId, almacenId: mov.almacenOrigenId,
        movimientoId: mov.id, tipo: 'ANULACION', entradaCantidad: cantidad, entradaValor: cantidad * costo,
        documentoRef: mov.id + '-A', usuario: ses.usuario
      });
      kardexInsertar_({
        fecha: fecha, productoId: mov.productoId, almacenId: mov.almacenDestinoId,
        movimientoId: mov.id, tipo: 'ANULACION', salidaCantidad: cantidad, salidaValor: cantidad * costo,
        documentoRef: mov.id + '-A', usuario: ses.usuario
      });
      afectados.push(mov.almacenOrigenId, mov.almacenDestinoId);
    }

    // 2) Marca el movimiento como anulado.
    dbActualizar_(APP.SHEETS.MOVIMIENTOS, mov.id, { estado: 'ANULADO', anuladoMotivo: motivo, costoUnitario: costo });

    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'ANULACION', 'Anuló ' + mov.tipo + ' ' + mov.id + '. Motivo: ' + motivo);
    return appOk_({ id: mov.id, estado: 'ANULADO', motivo: motivo, almacenesAfectados: afectados });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------- CONSULTAS ------------------------- */

function movimientosList_(c) {
  requiereSesion_(c);
  var tipo = String(c.tipo || '').toUpperCase();
  var almacenId = String(c.almacenId || '');
  var q = String(c.q || '').toLowerCase();
  var desde = c.fechaDesde ? fechaDiaStr_(new Date(c.fechaDesde)) : '';
  var hasta = c.fechaHasta ? fechaDiaStr_(new Date(c.fechaHasta)) : '';
  var limite = entero_(c.limit, 300) || 300;

  var prods = {}; dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) { prods[p.id] = p; });
  var alms = {}; dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a; });

  var filas = dbLeer_(APP.SHEETS.MOVIMIENTOS).reverse().slice(0, limite);
  var out = [];
  filas.forEach(function (m) {
    var dia = fechaDiaStr_(m.fecha);
    if (tipo && String(m.tipo) !== tipo) return;
    if (almacenId && String(m.almacenOrigenId) !== almacenId && String(m.almacenDestinoId) !== almacenId) return;
    if (desde && dia < desde) return;
    if (hasta && dia > hasta) return;
    var prod = prods[m.productoId] || {};
    var linea = String(m.id + ' ' + (prod.nombre || '') + ' ' + (prod.sku || '') + ' ' + (m.documentoRef || '') + ' ' + (m.lote || '')).toLowerCase();
    if (q && linea.indexOf(q) === -1) return;
    out.push({
      id: m.id, fecha: fechaStr_(m.fecha), tipo: m.tipo,
      productoId: m.productoId, productoNombre: prod.nombre || m.productoId, sku: prod.sku || '',
      almacenOrigenId: m.almacenOrigenId, almacenOrigen: alms[m.almacenOrigenId] ? alms[m.almacenOrigenId].nombre : '',
      almacenDestinoId: m.almacenDestinoId, almacenDestino: alms[m.almacenDestinoId] ? alms[m.almacenDestinoId].nombre : '',
      cantidad: numero_(m.cantidad), unidad: prod.unidad || '',
      costoUnitario: numero_(m.costoUnitario), lote: m.lote, numeroSerie: m.numeroSerie,
      documentoRef: m.documentoRef, motivo: m.motivo, observaciones: m.observaciones,
      usuario: m.usuario, estado: m.estado, anuladoMotivo: m.anuladoMotivo
    });
  });
  return appOk_(out);
}
