export interface Args { _: string[]; [flag: string]: string | boolean | string[] | undefined }

const BOOL = new Set(["json", "fast", "ci", "file-blockers", "labels", "submit", "cleanup", "once", "yes", "no-serve", "push", "help", "version", "staged", "install", "force"]);

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { out._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) out[key] = a.slice(eq + 1);
      else if (BOOL.has(key) || argv[i + 1] === undefined || argv[i + 1].startsWith("--")) out[key] = true;
      else out[key] = argv[++i];
    } else if (a === "-h") out.help = true;
    else out._.push(a);
  }
  return out;
}

export const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
export const num = (v: unknown): number | undefined => (typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
