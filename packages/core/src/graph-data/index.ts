import type { CheckReport } from "../contracts/CheckReport.ts";
import type { GraphData } from "../contracts/GraphData.ts";
import type { IssueMeta } from "../contracts/IssueMeta.ts";

export interface CachedIssue { number: number; title: string; labels: string[]; meta?: IssueMeta; state: string; createdAt?: string; updatedAt?: string }
export interface IssuesCache { v: 1; fetchedAt: number; repo?: string; issues: CachedIssue[] }

const has = (i: CachedIssue, l: string) => i.labels.includes(l);

/** CheckReport (+ optional lane owners and issue cache) -> GraphData (C6). */
export function graphFromReport(report: CheckReport, ctx: { owners?: Record<string, string>; issues?: CachedIssue[]; repo?: string; now?: number } = {}): GraphData {
  const issues = (ctx.issues ?? []).filter((i) => i.state === "open");
  const lanes = new Set<string>(Object.keys(ctx.owners ?? {}));
  for (const e of report.edges) { lanes.add(e.producer); lanes.add(e.consumer); }
  const to = (i: CachedIssue, l: string) => has(i, `lane:${l}`) || i.meta?.to === l;
  return {
    v: 1,
    generatedAt: ctx.now ?? Date.now(),
    fromReport: report.startedAt,
    ...(ctx.repo ? { repo: ctx.repo } : {}),
    nodes: [...lanes].sort().map((lane) => ({
      lane,
      owner: ctx.owners?.[lane] ?? "",
      openBlockers: issues.filter((i) => to(i, lane) && has(i, "lanes:blocker")).length,
      openRequests: issues.filter((i) => to(i, lane) && has(i, "lanes:request")).length,
      claimedFixes: issues.filter((i) => to(i, lane) && has(i, "claimed")).map((i) => i.number),
    })),
    edges: report.edges.map((e) => {
      const f = e.failures[0];
      return {
        contract: e.contract, producer: e.producer, consumer: e.consumer, status: e.status, version: e.version,
        fixtures: e.fixtures, consumerTests: e.consumerTests, pendingIssues: e.pendingIssues,
        ...(f ? { topFailure: { message: f.message, owner: f.owner, ...(f.seed !== undefined ? { seed: f.seed } : {}), ...(f.repro ? { repro: f.repro } : {}) } } : {}),
      };
    }),
    needsOwner: issues.filter((i) => has(i, "needs-owner")).map((i) => ({
      issue: i.number, title: i.title, to: (i.meta?.to ?? i.labels.find((l) => l.startsWith("lane:"))?.slice(5) ?? "approvers") as GraphData["needsOwner"][number]["to"],
    })),
  };
}
