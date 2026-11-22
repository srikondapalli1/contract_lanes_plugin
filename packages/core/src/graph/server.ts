import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import html from "../../web/graph.html";
import { loadConfig } from "../config/index.ts";
import { graphFromReport, type IssuesCache } from "../graph-data/index.ts";
import { cachePath, findRoot, mtime, readJson, writeJson } from "../util/fs.ts";
import { runCheck } from "../check/index.ts";

export async function graph(cwd: string, o: { port: number; serve: boolean }): Promise<number> {
  const root = findRoot(cwd);
  if (!root) { process.stderr.write("lanes graph: no lanes.yaml\n"); return 2; }
  const refresh = () => {
    const report = readJson(cachePath(root, "report.json"));
    if (!report) return false;
    if (mtime(cachePath(root, "graph.json")) >= mtime(cachePath(root, "report.json")) && mtime(cachePath(root, "graph.json")) >= mtime(cachePath(root, "issues.json"))) return true;
    const cfg = loadConfig(root).cfg;
    const owners = Object.fromEntries(Object.entries(cfg?.lanes ?? {}).map(([l, d]) => [l, d.owner]));
    writeJson(cachePath(root, "graph.json"), graphFromReport(report, { owners, issues: readJson<IssuesCache>(cachePath(root, "issues.json"))?.issues ?? [] }));
    return true;
  };
  if (!refresh()) { process.stdout.write("no check report yet; running lanes check first…\n"); await runCheck({ cwd: root }); refresh(); }
  process.stdout.write(`wrote ${cachePath(root, "graph.json")}\n`);
  if (!o.serve) return 0;
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/graph.json")) {
      refresh();
      const f = cachePath(root, "graph.json");
      res.writeHead(existsSync(f) ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(existsSync(f) ? readFileSync(f) : "{}");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(o.port, "127.0.0.1", resolve); });
  process.stdout.write(`lanes graph: http://localhost:${o.port}  (live: reloads when graph.json changes; Ctrl+C to stop)\n`);
  return new Promise<number>(() => {});
}
