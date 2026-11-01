const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  revealSelf: () => ipcRenderer.invoke('reveal-self'),
  whoAmI: () => ipcRenderer.invoke('who'),
  checkFDA: () => ipcRenderer.invoke('fda:check'),
  openFDASettings: () => ipcRenderer.invoke('fda:open'),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  browse: (d) => ipcRenderer.invoke('browse:list', d),
  claudeCheck: () => ipcRenderer.invoke('claude:check'),
  openUrl: (u) => ipcRenderer.invoke('open:url', u),
  cached: () => ipcRenderer.invoke('scan:cached'),
  aiRun: (o) => ipcRenderer.invoke('ai:run', o),
  aiCancel: () => ipcRenderer.invoke('ai:cancel'),
  onAiProgress: (cb) => ipcRenderer.on('ai:progress', (_e, m) => cb(m)),
  disk: () => ipcRenderer.invoke('disk:info'),
  onItem: (cb) => ipcRenderer.on('scan:item', (_e, it) => cb(it)),
  scan: (opts) => ipcRenderer.invoke('scan:run', opts),
  onProgress: (cb) => ipcRenderer.on('scan:progress', (_e, msg) => cb(msg)),
  prepare: (items) => ipcRenderer.invoke('clean:prepare', items),
  execute: (payload) => ipcRenderer.invoke('clean:execute', payload),
  onExecProgress: (cb) => ipcRenderer.on('clean:progress', (_e, msg) => cb(msg)),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
});
