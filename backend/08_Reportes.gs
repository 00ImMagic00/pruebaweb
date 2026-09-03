/**
 * ================================================================
 * NexoERP — 08_Reportes.gs
 * Configuración del sistema, auditoría y exportaciones.
 * ================================================================
 */

function configGet_(c) {
  var ses = requiereSesion_(c);
  var cfg = configLeer_();
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CONFIG', 'Consultó configuración');
  return appOk_(cfg);
}

function configSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'config:write');
  var it = c.item || {};
  var permitidas = Object.keys(CONFIG_CLAVES);
  Object.keys(it).forEach(function (k) {
    if (permitidas.indexOf(k) !== -1) configGuardar_(k, String(it[k]));
  });
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'CONFIG', 'Actualizó configuración del sistema');
  return appOk_(configLeer_());
}

function auditoriaList_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'auditoria:read');
  var limite = entero_(c.limit, 200) || 200;
  var q = String(c.q || '').toLowerCase();
  var filas = dbLeer_(APP.SHEETS.AUDITORIA)
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); })
    .slice(0, limite);
  var out = filas.map(function (a) {
    return { id: a.id, fecha: fechaStr_(a.fecha), usuario: a.usuario, rol: a.rol, accion: a.accion, detalle: a.detalle };
  }).filter(function (a) {
    if (!q) return true;
    return (a.usuario + ' ' + a.accion + ' ' + a.detalle).toLowerCase().indexOf(q) !== -1;
  });
  return appOk_(out);
}
