/**
 * ================================================================
 * NexoERP — 23_Catalogo.gs  (Adenda 1.6)
 * Catálogo público para pedidos por WhatsApp.
 * ================================================================
 * El dueño activa el catálogo en Ajustes → "Catálogo Público". El
 * sistema genera un token; la página catalogo.html (deployada junto
 * al frontend) consulta esta acción SIN sesión, autenticándose solo
 * con el token público, y muestra los productos activos con su botón
 * de pedido por WhatsApp. Ideal para pegar el enlace (o su QR) en el
 * local y en estados de WhatsApp.
 */

function catalogoTokenRegenerar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'config:write');
  var token = Utilities.getUuid().replace(/-/g, '');
  configGuardar_('CATALOGO_TOKEN', token);
  configGuardar_('CATALOGO_ACTIVO', 'Sí');
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CONFIG', 'Regeneró token del catálogo público');
  return appOk_({ token: token, activo: true });
}

function catalogoEstado_(c) {
  requiereSesion_(c);
  var cfg = configLeer_();
  return appOk_({
    activo: boolStr_(cfg.CATALOGO_ACTIVO),
    token: String(cfg.CATALOGO_TOKEN || ''),
    mensaje: String(cfg.CATALOGO_MENSAJE || 'Hola! Me interesa este producto: {producto} ({precio}). ¿Sigue disponible?')
  });
}

/**
 * Datos públicos del catálogo (sin sesión; exige token y catálogo
 * activo). Solo expone: nombre de la empresa, productos activos con
 * precio 1 y disponibilidad. Nunca costos, usuarios ni saldos.
 */
function catalogoPublico_(c) {
  var cfg = configLeer_();
  if (!boolStr_(cfg.CATALOGO_ACTIVO)) throw new ApiError_('El catálogo público está desactivado.', 'FORBIDDEN');
  if (!String(cfg.CATALOGO_TOKEN || '') || String(c.tokenPublico || '') !== String(cfg.CATALOGO_TOKEN)) {
    throw new ApiError_('Token del catálogo no válido.', 'FORBIDDEN');
  }
  var prods = dbLeer_(APP.SHEETS.PRODUCTOS).filter(function (p) { return String(p.estado).toUpperCase() === 'ACTIVO'; });
  var stock = dbLeer_(APP.SHEETS.STOCK);
  var totalPorProd = {};
  stock.forEach(function (s) { totalPorProd[String(s.productoId)] = (totalPorProd[String(s.productoId)] || 0) + numero_(s.cantidad); });
  var items = prods.map(function (p) {
    return {
      sku: p.sku, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad,
      precio: numero_(p.precioVenta), disponible: (totalPorProd[String(p.id)] || 0) > 0
    };
  });
  return appOk_({
    empresa: {
      nombre: cfg.NOMBRE_EMPRESA || 'Mi Negocio',
      telefono: String(cfg.TELEFONO_EMPRESA || ''),
      direccion: String(cfg.DIRECCION_EMPRESA || ''),
      logoUrl: String(cfg.LOGO_URL || ''), logoBase64: '',
      whatsapp: String(cfg.WHATSAPP_PREFIJO || '51'),
      moneda: cfg.MONEDA_SIMBOLO || 'S/',
      mensaje: String(cfg.CATALOGO_MENSAJE || 'Hola! Me interesa este producto: {producto} ({precio}). ¿Sigue disponible?')
    },
    productos: items
  });
}
