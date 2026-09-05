/**
 * NexoERP — vista-usuarios.js (solo rol admin)
 * Gestión de usuarios y roles con hash SHA-256 + salt en el backend.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  var ROLES = [
    { id: 'admin', desc: 'Acceso total, incluye usuarios y configuración' },
    { id: 'gerente', desc: 'Catálogos, movimientos, anulación, reportes y auditoría' },
    { id: 'operador', desc: 'Consulta y registro de movimientos' },
    { id: 'consulta', desc: 'Solo lectura de inventario y reportes' }
  ];

  window.NEXO_VISTAS['usuarios'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      return { filas: [], cargando: true, modalAbierto: false, guardando: false, form: this.formVacio() };
    },
    computed: {
      roles: function () { return ROLES; },
      cols: function () {
        return [
          { k: 'usuario', label: 'Usuario', clase: 'font-mono text-xs font-semibold text-slate-700' },
          { k: 'nombre', label: 'Nombre completo', clase: 'font-medium text-slate-800' },
          { k: 'rol', label: 'Rol', tipo: 'badge' },
          { k: 'ultimoF', label: 'Último acceso', clase: 'text-slate-500 text-xs' },
          { k: 'estado', label: 'Estado', tipo: 'badge' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      formVacio: function () { return { id: '', usuario: '', nombre: '', rol: 'operador', password: '', estado: 'ACTIVO' }; },
      cargar: async function () {
        this.cargando = true;
        try {
          var datos = await Api.usuarios();
          this.filas = datos.map(function (u) { return Object.assign({}, u, { ultimoF: u.ultimoAcceso ? Utils.fmtFechaHora(u.ultimoAcceso) : '—' }); });
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      abrirNuevo: function () { this.form = this.formVacio(); this.modalAbierto = true; },
      abrirEdicion: function (f) {
        this.form = { id: f.id, usuario: f.usuario, nombre: f.nombre, rol: f.rol, password: '', estado: f.estado };
        this.modalAbierto = true;
      },
      guardar: async function () {
        if (!this.form.usuario.trim() || !this.form.nombre.trim()) { AppStore.toast('Usuario y nombre son obligatorios.', 'warning'); return; }
        if (!this.form.id && !this.form.password) { AppStore.toast('Defina una contraseña para el nuevo usuario.', 'warning'); return; }
        if (this.form.password && this.form.password.length < 6) { AppStore.toast('La contraseña debe tener al menos 6 caracteres.', 'warning'); return; }
        if (this.form.password && this.form.password.trim().toLowerCase() === this.form.usuario.trim().toLowerCase()) { AppStore.toast('La contraseña no puede ser igual al nombre de usuario.', 'warning'); return; }
        this.guardando = true;
        try {
          await Api.guardarUsuario(this.form);
          AppStore.toast('Usuario guardado correctamente.', 'exito');
          this.modalAbierto = false;
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      eliminar: async function (f) {
        var ok = await AppStore.confirmar({
          titulo: 'Desactivar usuario',
          mensaje: '¿Desactivar a "' + f.nombre + '"? Se cerrarán sus sesiones activas y no podrá volver a ingresar.',
          okLabel: 'Desactivar', peligro: true
        });
        if (!ok) return;
        try {
          await Api.eliminarUsuario(f.id);
          AppStore.toast('Usuario desactivado.', 'exito');
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      }
    },
    template: `
<div>
  <page-header titulo="Usuarios y Roles" subtitulo="Credenciales con hash SHA-256 + salt; permisos validados en el backend de Apps Script">
    <template #acciones>
      <button type="button" class="btn-primario" @click="abrirNuevo"><icon name="plus" clase="w-4 h-4"></icon> Nuevo usuario</button>
    </template>
  </page-header>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
    <div v-for="r in roles" :key="r.id" class="nexo-card py-3 px-4">
      <div class="flex items-center justify-between">
        <badge :tipo="r.id"></badge>
        <span class="text-xs text-slate-400">{{ filas.filter(function(f){ return f.rol === r.id; }).length }} usuario(s)</span>
      </div>
      <p class="text-xs text-slate-500 mt-2 leading-relaxed">{{ r.desc }}</p>
    </div>
  </div>

  <data-table :cols="cols" :filas="filas" :cargando="cargando" vacio="Sin usuarios registrados" :por-pagina="10">
    <template #acciones="{ fila }">
      <div class="inline-flex items-center gap-1">
        <button type="button" class="btn-icono" title="Editar" @click="abrirEdicion(fila)"><icon name="edit" clase="w-4 h-4"></icon></button>
        <button v-if="fila.estado === 'ACTIVO'" type="button" class="btn-icono text-rose-500 hover:bg-rose-50" title="Desactivar" @click="eliminar(fila)"><icon name="trash" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <modal :abierto="modalAbierto" :titulo="form.id ? 'Editar usuario' : 'Nuevo usuario'" @cerrar="modalAbierto = false">
    <form class="space-y-4" @submit.prevent="guardar">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label-forma">Nombre de usuario *</label>
          <input v-model="form.usuario" type="text" class="input-texto font-mono" :disabled="!!form.id" required>
        </div>
        <div>
          <label class="label-forma">Rol *</label>
          <select v-model="form.rol" class="input-texto">
            <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.id.charAt(0).toUpperCase() + r.id.slice(1) }}</option>
          </select>
        </div>
      </div>
      <div>
        <label class="label-forma">Nombre completo *</label>
        <input v-model="form.nombre" type="text" class="input-texto" required>
      </div>
      <div>
        <label class="label-forma">{{ form.id ? 'Nueva contraseña (opcional)' : 'Contraseña *' }}</label>
        <input v-model="form.password" type="password" class="input-texto" :placeholder="form.id ? 'Dejar vacío para conservar la actual' : 'Mínimo 6 caracteres'" autocomplete="new-password">
      </div>
      <div v-if="form.id">
        <label class="label-forma">Estado</label>
        <select v-model="form.estado" class="input-texto"><option>ACTIVO</option><option>INACTIVO</option></select>
      </div>
    </form>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando...' : 'Guardar usuario' }}</button>
    </template>
  </modal>
</div>`
  };
})();
