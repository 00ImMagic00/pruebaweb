/**
 * NexoERP — vista-gastos.js (Adenda 1.6)
 * Gastos del negocio, categorías, flujo de caja y presupuesto.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['gastos'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      var mesActual = new Date().toISOString().slice(0, 7);
      return {
        filas: [], categorias: [], cargando: true, guardando: false,
        mes: mesActual, modalAbierto: false, modalCat: false,
        form: this.formVacio(), formCat: { id: '', nombre: '', tipo: 'COSTO_VARIABLE' },
        flujo: null, presupuesto: null, pestana: 'gastos',
        formPresu: { categoria: '', monto: '' }
      };
    },
    computed: {
      puedeEditar: function () { return ['admin', 'gerente'].indexOf(AppStore.estado.usuario.rol) !== -1; },
      moneda: function () { return (this.estCfg && this.estCfg.MONEDA_SIMBOLO) || 'S/'; },
      estCfg: function () { return AppStore.estado.cfg || {}; },
      totalMes: function () { return this.filas.reduce(function (t, g) { return t + g.monto; }, 0); },
      cols: function () {
        var self = this;
        return [
          { k: 'dia', label: 'Fecha', clase: 'font-mono text-xs text-slate-500' },
          { k: 'categoria', label: 'Categoría', clase: 'font-medium text-slate-800' },
          { k: 'descripcion', label: 'Descripción', clase: 'text-slate-500' },
          { k: 'numeroDoc', label: 'Doc.', clase: 'font-mono text-xs text-slate-400' },
          { k: 'metodoPago', label: 'Medio', clase: 'text-slate-500' },
          { k: 'montoF', label: 'Monto', clase: 'text-right tabular-nums font-semibold text-slate-800' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      formVacio: function () { return { id: '', fecha: new Date().toISOString().slice(0, 10), categoria: '', descripcion: '', monto: '', metodoPago: 'Efectivo', numeroDoc: '' }; },
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([
            Api.gastos({ mes: this.mes }), Api.gastosCategorias(),
            Api.finanzasResumen(this.mes), Api.presupuestoResumen(this.mes)
          ]);
          this.filas = res[0].map(function (g) { return Object.assign({}, g, { montoF: g.monto.toFixed(2) }); });
          this.categorias = res[1];
          this.flujo = res[2];
          this.presupuesto = res[3];
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrirNuevo: function () { this.form = this.formVacio(); this.modalAbierto = true; },
      guardar: async function () {
        if (!this.form.categoria) { AppStore.toast('Seleccione la categoría del gasto.', 'warning'); return; }
        if (!(parseFloat(this.form.monto) > 0)) { AppStore.toast('Ingrese un monto mayor a cero.', 'warning'); return; }
        this.guardando = true;
        try {
          await Api.registrarGasto(this.form);
          AppStore.toast('Gasto registrado.', 'exito');
          this.modalAbierto = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      anular: async function (g) {
        var ok = await AppStore.confirmar({ titulo: 'Anular gasto', mensaje: '¿Anular "' + g.categoria + ' — ' + g.descripcion + '" por ' + g.montoF + '?', okLabel: 'Anular', peligro: true });
        if (!ok) return;
        try { await Api.anularGasto(g.id); AppStore.toast('Gasto anulado.', 'exito'); this.cargar(); }
        catch (e) { AppStore.toast(e.message, 'error'); }
      },
      guardarCategoria: async function () {
        if (!this.formCat.nombre.trim()) { AppStore.toast('Nombre de categoría requerido.', 'warning'); return; }
        try {
          await Api.guardarGastoCategoria(this.formCat);
          AppStore.toast('Categoría guardada.', 'exito');
          this.formCat = { id: '', nombre: '', tipo: 'COSTO_VARIABLE' };
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      guardarPresupuesto: async function () {
        if (!this.formPresu.categoria || !(parseFloat(this.formPresu.monto) >= 0)) { AppStore.toast('Complete categoría y monto.', 'warning'); return; }
        try {
          await Api.presupuestoSave({ mes: this.mes, categoria: this.formPresu.categoria, monto: this.formPresu.monto });
          AppStore.toast('Presupuesto guardado.', 'exito');
          this.formPresu = { categoria: '', monto: '' };
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      }
    },
    template: `
<div>
  <page-header titulo="Gastos y Flujo de Caja" subtitulo="Egresos del negocio por categoría · ingresos vs. egresos · punto de equilibrio">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button v-if="puedeEditar" type="button" class="btn-secundario" @click="modalCat = true"><icon name="etiqueta" clase="w-4 h-4"></icon> <span class="hidden sm:inline">Categorías</span></button>
      <button v-if="puedeEditar" type="button" class="btn-primario" @click="abrirNuevo"><icon name="plus" clase="w-4 h-4"></icon> Registrar gasto</button>
    </template>
  </page-header>

  <!-- KPIs de flujo de caja -->
  <div v-if="flujo" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    <kpi-card label="Ingresos del mes" :valor="moneda + ' ' + (flujo.totalIngresos || 0).toFixed(2)" icono="dinero" tono="emerald"></kpi-card>
    <kpi-card label="Egresos del mes" :valor="moneda + ' ' + (flujo.totalEgresos || 0).toFixed(2)" icono="dinero" tono="rose"></kpi-card>
    <kpi-card label="Saldo (flujo de caja)" :valor="moneda + ' ' + (flujo.saldo || 0).toFixed(2)" icono="dashboard" :tono="(flujo.saldo || 0) >= 0 ? 'blue' : 'rose'"></kpi-card>
    <kpi-card v-if="presupuesto" label="Punto de equilibrio" :valor="moneda + ' ' + (presupuesto.puntoEquilibrio || 0).toFixed(0)" icono="reportes" tono="slate"></kpi-card>
  </div>

  <div class="flex items-center gap-2 mb-3 flex-wrap">
    <input v-model="mes" type="month" class="input-texto w-auto py-1.5" @change="cargar">
    <span class="text-xs text-slate-400">Total gastos del mes: <b class="text-slate-700">{{ moneda }} {{ totalMes.toFixed(2) }}</b></span>
  </div>

  <data-table :cols="cols" :filas="filas" :cargando="cargando" vacio="Sin gastos registrados este mes" :por-pagina="10">
    <template #acciones="{ fila }">
      <button v-if="puedeEditar && fila.estado === 'ACTIVO'" type="button" class="btn-icono text-rose-500 hover:bg-rose-50" title="Anular" @click="anular(fila)"><icon name="trash" clase="w-4 h-4"></icon></button>
    </template>
  </data-table>

  <!-- Detalle de ingresos por método -->
  <div v-if="flujo" class="grid md:grid-cols-2 gap-4 mt-4">
    <div class="bg-white rounded-xl ring-1 ring-slate-200 p-4">
      <p class="text-sm font-bold text-slate-800 mb-3">Ingresos por método</p>
      <div v-for="(v, k) in flujo.ingresosPorMetodo" :key="k" class="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
        <span class="text-slate-600">{{ k }}</span><span class="font-semibold tabular-nums">{{ moneda }} {{ v.toFixed(2) }}</span>
      </div>
      <p v-if="!Object.keys(flujo.ingresosPorMetodo).length" class="text-sm text-slate-400">Sin ingresos registrados.</p>
    </div>
    <div class="bg-white rounded-xl ring-1 ring-slate-200 p-4">
      <p class="text-sm font-bold text-slate-800 mb-3">Egresos por categoría</p>
      <div v-for="(v, k) in flujo.egresosPorCategoria" :key="k" class="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
        <span class="text-slate-600">{{ k }}</span><span class="font-semibold tabular-nums text-rose-600">{{ moneda }} {{ v.toFixed(2) }}</span>
      </div>
      <p v-if="!Object.keys(flujo.egresosPorCategoria).length" class="text-sm text-slate-400">Sin egresos registrados.</p>
    </div>
  </div>

  <!-- Presupuesto vs real -->
  <div v-if="presupuesto && presupuesto.filas.length" class="bg-white rounded-xl ring-1 ring-slate-200 p-4 mt-4">
    <p class="text-sm font-bold text-slate-800 mb-3">Presupuesto vs. real ({{ presupuesto.mes }}) · Resultado: {{ moneda }} {{ (presupuesto.resultado || 0).toFixed(2) }}</p>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs uppercase text-slate-400 border-b border-slate-100">
          <th class="py-1.5 pr-3">Categoría</th><th class="py-1.5 pr-3 text-right">Presupuesto</th><th class="py-1.5 pr-3 text-right">Real</th><th class="py-1.5 text-right">Desvío</th>
        </tr></thead>
        <tbody>
          <tr v-for="f in presupuesto.filas" :key="f.categoria" class="border-b border-slate-50 last:border-0">
            <td class="py-1.5 pr-3 text-slate-700">{{ f.categoria }}</td>
            <td class="py-1.5 pr-3 text-right tabular-nums">{{ f.presupuesto.toFixed(2) }}</td>
            <td class="py-1.5 pr-3 text-right tabular-nums">{{ f.real.toFixed(2) }}</td>
            <td class="py-1.5 text-right tabular-nums" :class="f.desvio > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600'">{{ f.desvio.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="puedeEditar" class="flex gap-2 mt-3 items-end">
      <div>
        <label class="label-forma text-xs">Categoría</label>
        <select v-model="formPresu.categoria" class="input-texto py-1.5">
          <option value="">— elegir —</option>
          <option v-for="c in categorias" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="label-forma text-xs">Monto presupuestado</label>
        <input v-model="formPresu.monto" type="number" min="0" step="0.01" class="input-texto py-1.5 w-36">
      </div>
      <button type="button" class="btn-secundario py-1.5" @click="guardarPresupuesto">Guardar presupuesto</button>
    </div>
  </div>

  <!-- Modal nuevo gasto -->
  <modal :abierto="modalAbierto" titulo="Registrar gasto" @cerrar="modalAbierto = false">
    <form class="space-y-4" @submit.prevent="guardar">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Fecha *</label>
          <input v-model="form.fecha" type="date" class="input-texto" required>
        </div>
        <div>
          <label class="label-forma">Categoría *</label>
          <select v-model="form.categoria" class="input-texto" required>
            <option value="">— elegir —</option>
            <option v-for="c in categorias" :key="c.id" :value="c.nombre">{{ c.nombre }} ({{ c.tipo === 'COSTO_FIJO' ? 'fijo' : 'variable' }})</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Monto *</label>
          <input v-model="form.monto" type="number" min="0" step="0.01" class="input-texto" required>
        </div>
        <div>
          <label class="label-forma">Medio de pago</label>
          <select v-model="form.metodoPago" class="input-texto">
            <option>Efectivo</option><option>Yape</option><option>Plin</option><option>Tarjeta</option>
          </select>
        </div>
      </div>
      <div>
        <label class="label-forma">Descripción</label>
        <input v-model="form.descripcion" type="text" class="input-texto" placeholder="p. ej. Recibo de luz septiembre">
      </div>
      <div>
        <label class="label-forma">N° de documento (recibo/factura)</label>
        <input v-model="form.numeroDoc" type="text" class="input-texto font-mono">
      </div>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando...' : 'Registrar' }}</button>
    </template>
  </modal>

  <!-- Modal categorías -->
  <modal :abierto="modalCat" titulo="Categorías de gasto" @cerrar="modalCat = false">
    <div class="space-y-2 mb-4">
      <div v-for="c in categorias" :key="c.id" class="flex items-center justify-between text-sm border-b border-slate-50 pb-1.5">
        <span class="font-medium text-slate-700">{{ c.nombre }}</span>
        <span class="text-xs text-slate-400">{{ c.tipo === 'COSTO_FIJO' ? 'Costo fijo' : 'Costo variable' }}</span>
      </div>
    </div>
    <div class="border-t border-slate-100 pt-4 grid grid-cols-3 gap-2 items-end">
      <div class="col-span-2">
        <label class="label-forma text-xs">Nueva categoría</label>
        <input v-model="formCat.nombre" type="text" class="input-texto py-1.5">
      </div>
      <div>
        <label class="label-forma text-xs">Tipo</label>
        <select v-model="formCat.tipo" class="input-texto py-1.5"><option>COSTO_FIJO</option><option>COSTO_VARIABLE</option></select>
      </div>
      <button type="button" class="btn-primario py-1.5 col-span-3" @click="guardarCategoria">Agregar categoría</button>
    </div>
  </modal>
</div>`
  };
})();
