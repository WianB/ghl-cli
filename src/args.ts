// Minimal argv parser. No dependencies on purpose.
//
// Every `--name value` / `--name=value` / `-x value` is stored as a list, so
// any option can repeat (`--tag a --tag b`). Names in BOOL_FLAGS never take a
// value. Everything else that is not an option is a positional.

export const BOOL_FLAGS = new Set([
  'help', 'yes', 'dry-run', 'compact', 'all-profiles', 'agency', 'token-stdin',
  'completed', 'plain-text', 'include-users', 'no-verify', 'read', 'version',
]);

const SHORT: Record<string, string> = {
  p: 'profile', l: 'location', q: 'query-param', h: 'help', y: 'yes', d: 'data',
};

export interface Parsed {
  positionals: string[];
  options: Map<string, string[]>;
}

export function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  const push = (k: string, v: string) => {
    const list = options.get(k) ?? [];
    list.push(v);
    options.set(k, list);
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    let name: string | undefined;
    let inline: string | undefined;
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (eq !== -1) inline = a.slice(eq + 1);
    } else if (/^-[a-zA-Z]$/.test(a)) {
      name = SHORT[a[1]];
      if (!name) throw new UsageError(`Unknown short option ${a}`);
    }
    if (name === undefined) {
      positionals.push(a);
      continue;
    }
    if (BOOL_FLAGS.has(name)) {
      push(name, inline ?? 'true');
      continue;
    }
    if (inline !== undefined) {
      push(name, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined) throw new UsageError(`Option --${name} needs a value`);
    push(name, next);
    i++;
  }
  return { positionals, options };
}

export class UsageError extends Error {}

// Typed accessors over the parsed option map.
export class Opts {
  private readonly map: Map<string, string[]>;
  constructor(map: Map<string, string[]>) {
    this.map = map;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }
  str(name: string): string | undefined {
    const v = this.map.get(name);
    return v ? v[v.length - 1] : undefined;
  }
  need(name: string): string {
    const v = this.str(name);
    if (v === undefined || v === '') throw new UsageError(`Missing required option --${name}`);
    return v;
  }
  // Repeats and comma lists both work: `--tag a --tag b,c` -> [a, b, c]
  list(name: string): string[] | undefined {
    const v = this.map.get(name);
    if (!v) return undefined;
    return v.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  }
  bool(name: string): boolean {
    const v = this.str(name);
    return v !== undefined && v !== 'false' && v !== '0';
  }
  num(name: string): number | undefined {
    const v = this.str(name);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) throw new UsageError(`--${name} must be a number, got "${v}"`);
    return n;
  }
  raw(name: string): string[] {
    return this.map.get(name) ?? [];
  }
}
