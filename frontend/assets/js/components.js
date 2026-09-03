/**
 * NexoERP — components.js
 * Biblioteca de componentes UI compartidos (Tailwind + Vue 3).
 */
(function () {

  /* ============ Iconos SVG (heroicons outline) ============ */
  var ICONOS = {
    dashboard: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75',
    productos: 'm21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
    almacenes: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21',
    stock: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
    lotes: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z',
    kardex: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
    movimientos: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    alertas: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
    usuarios: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
    reportes: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    config: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    auditoria: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    logout: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9',
    plus: 'M12 4.5v15m7.5-7.5h-15',
    search: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
    edit: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
    trash: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
    x: 'M6 18L18 6M6 6l12 12',
    check: 'M4.5 12.75l6 6 9-13.5',
    menu: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
    download: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
    warning: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    chevronDown: 'M19.5 8.25l-7.5 7.5-7.5-7.5',
    chevronLeft: 'M15.75 19.5L8.25 12l7.5-7.5',
    chevronRight: 'M8.25 4.5l7.5 7.5-7.5 7.5',
    ojo: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    refresh: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
    lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    camion: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
    facturas: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    cajas: 'M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
    engranajes: 'M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00-.582-4.717.532.532 0 01.533-.57v0c.355 0 .676.186.959.401.29.221.634.349 1.003.349 1.035 0 1.875-1.007 1.875-2.25s-.84-2.25-1.875-2.25c-.369 0-.713.128-1.003.349-.283.215-.604.401-.96.401v0a.656.656 0 01-.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z',
    /* --- Adenda: POS, caja y boletas --- */
    pos: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
    dinero: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    boleta: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
    tarjeta: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
    cliente: 'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
    /* --- Adenda 1.2: POS Pro (descuentos, regalos, autorizaciones) --- */
    regalo: 'M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
    autorizar: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    pausa: 'M15.75 5.25v13.5m-7.5-13.5v13.5',
    etiqueta: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z',
    /* --- Adenda 1.3: fiados, WhatsApp, cotizaciones y panel --- */
    whatsapp: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
    fiados: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    cotizaciones: 'M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12',
    panel: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605'
  };

  var Icon = {
    props: { name: { type: String, required: true }, clase: { type: String, default: 'w-5 h-5' } },
    computed: {
      d: function () { return ICONOS[this.name] || ICONOS.productos; }
    },
    template: '<svg :class="clase" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" :d="d"/></svg>'
  };

  /* ============ Badges de estado ============ */
  var Badge = {
    props: { tipo: String, texto: String },
    computed: {
      clase: function () {
        var mapa = {
          ACTIVO: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          OK: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          INACTIVO: 'bg-slate-100 text-slate-600 ring-slate-500/20',
          ANULADO: 'bg-rose-50 text-rose-700 ring-rose-600/20',
          CRITICO: 'bg-rose-50 text-rose-700 ring-rose-600/20',
          VENCIDO: 'bg-rose-50 text-rose-700 ring-rose-600/20',
          POR_VENCER: 'bg-amber-50 text-amber-700 ring-amber-600/20',
          SIN_VENCIMIENTO: 'bg-slate-100 text-slate-600 ring-slate-500/20',
          ENTRADA: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          DEVOLUCION: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          AJUSTE_POSITIVO: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          SALIDA: 'bg-blue-50 text-blue-700 ring-blue-600/20',
          TRANSFERENCIA: 'bg-violet-50 text-violet-700 ring-violet-600/20',
          AJUSTE_NEGATIVO: 'bg-amber-50 text-amber-700 ring-amber-600/20',
          ANULACION: 'bg-rose-50 text-rose-700 ring-rose-600/20',
          EMITIDA: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          ANULADA: 'bg-rose-50 text-rose-700 ring-rose-600/20',
          PAGADO: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          FIADO: 'bg-rose-50 text-rose-700 ring-rose-600/20',
          VIGENTE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          CONVERTIDA: 'bg-blue-50 text-blue-700 ring-blue-600/20',
          VENCIDA: 'bg-amber-50 text-amber-700 ring-amber-600/20',
          ABIERTA: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          CERRADA: 'bg-slate-100 text-slate-600 ring-slate-500/20',
          'Efectivo': 'bg-blue-50 text-blue-700 ring-blue-600/20',
          'Yape': 'bg-violet-50 text-violet-700 ring-violet-600/20',
          'Plin': 'bg-teal-50 text-teal-700 ring-teal-600/20',
          'Tarjeta': 'bg-amber-50 text-amber-700 ring-amber-600/20',
          'Fiado': 'bg-rose-50 text-rose-700 ring-rose-600/20',
          admin: 'bg-slate-900 text-white ring-slate-900',
          gerente: 'bg-blue-50 text-blue-700 ring-blue-600/20',
          operador: 'bg-teal-50 text-teal-700 ring-teal-600/20',
          consulta: 'bg-slate-100 text-slate-600 ring-slate-500/20'
        };
        return mapa[this.tipo] || 'bg-slate-100 text-slate-700 ring-slate-500/20';
      },
      etiqueta: function () {
        var t = String(this.texto !== null && this.texto !== undefined ? this.texto : this.tipo);
        return t.replace(/_/g, ' ');
      }
    },
    template: '<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize whitespace-nowrap" :class="clase">{{ etiqueta }}</span>'
  };

  /* ============ Modal ============ */
  var Modal = {
    props: { abierto: Boolean, titulo: String, subtitulo: String, ancho: { type: String, default: 'max-w-lg' } },
    emits: ['cerrar'],
    watch: {
      abierto: function (v) {
        if (v) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = '';
      }
    },
    template: `
<teleport to="body">
  <div v-if="abierto" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" @click="$emit('cerrar')"></div>
    <div class="relative w-full max-w-full sm:w-auto" :class="ancho">
      <div class="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ring-slate-900/5 max-h-[92vh] flex flex-col animate-slide-up">
        <div class="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div>
            <h3 class="text-base font-semibold text-slate-900">{{ titulo }}</h3>
            <p v-if="subtitulo" class="text-xs text-slate-500 mt-0.5">{{ subtitulo }}</p>
          </div>
          <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" @click="$emit('cerrar')" aria-label="Cerrar">
            <icon name="x" clase="w-5 h-5"></icon>
          </button>
        </div>
        <div class="px-5 py-4 overflow-y-auto nexo-scroll">
          <slot></slot>
        </div>
        <div v-if="$slots.pie" class="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 rounded-b-2xl flex flex-wrap justify-end gap-2">
          <slot name="pie"></slot>
        </div>
      </div>
    </div>
  </div>
</teleport>`
  };

  /* ============ DataTable con paginación ============ */
  var DataTable = {
    props: {
      cols: { type: Array, required: true },
      filas: { type: Array, default: function () { return []; } },
      cargando: Boolean,
      vacio: { type: String, default: 'Sin registros para mostrar' },
      porPagina: { type: Number, default: 12 },
      compacta: Boolean
    },
    data: function () { return { pagina: 1 }; },
    computed: {
      totalPaginas: function () { return Math.max(1, Math.ceil(this.filas.length / this.porPagina)); },
      visibles: function () {
        var ini = (this.pagina - 1) * this.porPagina;
        return this.filas.slice(ini, ini + this.porPagina);
      }
    },
    watch: { filas: function () { this.pagina = 1; } },
    template: `
<div class="nexo-card p-0 overflow-hidden">
  <div class="overflow-x-auto nexo-scroll">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="bg-slate-50 border-b border-slate-200">
          <th v-for="c in cols" :key="c.k" class="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap" :class="[c.clase || '', compacta ? 'text-xs' : '']">{{ c.label }}</th>
          <th v-if="$slots.acciones" class="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Acciones</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-if="cargando">
          <td :colspan="cols.length + ($slots.acciones ? 1 : 0)" class="px-3 py-12 text-center text-slate-400">
            <span class="inline-block w-6 h-6 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></span>
          </td>
        </tr>
        <tr v-else-if="!filas.length">
          <td :colspan="cols.length + ($slots.acciones ? 1 : 0)" class="px-3 py-12 text-center">
            <div class="flex flex-col items-center gap-2 text-slate-400">
              <svg class="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>
              <span class="text-sm">{{ vacio }}</span>
            </div>
          </td>
        </tr>
        <tr v-else v-for="(f, i) in visibles" :key="f._id || i" class="hover:bg-blue-50/40 transition-colors">
          <td v-for="c in cols" :key="c.k" class="px-3 whitespace-nowrap" :class="[(compacta ? 'py-1.5 text-xs' : 'py-2.5'), (c.clase || '')]">
            <slot :name="'celda-' + c.k" :fila="f" :valor="f[c.k]">
              <span v-if="c.tipo === 'badge'"><badge :tipo="f[c.k]"></badge></span>
              <span v-else>{{ f[c.k] === '' || f[c.k] === null || f[c.k] === undefined ? '—' : f[c.k] }}</span>
            </slot>
          </td>
          <td v-if="$slots.acciones" class="px-3 py-1.5 whitespace-nowrap text-right">
            <slot name="acciones" :fila="f"></slot>
          </td>
        </tr>
      </tbody>
      <tfoot v-if="$slots.pie">
        <tr class="bg-slate-50 border-t border-slate-200"><td :colspan="cols.length + ($slots.acciones ? 1 : 0)"><slot name="pie"></slot></td></tr>
      </tfoot>
    </table>
  </div>
  <div v-if="filas.length > porPagina" class="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-500">
    <span>{{ filas.length }} registros · página {{ pagina }} de {{ totalPaginas }}</span>
    <div class="flex items-center gap-1">
      <button type="button" class="rounded-md px-2 py-1 hover:bg-white hover:shadow-sm disabled:opacity-40 transition-all" :disabled="pagina <= 1" @click="pagina--">Anterior</button>
      <button type="button" class="rounded-md px-2 py-1 hover:bg-white hover:shadow-sm disabled:opacity-40 transition-all" :disabled="pagina >= totalPaginas" @click="pagina++">Siguiente</button>
    </div>
  </div>
</div>`
  };

  /* ============ KPI Card ============ */
  var KpiCard = {
    props: { label: String, valor: String, icono: String, tono: { type: String, default: 'blue' }, detalle: String },
    computed: {
      tonoClases: function () {
        var mapa = {
          blue: 'bg-blue-50 text-blue-600',
          emerald: 'bg-emerald-50 text-emerald-600',
          rose: 'bg-rose-50 text-rose-600',
          amber: 'bg-amber-50 text-amber-600',
          violet: 'bg-violet-50 text-violet-600',
          slate: 'bg-slate-100 text-slate-600'
        };
        return mapa[this.tono] || mapa.blue;
      }
    },
    template: `
<div class="nexo-card flex items-start gap-4">
  <div class="rounded-xl p-2.5 shrink-0" :class="tonoClases"><icon :name="icono" clase="w-6 h-6"></icon></div>
  <div class="min-w-0">
    <p class="text-xs font-medium text-slate-500 uppercase tracking-wide">{{ label }}</p>
    <p class="mt-1 text-xl font-bold text-slate-900 tabular-nums whitespace-nowrap">{{ valor }}</p>
    <p v-if="detalle" class="mt-0.5 text-xs text-slate-400">{{ detalle }}</p>
  </div>
</div>`
  };

  /* ============ Page Header ============ */
  var PageHeader = {
    props: { titulo: String, subtitulo: String },
    template: `
<div class="flex flex-wrap items-end justify-between gap-3 mb-5">
  <div>
    <h2 class="text-xl font-bold text-slate-900 tracking-tight">{{ titulo }}</h2>
    <p v-if="subtitulo" class="text-sm text-slate-500 mt-0.5">{{ subtitulo }}</p>
  </div>
  <div class="flex flex-wrap items-center gap-2"><slot name="acciones"></slot></div>
</div>`
  };

  /* ============ Confirm dialog ============ */
  var ConfirmDialog = {
    computed: { c: function () { return AppStore.estado.confirmacion; } },
    methods: {
      responder: function (v) {
        var c = this.c;
        AppStore.estado.confirmacion = null;
        if (c && c.resolve) c.resolve(v);
      }
    },
    template: `
<teleport to="body">
  <div v-if="c" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" @click="responder(false)"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/5 w-full max-w-md p-5 animate-slide-up">
      <div class="flex items-start gap-3">
        <div class="rounded-xl p-2" :class="c.peligro ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'"><icon name="warning" clase="w-6 h-6"></icon></div>
        <div class="min-w-0">
          <h3 class="font-semibold text-slate-900">{{ c.titulo }}</h3>
          <p class="text-sm text-slate-500 mt-1 whitespace-pre-line">{{ c.mensaje }}</p>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn-secundario" @click="responder(false)">Cancelar</button>
        <button type="button" :class="c.peligro ? 'btn-peligro' : 'btn-primario'" @click="responder(true)">{{ c.okLabel }}</button>
      </div>
    </div>
  </div>
</teleport>`
  };

  /* ============ Toasts ============ */
  var ToastZone = {
    computed: { toasts: function () { return AppStore.estado.toasts; } },
    template: `
<teleport to="body">
  <div class="fixed z-[70] bottom-4 right-4 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg ring-1 text-sm animate-slide-left"
      :class="t.tipo === 'error' ? 'bg-rose-600 text-white ring-rose-700' : t.tipo === 'exito' ? 'bg-emerald-600 text-white ring-emerald-700' : t.tipo === 'warning' ? 'bg-amber-500 text-white ring-amber-600' : 'bg-slate-800 text-white ring-slate-900'">
      <icon :name="t.tipo === 'error' ? 'x' : t.tipo === 'warning' ? 'warning' : 'check'" clase="w-4 h-4 mt-0.5 shrink-0"></icon>
      <span class="flex-1">{{ t.mensaje }}</span>
    </div>
  </div>
</teleport>`
  };

  /* ============ Selector con búsqueda (productos) ============ */
  var SearchSelect = {
    props: { modelValue: String, opciones: { type: Array, required: true }, placeholder: { type: String, default: 'Buscar...' }, texto: { type: String, default: 'nombre' }, disabled: Boolean },
    emits: ['update:modelValue'],
    data: function () { return { q: '', abierto: false }; },
    computed: {
      filtradas: function () {
        var q = this.q.toLowerCase();
        var self = this;
        return this.opciones.filter(function (o) { return !q || String(o[self.texto]).toLowerCase().indexOf(q) !== -1 || String(o.sku || '').toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
      },
      seleccionada: function () {
        var v = this.modelValue;
        return this.opciones.find(function (o) { return o.id === v; }) || null;
      }
    },
    template: `
<div class="relative" @keydown.esc="abierto = false">
  <button type="button" :disabled="disabled" class="input-texto text-left flex items-center justify-between gap-2" :class="disabled ? 'opacity-60' : ''" @click="!disabled && (abierto = !abierto)">
    <span class="truncate" :class="seleccionada ? '' : 'text-slate-400'">{{ seleccionada ? (seleccionada.sku ? seleccionada.sku + ' — ' : '') + seleccionada[texto] : placeholder }}</span>
    <icon name="chevronDown" clase="w-4 h-4 text-slate-400 shrink-0"></icon>
  </button>
  <div v-if="abierto" class="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-xl ring-1 ring-slate-900/10 overflow-hidden">
    <div class="p-2 border-b border-slate-100">
      <input v-model="q" type="text" class="input-texto py-1.5 text-sm" placeholder="Escriba para filtrar..." autofocus @click.stop>
    </div>
    <div class="max-h-60 overflow-y-auto nexo-scroll">
      <button type="button" v-for="o in filtradas" :key="o.id" class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 transition-colors" @click="$emit('update:modelValue', o.id); abierto = false; q = ''">
        <span class="truncate">{{ o.sku ? o.sku + ' — ' : '' }}{{ o[texto] }}</span>
        <badge v-if="o.estado && o.estado !== 'ACTIVO'" :tipo="o.estado"></badge>
      </button>
      <p v-if="!filtradas.length" class="px-3 py-4 text-center text-sm text-slate-400">Sin resultados</p>
    </div>
  </div>
</div>`
  };

  /* ============ Adenda: Boleta de Venta imprimible ============ */
  var BoletaVenta = {
    props: { venta: { type: Object, required: true }, detalle: { type: Array, default: function () { return []; } }, empresa: { type: Object, required: true } },
    computed: {
      logoSrc: function () { return this.empresa.logoBase64 || this.empresa.logoUrl || ''; },
      moneda: function () { return this.empresa.moneda || 'S/'; },
      lineas: function () {
        var m = this.moneda;
        var self = this;
        return this.detalle.map(function (d) {
          var esRegalo = String(d.esRegalo || 'No').toUpperCase() === 'SÍ' || String(d.esRegalo || 'No').toUpperCase() === 'SI';
          var editado = !esRegalo && Number(d.precioOriginal) > 0 && Number(d.precioUnit) < Number(d.precioOriginal);
          return {
            cantidad: d.cantidad, descripcion: d.descripcion, sku: d.sku,
            esRegalo: esRegalo,
            precio: m + ' ' + Number(d.precioUnit).toFixed(2),
            precioOriginal: editado ? (m + ' ' + Number(d.precioOriginal).toFixed(2)) : '',
            importe: m + ' ' + Number(d.subtotal).toFixed(2)
          };
        });
      },
      conDescuentos: function () { return Number(this.venta.descuentoTotal) > 0; },
      autorizadoPor: function () { return String(this.venta.autorizadoPor || ''); },
      igvEtiqueta: function () { return 'IGV ' + (this.empresa.igvTasa || 18) + '%'; }
    },
    template: `
<div class="boleta-print">
  <div style="text-align:center">
    <img v-if="logoSrc" :src="logoSrc" alt="Logo" style="max-height:56px;max-width:150px;object-fit:contain;margin:0 auto 4px;display:block">
    <div style="font-weight:700;font-size:13px;text-transform:uppercase">{{ empresa.razonSocial }}</div>
    <div style="font-size:11px">RUC: {{ empresa.ruc }}</div>
    <div style="border-top:1px dashed #000;margin:6px 0"></div>
    <div style="font-size:12px;font-weight:700">BOLETA DE VENTA</div>
    <div style="font-size:12px;font-weight:700">{{ venta.boleta }}</div>
  </div>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <div style="font-size:11px;line-height:1.5">
    <div>Fecha&nbsp;&nbsp;: {{ venta.fecha }}</div>
    <div>Vendedor: {{ venta.usuario }}</div>
    <div>Cliente&nbsp;: {{ venta.clienteNombre }}</div>
    <div>Doc.&nbsp;&nbsp;&nbsp;&nbsp;: {{ venta.clienteDocTipo }} {{ venta.clienteDocNumero }}</div>
    <div>Tienda&nbsp;&nbsp;: {{ venta.almacenNombre || venta.almacenId }}</div>
    <div v-if="autorizadoPor" style="color:#333">Autorizó: {{ autorizadoPor }}</div>
  </div>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <table style="width:100%;font-size:10.5px;border-collapse:collapse">
    <thead>
      <tr style="text-align:left">
        <th style="padding:2px 0">CANT</th><th>DESCRIPCIÓN</th>
        <th style="text-align:right">P.UNT</th><th style="text-align:right">IMPORTE</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(l, i) in lineas" :key="i" style="vertical-align:top">
        <td style="padding:2px 0;white-space:nowrap">{{ l.cantidad }}</td>
        <td>{{ l.descripcion }}<span v-if="l.esRegalo" style="font-weight:700"> — REGALO</span><br><span style="font-size:9px;color:#444">{{ l.sku }}</span></td>
        <td style="text-align:right;white-space:nowrap"><span v-if="l.precioOriginal" style="text-decoration:line-through;font-size:9px;color:#666">{{ l.precioOriginal }}</span> {{ l.precio }}</td>
        <td style="text-align:right;white-space:nowrap">{{ l.importe }}</td>
      </tr>
    </tbody>
  </table>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <table style="width:100%;font-size:11.5px;border-collapse:collapse">
    <tr v-if="conDescuentos"><td>DESCUENTOS</td><td style="text-align:right">-{{ moneda }} {{ Number(venta.descuentoTotal).toFixed(2) }}</td></tr>
    <tr><td>OP. GRAVADAS</td><td style="text-align:right">{{ moneda }} {{ Number(venta.subtotal).toFixed(2) }}</td></tr>
    <tr><td>{{ igvEtiqueta }}</td><td style="text-align:right">{{ moneda }} {{ Number(venta.igv).toFixed(2) }}</td></tr>
    <tr style="font-weight:700;font-size:13.5px"><td style="padding-top:3px">TOTAL</td><td style="text-align:right;padding-top:3px">{{ moneda }} {{ Number(venta.total).toFixed(2) }}</td></tr>
  </table>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <div style="font-size:11px;line-height:1.6">
    <div>Forma de pago: <b>{{ venta.metodoPago }}</b></div>
    <div v-if="venta.metodoPago === 'Efectivo' && Number(venta.montoRecibido) > 0">
      Recibido: {{ moneda }} {{ Number(venta.montoRecibido).toFixed(2) }} &nbsp;·&nbsp; Vuelto: <b>{{ moneda }} {{ Number(venta.vuelto).toFixed(2) }}</b>
    </div>
  </div>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <div style="text-align:center;font-size:10.5px;line-height:1.5">
    <div>{{ empresa.mensajeBoleta }}</div>
    <div style="margin-top:4px;font-size:9px;color:#333">Representación impresa de la BOLETA DE VENTA {{ venta.boleta }}</div>
    <div v-if="venta.estado === 'ANULADA'" style="margin-top:3px;font-weight:700;font-size:12px">*** VENTA ANULADA ***</div>
  </div>
</div>`
  };

  /* ============ Registro global ============ */
  window.NEXO_UI = {
    Icon: Icon, Badge: Badge, Modal: Modal, DataTable: DataTable,
    KpiCard: KpiCard, PageHeader: PageHeader, ConfirmDialog: ConfirmDialog,
    ToastZone: ToastZone, SearchSelect: SearchSelect, BoletaVenta: BoletaVenta
  };
})();
