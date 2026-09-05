/**
 * NexoERP — store.js
 * Estado global reactivo de la aplicación: sesión, ruta activa,
 * configuración cargada, toasts y confirmaciones.
 */
var AppStore = (function () {

  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
  function escribir(clave, valor) { try { valor === null ? localStorage.removeItem(clave) : localStorage.setItem(clave, valor); } catch (e) {} }

  var rutaInicial = (location.hash || '').replace(/^#\/?/, '') || 'dashboard';

  var estado = Vue.reactive({
    token: leer(CONFIG_APP.TOKEN_CLAVE) || '',
    usuario: null,
    expira: parseInt(leer(CONFIG_APP.EXPIRA_CLAVE) || '0', 10),
    ruta: rutaInicial,
    cfg: null,                 // config del sistema (moneda, empresa...)
    lista: false,              // verificación inicial de sesión terminada
    menuAbierto: false,        // sidebar móvil
    toasts: [],
    confirmacion: null,        // {titulo, mensaje, okLabel, peligro, resolve}
    cargandoGlobal: false,
    /* Adenda 1.6: notificaciones flotantes y estado de conexión */
    enLinea: (typeof navigator !== 'undefined' && navigator.onLine !== false),
    pendientesOffline: 0,
    notificaciones: [],        // centro de avisos (campana)
    noLeidas: 0
  });

  try {
    var u = leer(CONFIG_APP.USUARIO_CLAVE);
    estado.usuario = u ? JSON.parse(u) : null;
  } catch (e) { estado.usuario = null; }

  /* ---------------- Toasts ---------------- */
  function toast(mensaje, tipo, duracion) {
    var id = Date.now() + Math.random();
    estado.toasts.push({ id: id, mensaje: mensaje, tipo: tipo || 'info' });
    setTimeout(function () {
      var i = estado.toasts.findIndex(function (t) { return t.id === id; });
      if (i !== -1) estado.toasts.splice(i, 1);
    }, duracion || 3800);
  }

  /* -------- Adenda 1.6: campana de notificaciones y conexión -------- */
  async function cargarNotificaciones() {
    try {
      var res = await Api.notificaciones();
      estado.notificaciones = res.notificaciones || [];
      estado.noLeidas = res.noLeidas || 0;
    } catch (e) { /* silencioso: la campana es un plus, no un requisito */ }
  }
  window.addEventListener('online', function () {
    estado.enLinea = true;
    toast('Conexión restablecida.', 'exito');
  });
  window.addEventListener('offline', function () {
    estado.enLinea = false;
    toast('Sin conexión. Las ventas se guardarán en la cola local del navegador.', 'warning', 6000);
  });

  /* ---------------- Confirmación (Promise) ---------------- */
  function confirmar(opciones) {
    return new Promise(function (resolve) {
      estado.confirmacion = {
        titulo: opciones.titulo || '¿Confirmar acción?',
        mensaje: opciones.mensaje || '',
        okLabel: opciones.okLabel || 'Confirmar',
        peligro: !!options_peligro(opciones),
        resolve: resolve
      };
    });
  }
  function options_peligro(o) { return o.peligro; }

  /* ---------------- Sesión ---------------- */
  function guardarSesion(data) {
    estado.token = data.token;
    estado.usuario = data.usuario;
    estado.expira = Date.now() + (data.expiraEn || CONFIG_APP.TTL_TOKEN_HORAS * 3600) * 1000;
    escribir(CONFIG_APP.TOKEN_CLAVE, data.token);
    escribir(CONFIG_APP.USUARIO_CLAVE, JSON.stringify(data.usuario));
    escribir(CONFIG_APP.EXPIRA_CLAVE, String(estado.expira));
  }

  function limpiarSesion() {
    estado.token = '';
    estado.usuario = null;
    estado.expira = 0;
    escribir(CONFIG_APP.TOKEN_CLAVE, null);
    escribir(CONFIG_APP.USUARIO_CLAVE, null);
    escribir(CONFIG_APP.EXPIRA_CLAVE, null);
    irA('dashboard', true);
  }

  function forzarLogout() {
    limpiarSesion();
    toast('Su sesión finalizó. Inicie sesión nuevamente.', 'warning');
  }

  async function logout() {
    try { await Api.logout(); } catch (e) { /* token quizá ya inválido */ }
    limpiarSesion();
    toast('Sesión cerrada correctamente.', 'info');
  }

  /* ---------------- Router ---------------- */
  function irA(ruta, reemplazar) {
    var hash = '#/' + ruta;
    if (location.hash !== hash) {
      if (reemplazar) { history.replaceState(null, '', hash); procesarRuta(); }
      else location.hash = hash;
    } else procesarRuta();
    estado.menuAbierto = false;
  }

  function procesarRuta() {
    var ruta = (location.hash || '').replace(/^#\/?/, '') || 'dashboard';
    var vistas = window.NEXO_VISTAS || {};
    if (!vistas[ruta]) ruta = 'dashboard';
    if (!estado.token && ruta !== 'login') { estado.ruta = 'login'; return; }
    if (estado.token && ruta === 'login') { estado.ruta = 'dashboard'; return; }
    estado.ruta = ruta;
  }

  window.addEventListener('hashchange', procesarRuta);

  return {
    estado: estado,
    toast: toast,
    cargarNotificaciones: cargarNotificaciones,
    confirmar: confirmar,
    guardarSesion: guardarSesion,
    limpiarSesion: limpiarSesion,
    forzarLogout: forzarLogout,
    logout: logout,
    irA: irA,
    procesarRuta: procesarRuta
  };
})();
