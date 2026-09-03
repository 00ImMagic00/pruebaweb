/**
 * NexoERP — receipts.js  (ADENDA 1.4)
 * Generación de documentos para compartir:
 *
 *  · BOLETA DE VENTA  → IMAGEN PNG estilo ticket (canvas nativo, sin dependencias).
 *  · PROFORMA/COTIZACIÓN → PDF A4 "formato carta grande" (jsPDF), distinto de la boleta.
 *  · Envío por WhatsApp: adjunta el archivo real si el navegador lo permite
 *    (Web Share API en móviles) y si no, descarga el archivo + abre wa.me con el
 *    mensaje redactado para que el usuario lo adjunte en un toque.
 */
(function () {

  /* ============================ Helpers comunes ============================ */

  function jsPDFctor() {
    var j = window.jspdf && window.jspdf.jsPDF;
    if (!j) throw new Error('jsPDF no está cargado (assets/vendor/jspdf.umd.min.js).');
    return j;
  }

  function monedaDe(empresa) { return (empresa && empresa.moneda) || 'S/'; }
  function monto(empresa, n) { return monedaDe(empresa) + ' ' + Number(n || 0).toFixed(2); }
  function esRegalo(d) {
    var v = String(d.esRegalo || 'No').trim().toUpperCase();
    return v === 'SÍ' || v === 'SI' || v === 'YES' || v === 'TRUE';
  }

  function limpiarNombre(s) {
    return String(s || '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function boletaNombreArchivo(venta) {
    return limpiarNombre('Boleta_' + (venta.boleta || venta.numero || 'venta')) + '.png';
  }
  function proformaNombreArchivo(cot) {
    return limpiarNombre('Proforma_' + (cot.numero || 'cotizacion')) + '.pdf';
  }

  function dataURLaBlob(dataURL) {
    var partes = String(dataURL).split(',');
    var mime = (partes[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    var bin = atob(partes[1]);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function descargarArchivo(nombre, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /**
   * Envía un ARCHIVO real por WhatsApp cuando el dispositivo lo permite
   * (Web Share API: Android/iOS → el usuario elige WhatsApp en la hoja de
   * compartir). Fallback universal: descarga el archivo y abre wa.me con el
   * mensaje ya redactado; el usuario adjunta el archivo descargado.
   * opts: { telefono, mensaje, nombre, blob }
   * Devuelve: 'share' | 'descarga' | 'cancelado'
   */
  async function enviarArchivoWhatsapp(opts) {
    var o = opts || {};
    var blob = o.blob instanceof Blob ? o.blob : dataURLaBlob(o.blob);
    try {
      var file = new File([blob], o.nombre || 'archivo', { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: o.mensaje || '', title: o.nombre || '' });
        return 'share';
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelado';
      /* continúa al fallback */
    }
    descargarArchivo(o.nombre || 'archivo', blob);
    window.open(Utils.linkWhatsapp(o.telefono, o.mensaje || ''), '_blank');
    return 'descarga';
  }

  /* ============================ BOLETA → PNG ============================ */

  /** Carga el logo (base64 o URL pública) sin romper si falla. */
  function cargarLogo(empresa) {
    return new Promise(function (resolve) {
      var src = (empresa && (empresa.logoBase64 || empresa.logoUrl)) || '';
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function wrapTexto(ctx, texto, maxAncho) {
    var palabras = String(texto == null ? '' : texto).split(/\s+/).filter(function (w) { return w !== ''; });
    var lineas = [], linea = '';
    for (var i = 0; i < palabras.length; i++) {
      var prueba = linea ? linea + ' ' + palabras[i] : palabras[i];
      if (ctx.measureText(prueba).width > maxAncho && linea) { lineas.push(linea); linea = palabras[i]; }
      else linea = prueba;
    }
    if (linea) lineas.push(linea);
    return lineas.length ? lineas : [''];
  }

  /**
   * Dibuja la boleta estilo ticket 80 mm en un canvas temporal alto y devuelve
   * el canvas final recortado al contenido exacto. (venta, detalle, empresa
   * con los mismos shapes que entrega el backend.)
   */
  async function boletaCanvas(venta, detalle, empresa) {
    var logo = await cargarLogo(empresa);
    try {
      return renderBoleta_(venta, detalle, empresa, logo);
    } catch (errTaint) {
      /* Logo remoto sin CORS "contamina" el canvas al exportar: reintenta sin logo. */
      return renderBoleta_(venta, detalle, empresa, null);
    }
  }

  function renderBoleta_(venta, detalle, empresa, logo) {
    var S = 2;                        // escala 2x para nitidez en WhatsApp
    var W = 380;                      // ancho lógico del ticket (80 mm aprox)
    var M = 18;
    var CW = W - M * 2;
    var mon = monedaDe(empresa);
    var anulada = String((venta && venta.estado) || '').toUpperCase() === 'ANULADA';

    var altoTemp = 1600;              // suficiente para ventas normales
    var temp = document.createElement('canvas');
    temp.width = W * S; temp.height = altoTemp * S;
    var ctx = temp.getContext('2d');
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, altoTemp);
    ctx.textBaseline = 'top';

    var y = M;
    function sep() {
      ctx.save();
      ctx.strokeStyle = '#666666'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(M, y + 4); ctx.lineTo(W - M, y + 4); ctx.stroke();
      ctx.restore(); y += 12;
    }
    function centrado(txt, font, color) {
      ctx.font = font; ctx.fillStyle = color || '#111111'; ctx.textAlign = 'center';
      ctx.fillText(String(txt), W / 2, y);
    }
    function par(izqTxt, derTxt, fontI, fontD, colI, colD) {
      ctx.font = fontI || '400 11px Arial'; ctx.fillStyle = colI || '#111111'; ctx.textAlign = 'left';
      ctx.fillText(String(izqTxt), M, y);
      ctx.font = fontD || fontI || '400 11px Arial'; ctx.fillStyle = colD || colI || '#111111'; ctx.textAlign = 'right';
      ctx.fillText(String(derTxt), W - M, y);
      ctx.textAlign = 'left';
    }
    function wrapCentrado(txt, font, color) {
      ctx.font = font; ctx.fillStyle = color || '#111111';
      wrapTexto(ctx, txt, CW).forEach(function (l) { ctx.textAlign = 'center'; ctx.fillText(l, W / 2, y); y += 15; });
    }

    /* --- Cabecera --- */
    if (logo) {
      var lh = 50, lw = logo.height > 0 ? Math.min(150, lh * logo.width / logo.height) : 120;
      try { ctx.drawImage(logo, (W - lw) / 2, y, lw, lh); } catch (e) { /* logo omitido */ }
      y += 58;
    }
    var lins = wrapTexto(ctx, ((empresa && empresa.razonSocial) || 'NexoERP').toUpperCase(), CW);
    lins.forEach(function (l) { centrado(l, '700 13.5px Arial'); y += 17; });
    centrado('RUC: ' + ((empresa && empresa.ruc) || '—'), '400 11px Arial'); y += 17;
    y += 2; sep();

    centrado('BOLETA DE VENTA', '700 13px Arial'); y += 18;
    centrado(venta.boleta || venta.numero || '', '700 13px Arial'); y += 18;
    sep();

    /* --- Datos --- */
    var filas = [
      ['Fecha', venta.fecha || ''],
      ['Vendedor', venta.usuario || ''],
      ['Cliente', venta.clienteNombre || 'Público General'],
      ['Doc.', (venta.clienteDocTipo || 'DNI') + ' ' + (venta.clienteDocNumero || '')],
      ['Tienda', venta.almacenNombre || venta.almacenId || '']
    ];
    if (venta.autorizadoPor) filas.push(['Autorizó', venta.autorizadoPor]);
    filas.forEach(function (f) {
      par(f[0] + ':', String(f[1]).slice(0, 36), '400 10.5px Arial', '400 10.5px Arial', '#555555', '#111111');
      y += 14;
    });
    y += 2; sep();

    /* --- Ítems --- */
    var cxC = M, cxD = M + 34, cxU = W - M - 64, cxI = W - M;
    par('CANT', 'IMPORTE', '700 9px Arial', '700 9px Arial', '#666666', '#666666');
    ctx.font = '700 9px Arial'; ctx.fillStyle = '#666666'; ctx.textAlign = 'left';
    ctx.fillText('DESCRIPCIÓN', cxD, y);
    ctx.textAlign = 'right'; ctx.fillText('P.UNT', cxU, y); y += 14;

    (detalle || []).forEach(function (d) {
      var regalo = esRegalo(d);
      var editado = !regalo && Number(d.precioOriginal) > 0 && Number(d.precioUnit) < Number(d.precioOriginal);
      var y0 = y;
      ctx.textAlign = 'left'; ctx.font = '400 10.5px Arial'; ctx.fillStyle = '#111111';
      ctx.fillText(String(d.cantidad), cxC, y0);
      /* El nombre NUNCA incluye la etiqueta REGALO: se dibuja aparte para no duplicar. */
      var nom = String(d.descripcion || '');
      /* Ancho de descripción limitado para no invadir la columna P.UNT (≈56px). */
      var dl = wrapTexto(ctx, nom, cxU - 56 - cxD - 8);
      dl.forEach(function (l, li) { ctx.fillText(l, cxD, y0 + li * 12); });
      var ySku = y0 + dl.length * 12;
      if (String(d.sku || '')) {
        ctx.font = '400 8.5px Arial'; ctx.fillStyle = '#777777';
        ctx.fillText(String(d.sku), cxD, ySku); ySku += 11;
      }
      if (regalo) {
        ctx.font = '700 8.5px Arial'; ctx.fillStyle = '#a21caf';
        ctx.fillText('— REGALO', cxD, ySku); ySku += 11;
      }
      ctx.textAlign = 'right';
      ctx.font = '400 10.5px Arial'; ctx.fillStyle = '#111111';
      ctx.fillText(monto(mon, d.precioUnit), cxU, y0);
      if (editado) {
        ctx.font = '400 8px Arial'; ctx.fillStyle = '#888888';
        ctx.fillText('(lista ' + monto(mon, d.precioOriginal) + ')', cxU, y0 + 12);
      }
      ctx.font = '400 10.5px Arial'; ctx.fillStyle = '#111111';
      ctx.fillText(monto(mon, d.subtotal), cxI, y0);
      y = Math.max(ySku, y0 + (editado ? 24 : 14)) + 4;
    });
    y += 2; sep();

    /* --- Totales --- */
    if (Number(venta.descuentoTotal) > 0) {
      par('DESCUENTOS', '-' + monto(mon, venta.descuentoTotal), '400 11px Arial', '400 11px Arial', '#555555', '#0f766e');
      y += 16;
    }
    par('OP. GRAVADAS', monto(mon, venta.subtotal), '400 11px Arial', '400 11px Arial', '#555555', '#111111');
    y += 16;
    par('IGV ' + ((empresa && empresa.igvTasa) || 18) + '%', monto(mon, venta.igv), '400 11px Arial', '400 11px Arial', '#555555', '#111111');
    y += 18;
    par('TOTAL', monto(mon, venta.total), '700 15px Arial', '700 15px Arial', '#111111', '#111111');
    y += 20;
    sep();

    /* --- Pago --- */
    par('Forma de pago', venta.metodoPago || '', '400 10.5px Arial', '400 10.5px Arial', '#555555', '#111111');
    y += 15;
    if (venta.metodoPago === 'Efectivo' && Number(venta.montoRecibido) > 0) {
      par('Recibido', monto(mon, venta.montoRecibido) + '   ·   Vuelto: ' + monto(mon, venta.vuelto), '400 10.5px Arial', '400 10.5px Arial', '#555555', '#111111');
      y += 15;
    }
    sep();

    /* --- Pie --- */
    wrapCentrado((empresa && empresa.mensajeBoleta) || '¡Gracias por su compra!', '400 10px Arial', '#333333');
    y += 2;
    centrado('Representación de la BOLETA ' + (venta.boleta || ''), '400 8.5px Arial', '#777777'); y += 14;
    if (anulada) {
      y += 4;
      centrado('*** VENTA ANULADA ***', '700 13px Arial', '#dc2626'); y += 18;
    }
    y += M;

    /* --- Recorte final al contenido real --- */
    var altoReal = Math.min(Math.ceil(y), altoTemp);
    var final = document.createElement('canvas');
    final.width = W * S; final.height = altoReal * S;
    var fx = final.getContext('2d');
    fx.fillStyle = '#ffffff'; fx.fillRect(0, 0, final.width, final.height);
    fx.drawImage(temp, 0, 0, final.width, final.height, 0, 0, final.width, final.height);
    return final;
  }


  /* ============================ PROFORMA → PDF A4 ============================ */

  /**
   * Construye la proforma en formato A4 grande (diferente del ticket de boleta).
   * Devuelve el objeto jsPDF (el llamador decide si .save() u obtener el blob).
   */
  async function proformaPDF(cot, detalle, empresa) {
    var jsPDF = jsPDFctor();
    var doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    var PW = 595.28, PH = 841.89, M = 42;
    var AZUL = [37, 99, 235], GRIS = [100, 116, 139], OSCURO = [15, 23, 42];
    var mon = monedaDe(empresa);

    var logoData = null;
    var src = (empresa && (empresa.logoBase64 || empresa.logoUrl)) || '';
    if (src && src.indexOf('data:') === 0) logoData = src;
    else if (src) {
      try {
        var resp = await fetch(src, { mode: 'cors' });
        var blobImg = await resp.blob();
        logoData = await new Promise(function (res) {
          var fr = new FileReader();
          fr.onload = function () { res(fr.result); };
          fr.onerror = function () { res(null); };
          fr.readAsDataURL(blobImg);
        });
      } catch (e) { logoData = null; }
    }

    function cabecera(pagina) {
      var y = 0;
      doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
      doc.rect(0, 0, PW, 108, 'F');
      var xTxt = M;
      if (logoData) {
        try {
          var fmt = logoData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG';
          doc.addImage(logoData, fmt, M, 20, 68, 68, undefined, 'FAST');
          xTxt = M + 82;
        } catch (e) { xTxt = M; }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      doc.text(String((empresa.razonSocial || 'NexoERP')).slice(0, 42), xTxt, 38);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text('RUC: ' + (empresa.ruc || '—'), xTxt, 55);
      var extra = [];
      if (empresa.direccion) extra.push(empresa.direccion);
      if (empresa.telefono) extra.push('Tel. ' + empresa.telefono);
      if (extra.length) doc.text(String(extra.join('  ·  ')).slice(0, 78), xTxt, 70);
      doc.setFontSize(9);
      doc.text('Sistema ERP/WMS — NexoERP', xTxt, 88);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
      doc.text('COTIZACIÓN / PROFORMA', PW - M, 40, { align: 'right' });
      doc.setFontSize(13);
      doc.text(String(cot.numero || ''), PW - M, 60, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text('Fecha: ' + (cot.fechaFmt || cot.fecha || ''), PW - M, 78, { align: 'right' });
      doc.text('Válida hasta: ' + (cot.validezFmt || cot.validezHasta || ''), PW - M, 92, { align: 'right' });

      y = 132;
      /* Caja de cliente */
      doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252);
      doc.roundedRect(M, y, PW - M * 2, 58, 6, 6, 'FD');
      doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('CLIENTE', M + 12, y + 15);
      doc.setTextColor(OSCURO[0], OSCURO[1], OSCURO[2]); doc.setFontSize(11.5); doc.setFont('helvetica', 'bold');
      doc.text(String(cot.clienteNombre || 'Público General').slice(0, 52), M + 12, y + 32);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
      var lineaCli = [cot.clienteDoc ? cot.clienteDoc : '', cot.nota ? 'Ref.: ' + String(cot.nota).slice(0, 60) : '']
        .filter(function (x) { return x; }).join('   ·   ');
      doc.text(lineaCli, M + 12, y + 47);
      doc.text('Atendió: ' + (cot.usuario || ''), PW - M - 12, y + 47, { align: 'right' });

      y += 78;
      /* Cabecera de la tabla de ítems */
      function cabItems() {
        doc.setFillColor(219, 234, 254);
        doc.rect(M, y, PW - M * 2, 22, 'F');
        doc.setTextColor(30, 58, 138); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('#', M + 8, y + 15);
        doc.text('CANT.', M + 30, y + 15);
        doc.text('DESCRIPCIÓN', M + 78, y + 15);
        doc.text('P.UNIT', PW - M - 150, y + 15, { align: 'right' });
        doc.text('IMPORTE', PW - M - 8, y + 15, { align: 'right' });
        y += 22;
      }
      cabItems();

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      (detalle || []).forEach(function (d, i) {
        if (y > PH - 150) {                     // salto de página con cabecera repetida
          doc.addPage(); y = 42;
          cabecera(true); y = 132; y += 78;
          cabItems();
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        }
        if (i % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(M, y - 1, PW - M * 2, 20, 'F');
        }
        doc.setTextColor(OSCURO[0], OSCURO[1], OSCURO[2]);
        doc.text(String(i + 1), M + 8, y + 13);
        doc.text(String(d.cantidad), M + 30, y + 13);
        var nombre = String(d.descripcion || '');
        doc.text(nombre.length > 58 ? nombre.slice(0, 55) + '...' : nombre, M + 78, y + 13);
        if (String(d.sku || '')) {
          doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]); doc.setFontSize(7.5);
          doc.text(String(d.sku), M + 78, y + 21.5);
          doc.setFontSize(9.5); doc.setTextColor(OSCURO[0], OSCURO[1], OSCURO[2]);
        }
        doc.text(monto(mon, d.precioUnit), PW - M - 150, y + 13, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(monto(mon, d.subtotal), PW - M - 8, y + 13, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setDrawColor(233, 236, 244);
        doc.line(M, y + 19, PW - M, y + 19);
        /* Filas con SKU son un poco más altas para que la 2.ª línea respire. */
        y += String(d.sku || '') ? 26 : 20;
      });

      y += 14;
      /* Totales */
      var bx = PW - M - 240;
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(bx, y, 240, Number(cot.descuentoTotal) > 0 ? 92 : 77, 6, 6, 'S');
      var ty = y + 20;
      doc.setFontSize(10);
      if (Number(cot.descuentoTotal) > 0) {
        doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
        doc.text('Descuentos', bx + 12, ty);
        doc.text('-' + monto(mon, cot.descuentoTotal), bx + 228, ty, { align: 'right' });
        ty += 17;
      }
      doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
      doc.text('Op. gravadas', bx + 12, ty);
      doc.text(monto(mon, cot.subtotal), bx + 228, ty, { align: 'right' });
      ty += 17;
      doc.text('IGV ' + (empresa.igvTasa || 18) + '%', bx + 12, ty);
      doc.text(monto(mon, cot.igv), bx + 228, ty, { align: 'right' });
      ty += 21;
      doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('TOTAL', bx + 12, ty);
      doc.text(monto(mon, cot.total), bx + 228, ty, { align: 'right' });

      /* Condiciones */
      var cy = y + (Number(cot.descuentoTotal) > 0 ? 112 : 97);
      doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('Condiciones', M, cy);
      doc.setFontSize(8.5);
      var condiciones = doc.splitTextToSize(
        'Los precios de esta proforma son válidos hasta el ' + (cot.validezFmt || cot.validezHasta || '—') +
        '. Documento de referencia: no es un comprobante de pago ni autoriza descargos de inventario.',
        PW - M * 2);
      doc.text(condiciones, M, cy + 13);

      /* Pie de página en todas las hojas */
      var total = doc.getNumberOfPages();
      for (var p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setDrawColor(203, 213, 225);
        doc.line(M, PH - 54, PW - M, PH - 54);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
        doc.text(String((empresa.mensajeBoleta || '¡Gracias por su compra!')).slice(0, 90), PW / 2, PH - 38, { align: 'center' });
        doc.setFontSize(7.5);
        doc.text('Generado por NexoERP · ' + (cot.numero || '') + ' · Página ' + p + ' de ' + total, PW / 2, PH - 24, { align: 'center' });
      }
    }

    cabecera(false);
    return doc;
  }

  /* ============================ Exportación ============================ */

  window.NexoDocs = {
    boletaCanvas: boletaCanvas,
    proformaPDF: proformaPDF,
    enviarArchivoWhatsapp: enviarArchivoWhatsapp,
    descargarArchivo: descargarArchivo,
    dataURLaBlob: dataURLaBlob,
    boletaNombreArchivo: boletaNombreArchivo,
    proformaNombreArchivo: proformaNombreArchivo
  };
})();
