/**
 * ================================================================
 * NexoERP — Backend Google Apps Script
 * 00_Config.gs — Configuración global, roles y utilidades de respuesta
 * ================================================================
 * Sistema ERP/WMS sobre Google Sheets + Apps Script.
 * Arquitectura: Frontend SPA (Vercel) -> esta API (doGet/doPost) -> Google Sheets.
 */

var APP = {
  NAME: 'NexoERP',
  VERSION: '1.6.0',
  TOKEN_TTL_HORAS: 8,
  TZ: Session.getScriptTimeZone(),

  SHEETS: {
    CONFIG:      'Config',
    USUARIOS:    'Usuarios',
    SESIONES:    'Sesiones',
    CATEGORIAS:  'Categorias',
    ALMACENES:   'Almacenes',
    PRODUCTOS:   'Productos',
    STOCK:       'Stock',
    LOTES:       'Lotes',
    PROVEEDORES: 'Proveedores',
    CLIENTES:    'Clientes',
    MOVIMIENTOS: 'Movimientos',
    KARDEX:      'Kardex',
    AUDITORIA:   'Auditoria',
    VENTAS:      'Ventas',
    VENTA_DETALLE: 'VentaDetalle',
    NUMERACION:  'Numeracion',
    CAJA:        'Caja',
    /* Adenda 1.3: fiados, cotizaciones y pagos de fiado */
    PAGOS_FIADO: 'PagosFiado',
    COTIZACIONES: 'Cotizaciones',
    COTIZACION_DETALLE: 'CotizacionDetalle',
    /* Adenda 1.6: localización, comprobantes, finanzas, compras, RRHH */
    COMPROBANTES:     'Comprobantes',
    CUOTAS:           'Cuotas',
    GASTOS:           'Gastos',
    GASTOS_CATEGORIAS:'GastosCategorias',
    ORDENES:          'OrdenesCompra',
    OC_ITEMS:         'OcItems',
    OC_OFERTAS:       'OcOfertas',
    CUENTAS_PAGAR:    'CuentasPagar',
    NOTIFICACIONES:   'Notificaciones',
    ASISTENCIA:       'Asistencia',
    VENDEDORES:       'Vendedores',
    FIDEL_HIST:       'FidHistorial',
    PRESUPUESTO:      'Presupuesto'
  },

  /**
   * Matriz de permisos por rol. Si una acción no figura aquí,
   * basta con estar autenticado para ejecutarla (lecturas).
   */
  PERMISOS: {
    'catalogos:write':        ['admin', 'gerente'],
    'usuarios:manage':        ['admin'],
    'config:write':           ['admin'],
    'movimientos:registrar':  ['admin', 'gerente', 'operador'],
    'movimientos:anular':     ['admin', 'gerente'],
    'auditoria:read':         ['admin', 'gerente'],
    'ventas:registrar':       ['admin', 'gerente', 'operador'],
    'ventas:anular':          ['admin', 'gerente'],
    /* Adenda 1.2: autorizar descuentos fuera de política y regalos */
    'ventas:autorizar':       ['admin', 'gerente'],
    'caja:manage':            ['admin', 'gerente', 'operador'],
    /* Adenda 1.3: panel de control interno y cotizaciones */
    'panel:read':             ['admin', 'gerente'],
    'cotizaciones:manage':    ['admin', 'gerente', 'operador'],
    /* Adenda 1.6: finanzas, compras, comprobantes, RRHH, fidelización */
    'gastos:manage':          ['admin', 'gerente'],
    'compras:manage':         ['admin', 'gerente', 'operador'],
    'comprobantes:manage':    ['admin', 'gerente'],
    'creditos:manage':        ['admin', 'gerente', 'operador'],
    'fidelizacion:manage':    ['admin', 'gerente'],
    'rrhh:manage':            ['admin', 'gerente'],
    'tareas:manage':          ['admin']
  },

  /* Adenda 1.3: Fiado (venta a crédito) se agrega como método de pago.
   * Adenda 1.6: Credito = venta con plan de cuotas (Cuentas por cobrar). */
  METODOS_PAGO: ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Fiado', 'Credito'],

  /* Colores sugeridos por método de pago (gráficos del frontend). */
  COLORES_METODO: { Efectivo: '#2563eb', Yape: '#8b5cf6', Plin: '#14b8a6', Tarjeta: '#f59e0b', Fiado: '#e11d48', Credito: '#0ea5e9' },

  TIPOS_MOVIMIENTO: ['ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'DEVOLUCION', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']
};

/** Claves de la pestaña Config (clave / valor). */
var CONFIG_CLAVES = {
  NOMBRE_EMPRESA:          'NexoERP Distribución S.A.C.',
  MONEDA_CODIGO:           'PEN',
  MONEDA_SIMBOLO:          'S/',
  METODO_VALUACION:        'PROMEDIO',   // PROMEDIO (ponderado) | FIFO | LIFO (roadmap)
  PERMITIR_STOCK_NEGATIVO: 'No',
  DIAS_ALERTA_VENCIMIENTO: '30',

  /* --- Adenda: identidad fiscal y emisión de boletas --- */
  RUC:                     '20512345678',
  RAZON_SOCIAL:            'NexoERP Distribución S.A.C.',
  LOGO_URL:                '',              // URL pública de la imagen del logo (recomendado)
  LOGO_BASE64:             '',              // Alternativa ligera: data:image/png;base64,... (< 45 KB)
  IGV_INCLUIDO:            'Sí',            // Sí: precios de venta incluyen IGV
  IGV_TASA:                '18',            // Porcentaje IGV (Perú)
  PREFIJO_BOLETA:          'BV-',           // Serie del comprobante
  MENSAJE_BOLETA:          '¡Gracias por su compra! Cambios dentro de 7 días presentando este comprobante.',
  ALMACEN_VENTA:           'ALM-0003',      // Almacén que despacha el POS de mostrador
  METODO_PAGO_DEFAULT:     'Efectivo',
  HORARIO_INICIO:          '08:00',
  HORARIO_FIN:             '22:00',

  /* --- Adenda 1.2 (POS Pro): precios, descuentos y regalos --- */
  DESCUENTO_MAX_PCT:             '15',   // % máximo de descuento por línea SIN autorización (0 = sin límite)
  DESCUENTO_REQUIERE_AUTORIZACION: 'Sí', // Sí: exceder DESCUENTO_MAX_PCT o vender bajo el precio mínimo exige gerente
  REGALO_REQUIERE_AUTORIZACION:  'Sí',   // Sí: marcar un ítem como REGALO exige autorización de gerente

  /* --- Adenda 1.3: fiados y WhatsApp --- */
  FIADO_PERMITIR_EXCEDER:  'No',   // Sí: se permite fiar aunque el cliente supere su límite
  FIADO_DIAS_ALERTA:       '30',   // Días de antigüedad para alertar fiados de cobro dudoso
  WHATSAPP_PREFIJO:        '51',   // Prefijo de país para construir los enlaces wa.me

  /* --- Adenda 1.5: datos de contacto de la empresa y asistente de inicio --- */
  DIRECCION_EMPRESA:       '',     // Dirección comercial impresa en proformas (PDF)
  TELEFONO_EMPRESA:        '',     // Teléfono de contacto impreso en proformas (PDF)
  ASISTENTE_COMPLETADO:    'No',   // El asistente de inicio se marca Sí al finalizar u omitir

  /* --- Adenda 1.6: país e impuestos (Perú por defecto, editable) --- */
  PAIS:                    'PER',  // PER BOL ECU COL CHL ARG PRY URY
  IMPUESTO_NOMBRE:         'IGV',  // Etiqueta del impuesto en comprobantes

  /* --- Adenda 1.6: comprobantes (series oficiales SUNAT) --- */
  SERIE_BOLETA:            'B001', // Boleta de venta electrónica (03)
  SERIE_FACTURA:           'F001', // Factura electrónica (01)
  SERIE_NC:                'FC01', // Nota de crédito (07)
  SERIE_ND:                'FD01', // Nota de débito (08)
  COMPROBANTE_AUTO:        'Sí',   // Sí: RUC → Factura, DNI → Boleta automático
  SUNAT_MODO:              'desactivado', // desactivado | manual | api
  SUNAT_API_URL:           '',     // URL base del API de facturación (Laravel/Greenter)
  SUNAT_API_USUARIO:       '',     // Email de acceso al API
  SUNAT_API_PASSWORD:      '',     // Contraseña del API
  SUNAT_COMPANY_ID:        '1',
  SUNAT_BRANCH_ID:         '1',
  SUNAT_METODO_ENVIO:      'resumen_diario', // resumen_diario | individual
  SUNAT_TIPO_OPERACION:    '0101', // Venta interna
  TC_USD:                  '0',    // Tipo de cambio venta USD (0 = sin consultar)
  TC_FECHA:                '',
  TC_API_URL:              'https://api.apis.net.pe/v1/tipo-cambio-sunat',

  /* --- Adenda 1.6: pagos QR (Yape/Plin) impresos en la boleta --- */
  QR_YAPE_NUMERO:          '',     // Número de celular Yape
  QR_PLIN_NUMERO:          '',     // Número de celular Plin
  QR_BANCO:                '',     // Banco y CCI opcional (se imprime en la boleta)

  /* --- Adenda 1.6: fidelización de clientes (puntos) --- */
  FIDEL_ACTIVA:            'No',   // Sí: acumula puntos al vender
  FIDEL_MONTO_PUNTO:       '10',   // 1 punto por cada 10 de consumo
  FIDEL_VALOR_PUNTO:       '0.10', // Valor en moneda de cada punto canjeado
  FIDEL_MIN_CANJE:         '100',  // Puntos mínimos para canjear

  /* --- Adenda 1.6: tareas programadas y respaldos --- */
  RECORD_ACTIVO:           'Sí',   // Genera avisos del negocio (fiados, cuotas, stock)
  RECORD_EMAIL:            '',     // Correo del dueño para el resumen diario
  BACKUP_ACTIVO:           'No',   // Sí: respaldo diario de la hoja a Drive
  BACKUP_RETENCION:        '15',   // Días de retención de respaldos

  /* --- Adenda 1.6: catálogo público (pedidos por WhatsApp) --- */
  CATALOGO_ACTIVO:         'No',
  CATALOGO_TOKEN:          '',
  CATALOGO_MENSAJE:        'Hola! Me interesa este producto: {producto} ({precio}). ¿Sigue disponible?',

  /* --- Adenda 1.6: almacén por defecto para recepciones de compra --- */
  ALMACEN_RECEPCION:       'ALM-0001'
};

/* ---------- Errores de aplicación ---------- */

function ApiError_(mensaje, code) {
  this.message = mensaje;
  this.code = code || 'ERROR';
}
ApiError_.prototype = Object.create(Error.prototype);
ApiError_.prototype.constructor = ApiError_;

/* ---------- Respuestas estándar ---------- */

function appOk_(data) {
  return { ok: true, data: (data === undefined ? null : data), error: null, code: null };
}

function appErr_(mensaje, code) {
  return { ok: false, data: null, error: mensaje || 'Error desconocido', code: code || 'ERROR' };
}

function appTienePermiso_(rol, permiso) {
  if (!permiso) return true;
  var definidos = APP.PERMISOS[permiso];
  if (!definidos) return true;
  return definidos.indexOf(String(rol).toLowerCase()) !== -1;
}

/* ---------- Utilidades generales ---------- */

function fechaNow_() { return new Date(); }

function fechaStr_(d) {
  if (!d) return '';
  if (Object.prototype.toString.call(d) !== '[object Date]') d = new Date(d);
  return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd HH:mm:ss');
}

function fechaDiaStr_(d) {
  if (!d) return '';
  if (Object.prototype.toString.call(d) !== '[object Date]') d = new Date(d);
  return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd');
}

function numero_(v, defecto) {
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? (defecto || 0) : n;
}

function entero_(v, defecto) {
  var n = parseInt(v, 10);
  return isNaN(n) ? (defecto || 0) : n;
}

function boolStr_(v) {
  return String(v).trim().toUpperCase() === 'SÍ' || String(v).trim().toUpperCase() === 'SI' ||
         String(v).trim().toUpperCase() === 'YES' || String(v).trim() === 'true' || String(v).trim() === '1';
}

function redondear_(n, dec) {
  var f = Math.pow(10, (dec === undefined ? 2 : dec));
  return Math.round((n + Number.EPSILON) * f) / f;
}

function redondear4_(n) { return redondear_(n, 4); }
