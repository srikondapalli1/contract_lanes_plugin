// BUILD.md e2e #5 against a fake GitHub (fake gh + local bare remote): bug pushed -> blocker filed ->
// watcher exits -> fixer -> fix --submit -> queue merges -> edge green. No human action.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
  });
});
