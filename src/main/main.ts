import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";
import * as os from "os";

let mainWindow: BrowserWindow | null = null;
let activeRepl: child_process.ChildProcessWithoutNullStreams | null = null;
let serverProcess: child_process.ChildProcessWithoutNullStreams | null = null;

const WORKBENCH_CONFIG_DIR = path.join(os.homedir(), ".arcane-workbench");
const WORKBENCH_CONFIG_FILE = path.join(WORKBENCH_CONFIG_DIR, "config.json");

interface WorkbenchConfig {
  binaryDir: string;
  dataDir: string;
}

let binaryDir: string =
  process.env.ARCANE_BIN_DIR || path.join(os.homedir(), ".arcane", "bin");
let dataDir: string =
  process.env.ARCANE_DATA_DIR || path.join(os.homedir(), ".arcane", "data");

function ensureConfigDir(): void {
  if (!fs.existsSync(WORKBENCH_CONFIG_DIR)) {
    fs.mkdirSync(WORKBENCH_CONFIG_DIR, { recursive: true });
  }
}

function loadConfig(): void {
  ensureConfigDir();
  
  if (fs.existsSync(WORKBENCH_CONFIG_FILE)) {
    try {
      const configData = fs.readFileSync(WORKBENCH_CONFIG_FILE, "utf-8");
      const config: WorkbenchConfig = JSON.parse(configData);
      
      if (config.binaryDir) binaryDir = config.binaryDir;
      if (config.dataDir) dataDir = config.dataDir;
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  }
}

function saveConfig(): void {
  ensureConfigDir();
  
  const config: WorkbenchConfig = {
    binaryDir,
    dataDir,
  };
  
  try {
    fs.writeFileSync(WORKBENCH_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save config:", err);
  }
}

function binaryPath(name: string): string {
  return path.join(binaryDir, name);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d0f14",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    frame: process.platform !== "darwin",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: true,
    },
    icon: path.join(__dirname, "../../assets/icon.png"),
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    killRepl();
    killServer();
  });

  buildMenu();
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New Script",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("menu:new-script"),
        },
        {
          label: "Open Script…",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              filters: [
                { name: "ArcaneDB Query Language", extensions: ["aql"] },
                { name: "All Files", extensions: ["*"] },
              ],
              properties: ["openFile"],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const content = fs.readFileSync(result.filePaths[0], "utf-8");
              mainWindow?.webContents.send("menu:open-script", {
                path: result.filePaths[0],
                content,
              });
            }
          },
        },
        {
          label: "Save Script",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow?.webContents.send("menu:save-script"),
        },
        {
          label: "Save Script As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => mainWindow?.webContents.send("menu:save-script-as"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Run",
      submenu: [
        {
          label: "Run Script",
          accelerator: "F5",
          click: () => mainWindow?.webContents.send("menu:run-script"),
        },
        {
          label: "Run Selected",
          accelerator: "CmdOrCtrl+Enter",
          click: () => mainWindow?.webContents.send("menu:run-selection"),
        },
        { type: "separator" },
        {
          label: "Start Server",
          click: () => mainWindow?.webContents.send("menu:start-server"),
        },
        {
          label: "Stop Server",
          click: () => mainWindow?.webContents.send("menu:stop-server"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "Bucket Graph",
          accelerator: "CmdOrCtrl+G",
          click: () => mainWindow?.webContents.send("menu:show-graph"),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "ArcaneDB Documentation",
          click: () =>
            shell.openExternal("https://arcanedb.pages.dev/docs/output"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle(
  "file:save",
  async (
    _event,
    { filePath, content }: { filePath: string; content: string },
  ) => {
    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true };
  },
);

ipcMain.handle("file:save-dialog", async (_event, content: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: "ArcaneDB Query Language", extensions: ["aql"] },
      { name: "All Files", extensions: ["*"] },
    ],
    defaultPath: "script.aql",
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, "utf-8");
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});

ipcMain.handle("file:open-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [
      { name: "ArcaneDB Query Language", extensions: ["aql"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const content = fs.readFileSync(result.filePaths[0], "utf-8");
    return { success: true, filePath: result.filePaths[0], content };
  }
  return { success: false };
});

ipcMain.handle(
  "arcc:run-script",
  async (
    _event,
    { scriptContent, tempFile }: { scriptContent: string; tempFile?: string },
  ) => {
    return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const tmpPath =
          tempFile || path.join(os.tmpdir(), `arcane_${Date.now()}.aql`);
        fs.writeFileSync(tmpPath, scriptContent, "utf-8");

        const arcc = binaryPath("arcc");
        const proc = child_process.spawn(
          arcc,
          ["run", tmpPath, "-d", dataDir],
          {
            env: { ...process.env },
          },
        );

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });
        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (!tempFile) {
            try {
              fs.unlinkSync(tmpPath);
            } catch {}
          }
          resolve({ stdout, stderr, exitCode: code ?? 0 });
        });

        proc.on("error", (err) => {
          resolve({
            stdout: "",
            stderr: `Failed to launch arcc: ${err.message}\n\nEnsure the binary directory is correctly configured in Settings.\nExpected path: ${arcc}`,
            exitCode: 1,
          });
        });
      },
    );
  },
);

function killRepl(): void {
  if (activeRepl) {
    activeRepl.kill();
    activeRepl = null;
  }
}

ipcMain.handle("repl:start", async () => {
  killRepl();
  const arcc = binaryPath("arcc");
  try {
    activeRepl = child_process.spawn(arcc, ["repl", "-d", dataDir], {
      env: { ...process.env },
    });

    activeRepl.stdout.on("data", (data) => {
      mainWindow?.webContents.send("repl:stdout", data.toString());
    });
    activeRepl.stderr.on("data", (data) => {
      mainWindow?.webContents.send("repl:stderr", data.toString());
    });
    activeRepl.on("close", (code) => {
      mainWindow?.webContents.send("repl:closed", { code });
      activeRepl = null;
    });
    activeRepl.on("error", (err) => {
      mainWindow?.webContents.send(
        "repl:stderr",
        `Failed to launch arcc repl: ${err.message}\nExpected path: ${arcc}`,
      );
      activeRepl = null;
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("repl:send", async (_event, input: string) => {
  if (activeRepl && !activeRepl.killed) {
    activeRepl.stdin.write(input + "\n");
    return { success: true };
  }
  return { success: false, error: "REPL not running" };
});

ipcMain.handle("repl:stop", async () => {
  killRepl();
  return { success: true };
});

function killServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

ipcMain.handle(
  "server:start",
  async (_event, opts: { bind?: string; logLevel?: string }) => {
    killServer();
    const arcaned = binaryPath("arcaned");
    const args = ["-d", dataDir];
    if (opts.bind) args.push("-b", opts.bind);
    if (opts.logLevel) args.push("-l", opts.logLevel);

    try {
      serverProcess = child_process.spawn(arcaned, args, {
        env: { ...process.env },
      });

      serverProcess.stdout.on("data", (data) => {
        mainWindow?.webContents.send("server:stdout", data.toString());
      });
      serverProcess.stderr.on("data", (data) => {
        mainWindow?.webContents.send("server:stderr", data.toString());
      });
      serverProcess.on("close", (code) => {
        mainWindow?.webContents.send("server:stopped", { code });
        serverProcess = null;
      });
      serverProcess.on("error", (err) => {
        mainWindow?.webContents.send(
          "server:stderr",
          `Failed to launch arcaned: ${err.message}\nExpected path: ${arcaned}`,
        );
        serverProcess = null;
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
);

ipcMain.handle("server:stop", async () => {
  killServer();
  return { success: true };
});

ipcMain.handle("server:status", async () => {
  return { running: serverProcess !== null && !serverProcess.killed };
});

ipcMain.handle("arcana:list", async () => {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
    (resolve) => {
      const arcana = binaryPath("arcana");
      const proc = child_process.spawn(arcana, ["-d", dataDir, "list"]);
      let stdout = "",
        stderr = "";
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", (code) =>
        resolve({ stdout, stderr, exitCode: code ?? 0 }),
      );
      proc.on("error", (err) =>
        resolve({ stdout: "", stderr: err.message, exitCode: 1 }),
      );
    },
  );
});

ipcMain.handle(
  "arcana:add",
  async (
    _event,
    { username, password }: { username: string; password: string },
  ) => {
    return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const arcana = binaryPath("arcana");
        const proc = child_process.spawn(arcana, [
          "-d",
          dataDir,
          "add",
          username,
        ]);
        let stdout = "",
          stderr = "";
        proc.stdout.on("data", (d) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        proc.stdin.write(password + "\n");
        proc.stdin.end();
        proc.on("close", (code) =>
          resolve({ stdout, stderr, exitCode: code ?? 0 }),
        );
        proc.on("error", (err) =>
          resolve({ stdout: "", stderr: err.message, exitCode: 1 }),
        );
      },
    );
  },
);

ipcMain.handle("arcana:remove", async (_event, username: string) => {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
    (resolve) => {
      const arcana = binaryPath("arcana");
      const proc = child_process.spawn(arcana, [
        "-d",
        dataDir,
        "remove",
        username,
      ]);
      let stdout = "",
        stderr = "";
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", (code) =>
        resolve({ stdout, stderr, exitCode: code ?? 0 }),
      );
      proc.on("error", (err) =>
        resolve({ stdout: "", stderr: err.message, exitCode: 1 }),
      );
    },
  );
});

ipcMain.handle("settings:get", async () => {
  return { binaryDir, dataDir };
});

ipcMain.handle(
  "settings:set",
  async (_event, settings: { binaryDir?: string; dataDir?: string }) => {
    if (settings.binaryDir) binaryDir = settings.binaryDir;
    if (settings.dataDir) dataDir = settings.dataDir;
    saveConfig();
    return { success: true };
  },
);

ipcMain.handle("settings:browse-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return { path: result.filePaths[0] };
  }
  return { path: null };
});

app.whenReady().then(() => {
  loadConfig();
  createWindow();
});

app.on("window-all-closed", () => {
  killRepl();
  killServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
