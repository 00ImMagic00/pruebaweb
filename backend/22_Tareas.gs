/**
 * ================================================================
 * NexoERP — 22_Tareas.gs  (Adenda 1.6)
 * Tareas programadas (triggers) y centro de notificaciones.
 * ================================================================
 * tareaDiaria()      → revisa fiados, cuotas, stock crítico y
 *                      comprobantes rechazados; deja avisos en la
 *                      pestaña Notificaciones y (opcional) envía un
 *                      correo al dueño (MailApp, gratis).
 * tareaBackup()      → copia la hoja de cálculo a una carpeta de Drive
 *                      con retención configurable.
 * tareaTipoCambio()  → refresca el tipo de cambio USD del día.
 *
 * Los triggers se instalan desde la app: Ajustes → Recordatorios y
 * respaldos → "Activar tareas programadas" (acción tareas_instalar).
 * También puede ejecutarse instalarTareasProgramadas() desde el editor.
 */

var CARPETA_BACKUP = 'NexoERP Backups';

function instalarTareasProgramadas() {
  var existentes = ScriptApp.getProjectTriggers();
  var fn = ['tareaDiaria', 'tareaBackup', 'tareaTipoCambio'];
  var res = { eliminados: 0, creados: [] };
  existentes.forEach(function (t) {
    if (fn.indexOf(t.getHandlerFunction()) !== -1) { ScriptApp.deleteTrigger(t); res.eliminados++; }
  });
  ScriptApp.newTrigger('tareaDiaria').timeBased().everyDays(1).atHour(7).create();
  res.creados.push('tareaDiaria (07:00)');
  ScriptApp.newTrigger('tareaBackup').timeBased().everyDays(1).atHour(3).create();
  res.creados.push('tareaBackup (03:00)');
  ScriptApp.newTrigger('tareaTipoCambio').timeBased().everyDays(1).atHour(8).create();
  res.creados.push('tareaTipoCambio (08:00)');
  return res;
}

function tareasInstalar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'tareas:manage');
  if (String(c.desactivar) === 'Sí') {
    var n = 0;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (['tareaDiaria', 'tareaBackup', 'tareaTipoCambio'].indexOf(t.getHandlerFunction()) !== -1) { ScriptApp.deleteTrigger(t); n++; }
    });
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'TAREAS', 'Desactivó ' + n + ' triggers');
    return appOk_({ eliminados: n, creados: [] });
  }
  var res = instalarTareasProgramadas();
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'TAREAS', 'Instaló triggers: ' + res.creados.join(', '));
  return appOk_(res);
}

/* --------------------- Centro de notificaciones --------------------- */

function notificacionInsertar_(tipo, severidad, titulo, mensaje, referencia) {
  var clave = fechaDiaStr_(fechaNow_()) + '|' + tipo + '|' + String(referencia || titulo);
  var yaExiste = dbLeer_(APP.SHEETS.NOTIFICACIONES).some(function (n) {
    return String(n.clave) === clave && !boolStr_(n.leido);
  });
  if (yaExiste) return null;
  dbInsertar_(APP.SHEETS.NOTIFICACIONES, {
    id: dbSiguienteId_(APP.SHEETS.NOTIFICACIONES, 'NTF-', 6),
    fecha: fechaNow_(), clave: clave, tipo: tipo, severidad: severidad,
    titulo: titulo, mensaje: mensaje || '', referencia: referencia || '', leido: 'No'
  });
  return true;
}

function notificacionesList_(c) {
  requiereSesion_(c);
  var filas = dbLeer_(APP.SHEETS.NOTIFICACIONES).reverse()
    .slice(0, entero_(c.limit, 60) || 60)
    .map(function (n) {
      return { id: n.id, fecha: fechaStr_(n.fecha), tipo: n.tipo, severidad: n.severidad,
        titulo: n.titulo, mensaje: n.mensaje, referencia: n.referencia, leido: boolStr_(n.leido) };
    });
  var noLeidas = filas.filter(function (n) { return !n.leido; }).length;
  return appOk_({ notificaciones: filas, noLeidas: noLeidas });
}

function notificacionesLeer_(c) {
  requiereSesion_(c);
  if (c.id) {
    dbActualizar_(APP.SHEETS.NOTIFICACIONES, c.id, { leido: 'Sí' });
    return appOk_({ id: c.id, leido: true });
  }
  dbLeer_(APP.SHEETS.NOTIFICACIONES).forEach(function (n) {
    if (!boolStr_(n.leido)) dbActualizar_(APP.SHEETS.NOTIFICACIONES, n.id, { leido: 'Sí' });
  });
  return appOk_({ todas: true });
}

/**
 * Tarea diaria: revisa el negocio y genera notificaciones + correo.
 * Puede ejecutarse manualmente (acción tareas_ejecutar) para probar.
 */
function tareaDiaria() {
  var cfg = configLeer_();
  var creadas = [];
  function aviso(tipo, sev, titulo, msg, ref) {
    var r = notificacionInsertar_(tipo, sev, titulo, msg, ref);
    if (r) creadas.push(titulo);
  }

  /* 1) Fiados con antigüedad preocupante */
  var diasAlertaFiado = numero_(cfg.FIADO_DIAS_ALERTA, 30);
  dbLeer_(APP.SHEETS.CLIENTES).forEach(function (cli) {
    var saldo = numero_(cli.saldoFiado);
    if (saldo <= 0) return;
    var masAntigua = null;
    dbLeer_(APP.SHEETS.VENTAS).forEach(function (v) {
      if (String(v.clienteId) === String(cli.id) && String(v.estadoPago).toUpperCase() === 'FIADO' && String(v.estado).toUpperCase() === 'EMITIDA') {
        if (!masAntigua || String(v.fecha) < String(masAntigua.fecha)) masAntigua = v;
      }
    });
    if (!masAntigua) return;
    var dias = Math.floor((Date.now() - new Date(fechaDiaStr_(masAntigua.fecha) + 'T12:00:00').getTime()) / 86400000);
    if (dias >= diasAlertaFiado) {
      aviso('FIADO', 'WARN', 'Fiado antiguo: ' + cli.razonSocial,
        'Saldo ' + (cfg.MONEDA_SIMBOLO || 'S/') + ' ' + saldo.toFixed(2) + ' con ' + dias + ' días de antigüedad.', 'FIADO-' + cli.id);
    }
  });

  /* 2) Cuotas que vencen hoy/esta semana y vencidas */
  var hoy = fechaDiaStr_(fechaNow_());
  dbLeer_(APP.SHEETS.CUOTAS).forEach(function (q) {
    if (String(q.estado).toUpperCase() !== 'PENDIENTE') return;
    var venc = fechaDiaStr_(q.fechaVenc);
    var dias = Math.floor((new Date(venc + 'T12:00:00').getTime() - Date.now()) / 86400000);
    if (dias < 0) {
      aviso('CUOTA', 'CRIT', 'Cuota vencida: ' + q.clienteNombre,
        'Cuota ' + q.nCuota + '/' + q.totalCuotas + ' de ' + q.ventaId + ' venció el ' + venc + '. Saldo: ' + numero_(q.saldo).toFixed(2), 'CUO-' + q.id);
    } else if (dias <= 3) {
      aviso('CUOTA', 'INFO', 'Cuota por vencer: ' + q.clienteNombre,
        'Cuota ' + q.nCuota + '/' + q.totalCuotas + ' de ' + q.ventaId + ' vence el ' + venc + '.', 'CUO-' + q.id);
    }
  });

  /* 3) Stock crítico */
  var prods = dbLeer_(APP.SHEETS.PRODUCTOS).filter(function (p) { return String(p.estado).toUpperCase() === 'ACTIVO'; });
  var stock = dbLeer_(APP.SHEETS.STOCK);
  var totalPorProd = {};
  stock.forEach(function (s) { totalPorProd[String(s.productoId)] = (totalPorProd[String(s.productoId)] || 0) + numero_(s.cantidad); });
  var criticos = [];
  prods.forEach(function (p) {
    var total = totalPorProd[String(p.id)] || 0;
    if (numero_(p.stockMin) > 0 && total <= numero_(p.stockMin)) criticos.push(p.nombre + ' (' + total + ' ' + p.unidad + ')');
  });
  if (criticos.length) {
    aviso('STOCK', 'WARN', criticos.length + ' producto(s) con stock crítico', criticos.slice(0, 10).join(', ') + (criticos.length > 10 ? '…' : ''), 'STOCK-' + hoy);
  }

  /* 4) Comprobantes rechazados por SUNAT */
  var rechazados = dbLeer_(APP.SHEETS.COMPROBANTES).filter(function (f) { return String(f.estado).toUpperCase() === 'RECHAZADO' || String(f.estado).toUpperCase() === 'ERROR'; });
  if (rechazados.length) {
    aviso('FE', 'CRIT', rechazados.length + ' comprobante(s) con problema en SUNAT', rechazados.slice(0, 8).map(function (f) { return f.numero + ' (' + f.estado + ')'; }).join(', '), 'FE-' + hoy);
  }

  /* 5) Correo opcional al dueño */
  var correo = String(cfg.RECORD_EMAIL || '').trim();
  if (correo && creadas.length) {
    try {
      MailApp.sendEmail({
        to: correo,
        subject: 'NexoERP — avisos del día (' + creadas.length + ')',
        textBody: 'Buenos días.\n\nNexoERP generó los siguientes avisos:\n\n· ' + creadas.join('\n· ') + '\n\nRevíselos en el centro de notificaciones del sistema.'
      });
    } catch (err) { console.error('Envío de correo falló: ' + err); }
  }
  console.log('tareaDiaria: ' + creadas.length + ' avisos nuevos.');
  return creadas;
}

function tareasEjecutar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'tareas:manage');
  var avisos = tareaDiaria();
  return appOk_({ avisos: avisos, total: avisos.length });
}

/* --------------------- Respaldo (backup) --------------------- */

function tareaBackup() {
  var cfg = configLeer_();
  if (String(cfg.BACKUP_ACTIVO || 'No') === 'No') return { saltado: true };
  var res = backupEjecutar_();
  console.log('tareaBackup: ' + JSON.stringify(res));
  return res;
}

function backupEjecutar_() {
  var cfg = configLeer_();
  var retencion = Math.max(1, entero_(cfg.BACKUP_RETENCION, 15) || 15);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var carpetas = DriveApp.getFoldersByName(CARPETA_BACKUP);
  var carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(CARPETA_BACKUP);
  var nombre = ss.getName() + ' — respaldo ' + fechaDiaStr_(fechaNow_()) + ' ' + Utilities.formatDate(fechaNow_(), APP.TZ, 'HHmm');
  var copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);
  /* Retención: elimina los respaldos más antiguos que BACKUP_RETENCION días */
  var limite = Date.now() - retencion * 86400000;
  var eliminados = 0;
  var archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    var f = archivos.next();
    if (f.getDateCreated().getTime() < limite) { f.setTrashed(true); eliminados++; }
  }
  try {
    notificacionInsertar_('BACKUP', 'INFO', 'Respaldo automático completado', nombre + ' (retención ' + retencion + ' días, ' + eliminados + ' antiguos eliminados)', 'BK-' + fechaDiaStr_(fechaNow_()));
  } catch (e) {}
  return { archivo: nombre, eliminados: eliminados };
}

function backupAhora_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'tareas:manage');
  var res = backupEjecutar_();
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'BACKUP', 'Respaldo manual: ' + res.archivo);
  return appOk_(res);
}

function tareaTipoCambio() {
  var res = tcActualizar_(configLeer_());
  console.log('tareaTipoCambio: ' + JSON.stringify(res));
  return res;
}

/* --------------------- Pestañas faltantes (diagnóstico) --------------------- */

function sistemaPestanas_(c) {
  requiereSesion_(c);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var faltantes = [];
  Object.keys(APP.SHEETS).forEach(function (k) {
    if (!ss.getSheetByName(APP.SHEETS[k])) faltantes.push(APP.SHEETS[k]);
  });
  return appOk_({ faltantes: faltantes, listo: faltantes.length === 0, version: APP.VERSION });
}
