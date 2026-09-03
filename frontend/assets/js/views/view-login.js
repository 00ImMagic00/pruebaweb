/**
 * NexoERP — vista-login.js
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['login'] = {
    data: function () {
      return { usuario: '', password: '', verPass: false, cargando: false, error: '', esDemo: Api.esDemo() };
    },
    computed: {
      empresa: function () {
        return (AppStore.estado.cfg && AppStore.estado.cfg.NOMBRE_EMPRESA) || 'NexoERP';
      }
    },
    methods: {
      async entrar() {
        this.error = '';
        if (!this.usuario || !this.password) { this.error = 'Ingrese usuario y contraseña.'; return; }
        this.cargando = true;
        try {
          var data = await Api.login(this.usuario.trim(), this.password);
          AppStore.guardarSesion(data);
          try { AppStore.estado.cfg = await Api.configGet(); window.__nexoerp_cfg = AppStore.estado.cfg || {}; } catch (e) { AppStore.estado.cfg = {}; }
          AppStore.toast('Bienvenido, ' + data.usuario.nombre.split(' ')[0] + '.', 'exito');
          AppStore.irA('dashboard', true);
        } catch (e) {
          this.error = e.message || 'No se pudo iniciar sesión.';
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
