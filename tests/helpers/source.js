/* Reads the game's source files the way index.html loads them, for the static tests. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const html = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** every <script src> in index.html, in order */
function scriptOrder() {
  return [...html().matchAll(/<script\s+[^>]*src="([^"]+)"/g)].map((m) => m[1]);
}
/** every .js file under js/ (relative paths, sorted) */
function jsFiles(dir = 'js') {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = d + '/' + e.name;
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out.push(p);
    }
  })(dir);
  return out.sort();
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** source without comments (good enough for scanning; strings are kept) */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/** which file defines each VR.<Name> (first top-level "VR.Name =" in load order) */
function definers(order) {
  const def = {};
  for (const f of order) {
    for (const m of stripComments(read(f)).matchAll(/^\s*(?:window\.)?VR\.([A-Za-z_]\w*)\s*=(?!=)/gm)) if (!def[m[1]]) def[m[1]] = f;
  }
  return def;
}

/** registries meant to be added to from many files (adding a new key is fine) */
const REGISTRIES = ['MissionEnvironments'];

/**
 * Places where one file replaces a function / value of a system defined in ANOTHER file
 * (VR.X.y = …, VR.X.prototype.y = …). Each one is a hidden link between two systems.
 * Adding a NEW entry to a registry (VR.MissionEnvironments.myWorld = …) is not counted.
 * → sorted list of "file: VR.X.y"
 */
function crossFileOverrides() {
  const order = scriptOrder().filter((f) => f.startsWith('js/'));
  const def = definers(order), out = new Set(), reg = {};
  for (const f of order) {
    const s = stripComments(read(f));
    for (const m of s.matchAll(/VR\.([A-Za-z_]\w*)((?:\.prototype)?)\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) {
      const owner = def[m[1]];
      if (REGISTRIES.includes(m[1])) (reg[m[1] + '.' + m[3]] = reg[m[1] + '.' + m[3]] || new Set()).add(f);
      else if (owner && owner !== f) out.add(`${f}: VR.${m[1]}${m[2]}.${m[3]}`);
    }
  }
  // a registry entry is only a problem when a second file replaces one that already exists
  for (const k in reg) if (reg[k].size > 1) for (const f of [...reg[k]].slice(1)) out.add(`${f}: VR.${k} (replaces ${[...reg[k]][0]})`);
  return [...out].sort();
}

/**
 * Translation keys defined with different text in more than one place
 * (Object.assign(VR.I18N.STRINGS.<lang>, {...}) and i18n.js itself). The last file loaded wins
 * for EVERY screen, so the earlier one shows the wrong text.
 * → sorted list of "<lang> <key>: file1 | file2"
 */
function i18nConflicts() {
  const order = scriptOrder().filter((f) => f.startsWith('js/'));
  const seen = {};     // lang.key → [{file, value}]
  const str = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/y;
  for (const f of order) {
    const s = read(f);
    // blocks: Object.assign(VR.I18N.STRINGS.en, { … }) — and the tables in i18n.js (en: { … }, ar: { … })
    const starts = [];
    for (const m of s.matchAll(/STRINGS\.(en|ar)\s*,\s*\{/g)) starts.push([m[1], m.index + m[0].length]);
    if (f === 'js/i18n.js') for (const m of s.matchAll(/^\s{2,6}(en|ar)\s*:\s*\{/gm)) starts.push([m[1], m.index + m[0].length]);
    for (const [lang, at] of starts) {
      // walk to the matching close brace, reading 'key': 'value' pairs at depth 1
      let i = at, depth = 1;
      while (i < s.length && depth > 0) {
        const c = s[i];
        if (c === '{') { depth++; i++; continue; }
        if (c === '}') { depth--; i++; continue; }
        if (c === "'" || c === '"' || c === '`') {
          str.lastIndex = i; const k = str.exec(s); if (!k) { i++; continue; }
          i = str.lastIndex;
          const key = k[1] ?? k[2] ?? k[3];
          const rest = s.slice(i).match(/^\s*:\s*/);
          if (depth === 1 && rest) {
            const j = i + rest[0].length;
            str.lastIndex = j; const v = str.exec(s);
            if (v) {
              const val = v[1] ?? v[2] ?? v[3];
              (seen[lang + ' ' + key] = seen[lang + ' ' + key] || []).push({ file: f, value: val });
              i = str.lastIndex;
            }
          }
          continue;
        }
        if (c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) break; continue; }
        if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 2; continue; }
        i++;
      }
    }
  }
  const out = [];
  for (const k in seen) {
    const defs = seen[k];
    if (new Set(defs.map((d) => d.value)).size > 1) out.push(`${k}: ${defs.map((d) => d.file).join(' | ')}`);
  }
  return out.sort();
}

module.exports = { ROOT, scriptOrder, jsFiles, read, stripComments, definers, crossFileOverrides, i18nConflicts };
