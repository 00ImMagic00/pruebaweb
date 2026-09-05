/**
 * ================================================================
 * NexoERP — 09_Setup.gs
 * Instalación: crea las pestañas de Google Sheets, cabeceras y carga
 * un dataset de demostración completo (catálogos + 63 movimientos
 * históricos de 30 días con kardex valorizado consistente).
 * ================================================================
 * USO (una sola vez) — elija según el tipo de instalación:
 *   1. Abra el editor de Apps Script vinculado a su hoja de cálculo.
 *   2. Ejecute UNA de estas funciones desde la barra superior:
 *        · setupSystem      → instala ESTRUCTURA + DATOS DEMO (para evaluar).
 *        · setupDesdeCero   → instala SOLO la estructura para una empresa
 *                             nueva: pestañas, configuración y el usuario
 *                             admin inicial (sin productos ni datos demo).
 *                             Al abrir el sistema se activará el ASISTENTE
 *                             DE INICIO para cargar su empresa, almacén,
 *                             categorías, productos y clientes.
 *   3. Autorice los permisos cuando Google los solicite.
 *   4. Revise las pestañas creadas y el log de ejecución.
 *
 * ¿Instaló la demo y ahora quiere operar en serio? Ejecute
 *   borrarDatosDemo  → limpia los datos de demostración (productos,
 *   movimientos, ventas, etc.) conservando usuarios y configuración;
 *   el asistente de inicio se activa en el siguiente inicio de sesión.
 *
 * Para borrar TODO y regenerar: ejecute  resetSystem  (¡destructivo!).
 */

var CABECERAS = {
  Config:      ['clave', 'valor'],
  Usuarios:    ['id', 'usuario', 'nombre', 'rol', 'salt', 'hash', 'estado', 'ultimoAcceso', 'creado'],
  Sesiones:    ['token', 'usuarioId', 'rol', 'creado', 'expira'],
  Categorias:  ['id', 'nombre', 'descripcion', 'estado'],
  Almacenes:   ['id', 'codigo', 'nombre', 'direccion', 'responsable', 'estado'],
  Productos:   ['id', 'sku', 'nombre', 'descripcion', 'categoria', 'unidad', 'costoStd', 'precioVenta', 'precioMinimo', 'stockMin', 'stockMax', 'requiereLote', 'requiereSerie', 'perecedero', 'estado', 'creado'],
  Stock:       ['productoId', 'almacenId', 'cantidad'],
  Lotes:       ['id', 'productoId', 'almacenId', 'lote', 'numeroSerie', 'fechaVencimiento', 'cantidad', 'estado'],
  Proveedores: ['id', 'ruc', 'razonSocial', 'contacto', 'telefono', 'email', 'direccion', 'estado'],
  Clientes:    ['id', 'documento', 'razonSocial', 'contacto', 'telefono', 'email', 'direccion', 'estado', 'limiteFiado', 'saldoFiado'],
  Movimientos: ['id', 'fecha', 'tipo', 'productoId', 'almacenOrigenId', 'almacenDestinoId', 'cantidad', 'costoUnitario', 'lote', 'numeroSerie', 'fechaVencimiento', 'documentoRef', 'motivo', 'observaciones', 'usuario', 'estado', 'anuladoMotivo'],
  Kardex:      ['id', 'fecha', 'productoId', 'almacenId', 'movimientoId', 'tipo', 'entradaCantidad', 'entradaValor', 'salidaCantidad', 'salidaValor', 'saldoCantidad', 'saldoValor', 'costoPromedio', 'documentoRef', 'usuario'],
  Auditoria:   ['id', 'fecha', 'usuarioId', 'usuario', 'rol', 'accion', 'detalle'],
  /* --- Adenda: POS, boletas y cuadre de caja --- */
  Numeracion:  ['tipo', 'prefijo', 'correlativo'],
  Ventas:      ['id', 'boleta', 'fecha', 'clienteId', 'clienteDocTipo', 'clienteDocNumero', 'clienteNombre', 'clienteTelefono', 'subtotal', 'igv', 'total', 'descuentoTotal', 'metodoPago', 'montoRecibido', 'vuelto', 'almacenId', 'usuario', 'autorizadoPor', 'estado', 'anuladoMotivo', 'estadoPago', 'enviadoWhatsapp'],
  VentaDetalle: ['id', 'ventaId', 'productoId', 'sku', 'descripcion', 'cantidad', 'precioUnit', 'precioOriginal', 'esRegalo', 'descuento', 'costoUnit', 'subtotal', 'movimientoId', 'lote'],
  Caja:        ['id', 'fecha', 'aperturaAt', 'usuario', 'montoInicial', 'cierreAt', 'montoSistema', 'montoContado', 'diferencia', 'estado', 'detalle'],
  /* --- Adenda 1.3: fiados y cotizaciones --- */
  PagosFiado:  ['id', 'fecha', 'clienteId', 'clienteNombre', 'ventaId', 'monto', 'metodoPago', 'usuario', 'nota'],
  Cotizaciones: ['id', 'numero', 'fecha', 'clienteId', 'clienteDocTipo', 'clienteDocNumero', 'clienteNombre', 'clienteTelefono', 'subtotal', 'igv', 'total', 'validezHasta', 'validezDias', 'estado', 'usuario', 'convertidoA', 'nota'],
  CotizacionDetalle: ['id', 'cotizacionId', 'productoId', 'sku', 'descripcion', 'cantidad', 'precioUnit', 'esRegalo', 'subtotal'],
  /* --- Adenda 1.6: comprobantes, finanzas, compras, RRHH --- */
  Comprobantes: ['id', 'ventaId', 'tipo', 'serie', 'correlativo', 'numero', 'fecha', 'clienteDocTipo', 'clienteDocNumero', 'clienteNombre', 'moneda', 'subtotal', 'igv', 'total', 'modoEnvio', 'estado', 'sunatId', 'cdrCodigo', 'cdrDescripcion', 'apiDocId', 'respuesta', 'payload', 'observaciones', 'usuario', 'creado'],
  Cuotas: ['id', 'ventaId', 'clienteId', 'clienteNombre', 'nCuota', 'totalCuotas', 'fechaVenc', 'monto', 'saldo', 'estado', 'pagadoAt', 'metodoPago', 'usuario', 'observaciones'],
  Gastos: ['id', 'fecha', 'categoria', 'descripcion', 'monto', 'metodoPago', 'numeroDoc', 'usuario', 'estado', 'creado'],
  GastosCategorias: ['id', 'nombre', 'tipo', 'estado'],
  OrdenesCompra: ['id', 'numero', 'proveedorId', 'proveedorNombre', 'fecha', 'fechaEsperada', 'estado', 'condicionPago', 'diasCredito', 'moneda', 'subtotal', 'igv', 'total', 'observaciones', 'usuario', 'creado'],
  OcItems: ['id', 'ocId', 'productoId', 'sku', 'descripcion', 'unidad', 'cantidadPedida', 'cantidadRecibida', 'costoUnit'],
  OcOfertas: ['id', 'ocId', 'proveedorNombre', 'costoTotal', 'plazoDias', 'comentario', 'elegida'],
  CuentasPagar: ['id', 'ocId', 'numero', 'proveedorId', 'proveedorNombre', 'fecha', 'fechaVenc', 'monto', 'saldo', 'estado', 'pagadoAt', 'metodoPago', 'usuario'],
  Notificaciones: ['id', 'fecha', 'clave', 'tipo', 'severidad', 'titulo', 'mensaje', 'referencia', 'leido'],
  Asistencia: ['id', 'fecha', 'usuarioId', 'usuario', 'entrada', 'salida', 'minutos', 'nota', 'estado'],
  Vendedores: ['id', 'usuarioId', 'usuario', 'comisionPct', 'estado'],
  FidHistorial: ['id', 'fecha', 'clienteId', 'clienteNombre', 'tipo', 'puntos', 'ventaId', 'nota', 'usuario', 'saldoDespues'],
  Presupuesto: ['id', 'mes', 'categoria', 'monto', 'actualizadoAt']
};

/* --------------------------- DATASET DEMO --------------------------- */

var SEED_CATEGORIAS = [
  ['Electrónica', 'Equipos y accesorios electrónicos'],
  ['Herramientas', 'Herramientas manuales y eléctricas'],
  ['Oficina', 'Papelería y suministros de oficina'],
  ['Empaques', 'Materiales de empaque y embalaje'],
  ['Alimentos', 'Productos alimenticios (lote y vencimiento)']
];

var SEED_ALMACENES = [
  ['ALM-0001', 'ALM-PRINCIPAL', 'Almacén Central', 'Av. Industrial 1450, Lima', 'Jorge Ramírez Soto'],
  ['ALM-0002', 'ALM-NORTE', 'Almacén Norte', 'Av. Túpac Amaru 890, Lima', 'María Torres Vega'],
  ['ALM-0003', 'ALM-TIENDA', 'Tienda Centro', 'Jr. de la Unión 550, Lima', 'Ana Flores Díaz']
];

var SEED_PRODUCTOS = [
  // sku, nombre, categoria, unidad, costoStd, precioVenta, stockMin, stockMax, reqLote, reqSerie, perecedero, descripcion
  ['SKU-ELE-001', 'Laptop ProBook 14"', 'Electrónica', 'Unidad', 1850, 2490, 4, 20, 'No', 'No', 'No', 'Laptop corporativa 16GB RAM / 512GB SSD'],
  ['SKU-ELE-002', 'Monitor LED 24"', 'Electrónica', 'Unidad', 320, 480, 6, 30, 'No', 'No', 'No', 'Monitor Full HD IPS 75Hz'],
  ['SKU-ELE-003', 'Teclado Inalámbrico K380', 'Electrónica', 'Unidad', 18, 32, 15, 80, 'No', 'No', 'No', 'Teclado multi-dispositivo Bluetooth'],
  ['SKU-ELE-004', 'Mouse Óptico USB', 'Electrónica', 'Unidad', 8, 15, 20, 100, 'No', 'No', 'No', 'Mouse 1000 DPI con cable'],
  ['SKU-ELE-005', 'UPS 850VA', 'Electrónica', 'Unidad', 95, 145, 5, 15, 'No', 'No', 'No', 'Sistema de respaldo eléctrico con regulador'],
  ['SKU-ELE-006', 'Cámara IP Dome 4MP', 'Electrónica', 'Unidad', 55, 89, 6, 20, 'No', 'Sí', 'No', 'Cámara de seguridad POE (control por serie)'],
  ['SKU-HER-001', 'Taladro Percutor 650W', 'Herramientas', 'Unidad', 68, 105, 5, 20, 'No', 'No', 'No', 'Taladro con maletín y accesorios'],
  ['SKU-HER-002', 'Juego Llaves Combinadas 12p', 'Herramientas', 'Juego', 24, 39, 8, 25, 'No', 'No', 'No', 'Llaves 8-19mm cromo vanadio'],
  ['SKU-HER-003', 'Casco de Seguridad', 'Herramientas', 'Unidad', 12, 22, 30, 120, 'No', 'No', 'No', 'Casco industrial con arnés de 4 puntos'],
  ['SKU-OFI-001', 'Papel Bond A4 75g (500h)', 'Oficina', 'Resma', 3.5, 6, 60, 300, 'No', 'No', 'No', 'Resma estándar para impresión'],
  ['SKU-OFI-002', 'Tóner HP 85A', 'Oficina', 'Unidad', 42, 65, 10, 40, 'No', 'No', 'No', 'Tóner original CE285A'],
  ['SKU-OFI-003', 'Archivador Lomo Ancho', 'Oficina', 'Unidad', 2.8, 5.5, 40, 150, 'No', 'No', 'No', 'Archivador A4 cartón prensado'],
  ['SKU-EMP-001', 'Caja Cartón Corrugado Med', 'Empaques', 'Unidad', 1.2, 2.5, 100, 500, 'No', 'No', 'No', 'Caja 40x30x30cm doble pared'],
  ['SKU-EMP-002', 'Cinta de Embalaje 48mm', 'Empaques', 'Rollo', 0.9, 1.8, 80, 400, 'No', 'No', 'No', 'Cinta adhesiva transparente 100m'],
  ['SKU-EMP-003', 'Film Stretch 500mm', 'Empaques', 'Rollo', 7.5, 13, 30, 100, 'No', 'No', 'No', 'Film estirable 2.5kg manual'],
  ['SKU-ALI-001', 'Aceite Vegetal 1L', 'Alimentos', 'Unidad', 2.2, 4, 24, 120, 'Sí', 'No', 'Sí', 'Aceite vegetal botella 1L (control por lote)'],
  ['SKU-ALI-002', 'Leche Evaporada 400g', 'Alimentos', 'Unidad', 0.95, 1.6, 48, 240, 'Sí', 'No', 'Sí', 'Lata de leche evaporada entera'],
  ['SKU-ALI-003', 'Arroz Superior 5kg', 'Alimentos', 'Saco', 6.8, 9.5, 20, 100, 'Sí', 'No', 'Sí', 'Saco de arroz extra superior']
];

var SEED_PROVEEDORES = [
  ['20123456789', 'Distribuidora Andina S.A.C.', 'Carlos Mendoza', '01-4567890', 'ventas@andina.pe', 'Av. Argentina 1234, Callao'],
  ['20456789123', 'Importaciones Pacífico E.I.R.L.', 'Lucía Sánchez', '01-2233445', 'contacto@pacifico.pe', 'Jr. Amazonas 450, Lima'],
  ['20678912345', 'Suministros Lima Norte S.A.', 'Pedro Quispe', '01-7788990', 'pq@limanorte.pe', 'Av. Túpac Amaru 1200, Lima'],
  ['20987654321', 'Comercial Packaging del Perú S.A.C.', 'Rosa Huamán', '01-3344556', 'rh@packaging.pe', 'Panamericana Sur km 18, Lima']
];

var SEED_CLIENTES = [
  ['20111222333', 'Corporación Delta S.A.C.', 'Fernando Rojas', '01-9988776', 'compras@delta.pe', 'Av. Canaval y Moreyra 480, Lima'],
  ['20444555666', 'E-Imports & Servicios E.I.R.L.', 'Gabriela Castro', '01-5566778', 'gc@eimports.pe', 'Calle Las Begonias 545, Lima'],
  ['00777788889', 'Bodega Doña María', 'María Llanos', '987654321', '', 'Av. Brasil 2100, Lima'],
  ['20999888777', 'Constructora Vitalsur S.A.', 'Óscar Delgado', '01-4455667', 'od@vitalsur.pe', 'Av. El Sol 890, Lima']
];

/* Adenda 1.3: límite de crédito de fiado por documento (0 = sin límite). */
var FIADO_LIMITE_DEMO = {
  '20111222333': 1000,   // Corporación Delta
  '00777788889': 200     // Bodega Doña María (fiará una boleta en la semilla)
};

/**
 * Movimientos semilla (reproducidos cronológicamente por el motor real):
 * [díasAtrás, tipo, sku, cantidad, costoEntrada|null, almDestino, almOrigen, lote, vencimientoEnDías|null, docRef, usuario]
 */
var SEED_MOVIMIENTOS = [
  [30, 'ENTRADA', 'SKU-ELE-001', 8, 1780, 'ALM-0001', '', '', null, 'OC-1001', 'admin'],
  [30, 'ENTRADA', 'SKU-ALI-001', 60, 2.1, 'ALM-0001', '', 'L-0110', 270, 'OC-1001', 'admin'],
  [30, 'ENTRADA', 'SKU-ALI-002', 120, 0.9, 'ALM-0001', '', 'L-A01', 180, 'OC-1001', 'admin'],
  [29, 'ENTRADA', 'SKU-ELE-002', 15, 305, 'ALM-0001', '', '', null, 'OC-1002', 'admin'],
  [29, 'ENTRADA', 'SKU-ELE-003', 60, 17, 'ALM-0001', '', '', null, 'OC-1002', 'admin'],
  [29, 'ENTRADA', 'SKU-ALI-003', 60, 6.5, 'ALM-0001', '', 'L-R1', 400, 'OC-1002', 'admin'],
  [28, 'ENTRADA', 'SKU-ELE-004', 80, 7.5, 'ALM-0001', '', '', null, 'OC-1002', 'admin'],
  [28, 'ENTRADA', 'SKU-ELE-005', 10, 92, 'ALM-0001', '', '', null, 'OC-1002', 'admin'],
  [27, 'ENTRADA', 'SKU-ELE-006', 8, 52, 'ALM-0001', '', '', null, 'OC-1004', 'admin'],
  [27, 'ENTRADA', 'SKU-OFI-001', 200, 3.3, 'ALM-0001', '', '', null, 'OC-1005', 'admin'],
  [26, 'ENTRADA', 'SKU-HER-001', 12, 65, 'ALM-0001', '', '', null, 'OC-1006', 'admin'],
  [26, 'ENTRADA', 'SKU-HER-002', 18, 23, 'ALM-0001', '', '', null, 'OC-1006', 'admin'],
  [25, 'ENTRADA', 'SKU-HER-003', 100, 11.5, 'ALM-0001', '', '', null, 'OC-1007', 'admin'],
  [24, 'ENTRADA', 'SKU-OFI-002', 30, 40, 'ALM-0001', '', '', null, 'OC-1008', 'admin'],
  [24, 'ENTRADA', 'SKU-OFI-003', 120, 2.6, 'ALM-0001', '', '', null, 'OC-1008', 'admin'],
  [23, 'ENTRADA', 'SKU-EMP-001', 400, 1.1, 'ALM-0001', '', '', null, 'OC-1009', 'admin'],
  [23, 'ENTRADA', 'SKU-EMP-002', 250, 0.85, 'ALM-0001', '', '', null, 'OC-1009', 'admin'],
  [22, 'ENTRADA', 'SKU-EMP-003', 80, 7.2, 'ALM-0001', '', '', null, 'OC-1010', 'admin'],
  [20, 'ENTRADA', 'SKU-ELE-001', 4, 1795, 'ALM-0001', '', '', null, 'OC-1011', 'admin'],
  [16, 'TRANSFERENCIA', 'SKU-ALI-001', 24, null, 'ALM-0003', 'ALM-0001', 'L-0110', null, 'TRF-0001', 'joperador'],
  [14, 'TRANSFERENCIA', 'SKU-ELE-003', 20, null, 'ALM-0003', 'ALM-0001', '', null, 'TRF-0002', 'joperador'],
  [14, 'ENTRADA', 'SKU-ALI-002', 100, 0.92, 'ALM-0001', '', 'L-B02', 12, 'OC-1012', 'admin'],
  [13, 'TRANSFERENCIA', 'SKU-OFI-001', 60, null, 'ALM-0002', 'ALM-0001', '', null, 'TRF-0003', 'joperador'],
  [13, 'SALIDA', 'SKU-ELE-002', 3, null, '', 'ALM-0001', '', null, 'FV-2031', 'joperador'],
  [13, 'ENTRADA', 'SKU-ALI-003', 40, 6.6, 'ALM-0001', '', 'L-R2', 75, 'OC-1013', 'admin'],
  [12, 'TRANSFERENCIA', 'SKU-HER-001', 4, null, 'ALM-0002', 'ALM-0001', '', null, 'TRF-0004', 'joperador'],
  [11, 'SALIDA', 'SKU-ELE-006', 1, null, '', 'ALM-0001', '', 'CAM-2026-0003', 'FV-2032', 'joperador'],
  [11, 'TRANSFERENCIA', 'SKU-EMP-001', 150, null, 'ALM-0002', 'ALM-0001', '', null, 'TRF-0005', 'joperador'],
  [10, 'SALIDA', 'SKU-OFI-002', 8, null, '', 'ALM-0001', '', null, 'FV-2033', 'joperador'],
  [10, 'TRANSFERENCIA', 'SKU-OFI-001', 20, null, 'ALM-0003', 'ALM-0002', '', null, 'TRF-0006', 'joperador'],
  [10, 'TRANSFERENCIA', 'SKU-ELE-002', 4, null, 'ALM-0002', 'ALM-0001', '', null, 'TRF-0007', 'joperador'],
  [9, 'SALIDA', 'SKU-ELE-004', 30, null, '', 'ALM-0001', '', null, 'FV-2034', 'joperador'],
  [9, 'TRANSFERENCIA', 'SKU-HER-003', 30, null, 'ALM-0003', 'ALM-0001', '', null, 'TRF-0008', 'joperador'],
  [9, 'SALIDA', 'SKU-ALI-003', 25, null, '', 'ALM-0001', 'L-R1', null, 'FV-2035', 'joperador'],
  [8, 'SALIDA', 'SKU-ELE-003', 6, null, '', 'ALM-0003', '', null, 'BV-1101', 'joperador'],
  [8, 'SALIDA', 'SKU-EMP-003', 55, null, '', 'ALM-0001', '', null, 'FV-2036', 'joperador'],
  [8, 'SALIDA', 'SKU-ALI-002', 40, null, '', 'ALM-0001', 'L-A01', null, 'FV-2037', 'joperador'],
  [7, 'TRANSFERENCIA', 'SKU-ELE-004', 20, null, 'ALM-0002', 'ALM-0001', '', null, 'TRF-0009', 'joperador'],
  [7, 'SALIDA', 'SKU-OFI-003', 45, null, '', 'ALM-0001', '', null, 'FV-2038', 'joperador'],
  [6, 'SALIDA', 'SKU-ELE-005', 4, null, '', 'ALM-0001', '', null, 'FV-2039', 'joperador'],
  [6, 'SALIDA', 'SKU-ALI-001', 10, null, '', 'ALM-0003', 'L-0110', null, 'FV-2040', 'joperador'],
  [6, 'SALIDA', 'SKU-EMP-001', 60, null, '', 'ALM-0002', '', null, 'BV-1102', 'joperador'],
  [5, 'TRANSFERENCIA', 'SKU-EMP-002', 60, null, 'ALM-0003', 'ALM-0001', '', null, 'TRF-0010', 'joperador'],
  [5, 'SALIDA', 'SKU-HER-003', 10, null, '', 'ALM-0003', '', null, 'BV-1103', 'joperador'],
  [4, 'SALIDA', 'SKU-ELE-003', 25, null, '', 'ALM-0001', '', null, 'FV-2041', 'joperador'],
  [4, 'SALIDA', 'SKU-OFI-001', 70, null, '', 'ALM-0001', '', null, 'FV-2042', 'joperador'],
  [4, 'TRANSFERENCIA', 'SKU-ALI-003', 30, null, 'ALM-0002', 'ALM-0001', 'L-R2', null, 'TRF-0011', 'joperador'],
  [3, 'SALIDA', 'SKU-ELE-004', 12, null, '', 'ALM-0002', '', null, 'BV-1104', 'joperador'],
  [3, 'SALIDA', 'SKU-EMP-001', 180, null, '', 'ALM-0001', '', null, 'FV-2043', 'joperador'],
  [3, 'SALIDA', 'SKU-ALI-001', 15, null, '', 'ALM-0001', 'L-0225', null, 'FV-2044', 'joperador'],
  [2, 'SALIDA', 'SKU-HER-002', 9, null, '', 'ALM-0001', '', null, 'FV-2045', 'joperador'],
  [2, 'SALIDA', 'SKU-HER-003', 55, null, '', 'ALM-0001', '', null, 'FV-2046', 'joperador'],
  [2, 'SALIDA', 'SKU-ALI-002', 20, null, '', 'ALM-0001', 'L-B02', null, 'BV-1105', 'joperador'],
  [1, 'AJUSTE_NEGATIVO', 'SKU-OFI-003', 2, null, '', 'ALM-0001', '', null, 'INV-FIS-001', 'mgerente'],
  [1, 'AJUSTE_POSITIVO', 'SKU-EMP-002', 5, null, 'ALM-0001', '', '', null, 'INV-FIS-001', 'mgerente']
];

/* Nota: la ENTRADA del lote L-0225 del aceite (SKU-ALI-001) falta arriba a
 * propósito de legibilidad; se agrega aquí y se inserta en su posición por día. */
var SEED_MOVIMIENTOS_EXTRA = [
  [12, 'ENTRADA', 'SKU-ALI-001', 60, 2.15, 'ALM-0001', '', 'L-0225', 28, 'OC-1013', 'admin']
];

/* --------------------------- INSTALADOR --------------------------- */

function setupSystem() {
  var lock = LockService.getScriptLock();
  lock.waitLock(300000);
  var inicio = Date.now();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(CABECERAS).forEach(function (nombre) {
      crearHojaSiFalta_(ss, nombre, CABECERAS[nombre]);
    });
    SpreadsheetApp.flush();
    sembrarCatalogos_();
    SpreadsheetApp.flush();
    sembrarMovimientos_();
    SpreadsheetApp.flush();
    sembrarVentasDemo_();   // Adenda: ventas demo a partir de las salidas BV-*
    sembrarCajaDemo_();     // Adenda: caja abierta de hoy para el cuadre
    sembrarCotizacionesDemo_(); // Adenda 1.3: proformas de ejemplo
    migrarAdendaV12_();     // Adenda 1.2: columnas y claves de POS Pro
    migrarAdendaV13_();     // Adenda 1.3: fiados, cotizaciones y columnas nuevas
    migrarAdendaV16_();     // Adenda 1.6: país, comprobantes, finanzas, compras, RRHH
    SpreadsheetApp.flush();
    var resumen = {
      productos: dbLeer_(APP.SHEETS.PRODUCTOS).length,
      movimientos: dbLeer_(APP.SHEETS.MOVIMIENTOS).length,
      filasKardex: dbLeer_(APP.SHEETS.KARDEX).length,
      lotes: dbLeer_(APP.SHEETS.LOTES).length,
      usuarios: dbLeer_(APP.SHEETS.USUARIOS).length,
      ventas: dbLeer_(APP.SHEETS.VENTAS).length,
      segundos: Math.round((Date.now() - inicio) / 1000)
    };
    console.log('setupSystem OK: ' + JSON.stringify(resumen));
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/** Destructivo: borra todas las pestañas del sistema y reinstala la demo. */
function resetSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(CABECERAS).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (hoja) ss.deleteSheet(hoja);
  });
  SpreadsheetApp.flush();
  return setupSystem();
}

/* ------------------- ADENDA 1.5: INSTALACIÓN DESDE CERO ------------------- */

/**
 * Instalación para una EMPRESA NUEVA (producción): crea las pestañas con
 * sus cabeceras, la configuración por defecto, la numeración y UN único
 * usuario admin (admin / admin123). NO siembra productos, almacenes,
 * clientes ni movimientos de demostración.
 *
 * Tras ejecutarla, al iniciar sesión como admin el sistema detecta que
 * está vacío y lanza el ASISTENTE DE INICIO (categorías, productos con
 * stock inicial, clientes, fondo de caja, etc.).
 * ¡Cambie la contraseña del admin desde el asistente (paso 2)!
 */
function setupDesdeCero() {
  var lock = LockService.getScriptLock();
  lock.waitLock(300000);
  var inicio = Date.now();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(CABECERAS).forEach(function (nombre) {
      crearHojaSiFalta_(ss, nombre, CABECERAS[nombre]);
    });
    SpreadsheetApp.flush();

    // 1) Configuración por defecto (incluye ASISTENTE_COMPLETADO = No).
    Object.keys(CONFIG_CLAVES).forEach(function (k) { configGuardar_(k, CONFIG_CLAVES[k]); });
    // Sin datos aún: no apunte el POS a un almacén inexistente; el
    // asistente (paso 3) fijará ALMACEN_VENTA con el almacén creado.
    configGuardar_('ALMACEN_VENTA', '');

    // 2) Usuario admin inicial (idempotente: no duplica si ya existe).
    var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
    var hayAdmin = usuarios.some(function (u) { return String(u.usuario).trim().toLowerCase() === 'admin'; });
    if (!hayAdmin) {
      var salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      insertarUsuario_({
        id: dbSiguienteId_(APP.SHEETS.USUARIOS, 'USR-', 4),
        usuario: 'admin', nombre: 'Administrador', rol: 'admin',
        salt: salt, hash: hashV2_(salt, 'admin123'),
        estado: 'ACTIVO', ultimoAcceso: '', creado: fechaNow_()
      });
    }

    // 3) Numeración de comprobantes en cero.
    var filasNum = dbLeer_(APP.SHEETS.NUMERACION);
    var tipos = {};
    filasNum.forEach(function (f) { tipos[String(f.tipo).toUpperCase()] = true; });
    if (!tipos['BOLETA'])    dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'BOLETA',    prefijo: String(CONFIG_CLAVES.PREFIJO_BOLETA), correlativo: 0 });
    if (!tipos['VENTA'])     dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'VENTA',     prefijo: 'V-',  correlativo: 0 });
    if (!tipos['COTIZACION'])dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'COTIZACION',prefijo: 'COT-',correlativo: 0 });

    // 4) Migraciones de adendas (idempotentes; mantienen compatibilidad).
    migrarAdendaV12_();
    migrarAdendaV13_();
    migrarAdendaV16_();
    SpreadsheetApp.flush();

    var resumen = {
      modo: 'DESDE_CERO',
      pestañas: Object.keys(CABECERAS).length,
      usuarios: dbLeer_(APP.SHEETS.USUARIOS).length,
      productos: dbLeer_(APP.SHEETS.PRODUCTOS).length,
      credencialesIniciales: 'admin / admin123 (cámbielas en el asistente)',
      segundos: Math.round((Date.now() - inicio) / 1000)
    };
    console.log('setupDesdeCero OK: ' + JSON.stringify(resumen));
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Limpia los DATOS de demostración de una instalación existente para
 * pasar a producción con datos reales (vía asistente de inicio).
 *  · Vacía: movimientos, kardex, lotes, stock, productos, categorías,
 *    almacenes, proveedores, clientes, ventas, detalle, cotizaciones,
 *    pagos de fiado, caja, auditoría y sesiones abiertas.
 *  · Reinicia la numeración de boletas/ventas/cotizaciones a 0.
 *  · CONSERVA: usuarios (con sus contraseñas) y configuración general;
 *    marca ASISTENTE_COMPLETADO = No para relanzar el asistente.
 */
function borrarDatosDemo() {
  var lock = LockService.getScriptLock();
  lock.waitLock(300000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var vaciar = [APP.SHEETS.MOVIMIENTOS, APP.SHEETS.KARDEX, APP.SHEETS.LOTES, APP.SHEETS.STOCK,
                  APP.SHEETS.PRODUCTOS, APP.SHEETS.CATEGORIAS, APP.SHEETS.ALMACENES,
                  APP.SHEETS.PROVEEDORES, APP.SHEETS.CLIENTES, APP.SHEETS.VENTAS,
                  APP.SHEETS.VENTA_DETALLE, APP.SHEETS.COTIZACIONES, APP.SHEETS.COTIZACION_DETALLE,
                  APP.SHEETS.PAGOS_FIADO, APP.SHEETS.CAJA, APP.SHEETS.AUDITORIA, APP.SHEETS.SESIONES,
                  APP.SHEETS.COMPROBANTES, APP.SHEETS.CUOTAS, APP.SHEETS.GASTOS, APP.SHEETS.ORDENES,
                  APP.SHEETS.OC_ITEMS, APP.SHEETS.OC_OFERTAS, APP.SHEETS.CUENTAS_PAGAR,
                  APP.SHEETS.NOTIFICACIONES, APP.SHEETS.ASISTENCIA, APP.SHEETS.FIDEL_HIST];
    vaciar.forEach(function (nombre) {
      var hoja = ss.getSheetByName(nombre);
      if (hoja && hoja.getLastRow() > 1) hoja.deleteRows(2, hoja.getLastRow() - 1);
    });

    // Numeración en cero.
    var num = ss.getSheetByName(APP.SHEETS.NUMERACION);
    if (num && num.getLastRow() > 1) {
      var ultima = num.getLastColumn();
      var rango = num.getRange(2, 1, num.getLastRow() - 1, ultima);
      var datos = rango.getValues().map(function (f) { f[2] = 0; return f; });
      rango.setValues(datos);
    }

    configGuardar_('ASISTENTE_COMPLETADO', 'No');
    SpreadsheetApp.flush();
    var resumen = {
      modo: 'DEMO_BORRADA',
      usuariosConservados: dbLeer_(APP.SHEETS.USUARIOS).length,
      productos: dbLeer_(APP.SHEETS.PRODUCTOS).length,
      movimientos: dbLeer_(APP.SHEETS.MOVIMIENTOS).length
    };
    console.log('borrarDatosDemo OK: ' + JSON.stringify(resumen));
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adenda 1.5 — Estado del sistema para el ASISTENTE DE INICIO.
 * Devuelve conteos de catálogos y si el asistente está pendiente
 * (sistema sin productos y con la marca ASISTENTE_COMPLETADO = No).
 */
function sistemaEstado_(c) {
  requiereSesion_(c);
  var activos = function (f) { return String(f.estado || '').toUpperCase() === 'ACTIVO'; };
  var productos = dbLeer_(APP.SHEETS.PRODUCTOS);
  var cfg = configLeer_();
  var completado = String(cfg.ASISTENTE_COMPLETADO || 'No').trim().toUpperCase();
  var esSi = completado === 'SÍ' || completado === 'SI';
  var productosActivos = productos.filter(activos).length;
  return appOk_({
    version: APP.VERSION,
    asistenteCompletado: esSi,
    necesitaAsistente: !esSi && productosActivos === 0,
    conteo: {
      productos: productosActivos,
      almacenes: dbLeer_(APP.SHEETS.ALMACENES).filter(activos).length,
      categorias: dbLeer_(APP.SHEETS.CATEGORIAS).filter(activos).length,
      clientes: dbLeer_(APP.SHEETS.CLIENTES).filter(activos).length,
      usuarios: dbLeer_(APP.SHEETS.USUARIOS).filter(activos).length,
      ventas: dbLeer_(APP.SHEETS.VENTAS).filter(function (v) { return String(v.estado).toUpperCase() === 'EMITIDA'; }).length
    }
  });
}

/**
 * Adenda 1.2 (POS Pro) — NO destructiva: actualiza una instalación
 * existente de v1.0/v1.1 sin tocar los datos. Ejecutar UNA vez desde el
 * editor si ya tenía el sistema funcionando (setupSystem la llama solo).
 *   · Productos:      + columna "precioMinimo" (default = 90% del precio de venta)
 *   · Ventas:         + columnas "descuentoTotal" y "autorizadoPor"
 *   · VentaDetalle:   + columnas "precioOriginal" y "esRegalo"
 *   · Config:         + DESCUENTO_MAX_PCT, DESCUENTO_REQUIERE_AUTORIZACION, REGALO_REQUIERE_AUTORIZACION
 */
function migrarAdendaV12() {
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var r = migrarAdendaV12_();
    console.log('migrarAdendaV12 OK: ' + JSON.stringify(r));
    return r;
  } finally {
    lock.releaseLock();
  }
}

function migrarAdendaV12_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = { columnas: [], claves: [] };

  function ensureCol(nombreHoja, col, defecto) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;
    var ultima = hoja.getLastColumn();
    var cab = hoja.getRange(1, 1, 1, ultima).getValues()[0].map(function (h) { return String(h).trim(); });
    if (cab.indexOf(col) !== -1) return;
    hoja.insertColumnAfter(ultima);
    hoja.getRange(1, ultima + 1).setValue(col);
    if (defecto) {
      var nFilas = hoja.getLastRow();
      if (nFilas > 1) hoja.getRange(2, ultima + 1, nFilas - 1).setValue(defecto);
    }
    res.columnas.push(nombreHoja + '.' + col);
  }

  // Columna "precioMinimo": default = 90% del precio de venta de cada producto.
  var prod = ss.getSheetByName(APP.SHEETS.PRODUCTOS);
  if (prod) {
    var ultimaP = prod.getLastColumn();
    var cabP = prod.getRange(1, 1, 1, ultimaP).getValues()[0].map(function (h) { return String(h).trim(); });
    var colPV = cabP.indexOf('precioVenta') + 1;
    if (cabP.indexOf('precioMinimo') === -1 && colPV > 0) {
      prod.insertColumnAfter(colPV);
      prod.getRange(1, colPV + 1).setValue('precioMinimo');
      var nP = prod.getLastRow();
      if (nP > 1) {
        var precios = prod.getRange(2, colPV, nP - 1, 1).getValues();
        var minimos = precios.map(function (r) { return Math.round(numero_(r[0]) * 90) / 100; });
        prod.getRange(2, colPV + 1, nP - 1, 1).setValues(minimos);
      }
      res.columnas.push('Productos.precioMinimo');
    }
  }

  ensureCol(APP.SHEETS.VENTAS, 'descuentoTotal', 0);
  ensureCol(APP.SHEETS.VENTAS, 'autorizadoPor', '');
  ensureCol(APP.SHEETS.VENTA_DETALLE, 'precioOriginal', '');
  ensureCol(APP.SHEETS.VENTA_DETALLE, 'esRegalo', 'No');

  // Claves nuevas de configuración.
  Object.keys(CONFIG_CLAVES).forEach(function (k) {
    if (['DESCUENTO_MAX_PCT', 'DESCUENTO_REQUIERE_AUTORIZACION', 'REGALO_REQUIERE_AUTORIZACION'].indexOf(k) !== -1) {
      var filas = dbLeer_(APP.SHEETS.CONFIG);
      var existe = false;
      for (var i = 0; i < filas.length; i++) {
        if (String(filas[i].clave) === k) { existe = true; break; }
      }
      if (!existe) {
        dbInsertar_(APP.SHEETS.CONFIG, { clave: k, valor: CONFIG_CLAVES[k] });
        res.claves.push(k);
      }
    }
  });
  return res;
}

function crearHojaSiFalta_(ss, nombre, cabeceras) {
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras])
      .setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, cabeceras.length);
  }
  return hoja;
}

function sembrarCatalogos_() {
  // Config
  Object.keys(CONFIG_CLAVES).forEach(function (k) { configGuardar_(k, CONFIG_CLAVES[k]); });

  // Usuarios demo: admin/admin123 · gerente, operador, consulta/demo123
  var usuarios = [
    ['USR-0001', 'admin', 'Administrador del Sistema', 'admin', 'admin123'],
    ['USR-0002', 'mgerente', 'María Torres Vega', 'gerente', 'demo123'],
    ['USR-0003', 'joperador', 'Jorge Ramírez Soto', 'operador', 'demo123'],
    ['USR-0004', 'consulta', 'Ana Flores Díaz', 'consulta', 'demo123']
  ];
  usuarios.forEach(function (u) {
    var salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
    insertarUsuario_({
      id: u[0], usuario: u[1], nombre: u[2], rol: u[3],
      salt: salt, hash: hashV2_(salt, u[4]),
      estado: 'ACTIVO', ultimoAcceso: '', creado: fechaNow_()
    });
  });

  SEED_CATEGORIAS.forEach(function (c, i) {
    dbInsertar_(APP.SHEETS.CATEGORIAS, { id: 'CAT-' + String(i + 1).padStart(3, '0'), nombre: c[0], descripcion: c[1], estado: 'ACTIVO' });
  });

  SEED_ALMACENES.forEach(function (a) {
    dbInsertar_(APP.SHEETS.ALMACENES, { id: a[0], codigo: a[1], nombre: a[2], direccion: a[3], responsable: a[4], estado: 'ACTIVO' });
  });

  var mapProd = {};
  SEED_PRODUCTOS.forEach(function (p, i) {
    var id = 'PRD-' + String(i + 1).padStart(4, '0');
    mapProd[p[0]] = id;
    dbInsertar_(APP.SHEETS.PRODUCTOS, {
      id: id, sku: p[0], nombre: p[1], descripcion: p[11], categoria: p[2], unidad: p[3],
      costoStd: p[4], precioVenta: p[5], precioMinimo: Math.round(p[5] * 90) / 100, stockMin: p[6], stockMax: p[7],
      requiereLote: p[8], requiereSerie: p[9], perecedero: p[10], estado: 'ACTIVO', creado: fechaNow_()
    });
  });

  SEED_PROVEEDORES.forEach(function (p, i) {
    dbInsertar_(APP.SHEETS.PROVEEDORES, {
      id: 'PRV-' + String(i + 1).padStart(4, '0'), ruc: p[0], razonSocial: p[1], contacto: p[2],
      telefono: p[3], email: p[4], direccion: p[5], estado: 'ACTIVO'
    });
  });

  SEED_CLIENTES.forEach(function (p, i) {
    dbInsertar_(APP.SHEETS.CLIENTES, {
      id: 'CLI-' + String(i + 1).padStart(4, '0'), documento: p[0], razonSocial: p[1], contacto: p[2],
      telefono: p[3], email: p[4], direccion: p[5], estado: 'ACTIVO',
      limiteFiado: FIADO_LIMITE_DEMO[p[0]] || 0, saldoFiado: 0
    });
  });

  // Adenda: correlativos de comprobantes (BOLETA continúa tras la semilla BV-1105).
  dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'BOLETA', prefijo: String(CONFIG_CLAVES.PREFIJO_BOLETA), correlativo: 1105 });
  dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'VENTA', prefijo: 'V-', correlativo: 0 });
  dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'COTIZACION', prefijo: 'COT-', correlativo: 0 });

  return mapProd;
}

/** Adenda: deja una caja ABIERTA hoy con S/ 200 de fondo fijo. */
function sembrarCajaDemo_() {
  var hayAbierta = dbLeer_(APP.SHEETS.CAJA).some(function (f) { return String(f.estado).toUpperCase() === 'ABIERTA'; });
  if (hayAbierta) return;
  dbInsertar_(APP.SHEETS.CAJA, {
    id: dbSiguienteId_(APP.SHEETS.CAJA, 'CJA-', 5),
    fecha: fechaNow_(), aperturaAt: fechaNow_(), usuario: 'admin',
    montoInicial: 200, cierreAt: '', montoSistema: '', montoContado: '',
    diferencia: '', estado: 'ABIERTA', detalle: ''
  });
}

/** Reproduce los movimientos semilla (ordenados por día) con el motor real. */
function sembrarMovimientos_() {
  var prods = dbLeer_(APP.SHEETS.PRODUCTOS);
  var skuAId = {};
  prods.forEach(function (p) { skuAId[p.sku] = p.id; });

  var todos = SEED_MOVIMIENTOS.concat(SEED_MOVIMIENTOS_EXTRA);
  todos.sort(function (a, b) {
    if (a[0] !== b[0]) return b[0] - a[0]; // más antiguo primero
    return String(a[9]).localeCompare(String(b[9]));
  });

  var sesSeed = { token: '', usuarioId: 'SEED', usuario: 'seed', nombre: 'Carga inicial', rol: 'admin' };
  var base = new Date(fechaDiaStr_(fechaNow_())).getTime();

  todos.forEach(function (m, idx) {
    var diasAtras = m[0], tipo = m[1], sku = m[2], cantidad = m[3], costo = m[4];
    var almDestino = m[5], almOrigen = m[6], lote = m[7], vencDias = m[8], docRef = m[9], usuario = m[10];

    var fechaMov = new Date(base - diasAtras * 86400000 + 10 * 3600000 + (idx % 40) * 60000); // HH 10:MM
    var venc = '';
    if (vencDias !== null && vencDias !== undefined && vencDias !== '') {
      venc = Utilities.formatDate(new Date(fechaMov.getTime() + vencDias * 86400000), APP.TZ, 'yyyy-MM-dd');
    }

    var datos = {
      tipo: tipo,
      productoId: skuAId[sku],
      cantidad: cantidad,
      costoUnitario: costo,
      lote: lote || '',
      numeroSerie: '',
      fechaVencimiento: venc,
      almacenOrigenId: almOrigen || '',
      almacenDestinoId: almDestino || '',
      documentoRef: docRef || '',
      observaciones: 'Carga inicial de demostración',
      motivo: tipo === 'AJUSTE_NEGATIVO' ? 'Merma por unidades dañadas' : (tipo === 'AJUSTE_POSITIVO' ? 'Ajuste por conteo físico' : ''),
      fechaOverride: fechaMov
    };

    var sesU = Object.assign({}, sesSeed, { usuario: usuario });
    ejecutarMovimiento_(datos, sesU);
    if (idx % 10 === 9) SpreadsheetApp.flush();
  });

  console.log('Semilla de movimientos completada: ' + todos.length + ' registros');
}

/* --------------------- ADENDA 1.3: semilla de cotizaciones --------------------- */

/** Dos proformas de ejemplo: una vigente (10 días) y una vencida (hace 3). */
function sembrarCotizacionesDemo_() {
  if (dbLeer_(APP.SHEETS.COTIZACIONES).length > 0) return;
  var cfg = configLeer_();
  var prods = {};
  dbLeer_(APP.SHEETS.PRODUCTOS).forEach(function (p) { prods[p.sku] = p; });
  var cliDelta = dbPorId_(APP.SHEETS.CLIENTES, 'CLI-0001');
  var cliVital = dbPorId_(APP.SHEETS.CLIENTES, 'CLI-0004');

  var ahora = fechaNow_();
  var hoyMs = new Date(fechaDiaStr_(ahora)).getTime();

  var DEFINICION = [
    {
      diasAtras: 1, validezDias: 10, cliente: cliDelta, usuario: 'mgerente',
      nota: 'Proyecto de equipamiento de oficina — piso 4',
      items: [['SKU-OFI-001', 40], ['SKU-ELE-003', 12], ['SKU-EMP-001', 30]]
    },
    {
      diasAtras: 18, validezDias: 15, cliente: cliVital, usuario: 'admin',
      nota: 'Seguimiento — cotización sin respuesta',
      items: [['SKU-ELE-002', 5], ['SKU-HER-001', 2]]
    }
  ];

  DEFINICION.forEach(function (def, idx) {
    var bruto = 0;
    var lineas = def.items.map(function (it) {
      var p = prods[it[0]] || {};
      var precio = numero_(p.precioVenta);
      bruto += it[1] * precio;
      return { productoId: p.id, sku: p.sku, descripcion: p.nombre, cantidad: it[1], precioUnit: precio, esRegalo: 'No', subtotal: redondear_(it[1] * precio) };
    });
    var totales = calcularTotalesVenta_(cfg, bruto);
    var fecha = new Date(hoyMs - def.diasAtras * 86400000 + 11 * 3600000);
    var validez = new Date(fecha.getTime() + def.validezDias * 86400000);
    var cor = siguienteCorrelativo_('COTIZACION');
    var cot = {
      id: 'CT-' + cor.texto, numero: cor.texto, fecha: fecha,
      clienteId: def.cliente.id, clienteDocTipo: String(def.cliente.documento || '').length === 11 ? 'RUC' : 'DNI',
      clienteDocNumero: def.cliente.documento || '', clienteNombre: def.cliente.razonSocial,
      clienteTelefono: String(def.cliente.telefono || ''),
      subtotal: totales.subtotal, igv: totales.igv, total: totales.total,
      validezHasta: validez, validezDias: def.validezDias,
      estado: 'VIGENTE', usuario: def.usuario, convertidoA: '', nota: def.nota
    };
    dbInsertar_(APP.SHEETS.COTIZACIONES, cot);
    lineas.forEach(function (l) {
      l.id = dbSiguienteId_(APP.SHEETS.COTIZACION_DETALLE, 'CD-', 6);
      l.cotizacionId = cot.id;
      dbInsertar_(APP.SHEETS.COTIZACION_DETALLE, l);
    });
  });
  console.log('Cotizaciones demo creadas: ' + DEFINICION.length);
}

/* --------------------- ADENDA 1.3: migración no destructiva --------------------- */

/**
 * Adenda 1.3 — NO destructiva: actualiza una instalación existente de
 * v1.0/v1.1/v1.2 sin tocar los datos. Ejecutar UNA vez desde el editor
 * si ya tenía el sistema funcionando (setupSystem la llama sola).
 *   · Clientes:       + columnas "limiteFiado" y "saldoFiado" (default 0)
 *   · Ventas:         + "clienteTelefono", "estadoPago" (default PAGADO) y "enviadoWhatsapp" (No)
 *   · VentaDetalle:   + columna "costoUnit"
 *   · Pestañas nuevas: PagosFiado, Cotizaciones, CotizacionDetalle
 *   · Numeracion:     + fila COTIZACION (prefijo COT-)
 *   · Config:         + FIADO_PERMITIR_EXCEDER, FIADO_DIAS_ALERTA, WHATSAPP_PREFIJO
 *   · Normaliza estadoPago = FIADO en ventas antiguas con metodoPago Fiado
 */
function migrarAdendaV13() {
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var r = migrarAdendaV13_();
    console.log('migrarAdendaV13 OK: ' + JSON.stringify(r));
    return r;
  } finally {
    lock.releaseLock();
  }
}

function migrarAdendaV13_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = { columnas: [], claves: [], hojas: [], numeracion: false, estadoPagoFiado: 0 };

  // 1) Pestañas nuevas (solo se crean si faltan; nunca borran datos).
  [['PagosFiado', CABECERAS.PagosFiado],
   ['Cotizaciones', CABECERAS.Cotizaciones],
   ['CotizacionDetalle', CABECERAS.CotizacionDetalle]].forEach(function (par) {
    var hoja = crearHojaSiFalta_(ss, par[0], par[1]);
    if (hoja.getLastRow() <= 1) res.hojas.push(par[0]);
  });

  // 2) Columnas nuevas en pestañas existentes.
  function ensureCol(nombreHoja, col, defecto) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;
    var ultima = hoja.getLastColumn();
    var cab = hoja.getRange(1, 1, 1, ultima).getValues()[0].map(function (h) { return String(h).trim(); });
    if (cab.indexOf(col) !== -1) return;
    hoja.insertColumnAfter(ultima);
    hoja.getRange(1, ultima + 1).setValue(col);
    if (defecto !== null && defecto !== undefined && defecto !== '') {
      var nFilas = hoja.getLastRow();
      if (nFilas > 1) hoja.getRange(2, ultima + 1, nFilas - 1).setValue(defecto);
    }
    res.columnas.push(nombreHoja + '.' + col);
  }
  ensureCol(APP.SHEETS.CLIENTES, 'limiteFiado', 0);
  ensureCol(APP.SHEETS.CLIENTES, 'saldoFiado', 0);
  ensureCol(APP.SHEETS.VENTAS, 'clienteTelefono', '');
  ensureCol(APP.SHEETS.VENTAS, 'estadoPago', 'PAGADO');
  ensureCol(APP.SHEETS.VENTAS, 'enviadoWhatsapp', 'No');
  ensureCol(APP.SHEETS.VENTA_DETALLE, 'costoUnit', '');

  // 3) Ventas antiguas con metodoPago Fiado → estadoPago FIADO.
  var ventasHoja = ss.getSheetByName(APP.SHEETS.VENTAS);
  if (ventasHoja) {
    var ultimaV = ventasHoja.getLastColumn();
    var cabV = ventasHoja.getRange(1, 1, 1, ultimaV).getValues()[0].map(function (h) { return String(h).trim(); });
    var colMetodo = cabV.indexOf('metodoPago') + 1;
    var colEstadoPago = cabV.indexOf('estadoPago') + 1;
    if (colMetodo > 0 && colEstadoPago > 0 && ventasHoja.getLastRow() > 1) {
      var datosV = ventasHoja.getRange(2, 1, ventasHoja.getLastRow() - 1, ultimaV).getValues();
      for (var i = 0; i < datosV.length; i++) {
        var yaTiene = String(datosV[i][colEstadoPago - 1] || '').trim();
        if (yaTiene) continue;
        if (String(datosV[i][colMetodo - 1]).toUpperCase() === 'FIADO') {
          ventasHoja.getRange(i + 2, colEstadoPago).setValue('FIADO');
          res.estadoPagoFiado++;
        }
      }
    }
  }

  // 4) Correlativo de cotizaciones si falta.
  var filasNum = dbLeer_(APP.SHEETS.NUMERACION);
  var tieneCot = false;
  filasNum.forEach(function (f) { if (String(f.tipo).toUpperCase() === 'COTIZACION') tieneCot = true; });
  if (!tieneCot) {
    dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'COTIZACION', prefijo: 'COT-', correlativo: 0 });
    res.numeracion = true;
  }

  // 5) Claves nuevas de configuración.
  var clavesNuevas = ['FIADO_PERMITIR_EXCEDER', 'FIADO_DIAS_ALERTA', 'WHATSAPP_PREFIJO'];
  var filasCfg = dbLeer_(APP.SHEETS.CONFIG);
  clavesNuevas.forEach(function (k) {
    var existe = false;
    for (var i = 0; i < filasCfg.length; i++) {
      if (String(filasCfg[i].clave) === k) { existe = true; break; }
    }
    if (!existe) {
      dbInsertar_(APP.SHEETS.CONFIG, { clave: k, valor: CONFIG_CLAVES[k] });
      res.claves.push(k);
    }
  });

  return res;
}

/* ------------------- ADENDA 1.6: LOCALIZACIÓN, SUNAT, FINANZAS ------------------- */

/**
 * Migración v1.6 (idempotente; se ejecuta sola en setupSystem /
 * setupDesdeCero, o manualmente con migrarAdendaV16()):
 *   · Crea las pestañas nuevas (Comprobantes, Cuotas, Gastos, Cajas de
 *     categorías de gasto, Órdenes de compra + items/ofertas, Cuentas
 *     por pagar, Notificaciones, Asistencia, Vendedores, FidHistorial
 *     y Presupuesto) si faltan.
 *   · Columnas nuevas: Productos (escalas de precio, fraccionamiento y
 *     código de barras), Clientes (puntos), Ventas (vendedor, puntos y
 *     comprobante), VentaDetalle (unidad de venta/factor).
 *   · Numeración: FACTURA, NOTA_CREDITO, NOTA_DEBITO, ORDEN_COMPRA.
 *   · Semillas: categorías de gasto + claves de configuración 1.6.
 */
function migrarAdendaV16() {
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var r = migrarAdendaV16_();
    console.log('migrarAdendaV16 OK: ' + JSON.stringify(r));
    return r;
  } finally {
    lock.releaseLock();
  }
}

function migrarAdendaV16_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = { pestanas: [], columnas: [], numeracion: false, categoriasGasto: 0, claves: [] };

  // 1) Pestañas nuevas.
  Object.keys(CABECERAS).forEach(function (nombre) {
    if (['Comprobantes', 'Cuotas', 'Gastos', 'GastosCategorias', 'OrdenesCompra', 'OcItems',
         'OcOfertas', 'CuentasPagar', 'Notificaciones', 'Asistencia', 'Vendedores',
         'FidHistorial', 'Presupuesto'].indexOf(nombre) !== -1) {
      if (!ss.getSheetByName(nombre)) {
        crearHojaSiFalta_(ss, nombre, CABECERAS[nombre]);
        res.pestanas.push(nombre);
      }
    }
  });

  // 2) Columnas nuevas en pestañas existentes.
  function ensureCol(nombreHoja, col, defecto) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;
    var ultima = hoja.getLastColumn();
    var cab = hoja.getRange(1, 1, 1, ultima).getValues()[0].map(function (h) { return String(h).trim(); });
    if (cab.indexOf(col) !== -1) return;
    hoja.insertColumnAfter(ultima);
    hoja.getRange(1, ultima + 1).setValue(col);
    if (defecto !== undefined && defecto !== '') {
      var nFilas = hoja.getLastRow();
      if (nFilas > 1) hoja.getRange(2, ultima + 1, nFilas - 1).setValue(defecto);
    }
    res.columnas.push(nombreHoja + '.' + col);
  }
  ensureCol(APP.SHEETS.PRODUCTOS, 'precio2', '');
  ensureCol(APP.SHEETS.PRODUCTOS, 'escala2Min', '');
  ensureCol(APP.SHEETS.PRODUCTOS, 'precio3', '');
  ensureCol(APP.SHEETS.PRODUCTOS, 'escala3Min', '');
  ensureCol(APP.SHEETS.PRODUCTOS, 'fraccionActiva', 'No');
  ensureCol(APP.SHEETS.PRODUCTOS, 'unidadFraccion', '');
  ensureCol(APP.SHEETS.PRODUCTOS, 'factorFraccion', '');
  ensureCol(APP.SHEETS.PRODUCTOS, 'codigoBarras', '');
  ensureCol(APP.SHEETS.CLIENTES, 'puntos', 0);
  ensureCol(APP.SHEETS.CLIENTES, 'tipoPrecio', '');
  ensureCol(APP.SHEETS.VENTAS, 'vendedor', '');
  ensureCol(APP.SHEETS.VENTAS, 'puntosUsados', 0);
  ensureCol(APP.SHEETS.VENTAS, 'puntosGanados', 0);
  ensureCol(APP.SHEETS.VENTAS, 'tipoComprobante', '');
  ensureCol(APP.SHEETS.VENTAS, 'compNumero', '');
  ensureCol(APP.SHEETS.VENTAS, 'guiaRemision', '');
  ensureCol(APP.SHEETS.VENTA_DETALLE, 'unidadVenta', '');
  ensureCol(APP.SHEETS.VENTA_DETALLE, 'factorFraccion', '');

  // 3) Numeración de comprobantes y órdenes.
  var filasNum = dbLeer_(APP.SHEETS.NUMERACION);
  var tipos = {};
  filasNum.forEach(function (f) { tipos[String(f.tipo).toUpperCase()] = true; });
  if (!tipos['FACTURA'])       dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'FACTURA',       prefijo: 'F001', correlativo: 0 });
  if (!tipos['NOTA_CREDITO'])  dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'NOTA_CREDITO',  prefijo: 'FC01', correlativo: 0 });
  if (!tipos['NOTA_DEBITO'])   dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'NOTA_DEBITO',   prefijo: 'FD01', correlativo: 0 });
  if (!tipos['ORDEN_COMPRA'])  dbInsertar_(APP.SHEETS.NUMERACION, { tipo: 'ORDEN_COMPRA',  prefijo: 'OC-',  correlativo: 0 });
  res.numeracion = true;

  // 4) Categorías de gasto por defecto.
  var cats = dbLeer_(APP.SHEETS.GASTOS_CATEGORIAS);
  if (!cats.length) {
    SEED_GASTOS_CATEGORIAS.forEach(function (c, i) {
      dbInsertar_(APP.SHEETS.GASTOS_CATEGORIAS, {
        id: 'GCA-' + String(i + 1).padStart(3, '0'), nombre: c[0], tipo: c[1], estado: 'ACTIVO'
      });
    });
    res.categoriasGasto = SEED_GASTOS_CATEGORIAS.length;
  }

  // 5) Claves de configuración 1.6.
  var claves16 = ['PAIS', 'IMPUESTO_NOMBRE', 'SERIE_BOLETA', 'SERIE_FACTURA', 'SERIE_NC', 'SERIE_ND',
    'COMPROBANTE_AUTO', 'SUNAT_MODO', 'SUNAT_API_URL', 'SUNAT_API_USUARIO', 'SUNAT_API_PASSWORD',
    'SUNAT_COMPANY_ID', 'SUNAT_BRANCH_ID', 'SUNAT_METODO_ENVIO', 'SUNAT_TIPO_OPERACION',
    'TC_USD', 'TC_FECHA', 'TC_API_URL', 'QR_YAPE_NUMERO', 'QR_PLIN_NUMERO', 'QR_BANCO',
    'FIDEL_ACTIVA', 'FIDEL_MONTO_PUNTO', 'FIDEL_VALOR_PUNTO', 'FIDEL_MIN_CANJE',
    'RECORD_ACTIVO', 'RECORD_EMAIL', 'BACKUP_ACTIVO', 'BACKUP_RETENCION',
    'CATALOGO_ACTIVO', 'CATALOGO_TOKEN', 'CATALOGO_MENSAJE', 'ALMACEN_RECEPCION'];
  var filasCfg = dbLeer_(APP.SHEETS.CONFIG);
  var existentes = {};
  filasCfg.forEach(function (f) { existentes[String(f.clave)] = true; });
  claves16.forEach(function (k) {
    if (!existentes[k]) {
      dbInsertar_(APP.SHEETS.CONFIG, { clave: k, valor: CONFIG_CLAVES[k] });
      res.claves.push(k);
    }
  });

  SpreadsheetApp.flush();
  return res;
}
