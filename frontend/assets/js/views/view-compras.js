/**
 * NexoERP — vista-compras.js (Adenda 1.6)
 * Órdenes de compra con comparador de proveedores, recepción parcial
 * con ingreso real al kardex y cuentas por pagar.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['compras'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      return {
        filas: [], proveedores: [], productos: [], almacenes: [], categorias: [],
        cargando: true, guardando: false, pestana: 'oc',
        cxp: [],
        modalNueva: false, modalDetalle: false, modalRecepcion: false, modalCxp: false,
        form: { id: '', proveedorId: '', fechaEsperada: '', condicionPago: 'CONTADO', diasCredito: 30, observaciones: '', items: [] },
        detalle: null, recepcion: { almacenId: '', items: [] },
        cxpSel: null, cxpPago: { monto: '', metodoPago: 'Efectivo' },
        oferta: { proveedorNombre: '', costoTotal: '', plazoDias: 7, comentario: '' }
      };
    },
    computed: {
      puedeEditar: function () { return ['admin', 'gerente', 'operador'].indexOf(AppStore.estado.usuario.rol) !== -1; },
      puedeCerrar: function () { return ['admin', 'gerente'].indexOf(AppStore.estado.usuario.rol) !== -1; },
      moneda: function () { return (AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'; },
      totalForm: function () { return this.form.items.reduce(function (t, i) { return t + (parseFloat(i.cantidad) || 0) * (parseFloat(i.costoUnit) || 0); }, 0); },
      cols: function () {
        return [
          { k: 'fechaF', label: 'Fecha', clase: 'font-mono text-xs text-slate-500' },
          { k: 'numero', label: 'N° OC', clase: 'font-mono text-xs font-semibold text-blue-700' },
          { k: 'proveedorNombre', label: 'Proveedor', clase: 'font-medium text-slate-800' },
          { k: 'condicionPago', label: 'Condición', clase: 'text-slate-500' },
          { k: 'totalF', label: 'Total', clase: 'text-right tabular-nums font-semibold' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      },
      colsCxp: function () {
        return [
          { k: 'fechaVenc', label: 'Vence', clase: 'font-mono text-xs text-slate-500' },
          { k: 'numero', label: 'OC', clase: 'font-mono text-xs font-semibold text-blue-700' },
          { k: 'proveedorNombre', label: 'Proveedor', clase: 'font-medium text-slate-800' },
          { k: 'montoF', label: 'Monto', clase: 'text-right tabular-nums' },
          { k: 'saldoF', label: 'Saldo', clase: 'text-right tabular-nums font-semibold text-rose-600' },
          { k: 'diasVencidoF', label: 'Días vencido', clase: 'text-right tabular-nums' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([Api.ocList({}), Api.proveedores(), Api.productos({ estado: 'ACTIVO' }), Api.almacenes({ estado: 'ACTIVO' }), Api.cxpList({})]);
          this.filas = res[0].map(function (o) {
            return Object.assign({}, o, {
              fechaF: String(o.fecha || '').slice(0, 10),
              totalF: Number(o.total || 0).toFixed(2)
            });
          });
          this.proveedores = res[1]; this.productos = res[2]; this.almacenes = res[3];
          this.cxp = res[4].map(function (x) {
            return Object.assign({}, x, {
              montoF: Number(x.monto || 0).toFixed(2), saldoF: Number(x.saldo || 0).toFixed(2),
              diasVencidoF: x.estado === 'PENDIENTE' ? String(x.diasVencido || 0) : '—'
            });
          });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      nuevaOc: function () {
        this.form = { id: '', proveedorId: '', fechaEsperada: '', condicionPago: 'CONTADO', diasCredito: 30, observaciones: '', items: [] };
        this.addItem();
        this.modalNueva = true;
      },
      addItem: function () { this.form.items.push({ productoId: '', cantidad: '', costoUnit: '' }); },
      quitarItem: function (i) { this.form.items.splice(i, 1); },
      productoDe: function (id) { var f = null; this.productos.forEach(function (p) { if (p.id === id) f = p; }); return f; },
      sugerirCosto: function (i) {
        var p = this.productoDe(i.productoId);
        if (p && !i.costoUnit) i.costoUnit = p.costoStd;
      },
      guardarOc: async function () {
        if (!this.form.proveedorId) { AppStore.toast('Seleccione el proveedor.', 'warning'); return; }
        var items = this.form.items.filter(function (i) { return i.productoId && parseFloat(i.cantidad) > 0; });
        if (!items.length) { AppStore.toast('Agregue al menos un producto con cantidad.', 'warning'); return; }
        this.guardando = true;
        try {
          var f = Object.assign({}, this.form, { items: items });
          await Api.ocSave(f);
          AppStore.toast('Orden de compra guardada.', 'exito');
          this.modalNueva = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 6000); }
        finally { this.guardando = false; }
      },
      verDetalle: async function (o) {
        try {
          this.detalle = await Api.ocGet(o.id);
          this.modalDetalle = true;
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      cambiarEstado: async function (o, estado) {
        var ok = await AppStore.confirmar({ titulo: 'Cambiar estado de OC', mensaje: '¿Poner la OC ' + o.numero + ' en ' + estado + '?', okLabel: 'Sí, cambiar' });
        if (!ok) return;
        try { await Api.ocEstado(o.id, estado); AppStore.toast('OC ' + o.numero + ' → ' + estado, 'exito'); this.cargar(); this.modalDetalle = false; }
        catch (e) { AppStore.toast(e.message, 'error', 6000); }
      },
      abrirRecepcion: function (o) {
        var self = this;
        Api.ocGet(o.id).then(function (det) {
          self.detalle = det;
          self.recepcion = { almacenId: (AppStore.estado.cfg && AppStore.estado.cfg.ALMACEN_RECEPCION) || '', items: det.items.map(function (i) {
            return { itemId: i.id, sku: i.sku, descripcion: i.descripcion, pendiente: i.cantidadPedida - i.cantidadRecibida, cantidad: '', costoUnit: i.costoUnit, lote: '', fechaVencimiento: '' };
          }) };
          self.modalRecepcion = true;
        }).catch(function (e) { AppStore.toast(e.message, 'error'); });
      },
      guardarRecepcion: async function () {
        var items = this.recepcion.items.filter(function (i) { return parseFloat(i.cantidad) > 0; });
        if (!items.length) { AppStore.toast('Ingrese cantidades recibidas.', 'warning'); return; }
        if (!this.recepcion.almacenId) { AppStore.toast('Seleccione el almacén de recepción.', 'warning'); return; }
        this.guardando = true;
        try {
          var res = await Api.ocRecepcionar({ ocId: this.detalle.id, almacenId: this.recepcion.almacenId, items: items });
          AppStore.toast('Recepción registrada. OC ' + res.numero + ' → ' + res.estado, 'exito', 6000);
          this.modalRecepcion = false; this.modalDetalle = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 7000); }
        finally { this.guardando = false; }
      },
      agregarOferta: async function () {
        if (!this.oferta.proveedorNombre.trim() || !(parseFloat(this.oferta.costoTotal) > 0)) { AppStore.toast('Complete proveedor y costo total de la oferta.', 'warning'); return; }
        try {
          await Api.ocOfertaAgregar(Object.assign({ ocId: this.detalle.id }, this.oferta));
          AppStore.toast('Oferta agregada al comparador.', 'exito');
          this.detalle = await Api.ocGet(this.detalle.id);
          this.oferta = { proveedorNombre: '', costoTotal: '', plazoDias: 7, comentario: '' };
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      elegirOferta: async function (o, ajustar) {
        try {
          var res = await Api.ocOfertaElegir({ ocId: this.detalle.id, ofertaId: o.id, ajustarCostos: ajustar });
          AppStore.toast('Oferta elegida: ' + res.elegida + (ajustar ? ' (costos ajustados)' : ''), 'exito');
          this.detalle = await Api.ocGet(this.detalle.id);
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      abrirCxp: function (x) {
        this.cxpSel = x;
        this.cxpPago = { monto: String(x.saldo), metodoPago: 'Efectivo' };
        this.modalCxp = true;
      },
      pagarCxp: async function () {
        if (!(parseFloat(this.cxpPago.monto) > 0)) { AppStore.toast('Monto inválido.', 'warning'); return; }
        this.guardando = true;
        try {
          await Api.cxpPago({ id: this.cxpSel.id, monto: this.cxpPago.monto, metodoPago: this.cxpPago.metodoPago });
          AppStore.toast('Pago registrado. El egreso se refleja en el flujo de caja.', 'exito', 6000);
          this.modalCxp = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 6000); }
        finally { this.guardando = false; }
      }
    },
    template: `
<div>
  <page-header titulo="Órdenes de Compra" subtitulo="Comprar mejor: comparador de proveedores, recepción con kardex y cuentas por pagar">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button v-if="puedeEditar" type="button" class="btn-primario" @click="nuevaOc"><icon name="plus" clase="w-4 h-4"></icon> Nueva OC</button>
    </template>
  </page-header>

  <div class="flex gap-1 mb-3 bg-slate-200/60 rounded-lg p-1 w-fit">
    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium" :class="pestana === 'oc' ? 'bg-white shadow text-blue-700' : 'text-slate-600'" @click="pestana = 'oc'">Órdenes ({{ filas.length }})</button>
    <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium" :class="pestana === 'cxp' ? 'bg-white shadow text-blue-700' : 'text-slate-600'" @click="pestana = 'cxp'">Cuentas por pagar ({{ cxp.filter(function(x){return x.estado==='PENDIENTE';}).length }})</button>
  </div>

  <data-table v-if="pestana === 'oc'" :cols="cols" :filas="filas" :cargando="cargando" vacio="Sin órdenes de compra" :por-pagina="10">
    <template #acciones="{ fila }">
      <div class="inline-flex items-center gap-1">
        <button type="button" class="btn-icono" title="Ver detalle / comparador" @click="verDetalle(fila)"><icon name="cotizaciones" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar && ['BORRADOR','ENVIADA','PARCIAL'].indexOf(fila.estado) !== -1" type="button" class="btn-icono text-emerald-600 hover:bg-emerald-50" title="Recepcionar" @click="abrirRecepcion(fila)"><icon name="cajas" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <data-table v-if="pestana === 'cxp'" :cols="colsCxp" :filas="cxp" :cargando="cargando" vacio="Sin cuentas por pagar" :por-pagina="10">
    <template #acciones="{ fila }">
      <button v-if="puedeCerrar && fila.estado === 'PENDIENTE'" type="button" class="btn-icono text-blue-600 hover:bg-blue-50" title="Registrar pago" @click="abrirCxp(fila)"><icon name="dinero" clase="w-4 h-4"></icon></button>
    </template>
  </data-table>

  <!-- Modal nueva OC -->
  <modal :abierto="modalNueva" titulo="Nueva orden de compra" ancho="max-w-3xl" @cerrar="modalNueva = false">
    <form class="space-y-4" @submit.prevent="guardarOc">
      <div class="grid sm:grid-cols-3 gap-4">
        <div>
          <label class="label-forma">Proveedor *</label>
          <select v-model="form.proveedorId" class="input-texto" required>
            <option value="">— elegir —</option>
            <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.razonSocial }}</option>
          </select>
        </div>
        <div>
          <label class="label-forma">Condición</label>
          <select v-model="form.condicionPago" class="input-texto">
            <option value="CONTADO">Contado</option>
            <option value="CREDITO">Crédito (CxP)</option>
          </select>
        </div>
        <div v-if="form.condicionPago === 'CREDITO'">
          <label class="label-forma">Días de crédito</label>
          <input v-model="form.diasCredito" type="number" min="1" class="input-texto">
        </div>
      </div>
      <div class="border-t border-slate-100 pt-3">
        <div v-for="(i, idx) in form.items" :key="idx" class="grid grid-cols-12 gap-2 mb-2 items-end">
          <div class="col-span-6">
            <label v-if="idx === 0" class="label-forma text-xs">Producto</label>
            <select v-model="i.productoId" class="input-texto py-1.5" @change="sugerirCosto(i)">
              <option value="">— elegir —</option>
              <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.sku }} — {{ p.nombre }}</option>
            </select>
          </div>
          <div class="col-span-2">
            <label v-if="idx === 0" class="label-forma text-xs">Cantidad</label>
            <input v-model="i.cantidad" type="number" min="0" step="0.01" class="input-texto py-1.5">
          </div>
          <div class="col-span-3">
            <label v-if="idx === 0" class="label-forma text-xs">Costo unitario</label>
            <input v-model="i.costoUnit" type="number" min="0" step="0.0001" class="input-texto py-1.5">
          </div>
          <div class="col-span-1">
            <button type="button" class="btn-icono text-rose-500" @click="quitarItem(idx)"><icon name="trash" clase="w-4 h-4"></icon></button>
          </div>
        </div>
        <button type="button" class="btn-secundario py-1.5 text-xs" @click="addItem"><icon name="plus" clase="w-3.5 h-3.5"></icon> Agregar producto</button>
        <p class="text-right text-sm font-semibold text-slate-700 mt-2">Subtotal: {{ moneda }} {{ totalForm.toFixed(2) }} <span class="text-xs font-normal text-slate-400">(+ impuesto)</span></p>
      </div>
      <div>
        <label class="label-forma">Observaciones</label>
        <input v-model="form.observaciones" type="text" class="input-texto">
      </div>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalNueva = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardarOc">{{ guardando ? 'Guardando...' : 'Guardar OC' }}</button>
    </template>
  </modal>

  <!-- Modal detalle OC + comparador -->
  <modal :abierto="modalDetalle" :titulo="detalle ? 'OC ' + detalle.numero : 'OC'" ancho="max-w-3xl" @cerrar="modalDetalle = false">
    <div v-if="detalle">
      <div class="flex flex-wrap items-center gap-3 text-sm mb-3">
        <span class="font-semibold text-slate-800">{{ detalle.proveedorNombre }}</span>
        <badge :tipo="detalle.estado"></badge>
        <span class="text-slate-500">Total: <b class="text-slate-800">{{ moneda }} {{ detalle.total.toFixed(2) }}</b></span>
        <span class="text-slate-500">{{ detalle.condicionPago }}<template v-if="detalle.condicionPago === 'CREDITO'"> {{ detalle.diasCredito }}d</template></span>
      </div>
      <table class="w-full text-sm mb-4">
        <thead><tr class="text-left text-xs uppercase text-slate-400 border-b border-slate-100">
          <th class="py-1.5">Producto</th><th class="py-1.5 text-right">Pedida</th><th class="py-1.5 text-right">Recibida</th><th class="py-1.5 text-right">Costo</th>
        </tr></thead>
        <tbody>
          <tr v-for="i in detalle.items" :key="i.id" class="border-b border-slate-50 last:border-0">
            <td class="py-1.5">{{ i.sku }} — {{ i.descripcion }}</td>
            <td class="py-1.5 text-right tabular-nums">{{ i.cantidadPedida }}</td>
            <td class="py-1.5 text-right tabular-nums" :class="i.cantidadRecibida >= i.cantidadPedida ? 'text-emerald-600 font-semibold' : ''">{{ i.cantidadRecibida }}</td>
            <td class="py-1.5 text-right tabular-nums">{{ i.costoUnit.toFixed(4) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex gap-2 flex-wrap mb-4" v-if="puedeEditar">
        <button v-if="detalle.estado === 'BORRADOR'" type="button" class="btn-secundario" @click="cambiarEstado(detalle, 'ENVIADA')">Marcar enviada al proveedor</button>
        <button v-if="['BORRADOR','ENVIADA','PARCIAL'].indexOf(detalle.estado) !== -1" type="button" class="btn-secundario text-emerald-700" @click="abrirRecepcion(detalle)"><icon name="cajas" clase="w-4 h-4"></icon> Recepcionar</button>
        <button v-if="puedeCerrar && ['RECIBIDA','PARCIAL'].indexOf(detalle.estado) !== -1" type="button" class="btn-secundario" @click="cambiarEstado(detalle, 'CERRADA')">Cerrar OC</button>
        <button v-if="puedeCerrar && ['BORRADOR','ENVIADA'].indexOf(detalle.estado) !== -1" type="button" class="btn-secundario text-rose-600" @click="cambiarEstado(detalle, 'ANULADA')">Anular</button>
      </div>

      <div class="border-t border-slate-100 pt-3">
        <p class="text-sm font-bold text-slate-800 mb-2">Comparador de cotizaciones de proveedores</p>
        <div v-for="o in (detalle.ofertas || [])" :key="o.id" class="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
          <div>
            <span class="font-medium text-slate-700">{{ o.proveedorNombre }}</span>
            <span v-if="o.elegida" class="ml-2 text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">elegida</span>
            <span class="text-xs text-slate-400 ml-2">{{ o.plazoDias }} días {{ o.comentario ? '· ' + o.comentario : '' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="tabular-nums font-semibold">{{ moneda }} {{ o.costoTotal.toFixed(2) }}</span>
            <button v-if="puedeEditar && !o.elegida" type="button" class="text-xs font-medium text-blue-600 hover:underline" @click="elegirOferta(o, false)">elegir</button>
            <button v-if="puedeEditar && !o.elegida" type="button" class="text-xs font-medium text-slate-500 hover:underline" @click="elegirOferta(o, true)">elegir y ajustar costos</button>
          </div>
        </div>
        <div v-if="puedeEditar" class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 items-end">
          <input v-model="oferta.proveedorNombre" type="text" class="input-texto py-1.5 col-span-2" placeholder="Proveedor de la oferta">
          <input v-model="oferta.costoTotal" type="number" min="0" step="0.01" class="input-texto py-1.5" placeholder="Costo total">
          <input v-model="oferta.plazoDias" type="number" min="0" class="input-texto py-1.5" placeholder="Días">
          <button type="button" class="btn-secundario py-1.5" @click="agregarOferta">Agregar</button>
        </div>
      </div>
    </div>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalDetalle = false">Cerrar</button>
    </template>
  </modal>

  <!-- Modal recepción -->
  <modal :abierto="modalRecepcion" :titulo="'Recepción — OC ' + (detalle ? detalle.numero : '')" ancho="max-w-3xl" @cerrar="modalRecepcion = false">
    <div class="space-y-4" v-if="detalle">
      <div>
        <label class="label-forma">Almacén que recibe *</label>
        <select v-model="recepcion.almacenId" class="input-texto">
          <option value="">— elegir —</option>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
        </select>
      </div>
      <div v-for="i in recepcion.items" :key="i.itemId" class="grid grid-cols-12 gap-2 items-end border-b border-slate-50 pb-2">
        <div class="col-span-6">
          <p class="text-sm font-medium text-slate-700">{{ i.sku }} — {{ i.descripcion }}</p>
          <p class="text-xs text-slate-400">Pendiente: {{ i.pendiente }}</p>
        </div>
        <div class="col-span-2">
          <label class="label-forma text-xs">Recibe</label>
          <input v-model="i.cantidad" type="number" :max="i.pendiente" min="0" step="0.01" class="input-texto py-1.5">
        </div>
        <div class="col-span-2">
          <label class="label-forma text-xs">Costo unit.</label>
          <input v-model="i.costoUnit" type="number" min="0" step="0.0001" class="input-texto py-1.5">
        </div>
        <div class="col-span-2">
          <label class="label-forma text-xs">Lote (si aplica)</label>
          <input v-model="i.lote" type="text" class="input-texto py-1.5">
        </div>
      </div>
    </div>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalRecepcion = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardarRecepcion">{{ guardando ? 'Registrando...' : 'Registrar recepción' }}</button>
    </template>
  </modal>

  <!-- Modal pago CxP -->
  <modal :abierto="modalCxp" titulo="Registrar pago a proveedor" @cerrar="modalCxp = false">
    <div v-if="cxpSel" class="space-y-4">
      <p class="text-sm text-slate-600">{{ cxpSel.numero }} — {{ cxpSel.proveedorNombre }} · Saldo: <b>{{ moneda }} {{ cxpSel.saldoF }}</b></p>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Monto a pagar</label>
          <input v-model="cxpPago.monto" type="number" min="0" step="0.01" class="input-texto">
        </div>
        <div>
          <label class="label-forma">Medio de pago</label>
          <select v-model="cxpPago.metodoPago" class="input-texto">
            <option>Efectivo</option><option>Yape</option><option>Plin</option><option>Tarjeta</option>
          </select>
        </div>
      </div>
      <p class="text-xs text-slate-400">El pago se registra como gasto "Pagos a proveedores" y descuenta del efectivo en el cuadre de caja.</p>
    </div>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalCxp = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="pagarCxp">{{ guardando ? 'Pagando...' : 'Registrar pago' }}</button>
    </template>
  </modal>
</div>`
  };
})();
