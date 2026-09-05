# NexoERP — Sistema ERP/WMS Integrado (v1.6.1)

> 📘 **Documentación Técnica Completa:** Para consultar la arquitectura detallada, el modelo de 33 tablas en Google Sheets, el diccionario de las 113 rutas de API y el manual operativo completo, consulte [DOCUMENTACION.md](DOCUMENTACION.md).

[![Planificación & Producción - Z.ai GLM 5.3 Flash](https://img.shields.io/badge/Planificaci%C3%B3n%20y%20Producci%C3%B3n-Z.ai%20GLM%205.3%20Flash-blue?style=flat-square&logo=openai)](https://chat.z.ai/)
[![Auditoría & Corrección - Google Antigravity (Gemini 3.8 Flash)](https://img.shields.io/badge/Auditor%C3%ADa%20y%20Correcci%C3%B3n-Google%20Antigravity%20%7C%20Gemini%203.8%20Flash-4285F4?style=flat-square&logo=google)](https://deepmind.google/)

**Arquitectura de costo cero:** Vercel (frontend SPA) + Google Apps Script (backend/API) + Google Sheets (base de datos).

Sistema de gestión de almacenes y recursos empresariales con: inventario multi-almacén, kardex físico y valorizado (promedio ponderado), lotes/números de serie con vencimientos y política FEFO, movimientos (entradas, salidas, transferencias, devoluciones, ajustes), centro de alertas, reportes exportables, usuarios con roles, auditoría y tokens de sesión. Incluye POS de mostrador con boletas, cuadre de caja, fiados, cotizaciones, rentabilidad real, panel de control interno y dashboard comparativo.

**ADENDA 1.6 — Multi-país, SUNAT, finanzas MYPE, compras, RRHH, PWA offline y catálogo público:**

- **País e impuestos configurables (Perú por defecto):** en *Ajustes → País e impuestos* se elige el país de una lista de 8 (🇵🇪 Perú · 🇧🇴 Bolivia · 🇪🇨 Ecuador · 🇨🇴 Colombia · 🇨🇱 Chile · 🇦🇷 Argentina · 🇵🇾 Paraguay · 🇺🇾 Uruguay). Al aplicar se autocompleta moneda, símbolo, nombre del impuesto (IGV/IVA), tasa e inclusión en precios y el prefijo de WhatsApp; **todo queda editable** después. Perú activa el módulo SUNAT; el resto de países usa comprobantes internos con serie/correlativo y libro de ventas genérico listo para su contador.
- **Facturación electrónica SUNAT (Perú) en 3 modos** (nueva vista *Ventas → Comprobantes SUNAT*):
  - **Desactivado:** boleta interna BV- (como siempre).
  - **Manual (costo 0):** el sistema lleva las **series oficiales** (B001 boletas, F001 facturas, FC01/ND notas — configurables), decide Factura cuando el cliente tiene RUC (con `COMPROBANTE_AUTO = Sí`), genera el **JSON exacto** que consume el API de facturación (compatible con `github.com/yorchavez9/Api-de-facturacion-electronica-sunat-Peru`, Laravel 12 + Greenter 5.1) y usted lo envía (Postman/curl) y carga el CDR con un clic.
  - **API automática:** el backend GAS envía solo — login (Sanctum), creación del documento (`POST /api/v1/boletas` o `/invoices` con `mto_valor_unitario` sin IGV), envío a SUNAT (`send-sunat`) y captura del CDR (ACEPTADO/RECHAZADO con código y descripción). **Para desplegar el API gratuito:** clone el repositorio en un hosting con PHP 8.2+ (compartido, Render con Docker o Railway), ejecute `composer install` + `php artisan migrate --seed`, cargue su certificado digital `.pfx` en `storage/certificates/` y pegue la URL en *Ajustes → Facturación SUNAT → URL del API* junto con el usuario/contraseña del API y los IDs de company/branch.
  - **Notas de crédito y débito (07/08)** sobre cualquier venta: la NC puede **devolver el stock** (movimiento DEVOLUCIÓN con kardex) y **descontar el saldo del fiado**, y opcionalmente anular la venta. Incluye **resumen diario de boletas** (RDD vía API), **guía de remisión** por venta y **Libro de Ventas** exportable en **PLE 8.1 (TXT SUNAT)** y CSV.
- **Tipo de cambio USD automático:** consulta diaria la referencia SUNAT (apis.net.pe, servicio público) y la cachea en Config; también se puede consultar a mano desde Ajustes. Ventas en USD usan la tasa registrada.
- **Gastos y flujo de caja real** (vista *Finanzas → Gastos y Flujo de Caja*): egresos por categoría (11 semillas: luz, alquiler, planilla, fletes...) y medio de pago, **ingresos vs. egresos del mes**, series por día, **presupuesto mensual vs. real con desvíos** y **punto de equilibrio** (gastos fijos ÷ margen bruto %). El cuadre de caja ahora descuenta los egresos en efectivo y suma las cobranzas de cuotas.
- **Órdenes de compra** (vista *Operaciones → Órdenes de Compra*): OC con correlativo, estados BORRADOR→ENVIADA→PARCIAL→RECIBIDA→CERRADA, **comparador de cotizaciones de proveedores** (agregue 2-3 ofertas, elija la mejor y ajuste costos con un clic), **recepción parcial** con ingreso real al kardex (con lote/vencimiento si el producto lo exige) y **Cuentas por Pagar** con pago total/parcial que genera el egreso de caja automáticamente. *Centro de Alertas* sugiere la **OC de reabastecimiento** con las cantidades y costos precargados.
- **Ventas a crédito con plan de cuotas** (método “Credito” en POS) y nueva vista *Ventas → Cobranzas y CxC*: genera N cuotas con vencimientos, registra cobros totales/parciales (Efectivo/Yape/Plin/Tarjeta — los efectivos entran al cuadre del día), y muestra la **antigüedad de saldos (aging)** combinando cuotas y fiados: por vencer, 1-30, 31-60, 61-90 y +90 días, con top de deudores.
- **Fidelización de clientes:** puntos configurables (1 punto por cada X de consumo, valor del punto y mínimo de canje). El POS **acumula al vender** y permite **canjear puntos como descuento**; historial completo por cliente y ajustes manuales desde Clientes.
- **RRHH básico** (vista *Sistema → RRHH y Comisiones*): marcación de **entrada/salida** con minutos trabajados, y **comisiones por vendedor** — asigne un % a cada usuario y el POS permite atribuir la venta a un vendedor; el reporte del mes calcula la comisión de cada uno.
- **Notificaciones flotantes y campana:** toasts flotantes para cada evento (venta emitida, CDR aceptado/rechazado, stock crítico tras vender, conexión perdida/restablecida) más un **centro de notificaciones** en la campana de la barra superior: tareas programadas gratuitas en Apps Script revisan cada madrugada fiados antiguos, cuotas por vencer/vencidas, stock crítico y comprobantes con problema, y opcionalmente envían un **correo al dueño** (MailApp). Botón “Probar avisos ahora” en Ajustes.
- **Respaldo automático:** copia diaria de la hoja de cálculo a una carpeta de Drive (`NexoERP Backups`) con retención configurable; “Respaldar ahora” para un respaldo manual.
- **PWA instalable y modo offline:** manifest + service worker con caché del app shell. Instale NexoERP en el celular como app. **Sin internet el POS sigue funcionando**: las ventas quedan en una cola local cifrada por el navegador y **se sincronizan solas** al reconectar (indicador “Offline” y contador de pendientes en la barra superior).
- **Catálogo público con pedidos por WhatsApp** (`catalogo.html`): active el catálogo en Ajustes, copie el enlace con token (regenerable) y compártalo en estados de WhatsApp o redes; sus clientes ven los productos con disponibilidad y arman su pedido con un **mensaje de WhatsApp listo** con los productos y el total aproximado. Incluye modo demo para probarlo sin backend.
- **Escáner de códigos con la cámara** del celular (ZXing) en el POS: escanee el código de barras del producto y entra al carrito; los productos admiten **código de barras** registrado.
- **Impresión térmica 80mm:** botón “Térmica” al emitir/reimprimir boletas: ticket formato ticketera con QR de pago Yape/Plin cuando corresponde.
- **POS mejorado:** **precios por escala mayorista** (precio 2/3 con cantidad mínima — se aplican solos al alcanzar la cantidad), **fraccionamiento** (stock en unidad menor; el POS alterna entre Unidad y Caja×N con el precio y consumo calculados), vendedor por venta, canje de puntos y panel de crédito con plan de cuotas visible antes de cobrar.
- **Nuevas pestañas de Google Sheets:** `Comprobantes`, `Cuotas`, `Gastos`, `GastosCategorias`, `OrdenesCompra`, `OcItems`, `OcOfertas`, `CuentasPagar`, `Notificaciones`, `Asistencia`, `Vendedores`, `FidHistorial`, `Presupuesto`. Ejecute **`migrarAdendaV16()`** (o re-ejecute `setupSystem`/`setupDesdeCero`) una vez desde el editor para crearlas — es idempotente y no toca sus datos.

**ADENDA 1.5 — Asistente de inicio "desde cero" para empresas nuevas:**
- **Dos modos de instalación en el backend:** `setupSystem` (estructura + dataset demo, para evaluar) y el nuevo **`setupDesdeCero`** (solo estructura + usuario `admin` + numeración en cero: para operar una empresa real desde el primer día). Nuevo también **`borrarDatosDemo`**: limpia los datos de demostración de una instalación existente conservando usuarios y configuración, para pasar de "estoy probando" a "estoy vendiendo" sin recrear nada.
- **Asistente de inicio (7 pasos):** cuando el sistema detecta una instalación vacía (`sistema_estado.necesitaAsistente`), el administrador es llevado automáticamente a un asistente que carga: ① datos de la empresa (razón social, RUC, dirección, teléfono, logo, moneda, IGV, horario — queda todo en la identidad fiscal de boletas y proformas), ② nombre y **contraseña definitiva del admin**, ③ almacén principal (queda como almacén de despacho del POS), ④ categorías propias (chips + sugerencias), ⑤ productos **con stock inicial** en tabla manual o **pegando desde Excel/Google Sheets** (cada fila crea el producto y su ENTRADA de inventario: kardex valorizado desde el día uno), ⑥ clientes (con teléfono de WhatsApp y límite de fiado), ⑦ **fondo de caja inicial** + resumen. Cada paso usa los mismos endpoints del sistema (`config_save`, `usuarios_save`, `almacenes_save`, `categorias_save`, `productos_save`, `movimientos_registrar`, `clientes_save`, `caja_abrir`), así que el resultado es idéntico a cargarlo a mano y queda auditado.
- **Siempre disponible:** menú *Sistema → Asistente de Inicio* (solo admin) y botón **“Ejecutar asistente de inicio”** en *Configuración* para re-ejecutarlo cuando se necesite. Puede omitirse con un clic (“Omitir asistente”) sin bloquear el sistema.
- **Nuevas claves de configuración:** `DIRECCION_EMPRESA` y `TELEFONO_EMPRESA` (ahora se imprimen en la cabecera del PDF de proforma) y `ASISTENTE_COMPLETADO` (Sí/No). Nueva ruta API: `sistema_estado`. **No requiere migración** para instalaciones v1.4: el asistente solo aparece si el sistema no tiene productos y la marca está en No; si ya opera con datos, nunca se activa solo.

**ADENDA 1.4 — Categorías propias, documentos para WhatsApp y limpieza:**
- **Categorías administradas por usted:** nueva vista **Inventario → Categorías** con CRUD completo (crear, renombrar, desactivar). En un **despliegue real** las categorías se guardan en la pestaña `Categorias` de su Google Sheet (vía `categorias_list/save/delete`, validadas en servidor con el permiso `catalogos:write`); en modo demo se guardan en su navegador. El formulario de producto incluye un botón **“Nueva”** para crear una categoría sin salir del formulario, y el menú del POS muestra chips por categoría automáticamente. Solo admin/gerente editan; los demás roles consultan.
- **Boleta como IMAGEN PNG:** al emitir o reimprimir una boleta, el botón **“Enviar por WhatsApp”** genera la boleta como **imagen PNG estilo ticket** (canvas 2x, nítida en el celular) y la envía: en móviles se comparte directo con la Web Share API (elige WhatsApp en la hoja de compartir); en computadora se descarga `Boleta_BV-1106.png` y se abre `wa.me` con el mensaje redactado para adjuntarla en un toque. También hay botón **“Imagen PNG”** para descargarla sin enviar.
- **Proforma como PDF A4:** la cotización/proforma ahora viaja en **formato carta grande A4** (jsPDF), totalmente distinto al ticket de la boleta: banda azul con logo/RUC/dirección, caja de cliente, tabla de ítems con SKUs y filas zebra, caja de totales con descuentos/IGV, condiciones de validez y pie con paginación. Botones **“PDF A4”** (descarga) y **“WhatsApp”** (envía el PDF real adjunto, con el mismo mecanismo móvil/escritorio).
- **Sin sección Roadmap:** la vista “Módulos Planificados” fue **eliminada por completo** del menú y del código (no era un modo demo: era una página de planificación que ya no aplica).
- Archivos nuevos/modificados: `assets/js/receipts.js` (motor de documentos), `assets/vendor/jspdf.umd.min.js`, `views/view-categorias.js`, `api.js` (+`eliminarCategoria`), POS/Ventas/Cotizaciones/Productos/app.js/index.html actualizados. **No requiere migración de datos** (usa pestañas existentes).

**ADENDA 1.3 — Fiados, cotizaciones, rentabilidad real, WhatsApp, panel de control y dashboard comparativo:**
- **Fiados (venta a crédito):** método de pago “Fiado” en el POS. Exige cliente registrado y respeta su **límite de crédito** (`Clientes.limiteFiado`): el panel del POS muestra saldo, disponible y el saldo resultante en vivo; si la venta excede el límite y `FIADO_PERMITIR_EXCEDER = No`, el backend la bloquea. La vista **Fiados**: cartera por cliente con antigüedad, **abonos parciales** (Efectivo/Yape/Plin/Tarjeta) que integran el arqueo de caja, historial, recordatorio por WhatsApp y auto-marcado PAGADO al saldar. Anular una venta fiada revierte el saldo.
- **Cotizaciones / proformas convertibles:** constructor con precios congelados, validez y correlativo `COT-`. Con **un clic en “Convertir en venta”** pasa por el mismo motor del POS (valida stock, política de precios y autorizaciones, emite boleta correlativa y descarga kardex). Estados: VIGENTE / VENCIDA / CONVERTIDA (boleta enlazada) / ANULADA.
- **Rentabilidad real por producto:** `VentaDetalle.costoUnit` guarda el **costo real del kardex** al momento de la salida; el reporte calcula margen bruto por producto (regalos descontados como costo puro), S/ y %, con CSV.
- **Dashboard comparativo:** selector de período (Hoy · Ayer · Últimos 7 días · Este mes · Mes pasado · personalizado) con comparación automática contra el período anterior: donut por **método de pago**, **horas pico** (en rojo), **ventas por día de la semana** (día débil en ámbar), tendencia diaria, insights, top productos con margen y fiado por cobrar.
- **Panel de control interno (admin/gerente):** KPIs del día/mes, fiado vencido, descuentos, anulaciones, ventas fuera de horario, diferencias de caja, stock crítico y alertas priorizadas + auditoría en vivo.

**ADENDA 1.2 — POS Pro:** precio editable con **precio mínimo** por producto, descuento por línea con política (`DESCUENTO_MAX_PCT`), **producto REGALO** (precio 0, descuenta stock, marcado en boleta y reportes), **autorización de supervisor admin/gerente validada en servidor** (queda impresa en la boleta y en auditoría), ventas en espera (apartados), atajos F2/F4/F8, escáner de códigos y botones de billetes.

**ADENDA 1.1 — POS + boletas + caja:** POS de mostrador, boleta correlativa con logo/RUC/IGV, identidad fiscal configurable (RUC, logo por URL o Base64), cuadre de caja con arqueo por método de pago y anulación con reversión de stock.

---

## Estructura del proyecto

```
erp-wms/
├── frontend/                  ← Desplegar en VERCEL (sitio estático, sin build)
│   ├── index.html
│   ├── vercel.json
│   └── assets/
│       ├── css/custom.css
│       ├── vendor/            ← Vue 3, Chart.js, Tailwind, jsPDF (autocontenido)
│       └── js/
│           ├── config.js      ← ⚠️ AQUÍ se pega la URL del Web App de GAS
│           ├── api.js         ← Transporte fetch → Apps Script (CORS-safe)
│           ├── receipts.js    ← v1.4: boleta PNG (canvas) + proforma PDF A4 (jsPDF)
│           ├── store.js       ← Sesión, token, router
│           ├── demo-data.js   ← Dataset demo
│           ├── demo-store.js  ← Backend de demo en localStorage (espejo exacto del GAS)
│           ├── components.js  ← Biblioteca UI + Boleta de Venta imprimible
│           ├── app.js         ← Layout, sidebar, arranque
│           └── views/         ← 23 vistas (dashboard, POS, categorías, fiados,
│                               cotizaciones, rentabilidad, panel, caja,
│                               asistente de inicio, ...)
│
└── backend/                   ← Pegar en GOOGLE APPS SCRIPT (un archivo por cada .gs)
    ├── 00_Config.gs           ← Constantes, roles, permisos, claves de config
    ├── 01_WebApp.gs           ← doGet/doPost + router de acciones
    ├── 02_Auth.gs             ← Login SHA-256+salt, tokens de sesión
    ├── 03_Db.gs               ← Capa de acceso a Google Sheets
    ├── 04_Catalogos.gs        ← Productos, categorías, almacenes, socios
    ├── 05_Movimientos.gs      ← Motor de stock/lotes/kardex + anulación
    ├── 06_Kardex.gs           ← Kardex, lotes, reportes
    ├── 07_Dashboard.gs        ← KPIs y series del dashboard
    ├── 08_Reportes.gs         ← Config y auditoría
    ├── 09_Setup.gs            ← setupSystem (demo) · setupDesdeCero (empresa nueva)
    │                             · borrarDatosDemo · sistema_estado · migraciones
    ├── 10_Ventas.gs           ← POS, boleta correlativa, FIADO, costo real, WhatsApp
    ├── 11_Caja.gs             ← Cuadre de caja por método de pago
    ├── 12_Fiados.gs           ← Cartera de fiados, abonos e historial
    ├── 13_Cotizaciones.gs     ← Proformas y conversión a venta
    └── 14_Analitica.gs        ← Dashboard comparativo, rentabilidad, panel
```

---

# GUÍA DE INSTALACIÓN PASO A PASO

> Tiempo total estimado: **20–30 minutos**. No se necesita instalar nada en su computadora ni conocimientos de programación: solo copiar y pegar. Necesita una **cuenta de Google** (para Sheets y Apps Script) y una **cuenta gratuita en Vercel** (puede crearla con su Google en 1 clic).

## PARTE 1 — Crear la base de datos (Google Sheets)

1. Entre a <https://sheets.new> con su cuenta de Google. Se abre una hoja de cálculo nueva.
2. Póngale nombre, por ejemplo **`NexoERP-DB`** (Archivo → Renombrar).
3. **No cree pestañas manualmente**: en el PARTE 2 la función elegida (`setupSystem` para demo o `setupDesdeCero` para empresa nueva) crea las ~20 pestañas (`Config`, `Usuarios`, `Sesiones`, `Categorias`, `Almacenes`, `Productos`, `Stock`, `Lotes`, `Proveedores`, `Clientes`, `Movimientos`, `Kardex`, `Auditoria`, `Ventas`, `VentaDetalle`, `Numeracion`, `Caja`, `PagosFiado`, `Cotizaciones`, `CotizacionDetalle`) con sus cabeceras exactas; la demo además carga datos de ejemplo.
4. ⚠️ Importante (Perú): en **Archivo → Configuración**, fije la **zona horaria** en `(GMT-05:00) Lima` y el idioma si lo desea. Así las fechas de boletas, caja y reportes coinciden con su hora local.

## PARTE 2 — Instalar el backend (Google Apps Script)

1. En su hoja `NexoERP-DB`: menú **Extensiones → Apps Script**. Se abre el editor en una pestaña nueva.
2. Arriba a la izquierda, haga clic en el nombre del proyecto (“Proyecto sin título”) y renómbrelo a **`NexoERP-Backend`**.
3. Verá un archivo llamado `Código.gs`. Haga clic en él y renómbrelo (clic derecho → Renombrar) a **`00_Config`** y pegue el contenido completo de `backend/00_Config.gs`.
4. Por **cada archivo** de la carpeta `backend/` (del `00_Config.gs` al `14_Analitica.gs`, son 15 en total): pulse **Archivo → Nuevo → Secuencia de comandos**, póngale EXACTAMENTE el mismo nombre sin la extensión (`01_WebApp`, `02_Auth`, … `14_Analitica`) y pegue el contenido completo del archivo correspondiente.
   - 💡 El nombre del archivo dentro de Apps Script debe coincidir (sin `.gs`); el prefijo numérico solo ayuda a mantener el orden.
   - ⚠️ No deje ningún archivo sin guardar: si hay cambios pendientes, el nombre del archivo aparece en *cursiva*. Guarde todo con **Ctrl+S** (Cmd+S en Mac).
5. En la barra de herramientas superior, seleccione la función en el desplegable y pulse **Ejecutar**. **Elija según su caso:**
   - **`setupSystem`** → instala estructura + **datos de demostración** (usuarios demo, 18 productos, movimientos de 30 días, boletas históricas). Ideal para evaluar el sistema o capacitar al personal.
   - **`setupDesdeCero`** → instala SOLO la estructura para una **empresa nueva**: pestañas, configuración por defecto, numeración en cero y el usuario `admin`. Sin productos ni datos falsos. Al iniciar sesión, el **Asistente de inicio** le guiará para cargar su empresa, almacén, categorías, productos (con stock inicial, pegando desde Excel si quiere), clientes y fondo de caja.
6. La primera vez Google pedirá **autorización**: pulse *Revisar permisos* → elija su cuenta → si aparece “Google no ha verificado esta app”, pulse *Configuración avanzada → Ir a NexoERP-Backend (no seguro)* → *Permitir*. (Es SU propio código actuando sobre SU propia hoja; es normal en scripts personales.)
7. Espere **1–3 minutos**. Verifique en el *Registro de ejecución*: debe decir `setupSystem OK: {...}` (modo demo) o `setupDesdeCero OK: {...}` (empresa nueva).
8. (Opcional) Compruebe en la hoja: aparecerán las pestañas nuevas. En modo demo verá datos de ejemplo; en modo desde cero, solo cabeceras.

> **¿Ya tenía una versión anterior (v1.0 a v1.3) con datos reales?** NO ejecute `setupSystem` (rehace la demo). Solo reemplace los 15 archivos .gs con esta versión y ejecute una vez las migraciones que falten: `migrarAdendaV12`, `migrarAdendaV13` (no destructivas; la **v1.4 y la v1.5 no requieren migración** — la v1.5 solo añade la ruta `sistema_estado` y 3 claves de config que se crean solas).
>
> **¿Instaló la demo y ahora quiere datos reales?** Ejecute **`borrarDatosDemo`** en el editor: vacía productos, movimientos, kardex, ventas, clientes, etc., conserva usuarios y configuración, reinicia la numeración y deja activo el asistente de inicio para cargar su operación real.

## PARTE 3 — Desplegar la API (Web App)

1. En el editor de Apps Script, botón azul **Implementar → Nueva implementación**.
2. Clique el engranaje ⚙️ junto a “Selecciona el tipo” y elija **Aplicación web**.
3. Configure EXACTAMENTE así:
   - *Descripción:* `NexoERP API v1.4`
   - *Ejecutar como:* **Yo (su correo)** ← imprescindible: la API escribirá en su hoja con su identidad
   - *Quién tiene acceso:* **Cualquier usuario** ← no se preocupe: el sistema valida token + roles por código en cada acción; “anónimo” aquí solo significa “sin pedir login de Google al navegador”
4. Pulse **Implementar** y copie la **URL de la app web** que termina en **`/exec`** (ejemplo: `https://script.google.com/macros/s/AKfycb.../exec`). Guárdela: es la que conectará el frontend.
5. Pruebe rápido: abra esa URL en el navegador (petición GET). Debe responder algo como `{"ok":true,"data":{...},"error":null}` (health-check). Si ve JSON, su API está viva. ✅

> ⚠️ **Regla de oro:** cada vez que edite el código de Apps Script, la URL `/exec` sigue sirviendo la versión ANTERIOR hasta que haga **Implementar → Gestionar implementaciones → ✏️ Editar → Versión: “Nueva versión” → Implementar**. Es la causa #1 de “cambié el código y no pasa nada”.

## PARTE 4 — Conectar el frontend con su hoja

1. Abra `frontend/assets/js/config.js` en su computadora.
2. Pegue su URL `/exec` en `API_URL` (entre comillas simples):
   ```js
   var CONFIG_APP = {
     API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',   // ← SU URL AQUÍ
     NOMBRE_APP: 'NexoERP',
     VERSION: '1.4.0',
     ...
   };
   ```
3. Guarde el archivo. Con esto, el login autentica contra `Usuarios` (hash SHA-256) y TODA la información vive en SU hoja de cálculo.
4. 💡 Si `API_URL` se deja vacío (`''`), el sistema arranca en **modo demostración** (datos ficticios en el navegador, sin tocar su hoja). Úselo para capacitar al personal sin riesgo.

## PARTE 5 — Desplegar en Vercel (frontend)

Elija UNA de las 3 opciones (A es la recomendada para actualizaciones fáciles):

### Opción A — Con GitHub (recomendada)
1. Cree un repositorio en <https://github.com/new> (nombre `nexoerp`, puede ser privado).
2. Suba el contenido de la carpeta `frontend/` (Arrastre los archivos a “uploading an existing file”, o con Git: `git init && git add . && git commit -m "NexoERP" && git push`).
3. Entre a <https://vercel.com> → **Add New… → Project** → importe su repositorio.
4. En “Configure Project”: **Framework Preset: Other** (es un sitio estático). NO configure build command ni variables de entorno. Pulse **Deploy**.
5. En ~30 segundos tendrá su URL pública tipo `https://nexoerp-tuusuario.vercel.app` con HTTPS. ✅

### Opción B — Con Vercel CLI (sin GitHub)
1. Instale Node.js (<https://nodejs.org>) y en una terminal: `npm i -g vercel`
2. Dentro de la carpeta `frontend/`: `vercel login` (con su cuenta) y luego `vercel --prod`.

### Opción C — Arrastrar y soltar (la más rápida)
1. Entre a <https://vercel.com/new> mientras tiene abierta su carpeta `frontend/`.
2. Arrastre la CARPETA `frontend` completa al área de carga. Vercel publica el sitio al instante.
   - Nota: esta opción no permite actualizar con “git push”; para actualizar repita el arrastre (Vercel crea un despliegue nuevo cada vez).

> 🔁 **Para actualizar el frontend más tarde:** edite `config.js` o cualquier archivo → suba el cambio a GitHub → Vercel redespliega solo. No hace falta tocar Apps Script si solo cambia el frontend.

## PARTE 6 — Primer arranque en producción

### Camino recomendado (v1.5): el Asistente de inicio

Si instaló con **`setupDesdeCero`**, al entrar con `admin / admin123` el sistema detecta que está vacío y abre solo el **Asistente de inicio**:

1. **Datos de su empresa** — razón social, RUC, dirección, teléfono, logo, moneda, IGV y horario (exactamente lo que imprimirán sus boletas y proformas).
2. **Su contraseña definitiva** — reemplaza `admin123` (queda como hash SHA-256; su sesión no se cierra).
3. **Almacén principal** — se convierte en el almacén de despacho del POS.
4. **Categorías** — escríbalas y presione Enter (o use las sugerencias).
5. **Productos** — en tabla manual o **pegando desde Excel/Sheets** (columnas: `sku ; nombre ; categoría ; unidad ; costo ; precio ; stock inicial ; stock mín`). El stock inicial se registra como ENTRADA con su costo → kardex valorizado desde el día uno.
6. **Clientes** — opcional; con teléfono de WhatsApp y límite de fiado.
7. **Fondo de caja** + resumen → **“Finalizar y empezar a vender”**.

Puede **omitir** cualquier paso (y el asistente completo con “Omitir asistente”); volver a ejecutarlo cuando quiera desde *Sistema → Asistente de Inicio* o desde el botón de *Configuración*.

### Camino manual (equivalente, paso a paso)

1. Abra su URL de Vercel. Verá el login **sin el aviso “Modo demostración”** (señal de que está conectado a su hoja).
2. Ingrese con **`admin` / `admin123`** (instalación demo) o el que definió en el asistente.
3. **Cambie la contraseña YA**: menú *Usuarios y Roles* → edite `admin` → nueva contraseña. (Los usuarios demo `mgerente`, `joperador`, `consulta` con `demo123` se crean para pruebas: cámbieles la contraseña o desactívelos.)
4. **Configuración → Identidad fiscal**: RUC (11 dígitos), razón social, logo (URL pública o suba el archivo — se guarda optimizado en Base64), IGV (activado = precios con IGV incluido, tasa 18), horario de atención, método de pago por defecto, mensaje de la boleta, prefijo WhatsApp (51).
5. **Inventario → Almacenes**: cree sus tiendas/depósitos reales. Luego edite la clave `ALMACEN_VENTA` en *Configuración* con el ID del almacén que despacha el POS.
6. **Inventario → Categorías**: cree sus propias categorías (p. ej. “Bebidas”, “Ferretería”). Desde el formulario de Productos también puede crearlas al vuelo con el botón **“Nueva”**.
7. **Inventario → Productos**: cargue su catálogo (SKU, costo estándar, precio de venta, precio mínimo, stock mínimo, y marque “Exige lote” si llevará vencimientos).
8. **Carga de stock inicial**: *Movimientos* → registrar ENTRADA por cada producto/almacén (con lote y vencimiento si aplica). Esto inicializa el kardex con su costo real.
9. **Clientes**: registre sus clientes con DNI/RUC, teléfono de WhatsApp y límite de fiado si le venderá al crédito.
10. Pruebe el circuito completo: **POS** → venda → boleta emitida → **Imagen PNG** o **WhatsApp** → *Ventas y Boletas* → *Cuadre de Caja* al cierre del día.

## PARTE 7 — Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| “No se pudo conectar con el backend…” | URL mal copiada, despliegue no público o sin internet | Verifique que `API_URL` termine en `/exec` y que el acceso del Web App sea “Cualquier usuario” |
| “La respuesta del backend no es JSON válido” | Editó código pero no publicó nueva versión | Implementar → Gestionar implementaciones → ✏️ → *Nueva versión* |
| **“Credenciales inválidas” en el login** (v1.5.1) | ① Pestaña `Usuarios` vacía (el setup nunca se ejecutó **en ESA hoja**), ② olvidó la contraseña (p. ej. la cambió en el asistente), ③ la celda `salt`/`hash` quedó corrupta en la hoja, ④ espacios editados a mano en la pestaña | ① Ejecute `setupDesdeCero()` (empresa nueva) o `setupSystem()` (demo) en el editor de Apps Script vinculado a ESA hoja. ②③④ Ejecute `restablecerAdmin()` en el editor: restaura `admin / admin123` sin borrar datos y cierra sesiones abiertas. La propia pantalla de login muestra una caja de ayuda tras el error |
| “Demasiados intentos fallidos… espere 5 minutos” | Limitador de fuerza bruta (v1.5.1): 5 intentos erróneos bloquean al usuario 5 minutos | Espere 5 minutos o ejecute `restablecerAdmin()`; en modo demo basta recargar la página |
| “Este usuario está inactivo” | La columna `estado` no es `ACTIVO` para ese usuario | En la pestaña Usuarios (o desde *Usuarios y Roles* con otro admin) reactive la cuenta |
| El asistente de inicio no aparece con `setupDesdeCero` | Marca `ASISTENTE_COMPLETADO` ya está en Sí, o ya existen productos | Re-lance desde *Sistema → Asistente de Inicio* o el botón en *Configuración* |
| “Acción no reconocida: sistema_estado” | Backend v1.4 o anterior (sin la ruta nueva) | Pegue el `09_Setup.gs` y `01_WebApp.gs` v1.5 y publique Nueva versión |
| “Método no permitido: esta acción debe enviarse por POST” | Se llamó a la API por GET (v1.5.1: por GET solo `ping` y `apiInfo`) | Es el endurecimiento esperado; el frontend siempre usa POST |
| “Sesión expirada” frecuente | TTL de token de 8 h | Vuelva a iniciar sesión (comportamiento esperado) |
| La boleta no muestra el logo | URL del logo sin HTTPS o caída | Use una URL pública HTTPS estable, o suba el archivo desde Configuración (Base64) |
| WhatsApp no adjunta el archivo | En PC, WhatsApp Web exige adjuntar manualmente el archivo descargado | Descargue la imagen/PDF (queda en Descargas) y adjúntela en el chat que se abrió; en celulares se comparte directo |
| Fechas/horas desplazadas | Zona horaria de la hoja | Archivo → Configuración → Zona horaria: Lima (GMT-05:00) |
| Se agotan las cuotas | Volumen muy alto para cuenta gratuita | Apps Script gratis: ~20.000 lecturas/día y 90 min de ejecución; para PYME estándar sobra. Archive movimientos antiguos |

## PARTE 8 — Actualizaciones y respaldo

- **Respaldo**: *Archivo → Historial de versiones* en Google Sheets (histórico automático de Google), o duplique la hoja periódicamente (Archivo → Hacer una copia).
- **Reset completo** (borra TODO y recarga demo): ejecute `resetSystem` en el editor de Apps Script.
- **Pasar de demo a producción** (conserva usuarios y configuración): ejecute `borrarDatosDemo` y siga el Asistente de inicio.
- **Cambios de código backend**: pegue el .gs editado → *Implementar → Gestionar implementaciones → ✏️ → Nueva versión*. La URL `/exec` NO cambia.
- **Cambios de frontend**: edite y suba a GitHub (Vercel redespliega) o re-arrastre la carpeta en Vercel.

> **¿Olvidó la contraseña del admin?** No hace falta re-instalar (v1.5.1): ejecute `restablecerAdmin()` en el editor de Apps Script — restaura `admin / admin123` sin borrar datos del negocio. Con contraseña propia: `restablecerAdmin('MiNuevaClave1')`.

---

## Seguridad implementada

| Capa | Mecanismo |
|---|---|
| Contraseñas | Hash **SHA-256 + salt aleatorio por usuario** (nunca texto plano en Sheets). Desde v1.5.1 el hash se **estira iterando 50 veces** (formato `v2$…`, se actualiza solo al iniciar sesión) y `salt`/`hash` se escriben **siempre con formato texto** para que Sheets no los corrompa |
| Política de contraseñas (v1.5.1) | Mínimo 6 caracteres, máximo 64, distinta del nombre de usuario, rechazo de contraseñas triviales (`123456`, `password`, `admin123`, …) |
| Fuerza bruta (v1.5.1) | **Limitador de intentos**: 5 fallos en el login o en la autorización de supervisor del POS bloquean al usuario 5 minutos (`CacheService`) |
| Sesiones | Token UUID temporal (TTL 8 h) guardado en pestaña `Sesiones`; se purga en cada login, al cerrar sesión, al cambiar la contraseña y al desactivar un usuario |
| Autorización | **Validación por rol en el backend** en cada acción crítica (`movimientos:anular`, `usuarios:manage`, etc.). Ocultar botones en el frontend es solo cosmético. La **Rentabilidad Real** (costos y márgenes) exige rol admin/gerente también en el servidor |
| Guardia anti-bloqueo (v1.5.1) | El sistema impide desactivar o degradar al **último administrador activo** — nadie puede quedarse sin acceso |
| Transporte | HTTPS de extremo a extremo (Vercel + Google); el payload viaja por `POST` JSON. **Por GET solo pasan `ping` y `apiInfo`** (v1.5.1): tokens y contraseñas nunca viajan en la URL |
| Errores (v1.5.1) | Los errores internos devuelven un mensaje genérico al cliente; el detalle técnico solo queda en el registro de ejecución de Apps Script. `apiInfo` ya no expone el nombre de la hoja |
| Recuperación (v1.5.1) | `restablecerAdmin()` desde el editor restaura el acceso sin borrar datos; la pantalla de login muestra ayuda contextual según el modo (demo o real) |
| Concurrencia | `LockService` en registro/anulación de movimientos y emisión de boletas: evita carreras al descontar stock o duplicar correlativos |
| Auditoría | Cada login, movimiento, anulación y cambio de configuración se registra con usuario, rol y detalle |

Roles incluidos: **admin** (todo) · **gerente** (catálogos, movimientos, anulación, auditoría, ventas, autorizar descuentos/regalos, rentabilidad/panel) · **operador** (consultas, movimientos, POS, caja) · **consulta** (solo lectura).

> Recuerde además: mantenga la hoja de cálculo **privada** (compartida solo con quien corresponda). Quien abre la hoja ve el negocio completo; el acceso vía Web App es para el día a día.

## API — contrato de acciones

Todas las peticiones son `POST` JSON al Web App: `{ action, token, ...payload }` con `Content-Type: text/plain;charset=utf-8` (evita el preflight CORS que Apps Script no atiende). Respuesta: `{ ok, data, error, code }`.

- **Núcleo:** `login`, `logout`, `ping`, `dashboard`, `productos_list/save/delete`, `almacenes_list/save/delete`, **`categorias_list/save/delete`** (v1.4: categorías propias del usuario), `proveedores_*`, `clientes_*`, `stock_list`, `lotes_list`, `movimientos_list/registrar/anular`, `kardex`, `reporte_stock`, `reporte_movimientos`, `auditoria_list`, `config_get/save`, `usuarios_list/save/delete`.
- **POS/ventas/caja:** `ventas_registrar` (boleta correlativa + descarga stock + política de precios + autorización + fiado + costo real por línea), `ventas_autorizar`, `ventas_list/get/anular`, `ventas_resumen`, `caja_estado/abrir/cerrar/historial`.
- **v1.3:** `fiados_cartera`, `fiado_abono`, `fiado_pagos`, `cotizaciones_registrar/list/get/anular`, `cotizaciones_convertir`, `ventas_marcar_whatsapp`, `ventas_analitica` (dashboard comparativo), `rentabilidad_producto`, `panel_control`.
- **v1.5:** `sistema_estado` (conteos de catálogos + `necesitaAsistente`; alimenta el Asistente de inicio; tolerado en silencio por frontends antiguos).

> Los documentos compartibles (boleta PNG y proforma PDF A4) se generan **en el navegador** (canvas/jsPDF) con los mismos datos que devuelve el backend: cero costo de servidor y cero cuota de Apps Script extra.

### Claves de Config (pestaña `Config`, editable desde la app con rol admin)

`RAZON_SOCIAL`, `NOMBRE_EMPRESA`, `RUC`, `LOGO_URL`, `LOGO_BASE64`, `IGV_INCLUIDO`, `IGV_TASA`, `PREFIJO_BOLETA`, `MENSAJE_BOLETA`, `ALMACEN_VENTA`, `METODO_PAGO_DEFAULT`, `HORARIO_INICIO/FIN`, `DESCUENTO_MAX_PCT`, `DESCUENTO_REQUIERE_AUTORIZACION`, `REGALO_REQUIERE_AUTORIZACION`, `FIADO_PERMITIR_EXCEDER`, `FIADO_DIAS_ALERTA`, `WHATSAPP_PREFIJO`, `MONEDA_SIMBOLO`, `METODO_VALUACION`, `PERMITIR_STOCK_NEGATIVO`, `DIAS_ALERTA_VENCIMIENTO`, **`DIRECCION_EMPRESA`**, **`TELEFONO_EMPRESA`** (v1.5: cabecera del PDF de proforma), **`ASISTENTE_COMPLETADO`** (v1.5: control del asistente de inicio).

## Mantenimiento y operaciones

- **Cuotas de Apps Script (cuenta gratuita):** ~20.000 lecturas de celdas y ~90 min de ejecución al día; para el volumen típico de PYME (decenas de movimientos diarios) el margen es amplio.
- **Backup:** Versiones de Google Sheets (Archivo → Historial de versiones) o copia periódica con *Hacer una copia*.
- **Re-despliegue del backend:** tras editar código, use *Implementar → Gestionar implementaciones → Editar (✏️) → Versión: Nueva*; la URL `/exec` no cambia.

---

## 👥 Contribuidores y Desarrollo Asistido por IA (AI Contributors)

Este proyecto ha sido diseñado, producido y optimizado con la colaboración de modelos de inteligencia artificial de última generación:

| Contribuidor | Modelo / Motor | Especialidad / Rol en el Proyecto | Tipo de Aporte | Enlace Oficial |
|---|---|---|---|---|
| **Z.ai** | [GLM-5.3-Flash](https://chat.z.ai/) | **Planificación y Producción:** Diseño conceptual de la arquitectura, especificaciones funcionales, modelado de procesos de negocio (WMS multi-almacén, Punto de Venta, facturación SUNAT y multi-país) y generación del código base. | 💡 `Ideas` 🏗️ `Arquitectura` 💻 `Código Base` | [Z.ai - Advanced AI Chatbot & Agent powered by GLM-5.3-Flash](https://chat.z.ai/) |
| **Google Antigravity** | [Gemini 3.8 Flash](https://deepmind.google/) | **Auditoría, Depuración y QA:** Detección y resolución de bugs críticos (enrutador API, función `stockList_`, fechas en Dashboard, compras atómicas), pruebas de integración y generación de documentación técnica (MD, HTML, PDF). | 🔍 `Auditoría` 🐛 `Bug Fixes` 🧪 `Tests` 📚 `Documentación` | [Google DeepMind / Antigravity](https://deepmind.google/) |

