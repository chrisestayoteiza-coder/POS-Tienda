// Almacenamiento en SQLite (módulo node:sqlite, incluido en Electron: no requiere compilar nada).
// Cada registro (producto, venta, cliente...) es una fila; al guardar solo se escriben las filas que cambiaron.
const { DatabaseSync } = require('node:sqlite');

const KINDS = { products: 'obj', clients: 'obj', proveedores: 'obj', sales: 'arr', held: 'arr', compras: 'arr', gastos: 'arr' };
const META = ['config', 'caja', 'audit', 'ajustes'];

// Lo único que puede tocar un cajero: ventas nuevas, ventas en espera, clientes, caja, auditoría y el stock de productos.
function checkCajero(changes, metaChanges) {
  for (const c of changes) {
    if (c.k === 'products') {
      if (c.old == null || c.j == null) return 'sin permiso para crear o borrar productos';
      const a = JSON.parse(c.old), b = JSON.parse(c.j);
      delete a.stock; delete b.stock;
      if (JSON.stringify(a) !== JSON.stringify(b)) return 'sin permiso para editar productos';
    } else if (c.k === 'sales') {
      if (c.old != null) return 'sin permiso para modificar ventas ya registradas';
    } else if (c.k === 'clients') {
      if (c.j == null) return 'sin permiso para borrar clientes';
    } else if (c.k !== 'held') return 'sin permiso para modificar ' + c.k;
  }
  for (const m of metaChanges) {
    if (m.m === 'config') return 'sin permiso para cambiar la configuración';
    if (m.m === 'ajustes') return 'sin permiso para ajustar inventario';
    if (m.m === 'audit' && m.old) {
      const o = JSON.parse(m.old), n = JSON.parse(m.j);
      if (o.length < 500 && JSON.stringify(n.slice(n.length - o.length)) !== JSON.stringify(o)) return 'la auditoría solo admite nuevos registros';
    }
  }
  return null;
}

class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS docs(kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, rol TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);`);
    this.cache = {};
  }
  isEmpty() {
    return !this.db.prepare('SELECT 1 FROM docs LIMIT 1').get() && !this.db.prepare('SELECT 1 FROM meta LIMIT 1').get();
  }
  load() {
    if (this.isEmpty()) return null;
    const out = {};
    for (const [k, t] of Object.entries(KINDS)) {
      const rows = this.db.prepare('SELECT id,json FROM docs WHERE kind=? ORDER BY rowid').all(k);
      this.cache[k] = new Map(rows.map((r) => [r.id, r.json]));
      if (t === 'obj') { out[k] = {}; rows.forEach((r) => { out[k][r.id] = JSON.parse(r.json); }); }
      else {
        out[k] = rows.map((r) => JSON.parse(r.json));
        out[k].sort((a, b) => (k === 'held' ? a.id - b.id : b.id - a.id));
      }
    }
    for (const m of META) {
      const r = this.db.prepare('SELECT json FROM meta WHERE key=?').get(m);
      this.cache[m] = r ? r.json : null;
      if (r) out[m] = JSON.parse(r.json);
    }
    return out;
  }
  // Devuelve true si guardó, o un texto con el motivo si lo rechazó.
  save(data, role) {
    if (!data || typeof data !== 'object') return 'datos no válidos';
    const ch = [], mch = [];
    for (const [k, t] of Object.entries(KINDS)) {
      const src = data[k];
      if (src == null) continue;
      const entries = t === 'obj' ? Object.entries(src) : src.map((x) => [String(x.id), x]);
      const next = new Map(entries.map(([id, v]) => [id, JSON.stringify(v)]));
      const prev = this.cache[k] || new Map();
      for (const [id, j] of next) if (prev.get(id) !== j) ch.push({ k, id, j, old: prev.get(id) });
      for (const [id, old] of prev) if (!next.has(id)) ch.push({ k, id, j: null, old });
    }
    for (const m of META) {
      if (data[m] === undefined) continue;
      const j = JSON.stringify(data[m]);
      if (j !== this.cache[m]) mch.push({ m, j, old: this.cache[m] });
    }
    if (!ch.length && !mch.length) return true;
    if (role !== 'dueno') { const err = checkCajero(ch, mch); if (err) return err; }
    const up = this.db.prepare('INSERT INTO docs(kind,id,json) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json');
    const del = this.db.prepare('DELETE FROM docs WHERE kind=? AND id=?');
    const mup = this.db.prepare('INSERT INTO meta(key,json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      ch.forEach((c) => (c.j == null ? del.run(c.k, c.id) : up.run(c.k, c.id, c.j)));
      mch.forEach((m) => mup.run(m.m, m.j));
      this.db.exec('COMMIT');
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch (_) { /* nada */ }
      return 'error de base de datos: ' + e.message;
    }
    ch.forEach((c) => { const m = this.cache[c.k] || (this.cache[c.k] = new Map()); if (c.j == null) m.delete(c.id); else m.set(c.id, c.j); });
    mch.forEach((m) => { this.cache[m.m] = m.j; });
    return true;
  }
  backup(file) { this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); }
  close() { this.db.close(); }
}

// Pasa los datos del archivo datos.json de versiones anteriores a la base, cifrando los PIN.
function migrateFromJson(store, auth, old) {
  const { users, ...data } = old;
  const r = store.save(data, 'dueno');
  if (r !== true) throw new Error(r);
  (users || []).forEach((u) => auth.create(u.name, String(u.pin || '1234'), u.rol === 'dueno' ? 'dueno' : 'cajero', u.id));
}

module.exports = { Store, migrateFromJson, checkCajero };
