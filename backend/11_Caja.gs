/**
 * ================================================================
 * NexoERP — 11_Caja.gs  (ADENDA: Cuadre de Caja del POS)
 * Apertura y cierre de caja con comparación entre el efectivo
 * declarado por el cajero y las ventas del día por método de pago.
 * ================================================================
 * El detalle por método de pago proviene de la pestaña Ventas
 * (columna metodoPago), de modo que el cuadre SIEMPRE coincide con
 * lo emitido por el POS (ventas EMITIDAS del día, no anuladas).
 */

/* ---------------------- Estado de caja ---------------------- */

/**
 * Abonos de fiado de un día agrupados por método de pago (Adenda 1.3).
 * Los abonos son dinero que SÍ entra a caja cuando el método es Efectivo.
 */
function abonosFiadoDia_(dia) {
  var porMetodo = {};
  dbLeer_(APP.SHEETS.PAGOS_FIADO).forEach(function (p) {
    if (fechaDiaStr_(p.fecha) !== dia) return;
    var m = p.metodoPago || 'Efectivo';
    if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
    porMetodo[m].n++;
    porMetodo[m].total = redondear_(porMetodo[m].total + numero_(p.monto));
  });
  return Object.keys(porMetodo).map(function (k) { return porMetodo[k]; });
}

function cajaEstado_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();

  var abierta = null;
  dbLeer_(APP.SHEETS.CAJA).forEach(function (f) {
    if (String(f.estado).toUpperCase() === 'ABIERTA') abierta = f;
  });

  var dia = abierta ? fechaDiaStr_(abierta.fecha) : fechaDiaStr_(fechaNow_());
  var resumen = resumenVentasPorMetodo_(dia);
  var totalDia = 0, nTransacciones = 0;
  resumen.forEach(function (r) { totalDia += r.total; nTransacciones += r.n; });

  /* Adenda 1.3: abonos de fiado del día (entran a caja si son en efectivo). */
  var abonos = abonosFiadoDia_(dia);
  var abonosEfectivo = 0, abonosTotal = 0;
  abonos.forEach(function (a) { abonosTotal = redondear_(abonosTotal + a.total); if (a.metodo === 'Efectivo') abonosEfectivo = a.total; });
  var fiadoEmitido = 0;
  resumen.forEach(function (r) { if (r.metodo === 'Fiado') fiadoEmitido = r.total; });

  return appOk_({
    abierta: !!abierta,
    caja: abierta ? serializarCaja_(abierta) : null,
    fecha: dia,
    resumen: resumen,
    nTransacciones: nTransacciones,
    totalVentasDia: redondear_(totalDia),
    abonosFiado: abonos,
    abonosFiadoTotal: abonosTotal,
    abonosFiadoEfectivo: abonosEfectivo,
    fiadoEmitidoDia: fiadoEmitido,
    moneda: cfg.MONEDA_SIMBOLO || 'S/',
    metodoPagoDefault: cfg.METODO_PAGO_DEFAULT || 'Efectivo',
    horarioInicio: cfg.HORARIO_INICIO || '',
    horarioFin: cfg.HORARIO_FIN || '',
    servidor: fechaStr_(fechaNow_())
  });
}

/** Ventas EMITIDAS de un día agrupadas por método de pago. */
function resumenVentasPorMetodo_(dia) {
  var porMetodo = {};
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    if (fechaDiaStr_(v.fecha) !== dia) return;
    var m = v.metodoPago || 'Efectivo';
    if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
    porMetodo[m].n++;
    porMetodo[m].total = redondear_(porMetodo[m].total + numero_(v.total));
  });
  return Object.keys(porMetodo).map(function (k) { return porMetodo[k]; })
    .sort(function (a, b) { return b.total - a.total; });
}

function serializarCaja_(f) {
  return {
    id: f.id, fecha: fechaDiaStr_(f.fecha), aperturaAt: fechaStr_(f.aperturaAt),
    usuario: f.usuario, montoInicial: numero_(f.montoInicial),
    cierreAt: f.cierreAt ? fechaStr_(f.cierreAt) : '',
    montoSistema: numero_(f.montoSistema), montoContado: numero_(f.montoContado),
    diferencia: numero_(f.diferencia), estado: f.estado, detalle: f.detalle || ''
  };
}

/* ---------------------- Abrir caja ---------------------- */

function cajaAbrir_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'caja:manage');
  var montoInicial = numero_(c.montoInicial, 0);
  if (montoInicial < 0) throw new ApiError_('El monto inicial no puede ser negativo.', 'VALIDATION');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var yaAbierta = null;
    dbLeer_(APP.SHEETS.CAJA).forEach(function (f) {
      if (String(f.estado).toUpperCase() === 'ABIERTA') yaAbierta = f;
    });
    if (yaAbierta) throw new ApiError_('Ya existe una caja abierta desde ' + fechaStr_(yaAbierta.aperturaAt) + '. Ciérrela antes de abrir otra.', 'VALIDATION');

    var fila = {
      id: dbSiguienteId_(APP.SHEETS.CAJA, 'CJA-', 5),
      fecha: fechaNow_(), aperturaAt: fechaNow_(), usuario: ses.usuario,
      montoInicial: montoInicial, cierreAt: '', montoSistema: '', montoContado: '',
      diferencia: '', estado: 'ABIERTA', detalle: ''
    };
    dbInsertar_(APP.SHEETS.CAJA, fila);
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CAJA', 'Abrió caja con ' + montoInicial);
    return appOk_(serializarCaja_(fila));
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------- Cerrar caja ---------------------- */

function cajaCerrar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'caja:manage');
  var montoContado = numero_(c.montoContado, -1);
  if (montoContado < 0) throw new ApiError_('Ingrese el efectivo contado en caja.', 'VALIDATION');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var abierta = null;
    dbLeer_(APP.SHEETS.CAJA).forEach(function (f) {
      if (String(f.estado).toUpperCase() === 'ABIERTA') abierta = f;
    });
    if (!abierta) throw new ApiError_('No hay ninguna caja abierta que cerrar.', 'VALIDATION');

    var dia = fechaDiaStr_(abierta.fecha);
    var resumen = resumenVentasPorMetodo_(dia);
    var efectivoVentas = 0, totalDia = 0;
    resumen.forEach(function (r) {
      totalDia += r.total;
      if (r.metodo === 'Efectivo') efectivoVentas = r.total;
    });

    /* Adenda 1.3: los abonos de fiado en efectivo también entran a caja. */
    var abonos = abonosFiadoDia_(dia);
    var abonosEfectivo = 0;
    abonos.forEach(function (a) { if (a.metodo === 'Efectivo') abonosEfectivo = a.total; });

    // Efectivo que debería haber en caja = fondo inicial + ventas en efectivo + abonos de fiado en efectivo.
    var esperadoEnCaja = redondear_(numero_(abierta.montoInicial) + efectivoVentas + abonosEfectivo);

    var fila = {
      id: abierta.id, estado: 'CERRADA', cierreAt: fechaNow_(),
      montoSistema: esperadoEnCaja, montoContado: redondear_(montoContado),
      diferencia: redondear_(montoContado - esperadoEnCaja),
      detalle: String(c.detalle || '')
    };
    dbActualizar_(APP.SHEETS.CAJA, abierta.id, fila);
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CAJA',
      'Cerró caja ' + abierta.id + '. Ventas del día: ' + redondear_(totalDia) + '. Abonos fiado (efectivo): ' + abonosEfectivo + '. Efectivo esperado: ' + esperadoEnCaja + '. Diferencia: ' + fila.diferencia);

    var cerrada = dbPorId_(APP.SHEETS.CAJA, abierta.id);
    return appOk_({
      caja: serializarCaja_(cerrada),
      resumen: resumen,
      totalVentasDia: redondear_(totalDia)
    });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------- Historial ---------------------- */

function cajaHistorial_(c) {
  requiereSesion_(c);
  var limite = entero_(c.limit, 30) || 30;
  var filas = dbLeer_(APP.SHEETS.CAJA).reverse().slice(0, limite).map(serializarCaja_);
  return appOk_(filas);
}
