/**
 * NexoERP — demo-data.js
 * Dataset de demostración. Espeja EXACTAMENTE la semilla del backend
 * (09_Setup.gs) para que el modo demo y la instalación real muestren
 * los mismos datos: 18 productos, 3 almacenes, 63 movimientos de 30 días.
 */

var DEMO_SEED = {

  config: {
    NOMBRE_EMPRESA: 'NexoERP Distribución S.A.C.',
    MONEDA_CODIGO: 'PEN',
    MONEDA_SIMBOLO: 'S/',
    METODO_VALUACION: 'PROMEDIO',
    PERMITIR_STOCK_NEGATIVO: 'No',
    DIAS_ALERTA_VENCIMIENTO: '30',
    /* --- Adenda: identidad fiscal, boletas y cuadre de caja --- */
    RUC: '20512345678',
    RAZON_SOCIAL: 'NexoERP Distribución S.A.C.',
    LOGO_URL: '',
    LOGO_BASE64: '',
    IGV_INCLUIDO: 'Sí',
    IGV_TASA: '18',
    PREFIJO_BOLETA: 'BV-',
    MENSAJE_BOLETA: '¡Gracias por su compra! Cambios dentro de 7 días presentando este comprobante.',
    ALMACEN_VENTA: 'ALM-0003',
    METODO_PAGO_DEFAULT: 'Efectivo',
    HORARIO_INICIO: '08:00',
    HORARIO_FIN: '22:00',
    /* --- Adenda 1.2 (POS Pro): precios, descuentos y regalos --- */
    DESCUENTO_MAX_PCT: '15',
    DESCUENTO_REQUIERE_AUTORIZACION: 'Sí',
    REGALO_REQUIERE_AUTORIZACION: 'Sí',
    /* --- Adenda 1.3: fiados y WhatsApp --- */
    FIADO_PERMITIR_EXCEDER: 'No',
    FIADO_DIAS_ALERTA: '30',
    WHATSAPP_PREFIJO: '51'
  },

  /* Adenda: correlativos de comprobantes. La BOLETA continúa tras la
   * semilla histórica de salidas BV-1101..BV-1105. */
  numeracion: [
    { tipo: 'BOLETA', prefijo: 'BV-', correlativo: 1105 },
    { tipo: 'VENTA', prefijo: 'V-', correlativo: 0 },
    { tipo: 'COTIZACION', prefijo: 'COT-', correlativo: 0 }
  ],

  categorias: [
    { id: 'CAT-001', nombre: 'Electrónica', descripcion: 'Equipos y accesorios electrónicos', estado: 'ACTIVO' },
    { id: 'CAT-002', nombre: 'Herramientas', descripcion: 'Herramientas manuales y eléctricas', estado: 'ACTIVO' },
    { id: 'CAT-003', nombre: 'Oficina', descripcion: 'Papelería y suministros de oficina', estado: 'ACTIVO' },
    { id: 'CAT-004', nombre: 'Empaques', descripcion: 'Materiales de empaque y embalaje', estado: 'ACTIVO' },
    { id: 'CAT-005', nombre: 'Alimentos', descripcion: 'Productos alimenticios (lote y vencimiento)', estado: 'ACTIVO' }
  ],

  almacenes: [
    { id: 'ALM-0001', codigo: 'ALM-PRINCIPAL', nombre: 'Almacén Central', direccion: 'Av. Industrial 1450, Lima', responsable: 'Jorge Ramírez Soto', estado: 'ACTIVO' },
    { id: 'ALM-0002', codigo: 'ALM-NORTE', nombre: 'Almacén Norte', direccion: 'Av. Túpac Amaru 890, Lima', responsable: 'María Torres Vega', estado: 'ACTIVO' },
    { id: 'ALM-0003', codigo: 'ALM-TIENDA', nombre: 'Tienda Centro', direccion: 'Jr. de la Unión 550, Lima', responsable: 'Ana Flores Díaz', estado: 'ACTIVO' }
  ],

  usuarios: [
    { id: 'USR-0001', usuario: 'admin', nombre: 'Administrador del Sistema', rol: 'admin', password: 'admin123', estado: 'ACTIVO', ultimoAcceso: '' },
    { id: 'USR-0002', usuario: 'mgerente', nombre: 'María Torres Vega', rol: 'gerente', password: 'demo123', estado: 'ACTIVO', ultimoAcceso: '' },
    { id: 'USR-0003', usuario: 'joperador', nombre: 'Jorge Ramírez Soto', rol: 'operador', password: 'demo123', estado: 'ACTIVO', ultimoAcceso: '' },
    { id: 'USR-0004', usuario: 'consulta', nombre: 'Ana Flores Díaz', rol: 'consulta', password: 'demo123', estado: 'ACTIVO', ultimoAcceso: '' }
  ],

  productos: [
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
  ],

  proveedores: [
    { id: 'PRV-0001', ruc: '20123456789', razonSocial: 'Distribuidora Andina S.A.C.', contacto: 'Carlos Mendoza', telefono: '01-4567890', email: 'ventas@andina.pe', direccion: 'Av. Argentina 1234, Callao', estado: 'ACTIVO' },
    { id: 'PRV-0002', ruc: '20456789123', razonSocial: 'Importaciones Pacífico E.I.R.L.', contacto: 'Lucía Sánchez', telefono: '01-2233445', email: 'contacto@pacifico.pe', direccion: 'Jr. Amazonas 450, Lima', estado: 'ACTIVO' },
    { id: 'PRV-0003', ruc: '20678912345', razonSocial: 'Suministros Lima Norte S.A.', contacto: 'Pedro Quispe', telefono: '01-7788990', email: 'pq@limanorte.pe', direccion: 'Av. Túpac Amaru 1200, Lima', estado: 'ACTIVO' },
    { id: 'PRV-0004', ruc: '20987654321', razonSocial: 'Comercial Packaging del Perú S.A.C.', contacto: 'Rosa Huamán', telefono: '01-3344556', email: 'rh@packaging.pe', direccion: 'Panamericana Sur km 18, Lima', estado: 'ACTIVO' }
  ],

  clientes: [
    { id: 'CLI-0001', documento: '20111222333', razonSocial: 'Corporación Delta S.A.C.', contacto: 'Fernando Rojas', telefono: '01-9988776', email: 'compras@delta.pe', direccion: 'Av. Canaval y Moreyra 480, Lima', estado: 'ACTIVO', limiteFiado: 1000, saldoFiado: 0 },
    { id: 'CLI-0002', documento: '20444555666', razonSocial: 'E-Imports & Servicios E.I.R.L.', contacto: 'Gabriela Castro', telefono: '01-5566778', email: 'gc@eimports.pe', direccion: 'Calle Las Begonias 545, Lima', estado: 'ACTIVO', limiteFiado: 0, saldoFiado: 0 },
    { id: 'CLI-0003', documento: '00777788889', razonSocial: 'Bodega Doña María', contacto: 'María Llanos', telefono: '987654321', email: '', direccion: 'Av. Brasil 2100, Lima', estado: 'ACTIVO', limiteFiado: 200, saldoFiado: 0 },
    { id: 'CLI-0004', documento: '20999888777', razonSocial: 'Constructora Vitalsur S.A.', contacto: 'Óscar Delgado', telefono: '01-4455667', email: 'od@vitalsur.pe', direccion: 'Av. El Sol 890, Lima', estado: 'ACTIVO', limiteFiado: 0, saldoFiado: 0 }
  ],

  /* Adenda 1.3: proformas de ejemplo (una vigente y una vencida).
   * skuItems: [[sku, cantidad]] — los precios se toman del catálogo. */
  cotizaciones: [
    {
      id: 'CT-COT-0001', numero: 'COT-0001', diasAtras: 1, validezDias: 10,
      clienteId: 'CLI-0001', usuario: 'mgerente',
      nota: 'Proyecto de equipamiento de oficina — piso 4',
      items: [['SKU-OFI-001', 40], ['SKU-ELE-003', 12], ['SKU-EMP-001', 30]]
    },
    {
      id: 'CT-COT-0002', numero: 'COT-0002', diasAtras: 18, validezDias: 15,
      clienteId: 'CLI-0004', usuario: 'admin',
      nota: 'Seguimiento — cotización sin respuesta',
      items: [['SKU-ELE-002', 5], ['SKU-HER-001', 2]]
    }
  ],

  /**
   * [díasAtrás, tipo, sku, cantidad, costoEntrada|null, almDestino, almOrigen, lote, vencimientoEnDías|null, docRef, usuario]
   */
  movimientos: [
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
    [12, 'ENTRADA', 'SKU-ALI-001', 60, 2.15, 'ALM-0001', '', 'L-0225', 28, 'OC-1013', 'admin'],
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
  ]
};
