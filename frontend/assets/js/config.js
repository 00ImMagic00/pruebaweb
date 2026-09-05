/**
 * NexoERP — config.js
 * Configuración de conexión del frontend.
 *
 * MODO DE CONEXIÓN:
 *   - Si API_URL se deja vacío (''), el sistema arranca en MODO DEMO:
 *     toda la lógica ERP corre en el navegador con datos semilla y
 *     persistencia en localStorage. Ideal para evaluar el sistema.
 *
 *   - Para conectar con su backend real, pegue aquí la URL del Web App
 *     de Google Apps Script (termina en /exec), por ejemplo:
 *       API_URL: 'https://script.google.com/macros/s/AKfy.../exec'
 */
var CONFIG_APP = {
  API_URL: '',                       // <-- URL del Web App de Google Apps Script
  NOMBRE_APP: 'NexoERP',
  VERSION: '1.6.1',
  TOKEN_CLAVE: 'nexoerp_token',
  USUARIO_CLAVE: 'nexoerp_user',
  EXPIRA_CLAVE: 'nexoerp_expira',
  DB_DEMO: 'nexoerp_demo_db_v6',     // v1.6: comprobantes, gastos, OC, cuotas, RRHH, fidelización
  TTL_TOKEN_HORAS: 8
};
