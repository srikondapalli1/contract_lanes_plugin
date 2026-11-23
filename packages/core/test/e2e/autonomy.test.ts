// BUILD.md e2e #5 against a fake GitHub (fake gh + local bare remote): bug pushed -> blocker filed ->
// watcher exits -> fixer -> fix --submit -> queue merges -> edge green. No human action.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ciClone, exampleRepo, fakeGitHub, git, lanes, setHold } from "../helpers.ts";

describe("autonomy loop (M2 acceptance)", () => {
  it("planted bug is fixed and merged with no human action", () => {
    const work = exampleRepo("auto", { fixBug: true });
    const gh = fakeGitHub(work);
    expect(lanes(work, ["init", "--labels"], gh.env).stdout).toMatch(/created \d+ labels · control issue #1/);
    const lock = lanes(work, ["lock"], gh.env);
    expect(lock.code, lock.stdout).toBe(0);
    git(work, "add", "-A"); git(work, "commit", "-qm", "lanes: lock"); git(work, "push", "-q", "origin", "main");

    // a bug lands on main (e.g. merged before the property test caught it)
    setHold(work, 1800);
    git(work, "commit", "-qam", "brain: spooked agents freeze longer"); git(work, "push", "-q", "origin", "main");

    // nightly fuzz files a blocker for brain
    const ci = ciClone(gh.remote);
    const nightly = lanes(ci, ["check", "--ci", "--seed", "random", "--file-blockers"], gh.env);
    expect(nightly.code).toBe(1);
    expect(nightly.stdout).toMatch(/filed blocker #2 → brain/);
    const blocker = gh.read().issues["2"];
    expect(blocker.labels).toEqual(expect.arrayContaining(["lanes:blocker", "lane:brain", "auto-fix"]));
    expect(blocker.body).toMatch(/<!-- lanes:\{.*"type":"blocker"/);
    // a repeat failure updates the same issue instead of opening a new one
    expect(lanes(ci, ["check", "--ci", "--file-blockers"], gh.env).stdout).toMatch(/updated blocker #2/);

    // brain's session: watcher wakes on the blocker
    lanes(work, ["join", "brain"], gh.env);
    const w = lanes(work, ["watch", "--lane", "brain", "--once"], gh.env);
    expect(w.code).toBe(0);
    const wake = JSON.parse(w.stdout.trim());
    expect(wake).toMatchObject({ v: 1, lane: "brain", items: [{ issue: 2, type: "blocker", contract: "TickResponse", reason: "new", autopilot: true }] });
    expect(wake.next).toMatch(/watch --lane brain/);
    // nothing new -> silent
    expect(lanes(work, ["watch", "--lane", "brain", "--once"], gh.env).stdout).toBe("");

    // claim + worktree
    const planR = lanes(work, ["fix", "2"], gh.env);
    expect(planR.code, planR.stderr).toBe(0);
    const plan = JSON.parse(planR.stdout);
    expect(plan).toMatchObject({ v: 1, issue: 2, lane: "brain", branch: "fix/2", attempt: 1 });
    expect(existsSync(plan.worktree)).toBe(true);
    expect(gh.read().issues["2"].labels).toContain("claimed");
    // a second claimer is refused while the lease is live
    expect(lanes(work, ["fix", "2"], { ...gh.env, LANES_ME: "someone-else" }).code).toBe(1);
    // claiming doesn't wake our own watcher
    expect(lanes(work, ["watch", "--lane", "brain", "--once"], gh.env).stdout).toBe("");

    // fixer subagent: reproduce first, then change implementation only
    const repro = lanes(plan.worktree, ["check", "--lane", "brain"], gh.env);
    expect(repro.code).toBe(1);
    expect(repro.stdout).toMatch(/holdMs: Too big/);
    setHold(plan.worktree, 1200);
    expect(lanes(plan.worktree, ["check", "--lane", "brain"], gh.env).code).toBe(0);
    const sub = lanes(work, ["fix", "2", "--submit"], gh.env);
    expect(sub.code, sub.stdout + sub.stderr).toBe(0);
    const result = JSON.parse(sub.stdout);
    expect(result).toMatchObject({ v: 1, issue: 2, outcome: "queued", pr: 3 });
    expect(gh.read().issues["3"].labels).toEqual(expect.arrayContaining(["queue", "lane:brain", "auto-fix"]));

    // the queue (CI) re-checks against latest main and merges
    const q = lanes(ciClone(gh.remote), ["queue"], gh.env);
    expect(q.stdout, q.stdout + q.stderr).toMatch(/merged #3/);
    const st = gh.read();
    expect(st.issues["3"].merged_at).toBeTruthy();
    expect(st.issues["2"].state).toBe("closed");
    const comment = st.comments["3"].find((c: any) => c.body.startsWith("<!-- lanes:pr -->"));
    expect(comment.body).toMatch(/✅ merged/);

    // main is green again
    const after = ciClone(gh.remote);
    expect(readFileSync(join(after, "apps/brain/src/tick.ts"), "utf8")).toMatch(/holdMs: 1200/);
    const final = lanes(after, ["check", "--ci", "--json"], gh.env);
    expect(final.code).toBe(0);
    expect(JSON.parse(final.stdout).edges.every((e: any) => e.status === "pass")).toBe(true);
    // cleanup removes the merged fix worktree
    expect(lanes(work, ["fix", "--cleanup"], gh.env).stdout).toMatch(/1 worktree\(s\) removed/);
  });

  it("two PRs that pass alone but conflict together: the second bounces", () => {
    const work = exampleRepo("conflict", { fixBug: true });
    const f = join(work, "apps/brain/src/tick.ts");
    writeFileSync(join(work, "apps/brain/src/timing.ts"), "export const BASE_MS = 400;\n");
    writeFileSync(f, `import { BASE_MS } from "./timing";\n${readFileSync(f, "utf8").replace('holdMs: 400 }', "holdMs: BASE_MS }")}`);
    const gh = fakeGitHub(work);
    lanes(work, ["init", "--labels"], gh.env);
    expect(lanes(work, ["lock"], gh.env).code).toBe(0);
    git(work, "add", "-A"); git(work, "commit", "-qm", "lock"); git(work, "push", "-q", "origin", "main");
    const pr = (branch: string, edit: () => void) => {
      git(work, "switch", "-q", "-c", branch, "main"); edit(); git(work, "commit", "-qam", branch); git(work, "push", "-q", "origin", branch);
      expect(lanes(work, ["check", "--lane", "brain"], gh.env).code).toBe(0); // passes alone
      const n = gh.read().next;
      const s = gh.read();
      s.issues[n] = { number: n, title: branch, body: "", state: "open", labels: ["queue", "lane:brain"], user: "agent", created_at: new Date(Date.now() + n).toISOString(), updated_at: new Date().toISOString(), pr: { head: branch } };
      s.next++;
      writeFileSync(gh.state, JSON.stringify(s));
      git(work, "switch", "-q", "main");
      return n;
    };
    const a = pr("brain-longer-moves", () => writeFileSync(f, readFileSync(f, "utf8").replace("holdMs: BASE_MS }", "holdMs: BASE_MS + 1000 }")));
    const b = pr("brain-slower-base", () => writeFileSync(join(work, "apps/brain/src/timing.ts"), "export const BASE_MS = 600;\n"));
    const q = lanes(ciClone(gh.remote), ["queue"], gh.env);
    const st = gh.read();
    expect(st.issues[a].merged_at, q.stdout).toBeTruthy();
    expect(st.issues[b].merged_at).toBeFalsy();
    expect(st.issues[b].labels).toContain("queue-failed");
    expect(st.issues[b].labels).not.toContain("queue");
    expect(st.comments[b].map((c: any) => c.body).join("\n")).toMatch(/holdMs: Too big/);
    // the failed (non-fix) PR opens a blocker for its lane, so that lane's agent wakes up
    const blocker: any = Object.values(st.issues).find((i: any) => i.title === `❌ PR #${b} failed in the queue (brain)`);
    expect(blocker.labels).toEqual(expect.arrayContaining(["lanes:blocker", "lane:brain"]));
    expect(blocker.labels).not.toContain("auto-fix");
    const w = JSON.parse(lanes(work, ["watch", "--lane", "brain", "--once"], gh.env).stdout);
    expect(w.items).toContainEqual({ issue: blocker.number, type: "blocker", reason: "new", autopilot: false });
    // fix the PR's branch, re-queue: it merges and the blocker closes
    git(work, "switch", "-q", "brain-slower-base");
    writeFileSync(join(work, "apps/brain/src/timing.ts"), "export const BASE_MS = 450;\n");
    git(work, "commit", "-qam", "brain: base 450 keeps longer moves under 1500"); git(work, "push", "-q", "origin", "brain-slower-base");
    git(work, "switch", "-q", "main");
    const s2 = gh.read(); s2.issues[b].labels = ["queue", "lane:brain"]; writeFileSync(gh.state, JSON.stringify(s2));
    const q2 = lanes(ciClone(gh.remote), ["queue"], gh.env);
    const st2 = gh.read();
    expect(st2.issues[b].merged_at, q2.stdout).toBeTruthy();
    expect(st2.issues[blocker.number].state).toBe("closed");
  });

  it("two compatible PRs both merge in order; the second is rebased, re-checked and pushed first", () => {
    const work = exampleRepo("compat", { fixBug: true });
    const gh = fakeGitHub(work);
    lanes(work, ["init", "--labels"], gh.env);
    expect(lanes(work, ["lock"], gh.env).code).toBe(0);
    git(work, "add", "-A"); git(work, "commit", "-qm", "lock"); git(work, "push", "-q", "origin", "main");
    const open = (branch: string, file: string, text: string) => {
      git(work, "switch", "-q", "-c", branch, "main");
      writeFileSync(join(work, file), text);
      git(work, "add", "-A"); git(work, "commit", "-qm", branch); git(work, "push", "-q", "origin", branch);
      git(work, "switch", "-q", "main");
      const s = gh.read(); const n = s.next++;
      s.issues[n] = { number: n, title: branch, body: "", state: "open", labels: ["queue"], user: "agent", created_at: new Date(Date.now() + n).toISOString(), updated_at: new Date().toISOString(), pr: { head: branch } };
      writeFileSync(gh.state, JSON.stringify(s));
      return n;
    };
    const a = open("world-notes", "apps/world/src/notes.ts", "export const note = 'a';\n");
    const b = open("crowd-notes", "apps/crowd/src/notes.ts", "export const note = 'b';\n");
    const before = git(work, "ls-remote", gh.remote, "refs/heads/crowd-notes").split("\t")[0];
    const q = lanes(ciClone(gh.remote), ["queue"], gh.env);
    const st = gh.read();
    expect(st.issues[a].merged_at, q.stdout).toBeTruthy();
    expect(st.issues[b].merged_at, q.stdout).toBeTruthy();
    const after = git(work, "ls-remote", gh.remote, "refs/heads/crowd-notes").split("\t")[0];
    expect(after).not.toBe(before); // rebased onto the new main and force-pushed with lease
    expect(st.statuses.some((x: any) => x.sha === after && x.state === "success" && x.context === "lanes/check")).toBe(true);
    const main = ciClone(gh.remote);
    expect(existsSync(join(main, "apps/world/src/notes.ts")) && existsSync(join(main, "apps/crowd/src/notes.ts"))).toBe(true);
  });

  it("the PR author stands in for lanes they own; other owners still have to approve", () => {
    const work = exampleRepo("authors", { fixBug: true });
    const gh = fakeGitHub(work);
    lanes(work, ["init", "--labels"], gh.env);
    expect(lanes(work, ["lock"], gh.env).code).toBe(0);
    git(work, "add", "-A"); git(work, "commit", "-qm", "lock"); git(work, "push", "-q", "origin", "main");
    // world and crowd are owned by @you, brain by @friend
    const open = (branch: string, files: Record<string, string>) => {
      git(work, "switch", "-q", "-c", branch, "main");
      for (const [f, t] of Object.entries(files)) writeFileSync(join(work, f), t);
      git(work, "add", "-A"); git(work, "commit", "-qm", branch); git(work, "push", "-q", "origin", branch);
      git(work, "switch", "-q", "main");
      const s = gh.read(); const n = s.next++;
      s.issues[n] = { number: n, title: branch, body: "", state: "open", labels: ["queue", "lane:world"], user: "you", created_at: new Date(Date.now() + n).toISOString(), updated_at: new Date().toISOString(), pr: { head: branch } };
      writeFileSync(gh.state, JSON.stringify(s));
      return n;
    };
    const mine = open("you-world-crowd", { "apps/world/src/a.ts": "export const a = 1;\n", "apps/crowd/src/b.ts": "export const b = 1;\n" });
    const theirs = open("you-into-brain", { "apps/world/src/c.ts": "export const c = 1;\n", "apps/brain/src/d.ts": "export const d = 1;\n" });
    const s0 = gh.read(); s0.mergeNotReady = 2; writeFileSync(gh.state, JSON.stringify(s0)); // GitHub still computing mergeability
    const q = lanes(ciClone(gh.remote), ["queue"], { ...gh.env, LANES_MERGE_RETRY_MS: "10" });
    const st = gh.read();
    expect(st.issues[mine].merged_at, q.stdout).toBeTruthy();
    expect(q.stdout + q.stderr).toContain("not mergeable yet (attempt 2/5)");
    expect(st.issues[theirs].merged_at).toBeFalsy();
    expect(JSON.stringify(st.comments[theirs])).toContain('touches lane \\"brain\\"');
  });

  it("a lane adds the first consumer test for an edge left open at lock time; the queue merges and relocks it", () => {
    const work = exampleRepo("open-edge", { fixBug: true });
    const gh = fakeGitHub(work);
    lanes(work, ["init", "--labels"], gh.env);
    // crowd becomes a consumer of TickRequest with no test yet: lock with that edge open
    writeFileSync(join(work, "lanes.yaml"), readFileSync(join(work, "lanes.yaml"), "utf8").replace(/(TickRequest:\s*\{[^}]*consumers: \[)brain\]/, "$1brain, crowd]"));
    expect(lanes(work, ["lock"], gh.env).code).toBe(1);
    expect(lanes(work, ["lock", "--allow-open", "1"], gh.env).code).toBe(0);
    git(work, "add", "-A"); git(work, "commit", "-qm", "lock"); git(work, "push", "-q", "origin", "main");
    git(work, "switch", "-q", "-c", "crowd-tickrequest-test", "main");
    mkdirSync(join(work, "apps/crowd/src/__contracts__"), { recursive: true });
    const test = `import { describe, expect, it } from "vitest";\nimport { fixturesOf } from "contract-lanes/test";\n\nconst { valid } = fixturesOf<{ agents: unknown[] }>("TickRequest");\n\ndescribe("crowd consumes TickRequest", () => {\n  it.each(valid)("counts agents in fixture %#", (r) => expect(r.agents.length).toBeGreaterThanOrEqual(0));\n});\n`;
    writeFileSync(join(work, "apps/crowd/src/__contracts__/TickRequest.test.ts"), test);
    const local = lanes(work, ["check", "--json"], gh.env);
    expect(local.code, local.stdout).toBe(0); // filling an open edge is not a locked change
    // the edit guard and the pre-commit backstop agree: crowd may write its first TickRequest test, brain's is locked
    const guard = (lane: string, f: string) => {
      lanes(work, ["join", lane], gh.env);
      return lanes(work, ["hook", "guard"], gh.env, JSON.stringify({ cwd: work, tool_name: "Write", tool_input: { file_path: join(work, f) } }));
    };
    expect(guard("crowd", "apps/crowd/src/__contracts__/TickRequest.test.ts").code).toBe(0);
    const locked = guard("brain", "apps/brain/src/__contracts__/TickRequest.test.ts");
    expect(locked.code).toBe(2);
    expect(locked.stderr).toContain("locked by contracts.lock");
    lanes(work, ["join", "crowd"], gh.env);
    git(work, "add", "-A");
    expect(lanes(work, ["guard", "--staged"], gh.env).code).toBe(0);
    git(work, "add", "-A"); git(work, "commit", "-qm", "crowd consumes TickRequest"); git(work, "push", "-q", "origin", "crowd-tickrequest-test");
    git(work, "switch", "-q", "main");
    const s = gh.read(); const n = s.next++;
    s.issues[n] = { number: n, title: "crowd consumes TickRequest", body: "", state: "open", labels: ["queue", "lane:crowd"], user: "agent", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), pr: { head: "crowd-tickrequest-test" } };
    writeFileSync(gh.state, JSON.stringify(s));
    const q = lanes(ciClone(gh.remote), ["queue"], gh.env);
    expect(gh.read().issues[n].merged_at, q.stdout).toBeTruthy();
    const main = ciClone(gh.remote);
    const lock = JSON.parse(readFileSync(join(main, "contracts.lock"), "utf8"));
    expect(Object.keys(lock.contracts.TickRequest.consumerTestsHash)).toContain("crowd");
    // from now on, changing that test is a locked change again
    writeFileSync(join(main, "apps/crowd/src/__contracts__/TickRequest.test.ts"), test + "\n// weaker\n");
    expect(lanes(main, ["check", "--json"], gh.env).stdout).toContain("consumer tests (crowd)");
  });

  it("lanes invite adds a collaborator, sets the lane owner and prints the teammate prompt", () => {
    const work = exampleRepo("invite", { fixBug: true });
    const gh = fakeGitHub(work);
    const r = lanes(work, ["invite", "@new-dev", "--lane", "crowd"], gh.env);
    expect(r.code, r.stderr).toBe(0);
    expect(gh.read().collaborators).toEqual(["new-dev"]);
    expect(r.stdout).toContain("Invited @new-dev");
    expect(readFileSync(join(work, "lanes.yaml"), "utf8")).toMatch(/crowd: \{ owner: "@new-dev",\s+paths: \["apps\/crowd\/\*\*"\] \}/);
    expect(readFileSync(join(work, ".github/CODEOWNERS"), "utf8")).toContain("/apps/crowd/** @new-dev");
    expect(r.stdout).toContain("npx lanes join crowd");
    expect(r.stdout).toContain("Repo: https://github.com/acme/manor");
    expect(lanes(work, ["check", "--lane", "crowd"], gh.env).code).toBe(0); // lanes.yaml still valid
    expect(lanes(work, ["invite", "@new-dev"], gh.env).stdout).toContain("already has access");
  });
});
