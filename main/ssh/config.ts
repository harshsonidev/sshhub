import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { backupsDir } from '../store';
import { ConfigBackup, Profile, SshConfigHost, SshConfigSnapshot } from '../../shared/types';

export function sshConfigPath(): string {
  return path.join(os.homedir(), '.ssh', 'config');
}

const MANAGED_MARK = '# sshhub:profile=';

interface ParsedConfig {
  preamble: string[];
  blocks: { alias: string; managedByProfileId: string | null; lines: string[] }[];
}

// Line-preserving parser: every line of the file ends up either in the
// preamble or in exactly one host block, so unmanaged content survives
// round-trips untouched. A `# sshhub:profile=<id>` comment directly above
// a Host line marks a block SSHHub owns.
function parse(raw: string): ParsedConfig {
  const lines = raw.split(/\r?\n/);
  const preamble: string[] = [];
  const blocks: ParsedConfig['blocks'] = [];
  let current: ParsedConfig['blocks'][number] | null = null;
  let pendingMark: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(MANAGED_MARK)) {
      pendingMark = trimmed.slice(MANAGED_MARK.length).trim();
      continue; // re-emitted with its block on serialize
    }
    const hostMatch = trimmed.match(/^Host\s+(.+)$/i);
    if (hostMatch) {
      current = {
        alias: hostMatch[1].trim().split(/\s+/)[0],
        managedByProfileId: pendingMark,
        lines: [line],
      };
      pendingMark = null;
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      if (pendingMark) {
        // Orphan marker not followed by a Host line: keep it as plain text.
        preamble.push(MANAGED_MARK + pendingMark);
        pendingMark = null;
      }
      preamble.push(line);
    }
  }
  return { preamble, blocks };
}

function serialize(cfg: ParsedConfig): string {
  const out: string[] = [...cfg.preamble];
  for (const b of cfg.blocks) {
    if (b.managedByProfileId) out.push(MANAGED_MARK + b.managedByProfileId);
    out.push(...b.lines);
  }
  // Collapse a fully empty tail but keep a single trailing newline.
  let text = out.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  if (!text.endsWith('\n')) text += '\n';
  return text;
}

function param(lines: string[], name: string): string | null {
  const re = new RegExp(`^\\s*${name}\\s+(.+)$`, 'i');
  for (const line of lines) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

export function readConfig(): SshConfigSnapshot {
  const file = sshConfigPath();
  let raw = '';
  let exists = false;
  try {
    raw = fs.readFileSync(file, 'utf8');
    exists = true;
  } catch {
    /* missing file is fine */
  }
  const parsed = parse(raw);
  const hosts: SshConfigHost[] = parsed.blocks.map((b) => {
    const portStr = param(b.lines, 'Port');
    return {
      alias: b.alias,
      hostName: param(b.lines, 'HostName'),
      user: param(b.lines, 'User'),
      identityFile: param(b.lines, 'IdentityFile'),
      port: portStr ? parseInt(portStr, 10) : null,
      managedByProfileId: b.managedByProfileId,
      rawLines: b.lines,
    };
  });
  return { path: file, exists, hosts, raw };
}

export function backupConfig(): ConfigBackup | null {
  const file = sshConfigPath();
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `config-${stamp}.bak`;
  const dest = path.join(backupsDir(), fileName);
  fs.copyFileSync(file, dest);
  const st = fs.statSync(dest);
  return { fileName, createdAt: st.mtime.toISOString(), sizeBytes: st.size };
}

export function listBackups(): ConfigBackup[] {
  const dir = backupsDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.bak'))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { fileName: f, createdAt: st.mtime.toISOString(), sizeBytes: st.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreBackup(fileName: string): void {
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error('Invalid backup file name.');
  }
  const src = path.join(backupsDir(), fileName);
  if (!fs.existsSync(src)) throw new Error(`Backup not found: ${fileName}`);
  backupConfig(); // snapshot current state before overwriting it
  writeConfigFile(fs.readFileSync(src, 'utf8'));
}

function writeConfigFile(text: string): void {
  const file = sshConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
}

function profileBlockLines(p: Profile): string[] {
  const lines = [`Host ${p.alias}`, `    HostName ${p.hostName}`];
  if (p.user) lines.push(`    User ${p.user}`);
  lines.push(`    IdentityFile ${toTildePath(p.identityFile)}`);
  lines.push('    IdentitiesOnly yes');
  if (p.port && p.port !== 22) lines.push(`    Port ${p.port}`);
  lines.push('');
  return lines;
}

function toTildePath(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

export function upsertProfileHost(profile: Profile): void {
  backupConfig();
  const parsed = parse(readConfig().raw);
  const idx = parsed.blocks.findIndex(
    (b) => b.managedByProfileId === profile.id || b.alias === profile.alias
  );
  const block = {
    alias: profile.alias,
    managedByProfileId: profile.id,
    lines: profileBlockLines(profile),
  };
  if (idx >= 0) parsed.blocks[idx] = block;
  else parsed.blocks.push(block);
  writeConfigFile(serialize(parsed));
}

// Only removes the block SSHHub owns; an unmanaged block that happens to
// share the alias is left alone.
export function removeProfileHost(profileId: string): void {
  backupConfig();
  const parsed = parse(readConfig().raw);
  parsed.blocks = parsed.blocks.filter((b) => b.managedByProfileId !== profileId);
  writeConfigFile(serialize(parsed));
}
