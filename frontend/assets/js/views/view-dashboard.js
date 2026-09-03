/**
 * NexoERP — vista-dashboard.js
 * KPIs, gráficos (Chart.js), stock crítico, vencimientos y últimos movimientos.
 */
(function () {
  window.NEXO_VISTAS = window.NEXO_VISTAS || {};

  window.NEXO_VISTAS['dashboard'] = {
    data: function () {
      return {
        datos: null, cargando: true,
        chartMov: null, chartCat: null,
        /* Adenda 1.3: dashboard comparativo de ventas */
        ana: null, cargandoAna: true, rango: 'mes',
        customDesde: Utils.hoyISO(), customHasta: Utils.hoyISO(),
        chartMetodo: null, chartHora: null, chartSemana: null, chartSerie: null
      };
    },
    computed: {
      kpis: function () { return (this.datos && this.datos.kpis) || {}; },
      puedePos: function () {
        var rol = AppStore.estado.usuario ? AppStore.estado.usuario.rol : '';
        return ['admin', 'gerente', 'operador'].indexOf(rol) !== -1;
      },
      /* Adenda 1.3 */
      anaKpis: function () { return (this.ana && this.ana.kpis) || {}; },
      moneda: function () { return this.ana ? this.ana.moneda : ((AppStore.estado.cfg && AppStore.estado.cfg.MONEDA_SIMBOLO) || 'S/'); },
      deltaTotal: function () {
        var d = this.anaKpis.deltaTotalPct;
        if (d === null || d === undefined) return null;
        return (d >= 0 ? '+' : '') + d.toFixed(1) + '% vs período anterior';
      },
      deltaN: function () {
        var d = this.anaKpis.deltaNPct;
        if (d === null || d === undefined) return null;
        return (d >= 0 ? '+' : '') + d.toFixed(1) + '% vs período anterior';
      },
      horaPicoTxt: function () {
        var h = this.ana && this.ana.horaPico;
        if (!h) return 'Sin datos';
        return (h.hora < 10 ? '0' + h.hora : h.hora) + ':00 — ' + this.moneda + ' ' + Number(h.total).toFixed(2);
      },
      peorDiaTxt: function () {
        var p = this.ana && this.ana.peorDia;
        if (!p) return 'Sin datos';
        return p.dia + ' — ' + this.moneda + ' ' + Number(p.total).toFixed(2) + ' (' + p.n + ' venta(s))';
      },
      liderTxt: function () {
        var l = this.ana && this.ana.metodoLider;
        if (!l) return 'Sin datos';
        return l.metodo + ' — ' + this.moneda + ' ' + Number(l.total).toFixed(2) + ' (' + l.pct + '%)';
      }
    },
    async mounted() {
      await this.cargar();
      await this.cargarAnalitica();
    },
    beforeUnmount: function () {
      if (this.chartMov) this.chartMov.destroy();
      if (this.chartCat) this.chartCat.destroy();
      if (this.chartMetodo) this.chartMetodo.destroy();
      if (this.chartHora) this.chartHora.destroy();
      if (this.chartSemana) this.chartSemana.destroy();
      if (this.chartSerie) this.chartSerie.destroy();
    },
    methods: {
      cargar: async function () {
        this.cargando = true;
        try {
          this.datos = await Api.dashboard();
          this.$nextTick(function () { this.pintarGraficos(); }.bind(this));
        } catch (e) {
          AppStore.toast(e.message, 'error');
        } finally {
          this.cargando = false;
        }
      },
      pintarGraficos: function () {
        var self = this;
        if (this.chartMov) { this.chartMov.destroy(); this.chartMov = null; }
        if (this.chartCat) { this.chartCat.destroy(); this.chartCat = null; }
        if (!this.datos) return;

        var elMov = document.getElementById('chart-movimientos');
        if (elMov) {
          var s = this.datos.serieMovimientos;
          this.chartMov = new Chart(elMov.getContext('2d'), {
            type: 'bar',
            data: {
              labels: s.map(function (x) { return x.etiqueta; }),
              datasets: [
                { label: 'Entradas', data: s.map(function (x) { return x.entradas; }), backgroundColor: '#10b981', borderRadius: 4, maxBarThickness: 18 },
                { label: 'Salidas', data: s.map(function (x) { return x.salidas; }), backgroundColor: '#2563eb', borderRadius: 4, maxBarThickness: 18 }
              ]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } } },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#f1f5f9' } }
              }
            }
          });
        }

        var elCat = document.getElementById('chart-categorias');
        if (elCat && this.datos.valorPorCategoria.length) {
          var paleta = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f472b6'];
          this.chartCat = new Chart(elCat.getContext('2d'), {
            type: 'doughnut',
            data: {
              labels: this.datos.valorPorCategoria.map(function (x) { return x.categoria; }),
              datasets: [{ data: this.datos.valorPorCategoria.map(function (x) { return x.valor; }), backgroundColor: paleta, borderWidth: 2, borderColor: '#fff' }]
            },
            options: {
              responsive: true, maintainAspectRatio: false, cutout: '62%',
              plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } } }
            }
          });
        }
      },
      irA: function (r) { AppStore.irA(r); },

      /* ---------- Adenda 1.3: dashboard comparativo ---------- */
      rangoFechas: function () {
        var hoy = new Date();
        var iso = Utils.fechaISO;
        var d;
        switch (this.rango) {
          case 'hoy': return { desde: iso(hoy), hasta: iso(hoy) };
          case 'ayer':
            d = new Date(hoy.getTime() - 86400000);
            return { desde: iso(d), hasta: iso(d) };
          case 'd7':
            d = new Date(hoy.getTime() - 6 * 86400000);
            return { desde: iso(d), hasta: iso(hoy) };
          case 'mesPrev':
            var primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            var finPrev = new Date(primeroMes.getTime() - 86400000);
            return { desde: iso(new Date(finPrev.getFullYear(), finPrev.getMonth(), 1)), hasta: iso(finPrev) };
          case 'custom': return { desde: this.customDesde, hasta: this.customHasta };
          default: return { desde: iso(hoy).slice(0, 8) + '01', hasta: iso(hoy) };
        }
      },
      elegirRango: function (r) { this.rango = r; this.cargarAnalitica(); },
      cargarAnalitica: async function () {
        this.cargandoAna = true;
        var f = this.rangoFechas();
        try {
          this.ana = await Api.ventasAnalitica({ fechaDesde: f.desde, fechaHasta: f.hasta });
          this.$nextTick(function () { this.pintarComparativo(); }.bind(this));
        } catch (e) { AppStore.toast(e.message, 'error'); }
        finally { this.cargandoAna = false; }
      },
      colorMetodo: function (m) {
        return { Efectivo: '#2563eb', Yape: '#8b5cf6', Plin: '#14b8a6', Tarjeta: '#f59e0b', Fiado: '#e11d48' }[m] || '#94a3b8';
      },
      pintarComparativo: function () {
        var self = this;
        if (!this.ana) return;
        if (this.chartMetodo) { this.chartMetodo.destroy(); this.chartMetodo = null; }
        if (this.chartHora) { this.chartHora.destroy(); this.chartHora = null; }
        if (this.chartSemana) { this.chartSemana.destroy(); this.chartSemana = null; }
        if (this.chartSerie) { this.chartSerie.destroy(); this.chartSerie = null; }

        var elMet = document.getElementById('chart-metodos');
        if (elMet && this.ana.porMetodo.length) {
          this.chartMetodo = new Chart(elMet.getContext('2d'), {
            type: 'doughnut',
            data: {
              labels: this.ana.porMetodo.map(function (x) { return x.metodo; }),
              datasets: [{
                data: this.ana.porMetodo.map(function (x) { return x.total; }),
                backgroundColor: this.ana.porMetodo.map(function (x) { return self.colorMetodo(x.metodo); }),
                borderWidth: 2, borderColor: '#fff'
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false, cutout: '58%',
              plugins: {
                legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
                tooltip: { callbacks: { label: function (ctx) { return ctx.label + ': ' + self.moneda + ' ' + Number(ctx.parsed).toFixed(2) + ' (' + (self.ana.porMetodo[ctx.dataIndex] ? self.ana.porMetodo[ctx.dataIndex].n : 0) + ' ventas)'; } } }
              }
            }
          });
        }

        var elHora = document.getElementById('chart-horas');
        if (elHora) {
          var horas = this.ana.porHora.filter(function (h) { return h.hora >= 6 && h.hora <= 23; });
          var horaPico = this.ana.horaPico ? this.ana.horaPico.hora : -1;
          this.chartHora = new Chart(elHora.getContext('2d'), {
            type: 'bar',
            data: {
              labels: horas.map(function (h) { return (h.hora < 10 ? '0' + h.hora : h.hora) + 'h'; }),
              datasets: [{
                label: 'Ventas', data: horas.map(function (h) { return h.total; }),
                backgroundColor: horas.map(function (h) { return h.hora === horaPico ? '#e11d48' : '#2563eb'; }),
                borderRadius: 3, maxBarThickness: 16
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return self.moneda + ' ' + Number(ctx.parsed.y).toFixed(2) + ' (' + horas[ctx.dataIndex].n + ' ventas)'; } } } },
              scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } } }
            }
          });
        }

        var elSem = document.getElementById('chart-semana');
        if (elSem) {
          var peor = this.ana.peorDia ? this.ana.peorDia.dia : '';
          this.chartSemana = new Chart(elSem.getContext('2d'), {
            type: 'bar',
            data: {
              labels: this.ana.porDiaSemana.map(function (d) { return d.dia.slice(0, 3); }),
              datasets: [{
                label: 'Ventas', data: this.ana.porDiaSemana.map(function (d) { return d.total; }),
                backgroundColor: this.ana.porDiaSemana.map(function (d) { return d.dia === peor ? '#f59e0b' : '#10b981'; }),
                borderRadius: 3, maxBarThickness: 20
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return self.moneda + ' ' + Number(ctx.parsed.y).toFixed(2) + ' (' + self.ana.porDiaSemana[ctx.dataIndex].n + ' ventas)'; } } } },
              scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } } }
            }
          });
        }

        var elSerie = document.getElementById('chart-serie');
        if (elSerie) {
          this.chartSerie = new Chart(elSerie.getContext('2d'), {
            type: 'line',
            data: {
              labels: this.ana.serieDiaria.map(function (d) { return d.etiqueta; }),
              datasets: [{
                label: 'Ventas por día', data: this.ana.serieDiaria.map(function (d) { return d.total; }),
                borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', fill: true,
                tension: 0.35, pointRadius: 2, pointBackgroundColor: '#2563eb', borderWidth: 2
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return self.moneda + ' ' + Number(ctx.parsed.y).toFixed(2); } } } },
              scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } } }
            }
          });
        }
      }
    },
    template: `
<div>
  <page-header titulo="Dashboard de Operaciones" subtitulo="Resumen general del inventario y los movimientos del sistema">
    <template #acciones>
      <button type="button" class="btn-secundario" @click="cargar" :disabled="cargando">
        <icon name="refresh" clase="w-4 h-4" :class="cargando ? 'animate-spin' : ''"></icon> Actualizar
      </button>
      <button type="button" class="btn-primario" @click="irA('movimientos')">
        <icon name="plus" clase="w-4 h-4"></icon> Nuevo movimiento
      </button>
      <button type="button" class="btn-secundario" @click="irA('pos')" v-if="puedePos">
        <icon name="pos" clase="w-4 h-4"></icon> Abrir POS
      </button>
    </template>
  </page-header>

  <div v-if="cargando && !datos" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    <div v-for="i in 4" :key="i" class="nexo-card h-24 animate-pulse bg-slate-200/60"></div>
  </div>

  <div v-else>
    <!-- KPIs -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <kpi-card label="Valor del inventario" :valor="Utils.fmtMoneda(kpis.valorInventario)" icono="facturas" tono="blue" detalle="Valorización a costo estándar"></kpi-card>
      <kpi-card label="Productos activos" :valor="String(kpis.productosActivos || 0)" icono="productos" tono="emerald" detalle="SKUs habilitados"></kpi-card>
      <kpi-card label="Stock crítico" :valor="String(kpis.stockCritico || 0)" icono="warning" tono="rose" detalle="Productos en o bajo el mínimo" @click="irA('alertas')"></kpi-card>
      <kpi-card label="Movimientos hoy" :valor="String(kpis.movimientosHoy || 0)" icono="movimientos" tono="violet" :detalle="kpis.lotesPorVencer + ' lote(s) por vencer'"></kpi-card>
    </div>

    <!-- Adenda: KPIs de ventas y caja -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4 mt-4">
      <kpi-card label="Ventas de hoy (POS)" :valor="Utils.fmtMoneda(kpis.ventasHoyTotal || 0)" icono="pos" tono="blue" :detalle="(kpis.ventasHoyN || 0) + ' boleta(s) emitida(s)'"></kpi-card>
      <kpi-card label="Estado de caja" :valor="kpis.cajaAbierta ? 'ABIERTA' : 'CERRADA'" icono="dinero" :tono="kpis.cajaAbierta ? 'emerald' : 'rose'" detalle="Cuadre diario por método de pago"></kpi-card>
    </div>

    <!-- ==================== Adenda 1.3: DASHBOARD COMPARATIVO DE VENTAS ==================== -->
    <div class="nexo-card mt-4">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2"><icon name="reportes" clase="w-5 h-5 text-blue-600"></icon> Comparativo de ventas</h3>
          <p class="text-xs text-slate-400 mt-0.5">Elige el período a analizar: métodos de pago, horas pico y días menos fuertes de la semana</p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <button v-for="r in [{k:'hoy',l:'Hoy'},{k:'ayer',l:'Ayer'},{k:'d7',l:'Últimos 7 días'},{k:'mes',l:'Este mes'},{k:'mesPrev',l:'Mes pasado'},{k:'custom',l:'Personalizado'}]" :key="r.k"
            type="button" @click="elegirRango(r.k)"
            class="text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
            :class="rango === r.k ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'">{{ r.l }}</button>
        </div>
      </div>

      <div v-if="rango === 'custom'" class="flex flex-wrap items-end gap-3 mb-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
        <div><label class="label-forma">Desde</label><input v-model="customDesde" type="date" class="input-texto"></div>
        <div><label class="label-forma">Hasta</label><input v-model="customHasta" type="date" class="input-texto"></div>
        <button type="button" class="btn-primario" :disabled="cargandoAna" @click="cargarAnalitica"><icon name="search" clase="w-4 h-4"></icon> Analizar período</button>
      </div>

      <div v-if="cargandoAna && !ana" class="py-10 text-center"><span class="inline-block w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></span></div>

      <template v-else-if="ana">
        <!-- KPIs comparativos -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <div class="rounded-xl ring-1 ring-slate-200 px-4 py-3">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total vendido</p>
            <p class="text-lg font-bold text-slate-900 tabular-nums">{{ moneda }} {{ Utils.fmtNum(anaKpis.total, 2) }}</p>
            <p v-if="deltaTotal" class="text-[11px] font-semibold mt-0.5" :class="anaKpis.deltaTotalPct >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ deltaTotal }} ({{ moneda }} {{ Utils.fmtNum(anaKpis.prevTotal, 2) }})</p>
            <p v-else class="text-[11px] text-slate-400 mt-0.5">Sin período anterior comparable</p>
          </div>
          <div class="rounded-xl ring-1 ring-slate-200 px-4 py-3">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">N° de ventas</p>
            <p class="text-lg font-bold text-slate-900 tabular-nums">{{ anaKpis.nVentas }}</p>
            <p v-if="deltaN" class="text-[11px] font-semibold mt-0.5" :class="anaKpis.deltaNPct >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ deltaN }} ({{ anaKpis.prevN }} antes)</p>
            <p v-else class="text-[11px] text-slate-400 mt-0.5">{{ ana.dias }} día(s) analizado(s)</p>
          </div>
          <div class="rounded-xl ring-1 ring-slate-200 px-4 py-3">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Ticket promedio</p>
            <p class="text-lg font-bold text-slate-900 tabular-nums">{{ moneda }} {{ Utils.fmtNum(anaKpis.ticketPromedio, 2) }}</p>
          </div>
          <div class="rounded-xl ring-1 ring-slate-200 px-4 py-3">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Margen bruto</p>
            <p class="text-lg font-bold tabular-nums" :class="anaKpis.margen >= 0 ? 'text-emerald-700' : 'text-rose-600'">{{ moneda }} {{ Utils.fmtNum(anaKpis.margen, 2) }}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">{{ anaKpis.margenPct }}% · costo {{ moneda }} {{ Utils.fmtNum(anaKpis.costo, 2) }}</p>
          </div>
          <div class="rounded-xl ring-1 px-4 py-3" :class="anaKpis.fiadoPendiente > 0 ? 'bg-rose-50/60 ring-rose-200' : 'ring-slate-200'">
            <p class="text-[11px] font-semibold uppercase tracking-wide" :class="anaKpis.fiadoPendiente > 0 ? 'text-rose-500' : 'text-slate-400'">Fiado por cobrar</p>
            <p class="text-lg font-bold tabular-nums" :class="anaKpis.fiadoPendiente > 0 ? 'text-rose-600' : 'text-slate-900'">{{ moneda }} {{ Utils.fmtNum(anaKpis.fiadoPendiente, 2) }}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">{{ anaKpis.fiadoClientes }} cliente(s) con deuda</p>
          </div>
        </div>

        <!-- Insights -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div class="rounded-xl bg-blue-50/70 ring-1 ring-inset ring-blue-600/10 px-4 py-3">
            <p class="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Método líder</p>
            <p class="text-sm font-semibold text-slate-800 mt-0.5">{{ liderTxt }}</p>
          </div>
          <div class="rounded-xl bg-rose-50/70 ring-1 ring-inset ring-rose-600/10 px-4 py-3">
            <p class="text-[11px] font-bold text-rose-700 uppercase tracking-wide">Hora pico</p>
            <p class="text-sm font-semibold text-slate-800 mt-0.5">{{ horaPicoTxt }}</p>
          </div>
          <div class="rounded-xl bg-amber-50/70 ring-1 ring-inset ring-amber-600/10 px-4 py-3">
            <p class="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Día menos fuerte de la semana</p>
            <p class="text-sm font-semibold text-slate-800 mt-0.5">{{ peorDiaTxt }}</p>
          </div>
        </div>

        <!-- Gráficos -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p class="text-xs font-semibold text-slate-500 mb-2">Ventas por método de pago ({{ moneda }})</p>
            <div class="h-56"><canvas id="chart-metodos"></canvas></div>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-500 mb-2">Horas con más ventas (rojo = hora pico)</p>
            <div class="h-56"><canvas id="chart-horas"></canvas></div>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-500 mb-2">Ventas por día de la semana (ámbar = el más débil)</p>
            <div class="h-56"><canvas id="chart-semana"></canvas></div>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-500 mb-2">Tendencia diaria del período</p>
            <div class="h-56"><canvas id="chart-serie"></canvas></div>
          </div>
        </div>

        <!-- Top productos y clientes -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <p class="text-xs font-semibold text-slate-500 mb-2">Top productos por ingresos</p>
            <div class="rounded-xl ring-1 ring-slate-200 divide-y divide-slate-100">
              <div v-for="p in ana.topProductos" :key="p.productoId" class="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <span class="truncate">{{ p.descripcion }}<span class="block text-[10px] text-slate-400 font-mono">{{ p.sku }}</span></span>
                <span class="shrink-0 text-right"><b class="tabular-nums">{{ moneda }} {{ Number(p.total).toFixed(2) }}</b>
                  <span class="block text-[10px]" :class="p.margen >= 0 ? 'text-emerald-600' : 'text-rose-500'">margen {{ moneda }} {{ Number(p.margen).toFixed(2) }}</span></span>
              </div>
              <p v-if="!ana.topProductos.length" class="px-3 py-4 text-xs text-slate-400 text-center">Sin ventas en el período</p>
            </div>
          </div>
          <div>
            <p class="text-xs font-semibold text-slate-500 mb-2">Top clientes</p>
            <div class="rounded-xl ring-1 ring-slate-200 divide-y divide-slate-100">
              <div v-for="c in ana.topClientes" :key="c.nombre" class="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <span class="truncate">{{ c.nombre }}</span>
                <span class="shrink-0 font-bold tabular-nums">{{ moneda }} {{ Number(c.total).toFixed(2) }} <span class="text-[10px] font-normal text-slate-400">({{ c.n }})</span></span>
              </div>
              <p v-if="!ana.topClientes.length" class="px-3 py-4 text-xs text-slate-400 text-center">Sin clientes en el período</p>
            </div>
          </div>
        </div>
      </template>
    </div>
    <!-- ==================== FIN DASHBOARD COMPARATIVO ==================== -->

    <!-- Gráficos -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
      <div class="nexo-card xl:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-slate-800 text-sm">Movimientos de los últimos 14 días</h3>
        </div>
        <div class="h-64"><canvas id="chart-movimientos"></canvas></div>
      </div>
      <div class="nexo-card">
        <h3 class="font-semibold text-slate-800 text-sm mb-3">Valor de inventario por categoría</h3>
        <div class="h-64"><canvas id="chart-categorias"></canvas></div>
      </div>
    </div>

    <!-- Stock crítico + vencimientos -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
      <div class="nexo-card p-0 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :class="kpis.stockCritico ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'"></span>
            Stock crítico
          </h3>
          <button type="button" class="text-xs font-medium text-blue-600 hover:text-blue-800" @click="irA('alertas')">Ver alertas →</button>
        </div>
        <div class="max-h-72 overflow-y-auto nexo-scroll">
          <table class="min-w-full text-sm">
            <tbody class="divide-y divide-slate-100">
              <tr v-for="f in datos.stockCritico" :key="f.productoId + f.almacenId" class="hover:bg-rose-50/40">
                <td class="px-4 py-2.5">
                  <p class="font-medium text-slate-800 truncate max-w-[220px]">{{ f.producto }}</p>
                  <p class="text-xs text-slate-400">{{ f.sku }} · {{ f.almacen }}</p>
                </td>
                <td class="px-4 py-2.5 text-right">
                  <p class="font-bold tabular-nums" :class="f.cantidad <= 0 ? 'text-rose-600' : 'text-amber-600'">{{ Utils.fmtNum(f.cantidad) }} <span class="text-xs font-normal text-slate-400">{{ f.unidad }}</span></p>
                  <p class="text-xs text-slate-400">mín. {{ Utils.fmtNum(f.stockMin) }}</p>
                </td>
              </tr>
              <tr v-if="!datos.stockCritico.length"><td class="px-4 py-8 text-center text-sm text-slate-400">Sin productos en nivel crítico ✓</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="nexo-card p-0 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 class="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :class="datos.vencimientos.length ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"></span>
            Lotes próximos a vencer
          </h3>
          <button type="button" class="text-xs font-medium text-blue-600 hover:text-blue-800" @click="irA('lotes')">Ver lotes →</button>
        </div>
        <div class="max-h-72 overflow-y-auto nexo-scroll">
          <table class="min-w-full text-sm">
            <tbody class="divide-y divide-slate-100">
              <tr v-for="v in datos.vencimientos" :key="v.lote + v.producto" class="hover:bg-amber-50/40">
                <td class="px-4 py-2.5">
                  <p class="font-medium text-slate-800 truncate max-w-[200px]">{{ v.producto }}</p>
                  <p class="text-xs text-slate-400">Lote {{ v.lote }} · {{ v.almacen }}</p>
                </td>
                <td class="px-4 py-2.5 text-right">
                  <badge :tipo="v.diasRestantes < 0 ? 'VENCIDO' : 'POR_VENCER'"></badge>
                  <p class="text-xs text-slate-400 mt-1">{{ Utils.fmtFecha(v.fechaVencimiento) }} · {{ Utils.fmtNum(v.cantidad) }} u.</p>
                </td>
              </tr>
              <tr v-if="!datos.vencimientos.length"><td class="px-4 py-8 text-center text-sm text-slate-400">Sin vencimientos próximos ✓</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Últimos movimientos -->
    <div class="nexo-card p-0 overflow-hidden mt-4">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 class="font-semibold text-slate-800 text-sm">Últimos movimientos</h3>
        <button type="button" class="text-xs font-medium text-blue-600 hover:text-blue-800" @click="irA('movimientos')">Ver todos →</button>
      </div>
      <div class="overflow-x-auto nexo-scroll">
        <table class="min-w-full text-sm">
          <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
            <th class="px-4 py-2 text-left font-semibold">Fecha</th>
            <th class="px-4 py-2 text-left font-semibold">Documento</th>
            <th class="px-4 py-2 text-left font-semibold">Tipo</th>
            <th class="px-4 py-2 text-left font-semibold">Producto</th>
            <th class="px-4 py-2 text-right font-semibold">Cantidad</th>
            <th class="px-4 py-2 text-right font-semibold">Usuario</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="m in datos.ultimosMovimientos" :key="m.id" class="hover:bg-blue-50/40">
              <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">{{ Utils.fmtFechaHora(m.fecha) }}</td>
              <td class="px-4 py-2.5 font-mono text-xs text-slate-600">{{ m.documentoRef || m.id }}</td>
              <td class="px-4 py-2.5"><badge :tipo="m.tipo"></badge></td>
              <td class="px-4 py-2.5 text-slate-800">{{ m.producto }}</td>
              <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{{ Utils.fmtNum(m.cantidad) }} <span class="text-xs font-normal text-slate-400">{{ m.unidad }}</span></td>
              <td class="px-4 py-2.5 text-right text-slate-500">{{ m.usuario }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>`
  };
})();
