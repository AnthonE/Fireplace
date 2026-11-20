// The studio's code box. A plain textarea works from the first moment; Monaco,
// the editor VS Code is built from, loads from jsDelivr beside it and takes
// its place: colours for WAT and JavaScript, find and replace, a minimap,
// multiple cursors, undo kept per file. No npm dependency and nothing in the
// repo: if the CDN can't be reached the textarea simply stays.
//
//   const ed = codeEditor(textarea, { onChange(value), onBuild() })
//   ed.show(name, value, { language: 'wat' | 'javascript', readOnly })
//       shows the file `name` (one model, and one undo history, a name)
//   ed.value      the text shown
//   ed.ready      resolves to true once Monaco has taken over, false if it never will
//
// jsDelivr sends Cross-Origin-Resource-Policy: cross-origin, so the scripts,
// the stylesheet, the codicon font and the workers all load on a page that is
// cross-origin isolated (the studio's coi.js). The workers are blob: workers
// that importScripts the CDN's, as Monaco's own docs do for a CDN.

export const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';

let loading = null;
export function loadMonaco(base = MONACO) {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (window.monaco?.editor) { resolve(window.monaco); return; }
    window.MonacoEnvironment = {
      getWorkerUrl: () => URL.createObjectURL(new Blob([
        `self.MonacoEnvironment = { baseUrl: '${base}/' }; importScripts('${base}/vs/base/worker/workerMain.js');`,
      ], { type: 'text/javascript' })),
    };
    const s = document.createElement('script');
    s.src = `${base}/vs/loader.js`;
    s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Monaco did not load'));
    s.onload = () => {
      window.require.config({ paths: { vs: `${base}/vs` } });
      window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
    };
    document.head.append(s);
  });
  return loading;
}

// WAT as this repo writes it: the assembler's macros `(!name`, constants
// `@NAME` and `@(expr)`, the preprocessor's `#if`/`#include` (tools/asm-core.mjs).
const WAT_WORDS = ['module', 'func', 'param', 'result', 'local', 'global', 'memory', 'import', 'export',
  'type', 'table', 'elem', 'data', 'start', 'mut', 'if', 'then', 'else', 'end', 'block', 'loop', 'br',
  'br_if', 'br_table', 'return', 'call', 'call_indirect', 'select', 'drop', 'unreachable', 'nop'];
function defineWat(monaco) {
  if (monaco.languages.getLanguages().some((l) => l.id === 'wat')) return;
  monaco.languages.register({ id: 'wat', extensions: ['.wat'] });
  monaco.languages.setLanguageConfiguration('wat', {
    comments: { lineComment: ';;', blockComment: ['(;', ';)'] },
    brackets: [['(', ')']],
    autoClosingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"', notIn: ['string', 'comment'] }],
    surroundingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"' }],
  });
  monaco.languages.setMonarchTokensProvider('wat', {
    words: WAT_WORDS,
    tokenizer: {
      root: [
        [/;;.*$/, 'comment'],
        [/\(;/, 'comment', '@block'],
        [/^\s*#(include|if|else|endif)\b.*$/, 'keyword.directive'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/!\w+/, 'type'],
        [/@\(/, 'constant', '@expr'],
        [/@[A-Za-z_]\w*/, 'constant'],
        [/\$[\w.$!-]+/, 'variable'],
        [/[a-z][a-z0-9_]*\.[a-z0-9_.=]+/, 'keyword.instr'],
        [/-?(0x[0-9a-fA-F_]+|\d[\d_]*(\.\d+)?([eE][-+]?\d+)?)/, 'number'],
        [/[a-z_][\w]*/, { cases: { '@words': 'keyword', '@default': 'identifier' } }],
        [/[()]/, '@brackets'],
      ],
      block: [[/\(;/, 'comment', '@push'], [/;\)/, 'comment', '@pop'], [/[^(;]+/, 'comment'], [/[(;]/, 'comment']],
      expr: [[/\(/, 'constant', '@push'], [/\)/, 'constant', '@pop'], [/[^()]+/, 'constant']],
    },
  });
}

// the studio's own colours (client/studio.html's :root)
function defineTheme(monaco) {
  monaco.editor.defineTheme('studio', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '7d8499', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'keyword.instr', foreground: '82aaff' },
      { token: 'keyword.directive', foreground: 'ff7a6b' },
      { token: 'type', foreground: 'ffcf5a' },
      { token: 'constant', foreground: 'f78c6c' },
      { token: 'variable', foreground: '8fd18a' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'string', foreground: 'c3e88d' },
    ],
    colors: {
      'editor.background': '#0e1119', 'editor.foreground': '#cfd3e0',
      'editorLineNumber.foreground': '#4a5168', 'editorLineNumber.activeForeground': '#cfd3e0',
      'editor.lineHighlightBackground': '#151a26', 'editorGutter.background': '#0e1119',
      'minimap.background': '#0e1119', 'editorWidget.background': '#131722', 'editorWidget.border': '#262c3b',
    },
  });
}

export function codeEditor(textarea, { onChange = () => {}, onBuild = () => {} } = {}) {
  let ed = null, monaco = null, shown = null, quiet = false;
  const models = new Map();
  let opts = { language: 'plaintext', readOnly: false };

  // the textarea, until Monaco comes (and for good if it doesn't)
  textarea.addEventListener('input', () => { if (!ed) onChange(textarea.value); });
  textarea.addEventListener('keydown', (e) => {
    // a tab key types two spaces, as the files are indented
    if (e.key === 'Tab' && !e.shiftKey && !textarea.readOnly) { e.preventDefault(); document.execCommand('insertText', false, '  '); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onBuild(); }
  });

  function modelFor(name, value, language) {
    let m = models.get(name);
    if (!m) {
      m = monaco.editor.createModel(value, language);
      m.onDidChangeContent(() => { if (!quiet && ed?.getModel() === m) onChange(m.getValue()); });
      models.set(name, m);
    }
    if (m.getLanguageId() !== language) monaco.editor.setModelLanguage(m, language);
    // a value from outside (a reset, a draft) replaces the text, as one undoable edit
    if (m.getValue() !== value) {
      quiet = true;
      m.pushEditOperations([], [{ range: m.getFullModelRange(), text: value }], () => null);
      quiet = false;
    }
    return m;
  }

  const api = {
    get value() { return ed ? ed.getValue() : textarea.value; },
    show(name, value, { language = 'plaintext', readOnly = false } = {}) {
      shown = name; opts = { language, readOnly };
      textarea.value = value;
      textarea.readOnly = readOnly;
      if (!ed) return;
      ed.setModel(modelFor(name, value, language));
      ed.updateOptions({ readOnly });
    },
    ready: null,
  };

  api.ready = loadMonaco().then((m) => {
    monaco = m;
    defineWat(monaco);
    defineTheme(monaco);
    // the constants files are literal numbers: check their syntax, not their types
    monaco.languages.typescript?.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true });
    const host = document.createElement('div');
    host.className = 'code-host';
    textarea.after(host);
    ed = monaco.editor.create(host, {
      theme: 'studio', automaticLayout: true, fontSize: 13, tabSize: 2, insertSpaces: true,
      scrollBeyondLastLine: false, renderWhitespace: 'selection', bracketPairColorization: { enabled: true },
      // the suggestions are the file's own words: Tab takes one, Enter is always a new line
      acceptSuggestionOnEnter: 'off',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    });
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onBuild());
    // whatever was typed in the textarea while Monaco loaded carries over
    if (shown !== null) {
      const typed = textarea.value;
      api.show(shown, typed, opts);
    }
    textarea.hidden = true;
    return true;
  }, () => false);

  return api;
}
