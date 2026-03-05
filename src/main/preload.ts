import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("arcane", {
  file: {
    save: (filePath: string, content: string) =>
      ipcRenderer.invoke("file:save", { filePath, content }),
    saveDialog: (content: string) =>
      ipcRenderer.invoke("file:save-dialog", content),
    openDialog: () => ipcRenderer.invoke("file:open-dialog"),
  },

  arcc: {
    runScript: (scriptContent: string) =>
      ipcRenderer.invoke("arcc:run-script", { scriptContent }),
  },

  repl: {
    start: () => ipcRenderer.invoke("repl:start"),
    send: (input: string) => ipcRenderer.invoke("repl:send", input),
    stop: () => ipcRenderer.invoke("repl:stop"),
    onStdout: (cb: (data: string) => void) => {
      ipcRenderer.on("repl:stdout", (_e, data) => cb(data));
    },
    onStderr: (cb: (data: string) => void) => {
      ipcRenderer.on("repl:stderr", (_e, data) => cb(data));
    },
    onClosed: (cb: (info: { code: number }) => void) => {
      ipcRenderer.on("repl:closed", (_e, info) => cb(info));
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("repl:stdout");
      ipcRenderer.removeAllListeners("repl:stderr");
      ipcRenderer.removeAllListeners("repl:closed");
    },
  },
  server: {
    start: (opts: { bind?: string; logLevel?: string }) =>
      ipcRenderer.invoke("server:start", opts),
    stop: () => ipcRenderer.invoke("server:stop"),
    status: () => ipcRenderer.invoke("server:status"),
    onStdout: (cb: (data: string) => void) => {
      ipcRenderer.on("server:stdout", (_e, data) => cb(data));
    },
    onStderr: (cb: (data: string) => void) => {
      ipcRenderer.on("server:stderr", (_e, data) => cb(data));
    },
    onStopped: (cb: (info: { code: number }) => void) => {
      ipcRenderer.on("server:stopped", (_e, info) => cb(info));
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("server:stdout");
      ipcRenderer.removeAllListeners("server:stderr");
      ipcRenderer.removeAllListeners("server:stopped");
    },
  },
  arcana: {
    list: () => ipcRenderer.invoke("arcana:list"),
    add: (username: string, password: string) =>
      ipcRenderer.invoke("arcana:add", { username, password }),
    remove: (username: string) => ipcRenderer.invoke("arcana:remove", username),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (s: { binaryDir?: string; dataDir?: string }) =>
      ipcRenderer.invoke("settings:set", s),
    browseDir: () => ipcRenderer.invoke("settings:browse-dir"),
  },
  onMenuEvent: (event: string, cb: (data?: any) => void) => {
    ipcRenderer.on(event, (_e, data) => cb(data));
  },
});
