/**
 * NexoERP — vista-categorias.js  (ADENDA 1.4)
 * CRUD de categorías de productos gestionado por el propio usuario.
 *
 *  · En DESPLIEGUE REAL las categorías se guardan en la pestaña "Categorias"
 *    de su Google Sheet (API categorias_list / categorias_save / categorias_delete).
 *  · En MODO DEMO se guardan en el navegador con la misma lógica.
 *  · La creación/edición exige el permiso de servidor "catalogos:write"
 *    (admin/gerente); el cajero y el operador solo consultan.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['categorias'] = {
    data: function () {
      return {
        filas: [], conteo: {}, cargando: true,
        q: '', modalAbierto: false, guardando: false, borrandoId: '',
        form: { id: '', nombre: '', descripcion: '' }
      };
    },
    computed: {
      esDemo: function () { return Api.esDemo(); },
      puedeEditar: function () {
        var rol = AppStore.estado.usuario ? AppStore.estado.usuario.rol : '';
        return ['admin', 'gerente'].indexOf(rol) !== -1;
      },
      filasFiltradas: function () {
        var q = this.q.trim().toLowerCase();
        if (!q) return this.filas;
        return this.filas.filter(function (f) {
          return f.nombre.toLowerCase().indexOf(q) !== -1 ||
                 String(f.descripcion || '').toLowerCase().indexOf(q) !== -1;
        });
      },
      totalProductos: function () {
        var t = 0; for (var k in this.conteo) t += this.conteo[k]; return t;
      },
      masUsada: function () {
        var mejor = '', n = -1;
        for (var k in this.conteo) { if (this.conteo[k] > n) { n = this.conteo[k]; mejor = k; } }
        return n > 0 ? (mejor + ' (' + n + ')') : '—';
      },
      cols: function () {
        return [
          { k: 'nombre', label: 'Categoría', clase: 'font-medium text-slate-800' },
          { k: 'descripcion', label: 'Descripción', clase: 'text-slate-500' },
          { k: 'nProductos', label: 'Productos', clase: 'text-center' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          var self = this;
          var res = await Promise.all([Api.categorias(), Api.productos({ estado: '' })]);
          this.filas = res[0].map(function (c) {
            return Object.assign({}, c, { nProductos: self.conteoDe(c.nombre, res[1]) });
          });
          this.conteo = {};
          res[1].forEach(function (p) {
            var k = p.categoria || '—';
            self.conteo[k] = (self.conteo[k] || 0) + 1;
          });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      conteoDe: function (nombre, productos) {
        var n = 0;
        productos.forEach(function (p) { if ((p.categoria || '') === nombre) n++; });
        return n;
      },
      abrirNuevo: function () {
        this.form = { id: '', nombre: '', descripcion: '' };
        this.modalAbierto = true;
      },
      abrirEdicion: function (fila) {
        this.form = { id: fila.id, nombre: fila.nombre, descripcion: fila.descripcion || '' };
        this.modalAbierto = true;
      },
      guardar: async function () {
        if (!this.form.nombre.trim()) { AppStore.toast('El nombre de la categoría es obligatorio.', 'warning'); return; }
        this.guardando = true;
        try {
          var res = await Api.guardarCategoria({
            id: this.form.id,
            nombre: this.form.nombre.trim(),
            descripcion: this.form.descripcion.trim()
          });
          AppStore.toast(res.actualizado ? 'Categoría actualizada.' : 'Categoría "' + this.form.nombre.trim() + '" creada.', 'exito');
          this.modalAbierto = false;
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      eliminar: async function (fila) {
        var n = this.conteoDe(fila.nombre, []);
        var usados = this.conteo[fila.nombre] || 0;
        var ok = await AppStore.confirmar({
          titulo: 'Desactivar categoría',
          mensaje: '¿Desactivar "' + fila.nombre + '"? Dejará de aparecer en los formularios y filtros' +
            (usados ? ' (tiene ' + usados + ' producto(s) asociados: los productos conservan su categoría y usted puede reasignarlos después).' : '.'),
          okLabel: 'Desactivar', peligro: true
        });
        if (!ok) return;
        this.borrandoId = fila.id;
        try {
          await Api.eliminarCategoria(fila.id);
          AppStore.toast('Categoría desactivada.', 'exito');
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.borrandoId = ''; }
      }
    },
    template: `
<div>
  <page-header titulo="Categorías de Productos" subtitulo="Cree y organice sus propias categorías — se guardan en su Google Sheet (pestaña Categorias) o en este navegador en modo demo">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando"><icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> <span class="hidden sm:inline">Actualizar</span></button>
      <button v-if="puedeEditar" type="button" class="btn-primario" @click="abrirNuevo"><icon name="plus" clase="w-4 h-4"></icon> Nueva categoría</button>
    </template>
  </page-header>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
    <kpi-card label="Categorías activas" :valor="String(filas.length)" icono="etiqueta" tono="blue"></kpi-card>
    <kpi-card label="Productos clasificados" :valor="String(totalProductos)" icono="productos" tono="emerald"></kpi-card>
    <kpi-card label="Categoría más usada" :valor="masUsada" icono="dashboard" tono="violet" detalle="Según el maestro de productos"></kpi-card>
    <kpi-card label="Sin categoría" :valor="String(conteo['—'] || 0)" icono="warning" tono="amber" detalle="Edite esos productos y asígneles una"></kpi-card>
  </div>

  <div class="nexo-card mb-4">
    <div class="relative">
      <icon name="search" clase="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
      <input v-model="q" type="search" class="input-texto pl-9" placeholder="Buscar categoría...">
    </div>
  </div>

  <data-table :cols="cols" :filas="filasFiltradas" :cargando="cargando" vacio="Aún no hay categorías — cree la primera con el botón 'Nueva categoría'">
    <template #celda-nombre="{ fila }">
      <span class="font-semibold text-slate-800">{{ fila.nombre }}</span>
    </template>
    <template #celda-descripcion="{ fila }">
      <span class="text-slate-500">{{ fila.descripcion || '—' }}</span>
    </template>
    <template #celda-nProductos="{ fila }">
      <span class="inline-flex items-center justify-center rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-blue-600/10">{{ conteo[fila.nombre] || 0 }}</span>
    </template>
    <template #acciones="{ fila }">
      <div class="inline-flex items-center gap-1">
        <button v-if="puedeEditar" type="button" class="btn-icono" title="Editar" @click="abrirEdicion(fila)"><icon name="edit" clase="w-4 h-4"></icon></button>
        <button v-if="puedeEditar" type="button" class="btn-icono text-rose-500 hover:bg-rose-50" title="Desactivar" :disabled="borrandoId === fila.id" @click="eliminar(fila)"><icon name="trash" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <div v-if="!puedeEditar" class="mt-4 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 px-4 py-3 text-xs text-slate-500">
    Su rol (<b>{{ AppStore.estado.usuario.rol }}</b>) puede consultar las categorías; solo un administrador o gerente puede crearlas, editarlas o desactivarlas.
  </div>

  <modal :abierto="modalAbierto" :titulo="form.id ? 'Editar categoría' : 'Nueva categoría'" subtitulo="Las categorías organizan el catálogo, los filtros del POS y los reportes" ancho="max-w-md" @cerrar="modalAbierto = false">
    <form @submit.prevent="guardar">
      <label class="label-forma">Nombre de la categoría *</label>
      <input v-model="form.nombre" type="text" class="input-texto" placeholder="p. ej. Bebidas, Lácteos, Ferretería..." required>
      <label class="label-forma mt-3">Descripción (opcional)</label>
      <textarea v-model="form.descripcion" rows="2" class="input-texto" placeholder="Para qué se usa o qué productos incluye"></textarea>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">
        <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        {{ guardando ? 'Guardando...' : 'Guardar categoría' }}
      </button>
    </template>
  </modal>
</div>`
  };
})();
