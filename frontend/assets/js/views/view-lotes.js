/**
 * NexoERP — vista-lotes.js
 * Trazabilidad de lotes, series y vencimientos (política FEFO).
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['lotes'] = {
    data: function () {
      return { filas: [], resumen: null, productos: [], almacenes: [], cargando: true, productoId: '', almacenId: '', soloPorVencer: false };
    },
    computed: {
      cols: function () {
        return [
          { k: 'lote', label: 'Lote', clase: 'font-mono text-xs font-semibold text-slate-700' },
          { k: 'productoNombre', label: 'Producto', clase: 'font-medium text-slate-800' },
          { k: 'almacen', label: 'Almacén', clase: 'text-slate-500' },
          { k: 'numeroSerie', label: 'Serie', clase: 'font-mono text-xs text-slate-500' },
          { k: 'vencF', label: 'Vencimiento', clase: 'text-slate-600' },
          { k: 'diasF', label: 'Días restantes', clase: 'text-right' },
          { k: 'cantidadF', label: 'Cantidad', clase: 'text-right tabular-nums font-semibold' },
          { k: 'estadoLote', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() {
      try {
        var res = await Promise.all([Api.productos({ estado: 'ACTIVO' }), Api.almacenes({})]);
        this.productos = res[0];
        this.almacenes = res[1];
      } catch (e) { /* */ }
      await this.cargar();
    },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Api.lotes({ productoId: this.productoId, almacenId: this.almacenId, soloPorVencer: this.soloPorVencer });
          this.resumen = res.resumen;
          this.filas = res.filas.map(function (l) {
            return Object.assign({}, l, {
              vencF: l.fechaVencimiento ? Utils.fmtFecha(l.fechaVencimiento) : '—',
              diasF: l.diasRestantes === null ? '—' : (l.diasRestantes < 0 ? Math.abs(l.diasRestantes) + ' vencidos' : l.diasRestantes + ' días'),
              cantidadF: Utils.fmtNum(l.cantidad)
            });
          });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      exportar: function () {
        Utils.descargarCSV('lotes_' + Utils.hoyISO() + '.csv', [
          { k: 'lote', label: 'Lote' }, { k: 'sku', label: 'SKU' }, { k: 'productoNombre', label: 'Producto' },
          { k: 'almacen', label: 'Almacén' }, { k: 'numeroSerie', label: 'Serie' },
          { k: 'fechaVencimiento', label: 'Vencimiento' }, { k: 'diasRestantes', label: 'Días restantes' },
          { k: 'cantidad', label: 'Cantidad' }, { k: 'estadoLote', label: 'Estado' }
        ], this.filas);
        AppStore.toast('CSV de lotes descargado.', 'exito');
      }
    },
    template: `
<div>
  <page-header titulo="Lotes, Series y Vencimientos" subtitulo="Trazabilidad completa con política FEFO (primero en vencer, primero en salir)">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar CSV</button>
    </template>
  </page-header>

  <div v-if="resumen" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Lotes activos</p><p class="text-lg font-bold text-slate-900 tabular-nums">{{ resumen.totalLotes }}</p></div>
    <div class="nexo-card py-3 px-4" :class="resumen.vencidos ? 'ring-1 ring-rose-200 bg-rose-50/40' : ''"><p class="text-xs text-slate-500 font-medium">Vencidos</p><p class="text-lg font-bold tabular-nums" :class="resumen.vencidos ? 'text-rose-600' : 'text-slate-900'">{{ resumen.vencidos }}</p></div>
    <div class="nexo-card py-3 px-4" :class="resumen.porVencer ? 'ring-1 ring-amber-200 bg-amber-50/40' : ''"><p class="text-xs text-slate-500 font-medium">Por vencer ({{ resumen.diasAlerta }} días)</p><p class="text-lg font-bold tabular-nums" :class="resumen.porVencer ? 'text-amber-600' : 'text-slate-900'">{{ resumen.porVencer }}</p></div>
    <div class="nexo-card py-3 px-4 flex items-center"><p class="text-xs text-slate-500 leading-relaxed">Las salidas sin lote específico consumen automáticamente el lote más próximo a vencer (FEFO).</p></div>
  </div>

  <div class="nexo-card mb-4 flex flex-wrap items-center gap-2">
    <search-select class="flex-1 min-w-[220px]" :opciones="productos" v-model="productoId" placeholder="Todos los productos" texto="nombre"></search-select>
    <select v-model="almacenId" class="input-texto w-auto min-w-[150px]">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
    </select>
    <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
      <input v-model="soloPorVencer" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500" @change="cargar"> Solo por vencer / vencidos
    </label>
    <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon></button>
  </div>

  <data-table :cols="cols" :filas="filas" :cargando="cargando" vacio="No hay lotes activos con estos filtros" :por-pagina="14">
    <template #celda-diasF="{ fila }">
      <span :class="fila.estadoLote === 'VENCIDO' ? 'text-rose-600 font-semibold' : fila.estadoLote === 'POR_VENCER' ? 'text-amber-600 font-semibold' : 'text-slate-500'">{{ fila.diasF }}</span>
    </template>
  </data-table>
</div>`
  };
})();
