/**
 * ================================================================
 * NexoERP — 10_Ventas.gs  (ADENDA: POS de mostrador y Boletas)
 * Venta directa, correlativo de boleta, métodos de pago,
 * anulación con reversión de stock y resumen de ventas.
 * ================================================================
 * Flujo de una venta:
 *   1. Valida sesión + permiso "ventas:registrar" (en el SERVIDOR).
 *   2. Bajo LockService: valida productos, stock del almacén de venta
 *      y totales; obtiene el correlativo de boleta (pestaña Numeracion).
 *   3. Descarga stock con el motor real (SALIDA por ítem, FEFO si el
 *      producto maneja lotes) generando movimientos y kardex.
 *   4. Registra la venta (pestaña Ventas) y su detalle (VentaDetalle),
 *      guardando el método de pago para el cuadre de caja.
 */

/* ---------------------- Helpers de ventas ---------------------- */

/**
 * Correlativo seguro de la pestaña Numeracion. Debe invocarse con el
 * LockService ya tomado (ventas_registrar toma el lock del módulo).
 */
function siguienteCorrelativo_(tipo) {
  var filas = dbLeer_(APP.SHEETS.NUMERACION);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].tipo).toUpperCase() === String(tipo).toUpperCase()) {
      var nuevo = entero_(filas[i].correlativo, 0) + 1;
      dbHoja_(APP.SHEETS.NUMERACION).getRange(filas[i]._fila, 3).setValue(nuevo);
      return { prefijo: String(filas[i].prefijo || ''), numero: nuevo, texto: String(filas[i].prefijo || '') + rellenar_(nuevo, 4) };
    }
  }
  throw new ApiError_('No existe el correlativo "' + tipo + '" en la pestaña Numeracion. Ejecute setupSystem().', 'NO_SHEET');
}

function rellenar_(n, ancho) {
  var s = String(n);
  while (s.length < ancho) s = '0' + s;
  return s;
}

/** Snapshot de la identidad fiscal para imprimir en la boleta. */
function empresaSnapshot_(cfg) {
  return {
    razonSocial: cfg.RAZON_SOCIAL || cfg.NOMBRE_EMPRESA || '',
    ruc: cfg.RUC || '',
    /* Adenda 1.5: contacto impreso en la cabecera del PDF de proforma. */
    direccion: cfg.DIRECCION_EMPRESA || '',
    telefono: cfg.TELEFONO_EMPRESA || '',
    logoUrl: cfg.LOGO_URL || '',
    logoBase64: cfg.LOGO_BASE64 || '',
    moneda: cfg.MONEDA_SIMBOLO || 'S/',
    mensajeBoleta: cfg.MENSAJE_BOLETA || '¡Gracias por su compra!',
    igvIncluido: boolStr_(cfg.IGV_INCLUIDO),
    igvTasa: numero_(cfg.IGV_TASA, 18),
    horarioInicio: cfg.HORARIO_INICIO || '',
    horarioFin: cfg.HORARIO_FIN || ''
  };
}

/**
 * Totales de la venta. Si IGV_INCLUIDO = "Sí", los precios de venta ya
 * traen el IGV (práctica común en Perú): Total = Σ importes; el IGV se
 * desglosa hacia atrás. Si es "No", el IGV se suma al final.
 */
function calcularTotalesVenta_(cfg, bruto) {
  var tasa = numero_(cfg.IGV_TASA, 18) / 100;
  var incluir = boolStr_(cfg.IGV_INCLUIDO);
  var total, subtotal, igv;
  if (incluir) {
    total = redondear_(bruto);
    igv = redondear_(total - total / (1 + tasa));
    subtotal = redondear_(total - igv);
  } else {
    subtotal = redondear_(bruto);
    igv = redondear_(subtotal * tasa);
    total = redondear_(subtotal + igv);
  }
  return { subtotal: subtotal, igv: igv, total: total, tasa: numero_(cfg.IGV_TASA, 18), igvIncluido: incluir };
}

/** Resuelve el cliente de la boleta (registro existente o Público General). */
function clienteDeVenta_(clienteId, clienteNombreOverride) {
  var docTipo = 'DNI', docNumero = '00000000', nombre = 'Público General', id = '', telefono = '', direccion = '';
  if (clienteId && String(clienteId) !== 'PUBLICO') {
    var cli = dbPorId_(APP.SHEETS.CLIENTES, clienteId);
    if (!cli) throw new ApiError_('Cliente no encontrado: ' + clienteId, 'NOT_FOUND');
    id = cli.id;
    nombre = cli.razonSocial || nombre;
    docNumero = cli.documento || docNumero;
    docTipo = String(docNumero).length === 11 ? 'RUC' : 'DNI';
    telefono = String(cli.telefono || '').trim();
    direccion = String(cli.direccion || '').trim();
  } else if (clienteNombreOverride) {
    nombre = String(clienteNombreOverride);
  }
  return { id: id, docTipo: docTipo, docNumero: docNumero, nombre: nombre, telefono: telefono, direccion: direccion };
}

/* ------------------- Autorización de supervisor (Adenda 1.2) ------------------- */

/**
 * Valida credenciales REALES de un usuario con rol admin/gerente para
 * aprobar descuentos fuera de política o regalos. Se usa tanto en la
 * acción "ventas_autorizar" (chequeo previo en el UI) como dentro de
 * "ventas_registrar" (re-validación en servidor, nunca se confía en el
 * cliente). Devuelve la etiqueta "Nombre (usuario)" del autorizador.
 */
function validarAutorizacion_(auth) {
  var usuario = String(auth && auth.usuario || '').trim().toLowerCase();
  var password = String(auth && auth.password || '');
  if (!usuario || !password) {
    throw new ApiError_('Esta venta incluye descuentos o regalos que requieren la autorización de un gerente o administrador.', 'AUTORIZACION');
  }
  /* Fuerza bruta: un operador no puede adivinar credenciales de supervisor. */
  if (rlBloqueado_('autorizar', usuario)) {
    throw new ApiError_('Demasiados intentos de autorización fallidos. Espere 5 minutos antes de reintentar.', 'RATE_LIMIT');
  }
  var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
  var fila = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].usuario).trim().toLowerCase() === usuario) { fila = usuarios[i]; break; }
  }
  if (!fila || String(fila.estado).trim().toUpperCase() !== 'ACTIVO' ||
      !verificarPassword_(password, fila.salt, fila.hash)) {
    rlRegistrarFallo_('autorizar', usuario);
    throw new ApiError_('Credenciales del supervisor inválidas. La venta requiere autorización de admin/gerente.', 'AUTORIZACION');
  }
  rlLimpiar_('autorizar', usuario);
  var rol = String(fila.rol).trim().toLowerCase();
  if (['admin', 'gerente'].indexOf(rol) === -1) {
    throw new ApiError_('El usuario "' + fila.usuario + '" (' + rol + ') no tiene autoridad para aprobar descuentos ni regalos.', 'FORBIDDEN');
  }
  return fila.nombre + ' (' + String(fila.usuario).trim() + ')';
}

/* ---------------------- Registrar venta (POS) ---------------------- */

function ventasRegistrar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'ventas:registrar');
  return registrarVentaCore_(ses, c);
}

/**
 * Núcleo reutilizable de registro de ventas (Adenda 1.3). Lo invocan
 * "ventas_registrar" (POS) y "cotizaciones_convertir". Valida ítems,
 * política de precios, stock, FIADO y correlativos bajo LockService.
 * c: { items, clienteId, clienteNombre, metodoPago, montoRecibido,
 *      almacenId, autorizacion, esCotizacion, cotizacionNumero }
 */
function registrarVentaCore_(ses, c) {
  var items = c.items || [];
  if (!items.length) throw new ApiError_('Agregue al menos un producto a la venta.', 'VALIDATION');
  var metodoPago = String(c.metodoPago || c.metodo_pago || '').trim();
  if (!metodoPago) metodoPago = String(configLeer_().METODO_PAGO_DEFAULT || 'Efectivo');
  if (APP.METODOS_PAGO.indexOf(metodoPago) === -1) {
    throw new ApiError_('Método de pago no válido: ' + metodoPago + '. Permitidos: ' + APP.METODOS_PAGO.join(', ') + '.', 'VALIDATION');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cfg = configLeer_();
    var almacenVenta = String(c.almacenId || cfg.ALMACEN_VENTA || 'ALM-0003');
    var almacen = dbPorId_(APP.SHEETS.ALMACENES, almacenVenta);
    if (!almacen || String(almacen.estado).toUpperCase() !== 'ACTIVO') {
      throw new ApiError_('El almacén de venta "' + almacenVenta + '" no existe o está inactivo. Revise ALMACEN_VENTA en Configuración.', 'VALIDATION');
    }
    var permitirNegativo = boolStr_(cfg.PERMITIR_STOCK_NEGATIVO);

    /* --- 1) Validación de ítems, precios, descuentos, regalos y stock --- */
    var lineas = [];
    var bruto = 0;
    var descuentoTotal = 0;
    var motivosAutorizacion = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var prod = dbPorId_(APP.SHEETS.PRODUCTOS, it.productoId);
      if (!prod) throw new ApiError_('Producto no encontrado: ' + it.productoId, 'NOT_FOUND');
      if (String(prod.estado).toUpperCase() !== 'ACTIVO') throw new ApiError_('El producto "' + prod.nombre + '" está inactivo.', 'VALIDATION');
      var cant = numero_(it.cantidad, 0);
      if (cant <= 0) throw new ApiError_('Cantidad inválida para "' + prod.nombre + '".', 'VALIDATION');

      /* Adenda 1.6: fraccionamiento — vender en unidad secundaria
       * (ej. compro caja x24 y vender por unidad: factor 24). */
      var factor = Math.max(1, numero_(it.factorFraccion, 1) || 1);
      var unidadVenta = String(it.unidadVenta || prod.unidad || '').trim() || String(prod.unidad);
      var cantBase = redondear_(cant * factor, 3);

      /* Adenda 1.2: precio editable + REGALO (precio 0, sigue descontando stock).
       * Adenda 1.6: precios por escala (mayorista) automáticos según cantidad. */
      var esRegalo = boolStr_(it.esRegalo);
      var precioOrig = numero_(prod.precioVenta);
      var precioAuto = '';
      var precio;
      if (esRegalo) {
        precio = 0;
      } else if (it.precio === '' || it.precio === undefined || it.precio === null) {
        if (factor > 1) {
          /* Venta por bulto: el precio se multiplica por el factor */
          precio = redondear_(precioOrig * factor, 2);
        } else {
          precio = precioOrig;
          if (numero_(prod.escala3Min) > 0 && cant >= numero_(prod.escala3Min) && numero_(prod.precio3) > 0) {
            precio = numero_(prod.precio3); precioAuto = 'escala 3';
          } else if (numero_(prod.escala2Min) > 0 && cant >= numero_(prod.escala2Min) && numero_(prod.precio2) > 0) {
            precio = numero_(prod.precio2); precioAuto = 'escala 2';
          }
        }
      } else {
        precio = numero_(it.precio);
      }
      if (precio < 0) throw new ApiError_('Precio inválido para "' + prod.nombre + '".', 'VALIDATION');

      /* Precio de referencia para el descuento (por unidad de venta). */
      var precioRef = factor > 1 ? redondear_(precioOrig * factor, 2) : precioOrig;
      var desc = esRegalo ? 0 : Math.max(0, numero_(it.descuento, 0));
      var importe = redondear_(cant * precio - desc);
      if (importe < 0) throw new ApiError_('El descuento de la línea "' + prod.nombre + '" excede su importe.', 'VALIDATION');
      var descLinea = redondear_(Math.max(0, cant * precioRef - importe));

      var disponible = stockCantidad_(prod.id, almacenVenta);
      if (!permitirNegativo && cantBase > disponible) {
        throw new ApiError_('Stock insuficiente de "' + prod.nombre + '" en ' + almacen.nombre + '. Disponible: ' + disponible + ' ' + prod.unidad + '.', 'VALIDATION');
      }
      bruto += importe;
      descuentoTotal = redondear_(descuentoTotal + descLinea);

      /* ¿La línea usa una escala mayorista válida? (no exige gerente) */
      var escalaPermite = false;
      if (numero_(prod.escala2Min) > 0 && cant >= numero_(prod.escala2Min) && numero_(prod.precio2) > 0 && precio >= numero_(prod.precio2) - 0.001) escalaPermite = true;
      else if (numero_(prod.escala3Min) > 0 && cant >= numero_(prod.escala3Min) && numero_(prod.precio3) > 0 && precio >= numero_(prod.precio3) - 0.001) escalaPermite = true;

      /* ¿Requiere autorización de gerente? (regalo, precio bajo el mínimo
       * fuera de escala o descuento que excede DESCUENTO_MAX_PCT) */
      var motivoAut = '';
      if (esRegalo && boolStr_(cfg.REGALO_REQUIERE_AUTORIZACION)) {
        motivoAut = 'regalo';
      } else {
        var precioMin = numero_(prod.precioMinimo);
        if (precioMin > 0 && precio < precioMin && !escalaPermite) {
          motivoAut = 'precio bajo el mínimo (' + cfg.MONEDA_SIMBOLO + ' ' + precioMin.toFixed(2) + ')';
        } else {
          var maxPct = numero_(cfg.DESCUENTO_MAX_PCT, 0);
          if (boolStr_(cfg.DESCUENTO_REQUIERE_AUTORIZACION) && maxPct > 0 && cant * precioRef > 0) {
            var pct = (descLinea / (cant * precioRef)) * 100;
            if (pct > maxPct) motivoAut = 'descuento ' + pct.toFixed(1) + '% > ' + maxPct + '%';
          }
        }
      }
      if (motivoAut) motivosAutorizacion.push(prod.nombre + ' — ' + motivoAut);

      lineas.push({
        productoId: prod.id, sku: prod.sku, descripcion: prod.nombre, unidad: prod.unidad,
        cantidad: cantBase, cantVenta: cant, unidadVenta: unidadVenta, factorFraccion: factor,
        precioUnit: precio, precioOriginal: precioRef,
        esRegalo: esRegalo, descuento: desc, subtotal: importe, descLinea: descLinea,
        requiereLote: boolStr_(prod.requiereLote), producto: prod
      });
    }

    /* --- Autorización: se validan credenciales REALES en el servidor --- */
    var autorizadoPor = '';
    if (motivosAutorizacion.length) {
      autorizadoPor = validarAutorizacion_(c.autorizacion);
    }

    /* --- 2) Correlativos, totales y validación de FIADO --- */
    var corB = siguienteCorrelativo_('BOLETA');
    var corV = siguienteCorrelativo_('VENTA');
    var boleta = corB.texto;

    var cliente = clienteDeVenta_(c.clienteId, c.clienteNombre);

    /* Adenda 1.6: canje de puntos de fidelización (descuento global). */
    var puntosUsados = 0, descuentoCanje = 0;
    if (boolStr_(cfg.FIDEL_ACTIVA) && cliente.id && entero_(c.puntosUsar, 0) > 0) {
      var cliP = dbPorId_(APP.SHEETS.CLIENTES, cliente.id) || {};
      var saldoPts = entero_(cliP.puntos);
      puntosUsados = entero_(c.puntosUsar);
      var minCanje = entero_(cfg.FIDEL_MIN_CANJE, 0);
      if (puntosUsados < minCanje) throw new ApiError_('El canje mínimo es de ' + minCanje + ' puntos.', 'VALIDATION');
      if (puntosUsados > saldoPts) throw new ApiError_('El cliente solo tiene ' + saldoPts + ' puntos disponibles.', 'VALIDATION');
      descuentoCanje = redondear_(Math.min(puntosUsados * numero_(cfg.FIDEL_VALOR_PUNTO, 0), bruto));
    }

    var totales = calcularTotalesVenta_(cfg, Math.max(0, bruto - descuentoCanje));
    descuentoTotal = redondear_(descuentoTotal + descuentoCanje);

    var montoRecibido = numero_(c.montoRecibido, 0);
    if (metodoPago === 'Efectivo' && montoRecibido > 0 && montoRecibido < totales.total) {
      throw new ApiError_('El monto recibido (' + redondear_(montoRecibido) + ') es menor al total (' + totales.total + ').', 'VALIDATION');
    }
    var vuelto = (metodoPago === 'Efectivo' && montoRecibido > 0) ? redondear_(montoRecibido - totales.total) : 0;

    var fecha = fechaNow_();
    var ventaId = corV.texto;

    /* Adenda 1.3: FIADO — exige cliente registrado y respeta el límite
     * de crédito configurado (saldo + venta no puede superar el límite
     * salvo que FIADO_PERMITIR_EXCEDER = "Sí"). */
    var estadoPago = 'PAGADO';
    if (metodoPago === 'Fiado') {
      if (!cliente.id) {
        throw new ApiError_('El fiado requiere un cliente registrado en el catálogo (no "Público General").', 'VALIDATION');
      }
      var cliFila = dbPorId_(APP.SHEETS.CLIENTES, cliente.id);
      if (!cliFila) throw new ApiError_('Cliente no encontrado: ' + cliente.id, 'NOT_FOUND');
      var limite = numero_(cliFila.limiteFiado);
      var saldoActual = numero_(cliFila.saldoFiado);
      if (limite > 0 && !boolStr_(cfg.FIADO_PERMITIR_EXCEDER) && saldoActual + totales.total > limite + 0.009) {
        throw new ApiError_('Límite de fiado excedido para "' + cliFila.razonSocial + '". Saldo actual: ' + saldoActual.toFixed(2) + ' · Límite: ' + limite.toFixed(2) + ' · Esta venta: ' + totales.total.toFixed(2) + '.', 'VALIDATION');
      }
      estadoPago = 'FIADO';
    }

    /* Adenda 1.6: venta a crédito con plan de cuotas (CxC). */
    if (metodoPago === 'Credito') {
      if (!cliente.id) {
        throw new ApiError_('La venta a crédito requiere un cliente registrado en el catálogo (no "Público General").', 'VALIDATION');
      }
      estadoPago = 'CREDITO';
    }

    /* --- 3) Descarga de stock con el motor real (SALIDA por ítem) --- */
    var detalle = [];
    var movIds = [];
    var obsBase = c.esCotizacion ? ('Venta desde cotización ' + (c.cotizacionNumero || '')) : ('Venta POS — ' + metodoPago);
    for (var j = 0; j < lineas.length; j++) {
      var lin = lineas[j];
      var res = ejecutarMovimiento_({
        tipo: 'SALIDA',
        productoId: lin.productoId,
        producto: lin.producto,
        cantidad: lin.cantidad,
        costoUnitario: null,
        lote: '',
        numeroSerie: '',
        fechaVencimiento: '',
        almacenOrigenId: almacenVenta,
        almacenDestinoId: '',
        documentoRef: boleta,
        observaciones: obsBase,
        motivo: '',
        requiereLote: lin.requiereLote,
        permitirNegativo: permitirNegativo
      }, ses);
      movIds.push(res.id);
      detalle.push({
        id: '', ventaId: ventaId, productoId: lin.productoId, sku: lin.sku,
        descripcion: lin.descripcion, cantidad: lin.cantidad,
        unidadVenta: lin.unidadVenta, factorFraccion: lin.factorFraccion,
        precioUnit: lin.precioUnit, precioOriginal: lin.precioOriginal,
        esRegalo: lin.esRegalo ? 'Sí' : 'No', descuento: lin.descuento, subtotal: lin.subtotal,
        costoUnit: res.costoUnitario,   // Adenda 1.3: costo real de la salida (rentabilidad)
        movimientoId: res.id, lote: (res.lotesConsumidos && res.lotesConsumidos.length)
          ? res.lotesConsumidos.map(function (l) { return l.lote; }).join(' + ') : ''
      });
    }

    /* --- 4) Registro de la venta y su detalle --- */
    var venta = {
      id: ventaId, boleta: boleta, fecha: fecha,
      clienteId: cliente.id, clienteDocTipo: cliente.docTipo, clienteDocNumero: cliente.docNumero, clienteNombre: cliente.nombre, clienteTelefono: cliente.telefono,
      subtotal: totales.subtotal, igv: totales.igv, total: totales.total,
      descuentoTotal: descuentoTotal, metodoPago: metodoPago, montoRecibido: redondear_(montoRecibido), vuelto: vuelto,
      almacenId: almacenVenta, usuario: ses.usuario, autorizadoPor: autorizadoPor, estado: 'EMITIDA', anuladoMotivo: '',
      estadoPago: estadoPago, enviadoWhatsapp: 'No',
      vendedor: String(c.vendedorUsuario || ses.usuario).trim(),
      puntosUsados: puntosUsados, puntosGanados: 0,
      tipoComprobante: '', compNumero: '', guiaRemision: ''
    };
    dbInsertar_(APP.SHEETS.VENTAS, venta);
    for (var k = 0; k < detalle.length; k++) {
      detalle[k].id = dbSiguienteId_(APP.SHEETS.VENTA_DETALLE, 'VD-', 6);
      dbInsertar_(APP.SHEETS.VENTA_DETALLE, detalle[k]);
    }

    /* Adenda 1.3: incrementa el saldo de fiado del cliente (cuaderno de fiados). */
    if (estadoPago === 'FIADO') {
      var cliRef = dbPorId_(APP.SHEETS.CLIENTES, cliente.id);
      dbActualizar_(APP.SHEETS.CLIENTES, cliente.id, { saldoFiado: redondear_(numero_(cliRef.saldoFiado) + totales.total) });
    }

    /* --- 5) Adenda 1.6: fidelización, cuotas, comprobante y avisos --- */
    var puntosGanados = 0;
    if (boolStr_(cfg.FIDEL_ACTIVA) && cliente.id) {
      if (puntosUsados > 0) {
        var saldoTrasCanje = Math.max(0, entero_((dbPorId_(APP.SHEETS.CLIENTES, cliente.id) || {}).puntos) - puntosUsados);
        dbActualizar_(APP.SHEETS.CLIENTES, cliente.id, { puntos: saldoTrasCanje });
        fidelHistorialInsertar_(cliente, 'CANJE', -puntosUsados, venta.id, 'Canje venta ' + venta.boleta, saldoTrasCanje);
      }
      var porPunto = numero_(cfg.FIDEL_MONTO_PUNTO, 0);
      puntosGanados = porPunto > 0 ? Math.floor(Math.max(0, totales.total) / porPunto) : 0;
      if (puntosGanados > 0) {
        var saldoFinal = entero_((dbPorId_(APP.SHEETS.CLIENTES, cliente.id) || {}).puntos) + puntosGanados;
        dbActualizar_(APP.SHEETS.CLIENTES, cliente.id, { puntos: saldoFinal });
        fidelHistorialInsertar_(cliente, 'ACUMULO', puntosGanados, venta.id, 'Acumulación venta ' + venta.boleta, saldoFinal);
      }
      dbActualizar_(APP.SHEETS.VENTAS, venta.id, { puntosUsados: puntosUsados, puntosGanados: puntosGanados });
    }

    /* Plan de cuotas para ventas a crédito (Cuentas por cobrar). */
    var planCuotas = [];
    if (estadoPago === 'CREDITO') {
      var plan = c.planCredito || {};
      planCuotas = generarPlanCuotas_(venta, {
        cuotas: plan.cuotas || c.cuotas || 1,
        diasEntre: plan.diasEntre || c.diasEntreCuotas || 15,
        fechaInicio: plan.fechaInicio || c.fechaInicioCredito || '',
        observaciones: plan.observaciones || ''
      });
    }

    /* Comprobante electrónico (Perú / SUNAT) si está activado. */
    var comprobante = comprobanteRegistrarDespuesDeVenta_(ses, cfg, venta, detalle);
    if (comprobante && comprobante.numero) {
      dbActualizar_(APP.SHEETS.VENTAS, venta.id, { tipoComprobante: comprobante.tipo, compNumero: comprobante.numero });
      venta.tipoComprobante = comprobante.tipo;
      venta.compNumero = comprobante.numero;
    }

    /* Avisos flotantes: productos que quedaron en stock crítico. */
    var avisos = [];
    lineas.forEach(function (lin) {
      var disp = stockCantidad_(lin.productoId, almacenVenta);
      if (numero_(lin.producto.stockMin) > 0 && disp <= numero_(lin.producto.stockMin)) {
        avisos.push(lin.descripcion + ' quedó en stock crítico (' + disp + ' ' + lin.unidad + ')');
      }
    });

    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'VENTA',
      'Emitió boleta ' + boleta + ' por ' + cfg.MONEDA_SIMBOLO + ' ' + totales.total + ' (' + metodoPago + ')' +
      (estadoPago === 'FIADO' ? ' [FIADO]' : '') +
      (descuentoTotal > 0 ? ' · Descuentos: ' + cfg.MONEDA_SIMBOLO + ' ' + descuentoTotal : '') +
      (autorizadoPor ? ' · Autorizó: ' + autorizadoPor : '') +
      (c.esCotizacion ? ' · Origen: cotización ' + (c.cotizacionNumero || '') : ''));

    return appOk_({
      venta: serializarVenta_(venta, almacen.nombre, cfg),
      detalle: detalle,
      empresa: empresaSnapshot_(cfg),
      almacenVenta: almacen.nombre,
      /* Adenda 1.6: extras para notificaciones y comprobantes */
      comprobante: comprobante,
      puntosUsados: puntosUsados,
      puntosGanados: puntosGanados,
      cuotas: planCuotas.length,
      avisos: avisos
    });
  } finally {
    lock.releaseLock();
  }
}

function serializarVenta_(v, almacenNombre, cfg) {
  return {
    id: v.id, boleta: v.boleta, fecha: fechaStr_(v.fecha),
    clienteId: v.clienteId, clienteDocTipo: v.clienteDocTipo, clienteDocNumero: v.clienteDocNumero, clienteNombre: v.clienteNombre,
    clienteTelefono: String(v.clienteTelefono || ''), clienteDireccion: String(v.clienteDireccion || ''),
    subtotal: numero_(v.subtotal), igv: numero_(v.igv), total: numero_(v.total),
    descuentoTotal: numero_(v.descuentoTotal),
    metodoPago: v.metodoPago, montoRecibido: numero_(v.montoRecibido), vuelto: numero_(v.vuelto),
    almacenId: v.almacenId, almacenNombre: almacenNombre || v.almacenId,
    usuario: v.usuario, autorizadoPor: v.autorizadoPor || '', estado: v.estado, anuladoMotivo: v.anuladoMotivo,
    estadoPago: String(v.estadoPago || (String(v.metodoPago) === 'Fiado' ? 'FIADO' : 'PAGADO')),
    enviadoWhatsapp: String(v.enviadoWhatsapp || 'No'),
    vendedor: String(v.vendedor || v.usuario || ''),
    puntosUsados: entero_(v.puntosUsados), puntosGanados: entero_(v.puntosGanados),
    tipoComprobante: String(v.tipoComprobante || ''), compNumero: String(v.compNumero || ''),
    guiaRemision: String(v.guiaRemision || ''),
    igvIncluido: boolStr_(cfg && cfg.IGV_INCLUIDO), igvTasa: cfg ? numero_(cfg.IGV_TASA, 18) : 18
  };
}

/* ---------------------- Adenda 1.3: WhatsApp ---------------------- */

/**
 * Marca una boleta como enviada por WhatsApp. El mensaje en sí lo
 * construye el frontend (wa.me) — aquí solo queda la trazabilidad.
 */
function ventasMarcarWhatsapp_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'ventas:registrar');
  var filas = dbLeer_(APP.SHEETS.VENTAS);
  var venta = null;
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id) === String(c.id) || String(filas[i].boleta) === String(c.id)) { venta = filas[i]; break; }
  }
  if (!venta) throw new ApiError_('Venta no encontrada: ' + c.id, 'NOT_FOUND');
  dbActualizar_(APP.SHEETS.VENTAS, venta.id, { enviadoWhatsapp: 'Sí' });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'VENTA',
    'Envió por WhatsApp la boleta ' + venta.boleta + (c.telefono ? ' al ' + String(c.telefono) : ''));
  return appOk_({ id: venta.id, boleta: venta.boleta, enviadoWhatsapp: 'Sí' });
}

/* ---------------------- Consulta de ventas ---------------------- */

function ventasList_(c) {
  requiereSesion_(c);
  var desde = c.fechaDesde ? fechaDiaStr_(new Date(c.fechaDesde)) : '';
  var hasta = c.fechaHasta ? fechaDiaStr_(new Date(c.fechaHasta)) : '';
  var estado = String(c.estado || '').toUpperCase();
  var metodo = String(c.metodoPago || '');
  var q = String(c.q || '').toLowerCase();
  var limite = entero_(c.limit, 300) || 300;

  var alms = {};
  dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a.nombre; });

  var out = dbLeer_(APP.SHEETS.VENTAS).reverse().slice(0, limite * 2).map(function (v) {
    return serializarVenta_(v, alms[v.almacenId], configLeer_());
  }).filter(function (v) {
    var dia = String(v.fecha).slice(0, 10);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    if (estado && v.estado !== estado) return false;
    if (metodo && v.metodoPago !== metodo) return false;
    if (q && (v.boleta + ' ' + v.clienteNombre + ' ' + v.usuario).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).slice(0, limite);
  return appOk_(out);
}

/** Venta + detalle + identidad fiscal: alimenta la reimpresión de boletas. */
function ventasGet_(c) {
  requiereSesion_(c);
  var filas = dbLeer_(APP.SHEETS.VENTAS);
  var venta = null;
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id) === String(c.id) || String(filas[i].boleta) === String(c.id)) { venta = filas[i]; break; }
  }
  if (!venta) throw new ApiError_('Venta no encontrada: ' + c.id, 'NOT_FOUND');
  var cfg = configLeer_();
  var detalle = dbLeer_(APP.SHEETS.VENTA_DETALLE)
    .filter(function (d) { return String(d.ventaId) === String(venta.id); })
    .map(function (d) {
      return {
        id: d.id, ventaId: d.ventaId, productoId: d.productoId, sku: d.sku,
        descripcion: d.descripcion, cantidad: numero_(d.cantidad),
        precioUnit: numero_(d.precioUnit), precioOriginal: numero_(d.precioOriginal),
        esRegalo: String(d.esRegalo || 'No'), descuento: numero_(d.descuento),
        costoUnit: numero_(d.costoUnit),
        subtotal: numero_(d.subtotal), lote: d.lote || ''
      };
    });
  var alms = {};
  dbLeer_(APP.SHEETS.ALMACENES).forEach(function (a) { alms[a.id] = a.nombre; });
  return appOk_({ venta: serializarVenta_(venta, alms[venta.almacenId], cfg), detalle: detalle, empresa: empresaSnapshot_(cfg) });
}

/* ---------------------- Anulación de ventas ---------------------- */

function ventasAnular_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'ventas:anular');
  var motivo = String(c.motivo || '').trim();
  if (!motivo) throw new ApiError_('Debe indicar el motivo de la anulación.', 'VALIDATION');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var filas = dbLeer_(APP.SHEETS.VENTAS);
    var venta = null;
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i].id) === String(c.id) || String(filas[i].boleta) === String(c.id)) { venta = filas[i]; break; }
    }
    if (!venta) throw new ApiError_('Venta no encontrada: ' + c.id, 'NOT_FOUND');
    if (String(venta.estado).toUpperCase() === 'ANULADA') throw new ApiError_('La venta ya está anulada.', 'VALIDATION');

    var detalle = dbLeer_(APP.SHEETS.VENTA_DETALLE).filter(function (d) { return String(d.ventaId) === String(venta.id); });
    var prodReqs = {};
    detalle.forEach(function (d) {
      if (prodReqs[d.productoId] === undefined) {
        var p = dbPorId_(APP.SHEETS.PRODUCTOS, d.productoId);
        prodReqs[d.productoId] = p ? boolStr_(p.requiereLote) : false;
      }
    });

    // Revierte el stock con DEVOLUCIONES trazables (referencia la boleta anulada).
    detalle.forEach(function (d) {
      var prodAnul = dbPorId_(APP.SHEETS.PRODUCTOS, d.productoId);
      ejecutarMovimiento_({
        tipo: 'DEVOLUCION',
        productoId: d.productoId,
        producto: prodAnul,
        cantidad: numero_(d.cantidad),
        costoUnitario: null,
        lote: prodReqs[d.productoId] ? String(d.lote || '').split(' + ')[0] : '',
        numeroSerie: '',
        fechaVencimiento: '',
        almacenOrigenId: '',
        almacenDestinoId: venta.almacenId,
        documentoRef: 'ANUL ' + venta.boleta,
        observaciones: 'Anulación de venta ' + venta.boleta,
        motivo: motivo,
        requiereLote: prodReqs[d.productoId],
        permitirNegativo: true
      }, ses);
    });

    dbActualizar_(APP.SHEETS.VENTAS, venta.id, { estado: 'ANULADA', anuladoMotivo: motivo });

    /* Adenda 1.3: si la venta era FIADA, descuenta su importe del saldo
     * del cliente (el crédito queda saldado por la anulación). */
    if (String(venta.metodoPago) === 'Fiado' && venta.clienteId) {
      var cliAn = dbPorId_(APP.SHEETS.CLIENTES, venta.clienteId);
      if (cliAn) {
        var nuevoSaldo = Math.max(0, redondear_(numero_(cliAn.saldoFiado) - numero_(venta.total)));
        dbActualizar_(APP.SHEETS.CLIENTES, venta.clienteId, { saldoFiado: nuevoSaldo });
      }
    }

    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'VENTA_ANULADA',
      'Anuló boleta ' + venta.boleta + '. Motivo: ' + motivo);
    return appOk_({ id: venta.id, boleta: venta.boleta, estado: 'ANULADA', motivo: motivo });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------- Resumen de ventas ---------------------- */

function ventasResumen_(c) {
  requiereSesion_(c);
  var desde = c.fechaDesde ? fechaDiaStr_(new Date(c.fechaDesde)) : Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), APP.TZ, 'yyyy-MM-dd');
  var hasta = c.fechaHasta ? fechaDiaStr_(new Date(c.fechaHasta)) : fechaDiaStr_(fechaNow_());

  var ventas = dbLeer_(APP.SHEETS.VENTAS).filter(function (v) {
    var dia = fechaDiaStr_(v.fecha);
    return String(v.estado).toUpperCase() === 'EMITIDA' && dia >= desde && dia <= hasta;
  });

  var porMetodo = {};
  var porDia = {};
  var porVendedor = {};   // Adenda 1.2
  var totalPeriodo = 0;
  var descuentosTotal = 0;
  ventas.forEach(function (v) {
    var m = v.metodoPago || 'Efectivo';
    if (!porMetodo[m]) porMetodo[m] = { metodo: m, n: 0, total: 0 };
    porMetodo[m].n++;
    porMetodo[m].total = redondear_(porMetodo[m].total + numero_(v.total));
    var dia = fechaDiaStr_(v.fecha);
    if (!porDia[dia]) porDia[dia] = { fecha: dia, n: 0, total: 0 };
    porDia[dia].n++;
    porDia[dia].total = redondear_(porDia[dia].total + numero_(v.total));
    var vend = v.usuario || '—';
    if (!porVendedor[vend]) porVendedor[vend] = { vendedor: vend, n: 0, total: 0 };
    porVendedor[vend].n++;
    porVendedor[vend].total = redondear_(porVendedor[vend].total + numero_(v.total));
    totalPeriodo += numero_(v.total);
    descuentosTotal += numero_(v.descuentoTotal);
  });

  var detalles = dbLeer_(APP.SHEETS.VENTA_DETALLE);
  var idsValidas = {};
  ventas.forEach(function (v) { idsValidas[String(v.id)] = true; });
  var porProducto = {};
  var nRegalos = 0;
  var cantidadRegalada = 0;
  detalles.forEach(function (d) {
    if (!idsValidas[String(d.ventaId)]) return;
    var k = String(d.productoId);
    if (!porProducto[k]) porProducto[k] = { productoId: d.productoId, sku: d.sku, descripcion: d.descripcion, cantidad: 0, total: 0 };
    porProducto[k].cantidad += numero_(d.cantidad);
    porProducto[k].total += numero_(d.subtotal);
    if (String(d.esRegalo || 'No').toUpperCase() === 'SÍ' || String(d.esRegalo || 'No').toUpperCase() === 'SI') {
      nRegalos++;
      cantidadRegalada += numero_(d.cantidad);
    }
  });
  var topProductos = Object.keys(porProducto).map(function (k) {
    return { productoId: k, sku: porProducto[k].sku, descripcion: porProducto[k].descripcion, cantidad: redondear_(porProducto[k].cantidad), total: redondear_(porProducto[k].total) };
  }).sort(function (a, b) { return b.total - a.total; }).slice(0, 10);

  return appOk_({
    desde: desde, hasta: hasta,
    nVentas: ventas.length,
    totalPeriodo: redondear_(totalPeriodo),
    ticketPromedio: ventas.length ? redondear_(totalPeriodo / ventas.length) : 0,
    descuentosTotal: redondear_(descuentosTotal),
    nRegalos: nRegalos, cantidadRegalada: redondear_(cantidadRegalada),
    porMetodo: Object.keys(porMetodo).map(function (k) { return porMetodo[k]; }).sort(function (a, b) { return b.total - a.total; }),
    porDia: Object.keys(porDia).map(function (k) { return porDia[k]; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }),
    porVendedor: Object.keys(porVendedor).map(function (k) { return porVendedor[k]; }).sort(function (a, b) { return b.total - a.total; }),
    topProductos: topProductos
  });
}

/* ---------------------- Semilla de ventas demo ---------------------- */

/**
 * Construye ventas demo a partir de los movimientos SALIDA con documento
 * "BV-*" generados por la semilla (09_Setup), para que Ventas, Caja y
 * Numeración queden consistentes con el histórico del kardex.
 * Adenda 1.3: asigna clientes (con teléfono), distribuye horas de venta,
 * deja una boleta FIADA con abono parcial y guarda el costo real por línea
 * para que el dashboard comparativo y la rentabilidad tengan datos ricos.
 */
function sembrarVentasDemo_() {
  var yaHay = dbLeer_(APP.SHEETS.VENTAS).length > 0;
  if (yaHay) return;

  var prods = {};
  dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) { prods[p.id] = p; });
  var cfg = configLeer_();

  var grupos = {};
  dbLeer_(APP.SHEETS.MOVIMIENTOS).forEach(function (m) {
    var doc = String(m.documentoRef || '');
    if (m.tipo !== 'SALIDA' || String(m.estado).toUpperCase() !== 'ACTIVO') return;
    if (doc.indexOf('BV-') !== 0) return;
    if (!grupos[doc]) grupos[doc] = [];
    grupos[doc].push(m);
  });

  /* Adenda 1.3: clientes demo, fiado y métodos por boleta. */
  var CLIENTES_DEMO = { 'BV-1102': 'CLI-0003', 'BV-1103': 'CLI-0001', 'BV-1104': 'CLI-0002' };
  var METODOS_DEMO = { 'BV-1101': 'Efectivo', 'BV-1102': 'Fiado', 'BV-1103': 'Tarjeta', 'BV-1104': 'Yape', 'BV-1105': 'Efectivo' };
  var fiadoPorCliente = {};
  var boletaFiadoCliente = {};

  var orden = Object.keys(grupos).sort();
  orden.forEach(function (boleta, idx) {
    var movs = grupos[boleta];
    var bruto = 0;
    var lineas = movs.map(function (m) {
      var p = prods[m.productoId] || {};
      var cant = numero_(m.cantidad);
      var precio = numero_(p.precioVenta);
      bruto += cant * precio;
      return { productoId: m.productoId, sku: p.sku || '', descripcion: p.nombre || m.productoId, cantidad: cant, precioUnit: precio, precioOriginal: precio, esRegalo: 'No', descuento: 0, subtotal: redondear_(cant * precio), costoUnit: numero_(p.costoStd), movimientoId: m.id, lote: m.lote || '' };
    });
    if (!lineas.length) return;

    var totales = calcularTotalesVenta_(cfg, bruto);
    var metodo = METODOS_DEMO[boleta] || ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Efectivo'][idx % 5];
    var estadoPago = metodo === 'Fiado' ? 'FIADO' : 'PAGADO';

    /* Hora distribuida 9:00–19:59 para el gráfico "ventas por hora". */
    var fechaBase = new Date(String(movs[0].fecha).replace(' ', 'T'));
    if (isNaN(fechaBase.getTime())) fechaBase = fechaNow_();
    var fechaVenta = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate(), 9 + ((idx * 5) % 11), (idx * 17) % 60, 0);

    var ventaId = 'V-' + rellenar_(idx + 1, 6);
    var cliente = { id: '', docTipo: 'DNI', docNumero: '00000000', nombre: 'Público General', telefono: '' };
    var cliId = CLIENTES_DEMO[boleta];
    if (cliId) {
      var cliFila = dbPorId_(APP.SHEETS.CLIENTES, cliId);
      if (cliFila) {
        cliente = { id: cliFila.id, docTipo: String(cliFila.documento || '').length === 11 ? 'RUC' : 'DNI', docNumero: cliFila.documento || '00000000', nombre: cliFila.razonSocial, telefono: String(cliFila.telefono || '') };
      }
    }

    var venta = {
      id: ventaId, boleta: boleta, fecha: fechaVenta,
      clienteId: cliente.id, clienteDocTipo: cliente.docTipo, clienteDocNumero: cliente.docNumero, clienteNombre: cliente.nombre, clienteTelefono: cliente.telefono,
      subtotal: totales.subtotal, igv: totales.igv, total: totales.total,
      descuentoTotal: 0, metodoPago: metodo, montoRecibido: metodo === 'Efectivo' ? totales.total : 0, vuelto: 0,
      almacenId: movs[0].almacenOrigenId, usuario: movs[0].usuario, autorizadoPor: '', estado: 'EMITIDA', anuladoMotivo: '',
      estadoPago: estadoPago, enviadoWhatsapp: idx % 3 === 0 ? 'Sí' : 'No'
    };
    dbInsertar_(APP.SHEETS.VENTAS, venta);
    lineas.forEach(function (l) {
      l.id = dbSiguienteId_(APP.SHEETS.VENTA_DETALLE, 'VD-', 6);
      l.ventaId = ventaId;
      dbInsertar_(APP.SHEETS.VENTA_DETALLE, l);
    });

    if (estadoPago === 'FIADO' && cliente.id) {
      fiadoPorCliente[cliente.id] = redondear_((fiadoPorCliente[cliente.id] || 0) + totales.total);
      boletaFiadoCliente[boleta] = { clienteId: cliente.id, total: totales.total };
    }
  });

  /* Saldos de fiado iniciales = suma de las boletas FIADAS por cliente. */
  Object.keys(fiadoPorCliente).forEach(function (cliId) {
    dbActualizar_(APP.SHEETS.CLIENTES, cliId, { saldoFiado: fiadoPorCliente[cliId] });
  });

  /* Abono demo parcial (ayer) del primer cliente fiado, para el historial. */
  var clavesFiado = Object.keys(fiadoPorCliente);
  if (clavesFiado.length) {
    var cliAbono = dbPorId_(APP.SHEETS.CLIENTES, clavesFiado[0]);
    var abonoMonto = Math.min(50, redondear_(numero_(cliAbono.saldoFiado)));
    if (cliAbono && abonoMonto > 0) {
      dbInsertar_(APP.SHEETS.PAGOS_FIADO, {
        id: dbSiguienteId_(APP.SHEETS.PAGOS_FIADO, 'PFI-', 5),
        fecha: new Date(fechaNow_().getTime() - 86400000),
        clienteId: cliAbono.id, clienteNombre: cliAbono.razonSocial, ventaId: '',
        monto: abonoMonto, metodoPago: 'Efectivo', usuario: 'admin', nota: 'Abono de referencia (demo)'
      });
      dbActualizar_(APP.SHEETS.CLIENTES, cliAbono.id, { saldoFiado: redondear_(numero_(cliAbono.saldoFiado) - abonoMonto) });
    }
  }

  // Deja la numeración de boletas a continuación de la semilla (BV-1105 → 1105).
  var movsBV = dbLeer_(APP.SHEETS.MOVIMIENTOS).filter(function (m) { return String(m.documentoRef || '').indexOf('BV-') === 0; });
  var maxBV = 0;
  movsBV.forEach(function (m) { var n = parseInt(String(m.documentoRef).substring(3), 10); if (!isNaN(n) && n > maxBV) maxBV = n; });
  var filasNum = dbLeer_(APP.SHEETS.NUMERACION);
  for (var i = 0; i < filasNum.length; i++) {
    if (String(filasNum[i].tipo).toUpperCase() === 'BOLETA' && maxBV > entero_(filasNum[i].correlativo, 0)) {
      dbHoja_(APP.SHEETS.NUMERACION).getRange(filasNum[i]._fila, 3).setValue(maxBV);
    }
  }
  console.log('Ventas demo creadas: ' + orden.length);
}
