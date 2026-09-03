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
        if (window.AppStore) AppStore.forzarLogout();
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
    panelControl: function () { return llamar('panel_control'); }
  };

  return Object.assign({ llamar: llamar, esDemo: esDemo }, metodos);
})();
