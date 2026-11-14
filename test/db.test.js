const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { Store, migrateFromJson } = require('../db');
const { Auth } = require('../auth');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pos-'));
const fresh = () => { const dir = tmp(), store = new Store(path.join(dir, 'd.db')), auth = new Auth(store.db); auth.seed(); return { dir, store, auth }; };
const base = () => ({
  products: { A: { name: 'Pan', price: 1000, cost: 600, stock: 10, min: 2 }, B: { name: 'Té', price: 500, stock: 5 } },
  sales: [], held: [], clients: { '1-9': { name: 'Ana', points: 0, debt: 0 } },
  config: { nombre: 'Tienda', iva: 19 }, caja: { abierta: false, movs: [], cierres: [] }, audit: [], ajustes: []
});

test('guardar y volver a cargar conserva todo, con las ventas más nuevas primero', () => {
  const { store } = fresh(), d = base();
  d.sales = [{ id: 3, total: 300 }, { id: 2, total: 200 }, { id: 1, total: 100 }];
  assert.equal(store.save(d, 'dueno'), true);
  const l = store.load();
  assert.deepEqual(l.products, d.products);
  assert.deepEqual(l.sales.map((s) => s.id), [3, 2, 1]);
  assert.equal(l.config.nombre, 'Tienda');
});

test('una base vacía devuelve null', () => { assert.equal(fresh().store.load(), null); });

test('solo se reescriben las filas que cambiaron y los borrados se reflejan', () => {
  const { store } = fresh(), d = base();
  store.save(d, 'dueno');
  d.products.A.price = 1200; delete d.products.B;
  assert.equal(store.save(d, 'dueno'), true);
  const l = store.load();
  assert.equal(l.products.A.price, 1200); assert.equal(l.products.B, undefined);
  const before = store.db.prepare('SELECT COUNT(*) n FROM docs').get().n;
  store.save(d, 'dueno');
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM docs').get().n, before);
});

test('permisos del cajero se aplican en la base, no solo en la pantalla', () => {
  const { store } = fresh();
  store.save(base(), 'dueno'); const l = store.load();
  const tryIt = (mut) => { const d = JSON.parse(JSON.stringify(l)); mut(d); return store.save(d, 'cajero'); };
  assert.match(tryIt((d) => { d.products.A.price = 1; }), /editar productos/);
  assert.match(tryIt((d) => { d.products.Z = { name: 'x', price: 1 }; }), /crear o borrar/);
  assert.match(tryIt((d) => { delete d.products.A; }), /crear o borrar/);
  assert.match(tryIt((d) => { d.config.iva = 0; }), /configuración/);
  assert.match(tryIt((d) => { d.gastos = [{ id: 1, monto: 5 }]; }), /gastos/);
  assert.match(tryIt((d) => { delete d.clients['1-9']; }), /borrar clientes/);
  assert.match(tryIt((d) => { d.ajustes = [{ t: 1 }]; }), /ajustar inventario/);
  // lo que sí puede: vender (stock baja, venta nueva, puntos del cliente, caja, auditoría)
  assert.equal(tryIt((d) => { d.products.A.stock = 9; d.sales = [{ id: 10, total: 1000 }]; d.clients['1-9'].points = 1; d.caja.abierta = true; d.audit = [{ t: 'x', a: 'Descuento' }]; }), true);
});

test('el cajero no puede alterar ventas ya registradas ni reescribir la auditoría', () => {
  const { store } = fresh(), d = base();
  d.sales = [{ id: 10, total: 1000, anulada: false }]; d.audit = [{ t: '1', a: 'Venta anulada' }];
  store.save(d, 'dueno');
  const a = JSON.parse(JSON.stringify(d)); a.sales[0].anulada = true;
  assert.match(store.save(a, 'cajero'), /ventas ya registradas/);
  const b = JSON.parse(JSON.stringify(d)); b.sales = [];
  assert.match(store.save(b, 'cajero'), /ventas ya registradas/);
  const c = JSON.parse(JSON.stringify(d)); c.audit = [];
  assert.match(store.save(c, 'cajero'), /auditoría/);
  const ok = JSON.parse(JSON.stringify(d)); ok.audit.unshift({ t: '2', a: 'Descuento' });
  assert.equal(store.save(ok, 'cajero'), true);
  assert.equal(store.save(a, 'dueno'), true);
});

test('un guardado rechazado no cambia nada', () => {
  const { store } = fresh(); store.save(base(), 'dueno');
  const d = store.load(); d.products.A.price = 1; store.save(d, 'cajero');
  assert.equal(store.load().products.A.price, 1000);
});

test('los PIN se guardan cifrados y nunca en texto simple', () => {
  const { store, auth } = fresh();
  const row = store.db.prepare('SELECT * FROM users').get();
  assert.notEqual(row.hash, '1234'); assert.equal(row.hash.length, 64); assert.ok(!JSON.stringify(row).includes('"1234"'));
  assert.ok(!JSON.stringify(auth.list()).includes('hash'));
  assert.equal(auth.list()[0].weak, true);
});

test('inicio de sesión, bloqueo tras 5 intentos y sesión', () => {
  const { auth } = fresh(), id = auth.list()[0].id;
  assert.equal(auth.login(id, '9999').error, 'PIN incorrecto');
  for (let i = 0; i < 4; i++) auth.login(id, '0000');
  assert.match(auth.login(id, '1234').error, /Demasiados intentos/);
  auth.fails.clear();
  assert.equal(auth.login(id, '1234').user.rol, 'dueno');
  assert.ok(auth.session);
  auth.logout(); assert.equal(auth.session, null);
});

test('administrar usuarios: solo el dueño, PIN válido, y siempre queda un dueño', () => {
  const { auth } = fresh(), owner = auth.list()[0].id;
  assert.match(auth.upsert({ name: 'X', pin: '1234', rol: 'cajero' }).error, /Solo el dueño/);
  auth.login(owner, '1234');
  assert.match(auth.upsert({ name: 'Pedro', pin: '12', rol: 'cajero' }).error, /4 a 8/);
  assert.match(auth.upsert({ name: 'Pedro', rol: 'cajero' }).error, /PIN/);
  assert.equal(auth.upsert({ name: 'Pedro', pin: '4321', rol: 'cajero' }).ok, true);
  const pedro = auth.list().find((u) => u.name === 'Pedro');
  assert.equal(pedro.weak, false);
  assert.match(auth.upsert({ id: owner, name: 'Dueño', rol: 'cajero' }).error, /al menos un dueño/);
  assert.match(auth.remove(owner).error, /propio usuario/);
  assert.equal(auth.upsert({ id: pedro.id, name: 'Pedro R', rol: 'cajero' }).ok, true);   // sin cambiar PIN
  auth.logout(); assert.equal(auth.login(pedro.id, '4321').user.name, 'Pedro R');
  assert.match(auth.remove(owner).error, /Solo el dueño/);
});

test('migración desde datos.json: cifra los PIN y conserva todo', () => {
  const { store, auth } = (() => { const dir = tmp(), store = new Store(path.join(dir, 'd.db')); return { store, auth: new Auth(store.db) }; })();
  const old = { ...base(), users: [{ id: 1, name: 'Dueño', pin: '5555', rol: 'dueno' }, { id: 2, name: 'Caja', pin: '4321', rol: 'cajero' }] };
  migrateFromJson(store, auth, old); auth.seed();
  assert.equal(auth.list().length, 2);
  assert.equal(auth.login(1, '5555').user.rol, 'dueno');
  assert.equal(auth.login(2, '4321').user.rol, 'cajero');
  assert.equal(store.load().products.A.price, 1000);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM users WHERE hash=?').get('5555').n, 0);
});

test('el respaldo es una base válida y completa', () => {
  const { dir, store } = fresh(); store.save(base(), 'dueno');
  const f = path.join(dir, "re'spaldo.db"); store.backup(f);
  const b = new Store(f); assert.equal(b.load().products.A.name, 'Pan'); b.close();
});
