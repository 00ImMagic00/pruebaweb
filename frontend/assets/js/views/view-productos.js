/**
 * NexoERP — vista-productos.js
 * Maestro de productos con CRUD, búsqueda y filtros.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['productos'] = {
    components: { modal: NEXO_UI.Modal, 'search-select': NEXO_UI.SearchSelect },
    data: function () {
      return {
        filas: [], categorias: [], cargando: true,
        q: '', categoria: '', estado: 'ACTIVO',
        modalAbierto: false, guardando: false, borrandoId: '',
        form: this.formVacio()
      };
    },
    computed: {
      puedeEditar: function () { return ['admin', 'gerente'].includes(AppStore.estado.usuario.rol); },
      filasFiltradas: function () {
        var q = this.q.toLowerCase(), cat = this.categoria;
        return this.filas.filter(function (f) {
          if (q && (f.nombre.toLowerCase().indexOf(q) === -1 && f.sku.toLowerCase().indexOf(q) === -1)) return false;
          if (cat && f.categoria !== cat) return false;
          return true;
        });
      },
      cols: function () {
        return [
          { k: 'sku', label: 'SKU', clase: 'font-mono text-xs text-slate-500' },
          { k: 'nombre', label: 'Producto', clase: 'font-medium text-slate-800' },
          { k: 'categoria', label: 'Categoría', clase: 'text-slate-500' },
          { k: 'unidad', label: 'UM', clase: 'text-slate-500' },
          { k: 'costoF', label: 'Costo std.', clase: 'text-right tabular-nums' },
          { k: 'precioF', label: 'Precio venta', clase: 'text-right tabular-nums' },
          { k: 'stockF', label: 'Stock total', clase: 'text-right tabular-nums font-semibold' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() {
      await Promise.all([this.cargar(), this.cargarCategorias()]);
    },
    methods: {
      formVacio: function () {
        return { id: '', sku: '', nombre: '', descripcion: '', categoria: '', unidad: 'Unidad', costoStd: 0, precioVenta: 0, precioMinimo: 0, stockMin: 0, stockMax: 0, requiereLote: false, requiereSerie: false, perecedero: false, estado: 'ACTIVO',
          precio2: 0, escala2Min: 0, precio3: 0, escala3Min: 0, fraccionActiva: false, unidadFraccion: '', factorFraccion: 0, codigoBarras: '' };
      },
      cargar: async function () {
        this.cargando = true;
        try {
          var datos = await Api.productos({ estado: '' });
          this.filas = datos.map(function (p) {
            return Object.assign({}, p, {
              costoF: Utils.fmtMoneda(p.costoStd),
              precioF: Utils.fmtMoneda(p.precioVenta),
              stockF: Utils.fmtNum(p.stockTotal)
            });
          });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      cargarCategorias: async function () {
        try { this.categorias = await Api.categorias(); } catch (e) { /* silencioso */ }
      },
      /* ADENDA 1.4: el usuario crea su propia categoría sin salir del formulario. */
      nuevaCategoriaRapida: async function () {
        var nombre = prompt('Nombre de la nueva categoría:', '');
        if (nombre === null) return;
        nombre = String(nombre).trim();
        if (!nombre) { AppStore.toast('El nombre de la categoría es obligatorio.', 'warning'); return; }
        var existe = this.categorias.some(function (c) { return c.nombre.toLowerCase() === nombre.toLowerCase(); });
        if (existe) { AppStore.toast('La categoría "' + nombre + '" ya existe.', 'info'); this.form.categoria = nombre; return; }
        try {
          var res = await Api.guardarCategoria({ nombre: nombre });
          await this.cargarCategorias();
          this.form.categoria = nombre;
          AppStore.toast('Categoría "' + nombre + '" creada y seleccionada.', 'exito');
        } catch (e) {
          AppStore.toast(e.message, 'error');
        }
      },
      abrirNuevo: function () {
        this.form = this.formVacio();
        if (this.categorias.length) this.form.categoria = this.categorias[0].nombre;
        this.modalAbierto = true;
      },
      abrirEdicion: function (fila) {
        var p = this.filas.find(function (x) { return x.id === fila.id; }) || fila;
        this.form = {
          id: p.id, sku: p.sku, nombre: p.nombre, descripcion: p.descripcion || '',
          categoria: p.categoria, unidad: p.unidad, costoStd: p.costoStd, precioVenta: p.precioVenta,
          precioMinimo: p.precioMinimo || 0,
          precio2: p.precio2 || 0, escala2Min: p.escala2Min || 0, precio3: p.precio3 || 0, escala3Min: p.escala3Min || 0,
          fraccionActiva: !!p.fraccionActiva, unidadFraccion: p.unidadFraccion || '', factorFraccion: p.factorFraccion || 0,
          codigoBarras: p.codigoBarras || '',
          stockMin: p.stockMin, stockMax: p.stockMax,
          requiereLote: !!p.requiereLote, requiereSerie: !!p.requiereSerie, perecedero: !!p.perecedero,
          estado: p.estado
        };
        this.modalAbierto = true;
      },
      guardar: async function () {
        if (!this.form.nombre.trim()) { AppStore.toast('El nombre del producto es obligatorio.', 'warning'); return; }
        this.guardando = true;
        try {
          var res = await Api.guardarProducto(this.form);
          AppStore.toast(res.actualizado ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.', 'exito');
          this.modalAbierto = false;
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      eliminar: async function (fila) {
        var ok = await AppStore.confirmar({
          titulo: 'Desactivar producto',
          mensaje: '¿Desactivar "' + fila.nombre + '"? El producto dejará de aparecer en las operaciones, pero se conserva todo su histórico de kardex.',
          okLabel: 'Desactivar', peligro: true
        });
        if (!ok) return;
        try {
          await Api.eliminarProducto(fila.id);
          AppStore.toast('Producto desactivado.', 'exito');
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      verKardex: function (fila) { AppStore.irA('kardex'); AppStore.toast('Seleccione el producto "' + fila.nombre + '" en el kardex.', 'info'); }
    },
    template: `
<div>
  <page-header titulo="Maestro de Productos" subtitulo="Catálogo de artículos con costos, mínimos de stock y reglas de trazabilidad">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button v-if="puedeEditar" type="button" class="btn-primario" @click="abrirNuevo"><icon name="plus" clase="w-4 h-4"></icon> Nuevo producto</button>
    </template>
  </page-header>

  <div class="nexo-card mb-4 flex flex-wrap items-center gap-2">
    <div class="relative flex-1 min-w-[200px]">
      <icon name="search" clase="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
      <input v-model="q" type="search" class="input-texto pl-9" placeholder="Buscar por nombre o SKU...">
    </div>
    <select v-model="categoria" class="input-texto w-auto min-w-[150px]">
      <option value="">Todas las categorías</option>
      <option v-for="c in categorias" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
    </select>
    <span class="text-xs text-slate-400 ml-auto">{{ filasFiltradas.length }} de {{ filas.length }} productos</span>
  </div>

  <data-table :cols="cols" :filas="filasFiltradas" :cargando="cargando" vacio="No hay productos que coincidan con el filtro" :por-pagina="12">
    <template #celda-nombre="{ fila }">
      <div>
        <p class="font-medium text-slate-800">{{ fila.nombre }}</p>
        <p class="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
          <span v-if="fila.requiereLote" class="inline-flex items-center rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-amber-600/20">LOTE</span>
          <span v-if="fila.requiereSerie" class="inline-flex items-center rounded bg-violet-50 text-violet-700 px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-violet-600/20">SERIE</span>
          <span v-if="fila.critico" class="inline-flex items-center rounded bg-rose-50 text-rose-700 px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-rose-600/20">STOCK MÍN</span>
        </p>
      </div>
    </template>
    <template #celda-stockTotal-if-needed></template>
    <template #acciones="{ fila }">
      <div class="inline-flex items-center gap-1">
        <button type="button" class="btn-icono" title="Ver kardex" @click="verKardex(fila)"><icon name="kardex" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar" type="button" class="btn-icono" title="Editar" @click="abrirEdicion(fila)"><icon name="edit" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar && fila.estado === 'ACTIVO'" type="button" class="btn-icono text-rose-500 hover:bg-rose-50" title="Desactivar" @click="eliminar(fila)"><icon name="trash" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <modal :abierto="modalAbierto" :titulo="form.id ? 'Editar producto' : 'Nuevo producto'" subtitulo="Los campos de lote y serie definen las validaciones de los movimientos" ancho="max-w-2xl" @cerrar="modalAbierto = false">
    <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="guardar">
      <div class="sm:col-span-2">
        <label class="label-forma">Nombre del producto *</label>
        <input v-model="form.nombre" type="text" class="input-texto" placeholder="p. ej. Monitor LED 24" required>
      </div>
      <div>
        <label class="label-forma">SKU</label>
        <input v-model="form.sku" type="text" class="input-texto font-mono" placeholder="Se genera si se deja vacío">
      </div>
      <div>
        <label class="label-forma">Categoría</label>
        <div class="flex items-center gap-1.5">
          <select v-model="form.categoria" class="input-texto flex-1">
            <option v-for="c in categorias" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
            <option v-if="!categorias.length" value="General">General</option>
          </select>
          <button v-if="puedeEditar" type="button" class="btn-secundario shrink-0 px-2.5 py-1.5 text-xs" title="Crear una categoría nueva ahora" @click="nuevaCategoriaRapida">
            <icon name="plus" clase="w-3.5 h-3.5"></icon> Nueva
          </button>
        </div>
        <p class="mt-1 text-[11px] text-slate-400">Gestione todas sus categorías en el menú <b>Inventario → Categorías</b>.</p>
      </div>
      <div>
        <label class="label-forma">Unidad de medida *</label>
        <input v-model="form.unidad" type="text" class="input-texto" placeholder="Unidad, Caja, Saco..." required>
      </div>
      <div>
        <label class="label-forma">Costo estándar</label>
        <input v-model.number="form.costoStd" type="number" step="0.01" min="0" class="input-texto">
      </div>
      <div>
        <label class="label-forma">Precio de venta</label>
        <input v-model.number="form.precioVenta" type="number" step="0.01" min="0" class="input-texto">
      </div>
      <div>
        <label class="label-forma">Precio mínimo de venta</label>
        <input v-model.number="form.precioMinimo" type="number" step="0.01" min="0" class="input-texto">
        <p class="mt-1 text-[11px] text-slate-400">Piso de negociación en el POS: vender por debajo exige autorización de gerente (0 = sin límite).</p>
      </div>
      <div>
        <label class="label-forma">Código de barras</label>
        <input v-model="form.codigoBarras" type="text" class="input-texto font-mono" placeholder="7750123456789">
      </div>
      <div class="sm:col-span-2 rounded-xl bg-blue-50/50 ring-1 ring-inset ring-blue-600/10 p-3">
        <p class="text-xs font-semibold text-blue-900 mb-2">Precios por escala (mayorista) — se aplican solos en el POS al alcanzar la cantidad</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label class="label-forma text-xs">Precio 2</label>
            <input v-model.number="form.precio2" type="number" step="0.01" min="0" class="input-texto py-1.5">
          </div>
          <div>
            <label class="label-forma text-xs">Desde N unidades</label>
            <input v-model.number="form.escala2Min" type="number" step="1" min="0" class="input-texto py-1.5">
          </div>
          <div>
            <label class="label-forma text-xs">Precio 3</label>
            <input v-model.number="form.precio3" type="number" step="0.01" min="0" class="input-texto py-1.5">
          </div>
          <div>
            <label class="label-forma text-xs">Desde N unidades</label>
            <input v-model.number="form.escala3Min" type="number" step="1" min="0" class="input-texto py-1.5">
          </div>
        </div>
      </div>
      <div class="sm:col-span-2 rounded-xl bg-violet-50/50 ring-1 ring-inset ring-violet-600/10 p-3">
        <p class="text-xs font-semibold text-violet-900 mb-2">Fraccionamiento — vender por bulto: el stock está en la unidad menor y el POS alterna al bulto (ej. stock en Unidad, vender Caja de 24)</p>
        <div class="grid grid-cols-3 gap-3 items-end">
          <div>
            <label class="label-forma text-xs">¿Fraccionable?</label>
            <select v-model="form.fraccionActiva" class="input-texto py-1.5"><option :value="false">No</option><option :value="true">Sí</option></select>
          </div>
          <div>
            <label class="label-forma text-xs">Unidad de fracción</label>
            <input v-model="form.unidadFraccion" type="text" class="input-texto py-1.5" placeholder="Unidad">
          </div>
          <div>
            <label class="label-forma text-xs">Unidades por bulto (factor)</label>
            <input v-model.number="form.factorFraccion" type="number" min="0" step="1" class="input-texto py-1.5">
          </div>
        </div>
      </div>
      <div>
        <label class="label-forma">Stock mínimo</label>
        <input v-model.number="form.stockMin" type="number" step="1" min="0" class="input-texto">
      </div>
      <div>
        <label class="label-forma">Stock máximo</label>
        <input v-model.number="form.stockMax" type="number" step="1" min="0" class="input-texto">
      </div>
      <div class="sm:col-span-2">
        <label class="label-forma">Descripción</label>
        <textarea v-model="form.descripcion" rows="2" class="input-texto" placeholder="Detalles técnicos, marca, presentaciones..."></textarea>
      </div>
      <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5">
        <label class="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
          <input v-model="form.requiereLote" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"> Exige lote
        </label>
        <label class="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
          <input v-model="form.requiereSerie" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"> Exige número de serie
        </label>
        <label class="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
          <input v-model="form.perecedero" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"> Perecedero
        </label>
      </div>
      <div v-if="form.id">
        <label class="label-forma">Estado</label>
        <select v-model="form.estado" class="input-texto"><option>ACTIVO</option><option>INACTIVO</option></select>
      </div>
      <div v-else class="sm:col-span-2"></div>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">
        <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        {{ guardando ? 'Guardando...' : 'Guardar producto' }}
      </button>
    </template>
  </modal>
</div>`
  };
})();
