/**
 * ================================================================
 * NexoERP — 01_WebApp.gs
 * Punto de entrada de la Web App: doGet / doPost y router de acciones.
 * ================================================================
 * Contrato de la API (envoltorio estándar):
 *   Petición  : JSON { action: "nombreAccion", token: "...", ...payload }
 *   Respuesta : { ok: true|false, data: {...}|null, error: null|string, code: null|string }
 *
 * Notas de transporte (CORS):
 *   El frontend envía fetch POST con Content-Type "text/plain;charset=utf-8"
 *   para evitar la petición preflight OPTIONS, que los Web Apps de Apps
 *   Script no atienden. El despliegue debe configurarse como:
 *     Ejecutar como: Yo    |    Quién tiene acceso: Cualquier usuario
 */

function doPost(e) { return manejarPeticion_(e); }
function doGet(e)  { return manejarPeticion_(e); }

function manejarPeticion_(e) {
  var salida;
  try {
    var cuerpo = extraerCuerpo_(e);
    var accion = String(cuerpo.action || '').trim();
    if (!accion) throw new ApiError_('Petición sin "action"', 'NO_ACTION');

    /* Seguridad v1.5.1: por GET solo pasan los health-checks públicos.
     * Toda acción de negocio exige POST con cuerpo JSON; así el token y
     * las contraseñas nunca viajan en la URL (logs/historial del navegador). */
    var esPost = !!(e && e.postData && e.postData.contents);
    if (!esPost && accion !== 'ping' && accion !== 'apiInfo') {
      throw new ApiError_('Método no permitido: esta acción debe enviarse por POST con cuerpo JSON.', 'METHOD_NOT_ALLOWED');
    }

    var handler = ROUTER_()[accion];
    if (!handler) throw new ApiError_('Acción no reconocida: ' + accion, 'UNKNOWN_ACTION');

    salida = handler(cuerpo);
  } catch (err) {
    if (err instanceof ApiError_) {
      salida = appErr_(err.message, err.code);
    } else {
      /* Detalle técnico solo en el log del servidor; al cliente se le
       * devuelve un mensaje genérico para no filtrar el interior del sistema. */
      console.error(err && err.stack ? err.stack : err);
      salida = appErr_('Error interno del servidor. Revise el registro de ejecución en Apps Script (Ver → Registro de ejecuciones).', 'INTERNAL');
    }
  }
  return responder_(salida);
}

/** Acepta JSON en el cuerpo POST (text/plain) o parámetros GET ?action=... */
function extraerCuerpo_(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); }
    catch (err) { throw new ApiError_('JSON inválido en el cuerpo de la petición', 'BAD_JSON'); }
  }
  if (e && e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  if (e && e.parameter && e.parameter.action) return e.parameter;
  return {};
}

function responder_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Health-check sin autenticación para validar la URL del Web App. */
function ROUTER_() {
  return {
    /* Salud / sistema */
    ping:               authPing_,
    apiInfo:            apiInfo_,

    /* Autenticación y usuarios */
    login:              authLogin_,
    logout:             authLogout_,
    usuarios_list:      usuariosList_,
    usuarios_save:      usuariosSave_,
    usuarios_delete:    usuariosDelete_,

    /* Catálogos */
    productos_list:     productosList_,
    productos_get:      productosGet_,
    productos_save:     productosSave_,
    productos_delete:   productosDelete_,
    categorias_list:    categoriasList_,
    categorias_save:    categoriasSave_,
    categorias_delete:  categoriasDelete_,
    almacenes_list:     almacenesList_,
    almacenes_save:     almacenesSave_,
    almacenes_delete:   almacenesDelete_,
    proveedores_list:   proveedoresList_,
    proveedores_save:   proveedoresSave_,
    clientes_list:      clientesList_,
    clientes_save:      clientesSave_,

    /* Stock, lotes e inventario físico */
    stock_list:         stockList_,
    lotes_list:         lotesList_,

    /* Movimientos */
    movimientos_list:   movimientosList_,
    movimientos_registrar: movimientosRegistrar_,
    movimientos_anular: movimientosAnular_,

    /* Kardex y reportes */
    kardex:             kardexConsulta_,
    dashboard:          dashboardGet_,
    reporte_stock:      reporteStock_,
    reporte_movimientos: reporteMovimientos_,
    auditoria_list:     auditoriaList_,

    /* Adenda: POS, ventas y boletas */
    ventas_registrar:   ventasRegistrar_,
    ventas_list:        ventasList_,
    ventas_get:         ventasGet_,
    ventas_anular:      ventasAnular_,
    ventas_resumen:     ventasResumen_,
    ventas_autorizar:   ventasAutorizar_,

    /* Adenda: cuadre de caja */
    caja_estado:        cajaEstado_,
    caja_abrir:         cajaAbrir_,
    caja_cerrar:        cajaCerrar_,
    caja_historial:     cajaHistorial_,

    /* --- Adenda 1.3: fiados, cotizaciones, WhatsApp y analítica --- */
    fiados_cartera:     fiadosCartera_,
    fiado_abono:        fiadoAbono_,
    fiado_pagos:        fiadoPagos_,

    cotizaciones_registrar: cotizacionesRegistrar_,
    cotizaciones_list:      cotizacionesList_,
    cotizaciones_get:       cotizacionesGet_,
    cotizaciones_convertir: cotizacionesConvertir_,
    cotizaciones_anular:    cotizacionesAnular_,

    ventas_marcar_whatsapp: ventasMarcarWhatsapp_,
    ventas_analitica:       ventasAnalitica_,
    rentabilidad_producto:  rentabilidadProducto_,
    panel_control:          panelControl_,
    analitica_abc:          analiticaAbc_,
    analitica_muertos:      analiticaMuertos_,

    /* --- Adenda 1.5: estado del sistema para el asistente de inicio --- */
    sistema_estado:         sistemaEstado_,

    /* --- Adenda 1.6: país, comprobantes, finanzas, compras, RRHH --- */
    paises_list:            paisesList_,
    pais_aplicar:           paisAplicar_,
    tc_consultar:           tcConsultar_,

    comprobantes_list:      comprobantesList_,
    comprobantes_json:      comprobantesJson_,
    comprobantes_crear_api: comprobantesCrearApi_,
    comprobantes_enviar:    comprobantesEnviar_,
    comprobantes_estado:    comprobantesActualizarEstado_,
    comprobantes_nota:      comprobantesNotaCrear_,
    comprobantes_guia:      comprobantesGuia_,
    comprobantes_libro:     comprobantesLibroVentas_,
    comprobantes_resumen_diario: comprobantesResumenDiario_,
    comprobantes_series:    comprobantesSeries_,

    gastos_list:            gastosList_,
    gastos_registrar:       gastosRegistrar_,
    gastos_anular:          gastosAnular_,
    gastos_categorias:      gastosCategoriasList_,
    gastos_categorias_save: gastosCategoriasSave_,
    gastos_categorias_delete: gastosCategoriasDelete_,
    finanzas_resumen:       finanzasResumen_,
    presupuesto_list:       presupuestoList_,
    presupuesto_save:       presupuestoSave_,
    presupuesto_resumen:    presupuestoResumen_,

    oc_list:                ocList_,
    oc_get:                 ocGet_,
    oc_save:                ocSave_,
    oc_estado:              ocEstado_,
    oc_oferta_agregar:      ocOfertaAgregar_,
    oc_oferta_elegir:       ocOfertaElegir_,
    oc_recepcionar:         ocRecepcionar_,
    oc_sugeridas:           ocSugeridas_,
    cxp_list:               cxpList_,
    cxp_pago:               cxpPago_,

    cuotas_list:            cuotasList_,
    cuota_pagar:            cuotaPagar_,
    creditos_aging:         creditosAging_,
    creditos_de_venta:      creditosDeVenta_,

    fidel_ajuste:           fidelAjuste_,
    fidel_historial:        fidelHistorial_,
    fidel_ranking:          fidelRanking_,

    rrhh_vendedores:        vendedoresList_,
    rrhh_vendedor_save:     vendedoresSave_,
    rrhh_asistencia_marcar: asistenciaMarcar_,
    rrhh_asistencia_estado: asistenciaEstado_,
    rrhh_asistencia_list:   asistenciaList_,
    rrhh_comisiones:        comisionesReporte_,

    notificaciones_list:    notificacionesList_,
    notificaciones_leer:    notificacionesLeer_,
    tareas_instalar:        tareasInstalar_,
    tareas_ejecutar:        tareasEjecutar_,
    backup_ahora:           backupAhora_,
    sistema_pestanas:       sistemaPestanas_,

    catalogo_estado:        catalogoEstado_,
    catalogo_token:         catalogoTokenRegenerar_,
    catalogo_publico:       catalogoPublico_,

    /* Configuración */
    config_get:         configGet_,
    config_save:        configSave_
  };
}

/** Diagnóstico público: valida URL del Web App y estado de la hoja. */
function apiInfo_(c) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var faltantes = [];
  Object.keys(APP.SHEETS).forEach(function (k) {
    if (!ss.getSheetByName(APP.SHEETS[k])) faltantes.push(APP.SHEETS[k]);
  });
  /* Nota: no se expone el nombre de la hoja (privacidad). */
  return appOk_({
    app: APP.NAME,
    version: APP.VERSION,
    pestañasFaltantes: faltantes,
    listo: faltantes.length === 0,
    fechaServidor: fechaStr_(fechaNow_())
  });
}

/* ---------- Guardas de sesión y permisos ---------- */

/**
 * Valida el token incluido en el payload. Devuelve la sesión activa
 * { token, usuarioId, usuario, nombre, rol } o lanza ApiError_.
 */
function requiereSesion_(c) {
  var token = String((c && c.token) || '').trim();
  if (!token) throw new ApiError_('Sesión no válida: falta token de autenticación', 'UNAUTHORIZED');

  var sesiones = dbLeer_(APP.SHEETS.SESIONES);
  var ses = null;
  for (var i = 0; i < sesiones.length; i++) {
    if (String(sesiones[i].token).trim() === token) { ses = sesiones[i]; break; }
  }
  if (!ses) throw new ApiError_('Sesión no válida o cerrada. Inicie sesión nuevamente.', 'UNAUTHORIZED');

  var expira = new Date(ses.expira);
  if (isNaN(expira.getTime()) || expira.getTime() < Date.now()) {
    dbEliminarFila_(APP.SHEETS.SESIONES, ses._fila);
    throw new ApiError_('Su sesión ha expirado. Inicie sesión nuevamente.', 'SESSION_EXPIRED');
  }

  var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
  for (var j = 0; j < usuarios.length; j++) {
    if (String(usuarios[j].id) === String(ses.usuarioId)) {
      var u = usuarios[j];
      if (String(u.estado).trim().toUpperCase() !== 'ACTIVO') {
        throw new ApiError_('El usuario fue desactivado por el administrador.', 'UNAUTHORIZED');
      }
      return {
        token: token,
        usuarioId: u.id,
        usuario: String(u.usuario).trim(),
        nombre: u.nombre,
        rol: String(u.rol).trim().toLowerCase()
      };
    }
  }
  throw new ApiError_('El usuario de la sesión ya no existe.', 'UNAUTHORIZED');
}

/** Exige un permiso concreto sobre la sesión ya validada. */
function requierePermiso_(ses, permiso) {
  if (!appTienePermiso_(ses.rol, permiso)) {
    throw new ApiError_('Acceso denegado: su rol "' + ses.rol + '" no tiene privilegios para esta operación.', 'FORBIDDEN');
  }
}
