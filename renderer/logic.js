// Lógica de dinero y stock, sin pantalla: se usa desde la app y se prueba con `npm test`.
(function (root) {
  var L = {};
  var sum = function (a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); };

  // Pagos de una venta (las ventas antiguas guardaban un solo método).
  L.pagos = function (s) { if (s.pagos) return s.pagos; var o = {}; o[s.metodo] = s.total; return o; };

  // Total de una línea, aplicando la promoción por pack (ej. 3 por $2.500).
  L.lineTotal = function (i, p) {
    p = p || {};
    return p.pn > 1 && p.pp ? Math.floor(i.qty / p.pn) * p.pp + (i.qty % p.pn) * i.price : i.price * i.qty;
  };

  // Descuento manual en % o en $, con tope porcentual según el rol.
  L.discount = function (sub, value, tipo, maxPct) {
    var v = Math.max(Number(value) || 0, 0);
    return Math.round(tipo === '%' ? sub * Math.min(v, maxPct) / 100 : Math.min(v, sub * maxPct / 100));
  };

  L.pointsDiscount = function (points, valPto, base) {
    return Math.max(0, Math.min(Math.round((points || 0) * (Number(valPto) || 0)), base));
  };

  // Reparte el pago. Si no se escribe nada, se asume efectivo exacto. El efectivo se ajusta para que la suma cuadre.
  L.split = function (total, v) {
    var ef = v.Efectivo || 0, ta = v.Tarjeta || 0, tr = v.Transferencia || 0, fi = v.Fiado || 0,
        otros = ta + tr + fi, any = ef + otros > 0, falta = any ? total - otros - ef : 0,
        efNeto = Math.max(0, total - otros), pagos = {};
    if (efNeto > 0) pagos.Efectivo = efNeto;
    if (ta > 0) pagos.Tarjeta = ta;
    if (tr > 0) pagos.Transferencia = tr;
    if (fi > 0) pagos.Fiado = fi;
    return { otros: otros, any: any, falta: falta, pagos: pagos, recibido: Math.max(ef, efNeto),
             vuelto: ef > efNeto && ef > 0 ? ef - efNeto : 0, ok: falta <= 0 && otros <= total };
  };

  // Dinero que debería haber en la caja desde su apertura.
  L.cajaEsperado = function (caja, sales) {
    var ef = sum(sales.filter(function (s) { return !s.anulada && s.fecha >= caja.apertura; }), function (s) { return L.pagos(s).Efectivo || 0; });
    var ing = sum(caja.movs.filter(function (m) { return m.tipo === 'ingreso'; }), function (m) { return m.monto; });
    var ret = sum(caja.movs.filter(function (m) { return m.tipo === 'retiro'; }), function (m) { return m.monto; });
    return { ef: ef, ing: ing, ret: ret, esp: caja.inicio + ef + ing - ret };
  };

  L.earnPoints = function (total, ptsPor) { ptsPor = Number(ptsPor) || 0; return ptsPor ? Math.floor(total / ptsPor) : 0; };
  L.pointsUsed = function (desc, valPto, points) { valPto = Number(valPto) || 0; return desc && valPto ? Math.min(points || 0, Math.ceil(desc / valPto)) : 0; };
  L.applySaleToClient = function (c, sale) {
    c.points = (c.points || 0) - sale.ptsUsed + sale.pts;
    c.debt = (c.debt || 0) + (sale.pagos.Fiado || 0);
  };
  L.revertSaleOnClient = function (c, s) {
    c.points = Math.max(0, (c.points || 0) - (s.pts || 0) + (s.ptsUsed || 0));
    c.debt = Math.max(0, (c.debt || 0) - ((s.pagos || {}).Fiado || 0));
  };

  // Qué comprar: stock bajo el mínimo o con menos de 7 días de cobertura, según las ventas de 30 días.
  L.reposicion = function (products, sales, now) {
    var lim = now - 30 * 864e5, vend = {};
    sales.forEach(function (s) {
      if (!s.anulada && new Date(s.fecha).getTime() >= lim) s.items.forEach(function (i) { vend[i.code] = (vend[i.code] || 0) + i.qty; });
    });
    return Object.keys(products).filter(function (k) { return products[k].stock != null; }).map(function (k) {
      var p = products[k], vd = (vend[k] || 0) / 30, obj = Math.max((p.min || 0) * 2, Math.ceil(vd * 14));
      return { code: k, p: p, vd: vd, buy: (p.stock <= (p.min || 0) || p.stock < vd * 7) ? Math.max(1, Math.ceil(obj - p.stock)) : 0 };
    }).filter(function (x) { return x.buy > 0; });
  };

  root.Logic = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
