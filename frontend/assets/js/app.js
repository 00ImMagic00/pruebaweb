/**
 * NexoERP — app.js
 * Componente raíz: layout (sidebar + topbar), router por hash y arranque.
 */
(function () {

  // Las vistas ya poblaron este objeto (se cargan antes); lo reutiliza.
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  var MENU = [
    { seccion: 'Principal', items: [
      { ruta: 'dashboard', label: 'Dashboard', icono: 'dashboard' },
      { ruta: 'pos', label: 'POS de Mostrador', icono: 'pos', roles: ['admin', 'gerente', 'operador'] }
    ]},
    { seccion: 'Ventas', items: [
      { ruta: 'ventas', label: 'Ventas y Boletas', icono: 'boleta' },
      { ruta: 'cotizaciones', label: 'Cotizaciones', icono: 'cotizaciones' },
      { ruta: 'fiados', label: 'Fiados', icono: 'fiados' },
      { ruta: 'caja', label: 'Cuadre de Caja', icono: 'dinero', roles: ['admin', 'gerente', 'operador'] },
      { ruta: 'clientes', label: 'Clientes', icono: 'cliente' }
    ]},
    { seccion: 'Inventario', items: [
      { ruta: 'productos', label: 'Productos', icono: 'productos' },
      { ruta: 'categorias', label: 'Categorías', icono: 'etiqueta' },
      { ruta: 'almacenes', label: 'Almacenes', icono: 'almacenes' },
      { ruta: 'stock', label: 'Stock por Almacén', icono: 'stock' },
      { ruta: 'lotes', label: 'Lotes y Vencimientos', icono: 'lotes' },
      { ruta: 'kardex', label: 'Kardex', icono: 'kardex' }
    ]},
    { seccion: 'Operaciones', items: [
      { ruta: 'movimientos', label: 'Movimientos', icono: 'movimientos' },
      { ruta: 'alertas', label: 'Centro de Alertas', icono: 'alertas' }
    ]},
    { seccion: 'Sistema', items: [
      { ruta: 'panel', label: 'Panel de Control', icono: 'panel', roles: ['admin', 'gerente'] },
      { ruta: 'usuarios', label: 'Usuarios y Roles', icono: 'usuarios', roles: ['admin'] },
      { ruta: 'reportes', label: 'Reportes', icono: 'reportes' },
      { ruta: 'rentabilidad', label: 'Rentabilidad Real', icono: 'dinero' },
      { ruta: 'auditoria', label: 'Auditoría', icono: 'auditoria', roles: ['admin', 'gerente'] },
      { ruta: 'config', label: 'Configuración', icono: 'config', roles: ['admin'] }
    ]}
  ];

  var App = {
    components: { 'toast-zone': NEXO_UI.ToastZone, 'confirm-dialog': NEXO_UI.ConfirmDialog },
    computed: {
      est: function () { return AppStore.estado; },
      vistaActual: function () { return window.NEXO_VISTAS[this.est.ruta] || null; },
      esDemo: function () { return Api.esDemo(); },
      menuFiltrado: function () {
        var rol = this.est.usuario ? this.est.usuario.rol : '';
        return MENU.map(function (s) {
          return {
            seccion: s.seccion,
            items: s.items.filter(function (i) { return !i.roles || i.roles.indexOf(rol) !== -1; })
          };
        }).filter(function (s) { return s.items.length; });
      },
      tituloRuta: function () {
        for (var i = 0; i < MENU.length; i++) {
          for (var j = 0; j < MENU[i].items.length; j++) {
            if (MENU[i].items[j].ruta === this.est.ruta) return MENU[i].items[j].label;
          }
        }
        return 'Dashboard';
      },
      iniciales: function () { return Utils.iniciales(this.est.usuario ? this.est.usuario.nombre : '?'); },
      nombreRol: function () { return this.est.usuario ? this.est.usuario.rol.charAt(0).toUpperCase() + this.est.usuario.rol.slice(1) : ''; }
    },
    methods: {
      irA: function (r) { AppStore.irA(r); },
      cerrarSesion: function () { AppStore.logout(); }
    },
    async mounted() {
      if (this.est.token) {
        try {
          var res = await Api.ping();
          if (this.est.usuario) this.est.usuario = Object.assign({}, this.est.usuario, res.usuario);
          try { this.est.cfg = await Api.configGet(); } catch (e) { this.est.cfg = {}; }
          window.__nexoerp_cfg = this.est.cfg || {};
          AppStore.procesarRuta();
        } catch (e) {
          AppStore.limpiarSesion();
        }
      }
      this.est.lista = true;
    },
    template: `
<div class="min-h-screen bg-slate-100">

  <!-- ===================== LOGIN ===================== -->
  <template v-if="!est.token">
    <component :is="'vista-login'" v-if="est.lista"></component>
    <div v-else class="min-h-screen flex items-center justify-center">
      <span class="inline-block w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></span>
    </div>
  </template>

  <!-- ===================== APP ===================== -->
  <template v-else>

    <!-- Sidebar escritorio -->
    <aside class="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 z-40">
      <div class="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 shrink-0">
        <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <icon name="cajas" clase="w-5 h-5 text-white"></icon>
        </div>
        <div class="min-w-0">
          <p class="text-white font-bold leading-tight">Nexo<span class="text-blue-400">ERP</span></p>
          <p class="text-[10px] uppercase tracking-wider text-slate-500">Gestión de Almacenes</p>
        </div>
      </div>
      <nav class="flex-1 overflow-y-auto nexo-scroll py-3 px-3 space-y-4">
        <div v-for="sec in menuFiltrado" :key="sec.seccion">
          <p class="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{{ sec.seccion }}</p>
          <button v-for="it in sec.items" :key="it.ruta" type="button" @click="irA(it.ruta)"
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all mb-0.5"
            :class="est.ruta === it.ruta ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'text-slate-300 hover:bg-white/10 hover:text-white'">
            <icon :name="it.icono" clase="w-5 h-5 shrink-0"></icon>
            <span class="truncate">{{ it.label }}</span>
          </button>
        </div>
      </nav>
      <div class="p-3 border-t border-white/10 shrink-0">
        <div class="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/5">
          <div class="w-8 h-8 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">{{ iniciales }}</div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold text-white truncate">{{ est.usuario.nombre }}</p>
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">{{ nombreRol }}</p>
          </div>
          <button type="button" class="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors" title="Cerrar sesión" @click="cerrarSesion">
            <icon name="logout" clase="w-5 h-5"></icon>
          </button>
        </div>
      </div>
    </aside>

    <!-- Sidebar móvil -->
    <teleport to="body">
      <div v-if="est.menuAbierto" class="fixed inset-0 z-50 lg:hidden">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="est.menuAbierto = false"></div>
        <aside class="absolute inset-y-0 left-0 w-72 bg-slate-900 text-slate-300 flex flex-col animate-slide-right">
          <div class="flex items-center justify-between px-5 h-16 border-b border-white/10">
            <p class="text-white font-bold">{{ CONFIG_APP.NOMBRE_APP }}</p>
            <button type="button" class="p-2 text-slate-400" @click="est.menuAbierto = false"><icon name="x" clase="w-5 h-5"></icon></button>
          </div>
          <nav class="flex-1 overflow-y-auto nexo-scroll py-3 px-3 space-y-4">
            <div v-for="sec in menuFiltrado" :key="sec.seccion">
              <p class="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{{ sec.seccion }}</p>
              <button v-for="it in sec.items" :key="it.ruta" type="button" @click="irA(it.ruta)"
                class="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium"
                :class="est.ruta === it.ruta ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'">
                <icon :name="it.icono" clase="w-5 h-5 shrink-0"></icon>
                <span>{{ it.label }}</span>
              </button>
            </div>
          </nav>
          <div class="p-4 border-t border-white/10">
            <button type="button" class="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10" @click="cerrarSesion">
              <icon name="logout" clase="w-5 h-5"></icon> Cerrar sesión
            </button>
          </div>
        </aside>
      </div>
    </teleport>

    <!-- Contenido -->
    <div class="lg:pl-64 flex flex-col min-h-screen">
      <header class="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center gap-3 px-4 sm:px-6 shrink-0">
        <button type="button" class="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100" @click="est.menuAbierto = true" aria-label="Abrir menú">
          <icon name="menu" clase="w-6 h-6"></icon>
        </button>
        <div class="min-w-0 flex-1">
          <h1 class="text-sm sm:text-base font-bold text-slate-900 truncate">{{ tituloRuta }}</h1>
          <p class="hidden sm:block text-xs text-slate-400 truncate">{{ est.cfg && est.cfg.NOMBRE_EMPRESA ? est.cfg.NOMBRE_EMPRESA : 'Sistema ERP/WMS' }}</p>
        </div>
        <span v-if="esDemo" class="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Modo demo
        </span>
        <div class="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0" :title="est.usuario.nombre">{{ iniciales }}</div>
      </header>

      <main class="flex-1 p-4 sm:p-6 w-full max-w-[1600px] mx-auto">
        <component :is="'vista-' + est.ruta" :key="est.ruta" v-if="vistaActual"></component>
      </main>

      <footer class="px-6 py-4 text-center text-xs text-slate-400 mt-auto">
        {{ CONFIG_APP.NOMBRE_APP }} v{{ CONFIG_APP.VERSION }} · Vercel + Google Apps Script + Google Sheets
        <span v-if="esDemo"> · Datos de demostración en su navegador</span>
      </footer>
    </div>
  </template>

  <toast-zone></toast-zone>
  <confirm-dialog></confirm-dialog>
</div>`
  };

  document.addEventListener('DOMContentLoaded', function () {
    var app = Vue.createApp(App);
    // Globales accesibles desde todas las plantillas.
    app.config.globalProperties.CONFIG_APP = CONFIG_APP;
    app.config.globalProperties.Utils = Utils;
    app.config.globalProperties.AppStore = AppStore;
    app.config.globalProperties.Api = Api;
    app.component('icon', NEXO_UI.Icon);
    app.component('badge', NEXO_UI.Badge);
    app.component('modal', NEXO_UI.Modal);
    app.component('data-table', NEXO_UI.DataTable);
    app.component('kpi-card', NEXO_UI.KpiCard);
    app.component('page-header', NEXO_UI.PageHeader);
    app.component('search-select', NEXO_UI.SearchSelect);
    app.component('venta-boleta', NEXO_UI.BoletaVenta);
    // Registra todas las vistas (vista-login, vista-dashboard, ...).
    Object.keys(window.NEXO_VISTAS).forEach(function (clave) {
      app.component('vista-' + clave, window.NEXO_VISTAS[clave]);
    });
    app.mount('#app');
  });
})();
