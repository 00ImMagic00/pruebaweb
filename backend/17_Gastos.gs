/**
 * ================================================================
 * NexoERP — 17_Gastos.gs  (Adenda 1.6)
 * Gastos del negocio + flujo de caja real.
 * ================================================================
 * La MYPE peruana no solo vende: paga luz, alquiler, planilla y
 * transporte. Este módulo registra egresos por categoría y medio de
 * pago, alimenta el cuadre de caja (egresos en efectivo) y expone el
 * flujo de caja mensual (ingresos por método − egresos por categoría).
 */

var SEED_GASTOS_CATEGORIAS = [
  ['Luz y agua', 'COSTO_FIJO'], ['Alquiler', 'COSTO_FIJO'], ['Planilla y sueldos', 'COSTO_FIJO'],
  ['Internet y teléfono', 'COSTO_FIJO'], ['Transporte y fletes', 'COSTO_VARIABLE'],
  ['Marketing y publicidad', 'COSTO_VARIABLE'], ['Impuestos y tasas', 'COSTO_FIJO'],
  ['Mantenimiento', 'COSTO_VARIABLE'], ['Embalajes y bolsas', 'COSTO_VARIABLE'],
  ['Pagos a proveedores', 'COSTO_VARIABLE'], ['Otros gastos', 'COSTO_VARIABLE']
];

function gastosCategoriasList_(c) {
  requiereSesion_(c);
  return appOk_(dbLeer_(APP.SHEETS.GASTOS_CATEGORIAS).filter(function (x) { return String(x.estado).toUpperCase() === 'ACTIVO'; }));
}

function gastosCategoriasSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'gastos:manage');
  var it = c.item || {};
  if (!String(it.nombre || '').trim()) throw new ApiError_('Nombre de categoría obligatorio.', 'VALIDATION');
  var tipo = ['COSTO_FIJO', 'COSTO_VARIABLE'].indexOf(String(it.tipo).toUpperCase()) !== -1 ? String(it.tipo).toUpperCase() : 'COSTO_VARIABLE';
  if (it.id) {
    dbActualizar_(APP.SHEETS.GASTOS_CATEGORIAS, it.id, { nombre: it.nombre, tipo: tipo });
    return appOk_({ id: it.id, actualizado: true });
  }
  var id = dbSiguienteId_(APP.SHEETS.GASTOS_CATEGORIAS, 'GCA-', 3);
  dbInsertar_(APP.SHEETS.GASTOS_CATEGORIAS, { id: id, nombre: it.nombre, tipo: tipo, estado: 'ACTIVO' });
  return appOk_({ id: id, creado: true });
}

function gastosCategoriasDelete_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'gastos:manage');
  dbDesactivar_(APP.SHEETS.GASTOS_CATEGORIAS, c.id);
  return appOk_({ id: c.id, estado: 'INACTIVO' });
}

function serializarGasto_(g) {
  return {
    id: g.id, fecha: fechaStr_(g.fecha), dia: fechaDiaStr_(g.fecha), categoria: g.categoria,
    descripcion: g.descripcion, monto: numero_(g.monto), metodoPago: g.metodoPago,
    numeroDoc: g.numeroDoc || '', usuario: g.usuario, estado: g.estado
  };
}

function gastosRegistrar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'gastos:manage');
  var it = c.item || {};
  var monto = numero_(it.monto, 0);
  if (monto <= 0) throw new ApiError_('El monto del gasto debe ser mayor a cero.', 'VALIDATION');
  if (!String(it.categoria || '').trim()) throw new ApiError_('Seleccione la categoría del gasto.', 'VALIDATION');
  var metodo = String(it.metodoPago || 'Efectivo');
  if (APP.METODOS_PAGO.indexOf(metodo) === -1) throw new ApiError_('Método de pago no válido: ' + metodo, 'VALIDATION');
  var fila = {
    id: dbSiguienteId_(APP.SHEETS.GASTOS, 'GAS-', 6),
    fecha: it.fecha ? new Date(it.fecha + 'T12:00:00') : fechaNow_(),
    categoria: String(it.categoria).trim(),
    descripcion: String(it.descripcion || '').trim(),
    monto: redondear_(monto), metodoPago: metodo,
    numeroDoc: String(it.numeroDoc || '').trim(),
    usuario: ses.usuario, estado: 'ACTIVO', creado: fechaNow_()
  };
  dbInsertar_(APP.SHEETS.GASTOS, fila);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'GASTO', 'Registró gasto ' + fila.categoria + ' ' + cfgMoneda_() + ' ' + fila.monto + ' (' + metodo + ')');
  return appOk_(serializarGasto_(fila));
}

function cfgMoneda_() {
  try { return configLeer_().MONEDA_SIMBOLO || 'S/'; } catch (e) { return 'S/'; }
}

function gastosList_(c) {
  requiereSesion_(c);
  var mes = String(c.mes || '').trim();
  var estado = String(c.estado || 'ACTIVO').toUpperCase();
  var filas = dbLeer_(APP.SHEETS.GASTOS).reverse().filter(function (g) {
    if (estado && String(g.estado).toUpperCase() !== estado) return false;
    if (mes && String(g.fecha).substring(0, 7) !== mes) return false;
    return true;
  }).slice(0, entero_(c.limit, 300) || 300);
  return appOk_(filas.map(serializarGasto_));
}

function gastosAnular_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'gastos:manage');
  dbActualizar_(APP.SHEETS.GASTOS, c.id, { estado: 'ANULADO' });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'GASTO', 'Anuló gasto ' + c.id);
  return appOk_({ id: c.id, estado: 'ANULADO' });
}

/** Efectivo gastado en un día (descuenta del cuadre de caja). */
function gastosEfectivoDia_(dia) {
  var total = 0;
  dbLeer_(APP.SHEETS.GASTOS).forEach(function (g) {
    if (String(g.estado).toUpperCase() !== 'ACTIVO') return;
    if (fechaDiaStr_(g.fecha) !== dia) return;
    if (String(g.metodoPago) === 'Efectivo') total = redondear_(total + numero_(g.monto));
  });
  return total;
}

/* ==================== Flujo de caja (ingresos vs egresos) ==================== */

/**
 * Resumen financiero de un mes (o del mes actual si no se envía):
 *   - ingresosPorMetodo: ventas al contado (EMITIDAS, excluye Fiado y
 *     Crédito) + cobranzas de cuotas + abonos de fiado.
 *   - egresosPorCategoria: gastos ACTIVOS del mes.
 *   - porDia: series para el gráfico de flujo de caja.
 */
function finanzasResumen_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  var mes = String(c.mes || '').trim() || fechaDiaStr_(fechaNow_()).substring(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ApiError_('Mes inválido (YYYY-MM).', 'VALIDATION');

  var ingresos = {}, egresos = {}, porDia = {};
  function diaKey(f) { return String(f).substring(0, 10); }
  function sumar(bucket, clave, monto, dia) {
    bucket[clave] = redondear_((bucket[clave] || 0) + monto);
    if (dia) {
      if (!porDia[dia]) porDia[dia] = { ingresos: 0, egresos: 0 };
      porDia[dia][clave === '___' ? 'ingresos' : (bucket === ingresos ? 'ingresos' : 'egresos')] =
        redondear_((porDia[dia][bucket === ingresos ? 'ingresos' : 'egresos'] || 0) + monto);
    }
  }

  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    var m = String(v.metodoPago || '');
    if (m === 'Fiado' || m === 'Credito') return;   // no entró dinero aún
    var dia = fechaDiaStr_(v.fecha);
    if (dia.substring(0, 7) !== mes) return;
    sumar(ingresos, m, numero_(v.total), dia);
  });
  dbLeer_(APP.SHEETS.PAGOS_FIADO).forEach(function (p) {
    var dia = fechaDiaStr_(p.fecha);
    if (dia.substring(0, 7) !== mes) return;
    sumar(ingresos, 'Cobranza fiado', numero_(p.monto), dia);
  });
  dbLeer_(APP.SHEETS.CUOTAS).forEach(function (q) {
    if (String(q.estado).toUpperCase() !== 'PAGADA' || !q.pagadoAt) return;
    var dia = fechaDiaStr_(q.pagadoAt);
    if (dia.substring(0, 7) !== mes) return;
    sumar(ingresos, 'Cobranza crédito', numero_(q.monto) - numero_(q.saldo) >= 0 ? numero_(q.monto) : numero_(q.monto), dia);
  });
  dbLeer_(APP.SHEETS.GASTOS).forEach(function (g) {
    if (String(g.estado).toUpperCase() !== 'ACTIVO') return;
    var dia = fechaDiaStr_(g.fecha);
    if (dia.substring(0, 7) !== mes) return;
    sumar(egresos, String(g.categoria || 'Otros'), numero_(g.monto), dia);
  });

  var totalIngresos = 0, totalEgresos = 0;
  Object.keys(ingresos).forEach(function (k) { totalIngresos = redondear_(totalIngresos + ingresos[k]); });
  Object.keys(egresos).forEach(function (k) { totalEgresos = redondear_(totalEgresos + egresos[k]); });

  var seriesDias = Object.keys(porDia).sort().map(function (d) {
    return { dia: d, ingresos: porDia[d].ingresos || 0, egresos: porDia[d].egresos || 0, saldo: redondear_((porDia[d].ingresos || 0) - (porDia[d].egresos || 0)) };
  });

  return appOk_({
    mes: mes, moneda: cfg.MONEDA_SIMBOLO || 'S/',
    ingresosPorMetodo: ingresos, egresosPorCategoria: egresos,
    totalIngresos: totalIngresos, totalEgresos: totalEgresos,
    saldo: redondear_(totalIngresos - totalEgresos),
    seriesDias: seriesDias,
    tcUsd: numero_(cfg.TC_USD), tcFecha: String(cfg.TC_FECHA || '')
  });
}

/* ==================== Presupuesto mensual ==================== */

function presupuestoList_(c) {
  requiereSesion_(c);
  var mes = String(c.mes || '').trim() || fechaDiaStr_(fechaNow_()).substring(0, 7);
  return appOk_(dbLeer_(APP.SHEETS.PRESUPUESTO).filter(function (p) { return String(p.mes) === mes; }));
}

function presupuestoSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'gastos:manage');
  var it = c.item || {};
  var mes = String(it.mes || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ApiError_('Mes inválido (YYYY-MM).', 'VALIDATION');
  if (!String(it.categoria || '').trim()) throw new ApiError_('Categoría obligatoria.', 'VALIDATION');
  var filas = dbLeer_(APP.SHEETS.PRESUPUESTO);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].mes) === mes && String(filas[i].categoria) === String(it.categoria)) {
      dbActualizar_(APP.SHEETS.PRESUPUESTO, filas[i].id, { monto: redondear_(numero_(it.monto)) });
      return appOk_({ id: filas[i].id, actualizado: true });
    }
  }
  var id = dbSiguienteId_(APP.SHEETS.PRESUPUESTO, 'PRE-', 5);
  dbInsertar_(APP.SHEETS.PRESUPUESTO, { id: id, mes: mes, categoria: it.categoria, monto: redondear_(numero_(it.monto)), actualizadoAt: fechaNow_() });
  return appOk_({ id: id, creado: true });
}

/** Presupuesto vs real del mes por categoría de gasto + punto de equilibrio. */
function presupuestoResumen_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  var mes = String(c.mes || '').trim() || fechaDiaStr_(fechaNow_()).substring(0, 7);
  var pres = {};
  dbLeer_(APP.SHEETS.PRESUPUESTO).forEach(function (p) {
    if (String(p.mes) !== mes) return;
    pres[String(p.categoria)] = numero_(p.monto);
  });
  var real = {};
  var gastosFijos = 0, totalGastos = 0, totalIngresos = 0, costoVentas = 0;
  dbLeer_(APP.SHEETS.GASTOS).forEach(function (g) {
    if (String(g.estado).toUpperCase() !== 'ACTIVO') return;
    if (String(g.fecha).substring(0, 7) !== mes) return;
    var cat = String(g.categoria || 'Otros');
    real[cat] = redondear_((real[cat] || 0) + numero_(g.monto));
    totalGastos = redondear_(totalGastos + numero_(g.monto));
  });
  dbLeer_(APP.SHEETS.GASTOS_CATEGORIAS).forEach(function (cat) {
    if (String(cat.tipo) === 'COSTO_FIJO') gastosFijos = redondear_(gastosFijos + (real[String(cat.nombre)] || 0));
  });
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    if (String(v.fecha).substring(0, 7) !== mes) return;
    totalIngresos = redondear_(totalIngresos + numero_(v.total));
  });
  dbLeer_(APP.SHEETS.VENTA_DETALLE).forEach(function (d) {
    var v = null;
    if (!d.ventaId) return;
    totalVentasCache_ = totalVentasCache_ || dbLeer_(APP.SHEETS.VENTAS);
    for (var i = 0; i < totalVentasCache_.length; i++) {
      if (String(totalVentasCache_[i].id) === String(d.ventaId)) { v = totalVentasCache_[i]; break; }
    }
    if (!v || String(v.fecha).substring(0, 7) !== mes || String(v.estado).toUpperCase() !== 'EMITIDA') return;
    costoVentas = redondear_(costoVentas + numero_(d.cantidad) * numero_(d.costoUnit));
  });
  var margenBruto = redondear_(totalIngresos - costoVentas);
  var pctMargen = totalIngresos > 0 ? redondear_((margenBruto / totalIngresos) * 100, 1) : 0;
  var filas = Object.keys(pres).map(function (cat) {
    return { categoria: cat, presupuesto: pres[cat], real: real[cat] || 0, desvio: redondear_((real[cat] || 0) - pres[cat]) };
  });
  Object.keys(real).forEach(function (cat) {
    if (pres[cat] === undefined) filas.push({ categoria: cat, presupuesto: 0, real: real[cat], desvio: real[cat] });
  });
  return appOk_({
    mes: mes, moneda: cfg.MONEDA_SIMBOLO || 'S/', filas: filas,
    totalIngresos: totalIngresos, costoVentas: costoVentas, margenBruto: margenBruto, pctMargen: pctMargen,
    gastosFijos: gastosFijos, totalGastos: totalGastos,
    puntoEquilibrio: pctMargen > 0 ? redondear_(gastosFijos / (pctMargen / 100)) : 0,
    resultado: redondear_(margenBruto - totalGastos)
  });
}
var totalVentasCache_ = null;
