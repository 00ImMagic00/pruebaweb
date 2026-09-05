/**
 * NexoERP — vista-comprobantes.js (Adenda 1.6)
 * Facturación electrónica SUNAT: estado de comprobantes, envío por
 * API/manual, notas de crédito, libro de ventas y resumen diario.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['comprobantes'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      return {
        filas: [], cargando: true, q: '', filtroEstado: '', filtroTipo: '',
        sunatModo: 'desactivado', series: [],
        modalNota: false, modalEstado: false, modalJson: false,
        formNota: { ventaId: '', tipo: '07', motivo: 'ANULACIÓN DE LA OPERACIÓN', devolverStock: true, anularVenta: true },
        formEstado: { id: '', estado: 'ACEPTADO', cdrCodigo: '', cdrDescripcion: '', observaciones: '' },
        jsonVer: null, guardando: false
      };
    },
    computed: {
      puedeEditar: function () { return ['admin', 'gerente'].indexOf(AppStore.estado.usuario.rol) !== -1; },
      modoApi: function () { return this.sunatModo === 'api'; },
      modoManual: function () { return this.sunatModo === 'manual'; },
      cols: function () {
        return [
          { k: 'fechaF', label: 'Fecha', clase: 'font-mono text-xs text-slate-500' },
          { k: 'tipoNombre', label: 'Tipo', clase: 'font-medium text-slate-800' },
          { k: 'numero', label: 'Número', clase: 'font-mono text-xs font-semibold text-blue-700' },
          { k: 'clienteNombre', label: 'Cliente', clase: 'text-slate-600' },
          { k: 'clienteDocNumero', label: 'Documento', clase: 'font-mono text-xs text-slate-400' },
          { k: 'totalF', label: 'Total', clase: 'text-right tabular-nums font-semibold' },
          { k: 'estado', label: 'Estado SUNAT', tipo: 'badge' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([
            Api.comprobantes({ q: this.q, estado: this.filtroEstado, tipo: this.filtroTipo }),
            Api.configGet(), Api.comprobantesSeries()
          ]);
          this.filas = res[0].map(function (f) {
            return Object.assign({}, f, {
              fechaF: String(f.fecha || '').replace('T', ' ').slice(0, 16),
              totalF: Number(f.total || 0).toFixed(2)
            });
          });
          this.sunatModo = (res[1] && res[1].SUNAT_MODO) || 'desactivado';
          this.series = res[2];
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrirNota: function () {
        this.formNota = { ventaId: '', tipo: '07', motivo: 'ANULACIÓN DE LA OPERACIÓN', devolverStock: true, anularVenta: true };
        this.modalNota = true;
      },
      emitirNota: async function () {
        if (!this.formNota.ventaId.trim()) { AppStore.toast('Indique el ID o número de la venta (p. ej. V-0001).', 'warning'); return; }
        this.guardando = true;
        try {
          var res = await Api.crearNotaCredito(this.formNota);
          AppStore.toast(res.tipo + ' ' + res.numero + ' emitida' + (res.devolvioStock ? ' con devolución de stock' : '') + '.', 'exito', 6000);
          (res.avisos || []).forEach(function (a) { AppStore.toast(a, 'warning', 6000); });
          this.modalNota = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 6000); }
        finally { this.guardando = false; }
      },
      enviar: async function (f) {
        this.guardando = true;
        try {
          if (this.modoApi && !f.apiDocId) await Api.comprobanteCrearApi(f.id);
          var res = await Api.comprobanteEnviar(f.id);
          AppStore.toast('SUNAT: ' + res.estado + (res.cdrDescripcion ? ' — ' + res.cdrDescripcion : ''), res.estado === 'ACEPTADO' ? 'exito' : 'warning', 7000);
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 7000); }
        finally { this.guardando = false; }
      },
      abrirEstado: function (f) {
        this.formEstado = { id: f.id, estado: f.estado === 'ACEPTADO' ? 'ACEPTADO' : 'ACEPTADO', cdrCodigo: f.cdrCodigo || '', cdrDescripcion: f.cdrDescripcion || '', observaciones: f.observaciones || '' };
        this.modalEstado = true;
      },
      guardarEstado: async function () {
        this.guardando = true;
        try {
          await Api.comprobanteEstado(this.formEstado.id, this.formEstado.estado, this.formEstado.cdrCodigo, this.formEstado.cdrDescripcion, this.formEstado.observaciones);
          AppStore.toast('Estado actualizado: ' + this.formEstado.estado, 'exito');
          this.modalEstado = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      verJson: async function (f) {
        try {
          var res = await Api.comprobanteJson(f.id);
          this.jsonVer = { numero: res.numero, texto: JSON.stringify(res.payload, null, 2) };
          this.modalJson = true;
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      copiarJson: function () {
        if (!this.jsonVer) return;
        var self = this;
        navigator.clipboard.writeText(this.jsonVer.texto).then(function () {
          AppStore.toast('JSON copiado. Péguelo en el API/Postman (POST ' + '/api/v1/boletas' + ').', 'exito', 6000);
        }).catch(function () { AppStore.toast('No se pudo copiar automáticamente.', 'error'); });
      },
      descargarTxt: function (contenido, nombre) {
        var blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      },
      libro: async function (formato) {
        var mes = prompt('Mes del libro de ventas (YYYY-MM):', new Date().toISOString().slice(0, 7));
        if (!mes) return;
        try {
          var res = await Api.libroVentas(mes, formato);
          this.descargarTxt(res.contenido, res.nombreArchivo || ('libro_ventas_' + mes + '.' + formato.toLowerCase()));
          AppStore.toast('Libro de ventas ' + mes + ' generado (' + res.filas + ' filas).', 'exito');
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      rdd: async function () {
        var fecha = prompt('Fecha del resumen diario (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
        if (!fecha) return;
        try {
          var res = await Api.resumenDiario(fecha);
          AppStore.toast('Resumen diario enviado: ' + res.boletas + ' boletas.', 'exito', 6000);
        } catch (e) { AppStore.toast(e.message, 'error', 7000); }
      }
    },
    template: `
<div>
  <page-header titulo="Comprobantes SUNAT" :subtitulo="'Modo actual: ' + sunatModo.toUpperCase() + ' · Series B001/F001 configurables en Ajustes'">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button v-if="puedeEditar" type="button" class="btn-secundario" @click="libro('CSV')"><icon name="reportes" clase="w-4 h-4"></icon> <span class="hidden sm:inline">Libro CSV</span></button>
      <button v-if="puedeEditar" type="button" class="btn-secundario" @click="libro('PLE')"><icon name="reportes" clase="w-4 h-4"></icon> <span class="hidden sm:inline">PLE 8.1</span></button>
      <button v-if="puedeEditar && modoApi" type="button" class="btn-secundario" @click="rdd"><icon name="movimientos" clase="w-4 h-4"></icon> <span class="hidden sm:inline">Resumen diario</span></button>
      <button v-if="puedeEditar" type="button" class="btn-primario" @click="abrirNota"><icon name="plus" clase="w-4 h-4"></icon> Nota C/D</button>
    </template>
  </page-header>

  <div v-if="sunatModo === 'desactivado'" class="rounded-lg bg-amber-50 ring-1 ring-amber-200 text-amber-800 text-sm px-4 py-3 mb-4">
    La facturación electrónica está <b>desactivada</b>. Actívela en <b>Configuración → Facturación SUNAT</b>: elija modo
    <b>manual</b> (series + JSON para el API de facturación) o <b>api</b> (envío automático). Ver README para desplegar el API (Laravel/Greenter).
  </div>

  <div class="flex items-center gap-2 mb-3 flex-wrap">
    <input v-model="q" type="text" class="input-texto w-auto flex-1 min-w-[180px] py-1.5" placeholder="Buscar por número, cliente o documento..." @input="cargar">
    <select v-model="filtroEstado" class="input-texto w-auto py-1.5" @change="cargar">
      <option value="">Todos los estados</option>
      <option value="PENDIENTE">PENDIENTE</option><option value="CREADO_API">CREADO_API</option>
      <option value="ENVIADO">ENVIADO</option><option value="ACEPTADO">ACEPTADO</option>
      <option value="RECHAZADO">RECHAZADO</option><option value="ERROR">ERROR</option>
    </select>
    <select v-model="filtroTipo" class="input-texto w-auto py-1.5" @change="cargar">
      <option value="">Todos los tipos</option>
      <option value="01">Facturas</option><option value="03">Boletas</option>
      <option value="07">Notas de crédito</option><option value="08">Notas de débito</option>
    </select>
  </div>

  <data-table :cols="cols" :filas="filas" :cargando="cargando" vacio="Sin comprobantes. Se generan automáticamente al vender (si SUNAT_MODO != desactivado)" :por-pagina="12">
    <template #acciones="{ fila }">
      <div class="inline-flex items-center gap-1">
        <button type="button" class="btn-icono" title="Ver JSON para el API" @click="verJson(fila)"><icon name="cotizaciones" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar && modoApi && fila.apiDocId && ['PENDIENTE','CREADO_API','ERROR'].indexOf(fila.estado) !== -1" type="button" class="btn-icono" title="Enviar a SUNAT" @click="enviar(fila)"><icon name="movimientos" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar" type="button" class="btn-icono" title="Actualizar estado (CDR)" @click="abrirEstado(fila)"><icon name="edit" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <!-- Modal Nota de crédito/débito -->
  <modal :abierto="modalNota" titulo="Emitir Nota de Crédito / Débito" @cerrar="modalNota = false">
    <form class="space-y-4" @submit.prevent="emitirNota">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Tipo *</label>
          <select v-model="formNota.tipo" class="input-texto">
            <option value="07">Nota de Crédito (devolución/anulación)</option>
            <option value="08">Nota de Débito (cargo adicional)</option>
          </select>
        </div>
        <div>
          <label class="label-forma">Venta de origen *</label>
          <input v-model="formNota.ventaId" type="text" class="input-texto font-mono" placeholder="V-0001" required>
        </div>
      </div>
      <div>
        <label class="label-forma">Motivo (SUNAT)</label>
        <input v-model="formNota.motivo" type="text" class="input-texto" placeholder="ANULACIÓN DE LA OPERACIÓN">
      </div>
      <label v-if="formNota.tipo === '07'" class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="formNota.devolverStock" type="checkbox" class="rounded"> Devolver el stock al almacén (y descontar fiado si aplicaba)
      </label>
      <label v-if="formNota.tipo === '07'" class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="formNota.anularVenta" type="checkbox" class="rounded"> Marcar la venta original como ANULADA
      </label>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalNota = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="emitirNota">{{ guardando ? 'Emitiendo...' : 'Emitir nota' }}</button>
    </template>
  </modal>

  <!-- Modal estado CDR -->
  <modal :abierto="modalEstado" titulo="Actualizar estado SUNAT (CDR)" @cerrar="modalEstado = false">
    <form class="space-y-4" @submit.prevent="guardarEstado">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Estado</label>
          <select v-model="formEstado.estado" class="input-texto">
            <option>ACEPTADO</option><option>RECHAZADO</option><option>ENVIADO</option><option>PENDIENTE</option>
          </select>
        </div>
        <div>
          <label class="label-forma">Código CDR</label>
          <input v-model="formEstado.cdrCodigo" type="text" class="input-texto font-mono" placeholder="0 = aceptado">
        </div>
      </div>
      <div>
        <label class="label-forma">Descripción del CDR</label>
        <input v-model="formEstado.cdrDescripcion" type="text" class="input-texto" placeholder="La DRE/CDR ha sido aceptada...">
      </div>
      <div>
        <label class="label-forma">Observaciones</label>
        <input v-model="formEstado.observaciones" type="text" class="input-texto">
      </div>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalEstado = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardarEstado">Guardar</button>
    </template>
  </modal>

  <!-- Modal JSON -->
  <modal :abierto="modalJson" :titulo="'Payload ' + (jsonVer ? jsonVer.numero : '')" ancho="max-w-2xl" @cerrar="modalJson = false">
    <p class="text-xs text-slate-500 mb-2">Envíe este JSON al API de facturación: <code class="font-mono">POST https://su-api/api/v1/boletas</code> (o /invoices para facturas) con el token de <code class="font-mono">/api/auth/login</code>.</p>
    <pre class="bg-slate-900 text-emerald-200 text-[11px] rounded-lg p-3 overflow-x-auto max-h-96 nexo-scroll">{{ jsonVer ? jsonVer.texto : '' }}</pre>
    <template #pie>
      <button type="button" class="btn-secundario" @click="copiarJson">Copiar JSON</button>
      <button type="button" class="btn-primario" @click="modalJson = false">Cerrar</button>
    </template>
  </modal>
</div>`
  };
})();
