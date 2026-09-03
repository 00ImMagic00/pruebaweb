/**
 * ================================================================
 * NexoERP — 07_Dashboard.gs
 * KPIs, series temporales, alertas y resumen ejecutivo del dashboard.
 * ================================================================
 */

function dashboardGet_(c) {
  requiereSesion_(c);

  var productos = dbLeer_(APP.SHEETS.PRODUCTOS);
  var stock = dbLeer_(APP.SHEETS.STOCK);
  var movimientos = dbLeer_(APP.SHEETS.MOVIMIENTOS);

  var prods = {};
  productos.forEach(function (p) { prods[p.id] = p; });
  var alms = {};
  dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a; });

  /* --- KPIs --- */
  var valorInventario = 0;
  var filasCritico = [];
  var filasStock = [];
  var hoy = fechaDiaStr_(fechaNow_());
  var movHoy = 0;

  stock.forEach(function (s) {
    var p = prods[s.productoId];
    if (!p || String(p.estado).toUpperCase() !== 'ACTIVO') return;
    var cant = numero_(s.cantidad);
    var costo = numero_(p.costoStd);
    valorInventario += cant * costo;
    var fila = {
      productoId: p.id, sku: p.sku, producto: p.nombre, unidad: p.unidad,
      almacenId: s.almacenId, almacen: alms[s.almacenId] ? alms[s.almacenId].nombre : s.almacenId,
      cantidad: cant, stockMin: numero_(p.stockMin), costoStd: costo,
      valor: redondear_(cant * costo)
    };
    filasStock.push(fila);
    if (numero_(p.stockMin) > 0 && cant <= numero_(p.stockMin)) filasCritico.push(fila);
  });

  movimientos.forEach(function (m) {
    if (fechaDiaStr_(m.fecha) === hoy && String(m.estado).toUpperCase() !== 'ANULADO') movHoy++;
  });

  /* --- Serie últimos 14 días: entradas vs salidas --- */
  var dias = 14;
  var serieDias = [];
  var mapaSerie = {};
  for (var i = dias - 1; i >= 0; i--) {
    var d = new Date(fechaDiaStr_(fechaNow_()).getTime() - i * 86400000);
    var clave = fechaDiaStr_(d);
    mapaSerie[clave] = { fecha: clave, etiqueta: Utilities.formatDate(d, APP.TZ, 'dd MMM'), entradas: 0, salidas: 0 };
    serieDias.push(mapaSerie[clave]);
  }
  movimientos.forEach(function (m) {
    if (String(m.estado).toUpperCase() === 'ANULADO') return;
    var clave = fechaDiaStr_(m.fecha);
    if (!mapaSerie[clave]) return;
    if (m.tipo === 'ENTRADA' || m.tipo === 'DEVOLUCION' || m.tipo === 'AJUSTE_POSITIVO') mapaSerie[clave].entradas++;
    else mapaSerie[clave].salidas++;
  });

  /* --- Valor de inventario por categoría --- */
  var porCategoria = {};
  filasStock.forEach(function (f) {
    var cat = (prods[f.productoId] || {}).categoria || 'General';
    if (!porCategoria[cat]) porCategoria[cat] = 0;
    porCategoria[cat] += f.valor;
  });
  var categoriasChart = Object.keys(porCategoria).map(function (k) {
    return { categoria: k, valor: redondear_(porCategoria[k]) };
  }).sort(function (a, b) { return b.valor - a.valor; });

  /* --- Últimos movimientos --- */
  var ultimos = movimientos
    .filter(function (m) { return String(m.estado).toUpperCase() !== 'ANULADO'; })
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); })
    .slice(0, 8)
    .map(function (m) {
      var p = prods[m.productoId] || {};
      return {
        id: m.id, fecha: fechaStr_(m.fecha), tipo: m.tipo,
        producto: p.nombre || m.productoId, cantidad: numero_(m.cantidad), unidad: p.unidad || '',
        usuario: m.usuario, documentoRef: m.documentoRef
      };
    });

  /* --- Top 5 productos por salidas del mes en curso --- */
  var mes = Utilities.formatDate(fechaNow_(), APP.TZ, 'yyyy-MM');
  var conteoSalidas = {};
  movimientos.forEach(function (m) {
    if (String(m.estado).toUpperCase() === 'ANULADO') return;
    if (Utilities.formatDate(m.fecha, APP.TZ, 'yyyy-MM') !== mes) return;
    if (m.tipo !== 'SALIDA' && m.tipo !== 'AJUSTE_NEGATIVO' && m.tipo !== 'TRANSFERENCIA') return;
    if (!conteoSalidas[m.productoId]) conteoSalidas[m.productoId] = { productoId: m.productoId, cantidad: 0 };
    conteoSalidas[m.productoId].cantidad += numero_(m.cantidad);
  });
  var topSalidas = Object.keys(conteoSalidas).map(function (k) {
    var p = prods[k] || {};
    return { producto: p.nombre || k, cantidad: redondear_(conteoSalidas[k].cantidad), unidad: p.unidad || '' };
  }).sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 5);

  /* --- Alertas de vencimiento --- */
  var cfg = configLeer_();
  var diasAlerta = entero_(cfg.DIAS_ALERTA_VENCIMIENTO, 30);
  var hoyMs = new Date(hoy).getTime();
  var vencimientosProximos = [];
  dbLeer_(APP.SHEETS.LOTES).forEach(function (l) {
    if (numero_(l.cantidad) <= 0) return;
    var venc = l.fechaVencimiento ? fechaDiaStr_(l.fechaVencimiento) : '';
    if (!venc) return;
    var dias = Math.round((new Date(venc).getTime() - hoyMs) / 86400000);
    if (dias <= diasAlerta) {
      var p = prods[l.productoId] || {};
      vencimientosProximos.push({
        lote: l.lote, producto: p.nombre || l.productoId, almacen: alms[l.almacenId] ? alms[l.almacenId].nombre : l.almacenId,
        fechaVencimiento: venc, diasRestantes: dias, cantidad: numero_(l.cantidad)
      });
    }
  });
  vencimientosProximos.sort(function (a, b) { return a.diasRestantes - b.diasRestantes; });

  /* --- Adenda: KPIs de ventas y caja del día --- */
  var hoyDia = fechaDiaStr_(fechaNow_());
  var ventasHoyN = 0, ventasHoyTotal = 0, ventasPorMetodo = {};
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    if (fechaDiaStr_(v.fecha) !== hoyDia) return;
    ventasHoyN++;
    ventasHoyTotal += numero_(v.total);
    var m = v.metodoPago || 'Efectivo';
    ventasPorMetodo[m] = redondear_((ventasPorMetodo[m] || 0) + numero_(v.total));
  });
  var cajaAbierta = dbLeer_(APP.SHEETS.CAJA).some(function (f) { return String(f.estado).toUpperCase() === 'ABIERTA'; });

  return appOk_({
    kpis: {
      valorInventario: redondear_(valorInventario),
      productosActivos: productos.filter(function (p) { return String(p.estado).toUpperCase() === 'ACTIVO'; }).length,
      stockCritico: filasCritico.length,
      movimientosHoy: movHoy,
      lotesPorVencer: vencimientosProximos.length,
      moneda: cfg.MONEDA_SIMBOLO,
      /* Adenda */
      ventasHoyN: ventasHoyN,
      ventasHoyTotal: redondear_(ventasHoyTotal),
      cajaAbierta: cajaAbierta,
      metodoPagoDefault: cfg.METODO_PAGO_DEFAULT || 'Efectivo'
    },
    serieMovimientos: serieDias,
    valorPorCategoria: categoriasChart,
    stockCritico: filasCritico.sort(function (a, b) { return a.cantidad - b.cantidad; }).slice(0, 10),
    ultimosMovimientos: ultimos,
    topSalidas: topSalidas,
    vencimientos: vencimientosProximos.slice(0, 10),
    generado: fechaStr_(fechaNow_())
  });
}
