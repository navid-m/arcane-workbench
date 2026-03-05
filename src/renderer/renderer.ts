// Monaco is loaded via the AMD require() loader in index.html before this
// bundle is injected.
//
// Importing the npm package directly would cause a "synchronous require cannot resolve module"
// error because esbuild emits a CommonJS require() call that conflicts with the AMD loader.
//
// We import only the TYPE (erased at compile time) and declare the global
// that the AMD loader populates at runtime.

import type * as MonacoType from "monaco-editor";
declare const monaco: typeof MonacoType;

import {
  registerAqlLanguage,
  registerAqlTheme,
  AQL_LANGUAGE_ID,
} from "./aql-language";

declare global {
  interface Window {
    arcane: {
      file: {
        save(fp: string, content: string): Promise<{ success: boolean }>;
        saveDialog(
          content: string,
        ): Promise<{ success: boolean; filePath?: string }>;
        openDialog(): Promise<{
          success: boolean;
          filePath?: string;
          content?: string;
        }>;
      };
      arcc: {
        runScript(
          content: string,
        ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
      };
      repl: {
        start(): Promise<{ success: boolean }>;
        send(input: string): Promise<{ success: boolean }>;
        stop(): Promise<{ success: boolean }>;
        onStdout(cb: (data: string) => void): void;
        onStderr(cb: (data: string) => void): void;
        onClosed(cb: (info: { code: number }) => void): void;
        removeListeners(): void;
      };
      server: {
        start(opts: {
          bind?: string;
          logLevel?: string;
        }): Promise<{ success: boolean }>;
        stop(): Promise<{ success: boolean }>;
        status(): Promise<{ running: boolean }>;
        onStdout(cb: (data: string) => void): void;
        onStderr(cb: (data: string) => void): void;
        onStopped(cb: (info: { code: number }) => void): void;
        removeListeners(): void;
      };
      arcana: {
        list(): Promise<{ stdout: string; stderr: string; exitCode: number }>;
        add(
          u: string,
          p: string,
        ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
        remove(
          u: string,
        ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
      };
      settings: {
        get(): Promise<{ binaryDir: string; dataDir: string }>;
        set(s: {
          binaryDir?: string;
          dataDir?: string;
        }): Promise<{ success: boolean }>;
        browseDir(): Promise<{ path: string | null }>;
      };
      onMenuEvent(event: string, cb: (data?: any) => void): void;
    };
  }
}

interface AppState {
  currentFilePath: string | null;
  isDirty: boolean;
  activePanel: "editor" | "repl" | "server" | "users" | "settings";
  serverRunning: boolean;
  replRunning: boolean;
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
}

const state: AppState = {
  currentFilePath: null,
  isDirty: false,
  activePanel: "editor",
  serverRunning: false,
  replRunning: false,
  editorInstance: null,
};

(self as any).MonacoEnvironment = {
  getWorkerUrl(_moduleId: string, label: string): string {
    return "";
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appendToOutput(
  el: HTMLElement,
  text: string,
  type: "stdout" | "stderr" | "info" | "success" | "system" = "stdout",
): void {
  const line = document.createElement("div");
  line.className = `output-line output-${type}`;
  line.textContent = text;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function setTitle(dirty: boolean, filePath: string | null): void {
  const name = filePath ? filePath.split(/[\\/]/).pop() : "untitled.aql";
  document.title = `${dirty ? "● " : ""}${name} — ArcaneDB Workbench`;
  const titleEl = document.getElementById("title-filename");
  if (titleEl)
    titleEl.textContent = (dirty ? "● " : "") + (name || "untitled.aql");
}

function updateServerBadge(running: boolean): void {
  const badge = document.getElementById("server-badge");
  if (!badge) return;
  badge.className = `server-badge ${running ? "running" : "stopped"}`;
  badge.textContent = running ? "Server: Running" : "Server: Stopped";
}

function showPanel(name: AppState["activePanel"]): void {
  state.activePanel = name;
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  const panel = document.getElementById(`panel-${name}`);
  const nav = document.getElementById(`nav-${name}`);
  if (panel) panel.classList.add("active");
  if (nav) nav.classList.add("active");
  if (name === "editor" && state.editorInstance) {
    state.editorInstance.layout();
  }
}

function initEditor(): void {
  registerAqlLanguage(monaco);
  registerAqlTheme(monaco);

  const container = document.getElementById("monaco-container")!;

  const defaultScript = `# Welcome to ArcaneDB Workbench
# Press F5 or click Run to execute this script.

create forced unique bucket Demo (
    name:  string,
    value: float,
    active: bool
);

insert into Demo (name: "Alpha", value: 42.0, active: true);
insert into Demo (name: "Beta",  value: 17.5, active: false);
insert into Demo (name: "Gamma", value: 99.9, active: true);

commit!;

get * from Demo;
get * from Demo where active = true order by value desc;

get avg(value), min(value), max(value) from Demo;

describe Demo;
show buckets;
`;

  state.editorInstance = monaco.editor.create(container, {
    value: defaultScript,
    language: AQL_LANGUAGE_ID,
    theme: "arcane-dark",
    fontSize: 14,
    fontFamily:
      '"JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", monospace',
    fontLigatures: true,
    lineHeight: 22,
    letterSpacing: 0.3,
    minimap: { enabled: true, scale: 1 },
    scrollBeyondLastLine: false,
    renderLineHighlight: "all",
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on",
    smoothScrolling: true,
    formatOnPaste: false,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: "off",
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    suggest: {
      showKeywords: true,
      showSnippets: true,
    },
    padding: { top: 16, bottom: 16 },
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
  });

  state.editorInstance.onDidChangeModelContent(() => {
    if (!state.isDirty) {
      state.isDirty = true;
      setTitle(true, state.currentFilePath);
    }
  });
  state.editorInstance.addCommand(monaco.KeyCode.F5, () => runScript());
  state.editorInstance.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
    () => runSelection(),
  );

  window.addEventListener("resize", () => state.editorInstance?.layout());
}

async function runScript(): Promise<void> {
  const content = state.editorInstance?.getValue() ?? "";
  await executeAql(content);
}

async function runSelection(): Promise<void> {
  const editor = state.editorInstance;
  if (!editor) return;
  const selection = editor.getSelection();
  if (!selection || selection.isEmpty()) {
    await runScript();
    return;
  }
  const selectedText = editor.getModel()?.getValueInRange(selection) ?? "";
  if (selectedText.trim()) {
    await executeAql(selectedText);
  }
}

async function executeAql(content: string): Promise<void> {
  const outputEl = document.getElementById("output-content")!;
  const runBtn = document.getElementById("btn-run") as HTMLButtonElement;
  const spinner = document.getElementById("run-spinner")!;

  runBtn.disabled = true;
  spinner.style.display = "inline-block";
  outputEl.innerHTML = "";
  appendToOutput(
    outputEl,
    "── Executing script ──────────────────────",
    "system",
  );

  try {
    const result = await window.arcane.arcc.runScript(content);

    if (result.stdout) {
      result.stdout.split("\n").forEach((line) => {
        if (line) appendToOutput(outputEl, line, "stdout");
      });
    }
    if (result.stderr) {
      result.stderr.split("\n").forEach((line) => {
        if (line) appendToOutput(outputEl, line, "stderr");
      });
    }

    const exitClass = result.exitCode === 0 ? "success" : "stderr";
    appendToOutput(
      outputEl,
      `── Exit code: ${result.exitCode} ────────────────────────`,
      exitClass,
    );
  } catch (err: any) {
    appendToOutput(outputEl, `Error: ${err.message}`, "stderr");
  } finally {
    runBtn.disabled = false;
    spinner.style.display = "none";
  }
}

async function newScript(): Promise<void> {
  if (state.isDirty) {
    if (!confirm("Discard unsaved changes?")) return;
  }
  state.editorInstance?.setValue("");
  state.currentFilePath = null;
  state.isDirty = false;
  setTitle(false, null);
}

async function openScript(filePath?: string, content?: string): Promise<void> {
  if (filePath && content !== undefined) {
    state.editorInstance?.setValue(content);
    state.currentFilePath = filePath;
    state.isDirty = false;
    setTitle(false, filePath);
    return;
  }
  const result = await window.arcane.file.openDialog();
  if (result.success && result.filePath && result.content !== undefined) {
    state.editorInstance?.setValue(result.content);
    state.currentFilePath = result.filePath;
    state.isDirty = false;
    setTitle(false, result.filePath);
  }
}

async function saveScript(): Promise<void> {
  if (!state.currentFilePath) {
    await saveScriptAs();
    return;
  }
  const content = state.editorInstance?.getValue() ?? "";
  await window.arcane.file.save(state.currentFilePath, content);
  state.isDirty = false;
  setTitle(false, state.currentFilePath);
}

async function saveScriptAs(): Promise<void> {
  const content = state.editorInstance?.getValue() ?? "";
  const result = await window.arcane.file.saveDialog(content);
  if (result.success && result.filePath) {
    state.currentFilePath = result.filePath;
    state.isDirty = false;
    setTitle(false, result.filePath);
  }
}

function initRepl(): void {
  const replOutput = document.getElementById("repl-output")!;
  const replInput = document.getElementById("repl-input") as HTMLInputElement;
  const startBtn = document.getElementById(
    "btn-repl-start",
  ) as HTMLButtonElement;
  const stopBtn = document.getElementById("btn-repl-stop") as HTMLButtonElement;
  const clearBtn = document.getElementById(
    "btn-repl-clear",
  ) as HTMLButtonElement;

  const history: string[] = [];
  let historyIndex = -1;

  window.arcane.repl.onStdout((data) => {
    data.split("\n").forEach((line) => {
      if (line) appendToOutput(replOutput, line, "stdout");
    });
  });
  window.arcane.repl.onStderr((data) => {
    data.split("\n").forEach((line) => {
      if (line) appendToOutput(replOutput, line, "stderr");
    });
  });
  window.arcane.repl.onClosed((info) => {
    appendToOutput(
      replOutput,
      `── REPL exited (code ${info.code}) ──`,
      "system",
    );
    state.replRunning = false;
    updateReplControls();
  });

  startBtn.addEventListener("click", async () => {
    appendToOutput(replOutput, "── Starting REPL ──", "system");
    const res = await window.arcane.repl.start();
    if (res.success) {
      state.replRunning = true;
      appendToOutput(
        replOutput,
        "── REPL ready. Type AQL statements and press Enter. ──",
        "info",
      );
    } else {
      appendToOutput(replOutput, "── Failed to start REPL ──", "stderr");
    }
    updateReplControls();
  });

  stopBtn.addEventListener("click", async () => {
    await window.arcane.repl.stop();
    state.replRunning = false;
    appendToOutput(replOutput, "── REPL stopped ──", "system");
    updateReplControls();
  });

  clearBtn.addEventListener("click", () => {
    replOutput.innerHTML = "";
  });

  replInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const input = replInput.value.trim();
      if (!input) return;
      history.unshift(input);
      historyIndex = -1;
      appendToOutput(replOutput, `> ${input}`, "info");
      replInput.value = "";
      await window.arcane.repl.send(input);
    } else if (e.key === "ArrowUp") {
      historyIndex = Math.min(historyIndex + 1, history.length - 1);
      replInput.value = history[historyIndex] ?? "";
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      historyIndex = Math.max(historyIndex - 1, -1);
      replInput.value = historyIndex >= 0 ? (history[historyIndex] ?? "") : "";
      e.preventDefault();
    }
  });

  function updateReplControls(): void {
    startBtn.disabled = state.replRunning;
    stopBtn.disabled = !state.replRunning;
    replInput.disabled = !state.replRunning;
    replInput.placeholder = state.replRunning
      ? "Type an AQL statement and press Enter…"
      : "Start the REPL to enter statements…";
  }

  updateReplControls();
}

function initServer(): void {
  const serverOutput = document.getElementById("server-output")!;
  const startBtn = document.getElementById(
    "btn-server-start",
  ) as HTMLButtonElement;
  const stopBtn = document.getElementById(
    "btn-server-stop",
  ) as HTMLButtonElement;
  const bindInput = document.getElementById("server-bind") as HTMLInputElement;
  const logSelect = document.getElementById("server-log") as HTMLSelectElement;

  window.arcane.server.onStdout((data) => {
    data.split("\n").forEach((line) => {
      if (line) appendToOutput(serverOutput, line, "stdout");
    });
  });
  window.arcane.server.onStderr((data) => {
    data.split("\n").forEach((line) => {
      if (line) appendToOutput(serverOutput, line, "stderr");
    });
  });
  window.arcane.server.onStopped((info) => {
    appendToOutput(
      serverOutput,
      `── Server stopped (code ${info.code}) ──`,
      "system",
    );
    state.serverRunning = false;
    updateServerBadge(false);
    updateServerControls();
  });

  startBtn.addEventListener("click", async () => {
    const bind = bindInput.value.trim() || "127.0.0.1:7734";
    const logLevel = logSelect.value || "info";
    appendToOutput(
      serverOutput,
      `── Starting arcaned on ${bind} (log: ${logLevel}) ──`,
      "system",
    );
    const res = await window.arcane.server.start({ bind, logLevel });
    if (res.success) {
      state.serverRunning = true;
      updateServerBadge(true);
    } else {
      appendToOutput(serverOutput, "── Failed to start server ──", "stderr");
    }
    updateServerControls();
  });

  stopBtn.addEventListener("click", async () => {
    await window.arcane.server.stop();
    state.serverRunning = false;
    updateServerBadge(false);
    appendToOutput(serverOutput, "── Server stopped ──", "system");
    updateServerControls();
  });

  function updateServerControls(): void {
    startBtn.disabled = state.serverRunning;
    stopBtn.disabled = !state.serverRunning;
  }

  updateServerControls();
}

function initUsers(): void {
  const userList = document.getElementById("user-list")!;
  const refreshBtn = document.getElementById(
    "btn-users-refresh",
  ) as HTMLButtonElement;
  const addForm = document.getElementById("add-user-form")!;
  const addUsername = document.getElementById(
    "add-username",
  ) as HTMLInputElement;
  const addPassword = document.getElementById(
    "add-password",
  ) as HTMLInputElement;
  const addBtn = document.getElementById("btn-add-user") as HTMLButtonElement;
  const userFeedback = document.getElementById("user-feedback")!;

  async function loadUsers(): Promise<void> {
    userList.innerHTML = '<div class="loading-text">Loading…</div>';
    const res = await window.arcane.arcana.list();
    userList.innerHTML = "";
    if (res.exitCode !== 0 || res.stderr) {
      userList.innerHTML = `<div class="error-text">${escapeHtml(res.stderr || "Failed to list users")}</div>`;
      return;
    }
    const lines = res.stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      userList.innerHTML = '<div class="muted-text">No users found.</div>';
      return;
    }
    lines.forEach((line) => {
      const row = document.createElement("div");
      row.className = "user-row";
      row.innerHTML = `
        <span class="user-name">${escapeHtml(line.trim())}</span>
        <button class="btn-icon btn-danger" data-user="${escapeHtml(line.trim())}">Remove</button>
      `;
      row.querySelector("button")!.addEventListener("click", async (e) => {
        const username = (e.currentTarget as HTMLButtonElement).dataset.user!;
        if (!confirm(`Remove user "${username}"?`)) return;
        const r = await window.arcane.arcana.remove(username);
        showFeedback(
          r.exitCode === 0 ? `User "${username}" removed.` : r.stderr,
          r.exitCode === 0,
        );
        await loadUsers();
      });
      userList.appendChild(row);
    });
  }

  function showFeedback(msg: string, success: boolean): void {
    userFeedback.textContent = msg;
    userFeedback.className = `user-feedback ${success ? "success" : "error"}`;
    setTimeout(() => {
      userFeedback.textContent = "";
      userFeedback.className = "user-feedback";
    }, 4000);
  }

  refreshBtn.addEventListener("click", loadUsers);

  addBtn.addEventListener("click", async () => {
    const u = addUsername.value.trim();
    const p = addPassword.value;
    if (!u || !p) {
      showFeedback("Username and password are required.", false);
      return;
    }
    const res = await window.arcane.arcana.add(u, p);
    showFeedback(
      res.exitCode === 0 ? `User "${u}" created.` : res.stderr,
      res.exitCode === 0,
    );
    if (res.exitCode === 0) {
      addUsername.value = "";
      addPassword.value = "";
      await loadUsers();
    }
  });

  document.getElementById("nav-users")!.addEventListener("click", loadUsers);
  loadUsers();
}

function initSettings(): void {
  const binInput = document.getElementById("settings-bin") as HTMLInputElement;
  const dataInput = document.getElementById(
    "settings-data",
  ) as HTMLInputElement;
  const browseBin = document.getElementById(
    "btn-browse-bin",
  ) as HTMLButtonElement;
  const browseData = document.getElementById(
    "btn-browse-data",
  ) as HTMLButtonElement;
  const saveBtn = document.getElementById(
    "btn-settings-save",
  ) as HTMLButtonElement;
  const feedback = document.getElementById("settings-feedback")!;

  async function loadSettings(): Promise<void> {
    const s = await window.arcane.settings.get();
    binInput.value = s.binaryDir;
    dataInput.value = s.dataDir;
  }

  browseBin.addEventListener("click", async () => {
    const res = await window.arcane.settings.browseDir();
    if (res.path) binInput.value = res.path;
  });

  browseData.addEventListener("click", async () => {
    const res = await window.arcane.settings.browseDir();
    if (res.path) dataInput.value = res.path;
  });

  saveBtn.addEventListener("click", async () => {
    await window.arcane.settings.set({
      binaryDir: binInput.value.trim(),
      dataDir: dataInput.value.trim(),
    });
    feedback.textContent = "Settings saved.";
    feedback.className = "settings-feedback success";
    setTimeout(() => {
      feedback.textContent = "";
      feedback.className = "settings-feedback";
    }, 3000);
  });

  document
    .getElementById("nav-settings")!
    .addEventListener("click", loadSettings);
  loadSettings();
}

function bindMenuEvents(): void {
  window.arcane.onMenuEvent("menu:new-script", () => newScript());
  window.arcane.onMenuEvent("menu:open-script", (data) => {
    if (data) openScript(data.path, data.content);
    else openScript();
  });
  window.arcane.onMenuEvent("menu:save-script", () => saveScript());
  window.arcane.onMenuEvent("menu:save-script-as", () => saveScriptAs());
  window.arcane.onMenuEvent("menu:run-script", () => runScript());
  window.arcane.onMenuEvent("menu:run-selection", () => runSelection());
  window.arcane.onMenuEvent("menu:start-server", () => showPanel("server"));
  window.arcane.onMenuEvent("menu:stop-server", async () => {
    await window.arcane.server.stop();
    state.serverRunning = false;
    updateServerBadge(false);
  });
}

function bindToolbar(): void {
  document.getElementById("btn-new")?.addEventListener("click", newScript);
  document
    .getElementById("btn-open")
    ?.addEventListener("click", () => openScript());
  document.getElementById("btn-save")?.addEventListener("click", saveScript);
  document.getElementById("btn-run")?.addEventListener("click", runScript);
  document
    .getElementById("btn-run-selection")
    ?.addEventListener("click", runSelection);
  document.getElementById("btn-clear-output")?.addEventListener("click", () => {
    const el = document.getElementById("output-content");
    if (el) el.innerHTML = "";
  });
}

function bindNav(): void {
  (["editor", "repl", "server", "users", "settings"] as const).forEach(
    (name) => {
      document
        .getElementById(`nav-${name}`)
        ?.addEventListener("click", () => showPanel(name));
    },
  );
}

function initApp(): void {
  console.log("Initializing ArcaneDB Workbench...");
  initEditor();
  initRepl();
  initServer();
  initUsers();
  initSettings();
  bindMenuEvents();
  bindToolbar();
  bindNav();
  showPanel("editor");
  setTitle(false, null);
  updateServerBadge(false);
  console.log("Initialization complete.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
