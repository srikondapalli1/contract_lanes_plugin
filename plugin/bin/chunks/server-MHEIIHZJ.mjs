import { createRequire as __lanesRequire } from "node:module"; const require = __lanesRequire(import.meta.url);
import{graphFromReport,runCheck}from"./chunk-GTKQHFNP.mjs";import{loadConfig}from"./chunk-HKTRKWD4.mjs";import"./chunk-SAOZF265.mjs";import"./chunk-K76JWJ6Q.mjs";import"./chunk-ASKJ3BQ4.mjs";import"./chunk-5AS3GD2Q.mjs";import{cachePath,findRoot,mtime,readJson,writeJson}from"./chunk-D5NHXJC4.mjs";import"./chunk-5RTKHCUT.mjs";import{createServer}from"node:http";import{existsSync,readFileSync}from"node:fs";var graph_default=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lanes graph</title>
<style>
  :root {
    --bg: #f7f7f5; --panel: #ffffff; --ink: #1d1d1b; --muted: #6b6b66; --line: #d9d8d3;
    --pass: #1a7f37; --fail: #cf222e; --pending: #9a6700; --untested: #6e7781;
    --node: #ffffff; --node-ink: #1d1d1b; --accent: #2f5bd3;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #151514; --panel: #1f1f1d; --ink: #ecebe6; --muted: #a3a29b; --line: #3a3936;
      --pass: #3fb950; --fail: #ff6b6b; --pending: #d29922; --untested: #8b949e; --node: #262624; --node-ink: #ecebe6; --accent: #7aa2ff; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: baseline; padding: 14px 20px; border-bottom: 1px solid var(--line); }
  h1 { font-size: 16px; margin: 0; letter-spacing: .02em; }
  .muted { color: var(--muted); }
  .summary span { margin-right: 12px; white-space: nowrap; }
  .live { margin-left: auto; font-size: 12px; }
  .live::before { content: "\u25CF"; color: var(--pass); margin-right: 6px; }
  .live.stale::before { color: var(--pending); }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: calc(100vh - 54px); }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; } aside { border-left: 0; border-top: 1px solid var(--line); } }
  svg { width: 100%; height: 100%; min-height: 420px; display: block; }
  aside { border-left: 1px solid var(--line); background: var(--panel); padding: 16px 18px; overflow: auto; }
  aside h2 { font-size: 15px; margin: 0 0 6px; }
  .edge path { fill: none; stroke-width: 2.5; cursor: pointer; }
  .edge .hit { stroke: transparent; stroke-width: 16; }
  .edge text { font-size: 12px; fill: var(--ink); paint-order: stroke; stroke: var(--bg); stroke-width: 4px; cursor: pointer; }
  .edge.sel path.vis { stroke-width: 4.5; }
  .node rect { fill: var(--node); stroke: var(--line); stroke-width: 1.5; }
  .node .name { font-weight: 650; font-size: 14px; fill: var(--node-ink); }
  .node .meta { font-size: 11.5px; fill: var(--muted); }
  .s-pass { color: var(--pass); stroke: var(--pass); }
  .s-fail { color: var(--fail); stroke: var(--fail); }
  .s-pending { color: var(--pending); stroke: var(--pending); stroke-dasharray: 7 5; }
  .s-untested { color: var(--untested); stroke: var(--untested); stroke-dasharray: 2 5; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 99px; border: 1px solid currentColor; font-size: 12px; font-weight: 600; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 12px 0; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  code, pre { font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0; }
  button { font: inherit; font-size: 12px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
  .list { margin: 8px 0 0; padding-left: 18px; }
  .empty { padding: 40px; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>Lanes</h1><span class="muted" id="repo"></span>
  <div class="summary" id="summary"></div>
  <span class="live muted" id="live">live</span>
</header>
<main>
  <svg id="g" role="img" aria-label="Lanes and the contracts between them"></svg>
  <aside id="side"><h2>Click a contract edge</h2><p class="muted">Edges are contracts (producer \u2192 consumer). Color and the text label both carry the status.</p><div id="needs"></div></aside>
</main>
<script>
const WORD = { pass: "pass", fail: "fail", pending: "pending", untested: "untested" };
const ICON = { pass: "\u2705", fail: "\u274C", pending: "\u23F3", untested: "\u25CB" };
let data = null, sel = null, stamp = 0;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };

function render() {
  const svg = $("g"); svg.innerHTML = "";
  if (!data || !data.nodes) { svg.outerHTML; return; }
  $("repo").textContent = data.repo || "";
  const c = { pass: 0, fail: 0, pending: 0, untested: 0 };
  data.edges.forEach((e) => c[e.status]++);
  $("summary").innerHTML = Object.keys(c).map((k) => \`<span class="s-\${k}">\${ICON[k]} \${c[k]} \${WORD[k]}</span>\`).join("");
  const W = svg.clientWidth || 800, H = Math.max(svg.clientHeight || 520, 420);
  svg.setAttribute("viewBox", \`0 0 \${W} \${H}\`);
  const n = data.nodes.length, cx = W / 2, cy = H / 2, R = Math.max(120, Math.min(W, H) / 2 - 80);
  const pos = {};
  data.nodes.forEach((node, i) => {
    const a = n === 2 ? (i ? 0 : Math.PI) : -Math.PI / 2 + (2 * Math.PI * i) / n;
    pos[node.lane] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const pairs = {};
  const labels = [];
  const layer = el("g", {}, svg);
  // trim a point at node center back to the node box edge, along unit vector (ux, uy)
  const trim = (p, ux, uy) => { const t = Math.min(84 / (Math.abs(ux) || 1e-9), 38 / (Math.abs(uy) || 1e-9)); return { x: p.x + ux * t, y: p.y + uy * t }; };
  data.edges.forEach((e, idx) => {
    const a = pos[e.producer], b = pos[e.consumer];
    if (!a || !b) return;
    const [A, B] = e.producer < e.consumer ? [a, b] : [b, a]; // canonical frame per pair, so sides are stable
    const key = [e.producer, e.consumer].sort().join("|");
    const k = (pairs[key] = (pairs[key] ?? -1) + 1);
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (nx * ((A.x + B.x) / 2 - cx) + ny * ((A.y + B.y) / 2 - cy) < 0) { nx = -nx; ny = -ny; } // first curve bends outward
    const off = (k % 2 ? -1 : 1) * (62 + 52 * Math.floor(k / 2));
    const q = { x: (A.x + B.x) / 2 + nx * off * 2, y: (A.y + B.y) / 2 + ny * off * 2 };
    const unit = (from, to) => { const l = Math.hypot(to.x - from.x, to.y - from.y) || 1; return [(to.x - from.x) / l, (to.y - from.y) / l]; };
    const s0 = trim(a, ...unit(a, q)), s1 = trim(b, ...unit(b, q));
    const d = \`M\${s0.x},\${s0.y} Q\${q.x},\${q.y} \${s1.x},\${s1.y}\`;
    const g = el("g", { class: \`edge\${sel === idx ? " sel" : ""}\`, tabindex: 0, role: "button", "aria-label": \`\${e.contract} \${e.producer} to \${e.consumer}: \${e.status}\` }, layer);
    el("path", { d, class: "hit" }, g);
    el("path", { d, class: \`vis s-\${e.status}\`, "marker-end": \`url(#arrow-\${e.status})\` }, g);
    const apex = { x: 0.25 * A.x + 0.5 * q.x + 0.25 * B.x, y: 0.25 * A.y + 0.5 * q.y + 0.25 * B.y };
    const sx = Math.sign(off) * nx, sy = Math.sign(off) * ny;
    const t = el("text", { x: apex.x + sx * 16, y: apex.y + sy * 16 + (sy > 0.35 ? 14 : sy < -0.35 ? -2 : 4), "text-anchor": Math.abs(sx) < 0.35 ? "middle" : sx > 0 ? "start" : "end" }, g);
    t.textContent = \`\${e.contract} \xB7 \${ICON[e.status]} \${WORD[e.status]}\`;
    labels.push({ t, sx, sy });
    const pick = () => { sel = idx; render(); };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (ev) => (ev.key === "Enter" || ev.key === " ") && pick());
  });
  // nudge overlapping labels apart along their outward normals
  const hit = (a, b) => a.x < b.x + b.width + 6 && b.x < a.x + a.width + 6 && a.y < b.y + b.height + 2 && b.y < a.y + a.height + 2;
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      if (!hit(labels[i].t.getBBox(), labels[j].t.getBBox())) continue;
      const L = labels[j], dir = Math.abs(L.sy) > 0.2 ? Math.sign(L.sy) : 1;
      L.t.setAttribute("y", +L.t.getAttribute("y") + 9 * dir);
      L.t.setAttribute("x", +L.t.getAttribute("x") + 6 * L.sx);
      moved = true;
    }
    if (!moved) break;
  }
  const defs = el("defs", {}, svg);
  for (const s of Object.keys(WORD)) {
    const m = el("marker", { id: \`arrow-\${s}\`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 11, markerHeight: 11, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" }, defs);
    el("path", { d: "M0,0 L10,5 L0,10 z", class: \`s-\${s}\`, style: "fill: currentColor; stroke: none" }, m);
  }
  const nodes = el("g", {}, svg);
  for (const node of data.nodes) {
    const p = pos[node.lane];
    const g = el("g", { class: "node", transform: \`translate(\${p.x},\${p.y})\` }, nodes);
    el("rect", { x: -78, y: -32, width: 156, height: 64, rx: 12 }, g);
    const t1 = el("text", { class: "name", y: -9, "text-anchor": "middle" }, g); t1.textContent = node.lane;
    const t2 = el("text", { class: "meta", y: 8, "text-anchor": "middle" }, g); t2.textContent = node.owner || "no owner";
    const bits = [node.openBlockers && \`\${node.openBlockers} blocker\${node.openBlockers > 1 ? "s" : ""}\`, node.openRequests && \`\${node.openRequests} request\${node.openRequests > 1 ? "s" : ""}\`, node.claimedFixes.length && \`fixing #\${node.claimedFixes.join(", #")}\`].filter(Boolean);
    const t3 = el("text", { class: "meta", y: 23, "text-anchor": "middle" }, g); t3.textContent = bits.join(" \xB7 ") || "no open issues";
  }
  side();
}

function side() {
  const e = data && sel != null ? data.edges[sel] : null;
  const needs = data?.needsOwner?.length ? \`<h2 style="margin-top:18px">Needs owner</h2><ul class="list">\${data.needsOwner.map((x) => \`<li>#\${x.issue} \u2192 \${esc(x.to)}: \${esc(x.title)}</li>\`).join("")}</ul>\` : "";
  if (!e) { $("side").innerHTML = \`<h2>Click a contract edge</h2><p class="muted">Edges are contracts (producer \u2192 consumer). Color and the text label both carry the status.</p>\${needs}\`; return; }
  const f = e.topFailure;
  $("side").innerHTML = \`<h2>\${esc(e.contract)} <span class="badge s-\${e.status}">\${ICON[e.status]} \${WORD[e.status]}</span></h2>
    <div class="muted">\${esc(e.producer)} \u2192 \${esc(e.consumer)}</div>
    <dl><dt>version</dt><dd>v\${esc(e.version)}</dd><dt>fixtures</dt><dd>\${e.fixtures.valid} valid \xB7 \${e.fixtures.invalid} invalid</dd>
    <dt>consumer tests</dt><dd>\${e.consumerTests}</dd><dt>pending</dt><dd>\${e.pendingIssues.length ? e.pendingIssues.map((i) => "#" + i).join(", ") : "none"}</dd></dl>
    \${f ? \`<h2>Top failure</h2><pre>\${esc(f.message)}</pre><dl><dt>owner of the fix</dt><dd><b>\${esc(f.owner)}</b></dd>\${f.seed != null ? \`<dt>seed</dt><dd><code>\${f.seed}</code></dd>\` : ""}</dl>
      \${f.repro ? \`<div class="muted">repro</div><pre id="repro">\${esc(f.repro)}</pre><button id="copy">Copy repro</button>\` : ""}\` : \`<p class="muted">No failures on this edge.</p>\`}\${needs}\`;
  const btn = $("copy");
  if (btn) btn.onclick = () => navigator.clipboard?.writeText(f.repro).then(() => (btn.textContent = "Copied"));
}

async function tick() {
  try {
    const r = await fetch("graph.json", { cache: "no-store" });
    const j = await r.json();
    $("live").classList.remove("stale");
    if (j.generatedAt !== stamp) { stamp = j.generatedAt; data = j; if (sel != null && !data.edges[sel]) sel = null; render(); }
    $("live").textContent = \`live \xB7 updated \${new Date(stamp).toLocaleTimeString()}\`;
  } catch { $("live").classList.add("stale"); $("live").textContent = "reconnecting\u2026"; }
}
window.addEventListener("resize", () => data && render());
tick(); setInterval(tick, 1500);
</script>
</body>
</html>
`;async function graph(cwd,o){let root=findRoot(cwd);if(!root)return process.stderr.write(`lanes graph: no lanes.yaml
`),2;let refresh=()=>{let report=readJson(cachePath(root,"report.json"));if(!report)return!1;if(mtime(cachePath(root,"graph.json"))>=mtime(cachePath(root,"report.json"))&&mtime(cachePath(root,"graph.json"))>=mtime(cachePath(root,"issues.json")))return!0;let cfg=loadConfig(root).cfg,owners=Object.fromEntries(Object.entries(cfg?.lanes??{}).map(([l,d])=>[l,d.owner]));return writeJson(cachePath(root,"graph.json"),graphFromReport(report,{owners,issues:readJson(cachePath(root,"issues.json"))?.issues??[]})),!0};if(refresh()||(process.stdout.write(`no check report yet; running lanes check first\u2026
`),await runCheck({cwd:root}),refresh()),process.stdout.write(`wrote ${cachePath(root,"graph.json")}
`),!o.serve)return 0;let server=createServer((req,res)=>{if(req.url?.startsWith("/graph.json")){refresh();let f=cachePath(root,"graph.json");res.writeHead(existsSync(f)?200:404,{"content-type":"application/json","cache-control":"no-store"}),res.end(existsSync(f)?readFileSync(f):"{}");return}res.writeHead(200,{"content-type":"text/html; charset=utf-8"}),res.end(graph_default)});return await new Promise((resolve,reject)=>{server.once("error",reject),server.listen(o.port,"127.0.0.1",resolve)}),process.stdout.write(`lanes graph: http://localhost:${o.port}  (live: reloads when graph.json changes; Ctrl+C to stop)
`),new Promise(()=>{})}export{graph};
