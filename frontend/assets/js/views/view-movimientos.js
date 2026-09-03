/**
 * NexoERP — vista-movimientos.js
 * Historial de transacciones + registro de entradas, salidas, transferencias,
 * devoluciones y ajustes; anulación con motivo (rol gerente/admin).
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  var TIPOS = [
    { id: 'ENTRADA', label: 'Entrada', desc: 'Compra o ingreso de mercadería a un almacén', icono: 'download', tono: 'emerald' },
    { id: 'SALIDA', label: 'Salida', desc: 'Despacho, venta o consumo de stock', icono: 'movimientos', tono: 'blue' },
    { id: 'TRANSFERENCIA', label: 'Transferencia', desc: 'Movimiento entre dos almacenes', icono: 'camion', tono: 'violet' },
    { id: 'DEVOLUCION', label: 'Devolución', desc: 'Reingreso de mercadería (devolución de cliente)', icono: 'refresh', tono: 'emerald' },
    { id: 'AJUSTE_POSITIVO', label: 'Ajuste positivo', desc: 'Sobrante detectado en conteo físico', icono: 'plus', tono: 'emerald' },
    { id: 'AJUSTE_NEGATIVO', label: 'Ajuste negativo', desc: 'Merma, pérdida o faltante de inventario', icono: 'trash', tono: 'amber' }
  ];

  window.NEXO_VISTAS['movimientos'] = {
    components: { modal: NEXO_UI.Modal, 'search-select': NEXO_UI.SearchSelect },
    data: function () {
      return {
        filas: [], productos: [], almacenes: [], cargando: true,
        fTipo: '', fAlmacen: '', fDesde: '', fHasta: '', q: '',
        modalAbierto: false, guardando: false, anularFila: null, anularMotivo: '', anulando: false,
        form: this.formVacio()
      };
    },
    computed: {
      rol: function () { return AppStore.estado.usuario.rol; },
      puedeRegistrar: function () { return ['admin', 'gerente', 'operador'].includes(this.rol); },
      puedeAnular: function () { return ['admin', 'gerente'].includes(this.rol); },
      tipos: function () { return TIPOS; },
      tipoSel: function () { var self = this; return TIPOS.find(function (t) { return t.id === self.form.tipo; }) || null; },
      esEntrada: function () { return this.form.tipo && ['ENTRADA', 'DEVOLUCION', 'AJUSTE_POSITIVO'].includes(this.form.tipo); },
      esSalida: function () { return this.form.tipo && ['SALIDA', 'AJUSTE_NEGATIVO'].includes(this.form.tipo); },
      esTransf: function () { return this.form.tipo === 'TRANSFERENCIA'; },
      productoSel: function () { var f = this.form; return this.productos.find(function (p) { return p.id === f.productoId; }) || null; },
      usaLote: function () { return this.productoSel && this.productoSel.requiereLote; },
      usaSerie: function () { return this.productoSel && this.productoSel.requiereSerie; },
      filasFiltradas: function () {
        var t = this.fTipo, a = this.fAlmacen, d = this.fDesde, h = this.fHasta, q = this.q.toLowerCase();
        return this.filas.filter(function (f) {
          if (t && f.tipo !== t) return false;
          if (a && f.almacenOrigenId !== a && f.almacenDestinoId !== a) return false;
          var dia = String(f.fecha).slice(0, 10);
          if (d && dia < d) return false;
          if (h && dia > h) return false;
          if (q && ((f.id + ' ' + f.productoNombre + ' ' + f.sku + ' ' + f.documentoRef + ' ' + f.lote).toLowerCase().indexOf(q) === -1)) return false;
          return true;
        });
      },
      cols: function () {
        return [
          { k: 'fechaF', label: 'Fecha', clase: 'text-slate-500 whitespace-nowrap' },
          { k: 'id', label: 'Documento', clase: 'font-mono text-xs text-slate-600' },
          { k: 'tipo', label: 'Tipo', tipo: 'badge' },
          { k: 'productoNombre', label: 'Producto', clase: 'font-medium text-slate-800' },
          { k: 'ruta', label: 'Ruta', clase: 'text-xs text-slate-500' },
          { k: 'cantidadF', label: 'Cantidad', clase: 'text-right tabular-nums font-semibold' },
          { k: 'costoF', label: 'Costo unit.', clase: 'text-right tabular-nums text-slate-500' },
          { k: 'usuario', label: 'Usuario', clase: 'text-slate-500' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() {
      try {
        var res = await Promise.all([Api.productos({ estado: 'ACTIVO' }), Api.almacenes({})]);
        this.productos = res[0];
        this.almacenes = res[1];
      } catch (e) { /* */ }
      await this.cargar();
    },
    methods: {
      formVacio: function () {
        return { tipo: 'ENTRADA', productoId: '', cantidad: null, costoUnitario: null, lote: '', numeroSerie: '', fechaVencimiento: '', almacenOrigenId: '', almacenDestinoId: '', documentoRef: '', motivo: '', observaciones: '' };
      },
      cargar: async function () {
        this.cargando = true;
        try {
          var datos = await Api.movimientos({ limit: 300 });
          this.filas = datos.map(function (m) {
            var ruta = '';
            if (m.tipo === 'TRANSFERENCIA') ruta = (m.almacenOrigen || '—') + ' → ' + (m.almacenDestino || '—');
            else if (m.almacenOrigenId) ruta = (m.almacenOrigen || '—') + ' → fuera';
            else if (m.almacenDestinoId) ruta = 'ingreso → ' + (m.almacenDestino || '—');
            return Object.assign({}, m, {
              fechaF: Utils.fmtFechaHora(m.fecha),
              cantidadF: Utils.fmtNum(m.cantidad),
              costoF: m.costoUnitario ? Utils.fmtMoneda(m.costoUnitario) : '—',
              ruta: ruta
            });
          });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrirNuevo: function () { this.form = this.formVacio(); this.modalAbierto = true; },
      cambioTipo: function (t) {
        this.form.tipo = t;
        if (t === 'TRANSFERENCIA') { /* ambos almacenes */ }
      },
      guardar: async function () {
        var f = this.form;
        if (!f.productoId) { AppStore.toast('Seleccione un producto.', 'warning'); return; }
        if (!f.cantidad || f.cantidad <= 0) { AppStore.toast('Ingrese una cantidad válida.', 'warning'); return; }
        if (this.esEntrada && !f.almacenDestinoId) { AppStore.toast('Seleccione el almacén de destino.', 'warning'); return; }
        if (this.esSalida && !f.almacenOrigenId) { AppStore.toast('Seleccione el almacén de origen.', 'warning'); return; }
        if (this.esTransf && (!f.almacenOrigenId || !f.almacenDestinoId)) { AppStore.toast('Seleccione origen y destino.', 'warning'); return; }
        if (this.usaLote && this.esEntrada && !f.lote) { AppStore.toast('El producto exige número de lote en entradas.', 'warning'); return; }
        if (this.usaSerie && this.esEntrada && !f.numeroSerie) { AppStore.toast('El producto exige número de serie en entradas.', 'warning'); return; }
        if (f.tipo === 'AJUSTE_NEGATIVO' && !f.motivo.trim()) { AppStore.toast('Los ajustes negativos requieren un motivo.', 'warning'); return; }

        this.guardando = true;
        try {
          var res = await Api.registrarMovimiento(f);
          var detalle = res.tipo + ' ' + res.id + ' registrado · ' + Utils.fmtNum(res.cantidad) + ' × ' + res.productoNombre;
          if (res.lotesConsumidos && res.lotesConsumidos.length > 1) detalle += ' (FEFO: ' + res.lotesConsumidos.map(function (l) { return l.lote; }).join(', ') + ')';
          AppStore.toast(detalle, 'exito', 5200);
          this.modalAbierto = false;
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 6000); }
        finally { this.guardando = false; }
      },
      pedirAnulacion: function (fila) {
        this.anularFila = fila;
        this.anularMotivo = '';
      },
      anular: async function () {
        if (!this.anularMotivo.trim()) { AppStore.toast('Indique el motivo de la anulación.', 'warning'); return; }
        this.anulando = true;
        try {
          await Api.anularMovimiento(this.anularFila.id, this.anularMotivo.trim());
          AppStore.toast('Movimiento ' + this.anularFila.id + ' anulado. Stock y kardex revertidos.', 'exito', 5000);
          this.anularFila = null;
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.anulando = false; }
      }
    },
    template: `
<div>
  <page-header titulo="Movimientos de Inventario" subtitulo="Entradas, salidas, transferencias, devoluciones y ajustes — cada operación actualiza stock, lotes y kardex">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button v-if="puedeRegistrar" type="button" class="btn-primario" @click="abrirNuevo"><icon name="plus" clase="w-4 h-4"></icon> Nuevo movimiento</button>
    </template>
  </page-header>

  <!-- Filtros -->
  <div class="nexo-card mb-4 flex flex-wrap items-center gap-2">
    <div class="relative flex-1 min-w-[180px]">
      <icon name="search" clase="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
      <input v-model="q" type="search" class="input-texto pl-9" placeholder="Buscar doc, producto, lote...">
    </div>
    <select v-model="fTipo" class="input-texto w-auto min-w-[150px]">
      <option value="">Todos los tipos</option>
      <option v-for="t in tipos" :key="t.id" :value="t.id">{{ t.label }}</option>
    </select>
    <select v-model="fAlmacen" class="input-texto w-auto min-w-[140px]">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
    </select>
    <input v-model="fDesde" type="date" class="input-texto w-auto" title="Desde">
    <input v-model="fHasta" type="date" class="input-texto w-auto" title="Hasta">
  </div>

  <data-table :cols="cols" :filas="filasFiltradas" :cargando="cargando" vacio="No hay movimientos con estos filtros" :por-pagina="14">
    <template #celda-productoNombre="{ fila }">
      <div>
        <p class="font-medium text-slate-800">{{ fila.productoNombre }}</p>
        <p class="text-xs text-slate-400">{{ fila.sku }}<span v-if="fila.lote"> · Lote {{ fila.lote }}</span><span v-if="fila.documentoRef"> · Ref. {{ fila.documentoRef }}</span></p>
      </div>
    </template>
    <template #celda-estado="{ fila }">
      <div>
        <badge :tipo="fila.estado"></badge>
        <p v-if="fila.anuladoMotivo" class="text-[11px] text-rose-500 mt-0.5 max-w-[180px] truncate" :title="fila.anuladoMotivo">{{ fila.anuladoMotivo }}</p>
      </div>
    </template>
    <template #acciones="{ fila }">
      <button v-if="puedeAnular && fila.estado === 'ACTIVO'" type="button" class="btn-icono text-rose-500 hover:bg-rose-50" title="Anular movimiento" @click="pedirAnulacion(fila)">
        <icon name="x" clase="w-4 h-4"></icon>
      </button>
    </template>
  </data-table>

  <!-- Modal nuevo movimiento -->
  <modal :abierto="modalAbierto" titulo="Registrar movimiento" subtitulo="El stock, los lotes y el kardex se actualizan en el servidor" ancho="max-w-2xl" @cerrar="modalAbierto = false">
    <!-- Paso 1: tipo -->
    <p class="label-forma">1 · Tipo de movimiento</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
      <button v-for="t in tipos" :key="t.id" type="button" @click="cambioTipo(t.id)"
        class="rounded-xl ring-1 p-3 text-left transition-all"
        :class="form.tipo === t.id ? 'ring-blue-500 bg-blue-50/70 shadow-sm shadow-blue-500/10' : 'ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'">
        <icon :name="t.icono" clase="w-5 h-5 mb-1.5" :class="form.tipo === t.id ? 'text-blue-600' : 'text-slate-400'"></icon>
        <p class="text-sm font-semibold" :class="form.tipo === t.id ? 'text-blue-900' : 'text-slate-700'">{{ t.label }}</p>
        <p class="text-[11px] leading-snug mt-0.5" :class="form.tipo === t.id ? 'text-blue-600' : 'text-slate-400'">{{ t.desc }}</p>
      </button>
    </div>

    <!-- Paso 2: producto -->
    <p class="label-forma">2 · Producto</p>
    <search-select v-model="form.productoId" :opciones="productos" placeholder="Buscar producto por nombre o SKU..."></search-select>
    <div v-if="productoSel" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 ring-1 ring-slate-200">
      <span>Costo std.: <b class="text-slate-700">{{ Utils.fmtMoneda(productoSel.costoStd) }}</b></span>
      <span>Stock total: <b class="text-slate-700">{{ Utils.fmtNum(productoSel.stockTotal) }} {{ productoSel.unidad }}</b></span>
      <span v-if="productoSel.requiereLote" class="text-amber-700 font-medium">Requiere lote</span>
      <span v-if="productoSel.requiereSerie" class="text-violet-700 font-medium">Requiere serie</span>
    </div>

    <!-- Paso 3: datos -->
    <p class="label-forma mt-5">3 · Detalles del movimiento</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-forma">Cantidad *</label>
        <input v-model.number="form.cantidad" type="number" min="0.01" step="0.01" class="input-texto" placeholder="0">
      </div>
      <div v-if="esEntrada">
        <label class="label-forma">Costo unitario {{ esEntrada ? '' : '' }}</label>
        <input v-model.number="form.costoUnitario" type="number" min="0" step="0.01" class="input-texto" :placeholder="productoSel && productoSel.costoStd ? String(productoSel.costoStd) : '0.00'">
        <p class="text-[11px] text-slate-400 mt-1">Recalcula el costo promedio ponderado del almacén destino.</p>
      </div>
      <div v-if="esSalida || esTransf">
        <label class="label-forma">Almacén de origen *</label>
        <select v-model="form.almacenOrigenId" class="input-texto">
          <option value="">Seleccione...</option>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
        </select>
      </div>
      <div v-if="esEntrada || esTransf">
        <label class="label-forma">Almacén de destino *</label>
        <select v-model="form.almacenDestinoId" class="input-texto">
          <option value="">Seleccione...</option>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
        </select>
      </div>
      <div v-if="usaLote">
        <label class="label-forma">Lote {{ esEntrada ? '*' : (esSalida || esTransf ? '' : '') }}</label>
        <input v-model="form.lote" type="text" class="input-texto font-mono" :placeholder="esEntrada ? 'p. ej. L-2026-01' : 'Vacío = consume por FEFO'">
      </div>
      <div v-if="usaSerie && esEntrada">
        <label class="label-forma">Número de serie *</label>
        <input v-model="form.numeroSerie" type="text" class="input-texto font-mono" placeholder="p. ej. CAM-2026-0001">
      </div>
      <div v-if="usaLote && esEntrada">
        <label class="label-forma">Fecha de vencimiento</label>
        <input v-model="form.fechaVencimiento" type="date" class="input-texto">
      </div>
      <div>
        <label class="label-forma">Documento de referencia</label>
        <input v-model="form.documentoRef" type="text" class="input-texto font-mono" placeholder="OC-1001 / FV-2031 / TRF-...">
      </div>
      <div v-if="form.tipo === 'AJUSTE_POSITIVO' || form.tipo === 'AJUSTE_NEGATIVO' || form.tipo === 'DEVOLUCION'" class="sm:col-span-2">
        <label class="label-forma">Motivo {{ form.tipo === 'AJUSTE_NEGATIVO' ? '*' : '' }}</label>
        <input v-model="form.motivo" type="text" class="input-texto" placeholder="Explique brevemente el motivo del movimiento">
      </div>
      <div class="sm:col-span-2">
        <label class="label-forma">Observaciones</label>
        <textarea v-model="form.observaciones" rows="2" class="input-texto" placeholder="Notas adicionales (opcional)"></textarea>
      </div>
    </div>

    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">
        <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        {{ guardando ? 'Registrando...' : 'Registrar movimiento' }}
      </button>
    </template>
  </modal>

  <!-- Modal anular -->
  <modal :abierto="!!anularFila" titulo="Anular movimiento" :subtitulo="anularFila ? anularFila.id + ' · ' + anularFila.productoNombre + ' × ' + anularFila.cantidad : ''" @cerrar="anularFila = null">
    <div class="rounded-xl bg-rose-50 ring-1 ring-rose-600/20 p-3.5 text-sm text-rose-800 flex items-start gap-2.5 mb-4">
      <icon name="warning" clase="w-5 h-5 shrink-0 mt-0.5"></icon>
      <p>Se revertirá el efecto de este movimiento en el <b>stock, los lotes y el kardex</b> de los almacenes afectados. La operación queda registrada en auditoría con su usuario y motivo.</p>
    </div>
    <label class="label-forma">Motivo de anulación *</label>
    <textarea v-model="anularMotivo" rows="2" class="input-texto" placeholder="p. ej. Documento mal digitado, error de cantidad..."></textarea>
    <template #pie>
      <button type="button" class="btn-secundario" @click="anularFila = null">Cancelar</button>
      <button type="button" class="btn-peligro" :disabled="anulando" @click="anular">
        <span v-if="anulando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        {{ anulando ? 'Anulando...' : 'Anular movimiento' }}
      </button>
    </template>
  </modal>
</div>`
  };
})();
