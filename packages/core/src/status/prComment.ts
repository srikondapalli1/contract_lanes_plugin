import type { PrComment } from "../contracts/PrComment.ts";

const WORD = { pass: "✅ pass", fail: "❌ fail", pending: "⏳ pending", untested: "○ untested" } as const;
const QUEUE = { waiting: "⏳ waiting in queue", rebasing: "🔁 rebasing", checking: "🔎 checking", merged: "✅ merged", blocked: "⛔ blocked", failed: "❌ failed", "not-queued": "not queued (add the `queue` label)" } as const;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160);

/** C9: one comment per PR, updated in place. Status always has words, never only a symbol. */
export function renderPrComment(d: PrComment): string {
  const s = d.summary;
  const rows = d.edges.map((e) => `| \`${e.contract}\` | ${e.producer} → ${e.consumer} | ${WORD[e.status]} | ${e.topFailure ? cell(e.topFailure) + (e.repro ? `<br>repro: \`${cell(e.repro)}\`` : "") : ""} |`);
  return [
    "<!-- lanes:pr -->",
    `**Lanes:** ✅ ${s.pass} pass · ❌ ${s.fail} fail · ⏳ ${s.pending} pending · ○ ${s.untested} untested`, "",
    "| Contract | Producer → consumer | Status | Top failure |", "|---|---|---|---|", ...(rows.length ? rows : ["| _none_ | | | |"]), "",
    `**Contract change:** ${d.change.classification === "none" ? "none" : `\`${d.change.classification}\``}`, ...d.change.reasons.map((r) => `- ${r}`), "",
    `**Overrides:** ${d.overrides.length ? "" : "none"}`, ...d.overrides.map((o) => `- \`${o.file}\`: ${o.reason}`), "",
    `**Queue:** ${QUEUE[d.queue.state]}${d.queue.reason ? `: ${d.queue.reason}` : ""}`,
  ].join("\n");
}
