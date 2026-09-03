# NexoERP — Sistema ERP/WMS Integrado (v1.4)

**Arquitectura de costo cero:** Vercel (frontend SPA) + Google Apps Script (backend/API) + Google Sheets (base de datos).

Sistema de gestión de almacenes y recursos empresariales con: inventario multi-almacén, kardex físico y valorizado (promedio ponderado), lotes/números de serie con vencimientos y política FEFO, movimientos (entradas, salidas, transferencias, devoluciones, ajustes), centro de alertas, reportes exportables, usuarios con roles, auditoría y tokens de sesión. Incluye POS de mostrador con boletas, cuadre de caja, fiados, cotizaciones, rentabilidad real, panel de control interno y dashboard comparativo.

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
│           └── views/         ← 22 vistas (dashboard, POS, categorías, fiados,
│                               cotizaciones, rentabilidad, panel, caja, ...)
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
    ├── 09_Setup.gs            ← setupSystem() + migraciones no destructivas
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
3. **No cree pestañas manualmente**: en el PARTE 2 la función `setupSystem` crea las ~20 pestañas (`Config`, `Usuarios`, `Sesiones`, `Categorias`, `Almacenes`, `Productos`, `Stock`, `Lotes`, `Proveedores`, `Clientes`, `Movimientos`, `Kardex`, `Auditoria`, `Ventas`, `VentaDetalle`, `Numeracion`, `Caja`, `PagosFiado`, `Cotizaciones`, `CotizacionDetalle`) con sus cabeceras exactas y carga datos de ejemplo.
4. ⚠️ Importante (Perú): en **Archivo → Configuración**, fije la **zona horaria** en `(GMT-05:00) Lima` y el idioma si lo desea. Así las fechas de boletas, caja y reportes coinciden con su hora local.

## PARTE 2 — Instalar el backend (Google Apps Script)

1. En su hoja `NexoERP-DB`: menú **Extensiones → Apps Script**. Se abre el editor en una pestaña nueva.
2. Arriba a la izquierda, haga clic en el nombre del proyecto (“Proyecto sin título”) y renómbrelo a **`NexoERP-Backend`**.
3. Verá un archivo llamado `Código.gs`. Haga clic en él y renómbrelo (clic derecho → Renombrar) a **`00_Config`** y pegue el contenido completo de `backend/00_Config.gs`.
4. Por **cada archivo** de la carpeta `backend/` (del `00_Config.gs` al `14_Analitica.gs`, son 15 en total): pulse **Archivo → Nuevo → Secuencia de comandos**, póngale EXACTAMENTE el mismo nombre sin la extensión (`01_WebApp`, `02_Auth`, … `14_Analitica`) y pegue el contenido completo del archivo correspondiente.
   - 💡 El nombre del archivo dentro de Apps Script debe coincidir (sin `.gs`); el prefijo numérico solo ayuda a mantener el orden.
   - ⚠️ No deje ningún archivo sin guardar: si hay cambios pendientes, el nombre del archivo aparece en *cursiva*. Guarde todo con **Ctrl+S** (Cmd+S en Mac).
5. En la barra de herramientas superior, seleccione la función **`setupSystem`** en el desplegable y pulse **Ejecutar**.
6. La primera vez Google pedirá **autorización**: pulse *Revisar permisos* → elija su cuenta → si aparece “Google no ha verificado esta app”, pulse *Configuración avanzada → Ir a NexoERP-Backend (no seguro)* → *Permitir*. (Es SU propio código actuando sobre SU propia hoja; es normal en scripts personales.)
7. Espere **1–3 minutos**. Verifique en el *Registro de ejecución*: debe decir `setupSystem OK: {...}`.
   - La ejecución crea todas las pestañas, el usuario inicial **admin**, la configuración por defecto, 3 almacenes, 18 productos, movimientos demo de 30 días con su kardex, boletas históricas, 2 proformas y la caja de hoy abierta.
8. (Opcional) Compruebe en la hoja: aparecerán las pestañas nuevas con datos de ejemplo. Puede borrar los datos de ejemplo cuando cargue sus datos reales (o dejarlos como referencia).

> **¿Ya tenía una versión anterior (v1.0 a v1.3) con datos reales?** NO ejecute `setupSystem` (rehace la demo). Solo reemplace los 15 archivos .gs con esta versión y ejecute una vez las migraciones que falten: `migrarAdendaV12`, `migrarAdendaV13` (no destructivas; la **v1.4 no requiere migración** — no crea pestañas ni columnas nuevas).

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

1. Abra su URL de Vercel. Verá el login **sin el aviso “Modo demostración”** (señal de que está conectado a su hoja).
2. Ingrese con **`admin` / `admin123`**.
3. **Cambie la contraseña YA**: menú *Usuarios y Roles* → edite `admin` → nueva contraseña. (Los usuarios demo `mgerente`, `joperador`, `consulta` con `demo123` se crean para pruebas: cámbieles la contraseña o desactívelos.)
4. **Configuración → Identidad fiscal**: RUC (11 dígitos), razón social, logo (URL pública o suba el archivo — se guarda optimizado en Base64), IGV (activado = precios con IGV incluido, tasa 18), horario de atención, método de pago por defecto, mensaje de la boleta, prefijo WhatsApp (51).
5. **Inventario → Almacenes**: cree sus tiendas/depósitos reales. Luego edite la clave `ALMACEN_VENTA` en *Configuración* con el ID del almacén que despacha el POS (por defecto `ALM-0003`).
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
| Login dice credenciales incorrectas | Está en modo demo (`API_URL` vacío) o usuarios demo sin migrar | Si quiere producción, pegue la URL; si venía de otra versión, ejecute `setupSystem` en una hoja NUEVA |
| “Sesión expirada” frecuente | TTL de token de 8 h | Vuelva a iniciar sesión (comportamiento esperado) |
| La boleta no muestra el logo | URL del logo sin HTTPS o caída | Use una URL pública HTTPS estable, o suba el archivo desde Configuración (Base64) |
| WhatsApp no adjunta el archivo | En PC, WhatsApp Web exige adjuntar manualmente el archivo descargado | Descargue la imagen/PDF (queda en Descargas) y adjúntela en el chat que se abrió; en celulares se comparte directo |
| Fechas/horas desplazadas | Zona horaria de la hoja | Archivo → Configuración → Zona horaria: Lima (GMT-05:00) |
| Se agotan las cuotas | Volumen muy alto para cuenta gratuita | Apps Script gratis: ~20.000 lecturas/día y 90 min de ejecución; para PYME estándar sobra. Archive movimientos antiguos |

## PARTE 8 — Actualizaciones y respaldo

- **Respaldo**: *Archivo → Historial de versiones* en Google Sheets (histórico automático de Google), o duplique la hoja periódicamente (Archivo → Hacer una copia).
- **Reset completo** (borra TODO y recarga demo): ejecute `resetSystem` en el editor de Apps Script.
- **Cambios de código backend**: pegue el .gs editado → *Implementar → Gestionar implementaciones → ✏️ → Nueva versión*. La URL `/exec` NO cambia.
- **Cambios de frontend**: edite y suba a GitHub (Vercel redespliega) o re-arrastre la carpeta en Vercel.

---

## Seguridad implementada

| Capa | Mecanismo |
|---|---|
| Contraseñas | Hash **SHA-256 + salt aleatorio por usuario** (nunca texto plano en Sheets) |
| Sesiones | Token UUID temporal (TTL 8 h) guardado en pestaña `Sesiones`; se purga en cada login y al cerrar sesión |
| Autorización | **Validación por rol en el backend** en cada acción crítica (`movimientos:anular`, `usuarios:manage`, etc.). Ocultar botones en el frontend es solo cosmético |
| Concurrencia | `LockService` en registro/anulación de movimientos y emisión de boletas: evita carreras al descontar stock o duplicar correlativos |
| Auditoría | Cada login, movimiento, anulación y cambio de configuración se registra con usuario, rol y detalle |
| Transporte | HTTPS de extremo a extremo (Vercel + Google); el payload viaja por `POST` JSON |

Roles incluidos: **admin** (todo) · **gerente** (catálogos, movimientos, anulación, auditoría, ventas, autorizar descuentos/regalos) · **operador** (consultas, movimientos, POS, caja) · **consulta** (solo lectura).

## API — contrato de acciones

Todas las peticiones son `POST` JSON al Web App: `{ action, token, ...payload }` con `Content-Type: text/plain;charset=utf-8` (evita el preflight CORS que Apps Script no atiende). Respuesta: `{ ok, data, error, code }`.

- **Núcleo:** `login`, `logout`, `ping`, `dashboard`, `productos_list/save/delete`, `almacenes_list/save/delete`, **`categorias_list/save/delete`** (v1.4: categorías propias del usuario), `proveedores_*`, `clientes_*`, `stock_list`, `lotes_list`, `movimientos_list/registrar/anular`, `kardex`, `reporte_stock`, `reporte_movimientos`, `auditoria_list`, `config_get/save`, `usuarios_list/save/delete`.
- **POS/ventas/caja:** `ventas_registrar` (boleta correlativa + descarga stock + política de precios + autorización + fiado + costo real por línea), `ventas_autorizar`, `ventas_list/get/anular`, `ventas_resumen`, `caja_estado/abrir/cerrar/historial`.
- **v1.3:** `fiados_cartera`, `fiado_abono`, `fiado_pagos`, `cotizaciones_registrar/list/get/anular`, `cotizaciones_convertir`, `ventas_marcar_whatsapp`, `ventas_analitica` (dashboard comparativo), `rentabilidad_producto`, `panel_control`.

> Los documentos compartibles (boleta PNG y proforma PDF A4) se generan **en el navegador** (canvas/jsPDF) con los mismos datos que devuelve el backend: cero costo de servidor y cero cuota de Apps Script extra.

### Claves de Config (pestaña `Config`, editable desde la app con rol admin)

`RAZON_SOCIAL`, `NOMBRE_EMPRESA`, `RUC`, `LOGO_URL`, `LOGO_BASE64`, `IGV_INCLUIDO`, `IGV_TASA`, `PREFIJO_BOLETA`, `MENSAJE_BOLETA`, `ALMACEN_VENTA`, `METODO_PAGO_DEFAULT`, `HORARIO_INICIO/FIN`, `DESCUENTO_MAX_PCT`, `DESCUENTO_REQUIERE_AUTORIZACION`, `REGALO_REQUIERE_AUTORIZACION`, `FIADO_PERMITIR_EXCEDER`, `FIADO_DIAS_ALERTA`, `WHATSAPP_PREFIJO`, `MONEDA_SIMBOLO`, `METODO_VALUACION`, `PERMITIR_STOCK_NEGATIVO`, `DIAS_ALERTA_VENCIMIENTO`.

## Mantenimiento y operaciones

- **Cuotas de Apps Script (cuenta gratuita):** ~20.000 lecturas de celdas y ~90 min de ejecución al día; para el volumen típico de PYME (decenas de movimientos diarios) el margen es amplio.
- **Backup:** Versiones de Google Sheets (Archivo → Historial de versiones) o copia periódica con *Hacer una copia*.
- **Re-despliegue del backend:** tras editar código, use *Implementar → Gestionar implementaciones → Editar (✏️) → Versión: Nueva*; la URL `/exec` no cambia.
