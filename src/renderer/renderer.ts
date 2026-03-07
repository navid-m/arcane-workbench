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
import { BucketGraphView, type GraphData } from "./graph-view";

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
  activePanel: "editor" | "repl" | "server" | "users" | "graph" | "settings";
  serverRunning: boolean;
  replRunning: boolean;
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
  graphView: BucketGraphView | null;
}

const state: AppState = {
  currentFilePath: null,
  isDirty: false,
  activePanel: "editor",
  serverRunning: false,
  replRunning: false,
  editorInstance: null,
  graphView: null,
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
  if (name === "graph" && !state.graphView) {
    initGraph();
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

function initGraph(): void {
  if (state.graphView) return;

  state.graphView = new BucketGraphView("graph-container", async (node) => {
    await showBucketDetails(node);
  });

  const refreshBtn = document.getElementById(
    "btn-graph-refresh",
  ) as HTMLButtonElement;
  const centerBtn = document.getElementById(
    "btn-graph-center",
  ) as HTMLButtonElement;
  const clearBtn = document.getElementById(
    "btn-graph-clear",
  ) as HTMLButtonElement;
  const closeDetailsBtn = document.getElementById(
    "btn-graph-close-details",
  ) as HTMLButtonElement;

  refreshBtn.addEventListener("click", async () => {
    await loadBucketGraph();
  });

  centerBtn.addEventListener("click", () => {
    state.graphView?.centerView();
  });

  clearBtn.addEventListener("click", () => {
    state.graphView?.render({ nodes: [], links: [] });
    hideGraphDetails();
  });

  closeDetailsBtn.addEventListener("click", () => {
    hideGraphDetails();
  });

  loadBucketGraph();
}

async function showBucketDetails(node: any): Promise<void> {
  const detailsPanel = document.getElementById("graph-details")!;
  const detailsTitle = document.getElementById("graph-details-title")!;
  const detailsContent = document.getElementById("graph-details-content")!;

  detailsPanel.style.width = "450px";

  if (node.type === "record") {
    detailsTitle.textContent = `${node.bucketName} → ${node.name}`;

    let html = `
      <div style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px; padding: 12px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px;">Record Details</div>
    `;

    for (const [key, value] of Object.entries(node.data || {})) {
      const displayValue =
        value === null || value === undefined
          ? '<span style="color: var(--text-muted); font-style: italic;">null</span>'
          : escapeHtml(String(value));

      html += `
        <div style="display: flex; margin-bottom: 6px; font-size: 12px;">
          <span style="color: var(--accent-cyan); min-width: 120px; font-weight: 500;">${escapeHtml(key)}:</span>
          <span style="color: var(--text-primary); word-break: break-all;">${displayValue}</span>
        </div>
      `;
    }

    html += `</div>`;
    detailsContent.innerHTML = html;
    return;
  }

  detailsTitle.textContent = node.name;
  detailsContent.innerHTML =
    '<div style="color: var(--text-muted); font-size: 12px;">Loading records...</div>';

  try {
    const recordCount = node.recordCount || 0;
    let query: string;

    if (recordCount > 100) {
      query = `get head(100) from ${node.name};`;
    } else if (recordCount === 0) {
      detailsContent.innerHTML =
        '<div style="color: var(--text-muted); font-size: 12px;">No records in this bucket.</div>';
      return;
    } else {
      query = `get * from ${node.name};`;
    }

    const result = await window.arcane.arcc.runScript(query);

    if (result.exitCode !== 0) {
      detailsContent.innerHTML = `<div style="color: var(--accent-red); font-size: 12px;">Error: ${escapeHtml(result.stderr)}</div>`;
      return;
    }

    const records = parseRecordsFromOutput(result.stdout);

    if (records.length === 0) {
      detailsContent.innerHTML =
        '<div style="color: var(--text-muted); font-size: 12px;">No records found.</div>';
      return;
    }

    let html = `
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
          Showing ${records.length} of ${recordCount} record${recordCount !== 1 ? "s" : ""}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">
          <strong>Fields:</strong> ${node.fields.map((f: any) => `${f.name} (${f.type})`).join(", ")}
        </div>
      </div>
    `;

    records.forEach((record, idx) => {
      html += `
        <div style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
          <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 6px;">Record ${idx + 1}</div>
      `;

      for (const [key, value] of Object.entries(record)) {
        const displayValue =
          value === null || value === undefined
            ? '<span style="color: var(--text-muted); font-style: italic;">null</span>'
            : escapeHtml(String(value));

        html += `
          <div style="display: flex; margin-bottom: 4px; font-size: 12px;">
            <span style="color: var(--accent-cyan); min-width: 100px; font-weight: 500;">${escapeHtml(key)}:</span>
            <span style="color: var(--text-primary); word-break: break-all;">${displayValue}</span>
          </div>
        `;
      }

      html += `</div>`;
    });

    detailsContent.innerHTML = html;
  } catch (err: any) {
    detailsContent.innerHTML = `<div style="color: var(--accent-red); font-size: 12px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function hideGraphDetails(): void {
  const detailsPanel = document.getElementById("graph-details")!;
  detailsPanel.style.width = "0";
}

function parseRecordsFromOutput(output: string): Array<Record<string, any>> {
  const lines = output.trim().split("\n");
  const records: Array<Record<string, any>> = [];

  if (lines.length < 2) return records;

  let headerLine = "";
  let dataStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("──")) {
      if (i > 0) {
        headerLine = lines[i - 1];
        dataStartIdx = i + 1;
        break;
      }
    }
  }

  if (!headerLine) return records;

  const headers: Array<{ name: string; start: number; end: number }> = [];
  const headerParts = headerLine.split(/\s{2,}/);
  let currentPos = 0;

  for (const part of headerParts) {
    const trimmed = part.trim();
    if (trimmed) {
      const start = headerLine.indexOf(trimmed, currentPos);
      headers.push({
        name: trimmed,
        start,
        end: start + trimmed.length,
      });
      currentPos = start + trimmed.length;
    }
  }

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes("──") || line.match(/^\(\d+ rows?\)/) || !line.trim()) {
      continue;
    }

    const record: Record<string, any> = {};

    const values = line
      .split(/\s{2,}/)
      .map((v) => v.trim())
      .filter(Boolean);

    headers.forEach((header, idx) => {
      if (idx < values.length) {
        let value: any = values[idx];

        if (value === "true") value = true;
        else if (value === "false") value = false;
        else if (value === "null" || value === "") value = null;
        else if (!isNaN(Number(value)) && value !== "") value = Number(value);

        record[header.name] = value;
      }
    });

    if (Object.keys(record).length > 0) {
      records.push(record);
    }
  }

  return records;
}

async function loadBucketGraph(): Promise<void> {
  if (!state.graphView) return;

  try {
    const result = await window.arcane.arcc.runScript("show buckets;");

    if (result.exitCode !== 0) {
      console.error("Failed to fetch buckets:", result.stderr);
      return;
    }

    const bucketNames = result.stdout
      .trim()
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed &&
          !trimmed.startsWith("─") &&
          !trimmed.includes("Available buckets") &&
          !trimmed.match(/^\(\d+\s+buckets?\)$/)
        );
      })
      .map((line) => line.trim())
      .filter(Boolean);

    console.log("Found buckets:", bucketNames);

    const allNodes: any[] = [];
    const allLinks: any[] = [];

    for (const bucketName of bucketNames) {
      const descResult = await window.arcane.arcc.runScript(
        `describe ${bucketName};`,
      );
      const fields = parseBucketFields(descResult.stdout);
      const countResult = await window.arcane.arcc.runScript(
        `get count(*) from ${bucketName};`,
      );

      console.log(`Count query for ${bucketName}:`, countResult.stdout);
      const recordCount = parseRecordCount(countResult.stdout);
      console.log(`Parsed record count for ${bucketName}:`, recordCount);

      const bucketNode = {
        id: `bucket:${bucketName}`,
        name: bucketName,
        fields,
        recordCount,
        type: "bucket",
      };
      allNodes.push(bucketNode);

      let query: string;
      if (recordCount > 50) {
        query = `get head(50) from ${bucketName};`;
      } else if (recordCount === 0) {
        continue;
      } else {
        query = `get * from ${bucketName};`;
      }

      const recordsResult = await window.arcane.arcc.runScript(query);
      if (recordsResult.exitCode === 0) {
        const records = parseRecordsFromOutput(recordsResult.stdout);

        records.forEach((record, idx) => {
          const recordId = record.__hash__ || `${bucketName}:record:${idx}`;
          const recordNode = {
            id: recordId,
            name: getRecordLabel(record, fields),
            fields: [],
            recordCount: 0,
            type: "record",
            data: record,
            bucketName,
          };
          allNodes.push(recordNode);

          allLinks.push({
            source: `bucket:${bucketName}`,
            target: recordId,
            type: "contains",
          });
        });
      }
    }

    const bucketNodes = allNodes.filter((n) => n.type === "bucket");
    const bucketLinks = detectBucketRelationships(bucketNodes);
    allLinks.push(...bucketLinks);

    state.graphView.render({ nodes: allNodes, links: allLinks });
  } catch (err: any) {
    console.error("Error loading bucket graph:", err);
  }
}

function getRecordLabel(
  record: Record<string, any>,
  fields: Array<{ name: string; type: string }>,
): string {
  const labelCandidates = ["name", "title", "id"];

  for (const candidate of labelCandidates) {
    if (record[candidate] !== undefined && record[candidate] !== null) {
      return String(record[candidate]);
    }
  }

  for (const field of fields) {
    if (field.type === "string" && record[field.name]) {
      return String(record[field.name]);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (key !== "__hash__" && value !== null && value !== undefined) {
      return String(value);
    }
  }

  return "Record";
}

function parseBucketFields(
  output: string,
): Array<{ name: string; type: string }> {
  const lines = output.trim().split("\n");
  const fields: Array<{ name: string; type: string }> = [];

  for (const line of lines) {
    const match = line.match(/^\s*(\w+)\s*:\s*(\w+)/);
    if (match) {
      fields.push({ name: match[1], type: match[2] });
    }
  }

  return fields;
}

function parseRecordCount(output: string): number {
  const match = output.match(/count\s*\(\s*\*\s*\)\s*:?\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  const rowMatch = output.match(/\((\d+)\s+rows?\)/);
  if (rowMatch) {
    return parseInt(rowMatch[1], 10);
  }

  console.warn("Could not parse record count from:", output);
  return 0;
}

function detectBucketRelationships(nodes: any[]): any[] {
  const links: any[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      const commonFields = nodeA.fields.filter((fieldA: any) =>
        nodeB.fields.some(
          (fieldB: any) =>
            fieldA.name === fieldB.name && fieldA.type === fieldB.type,
        ),
      );

      if (commonFields.length > 0) {
        links.push({
          source: nodeA.id,
          target: nodeB.id,
          type: "related",
        });
      }
    }
  }

  return links;
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
  window.arcane.onMenuEvent("menu:show-graph", () => showPanel("graph"));
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
  (["editor", "repl", "server", "users", "graph", "settings"] as const).forEach(
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
