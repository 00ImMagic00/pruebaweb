/**
 * NexoERP — vista-caja.js (ADENDA: Cuadre de Caja)
 * Estado de caja (abierta/cerrada), resumen de ventas del día por
 * método de pago (Efectivo / Yape / Plin / Tarjeta), cierre con
 * conteo físico del efectivo y cálculo automático de diferencia.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['caja'] = {
    data: function () {
      return {
        estado: null, historial: [], cargando: true, procesando: false,
        montoInicial: '200', montoContado: '', detalleCierre: ''
      };
    },
    computed: {
      moneda: function () { return this.estado ? this.estado.moneda : 'S/'; },
      abierta: function () { return this.estado && this.estado.abierta; },
      ventasEfectivo: function () {
        if (!this.estado) return 0;
        var r = this.estado.resumen.find(function (x) { return x.metodo === 'Efectivo'; });
        return r ? r.total : 0;
      },
      fiadoEmitido: function () {
        if (!this.estado) return 0;
        var r = this.estado.resumen.find(function (x) { return x.metodo === 'Fiado'; });
        return r ? r.total : 0;
      },
      abonosEfectivo: function () { return (this.estado && this.estado.abonosFiadoEfectivo) || 0; },
      abonosTotal: function () { return (this.estado && this.estado.abonosFiadoTotal) || 0; },
      /* Efectivo esperado = fondo inicial + ventas en efectivo + abonos de fiado en efectivo (Adenda 1.3). */
      efectivoEsperado: function () {
        var fondo = this.estado && this.estado.caja ? this.estado.caja.montoInicial : 0;
        return Math.round((fondo + this.ventasEfectivo + this.abonosEfectivo) * 100) / 100;
      },
      diferenciaProyectada: function () {
        var c = parseFloat(this.montoContado);
        if (isNaN(c) || c < 0) return null;
        return Math.round((c - this.efectivoEsperado) * 100) / 100;
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([Api.cajaEstado(), Api.cajaHistorial()]);
          this.estado = res[0];
          this.historial = res[1];
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrir: async function () {
        this.procesando = true;
        try {
          await Api.cajaAbrir(parseFloat(this.montoInicial) || 0);
          AppStore.toast('Caja abierta correctamente.', 'exito');
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.procesando = false; }
      },
      cerrar: async function () {
        var c = parseFloat(this.montoContado);
        if (isNaN(c) || c < 0) { AppStore.toast('Ingrese el efectivo contado en caja.', 'warning'); return; }
        var ok = await AppStore.confirmar({
          titulo: 'Cerrar caja',
          mensaje: 'Efectivo esperado (fondo + ventas): ' + this.moneda + ' ' + this.efectivoEsperado.toFixed(2) +
                   '\nContado: ' + this.moneda + ' ' + c.toFixed(2) +
                   '\nDiferencia: ' + this.moneda + ' ' + ((c - this.efectivoEsperado).toFixed(2)) +
                   '\n\n¿Desea cerrar la caja ahora?',
          okLabel: 'Cerrar caja'
        });
        if (!ok) return;
        this.procesando = true;
        try {
          var res = await Api.cajaCerrar(c, this.detalleCierre);
          var d = res.caja.diferencia;
          AppStore.toast('Caja cerrada. Ventas del día: ' + this.moneda + ' ' + res.totalVentasDia.toFixed(2) +
            ' · Diferencia: ' + this.moneda + ' ' + d.toFixed(2), d === 0 ? 'exito' : 'warning');
          this.montoContado = ''; this.detalleCierre = '';
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.procesando = false; }
      },
      exportar: function () {
        Utils.descargarCSV('cuadre-caja.csv', [
          { label: 'ID', k: 'id' }, { label: 'Fecha', k: 'fecha' },
          { label: 'Apertura', k: 'aperturaAt' }, { label: 'Cajero', k: 'usuario' },
          { label: 'MontoInicial', k: 'montoInicial' }, { label: 'Cierre', k: 'cierreAt' },
          { label: 'EfectivoSistema', k: 'montoSistema' }, { label: 'EfectivoContado', k: 'montoContado' },
          { label: 'Diferencia', k: 'diferencia' }, { label: 'Estado', k: 'estado' }
        ], this.historial);
      }
    },
    template: `
<div>
  <page-header titulo="Cuadre de Caja" subtitulo="Conciliación diaria del efectivo contra las ventas registradas por método de pago">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar</button>
      <button type="button" class="btn-primario" @click="cargar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar
      </button>
    </template>
  </page-header>

  <div v-if="cargando && !estado" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div v-for="i in 3" :key="i" class="nexo-card h-56 animate-pulse bg-slate-200/60"></div>
  </div>

  <div v-else-if="estado" class="grid grid-cols-1 lg:grid-cols-3 gap-4">

    <!-- Estado de caja -->
    <div class="nexo-card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-slate-800 text-sm">Estado de caja</h3>
        <badge v-if="estado.caja" :tipo="estado.caja.estado"></badge>
        <span v-else class="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">CERRADA</span>
      </div>

      <template v-if="estado.caja">
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-slate-500">Caja</dt><dd class="font-mono font-semibold">{{ estado.caja.id }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Apertura</dt><dd>{{ Utils.fmtFechaHora(estado.caja.aperturaAt) }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Cajero</dt><dd class="font-medium">{{ estado.caja.usuario }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Fondo inicial</dt><dd class="tabular-nums font-medium">{{ moneda }} {{ estado.caja.montoInicial.toFixed(2) }}</dd></div>
        </dl>
        <div class="mt-4 rounded-xl bg-blue-50 ring-1 ring-blue-200 px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-blue-700">Ventas del día (todas)</p>
          <p class="text-2xl font-bold text-blue-800 tabular-nums mt-0.5">{{ moneda }} {{ estado.totalVentasDia.toFixed(2) }}</p>
          <p class="text-xs text-blue-600 mt-0.5">{{ estado.nTransacciones }} transacción(es) · {{ estado.fecha }}</p>
        </div>
      </template>

      <template v-else>
        <div class="text-center py-6">
          <icon name="dinero" clase="w-12 h-12 mx-auto text-slate-300"></icon>
          <p class="text-sm text-slate-500 mt-3">No hay ninguna caja abierta.<br>Abra caja para iniciar la jornada de ventas.</p>
        </div>
        <label class="label-forma">Fondo inicial (efectivo en caja)</label>
        <input v-model="montoInicial" type="number" min="0" step="0.10" class="input-texto">
        <button type="button" class="btn-primario w-full justify-center mt-3" :disabled="procesando" @click="abrir">
          <span v-if="procesando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
          <icon v-else name="check" clase="w-4 h-4"></icon> Abrir caja
        </button>
      </template>
    </div>

    <!-- Resumen por método de pago -->
    <div class="nexo-card">
      <h3 class="font-semibold text-slate-800 text-sm mb-3">Ventas de hoy por método de pago</h3>
      <div v-if="estado.resumen.length" class="space-y-2">
        <div v-for="r in estado.resumen" :key="r.metodo" class="flex items-center justify-between rounded-xl ring-1 ring-slate-200 px-4 py-2.5">
          <div class="flex items-center gap-2.5">
            <badge :tipo="r.metodo"></badge>
            <span class="text-xs text-slate-400">{{ r.n }} trans. · {{ Math.round(r.total / (estado.totalVentasDia || 1) * 100) }}%</span>
          </div>
          <span class="font-bold tabular-nums text-slate-900">{{ moneda }} {{ r.total.toFixed(2) }}</span>
        </div>
      </div>
      <div v-else class="text-center py-8 text-sm text-slate-400">Aún no hay ventas registradas hoy.</div>

      <div class="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3 text-sm space-y-1.5">
        <div class="flex justify-between"><span class="text-slate-500">Ventas en efectivo</span>
          <span class="tabular-nums font-semibold">{{ moneda }} {{ ventasEfectivo.toFixed(2) }}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Abonos de fiado (efectivo)</span>
          <span class="tabular-nums font-semibold text-emerald-700">+ {{ moneda }} {{ abonosEfectivo.toFixed(2) }}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Fondo inicial</span>
          <span class="tabular-nums">{{ estado.caja ? moneda + ' ' + estado.caja.montoInicial.toFixed(2) : '—' }}</span></div>
        <div class="flex justify-between border-t border-slate-200 pt-1.5"><span class="text-slate-500">Efectivo esperado total</span>
          <span class="tabular-nums font-bold">{{ moneda }} {{ efectivoEsperado.toFixed(2) }}</span></div>
      </div>

      <div v-if="fiadoEmitido > 0" class="mt-3 rounded-xl bg-rose-50/70 ring-1 ring-inset ring-rose-600/10 px-4 py-3 text-sm">
        <div class="flex justify-between"><span class="text-rose-700 font-medium">Fiado emitido hoy (no entra a caja)</span>
          <span class="tabular-nums font-bold text-rose-700">{{ moneda }} {{ fiadoEmitido.toFixed(2) }}</span></div>
        <p class="text-[11px] text-rose-600/80 mt-1">Se cobra después desde el módulo <b>Fiados</b>; los abonos en efectivo sí suman al arqueo.</p>
      </div>
    </div>

    <!-- Cierre -->
    <div class="nexo-card" v-if="estado.caja">
      <h3 class="font-semibold text-slate-800 text-sm mb-3">Cerrar caja (cuadre)</h3>
      <div class="space-y-3">
        <div>
          <label class="label-forma">Efectivo contado (arqueo físico)</label>
          <input v-model="montoContado" type="number" min="0" step="0.10" class="input-texto" placeholder="0.00">
        </div>
        <div>
          <label class="label-forma">Observaciones del cierre</label>
          <input v-model="detalleCierre" type="text" class="input-texto" placeholder="Opcional: faltantes, vueltos pendientes...">
        </div>
        <div class="rounded-xl ring-1 px-4 py-3 text-sm" :class="diferenciaProyectada === null ? 'bg-slate-50 ring-slate-200' : diferenciaProyectada === 0 ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200'">
          <div class="flex justify-between"><span class="text-slate-500">Efectivo esperado (fondo + ventas + abonos)</span><span class="tabular-nums font-semibold">{{ moneda }} {{ efectivoEsperado.toFixed(2) }}</span></div>
          <div class="flex justify-between mt-1"><span class="text-slate-500">Diferencia proyectada</span>
            <span class="tabular-nums font-bold" :class="diferenciaProyectada === null ? '' : diferenciaProyectada === 0 ? 'text-emerald-700' : 'text-amber-700'">
              {{ diferenciaProyectada === null ? '—' : moneda + ' ' + diferenciaProyectada.toFixed(2) }}</span></div>
          <p v-if="diferenciaProyectada !== null && diferenciaProyectada !== 0" class="text-xs text-amber-700 mt-1.5">Se registrará la diferencia en el historial de cierres.</p>
        </div>
        <button type="button" class="btn-peligro w-full justify-center" :disabled="procesando" @click="cerrar">
          <span v-if="procesando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
          <icon v-else name="lock" clase="w-4 h-4"></icon> Cerrar caja y registrar cuadre
        </button>
      </div>
    </div>
    <div class="nexo-card" v-else>
      <h3 class="font-semibold text-slate-800 text-sm mb-3">Cierre</h3>
      <p class="text-sm text-slate-400">Abra la caja para habilitar el cierre del día.</p>
    </div>
  </div>

  <!-- Historial de cierres -->
  <div class="nexo-card p-0 overflow-hidden mt-4">
    <div class="px-4 py-3 border-b border-slate-100"><h3 class="font-semibold text-slate-800 text-sm">Historial de cajas</h3></div>
    <div class="overflow-x-auto nexo-scroll">
      <table class="min-w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
          <th class="px-4 py-2 text-left font-semibold">Caja</th>
          <th class="px-4 py-2 text-left font-semibold">Fecha</th>
          <th class="px-4 py-2 text-left font-semibold">Cajero</th>
          <th class="px-4 py-2 text-right font-semibold">Fondo</th>
          <th class="px-4 py-2 text-right font-semibold">Efectivo sistema</th>
          <th class="px-4 py-2 text-right font-semibold">Contado</th>
          <th class="px-4 py-2 text-right font-semibold">Diferencia</th>
          <th class="px-4 py-2 text-center font-semibold">Estado</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="h in historial" :key="h.id" class="hover:bg-blue-50/40">
            <td class="px-4 py-2.5 font-mono text-xs text-slate-600">{{ h.id }}</td>
            <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">{{ Utils.fmtFecha(h.fecha) }}</td>
            <td class="px-4 py-2.5">{{ h.usuario }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ moneda }} {{ h.montoInicial.toFixed(2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ h.estado === 'CERRADA' ? moneda + ' ' + h.montoSistema.toFixed(2) : '—' }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ h.estado === 'CERRADA' ? moneda + ' ' + h.montoContado.toFixed(2) : '—' }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums font-semibold" :class="h.diferencia === 0 ? 'text-emerald-600' : (h.estado === 'CERRADA' ? 'text-amber-600' : 'text-slate-400')">
              {{ h.estado === 'CERRADA' ? moneda + ' ' + h.diferencia.toFixed(2) : '—' }}</td>
            <td class="px-4 py-2.5 text-center"><badge :tipo="h.estado"></badge></td>
          </tr>
          <tr v-if="!historial.length"><td colspan="8" class="px-4 py-8 text-center text-sm text-slate-400">Sin cajas registradas todavía</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`
  };
})();
