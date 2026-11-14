// Usage: node url-normalizer-test.mjs <ext-src-dir>
// Tests src/youtube/YouTubeUrl.ts and the ytdlp request item built from it.
import { build } from "esbuild";
import path from "node:path";

const src = path.resolve(process.argv[2] ?? ".");

async function load(entry) {
  const out = await build({
    entryPoints: [path.join(src, entry)],
    bundle: true, write: false, format: "esm", platform: "neutral",
    alias: { "~": path.join(src, "src") },
    logLevel: "silent",
  });
  const code = out.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const U = await load("src/youtube/YouTubeUrl.ts");
const Y = await load("src/youtube/YtDlpDownload.ts");

const ID = "BaW_jenozKc";
const WATCH = `https://www.youtube.com/watch?v=${ID}`;

const cases = [
  // [input, expected]
  // accepted forms
  [`https://www.youtube.com/watch?v=${ID}`, WATCH],
  [`http://www.youtube.com/watch?v=${ID}`, WATCH],
  [`https://youtube.com/watch?v=${ID}`, WATCH],
  [`https://m.youtube.com/watch?v=${ID}`, WATCH],
  [`https://music.youtube.com/watch?v=${ID}`, WATCH],
  [`https://youtu.be/${ID}`, WATCH],
  [`https://youtu.be/${ID}?si=abcDEF123`, WATCH],
  [`https://www.youtube.com/shorts/${ID}`, WATCH],
  [`https://www.youtube.com/shorts/${ID}/`, WATCH],
  [`https://m.youtube.com/shorts/${ID}?feature=share`, WATCH],
  [`  https://WWW.YouTube.com/watch?v=${ID}  `, WATCH],
  // extra parameters are dropped
  [`https://www.youtube.com/watch?v=${ID}&list=PL1234567890&index=3`, WATCH],
  [`https://www.youtube.com/watch?list=PL1234567890&v=${ID}`, WATCH],
  [`https://www.youtube.com/watch?v=${ID}&t=42s`, WATCH],
  [`https://www.youtube.com/watch?v=${ID}&si=xyz&pp=abc#t=10`, WATCH],
  [`https://youtu.be/${ID}?t=42`, WATCH],
  // invalid ids
  [`https://www.youtube.com/watch?v=short`, null],
  [`https://www.youtube.com/watch?v=${ID}x`, null],
  [`https://www.youtube.com/watch?v=BaW_jenozK!`, null],
  [`https://www.youtube.com/watch?v=BaW%20enozKc`, null],
  [`https://www.youtube.com/watch`, null],
  [`https://www.youtube.com/watch?v=`, null],
  [`https://youtu.be/`, null],
  [`https://youtu.be/${ID}/extra`, null],
  [`https://www.youtube.com/shorts/`, null],
  [`https://www.youtube.com/shorts/abc`, null],
  // not a single video page
  [`https://www.youtube.com/`, null],
  [`https://www.youtube.com/playlist?list=PL1234567890`, null],
  [`https://www.youtube.com/@channel`, null],
  [`https://www.youtube.com/embed/${ID}`, null],
  [`https://www.youtube.com/${ID}`, null],
  // non-http(s)
  [`ftp://www.youtube.com/watch?v=${ID}`, null],
  [`file:///C:/watch?v=${ID}`, null],
  [`javascript:alert(1)//https://www.youtube.com/watch?v=${ID}`, null],
  [`javascript://www.youtube.com/watch?v=${ID}`, null],
  [`data:text/html,https://www.youtube.com/watch?v=${ID}`, null],
  [`-https://www.youtube.com/watch?v=${ID}`, null],
  [`--exec=calc https://www.youtube.com/watch?v=${ID}`, null],
  // foreign / look-alike hosts
  [`https://evil.com/watch?v=${ID}`, null],
  [`https://youtube.com.evil.com/watch?v=${ID}`, null],
  [`https://evilyoutube.com/watch?v=${ID}`, null],
  [`https://gaming.youtube.com/watch?v=${ID}`, null],
  [`https://www.youtu.be/${ID}`, null],
  [`https://youtube-nocookie.com/watch?v=${ID}`, null],
  [`https://www.youtube.com@evil.com/watch?v=${ID}`, null],
  [`https://user:pass@www.youtube.com/watch?v=${ID}`, null],
  [`https://www.youtube.com:8443/watch?v=${ID}`, null],
  // garbage
  [``, null],
  [`not a url`, null],
  [`//www.youtube.com/watch?v=${ID}`, null],
  [null, null],
  [undefined, null],
  [42, null],
  [{ toString: () => WATCH }, null],
];

const failures = [];
for (const [input, expected] of cases) {
  const actual = U.normalizeYouTubeUrl(input);
  if (actual !== expected) {
    failures.push({ input: String(input), expected, actual });
  }
}

// allowlist lives in exactly one exported constant
const hosts = [...U.YOUTUBE_ALLOWED_HOSTS].sort();
const expectedHosts = ["m.youtube.com", "music.youtube.com", "www.youtube.com", "youtu.be", "youtube.com"];
if (JSON.stringify(hosts) !== JSON.stringify(expectedHosts)) {
  failures.push({ allowlist: hosts });
}
if (!Object.isFrozen(U.YOUTUBE_ALLOWED_HOSTS)) {
  failures.push({ allowlist: "not frozen" });
}

// request item shape sent to the app
const itemChecks = [
  [[`https://youtu.be/${ID}?si=1`, "  My   video\n"], { type: "ytdlp", link: WATCH, title: "My video" }],
  [[`https://www.youtube.com/shorts/${ID}`, undefined], { type: "ytdlp", link: WATCH }],
  [[`https://www.youtube.com/watch?v=${ID}`, "   "], { type: "ytdlp", link: WATCH }],
  [[`https://www.youtube.com/watch?v=${ID}`, '<img src=x onerror=alert(1)>'], { type: "ytdlp", link: WATCH, title: '<img src=x onerror=alert(1)>' }],
  [[`https://evil.com/watch?v=${ID}`, "x"], null],
  [[`javascript:alert(1)`, "x"], null],
];
for (const [[link, title], expected] of itemChecks) {
  const actual = Y.createYtDlpDownloadRequestItem(link, title);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push({ item: [link, title], expected, actual });
  }
}
const longTitle = Y.createYtDlpDownloadRequestItem(WATCH, "a".repeat(1000)).title;
if (longTitle.length !== 300) failures.push({ longTitleLength: longTitle.length });
if (JSON.stringify(Y.YTDLP_DOWNLOAD_REQUEST_OPTIONS) !== JSON.stringify({ silentAdd: false, silentStart: false })) {
  failures.push({ options: Y.YTDLP_DOWNLOAD_REQUEST_OPTIONS });
}

console.log(JSON.stringify({ cases: cases.length + itemChecks.length, failures }, null, failures.length ? 2 : 0));
process.exit(failures.length > 0 ? 1 : 0);
