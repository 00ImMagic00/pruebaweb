/**
 * ================================================================
 * NexoERP — 20_Fidelizacion.gs  (Adenda 1.6)
 * Programa de puntos / tarjeta de fidelidad.
 * ================================================================
 * Reglas configurables en Ajustes → "Fidelización de clientes":
 *   FIDEL_ACTIVA      Sí/No
 *   FIDEL_MONTO_PUNTO 1 punto por cada X de consumo (ej. 10)
 *   FIDEL_VALOR_PUNTO valor en moneda de cada punto al canjear (ej. 0.10)
 *   FIDEL_MIN_CANJE   puntos mínimos para canjear (ej. 100)
 * El POS acumula automáticamente al vender y canjea puntos como
 * descuento global; cada movimiento queda en el historial del cliente.
 */

function fidelActiva_(cfg) {
  return boolStr_(cfg.FIDEL_ACTIVA);
}

/** Acumula y canjea puntos por una venta (hook post-venta, dentro del lock). */
function fidelProcesarVenta_(cfg, venta, cliente, puntosUsar) {
  var res = { puntosGanados: 0, puntosUsados: 0, descuentoCanje: 0 };
  if (!fidelActiva_(cfg) || !cliente.id) return res;
  var saldoCliente = numero_((dbPorId_(APP.SHEETS.CLIENTES, cliente.id) || {}).puntos);

  /* 1) Canje solicitado por el POS */
  var usar = entero_(puntosUsar, 0);
  var minCanje = entero_(cfg.FIDEL_MIN_CANJE, 0);
  if (usar > 0) {
    if (usar < minCanje) throw new ApiError_('El canje mínimo es de ' + minCanje + ' puntos.', 'VALIDATION');
    if (usar > saldoCliente) throw new ApiError_('El cliente solo tiene ' + saldoCliente + ' puntos disponibles.', 'VALIDATION');
    var descuento = redondear_(usar * numero_(cfg.FIDEL_VALOR_PUNTO, 0));
    if (descuento > numero_(venta.total)) descuento = numero_(venta.total);
    res.puntosUsados = usar;
    res.descuentoCanje = descuento;
  }

  /* 2) Acumulación por consumo (sobre el total neto ya con canje) */
  var base = Math.max(0, numero_(venta.total) - res.descuentoCanje);
  var porPunto = numero_(cfg.FIDEL_MONTO_PUNTO, 0);
  res.puntosGanados = porPunto > 0 ? Math.floor(base / porPunto) : 0;

  if (res.puntosUsados > 0 || res.puntosGanados > 0) {
    var saldoNuevo = redondear_(saldoCliente - res.puntosUsados + res.puntosGanados, 0);
    dbActualizar_(APP.SHEETS.CLIENTES, cliente.id, { puntos: saldoNuevo });
    if (res.puntosUsados > 0) {
      fidelHistorialInsertar_(cliente, 'CANJE', -res.puntosUsados, venta.id, 'Canje en venta ' + venta.boleta, saldoNuevo);
    }
    if (res.puntosGanados > 0) {
      fidelHistorialInsertar_(cliente, 'ACUMULO', res.puntosGanados, venta.id, 'Acumulación venta ' + venta.boleta, saldoNuevo);
    }
  }
  return res;
}

function fidelHistorialInsertar_(cliente, tipo, puntos, ventaId, nota, saldoDespues) {
  dbInsertar_(APP.SHEETS.FIDEL_HIST, {
    id: dbSiguienteId_(APP.SHEETS.FIDEL_HIST, 'FID-', 6),
    fecha: fechaNow_(), clienteId: cliente.id, clienteNombre: cliente.nombre || cliente.razonSocial || '',
    tipo: tipo, puntos: puntos, ventaId: ventaId || '', nota: nota || '',
    usuario: '', saldoDespues: saldoDespues
  });
}

/** Ajuste manual de puntos (regalo, corrección, campaña). */
function fidelAjuste_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'fidelizacion:manage');
  var cli = dbPorId_(APP.SHEETS.CLIENTES, c.clienteId);
  if (!cli) throw new ApiError_('Cliente no encontrado.', 'NOT_FOUND');
  var puntos = entero_(c.puntos, 0);
  if (!puntos) throw new ApiError_('Indique los puntos (positivo o negativo).', 'VALIDATION');
  var saldoNuevo = Math.max(0, redondear_(numero_(cli.puntos) + puntos, 0));
  dbActualizar_(APP.SHEETS.CLIENTES, cli.id, { puntos: saldoNuevo });
  fidelHistorialInsertar_({ id: cli.id, nombre: cli.razonSocial }, 'AJUSTE', puntos, '', String(c.nota || 'Ajuste manual'), saldoNuevo);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'FIDELIZACION', 'Ajuste de ' + puntos + ' pts → ' + cli.razonSocial + ' (saldo ' + saldoNuevo + ')');
  return appOk_({ clienteId: cli.id, saldo: saldoNuevo });
}

function fidelHistorial_(c) {
  requiereSesion_(c);
  var clienteId = String(c.clienteId || '');
  return appOk_(dbLeer_(APP.SHEETS.FIDEL_HIST).reverse().filter(function (h) {
    return !clienteId || String(h.clienteId) === clienteId;
  }).slice(0, entero_(c.limit, 200) || 200).map(function (h) {
    return { id: h.id, fecha: fechaStr_(h.fecha), clienteId: h.clienteId, clienteNombre: h.clienteNombre,
      tipo: h.tipo, puntos: entero_(h.puntos), ventaId: h.ventaId, nota: h.nota, saldoDespues: entero_(h.saldoDespues) };
  }));
}

/** Ranking de clientes por puntos (para campañas WhatsApp). */
function fidelRanking_(c) {
  requiereSesion_(c);
  var filas = dbLeer_(APP.SHEETS.CLIENTES)
    .filter(function (cli) { return entero_(cli.puntos) > 0 && String(cli.estado).toUpperCase() === 'ACTIVO'; })
    .sort(function (a, b) { return entero_(b.puntos) - entero_(a.puntos); })
    .slice(0, entero_(c.limit, 50) || 50)
    .map(function (cli) {
      return { clienteId: cli.id, clienteNombre: cli.razonSocial, telefono: cli.telefono || '', puntos: entero_(cli.puntos) };
    });
  return appOk_(filas);
}
