/**
 * ================================================================
 * NexoERP — 19_Creditos.gs  (Adenda 1.6)
 * Ventas a crédito con plan de cuotas, cobranza y antigüedad de
 * saldos (aging) de cuentas por cobrar: cuotas + fiados.
 * ================================================================
 * Las cuotas se generan al registrar una venta con método "Credito".
 * Cada pago de cuota ENTRA a caja (según su medio de pago) y se
 * refleja en el flujo de caja. Las letras de cambio se registran como
 * observación del plan (canje documentario fuera del sistema).
 */

var BUCKETS_AGING = [30, 60, 90];

function generarPlanCuotas_(venta, plan) {
  var n = entero_(plan && plan.cuotas, 0);
  if (n < 1 || n > 60) n = 1;
  var dias = Math.max(1, entero_(plan && plan.diasEntre, 15) || 15);
  var inicio = new Date(((plan && plan.fechaInicio) ? plan.fechaInicio + 'T12:00:00' : fechaNow_().toString()));
  if (isNaN(inicio.getTime())) inicio = fechaNow_();
  var total = numero_(venta.total);
  var montoBase = redondear_(Math.floor((total / n) * 100) / 100);
  var filas = [];
  var saldo = total;
  for (var i = 1; i <= n; i++) {
    var monto = (i === n) ? redondear_(saldo) : montoBase;
    saldo = redondear_(saldo - monto);
    var venc = new Date(inicio.getTime());
    venc.setDate(venc.getDate() + dias * (i - 1));
    var fila = {
      id: dbSiguienteId_(APP.SHEETS.CUOTAS, 'CUO-', 6),
      ventaId: venta.id, clienteId: venta.clienteId, clienteNombre: venta.clienteNombre,
      nCuota: i, totalCuotas: n, fechaVenc: venc, monto: monto, saldo: monto,
      estado: 'PENDIENTE', pagadoAt: '', metodoPago: '', usuario: venta.usuario,
      observaciones: String(plan && plan.observaciones || '') + (i === 1 ? ' [Letra/cuota 1 de ' + n + ']' : '')
    };
    dbInsertar_(APP.SHEETS.CUOTAS, fila);
    filas.push(fila);
  }
  return filas;
}

function serializarCuota_(q) {
  var venc = fechaDiaStr_(q.fechaVenc);
  var dias = Math.floor((Date.now() - new Date(venc + 'T23:59:59').getTime()) / 86400000);
  return {
    id: q.id, ventaId: q.ventaId, clienteId: q.clienteId, clienteNombre: q.clienteNombre,
    nCuota: entero_(q.nCuota), totalCuotas: entero_(q.totalCuotas), fechaVenc: venc,
    monto: numero_(q.monto), saldo: numero_(q.saldo), estado: q.estado,
    pagadoAt: q.pagadoAt ? fechaStr_(q.pagadoAt) : '', metodoPago: q.metodoPago || '',
    observaciones: q.observaciones || '', diasVencido: dias > 0 ? dias : 0, usuario: q.usuario
  };
}

function cuotasList_(c) {
  requiereSesion_(c);
  var estado = String(c.estado || '').toUpperCase();
  var clienteId = String(c.clienteId || '');
  var filas = dbLeer_(APP.SHEETS.CUOTAS).reverse().filter(function (q) {
    if (estado && estado !== 'TODAS' && String(q.estado).toUpperCase() !== estado) return false;
    if (clienteId && String(q.clienteId) !== clienteId) return false;
    return true;
  }).slice(0, entero_(c.limit, 300) || 300);
  return appOk_(filas.map(serializarCuota_));
}

/** Registra el pago (total o parcial) de una cuota. */
function cuotaPagar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'creditos:manage');
  var monto = numero_(c.monto, 0);
  if (monto <= 0) throw new ApiError_('Monto inválido.', 'VALIDATION');
  var metodo = String(c.metodoPago || 'Efectivo');
  if (APP.METODOS_PAGO.indexOf(metodo) === -1) throw new ApiError_('Método de pago no válido.', 'VALIDATION');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var q = dbPorId_(APP.SHEETS.CUOTAS, c.id);
    if (!q) throw new ApiError_('Cuota no encontrada.', 'NOT_FOUND');
    if (String(q.estado).toUpperCase() !== 'PENDIENTE') throw new ApiError_('La cuota ya está ' + q.estado + '.', 'VALIDATION');
    if (monto > numero_(q.saldo) + 0.009) throw new ApiError_('El pago excede el saldo de la cuota (' + q.saldo + ').', 'VALIDATION');
    var nuevoSaldo = redondear_(numero_(q.saldo) - monto);
    dbActualizar_(APP.SHEETS.CUOTAS, q.id, {
      saldo: nuevoSaldo, estado: nuevoSaldo <= 0.009 ? 'PAGADA' : 'PENDIENTE',
      pagadoAt: nuevoSaldo <= 0.009 ? fechaNow_() : '', metodoPago: metodo,
      observaciones: String(q.observaciones || '') + (String(c.nota || '') ? ' · ' + c.nota : '')
    });
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'COBRANZA',
      'Cobró cuota ' + q.nCuota + '/' + q.totalCuotas + ' de ' + q.ventaId + ' (' + q.clienteNombre + '): ' + monto + ' (' + metodo + ')');
    return appOk_({ id: q.id, saldo: nuevoSaldo, estado: nuevoSaldo <= 0.009 ? 'PAGADA' : 'PENDIENTE' });
  } finally {
    lock.releaseLock();
  }
}

/** Cobranzas de cuotas de un día por método (entran a caja). */
function pagosCuotaDia_(dia) {
  var porMetodo = {};
  dbLeer_(APP.SHEETS.CUOTAS).forEach(function (q) {
    if (String(q.estado).toUpperCase() !== 'PAGADA' || !q.pagadoAt) return;
    if (fechaDiaStr_(q.pagadoAt) !== dia) return;
    var m = q.metodoPago || 'Efectivo';
    if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
    porMetodo[m].n++;
    porMetodo[m].total = redondear_(porMetodo[m].total + numero_(q.monto));
  });
  return Object.keys(porMetodo).map(function (k) { return porMetodo[k]; });
}

/**
 * Aging de Cuentas por Cobrar: cuotas PENDIENTES + fiados con saldo.
 * Buckets: por vencer / 1-30 / 31-60 / 61-90 / +90 días de vencidas.
 */
function creditosAging_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  var hoy = new Date(fechaDiaStr_(fechaNow_()) + 'T23:59:59');
  function bucket(dias) {
    if (dias <= 0) return 'POR_VENCER';
    for (var i = 0; i < BUCKETS_AGING.length; i++) {
      if (dias <= BUCKETS_AGING[i]) return '1-' + BUCKETS_AGING[i];
    }
    return '+90';
  }
  var clientes = {}, resumen = {};
  function acumular(clave, clienteId, nombre, dias, monto, tipo) {
    var b = bucket(dias);
    if (!clientes[clave]) clientes[clave] = { clienteId: clienteId, clienteNombre: nombre, tipo: tipo, total: 0, detalle: [] };
    clientes[clave].total = redondear_(clientes[clave].total + monto);
    clientes[clave].detalle.push({ b: b, monto: monto });
    if (!resumen[b]) resumen[b] = 0;
    resumen[b] = redondear_(resumen[b] + monto);
  }
  dbLeer_(APP.SHEETS.CUOTAS).forEach(function (q) {
    if (String(q.estado).toUpperCase() !== 'PENDIENTE' || numero_(q.saldo) <= 0) return;
    var venc = fechaDiaStr_(q.fechaVenc);
    var dias = Math.floor((hoy.getTime() - new Date(venc + 'T23:59:59').getTime()) / 86400000);
    acumular('CUO-' + q.id, q.clienteId, q.clienteNombre, dias, numero_(q.saldo), 'Cuota ' + q.nCuota + '/' + q.totalCuotas + ' (' + q.ventaId + ')');
  });
  dbLeer_(APP.SHEETS.CLIENTES).forEach(function (cli) {
    var saldo = numero_(cli.saldoFiado);
    if (saldo <= 0) return;
    /* La antigüedad del fiado se calcula desde la venta fiada más antigua sin abonos completos */
    var ventasFiado = dbLeer_(APP.SHEETS.VENTAS).filter(function (v) {
      return String(v.clienteId) === String(cli.id) && String(v.estadoPago).toUpperCase() === 'FIADO' && String(v.estado).toUpperCase() === 'EMITIDA';
    });
    var pagos = dbLeer_(APP.SHEETS.PAGOS_FIADO).filter(function (p) { return String(p.clienteId) === String(cli.id); });
    var saldoTmp = saldo;
    var masAntigua = null;
    ventasFiado.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    for (var i = 0; i < ventasFiado.length; i++) {
      var v = ventasFiado[i];
      var abonado = 0;
      pagos.forEach(function (p) { if (String(p.ventaId) === String(v.id)) abonado += numero_(p.monto); });
      var pend = numero_(v.total) - abonado;
      if (pend <= 0.009) continue;
      saldoTmp -= pend;
      if (saldoTmp < -0.009) { masAntigua = v; break; }
      if (!masAntigua) masAntigua = v;
    }
    var dias = masAntigua ? Math.floor((hoy.getTime() - new Date(fechaDiaStr_(masAntigua.fecha) + 'T23:59:59').getTime()) / 86400000) : 0;
    acumular('FIA-' + cli.id, cli.id, cli.razonSocial, dias, saldo, 'Fiado');
  });
  var totalCxC = 0;
  Object.keys(resumen).forEach(function (b) { totalCxC = redondear_(totalCxC + resumen[b]); });
  var lista = Object.keys(clientes).map(function (k) { return clientes[k]; })
    .sort(function (a, b) { return b.total - a.total; });
  return appOk_({ moneda: cfg.MONEDA_SIMBOLO || 'S/', resumen: resumen, totalCxC: totalCxC, clientes: lista });
}

/** Plan de cuotas de una venta (para la ficha de venta). */
function creditosDeVenta_(c) {
  requiereSesion_(c);
  var filas = dbLeer_(APP.SHEETS.CUOTAS).filter(function (q) { return String(q.ventaId) === String(c.ventaId); })
    .sort(function (a, b) { return entero_(a.nCuota) - entero_(b.nCuota); })
    .map(serializarCuota_);
  return appOk_(filas);
}
