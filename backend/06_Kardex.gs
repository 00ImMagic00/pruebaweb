/**
 * ================================================================
 * NexoERP — 06_Kardex.gs
 * Consulta del kardex físico-valorizado por producto y almacén,
 * listado de lotes/vencimientos y reportes.
 * ================================================================
 */

function kardexConsulta_(c) {
  requiereSesion_(c);
  var productoId = String(c.productoId || '');
  if (!productoId) throw new ApiError_('Seleccione un producto para consultar su kardex.', 'VALIDATION');
  var almacenId = String(c.almacenId || '');

  var prod = dbPorId_(APP.SHEETS.PRODUCTOS, productoId);
  if (!prod) throw new ApiError_('Producto no encontrado: ' + productoId, 'NOT_FOUND');

  var alms = {};
  dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a.nombre; });

  var filas = dbLeer_(APP.SHEETS.KARDEX)
    .filter(function (k) {
      return String(k.productoId) === productoId && (!almacenId || String(k.almacenId) === almacenId);
    })
    .sort(function (a, b) {
      var da = new Date(a.fecha).getTime(), dbb = new Date(b.fecha).getTime();
      if (da !== dbb) return da - dbb;
      return String(a.id).localeCompare(String(b.id));
    });

  var out = filas.map(function (k) {
    return {
      id: k.id, fecha: fechaStr_(k.fecha), movimientoId: k.movimientoId, tipo: k.tipo,
      almacenId: k.almacenId, almacen: alms[k.almacenId] || k.almacenId,
      entradaCantidad: numero_(k.entradaCantidad), entradaValor: numero_(k.entradaValor),
      salidaCantidad: numero_(k.salidaCantidad), salidaValor: numero_(k.salidaValor),
      saldoCantidad: numero_(k.saldoCantidad), saldoValor: numero_(k.saldoValor),
      costoPromedio: numero_(k.costoPromedio),
      documentoRef: k.documentoRef, usuario: k.usuario
    };
  });

  var resumen = {
    saldoCantidad: out.length ? out[out.length - 1].saldoCantidad : 0,
    saldoValor: out.length ? out[out.length - 1].saldoValor : 0,
    costoPromedio: out.length ? out[out.length - 1].costoPromedio : 0,
    totalEntradasCantidad: 0, totalSalidasCantidad: 0,
    totalEntradasValor: 0, totalSalidasValor: 0
  };
  out.forEach(function (r) {
    resumen.totalEntradasCantidad += r.entradaCantidad; resumen.totalEntradasValor += r.entradaValor;
    resumen.totalSalidasCantidad += r.salidaCantidad;  resumen.totalSalidasValor += r.salidaValor;
  });

  return appOk_({
    producto: {
      id: prod.id, sku: prod.sku, nombre: prod.nombre, unidad: prod.unidad,
      categoria: prod.categoria, costoStd: numero_(prod.costoStd), precioVenta: numero_(prod.precioVenta)
    },
    filas: out,
    resumen: {
      saldoCantidad: resumen.saldoCantidad, saldoValor: resumen.saldoValor, costoPromedio: resumen.costoPromedio,
      totalEntradasCantidad: redondear_(resumen.totalEntradasCantidad), totalSalidasCantidad: redondear_(resumen.totalSalidasCantidad),
      totalEntradasValor: redondear_(resumen.totalEntradasValor), totalSalidasValor: redondear_(resumen.totalSalidasValor)
    }
  });
}

function lotesList_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  var diasAlerta = entero_(cfg.DIAS_ALERTA_VENCIMIENTO, 30);
  var soloPorVencer = !!c.soloPorVencer;
  var productoId = String(c.productoId || '');
  var almacenId = String(c.almacenId || '');

  var prods = {}; dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) { prods[p.id] = p; });
  var alms = {}; dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a.nombre; });

  var hoyMs = new Date(fechaDiaStr_(fechaNow_())).getTime();
  var limiteMs = hoyMs + diasAlerta * 86400000;

  var out = [];
  dbLeer_(APP.SHEETS.LOTES).forEach(function (l) {
    if (numero_(l.cantidad) <= 0) return;
    if (productoId && String(l.productoId) !== productoId) return;
    if (almacenId && String(l.almacenId) !== almacenId) return;
    var venc = l.fechaVencimiento ? fechaDiaStr_(l.fechaVencimiento) : '';
    var vencMs = venc ? new Date(venc).getTime() : 0;
    var diasRestantes = vencMs ? Math.round((vencMs - hoyMs) / 86400000) : null;
    if (soloPorVencer && !(diasRestantes !== null && diasRestantes <= diasAlerta)) return;
    var p = prods[l.productoId] || {};
    out.push({
      id: l.id, productoId: l.productoId, sku: p.sku || '', productoNombre: p.nombre || l.productoId,
      almacenId: l.almacenId, almacen: alms[l.almacenId] || l.almacenId,
      lote: l.lote, numeroSerie: l.numeroSerie, fechaVencimiento: venc,
      diasRestantes: diasRestantes, cantidad: numero_(l.cantidad), unidad: p.unidad || '',
      estadoLote: diasRestantes === null ? 'SIN_VENCIMIENTO' : (diasRestantes < 0 ? 'VENCIDO' : (diasRestantes <= diasAlerta ? 'POR_VENCER' : 'OK'))
    });
  });

  out.sort(function (a, b) {
    if (a.fechaVencimiento === b.fechaVencimiento) return 0;
    if (!a.fechaVencimiento) return 1;
    if (!b.fechaVencimiento) return -1;
    return a.fechaVencimiento < b.fechaVencimiento ? -1 : 1;
  });

  var resumen = {
    totalLotes: out.length,
    vencidos: out.filter(function (x) { return x.estadoLote === 'VENCIDO'; }).length,
    porVencer: out.filter(function (x) { return x.estadoLote === 'POR_VENCER'; }).length,
    diasAlerta: diasAlerta
  };
  return appOk_({ filas: out, resumen: resumen });
}

function stockList_(c) {
  requiereSesion_(c);
  var q = String(c.q || '').toLowerCase();
  var alm = String(c.almacenId || '');
  var soloCritico = !!c.soloCritico;

  var prods = {}; dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) { prods[p.id] = p; });
  var alms = {}; dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a; });

  var out = [];
  dbLeer_(APP.SHEETS.STOCK).forEach(function (s) {
    var p = prods[s.productoId];
    if (!p || String(p.estado).toUpperCase() !== 'ACTIVO') return;
    var a = alms[s.almacenId];
    var cant = numero_(s.cantidad);
    var costoStd = numero_(p.costoStd);
    var fila = {
      productoId: p.id,
      sku: p.sku || '',
      producto: p.nombre || p.id,
      categoria: p.categoria || '',
      unidad: p.unidad || '',
      almacenId: s.almacenId,
      almacen: a ? a.nombre : s.almacenId,
      cantidad: cant,
      stockMin: numero_(p.stockMin),
      stockMax: numero_(p.stockMax),
      costoStd: costoStd,
      valor: redondear_(cant * costoStd),
      estado: (numero_(p.stockMin) > 0 && cant <= numero_(p.stockMin)) ? 'CRITICO' : 'OK'
    };
    if (q && (fila.producto.toLowerCase().indexOf(q) === -1 && fila.sku.toLowerCase().indexOf(q) === -1)) return;
    if (alm && fila.almacenId !== alm) return;
    if (soloCritico && fila.estado !== 'CRITICO') return;
    out.push(fila);
  });
  out.sort(function (a, b) { return b.valor - a.valor; });
  return appOk_(out);
}

/* ------------------------- REPORTES ------------------------- */

function reporteStock_(c) {
  requiereSesion_(c);
  var almacenId = String(c.almacenId || '');
  var prods = {}; dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) { prods[p.id] = p; });
  var alms = {}; dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a; });

  var filas = [];
  dbLeer_(APP.SHEETS.STOCK).forEach(function (s) {
    var cant = numero_(s.cantidad);
    if (almacenId && String(s.almacenId) !== almacenId) return;
    var p = prods[s.productoId] || {};
    if (!p.id) return;
    var valor = cant * numero_(p.costoStd);
    filas.push({
      productoId: s.productoId, sku: p.sku, producto: p.nombre, categoria: p.categoria, unidad: p.unidad,
      almacenId: s.almacenId, almacen: alms[s.almacenId] ? alms[s.almacenId].nombre : s.almacenId,
      cantidad: cant, stockMin: numero_(p.stockMin), stockMax: numero_(p.stockMax),
      costoStd: numero_(p.costoStd), valorInventario: redondear_(valor),
      estado: (numero_(p.stockMin) > 0 && cant <= numero_(p.stockMin)) ? 'CRITICO' : 'OK'
    });
  });
  filas.sort(function (a, b) { return b.valorInventario - a.valorInventario; });
  var totalValor = 0; filas.forEach(function (f) { totalValor += f.valorInventario; });
  return appOk_({ filas: filas, totalValor: redondear_(totalValor), generado: fechaStr_(fechaNow_()) });
}

function reporteMovimientos_(c) {
  var r = movimientosList_(Object.assign({}, c, { limit: 2000 }));
  return r;
}
