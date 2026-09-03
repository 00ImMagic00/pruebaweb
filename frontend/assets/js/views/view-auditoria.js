/**
 * NexoERP — vista-auditoria.js (admin / gerente)
 * Registro de auditoría de acciones del sistema.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['auditoria'] = {
    data: function () {
      return { filas: [], cargando: true, q: '' };
    },
    computed: {
      filasFiltradas: function () {
        var q = this.q.toLowerCase();
        return this.filas.filter(function (f) {
          return !q || (f.usuario + ' ' + f.accion + ' ' + f.detalle).toLowerCase().indexOf(q) !== -1;
        });
      },
      cols: function () {
        return [
          { k: 'fechaF', label: 'Fecha y hora', clase: 'text-slate-500 whitespace-nowrap text-xs' },
          { k: 'usuario', label: 'Usuario', clase: 'font-medium text-slate-800' },
          { k: 'rol', label: 'Rol', tipo: 'badge' },
          { k: 'accion', label: 'Acción', clase: 'font-mono text-xs font-semibold text-slate-700' },
          { k: 'detalle', label: 'Detalle', clase: 'text-slate-500' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var datos = await Api.auditoria({ limit: 200 });
          this.filas = datos.map(function (a) { return Object.assign({}, a, { fechaF: Utils.fmtFechaHora(a.fecha) }); });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      }
    },
    template: `
<div>
  <page-header titulo="Auditoría del Sistema" subtitulo="Trazabilidad de acciones: accesos, movimientos, anulaciones y cambios de configuración">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar</button>
    </template>
  </page-header>

  <div class="nexo-card mb-4">
    <div class="relative">
      <icon name="search" clase="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
      <input v-model="q" type="search" class="input-texto pl-9" placeholder="Buscar por usuario, acción o detalle...">
    </div>
  </div>

  <data-table :cols="cols" :filas="filasFiltradas" :cargando="cargando" vacio="Sin registros de auditoría" :por-pagina="18" compacta></data-table>
</div>`
  };
})();
