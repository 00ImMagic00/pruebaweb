/**
 * NexoERP — demo-store.js
 * Backend de demostración 100% cliente: implementa el MISMO contrato de
 * acciones y la MISMA lógica de negocio (stock, lotes FEFO, kardex con
 * promedio ponderado, tokens, roles y auditoría) que el backend real de
 * Google Apps Script. Persiste en localStorage.
 */

var DemoStore = (function () {

  var CLAVE = CONFIG_APP.DB_DEMO;
  var db = null;

  /* ============================ UTILIDADES ============================ */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ahoraStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function diaStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function num(v, def) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? (def || 0) : n; }
  function red(n, dec) { var f = Math.pow(10, dec === undefined ? 2 : dec); return Math.round((n + Number.EPSILON) * f) / f; }
  function r4(n) { return red(n, 4); }
  function esSi(v) { return ['SÍ', 'SI', 'YES', 'TRUE', '1'].includes(String(v).trim().toUpperCase()); }

  function siguienteId(prefijo, coleccion, padding) {
    var max = 0;
    db[coleccion].forEach(function (o) {
      var m = String(o.id || '').match(new RegExp('^' + prefijo + '(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var s = String(max + 1); while (s.length < (padding || 4)) s = '0' + s;
    return prefijo + s;
  }

  async function sha256(texto) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch (e) { console.warn('Demo: persistencia falló', e); } }

  /* ============================ CONSTRUCCIÓN ============================ */

  async function construirDB() {
    var s = DEMO_SEED;
    var d = {
      config: Object.assign({}, s.config),
      usuarios: [], sesiones: [], categorias: [], almacenes: [], productos: [],
      stock: [], lotes: [], proveedores: [], clientes: [],
      movimientos: [], kardex: [], auditoria: [],
      /* Adenda: POS, boletas y cuadre de caja */
      numeracion: JSON.parse(JSON.stringify(s.numeracion || [])),
      ventas: [], ventaDetalle: [], caja: [],
      /* Adenda 1.3: fiados y cotizaciones */
      pagosFiado: [], cotizaciones: [], cotizacionDetalle: []
    };

    for (var i = 0; i < s.usuarios.length; i++) {
      var u = s.usuarios[i];
      var salt = Math.random().toString(36).slice(2, 18);
      d.usuarios.push({ id: u.id, usuario: u.usuario, salt: salt, hash: await sha256(salt + u.password), nombre: u.nombre, rol: u.rol, estado: u.estado, ultimoAcceso: '' });
    }
    d.categorias = JSON.parse(JSON.stringify(s.categorias));
    d.almacenes = JSON.parse(JSON.stringify(s.almacenes));
    d.proveedores = JSON.parse(JSON.stringify(s.proveedores));
    d.clientes = JSON.parse(JSON.stringify(s.clientes));

    var skuAId = {};
    s.productos.forEach(function (p, i) {
      var id = 'PRD-' + String(i + 1).padStart(4, '0');
      skuAId[p[0]] = id;
      d.productos.push({
        id: id, sku: p[0], nombre: p[1], descripcion: p[11], categoria: p[2], unidad: p[3],
        costoStd: p[4], precioVenta: p[5], precioMinimo: Math.round(p[5] * 90) / 100, stockMin: p[6], stockMax: p[7],
        requiereLote: p[8], requiereSerie: p[9], perecedero: p[10], estado: 'ACTIVO', creado: ahoraStr()
      });
    });

    // Reproduce los movimientos con el motor real (mismo orden que 09_Setup.gs).
    db = d; // habilita el motor (helpers usan la variable de módulo) durante la construcción
    var todos = s.movimientos.slice().sort(function (a, b) {
      if (a[0] !== b[0]) return b[0] - a[0];
      return String(a[9]).localeCompare(String(b[9]));
    });
    var base = new Date(diaStr(new Date())).getTime();
    for (var j = 0; j < todos.length; j++) {
      var m = todos[j];
      var fechaMov = new Date(base - m[0] * 86400000 + 10 * 3600000 + (j % 40) * 60000);
      var venc = (m[8] !== null && m[8] !== undefined && m[8] !== '') ? diaStr(new Date(fechaMov.getTime() + m[8] * 86400000)) : '';
      var datosMov = {
        tipo: m[1], productoId: skuAId[m[2]], cantidad: m[3], costoUnitario: m[4],
        lote: m[7] || '', numeroSerie: '', fechaVencimiento: venc,
        almacenOrigenId: m[6] || '', almacenDestinoId: m[5] || '',
        documentoRef: m[9] || '', observaciones: 'Carga inicial de demostración',
        motivo: m[1] === 'AJUSTE_NEGATIVO' ? 'Merma por unidades dañadas' : (m[1] === 'AJUSTE_POSITIVO' ? 'Ajuste por conteo físico' : ''),
        fechaOverride: fechaMov.getFullYear() + '-' + pad(fechaMov.getMonth() + 1) + '-' + pad(fechaMov.getDate()) + ' ' + pad(fechaMov.getHours()) + ':' + pad(fechaMov.getMinutes()) + ':00'
      };
      await ejecutarMovimiento(datosMov, { usuarioId: 'SEED', usuario: m[10], rol: 'admin', nombre: m[10] });
    }

    /* Adenda: reconstruye las ventas demo a partir de las salidas "BV-*"
     * (boletas históricas) para que Ventas/Caja queden consistentes.
     * Adenda 1.3: asigna clientes (con teléfono), distribuye horas de venta,
     * deja una boleta FIADA con abono parcial y guarda el costo real por línea. */
    var grupos = {};
    d.movimientos.forEach(function (m) {
      var doc = String(m.documentoRef || '');
      if (m.tipo !== 'SALIDA' || m.estado !== 'ACTIVO' || doc.indexOf('BV-') !== 0) return;
      if (!grupos[doc]) grupos[doc] = [];
      grupos[doc].push(m);
    });
    var CLIENTES_DEMO = { 'BV-1102': 'CLI-0003', 'BV-1103': 'CLI-0001', 'BV-1104': 'CLI-0002' };
    var METODOS_DEMO = { 'BV-1101': 'Efectivo', 'BV-1102': 'Fiado', 'BV-1103': 'Tarjeta', 'BV-1104': 'Yape', 'BV-1105': 'Efectivo' };
    var fiadoPorCliente = {};
    Object.keys(grupos).sort().forEach(function (boleta, idx) {
      var bruto = 0;
      var lineas = grupos[boleta].map(function (m) {
        var p = porId('productos', m.productoId) || {};
        var cant = num(m.cantidad);
        var precio = num(p.precioVenta);
        bruto += cant * precio;
        return { productoId: m.productoId, sku: p.sku || '', descripcion: p.nombre || m.productoId, cantidad: cant, precioUnit: precio, precioOriginal: precio, esRegalo: 'No', descuento: 0, subtotal: red(cant * precio), costoUnit: num(p.costoStd), movimientoId: m.id, lote: m.lote || '' };
      });
      if (!lineas.length) return;
      var t = calcularTotalesVenta(bruto);
      var metodo = METODOS_DEMO[boleta] || ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Efectivo'][idx % 5];
      var estadoPago = metodo === 'Fiado' ? 'FIADO' : 'PAGADO';

      var ventaId = 'V-' + String(idx + 1).padStart(6, '0');
      var fechaV = grupos[boleta][0].fecha;
      /* Hora distribuida 9:00–19:59 para el gráfico "ventas por hora". */
      var baseF = Utils.parseFecha ? Utils.parseFecha(fechaV) : new Date(String(fechaV).replace(' ', 'T'));
      var fv = new Date(baseF.getFullYear(), baseF.getMonth(), baseF.getDate(), 9 + ((idx * 5) % 11), (idx * 17) % 60, 0);
      fechaV = fv.getFullYear() + '-' + pad(fv.getMonth() + 1) + '-' + pad(fv.getDate()) + ' ' + pad(fv.getHours()) + ':' + pad(fv.getMinutes()) + ':00';

      var cli = { id: '', docTipo: 'DNI', docNumero: '00000000', nombre: 'Público General', telefono: '' };
      var cliId = CLIENTES_DEMO[boleta];
      if (cliId) {
        var cliF = porId('clientes', cliId);
        if (cliF) {
          cli = { id: cliF.id, docTipo: String(cliF.documento || '').length === 11 ? 'RUC' : 'DNI', docNumero: cliF.documento || '00000000', nombre: cliF.razonSocial, telefono: String(cliF.telefono || '') };
        }
      }

      d.ventas.push({
        id: ventaId, boleta: boleta, fecha: fechaV,
        clienteId: cli.id, clienteDocTipo: cli.docTipo, clienteDocNumero: cli.docNumero, clienteNombre: cli.nombre, clienteTelefono: cli.telefono,
        subtotal: t.subtotal, igv: t.igv, total: t.total,
        descuentoTotal: 0,
        metodoPago: metodo, montoRecibido: metodo === 'Efectivo' ? t.total : 0, vuelto: 0,
        almacenId: grupos[boleta][0].almacenOrigenId, usuario: grupos[boleta][0].usuario, autorizadoPor: '', estado: 'EMITIDA', anuladoMotivo: '',
        estadoPago: estadoPago, enviadoWhatsapp: idx % 3 === 0 ? 'Sí' : 'No'
      });
      lineas.forEach(function (l, li) {
        d.ventaDetalle.push(Object.assign({ id: 'VD-' + String(d.ventaDetalle.length + 1).padStart(6, '0'), ventaId: ventaId }, l));
      });
      if (estadoPago === 'FIADO' && cli.id) {
        fiadoPorCliente[cli.id] = red((fiadoPorCliente[cli.id] || 0) + t.total);
      }
    });

    /* Saldos de fiado iniciales = suma de las boletas FIADAS por cliente. */
    Object.keys(fiadoPorCliente).forEach(function (cliId) {
      var c = porId('clientes', cliId);
      if (c) c.saldoFiado = fiadoPorCliente[cliId];
    });

    /* Abono demo parcial (ayer) del primer cliente fiado. */
    var clavesFiado = Object.keys(fiadoPorCliente);
    if (clavesFiado.length) {
      var cliAb = porId('clientes', clavesFiado[0]);
      if (cliAb) {
        var abonoMonto = Math.min(50, red(num(cliAb.saldoFiado)));
        if (abonoMonto > 0) {
          var ayer = new Date(Date.now() - 86400000);
          d.pagosFiado.push({
            id: 'PFI-00001', fecha: diaStr(ayer) + ' 15:30:00', clienteId: cliAb.id,
            clienteNombre: cliAb.razonSocial, ventaId: '', monto: abonoMonto,
            metodoPago: 'Efectivo', usuario: 'admin', nota: 'Abono de referencia (demo)'
          });
          cliAb.saldoFiado = red(num(cliAb.saldoFiado) - abonoMonto);
        }
      }
    }

    /* Adenda 1.3: cotizaciones de ejemplo (precios congelados del catálogo). */
    (s.cotizaciones || []).forEach(function (sc) {
      var cliC = porId('clientes', sc.clienteId) || { documento: '', razonSocial: 'Público General', telefono: '' };
      var bruto = 0;
      var lineasC = sc.items.map(function (it) {
        var p = porId('productos', skuAId[it[0]]);
        var precio = num(p.precioVenta);
        bruto += it[1] * precio;
        return { productoId: p.id, sku: p.sku, descripcion: p.nombre, cantidad: it[1], precioUnit: precio, esRegalo: 'No', subtotal: red(it[1] * precio) };
      });
      var tc = calcularTotalesVenta(bruto);
      var fechaC = new Date(Date.now() - sc.diasAtras * 86400000);
      fechaC.setHours(11, 0, 0, 0);
      var validezC = new Date(fechaC.getTime() + sc.validezDias * 86400000);
      d.cotizaciones.push({
        id: sc.id, numero: sc.numero,
        fecha: fechaC.getFullYear() + '-' + pad(fechaC.getMonth() + 1) + '-' + pad(fechaC.getDate()) + ' ' + pad(fechaC.getHours()) + ':00:00',
        clienteId: cliC.id, clienteDocTipo: String(cliC.documento || '').length === 11 ? 'RUC' : 'DNI', clienteDocNumero: cliC.documento || '',
        clienteNombre: cliC.razonSocial, clienteTelefono: String(cliC.telefono || ''),
        subtotal: tc.subtotal, igv: tc.igv, total: tc.total,
        validezHasta: diaStr(validezC), validezDias: sc.validezDias,
        estado: 'VIGENTE', usuario: sc.usuario, convertidoA: '', nota: sc.nota || ''
      });
      lineasC.forEach(function (l) {
        d.cotizacionDetalle.push(Object.assign({ id: 'CD-' + String(d.cotizacionDetalle.length + 1).padStart(6, '0'), cotizacionId: sc.id }, l));
      });
    });
    /* La semilla consume correlativos de cotización (espejo del backend). */
    (function () {
      var filasNum = d.numeracion || [];
      for (var i = 0; i < filasNum.length; i++) {
        if (String(filasNum[i].tipo).toUpperCase() === 'COTIZACION') {
          filasNum[i].correlativo = (s.cotizaciones || []).length;
        }
      }
    })();

    /* Adenda: caja abierta de hoy con S/ 200 de fondo fijo. */
    d.caja.push({
      id: 'CJA-00001', fecha: ahoraStr(), aperturaAt: ahoraStr(), usuario: 'admin',
      montoInicial: 200, cierreAt: '', montoSistema: '', montoContado: '', diferencia: '',
      estado: 'ABIERTA', detalle: ''
    });
    return d;
  }

  /* Singleton de carga: varias llamadas API concurrentes al arranque
   * (ping + config + dashboard + analítica...) no deben disparar varias
   * construirDB() en paralelo — se intercalarían y duplicarían filas. */
  var cargaEnCurso = null;
  function cargar() {
    if (db) return Promise.resolve(db);
    if (!cargaEnCurso) {
      cargaEnCurso = cargarInterno().then(function (res) { cargaEnCurso = null; return res; },
                                          function (err) { cargaEnCurso = null; throw err; });
    }
    return cargaEnCurso;
  }

  async function cargarInterno() {
    if (db) return db;
    var crudo = null;
    try { crudo = localStorage.getItem(CLAVE); } catch (e) { /* storage bloqueado */ }
    if (crudo) {
      try { db = JSON.parse(crudo); } catch (e) { db = null; }
    }
    if (!db || !db.usuarios || !db.usuarios.length) {
      db = await construirDB();
      guardar();
    }
    return db;
  }

  function reiniciar() { try { localStorage.removeItem(CLAVE); } catch (e) {} db = null; return cargar(); }

  /* ============================ MOTOR ERP (espejo de Apps Script) ============================ */

  function stockCantidad(productoId, almacenId) {
    for (var i = 0; i < db.stock.length; i++) {
      var s = db.stock[i];
      if (s.productoId === productoId && s.almacenId === almacenId) return num(s.cantidad);
    }
    return 0;
  }
  function moverStock(productoId, almacenId, delta) {
    for (var i = 0; i < db.stock.length; i++) {
      var s = db.stock[i];
      if (s.productoId === productoId && s.almacenId === almacenId) { s.cantidad = red(num(s.cantidad) + delta, 4); return; }
    }
    db.stock.push({ productoId: productoId, almacenId: almacenId, cantidad: r4(delta) });
  }
  function porId(col, id) { for (var i = 0; i < db[col].length; i++) if (String(db[col][i].id) === String(id)) return db[col][i]; return null; }

  function loteDe(productoId, almacenId, lote) {
    for (var i = 0; i < db.lotes.length; i++) {
      var l = db.lotes[i];
      if (l.productoId === productoId && l.almacenId === almacenId && l.lote === lote) return l;
    }
    return null;
  }
  function loteCantidad(productoId, almacenId, lote) { var l = loteDe(productoId, almacenId, lote); return l ? num(l.cantidad) : 0; }
  function upsertLote(productoId, almacenId, lote, serie, venc, cant) {
    var l = loteDe(productoId, almacenId, lote);
    if (l) { l.cantidad = red(num(l.cantidad) + cant, 4); if (serie) l.numeroSerie = serie; return; }
    db.lotes.push({ id: siguienteId('LOT-', 'lotes', 6), productoId: productoId, almacenId: almacenId, lote: lote, numeroSerie: serie || '', fechaVencimiento: venc || '', cantidad: r4(cant), estado: 'DISPONIBLE' });
  }
  function consumirFEFO(productoId, almacenId, cantidad) {
    var disponibles = db.lotes.filter(function (l) { return l.productoId === productoId && l.almacenId === almacenId && num(l.cantidad) > 0; })
      .sort(function (a, b) {
        var va = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity;
        var vb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity;
        return va - vb;
      });
    var falta = cantidad, consumos = [];
    for (var i = 0; i < disponibles.length && falta > 0; i++) {
      var tomar = Math.min(num(disponibles[i].cantidad), falta);
      disponibles[i].cantidad = red(num(disponibles[i].cantidad) - tomar, 4);
      consumos.push({ lote: disponibles[i].lote, cantidad: r4(tomar) });
      falta -= tomar;
    }
    if (falta > 0.0001) throw new ApiError_('No hay cobertura suficiente en lotes disponibles (faltan ' + red(falta, 2) + ').', 'VALIDATION');
    return consumos;
  }

  function kardexSaldo(productoId, almacenId) {
    var saldo = { cantidad: 0, valor: 0, costoPromedio: 0 };
    db.kardex.forEach(function (k) {
      if (k.productoId === productoId && k.almacenId === almacenId) {
        saldo.cantidad = num(k.saldoCantidad); saldo.valor = num(k.saldoValor); saldo.costoPromedio = num(k.costoPromedio);
      }
    });
    return saldo;
  }
  function kardexInsertar(o) {
    var prev = kardexSaldo(o.productoId, o.almacenId);
    var entC = num(o.entradaCantidad), entV = num(o.entradaValor), salC = num(o.salidaCantidad), salV = num(o.salidaValor);
    var sc = r4(prev.cantidad + entC - salC);
    var sv = red(prev.valor + entV - salV);
    if (Math.abs(sc) < 0.0001) { sc = 0; sv = 0; }
    var cp = sc > 0 ? red(sv / sc, 4) : 0;
    db.kardex.push({
      id: siguienteId('KDX-', 'kardex', 6), fecha: o.fecha, productoId: o.productoId, almacenId: o.almacenId,
      movimientoId: o.movimientoId, tipo: o.tipo,
      entradaCantidad: entC || '', entradaValor: entV ? red(entV) : '',
      salidaCantidad: salC || '', salidaValor: salV ? red(salV) : '',
      saldoCantidad: sc, saldoValor: sv, costoPromedio: cp,
      documentoRef: o.documentoRef || '', usuario: o.usuario || ''
    });
  }

  /* SÍNCRONA a propósito: los llamadores leen res.costoUnitario / res.id
   * directamente (un Promise ocultaría esos campos — bug detectado en E2E). */
  function ejecutarMovimiento(d, ses) {
    var id = siguienteId('MOV-', 'movimientos', 6);
    var fecha = d.fechaOverride || ahoraStr();
    var esEntrada = ['ENTRADA', 'DEVOLUCION', 'AJUSTE_POSITIVO'].includes(d.tipo);
    var esSalida = ['SALIDA', 'AJUSTE_NEGATIVO'].includes(d.tipo);
    var esTransf = d.tipo === 'TRANSFERENCIA';
    var prod = porId('productos', d.productoId);
    var costoStd = num(prod.costoStd);
    var loteConsumos = [];

    if (esSalida || esTransf) {
      var saldoOr = kardexSaldo(d.productoId, d.almacenOrigenId);
      var costoSalida = saldoOr.costoPromedio > 0 ? saldoOr.costoPromedio : costoStd;
      if (esSi(prod.requiereLote)) {
        loteConsumos = d.lote ? [{ lote: d.lote, cantidad: d.cantidad }] : consumirFEFO(d.productoId, d.almacenOrigenId, d.cantidad);
        if (d.lote) {
          var l = loteDe(d.productoId, d.almacenOrigenId, d.lote);
          if (l) l.cantidad = red(num(l.cantidad) - d.cantidad, 4);
        }
      }
      moverStock(d.productoId, d.almacenOrigenId, -d.cantidad);
      kardexInsertar({ fecha: fecha, productoId: d.productoId, almacenId: d.almacenOrigenId, movimientoId: id, tipo: d.tipo, salidaCantidad: d.cantidad, salidaValor: d.cantidad * costoSalida, documentoRef: d.documentoRef, usuario: ses.usuario });
      if (esTransf) {
        if (loteConsumos.length) loteConsumos.forEach(function (lc) {
          var ori = loteDe(d.productoId, d.almacenOrigenId, lc.lote);
          upsertLote(d.productoId, d.almacenDestinoId, lc.lote, '', ori ? ori.fechaVencimiento : '', lc.cantidad);
        });
        moverStock(d.productoId, d.almacenDestinoId, d.cantidad);
        kardexInsertar({ fecha: fecha, productoId: d.productoId, almacenId: d.almacenDestinoId, movimientoId: id, tipo: 'TRANSFERENCIA', entradaCantidad: d.cantidad, entradaValor: d.cantidad * costoSalida, documentoRef: d.documentoRef, usuario: ses.usuario });
        var costoEntrada = costoSalida;
      }
      return registrarMov(id, fecha, d, ses, esEntrada ? (d.costoUnitario !== null && d.costoUnitario !== undefined ? d.costoUnitario : costoStd) : costoSalida, loteConsumos);
    }

    // Entradas puras (ENTRADA, DEVOLUCION, AJUSTE_POSITIVO)
    var costoE = (d.costoUnitario === null || d.costoUnitario === undefined || d.costoUnitario === '') ? costoStd : num(d.costoUnitario);
    if (esSi(prod.requiereLote)) upsertLote(d.productoId, d.almacenDestinoId, d.lote, d.numeroSerie, d.fechaVencimiento, d.cantidad);
    moverStock(d.productoId, d.almacenDestinoId, d.cantidad);
    kardexInsertar({ fecha: fecha, productoId: d.productoId, almacenId: d.almacenDestinoId, movimientoId: id, tipo: d.tipo, entradaCantidad: d.cantidad, entradaValor: d.cantidad * costoE, documentoRef: d.documentoRef, usuario: ses.usuario });
    return registrarMov(id, fecha, d, ses, costoE, loteConsumos);
  }

  function registrarMov(id, fecha, d, ses, costo, loteConsumos) {
    var mov = {
      id: id, fecha: fecha, tipo: d.tipo, productoId: d.productoId,
      almacenOrigenId: d.almacenOrigenId || '', almacenDestinoId: d.almacenDestinoId || '',
      cantidad: d.cantidad, costoUnitario: red(costo), lote: d.lote || (loteConsumos.length ? loteConsumos.map(function (l) { return l.lote; }).join(' + ') : ''),
      numeroSerie: d.numeroSerie || '', fechaVencimiento: d.fechaVencimiento || '',
      documentoRef: d.documentoRef || '', motivo: d.motivo || '', observaciones: d.observaciones || '',
      usuario: ses.usuario, estado: 'ACTIVO', anuladoMotivo: ''
    };
    db.movimientos.push(mov);
    return {
      id: id, fecha: fecha, tipo: d.tipo, productoId: d.productoId,
      productoNombre: porId('productos', d.productoId).nombre, cantidad: d.cantidad,
      costoUnitario: red(costo), almacenOrigenId: mov.almacenOrigenId, almacenDestinoId: mov.almacenDestinoId, lotesConsumidos: loteConsumos
    };
  }

  /* ============================ ADENDA: HELPERS VENTAS ============================ */

  function siguienteCorrelativo(tipo) {
    for (var i = 0; i < db.numeracion.length; i++) {
      if (String(db.numeracion[i].tipo).toUpperCase() === String(tipo).toUpperCase()) {
        db.numeracion[i].correlativo = entero(db.numeracion[i].correlativo, 0) + 1;
        var s = String(db.numeracion[i].correlativo); while (s.length < 4) s = '0' + s;
        return { texto: db.numeracion[i].prefijo + s, numero: db.numeracion[i].correlativo };
      }
    }
    throw new ApiError_('No existe el correlativo "' + tipo + '". Reinicie la demo.', 'NO_SHEET');
  }
  function entero(v, def) { var n = parseInt(v, 10); return isNaN(n) ? (def || 0) : n; }

  function calcularTotalesVenta(bruto) {
    var tasa = num(db.config.IGV_TASA, 18) / 100;
    var incluir = esSi(db.config.IGV_INCLUIDO);
    var total, subtotal, igv;
    if (incluir) { total = red(bruto); igv = red(total - total / (1 + tasa)); subtotal = red(total - igv); }
    else { subtotal = red(bruto); igv = red(subtotal * tasa); total = red(subtotal + igv); }
    return { subtotal: subtotal, igv: igv, total: total };
  }

  function empresaSnapshot() {
    return {
      razonSocial: db.config.RAZON_SOCIAL || db.config.NOMBRE_EMPRESA || '',
      ruc: db.config.RUC || '',
      logoUrl: db.config.LOGO_URL || '', logoBase64: db.config.LOGO_BASE64 || '',
      moneda: db.config.MONEDA_SIMBOLO || 'S/',
      mensajeBoleta: db.config.MENSAJE_BOLETA || '¡Gracias por su compra!',
      igvIncluido: esSi(db.config.IGV_INCLUIDO), igvTasa: num(db.config.IGV_TASA, 18),
      horarioInicio: db.config.HORARIO_INICIO || '', horarioFin: db.config.HORARIO_FIN || ''
    };
  }

  function clienteDeVenta(clienteId, clienteNombreOverride) {
    var out = { id: '', docTipo: 'DNI', docNumero: '00000000', nombre: 'Público General' };
    if (clienteId && clienteId !== 'PUBLICO') {
      var cli = porId('clientes', clienteId);
      if (!cli) throw new ApiError_('Cliente no encontrado: ' + clienteId, 'NOT_FOUND');
      out.id = cli.id; out.nombre = cli.razonSocial || out.nombre;
      out.docNumero = cli.documento || out.docNumero;
      out.docTipo = String(out.docNumero).length === 11 ? 'RUC' : 'DNI';
    } else if (clienteNombreOverride) { out.nombre = String(clienteNombreOverride); }
    return out;
  }

  function serializarVenta(v) {
    var alm = porId('almacenes', v.almacenId);
    return {
      id: v.id, boleta: v.boleta, fecha: v.fecha,
      clienteId: v.clienteId, clienteDocTipo: v.clienteDocTipo, clienteDocNumero: v.clienteDocNumero, clienteNombre: v.clienteNombre,
      clienteTelefono: String(v.clienteTelefono || ''),
      subtotal: num(v.subtotal), igv: num(v.igv), total: num(v.total),
      descuentoTotal: num(v.descuentoTotal),
      metodoPago: v.metodoPago, montoRecibido: num(v.montoRecibido), vuelto: num(v.vuelto),
      almacenId: v.almacenId, almacenNombre: alm ? alm.nombre : v.almacenId,
      usuario: v.usuario, autorizadoPor: v.autorizadoPor || '', estado: v.estado, anuladoMotivo: v.anuladoMotivo,
      estadoPago: String(v.estadoPago || (String(v.metodoPago) === 'Fiado' ? 'FIADO' : 'PAGADO')),
      enviadoWhatsapp: String(v.enviadoWhatsapp || 'No'),
      igvIncluido: esSi(db.config.IGV_INCLUIDO), igvTasa: num(db.config.IGV_TASA, 18)
    };
  }

  function resumenVentasPorMetodo(dia) {
    var porMetodo = {};
    db.ventas.forEach(function (v) {
      if (v.estado !== 'EMITIDA' || String(v.fecha).slice(0, 10) !== dia) return;
      var m = v.metodoPago || 'Efectivo';
      if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
      porMetodo[m].n++;
      porMetodo[m].total = red(porMetodo[m].total + num(v.total));
    });
    return Object.keys(porMetodo).map(function (k) { return porMetodo[k]; }).sort(function (a, b) { return b.total - a.total; });
  }

  /* ============================ VALIDACIONES ============================ */

  var PERMISOS = {
    'catalogos:write': ['admin', 'gerente'],
    'usuarios:manage': ['admin'],
    'config:write': ['admin'],
    'movimientos:registrar': ['admin', 'gerente', 'operador'],
    'movimientos:anular': ['admin', 'gerente'],
    'auditoria:read': ['admin', 'gerente'],
    'ventas:registrar': ['admin', 'gerente', 'operador'],
    'ventas:anular': ['admin', 'gerente'],
    'caja:manage': ['admin', 'gerente', 'operador'],
    'panel:read': ['admin', 'gerente'],
    'cotizaciones:manage': ['admin', 'gerente', 'operador']
  };

  function ApiError_(mensaje, code) { this.mensaje = mensaje; this.code = code || 'ERROR'; }
  window.NexoApiError = ApiError_;

  function sesionDe(c) {
    var token = String((c && c.token) || '');
    if (!token) throw new ApiError_('Sesión no válida: falta token.', 'UNAUTHORIZED');
    var s = db.sesiones.find(function (x) { return x.token === token; });
    if (!s) throw new ApiError_('Sesión no válida o cerrada. Inicie sesión nuevamente.', 'UNAUTHORIZED');
    if (new Date(s.expira).getTime() < Date.now()) {
      db.sesiones = db.sesiones.filter(function (x) { return x.token !== token; });
      throw new ApiError_('Su sesión ha expirado. Inicie sesión nuevamente.', 'SESSION_EXPIRED');
    }
    var u = porId('usuarios', s.usuarioId);
    if (!u || u.estado !== 'ACTIVO') throw new ApiError_('El usuario fue desactivado por el administrador.', 'UNAUTHORIZED');
    return { token: token, usuarioId: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
  }
  function permiso(ses, p) {
    if (p && PERMISOS[p] && PERMISOS[p].indexOf(ses.rol) === -1) {
      throw new ApiError_('Acceso denegado: su rol "' + ses.rol + '" no tiene privilegios para esta operación.', 'FORBIDDEN');
    }
  }
  function auditar(ses, accion, detalle) {
    db.auditoria.push({ id: siguienteId('AUD-', 'auditoria', 6), fecha: ahoraStr(), usuarioId: ses.usuarioId, usuario: ses.usuario, rol: ses.rol, accion: accion, detalle: detalle });
  }

  async function validarMovimiento(c) {
    var tipo = String(c.tipo || '').toUpperCase();
    if (!['ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'DEVOLUCION', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'].includes(tipo)) {
      throw new ApiError_('Tipo de movimiento no válido: ' + tipo, 'VALIDATION');
    }
    var prod = porId('productos', String(c.productoId || ''));
    if (!prod) throw new ApiError_('Producto no encontrado.', 'NOT_FOUND');
    if (prod.estado !== 'ACTIVO') throw new ApiError_('El producto está inactivo.', 'VALIDATION');
    var cantidad = num(c.cantidad, 0);
    if (cantidad <= 0) throw new ApiError_('La cantidad debe ser mayor que cero.', 'VALIDATION');
    var esEntrada = ['ENTRADA', 'DEVOLUCION', 'AJUSTE_POSITIVO'].includes(tipo);
    var esSalida = ['SALIDA', 'AJUSTE_NEGATIVO'].includes(tipo);
    var esTransf = tipo === 'TRANSFERENCIA';
    var origen = String(c.almacenOrigenId || ''), destino = String(c.almacenDestinoId || '');
    if (esEntrada && !destino) throw new ApiError_('Seleccione el almacén de destino.', 'VALIDATION');
    if (esSalida && !origen) throw new ApiError_('Seleccione el almacén de origen.', 'VALIDATION');
    if (esTransf) {
      if (!origen || !destino) throw new ApiError_('La transferencia requiere almacén de origen y destino.', 'VALIDATION');
      if (origen === destino) throw new ApiError_('El almacén de origen y destino deben ser distintos.', 'VALIDATION');
    }
    [['origen', origen], ['destino', destino]].forEach(function (par) {
      if (!par[1]) return;
      var a = porId('almacenes', par[1]);
      if (!a) throw new ApiError_('Almacén ' + par[0] + ' no encontrado.', 'NOT_FOUND');
      if (a.estado !== 'ACTIVO') throw new ApiError_('El almacén ' + par[0] + ' está inactivo.', 'VALIDATION');
    });
    if (tipo === 'AJUSTE_NEGATIVO' && !String(c.motivo || '').trim()) {
      throw new ApiError_('Los ajustes requieren un motivo (merma, conteo físico, etc.).', 'VALIDATION');
    }
    var permitirNegativo = String(db.config.PERMITIR_STOCK_NEGATIVO || '').toUpperCase() === 'SI' || String(db.config.PERMITIR_STOCK_NEGATIVO || '').toUpperCase() === 'YES';
    if ((esSalida || esTransf) && !permitirNegativo) {
      var disp = stockCantidad(c.productoId, origen);
      if (cantidad > disp) throw new ApiError_('Stock insuficiente en el almacén de origen. Disponible: ' + disp + ' ' + prod.unidad + '.', 'VALIDATION');
    }
    if (esSi(prod.requiereLote) && (esSalida || esTransf) && !permitirNegativo) {
      var dispL = c.lote ? loteCantidad(c.productoId, origen, c.lote) : stockCantidad(c.productoId, origen);
      if (cantidad > dispL) throw new ApiError_('Stock insuficiente' + (c.lote ? ' en el lote ' + c.lote : '') + '. Disponible: ' + dispL + '.', 'VALIDATION');
    }
    return { prod: prod, tipo: tipo, cantidad: cantidad, origen: origen, destino: destino, esEntrada: esEntrada, esSalida: esSalida, esTransf: esTransf };
  }

  /* ============================ DASHBOARD ============================ */

  function dashboardData() {
    var hoy = diaStr(new Date());
    var valorInventario = 0, movHoy = 0;
    var filasCritico = [], stockFilas = [];
    db.productos.forEach(function (p) {
      if (p.estado !== 'ACTIVO') return;
      db.stock.forEach(function (s) {
        if (s.productoId !== p.id) return;
        var cant = num(s.cantidad);
        valorInventario += cant * num(p.costoStd);
        var alm = porId('almacenes', s.almacenId);
        var fila = { productoId: p.id, sku: p.sku, producto: p.nombre, unidad: p.unidad, almacenId: s.almacenId, almacen: alm ? alm.nombre : s.almacenId, cantidad: cant, stockMin: num(p.stockMin), costoStd: num(p.costoStd), valor: red(cant * num(p.costoStd)) };
        stockFilas.push(fila);
        if (num(p.stockMin) > 0 && cant <= num(p.stockMin)) filasCritico.push(fila);
      });
    });
    db.movimientos.forEach(function (m) { if (String(m.fecha).slice(0, 10) === hoy && m.estado !== 'ANULADO') movHoy++; });

    var serieDias = [], mapa = {};
    for (var i = 13; i >= 0; i--) {
      var f = new Date(new Date(hoy).getTime() - i * 86400000);
      var clave = diaStr(f);
      var fila = { fecha: clave, etiqueta: pad(f.getDate()) + ' ' + ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][f.getMonth()], entradas: 0, salidas: 0 };
      mapa[clave] = fila; serieDias.push(fila);
    }
    db.movimientos.forEach(function (m) {
      if (m.estado === 'ANULADO') return;
      var k = mapa[String(m.fecha).slice(0, 10)];
      if (!k) return;
      if (['ENTRADA', 'DEVOLUCION', 'AJUSTE_POSITIVO'].includes(m.tipo)) k.entradas++; else k.salidas++;
    });

    var porCategoria = {};
    stockFilas.forEach(function (f) {
      var p = porId('productos', f.productoId);
      var cat = (p && p.categoria) || 'General';
      porCategoria[cat] = (porCategoria[cat] || 0) + f.valor;
    });
    var categoriasChart = Object.keys(porCategoria).map(function (k) { return { categoria: k, valor: red(porCategoria[k]) }; }).sort(function (a, b) { return b.valor - a.valor; });

    var ultimos = db.movimientos.filter(function (m) { return m.estado !== 'ANULADO'; }).slice(-8).reverse().map(function (m) {
      var p = porId('productos', m.productoId) || {};
      return { id: m.id, fecha: m.fecha, tipo: m.tipo, producto: p.nombre || m.productoId, cantidad: num(m.cantidad), unidad: p.unidad || '', usuario: m.usuario, documentoRef: m.documentoRef };
    });

    var mes = hoy.slice(0, 7), conteo = {};
    db.movimientos.forEach(function (m) {
      if (m.estado === 'ANULADO' || String(m.fecha).slice(0, 7) !== mes) return;
      if (!['SALIDA', 'AJUSTE_NEGATIVO', 'TRANSFERENCIA'].includes(m.tipo)) return;
      conteo[m.productoId] = (conteo[m.productoId] || 0) + num(m.cantidad);
    });
    var topSalidas = Object.keys(conteo).map(function (k) {
      var p = porId('productos', k) || {};
      return { producto: p.nombre || k, cantidad: red(conteo[k]), unidad: p.unidad || '' };
    }).sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 5);

    var diasAlerta = parseInt(db.config.DIAS_ALERTA_VENCIMIENTO, 10) || 30;
    var hoyMs = new Date(hoy).getTime();
    var vencimientos = [];
    db.lotes.forEach(function (l) {
      if (num(l.cantidad) <= 0 || !l.fechaVencimiento) return;
      var dias = Math.round((new Date(l.fechaVencimiento).getTime() - hoyMs) / 86400000);
      if (dias <= diasAlerta) {
        var p = porId('productos', l.productoId) || {};
        var alm = porId('almacenes', l.almacenId);
        vencimientos.push({ lote: l.lote, producto: p.nombre || l.productoId, almacen: alm ? alm.nombre : l.almacenId, fechaVencimiento: l.fechaVencimiento, diasRestantes: dias, cantidad: num(l.cantidad) });
      }
    });
    vencimientos.sort(function (a, b) { return a.diasRestantes - b.diasRestantes; });

    /* Adenda: KPIs de ventas del día */
    var ventasHoyN = 0, ventasHoyTotal = 0;
    db.ventas.forEach(function (v) {
      if (v.estado !== 'EMITIDA' || String(v.fecha).slice(0, 10) !== hoy) return;
      ventasHoyN++; ventasHoyTotal += num(v.total);
    });

    return {
      kpis: { valorInventario: red(valorInventario), productosActivos: db.productos.filter(function (p) { return p.estado === 'ACTIVO'; }).length, stockCritico: filasCritico.length, movimientosHoy: movHoy, lotesPorVencer: vencimientos.length, moneda: db.config.MONEDA_SIMBOLO,
        /* Adenda */
        ventasHoyN: ventasHoyN, ventasHoyTotal: ventasHoyTotal, cajaAbierta: cajaAbiertaActual() !== null, metodoPagoDefault: db.config.METODO_PAGO_DEFAULT || 'Efectivo' },
      serieMovimientos: serieDias, valorPorCategoria: categoriasChart,
      stockCritico: filasCritico.sort(function (a, b) { return a.cantidad - b.cantidad; }).slice(0, 10),
      ultimosMovimientos: ultimos, topSalidas: topSalidas, vencimientos: vencimientos.slice(0, 10), generado: ahoraStr()
    };
  }

  /* ============================ DISPATCH ============================ */

  var H = {};

  H.ping = function (c) { var s = sesionDe(c); return { usuario: { id: s.usuarioId, usuario: s.usuario, nombre: s.nombre, rol: s.rol }, servidor: ahoraStr() }; };

  H.login = async function (c) {
    await cargar();
    var nombre = String(c.usuario || '').trim().toLowerCase(), password = String(c.password || '');
    if (!nombre || !password) throw new ApiError_('Usuario y contraseña son obligatorios.', 'VALIDATION');
    var u = db.usuarios.find(function (x) { return x.usuario.toLowerCase() === nombre; });
    var h = u ? await sha256(u.salt + password) : '';
    if (!u || u.estado !== 'ACTIVO' || h !== u.hash) throw new ApiError_('Credenciales inválidas. Verifique su usuario y contraseña.', 'UNAUTHORIZED');
    db.sesiones = db.sesiones.filter(function (x) { return new Date(x.expira).getTime() > Date.now(); });
    var token = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) + '-' + Date.now();
    db.sesiones.push({ token: token, usuarioId: u.id, rol: u.rol, creado: ahoraStr(), expira: new Date(Date.now() + CONFIG_APP.TTL_TOKEN_HORAS * 3600 * 1000).toISOString() });
    u.ultimoAcceso = ahoraStr();
    auditar({ usuarioId: u.id, usuario: u.usuario, rol: u.rol }, 'LOGIN', 'Inicio de sesión correcto');
    guardar();
    return { token: token, expiraEn: CONFIG_APP.TTL_TOKEN_HORAS * 3600, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol } };
  };

  H.logout = function (c) {
    var s = sesionDe(c);
    db.sesiones = db.sesiones.filter(function (x) { return x.token !== s.token; });
    auditar(s, 'LOGOUT', 'Cierre de sesión');
    guardar();
    return { cerrada: true };
  };

  /* --- Usuarios --- */
  H.usuarios_list = function (c) { var s = sesionDe(c); permiso(s, 'usuarios:manage'); return db.usuarios.map(function (u) { return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, estado: u.estado, ultimoAcceso: u.ultimoAcceso || '' }; }); };
  H.usuarios_save = async function (c) {
    var s = sesionDe(c); permiso(s, 'usuarios:manage');
    var it = c.item || {};
    var nombreU = String(it.usuario || '').trim().toLowerCase();
    if (!nombreU || !it.nombre) throw new ApiError_('Usuario y nombre son obligatorios.', 'VALIDATION');
    if (!['admin', 'gerente', 'operador', 'consulta'].includes(String(it.rol))) throw new ApiError_('Rol no válido.', 'VALIDATION');
    if (db.usuarios.some(function (u) { return u.usuario.toLowerCase() === nombreU && u.id !== it.id; })) throw new ApiError_('El nombre de usuario "' + nombreU + '" ya existe.', 'VALIDATION');
    var existente = it.id ? porId('usuarios', it.id) : null;
    if (existente) {
      existente.nombre = it.nombre; existente.rol = it.rol; existente.estado = it.estado || 'ACTIVO';
      if (it.password) { var s2 = Math.random().toString(36).slice(2, 18); existente.salt = s2; existente.hash = await sha256(s2 + it.password); }
      auditar(s, 'USUARIO', 'Actualizó usuario ' + nombreU); guardar();
      return { id: existente.id, actualizado: true };
    }
    if (!it.password) throw new ApiError_('Debe definir una contraseña para el nuevo usuario.', 'VALIDATION');
    var salt = Math.random().toString(36).slice(2, 18);
    var nuevo = { id: siguienteId('USR-', 'usuarios', 4), usuario: nombreU, salt: salt, hash: await sha256(salt + it.password), nombre: it.nombre, rol: it.rol, estado: it.estado || 'ACTIVO', ultimoAcceso: '' };
    db.usuarios.push(nuevo);
    auditar(s, 'USUARIO', 'Creó usuario ' + nombreU + ' (' + it.rol + ')'); guardar();
    return { id: nuevo.id, creado: true };
  };
  H.usuarios_delete = function (c) {
    var s = sesionDe(c); permiso(s, 'usuarios:manage');
    if (String(c.id) === String(s.usuarioId)) throw new ApiError_('No puede desactivar su propio usuario en ejecución.', 'VALIDATION');
    var u = porId('usuarios', c.id); if (u) u.estado = 'INACTIVO';
    db.sesiones = db.sesiones.filter(function (x) { return x.usuarioId !== c.id; });
    auditar(s, 'USUARIO', 'Desactivó usuario ' + c.id); guardar();
    return { id: c.id, estado: 'INACTIVO' };
  };

  /* --- Productos --- */
  H.productos_list = function (c) {
    sesionDe(c);
    var q = String(c.q || '').toLowerCase(), cat = String(c.categoria || ''), est = String(c.estado || '').toUpperCase();
    var out = db.productos.filter(function (p) {
      if (q && (p.nombre.toLowerCase().indexOf(q) === -1 && p.sku.toLowerCase().indexOf(q) === -1)) return false;
      if (cat && p.categoria !== cat) return false;
      if (est && p.estado.toUpperCase() !== est) return false;
      return true;
    }).map(function (p) {
      var total = 0; db.stock.forEach(function (s) { if (s.productoId === p.id) total += num(s.cantidad); });
      return Object.assign({}, p, {
        requiereLote: esSi(p.requiereLote), requiereSerie: esSi(p.requiereSerie), perecedero: esSi(p.perecedero),
        stockTotal: red(total, 4), critico: num(p.stockMin) > 0 && total <= num(p.stockMin)
      });
    });
    return out;
  };
  H.productos_get = function (c) { sesionDe(c); var p = porId('productos', c.id); if (!p) throw new ApiError_('Producto no encontrado.', 'NOT_FOUND'); return p; };
  H.productos_save = function (c) {
    var s = sesionDe(c); permiso(s, 'catalogos:write');
    var it = c.item || {};
    if (!String(it.nombre || '').trim()) throw new ApiError_('El nombre del producto es obligatorio.', 'VALIDATION');
    if (!String(it.unidad || '').trim()) throw new ApiError_('La unidad de medida es obligatoria.', 'VALIDATION');
    var sku = String(it.sku || '').trim().toUpperCase();
    if (sku && db.productos.some(function (p) { return p.sku.toUpperCase() === sku && p.id !== it.id; })) throw new ApiError_('El SKU "' + sku + '" ya existe en otro producto.', 'VALIDATION');
    var datos = { sku: sku, nombre: String(it.nombre).trim(), descripcion: it.descripcion || '', categoria: it.categoria || 'General', unidad: it.unidad, costoStd: num(it.costoStd), precioVenta: num(it.precioVenta), precioMinimo: num(it.precioMinimo), stockMin: num(it.stockMin), stockMax: num(it.stockMax), requiereLote: esSi(it.requiereLote) ? 'Sí' : 'No', requiereSerie: esSi(it.requiereSerie) ? 'Sí' : 'No', perecedero: esSi(it.perecedero) ? 'Sí' : 'No', estado: it.estado || 'ACTIVO' };
    if (it.id) {
      var p = porId('productos', it.id); if (!p) throw new ApiError_('Producto no encontrado.', 'NOT_FOUND');
      Object.assign(p, datos); auditar(s, 'PRODUCTO', 'Actualizó ' + datos.nombre); guardar();
      return { id: p.id, actualizado: true };
    }
    var nuevo = Object.assign({ id: 'PRD-' + String(db.productos.length + 1).padStart(4, '0') + '-' + Math.floor(Math.random() * 90 + 10), creado: ahoraStr() }, datos);
    if (!nuevo.sku) nuevo.sku = 'SKU-' + Math.floor(1000 + Math.random() * 9000);
    db.productos.push(nuevo);
    auditar(s, 'PRODUCTO', 'Creó ' + datos.nombre + ' (' + nuevo.sku + ')'); guardar();
    return { id: nuevo.id, creado: true };
  };
  H.productos_delete = function (c) {
    var s = sesionDe(c); permiso(s, 'catalogos:write');
    var p = porId('productos', c.id); if (p) p.estado = 'INACTIVO';
    auditar(s, 'PRODUCTO', 'Desactivó producto ' + c.id); guardar();
    return { id: c.id, estado: 'INACTIVO' };
  };

  /* --- Categorías / Almacenes / Socios --- */
  H.categorias_list = function (c) { sesionDe(c); return db.categorias.filter(function (x) { return x.estado === 'ACTIVO'; }); };
  H.categorias_save = function (c) {
    var s = sesionDe(c); permiso(s, 'catalogos:write');
    var it = c.item || {};
    if (!String(it.nombre || '').trim()) throw new ApiError_('Nombre de categoría obligatorio.', 'VALIDATION');
    if (it.id) { var x = porId('categorias', it.id); x.nombre = it.nombre; x.descripcion = it.descripcion || ''; guardar(); return { id: it.id, actualizado: true }; }
    var n = { id: 'CAT-' + String(db.categorias.length + 1).padStart(3, '0'), nombre: it.nombre, descripcion: it.descripcion || '', estado: 'ACTIVO' };
    db.categorias.push(n); auditar(s, 'CATEGORIA', 'Creó categoría ' + it.nombre); guardar();
    return { id: n.id, creado: true };
  };
  H.categorias_delete = function (c) { var s = sesionDe(c); permiso(s, 'catalogos:write'); var x = porId('categorias', c.id); if (x) x.estado = 'INACTIVO'; guardar(); return { id: c.id, estado: 'INACTIVO' }; };
  H.almacenes_list = function (c) { sesionDe(c); var est = String(c.estado || '').toUpperCase(); return db.almacenes.filter(function (a) { return !est || a.estado.toUpperCase() === est; }); };
  H.almacenes_save = function (c) {
    var s = sesionDe(c); permiso(s, 'catalogos:write');
    var it = c.item || {};
    if (!String(it.nombre || '').trim()) throw new ApiError_('El nombre del almacén es obligatorio.', 'VALIDATION');
    if (it.id) { var a = porId('almacenes', it.id); Object.assign(a, { codigo: String(it.codigo || '').toUpperCase(), nombre: String(it.nombre).trim(), direccion: it.direccion || '', responsable: it.responsable || '', estado: it.estado || 'ACTIVO' }); auditar(s, 'ALMACEN', 'Actualizó ' + a.nombre); guardar(); return { id: a.id, actualizado: true }; }
    var id = 'ALM-' + String(db.almacenes.length + 1).padStart(4, '0');
    db.almacenes.push({ id: id, codigo: String(it.codigo || id).toUpperCase(), nombre: String(it.nombre).trim(), direccion: it.direccion || '', responsable: it.responsable || '', estado: it.estado || 'ACTIVO' });
    auditar(s, 'ALMACEN', 'Creó almacén ' + it.nombre); guardar();
    return { id: id, creado: true };
  };
  H.almacenes_delete = function (c) {
    var s = sesionDe(c); permiso(s, 'catalogos:write');
    var conStock = db.stock.some(function (x) { return x.almacenId === c.id && num(x.cantidad) > 0; });
    if (conStock) throw new ApiError_('El almacén aún tiene stock disponible. Realice transferencias o ajustes antes de desactivarlo.', 'VALIDATION');
    var a = porId('almacenes', c.id); if (a) a.estado = 'INACTIVO';
    auditar(s, 'ALMACEN', 'Desactivó almacén ' + c.id); guardar();
    return { id: c.id, estado: 'INACTIVO' };
  };
  H.proveedores_list = function (c) { sesionDe(c); return db.proveedores; };
  H.proveedores_save = function (c) {
    var s = sesionDe(c); permiso(s, 'catalogos:write');
    var it = c.item || {};
    if (!String(it.razonSocial || '').trim()) throw new ApiError_('La razón social es obligatoria.', 'VALIDATION');
    if (it.id) { Object.assign(porId('proveedores', it.id), it); guardar(); return { id: it.id, actualizado: true }; }
    var id = 'PRV-' + String(db.proveedores.length + 1).padStart(4, '0');
    db.proveedores.push(Object.assign({ id: id, estado: 'ACTIVO' }, it));
    auditar(s, 'PROVEEDOR', 'Creó ' + it.razonSocial); guardar();
    return { id: id, creado: true };
  };
  H.clientes_list = function (c) {
    sesionDe(c);
    return db.clientes.map(function (p) { return Object.assign({}, p, { limiteFiado: num(p.limiteFiado), saldoFiado: num(p.saldoFiado) }); });
  };
  H.clientes_save = function (c) {
    var s = sesionDe(c); permiso(s, 'catalogos:write');
    var it = c.item || {};
    if (!String(it.razonSocial || '').trim()) throw new ApiError_('La razón social o nombre es obligatorio.', 'VALIDATION');
    if (it.id) {
      var cli = porId('clientes', it.id);
      if (!cli) throw new ApiError_('Cliente no encontrado.', 'NOT_FOUND');
      cli.documento = it.documento || ''; cli.razonSocial = it.razonSocial;
      cli.contacto = it.contacto || ''; cli.telefono = it.telefono || '';
      cli.email = it.email || ''; cli.direccion = it.direccion || '';
      cli.estado = it.estado || 'ACTIVO';
      cli.limiteFiado = num(it.limiteFiado);
      // El saldo de fiado NUNCA se toca desde el catálogo (solo ventas/abonos).
      auditar(s, 'CLIENTE', 'Actualizó ' + it.razonSocial); guardar();
      return { id: it.id, actualizado: true };
    }
    var id = siguienteId('CLI-', 'clientes', 4);
    db.clientes.push({ id: id, documento: it.documento || '', razonSocial: it.razonSocial, contacto: it.contacto || '', telefono: it.telefono || '', email: it.email || '', direccion: it.direccion || '', estado: it.estado || 'ACTIVO', limiteFiado: num(it.limiteFiado), saldoFiado: 0 });
    auditar(s, 'CLIENTE', 'Creó ' + it.razonSocial); guardar();
    return { id: id, creado: true };
  };

  /* --- Stock y lotes --- */
  H.stock_list = function (c) {
    sesionDe(c);
    var q = String(c.q || '').toLowerCase(), alm = String(c.almacenId || ''), soloCritico = !!c.soloCritico;
    var out = [];
    db.stock.forEach(function (s) {
      var p = porId('productos', s.productoId); if (!p || p.estado !== 'ACTIVO') return;
      var a = porId('almacenes', s.almacenId);
      var cant = num(s.cantidad);
      var fila = { productoId: p.id, sku: p.sku, producto: p.nombre, categoria: p.categoria, unidad: p.unidad, almacenId: s.almacenId, almacen: a ? a.nombre : s.almacenId, cantidad: cant, stockMin: num(p.stockMin), stockMax: num(p.stockMax), costoStd: num(p.costoStd), valor: red(cant * num(p.costoStd)), estado: num(p.stockMin) > 0 && cant <= num(p.stockMin) ? 'CRITICO' : 'OK' };
      if (q && (fila.producto.toLowerCase().indexOf(q) === -1 && fila.sku.toLowerCase().indexOf(q) === -1)) return;
      if (alm && fila.almacenId !== alm) return;
      if (soloCritico && fila.estado !== 'CRITICO') return;
      out.push(fila);
    });
    out.sort(function (a, b) { return b.valor - a.valor; });
    return out;
  };
  H.lotes_list = function (c) {
    sesionDe(c);
    var diasAlerta = parseInt(db.config.DIAS_ALERTA_VENCIMIENTO, 10) || 30;
    var hoyMs = new Date(diaStr(new Date())).getTime();
    var out = [];
    db.lotes.forEach(function (l) {
      if (num(l.cantidad) <= 0) return;
      if (c.productoId && l.productoId !== c.productoId) return;
      if (c.almacenId && l.almacenId !== c.almacenId) return;
      var p = porId('productos', l.productoId) || {};
      var a = porId('almacenes', l.almacenId);
      var venc = l.fechaVencimiento || '';
      var dias = venc ? Math.round((new Date(venc).getTime() - hoyMs) / 86400000) : null;
      var estadoLote = dias === null ? 'SIN_VENCIMIENTO' : (dias < 0 ? 'VENCIDO' : (dias <= diasAlerta ? 'POR_VENCER' : 'OK'));
      if (c.soloPorVencer && !['VENCIDO', 'POR_VENCER'].includes(estadoLote)) return;
      out.push({ id: l.id, productoId: l.productoId, sku: p.sku || '', productoNombre: p.nombre || l.productoId, almacenId: l.almacenId, almacen: a ? a.nombre : l.almacenId, lote: l.lote, numeroSerie: l.numeroSerie || '', fechaVencimiento: venc, diasRestantes: dias, cantidad: num(l.cantidad), unidad: p.unidad || '', estadoLote: estadoLote });
    });
    out.sort(function (a, b) {
      if (!a.fechaVencimiento) return 1; if (!b.fechaVencimiento) return -1;
      return a.fechaVencimiento < b.fechaVencimiento ? -1 : (a.fechaVencimiento > b.fechaVencimiento ? 1 : 0);
    });
    return {
      filas: out,
      resumen: { totalLotes: out.length, vencidos: out.filter(function (x) { return x.estadoLote === 'VENCIDO'; }).length, porVencer: out.filter(function (x) { return x.estadoLote === 'POR_VENCER'; }).length, diasAlerta: diasAlerta }
    };
  };

  /* --- Movimientos --- */
  H.movimientos_list = function (c) {
    sesionDe(c);
    var tipo = String(c.tipo || '').toUpperCase(), alm = String(c.almacenId || ''), q = String(c.q || '').toLowerCase();
    var desde = c.fechaDesde || '', hasta = c.fechaHasta || '';
    var limite = parseInt(c.limit, 10) || 300;
    var out = [];
    db.movimientos.slice().reverse().slice(0, limite).forEach(function (m) {
      var dia = String(m.fecha).slice(0, 10);
      if (tipo && m.tipo !== tipo) return;
      if (alm && m.almacenOrigenId !== alm && m.almacenDestinoId !== alm) return;
      if (desde && dia < desde) return;
      if (hasta && dia > hasta) return;
      var p = porId('productos', m.productoId) || {};
      var aO = porId('almacenes', m.almacenOrigenId), aD = porId('almacenes', m.almacenDestinoId);
      var linea = (m.id + ' ' + (p.nombre || '') + ' ' + (p.sku || '') + ' ' + (m.documentoRef || '') + ' ' + (m.lote || '')).toLowerCase();
      if (q && linea.indexOf(q) === -1) return;
      out.push({
        id: m.id, fecha: m.fecha, tipo: m.tipo, productoId: m.productoId, productoNombre: p.nombre || m.productoId, sku: p.sku || '',
        almacenOrigenId: m.almacenOrigenId, almacenOrigen: aO ? aO.nombre : '', almacenDestinoId: m.almacenDestinoId, almacenDestino: aD ? aD.nombre : '',
        cantidad: num(m.cantidad), unidad: p.unidad || '', costoUnitario: num(m.costoUnitario), lote: m.lote, numeroSerie: m.numeroSerie,
        documentoRef: m.documentoRef, motivo: m.motivo, observaciones: m.observaciones, usuario: m.usuario, estado: m.estado, anuladoMotivo: m.anuladoMotivo
      });
    });
    return out;
  };
  H.movimientos_registrar = async function (c) {
    var s = sesionDe(c); permiso(s, 'movimientos:registrar');
    await cargar();
    var v = await validarMovimiento(c);
    var d = {
      tipo: v.tipo, productoId: v.prod.id, cantidad: v.cantidad,
      costoUnitario: (c.costoUnitario === '' || c.costoUnitario === undefined || c.costoUnitario === null) ? null : num(c.costoUnitario),
      lote: String(c.lote || '').trim(), numeroSerie: String(c.numeroSerie || '').trim(), fechaVencimiento: c.fechaVencimiento || '',
      almacenOrigenId: v.origen, almacenDestinoId: v.destino,
      documentoRef: String(c.documentoRef || '').trim(), observaciones: String(c.observaciones || '').trim(), motivo: String(c.motivo || '').trim()
    };
    if (esSi(v.prod.requiereLote) && (v.tipo === 'ENTRADA' || v.tipo === 'DEVOLUCION' || v.tipo === 'AJUSTE_POSITIVO') && !d.lote) {
      throw new ApiError_('El producto "' + v.prod.nombre + '" exige número de lote en las entradas.', 'VALIDATION');
    }
    if (esSi(v.prod.requiereSerie) && (v.tipo === 'ENTRADA' || v.tipo === 'DEVOLUCION' || v.tipo === 'AJUSTE_POSITIVO') && !d.numeroSerie) {
      throw new ApiError_('El producto "' + v.prod.nombre + '" exige número de serie en las entradas.', 'VALIDATION');
    }
    var res = await ejecutarMovimiento(d, s);
    auditar(s, 'MOVIMIENTO', v.tipo + ' ' + res.id + ' — ' + v.prod.id + ' x ' + v.cantidad);
    guardar();
    return res;
  };
  H.movimientos_anular = function (c) {
    var s = sesionDe(c); permiso(s, 'movimientos:anular');
    var motivo = String(c.motivo || '').trim();
    if (!motivo) throw new ApiError_('Debe indicar el motivo de la anulación.', 'VALIDATION');
    var m = porId('movimientos', c.id);
    if (!m) throw new ApiError_('Movimiento no encontrado.', 'NOT_FOUND');
    if (m.estado === 'ANULADO') throw new ApiError_('El movimiento ya está anulado.', 'VALIDATION');
    var prod = porId('productos', m.productoId) || {};
    var reqLote = esSi(prod.requiereLote);
    var cant = num(m.cantidad), costo = num(m.costoUnitario);
    var fecha = ahoraStr();
    if (['ENTRADA', 'DEVOLUCION', 'AJUSTE_POSITIVO'].includes(m.tipo)) {
      moverStock(m.productoId, m.almacenDestinoId, -cant);
      if (reqLote && m.lote) { var l = loteDe(m.productoId, m.almacenDestinoId, m.lote); if (l) l.cantidad = red(num(l.cantidad) - cant, 4); }
      kardexInsertar({ fecha: fecha, productoId: m.productoId, almacenId: m.almacenDestinoId, movimientoId: m.id, tipo: 'ANULACION', salidaCantidad: cant, salidaValor: cant * costo, documentoRef: m.id + '-A', usuario: s.usuario });
    } else if (['SALIDA', 'AJUSTE_NEGATIVO'].includes(m.tipo)) {
      moverStock(m.productoId, m.almacenOrigenId, cant);
      if (reqLote && m.lote) upsertLote(m.productoId, m.almacenOrigenId, m.lote, '', m.fechaVencimiento, cant);
      kardexInsertar({ fecha: fecha, productoId: m.productoId, almacenId: m.almacenOrigenId, movimientoId: m.id, tipo: 'ANULACION', entradaCantidad: cant, entradaValor: cant * costo, documentoRef: m.id + '-A', usuario: s.usuario });
    } else if (m.tipo === 'TRANSFERENCIA') {
      moverStock(m.productoId, m.almacenOrigenId, cant);
      moverStock(m.productoId, m.almacenDestinoId, -cant);
      if (reqLote && m.lote) {
        var partes = String(m.lote).split(' + ');
        partes.forEach(function (lt) {
          upsertLote(m.productoId, m.almacenOrigenId, lt, '', m.fechaVencimiento, cant / partes.length);
          var l2 = loteDe(m.productoId, m.almacenDestinoId, lt); if (l2) l2.cantidad = red(num(l2.cantidad) - cant / partes.length, 4);
        });
      }
      kardexInsertar({ fecha: fecha, productoId: m.productoId, almacenId: m.almacenOrigenId, movimientoId: m.id, tipo: 'ANULACION', entradaCantidad: cant, entradaValor: cant * costo, documentoRef: m.id + '-A', usuario: s.usuario });
      kardexInsertar({ fecha: fecha, productoId: m.productoId, almacenId: m.almacenDestinoId, movimientoId: m.id, tipo: 'ANULACION', salidaCantidad: cant, salidaValor: cant * costo, documentoRef: m.id + '-A', usuario: s.usuario });
    }
    m.estado = 'ANULADO'; m.anuladoMotivo = motivo;
    auditar(s, 'ANULACION', 'Anuló ' + m.tipo + ' ' + m.id + '. Motivo: ' + motivo);
    guardar();
    return { id: m.id, estado: 'ANULADO', motivo: motivo };
  };

  /* --- Kardex / Reportes / Config / Auditoría --- */
  H.kardex = function (c) {
    sesionDe(c);
    var productoId = String(c.productoId || '');
    if (!productoId) throw new ApiError_('Seleccione un producto para consultar su kardex.', 'VALIDATION');
    var p = porId('productos', productoId);
    if (!p) throw new ApiError_('Producto no encontrado.', 'NOT_FOUND');
    var alm = String(c.almacenId || '');
    var filas = db.kardex.filter(function (k) { return k.productoId === productoId && (!alm || k.almacenId === alm); })
      .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id)); })
      .map(function (k) {
        var a = porId('almacenes', k.almacenId);
        return { id: k.id, fecha: k.fecha, movimientoId: k.movimientoId, tipo: k.tipo, almacenId: k.almacenId, almacen: a ? a.nombre : k.almacenId, entradaCantidad: num(k.entradaCantidad), entradaValor: num(k.entradaValor), salidaCantidad: num(k.salidaCantidad), salidaValor: num(k.salidaValor), saldoCantidad: num(k.saldoCantidad), saldoValor: num(k.saldoValor), costoPromedio: num(k.costoPromedio), documentoRef: k.documentoRef, usuario: k.usuario };
      });
    var resumen = { saldoCantidad: 0, saldoValor: 0, costoPromedio: 0, totalEntradasCantidad: 0, totalSalidasCantidad: 0, totalEntradasValor: 0, totalSalidasValor: 0 };
    filas.forEach(function (r) { resumen.totalEntradasCantidad += r.entradaCantidad; resumen.totalEntradasValor += r.entradaValor; resumen.totalSalidasCantidad += r.salidaCantidad; resumen.totalSalidasValor += r.salidaValor; resumen.saldoCantidad = r.saldoCantidad; resumen.saldoValor = r.saldoValor; resumen.costoPromedio = r.costoPromedio; });
    return {
      producto: { id: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad, categoria: p.categoria, costoStd: num(p.costoStd), precioVenta: num(p.precioVenta) },
      filas: filas,
      resumen: {
        saldoCantidad: resumen.saldoCantidad, saldoValor: resumen.saldoValor, costoPromedio: resumen.costoPromedio,
        totalEntradasCantidad: red(resumen.totalEntradasCantidad), totalSalidasCantidad: red(resumen.totalSalidasCantidad),
        totalEntradasValor: red(resumen.totalEntradasValor), totalSalidasValor: red(resumen.totalSalidasValor)
      }
    };
  };
  H.dashboard = function (c) { sesionDe(c); return dashboardData(); };
  H.reporte_stock = function (c) {
    sesionDe(c);
    var filas = H.stock_list(c);
    if (c.almacenId) filas = filas.filter(function (f) { return f.almacenId === c.almacenId; });
    var total = 0; filas.forEach(function (f) { total += f.valor; });
    return { filas: filas, totalValor: red(total), generado: ahoraStr() };
  };
  H.reporte_movimientos = function (c) { sesionDe(c); return H.movimientos_list(Object.assign({}, c, { limit: 2000 })); };
  H.auditoria_list = function (c) {
    var s = sesionDe(c); permiso(s, 'auditoria:read');
    var q = String(c.q || '').toLowerCase();
    return db.auditoria.slice(-200).reverse().filter(function (a) {
      return !q || (a.usuario + ' ' + a.accion + ' ' + a.detalle).toLowerCase().indexOf(q) !== -1;
    });
  };
  H.config_get = function (c) { sesionDe(c); return Object.assign({}, db.config); };
  H.config_save = function (c) {
    var s = sesionDe(c); permiso(s, 'config:write');
    var permitidas = Object.keys(DEMO_SEED.config);
    Object.keys(c.item || {}).forEach(function (k) {
      if (permitidas.includes(k)) {
        var v = String(c.item[k]);
        if (v.length > 300000) throw new ApiError_('El valor de "' + k + '" es demasiado grande. Use una URL de logo o una imagen menor a 45 KB.', 'VALIDATION');
        db.config[k] = v;
      }
    });
    auditar(s, 'CONFIG', 'Actualizó configuración del sistema'); guardar();
    return Object.assign({}, db.config);
  };

  /* ============================ ADENDA: VENTAS / POS ============================ */

  /* Adenda 1.2: valida credenciales REALES de un supervisor admin/gerente
   * (espejo de validarAutorizacion_ en 10_Ventas.gs). Verifica el hash
   * SHA-256(salt + password) igual que el login. */
  async function validarAutorizacion(auth) {
    var usuario = String(auth && auth.usuario || '').trim().toLowerCase();
    var password = String(auth && auth.password || '');
    if (!usuario || !password) {
      throw new ApiError_('Esta venta incluye descuentos o regalos que requieren la autorización de un gerente o administrador.', 'AUTORIZACION');
    }
    var fila = null;
    for (var i = 0; i < db.usuarios.length; i++) {
      if (String(db.usuarios[i].usuario).toLowerCase() === usuario) { fila = db.usuarios[i]; break; }
    }
    if (!fila || fila.estado !== 'ACTIVO' || String(await sha256(String(fila.salt) + password)) !== String(fila.hash).toLowerCase()) {
      throw new ApiError_('Credenciales del supervisor inválidas. La venta requiere autorización de admin/gerente.', 'AUTORIZACION');
    }
    var rol = String(fila.rol).toLowerCase();
    if (['admin', 'gerente'].indexOf(rol) === -1) {
      throw new ApiError_('El usuario "' + fila.usuario + '" (' + rol + ') no tiene autoridad para aprobar descuentos ni regalos.', 'FORBIDDEN');
    }
    return fila.nombre + ' (' + fila.usuario + ')';
  }

  H.ventas_autorizar = async function (c) {
    var s = sesionDe(c); permiso(s, 'ventas:registrar');
    var autorizadoPor = await validarAutorizacion(c.autorizacion || {});
    auditar(s, 'AUTORIZACION', 'POS: validó credenciales de supervisor — ' + autorizadoPor);
    guardar();
    return { autorizadoPor: autorizadoPor };
  };

  H.ventas_registrar = async function (c) {
    var s = sesionDe(c); permiso(s, 'ventas:registrar');
    var items = c.items || [];
    if (!items.length) throw new ApiError_('Agregue al menos un producto a la venta.', 'VALIDATION');
    var metodoPago = String(c.metodoPago || db.config.METODO_PAGO_DEFAULT || 'Efectivo');
    if (!['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Fiado'].includes(metodoPago)) {
      throw new ApiError_('Método de pago no válido: ' + metodoPago + '.', 'VALIDATION');
    }
    var almacenVenta = String(c.almacenId || db.config.ALMACEN_VENTA || 'ALM-0003');
    var almacen = porId('almacenes', almacenVenta);
    if (!almacen || almacen.estado !== 'ACTIVO') throw new ApiError_('El almacén de venta no existe o está inactivo. Revise ALMACEN_VENTA en Configuración.', 'VALIDATION');
    var permitirNegativo = String(db.config.PERMITIR_STOCK_NEGATIVO || '').toUpperCase() === 'SI';

    /* Adenda 1.2: validación con precio editable, descuentos, regalos y
     * autorización de supervisor (espejo exacto del backend real). */
    var lineas = [], bruto = 0, descuentoTotal = 0, motivosAutorizacion = [];
    items.forEach(function (it) {
      var prod = porId('productos', it.productoId);
      if (!prod) throw new ApiError_('Producto no encontrado: ' + it.productoId, 'NOT_FOUND');
      if (prod.estado !== 'ACTIVO') throw new ApiError_('El producto "' + prod.nombre + '" está inactivo.', 'VALIDATION');
      var cant = num(it.cantidad, 0);
      if (cant <= 0) throw new ApiError_('Cantidad inválida para "' + prod.nombre + '".', 'VALIDATION');
      var esRegalo = esSi(it.esRegalo);
      var precioOrig = num(prod.precioVenta);
      var precio = esRegalo ? 0 : ((it.precio === '' || it.precio === undefined || it.precio === null) ? precioOrig : num(it.precio));
      if (precio < 0) throw new ApiError_('Precio inválido para "' + prod.nombre + '".', 'VALIDATION');
      var desc = esRegalo ? 0 : Math.max(0, num(it.descuento, 0));
      var importe = red(cant * precio - desc);
      if (importe < 0) throw new ApiError_('El descuento de la línea "' + prod.nombre + '" excede su importe.', 'VALIDATION');
      var descLinea = red(cant * precioOrig - importe);
      var disponible = stockCantidad(prod.id, almacenVenta);
      if (!permitirNegativo && cant > disponible) {
        throw new ApiError_('Stock insuficiente de "' + prod.nombre + '" en ' + almacen.nombre + '. Disponible: ' + disponible + ' ' + prod.unidad + '.', 'VALIDATION');
      }
      bruto += importe;
      descuentoTotal = red(descuentoTotal + descLinea);

      var motivoAut = '';
      if (esRegalo && esSi(db.config.REGALO_REQUIERE_AUTORIZACION)) {
        motivoAut = 'regalo';
      } else {
        var precioMin = num(prod.precioMinimo);
        if (precioMin > 0 && precio < precioMin) {
          motivoAut = 'precio bajo el mínimo (' + (db.config.MONEDA_SIMBOLO || 'S/') + ' ' + precioMin.toFixed(2) + ')';
        } else {
          var maxPct = num(db.config.DESCUENTO_MAX_PCT, 0);
          if (esSi(db.config.DESCUENTO_REQUIERE_AUTORIZACION) && maxPct > 0 && cant * precioOrig > 0) {
            var pct = (descLinea / (cant * precioOrig)) * 100;
            if (pct > maxPct) motivoAut = 'descuento ' + pct.toFixed(1) + '% > ' + maxPct + '%';
          }
        }
      }
      if (motivoAut) motivosAutorizacion.push(prod.nombre + ' — ' + motivoAut);

      lineas.push({ productoId: prod.id, sku: prod.sku, descripcion: prod.nombre, unidad: prod.unidad, cantidad: cant, precioUnit: precio, precioOriginal: precioOrig, esRegalo: esRegalo, descuento: desc, subtotal: importe, descLinea: descLinea, requiereLote: esSi(prod.requiereLote), producto: prod });
    });

    var autorizadoPor = motivosAutorizacion.length ? await validarAutorizacion(c.autorizacion) : '';

    var corB = siguienteCorrelativo('BOLETA');
    var corV = siguienteCorrelativo('VENTA');
    var totales = calcularTotalesVenta(bruto);
    var montoRecibido = num(c.montoRecibido, 0);
    if (metodoPago === 'Efectivo' && montoRecibido > 0 && montoRecibido < totales.total) {
      throw new ApiError_('El monto recibido (' + red(montoRecibido) + ') es menor al total (' + totales.total + ').', 'VALIDATION');
    }
    var vuelto = (metodoPago === 'Efectivo' && montoRecibido > 0) ? red(montoRecibido - totales.total) : 0;
    var cliente = clienteDeVenta(c.clienteId, c.clienteNombre);
    var ventaId = corV.texto;

    /* Adenda 1.3: FIADO — cliente registrado y límite de crédito. */
    var estadoPago = 'PAGADO';
    if (metodoPago === 'Fiado') {
      if (!cliente.id) throw new ApiError_('El fiado requiere un cliente registrado en el catálogo (no "Público General").', 'VALIDATION');
      var cliFi = porId('clientes', cliente.id);
      var limite = num(cliFi.limiteFiado);
      var saldoActual = num(cliFi.saldoFiado);
      if (limite > 0 && !esSi(db.config.FIADO_PERMITIR_EXCEDER) && saldoActual + totales.total > limite + 0.009) {
        throw new ApiError_('Límite de fiado excedido para "' + cliFi.razonSocial + '". Saldo actual: ' + saldoActual.toFixed(2) + ' · Límite: ' + limite.toFixed(2) + ' · Esta venta: ' + totales.total.toFixed(2) + '.', 'VALIDATION');
      }
      estadoPago = 'FIADO';
    }

    var detalle = lineas.map(function (lin) {
      var res = ejecutarMovimiento({
        tipo: 'SALIDA', productoId: lin.productoId, producto: lin.producto, cantidad: lin.cantidad,
        costoUnitario: null, lote: '', numeroSerie: '', fechaVencimiento: '',
        almacenOrigenId: almacenVenta, almacenDestinoId: '',
        documentoRef: corB.texto, observaciones: 'Venta POS — ' + metodoPago, motivo: '',
        requiereLote: lin.requiereLote, permitirNegativo: permitirNegativo
      }, s);
      return {
        id: 'VD-' + String(db.ventaDetalle.length + 1).padStart(6, '0'), ventaId: ventaId,
        productoId: lin.productoId, sku: lin.sku, descripcion: lin.descripcion, cantidad: lin.cantidad,
        precioUnit: lin.precioUnit, precioOriginal: lin.precioOriginal, esRegalo: lin.esRegalo ? 'Sí' : 'No',
        descuento: lin.descuento, subtotal: lin.subtotal,
        costoUnit: num(res.costoUnitario),
        movimientoId: res.id, lote: (res.lotesConsumidos && res.lotesConsumidos.length) ? res.lotesConsumidos.map(function (l) { return l.lote; }).join(' + ') : ''
      };
    });

    var venta = {
      id: ventaId, boleta: corB.texto, fecha: ahoraStr(),
      clienteId: cliente.id, clienteDocTipo: cliente.docTipo, clienteDocNumero: cliente.docNumero, clienteNombre: cliente.nombre, clienteTelefono: cliente.telefono || '',
      subtotal: totales.subtotal, igv: totales.igv, total: totales.total,
      descuentoTotal: descuentoTotal,
      metodoPago: metodoPago, montoRecibido: red(montoRecibido), vuelto: vuelto,
      almacenId: almacenVenta, usuario: s.usuario, autorizadoPor: autorizadoPor, estado: 'EMITIDA', anuladoMotivo: '',
      estadoPago: estadoPago, enviadoWhatsapp: 'No'
    };
    db.ventas.push(venta);
    detalle.forEach(function (d) { db.ventaDetalle.push(d); });

    /* Adenda 1.3: incrementa el saldo de fiado del cliente. */
    if (estadoPago === 'FIADO') {
      var cliRef = porId('clientes', cliente.id);
      cliRef.saldoFiado = red(num(cliRef.saldoFiado) + totales.total);
    }

    auditar(s, 'VENTA', 'Emitió boleta ' + venta.boleta + ' por ' + db.config.MONEDA_SIMBOLO + ' ' + totales.total + ' (' + metodoPago + ')' +
      (estadoPago === 'FIADO' ? ' [FIADO]' : '') +
      (descuentoTotal > 0 ? ' · Descuentos: ' + db.config.MONEDA_SIMBOLO + ' ' + descuentoTotal : '') +
      (autorizadoPor ? ' · Autorizó: ' + autorizadoPor : ''));
    guardar();
    return { venta: serializarVenta(venta), detalle: detalle, empresa: empresaSnapshot(), almacenVenta: almacen.nombre };
  };

  H.ventas_list = function (c) {
    sesionDe(c);
    var desde = c.fechaDesde || '', hasta = c.fechaHasta || '';
    var estado = String(c.estado || '').toUpperCase(), metodo = String(c.metodoPago || '');
    var q = String(c.q || '').toLowerCase();
    var limite = parseInt(c.limit, 10) || 300;
    return db.ventas.slice().reverse().filter(function (v) {
      var dia = String(v.fecha).slice(0, 10);
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
      if (estado && v.estado !== estado) return false;
      if (metodo && v.metodoPago !== metodo) return false;
      if (q && (v.boleta + ' ' + v.clienteNombre + ' ' + v.usuario).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).slice(0, limite).map(serializarVenta);
  };

  H.ventas_get = function (c) {
    sesionDe(c);
    var v = db.ventas.find(function (x) { return x.id === c.id || x.boleta === c.id; });
    if (!v) throw new ApiError_('Venta no encontrada: ' + c.id, 'NOT_FOUND');
    var detalle = db.ventaDetalle.filter(function (d) { return d.ventaId === v.id; }).map(function (d) {
      return { id: d.id, ventaId: d.ventaId, productoId: d.productoId, sku: d.sku, descripcion: d.descripcion, cantidad: num(d.cantidad), precioUnit: num(d.precioUnit), precioOriginal: num(d.precioOriginal), esRegalo: String(d.esRegalo || 'No'), descuento: num(d.descuento), costoUnit: num(d.costoUnit), subtotal: num(d.subtotal), lote: d.lote || '' };
    });
    return { venta: serializarVenta(v), detalle: detalle, empresa: empresaSnapshot() };
  };

  H.ventas_anular = function (c) {
    var s = sesionDe(c); permiso(s, 'ventas:anular');
    var motivo = String(c.motivo || '').trim();
    if (!motivo) throw new ApiError_('Debe indicar el motivo de la anulación.', 'VALIDATION');
    var v = db.ventas.find(function (x) { return x.id === c.id || x.boleta === c.id; });
    if (!v) throw new ApiError_('Venta no encontrada: ' + c.id, 'NOT_FOUND');
    if (v.estado === 'ANULADA') throw new ApiError_('La venta ya está anulada.', 'VALIDATION');
    var detalle = db.ventaDetalle.filter(function (d) { return d.ventaId === v.id; });
    detalle.forEach(function (d) {
      var prod = porId('productos', d.productoId);
      ejecutarMovimiento({
        tipo: 'DEVOLUCION', productoId: d.productoId, producto: prod, cantidad: num(d.cantidad),
        costoUnitario: null,
        lote: prod && esSi(prod.requiereLote) ? String(d.lote || '').split(' + ')[0] : '',
        numeroSerie: '', fechaVencimiento: '',
        almacenOrigenId: '', almacenDestinoId: v.almacenId,
        documentoRef: 'ANUL ' + v.boleta, observaciones: 'Anulación de venta ' + v.boleta,
        motivo: motivo, requiereLote: prod ? esSi(prod.requiereLote) : false, permitirNegativo: true
      }, s);
    });
    v.estado = 'ANULADA'; v.anuladoMotivo = motivo;

    /* Adenda 1.3: si la venta era FIADA, descuenta su importe del saldo. */
    if (String(v.metodoPago) === 'Fiado' && v.clienteId) {
      var cliAn = porId('clientes', v.clienteId);
      if (cliAn) cliAn.saldoFiado = Math.max(0, red(num(cliAn.saldoFiado) - num(v.total)));
    }

    auditar(s, 'VENTA_ANULADA', 'Anuló boleta ' + v.boleta + '. Motivo: ' + motivo);
    guardar();
    return { id: v.id, boleta: v.boleta, estado: 'ANULADA', motivo: motivo };
  };

  H.ventas_resumen = function (c) {
    sesionDe(c);
    var desde = c.fechaDesde || (diaStr(new Date()).slice(0, 7) + '-01');
    var hasta = c.fechaHasta || diaStr(new Date());
    var ventas = db.ventas.filter(function (v) {
      var d = String(v.fecha).slice(0, 10);
      return v.estado === 'EMITIDA' && d >= desde && d <= hasta;
    });
    var porMetodo = {}, porDia = {}, porVendedor = {}, total = 0, descuentosTotal = 0;
    ventas.forEach(function (v) {
      var m = v.metodoPago || 'Efectivo';
      if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
      porMetodo[m].n++; porMetodo[m].total = red(porMetodo[m].total + num(v.total));
      var d = String(v.fecha).slice(0, 10);
      if (!porDia[d]) porDia[d] = { fecha: d, n: 0, total: 0 };
      porDia[d].n++; porDia[d].total = red(porDia[d].total + num(v.total));
      var vend = v.usuario || '—';
      if (!porVendedor[vend]) porVendedor[vend] = { vendedor: vend, n: 0, total: 0 };
      porVendedor[vend].n++; porVendedor[vend].total = red(porVendedor[vend].total + num(v.total));
      total += num(v.total);
      descuentosTotal += num(v.descuentoTotal);
    });
    var ids = {};
    ventas.forEach(function (v) { ids[v.id] = true; });
    var porProducto = {};
    var nRegalos = 0, cantidadRegalada = 0;
    db.ventaDetalle.forEach(function (d) {
      if (!ids[d.ventaId]) return;
      if (!porProducto[d.productoId]) porProducto[d.productoId] = { productoId: d.productoId, sku: d.sku, descripcion: d.descripcion, cantidad: 0, total: 0 };
      porProducto[d.productoId].cantidad += num(d.cantidad);
      porProducto[d.productoId].total += num(d.subtotal);
      var esR = String(d.esRegalo || 'No').toUpperCase();
      if (esR === 'SÍ' || esR === 'SI') { nRegalos++; cantidadRegalada += num(d.cantidad); }
    });
    return {
      desde: desde, hasta: hasta, nVentas: ventas.length, totalPeriodo: red(total),
      ticketPromedio: ventas.length ? red(total / ventas.length) : 0,
      descuentosTotal: red(descuentosTotal), nRegalos: nRegalos, cantidadRegalada: red(cantidadRegalada),
      porMetodo: Object.keys(porMetodo).map(function (k) { return porMetodo[k]; }).sort(function (a, b) { return b.total - a.total; }),
      porDia: Object.keys(porDia).map(function (k) { return porDia[k]; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }),
      porVendedor: Object.keys(porVendedor).map(function (k) { return porVendedor[k]; }).sort(function (a, b) { return b.total - a.total; }),
      topProductos: Object.keys(porProducto).map(function (k) { var p = porProducto[k]; p.cantidad = red(p.cantidad); p.total = red(p.total); return p; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 10)
    };
  };

  /* ============================ ADENDA: CUADRE DE CAJA ============================ */

  function cajaAbiertaActual() {
    var abierta = null;
    db.caja.forEach(function (f) { if (f.estado === 'ABIERTA') abierta = f; });
    return abierta;
  }
  function serializarCaja(f) {
    return { id: f.id, fecha: String(f.fecha).slice(0, 10), aperturaAt: f.aperturaAt, usuario: f.usuario, montoInicial: num(f.montoInicial), cierreAt: f.cierreAt || '', montoSistema: num(f.montoSistema), montoContado: num(f.montoContado), diferencia: num(f.diferencia), estado: f.estado, detalle: f.detalle || '' };
  }

  /* Adenda 1.3: abonos de fiado de un día agrupados por método. */
  function abonosFiadoDia(dia) {
    var porMetodo = {};
    db.pagosFiado.forEach(function (p) {
      if (String(p.fecha).slice(0, 10) !== dia) return;
      var m = p.metodoPago || 'Efectivo';
      if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
      porMetodo[m].n++; porMetodo[m].total = red(porMetodo[m].total + num(p.monto));
    });
    return Object.keys(porMetodo).map(function (k) { return porMetodo[k]; });
  }

  H.caja_estado = function (c) {
    sesionDe(c);
    var abierta = cajaAbiertaActual();
    var dia = abierta ? String(abierta.fecha).slice(0, 10) : diaStr(new Date());
    var resumen = resumenVentasPorMetodo(dia);
    var totalDia = 0, nT = 0;
    resumen.forEach(function (r) { totalDia += r.total; nT += r.n; });
    var abonos = abonosFiadoDia(dia);
    var abonosEfectivo = 0, abonosTotal = 0, fiadoEmitido = 0;
    abonos.forEach(function (a) { abonosTotal = red(abonosTotal + a.total); if (a.metodo === 'Efectivo') abonosEfectivo = a.total; });
    resumen.forEach(function (r) { if (r.metodo === 'Fiado') fiadoEmitido = r.total; });
    return {
      abierta: !!abierta, caja: abierta ? serializarCaja(abierta) : null, fecha: dia,
      resumen: resumen, nTransacciones: nT, totalVentasDia: red(totalDia),
      abonosFiado: abonos, abonosFiadoTotal: abonosTotal, abonosFiadoEfectivo: abonosEfectivo, fiadoEmitidoDia: fiadoEmitido,
      moneda: db.config.MONEDA_SIMBOLO || 'S/', metodoPagoDefault: db.config.METODO_PAGO_DEFAULT || 'Efectivo',
      horarioInicio: db.config.HORARIO_INICIO || '', horarioFin: db.config.HORARIO_FIN || '',
      servidor: ahoraStr()
    };
  };

  H.caja_abrir = function (c) {
    var s = sesionDe(c); permiso(s, 'caja:manage');
    var montoInicial = num(c.montoInicial, 0);
    if (montoInicial < 0) throw new ApiError_('El monto inicial no puede ser negativo.', 'VALIDATION');
    if (cajaAbiertaActual()) throw new ApiError_('Ya existe una caja abierta. Ciérrela antes de abrir otra.', 'VALIDATION');
    var fila = { id: siguienteId('CJA-', 'caja', 5), fecha: ahoraStr(), aperturaAt: ahoraStr(), usuario: s.usuario, montoInicial: montoInicial, cierreAt: '', montoSistema: '', montoContado: '', diferencia: '', estado: 'ABIERTA', detalle: '' };
    db.caja.push(fila);
    auditar(s, 'CAJA', 'Abrió caja con ' + montoInicial); guardar();
    return serializarCaja(fila);
  };

  H.caja_cerrar = function (c) {
    var s = sesionDe(c); permiso(s, 'caja:manage');
    var montoContado = num(c.montoContado, -1);
    if (montoContado < 0) throw new ApiError_('Ingrese el efectivo contado en caja.', 'VALIDATION');
    var abierta = cajaAbiertaActual();
    if (!abierta) throw new ApiError_('No hay ninguna caja abierta que cerrar.', 'VALIDATION');
    var dia = String(abierta.fecha).slice(0, 10);
    var resumen = resumenVentasPorMetodo(dia);
    var efectivoVentas = 0, totalDia = 0;
    resumen.forEach(function (r) { totalDia += r.total; if (r.metodo === 'Efectivo') efectivoVentas = r.total; });
    /* Adenda 1.3: los abonos de fiado en efectivo también entran a caja. */
    var abonosEfectivo = 0;
    abonosFiadoDia(dia).forEach(function (a) { if (a.metodo === 'Efectivo') abonosEfectivo = a.total; });
    // Efectivo esperado = fondo inicial + ventas en efectivo + abonos de fiado en efectivo.
    var esperadoEnCaja = red(num(abierta.montoInicial) + efectivoVentas + abonosEfectivo);
    abierta.estado = 'CERRADA'; abierta.cierreAt = ahoraStr();
    abierta.montoSistema = esperadoEnCaja; abierta.montoContado = red(montoContado);
    abierta.diferencia = red(montoContado - esperadoEnCaja);
    abierta.detalle = String(c.detalle || '');
    auditar(s, 'CAJA', 'Cerró caja ' + abierta.id + '. Ventas del día: ' + red(totalDia) + '. Abonos fiado (efectivo): ' + abonosEfectivo + '. Efectivo esperado: ' + esperadoEnCaja + '. Diferencia: ' + abierta.diferencia);
    guardar();
    return { caja: serializarCaja(abierta), resumen: resumen, totalVentasDia: red(totalDia) };
  };

  H.caja_historial = function (c) {
    sesionDe(c);
    return db.caja.slice().reverse().slice(0, 30).map(serializarCaja);
  };

  /* ============================ ADENDA 1.3: FIADOS ============================ */

  function estadoPagoDe(v) { return String(v.estadoPago || (String(v.metodoPago) === 'Fiado' ? 'FIADO' : 'PAGADO')).toUpperCase(); }

  H.fiados_cartera = function (c) {
    sesionDe(c);
    var diasAlerta = parseInt(db.config.FIADO_DIAS_ALERTA, 10) || 30;
    var hoyMs = new Date(diaStr(new Date())).getTime();
    var pendientesPorCliente = {};
    db.ventas.forEach(function (v) {
      if (v.estado !== 'EMITIDA' || estadoPagoDe(v) !== 'FIADO') return;
      var cliId = String(v.clienteId || '');
      if (!cliId) return;
      if (!pendientesPorCliente[cliId]) pendientesPorCliente[cliId] = [];
      var dias = Math.round((hoyMs - new Date(String(v.fecha).slice(0, 10) + 'T12:00:00').getTime()) / 86400000);
      pendientesPorCliente[cliId].push({ id: v.id, boleta: v.boleta, fecha: v.fecha, total: num(v.total), dias: dias, metodoPago: v.metodoPago });
    });
    var out = [], totalPendiente = 0;
    db.clientes.forEach(function (cli) {
      var saldo = red(num(cli.saldoFiado));
      if (saldo <= 0.004) return;
      var limite = num(cli.limiteFiado);
      var ventas = (pendientesPorCliente[cli.id] || []).sort(function (a, b) { return b.dias - a.dias; });
      var diasMax = ventas.length ? ventas[0].dias : 0;
      totalPendiente = red(totalPendiente + saldo);
      out.push({
        id: cli.id, nombre: cli.razonSocial || '', documento: cli.documento || '',
        telefono: String(cli.telefono || ''), limite: limite, saldo: saldo,
        disponible: limite > 0 ? red(Math.max(0, limite - saldo)) : null,
        nPendientes: ventas.length, ventasPendientes: ventas, diasMax: diasMax, critico: diasMax > diasAlerta
      });
    });
    out.sort(function (a, b) { return b.saldo - a.saldo; });
    return { clientes: out, totalPendiente: red(totalPendiente), nClientes: out.length, diasAlerta: diasAlerta, moneda: db.config.MONEDA_SIMBOLO || 'S/' };
  };

  H.fiado_abono = function (c) {
    var s = sesionDe(c); permiso(s, 'ventas:registrar');
    var monto = red(num(c.monto, 0));
    var metodoPago = String(c.metodoPago || 'Efectivo');
    if (metodoPago === 'Fiado') throw new ApiError_('Un abono no puede pagarse con más fiado. Use Efectivo, Yape, Plin o Tarjeta.', 'VALIDATION');
    if (!['Efectivo', 'Yape', 'Plin', 'Tarjeta'].includes(metodoPago)) throw new ApiError_('Método de pago no válido: ' + metodoPago + '.', 'VALIDATION');
    if (monto <= 0) throw new ApiError_('El monto del abono debe ser mayor que cero.', 'VALIDATION');
    var cli = porId('clientes', String(c.clienteId || ''));
    if (!cli) throw new ApiError_('Cliente no encontrado: ' + c.clienteId, 'NOT_FOUND');
    var saldo = red(num(cli.saldoFiado));
    if (saldo <= 0.004) throw new ApiError_('El cliente "' + cli.razonSocial + '" no tiene saldo de fiado pendiente.', 'VALIDATION');
    if (monto > saldo + 0.009) throw new ApiError_('El abono (' + monto.toFixed(2) + ') excede el saldo pendiente (' + saldo.toFixed(2) + ').', 'VALIDATION');

    var abonoId = siguienteId('PFI-', 'pagosFiado', 5);
    db.pagosFiado.push({
      id: abonoId, fecha: ahoraStr(), clienteId: cli.id, clienteNombre: cli.razonSocial,
      ventaId: String(c.ventaId || ''), monto: monto, metodoPago: metodoPago,
      usuario: s.usuario, nota: String(c.nota || '')
    });
    var nuevoSaldo = red(saldo - monto);
    cli.saldoFiado = nuevoSaldo;
    var ventasSaldadas = 0;
    if (nuevoSaldo <= 0.004) {
      db.ventas.forEach(function (v) {
        if (String(v.clienteId) !== String(cli.id) || v.estado !== 'EMITIDA' || estadoPagoDe(v) !== 'FIADO') return;
        v.estadoPago = 'PAGADO';
        ventasSaldadas++;
      });
    }
    auditar(s, 'FIADO', 'Abono de ' + cli.razonSocial + ': ' + monto + ' (' + metodoPago + ')' + (c.ventaId ? ' ref. ' + c.ventaId : '') + '. Saldo nuevo: ' + Math.max(0, nuevoSaldo));
    guardar();
    return {
      abono: { id: abonoId, fecha: ahoraStr(), monto: monto, metodoPago: metodoPago, nota: String(c.nota || '') },
      cliente: { id: cli.id, nombre: cli.razonSocial, limite: num(cli.limiteFiado), saldo: Math.max(0, nuevoSaldo), saldado: nuevoSaldo <= 0.004, ventasSaldadas: ventasSaldadas }
    };
  };

  H.fiado_pagos = function (c) {
    sesionDe(c);
    var clienteId = String(c.clienteId || '');
    var limite = parseInt(c.limit, 10) || 100;
    return db.pagosFiado
      .filter(function (p) { return !clienteId || String(p.clienteId) === clienteId; })
      .slice(-limite).reverse()
      .map(function (p) { return { id: p.id, fecha: p.fecha, clienteId: p.clienteId, clienteNombre: p.clienteNombre, ventaId: p.ventaId || '', monto: num(p.monto), metodoPago: p.metodoPago, usuario: p.usuario, nota: p.nota || '' }; });
  };

  H.ventas_marcar_whatsapp = function (c) {
    var s = sesionDe(c); permiso(s, 'ventas:registrar');
    var v = db.ventas.find(function (x) { return x.id === c.id || x.boleta === c.id; });
    if (!v) throw new ApiError_('Venta no encontrada: ' + c.id, 'NOT_FOUND');
    v.enviadoWhatsapp = 'Sí';
    auditar(s, 'VENTA', 'Envió por WhatsApp la boleta ' + v.boleta + (c.telefono ? ' al ' + String(c.telefono) : ''));
    guardar();
    return { id: v.id, boleta: v.boleta, enviadoWhatsapp: 'Sí' };
  };

  /* ============================ ADENDA 1.3: COTIZACIONES ============================ */

  function serializarCotizacion(v) {
    var validez = String(v.validezHasta || '').slice(0, 10);
    var hoy = diaStr(new Date());
    return {
      id: v.id, numero: v.numero, fecha: v.fecha,
      clienteId: v.clienteId, clienteDocTipo: v.clienteDocTipo, clienteDocNumero: v.clienteDocNumero,
      clienteNombre: v.clienteNombre, clienteTelefono: String(v.clienteTelefono || ''),
      subtotal: num(v.subtotal), igv: num(v.igv), total: num(v.total),
      validezHasta: validez, validezDias: parseInt(v.validezDias, 10) || 15,
      estado: String(v.estado || 'VIGENTE').toUpperCase(),
      vencida: !!validez && validez < hoy,
      usuario: v.usuario, convertidoA: v.convertidoA || '', nota: v.nota || ''
    };
  }

  H.cotizaciones_registrar = function (c) {
    var s = sesionDe(c); permiso(s, 'cotizaciones:manage');
    var items = c.items || [];
    if (!items.length) throw new ApiError_('Agregue al menos un producto a la cotización.', 'VALIDATION');
    var validezDias = parseInt(c.validezDias, 10) || 15;
    if (validezDias <= 0 || validezDias > 365) validezDias = 15;
    var cliente = clienteDeVenta(c.clienteId, c.clienteNombre);
    var bruto = 0;
    var lineas = items.map(function (it) {
      var prod = porId('productos', it.productoId);
      if (!prod) throw new ApiError_('Producto no encontrado: ' + it.productoId, 'NOT_FOUND');
      if (prod.estado !== 'ACTIVO') throw new ApiError_('El producto "' + prod.nombre + '" está inactivo.', 'VALIDATION');
      var cant = num(it.cantidad, 0);
      if (cant <= 0) throw new ApiError_('Cantidad inválida para "' + prod.nombre + '".', 'VALIDATION');
      var esRegalo = esSi(it.esRegalo);
      var precio = esRegalo ? 0 : ((it.precio === '' || it.precio === undefined || it.precio === null) ? num(prod.precioVenta) : num(it.precio));
      if (precio < 0) throw new ApiError_('Precio inválido para "' + prod.nombre + '".', 'VALIDATION');
      var importe = red(cant * precio);
      bruto += importe;
      return { productoId: prod.id, sku: prod.sku, descripcion: prod.nombre, cantidad: cant, precioUnit: precio, esRegalo: esRegalo ? 'Sí' : 'No', subtotal: importe };
    });
    var t = calcularTotalesVenta(bruto);
    var cor = siguienteCorrelativo('COTIZACION');
    var ahora = ahoraStr();
    var validez = new Date(Date.now() + validezDias * 86400000);
    var cot = {
      id: 'CT-' + cor.texto, numero: cor.texto, fecha: ahora,
      clienteId: cliente.id, clienteDocTipo: cliente.docTipo, clienteDocNumero: cliente.docNumero,
      clienteNombre: cliente.nombre, clienteTelefono: cliente.telefono || '',
      subtotal: t.subtotal, igv: t.igv, total: t.total,
      validezHasta: diaStr(validez), validezDias: validezDias,
      estado: 'VIGENTE', usuario: s.usuario, convertidoA: '', nota: String(c.nota || '')
    };
    db.cotizaciones.push(cot);
    lineas.forEach(function (l) {
      db.cotizacionDetalle.push(Object.assign({ id: 'CD-' + String(db.cotizacionDetalle.length + 1).padStart(6, '0'), cotizacionId: cot.id }, l));
    });
    auditar(s, 'COTIZACION', 'Creó ' + cot.numero + ' por ' + db.config.MONEDA_SIMBOLO + ' ' + t.total + ' — ' + cliente.nombre + ' (validez ' + validezDias + ' días)');
    guardar();
    return { cotizacion: serializarCotizacion(cot), detalle: lineas };
  };

  H.cotizaciones_list = function (c) {
    sesionDe(c);
    var estado = String(c.estado || '').toUpperCase();
    var q = String(c.q || '').toLowerCase();
    var limite = parseInt(c.limit, 10) || 200;
    return db.cotizaciones
      .slice().reverse()
      .map(serializarCotizacion)
      .filter(function (v) {
        if (estado && v.estado !== estado) return false;
        if (q && (v.numero + ' ' + v.clienteNombre).toLowerCase().indexOf(q) === -1) return false;
        return true;
      }).slice(0, limite);
  };

  H.cotizaciones_get = function (c) {
    sesionDe(c);
    var cot = db.cotizaciones.find(function (x) { return x.id === c.id || x.numero === c.id; });
    if (!cot) throw new ApiError_('Cotización no encontrada: ' + c.id, 'NOT_FOUND');
    var detalle = db.cotizacionDetalle.filter(function (d) { return d.cotizacionId === cot.id; }).map(function (d) {
      return { id: d.id, cotizacionId: d.cotizacionId, productoId: d.productoId, sku: d.sku, descripcion: d.descripcion, cantidad: num(d.cantidad), precioUnit: num(d.precioUnit), esRegalo: String(d.esRegalo || 'No'), subtotal: num(d.subtotal) };
    });
    return { cotizacion: serializarCotizacion(cot), detalle: detalle, empresa: empresaSnapshot() };
  };

  H.cotizaciones_convertir = async function (c) {
    var s = sesionDe(c); permiso(s, 'cotizaciones:manage');
    var cot = db.cotizaciones.find(function (x) { return x.id === c.id || x.numero === c.id; });
    if (!cot) throw new ApiError_('Cotización no encontrada: ' + c.id, 'NOT_FOUND');
    var estado = String(cot.estado || 'VIGENTE').toUpperCase();
    if (estado === 'CONVERTIDA') throw new ApiError_('La cotización ' + cot.numero + ' ya fue convertida en la boleta ' + cot.convertidoA + '.', 'VALIDATION');
    if (estado === 'ANULADA') throw new ApiError_('La cotización ' + cot.numero + ' está anulada.', 'VALIDATION');
    var detalle = db.cotizacionDetalle.filter(function (d) { return d.cotizacionId === cot.id; });
    if (!detalle.length) throw new ApiError_('La cotización no tiene ítems.', 'VALIDATION');
    var items = detalle.map(function (d) {
      return { productoId: d.productoId, cantidad: num(d.cantidad), precio: num(d.precioUnit), esRegalo: String(d.esRegalo || 'No') };
    });
    var res = await H.ventas_registrar({
      token: c.token,   // el handler interno re-valida la sesión: propague el token
      items: items, clienteId: cot.clienteId,
      metodoPago: String(c.metodoPago || 'Efectivo'), montoRecibido: c.montoRecibido,
      autorizacion: c.autorizacion
    });
    cot.estado = 'CONVERTIDA';
    cot.convertidoA = res.venta.id;
    auditar(s, 'COTIZACION', 'Convirtió ' + cot.numero + ' en la boleta ' + res.venta.boleta + ' (' + res.venta.metodoPago + ')');
    guardar();
    return { venta: res.venta, detalle: res.detalle, empresa: res.empresa, cotizacion: serializarCotizacion(cot) };
  };

  H.cotizaciones_anular = function (c) {
    var s = sesionDe(c); permiso(s, 'cotizaciones:manage');
    var cot = db.cotizaciones.find(function (x) { return x.id === c.id || x.numero === c.id; });
    if (!cot) throw new ApiError_('Cotización no encontrada: ' + c.id, 'NOT_FOUND');
    if (String(cot.estado).toUpperCase() === 'CONVERTIDA') throw new ApiError_('No se puede anular: la cotización ya fue convertida en la boleta ' + cot.convertidoA + '.', 'VALIDATION');
    if (String(cot.estado).toUpperCase() === 'ANULADA') throw new ApiError_('La cotización ya está anulada.', 'VALIDATION');
    var motivo = String(c.motivo || '').trim();
    cot.estado = 'ANULADA';
    cot.nota = String(cot.nota || '') + (motivo ? (cot.nota ? ' · ' : '') + 'Anulada: ' + motivo : '');
    auditar(s, 'COTIZACION', 'Anuló ' + cot.numero + (motivo ? '. Motivo: ' + motivo : ''));
    guardar();
    return { id: cot.id, numero: cot.numero, estado: 'ANULADA' };
  };

  /* ============================ ADENDA 1.3: ANALÍTICA ============================ */

  var DIAS_SEMANA_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  var MESES_CORTOS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function ventasEntreDemo(desde, hasta) {
    return db.ventas.filter(function (v) {
      if (v.estado !== 'EMITIDA') return false;
      var dia = String(v.fecha).slice(0, 10);
      return dia >= desde && dia <= hasta;
    });
  }
  function costoLineaDemo(d, costos) {
    var ref = costos[d.productoId] || {};
    var cu = (d.costoUnit === '' || d.costoUnit === undefined || d.costoUnit === null) ? -1 : num(d.costoUnit, -1);
    return cu >= 0 ? cu : num(ref.costo);
  }
  function restarDiasDemo(diaISO, n) {
    var d = new Date(diaISO + 'T12:00:00');
    d = new Date(d.getTime() - n * 86400000);
    return diaStr(d);
  }
  function sumaSaldoFiadoDemo() {
    var total = 0, n = 0;
    db.clientes.forEach(function (cli) {
      var saldo = num(cli.saldoFiado);
      if (saldo > 0.004) { total = red(total + saldo); n++; }
    });
    return { total: red(total), n: n };
  }

  H.ventas_analitica = function (c) {
    sesionDe(c);
    var hoy = diaStr(new Date());
    var desde = c.fechaDesde || (hoy.slice(0, 8) + '01');
    var hasta = c.fechaHasta || hoy;
    if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    var dias = Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000) + 1;
    var prevHasta = restarDiasDemo(desde, 1);
    var prevDesde = restarDiasDemo(desde, dias);

    var ventas = ventasEntreDemo(desde, hasta);
    var ventasPrev = ventasEntreDemo(prevDesde, prevHasta);

    var total = 0;
    ventas.forEach(function (v) { total += num(v.total); });
    var prevTotal = 0;
    ventasPrev.forEach(function (v) { prevTotal += num(v.total); });

    var ids = {};
    ventas.forEach(function (v) { ids[v.id] = true; });
    var costos = {};
    db.productos.forEach(function (p) { costos[p.id] = { costo: num(p.costoStd), sku: p.sku, nombre: p.nombre, categoria: p.categoria, precioVenta: num(p.precioVenta) }; });
    var margen = 0, ingresos = 0, costoTotal = 0, descuentos = 0, nRegalos = 0, costoRegalos = 0;
    db.ventaDetalle.forEach(function (d) {
      if (!ids[d.ventaId]) return;
      var costo = costoLineaDemo(d, costos) * num(d.cantidad);
      ingresos += num(d.subtotal); costoTotal += costo;
      if (String(d.esRegalo || 'No').toUpperCase() === 'SÍ' || String(d.esRegalo || 'No').toUpperCase() === 'SI') { nRegalos++; costoRegalos += costo; }
      margen += num(d.subtotal) - costo;
    });
    ventas.forEach(function (v) { descuentos += num(v.descuentoTotal); });

    var porMetodoMap = {};
    ventas.forEach(function (v) {
      var m = v.metodoPago || 'Efectivo';
      if (!porMetodoMap[m]) porMetodoMap[m] = { metodo: m, n: 0, total: 0 };
      porMetodoMap[m].n++; porMetodoMap[m].total = red(porMetodoMap[m].total + num(v.total));
    });
    var metodos = Object.keys(porMetodoMap).map(function (k) { return porMetodoMap[k]; }).sort(function (a, b) { return b.total - a.total; });

    var porHora = [];
    for (var h = 0; h < 24; h++) porHora.push({ hora: h, n: 0, total: 0 });
    ventas.forEach(function (v) {
      var hora = parseInt(String(v.fecha).slice(11, 13), 10);
      if (isNaN(hora) || hora < 0 || hora > 23) return;
      porHora[hora].n++; porHora[hora].total = red(porHora[hora].total + num(v.total));
    });
    var horaPico = null;
    porHora.forEach(function (p) { if (p.total > 0 && (!horaPico || p.total > horaPico.total)) horaPico = { hora: p.hora, total: p.total, n: p.n }; });

    var porSemana = [];
    for (var sI = 0; sI < 7; sI++) porSemana.push({ indice: sI, dia: DIAS_SEMANA_ES[sI], n: 0, total: 0 });
    ventas.forEach(function (v) {
      var js = new Date(String(v.fecha).slice(0, 10) + 'T12:00:00').getDay();
      var idx = (js + 6) % 7;
      porSemana[idx].n++; porSemana[idx].total = red(porSemana[idx].total + num(v.total));
    });
    var peorDia = null;
    porSemana.forEach(function (p) { if (!peorDia || p.total < peorDia.total) peorDia = { dia: p.dia, total: p.total, n: p.n }; });

    var mapaSerie = {}, serieDiaria = [];
    for (var i = 0; i < dias; i++) {
      var clave = restarDiasDemo(desde, -i);
      var f = new Date(clave + 'T12:00:00');
      var fila = { fecha: clave, etiqueta: f.getDate() + ' ' + MESES_CORTOS_ES[f.getMonth()], total: 0, n: 0 };
      mapaSerie[clave] = fila; serieDiaria.push(fila);
    }
    ventas.forEach(function (v) {
      var f = mapaSerie[String(v.fecha).slice(0, 10)];
      if (!f) return;
      f.total = red(f.total + num(v.total)); f.n++;
    });

    var porProducto = {};
    db.ventaDetalle.forEach(function (d) {
      if (!ids[d.ventaId]) return;
      if (!porProducto[d.productoId]) porProducto[d.productoId] = { productoId: d.productoId, sku: d.sku, descripcion: d.descripcion, cantidad: 0, total: 0, margen: 0 };
      var costo = costoLineaDemo(d, costos) * num(d.cantidad);
      porProducto[d.productoId].cantidad += num(d.cantidad);
      porProducto[d.productoId].total += num(d.subtotal);
      porProducto[d.productoId].margen += num(d.subtotal) - costo;
    });
    var topProductos = Object.keys(porProducto).map(function (k) {
      var p = porProducto[k];
      return { productoId: k, sku: p.sku, descripcion: p.descripcion, cantidad: red(p.cantidad), total: red(p.total), margen: red(p.margen) };
    }).sort(function (a, b) { return b.total - a.total; }).slice(0, 8);

    var porCliente = {};
    ventas.forEach(function (v) {
      var k = String(v.clienteNombre || 'Público General');
      if (!porCliente[k]) porCliente[k] = { nombre: k, n: 0, total: 0 };
      porCliente[k].n++; porCliente[k].total = red(porCliente[k].total + num(v.total));
    });
    var topClientes = Object.keys(porCliente).map(function (k) { return porCliente[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 8);

    var fiado = sumaSaldoFiadoDemo();
    return {
      desde: desde, hasta: hasta, dias: dias, prevDesde: prevDesde, prevHasta: prevHasta,
      moneda: db.config.MONEDA_SIMBOLO || 'S/',
      kpis: {
        total: red(total), nVentas: ventas.length,
        ticketPromedio: ventas.length ? red(total / ventas.length) : 0,
        margen: red(margen), margenPct: ingresos > 0 ? red(margen / ingresos * 100, 1) : 0,
        ingresos: red(ingresos), costo: red(costoTotal),
        deltaTotalPct: prevTotal > 0 ? red((total - prevTotal) / prevTotal * 100, 1) : null,
        deltaNPct: ventasPrev.length > 0 ? red((ventas.length - ventasPrev.length) / ventasPrev.length * 100, 1) : null,
        prevTotal: red(prevTotal), prevN: ventasPrev.length,
        descuentos: red(descuentos), nRegalos: nRegalos, costoRegalos: red(costoRegalos),
        fiadoPendiente: fiado.total, fiadoClientes: fiado.n
      },
      porMetodo: metodos, porHora: porHora, porDiaSemana: porSemana,
      serieDiaria: serieDiaria, topProductos: topProductos, topClientes: topClientes,
      horaPico: horaPico, peorDia: peorDia,
      metodoLider: metodos.length ? { metodo: metodos[0].metodo, total: metodos[0].total, pct: total > 0 ? red(metodos[0].total / total * 100, 1) : 0 } : null
    };
  };

  H.rentabilidad_producto = function (c) {
    sesionDe(c);
    var hoy = diaStr(new Date());
    var desde = c.fechaDesde || (hoy.slice(0, 8) + '01');
    var hasta = c.fechaHasta || hoy;
    if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    var ventas = ventasEntreDemo(desde, hasta);
    var ids = {};
    ventas.forEach(function (v) { ids[v.id] = true; });
    var costos = {};
    db.productos.forEach(function (p) { costos[p.id] = { costo: num(p.costoStd), sku: p.sku, nombre: p.nombre, categoria: p.categoria, precioVenta: num(p.precioVenta) }; });

    var porProducto = {};
    db.ventaDetalle.forEach(function (d) {
      if (!ids[d.ventaId]) return;
      var k = d.productoId;
      if (!porProducto[k]) {
        var ref = costos[k] || {};
        porProducto[k] = { productoId: k, sku: d.sku || ref.sku || '', descripcion: d.descripcion || ref.nombre || k, categoria: ref.categoria || 'General', cantVendida: 0, cantRegalada: 0, ingresos: 0, costo: 0, precioActual: num(ref.precioVenta), costoActual: num(ref.costo) };
      }
      var costo = costoLineaDemo(d, costos) * num(d.cantidad);
      porProducto[k].costo = red(porProducto[k].costo + costo);
      var esR = String(d.esRegalo || 'No').toUpperCase();
      if (esR === 'SÍ' || esR === 'SI') porProducto[k].cantRegalada = red(porProducto[k].cantRegalada + num(d.cantidad));
      else {
        porProducto[k].cantVendida = red(porProducto[k].cantVendida + num(d.cantidad));
        porProducto[k].ingresos = red(porProducto[k].ingresos + num(d.subtotal));
      }
    });

    var filas = Object.keys(porProducto).map(function (k) {
      var p = porProducto[k];
      p.margen = red(p.ingresos - p.costo);
      p.margenPct = p.ingresos > 0 ? red(p.margen / p.ingresos * 100, 1) : (p.margen < 0 ? -100 : 0);
      return p;
    });
    var totales = { ingresos: 0, costo: 0, margen: 0, cantVendida: 0, cantRegalada: 0 };
    filas.forEach(function (f) { totales.ingresos += f.ingresos; totales.costo += f.costo; totales.margen += f.margen; totales.cantVendida += f.cantVendida; totales.cantRegalada += f.cantRegalada; });
    totales.ingresos = red(totales.ingresos); totales.costo = red(totales.costo); totales.margen = red(totales.margen);
    totales.cantVendida = red(totales.cantVendida); totales.cantRegalada = red(totales.cantRegalada);
    totales.margenPct = totales.ingresos > 0 ? red(totales.margen / totales.ingresos * 100, 1) : 0;
    filas.sort(function (a, b) { return b.margen - a.margen; });

    return {
      desde: desde, hasta: hasta, moneda: db.config.MONEDA_SIMBOLO || 'S/',
      filas: filas, totales: totales,
      sinCosto: filas.filter(function (f) { return f.costo <= 0 && f.cantVendida + f.cantRegalada > 0; }).length
    };
  };

  H.panel_control = function (c) {
    var s = sesionDe(c); permiso(s, 'panel:read');
    var hoy = diaStr(new Date());
    var mes = hoy.slice(0, 7);
    var horarioInicio = String(db.config.HORARIO_INICIO || '');
    var horarioFin = String(db.config.HORARIO_FIN || '');
    var alertas = [];
    var ventasHoy = 0, ventasHoyTotal = 0, ventasMes = 0, ingresosMes = 0, descuentosMes = 0, anuladasMes = 0, fueraHorarioMes = 0;

    db.ventas.forEach(function (v) {
      var dia = String(v.fecha).slice(0, 10);
      var esMes = dia.slice(0, 7) === mes;
      if (v.estado === 'EMITIDA' && dia === hoy) { ventasHoy++; ventasHoyTotal = red(ventasHoyTotal + num(v.total)); }
      if (esMes && v.estado === 'ANULADA') {
        anuladasMes++;
        alertas.push({ severidad: 'media', tipo: 'ANULACION', texto: 'Boleta ' + v.boleta + ' anulada por ' + v.usuario + '. Motivo: ' + (v.anuladoMotivo || '—'), fecha: v.fecha });
      }
      if (esMes && v.estado === 'EMITIDA') {
        ventasMes++; ingresosMes += num(v.total); descuentosMes += num(v.descuentoTotal);
        if (v.autorizadoPor) alertas.push({ severidad: 'info', tipo: 'AUTORIZACION', texto: v.boleta + ': descuento/regalo autorizado por ' + v.autorizadoPor, fecha: v.fecha });
        if (horarioInicio && horarioFin) {
          var mins = parseInt(String(v.fecha).slice(11, 13), 10) * 60 + parseInt(String(v.fecha).slice(14, 16), 10);
          var p = function (x) { var t2 = String(x).split(':'); return (parseInt(t2[0], 10) || 0) * 60 + (parseInt(t2[1], 10) || 0); };
          if (mins < p(horarioInicio) || mins > p(horarioFin)) {
            fueraHorarioMes++;
            alertas.push({ severidad: 'media', tipo: 'HORARIO', texto: v.boleta + ' emitida fuera del horario (' + horarioInicio + '–' + horarioFin + ') por ' + v.usuario, fecha: v.fecha });
          }
        }
      }
    });

    var diasAlerta = parseInt(db.config.FIADO_DIAS_ALERTA, 10) || 30;
    var hoyMs = new Date(hoy).getTime();
    var nombresCli = {};
    db.clientes.forEach(function (cli) { nombresCli[cli.id] = cli.razonSocial; });
    var fiadoMasAntiguo = {};
    db.ventas.forEach(function (v) {
      if (v.estado !== 'EMITIDA' || estadoPagoDe(v) !== 'FIADO' || !v.clienteId) return;
      var dias = Math.round((hoyMs - new Date(String(v.fecha).slice(0, 10) + 'T12:00:00').getTime()) / 86400000);
      if (!fiadoMasAntiguo[v.clienteId] || dias > fiadoMasAntiguo[v.clienteId].dias) {
        fiadoMasAntiguo[v.clienteId] = { dias: dias, boleta: v.boleta, total: num(v.total) };
      }
    });
    var fiado = sumaSaldoFiadoDemo();
    var fiadoCriticos = 0;
    Object.keys(fiadoMasAntiguo).forEach(function (cliId) {
      var info = fiadoMasAntiguo[cliId];
      if (info.dias > diasAlerta) {
        fiadoCriticos++;
        alertas.push({ severidad: 'alta', tipo: 'FIADO', texto: 'Fiado vencido (' + info.dias + ' días): ' + (nombresCli[cliId] || cliId) + ' — ' + (db.config.MONEDA_SIMBOLO || 'S/') + ' ' + info.total.toFixed(2) + ' (' + info.boleta + ')', fecha: '' });
      }
    });

    var diferenciasCaja = 0;
    var limite30 = restarDiasDemo(hoy, 30);
    db.caja.forEach(function (f) {
      if (f.estado !== 'CERRADA') return;
      var dia = String(f.fecha).slice(0, 10);
      if (dia < limite30) return;
      var dif = num(f.diferencia);
      if (Math.abs(dif) > 0.004) {
        diferenciasCaja++;
        alertas.push({ severidad: 'alta', tipo: 'CAJA', texto: 'Caja ' + f.id + ' (' + dia + ') cerrada con diferencia de ' + (db.config.MONEDA_SIMBOLO || 'S/') + ' ' + dif.toFixed(2) + ' — cajero: ' + f.usuario, fecha: f.cierreAt || '' });
      }
    });

    var criticos = [];
    db.stock.forEach(function (sR) {
      var p = porId('productos', sR.productoId);
      if (!p || p.estado !== 'ACTIVO') return;
      if (num(p.stockMin) > 0 && num(sR.cantidad) <= num(p.stockMin)) criticos.push(p.nombre + ' (' + num(sR.cantidad) + ' ' + p.unidad + ', mín ' + num(p.stockMin) + ')');
    });
    if (criticos.length) alertas.push({ severidad: 'media', tipo: 'STOCK', texto: criticos.length + ' producto(s) en nivel crítico: ' + criticos.slice(0, 3).join('; ') + (criticos.length > 3 ? '…' : ''), fecha: '' });

    var usuariosActivos = db.usuarios.filter(function (u) { return u.estado === 'ACTIVO'; }).length;
    var cotizacionesVigentes = db.cotizaciones.filter(function (x) { return x.estado === 'VIGENTE'; }).length;
    var auditoria = db.auditoria.slice(-8).reverse().map(function (a) { return { fecha: a.fecha, usuario: a.usuario, accion: a.accion, detalle: a.detalle }; });

    var ordenSev = { alta: 0, media: 1, info: 2 };
    alertas.sort(function (a, b) { return (ordenSev[a.severidad] - ordenSev[b.severidad]) || String(b.fecha).localeCompare(String(a.fecha)); });

    return {
      moneda: db.config.MONEDA_SIMBOLO || 'S/', generado: ahoraStr(),
      kpis: {
        ventasHoyTotal: ventasHoyTotal, ventasHoyN: ventasHoy,
        ingresosMes: red(ingresosMes), ventasMes: ventasMes, descuentosMes: red(descuentosMes),
        anuladasMes: anuladasMes, fueraHorarioMes: fueraHorarioMes, diferenciasCaja: diferenciasCaja,
        fiadoPendiente: fiado.total, fiadoClientes: fiado.n, fiadoCriticos: fiadoCriticos,
        productosCriticos: criticos.length, usuariosActivos: usuariosActivos, cotizacionesVigentes: cotizacionesVigentes
      },
      alertas: alertas.slice(0, 40), auditoria: auditoria
    };
  };

  /* ============================ PUERTO PÚBLICO ============================ */

  async function dispatch(peticion) {
    await cargar();
    var accion = String(peticion.action || '');
    try {
      var h = H[accion];
      if (!h) return { ok: false, data: null, error: 'Acción no reconocida: ' + accion, code: 'UNKNOWN_ACTION' };
      var data = await h(peticion);
      return { ok: true, data: data, error: null, code: null };
    } catch (err) {
      if (err instanceof ApiError_) return { ok: false, data: null, error: err.mensaje, code: err.code };
      console.error('Demo error:', err);
      return { ok: false, data: null, error: 'Error interno de la demo: ' + err.message, code: 'INTERNAL' };
    }
  }

  return { dispatch: dispatch, reiniciar: reiniciar, cargar: cargar };
})();
