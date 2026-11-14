const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { execFile } = require('child_process');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { Store, migrateFromJson } = require('./db');
const { Auth } = require('./auth');

let store, auth, lastBackupDay = '';

function init() {
  const dir = app.getPath('userData');
  store = new Store(path.join(dir, 'datos.db'));
  auth = new Auth(store.db);
  const legacy = path.join(dir, 'datos.json');
  if (store.isEmpty() && fs.existsSync(legacy)) {
    try {
      migrateFromJson(store, auth, JSON.parse(fs.readFileSync(legacy, 'utf8')));
      fs.renameSync(legacy, legacy + '.migrado');
    } catch (e) { console.error('No se pudo migrar datos.json:', e.message); }
  }
  auth.seed();
}

// Una copia consistente de la base por día; se conservan las últimas 14.
function dailyBackup() {
  const day = new Date().toISOString().slice(0, 10);
  if (day === lastBackupDay) return;
  try {
    const dir = path.join(app.getPath('userData'), 'respaldos');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `datos-${day}.db`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    store.backup(file);
    fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().slice(0, -14).forEach((f) => fs.unlinkSync(path.join(dir, f)));
    lastBackupDay = day;
  } catch (e) { console.error('Respaldo falló:', e.message); }
}

const need = () => (auth.session ? null : 'inicia sesión primero');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('auth:users', () => auth.list());
ipcMain.handle('auth:login', (_e, id, pin) => auth.login(Number(id), String(pin)));
ipcMain.handle('auth:logout', () => { auth.logout(); });
ipcMain.handle('auth:saveUser', (_e, u) => auth.upsert(u));
ipcMain.handle('auth:deleteUser', (_e, id) => auth.remove(Number(id)));

ipcMain.handle('data:load', () => { const e = need(); if (e) throw new Error(e); return store.load(); });
ipcMain.handle('data:save', (_e, data) => {
  const e = need(); if (e) return e;
  const r = store.save(data, auth.session.rol);
  if (r === true) dailyBackup();
  return r;
});

// Envía bytes ESC/POS a una impresora compartida de Windows (y abre el cajón).
ipcMain.handle('print:raw', (_e, printer, b64) => new Promise((resolve) => {
  if (need()) return resolve(need());
  if (process.platform !== 'win32') return resolve('solo disponible en Windows');
  if (!/^[\w.-]{1,60}$/.test(printer)) return resolve('el nombre compartido no es válido (sin espacios)');
  const f = path.join(app.getPath('temp'), 'pos-ticket.bin');
  try { fs.writeFileSync(f, Buffer.from(b64, 'base64')); } catch (e) { return resolve(e.message); }
  execFile('cmd.exe', ['/c', 'copy', '/b', f, '\\\\localhost\\' + printer], { windowsHide: true },
    (err) => resolve(err ? 'no se pudo enviar; revisa que la impresora esté compartida con ese nombre' : 'ok'));
}));

ipcMain.handle('open:external', (_e, url) => { if (!need() && /^https:\/\/wa\.me\//.test(url)) shell.openExternal(url); });

ipcMain.handle('save:xlsx', async (_e, name, sheets) => {
  if (need()) return need();
  const r = await dialog.showSaveDialog({ defaultPath: name, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (r.canceled || !r.filePath) return 'cancelado';
  try {
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31)));
    XLSX.writeFile(wb, r.filePath);
    return 'ok';
  } catch (err) { return err.message; }
});

app.whenReady().then(() => { init(); createWindow(); });
app.on('before-quit', () => { try { store && store.close(); } catch (_) { /* nada */ } });
app.on('window-all-closed', () => app.quit());
