/**
 * NexoERP — vista-stock.js
 * Consulta de stock por almacén con alertas de niveles y exportación CSV.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['stock'] = {
    data: function () {
      return { filas: [], almacenes: [], cargando: true, q: '', almacenId: '', soloCritico: false };
    },
    computed: {
      filasFiltradas: function () {
        var q = this.q.toLowerCase(), alm = this.almacenId, solo = this.soloCritico;
        return this.filas.filter(function (f) {
          if (q && (f.producto.toLowerCase().indexOf(q) === -1 && f.sku.toLowerCase().indexOf(q) === -1)) return false;
          if (alm && f.almacenId !== alm) return false;
          if (solo && f.estado !== 'CRITICO') return false;
          return true;
        });
      },
      totalValor: function () { return this.filas.reduce(function (a, f) { return a + f.valor; }, 0); },
      totalUnidades: function () { return this.filas.reduce(function (a, f) { return a + f.cantidad; }, 0); },
      criticos: function () { return this.filas.filter(function (f) { return f.estado === 'CRITICO'; }).length; },
      cols: function () {
        return [
          { k: 'sku', label: 'SKU', clase: 'font-mono text-xs text-slate-500' },
          { k: 'producto', label: 'Producto', clase: 'font-medium text-slate-800' },
          { k: 'almacen', label: 'Almacén', clase: 'text-slate-500' },
          { k: 'cantidadF', label: 'Cantidad', clase: 'text-right tabular-nums font-semibold' },
          { k: 'stockMinF', label: 'Mínimo', clase: 'text-right tabular-nums text-slate-400' },
          { k: 'nivel', label: 'Nivel', tipo: 'badge' },
          { k: 'valorF', label: 'Valor', clase: 'text-right tabular-nums' }
        ];
      }
    },
    async mounted() {
      try { this.almacenes = await Api.almacenes({}); } catch (e) { /* silencioso */ }
      await this.cargar();
    },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var datos = await Api.stock({ almacenId: this.almacenId, q: '', soloCritico: false });
          this.filas = datos.map(function (f) {
            return Object.assign({}, f, {
              cantidadF: Utils.fmtNum(f.cantidad),
              stockMinF: Utils.fmtNum(f.stockMin),
              valorF: Utils.fmtMoneda(f.valor)
            });
          });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      exportar: function () {
        Utils.descargarCSV('stock_' + Utils.hoyISO() + '.csv', [
          { k: 'sku', label: 'SKU' }, { k: 'producto', label: 'Producto' },
          { k: 'categoria', label: 'Categoría' }, { k: 'almacen', label: 'Almacén' },
          { k: 'cantidad', label: 'Cantidad' }, { k: 'stockMin', label: 'Stock mínimo' },
          { k: 'costoStd', label: 'Costo estándar' }, { k: 'valor', label: 'Valor inventario' },
          { k: 'estado', label: 'Nivel' }
        ], this.filasFiltradas);
        AppStore.toast('CSV de stock descargado.', 'exito');
      }
    },
    template: `
<div>
  <page-header titulo="Stock por Almacén" subtitulo="Posición de inventario en tiempo real con niveles mínimos">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button type="button" class="btn-secundario" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar CSV</button>
    </template>
  </page-header>

  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Valor total</p><p class="text-lg font-bold text-slate-900 tabular-nums">{{ Utils.fmtMoneda(totalValor) }}</p></div>
    <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Unidades totales</p><p class="text-lg font-bold text-slate-900 tabular-nums">{{ Utils.fmtNum(totalUnidades) }}</p></div>
    <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Líneas de stock</p><p class="text-lg font-bold text-slate-900 tabular-nums">{{ filas.length }}</p></div>
    <div class="nexo-card py-3 px-4" :class="criticos ? 'ring-1 ring-rose-200 bg-rose-50/40' : ''"><p class="text-xs text-slate-500 font-medium">En nivel crítico</p><p class="text-lg font-bold tabular-nums" :class="criticos ? 'text-rose-600' : 'text-emerald-600'">{{ criticos }}</p></div>
  </div>

  <div class="nexo-card mb-4 flex flex-wrap items-center gap-2">
    <div class="relative flex-1 min-w-[200px]">
      <icon name="search" clase="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
      <input v-model="q" type="search" class="input-texto pl-9" placeholder="Buscar producto o SKU...">
    </div>
    <select v-model="almacenId" class="input-texto w-auto min-w-[160px]">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
    </select>
    <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
      <input v-model="soloCritico" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"> Solo críticos
    </label>
  </div>

  <data-table :cols="cols" :filas="filasFiltradas" :cargando="cargando" vacio="No hay stock registrado con estos filtros" :por-pagina="14">
    <template #celda-cantidadF="{ fila }">
      <span :class="fila.estado === 'CRITICO' ? 'text-rose-600' : 'text-slate-800'">{{ fila.cantidadF }}</span>
    </template>
    <template #pie>
      <div class="flex flex-wrap justify-end gap-6 px-4 py-2.5 text-sm">
        <span class="text-slate-500">Unidades: <b class="text-slate-800 tabular-nums">{{ Utils.fmtNum(totalUnidades) }}</b></span>
        <span class="text-slate-500">Valor: <b class="text-slate-800 tabular-nums">{{ Utils.fmtMoneda(totalValor) }}</b></span>
      </div>
    </template>
  </data-table>
</div>`
  };
})();
