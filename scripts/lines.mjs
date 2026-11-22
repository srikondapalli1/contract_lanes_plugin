// Budget check (SPEC §18): core ≤ ~2,500 non-test lines, plugin markdown ≤ ~600 lines.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d, f = []) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? (e === "__contracts__" ? 0 : walk(p, f)) : f.push(p); } return f; };
const count = (files) => files.reduce((n, f) => n + readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !/^\s*\/\//.test(l)).length, 0);
const core = walk("packages/core/src").filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
const contracts = core.filter((f) => f.includes("/contracts/"));
const md = walk("plugin").filter((f) => f.endsWith(".md"));
const code = count(core), c = count(contracts), m = readFileSync ? md.reduce((n, f) => n + readFileSync(f, "utf8").split("\n").length, 0) : 0;
console.log(`core (non-test, non-blank, non-comment): ${code} lines (${c} of them are the C1–C10 zod contracts) · budget ~2500`);
console.log(`plugin markdown: ${m} lines · budget ~600`);
if (code > 3000 || m > 600) { console.error("over budget"); process.exit(1); }
