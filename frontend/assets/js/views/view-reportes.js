/**
 * NexoERP — vista-reportes.js
 * Reportes gerenciales exportables a CSV (stock valorizado, movimientos,
 * valorización por categoría, rotación).
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['reportes'] = {
    data: function () {
      return { reporte: null, tipo: 'stock', almacenId: '', fechaDesde: '', fechaHasta: '', cargando: false, almacenes: [] };
    },
    computed: {
      hayFilas: function () { return !!(this.reporte && this.reporte.filas && this.reporte.filas.length); }
    },
    async mounted() {
      try { this.almacenes = await Api.almacenes({}); } catch (e) { /* */ }
    },
    methods: {
      cambiarTipo: function (t) { this.tipo = t; this.reporte = null; },
      generar: async function () {
        this.cargando = true;
        try {
          if (this.tipo === 'stock') {
            var r = await Api.reporteStock({ almacenId: this.almacenId });
            r.filas = r.filas.map(function (f) { return Object.assign({}, f, { valorF: Utils.fmtMoneda(f.valorInventario), costoF: Utils.fmtMoneda(f.costoStd) }); });
            this.reporte = r;
          } else if (this.tipo === 'movimientos') {
            var m = await Api.reporteMovimientos({ fechaDesde: this.fechaDesde, fechaHasta: this.fechaHasta, limit: 2000 });
            m = m.map(function (x) { return Object.assign({}, x, { fechaF: Utils.fmtFechaHora(x.fecha) }); });
            this.reporte = { filas: m };
          } else if (this.tipo === 'categoria') {
            var s = await Api.stock({});
            var mapa = {};
            s.forEach(function (f) { mapa[f.categoria] = (mapa[f.categoria] || 0) + f.valor; });
            var filas = Object.keys(mapa).map(function (k) { return { categoria: k, valor: Math.round(mapa[k] * 100) / 100, valorF: Utils.fmtMoneda(mapa[k]) }; })
              .sort(function (a, b) { return b.valor - a.valor; });
            var total = filas.reduce(function (a, f) { return a + f.valor; }, 0);
            this.reporte = { filas: filas, totalValor: Math.round(total * 100) / 100 };
          }
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      exportar: function () {
        if (!this.hayFilas) return;
        if (this.tipo === 'stock') {
          Utils.descargarCSV('reporte_stock_' + Utils.hoyISO() + '.csv', [
            { k: 'sku', label: 'SKU' }, { k: 'producto', label: 'Producto' }, { k: 'categoria', label: 'Categoría' },
            { k: 'almacen', label: 'Almacén' }, { k: 'cantidad', label: 'Cantidad' }, { k: 'stockMin', label: 'Mínimo' },
            { k: 'costoStd', label: 'Costo estándar' }, { k: 'valorInventario', label: 'Valor inventario' }, { k: 'estado', label: 'Nivel' }
          ], this.reporte.filas);
        } else if (this.tipo === 'movimientos') {
          Utils.descargarCSV('reporte_movimientos_' + Utils.hoyISO() + '.csv', [
            { k: 'id', label: 'Documento' }, { k: 'fecha', label: 'Fecha' }, { k: 'tipo', label: 'Tipo' },
            { k: 'sku', label: 'SKU' }, { k: 'productoNombre', label: 'Producto' }, { k: 'cantidad', label: 'Cantidad' },
            { k: 'costoUnitario', label: 'Costo unitario' }, { k: 'lote', label: 'Lote' }, { k: 'documentoRef', label: 'Referencia' },
            { k: 'usuario', label: 'Usuario' }, { k: 'estado', label: 'Estado' }
          ], this.reporte.filas);
        } else {
          Utils.descargarCSV('reporte_categorias_' + Utils.hoyISO() + '.csv', [
            { k: 'categoria', label: 'Categoría' }, { k: 'valor', label: 'Valor inventario' }
          ], this.reporte.filas);
        }
        AppStore.toast('Reporte exportado a CSV.', 'exito');
      }
    },
    template: `
<div>
  <page-header titulo="Reportes Gerenciales" subtitulo="Exportación a CSV compatible con Excel y Google Sheets">
    <template #acciones>
      <button type="button" class="btn-secundario" :disabled="!hayFilas" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar CSV</button>
    </template>
  </page-header>

  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
    <button type="button" class="nexo-card text-left p-4 ring-1 transition-all" :class="tipo === 'stock' ? 'ring-blue-500 bg-blue-50/50' : 'ring-transparent hover:ring-slate-200'" @click="cambiarTipo('stock')">
      <icon name="stock" clase="w-5 h-5 mb-1.5" :class="tipo === 'stock' ? 'text-blue-600' : 'text-slate-400'"></icon>
      <p class="font-semibold text-sm text-slate-800">Stock valorizado</p>
      <p class="text-xs text-slate-400 mt-0.5">Posición de inventario a costo estándar por almacén</p>
    </button>
    <button type="button" class="nexo-card text-left p-4 ring-1 transition-all" :class="tipo === 'movimientos' ? 'ring-blue-500 bg-blue-50/50' : 'ring-transparent hover:ring-slate-200'" @click="cambiarTipo('movimientos')">
      <icon name="movimientos" clase="w-5 h-5 mb-1.5" :class="tipo === 'movimientos' ? 'text-blue-600' : 'text-slate-400'"></icon>
      <p class="font-semibold text-sm text-slate-800">Historial de movimientos</p>
      <p class="text-xs text-slate-400 mt-0.5">Transacciones del período con filtros de fecha</p>
    </button>
    <button type="button" class="nexo-card text-left p-4 ring-1 transition-all" :class="tipo === 'categoria' ? 'ring-blue-500 bg-blue-50/50' : 'ring-transparent hover:ring-slate-200'" @click="cambiarTipo('categoria')">
      <icon name="facturas" clase="w-5 h-5 mb-1.5" :class="tipo === 'categoria' ? 'text-blue-600' : 'text-slate-400'"></icon>
      <p class="font-semibold text-sm text-slate-800">Valorización por categoría</p>
      <p class="text-xs text-slate-400 mt-0.5">Distribución del capital inmovilizado</p>
    </button>
  </div>

  <div class="nexo-card mb-4 flex flex-wrap items-end gap-2">
    <div v-if="tipo === 'stock'" class="min-w-[170px]">
      <label class="label-forma">Almacén</label>
      <select v-model="almacenId" class="input-texto"><option value="">Todos</option><option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option></select>
    </div>
    <template v-if="tipo === 'movimientos'">
      <div>
        <label class="label-forma">Desde</label>
        <input v-model="fechaDesde" type="date" class="input-texto">
      </div>
      <div>
        <label class="label-forma">Hasta</label>
        <input v-model="fechaHasta" type="date" class="input-texto">
      </div>
    </template>
    <button type="button" class="btn-primario" :disabled="cargando" @click="generar">
      <icon name="reportes" clase="w-4 h-4"></icon> {{ cargando ? 'Generando...' : 'Generar reporte' }}
    </button>
  </div>

  <div v-if="tipo === 'stock' && reporte" class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
    <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Valor total del reporte</p><p class="text-lg font-bold text-blue-700 tabular-nums">{{ Utils.fmtMoneda(reporte.totalValor) }}</p></div>
    <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Líneas de stock</p><p class="text-lg font-bold text-slate-900 tabular-nums">{{ reporte.filas.length }}</p></div>
    <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Generado</p><p class="text-sm font-semibold text-slate-700">{{ Utils.fmtFechaHora(reporte.generado) }}</p></div>
  </div>

  <!-- Tablas por tipo -->
  <data-table v-if="tipo === 'stock' && reporte" :cols="[
    { k: 'sku', label: 'SKU', clase: 'font-mono text-xs text-slate-500' },
    { k: 'producto', label: 'Producto', clase: 'font-medium text-slate-800' },
    { k: 'categoria', label: 'Categoría' }, { k: 'almacen', label: 'Almacén', clase: 'text-slate-500' },
    { k: 'cantidad', label: 'Cantidad', clase: 'text-right tabular-nums font-semibold' },
    { k: 'costoF', label: 'Costo', clase: 'text-right tabular-nums' },
    { k: 'valorF', label: 'Valor', clase: 'text-right tabular-nums font-semibold' },
    { k: 'estado', label: 'Nivel', tipo: 'badge' }
  ]" :filas="reporte.filas" :por-pagina="15">
    <template #pie>
      <div class="flex justify-end px-4 py-2.5 text-sm text-slate-500">Total: <b class="ml-1.5 text-slate-800 tabular-nums">{{ Utils.fmtMoneda(reporte.totalValor) }}</b></div>
    </template>
  </data-table>

  <data-table v-else-if="tipo === 'movimientos' && reporte" :cols="[
    { k: 'fechaF', label: 'Fecha', clase: 'text-slate-500 whitespace-nowrap' },
    { k: 'id', label: 'Documento', clase: 'font-mono text-xs' },
    { k: 'tipo', label: 'Tipo', tipo: 'badge' },
    { k: 'productoNombre', label: 'Producto', clase: 'font-medium text-slate-800' },
    { k: 'cantidad', label: 'Cantidad', clase: 'text-right tabular-nums font-semibold' },
    { k: 'documentoRef', label: 'Referencia', clase: 'font-mono text-xs text-slate-500' },
    { k: 'usuario', label: 'Usuario' },
    { k: 'estado', label: 'Estado', tipo: 'badge' }
  ]" :filas="reporte.filas" :por-pagina="15" vacio="No hay movimientos en el período seleccionado" compacta></data-table>

  <data-table v-else-if="tipo === 'categoria' && reporte" :cols="[
    { k: 'categoria', label: 'Categoría', clase: 'font-semibold text-slate-800' },
    { k: 'valorF', label: 'Valor de inventario', clase: 'text-right tabular-nums' }
  ]" :filas="reporte.filas" :por-pagina="20">
    <template #celda-valorF="{ fila }"><span class="font-semibold text-blue-700">{{ fila.valorF }}</span></template>
    <template #pie>
      <div class="flex justify-end px-4 py-2.5 text-sm text-slate-500">Total: <b class="ml-1.5 text-slate-800 tabular-nums">{{ Utils.fmtMoneda(reporte.totalValor) }}</b></div>
    </template>
  </data-table>

  <div v-else class="nexo-card flex flex-col items-center justify-center py-16 text-center">
    <icon name="reportes" clase="w-12 h-12 text-slate-300 mb-3"></icon>
    <p class="text-slate-500 text-sm">Configure los filtros y presione <b>Generar reporte</b>.</p>
  </div>
</div>`
  };
})();
