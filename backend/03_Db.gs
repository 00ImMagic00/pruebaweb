/**
 * ================================================================
 * NexoERP — 03_Db.gs
 * Capa de acceso a datos sobre Google Sheets.
 * ================================================================
 * Cada pestaña usa su primera fila como cabecera de columnas; las
 * filas se exponen como objetos { cabecera: valor }. Las fechas se
 * normalizan a texto "yyyy-MM-dd HH:mm:ss" para un transporte JSON
 * determinista hacia el frontend.
 */

function dbHoja_(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) throw new ApiError_('No existe la pestaña "' + nombre + '". Ejecute setupSystem() una vez desde el editor.', 'NO_SHEET');
  return hoja;
}

/** Lee todas las filas de una pestaña como objetos. */
function dbLeer_(nombre) {
  var hoja = dbHoja_(nombre);
  var valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return [];
  var cab = valores[0];
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var f = valores[i];
    if (String(f[0]).trim() === '') continue; // ignora filas vacías
    var obj = { _fila: i + 1 };
    for (var j = 0; j < cab.length; j++) {
      var clave = String(cab[j]).trim();
      if (!clave) continue;
      obj[clave] = normalizarCelda_(f[j]);
    }
    filas.push(obj);
  }
  return filas;
}

/** Fechas -> texto ISO local; el resto pasa tal cual (JSON-safe). */
function normalizarCelda_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return fechaStr_(v);
  return v;
}

/** Inserta un objeto como nueva fila respetando el orden de cabeceras. */
function dbInsertar_(nombre, obj) {
  var hoja = dbHoja_(nombre);
  var nCols = hoja.getLastColumn();
  var cab = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  var fila = cab.map(function (k) {
    var v = obj[String(k).trim()];
    return (v === undefined || v === null) ? '' : v;
  });
  hoja.appendRow(fila);
  return obj;
}

/** Actualiza por columna "id" (o "_fila" directa) solo los campos enviados. */
function dbActualizar_(nombre, idObjetivo, cambios) {
  var hoja = dbHoja_(nombre);
  var valores = hoja.getDataRange().getValues();
  if (valores.length < 2) throw new ApiError_('Pestaña "' + nombre + '" sin datos.', 'NO_DATA');
  var cab = valores[0];
  var colId = cab.indexOf('id') + 1;
  if (colId === 0) throw new ApiError_('La pestaña "' + nombre + '" no tiene columna "id".', 'NO_ID_COLUMN');

  var filaDestino = -1;
  if (idObjetivo && String(idObjetivo).indexOf('_fila:') === 0) {
    filaDestino = entero_(String(idObjetivo).split(':')[1], -1);
  } else {
    for (var i = 1; i < valores.length; i++) {
      if (String(valores[i][colId - 1]) === String(idObjetivo)) { filaDestino = i + 1; break; }
    }
  }
  if (filaDestino === -1) throw new ApiError_('Registro no encontrado en "' + nombre + '": ' + idObjetivo, 'NOT_FOUND');

  Object.keys(cambios).forEach(function (k) {
    var col = cab.indexOf(k) + 1;
    if (col > 0) hoja.getRange(filaDestino, col).setValue(cambios[k]);
  });
  return { fila: filaDestino };
}

/** Elimina físicamente una fila (usado en Sesiones). */
function dbEliminarFila_(nombre, numeroFila) {
  dbHoja_(nombre).deleteRow(numeroFila);
}

/** Borrado lógico estándar: estado = INACTIVO. */
function dbDesactivar_(nombre, idObjetivo) {
  return dbActualizar_(nombre, idObjetivo, { estado: 'INACTIVO' });
}

/** Genera IDs secuenciales con prefijo y relleno: PRD-0001, MOV-000001... */
function dbSiguienteId_(nombre, prefijo, padding) {
  var filas = dbLeer_(nombre);
  var max = 0;
  for (var i = 0; i < filas.length; i++) {
    var id = String(filas[i].id || '');
    if (id.indexOf(prefijo) === 0) {
      var n = parseInt(id.substring(prefijo.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var sig = max + 1;
  var relleno = String(sig);
  while (relleno.length < (padding || 4)) relleno = '0' + relleno;
  return prefijo + relleno;
}

/** Lee la pestaña Config como objeto clave -> valor. */
function configLeer_() {
  var filas = dbLeer_(APP.SHEETS.CONFIG);
  var out = {};
  for (var i = 0; i < filas.length; i++) out[String(filas[i].clave)] = String(filas[i].valor);
  // Rellena claves faltantes con valores por defecto.
  Object.keys(CONFIG_CLAVES).forEach(function (k) {
    if (out[k] === undefined || out[k] === '') out[k] = CONFIG_CLAVES[k];
  });
  return out;
}

/** Guarda (upsert) un par clave/valor en Config. */
function configGuardar_(clave, valor) {
  var filas = dbLeer_(APP.SHEETS.CONFIG);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].clave) === String(clave)) {
      dbHoja_(APP.SHEETS.CONFIG).getRange(filas[i]._fila, 2).setValue(valor);
      return;
    }
  }
  dbInsertar_(APP.SHEETS.CONFIG, { clave: clave, valor: valor });
}

/** Registra una entrada de auditoría (acciones y cambios relevantes). */
function registrarAuditoria_(usuarioId, usuario, rol, accion, detalle) {
  try {
    dbInsertar_(APP.SHEETS.AUDITORIA, {
      id: dbSiguienteId_(APP.SHEETS.AUDITORIA, 'AUD-', 6),
      fecha: fechaNow_(),
      usuarioId: usuarioId || '',
      usuario: usuario || '',
      rol: rol || '',
      accion: accion || '',
      detalle: detalle || ''
    });
  } catch (err) {
    console.error('Auditoría falló: ' + err); // nunca bloquea la operación principal
  }
}
