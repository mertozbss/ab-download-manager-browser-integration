// Usage: node youtube-button-xss-test.mjs <ext-src-dir>
// A malicious YouTube video title must only ever end up as text in the
// "download this video" button, never as markup.
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(process.argv[2] ?? ".");
const stub = path.join(path.dirname(fileURLToPath(import.meta.url)), "stub.js");
const out = await build({
  entryPoints: [path.join(src, "src/youtube/YouTubeDownloadButton.ts")],
  bundle: true, write: false, format: "iife", globalName: "B",
  alias: { "~": path.join(src, "src"), "webextension-polyfill": stub },
  logLevel: "silent", footer: { js: "window.B = B;" },
});

const dom = new JSDOM('<!doctype html><body><div id="movie_player"></div></body>', { runScripts: "outside-only" });
const w = dom.window;
w.eval(out.outputFiles[0].text);

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

const payloads = [
  '<img src=x onerror=alert(1)>',
  '<img src=x onerror="window.__pwned=1">',
  '"><svg onload="window.__pwned=1"></svg>',
  '<script>window.__pwned=1</script>',
  '<iframe src="javascript:window.__pwned=1"></iframe>',
];

const player = w.document.getElementById("movie_player");
let clicks = 0;
// label is static i18n text, but treat it as hostile too
const button = w.B.createYouTubeDownloadButton(w.document, {
  label: payloads[0],
  onClick: () => { clicks++; },
});
player.appendChild(button.host);

const ALLOWED_TAGS = ["style", "button", "svg", "path", "span"];
const tagsInShadow = () => [...button.root.querySelectorAll("*")].map((e) => e.localName);
const expectedTags = tagsInShadow();

for (const payload of payloads) {
  button.setVideoTitle(payload);
  button.setVisible(true);
  const tags = tagsInShadow();
  check(JSON.stringify(tags) === JSON.stringify(expectedTags), `element set changed for ${payload}: ${tags}`);
  check(tags.every((t) => ALLOWED_TAGS.includes(t)), `unexpected element for ${payload}: ${tags}`);
  for (const bad of ["img", "script", "iframe", "svg[onload]", "[onerror]", "[onload]"]) {
    check(button.root.querySelectorAll(bad).length === 0, `"${bad}" found in shadow root for ${payload}`);
    check(w.document.querySelectorAll(bad).length === 0, `"${bad}" found in document for ${payload}`);
  }
  const tip = button.root.querySelector(".tip");
  check(tip.textContent === payload, `tooltip text differs for ${payload}`);
  check(tip.children.length === 0, `tooltip has child elements for ${payload}`);
}
const label = button.root.querySelector(".label");
check(label.textContent === payloads[0] && label.children.length === 0, "label rendered as markup");
check(button.host.attributes.length <= 2, `unexpected host attributes: ${[...button.host.attributes].map((a) => a.name)}`);

button.root.querySelector("button").click();
check(clicks === 1, `onClick called ${clicks} times`);

// only one host element, and removal cleans it up
check(w.document.querySelectorAll("[data-abdm-youtube-button]").length === 1, "expected exactly one button host");
button.remove();
check(w.document.querySelectorAll("[data-abdm-youtube-button]").length === 0, "button host not removed");

check(w.__pwned === undefined, "payload executed");

console.log(JSON.stringify({ shadowTags: expectedTags, failures }));
process.exit(failures.length > 0 ? 1 : 0);
