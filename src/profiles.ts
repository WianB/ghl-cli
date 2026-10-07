// Profiles: one named entry per GHL token.
//
// Metadata (label, locationId, kind) lives in a JSON file. The token itself
// lives in the OS secret store: macOS Keychain, libsecret on Linux, or an
// owner-only file as a last resort. Nothing secret goes in profiles.json.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type ProfileKind = 'location' | 'agency';

export interface Profile {
  label?: string;
  kind: ProfileKind;
  locationId?: string;
  companyId?: string;
  addedAt?: string;
}

export interface ProfileFile {
  default?: string;
  profiles: Record<string, Profile>;
}

export interface TokenStore {
  get(name: string): string | undefined;
  set(name: string, token: string): void;
  remove(name: string): void;
}

export const KEYCHAIN_SERVICE = 'ghl-cli';

function run(cmd: string, args: string[], input?: string): string | undefined {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function hasCommand(cmd: string): boolean {
  return run('sh', ['-c', `command -v ${cmd}`]) !== undefined;
}

// macOS: the login Keychain.
export const keychain: TokenStore = {
  get: (name) => run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', name, '-w']) || undefined,
  set(name, token) {
    // -U updates the item if it already exists.
    execFileSync('security', ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', name, '-l', `GHL CLI: ${name}`, '-w', token], {
      stdio: 'ignore',
    });
  },
  remove: (name) => void run('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', name]),
};

// Linux desktop: libsecret (GNOME Keyring / KWallet) through secret-tool.
// The token goes in on stdin, so it never appears in the process list.
export const libsecret: TokenStore = {
  get: (name) => run('secret-tool', ['lookup', 'service', KEYCHAIN_SERVICE, 'profile', name]) || undefined,
  set(name, token) {
    execFileSync('secret-tool', ['store', '--label', `GHL CLI: ${name}`, 'service', KEYCHAIN_SERVICE, 'profile', name], {
      input: token,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  },
  remove: (name) => void run('secret-tool', ['clear', 'service', KEYCHAIN_SERVICE, 'profile', name]),
};

// Everywhere else (servers, Windows, CI): a JSON file only the owner can read.
export function fileStore(path: string): TokenStore {
  const read = (): Record<string, string> => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
  const write = (d: Record<string, string>) => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(d, null, 2) + '\n', { mode: 0o600 });
    chmodSync(path, 0o600);
  };
  return {
    get: (name) => read()[name],
    set(name, token) {
      const d = read();
      d[name] = token;
      write(d);
    },
    remove(name) {
      const d = read();
      delete d[name];
      write(d);
    },
  };
}

export function tokensPath(): string {
  return join(dirname(configPath()), 'tokens.json');
}

// Pick the safest store this machine has. GHL_CLI_TOKEN_STORE=keychain|libsecret|file overrides.
export function defaultStore(): { store: TokenStore; kind: string } {
  const want = process.env.GHL_CLI_TOKEN_STORE;
  if (want === 'keychain' || (!want && process.platform === 'darwin')) return { store: keychain, kind: 'macOS Keychain' };
  if (want === 'libsecret' || (!want && process.platform === 'linux' && hasCommand('secret-tool'))) return { store: libsecret, kind: 'libsecret' };
  return { store: fileStore(tokensPath()), kind: `file ${tokensPath()} (owner-only)` };
}

export function configPath(): string {
  return process.env.GHL_CLI_CONFIG ?? join(homedir(), '.config', 'ghl-cli', 'profiles.json');
}

export function loadProfiles(path = configPath()): ProfileFile {
  if (!existsSync(path)) return { profiles: {} };
  const data = JSON.parse(readFileSync(path, 'utf8')) as ProfileFile;
  data.profiles ??= {};
  return data;
}

export function saveProfiles(data: ProfileFile, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export interface Resolved {
  name: string;
  profile: Profile;
  token: string;
}

// Which profile a command runs as:
//   1. --profile <name>
//   2. GHL_PROFILE env var
//   3. GHL_TOKEN env var (ad-hoc, unnamed; GHL_LOCATION_ID sets its location)
//   4. the default profile in profiles.json
export function resolveProfile(
  requested: string | undefined,
  data: ProfileFile,
  store: TokenStore,
  env: NodeJS.ProcessEnv = process.env,
): Resolved {
  const name = requested ?? env.GHL_PROFILE;
  if (!name && env.GHL_TOKEN) {
    return {
      name: 'env',
      profile: { kind: env.GHL_COMPANY_ID && !env.GHL_LOCATION_ID ? 'agency' : 'location', locationId: env.GHL_LOCATION_ID, companyId: env.GHL_COMPANY_ID },
      token: env.GHL_TOKEN,
    };
  }
  const pick = name ?? data.default;
  if (!pick) {
    throw new ProfileError('No profile selected and no default set. Add one with: ghl auth add <name> --location <id>');
  }
  const profile = data.profiles[pick];
  if (!profile) {
    const known = Object.keys(data.profiles);
    throw new ProfileError(`Unknown profile "${pick}". Known: ${known.length ? known.join(', ') : '(none)'}`);
  }
  const token = store.get(pick);
  if (!token) throw new ProfileError(`Profile "${pick}" has no saved token. Re-add it with: ghl auth add ${pick} ...`);
  return { name: pick, profile, token };
}

export class ProfileError extends Error {}
