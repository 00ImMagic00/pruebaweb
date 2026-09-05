/**
 * ================================================================
 * NexoERP — 21_RRHH.gs  (Adenda 1.6)
 * RRHH básico de la MYPE: marcación de asistencia, comisiones de
 * vendedores y lista de personal activa.
 * ================================================================
 * La comisión se define por usuario en la pestaña Vendedores
 * (porcentaje sobre ventas EMITIDAS del mes donde fue el vendedor).
 */

/* ------------------------- Vendedores ------------------------- */

function vendedoresList_(c) {
  requiereSesion_(c);
  var vendedores = {};
  dbLeer_(APP.SHEETS.VENDEDORES).forEach(function (v) { vendedores[String(v.usuarioId)] = v; });
  var out = dbLeer_(APP.SHEETS.USUARIOS)
    .filter(function (u) { return String(u.estado).toUpperCase() === 'ACTIVO' && String(u.rol).toLowerCase() !== 'consulta'; })
    .map(function (u) {
      var v = vendedores[String(u.id)];
      return { usuarioId: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol,
        comisionPct: v ? numero_(v.comisionPct) : 0, esVendedor: !!v };
    });
  return appOk_(out);
}

function vendedoresSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'rrhh:manage');
  var it = c.item || {};
  var usuario = dbPorId_(APP.SHEETS.USUARIOS, it.usuarioId);
  if (!usuario) throw new ApiError_('Usuario no encontrado.', 'NOT_FOUND');
  var pct = Math.max(0, Math.min(100, numero_(it.comisionPct)));
  var filas = dbLeer_(APP.SHEETS.VENDEDORES);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].usuarioId) === String(it.usuarioId)) {
      if (pct <= 0) { dbEliminarFila_(APP.SHEETS.VENDEDORES, filas[i]._fila); return appOk_({ usuarioId: it.usuarioId, comisionPct: 0, esVendedor: false }); }
      dbActualizar_(APP.SHEETS.VENDEDORES, filas[i].id, { comisionPct: pct });
      return appOk_({ usuarioId: it.usuarioId, comisionPct: pct, esVendedor: true });
    }
  }
  if (pct > 0) {
    dbInsertar_(APP.SHEETS.VENDEDORES, { id: dbSiguienteId_(APP.SHEETS.VENDEDORES, 'VEN-', 4), usuarioId: it.usuarioId, usuario: usuario.usuario, comisionPct: pct, estado: 'ACTIVO' });
  }
  return appOk_({ usuarioId: it.usuarioId, comisionPct: pct, esVendedor: pct > 0 });
}

/* ------------------------- Asistencia ------------------------- */

function serializarAsistencia_(a) {
  return {
    id: a.id, fecha: fechaDiaStr_(a.fecha), usuarioId: a.usuarioId, usuario: a.usuario,
    entrada: a.entrada ? fechaStr_(a.entrada) : '', salida: a.salida ? fechaStr_(a.salida) : '',
    minutos: entero_(a.minutos), nota: a.nota || '', estado: a.estado || ''
  };
}

/** Marcación de entrada/salida del usuario de la sesión. */
function asistenciaMarcar_(c) {
  var ses = requiereSesion_(c);
  var tipo = String(c.tipo || 'ENTRADA').toUpperCase();
  var hoy = fechaDiaStr_(fechaNow_());
  var filaHoy = null;
  dbLeer_(APP.SHEETS.ASISTENCIA).forEach(function (a) {
    if (String(a.usuarioId) === String(ses.usuarioId) && fechaDiaStr_(a.fecha) === hoy) filaHoy = a;
  });
  if (tipo === 'ENTRADA') {
    if (filaHoy && filaHoy.entrada) throw new ApiError_('Ya registró su entrada hoy a las ' + fechaStr_(filaHoy.entrada) + '.', 'VALIDATION');
    if (filaHoy) {
      dbActualizar_(APP.SHEETS.ASISTENCIA, filaHoy.id, { entrada: fechaNow_(), estado: 'TRABAJANDO' });
      return appOk_(serializarAsistencia_(dbPorId_(APP.SHEETS.ASISTENCIA, filaHoy.id)));
    }
    var id = dbSiguienteId_(APP.SHEETS.ASISTENCIA, 'ASI-', 6);
    dbInsertar_(APP.SHEETS.ASISTENCIA, {
      id: id, fecha: fechaNow_(), usuarioId: ses.usuarioId, usuario: ses.usuario,
      entrada: fechaNow_(), salida: '', minutos: 0, nota: String(c.nota || ''), estado: 'TRABAJANDO'
    });
    return appOk_({ id: id, fecha: hoy, entrada: fechaStr_(fechaNow_()), estado: 'TRABAJANDO' });
  }
  /* SALIDA */
  if (!filaHoy || !filaHoy.entrada) throw new ApiError_('No tiene entrada registrada hoy.', 'VALIDATION');
  if (filaHoy.salida) throw new ApiError_('Ya registró su salida hoy a las ' + fechaStr_(filaHoy.salida) + '.', 'VALIDATION');
  var minutos = Math.max(0, Math.round((Date.now() - new Date(fechaStr_(filaHoy.entrada).replace(' ', 'T')).getTime()) / 60000));
  dbActualizar_(APP.SHEETS.ASISTENCIA, filaHoy.id, { salida: fechaNow_(), minutos: minutos, estado: 'COMPLETO', nota: String(c.nota || filaHoy.nota || '') });
  return appOk_({ id: filaHoy.id, fecha: hoy, salida: fechaStr_(fechaNow_()), minutos: minutos, estado: 'COMPLETO' });
}

function asistenciaEstado_(c) {
  var ses = requiereSesion_(c);
  var hoy = fechaDiaStr_(fechaNow_());
  var filaHoy = null;
  dbLeer_(APP.SHEETS.ASISTENCIA).forEach(function (a) {
    if (String(a.usuarioId) === String(ses.usuarioId) && fechaDiaStr_(a.fecha) === hoy) filaHoy = a;
  });
  return appOk_({
    marcado: !!filaHoy,
    entrada: filaHoy && filaHoy.entrada ? fechaStr_(filaHoy.entrada) : '',
    salida: filaHoy && filaHoy.salida ? fechaStr_(filaHoy.salida) : '',
    estado: filaHoy ? (filaHoy.estado || '') : ''
  });
}

function asistenciaList_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'rrhh:manage');
  var desde = String(c.desde || ''), hasta = String(c.hasta || ''), usuarioId = String(c.usuarioId || '');
  return appOk_(dbLeer_(APP.SHEETS.ASISTENCIA).reverse().filter(function (a) {
    var dia = fechaDiaStr_(a.fecha);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    if (usuarioId && String(a.usuarioId) !== usuarioId) return false;
    return true;
  }).slice(0, entero_(c.limit, 300) || 300).map(serializarAsistencia_));
}

/* ------------------------- Comisiones ------------------------- */

/** Reporte de comisiones del mes por vendedor. */
function comisionesReporte_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'rrhh:manage');
  var mes = String(c.mes || '').trim() || fechaDiaStr_(fechaNow_()).substring(0, 7);
  var pctPorUsuario = {};
  dbLeer_(APP.SHEETS.VENDEDORES).forEach(function (v) {
    pctPorUsuario[String(v.usuarioId)] = numero_(v.comisionPct);
  });
  var ventasPorUsuario = {};
  dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
    if (String(v.estado).toUpperCase() !== 'EMITIDA') return;
    if (String(v.fecha).substring(0, 7) !== mes) return;
    var u = String(v.vendedor || v.usuario || '');
    if (!ventasPorUsuario[u]) ventasPorUsuario[u] = { total: 0, n: 0 };
    ventasPorUsuario[u].total = redondear_(ventasPorUsuario[u].total + numero_(v.total));
    ventasPorUsuario[u].n++;
  });
  var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
  var filas = Object.keys(ventasPorUsuario).map(function (u) {
    var info = null;
    usuarios.forEach(function (x) { if (String(x.usuario) === u) info = x; });
    var pct = info ? (pctPorUsuario[String(info.id)] || 0) : 0;
    var total = ventasPorUsuario[u].total;
    return {
      usuario: u, nombre: info ? info.nombre : u, ventas: total, nVentas: ventasPorUsuario[u].n,
      comisionPct: pct, comision: redondear_(total * pct / 100)
    };
  }).sort(function (a, b) { return b.ventas - a.ventas; });
  var cfg = configLeer_();
  var totalComisiones = 0;
  filas.forEach(function (f) { totalComisiones = redondear_(totalComisiones + f.comision); });
  return appOk_({ mes: mes, moneda: cfg.MONEDA_SIMBOLO || 'S/', filas: filas, totalComisiones: totalComisiones });
}
