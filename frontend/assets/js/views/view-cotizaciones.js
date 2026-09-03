/**
 * NexoERP — vista-cotizaciones.js  (ADENDA 1.3)
 * Cotizaciones / proformas: creación con precios congelados, vigencia,
 * envío por WhatsApp, impresión y CONVERSIÓN A VENTA en un clic
 * (reutiliza el motor del POS: stock, política de precios y boleta).
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['cotizaciones'] = {
    data: function () {
      return {
        productos: [], clientes: [], stockAlmacen: {},
        carrito: [], clienteId: 'PUBLICO', validezDias: 15, nota: '',
        busqueda: '', cargando: true, guardando: false,
        filas: [], filtroEstado: '', q: '',
        detalleModal: false, cotSel: null, detalleSel: [], empresaSel: null,
        ventaModal: false, ventaConv: null, detalleConv: [], empresaConv: null,
        waModal: false, waTelefono: '', waProcesando: false,
        /* Adenda 1.4: boleta convertida → imagen PNG */
        waConvModal: false, waConvTelefono: '', waConvEnviando: false
      };
    },
    computed: {
      cfg: function () { return AppStore.estado.cfg || window.__nexoerp_cfg || {}; },
      moneda: function () { return this.cfg.MONEDA_SIMBOLO || 'S/'; },
      almacenVenta: function () { return this.cfg.ALMACEN_VENTA || 'ALM-0003'; },
      puedeGestionar: function () {
        var rol = AppStore.estado.usuario ? AppStore.estado.usuario.rol : '';
        return ['admin', 'gerente', 'operador'].indexOf(rol) !== -1;
      },
      totalBruto: function () {
        return this.carrito.reduce(function (a, l) { return a + l.cantidad * Number(l.precio || 0); }, 0);
      },
      totales: function () {
        var incluir = String(this.cfg.IGV_INCLUIDO || 'Sí').toUpperCase() === 'SI';
        var tasa = (parseFloat(this.cfg.IGV_TASA) || 18) / 100;
        var total = Math.round(this.totalBruto * 100) / 100;
        var igv = incluir ? Math.round((total - total / (1 + tasa)) * 100) / 100 : Math.round(total * tasa * 100) / 100;
        var subtotal = incluir ? Math.round((total - igv) * 100) / 100 : total;
        return { subtotal: subtotal, igv: igv, total: total, incluir: incluir };
      },
      filtradosProductos: function () {
        var q = this.busqueda.trim().toLowerCase();
        if (!q) return [];
        return this.productos.filter(function (p) {
          return p.nombre.toLowerCase().indexOf(q) !== -1 || p.sku.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 6);
      },
      cotizacionesVisibles: function () {
        return this.filas;
      },
      cols: function () {
        return [
          { k: 'numero', label: 'Proforma' },
          { k: 'fecha', label: 'Fecha' },
          { k: 'clienteNombre', label: 'Cliente' },
          { k: 'validezHasta', label: 'Válida hasta' },
          { k: 'total', label: 'Total', clase: 'text-right' },
          { k: 'estado', label: 'Estado' }
        ];
      }
    },
    async mounted() {
      await this.cargar();
    },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var self = this;
          var res = await Promise.all([
            Api.productos({ estado: 'ACTIVO' }),
            Api.clientes(),
            Api.stock({ almacenId: this.almacenVenta }),
            Api.cotizaciones({ estado: this.filtroEstado, q: this.q })
          ]);
          this.productos = res[0];
          this.clientes = res[1].filter(function (c) { return c.estado === 'ACTIVO'; });
          this.stockAlmacen = {};
          res[2].forEach(function (f) { self.stockAlmacen[f.productoId] = f.cantidad; });
          this.filas = res[3];
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      filtrar: function () { this.cargar(); },

      /* ---------- Constructor de proforma ---------- */
      agregar: function (p) {
        if (this.carrito.some(function (l) { return l.productoId === p.id; })) {
          AppStore.toast('El producto ya está en la proforma.', 'info'); return;
        }
        this.carrito.push({
          productoId: p.id, sku: p.sku, nombre: p.nombre,
          precio: Number(p.precioVenta), precioOriginal: Number(p.precioVenta),
          cantidad: 1, stock: this.stockAlmacen[p.id] || 0
        });
        this.busqueda = '';
      },
      mas: function (l) { l.cantidad++; },
      menos: function (l) { l.cantidad > 1 ? l.cantidad-- : this.quitar(l); },
      quitar: function (l) { this.carrito = this.carrito.filter(function (i) { return i !== l; }); },
      clampPrecio: function (l) {
        var v = parseFloat(l.precio);
        l.precio = (isNaN(v) || v < 0) ? 0 : Math.round(v * 100) / 100;
      },
      guardar: async function () {
        if (!this.carrito.length) { AppStore.toast('Agregue al menos un producto.', 'warning'); return; }
        this.guardando = true;
        try {
          var res = await Api.registrarCotizacion({
            clienteId: this.clienteId,
            validezDias: parseInt(this.validezDias, 10) || 15,
            nota: this.nota || '',
            items: this.carrito.map(function (i) {
              return { productoId: i.productoId, cantidad: i.cantidad, precio: i.precio };
            })
          });
          AppStore.toast('Cotización ' + res.cotizacion.numero + ' creada (' + this.moneda + ' ' + Number(res.cotizacion.total).toFixed(2) + ').', 'exito');
          this.carrito = []; this.nota = ''; this.clienteId = 'PUBLICO';
          await this.cargar();
          this.verCotizacion({ id: res.cotizacion.id });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },

      /* ---------- Consulta y detalle ---------- */
      verCotizacion: async function (f) {
        try {
          var res = await Api.cotizacion(f.id);
          this.cotSel = res.cotizacion;
          this.detalleSel = res.detalle;
          this.empresaSel = res.empresa;
          this.detalleModal = true;
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      /* ---------- Documentos (ADENDA 1.4): PDF A4 para proforma, PNG para boleta ---------- */
      cotFmt: function () {
        var c = this.cotSel || {};
        return Object.assign({}, c, {
          fechaFmt: Utils.fmtFecha(c.fecha),
          validezFmt: Utils.fmtFecha(c.validezHasta)
        });
      },
      descargarPDF: async function () {
        if (!this.cotSel) return;
        try {
          var doc = await NexoDocs.proformaPDF(this.cotFmt(), this.detalleSel, this.empresaSel || {});
          doc.save(NexoDocs.proformaNombreArchivo(this.cotSel));
          AppStore.toast('Proforma ' + this.cotSel.numero + ' descargada en PDF (A4).', 'exito');
        } catch (e) { AppStore.toast('No se pudo generar el PDF: ' + e.message, 'error'); }
      },
      imprimirProforma: function () { window.print(); },
      imprimirVenta: function () { window.print(); },

      /* Boleta generada por conversión: imagen PNG + WhatsApp */
      descargarImagenConv: async function () {
        if (!this.ventaConv) return;
        try {
          var canvas = await NexoDocs.boletaCanvas(this.ventaConv, this.detalleConv, this.empresaConv || {});
          NexoDocs.descargarArchivo(NexoDocs.boletaNombreArchivo(this.ventaConv), NexoDocs.dataURLaBlob(canvas.toDataURL('image/png')));
          AppStore.toast('Imagen de la boleta descargada.', 'exito');
        } catch (e) { AppStore.toast('No se pudo generar la imagen: ' + e.message, 'error'); }
      },
      abrirWhatsappConv: function () {
        if (!this.ventaConv) return;
        this.waConvTelefono = this.ventaConv.clienteTelefono || '';
        this.waConvModal = true;
      },
      confirmarWhatsappConv: async function () {
        var tel = Utils.normalizarTelefono(this.waConvTelefono);
        if (!tel || tel.length < 11) { AppStore.toast('Ingrese un número de WhatsApp válido (9 dígitos).', 'warning'); return; }
        this.waConvEnviando = true;
        try {
          var canvas = await NexoDocs.boletaCanvas(this.ventaConv, this.detalleConv, this.empresaConv || {});
          var modo = await NexoDocs.enviarArchivoWhatsapp({
            telefono: tel,
            mensaje: Utils.mensajeWhatsapp(this.ventaConv, this.detalleConv, this.empresaConv),
            nombre: NexoDocs.boletaNombreArchivo(this.ventaConv),
            blob: canvas.toDataURL('image/png')
          });
          this.waConvModal = false;
          if (modo === 'cancelado') return;
          AppStore.toast(modo === 'share' ? 'Boleta compartida como imagen.' : 'Imagen descargada: adjúntela en el chat de WhatsApp que se abrió.', 'exito');
        } catch (e) {
          AppStore.toast('No se pudo generar la imagen: ' + e.message, 'error');
        } finally { this.waConvEnviando = false; }
      },

      /* ---------- Conversión a venta ---------- */
      convertir: async function (cot) {
        var c = cot || this.cotSel;
        var advertencia = '';
        if (c.vencida) advertencia = '\n⚠ La proforma está VENCIDA (venció el ' + c.validezHasta + '). Puede convertirla igual.';
        if (c.estado === 'CONVERTIDA') { AppStore.toast('Ya fue convertida en la boleta ' + c.convertidoA + '.', 'warning'); return; }
        var ok = await AppStore.confirmar({
          titulo: 'Convertir ' + c.numero + ' en venta',
          mensaje: 'Se creará una boleta real por ' + this.moneda + ' ' + Number(c.total).toFixed(2) + ' a nombre de ' + c.clienteNombre + ', descontando stock del almacén de venta.' + advertencia + '\n\n¿Continuar?',
          okLabel: 'Convertir en venta'
        });
        if (!ok) return;
        try {
          var res = await Api.convertirCotizacion({ id: c.id, metodoPago: 'Efectivo' });
          this.ventaConv = res.venta; this.detalleConv = res.detalle; this.empresaConv = res.empresa;
          this.detalleModal = false;
          this.ventaModal = true;
          AppStore.toast('Cotización ' + c.numero + ' convertida en la boleta ' + res.venta.boleta + '.', 'exito');
          await this.cargar();
        } catch (e) {
          if (e.code === 'AUTORIZACION' || e.code === 'FORBIDDEN') {
            AppStore.toast('La conversión requiere autorización de gerente (precios bajo el mínimo). Regístrela desde el POS o ajuste la política.', 'error');
          } else AppStore.toast(e.message, 'error');
        }
      },
      anular: async function (cot) {
        var ok = await AppStore.confirmar({
          titulo: 'Anular cotización ' + cot.numero,
          mensaje: 'La proforma quedará invalidada. Esta acción no toca el stock.', okLabel: 'Anular', peligro: true
        });
        if (!ok) return;
        try {
          await Api.anularCotizacion(cot.id, 'Anulada manualmente');
          AppStore.toast('Cotización ' + cot.numero + ' anulada.', 'exito');
          this.detalleModal = false;
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },

      /* ---------- WhatsApp (ADENDA 1.4: envía la proforma como PDF A4) ---------- */
      abrirWhatsapp: function () {
        if (!this.cotSel) return;
        this.waTelefono = this.cotSel.clienteTelefono || '';
        this.waModal = true;
      },
      enviarWhatsapp: async function () {
        var tel = Utils.normalizarTelefono(this.waTelefono);
        if (!tel || tel.length < 11) { AppStore.toast('Ingrese un número válido (9 dígitos).', 'warning'); return; }
        this.waProcesando = true;
        try {
          var doc = await NexoDocs.proformaPDF(this.cotFmt(), this.detalleSel, this.empresaSel || {});
          var blob = doc.output('blob');
          var ventaWa = {
            numero: this.cotSel.numero, boleta: this.cotSel.numero, tipoDoc: 'COTIZACIÓN / PROFORMA',
            fecha: Utils.fmtFecha(this.cotSel.fecha), clienteNombre: this.cotSel.clienteNombre,
            subtotal: this.cotSel.subtotal, igv: this.cotSel.igv, total: this.cotSel.total,
            descuentoTotal: 0, metodoPago: '', usuario: this.cotSel.usuario || ''
          };
          var emp = Object.assign({ moneda: this.moneda }, this.empresaSel || {});
          var modo = await NexoDocs.enviarArchivoWhatsapp({
            telefono: tel,
            mensaje: Utils.mensajeWhatsapp(ventaWa, this.detalleSel, emp),
            nombre: NexoDocs.proformaNombreArchivo(this.cotSel),
            blob: blob
          });
          this.waModal = false;
          if (modo === 'cancelado') return;
          if (modo === 'share') {
            AppStore.toast('Proforma ' + this.cotSel.numero + ' compartida como PDF (A4).', 'exito');
          } else {
            AppStore.toast('PDF descargado: adjúntelo en el chat de WhatsApp que se abrió.', 'exito');
          }
        } catch (e) {
          AppStore.toast('No se pudo generar el PDF: ' + e.message, 'error');
        } finally { this.waProcesando = false; }
      },
    },
    template: `
<div>
  <page-header titulo="Cotizaciones / Proformas" subtitulo="Cree proformas con vigencia y conviértalas en venta con un clic (descuenta stock y emite boleta)">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar
      </button>
    </template>
  </page-header>

  <div class="grid grid-cols-1 xl:grid-cols-5 gap-4">
    <!-- Constructor -->
    <div class="xl:col-span-2" v-if="puedeGestionar">
      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-3">Nueva cotización</h3>

        <div class="relative mb-3">
          <icon name="search" clase="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
          <input v-model="busqueda" type="text" class="input-texto pl-10" placeholder="Buscar producto por nombre o SKU...">
        </div>
        <div v-if="filtradosProductos.length" class="rounded-xl ring-1 ring-slate-200 divide-y divide-slate-100 mb-3 max-h-44 overflow-y-auto nexo-scroll">
          <button v-for="p in filtradosProductos" :key="p.id" type="button" class="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-2" @click="agregar(p)">
            <span class="text-sm text-slate-800 truncate">{{ p.nombre }} <span class="text-[11px] text-slate-400 font-mono">{{ p.sku }}</span></span>
            <span class="text-xs text-slate-400 shrink-0">stock {{ stockAlmacen[p.id] || 0 }}</span>
          </button>
        </div>

        <div class="space-y-2 max-h-56 overflow-y-auto nexo-scroll mb-3">
          <div v-for="l in carrito" :key="l.productoId" class="rounded-xl ring-1 ring-slate-200 px-3 py-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">{{ l.nombre }}</p>
                <p class="text-[11px] text-slate-400 font-mono">{{ l.sku }}</p>
              </div>
              <button type="button" class="btn-icono shrink-0" @click="quitar(l)"><icon name="x" clase="w-4 h-4"></icon></button>
            </div>
            <div class="flex items-center gap-2 mt-1.5">
              <button type="button" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold" @click="menos(l)">−</button>
              <input v-model.number="l.cantidad" type="number" min="1" class="input-texto w-16 text-center py-1">
              <button type="button" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold" @click="mas(l)">+</button>
              <span class="text-xs text-slate-400">×</span>
              <input v-model.number="l.precio" @change="clampPrecio(l)" type="number" min="0" step="0.10" class="input-texto w-24 py-1 text-sm" title="Precio congelado en la proforma">
              <span class="ml-auto text-sm font-bold tabular-nums">{{ moneda }} {{ (l.cantidad * l.precio).toFixed(2) }}</span>
            </div>
          </div>
          <p v-if="!carrito.length" class="text-center text-xs text-slate-400 py-6">Busque y agregue productos a la proforma</p>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="label-forma">Cliente</label>
            <select v-model="clienteId" class="input-texto">
              <option value="PUBLICO">Público General</option>
              <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.razonSocial }}</option>
            </select>
          </div>
          <div>
            <label class="label-forma">Validez (días)</label>
            <input v-model.number="validezDias" type="number" min="1" max="365" class="input-texto">
          </div>
        </div>
        <label class="label-forma">Nota / referencia</label>
        <input v-model="nota" type="text" class="input-texto mb-3" placeholder="Ej. Proyecto oficina — piso 4">

        <div class="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3 space-y-1 text-sm mb-3">
          <div class="flex justify-between text-slate-500"><span>Op. gravadas</span><span class="tabular-nums">{{ moneda }} {{ totales.subtotal.toFixed(2) }}</span></div>
          <div class="flex justify-between text-slate-500"><span>IGV {{ cfg.IGV_TASA || 18 }}% {{ totales.incluir ? '(incluido)' : '' }}</span><span class="tabular-nums">{{ moneda }} {{ totales.igv.toFixed(2) }}</span></div>
          <div class="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200"><span>TOTAL</span><span class="tabular-nums">{{ moneda }} {{ totales.total.toFixed(2) }}</span></div>
        </div>

        <button type="button" class="btn-primario w-full justify-center" :disabled="!carrito.length || guardando" @click="guardar">
          <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
          <icon v-else name="cotizaciones" clase="w-4 h-4"></icon> {{ guardando ? 'Generando...' : 'Emitir proforma' }}
        </button>
      </div>
    </div>

    <!-- Listado -->
    <div :class="puedeGestionar ? 'xl:col-span-3' : 'xl:col-span-5'">
      <div class="nexo-card p-0 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-semibold text-slate-800 text-sm">Proformas emitidas</h3>
          <div class="flex items-center gap-2">
            <input v-model="q" @keyup.enter="filtrar" type="text" class="input-texto w-44 py-1.5 text-xs" placeholder="Buscar n° / cliente">
            <select v-model="filtroEstado" @change="filtrar" class="input-texto w-36 py-1.5 text-xs">
              <option value="">Todos</option><option value="VIGENTE">Vigentes</option>
              <option value="CONVERTIDA">Convertidas</option><option value="ANULADA">Anuladas</option>
            </select>
          </div>
        </div>
        <div class="overflow-x-auto nexo-scroll">
          <table class="min-w-full text-sm">
            <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <th class="px-4 py-2 text-left font-semibold">Proforma</th>
              <th class="px-4 py-2 text-left font-semibold">Cliente</th>
              <th class="px-4 py-2 text-left font-semibold">Vence</th>
              <th class="px-4 py-2 text-right font-semibold">Total</th>
              <th class="px-4 py-2 text-center font-semibold">Estado</th>
              <th class="px-4 py-2 text-right font-semibold">Acciones</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="f in cotizacionesVisibles" :key="f.id" class="hover:bg-blue-50/40">
                <td class="px-4 py-2.5">
                  <span class="font-mono font-semibold text-blue-700">{{ f.numero }}</span>
                  <span class="block text-[11px] text-slate-400">{{ Utils.fmtFecha(f.fecha) }} · {{ f.usuario }}</span>
                </td>
                <td class="px-4 py-2.5 text-slate-800">{{ f.clienteNombre }}<span v-if="f.nota" class="block text-[11px] text-slate-400 truncate max-w-[180px]">{{ f.nota }}</span></td>
                <td class="px-4 py-2.5 text-slate-500">{{ Utils.fmtFecha(f.validezHasta) }}</td>
                <td class="px-4 py-2.5 text-right font-bold tabular-nums">{{ moneda }} {{ Number(f.total).toFixed(2) }}</td>
                <td class="px-4 py-2.5 text-center"><badge :tipo="f.estado === 'VIGENTE' && f.vencida ? 'VENCIDA' : f.estado"></badge></td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center justify-end gap-0.5">
                    <button type="button" class="btn-icono" title="Ver / imprimir" @click="verCotizacion(f)"><icon name="ojo" clase="w-4 h-4"></icon></button>
                    <button v-if="puedeGestionar && (f.estado === 'VIGENTE')" type="button" class="btn-icono" :title="f.vencida ? 'Convertir (vencida)' : 'Convertir en venta'"
                      :class="f.vencida ? 'text-amber-500 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'" @click="convertir(f)">
                      <icon name="check" clase="w-4 h-4"></icon>
                    </button>
                    <span v-if="f.estado === 'CONVERTIDA'" class="font-mono text-[10px] text-blue-600" :title="'Convertida en ' + f.convertidoA">{{ f.convertidoA }}</span>
                  </div>
                </td>
              </tr>
              <tr v-if="!cotizacionesVisibles.length"><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-400">No hay cotizaciones{{ filtroEstado ? ' en este estado' : ' todavía' }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal detalle proforma -->
  <modal :abierto="detalleModal" titulo="Cotización / Proforma" :subtitulo="cotSel ? cotSel.numero + ' · válida hasta ' + cotSel.validezHasta : ''" ancho="max-w-md" @cerrar="detalleModal = false">
    <div class="boleta-print">
      <div style="text-align:center">
        <img v-if="empresaSel && (empresaSel.logoBase64 || empresaSel.logoUrl)" :src="empresaSel.logoBase64 || empresaSel.logoUrl" alt="Logo" style="max-height:50px;max-width:140px;margin:0 auto 4px;display:block;object-fit:contain">
        <div style="font-weight:700;font-size:13px;text-transform:uppercase">{{ empresaSel ? empresaSel.razonSocial : '' }}</div>
        <div style="font-size:11px">RUC: {{ empresaSel ? empresaSel.ruc : '' }}</div>
        <div style="border-top:1px dashed #000;margin:6px 0"></div>
        <div style="font-size:12px;font-weight:700">COTIZACIÓN / PROFORMA</div>
        <div style="font-size:12px;font-weight:700">{{ cotSel ? cotSel.numero : '' }}</div>
      </div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="font-size:11px;line-height:1.5" v-if="cotSel">
        <div>Fecha&nbsp;&nbsp;: {{ Utils.fmtFechaHora(cotSel.fecha) }}</div>
        <div>Válida&nbsp;: hasta {{ Utils.fmtFecha(cotSel.validezHasta) }}</div>
        <div>Cliente: {{ cotSel.clienteNombre }}</div>
        <div v-if="cotSel.nota">Ref.&nbsp;&nbsp;&nbsp;&nbsp;: {{ cotSel.nota }}</div>
      </div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <table style="width:100%;font-size:10.5px;border-collapse:collapse">
        <thead><tr style="text-align:left"><th style="padding:2px 0">CANT</th><th>DESCRIPCIÓN</th><th style="text-align:right">P.UNT</th><th style="text-align:right">IMPORTE</th></tr></thead>
        <tbody>
          <tr v-for="(d, i) in detalleSel" :key="i" style="vertical-align:top">
            <td style="padding:2px 0">{{ d.cantidad }}</td>
            <td>{{ d.descripcion }}<br><span style="font-size:9px;color:#444">{{ d.sku }}</span></td>
            <td style="text-align:right">{{ moneda }} {{ Number(d.precioUnit).toFixed(2) }}</td>
            <td style="text-align:right">{{ moneda }} {{ Number(d.subtotal).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <table style="width:100%;font-size:11.5px;border-collapse:collapse" v-if="cotSel">
        <tr><td>OP. GRAVADAS</td><td style="text-align:right">{{ moneda }} {{ Number(cotSel.subtotal).toFixed(2) }}</td></tr>
        <tr><td>IGV {{ cfg.IGV_TASA || 18 }}%</td><td style="text-align:right">{{ moneda }} {{ Number(cotSel.igv).toFixed(2) }}</td></tr>
        <tr style="font-weight:700;font-size:13.5px"><td style="padding-top:3px">TOTAL</td><td style="text-align:right;padding-top:3px">{{ moneda }} {{ Number(cotSel.total).toFixed(2) }}</td></tr>
      </table>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="text-align:center;font-size:10px;line-height:1.5">
        Documento de referencia — no es un comprobante de pago.<br>Los precios son válidos hasta la fecha indicada.
      </div>
    </div>
    <template #pie>
      <button type="button" class="btn-secundario" @click="detalleModal = false">Cerrar</button>
      <button type="button" class="btn-secundario" @click="abrirWhatsapp"><icon name="whatsapp" clase="w-4 h-4 text-emerald-600"></icon> WhatsApp</button>
      <button type="button" class="btn-secundario" @click="imprimirProforma"><icon name="boleta" clase="w-4 h-4"></icon> Imprimir</button>
      <button type="button" class="btn-primario" @click="descargarPDF"><icon name="download" clase="w-4 h-4"></icon> PDF A4</button>
      <button v-if="cotSel && cotSel.estado === 'VIGENTE'" type="button" class="btn-primario !bg-emerald-600 hover:!bg-emerald-700" @click="convertir(cotSel)">
        <icon name="check" clase="w-4 h-4"></icon> Convertir en venta
      </button>
    </template>
  </modal>

  <!-- Modal WhatsApp (Adenda 1.4: envía la proforma como PDF A4) -->
  <modal :abierto="waModal" titulo="Enviar proforma por WhatsApp" subtitulo="Se envía la proforma en PDF formato A4 (diferente al ticket de boleta)" ancho="max-w-sm" @cerrar="waModal = false">
    <label class="label-forma">Número de WhatsApp</label>
    <input v-model="waTelefono" type="tel" class="input-texto font-mono" placeholder="9 8765 4321">
    <p class="mt-2 text-[11px] text-slate-400">Si el cliente ya está registrado con teléfono, lo llenamos automáticamente. Si no, escriba el número — el cliente no necesita estar registrado.</p>
    <p class="mt-2 text-[11px] rounded-lg bg-blue-50 ring-1 ring-inset ring-blue-600/10 px-3 py-2 text-blue-800">La proforma viaja como <b>PDF tamaño A4</b> con el membrete de su empresa. En celulares se comparte directo; en computadora se descarga el PDF y se abre WhatsApp con el mensaje listo para adjuntarlo.</p>
    <template #pie>
      <button type="button" class="btn-secundario" @click="waModal = false">Cancelar</button>
      <button type="button" class="btn-primario !bg-emerald-600 hover:!bg-emerald-700" :disabled="waProcesando" @click="enviarWhatsapp">
        <span v-if="waProcesando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <icon v-else name="whatsapp" clase="w-4 h-4"></icon> Enviar PDF
      </button>
    </template>
  </modal>

  <!-- Modal boleta generada por conversión (Adenda 1.4: imagen PNG + WhatsApp) -->
  <modal :abierto="ventaModal" titulo="Venta generada desde cotización" :subtitulo="ventaConv ? 'Comprobante ' + ventaConv.boleta : ''" ancho="max-w-md" @cerrar="ventaModal = false">
    <venta-boleta v-if="ventaConv" :venta="ventaConv" :detalle="detalleConv" :empresa="empresaConv"></venta-boleta>
    <template #pie>
      <button type="button" class="btn-secundario" @click="ventaModal = false">Cerrar</button>
      <button type="button" class="btn-secundario" @click="descargarImagenConv" title="Descargar la boleta como imagen PNG"><icon name="download" clase="w-4 h-4"></icon> PNG</button>
      <button type="button" class="btn-secundario !text-emerald-700" @click="abrirWhatsappConv"><icon name="whatsapp" clase="w-4 h-4 text-emerald-600"></icon> WhatsApp</button>
      <button type="button" class="btn-primario" @click="imprimirVenta"><icon name="boleta" clase="w-4 h-4"></icon> Imprimir boleta</button>
    </template>
  </modal>

  <!-- Modal WhatsApp de la boleta convertida (imagen PNG) -->
  <modal :abierto="waConvModal" titulo="Enviar boleta por WhatsApp" subtitulo="Se envía la boleta como IMAGEN (PNG)" ancho="max-w-sm" @cerrar="waConvModal = false">
    <label class="label-forma">Número de WhatsApp</label>
    <input v-model="waConvTelefono" type="tel" class="input-texto font-mono" placeholder="9 8765 4321">
    <p class="mt-2 text-[11px] text-slate-400">Si el cliente está registrado, su teléfono aparece automáticamente; si no, escriba el número.</p>
    <template #pie>
      <button type="button" class="btn-secundario" @click="waConvModal = false">Cancelar</button>
      <button type="button" class="btn-primario !bg-emerald-600 hover:!bg-emerald-700" :disabled="waConvEnviando" @click="confirmarWhatsappConv">
        <span v-if="waConvEnviando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <icon v-else name="whatsapp" clase="w-4 h-4"></icon> Enviar imagen
      </button>
    </template>
  </modal>
</div>`
  };
})();
