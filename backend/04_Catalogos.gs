/**
 * ================================================================
 * NexoERP — 04_Catalogos.gs
 * Catálogos: productos, categorías, almacenes, proveedores y clientes.
 * ================================================================
 * Todos los handlers de escritura validan sesión + permiso
 * "catalogos:write" EN EL SERVIDOR (no basta ocultar botones en el UI).
 */

/* ============================ PRODUCTOS ============================ */

function productosList_(c) {
  var ses = requiereSesion_(c);
  var q = String(c.q || '').toLowerCase();
  var cat = String(c.categoria || '');
  var estado = String(c.estado || '').toUpperCase();

  var productos = dbLeer_(APP.SHEETS.PRODUCTOS);
  var stock = dbLeer_(APP.SHEETS.STOCK);
  var stockPorProducto = {};
  stock.forEach(function (s) {
    var k = String(s.productoId);
    if (!stockPorProducto[k]) stockPorProducto[k] = 0;
    stockPorProducto[k] += numero_(s.cantidad);
  });

  var out = [];
  productos.forEach(function (p) {
    if (q && (String(p.nombre).toLowerCase().indexOf(q) === -1 && String(p.sku).toLowerCase().indexOf(q) === -1)) return;
    if (cat && String(p.categoria) !== cat) return;
    if (estado && String(p.estado).toUpperCase() !== estado) return;
    var total = stockPorProducto[String(p.id)] || 0;
    out.push({
      id: p.id, sku: p.sku, nombre: p.nombre, descripcion: p.descripcion,
      categoria: p.categoria, unidad: p.unidad,
      costoStd: numero_(p.costoStd), precioVenta: numero_(p.precioVenta),
      precioMinimo: numero_(p.precioMinimo),   // Adenda 1.2: piso de negociación en POS
      /* Adenda 1.6: escalas mayoristas, fraccionamiento y código de barras */
      precio2: numero_(p.precio2), escala2Min: numero_(p.escala2Min),
      precio3: numero_(p.precio3), escala3Min: numero_(p.escala3Min),
      fraccionActiva: boolStr_(p.fraccionActiva),
      unidadFraccion: String(p.unidadFraccion || ''),
      factorFraccion: numero_(p.factorFraccion),
      codigoBarras: String(p.codigoBarras || ''),
      stockMin: numero_(p.stockMin), stockMax: numero_(p.stockMax),
      requiereLote: boolStr_(p.requiereLote), requiereSerie: boolStr_(p.requiereSerie),
      perecedero: boolStr_(p.perecedero), estado: p.estado,
      stockTotal: total,
      critico: (numero_(p.stockMin) > 0 && total <= numero_(p.stockMin))
    });
  });
  return appOk_(out);
}

function productosGet_(c) {
  requiereSesion_(c);
  var p = dbPorId_(APP.SHEETS.PRODUCTOS, c.id);
  if (!p) throw new ApiError_('Producto no encontrado: ' + c.id, 'NOT_FOUND');
  return appOk_(p);
}

function productosSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  var it = c.item || {};
  if (!String(it.nombre || '').trim()) throw new ApiError_('El nombre del producto es obligatorio.', 'VALIDATION');
  if (!String(it.unidad || '').trim()) throw new ApiError_('La unidad de medida es obligatoria.', 'VALIDATION');

  var sku = String(it.sku || '').trim().toUpperCase();
  var productos = dbLeer_(APP.SHEETS.PRODUCTOS);
  productos.forEach(function (p) {
    if (sku && String(p.sku).toUpperCase() === sku && String(p.id) !== String(it.id)) {
      throw new ApiError_('El SKU "' + sku + '" ya existe en otro producto.', 'VALIDATION');
    }
  });

  var datos = {
    sku: sku, nombre: String(it.nombre).trim(), descripcion: it.descripcion || '',
    categoria: it.categoria || 'General', unidad: it.unidad,
    costoStd: numero_(it.costoStd), precioVenta: numero_(it.precioVenta),
    precioMinimo: numero_(it.precioMinimo),   // Adenda 1.2
    /* Adenda 1.6: escalas, fraccionamiento, código de barras */
    precio2: numero_(it.precio2), escala2Min: numero_(it.escala2Min),
    precio3: numero_(it.precio3), escala3Min: numero_(it.escala3Min),
    fraccionActiva: boolStr_(it.fraccionActiva) ? 'Sí' : 'No',
    unidadFraccion: String(it.unidadFraccion || ''),
    factorFraccion: numero_(it.factorFraccion),
    codigoBarras: String(it.codigoBarras || '').trim(),
    stockMin: numero_(it.stockMin), stockMax: numero_(it.stockMax),
    requiereLote: boolStr_(it.requiereLote) ? 'Sí' : 'No',
    requiereSerie: boolStr_(it.requiereSerie) ? 'Sí' : 'No',
    perecedero: boolStr_(it.perecedero) ? 'Sí' : 'No',
    estado: it.estado || 'ACTIVO'
  };

  if (it.id) {
    dbActualizar_(APP.SHEETS.PRODUCTOS, it.id, datos);
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'PRODUCTO', 'Actualizó ' + datos.nombre);
    return appOk_({ id: it.id, actualizado: true });
  }
  if (!sku) datos.sku = 'SKU-' + Math.floor(1000 + Math.random() * 9000);
  datos.creado = fechaNow_();
  var id = dbSiguienteId_(APP.SHEETS.PRODUCTOS, 'PRD-', 4);
  dbInsertar_(APP.SHEETS.PRODUCTOS, Object.assign({ id: id }, datos));
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'PRODUCTO', 'Creó ' + datos.nombre + ' (' + datos.sku + ')');
  return appOk_({ id: id, creado: true });
}

function productosDelete_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  // Borrado lógico: conserva histórico de kardex/movimientos íntegro.
  dbDesactivar_(APP.SHEETS.PRODUCTOS, c.id);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'PRODUCTO', 'Desactivó producto ' + c.id);
  return appOk_({ id: c.id, estado: 'INACTIVO' });
}

/* ============================ CATEGORÍAS ============================ */

function categoriasList_(c) {
  requiereSesion_(c);
  return appOk_(dbLeer_(APP.SHEETS.CATEGORIAS).filter(function (x) { return String(x.estado).toUpperCase() === 'ACTIVO'; }));
}

function categoriasSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  var it = c.item || {};
  if (!String(it.nombre || '').trim()) throw new ApiError_('Nombre de categoría obligatorio.', 'VALIDATION');
  if (it.id) {
    dbActualizar_(APP.SHEETS.CATEGORIAS, it.id, { nombre: it.nombre, descripcion: it.descripcion || '' });
    return appOk_({ id: it.id, actualizado: true });
  }
  var id = dbSiguienteId_(APP.SHEETS.CATEGORIAS, 'CAT-', 3);
  dbInsertar_(APP.SHEETS.CATEGORIAS, { id: id, nombre: it.nombre, descripcion: it.descripcion || '', estado: 'ACTIVO' });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CATEGORIA', 'Creó categoría ' + it.nombre);
  return appOk_({ id: id, creado: true });
}

function categoriasDelete_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  dbDesactivar_(APP.SHEETS.CATEGORIAS, c.id);
  return appOk_({ id: c.id, estado: 'INACTIVO' });
}

/* ============================ ALMACENES ============================ */

function almacenesList_(c) {
  requiereSesion_(c);
  var estado = String(c.estado || '').toUpperCase();
  return appOk_(dbLeer_(APP.SHEETS.ALMACENES)
    .filter(function (a) { return !estado || String(a.estado).toUpperCase() === estado; })
    .map(function (a) {
      return { id: a.id, codigo: a.codigo, nombre: a.nombre, direccion: a.direccion, responsable: a.responsable, estado: a.estado };
    }));
}

function almacenesSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  var it = c.item || {};
  if (!String(it.nombre || '').trim()) throw new ApiError_('El nombre del almacén es obligatorio.', 'VALIDATION');
  var datos = {
    codigo: String(it.codigo || '').trim().toUpperCase(),
    nombre: String(it.nombre).trim(), direccion: it.direccion || '',
    responsable: it.responsable || '', estado: it.estado || 'ACTIVO'
  };
  if (it.id) {
    dbActualizar_(APP.SHEETS.ALMACENES, it.id, datos);
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'ALMACEN', 'Actualizó ' + datos.nombre);
    return appOk_({ id: it.id, actualizado: true });
  }
  var id = dbSiguienteId_(APP.SHEETS.ALMACENES, 'ALM-', 4);
  if (!datos.codigo) datos.codigo = id;
  dbInsertar_(APP.SHEETS.ALMACENES, Object.assign({ id: id }, datos));
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'ALMACEN', 'Creó almacén ' + datos.nombre);
  return appOk_({ id: id, creado: true });
}

function almacenesDelete_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  // Un almacén con stock no debe desactivarse silenciosamente.
  var stock = dbLeer_(APP.SHEETS.STOCK);
  for (var i = 0; i < stock.length; i++) {
    if (String(stock[i].almacenId) === String(c.id) && numero_(stock[i].cantidad) > 0) {
      throw new ApiError_('El almacén aún tiene stock disponible. Realice transferencias o ajustes antes de desactivarlo.', 'VALIDATION');
    }
  }
  dbDesactivar_(APP.SHEETS.ALMACENES, c.id);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'ALMACEN', 'Desactivó almacén ' + c.id);
  return appOk_({ id: c.id, estado: 'INACTIVO' });
}

/* ============================ PROVEEDORES / CLIENTES ============================ */

function proveedoresList_(c) {
  requiereSesion_(c);
  return appOk_(dbLeer_(APP.SHEETS.PROVEEDORES).map(function (p) {
    return { id: p.id, ruc: p.ruc, razonSocial: p.razonSocial, contacto: p.contacto, telefono: p.telefono, email: p.email, direccion: p.direccion, estado: p.estado };
  }));
}

function proveedoresSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  var it = c.item || {};
  if (!String(it.razonSocial || '').trim()) throw new ApiError_('La razón social es obligatoria.', 'VALIDATION');
  var datos = { ruc: it.ruc || '', razonSocial: it.razonSocial, contacto: it.contacto || '', telefono: it.telefono || '', email: it.email || '', direccion: it.direccion || '', estado: it.estado || 'ACTIVO' };
  if (it.id) { dbActualizar_(APP.SHEETS.PROVEEDORES, it.id, datos); return appOk_({ id: it.id, actualizado: true }); }
  var id = dbSiguienteId_(APP.SHEETS.PROVEEDORES, 'PRV-', 4);
  dbInsertar_(APP.SHEETS.PROVEEDORES, Object.assign({ id: id }, datos));
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'PROVEEDOR', 'Creó ' + datos.razonSocial);
  return appOk_({ id: id, creado: true });
}

function clientesList_(c) {
  requiereSesion_(c);
  return appOk_(dbLeer_(APP.SHEETS.CLIENTES).map(function (p) {
    return { id: p.id, documento: p.documento, razonSocial: p.razonSocial, contacto: p.contacto, telefono: p.telefono, email: p.email, direccion: p.direccion, estado: p.estado,
      limiteFiado: numero_(p.limiteFiado), saldoFiado: numero_(p.saldoFiado),
      puntos: entero_(p.puntos), tipoPrecio: String(p.tipoPrecio || '') };
  }));
}

function clientesSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'catalogos:write');
  var it = c.item || {};
  if (!String(it.razonSocial || '').trim()) throw new ApiError_('La razón social o nombre es obligatorio.', 'VALIDATION');
  var datos = { documento: it.documento || '', razonSocial: it.razonSocial, contacto: it.contacto || '', telefono: it.telefono || '', email: it.email || '', direccion: it.direccion || '', estado: it.estado || 'ACTIVO',
    limiteFiado: numero_(it.limiteFiado), tipoPrecio: String(it.tipoPrecio || '') };
  // Adenda 1.3: el saldo de fiado NUNCA se toca desde el catálogo —
  // solo lo modifican las ventas fiadas (12_Fiados.gs) y los abonos.
  // Adenda 1.6: los puntos tampoco se tocan desde el catálogo —
  // los mueven las ventas (20_Fidelizacion.gs) y los ajustes manuales.
  if (it.id) { dbActualizar_(APP.SHEETS.CLIENTES, it.id, datos); return appOk_({ id: it.id, actualizado: true }); }
  datos.saldoFiado = 0;
  datos.puntos = 0;
  var id = dbSiguienteId_(APP.SHEETS.CLIENTES, 'CLI-', 4);
  dbInsertar_(APP.SHEETS.CLIENTES, Object.assign({ id: id }, datos));
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CLIENTE', 'Creó ' + datos.razonSocial);
  return appOk_({ id: id, creado: true });
}

/* ============================ HELPERS ============================ */

function dbPorId_(nombre, id) {
  var filas = dbLeer_(nombre);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id) === String(id)) return filas[i];
  }
  return null;
}
