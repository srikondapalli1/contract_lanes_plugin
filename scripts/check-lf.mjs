// Runs before `npm publish`: refuses to publish files with Windows line endings, which break the bin's shebang on macOS
// and Linux. Re-clone after `.gitattributes` (eol=lf) is in place, or run `git add --renormalize . && git checkout .`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk("plugin");
const bad = files.filter((f) => !/\.(png|jpg|mp4|woff2?|ttf)$/.test(f) && readFileSync(f).includes(13));
if (bad.length) {
  console.error(`check-lf: ${bad.length} file(s) have CRLF line endings, e.g. ${bad.slice(0, 3).join(", ")}.\nRe-clone the repo (it now forces LF) and publish again.`);
  process.exit(1);
}
console.log(`check-lf: ${files.length} files, all LF`);
