/**
 * NexoERP — vista-rrhh.js (Adenda 1.6)
 * RRHH básico: marcación de asistencia, comisiones de vendedores
 * y configuración de porcentajes.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['rrhh'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      return {
        pestana: 'comisiones',
        vendedores: [], asistencia: [], usuarios: [], almacenes: [],
        mes: new Date().toISOString().slice(0, 7),
        desde: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
        hasta: new Date().toISOString().slice(0, 10),
        comisiones: null, asistenciaEstado: null,
        cargando: true, guardando: false
      };
    },
    computed: {
      moneda: function () { return (AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'; },
      puedeEditar: function () { return ['admin', 'gerente'].indexOf(AppStore.estado.usuario.rol) !== -1; },
      colsAsis: function () {
        return [
          { k: 'fecha', label: 'Fecha', clase: 'font-mono text-xs text-slate-500' },
          { k: 'usuario', label: 'Usuario', clase: 'font-medium text-slate-800' },
          { k: 'entradaF', label: 'Entrada', clase: 'font-mono text-xs text-slate-600' },
          { k: 'salidaF', label: 'Salida', clase: 'font-mono text-xs text-slate-600' },
          { k: 'horasF', label: 'Horas', clase: 'text-right tabular-nums' },
          { k: 'nota', label: 'Nota', clase: 'text-slate-400' }
        ];
      }
    },
    async mounted() {
      try { this.asistenciaEstado = await Api.rrhhAsistenciaEstado(); } catch (e) { this.asistenciaEstado = null; }
      await this.cargar();
    },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([Api.rrhhVendedores(), Api.rrhhComisiones(this.mes), Api.rrhhAsistencia({ desde: this.desde, hasta: this.hasta })]);
          this.vendedores = res[0];
          this.comisiones = res[1];
          this.asistencia = res[2].map(function (a) {
            return Object.assign({}, a, {
              entradaF: String(a.entrada || '').slice(11, 16) || '—',
              salidaF: String(a.salida || '').slice(11, 16) || '—',
              horasF: a.minutos ? (a.minutos / 60).toFixed(1) : '—'
            });
          });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      marcar: async function (tipo) {
        try {
          var res = await Api.rrhhMarcar(tipo);
          AppStore.toast(tipo === 'ENTRADA' ? 'Entrada registrada: ' + res.entrada : 'Salida registrada: ' + res.salida + ' (' + (res.minutos / 60).toFixed(1) + ' h)', 'exito');
          this.asistenciaEstado = await Api.rrhhAsistenciaEstado();
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      guardarComision: async function (v) {
        this.guardando = true;
        try {
          await Api.rrhhGuardarVendedor({ usuarioId: v.usuarioId, comisionPct: v.comisionPct });
          AppStore.toast('Comisión de ' + v.nombre + ' guardada (' + v.comisionPct + '%).', 'exito');
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      }
    },
    template: `
<div>
  <page-header titulo="RRHH y Comisiones" subtitulo="Marcación de asistencia · comisiones por ventas del personal">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button type="button" class="btn-primario" :disabled="asistenciaEstado && asistenciaEstado.marcado && !asistenciaEstado.salida && asistenciaEstado.entrada" @click="marcar(asistenciaEstado && asistenciaEstado.entrada && !asistenciaEstado.salida ? 'SALIDA' : 'ENTRADA')">
        <icon name="usuarios" clase="w-4 h-4"></icon>
        {{ asistenciaEstado && asistenciaEstado.entrada && !asistenciaEstado.salida ? 'Marcar salida' : 'Marcar entrada' }}
      </button>
    </template>
  </page-header>

  <div v-if="asistenciaEstado && asistenciaEstado.marcado" class="text-sm text-slate-600 bg-white ring-1 ring-slate-200 rounded-lg px-4 py-2.5 mb-4">
    Hoy: entrada <b class="font-mono">{{ asistenciaEstado.entrada.slice(11, 16) }}</b>
    <template v-if="asistenciaEstado.salida"> · salida <b class="font-mono">{{ asistenciaEstado.salida.slice(11, 16) }}</b></template>
    <template v-else> · <span class="text-emerald-600 font-medium">en turno</span></template>
  </div>

  <div class="flex gap-1 mb-3 bg-slate-200/60 rounded-lg p-1 w-fit">
    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium" :class="pestana === 'comisiones' ? 'bg-white shadow text-blue-700' : 'text-slate-600'" @click="pestana = 'comisiones'">Comisiones</button>
    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium" :class="pestana === 'asistencia' ? 'bg-white shadow text-blue-700' : 'text-slate-600'" @click="pestana = 'asistencia'">Asistencia</button>
  </div>

  <!-- Comisiones -->
  <div v-if="pestana === 'comisiones'">
    <div class="flex items-center gap-2 mb-3">
      <input v-model="mes" type="month" class="input-texto w-auto py-1.5" @change="cargar">
      <span v-if="comisiones" class="text-xs text-slate-400">Total comisiones del mes: <b class="text-slate-700">{{ moneda }} {{ (comisiones.totalComisiones || 0).toFixed(2) }}</b></span>
    </div>
    <div class="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs uppercase text-slate-400 border-b border-slate-100 bg-slate-50">
          <th class="px-4 py-2.5">Vendedor</th>
          <th class="px-4 py-2.5 text-right">Ventas del mes</th>
          <th class="px-4 py-2.5 text-right">N° ventas</th>
          <th class="px-4 py-2.5 text-center">Comisión %</th>
          <th class="px-4 py-2.5 text-right">Comisión</th>
        </tr></thead>
        <tbody>
          <tr v-for="f in (comisiones ? comisiones.filas : [])" :key="f.usuario" class="border-b border-slate-50 last:border-0">
            <td class="px-4 py-2.5"><span class="font-medium text-slate-800">{{ f.nombre }}</span> <span class="text-xs text-slate-400">@{{ f.usuario }}</span></td>
            <td class="px-4 py-2.5 text-right tabular-nums font-semibold">{{ moneda }} {{ f.ventas.toFixed(2) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums text-slate-500">{{ f.nVentas }}</td>
            <td class="px-4 py-2.5 text-center">
              <input v-model.number="f.comisionPct" type="number" min="0" max="100" step="0.5" class="input-texto py-1 w-20 text-center" :disabled="!puedeEditar">
            </td>
            <td class="px-4 py-2.5 text-right tabular-nums">
              <span class="font-semibold text-emerald-600 mr-2">{{ moneda }} {{ f.comision.toFixed(2) }}</span>
              <button v-if="puedeEditar" type="button" class="text-xs font-medium text-blue-600 hover:underline" @click="guardarComision(f)">guardar</button>
            </td>
          </tr>
          <tr v-if="!comisiones || !comisiones.filas.length"><td colspan="5" class="px-4 py-6 text-center text-slate-400">Sin ventas registradas este mes.</td></tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-slate-400 mt-2">Las comisiones se calculan sobre las ventas EMITIDAS del mes según el vendedor asignado en el POS (o el usuario que vendió).</p>
  </div>

  <!-- Asistencia -->
  <div v-if="pestana === 'asistencia'">
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <input v-model="desde" type="date" class="input-texto w-auto py-1.5" @change="cargar">
      <span class="text-xs text-slate-400">a</span>
      <input v-model="hasta" type="date" class="input-texto w-auto py-1.5" @change="cargar">
    </div>
    <data-table :cols="colsAsis" :filas="asistencia" :cargando="cargando" vacio="Sin marcaciones en el rango elegido" :por-pagina="12"></data-table>
  </div>
</div>`
  };
})();
