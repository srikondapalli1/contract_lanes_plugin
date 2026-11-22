// Minimal semver range check: "^1.2.3", "~1.2.3", ">=1.2.3", "1.2.3", "*", "1.x".
const parse = (v: string) => v.replace(/^v/, "").split(/[.+-]/).slice(0, 3).map((n) => (n === "x" || n === "*" ? NaN : Number(n)));
const cmp = (a: number[], b: number[]) => {
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  return 0;
};

export function satisfies(version: string, range: string): boolean {
  return range.split("||").some((part) => part.trim().split(/\s+/).every((r) => one(version, r)));
}

function one(version: string, r: string): boolean {
  const v = parse(version);
  if (r === "*" || r === "" || r === "latest") return true;
  const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(r);
  if (!m) return false;
  const [, op = "", raw] = m;
  const t = parse(raw);
  if (t.some(Number.isNaN)) return t.every((n, i) => Number.isNaN(n) || n === v[i]);
  const c = cmp(v, t);
  switch (op) {
    case "^": return c >= 0 && (t[0] > 0 ? v[0] === t[0] : t[1] > 0 ? v[0] === 0 && v[1] === t[1] : cmp(v, t) === 0);
    case "~": return c >= 0 && v[0] === t[0] && v[1] === t[1];
    case ">=": return c >= 0;
    case "<=": return c <= 0;
    case ">": return c > 0;
    case "<": return c < 0;
    default: return c === 0;
  }
}
