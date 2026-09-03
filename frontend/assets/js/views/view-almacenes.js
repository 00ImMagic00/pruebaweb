/**
 * NexoERP — vista-almacenes.js
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['almacenes'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      return { filas: [], stockPorAlmacen: {}, cargando: true, modalAbierto: false, guardando: false, form: this.formVacio() };
    },
    computed: {
      puedeEditar: function () { return ['admin', 'gerente'].includes(AppStore.estado.usuario.rol); },
      cols: function () {
        return [
          { k: 'codigo', label: 'Código', clase: 'font-mono text-xs text-slate-500' },
          { k: 'nombre', label: 'Almacén', clase: 'font-medium text-slate-800' },
          { k: 'direccion', label: 'Dirección', clase: 'text-slate-500' },
          { k: 'responsable', label: 'Responsable', clase: 'text-slate-500' },
          { k: 'skusF', label: 'SKUs con stock', clase: 'text-right tabular-nums' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      formVacio: function () { return { id: '', codigo: '', nombre: '', direccion: '', responsable: '', estado: 'ACTIVO' }; },
      cargar: async function () {
        this.cargando = true;
        try {
          var res = await Promise.all([Api.almacenes({}), Api.stock({})]);
          this.filas = res[0];
          var mapa = {};
          res[1].forEach(function (s) { if (s.cantidad > 0) mapa[s.almacenId] = (mapa[s.almacenId] || 0) + 1; });
          this.stockPorAlmacen = mapa;
          this.filas = this.filas.map(function (a) { return Object.assign({}, a, { skusF: String(mapa[a.id] || 0) }); });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrirNuevo: function () { this.form = this.formVacio(); this.modalAbierto = true; },
      abrirEdicion: function (f) {
        this.form = { id: f.id, codigo: f.codigo, nombre: f.nombre, direccion: f.direccion || '', responsable: f.responsable || '', estado: f.estado };
        this.modalAbierto = true;
      },
      guardar: async function () {
        if (!this.form.nombre.trim()) { AppStore.toast('El nombre del almacén es obligatorio.', 'warning'); return; }
        this.guardando = true;
        try {
          await Api.guardarAlmacen(this.form);
          AppStore.toast('Almacén guardado correctamente.', 'exito');
          this.modalAbierto = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      eliminar: async function (f) {
        var ok = await AppStore.confirmar({
          titulo: 'Desactivar almacén',
          mensaje: '¿Desactivar "' + f.nombre + '"? Solo será posible si no conserva stock disponible.',
          okLabel: 'Desactivar', peligro: true
        });
        if (!ok) return;
        try {
          await Api.eliminarAlmacen(f.id);
          AppStore.toast('Almacén desactivado.', 'exito');
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      }
    },
    template: `
<div>
  <page-header titulo="Almacenes y Ubicaciones" subtitulo="Centros de stock donde se registra y controla el inventario">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button v-if="puedeEditar" type="button" class="btn-primario" @click="abrirNuevo"><icon name="plus" clase="w-4 h-4"></icon> Nuevo almacén</button>
    </template>
  </page-header>

  <data-table :cols="cols" :filas="filas" :cargando="cargando" vacio="Sin almacenes registrados" :por-pagina="10">
    <template #acciones="{ fila }">
      <div class="inline-flex items-center gap-1">
        <button type="button" class="btn-icono" title="Ver stock" @click="AppStore.irA('stock')"><icon name="stock" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar" type="button" class="btn-icono" title="Editar" @click="abrirEdicion(fila)"><icon name="edit" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar && fila.estado === 'ACTIVO'" type="button" class="btn-icono text-rose-500 hover:bg-rose-50" title="Desactivar" @click="eliminar(fila)"><icon name="trash" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <modal :abierto="modalAbierto" :titulo="form.id ? 'Editar almacén' : 'Nuevo almacén'" @cerrar="modalAbierto = false">
    <form class="space-y-4" @submit.prevent="guardar">
      <div>
        <label class="label-forma">Nombre *</label>
        <input v-model="form.nombre" type="text" class="input-texto" placeholder="p. ej. Almacén Central" required>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Código</label>
          <input v-model="form.codigo" type="text" class="input-texto font-mono uppercase" placeholder="ALM-...">
        </div>
        <div>
          <label class="label-forma">Responsable</label>
          <input v-model="form.responsable" type="text" class="input-texto">
        </div>
      </div>
      <div>
        <label class="label-forma">Dirección</label>
        <input v-model="form.direccion" type="text" class="input-texto">
      </div>
      <div v-if="form.id">
        <label class="label-forma">Estado</label>
        <select v-model="form.estado" class="input-texto"><option>ACTIVO</option><option>INACTIVO</option></select>
      </div>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando...' : 'Guardar' }}</button>
    </template>
  </modal>
</div>`
  };
})();
