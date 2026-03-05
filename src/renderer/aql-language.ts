/**
 * AQL language definition for Monaco Editor.
 *
 * Registers tokenisation rules, syntax highlighting, auto-completion,
 * hover documentation, and bracket matching.
 *
 * Monaco is loaded via the AMD require() loader in index.html and is
 * available on window.monaco. We never import the npm package here,
 * cuz that would conflict with the AMD loader and cause a synchronous
 * require error in Electron.
 */

import type * as Monaco from "monaco-editor";

export const AQL_LANGUAGE_ID = "aql";

export function registerAqlLanguage(monaco: typeof Monaco): void {
  monaco.languages.register({
    id: AQL_LANGUAGE_ID,
    extensions: [".aql"],
    aliases: ["AQL", "ArcaneDB Query Language"],
    mimetypes: ["text/x-aql"],
  });

  monaco.languages.setMonarchTokensProvider(AQL_LANGUAGE_ID, {
    defaultToken: "invalid",
    tokenPostfix: ".aql",

    keywords: [
      "create",
      "forced",
      "unique",
      "bucket",
      "from",
      "insert",
      "into",
      "get",
      "set",
      "delete",
      "drop",
      "truncate",
      "describe",
      "show",
      "buckets",
      "export",
      "analyze",
      "where",
      "order",
      "by",
      "asc",
      "desc",
      "and",
      "or",
      "not",
      "is",
      "null",
      "like",
      "head",
      "tail",
      "commit",
      "rollback",
      "begin",
      "to",
      "csv",
    ],

    analyzeKeywords: [
      "stream",
      "timeseries",
      "statistics",
      "correlation",
      "percentile",
      "window",
    ],

    windowFunctions: ["row_number", "rank", "dense_rank", "percent_rank"],

    aggregateFunctions: [
      "avg",
      "median",
      "min",
      "max",
      "stddev",
      "sum",
      "count",
    ],

    stringFunctions: ["upper", "title"],

    typeKeywords: ["string", "float", "int", "bool"],

    operators: ["=", "!=", "<", "<=", ">", ">=", "*"],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    escapes:
      /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
      root: [
        [
          /\b(begin|commit|rollback)(!)?/,
          {
            cases: {
              $2: "keyword.control.transaction",
              "@default": "keyword",
            },
          },
        ],

        [/__hash__/, "variable.predefined"],

        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@analyzeKeywords": "keyword.analyze",
              "@windowFunctions": "support.function.window",
              "@aggregateFunctions": "support.function.aggregate",
              "@stringFunctions": "support.function.string",
              "@typeKeywords": "type",
              "true|false": "constant.language",
              "@default": "identifier",
            },
          },
        ],

        { include: "@whitespace" },
        [/[{}()\[\]]/, "@brackets"],
        [/[;,:]/, "delimiter"],
        [
          /@symbols/,
          {
            cases: {
              "@operators": "operator",
              "@default": "operator",
            },
          },
        ],

        [/\d+\.\d+/, "number.float"],
        [/\d+/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
      ],

      string: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],

      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/#.*$/, "comment"],
      ],
    },
  } as Monaco.languages.IMonarchLanguage);

  monaco.languages.setLanguageConfiguration(AQL_LANGUAGE_ID, {
    comments: {
      lineComment: "#",
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(begin!)\s*;/i,
      decreaseIndentPattern: /^\s*(commit!|rollback!)\s*;/i,
    },
    wordPattern:
      /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
  });

  monaco.languages.registerCompletionItemProvider(AQL_LANGUAGE_ID, {
    triggerCharacters: [" ", ".", "("],
    provideCompletionItems(model, position) {
      const wordInfo = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      const suggestions: Monaco.languages.CompletionItem[] = [
        {
          label: "create forced bucket",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "create forced bucket ${1:name} (\n\t${2:field}: ${3:string}\n);",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Create a new bucket, dropping any existing one.",
          range,
        },
        {
          label: "create unique bucket",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "create unique bucket ${1:name} (\n\t${2:field}: ${3:string}\n);",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Create bucket only if it does not already exist.",
          range,
        },
        {
          label: "create forced unique bucket",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "create forced unique bucket ${1:name} (\n\t${2:field}: ${3:string}\n);",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Create bucket, overwriting if it exists.",
          range,
        },
        {
          label: "insert into",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "insert into ${1:bucket} (${2:field}: ${3:value});",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Insert a single record.",
          range,
        },
        {
          label: "insert batch",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "insert into ${1:bucket} (\n\t[${2:field}: ${3:value}],\n\t[${4:field}: ${5:value}]\n);",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Insert multiple records in one statement.",
          range,
        },
        {
          label: "get * from",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "get * from ${1:bucket};",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Retrieve all records from a bucket.",
          range,
        },
        {
          label: "get * from ... where",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "get * from ${1:bucket} where ${2:field} = ${3:value};",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Retrieve records matching a condition.",
          range,
        },
        {
          label: "get head",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "get head(${1:10}) from ${2:bucket};",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Retrieve the first N records.",
          range,
        },
        {
          label: "get tail",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "get tail(${1:10}) from ${2:bucket};",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Retrieve the last N records.",
          range,
        },
        {
          label: "set ... where",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "set ${1:bucket} ( ${2:field}: ${3:value} ) where ${4:field} = ${5:value};",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Update all matching records.",
          range,
        },
        {
          label: "delete from ... where",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "delete from ${1:bucket} where ${2:field} = ${3:value};",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Delete all matching records.",
          range,
        },
        {
          label: "analyze ... stream",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "analyze ${1:bucket} ${2:field} stream(${3:10});",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Sliding-window real-time metrics.",
          range,
        },
        {
          label: "analyze ... timeseries",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "analyze ${1:bucket} ${2:field} timeseries;",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Trend detection, forecasting, and anomaly detection.",
          range,
        },
        {
          label: "analyze ... statistics",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "analyze ${1:bucket} ${2:field} statistics;",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Comprehensive descriptive statistics.",
          range,
        },
        {
          label: "analyze ... correlation",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "analyze ${1:bucket} ${2:field_a} correlation(${3:field_b});",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Pearson correlation between two fields.",
          range,
        },
        {
          label: "analyze ... percentile",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "analyze ${1:bucket} ${2:field} percentile(${3:90});",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Compute the N-th percentile.",
          range,
        },
        {
          label: "analyze ... window",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "analyze ${1:bucket} ${2:field} window(${3|row_number,rank,dense_rank,percent_rank|}, ${4:10});",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Per-row window function.",
          range,
        },
        {
          label: "begin!/commit! block",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "begin!;\n\t${1:-- statements}\ncommit!;",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Explicit transaction block.",
          range,
        },
        {
          label: "begin!/rollback! block",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "begin!;\n\t${1:-- statements}\nrollback!;",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Transaction block that rolls back.",
          range,
        },
        {
          label: "export to csv",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'export ${1:bucket} to csv("${2:output.csv}");',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Export a bucket to a CSV file.",
          range,
        },
        {
          label: "get aggregate stats",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "get avg(${1:field}), median(${1:field}), min(${1:field}), max(${1:field}), stddev(${1:field}) from ${2:bucket};",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Common aggregate statistics in one query.",
          range,
        },

        ...[
          "create",
          "forced",
          "unique",
          "bucket",
          "insert",
          "into",
          "get",
          "set",
          "delete",
          "drop",
          "truncate",
          "describe",
          "show",
          "buckets",
          "export",
          "analyze",
          "where",
          "order",
          "by",
          "asc",
          "desc",
          "and",
          "or",
          "is",
          "null",
          "like",
          "from",
          "to",
          "csv",
          "begin!",
          "commit!",
          "rollback!",
        ].map((kw) => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        })),

        ...["string", "float", "int", "bool"].map((t) => ({
          label: t,
          kind: monaco.languages.CompletionItemKind.TypeParameter,
          insertText: t,
          range,
        })),
      ];

      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider(AQL_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const docs: Record<string, string> = {
        create: "Create a new bucket with a defined field schema.",
        forced: "Modifier: drop and replace the bucket if it already exists.",
        unique:
          "Modifier: create the bucket only if it does not already exist (no-op if it does).",
        bucket: "A named collection of typed records — analogous to a table.",
        insert: "Add one or more records to a bucket.",
        get: "Retrieve records from a bucket, with optional filtering and ordering.",
        set: "Update all records matching the WHERE condition.",
        delete: "Remove all records matching the WHERE condition.",
        drop: "Permanently remove a field from the bucket schema and all its records.",
        truncate:
          "Remove all records from a bucket while preserving its schema.",
        describe: "Print the field schema of a bucket.",
        analyze:
          "Perform analytical computations over a numeric field without modifying data.",
        stream:
          "Sliding-window real-time metrics over the most recent N records.",
        timeseries:
          "Trend detection, forecasting, and anomaly detection over the full dataset.",
        statistics:
          "Comprehensive descriptive statistics: count, mean, median, stddev, min, max, etc.",
        correlation:
          "Pearson correlation coefficient between two numeric fields.",
        percentile: "Value below which N% of observations fall.",
        window:
          "Per-row ranking function: row_number, rank, dense_rank, or percent_rank.",
        commit: "Finalise the current transaction, persisting all changes.",
        rollback:
          "Discard all changes made within the current explicit transaction block.",
        begin: "Start an explicit transaction block.",
        export: "Export all records in a bucket to a CSV file.",
        head: "Limit results to the first N records.",
        tail: "Limit results to the last N records.",
        __hash__:
          "Reserved field: the internal system-managed record identifier.",
        upper: "String function: convert a literal value to uppercase.",
        title: "String function: convert a literal value to title case.",
        avg: "Aggregate: arithmetic mean of non-null values.",
        median: "Aggregate: middle value when records are sorted.",
        min: "Aggregate: smallest value.",
        max: "Aggregate: largest value.",
        stddev: "Aggregate: population standard deviation.",
        sum: "Aggregate: sum of all non-null values.",
        count: "Aggregate: total number of records (use count(*)).",
        row_number: "Window function: unique sequential integer per record.",
        rank: "Window function: rank with gaps for ties.",
        dense_rank: "Window function: rank without gaps for ties.",
        percent_rank: "Window function: relative rank in [0, 1].",
        string: "Field type: variable-length text.",
        float: "Field type: 64-bit floating-point number.",
        int: "Field type: 64-bit signed integer.",
        bool: "Field type: boolean (true / false).",
      };

      const text = word.word;
      if (docs[text]) {
        return {
          contents: [{ value: `**${text}**` }, { value: docs[text] }],
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          },
        };
      }
      return null;
    },
  });
}

export function registerAqlTheme(monaco: typeof Monaco): void {
  monaco.editor.defineTheme("arcane-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "c792ea", fontStyle: "bold" },
      {
        token: "keyword.control.transaction",
        foreground: "ff9580",
        fontStyle: "bold",
      },
      { token: "keyword.analyze", foreground: "89ddff" },
      { token: "support.function.aggregate", foreground: "82aaff" },
      { token: "support.function.window", foreground: "ffcb6b" },
      { token: "support.function.string", foreground: "c3e88d" },
      { token: "type", foreground: "ffcb6b", fontStyle: "italic" },
      { token: "constant.language", foreground: "f78c6c" },
      { token: "string", foreground: "c3e88d" },
      { token: "string.quote", foreground: "c3e88d" },
      { token: "number", foreground: "f78c6c" },
      { token: "number.float", foreground: "f78c6c" },
      { token: "operator", foreground: "89ddff" },
      { token: "delimiter", foreground: "a6accd" },
      { token: "identifier", foreground: "eeffff" },
      {
        token: "variable.predefined",
        foreground: "ff9580",
        fontStyle: "italic",
      },
      { token: "comment", foreground: "546e7a", fontStyle: "italic" },
      { token: "invalid", foreground: "ff5370" },
    ],
    colors: {
      "editor.background": "#0d1117",
      "editor.foreground": "#e6edf3",
      "editor.lineHighlightBackground": "#161b22",
      "editor.selectionBackground": "#264f7840",
      "editor.inactiveSelectionBackground": "#264f7820",
      "editorLineNumber.foreground": "#484f58",
      "editorLineNumber.activeForeground": "#8b949e",
      "editorCursor.foreground": "#c792ea",
      "editorIndentGuide.background": "#21262d",
      "editorIndentGuide.activeBackground": "#30363d",
      "editorBracketMatch.background": "#c792ea30",
      "editorBracketMatch.border": "#c792ea80",
      "editorWidget.background": "#161b22",
      "editorWidget.border": "#30363d",
      "editorSuggestWidget.background": "#161b22",
      "editorSuggestWidget.border": "#30363d",
      "editorSuggestWidget.selectedBackground": "#1f2937",
      "editorHoverWidget.background": "#161b22",
      "editorHoverWidget.border": "#30363d",
      "scrollbarSlider.background": "#21262d80",
      "scrollbarSlider.hoverBackground": "#30363d",
    },
  });
}
