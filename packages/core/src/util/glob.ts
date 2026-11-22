// Tiny glob matcher: ** * ? {a,b} [abc]. Paths are repo-relative POSIX.
const cache = new Map<string, RegExp>();

export function globToRegex(glob: string): RegExp {
  const hit = cache.get(glob);
  if (hit) return hit;
  let re = "";
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const atStart = i === 0 || glob[i - 1] === "/";
        if (atStart && glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; continue; }
        re += ".*"; i++; continue;
      }
      re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") { re += "(?:"; depth++; }
    else if (c === "}" && depth) { re += ")"; depth--; }
    else if (c === "," && depth) re += "|";
    else if (c === "[" && glob.indexOf("]", i) > i) {
      const j = glob.indexOf("]", i);
      re += glob.slice(i, j + 1).replace(/^\[!/, "[^");
      i = j;
    } else re += c.replace(/[.+^$()|\\]/g, "\\$&");
  }
  const out = new RegExp("^" + re + "$");
  cache.set(glob, out);
  return out;
}

export const matches = (file: string, globs: string[]) => globs.some((g) => globToRegex(g).test(file));

/** Literal directory prefix of a glob ("apps/world/**" -> "apps/world/"). */
export function staticPrefix(glob: string): string {
  const i = glob.search(/[*?{[]/);
  const lit = i < 0 ? glob : glob.slice(0, i);
  return i < 0 ? lit : lit.slice(0, lit.lastIndexOf("/") + 1);
}

/** Expand braces so prefixes can be compared: "a/{b,c}/**" -> ["a/b/**", "a/c/**"]. */
export function expandBraces(glob: string): string[] {
  const m = /\{([^{}]*)\}/.exec(glob);
  if (!m) return [glob];
  return m[1].split(",").flatMap((alt) => expandBraces(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length)));
}
