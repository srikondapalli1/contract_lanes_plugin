#!/usr/bin/env node
// A tiny stand-in for `gh api`: GitHub REST semantics backed by a JSON file ($FAKE_GH_STATE)
// and a local bare git remote (for PR heads, commits and squash merges). Test-only.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = process.env.FAKE_GH_STATE;
const argv = process.argv.slice(2);
if (argv[0] === "--version") { console.log("gh version 0.0.0-fake"); process.exit(0); }
if (argv[0] === "auth") { console.log("Logged in (fake)"); process.exit(0); }
if (argv[0] !== "api") { console.error(`fake-gh: unsupported ${argv.join(" ")}`); process.exit(1); }

const load = () => JSON.parse(readFileSync(STATE, "utf8"));
const save = (s) => writeFileSync(STATE, JSON.stringify(s, null, 1));
const now = () => new Date(Date.now() + (load().clock ?? 0)).toISOString();
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

let method = "GET", path = "", input, jq;
const headers = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-X") method = argv[++i];
  else if (a === "-H") { const h = argv[++i]; headers[h.slice(0, h.indexOf(":")).toLowerCase()] = h.slice(h.indexOf(":") + 1).trim(); }
  else if (a === "--input") { i++; input = JSON.parse(readFileSync(0, "utf8") || "null"); }
  else if (a === "--include" || a === "-i") {}
  else if (a === "--jq") jq = argv[++i];
  else if (a === "-f" || a === "-F") i++;
  else if (!path) path = a;
}
if (path === "graphql") { reply(200, { data: {} }); }

function reply(status, data, extra = {}) {
  const body = data === undefined ? "" : JSON.stringify(data);
  if (jq === ".login") { process.stdout.write(`${data.login}\n`); process.exit(0); }
  process.stdout.write(`HTTP/2.0 ${status} X\n${Object.entries(extra).map(([k, v]) => `${k}: ${v}\n`).join("")}\n${body}`);
  process.exit(status >= 400 ? 1 : 0);
}

const s = load();
const [p, qs = ""] = path.replace(/^\//, "").split("?");
const q = Object.fromEntries(new URLSearchParams(qs));
const seg = p.split("/");
const R = `repos/${s.repo}`;
const labelsOf = (i) => i.labels.map((name) => ({ name }));
const headSha = (ref) => { try { return git("--git-dir", s.remote, "rev-parse", `refs/heads/${ref}`); } catch { return "0".repeat(40); } };
const asIssue = (i) => ({ ...i, labels: labelsOf(i), comments: (s.comments[i.number] ?? []).length, ...(i.pr ? { pull_request: {} } : {}) });
const asPr = (i) => ({ number: i.number, title: i.title, body: i.body, state: i.state, draft: false, merged_at: i.merged_at ?? null, created_at: i.created_at, updated_at: i.updated_at, labels: labelsOf(i), user: { login: i.user }, head: { ref: i.pr.head, sha: headSha(i.pr.head), repo: { full_name: s.repo } }, base: { ref: "main" } });
const touch = (i) => { i.updated_at = now(); };
const page = (arr) => { const n = Number(q.page ?? 1), per = Number(q.per_page ?? 30); return arr.slice((n - 1) * per, n * per); };
const issue = (n) => s.issues[n] ?? reply(404, { message: "Not Found" });
const done = (status, data) => { save(s); reply(status, data); };

if (p === "user") reply(200, { login: s.user ?? "agent" });
if (!p.startsWith(R)) reply(404, { message: `unknown repo in ${p}` });
const rest = seg.slice(3);

if (rest[0] === "labels") {
  if (method === "GET") reply(200, page(s.labels.map((name) => ({ name }))));
  s.labels.push(input.name); done(201, { name: input.name });
}
if (rest[0] === "statuses") { s.statuses.push({ sha: rest[1], ...input }); done(201, input); }
if (rest[0] === "branches") reply(404, { message: "Branch not protected" });
if (rest[0] === "issues" && rest[1] === "comments" && method === "PATCH") {
  for (const list of Object.values(s.comments)) for (const c of list) if (String(c.id) === rest[2]) { c.body = input.body; done(200, c); }
  reply(404, { message: "Not Found" });
}
if (rest[0] === "issues" && rest.length === 1) {
  if (method === "POST") {
    const n = s.next++;
    s.issues[n] = { number: n, title: input.title, body: input.body ?? "", state: "open", labels: [...new Set(input.labels ?? [])], assignees: input.assignees ?? [], user: s.user ?? "agent", created_at: now(), updated_at: now() };
    done(201, asIssue(s.issues[n]));
  }
  let list = Object.values(s.issues).filter((i) => (q.state ?? "open") === "all" || i.state === (q.state ?? "open"));
  if (q.labels) for (const l of q.labels.split(",")) list = list.filter((i) => i.labels.includes(l));
  if (q.since) list = list.filter((i) => i.updated_at >= q.since);
  list.sort((a, b) => (q.sort === "updated" ? a.updated_at.localeCompare(b.updated_at) : a.number - b.number) * (q.direction === "desc" ? -1 : 1));
  const data = page(list).map(asIssue);
  const etag = `"${createHash("sha1").update(JSON.stringify(data)).digest("hex")}"`;
  if (headers["if-none-match"] === etag) reply(304, undefined, { etag });
  reply(200, data, { etag });
}
if (rest[0] === "issues") {
  const i = issue(rest[1]);
  if (rest.length === 2) {
    if (method === "GET") reply(200, asIssue(i));
    Object.assign(i, Object.fromEntries(Object.entries(input).filter(([k]) => ["title", "body", "state"].includes(k)))); touch(i); done(200, asIssue(i));
  }
  if (rest[2] === "labels") {
    if (method === "POST") { i.labels = [...new Set([...i.labels, ...input.labels])]; touch(i); done(200, labelsOf(i)); }
    const name = decodeURIComponent(rest[3]);
    if (!i.labels.includes(name)) reply(404, { message: "Label does not exist" });
    i.labels = i.labels.filter((l) => l !== name); touch(i); done(200, labelsOf(i));
  }
  if (rest[2] === "assignees") { i.assignees = [...new Set([...(i.assignees ?? []), ...input.assignees])]; touch(i); done(201, asIssue(i)); }
  if (rest[2] === "comments") {
    const list = (s.comments[i.number] ??= []);
    if (method === "GET") reply(200, page(list));
    const c = { id: s.next * 1000 + list.length + Math.floor(Math.random() * 999), body: input.body, user: { login: s.user ?? "agent" }, created_at: now() };
    list.push(c); touch(i); done(201, c);
  }
}
if (rest[0] === "pulls" && rest.length === 1) {
  if (method === "POST") {
    const n = s.next++;
    s.issues[n] = { number: n, title: input.title, body: input.body ?? "", state: "open", labels: [], user: s.user ?? "agent", created_at: now(), updated_at: now(), pr: { head: input.head } };
    done(201, asPr(s.issues[n]));
  }
  let list = Object.values(s.issues).filter((i) => i.pr && ((q.state ?? "open") === "all" || i.state === (q.state ?? "open")));
  if (q.head) list = list.filter((i) => `${s.repo.split("/")[0]}:${i.pr.head}` === q.head);
  list.sort((a, b) => (a.number - b.number) * (q.direction === "desc" ? -1 : 1));
  reply(200, page(list).map(asPr));
}
if (rest[0] === "pulls") {
  const i = issue(rest[1]);
  if (rest.length === 2) reply(200, asPr(i));
  if (rest[2] === "reviews") reply(200, s.reviews[i.number] ?? []);
  if (rest[2] === "commits") {
    const log = git("--git-dir", s.remote, "log", "--format=%H%x00%B%x01", `refs/heads/main..refs/heads/${i.pr.head}`);
    reply(200, log.split("\x01").map((x) => x.trim()).filter(Boolean).map((x) => { const [sha, message] = x.split("\x00"); return { sha, commit: { message } }; }));
  }
  if (rest[2] === "merge") {
    if (i.state !== "open") reply(405, { message: "Pull Request is not mergeable" });
    const head = headSha(i.pr.head);
    if (input.sha && input.sha !== head) reply(409, { message: "Head branch was modified" });
    const ok = s.statuses.some((st) => st.sha === head && st.context === "lanes/check" && st.state === "success");
    if (!ok) reply(405, { message: "Required status check \"lanes/check\" is expected" });
    const dir = mkdtempSync(join(tmpdir(), "fakegh-"));
    try {
      git("clone", "-q", s.remote, dir);
      git("-C", dir, "merge", "--squash", `origin/${i.pr.head}`);
      git("-C", dir, "-c", "user.name=gh", "-c", "user.email=gh@x", "commit", "-q", "-m", input.commit_title ?? i.title);
      git("-C", dir, "push", "-q", "origin", "HEAD:main");
    } catch (e) { reply(405, { message: `merge conflict: ${e.message}` }); } finally { rmSync(dir, { recursive: true, force: true }); }
    i.state = "closed"; i.merged_at = now(); touch(i);
    for (const m of String(i.body).matchAll(/\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi)) if (s.issues[m[1]]) { s.issues[m[1]].state = "closed"; touch(s.issues[m[1]]); }
    done(200, { merged: true, sha: git("--git-dir", s.remote, "rev-parse", "refs/heads/main") });
  }
}
reply(404, { message: `fake-gh: no route for ${method} ${p}` });
