#!/usr/bin/env node
/**
 * revert-overzealous-dark.mjs
 *
 * Companion to fix-dark-mode.mjs. The earlier codemod was too aggressive in
 * two places:
 *
 *  A) "Double dark:" — when a developer had already typed an explicit
 *     dark-variant later in the className string (e.g. `bg-slate-50 ...
 *     dark:bg-slate-800/60`), the codemod ALSO added its own canonical
 *     `dark:bg-slate-900` right after `bg-slate-50`. This produces two
 *     conflicting rules; we want to drop the codemod's addition and keep the
 *     hand-authored one.
 *
 *  B) "White pills on colored heroes" — pill buttons like
 *     `bg-white text-slate-900 ... rounded-xl` are placed inside a colored
 *     gradient hero banner. They are meant to be white in BOTH modes (for
 *     contrast against the colored hero). The codemod incorrectly added
 *     `dark:bg-slate-900 dark:text-slate-100` which makes them invisible
 *     against the (still-colored) hero.
 *
 * This script does precise string replacements for these patterns only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

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

// --- Patterns to revert -----------------------------------------------------

// (A) Double `dark:bg-*` and `dark:border-*` and `dark:text-*` produced by the
// codemod — it always emits `dark:bg-slate-900`, `dark:border-slate-800`,
// `dark:text-slate-100`, etc. as the FIRST dark variant. If a SECOND dark
// variant of the same property follows on the same className, drop the
// FIRST one (the codemod's addition) and keep the second (hand-authored).
//
// We match a codemod-added dark token followed by 0-N non-dark tokens and
// then another `dark:<same-prop>-...` token, and remove the first one.
const DOUBLE_DARK_PATTERNS = [
  // dark:bg-* ... dark:bg-* (or dark:hover:bg-*)
  {
    re: /\bdark:bg-(?:slate|gray)-\d+(?:\/\d+)?\s+((?:[^"'`{}\s]+\s+){0,8}?)dark:(?:hover:|focus:|group-hover:)*bg-/g,
    name: "double dark:bg-*",
  },
  // dark:border-* ... dark:border-*
  {
    re: /\bdark:border-(?:slate|gray)-\d+\s+((?:[^"'`{}\s]+\s+){0,8}?)dark:(?:hover:|focus:|group-hover:)*border-/g,
    name: "double dark:border-*",
  },
  // dark:text-* ... dark:text-*
  {
    re: /\bdark:text-(?:slate|gray)-\d+\s+((?:[^"'`{}\s]+\s+){0,8}?)dark:(?:hover:|focus:|group-hover:)*text-/g,
    name: "double dark:text-*",
  },
];

// (B) Pill / button patterns that the codemod broke. These are "white-on-
// colored-hero" pills: bg-white text-slate-900 dark:* — the dark variants
// must be stripped because they sit on a permanent colored gradient hero.
//
// We do a precise string replace. We DO NOT touch elements that have
// `dark:bg-` followed by something OTHER than slate-900 — those are likely
// hand-authored. Pattern: codemod always emits exactly:
//     bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100
// or
//     bg-white dark:bg-slate-900 text-blue-700
// so we revert those exact sequences.
const HERO_PILL_REPLACEMENTS = [
  // White pill, dark text → keep as plain white-and-dark-text in both modes
  {
    from: "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100",
    to: "bg-white text-slate-900",
    name: "revert white pill (text-slate-900) on colored hero",
  },
  // White "Course Library"-style pill with text-blue-700 (must stay white in both modes)
  {
    from: "bg-white dark:bg-slate-900 text-blue-700",
    to: "bg-white text-blue-700",
    name: "revert white pill (text-blue-700) on colored hero",
  },
  {
    from: "bg-white dark:bg-slate-900 text-blue-600",
    to: "bg-white text-blue-600",
    name: "revert white pill (text-blue-600) on colored hero",
  },
];

let totalDoubleDarkFixed = 0;
let totalPillsReverted = 0;
const perFile = {};

function bumpFile(file, key, n) {
  perFile[file] = perFile[file] || {};
  perFile[file][key] = (perFile[file][key] || 0) + n;
}

for (const file of walk(SRC)) {
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  const rel = path.relative(ROOT, file);

  // (B) hero pill reverts — simple string replace
  for (const { from, to, name } of HERO_PILL_REPLACEMENTS) {
    if (content.includes(from)) {
      const before = content;
      content = content.split(from).join(to);
      const occ = (before.length - content.length) / (from.length - to.length);
      if (occ > 0) {
        bumpFile(rel, name, occ);
        totalPillsReverted += occ;
      }
    }
  }

  // (A) double-dark cleanup — for each of bg/border/text, find a codemod-
  // added dark:<prop>-slate-N near a hand-authored dark:<prop>-... and
  // remove the codemod one. We work at the line level (each className is
  // typically on a single line in JSX).
  const lines = content.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let newLine = line;

    for (const prop of ["bg", "border", "text"]) {
      // Match all `dark:<variants>?<prop>-<color>-<n>(/n)?` tokens on the line.
      // Then if there are >= 2 tokens of the same prop on the same line and
      // the FIRST one is one of the codemod's canonical additions, drop it.
      const tokenRe = new RegExp(
        `\\bdark:(?:hover:|focus:|group-hover:)*${prop}-[a-z]+-\\d+(?:\\/\\d+)?\\b`,
        "g"
      );
      const tokens = [];
      let m;
      while ((m = tokenRe.exec(newLine)) !== null) {
        tokens.push({ token: m[0], index: m.index });
      }
      if (tokens.length < 2) continue;

      // Group by their LIGHT-equivalent base + variant chain so we only drop
      // duplicates of the SAME contextual property (e.g. don't drop
      // `dark:bg-slate-900` if the duplicate is `dark:hover:bg-slate-800`).
      // For simplicity: if two tokens differ only by the color/shade and the
      // earlier one matches the codemod's canonical output, drop the earlier.
      const codemodCanonical = {
        bg: ["dark:bg-slate-900", "dark:bg-slate-800", "dark:bg-slate-700"],
        border: ["dark:border-slate-800", "dark:border-slate-700", "dark:border-slate-600"],
        text: ["dark:text-slate-100", "dark:text-slate-200", "dark:text-slate-300", "dark:text-slate-400", "dark:text-slate-500"],
      }[prop];

      // Walk pairs (a,b) where a comes before b on the line; if a is a codemod
      // canonical token and b is a different dark:<prop>-* token (different
      // shade) on the same modifier chain (no extra `hover:`/`focus:` in a
      // that's missing in b), drop a.
      // Simpler heuristic: if a is in codemodCanonical AND a's variant chain
      // (the part between `dark:` and the final `${prop}-...`) equals b's,
      // drop a.
      const variantOf = (tok) => {
        const inner = tok.replace(/^dark:/, "");
        const colon = inner.lastIndexOf(":");
        return colon >= 0 ? inner.slice(0, colon + 1) : "";
      };

      const drops = new Set();
      for (let a = 0; a < tokens.length; a++) {
        if (drops.has(a)) continue;
        if (!codemodCanonical.includes(tokens[a].token)) continue;
        for (let b = a + 1; b < tokens.length; b++) {
          if (variantOf(tokens[a].token) === variantOf(tokens[b].token) && tokens[a].token !== tokens[b].token) {
            drops.add(a);
            break;
          }
        }
      }

      if (drops.size === 0) continue;

      // Remove dropped tokens from the line (highest-index first to keep
      // earlier indices valid).
      const sortedDrops = [...drops].sort((x, y) => tokens[y].index - tokens[x].index);
      for (const idx of sortedDrops) {
        const t = tokens[idx];
        // Remove the token plus exactly one preceding space (if any).
        const start = t.index;
        const end = start + t.token.length;
        let newStart = start;
        if (newStart > 0 && newLine[newStart - 1] === " ") newStart--;
        newLine = newLine.slice(0, newStart) + newLine.slice(end);
      }
      const dropped = drops.size;
      bumpFile(rel, `double dark:${prop}-* dedup`, dropped);
      totalDoubleDarkFixed += dropped;
    }

    if (newLine !== line) lines[li] = newLine;
  }
  content = lines.join("\n");

  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
  }
}

console.log("=== Revert summary ===");
console.log(`Hero pills reverted: ${totalPillsReverted}`);
console.log(`Double-dark dedup tokens removed: ${totalDoubleDarkFixed}`);
console.log("");
const filesSorted = Object.keys(perFile).sort();
for (const f of filesSorted) {
  const ch = perFile[f];
  console.log(`• ${f}`);
  for (const [k, v] of Object.entries(ch)) console.log(`    – ${k} ×${v}`);
}
