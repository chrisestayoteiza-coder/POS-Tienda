// Usuarios, PIN cifrados (scrypt con sal) y bloqueo tras intentos fallidos.
const crypto = require('crypto');

const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');

class Auth {
  constructor(db) { this.db = db; this.fails = new Map(); this.session = null; }
  seed() { if (!this.db.prepare('SELECT 1 FROM users LIMIT 1').get()) this.create('Dueño', '1234', 'dueno'); }
  create(name, pin, rol, id) {
    const salt = crypto.randomBytes(16).toString('hex'), h = hashPin(pin, salt);
    if (id == null) return Number(this.db.prepare('INSERT INTO users(name,rol,salt,hash) VALUES(?,?,?,?)').run(name, rol, salt, h).lastInsertRowid);
    this.db.prepare('INSERT INTO users(id,name,rol,salt,hash) VALUES(?,?,?,?,?)').run(id, name, rol, salt, h);
    return id;
  }
  verify(u, pin) { return crypto.timingSafeEqual(Buffer.from(hashPin(pin, u.salt), 'hex'), Buffer.from(u.hash, 'hex')); }
  list() { return this.db.prepare('SELECT * FROM users ORDER BY id').all().map((u) => ({ id: u.id, name: u.name, rol: u.rol, weak: this.verify(u, '1234') })); }
  owners() { return this.db.prepare("SELECT COUNT(*) n FROM users WHERE rol='dueno'").get().n; }
  login(id, pin) {
    const f = this.fails.get(id) || { n: 0, until: 0 };
    if (Date.now() < f.until) return { error: 'Demasiados intentos. Espera ' + Math.ceil((f.until - Date.now()) / 1000) + ' segundos' };
    const u = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u || !this.verify(u, pin)) {
      f.n++; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; }
      this.fails.set(id, f);
      return { error: 'PIN incorrecto' };
    }
    this.fails.delete(id);
    this.session = { id: u.id, name: u.name, rol: u.rol };
    return { user: this.session };
  }
  logout() { this.session = null; }
  upsert({ id, name, pin, rol }) {
    if (!this.session || this.session.rol !== 'dueno') return { error: 'Solo el dueño puede administrar usuarios' };
    name = String(name || '').trim();
    if (!name) return { error: 'Escribe un nombre' };
    if (rol !== 'dueno' && rol !== 'cajero') return { error: 'Rol no válido' };
    const has = pin !== undefined && pin !== null && pin !== '';
    if (has && !/^\d{4,8}$/.test(String(pin))) return { error: 'El PIN debe tener de 4 a 8 números' };
    if (id == null) {
      if (!has) return { error: 'Escribe un PIN de 4 a 8 números' };
      this.create(name, String(pin), rol);
      return { ok: true };
    }
    const u = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return { error: 'El usuario no existe' };
    if (u.rol === 'dueno' && rol !== 'dueno' && this.owners() < 2) return { error: 'Debe quedar al menos un dueño' };
    if (has) {
      const salt = crypto.randomBytes(16).toString('hex');
      this.db.prepare('UPDATE users SET name=?,rol=?,salt=?,hash=? WHERE id=?').run(name, rol, salt, hashPin(pin, salt), id);
    } else this.db.prepare('UPDATE users SET name=?,rol=? WHERE id=?').run(name, rol, id);
    if (this.session.id === id) this.session = { id, name, rol };
    return { ok: true, user: { id, name, rol } };
  }
  remove(id) {
    if (!this.session || this.session.rol !== 'dueno') return { error: 'Solo el dueño puede administrar usuarios' };
    if (id === this.session.id) return { error: 'No puedes eliminar tu propio usuario' };
    const u = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return { error: 'El usuario no existe' };
    if (u.rol === 'dueno' && this.owners() < 2) return { error: 'Debe quedar al menos un dueño' };
    this.db.prepare('DELETE FROM users WHERE id=?').run(id);
    return { ok: true };
  }
}

module.exports = { Auth, hashPin };
