const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  users: call('auth:users'),
  login: call('auth:login'),
  logout: call('auth:logout'),
  saveUser: call('auth:saveUser'),
  deleteUser: call('auth:deleteUser'),
  load: call('data:load'),
  save: call('data:save'),
  printRaw: call('print:raw'),
  openExternal: call('open:external'),
  saveXlsx: call('save:xlsx')
});
