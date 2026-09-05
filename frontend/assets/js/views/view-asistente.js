/**
 * NexoERP — vista-asistente.js (solo admin)
 * Adenda 1.5 — ASISTENTE DE INICIO "desde cero".
 * Guía a una empresa nueva en la carga inicial del sistema:
 *   1. Datos de la empresa (identidad fiscal de boletas/proformas)
 *   2. Usuario administrador (cambia la contraseña inicial)
 *   3. Almacén principal
 *   4. Categorías de productos
 *   5. Productos con stock inicial (manual o pegando desde Excel)
 *   6. Clientes (opcional)
 *   7. Fondo de caja + resumen final
 * Se activa solo cuando el backend reporta sistema vacío
 * (sistema_estado.necesitaAsistente) y puede re-ejecutarse desde
 * Configuración. Cada paso usa los endpoints reales del sistema,
 * por lo que el resultado es idéntico a cargarlo a mano.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  var PASOS = [
    { titulo: 'Bienvenido', sub: 'Configure su empresa en 7 pasos' },
    { titulo: 'Datos de su empresa', sub: 'Aparecerán en boletas y proformas' },
    { titulo: 'Usuario administrador', sub: 'Asegure su cuenta personal' },
    { titulo: 'Almacén principal', sub: 'Dónde guardará su inventario' },
    { titulo: 'Categorías', sub: 'Cómo agrupará sus productos' },
    { titulo: 'Productos y stock inicial', sub: 'Manual o pegando desde Excel' },
    { titulo: 'Clientes', sub: 'Opcional: cargue sus clientes frecuentes' },
    { titulo: 'Caja y resumen', sub: 'Últimos ajustes para operar' }
  ];

  var UNIDADES = ['Unidad', 'Caja', 'Paquete', 'Resma', 'Rollo', 'Saco', 'Bolsa', 'Botella', 'Kilo', 'Litro', 'Metro', 'Juego', 'Servicio'];

  window.NEXO_VISTAS['asistente'] = {
    data: function () {
      return {
        pasos: PASOS, unidades: UNIDADES,
        paso: 0, cargando: false, guardando: false,
        progreso: { visible: false, texto: '', pct: 0, errores: [] },
        /* Paso 1: empresa */
        empresa: {
          RAZON_SOCIAL: '', RUC: '', DIRECCION_EMPRESA: '', TELEFONO_EMPRESA: '',
          LOGO_BASE64: '', LOGO_URL: '', MONEDA_SIMBOLO: 'S/',
          IGV_INCLUIDO: 'Sí', IGV_TASA: 18, HORARIO_INICIO: '08:00', HORARIO_FIN: '22:00'
        },
        logoPreview: '',
        /* Paso 2: admin */
        admin: { nombre: '', password: '', password2: '' },
        /* Paso 3: almacén */
        almacenes: [], modoAlmacen: 'nuevo', almacenNuevo: { nombre: '', direccion: '', responsable: '' }, almacenId: '',
        /* Paso 4: categorías */
        chips: [], chipNuevo: '',
        sugerenciasCategorias: ['General', 'Ventas', 'Insumos', 'Servicios', 'Accesorios', 'Repuestos'],
        /* Paso 5: productos */
        modoProductos: 'manual', filasProd: [], csvTexto: '', csvFilas: 0, csvError: '',
        /* Paso 6: clientes */
        filasCli: [], csvClientes: '',
        /* Paso 7: cierre */
        fondoCaja: 0, abrirCaja: true, resumen: null
      };
    },

    computed: {
      esDemo: function () { return Api.esDemo(); },
      usuario: function () { return AppStore.estado.usuario || {}; },
      totalPasos: function () { return this.pasos.length - 1; }
    },

    async mounted() {
      if (!this.usuario.id || this.usuario.rol !== 'admin') {
        AppStore.toast('El asistente de inicio es solo para el administrador.', 'warning');
        AppStore.irA('dashboard', true);
        return;
      }
      this.cargando = true;
      try {
        var res = await Promise.all([Api.configGet(), Api.almacenes(), Api.categorias()]);
        var cfg = res[0] || {};
        AppStore.estado.cfg = cfg;
        window.__nexoerp_cfg = cfg;
        this.almacenes = res[1].filter(function (a) { return a.estado === 'ACTIVO'; });
        this.empresa = {
          RAZON_SOCIAL: (cfg.RAZON_SOCIAL && cfg.RAZON_SOCIAL !== 'NexoERP Distribución S.A.C.') ? cfg.RAZON_SOCIAL : (cfg.RAZON_SOCIAL || ''),
          RUC: (cfg.RUC === '20512345678' ? '' : (cfg.RUC || '')),
          DIRECCION_EMPRESA: cfg.DIRECCION_EMPRESA || '',
          TELEFONO_EMPRESA: cfg.TELEFONO_EMPRESA || '',
          LOGO_BASE64: cfg.LOGO_BASE64 || '', LOGO_URL: cfg.LOGO_URL || '',
          MONEDA_SIMBOLO: cfg.MONEDA_SIMBOLO || 'S/',
          IGV_INCLUIDO: String(cfg.IGV_INCLUIDO || 'Sí').toUpperCase() === 'NO' ? 'No' : 'Sí',
          IGV_TASA: parseFloat(cfg.IGV_TASA) || 18,
          HORARIO_INICIO: cfg.HORARIO_INICIO || '08:00',
          HORARIO_FIN: cfg.HORARIO_FIN || '22:00'
        };
        this.logoPreview = cfg.LOGO_BASE64 || cfg.LOGO_URL || '';
        this.admin.nombre = this.usuario.nombre || '';
        this.almacenId = cfg.ALMACEN_VENTA || (this.almacenes.length ? this.almacenes[0].id : '');
        this.modoAlmacen = this.almacenes.length ? 'existente' : 'nuevo';
        this.chips = res[2].map(function (c) { return { nombre: c.nombre, existente: true }; });
      } catch (e) {
        AppStore.toast(e.message, 'error');
      } finally { this.cargando = false; }
    },

    methods: {
      /* ---------------- Navegación ---------------- */
      /* Adenda 1.5: si la URL trae ?asistente=1 (forzar demo/prueba), lo
       * quitamos al terminar u omitir para que no reaparezca en el
       * siguiente inicio de sesión. */
      limpiarForzado: function () {
        try {
          if (/[?&]asistente=1/.test(location.search)) {
            history.replaceState(null, '', location.pathname + location.hash);
          }
        } catch (e) {}
      },
      async siguiente() {
        var ok = await this.guardarPaso(this.paso);
        if (!ok) return;
        if (this.paso === 6) this.armarResumen();
        if (this.paso < this.pasos.length - 1) this.paso++;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      atras() { if (this.paso > 0) { this.paso--; window.scrollTo({ top: 0, behavior: 'smooth' }); } },
      irPaso(n) { if (n <= this.paso) this.paso = n; },

      async omitirAsistente() {
        var confirmed = await AppStore.confirmar({
          titulo: '¿Omitir el asistente?',
          mensaje: 'Podrá cargar sus datos más adelante desde los módulos Productos, Clientes, Almacenes y Configuración. ¿Desea continuar al sistema?',
          okLabel: 'Sí, omitir'
        });
        if (!confirmed) return;
        this.guardando = true;
        try {
          await Api.configSave({ ASISTENTE_COMPLETADO: 'Sí' });
          this.limpiarForzado();
          AppStore.toast('Asistente omitido. Bienvenido a NexoERP.', 'exito');
          AppStore.irA('dashboard', true);
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },

      /* ---------------- Guardado por paso ---------------- */
      guardarPaso: async function (n) {
        if (n === 1) return this.guardarEmpresa();
        if (n === 2) return this.guardarAdmin();
        if (n === 3) return this.guardarAlmacen();
        if (n === 4) return this.guardarCategorias();
        if (n === 5) return this.guardarProductos();
        if (n === 6) return this.guardarClientes();
        return true; // pasos 0 y 7 no guardan nada aquí
      },

      validarEmpresa: function () {
        var e = this.empresa;
        if (!String(e.RAZON_SOCIAL || '').trim()) { AppStore.toast('Ingrese la razón social o nombre comercial de su empresa.', 'warning'); return false; }
        if (String(e.RUC || '').trim() && !/^\d{11}$/.test(String(e.RUC).trim())) { AppStore.toast('El RUC debe tener exactamente 11 dígitos (o déjelo vacío).', 'warning'); return false; }
        if (e.HORARIO_INICIO && e.HORARIO_FIN && e.HORARIO_INICIO >= e.HORARIO_FIN) { AppStore.toast('El horario de inicio debe ser menor al de cierre.', 'warning'); return false; }
        return true;
      },

      guardarEmpresa: async function () {
        if (!this.validarEmpresa()) return false;
        this.guardando = true;
        try {
          var cfg = await Api.configSave({
            NOMBRE_EMPRESA: this.empresa.RAZON_SOCIAL,
            RAZON_SOCIAL: this.empresa.RAZON_SOCIAL,
            RUC: String(this.empresa.RUC || '').trim(),
            DIRECCION_EMPRESA: this.empresa.DIRECCION_EMPRESA || '',
            TELEFONO_EMPRESA: this.empresa.TELEFONO_EMPRESA || '',
            LOGO_BASE64: this.empresa.LOGO_BASE64 || '',
            LOGO_URL: this.empresa.LOGO_URL || '',
            MONEDA_SIMBOLO: this.empresa.MONEDA_SIMBOLO || 'S/',
            IGV_INCLUIDO: this.empresa.IGV_INCLUIDO,
            IGV_TASA: this.empresa.IGV_TASA,
            HORARIO_INICIO: this.empresa.HORARIO_INICIO,
            HORARIO_FIN: this.empresa.HORARIO_FIN
          });
          AppStore.estado.cfg = cfg; window.__nexoerp_cfg = cfg;
          return true;
        } catch (e) { AppStore.toast(e.message, 'error'); return false; }
        finally { this.guardando = false; }
      },

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
            if (b64.length > 45000) b64 = canvas.toDataURL('image/jpeg', 0.82);
            if (b64.length > 45000) { AppStore.toast('La imagen es demasiado grande; use un archivo más pequeño.', 'error'); return; }
            self.empresa.LOGO_BASE64 = b64; self.logoPreview = b64;
          } catch (e) { AppStore.toast('No se pudo procesar la imagen.', 'error'); }
        };
        img.onerror = function () { AppStore.toast('No se pudo leer la imagen seleccionada.', 'error'); };
        img.src = URL.createObjectURL(file);
        ev.target.value = '';
      },
      quitarLogo: function () { this.empresa.LOGO_BASE64 = ''; this.empresa.LOGO_URL = ''; this.logoPreview = ''; },

      guardarAdmin: async function () {
        if (!String(this.admin.nombre || '').trim()) { AppStore.toast('Ingrese su nombre completo.', 'warning'); return false; }
        if (String(this.admin.password || '').length < 6) { AppStore.toast('La nueva contraseña debe tener al menos 6 caracteres.', 'warning'); return false; }
        if (this.admin.password !== this.admin.password2) { AppStore.toast('Las contraseñas no coinciden.', 'warning'); return false; }
        this.guardando = true;
        try {
          await Api.guardarUsuario({
            id: this.usuario.id, usuario: this.usuario.usuario, nombre: this.admin.nombre.trim(),
            rol: 'admin', estado: 'ACTIVO', password: this.admin.password
          });
          /* Refresca el nombre visible sin cerrar la sesión actual. */
          AppStore.estado.usuario.nombre = this.admin.nombre.trim();
          try { localStorage.setItem(CONFIG_APP.USUARIO_CLAVE, JSON.stringify(AppStore.estado.usuario)); } catch (e) {}
          return true;
        } catch (e) { AppStore.toast(e.message, 'error'); return false; }
        finally { this.guardando = false; }
      },

      guardarAlmacen: async function () {
        if (this.modoAlmacen === 'existente') {
          if (!this.almacenId) { AppStore.toast('Seleccione el almacén principal.', 'warning'); return false; }
          return true;
        }
        if (!String(this.almacenNuevo.nombre || '').trim()) { AppStore.toast('Ingrese el nombre del almacén.', 'warning'); return false; }
        this.guardando = true;
        try {
          var r = await Api.guardarAlmacen({
            nombre: this.almacenNuevo.nombre.trim(),
            direccion: this.almacenNuevo.direccion || '',
            responsable: this.almacenNuevo.responsable || ''
          });
          this.almacenes.push({ id: r.id, nombre: this.almacenNuevo.nombre.trim(), direccion: this.almacenNuevo.direccion || '', responsable: this.almacenNuevo.responsable || '', estado: 'ACTIVO' });
          this.almacenId = r.id;
          /* El POS despacha por defecto de este almacén. */
          await Api.configSave({ ALMACEN_VENTA: r.id });
          var cfg = await Api.configGet();
          AppStore.estado.cfg = cfg; window.__nexoerp_cfg = cfg;
          return true;
        } catch (e) { AppStore.toast(e.message, 'error'); return false; }
        finally { this.guardando = false; }
      },

      /* ---------------- Paso 4: categorías ---------------- */
      agregarChip: function () {
        var nombre = String(this.chipNuevo || '').trim();
        if (!nombre) return;
        var dup = this.chips.some(function (c) { return c.nombre.toLowerCase() === nombre.toLowerCase(); });
        if (dup) { AppStore.toast('La categoría "' + nombre + '" ya está en la lista.', 'warning'); this.chipNuevo = ''; return; }
        this.chips.push({ nombre: nombre, existente: false });
        this.chipNuevo = '';
      },
      quitarChip: function (i) { if (!this.chips[i].existente) this.chips.splice(i, 1); },
      usarSugerencia: function (s) { this.chipNuevo = s; this.agregarChip(); },

      guardarCategorias: async function () {
        var nuevas = this.chips.filter(function (c) { return !c.existente; });
        if (!nuevas.length) return true;
        this.progreso = { visible: true, texto: 'Creando categorías…', pct: 0, errores: [] };
        var errores = [];
        for (var i = 0; i < nuevas.length; i++) {
          try { await Api.guardarCategoria({ nombre: nuevas[i].nombre }); nuevas[i].existente = true; }
          catch (e) { errores.push(nuevas[i].nombre + ': ' + e.message); }
          this.progreso.pct = Math.round((i + 1) / nuevas.length * 100);
        }
        this.progreso.errores = errores;
        this.progreso.texto = errores.length ? 'Categorías creadas con ' + errores.length + ' error(es).' : 'Categorías listas.';
        setTimeout(function () { /* el panel de progreso queda visible con el resumen */ }, 50);
        return errores.length === 0;
      },

      /* ---------------- Paso 5: productos ---------------- */
      filaProdVacia: function () {
        return { sku: '', nombre: '', categoria: '', unidad: 'Unidad', costo: 0, precio: 0, stock: 0, stockMin: 0 };
      },
      agregarFilaProd: function () { this.filasProd.push(this.filaProdVacia()); },
      quitarFilaProd: function (i) { this.filasProd.splice(i, 1); },

      parsearCSV: function () {
        this.csvError = ''; this.csvFilas = 0;
        var lineas = String(this.csvTexto || '').split(/\r?\n/);
        var filas = [];
        for (var i = 0; i < lineas.length; i++) {
          var linea = lineas[i].trim();
          if (!linea) continue;
          var c = linea.split(/\t|;/).map(function (x) { return x.trim().replace(/^"|"$/g, ''); });
          if (/^sku/i.test(c[0]) && /nombre/i.test(c[1] || '')) continue; // cabecera
          if (!c[1]) { this.csvError = 'Línea ' + (i + 1) + ': falta el nombre del producto.'; return; }
          filas.push({
            sku: c[0] || '', nombre: c[1],
            categoria: c[2] || (this.chips.length ? this.chips[0].nombre : 'General'),
            unidad: c[3] || 'Unidad',
            costo: this.aNumero(c[4]), precio: this.aNumero(c[5]),
            stock: this.aNumero(c[6]), stockMin: this.aNumero(c[7])
          });
        }
        if (!filas.length) { this.csvError = 'No se detectaron filas. Verifique que cada línea tenga: sku ; nombre ; categoría ; unidad ; costo ; precio ; stock ; stock mín.'; return; }
        this.filasProd = filas;
        this.csvFilas = filas.length;
        this.modoProductos = 'manual'; // muestra la tabla ya cargada para revisar/editar
        AppStore.toast(filas.length + ' producto(s) cargados desde el portapapeles. Revise y confirme.', 'exito');
      },
      aNumero: function (v) {
        var n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
        return isNaN(n) ? 0 : n;
      },

      validarProductos: function () {
        if (!this.filasProd.length) return true; // paso opcional
        for (var i = 0; i < this.filasProd.length; i++) {
          var f = this.filasProd[i];
          if (!String(f.nombre || '').trim()) { AppStore.toast('Fila ' + (i + 1) + ': el nombre del producto es obligatorio.', 'warning'); return false; }
          if (!String(f.unidad || '').trim()) { AppStore.toast('Fila ' + (i + 1) + ': indique la unidad de medida.', 'warning'); return false; }
        }
        return true;
      },

      guardarProductos: async function () {
        if (!this.validarProductos()) return false;
        if (!this.filasProd.length) return true;
        if (!this.almacenId && this.almacenes.length) this.almacenId = this.almacenes[0].id;
        this.progreso = { visible: true, texto: 'Creando productos…', pct: 0, errores: [] };
        var errores = [], creados = 0;
        for (var i = 0; i < this.filasProd.length; i++) {
          var f = this.filasProd[i];
          try {
            var r = await Api.guardarProducto({
              sku: String(f.sku || '').trim(), nombre: String(f.nombre).trim(),
              categoria: f.categoria || 'General', unidad: f.unidad,
              costoStd: this.aNumero(f.costo), precioVenta: this.aNumero(f.precio),
              precioMinimo: Math.round(this.aNumero(f.precio) * 90) / 100,
              stockMin: this.aNumero(f.stockMin), stockMax: 0
            });
            creados++;
            if (this.aNumero(f.stock) > 0 && this.almacenId) {
              await Api.registrarMovimiento({
                tipo: 'ENTRADA', productoId: r.id, cantidad: this.aNumero(f.stock),
                costoUnitario: this.aNumero(f.costo), almacenDestinoId: this.almacenId,
                documentoRef: 'STOCK-INICIAL', observaciones: 'Stock inicial — asistente de inicio'
              });
            }
          } catch (e) { errores.push((f.nombre || ('Fila ' + (i + 1))) + ': ' + e.message); }
          this.progreso.pct = Math.round((i + 1) / this.filasProd.length * 100);
        }
        this.progreso.errores = errores;
        this.progreso.texto = creados + ' producto(s) creado(s)' + (errores.length ? ' · ' + errores.length + ' error(es).' : '.');
        if (errores.length) AppStore.toast('Algunos productos no se pudieron crear; revise los mensajes.', 'warning');
        return errores.length === 0;
      },

      /* ---------------- Paso 6: clientes ---------------- */
      filaCliVacia: function () { return { documento: '', razonSocial: '', telefono: '', email: '', limiteFiado: 0 }; },
      agregarFilaCli: function () { this.filasCli.push(this.filaCliVacia()); },
      quitarFilaCli: function (i) { this.filasCli.splice(i, 1); },
      pegarClientesCSV: function () {
        /* Formato: documento ; nombre ; teléfono ; email ; límite fiado */
        var lineas = String(this.csvClientes || '').split(/\r?\n/);
        var filas = [];
        for (var i = 0; i < lineas.length; i++) {
          var linea = lineas[i].trim();
          if (!linea) continue;
          var c = linea.split(/\t|;/).map(function (x) { return x.trim(); });
          if (/^documento/i.test(c[0])) continue;
          if (!c[1]) continue;
          filas.push({ documento: c[0] || '', razonSocial: c[1], telefono: c[2] || '', email: c[3] || '', limiteFiado: this.aNumero(c[4]) });
        }
        if (!filas.length) { AppStore.toast('No se detectaron clientes. Formato: documento ; nombre ; teléfono ; email ; límite de fiado.', 'warning'); return; }
        this.filasCli = filas;
        AppStore.toast(filas.length + ' cliente(s) cargados desde el portapapeles.', 'exito');
      },

      validarClientes: function () {
        for (var i = 0; i < this.filasCli.length; i++) {
          if (!String(this.filasCli[i].razonSocial || '').trim()) {
            AppStore.toast('Fila ' + (i + 1) + ': el nombre del cliente es obligatorio.', 'warning');
            return false;
          }
        }
        return true;
      },

      guardarClientes: async function () {
        if (!this.validarClientes()) return false;
        if (!this.filasCli.length) return true;
        this.progreso = { visible: true, texto: 'Creando clientes…', pct: 0, errores: [] };
        var errores = [];
        for (var i = 0; i < this.filasCli.length; i++) {
          var f = this.filasCli[i];
          try {
            await Api.guardarCliente({
              documento: String(f.documento || '').trim(), razonSocial: String(f.razonSocial).trim(),
              telefono: String(f.telefono || '').trim(), email: String(f.email || '').trim(),
              limiteFiado: this.aNumero(f.limiteFiado)
            });
          } catch (e) { errores.push((f.razonSocial || ('Fila ' + (i + 1))) + ': ' + e.message); }
          this.progreso.pct = Math.round((i + 1) / this.filasCli.length * 100);
        }
        this.progreso.errores = errores;
        this.progreso.texto = 'Clientes listos' + (errores.length ? ' · ' + errores.length + ' error(es).' : '.');
        return errores.length === 0;
      },

      /* ---------------- Paso 7: cierre ---------------- */
      armarResumen: function () {
        var self = this;
        var alm = this.almacenes.filter(function (a) { return a.id === self.almacenId; })[0];
        this.resumen = {
          empresa: this.empresa.RAZON_SOCIAL,
          ruc: this.empresa.RUC,
          almacen: (alm || this.almacenes[0] || {}).nombre || '—',
          categoriasNuevas: this.chips.filter(function (c) { return !c.existente; }).length,
          categoriasTotal: this.chips.length,
          productos: this.filasProd.length,
          conStock: this.filasProd.filter(function (f) { return self.aNumero(f.stock) > 0; }).length,
          clientes: this.filasCli.length
        };
      },

      finalizar: async function () {
        this.guardando = true;
        try {
          if (this.abrirCaja && this.aNumero(this.fondoCaja) > 0) {
            try { await Api.cajaAbrir(this.aNumero(this.fondoCaja)); }
            catch (e) {
              if (String(e.code) === 'VALIDATION') AppStore.toast('Caja: ' + e.message, 'warning');
              else throw e;
            }
          }
          await Api.configSave({ ASISTENTE_COMPLETADO: 'Sí' });
          this.limpiarForzado();
          AppStore.toast('¡Listo! Su sistema está configurado y listo para operar.', 'exito');
          AppStore.irA('dashboard', true);
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      }
    },
    template: `
<div class="max-w-4xl mx-auto">

  <!-- ============ CABECERA / PROGRESO ============ -->
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-5">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
        <icon name="cajas" clase="w-6 h-6 text-white"></icon>
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="text-lg font-bold text-slate-900 leading-tight">Asistente de inicio</h1>
        <p class="text-xs text-slate-500">Configure su empresa desde cero — todo queda cargado en su sistema real.</p>
      </div>
      <button type="button" class="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors shrink-0" @click="omitirAsistente" :disabled="guardando">Omitir asistente</button>
    </div>
    <div class="mt-4 flex items-center gap-1.5">
      <template v-for="(p, i) in pasos" :key="i">
        <button type="button" @click="irPaso(i)" class="h-1.5 flex-1 rounded-full transition-all"
          :class="i <= paso ? 'bg-blue-600' : 'bg-slate-200'" :title="p.titulo"></button>
      </template>
    </div>
    <div class="mt-2.5 flex items-baseline justify-between">
      <p class="text-sm font-semibold text-slate-800">{{ pasos[paso].titulo }}<span v-if="paso > 0" class="ml-2 text-xs font-normal text-slate-400">Paso {{ paso }} de {{ totalPasos }}</span></p>
      <p class="text-xs text-slate-400 hidden sm:block">{{ pasos[paso].sub }}</p>
    </div>
  </div>

  <div v-if="cargando" class="py-16 flex justify-center">
    <span class="inline-block w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></span>
  </div>

  <div v-else class="bg-white rounded-2xl border border-slate-200 shadow-sm">

    <!-- ============ PASO 0: BIENVENIDA ============ -->
    <div v-if="paso === 0" class="p-6 sm:p-8">
      <h2 class="text-xl font-bold text-slate-900">Bienvenido a NexoERP, {{ (usuario.nombre || '').split(' ')[0] }}</h2>
      <p class="mt-2 text-sm text-slate-600 leading-relaxed max-w-2xl">
        Este sistema está recién instalado y vacío. Le guiaremos en la carga inicial de su empresa:
        todo lo que configure aquí queda guardado de verdad en su Google Sheets, igual que si lo hubiera
        registrado manualmente módulo por módulo. Puede volver a ejecutar este asistente cuando quiera
        desde <b>Configuración</b>.
      </p>
      <div class="mt-6 grid sm:grid-cols-2 gap-3 max-w-2xl">
        <div class="flex items-start gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5">
          <icon name="config" clase="w-5 h-5 text-blue-600 shrink-0 mt-0.5"></icon>
          <div><p class="text-sm font-semibold text-slate-800">1 · Datos de la empresa</p><p class="text-xs text-slate-500">Razón social, RUC, logo, IGV y horario para sus boletas.</p></div>
        </div>
        <div class="flex items-start gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5">
          <icon name="lock" clase="w-5 h-5 text-blue-600 shrink-0 mt-0.5"></icon>
          <div><p class="text-sm font-semibold text-slate-800">2 · Su contraseña</p><p class="text-xs text-slate-500">Reemplazamos la clave inicial del administrador.</p></div>
        </div>
        <div class="flex items-start gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5">
          <icon name="almacenes" clase="w-5 h-5 text-blue-600 shrink-0 mt-0.5"></icon>
          <div><p class="text-sm font-semibold text-slate-800">3 · Almacén principal</p><p class="text-xs text-slate-500">La ubicación donde vivirá su inventario.</p></div>
        </div>
        <div class="flex items-start gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5">
          <icon name="productos" clase="w-5 h-5 text-blue-600 shrink-0 mt-0.5"></icon>
          <div><p class="text-sm font-semibold text-slate-800">4-6 · Catálogo y clientes</p><p class="text-xs text-slate-500">Categorías, productos con stock inicial y clientes.</p></div>
        </div>
      </div>
      <div class="mt-6 rounded-xl bg-amber-50 ring-1 ring-amber-600/20 p-3.5 text-xs text-amber-800 leading-relaxed max-w-2xl">
        <p class="font-semibold flex items-center gap-1.5"><icon name="warning" clase="w-3.5 h-3.5"></icon> ¿Está viendo datos de ejemplo?</p>
        <p class="mt-1">Si su hoja aún contiene la demostración, ejecute <b>borrarDatosDemo</b> en el editor de Apps Script para limpiarla y pasar a datos reales. Si recién instaló con <b>setupDesdeCero</b>, este asistente aparece solo.</p>
      </div>
      <div class="mt-6 flex justify-end">
        <button type="button" class="btn-primario px-5" @click="paso = 1">Comenzar <icon name="chevronRight" clase="w-4 h-4"></icon></button>
      </div>
    </div>

    <!-- ============ PASO 1: EMPRESA ============ -->
    <div v-else-if="paso === 1" class="p-6 sm:p-8 space-y-5">
      <div class="grid sm:grid-cols-3 gap-4">
        <div class="sm:col-span-2">
          <label class="label-forma">Razón social o nombre comercial *</label>
          <input v-model="empresa.RAZON_SOCIAL" type="text" class="input-texto" placeholder="p. ej. Bodegas Mi Ahorro E.I.R.L.">
        </div>
        <div>
          <label class="label-forma">RUC</label>
          <input v-model="empresa.RUC" type="text" maxlength="11" class="input-texto" placeholder="11 dígitos">
        </div>
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Dirección comercial</label>
          <input v-model="empresa.DIRECCION_EMPRESA" type="text" class="input-texto" placeholder="Calle, número, ciudad">
        </div>
        <div>
          <label class="label-forma">Teléfono de contacto</label>
          <input v-model="empresa.TELEFONO_EMPRESA" type="text" class="input-texto" placeholder="01-2345678 / 987654321">
        </div>
      </div>
      <div class="grid sm:grid-cols-4 gap-4">
        <div>
          <label class="label-forma">Símbolo de moneda</label>
          <input v-model="empresa.MONEDA_SIMBOLO" type="text" class="input-texto" placeholder="S/">
        </div>
        <div>
          <label class="label-forma">¿Precios con IGV incluido?</label>
          <select v-model="empresa.IGV_INCLUIDO" class="input-texto"><option>Sí</option><option>No</option></select>
        </div>
        <div>
          <label class="label-forma">Tasa de IGV %</label>
          <input v-model.number="empresa.IGV_TASA" type="number" min="0" max="100" class="input-texto">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="label-forma">Apertura</label><input v-model="empresa.HORARIO_INICIO" type="time" class="input-texto"></div>
          <div><label class="label-forma">Cierre</label><input v-model="empresa.HORARIO_FIN" type="time" class="input-texto"></div>
        </div>
      </div>
      <div>
        <label class="label-forma">Logo (aparece en boletas y proformas)</label>
        <div class="flex items-center gap-4">
          <div class="w-20 h-20 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            <img v-if="logoPreview" :src="logoPreview" alt="Logo" class="w-full h-full object-contain">
            <icon v-else name="cajas" clase="w-8 h-8 text-slate-300"></icon>
          </div>
          <div class="space-y-2">
            <label class="btn-secundario px-3 py-2 text-xs cursor-pointer inline-flex">
              <icon name="plus" clase="w-4 h-4"></icon> Subir imagen
              <input type="file" accept="image/*" class="hidden" @change="procesarLogo">
            </label>
            <button v-if="logoPreview" type="button" class="block text-xs text-rose-600 hover:underline" @click="quitarLogo">Quitar logo</button>
            <p class="text-[11px] text-slate-400">PNG o JPG; se reduce a 200 px para las boletas.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ PASO 2: ADMIN ============ -->
    <div v-else-if="paso === 2" class="p-6 sm:p-8 space-y-5 max-w-xl">
      <div class="rounded-xl bg-blue-50 ring-1 ring-blue-600/20 p-3.5 text-xs text-blue-900 leading-relaxed">
        Su sistema nace con el usuario <b>{{ usuario.usuario }}</b> y una contraseña inicial conocida.
        Defina aquí la contraseña definitiva: se guardará como hash SHA-256 con salt y su sesión actual no se cerrará.
      </div>
      <div>
        <label class="label-forma">Su nombre completo *</label>
        <input v-model="admin.nombre" type="text" class="input-texto" placeholder="p. ej. Juan Pérez Quispe">
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Nueva contraseña * (mín. 6)</label>
          <input v-model="admin.password" type="password" autocomplete="new-password" class="input-texto" placeholder="••••••••">
        </div>
        <div>
          <label class="label-forma">Repetir contraseña *</label>
          <input v-model="admin.password2" type="password" autocomplete="new-password" class="input-texto" placeholder="••••••••">
        </div>
      </div>
      <p class="text-xs text-slate-500">Podrá crear más usuarios (gerente, operador, consulta) después, en <b>Usuarios y Roles</b>.</p>
    </div>

    <!-- ============ PASO 3: ALMACÉN ============ -->
    <div v-else-if="paso === 3" class="p-6 sm:p-8 space-y-5">
      <div v-if="almacenes.length" class="space-y-3">
        <label class="flex items-start gap-3 rounded-xl ring-1 p-3.5 cursor-pointer" :class="modoAlmacen === 'existente' ? 'ring-blue-500 bg-blue-50/50' : 'ring-slate-200'" @click="modoAlmacen = 'existente'">
          <input type="radio" value="existente" v-model="modoAlmacen" class="mt-1 accent-blue-600">
          <div class="flex-1">
            <p class="text-sm font-semibold text-slate-800">Usar un almacén existente</p>
            <select v-model="almacenId" class="input-texto mt-2" @click.stop>
              <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.nombre }}</option>
            </select>
          </div>
        </label>
        <label class="flex items-start gap-3 rounded-xl ring-1 p-3.5 cursor-pointer" :class="modoAlmacen === 'nuevo' ? 'ring-blue-500 bg-blue-50/50' : 'ring-slate-200'" @click="modoAlmacen = 'nuevo'">
          <input type="radio" value="nuevo" v-model="modoAlmacen" class="mt-1 accent-blue-600">
          <div class="flex-1">
            <p class="text-sm font-semibold text-slate-800">Crear otro almacén</p>
            <p class="text-xs text-slate-500 mb-2">Se convertirá en el almacén de despacho del POS.</p>
            <div class="grid sm:grid-cols-3 gap-3" @click.stop>
              <input v-model="almacenNuevo.nombre" type="text" class="input-texto" placeholder="Nombre * (p. ej. Tienda Centro)">
              <input v-model="almacenNuevo.direccion" type="text" class="input-texto" placeholder="Dirección">
              <input v-model="almacenNuevo.responsable" type="text" class="input-texto" placeholder="Responsable">
            </div>
          </div>
        </label>
      </div>
      <div v-else class="space-y-4 max-w-xl">
        <p class="text-sm text-slate-600">Su sistema aún no tiene almacenes. Cree el principal: podrá agregar más (sucursales, bodegas) después desde el módulo <b>Almacenes</b>.</p>
        <div>
          <label class="label-forma">Nombre del almacén *</label>
          <input v-model="almacenNuevo.nombre" type="text" class="input-texto" placeholder="p. ej. Almacén Principal">
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div><label class="label-forma">Dirección</label><input v-model="almacenNuevo.direccion" type="text" class="input-texto" placeholder="Av. Los Sauces 123, Lima"></div>
          <div><label class="label-forma">Responsable</label><input v-model="almacenNuevo.responsable" type="text" class="input-texto" placeholder="Quién administra el stock"></div>
        </div>
      </div>
    </div>

    <!-- ============ PASO 4: CATEGORÍAS ============ -->
    <div v-else-if="paso === 4" class="p-6 sm:p-8 space-y-5">
      <p class="text-sm text-slate-600 max-w-2xl">Agregue las categorías con las que agrupará sus productos (escríbalas y presione <b>Enter</b>). Son suyas: podrá crear, editar o desactivar más adelante desde el módulo <b>Categorías</b>.</p>
      <div class="max-w-xl">
        <label class="label-forma">Nueva categoría + Enter</label>
        <input v-model="chipNuevo" type="text" class="input-texto" placeholder="p. ej. Lácteos" @keydown.enter.prevent="agregarChip">
      </div>
      <div class="flex flex-wrap gap-2 max-w-2xl">
        <span v-for="(c, i) in chips" :key="c.nombre" class="inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium ring-1"
          :class="c.existente ? 'bg-slate-100 text-slate-600 ring-slate-200' : 'bg-blue-50 text-blue-700 ring-blue-600/20'">
          {{ c.nombre }}<span v-if="c.existente" class="text-[10px] text-slate-400">(existente)</span>
          <button v-if="!c.existente" type="button" class="rounded-full hover:bg-blue-100 p-0.5" @click="quitarChip(i)"><icon name="x" clase="w-3.5 h-3.5"></icon></button>
        </span>
        <span v-if="!chips.length" class="text-xs text-slate-400 py-1">Aún no hay categorías. Si prefiere, continúe: los productos usarán "General".</span>
      </div>
      <div class="max-w-2xl">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Sugerencias comunes</p>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="s in sugerenciasCategorias" :key="s" type="button" class="rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-700 px-2.5 py-1 text-xs text-slate-600 transition-colors" @click="usarSugerencia(s)">+ {{ s }}</button>
        </div>
      </div>
    </div>

    <!-- ============ PASO 5: PRODUCTOS ============ -->
    <div v-else-if="paso === 5" class="p-6 sm:p-8 space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors" :class="modoProductos === 'manual' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'" @click="modoProductos = 'manual'">Registro manual</button>
        <button type="button" class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors" :class="modoProductos === 'csv' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'" @click="modoProductos = 'csv'">Pegar desde Excel</button>
      </div>

      <div v-if="modoProductos === 'csv'" class="space-y-3">
        <p class="text-xs text-slate-500 leading-relaxed">Copie las filas desde su Excel o Google Sheets y péguelas abajo. Columnas en este orden, separadas por <b>tabulación</b> (al pegar desde Excel) o <b>punto y coma</b>:<br>
          <code class="text-[11px] bg-slate-100 rounded px-1.5 py-0.5">sku ; nombre ; categoría ; unidad ; costo ; precio ; stock inicial ; stock mínimo</code></p>
        <textarea v-model="csvTexto" rows="6" class="input-texto font-mono text-xs" placeholder="P-0001; Arroz Extra 5kg; Abarrotes; Saco; 22; 28.5; 40; 10"></textarea>
        <div v-if="csvError" class="rounded-lg bg-rose-50 ring-1 ring-rose-600/20 px-3 py-2 text-xs text-rose-700">{{ csvError }}</div>
        <button type="button" class="btn-secundario px-4 py-2 text-xs" @click="parsearCSV"><icon name="plus" clase="w-4 h-4"></icon> Cargar filas</button>
      </div>

      <div v-if="modoProductos === 'manual' || filasProd.length" class="space-y-3">
        <div class="overflow-x-auto nexo-scroll">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b border-slate-200">
                <th class="py-2 pr-2 font-medium w-28">SKU</th>
                <th class="py-2 pr-2 font-medium min-w-44">Nombre *</th>
                <th class="py-2 pr-2 font-medium w-40">Categoría</th>
                <th class="py-2 pr-2 font-medium w-28">Unidad</th>
                <th class="py-2 pr-2 font-medium w-24 text-right">Costo</th>
                <th class="py-2 pr-2 font-medium w-24 text-right">Precio</th>
                <th class="py-2 pr-2 font-medium w-20 text-right">Stock</th>
                <th class="py-2 pr-2 font-medium w-20 text-right">Mín.</th>
                <th class="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in filasProd" :key="i" class="border-b border-slate-100">
                <td class="py-1.5 pr-2"><input v-model="f.sku" type="text" class="input-texto !py-1 !text-xs" placeholder="auto"></td>
                <td class="py-1.5 pr-2"><input v-model="f.nombre" type="text" class="input-texto !py-1 !text-xs"></td>
                <td class="py-1.5 pr-2">
                  <input v-model="f.categoria" type="text" list="cats-asistente" class="input-texto !py-1 !text-xs" placeholder="General">
                </td>
                <td class="py-1.5 pr-2"><select v-model="f.unidad" class="input-texto !py-1 !text-xs"><option v-for="u in unidades" :key="u">{{ u }}</option></select></td>
                <td class="py-1.5 pr-2"><input v-model.number="f.costo" type="number" step="0.01" min="0" class="input-texto !py-1 !text-xs text-right"></td>
                <td class="py-1.5 pr-2"><input v-model.number="f.precio" type="number" step="0.01" min="0" class="input-texto !py-1 !text-xs text-right"></td>
                <td class="py-1.5 pr-2"><input v-model.number="f.stock" type="number" step="1" min="0" class="input-texto !py-1 !text-xs text-right"></td>
                <td class="py-1.5 pr-2"><input v-model.number="f.stockMin" type="number" step="1" min="0" class="input-texto !py-1 !text-xs text-right"></td>
                <td class="py-1.5"><button type="button" class="p-1 text-slate-300 hover:text-rose-600" @click="quitarFilaProd(i)"><icon name="trash" clase="w-4 h-4"></icon></button></td>
              </tr>
            </tbody>
          </table>
          <datalist id="cats-asistente"><option v-for="c in chips" :key="c.nombre" :value="c.nombre"></option></datalist>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn-secundario px-3 py-2 text-xs" @click="agregarFilaProd"><icon name="plus" clase="w-4 h-4"></icon> Agregar producto</button>
          <p class="text-xs text-slate-400">El stock inicial se registra como ENTRADA con su costo → queda kardex valorizado desde el día uno.</p>
        </div>
      </div>
      <p v-else class="text-xs text-slate-400">Paso opcional: si continúa sin productos, podrá crearlos luego en el módulo <b>Productos</b>.</p>
    </div>

    <!-- ============ PASO 6: CLIENTES ============ -->
    <div v-else-if="paso === 6" class="p-6 sm:p-8 space-y-4">
      <p class="text-xs text-slate-500">Opcional: cargue clientes frecuentes. El <b>teléfono</b> permite enviarles boletas por WhatsApp; el <b>límite de fiado</b> controla cuánto crédito puede acumular cada uno.</p>
      <div class="overflow-x-auto nexo-scroll">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-slate-500 border-b border-slate-200">
              <th class="py-2 pr-2 font-medium w-36">DNI / RUC</th>
              <th class="py-2 pr-2 font-medium min-w-44">Nombre o razón social *</th>
              <th class="py-2 pr-2 font-medium w-32">Teléfono (WhatsApp)</th>
              <th class="py-2 pr-2 font-medium min-w-36">Email</th>
              <th class="py-2 pr-2 font-medium w-24 text-right">Límite fiado</th>
              <th class="py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(f, i) in filasCli" :key="i" class="border-b border-slate-100">
              <td class="py-1.5 pr-2"><input v-model="f.documento" type="text" class="input-texto !py-1 !text-xs" placeholder="8 dígitos / 11 RUC"></td>
              <td class="py-1.5 pr-2"><input v-model="f.razonSocial" type="text" class="input-texto !py-1 !text-xs"></td>
              <td class="py-1.5 pr-2"><input v-model="f.telefono" type="text" class="input-texto !py-1 !text-xs" placeholder="9 dígitos"></td>
              <td class="py-1.5 pr-2"><input v-model="f.email" type="email" class="input-texto !py-1 !text-xs"></td>
              <td class="py-1.5 pr-2"><input v-model.number="f.limiteFiado" type="number" step="0.01" min="0" class="input-texto !py-1 !text-xs text-right"></td>
              <td class="py-1.5"><button type="button" class="p-1 text-slate-300 hover:text-rose-600" @click="quitarFilaCli(i)"><icon name="trash" clase="w-4 h-4"></icon></button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="btn-secundario px-3 py-2 text-xs" @click="agregarFilaCli"><icon name="plus" clase="w-4 h-4"></icon> Agregar cliente</button>
      </div>
      <details class="max-w-2xl">
        <summary class="text-xs font-medium text-blue-600 cursor-pointer">¿Vienen muchos clientes? Pégalos desde Excel aquí</summary>
        <div class="mt-3 space-y-2">
          <textarea v-model="csvClientes" rows="4" class="input-texto font-mono text-xs" placeholder="documento ; nombre ; teléfono ; email ; límite fiado"></textarea>
          <button type="button" class="btn-secundario px-4 py-2 text-xs" @click="pegarClientesCSV"><icon name="plus" clase="w-4 h-4"></icon> Cargar clientes</button>
        </div>
      </details>
    </div>

    <!-- ============ PASO 7: CAJA Y RESUMEN ============ -->
    <div v-else-if="paso === 7" class="p-6 sm:p-8 space-y-5">
      <div class="max-w-md">
        <label class="label-forma">Fondo de caja inicial (efectivo en caja al abrir)</label>
        <div class="flex items-center gap-3">
          <input v-model.number="fondoCaja" type="number" min="0" step="0.01" class="input-texto w-40">
          <label class="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" v-model="abrirCaja" class="accent-blue-600"> Abrir la caja ahora</label>
        </div>
      </div>
      <div class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 max-w-2xl">
        <p class="text-sm font-semibold text-slate-800 mb-3">Resumen de su configuración</p>
        <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <div class="flex justify-between gap-2 border-b border-slate-200/70 py-1"><dt class="text-slate-500">Empresa</dt><dd class="font-semibold text-slate-800 text-right truncate">{{ resumen && resumen.empresa }}</dd></div>
          <div class="flex justify-between gap-2 border-b border-slate-200/70 py-1"><dt class="text-slate-500">RUC</dt><dd class="font-semibold text-slate-800">{{ resumen && resumen.ruc ? resumen.ruc : '—' }}</dd></div>
          <div class="flex justify-between gap-2 border-b border-slate-200/70 py-1"><dt class="text-slate-500">Almacén principal</dt><dd class="font-semibold text-slate-800 text-right truncate">{{ resumen && resumen.almacen }}</dd></div>
          <div class="flex justify-between gap-2 border-b border-slate-200/70 py-1"><dt class="text-slate-500">Categorías</dt><dd class="font-semibold text-slate-800">{{ resumen ? resumen.categoriasTotal + ' (' + resumen.categoriasNuevas + ' nuevas)' : '—' }}</dd></div>
          <div class="flex justify-between gap-2 border-b border-slate-200/70 py-1"><dt class="text-slate-500">Productos</dt><dd class="font-semibold text-slate-800">{{ resumen ? resumen.productos + ' (con stock inicial: ' + resumen.conStock + ')' : '—' }}</dd></div>
          <div class="flex justify-between gap-2 border-b border-slate-200/70 py-1"><dt class="text-slate-500">Clientes</dt><dd class="font-semibold text-slate-800">{{ resumen ? resumen.clientes : '—' }}</dd></div>
        </dl>
      </div>
      <div class="rounded-xl bg-emerald-50 ring-1 ring-emerald-600/20 p-3.5 text-xs text-emerald-800 max-w-2xl">
        Al finalizar quedará marcado que el asistente se completó y llegará directo al Dashboard.
        Recuerde: sus datos viven en su Google Sheets — descargue copias periódicas desde Archivo → Descargar.
      </div>
    </div>

    <!-- Progreso de guardado (pasos con carga masiva) -->
    <div v-if="progreso.visible" class="px-6 sm:px-8 pb-6">
      <div class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5">
        <div class="flex items-center justify-between text-xs mb-1.5">
          <span class="font-medium text-slate-700">{{ progreso.texto }}</span>
          <span class="text-slate-400">{{ progreso.pct }}%</span>
        </div>
        <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full bg-blue-600 rounded-full transition-all" :style="{ width: progreso.pct + '%' }"></div></div>
        <ul v-if="progreso.errores.length" class="mt-2 space-y-0.5 text-[11px] text-rose-600 max-h-24 overflow-y-auto nexo-scroll">
          <li v-for="(er, i) in progreso.errores" :key="i">• {{ er }}</li>
        </ul>
      </div>
    </div>

    <!-- ============ PIE DE NAVEGACIÓN ============ -->
    <div v-if="paso > 0" class="border-t border-slate-200 px-6 sm:px-8 py-4 flex items-center justify-between">
      <button type="button" class="btn-secundario px-4" @click="atras" :disabled="guardando"><icon name="chevronLeft" clase="w-4 h-4"></icon> Atrás</button>
      <button v-if="paso < totalPasos" type="button" class="btn-primario px-5" @click="siguiente" :disabled="guardando">
        <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        {{ paso === totalPasos - 1 ? 'Revisar resumen' : 'Guardar y continuar' }} <icon name="chevronRight" clase="w-4 h-4"></icon>
      </button>
      <button v-else type="button" class="btn-primario px-5" @click="finalizar" :disabled="guardando">
        <icon name="check" clase="w-4 h-4"></icon> {{ guardando ? 'Finalizando...' : 'Finalizar y empezar a vender' }}
      </button>
    </div>
  </div>
</div>`
  };
})();
