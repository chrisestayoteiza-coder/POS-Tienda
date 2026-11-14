const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../renderer/logic.js');

test('promoción por pack: 3 por $2.500', () => {
  const p = { pn: 3, pp: 2500 }, it = (qty) => ({ qty, price: 990 });
  assert.equal(L.lineTotal(it(1), p), 990);
  assert.equal(L.lineTotal(it(3), p), 2500);
  assert.equal(L.lineTotal(it(4), p), 3490);
  assert.equal(L.lineTotal(it(7), p), 2 * 2500 + 990);
  assert.equal(L.lineTotal(it(3), {}), 2970);
  assert.equal(L.lineTotal(it(3), undefined), 2970);
});

test('descuento con tope por rol', () => {
  assert.equal(L.discount(10000, 50, '%', 100), 5000);
  assert.equal(L.discount(10000, 50, '%', 10), 1000);
  assert.equal(L.discount(10000, 5000, '$', 10), 1000);
  assert.equal(L.discount(10000, 300, '$', 10), 300);
  assert.equal(L.discount(10000, -5, '%', 100), 0);
  assert.equal(L.discount(10000, 'abc', '$', 100), 0);
  assert.equal(L.discount(999, 33.3, '%', 100), 333);
});

test('los puntos no pueden descontar más que el saldo de la venta', () => {
  assert.equal(L.pointsDiscount(100, 50, 3000), 3000);
  assert.equal(L.pointsDiscount(10, 50, 3000), 500);
  assert.equal(L.pointsDiscount(0, 50, 3000), 0);
  assert.equal(L.pointsDiscount(10, 50, 0), 0);
});

test('pago mixto con vuelto', () => {
  const r = L.split(4000, { Efectivo: 3000, Tarjeta: 1000, Fiado: 1000 });
  assert.deepEqual(r.pagos, { Efectivo: 2000, Tarjeta: 1000, Fiado: 1000 });
  assert.equal(r.recibido, 3000); assert.equal(r.vuelto, 1000); assert.equal(r.ok, true);
  assert.equal(Object.values(r.pagos).reduce((a, b) => a + b, 0), 4000);
});

test('sin pagos escritos se asume efectivo exacto', () => {
  const r = L.split(2500, {});
  assert.deepEqual(r.pagos, { Efectivo: 2500 });
  assert.equal(r.ok, true); assert.equal(r.any, false); assert.equal(r.vuelto, 0);
});

test('pago insuficiente o excedido no se puede confirmar', () => {
  assert.equal(L.split(5000, { Efectivo: 3000 }).ok, false);
  assert.equal(L.split(5000, { Efectivo: 3000 }).falta, 2000);
  assert.equal(L.split(5000, { Tarjeta: 6000 }).ok, false);
  assert.equal(L.split(5000, { Tarjeta: 5000 }).ok, true);
  assert.deepEqual(L.split(5000, { Tarjeta: 5000 }).pagos, { Tarjeta: 5000 });
});

test('venta de $0 (100% de descuento) es válida', () => {
  const r = L.split(0, {});
  assert.equal(r.ok, true); assert.deepEqual(r.pagos, {});
});

test('caja esperada: solo efectivo, sin anuladas, con ingresos y retiros', () => {
  const caja = { inicio: 20000, apertura: '2026-11-13T10:00:00.000Z', movs: [{ tipo: 'ingreso', monto: 5000 }, { tipo: 'retiro', monto: 3000 }] };
  const sales = [
    { fecha: '2026-11-13T11:00:00.000Z', pagos: { Efectivo: 2000, Tarjeta: 1000 }, total: 3000 },
    { fecha: '2026-11-13T12:00:00.000Z', metodo: 'Efectivo', total: 4000 },
    { fecha: '2026-11-13T12:30:00.000Z', metodo: 'Efectivo', total: 9999, anulada: true },
    { fecha: '2026-11-13T09:00:00.000Z', metodo: 'Efectivo', total: 7777 },
    { fecha: '2026-11-13T13:00:00.000Z', pagos: { Fiado: 800 }, total: 800 }
  ];
  const k = L.cajaEsperado(caja, sales);
  assert.equal(k.ef, 6000); assert.equal(k.esp, 20000 + 6000 + 5000 - 3000);
});

test('ventas antiguas con un solo método siguen leyéndose', () => {
  assert.deepEqual(L.pagos({ metodo: 'Tarjeta', total: 500 }), { Tarjeta: 500 });
});

test('puntos y fiado: aplicar y revertir una venta deja al cliente como estaba', () => {
  const c = { points: 10, debt: 1000 };
  const sale = { pagos: { Efectivo: 1000, Fiado: 2000 }, total: 3000, desc: 500 };
  sale.ptsUsed = L.pointsUsed(500, 50, c.points); sale.pts = L.earnPoints(3000, 1000);
  assert.equal(sale.ptsUsed, 10); assert.equal(sale.pts, 3);
  L.applySaleToClient(c, sale);
  assert.deepEqual(c, { points: 3, debt: 3000 });
  L.revertSaleOnClient(c, sale);
  assert.deepEqual(c, { points: 10, debt: 1000 });
  assert.equal(L.earnPoints(3000, 0), 0);
});

test('revertir nunca deja puntos ni deuda negativos', () => {
  const c = { points: 0, debt: 0 };
  L.revertSaleOnClient(c, { pts: 5, pagos: { Fiado: 900 } });
  assert.deepEqual(c, { points: 0, debt: 0 });
});

test('reposición: sugiere según stock mínimo y ritmo de venta', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const products = { A: { name: 'A', stock: 2, min: 5 }, B: { name: 'B', stock: 100, min: 5 }, C: { name: 'C', stock: 6, min: 2 }, D: { name: 'D', stock: null } };
  const sales = [{ fecha: '2026-11-10T10:00:00Z', items: [{ code: 'C', qty: 30 }] }, { fecha: '2026-11-10T10:00:00Z', anulada: true, items: [{ code: 'B', qty: 999 }] }];
  const r = L.reposicion(products, sales, now);
  const by = Object.fromEntries(r.map((x) => [x.code, x.buy]));
  assert.equal(by.A, 8);            // 2 * min = 10, tiene 2
  assert.equal(by.C, 8);            // vende 1/día, objetivo 14, tiene 6
  assert.equal(by.B, undefined);    // la venta anulada no cuenta
  assert.equal(by.D, undefined);    // sin control de stock
});
