/**
 * NexoERP — vista-kardex.js
 * Kardex físico y valorizado por producto/almacén (promedio ponderado).
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['kardex'] = {
    components: { 'search-select': NEXO_UI.SearchSelect },
    data: function () {
      return { productos: [], almacenes: [], productoId: '', almacenId: '', consulta: null, cargando: false, consultado: false };
    },
    computed: {
      resumen: function () { return (this.consulta && this.consulta.resumen) || null; },
      filas: function () { return (this.consulta && this.consulta.filas) || []; },
      producto: function () { return (this.consulta && this.consulta.producto) || null; },
      cols: function () {
        return [
          { k: 'fechaF', label: 'Fecha', clase: 'text-slate-500 whitespace-nowrap' },
          { k: 'movimientoId', label: 'Documento', clase: 'font-mono text-xs text-slate-600' },
          { k: 'tipo', label: 'Tipo', tipo: 'badge' },
          { k: 'almacen', label: 'Almacén', clase: 'text-slate-500 text-xs' },
          { k: 'entCantF', label: 'Entrada', clase: 'text-right tabular-nums text-emerald-700' },
          { k: 'salCantF', label: 'Salida', clase: 'text-right tabular-nums text-blue-700' },
          { k: 'saldoCantF', label: 'Saldo cant.', clase: 'text-right tabular-nums font-semibold' },
          { k: 'saldoValorF', label: 'Saldo valor', clase: 'text-right tabular-nums font-semibold' },
          { k: 'costoPromF', label: 'Costo prom.', clase: 'text-right tabular-nums text-slate-500' },
          { k: 'usuario', label: 'Usuario', clase: 'text-slate-400 text-xs' }
        ];
      }
    },
    async mounted() {
      try {
        this.productos = await Api.productos({ estado: 'ACTIVO' });
        this.almacenes = await Api.almacenes({});
      } catch (e) { /* */ }
    },
    methods: {
      consultar: async function () {
        if (!this.productoId) { AppStore.toast('Seleccione un producto.', 'warning'); return; }
        this.cargando = true;
        try {
          var res = await Api.kardex({ productoId: this.productoId, almacenId: this.almacenId });
          res.filas = res.filas.map(function (f) { return Object.assign({}, f, { fechaF: Utils.fmtFechaHora(f.fecha) }); });
          this.consulta = res;
          this.consultado = true;
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      exportar: function () {
        if (!this.filas.length) return;
        Utils.descargarCSV('kardex_' + (this.producto ? this.producto.sku : '') + '_' + Utils.hoyISO() + '.csv', [
          { k: 'fecha', label: 'Fecha' }, { k: 'movimientoId', label: 'Documento' }, { k: 'tipo', label: 'Tipo' },
          { k: 'almacen', label: 'Almacén' }, { k: 'entradaCantidad', label: 'Entrada cant.' }, { k: 'entradaValor', label: 'Entrada valor' },
          { k: 'salidaCantidad', label: 'Salida cant.' }, { k: 'salidaValor', label: 'Salida valor' },
          { k: 'saldoCantidad', label: 'Saldo cant.' }, { k: 'saldoValor', label: 'Saldo valor' },
          { k: 'costoPromedio', label: 'Costo promedio' }, { k: 'documentoRef', label: 'Referencia' }, { k: 'usuario', label: 'Usuario' }
        ], this.filas);
        AppStore.toast('Kardex exportado a CSV.', 'exito');
      }
    },
    template: `
<div>
  <page-header titulo="Kardex Físico y Valorizado" subtitulo="Movimientos secuenciales con saldo y costo promedio ponderado por almacén">
    <template #acciones>
      <button type="button" class="btn-secundario" :disabled="!filas.length" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar CSV</button>
    </template>
  </page-header>

  <div class="nexo-card mb-4 flex flex-wrap items-end gap-2">
    <div class="flex-1 min-w-[220px]">
      <label class="label-forma">Producto</label>
      <search-select v-model="productoId" :opciones="productos" placeholder="Seleccione un producto..." texto="nombre"></search-select>
    </div>
    <div class="min-w-[160px]">
      <label class="label-forma">Almacén</label>
      <select v-model="almacenId" class="input-texto">
        <option value="">Todos los almacenes</option>
        <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
      </select>
    </div>
    <button type="button" class="btn-primario" :disabled="cargando" @click="consultar">
      <icon name="search" clase="w-4 h-4" :class="cargando ? 'animate-pulse' : ''"></icon> Consultar
    </button>
  </div>

  <div v-if="!consultado" class="nexo-card flex flex-col items-center justify-center py-16 text-center">
    <icon name="kardex" clase="w-12 h-12 text-slate-300 mb-3"></icon>
    <p class="text-slate-500 text-sm">Seleccione un producto y presione <b>Consultar</b> para ver su kardex completo.</p>
    <p class="text-slate-400 text-xs mt-1">El kardex consolida entradas, salidas, transferencias, devoluciones, ajustes y anulaciones.</p>
  </div>

  <template v-else>
    <!-- Resumen -->
    <div v-if="producto" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div class="nexo-card col-span-2 lg:col-span-1 py-3 px-4">
        <p class="text-xs text-slate-500 font-medium">{{ producto.sku }}</p>
        <p class="font-bold text-slate-900 leading-snug">{{ producto.nombre }}</p>
        <p class="text-xs text-slate-400 mt-0.5">{{ producto.categoria }} · {{ producto.unidad }}</p>
      </div>
      <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Saldo en cantidad</p><p class="text-lg font-bold text-slate-900 tabular-nums">{{ Utils.fmtNum(resumen.saldoCantidad) }}</p></div>
      <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Saldo valorizado</p><p class="text-lg font-bold text-blue-700 tabular-nums">{{ Utils.fmtMoneda(resumen.saldoValor) }}</p></div>
      <div class="nexo-card py-3 px-4"><p class="text-xs text-slate-500 font-medium">Costo promedio</p><p class="text-lg font-bold text-slate-900 tabular-nums">{{ Utils.fmtMoneda(resumen.costoPromedio) }}</p></div>
    </div>

    <data-table :cols="cols" :filas="filas" :cargando="cargando" vacio="El producto no tiene movimientos registrados" :por-pagina="15" compacta>
      <template #celda-fechaF="{ fila }"><span class="text-xs">{{ fila.fechaF }}</span></template>
      <template #celda-entCantF="{ fila }"><span v-if="fila.entradaCantidad">{{ Utils.fmtNum(fila.entradaCantidad) }}</span><span v-else class="text-slate-300">·</span></template>
      <template #celda-salCantF="{ fila }"><span v-if="fila.salidaCantidad">{{ Utils.fmtNum(fila.salidaCantidad) }}</span><span v-else class="text-slate-300">·</span></template>
      <template #celda-saldoValorF="{ fila }">{{ Utils.fmtMoneda(fila.saldoValor) }}</template>
      <template #celda-costoPromF="{ fila }">{{ fila.costoPromedio ? Utils.fmtMoneda(fila.costoPromedio) : '—' }}</template>
    </data-table>
  </template>
</div>`
  };
})();
