// Benchmark 1: agent context / token cost of each approach's guidance and feedback, plus the idle-polling model.
// Token counts are offline approximations (see lib.mjs TOKENIZER); no model is called.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BENCH, REPO, TOKENIZER, WORK, exampleRepo, git, lanes, measure, replaceIn, saveResult, sh, tmp } from "./lib.mjs";
import { MUTANTS, pact, pactDir } from "./mutants.mjs";

const PLUGIN = join(REPO, "plugin");
const read = (p) => readFileSync(p, "utf8");
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const frontmatter = (src) => {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  const fm = {};
  for (const line of (m?.[1] ?? "").split("\n")) { const i = line.indexOf(":"); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ""); }
  return { fm, body: m ? src.slice(m[0].length) : src };
};
const items = {};
const put = (group, name, text, note) => { (items[group] ??= {})[name] = { ...measure(text), note }; return text; };

// ---------- Lanes: always-loaded (what Claude Code lists every session: names + descriptions only) ----------
const listing = [];
for (const s of readdirSync(join(PLUGIN, "skills"))) { const { fm } = frontmatter(read(join(PLUGIN, "skills", s, "SKILL.md"))); listing.push(`- lanes:${fm.name}: ${fm.description}`); }
for (const a of readdirSync(join(PLUGIN, "agents"))) { const { fm } = frontmatter(read(join(PLUGIN, "agents", a))); listing.push(`- lanes:${fm.name}: ${fm.description}`); }
for (const c of readdirSync(join(PLUGIN, "commands"))) { const { fm } = frontmatter(read(join(PLUGIN, "commands", c))); listing.push(`- /lanes:${c.replace(/\.md$/, "")}${fm["argument-hint"] ? " " + fm["argument-hint"] : ""}: ${fm.description}`); }
put("lanes_always", "skill+agent+command listing", listing.join("\n"), "frontmatter name/description lines for 3 skills, 1 agent, 5 commands");

// ---------- Lanes: on demand (loaded only when a skill/agent/command is invoked) ----------
for (const s of readdirSync(join(PLUGIN, "skills"))) put("lanes_on_demand", `skill ${s}`, read(join(PLUGIN, "skills", s, "SKILL.md")));
for (const a of readdirSync(join(PLUGIN, "agents"))) put("lanes_on_demand", `agent ${a.replace(/\.md$/, "")}`, read(join(PLUGIN, "agents", a)));
for (const c of readdirSync(join(PLUGIN, "commands"))) put("lanes_on_demand", `command /lanes:${c.replace(/\.md$/, "")}`, read(join(PLUGIN, "commands", c)));

// ---------- Lanes: hook output + CLI feedback on the example (planted bug present) ----------
const ex = exampleRepo("tokens");
const env = { env: { LANES_CLI: "npx lanes" } };
lanes(ex, ["join", "brain"], env);
const hook = (name, payload) => lanes(ex, ["hook", name], { ...env, input: JSON.stringify({ cwd: ex, ...payload }) });
const ss = hook("session-start", { hook_event_name: "SessionStart", source: "startup" });
put("lanes_session", "SessionStart hook (bound lane, 1 red edge)", ss.stdout, "once per session");
const pr = hook("prompt", { hook_event_name: "UserPromptSubmit", prompt: "continue" });
put("lanes_session", "UserPromptSubmit inbox (empty)", pr.stdout, "per prompt; empty when no new messages");
const block = hook("guard", { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: join(ex, "apps/world/src/apply.ts") } });
if (block.code !== 2) throw new Error("guard did not block: " + block.code + block.stderr);
put("lanes_feedback", "guard block message", block.stderr || block.stdout, "per blocked cross-lane edit (exit 2)");
const human = lanes(ex, ["check", "--seed", "1"], env);
put("lanes_feedback", "lanes check (human, planted bug)", human.stdout);
const humanLane = lanes(ex, ["check", "--lane", "brain", "--seed", "1"], env);
put("lanes_feedback", "lanes check --lane brain (human, planted bug)", humanLane.stdout);
const json = lanes(ex, ["check", "--json", "--seed", "1"], env);
put("lanes_feedback", "lanes check --json (planted bug)", json.stdout);
const watchLine = JSON.stringify({ v: 1, lane: "brain", items: [{ issue: 2, type: "blocker", contract: "TickResponse", reason: "new", autopilot: true }], next: "npx lanes watch --lane brain" });
put("lanes_feedback", "lanes watch wake (WatchResult line)", watchLine, "per actionable event");
const agentsMd = (() => {
  const d = tmp("init");
  git(d, "init", "-q", "-b", "main");
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "x", private: true, type: "module" }));
  lanes(d, ["init", "--yes", "--lanes", "world,brain,crowd"], env);
  return existsSync(join(d, "AGENTS.md")) ? read(join(d, "AGENTS.md")) : "";
})();
put("lanes_optional", "AGENTS.md section written by lanes init", agentsMd, "for non-Claude agents; Claude Code loads CLAUDE.md, not AGENTS.md, unless imported");

// ---------- Same failure, each approach's feedback: the kind-typo mutant (all approaches catch it) ----------
const typo = MUTANTS.find((m) => m.id === "kind-typo");
const fix = (d) => replaceIn(join(d, "apps/brain/src/tick.ts"), "holdMs: 1800 };", "holdMs: 1200 };");
const exTypo = exampleRepo("tokens-typo", (d) => { fix(d); typo.edit(d); });
put("same_failure", "lanes check (human)", lanes(exTypo, ["check", "--seed", "1"], env).stdout);
put("same_failure", "lanes check --json", lanes(exTypo, ["check", "--json", "--seed", "1"], env).stdout);
{
  writeFileSync(join(exTypo, "apps/brain/src/tick.zod.test.ts"), read(join(BENCH, "alternatives/zod-vitest/tick.zod.test.ts")));
  const v = sh(process.execPath, [join(REPO, "node_modules/vitest/vitest.mjs"), "run"], exTypo, { env: { NO_COLOR: "1", FORCE_COLOR: "0" } });
  put("same_failure", "vitest run (consumer + hand-written zod tests)", stripAnsi(v.stdout + v.stderr));
  writeFileSync(join(exTypo, "tsconfig.bench.json"), read(join(BENCH, "alternatives/tsc/tsconfig.json")));
  const t = sh(process.execPath, [join(REPO, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.bench.json"], exTypo);
  put("same_failure", "tsc --noEmit --strict", t.stdout + t.stderr);
}
const pt = await pact(pactDir((d) => { fix(d); typo.edit(d); }));
put("same_failure", "Pact provider verification (vitest)", stripAnsi(pt.output ?? ""), `caught at ${pt.stage}`);

// ---------- Alternatives: guidance an agent must load / code it must author ----------
put("prompt_only", "CLAUDE.md rules + lane/contract map (always loaded, not enforced)", read(join(BENCH, "alternatives/prompt-only/CLAUDE.md")));
const pactNm = readFileSync(join(WORK, "lanes-bench-pact-install-dir"), "utf8").trim();
put("pact", "Pact JS README.md (npm tarball, read once to learn the API)", read(join(pactNm, "node_modules/@pact-foundation/pact/README.md")), "on demand, once");
put("pact", "consumer test (world → brain), authored", read(join(BENCH, "alternatives/pact/world-brain.consumer.pact.test.ts")));
put("pact", "provider verification (brain), authored", read(join(BENCH, "alternatives/pact/brain.provider.pact.test.ts")));
put("zod_vitest", "hand-written zod handler test, authored", read(join(BENCH, "alternatives/zod-vitest/tick.zod.test.ts")));

// ---------- Idle polling model ----------
// /loop-style polling: each wake is a model turn that re-reads the whole context C, plus the poll itself (p).
// Lanes: `lanes watch` is a background script (no model turns while idle); each actionable event wakes the agent once:
// context C + the WatchResult line + restarting the watcher (w).
const pollPrompt = "Check GitHub for new issues for lane brain and handle any blocker or request: run gh issue list --label lane:brain --state open --json number,title,labels,body";
const pollCall = 'gh issue list --label "lane:brain" --state open --json number,title,labels,body';
const pollResult = "[]";
const pollReply = "No new messages for lane brain. I'll check again on the next loop.";
const p = measure([pollPrompt, pollCall, pollResult, pollReply].join("\n")).tokens;
const restart = "npx lanes watch --lane brain";
const notification = `Background command "npx lanes watch --lane brain" completed (exit code 0)\n${watchLine}`;
const w = measure([notification, restart].join("\n")).tokens;
const contexts = [20_000, 50_000];
const intervals = [1, 2, 5, 10, 15, 20, 30, 60];
const events = [0, 1, 4];
const poll = Object.fromEntries(contexts.map((C) => [C, intervals.map((N) => ({ interval_min: N, tokens_per_hour: Math.round((60 / N) * (C + p)), incremental_per_hour: Math.round((60 / N) * p) }))]));
const watch = Object.fromEntries(contexts.map((C) => [C, events.map((E) => ({ events_per_hour: E, tokens_per_hour: E * (C + w), incremental_per_hour: E * w }))]));

// ---------- Totals per approach (per session, before any failure) ----------
const sum = (g) => Object.values(items[g] ?? {}).reduce((a, x) => a + x.tokens, 0);
const totals = {
  lanes_always_loaded: sum("lanes_always"),
  lanes_session_start: items.lanes_session["SessionStart hook (bound lane, 1 red edge)"].tokens,
  lanes_on_demand_all: sum("lanes_on_demand"),
  prompt_only_always_loaded: sum("prompt_only"),
  pact_authored: items.pact["consumer test (world → brain), authored"].tokens + items.pact["provider verification (brain), authored"].tokens,
  pact_readme: items.pact["Pact JS README.md (npm tarball, read once to learn the API)"].tokens,
};

saveResult("tokens", {
  tokenizer: TOKENIZER,
  items, totals,
  idle_model: {
    formula_poll: "tokens/hour = (60 / N_min) × (C + p)", formula_watch: "tokens/hour = E × (C + w)  (E = actionable events/hour; 0 when idle)",
    p_poll_turn_tokens: p, w_wake_tokens: w, contexts, poll, watch,
    note: "C is re-read on every model turn (prompt caching lowers its price, not its count). Incremental = tokens beyond the re-read context.",
  },
});
console.log(JSON.stringify(totals, null, 1));
for (const [g, xs] of Object.entries(items)) for (const [k, v] of Object.entries(xs)) console.log(g.padEnd(16), String(v.tokens).padStart(6), String(v.tokens_cl100k).padStart(6), k);
console.log("p", p, "w", w);
