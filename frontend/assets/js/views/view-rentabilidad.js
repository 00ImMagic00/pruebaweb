/**
 * NexoERP — vista-rentabilidad.js  (ADENDA 1.3)
 * Rentabilidad REAL por producto: usa el costo registrado en el kardex al
 * momento de cada salida (VentaDetalle.costoUnit). Los regalos cuentan
 * como costo puro (ingresos 0), así el margen refleja la operación real.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['rentabilidad'] = {
    data: function () {
      var hoy = Utils.hoyISO();
      return {
        reporte: null, cargando: false,
        fechaDesde: hoy.slice(0, 8) + '01', fechaHasta: hoy,
        orden: 'margen', catFiltro: ''
      };
    },
    computed: {
      moneda: function () { return this.reporte ? this.reporte.moneda : ((AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'); },
      categorias: function () {
        if (!this.reporte) return [];
        var set = {};
        this.reporte.filas.forEach(function (f) { set[f.categoria] = true; });
        return Object.keys(set).sort();
      },
      filas: function () {
        if (!this.reporte) return [];
        var cat = this.catFiltro;
        var filas = cat ? this.reporte.filas.filter(function (f) { return f.categoria === cat; }) : this.reporte.filas.slice();
        if (this.orden === 'margen') filas.sort(function (a, b) { return b.margen - a.margen; });
        else if (this.orden === 'margenPct') filas.sort(function (a, b) { return b.margenPct - a.margenPct; });
        else if (this.orden === 'ingresos') filas.sort(function (a, b) { return b.ingresos - a.ingresos; });
        else if (this.orden === 'peor') filas.sort(function (a, b) { return a.margen - b.margen; });
        return filas;
      },
      totales: function () { return this.reporte ? this.reporte.totales : { ingresos: 0, costo: 0, margen: 0, margenPct: 0 }; },
      margenPositivo: function () { return this.totales.margen >= 0; }
    },
    async mounted() { await this.generar(); },
    methods: {
      generar: async function () {
        this.cargando = true;
        try {
          this.reporte = await Api.rentabilidadProducto({ fechaDesde: this.fechaDesde, fechaHasta: this.fechaHasta });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      exportar: function () {
        if (!this.reporte) return;
        Utils.descargarCSV('rentabilidad_' + this.fechaDesde + '_' + this.fechaHasta + '.csv', [
          { k: 'sku', label: 'SKU' }, { k: 'descripcion', label: 'Producto' }, { k: 'categoria', label: 'Categoría' },
          { k: 'cantVendida', label: 'Cant. vendida' }, { k: 'cantRegalada', label: 'Cant. regalada' },
          { k: 'ingresos', label: 'Ingresos' }, { k: 'costo', label: 'Costo real' },
          { k: 'margen', label: 'Margen' }, { k: 'margenPct', label: 'Margen %' },
          { k: 'precioActual', label: 'Precio actual' }, { k: 'costoActual', label: 'Costo actual' }
        ], this.reporte.filas);
        AppStore.toast('Rentabilidad exportada a CSV.', 'exito');
      }
    },
    template: `
<div>
  <page-header titulo="Rentabilidad Real por Producto" subtitulo="Margen bruto con el costo real del kardex (los regalos descuentan como costo)">
    <template #acciones>
      <button type="button" class="btn-secundario" :disabled="!reporte" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar CSV</button>
      <button type="button" class="btn-primario" @click="generar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Calcular
      </button>
    </template>
  </page-header>

  <!-- Filtros -->
  <div class="nexo-card mb-4 flex flex-wrap items-end gap-3">
    <div>
      <label class="label-forma">Desde</label>
      <input v-model="fechaDesde" type="date" class="input-texto">
    </div>
    <div>
      <label class="label-forma">Hasta</label>
      <input v-model="fechaHasta" type="date" class="input-texto">
    </div>
    <div>
      <label class="label-forma">Categoría</label>
      <select v-model="catFiltro" class="input-texto">
        <option value="">Todas</option>
        <option v-for="c in categorias" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <div>
      <label class="label-forma">Ordenar por</label>
      <select v-model="orden" class="input-texto">
        <option value="margen">Mayor margen (S/)</option>
        <option value="peor">Menor margen (problemas)</option>
        <option value="margenPct">Mayor margen (%)</option>
        <option value="ingresos">Mayores ingresos</option>
      </select>
    </div>
  </div>

  <!-- Totales -->
  <div v-if="reporte" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
    <kpi-card label="Ingresos del período" :valor="moneda + ' ' + Utils.fmtNum(totales.ingresos, 2)" icono="dinero" tono="blue"></kpi-card>
    <kpi-card label="Costo real (COGS)" :valor="moneda + ' ' + Utils.fmtNum(totales.costo, 2)" icono="cajas" tono="amber" :detalle="reporte.sinCosto ? reporte.sinCosto + ' producto(s) sin costo registrado' : 'Según kardex de cada salida'"></kpi-card>
    <kpi-card label="Margen bruto" :valor="moneda + ' ' + Utils.fmtNum(totales.margen, 2)" icono="reportes" :tono="margenPositivo ? 'emerald' : 'rose'"></kpi-card>
    <kpi-card label="Margen %" :valor="totales.margenPct + '%'" icono="etiqueta" :tono="margenPositivo ? 'emerald' : 'rose'" :detalle="Utils.fmtNum(totales.cantRegalada, 2) + ' unidades regaladas'"></kpi-card>
  </div>

  <!-- Tabla -->
  <div v-if="reporte" class="nexo-card p-0 overflow-hidden">
    <div class="overflow-x-auto nexo-scroll">
      <table class="min-w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
          <th class="px-4 py-2.5 text-left font-semibold">Producto</th>
          <th class="px-4 py-2.5 text-right font-semibold">Vendida</th>
          <th class="px-4 py-2.5 text-right font-semibold">Regalada</th>
          <th class="px-4 py-2.5 text-right font-semibold">Ingresos</th>
          <th class="px-4 py-2.5 text-right font-semibold">Costo real</th>
          <th class="px-4 py-2.5 text-right font-semibold">Margen</th>
          <th class="px-4 py-2.5 text-right font-semibold">Margen %</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="f in filas" :key="f.productoId" class="hover:bg-blue-50/30">
            <td class="px-4 py-2.5">
              <p class="font-medium text-slate-800">{{ f.descripcion }}</p>
              <p class="text-[11px] text-slate-400 font-mono">{{ f.sku }} · {{ f.categoria }}</p>
            </td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ Utils.fmtNum(f.cantVendida, 2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums" :class="f.cantRegalada > 0 ? 'text-fuchsia-600 font-semibold' : 'text-slate-400'">{{ f.cantRegalada > 0 ? Utils.fmtNum(f.cantRegalada, 2) : '—' }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ moneda }} {{ Utils.fmtNum(f.ingresos, 2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums text-slate-500">{{ moneda }} {{ Utils.fmtNum(f.costo, 2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums font-bold" :class="f.margen >= 0 ? 'text-emerald-700' : 'text-rose-600'">{{ moneda }} {{ Utils.fmtNum(f.margen, 2) }}</td>
            <td class="px-4 py-2.5 text-right">
              <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset"
                :class="f.margenPct >= 30 ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : f.margenPct >= 0 ? 'bg-amber-50 text-amber-700 ring-amber-600/20' : 'bg-rose-50 text-rose-700 ring-rose-600/20'">
                {{ f.margenPct }}%
              </span>
            </td>
          </tr>
          <tr v-if="!filas.length"><td colspan="7" class="px-4 py-10 text-center text-sm text-slate-400">Sin ventas en el período seleccionado</td></tr>
        </tbody>
        <tfoot v-if="filas.length">
          <tr class="bg-slate-50 border-t border-slate-200 font-bold">
            <td class="px-4 py-2.5 text-slate-700">TOTAL ({{ filas.length }} producto(s))</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ Utils.fmtNum(totales.cantVendida, 2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ Utils.fmtNum(totales.cantRegalada, 2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ moneda }} {{ Utils.fmtNum(totales.ingresos, 2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ moneda }} {{ Utils.fmtNum(totales.costo, 2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums" :class="margenPositivo ? 'text-emerald-700' : 'text-rose-600'">{{ moneda }} {{ Utils.fmtNum(totales.margen, 2) }}</td>
            <td class="px-4 py-2.5 text-right">{{ totales.margenPct }}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <div v-if="cargando && !reporte" class="nexo-card py-14 text-center">
    <span class="inline-block w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></span>
    <p class="text-sm text-slate-400 mt-3">Calculando margen real...</p>
  </div>
</div>`
  };
})();
