/**
 * NexoERP — vista-cobranzas.js (Adenda 1.6)
 * Cobranza de cuotas de ventas a crédito y antigüedad de saldos
 * (aging) de Cuentas por Cobrar: cuotas + fiados.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['cobranzas'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      return {
        cuotas: [], aging: null, cargando: true, guardando: false, pestana: 'cuotas',
        filtroEstado: 'PENDIENTE',
        modalPago: false, sel: null, formPago: { monto: '', metodoPago: 'Efectivo', nota: '' }
      };
    },
    computed: {
      moneda: function () { return (AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'; },
      agingBuckets: function () {
        if (!this.aging) return [];
        var a = this.aging.resumen || {};
        return ['POR_VENCER', '1-30', '31-60', '61-90', '+90'].map(function (b) {
          return { clave: b, etiqueta: b === 'POR_VENCER' ? 'Por vencer' : b + ' días', monto: a[b] || 0 };
        });
      },
      cols: function () {
        return [
          { k: 'fechaVenc', label: 'Vence', clase: 'font-mono text-xs text-slate-500' },
          { k: 'clienteNombre', label: 'Cliente', clase: 'font-medium text-slate-800' },
          { k: 'ventaId', label: 'Venta', clase: 'font-mono text-xs text-blue-700' },
          { k: 'cuotaLabel', label: 'Cuota', clase: 'text-slate-600' },
          { k: 'montoF', label: 'Cuota', clase: 'text-right tabular-nums' },
          { k: 'saldoF', label: 'Saldo', clase: 'text-right tabular-nums font-semibold text-rose-600' },
          { k: 'diasF', label: 'Días vencida', clase: 'text-right tabular-nums' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([Api.cuotas({ estado: this.filtroEstado }), Api.creditosAging()]);
          this.cuotas = res[0].map(function (q) {
            return Object.assign({}, q, {
              cuotaLabel: q.nCuota + '/' + q.totalCuotas,
              montoF: Number(q.monto || 0).toFixed(2),
              saldoF: Number(q.saldo || 0).toFixed(2),
              diasF: q.estado === 'PENDIENTE' ? String(q.diasVencido || 0) : '—'
            });
          });
          this.aging = res[1];
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrirPago: function (q) {
        this.sel = q;
        this.formPago = { monto: String(q.saldo), metodoPago: 'Efectivo', nota: '' };
        this.modalPago = true;
      },
      pagar: async function () {
        if (!(parseFloat(this.formPago.monto) > 0)) { AppStore.toast('Monto inválido.', 'warning'); return; }
        this.guardando = true;
        try {
          var res = await Api.pagarCuota({ id: this.sel.id, monto: this.formPago.monto, metodoPago: this.formPago.metodoPago, nota: this.formPago.nota });
          AppStore.toast(res.estado === 'PAGADA' ? 'Cuota pagada por completo. El dinero entra a caja.' : 'Abono registrado. Saldo: ' + res.saldo, 'exito', 6000);
          this.modalPago = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 6000); }
        finally { this.guardando = false; }
      }
    },
    template: `
<div>
  <page-header titulo="Cobranzas y Cuentas por Cobrar" subtitulo="Cuotas de ventas a crédito · antigüedad de saldos (cuotas + fiados)">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
    </template>
  </page-header>

  <!-- Aging -->
  <div v-if="aging" class="bg-white rounded-xl ring-1 ring-slate-200 p-4 mb-4">
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <p class="text-sm font-bold text-slate-800">Antigüedad de CxC — Total: <span class="text-rose-600">{{ moneda }} {{ (aging.totalCxC || 0).toFixed(2) }}</span></p>
      <span class="text-xs text-slate-400">Incluye cuotas pendientes y fiados con saldo</span>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div v-for="b in agingBuckets" :key="b.clave" class="rounded-lg px-3 py-2 ring-1" :class="b.clave === 'POR_VENCER' ? 'bg-slate-50 ring-slate-200' : b.clave === '+90' ? 'bg-rose-50 ring-rose-200' : 'bg-amber-50 ring-amber-200'">
        <p class="text-xs text-slate-500">{{ b.etiqueta }}</p>
        <p class="text-base font-bold tabular-nums" :class="b.clave === 'POR_VENCER' ? 'text-slate-700' : 'text-rose-700'">{{ moneda }} {{ b.monto.toFixed(2) }}</p>
      </div>
    </div>
    <div v-if="aging.clientes && aging.clientes.length" class="mt-3 border-t border-slate-100 pt-3">
      <p class="text-xs uppercase text-slate-400 mb-2">Top deudores</p>
      <div class="flex flex-wrap gap-2">
        <span v-for="c in aging.clientes.slice(0, 8)" :key="c.clienteId + c.tipo" class="text-xs bg-slate-100 rounded-full px-2.5 py-1 text-slate-700">
          {{ c.clienteNombre }} <b class="text-rose-600">{{ moneda }} {{ c.total.toFixed(2) }}</b>
        </span>
      </div>
    </div>
  </div>

  <div class="flex gap-1 mb-3 bg-slate-200/60 rounded-lg p-1 w-fit">
    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium" :class="pestana === 'cuotas' ? 'bg-white shadow text-blue-700' : 'text-slate-600'" @click="pestana = 'cuotas'">Cuotas ({{ cuotas.length }})</button>
  </div>

  <div class="flex items-center gap-2 mb-3">
    <select v-model="filtroEstado" class="input-texto w-auto py-1.5" @change="cargar">
      <option value="PENDIENTE">Pendientes</option>
      <option value="PAGADA">Pagadas</option>
      <option value="TODAS">Todas</option>
    </select>
  </div>

  <data-table :cols="cols" :filas="pestana === 'cuotas' ? cuotas : []" :cargando="cargando" vacio="Sin cuotas registradas. Las ventas a crédito generan el plan automáticamente." :por-pagina="12">
    <template #acciones="{ fila }">
      <button v-if="fila.estado === 'PENDIENTE'" type="button" class="btn-icono text-blue-600 hover:bg-blue-50" title="Registrar cobro" @click="abrirPago(fila)"><icon name="dinero" clase="w-4 h-4"></icon></button>
    </template>
  </data-table>

  <modal :abierto="modalPago" titulo="Registrar cobro de cuota" @cerrar="modalPago = false">
    <div v-if="sel" class="space-y-4">
      <p class="text-sm text-slate-600">{{ sel.clienteNombre }} · Cuota {{ sel.nCuota }}/{{ sel.totalCuotas }} de <span class="font-mono">{{ sel.ventaId }}</span> · Vencía {{ sel.fechaVenc }}</p>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Monto cobrado</label>
          <input v-model="formPago.monto" type="number" min="0" step="0.01" class="input-texto">
        </div>
        <div>
          <label class="label-forma">Medio de pago</label>
          <select v-model="formPago.metodoPago" class="input-texto">
            <option>Efectivo</option><option>Yape</option><option>Plin</option><option>Tarjeta</option>
          </select>
        </div>
      </div>
      <div>
        <label class="label-forma">Nota</label>
        <input v-model="formPago.nota" type="text" class="input-texto" placeholder="p. ej. Deja letra de cambio">
      </div>
      <p class="text-xs text-slate-400">Los cobros en efectivo se suman al efectivo esperado del cuadre de caja del día.</p>
    </div>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalPago = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="pagar">{{ guardando ? 'Registrando...' : 'Registrar cobro' }}</button>
    </template>
  </modal>
</div>`
  };
})();
