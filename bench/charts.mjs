// Merge results/raw/*.json into results/results.json and render the charts as SVG (+ PNG via Playwright if available).
// Palette: dataviz reference palette (validated: scripts/validate_palette.js, light + dark). Highlight = slot 1 blue,
// de-emphasised = gray. Every series is direct-labelled; values are printed at bar tips; <title> gives hover text.
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { RESULTS, loadResults, round } from "./lib.mjs";

const R = loadResults();
writeFileSync(join(RESULTS, "results.json"), JSON.stringify(R, null, 2) + "\n");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => (n >= 1e6 ? `${round(n / 1e6, 1)}M` : n >= 1e4 ? `${round(n / 1e3, 0)}K` : n >= 1e3 ? n.toLocaleString("en-US") : String(round(n, 1)));
const STYLE = `<style>
  svg { --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --gray:#a3a199; }
  @media (prefers-color-scheme: dark) { svg { --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835; --s1:#3987e5; --s2:#d95926; --s3:#199e70; --gray:#6b6a64; } }
  text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; fill: var(--ink); }
  .t { font-size:16px; font-weight:600 } .st { font-size:12.5px; fill:var(--ink2) } .l { font-size:12px; fill:var(--ink2) }
  .v { font-size:12px; fill:var(--ink); font-variant-numeric: tabular-nums } .ax { font-size:11px; fill:var(--muted); font-variant-numeric: tabular-nums }
  .grid { stroke:var(--grid); stroke-width:1 } .base { stroke:var(--axis); stroke-width:1 } .ph { font-size:13px; font-weight:600; fill:var(--ink) }
</style>`;
const svg = (w, h, body, title, desc) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>${STYLE}
<rect width="${w}" height="${h}" fill="var(--surface)"/>${body}</svg>\n`;
/** Bar with 4px rounded data end and a square end at the baseline (x0). */
const hbar = (x0, y, len, h, fill, tip) => {
  len = Math.max(len, 0.5); const r = Math.min(4, len, h / 2);
  return `<path d="M${x0},${y} h${len - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${len - r} z" fill="${fill}"><title>${esc(tip)}</title></path>`;
};

/** Horizontal bar panel. rows: {label, value, hi (highlight), note}. */
function barPanel({ x, y, w, title, unit, rows, max, labelW = 230, rowH = 30, ticks }) {
  const plotX = x + labelW, plotW = w - labelW - 70;
  max ??= Math.max(...rows.map((r) => r.value)) * 1.05;
  const sx = (v) => (v / max) * plotW;
  let s = `<text class="ph" x="${x}" y="${y}">${esc(title)}</text><text class="ax" x="${plotX + plotW}" y="${y}" text-anchor="end">${esc(unit)}</text>`;
  const top = y + 14, h = rows.length * rowH;
  for (const t of ticks ?? []) s += `<line class="grid" x1="${plotX + sx(t)}" x2="${plotX + sx(t)}" y1="${top}" y2="${top + h}"/><text class="ax" x="${plotX + sx(t)}" y="${top + h + 13}" text-anchor="middle">${fmt(t)}</text>`;
  rows.forEach((r, i) => {
    const by = top + i * rowH + (rowH - 18) / 2;
    s += `<text class="l" x="${plotX - 10}" y="${by + 13}" text-anchor="end">${esc(r.label)}</text>`;
    s += hbar(plotX, by, sx(r.value), 18, r.hi ? "var(--s1)" : "var(--gray)", `${r.label}: ${fmt(r.value)} ${unit}${r.note ? ` (${r.note})` : ""}`);
    s += `<text class="v" x="${plotX + sx(r.value) + 6}" y="${by + 13}">${esc(r.text ?? fmt(r.value))}</text>`;
  });
  s += `<line class="base" x1="${plotX}" x2="${plotX}" y1="${top}" y2="${top + h}"/>`;
  return { svg: s, height: 14 + h + (ticks ? 20 : 4) };
}
function stack(file, w, title, subtitle, panels, footer) {
  let y = 58, body = `<text class="t" x="24" y="30">${esc(title)}</text><text class="st" x="24" y="48">${esc(subtitle)}</text>`;
  for (const p of panels) { y += 26; const r = barPanel({ x: 24, y, w: w - 24, ...p }); body += r.svg; y += r.height; }
  if (footer) { y += 22; for (const line of [].concat(footer)) { body += `<text class="ax" x="24" y="${y}">${esc(line)}</text>`; y += 15; } }
  writeFileSync(join(RESULTS, file), svg(w, y + 12, body, title, subtitle));
  return file;
}
const written = [];

// ---------- 1. tokens ----------
if (R.tokens) {
  const it = R.tokens.items, T = (g, k) => it[g][k].tokens;
  const always = [
    { label: "Lanes plugin: listing + SessionStart", value: T("lanes_always", "skill+agent+command listing") + T("lanes_session", "SessionStart hook (bound lane, 1 red edge)"), hi: true },
    { label: "Lanes plugin: listing only", value: T("lanes_always", "skill+agent+command listing"), hi: true },
    { label: "Lanes AGENTS.md (non-Claude agents)", value: T("lanes_optional", "AGENTS.md section written by lanes init"), hi: true },
    { label: "Prompt-only CLAUDE.md rules", value: T("prompt_only", "CLAUDE.md rules + lane/contract map (always loaded, not enforced)") },
  ];
  const sf = it.same_failure;
  const failure = [
    { label: "lanes check (human)", value: sf["lanes check (human)"].tokens, hi: true },
    { label: "tsc --noEmit --strict", value: sf["tsc --noEmit --strict"].tokens },
    { label: "vitest (hand-written tests)", value: sf["vitest run (consumer + hand-written zod tests)"].tokens },
    { label: "lanes check --json", value: sf["lanes check --json"].tokens, hi: true },
    { label: "Pact provider verification", value: sf["Pact provider verification (vitest)"].tokens },
  ];
  const once = [
    { label: "Lanes: all 3 skills + fixer agent", value: ["skill lanes-contracts", "skill lanes-fixer", "skill lanes-workflow", "agent fixer"].reduce((a, k) => a + T("lanes_on_demand", k), 0), hi: true },
    { label: "Pact: README (learn the API)", value: T("pact", "Pact JS README.md (npm tarball, read once to learn the API)") },
    { label: "Pact: author consumer + provider tests", value: T("pact", "consumer test (world → brain), authored") + T("pact", "provider verification (brain), authored") },
    { label: "zod+vitest: author handler test", value: T("zod_vitest", "hand-written zod handler test, authored") },
  ];
  const small = [
    { label: "lanes watch wake (WatchResult)", value: T("lanes_feedback", "lanes watch wake (WatchResult line)"), hi: true },
    { label: "guard block message", value: T("lanes_feedback", "guard block message"), hi: true },
    { label: "UserPromptSubmit inbox (empty)", value: T("lanes_session", "UserPromptSubmit inbox (empty)"), hi: true, text: "0" },
  ];
  written.push(stack("tokens.svg", 760, "Context cost by approach (approximate tokens)", "Offline count: @anthropic-ai/tokenizer 0.0.4 (legacy Claude BPE). Blue = Lanes, gray = alternatives.", [
    { title: "Loaded every session", unit: "tokens", rows: always, max: 1000, ticks: [0, 250, 500, 750, 1000] },
    { title: "Feedback for the same bug (enum typo, caught by all)", unit: "tokens", rows: failure, max: 2000, ticks: [0, 500, 1000, 1500, 2000] },
    { title: "On demand / one-time", unit: "tokens", rows: once, max: 5000, ticks: [0, 1000, 2000, 3000, 4000, 5000] },
    { title: "Per event", unit: "tokens", rows: small, max: 100, ticks: [0, 25, 50, 75, 100] },
  ], ["Prompt-only and Pact also need ownership rules in CLAUDE.md (608 tokens) because Pact has no ownership model."]));

  // ---------- 2. idle polling ----------
  const m = R.tokens.idle_model, W = 760, H = 430;
  let body = `<text class="t" x="24" y="30">Waiting for cross-agent messages: tokens per hour</text><text class="st" x="24" y="48">/loop polling re-reads context C on every wake; the Lanes watcher is a script and wakes the agent only on an actionable event.</text>`;
  const panelW = 340, ph = 260, top = 96, xs = [1, 2, 5, 10, 15, 20, 30, 60];
  const lx = (v, x0) => x0 + (Math.log(v) / Math.log(60)) * (panelW - 70);
  const ly = (v) => top + ph - ((Math.log10(v) - 3) / (7 - 3)) * ph; // 1K .. 10M
  m.contexts.forEach((C, pi) => {
    const x0 = 70 + pi * (panelW + 30);
    body += `<text class="ph" x="${x0}" y="${top - 16}">Context C = ${fmt(C)} tokens</text>`;
    for (const t of [1e3, 1e4, 1e5, 1e6, 1e7]) body += `<line class="grid" x1="${x0}" x2="${x0 + panelW - 70}" y1="${ly(t)}" y2="${ly(t)}"/>` + (pi === 0 ? `<text class="ax" x="${x0 - 8}" y="${ly(t) + 4}" text-anchor="end">${fmt(t)}</text>` : "");
    for (const v of xs) body += `<text class="ax" x="${lx(v, x0)}" y="${top + ph + 16}" text-anchor="middle">${v}</text>`;
    body += `<text class="ax" x="${x0 + (panelW - 70) / 2}" y="${top + ph + 32}" text-anchor="middle">polling interval N (minutes, log scale)</text>`;
    const pts = m.poll[C].map((p) => [lx(p.interval_min, x0), ly(p.tokens_per_hour), p]);
    body += `<polyline fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(([a, b]) => `${a},${b}`).join(" ")}"/>`;
    for (const [a, b, p] of pts) body += `<circle cx="${a}" cy="${b}" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"><title>/loop every ${p.interval_min} min: ${fmt(p.tokens_per_hour)} tokens/h</title></circle>`;
    const [fa, fb, fp] = pts[0], [la, lb, lp] = pts.at(-1);
    body += `<text class="v" x="${fa + 8}" y="${fb - 6}">${fmt(fp.tokens_per_hour)}/h</text><text class="v" x="${la}" y="${lb - 10}" text-anchor="end">${fmt(lp.tokens_per_hour)}/h</text>`;
    body += `<text class="l" x="${lx(5, x0) + 6}" y="${ly(m.poll[C][2].tokens_per_hour) - 10}">/loop polling</text>`;
    for (const [E, col, dy] of [[4, "var(--s2)", -6], [1, "var(--s3)", 14]]) {
      const v = m.watch[C].find((w) => w.events_per_hour === E).tokens_per_hour;
      body += `<line x1="${x0}" x2="${x0 + panelW - 70}" y1="${ly(v)}" y2="${ly(v)}" stroke="${col}" stroke-width="2" stroke-linecap="round"><title>Lanes watch, ${E} event/h: ${fmt(v)} tokens/h</title></line>`;
      body += `<text class="l" x="${x0 + panelW - 66}" y="${ly(v) + 4}">${E}/h</text><text class="v" x="${x0 + 4}" y="${ly(v) + dy}">Lanes, ${E} event${E > 1 ? "s" : ""}/h: ${fmt(v)}</text>`;
    }
    body += `<line class="base" x1="${x0}" x2="${x0}" y1="${top}" y2="${top + ph}"/><line class="base" x1="${x0}" x2="${x0 + panelW - 70}" y1="${top + ph}" y2="${top + ph}"/>`;
  });
  body += `<text class="ax" x="24" y="${top + ph + 58}">poll: (60/N)·(C + p), p = ${m.p_poll_turn_tokens} tokens per poll turn · Lanes: E·(C + w), w = ${m.w_wake_tokens} tokens per wake · Lanes idle (E = 0): 0 tokens/h.</text>`;
  body += `<text class="ax" x="24" y="${top + ph + 73}">Prompt caching lowers the price of re-reading C, not the token count. Context sizes are parameters, not measurements.</text>`;
  writeFileSync(join(RESULTS, "idle-polling.svg"), svg(W, H + 24, body, "Idle polling tokens per hour", "tokens/hour vs polling interval for /loop polling and the Lanes watcher"));
  written.push("idle-polling.svg");
}

// ---------- 3. bug catch ----------
if (R.mutants) {
  const M = R.mutants, n = M.n, t = M.totals;
  const rows = [
    { label: "lanes check (caught on every seed)", value: t.lanes.caught_every_seed, hi: true },
    { label: "lanes check (caught on ≥1 seed)", value: t.lanes.caught_any_seed, hi: true },
    { label: "lanes check --fast (every seed)", value: t.lanesFast.caught_every_seed, hi: true },
    { label: "Pact consumer + provider", value: t.pact.caught_any_seed },
    { label: "hand-written zod + vitest", value: t.examples.caught_any_seed },
    { label: "TypeScript strict (types only)", value: t.tsc.caught_any_seed },
    { label: "Pact ∪ zod+vitest ∪ tsc", value: M.union_pact_examples_tsc },
  ].map((r) => ({ ...r, text: `${r.value}/${n} (${Math.round((r.value / n) * 100)}%)` }));
  const seedCounts = t.lanes.per_seed_catch_counts;
  written.push(stack("bug-catch.svg", 760, `Seeded bugs caught (${n} single-bug mutants of the example)`, `Each approach runs on each mutant; lanes check runs ${M.seeds} seeds (1..${M.seeds}). Blue = Lanes, gray = alternatives.`, [
    { title: "Mutants caught", unit: "mutants", rows, max: n, ticks: [0, 5, 10, 15, n].filter((v, i, a) => a.indexOf(v) === i) },
  ], [`lanes check per-seed catches: min ${Math.min(...seedCounts)}, max ${Math.max(...seedCounts)} of ${n}. Baseline (bug fixed) green for every approach: ${!M.baseline_false_positive}.`]));

  // matrix: mutants × approaches; filled circle = caught, ring = missed; Lanes cells show the seed detection rate.
  const cols = [["lanes", "lanes check"], ["lanesFast", "--fast"], ["pact", "Pact"], ["examples", "zod+vitest"], ["tsc", "tsc"]];
  const cw = 92, rh = 24, lw = 330, x0 = 24, y0 = 92;
  let body = `<text class="t" x="24" y="30">Which approach catches which bug</text><text class="st" x="24" y="48">● caught · ○ missed. Lanes cells show the share of ${M.seeds} seeds that caught it.</text>`;
  cols.forEach(([, name], j) => (body += `<text class="ph" x="${x0 + lw + j * cw + cw / 2}" y="${y0 - 12}" text-anchor="middle">${esc(name)}</text>`));
  M.rows.forEach((r, i) => {
    const y = y0 + i * rh;
    if (i % 2 === 0) body += `<rect x="${x0}" y="${y}" width="${lw + cols.length * cw}" height="${rh}" fill="var(--grid)" opacity="0.45"/>`;
    body += `<text class="l" x="${x0 + 6}" y="${y + 16}"><tspan style="font-weight:600;fill:var(--ink)">${esc(r.id)}</tspan>  ${esc(r.desc.length > 44 ? r.desc.slice(0, 43) + "…" : r.desc)}<title>${esc(r.desc)} · trigger: ${esc(r.trigger)}</title></text>`;
    cols.forEach(([k, name], j) => {
      const cx = x0 + lw + j * cw + cw / 2, cy = y + rh / 2;
      const rate = k.startsWith("lanes") ? r[k].rate : r[k].caught ? 1 : 0;
      const col = k.startsWith("lanes") ? "var(--s1)" : "var(--ink2)";
      body += rate > 0 ? `<circle cx="${cx - (k.startsWith("lanes") ? 16 : 0)}" cy="${cy}" r="6" fill="${col}"><title>${name} caught ${r.id}${k.startsWith("lanes") ? ` on ${Math.round(rate * 100)}% of seeds` : ""}</title></circle>`
        : `<circle cx="${cx - (k.startsWith("lanes") ? 16 : 0)}" cy="${cy}" r="5" fill="none" stroke="var(--muted)" stroke-width="1.5"><title>${name} missed ${r.id}</title></circle>`;
      if (k.startsWith("lanes")) body += `<text class="v" x="${cx - 4}" y="${cy + 4}">${Math.round(rate * 100)}%</text>`;
    });
  });
  const hh = y0 + M.rows.length * rh + 24;
  body += `<text class="ax" x="24" y="${hh}">Pact: 3 interactions (the two TickRequest fixtures + one spooked agent), MatchersV3 integer/regex/eachLike. zod+vitest: consumer tests + valid-fixture replay.</text>`;
  writeFileSync(join(RESULTS, "bug-matrix.svg"), svg(x0 + lw + cols.length * cw + 24, hh + 14, body, "Bug catch matrix", "mutants by approach"));
  written.push("bug-matrix.svg");
}

// ---------- 4. speed ----------
if (R.speed) {
  const S = R.speed, g = S.guard;
  const lat = [
    { label: "guard: allow own-lane Edit", value: g.allow_own_lane.median, hi: true, text: `${round(g.allow_own_lane.median, 0)} ms (p95 ${round(g.allow_own_lane.p95, 0)})` },
    { label: "guard: block cross-lane Edit", value: g.block_other_lane.median, hi: true, text: `${round(g.block_other_lane.median, 0)} ms (p95 ${round(g.block_other_lane.p95, 0)})` },
    { label: "guard: Bash command", value: g.bash_command.median, hi: true, text: `${round(g.bash_command.median, 0)} ms (p95 ${round(g.bash_command.p95, 0)})` },
    { label: "SessionStart hook", value: g.session_start.median, hi: true, text: `${round(g.session_start.median, 0)} ms (p95 ${round(g.session_start.p95, 0)})` },
    { label: "node --version of the CLI (floor)", value: S.node_startup.median, text: `${round(S.node_startup.median, 0)} ms` },
  ];
  const ch = S.checks;
  const checks = [
    ...Object.entries(ch).map(([k, v]) => ({ label: `lanes check ${k === "full" ? "" : k}`.trim(), value: v.median, hi: true, text: `${fmt(round(v.median, 0))} ms` })),
    { label: "Pact consumer + provider (vitest)", value: S.pact.total.median, text: `${fmt(round(S.pact.total.median, 0))} ms` },
  ];
  const curve = S.property_runs_curve.filter((r) => !r.bug).map((r) => ({ label: `property_runs ${r.property_runs} (bug fixed)`, value: r.median, hi: true, text: `${fmt(round(r.median, 0))} ms` }));
  const curveBug = S.property_runs_curve.filter((r) => r.bug).map((r) => ({ label: `property_runs ${r.property_runs} (planted bug)`, value: r.median, hi: true, text: `${fmt(round(r.median, 0))} ms` }));
  const maxC = Math.ceil(Math.max(...[...checks, ...curve, ...curveBug].map((r) => r.value)) / 1000) * 1000;
  const cticks = Array.from({ length: maxC / 1000 + 1 }, (_, i) => i * 1000).filter((v, i, a) => a.length <= 8 || i % 2 === 0);
  written.push(stack("speed.svg", 760, "Speed on the example repo (median wall time)", `Includes Node process start. Guard: ${g.allow_own_lane.n} runs each (budget < 100 ms). Checks: ${ch.full.n} runs after a warm-up.`, [
    { title: "Hook latency", unit: "ms", rows: lat, max: 150, ticks: [0, 25, 50, 75, 100, 125, 150] },
    { title: "Contract checks (planted bug present)", unit: "ms", rows: checks, max: maxC, ticks: cticks },
    { title: "lanes check vs property_runs", unit: "ms", rows: [...curve, ...curveBug], max: maxC, ticks: cticks },
  ], [`Planted bug: caught on ${S.time_to_first_failure.caught}/20 seeds by check --lane brain; median ${fmt(round(S.time_to_first_failure.wall.median, 0))} ms wall, median ${S.time_to_first_failure.shrinks.median} shrink steps.`]));
}

// ---------- 5. install ----------
if (R.install) {
  const I = R.install, med = (runs, k) => runs.filter((r) => r.ok).map((r) => r[k]).sort((a, b) => a - b)[0];
  const L = I.lanes.runs, P = I.pact.runs;
  const base = I.vitest_only?.runs;
  const mk = (k, f = (x) => x) => [
    { label: "contract-lanes + vitest + zod", value: f(med(L, k)), hi: true },
    { label: `@pact-foundation/pact ${I.pact.version} + vitest`, value: f(med(P, k)) },
    ...(base ? [{ label: "vitest alone (baseline)", value: f(med(base, k)) }] : []),
  ];
  const mb = mk("node_modules_bytes", (b) => round(b / 1e6, 1)).map((r) => ({ ...r, text: `${r.value} MB` }));
  const pk = mk("packages").map((r) => ({ ...r, text: `${r.value}` }));
  const sec = mk("seconds").map((r) => ({ ...r, text: `${r.value} s` }));
  written.push(stack("install.svg", 760, "Install footprint (fresh directory, empty npm cache)", `npm ${I.method.match(/npm ([\d.]+)/)?.[1] ?? ""}; best of ${L.length} runs. Pact adds a ${round(P[0].natives.find((n) => /libpact_ffi/.test(n.file))?.bytes / 1e6 || 0, 1)} MB native libpact_ffi; contract-lanes has 0 runtime dependencies.`, [
    { title: "node_modules size", unit: "MB", rows: mb, max: 80, ticks: [0, 20, 40, 60, 80] },
    { title: "Installed packages", unit: "packages", rows: pk, max: 180, ticks: [0, 60, 120, 180] },
    { title: "Install time (includes downloads)", unit: "seconds", rows: sec, max: 16, ticks: [0, 4, 8, 12, 16] },
  ]));
}

// ---------- PNG copies (for viewers that don't render SVG) ----------
try {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  for (const scheme of ["light"]) {
    const page = await browser.newPage({ deviceScaleFactor: 2, colorScheme: scheme });
    for (const f of written) {
      const p = join(RESULTS, f);
      await page.goto("file://" + p);
      const el = await page.$("svg");
      await el.screenshot({ path: p.replace(/\.svg$/, ".png") });
    }
  }
  await browser.close();
  console.log("rendered PNGs");
} catch (e) { console.log("PNG rendering skipped:", e.message.split("\n")[0]); }
console.log("wrote", written.join(", "), "+ results.json");
