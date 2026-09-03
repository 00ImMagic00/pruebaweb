/**
 * NexoERP — vista-fiados.js  (ADENDA 1.3)
 * El "cuaderno de fiados" digital: cartera de créditos por cliente,
 * boletas pendientes con antigüedad, registro de abonos (Efectivo,
 * Yape, Plin, Tarjeta) e historial de pagos.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['fiados'] = {
    data: function () {
      return {
        cartera: null, pagos: [], cargando: true,
        abonoModal: false, guardando: false,
        clienteSel: null, form: { monto: '', metodoPago: 'Efectivo', ventaId: '', nota: '' },
        mostrarHistorial: false
      };
    },
    computed: {
      moneda: function () { return this.cartera ? this.cartera.moneda : ((AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'); },
      clientes: function () { return this.cartera ? this.cartera.clientes : []; },
      totalPendiente: function () { return this.cartera ? this.cartera.totalPendiente : 0; },
      diasAlerta: function () { return this.cartera ? this.cartera.diasAlerta : 30; }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([Api.fiadosCartera(), Api.fiadoPagos({ limit: 60 })]);
          this.cartera = res[0];
          this.pagos = res[1];
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrirAbono: function (cli) {
        this.clienteSel = cli;
        this.form = { monto: Number(cli.saldo).toFixed(2), metodoPago: 'Efectivo', ventaId: '', nota: '' };
        this.abonoModal = true;
      },
      abonarTotal: function () {
        if (this.clienteSel) this.form.monto = Number(this.clienteSel.saldo).toFixed(2);
      },
      confirmarAbono: async function () {
        var monto = parseFloat(this.form.monto);
        if (isNaN(monto) || monto <= 0) { AppStore.toast('Ingrese un monto válido.', 'warning'); return; }
        if (monto > this.clienteSel.saldo + 0.009) { AppStore.toast('El abono no puede superar el saldo pendiente (' + this.moneda + ' ' + Number(this.clienteSel.saldo).toFixed(2) + ').', 'warning'); return; }
        this.guardando = true;
        try {
          var res = await Api.fiadoAbono({
            clienteId: this.clienteSel.id,
            monto: monto,
            metodoPago: this.form.metodoPago,
            ventaId: this.form.ventaId || '',
            nota: this.form.nota || ''
          });
          AppStore.toast('Abono de ' + this.moneda + ' ' + monto.toFixed(2) + ' registrado para ' + res.cliente.nombre + '.', 'exito');
          if (res.cliente.saldado) {
            AppStore.toast('¡Cuenta saldada! ' + res.cliente.ventasSaldadas + ' boleta(s) pasaron a PAGADO.', 'exito');
          }
          this.abonoModal = false;
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      whatsappCliente: function (cli) {
        if (!cli.telefono) { AppStore.toast('El cliente no tiene teléfono registrado. Edítelo en Clientes.', 'warning'); return; }
        var cfg = AppStore.estado.cfg || {};
        var msg = '*Recordatorio de cuenta*\n' + (cfg.RAZON_SOCIAL || cfg.NOMBRE_EMPRESA || 'NexoERP') +
          '\nCliente: ' + cli.nombre +
          '\nSaldo pendiente: ' + this.moneda + ' ' + Number(cli.saldo).toFixed(2) +
          (cli.ventasPendientes.length ? '\nBoletas: ' + cli.ventasPendientes.map(function (v) { return v.boleta; }).join(', ') : '') +
          '\n\nLe agradeceremos realizar el abono correspondiente. ¡Gracias!';
        window.open(Utils.linkWhatsapp(cli.telefono, msg), '_blank');
      },
      exportar: function () {
        if (!this.clientes.length) { AppStore.toast('No hay fiados pendientes para exportar.', 'info'); return; }
        Utils.descargarCSV('fiados_' + Utils.hoyISO() + '.csv', [
          { k: 'nombre', label: 'Cliente' }, { k: 'documento', label: 'Documento' },
          { k: 'telefono', label: 'Teléfono' }, { k: 'limite', label: 'Límite' },
          { k: 'saldo', label: 'Saldo' }, { k: 'disponible', label: 'Disponible' },
          { k: 'nPendientes', label: 'Boletas pendientes' }, { k: 'diasMax', label: 'Días de antigüedad' }
        ], this.clientes);
      }
    },
    template: `
<div>
  <page-header titulo="Fiados (Venta a Crédito)" subtitulo="Cartera de cobro por cliente, abonos parciales y antigüedad de las boletas fiadas">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="mostrarHistorial = !mostrarHistorial">
        <icon name="dinero" clase="w-4 h-4"></icon> {{ mostrarHistorial ? 'Ocultar abonos' : 'Ver abonos' }}
      </button>
      <button type="button" class="btn-secundario" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar</button>
      <button type="button" class="btn-primario" @click="cargar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar
      </button>
    </template>
  </page-header>

  <div v-if="cargando && !cartera" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div v-for="i in 3" :key="i" class="nexo-card h-28 animate-pulse bg-slate-200/60"></div>
  </div>

  <template v-else>
    <!-- KPIs -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <kpi-card label="Total por cobrar" :valor="moneda + ' ' + Utils.fmtNum(totalPendiente, 2)" icono="dinero" tono="rose" detalle="Saldo de fiado pendiente"></kpi-card>
      <kpi-card label="Clientes con deuda" :valor="String(cartera.nClientes)" icono="cliente" tono="amber" :detalle="'Alerta de cobro a los ' + diasAlerta + ' días'"></kpi-card>
      <kpi-card label="Boletas fiadas pendientes" :valor="String(clientes.reduce(function(a,c){return a+c.nPendientes;},0))" icono="boleta" tono="blue"></kpi-card>
    </div>

    <!-- Cartera -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div v-for="cli in clientes" :key="cli.id" class="nexo-card p-0 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold text-slate-800 truncate">{{ cli.nombre }}</p>
            <p class="text-xs text-slate-400">{{ cli.documento || 'Sin documento' }} · {{ cli.telefono || 'Sin teléfono' }}</p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-lg font-bold tabular-nums" :class="cli.critico ? 'text-rose-600' : 'text-slate-900'">{{ moneda }} {{ Number(cli.saldo).toFixed(2) }}</p>
            <p class="text-[11px] text-slate-400">Límite: {{ cli.limite > 0 ? moneda + ' ' + Number(cli.limite).toFixed(2) : 'sin límite' }}</p>
          </div>
        </div>

        <div class="px-4 py-2 flex items-center gap-2 flex-wrap">
          <badge v-if="cli.critico" tipo="VENCIDO"></badge>
          <span class="text-xs" :class="cli.critico ? 'text-rose-600 font-semibold' : 'text-slate-500'">Antigüedad máx.: {{ cli.diasMax }} día(s)</span>
          <span v-if="cli.disponible !== null" class="text-xs text-slate-500">· Disponible: {{ moneda }} {{ Number(cli.disponible).toFixed(2) }}</span>
        </div>

        <div class="divide-y divide-slate-100 max-h-44 overflow-y-auto nexo-scroll">
          <div v-for="v in cli.ventasPendientes" :key="v.id" class="px-4 py-2 flex items-center justify-between gap-2 text-sm">
            <div>
              <span class="font-mono font-semibold text-blue-700">{{ v.boleta }}</span>
              <span class="block text-[11px] text-slate-400">{{ Utils.fmtFechaHora(v.fecha) }} · hace {{ v.dias }} día(s)</span>
            </div>
            <span class="font-bold tabular-nums">{{ moneda }} {{ Number(v.total).toFixed(2) }}</span>
          </div>
          <p v-if="!cli.ventasPendientes.length" class="px-4 py-3 text-xs text-slate-400">Sin boletas fiadas vigentes (saldo residual).</p>
        </div>

        <div class="px-4 py-3 bg-slate-50/70 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" class="btn-secundario py-1.5 text-xs" @click="whatsappCliente(cli)"><icon name="whatsapp" clase="w-4 h-4 text-emerald-600"></icon> Recordar</button>
          <button type="button" class="btn-primario py-1.5 text-xs" @click="abrirAbono(cli)"><icon name="dinero" clase="w-4 h-4"></icon> Registrar abono</button>
        </div>
      </div>

      <div v-if="!clientes.length" class="xl:col-span-2 nexo-card text-center py-14">
        <icon name="check" clase="w-12 h-12 mx-auto text-emerald-400"></icon>
        <p class="text-slate-500 mt-3">Ningún cliente tiene fiado pendiente. Todo al día ✓</p>
        <p class="text-xs text-slate-400 mt-1">Venda al fiado desde el POS seleccionando el método de pago "Fiado" y un cliente registrado.</p>
      </div>
    </div>

    <!-- Historial de abonos -->
    <div v-if="mostrarHistorial" class="nexo-card p-0 overflow-hidden mt-4">
      <div class="px-4 py-3 border-b border-slate-100"><h3 class="font-semibold text-slate-800 text-sm">Historial de abonos</h3></div>
      <div class="overflow-x-auto nexo-scroll">
        <table class="min-w-full text-sm">
          <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
            <th class="px-4 py-2 text-left font-semibold">Fecha</th>
            <th class="px-4 py-2 text-left font-semibold">Cliente</th>
            <th class="px-4 py-2 text-left font-semibold">Referencia</th>
            <th class="px-4 py-2 text-left font-semibold">Método</th>
            <th class="px-4 py-2 text-right font-semibold">Monto</th>
            <th class="px-4 py-2 text-right font-semibold">Registró</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="p in pagos" :key="p.id" class="hover:bg-emerald-50/40">
              <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">{{ Utils.fmtFechaHora(p.fecha) }}</td>
              <td class="px-4 py-2.5 font-medium text-slate-800">{{ p.clienteNombre }}</td>
              <td class="px-4 py-2.5 font-mono text-xs text-slate-500">{{ p.ventaId || p.nota || '—' }}</td>
              <td class="px-4 py-2.5"><badge :tipo="p.metodoPago"></badge></td>
              <td class="px-4 py-2.5 text-right font-bold tabular-nums text-emerald-700">{{ moneda }} {{ Number(p.monto).toFixed(2) }}</td>
              <td class="px-4 py-2.5 text-right text-slate-500">{{ p.usuario }}</td>
            </tr>
            <tr v-if="!pagos.length"><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-400">Aún no se registran abonos</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>

  <!-- Modal de abono -->
  <modal :abierto="abonoModal" titulo="Registrar abono de fiado" :subtitulo="clienteSel ? clienteSel.nombre + ' · saldo ' + moneda + ' ' + Number(clienteSel.saldo).toFixed(2) : ''" ancho="max-w-md" @cerrar="abonoModal = false">
    <template v-if="clienteSel">
      <div class="rounded-xl bg-blue-50 ring-1 ring-inset ring-blue-600/10 px-4 py-3 mb-4 text-sm">
        <div class="flex justify-between"><span class="text-blue-700">Saldo pendiente</span><b class="tabular-nums text-blue-900">{{ moneda }} {{ Number(clienteSel.saldo).toFixed(2) }}</b></div>
        <div v-if="clienteSel.limite > 0" class="flex justify-between mt-1"><span class="text-blue-700">Crédito disponible</span><span class="tabular-nums">{{ moneda }} {{ Number(clienteSel.disponible).toFixed(2) }}</span></div>
      </div>
      <label class="label-forma">Monto del abono</label>
      <div class="flex gap-2">
        <input v-model="form.monto" type="number" min="0" step="0.10" class="input-texto" placeholder="0.00">
        <button type="button" class="btn-secundario shrink-0" @click="abonarTotal">Saldo total</button>
      </div>
      <div class="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label class="label-forma">Forma de pago</label>
          <select v-model="form.metodoPago" class="input-texto">
            <option>Efectivo</option><option>Yape</option><option>Plin</option><option>Tarjeta</option>
          </select>
        </div>
        <div>
          <label class="label-forma">Boleta (opcional)</label>
          <select v-model="form.ventaId" class="input-texto">
            <option value="">— General —</option>
            <option v-for="v in clienteSel.ventasPendientes" :key="v.id" :value="v.id">{{ v.boleta }} ({{ moneda }} {{ Number(v.total).toFixed(2) }})</option>
          </select>
        </div>
      </div>
      <label class="label-forma mt-3">Nota</label>
      <input v-model="form.nota" type="text" class="input-texto" placeholder="Opcional: quién pagó, observación...">
      <p class="mt-3 text-[11px] text-slate-400">El abono reduce el saldo del cuaderno de fiados. Si el cliente queda en cero, sus boletas pasan a PAGADO automáticamente.</p>
    </template>
    <template #pie>
      <button type="button" class="btn-secundario" @click="abonoModal = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="confirmarAbono">
        <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <icon v-else name="check" clase="w-4 h-4"></icon> Registrar abono
      </button>
    </template>
  </modal>
</div>`
  };
})();
