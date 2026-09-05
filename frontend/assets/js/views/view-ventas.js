/**
 * NexoERP — vista-ventas.js (ADENDA)
 * Historial de ventas con filtros, reimpresión de la boleta y
 * anulación (admin/gerente) con reversión automática de stock.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['ventas'] = {
    data: function () {
      var hoy = Utils.hoyISO();
      var mes = hoy.slice(0, 8) + '01';
      return {
        filas: [], cargando: true,
        filtros: { fechaDesde: mes, fechaHasta: hoy, estado: '', metodoPago: '', q: '' },
        modalAbierto: false, ventaSel: null, detalleSel: [], empresaSel: null,
        anulando: false,
        /* Adenda 1.6: notas de crédito/débito y guía de remisión */
        modalNota: false, formNota: { ventaId: '', tipo: '07', motivo: 'ANULACIÓN DE LA OPERACIÓN', devolverStock: true, anularVenta: true }, guardandoNota: false,
        modalGuia: false, guiaVenta: null, guiaNumero: '',
        /* Adenda 1.3/1.4: WhatsApp con imagen */
        waModal: false, waTelefono: '', waVenta: null, waDetalle: [], waEnviando: false
      };
    },
    computed: {
      moneda: function () { return (AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'; },
      puedeAnular: function () {
        var rol = AppStore.estado.usuario ? AppStore.estado.usuario.rol : '';
        return ['admin', 'gerente'].indexOf(rol) !== -1;
      },
      totalFiltrado: function () {
        var t = 0;
        this.filas.forEach(function (f) { if (f.estado === 'EMITIDA') t += f.total; });
        return t;
      },
      totalDescuentos: function () {
        var t = 0;
        this.filas.forEach(function (f) { if (f.estado === 'EMITIDA') t += Number(f.descuentoTotal || 0); });
        return t;
      },
      conAutorizadas: function () {
        return this.filas.filter(function (f) { return f.estado === 'EMITIDA' && f.autorizadoPor; }).length;
      },
      cols: function () {
        return [
          { k: 'boleta', label: 'Comprobante' },
          { k: 'fecha', label: 'Fecha' },
          { k: 'clienteNombre', label: 'Cliente' },
          { k: 'metodoPago', label: 'Pago' },
          { k: 'total', label: 'Total', clase: 'text-right' },
          { k: 'usuario', label: 'Vendedor' },
          { k: 'estadoPago', label: 'Cobro' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          this.filas = await Api.ventas(this.filtros);
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      limpiarFiltros: function () {
        var hoy = Utils.hoyISO();
        this.filtros = { fechaDesde: '', fechaHasta: hoy, estado: '', metodoPago: '', q: '' };
        this.cargar();
      },
      verBoleta: async function (f) {
        try {
          var res = await Api.venta(f.id);
          this.ventaSel = res.venta;
          this.detalleSel = res.detalle;
          this.empresaSel = res.empresa;
          this.modalAbierto = true;
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      imprimir: function () { window.print(); },

      /* ---------- Adenda 1.6: nota de crédito/débito y guía ---------- */
      abrirNotaPara: function (f) {
        this.formNota = { ventaId: f.id, tipo: '07', motivo: 'ANULACIÓN DE LA OPERACIÓN', devolverStock: true, anularVenta: true };
        this.modalNota = true;
      },
      emitirNota: async function () {
        this.guardandoNota = true;
        try {
          var res = await Api.crearNotaCredito(this.formNota);
          AppStore.toast(res.tipo + ' ' + res.numero + ' emitida correctamente.', 'exito', 7000);
          (res.avisos || []).forEach(function (a) { AppStore.toast(a, 'warning', 7000); });
          this.modalNota = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error', 7000); }
        finally { this.guardandoNota = false; }
      },
      abrirGuia: function (f) {
        this.guiaVenta = f;
        this.guiaNumero = f.guiaRemision || '';
        this.modalGuia = true;
      },
      guardarGuia: async function () {
        try {
          await Api.asignarGuia(this.guiaVenta.id, this.guiaNumero);
          AppStore.toast('Guía de remisión asignada.', 'exito');
          this.modalGuia = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },

      /* ---------- Adenda 1.3/1.4: WhatsApp (envía la IMAGEN de la boleta) ---------- */
      whatsappVenta: async function (f) {
        try {
          var res = await Api.venta(f.id);
          this.waVenta = res.venta;
          this.waDetalle = res.detalle;
          this.empresaSel = res.empresa;
          this.waTelefono = res.venta.clienteTelefono || '';
          this.waModal = true;
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      empresaWa: function () {
        return this.empresaSel || { razonSocial: (AppStore.estado.cfg || {}).RAZON_SOCIAL || (AppStore.estado.cfg || {}).NOMBRE_EMPRESA, ruc: (AppStore.estado.cfg || {}).RUC, mensajeBoleta: (AppStore.estado.cfg || {}).MENSAJE_BOLETA, moneda: this.moneda };
      },
      confirmarWhatsapp: async function () {
        var tel = Utils.normalizarTelefono(this.waTelefono);
        if (!tel || tel.length < 11) { AppStore.toast('Ingrese un número de WhatsApp válido (9 dígitos).', 'warning'); return; }
        this.waEnviando = true;
        try {
          var canvas = await NexoDocs.boletaCanvas(this.waVenta, this.waDetalle, this.empresaWa());
          var dataURL = canvas.toDataURL('image/png');
          var mensaje = Utils.mensajeWhatsapp(this.waVenta, this.waDetalle, this.empresaWa());
          var modo = await NexoDocs.enviarArchivoWhatsapp({
            telefono: tel,
            mensaje: mensaje,
            nombre: NexoDocs.boletaNombreArchivo(this.waVenta),
            blob: dataURL
          });
          this.waModal = false;
          if (modo === 'cancelado') return;
          if (modo === 'share') {
            AppStore.toast('Boleta ' + this.waVenta.boleta + ' compartida como imagen.', 'exito');
          } else {
            AppStore.toast('Imagen descargada: adjúntela en el chat de WhatsApp que se abrió.', 'exito');
          }
          var self = this;
          Api.marcarWhatsapp(this.waVenta.id, tel).then(function () {
            self.cargar();
          }).catch(function (e) { AppStore.toast(e.message, 'warning'); });
        } catch (e) {
          AppStore.toast('No se pudo generar la imagen: ' + e.message, 'error');
        } finally { this.waEnviando = false; }
      },
      descargarImagenWa: async function () {
        try {
          var canvas = await NexoDocs.boletaCanvas(this.waVenta, this.waDetalle, this.empresaWa());
          NexoDocs.descargarArchivo(NexoDocs.boletaNombreArchivo(this.waVenta), NexoDocs.dataURLaBlob(canvas.toDataURL('image/png')));
          AppStore.toast('Imagen de la boleta descargada.', 'exito');
        } catch (e) { AppStore.toast('No se pudo generar la imagen: ' + e.message, 'error'); }
      },

      anular: async function (f) {
        if (!this.puedeAnular) return;
        var motivo = prompt('Motivo de la anulación de la boleta ' + f.boleta + ':\n(el stock se devolverá automáticamente al almacén de venta)');
        if (motivo === null) return;
        if (!String(motivo).trim()) { AppStore.toast('Debe indicar un motivo.', 'warning'); return; }
        this.anulando = true;
        try {
          await Api.anularVenta(f.id, String(motivo).trim());
          AppStore.toast('Boleta ' + f.boleta + ' anulada. Stock devuelto al almacén.', 'exito');
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.anulando = false; }
      },
      exportar: function () {
        Utils.descargarCSV('ventas.csv', [
          { label: 'Boleta', k: 'boleta' }, { label: 'Fecha', k: 'fecha' },
          { label: 'Cliente', k: 'clienteNombre' }, { label: 'Documento', k: 'clienteDocNumero' },
          { label: 'MetodoPago', k: 'metodoPago' }, { label: 'Descuentos', k: 'descuentoTotal' },
          { label: 'AutorizadoPor', k: 'autorizadoPor' },
          { label: 'Subtotal', k: 'subtotal' },
          { label: 'IGV', k: 'igv' }, { label: 'Total', k: 'total' },
          { label: 'Vendedor', k: 'usuario' }, { label: 'Estado', k: 'estado' }
        ], this.filas);
      }
    },
    template: `
<div>
  <page-header titulo="Ventas y Boletas" subtitulo="Comprobantes emitidos por el POS · reimprímelos o anúlalos con reversión de stock">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="exportar"><icon name="download" clase="w-4 h-4"></icon> Exportar CSV</button>
      <button type="button" class="btn-primario" @click="cargar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar
      </button>
    </template>
  </page-header>

  <div class="nexo-card mb-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      <div><label class="label-forma">Desde</label><input v-model="filtros.fechaDesde" type="date" class="input-texto"></div>
      <div><label class="label-forma">Hasta</label><input v-model="filtros.fechaHasta" type="date" class="input-texto"></div>
      <div><label class="label-forma">Estado</label>
        <select v-model="filtros.estado" class="input-texto"><option value="">Todas</option><option value="EMITIDA">Emitidas</option><option value="ANULADA">Anuladas</option></select>
      </div>
      <div><label class="label-forma">Método de pago</label>
        <select v-model="filtros.metodoPago" class="input-texto"><option value="">Todos</option><option>Efectivo</option><option>Yape</option><option>Plin</option><option>Tarjeta</option><option>Fiado</option><option>Credito</option></select>
      </div>
      <div class="lg:col-span-1"><label class="label-forma">Buscar</label><input v-model="filtros.q" type="text" class="input-texto" placeholder="Boleta / cliente" @keyup.enter="cargar"></div>
      <div class="flex gap-2">
        <button type="button" class="btn-primario flex-1 justify-center" @click="cargar"><icon name="search" clase="w-4 h-4"></icon> Filtrar</button>
        <button type="button" class="btn-secundario" @click="limpiarFiltros" title="Limpiar filtros"><icon name="x" clase="w-4 h-4"></icon></button>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
    <kpi-card label="Comprobantes listados" :valor="String(filas.length)" icono="boleta" tono="blue"></kpi-card>
    <kpi-card label="Total emitido (vigente)" :valor="moneda + ' ' + Utils.fmtNum(totalFiltrado, 2)" icono="dinero" tono="emerald" detalle="Excluye ventas anuladas"></kpi-card>
    <kpi-card label="Descuentos y regalos" :valor="moneda + ' ' + Utils.fmtNum(totalDescuentos, 2)" icono="etiqueta" tono="amber" :detalle="conAutorizadas + ' venta(s) con autorización de gerente'"></kpi-card>
    <kpi-card label="Anuladas" :valor="String(filas.filter(function(f){return f.estado==='ANULADA';}).length)" icono="warning" tono="rose"></kpi-card>
  </div>

  <data-table :cols="cols" :filas="filas" :cargando="cargando" vacio="No hay ventas para los filtros aplicados">
    <template #celda-boleta="{ fila }"><span class="font-mono font-semibold text-blue-700">{{ fila.compNumero || fila.boleta }}</span><span v-if="fila.tipoComprobante" class="block text-[10px] text-slate-400">{{ fila.tipoComprobante }}</span></template>
    <template #celda-fecha="{ fila }"><span class="text-slate-500">{{ Utils.fmtFechaHora(fila.fecha) }}</span></template>
    <template #celda-clienteNombre="{ fila }">
      <span class="text-slate-800">{{ fila.clienteNombre }}</span>
      <span class="block text-[11px] text-slate-400">{{ fila.clienteDocTipo }} {{ fila.clienteDocNumero }}</span>
    </template>
    <template #celda-metodoPago="{ fila }"><badge :tipo="fila.metodoPago"></badge></template>
    <template #celda-total="{ fila }"><span class="font-bold tabular-nums">{{ moneda }} {{ Number(fila.total).toFixed(2) }}</span></template>
    <template #celda-estadoPago="{ fila }">
      <badge :tipo="fila.estado === 'ANULADA' ? 'ANULADA' : (fila.estadoPago === 'FIADO' ? 'FIADO' : fila.estadoPago === 'CREDITO' ? 'CREDITO' : 'PAGADO')"></badge>
      <span v-if="fila.enviadoWhatsapp === 'Sí'" class="block text-[10px] text-emerald-600 font-semibold" title="Enviada por WhatsApp">✓ WhatsApp</span>
    </template>
    <template #acciones="{ fila }">
      <div class="flex items-center justify-end gap-0.5">
        <button v-if="fila.estado === 'EMITIDA'" type="button" class="btn-icono !text-emerald-600 hover:!bg-emerald-50" title="Enviar boleta por WhatsApp" @click="whatsappVenta(fila)"><icon name="whatsapp" clase="w-4 h-4"></icon></button>
        <button type="button" class="btn-icono" title="Ver / reimprimir boleta" @click="verBoleta(fila)"><icon name="boleta" clase="w-4 h-4"></icon></button>
        <button v-if="puedeAnular && fila.estado === 'EMITIDA'" type="button" class="btn-icono" title="Asignar guía de remisión" @click="abrirGuia(fila)"><icon name="cajas" clase="w-4 h-4"></icon></button>
        <button v-if="puedeAnular && fila.estado === 'EMITIDA'" type="button" class="btn-icono !text-amber-600 hover:!bg-amber-50" title="Emitir Nota de Crédito / Débito" @click="abrirNotaPara(fila)"><icon name="movimientos" clase="w-4 h-4"></icon></button>
        <button v-if="puedeAnular && fila.estado === 'EMITIDA'" type="button" class="btn-icono text-rose-500 hover:text-rose-700" title="Anular venta" :disabled="anulando" @click="anular(fila)"><icon name="trash" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <modal :abierto="modalAbierto" titulo="Boleta de Venta" :subtitulo="ventaSel ? ventaSel.boleta + ' · ' + Utils.fmtFechaHora(ventaSel.fecha) : ''" ancho="max-w-md" @cerrar="modalAbierto = false">
    <venta-boleta v-if="ventaSel" :venta="ventaSel" :detalle="detalleSel" :empresa="empresaSel"></venta-boleta>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cerrar</button>
      <button v-if="ventaSel && ventaSel.estado === 'EMITIDA'" type="button" class="btn-secundario !text-emerald-700" @click="whatsappVenta(ventaSel)"><icon name="whatsapp" clase="w-4 h-4 text-emerald-600"></icon> WhatsApp</button>
      <button type="button" class="btn-primario" @click="imprimir"><icon name="boleta" clase="w-4 h-4"></icon> Imprimir / PDF</button>
    </template>
  </modal>

  <!-- Modal WhatsApp (Adenda 1.4: envía la boleta como IMAGEN PNG) -->
  <modal :abierto="waModal" titulo="Enviar boleta por WhatsApp" :subtitulo="waVenta ? waVenta.boleta + ' · ' + moneda + ' ' + Number(waVenta.total).toFixed(2) + ' · se envía como imagen' : ''" ancho="max-w-sm" @cerrar="waModal = false">
    <label class="label-forma">Número de WhatsApp</label>
    <input v-model="waTelefono" type="tel" class="input-texto font-mono" placeholder="9 8765 4321">
    <p class="mt-2 text-[11px] text-slate-400">Si la boleta tiene cliente registrado, su teléfono aparece automáticamente; si no, escriba el número y la boleta se envía igual.</p>
    <p class="mt-2 text-[11px] rounded-lg bg-emerald-50 ring-1 ring-inset ring-emerald-600/10 px-3 py-2 text-emerald-800">Se adjunta la <b>imagen PNG</b> de la boleta (formato ticket).</p>
    <template #pie>
      <button type="button" class="btn-secundario" @click="waModal = false">Cancelar</button>
      <button type="button" class="btn-secundario" :disabled="!waVenta || waEnviando" @click="descargarImagenWa" title="Descargar imagen PNG de la boleta">
        <icon name="download" clase="w-4 h-4"></icon> PNG
      </button>
      <button type="button" class="btn-primario !bg-emerald-600 hover:!bg-emerald-700" :disabled="waEnviando" @click="confirmarWhatsapp">
        <span v-if="waEnviando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <icon v-else name="whatsapp" clase="w-4 h-4"></icon> Enviar imagen
      </button>
    </template>
  </modal>

  <!-- Adenda 1.6: Nota de Crédito / Débito -->
  <modal :abierto="modalNota" titulo="Emitir Nota de Crédito / Débito" :subtitulo="'Sobre la venta ' + (formNota.ventaId || '')" ancho="max-w-md" @cerrar="modalNota = false">
    <form class="space-y-4" @submit.prevent="emitirNota">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Tipo</label>
          <select v-model="formNota.tipo" class="input-texto">
            <option value="07">Nota de Crédito (devolución)</option>
            <option value="08">Nota de Débito (cargo)</option>
          </select>
        </div>
        <div>
          <label class="label-forma">Motivo (SUNAT)</label>
          <input v-model="formNota.motivo" type="text" class="input-texto">
        </div>
      </div>
      <label v-if="formNota.tipo === '07'" class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="formNota.devolverStock" type="checkbox" class="rounded"> Devolver stock al almacén (y descontar fiado si aplicaba)
      </label>
      <label v-if="formNota.tipo === '07'" class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="formNota.anularVenta" type="checkbox" class="rounded"> Marcar la venta como ANULADA
      </label>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalNota = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardandoNota" @click="emitirNota">{{ guardandoNota ? 'Emitiendo...' : 'Emitir nota' }}</button>
    </template>
  </modal>

  <!-- Adenda 1.6: Guía de remisión -->
  <modal :abierto="modalGuia" titulo="Guía de remisión" :subtitulo="guiaVenta ? guiaVenta.boleta + ' · ' + guiaVenta.clienteNombre : ''" ancho="max-w-sm" @cerrar="modalGuia = false">
    <label class="label-forma">Número de guía</label>
    <input v-model="guiaNumero" type="text" class="input-texto font-mono" placeholder="T001-0000123">
    <p class="mt-2 text-[11px] text-slate-400">Se imprime al pie del comprobante y queda registrada en la auditoría.</p>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalGuia = false">Cancelar</button>
      <button type="button" class="btn-primario" @click="guardarGuia">Guardar</button>
    </template>
  </modal>
</div>`
  };
})();
