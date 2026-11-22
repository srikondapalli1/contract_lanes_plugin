// zod (v4) schema -> fast-check arbitrary, plus mutation generators for valid fixtures.
// Reads zod's public-ish `_zod.def` structurally, so it works with the project's own zod copy.
import fc from "fast-check";

type Z = any;
export interface GenCtx { warnings: string[] }
export class GenError extends Error {}

const def = (s: Z) => s?._zod?.def;
const checksOf = (s: Z): any[] => {
  const d = def(s);
  const cs = (d?.checks ?? []).map((c: Z) => c?._zod?.def ?? c);
  return d?.check ? [d, ...cs] : cs;
};
const label = (p: string) => p || "(root)";
/** Optional on input: .optional(), .default(), .prefault() all set _zod.optin. */
export const optionalIn = (s: Z) => !!s?._zod?.optin;
const INT_BOUNDS: Record<string, [number, number]> = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], int32: [-(2 ** 31), 2 ** 31 - 1], uint32: [0, 2 ** 32 - 1],
};

/** Filter with an attempt budget, so an impossible constraint errors instead of hanging. */
function bounded<T>(arb: fc.Arbitrary<T>, pred: (v: T) => boolean, path: string): fc.Arbitrary<T> {
  let misses = 0;
  return arb.filter((v) => {
    if (pred(v)) { misses = 0; return true; }
    if (++misses > 2000) throw new GenError(`could not generate a value for ${label(path)} that satisfies its constraints`);
    return false;
  });
}

export function arbitraryFor(s: Z, path: string, ctx: GenCtx): fc.Arbitrary<unknown> | null {
  const d = def(s);
  const unsupported = (what: string) => { ctx.warnings.push(`generation: ${label(path)}: unsupported zod type "${what}", skipped`); return null; };
  if (!d) return unsupported("not a zod schema");
  switch (d.type) {
    case "string": return stringArb(s, path, ctx);
    case "number": return numberArb(s, path, ctx);
    case "boolean": return fc.boolean();
    case "null": return fc.constant(null);
    case "undefined": return fc.constant(undefined);
    case "unknown": case "any": return fc.jsonValue();
    case "enum": return fc.constantFrom(...Object.values(d.entries));
    case "literal": return fc.constantFrom(...d.values);
    case "optional": { const a = arbitraryFor(d.innerType, path, ctx); return a && fc.option(a, { nil: undefined }); }
    case "nullable": { const a = arbitraryFor(d.innerType, path, ctx); return a && fc.option(a, { nil: null }); }
    case "default": case "prefault": case "readonly": case "catch": case "nonoptional": return arbitraryFor(d.innerType, path, ctx);
    case "pipe": return arbitraryFor(d.in, path, ctx);
    case "array": {
      const el = arbitraryFor(d.element, `${path}[]`, ctx);
      if (!el) return null;
      let min = 0, max: number | undefined;
      for (const c of checksOf(s)) {
        if (c.check === "min_length") min = Math.max(min, c.minimum);
        else if (c.check === "max_length") max = Math.min(max ?? Infinity, c.maximum);
        else if (c.check === "length_equals") min = max = c.length;
      }
      return fc.array(el, { minLength: min, maxLength: max ?? Math.max(min, 5) });
    }
    case "tuple": {
      const items = d.items.map((x: Z, i: number) => arbitraryFor(x, `${path}[${i}]`, ctx));
      return items.every(Boolean) ? fc.tuple(...items) : null;
    }
    case "object": {
      const model: Record<string, fc.Arbitrary<unknown>> = {};
      const required: string[] = [];
      for (const [k, f] of Object.entries<Z>(d.shape)) {
        const optional = optionalIn(f);
        const inner = def(f)?.type === "optional" ? def(f).innerType : f;
        const a = arbitraryFor(inner, path ? `${path}.${k}` : k, ctx);
        if (!a) { if (optional) continue; return null; }
        model[k] = a;
        if (!optional) required.push(k);
      }
      return fc.record(model, { requiredKeys: required });
    }
    case "union": {
      const opts = d.options.map((o: Z) => arbitraryFor(o, path, ctx));
      return opts.every(Boolean) ? fc.oneof(...opts) : null;
    }
    case "record": {
      const v = arbitraryFor(d.valueType, `${path}{}`, ctx);
      const kd = def(d.keyType);
      if (!v) return null;
      if (kd?.type === "enum") return fc.record(Object.fromEntries(Object.values(kd.entries).map((k: any) => [k, v])));
      const k = arbitraryFor(d.keyType, `${path}{key}`, ctx);
      return k && fc.dictionary(k as fc.Arbitrary<string>, v, { maxKeys: 4 });
    }
    default: return unsupported(d.type);
  }
}

function stringArb(s: Z, path: string, ctx: GenCtx): fc.Arbitrary<unknown> {
  let min = 0, max: number | undefined, pattern: RegExp | undefined, url = false, exact = false;
  for (const c of checksOf(s)) {
    if (c.check === "min_length") min = Math.max(min, c.minimum);
    else if (c.check === "max_length") max = Math.min(max ?? Infinity, c.maximum);
    else if (c.check === "length_equals") min = max = c.length;
    else if (c.check === "string_format") {
      if (c.format === "url") url = true;
      else if (c.pattern instanceof RegExp && !pattern) pattern = c.pattern;
      else exact = true;
    } else if (c.check !== "overwrite") exact = true;
  }
  let base: fc.Arbitrary<string>;
  if (url) base = fc.webUrl();
  else if (pattern) {
    try { base = fc.stringMatching(pattern); } catch {
      ctx.warnings.push(`generation: ${label(path)}: regex ${pattern} can't be generated directly; using it as a filter`);
      base = fc.string({ maxLength: 64 });
    }
  } else base = fc.string({ minLength: min, maxLength: max ?? Math.max(min + 8, 16) });
  const needsFilter = exact || url || !!pattern;
  if (exact && !pattern) ctx.warnings.push(`generation: ${label(path)}: custom string check used as a filter`);
  return needsFilter ? bounded(base, (v) => s.safeParse(v).success, path) : base;
}

function numberArb(s: Z, path: string, ctx: GenCtx): fc.Arbitrary<unknown> {
  let lo = -Infinity, hi = Infinity, loEx = false, hiEx = false, int = false, step: number | undefined, other = false;
  for (const c of checksOf(s)) {
    if (c.check === "greater_than" && (c.value > lo || (c.value === lo && !c.inclusive))) { lo = c.value; loEx = !c.inclusive; }
    else if (c.check === "less_than" && (c.value < hi || (c.value === hi && !c.inclusive))) { hi = c.value; hiEx = !c.inclusive; }
    else if (c.check === "number_format") {
      const b = INT_BOUNDS[c.format];
      if (b) { int = true; lo = Math.max(lo, b[0]); hi = Math.min(hi, b[1]); }
    } else if (c.check === "multiple_of") step = c.value;
    else other = true;
  }
  let arb: fc.Arbitrary<number>;
  if (int) {
    let a = loEx ? Math.floor(lo) + 1 : Math.ceil(lo);
    let b = hiEx ? Math.ceil(hi) - 1 : Math.floor(hi);
    let k = 1;
    if (step && Number.isInteger(step)) { k = step; a = Math.ceil(a / k); b = Math.floor(b / k); step = undefined; }
    if (a > b) throw new GenError(`${label(path)}: no integer satisfies its bounds`);
    const small = a >= -(2 ** 31) && b <= 2 ** 31 - 1;
    arb = (small ? fc.integer({ min: a, max: b }) : fc.bigInt({ min: BigInt(a), max: BigInt(b) }).map(Number)).map((x) => x * k);
  } else {
    arb = fc.double({
      noNaN: true, noDefaultInfinity: true,
      ...(Number.isFinite(lo) ? { min: lo, minExcluded: loEx } : {}),
      ...(Number.isFinite(hi) ? { max: hi, maxExcluded: hiEx } : {}),
    });
  }
  if (step || other) {
    if (other) ctx.warnings.push(`generation: ${label(path)}: custom number check used as a filter`);
    return bounded(arb, (v) => s.safeParse(v).success, path);
  }
  return arb;
}

// ---- mutations: each must FAIL to parse ----

export interface Mutation { path: (string | number)[]; kind: "drop" | "type" | "range"; value?: unknown }
const unwrap = (s: Z): Z => {
  let d = def(s);
  while (d && ["optional", "nullable", "default", "prefault", "readonly", "nonoptional"].includes(d.type)) { s = d.innerType; d = def(s); }
  return s;
};

function wrongType(s: Z): unknown | typeof SKIP {
  const d = def(unwrap(s));
  if (!d || d.coerce) return SKIP;
  switch (d.type) {
    case "string": return 12345;
    case "number": return "not-a-number";
    case "boolean": return "not-a-boolean";
    case "array": return "not-an-array";
    case "object": case "record": return "not-an-object";
    case "enum": case "literal": {
      const vals = d.type === "enum" ? Object.values(d.entries) : d.values;
      return vals.every((v: unknown) => typeof v === "string") ? 12345 : vals.every((v: unknown) => typeof v === "number") ? "x" : SKIP;
    }
    default: return SKIP;
  }
}
const SKIP = Symbol("skip");

function outOfRange(s: Z, value: unknown): unknown[] {
  const d = def(unwrap(s));
  if (!d) return [];
  const out: unknown[] = [];
  const cs = checksOf(unwrap(s));
  if (d.type === "number") for (const c of cs) {
    if (c.check === "less_than") out.push(c.inclusive ? c.value + 1 : c.value);
    if (c.check === "greater_than") out.push(c.inclusive ? c.value - 1 : c.value);
    if (c.check === "number_format" && INT_BOUNDS[c.format] && typeof value === "number") out.push(value + 0.5);
  }
  if (d.type === "string") for (const c of cs) {
    if (c.check === "max_length") out.push("x".repeat(c.maximum + 1));
    if (c.check === "min_length" && c.minimum > 0) out.push("x".repeat(c.minimum - 1));
  }
  if (d.type === "array" && Array.isArray(value)) for (const c of cs) {
    if (c.check === "max_length" && value.length) out.push(Array(c.maximum + 1).fill(value[0]));
    if (c.check === "min_length" && c.minimum > 0) out.push(value.slice(0, c.minimum - 1));
  }
  if (d.type === "enum") out.push("__lanes_not_in_enum__");
  if (d.type === "literal" && d.values.every((v: unknown) => typeof v === "string")) out.push("__lanes_not_this_literal__");
  return out;
}

export function mutationsOf(schema: Z, value: unknown, limit = 60): Mutation[] {
  const out: Mutation[] = [{ path: [], kind: "type", value: 42 }];
  const walk = (s: Z, v: unknown, p: (string | number)[]) => {
    if (out.length >= limit) return;
    const u = unwrap(s);
    const d = def(u);
    if (d?.type === "object" && v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, f] of Object.entries<Z>(d.shape)) {
        if (!(k in (v as object))) continue;
        const fv = (v as any)[k];
        const fp = [...p, k];
        if (!optionalIn(f)) out.push({ path: fp, kind: "drop" });
        const w = wrongType(f);
        if (w !== SKIP && fv !== null) out.push({ path: fp, kind: "type", value: w });
        for (const r of outOfRange(f, fv)) out.push({ path: fp, kind: "range", value: r });
        walk(f, fv, fp);
      }
    } else if (d?.type === "array" && Array.isArray(v) && v.length) {
      const fp = [...p, 0];
      const w = wrongType(d.element);
      if (w !== SKIP) out.push({ path: fp, kind: "type", value: w });
      for (const r of outOfRange(d.element, v[0])) out.push({ path: fp, kind: "range", value: r });
      walk(d.element, v[0], fp);
    }
  };
  walk(schema, value, []);
  return out.slice(0, limit);
}

export function applyMutation(value: unknown, m: Mutation): unknown {
  if (!m.path.length) return m.value;
  const copy = structuredClone(value) as any;
  let node = copy;
  for (const seg of m.path.slice(0, -1)) node = node[seg];
  const last = m.path[m.path.length - 1];
  if (m.kind === "drop") delete node[last]; else node[last] = m.value;
  return copy;
}

export const pathString = (p: (string | number)[]) =>
  p.reduce<string>((acc, s) => (typeof s === "number" ? `${acc}[${s}]` : acc ? `${acc}.${s}` : s), "") || "(root)";
