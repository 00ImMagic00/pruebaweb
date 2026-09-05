/**
 * ================================================================
 * NexoERP — 02_Auth.gs
 * Autenticación: hash SHA-256 + salt, tokens de sesión temporales
 * y administración de usuarios.
 * ================================================================
 * Las contraseñas NUNCA se almacenan en texto plano en Google Sheets:
 * se guarda { salt, hash } donde:
 *   · Formato legado : hash = SHA-256(salt + password)
 *   · Formato v2     : hash = "v2$N$" + repetir N veces SHA-256
 *                      (key stretching; se aplica automáticamente al
 *                      iniciar sesión con una credencial legada).
 * El token de sesión se genera por login, vive en la pestaña "Sesiones"
 * y expira tras APP.TOKEN_TTL_HORAS (por defecto 8 horas).
 *
 * v1.5.1 — endurecimiento de seguridad:
 *   · Comparaciones tolerantes a espacios en las celdas de la hoja.
 *   · salt/hash se escriben SIEMPRE con formato texto (evita que Google
 *     Sheets convierta un salt numérico en número y corrompa la cuenta).
 *   · Limitador de intentos: 5 fallos → bloqueo de 5 minutos (login y
 *     autorización de supervisor del POS).
 *   · Política de contraseñas y guardia del último administrador activo.
 *   · restablecerAdmin(): recuperación de acceso desde el editor.
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

/** Iteraciones de estiramiento del formato v2 (coste fijo, baja latencia). */
var HASH_V2_ITERACIONES = 50;

/** SHA-256 iterado N veces (key stretching del formato v2). */
function hashSha256It_(texto, iteraciones) {
  var h = String(texto);
  for (var i = 0; i < iteraciones; i++) h = hashSha256_(h);
  return h;
}

/** Genera la credencial v2 a partir de salt + contraseña. */
function hashV2_(salt, password) {
  return 'v2$' + HASH_V2_ITERACIONES + '$' +
    hashSha256It_(String(salt) + String(password), HASH_V2_ITERACIONES);
}

/**
 * Compara la contraseña ingresada contra el hash almacenado.
 * Acepta formato legado (SHA-256 simple) y formato v2 (estirado).
 */
function verificarPassword_(passwordIngresada, saltAlmacenado, hashAlmacenado) {
  var salt = String(saltAlmacenado || '').trim();
  var hash = String(hashAlmacenado || '').trim().toLowerCase();
  if (!salt || !hash) return false;
  if (hash.indexOf('v2$') === 0) {
    var partes = hash.split('$');
    var n = entero_(partes[1], 0);
    if (n <= 0 || n > 10000 || !partes[2]) return false;
    return hashSha256It_(salt + String(passwordIngresada), n) === partes[2];
  }
  return hashSha256_(salt + String(passwordIngresada)) === hash;
}

/* ---------- Limitador de intentos (fuerza bruta) ---------- */

var INTENTOS_MAX_ = 5;      // fallos permitidos por ventana
var BLOQUEO_SEG_ = 300;     // 5 minutos de bloqueo

function rlClave_(familia, usuario) {
  return 'nexoerp_rl:' + familia + ':' + String(usuario || '').trim().toLowerCase();
}

/** Registra un intento fallido; al 5.º activa el bloqueo por 5 minutos. */
function rlRegistrarFallo_(familia, usuario) {
  try {
    var cache = CacheService.getScriptCache();
    var clave = rlClave_(familia, usuario);
    var prev = entero_(cache.get(clave), 0);
    if (prev + 1 >= INTENTOS_MAX_) {
      cache.put('nexoerp_lock:' + familia + ':' + String(usuario).trim().toLowerCase(), '1', BLOQUEO_SEG_);
      cache.remove(clave);
    } else {
      cache.put(clave, String(prev + 1), 900); // ventana de 15 minutos
    }
  } catch (e) { /* sin cache no se bloquea; nunca rompe el flujo */ }
}

/** ¿Está bloqueado este usuario por demasiados intentos fallidos? */
function rlBloqueado_(familia, usuario) {
  try {
    return CacheService.getScriptCache().get('nexoerp_lock:' + familia + ':' + String(usuario || '').trim().toLowerCase()) === '1';
  } catch (e) { return false; }
}

/** Limpia los contadores al autenticar con éxito. */
function rlLimpiar_(familia, usuario) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(rlClave_(familia, usuario));
    cache.remove('nexoerp_lock:' + familia + ':' + String(usuario || '').trim().toLowerCase());
  } catch (e) {}
}

/* ---------- Sesiones ---------- */

function authLogin_(c) {
  var usuario = String(c.usuario || '').trim().toLowerCase();
  var password = String(c.password || '');
  if (!usuario || !password) throw new ApiError_('Usuario y contraseña son obligatorios.', 'VALIDATION');

  if (rlBloqueado_('login', usuario)) {
    throw new ApiError_('Demasiados intentos fallidos. Por seguridad, espere 5 minutos e inténtelo nuevamente.', 'RATE_LIMIT');
  }

  var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
  if (!usuarios.length) {
    throw new ApiError_('No hay usuarios registrados en la pestaña "Usuarios". Ejecute setupDesdeCero() (empresa nueva) o setupSystem() (demo) en el editor de Apps Script y vuelva a intentar.', 'SIN_INSTALAR');
  }

  var fila = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].usuario).trim().toLowerCase() === usuario) { fila = usuarios[i]; break; }
  }

  if (!fila) {
    console.warn('login fallido: usuario "' + usuario + '" no existe');
    rlRegistrarFallo_('login', usuario);
    throw new ApiError_('Credenciales inválidas. Verifique su usuario y contraseña.', 'UNAUTHORIZED');
  }
  if (String(fila.estado).trim().toUpperCase() !== 'ACTIVO') {
    console.warn('login fallido: usuario "' + usuario + '" inactivo (estado="' + fila.estado + '")');
    rlRegistrarFallo_('login', usuario);
    throw new ApiError_('Este usuario está inactivo. Contacte al administrador del sistema.', 'INACTIVO');
  }
  if (!String(fila.salt || '').trim() || !String(fila.hash || '').trim()) {
    console.error('login fallido: usuario "' + usuario + '" tiene salt/hash vacíos — ejecute restablecerAdmin() en el editor');
    rlRegistrarFallo_('login', usuario);
    throw new ApiError_('Credenciales inválidas. Verifique su usuario y contraseña.', 'UNAUTHORIZED');
  }
  if (!verificarPassword_(password, fila.salt, fila.hash)) {
    console.warn('login fallido: contraseña incorrecta para "' + usuario + '"');
    rlRegistrarFallo_('login', usuario);
    throw new ApiError_('Credenciales inválidas. Verifique su usuario y contraseña.', 'UNAUTHORIZED');
  }

  // Éxito: limpia contadores de fuerza bruta.
  rlLimpiar_('login', usuario);

  /* Actualiza credenciales legadas al formato v2 (transparente). */
  if (String(fila.hash).trim().toLowerCase().indexOf('v2$') !== 0) {
    guardarCredencial_(fila.id, String(fila.salt).trim(), hashV2_(String(fila.salt).trim(), password));
  }

  purgarSesionesExpiradas_();

  var token = Utilities.getUuid() + '-' + Date.now();
  var creado = fechaNow_();
  var expira = new Date(creado.getTime() + APP.TOKEN_TTL_HORAS * 3600 * 1000);

  dbInsertar_(APP.SHEETS.SESIONES, {
    token: token, usuarioId: fila.id, rol: String(fila.rol).trim().toLowerCase(),
    creado: creado, expira: expira
  });
  dbActualizar_(APP.SHEETS.USUARIOS, fila.id, { ultimoAcceso: creado });

  registrarAuditoria_(fila.id, String(fila.usuario).trim(), String(fila.rol).trim().toLowerCase(), 'LOGIN', 'Inicio de sesión correcto');

  return appOk_({
    token: token,
    expiraEn: APP.TOKEN_TTL_HORAS * 3600,
    usuario: { id: fila.id, usuario: String(fila.usuario).trim(), nombre: fila.nombre, rol: String(fila.rol).trim().toLowerCase() }
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

/**
 * Escribe una fila de usuario garantizando que salt/hash queden como
 * TEXTO en la hoja. Evita el clásico fallo "Credenciales inválidas":
 * Google Sheets convierte en número cualquier celda de texto formada
 * solo por dígitos (p. ej. un salt "0123456789012345"), corrompiendo
 * la credencial almacenada. Se reescribe la celda con formato '@'.
 */
function insertarUsuario_(usuario) {
  dbInsertar_(APP.SHEETS.USUARIOS, usuario);
  var hoja = dbHoja_(APP.SHEETS.USUARIOS);
  var fila = hoja.getLastRow();
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  ['salt', 'hash'].forEach(function (col) {
    var idx = cab.indexOf(col);
    if (idx !== -1 && usuario[col]) {
      var rango = hoja.getRange(fila, idx + 1);
      rango.setNumberFormat('@');
      rango.setValue(String(usuario[col]));
    }
  });
  return usuario;
}

/** Reescribe salt/hash de un usuario existente con formato texto garantizado. */
function guardarCredencial_(usuarioId, salt, hash) {
  dbActualizar_(APP.SHEETS.USUARIOS, usuarioId, { salt: String(salt), hash: String(hash) });
  var hoja = dbHoja_(APP.SHEETS.USUARIOS);
  var valores = hoja.getDataRange().getValues();
  var cab = valores[0];
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][cab.indexOf('id')]) === String(usuarioId)) {
      ['salt', 'hash'].forEach(function (col) {
        var idx = cab.indexOf(col);
        if (idx !== -1) {
          var rango = hoja.getRange(i + 1, idx + 1);
          rango.setNumberFormat('@');
          rango.setValue(String(col === 'salt' ? salt : hash));
        }
      });
      break;
    }
  }
}

/** Política de contraseñas: mínimo 6, no trivial, distinta del usuario. */
var PASSWORD_DEBILES_ = ['123456', '12345678', '123456789', '1234567890', 'password', 'contrasena', 'contraseña', 'qwerty', 'abc123', '111111', 'admin123', 'admin'];

function validarPoliticaPassword_(password, nombreUsuario) {
  var p = String(password || '');
  if (p.length < 6) throw new ApiError_('La contraseña debe tener al menos 6 caracteres.', 'VALIDATION');
  if (p.length > 64) throw new ApiError_('La contraseña no puede exceder 64 caracteres.', 'VALIDATION');
  if (nombreUsuario && p.toLowerCase() === String(nombreUsuario).trim().toLowerCase()) {
    throw new ApiError_('La contraseña no puede ser igual al nombre de usuario.', 'VALIDATION');
  }
  if (PASSWORD_DEBILES_.indexOf(p.toLowerCase()) !== -1) {
    throw new ApiError_('Contraseña demasiado obvia. Elija una que no sea una secuencia o palabra común.', 'VALIDATION');
  }
  return p;
}

/** Cuenta administradores ACTIVOS (para impedir el auto-bloqueo del sistema). */
function adminsActivos_(usuarios) {
  return (usuarios || []).filter(function (u) {
    return String(u.rol).trim().toLowerCase() === 'admin' && String(u.estado).trim().toUpperCase() === 'ACTIVO';
  }).length;
}

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
    if (String(usuarios[i].usuario).trim().toLowerCase() === nombreUsuario && String(usuarios[i].id) !== String(it.id)) {
      throw new ApiError_('El nombre de usuario "' + nombreUsuario + '" ya existe.', 'VALIDATION');
    }
    if (String(it.id) && String(usuarios[i].id) === String(it.id)) existente = usuarios[i];
  }

  var password = String(it.password || '');
  if (existente) {
    /* Guardia: impedir dejar el sistema sin ningún administrador activo. */
    var eraAdmin = String(existente.rol).trim().toLowerCase() === 'admin' && String(existente.estado).trim().toUpperCase() === 'ACTIVO';
    var quedaraAdmin = rol === 'admin' && String(it.estado || 'ACTIVO').trim().toUpperCase() === 'ACTIVO';
    if (eraAdmin && !quedaraAdmin && adminsActivos_(usuarios) <= 1) {
      throw new ApiError_('No puede quitar el rol/estado de administrador al último admin activo. Cree otro administrador primero.', 'VALIDATION');
    }
    var cambios = { nombre: it.nombre, rol: rol, estado: it.estado || 'ACTIVO' };
    if (password) {
      validarPoliticaPassword_(password, nombreUsuario);
      var salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      cambios.salt = salt;
      cambios.hash = hashV2_(salt, password);
    }
    dbActualizar_(APP.SHEETS.USUARIOS, existente.id, cambios);
    if (password) guardarCredencial_(existente.id, cambios.salt, cambios.hash);
    /* Cambio de contraseña/estado cierra las demás sesiones del usuario; si
     * se cambió su PROPIA contraseña, se conserva la sesión en curso para
     * no expulsar al usuario a mitad del asistente o de su trabajo. */
    if (password || String(cambios.estado).toUpperCase() === 'INACTIVO') {
      cerrarSesionesDe_(existente.id, existente.id === ses.usuarioId ? ses.token : null);
    }
    registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'USUARIO', 'Actualizó usuario ' + nombreUsuario);
    return appOk_({ id: existente.id, actualizado: true });
  }

  if (!password) throw new ApiError_('Debe definir una contraseña para el nuevo usuario.', 'VALIDATION');
  validarPoliticaPassword_(password, nombreUsuario);
  var saltNuevo = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  var nuevo = {
    id: dbSiguienteId_(APP.SHEETS.USUARIOS, 'USR-', 4),
    usuario: nombreUsuario,
    nombre: it.nombre,
    rol: rol,
    salt: saltNuevo,
    hash: hashV2_(saltNuevo, password),
    estado: it.estado || 'ACTIVO',
    ultimoAcceso: '',
    creado: fechaNow_()
  };
  insertarUsuario_(nuevo);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'USUARIO', 'Creó usuario ' + nombreUsuario + ' (' + rol + ')');
  return appOk_({ id: nuevo.id, creado: true });
}

/** Elimina físicamente las sesiones abiertas de un usuario, conservando su token actual (opcional). */
function cerrarSesionesDe_(usuarioId, tokenConservar) {
  var sesiones = dbLeer_(APP.SHEETS.SESIONES);
  for (var i = sesiones.length - 1; i >= 0; i--) {
    var esSuSesion = String(sesiones[i].usuarioId) === String(usuarioId);
    var esLaActual = tokenConservar && String(sesiones[i].token) === String(tokenConservar);
    if (esSuSesion && !esLaActual) dbEliminarFila_(APP.SHEETS.SESIONES, sesiones[i]._fila);
  }
}

function usuariosDelete_(c) {
  var ses = requiereSesion_(c);
  requierePermiso_(ses, 'usuarios:manage');
  if (String(c.id) === String(ses.usuarioId)) {
    throw new ApiError_('No puede desactivar su propio usuario en ejecución.', 'VALIDATION');
  }
  var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
  var objetivo = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].id) === String(c.id)) { objetivo = usuarios[i]; break; }
  }
  if (objetivo && String(objetivo.rol).trim().toLowerCase() === 'admin' &&
      String(objetivo.estado).trim().toUpperCase() === 'ACTIVO' && adminsActivos_(usuarios) <= 1) {
    throw new ApiError_('No puede desactivar al último administrador activo. Cree otro administrador primero.', 'VALIDATION');
  }
  dbActualizar_(APP.SHEETS.USUARIOS, c.id, { estado: 'INACTIVO' });
  // Cierra todas las sesiones abiertas del usuario desactivado.
  cerrarSesionesDe_(c.id);
  registrarAuditoria_(ses.usuarioId, ses.usuario, ses.rol, 'USUARIO', 'Desactivó usuario ' + c.id);
  return appOk_({ id: c.id, estado: 'INACTIVO' });
}

/* ---------- Recuperación de acceso (v1.5.1) ---------- */

/**
 * Ejecutar desde el EDITOR de Apps Script (o con un parámetro opcional).
 * Restaura el acceso al sistema cuando la contraseña del admin se olvidó
 * o cuando la cuenta quedó corrupta en la hoja (salt/hash vacíos):
 *   restablecerAdmin()                 → deja admin / admin123
 *   restablecerAdmin('MiNuevaClave1')  → deja admin / MiNuevaClave1
 * No borra datos del negocio. Requiere que la pestaña Usuarios exista.
 */
function restablecerAdmin(passwordNuevo) {
  passwordNuevo = String(passwordNuevo || 'admin123');
  if (passwordNuevo !== 'admin123') validarPoliticaPassword_(passwordNuevo, 'admin');
  if (!passwordNuevo || passwordNuevo.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var usuarios = dbLeer_(APP.SHEETS.USUARIOS);
    var salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
    var fila = null;
    for (var i = 0; i < usuarios.length; i++) {
      if (String(usuarios[i].usuario).trim().toLowerCase() === 'admin') { fila = usuarios[i]; break; }
    }
    if (fila) {
      guardarCredencial_(fila.id, salt, hashV2_(salt, passwordNuevo));
      dbActualizar_(APP.SHEETS.USUARIOS, fila.id, { estado: 'ACTIVO', rol: 'admin' });
      cerrarSesionesDe_(fila.id);
      var resumen = 'Credenciales del admin restablecidas a "' + passwordNuevo + '" (usuario "admin", rol admin, estado ACTIVO). Sus sesiones abiertas fueron cerradas.';
      console.log('restablecerAdmin OK: ' + resumen);
      return resumen;
    }
    insertarUsuario_({
      id: dbSiguienteId_(APP.SHEETS.USUARIOS, 'USR-', 4),
      usuario: 'admin', nombre: 'Administrador', rol: 'admin',
      salt: salt, hash: hashV2_(salt, passwordNuevo),
      estado: 'ACTIVO', ultimoAcceso: '', creado: fechaNow_()
    });
    var resumenNuevo = 'No existía usuario "admin": fue creado con la contraseña "' + passwordNuevo + '".';
    console.log('restablecerAdmin OK: ' + resumenNuevo);
    return resumenNuevo;
  } finally {
    lock.releaseLock();
  }
}
