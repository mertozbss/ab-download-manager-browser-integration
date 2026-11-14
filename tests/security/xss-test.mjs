// Usage: node xss-test.mjs <ext-src-dir>
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import path from "node:path";
const src = path.resolve(process.argv[2]);
const out = await build({
  entryPoints: [path.join(src, "src/popup/media/MediaSelectionPopup.ts")],
  bundle: true, write: false, format: "iife", globalName: "P",
  alias: { "~": path.join(src, "src"), "webextension-polyfill": path.join(path.dirname(new URL(import.meta.url).pathname), "stub.js") },
  logLevel: "silent", footer: { js: "window.P = P;" },
});
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
const w = dom.window;
try { w.eval(out.outputFiles[0].text); } catch (e) { console.error("eval err", e.message); }
// payload as a malicious media server would send in Content-Disposition filename
const payload = '<img src=x onerror="window.__pwned=1">';
w.P.updatePopup([{ type: "http", uri: "https://cdn.evil/v.mp4", displayName: payload, extension: "mp4", size: "1 MB" }]);
try { w.P.toggleList && w.P.toggleList(true); } catch {}
const injected = w.document.querySelectorAll(".abdm-media-item img").length;
const shown = [...w.document.querySelectorAll(".abdm-item-title")].map(e => e.textContent);
console.log(JSON.stringify({ injectedImgTags: injected, titleText: shown }));
process.exit(injected > 0 ? 1 : 0);
