/**
 * NexoERP — vista-alertas.js
 * Centro de alertas: stock crítico, lotes por vencer/vencidos y resumen.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['alertas'] = {
    data: function () {
      return { dash: null, lotesRes: null, lotesCriticos: [], cargando: true };
    },
    computed: {
      criticos: function () { return (this.dash && this.dash.stockCritico) || []; },
      vencimientos: function () { return (this.dash && this.dash.vencimientos) || []; }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([Api.dashboard(), Api.lotes({ soloPorVencer: true })]);
          this.dash = res[0];
          this.lotesRes = res[1].resumen;
          this.lotesCriticos = res[1].filas.filter(function (l) { return l.estadoLote !== 'OK' && l.estadoLote !== 'SIN_VENCIMIENTO'; }).slice(0, 15);
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      irMovimiento: function () { AppStore.irA('movimientos'); },
      irLotes: function () { AppStore.irA('lotes'); }
    },
    template: `
<div>
  <page-header titulo="Centro de Alertas" subtitulo="Indicadores automáticos de stock crítico y vencimientos próximos">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar</button>
      <button type="button" class="btn-primario" @click="irMovimiento"><icon name="plus" clase="w-4 h-4"></icon> Atender con movimiento</button>
    </template>
  </page-header>

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">

    <!-- Stock crítico -->
    <div class="nexo-card p-0 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-rose-50/50">
        <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <icon name="warning" clase="w-4 h-4 text-rose-500"></icon> Stock crítico
          <span class="rounded-full bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5">{{ criticos.length }}</span>
        </h3>
        <p class="text-xs text-slate-400">Productos en o bajo su mínimo</p>
      </div>
      <div class="max-h-96 overflow-y-auto nexo-scroll">
        <table class="min-w-full text-sm">
          <thead><tr class="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500">
            <th class="px-4 py-2 text-left font-semibold">Producto</th>
            <th class="px-4 py-2 text-left font-semibold">Almacén</th>
            <th class="px-4 py-2 text-right font-semibold">Stock</th>
            <th class="px-4 py-2 text-right font-semibold">Mínimo</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="f in criticos" :key="f.productoId + f.almacenId" class="hover:bg-rose-50/40">
              <td class="px-4 py-2.5"><p class="font-medium text-slate-800">{{ f.producto }}</p><p class="text-xs text-slate-400">{{ f.sku }}</p></td>
              <td class="px-4 py-2.5 text-slate-500">{{ f.almacen }}</td>
              <td class="px-4 py-2.5 text-right font-bold tabular-nums" :class="f.cantidad <= 0 ? 'text-rose-600' : 'text-amber-600'">{{ Utils.fmtNum(f.cantidad) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums text-slate-400">{{ Utils.fmtNum(f.stockMin) }}</td>
            </tr>
            <tr v-if="!criticos.length"><td colspan="4" class="px-4 py-10 text-center text-sm text-emerald-600 font-medium">Sin alertas de stock crítico ✓</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Vencimientos -->
    <div class="nexo-card p-0 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-amber-50/50">
        <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <icon name="lotes" clase="w-4 h-4 text-amber-500"></icon> Lotes por vencer o vencidos
          <span class="rounded-full bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5">{{ lotesRes ? lotesRes.vencidos + lotesRes.porVencer : 0 }}</span>
        </h3>
        <button type="button" class="text-xs font-medium text-blue-600 hover:text-blue-800" @click="irLotes">Ver todos →</button>
      </div>
      <div class="max-h-96 overflow-y-auto nexo-scroll">
        <table class="min-w-full text-sm">
          <thead><tr class="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500">
            <th class="px-4 py-2 text-left font-semibold">Lote / Producto</th>
            <th class="px-4 py-2 text-left font-semibold">Almacén</th>
            <th class="px-4 py-2 text-right font-semibold">Vence</th>
            <th class="px-4 py-2 text-right font-semibold">Estado</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="l in lotesCriticos" :key="l.id" class="hover:bg-amber-50/40">
              <td class="px-4 py-2.5"><p class="font-medium text-slate-800">{{ l.productoNombre }}</p><p class="text-xs text-slate-400 font-mono">{{ l.lote }}</p></td>
              <td class="px-4 py-2.5 text-slate-500">{{ l.almacen }}</td>
              <td class="px-4 py-2.5 text-right text-slate-600">{{ Utils.fmtFecha(l.fechaVencimiento) }}<p class="text-xs text-slate-400">{{ Utils.fmtNum(l.cantidad) }} u.</p></td>
              <td class="px-4 py-2.5 text-right"><badge :tipo="l.estadoLote"></badge></td>
            </tr>
            <tr v-if="!lotesCriticos.length"><td colspan="4" class="px-4 py-10 text-center text-sm text-emerald-600 font-medium">Sin vencimientos próximos ✓</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div v-if="dash" class="nexo-card mt-4 p-4">
    <h3 class="font-semibold text-slate-800 text-sm mb-3">Top 5 productos con más salidas del mes</h3>
    <div class="space-y-2.5">
      <div v-for="(t, i) in dash.topSalidas" :key="i" class="flex items-center gap-3">
        <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">{{ i + 1 }}</span>
        <p class="flex-1 text-sm text-slate-700 truncate">{{ t.producto }}</p>
        <div class="w-40 h-2 rounded-full bg-slate-100 overflow-hidden shrink-0 hidden sm:block">
          <div class="h-full rounded-full bg-blue-500" :style="{ width: (t.cantidad / (dash.topSalidas[0].cantidad || 1) * 100) + '%' }"></div>
        </div>
        <span class="text-sm font-semibold text-slate-800 tabular-nums w-24 text-right shrink-0">{{ Utils.fmtNum(t.cantidad) }} <span class="text-xs font-normal text-slate-400">{{ t.unidad }}</span></span>
      </div>
      <p v-if="!dash.topSalidas.length" class="text-sm text-slate-400 text-center py-4">Sin salidas registradas este mes.</p>
    </div>
  </div>
</div>`
  };
})();
