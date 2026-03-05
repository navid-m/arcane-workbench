#!/usr/bin/env node
/**
 * Build script for ArcaneDB Workbench.
 *
 * Key constraint: Monaco is loaded via its own AMD loader (require.config /
 * require(['vs/editor/editor.main'], ...)) in index.html. Our renderer bundle
 * must NEVER emit a require('monaco-editor') call — that would conflict with
 * the AMD loader and throw "synchronous require cannot resolve module".
 *
 * Solution:
 *   - renderer.ts / aql-language.ts use `import type` only (erased at compile time)
 *     and declare `monaco` as a global that the AMD loader populates at runtime.
 *   - esbuild marks 'monaco-editor' external (so it never appears in output).
 *   - The renderer bundle is built as IIFE format so it has no require() calls.
 */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

fs.mkdirSync("dist/main", { recursive: true });
fs.mkdirSync("dist/renderer", { recursive: true });

// ── Main process ──────────────────────────────────────────────────────────────
console.log("Building main process...");
esbuild.buildSync({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  external: ["electron"],
  outfile: "dist/main/main.js",
  sourcemap: true,
});

// ── Preload script ────────────────────────────────────────────────────────────
console.log("Building preload script...");
esbuild.buildSync({
  entryPoints: ["src/main/preload.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  external: ["electron"],
  outfile: "dist/main/preload.js",
  sourcemap: true,
});

// ── Renderer bundle ───────────────────────────────────────────────────────────
// Format: IIFE — produces a self-contained immediately-invoked function with
// no require() calls. Monaco is expected as a pre-existing global (window.monaco)
// set by the AMD loader in index.html before this script is injected.
console.log("Building renderer process...");
esbuild.buildSync({
  entryPoints: ["src/renderer/renderer.ts"],
  bundle: true,
  platform: "browser",
  target: "chrome120",
  format: "iife", // <-- critical: no require(), no AMD, no ESM
  globalName: "ArcaneApp", // optional; wraps the bundle in a named IIFE
  external: ["monaco-editor"], // belt-and-suspenders: never bundle monaco
  outfile: "dist/renderer/renderer.js",
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

// ── Copy Monaco editor files ─────────────────────────────────────────────────
// Monaco requires its worker files and other assets to be available at runtime.
// We copy the entire min folder to dist/node_modules/monaco-editor/min so the
// AMD loader can find them.
console.log("Copying Monaco editor files...");
const monacoSrc = path.join(
  __dirname,
  "..",
  "node_modules",
  "monaco-editor",
  "min",
);
const monacoDest = path.join(
  __dirname,
  "..",
  "dist",
  "node_modules",
  "monaco-editor",
  "min",
);

// Helper function to copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(monacoSrc, monacoDest);

console.log("Build complete.");
