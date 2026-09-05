/**
 * NexoERP — vista-config.js (solo admin)
 * Configuración general + ADENDA: identidad fiscal de la empresa
 * (RUC, razón social, logo por URL o Base64), IGV, datos de la
 * boleta, horario de atención y método de pago por defecto.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['config'] = {
    data: function () {
      return {
        form: {
          NOMBRE_EMPRESA: '', RAZON_SOCIAL: '', RUC: '',
          LOGO_URL: '', LOGO_BASE64: '',
          MONEDA_SIMBOLO: 'S/', METODO_VALUACION: 'PROMEDIO',
          PERMITIR_STOCK_NEGATIVO: 'No', DIAS_ALERTA_VENCIMIENTO: 30,
          IGV_INCLUIDO: 'Sí', IGV_TASA: 18, PREFIJO_BOLETA: 'BV-',
          MENSAJE_BOLETA: '', ALMACEN_VENTA: '', METODO_PAGO_DEFAULT: 'Efectivo',
          HORARIO_INICIO: '08:00', HORARIO_FIN: '22:00',
          DESCUENTO_MAX_PCT: 15, DESCUENTO_REQUIERE_AUTORIZACION: 'Sí', REGALO_REQUIERE_AUTORIZACION: 'Sí',
          FIADO_PERMITIR_EXCEDER: 'No', FIADO_DIAS_ALERTA: 30, WHATSAPP_PREFIJO: '51',
          /* Adenda 1.6 */
          PAIS: 'PER', IMPUESTO_NOMBRE: 'IGV',
          SERIE_BOLETA: 'B001', SERIE_FACTURA: 'F001', SERIE_NC: 'FC01', SERIE_ND: 'FD01', COMPROBANTE_AUTO: 'Sí',
          SUNAT_MODO: 'desactivado', SUNAT_API_URL: '', SUNAT_API_USUARIO: '', SUNAT_API_PASSWORD: '',
          SUNAT_COMPANY_ID: 1, SUNAT_BRANCH_ID: 1, SUNAT_METODO_ENVIO: 'resumen_diario',
          QR_YAPE_NUMERO: '', QR_PLIN_NUMERO: '', QR_BANCO: '',
          FIDEL_ACTIVA: 'No', FIDEL_MONTO_PUNTO: 10, FIDEL_VALOR_PUNTO: 0.10, FIDEL_MIN_CANJE: 100,
          RECORD_ACTIVO: 'Sí', RECORD_EMAIL: '', BACKUP_ACTIVO: 'No', BACKUP_RETENCION: 15,
          CATALOGO_ACTIVO: 'No', CATALOGO_MENSAJE: '', ALMACEN_RECEPCION: ''
        },
        paises: [], paisSel: 'PER', paisAplicando: false,
        tcInfo: null,
        catalogoToken: '',
        almacenes: [], logoPreview: '', subiendoLogo: false,
        guardando: false, reiniciando: false
      };
    },
    computed: {
      esDemo: function () { return Api.esDemo(); },
      logoActual: function () {
        return this.logoPreview || this.form.LOGO_BASE64 || this.form.LOGO_URL || '';
      }
    },
    async mounted() {
      try {
        var self = this;
        var resultados = await Promise.all([Api.configGet(), Api.almacenes()]);
        var cfg = resultados[0];
        this.almacenes = resultados[1].filter(function (a) { return a.estado === 'ACTIVO'; });
        this.form = {
          NOMBRE_EMPRESA: cfg.NOMBRE_EMPRESA || 'NexoERP',
          RAZON_SOCIAL: cfg.RAZON_SOCIAL || cfg.NOMBRE_EMPRESA || '',
          RUC: cfg.RUC || '',
          LOGO_URL: cfg.LOGO_URL || '',
          LOGO_BASE64: cfg.LOGO_BASE64 || '',
          MONEDA_SIMBOLO: cfg.MONEDA_SIMBOLO || 'S/',
          METODO_VALUACION: cfg.METODO_VALUACION || 'PROMEDIO',
          PERMITIR_STOCK_NEGATIVO: String(cfg.PERMITIR_STOCK_NEGATIVO || 'No').toUpperCase() === 'SI' ? 'Sí' : 'No',
          DIAS_ALERTA_VENCIMIENTO: parseInt(cfg.DIAS_ALERTA_VENCIMIENTO, 10) || 30,
          IGV_INCLUIDO: String(cfg.IGV_INCLUIDO || 'Sí').toUpperCase() === 'NO' ? 'No' : 'Sí',
          IGV_TASA: parseFloat(cfg.IGV_TASA) || 18,
          PREFIJO_BOLETA: cfg.PREFIJO_BOLETA || 'BV-',
          MENSAJE_BOLETA: cfg.MENSAJE_BOLETA || '',
          ALMACEN_VENTA: cfg.ALMACEN_VENTA || (this.almacenes.length ? this.almacenes[0].id : ''),
          METODO_PAGO_DEFAULT: cfg.METODO_PAGO_DEFAULT || 'Efectivo',
          HORARIO_INICIO: cfg.HORARIO_INICIO || '08:00',
          HORARIO_FIN: cfg.HORARIO_FIN || '22:00',
          DESCUENTO_MAX_PCT: parseFloat(cfg.DESCUENTO_MAX_PCT) || 0,
          DESCUENTO_REQUIERE_AUTORIZACION: String(cfg.DESCUENTO_REQUIERE_AUTORIZACION || 'Sí').toUpperCase() === 'NO' ? 'No' : 'Sí',
          REGALO_REQUIERE_AUTORIZACION: String(cfg.REGALO_REQUIERE_AUTORIZACION || 'Sí').toUpperCase() === 'NO' ? 'No' : 'Sí',
          FIADO_PERMITIR_EXCEDER: String(cfg.FIADO_PERMITIR_EXCEDER || 'No').toUpperCase() === 'NO' ? 'No' : 'Sí',
          FIADO_DIAS_ALERTA: parseInt(cfg.FIADO_DIAS_ALERTA, 10) || 30,
          WHATSAPP_PREFIJO: cfg.WHATSAPP_PREFIJO || '51',
          /* Adenda 1.6 */
          PAIS: cfg.PAIS || 'PER', IMPUESTO_NOMBRE: cfg.IMPUESTO_NOMBRE || 'IGV',
          SERIE_BOLETA: cfg.SERIE_BOLETA || 'B001', SERIE_FACTURA: cfg.SERIE_FACTURA || 'F001',
          SERIE_NC: cfg.SERIE_NC || 'FC01', SERIE_ND: cfg.SERIE_ND || 'FD01',
          COMPROBANTE_AUTO: String(cfg.COMPROBANTE_AUTO || 'Sí').toUpperCase() === 'NO' ? 'No' : 'Sí',
          SUNAT_MODO: cfg.SUNAT_MODO || 'desactivado',
          SUNAT_API_URL: cfg.SUNAT_API_URL || '', SUNAT_API_USUARIO: cfg.SUNAT_API_USUARIO || '', SUNAT_API_PASSWORD: cfg.SUNAT_API_PASSWORD || '',
          SUNAT_COMPANY_ID: parseInt(cfg.SUNAT_COMPANY_ID, 10) || 1, SUNAT_BRANCH_ID: parseInt(cfg.SUNAT_BRANCH_ID, 10) || 1,
          SUNAT_METODO_ENVIO: cfg.SUNAT_METODO_ENVIO || 'resumen_diario',
          QR_YAPE_NUMERO: cfg.QR_YAPE_NUMERO || '', QR_PLIN_NUMERO: cfg.QR_PLIN_NUMERO || '', QR_BANCO: cfg.QR_BANCO || '',
          FIDEL_ACTIVA: String(cfg.FIDEL_ACTIVA || 'No').toUpperCase() === 'NO' ? 'No' : 'Sí',
          FIDEL_MONTO_PUNTO: parseFloat(cfg.FIDEL_MONTO_PUNTO) || 10,
          FIDEL_VALOR_PUNTO: parseFloat(cfg.FIDEL_VALOR_PUNTO) || 0.10,
          FIDEL_MIN_CANJE: parseInt(cfg.FIDEL_MIN_CANJE, 10) || 100,
          RECORD_ACTIVO: String(cfg.RECORD_ACTIVO || 'Sí').toUpperCase() === 'NO' ? 'No' : 'Sí',
          RECORD_EMAIL: cfg.RECORD_EMAIL || '',
          BACKUP_ACTIVO: String(cfg.BACKUP_ACTIVO || 'No').toUpperCase() === 'NO' ? 'No' : 'Sí',
          BACKUP_RETENCION: parseInt(cfg.BACKUP_RETENCION, 10) || 15,
          CATALOGO_ACTIVO: String(cfg.CATALOGO_ACTIVO || 'No').toUpperCase() === 'NO' ? 'No' : 'Sí',
          CATALOGO_TOKEN: cfg.CATALOGO_TOKEN || '', CATALOGO_MENSAJE: cfg.CATALOGO_MENSAJE || '',
          ALMACEN_RECEPCION: cfg.ALMACEN_RECEPCION || (this.almacenes.length ? this.almacenes[0].id : '')
        };
        this.paisSel = this.form.PAIS;
        this.catalogoToken = this.form.CATALOGO_TOKEN;
        /* Adenda 1.6: catálogo de países para el selector */
        try {
          var resP = await Api.paises();
          this.paises = resP.paises || [];
        } catch (e2) { this.paises = []; }
        AppStore.estado.cfg = cfg;
        window.__nexoerp_cfg = cfg;
      } catch (e) { AppStore.toast(e.message, 'error'); }
    },
    methods: {
      guardar: async function () {
        if (this.form.RUC && !/^\d{11}$/.test(String(this.form.RUC).trim())) {
          AppStore.toast('El RUC debe tener exactamente 11 dígitos numéricos.', 'warning');
          return;
        }
        this.guardando = true;
        try {
          var cfg = await Api.configSave(this.form);
          AppStore.estado.cfg = cfg;
          window.__nexoerp_cfg = cfg;
          this.logoPreview = '';
          AppStore.toast('Configuración guardada. La boleta y el POS ya usan los nuevos datos.', 'exito');
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      /* Adenda: convierte el logo a Base64 ligero (< 45 KB) reduciendo
       * tamaño con canvas (máx. 200 px) para caber en una celda de Sheets. */
      procesarLogo: function (ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) { AppStore.toast('Seleccione un archivo de imagen (PNG o JPG).', 'warning'); return; }
        var self = this;
        var img = new Image();
        img.onload = function () {
          try {
            var max = 200;
            var escala = Math.min(1, max / Math.max(img.width, img.height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * escala));
            canvas.height = Math.max(1, Math.round(img.height * escala));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            var b64 = canvas.toDataURL('image/png');
            if (b64.length > 45000) {
              b64 = canvas.toDataURL('image/jpeg', 0.82);
              if (b64.length > 45000) {
                AppStore.toast('La imagen es demasiado grande incluso reducida. Use una URL de logo o un archivo más pequeño.', 'error');
                return;
              }
            }
            self.form.LOGO_BASE64 = b64;
            self.logoPreview = b64;
            AppStore.toast('Logo cargado (' + Math.round(b64.length / 1024) + ' KB). No olvide guardar los cambios.', 'exito');
          } catch (e) { AppStore.toast('No se pudo procesar la imagen.', 'error'); }
        };
        img.onerror = function () { AppStore.toast('No se pudo leer la imagen seleccionada.', 'error'); };
        img.src = URL.createObjectURL(file);
        ev.target.value = '';
      },
      quitarLogo: function () { this.form.LOGO_BASE64 = ''; this.form.LOGO_URL = ''; this.logoPreview = ''; },
      reiniciarDemo: async function () {
        if (!this.esDemo) return;
        var ok = await AppStore.confirmar({
          titulo: 'Reiniciar datos de demostración',
          mensaje: 'Se eliminarán TODOS los datos locales de la demo (incluidos sus cambios) y se regenerará el dataset inicial. Esta acción no se puede deshacer.',
          okLabel: 'Reiniciar demo', peligro: true
        });
        if (!ok) return;
        this.reiniciando = true;
        try {
          await DemoStore.reiniciar();
          AppStore.toast('Dataset de demostración regenerado.', 'exito');
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.reiniciando = false; }
      },
      /* Adenda 1.5: vuelve a ejecutar el asistente de inicio desde cero. */
      abrirAsistente: function () { AppStore.irA('asistente'); },

      /* ---------- Adenda 1.6: país, SUNAT, tareas y catálogo ---------- */
      aplicarPais: async function () {
        if (!this.paisSel) return;
        this.paisAplicando = true;
        try {
          var res = await Api.aplicarPais(this.paisSel, 'Sí');
          this.form.PAIS = res.pais;
          var cfg = await Api.configGet();
          this.form.MONEDA_SIMBOLO = cfg.MONEDA_SIMBOLO;
          this.form.IGV_TASA = parseFloat(cfg.IGV_TASA) || 18;
          this.form.IGV_INCLUIDO = String(cfg.IGV_INCLUIDO || 'Sí').toUpperCase() === 'NO' ? 'No' : 'Sí';
          this.form.IMPUESTO_NOMBRE = cfg.IMPUESTO_NOMBRE || 'IGV';
          this.form.WHATSAPP_PREFIJO = cfg.WHATSAPP_PREFIJO || this.form.WHATSAPP_PREFIJO;
          AppStore.estado.cfg = cfg;
          window.__nexoerp_cfg = cfg;
          AppStore.toast('Localización aplicada: ' + res.pais + '. Revise moneda e impuestos y luego presione Guardar cambios.', 'exito', 6000);
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.paisAplicando = false; }
      },
      consultarTc: async function () {
        try {
          this.tcInfo = await Api.tcConsultar();
          var cfg2 = await Api.configGet();
          AppStore.estado.cfg = cfg2;
          AppStore.toast('Tipo de cambio: ' + this.tcInfo.valor + ' (' + this.tcInfo.fuente + ').', 'exito');
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      instalarTareas: async function (desactivar) {
        try {
          var res = await Api.tareasInstalar(desactivar);
          if (desactivar) AppStore.toast('Tareas programadas desactivadas.', 'exito');
          else AppStore.toast('Tareas programadas activadas: ' + (res.creados || []).join(', '), 'exito', 7000);
        } catch (e) { AppStore.toast(e.message, 'error', 7000); }
      },
      probarTareas: async function () {
        try {
          var res = await Api.tareasEjecutar();
          AppStore.toast('Revisión ejecutada: ' + res.total + ' aviso(s) nuevos en la campana.', 'exito', 6000);
        } catch (e) { AppStore.toast(e.message, 'error', 7000); }
      },
      backupAhora: async function () {
        try {
          var res = await Api.backupAhora();
          AppStore.toast('Respaldo creado: ' + res.archivo, 'exito', 7000);
        } catch (e) { AppStore.toast(e.message, 'error', 7000); }
      },
      regenerarCatalogo: async function () {
        try {
          var res = await Api.catalogoToken();
          this.catalogoToken = res.token;
          this.form.CATALOGO_ACTIVO = 'Sí';
          AppStore.toast('Token del catálogo público regenerado. Guarde los cambios.', 'exito');
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      copiarLinkCatalogo: function () {
        var base = location.origin + location.pathname.replace(/index\.html$/, '');
        var url = base + 'catalogo.html?token=' + encodeURIComponent(this.catalogoToken);
        var self = this;
        navigator.clipboard.writeText(url).then(function () {
          AppStore.toast('Enlace copiado: ' + url, 'exito', 7000);
        }).catch(function () { AppStore.toast(url, 'info', 10000); });
      }
    },
    template: `
<div>
  <page-header titulo="Configuración del Sistema" subtitulo="Parámetros generales, identidad fiscal de la empresa y datos de la boleta de venta">
    <template #acciones>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">
        <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        {{ guardando ? 'Guardando...' : 'Guardar cambios' }}
      </button>
    </template>
  </page-header>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <!-- Identidad fiscal -->
    <div class="nexo-card lg:col-span-2">
      <h3 class="font-semibold text-slate-800 text-sm mb-1">Identidad fiscal de la empresa</h3>
      <p class="text-xs text-slate-400 mb-4">Aparece en la cabecera de cada Boleta de Venta emitida por el POS.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label-forma">RUC (11 dígitos)</label>
          <input v-model="form.RUC" type="text" class="input-texto font-mono" maxlength="11" placeholder="20512345678">
        </div>
        <div>
          <label class="label-forma">Razón social / Nombre comercial</label>
          <input v-model="form.RAZON_SOCIAL" type="text" class="input-texto" placeholder="Mi Empresa S.A.C.">
        </div>
        <div class="sm:col-span-2">
          <label class="label-forma">Logotipo corporativo</label>
          <div class="flex items-start gap-4">
            <div class="w-24 h-24 rounded-xl ring-1 ring-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="logoActual" :src="logoActual" alt="Logo" class="max-w-full max-h-full object-contain">
              <icon v-else name="cajas" clase="w-8 h-8 text-slate-300"></icon>
            </div>
            <div class="flex-1 space-y-2">
              <div>
                <label class="label-forma">Opción A — URL pública de la imagen (recomendado)</label>
                <input v-model="form.LOGO_URL" type="url" class="input-texto" placeholder="https://.../logo.png">
              </div>
              <div>
                <label class="label-forma">Opción B — Subir archivo (se reduce a 200 px y guarda en Base64)</label>
                <div class="flex items-center gap-2">
                  <label class="btn-secundario cursor-pointer">
                    <icon name="download" clase="w-4 h-4 rotate-180"></icon> Seleccionar imagen
                    <input type="file" accept="image/*" class="hidden" @change="procesarLogo">
                  </label>
                  <button v-if="logoActual" type="button" class="btn-icono text-rose-500 hover:text-rose-700" title="Quitar logo" @click="quitarLogo">
                    <icon name="trash" clase="w-4 h-4"></icon>
                  </button>
                </div>
                <p class="text-[11px] text-slate-400 mt-1">Si define ambos, la boleta prioriza el archivo subido. La Base64 tiene un límite de 45 KB (Google Sheets).</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-slate-100 my-5"></div>

      <h3 class="font-semibold text-slate-800 text-sm mb-1">Boleta de venta y POS</h3>
      <p class="text-xs text-slate-400 mb-4">Comportamiento del comprobante, del almacén que despacha y de los métodos de pago.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Prefijo de boleta (serie)</label>
          <input v-model="form.PREFIJO_BOLETA" type="text" class="input-texto font-mono" maxlength="8" placeholder="BV-">
        </div>
        <div>
          <label class="label-forma">¿Los precios incluyen IGV?</label>
          <select v-model="form.IGV_INCLUIDO" class="input-texto"><option>Sí</option><option>No</option></select>
          <p class="text-[11px] text-slate-400 mt-1">Con "Sí", el total de la boleta desglosa el IGV hacia atrás (práctica habitual en Perú).</p>
        </div>
        <div>
          <label class="label-forma">Tasa IGV (%)</label>
          <input v-model.number="form.IGV_TASA" type="number" min="0" max="100" class="input-texto">
        </div>
        <div>
          <label class="label-forma">Método de pago por defecto</label>
          <select v-model="form.METODO_PAGO_DEFAULT" class="input-texto">
            <option>Efectivo</option><option>Yape</option><option>Plin</option><option>Tarjeta</option><option>Fiado</option>
          </select>
        </div>
        <div>
          <label class="label-forma">Almacén de venta (despacho del POS)</label>
          <select v-model="form.ALMACEN_VENTA" class="input-texto">
            <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }} ({{ a.codigo }})</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label-forma">Horario inicio</label>
            <input v-model="form.HORARIO_INICIO" type="time" class="input-texto">
          </div>
          <div>
            <label class="label-forma">Horario fin</label>
            <input v-model="form.HORARIO_FIN" type="time" class="input-texto">
          </div>
        </div>
        <div class="sm:col-span-2">
          <label class="label-forma">Mensaje al pie de la boleta</label>
          <input v-model="form.MENSAJE_BOLETA" type="text" class="input-texto" placeholder="¡Gracias por su compra! Cambios dentro de 7 días...">
        </div>

        <!-- Adenda 1.2: políticas de descuentos, regalos y autorización -->
        <div class="sm:col-span-2 rounded-xl bg-blue-50/60 ring-1 ring-inset ring-blue-600/10 p-4">
          <p class="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2"><icon name="autorizar" clase="w-4 h-4"></icon> Políticas de precios, descuentos y regalos (POS)</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="label-forma">Descuento máximo sin autorización (%)</label>
              <input v-model.number="form.DESCUENTO_MAX_PCT" type="number" min="0" max="100" class="input-texto">
              <p class="text-[11px] text-slate-500 mt-1">0 = sin límite; 15 = un descuento mayor exige gerente.</p>
            </div>
            <div>
              <label class="label-forma">¿Exceder el máximo exige autorización?</label>
              <select v-model="form.DESCUENTO_REQUIERE_AUTORIZACION" class="input-texto"><option>Sí</option><option>No</option></select>
            </div>
            <div>
              <label class="label-forma">¿Regalos exigen autorización?</label>
              <select v-model="form.REGALO_REQUIERE_AUTORIZACION" class="input-texto"><option>Sí</option><option>No</option></select>
            </div>
          </div>
          <p class="text-[11px] text-blue-800/70 mt-2">Vender por debajo del <b>precio mínimo</b> del producto también exige autorización cuando la política está activa. El autorizador queda registrado en la boleta y en la auditoría.</p>
        </div>

        <!-- Adenda 1.3: fiados y WhatsApp -->
        <div class="sm:col-span-2 rounded-xl bg-rose-50/60 ring-1 ring-inset ring-rose-600/10 p-4">
          <p class="text-sm font-semibold text-rose-900 mb-3 flex items-center gap-2"><icon name="fiados" clase="w-4 h-4"></icon> Fiados (venta a crédito) y WhatsApp</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="label-forma">¿Permitir fiar sobre el límite del cliente?</label>
              <select v-model="form.FIADO_PERMITIR_EXCEDER" class="input-texto"><option>No</option><option>Sí</option></select>
              <p class="text-[11px] text-slate-500 mt-1">Con "No", si el saldo supera el límite del cliente el POS bloquea la venta fiada.</p>
            </div>
            <div>
              <label class="label-forma">Alerta de fiado vencido (días)</label>
              <input v-model.number="form.FIADO_DIAS_ALERTA" type="number" min="1" max="365" class="input-texto">
              <p class="text-[11px] text-slate-500 mt-1">Aparece en Fiados y en el Panel de Control como alerta de cobro.</p>
            </div>
            <div>
              <label class="label-forma">Prefijo país para WhatsApp</label>
              <input v-model="form.WHATSAPP_PREFIJO" type="text" class="input-texto font-mono" maxlength="4" placeholder="51">
              <p class="text-[11px] text-slate-500 mt-1">Se antepone a los números de 9 dígitos al construir el enlace wa.me de las boletas y proformas.</p>
            </div>
          </div>
          <p class="text-[11px] text-rose-800/70 mt-2">El límite de crédito por cliente se configura en la ficha de cada cliente. El saldo del cuaderno de fiados solo lo mueven las ventas FIADAS y los abonos.</p>
        </div>

        <!-- Adenda 1.6: país e impuestos -->
        <div class="sm:col-span-2 rounded-xl bg-sky-50/60 ring-1 ring-inset ring-sky-600/10 p-4">
          <p class="text-sm font-semibold text-sky-900 mb-3 flex items-center gap-2"><icon name="config" clase="w-4 h-4"></icon> País e impuestos (Perú por defecto · todo editable)</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label class="label-forma">País de operación</label>
              <select v-model="paisSel" class="input-texto">
                <option v-for="p in paises" :key="p.codigo" :value="p.codigo">{{ p.nombre }} — {{ p.moneda }} ({{ p.impuesto }} {{ p.tasa }}%)</option>
              </select>
            </div>
            <button type="button" class="btn-secundario py-2" :disabled="paisAplicando" @click="aplicarPais">{{ paisAplicando ? 'Aplicando...' : 'Aplicar localización' }}</button>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label-forma">Nombre del impuesto</label>
                <input v-model="form.IMPUESTO_NOMBRE" type="text" class="input-texto">
              </div>
              <div>
                <label class="label-forma">Tasa (%)</label>
                <input v-model.number="form.IGV_TASA" type="number" min="0" max="100" step="0.01" class="input-texto">
              </div>
            </div>
          </div>
          <p class="text-[11px] text-sky-800/70 mt-2">Al aplicar el país se autocompletan moneda, símbolo, impuesto y prefijo WhatsApp (después puede editarlos). La facturación electrónica SUNAT solo aplica a Perú; los demás países usan comprobantes internos con serie/correlativo y libro de ventas genérico.</p>
        </div>

        <!-- Adenda 1.6: facturación SUNAT -->
        <div class="sm:col-span-2 rounded-xl bg-indigo-50/60 ring-1 ring-inset ring-indigo-600/10 p-4">
          <p class="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2"><icon name="boleta" clase="w-4 h-4"></icon> Facturación electrónica SUNAT (Perú)</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="label-forma">Modo de facturación</label>
              <select v-model="form.SUNAT_MODO" class="input-texto">
                <option value="desactivado">Desactivado (boleta interna)</option>
                <option value="manual">Manual (series + JSON para el API)</option>
                <option value="api">API automática (envía a SUNAT)</option>
              </select>
            </div>
            <div>
              <label class="label-forma">Serie boletas (03)</label>
              <input v-model="form.SERIE_BOLETA" type="text" class="input-texto font-mono uppercase" maxlength="4">
            </div>
            <div>
              <label class="label-forma">Serie facturas (01)</label>
              <input v-model="form.SERIE_FACTURA" type="text" class="input-texto font-mono uppercase" maxlength="4">
            </div>
            <div>
              <label class="label-forma">Serie N. Crédito (07)</label>
              <input v-model="form.SERIE_NC" type="text" class="input-texto font-mono uppercase" maxlength="4">
            </div>
            <div>
              <label class="label-forma">Serie N. Débito (08)</label>
              <input v-model="form.SERIE_ND" type="text" class="input-texto font-mono uppercase" maxlength="4">
            </div>
            <div>
              <label class="label-forma">RUC → Factura automática</label>
              <select v-model="form.COMPROBANTE_AUTO" class="input-texto"><option>Sí</option><option>No</option></select>
            </div>
            <div class="sm:col-span-3">
              <label class="label-forma">URL del API de facturación (Laravel/Greenter)</label>
              <input v-model="form.SUNAT_API_URL" type="url" class="input-texto font-mono text-xs" placeholder="https://mi-api-facturacion.onrender.com">
            </div>
            <div>
              <label class="label-forma">Usuario (email) del API</label>
              <input v-model="form.SUNAT_API_USUARIO" type="text" class="input-texto" autocomplete="off">
            </div>
            <div>
              <label class="label-forma">Contraseña del API</label>
              <input v-model="form.SUNAT_API_PASSWORD" type="password" class="input-texto" autocomplete="new-password">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label-forma">Company ID</label>
                <input v-model.number="form.SUNAT_COMPANY_ID" type="number" min="1" class="input-texto">
              </div>
              <div>
                <label class="label-forma">Branch ID</label>
                <input v-model.number="form.SUNAT_BRANCH_ID" type="number" min="1" class="input-texto">
              </div>
            </div>
          </div>
          <p class="text-[11px] text-indigo-800/70 mt-2">Modo <b>manual</b>: NexoERP genera el JSON exacto del API (github.com/yorchavez9) y usted lo envía desde Postman; luego carga el CDR. Modo <b>api</b>: el backend envía solo (requiere desplegar el API; guía en el README, gratis en Render/shared hosting).</p>
        </div>

        <!-- Adenda 1.6: pagos QR -->
        <div class="sm:col-span-2 rounded-xl bg-violet-50/60 ring-1 ring-inset ring-violet-600/10 p-4">
          <p class="text-sm font-semibold text-violet-900 mb-3 flex items-center gap-2"><icon name="dinero" clase="w-4 h-4"></icon> Pagos QR (Yape / Plin) impresos en la boleta</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="label-forma">Celular Yape</label>
              <input v-model="form.QR_YAPE_NUMERO" type="text" class="input-texto font-mono" maxlength="9" placeholder="987654321">
            </div>
            <div>
              <label class="label-forma">Celular Plin</label>
              <input v-model="form.QR_PLIN_NUMERO" type="text" class="input-texto font-mono" maxlength="9" placeholder="987654321">
            </div>
            <div>
              <label class="label-forma">Banco / CCI (opcional)</label>
              <input v-model="form.QR_BANCO" type="text" class="input-texto" placeholder="BCP cta. 1919... CCI ...">
            </div>
          </div>
          <p class="text-[11px] text-violet-800/70 mt-2">Cuando el cliente paga con Yape o Plin, la boleta impresa (y el ticket térmico) muestra el número y el importe exacto.</p>
        </div>

        <!-- Adenda 1.6: fidelización -->
        <div class="sm:col-span-2 rounded-xl bg-emerald-50/60 ring-1 ring-inset ring-emerald-600/10 p-4">
          <p class="text-sm font-semibold text-emerald-900 mb-3 flex items-center gap-2"><icon name="cliente" clase="w-4 h-4"></icon> Fidelización de clientes (puntos)</p>
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label class="label-forma">¿Programa activo?</label>
              <select v-model="form.FIDEL_ACTIVA" class="input-texto"><option>No</option><option>Sí</option></select>
            </div>
            <div>
              <label class="label-forma">1 punto por cada</label>
              <input v-model.number="form.FIDEL_MONTO_PUNTO" type="number" min="0.5" step="0.5" class="input-texto">
              <p class="text-[11px] text-slate-500 mt-1">de consumo ({{ form.MONEDA_SIMBOLO }})</p>
            </div>
            <div>
              <label class="label-forma">Valor del punto</label>
              <input v-model.number="form.FIDEL_VALOR_PUNTO" type="number" min="0.01" step="0.01" class="input-texto">
              <p class="text-[11px] text-slate-500 mt-1">al canjear ({{ form.MONEDA_SIMBOLO }})</p>
            </div>
            <div>
              <label class="label-forma">Mínimo para canjear</label>
              <input v-model.number="form.FIDEL_MIN_CANJE" type="number" min="0" class="input-texto">
              <p class="text-[11px] text-slate-500 mt-1">puntos</p>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-slate-100 my-5"></div>

      <h3 class="font-semibold text-slate-800 text-sm mb-4">Parámetros generales</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2">
          <label class="label-forma">Nombre de la empresa (mostrado en el sistema)</label>
          <input v-model="form.NOMBRE_EMPRESA" type="text" class="input-texto">
        </div>
        <div>
          <label class="label-forma">Símbolo de moneda</label>
          <input v-model="form.MONEDA_SIMBOLO" type="text" class="input-texto" maxlength="4">
        </div>
        <div>
          <label class="label-forma">Método de valuación</label>
          <select v-model="form.METODO_VALUACION" class="input-texto">
            <option value="PROMEDIO">Promedio ponderado (activo)</option>
            <option value="FIFO" disabled>FIFO (roadmap)</option>
            <option value="LIFO" disabled>LIFO (roadmap)</option>
          </select>
          <p class="text-[11px] text-slate-400 mt-1">El kardex valorizado usa promedio ponderado; FIFO/LIFO llegan con el módulo de Costos.</p>
        </div>
        <div>
          <label class="label-forma">¿Permitir stock negativo?</label>
          <select v-model="form.PERMITIR_STOCK_NEGATIVO" class="input-texto"><option>No</option><option>Sí</option></select>
        </div>
        <div>
          <label class="label-forma">Alerta de vencimiento (días)</label>
          <input v-model.number="form.DIAS_ALERTA_VENCIMIENTO" type="number" min="1" max="365" class="input-texto">
        </div>
      </div>
    </div>

    <!-- Vista previa + conexión -->
    <div class="space-y-4">
      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-3">Vista previa de la boleta</h3>
        <div class="boleta-print" style="font-size:11px">
          <div style="text-align:center">
            <img v-if="logoActual" :src="logoActual" alt="Logo" style="max-height:44px;max-width:120px;margin:0 auto 4px;display:block;object-fit:contain">
            <div style="font-weight:700;text-transform:uppercase">{{ form.RAZON_SOCIAL || '—' }}</div>
            <div style="font-size:10px">RUC: {{ form.RUC || '—' }}</div>
            <div style="border-top:1px dashed #000;margin:5px 0"></div>
            <div style="font-weight:700">BOLETA DE VENTA</div>
            <div style="font-weight:700">{{ form.PREFIJO_BOLETA }}0001</div>
            <div style="border-top:1px dashed #000;margin:5px 0"></div>
          </div>
          <div style="font-size:10px;line-height:1.5">
            <div>Fecha: hoy {{ form.HORARIO_INICIO }}</div>
            <div>Cliente: Público General</div>
            <div style="border-top:1px dashed #000;margin:5px 0"></div>
          </div>
          <table style="width:100%;font-size:10px">
            <tr><td>1</td><td>Producto de ejemplo</td><td style="text-align:right">{{ form.MONEDA_SIMBOLO }} 118.00</td></tr>
          </table>
          <div style="border-top:1px dashed #000;margin:5px 0"></div>
          <table style="width:100%;font-size:10.5px">
            <tr><td>OP. GRAVADAS</td><td style="text-align:right">{{ form.MONEDA_SIMBOLO }} {{ form.IGV_INCLUIDO === 'Sí' ? '100.00' : '118.00' }}</td></tr>
            <tr><td>IGV {{ form.IGV_TASA }}%</td><td style="text-align:right">{{ form.MONEDA_SIMBOLO }} {{ form.IGV_INCLUIDO === 'Sí' ? '18.00' : '0.00' }}</td></tr>
            <tr style="font-weight:700"><td>TOTAL</td><td style="text-align:right">{{ form.MONEDA_SIMBOLO }} 118.00</td></tr>
          </table>
          <div style="border-top:1px dashed #000;margin:5px 0"></div>
          <div style="text-align:center;font-size:9.5px">{{ form.MENSAJE_BOLETA }}</div>
        </div>
      </div>

      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-1">Asistente de inicio</h3>
        <p class="text-xs text-slate-400 mb-3">Guía paso a paso para configurar una empresa nueva desde cero: datos fiscales, administrador, almacén, categorías, productos con stock inicial, clientes y caja.</p>
        <button type="button" class="btn-secundario w-full justify-center" @click="abrirAsistente">
          <icon name="lock" clase="w-4 h-4"></icon> Ejecutar asistente de inicio
        </button>
      </div>

      <!-- Adenda 1.6: recordatorios y respaldos -->
      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-1">Recordatorios y respaldos</h3>
        <p class="text-xs text-slate-400 mb-3">Tareas programadas gratis en Apps Script: avisos diarios (fiados antiguos, cuotas por vencer, stock crítico, comprobantes con problema), correo al dueño y respaldo de la hoja a Drive.</p>
        <div class="space-y-3 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-forma">Avisos diarios</label>
              <select v-model="form.RECORD_ACTIVO" class="input-texto"><option>Sí</option><option>No</option></select>
            </div>
            <div>
              <label class="label-forma">Correo del dueño</label>
              <input v-model="form.RECORD_EMAIL" type="email" class="input-texto" placeholder="duero@negocio.pe">
            </div>
            <div>
              <label class="label-forma">Respaldo diario a Drive</label>
              <select v-model="form.BACKUP_ACTIVO" class="input-texto"><option>No</option><option>Sí</option></select>
            </div>
            <div>
              <label class="label-forma">Retención (días)</label>
              <input v-model.number="form.BACKUP_RETENCION" type="number" min="1" max="365" class="input-texto">
            </div>
          </div>
          <button type="button" class="btn-secundario w-full justify-center" @click="instalarTareas(false)"><icon name="movimientos" clase="w-4 h-4"></icon> Activar tareas programadas</button>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-secundario justify-center text-xs" @click="probarTareas">Probar avisos ahora</button>
            <button type="button" class="btn-secundario justify-center text-xs" @click="backupAhora">Respaldar ahora</button>
          </div>
          <p class="text-[11px] text-slate-400">Los avisos aparecen en la campana 🔔 de la barra superior. El correo usa MailApp de Google (cuota gratuita diaria).</p>
        </div>
      </div>

      <!-- Adenda 1.6: catálogo público -->
      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-1">Catálogo público (WhatsApp)</h3>
        <p class="text-xs text-slate-400 mb-3">Página pública con sus productos y pedidos por WhatsApp. Pegue el enlace en estados de WhatsApp, redes o un QR en el local.</p>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Estado</span>
            <select v-model="form.CATALOGO_ACTIVO" class="input-texto w-auto py-1"><option>No</option><option>Sí</option></select>
          </div>
          <div>
            <label class="label-forma">Mensaje de pedido</label>
            <input v-model="form.CATALOGO_MENSAJE" type="text" class="input-texto text-xs" placeholder="Hola! Me interesa: {producto} ({price})">
          </div>
          <button type="button" class="btn-secundario w-full justify-center" @click="regenerarCatalogo"><icon name="refresh" clase="w-4 h-4"></icon> Generar enlace</button>
          <button v-if="catalogoToken" type="button" class="btn-primario w-full justify-center" @click="copiarLinkCatalogo"><icon name="whatsapp" clase="w-4 h-4"></icon> Copiar enlace del catálogo</button>
          <p class="text-[11px] text-slate-400 break-all">catalogo.html?token={{ catalogoToken ? catalogoToken.substring(0, 8) + '…' : '—' }}</p>
        </div>
      </div>

      <!-- Adenda 1.6: tipo de cambio -->
      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-1">Tipo de cambio USD</h3>
        <p class="text-xs text-slate-400 mb-3">Referencia para operaciones en dólares (API pública gratuita).</p>
        <button type="button" class="btn-secundario w-full justify-center" @click="consultarTc"><icon name="refresh" clase="w-4 h-4"></icon> Consultar tipo de cambio hoy</button>
        <p v-if="tcInfo" class="text-sm mt-2">USD → {{ form.MONEDA_SIMBOLO }} <b>{{ tcInfo.valor }}</b> <span class="text-xs text-slate-400">({{ tcInfo.fuente }})</span></p>
      </div>

      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-4">Estado de la conexión</h3>
        <div class="space-y-3 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Modo</span>
            <span v-if="esDemo" class="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">Demo (localStorage)</span>
            <span v-else class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Google Apps Script</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Backend</span>
            <span class="text-slate-800 font-medium text-right">{{ esDemo ? 'DemoStore en el navegador' : 'Web App GAS' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Base de datos</span>
            <span class="text-slate-800 font-medium">Google Sheets</span>
          </div>
          <div v-if="esDemo" class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-xs text-slate-500 leading-relaxed mt-3">
            Para conectar el sistema real, edite <code class="font-mono text-blue-700">assets/js/config.js</code> y coloque la URL del Web App en <code class="font-mono text-blue-700">API_URL</code>. El procedimiento completo está en el README del proyecto.
          </div>
          <button v-if="esDemo" type="button" class="btn-peligro w-full justify-center mt-2" :disabled="reiniciando" @click="reiniciarDemo">
            <icon name="refresh" clase="w-4 h-4" :class="reiniciando ? 'animate-spin' : ''"></icon>
            {{ reiniciando ? 'Regenerando...' : 'Reiniciar datos de demostración' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>`
  };
})();
