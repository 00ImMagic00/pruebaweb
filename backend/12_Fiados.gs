/**
 * ================================================================
 * NexoERP — 12_Fiados.gs  (ADENDA 1.3: venta a crédito — cuaderno de fiados)
 * Cartera de fiados por cliente, abonos parciales y historial de pagos.
 * ================================================================
 * Modelo de datos:
 *   · Clientes.limiteFiado  → límite de crédito (0 = sin límite definido)
 *   · Clientes.saldoFiado   → saldo pendiente de cobro (lo mueven las
 *     ventas FIADAS al alza y los abonos a la baja)
 *   · Ventas.estadoPago     → 'PAGADO' | 'FIADO'
 *   · PagosFiado            → libro de abonos { fecha, clienteId, monto,
 *     metodoPago, ventaId, usuario, nota }
 * Reglas:
 *   · Una venta con metodoPago "Fiado" exige cliente registrado y respeta
 *     el límite (ver registrarVentaCore_ en 10_Ventas.gs).
 *   · El abono registra el dinero recibido (método real: Efectivo/Yape/...),
 *     reduce el saldo y — si el cliente queda en cero — marca sus boletas
 *     FIADO como PAGADO.
 *   · La anulación de una venta fiada reduce el saldo (10_Ventas.gs).
 */

/* ---------------------- Cartera de fiados ---------------------- */

function fiadosCartera_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  var diasAlerta = entero_(cfg.FIADO_DIAS_ALERTA, 30);

  var hoyMs = new Date(fechaDiaStr_(fechaNow_())).getTime();
  var clientes = dbLeer_(APP.SHEETS.CLIENTES);
  var mapaCli = {};
  clientes.forEach(function (x) { mapaCli[String(x.id)] = x; });

  /* Boletas FIADO vigentes agrupadas por cliente. */
  var pendientesPorCliente = {};
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    if (String(v.estadoPago || (String(v.metodoPago) === 'Fiado' ? 'FIADO' : 'PAGADO')).toUpperCase() !== 'FIADO') return;
    var cliId = String(v.clienteId || '');
    if (!cliId) return;
    if (!pendientesPorCliente[cliId]) pendientesPorCliente[cliId] = [];
    var dias = Math.round((hoyMs - new Date(fechaDiaStr_(v.fecha)).getTime()) / 86400000);
    pendientesPorCliente[cliId].push({
      id: v.id, boleta: v.boleta, fecha: fechaStr_(v.fecha),
      total: numero_(v.total), dias: dias, metodoPago: v.metodoPago
    });
  });

  var out = [];
  var totalPendiente = 0;
  clientes.forEach(function (cli) {
    var saldo = redondear_(numero_(cli.saldoFiado));
    if (saldo <= 0.004) return;                       // solo clientes con deuda
    var limite = numero_(cli.limiteFiado);
    var ventas = pendientesPorCliente[String(cli.id)] || [];
    var diasMax = 0;
    ventas.forEach(function (v) { if (v.dias > diasMax) diasMax = v.dias; });
    totalPendiente = redondear_(totalPendiente + saldo);
    out.push({
      id: cli.id,
      nombre: cli.razonSocial || '',
      documento: cli.documento || '',
      telefono: String(cli.telefono || ''),
      limite: limite,
      saldo: saldo,
      disponible: limite > 0 ? redondear_(Math.max(0, limite - saldo)) : null,
      nPendientes: ventas.length,
      ventasPendientes: ventas.sort(function (a, b) { return b.dias - a.dias; }),
      diasMax: diasMax,
      critico: diasMax > diasAlerta
    });
  });

  out.sort(function (a, b) { return b.saldo - a.saldo; });
  return appOk_({
    clientes: out,
    totalPendiente: totalPendiente,
    nClientes: out.length,
    diasAlerta: diasAlerta,
    moneda: cfg.MONEDA_SIMBOLO || 'S/'
  });
}

/* ---------------------- Registrar abono ---------------------- */

function fiadoAbono_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'ventas:registrar');

  var monto = redondear_(numero_(c.monto, 0));
  var metodoPago = String(c.metodoPago || 'Efectivo');
  if (metodoPago === 'Fiado') {
    throw new ApiError_('Un abono no puede pagarse con más fiado. Use Efectivo, Yape, Plin o Tarjeta.', 'VALIDATION');
  }
  if (APP.METODOS_PAGO.indexOf(metodoPago) === -1) {
    throw new ApiError_('Método de pago no válido: ' + metodoPago + '.', 'VALIDATION');
  }
  if (monto <= 0) throw new ApiError_('El monto del abono debe ser mayor que cero.', 'VALIDATION');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cli = dbPorId_(APP.SHEETS.CLIENTES, c.clienteId);
    if (!cli) throw new ApiError_('Cliente no encontrado: ' + c.clienteId, 'NOT_FOUND');
    var saldo = redondear_(numero_(cli.saldoFiado));
    if (saldo <= 0.004) throw new ApiError_('El cliente "' + cli.razonSocial + '" no tiene saldo de fiado pendiente.', 'VALIDATION');
    if (monto > saldo + 0.009) {
      throw new ApiError_('El abono (' + monto.toFixed(2) + ') excede el saldo pendiente (' + saldo.toFixed(2) + ').', 'VALIDATION');
    }

    var abono = {
      id: dbSiguienteId_(APP.SHEETS.PAGOS_FIADO, 'PFI-', 5),
      fecha: fechaNow_(),
      clienteId: cli.id, clienteNombre: cli.razonSocial,
      ventaId: String(c.ventaId || ''),
      monto: monto, metodoPago: metodoPago,
      usuario: ses.usuario, nota: String(c.nota || '')
    };
    dbInsertar_(APP.SHEETS.PAGOS_FIADO, abono);

    var nuevoSaldo = redondear_(saldo - monto);
    dbActualizar_(APP.SHEETS.CLIENTES, cli.id, { saldoFiado: nuevoSaldo });

    /* Cliente saldado: sus boletas FIADO pasan a PAGADO. */
    var ventasSaldadas = 0;
    if (nuevoSaldo <= 0.004) {
      dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
        if (String(v.clienteId) !== String(cli.id)) return;
        if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
        var ep = String(v.estadoPago || (String(v.metodoPago) === 'Fiado' ? 'FIADO' : 'PAGADO')).toUpperCase();
        if (ep !== 'FIADO') return;
        dbActualizar_(APP.SHEETS.VENTAS, v.id, { estadoPago: 'PAGADO' });
        ventasSaldadas++;
      });
    }

    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'FIADO',
      'Abono de ' + cli.razonSocial + ': ' + monto + ' (' + metodoPago + ')' +
      (String(c.ventaId || '') ? ' ref. ' + c.ventaId : '') + '. Saldo nuevo: ' + Math.max(0, nuevoSaldo));

    return appOk_({
      abono: { id: abono.id, fecha: fechaStr_(abono.fecha), monto: monto, metodoPago: metodoPago, nota: abono.nota },
      cliente: {
        id: cli.id, nombre: cli.razonSocial, limite: numero_(cli.limiteFiado),
        saldo: Math.max(0, nuevoSaldo), saldado: nuevoSaldo <= 0.004, ventasSaldadas: ventasSaldadas
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------- Historial de abonos ---------------------- */

function fiadoPagos_(c) {
  requiereSesion_(c);
  var limite = entero_(c.limit, 100) || 100;
  var clienteId = String(c.clienteId || '');
  var out = dbLeer_(APP.SHEETS.PAGOS_FIADO)
    .filter(function (p) { return !clienteId || String(p.clienteId) === clienteId; })
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); })
    .slice(0, limite)
    .map(function (p) {
      return {
        id: p.id, fecha: fechaStr_(p.fecha), clienteId: p.clienteId,
        clienteNombre: p.clienteNombre, ventaId: p.ventaId || '',
        monto: numero_(p.monto), metodoPago: p.metodoPago,
        usuario: p.usuario, nota: p.nota || ''
      };
    });
  return appOk_(out);
}
