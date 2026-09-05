/**
 * NexoERP — vista-reportes.js
 * Reportes gerenciales exportables a CSV (stock valorizado, movimientos,
 * valorización por categoría, rotación).
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['reportes'] = {
    data: function () {
      return { reporte: null, tipo: 'stock', almacenId: '', fechaDesde: '', fechaHasta: '', cargando: false, almacenes: [],
        /* Adenda 1.6 */
        abc: null, muertos: null, muertosDias: 30, cargandoAna: false };
    },
    computed: {
      hayFilas: function () { return !!(this.reporte && this.reporte.filas && this.reporte.filas.length); }
    },
    async mounted() {
      try { this.almacenes = await Api.almacenes({}); } catch (e) { /* */ }
      this.cargarAnalitica();
    },
    methods: {
      /* Adenda 1.6: ABC y productos muertos */
      cargarAnalitica: async function () {
        this.cargandoAna = true;
        try {
          var res = await Promise.all([Api.analiticaAbc({}), Api.analiticaMuertos(this.muertosDias)]);
          this.abc = res[0];
          this.muertos = res[1];
        } catch (e) { /* silencioso */ }
        finally { this.cargandoAna = false; }
      },
      libroVentas: async function () {
        var mes = prompt('Mes del libro de ventas (YYYY-MM):', new Date().toISOString().slice(0, 7));
        if (!mes) return;
        try {
          var res = await Api.libroVentas(mes, 'CSV');
          var blob = new Blob([res.contenido], { type: 'text/csv;charset=utf-8' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'libro_ventas_' + mes + '.csv';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          AppStore.toast('Libro de ventas ' + mes + ' descargado (' + res.filas + ' filas).', 'exito');
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
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
      <button type="button" class="btn-secundario" @click="libroVentas"><icon name="reportes" clase="w-4 h-4"></icon> Libro de ventas (CSV)</button>
      <button type="button" class="btn-secundario" :disabled="!hayFilas" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar CSV</button>
    </template>
  </page-header>

  <!-- Adenda 1.6: Curva ABC + Productos muertos -->
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="nexo-card p-0 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2"><icon name="reportes" clase="w-4 h-4 text-blue-600"></icon> Curva ABC (Pareto de ingresos)</h3>
        <span v-if="abc" class="text-xs text-slate-400">Total: {{ Utils.fmtMoneda(abc.total) }}</span>
      </div>
      <div class="max-h-64 overflow-y-auto nexo-scroll">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-xs uppercase text-slate-400 border-b border-slate-100">
            <th class="px-4 py-2">Producto</th><th class="px-4 py-2 text-right">Ingresos</th><th class="px-4 py-2 text-center">Clase</th>
          </tr></thead>
          <tbody>
            <tr v-for="p in (abc ? abc.productos.slice(0, 12) : [])" :key="p.sku" class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-1.5 truncate max-w-[220px]">{{ p.nombre }}</td>
              <td class="px-4 py-1.5 text-right tabular-nums">{{ Utils.fmtMoneda(p.ingresos) }} <span class="text-[10px] text-slate-400">{{ p.pctAcumulado }}%</span></td>
              <td class="px-4 py-1.5 text-center">
                <span class="text-[10px] font-bold rounded px-1.5 py-0.5" :class="p.clase === 'A' ? 'bg-emerald-100 text-emerald-700' : p.clase === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'">{{ p.clase }}</span>
              </td>
            </tr>
            <tr v-if="!abc || !abc.productos.length"><td colspan="3" class="px-4 py-4 text-center text-slate-400">Sin ventas registradas todavía.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-50">A = 80% de ingresos · B = 15% · C = 5%. Enfoca el capital en la clase A.</p>
    </div>

    <div class="nexo-card p-0 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2"><icon name="warning" clase="w-4 h-4 text-rose-500"></icon> Productos muertos ({{ muertosDias }} días sin ventas)</h3>
        <select v-model="muertosDias" class="input-texto w-auto py-1 text-xs" @change="cargarAnalitica">
          <option :value="30">30 días</option><option :value="60">60 días</option><option :value="90">90 días</option>
        </select>
      </div>
      <div class="max-h-64 overflow-y-auto nexo-scroll">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-xs uppercase text-slate-400 border-b border-slate-100">
            <th class="px-4 py-2">Producto</th><th class="px-4 py-2 text-right">Stock</th><th class="px-4 py-2 text-right">Costo inmovilizado</th>
          </tr></thead>
          <tbody>
            <tr v-for="p in (muertos ? muertos.productos.slice(0, 12) : [])" :key="p.sku" class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-1.5 truncate max-w-[220px]">{{ p.nombre }} <span v-if="p.nuncaVendido" class="text-[10px] text-rose-500 font-bold">NUNCA VENDIDO</span></td>
              <td class="px-4 py-1.5 text-right tabular-nums">{{ p.stock }} {{ p.unidad }}</td>
              <td class="px-4 py-1.5 text-right tabular-nums text-rose-600">{{ Utils.fmtMoneda(p.costoInmovilizado) }}</td>
            </tr>
            <tr v-if="!muertos || !muertos.productos.length"><td colspan="3" class="px-4 py-4 text-center text-slate-400">Todos los productos giran. Bien ahí.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-50">Capital inmovilizado total: <b class="text-rose-600">{{ muertos ? Utils.fmtMoneda(muertos.productos.reduce(function(t,p){return t+p.costoInmovilizado;},0)) : '—' }}</b></p>
    </div>
  </div>

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
