import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { StoreShape, Profile, Settings } from '../shared/types';

// All app data lives in a single JSON file under the per-user app data dir:
// macOS: ~/Library/Application Support/SSHHub, Windows: %APPDATA%/SSHHub.
const DEFAULTS: StoreShape = {
  profiles: [],
  settings: {
    repoScanRoot: null,
    awsKeyMappings: {},
    loadKeysAtStartup: [],
  },
};

function storeFile(): string {
  return path.join(app.getPath('userData'), 'sshhub.json');
}

export function backupsDir(): string {
  const dir = path.join(app.getPath('userData'), 'config-backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readStore(): StoreShape {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function writeStore(store: StoreShape): void {
  const file = storeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function getProfiles(): Profile[] {
  return readStore().profiles;
}

export function saveProfile(profile: Profile): Profile[] {
  const store = readStore();
  const idx = store.profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) store.profiles[idx] = profile;
  else store.profiles.push(profile);
  writeStore(store);
  return store.profiles;
}

export function deleteProfile(id: string): Profile[] {
  const store = readStore();
  store.profiles = store.profiles.filter((p) => p.id !== id);
  writeStore(store);
  return store.profiles;
}

export function getSettings(): Settings {
  return readStore().settings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const store = readStore();
  store.settings = { ...store.settings, ...patch };
  writeStore(store);
  return store.settings;
}
