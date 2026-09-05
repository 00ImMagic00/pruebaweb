/**
 * NexoERP — vista-clientes.js (ADENDA)
 * Catálogo de clientes para el POS: DNI/RUC, contacto y dirección.
 * Escritura limitada a admin/gerente (permiso "catalogos:write").
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['clientes'] = {
    components: { modal: NEXO_UI.Modal },
    data: function () {
      return {
        filas: [], cargando: true, q: '',
        modalAbierto: false, guardando: false,
        form: this.formVacio(),
        modalPts: false, cliSel: null, historialPts: [], ajustePts: '', ajusteNota: ''
      };
    },
    computed: {
      moneda: function () { return (AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'; },
      puedeEditar: function () {
        var rol = AppStore.estado.usuario ? AppStore.estado.usuario.rol : '';
        return ['admin', 'gerente'].indexOf(rol) !== -1;
      },
      filtradas: function () {
        var q = this.q.toLowerCase();
        if (!q) return this.filas;
        return this.filas.filter(function (c) {
          return (c.razonSocial || '').toLowerCase().indexOf(q) !== -1 || (c.documento || '').indexOf(q) !== -1;
        });
      },
      cols: function () {
        return [
          { k: 'documento', label: 'Documento' },
          { k: 'razonSocial', label: 'Nombre / Razón social' },
          { k: 'telefono', label: 'Teléfono / WhatsApp' },
          { k: 'limiteFiado', label: 'Límite fiado', clase: 'text-right' },
          { k: 'saldoFiado', label: 'Saldo fiado', clase: 'text-right' },
          { k: 'puntosF', label: 'Puntos', clase: 'text-right' },
          { k: 'estado', label: 'Estado' }
        ];
      }
    },
    async mounted() { await this.cargar(); },
    methods: {
      formVacio: function () {
        return { id: '', documento: '', razonSocial: '', contacto: '', telefono: '', email: '', direccion: '', estado: 'ACTIVO', limiteFiado: 0, saldoFiado: 0, tipoPrecio: '' };
      },
      cargar: async function () {
        this.cargando = true;
        try { this.filas = await Api.clientes(); }
        catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargando = false; }
      },
      nuevo: function () { this.form = this.formVacio(); this.modalAbierto = true; },
      editar: function (c) { this.form = Object.assign({}, c); this.modalAbierto = true; },
      guardar: async function () {
        if (!String(this.form.razonSocial || '').trim()) { AppStore.toast('El nombre o razón social es obligatorio.', 'warning'); return; }
        this.guardando = true;
        try {
          await Api.guardarCliente(this.form);
          AppStore.toast(this.form.id ? 'Cliente actualizado.' : 'Cliente creado.', 'exito');
          this.modalAbierto = false;
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.guardando = false; }
      },
      desactivar: async function (c) {
        var ok = await AppStore.confirmar({
          titulo: 'Desactivar cliente',
          mensaje: 'El cliente "' + c.razonSocial + '" dejará de aparecer en el POS. ¿Continuar?',
          okLabel: 'Desactivar', peligro: true
        });
        if (!ok) return;
        try {
          await Api.guardarCliente(Object.assign({}, c, { estado: 'INACTIVO' }));
          AppStore.toast('Cliente desactivado.', 'exito');
          await this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      },
      /* Adenda 1.6: historial de puntos de fidelidad */
      verPuntos: async function (c) {
        this.cliSel = c;
        try { this.historialPts = await Api.fidelHistorial(c.id); }
        catch (e) { this.historialPts = []; AppStore.toast(e.message, 'error'); }
        this.modalPts = true;
      },
      ajustarPuntos: async function () {
        if (!parseInt(this.ajustePts, 10)) { AppStore.toast('Indique los puntos (positivo o negativo).', 'warning'); return; }
        try {
          var res = await Api.fidelAjuste(this.cliSel.id, parseInt(this.ajustePts, 10), this.ajusteNota);
          AppStore.toast('Nuevo saldo: ' + res.saldo + ' puntos.', 'exito');
          this.modalPts = false; this.ajustePts = ''; this.ajusteNota = '';
          this.cargar();
        } catch (e) { AppStore.toast(e.message, 'error'); }
      }
    },
    template: `
<div>
  <page-header titulo="Clientes" subtitulo="Catálogo del POS: identificación en la boleta, teléfono para WhatsApp y límite de crédito de fiado">
    <template #acciones>
      <button v-if="puedeEditar" type="button" class="btn-primario" @click="nuevo"><icon name="plus" clase="w-4 h-4"></icon> Nuevo cliente</button>
    </template>
  </page-header>

  <div class="nexo-card mb-4">
    <div class="relative max-w-md">
      <icon name="search" clase="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></icon>
      <input v-model="q" type="text" class="input-texto pl-10" placeholder="Buscar por nombre o documento...">
    </div>
  </div>

  <data-table :cols="cols" :filas="filtradas" :cargando="cargando" vacio="No hay clientes registrados">
    <template #celda-documento="{ fila }">
      <span class="font-mono text-xs font-semibold text-slate-700">{{ fila.documento }}</span>
      <span class="block text-[11px] text-slate-400">{{ (fila.documento || '').length === 11 ? 'RUC' : 'DNI' }}</span>
    </template>
    <template #celda-razonSocial="{ fila }">
      <span class="font-medium text-slate-800">{{ fila.razonSocial }}</span>
      <span v-if="fila.email" class="block text-[11px] text-slate-400">{{ fila.email }}</span>
    </template>
    <template #celda-limiteFiado="{ fila }"><span class="tabular-nums">{{ Number(fila.limiteFiado || 0) > 0 ? moneda + ' ' + Number(fila.limiteFiado).toFixed(2) : '—' }}</span></template>
    <template #celda-saldoFiado="{ fila }">
      <span class="tabular-nums font-bold" :class="Number(fila.saldoFiado || 0) > 0 ? 'text-rose-600' : 'text-slate-400'">{{ Number(fila.saldoFiado || 0) > 0 ? moneda + ' ' + Number(fila.saldoFiado).toFixed(2) : '—' }}</span>
    </template>
    <template #celda-puntosF="{ fila }">
      <button type="button" class="tabular-nums font-bold" :class="Number(fila.puntos || 0) > 0 ? 'text-emerald-600 hover:underline' : 'text-slate-400'" title="Ver historial de puntos" @click="verPuntos(fila)">{{ Number(fila.puntos || 0) > 0 ? fila.puntos : '—' }}</button>
    </template>
    <template #celda-estado="{ fila }"><badge :tipo="fila.estado"></badge></template>
    <template #acciones="{ fila }">
      <div v-if="puedeEditar" class="flex items-center justify-end gap-0.5">
        <button type="button" class="btn-icono" title="Editar" @click="editar(fila)"><icon name="edit" clase="w-4 h-4"></icon></button>
        <button v-if="fila.estado === 'ACTIVO'" type="button" class="btn-icono text-rose-500 hover:text-rose-700" title="Desactivar" @click="desactivar(fila)"><icon name="trash" clase="w-4 h-4"></icon></button>
      </div>
    </template>
  </data-table>

  <modal :abierto="modalAbierto" :titulo="form.id ? 'Editar cliente' : 'Nuevo cliente'" ancho="max-w-lg" @cerrar="modalAbierto = false">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-forma">Documento (DNI / RUC)</label>
        <input v-model="form.documento" type="text" class="input-texto" maxlength="11" placeholder="8 dígitos DNI o 11 RUC">
      </div>
      <div>
        <label class="label-forma">Nombre / Razón social *</label>
        <input v-model="form.razonSocial" type="text" class="input-texto" placeholder="Ej. Juan Pérez / Mi Empresa S.A.C.">
      </div>
      <div>
        <label class="label-forma">Contacto</label>
        <input v-model="form.contacto" type="text" class="input-texto">
      </div>
      <div>
        <label class="label-forma">Teléfono (WhatsApp para boletas)</label>
        <input v-model="form.telefono" type="tel" class="input-texto font-mono" placeholder="9 8765 4321">
      </div>
      <div>
        <label class="label-forma">Límite de fiado (S/)</label>
        <input v-model.number="form.limiteFiado" type="number" min="0" step="10" class="input-texto">
        <p class="text-[11px] text-slate-400 mt-1">0 = sin límite configurado. El saldo actual ({{ moneda }} {{ Number(form.saldoFiado || 0).toFixed(2) }}) solo lo mueven las ventas fiadas y los abonos.</p>
      </div>
      <div>
        <label class="label-forma">Email</label>
        <input v-model="form.email" type="email" class="input-texto">
      </div>
      <div>
        <label class="label-forma">Estado</label>
        <select v-model="form.estado" class="input-texto"><option>ACTIVO</option><option>INACTIVO</option></select>
      </div>
      <div class="sm:col-span-2">
        <label class="label-forma">Dirección</label>
        <input v-model="form.direccion" type="text" class="input-texto">
      </div>
    </div>
    <template #pie>
      <button type="button" class="btn-secundario" @click="modalAbierto = false">Cancelar</button>
      <button type="button" class="btn-primario" :disabled="guardando" @click="guardar">
        <span v-if="guardando" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        {{ guardando ? 'Guardando...' : 'Guardar cliente' }}
      </button>
    </template>
  </modal>

  <!-- Adenda 1.6: historial y ajuste de puntos de fidelidad -->
  <modal :abierto="modalPts" :titulo="'Puntos de ' + (cliSel ? cliSel.razonSocial : '')" :subtitulo="cliSel ? 'Saldo actual: ' + (cliSel.puntos || 0) + ' puntos' : ''" ancho="max-w-lg" @cerrar="modalPts = false">
    <div class="divide-y divide-slate-100 max-h-72 overflow-y-auto nexo-scroll mb-4">
      <p v-if="!historialPts.length" class="text-sm text-slate-400 text-center py-6">Sin movimientos de puntos todavía.</p>
      <div v-for="h in historialPts" :key="h.id" class="py-2 flex items-center justify-between text-sm">
        <div>
          <p class="font-medium" :class="h.tipo === 'ACUMULO' ? 'text-emerald-600' : h.tipo === 'CANJE' ? 'text-blue-600' : 'text-slate-600'">
            {{ h.tipo }} <span class="tabular-nums">{{ h.puntos > 0 ? '+' : '' }}{{ h.puntos }}</span>
          </p>
          <p class="text-xs text-slate-400">{{ (h.fecha || '').replace('T', ' ').slice(0, 16) }} {{ h.nota ? '· ' + h.nota : '' }}</p>
        </div>
        <span class="text-xs text-slate-400">saldo: {{ h.saldoDespues }}</span>
      </div>
    </div>
    <div class="border-t border-slate-100 pt-3 grid grid-cols-3 gap-2 items-end" v-if="puedeEditar">
      <div>
        <label class="label-forma text-xs">Ajustar puntos (+/−)</label>
        <input v-model="ajustePts" type="number" class="input-texto py-1.5" placeholder="p. ej. 50 o -20">
      </div>
      <div>
        <label class="label-forma text-xs">Nota</label>
        <input v-model="ajusteNota" type="text" class="input-texto py-1.5" placeholder="Campaña, regalo...">
      </div>
      <button type="button" class="btn-primario py-1.5" @click="ajustarPuntos">Ajustar</button>
    </div>
  </modal>
</div>`
  };
})();
