#!/usr/bin/env node
/**
 * fix-dark-mode.mjs
 *
 * Codemod: adds `dark:` variants to hardcoded Tailwind color utilities that
 * don't yet have them. Operates on every Tailwind class token inside
 *   - className="..."       (HTML/JSX literal)
 *   - className='...'
 *   - className={`...`}     (JSX template literal — including ternaries)
 *   - class="..."           (HTML)
 *
 * Strategy: split each class string on whitespace, examine each token, and
 * if the token (after stripping any modifier prefix like `hover:`, `sm:`) is
 * in our REPLACEMENT_MAP and the matching `dark:` counterpart is NOT already
 * present in the same class string, replace it with `<original> <dark-variant>`.
 *
 * This way we never double-apply, never break already-fixed code, and don't
 * touch tokens that aren't on our list.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// --- Replacement table ------------------------------------------------------
// Map from a "base" Tailwind utility (without any modifier) to the dark-mode
// utility it should be paired with. The codemod will emit `<base> dark:<dark>`.
const REPLACEMENT_MAP = {
  // Text — generic
  "text-black": "text-gray-100",
  "text-gray-900": "text-gray-100",
  "text-gray-800": "text-gray-200",
  "text-gray-700": "text-gray-300",
  "text-gray-600": "text-gray-400",
  "text-gray-500": "text-gray-400",
  "text-gray-400": "text-gray-500",

  // Text — slate (this codebase's primary palette)
  "text-slate-900": "text-slate-100",
  "text-slate-800": "text-slate-200",
  "text-slate-700": "text-slate-300",
  "text-slate-600": "text-slate-400",
  "text-slate-500": "text-slate-400",
  "text-slate-400": "text-slate-500",

  // Backgrounds — generic
  "bg-white": "bg-slate-900",
  "bg-gray-50": "bg-slate-900",
  "bg-gray-100": "bg-slate-800",
  "bg-gray-200": "bg-slate-700",

  // Backgrounds — slate
  "bg-slate-50": "bg-slate-900",
  "bg-slate-100": "bg-slate-800",
  "bg-slate-200": "bg-slate-700",

  // Borders — generic
  "border-gray-100": "border-slate-800",
  "border-gray-200": "border-slate-700",
  "border-gray-300": "border-slate-600",

  // Borders — slate
  "border-slate-100": "border-slate-800",
  "border-slate-200": "border-slate-700",
  "border-slate-300": "border-slate-600",

  // Placeholders
  "placeholder-gray-400": "placeholder-gray-500",
  "placeholder-gray-500": "placeholder-gray-400",
  "placeholder-slate-400": "placeholder-slate-500",
  "placeholder-slate-500": "placeholder-slate-400",
};

// We do NOT touch `text-white` — in this codebase, every `text-white` is on a
// colored container (gradient, primary button, badge with bg-rose-500, etc.)
// and changing it would break readability on those colored surfaces.

// Regexes to find class strings inside JSX/HTML. Each regex must capture the
// INNER content (without delimiters) as a single named group so we can pass
// it through the tokenizer and rebuild the original delimiters around it.
//
// 1. className="..." or class="..."  — inner content (no quotes) is group 2.
const ATTR_DOUBLE = /\b(className|class)="((?:[^"\\]|\\.)*)"/g;
// 2. className='...' or class='...'
const ATTR_SINGLE = /\b(className|class)='((?:[^'\\]|\\.)*)'/g;
// 3. className={`...`} — any backtick template literal directly assigned
const ATTR_TEMPLATE = /\b(className|class)=\{`([^`]*)`\}/g;

// Walk all source files
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      out.push(...walk(p));
    } else if (/\.(jsx|tsx|js|ts|html|vue)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Process a single Tailwind class string (the *content* of className=).
 * Returns { newContent, changes: { [token]: count } }.
 *
 * The parser is line-aware but treats the string as a stream of whitespace-
 * separated tokens; characters like `${...}` interpolations and ternary
 * `?:` operators are preserved as-is (they fall through as non-matching
 * tokens).
 */
function transformClassString(content) {
  // Build a quick lookup of which dark utilities are already present, so we
  // don't double-add. We check both `dark:<x>` and the raw dark target value.
  const presentDarkTargets = new Set();
  // Match every `dark:<utility>` token already in the string
  const darkRe = /\bdark:([a-zA-Z0-9:_/\-\[\]]+)/g;
  let m;
  while ((m = darkRe.exec(content)) !== null) {
    presentDarkTargets.add(m[1]);
  }

  const changes = {};

  // Token boundary: split on whitespace but keep delimiters so we can rebuild.
  const parts = content.split(/(\s+)/);

  for (let i = 0; i < parts.length; i++) {
    const tok = parts[i];
    if (!tok || /^\s+$/.test(tok)) continue;

    // A token from a JSX template literal may have surrounding "noise" — for
    // example a leading `"` in `"bg-white` (start of a quoted-string literal
    // inside a `${cond ? "...": "..."}` interpolation), or trailing chars
    // like `bg-slate-200"` and `text-slate-700"}`. Tailwind class tokens are
    // composed of [A-Za-z0-9:_/\-\[\]\.] characters. Strip a *leading* run
    // of "noise" characters (chars NOT valid in a Tailwind token), then
    // capture the longest leading run of valid token chars as the core, and
    // treat the remainder (if any) as trailing noise.
    const VALID = /[A-Za-z0-9:_\/\-\[\]\.]/;
    let p = 0;
    while (p < tok.length && !VALID.test(tok[p])) p++;
    const prefix = tok.slice(0, p);
    let q = p;
    while (q < tok.length && VALID.test(tok[q])) q++;
    const core = tok.slice(p, q);
    const suffix = tok.slice(q);

    if (!core) continue;
    // Skip if the core already starts with `dark:` (meaning it is itself the
    // dark variant — leave it alone).
    if (core.startsWith("dark:")) continue;

    // Split off a final variant chain. e.g. "hover:bg-white" -> variants "hover:", base "bg-white"
    const lastColon = core.lastIndexOf(":");
    const base = lastColon >= 0 ? core.slice(lastColon + 1) : core;
    const variantPrefix = lastColon >= 0 ? core.slice(0, lastColon + 1) : "";

    if (!(base in REPLACEMENT_MAP)) continue;

    const darkTarget = REPLACEMENT_MAP[base];
    // Build the dark token mirroring the variant chain, e.g. "hover:" -> "dark:hover:"
    const darkToken = `dark:${variantPrefix}${darkTarget}`;

    // Skip if the dark counterpart is already in the string (any form).
    if (presentDarkTargets.has(`${variantPrefix}${darkTarget}`)) continue;
    if (content.includes(darkToken)) continue;

    // Re-attach trailing noise AFTER the inserted dark variant so we don't
    // break a closing quote or interpolation boundary.
    parts[i] = `${prefix}${core} ${darkToken}${suffix}`;
    changes[base] = (changes[base] || 0) + 1;
    presentDarkTargets.add(`${variantPrefix}${darkTarget}`);
  }

  return { newContent: parts.join(""), changes };
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let updated = original;
  const allChanges = {};

  const replaceWith = (re, captureIndex /* of the inner-string content */, rebuild) => {
    updated = updated.replace(re, (match, ...groups) => {
      // groups[0] = "className"|"class", groups[captureIndex] = the inner content
      const inner = groups[captureIndex];
      const { newContent, changes } = transformClassString(inner);
      for (const k of Object.keys(changes)) {
        allChanges[k] = (allChanges[k] || 0) + changes[k];
      }
      return rebuild(groups[0], newContent);
    });
  };

  // For each regex, groups[0]=attrName, groups[1]=inner content (no delimiters).
  replaceWith(ATTR_DOUBLE, 1, (attr, inner) => `${attr}="${inner}"`);
  replaceWith(ATTR_SINGLE, 1, (attr, inner) => `${attr}='${inner}'`);
  replaceWith(ATTR_TEMPLATE, 1, (attr, inner) => `${attr}={\`${inner}\`}`);

  // Only count this file as "modified" if at least one replacement occurred.
  if (Object.keys(allChanges).length > 0 && updated !== original) {
    fs.writeFileSync(filePath, updated, "utf8");
    return allChanges;
  }
  return null;
}

// ----- main -----
const targets = walk(SRC);
const indexHtml = path.join(ROOT, "index.html");
if (fs.existsSync(indexHtml)) targets.push(indexHtml);

const summary = {};
let totalFiles = 0;
let totalReplacements = 0;
for (const file of targets) {
  const changes = processFile(file);
  if (changes) {
    const rel = path.relative(ROOT, file);
    summary[rel] = changes;
    totalFiles++;
    for (const k of Object.keys(changes)) totalReplacements += changes[k];
  }
}

// Print a concise per-file summary
const filesSorted = Object.keys(summary).sort();
console.log(`\n=== Dark-mode codemod summary ===`);
console.log(`Files modified: ${totalFiles}`);
console.log(`Total class additions: ${totalReplacements}\n`);
for (const file of filesSorted) {
  const ch = summary[file];
  const parts = Object.entries(ch).map(([k, v]) => `${k} (+dark:) ×${v}`);
  console.log(`• ${file}`);
  for (const p of parts) console.log(`    – ${p}`);
}
