import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getSettings } from '../store';
import { AwsProfile } from '../../shared/types';

// Minimal INI section reader — we only need section names and `region`.
// Credential values are never read or returned.
function readIniSections(file: string): Map<string, Record<string, string>> {
  const sections = new Map<string, Record<string, string>>();
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return sections;
  }
  let current: Record<string, string> | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const sec = trimmed.match(/^\[(.+)\]$/);
    if (sec) {
      current = {};
      sections.set(sec[1].trim(), current);
      continue;
    }
    const kv = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (kv && current) current[kv[1].toLowerCase()] = kv[2];
  }
  return sections;
}

export function listAwsProfiles(): AwsProfile[] {
  const awsDir = path.join(os.homedir(), '.aws');
  const mappings = getSettings().awsKeyMappings;
  const profiles = new Map<string, AwsProfile>();

  const config = readIniSections(path.join(awsDir, 'config'));
  for (const [section, values] of config) {
    const name = section.replace(/^profile\s+/, '');
    profiles.set(name, {
      name,
      region: values['region'] ?? null,
      source: 'config',
      mappedKeyPath: mappings[name] ?? null,
    });
  }

  const creds = readIniSections(path.join(awsDir, 'credentials'));
  for (const [name] of creds) {
    if (!profiles.has(name)) {
      profiles.set(name, {
        name,
        region: null,
        source: 'credentials',
        mappedKeyPath: mappings[name] ?? null,
      });
    }
  }
  return [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name));
}
