/**
 * ================================================================
 * NexoERP — 14_Analitica.gs  (ADENDA 1.3)
 * Analítica de negocio sobre las ventas del POS:
 *   · ventasAnalitica_       → dashboard comparativo (métodos de pago,
 *     horas pico, días de la semana, comparación con el período anterior,
 *     top productos/clientes).
 *   · rentabilidadProducto_  → margen bruto REAL por producto usando el
 *     costo registrado en cada línea de venta (VentaDetalle.costoUnit,
 *     tomado del kardex al momento de la salida).
 *   · panelControl_          → panel de control interno: KPIs, alertas de
 *     anomalías (anulaciones, autorizaciones, ventas fuera de horario,
 *     diferencias de caja, fiados vencidos) y auditoría reciente.
 * ================================================================
 */

/* ------------------------- Utilidades internas ------------------------- */

var DIAS_SEMANA_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
var MESES_CORTOS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Ventas EMITIDAS entre dos fechas (inclusivo, comparación por día). */
function ventasEntre_(desde, hasta) {
  return dbLeer_(APP.SHEETS.VENTAS).filter(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return false;
    var dia = fechaDiaStr_(v.fecha);
    return dia >= desde && dia <= hasta;
  });
}

/** Índice de costo por producto (fallback costoStd para líneas antiguas). */
function mapaCostosProducto_() {
  var mapa = {};
  dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) {
    mapa[String(p.id)] = { costo: numero_(p.costoStd), sku: p.sku, nombre: p.nombre, categoria: p.categoria, precioVenta: numero_(p.precioVenta) };
  });
  return mapa;
}

/** Costo efectivo de una línea de venta (0/ausente → costo estándar). */
function costoLinea_(d, costos) {
  var ref = costos[String(d.productoId)] || {};
  var cu = numero_(d.costoUnit, -1);
  return cu >= 0 ? cu : numero_(ref.costo);
}

function restarDias_(diaISO, n) {
  var d = new Date(diaISO + 'T12:00:00');
  d = new Date(d.getTime() - n * 86400000);
  return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd');
}

/* ---------------------- Dashboard comparativo ---------------------- */

function ventasAnalitica_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();

  var hoy = fechaDiaStr_(fechaNow_());
  var desde = c.fechaDesde ? fechaDiaStr_(new Date(c.fechaDesde)) : hoy.slice(0, 8) + '01';
  var hasta = c.fechaHasta ? fechaDiaStr_(new Date(c.fechaHasta)) : hoy;
  if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }

  var dias = Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000) + 1;
  var prevHasta = restarDias_(desde, 1);
  var prevDesde = restarDias_(desde, dias);

  var ventas = ventasEntre_(desde, hasta);
  var ventasPrev = ventasEntre_(prevDesde, prevHasta);

  /* --- KPIs del período + comparativo vs período anterior equivalente --- */
  var total = 0, nVentas = ventas.length;
  ventas.forEach(function (v) { total += numero_(v.total); });
  var prevTotal = 0;
  ventasPrev.forEach(function (v) { prevTotal += numero_(v.total); });
  var deltaTotalPct = prevTotal > 0 ? redondear_((total - prevTotal) / prevTotal * 100, 1) : null;
  var deltaNPct = ventasPrev.length > 0 ? redondear_((nVentas - ventasPrev.length) / ventasPrev.length * 100, 1) : null;

  /* --- Desglose de detalle (margen estimado, descuentos, regalos) --- */
  var idsValidas = {};
  ventas.forEach(function (v) { idsValidas[String(v.id)] = true; });
  var costos = mapaCostosProducto_();
  var margen = 0, ingresos = 0, costoTotal = 0, descuentos = 0;
  var nRegalos = 0, costoRegalos = 0;
  dbLeer_(APP.SHEETS.VENTA_DETALLE).forEach(function (d) {
    if (!idsValidas[String(d.ventaId)]) return;
    var cant = numero_(d.cantidad);
    var sub = numero_(d.subtotal);
    var costo = costoLinea_(d, costos) * cant;
    ingresos += sub;
    costoTotal += costo;
    if (String(d.esRegalo || 'No').toUpperCase() === 'SÍ' || String(d.esRegalo || 'No').toUpperCase() === 'SI') {
      nRegalos++; costoRegalos += costo;
    }
    margen += sub - costo;
  });
  ventas.forEach(function (v) { descuentos += numero_(v.descuentoTotal); });

  /* --- Por método de pago (donut) --- */
  var porMetodo = {};
  ventas.forEach(function (v) {
    var m = v.metodoPago || 'Efectivo';
    if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
    porMetodo[m].n++;
    porMetodo[m].total = redondear_(porMetodo[m].total + numero_(v.total));
  });
  var metodos = Object.keys(porMetodo).map(function (k) { return porMetodo[k]; }).sort(function (a, b) { return b.total - a.total; });
  var metodoLider = metodos.length ? {
    metodo: metodos[0].metodo, total: metodos[0].total,
    pct: total > 0 ? redondear_(metodos[0].total / total * 100, 1) : 0
  } : null;

  /* --- Por hora del día (0–23) --- */
  var porHora = [];
  for (var h = 0; h < 24; h++) porHora.push({ hora: h, n: 0, total: 0 });
  ventas.forEach(function (v) {
    var fechaStr = fechaStr_(v.fecha);
    var hora = parseInt(fechaStr.substring(11, 13), 10);
    if (isNaN(hora) || hora < 0 || hora > 23) return;
    porHora[hora].n++;
    porHora[hora].total = redondear_(porHora[hora].total + numero_(v.total));
  });
  var horaPico = null;
  porHora.forEach(function (p) {
    if (p.total > 0 && (!horaPico || p.total > horaPico.total)) horaPico = { hora: p.hora, total: p.total, n: p.n };
  });

  /* --- Por día de la semana (Lunes..Domingo) --- */
  var porSemana = [];
  for (var s = 0; s < 7; s++) porSemana.push({ indice: s, dia: DIAS_SEMANA_ES[s], n: 0, total: 0 });
  ventas.forEach(function (v) {
    var d = new Date(fechaDiaStr_(v.fecha) + 'T12:00:00');
    var js = d.getDay();              // 0 = Domingo
    var idx = (js + 6) % 7;           // 0 = Lunes
    porSemana[idx].n++;
    porSemana[idx].total = redondear_(porSemana[idx].total + numero_(v.total));
  });
  var peorDia = null;
  porSemana.forEach(function (p) {
    if (!peorDia || p.total < peorDia.total) peorDia = { dia: p.dia, total: p.total, n: p.n };
  });

  /* --- Serie diaria del período --- */
  var mapaSerie = {};
  var serieDiaria = [];
  for (var i = 0; i < dias; i++) {
    var clave = restarDias_(desde, -i);
    var f = new Date(clave + 'T12:00:00');
    var fila = { fecha: clave, etiqueta: f.getDate() + ' ' + MESES_CORTOS_ES[f.getMonth()], total: 0, n: 0 };
    mapaSerie[clave] = fila;
    serieDiaria.push(fila);
  }
  ventas.forEach(function (v) {
    var f = mapaSerie[fechaDiaStr_(v.fecha)];
    if (!f) return;
    f.total = redondear_(f.total + numero_(v.total));
    f.n++;
  });

  /* --- Top productos y clientes --- */
  var porProducto = {};
  dbLeer_(APP.SHEETS.VENTA_DETALLE).forEach(function (d) {
    if (!idsValidas[String(d.ventaId)]) return;
    var k = String(d.productoId);
    if (!porProducto[k]) porProducto[k] = { productoId: d.productoId, sku: d.sku, descripcion: d.descripcion, cantidad: 0, total: 0, margen: 0 };
    var costo = costoLinea_(d, costos) * numero_(d.cantidad);
    porProducto[k].cantidad += numero_(d.cantidad);
    porProducto[k].total += numero_(d.subtotal);
    porProducto[k].margen += numero_(d.subtotal) - costo;
  });
  var topProductos = Object.keys(porProducto).map(function (k) {
    var p = porProducto[k];
    return { productoId: k, sku: p.sku, descripcion: p.descripcion, cantidad: redondear_(p.cantidad), total: redondear_(p.total), margen: redondear_(p.margen) };
  }).sort(function (a, b) { return b.total - a.total; }).slice(0, 8);

  var porCliente = {};
  ventas.forEach(function (v) {
    var k = String(v.clienteNombre || 'Público General');
    if (!porCliente[k]) porCliente[k] = { nombre: k, n: 0, total: 0 };
    porCliente[k].n++;
    porCliente[k].total = redondear_(porCliente[k].total + numero_(v.total));
  });
  var topClientes = Object.keys(porCliente).map(function (k) { return porCliente[k]; })
    .sort(function (a, b) { return b.total - a.total; }).slice(0, 8);

  /* --- Fiado pendiente global (para la tarjeta del dashboard) --- */
  var fiadoPendiente = 0, fiadoClientes = 0;
  dbLeer_(APP.SHEETS.CLIENTES).forEach(function (cli) {
    var saldo = numero_(cli.saldoFiado);
    if (saldo > 0.004) { fiadoPendiente = redondear_(fiadoPendiente + saldo); fiadoClientes++; }
  });

  return appOk_({
    desde: desde, hasta: hasta, dias: dias,
    prevDesde: prevDesde, prevHasta: prevHasta,
    moneda: cfg.MONEDA_SIMBOLO || 'S/',
    kpis: {
      total: redondear_(total), nVentas: nVentas,
      ticketPromedio: nVentas ? redondear_(total / nVentas) : 0,
      margen: redondear_(margen), margenPct: ingresos > 0 ? redondear_(margen / ingresos * 100, 1) : 0,
      ingresos: redondear_(ingresos), costo: redondear_(costoTotal),
      deltaTotalPct: deltaTotalPct, deltaNPct: deltaNPct,
      prevTotal: redondear_(prevTotal), prevN: ventasPrev.length,
      descuentos: redondear_(descuentos),
      nRegalos: nRegalos, costoRegalos: redondear_(costoRegalos),
      fiadoPendiente: fiadoPendiente, fiadoClientes: fiadoClientes
    },
    porMetodo: metodos,
    porHora: porHora,
    porDiaSemana: porSemana,
    serieDiaria: serieDiaria,
    topProductos: topProductos,
    topClientes: topClientes,
    horaPico: horaPico,
    peorDia: peorDia,
    metodoLider: metodoLider
  });
}

/* ---------------------- Rentabilidad real por producto ---------------------- */

/**
 * Margen bruto REAL por producto en un rango de fechas. El costo de cada
 * línea es el registrado en VentaDetalle.costoUnit (kardex al momento de
 * la salida); para filas antiguas sin costo se usa el costo estándar.
 * Los regalos cuentan como costo puro (ingresos 0).
 */
function rentabilidadProducto_(c) {
  var ses = requiereSesion_(c);
  /* Seguridad v1.5.1: expone costos y márgenes reales — solo admin/gerente. */
  requierePermiso_(ses, 'panel:read');
  var cfg = configLeer_();
  var hoy = fechaDiaStr_(fechaNow_());

  var desde = c.fechaDesde ? fechaDiaStr_(new Date(c.fechaDesde)) : hoy.slice(0, 8) + '01';
  var hasta = c.fechaHasta ? fechaDiaStr_(new Date(c.fechaHasta)) : hoy;
  if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }

  var ventas = ventasEntre_(desde, hasta);
  var idsValidas = {};
  ventas.forEach(function (v) { idsValidas[String(v.id)] = true; });
  var costos = mapaCostosProducto_();

  var porProducto = {};
  dbLeer_(APP.SHEETS.VENTA_DETALLE).forEach(function (d) {
    if (!idsValidas[String(d.ventaId)]) return;
    var k = String(d.productoId);
    if (!porProducto[k]) {
      var ref = costos[k] || {};
      porProducto[k] = {
        productoId: d.productoId, sku: d.sku || ref.sku || '', descripcion: d.descripcion || ref.nombre || k,
        categoria: ref.categoria || 'General',
        cantVendida: 0, cantRegalada: 0, ingresos: 0, costo: 0,
        precioActual: numero_(ref.precioVenta), costoActual: numero_(ref.costo)
      };
    }
    var cant = numero_(d.cantidad);
    var costo = costoLinea_(d, costos) * cant;
    porProducto[k].costo = redondear_(porProducto[k].costo + costo);
    var esRegalo = String(d.esRegalo || 'No').toUpperCase() === 'SÍ' || String(d.esRegalo || 'No').toUpperCase() === 'SI';
    if (esRegalo) {
      porProducto[k].cantRegalada = redondear_(porProducto[k].cantRegalada + cant);
    } else {
      porProducto[k].cantVendida = redondear_(porProducto[k].cantVendida + cant);
      porProducto[k].ingresos = redondear_(porProducto[k].ingresos + numero_(d.subtotal));
    }
  });

  var filas = Object.keys(porProducto).map(function (k) {
    var p = porProducto[k];
    p.margen = redondear_(p.ingresos - p.costo);
    p.margenPct = p.ingresos > 0 ? redondear_(p.margen / p.ingresos * 100, 1) : (p.margen < 0 ? -100 : 0);
    return p;
  });

  var totales = { ingresos: 0, costo: 0, margen: 0, cantVendida: 0, cantRegalada: 0 };
  filas.forEach(function (f) {
    totales.ingresos += f.ingresos; totales.costo += f.costo;
    totales.margen += f.margen; totales.cantVendida += f.cantVendida; totales.cantRegalada += f.cantRegalada;
  });
  totales.ingresos = redondear_(totales.ingresos); totales.costo = redondear_(totales.costo);
  totales.margen = redondear_(totales.margen);
  totales.cantVendida = redondear_(totales.cantVendida); totales.cantRegalada = redondear_(totales.cantRegalada);
  totales.margenPct = totales.ingresos > 0 ? redondear_(totales.margen / totales.ingresos * 100, 1) : 0;

  filas.sort(function (a, b) { return b.margen - a.margen; });

  return appOk_({
    desde: desde, hasta: hasta, moneda: cfg.MONEDA_SIMBOLO || 'S/',
    filas: filas,
    totales: totales,
    sinCosto: filas.filter(function (f) { return f.costo <= 0 && f.cantVendida + f.cantRegalada > 0; }).length
  });
}

/* ---------------------- Panel de control interno ---------------------- */

function panelControl_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'panel:read');
  var cfg = configLeer_();

  var hoy = fechaDiaStr_(fechaNow_());
  var mes = hoy.slice(0, 7);
  var horarioInicio = String(cfg.HORARIO_INICIO || '');
  var horarioFin = String(cfg.HORARIO_FIN || '');

  var alertas = [];
  var ventasMes = 0, ingresosMes = 0, descuentosMes = 0, anuladasMes = 0, fueraHorarioMes = 0;
  var ventasHoy = 0, ventasHoyTotal = 0;

  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    var dia = fechaDiaStr_(v.fecha);
    var esMes = dia.slice(0, 7) === mes;
    var estado = String(v.estado).toUpperCase();

    if (estado === 'EMITIDA' && dia === hoy) { ventasHoy++; ventasHoyTotal = redondear_(ventasHoyTotal + numero_(v.total)); }

    if (esMes && estado === 'ANULADA') {
      anuladasMes++;
      alertas.push({ severidad: 'media', tipo: 'ANULACION', texto: 'Boleta ' + v.boleta + ' anulada por ' + v.usuario + '. Motivo: ' + (v.anuladoMotivo || '—'), fecha: fechaStr_(v.fecha) });
    }
    if (esMes && estado === 'EMITIDA') {
      ventasMes++;
      ingresosMes += numero_(v.total);
      descuentosMes += numero_(v.descuentoTotal);
      if (v.autorizadoPor) {
        alertas.push({ severidad: 'info', tipo: 'AUTORIZACION', texto: v.boleta + ': descuento/regalo autorizado por ' + v.autorizadoPor, fecha: fechaStr_(v.fecha) });
      }
      /* Venta fuera del horario de atención configurado. */
      if (horarioInicio && horarioFin) {
        var mins = parseInt(fechaStr_(v.fecha).substring(11, 13), 10) * 60 + parseInt(fechaStr_(v.fecha).substring(14, 16), 10);
        var p = function (s) { var t2 = String(s).split(':'); return (parseInt(t2[0], 10) || 0) * 60 + (parseInt(t2[1], 10) || 0); };
        if (mins < p(horarioInicio) || mins > p(horarioFin)) {
          fueraHorarioMes++;
          alertas.push({ severidad: 'media', tipo: 'HORARIO', texto: v.boleta + ' emitida fuera del horario (' + horarioInicio + '–' + horarioFin + ') por ' + v.usuario, fecha: fechaStr_(v.fecha) });
        }
      }
    }
  });

  /* Fiados críticos (antigüedad mayor a FIADO_DIAS_ALERTA). */
  var diasAlerta = entero_(cfg.FIADO_DIAS_ALERTA, 30);
  var hoyMs = new Date(hoy).getTime();
  var fiadoPendiente = 0, fiadoClientes = 0, fiadoCriticos = 0;
  var nombresCli = {};
  dbLeer_(APP.SHEETS.CLIENTES).forEach(function (cli) { nombresCli[String(cli.id)] = cli.razonSocial; });
  var fiadoMasAntiguo = {};
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    if (String(v.estadoPago || (String(v.metodoPago) === 'Fiado' ? 'FIADO' : 'PAGADO')).toUpperCase() !== 'FIADO') return;
    var cliId = String(v.clienteId || '');
    if (!cliId) return;
    var dias = Math.round((hoyMs - new Date(fechaDiaStr_(v.fecha)).getTime()) / 86400000);
    if (!fiadoMasAntiguo[cliId] || dias > fiadoMasAntiguo[cliId].dias) {
      fiadoMasAntiguo[cliId] = { dias: dias, boleta: v.boleta, total: numero_(v.total) };
    }
  });
  dbLeer_(APP.SHEETS.CLIENTES).forEach(function (cli) {
    var saldo = numero_(cli.saldoFiado);
    if (saldo > 0.004) { fiadoPendiente = redondear_(fiadoPendiente + saldo); fiadoClientes++; }
  });
  Object.keys(fiadoMasAntiguo).forEach(function (cliId) {
    var info = fiadoMasAntiguo[cliId];
    if (info.dias > diasAlerta) {
      fiadoCriticos++;
      alertas.push({ severidad: 'alta', tipo: 'FIADO', texto: 'Fiado vencido (' + info.dias + ' días): ' + (nombresCli[cliId] || cliId) + ' — ' + cfg.MONEDA_SIMBOLO + ' ' + info.total.toFixed(2) + ' (' + info.boleta + ')', fecha: '' });
    }
  });

  /* Cierres de caja con diferencia distinta de cero (últimos 30 días). */
  var diferenciasCaja = 0;
  var limite30 = restarDias_(hoy, 30);
  dbLeer_(APP.SHEETS.CAJA).forEach(function (f) {
    if (String(f.estado).toUpperCase() !== 'CERRADA') return;
    var dia = fechaDiaStr_(f.fecha);
    if (dia < limite30) return;
    var dif = numero_(f.diferencia);
    if (Math.abs(dif) > 0.004) {
      diferenciasCaja++;
      alertas.push({ severidad: 'alta', tipo: 'CAJA', texto: 'Caja ' + f.id + ' (' + dia + ') cerrada con diferencia de ' + cfg.MONEDA_SIMBOLO + ' ' + dif.toFixed(2) + ' — cajero: ' + f.usuario, fecha: fechaStr_(f.cierreAt) });
    }
  });

  /* Stock crítico + usuarios + cotizaciones vigentes. */
  var prods = {};
  dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) { prods[p.id] = p; });
  var criticos = [];
  dbLeer_(APP.SHEETS.STOCK).forEach(function (s) {
    var p = prods[s.productoId];
    if (!p || String(p.estado).toUpperCase() !== 'ACTIVO') return;
    if (numero_(p.stockMin) > 0 && numero_(s.cantidad) <= numero_(p.stockMin)) {
      criticos.push(p.nombre + ' (' + numero_(s.cantidad) + ' ' + p.unidad + ', mín ' + numero_(p.stockMin) + ')');
    }
  });
  if (criticos.length) {
    alertas.push({ severidad: 'media', tipo: 'STOCK', texto: criticos.length + ' producto(s) en nivel crítico: ' + criticos.slice(0, 3).join('; ') + (criticos.length > 3 ? '…' : ''), fecha: '' });
  }
  var usuariosActivos = dbLeer_(APP.SHEETS.USUARIOS).filter(function (u) { return String(u.estado).toUpperCase() === 'ACTIVO'; }).length;
  var cotizacionesVigentes = dbLeer_(APP.SHEETS.COTIZACIONES).filter(function (x) { return String(x.estado).toUpperCase() === 'VIGENTE'; }).length;

  /* Auditoría reciente (8 últimas acciones). */
  var auditoria = dbLeer_(APP.SHEETS.AUDITORIA)
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); })
    .slice(0, 8)
    .map(function (a) { return { fecha: fechaStr_(a.fecha), usuario: a.usuario, accion: a.accion, detalle: a.detalle }; });

  var ordenSev = { alta: 0, media: 1, info: 2 };
  alertas.sort(function (a, b) { return (ordenSev[a.severidad] - ordenSev[b.severidad]) || String(b.fecha).localeCompare(String(a.fecha)); });

  return appOk_({
    moneda: cfg.MONEDA_SIMBOLO || 'S/',
    generado: fechaStr_(fechaNow_()),
    kpis: {
      ventasHoyTotal: ventasHoyTotal, ventasHoyN: ventasHoy,
      ingresosMes: redondear_(ingresosMes), ventasMes: ventasMes,
      descuentosMes: redondear_(descuentosMes),
      anuladasMes: anuladasMes, fueraHorarioMes: fueraHorarioMes,
      diferenciasCaja: diferenciasCaja,
      fiadoPendiente: fiadoPendiente || 0, fiadoClientes: fiadoClientes, fiadoCriticos: fiadoCriticos,
      productosCriticos: criticos.length,
      usuariosActivos: usuariosActivos, cotizacionesVigentes: cotizacionesVigentes
    },
    alertas: alertas.slice(0, 40),
    auditoria: auditoria
  });
}

/* ==================== Adenda 1.6: ABC, muertos y rotación ==================== */

/**
 * Curva ABC de Pareto de productos por ingresos del período.
 * A = 80% de los ingresos, B = siguiente 15%, C = último 5%.
 */
function analiticaAbc_(c) {
  requiereSesion_(c);
  var desde = String(c.desde || ''), hasta = String(c.hasta || '');
  var filas = dbLeer_(APP.SHEETS.VENTA_DETALLE);
  var ventasIdx = {};
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    var dia = fechaDiaStr_(v.fecha);
    if (desde && dia < desde) return;
    if (hasta && dia > hasta) return;
    ventasIdx[String(v.id)] = true;
  });
  var porProducto = {};
  filas.forEach(function (d) {
    if (!ventasIdx[String(d.ventaId)]) return;
    var k = String(d.sku || d.productoId);
    if (!porProducto[k]) porProducto[k] = { sku: d.sku, nombre: d.descripcion, ingresos: 0, unidades: 0, n: 0 };
    porProducto[k].ingresos = redondear_(porProducto[k].ingresos + numero_(d.subtotal));
    porProducto[k].unidades = redondear_(porProducto[k].unidades + numero_(d.cantidad));
    porProducto[k].n++;
  });
  var lista = Object.keys(porProducto).map(function (k) { return porProducto[k]; })
    .sort(function (a, b) { return b.ingresos - a.ingresos; });
  var total = 0;
  lista.forEach(function (x) { total += x.ingresos; });
  var acumulado = 0;
  lista.forEach(function (x) {
    var pctTotal = total > 0 ? (x.ingresos / total) * 100 : 0;
    acumulado += pctTotal;
    x.clase = acumulado <= 80 ? 'A' : (acumulado <= 95 ? 'B' : 'C');
    x.pctIngresos = redondear_(pctTotal, 2);
    x.pctAcumulado = redondear_(Math.min(100, acumulado), 2);
  });
  return appOk_({ total: redondear_(total), productos: lista });
}

/** Productos muertos: sin ventas en los últimos N días (default 30). */
function analiticaMuertos_(c) {
  requiereSesion_(c);
  var dias = Math.max(7, entero_(c.dias, 30) || 30);
  var limite = Date.now() - dias * 86400000;
  var vendidos = {};
  dbLeer_(APP.SHEETS.VENTA_DETALLE).forEach(function (d) { vendidos[String(d.productoId)] = true; });
  var fechasVenta = {};
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    fechasVenta[String(v.id)] = new Date(fechaDiaStr_(v.fecha) + 'T12:00:00').getTime();
  });
  var ultimaVentaPorProducto = {};
  dbLeer_(APP.SHEETS.VENTA_DETALLE).forEach(function (d) {
    var t = fechasVenta[String(d.ventaId)];
    if (!t || t < limite) return;
    var k = String(d.productoId);
    if (!ultimaVentaPorProducto[k] || t > ultimaVentaPorProducto[k]) ultimaVentaPorProducto[k] = t;
  });
  var stock = dbLeer_(APP.SHEETS.STOCK);
  var totalPorProd = {};
  stock.forEach(function (s) { totalPorProd[String(s.productoId)] = (totalPorProd[String(s.productoId)] || 0) + numero_(s.cantidad); });
  var muertos = [];
  dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) {
    if (String(p.estado).toUpperCase() !== 'ACTIVO') return;
    var t = ultimaVentaPorProducto[String(p.id)];
    if (t) return; // tuvo ventas recientes
    var sinVentasNunca = !vendidos[String(p.id)];
    var saldo = totalPorProd[String(p.id)] || 0;
    if (saldo > 0 || sinVentasNunca) {
      muertos.push({
        productoId: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad,
        stock: saldo, costoInmovilizado: redondear_(saldo * numero_(p.costoStd)),
        nuncaVendido: sinVentasNunca
      });
    }
  });
  muertos.sort(function (a, b) { return b.costoInmovilizado - a.costoInmovilizado; });
  return appOk_({ dias: dias, productos: muertos });
}
