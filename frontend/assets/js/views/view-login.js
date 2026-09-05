/**
 * NexoERP — vista-login.js
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['login'] = {
    data: function () {
      return { usuario: '', password: '', verPass: false, cargando: false, error: '', codigoError: '', esDemo: Api.esDemo(), reiniciando: false };
    },
    computed: {
      empresa: function () {
        return (AppStore.estado.cfg && AppStore.estado.cfg.NOMBRE_EMPRESA) || 'NexoERP';
      },
      /* v1.5.1: ayuda de recuperación contextual tras un error de acceso. */
      mostrarAyuda: function () {
        return ['UNAUTHORIZED', 'RATE_LIMIT', 'INACTIVO', 'SIN_INSTALAR'].indexOf(this.codigoError) !== -1;
      }
    },
    methods: {
      /* v1.6.1: auto-recuperación de la demo desde la propia pantalla de
       * acceso. Motivos típicos: la contraseña inicial fue reemplazada al
       * completar el asistente de inicio en una visita anterior, o quedaron
       * restos de una versión antigua (localStorage / Service Worker).
       * Borra la BD demo local, las credenciales de sesión, desregistra los
       * Service Workers y recarga: la demo renace con admin / admin123. */
      async restablecerDemo() {
        this.reiniciando = true;
        try {
          try {
            localStorage.removeItem(CONFIG_APP.TOKEN_CLAVE);
            localStorage.removeItem(CONFIG_APP.USUARIO_CLAVE);
            localStorage.removeItem(CONFIG_APP.EXPIRA_CLAVE);
            localStorage.removeItem(CONFIG_APP.DB_DEMO);
          } catch (e) { /* storage bloqueado */ }
          try {
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
              var regs = await navigator.serviceWorker.getRegistrations();
              regs.forEach(function (r) { r.unregister(); });
            }
            if (window.caches && caches.keys) {
              var ks = await caches.keys();
              ks.forEach(function (k) { caches.delete(k); });
            }
          } catch (e) { /* sin SW: no importa */ }
          window.location.reload();
        } catch (e) {
          this.error = 'No se pudo restablecer la demostración: ' + (e.message || e);
          this.reiniciando = false;
        }
      },
      async entrar() {
        this.error = '';
        this.codigoError = '';
        if (!this.usuario || !this.password) { this.error = 'Ingrese usuario y contraseña.'; return; }
        this.cargando = true;
        try {
          var data = await Api.login(this.usuario.trim(), this.password);
          AppStore.guardarSesion(data);
          try { AppStore.estado.cfg = await Api.configGet(); window.__nexoerp_cfg = AppStore.estado.cfg || {}; } catch (e) { AppStore.estado.cfg = {}; }
          AppStore.toast('Bienvenido, ' + data.usuario.nombre.split(' ')[0] + '.', 'exito');
          AppStore.irA('dashboard', true);
          /* Adenda 1.5: sistema recién instalado (desde cero) → lanza el
           * asistente de inicio al administrador. Con backend v1.4 o
           * anterior la acción no existe y se ignora. */
          try {
            var estado = await Api.sistemaEstado();
            AppStore.estado.asistentePendiente = !!estado.necesitaAsistente;
            if (estado.necesitaAsistente && data.usuario.rol === 'admin') AppStore.irA('asistente', true);
          } catch (e) { AppStore.estado.asistentePendiente = false; }
        } catch (e) {
          this.error = e.message || 'No se pudo iniciar sesión.';
          this.codigoError = e.code || '';
        } finally {
          this.cargando = false;
        }
      }
    },
    template: `
<div class="min-h-screen flex flex-col lg:flex-row">

  <!-- Panel de marca -->
  <div class="relative lg:flex-1 bg-slate-900 overflow-hidden flex flex-col justify-between p-8 lg:p-14">
    <div class="absolute inset-0 opacity-[0.07]" style="background-image: radial-gradient(circle at 1px 1px, rgb(255 255 255) 1px, transparent 0); background-size: 28px 28px;"></div>
    <div class="absolute -top-32 -right-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
    <div class="absolute -bottom-24 -left-24 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl"></div>

    <div class="relative flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
        <icon name="cajas" clase="w-6 h-6 text-white"></icon>
      </div>
      <div>
        <p class="text-white font-bold text-lg leading-tight">Nexo<span class="text-blue-400">ERP</span></p>
        <p class="text-slate-400 text-xs">ERP · WMS · Costo de infraestructura $0</p>
      </div>
    </div>

    <div class="relative max-w-lg my-10 lg:my-0">
      <h1 class="text-3xl lg:text-4xl font-bold text-white leading-tight">Control total de su inventario, desde cualquier lugar.</h1>
      <p class="mt-4 text-slate-400 text-sm lg:text-base leading-relaxed">Gestión de almacenes, kardex físico y valorizado, movimientos en tiempo real, lotes con trazabilidad y alertas automáticas — sobre Vercel, Google Apps Script y Google Sheets.</p>
      <div class="mt-8 grid grid-cols-2 gap-3 text-sm">
        <div class="flex items-center gap-2 text-slate-300"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Kardex valorizado (PP)</div>
        <div class="flex items-center gap-2 text-slate-300"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Lotes y vencimientos FEFO</div>
        <div class="flex items-center gap-2 text-slate-300"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Roles y auditoría</div>
        <div class="flex items-center gap-2 text-slate-300"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Alertas de stock crítico</div>
      </div>
    </div>

    <p class="relative text-xs text-slate-500">Vercel + Google Apps Script + Google Sheets · v{{ CONFIG_APP.VERSION }}</p>
  </div>

  <!-- Formulario -->
  <div class="lg:w-[480px] xl:w-[520px] bg-white flex items-center justify-center p-6 sm:p-10">
    <div class="w-full max-w-sm">
      <h2 class="text-2xl font-bold text-slate-900">Iniciar sesión</h2>
      <p class="mt-1 text-sm text-slate-500">Acceda con sus credenciales corporativas.</p>

      <div v-if="esDemo" class="mt-5 rounded-xl bg-amber-50 ring-1 ring-amber-600/20 p-3 text-xs text-amber-800 leading-relaxed">
        <p class="font-semibold flex items-center gap-1.5"><icon name="lock" clase="w-3.5 h-3.5"></icon> Modo demostración activo</p>
        <p class="mt-1">Datos ficticios en su navegador. Usuarios: <b>admin / admin123</b> (administrador), <b>mgerente / demo123</b> (gerente), <b>joperador / demo123</b> (operador), <b>consulta / demo123</b> (solo lectura).</p>
        <p class="mt-1">⚠ Si ya recorrió el asistente de inicio y definió otra contraseña, use esa. Si la olvidó, restablezca la demo más abajo.</p>
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="entrar" novalidate>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5" for="login-usuario">Usuario</label>
          <input id="login-usuario" v-model="usuario" type="text" autocomplete="username" class="input-texto" placeholder="p. ej. admin" :disabled="cargando">
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5" for="login-password">Contraseña</label>
          <div class="relative">
            <input id="login-password" v-model="password" :type="verPass ? 'text' : 'password'" autocomplete="current-password" class="input-texto pr-10" placeholder="••••••••" :disabled="cargando">
            <button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" @click="verPass = !verPass" tabindex="-1" aria-label="Mostrar contraseña">
              <icon name="ojo" clase="w-5 h-5"></icon>
            </button>
          </div>
        </div>

        <div v-if="error" class="rounded-lg bg-rose-50 ring-1 ring-rose-600/20 px-3.5 py-2.5 text-sm text-rose-700 flex items-start gap-2">
          <icon name="warning" clase="w-4 h-4 mt-0.5 shrink-0"></icon> {{ error }}
        </div>

        <!-- v1.6.1: auto-recuperación de la demo sin salir de esta pantalla -->
        <div v-if="esDemo" class="rounded-xl ring-1 p-3.5 text-xs leading-relaxed" :class="mostrarAyuda ? 'bg-rose-50 ring-rose-600/20 text-rose-800' : 'bg-slate-50 ring-slate-200 text-slate-600'">
          <p class="font-semibold mb-1">¿No puede ingresar?</p>
          <p v-if="codigoError === 'RATE_LIMIT'">Se bloqueó el acceso por 5 minutos tras varios intentos fallidos. Espere ese tiempo o restablezca la demostración ahora.</p>
          <p v-else>Lo más común: la contraseña inicial <b>admin123</b> fue reemplazada al completar el asistente de inicio en una visita anterior, o quedaron datos de una versión previa en este navegador.</p>
          <p class="mt-1">El botón borra los datos locales de la demo y la regenera con <b>admin / admin123</b>.</p>
          <button type="button" class="btn-peligro w-full justify-center mt-2.5 py-2 text-xs" :disabled="reiniciando" @click="restablecerDemo">
            <span v-if="reiniciando" class="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
            {{ reiniciando ? 'Restableciendo...' : 'Restablecer demostración' }}
          </button>
        </div>

        <!-- v1.5.1: guía de recuperación según el modo de conexión -->
        <div v-if="mostrarAyuda && !esDemo" class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5 text-xs text-slate-600 leading-relaxed">
          <p class="font-semibold text-slate-700 mb-1">¿Problemas para ingresar? (conexión real)</p>
            <p class="mb-1"><b>Primera vez:</b> abra el editor de Apps Script vinculado a su hoja de cálculo y ejecute una vez <b>setupDesdeCero()</b> (empresa nueva) o <b>setupSystem()</b> (demo). Eso crea el usuario inicial.</p>
            <p><b>¿Olvidó la contraseña o la cuenta quedó corrupta?</b> En el mismo editor ejecute <b>restablecerAdmin()</b> — restaura <b>admin / admin123</b> sin borrar datos del negocio. Tras cambiar el código, recuerde crear una <b>nueva versión del despliegue</b>.</p>
        </div>

        <button type="submit" class="btn-primario w-full justify-center py-2.5" :disabled="cargando">
          <span v-if="cargando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
          {{ cargando ? 'Verificando...' : 'Ingresar al sistema' }}
        </button>
      </form>

      <p class="mt-6 text-xs text-slate-400 leading-relaxed">Las contraseñas se almacenan como hash SHA-256 con salt en Google Sheets. Cada acción crítica se valida contra el rol del usuario en el servidor de Apps Script.</p>
    </div>
  </div>
</div>`
  };
})();
