/**
 * NexoERP — api.js
 * Capa de transporte única hacia el backend.
 *
 * - MODO REAL (CONFIG_APP.API_URL definido): envía fetch POST al Web App de
 *   Google Apps Script con Content-Type "text/plain;charset=utf-8" para evitar
 *   el preflight CORS, y adjunta el token de sesión en el payload.
 * - MODO DEMO (API_URL vacío): enruta todas las llamadas a DemoStore.
 */
var Api = (function () {

  function esDemo() { return !CONFIG_APP.API_URL; }

  function tokenActual() {
    try { return localStorage.getItem(CONFIG_APP.TOKEN_CLAVE) || ''; } catch (e) { return ''; }
  }

  async function llamar(action, payload) {
    var cuerpo = Object.assign({}, payload || {}, { action: action, token: tokenActual() });

    if (esDemo()) {
      var respDemo = await DemoStore.dispatch(cuerpo);
      if (!respDemo.ok) {
        var errD = new Error(respDemo.error);
        errD.code = respDemo.code;
        throw errD;
      }
      return respDemo.data;
    }

    var resp;
    try {
      resp = await fetch(CONFIG_APP.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(cuerpo),
        redirect: 'follow'
      });
    } catch (e) {
      var errNet = new Error('No se pudo conectar con el backend de Google Apps Script. Verifique la URL en assets/js/config.js y que el despliegue esté público (Cualquier usuario).');
      errNet.code = 'NETWORK';
      throw errNet;
    }

    var json;
    try { json = await resp.json(); }
    catch (e) {
      var errJson = new Error('La respuesta del backend no es JSON válido. ¿Re-desplegó el Web App tras editar el código?');
      errJson.code = 'BAD_RESPONSE';
      throw errJson;
    }

    if (!json.ok) {
      var errB = new Error(json.error || 'Error del servidor');
      errB.code = json.code;
      if (errB.code === 'UNAUTHORIZED' || errB.code === 'SESSION_EXPIRED') {
        /* v1.5.1: el fallo del propio login o de la autorización de
         * supervisor NO debe destruir la sesión actual del cajón. */
        var mantiene = (action === 'login' || action === 'ventas_autorizar');
        if (!mantiene && window.AppStore) AppStore.forzarLogout();
      }
      throw errB;
    }
    return json.data;
  }

  /* --- Azúcar semántica --- */
  var metodos = {
    login: function (usuario, password) { return llamar('login', { usuario: usuario, password: password }); },
    logout: function () { return llamar('logout'); },
    ping: function () { return llamar('ping'); },
    dashboard: function () { return llamar('dashboard'); },
    productos: function (f) { return llamar('productos_list', f); },
    guardarProducto: function (item) { return llamar('productos_save', { item: item }); },
    eliminarProducto: function (id) { return llamar('productos_delete', { id: id }); },
    categorias: function () { return llamar('categorias_list'); },
    guardarCategoria: function (item) { return llamar('categorias_save', { item: item }); },
    eliminarCategoria: function (id) { return llamar('categorias_delete', { id: id }); },
    almacenes: function (f) { return llamar('almacenes_list', f); },
    guardarAlmacen: function (item) { return llamar('almacenes_save', { item: item }); },
    eliminarAlmacen: function (id) { return llamar('almacenes_delete', { id: id }); },
    proveedores: function () { return llamar('proveedores_list'); },
    guardarProveedor: function (item) { return llamar('proveedores_save', { item: item }); },
    clientes: function () { return llamar('clientes_list'); },
    guardarCliente: function (item) { return llamar('clientes_save', { item: item }); },
    stock: function (f) { return llamar('stock_list', f); },
    lotes: function (f) { return llamar('lotes_list', f); },
    movimientos: function (f) { return llamar('movimientos_list', f); },
    registrarMovimiento: function (p) { return llamar('movimientos_registrar', p); },
    anularMovimiento: function (id, motivo) { return llamar('movimientos_anular', { id: id, motivo: motivo }); },
    kardex: function (f) { return llamar('kardex', f); },
    reporteStock: function (f) { return llamar('reporte_stock', f); },
    reporteMovimientos: function (f) { return llamar('reporte_movimientos', f); },
    auditoria: function (f) { return llamar('auditoria_list', f); },
    configGet: function () { return llamar('config_get'); },
    configSave: function (item) { return llamar('config_save', { item: item }); },
    usuarios: function () { return llamar('usuarios_list'); },
    guardarUsuario: function (item) { return llamar('usuarios_save', { item: item }); },
    eliminarUsuario: function (id) { return llamar('usuarios_delete', { id: id }); },

    /* --- Adenda: POS, ventas, boletas y caja --- */
    registrarVenta: function (p) { return llamar('ventas_registrar', p); },
    ventas: function (f) { return llamar('ventas_list', f); },
    venta: function (id) { return llamar('ventas_get', { id: id }); },
    anularVenta: function (id, motivo) { return llamar('ventas_anular', { id: id, motivo: motivo }); },
    resumenVentas: function (f) { return llamar('ventas_resumen', f); },
    /* Adenda 1.2: valida credenciales de un supervisor (admin/gerente)
     * para aprobar descuentos fuera de política o regalos. */
    autorizarVenta: function (usuario, password) { return llamar('ventas_autorizar', { autorizacion: { usuario: usuario, password: password } }); },
    cajaEstado: function () { return llamar('caja_estado'); },
    cajaAbrir: function (montoInicial) { return llamar('caja_abrir', { montoInicial: montoInicial }); },
    cajaCerrar: function (montoContado, detalle) { return llamar('caja_cerrar', { montoContado: montoContado, detalle: detalle }); },
    cajaHistorial: function () { return llamar('caja_historial'); },

    /* --- Adenda 1.3: fiados --- */
    fiadosCartera: function () { return llamar('fiados_cartera'); },
    fiadoAbono: function (p) { return llamar('fiado_abono', p); },
    fiadoPagos: function (f) { return llamar('fiado_pagos', f || {}); },

    /* --- Adenda 1.3: cotizaciones --- */
    registrarCotizacion: function (p) { return llamar('cotizaciones_registrar', p); },
    cotizaciones: function (f) { return llamar('cotizaciones_list', f || {}); },
    cotizacion: function (id) { return llamar('cotizaciones_get', { id: id }); },
    convertirCotizacion: function (p) { return llamar('cotizaciones_convertir', p); },
    anularCotizacion: function (id, motivo) { return llamar('cotizaciones_anular', { id: id, motivo: motivo }); },

    /* --- Adenda 1.3: WhatsApp, analítica y panel --- */
    marcarWhatsapp: function (id, telefono) { return llamar('ventas_marcar_whatsapp', { id: id, telefono: telefono || '' }); },
    ventasAnalitica: function (f) { return llamar('ventas_analitica', f || {}); },
    rentabilidadProducto: function (f) { return llamar('rentabilidad_producto', f || {}); },
    panelControl: function () { return llamar('panel_control'); },

    /* --- Adenda 1.5: asistente de inicio desde cero --- */
    sistemaEstado: function () { return llamar('sistema_estado'); },

    /* --- Adenda 1.6: país, comprobantes, finanzas, compras, RRHH --- */
    paises: function () { return llamar('paises_list'); },
    aplicarPais: function (pais, soloVacios) { return llamar('pais_aplicar', { pais: pais, soloVacios: soloVacios }); },
    tcConsultar: function () { return llamar('tc_consultar'); },

    comprobantes: function (f) { return llamar('comprobantes_list', f || {}); },
    comprobanteJson: function (id) { return llamar('comprobantes_json', { id: id }); },
    comprobanteCrearApi: function (id) { return llamar('comprobantes_crear_api', { id: id }); },
    comprobanteEnviar: function (id) { return llamar('comprobantes_enviar', { id: id }); },
    comprobanteEstado: function (id, estado, cdrCodigo, cdrDescripcion, observaciones) {
      return llamar('comprobantes_estado', { id: id, estado: estado, cdrCodigo: cdrCodigo || '', cdrDescripcion: cdrDescripcion || '', observaciones: observaciones || '' });
    },
    crearNotaCredito: function (p) { return llamar('comprobantes_nota', p); },
    asignarGuia: function (ventaId, numero) { return llamar('comprobantes_guia', { ventaId: ventaId, numero: numero }); },
    libroVentas: function (mes, formato) { return llamar('comprobantes_libro', { mes: mes, formato: formato || 'CSV' }); },
    resumenDiario: function (fecha) { return llamar('comprobantes_resumen_diario', { fecha: fecha }); },
    comprobantesSeries: function () { return llamar('comprobantes_series'); },

    gastos: function (f) { return llamar('gastos_list', f || {}); },
    registrarGasto: function (item) { return llamar('gastos_registrar', { item: item }); },
    anularGasto: function (id) { return llamar('gastos_anular', { id: id }); },
    gastosCategorias: function () { return llamar('gastos_categorias'); },
    guardarGastoCategoria: function (item) { return llamar('gastos_categorias_save', { item: item }); },
    eliminarGastoCategoria: function (id) { return llamar('gastos_categorias_delete', { id: id }); },
    finanzasResumen: function (mes) { return llamar('finanzas_resumen', { mes: mes }); },
    presupuestoList: function (mes) { return llamar('presupuesto_list', { mes: mes }); },
    presupuestoSave: function (item) { return llamar('presupuesto_save', { item: item }); },
    presupuestoResumen: function (mes) { return llamar('presupuesto_resumen', { mes: mes }); },

    ocList: function (f) { return llamar('oc_list', f || {}); },
    ocGet: function (id) { return llamar('oc_get', { id: id }); },
    ocSave: function (item) { return llamar('oc_save', { item: item }); },
    ocEstado: function (id, estado) { return llamar('oc_estado', { id: id, estado: estado }); },
    ocOfertaAgregar: function (p) { return llamar('oc_oferta_agregar', p); },
    ocOfertaElegir: function (p) { return llamar('oc_oferta_elegir', p); },
    ocRecepcionar: function (p) { return llamar('oc_recepcionar', p); },
    ocSugeridas: function () { return llamar('oc_sugeridas'); },
    cxpList: function (f) { return llamar('cxp_list', f || {}); },
    cxpPago: function (p) { return llamar('cxp_pago', p); },

    cuotas: function (f) { return llamar('cuotas_list', f || {}); },
    pagarCuota: function (p) { return llamar('cuota_pagar', p); },
    creditosAging: function () { return llamar('creditos_aging'); },
    creditosDeVenta: function (ventaId) { return llamar('creditos_de_venta', { ventaId: ventaId }); },

    fidelAjuste: function (clienteId, puntos, nota) { return llamar('fidel_ajuste', { clienteId: clienteId, puntos: puntos, nota: nota }); },
    fidelHistorial: function (clienteId) { return llamar('fidel_historial', { clienteId: clienteId }); },
    fidelRanking: function () { return llamar('fidel_ranking'); },

    rrhhVendedores: function () { return llamar('rrhh_vendedores'); },
    rrhhGuardarVendedor: function (item) { return llamar('rrhh_vendedor_save', { item: item }); },
    rrhhMarcar: function (tipo) { return llamar('rrhh_asistencia_marcar', { tipo: tipo }); },
    rrhhAsistenciaEstado: function () { return llamar('rrhh_asistencia_estado'); },
    rrhhAsistencia: function (f) { return llamar('rrhh_asistencia_list', f || {}); },
    rrhhComisiones: function (mes) { return llamar('rrhh_comisiones', { mes: mes }); },

    notificaciones: function () { return llamar('notificaciones_list'); },
    notificacionesLeer: function (id) { return llamar('notificaciones_leer', id ? { id: id } : {}); },
    tareasInstalar: function (desactivar) { return llamar('tareas_instalar', { desactivar: desactivar ? 'Sí' : 'No' }); },
    tareasEjecutar: function () { return llamar('tareas_ejecutar'); },
    backupAhora: function () { return llamar('backup_ahora'); },
    sistemaPestanas: function () { return llamar('sistema_pestanas'); },

    catalogoEstado: function () { return llamar('catalogo_estado'); },
    catalogoToken: function () { return llamar('catalogo_token'); },
    catalogoPublico: function (tokenPublico) { return llamar('catalogo_publico', { tokenPublico: tokenPublico }); },

    /* --- Adenda 1.6: analítica extendida --- */
    analiticaAbc: function (f) { return llamar('analitica_abc', f || {}); },
    analiticaMuertos: function (dias) { return llamar('analitica_muertos', { dias: dias }); }
  };

  /* ---------- Adenda 1.6: cola offline de ventas (PWA) ---------- */
  var COLA_CLAVE = 'nexoerp_cola_ventas_v1';
  function colaLeer() {
    try { return JSON.parse(localStorage.getItem(COLA_CLAVE) || '[]'); } catch (e) { return []; }
  }
  function colaEscribir(arr) {
    try { localStorage.setItem(COLA_CLAVE, JSON.stringify(arr)); } catch (e) { /* storage lleno */ }
    if (window.AppStore) AppStore.estado.pendientesOffline = arr.length;
  }
  function encolarVenta(payload) {
    var arr = colaLeer();
    arr.push({ id: 'OFF-' + Date.now(), fecha: new Date().toISOString(), payload: payload });
    colaEscribir(arr);
    return arr.length;
  }
  async function procesarCola() {
    var arr = colaLeer();
    if (!arr.length) return { enviados: 0, pendientes: 0 };
    var enviados = 0, restantes = [];
    for (var i = 0; i < arr.length; i++) {
      try {
        await llamar('ventas_registrar', arr[i].payload);
        enviados++;
      } catch (e) {
        /* Los errores de negocio (VALIDATION...) no se reintentan sin fin:
         * se conserva la venta para revisión manual en el POS. */
        restantes.push(arr[i]);
      }
    }
    colaEscribir(restantes);
    if (window.AppStore && enviados) AppStore.toast(enviados + ' venta(s) sincronizada(s) tras reconectar.', 'exito', 6000);
    return { enviados: enviados, pendientes: restantes.length };
  }

  return Object.assign({ llamar: llamar, esDemo: esDemo, encolarVenta: encolarVenta, procesarCola: procesarCola, pendientesOffline: function () { return colaLeer().length; } }, metodos);
})();
