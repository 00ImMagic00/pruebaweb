/**
 * NexoERP — vista-panel.js  (ADENDA 1.3, roles admin/gerente)
 * Panel de control interno: KPIs de la operación, alertas de anomalías
 * (anulaciones, autorizaciones, ventas fuera de horario, diferencias de
 * caja, fiados vencidos, stock crítico) y auditoría reciente.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['panel'] = {
    data: function () {
      return { datos: null, cargando: true };
    },
    computed: {
      kpis: function () { return this.datos ? this.datos.kpis : {}; },
      moneda: function () { return this.datos ? this.datos.moneda : 'S/'; },
      alertas: function () { return this.datos ? this.datos.alertas : []; },
      alertasAltas: function () { return this.alertas.filter(function (a) { return a.severidad === 'alta'; }).length; },
      auditoria: function () { return this.datos ? this.datos.auditoria : []; }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try { this.datos = await Api.panelControl(); }
        catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      irA: function (r) { AppStore.irA(r); },
      iconoAlerta: function (tipo) {
        return { ANULACION: 'x', AUTORIZACION: 'autorizar', HORARIO: 'fiados', FIADO: 'dinero', CAJA: 'cajas', STOCK: 'stock' }[tipo] || 'warning';
      },
      claseAlerta: function (sev) {
        return sev === 'alta' ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
          : sev === 'media' ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
          : 'bg-blue-50 text-blue-700 ring-blue-600/20';
      }
    },
    template: `
<div>
  <page-header titulo="Panel de Control Interno" subtitulo="Vigilancia de la operación: anomalías del día y del mes, fiados vencidos y trazabilidad reciente">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="irA('auditoria')"><icon name="auditoria" clase="w-4 h-4"></icon> Auditoría completa</button>
      <button type="button" class="btn-primario" @click="cargar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar
      </button>
    </template>
  </page-header>

  <div v-if="cargando && !datos" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div v-for="i in 8" :key="i" class="nexo-card h-24 animate-pulse bg-slate-200/60"></div>
  </div>

  <template v-else>
    <!-- KPIs de control -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <kpi-card label="Ventas de hoy" :valor="moneda + ' ' + Utils.fmtNum(kpis.ventasHoyTotal, 2)" icono="pos" tono="blue" :detalle="kpis.ventasHoyN + ' boleta(s)'"></kpi-card>
      <kpi-card label="Ingresos del mes" :valor="moneda + ' ' + Utils.fmtNum(kpis.ingresosMes, 2)" icono="dinero" tono="emerald" :detalle="kpis.ventasMes + ' venta(s) vigente(s)'"></kpi-card>
      <kpi-card label="Fiado por cobrar" :valor="moneda + ' ' + Utils.fmtNum(kpis.fiadoPendiente, 2)" icono="fiados" :tono="kpis.fiadoCriticos ? 'rose' : 'amber'" :detalle="kpis.fiadoClientes + ' cliente(s) · ' + kpis.fiadoCriticos + ' vencido(s)'"></kpi-card>
      <kpi-card label="Alertas de control" :valor="String(alertas.length)" icono="warning" :tono="alertasAltas ? 'rose' : 'amber'" :detalle="alertasAltas + ' de severidad alta'"></kpi-card>
      <kpi-card label="Anulaciones del mes" :valor="String(kpis.anuladasMes)" icono="x" tono="rose"></kpi-card>
      <kpi-card label="Ventas fuera de horario" :valor="String(kpis.fueraHorarioMes)" icono="fiados" tono="amber"></kpi-card>
      <kpi-card label="Diferencias de caja (30d)" :valor="String(kpis.diferenciasCaja)" icono="cajas" :tono="kpis.diferenciasCaja ? 'rose' : 'emerald'"></kpi-card>
      <kpi-card label="Descuentos del mes" :valor="moneda + ' ' + Utils.fmtNum(kpis.descuentosMes, 2)" icono="etiqueta" tono="violet" :detalle="kpis.cotizacionesVigentes + ' cotización(es) vigente(s)'"></kpi-card>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
      <!-- Alertas -->
      <div class="nexo-card p-0 overflow-hidden xl:col-span-2">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :class="alertasAltas ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'"></span>
            Alertas de anomalías
          </h3>
          <span class="text-xs text-slate-400">Generado: {{ Utils.fmtFechaHora(datos.generado) }}</span>
        </div>
        <div class="divide-y divide-slate-100 max-h-[430px] overflow-y-auto nexo-scroll">
          <div v-for="(a, i) in alertas" :key="i" class="px-4 py-2.5 flex items-start gap-3">
            <span class="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset shrink-0" :class="claseAlerta(a.severidad)">
              {{ a.severidad === 'alta' ? 'Alta' : a.severidad === 'media' ? 'Media' : 'Info' }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-slate-700">{{ a.texto }}</p>
              <p v-if="a.fecha" class="text-[11px] text-slate-400">{{ Utils.fmtFechaHora(a.fecha) }}</p>
            </div>
            <icon :name="iconoAlerta(a.tipo)" clase="w-4 h-4 text-slate-300 shrink-0 mt-0.5"></icon>
          </div>
          <div v-if="!alertas.length" class="px-4 py-14 text-center">
            <icon name="check" clase="w-12 h-12 mx-auto text-emerald-400"></icon>
            <p class="text-sm text-slate-500 mt-3">Sin anomalías detectadas. Operación limpia ✓</p>
          </div>
        </div>
      </div>

      <!-- Auditoría reciente + accesos -->
      <div class="space-y-4">
        <div class="nexo-card p-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100"><h3 class="font-semibold text-slate-800 text-sm">Actividad reciente</h3></div>
          <div class="divide-y divide-slate-100">
            <div v-for="(a, i) in auditoria" :key="i" class="px-4 py-2">
              <p class="text-xs text-slate-700"><b>{{ a.usuario }}</b> — {{ a.detalle }}</p>
              <p class="text-[10px] text-slate-400">{{ Utils.fmtFechaHora(a.fecha) }} · {{ a.accion }}</p>
            </div>
            <p v-if="!auditoria.length" class="px-4 py-8 text-center text-sm text-slate-400">Sin actividad registrada</p>
          </div>
        </div>

        <div class="nexo-card">
          <h3 class="font-semibold text-slate-800 text-sm mb-3">Accesos rápidos</h3>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-secundario justify-center" @click="irA('fiados')"><icon name="fiados" clase="w-4 h-4"></icon> Fiados</button>
            <button type="button" class="btn-secundario justify-center" @click="irA('ventas')"><icon name="boleta" clase="w-4 h-4"></icon> Ventas</button>
            <button type="button" class="btn-secundario justify-center" @click="irA('caja')"><icon name="dinero" clase="w-4 h-4"></icon> Caja</button>
            <button type="button" class="btn-secundario justify-center" @click="irA('alertas')"><icon name="warning" clase="w-4 h-4"></icon> Alertas stock</button>
            <button type="button" class="btn-secundario justify-center" @click="irA('usuarios')"><icon name="usuarios" clase="w-4 h-4"></icon> Usuarios</button>
            <button type="button" class="btn-secundario justify-center" @click="irA('rentabilidad')"><icon name="reportes" clase="w-4 h-4"></icon> Rentabilidad</button>
          </div>
          <div class="mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2.5 text-[11px] text-slate-500 leading-relaxed">
            {{ kpis.productosCriticos }} producto(s) en stock crítico · {{ kpis.usuariosActivos }} usuario(s) activo(s) en el sistema.
          </div>
        </div>
      </div>
    </div>
  </template>
</div>`
  };
})();
