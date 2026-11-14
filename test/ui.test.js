// Recorrido completo: pantalla real (jsdom) conectada a la base SQLite y al inicio de sesión reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM } = require('jsdom');
const { Store } = require('../db');
const { Auth } = require('../auth');

const R = path.join(__dirname, '..', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-ui-'));
  const store = new Store(path.join(dir, 'd.db')), auth = new Auth(store.db); auth.seed();
  const html = read('index.html')
    .replace('<link rel="stylesheet" href="styles.css">', () => '')
    .replace('<script src="logic.js"></script>', () => '<script>' + read('logic.js') + '</script>')
    .replace('<script src="app.js"></script>', () => '<script>' + read('app.js') + '</script>');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
      w.api = {
        users: async () => auth.list(), login: async (id, pin) => auth.login(id, pin), logout: async () => auth.logout(),
        saveUser: async (u) => auth.upsert(u), deleteUser: async (id) => auth.remove(id),
        load: async () => store.load(), save: async (d) => store.save(d, auth.session.rol),
        printRaw: async () => 'ok', openExternal() {}, saveXlsx: async () => 'ok'
      };
    }
  });
  const w = dom.window, $ = (id) => w.document.getElementById(id);
  const ev = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true, cancelable: true }));
  const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
  const login = async (name, pin) => {
    [...$('lUser').options].forEach((o, i) => { if (o.textContent === name) $('lUser').selectedIndex = i; });
    $('lPin').value = pin; ev($('lForm'), 'submit'); await wait(80);
  };
  const scan = (c) => { $('scan').value = c; ev($('scanForm'), 'submit'); };
  return { dir, store, auth, w, $, ev, errors, login, scan };
}

test('flujo completo: PIN, venta mixta con cliente, anulación, caja y permisos del cajero', async () => {
  const { store, auth, w, $, ev, errors, login, scan } = boot();
  await wait();
  assert.equal($('login').hidden, false);
  await login('Dueño', '0000'); assert.equal($('lErr').textContent, 'PIN incorrecto'); assert.equal($('login').hidden, false);
  await login('Dueño', '1234'); assert.equal($('login').hidden, true);
  assert.equal(w.document.querySelector('.view.on').id, 'inicio');

  // cliente y venta mixta
  $('cliBtn').click(); $('kNew').click(); $('cRut').value = '1-9'; $('cName').value = 'Ana'; $('cOk3').click();
  scan('7801000000011'); scan('7801000000011'); scan('7801000000035');
  assert.equal($('total').textContent.replace(/\D/g, ''), '3990');
  $('cobrar').click();
  $('pTa').value = '1000'; ev($('pTa'), 'input'); $('pFi').value = '500'; ev($('pFi'), 'input'); $('pEf').value = '3000'; ev($('pEf'), 'input');
  assert.equal($('payOk').disabled, false);
  $('payOk').click(); await wait();
  let db = store.load(), sale = db.sales[0];
  assert.deepEqual(sale.pagos, { Efectivo: 2490, Tarjeta: 1000, Fiado: 500 });
  assert.equal(sale.recibido, 3000);
  assert.equal(db.products['7801000000011'].stock, 22);
  assert.equal(db.clients['1-9'].debt, 500);
  assert.equal(db.clients['1-9'].points, 3);

  // anular devuelve stock, deuda y puntos
  w.document.querySelector('nav [data-tab=historial]').click();
  $('histBody').querySelector('[data-a=anu]').click(); $('cOk').click(); await wait();
  db = store.load();
  assert.equal(db.sales[0].anulada, true);
  assert.equal(db.products['7801000000011'].stock, 24);
  assert.deepEqual([db.clients['1-9'].debt, db.clients['1-9'].points], [0, 0]);
  assert.ok(db.audit.some((a) => a.a === 'Venta anulada'));

  // PIN no se puede ver ni guardar en la base en texto simple
  $('uName').value = 'Pedro'; $('uPin').value = '4321'; $('uRol').value = 'cajero'; $('uSave').click(); await wait(100);
  assert.ok(auth.list().some((u) => u.name === 'Pedro'));
  assert.equal(JSON.stringify(auth.list()).includes('4321'), false);

  // cajero: ve solo lo suyo, puede vender, y su venta queda guardada
  $('logout').click(); await wait();
  await login('Pedro', '4321');
  assert.equal(w.document.querySelector('.view.on').id, 'venta');
  assert.deepEqual([...w.document.querySelectorAll('nav [data-tab]')].filter((b) => !b.hidden).map((b) => b.dataset.tab), ['venta', 'clientes', 'caja']);
  scan('7801000000028'); $('cobrar').click(); $('payOk').click(); await wait();
  db = store.load();
  assert.equal(db.sales[0].user, 'Pedro'); assert.equal(db.products['7801000000028'].stock, 11);

  // un cajero que intente guardar un cambio de precio desde la pantalla es rechazado por la base
  const r = await w.api.save(Object.assign(store.load(), { config: { nombre: 'Hackeado' } }));
  assert.match(r, /configuración/);
  assert.notEqual(store.load().config && store.load().config.nombre, 'Hackeado');
  assert.deepEqual(errors, []);
  w.close();
});
