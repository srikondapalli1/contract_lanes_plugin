// Benchmark 4: install footprint. Fresh dir + fresh npm cache per run, so times include downloads (network-dependent).
//   Lanes:  npm pack of this repo (bin from LANES_BIN) + vitest@^5.1 + zod@^4.1   (its peers)
//   Pact:   @pact-foundation/pact + vitest@^5.1                                    (Pact needs a test runner too)
//   vitest: vitest@^5.1 alone, the shared baseline both of the above include
// Also records registry metadata (`npm view`) for both packages.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, lstatSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANES_BIN_DIR, REPO, WORK, round, saveResult, sh, tmp } from "./lib.mjs";

const RUNS = Number(process.env.INSTALL_RUNS ?? 2);

function du(dir) {
  let bytes = 0, files = 0;
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e), st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p); else { bytes += st.size; files++; }
    }
  };
  if (existsSync(dir)) walk(dir);
  return { bytes, files };
}
/** Count installed packages = node_modules dirs with a package.json (incl. scoped and nested). */
function countPkgs(nm) {
  let n = 0; const names = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d)) {
      if (e.startsWith(".")) continue;
      const p = join(d, e);
      if (e.startsWith("@")) { walk(p); continue; }
      if (existsSync(join(p, "package.json"))) { n++; names.push(p.slice(p.lastIndexOf("node_modules/") + 13)); }
      walk(join(p, "node_modules"));
    }
  };
  walk(nm);
  return { n, names };
}
/** Find platform-native binaries (.node / .so / .dylib / .dll) under node_modules. */
function natives(nm) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e), st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (/\.(node|so|dylib|dll)$/.test(e) || /^pact(_|-)/.test(e) && st.mode & 0o111) out.push({ file: p.slice(nm.length + 1), bytes: st.size });
    }
  };
  if (existsSync(nm)) walk(nm);
  return out;
}

function packLanes() {
  const stage = tmp("pack-stage");
  for (const f of ["package.json", "README.md", "LICENSE"]) cpSync(join(REPO, f), join(stage, f));
  cpSync(LANES_BIN_DIR, join(stage, "plugin/bin"), { recursive: true, dereference: true });
  const out = tmp("pack-out");
  const r = sh("npm", ["pack", "--json", "--pack-destination", out], stage);
  if (r.code) throw new Error("npm pack failed: " + r.stderr);
  const info = JSON.parse(r.stdout)[0];
  return { tarball: join(out, info.filename), size: info.size, unpackedSize: info.unpackedSize, entryCount: info.entryCount };
}

function install(label, pkgs) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const dir = tmp(`install-${label}`);
    const cache = tmp(`npm-cache-${label}`);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `bench-${label}`, private: true, type: "module" }));
    const r = sh("npm", ["install", "--no-audit", "--no-fund", "--cache", cache, "--prefer-online", "-D", ...pkgs], dir, { timeout: 900_000 });
    const nm = join(dir, "node_modules");
    const size = du(nm), pk = countPkgs(nm);
    runs.push({ ok: r.code === 0, seconds: round(r.ms / 1000, 2), node_modules_bytes: size.bytes, node_modules_files: size.files, packages: pk.n, natives: natives(nm), stderr_tail: r.code ? r.stderr.split("\n").slice(-15).join("\n") : undefined, dir });
    console.log(`${label} run ${i + 1}: ok=${r.code === 0} ${round(r.ms / 1000, 1)}s ${round(size.bytes / 1e6, 1)} MB ${pk.n} pkgs`);
  }
  return { packages_requested: pkgs.map((p) => (p.endsWith(".tgz") ? "contract-lanes (npm pack tarball)" : p)), runs };
}

function view(pkg) {
  const r = sh("npm", ["view", pkg, "--json", "version", "dist.unpackedSize", "dependencies", "optionalDependencies", "peerDependencies"], REPO);
  try { return JSON.parse(r.stdout); } catch { return { error: r.stderr.trim() || r.stdout.trim() }; }
}

const pack = packLanes();
console.log("packed", pack);
const lanesInstall = install("lanes", [pack.tarball, "vitest@^5.1.0", "zod@^4.1.0"]);
const pactInstall = install("pact", ["@pact-foundation/pact", "vitest@^5.1.0"]);
const vitestOnly = install("vitest", ["vitest@^5.1.0"]);
const pactRunDir = pactInstall.runs.find((r) => r.ok)?.dir;
const pactVersion = pactRunDir ? (await import(join(pactRunDir, "node_modules/@pact-foundation/pact/package.json"), { with: { type: "json" } })).default.version : null;
const pactCoreVersion = pactRunDir && existsSync(join(pactRunDir, "node_modules/@pact-foundation/pact-core/package.json"))
  ? (await import(join(pactRunDir, "node_modules/@pact-foundation/pact-core/package.json"), { with: { type: "json" } })).default.version : null;

saveResult("install", {
  method: `fresh directory + fresh npm cache per run (--prefer-online), npm ${sh("npm", ["-v"], REPO).stdout.trim()}, ${RUNS} run(s) each; wall time includes network downloads`,
  lanes_pack: pack,
  lanes: lanesInstall,
  pact: { ...pactInstall, version: pactVersion, pact_core_version: pactCoreVersion },
  vitest_only: vitestOnly,
  registry: { "@pact-foundation/pact": view("@pact-foundation/pact"), "@pact-foundation/pact-core": view("@pact-foundation/pact-core"), "contract-lanes": view("contract-lanes") },
  pact_install_dir: pactRunDir ?? null,
});
// Leave a stable pointer for pact.mjs to reuse the installed tree.
if (pactRunDir) writeFileSync(join(WORK, "lanes-bench-pact-install-dir"), pactRunDir + "\n");
