// Headless smoke test: bundle the real app entry (main.jsx) and execute it in
// jsdom to surface module-scope / initial-render runtime errors that cause a
// blank white screen in the browser.
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 1) Bundle main.jsx with esbuild, stubbing assets.
const out = path.join(os.tmpdir(), `lms-app-${Date.now()}.mjs`)
const result = await build({
  entryPoints: [path.join(root, 'src/main.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  outfile: out,
  logLevel: 'silent',
  loader: {
    '.css': 'text',
    '.svg': 'text',
    '.png': 'text',
    '.jpg': 'text',
    '.jpeg': 'text',
    '.webp': 'text',
    '.gif': 'text',
  },
}).catch((e) => {
  console.error('ESBUILD BUNDLE FAILED:')
  for (const err of e.errors || []) console.error(err.text)
  process.exit(2)
})
if (!result) process.exit(2)

// 2) jsdom environment
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5174/',
  pretendToBeVisual: true,
})
const { window } = dom

const errors = []
// Stubs jsdom does not implement.
if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
if (!window.IntersectionObserver) window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })

// Copy every jsdom window property onto globalThis so the bundled app sees a
// browser-like environment (Element, Node, Text, crypto, performance, ...).
const doNotCopy = new Set(['globalThis', 'global', 'process', 'require', 'module', 'exports', 'fetch', 'Request', 'Response', 'Headers', 'AbortController', 'AbortSignal', 'ReadableStream', 'WritableStream', 'TransformStream'])
for (const key of Object.getOwnPropertyNames(window)) {
  if (doNotCopy.has(key)) continue
  try {
    if (globalThis[key] === undefined || ['localStorage', 'sessionStorage', 'ResizeObserver', 'IntersectionObserver', 'matchMedia'].includes(key)) {
      globalThis[key] = window[key]
    }
  } catch (_) {}
}
for (const [key, val] of [['window', window], ['document', window.document], ['navigator', window.navigator]]) {
  try { Object.defineProperty(globalThis, key, { value: val, configurable: true, writable: true }) } catch (_) {}
}
if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
if (!globalThis.IntersectionObserver) globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
if (!globalThis.matchMedia) globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
// fetch stub — the app calls the API on load; fail it cleanly.
globalThis.fetch = async () => {
  throw new Error('network unavailable (headless)')
}
window.fetch = globalThis.fetch

process.on('unhandledRejection', (r) => errors.push(`unhandledRejection: ${r && r.stack ? r.stack : r}`))
process.on('uncaughtException', (e) => errors.push(`uncaughtException: ${e && e.stack ? e.stack : e}`))

// 3) Execute the bundle
try {
  await import(out)
} catch (e) {
  errors.push(`MODULE LOAD THREW: ${e && e.stack ? e.stack : e}`)
}

// give effects/microtasks a moment
await new Promise((r) => setTimeout(r, 800))

console.log('--- root.innerHTML length:', (window.document.getElementById('root')?.innerHTML || '').length)
console.log('--- body text snippet:', (window.document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 300))
if (errors.length) {
  console.error('\n=== RUNTIME ERRORS CAPTURED ===')
  for (const e of errors.slice(0, 10)) console.error(e, '\n')
  process.exit(1)
} else {
  console.log('NO RUNTIME ERRORS — app mounted')
  process.exit(0)
}
