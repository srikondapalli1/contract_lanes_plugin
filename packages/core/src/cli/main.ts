#!/usr/bin/env node
// lanes CLI entry. Heavy modules load lazily so `lanes hook guard` stays under 100 ms.
import { parseArgs, str, num } from "../util/args.ts";
import { VERSION_STR } from "../util/local.ts";

const HELP = `lanes ${VERSION_STR}: contract-first parallel development for coding agents

  lanes init [--laptops n --sessions n --hours n] [--lanes a,b,c] [--labels] [--yes]
  lanes join <lane>                     bind this worktree to a lane
  lanes check [--lane l] [--fast] [--ci] [--json] [--seed n|random] [--file-blockers] [--pr n]
  lanes lock [--allow-open n]           lock contracts (ends setup phase)
  lanes msg <lane> --type request|notice|blocker [--contract C] "<text>"
  lanes watch --lane <l> [--once]       wait for actionable issues (background)
  lanes fix <issue> [--submit | --escalate "reason" | --cleanup]
  lanes queue                           merge queue (CI)
  lanes graph [--port 4517] [--no-serve]
  lanes status
  lanes override <paths...> [--push] --reason "why"
  lanes autopilot on|off
  lanes doctor
  lanes codeowners
  lanes hook <session-start|prompt|guard|stop>   (plugin internal)

Exit codes: 0 ok · 1 failures · 2 config/usage error.`;

async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  const [cmd, ...rest] = a._;
  const cwd = process.cwd();
  const print = (s: string) => s && process.stdout.write(s.endsWith("\n") ? s : s + "\n");
  if (a.version || cmd === "version") { print(VERSION_STR); return 0; }
  if (!cmd || a.help || cmd === "help") { print(HELP); return cmd || a.help ? 0 : 2; }

  if (cmd === "hook") {
    const { runHook } = await import("../hooks/index.ts");
    const r = await runHook(rest[0] ?? "");
    if (r.stdout) process.stdout.write(r.stdout.endsWith("\n") ? r.stdout : r.stdout + "\n");
    if (r.stderr) process.stderr.write(r.stderr);
    return r.exit;
  }
  if (cmd === "guard") {
    const { findRoot } = await import("../util/fs.ts");
    const root = findRoot(cwd);
    if (!root) return 0;
    if (a.trailers !== undefined) { (await import("./commands.ts")).trailers(root, str(a.trailers) ?? rest[0] ?? ""); return 0; }
    const { guardStaged } = await import("../guard/index.ts");
    const { readBinding } = await import("../util/local.ts");
    const { currentBranch } = await import("../util/git.ts");
    return guardStaged(root, readBinding(root), currentBranch(root));
  }

  const C = await import("./commands.ts");
  try {
    switch (cmd) {
      case "init": {
        const { findRoot } = await import("../util/fs.ts");
        const existing = findRoot(cwd);
        if (existing && a.labels) { const G = await import("../github/index.ts"); print(await G.initGitHub(existing)); return 0; }
        const r = await C.init(cwd, { laptops: num(a.laptops), sessions: num(a.sessions), hours: num(a.hours), lanes: str(a.lanes), yes: !!a.yes, owner: str(a.owner), pkg: str(a.pkg) });
        print(`Initialized lanes in ${r.root}\n${r.created.map((f) => `  + ${f}`).join("\n")}`);
        r.warnings.forEach((w) => print(`  ! ${w}`));
        if (a.labels) { const G = await import("../github/index.ts"); print(await G.initGitHub(r.root)); }
        print(`\nNext:\n  1. npm install                      (installs contract-lanes, vitest, zod)\n  2. npx lanes check                  (green on the first run)\n  3. git add -A && git commit -m "lanes init"\n  4. npx lanes join <lane>            (one lane per session/worktree), build, then npx lanes lock`);
        return 0;
      }
      case "join": print(C.join_(cwd, rest[0])); return 0;
      case "check": {
        const { runCheck, formatReport } = await import("../check/index.ts");
        const seed = a.seed === "random" ? undefined : num(a.seed);
        const r = await runCheck({ cwd, lane: str(a.lane), fast: !!a.fast, ci: !!a.ci, seed });
        if (r.root && !r.configError && (a["file-blockers"] || a.pr)) {
          const G = await import("../github/index.ts");
          if (a["file-blockers"]) print(await G.fileBlockers(r.root, r.cfg!, r.report));
          if (a.pr) print(await G.prCheck(r.root, r.cfg!, r.report, Number(a.pr)));
        }
        print(a.json ? JSON.stringify(r.report, null, 2) : formatReport(r.report, r.exit));
        return r.exit;
      }
      case "lock": { const r = await C.lock(cwd, num(a["allow-open"]) ?? 0); print(r.text); return r.exit; }
      case "override": print(C.override(cwd, rest, str(a.reason), !!a.push)); return 0;
      case "codeowners": {
        const { findRoot } = await import("../util/fs.ts");
        const { loadConfig } = await import("../config/index.ts");
        const root = findRoot(cwd);
        const cfg = root && loadConfig(root).cfg;
        if (!root || !cfg) throw new C.UsageError("no valid lanes.yaml");
        C.writeCodeowners(root, cfg);
        print("wrote .github/CODEOWNERS");
        return 0;
      }
      case "doctor": { const r = await C.doctor(cwd); print(r.text); return r.exit; }
      case "graph": { const { graph } = await import("../graph/server.ts"); return graph(cwd, { port: num(a.port) ?? 4517, serve: !a["no-serve"] }); }
      case "msg": { const G = await import("../github/index.ts"); print(await G.msgCommand(cwd, rest[0], { type: str(a.type), contract: str(a.contract), key: str(a.key), text: rest.slice(1).join(" ") })); return 0; }
      case "autopilot": { const G = await import("../github/index.ts"); print(await G.autopilotCommand(cwd, rest[0])); return 0; }
      case "watch": { const W = await import("../watch/index.ts"); return W.watch(cwd, { lane: str(a.lane), once: !!a.once, maxMinutes: num(a["max-minutes"]), interval: num(a.interval) }); }
      case "fix": { const F = await import("../fix/index.ts"); return F.fixCommand(cwd, rest[0], { submit: !!a.submit, escalate: str(a.escalate), cleanup: !!a.cleanup }); }
      case "queue": { const Q = await import("../queue/index.ts"); return Q.queue(cwd, { budgetMin: num(a["budget-min"]) ?? 20 }); }
      case "status": { const S = await import("../status/index.ts"); print(await S.status(cwd, { json: !!a.json })); return 0; }
      default: print(`unknown command "${cmd}"\n\n${HELP}`); return 2;
    }
  } catch (e) {
    if (e instanceof C.UsageError || (e as any)?.name === "UsageError") { process.stderr.write(`lanes: ${(e as Error).message}\n`); return 2; }
    process.stderr.write(`lanes: ${(e as Error)?.stack ?? e}\n`);
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(String(e?.stack ?? e) + "\n"); process.exitCode = 1; });
