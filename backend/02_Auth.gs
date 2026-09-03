/**
 * ================================================================
 * NexoERP — 02_Auth.gs
 * Autenticación: hash SHA-256 + salt, tokens de sesión temporales
 * y administración de usuarios.
 * ================================================================
 * Las contraseñas NUNCA se almacenan en texto plano en Google Sheets:
 * se guarda { salt, hash } donde hash = SHA-256(salt + password).
 * El token de sesión se genera por login, vive en la pestaña "Sesiones"
 * y expira tras APP.TOKEN_TTL_HORAS (por defecto 8 horas).
 */

/* ---------- Cifrado ---------- */

/** Devuelve el hash hexadecimal SHA-256 de un texto. */
function hashSha256_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/** Compara la contraseña ingresada contra el hash almacenado (salt + SHA-256). */
function verificarPassword_(passwordIngresada, saltAlmacenado, hashAlmacenado) {
  if (!saltAlmacenado || !hashAlmacenado) return false;
  return hashSha256_(String(saltAlmacenado) + String(passwordIngresada)) === String(hashAlmacenado).toLowerCase();
}

/* ---------- Sesiones ---------- */

function authLogin_(c) {
  var usuario = String(c.usuario || '').trim().toLowerCase();
  var password = String(c.password || '');
  if (!usuario || !password) throw new ApiError_('Usuario y contraseña son obligatorios.', 'VALIDATION');

  var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
  var fila = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].usuario).toLowerCase() === usuario) { fila = usuarios[i]; break; }
  }
  // Mensaje genérico para no revelar si el usuario existe.
  if (!fila || String(fila.estado).toUpperCase() !== 'ACTIVO' ||
      !verificarPassword_(password, fila.salt, fila.hash)) {
    throw new ApiError_('Credenciales inválidas. Verifique su usuario y contraseña.', 'UNAUTHORIZED');
  }

  purgarSesionesExpiradas_();

  var token = Utilities.getUuid() + '-' + Date.now();
  var creado = fechaNow_();
  var expira = new Date(creado.getTime() + APP.TOKEN_TTL_HORAS * 3600 * 1000);

  dbInsertar_(APP.SHEETS.SESIONES, {
    token: token, usuarioId: fila.id, rol: String(fila.rol).toLowerCase(),
    creado: creado, expira: expira
  });
  dbActualizar_(APP.SHEETS.USUARIOS, fila.id, { ultimoAcceso: creado });

  registrarAuditoria_(fila.id, fila.usuario, String(fila.rol).toLowerCase(), 'LOGIN', 'Inicio de sesión correcto');

  return appOk_({
    token: token,
    expiraEn: APP.TOKEN_TTL_HORAS * 3600,
    usuario: { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: String(fila.rol).toLowerCase() }
  });
}

function authLogout_(c) {
  var ses = requiereSesion_(c);
  var sesiones = dbLeer_(APP.SHEETS.SESIONES);
  for (var i = 0; i < sesiones.length; i++) {
    if (String(sesiones[i].token) === String(ses.token)) {
      dbEliminarFila_(APP.SHEETS.SESIONES, sesiones[i]._fila);
      break;
    }
  }
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'LOGOUT', 'Cierre de sesión');
  return appOk_({ cerrada: true });
}

function authPing_(c) {
  var ses = requiereSesion_(c);
  return appOk_({ usuario: { id: ses.usuarioId, usuario: ses.usuario, nombre: ses.nombre, rol: ses.rol }, servidor: fechaStr_(fechaNow_()) });
}

/* ---------- Adenda 1.2: autorización de supervisor para POS ---------- */

/**
 * Chequeo previo de credenciales de un supervisor (admin/gerente) para
 * aprobar descuentos fuera de política o regalos. NO abre sesión: solo
 * confirma que las credenciales son válidas y devuelva la etiqueta del
 * autorizador para mostrarla en el POS y en la boleta. La venta real
 * vuelve a validarlas en el servidor (ver validarAutorizacion_).
 */
function ventasAutorizar_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'ventas:registrar');
  var autorizadoPor = validarAutorizacion_(c.autorizacion || {});
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'AUTORIZACION',
    'POS: validó credenciales de supervisor — ' + autorizadoPor);
  return appOk_({ autorizadoPor: autorizadoPor });
}

/** Elimina sesiones vencidas para mantener la pestaña liviana. */
function purgarSesionesExpiradas_() {
  var sesiones = dbLeer_(APP.SHEETS.SESIONES);
  var ahora = Date.now();
  for (var i = sesiones.length - 1; i >= 0; i--) {
    var exp = new Date(sesiones[i].expira);
    if (isNaN(exp.getTime()) || exp.getTime() < ahora) {
      dbEliminarFila_(APP.SHEETS.SESIONES, sesiones[i]._fila);
    }
  }
}

/* ---------- Administración de usuarios (rol admin) ---------- */

function usuariosList_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'usuarios:manage');
  var filas = dbLeer_(APP.SHEETS.USUARIOS).map(function (u) {
    return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: String(u.rol).toLowerCase(), estado: u.estado, ultimoAcceso: fechaStr_(u.ultimoAcceso) };
  });
  return appOk_(filas);
}

function usuariosSave_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'usuarios:manage');
  var it = c.item || {};
  var nombreUsuario = String(it.usuario || '').trim().toLowerCase();
  var rol = String(it.rol || '').trim().toLowerCase();
  if (!nombreUsuario || !it.nombre) throw new ApiError_('Usuario y nombre son obligatorios.', 'VALIDATION');
  if (['admin', 'gerente', 'operador', 'consulta'].indexOf(rol) === -1) {
    throw new ApiError_('Rol no válido. Use: admin, gerente, operador o consulta.', 'VALIDATION');
  }

  var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
  var existente = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].usuario).toLowerCase() === nombreUsuario && String(usuarios[i].id) !== String(it.id)) {
      throw new ApiError_('El nombre de usuario "' + nombreUsuario + '" ya existe.', 'VALIDATION');
    }
    if (String(it.id) && String(usuarios[i].id) === String(it.id)) existente = usuarios[i];
  }

  var password = String(it.password || '');
  if (existente) {
    var cambios = { nombre: it.nombre, rol: rol, estado: it.estado || 'ACTIVO' };
    if (password) {
      var salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      cambios.salt = salt;
      cambios.hash = hashSha256_(salt + password);
    }
    dbActualizar_(APP.SHEETS.USUARIOS, existente.id, cambios);
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'USUARIO', 'Actualizó usuario ' + nombreUsuario);
    return appOk_({ id: existente.id, actualizado: true });
  }

  if (!password) throw new ApiError_('Debe definir una contraseña para el nuevo usuario.', 'VALIDATION');
  var saltNuevo = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  var nuevo = {
    id: dbSiguienteId_(APP.SHEETS.USUARIOS, 'USR-', 4),
    usuario: nombreUsuario,
    nombre: it.nombre,
    rol: rol,
    salt: saltNuevo,
    hash: hashSha256_(saltNuevo + password),
    estado: it.estado || 'ACTIVO',
    ultimoAcceso: '',
    creado: fechaNow_()
  };
  dbInsertar_(APP.SHEETS.USUARIOS, nuevo);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'USUARIO', 'Creó usuario ' + nombreUsuario + ' (' + rol + ')');
  return appOk_({ id: nuevo.id, creado: true });
}

function usuariosDelete_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'usuarios:manage');
  if (String(c.id) === String(ses.usuarioId)) {
    throw new ApiError_('No puede desactivar su propio usuario en ejecución.', 'VALIDATION');
  }
  dbActualizar_(APP.SHEETS.USUARIOS, c.id, { estado: 'INACTIVO' });
  // Cierra todas las sesiones abiertas del usuario desactivado.
  var sesiones = dbLeer_(APP.SHEETS.SESIONES);
  for (var i = sesiones.length - 1; i >= 0; i--) {
    if (String(sesiones[i].usuarioId) === String(c.id)) dbEliminarFila_(APP.SHEETS.SESIONES, sesiones[i]._fila);
  }
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'USUARIO', 'Desactivó usuario ' + c.id);
  return appOk_({ id: c.id, estado: 'INACTIVO' });
}
