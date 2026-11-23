import { createRequire as __lanesRequire } from "node:module"; const require = __lanesRequire(import.meta.url);
import{graphFromReport,runCheck}from"./chunk-X5R6ZWEK.mjs";import{loadConfig}from"./chunk-7KIW5LMH.mjs";import"./chunk-SAOZF265.mjs";import"./chunk-DJGGXSDP.mjs";import"./chunk-UMKASGBC.mjs";import"./chunk-5AS3GD2Q.mjs";import{cachePath,findRoot,mtime,readJson,writeJson}from"./chunk-D5NHXJC4.mjs";import"./chunk-5RTKHCUT.mjs";import{createServer}from"node:http";import{existsSync,readFileSync}from"node:fs";var graph_default=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Lanes graph</title>
<style>
/* Layout: a one-screen tool. A header strip (name, repo, tallies, live state) sits over two panes:
   the contract graph fills the left, an inspector rail sits on the right; below 900px they stack.
   Lanes are places (sans), contracts are types (mono). Status is always glyph + word, never color alone. */
:root {
  color-scheme: light;
  --plane: #f2f4f7;   /* graph ground */
  --surface: #fff;    /* header, rail, lane boxes, chips */
  --sunken: #f4f6f8;  /* code wells */
  --ink: #14181d; --ink-2: #48505a; --muted: #646c78;
  --line: #dde1e7; --line-2: #c2c8d0;
  --accent: #2b55c9;  /* selection and focus only */
  --pass: #17843a; --fail: #cd2d39; --pending: #a26700; --untested: #7a828d;
  --pass-wash: #e5f3e9; --fail-wash: #fce8e9; --pending-wash: #f9efdc; --untested-wash: #edf0f3;
  --shadow: 0 1px 2px rgb(20 24 29 / .06), 0 2px 8px rgb(20 24 29 / .04);
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --plane: #0e1115; --surface: #161a20; --sunken: #1b2027;
    --ink: #e6e9ed; --ink-2: #aeb6c0; --muted: #858e99;
    --line: #262c34; --line-2: #3a424c;
    --accent: #7d9bff;
    --pass: #3db464; --fail: #f2626b; --pending: #d9a23a; --untested: #8a939e;
    --pass-wash: #16301f; --fail-wash: #3a1b1f; --pending-wash: #33280f; --untested-wash: #232830;
    --shadow: 0 1px 2px rgb(0 0 0 / .4);
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; height: 100vh; height: 100dvh; min-height: 560px; display: flex; flex-direction: column;
  background: var(--plane); color: var(--ink); font: 14px/1.45 var(--sans); }
.mono, code, pre { font-family: var(--mono); font-size: 12.5px; }
.s-pass { color: var(--pass); } .s-fail { color: var(--fail); } .s-pending { color: var(--pending); } .s-untested { color: var(--untested); }
.ico { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* header */
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 28px; background: var(--surface); border-bottom: 1px solid var(--line);
  padding-block: 12px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.brand svg { width: 20px; height: 20px; flex: none; }
h1 { font-size: 16px; font-weight: 650; margin: 0; letter-spacing: -.01em; }
.where { color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.where .mono { color: var(--ink-2); font-size: 12px; }
.tally { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--ink-2); }
.tally span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.tally b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }
.tally .zero { opacity: .55; }
.live { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); position: relative; }
.live[data-s="live"] i { background: var(--pass); }
.live[data-s="stale"] i { background: transparent; box-shadow: inset 0 0 0 2px var(--pending); }
.live i.ping::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--pass); animation: ping .9s ease-out forwards; }
@keyframes ping { from { opacity: .7; transform: scale(.6); } to { opacity: 0; transform: scale(1.6); } }

/* panes */
main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 384px; grid-template-rows: minmax(0, 1fr); }
.stage { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
#canvas { position: relative; flex: 1; min-height: 0; }
#canvas > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; transition: opacity .3s; }
body.stale #canvas > svg { opacity: .55; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; font-size: 12px; color: var(--muted);
  padding-block: 10px 14px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: 16px; }
.legend span { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.legend svg { width: 26px; height: 10px; stroke: var(--muted); stroke-width: 2; fill: none; }
aside { background: var(--surface); border-left: 1px solid var(--line); overflow: auto; min-width: 0; }
aside > section { padding: 18px 20px; border-bottom: 1px solid var(--line); }
aside > section:empty { display: none; }
body:not([data-state="ready"]) aside, body:not([data-state="ready"]) .legend, body:not([data-state="ready"]) .tally { display: none; }
body:not([data-state="ready"]) main { grid-template-columns: minmax(0, 1fr); }

/* graph */
#g text { font-family: var(--sans); }
.e { color: var(--untested); }
.e .vis { fill: none; stroke: currentColor; stroke-width: 2; }
.e.s-pass { color: var(--pass); } .e.s-fail { color: var(--fail); } .e.s-pending { color: var(--pending); }
.e.s-pending .vis { stroke-dasharray: 7 4; }
.e.s-untested .vis { stroke-dasharray: .1 5; stroke-linecap: round; }
.e .hit { fill: none; stroke: transparent; stroke-width: 16; cursor: pointer; }
.e .halo { fill: none; stroke: currentColor; stroke-width: 10; stroke-linecap: round; opacity: 0; }
.e.sel .halo { opacity: .16; }
.e.sel .vis, .e.hov .vis { stroke-width: 3; }
.n-box { fill: var(--surface); stroke: var(--line-2); stroke-width: 1; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / .07)); }
.node.rel .n-box { stroke: var(--ink-2); stroke-width: 1.5; }
.n-name { font-size: 13.5px; font-weight: 650; fill: var(--ink); }
.n-own { font-size: 12px; fill: var(--muted); }
.n-meta { font-size: 11.5px; fill: var(--ink-2); }
.n-meta.none { fill: var(--muted); }
.n-meta .warn { fill: var(--fail); font-weight: 600; }
.n-badge { fill: var(--fail); stroke: var(--plane); stroke-width: 2; }
.n-badge-t { font-size: 10.5px; font-weight: 700; fill: var(--surface); }
.chip { cursor: pointer; outline: none; }
.c-bg { fill: var(--surface); stroke: var(--line-2); stroke-width: 1; }
.c-st { fill: var(--untested-wash); }
.chip.s-pass .c-st { fill: var(--pass-wash); } .chip.s-fail .c-st { fill: var(--fail-wash); } .chip.s-pending .c-st { fill: var(--pending-wash); }
.c-name { font-family: var(--mono) !important; font-size: 11.5px; fill: var(--ink); }
.c-word { font-size: 11.5px; font-weight: 550; fill: var(--ink); }
.c-ico path { fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.c-ring { fill: none; stroke: none; stroke-width: 2; }
.chip:hover .c-bg, .chip.hov .c-bg { stroke: var(--ink-2); }
.chip.sel .c-bg { stroke: var(--ink); stroke-width: 1.5; }
.chip:focus-visible .c-ring { stroke: var(--accent); }
.g-note { font-size: 12.5px; fill: var(--muted); }

/* empty / loading / error */
.state { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px 16px; }
.state > div { max-width: 380px; text-align: center; display: grid; justify-items: center; gap: 8px; }
.state svg { width: 40px; height: 40px; color: var(--line-2); margin-bottom: 4px; }
.state h2 { font-size: 16px; margin: 0; font-weight: 650; text-wrap: balance; }
.state p { margin: 0; color: var(--ink-2); text-wrap: pretty; }
.state code { display: inline-block; margin-top: 6px; padding: 5px 10px; border-radius: 6px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
.state[data-s="loading"] svg .dash { animation: flow 1.2s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -8; } }

/* rail */
.eyebrow { margin: 0 0 10px; font-size: 11px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.eyebrow .n { font-variant-numeric: tabular-nums; letter-spacing: 0; font-weight: 600; color: var(--ink-2); background: var(--plane); border-radius: 4px; padding: 0 6px; }
.d-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0 0 14px; }
.d-title h2 { margin: 0; font-family: var(--mono); font-size: 17px; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }
.pill { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px 0 7px; border-radius: 5px; font-size: 12px; font-weight: 600; color: var(--ink); background: var(--untested-wash); }
.pill.s-pass { background: var(--pass-wash); } .pill.s-fail { background: var(--fail-wash); } .pill.s-pending { background: var(--pending-wash); }
.pill .ico { color: var(--untested); } .pill.s-pass .ico { color: var(--pass); } .pill.s-fail .ico { color: var(--fail); } .pill.s-pending .ico { color: var(--pending); }
.route { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; }
.route > div { min-width: 0; display: grid; }
.route > div:last-child { text-align: right; }
.route small { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.route b { font-weight: 650; overflow-wrap: anywhere; }
.route span { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.route svg { width: 34px; height: 10px; stroke: var(--ink-2); stroke-width: 1.5; fill: none; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; margin: 16px 0 0; }
.facts div { min-width: 0; }
.facts dt { font-size: 12px; color: var(--muted); }
.facts dd { margin: 1px 0 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.note { margin: 14px 0 0; color: var(--ink-2); text-wrap: pretty; }
.fail-box { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.fix { margin: 0 0 10px; color: var(--ink-2); }
.fix b { color: var(--ink); }
.msg { margin: 0; padding: 10px 12px; border-radius: 6px; background: var(--fail-wash); color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
.kv { display: flex; gap: 8px; align-items: baseline; margin: 12px 0 6px; font-size: 13px; color: var(--muted); }
.kv code { color: var(--ink); }
.repro { display: flex; align-items: flex-start; gap: 8px; padding: 8px 8px 8px 12px; border-radius: 6px; background: var(--sunken); border: 1px solid var(--line); }
.repro code { flex: 1; min-width: 0; padding-top: 3px; white-space: pre-wrap; overflow-wrap: anywhere; }
.repro code::before { content: "$ "; color: var(--muted); }
.repro .tok { white-space: nowrap; }
.repro .tok.long { white-space: normal; word-break: break-all; }
button { font: inherit; color: inherit; }
.copy { flex: none; font-size: 12px; font-weight: 550; height: 26px; padding: 0 10px; border-radius: 5px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); cursor: pointer; }
.copy:hover { border-color: var(--ink-2); }
.empty-sel h2 { margin: 0 0 4px; font-size: 15px; font-weight: 650; }
.empty-sel p { margin: 0; color: var(--ink-2); text-wrap: pretty; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.needs li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; padding: 8px 0; border-top: 1px solid var(--line); }
.needs li:first-child { border-top: 0; padding-top: 0; }
.needs .ico { margin-top: 3px; }
.needs .t { overflow-wrap: anywhere; }
.needs small { grid-column: 2; font-size: 12px; color: var(--muted); }
.clist button { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 1px 10px; align-items: center; text-align: left;
  padding: 7px 10px; margin: 0 -10px; width: calc(100% + 20px); border: 0; border-radius: 6px; background: none; cursor: pointer; }
.clist button:hover { background: var(--plane); }
.clist button[aria-pressed="true"] { background: var(--plane); box-shadow: inset 0 0 0 1px var(--line-2); }
.clist .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.clist .w { font-size: 12px; color: var(--ink-2); }
.clist small { grid-column: 2 / 4; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }

@media (max-width: 900px) {
  body { height: auto; min-height: 100vh; display: block; }
  main, body:not([data-state="ready"]) main { display: block; }
  #canvas { flex: none; height: 420px; }
  body:not([data-state="ready"]) #canvas { height: 62vh; min-height: 360px; }
  aside { border-left: 0; border-top: 1px solid var(--line); overflow: visible; }
  aside > section { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .bar { flex-wrap: nowrap; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; }
  .tally { grid-column: 1 / -1; grid-row: 2; }
  .live .t { display: none; }
}
@media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
</style>
</head>
<body data-state="loading">
<header class="bar">
  <div class="brand">
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 2.5v15M16.5 2.5v15"/><path d="M10 3v2.4M10 8.8v2.4M10 14.6V17"/></svg>
    <h1>Lanes</h1>
    <span class="where" id="where"></span>
  </div>
  <div class="tally" id="tally" aria-label="Contracts by status"></div>
  <div class="live" id="live" data-s="wait" role="status"><i id="dot"></i><span id="liveText">Connecting</span></div>
</header>
<main>
  <section class="stage" aria-label="Contract graph">
    <div id="canvas">
      <svg id="g" role="group" aria-label="Lanes and the contracts between them"></svg>
      <div class="state" id="state" data-s="loading"></div>
    </div>
    <div class="legend" aria-hidden="true">
      <span><svg viewBox="0 0 26 10"><path d="M1 5h18"/><path d="M18 1.5 24 5l-6 3.5" stroke-linejoin="round"/></svg>producer to consumer</span>
      <span><svg viewBox="0 0 26 10"><path d="M1 5h24"/></svg>pass / fail</span>
      <span><svg viewBox="0 0 26 10"><path d="M1 5h24" stroke-dasharray="7 4"/></svg>pending request</span>
      <span><svg viewBox="0 0 26 10"><path d="M2 5h23" stroke-dasharray=".1 5" stroke-linecap="round"/></svg>no consumer test</span>
    </div>
  </section>
  <aside id="rail" aria-label="Details">
    <section id="detail" aria-live="polite"></section>
    <section id="needs" class="needs"></section>
    <section id="list" class="clist"></section>
  </aside>
</main>
<script>
const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const ORDER = ["fail", "pending", "untested", "pass"];
const WORD = { pass: "pass", fail: "fail", pending: "pending", untested: "untested" };
// Drawn equivalents of the CLI's \u2705 \u274C \u23F3 \u25CB, on a 16px grid, stroked in the status color.
const GLYPH = { pass: "M3.5 8.6l3 3 6-7", fail: "M4.5 4.5l7 7m0-7l-7 7", pending: "M8 2.6a5.4 5.4 0 1 0 0 10.8A5.4 5.4 0 1 0 8 2.6zM8 5.2v3l2 1.4", untested: "M8 3a5 5 0 1 0 0 10A5 5 0 1 0 8 3z" };
const EMOJI = { "\u2705": "pass", "\u274C": "fail", "\u23F3": "pending", "\u25CB": "untested" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ico = (s) => \`<svg class="ico s-\${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="\${GLYPH[s]}"/></svg>\`;
const pill = (s) => \`<span class="pill s-\${s}">\${ico(s)}\${WORD[s]}</span>\`;
const plural = (n, w) => \`\${n} \${w}\${n === 1 ? "" : "s"}\`;
const el = (tag, attrs, parent, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; parent && parent.appendChild(e); return e; };
const keyOf = (e) => \`\${e.contract}|\${e.producer}|\${e.consumer}\`;
const narrow = matchMedia("(max-width: 900px)");
let data = null, stamp, sel = null, seenData = false, lastOk = 0, failed = false, edgesByKey = {};

const issue = (n) => /^[\\w.-]+\\/[\\w.-]+$/.test(data?.repo || "") ? \`<a href="https://github.com/\${esc(data.repo)}/issues/\${n}" target="_blank" rel="noopener">#\${n}</a>\` : \`#\${n}\`;
const ownerOf = (lane) => data.nodes.find((n) => n.lane === lane)?.owner || "";
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 45 ? "just now" : s < 3600 ? \`\${Math.round(s / 60)} min ago\` : s < 86400 ? \`\${Math.round(s / 3600)} h ago\` : \`on \${new Date(t).toLocaleDateString([], { month: "short", day: "numeric" })}\`; };
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ---- states: loading | empty (no report yet) | nolanes | offline | ready
const LANES_ICON = \`<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M7 4v32M33 4v32"/><path class="dash" d="M20 4v32" stroke-dasharray="4 4"/></svg>\`;
const STATES = {
  loading: ["Loading the contract graph", "Reading graph.json from the lanes graph server."],
  empty: ["No check results yet", "Run a check in this repo. The graph appears here as soon as a report exists.", "npx lanes check"],
  nolanes: ["No lanes defined", "Add lanes to lanes.yaml, then run a check.", "npx lanes check"],
  offline: ["Can't reach the graph server", "Start it again and this page reconnects on its own, retrying every 1.5 s.", "npx lanes graph"],
};
function setState(s) {
  document.body.dataset.state = s;
  const st = $("state");
  st.hidden = s === "ready";
  if (s === "ready") return;
  const [h, p, cmd] = STATES[s];
  st.dataset.s = s;
  st.innerHTML = \`<div>\${LANES_ICON}<h2>\${h}</h2><p>\${p}</p>\${cmd ? \`<code>\${cmd}</code>\` : ""}</div>\`;
  $("g").innerHTML = "";
}

// ---- geometry
const hitRect = (a, b, m) => a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h;
const bez = (p, t) => { const u = 1 - t; return p.length === 3
  ? { x: u * u * p[0].x + 2 * u * t * p[1].x + t * t * p[2].x, y: u * u * p[0].y + 2 * u * t * p[1].y + t * t * p[2].y }
  : { x: u ** 3 * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t ** 3 * p[3].x, y: u ** 3 * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t ** 3 * p[3].y }; };
const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
// from point p inside box B, walk along u to B's border, then \`gap\` further
const exit = (p, u, B, gap) => { const tx = u.x > 0 ? (B.x + B.hw - p.x) / u.x : u.x < 0 ? (B.x - B.hw - p.x) / u.x : 1e9, ty = u.y > 0 ? (B.y + B.hh - p.y) / u.y : u.y < 0 ? (B.y - B.hh - p.y) / u.y : 1e9; const t = Math.min(tx, ty) + gap; return { x: p.x + u.x * t, y: p.y + u.y * t }; };

// Lanes sit on an ellipse; for up to 7 lanes try every cyclic order and keep the one with fewest crossing contracts.
function arrange(names, edges) {
  const n = names.length, ix = Object.fromEntries(names.map((l, i) => [l, i])), w = {};
  for (const e of edges) { const a = ix[e.producer], b = ix[e.consumer]; if (a == null || b == null || a === b) continue; const k = Math.min(a, b) + "," + Math.max(a, b); w[k] = (w[k] || 0) + 1; }
  const pairs = Object.entries(w).map(([k, c]) => [...k.split(",").map(Number), c]);
  if (n < 4 || n > 7) return names;
  let best = null, bestCost = Infinity;
  const cost = (slot) => { let c = 0; for (let i = 0; i < pairs.length; i++) {
    const [a, b, ca] = pairs[i], d = Math.abs(slot[a] - slot[b]); c += ca * Math.min(d, n - d) * 0.01;
    for (let j = i + 1; j < pairs.length; j++) { const [x, y, cb] = pairs[j]; if (x === a || x === b || y === a || y === b) continue;
      const lo = Math.min(slot[a], slot[b]), hi = Math.max(slot[a], slot[b]), inX = slot[x] > lo && slot[x] < hi, inY = slot[y] > lo && slot[y] < hi;
      if (inX !== inY) c += ca * cb; } } return c; };
  const perm = names.map((_, i) => i);
  const rec = (k) => { if (k === n) { const c = cost(perm); if (c < bestCost - 1e-9) { bestCost = c; best = perm.slice(); } return; }
    for (let i = k; i < n; i++) { [perm[k], perm[i]] = [perm[i], perm[k]]; rec(k + 1); [perm[k], perm[i]] = [perm[i], perm[k]]; } };
  rec(1);
  const out = []; best.forEach((slot, i) => (out[slot] = names[i])); return out;
}

function render() {
  const svg = $("g"), canvas = $("canvas");
  const focusKey = document.activeElement?.dataset?.k;
  const n = data.nodes.length;
  if (narrow.matches) canvas.style.height = (n <= 2 ? 280 : n === 3 ? 400 : n === 4 ? 500 : 700) + "px"; else canvas.style.height = "";
  const W = canvas.clientWidth, H = canvas.clientHeight, PAD = 18, compact = W < 560;
  svg.innerHTML = ""; svg.setAttribute("viewBox", \`0 0 \${W} \${H}\`);
  svg.setAttribute("aria-label", \`\${plural(n, "lane")} and \${plural(data.edges.length, "contract")} between them\`);
  const mt = el("text", {}, svg);
  const measure = (s, cls) => { mt.setAttribute("class", cls); mt.textContent = s; return mt.getComputedTextLength(); };

  // lane boxes
  const NH = compact ? 42 : 50, box = {};
  for (const node of data.nodes) {
    const bits = [node.openBlockers && plural(node.openBlockers, "blocker"), node.openRequests && plural(node.openRequests, "request"), node.claimedFixes?.length && \`fixing \${node.claimedFixes.map((i) => "#" + i).join(" ")}\`].filter(Boolean);
    const meta = bits.join(" \xB7 ") || "no open issues", own = node.owner || "no owner";
    const w = compact ? Math.min(150, Math.max(70, measure(node.lane, "n-name"), measure(own, "n-own")) + 24)
      : Math.min(260, Math.max(112, measure(node.lane, "n-name") + 14 + measure(own, "n-own"), measure(meta, "n-meta")) + 26);
    box[node.lane] = { node, meta, own, hasBits: bits.length > 0, hw: w / 2, hh: NH / 2 };
  }
  const maxHW = Math.max(...Object.values(box).map((b) => b.hw), 56);
  const names = arrange(data.nodes.map((x) => x.lane), data.edges);
  const portrait = H > W * 1.05;
  const start = n === 4 ? -45 : n % 2 === 0 && !portrait ? -90 + 180 / n : -90;
  const u = names.map((_, i) => { const a = ((start + (360 * i) / n) * Math.PI) / 180; return { x: Math.round(Math.cos(a) * 1e6) / 1e6, y: Math.round(Math.sin(a) * 1e6) / 1e6 }; });
  const span = (k) => Math.max(...u.map((p) => p[k])) - Math.min(...u.map((p) => p[k])) || 1;
  const mid = (k) => (Math.max(...u.map((p) => p[k])) + Math.min(...u.map((p) => p[k]))) / 2;
  const sx = Math.max(0, Math.min(W - 2 * (maxHW + (compact ? PAD : 56)), n <= 2 ? 460 : 820)) / span("x");
  const sy = Math.max(0, Math.min(H - 2 * (NH / 2 + PAD + 24), 560)) / span("y");
  names.forEach((l, i) => Object.assign(box[l], { x: W / 2 + (u[i].x - mid("x")) * sx, y: H / 2 + (u[i].y - mid("y")) * sy }));
  if (n === 1) Object.assign(box[names[0]], { x: W / 2, y: H / 2 });
  const rects = Object.values(box).map((b) => ({ x: b.x - b.hw, y: b.y - b.hh, w: b.hw * 2, h: b.hh * 2 }));

  // contract curves: contracts between the same pair fan out on either side of the straight line
  const groups = {}, geo = [];
  edgesByKey = {};
  data.edges.forEach((e) => { const k = keyOf(e); edgesByKey[k] = e; if (!box[e.producer] || !box[e.consumer]) return; const g = [e.producer, e.consumer].sort().join("\\0"); (groups[g] ||= []).push(e); });
  const chipW = {};
  for (const e of data.edges) { const st = 7 + 14 + 4 + measure(WORD[e.status], "c-word") + 9; chipW[keyOf(e)] = { cw: measure(e.contract, "c-name"), st }; }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => (a.producer > b.producer) - (b.producer > a.producer) || a.contract.localeCompare(b.contract));
    // siblings sit far enough apart that a label on one line never covers the next line
    const [A0, B0] = [box[list[0].producer], box[list[0].consumer]].sort((a, b) => (a.node.lane > b.node.lane) - (b.node.lane > a.node.lane));
    const d0 = unit(A0, B0), wmax = Math.max(...list.map((e) => { const c = chipW[keyOf(e)]; return compact ? c.st : 17 + c.cw + c.st; }));
    const GAP = Math.min(compact ? 70 : 110, Math.max(34, Math.abs(d0.y) * wmax / 2 + Math.abs(d0.x) * 11 + 10));
    list.forEach((e, j) => {
      const P = box[e.producer], C = box[e.consumer];
      let p;
      if (P === C) { // a lane consuming its own contract: a loop over the box
        const h = 52 + 30 * j, x0 = P.x - 18, x1 = P.x + 18, y0 = P.y - P.hh - 2;
        p = [{ x: x0, y: y0 }, { x: x0 - 22, y: y0 - h }, { x: x1 + 22, y: y0 - h }, { x: x1, y: y0 - 9 }];
      } else {
        const [A, B] = e.producer < e.consumer ? [P, C] : [C, P], d = unit(A, B), nv = { x: -d.y, y: d.x };
        const o = (j - (list.length - 1) / 2) * GAP;
        const ext = (Q) => 1 / Math.max(Math.abs(nv.x) / Q.hw, Math.abs(nv.y) / Q.hh);
        const lim = 0.55 * Math.min(ext(P), ext(C)), s = Math.max(-lim, Math.min(lim, o * 0.6));
        const p0 = { x: P.x + nv.x * s, y: P.y + nv.y * s }, p2 = { x: C.x + nv.x * s, y: C.y + nv.y * s };
        const q = { x: (P.x + C.x) / 2 + nv.x * (2 * o - s), y: (P.y + C.y) / 2 + nv.y * (2 * o - s) };
        p = [exit(p0, unit(p0, q), P, 3), q, exit(p2, unit(p2, q), C, 11)];
      }
      const samples = []; for (let i = 0; i <= 60; i++) samples.push(bez(p, i / 60));
      geo.push({ e, k: keyOf(e), p, samples });
    });
  }

  // label chips: failures pick first; slide along the own curve to dodge lanes, other chips and other lines
  const placed = [];
  const TS = [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72, 0.22, 0.78];
  const byRank = [...geo].sort((a, b) => ORDER.indexOf(a.e.status) - ORDER.indexOf(b.e.status) || a.e.contract.localeCompare(b.e.contract));
  for (const G of byRank) {
    const { cw, st: stW } = chipW[G.k];
    let best = null;
    for (const full of [true, false]) {
      const w = full ? 9 + cw + 8 + stW : stW;
      for (const t of G.p.length === 4 ? [0.5] : TS) {
        const c = bez(G.p, t), r = { x: c.x - w / 2, y: c.y - 11, w, h: 22 };
        let cost = Math.abs(t - 0.5) * 8 + (full ? 0 : 60);
        if (r.x < 4 || r.y < 4 || r.x + w > W - 4 || r.y + 22 > H - 4) cost += 1000;
        for (const b of rects) if (hitRect(r, b, 6)) cost += 1000;
        const p0 = G.p[0], p1 = G.p[G.p.length - 1]; // keep the line's start and its arrowhead visible
        if (hitRect(r, { x: p0.x, y: p0.y, w: 0, h: 0 }, 8) || hitRect(r, { x: p1.x, y: p1.y, w: 0, h: 0 }, 16)) cost += 1000;
        for (const q of placed) if (hitRect(r, q, 4)) cost += 1000; else if (hitRect(r, q, 12)) cost += 12;
        for (const o of geo) if (o !== G && o.samples.some((s) => s.x > r.x - 3 && s.x < r.x + w + 3 && s.y > r.y - 3 && s.y < r.y + 25)) cost += 25;
        if (!best || cost < best.cost) best = { cost, r, full, cw, stW };
      }
      if (best.cost < 100) break;
    }
    placed.push(best.r); G.chip = best;
  }

  // paint: lines (passing under failing), lanes, then chips on top
  const defs = el("defs", {}, svg);
  for (const s of ORDER) { const m = el("marker", { id: \`ar-\${s}\`, viewBox: "0 0 10 10", refX: 2, refY: 5, markerWidth: 10, markerHeight: 10, markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
    el("path", { d: "M0 0.8 10 5 0 9.2 2.2 5z", class: \`s-\${s}\`, fill: "currentColor" }, m); }
  const lines = el("g", {}, svg), lanes = el("g", {}, svg), chips = el("g", {}, svg);
  const pick = (k) => () => select(k, true);
  for (const G of [...byRank].reverse()) {
    const d = G.p.length === 3 ? \`M\${G.p[0].x} \${G.p[0].y}Q\${G.p[1].x} \${G.p[1].y} \${G.p[2].x} \${G.p[2].y}\` : \`M\${G.p[0].x} \${G.p[0].y}C\${G.p[1].x} \${G.p[1].y} \${G.p[2].x} \${G.p[2].y} \${G.p[3].x} \${G.p[3].y}\`;
    const g = el("g", { class: \`e s-\${G.e.status}\`, "data-k": G.k }, lines);
    el("path", { d, class: "halo" }, g); el("path", { d, class: "vis", "marker-end": \`url(#ar-\${G.e.status})\` }, g); el("path", { d, class: "hit" }, g);
    g.addEventListener("click", pick(G.k));
  }
  for (const l of names) {
    const b = box[l], g = el("g", { class: "node", "data-lane": l, transform: \`translate(\${b.x - b.hw} \${b.y - b.hh})\` }, lanes);
    el("title", {}, g, \`\${l} \xB7 \${b.own} \xB7 \${b.meta}\`);
    el("rect", { class: "n-box", width: b.hw * 2, height: NH, rx: 8 }, g);
    if (compact) {
      el("text", { class: "n-name", x: 11, y: 18 }, g, l); el("text", { class: "n-own", x: 11, y: 33 }, g, b.own);
      if (b.node.openBlockers) { el("circle", { class: "n-badge", cx: b.hw * 2 - 2, cy: 2, r: 8.5 }, g); el("text", { class: "n-badge-t", x: b.hw * 2 - 2, y: 5.5, "text-anchor": "middle" }, g, b.node.openBlockers); }
      continue;
    }
    el("text", { class: "n-name", x: 13, y: 21 }, g, l);
    el("text", { class: "n-own", x: b.hw * 2 - 13, y: 21, "text-anchor": "end" }, g, b.own);
    const t = el("text", { class: \`n-meta\${b.hasBits ? "" : " none"}\`, x: 13, y: 38 }, g);
    if (b.node.openBlockers) { el("tspan", { class: "warn" }, t, plural(b.node.openBlockers, "blocker")); el("tspan", {}, t, b.meta.slice(plural(b.node.openBlockers, "blocker").length)); }
    else t.textContent = b.meta;
  }
  for (const G of byRank) {
    const { r, full, cw, stW } = G.chip, e = G.e;
    const g = el("g", { class: \`chip s-\${e.status}\`, "data-k": G.k, tabindex: 0, role: "button", transform: \`translate(\${r.x} \${r.y})\`,
      "aria-label": \`\${e.contract}, \${e.producer} to \${e.consumer}: \${WORD[e.status]}\` }, chips);
    el("title", {}, g, \`\${e.contract}  \${e.producer} \u2192 \${e.consumer}  \xB7  \${WORD[e.status]}\`);
    el("rect", { class: "c-ring", x: -3, y: -3, width: r.w + 6, height: 28, rx: 7 }, g);
    el("rect", { class: "c-bg", x: 0.5, y: 0.5, width: r.w - 1, height: 21, rx: 5 }, g);
    const x0 = r.w - stW;
    el("path", { class: "c-st", d: full ? \`M\${x0} 1H\${r.w - 5.5}a4.5 4.5 0 0 1 4.5 4.5v11a4.5 4.5 0 0 1-4.5 4.5H\${x0}z\` : \`M5.5 1H\${r.w - 5.5}a4.5 4.5 0 0 1 4.5 4.5v11a4.5 4.5 0 0 1-4.5 4.5H5.5A4.5 4.5 0 0 1 1 16.5v-11A4.5 4.5 0 0 1 5.5 1z\` }, g);
    if (full) el("text", { class: "c-name", x: 9, y: 15 }, g, e.contract);
    const ig = el("g", { class: "c-ico", transform: \`translate(\${x0 + 7} 4) scale(.875)\` }, g); el("path", { d: GLYPH[e.status] }, ig);
    el("text", { class: "c-word", x: x0 + 25, y: 15 }, g, WORD[e.status]);
    g.addEventListener("click", pick(G.k));
    g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(G.k, true); } });
  }
  if (!data.edges.length && n) el("text", { class: "g-note", x: W / 2, y: H - 20, "text-anchor": "middle" }, svg, "No contracts between these lanes yet.");
  mt.remove();
  svg.onpointerover = (ev) => { const k = ev.target.closest("[data-k]")?.dataset.k; svg.querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("hov", x.dataset.k === k)); };
  svg.onpointerleave = () => svg.querySelectorAll(".hov").forEach((x) => x.classList.remove("hov"));
  svg.onclick = (ev) => { if (!ev.target.closest("[data-k]")) select(null); };
  if (focusKey) svg.querySelector(\`.chip[data-k="\${CSS.escape(focusKey)}"]\`)?.focus({ preventScroll: true });
  mark();
}

function mark() {
  const e = edgesByKey[sel];
  $("g").querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("sel", x.dataset.k === sel));
  $("g").querySelectorAll(".node").forEach((x) => x.classList.toggle("rel", !!e && (x.dataset.lane === e.producer || x.dataset.lane === e.consumer)));
  $("list").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === sel));
}

function select(k, fromGraph) {
  sel = k && edgesByKey[k] ? k : null;
  mark(); detail();
  if (sel && narrow.matches && fromGraph !== "list" && fromGraph) $("detail").scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function detail() {
  const e = edgesByKey[sel], D = $("detail");
  if (!e) {
    const fails = data.edges.filter((x) => x.status === "fail").length;
    D.innerHTML = \`<div class="empty-sel"><h2>\${data.edges.length && !fails && data.edges.every((x) => x.status === "pass") ? \`All \${plural(data.edges.length, "contract")} pass\` : "Select a contract"}</h2>
      <p>Click a line or its label in the graph, or pick one from the list below, to see its fixtures, tests and failures.</p></div>\`;
    return;
  }
  const f = e.topFailure, own = (l) => ownerOf(l) ? \`<span>\${esc(ownerOf(l))}</span>\` : "";
  const notes = { pass: "Every fixture and consumer test passes.",
    pending: \`Waiting on \${e.pendingIssues.length ? "request " + e.pendingIssues.map(issue).join(", ") : "an open request"} before this contract can be checked.\`,
    untested: \`<b>\${esc(e.consumer)}</b> has no consumer test for this contract yet.\` };
  D.innerHTML = \`<p class="eyebrow">Contract</p>
    <div class="d-title"><h2>\${esc(e.contract)}</h2>\${pill(e.status)}</div>
    <div class="route"><div><small>producer</small><b>\${esc(e.producer)}</b>\${own(e.producer)}</div>
      <svg viewBox="0 0 34 10" aria-label="to"><path d="M1 5h30M26 1.5 31.5 5 26 8.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div><small>consumer</small><b>\${esc(e.consumer)}</b>\${own(e.consumer)}</div></div>
    <dl class="facts">
      <div><dt>Version</dt><dd class="mono">v\${esc(e.version)}</dd></div>
      <div><dt>Fixtures</dt><dd>\${e.fixtures.valid} valid \xB7 \${e.fixtures.invalid} invalid</dd></div>
      <div><dt>Consumer tests</dt><dd>\${e.consumerTests || "none"}</dd></div>
      <div><dt>Pending issues</dt><dd>\${e.pendingIssues.length ? e.pendingIssues.map(issue).join(", ") : "none"}</dd></div>
    </dl>
    \${f ? \`<div class="fail-box"><p class="eyebrow">Top failure</p>
      <p class="fix">Fix owned by <b>\${esc(f.owner)}</b>\${ownerOf(f.owner) ? \` (\${esc(ownerOf(f.owner))})\` : ""}</p>
      <pre class="msg">\${esc(f.message)}</pre>
      \${f.seed != null ? \`<div class="kv">Seed <code>\${esc(f.seed)}</code></div>\` : ""}
      \${f.repro ? \`<div class="kv">Reproduce</div><div class="repro"><code id="repro">\${String(f.repro).split(/(\\s+)/).map((t) => /^\\s*$/.test(t) ? t : \`<span class="tok\${t.length > 24 ? " long" : ""}">\${esc(t)}</span>\`).join("")}</code><button class="copy" id="copy" type="button">Copy</button></div>\` : ""}
    </div>\` : notes[e.status] ? \`<p class="note">\${notes[e.status]}</p>\` : ""}\`;
  const btn = $("copy");
  if (btn) btn.onclick = async () => {
    try { await navigator.clipboard.writeText(f.repro); btn.textContent = "Copied"; }
    catch { const r = document.createRange(); r.selectNodeContents($("repro")); getSelection().removeAllRanges(); getSelection().addRange(r); btn.textContent = "Press Ctrl+C"; }
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  };
}

function rail() {
  const c = Object.fromEntries(ORDER.map((s) => [s, 0])); data.edges.forEach((e) => c[e.status]++);
  $("tally").innerHTML = ORDER.map((s) => \`<span class="\${c[s] ? "" : "zero"}">\${ico(s)}<b>\${c[s]}</b>\${WORD[s]}</span>\`).join("");
  document.title = \`\${c.fail ? \`\${c.fail} failing \xB7 \` : ""}Lanes\${data.repo ? " \xB7 " + data.repo : ""}\`;
  const no = data.needsOwner || [];
  $("needs").innerHTML = no.length ? \`<h3 class="eyebrow">Needs an owner <span class="n">\${no.length}</span></h3><ul class="rows">\${no.map((x) => {
    const m = String(x.title).match(/^(\u2705|\u274C|\u23F3|\u25CB)\uFE0F?\\s*/), s = m && EMOJI[m[1]];
    return \`<li>\${s ? ico(s) : ico("pending")}<span class="t">\${esc(m ? x.title.slice(m[0].length) : x.title)}</span><small>\${issue(x.issue)} \xB7 waiting on \${esc(x.to)}</small></li>\`; }).join("")}</ul>\` : "";
  const rows = [...data.edges].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.contract.localeCompare(b.contract));
  $("list").innerHTML = rows.length ? \`<h3 class="eyebrow">Contracts <span class="n">\${rows.length}</span></h3><ul class="rows">\${rows.map((e) =>
    \`<li><button type="button" data-k="\${esc(keyOf(e))}" aria-pressed="false">\${ico(e.status)}<span class="mono">\${esc(e.contract)}</span><span class="w">\${WORD[e.status]}</span><small>\${esc(e.producer)} \u2192 \${esc(e.consumer)}</small></button></li>\`).join("")}</ul>\` : "";
  $("list").querySelectorAll("button").forEach((b) => (b.onclick = () => select(b.dataset.k, "list")));
}

function header() {
  $("where").innerHTML = data ? \`\${data.repo ? \`<span class="mono">\${esc(data.repo)}</span> \xB7 \` : ""}checked \${ago(data.fromReport)}\` : "";
  const live = $("live"), stale = Date.now() - lastOk > 4000 && lastOk;
  live.dataset.s = !lastOk ? (failed ? "stale" : "wait") : stale ? "stale" : "live";
  $("liveText").innerHTML = !lastOk ? (failed ? \`Not connected<span class="t"> \xB7 retrying</span>\` : "Connecting") : stale ? \`Reconnecting<span class="t"> \xB7 last update \${clock(lastOk)}</span>\` : \`Live<span class="t"> \xB7 updated \${clock(stamp ?? lastOk)}</span>\`;
  document.body.classList.toggle("stale", !!stale && !!data);
}

async function tick() {
  try {
    const r = await fetch("graph.json", { cache: "no-store" });
    const j = r.ok ? await r.json() : {};
    lastOk = Date.now();
    if (!Array.isArray(j.nodes) || !Array.isArray(j.edges)) { data = null; stamp = undefined; setState("empty"); }
    else if (!j.nodes.length) { data = null; stamp = undefined; setState("nolanes"); }
    else if (j.generatedAt !== stamp || document.body.dataset.state !== "ready") {
      const ping = stamp !== undefined; stamp = j.generatedAt; data = j;
      setState("ready"); rail();
      render();
      if (!seenData) { seenData = true; const f = data.edges.find((e) => e.status === "fail"); sel = f ? keyOf(f) : null; }
      select(sel);
      if (ping) { const d = $("dot"); d.classList.remove("ping"); void d.offsetWidth; d.classList.add("ping"); }
    }
  } catch { failed = true; if (!data) setState("offline"); }
  header();
  setTimeout(tick, 1500);
}
let raf; addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => data && render()); });
addEventListener("keydown", (ev) => { if (ev.key === "Escape" && sel) select(null); });
setState("loading"); tick();
</script>
</body>
</html>
`;async function graph(cwd,o){let root=findRoot(cwd);if(!root)return process.stderr.write(`lanes graph: no lanes.yaml
`),2;let refresh=()=>{let report=readJson(cachePath(root,"report.json"));if(!report)return!1;if(mtime(cachePath(root,"graph.json"))>=mtime(cachePath(root,"report.json"))&&mtime(cachePath(root,"graph.json"))>=mtime(cachePath(root,"issues.json")))return!0;let cfg=loadConfig(root).cfg,owners=Object.fromEntries(Object.entries(cfg?.lanes??{}).map(([l,d])=>[l,d.owner]));return writeJson(cachePath(root,"graph.json"),graphFromReport(report,{owners,issues:readJson(cachePath(root,"issues.json"))?.issues??[]})),!0};if(refresh()||(process.stdout.write(`no check report yet; running lanes check first\u2026
`),await runCheck({cwd:root}),refresh()),process.stdout.write(`wrote ${cachePath(root,"graph.json")}
`),!o.serve)return 0;let server=createServer((req,res)=>{if(req.url?.startsWith("/graph.json")){refresh();let f=cachePath(root,"graph.json");res.writeHead(existsSync(f)?200:404,{"content-type":"application/json","cache-control":"no-store"}),res.end(existsSync(f)?readFileSync(f):"{}");return}res.writeHead(200,{"content-type":"text/html; charset=utf-8"}),res.end(graph_default)});return await new Promise((resolve,reject)=>{server.once("error",reject),server.listen(o.port,"127.0.0.1",resolve)}),process.stdout.write(`lanes graph: http://localhost:${o.port}  (live: reloads when graph.json changes; Ctrl+C to stop)
`),new Promise(()=>{})}export{graph};
