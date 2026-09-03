/**
 * NexoERP — vista-pos.js  (v1.2 "POS Pro")
 * Venta rápida de mostrador con:
 *  · PRECIO EDITABLE por línea (ofertas y negociación) con precio mínimo.
 *  · DESCUENTO adicional por línea en S/ con % calculado en vivo.
 *  · PRODUCTO REGALO: precio 0, sigue descontando stock y queda trazado.
 *  · AUTORIZACIÓN DE SUPERVISOR (admin/gerente) cuando la política lo exige:
 *    precio bajo el mínimo, descuento > DESCUENTO_MAX_PCT o regalos.
 *    Las credenciales se validan EN EL SERVIDOR y quedan en la boleta/auditoría.
 *  · VENTAS EN ESPERA (apartados) para atender a varios clientes a la vez.
 *  · Atajos de teclado: F2 buscar · F4 cobrar · F8 apartar · Esc cerrar.
 *  · Compatible con ESCÁNER de códigos: SKU exacto + Enter agrega al carrito.
 *  · Botones rápidos de billetes y cálculo de vuelto.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  var CLAVE_ESPERA = 'nexoerp_espera_v1';

  function leerEsperados() {
    try { return JSON.parse(localStorage.getItem(CLAVE_ESPERA) || '[]'); } catch (e) { return []; }
  }
  function guardarEsperados(arr) {
    try { localStorage.setItem(CLAVE_ESPERA, JSON.stringify(arr)); } catch (e) { /* storage lleno */ }
  }

  window.NEXO_VISTAS['pos'] = {
    data: function () {
      return {
        productos: [], stockAlmacen: {}, clientes: [],
        busqueda: '', catSel: '', carrito: [],
        clienteId: 'PUBLICO', metodoPago: '', montoRecibido: '',
        cargando: true, procesando: false,
        boletaAbierta: false, ventaEmitida: null, detalleEmitido: [], empresaEmitida: null,
        /* Adenda 1.3: WhatsApp */
        waModal: false, waTelefono: '', waEnviando: false,
        /* Adenda 1.2: autorización de supervisor */
        autorizacion: null,          // { usuario, password, nombre } en memoria
        authModal: false, authUsuario: '', authPassword: '', authError: '', authProcesando: false,
        /* Adenda 1.2: ventas en espera */
        esperados: [], esperaModal: false
      };
    },
    computed: {
      cfg: function () { return AppStore.estado.cfg || window.__nexoerp_cfg || {}; },
      almacenVenta: function () { return this.cfg.ALMACEN_VENTA || 'ALM-0003'; },
      moneda: function () { return this.cfg.MONEDA_SIMBOLO || 'S/'; },
      metodosPago: function () { return ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Fiado']; },
      metodoEfectivo: function () {
        return (this.metodoPago || this.cfg.METODO_PAGO_DEFAULT || 'Efectivo') === 'Efectivo';
      },
      /* Adenda 1.3: FIADO — datos del cliente y validación de límite */
      clienteSeleccionado: function () {
        var id = this.clienteId;
        if (!id || id === 'PUBLICO') return null;
        return this.clientes.find(function (c) { return c.id === id; }) || null;
      },
      fiadoActivo: function () { return this.metodoPago === 'Fiado'; },
      fiadoInfo: function () {
        if (!this.fiadoActivo) return null;
        var cli = this.clienteSeleccionado;
        if (!cli) return null;
        var limite = Number(cli.limiteFiado || 0);
        var saldo = Number(cli.saldoFiado || 0);
        var total = this.totales.total;
        var excede = limite > 0 && (saldo + total) > limite + 0.009;
        var permitirExceder = String(this.cfg.FIADO_PERMITIR_EXCEDER || 'No').toUpperCase() !== 'NO';
        return {
          nombre: cli.razonSocial, telefono: cli.telefono || '',
          limite: limite, saldo: saldo,
          disponible: limite > 0 ? Math.max(0, limite - saldo) : null,
          nuevoSaldo: Math.round((saldo + total) * 100) / 100,
          excede: excede, bloqueado: excede && !permitirExceder,
          sinTelefono: !String(cli.telefono || '').trim()
        };
      },
      categorias: function () {
        var set = {};
        this.productos.forEach(function (p) { if (p.categoria) set[p.categoria] = true; });
        return Object.keys(set).sort();
      },
      filtrados: function () {
        var q = this.busqueda.trim().toLowerCase();
        var self = this;
        return this.productos.filter(function (p) {
          if (self.catSel && p.categoria !== self.catSel) return false;
          if (q && p.nombre.toLowerCase().indexOf(q) === -1 && p.sku.toLowerCase().indexOf(q) === -1) return false;
          return true;
        }).slice(0, 12).map(function (p) {
          return Object.assign({}, p, { stockVenta: self.stockAlmacen[p.id] || 0 });
        });
      },
      totalLista: function () {
        return this.carrito.reduce(function (a, l) { return a + l.cantidad * Number(l.precioOriginal || 0); }, 0);
      },
      totalDescuentos: function () {
        return this.carrito.reduce(function (a, l) { return a + (l.cantidad * Number(l.precioOriginal || 0) - self_importe(l)); }, 0);
      },
      totalBruto: function () {
        return this.carrito.reduce(function (a, l) { return a + self_importe(l); }, 0);
      },
      totales: function () {
        var incluir = String(this.cfg.IGV_INCLUIDO || 'Sí').toUpperCase() === 'SI';
        var tasa = (parseFloat(this.cfg.IGV_TASA) || 18) / 100;
        var total = Math.round(this.totalBruto * 100) / 100;
        var igv = incluir ? Math.round((total - total / (1 + tasa)) * 100) / 100 : Math.round(total * tasa * 100) / 100;
        var subtotal = incluir ? Math.round((total - igv) * 100) / 100 : total;
        return { subtotal: subtotal, igv: igv, total: total, incluir: incluir };
      },
      vuelto: function () {
        var r = parseFloat(this.montoRecibido);
        if (isNaN(r) || r <= 0 || !this.metodoEfectivo) return 0;
        return Math.max(0, Math.round((r - this.totales.total) * 100) / 100);
      },
      recibidoInsuficiente: function () {
        if (!this.metodoEfectivo) return false;
        var r = parseFloat(this.montoRecibido);
        return !isNaN(r) && r > 0 && r < this.totales.total;
      },
      horarioInicioTxt: function () {
        var m = String(this.cfg.HORARIO_INICIO || '').match(/(\d{1,2}:\d{2})/);
        return m ? (m[1].length === 4 ? '0' + m[1] : m[1]) : (this.cfg.HORARIO_INICIO || '08:00');
      },
      horarioFinTxt: function () {
        var m = String(this.cfg.HORARIO_FIN || '').match(/(\d{1,2}:\d{2})/);
        return m ? (m[1].length === 4 ? '0' + m[1] : m[1]) : (this.cfg.HORARIO_FIN || '22:00');
      },
      fueraHorario: function () {
        var ini = this.horarioInicioTxt, fin = this.horarioFinTxt;
        if (!ini || !fin) return false;
        var ahora = new Date();
        var mins = ahora.getHours() * 60 + ahora.getMinutes();
        var p = function (s) {
          var m = String(s).match(/(\d{1,2}):(\d{2})/);
          return m ? (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0) : 0;
        };
        return mins < p(ini) || mins > p(fin);
      },
      /* Líneas que exigen autorización de admin/gerente según política */
      lineasAutorizacion: function () {
        var self = this;
        var regaloReq = String(this.cfg.REGALO_REQUIERE_AUTORIZACION || 'Sí').toUpperCase() !== 'NO';
        var descReq = String(this.cfg.DESCUENTO_REQUIERE_AUTORIZACION || 'Sí').toUpperCase() !== 'NO';
        var maxPct = parseFloat(this.cfg.DESCUENTO_MAX_PCT) || 0;
        var out = [];
        this.carrito.forEach(function (l) {
          if (l.esRegalo) {
            if (regaloReq) out.push({ nombre: l.nombre, motivo: 'producto entregado como REGALO' });
            return;
          }
          if (Number(l.precioMinimo) > 0 && Number(l.precio) < Number(l.precioMinimo)) {
            out.push({ nombre: l.nombre, motivo: 'precio ' + self.moneda + ' ' + Number(l.precio).toFixed(2) + ' bajo el mínimo ' + self.moneda + ' ' + Number(l.precioMinimo).toFixed(2) });
            return;
          }
          var base = l.cantidad * Number(l.precioOriginal || 0);
          if (descReq && maxPct > 0 && base > 0) {
            var pct = (base - self_importe(l)) / base * 100;
            if (pct > maxPct) out.push({ nombre: l.nombre, motivo: 'descuento ' + pct.toFixed(1) + '% supera el máximo de ' + maxPct + '%' });
          }
        });
        return out;
      },
      requiereAutorizacion: function () { return this.lineasAutorizacion.length > 0; },
      autorizadoEtiqueta: function () { return this.autorizacion ? this.autorizacion.nombre : ''; },
      puedeCobrar: function () {
        if (this.carrito.length === 0 || this.procesando || this.recibidoInsuficiente) return false;
        if (this.fiadoActivo && (!this.clienteSeleccionado || (this.fiadoInfo && this.fiadoInfo.bloqueado))) return false;
        return true;
      },
      billetes: function () { return [20, 50, 100, 200]; }
    },
    async mounted() {
      this.metodoPago = this.cfg.METODO_PAGO_DEFAULT || 'Efectivo';
      this.esperados = leerEsperados();
      await this.cargar();
      this._onKey = this.onTecla.bind(this);
      window.addEventListener('keydown', this._onKey);
    },
    unmounted() {
      window.removeEventListener('keydown', this._onKey);
    },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var self = this;
          var resultados = await Promise.all([
            Api.productos({ estado: 'ACTIVO' }),
            Api.stock({ almacenId: this.almacenVenta }),
            Api.clientes()
          ]);
          this.productos = resultados[0];
          this.stockAlmacen = {};
          resultados[1].forEach(function (f) { self.stockAlmacen[f.productoId] = f.cantidad; });
          this.clientes = resultados[2].filter(function (c) { return c.estado === 'ACTIVO'; });
        } catch (e) {
          AppStore.toast(e.message, 'error');
        } finally { this.cargando = false; }
      },

      /* ---------- Carrito ---------- */
      agregar: function (p) {
        if (p.stockVenta <= 0) { AppStore.toast('Sin stock de "' + p.nombre + '" en el almacén de venta.', 'warning'); return; }
        var linea = this.carrito.find(function (i) { return i.productoId === p.id; });
        if (linea) {
          if (linea.esRegalo) { AppStore.toast('"' + p.nombre + '" ya está como regalo; ajuste la cantidad directamente.', 'info'); return; }
          if (linea.cantidad + 1 > p.stockVenta) { AppStore.toast('Stock máximo alcanzado (' + p.stockVenta + ').', 'warning'); return; }
          linea.cantidad++;
        } else {
          this.carrito.push({
            productoId: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad,
            precio: Number(p.precioVenta), precioOriginal: Number(p.precioVenta),
            precioMinimo: Number(p.precioMinimo || 0),
            descuento: 0, esRegalo: false, cantidad: 1, stockVenta: p.stockVenta
          });
        }
      },
      mas: function (l) {
        if (l.cantidad + 1 > l.stockVenta) { AppStore.toast('Stock máximo alcanzado (' + l.stockVenta + ').', 'warning'); return; }
        l.cantidad++;
      },
      menos: function (l) { l.cantidad > 1 ? l.cantidad-- : this.quitar(l); },
      quitar: function (l) { this.carrito = this.carrito.filter(function (i) { return i !== l; }); },
      limpiar: async function () {
        if (!this.carrito.length) return;
        var ok = await AppStore.confirmar({ titulo: 'Vaciar carrito', mensaje: 'Se quitarán todos los productos del carrito actual.', okLabel: 'Vaciar', peligro: true });
        if (ok) { this.carrito = []; this.autorizacion = null; }
      },

      /* ---------- Precio, descuento y regalo ---------- */
      importeLinea: function (l) { return self_importe(l); },
      pctDescuento: function (l) {
        var base = l.cantidad * Number(l.precioOriginal || 0);
        if (base <= 0) return 0;
        return Math.max(0, (base - this.importeLinea(l)) / base * 100);
      },
      clampPrecio: function (l) {
        var v = parseFloat(l.precio);
        if (isNaN(v) || v < 0) l.precio = 0;
        else l.precio = Math.round(v * 100) / 100;
      },
      clampDescuento: function (l) {
        var max = Math.max(0, Math.round(l.cantidad * Number(l.precio) * 100) / 100);
        var v = parseFloat(l.descuento);
        if (isNaN(v) || v < 0) l.descuento = 0;
        else if (v > max) { l.descuento = max; AppStore.toast('El descuento no puede superar el importe de la línea (' + this.moneda + ' ' + max.toFixed(2) + ').', 'warning'); }
        else l.descuento = Math.round(v * 100) / 100;
      },
      toggleRegalo: function (l) {
        if (!l.esRegalo) {
          l.esRegalo = true;
          l.precio = 0; l.descuento = 0;
        } else {
          l.esRegalo = false;
          l.precio = Number(l.precioOriginal);
        }
      },

      /* ---------- Autorización de supervisor ---------- */
      abrirAutorizar: function () {
        this.authError = ''; this.authModal = true;
        this.$nextTick(function () {
          var el = document.getElementById('pos-auth-usuario');
          if (el) el.focus();
        });
      },
      confirmarAutorizar: async function () {
        if (!this.authUsuario.trim() || !this.authPassword) { this.authError = 'Ingrese usuario y contraseña del supervisor.'; return; }
        this.authProcesando = true; this.authError = '';
        try {
          var res = await Api.autorizarVenta(this.authUsuario.trim(), this.authPassword);
          this.autorizacion = { usuario: this.authUsuario.trim(), password: this.authPassword, nombre: res.autorizadoPor };
          this.authModal = false;
          this.authPassword = '';
          AppStore.toast('Venta autorizada por ' + res.autorizadoPor + '.', 'exito');
        } catch (e) {
          this.authError = e.message;
        } finally { this.authProcesando = false; }
      },

      /* ---------- Cobro ---------- */
      cobrar: async function () {
        if (!this.puedeCobrar) return;
        if (this.requiereAutorizacion && !this.autorizacion) {
          AppStore.toast('Esta venta necesita la autorización de un gerente o administrador.', 'warning');
          this.abrirAutorizar();
          return;
        }
        this.procesando = true;
        try {
          var res = await Api.registrarVenta({
            clienteId: this.clienteId,
            metodoPago: this.metodoPago || this.cfg.METODO_PAGO_DEFAULT || 'Efectivo',
            montoRecibido: parseFloat(this.montoRecibido) || 0,
            almacenId: this.almacenVenta,
            autorizacion: this.autorizacion && (this.autorizacion.usuario ? { usuario: this.autorizacion.usuario, password: this.autorizacion.password } : null),
            items: this.carrito.map(function (i) {
              return { productoId: i.productoId, cantidad: i.cantidad, precio: i.esRegalo ? 0 : i.precio, descuento: i.descuento, esRegalo: i.esRegalo };
            })
          });
          this.ventaEmitida = res.venta;
          this.detalleEmitido = res.detalle;
          this.empresaEmitida = res.empresa;
          this.boletaAbierta = true;
          AppStore.toast('Boleta ' + res.venta.boleta + ' emitida correctamente.', 'exito');
          this.carrito = [];
          this.montoRecibido = '';
          this.autorizacion = null;
          await this.cargar();
        } catch (e) {
          if (e.code === 'AUTORIZACION' || e.code === 'FORBIDDEN') {
            this.authError = e.message;
            this.abrirAutorizar();
          }
          AppStore.toast(e.message, 'error');
        } finally { this.procesando = false; }
      },

      /* ---------- Ventas en espera ---------- */
      apartar: async function () {
        if (!this.carrito.length) { AppStore.toast('El carrito está vacío: no hay nada que apartar.', 'info'); return; }
        this.esperados = leerEsperados();
        this.esperados.push({
          id: 'ESP-' + Date.now(),
          fecha: new Date().toISOString().slice(0, 19).replace('T', ' '),
          clienteId: this.clienteId, metodoPago: this.metodoPago,
          total: this.totales.total, items: JSON.parse(JSON.stringify(this.carrito))
        });
        guardarEsperados(this.esperados);
        this.carrito = []; this.autorizacion = null; this.montoRecibido = '';
        AppStore.toast('Venta apartada. Puede retomarla cuando vuelva el cliente.', 'exito');
      },
      retomar: function (e) {
        var self = this;
        var disponible = true;
        e.items.forEach(function (it) {
          var st = self.stockAlmacen[it.productoId];
          if (st !== undefined && it.cantidad > st) disponible = false;
        });
        this.carrito = JSON.parse(JSON.stringify(e.items));
        this.carrito.forEach(function (l) {
          var st = self.stockAlmacen[l.productoId];
          if (st !== undefined) l.stockVenta = st;
        });
        this.clienteId = e.clienteId || 'PUBLICO';
        this.metodoPago = e.metodoPago || this.cfg.METODO_PAGO_DEFAULT || 'Efectivo';
        this.esperados = this.esperados.filter(function (x) { return x.id !== e.id; });
        guardarEsperados(this.esperados);
        this.esperaModal = false;
        if (!disponible) AppStore.toast('Atención: el stock cambió mientras la venta estaba apartada. Verifique cantidades.', 'warning');
      },
      eliminarEspera: function (e) {
        this.esperados = this.esperados.filter(function (x) { return x.id !== e.id; });
        guardarEsperados(this.esperados);
      },

      /* ---------- Cobro en efectivo: billetes rápidos ---------- */
      billete: function (v) {
        this.montoRecibido = v >= this.totales.total ? v : Math.round((this.totales.total + v) * 100) / 100;
      },

      /* ---------- Búsqueda / escáner ---------- */
      buscarEnter: function () {
        var q = this.busqueda.trim().toLowerCase();
        if (!q) return;
        var exacto = this.filtrados.find(function (p) { return p.sku.toLowerCase() === q; });
        if (!exacto) {
          var activos = this.productos.filter(function (p) { return p.sku.toLowerCase() === q; });
          exacto = activos.length ? Object.assign({}, activos[0], { stockVenta: this.stockAlmacen[activos[0].id] || 0 }) : null;
        }
        if (!exacto && this.filtrados.length === 1) exacto = this.filtrados[0];
        if (exacto) { this.agregar(exacto); this.busqueda = ''; }
      },
      focoBusqueda: function () {
        var el = document.getElementById('pos-busqueda');
        if (el) { el.focus(); el.select(); }
      },
      onTecla: function (ev) {
        if (!AppStore.estado || AppStore.estado.ruta !== 'pos') return;
        if (ev.key === 'F2') { ev.preventDefault(); this.focoBusqueda(); }
        else if (ev.key === 'F4') { ev.preventDefault(); if (this.puedeCobrar) this.cobrar(); }
        else if (ev.key === 'F8') { ev.preventDefault(); this.apartar(); }
      },

      imprimirBoleta: function () { window.print(); },
      cerrarBoleta: function () { this.boletaAbierta = false; },

      /* ---------- ADENDA 1.4: boleta como IMAGEN PNG ---------- */
      generarPngBoleta: async function () {
        if (!this.ventaEmitida) return null;
        var canvas = await NexoDocs.boletaCanvas(this.ventaEmitida, this.detalleEmitido, this.empresaEmitida || {});
        return canvas.toDataURL('image/png');
      },
      descargarImagenBoleta: async function () {
        try {
          var dataURL = await this.generarPngBoleta();
          if (!dataURL) return;
          NexoDocs.descargarArchivo(NexoDocs.boletaNombreArchivo(this.ventaEmitida), NexoDocs.dataURLaBlob(dataURL));
          AppStore.toast('Imagen de la boleta descargada.', 'exito');
        } catch (e) { AppStore.toast('No se pudo generar la imagen: ' + e.message, 'error'); }
      },

      /* ---------- Adenda 1.3: WhatsApp (ahora envía la IMAGEN de la boleta) ---------- */
      abrirWhatsapp: function () {
        if (!this.ventaEmitida) return;
        var self = this;
        var cli = this.clientes.find(function (c) { return c.id === self.ventaEmitida.clienteId; });
        this.waTelefono = (this.ventaEmitida.clienteTelefono || (cli ? cli.telefono : '')) || '';
        this.waModal = true;
      },
      confirmarWhatsapp: async function () {
        var tel = Utils.normalizarTelefono(this.waTelefono);
        if (!tel || tel.length < 11) { AppStore.toast('Ingrese un número de WhatsApp válido (9 dígitos).', 'warning'); return; }
        this.waEnviando = true;
        try {
          var dataURL = await this.generarPngBoleta();
          var mensaje = Utils.mensajeWhatsapp(this.ventaEmitida, this.detalleEmitido, this.empresaEmitida);
          var modo = await NexoDocs.enviarArchivoWhatsapp({
            telefono: tel,
            mensaje: mensaje,
            nombre: NexoDocs.boletaNombreArchivo(this.ventaEmitida),
            blob: dataURL
          });
          this.waModal = false;
          if (modo === 'cancelado') return;
          if (modo === 'share') {
            AppStore.toast('Boleta ' + this.ventaEmitida.boleta + ' compartida como imagen. Elija WhatsApp si no se abrió solo.', 'exito');
          } else {
            AppStore.toast('Imagen de la boleta descargada: adjúntela en el chat de WhatsApp que se abrió.', 'exito');
          }
          var self = this;
          Api.marcarWhatsapp(this.ventaEmitida.id, tel).then(function () {
            self.ventaEmitida.enviadoWhatsapp = 'Sí';
          }).catch(function (e) { AppStore.toast(e.message, 'warning'); });
        } catch (e) {
          AppStore.toast('No se pudo generar la imagen: ' + e.message, 'error');
        } finally { this.waEnviando = false; }
      }
    },
    template: `
<div>
  <page-header titulo="POS de Mostrador" subtitulo="Precios negociables, descuentos y regalos con autorización de gerente · F2 buscar · F4 cobrar · F8 apartar">
    <template #acciones>
      <button type="button" class="btn-secundario relative" @click="esperaModal = true" title="Ventas en espera (F8 para apartar)">
        <icon name="pausa" clase="w-4 h-4"></icon> En espera
        <span v-if="esperados.length" class="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 min-w-[18px] px-1 flex items-center justify-center">{{ esperados.length }}</span>
      </button>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar
      </button>
      <button type="button" class="btn-primario" @click="cobrar" :disabled="!puedeCobrar">
        <span v-if="procesando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <icon v-else name="dinero" clase="w-4 h-4"></icon>
        Cobrar {{ moneda }} {{ totales.total.toFixed(2) }}
      </button>
    </template>
  </page-header>

  <div v-if="fueraHorario" class="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-600/20 px-4 py-2.5 text-sm text-amber-800">
    <icon name="warning" clase="w-5 h-5 shrink-0"></icon>
    Está fuera del horario de atención configurado ({{ horarioInicioTxt }} – {{ horarioFinTxt }}). Puede vender, pero se registrará fuera de hora.
  </div>

  <div v-if="requiereAutorizacion" class="mb-4 rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-600/20 px-4 py-3 text-sm text-rose-800">
    <div class="flex items-start gap-2">
      <icon name="autorizar" clase="w-5 h-5 shrink-0 mt-0.5"></icon>
      <div class="flex-1">
        <p class="font-semibold">Esta venta requiere autorización de gerente/administrador</p>
        <ul class="list-disc ml-5 mt-1 space-y-0.5 text-xs">
          <li v-for="(a, i) in lineasAutorizacion" :key="i"><b>{{ a.nombre }}</b> — {{ a.motivo }}</li>
        </ul>
      </div>
      <button type="button" class="btn-primario shrink-0 py-1.5" @click="abrirAutorizar">
        <icon name="autorizar" clase="w-4 h-4"></icon> {{ autorizacion ? 'Autorizada' : 'Autorizar ahora' }}
      </button>
    </div>
    <p v-if="autorizacion" class="mt-2 text-xs font-medium text-emerald-700">Autorizada por: {{ autorizadoEtiqueta }} (se imprimirá en la boleta)</p>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-5 gap-4">
    <!-- Catálogo -->
    <div class="xl:col-span-3">
      <div class="nexo-card mb-4">
        <div class="relative">
          <icon name="search" clase="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
          <input id="pos-busqueda" v-model="busqueda" @keyup.enter="buscarEnter" type="text" class="input-texto pl-10" placeholder="Buscar por nombre o SKU · escanee el código y presione Enter para agregar..." autofocus>
        </div>
        <div v-if="categorias.length" class="flex flex-wrap gap-1.5 mt-3">
          <button type="button" @click="catSel = ''" class="text-xs font-medium rounded-full px-2.5 py-1 transition-colors"
            :class="catSel === '' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'">Todos</button>
          <button v-for="c in categorias" :key="c" type="button" @click="catSel = (catSel === c ? '' : c)"
            class="text-xs font-medium rounded-full px-2.5 py-1 transition-colors"
            :class="catSel === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'">{{ c }}</button>
        </div>
        <p class="mt-2 text-xs text-slate-400">Almacén de venta: <b class="text-slate-600">{{ almacenVenta }}</b> · {{ productos.length }} productos activos · Enter agrega coincidencia exacta</p>
      </div>

      <div v-if="cargando" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div v-for="i in 6" :key="i" class="nexo-card h-24 animate-pulse bg-slate-200/60"></div>
      </div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button v-for="p in filtrados" :key="p.id" type="button" @click="agregar(p)"
          class="nexo-card text-left hover:ring-2 hover:ring-blue-500/40 transition-all"
          :class="p.stockVenta <= 0 ? 'opacity-50' : ''">
          <p class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{{ p.nombre }}</p>
          <p class="text-[11px] text-slate-400 font-mono mt-0.5">{{ p.sku }}</p>
          <div class="flex items-center justify-between mt-2">
            <span class="text-base font-bold text-blue-700">{{ moneda }} {{ Number(p.precioVenta).toFixed(2) }}</span>
            <span class="text-xs font-semibold rounded-full px-2 py-0.5"
              :class="p.stockVenta <= 0 ? 'bg-rose-50 text-rose-600' : p.stockVenta <= 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'">
              {{ p.stockVenta }} {{ (p.unidad || '').slice(0, 3).toLowerCase() }}
            </span>
          </div>
        </button>
        <div v-if="!filtrados.length" class="col-span-full nexo-card text-center text-sm text-slate-400 py-10">
          Sin resultados para "{{ busqueda }}"
        </div>
      </div>
    </div>

    <!-- Carrito -->
    <div class="xl:col-span-2">
      <div class="nexo-card p-0 overflow-hidden sticky top-20">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2"><icon name="pos" clase="w-5 h-5 text-blue-600"></icon> Carrito ({{ carrito.length }})</h3>
          <div class="flex items-center gap-2">
            <button type="button" class="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40" :disabled="!carrito.length" @click="apartar" title="Apartar venta (F8)">Apartar</button>
            <button type="button" class="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-40" :disabled="!carrito.length" @click="limpiar">Vaciar</button>
          </div>
        </div>

        <div class="max-h-[42vh] overflow-y-auto nexo-scroll divide-y divide-slate-100">
          <div v-for="l in carrito" :key="l.productoId" class="px-4 py-2.5"
            :class="l.esRegalo ? 'bg-fuchsia-50/40' : ''">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">
                  {{ l.nombre }}
                  <span v-if="l.esRegalo" class="ml-1 inline-flex items-center rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-bold text-white align-middle">REGALO</span>
                </p>
                <p class="text-xs text-slate-400 font-mono">
                  {{ l.sku }}
                  <span v-if="l.precio < l.precioOriginal" class="line-through">{{ moneda }} {{ Number(l.precioOriginal).toFixed(2) }}</span>
                  <span v-if="!l.esRegalo && l.descuento > 0" class="text-emerald-600">−{{ moneda }} {{ Number(l.descuento).toFixed(2) }}</span>
                </p>
              </div>
              <button type="button" class="btn-icono shrink-0" title="Quitar" @click="quitar(l)"><icon name="x" clase="w-4 h-4"></icon></button>
            </div>

            <div class="flex items-center justify-between mt-1.5">
              <div class="flex items-center gap-1.5">
                <button type="button" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors" @click="menos(l)">−</button>
                <input v-model.number="l.cantidad" type="number" min="1" :max="l.stockVenta" class="input-texto w-14 text-center py-1">
                <button type="button" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors" @click="mas(l)">+</button>
              </div>
              <span class="text-sm font-bold tabular-nums" :class="l.esRegalo ? 'text-fuchsia-700' : 'text-slate-900'">{{ moneda }} {{ importeLinea(l).toFixed(2) }}</span>
            </div>

            <!-- Adenda 1.2: precio editable + descuento + regalo -->
            <div class="grid grid-cols-3 gap-1.5 mt-2 items-end">
              <div>
                <label class="block text-[10px] font-medium text-slate-400 uppercase tracking-wide">Precio</label>
                <input v-model.number="l.precio" @change="clampPrecio(l)" type="number" min="0" step="0.10"
                  class="input-texto py-1 text-sm" :class="[l.esRegalo ? 'opacity-40' : '', (l.precioMinimo > 0 && l.precio < l.precioMinimo) ? 'ring-2 ring-rose-400' : '']"
                  :disabled="l.esRegalo" title="Precio de venta editable">
              </div>
              <div>
                <label class="block text-[10px] font-medium text-slate-400 uppercase tracking-wide">Dscto {{ moneda }}</label>
                <input v-model.number="l.descuento" @change="clampDescuento(l)" type="number" min="0" step="0.10"
                  class="input-texto py-1 text-sm" :class="l.esRegalo ? 'opacity-40' : ''" :disabled="l.esRegalo" placeholder="0.00">
              </div>
              <button type="button" @click="toggleRegalo(l)" class="rounded-lg py-1.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                :class="l.esRegalo ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700'"
                title="Marcar como regalo (precio 0, descuenta stock)">
                <icon name="regalo" clase="w-3.5 h-3.5"></icon> Regalo
              </button>
            </div>
            <div class="flex items-center justify-between mt-1 text-[10px]">
              <span v-if="l.precioMinimo > 0" class="text-slate-400">Mínimo: {{ moneda }} {{ Number(l.precioMinimo).toFixed(2) }}{{ pctDescuento(l) > 0 ? ' · dscto. ' + pctDescuento(l).toFixed(1) + '%' : '' }}</span>
              <span v-else-if="pctDescuento(l) > 0" class="text-emerald-600">Descuento: {{ pctDescuento(l).toFixed(1) }}%</span>
              <span v-if="l.precioMinimo > 0 && l.precio < l.precioMinimo" class="font-semibold text-rose-600">Requiere autorización</span>
            </div>
          </div>
          <div v-if="!carrito.length" class="px-4 py-12 text-center text-sm text-slate-400">
            <icon name="pos" clase="w-10 h-10 mx-auto opacity-30"></icon>
            <p class="mt-2">Toque un producto para agregarlo</p>
            <p class="mt-1 text-xs">F2 buscar · F4 cobrar · F8 apartar</p>
          </div>
        </div>

        <div class="border-t border-slate-100 px-4 py-3 space-y-3 bg-white">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-forma">Cliente</label>
              <select v-model="clienteId" class="input-texto py-1.5">
                <option value="PUBLICO">Público General</option>
                <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.razonSocial }}</option>
              </select>
            </div>
            <div>
              <label class="label-forma">Método de pago</label>
              <select v-model="metodoPago" class="input-texto py-1.5">
                <option v-for="m in metodosPago" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>

          <div v-if="metodoEfectivo">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label-forma">Monto recibido</label>
                <input v-model="montoRecibido" type="number" min="0" step="0.10" class="input-texto py-1.5" :class="recibidoInsuficiente ? 'ring-2 ring-rose-400' : ''" placeholder="0.00">
              </div>
              <div>
                <label class="label-forma">Vuelto</label>
                <div class="input-texto py-1.5 font-bold text-emerald-700 tabular-nums" :class="vuelto > 0 ? 'bg-emerald-50' : ''">{{ moneda }} {{ vuelto.toFixed(2) }}</div>
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <button type="button" class="text-xs font-semibold rounded-lg px-2.5 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200" @click="montoRecibido = totales.total.toFixed(2)">Exacto</button>
              <button v-for="b in billetes" :key="b" type="button" class="text-xs font-semibold rounded-lg px-2.5 py-1 transition-colors"
                :class="b >= totales.total ? 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700' : 'bg-slate-50 text-slate-300'"
                :disabled="b < totales.total" @click="billete(b)">{{ moneda }} {{ b }}</button>
            </div>
          </div>
          <p v-if="recibidoInsuficiente" class="text-xs text-rose-600 font-medium">El monto recibido es menor al total.</p>

          <!-- Adenda 1.3: panel de FIADO -->
          <div v-if="fiadoActivo" class="rounded-xl px-4 py-3 text-sm ring-1 ring-inset" :class="!clienteSeleccionado ? 'bg-amber-50 ring-amber-300' : fiadoInfo && fiadoInfo.bloqueado ? 'bg-rose-50 ring-rose-300' : 'bg-slate-50 ring-slate-200'">
            <p class="font-semibold flex items-center gap-1.5" :class="!clienteSeleccionado ? 'text-amber-700' : fiadoInfo && fiadoInfo.bloqueado ? 'text-rose-700' : 'text-slate-700'">
              <icon name="fiados" clase="w-4 h-4"></icon> Venta al fiado (crédito)
            </p>
            <template v-if="!clienteSeleccionado">
              <p class="text-xs mt-1 text-amber-700">Seleccione un cliente registrado — el fiado no aplica a "Público General".</p>
            </template>
            <template v-else-if="fiadoInfo">
              <div class="mt-1.5 space-y-0.5 text-xs">
                <div class="flex justify-between"><span class="text-slate-500">Cliente</span><span class="font-medium">{{ fiadoInfo.nombre }}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Saldo actual</span><span class="tabular-nums">{{ moneda }} {{ fiadoInfo.saldo.toFixed(2) }}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Límite de crédito</span><span class="tabular-nums">{{ fiadoInfo.limite > 0 ? moneda + ' ' + fiadoInfo.limite.toFixed(2) : 'sin límite' }}</span></div>
                <div v-if="fiadoInfo.disponible !== null" class="flex justify-between"><span class="text-slate-500">Disponible</span><span class="tabular-nums" :class="fiadoInfo.excede ? 'font-bold text-rose-600' : 'text-emerald-700'">{{ moneda }} {{ fiadoInfo.disponible.toFixed(2) }}</span></div>
                <div class="flex justify-between border-t border-slate-200 pt-1"><span class="font-medium">Saldo si se fiara esta venta</span><span class="tabular-nums font-bold">{{ moneda }} {{ fiadoInfo.nuevoSaldo.toFixed(2) }}</span></div>
              </div>
              <p v-if="fiadoInfo.bloqueado" class="mt-1.5 text-xs font-semibold text-rose-600">Excede el límite de crédito. Registre un abono en Fiados o habilite "permitir exceder" en Configuración.</p>
              <p v-else-if="fiadoInfo.sinTelefono" class="mt-1.5 text-xs text-amber-600">Sugerencia: registre el teléfono del cliente para enviarle la boleta por WhatsApp.</p>
            </template>
          </div>

          <div class="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3 space-y-1 text-sm">
            <div class="flex justify-between text-slate-500"><span>Subtotal (lista)</span><span class="tabular-nums">{{ moneda }} {{ totalLista.toFixed(2) }}</span></div>
            <div v-if="totalDescuentos > 0" class="flex justify-between font-medium text-emerald-600"><span>Descuentos y regalos</span><span class="tabular-nums">-{{ moneda }} {{ totalDescuentos.toFixed(2) }}</span></div>
            <div class="flex justify-between text-slate-500"><span>Op. gravadas</span><span class="tabular-nums">{{ moneda }} {{ totales.subtotal.toFixed(2) }}</span></div>
            <div class="flex justify-between text-slate-500"><span>IGV {{ cfg.IGV_TASA || 18 }}% {{ totales.incluir ? '(incluido)' : '' }}</span><span class="tabular-nums">{{ moneda }} {{ totales.igv.toFixed(2) }}</span></div>
            <div class="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200"><span>TOTAL</span><span class="tabular-nums">{{ moneda }} {{ totales.total.toFixed(2) }}</span></div>
          </div>

          <button type="button" class="btn-primario w-full justify-center py-2.5" :disabled="!puedeCobrar" @click="cobrar">
            <span v-if="procesando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
            <icon v-else name="check" clase="w-5 h-5"></icon>
            {{ procesando ? 'Procesando venta...' : 'Cobrar y emitir boleta' }}
          </button>
          <p v-if="requiereAutorizacion && !autorizacion" class="text-xs text-rose-600 text-center font-medium">Falta autorización de gerente para completar esta venta.</p>
          <p v-else-if="autorizacion" class="text-xs text-emerald-600 text-center">Autorizada por {{ autorizadoEtiqueta }}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal autorización de supervisor -->
  <modal :abierto="authModal" titulo="Autorización de supervisor" subtitulo="Ingrese credenciales de un usuario admin o gerente" ancho="max-w-sm" @cerrar="authModal = false">
    <div v-if="lineasAutorizacion.length" class="mb-3 rounded-lg bg-amber-50 ring-1 ring-inset ring-amber-600/20 px-3 py-2 text-xs text-amber-800">
      <p class="font-semibold mb-1">Motivo de la autorización:</p>
      <ul class="list-disc ml-4 space-y-0.5">
        <li v-for="(a, i) in lineasAutorizacion" :key="i"><b>{{ a.nombre }}</b> — {{ a.motivo }}</li>
      </ul>
    </div>
    <label class="label-forma">Usuario supervisor</label>
    <input id="pos-auth-usuario" v-model="authUsuario" type="text" class="input-texto" placeholder="p. ej. mgerente" autocomplete="off">
    <label class="label-forma mt-3">Contraseña</label>
    <input v-model="authPassword" @keyup.enter="confirmarAutorizar" type="password" class="input-texto" placeholder="••••••••" autocomplete="off">
    <p v-if="authError" class="mt-2 text-xs font-medium text-rose-600">{{ authError }}</p>
    <p class="mt-3 text-[11px] text-slate-400 leading-relaxed">Las credenciales se validan en el servidor y el nombre del autorizador queda registrado en la boleta y en la auditoría del sistema.</p>
    <template #pie>
      <button type="button" class="btn-secundario" @click="authModal = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="authProcesando" @click="confirmarAutorizar">
        <span v-if="authProcesando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <icon v-else name="autorizar" clase="w-4 h-4"></icon> Autorizar
      </button>
    </template>
  </modal>

  <!-- Modal ventas en espera -->
  <modal :abierto="esperaModal" titulo="Ventas en espera" :subtitulo="esperados.length ? esperados.length + ' venta(s) apartada(s)' : 'No hay ventas apartadas'" ancho="max-w-md" @cerrar="esperaModal = false">
    <div v-if="esperados.length" class="divide-y divide-slate-100">
      <div v-for="e in esperados" :key="e.id" class="py-2.5 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-800">{{ e.items.length }} producto(s) · {{ moneda }} {{ Number(e.total).toFixed(2) }}</p>
          <p class="text-xs text-slate-400">{{ e.fecha }} · {{ (e.items.map(function (i) { return i.nombre; }).join(', ') || '').slice(0, 60) }}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" class="btn-secundario py-1.5 text-xs" @click="retomar(e)"><icon name="check" clase="w-3.5 h-3.5"></icon> Retomar</button>
          <button type="button" class="btn-icono text-rose-500 hover:text-rose-700" title="Descartar" @click="eliminarEspera(e)"><icon name="trash" clase="w-4 h-4"></icon></button>
        </div>
      </div>
    </div>
    <p v-else class="text-sm text-slate-400 text-center py-6">Use el botón <b>Apartar</b> (o F8) para guardar el carrito actual y atender a otro cliente.</p>
    <template #pie>
      <button type="button" class="btn-secundario" @click="esperaModal = false">Cerrar</button>
    </template>
  </modal>

  <!-- Boleta emitida -->
  <modal :abierto="boletaAbierta" titulo="Boleta de Venta emitida" :subtitulo="ventaEmitida ? 'Comprobante ' + ventaEmitida.boleta : ''" ancho="max-w-md">
    <venta-boleta v-if="ventaEmitida" :venta="ventaEmitida" :detalle="detalleEmitido" :empresa="empresaEmitida"></venta-boleta>
    <template #pie>
      <button type="button" class="btn-secundario" @click="cerrarBoleta">Cerrar</button>
      <button type="button" class="btn-secundario" :disabled="waEnviando" @click="descargarImagenBoleta" title="Descargar la boleta como imagen PNG">
        <icon name="download" clase="w-4 h-4"></icon> Imagen PNG
      </button>
      <button type="button" class="btn-secundario !text-emerald-700 hover:!bg-emerald-50" @click="abrirWhatsapp">
        <icon name="whatsapp" clase="w-4 h-4 text-emerald-600"></icon> Enviar por WhatsApp
      </button>
      <button type="button" class="btn-primario" @click="imprimirBoleta"><icon name="boleta" clase="w-4 h-4"></icon> Imprimir boleta</button>
    </template>
  </modal>

  <!-- Modal WhatsApp (Adenda 1.4: envía la boleta como IMAGEN PNG) -->
  <modal :abierto="waModal" titulo="Enviar boleta por WhatsApp" subtitulo="Se envía la boleta como IMAGEN (PNG) con el mensaje redactado" ancho="max-w-sm" @cerrar="waModal = false">
    <template v-if="ventaEmitida">
      <div class="rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/10 px-4 py-3 text-sm mb-4">
        <div class="flex justify-between"><span class="text-emerald-700">Boleta</span><b class="font-mono">{{ ventaEmitida.boleta }}</b></div>
        <div class="flex justify-between mt-1"><span class="text-emerald-700">Cliente</span><span>{{ ventaEmitida.clienteNombre }}</span></div>
        <div class="flex justify-between mt-1"><span class="text-emerald-700">Total</span><b class="tabular-nums">{{ moneda }} {{ Number(ventaEmitida.total).toFixed(2) }}</b></div>
      </div>
      <label class="label-forma">Número de WhatsApp</label>
      <input v-model="waTelefono" type="tel" class="input-texto font-mono" placeholder="9 8765 4321">
      <p class="mt-2 text-[11px] text-slate-400">Si el cliente está registrado, su teléfono aparece automáticamente. Si no, escriba el número aquí — el cliente no necesita estar registrado para recibir su boleta.</p>
      <p class="mt-2 text-[11px] rounded-lg bg-emerald-50 ring-1 ring-inset ring-emerald-600/10 px-3 py-2 text-emerald-800">La boleta viaja como <b>imagen PNG</b> en formato ticket. En celulares se comparte directo; en computadora se descarga la imagen y se abre WhatsApp con el mensaje listo para adjuntarla.</p>
    </template>
    <template #pie>
      <button type="button" class="btn-secundario" @click="waModal = false">Cancelar</button>
      <button type="button" class="btn-primario !bg-emerald-600 hover:!bg-emerald-700" :disabled="waEnviando" @click="confirmarWhatsapp">
        <span v-if="waEnviando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        <icon v-else name="whatsapp" clase="w-4 h-4"></icon> Enviar imagen
      </button>
    </template>
  </modal>
</div>`
  };

  /* Importe de una línea del carrito (0 si es regalo). */
  function self_importe(l) {
    if (l.esRegalo) return 0;
    var v = l.cantidad * Number(l.precio || 0) - Number(l.descuento || 0);
    return Math.round(Math.max(0, v) * 100) / 100;
  }
})();
